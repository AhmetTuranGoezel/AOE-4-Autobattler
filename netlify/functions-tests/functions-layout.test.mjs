// Netlify treats every top-level file in the functions directory as its own
// function. A file there without a request handler breaks function detection,
// and the endpoint simply stops answering - the client then reports "the
// multiplayer backup request failed" and shows an Offline banner, which looks
// like a network problem rather than a deploy problem.
//
// That has now happened twice: once with a test file, once with the shared
// session core. Shared modules belong in netlify/lib, which is not scanned.

import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = fileURLToPath(new URL("../functions/", import.meta.url));

test("every top-level file in netlify/functions is a real function", async () => {
  const entries = await readdir(FUNCTIONS_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  assert.ok(files.length > 0, "expected at least one function");

  for (const name of files) {
    const source = await readFile(FUNCTIONS_DIR + name, "utf8");
    assert.match(
      source,
      /export\s+default\s/,
      `${name} sits in netlify/functions but exports no default handler. ` +
      `Netlify will try to publish it as a function and fail. ` +
      `Shared modules go in netlify/lib; tests go in netlify/functions-tests.`
    );
  }
});

test("no test files are left in the functions directory", async () => {
  const entries = await readdir(FUNCTIONS_DIR, { withFileTypes: true });
  const tests = entries.filter((e) => e.isFile() && /\.test\.mjs$/.test(e.name));
  assert.deepEqual(tests.map((e) => e.name), [],
    "test files in netlify/functions get bundled as functions");
});

test("each function declares the route the client actually calls", async () => {
  // The client posts to /api/civ-session/<gameId> and /api/pc-sync/<code>.
  // These are Functions v2 config routes, not _redirects rules, so losing the
  // config export silently 404s the endpoint while the deploy still succeeds.
  const expected = {
    "civ-session.mjs": "/api/civ-session/:gameId",
    "pc-sync.mjs": "/api/pc-sync/:code"
  };
  for (const [file, route] of Object.entries(expected)) {
    const source = await readFile(FUNCTIONS_DIR + file, "utf8");
    assert.ok(
      source.includes(`path: "${route}"`),
      `${file} must keep its config path ${route}; the client has it hard-coded.`
    );
  }
});
