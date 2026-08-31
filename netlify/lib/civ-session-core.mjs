import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

export const PROTOCOL_VERSION = 2;
export const SAVE_SCHEMA_VERSION = 2;
export const LEASE_MS = 90_000;
export const HEARTBEAT_MS = 20_000;
export const MAX_RECORD_BYTES = 1024 * 1024;
export const MAX_PROCESSED_ACTION_IDS = 512;

const GAME_ID_RE = /^[A-Za-z0-9_-]{8,96}$/;
const SEAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PEER_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{22,128}$/;
const ACTION_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

const CURRENT_KEY = (gameId) => `${gameId}/current`;
const REVISION_KEY = (gameId, revision) => `${gameId}/revisions/${String(revision).padStart(12, "0")}`;

export class SessionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "SessionError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new SessionError(code, message, status);
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) fail("invalid_request", `${label} must be an object`);
  return value;
}

function assertOnlyKeys(value, allowed, label = "request") {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("invalid_request", `${label} contains unsupported field '${key}'`);
  }
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail("invalid_request", `${label} must be an integer >= ${minimum}`);
  }
  return value;
}

function requireString(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("invalid_request", `${label} has an invalid format`);
  }
  return value;
}

function validateGameId(gameId) {
  return requireString(gameId, "gameId", GAME_ID_RE);
}

function validatePeerId(peerId, label = "hostPeerId") {
  return requireString(peerId, label, PEER_ID_RE);
}

function validateSeatId(seatId) {
  return requireString(seatId, "seatId", SEAT_ID_RE);
}

function validateToken(token, label) {
  return requireString(token, label, TOKEN_RE);
}

function validateRulesVersion(value) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).length > 64 || String(value).length === 0) {
    fail("invalid_request", "rulesVersion must be a non-empty string or number");
  }
  return value;
}

function validateVersions(body) {
  if (body.protocolVersion !== PROTOCOL_VERSION) {
    fail("protocol_mismatch", `protocolVersion ${PROTOCOL_VERSION} is required`, 409);
  }
  if (body.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    fail("save_schema_mismatch", `saveSchemaVersion ${SAVE_SCHEMA_VERSION} is required`, 409);
  }
  validateRulesVersion(body.rulesVersion);
}

function validateState(fullState) {
  requirePlainObject(fullState, "fullState");

  // Credentials never belong inside a game snapshot. Besides reducing accidental
  // leaks, this makes exporting a host backup safe by default.
  const forbidden = new Set(["hostToken", "hostTokenHash", "seatToken", "seatTokenHashes"]);
  const seen = new Set();
  const stack = [fullState];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) fail("credentials_in_state", `fullState must not contain '${key}'`);
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return fullState;
}

function validateActionIds(value = []) {
  if (!Array.isArray(value) || value.length > MAX_PROCESSED_ACTION_IDS) {
    fail("invalid_request", `processedActionIds must contain at most ${MAX_PROCESSED_ACTION_IDS} entries`);
  }
  const seen = new Set();
  const ids = [];
  for (const id of value) {
    requireString(id, "actionId", ACTION_ID_RE);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(-MAX_PROCESSED_ACTION_IDS);
}

function validateSeatIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    fail("invalid_request", "seatIds must contain between 1 and 8 seats");
  }
  const ids = value.map(validateSeatId);
  if (new Set(ids).size !== ids.length) fail("invalid_request", "seatIds must be unique");
  return ids;
}

function validateSeatTokens(value = {}, allowedSeatIds = null) {
  requirePlainObject(value, "seatTokens");
  const out = {};
  for (const [seatId, token] of Object.entries(value)) {
    validateSeatId(seatId);
    if (allowedSeatIds && !allowedSeatIds.has(seatId)) {
      fail("invalid_request", `seatTokens contains unknown seat '${seatId}'`);
    }
    out[seatId] = validateToken(token, `seatTokens.${seatId}`);
  }
  return out;
}

