#!/usr/bin/env node
"use strict";

// Two real browsers, one real room, turns passed back and forth.
//
// The reported bug was that the next player's browser did not update when the
// turn changed - a reload was needed. Nothing that runs in one page can catch
// that, so this opens TWO Chrome tabs against the same dev session server, has
// one host and one join, starts the game, and then checks after every END_TURN
// that the OTHER tab noticed on its own.
//
//   node tools/two-client-test.js            headless
//   node tools/two-client-test.js --headed   watch it

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const HEADED = process.argv.includes("--headed");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].find((p) => fs.existsSync(p));

let pass = 0, fail = 0;
const lines = [];
const show = (d) => d === undefined ? ""
  : (typeof d === "string" ? d : JSON.stringify(d));
const ok = (n, c, d) => {
  if (c) { pass++; lines.push(["PASS", n, ""]); }
  else { fail++; lines.push(["FAIL", n, show(d)]); }
};
const info = (n, d) => lines.push(["INFO", n, String(d)]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => {
        const child = spawn(process.execPath,
          [path.join(__dirname, "dev-session-server.mjs"), String(port)], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        const settle = (good) => good ? resolve({ child, port }) : reject(new Error("server failed:\n" + out));
        child.stdout.on("data", (b) => { out += b; if (/listening|http:\/\//i.test(String(b))) settle(true); });
        child.stderr.on("data", (b) => { out += b; });
        setTimeout(() => { if (!/listening|http:/i.test(out)) settle(false); }, 12000);
      });
    });
  });
}

class Tab {
  constructor(name, proc, cdp) { this.name = name; this.proc = proc; this.cdp = cdp; this.errors = cdp.errors; }
  static async open(name, url) {
    const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "civ-2c-"));
    const args = ["--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run",
      "--no-default-browser-check", "--disable-extensions", "--disable-gpu", "--mute-audio",
      "--window-size=1280,800"];
    if (!HEADED) args.push("--headless=new");
    args.push(url);
    const proc = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let ws = null;
    proc.stderr.on("data", (b) => { const m = String(b).match(/DevTools listening on (ws:\/\/\S+)/); if (m) ws = m[1]; });
    const t0 = Date.now();
    while (!ws && Date.now() - t0 < 25000) await sleep(150);
    if (!ws) throw new Error(name + ": no DevTools endpoint");
    const hostPort = ws.split("/devtools/")[0].replace("ws://", "");
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await (await fetch(`http://${hostPort}/json/list`)).json();
        target = list.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"));
      } catch { /* not up */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error(name + ": no page target");
    const cdp = await attach(target.webSocketDebuggerUrl);
    return new Tab(name, proc, cdp);
  }
  eval(expr) { return this.cdp.eval(expr); }
  close() { try { this.proc.kill(); } catch { /* ignore */ } }
}

