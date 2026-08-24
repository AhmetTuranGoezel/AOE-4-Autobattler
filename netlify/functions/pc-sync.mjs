// Netlify Function — GET/PUT the Pokemon Champions sync blob.
//
// Route: /api/pc-sync/<code>, declared by the config export at the bottom.
// The code is the key; there is no account. Storage is Netlify Blobs, which
// needs no setup — no namespace to create, no binding to configure.

import { getStore } from "@netlify/blobs";

const MAX_BYTES = 256 * 1024;   // the whole saved state is a few KB; this is slack
const CODE_RE = /^[a-z0-9-]{6,64}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

// Merge rather than replace. A device only uploads the keys it knows about, so a
// wholesale overwrite would silently drop a setting that only another device has
// seen. Newest timestamp per key wins.
function mergeEntries(oldRaw, incoming) {
  let base = {};
  if (oldRaw) {
    try { base = (JSON.parse(oldRaw) || {}).entries || {}; } catch { base = {}; }
  }
  const out = { ...base };
  Object.entries(incoming).forEach(([k, rec]) => {
    if (!rec || typeof rec.v !== "string") return;
    const prev = out[k];
    if (prev && (prev.t || 0) > (rec.t || 0)) return;
    out[k] = { v: rec.v, t: rec.t || 0 };
  });
  return out;
}

export default async function handler(request) {
  const code = decodeURIComponent(new URL(request.url).pathname.split("/").pop() || "").toLowerCase();
  if (!CODE_RE.test(code)) return json({ error: "bad sync code" }, 400);

  const store = getStore("pc-sync");

  if (request.method === "GET") {
    const stored = await store.get(code);
    if (!stored) return json({ error: "nothing stored yet" }, 404);
    return new Response(stored, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const body = await request.text();
    if (body.length > MAX_BYTES) return json({ error: "payload too large" }, 413);
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json({ error: "invalid JSON" }, 400); }
    if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object") {
      return json({ error: "expected { entries }" }, 400);
    }
    const existing = await store.get(code);
    await store.set(code, JSON.stringify({ v: 1, entries: mergeEntries(existing, parsed.entries) }));
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/pc-sync/:code" };
