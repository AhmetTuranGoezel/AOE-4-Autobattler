// Every room creation on the live site answered
//   409 {"code":"session_exists"}
// on a freshly generated, 96-bit-random gameId, from a single POST.
//
// The cause was not the session logic. It was the storage client: the core
// guards its writes with `onlyIfNew` / `onlyIfMatch` and reads back
// `{ modified }` to learn whether the write happened, and @netlify/blobs only
// grew those in v11. On the pinned v8 the options were accepted and silently
// ignored, and setJSON returned void - so `result?.modified` was undefined,
// which the core read as "this key already exists".
//
// The existing suite could not catch it, because its in-memory double
// implements the v11 contract. These tests use doubles that behave like the
// versions we might actually be deployed against.

import assert from "node:assert/strict";
import test from "node:test";

import { createSessionService } from "../functions/civ-session-core.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// A store that honours conditional writes, as v11 does.
function conditionalStore() {
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

// @netlify/blobs v8 to the letter: the guard options are ignored, the write
// always happens, and nothing is returned.
function legacyUnconditionalStore() {
  const values = new Map();
  let etag = 0;
  return {
    values,
    async getWithMetadata(key) {
      const entry = values.get(key);
      return entry ? { data: clone(entry.data), etag: entry.etag, metadata: {} } : null;
    },
    async setJSON(key, value) {
      values.set(key, { data: clone(value), etag: `"etag-${++etag}"` });
      // v8: Promise<void>
    }
  };
}

function serviceOn(store) {
  let timestamp = 1_000_000;
  let randomValue = 0;
  return createSessionService({
    store,
    now: () => timestamp,
    randomBytes: (length) => new Uint8Array(length).fill(++randomValue)
  });
}

const body = (hostPeerId) => ({
  op: "create",
  protocolVersion: 2,
  saveSchemaVersion: 2,
  rulesVersion: 7,
  hostPeerId,
  seatIds: ["seat-a"],
  fullState: { revision: 0, phase: "lobby" },
  processedActionIds: []
});

test("a freshly generated room id is created, not rejected as existing", async () => {
  const service = serviceOn(conditionalStore());
  const created = await service.dispatch("civ-H_bair33RrWgeMkD", body("civ-H_bair33RrWgeMkD"));
  assert.equal(created.ok, true);
  assert.equal(created.revision, 0);
});

test("a second, independent room can be created afterwards", async () => {
  // The reported failure was every create, not the first one only, so one
  // successful create is not enough to prove the fix.
  const store = conditionalStore();
  const service = serviceOn(store);
  const first = await service.dispatch("civ-room-one-aaaaaa", body("civ-room-one-aaaaaa"));
  const second = await service.dispatch("civ-room-two-bbbbbb", body("civ-room-two-bbbbbb"));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);

  // And they are genuinely separate records, not one overwriting the other.
  assert.ok(store.values.has("civ-room-one-aaaaaa/current"));
  assert.ok(store.values.has("civ-room-two-bbbbbb/current"));
  assert.notEqual(first.credentials.hostToken, second.credentials.hostToken);
});

test("an id that really is taken is still refused", async () => {
  // The guard has to keep working: this is the case the 409 exists for.
  const service = serviceOn(conditionalStore());
  await service.dispatch("civ-taken-cccccccc", body("civ-taken-cccccccc"));
  await assert.rejects(
    () => service.dispatch("civ-taken-cccccccc", body("civ-taken-cccccccc")),
    (error) => error.code === "session_exists" && error.status === 409
  );
});

test("a client without conditional writes is refused, not misreported as a conflict", async () => {
  // This is the exact production failure. On @netlify/blobs v8 the create used
  // to answer "session_exists" for a brand new id - blaming the caller for a
  // collision that never happened, and hiding the fact that the write had gone
  // through UNGUARDED. It must now say what is actually wrong.
  const service = serviceOn(legacyUnconditionalStore());
  await assert.rejects(
    () => service.dispatch("civ-H_bair33RrWgeMkD", body("civ-H_bair33RrWgeMkD")),
    (error) => {
      assert.notEqual(error.code, "session_exists",
        "a client that cannot honour onlyIfNew must not be reported as an id collision");
      assert.equal(error.code, "store_unsupported");
      assert.equal(error.status, 500);
      return true;
    }
  );
});

test("the installed @netlify/blobs actually supports conditional writes", async () => {
  // The bug was a version mismatch between what the core assumes and what the
  // dependency provides, so the dependency range is part of the contract.
  const pkg = JSON.parse(
    await (await import("node:fs/promises")).readFile(
      new URL("../../package.json", import.meta.url), "utf8"
    )
  );
  const range = pkg.dependencies["@netlify/blobs"];
  const major = Number(String(range).replace(/^[^0-9]*/, "").split(".")[0]);
  assert.ok(
    Number.isFinite(major) && major >= 11,
    `@netlify/blobs must be >=11 for onlyIfNew/onlyIfMatch and { modified }; found ${range}`
  );
});
