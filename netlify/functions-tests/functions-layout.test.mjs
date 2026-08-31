// Guards on the pieces of the deploy layout that have actually bitten, and
// nothing more.
//
// A test file in netlify/functions once broke the deploy, because Netlify tries
// to bundle every top-level file there as a function; commit 4d0e571 moved it
// to netlify/functions-tests. That is the one placement rule here with evidence
// behind it. civ-session-core.mjs deliberately stays beside its function.
//
// The route paths are Functions v2 config exports, not _redirects rules, so
// dropping one silently 404s the endpoint while the deploy still succeeds - and
// the client then reports it as "the multiplayer backup request failed"
// followed by an Offline banner, which looks nothing like a routing mistake.

import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = fileURLToPath(new URL("../functions/", import.meta.url));

test("no test files are left in the functions directory", async () => {
  const entries = await readdir(FUNCTIONS_DIR, { withFileTypes: true });
  const tests = entries.filter((e) => e.isFile() && /\.test\.mjs$/.test(e.name));
  assert.deepEqual(tests.map((e) => e.name), [],
    "test files in netlify/functions get bundled as functions and broke the deploy once already");
});

test("each function declares the route the client actually calls", async () => {
  // The client has these hard-coded: session-store.js posts to
  // /api/civ-session/<gameId>, and pokemon-champions/src/sync.js to /api/pc-sync.
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

test("the session function and its core stay importable as written", async () => {
  // Cheap check that the import in civ-session.mjs still resolves to a real
  // sibling file, so a rename cannot quietly break the bundle.
  const source = await readFile(FUNCTIONS_DIR + "civ-session.mjs", "utf8");
  const match = source.match(/from\s+"\.\/([A-Za-z0-9._-]+\.mjs)"/);
  assert.ok(match, "civ-session.mjs should import its core from a sibling file");
  const names = (await readdir(FUNCTIONS_DIR, { withFileTypes: true }))
    .filter((e) => e.isFile()).map((e) => e.name);
  assert.ok(names.includes(match[1]), `${match[1]} is imported but not present`);
});
