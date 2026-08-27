"use strict";

// Real photographs of the printed map tiles, when they are on this machine.
//
// tools/extract-mod.py pulls the Tabletop Simulator save apart and writes one
// PNG per tile side to assets/tts-extracted/map-tiles/individual/. Those files
// are publisher artwork, so they are gitignored — present for whoever ran the
// extractor, absent everywhere else. Nothing here may assume they exist.
//
// The extractor numbers tiles 1-21, the way the physical tiles are numbered.
// This app numbers them "01".."16" and "TI01".."TI05". The bridge below is
// twelve tiles matched by the names printed on their two sides (a tile whose
// A side is Cliffs of Dover and B side Torres del Paine is physical tile 1,
// and nothing else is), and nine assigned within their category because there
// is nothing printed on them to match. Both are marked, so nobody reads more
// certainty into this table than it has.
const CivTileArt = (() => {
  const BASE = "assets/tts-extracted/map-tiles/individual/";

  // match: the two side names line up with the physical tile — this is certain.
  // assign: no names to go on. Stable and one-to-one, but arbitrary within its
  //         group; capital tiles are dealt at random and the plain tiles are
  //         shuffled into the stack, so which is which does not affect play.
  const TILE_NUMBER = {
    "16":   { n: 1,  by: "match", sides: "Cliffs of Dover / Torres del Paine" },
    "TI05": { n: 2,  by: "match", sides: "Crater Lake / Mount Everest" },
    "11":   { n: 4,  by: "match", sides: "Galapagos / Grand Mesa" },
    "06":   { n: 6,  by: "match", sides: "Carthage / Kumasi" },
    "07":   { n: 12, by: "match", sides: "Brussels / Seoul" },
    "13":   { n: 13, by: "match", sides: "Mt Kilimanjaro / Pantanal" },
    "09":   { n: 14, by: "match", sides: "Geneva / Mohenjo Daro" },
    // The printed tile carries Kabul on the side this app calls B.
    "08":   { n: 15, by: "match", swap: true, sides: "Kabul / Buenos Aires" },
    "12":   { n: 18, by: "match", sides: "Mato Tipila / Dead Sea" },
    "TI02": { n: 19, by: "match", sides: "Ha Long Bay / Gobustan" },
    "10":   { n: 20, by: "match", swap: true, sides: "Akkad / Auckland" },
    "TI01": { n: 21, by: "match", sides: "Antananarivo / Palenque" },

    // The five capital tiles. The save flags 7, 9, 11, 16 and 17 as capitals
    // and prints nothing else on them to tell them apart.
    "01": { n: 7,  by: "assign" },
    "02": { n: 9,  by: "assign" },
    "03": { n: 11, by: "assign" },
    "04": { n: 16, by: "assign" },
    "05": { n: 17, by: "assign" },

    // The four plain tiles, likewise unmarked.
    "14":   { n: 3,  by: "assign" },
    "15":   { n: 5,  by: "assign" },
    "TI03": { n: 8,  by: "assign" },
    "TI04": { n: 10, by: "assign" }
  };

  const pad = (n) => String(n).padStart(2, "0");

  // Where the picture of this tile side would be. Null when we have no number
  // for the tile at all — never a guessed path.
  function tileImagePath(tileId, side) {
    const entry = TILE_NUMBER[tileId];
    if (!entry) return null;
    const s = (side === "B") ? "B" : "A";
    const printed = entry.swap ? (s === "A" ? "b" : "a") : s.toLowerCase();
    return `${BASE}tile-${pad(entry.n)}-side-${printed}.png`;
  }

  function tileFacts(tileId) {
    const entry = TILE_NUMBER[tileId];
    if (!entry) return null;
    return { number: entry.n, certain: entry.by === "match", sides: entry.sides || null };
  }

  // Whether a path actually resolves. Cached, because the answer is fixed for
  // the life of the page and a missing file must cost one request, not one per
  // render. Resolves false rather than rejecting: no art is normal.
  const probes = new Map();
  function hasTileImage(tileId, side) {
    const src = tileImagePath(tileId, side);
    if (!src) return Promise.resolve(false);
    if (probes.has(src)) return probes.get(src);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
    probes.set(src, p);
    return p;
  }

  return { tileImagePath, tileFacts, hasTileImage, TILE_NUMBER };
})();

if (typeof window !== "undefined") window.CivTileArt = CivTileArt;
