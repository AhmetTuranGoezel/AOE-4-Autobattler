#!/usr/bin/env node
// Exercises the REAL checkpointCandidate / receiveNetworkState bodies lifted
// from ui.js. A failed backup must never be acknowledged as a committed move.
const fs = require("fs");
const vm = require("vm");
const APP = require("path").resolve(__dirname, "..") + "/";
const src = fs.readFileSync(APP + "ui.js", "utf8");
const engineContext=vm.createContext({console,structuredClone});engineContext.window=engineContext;
for(const file of ["rules-data.js","tile-art.js","game.js"])vm.runInContext(fs.readFileSync(APP+file,"utf8"),engineContext);
const engine=vm.runInContext("Game",engineContext);

function lift(name) {
  const m = src.match(new RegExp("(?:^|\\n)(  (?:async )?function " + name + "\\([\\s\\S]*?\\n  \\})", "m"));
  if (!m) throw new Error("could not lift " + name);
  return m[1];
}
const LIFTED = ["checkpointCandidate", "backupPayload", "receiveNetworkState",
  "saveLocalCheckpoint", "saveSessionCredentials"].map(lift).join("\n");

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log("  PASS " + n); }
  else { fail++; console.log("  FAIL " + n + (d !== undefined ? "  [" + d + "]" : "")); }
};

function scope(over) {
  const s = {
    console, Promise, JSON, Object, Array, Number, Boolean, String, Error,
    setTimeout, clearTimeout,
    sessionCredentials: { gameId: "g1", role: "host", hostToken: "t", hostEpoch: 1, revision: 7 },
    state: { revision: 7, phase: "playing", turn: { index: 0, round: 3 }, chat: [] },
    processedActionIds: [],
    networkStatus: {}, backupFailure: null, readOnlySession: false,
    chatHistory: [],
    PROTOCOL_VERSION: 2, SAVE_SCHEMA_VERSION: 2,
    localPlayerId: "p1",
    savedLocally: [], sentToRemote: [], renders: 0, netRevisions: [],
    // The real lookup, because receiveNetworkState uses it to notice that the
    // host has removed this seat. A stub that always found a player would have
    // hidden that path instead of testing it.
    Game: {
      migrateState: (x) => x,
      checkpointState:engine.checkpointState,
      currentPlayer:()=>({name:"P1"}),
      getPlayer: (st, id) => (st && st.players || []).find((pl) => pl.id === id) || null
    },
    kickedTo: [],
    CivSessionStore: { saveCheckpoint: async (rec) => { s.savedLocally.push(rec); },saveHistory:async()=>{},saveTurnStart:async()=>{},saveCredentials:async()=>{} },
    showToast:()=>{},
    updateNetworkChrome: () => {},
    rememberProcessed: (ids) => { s.processedActionIds = ids; },
    recoverAuthoritativeState: async () => ({ committed: false }),
    render: () => { s.renders++; },
    Net: { setRevision: (r) => { s.netRevisions.push(r); } },
    localStorage: { setItem() {}, getItem: () => null },
    returnToJoinScreen: (reason) => { s.kickedTo.push(reason); }
  };
  s.CivSessionApi = {
    checkpoint: async (gameId, body) => { s.sentToRemote.push(body); return { revision: 8, hostEpoch: 1, hostPeerId: "h", leaseUntil: 0 }; }
  };
  s.window = s;
  Object.assign(s, over || {});
  vm.createContext(s);
  vm.runInContext(LIFTED, s);
  return s;
}
const run = (s, code) => vm.runInContext(code, s);

