import assert from "node:assert/strict";
import { loadTournamentTeams } from "../src/data.js";

const originalFetch = globalThis.fetch;
const teams = { schemaVersion: 1, generation: "test", teams: [] };
const success = () => ({ ok: true, json: async () => teams });
try {
  for (const fail of [
    async () => ({ ok: false }),
    async () => { throw new Error("Network failure"); },
    () => { throw new Error("Synchronous fetch failure"); },
    async () => ({ ok: true, json: async () => { throw new Error("Invalid JSON"); } }),
    async () => ({ ok: true, json: async () => ({ ...teams, generation: "old" }) }),
  ]) {
    const data = { tournamentMeta: { generation: "test" } };
    let requests = 0;
    globalThis.fetch = (...args) => { requests++; return fail(...args); };
    const first = loadTournamentTeams(data);
    assert.equal(loadTournamentTeams(data), first, "Concurrent opens share one in-flight request");
    assert.equal(await first, false);
    assert.equal(requests, 1, "Failure must not automatically loop");
    assert.ok(data.tournamentTeamsError);
    assert.equal(data.tournamentTeamsPromise, undefined);
    assert.equal(data.tournamentTeams, undefined);
    globalThis.fetch = async () => { requests++; return success(); };
    const retry = loadTournamentTeams(data);
    assert.equal(data.tournamentTeamsError, undefined, "Remove stale errors when retry begins");
    assert.equal(loadTournamentTeams(data), retry);
    assert.equal(await retry, true);
    assert.equal(requests, 2);
    assert.deepEqual(data.tournamentTeams, teams);
    assert.equal(data.tournamentTeamsPromise, undefined);
    assert.equal(await loadTournamentTeams(data), true);
    assert.equal(requests, 2, "Loaded teams do not refetch");
  }
  globalThis.fetch = () => { throw new Error("Must not fetch without aggregates"); };
  assert.equal(await loadTournamentTeams({}), false);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Tournament team loading passed: HTTP/network/synchronous/JSON/version failures, concurrent deduplication, later retry and success caching");
