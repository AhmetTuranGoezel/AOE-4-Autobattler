// Cross-device sync for the tool's saved state.
//
// Everything the app remembers lives in localStorage under a "pc-" prefix, which
// is per-device AND per-domain — the demo, the phone and owltools each keep
// their own copy and never meet. This module gives all three a shared home.
//
// How it works: you set one sync code. The code IS the key — no account, no
// login. Each saved key carries the time it last changed, so merging is done
// key by key, newest wins. Banning a move on the phone and pinning a Pokémon on
// the PC both survive; only edits to the *same* setting can overwrite.

const PREFIX = "pc-";
const CODE_KEY = "pc-sync-code";   // deliberately local: the code itself never syncs
const META_KEY = "pc-sync-meta";   // ditto — it is bookkeeping, not settings
const LOCAL_ONLY = new Set([CODE_KEY, META_KEY]);

const ENDPOINT = "/api/pc-sync";
const PUSH_DEBOUNCE_MS = 1200;

const listeners = new Set();
let status = { state: "off", detail: "", at: null };
let pushTimer = null;
let pulling = false;
let booting = false;   // the first pull lands before the app reads anything

// --- bookkeeping ---------------------------------------------------------

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};

const meta = () => readJSON(META_KEY, {});
const writeMeta = (m) => {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* quota */ }
};

export const getCode = () => {
  try { return localStorage.getItem(CODE_KEY) || ""; } catch { return ""; }
};

export function setCode(code) {
  const clean = String(code || "").trim().toLowerCase();
  try {
    if (clean) localStorage.setItem(CODE_KEY, clean);
    else localStorage.removeItem(CODE_KEY);
  } catch { /* private mode */ }
  setStatus(clean ? "idle" : "off", clean ? "" : "no code set");
  return clean;
}

// Readable and hard to mistype out loud — no vowels, so it can't spell anything.
export function makeCode() {
  const alphabet = "23456789bcdfghjkmnpqrstvwxz";
  const pick = (n) => Array.from(
    crypto.getRandomValues(new Uint8Array(n)),
    (b) => alphabet[b % alphabet.length]
  ).join("");
  return `owl-${pick(4)}-${pick(4)}`;
}

// --- snapshot ------------------------------------------------------------

function syncableKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX) && !LOCAL_ONLY.has(k)) keys.push(k);
  }
  return keys;
}

function snapshot() {
  const m = meta();
  const entries = {};
  syncableKeys().forEach((k) => {
    entries[k] = { v: localStorage.getItem(k), t: m[k] || 0 };
  });
  return { v: 1, entries };
}

// Newest timestamp wins, key by key. A key missing from the remote side is left
// alone rather than deleted — a device that has never synced must not be able to
// wipe settings just by being empty.
function merge(remote) {
  if (!remote || !remote.entries) return false;
  const m = meta();
  let changed = false;
  Object.entries(remote.entries).forEach(([k, rec]) => {
    if (!k.startsWith(PREFIX) || LOCAL_ONLY.has(k)) return;
    if (!rec || typeof rec.v !== "string") return;
    const localTs = m[k] || 0;
    const remoteTs = rec.t || 0;
    if (remoteTs <= localTs) return;
    if (localStorage.getItem(k) === rec.v) { m[k] = remoteTs; return; }
    try { localStorage.setItem(k, rec.v); } catch { return; }
    m[k] = remoteTs;
    changed = true;
  });
  writeMeta(m);
  return changed;
}

// --- status --------------------------------------------------------------

function setStatus(state, detail) {
  status = { state, detail: detail || "", at: Date.now() };
  listeners.forEach((fn) => { try { fn(status); } catch { /* listener's problem */ } });
}

export const getStatus = () => status;
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// --- transport -----------------------------------------------------------

