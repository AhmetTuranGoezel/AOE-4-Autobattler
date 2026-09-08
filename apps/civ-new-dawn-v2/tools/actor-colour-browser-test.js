#!/usr/bin/env node
"use strict";

const { CHROME, startServer, Tab, waitUntil, reporter } = require("./browser-harness.js");
const R = reporter();

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping actor-colour browser test."); return; }
  const { child: server, port } = await startServer();
  let tab = null;
  try {
    tab = await Tab.open("actor-colours", `http://127.0.0.1:${port}/`);
    R.ok("page booted", (await waitUntil(async () =>
      await tab.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000)) >= 0);
    await tab.eval(`(() => {
      [...document.querySelectorAll("button")].find((b) => /solo/i.test(b.textContent))?.click();
      return true;
    })()`);
    R.ok("local browser owns a seat", (await waitUntil(async () =>
      !!(await tab.eval("UI.debugInfo().localPlayerId")), 10000)) >= 0);

    const seeded = await tab.eval(`(() => {
      const local = Game.createPlayer(UI.debugInfo().localPlayerId, "Local Seat", "#e88b24");
      const red = Game.createPlayer("seat-red", "Red General", "#d94747");
      const blue = Game.createPlayer("seat-blue", "Blue Trader", "#169eae");
      const purple = Game.createPlayer("seat-purple", "Purple Scholar", "#8b62b5");
      const st = Game.createState([local, red, blue, purple], {});
      Game.finalizeSetup(st);
      st.turn.order = st.players.map((p) => p.id); st.turn.index = 0;
      UI.debugSetState(st);
      const keys = Object.keys(st.map.hexes).filter((key) => st.map.hexes[key].active).slice(0, 4);
      const forged = { name: "Forged Identity", color: "#000000", phase: "move_army" };
      UI.debugReceivePresence({ ...forged, playerId: red.id, hover: keys[0],
        route: { startKey: keys[0], currentKey: keys[1] } });
      UI.debugReceivePresence({ ...forged, playerId: blue.id, hover: keys[1],
        ghost: { tileId: "01", anchor: keys[2], rotation: 0, side: "A" } });
      UI.debugReceivePresence({ ...forged, playerId: purple.id, hover: keys[2] });
      UI.debugReceivePresence({ ...forged, playerId: "not-a-seat", hover: keys[3] });
      return { keys };
    })()`);
    R.ok("the test board has visible map coordinates", seeded.keys.length >= 3, seeded);

    const visuals = await tab.eval("UI.debugInfo().presenceVisuals");
    const byId = Object.fromEntries(visuals.map((entry) => [entry.playerId, entry]));
    R.ok("red map feedback uses the red seat colour, not packet colour",
      byId["seat-red"]?.color.toLowerCase() === "#d94747", byId["seat-red"]);
    R.ok("blue map feedback uses the blue seat colour, not packet colour",
      byId["seat-blue"]?.color.toLowerCase() === "#169eae", byId["seat-blue"]);
    R.ok("purple map feedback uses the purple seat colour, not packet colour",
      byId["seat-purple"]?.color.toLowerCase() === "#8b62b5", byId["seat-purple"]);
    R.ok("route and tile ghost retain the correct actor identity",
      byId["seat-red"]?.hasRoute && byId["seat-blue"]?.hasGhost,
      visuals);
    R.ok("presence from an unknown transport identity is not painted",
      !byId["not-a-seat"], visuals);

    const strip = await tab.eval("document.querySelector('#presence-strip')?.textContent || ''");
    R.ok("the presence strip displays authoritative seat names",
      /Red General/.test(strip) && /Blue Trader/.test(strip) && /Purple Scholar/.test(strip), strip);
    R.ok("a forged packet name is never displayed", !/Forged Identity/.test(strip), strip);

    const recoloured = await tab.eval(`(() => {
      Game.getPlayer(UI.debugState(), "seat-purple").color = "#31a66a";
      UI.render();
      UI.debugReceivePresence({ playerId: "seat-purple", color: "#8b62b5",
        name: "Forged Identity", hover: ${JSON.stringify(seeded.keys[2])} });
      return UI.debugInfo().presenceVisuals.find((entry) => entry.playerId === "seat-purple");
    })()`);
    R.ok("authoritative seat recolouring immediately replaces stale packet colour",
      recoloured?.color.toLowerCase() === "#31a66a", recoloured);
    R.ok("no uncaught browser exception", tab.errors.length === 0, tab.errors[0]);
  } catch (error) {
    R.ok("actor-colour browser run completed", false, error.stack || String(error));
  } finally {
    if (tab) tab.close();
    server.kill();
  }
  console.log("actor-colour-browser-test (authoritative remote feedback):");
  R.print();
  if (R.fail) process.exitCode = 1;
})();
