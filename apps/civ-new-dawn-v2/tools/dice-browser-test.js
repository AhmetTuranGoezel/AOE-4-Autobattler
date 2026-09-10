#!/usr/bin/env node
"use strict";

const { CHROME, startServer, Tab, waitUntil, reporter, sleep } = require("./browser-harness.js");
const R = reporter();

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping dice browser test."); return; }
  const { child: server, port } = await startServer();
  let tab = null;
  try {
    tab = await Tab.open("dice", `http://127.0.0.1:${port}/`);
    R.ok("page booted", (await waitUntil(async () =>
      await tab.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000)) >= 0);
    await tab.eval(`(() => {
      [...document.querySelectorAll("button")].find((b) => /solo/i.test(b.textContent))?.click();
      return true;
    })()`);
    R.ok("local browser owns a seat", (await waitUntil(async () =>
      !!(await tab.eval("UI.debugInfo().localPlayerId")), 10000)) >= 0);

    const seeded = await tab.eval(`(() => {
      const id = UI.debugInfo().localPlayerId;
      const p = Game.createPlayer(id, "Dice Tester", "#d94747");
      const st = Game.createState([p], {});
      Game.finalizeSetup(st);
      const me = Game.getPlayer(st, id);
      me.trade.military = 3;
      st.turn.order = [id]; st.turn.index = 0; st.phase = "playing";
      st.pendingChoices = []; st.lastCombat = null;
      st.combat = {
        combatId: "browser-dice-event", attackerId: id, unitId: "army-1",
        fromKey: "0,0", toKey: "1,0", defenderLabel: "Barbarian",
        defenderOwnerId: null, defenderType: "barbarian", defenderUnitId: null,
        atkBase: 2, defBase: 1,
        atkParts: [{ label: "military card", value: 2 }],
        defParts: [{ label: "barbarian defence", value: 1 }],
        leaderBonus: 0, atkRoll: 0, defRoll: 0,
        atkRolled: false, defRolled: false, atkRollSeq: 0, defRollSeq: 0,
        rolled: false, atkTrade: 0, defTrade: 0,
        atkResource: 0, defResource: 0, turn: "attacker", history: []
      };
      UI.debugSetState(st);
      return { id };
    })()`);
    R.ok("combat stage starts with a real Throw control", !!seeded.id &&
      await tab.eval("!!document.querySelector('#cs-roll[data-side=attacker]')"));
    R.ok("loading an existing combat does not replay a historical roll",
      !(await tab.eval("!!document.querySelector('.cs-die.rolling')")) &&
      (await tab.eval("UI.debugInfo().diceAnimations.length")) === 0);

    await tab.eval("(() => { document.querySelector('#cs-roll').click(); return true; })()");
    const attackerRolling = await waitUntil(async () => await tab.eval(`(() => {
      const c = UI.debugState().combat;
      return c && c.atkRollSeq === 1 &&
        document.querySelector('.cs-die.atk')?.classList.contains('rolling') &&
        /Rolling; authoritative result/.test(document.querySelector('.cs-die.atk')?.getAttribute('aria-label') || '');
    })()`), 4000, 30);
    R.ok("the authoritative attacker roll starts one visible animation", attackerRolling >= 0,
      await tab.eval("({combat:UI.debugState().combat, info:UI.debugInfo().diceAnimations})"));
    const attackerFinal = await tab.eval("UI.debugState().combat.atkRoll");
    const stable = await tab.eval(`(async () => {
      const body = document.querySelector('.cs-body');
      const title = document.querySelector('.cs-vs');
      const names = [...document.querySelectorAll('.cs-name')];
      const buttons = [...document.querySelectorAll('.cs-actions button')];
      const box = body.getBoundingClientRect();
      const faces = new Set();
      let stable = true, frames = 0; const samples = [];
      for (let i = 0; i < 9; i++) {
        await new Promise((r) => setTimeout(r, 65));
        const current = document.querySelector('.cs-body');
        const rect = current?.getBoundingClientRect();
        stable = stable && current === body && title.isConnected &&
          names.every((node) => node.isConnected) && buttons.every((node) => node.isConnected) &&
          !document.querySelector('#combat-stage').classList.contains('hidden') &&
          rect.width > 0 && rect.height > 0 && Math.abs(rect.width - box.width) < 1 &&
          Math.abs(rect.height - box.height) < 1;
        faces.add(document.querySelector('.cs-die.atk').innerHTML); frames++;
        samples.push({ same: current === body, title: title.isConnected,
          labels: names.every((node) => node.isConnected), buttons: buttons.every((node) => node.isConnected),
          width: rect.width, height: rect.height, initialWidth: box.width, initialHeight: box.height });
      }
      return { stable, frames, faces: faces.size, samples };
    })()`);
    R.ok("animation frames preserve popup, title, labels, buttons and geometry",
      stable.stable && stable.frames === 9, stable);
    R.ok("only the die face changes across mounted popup frames", stable.faces > 1, stable);
    const attackerLanded = await waitUntil(async () => await tab.eval(`(() => {
      const die = document.querySelector('.cs-die.atk');
      return die && !die.classList.contains('rolling') &&
        die.getAttribute('aria-label') === 'Rolled ${attackerFinal}';
    })()`), 2500, 40);
    R.ok("the attacker die lands on the host-authoritative face", attackerLanded >= 0,
      await tab.eval("document.querySelector('.cs-die.atk')?.getAttribute('aria-label')"));

    await tab.eval("(() => { document.querySelector('#cs-roll').click(); return true; })()");
    const defenderRolling = await waitUntil(async () => await tab.eval(`(() => {
      const c = UI.debugState().combat;
      return c && c.defRollSeq === 1 &&
        document.querySelector('.cs-die.def')?.classList.contains('rolling');
    })()`), 4000, 30);
    R.ok("the defender roll animates without rerolling the settled attacker die",
      defenderRolling >= 0 && !(await tab.eval("document.querySelector('.cs-die.atk')?.classList.contains('rolling')")));
    const defenderFinal = await tab.eval("UI.debugState().combat.defRoll");
    R.ok("the defender die lands on its authoritative face", (await waitUntil(async () =>
      await tab.eval(`document.querySelector('.cs-die.def')?.getAttribute('aria-label') === 'Rolled ${defenderFinal}'`),
      2500, 40)) >= 0);

    R.ok("real bidding exposes the reroll action", (await waitUntil(async () =>
      await tab.eval("!!document.querySelector('#cs-reroll:not([disabled])')"), 2500)) >= 0);
    const beforeReroll = await tab.eval("({seq:UI.debugState().combat.atkRollSeq,trade:UI.debugState().players[0].trade.military})");
    await tab.eval("(() => { document.querySelector('#cs-reroll').click(); return true; })()");
    const rerolling = await waitUntil(async () => await tab.eval(`(() => {
      const c = UI.debugState().combat;
      return c && c.atkRollSeq === ${beforeReroll.seq + 1} &&
        document.querySelector('.cs-die.atk')?.classList.contains('rolling');
    })()`), 4000, 30);
    R.ok("a real reroll is a new die event and spends exactly one token", rerolling >= 0 &&
      (await tab.eval("UI.debugState().players[0].trade.military")) === beforeReroll.trade - 1);
    await waitUntil(async () => !(await tab.eval("document.querySelector('.cs-die.atk')?.classList.contains('rolling')")), 2500, 40);

    // A repeated number is still a new physical throw. Force that exact
    // authoritative snapshot shape (same face, next sequence) after the real
    // reducer-driven reroll above; the UI must key off the sequence, not value.
    const sameFace = await tab.eval(`(() => {
      const c = UI.debugState().combat;
      const face = c.atkRoll;
      c.atkRollSeq += 1;
      UI.render();
      return { face, seq: c.atkRollSeq };
    })()`);
    R.ok("a new sequence animates even when the authoritative face repeats",
      (await waitUntil(async () => await tab.eval(`
        document.querySelector('.cs-die.atk')?.classList.contains('rolling') &&
        UI.debugInfo().diceAnimations.some((d) => d.eventKey.endsWith('|attacker|${sameFace.seq}'))
      `), 1200, 25)) >= 0, sameFace);
    R.ok("the repeated-face event still lands on that exact face", (await waitUntil(async () =>
      await tab.eval(`document.querySelector('.cs-die.atk')?.getAttribute('aria-label') === 'Rolled ${sameFace.face}'`),
      2500, 40)) >= 0);

    await tab.eval(`(() => {
      const saved = JSON.parse(JSON.stringify(UI.debugState()));
      const blank = JSON.parse(JSON.stringify(saved));
      blank.combat = null; blank.lastCombat = null;
      UI.debugSetState(blank);
      UI.debugSetState(saved);
      return true;
    })()`);
    await sleep(100);
    R.ok("reconnecting into settled dice establishes a baseline without replay",
      !(await tab.eval("!!document.querySelector('.cs-die.rolling')")) &&
      (await tab.eval("UI.debugInfo().diceAnimations.length")) === 0);
    R.ok("no uncaught browser exception", tab.errors.length === 0, tab.errors[0]);
  } catch (error) {
    R.ok("dice browser run completed", false, error.stack || String(error));
  } finally {
    if (tab) tab.close();
    server.kill();
  }
  console.log("dice-browser-test (authoritative event animation):");
  R.print();
  if (R.fail) process.exitCode = 1;
})();
