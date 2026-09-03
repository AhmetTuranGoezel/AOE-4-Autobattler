#!/usr/bin/env node
"use strict";

// Render the production focus-row CSS in Chrome at the acceptance viewports.
// This deliberately uses an isolated DOM fixture: runtime/network/setup work
// can continue independently while this small presentation contract stays
// deterministic.
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const APP = path.resolve(__dirname, "..");
const STYLE = path.join(APP, "style.css");
const FOCUS_BAR = path.join(APP, "assets/tts-web/tokens",
  "asset__image-face__ugc-1658972912263156766__c62f7490e9197040.webp");
const CARD = path.join(APP, "assets/tts-web/cards/focus",
  "astrology__deck-216-cell-03__5d799f9ae4a4bc96.webp");
const VIEWPORTS = [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [768, 1024]];
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"
].find(fs.existsSync);

function fixture() {
  const cards = ["culture", "growth", "science", "economy", "military", "industry"]
    .map((type, index) => `<div class="fcard has-art type-${type}" role="button" tabindex="0"
      aria-label="Play card, ${type} tier 1, focus slot ${Math.max(1, index)}"
      style="background-image:url('/card.webp')">
      <div class="fc-live"></div>
      <div class="fc-header"><span class="fc-type">${type}</span><span class="fc-tier-roman">I</span></div>
      <div class="fc-body"><div class="fc-cardname">Card ${index + 1}</div></div>
      <div class="fc-footer"><span class="fc-dots">${"<span class=\"trade-empty\">0</span>".repeat(4)}</span></div>
    </div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head>
  <body><div id="game" class="panel-game">
    <header id="header"><span id="hdr-title">Civ: New Dawn</span><span id="hdr-room">Room</span>
      <span class="net-status synced">Synchronized</span><span id="hdr-round">Round 1</span>
      <span id="hdr-turn">Player turn</span><button>Undo Turn</button><button>Civilization</button>
      <button>Wonders</button><button>Players</button><button>Diplomacy</button><button>Log</button><button>New Game</button>
    </header>
    <div id="layout"><aside id="left-panel"><div class="player-card">Player tableau</div></aside>
      <main id="map-container"><div id="map"></div><div id="map-tooltip" class="hidden"></div></main></div>
    <footer id="focus-bar"><div id="focus-row" class="has-board-art"
      style="--focus-board-art:url('/focusbar.webp')">${cards}</div></footer>
  </div><pre id="result"></pre><script>
  setTimeout(() => {
    const cards = [...document.querySelectorAll("#focus-row .fcard")];
    const rects = cards.map((card) => card.getBoundingClientRect());
    const bar = document.getElementById("focus-bar").getBoundingClientRect();
    const map = document.getElementById("map-container").getBoundingClientRect();
    const row = document.getElementById("focus-row");
    const focusBoard = getComputedStyle(row, "::before");
    const first = cards[0];
    const tip = document.getElementById("map-tooltip");
    tip.innerHTML = '<div class="cface has-art" style="background-image:url(/card.webp)"></div>';
    tip.classList.add("card-face"); tip.classList.remove("hidden");
    const firstRect = first.getBoundingClientRect();
    const previewSize = tip.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(4, firstRect.left), innerWidth - previewSize.width - 8) + "px";
    tip.style.top = Math.max(4, firstRect.top - previewSize.height - 8) + "px";
    const preview = tip.getBoundingClientRect();
    const report = {
      innerWidth, innerHeight, count: cards.length,
      ordered: rects.every((rect, index) => !index || rect.left >= rects[index - 1].right - 0.5),
      minGap: Math.min(...rects.slice(1).map((rect, index) => rect.left - rects[index].right)),
      inside: rects.every((rect) => rect.left >= -0.5 && rect.right <= innerWidth + 0.5 &&
        rect.top >= bar.top - 0.5 && rect.bottom <= bar.bottom + 0.5),
      labels: cards.every((card) => /tier [1-4].*focus slot [1-5]/i.test(card.ariaLabel || "")),
      tradeTracks: cards.every((card) => {
        const dots = [...card.querySelectorAll(".fc-dots > span")];
        return dots.length === 4 && dots.every((dot) => dot.getBoundingClientRect().width >= 8);
      }),
      focusBoard: focusBoard.backgroundImage !== "none" && parseFloat(focusBoard.height) >= 35,
      preview: preview.left >= -0.5 && preview.right <= innerWidth + 0.5 &&
        preview.top >= -0.5 && preview.bottom <= innerHeight + 0.5 && preview.width >= 230,
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 && row.scrollWidth <= row.clientWidth + 1,
      minCardWidth: Math.min(...rects.map((rect) => rect.width)),
      minCardHeight: Math.min(...rects.map((rect) => rect.height)),
      mapWidth: map.width, mapHeight: map.height
    };
    document.getElementById("result").textContent = btoa(JSON.stringify(report));
  }, 100);
  </script></body></html>`;
}

function runChrome(url, width, height) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "civ-focus-layout-"));
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
    "--incognito", `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    "--virtual-time-budget=1500", "--dump-dom", url];
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Chrome timed out")); }, 20000);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* release race */ }
      if (code) return reject(new Error(`Chrome exited ${code}: ${errors.trim().slice(0, 500)}`));
      const match = output.match(/<pre id="result">([^<]+)<\/pre>/);
      if (!match) return reject(new Error("render result missing: " + output.slice(-800)));
      resolve(JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
    });
  });
}

(async () => {
  if (!CHROME) { console.log("focus-layout-test: Chrome/Edge not found"); process.exitCode = 1; return; }
  const html = fixture();
  const server = http.createServer((req, res) => {
    const files = { "/style.css": [STYLE, "text/css"], "/focusbar.webp": [FOCUS_BAR, "image/webp"],
      "/card.webp": [CARD, "image/webp"] };
    if (files[req.url]) {
      res.writeHead(200, { "content-type": files[req.url][1] });
      fs.createReadStream(files[req.url][0]).pipe(res); return;
    }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  let failed = 0;
  try {
    for (const [width, height] of VIEWPORTS) {
      const report = await runChrome(base, width, height);
      const pass = report.count === 6 && report.ordered && report.minGap >= 3 && report.inside &&
        report.labels && report.tradeTracks && report.focusBoard && report.preview && report.noOverflow &&
        report.minCardWidth >= 115 && report.minCardHeight >= 178 &&
        report.mapWidth >= 300 && report.mapHeight >= 280;
      if (!pass) failed++;
      console.log(`${pass ? "PASS" : "FAIL"} ${width}x${height}: ` +
        `${report.minCardWidth.toFixed(0)}x${report.minCardHeight.toFixed(0)} cards, ` +
        `${report.mapWidth.toFixed(0)}x${report.mapHeight.toFixed(0)} map`);
      if (!pass) console.log("  " + JSON.stringify(report));
    }
  } finally {
    server.close();
  }
  console.log(`focus-layout-test: ${VIEWPORTS.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
