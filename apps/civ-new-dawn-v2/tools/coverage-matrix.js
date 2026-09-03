#!/usr/bin/env node
"use strict";

// How many of the 124 card/ability effects are actually PROVEN.
//
// The previous version of this file counted a card as covered when its name
// appeared anywhere in test.html. That is not evidence: a name in a comment, in
// an unrelated assertion, or in a whitelist all counted. It reported 69/124 for
// a game with known-broken effects.
//
// This version counts nothing but explicit proof ids. A test declares
// proves("wonder.science.amundsen_scott") after it has performed the effect and
// asserted the resulting state; the harness refuses a proof with no assertions
// behind it, and drops every proof if the suite is red. Here we only compare
// two lists:
//
//   required  - tools/effect-registry.js, derived from rules-data.js
//   proven    - what the harness actually declared
//
// There are no whitelists and no accepted-unimplemented entries. An effect
// without a proof is UNPROVEN, and says so by name.
//
//   node tools/coverage-matrix.js                 report, exit 0
//   node tools/coverage-matrix.js --list          also list proven ids
//   node tools/coverage-matrix.js --require-all   exit 1 unless 124/124
//   node tools/coverage-matrix.js --require "Standard Focus"
//                                                 exit 1 unless that category
//                                                 is complete

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..");
const registry = require("./effect-registry.js");

// Run the browser harness exactly as tools/rule-test-runner.js does, and read
// the proofs it published. Running it is the point: a proof only exists if the
// assertions behind it actually passed just now.
function runHarness() {
  const items = [];
  const nodes = {
    results: { appendChild(node) { items.push(node); } },
    summary: { textContent: "" }
  };
  const document = {
    getElementById(id) { return nodes[id] || null; },
    createElement() { return { className: "", textContent: "" }; }
  };
  const context = vm.createContext({
    console, document, structuredClone, crypto: globalThis.crypto,
    TextEncoder, TextDecoder, URL, setTimeout, clearTimeout
  });
  context.window = context;
  context.globalThis = context;
  for (const file of ["rules-data.js", "tile-art.js", "game.js"]) {
    vm.runInContext(fs.readFileSync(path.join(APP, file), "utf8"), context, { filename: file });
  }
  const html = fs.readFileSync(path.join(APP, "test.html"), "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const block of blocks) vm.runInContext(block, context, { filename: "test.html" });
  return context.__CIV_PROOFS__ || { passed: 0, failed: 0, proofs: [], proofErrors: [] };
}

const listProven = process.argv.includes("--list");
const requireAll = process.argv.includes("--require-all");
const requireIndex = process.argv.indexOf("--require");
const requireCategory = requireIndex >= 0 ? process.argv[requireIndex + 1] : null;

const problems = registry.registryProblems(registry.EFFECTS);
const harness = runHarness();

const requiredIds = new Map(registry.EFFECTS.map((e) => [e.id, e]));
const provenCounts = new Map();
const invalid = [];
harness.proofs.forEach((proof) => {
  if (!requiredIds.has(proof.id)) { invalid.push(proof.id); return; }
  provenCounts.set(proof.id, (provenCounts.get(proof.id) || 0) + 1);
});

const byCategory = {};
registry.CATEGORIES.forEach((c) => { byCategory[c] = { proven: [], unproven: [] }; });
registry.EFFECTS.forEach((effect) => {
  const bucket = byCategory[effect.category];
  if (provenCounts.has(effect.id)) bucket.proven.push(effect);
  else bucket.unproven.push(effect);
});

const totalProven = registry.EFFECTS.filter((e) => provenCounts.has(e.id)).length;

console.log(`coverage-matrix: harness ${harness.passed} passed, ${harness.failed} failed`);
console.log(`behaviourally proven card/ability effects: ${totalProven}/${registry.TOTAL}`);
console.log("");
registry.CATEGORIES.forEach((category) => {
  const bucket = byCategory[category];
  const total = bucket.proven.length + bucket.unproven.length;
  console.log(`  ${String(bucket.proven.length).padStart(3)}/${String(total).padEnd(3)} ${category}`);
});

if (listProven) {
  console.log("\nproven:");
  registry.CATEGORIES.forEach((category) => {
    byCategory[category].proven.forEach((e) => {
      const n = provenCounts.get(e.id);
      console.log(`  ${e.id}${n > 1 ? `  (${n} tests)` : ""}   ${e.label}`);
    });
  });
}

const unprovenTotal = registry.TOTAL - totalProven;
if (unprovenTotal) {
  console.log(`\nUNPROVEN (${unprovenTotal}) - no test performs the effect and asserts the result:`);
  registry.CATEGORIES.forEach((category) => {
    const rows = byCategory[category].unproven;
    if (!rows.length) return;
    console.log(`  ${category}:`);
    rows.forEach((e) => console.log(`    ${e.id.padEnd(46)} ${e.label}`));
  });
}

const failures = [];
problems.forEach((p) => failures.push("registry: " + p));
(harness.proofErrors || []).forEach((e) => failures.push("proof: " + e));
invalid.forEach((id) => failures.push(`proof: unknown effect id "${id}" - not in the registry`));
if (harness.failed) failures.push(`harness has ${harness.failed} failing assertion(s); no proof is counted while it is red`);

if (requireCategory) {
  const bucket = byCategory[requireCategory];
  if (!bucket) failures.push(`--require named a category that does not exist: ${requireCategory}`);
  else if (bucket.unproven.length) {
    failures.push(`${requireCategory} is not complete: ${bucket.unproven.length} unproven`);
  }
}
if (requireAll && unprovenTotal) {
  failures.push(`release completeness requires ${registry.TOTAL}/${registry.TOTAL}; ${unprovenTotal} are unproven`);
}

if (failures.length) {
  console.log("\ncoverage-matrix FAILED:");
  failures.forEach((f) => console.log("  ! " + f));
  process.exitCode = 1;
} else if (unprovenTotal) {
  // Reporting a real gap is not a build failure during development. Only an
  // explicit completeness claim (--require / --require-all) turns it into one.
  console.log(`\ncoverage-matrix: ${totalProven}/${registry.TOTAL} proven, ${unprovenTotal} still to prove.`);
} else {
  console.log(`\ncoverage-matrix: all ${registry.TOTAL} effects behaviourally proven.`);
}
