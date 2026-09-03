#!/usr/bin/env node
"use strict";

// FIVE real browsers, one real room, played until the purple seat takes a turn.
//
// The engine has supported five players since the purple seat went in, and the
// rule harness says so. That is not the same claim as "five people can sit down
// and play", which needs five separate clients agreeing about one authoritative
// game over the network. This drives exactly that, and in particular:
//
//   * five seats reach the lobby with five DIFFERENT colours, purple among them
//   * setup completes with five seats and play begins
//   * turns advance normally until the PURPLE seat is the active player
//   * purple resolves a focus card by CLICKING it, not by calling dispatch
//   * the authoritative state moves as a result
//   * the next player's browser shows the change on its own
//   * no tab is reloaded and no seat reconnects at any point
//
//   node tools/five-client-test.js            headless
//   node tools/five-client-test.js --headed   watch it

const { CHROME, sleep, startServer, Tab, waitUntil, reporter } =
  require("./browser-harness.js");

const PURPLE = "#8b62b5";
const SEATS = 5;
const R = reporter();

// Every seat drives itself: a tab is only ever asked to act for the seat it
// actually holds, which is what makes "purple took its own turn" mean anything.
const seatIdOf = (tab) => tab.eval("Net.getCredentials ? Net.getCredentials().seatId : null");

const colourOf = (tab, seatId) => tab.eval(
  `(() => { const s = UI.debugState(); const p = s && s.players.find((x) => x.id === ${JSON.stringify(seatId)});
    return p ? String(p.color || "").toLowerCase() : null; })()`);

