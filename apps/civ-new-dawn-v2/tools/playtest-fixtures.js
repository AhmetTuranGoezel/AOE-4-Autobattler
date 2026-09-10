"use strict";

// Browser fixture builders, never shipped as game runtime. Serialized into
// isolated Chrome pages; all actual decisions still use UI/Net/reducer paths.
function playtestBoard(Game, profiles, mode) {
  const random = Math.random;
  let seed = 27092026;
  let st;
  try {
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    st = Game.createState(profiles.map((p) => Game.createPlayer(p.id, p.name, p.color)));
  } finally { Math.random = random; }
  st.setup.order = profiles.map((p) => p.id);
  st.turn.order = st.setup.order.slice();
  st.turn.index = 0;
  st.tiles = st.setup.tiles;
  if (mode === "setup") return st;
  Game.finalizeSetup(st);
  st.phase = "playing"; st.setup.phase = "done";
  st.pendingChoices = []; st.turnUndo = null; st.districtEvent = null;
  st.cardResolution = null; st.log = []; st.naturalWonders = {};
  st.players.forEach((p) => {
    p.leaderId = "china"; p.cardPlayed = false; p.tech = 0;
    p.armies.forEach((u) => { u.position = null; });
    p.caravans.forEach((u) => { u.position = null; });
    Game.FOCUS_TYPES.forEach((t) => { p.trade[t] = 0; });
  });
  Object.values(st.map.hexes).forEach((h) => Object.assign(h, {
    active: false, revealed: false, terrain: "grass", tileId: null, city: null,
    control: null, resource: null, naturalWonder: null, naturalWonderSpace: null,
    fortress: false, cityState: null, barbarian: false, unownedWonder: null
  }));
  Object.values(st.tiles).forEach((t) => { t.placed = false; t.ownerId = null; });
  const put = (key, props = {}) => Object.assign(st.map.hexes[key], { active: true, revealed: true }, props);
  const city = (id) => ({ ownerId: id, isCapital: true, developed: true, hasWonder: false, wonder: null });
  if (mode === "astronomy") {
    // The entire ten-cell physical capital, not whichever map tile happens
    // to contain a convenient test origin. One interior cell, water edges.
    const capitalKeys = Game.getTileHexKeys("0,0", 0, st.map.hexes);
    capitalKeys.forEach((k) => put(k, { tileId: "01" }));
    put("0,0", { city: city(st.players[0].id), tileId: "01" });
    const edge = capitalKeys.find((k) => {
      const h = st.map.hexes[k];
      return Game.hexNeighborKeys(h.q, h.r).some((n) => !st.map.hexes[n]?.active);
    });
    st.map.hexes[edge].terrain = "water";
    put("5,0", { tileId: "02", city: city(st.players[1]?.id || "rival") });
    put("5,1", { tileId: "14" });
    put("4,2", { tileId: "fortress", fortress: true });
    ["01", "02", "14"].forEach((id) => { st.tiles[id].placed = true; });
    const p = st.players[0];
    p.leaderId = "poland"; p.uniqueTaken = true;
    p.polandFirstTurnUsed = true; // This fixture is already at science II.
    p.cardTiers.science = 2; p.cardLevels.science = 2;
    p.armies[0].position = "-1,0";
    p.focusRow = ["culture", "growth", "science", "economy", "military", "industry"];
    st.tileStack = ["15", "06", "07"]; st.tileDeck = st.tileStack.slice();
    st.fixture = { water: edge, capitalKeys };
  } else if (mode === "district") {
    // Actual first player can differ from host, player array and current turn.
    const kinds = [["theater", "industrial"], ["theater"], [], ["theater", "industrial"]];
    st.players.forEach((p, i) => {
      const q = i * 4 - 6;
      put(`${q},0`, { city: city(p.id) });
      kinds[i].forEach((kind, j) => put(`${q + j},1`, { terrain: kind === "industrial" ? "forest" : "grass",
        control: { ownerId: p.id, fortified: false, district: kind } }));
      for (let j = -1; j < 3; j++) put(`${q + j},2`);
    });
    st.turn.index = 3;
  } else if (mode === "dice") {
    const p = st.players[0];
    put("0,0", { city: city(p.id) });
    put("1,0", { barbarian: true });
    p.armies[0].position = "0,0";
    p.trade.military = 3;
  } else if (mode === "wonder") {
    put("0,0", { city: city(st.players[0].id) });
    put("1,0", { terrain: "mountain", resource: "wonder",
      naturalWonder: "Mt. Everest", naturalWonderSpace: "Mt. Everest" });
  }
  return st;
}

module.exports = { playtestBoard };
