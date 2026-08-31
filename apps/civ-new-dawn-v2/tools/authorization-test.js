"use strict";

// Dependency-free authorization regression suite. It exercises the same
// Game.tryApplyAction boundary the authoritative host calls, not applyAction's
// offline compatibility path.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appDir = path.resolve(__dirname, "..");
const rulesSource = fs.readFileSync(path.join(appDir, "rules-data.js"), "utf8");
const gameSource = fs.readFileSync(path.join(appDir, "game.js"), "utf8");
const uiSource = fs.readFileSync(path.join(appDir, "ui.js"), "utf8");

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(rulesSource, sandbox, { filename: "rules-data.js" });
vm.runInContext(`${gameSource}\n;this.__Game = Game;`, sandbox, { filename: "game.js" });
const Game = sandbox.__Game;

function actionSet(name) {
  const match = gameSource.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `found ${name}`);
  return Array.from(match[1].matchAll(/"([A-Z0-9_]+)"/g), (entry) => entry[1]);
}

function players() {
  return [
    Game.createPlayer("seat-a", "Alice", "#e63946"),
    Game.createPlayer("seat-b", "Bob", "#457b9d"),
    Game.createPlayer("seat-c", "Cara", "#2a9d8f")
  ];
}

function playingState() {
  const st = Game.createState(players());
  st.phase = "playing";
  st.setup.phase = "done";
  st.turn.order = st.players.map((player) => player.id);
  st.turn.index = 0;
  st.pendingChoices = [];
  st.pendingBarbReward = null;
  st.pendingExploration = null;
  st.movementContinuation = null;
  st.combat = null;
  st.lastCombat = null;
  return st;
}

function reject(st, action, actorId, code) {
  const before = JSON.stringify(st);
  const result = Game.tryApplyAction(st, action, { actorId, role: "player" });
  assert.equal(result.accepted, false, `${action.type} rejected for ${actorId}`);
  assert.equal(result.code, code, `${action.type} reports ${code}`);
  assert.equal(result.state, st, `${action.type} returns the original state`);
  assert.equal(JSON.stringify(st), before, `${action.type} cannot partially mutate on rejection`);
  return result;
}

// Every current-player action is bound to the authenticated connection. A
// forged playerId/actorId/hostOverride in either envelope layer grants nothing.
for (const type of actionSet("CURRENT_PLAYER_ACTIONS")) {
  const st = playingState();
  reject(st, {
    type,
    playerId: "seat-a",
    actorId: "seat-a",
    hostOverride: true,
    payload: {
      playerId: "seat-a", actorId: "seat-a", hostOverride: true,
      unitId: "forged-unit", choiceId: "forged-choice"
    }
  }, "seat-b", "not_your_turn");
}

// Host capability comes only from the trusted transport context and even that
// context must be tied to a seat in this game.
for (const type of actionSet("HOST_ACTIONS")) {
  const st = playingState();
  reject(st, { type, payload: { hostOverride: true, playerId: "seat-a" } }, "seat-b", "host_only");
  const ghost = Game.getActionPermission(st, { type, payload: {} }, { actorId: "not-a-seat", role: "host" });
  assert.equal(ghost.ok, false, `${type} rejects a host role without a game seat`);
  assert.equal(ghost.code, "unknown_actor");
}

// Lobby choices modify the authenticated seat, never the victim named in the
// payload. These are positive tests so an implementation that simply rejects
// every choice cannot pass.
{
  const st = Game.createLobbyState(players().slice(0, 2));
  const result = Game.tryApplyAction(st, {
    type: "SET_READY", payload: { playerId: "seat-a", ready: true, hostOverride: true }
  }, { actorId: "seat-b", role: "player" });
  assert.equal(result.accepted, true);
  assert.equal(Game.getPlayer(result.state, "seat-a").ready, false);
  assert.equal(Game.getPlayer(result.state, "seat-b").ready, true);
}
{
  const st = Game.createLobbyState(players().slice(0, 2));
  const result = Game.tryApplyAction(st, {
    type: "SET_LEADER", payload: { playerId: "seat-a", leaderId: "rome", hostOverride: true }
  }, { actorId: "seat-b", role: "player" });
  assert.equal(result.accepted, true);
  assert.notEqual(Game.getPlayer(result.state, "seat-a").leaderId, "rome");
  assert.equal(Game.getPlayer(result.state, "seat-b").leaderId, "rome");
}

// Setup placement belongs to exactly the active setup seat.
for (const type of actionSet("SETUP_ACTIONS")) {
  const st = Game.createState(players());
  st.setup.order = st.players.map((player) => player.id);
  st.setup.turnIndex = 0;
  reject(st, {
    type, payload: { playerId: "seat-a", hostOverride: true, hexKey: "0,0" }
  }, "seat-b", "not_your_setup_turn");
}

// Cover every pending-choice resolver branch currently implemented, plus an
// unknown future kind. Ownership is checked before any option or hex payload.
const choiceKinds = Array.from(gameSource.matchAll(/choice\.kind === "([a-z_]+)"/g), (entry) => entry[1]);
choiceKinds.push("future_major_decision");
assert.ok(new Set(choiceKinds).size >= 20, "pending-choice branch inventory is comprehensive");
for (const kind of new Set(choiceKinds)) {
  const st = playingState();
  st.pendingChoices = [{
    id: `choice-${kind}`, kind, playerId: "seat-a", title: "Alice decides",
    optional: true, options: [{ id: "yes", label: "Yes" }], hexKeys: ["0,0"]
  }];
  reject(st, {
    type: "RESOLVE_PENDING_CHOICE",
    payload: {
      playerId: "seat-a", actorId: "seat-a", hostOverride: true,
      choiceId: `choice-${kind}`, optionId: "yes", hexKey: "0,0", dismiss: true
    }
  }, "seat-b", "choice_owner_mismatch");
}