(async () => {
  console.log("\n[1] checkpoints never embed a second gameplay state");
  {
    const s = scope();
    const big = { revision: 7, map: { hexes: { a: 1 } }, turnUndo: { snapshot: { huge: "x".repeat(5000) } } };
    const out = run(s, "backupPayload(" + JSON.stringify(big) + ")");
    ok("turnUndo has no embedded snapshot", out.turnUndo.snapshot === undefined);
    ok("everything else survives", out.revision === 7 && !!out.map);
    ok("the original object is not mutated", big.turnUndo !== undefined);
  }

  console.log("\n[2] a HEALTHY backup still commits normally");
  {
    const s = scope();
    const candidate = { revision: 0, phase: "playing", turnUndo: { snapshot: { big: "x".repeat(2000) } } };
    const r = await run(s, "checkpointCandidate(" + JSON.stringify(candidate) + ", 'a1')");
    ok("accepted", r.accepted === true, JSON.stringify(r).slice(0, 120));
    ok("revision came from the authority", r.revision === 8, r.revision);
    ok("remote checkpoint contains only recovery metadata", s.sentToRemote[0].fullState.turnUndo.snapshot === undefined);
    ok("backupFailure cleared", s.backupFailure === null);
  }

  console.log("\n[3] a failed backup never creates a local-only revision");
  {
    const s = scope();
    s.CivSessionApi = { checkpoint: async () => {
      const e = new Error("Request exceeds 1048576 byte"); e.code = "http_413"; throw e; } };
    vm.createContext(s);
    vm.runInContext(LIFTED, s);
    const candidate = { revision: 0, phase: "playing" };
    const r = await run(s, "checkpointCandidate(" + JSON.stringify(candidate) + ", 'a2')");
    ok("the uncommitted action is rejected", r.accepted === false,
      JSON.stringify(r).slice(0, 160));
    ok("the specific backup failure is reported", r.code === "http_413", r.code);
    ok("the revision stays at the committed head", r.revision === 7, r.revision);
    ok("Net never sees an uncommitted revision", !s.netRevisions.includes(8), JSON.stringify(s.netRevisions));
    ok("the failure is recorded for the banner", !!s.backupFailure);
    ok("the session is NOT put into read-only", s.readOnlySession === false);
  }

  console.log("\n[4] but losing OWNERSHIP still stops the action");
  {
    for (const code of ["host_epoch_stale", "host_auth_failed", "session_active_elsewhere"]) {
      const s = scope();
      s.CivSessionApi = { checkpoint: async () => { const e = new Error("taken"); e.code = code; throw e; } };
      vm.createContext(s);
      vm.runInContext(LIFTED, s);
      const r = await run(s, "checkpointCandidate({revision:0,phase:'playing'}, 'a3')");
      ok(code + " is refused", r.accepted === false, JSON.stringify(r).slice(0, 100));
      ok(code + " marks the session read-only", s.readOnlySession === true);
    }
  }

  console.log("\n[5] an incoming turn renders BEFORE persistence, not after");
  {
    let resolveWrite;
    const s = scope();
    // A checkpoint store that never settles - the pathological slow disk.
    s.CivSessionStore = { saveCheckpoint: () => new Promise((r) => { resolveWrite = r; }) };
    vm.createContext(s);
    vm.runInContext(LIFTED, s);
    const p = run(s, "receiveNetworkState({revision:9, phase:'playing', turn:{index:1,round:3}, chat:[]}, {revision:9})");
    await new Promise((r) => setTimeout(r, 30));
    ok("the board repainted even though the write never finished", s.renders === 1, s.renders);
    ok("and the new state was adopted", s.state.revision === 9, s.state.revision);
    if (resolveWrite) resolveWrite();
    await p;
  }

  console.log("\n[6] a removed seat is handed back to the join screen");
  {
    const s = scope({ localPlayerId: "p2", state:{revision:7,phase:"lobby"} });
    await run(s, "receiveNetworkState({revision:10, phase:'lobby', players:[{id:'p1'}], " +
      "kicked:['p2'], turn:{index:0,round:1}, chat:[]}, {revision:10})");
    ok("the kicked client is sent back to the join screen", s.kickedTo.length === 1,
      JSON.stringify(s.kickedTo));
    ok("and it is told why", /removed/i.test(s.kickedTo[0] || ""), s.kickedTo[0]);
    ok("it does not paint the lobby it is no longer in", s.renders === 0, s.renders);
  }
  {
    // The seat that is still there must be unaffected by someone else's kick.
    const s = scope({ localPlayerId: "p1", state:{revision:7,phase:"lobby"} });
    await run(s, "receiveNetworkState({revision:10, phase:'lobby', players:[{id:'p1'}], " +
      "kicked:['p2'], turn:{index:0,round:1}, chat:[]}, {revision:10})");
    ok("a seat that was NOT kicked stays in the game", s.kickedTo.length === 0,
      JSON.stringify(s.kickedTo));
    ok("and it repaints normally", s.renders === 1, s.renders);
  }

  {
    const s=scope();const original=s.state;
    await run(s,"receiveNetworkState({revision:99,phase:'setup'}, {revision:99})");
    ok("even a higher-revision setup snapshot cannot replace a running game",s.state===original&&s.state.phase==="playing");
    ok("setup regression is visibly blocked",s.backupFailure?.code==="setup_regression"&&s.readOnlySession);
  }
  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (fail) process.exitCode = 1;
})();
