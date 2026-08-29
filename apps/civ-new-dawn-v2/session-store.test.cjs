"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const CivSessionStore = require("./session-store.js");

const gameId = "game_local_0001";

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
