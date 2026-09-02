#!/usr/bin/env node
"use strict";

// One command for every gate on this app, so "is the tree green?" has a single
// answer instead of five remembered invocations.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const appDir = path.resolve(__dirname, "..");
const node = process.execPath;

const steps = [
  ["syntax", null],
  ["rules harness", "rule-test-runner.js"],
  ["coverage matrix", "coverage-matrix.js"],
  ["authorization", "authorization-test.js"],
  ["net protocol", "net-protocol-test.js"],
  ["art index", "verify-art.js"]
];

const SOURCES = ["game.js", "ui.js", "rules-data.js", "card-art.js", "tile-art.js",
  "net.js", "session-store.js", "assets/art-data.js"];

let failed = 0;
for (const [label, script] of steps) {
  process.stdout.write(label.padEnd(18));
  try {
    if (!script) {
      for (const file of SOURCES) {
        const full = path.join(appDir, file);
        if (fs.existsSync(full)) execFileSync(node, ["--check", full], { stdio: "pipe" });
      }
      console.log("ok");
      continue;
    }
    const out = execFileSync(node, [path.join(__dirname, script)], { stdio: "pipe" })
      .toString().trim().split("\n");
    console.log(out[out.length - 1]);
  } catch (err) {
    failed++;
    const text = [err.stdout && err.stdout.toString(), err.stderr && err.stderr.toString()]
      .filter(Boolean).join("\n").trim();
    console.log("FAILED");
    text.split("\n").filter((l) => /FAIL|!|Error/.test(l)).slice(0, 8)
      .forEach((l) => console.log("    " + l));
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks green");
process.exitCode = failed ? 1 : 0;
