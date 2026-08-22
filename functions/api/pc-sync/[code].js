// Cloudflare Pages Function — GET/PUT the Pokemon Champions sync blob.
//
// Route: /api/pc-sync/<code>. The code is the key; there is no account. Needs a
// KV namespace bound as PC_SYNC in the Pages project settings (see SYNC.md).

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

export async function onRequest({ request, params, env }) {
  const code = String(params.code || "").toLowerCase();
  if (!CODE_RE.test(code)) return json({ error: "bad sync code" }, 400);
  if (!env.PC_SYNC) return json({ error: "PC_SYNC KV namespace is not bound" }, 501);

  if (request.method === "GET") {
    const stored = await env.PC_SYNC.get(`pc:${code}`);
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
    const existing = await env.PC_SYNC.get(`pc:${code}`);
    const merged = JSON.stringify({ v: 1, entries: mergeEntries(existing, parsed.entries) });
    // A year untouched means the code was abandoned; let KV reclaim it.
    await env.PC_SYNC.put(`pc:${code}`, merged, { expirationTtl: 60 * 60 * 24 * 365 });
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
}
