#!/usr/bin/env node
"use strict";

// Runs the browser-oriented rule harness without depending on a local browser.
// test.html only needs a tiny DOM surface for reporting; the rules themselves
// remain the exact browser scripts used by the application.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appDir = path.resolve(__dirname, "..");
const resultItems = [];
const nodes = {
  results: { appendChild(node) { resultItems.push(node); } },
  summary: { textContent: "" }
};
const document = {
  getElementById(id) { return nodes[id] || null; },
  createElement(tagName) {
    return { tagName: String(tagName).toUpperCase(), className: "", textContent: "" };
  }
};

const context = vm.createContext({
  console,
  document,
  structuredClone,
  crypto: globalThis.crypto,
  TextEncoder,
  TextDecoder,
  URL,
  setTimeout,
  clearTimeout
});
context.window = context;
context.globalThis = context;

for (const filename of ["rules-data.js", "tile-art.js", "game.js"]) {
  const source = fs.readFileSync(path.join(appDir, filename), "utf8");
  vm.runInContext(source, context, { filename });
}

const html = fs.readFileSync(path.join(appDir, "test.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());
if (!scripts.length) throw new Error("No inline test script found in test.html.");
for (const source of scripts) vm.runInContext(source, context, { filename: "test.html" });

for (const item of resultItems.filter((entry) => entry.className === "fail")) {
  console.error(item.textContent);
}
console.log(nodes.summary.textContent);
process.exitCode = resultItems.some((entry) => entry.className === "fail") ? 1 : 0;
