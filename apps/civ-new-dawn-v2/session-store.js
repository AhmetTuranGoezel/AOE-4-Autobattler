(function (root, factory) {
  "use strict";
  const exported = factory(root || globalThis);
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) {
    root.CivSessionStore = exported;
    root.CivSessionApi = exported.api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DB_NAME = "civ-new-dawn-multiplayer-v2";
  const DB_VERSION = 1;
  const CHECKPOINT_LIMIT = 5;
  const MAX_CHECKPOINT_BYTES = 1024 * 1024;
  const GAME_ID_RE = /^[A-Za-z0-9_-]{8,96}$/;
  const CHECKPOINT_STORE = "checkpoints";
  const CREDENTIAL_STORE = "credentials";

  function plainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function validateGameId(gameId) {
    if (typeof gameId !== "string" || !GAME_ID_RE.test(gameId)) {
      throw new TypeError("gameId has an invalid format");
    }
    return gameId;
  }

  function cloneJson(value, label) {
    let json;
    try { json = JSON.stringify(value); } catch { throw new TypeError(`${label} must be JSON serializable`); }
    if (json == null) throw new TypeError(`${label} must be JSON serializable`);
    return { json, value: JSON.parse(json) };
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(text, "utf8"));
    const encoded = unescape(encodeURIComponent(text));
    return Uint8Array.from(encoded, (char) => char.charCodeAt(0));
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function getCrypto() {
    if (root.crypto?.getRandomValues) return root.crypto;
    if (typeof require === "function") {
      try { return require("node:crypto").webcrypto; } catch { /* browser */ }
    }
    return null;
  }

  function generateToken() {
    const cryptoObject = getCrypto();
    if (!cryptoObject?.getRandomValues) throw new Error("Secure randomness is unavailable");
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64url");
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  // WebCrypto is used in production. The deterministic fallback still detects
  // damaged local records when the app is opened from a non-secure file origin.
  async function checksum(text) {
    const bytes = utf8Bytes(text);
    const cryptoObject = getCrypto();
    if (cryptoObject?.subtle?.digest) {
      const digest = await cryptoObject.subtle.digest("SHA-256", bytes);
      return `sha256:${bytesToHex(digest)}`;
    }
    let high = 0xcbf29ce4;
    let low = 0x84222325;
    for (const byte of bytes) {
      low ^= byte;
      const lowProduct = low * 0x1b3;
      const carry = Math.floor(lowProduct / 0x100000000);
      low = lowProduct >>> 0;
      high = (high * 0x1b3 + carry) >>> 0;
    }
    return `fnv1a64:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function createIndexedDbBackend(indexedDb = root.indexedDB) {
    if (!indexedDb) return null;
    let openPromise;
    function open() {
      if (openPromise) return openPromise;
      openPromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
            const store = db.createObjectStore(CHECKPOINT_STORE, { keyPath: "key" });
            store.createIndex("gameId", "gameId", { unique: false });
          }
          if (!db.objectStoreNames.contains(CREDENTIAL_STORE)) {
            db.createObjectStore(CREDENTIAL_STORE, { keyPath: "gameId" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
        request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
      });
      return openPromise;
    }
    return {
      async list(gameId) {
        const db = await open();
        const transaction = db.transaction(CHECKPOINT_STORE, "readonly");
        const all = await requestToPromise(transaction.objectStore(CHECKPOINT_STORE).getAll());
        await transactionDone(transaction);
        return all.filter((record) => record.gameId === gameId);
      },
      async put(record) {
        const db = await open();
        const transaction = db.transaction(CHECKPOINT_STORE, "readwrite");
        transaction.objectStore(CHECKPOINT_STORE).put(record);
        await transactionDone(transaction);
      },
      async delete(key) {
        const db = await open();
        const transaction = db.transaction(CHECKPOINT_STORE, "readwrite");
        transaction.objectStore(CHECKPOINT_STORE).delete(key);
        await transactionDone(transaction);
      },
      async getCredentials(gameId) {
        const db = await open();
        const transaction = db.transaction(CREDENTIAL_STORE, "readonly");
        const value = await requestToPromise(transaction.objectStore(CREDENTIAL_STORE).get(gameId));
        await transactionDone(transaction);
        return value || null;
      },
      async putCredentials(record) {
        const db = await open();
        const transaction = db.transaction(CREDENTIAL_STORE, "readwrite");
        transaction.objectStore(CREDENTIAL_STORE).put(record);
        await transactionDone(transaction);
      },
      async close() {
        if (openPromise) (await openPromise).close();
        openPromise = null;
      }
    };
  }

  function createMemoryBackend() {
    const records = new Map();
    const credentials = new Map();
    return {
      _records: records,
      _credentials: credentials,
      async list(gameId) { return Array.from(records.values()).filter((record) => record.gameId === gameId); },
      async put(record) { records.set(record.key, { ...record }); },
      async delete(key) { records.delete(key); },
      async getCredentials(gameId) { return credentials.get(gameId) || null; },
      async putCredentials(record) { credentials.set(record.gameId, { ...record }); },
      async close() {}
    };
  }

  function createLocalStorageBackend(storage = root.localStorage) {
    if (!storage) return null;
    const checkpointsKey = `${DB_NAME}:checkpoints`;
    const credentialsKey = `${DB_NAME}:credentials`;
    function read(key) {
      try { return JSON.parse(storage.getItem(key) || "{}"); } catch { return {}; }
    }
    function write(key, value) { storage.setItem(key, JSON.stringify(value)); }
    return {
      async list(gameId) { return Object.values(read(checkpointsKey)).filter((record) => record.gameId === gameId); },
      async put(record) { const all = read(checkpointsKey); all[record.key] = record; write(checkpointsKey, all); },
      async delete(key) { const all = read(checkpointsKey); delete all[key]; write(checkpointsKey, all); },
      async getCredentials(gameId) { return read(credentialsKey)[gameId] || null; },
      async putCredentials(record) { const all = read(credentialsKey); all[record.gameId] = record; write(credentialsKey, all); },
      async close() {}
    };
  }

  function resilientBackend(primary, fallback) {
    if (!primary) return fallback;
    let disabled = false;
    return new Proxy({}, {
      get(_target, method) {
        if (method === "_fallback") return fallback;
        return async (...args) => {
          if (!disabled) {
            try { return await primary[method](...args); } catch (error) {
              disabled = true;
              try { await primary.close?.(); } catch { /* ignored */ }
              if (!fallback) throw error;
            }
          }
          return fallback[method](...args);
        };
      }
    });
  }

  function defaultBackend() {
    const volatile = createMemoryBackend();
    let local = null;
    try { local = createLocalStorageBackend(); } catch { /* storage blocked */ }
    return resilientBackend(createIndexedDbBackend(), local || volatile);
  }

  function normalizeCheckpoint(input, savedAt) {
    if (!plainObject(input)) throw new TypeError("checkpoint must be an object");
    const gameId = validateGameId(input.gameId);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new TypeError("revision must be a non-negative integer");
    if (!Number.isSafeInteger(input.hostEpoch) || input.hostEpoch < 1) throw new TypeError("hostEpoch must be a positive integer");
    const fullState = input.fullState ?? input.state;
    if (!plainObject(fullState)) throw new TypeError("fullState must be an object");
    const normalized = {
      protocolVersion: input.protocolVersion ?? 2,
      saveSchemaVersion: input.saveSchemaVersion ?? 2,
      rulesVersion: input.rulesVersion ?? fullState.rulesVersion ?? 1,
      gameId,
      revision: input.revision,
      hostEpoch: input.hostEpoch,
      savedAt,
      fullState,
      processedActionIds: Array.isArray(input.processedActionIds)
        ? input.processedActionIds.slice(-512)
        : []
    };
    return cloneJson(normalized, "checkpoint");
  }

  function createStore({ backend = defaultBackend(), now = () => Date.now() } = {}) {
    let writeQueue = Promise.resolve();

    async function saveCheckpoint(input) {
      const work = async () => {
        const savedAt = now();
        const normalized = normalizeCheckpoint(input, savedAt);
        if (utf8Bytes(normalized.json).length > MAX_CHECKPOINT_BYTES) {
          throw new Error(`Local checkpoint exceeds ${MAX_CHECKPOINT_BYTES} bytes`);
        }
        const digest = await checksum(normalized.json);
        const records = await backend.list(normalized.value.gameId);
        const duplicate = records.find((record) =>
          record.revision === normalized.value.revision && record.checksum === digest && record.payloadJson === normalized.json
        );
        if (duplicate) return { ...normalized.value, checkpoint: { key: duplicate.key, checksum: digest, sequence: duplicate.sequence } };

        const sequence = records.reduce((max, record) => Math.max(max, Number(record.sequence) || 0), 0) + 1;
        const key = `${normalized.value.gameId}:${String(sequence).padStart(10, "0")}:${generateToken().slice(0, 8)}`;
        const sorted = records.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        while (sorted.length >= CHECKPOINT_LIMIT) {
          const oldest = sorted.shift();
          if (oldest?.key) await backend.delete(oldest.key);
        }
        await backend.put({
          key,
          gameId: normalized.value.gameId,
          revision: normalized.value.revision,
          hostEpoch: normalized.value.hostEpoch,
          savedAt,
          sequence,
          checksum: digest,
          payloadJson: normalized.json
        });
        return { ...normalized.value, checkpoint: { key, checksum: digest, sequence } };
      };
      const result = writeQueue.then(work, work);
      writeQueue = result.then(() => undefined, () => undefined);
      return result;
    }

    async function verifyRecord(record) {
      if (!record || typeof record.payloadJson !== "string" || typeof record.checksum !== "string") return null;
      if (await checksum(record.payloadJson) !== record.checksum) return null;
      let payload;
      try { payload = JSON.parse(record.payloadJson); } catch { return null; }
      if (!plainObject(payload) || payload.gameId !== record.gameId || payload.revision !== record.revision) return null;
      return payload;
    }

    async function loadLatest(gameId) {
      validateGameId(gameId);
      const records = (await backend.list(gameId)).slice().sort((a, b) =>
        (b.revision - a.revision) || ((b.sequence || 0) - (a.sequence || 0))
      );
      for (const record of records) {
        const payload = await verifyRecord(record);
        if (payload) return { ...payload, checkpoint: { key: record.key, checksum: record.checksum, sequence: record.sequence } };
      }
      return null;
    }

    async function listCheckpoints(gameId) {
      validateGameId(gameId);
      const records = (await backend.list(gameId)).slice().sort((a, b) =>
        (b.revision - a.revision) || ((b.sequence || 0) - (a.sequence || 0))
      );
      return Promise.all(records.map(async (record) => ({
        key: record.key,
        gameId: record.gameId,
        revision: record.revision,
        hostEpoch: record.hostEpoch,
        savedAt: record.savedAt,
        sequence: record.sequence,
        checksum: record.checksum,
        valid: !!(await verifyRecord(record))
      })));
    }

    async function saveCredentials(gameId, credentials) {
      validateGameId(gameId);
      if (!plainObject(credentials)) throw new TypeError("credentials must be an object");
      const cloned = cloneJson(credentials, "credentials").value;
      await backend.putCredentials({ gameId, updatedAt: now(), value: cloned });
      return cloned;
    }

    async function loadCredentials(gameId) {
      validateGameId(gameId);
      const record = await backend.getCredentials(gameId);
      return record?.value ? cloneJson(record.value, "credentials").value : null;
    }

    async function exportSession(gameId, { includeCredentials = false } = {}) {
      const latest = await loadLatest(gameId);
      if (!latest) return null;
      const exported = { exportedAt: now(), checkpoint: latest };
      if (includeCredentials) exported.credentials = await loadCredentials(gameId);
      return exported;
    }

    return {
      saveCheckpoint,
      checkpoint: saveCheckpoint,
      loadLatest,
      recoverSession: loadLatest,
      listCheckpoints,
      saveCredentials,
      loadCredentials,
      exportSession,
      async close() { await backend.close?.(); }
    };
  }

  class CivSessionApiError extends Error {
    constructor(code, message, status = 0, details = null) {
      super(message);
      this.name = "CivSessionApiError";
      this.code = code;
      this.status = status;
      this.details = details;
      this.retryable = status === 0 || status === 408 || status === 429 || status >= 500 || code === "cas_conflict";
    }
  }

  function createApiClient({
    basePath = "/api/civ-session",
    fetchImpl = root.fetch?.bind(root),
    timeoutMs = 12_000
  } = {}) {
    async function requestRemote(gameId, operation, options = {}) {
      validateGameId(gameId);
      if (!plainObject(operation) || typeof operation.op !== "string") {
        throw new TypeError("operation must contain an op string");
      }
      if (typeof fetchImpl !== "function") throw new CivSessionApiError("fetch_unavailable", "Network requests are unavailable");
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs : timeoutMs;
      let didTimeout = false;
      let timer = null;
      const abortFromCaller = () => controller?.abort(options.signal?.reason);
      if (options.signal?.aborted) abortFromCaller();
      else options.signal?.addEventListener?.("abort", abortFromCaller, { once: true });
      if (controller && timeout > 0) {
        timer = setTimeout(() => { didTimeout = true; controller.abort(); }, timeout);
      }
      try {
        const result = await fetchImpl(`${basePath.replace(/\/$/, "")}/${encodeURIComponent(gameId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          signal: controller?.signal,
          body: JSON.stringify(operation)
        });
        let payload = null;
        try { payload = await result.json(); } catch { /* handled below */ }
        if (!result.ok || !payload?.ok) {
          throw new CivSessionApiError(
            payload?.code || `http_${result.status}`,
            payload?.message || "The multiplayer backup request failed",
            result.status,
            payload
          );
        }
        return payload;
      } catch (error) {
        if (error instanceof CivSessionApiError) throw error;
        if (didTimeout) throw new CivSessionApiError("backup_timeout", "The multiplayer backup timed out", 408);
        if (options.signal?.aborted) throw new CivSessionApiError("request_cancelled", "The request was cancelled", 0);
        throw new CivSessionApiError("backup_unavailable", "The multiplayer backup is unavailable", 0, error);
      } finally {
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener?.("abort", abortFromCaller);
      }
    }

    const invoke = (op) => (gameId, body = {}, options) => requestRemote(gameId, { ...body, op }, options);
    return {
      request: requestRemote,
      requestRemote,
      create: invoke("create"),
      checkpoint: invoke("checkpoint"),
      status: invoke("status"),
      heartbeat: invoke("heartbeat"),
      takeover: invoke("takeover"),
      close: invoke("close")
    };
  }

  const store = createStore();
  const api = createApiClient();
  return Object.assign(store, {
    api,
    requestRemote: api.requestRemote,
    generateToken,
    checksum,
    create: createStore,
    createStore,
    createApiClient,
    createMemoryBackend,
    CivSessionApiError,
    constants: { DB_NAME, DB_VERSION, CHECKPOINT_LIMIT, MAX_CHECKPOINT_BYTES }
  });
});
