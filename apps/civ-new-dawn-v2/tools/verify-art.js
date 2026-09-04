// Does every picture the game asks for actually exist, and does the generated
// index still agree with the rules data?
//
//   node tools/verify-art.js
//
// Run it after tools/build-art-manifest.py, and after any change to the
// artwork pack. It is deliberately noisy: a wrong picture on a card is the
// kind of bug nobody notices until it is on the table.
"use strict";

const fs = require("fs");
const path = require("path");

const APP = path.dirname(__dirname);
const PACK = path.join(APP, "assets");
global.window = {};
eval(fs.readFileSync(path.join(APP, "assets/art-data.js"), "utf8"));
eval(fs.readFileSync(path.join(APP, "rules-data.js"), "utf8"));
eval(fs.readFileSync(path.join(APP, "card-art.js"), "utf8"));
const manifest = global.window.CivArtData;
const RULES = global.window.CivRulesData;
const ART = global.window.CivCardArt;

let pass = 0;
const fails = [];
const check = (name, cond) => { if (cond) pass++; else { fails.push(name); console.log("FAIL: " + name); } };

const exists = (rel) => rel && fs.existsSync(path.join(PACK, manifest.base.replace(/^assets\//, ""), rel));
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Static values transcribed directly from the tracked printed components.
// These deliberately live in the verifier rather than sharing the production
// constants: otherwise changing a bad value in both places would make the
// regression test agree with itself.
const PRINTED_WONDER_COSTS = {
  "Jebel Barkal": 7, Petra: 7, "Terracotta Army": 8,
  "Huey Teocalli": 9, "Venetian Arsenal": 10, Alhambra: 10,
  "Ruhr Valley": 11, Pentagon: 12, "Statue of Liberty": 12,
  Stonehenge: 7, "Hanging Gardens": 8, Colosseum: 9, "Taj Mahal": 9,
  "Forbidden City": 9, "Chichen Itza": 10, "Sydney Opera House": 10,
  "Cristo Redentor": 11, "Eiffel Tower": 12,
  Colossus: 7, "Great Lighthouse": 8, Apadana: 8, "Kilwa Kisiwani": 9,
  "Great Zimbabwe": 9, "Machu Picchu": 10, "Big Ben": 10, "Estadio Do Maracana": 10, Orszaghaz: 11,
  Oracle: 8, "Great Library": 8, Pyramids: 9, "University of Sankore": 9,
  "Porcelain Tower": 9, "Potala Palace": 10, "Oxford University": 10,
  "Amundsen-Scott Research Station": 10, Kremlin: 11
};

// key = rules tile id + side; value = printed spawn cell and helm letter.
// Physical tile numbers are listed beside each pair for quick visual re-checks.
//
// Re-audited against the tile photographs at 8x, in three renderings (plain
// crop, four rotations, and a brightness mask that separates the glyph from the
// helm silhouette). All eighteen cells do carry a printed helm and every cell
// index here is right. A, B, C, D, G and K read unambiguously and are unchanged.
// 07B was "B" and is H: the glyph is two uprights joined by a crossbar, and B
// would show closed counters. The E/F cluster - 08A, 08B, 12A, 12B, 15B, TI04A,
// TI04B - cannot be separated with confidence at this scan resolution and is
// left as transcribed; nothing in the rules engine reads a letter, because a
// figure is identified by its printed SPAWN, not by its letter.
const PRINTED_BARBARIANS = {
  "03A": { cell: 0, letter: "G" },                                  // physical 11A
  "07B": { cell: 0, letter: "H" },                                  // physical 12B
  "08A": { cell: 1, letter: "H" }, "08B": { cell: 2, letter: "E" }, // physical 15A/B
  "10A": { cell: 8, letter: "K" }, "10B": { cell: 0, letter: "K" }, // physical 20A/B
  "11A": { cell: 4, letter: "D" }, "11B": { cell: 0, letter: "D" }, // physical 4A/B
  "12A": { cell: 9, letter: "F" }, "12B": { cell: 5, letter: "E" }, // physical 18A/B
  "14A": { cell: 1, letter: "C" }, "14B": { cell: 6, letter: "C" }, // physical 3A/B
  "15B": { cell: 1, letter: "E" },                                  // physical 5B
  "16A": { cell: 2, letter: "A" }, "16B": { cell: 7, letter: "A" }, // physical 1A/B
  "TI04A": { cell: 1, letter: "F" }, "TI04B": { cell: 6, letter: "E" }, // physical 10A/B
  "TI05A": { cell: 4, letter: "B" }                                 // physical 2A
};

// --- printed static component data --------------------------------------
{
  const wonders = Object.values(RULES.WONDER_DECKS).flat();
  const actual = Object.fromEntries(wonders.map((wonder) => [wonder.name, wonder.cost]));
  const mismatches = Object.entries(PRINTED_WONDER_COSTS)
    .filter(([name, cost]) => actual[name] !== cost)
    .map(([name, cost]) => `${name}: data ${actual[name]}, printed ${cost}`);
  const unexpected = Object.keys(actual).filter((name) => !(name in PRINTED_WONDER_COSTS));
  check("Terracotta Army has its printed production cost of 8",
    actual["Terracotta Army"] === 8);
  check("all 36 playable wonder costs match the printed cards",
    wonders.length === 36 && mismatches.length === 0 && unexpected.length === 0);
  if (mismatches.length || unexpected.length) {
    console.log("  wonder cost mismatch:", mismatches.concat(unexpected.map((name) => `${name}: unexpected`)));
  }
}

{
  const actual = {};
  RULES.TILES.forEach((tile) => Object.entries(tile.sides).forEach(([side, face]) => {
    face.cells.forEach((cell, index) => {
      if (cell.barbarian) actual[tile.id + side] = { cell: index, letter: String(cell.barbarian) };
    });
  }));
  const mismatches = Object.entries(PRINTED_BARBARIANS).filter(([key, expected]) => {
    const found = actual[key];
    return !found || found.cell !== expected.cell || found.letter !== expected.letter;
  });
  const unexpected = Object.keys(actual).filter((key) => !(key in PRINTED_BARBARIANS));
  check("all 18 printed barbarian spawn cells and letters match tile metadata",
    Object.keys(actual).length === 18 && mismatches.length === 0 && unexpected.length === 0);
  if (mismatches.length || unexpected.length) {
    console.log("  barbarian metadata mismatch:", mismatches.map(([key]) => key).concat(unexpected));
  }
}

// --- every path in the manifest resolves ---------------------------------
{
  let checked = 0, missing = [];
  const walk = (node) => {
    if (typeof node === "string") {
      if (!/\.webp$/.test(node)) return;
      checked++;
      if (!exists(node)) missing.push(node);
    } else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(manifest);
  check(`all ${checked} manifest paths exist on disk`, missing.length === 0);
  if (missing.length) console.log("  missing:", missing.slice(0, 5));
}

// --- the focus row: every type, level and colour --------------------------
{
  const colors = manifest.colors;
  let holes = 0;
  Object.keys(RULES.CARD_DEFS).forEach((type) => {
    for (let tier = 1; tier <= 4; tier++) {
      const row = (manifest.focusByColor[type] || {})[String(tier)] || {};
      colors.forEach((c) => { if (!row[c]) holes++; });
    }
  });
  check("every focus card exists in all five colours", holes === 0);

  // The generated table has to describe the same 24 cards rules-data does,
  // or the picture and the effect text drift apart.
  let named = 0;
  Object.entries(RULES.CARD_DEFS).forEach(([type, tiers]) => {
    Object.entries(tiers).forEach(([tier, def]) => {
      const file = ((manifest.focusByColor[type] || {})[tier] || {}).red || "";
      const stem = path.basename(file).split("__")[0];
      // Red's level-I science card is filed as "astronomy" but is Astrology,
      // and blue's level-III military card has no name at all — both are
      // placed by elimination, so only the nameable ones are compared.
      if (/^deck-/.test(stem)) return;
      if (stem === slug(def.name)) named++;
      else console.log(`  note: ${type} ${tier} is ${stem}, rules say ${slug(def.name)}`);
    });
  });
  check(`the named focus cards match CARD_DEFS (${named}/24)`, named >= 22);
}

// --- one picture per thing the rules name ---------------------------------
{
  const leaders = RULES.LEADERS.map((l) => l.id);
  check("every leader has a civilization sheet", leaders.every((id) => manifest.civ[id]));
  check("every leader has a unique focus card", leaders.every((id) => manifest.unique[id]));
  check("every civilization uses a playable deck-211 focus card",
    leaders.every((id) => /__deck-211-/.test(manifest.unique[id] || "")));
  check("Sumeria uses Craftsmanship, not its solo AI behaviour card",
    /^cards\/focus\/craftsmanship__deck-211-/.test(manifest.unique.sumeria || ""));

  const wonders = [];
  Object.values(RULES.WONDER_DECKS).forEach((d) => d.forEach((w) => wonders.push(w.name)));
  const cardKeys = new Set(Object.keys(manifest.wonderCard).map(slug));
  const noCard = wonders.filter((w) => !cardKeys.has(slug(w)));
  check("every wonder in play has a card", noCard.length === 0);
  if (noCard.length) console.log("  no card:", noCard);

  check("every city-state has a card", Object.keys(RULES.CITY_STATES).every((n) => manifest.cityStateCard[n]));
  check("every city-state has a token", Object.keys(RULES.CITY_STATES).every((n) => manifest.cityStateToken[n]));

  const natural = new Set();
  RULES.TILES.forEach((t) => Object.values(t.sides).forEach((s) => s.cells.forEach((c) => {
    if (c.naturalWonder) natural.add(c.naturalWonder);
  })));
  check("every natural wonder printed on a tile has a token",
    [...natural].every((n) => manifest.naturalWonder[n]));

  // Terra p10 and the district rules: five districts, in every seat colour.
  const districts = ["campus", "trade", "encampment", "industrial", "theater"];
  check("every district exists in all five colours",
    manifest.colors.every((c) => districts.every((d) => (manifest.district[c] || {})[d])));
  // Terra p9 reinforces a district by flipping it, so every one of those needs
  // the printed back as well — otherwise a reinforced district silently draws
  // its plain side and the board stops reporting the state.
  check("every district has both printed sides",
    manifest.colors.every((c) => districts.every((d) => {
      const sides = (manifest.district[c] || {})[d];
      return sides && sides.plain && sides.reinforced;
    })));
  // The two sides differ only by the ring of dots, so a build that paired a
  // token with itself would look almost right and still lose the state.
  check("no district's two sides are the same file",
    manifest.colors.every((c) => districts.every((d) => {
      const sides = (manifest.district[c] || {})[d];
      return sides && sides.plain !== sides.reinforced;
    })));

  // Terra Incognita supplies five complete component colours. Purple's control
  // faces are derived from its two-up texture by build-art-manifest.py.
  const complete = manifest.colors.filter((c) =>
    manifest.control[c] && manifest.control[c].plain && manifest.control[c].reinforced);
  check(`five colours have a control token, plain and reinforced (${complete.join(", ")})`,
    complete.length === 5);

  check("every government has a token",
    Object.keys(RULES.GOVERNMENTS).every((t) => manifest.gov[t]));
  // The base rulebook's setup diagram labels the portrait token as Marble;
  // Mercury is the silver-droplet token. Keep the TTS filenames attached to
  // those identities instead of swapping them by visual guesswork.
  check("marble and mercury use the printed resource symbols",
    /^tokens\/marble__/.test(manifest.resource.marble || "") &&
    /^tokens\/mercury__/.test(manifest.resource.mercury || ""));
  check("every focus bar colour has art", manifest.colors.every((c) => manifest.focusBar[c]));
  check("every seat colour has a tech dial", manifest.colors.every((c) => manifest.dial[c]));
  check("every player-piece mesh has a render in all five colours",
    ["army", "caravan", "city", "capital"].every((kind) =>
      manifest.colors.every((c) => (manifest.piece[kind] || {})[c])));
  check("the printed event dial has art", !!manifest.eventDial);
}

// --- the barbarian letters actually printed on the tiles ------------------
{
  const letters = new Set();
  RULES.TILES.forEach((t) => Object.values(t.sides).forEach((s) => s.cells.forEach((c) => {
    if (c.barbarian) letters.add(String(c.barbarian));
  })));
  // Letters repeat across tiles — they name which of the eleven tokens goes
  // there, not a unique one — so this checks membership, not a bijection.
  const unknown = [...letters].filter((l) => !manifest.barbarian[l]);
  check(`every barbarian letter on a tile is one of the eleven tokens (${[...letters].sort().join("")})`,
    unknown.length === 0);
  if (unknown.length) console.log("  no token:", unknown);
}

// --- the module actually hands these back ------------------------------
{
  const seats = ART.seatColors.map((c) => c.id);
  check(`five seat colours including purple (${seats.join(", ")})`,
    seats.length === 5 && seats.includes("purple"));
  check("every seat colour resolves a control token, both faces",
    seats.every((c) => ART.control(c, false) && ART.control(c, true)));
  check("a legacy save colour still finds its components",
    ART.control("#457b9d", false) === ART.control("blue", false));
  check("all four player-piece models resolve through the module",
    ["army", "caravan", "city", "capital"].every((kind) =>
      seats.every((c) => ART.piece(kind, c))));

  check("every focus card resolves through the module",
    Object.keys(RULES.CARD_DEFS).every((t) =>
      [1, 2, 3, 4].every((tier) => seats.every((c) => ART.focusUrl(t, tier, c)))));

  const wonders = [];
  Object.values(RULES.WONDER_DECKS).forEach((d) => d.forEach((w) => wonders.push(w.name)));
  check("every wonder resolves a card through the module",
    wonders.every((w) => ART.wonderCard(w)));
  check("wonder() gives a CSS background", /^background-image:url\(".+"\);$/.test(ART.wonder(wonders[0])));

  check("every agenda finds its victory card",
    RULES.AGENDA_CARDS.every((a) => ART.victory(a.id)));
  // A card is looked up by the agendas on it, so if the rules data pairs two
  // agendas the printed card does not, the picture and the text below it stop
  // describing the same card. This is the check that keeps them together.
  let vbad = 0;
  RULES.VICTORY_CARDS.forEach((c) => {
    const printed = manifest.victory.find((v) => v.agendas.indexOf(c.agendas[0]) >= 0);
    const same = printed && printed.agendas.length === c.agendas.length &&
      c.agendas.every((a) => printed.agendas.indexOf(a) >= 0);
    if (!same) {
      vbad++;
      console.log(`  ${c.id} pairs ${c.agendas.join(" + ")}, the card pairs ${printed ? printed.agendas.join(" + ") : "nothing"}`);
    }
  });
  check("every victory card pairs the agendas its printed face does", vbad === 0);
  check("Ibrahim has a card", !!ART.ibrahim());
  check("a barbarian space always gets a token, lettered or not",
    !!ART.barbarianForSpace("G", "0,0") && !!ART.barbarianForSpace(null, "3,-1"));
  check("and the unlettered one is the same on every client",
    ART.barbarianForSpace(null, "3,-1") === ART.barbarianForSpace(null, "3,-1"));
}

console.log(`\nART INDEX: ${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
