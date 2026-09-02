#!/usr/bin/env node
"use strict";

// The lobby is an entry point, not a game rule. A previous change made
// START_GAME depend on a Ready button that was hidden, which made every online
// table impossible to start. Keep the engine and the shipped markup aligned.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const game = read("game.js");
const ui = read("ui.js");
const html = read("index.html");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const startBranch = game.match(/if \(type === "START_GAME"\) \{([\s\S]*?)\n\s*\}/);
assert(startBranch, "START_GAME handler is missing");
assert(!/\.ready\b|SET_READY/.test(startBranch[1]),
  "START_GAME must not depend on a separate ready ceremony");
assert(!/id=["']btn-ready["']/.test(html),
  "the removed ready control must not return without an engine/UI contract");
assert(!/Waiting for .*mark ready|withdraw your ready|mark yourself ready/i.test(ui),
  "the UI still contains a hidden ready gate");
assert(/Need at least \$\{min\} players to start/.test(ui),
  "the lobby must explain the real minimum-player blocker");
assert(/Every seated player must be online before starting/.test(ui),
  "online tables must explain the reconnect blocker");

console.log("lobby-contract-test: start flow has no ready deadlock");
