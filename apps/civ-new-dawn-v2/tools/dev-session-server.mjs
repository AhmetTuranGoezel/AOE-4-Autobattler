// Serve the app AND the multiplayer session endpoint locally.
//
// A plain static server answers /api/civ-session/<id> with a 404, which the
// client reports as "Room could not be created: The multiplayer backup request
// failed" and then an "Offline" banner - indistinguishable from a broken
// deploy. So there was no way to try multiplayer without pushing. This runs the
// real session core against an in-memory blob store, which is exactly what the
// Netlify function does with @netlify/blobs behind it.
//
//   node apps/civ-new-dawn-v2/tools/dev-session-server.mjs [port]
//
// State lives in memory and is gone when the process exits. It is a test rig,
// not a server: no auth beyond what the core itself enforces.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionService, SessionError } from "../../../netlify/lib/civ-session-core.mjs";

const PORT = Number(process.argv[2] || 8971);
// fileURLToPath, not url.pathname: this repo lives under "VSCode Stuff", and a
// raw pathname keeps the %20 and the leading slash before the drive letter.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

// The same shape the tests use: a Map with compare-and-set semantics, which is
// what the core relies on to make host takeover and checkpointing safe.
function memoryBlobStore() {
  const values = new Map();
  let etag = 0;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return {
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

const service = createSessionService({ store: memoryBlobStore() });

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0"
  });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new SessionError("invalid_json", "Body must be JSON", 400); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const session = url.pathname.match(/^\/api\/civ-session\/([^/]+)$/);
  if (session) {
    if (req.method !== "POST") return json(res, 405, { ok: false, code: "method_not_allowed", message: "POST only" });
    try {
      const body = await readBody(req);
      const out = await service.dispatch(decodeURIComponent(session[1]), body);
      console.log(`  ${body.op} ${session[1]} -> ok`);
      return json(res, 200, out);
    } catch (error) {
      const status = error instanceof SessionError ? error.status : 500;
      console.log(`  ${session[1]} -> ${error.code || "error"}: ${error.message}`);
      return json(res, status, { ok: false, code: error.code || "internal", message: error.message });
    }
  }

  // Static files, rooted at the app directory so paths match the deployed site.
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel.endsWith("/")) rel += "index.html";
  const file = join(ROOT, normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(ROOT)) return json(res, 403, { ok: false, message: "outside the app" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, () => {
  console.log(`Civ New Dawn dev server on http://localhost:${PORT}/`);
  console.log("  /api/civ-session/:gameId is served by the real session core (in-memory store).");
});