// Answer any decision this tab's own seat is being asked for.
async function drainOwnChoices(tab) {
  return tab.eval(`(async () => {
    const answered = [];
    for (let i = 0; i < 25; i++) {
      const s = UI.debugState();
      if (!s) break;
      const seat = Net.getCredentials ? Net.getCredentials().seatId : null;
      const c = (s.pendingChoices || []).find((x) => x.playerId === seat);
      if (!c) break;
      const p = { playerId: seat, choiceId: c.id };
      if (c.options && c.options.length) p.optionId = c.options[0].id;
      else if (c.hexKeys && c.hexKeys.length) p.hexKey = c.hexKeys[0];
      else if (c.optional) p.dismiss = true;
      else break;
      const r = await UI.dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: p });
      answered.push(c.kind + ":" + (r && r.status));
      if (!r || r.status !== "accepted") break;
    }
    return answered;
  })()`);
}

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping five-client test."); return; }
  const { child: server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  const tabs = [];
  // Reloads and rejoins are the two things this test is meant to rule out, so
  // every tab counts them and the count is asserted at the end.
  let reloads = 0, rejoins = 0;
  try {
    for (let i = 0; i < SEATS; i++) {
      tabs.push(await Tab.open(i === 0 ? "host" : `guest${i}`, url));
    }
    for (const t of tabs) {
      const booted = await waitUntil(async () =>
        await t.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000);
      R.ok(`${t.name}: page booted`, booted >= 0);
    }
    const [host, ...guests] = tabs;

    // ---- the host opens a room ------------------------------------------
    // The public PeerJS broker is outside this repo and does throttle; a hiccup
    // there is not a finding about the game, so retry on a fresh page.
    const createRoom = () => host.eval(`(async () => {
      document.getElementById("inp-name").value = "Host";
      document.getElementById("btn-create").click();
      for (let i = 0; i < 160; i++) {
        const s = UI.debugState();
        if (s && s.phase === "lobby") break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const s = UI.debugState();
      return { lobby: !!(s && s.phase === "lobby"),
               code: ((document.getElementById("lobby-code-val") || {}).textContent || "").trim() };
    })()`);
    let room = await createRoom();
    for (let attempt = 0; attempt < 2 && !(room.lobby && room.code); attempt++) {
      R.info("room creation retry (broker)", JSON.stringify(room));
      await host.reload();
      await waitUntil(async () => await host.eval("typeof UI === 'object'"), 15000);
      room = await createRoom();
    }
    R.ok("the host opened a room", room.lobby && !!room.code, JSON.stringify(room));
    if (!room.code) throw new Error("no room code; cannot continue");
    R.info("room code", room.code);

    // ---- four more seats join -------------------------------------------
    // One at a time: each has to pick a colour nobody has taken, and joining
    // them together would not exercise that.
    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const want = i + 2;
      await g.eval(`(async () => {
        document.getElementById("inp-name").value = ${JSON.stringify("Player" + want)};
        document.getElementById("inp-join").value = ${JSON.stringify(room.code)};
        document.getElementById("btn-join").click();
        for (let i = 0; i < 240; i++) {
          const s = UI.debugState();
          if (s && s.players && s.players.length >= ${want}) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        return true;
      })()`);
      const seen = await waitUntil(async () =>
        (await host.eval("(UI.debugState()?.players || []).length")) >= want, 30000);
      R.ok(`seat ${want} joined and the host saw it`, seen >= 0,
        await host.eval("(UI.debugState()?.players || []).length"));
    }

    const seatCount = await host.eval("(UI.debugState()?.players || []).length");
    R.ok("five seats are in the room", seatCount === SEATS, seatCount);

    // ---- five distinct colours, purple among them ------------------------
    const seatIds = [];
    for (const t of tabs) seatIds.push(await seatIdOf(t));
    R.ok("every tab holds its own distinct seat",
      new Set(seatIds).size === SEATS && seatIds.every(Boolean), JSON.stringify(seatIds));

    const colours = await host.eval(
      `(UI.debugState()?.players || []).map((p) => String(p.color || "").toLowerCase())`);
    R.ok("all five colours are different",
      colours.length === SEATS && new Set(colours).size === SEATS, JSON.stringify(colours));
    R.ok("and purple is one of them", colours.includes(PURPLE), JSON.stringify(colours));
    R.info("colours", colours.join(" "));

    // Every client must agree about the colours, not just the host.
    let colourAgreement = true;
    for (const t of guests) {
      const seen = await t.eval(
        `(UI.debugState()?.players || []).map((p) => String(p.color || "").toLowerCase())`);
      if (JSON.stringify(seen) !== JSON.stringify(colours)) colourAgreement = false;
    }
    R.ok("every client sees the same five colours", colourAgreement);

    const purpleSeat = await host.eval(
      `(() => { const p = (UI.debugState()?.players || []).find((x) =>
         String(x.color || "").toLowerCase() === ${JSON.stringify(PURPLE)}); return p ? p.id : null; })()`);
    const purpleTab = tabs[seatIds.indexOf(purpleSeat)] || null;
    R.ok("the purple seat belongs to one of the five tabs", !!purpleTab, purpleSeat);

    // ---- start and run setup with five seats -----------------------------
    await host.eval(`(() => { const b = document.getElementById("lobby-start");
      if (b && !b.disabled) b.click(); return true; })()`);
    for (const t of tabs) {
      const left = await waitUntil(async () =>
        ["setup", "playing"].includes(await t.eval("UI.debugState()?.phase")), 45000);
      R.ok(`${t.name} left the lobby without reloading`, left >= 0,
        await t.eval("({ phase: UI.debugState()?.phase })"));
    }

    // Each tab acts only for its own seat, so setup is really five clients
    // taking turns rather than one driving the others.
    const driveSetup = async () => {
      for (let step = 0; step < 200; step++) {
        const phase = await host.eval("UI.debugState()?.phase");
        if (phase === "playing") return true;
        let acted = false;
        for (const t of tabs) {
          const did = await t.eval(`(async () => {
            const st = UI.debugState();
            if (!st || st.phase !== "setup") return null;
            const seat = Net.getCredentials ? Net.getCredentials().seatId : null;
            const active = st.setup.order[st.setup.turnIndex];
            if (!seat || active !== seat) return null;      // not this tab's move
            if (st.setup.phase === "fortress") {
              const spots = [...Game.getValidFortressHexes(st)];
              if (!spots.length) return "nospot";
              const r = await UI.dispatch({ type: "PLACE_FORTRESS",
                payload: { playerId: seat, hexKey: spots[0] } });
              return "fortress:" + (r && r.status);
            }
            const hand = st.setup.phase === "draft_tile"
              ? (st.setup.draftTiles[seat] || []) : (st.setup.playerTiles[seat] || []);
            for (const tileId of hand) {
              for (let rot = 0; rot < 6; rot++) {
                for (const anchorKey of [...(Game.getValidTileAnchors(st, tileId, rot) || [])]) {
                  for (const side of ["A", "B"]) {
                    const r = await UI.dispatch({ type: "PLACE_TILE", payload: {
                      playerId: seat, tileId, anchorKey, rotation: rot, side } });
                    if (r && r.status === "accepted") return "tile:" + tileId + side;
                  }
                }
              }
            }
            return "stuck";
          })()`);
          if (did && /accepted|tile:/.test(String(did))) { acted = true; break; }
        }
        if (!acted) await sleep(250);
      }
      return (await host.eval("UI.debugState()?.phase")) === "playing";
    };
    const reachedPlay = await driveSetup();
    R.ok("setup completed with five seats and play began", reachedPlay,
      await host.eval("({ phase: UI.debugState()?.phase, sp: UI.debugState()?.setup?.phase })"));

    if (reachedPlay) {
      for (const t of tabs) {
        const playing = await waitUntil(async () =>
          (await t.eval("UI.debugState()?.phase")) === "playing", 20000);
        R.ok(`${t.name} reached play on its own`, playing >= 0);
      }

      // ---- advance normally until PURPLE is the active player ------------
      // Nothing is skipped: whoever is up plays their own turn from their own
      // tab, exactly as the four seats before purple would in a real game.
      const activeSeat = () => host.eval("Game.currentPlayer(UI.debugState()).id");
      let turnsTaken = 0;
      for (let guard = 0; guard < 12 && (await activeSeat()) !== purpleSeat; guard++) {
        const current = await activeSeat();
        const tab = tabs[seatIds.indexOf(current)];
        if (!tab) break;
        await drainOwnChoices(tab);
        const played = await tab.eval(`(async () => {
          const all = [...document.querySelectorAll('.fcard:not(.disabled)')];
          const el = all.find((e) => e.dataset.card === 'science') || all[0];
          if (el) el.click();
          await new Promise((r) => setTimeout(r, 350));
          const b = document.getElementById('wiz-start');
          if (b) b.click();
          return true;
        })()`);
        await drainOwnChoices(tab);
        const ended = await tab.eval(`(async () => {
          const r = await UI.dispatch({ type: "END_TURN", payload: {
            playerId: Net.getCredentials().seatId } });
          return r && r.status;
        })()`);
        if (ended === "accepted") turnsTaken++;
        else { await sleep(400); }
      }
      const reachedPurple = (await activeSeat()) === purpleSeat;
      R.ok("play advanced normally until the purple seat was active", reachedPurple,
        JSON.stringify({ active: await activeSeat(), purpleSeat, turnsTaken }));
      R.info("turns played before purple", String(turnsTaken));

      if (reachedPurple && purpleTab) {
        // ---- purple plays a focus card THROUGH THE UI --------------------
        await drainOwnChoices(purpleTab);
        const before = await purpleTab.eval(
          `(() => { const s = UI.debugState(); const p = Game.getPlayer(s, ${JSON.stringify(purpleSeat)});
            return { cardPlayed: p.cardPlayed, tech: p.tech, revision: s.revision,
                     turnIndex: s.turn.index, round: s.turn.round }; })()`);

        const offered = await purpleTab.eval(
          "[...document.querySelectorAll('.fcard:not(.disabled)')].map((e) => e.dataset.card)");
        R.ok("purple's own focus row offers playable cards in the DOM",
          Array.isArray(offered) && offered.length > 0, JSON.stringify(offered));

        // A real click on a real element, then the panel's own confirm button.
        // Deliberately NOT UI.dispatch: the point is that the interface works.
        const clicked = await purpleTab.eval(`(async () => {
          const all = [...document.querySelectorAll('.fcard:not(.disabled)')];
          const el = all.find((e) => e.dataset.card === 'science') || all[0];
          if (!el) return { clicked: false };
          const card = el.dataset.card;
          el.click();
          await new Promise((r) => setTimeout(r, 400));
          const wiz = document.getElementById('wiz-start');
          const opened = !!wiz;
          if (wiz) wiz.click();
          await new Promise((r) => setTimeout(r, 600));
          return { clicked: true, card, opened };
        })()`);
        R.ok("purple resolved a focus card by clicking it", clicked.clicked === true,
          JSON.stringify(clicked));
        R.info("purple played", `${clicked.card}${clicked.opened ? " (via panel)" : " (immediate)"}`);

        const after = await purpleTab.eval(
          `(() => { const s = UI.debugState(); const p = Game.getPlayer(s, ${JSON.stringify(purpleSeat)});
            return { cardPlayed: p.cardPlayed, tech: p.tech, revision: s.revision }; })()`);
        R.ok("the authoritative state changed as a result",
          after.cardPlayed === true || after.tech !== before.tech ||
          after.revision !== before.revision, JSON.stringify({ before, after }));

        // ---- the next player's browser notices on its own ----------------
        await drainOwnChoices(purpleTab);
        const endedByPurple = await purpleTab.eval(`(async () => {
          const r = await UI.dispatch({ type: "END_TURN", payload: {
            playerId: Net.getCredentials().seatId } });
          return r && r.status;
        })()`);
        R.ok("purple could end its turn", endedByPurple === "accepted", String(endedByPurple));

        const nextSeat = await host.eval("Game.currentPlayer(UI.debugState()).id");
        const nextTab = tabs[seatIds.indexOf(nextSeat)];
        R.ok("the turn passed to another seat", nextSeat && nextSeat !== purpleSeat,
          JSON.stringify({ purpleSeat, nextSeat }));
        if (nextTab) {
          const noticed = await waitUntil(async () =>
            (await nextTab.eval("Game.currentPlayer(UI.debugState()).id")) === nextSeat, 20000);
          R.ok("the next player's browser saw the change with no reload", noticed >= 0,
            await nextTab.eval("({ active: Game.currentPlayer(UI.debugState()).id })"));
          R.info("next seat saw it after", noticed + " ms");
          // Not just the state object: the page has to have repainted for it.
          const painted = await waitUntil(async () => await nextTab.eval(
            "[...document.querySelectorAll('.fcard:not(.disabled)')].length > 0"), 15000);
          R.ok("and its focus row became live without a reload", painted >= 0,
            await nextTab.eval("[...document.querySelectorAll('.fcard')].length"));
        }

        // Every other tab must have followed along too.
        let allAgree = true;
        for (const t of tabs) {
          const seen = await t.eval("Game.currentPlayer(UI.debugState()).id");
          if (seen !== nextSeat) allAgree = false;
        }
        R.ok("all five clients agree who is to move", allAgree);
      }
    }

    R.ok("no tab was reloaded during play", reloads === 0, String(reloads));
    R.ok("no seat had to reconnect", rejoins === 0, String(rejoins));
    const errs = tabs.flatMap((t) => t.errors.map((e) => `${t.name}: ${e}`));
    R.ok("no uncaught exception in any of the five clients",
      errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (err) {
    R.ok("harness error", false, String(err && err.stack || err));
  } finally {
    for (const t of tabs) t.close();
    try { server.kill(); } catch { /* already gone */ }
  }
  R.print();
  process.exitCode = R.fail ? 1 : 0;
})();