// Barbarian rewards are a separate owner-bound decision and are consumed only
// by that owner. A different seat cannot redirect the token to its own card.
{
  const st = playingState();
  st.pendingBarbReward = { playerId: "seat-a" };
  reject(st, {
    type: "ADD_TRADE", payload: { playerId: "seat-a", hostOverride: true, cardType: "science" }
  }, "seat-b", "reward_owner_mismatch");
}

function combatState(overrides) {
  const st = playingState();
  st.combat = Object.assign({
    attackerId: "seat-a", defenderOwnerId: "seat-b", defenderLabel: "Bob's army",
    unitId: "a1", toKey: "0,0", atkBase: 1, defBase: 1,
    atkRoll: 0, defRoll: 0, atkRolled: false, defRolled: false, rolled: false,
    atkTrade: 0, defTrade: 0, atkResource: 0, defResource: 0,
    turn: "attacker", history: []
  }, overrides || {});
  return st;
}

// Attack target selection is part of the attacker's current-player action;
// every later roll, bid, pass and cancel is tied to the participant whose hand
// actually owns that decision.
reject(combatState(), {
  type: "CANCEL_COMBAT", payload: { playerId: "seat-a", hostOverride: true }
}, "seat-b", "combat_actor_mismatch");
reject(combatState(), {
  type: "COMBAT_ROLL", payload: { playerId: "seat-a", side: "attacker", hostOverride: true }
}, "seat-b", "combat_actor_mismatch");
reject(combatState({ atkRolled: true, atkRoll: 3 }), {
  type: "COMBAT_ROLL", payload: { playerId: "seat-b", side: "defender", hostOverride: true }
}, "seat-a", "combat_actor_mismatch");
for (const type of ["COMBAT_SPEND", "COMBAT_PASS"]) {
  reject(combatState({ atkRolled: true, defRolled: true, rolled: true, turn: "attacker" }), {
    type, payload: { playerId: "seat-a", side: "attacker", mode: "plus", hostOverride: true }
  }, "seat-b", "combat_actor_mismatch");
  reject(combatState({ atkRolled: true, defRolled: true, rolled: true, turn: "defender" }), {
    type, payload: { playerId: "seat-b", side: "defender", mode: "plus", hostOverride: true }
  }, "seat-a", "combat_actor_mismatch");
}

// A neutral defender's die belongs to the player to the attacker's right, not
// to the host and not to whichever client clicks first.
{
  const st = combatState({ defenderOwnerId: null, atkRolled: true, atkRoll: 4 });
  reject(st, {
    type: "COMBAT_ROLL", payload: { side: "defender", hostOverride: true }
  }, "seat-c", "combat_actor_mismatch");
  const allowed = Game.getActionPermission(st, {
    type: "COMBAT_ROLL", payload: { side: "defender" }
  }, { actorId: "seat-b", role: "player" });
  assert.equal(allowed.ok, true, "right-hand seat rolls for a neutral defender");
}

// Exclusive decision phases reject unrelated but otherwise valid turn actions.
{
  const st = playingState();
  st.pendingChoices = [{ id: "required", kind: "gain_resource", playerId: "seat-b" }];
  reject(st, { type: "PLAY_SCIENCE", payload: { amount: 1 } }, "seat-a", "decision_pending");
}
{
  const st = combatState();
  reject(st, { type: "END_TURN", payload: { hostOverride: true } }, "seat-a", "combat_pending");
}
{
  const st = playingState();
  st.pendingExploration = { playerId: "seat-a", tileId: "01", unitId: "a1" };
  reject(st, { type: "END_TURN", payload: {} }, "seat-a", "exploration_pending");
}
{
  const st = playingState();
  st.movementContinuation = {
    playerId: "seat-a", unitType: "army", unitId: "a1", fromKey: "0,0", remaining: 1
  };
  reject(st, {
    type: "PLAY_MILITARY_MOVE", payload: { unitId: "a2", toKey: "1,0" }
  }, "seat-a", "movement_continuation_mismatch");
}

// Foreign projections contain only enough information to render a neutral
// wait state. They cannot leak the option, target spaces, title or choice kind.
{
  const st = playingState();
  st.pendingChoices = [{
    id: "private", playerId: "seat-a", kind: "science_upgrade",
    title: "Pick a secret card", options: [{ id: "science" }], hexKeys: ["0,0"]
  }];
  const foreign = Game.projectState(st, "seat-b").pendingChoices[0];
  assert.deepEqual(Object.keys(foreign).sort(), ["id", "playerId", "status"]);
}

// Static UI regression: there must be no host impersonation control left to
// rediscover through a future render path.
assert.equal(uiSource.includes("Answer for them"), false);
assert.equal(uiSource.includes("wiz-host-resolve"), false);

console.log(`authorization-test: ${actionSet("HOST_ACTIONS").length} host actions, ` +
  `${actionSet("CURRENT_PLAYER_ACTIONS").length} turn actions, ` +
  `${new Set(choiceKinds).size} pending-choice kinds covered`);
