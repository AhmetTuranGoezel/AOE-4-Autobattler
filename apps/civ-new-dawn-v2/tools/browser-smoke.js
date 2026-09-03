#!/usr/bin/env node
"use strict";

// Drives the REAL app in a REAL browser and plays a turn.
//
// Everything else in tools/ proves the engine agrees with itself. This proves
// the thing a person actually touches: the page loads, Local Solo starts, setup
// runs, a focus card resolves, and the turn moves on. No dependencies - Chrome
// is driven over CDP with node's built-in WebSocket.
//
//   node tools/browser-smoke.js            headless (default)
//   node tools/browser-smoke.js --headed   watch it happen
//   node tools/browser-smoke.js --keep     leave the browser open at the end

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const APP = path.resolve(__dirname, "..");
const HEADED = process.argv.includes("--headed");
const KEEP = process.argv.includes("--keep");

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
];

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mjs": "text/javascript"
};

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(["PASS", name, ""]); }
  else { fail++; results.push(["FAIL", name, detail === undefined ? "" : String(detail)]); }
}

// tools/dev-session-server.mjs already serves the app AND /api/civ-session
// through the real session core. A plain static server 404s that endpoint,
// which is exactly the "multiplayer backup request failed" the dev server was
// written to avoid - so the smoke test drives the same rig a person would.
function serve() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => {
        const child = spawn(process.execPath,
          [path.join(__dirname, "dev-session-server.mjs"), String(port)],
          { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        const done = (ok) => ok
          ? resolve({ server: { close: () => child.kill() }, port })
          : reject(new Error("dev-session-server did not start:\n" + out));
        child.stdout.on("data", (b) => {
          out += b;
          if (/listening|http:\/\//i.test(String(b))) done(true);
        });
        child.stderr.on("data", (b) => { out += b; });
        child.on("exit", () => { if (!out.match(/listening|http:/i)) done(false); });
        setTimeout(() => { if (!out.match(/listening|http:/i)) done(false); }, 12000);
      });
    });
  });
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = []; this.errors = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === "Runtime.consoleAPICalled") {
        cdp.logs.push((msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        cdp.errors.push(d.exception?.description || d.text || "unknown error");
      }
    };
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    return cdp;
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      // async so an expression that returns a promise is awaited rather than
      // stringified as "{}" - UI.dispatch is async, and every setup step is.
      expression: `(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({__err: String(e && e.stack || e)}); } })()`,
      awaitPromise: true, returnByValue: true
    });
    const raw = r.result?.value;
    if (raw === undefined) return undefined;
    const v = JSON.parse(raw);
    if (v && v.__err) throw new Error(v.__err);
    return v;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cdp, expr, label, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await cdp.eval(expr)) return true; } catch (e) { /* page mid-render */ }
    await sleep(120);
  }
  return false;
}

