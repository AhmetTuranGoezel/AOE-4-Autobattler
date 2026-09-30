import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyMove } from "../src/moves-view.js";
import { setupEffect, selfStatChanges, formatStatChanges } from "../src/move-effects.js";

const data = JSON.parse(readFileSync(new URL("../champions-data.json", import.meta.url), "utf8"));
const moves = Object.fromEntries(Object.values(data.moves).map(move => [move.name, move]));
function assertShiftGear(move) {
  const fx = classifyMove(move);
  assert.deepEqual(fx.chips.map(ch => ch.txt).sort(), ["+1 Atk self", "+2 Spe self"]);
  assert.deepEqual(setupEffect(move).stages, { atk: 1, spe: 2 });
  assert.ok(fx.facets.has("raises") && fx.selfBoost);
  assert.equal(fx.selfDrop, false);
}
assertShiftGear(moves["Shift Gear"]);
// English wording must not supply missing facts or be needed to read them.
assertShiftGear({ ...moves["Shift Gear"], effect: "" });
for (const stat of ["atk", "spe"]) {
  const mutation = structuredClone(moves["Shift Gear"]);
  delete mutation.statChanges.self[stat];
  assert.throws(() => assertShiftGear(mutation), assert.AssertionError, `Missing ${stat} must fail`);
}

const expected = {
  "Dragon Dance": { atk: 1, spe: 1 }, "Quiver Dance": { spa: 1, spd: 1, spe: 1 },
  "Bulk Up": { atk: 1, def: 1 }, "Calm Mind": { spa: 1, spd: 1 },
  "Shell Smash": { atk: 2, def: -1, spa: 2, spd: -1, spe: 2 },
  "No Retreat": { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  "Coil": { atk: 1, def: 1, accuracy: 1 },
  "Clangorous Soul": { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  "Growth": { atk: 1, spa: 1 }, "Victory Dance": { atk: 1, def: 1, spe: 1 },
  "Fillet Away": { atk: 2, spa: 2, spe: 2 },
};
for (const [name, stats] of Object.entries(expected)) {
  // Generic consumers also support unavailable moves without adding them to the roster.
  const move = moves[name] || { name, class: "status", statChanges: { self: stats } };
  assert.deepEqual(selfStatChanges(move), stats, name);
  assert.deepEqual(setupEffect(move).stages, stats, name);
  assert.equal(classifyMove(move).chips.filter(ch => !ch.condition).length, Object.keys(stats).length, name);
}
assert.equal(formatStatChanges(selfStatChanges(moves["Shift Gear"])), "+1 Atk / +2 Spe");
assert.deepEqual(setupEffect(moves["Shift Gear"], {}, { atk: 5, spe: 5 }).stages, { atk: 6, spe: 6 });
assert.deepEqual(setupEffect(moves["Shift Gear"], { ability: "simple" }).stages, { atk: 2, spe: 4 });
assert.equal(setupEffect(moves["Shift Gear"], { ability: "contrary" }), null);
assert.deepEqual(setupEffect(moves["Shell Smash"]).changes, expected["Shell Smash"]);
assert.ok(classifyMove(moves["Shell Smash"]).facets.has("drops"));
assert.ok(classifyMove(moves["Shell Smash"]).selfDrop);
assert.deepEqual(selfStatChanges(moves.Growth, { weather: "sun" }), { atk: 2, spa: 2 });
assert.deepEqual(selfStatChanges(moves.Growth, { weather: "sun", item: "utility-umbrella" }), { atk: 1, spa: 1 });
assert.deepEqual(setupEffect(moves["Belly Drum"], {}, { atk: -6 }).stages, { atk: 6 });
assert.ok(setupEffect(moves["Clangorous Soul"]).notes.some(note => note.includes("33%")));
assert.deepEqual(selfStatChanges(moves["Make It Rain"]), { spa: -2 });
assert.equal(setupEffect(moves["Steel Wing"]), null);
assert.deepEqual(classifyMove(moves["Steel Wing"]).chips.map(ch => ch.txt), ["10% +1 Def self"]);
assert.equal(classifyMove(moves["Ancient Power"]).chips.length, 5);
assert.equal(classifyMove(moves["Ancient Power"]).chance, 10);
assert.equal(classifyMove(moves["Icy Wind"]).chips[0].recipient, "target");
console.log("Move effects passed: multi-stat model, both Shift Gear chips, both deletion mutations, setup stages, conditions, costs and secondaries");
