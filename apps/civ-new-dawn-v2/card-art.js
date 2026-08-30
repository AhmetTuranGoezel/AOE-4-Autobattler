"use strict";

// Where every picture of a physical component lives.
//
// The old loader pointed at ignored assets/mod/*.jpg sprite sheets, so card art
// silently disappeared for anyone who had not downloaded them. Everything here
// is a tracked WebP under assets/tts-web, indexed by assets/art-data.js, which
// tools/build-art-manifest.py generates from the pack itself — no directory
// scan, no catalog fetch, and nothing hand-maintained that a rename can rot.
//
// Keep gameplay state out of this module: it answers "what does this look
// like", never "what is this worth".
//
// Every lookup returns "" when it has no picture, and every caller must cope —
// four wonders genuinely have no token in the pack, and the game has to run
// with assets/tts-web deleted.

const CivCardArt = (() => {
  const DATA = (typeof window !== "undefined" && window.CivArtData) || null;
  const ROOT = DATA ? DATA.base : "assets/tts-web/";

  // The printed player colours. Only the first four have a control token with
  // a reinforced back, and the game seats four (CFG.maxPlayers), so purple is
  // the spare set: indexed, but never dealt.
  const PLAYER_COLORS = [
    { id: "blue", label: "Blue", value: "#169eae" },
    { id: "red", label: "Red", value: "#d94747" },
    { id: "orange", label: "Orange", value: "#e88b24" },
    { id: "green", label: "Green", value: "#76a94f" },
    { id: "purple", label: "Purple", value: "#8b62b5" }
  ];
  const SEAT_COLORS = PLAYER_COLORS.filter((c) => c.id !== "purple");

  // Colours from before the components were matched, so an old save still
  // resolves to a component rather than to the nearest-match guess below.
  const LEGACY_COLOR_IDS = {
    "#e63946": "red", "#457b9d": "blue", "#2a9d8f": "blue",
    "#e9c46a": "orange", "#9b5de5": "purple", "#f77f00": "orange"
  };

  function colorId(value) {
    const raw = String(value || "").toLowerCase();
    const exact = PLAYER_COLORS.find((c) => c.id === raw || c.value.toLowerCase() === raw);
    if (exact) return exact.id;
    if (LEGACY_COLOR_IDS[raw]) return LEGACY_COLOR_IDS[raw];

    const match = raw.match(/^#([0-9a-f]{6})$/);
    if (!match) return "blue";
    const n = Number.parseInt(match[1], 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    let best = PLAYER_COLORS[0];
    let bestDistance = Infinity;
    PLAYER_COLORS.forEach((candidate) => {
      const c = Number.parseInt(candidate.value.slice(1), 16);
      const other = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      const distance = rgb.reduce((sum, part, i) => sum + (part - other[i]) ** 2, 0);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    });
    return best.id;
  }

  const at = (path) => (path ? ROOT + path : "");
  const group = (name) => (DATA && DATA[name]) || {};

  // Wonder and city-state names are typed in several places with different
  // accents and abbreviations, so names are matched loosely rather than exactly.
  function looseFind(table, name) {
    if (!name) return "";
    if (table[name]) return table[name];
    const want = String(name).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
    const key = Object.keys(table).find(
      (k) => k.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "") === want);
    return key ? table[key] : "";
  }

  const tier4 = (tier) => String(Math.max(1, Math.min(4, Number(tier) || 1)));

  function focusUrl(type, tier, color) {
    const row = (group("focusByColor")[type] || {})[tier4(tier)];
    if (!row) return "";
    return at(row[colorId(color)] || row.blue || "");
  }

  const uniqueUrl = (leaderId) => at(group("unique")[String(leaderId || "").toLowerCase()]);
  const civilizationUrl = (leaderId) => at(group("civ")[String(leaderId || "").toLowerCase()]);
  const wonderCardUrl = (name) => at(looseFind(group("wonderCard"), name));
  const wonderTokenUrl = (name) => at(looseFind(group("wonderToken"), name));
  const cityStateCardUrl = (name) => at(looseFind(group("cityStateCard"), name));
  const cityStateTokenUrl = (name) => at(looseFind(group("cityStateToken"), name));
  const naturalWonderUrl = (name) => at(looseFind(group("naturalWonder"), name));
  const resourceUrl = (kind) => at(group("resource")[kind]);
  const barbarianUrl = (letter) => at(group("barbarian")[String(letter || "").toUpperCase()]);
  const govUrl = (focusType) => at(group("gov")[focusType]);
  const dialUrl = (color) => at(group("dial")[colorId(color)]);
  const focusBarUrl = (color) => at(group("focusBar")[colorId(color)]);
  const districtUrl = (color, kind) => at((group("district")[colorId(color)] || {})[kind]);
  const diplomacyUrl = (color, kind) => at((group("diplomacy")[colorId(color)] || {})[kind]);
  const pieceUrl = (kind, color) => at((group("piece")[kind] || {})[colorId(color)]);

  // A control token has two faces: plain, and the reinforced back with the
  // ring of dots. Flipping it is what reinforcing looks like on the table.
  function controlUrl(color, reinforced) {
    const set = group("control")[colorId(color)] || {};
    return at(reinforced ? set.reinforced : set.plain);
  }

  // The victory cards are indexed by the agendas printed on them, because that
  // is the only thing the rules data and the card have in common.
  function victoryUrl(agendaId) {
    const list = (DATA && DATA.victory) || [];
    const card = list.find((v) => v.agendas.indexOf(agendaId) >= 0);
    return card ? at(card.file) : "";
  }

  // Barbarian spaces print a letter naming which token belongs there (Terra p6
  // step 4a). When a space has none, any token will do — but it has to be the
  // same one on every client, so it comes from the space, not from a roll.
  function barbarianForSpace(letter, hexKey) {
    const direct = barbarianUrl(letter);
    if (direct) return direct;
    const table = group("barbarian");
    const keys = Object.keys(table).sort();
    if (!keys.length) return "";
    let h = 0;
    String(hexKey || "").split("").forEach((ch) => { h = (h * 31 + ch.charCodeAt(0)) | 0; });
    return at(table[keys[Math.abs(h) % keys.length]]);
  }

  const styleFor = (url) => (url ? `background-image:url("${url}");` : "");

  return {
    // Kept async and truthy for callers written against the old sheet loader.
    load: () => Promise.resolve(!!DATA),
    available: () => !!DATA,

    colors: PLAYER_COLORS.map((c) => ({ ...c })),
    seatColors: SEAT_COLORS.map((c) => ({ ...c })),
    colorId,

    // Plain URLs, for canvas drawing and <img>.
    focusUrl, uniqueUrl,
    civilization: civilizationUrl,
    wonderCard: wonderCardUrl,
    wonderToken: wonderTokenUrl,
    cityStateCard: cityStateCardUrl,
    cityStateToken: cityStateTokenUrl,
    naturalWonder: naturalWonderUrl,
    resource: resourceUrl,
    barbarian: barbarianUrl,
    barbarianForSpace,
    gov: govUrl,
    district: districtUrl,
    diplomacy: diplomacyUrl,
    piece: pieceUrl,
    control: controlUrl,
    victory: victoryUrl,
    techDial: dialUrl,
    focusBar: focusBarUrl,
    fort: () => at(DATA && DATA.fort),
    // The printed single-hex water token (Terra p3), laid in a hole that
    // exploration has closed around.
    waterToken: () => at(DATA && DATA.waterToken),
    eventTracker: () => at(DATA && DATA.eventTracker),
    eventDial: () => at(DATA && DATA.eventDial),
    barbDirection: () => at(DATA && DATA.barbDirection),
    board: (i) => at(((DATA && DATA.boards) || [])[i || 0]),
    ibrahim: () => at(DATA && DATA.ibrahim),

    // CSS background declarations, for the card faces that are styled divs.
    focus(type, tier, color) { return styleFor(focusUrl(type, tier, color)); },
    unique(leaderId) { return styleFor(uniqueUrl(leaderId)); },
    civilizationStyle(leaderId) { return styleFor(civilizationUrl(leaderId)); },
    wonder(name) { return styleFor(wonderCardUrl(name)); },
    style: styleFor
  };
})();

if (typeof window !== "undefined") window.CivCardArt = CivCardArt;
