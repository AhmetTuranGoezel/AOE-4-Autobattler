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

  // Only four colours have a control token with a reinforced back, and the
  // game seats four. A fifth seat would have nothing to flip.
  const complete = manifest.colors.filter((c) =>
    manifest.control[c] && manifest.control[c].plain && manifest.control[c].reinforced);
  check(`four colours have a control token, plain and reinforced (${complete.join(", ")})`,
    complete.length === 4);

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
  check(`four seat colours, no purple (${seats.join(", ")})`,
    seats.length === 4 && !seats.includes("purple"));
  check("every seat colour resolves a control token, both faces",
    seats.every((c) => ART.control(c, false) && ART.control(c, true)));
  check("a legacy save colour still finds its components",
    ART.control("#457b9d", false) === ART.control("blue", false));

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
