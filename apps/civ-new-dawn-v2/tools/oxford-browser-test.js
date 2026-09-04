#!/usr/bin/env node
"use strict";

// Oxford University in two real browsers.
//
// Oxford is the only card in the game that can put two cards of one type in a
// focus row, and no interface ever had to draw that before: every renderer took
// a row entry to be a type name and looked its level, its trade and its name up
// by type. So the engine being right is not enough — this drives the whole
// thing through the page and checks what the page actually shows.
//
//   * the row is drawn from card INSTANCES, so two cards of one type appear
//     with their own levels and their own trade tokens
//   * the type Oxford replaced is genuinely absent from the row
//   * clicking the RIGHT one of two same-type cards resolves that one
//   * the authoritative state moves
//   * the second client sees the same row with no reload
//
//   node tools/oxford-browser-test.js            headless
//   node tools/oxford-browser-test.js --headed   watch it

const { CHROME, startServer, Tab, waitUntil, reporter } = require("./browser-harness.js");
const R = reporter();

// Drive the host's own seat into a state where Oxford has acted, using only
// authoritative actions, then read the RENDERED row back out of the DOM.
const SETUP = `(async () => {
  const st = UI.debugState();
  const me = Net.getCredentials().seatId;
  const p = Game.getPlayer(st, me);
  // Give this seat Oxford, a clean row and a tech tab to cross.
  const capital = Object.entries(st.map.hexes)
    .find(([, h]) => h.city && h.city.isCapital && h.city.ownerId === me);
  if (!capital) return { error: "no capital" };
  capital[1].city.hasWonder = true;
  capital[1].city.wonder = { name: "Oxford University", type: "science", era: "modern" };
  p.focusRow = ["culture", "growth", "science", "economy", "military", "industry"];
  Game.FOCUS_TYPES.forEach((t) => { p.cardTiers[t] = 1; p.cardLevels[t] = 1; p.trade[t] = 0; });
  p.trade.culture = 2;            // tokens that must follow the PLACE
  p.tech = 0;
  UI.debugSetState(st);
  return { ok: true, me };
})()`;

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping Oxford browser test."); return; }
  const { child: server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  let host = null, guest = null;
  try {
    host = await Tab.open("host", url);
    guest = await Tab.open("guest", url);
    for (const t of [host, guest]) {
      const booted = await waitUntil(async () =>
        await t.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000);
      R.ok(`${t.name}: page booted`, booted >= 0);
    }
    R.ok("the page exposes a way to seat an authoritative state for testing",
      await host.eval("typeof UI.debugSetState === 'function'"));

    // ---- a room, two seats, a started game ------------------------------
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
    for (let a = 0; a < 2 && !(room.lobby && room.code); a++) {
      R.info("room creation retry (broker)", JSON.stringify(room));
      await host.reload();
      await waitUntil(async () => await host.eval("typeof UI === 'object'"), 15000);
      room = await createRoom();
    }
    R.ok("the host opened a room", room.lobby && !!room.code, JSON.stringify(room));
    if (!room.code) throw new Error("no room code");

    await guest.eval(`(async () => {
      document.getElementById("inp-name").value = "Guest";
      document.getElementById("inp-join").value = ${JSON.stringify(room.code)};
      document.getElementById("btn-join").click();
      for (let i = 0; i < 240; i++) {
        const s = UI.debugState();
        if (s && s.players && s.players.length >= 2) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      return true;
    })()`);
    R.ok("a second seat joined",
      (await waitUntil(async () =>
        (await host.eval("(UI.debugState()?.players || []).length")) === 2, 30000)) >= 0);

    await host.eval(`(() => { const b = document.getElementById("lobby-start");
      if (b && !b.disabled) b.click(); return true; })()`);
    R.ok("the game left the lobby",
      (await waitUntil(async () =>
        ["setup", "playing"].includes(await host.eval("UI.debugState()?.phase")), 45000)) >= 0);

    // Run setup from whichever tab is up.
    const driveSetup = async () => {
      for (let step = 0; step < 200; step++) {
        if ((await host.eval("UI.debugState()?.phase")) === "playing") return true;
        let acted = false;
        for (const t of [host, guest]) {
          const did = await t.eval(`(async () => {
            const st = UI.debugState();
            if (!st || st.phase !== "setup") return null;
            const seat = Net.getCredentials().seatId;
            if (st.setup.order[st.setup.turnIndex] !== seat) return null;
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
                    if (r && r.status === "accepted") return "tile";
                  }
                }
              }
            }
            return "stuck";
          })()`);
          if (did && /accepted|tile/.test(String(did))) { acted = true; break; }
        }
        if (!acted) await new Promise((r) => setTimeout(r, 250));
      }
      return (await host.eval("UI.debugState()?.phase")) === "playing";
    };
    R.ok("setup completed and play began", await driveSetup(),
      await host.eval("({ phase: UI.debugState()?.phase })"));

    // ---- put Oxford and a clean row on the host's seat -------------------
    const seeded = await host.eval(SETUP);
    R.ok("the host's seat is seated with Oxford and a level-I row",
      seeded && seeded.ok === true, JSON.stringify(seeded));

    // ---- cross a tech tab and answer both questions through the UI ------
    const upgraded = await host.eval(`(async () => {
      const seat = Net.getCredentials().seatId;
      const st = UI.debugState();
      Game.advanceTech(st, Game.getPlayer(st, seat), 3);
      UI.debugSetState(st);
      await new Promise((r) => setTimeout(r, 200));
      const s1 = UI.debugState();
      const offer = (s1.pendingChoices || []).find((c) => c.kind === "science_upgrade");
      if (!offer) return { error: "no upgrade offer" };
      const a = await UI.dispatch({ type: "RESOLVE_PENDING_CHOICE",
        payload: { playerId: seat, choiceId: offer.id, optionId: "science" } });
      const s2 = UI.debugState();
      const ask = (s2.pendingChoices || []).find((c) => c.kind === "oxford_replace");
      if (!ask) return { error: "no oxford question", first: a && a.status };
      const row = Game.getRowCards(Game.getPlayer(s2, seat));
      const cultureIndex = row.findIndex((c) => c.type === "culture");
      const b = await UI.dispatch({ type: "RESOLVE_PENDING_CHOICE",
        payload: { playerId: seat, choiceId: ask.id, optionId: String(cultureIndex) } });
      return { ok: true, status: b && b.status, cultureIndex,
        options: (ask.options || []).length };
    })()`);
    R.ok("Oxford asked which card the gained one replaces",
      upgraded && upgraded.ok === true, JSON.stringify(upgraded));
    // A SCIENCE card is being gained here, so the science card is a legal
    // target as the ORDINARY replacement, and Oxford adds the other five. The
    // engine harness drives the military case, where science is excluded.
    R.ok("all six cards are legal targets when the gained card is a science one",
      upgraded && upgraded.options === 6, JSON.stringify(upgraded));

    // ---- what the PAGE now shows ----------------------------------------
    const drawn = await host.eval(`(() => {
      const cards = [...document.querySelectorAll("#focus-row .fcard")].map((el) => ({
        type: el.dataset.card,
        idx: Number(el.dataset.idx),
        tier: (el.querySelector(".fc-tier-roman") || {}).textContent || "",
        name: (el.querySelector(".fc-cardname") || {}).textContent || "",
        filled: el.querySelectorAll(".trade-filled").length
      }));
      return { cards, count: cards.length };
    })()`);
    R.ok("the rendered row still shows six cards",
      drawn.count === 6, JSON.stringify(drawn.cards));
    const military = drawn.cards.filter((c) => c.type === "science");
    R.ok("two of them are science cards — a type Oxford may GAIN, though never replace",
      military.length === 2, JSON.stringify(drawn.cards));
    R.ok("and they are drawn at DIFFERENT levels, so they are distinguishable",
      military.length === 2 && military[0].tier !== military[1].tier,
      JSON.stringify(military));
    R.ok("the culture card is genuinely absent from the drawn row",
      !drawn.cards.some((c) => c.type === "culture"), JSON.stringify(drawn.cards));
    const gained = military.find((c) => c.tier === "II");
    R.ok("the gained card is the level-II one", !!gained, JSON.stringify(military));
    R.ok("and it carries the two trade tokens the replaced card had",
      gained && gained.filled === 2, JSON.stringify(military));
    R.ok("while the other military card carries none of them",
      military.filter((c) => c.filled === 0).length === 1, JSON.stringify(military));

    // ---- the second client sees the same row, with no reload ------------
    const guestRow = await waitUntil(async () => {
      const seen = await guest.eval(`(() => {
        const st = UI.debugState();
        const hostSeat = st.players.find((p) => p.id !== Net.getCredentials().seatId);
        if (!hostSeat) return null;
        return Game.getRowCards(hostSeat).map((c) => c.type + " " + c.tier).join(",");
      })()`);
      return seen && seen.split(",").filter((x) => x.startsWith("science")).length === 2;
    }, 20000);
    R.ok("the other client sees the same two-science row with no reload",
      guestRow >= 0, await guest.eval(`(() => {
        const st = UI.debugState();
        const h = st.players.find((p) => p.id !== Net.getCredentials().seatId);
        return h ? Game.getRowCards(h).map((c) => c.type + " " + c.tier).join(",") : "none";
      })()`));

    // ---- clicking the RIGHT one of two same-type cards -------------------
    const played = await host.eval(`(async () => {
      const seat = Net.getCredentials().seatId;
      // Make it this seat's turn with its card unspent, so the row is live.
      const live = UI.debugState();
      live.turn.index = live.turn.order.indexOf(seat);
      Game.getPlayer(live, seat).cardPlayed = false;
      UI.debugSetState(live);
      await new Promise((r) => setTimeout(r, 300));
      const before = Game.getRowCards(Game.getPlayer(UI.debugState(), seat))
        .map((c) => c.type + " " + c.tier);
      // The level-I military card, which is NOT the leftmost military card.
      const els = [...document.querySelectorAll("#focus-row .fcard:not(.disabled)")]
        .filter((el) => el.dataset.card === "science");
      if (els.length < 2) return { error: "not two playable science cards", n: els.length };
      const target = els.find((el) =>
        (el.querySelector(".fc-tier-roman") || {}).textContent === "I");
      if (!target) return { error: "no level-I science card" };
      const targetIdx = Number(target.dataset.idx);
      target.click();
      await new Promise((r) => setTimeout(r, 400));
      const start = document.getElementById("wiz-start");
      if (start) start.click();
      await new Promise((r) => setTimeout(r, 700));
      const after = Game.getRowCards(Game.getPlayer(UI.debugState(), seat))
        .map((c) => c.type + " " + c.tier);
      return { ok: true, before, after, targetIdx };
    })()`);
    R.ok("the level-I science card can be clicked in the page",
      played && played.ok === true, JSON.stringify(played));
    if (played && played.ok) {
      R.ok("resolving it moved THAT card to the front of the row",
        played.after[0] === "science 1", JSON.stringify(played));
      R.ok("and the level-II science card is still in the row, not reset",
        played.after.includes("science 2") && played.after[0] !== "science 2",
        JSON.stringify(played));
      R.ok("the row is still six cards after the reset",
        played.after.length === 6, JSON.stringify(played.after));
    }

    const errs = [host, guest].flatMap((t) => t.errors.map((e) => `${t.name}: ${e}`));
    R.ok("no uncaught exception in either client", errs.length === 0,
      errs.slice(0, 3).join(" | "));
  } catch (err) {
    R.ok("harness error", false, String((err && err.stack) || err));
  } finally {
    for (const t of [host, guest]) if (t) t.close();
    try { server.kill(); } catch { /* already gone */ }
  }
  R.print();
  process.exitCode = R.fail ? 1 : 0;
})();