function byteLength(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function requireRecordSize(record) {
  if (byteLength(record) > MAX_RECORD_BYTES) {
    fail("checkpoint_too_large", `checkpoint exceeds ${MAX_RECORD_BYTES} bytes`, 413);
  }
}

function defaultHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashesEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function createToken(randomBytes = nodeRandomBytes) {
  return Buffer.from(randomBytes(16)).toString("base64url");
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}

function commitHash(record, hash) {
  const committed = {
    protocolVersion: record.protocolVersion,
    saveSchemaVersion: record.saveSchemaVersion,
    rulesVersion: record.rulesVersion,
    gameId: record.gameId,
    revision: record.revision,
    hostEpoch: record.hostEpoch,
    hostPeerId: record.hostPeerId,
    hostTokenHash: record.hostTokenHash,
    seatTokenHashes: record.seatTokenHashes,
    status: record.status,
    fullState: record.fullState,
    processedActionIds: record.processedActionIds
  };
  return hash(JSON.stringify(stableObject(committed)));
}

function withoutSecrets(record, nowValue) {
  return {
    protocolVersion: record.protocolVersion,
    saveSchemaVersion: record.saveSchemaVersion,
    rulesVersion: record.rulesVersion,
    gameId: record.gameId,
    revision: record.revision,
    hostEpoch: record.hostEpoch,
    hostPeerId: record.hostPeerId,
    leaseUntil: record.leaseUntil,
    leaseExpired: nowValue >= record.leaseUntil,
    updatedAt: record.updatedAt,
    status: record.status,
    seatIds: Object.keys(record.seatTokenHashes || {})
  };
}

function requireActive(record) {
  if (record.status !== "active") fail("session_closed", "This session is closed", 410);
}

async function readEntry(store, key) {
  const entry = await store.getWithMetadata(key, { consistency: "strong", type: "json" });
  if (!entry) return null;
  let data = entry.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { fail("corrupt_session", "Stored session data is invalid", 500); }
  }
  return { data, etag: entry.etag };
}

async function setJSON(store, key, value, options) {
  const result = await store.setJSON(key, value, options);
  return !!result?.modified;
}