async function call(method, body) {
  const code = getCode();
  if (!code) throw new Error("no sync code");
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(code)}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  if (res.status === 404 && method === "GET") return null;   // nothing stored yet
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 120) || res.statusText}`);
  }
  return method === "GET" ? res.json() : null;
}

export async function pull({ quiet = false } = {}) {
  if (!getCode() || pulling) return false;
  pulling = true;
  if (!quiet) setStatus("syncing", "pulling");
  try {
    const remote = await call("GET");
    const changed = merge(remote);
    setStatus("ok", changed ? "pulled changes" : "up to date");
    if (changed && !booting) window.dispatchEvent(new CustomEvent("pc-sync-applied"));
    return changed;
  } catch (err) {
    setStatus("error", describe(err));
    return false;
  } finally {
    pulling = false;
  }
}

export async function push({ quiet = false } = {}) {
  if (!getCode()) return false;
  if (!quiet) setStatus("syncing", "pushing");
  try {
    await call("PUT", snapshot());
    setStatus("ok", "saved");
    return true;
  } catch (err) {
    setStatus("error", describe(err));
    return false;
  }
}

// Pull first so another device's newer edits are folded in, then push the
// merged result back so everyone ends up holding the same thing.
export async function syncNow() {
  if (!getCode()) return false;
  setStatus("syncing", "");
  await pull({ quiet: true });
  return push({ quiet: true });
}

function describe(err) {
  const msg = String((err && err.message) || err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "endpoint unreachable";
  if (/^404/.test(msg)) return "sync endpoint not deployed here";
  return msg;
}

// --- change detection ----------------------------------------------------

// Every view saves through localStorage.setItem, so stamping it here catches all
// of them at once and keeps sync out of a dozen unrelated files.
function installWriteHook() {
  const proto = Object.getPrototypeOf(localStorage) || Storage.prototype;
  const original = proto.setItem;
  if (original.__pcSyncHooked) return;
  const hooked = function (key, value) {
    const before = this === localStorage ? this.getItem(key) : null;
    original.call(this, key, value);
    if (this !== localStorage) return;
    if (!key.startsWith(PREFIX) || LOCAL_ONLY.has(key)) return;
    if (before === String(value)) return;   // a re-save of the same value is not a change
    const m = meta();
    m[key] = Date.now();
    writeMeta(m);
    schedulePush();
  };
  hooked.__pcSyncHooked = true;
  proto.setItem = hooked;
}

function schedulePush() {
  if (!getCode()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push({ quiet: true }), PUSH_DEBOUNCE_MS);
}

// --- boot ----------------------------------------------------------------

// Resolves once the opening pull is in, so the app can read state that is
// already merged instead of re-rendering a moment later. A dead endpoint must
// never hold the page hostage, hence the timeout.
export async function initSync({ firstPullTimeoutMs = 3000 } = {}) {
  installWriteHook();

  // A ?sync=… share link has to be honoured here, before anything else looks at
  // the code — otherwise a phone opening the link for the first time would sit
  // there unarmed until the next reload.
  const fromUrl = new URLSearchParams(window.location.search).get("sync");
  if (fromUrl) setCode(fromUrl);

  // Registered unconditionally: a code entered later in the session must arm
  // these too, and each one is a no-op while there is no code.
  document.addEventListener("visibilitychange", () => {
    // Coming back to the tab is the moment another device's edits matter most.
    if (!document.hidden) pull({ quiet: true });
  });
  window.addEventListener("online", () => syncNow());
  window.addEventListener("pagehide", () => {
    // Leaving with an edit still inside the debounce window would lose it.
    if (!pushTimer || !getCode()) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    try {
      navigator.sendBeacon(
        `${ENDPOINT}/${encodeURIComponent(getCode())}`,
        new Blob([JSON.stringify(snapshot())], { type: "application/json" })
      );
    } catch { /* best effort */ }
  });

  if (!getCode()) { setStatus("off", "no code set"); return; }
  setStatus("idle", "");
  booting = true;
  await Promise.race([
    pull({ quiet: true }),
    new Promise((res) => setTimeout(res, firstPullTimeoutMs))
  ]);
  booting = false;
}
