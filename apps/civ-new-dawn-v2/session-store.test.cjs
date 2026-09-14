"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const CivSessionStore = require("./session-store.js");

const gameId = "game_local_0001";

test("host history retains 24 committed revisions separately from five cache checkpoints", async () => {
  const store = CivSessionStore.create({backend:CivSessionStore.createMemoryBackend()});
  for(let n=0;n<30;n++) {
    await store.saveCheckpoint(checkpoint(n));
    await store.saveHistory({...checkpoint(n),metadata:{round:n,phase:"playing",activePlayer:"P1",action:"PLAY_SCIENCE"}});
  }
  assert.equal((await store.listCheckpoints(gameId)).length,5);
  const history=await store.listHistory(gameId);
  assert.equal(history.length,24);
  assert.equal(history.at(-1).revision,6);
  assert.equal((await store.loadHistory(gameId,8)).fullState.revision,8);
  assert.equal((await store.loadLatest(gameId)).fullState.revision,29);
  assert.equal("history" in (await store.loadLatest(gameId)).fullState,false);
});

test("turn-start recovery is a separate checksummed record, not a nested state",async()=>{
  const backend=CivSessionStore.createMemoryBackend(),store=CivSessionStore.create({backend});
  await store.saveTurnStart(checkpoint(2),"turn-p1");
  await store.saveCheckpoint({...checkpoint(3),fullState:{revision:3,turnUndo:{snapshotId:"turn-p1",locked:true}}});
  assert.equal((await store.loadLatest(gameId)).fullState.turnUndo.snapshot,undefined);
  assert.equal((await store.loadTurnStart(gameId,"turn-p1")).fullState.revision,2);
  const record=[...backend._records.values()].find(r=>r.kind==="turn-start");
  record.payloadJson="corrupted";
  assert.equal(await store.loadTurnStart(gameId,"turn-p1"),null);
});

function checkpoint(revision) {
  return {
    gameId,
    revision,
    hostEpoch: 1,
    protocolVersion: 2,
    saveSchemaVersion: 2,
    rulesVersion: 7,
    fullState: { revision, log: [`action-${revision}`] },
    processedActionIds: [`action-${revision}`]
  };
}

test("checkpoint rejects arrays and strings instead of spreading them into state",async()=>{
  const store=CivSessionStore.create({backend:CivSessionStore.createMemoryBackend()});
  for(const fullState of [[],"invalid",42,null])await assert.rejects(store.saveCheckpoint({...checkpoint(1),fullState}),/fullState must be an object/);
});

test("five-checkpoint ring keeps the newest records", async () => {
  const backend = CivSessionStore.createMemoryBackend();
  let now = 100;
  const store = CivSessionStore.create({ backend, now: () => ++now });
  for (let revision = 0; revision < 7; revision += 1) {
    await store.saveCheckpoint(checkpoint(revision));
  }
  const listed = await store.listCheckpoints(gameId);
  assert.equal(listed.length, 5);
  assert.deepEqual(listed.map((record) => record.revision), [6, 5, 4, 3, 2]);
  assert.equal(listed.every((record) => record.valid), true);
});

test("recovery skips a corrupt newest checkpoint and falls back", async () => {
  const backend = CivSessionStore.createMemoryBackend();
  const store = CivSessionStore.create({ backend, now: (() => { let n = 0; return () => ++n; })() });
  await store.saveCheckpoint(checkpoint(10));
  const newest = await store.saveCheckpoint(checkpoint(11));
  backend._records.get(newest.checkpoint.key).payloadJson = "{corrupted";

  const recovered = await store.loadLatest(gameId);
  assert.equal(recovered.revision, 10);
  assert.equal(recovered.fullState.revision, 10);
  const listed = await store.listCheckpoints(gameId);
  assert.equal(listed.find((record) => record.revision === 11).valid, false);
});

test("credentials survive checkpoint rotation and are excluded from default exports", async () => {
  const backend = CivSessionStore.createMemoryBackend();
  const store = CivSessionStore.create({ backend });
  const credentials = { seatId: "seat-a", seatToken: CivSessionStore.generateToken(), hostToken: CivSessionStore.generateToken() };
  await store.saveCredentials(gameId, credentials);
  for (let revision = 0; revision < 8; revision += 1) await store.saveCheckpoint(checkpoint(revision));
  assert.deepEqual(await store.loadCredentials(gameId), credentials);
  assert.equal("credentials" in await store.exportSession(gameId), false);
  assert.deepEqual((await store.exportSession(gameId, { includeCredentials: true })).credentials, credentials);
});

test("remote API client sends a typed operation and preserves server error codes", async () => {
  const calls = [];
  const api = CivSessionStore.createApiClient({
    basePath: "/api/civ-session",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() { return { ok: true, revision: 3 }; }
      };
    }
  });
  const result = await api.checkpoint(gameId, { hostToken: "x".repeat(22), hostEpoch: 1 });
  assert.equal(result.revision, 3);
  assert.equal(calls[0].url, `/api/civ-session/${gameId}`);
  assert.equal(JSON.parse(calls[0].options.body).op, "checkpoint");

  const denied = CivSessionStore.createApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      async json() { return { ok: false, code: "stale_revision", message: "resync" }; }
    })
  });
  await assert.rejects(
    denied.status(gameId, { seatId: "seat-a", seatToken: "x".repeat(22) }),
    (error) => error instanceof CivSessionStore.CivSessionApiError && error.code === "stale_revision"
  );
});