export function createSessionService({
  store,
  now = () => Date.now(),
  randomBytes = nodeRandomBytes,
  hash = defaultHash
} = {}) {
  if (!store || typeof store.getWithMetadata !== "function" || typeof store.setJSON !== "function") {
    throw new TypeError("A Netlify-Blobs-compatible store is required");
  }

  const tokenHash = (token) => hash(`civ-session-token:${token}`);

  async function current(gameId) {
    const entry = await readEntry(store, CURRENT_KEY(gameId));
    if (!entry) fail("session_not_found", "No saved session exists for this game", 404);
    return entry;
  }

  function authenticateHost(record, token, epoch) {
    validateToken(token, "hostToken");
    requireInteger(epoch, "hostEpoch", 1);
    if (epoch !== record.hostEpoch || !hashesEqual(tokenHash(token), record.hostTokenHash)) {
      fail("host_epoch_stale", "This host lease has been replaced", 409);
    }
  }

  function authenticateSeat(record, seatId, token) {
    validateSeatId(seatId);
    validateToken(token, "seatToken");
    const expected = record.seatTokenHashes?.[seatId];
    if (!expected || !hashesEqual(tokenHash(token), expected)) {
      fail("seat_auth_failed", "Seat credentials are invalid", 403);
    }
  }

  async function create(gameId, body) {
    validateGameId(gameId);
    requirePlainObject(body, "request");
    assertOnlyKeys(body, new Set([
      "op", "protocolVersion", "saveSchemaVersion", "rulesVersion", "hostPeerId",
      "fullState", "processedActionIds", "seatIds", "hostToken", "seatTokens"
    ]));
    validateVersions(body);
    const hostPeerId = validatePeerId(body.hostPeerId);
    const fullState = validateState(body.fullState);
    const processedActionIds = validateActionIds(body.processedActionIds);
    const suppliedTokens = validateSeatTokens(body.seatTokens || {});
    const inferredSeats = body.seatIds || Object.keys(suppliedTokens);
    const seatIds = validateSeatIds(inferredSeats);
    const allowedSeats = new Set(seatIds);
    validateSeatTokens(suppliedTokens, allowedSeats);

    const hostToken = body.hostToken == null
      ? createToken(randomBytes)
      : validateToken(body.hostToken, "hostToken");
    const seatTokens = {};
    const seatTokenHashes = {};
    for (const seatId of seatIds) {
      const token = suppliedTokens[seatId] || createToken(randomBytes);
      seatTokens[seatId] = token;
      seatTokenHashes[seatId] = tokenHash(token);
    }

    const nowValue = now();
    const record = {
      protocolVersion: PROTOCOL_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      rulesVersion: validateRulesVersion(body.rulesVersion),
      gameId,
      revision: 0,
      hostEpoch: 1,
      hostPeerId,
      hostTokenHash: tokenHash(hostToken),
      seatTokenHashes,
      leaseUntil: nowValue + LEASE_MS,
      updatedAt: nowValue,
      status: "active",
      fullState,
      processedActionIds
    };
    record.commitHash = commitHash(record, hash);
    requireRecordSize(record);

    const revisionCreated = await setJSON(store, REVISION_KEY(gameId, 0), record, { onlyIfNew: true });
    if (!revisionCreated) fail("session_exists", "A session with this gameId already exists", 409);
    const pointerCreated = await setJSON(store, CURRENT_KEY(gameId), record, { onlyIfNew: true });
    if (!pointerCreated) fail("session_exists", "A session with this gameId already exists", 409);

    return {
      ok: true,
      ...withoutSecrets(record, nowValue),
      credentials: { hostToken, seatTokens }
    };
  }

  async function checkpoint(gameId, body) {
    validateGameId(gameId);
    requirePlainObject(body, "request");
    assertOnlyKeys(body, new Set([
      "op", "hostToken", "hostEpoch", "expectedRevision", "fullState",
      "processedActionIds", "seatTokens"
    ]));
    const entry = await current(gameId);
    const record = entry.data;
    requireActive(record);
    authenticateHost(record, body.hostToken, body.hostEpoch);
    const expectedRevision = requireInteger(body.expectedRevision, "expectedRevision");
    if (expectedRevision !== record.revision) {
      fail("stale_revision", `Expected revision ${record.revision}`, 409);
    }
    const fullState = validateState(body.fullState);
    const nextRevision = expectedRevision + 1;
    if (fullState.revision != null && fullState.revision !== nextRevision) {
      fail("invalid_revision", `fullState.revision must be ${nextRevision}`);
    }
    const processedActionIds = validateActionIds(body.processedActionIds ?? record.processedActionIds);
    const seatTokens = validateSeatTokens(body.seatTokens || {});
    const seatTokenHashes = { ...record.seatTokenHashes };
    for (const [seatId, token] of Object.entries(seatTokens)) {
      if (!(seatId in seatTokenHashes) && Object.keys(seatTokenHashes).length >= 8) {
        fail("seat_limit", "A session can contain at most 8 seats");
      }
      seatTokenHashes[seatId] = tokenHash(token);
    }

    const nowValue = now();
    const next = {
      ...record,
      revision: nextRevision,
      seatTokenHashes,
      leaseUntil: nowValue + LEASE_MS,
      updatedAt: nowValue,
      fullState,
      processedActionIds
    };
    next.commitHash = commitHash(next, hash);
    requireRecordSize(next);

    const immutableKey = REVISION_KEY(gameId, nextRevision);
    const immutableCreated = await setJSON(store, immutableKey, next, { onlyIfNew: true });
    if (!immutableCreated) {
      const existing = await readEntry(store, immutableKey);
      if (!existing || existing.data.commitHash !== next.commitHash) {
        fail("revision_conflict", "Another checkpoint already owns this revision", 409);
      }
    }

    const pointerUpdated = await setJSON(store, CURRENT_KEY(gameId), next, { onlyIfMatch: entry.etag });
    if (!pointerUpdated) {
      const latest = await current(gameId);
      if (latest.data.revision === nextRevision && latest.data.commitHash === next.commitHash) {
        return { ok: true, ...withoutSecrets(latest.data, now()), idempotent: true };
      }
      fail("cas_conflict", "Session changed while the checkpoint was being saved; resync and retry", 409);
    }

    return { ok: true, ...withoutSecrets(next, nowValue) };
  }

  async function status(gameId, body) {
    validateGameId(gameId);
    requirePlainObject(body, "request");
    assertOnlyKeys(body, new Set(["op", "seatId", "seatToken", "hostToken", "includeState"]));
    const { data: record } = await current(gameId);
    let host = false;
    if (body.hostToken != null) {
      validateToken(body.hostToken, "hostToken");
      host = hashesEqual(tokenHash(body.hostToken), record.hostTokenHash);
      if (!host) fail("host_auth_failed", "Host credentials are invalid", 403);
    } else {
      authenticateSeat(record, body.seatId, body.seatToken);
    }
    if (body.includeState != null && typeof body.includeState !== "boolean") {
      fail("invalid_request", "includeState must be a boolean");
    }
    if (body.includeState && !host) fail("state_forbidden", "Only the active host may recover the full state", 403);
    const response = { ok: true, ...withoutSecrets(record, now()) };
    if (body.includeState) {
      response.fullState = record.fullState;
      response.processedActionIds = record.processedActionIds;
    }
    return response;
  }

  async function heartbeat(gameId, body) {
    validateGameId(gameId);
    requirePlainObject(body, "request");
    assertOnlyKeys(body, new Set(["op", "hostToken", "hostEpoch", "hostPeerId"]));
    const entry = await current(gameId);
    const record = entry.data;
    requireActive(record);
    authenticateHost(record, body.hostToken, body.hostEpoch);
    const hostPeerId = validatePeerId(body.hostPeerId);
    if (hostPeerId !== record.hostPeerId) {
      const code = now() < record.leaseUntil ? "session_active_elsewhere" : "host_peer_mismatch";
      fail(code, "The host session is registered under a different peer ID", 409);
    }
    const nowValue = now();
    const next = { ...record, leaseUntil: nowValue + LEASE_MS, updatedAt: nowValue };
    requireRecordSize(next);
    const updated = await setJSON(store, CURRENT_KEY(gameId), next, { onlyIfMatch: entry.etag });
    if (!updated) fail("cas_conflict", "Session changed during heartbeat; retry after resync", 409);
    return { ok: true, ...withoutSecrets(next, nowValue), heartbeatInterval: HEARTBEAT_MS };
  }

  async function takeover(gameId, body) {
    validateGameId(gameId);
    requirePlainObject(body, "request");
    assertOnlyKeys(body, new Set(["op", "seatId", "seatToken", "newHostPeerId"]));
    const entry = await current(gameId);
    const record = entry.data;
    requireActive(record);
    authenticateSeat(record, body.seatId, body.seatToken);
    const nowValue = now();
    if (nowValue < record.leaseUntil) {
      fail("lease_active", "The current host lease has not expired", 409);
    }
    const newHostPeerId = validatePeerId(body.newHostPeerId, "newHostPeerId");
    const hostToken = createToken(randomBytes);
    const next = {
      ...record,
      hostEpoch: record.hostEpoch + 1,
      hostPeerId: newHostPeerId,
      hostTokenHash: tokenHash(hostToken),
      leaseUntil: nowValue + LEASE_MS,
      updatedAt: nowValue
    };
    next.commitHash = commitHash(next, hash);
    requireRecordSize(next);
    const updated = await setJSON(store, CURRENT_KEY(gameId), next, { onlyIfMatch: entry.etag });
    if (!updated) fail("takeover_lost", "Another seat completed the host takeover first", 409);

    return {
      ok: true,
      ...withoutSecrets(next, nowValue),
      hostToken,
      fullState: next.fullState,
      processedActionIds: next.processedActionIds
    };
  }

  async function close(gameId, body) {
    validateGameId(gameId);
    requirePlainObject(body, "request");
    assertOnlyKeys(body, new Set(["op", "hostToken", "hostEpoch"]));
    const entry = await current(gameId);
    const record = entry.data;
    requireActive(record);
    authenticateHost(record, body.hostToken, body.hostEpoch);
    const nowValue = now();
    const next = { ...record, status: "closed", leaseUntil: nowValue, updatedAt: nowValue };
    next.commitHash = commitHash(next, hash);
    const updated = await setJSON(store, CURRENT_KEY(gameId), next, { onlyIfMatch: entry.etag });
    if (!updated) fail("cas_conflict", "Session changed while it was being closed", 409);
    return { ok: true, ...withoutSecrets(next, nowValue) };
  }

  async function dispatch(gameId, body) {
    requirePlainObject(body, "request");
    switch (body.op) {
      case "create": return create(gameId, body);
      case "checkpoint": return checkpoint(gameId, body);
      case "status": return status(gameId, body);
      case "heartbeat": return heartbeat(gameId, body);
      case "takeover": return takeover(gameId, body);
      case "close": return close(gameId, body);
      default: fail("invalid_operation", "op must be create, checkpoint, status, heartbeat, takeover, or close");
    }
  }

  return { create, checkpoint, status, heartbeat, takeover, close, dispatch };
}

export const internals = {
  CURRENT_KEY,
  REVISION_KEY,
  byteLength,
  createToken,
  defaultHash,
  stableObject,
  validateToken
};
