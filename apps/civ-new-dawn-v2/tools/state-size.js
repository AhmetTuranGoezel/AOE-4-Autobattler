#!/usr/bin/env node
"use strict";

// What is actually inside a saved game, in bytes.
//
// The host backs the full state up to /api/civ-session on every action, and
// that endpoint refuses a body over 1 MiB. When it refuses, the action is
// rejected and nothing is broadcast - so an oversized save does not merely lose
// the backup, it stops multiplayer dead. This measures where the bytes go.
//
//   node tools/state-size.js            a realistic late game
//   node tools/state-size.js --json     machine-readable

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..");
const ctx = vm.createContext({ console, structuredClone, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL });
ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ["rules-data.js", "tile-art.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8") +
    (f === "game.js" ? "\n;window.Game = Game;\n" : ""), ctx, { filename: f });
}
const G = ctx.Game;
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");
const kib = (n) => (n / 1024).toFixed(1) + " KiB";

// Build a game that has actually been played: a full map, five seats, a long
// log, chat, and an undo checkpoint sitting on the state.
function lateGame(seats = 5) {
  const players = Array.from({ length: seats }, (_, i) =>
    G.createPlayer("p" + (i + 1), "Player " + (i + 1), ["#169eae", "#d94747", "#e88b24", "#76a94f", "#8b62b5"][i]));
  const st = G.createState(players);
  st.phase = "playing";
  st.turn.order = st.players.map((p) => p.id);
  st.turn.index = 0;
  st.turn.round = 12;
  // Activate the whole board the way a long game explores it.
  Object.values(st.map.hexes).forEach((h, i) => {
    h.active = true;
    h.revealed = true;
    if (i % 7 === 0) h.control = { ownerId: st.players[i % seats].id, fortified: i % 3 === 0, district: null };
    if (i % 23 === 0) h.city = { ownerId: st.players[i % seats].id, isCapital: false, developed: i % 2 === 0, hasWonder: false, wonder: null };
  });
  // A long game's log and chat.
  for (let i = 0; i < 500; i++) G.log ? null : null;
  st.log = Array.from({ length: 500 }, (_, i) => ({
    text: "Player " + ((i % seats) + 1) + " placed control markers and advanced the tech dial by three.",
    at: Date.now() - i * 1000
  }));
  st.chat = Array.from({ length: 100 }, (_, i) => ({
    seatId: "p1", name: "Player 1", text: "nice move number " + i, time: "12:00", at: Date.now() - i * 1000
  }));
  return st;
}

const st = lateGame(5);
// Arm an undo checkpoint the way a real turn does.
const armed = G.applyAction(st, { type: "END_FOCUS_CARD", payload: { playerId: "nobody" } });

const total = bytes(armed);
const rows = Object.keys(armed).map((k) => [k, bytes(armed[k])]).sort((a, b) => b[1] - a[1]);

const LIMIT = 1048576;
console.log(`full serialized state: ${kib(total)}  (${total} bytes)`);
console.log(`remote backup limit  : ${kib(LIMIT)}  -> ${total > LIMIT ? "OVER LIMIT" : "within limit"}`);
console.log("");
console.log("bytes by top-level key:");
rows.forEach(([k, n]) => {
  if (n < 200) return;
  const pct = ((n / total) * 100).toFixed(1).padStart(5);
  console.log(`  ${pct}%  ${kib(n).padStart(11)}  ${k}`);
});

// The map is normally the bulk; say what a single hex costs and how many there are.
const hexes = armed.map && armed.map.hexes ? Object.keys(armed.map.hexes).length : 0;
if (hexes) {
  console.log("");
  console.log(`map.hexes: ${hexes} hexes, ${kib(bytes(armed.map.hexes))} total, ` +
    `${Math.round(bytes(armed.map.hexes) / hexes)} bytes each`);
  const sample = armed.map.hexes[Object.keys(armed.map.hexes)[0]];
  console.log("  a hex serializes as:", JSON.stringify(sample));
}

// turnUndo is a whole second copy of the state.
if (armed.turnUndo && armed.turnUndo.snapshot) {
  console.log("");
  console.log(`turnUndo.snapshot is a FULL SECOND COPY of the state: ${kib(bytes(armed.turnUndo.snapshot))}`);
}

// What ui.js actually ships now: the same trim backupPayload() applies.
const trimmed = { ...armed };
delete trimmed.turnUndo;
const trimmedBytes = bytes(trimmed);
console.log("");
console.log("what the backup actually sends (turnUndo stripped):");
console.log(`  ${kib(trimmedBytes)}  (${trimmedBytes} bytes)  -> ` +
  `${trimmedBytes > LIMIT ? "OVER LIMIT" : "within limit"}, ` +
  `${(100 - (trimmedBytes / total) * 100).toFixed(0)}% smaller`);
console.log(`  headroom to the 1 MiB cap: ${kib(LIMIT - trimmedBytes)}`);

process.exitCode = trimmedBytes > LIMIT ? 1 : 0;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total, limit: LIMIT, byKey: Object.fromEntries(rows) }, null, 2));
}
