#!/usr/bin/env node
// Exercises the REAL checkpointCandidate / receiveNetworkState bodies lifted
// from ui.js, to prove a failing backup no longer stops live synchronisation.
const fs = require("fs");
const vm = require("vm");
const APP = require("path").resolve(__dirname, "..") + "/";
const src = fs.readFileSync(APP + "ui.js", "utf8");

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
    Game: { migrateState: (x) => x },
    CivSessionStore: { saveCheckpoint: async (rec) => { s.savedLocally.push(rec); } },
    updateNetworkChrome: () => {},
    rememberProcessed: (ids) => { s.processedActionIds = ids; },
    recoverAuthoritativeState: async () => ({ committed: false }),
    render: () => { s.renders++; },
    Net: { setRevision: (r) => { s.netRevisions.push(r); } },
    localStorage: { setItem() {}, getItem: () => null }
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
  console.log("\n[1] the backup payload no longer carries the undo snapshot");
  {
    const s = scope();
    const big = { revision: 7, map: { hexes: { a: 1 } }, turnUndo: { snapshot: { huge: "x".repeat(5000) } } };
    const out = run(s, "backupPayload(" + JSON.stringify(big) + ")");
    ok("turnUndo is stripped", out.turnUndo === undefined);
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
    ok("the wire payload had no turnUndo", s.sentToRemote[0].fullState.turnUndo === undefined);
    ok("backupFailure cleared", s.backupFailure === null);
  }

  console.log("\n[3] an OVERSIZED backup must not stop the game");
  {
    const s = scope();
    s.CivSessionApi = { checkpoint: async () => {
      const e = new Error("Request exceeds 1048576 byte"); e.code = "http_413"; throw e; } };
    vm.createContext(s);
    vm.runInContext(LIFTED, s);
    const candidate = { revision: 0, phase: "playing" };
    const r = await run(s, "checkpointCandidate(" + JSON.stringify(candidate) + ", 'a2')");
    ok("the action is still ACCEPTED so net.js will broadcast", r.accepted === true,
      JSON.stringify(r).slice(0, 160));
    ok("it is flagged as unbacked, not silently fine", r.code === "accepted_unbacked", r.code);
    ok("the revision still advanced", r.revision === 8, r.revision);
    ok("Net was told the new revision", s.netRevisions.includes(8), JSON.stringify(s.netRevisions));
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

  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (fail) process.exitCode = 1;
})();