async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const api = { ws, id: 0, pending: new Map(), errors: [] };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && api.pending.has(m.id)) {
      const { resolve, reject } = api.pending.get(m.id); api.pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      api.errors.push(d.exception?.description || d.text || "error");
    }
  };
  api.send = (method, params) => new Promise((resolve, reject) => {
    const id = ++api.id; api.pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  api.eval = async (expr) => {
    const r = await api.send("Runtime.evaluate", {
      expression: `(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({__err: String(e && e.stack || e)}); } })()`,
      awaitPromise: true, returnByValue: true
    });
    const raw = r.result?.value;
    if (raw === undefined) return undefined;
    const v = JSON.parse(raw);
    if (v && v.__err) throw new Error(v.__err);
    return v;
  };
  await api.send("Runtime.enable");
  return api;
}

async function waitUntil(fn, ms, step = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await sleep(step); }
  return -1;
}

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping two-client test."); return; }
  const { child: server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  let host = null, guest = null;
  try {
    host = await Tab.open("host", url);
    guest = await Tab.open("guest", url);
    for (const t of [host, guest]) {
      const booted = await waitUntil(async () => await t.eval("typeof UI === 'object' && typeof Game === 'object'"), 15000);
      ok(`${t.name}: page booted`, booted >= 0);
    }

    // ---- host creates ----------------------------------------------------
    // Creating a room needs the public PeerJS broker, which is outside this
    // repo and does throttle. A broker hiccup is not a finding about the game,
    // so try again on a fresh page rather than reporting a false failure.
    const createRoom = () => host.eval(`(async () => {
      document.getElementById("inp-name").value = "Host";
      document.getElementById("btn-create").click();
      for (let i = 0; i < 160; i++) {
        const s = UI.debugState();
        if (s && s.phase === "lobby") break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const s = UI.debugState();
      const code = (document.getElementById("lobby-code-val") || {}).textContent || "";
      return { lobby: !!(s && s.phase === "lobby"), code: code.trim(),
               status: (document.getElementById("lobby-status") || {}).textContent || "" };
    })()`);
    let room = await createRoom();
    for (let attempt = 0; attempt < 2 && !(room.lobby && room.code); attempt++) {
      info("room creation retry", JSON.stringify(room));
      await host.cdp.send("Page.reload");
      await waitUntil(async () => await host.eval("typeof UI === 'object'"), 15000);
      room = await createRoom();
    }
    ok("host created a room", room.lobby && !!room.code, JSON.stringify(room));
    info("room code", room.code);
    if (!room.code) throw new Error("no room code; cannot continue");

    // ---- guest joins -----------------------------------------------------
    const joined = await guest.eval(`(async () => {
      document.getElementById("inp-name").value = "Guest";
      document.getElementById("inp-join").value = ${JSON.stringify(room.code)};
      document.getElementById("btn-join").click();
      for (let i = 0; i < 200; i++) {
        const s = UI.debugState();
        if (s && s.players && s.players.length >= 2) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const s = UI.debugState();
      return { seats: s ? s.players.length : 0, phase: s && s.phase,
               status: (document.getElementById("lobby-status") || {}).textContent || "" };
    })()`);
    ok("guest joined the room", joined.seats === 2, JSON.stringify(joined));

    const hostSees = await waitUntil(async () =>
      (await host.eval("(UI.debugState()?.players || []).length")) === 2, 15000);
    ok("host sees the second seat", hostSees >= 0);

    // ---- host starts -----------------------------------------------------
    await host.eval(`(() => { const b = document.getElementById("lobby-start"); if (b && !b.disabled) b.click(); return true; })()`);
    const hostStarted = await waitUntil(async () =>
      ["setup", "playing"].includes(await host.eval("UI.debugState()?.phase")), 40000);
    ok("host left the lobby", hostStarted >= 0,
      await host.eval(`({
        phase: UI.debugState()?.phase,
        btn: (document.getElementById('lobby-start')||{}).title,
        seatsInState: (UI.debugState()?.players || []).map((p) => p.id),
        roster: (Net.getRoster ? Net.getRoster() : []).map((r) => r.seatId + ":" + r.status),
        mySeat: (Net.getCredentials ? Net.getCredentials().seatId : "?")
      })`));
    const guestStarted = await waitUntil(async () =>
      ["setup", "playing"].includes(await guest.eval("UI.debugState()?.phase")), 40000);
    ok("guest received the start WITHOUT reloading", guestStarted >= 0,
      await guest.eval("({ phase: UI.debugState()?.phase })"));
    info("guest saw start after", guestStarted + " ms");

    // ---- drive setup from whichever tab is active ------------------------
    const driveSetup = async () => {
      for (let step = 0; step < 60; step++) {
        const which = await Promise.all([host, guest].map(async (t) => ({
          t, mine: await t.eval(`(() => { const s = UI.debugState();
            if (!s || s.phase !== "setup") return false;
            return s.setup.order[s.setup.turnIndex] === UI.debugState().players.find((p) => p)?.id ? true : null; })()`)
        })));
        const s = await host.eval("UI.debugState()?.phase");
        if (s !== "setup") return true;
        // Whoever's turn it is drives; ask each tab whether it is theirs.
        let acted = false;
        for (const t of [host, guest]) {
          const did = await t.eval(`(async () => {
            const st = UI.debugState();
            if (!st || st.phase !== "setup") return "notsetup";
            const me = st.setup.order[st.setup.turnIndex];
            const seat = (Net.getLocalId && st.players.find((p) => p.id === me)) ? me : null;
            const mine = st.players.some((p) => p.id === me) &&
              me === (window.__seat || me);
            if (st.setup.phase === "fortress") {
              const spots = [...Game.getValidFortressHexes(st)];
              if (!spots.length) return "nospot";
              const r = await UI.dispatch({ type: "PLACE_FORTRESS", payload: { playerId: me, hexKey: spots[0] } });
              return "fortress:" + (r && r.status);
            }
            const hand = st.setup.phase === "draft_tile"
              ? (st.setup.draftTiles[me] || []) : (st.setup.playerTiles[me] || []);
            for (const tileId of hand) {
              for (let rot = 0; rot < 6; rot++) {
                for (const anchorKey of [...(Game.getValidTileAnchors(st, tileId, rot) || [])]) {
                  for (const side of ["A", "B"]) {
                    const r = await UI.dispatch({ type: "PLACE_TILE", payload: {
                      playerId: me, tileId, anchorKey, rotation: rot, side } });
                    if (r && r.status === "accepted") return "tile:" + tileId + side;
                  }
                }
              }
            }
            return "nothing";
          })()`);
          if (did && /accepted|tile:/.test(String(did))) { acted = true; break; }
        }
        if (!acted) await sleep(250);
      }
      return (await host.eval("UI.debugState()?.phase")) === "playing";
    };
    const reachedPlay = await driveSetup();
    ok("setup completed with two seats", reachedPlay,
      await host.eval("({ phase: UI.debugState()?.phase, sp: UI.debugState()?.setup?.phase })"));

    if (reachedPlay) {
      const guestPlaying = await waitUntil(async () =>
        (await guest.eval("UI.debugState()?.phase")) === "playing", 15000);
      ok("guest reached play without reloading", guestPlaying >= 0);

      // ---- pass turns back and forth --------------------------------------
      // A leader or start-of-turn effect can queue a decision the moment play
      // begins, and an open decision correctly disables the focus row for
      // everyone (game.js denies with decision_pending, and renderFocusRow
      // mirrors it). A player answers it before choosing a card, so the harness
      // does too - otherwise the row is dead and it looks like a sync failure.
      const drainChoices = async () => {
        const answered = [];
        for (let i = 0; i < 20; i++) {
          const open = await host.eval("((UI.debugState().pendingChoices || []).length)");
          if (!open) break;
          let progressed = false;
          for (const t of [host, guest]) {
            const r = await t.eval(`(async () => {
              const s = UI.debugState();
              const seat = Net.getCredentials ? Net.getCredentials().seatId : null;
              const c = (s.pendingChoices || []).find((x) => x.playerId === seat);
              if (!c) return null;
              const p = { playerId: seat, choiceId: c.id };
              if (c.options && c.options.length) p.optionId = c.options[0].id;
              else if (c.hexKeys && c.hexKeys.length) p.hexKey = c.hexKeys[0];
              const res = await UI.dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: p });
              return c.kind + ":" + (res && res.status);
            })()`);
            if (r) { answered.push(r); if (/accepted/.test(r)) progressed = true; }
          }
          if (!progressed) break;
        }
        return answered;
      };
      const preAnswered = await drainChoices();
      if (preAnswered.length) info("decisions open at game start", preAnswered.join(", "));

      for (let round = 0; round < 4; round++) {
        await drainChoices();
        const cur = await host.eval("(() => { const s = UI.debugState(); return { id: Game.currentPlayer(s).id, idx: s.turn.index, round: s.turn.round }; })()");
        // Neither tab is asked which seat it owns; both attempt the turn and
        // the permission table refuses the one that has no business playing it.
        // That is also a check in itself - if both were accepted, seat binding
        // would be broken.
        const attempts = [];
        for (const t of [host, guest]) {
          // Stop at the first acceptance. Both tabs are offered the turn so the
          // one with no right to it is seen being refused, but once a turn has
          // actually been played it PASSES to the other seat - so letting the
          // second tab go on would just be it legitimately playing the next
          // turn, which is not what this assertion is about.
          if (attempts.some((a) => a.res && a.res.status === "accepted")) break;
          attempts.push({ tab: t, res: await t.eval(`(async () => {
          const s = UI.debugState();
          const me = Game.currentPlayer(s).id;
          // Science resolves entirely in the panel; every other card wants the
          // board. Prefer it so a normal turn completes the normal way.
          const playable = [...document.querySelectorAll('.fcard:not(.disabled)')];
          const el = playable.find((e) => e.dataset.card === 'science') || playable[0];
          if (!el) {
            // Report exactly what renderFocusRow's canPlay is made of, so a
            // dead row says WHY instead of just "no card".
            const cp = Game.currentPlayer(s);
            const mine = Game.getPlayer(s, me);
            return { status: "rejected", why: "no playable card in this tab",
              cards: 0, cardPlayed: mine && mine.cardPlayed, pending: (s.pendingChoices || []).length,
              canPlayInputs: {
                currentPlayer: cp && cp.id,
                phase: s.phase,
                combat: !!s.combat,
                activeCard: s.activeCard ? s.activeCard.playerId : null,
                pendingExploration: !!s.pendingExploration,
                movementContinuation: !!s.movementContinuation,
                pendingBarbReward: !!s.pendingBarbReward,
                choiceOwners: (s.pendingChoices || []).map((c) => c.playerId),
                totalFcards: document.querySelectorAll('.fcard').length,
                who: UI.debugInfo ? UI.debugInfo() : null
              } };
          }
          el.click();
          // Over the network a card resolution is a round trip through the host
          // and its checkpoint, so wait for the card to actually be spent
          // instead of guessing a delay. END_TURN is refused until it is.
          for (let i = 0; i < 40; i++) {
            const b = document.getElementById('wiz-start');
            if (b) b.click();
            const p = Game.getPlayer(UI.debugState(), me);
            if (p && p.cardPlayed) break;
            await new Promise((r) => setTimeout(r, 150));
          }
          // Culture, military and economy all hand control to the BOARD - place
          // markers, move figures - which this harness cannot do, so the card
          // sits half-resolved and the row stays disabled. Base p16 allows
          // resolving a card for no effect, and the panel offers exactly that
          // (it asks once, then commits). Use it to finish the turn honestly
          // rather than leaving the seat stuck.
          if (!Game.getPlayer(UI.debugState(), me).cardPlayed) {
            for (let i = 0; i < 30; i++) {
              const n = document.getElementById('wiz-nothing');
              if (n) n.click();
              const p = Game.getPlayer(UI.debugState(), me);
              if (p && p.cardPlayed) break;
              await new Promise((r) => setTimeout(r, 150));
            }
          }
          for (let i = 0; i < 10; i++) {
            const st = UI.debugState();
            const mineChoice = (st.pendingChoices || []).find((c) => c.playerId === me);
            if (!mineChoice) break;
            const p = { playerId: me, choiceId: mineChoice.id };
            if (mineChoice.options && mineChoice.options.length) p.optionId = mineChoice.options[0].id;
            else if (mineChoice.hexKeys && mineChoice.hexKeys.length) p.hexKey = mineChoice.hexKeys[0];
            const r = await UI.dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: p });
            if (!r || r.status !== "accepted") break;
          }
          const after = UI.debugState();
          const mine = Game.getPlayer(after, me);
          const end = await UI.dispatch({ type: "END_TURN", payload: { playerId: me } });
          return { status: end && end.status, why: end && (end.message || end.code),
                   cards: document.querySelectorAll('.fcard:not(.disabled)').length,
                   cardPlayed: mine && mine.cardPlayed,
                   pending: (after.pendingChoices || []).length };
        })()`) });
        }
        const played = attempts.filter((a) => a.res && a.res.status === "accepted");
        ok(`turn ${round + 1}: exactly one seat could play it`, played.length === 1,
          attempts.map((a) => a.tab.name + "=" + JSON.stringify(a.res)).join("  "));
        const actor = played.length ? played[0].tab : host;
        const other = actor === host ? guest : host;
        const sawIt = await waitUntil(async () => {
          const s = await other.eval("(() => { const s = UI.debugState(); return { idx: s.turn.index, round: s.turn.round }; })()");
          return s && (s.idx !== cur.idx || s.round !== cur.round);
        }, 20000);
        ok(`turn ${round + 1}: ${other.name} received the change automatically (no reload)`, sawIt >= 0,
          await other.eval("(() => { const s = UI.debugState(); return { idx: s.turn.index, round: s.turn.round }; })()"));
        if (sawIt >= 0) info(`turn ${round + 1} propagation (${actor.name} -> ${other.name})`, sawIt + " ms");
      }
    }

    for (const t of [host, guest]) {
      ok(`${t.name}: no uncaught exceptions`, t.errors.length === 0, t.errors[0]);
    }
  } catch (err) {
    fail++; lines.push(["FAIL", "harness error", err.message]);
  } finally {
    if (host) host.close();
    if (guest) guest.close();
    server.kill();
  }

  console.log("two-client-test (two real browsers, one real room):");
  lines.forEach(([s, n, d]) => console.log(`  ${s.padEnd(4)} ${n}${d ? "  [" + d + "]" : ""}`));
  console.log(`  ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
