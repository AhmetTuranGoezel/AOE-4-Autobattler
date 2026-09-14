#!/usr/bin/env node
"use strict";

const { CHROME, startServer, Tab, waitUntil, reporter } = require("./browser-harness.js");
const R = reporter();

async function clickHex(tab, key) {
  return tab.eval(`(() => {
    const p = UI.hexPoint(${JSON.stringify(key)});
    const canvas = document.querySelector("canvas");
    if (!p || !canvas) return false;
    const init = { bubbles: true, clientX: p.x, clientY: p.y, button: 0 };
    canvas.dispatchEvent(new MouseEvent("mousemove", init));
    canvas.dispatchEvent(new MouseEvent("mousedown", init));
    canvas.dispatchEvent(new MouseEvent("mouseup", init));
    canvas.dispatchEvent(new MouseEvent("click", init));
    return true;
  })()`);
}

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping Indonesia browser test."); return; }
  const { child: server, port } = await startServer();
  let tab = null;
  try {
    tab = await Tab.open("indonesia", `http://127.0.0.1:${port}/`);
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
      const p = Game.createPlayer(id, "Indonesia", "#d94747");
      const st = Game.createState([p], {});
      Game.finalizeSetup(st);
      const me = Game.getPlayer(st, id);
      me.leaderId = "indonesia";
      me.uniqueTaken = true;
      me.cardTiers.economy = 2;
      me.cardLevels.economy = 2;
      me.focusRow = ["culture", "growth", "science", "economy", "military", "industry"];
      me.cardPlayed = false;
      st.pendingChoices = [];
      st.cardResolution = null;
      st.turn.order = [id]; st.turn.index = 0; st.phase = "playing";
      const waterA = "-7,0", waterB = "7,0", land = "6,0";
      const makeSpace = (key, terrain) => {
        const h = st.map.hexes[key];
        Object.assign(h, { active: true, terrain, tileId: "test-" + key,
          city: null, cityState: null, control: null, fortress: false,
          barbarian: 0, resource: null, naturalWonder: null });
      };
      makeSpace(waterA, "water"); makeSpace(waterB, "water"); makeSpace(land, "grassland");
      me.caravans.forEach((unit, index) => {
        unit.position = index === 0 ? waterA : null;
        unit.movedThisCard = index !== 0;
        unit.exploredThisMove = false;
        unit.exploredThisCard = false;
      });
      UI.debugSetState(st);
      document.querySelector('[data-camera="fit"]')?.click();
      return { id, waterA, waterB, land, caravanId: me.caravans[0].id,
        cardIndex: me.focusRow.indexOf("economy") };
    })()`);
    R.ok("Indonesia and Shipbuilding are seated", !!seeded.caravanId, JSON.stringify(seeded));

    await tab.eval(`(() => { document.querySelector('.fcard[data-card="economy"]')?.click(); return true; })()`);
    await tab.eval("document.querySelector('#wiz-start').click()");
    R.ok("real Shipbuilding card click opens caravan movement", (await waitUntil(async () =>
      await tab.eval(`UI.debugInfo().subPhase === "move_caravan"`), 8000)) >= 0);
    const exact = await tab.eval(`(() => ({
      selectedIndex: document.querySelector('.fcard[data-card="economy"]').dataset.idx,
      localIndex: UI.debugInfo().cardIndex,
      starts: UI.debugInfo().validHexes
    }))()`);
    R.ok("the exact physical Shipbuilding instance is active",
      Number(exact.selectedIndex) === seeded.cardIndex && exact.localIndex === seeded.cardIndex,
      JSON.stringify(exact));
    R.ok("the existing caravan is offered as the movement start",
      exact.starts.includes(seeded.waterA), JSON.stringify(exact));

    R.ok("browser clicked the caravan on edge-water A", await clickHex(tab, seeded.waterA));
    const offeredJump = await waitUntil(async () => await tab.eval(`(() => {
      const info = UI.debugInfo();
      return info.movement && info.movement.currentKey === ${JSON.stringify(seeded.waterA)} &&
        info.validHexes.includes(${JSON.stringify(seeded.waterB)});
    })()`), 8000);
    R.ok("the interface offers distant revealed edge-water B in one step", offeredJump >= 0,
      await tab.eval("UI.debugInfo()"));

    R.ok("browser clicked distant edge-water B", await clickHex(tab, seeded.waterB));
    const jumped = await waitUntil(async () => await tab.eval(`(() => {
      const m = UI.debugInfo().movement;
      return m && m.currentKey === ${JSON.stringify(seeded.waterB)} &&
        m.remaining === 3 && m.route[0] === ${JSON.stringify(seeded.waterB)};
    })()`), 8000);
    R.ok("the edge-water jump costs exactly one of Shipbuilding's four movement", jumped >= 0,
      await tab.eval("UI.debugInfo().movement"));

    R.ok("browser clicked adjacent land after the water jump", await clickHex(tab, seeded.land));
    const onLand = await waitUntil(async () => await tab.eval(`(() => {
      const m = UI.debugInfo().movement;
      return m && m.currentKey === ${JSON.stringify(seeded.land)} && m.remaining === 2;
    })()`), 8000);
    R.ok("ordinary movement continues after the Indonesia jump", onLand >= 0,
      await tab.eval("UI.debugInfo().movement"));

    R.ok("clicking the selected space leaves the route uncommitted", await clickHex(tab, seeded.land) &&
      await tab.eval("!!UI.debugInfo().movement && !UI.debugInfo().actionPending"));
    await tab.eval("document.querySelector('#bc-done').click()");
    const committed = await waitUntil(async () => await tab.eval(`(() => {
      const me = Game.getPlayer(UI.debugState(), ${JSON.stringify(seeded.id)});
      const unit = me.caravans.find((entry) => entry.id === ${JSON.stringify(seeded.caravanId)});
      // finishActiveCard deliberately clears the per-card movement flags for
      // the next time this physical card is played.  The durable proof is the
      // host-owned position plus the completed card transaction.
      return unit.position === ${JSON.stringify(seeded.land)} &&
        !UI.debugState().movementContinuation && !UI.debugState().activeCard;
    })()`), 10000);
    R.ok("the host-authoritative route accepts the same move shown by the UI", committed >= 0,
      await tab.eval(`(() => {
        const me = Game.getPlayer(UI.debugState(), ${JSON.stringify(seeded.id)});
        return me.caravans.find((entry) => entry.id === ${JSON.stringify(seeded.caravanId)});
      })()`));
    R.ok("no uncaught browser exception", tab.errors.length === 0, tab.errors[0]);
  } catch (error) {
    R.ok("Indonesia browser run completed", false, error.stack || String(error));
  } finally {
    if (tab) tab.close();
    server.kill();
  }
  console.log("indonesia-browser-test (real Shipbuilding card and canvas route):");
  R.print();
  if (R.fail) process.exitCode = 1;
})();
