"use strict";

// Real photographs of the printed map tiles, when they are on this machine.
//
// tools/build-web-assets.py writes a compact WebP per tile side to
// assets/tts-web/map-tiles/individual/ — 42 files, all 21 tiles, both faces,
// and those ARE committed. The full-size PNGs under assets/tts-extracted/ are
// not. Nothing here assumes a file exists: every path is probed.
//
// The extractor numbers tiles 1-21, the way the physical tiles are numbered.
// This app numbers them "01".."16" and "TI01".."TI05". The bridge below is
// twelve tiles matched by the names printed on their two sides (a tile whose
// A side is Cliffs of Dover and B side Torres del Paine is physical tile 1,
// and nothing else is), and nine assigned within their category because there
// is nothing printed on them to match. Both are marked, so nobody reads more
// certainty into this table than it has.
//
// rules-data.js is transcribed from these same faces, so a tile's data and its
// photograph are two readings of one object rather than two guesses.
const CivTileArt = (() => {
  const BASE = "assets/tts-web/map-tiles/individual/";
  const EXT = ".webp";

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
    "08":   { n: 15, by: "match", sides: "Kabul / Buenos Aires" },
    "12":   { n: 18, by: "match", sides: "Mato Tipila / Dead Sea" },
    "TI02": { n: 19, by: "match", sides: "Ha Long Bay / Gobustan" },
    "10":   { n: 20, by: "match", sides: "Akkad / Auckland" },
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
    // Side A is side A: rules-data is transcribed straight off these faces, so
    // there is no longer any tile whose sides are the other way round.
    const s = (side === "B") ? "b" : "a";
    return `${BASE}tile-${pad(entry.n)}-side-${s}${EXT}`;
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

  // Where each cell sits inside the extracted face, in image pixels. This is
  // the same geometry the terrain was transcribed with, so a fit from these to
  // the board puts the photograph exactly where its hexes belong. Side B is
  // the A geometry mirrored vertically, which makes its fit a reflection —
  // handled by using a full affine solve rather than assuming a rotation.
  const IMG_W = 635, IMG_H = 990;
  const CELL_A = [[127, 880], [127, 660], [127, 440], [127, 220],
                  [317.5, 770], [317.5, 550], [317.5, 330], [317.5, 110],
                  [508, 440], [508, 220]];
  const CELL_B = CELL_A.map(([x, y]) => [x, IMG_H - y]);
  const cellPoints = (side) => (side === "B" ? CELL_B : CELL_A);

  // Loaded faces, and a note of the ones that failed so we stop asking.
  const images = new Map();
  function tileImage(tileId, side, onLoad) {
    const src = tileImagePath(tileId, side);
    if (!src) return null;
    if (images.has(src)) return images.get(src);
    const img = new Image();
    img.onload = () => { if (onLoad) onLoad(); };
    img.onerror = () => { images.set(src, null); };
    img.src = src;
    images.set(src, img);
    return img;
  }

  return { tileImagePath, tileFacts, hasTileImage, tileImage, cellPoints,
    IMG_W, IMG_H, TILE_NUMBER };
})();

if (typeof window !== "undefined") window.CivTileArt = CivTileArt;
