import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const data = read("../champions-data.json");
const report = read("../learnset-report.json");
const regulation = read("./regulation.json");
const ids = read("./move_ids.json");
assert.equal(data.meta.regulation, regulation.id);
assert.deepEqual(data.meta.regulationDetails, regulation);
assert.equal(report.regulation, regulation.id);
assert.equal(report.generated, data.meta.generated);
assert.deepEqual(data.meta.skippedRosterEntries, []);
assert.equal(new Set(Object.values(ids)).size, Object.keys(ids).length, "stable IDs must be unique");
assert.equal(new Set(data.pokemon.map((m) => m.slug)).size, data.pokemon.length);
const moveCounts = new Map();
for (const mon of data.pokemon) {
  assert.ok(["verified", "unverified"].includes(mon.learnset.status), mon.slug);
  assert.equal(new Set(mon.moves).size, mon.moves.length);
  if (mon.learnset.status === "unverified") assert.deepEqual(mon.moves, [], mon.slug);
  else {
    assert.ok(mon.moves.length > 0, mon.slug);
    assert.ok(mon.learnset.url.startsWith("https://"), mon.slug);
    assert.ok(["champions-repo", "serebii-champions"].includes(mon.learnset.source));
  }
  for (const id of mon.moves) {
    assert.ok(data.moves[id], `${mon.slug}: unknown move ${id}`);
    moveCounts.set(id, (moveCounts.get(id) || 0) + 1);
  }
  const entry = report.entries.find((e) => e.slug === mon.slug);
  assert.equal(entry.status, mon.learnset.status, mon.slug);
  assert.equal(entry.moveCount, mon.moves.length, mon.slug);
}
for (const [id, move] of Object.entries(data.moves)) {
  assert.equal(move.count, moveCounts.get(Number(id)) || 0, move.name);
  assert.equal(ids[move.name], Number(id), move.name);
}
const unresolved = data.pokemon.filter((m) => m.learnset.status === "unverified").map((m) => m.slug).sort();
assert.deepEqual([...report.unverified].sort(), unresolved);
assert.deepEqual([...data.meta.learnsets.unverified].sort(), unresolved);
assert.equal(data.meta.learnsets.verifiedCount + unresolved.length, data.pokemon.length);
const mon = (slug) => data.pokemon.find((m) => m.slug === slug);
const names = (slug) => mon(slug).moves.map((id) => data.moves[id].name);
for (const slug of ["pyroar-male", "pyroar-mega"]) {
  assert.equal(names(slug).length, 49);
  assert.ok(names(slug).includes("Yawn"));
  for (const move of ["Return", "Hidden Power", "Tera Blast", "Toxic"]) {
    assert.ok(!names(slug).includes(move), `${slug}: broader fallback move ${move}`);
  }
}
assert.deepEqual(names("pyroar-male"), names("pyroar-mega"));
assert.ok(!names("slowbro").includes("Shell Side Arm"), "no Galarian move union on base Slowbro");
assert.ok(names("slowbro-galar").includes("Shell Side Arm"));
assert.ok(names("rotom-wash").includes("Hydro Pump"));
assert.ok(!names("rotom-wash").includes("Overheat"));
assert.ok(mon("pawmot").available, "nested version note must not hide the M-C Pawmot entry");
console.log(`snapshot validated: ${data.pokemon.length} forms, ${unresolved.length} visibly unverified learnset(s)`);