(async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("No Chrome/Edge found; skipping browser smoke."); return; }

  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  const userDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "civ-smoke-"));
  const args = [
    `--remote-debugging-port=0`, `--user-data-dir=${userDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking", "--disable-gpu", "--mute-audio",
    "--window-size=1440,900"
  ];
  if (!HEADED) args.push("--headless=new");
  args.push(base);

  const proc = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
  let devtoolsUrl = null;
  proc.stderr.on("data", (b) => {
    const m = String(b).match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) devtoolsUrl = m[1];
  });

  const started = Date.now();
  while (!devtoolsUrl && Date.now() - started < 20000) await sleep(150);
  if (!devtoolsUrl) {
    console.log("Chrome did not report a DevTools endpoint.");
    proc.kill(); server.close(); process.exitCode = 1; return;
  }
  const hostPort = devtoolsUrl.split("/devtools/")[0].replace("ws://", "");
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await getJSON(`http://${hostPort}/json/list`);
      target = list.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"));
    } catch (e) { /* not up yet */ }
    if (!target) await sleep(150);
  }
  if (!target) {
    console.log("No page target found."); proc.kill(); server.close(); process.exitCode = 1; return;
  }

  const cdp = await CDP.attach(target.webSocketDebuggerUrl);

  try {
    // ---- load ----------------------------------------------------------
    ok("page loads and the app object exists",
      await waitFor(cdp, "typeof UI === 'object' && typeof Game === 'object'", "boot"));
    ok("rules data reached the browser", (await cdp.eval("Game.ALL_WONDERS.length")) === 36);
    ok("no uncaught exception during boot", cdp.errors.length === 0, cdp.errors[0]);

    // ---- the fifth seat's colour is actually selectable -----------------
    // Terra seats five. Purple existed in the engine, in SEAT_COLORS and as a
    // full set of assets while the markup listed four, so the fifth player
    // could not be chosen at all. This asserts the real <select>, not the data.
    const colorPicker = await cdp.eval(`(() => {
      const sel = document.getElementById("inp-color");
      if (!sel) return { missing: true };
      const opts = [...sel.options].map((o) => ({ value: o.value.toLowerCase(), label: o.textContent.trim() }));
      sel.value = "#8b62b5";
      return { opts, purpleSticks: sel.value.toLowerCase() === "#8b62b5" };
    })()`);
    ok("the colour picker offers five colours",
      colorPicker.opts && colorPicker.opts.length === 5, JSON.stringify(colorPicker.opts));
    ok("Purple appears in colour selection",
      !!(colorPicker.opts || []).find((o) => /purple/i.test(o.label)), JSON.stringify(colorPicker.opts));
    ok("Purple can actually be selected in the real control", colorPicker.purpleSticks === true);
    ok("every printed component colour is offered", (() => {
      const want = ["#169eae", "#d94747", "#e88b24", "#76a94f", "#8b62b5"];
      const have = (colorPicker.opts || []).map((o) => o.value);
      return want.every((v) => have.includes(v));
    })(), JSON.stringify(colorPicker.opts));
    ok("purple resolves to its own components, not another colour's",
      await cdp.eval(`(() => {
        const p = "#8b62b5", b = "#169eae";
        if (!window.CivCardArt) return false;
        return CivCardArt.colorId(p) === "purple" &&
          !!CivCardArt.control(p, false) &&
          CivCardArt.control(p, false) !== CivCardArt.control(b, false) &&
          !!CivCardArt.piece("city", p) &&
          CivCardArt.piece("city", p) !== CivCardArt.piece("city", b);
      })()`));

    // ---- Local Solo ----------------------------------------------------
    const soloBtn = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /solo/i.test(x.textContent));
      return b ? b.id || b.textContent.trim() : null;
    })()`);
    ok("a Local Solo entry point exists in the real DOM", !!soloBtn, soloBtn);
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /solo/i.test(x.textContent));
      if (b) b.click(); return true;
    })()`);
    ok("Local Solo produced a lobby state",
      await waitFor(cdp, "UI.debugState && UI.debugState().phase === 'lobby'", "solo lobby") ||
      await waitFor(cdp, "document.body.innerHTML.includes('Solo Game')", "solo lobby"));

    // ---- start the game (must NOT require Ready) -----------------------
    const startInfo = await cdp.eval(`(() => {
      const b = document.getElementById('lobby-start');
      return b ? { found: true, disabled: b.disabled, title: b.title || '', text: b.textContent.trim() } : { found: false };
    })()`);
    ok("the Begin/Start button is present", startInfo.found, JSON.stringify(startInfo));
    ok("it is ENABLED with no ready requirement", startInfo.found && !startInfo.disabled,
      JSON.stringify(startInfo));
    ok("no ready wording anywhere in the lobby",
      !(await cdp.eval("/mark ready|must be ready|everyone.*ready/i.test(document.body.innerText)")));

    await cdp.eval("(() => { document.getElementById('lobby-start').click(); return true; })()");
    const inSetupOrPlaying = await waitFor(cdp,
      "/setup|playing/.test(document.body.innerText.toLowerCase()) || !!document.querySelector('canvas')",
      "setup", 10000);
    ok("clicking Begin leaves the lobby", inSetupOrPlaying);
    ok("still no uncaught exception after starting", cdp.errors.length === 0, cdp.errors[0]);

    // Report what phase the app actually reached, via its own log text.
    const phaseText = await cdp.eval(`(() => {
      const el = document.getElementById('hdr-round') || document.querySelector('.wiz-title');
      return el ? el.textContent.trim() : document.body.innerText.slice(0, 120);
    })()`);
    results.push(["INFO", "phase after Begin", String(phaseText)]);

    // ---- play through setup --------------------------------------------
    // Setup is fortress then tile placement, both canvas hit-testing. Those go
    // through UI.dispatch - the same call the click handler makes, so the
    // client -> authorize -> reduce path is real - while the focus card below
    // is a genuine DOM click.
    const setupReport = await cdp.eval(`(async () => {
      const steps = [];
      for (let i = 0; i < 80; i++) {
        const st = UI.debugState();
        if (!st || st.phase !== "setup") break;
        const me = st.setup.order[st.setup.turnIndex];
        const phase = st.setup.phase;
        if (phase === "fortress") {
          const spots = [...Game.getValidFortressHexes(st)];
          if (!spots.length) { steps.push("fortress: no legal space"); break; }
          const r = await UI.dispatch({ type: "PLACE_FORTRESS", payload: { playerId: me, hexKey: spots[0] } });
          steps.push("fortress " + spots[0] + " " + (r && r.status));
          if (!r || r.status !== "accepted") break;
        } else if (phase === "tile" || phase === "capital_tile" || phase === "draft_tile") {
          const hand = phase === "draft_tile"
            ? (st.setup.draftTiles[me] || []) : (st.setup.playerTiles[me] || []);
          if (!hand.length) { steps.push(phase + ": empty hand"); break; }
          // Same packet the click handler sends: anchorKey + rotation + side.
          // Every anchor/rotation is tried because the harness is not holding
          // the tile at a particular angle the way a player is.
          let placed = false;
          outer:
          for (const tileId of hand) {
            for (let rot = 0; rot < 6; rot++) {
              const anchors = Game.getValidTileAnchors(st, tileId, rot) || [];
              for (const anchorKey of [...anchors]) {
                for (const side of ["A", "B"]) {
                  const res = await UI.dispatch({ type: "PLACE_TILE", payload: {
                    playerId: me, tileId, anchorKey, rotation: rot, side } });
                  if (res && res.status === "accepted") {
                    placed = true;
                    steps.push(phase + " " + tileId + side + " @" + anchorKey + " rot" + rot);
                    break outer;
                  }
                }
              }
            }
          }
          if (!placed) { steps.push(phase + ": nothing placeable"); break; }
        } else {
          steps.push("unhandled setup phase: " + phase); break;
        }
      }
      const st = UI.debugState();
      return { phase: st && st.phase, setupPhase: st && st.setup && st.setup.phase, steps };
    })()`);
    ok("setup ran to completion and the game reached play",
      setupReport.phase === "playing", JSON.stringify(setupReport).slice(0, 400));
    results.push(["INFO", "setup placements", String((setupReport.steps || []).length)]);

    if (setupReport.phase === "playing") {
      const cards = await cdp.eval(
        "[...document.querySelectorAll('.fcard:not(.disabled)')].map((e) => e.dataset.card)");
      ok("the focus row offers playable cards in the DOM",
        Array.isArray(cards) && cards.length > 0, JSON.stringify(cards));

      const before = await cdp.eval(
        "(() => { const s = UI.debugState(); const p = Game.currentPlayer(s); return { id: p.id, cardPlayed: p.cardPlayed, tech: p.tech }; })()");
      await cdp.eval(`(() => {
        const all = [...document.querySelectorAll('.fcard:not(.disabled)')];
        const el = all.find((e) => e.dataset.card === 'science') || all[0];
        if (el) el.click();
        return true;
      })()`);
      // A card with no trade tokens on it needs no decision, so the click
      // resolves it immediately instead of opening the panel. Either outcome
      // means the click was heard; what matters is that one of them happened.
      const reacted = await waitFor(cdp,
        "!!document.getElementById('wiz-start') || Game.currentPlayer(UI.debugState()).cardPlayed === true",
        "card reacted", 5000);
      ok("clicking a focus card either opens its panel or resolves it", reacted,
        await cdp.eval("({ wizard: !!document.getElementById('wiz-start'), title: (document.querySelector('.wiz-title')||{}).textContent })"));

      await cdp.eval("(() => { const b = document.getElementById('wiz-start'); if (b) b.click(); return true; })()");
      await sleep(700);
      const after = await cdp.eval(
        `(() => { const s = UI.debugState(); const p = Game.getPlayer(s, ${JSON.stringify(before.id)}); return { cardPlayed: p.cardPlayed, tech: p.tech, phase: s.phase }; })()`);
      ok("resolving the card changed authoritative state",
        after.cardPlayed === true || after.tech !== before.tech,
        JSON.stringify({ before, after }));

      // A focus card can leave a decision behind (a tech level offers a card).
      // A player answers it before ending the turn, so the harness does too -
      // and reports what it had to answer, because that is the real flow.
      const cleared = await cdp.eval(`(async () => {
        const answered = [];
        for (let i = 0; i < 12; i++) {
          const s = UI.debugState();
          const mine = (s.pendingChoices || []).filter((c) => c.playerId === Game.currentPlayer(s).id);
          if (!mine.length) break;
          const c = mine[0];
          const payload = { playerId: c.playerId, choiceId: c.id };
          if (c.options && c.options.length) payload.optionId = c.options[0].id;
          else if (c.hexKeys && c.hexKeys.length) payload.hexKey = c.hexKeys[0];
          const r = await UI.dispatch({ type: "RESOLVE_PENDING_CHOICE", payload });
          answered.push(c.kind + ":" + (r && r.status));
          if (!r || r.status !== "accepted") break;
        }
        return answered;
      })()`);
      if (cleared.length) results.push(["INFO", "decisions answered before ending", cleared.join(", ")]);

      const ended = await cdp.eval(`(async () => {
        const s0 = UI.debugState();
        const idx0 = s0.turn.index, round0 = s0.turn.round;
        const cp = Game.currentPlayer(s0);
        const perm = Game.getActionPermission
          ? Game.getActionPermission(s0, { type: "END_TURN", payload: {} }, { actorId: cp.id })
          : null;
        const r = await UI.dispatch({ type: "END_TURN", payload: { playerId: cp.id } });
        const s1 = UI.debugState();
        return { accepted: r && r.status, reason: r && r.message,
                 permission: perm, cardPlayed: cp.cardPlayed,
                 pending: (s0.pendingChoices || []).length,
                 movedOn: s1.turn.index !== idx0 || s1.turn.round !== round0, round: s1.turn.round };
      })()`);
      ok("the turn can be ended and play moves on",
        ended.accepted === "accepted" && ended.movedOn, JSON.stringify(ended));
      ok("no uncaught exception across a full turn", cdp.errors.length === 0, cdp.errors[0]);
    }

    // ---- multiplayer lobby ----------------------------------------------
    // The real join is a PeerJS connection to a public broker, which needs the
    // internet and is not something a smoke test should depend on. The seat
    // logic underneath it is testable though: a second seat arrives as
    // ADD_PLAYER, which is exactly what the network path applies on the host.
    await cdp.send("Page.reload");
    await waitFor(cdp, "typeof UI === 'object' && typeof Game === 'object'", "reload", 10000);
    const mp = await cdp.eval(`(async () => {
      const out = { peerAvailable: typeof Peer !== "undefined" };
      const btn = document.getElementById("btn-create");
      out.createButton = !!btn;
      if (btn) {
        btn.click();
        // Creating a room opens a PeerJS connection to a public broker, so the
        // lobby appears when that resolves, not on the click.
        for (let i = 0; i < 120; i++) {
          const s = UI.debugState();
          if (s && s.phase === "lobby") break;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      out.status = (document.getElementById("lobby-status") || {}).textContent || "";
      const st = UI.debugState();
      out.reachedLobby = !!(st && st.phase === "lobby");
      out.solo = !!(st && st.solo);
      out.seats = st ? st.players.length : 0;
      out.minPlayers = Game.CFG.minPlayers;
      if (out.reachedLobby) {
        const r = await UI.dispatch({ type: "ADD_PLAYER",
          payload: { id: "guest-2", name: "Guest", color: "#d94747" } });
        out.addSecond = r && r.status;
        const st2 = UI.debugState();
        out.seatsAfter = st2.players.length;
        out.nobodyReady = st2.players.every((p) => !p.ready);
        // Ask the engine directly whether the game may begin with nobody ready.
        // START_GAME is a host action, so the context needs the host role the
        // real transport supplies.
        const perm = Game.getActionPermission(st2,
          { type: "START_GAME", payload: {} },
          { actorId: st2.players[0].id, role: "host" });
        out.startPermitted = !!(perm && perm.ok);
        out.startCode = perm && perm.code;
        out.startMessage = perm && perm.message;
      }
      return out;
    })()`);
    ok("Create Room reaches a multiplayer lobby", mp.reachedLobby && !mp.solo, JSON.stringify(mp));
    ok("a second seat can join", mp.addSecond === "accepted" && mp.seatsAfter === 2, JSON.stringify(mp));
    ok("nobody is marked ready", mp.nobodyReady === true);
    ok("and the engine still permits START_GAME with nobody ready",
      mp.startPermitted === true, JSON.stringify({ code: mp.startCode }));
    const mpStart = await cdp.eval(`(() => {
      const b = document.getElementById("lobby-start");
      return b ? { disabled: b.disabled, title: b.title || "" } : { missing: true };
    })()`);
    // The seat added above never opened a PeerJS connection, so the client
    // correctly reads it as offline and holds the start for it. What matters
    // here is that nothing anywhere blocks on READINESS.
    ok("the host's Start button is never blocked on readiness",
      mpStart.disabled === false || !/ready/i.test(mpStart.title), JSON.stringify(mpStart));
    results.push(["INFO", "start button at 2 seats", JSON.stringify(mpStart)]);
    results.push(["INFO", "PeerJS present", String(mp.peerAvailable)]);

    // ---- screenshot for the record -------------------------------------
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(require("os").tmpdir(), "civ-smoke.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    results.push(["INFO", "screenshot", shotPath]);
  } catch (err) {
    fail++;
    results.push(["FAIL", "harness error", err.message]);
  }

  console.log("browser-smoke (real Chrome, real DOM):");
  results.forEach(([s, n, d]) => console.log(`  ${s.padEnd(4)} ${n}${d ? "  [" + d + "]" : ""}`));
  if (cdp.errors.length) {
    console.log("  page errors:");
    cdp.errors.slice(0, 5).forEach((e) => console.log("    " + e.split("\n")[0]));
  }
  console.log(`  ${pass} passed, ${fail} failed`);

  if (!KEEP) { proc.kill(); }
  server.close();
  process.exitCode = fail ? 1 : 0;
})();
