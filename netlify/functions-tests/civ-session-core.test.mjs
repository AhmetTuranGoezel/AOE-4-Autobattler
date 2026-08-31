import assert from "node:assert/strict";
import test from "node:test";

import {
  LEASE_MS,
  SessionError,
  createSessionService,
  internals
} from "../functions/civ-session-core.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function memoryBlobStore() {
  const values = new Map();
  let etag = 0;
  return {
    values,
    async getWithMetadata(key) {
      const entry = values.get(key);
      return entry ? { data: clone(entry.data), etag: entry.etag, metadata: {} } : null;
    },
    async setJSON(key, value, options = {}) {
      const existing = values.get(key);
      if (options.onlyIfNew && existing) return { modified: false };
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
      values.set(key, { data: clone(value), etag: `"etag-${++etag}"` });
      return { modified: true };
    }
  };
}

function fixture() {
  const store = memoryBlobStore();
  let timestamp = 1_000_000;
  let randomValue = 0;
  const service = createSessionService({
    store,
    now: () => timestamp,
    randomBytes: (length) => new Uint8Array(length).fill(++randomValue)
  });
  return {
    store,
    service,
    now: () => timestamp,
    advance: (ms) => { timestamp += ms; }
  };
}

const gameId = "game_test_0001";
const createBody = () => ({
  op: "create",
  protocolVersion: 2,
  saveSchemaVersion: 2,
  rulesVersion: 7,
  hostPeerId: "peer-host",
  seatIds: ["seat-a", "seat-b"],
  fullState: { revision: 0, phase: "setup", hiddenDeck: [1, 2, 3] },
  processedActionIds: []
});

test("create stores only hashes and status never leaks full state to a seat", async () => {
  const { service, store } = fixture();
  const created = await service.dispatch(gameId, createBody());
  assert.equal(created.revision, 0);
  assert.equal(created.hostEpoch, 1);
  assert.equal(created.leaseUntil, 1_000_000 + LEASE_MS);
  assert.match(created.credentials.hostToken, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(Object.keys(created.credentials.seatTokens), ["seat-a", "seat-b"]);

  const rawStorage = JSON.stringify(Array.from(store.values.values()));
  assert.equal(rawStorage.includes(created.credentials.hostToken), false);
  assert.equal(rawStorage.includes(created.credentials.seatTokens["seat-a"]), false);

  const seatStatus = await service.status(gameId, {
    op: "status",
    seatId: "seat-a",
    seatToken: created.credentials.seatTokens["seat-a"]
  });
  assert.equal("fullState" in seatStatus, false);
  assert.equal("hostTokenHash" in seatStatus, false);

  await assert.rejects(
    service.status(gameId, {
      op: "status",
      seatId: "seat-a",
      seatToken: created.credentials.seatTokens["seat-a"],
      includeState: true
    }),
    (error) => error instanceof SessionError && error.code === "state_forbidden"
  );
});

test("checkpoint writes an immutable revision before advancing the CAS pointer", async () => {
  const { service, store } = fixture();
  const created = await service.create(gameId, createBody());
  const saved = await service.checkpoint(gameId, {
    op: "checkpoint",
    hostToken: created.credentials.hostToken,
    hostEpoch: 1,
    expectedRevision: 0,
    fullState: { revision: 1, phase: "play", value: 42 },
    processedActionIds: ["action-1"]
  });
  assert.equal(saved.revision, 1);
  assert.equal(store.values.has(internals.REVISION_KEY(gameId, 1)), true);
  assert.equal(store.values.get(internals.CURRENT_KEY(gameId)).data.revision, 1);

  const recovered = await service.status(gameId, {
    op: "status",
    hostToken: created.credentials.hostToken,
    includeState: true
  });
  assert.deepEqual(recovered.fullState, { revision: 1, phase: "play", value: 42 });
  assert.deepEqual(recovered.processedActionIds, ["action-1"]);

  await assert.rejects(
    service.checkpoint(gameId, {
      op: "checkpoint",
      hostToken: created.credentials.hostToken,
      hostEpoch: 1,
      expectedRevision: 0,
      fullState: { revision: 1, value: 99 }
    }),
    (error) => error.code === "stale_revision"
  );
});

test("two simultaneous expired-lease takeovers produce exactly one new host", async () => {
  const { service, advance } = fixture();
  const created = await service.create(gameId, createBody());
  advance(LEASE_MS + 1);

  const attempts = await Promise.allSettled([
    service.takeover(gameId, {
      op: "takeover",
      seatId: "seat-a",
      seatToken: created.credentials.seatTokens["seat-a"],
      newHostPeerId: "peer-seat-a"
    }),
    service.takeover(gameId, {
      op: "takeover",
      seatId: "seat-b",
      seatToken: created.credentials.seatTokens["seat-b"],
      newHostPeerId: "peer-seat-b"
    })
  ]);
  const winners = attempts.filter((result) => result.status === "fulfilled");
  const losers = attempts.filter((result) => result.status === "rejected");
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].reason.code, "takeover_lost");
  assert.equal(winners[0].value.hostEpoch, 2);
  assert.deepEqual(winners[0].value.fullState, createBody().fullState);

  await assert.rejects(
    service.heartbeat(gameId, {
      op: "heartbeat",
      hostToken: created.credentials.hostToken,
      hostEpoch: 1,
      hostPeerId: "peer-host"
    }),
    (error) => error.code === "host_epoch_stale"
  );
});

test("heartbeat rejects a second active peer and close is recoverable", async () => {
  const { service } = fixture();
  const created = await service.create(gameId, createBody());
  await assert.rejects(
    service.heartbeat(gameId, {
      op: "heartbeat",
      hostToken: created.credentials.hostToken,
      hostEpoch: 1,
      hostPeerId: "other-peer"
    }),
    (error) => error.code === "session_active_elsewhere"
  );
  const closed = await service.close(gameId, {
    op: "close",
    hostToken: created.credentials.hostToken,
    hostEpoch: 1
  });
  assert.equal(closed.status, "closed");
  const status = await service.status(gameId, {
    op: "status",
    seatId: "seat-a",
    seatToken: created.credentials.seatTokens["seat-a"]
  });
  assert.equal(status.status, "closed");
});

test("strict validation rejects credentials embedded in snapshots", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.create(gameId, { ...createBody(), fullState: { player: { seatToken: "secret" } } }),
    (error) => error.code === "credentials_in_state"
  );
});
