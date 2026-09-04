"use strict";

const Game = (() => {
  const RULES = window.CivRulesData || {};
  const RULE_VERSION = RULES.rulesVersion || 0;
  // Save format and rules data evolve independently. A rules correction must
  // not make an otherwise readable save look like a different file format.
  const SAVE_SCHEMA_VERSION = 2;
  const MAX_LOG_ENTRIES = 500;
  const MAX_CHAT_ENTRIES = 100;
  const RULE_TILES = Array.isArray(RULES.TILES) ? RULES.TILES : [];
  const RULE_TILE_BY_ID = Object.fromEntries(RULE_TILES.map((t) => [t.id, t]));
  const CITY_STATE_DATA = RULES.CITY_STATES || {};
  const NATURAL_WONDER_RESOURCES = RULES.NATURAL_WONDER_RESOURCES || {};
  const WONDER_RESOURCE_ELIGIBILITY = RULES.WONDER_RESOURCE_ELIGIBILITY || {};
  const DIPLOMACY_CARDS = RULES.DIPLOMACY_CARDS || {};
  const AGENDA_CARDS = Array.isArray(RULES.AGENDA_CARDS) ? RULES.AGENDA_CARDS : [];
  const VICTORY_CARDS = Array.isArray(RULES.VICTORY_CARDS) ? RULES.VICTORY_CARDS : [];
  const CARD_DEFS = RULES.CARD_DEFS || {};
  const GOVERNMENTS = RULES.GOVERNMENTS || {};
  const CIV_STYLE = RULES.CIV_STYLE || {};
  const LEADERS = Array.isArray(RULES.LEADERS) ? RULES.LEADERS.filter((l) => l && l.id !== "random") : [];
  const LEADER_BY_ID = Object.fromEntries(LEADERS.map((l) => [l.id, l]));

  function getLeader(player) {
    return player ? LEADER_BY_ID[player.leaderId] || null : null;
  }
  function hasLeader(player, id) {
    return !!player && player.leaderId === id;
  }

  // The civ's unique focus card if the player currently runs a card of its
  // type at its tier. A tech level I unique replaces the level I card of the
  // same type in the starting row, so it is there from the off; a level II or
  // higher unique is only in play once its owner chose to take it in place of
  // a focus card of that level (Terra p8).
  function getActiveUniqueCard(player, cardType) {
    const leader = getLeader(player);
    if (!leader || !leader.unique) return null;
    const u = leader.unique;
    if (u.type !== cardType) return null;
    const tier = (player.cardTiers && player.cardTiers[cardType]) || 1;
    if (tier !== u.tier) return null;
    return u.tier === 1 || player.uniqueTaken ? u : null;
  }

  // True while the civ's unique card is the one it is running right now, so
  // the hard-coded unique effects switch off with it.
  function uniqueInPlay(player, leaderId) {
    if (!hasLeader(player, leaderId)) return false;
    const leader = getLeader(player);
    return !!(leader && leader.unique && getActiveUniqueCard(player, leader.unique.type));
  }

  // The extra option on an upgrade prompt that hands a player their own level
  // II+ unique card instead of the printed one. Offered whenever the upgrade
  // would land that card type on the unique's tech level.
  function uniqueUpgradeOption(player, cardType, resultTier) {
    const leader = getLeader(player);
    if (!leader || !leader.unique) return null;
    const u = leader.unique;
    if (u.tier < 2 || player.uniqueTaken) return null;
    if (u.type !== cardType || resultTier !== u.tier) return null;
    return { id: "unique_" + cardType, unique: true, text: u.text || "",
      label: `${FOCUS_LABELS[cardType]} \u2192 ${u.name} (your unique tier ${u.tier})` };
  }

  // Printed effect text for the card a player currently runs of this type.
  // A civ's unique card overrides the standard card at its tier.
  function getCardEffectText(player, cardType) {
    const u = getActiveUniqueCard(player, cardType);
    if (u) return u.text || "";
    const tier = (player.cardTiers && player.cardTiers[cardType]) || 1;
    const def = (CARD_DEFS[cardType] || {})[tier];
    return (def && def.effectText) || "";
  }

  function getCardName(player, cardType) {
    const u = getActiveUniqueCard(player, cardType);
    if (u) return u.name;
    const tier = (player.cardTiers && player.cardTiers[cardType]) || 1;
    return (CARD_NAMES[cardType] || [])[tier - 1] || cardType;
  }
  const TERRAIN = { grass: 1, hill: 2, forest: 3, desert: 4, mountain: 5, water: 1 };
  const TERRAIN_LABELS = { grass: "Grassland", hill: "Hills", forest: "Forest", desert: "Desert", mountain: "Mountain", water: "Water" };
  const FOCUS_TYPES = ["culture", "growth", "science", "economy", "military", "industry"];
  const FOCUS_LABELS = { culture: "Culture", growth: "Growth", science: "Science", economy: "Economy", military: "Military", industry: "Industry" };
  const FOCUS_SLOTS = [1, 1, 2, 3, 4, 5];
  const CARD_NAMES = {
    culture:  ["Early Empire", "Drama & Poetry", "Civil Service", "Mass Media"],
    growth:   ["Irrigation", "Engineering", "Sanitation", "Globalization"],
    science:  ["Astrology", "Mathematics", "Replaceable Parts", "Nuclear Power"],
    economy:  ["Foreign Trade", "Currency", "Steam Power", "Capitalism"],
    military: ["Masonry", "Iron Working", "Mass Production", "Flight"],
    industry: ["Pottery", "Animal Husbandry", "Nationalism", "Urbanization"]
  };
  // Stable typographic marks for integrations that still consume this public
  // table. Platform emoji rendered inconsistently and made the tabletop UI
  // look like a prototype; the main interface combines these with type colour.
  const CARD_ICONS = {
    culture: "CU", growth: "GR", science: "SC",
    economy: "EC", military: "MI", industry: "IN"
  };
  // Straight from the rulebook's Handelsmarker table: each token spent on a card
  // gives exactly this. Note culture gives an extra TOKEN, not extra reach.
  const FOCUS_TRADE_DESC = {
    culture: "Place 1 additional control token",
    growth: "Reinforce 1 additional control token",
    science: "Advance the tech dial 1 additional space",
    economy: "Each caravan moves 1 additional space",
    military: "+1 combat value for this combat",
    industry: "+1 production when building a wonder"
  };
  const DISTRICTS = ["campus", "trade", "encampment", "industrial", "theater"];
  const DISTRICT_LABELS = { campus: "Campus", trade: "Market", encampment: "Encampment", industrial: "Industrial", theater: "Theater" };
  const DISTRICT_EFFECTS = {
    campus: "+1 trade (science) per adj. mountain/wonder (max 3)",
    trade: "+1 trade per mature city OR adj. desert",
    encampment: "defeat barb within 2, then reinforce 1 within 2",
    industrial: "+1 trade per adj. forest (max 3)",
    theater: "place 1 control within 2 of district"
  };
  const RESOURCES = ["marble", "mercury", "oil", "diamonds"];
  // The Terra Incognita dial, read off the printed face (Terra p3, p6 and p14).
  // Six sections, no blanks, and two of them carry two icons: the wonder icon
  // shares a space with barbarian spawning and with government, and always
  // resolves last in its space. The pointer is set to the helmet with the star
  // at setup (base p5, Terra p6) and that space is NOT resolved then — which is
  // exactly why p14 says the wonder icon fires "except during setup".
  //
  // The expansion dial has no trade icon at all: mature cities now earn trade
  // through the commercial hub district instead.
  const EVENTS = [
    ["barbarian_return", "wonder_tokens"],
    ["barbarian_move"],
    ["district_event"],
    ["gov_change", "wonder_tokens"],
    ["barbarian_move"],
    ["district_event"]
  ];
  const EVENT_LABELS = {
    barbarian_move: "Barbarians Move", barbarian_return: "Barbarians Appear",
    district_event: "Districts", gov_change: "Government Change",
    wonder_tokens: "World Wonders"
  };
  const EVENT_NAMES = EVENTS.reduce((all, section) => all.concat(section), []);
  const CITY_NAMES = Object.keys(CITY_STATE_DATA).length
    ? Object.keys(CITY_STATE_DATA)
    : ["Akkad", "Seoul", "Buenos Aires", "Venice", "Kabul", "Geneva", "Nan Madol", "Brussels", "Preslav", "Carthage", "Valletta", "Antananarivo"];
  let WONDERS; // set after ALL_WONDERS is defined

  const CFG = {
    mapRadius: 9,
    maxTrade: 3,
    // BLOCKED on an English component count; Infinity is the long-standing
    // behaviour. See placeControlToken.
    controlTokens: Infinity,
    maxArmies: 3,
    maxCaravans: 1,
    maxGovMarkers: 2,
    barbarianBase: 0,
    cityStateDefense: 8,
    fortressDefense: 6,
    resourceProdValue: 2,
    techWheelSize: 24,
    techResetAt: 15,   // past space 24 the arrow jumps straight here (base p16)
    maxRounds: 20,
    minPlayers: 2,
    maxPlayers: 5,
    victoryMilitary: 12,
    victoryScience: 24,
    victoryCulture: 3,
    victoryEconomy: 4
  };

  const CARD_TIERS = {
    culture:  { move: [0,0,0,0], markers: [2,2,2,3] },
    growth:   { move: [0,0,0,0], markers: [1,1,1,1] },
    science:  { move: [0,0,0,0], markers: [0,0,0,0] },
    economy:  { move: [3,4,6,6], wagons: [1,2,2,3], water: 3 },
    military: { move: [3,4,5,6], armies: [1,2,2,2], water: 3, combatBonus: [0,2,2,3] },
    industry: { cityRange: [2,3,4,5], move: [0,0,0,0] }
  };

  const WONDER_DECKS = RULES.WONDER_DECKS || {};
  const ALL_WONDERS = Object.entries(WONDER_DECKS).flatMap(([type, wonders]) =>
    (wonders || []).map((w) => ({ ...w, type }))
  );
  const WONDER_ERAS = buildWonderEras(WONDER_DECKS);
  WONDERS = ALL_WONDERS;

  function buildWonderEras(decks) {
    const eras = {};
    Object.entries(decks || {}).forEach(([type, wonders]) => {
      (wonders || []).forEach((wonder) => {
        if (!eras[wonder.era]) eras[wonder.era] = { cost: wonder.cost || 7, wonders: [] };
        eras[wonder.era].wonders.push({ ...wonder, type });
      });
    });
    return eras;
  }

  const CAPITAL_HEX_OFFSET_INDEX = 6;

  const HEX_DIRS = [
    { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
    { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
    { dq: 1, dr: -1 }, { dq: -1, dr: 1 }
  ];

  // The printed barbarian direction token is numbered clockwise. The physical
  // token is flat-top; the browser map is pointy-top, so its face 1 sits on the
  // north-east edge after the same 30 degree turn used for the board art.
  // Keeping this separate from HEX_DIRS matters: HEX_DIRS is only an
  // enumeration (E, W, SE, NW, NE, SW), not a clockwise ring.
  const BARBARIAN_DIRS = Object.freeze([
    { face: 1, dq:  1, dr: -1, name: "NE", label: "north-east" },
    { face: 2, dq:  1, dr:  0, name: "E",  label: "east" },
    { face: 3, dq:  0, dr:  1, name: "SE", label: "south-east" },
    { face: 4, dq: -1, dr:  1, name: "SW", label: "south-west" },
    { face: 5, dq: -1, dr:  0, name: "W",  label: "west" },
    { face: 6, dq:  0, dr: -1, name: "NW", label: "north-west" }
  ].map(Object.freeze));

  // 10-hex tile shape (irregular parallelogram)
  // Row 0: 4 hexes, Row 1: 4 hexes, Row 2: 2 hexes (right side)
  // Pivot/anchor at row 1, col 1 → axial (0,0)
  const TILE_OFFSETS = (() => {
    const coords = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 },
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
      { row: 2, col: 2 }, { row: 2, col: 3 }
    ];
    const pivot = { row: 1, col: 1 };
    function toAxial(row, col) {
      const q = col - Math.floor((row - (row & 1)) / 2);
      return { q, r: row };
    }
    const pivotAx = toAxial(pivot.row, pivot.col);
    return coords.map((c) => {
      const ax = toAxial(c.row, c.col);
      return { q: ax.q - pivotAx.q, r: ax.r - pivotAx.r };
    });
  })();

  function getCoreAnchors(playerCount) {
    // A two- or three-player core is two tiles, so it sits tighter in the middle.
    if (playerCount <= 3) return [
      { q: 0, r: -1, rotation: 0 },
      { q: -1, r: 1, rotation: 3 }
    ];
    return [
      { q: -1, r: -1, rotation: 0 },
      { q: 3,  r: -1, rotation: 0 },
      { q: -2, r: 1,  rotation: 3 },
      { q: 2,  r: 1,  rotation: 3 }
    ];
  }

  // --- Map & Tile Functions ---

  function buildEmptyMap(radius) {
    const hexes = {};
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.abs(q + r) > radius) continue;
        hexes[key(q, r)] = {
          q, r,
          terrain: "grass",
          active: false,
          revealed: false,
          resource: null,
          cityState: null,
          unownedWonder: null,
          barbarian: false,
          control: null,
          city: null,
          fortress: false,
          fortressOwnerId: null,
          core: false,
          coreAdjacent: false,
          tileId: null
        };
      }
    }
    return { radius, hexes };
  }

  function blankMapHex(q, r) {
    return {
      q, r,
      terrain: "grass",
      active: false,
      revealed: false,
      resource: null,
      // `naturalWonder` is the TOKEN, and it sits on the map only until
      // somebody claims it. `naturalWonderSpace` is the printed space it
      // started on and never changes, so a card that asks about a natural
      // wonder SPACE still has something to read once the token has gone.
      naturalWonder: null,
      naturalWonderSpace: null,
      cityState: null,
      unownedWonder: null,
      barbarian: false,
      barbarianId: null,
      barbarianToken: null,
      control: null,
      city: null,
      fortress: false,
      fortressOwnerId: null,
      core: false,
      coreAdjacent: false,
      tileId: null
    };
  }

  function axialRadius(q, r) {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  }

  // The coordinate dictionary is storage, not the edge of the world. Terra
  // Incognita can grow into any axial coordinate, so placement first works in
  // coordinate space and only materialises the required rings when a physical
  // tile is committed. Keeping a small inactive margin lets setup placement,
  // hole filling and ordinary hover rendering keep using their existing finite
  // scans without turning that margin into a gameplay boundary.
  function ensureMapRadius(map, requiredRadius) {
    if (!map || !map.hexes) return map;
    const target = Math.max(0, Math.ceil(Number(requiredRadius) || 0));
    const current = Math.max(0, Number(map.radius) || 0);
    if (target <= current) return map;
    for (let q = -target; q <= target; q++) {
      for (let r = -target; r <= target; r++) {
        if (Math.abs(q + r) > target) continue;
        const hexKey = key(q, r);
        if (!map.hexes[hexKey]) map.hexes[hexKey] = blankMapHex(q, r);
      }
    }
    map.radius = target;
    return map;
  }

  function ensureMapHexes(map, hexKeys, margin) {
    const keys = Array.isArray(hexKeys) ? hexKeys : Array.from(hexKeys || []);
    let needed = Math.max(0, Number(map && map.radius) || 0);
    keys.forEach((hexKey) => {
      if (typeof hexKey !== "string" || !hexKey.includes(",")) return;
      needed = Math.max(needed, axialRadius(parseQ(hexKey), parseR(hexKey)));
    });
    ensureMapRadius(map, needed + Math.max(0, Number(margin) || 0));
    // A migrated/test state may be sparse even inside its recorded radius.
    // The cells being committed must exist regardless of that metadata.
    keys.forEach((hexKey) => {
      if (map.hexes[hexKey]) return;
      const q = parseQ(hexKey), r = parseR(hexKey);
      if (Number.isInteger(q) && Number.isInteger(r)) map.hexes[hexKey] = blankMapHex(q, r);
    });
    return map;
  }

  function rotateAxial(coord, steps) {
    let x = coord.q;
    let z = coord.r;
    let y = -x - z;
    for (let i = 0; i < steps; i++) {
      const nx = -z;
      const ny = -x;
      const nz = -y;
      x = nx; y = ny; z = nz;
    }
    return { q: x, r: z };
  }

  function getTileHexKeys(anchorKey, rotation, mapHexes) {
    const aq = parseQ(anchorKey);
    const ar = parseR(anchorKey);
    return TILE_OFFSETS.map((off) => {
      const rotated = rotateAxial(off, rotation);
      return key(aq + rotated.q, ar + rotated.r);
    });
  }

  function validateTilePlacement(st, tileId, anchorKey, rotation) {
    const tile = st.setup.tiles[tileId];
    if (!tile || tile.placed) return { ok: false };
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
    if (cellKeys.length !== TILE_OFFSETS.length) return { ok: false };
    if (cellKeys.some((k) => st.map.hexes[k] && st.map.hexes[k].active)) return { ok: false };

    // The advanced draft (Terra p14) places the first tiles of the game onto an
    // otherwise empty board — nothing exists yet for them to touch. Standard
    // setup never reaches this function with an empty map (its core tiles are
    // placed directly, unvalidated), so this only ever fires for that bootstrap.
    if (!Object.values(st.map.hexes).some((h) => h.active)) return { ok: true, touchesCore: false, touchesCoreAdj: false };

    const cellSet = new Set(cellKeys);
    // Terra p5, step h: a capital tile must touch four spaces "on forts and/or
    // core tiles", and the diagram spells out that "spaces on other capital
    // tiles do not count". Capital tiles may still touch each other — those
    // spaces just buy you nothing.
    const capitalPhase = st.setup.phase === "capital_tile";
    const counting = new Set();
    let touchesCore = false;
    let touchesCoreAdj = false;

    cellKeys.forEach((k) => {
      hexNeighborKeys(parseQ(k), parseR(k)).forEach((nk) => {
        if (cellSet.has(nk)) return;
        const nh = st.map.hexes[nk];
        if (!nh || !nh.active) return;
        if (!capitalPhase || nh.core || nh.fortress) counting.add(nk);
        if (nh.core) touchesCore = true;
        if (nh.coreAdjacent) touchesCoreAdj = true;
      });
    });

    if (!tile.isCore && counting.size < 4) return { ok: false };
    if (!tile.isCore && !capitalPhase && !touchesCore && !touchesCoreAdj) return { ok: false };
    return { ok: true, touchesCore, touchesCoreAdj };
  }

  // A tile is a physical thing you turn in your hand until it fits. Asking "does
  // this spot work?" should mean "at any angle", not "at the angle the buttons
  // happen to be on" — so this hands back the first rotation that fits, and the
  // UI can place from a single click.
  function tilePlacementFor(st, tileId, anchorKey, preferRotation, validate) {
    const check = validate || validateTilePlacement;
    const order = [];
    for (let i = 0; i < 6; i++) order.push(((preferRotation || 0) + i) % 6);
    for (const rotation of order) {
      const result = check(st, tileId, anchorKey, rotation);
      if (result.ok) return { rotation, result };
    }
    return null;
  }

  // Every spot the tile could go, whatever angle it ends up at.
  function getTileAnchorsAnyRotation(st, tileId, validate) {
    const anchors = new Set();
    Object.keys(st.map.hexes).forEach((k) => {
      if (tilePlacementFor(st, tileId, k, 0, validate)) anchors.add(k);
    });
    return anchors;
  }

  function getValidTileAnchors(st, tileId, rotation) {
    const anchors = [];
    const coreAnchors = [];
    const tile = st.setup.tiles[tileId];
    if (!tile) return [];
    Object.keys(st.map.hexes).forEach((k) => {
      const result = validateTilePlacement(st, tileId, k, rotation);
      if (!result.ok) return;
      anchors.push(k);
      if (result.touchesCore) coreAnchors.push(k);
    });
    if (!tile.isCore && coreAnchors.length) return coreAnchors;
    return anchors;
  }

  function getTileDef(tileId) {
    return RULE_TILE_BY_ID[tileId] || null;
  }

  function applyTileCells(st, tile, cellKeys, side) {
    const def = getTileDef(tile.id);
    const sideData = def && def.sides ? (def.sides[side] || def.sides.A) : null;
    const capitalFallbackKey = cellKeys[CAPITAL_HEX_OFFSET_INDEX] || cellKeys[0];
    let capitalPlaced = false;

    cellKeys.forEach((k, idx) => {
      const hex = st.map.hexes[k];
      if (!hex) return;
      const cell = sideData && sideData.cells ? sideData.cells[idx] : null;
      hex.active = true;
      hex.revealed = true;
      hex.terrain = cell ? cell.terrain : randomLandTerrain();
      hex.resource = null;
      hex.naturalWonder = null;
      hex.cityState = null;
      hex.unownedWonder = null;
      hex.barbarian = false;
      hex.barbarianId = null;
      hex.barbarianToken = null;
      hex.control = null;
      hex.city = null;
      hex.fortress = false;
      hex.fortressOwnerId = null;
      hex.core = tile.isCore;
      hex.tileId = tile.id;
      hex.tileCell = idx;
      hex.tileSide = side;

      if (!cell) return;
      if (cell.resource) hex.resource = cell.resource;
      if (cell.naturalWonder) {
        hex.resource = "wonder";
        hex.naturalWonder = cell.naturalWonder;
        hex.naturalWonderSpace = cell.naturalWonder;
      }
      if (cell.cityState) {
        const cs = CITY_STATE_DATA[cell.cityState] || { type: FOCUS_TYPES[Math.floor(Math.random() * FOCUS_TYPES.length)] };
        hex.cityState = { name: cell.cityState, type: cs.type, diplomacyCards: 2 };
      }
      if (cell.barbarian) {
        // STATIC: the printed icon. barbarianHome is the letter printed on this
        // exact tile/side/cell and never changes, whatever the figure does.
        hex.barbarianHome = cell.barbarian;
        // DYNAMIC: the figure standing here right now. barbarianToken is the
        // token's identity - the space it was printed on - and barbarianId is
        // the letter it shows. They are separate because the letter is NOT
        // unique on a board: E is printed on four different tiles and F and B
        // on two each, so two icons showing the same letter can be in play at
        // once and the letter alone cannot say which figure is which.
        hex.barbarian = true;
        hex.barbarianId = cell.barbarian;
        hex.barbarianToken = k;
      }
      if (cell.feature === "capital" && tile.ownerId) {
        hex.terrain = hex.terrain === "water" ? "grass" : hex.terrain;
        hex.city = { ownerId: tile.ownerId, isCapital: true, developed: false, hasWonder: false, wonder: null };
        hex.resource = null;
        hex.cityState = null;
        hex.barbarian = false;
        hex.fortress = false;
        capitalPlaced = true;
        revealAround(st.map, k, 2);
      }
    });

    if (tile.type === "capital" && tile.ownerId && !capitalPlaced) {
      const hex = st.map.hexes[capitalFallbackKey];
      if (hex) {
        hex.terrain = "grass";
        hex.city = { ownerId: tile.ownerId, isCapital: true, developed: false, hasWonder: false, wonder: null };
        hex.resource = null;
        hex.cityState = null;
        hex.barbarian = false;
        revealAround(st.map, capitalFallbackKey, 2);
      }
    }
  }

  function placeTileOnMap(st, tileId, anchorKey, rotation, side) {
    const tile = st.setup ? st.setup.tiles[tileId] : (st.tiles ? st.tiles[tileId] : null);
    if (!tile) return;
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
    ensureMapHexes(st.map, cellKeys, 2);
    tile.placed = true;
    tile.anchorKey = anchorKey;
    tile.rotation = rotation;
    tile.side = side;

    applyTileCells(st, tile, cellKeys, side || "A");

    updateCoreAdjacency(st);
    fillEnclosedHoles(st);
  }

  function updateCoreAdjacency(st) {
    Object.values(st.map.hexes).forEach((h) => { h.coreAdjacent = false; });
    Object.values(st.map.hexes).filter((h) => h.core).forEach((h) => {
      hexNeighborKeys(h.q, h.r).forEach((nk) => {
        const nh = st.map.hexes[nk];
        if (nh && nh.active) nh.coreAdjacent = true;
      });
    });
  }

  function fillEnclosedHoles(st) {
    const { hexes, radius } = st.map;
    const outside = new Set();
    const queue = [];
    Object.entries(hexes).forEach(([k, h]) => {
      if (!h.active && isBoundaryHex(h, radius)) {
        outside.add(k);
        queue.push(k);
      }
    });
    while (queue.length) {
      const k = queue.shift();
      hexNeighborKeys(parseQ(k), parseR(k)).forEach((nk) => {
        if (outside.has(nk)) return;
        const nh = hexes[nk];
        if (!nh || nh.active) return;
        outside.add(nk);
        queue.push(nk);
      });
    }
    Object.entries(hexes).forEach(([k, h]) => {
      if (h.active) return;
      if (outside.has(k)) return;
      h.active = true;
      h.revealed = true;
      h.terrain = "water";
      h.tileId = "water-fill";
    });
  }

  function isBoundaryHex(h, radius) {
    return Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)) === radius;
  }

  function getValidFortressHexes(st) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.active) return;
      let activeNeighbors = 0;
      let adjacentToFortress = false;
      let adjacentToCityState = false;
      hexNeighborKeys(h.q, h.r).forEach((nk) => {
        const nh = st.map.hexes[nk];
        if (nh && nh.active) {
          activeNeighbors++;
          if (nh.fortress) adjacentToFortress = true;
          if (nh.cityState) adjacentToCityState = true;
        }
      });
      if (activeNeighbors >= 2 && !adjacentToFortress && !adjacentToCityState) valid.push(k);
    });
    return new Set(valid);
  }

  // --- Setup State Creation ---

  function createSetupState(playerIds, opts) {
    opts = opts || {};
    const tiles = {};
    const order = shuffle(playerIds.slice());

    function makeTileFromDef(def) {
      tiles[def.id] = { id: def.id, type: def.kind, ownerId: null, side: "A", rotation: 0, placed: false, isCore: false, anchorKey: null };
      return tiles[def.id];
    }

    const sourceTiles = RULE_TILES.length ? RULE_TILES : [];
    sourceTiles.forEach(makeTileFromDef);
    let capitalPool = sourceTiles.filter((t) => t.kind === "capital").map((t) => tiles[t.id]);
    let mapDeck = sourceTiles.filter((t) => t.kind !== "capital").map((t) => tiles[t.id]);

    if (!sourceTiles.length) {
      for (let i = 1; i <= playerIds.length + 2; i++) {
        const id = `C${i}`;
        tiles[id] = { id, type: "capital", ownerId: null, side: "A", rotation: 0, placed: false, isCore: false, anchorKey: null };
        capitalPool.push(tiles[id]);
      }
      for (let i = 1; i <= playerIds.length * 2 + 10; i++) {
        const id = `T${i}`;
        tiles[id] = { id, type: i % 5 === 0 ? "citystate" : (i % 4 === 0 ? "natural" : "normal"), ownerId: null, side: "A", rotation: 0, placed: false, isCore: false, anchorKey: null };
        mapDeck.push(tiles[id]);
      }
    }

    shuffle(capitalPool);
    const playerTiles = {};
    playerIds.forEach((id) => {
      const tile = capitalPool.pop();
      if (!tile) return;
      tile.ownerId = id;
      playerTiles[id] = [tile.id];
    });

    shuffle(mapDeck);

    // Terra p14's optional advanced variant: instead of the core being four
    // tiles (two at 2-3 players) revealed off the shuffled stack, each player
    // is dealt 2 tiles and places them in turn order — the same figure-free
    // placement PLACE_TILE already does for capitals, just earlier and on an
    // empty board. The exact composition rule isn't in the source this app
    // was built from (see RULES-COVERAGE.md); this deals 2 per player from the
    // same shuffled deck standard setup would have drawn its core from, marked
    // core exactly like the standard tiles so later fortress/capital adjacency
    // checks don't need to know which setup mode ran.
    if (opts.advancedDraft) {
      const draftTiles = {};
      playerIds.forEach((id) => {
        const dealt = mapDeck.splice(0, Math.min(2, mapDeck.length));
        dealt.forEach((tile) => { tile.isCore = true; });
        draftTiles[id] = dealt.map((t) => t.id);
      });
      return {
        phase: "draft_tile",
        order,
        turnIndex: 0,
        tiles,
        playerTiles,
        draftTiles,
        coreTiles: [],
        coreSide: null,
        fortressPlaced: {},
        tileStack: mapDeck.map((t) => t.id)
      };
    }

    const coreCount = playerIds.length <= 3 ? 2 : 4;
    const coreTiles = mapDeck.splice(0, Math.min(coreCount, mapDeck.length));
    coreTiles.forEach((tile) => { tile.isCore = true; });
    const coreSide = rollDie() <= 3 ? "A" : "B";

    return {
      phase: "fortress",
      order,
      turnIndex: 0,
      tiles,
      playerTiles,
      draftTiles: {},
      coreTiles: coreTiles.map((t) => t.id),
      coreSide,
      fortressPlaced: {},
      tileStack: mapDeck.map((t) => t.id)
    };
  }

  function makeWonderDecks() {
    const decks = {};
    Object.entries(WONDER_DECKS).forEach(([type, wonders]) => {
      const byEra = { ancient: [], medieval: [], modern: [] };
      (wonders || []).forEach((w) => {
        const withType = { ...w, type };
        if (!byEra[withType.era]) byEra[withType.era] = [];
        byEra[withType.era].push(withType);
      });
      Object.values(byEra).forEach(shuffle);
      // Terra setup step 7b removes one random card from EACH ancient and
      // medieval pile. Each type begins 3/3/3 (including Terra's replacement
      // Pentagon and Machu Picchu cards), so the playable deck is 2/2/3.
      if (byEra.ancient.length) byEra.ancient.pop();
      if (byEra.medieval.length) byEra.medieval.pop();
      const deck = [...byEra.ancient, ...byEra.medieval, ...byEra.modern].map((w) => w.name);
      decks[type] = { deck, revealed: deck[0] || null, built: [], removed: [], token: 0 };
    });
    return decks;
  }

  // Migration must never invent a different hidden deck every time an old save
  // is opened. These deterministic stand-ins keep such a save inspectable, but
  // migrateState marks it read-only because the real hidden order is lost.
  function makeDeterministicWonderDecks() {
    const decks = {};
    Object.entries(WONDER_DECKS).forEach(([type, wonders]) => {
      const byEra = { ancient: [], medieval: [], modern: [] };
      (wonders || []).forEach((wonder) => {
        const era = wonder.era || "modern";
        (byEra[era] || (byEra[era] = [])).push(wonder.name);
      });
      const deck = byEra.ancient.slice(0, Math.max(0, byEra.ancient.length - 1))
        .concat(
          byEra.medieval.slice(0, Math.max(0, byEra.medieval.length - 1)),
          byEra.modern
        );
      decks[type] = { deck, revealed: deck[0] || null, built: [], removed: [], token: 0 };
    });
    return decks;
  }

  function makeDeterministicAgendaCards() {
    const forts = VICTORY_CARDS.filter((c) => c.fortress).slice(0, 2);
    const rest = VICTORY_CARDS.filter((c) => !c.fortress).slice(0, 3);
    return forts.concat(rest).map((c) => ({
      id: c.id, fortress: !!c.fortress, agendas: c.agendas.slice()
    }));
  }

  // Five victory cards: the two fort cards plus three drawn at random (Terra
  // p8). Each ordinary card carries two agendas and completing either one claims
  // the card (base p12) — so ten agendas are in play, and which half of each
  // card you chase is yours to choose.
  function makeAgendaCards() {
    const forts = VICTORY_CARDS.filter((c) => c.fortress).slice(0, 2);
    const rest = shuffle(VICTORY_CARDS.filter((c) => !c.fortress).slice()).slice(0, 3);
    return forts.concat(rest).map((c) => ({ id: c.id, fortress: !!c.fortress, agendas: c.agendas.slice() }));
  }

  // Saves and older code passed a flat list of agenda ids; read either shape.
  function victoryCards(st) {
    return (st.agendaCards || []).map((entry) => {
      if (entry && entry.agendas) return entry;
      const agenda = AGENDA_CARDS.find((a) => a.id === entry);
      return { id: String(entry), fortress: !!(agenda && agenda.fortress), agendas: [String(entry)] };
    });
  }

  function createState(players, opts) {
    opts = opts || {};
    const map = buildEmptyMap(CFG.mapRadius);
    seatPlayers(players);
    const playerIds = players.map((p) => p.id);
    const setup = createSetupState(playerIds, opts);

    const st = {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      rulesVersion: RULE_VERSION,
      phase: "setup",
      advancedDraft: !!opts.advancedDraft,
      map,
      players: players.slice(),
      turn: { order: setup.order.slice(), index: 0, round: 1 },
      setup,
      tileDeck: setup.tileStack.slice(),
      wonderDecks: makeWonderDecks(),
      agendaCards: makeAgendaCards(),
      claimedAgendas: {},
      pendingChoices: [],
      manualLog: [],
      eventWheel: { position: 0, events: EVENTS.slice() },
      lastCombat: null,
      pendingBarbReward: null,
      pendingExploration: null,
      movementContinuation: null,
      // A natural-wonder token is reusable on later turns, but a particular
      // physical token can contribute only once during one turn. Keys are
      // natural-wonder names, values are deterministic turn ids.
      naturalWonderUsage: {},
      // The natural-wonder tokens themselves, by name. Base rules: placing a
      // control token on a natural wonder space TAKES that token off the board
      // and onto your leader sheet, and an attacker who defeats the control
      // token of the player holding one takes it off THEM. Ownership therefore
      // cannot be read off the map - the token is no longer there - so it
      // lives here.
      //   ownerId:           null while the token is still on its space
      //   homeKey:           the space it started on; a stable token id
      //   spaceControllerId: who held that space at the last sync, which is
      //                      what separates a conquest from walking onto a
      //                      space whose token was taken long ago
      //   focusCard:         where America has parked it, once that lands
      naturalWonders: {},
      // Interactive focus cards keep their printed sequence here. This is
      // public, deterministic state (never card text parsing): reconnecting in
      // the middle of "district, then reinforce" resumes the exact next step.
      cardResolution: null,
      winner: null,
      log: [],
      chat: []
    };

    if (opts.advancedDraft) {
      log(st, "Advanced setup: each player drafts 2 tiles to build the core.");
    } else {
      const anchors = getCoreAnchors(st.players.length);
      setup.coreTiles.forEach((tileId, i) => {
        const anchor = anchors[i];
        const anchorKey = key(anchor.q, anchor.r);
        placeTileOnMap(st, tileId, anchorKey, anchor.rotation, setup.coreSide || "A");
      });
      log(st, "Core tiles placed. Fortress placement begins.");
    }
    return st;
  }

  // A pre-game waiting room. The host creates this when opening an online room;
  // players join into it via ADD_PLAYER and the host triggers START_GAME once
  // everyone is present. Only then is the real board (createState) built, so a
  // late join can never wipe an in-progress setup.
  function createLobbyState(players, opts) {
    const list = seatPlayers((players || []).slice(0, CFG.maxPlayers));
    return {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      rulesVersion: RULE_VERSION,
      phase: "lobby",
      solo: !!(opts && opts.solo),
      map: buildEmptyMap(CFG.mapRadius),
      players: list,
      turn: { order: list.map((p) => p.id), index: 0, round: 1 },
      pendingChoices: [],
      manualLog: [],
      eventWheel: { position: 0, events: EVENTS.slice() },
      winner: null,
      log: ["Waiting for players to join..."],
      chat: []
    };
  }

  // Set a player's starting focus row from their leader sheet.
  function applyLeaderStart(player) {
    const leader = getLeader(player);
    if (leader && Array.isArray(leader.focusOrder) && leader.focusOrder.length === FOCUS_TYPES.length) {
      player.focusRow = leader.focusOrder.slice();
    }
  }

  // Deal unique leaders to everyone still on "random" before the board is built.
  function assignRandomLeaders(st) {
    const taken = new Set(st.players.map((p) => p.leaderId).filter((id) => id && id !== "random"));
    const pool = shuffle(LEADERS.filter((l) => !taken.has(l.id)).map((l) => l.id));
    st.players.forEach((player) => {
      if (player.leaderId && player.leaderId !== "random") return;
      const id = pool.pop();
      if (!id) return;
      player.leaderId = id;
      applyLeaderStart(player);
      const leader = LEADER_BY_ID[id];
      log(st, `${player.name} drew ${leader.civ} (${leader.name}).`);
    });
  }

  // Your usable armies and caravans are printed on your military / economy
  // card ("2 armies"), so the counts follow the card tier rather than any
  // recruit action. Figures added here start at the capital.
  // A figure you have not deployed sits ON ITS CARD, not on the board: base p8
  // has each player start "with one caravan on his or her economy card", and
  // armies live on the military card until a card moves them out. It matters
  // beyond bookkeeping — a figure standing in a space adds 2 to its defence
  // (Terra p16), so parking new units on the capital quietly fortified it.
  function syncUnitCounts(st, player) {
    const want = {
      armies: CARD_TIERS.military.armies[getCardTier(player, "military") - 1],
      caravans: CARD_TIERS.economy.wagons[getCardTier(player, "economy") - 1]
    };
    for (const [key, n] of Object.entries(want)) {
      const list = player[key] || (player[key] = []);
      while (list.length > n) list.pop();
      while (list.length < n) list.push({ id: key + "-" + (list.length + 1) + "-" + player.id.slice(0, 4), position: null });
    }
  }

  // Terra adds a complete fifth, purple player set. Seats are assigned from
  // the five physical colours so no two players share the same board pieces.
  const SEAT_COLORS = ["#169eae", "#d94747", "#e88b24", "#76a94f", "#8b62b5"];

  // The five printed component colours, by name, for anything that has to say
  // which one a player ended up with.
  const SEAT_COLOR_NAMES = {
    "#169eae": "Blue", "#d94747": "Red", "#e88b24": "Orange",
    "#76a94f": "Green", "#8b62b5": "Purple"
  };
  function colorName(value) {
    return SEAT_COLOR_NAMES[String(value || "").toLowerCase()] || String(value || "a colour");
  }

  function seatColor(taken, wanted) {
    const free = SEAT_COLORS.filter((c) => !taken.includes(c));
    if (!free.length) return SEAT_COLORS[taken.length % SEAT_COLORS.length];
    const want = String(wanted || "").toLowerCase();
    return free.find((c) => c === want) || free[0];
  }

  // Which of the five component sets nobody is sitting on. `exceptPlayerId`
  // lets a player's own current colour count as available to them, so changing
  // to a colour and back is not a false clash.
  function availableColors(st, exceptPlayerId) {
    const taken = (st.players || [])
      .filter((p) => p.id !== exceptPlayerId)
      .map((p) => String(p.color || "").toLowerCase());
    return SEAT_COLORS.filter((c) => !taken.includes(c));
  }
  function colorIsFree(st, color, exceptPlayerId) {
    const want = String(color || "").toLowerCase();
    return SEAT_COLORS.includes(want) && availableColors(st, exceptPlayerId).includes(want);
  }

  // Give everyone in a list a distinct seat colour, keeping what they asked
  // for where it is still free.
  function seatPlayers(list) {
    const taken = [];
    (list || []).forEach((p) => {
      p.color = seatColor(taken, p.color);
      taken.push(p.color);
    });
    return list;
  }

  function createPlayer(id, name, color) {
    const cardTiers = { culture: 1, growth: 1, science: 1, economy: 1, military: 1, industry: 1 };
    return {
      id, name, color,
      ready: false,
      leaderId: "random",
      focusRow: FOCUS_TYPES.slice(),
      trade: { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 },
      resources: { marble: 0, mercury: 0, oil: 0, diamonds: 0 },
      tech: 0, techTier: 1,
      uniqueTaken: false,
      upgradedThisTurn: false,
      arsenalUsed: false, arsenalReplay: null, estadioUsed: false,
      capitalismUsed: false, capitalismReplay: null, capitalismNoReset: false,
      cartographyUsedThisTurn: false,
      scorchedEarthUsedThisTurn: false,
      polandFirstTurnUsed: false,
      zimbabwe: 0,        // trade tokens parked on Great Zimbabwe
      cardTiers,
      cardLevels: { ...cardTiers },
      diplomacy: [],
      cityStateTokens: [],
      agendaClaims: {},
      capturedCapitals: 0,
      maxCombatWin: 0,
      govMarkers: [],
      government: null,   // the focus card type carrying your government marker
      armies: [],
      caravans: [{ id: "caravan-1", position: null }],
      cardPlayed: false
    };
  }

  function migratePlayer(player) {
    if (!player) return player;
    if (player.ready === undefined) player.ready = false;
    player.leaderId = player.leaderId || "random";
    player.trade = player.trade || { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 };
    player.resources = player.resources || { marble: 0, mercury: 0, oil: 0, diamonds: 0 };
    player.cardTiers = player.cardTiers || player.cardLevels || { culture: 1, growth: 1, science: 1, economy: 1, military: 1, industry: 1 };
    player.cardLevels = player.cardLevels || { ...player.cardTiers };
    if (player.uniqueTaken === undefined) player.uniqueTaken = false;
    if (player.upgradedThisTurn === undefined) player.upgradedThisTurn = false;
    if (player.zimbabwe === undefined) player.zimbabwe = 0;
    if (player.arsenalUsed === undefined) player.arsenalUsed = false;
    if (player.arsenalReplay === undefined) player.arsenalReplay = null;
    if (player.estadioUsed === undefined) player.estadioUsed = false;
    if (player.capitalismUsed === undefined) player.capitalismUsed = false;
    if (player.capitalismReplay === undefined) player.capitalismReplay = null;
    if (player.capitalismNoReset === undefined) player.capitalismNoReset = false;
    if (player.cartographyUsedThisTurn === undefined) player.cartographyUsedThisTurn = false;
    if (player.scorchedEarthUsedThisTurn === undefined) player.scorchedEarthUsedThisTurn = false;
    if (player.polandFirstTurnUsed === undefined) player.polandFirstTurnUsed = false;
    FOCUS_TYPES.forEach((f) => {
      if (player.trade[f] === undefined) player.trade[f] = 0;
      if (player.cardTiers[f] === undefined) player.cardTiers[f] = 1;
      if (player.cardLevels[f] === undefined) player.cardLevels[f] = player.cardTiers[f];
    });
    player.diplomacy = player.diplomacy || [];
    player.cityStateTokens = player.cityStateTokens || [];
    player.agendaClaims = player.agendaClaims || {};
    player.capturedCapitals = player.capturedCapitals || 0;
    player.maxCombatWin = player.maxCombatWin || 0;
    player.govMarkers = player.govMarkers || [];
    if (!("government" in player)) player.government = null;
    player.armies = player.armies || [];
    player.caravans = player.caravans || player.wagons || [];
    player.armies.concat(player.caravans).forEach((unit) => {
      // Older saves called this a per-card flag. Normally a figure moves only
      // once on that card, but the printed restriction is per figure per MOVE
      // (and effects such as Mass Production can grant a second move).
      if (unit.exploredThisMove === undefined) {
        unit.exploredThisMove = !!unit.exploredThisCard;
      }
      if (unit.moveInProgress === undefined) {
        unit.moveInProgress = !!unit.exploredThisMove;
      }
    });
    return player;
  }

  function migrateState(st) {
    if (!st) return st;
    const projectedView = st.stateView === true;
    const sourceSchema = Number.isInteger(st.saveSchemaVersion) ? st.saveSchemaVersion : 1;
    const sourceRulesVersion = Number.isFinite(Number(st.rulesVersion))
      ? Number(st.rulesVersion) : 0;
    const previousMigrationFrom = st.migrationStatus && st.migrationStatus.migratedFrom;
    const previousIssues = st.migrationStatus && Array.isArray(st.migrationStatus.issues)
      ? st.migrationStatus.issues.slice() : [];
    const issues = new Set(previousIssues);

    // Rules v2 corrects the A/B identity of printed Natural Wonder tiles 1,
    // 2, 4 and 18. Placed tiles store their printed contents in the map, so a
    // catalogue-only fix would leave an in-progress game with the old names.
    // Re-read only an already-present Natural Wonder from its physical face;
    // control, units and every other piece on the space remain untouched.
    if (sourceRulesVersion < 2) {
      Object.values(st.map?.hexes || {}).forEach((hex) => {
        if (!hex || !hex.naturalWonder || !hex.tileId || !Number.isInteger(hex.tileCell)) return;
        const tileState = (st.tiles && st.tiles[hex.tileId]) ||
          (st.setup && st.setup.tiles && st.setup.tiles[hex.tileId]);
        const side = hex.tileSide || (tileState && tileState.side) || "A";
        const face = RULE_TILE_BY_ID[hex.tileId]?.sides?.[side];
        const printed = face?.cells?.[hex.tileCell];
        if (!printed || !printed.naturalWonder) return;
        hex.naturalWonder = printed.naturalWonder;
        hex.naturalWonderSpace = printed.naturalWonder;
        hex.resource = "wonder";
      });
    }
    st.rulesVersion = RULE_VERSION;
    ensureNaturalWonderRegistry(st);
    st.players = (st.players || []).map(migratePlayer);
    if (!projectedView && !Array.isArray(st.tileStack)) {
      if (Array.isArray(st.tileDeck)) st.tileStack = st.tileDeck.slice();
      else if (st.setup && Array.isArray(st.setup.tileStack)) st.tileStack = st.setup.tileStack.slice();
      else if (st.phase !== "lobby") {
        st.tileStack = [];
        issues.add("tile_stack_order_missing");
      }
    }
    if (!projectedView) {
      st.tileDeck = Array.isArray(st.tileDeck)
        ? st.tileDeck : (Array.isArray(st.tileStack) ? st.tileStack.slice() : []);
    }
    if (!st.wonderDecks) {
      st.wonderDecks = makeDeterministicWonderDecks();
      if (st.phase !== "lobby") issues.add("wonder_deck_order_missing");
    }
    if (!st.agendaCards) {
      st.agendaCards = makeDeterministicAgendaCards();
      if (st.phase !== "lobby") issues.add("agenda_deal_missing");
    }
    st.claimedAgendas = st.claimedAgendas || {};
    // The tile catalogue is copied out of setup by finalizeSetup, so anything
    // that reaches the playing phase by another route - a hand-built state, a
    // save written before that copy existed - has no st.tiles at all. Four call
    // sites read st.tiles[tileId] unguarded, so the first exploration threw
    // "Cannot read properties of undefined" and the whole action was lost. The
    // catalogue is static reference data; carrying it forward here costs
    // nothing and removes the whole class of crash.
    if (!st.tiles && st.setup && st.setup.tiles) st.tiles = st.setup.tiles;
    if (st.ibrahimHolder === undefined) st.ibrahimHolder = null;
    if (st.combat && st.combat.atkRolled === undefined) {
      st.combat.atkRolled = !!st.combat.rolled;
      st.combat.defRolled = !!st.combat.rolled;
    }
    if (st.combat) {
      if (st.combat.atkResource === undefined) st.combat.atkResource = 0;
      if (st.combat.defResource === undefined) st.combat.defResource = 0;
    }
    st.pendingChoices = st.pendingChoices || [];
    if (st.pendingExploration === undefined) st.pendingExploration = null;
    if (st.movementContinuation === undefined) st.movementContinuation = null;
    if (st.cardResolution === undefined) st.cardResolution = null;
    st.naturalWonderUsage = st.naturalWonderUsage || {};
    if (st.turnUndo === undefined) st.turnUndo = null;
    st.manualLog = st.manualLog || [];
    st.log = (st.log || []).slice(-MAX_LOG_ENTRIES);
    st.chat = (st.chat || []).slice(-MAX_CHAT_ENTRIES);
    Object.values(st.map?.hexes || {}).forEach((h) => {
      if (h.unownedWonder === undefined) h.unownedWonder = null;
      if (h.city && h.city.wonder) h.city.hasWonder = true;
      if (h.city && h.city.hasWonder && !h.city.wonder) h.city.wonder = { name: "Unknown", era: "ancient", type: "military", effect: "" };
      if (h.cityState && h.cityState.diplomacyCards === undefined) h.cityState.diplomacyCards = 2;
      // A barbarian on the board is a physical lettered marker, and that letter
      // comes from the space it was printed on. A save that carries the figure
      // without its letter leaves the renderer nothing to identify it by, and
      // the renderer's fallback picks a token from the HEX KEY - so the marker
      // silently became a different barbarian every time it moved. Put the
      // printed identity back where it is still known.
      if (h.barbarian && !h.barbarianId && h.barbarianHome) h.barbarianId = h.barbarianHome;
    });
    st.saveSchemaVersion = SAVE_SCHEMA_VERSION;
    if (issues.size) {
      st.migrationStatus = {
        readOnly: true,
        code: "hidden_state_unrecoverable",
        migratedFrom: previousMigrationFrom || sourceSchema,
        issues: Array.from(issues).sort()
      };
    } else if (sourceSchema < SAVE_SCHEMA_VERSION) {
      st.migrationStatus = {
        readOnly: false,
        code: "migrated",
        migratedFrom: sourceSchema,
        issues: []
      };
    }
    return st;
  }

  function cloneSerializable(value) {
    // Game state intentionally contains JSON data only. Using the same wire
    // representation as multiplayer also proves that a transaction cannot
    // retain a reference into the host's authoritative object.
    return JSON.parse(JSON.stringify(value));
  }

  const HOST_ACTIONS = new Set([
    "ADD_PLAYER", "START_GAME", "HOST_EDIT_HEX", "HOST_ADJUST_PLAYER",
    "FORCE_EVENT", "CHECK_AGENDAS", "KICK_PLAYER"
  ]);
  const SETUP_ACTIONS = new Set(["PLACE_FORTRESS", "PLACE_TILE"]);
  const CURRENT_PLAYER_ACTIONS = new Set([
    "UNDO_TURN", "PLAY_CULTURE", "PLAY_GROWTH_REINFORCE",
    "PLAY_GROWTH_DISTRICT", "SKIP_GROWTH_DISTRICT", "PLAY_SCIENCE", "PLAY_ECONOMY",
    "PLAY_MILITARY_MOVE", "PLAY_MILITARY_ATTACK", "PLAY_INDUSTRY_CITY",
    "PLAY_INDUSTRY_WONDER", "END_FOCUS_CARD", "END_TURN",
    "BEGIN_EXPLORATION", "PLACE_EXPLORED_TILE", "ABANDON_EXPLORATION",
    "END_UNIT_MOVE"
  ]);
  const COMBAT_ACTIONS = new Set([
    "CANCEL_COMBAT", "COMBAT_ROLL", "COMBAT_SPEND", "COMBAT_PASS"
  ]);
  const EXPLORATION_RESOLUTION_ACTIONS = new Set([
    "PLACE_EXPLORED_TILE", "ABANDON_EXPLORATION"
  ]);
  const PLAYER_DECISION_ACTIONS = new Set([
    "RESOLVE_PENDING_CHOICE", "ADD_TRADE", "UNDO_TURN"
  ]);
  const KNOWN_ACTIONS = new Set([
    ...HOST_ACTIONS, ...SETUP_ACTIONS, ...CURRENT_PLAYER_ACTIONS,
    ...COMBAT_ACTIONS, "SET_LEADER", "SET_READY", "SET_COLOR", "RESOLVE_PENDING_CHOICE", "ADD_TRADE",
    "EXPLORE_TILE"
  ]);

  function denied(code, message) {
    return { ok: false, code, message };
  }

  // This is the sole online permission table. The transport supplies actorId
  // from its authenticated seat binding; nothing inside the action may grant a
  // different identity or host privileges.
  function authorizeAction(st, action, context) {
    const type = action.type;
    const payload = action.payload || {};
    const actorId = context.actorId || null;
    const role = context.role === "host" ? "host" : "player";
    const actor = actorId ? getPlayer(st, actorId) : null;

    if (!KNOWN_ACTIONS.has(type)) return denied("unknown_action", "Unknown action type.");
    if (st.migrationStatus && st.migrationStatus.readOnly) {
      return denied("read_only", "This save is read-only because hidden deck order could not be recovered.");
    }
    if (HOST_ACTIONS.has(type)) {
      if (role !== "host") return denied("host_only", "Only the host may perform this action.");
      // A role bit is supplied by the trusted transport, but it is not itself
      // a seat. Requiring the authenticated host to own a seat closes the last
      // path by which a caller outside the game could invoke correction tools.
      if (!actor) return denied("unknown_actor", "The authenticated host seat is not part of this game.");
      if (type === "ADD_PLAYER") {
        // A named component colour that is already held is refused with a
        // reason, so the joining client can say which colour is gone instead of
        // the join simply not happening.
        const wanted = String((payload && payload.color) || "").toLowerCase();
        if (SEAT_COLORS.includes(wanted) && !colorIsFree(st, wanted, payload && payload.id)) {
          return denied("color_taken", `${colorName(wanted)} is already taken.`);
        }
      }
      if (type === "KICK_PLAYER") {
        // Removing a seat is only safe before the board exists. Once setup has
        // dealt tiles and figures, deleting a civilization would orphan its
        // cities, control tokens, districts, diplomacy and turn slot; there is
        // no printed rule for an abandoned civilization, so this refuses rather
        // than inventing one. Revoking the CONNECTION mid-game is a transport
        // concern and is left to the existing disconnect handling.
        if (st.phase !== "lobby") {
          return denied("kick_requires_lobby",
            "A player can only be removed before the game starts.");
        }
        // The target is carried as targetId: bindActionActor strips playerId
        // from host actions, so a client cannot smuggle a victim in that field.
        const targetId = String(payload.targetId || "");
        if (!targetId) return denied("kick_target_missing", "Name the player to remove.");
        if (targetId === actorId) return denied("kick_self", "The host cannot remove themselves.");
        if (!getPlayer(st, targetId)) {
          return denied("kick_target_unknown", "That player is not in this lobby.");
        }
      }
      return { ok: true };
    }
    if (!actor) return denied("unknown_actor", "The authenticated seat is not part of this game.");

    if (type === "SET_LEADER" || type === "SET_READY" || type === "SET_COLOR") {
      if (st.phase !== "lobby") {
        return denied("wrong_phase", "Lobby choices can only be changed before setup.");
      }
      if (type === "SET_COLOR") {
        // bindActionActor stamps playerId from the authenticated seat, so this
        // can only ever be the caller's own colour. What still has to be
        // checked is that the component set is actually free: two clients can
        // click the same swatch at the same moment, and the loser must be told
        // rather than seated somewhere else.
        const wanted = String(payload.color || "").toLowerCase();
        if (!SEAT_COLORS.includes(wanted)) {
          return denied("unknown_color", "That is not one of the five component colours.");
        }
        if (!colorIsFree(st, wanted, actorId)) {
          return denied("color_taken", `${colorName(wanted)} is already taken.`);
        }
      }
      return { ok: true };
    }

    if (SETUP_ACTIONS.has(type)) {
      if (st.phase !== "setup" || !st.setup) return denied("wrong_phase", "Setup is not active.");
      const activeId = st.setup.order[st.setup.turnIndex];
      return activeId === actorId ? { ok: true } :
        denied("not_your_setup_turn", "Another player is placing the next setup piece.");
    }

    // Decisions are exclusive phases, not suggestions in the interface. The
    // UI used to hide most of these conflicts, but a forged packet could still
    // end a turn during combat, play a card while another seat was choosing an
    // event result, or resolve an unrelated prompt during exploration. Keeping
    // the lock here makes the host authoritative even when a client is stale or
    // malicious.
    if (st.phase === "playing" && st.combat && st.combat.turn !== "done" &&
        !COMBAT_ACTIONS.has(type)) {
      return denied("combat_pending", "Finish the current combat before taking another action.");
    }
    if (st.phase === "playing" && st.pendingExploration &&
        !EXPLORATION_RESOLUTION_ACTIONS.has(type)) {
      return denied("exploration_pending", "Resolve the revealed exploration tile first.");
    }
    if (st.phase === "playing" && st.movementContinuation) {
      const continuation = st.movementContinuation;
      const allowed = continuation.unitType === "caravan"
        ? new Set(["PLAY_ECONOMY", "END_UNIT_MOVE"])
        : new Set(["PLAY_MILITARY_MOVE", "PLAY_MILITARY_ATTACK", "END_UNIT_MOVE"]);
      // A decision can be open at the same time as a continuation - Currency
      // defeating a barbarian for Sumeria leaves exactly that state - and the
      // decision gate below is what orders the two. Refusing decisions here
      // would deadlock: the choice cannot be answered and the movement cannot
      // proceed until it is.
      const decision = PLAYER_DECISION_ACTIONS.has(type);
      if (!allowed.has(type) && !decision) {
        return denied("movement_continuation_pending", "Finish the unit's remaining movement first.");
      }
      if (!decision &&
          (continuation.playerId !== actorId || payload.unitId !== continuation.unitId)) {
        return denied("movement_continuation_mismatch", "This remaining movement belongs to another unit.");
      }
    }
    if (st.phase === "playing" &&
        ((st.pendingChoices || []).length || st.pendingBarbReward) &&
        !PLAYER_DECISION_ACTIONS.has(type)) {
      return denied("decision_pending", "A required player decision must be resolved first.");
    }

    if (type === "RESOLVE_PENDING_CHOICE") {
      const choice = (st.pendingChoices || []).find((entry) => entry.id === payload.choiceId);
      if (!choice) return denied("choice_missing", "That choice is no longer pending.");
      if (choice.playerId !== actorId) {
        return denied("choice_owner_mismatch", "This decision belongs to another player.");
      }
      // The Industrial Zone's alternatives are not generic trade-spend levels.
      // Its printed city option costs exactly three Industry tokens, so an old
      // or forged client cannot select it when that exact payment (and a legal
      // site) is unavailable.
      if (choice.kind === "district_mode" && choice.districtKind === "industrial" &&
          payload.optionId === "city") {
        const option = industrialZoneCityOption(st, actorId);
        if (!option.ok) return denied(option.code, option.message);
      }
      return { ok: true };
    }

    if (type === "ADD_TRADE") {
      if (!st.pendingBarbReward) return denied("no_barbarian_reward", "There is no open barbarian reward.");
      if (st.pendingBarbReward.playerId !== actorId) {
        return denied("reward_owner_mismatch", "This barbarian reward belongs to another player.");
      }
      if (!FOCUS_TYPES.includes(payload.cardType)) {
        return denied("invalid_reward", "Choose a focus card for the trade reward.");
      }
      return { ok: true };
    }

    if (COMBAT_ACTIONS.has(type)) {
      const combat = st.combat;
      if (!combat || combat.turn === "done") return denied("combat_missing", "There is no open combat.");
      let expectedActor = null;
      if (type === "CANCEL_COMBAT") {
        if (combat.atkRolled || combat.defRolled || combat.rolled) {
          return denied("combat_irreversible", "Combat cannot be cancelled after a die is rolled.");
        }
        expectedActor = combat.attackerId;
      } else if (type === "COMBAT_ROLL") {
        const side = combat.atkRolled ? "defender" : "attacker";
        if (payload.side && payload.side !== side) {
          return denied("combat_phase_mismatch", `The ${side} must roll next.`);
        }
        expectedActor = side === "attacker" ? combat.attackerId : combatDefenderRoller(st, combat);
      } else {
        if (!combat.rolled) return denied("combat_phase_mismatch", "Both dice must be rolled before bidding.");
        const side = combat.turn;
        if (payload.side && payload.side !== side) {
          return denied("combat_phase_mismatch", `It is the ${side}'s decision.`);
        }
        expectedActor = side === "attacker"
          ? combat.attackerId : (combat.defenderOwnerId || combatDefenderRoller(st, combat));
      }
      return expectedActor === actorId ? { ok: true } :
        denied("combat_actor_mismatch", "This combat decision belongs to another player.");
    }

    // The one-step action exposed a hidden tile and placed it in the same
    // unauditable packet. Offline callers retain it through applyAction, while
    // online play must use the reveal/resolve protocol below.
    if (type === "EXPLORE_TILE") {
      return denied("exploration_protocol_required", "Begin exploration before placing the revealed tile.");
    }

    // A printed multi-step card is one transaction spread across acknowledged
    // decisions. Once its first irreversible step is on the board, no other
    // focus action can sneak in before the remaining "then" steps finish.
    if (st.cardResolution) {
      const resolution = st.cardResolution;
      if (resolution.playerId !== actorId) {
        return denied("card_resolution_owner_mismatch", "Another player's focus card is still resolving.");
      }
      // Undo has to be reachable from inside a half-resolved card, or a step
      // that cannot be completed is a dead match: every other action is refused
      // "until the card finishes", and the card is what will not finish. The
      // checkpoint predates the card being played, so restoring it clears the
      // resolution along with everything else — it is the exit, not a bypass.
      // It still falls through to the current-player and getUndoStatus checks.
      const escapingWithUndo = type === "UNDO_TURN";
      const finishingGrowth = resolution.cardType === "growth" &&
        resolution.step === "growth_reinforce" &&
        (type === "PLAY_GROWTH_REINFORCE" || type === "END_FOCUS_CARD");
      const finishingAstronomy = resolution.cardType === "science" &&
        resolution.cardName === "Astronomy" &&
        resolution.step === "astronomy_exploration" &&
        EXPLORATION_RESOLUTION_ACTIONS.has(type);
      if (!finishingGrowth && !finishingAstronomy && !escapingWithUndo) {
        return denied("card_resolution_pending", "Finish the remaining steps of this focus card first.");
      }
    }

    if (CURRENT_PLAYER_ACTIONS.has(type)) {
      if (st.phase !== "playing") return denied("wrong_phase", "The game is not in the playing phase.");
      const current = currentPlayer(st);
      if (!current || current.id !== actorId) {
        return denied("not_your_turn", "It is another player's turn.");
      }
      if (st.pendingExploration) {
        const resolving = EXPLORATION_RESOLUTION_ACTIONS.has(type);
        if (!resolving) return denied("exploration_pending", "Resolve the revealed exploration tile first.");
        if (st.pendingExploration.playerId !== actorId) {
          return denied("exploration_owner_mismatch", "This expedition belongs to another player.");
        }
        // Terra p12 only returns a tile to the stack "if the tile cannot be
        // placed". Refusing that here rather than in the handler is what lets
        // the player be told why: the handler simply returned the state
        // unchanged, which surfaced as a bare "invalid action".
        if (type === "ABANDON_EXPLORATION") {
          const escape = canAbandonExploration(st, actorId);
          if (!escape.ok) return denied(escape.code, escape.message);
        }
      } else if (type === "PLACE_EXPLORED_TILE" || type === "ABANDON_EXPLORATION") {
        return denied("exploration_missing", "No exploration tile is waiting to be resolved.");
      }
      if (st.movementContinuation) {
        const continuation = st.movementContinuation;
        const allowed = continuation.unitType === "caravan"
          ? new Set(["PLAY_ECONOMY", "END_UNIT_MOVE"])
          : new Set(["PLAY_MILITARY_MOVE", "PLAY_MILITARY_ATTACK", "END_UNIT_MOVE"]);
        if (!allowed.has(type)) {
          return denied("movement_continuation_pending", "Finish the explored unit's remaining movement first.");
        }
        if (payload.unitId !== continuation.unitId || continuation.playerId !== actorId) {
          return denied("movement_continuation_mismatch", "This remaining movement belongs to another unit.");
        }
      }
      if (type === "PLAY_CULTURE") {
        const placement = validateCulturePlacement(st, actorId, payload.hexKeys,
          payload.tradeSpent, payload.tradeResources);
        if (!placement.ok) return denied(placement.code, placement.message);
      }
      if (type === "PLAY_GROWTH_REINFORCE") {
        const resolution = st.cardResolution && st.cardResolution.playerId === actorId &&
          st.cardResolution.cardType === "growth" ? st.cardResolution : null;
        const profile = growthCardProfile(getPlayer(st, actorId));
        if (!resolution && profile.sequential) {
          return denied("growth_district_first",
            `${profile.name} places a district before its reinforcement step.`);
        }
        const baseLimit = resolution ? resolution.reinforceBase :
          getSlotValue(getPlayer(st, actorId), "growth", st);
        const selectedTrade = resolution ? resolution.tradeBudget : payload.tradeSpent;
        const selectedResources = resolution && resolution.tradePayment
          ? resolution.tradePayment.resources : payload.tradeResources;
        const placement = validateReinforcePlacement(st, actorId, payload.hexKeys,
          selectedTrade, baseLimit, selectedResources);
        if (!placement.ok) return denied(placement.code, placement.message);
      }
      if (type === "PLAY_GROWTH_DISTRICT") {
        const placement = validateGrowthDistrictPlacement(st, actorId, payload);
        if (!placement.ok) return denied(placement.code, placement.message);
      }
      if (type === "SKIP_GROWTH_DISTRICT") {
        const skip = validateGrowthDistrictSkip(st, actorId, payload.tradeSpent,
          payload.tradeResources);
        if (!skip.ok) return denied(skip.code, skip.message);
      }
      if (type === "PLAY_SCIENCE") {
        const player = getPlayer(st, actorId);
        if (!player || !canResolveCard(player, "science")) {
          return denied("science_unavailable", "The science card cannot be resolved now.");
        }
        const trade = validateFocusTradeSpend(st, player, "science",
          payload.tradeSpent, payload.tradeResources);
        if (!trade.ok) return denied(trade.code, trade.message);
      }
      if (type === "PLAY_INDUSTRY_CITY") {
        const city = validateIndustryCityAction(st, actorId, payload);
        if (!city.ok) return denied(city.code, city.message);
      }
      if (type === "PLAY_INDUSTRY_WONDER") {
        const player = getPlayer(st, actorId);
        if (!player || !canResolveCard(player, "industry")) {
          return denied("industry_unavailable", "The industry card cannot be resolved now.");
        }
        const site = st.map.hexes[payload.hexKey];
        if (!site || !site.city || site.city.ownerId !== actorId || site.city.hasWonder) {
          return denied("wonder_site_invalid", "Choose one of your cities that does not already contain a wonder.");
        }
        const wonder = getVisibleWonders(st).find((entry) => entry.name === payload.wonderName);
        if (!wonder) return denied("wonder_not_visible", "That world wonder is not currently faceup.");
        const payment = calculateWonderProduction(st, player, wonder.name, {
          tradeSpent: payload.tradeSpent,
          tradeResources: payload.tradeResources,
          resources: payload.resources,
          naturalWonders: payload.naturalWonders
        });
        if (!payment.ok) return denied(payment.code, payment.message);
        if (!payment.affordable) {
          return denied("insufficient_wonder_production",
            `${wonder.name} costs ${payment.cost.finalCost}; this payment produces ${payment.production.total}.`);
        }
        // Refuse a wonder whose printed effect the board cannot carry out,
        // before anything is paid or revealed.
        const blocked = wonderResolutionBlocked(st, actorId, wonder.name);
        if (blocked) return denied(blocked.code, blocked.message);
      }
      if (type === "PLAY_ECONOMY") {
        const actor = getPlayer(st, actorId);
        if (!movementTradePayment(st, actor, "economy", payload)) {
          return denied("invalid_economy_payment",
            "The economy movement payment is unavailable or differs from the payment already committed to this card.");
        }
        // Base p9, said out loud rather than as a silent no-op: the board has
        // no way to know which cities a caravan has already visited this turn,
        // so it offers the destination and the player needs to be told why it
        // was refused.
        const dest = st.map.hexes[payload.toKey];
        const traded = dest && (dest.cityState || (dest.city && dest.city.ownerId !== actorId));
        if (traded && actor && (actor.citiesTradedThisTurn || []).includes(payload.toKey)) {
          return denied("city_already_traded",
            "One of your caravans has already traded there this turn.");
        }
      }
      if (type === "PLAY_MILITARY_MOVE" || type === "PLAY_MILITARY_ATTACK") {
        const actor = getPlayer(st, actorId);
        if (!movementTradePayment(st, actor, "military", payload)) {
          return denied("military_trade_timing",
            "Military trade is spent during combat after the dice are rolled, not before movement.");
        }
        if (type === "PLAY_MILITARY_ATTACK") {
          const targets = findDefenders(st, payload.toKey, actorId);
          const defender = selectCombatDefender(targets, payload);
          if (!defender) return denied("combat_target_missing", "There is no legal target in that space.");
          if (defender.ownerId && !canAffectRivalPiece(st, actorId, defender.ownerId)) {
            const owner = getPlayer(st, defender.ownerId);
            return denied("non_aggression_pact",
              `Your Non-Aggression Pact prevents an attack on ${owner ? owner.name : "that player"}.`);
          }
        }
      }
      return { ok: true };
    }

    return denied("unauthorized", "This action is not available to this seat.");
  }

  function bindActionActor(action, context) {
    const bound = cloneSerializable(action || {});
    bound.payload = bound.payload || {};
    delete bound.payload.hostOverride;
    // These host actions deliberately target a different object/player, and a
    // joining player's id is the payload itself. Every other player action is
    // stamped from the authenticated connection.
    if (!HOST_ACTIONS.has(bound.type)) {
      bound.payload.playerId = context.actorId || null;
    } else if (bound.type !== "HOST_ADJUST_PLAYER") {
      delete bound.payload.playerId;
    }
    return bound;
  }

  // Read-only preflight for the interface. This is deliberately the exact same
  // binding and permission table used by tryApplyAction; it cannot grant an
  // action and it never replaces the authoritative host-side check.
  function getActionPermission(state, action, context) {
    if (!state || !action || typeof action.type !== "string") {
      return denied("invalid_action", "Malformed action.");
    }
    const trusted = context || {};
    return authorizeAction(state, bindActionActor(action, trusted), trusted);
  }

  function tryApplyAction(state, action, context) {
    const original = state;
    if (!state || !action || typeof action.type !== "string") {
      return { accepted: false, state: original, code: "invalid_action", message: "Malformed action." };
    }
    try {
      const candidate = cloneSerializable(state);
      migrateState(candidate);
      const bound = bindActionActor(action, context || {});
      const permission = authorizeAction(candidate, bound, context || {});
      if (!permission.ok) {
        return { accepted: false, state: original, code: permission.code, message: permission.message };
      }
      // applyAction lazily arms the turn checkpoint. Prepare that housekeeping
      // before the transaction baseline so an otherwise illegal move is not
      // mistaken for a successful action merely because the checkpoint exists.
      if (candidate.phase === "playing" && TURN_ACTIONS.has(bound.type) && bound.type !== "UNDO_TURN") {
        ensureTurnUndo(candidate);
      }
      const before = JSON.stringify(candidate);
      const result = applyAction(candidate, bound);
      if (JSON.stringify(result) === before) {
        return {
          accepted: false, state: original, code: "invalid_action",
          message: "The action is not legal in the current state."
        };
      }
      return { accepted: true, state: result, code: "ok", message: "Action accepted." };
    } catch (err) {
      return {
        accepted: false, state: original, code: "action_error",
        message: err && err.message ? err.message : "The action could not be applied."
      };
    }
  }

  function projectState(state, viewerSeatId) {
    if (!state) return state;
    const view = cloneSerializable(state);
    view.stateView = true;

    // The host keeps its undo checkpoint out of every network view. A client
    // only needs the public can/cannot-undo result rendered by the host.
    delete view.turnUndo;

    if (Array.isArray(view.tileStack)) {
      view.tileStackCount = view.tileStack.length;
      delete view.tileStack;
    }
    if (Array.isArray(view.tileDeck)) {
      view.tileDeckCount = view.tileDeck.length;
      delete view.tileDeck;
    }
    Object.values(view.wonderDecks || {}).forEach((deck) => {
      const count = Array.isArray(deck.deck) ? deck.deck.length : (deck.remainingCount || 0);
      deck.remainingCount = count;
      delete deck.deck;
    });

    if (view.setup) {
      const visibleSetupTileIds = new Set();
      ["playerTiles", "draftTiles"].forEach((field) => {
        const hands = view.setup[field] || {};
        const counts = {};
        Object.keys(hands).forEach((seatId) => {
          counts[seatId] = Array.isArray(hands[seatId]) ? hands[seatId].length : 0;
          if (seatId !== viewerSeatId) delete hands[seatId];
          else (hands[seatId] || []).forEach((tileId) => visibleSetupTileIds.add(tileId));
        });
        view.setup[`${field}Counts`] = counts;
      });
      if (view.pendingExploration && view.pendingExploration.tileId) {
        visibleSetupTileIds.add(view.pendingExploration.tileId);
      }
      Object.values(view.setup.tiles || {}).forEach((tile) => {
        if (tile.placed || visibleSetupTileIds.has(tile.id)) return;
        // ownerId and isCore are enough to reconstruct somebody else's dealt
        // capital/draft tile even after the hand arrays themselves are gone.
        tile.ownerId = null;
        tile.isCore = false;
      });
      if (Array.isArray(view.setup.tileStack)) {
        view.setup.tileStackCount = view.setup.tileStack.length;
        delete view.setup.tileStack;
      }
    }

    view.pendingChoices = (view.pendingChoices || []).map((choice) => {
      if (choice.playerId === viewerSeatId) return choice;
      return { id: choice.id, playerId: choice.playerId, status: "pending" };
    });
    view.log = (view.log || []).slice(-MAX_LOG_ENTRIES);
    view.chat = (view.chat || []).slice(-MAX_CHAT_ENTRIES);
    return view;
  }

  // A turn can be put back exactly as it began until the table has learned
  // something that cannot honestly be "unlearned" (a die result, explored
  // land, or the next wonder card). The checkpoint travels with the state, so
  // Undo behaves the same for the host and for a player connected over PeerJS.
  const TURN_ACTIONS = new Set([
    "END_FOCUS_CARD", "END_TURN", "RESOLVE_PENDING_CHOICE", "ADD_TRADE",
    "PLAY_CULTURE", "PLAY_GROWTH_REINFORCE", "PLAY_GROWTH_DISTRICT", "SKIP_GROWTH_DISTRICT",
    "PLAY_SCIENCE", "PLAY_ECONOMY", "PLAY_MILITARY_MOVE",
    "PLAY_MILITARY_ATTACK", "PLAY_INDUSTRY_CITY", "PLAY_INDUSTRY_WONDER",
    "EXPLORE_TILE", "BEGIN_EXPLORATION", "PLACE_EXPLORED_TILE",
    "ABANDON_EXPLORATION", "END_UNIT_MOVE", "COMBAT_ROLL", "COMBAT_SPEND",
    "COMBAT_PASS", "CANCEL_COMBAT", "UNDO_TURN"
  ]);

  function stateWithoutUndo(st) {
    const plain = { ...st };
    delete plain.turnUndo;
    return JSON.parse(JSON.stringify(plain));
  }

  function armTurnUndo(st) {
    if (!st || st.phase !== "playing") { if (st) st.turnUndo = null; return; }
    const player = currentPlayer(st);
    if (!player) { st.turnUndo = null; return; }
    st.turnUndo = {
      playerId: player.id,
      round: st.turn.round,
      turnIndex: st.turn.index,
      actions: 0,
      locked: false,
      reason: "",
      snapshot: stateWithoutUndo(st)
    };
  }

  function ensureTurnUndo(st) {
    const cp = currentPlayer(st);
    const undo = st.turnUndo;
    if (!cp || !undo || undo.playerId !== cp.id || undo.round !== st.turn.round ||
        undo.turnIndex !== st.turn.index) armTurnUndo(st);
  }

  function getUndoStatus(st, playerId) {
    const cp = st && st.phase === "playing" ? currentPlayer(st) : null;
    const undo = st && st.turnUndo;
    if (!cp || !undo || undo.playerId !== cp.id || (playerId && playerId !== cp.id)) {
      return { canUndo: false, reason: "Undo is available only during your turn.", actions: 0 };
    }
    if (undo.locked || !undo.snapshot) {
      return { canUndo: false, reason: undo.reason || "This turn has passed an irreversible step.", actions: undo.actions || 0 };
    }
    if (!(undo.actions > 0)) {
      return { canUndo: false, reason: "Nothing in this turn needs undoing yet.", actions: 0 };
    }
    return { canUndo: true, reason: "Restore the start of this turn.", actions: undo.actions };
  }

  function irreversibleReason(type, payload) {
    if (type === "COMBAT_ROLL" || (type === "COMBAT_SPEND" && payload.mode === "reroll")) {
      return "Undo is locked because a combat die has been rolled.";
    }
    if (type === "EXPLORE_TILE" || type === "BEGIN_EXPLORATION" ||
        type === "PLACE_EXPLORED_TILE" || type === "ABANDON_EXPLORATION") {
      return "Undo is locked because an exploration tile has been revealed and resolved.";
    }
    if (type === "PLAY_INDUSTRY_WONDER") {
      return "Undo is locked because building the wonder revealed the next card.";
    }
    return "";
  }

  function restoreTurn(st, payload) {
    const cp = currentPlayer(st);
    if (!cp || (!payload.hostOverride && payload.playerId !== cp.id)) return st;
    const status = getUndoStatus(st, payload.playerId);
    if (!status.canUndo) return st;
    const name = (currentPlayer(st) || {}).name || "Player";
    const restored = migrateState(JSON.parse(JSON.stringify(st.turnUndo.snapshot)));
    log(restored, `${name} undid the current turn.`);
    armTurnUndo(restored);
    return restored;
  }

  // --- Finalize Setup ---

  function finalizeSetup(st) {
    st.setup.phase = "done";
    st.phase = "playing";
    st.turn.round = 1;
    st.turn.index = 0;

    st.tiles = st.setup.tiles;
    st.tileStack = st.setup.tileStack || [];
    st.tileDeck = st.tileStack.slice();

    st.players.forEach((player) => {
      // Base p4/p8: the starting caravan is on Foreign Trade, and armies wait
      // on the military card until that card sends them out. Putting either on
      // the capital would incorrectly add a figure to that space's defence.
      syncUnitCounts(st, player);
      player.armies.forEach((u) => { u.position = null; resetFigureForCard(u); });
      player.caravans.forEach((u) => { u.position = null; resetFigureForCard(u); });
    });

    log(st, "Setup complete! Game begins.");
    queueStartOfTurnEffects(st, currentPlayer(st));
    armTurnUndo(st);
  }

  // --- Actions ---

  function applyAction(st, action) {
    migrateState(st);
    if (st.migrationStatus && st.migrationStatus.readOnly) return st;
    const { type, payload = {} } = action;
    const logBefore = st.log ? st.log.length : 0;
    const tracksTurn = st.phase === "playing" && TURN_ACTIONS.has(type) && type !== "UNDO_TURN";
    if (tracksTurn) ensureTurnUndo(st);
    // Maturity is derived, and every action can change it — placing or losing a
    // ring token, razing a city, capturing one. Refreshing the display mirror
    // on both sides of the action keeps it honest without asking each of the
    // dozens of mutation sites to remember, and keeps a rejected action from
    // registering as a change merely because it repaired a stale flag.
    syncCityMaturity(st);
    syncNaturalWonderTokens(st);
    syncBarbarianRegistry(st);
    const before = tracksTurn ? JSON.stringify(stateWithoutUndo(st)) : "";
    const result = applyActionInner(st, action);
    syncCityMaturity(result);
    syncNaturalWonderTokens(result);
    syncBarbarianRegistry(result);
    const changed = tracksTurn && before !== JSON.stringify(stateWithoutUndo(result));
    if (changed) {
      if (type === "END_TURN") {
        // Ending the turn commits it. The next player gets a fresh checkpoint
        // after all round/start-of-turn effects have been queued.
        armTurnUndo(result);
      } else {
        ensureTurnUndo(result);
        result.turnUndo.actions = (result.turnUndo.actions || 0) + 1;
        const reason = irreversibleReason(type, payload);
        if (reason) {
          result.turnUndo.locked = true;
          result.turnUndo.reason = reason;
          result.turnUndo.snapshot = null;
        }
      }
    }
    if (result.log && result.log.length > logBefore && payload && payload.playerId) {
      result.lastAction = { type, playerId: payload.playerId, ts: Date.now() };
    }
    return result;
  }

  function applyActionInner(st, action) {
    const { type, payload = {} } = action;

    if (type === "UNDO_TURN") return restoreTurn(st, payload);

    if (type === "SET_LEADER") {
      if (st.phase !== "lobby") return st;
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const wanted = payload.leaderId;
      if (wanted !== "random") {
        const leader = LEADER_BY_ID[wanted];
        if (!leader) return st;
        // Leader sheets are unique — no two players may run the same civ.
        if (st.players.some((p) => p.id !== player.id && p.leaderId === wanted)) return st;
        player.leaderId = wanted;
        applyLeaderStart(player);
        player.ready = false;
        log(st, `${player.name} will lead ${leader.civ} (${leader.name}).`);
      } else {
        player.leaderId = "random";
        player.focusRow = FOCUS_TYPES.slice();
        player.ready = false;
        log(st, `${player.name} will draw a random leader.`);
      }
      return st;
    }

    if (type === "SET_READY") {
      if (st.phase !== "lobby") return st;
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      player.ready = !!payload.ready;
      log(st, `${player.name} is ${player.ready ? "ready" : "not ready"}.`);
      return st;
    }

    if (type === "START_GAME") {
      if (st.phase !== "lobby") return st;
      if (!st.solo && st.players.length < CFG.minPlayers) return st;
      assignRandomLeaders(st);
      const newState = createState(st.players, { advancedDraft: !!payload.advancedDraft });
      newState.solo = !!st.solo;
      // Carry the lobby chatter into the game log for continuity.
      newState.log = (st.log || []).concat(newState.log).slice(-MAX_LOG_ENTRIES);
      return newState;
    }

    if (type === "ADD_PLAYER") {
      if (st.players.find((p) => p.id === payload.id)) return st;
      // Lobby only. Joining during setup used to be allowed, and it threw the
      // setup away and dealt it again from scratch — every fortress and capital
      // tile already placed was wiped so the newcomer could have a seat. Once
      // the board is being built, a latecomer waits for the next game.
      if (st.phase !== "lobby") return st;
      if (st.players.length >= CFG.maxPlayers) return st;
      migratePlayer(payload);
      // Two players cannot share a physical component set. A player who NAMED a
      // colour that has since been taken is refused rather than quietly seated
      // in a different one - a stale client should be told its pick is gone, not
      // discover later that it is playing green. Joining with no preference
      // still auto-assigns, which is what the five-players-pick-nothing case
      // needs.
      const requested = String(payload.color || "").toLowerCase();
      // Only a NAMED component colour can clash. A legacy or unrecognised value
      // is not a request for a particular seat, so it still auto-assigns
      // instead of failing the join.
      if (SEAT_COLORS.includes(requested) && !colorIsFree(st, requested, payload.id)) return st;
      payload.color = seatColor(st.players.map((p) => p.color), payload.color);
      st.players.push(payload);
      st.turn.order.push(payload.id);
      log(st, `${payload.name} joined the lobby as ${colorName(payload.color)}. (${st.players.length}/${CFG.maxPlayers})`);
      return st;
    }

    if (type === "KICK_PLAYER") {
      // Lobby only; authorizeAction refuses everything else, including the host
      // removing itself. The seat's colour and civilization are released simply
      // by ceasing to be in st.players, because availability is derived from
      // who is seated rather than from a separate reservation list.
      if (st.phase !== "lobby") return st;
      const targetId = String(payload.targetId || "");
      const target = getPlayer(st, targetId);
      if (!target) return st;
      st.players = st.players.filter((p) => p.id !== targetId);
      st.turn.order = (st.turn.order || []).filter((id) => id !== targetId);
      if (st.turn.index >= st.turn.order.length) st.turn.index = 0;
      st.kicked = (st.kicked || []).filter((id) => id !== targetId).concat([targetId]).slice(-16);
      log(st, `${target.name} was removed from the lobby by the host.`);
      return st;
    }

    if (type === "SET_COLOR") {
      // Changing seats in the lobby. The colour being left behind is released
      // by the same assignment, because availability is derived from who is
      // sitting on what rather than from a separate reservation list.
      if (st.phase !== "lobby") return st;
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const wanted = String(payload.color || "").toLowerCase();
      if (!SEAT_COLORS.includes(wanted)) return st;
      if (!colorIsFree(st, wanted, player.id)) return st;
      if (String(player.color || "").toLowerCase() === wanted) return st;
      player.color = wanted;
      log(st, `${player.name} took ${colorName(wanted)}.`);
      return st;
    }

    if (type === "PLACE_FORTRESS") {
      if (st.phase !== "setup" || st.setup.phase !== "fortress") return st;
      const activeId = st.setup.order[st.setup.turnIndex];
      if (payload.playerId !== activeId) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (!hex || hex.active) return st;
      const validSet = getValidFortressHexes(st);
      if (!validSet.has(payload.hexKey)) return st;

      hex.active = true;
      hex.revealed = true;
      // Terra p11: "Fort spaces are treated as forests with a terrain
      // difficulty value of 3." This is printed rule, not an invented value.
      // I removed it once on the reasoning that a fort's only footprint is its
      // defence of 6 — it is not. The difficulty is exactly why a caravan on a
      // slot-1 or slot-2 Economy card cannot enter a fort, which is correct
      // behaviour and was reported as a bug. p11 also says caravans and armies
      // CAN move into forts; that is gated by the ordinary terrain rule, not by
      // a special case.
      hex.terrain = "forest";
      hex.fortress = true;
      hex.fortressOwnerId = null;
      hex.tileId = "fortress";
      st.setup.fortressPlaced[payload.playerId] = true;
      st.setup.fortressKeys = st.setup.fortressKeys || {};
      st.setup.fortressKeys[payload.playerId] = payload.hexKey;

      updateCoreAdjacency(st);
      fillEnclosedHoles(st);

      const player = getPlayer(st, payload.playerId);
      log(st, `${player ? player.name : "Player"} placed a fortress.`);

      // Advance to next player or next phase
      const allPlaced = st.setup.order.every((id) => st.setup.fortressPlaced[id]);
      if (allPlaced) {
        st.setup.phase = "capital_tile";
        st.setup.turnIndex = 0;
        log(st, "All fortresses placed. Capital tile placement begins.");
      } else {
        advanceSetupTurn(st);
      }
      return st;
    }

    if (type === "PLACE_TILE") {
      const inDraft = st.setup.phase === "draft_tile";
      if (st.phase !== "setup" || (st.setup.phase !== "capital_tile" && !inDraft)) return st;
      const activeId = st.setup.order[st.setup.turnIndex];
      if (payload.playerId !== activeId) return st;
      const hand = inDraft ? st.setup.draftTiles : st.setup.playerTiles;
      const playerTiles = hand[payload.playerId] || [];
      if (!playerTiles.includes(payload.tileId)) return st;

      const result = validateTilePlacement(st, payload.tileId, payload.anchorKey, payload.rotation);
      if (!result.ok) return st;

      placeTileOnMap(st, payload.tileId, payload.anchorKey, payload.rotation, payload.side);
      hand[payload.playerId] = playerTiles.filter((id) => id !== payload.tileId);

      const player = getPlayer(st, payload.playerId);
      const tile = st.setup.tiles[payload.tileId];
      log(st, `${player ? player.name : "Player"} placed a ${inDraft ? "drafted" : tile.type} tile.`);

      // Check if all tiles placed for this phase
      const allDone = st.setup.order.every((id) => (hand[id] || []).length === 0);
      if (allDone) {
        if (inDraft) {
          st.setup.phase = "fortress";
          st.setup.turnIndex = 0;
          log(st, "Core drafted and placed. Fortress placement begins.");
        } else {
          finalizeSetup(st);
        }
      } else {
        advanceSetupTurnTile(st, inDraft ? "draftTiles" : "playerTiles");
      }
      return st;
    }

    if (type === "BEGIN_EXPLORATION") {
      return beginExploration(st, payload);
    }

    if (type === "PLACE_EXPLORED_TILE") {
      return placePendingExploration(st, payload);
    }

    // Legacy offline compatibility. Network transactions reject this combined
    // reveal-and-place action and require a separately acknowledged reveal.
    if (type === "EXPLORE_TILE") {
      if (st.phase !== "playing") return st;
      const current = currentPlayer(st);
      if (!current || current.id !== payload.playerId) return st;
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      if (!st.tileStack || st.tileStack.length === 0) return st;
      // Apadana buys one expedition from a space that would not normally
      // qualify, and with nobody standing on it.
      const freeRun = !!(st.freeExplore && st.freeExplore.playerId === player.id &&
        st.freeExplore.fromKey === payload.fromKey);
      if (payload.fromKey && !freeRun && !isExploreEligible(st, payload.fromKey)) return st;

      // Terra p12: a figure may explore once per move. That has to live here —
      // the UI's own bookkeeping is thrown away by a cancel, which used to hand
      // out a free tile every time you pressed Escape.
      let explorer = null;
      if (payload.fromKey && !freeRun) {
        explorer = player.armies.concat(player.caravans)
          .find((u) => u.position === payload.fromKey);
        if (!explorer) return st;                  // not your figure standing there
        if (explorer.exploredThisMove) return st;  // already explored this move
      }

      // Terra p12 step 1: the bottom tile, not the top.
      const tileId = st.tileStack[st.tileStack.length - 1];
      const result = validateExploration(st, tileId, payload.anchorKey, payload.rotation);
      if (!result.ok) return st;
      if (payload.fromKey) {
        // The new land still has to touch the space it was found from.
        const cellKeys = getTileHexKeys(payload.anchorKey, payload.rotation, st.map.hexes);
        const touchesUnit = cellKeys.some((ck) =>
          hexNeighborKeys(parseQ(ck), parseR(ck)).some((nk) => nk === payload.fromKey)
        );
        if (!touchesUnit) return st;
      }

      st.tileStack.pop();
      st.tileDeck = st.tileStack.slice();
      placeExploredTile(st, tileId, payload.anchorKey, payload.rotation, payload.side || "A");

      if (explorer) {
        explorer.exploredThisMove = true;
        explorer.exploredThisCard = true; // compatibility mirror, not the scope
        explorer.moveInProgress = true;
      }
      if (freeRun) st.freeExplore = null;
      const tile = st.tiles[tileId];
      log(st, `${player.name} explored and placed a ${tile ? tile.type : "unknown"} tile.`);
      return st;
    }

    // Terra p12 step 2: a tile that cannot be placed anywhere goes back on top
    // of the stack and the expedition is over — the movement is still spent.
    if (type === "ABANDON_EXPLORATION") {
      if (st.pendingExploration) return abandonPendingExploration(st, payload);
      // Legacy offline saves can still finish the old one-packet flow. Online
      // authorization never reaches this fallback without pendingExploration.
      if (st.phase !== "playing") return st;
      const current = currentPlayer(st);
      if (!current || current.id !== payload.playerId) return st;
      const player = getPlayer(st, payload.playerId);
      if (!player || !st.tileStack || !st.tileStack.length) return st;
      const tileId = st.tileStack.pop();
      st.tileStack.unshift(tileId);
      st.tileDeck = st.tileStack.slice();
      const unit = player.armies.concat(player.caravans)
        .find((u) => u.position === payload.fromKey);
      if (unit) {
        unit.exploredThisMove = true;
        unit.exploredThisCard = true;
        unit.moveInProgress = true;
      }
      if (st.freeExplore && st.freeExplore.playerId === player.id) st.freeExplore = null;
      log(st, `${player.name} found nowhere to put the new land; it goes back on the stack.`);
      return st;
    }

    if (type === "RESOLVE_PENDING_CHOICE") {
      return resolvePendingChoice(st, payload);
    }

    if (type === "HOST_EDIT_HEX") {
      const hex = st.map.hexes[payload.hexKey];
      if (!hex) return st;
      applyHostHexEdit(st, hex, payload.changes || {});
      manualLog(st, `Hex ${payload.hexKey} edited.`);
      return st;
    }

    if (type === "HOST_ADJUST_PLAYER") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      applyHostPlayerAdjust(st, player, payload);
      manualLog(st, `${player.name} adjusted by host.`);
      return st;
    }

    if (type === "FORCE_EVENT") {
      if (!EVENT_NAMES.includes(payload.event)) return st;
      resolveEvent(st, payload.event);
      manualLog(st, `Forced event: ${EVENT_LABELS[payload.event] || payload.event}.`);
      return st;
    }

    if (type === "CHECK_AGENDAS") {
      updateAgendaClaims(st);
      const winner = checkVictory(st);
      if (winner) {
        st.winner = winner;
        st.phase = "gameover";
        log(st, `${winner.playerName} wins by ${winner.type}!`);
      } else {
        manualLog(st, "Agenda claims refreshed.");
      }
      return st;
    }

    // --- Playing phase actions ---

    if (st.movementContinuation) {
      const continuation = st.movementContinuation;
      const allowed = continuation.unitType === "caravan"
        ? ["PLAY_ECONOMY", "END_UNIT_MOVE"]
        : ["PLAY_MILITARY_MOVE", "PLAY_MILITARY_ATTACK", "END_UNIT_MOVE"];
      if (!allowed.includes(type) || payload.playerId !== continuation.playerId ||
          payload.unitId !== continuation.unitId) return st;
    }

    if (type === "END_UNIT_MOVE") {
      if (st.phase !== "playing") return st;
      const current = currentPlayer(st);
      if (!current || current.id !== payload.playerId) return st;
      return endUnitMovement(st, payload);
    }

    if (type.startsWith("PLAY_") || type === "END_TURN" ||
        type === "END_FOCUS_CARD") {
      if (st.phase !== "playing") return st;
    }
    if (type.startsWith("PLAY_") || type === "END_TURN" || type === "END_FOCUS_CARD") {
      const cp = currentPlayer(st);
      if (!cp) return st;
      if (payload.playerId && cp.id !== payload.playerId) return st;
      if (!payload.playerId) payload.playerId = cp.id;
    }

    if (type.startsWith("PLAY_") && st.activeCard && st.activeCard.playerId === payload.playerId) {
      const wanted = type === "PLAY_ECONOMY" ? "economy"
        : type.startsWith("PLAY_MILITARY") ? "military" : null;
      if (wanted !== st.activeCard.cardType) return st;
      const list = wanted === "economy" ? player0(st, payload).caravans : player0(st, payload).armies;
      const u = (list || []).find((x) => x.id === payload.unitId);
      if (!u || !canMoveUnitOnActiveCard(st, player0(st, payload), u, wanted)) return st;
    }

    if (type === "PLAY_CULTURE") {
      const player = getPlayer(st, payload.playerId);
      const placement = validateCulturePlacement(st, payload.playerId,
        payload.hexKeys, payload.tradeSpent, payload.tradeResources);
      if (!placement.ok) return st;
      const hexKeys = placement.hexKeys;
      const franceBonus = placement.franceBonus;
      const placedMountains = [];
      const placedHills = [];
      for (const k of hexKeys) {
        const hx = st.map.hexes[k];
        if (hx.resource && hx.resource !== "wonder") {
          if (player.resources[hx.resource] !== undefined) player.resources[hx.resource]++;
          hx.resource = null;
        }
        placeControlToken(st, k, payload.playerId, { fortified: false });
        if (hx.terrain === "mountain") placedMountains.push(k);
        if (hx.terrain === "hill") placedHills.push(k);
      }
      log(st, `${player.name} placed ${hexKeys.length} control marker(s).${franceBonus ? ` (+${franceBonus} from wonders)` : ""}`);
      // Inca: each token placed on a mountain may spill onto an adjacent space.
      if (hasLeader(player, "inca")) {
        placedMountains.forEach((k) => queueIncaChain(st, player, k));
      }
      // Stonehenge: a token landing on a hill can spread along the ridge.
      if (hasWonder(st, player.id, "Stonehenge")) {
        placedHills.forEach((k) => queueStonehengeChain(st, player, k));
      }
      checkDevelopment(st, payload.playerId);
      // Drama and Poetry has a second, optional paragraph. Keep the card in
      // resolution until that offer is accepted or explicitly declined.
      if (!queueCultureFollowUp(st, player, placement.tradePayment)) {
        resolveCard(st, player, "culture", placement.tradePayment);
      }
      return st;
    }

    if (type === "PLAY_GROWTH_DISTRICT") {
      const validation = validateGrowthDistrictPlacement(st, payload.playerId, payload);
      if (!validation.ok) return st;
      const { player, slot: growthSlot, tradeSpent, tradePayment, profile } = validation;
      const hex = st.map.hexes[payload.hexKey];
      // Mysticism moves the physical control token from the district's own
      // space. Capture that token before the district replaces it; adjacent
      // control tokens are not part of the printed effect.
      const mysticismControl = profile.mysticism && hex.control &&
        hex.control.ownerId === player.id && !hex.control.district
        ? cloneSerializable(hex.control) : null;
      // A district is a control marker, so it collects the resource token on
      // its space exactly as a plain one does (PLAY_CULTURE and the
      // place_control choice both already do this). Without it the token was
      // neither taken nor cleared: it stayed on the map under the district,
      // uncollectable for the rest of the game, and the space could never pay
      // out again.
      if (hex.resource && hex.resource !== "wonder") {
        if (player.resources[hex.resource] !== undefined) player.resources[hex.resource]++;
        hex.resource = null;
      }
      // Terra p9: the district goes down on its UNREINFORCED side even when it
      // replaces a reinforced control token of yours. That is printed, not a
      // bug — do not "fix" the discarded `fortified` flag here.
      placeControlToken(st, payload.hexKey, payload.playerId, { district: payload.district });
      // "...whether or not the card's effect was used to reinforce control
      // tokens" — so the tokens still buy reinforcements after a district.
      log(st, `${player.name} placed a ${payload.district} district.`);
      checkDevelopment(st, payload.playerId);
      startGrowthDistrictSequence(st, player, profile, growthSlot,
        tradePayment, payload.hexKey, { mysticismControl });
      return st;
    }

    if (type === "SKIP_GROWTH_DISTRICT") {
      const validation = validateGrowthDistrictSkip(st, payload.playerId,
        payload.tradeSpent, payload.tradeResources);
      if (!validation.ok) return st;
      startGrowthDistrictSequence(st, validation.player, validation.profile,
        validation.slot, validation.tradePayment, null);
      return st;
    }

    if (type === "PLAY_GROWTH_REINFORCE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const resolution = st.cardResolution && st.cardResolution.playerId === player.id &&
        st.cardResolution.cardType === "growth" ? st.cardResolution : null;
      if (!resolution && growthCardProfile(player).sequential) return st;
      // "Reinforce a number of your control tokens up to this slot's number",
      // plus one more for each trade token spent from the card.
      const selectedTrade = resolution ? resolution.tradeBudget : payload.tradeSpent;
      const selectedResources = resolution && resolution.tradePayment
        ? resolution.tradePayment.resources : payload.tradeResources;
      const placement = validateReinforcePlacement(st, payload.playerId,
        payload.hexKeys, selectedTrade,
        resolution ? resolution.reinforceBase : getSlotValue(player, "growth", st),
        selectedResources);
      if (!placement.ok) return st;
      const done = reinforceWithTokens(st, player, placement.hexKeys, placement.limit);
      if (resolution) {
        finishFocusSequence(st, {
          playerId: player.id,
          cardType: "growth",
          resolutionId: resolution.id
        }, placement.tradePayment);
      } else {
        resolveCard(st, player, "growth", placement.tradePayment);
      }
      log(st, `${player.name} reinforced ${done} marker(s).`);
      return st;
    }

    if (type === "PLAY_SCIENCE") {
      const player = getPlayer(st, payload.playerId);
      if (!canResolveCard(player, "science")) return st;
      const trade = validateFocusTradeSpend(st, player, "science",
        payload.tradeSpent, payload.tradeResources);
      if (!trade.ok) return st;
      let bonus = 0;
      // China's Writing (unique Science I): +1 step while you control a wonder.
      if (uniqueInPlay(player, "china") && countWonders(st, player.id) > 0) bonus += 1;
      // England's Natural History (unique Science III): +1 per resource type held.
      if (uniqueInPlay(player, "england")) {
        const types = new Set(RESOURCES.filter((r) => (player.resources[r] || 0) > 0));
        getControlledNaturalWonders(st, player.id).forEach((entry) => types.add(entry.resource));
        bonus += types.size;
      }
      // The client may preview an amount, but the dial movement is derived
      // from the authoritative slot and validated payment. Standard upgraded
      // science cards resolve their printed first paragraph before this dial
      // movement, so an interactive prelude keeps the same transaction open.
      const advanceAmount = getSlotValue(player, "science", st) + trade.spent + bonus;
      if (!queueSciencePrelude(st, player, trade, advanceAmount)) {
        advanceTech(st, player, advanceAmount);
        resolveCard(st, player, "science", trade);
      }
      return st;
    }

    if (type === "PLAY_ECONOMY") {
      const player = getPlayer(st, payload.playerId);
      if (!canResolveCard(player, "economy")) return st;
      const unit = player.caravans.find((u) => u.id === payload.unitId);
      if (!unit) return st;
      const continuation = st.movementContinuation;
      if (continuation && (continuation.playerId !== player.id ||
          continuation.unitType !== "caravan" || continuation.unitId !== unit.id ||
          unit.position !== continuation.fromKey)) return st;
      const ecoHex = st.map.hexes[payload.toKey];
      if (!ecoHex || !ecoHex.active) return st;
      // Where this caravan sets off from. A continuation resumes where it
      // stopped; a caravan on the map sets off from where it stands; only one
      // still on the economy card chooses a city, and that choice is checked
      // against the printed set rather than taken on trust.
      //
      // This used to default an undeployed caravan to the capital and honour a
      // requested start ONLY for Rome, which got both halves wrong: everyone
      // may launch from a mature city (base p8), and Rome's wider set is for a
      // caravan leaving the CARD, not a licence to pick a deployed one up and
      // put it down in another city.
      let startKey;
      if (continuation) startKey = continuation.fromKey;
      else if (unit.position) startKey = unit.position;
      else {
        const wanted = payload.startKey || findCapital(st, payload.playerId);
        if (!wanted || !caravanLaunchSpaces(st, payload.playerId).has(wanted)) return st;
        startKey = wanted;
      }
      if (!startKey) return st;
      const tradePayment = continuation
        ? normalizeFocusTradePayment(continuation.tradePayment || continuation.tradeSpent)
        : movementTradePayment(st, player, "economy", payload);
      if (!tradePayment) return st;
      const tradeSpent = tradePayment.spent;
      const moveLimit = continuation
        ? continuation.remaining : getEconomyMove(player, st) + tradeSpent;
      const reachable = getReachable(st, startKey, moveLimit, "caravan", payload.playerId);
      if (payload.toKey !== startKey && !reachable.has(payload.toKey)) return st;
      // How far this hop actually goes, measured before anything on the board
      // moves. Currency needs it to know what movement is left over.
      const stepsUsed = payload.toKey === startKey ? 0
        : (getReachableWithDist(st, startKey, moveLimit, "caravan", payload.playerId)
            .get(payload.toKey) || moveLimit);
      const hex = st.map.hexes[payload.toKey];
      // Base p9: "The player cannot move more than one caravan to the same city
      // or city-state during the same turn."
      //
      // This used to be tested AFTER the caravan had already been moved, and
      // the early return then skipped movedThisCard, the activeCard update and
      // finishActiveCard - so the caravan teleported onto the city, gained
      // nothing, and tryApplyAction reported "accepted" because the position
      // had changed. Worse, on a post-exploration continuation it left
      // movementContinuation standing, and the continuation gate allows only
      // PLAY_ECONOMY and END_UNIT_MOVE for that unit, both of which then
      // require a position it no longer had. That was a second hard freeze,
      // and UNDO_TURN is not in the allowed set either.
      const arrival = hex && ((hex.cityState && !antananarivoIsFriendlyCity(st, hex, player.id)) ||
        (hex.city && hex.city.ownerId !== payload.playerId))
        ? payload.toKey : null;
      if (arrival && (player.citiesTradedThisTurn || []).includes(arrival)) return st;
      unit.position = payload.toKey;
      const tradeGain = 2;
      const defeatedBarbarian = !!(hex && hex.barbarian &&
        caravanCanDefeatBarbarian(player));
      // Egypt's Wheel (unique Economy I): trade runs also yield a resource.
      const wheelResource = uniqueInPlay(player, "egypt");
      const queueWheel = () => {
        if (!wheelResource) return;
        queuePendingChoice(st, {
          kind: "gain_resource", playerId: player.id,
          title: "Wheel: Gain a Resource",
          options: RESOURCES.map((r) => ({ id: r, label: r }))
        });
      };
      if (arrival) {
        player.citiesTradedThisTurn = player.citiesTradedThisTurn || [];
        player.citiesTradedThisTurn.push(arrival);
      }
      if (defeatedBarbarian) {
        log(st, `${player.name}'s caravan removed a barbarian with Currency (no trade reward).`);
        // Currency prints "without gaining a trade token", so the token is
        // denied - but it is still a defeat, and an ability that keys off
        // defeating a barbarian is paid.
        onBarbarianDefeated(st, {
          playerId: player.id, hexKey: payload.toKey,
          source: "Currency", trade: false
        });
      } else if (hex && hex.cityState && !antananarivoIsFriendlyCity(st, hex, player.id)) {
        const tradeType = hex.cityState.type;
        if (player.trade[tradeType] !== undefined) {
          player.trade[tradeType] = Math.min(CFG.maxTrade, player.trade[tradeType] + tradeGain);
        }
        grantCityStateDiplomacy(st, player, hex.cityState);
        queueWheel();
        // Kilwa Kisiwani: an extra trade token on any focus card.
        if (hasWonder(st, player.id, "Kilwa Kisiwani")) {
          queuePendingChoice(st, {
            kind: "trade_any", playerId: player.id, amount: 1,
            title: "Kilwa Kisiwani: Extra Trade Token",
            options: tradeTargets(st, player)
          });
        }
        // Orszaghaz: the caravan can take the city-state outright afterwards.
        if (hasWonder(st, player.id, "Orszaghaz")) {
          queuePendingChoice(st, {
            kind: "conquer_city_state", playerId: player.id, hexKey: payload.toKey,
            title: `Orszaghaz: Conquer ${hex.cityState.name}?`,
            source: "Orszaghaz", optional: true,
            options: [{ id: "yes", label: `Conquer ${hex.cityState.name}` }]
          });
        }
        unit.position = null;   // back onto the economy card
        log(st, `${player.name}'s caravan traded at ${hex.cityState.name} (+${tradeGain} ${tradeType} trade). Back to the economy card.`);
      } else if (hex && hex.city && hex.city.ownerId !== payload.playerId) {
        const hostPlayer = getPlayer(st, hex.city.ownerId);
        const hadEmbassyOnArrival = !!(hex.city.isCapital && hostPlayer &&
          heldDiplomacy(player, "embassy").some((d) => d.fromId === hostPlayer.id));
        for (let i = 0; i < tradeGain; i++) {
          queuePendingChoice(st, {
            kind: "trade_any", playerId: player.id, amount: 1,
            title: `Trade run: place token ${i + 1} of ${tradeGain}`,
            options: tradeTargets(st, player)
          });
        }
        grantPlayerDiplomacy(st, player, hex.city.ownerId, {
          embassyOnTake: !!(hex.city.isCapital && hostPlayer && !hadEmbassyOnArrival)
        });
        queueWheel();
        // Great Library: take a card of the same type and level as one of theirs.
        if (hasWonder(st, player.id, "Great Library")) {
          queueGreatLibrary(st, player, hex.city.ownerId);
        }
        queueCartographyCity(st, player, payload.toKey);
        // Ibrahim: the visitor and the Ottoman each choose where their own
        // token goes. These are two seat-owned decisions, never an automatic
        // deposit on Economy.
        if (st.ibrahimHolder === player.id && hasLeader(hostPlayer, "ottoman")) {
          queueTradeGrant(st, {
            kind: "trade_grant",
            playerId: player.id,
            source: "Ibrahim",
            title: "Ibrahim: Place Your Trade Token",
            nextChoice: {
              kind: "trade_grant",
              playerId: hostPlayer.id,
              source: "Ibrahim",
              title: "Ibrahim: Place the Ottoman Trade Token"
            }
          });
        }
        // Ottoman Banking (unique Economy III): a caravan reaching the Ibrahim
        // holder's capital brings home a resource.
        if (uniqueInPlay(player, "ottoman") &&
            st.ibrahimHolder && hex.city.ownerId === st.ibrahimHolder && hex.city.isCapital) {
          queuePendingChoice(st, {
            kind: "gain_resource", playerId: player.id,
            title: "Banking: Gain a Resource",
            options: RESOURCES.map((r) => ({ id: r, label: r }))
          });
        }
        // Embassy: "When you move a caravan to the capital of the player who
        // gave you this card (including the one used to take it), place 1 trade
        // token from the supply on a card in that player's focus row. Then,
        // gain 1 resource of your choice from the supply." The token goes to
        // them — an embassy is worth something to the host as well.
        if (hadEmbassyOnArrival) {
          queueTradeGrant(st, {
            kind: "trade_grant",
            playerId: hostPlayer.id,
            source: "Embassy",
            title: `Embassy: ${hostPlayer.name}, Place a Trade Token`,
            nextChoice: {
              kind: "gain_resource",
              playerId: player.id,
              title: "Embassy: Gain a Resource",
              source: "Embassy",
              options: RESOURCES.map((r) => ({ id: r, label: r }))
            }
          });
        }
        unit.position = null;   // back onto the economy card
        log(st, `${player.name}'s caravan traded at a rival city (+${tradeGain} trade to place). Back to the economy card.`);
      } else {
        log(st, `${player.name} moved caravan.`);
      }
      // FAQ: clearing a barbarian with Currency does NOT end the caravan's
      // remaining movement. Whatever is left is handed back as an ordinary
      // continuation - the same machinery an interrupted exploration uses - so
      // the caravan can move on instead of being stranded on the space it just
      // cleared. Everything else still finishes the figure here.
      const movementLeft = defeatedBarbarian
        ? Math.max(0, moveLimit - stepsUsed) : 0;
      st.movementContinuation = null;
      if (movementLeft > 0 && unit.position === payload.toKey) {
        unit.moveInProgress = true;
        st.movementContinuation = {
          kind: "currency_barbarian_movement",
          playerId: player.id,
          unitType: "caravan",
          unitId: unit.id,
          cardType: "economy",
          startKey,
          fromKey: payload.toKey,
          maxMove: moveLimit,
          remaining: movementLeft,
          tradeSpent: tradePayment.spent,
          tradePayment,
          status: "ready"
        };
        log(st, `${player.name}'s caravan has ${movementLeft} movement left.`);
      } else {
        completeFigureMove(unit);
      }
      activeMovementCard(st, player, "economy", tradePayment);
      if (!unitsLeftToMove(player, "economy")) finishActiveCard(st);
      return st;
    }

    if (type === "PLAY_MILITARY_MOVE") {
      const player = getPlayer(st, payload.playerId);
      if (!canResolveCard(player, "military")) return st;
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit || !canMoveUnitOnActiveCard(st, player, unit, "military")) return st;
      const redeploying = isMassProductionRedeploy(st, player, unit);
      const continuation = st.movementContinuation;
      if (continuation && (continuation.playerId !== player.id ||
          continuation.unitType !== "army" || continuation.unitId !== unit.id ||
          unit.position !== continuation.fromKey)) return st;
      const tradePayment = continuation
        ? normalizeFocusTradePayment(continuation.tradePayment || continuation.tradeSpent)
        : movementTradePayment(st, player, "military", payload);
      if (!tradePayment) return st;
      const moveHex = st.map.hexes[payload.toKey];
      if (!moveHex || !moveHex.active) return st;
      if (antananarivoIsFriendlyCity(st, moveHex, player.id)) return st;
      // An army still on its card sets off from a city it may launch from.
      const from = continuation ? continuation.fromKey : (unit.position || payload.startKey);
      if (!from) return st;
      if (!continuation && !unit.position && !launchSpaces(st, player.id).has(from)) return st;
      const moveLimit = continuation ? continuation.remaining : getMilitaryMove(player, st);
      const reachable = getReachable(st, from, moveLimit, "army", payload.playerId);
      if (payload.toKey !== from && !reachable.has(payload.toKey)) return st;
      if (findDefender(st, payload.toKey, payload.playerId)) return st;
      unit.position = payload.toKey; log(st, `${player.name} moved army.`);
      completeFigureMove(unit);
      if (continuation) st.movementContinuation = null;
      activeMovementCard(st, player, "military", tradePayment);
      if (redeploying) {
        consumeMassProductionRedeploy(st, player, unit);
        log(st, `${player.name} redeployed a defeated army with Mass Production.`);
      }
      if (!unitsLeftToMove(player, "military")) finishActiveCard(st);
      return st;
    }

    if (type === "PLAY_MILITARY_ATTACK") {
      const player = getPlayer(st, payload.playerId);
      if (!canResolveCard(player, "military")) return st;
      if (st.combat && st.combat.turn !== "done") return st;   // one fight at a time
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit || !canMoveUnitOnActiveCard(st, player, unit, "military")) return st;
      const redeploying = isMassProductionRedeploy(st, player, unit);
      const continuation = st.movementContinuation;
      if (continuation && (continuation.playerId !== player.id ||
          continuation.unitType !== "army" || continuation.unitId !== unit.id ||
          unit.position !== continuation.fromKey)) return st;
      const tradePayment = continuation
        ? normalizeFocusTradePayment(continuation.tradePayment || continuation.tradeSpent)
        : movementTradePayment(st, player, "military", payload);
      if (!tradePayment) return st;
      const hex = st.map.hexes[payload.toKey];
      if (!hex) return st;
      // An army on its card can march straight out of a city and attack.
      const from = continuation ? continuation.fromKey : (unit.position || payload.fromKey);
      if (!from) return st;
      if (!continuation && !unit.position && !launchSpaces(st, player.id).has(from)) return st;
      const moveLimit = continuation ? continuation.remaining : getMilitaryMove(player, st);
      const reachable = getReachable(st, from, moveLimit, "army", payload.playerId);
      if (!reachable.has(payload.toKey) && from !== payload.toKey) return st;
      // A Non-Aggression Pact stops the attack before it starts: "You cannot
      // attack or destroy the pieces of the player who gave you this card."
      // Nothing is rolled yet. The dice are thrown when somebody throws them,
      // and only then does the bidding start — the attacker spending everything
      // they mean to spend before the defender may answer (Terra p10).
      // Both combat values are worked out here rather than taken from whoever
      // sent the action, so the two sides of a network game can never disagree
      // about the numbers they are staking a fight on.
      const targets = findDefenders(st, payload.toKey, payload.playerId);
      const defender = selectCombatDefender(targets, payload);
      if (!defender) return st;
      if (defender.ownerId && !canAffectRivalPiece(st, player.id, defender.ownerId)) return st;
      const diplomacySource = defender.ownerId ||
        (defender.type === "citystate" && hex.cityState ? hex.cityState.name : null);
      const returnedDiplomacy = diplomacySource
        ? detachDiplomacyFromSource(st, player, diplomacySource) : [];
      const slot = getSlotValue(player, "military", st);
      const atkParts = getAttackCombatParts(st, player, payload.toKey, defender, slot);
      const leaderBonus = atkParts
        .filter((part) => part.category === "leader")
        .reduce((sum, part) => sum + part.value, 0);
      st.combat = {
        attackerId: payload.playerId,
        unitId: payload.unitId,
        fromKey: payload.fromKey || unit.position || from,
        toKey: payload.toKey,
        defenderLabel: defender.label,
        defenderOwnerId: defender.ownerId || null,
        defenderType: defender.type,
        defenderUnitId: defender.unitId || null,
        atkBase: atkParts.reduce((sum, part) => sum + part.value, 0),
        defBase: defender.power,
        atkParts,
        defParts: defender.parts || [{ label: "defence", value: defender.power }],
        leaderBonus,
        atkRoll: 0,
        defRoll: 0,
        atkRolled: false,
        defRolled: false,
        rolled: false,
        atkTrade: 0,
        defTrade: 0,
        atkResource: 0,
        defResource: 0,
        turn: "attacker",
        history: [],
        massProductionRedeploy: redeploying,
        movementContinuation: continuation ? { ...continuation } : null,
        tradePayment,
        diplomacySource,
        returnedDiplomacy
      };
      if (continuation) st.movementContinuation = null;
      log(st, `${player.name} attacks ${defender.label}.`);
      return st;
    }

    if (type === "CANCEL_COMBAT") {
      const c = st.combat;
      // Once either die is on the table, the result is public information and
      // the attack cannot be taken back. Before that point nothing has moved,
      // no focus card has reset, and cancelling is safe.
      if (!c || c.atkRolled || c.defRolled || c.rolled || c.turn === "done") return st;
      if (!payload.hostOverride && payload.playerId !== c.attackerId) return st;
      const attacker = getPlayer(st, c.attackerId);
      if (attacker && Array.isArray(c.returnedDiplomacy) && c.returnedDiplomacy.length) {
        attacker.diplomacy = (attacker.diplomacy || []).concat(c.returnedDiplomacy);
        log(st, `${attacker.name}'s diplomacy card was restored because no die was rolled.`);
      }
      st.combat = null;
      log(st, `${attacker ? attacker.name : "The attacker"} cancelled the attack before rolling.`);
      return st;
    }

    if (type === "COMBAT_ROLL") {
      const c = st.combat;
      if (!c || c.rolled || c.turn === "done") return st;
      // One die at a time, attacker first (base p11). Seeing the number you
      // have to beat before the second die leaves the table is the whole point.
      const side = payload.side || (c.atkRolled ? "defender" : "attacker");

      if (side === "attacker") {
        if (c.atkRolled) return st;
        if (payload.playerId && payload.playerId !== c.attackerId && !payload.hostOverride) return st;
        c.atkRoll = rollDie();
        c.atkRolled = true;
        const who = getPlayer(st, c.attackerId);
        log(st, `${who ? who.name : "The attacker"} rolls a ${c.atkRoll}.`);
      } else {
        if (!c.atkRolled) return st;          // nobody answers a die not yet thrown
        if (c.defRolled) return st;
        const roller = combatDefenderRoller(st, c);
        if (payload.playerId && roller && payload.playerId !== roller && !payload.hostOverride) return st;
        c.defRoll = rollDie();
        c.defRolled = true;
        log(st, `${c.defenderLabel} answers with a ${c.defRoll}.`);
      }

      c.rolled = !!(c.atkRolled && c.defRolled);
      if (c.rolled) advanceCombat(st);
      return st;
    }

    if (type === "COMBAT_SPEND" || type === "COMBAT_PASS") {
      const c = st.combat;
      if (!c || c.turn === "done" || !c.rolled) return st;
      const side = payload.side || c.turn;
      if (side !== c.turn) return st;                       // not your turn to bid
      const actorId = side === "attacker" ? c.attackerId : c.defenderOwnerId;
      if (payload.playerId && actorId && payload.playerId !== actorId && !payload.hostOverride) return st;

      if (type === "COMBAT_PASS") {
        c.turn = side === "attacker" ? "defender" : "done";
        advanceCombat(st);
        return st;
      }

      const actor = actorId ? getPlayer(st, actorId) : null;
      if (!actor) return st;

      // Jebel Barkal: a resource token is worth +2, and buys nothing else.
      if (payload.mode === "resource") {
        const r = payload.resource;
        if (!combatResources(st, c, side).includes(r)) return st;
        actor.resources[r]--;
        // Counted apart from the trade tokens. Adding it to atkTrade made the
        // burn show up on the "trade tokens" line, so a player reading the
        // breakdown saw trade they had never spent and no sign of the resource
        // they had. The total is the same either way; combatTotals adds both.
        if (side === "attacker") c.atkResource += 2; else c.defResource += 2;
        c.history.push({ side, mode: "resource", resource: r });
        log(st, `${actor.name} burned ${r} at Jebel Barkal for +2.`);
        advanceCombat(st);
        return st;
      }

      // Palenque substitutes an ordinary resource for the military trade token
      // being spent while the attacker resolves their military focus card.
      // It is deliberately separate from Jebel Barkal: the same resource can
      // be chosen as either a +2 Jebel burn or a normal +1/reroll trade spend,
      // never both. A defender is not resolving a focus card and cannot invoke
      // Palenque here.
      const palenqueResource = payload.tradeResource;
      if (palenqueResource !== undefined) {
        if (side !== "attacker" ||
            !combatPalenqueResources(st, c, side).includes(palenqueResource)) return st;
        actor.resources[palenqueResource]--;
      } else {
        if ((actor.trade.military || 0) <= 0) return st;
        actor.trade.military--;
      }

      const before = side === "attacker" ? c.atkRoll : c.defRoll;
      if (payload.mode === "reroll") {
        // A token buys a fresh die instead of a flat +1 — and you get to look
        // before deciding whether to buy another.
        const rolled = rollDie();
        if (side === "attacker") c.atkRoll = rolled; else c.defRoll = rolled;
        c.history.push({ side, mode: "reroll", from: before, to: rolled,
          tradeResource: palenqueResource || null });
        log(st, `${actor.name} rerolled a ${before} into a ${rolled}` +
          (palenqueResource ? ` using ${palenqueResource} through Palenque.` : "."));
      } else {
        if (side === "attacker") c.atkTrade++; else c.defTrade++;
        c.history.push({ side, mode: "plus", tradeResource: palenqueResource || null });
        log(st, palenqueResource
          ? `${actor.name} spent ${palenqueResource} through Palenque for +1.`
          : `${actor.name} spent a military trade token for +1.`);
      }
      advanceCombat(st);
      return st;
    }

    if (type === "PLAY_INDUSTRY_CITY") {
      const validation = validateIndustryCityAction(st, payload.playerId, payload);
      if (!validation.ok) return st;
      const { player, hex, payment, useFigure, figure } = validation;
      spendResources(player, payment.resources);
      if (hex) {
        hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
        if (hex.control && hex.control.ownerId === payload.playerId) hex.control = null;
      }
      if (useFigure && figure) {
        figure.position = null;
        log(st, `${player.name} returned ${figure.id} to its focus card after founding with Animal Husbandry.`);
      }
      resolveCard(st, player, "industry", payment.tradePayment);
      log(st, `${player.name} built a new city.`);
      onCityBuilt(st, { playerId: payload.playerId, hexKey: payload.hexKey, source: "industry" });
      if (getCardName(player, "industry") === "Urbanization" &&
          !getActiveUniqueCard(player, "industry")) {
        queueUrbanizationTokens(st, player, payload.hexKey, 2,
          validation.slot);
      }
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_INDUSTRY_WONDER") {
      const player = getPlayer(st, payload.playerId);
      if (!canResolveCard(player, "industry")) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (!hex || !hex.city || hex.city.ownerId !== payload.playerId || hex.city.hasWonder) return st;
      const builtWonders = new Set();
      Object.values(st.map.hexes).forEach((h) => {
        const wonder = h.city && h.city.wonder || h.unownedWonder;
        if (wonder) builtWonders.add(wonder.name);
      });

      const wonder = getVisibleWonders(st)
        .find((w) => w.name === payload.wonderName && !builtWonders.has(w.name));
      if (!wonder || builtWonders.has(wonder.name)) return st;

      const payment = calculateWonderProduction(st, player, wonder.name, {
        tradeSpent: payload.tradeSpent,
        tradeResources: payload.tradeResources,
        resources: payload.resources,
        naturalWonders: payload.naturalWonders
      });
      if (!payment.ok || !payment.affordable) return st;
      // The same precondition the permission table checks, enforced here too:
      // applyAction is reachable offline and from a save, and this is the last
      // point at which nothing has been spent, built or revealed yet.
      if (wonderResolutionBlocked(st, payload.playerId, wonder.name)) return st;

      spendResources(player, payment.resources);
      markNaturalWondersUsed(st, payment.naturalWonders);
      hex.city.hasWonder = true;
      hex.city.wonder = {
        name: wonder.name, era: wonder.era, type: wonder.type,
        cost: payment.cost.finalCost, effect: wonder.effect
      };
      advanceWonderDeck(st, wonder.type, wonder.name);
      resolveCard(st, player, "industry", payment.tradePayment);
      log(st, `${player.name} built ${wonder.name} with ${payment.production.total} production (cost ${payment.cost.finalCost})! (${wonder.effect})`);
      if (wonder.name === "Pyramids") {
        queueCardUpgrade(st, player, { onlyTier: 1, remaining: 3, optional: true,
          source: "Pyramids", title: "Pyramids: Upgrade a Level-I Card (up to 3)" });
      }
      if (wonder.name === "Potala Palace") {
        queuePotalaPicks(st, player, 3);
      }
      if (wonder.name === "Cristo Redentor") {
        queueCristoTakeover(st, player, payload.hexKey);
      }
      if (wonder.name === "Apadana") {
        queueApadanaExplore(st, player);
      }
      if (wonder.name === "Amundsen-Scott Research Station") {
        queueAmundsenSite(st, player, payload.hexKey);
      }
      if (wonder.name === "Porcelain Tower") {
        queueCardUpgrade(st, player, { remaining: 2, optional: true,
          source: "Porcelain Tower", title: "Porcelain Tower: Upgrade a Card (up to 2)" });
      }
      // Sumeria's Craftsmanship (unique Industry I): building also teaches.
      if (uniqueInPlay(player, "sumeria")) {
        advanceTech(st, player, 1);
      }
      return st;
    }


    // No recruit actions: army and caravan counts are printed on the military
    // and economy focus cards, and syncUnitCounts keeps the figures in step.

    if (type === "ADD_TRADE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || !st.pendingBarbReward || st.pendingBarbReward.playerId !== player.id ||
          !FOCUS_TYPES.includes(payload.cardType)) return st;
      player.trade[payload.cardType] = Math.min(CFG.maxTrade, player.trade[payload.cardType] + 1);
      const cardResolutionId = st.pendingBarbReward.cardResolutionId || null;
      st.pendingBarbReward = null;
      log(st, `${player.name} gained +1 ${payload.cardType} trade.`);
      if (cardResolutionId) advanceCardResolution(st, cardResolutionId);
      return st;
    }

    if (type === "END_FOCUS_CARD") {
      const resolution = st.cardResolution;
      if (resolution && resolution.playerId === payload.playerId &&
          resolution.cardType === "growth" && resolution.step === "growth_reinforce") {
        const player = getPlayer(st, payload.playerId);
        if (finishFocusSequence(st, {
          playerId: payload.playerId,
          cardType: "growth",
          resolutionId: resolution.id
        }, 0) && player) {
          log(st, `${player.name} completed Growth without additional reinforcements.`);
        }
        return st;
      }
      if (st.activeCard && st.activeCard.playerId === payload.playerId) {
        finishActiveCard(st);
        return st;
      }
      // A card you chose that turns out to be able to do nothing — nowhere to
      // put a control token, no legal space for a city — is still the card you
      // resolved this turn. Base p6: choose, resolve, reset. Resolving it for
      // no effect is a legal turn; skipping your turn is not.
      const player = getPlayer(st, payload.playerId);
      if (player && FOCUS_TYPES.includes(payload.cardType) &&
          canResolveCard(player, payload.cardType)) {
        resolveCard(st, player, payload.cardType, payload.tradeSpent || 0);
        log(st, `${player.name} resolved ${FOCUS_LABELS[payload.cardType]} for no effect.`);
      }
      return st;
    }

    if (type === "END_TURN") {
      // Base p6: a turn is choose a card, resolve it, reset it — and then "the
      // turn ends". There is no passing. You cannot end a turn you have not
      // taken, so this is refused until a card has been resolved. Science can
      // always be resolved and END_FOCUS_CARD can always spend a chosen card,
      // so there is no way to be stuck with nothing legal to do.
      const ending = currentPlayer(st);
      if (ending && !ending.cardPlayed && !st.activeCard && !payload.hostOverride) return st;
      // A card left mid-play still counts as played; it must never carry over.
      if (st.activeCard) finishActiveCard(st);
      const cp = currentPlayer(st);
      // University of Sankore: having replaced a card this turn, shuffle any 2
      // non-science cards. Queued before the turn passes, so it is still theirs.
      if (cp && cp.upgradedThisTurn && hasWonder(st, cp.id, "University of Sankore")) {
        queueCardSwap(st, cp, {
          title: "University of Sankore: Swap 2 Cards",
          source: "University of Sankore",
          exclude: "science"
        });
      }
      if (cp) {
        cp.upgradedThisTurn = false;
        cp.arsenalUsed = false;
        cp.arsenalReplay = null;
        cp.estadioUsed = false;
        cp.capitalismUsed = false;
        cp.capitalismReplay = null;
        cp.capitalismNoReset = false;
        cp.cartographyUsedThisTurn = false;
        cp.scorchedEarthUsedThisTurn = false;
        cp.cardPlayed = false;
        cp.wonAttackThisTurn = false;
        cp.citiesTradedThisTurn = [];
        (cp.caravans || []).forEach(resetFigureForCard);
        (cp.armies || []).forEach(resetFigureForCard);
      }
      st.turn.index = (st.turn.index + 1) % st.turn.order.length;
      st.lastCombat = null;
      const np = currentPlayer(st);
      queueStartOfTurnEffects(st, np);
      if (st.turn.index === 0) {
        const winnerBeforeEvent = checkVictory(st);
        if (winnerBeforeEvent) {
          st.winner = winnerBeforeEvent;
          st.phase = "gameover";
          log(st, `${winnerBeforeEvent.playerName} wins by ${winnerBeforeEvent.type}!`);
          return st;
        }
        st.turn.round++;
        advanceEventWheel(st);
        // The wheel may have moved the barbarians Seoul just offered to move.
        refreshSeoulChoices(st);
        log(st, `Round ${st.turn.round} begins.`);
      }
      return st;
    }

    return st;
  }

  // --- Setup Helpers ---

  function advanceSetupTurn(st) {
    const order = st.setup.order;
    let next = st.setup.turnIndex;
    for (let i = 0; i < order.length; i++) {
      next = (next + 1) % order.length;
      if (!st.setup.fortressPlaced[order[next]]) break;
    }
    st.setup.turnIndex = next;
    st.turn.index = next;
  }

  function advanceSetupTurnTile(st, field) {
    const hand = st.setup[field || "playerTiles"];
    const order = st.setup.order;
    let next = st.setup.turnIndex;
    for (let i = 0; i < order.length; i++) {
      next = (next + 1) % order.length;
      if ((hand[order[next]] || []).length > 0) break;
    }
    st.setup.turnIndex = next;
    st.turn.index = next;
  }

  // --- Card Resolution ---

  // An economy or military card moves every figure of its kind, so the card is
  // only spent once all of them have had their move (or the player says stop).
  const player0 = (st, payload) => getPlayer(st, payload.playerId) || { caravans: [], armies: [] };

  // Mass Production III is the one printed military card that can use an army
  // twice: after that army loses an attack and returns to the card, exactly one
  // defeated army may be chosen for a second move/attack. Keeping the choice on
  // activeCard lets either defeated army be selected if both lost before the
  // player takes the optional redeployment; no unit-local flag can accidentally
  // survive the card reset into a later turn.
  function hasMassProductionRedeploy(player) {
    const tier = getCardTier(player, "military");
    const def = (CARD_DEFS.military || {})[tier] || {};
    return getCardName(player, "military") === "Mass Production" &&
      Number(def.redeployDefeated || 0) === 1;
  }

  function normalizeFocusTradePayment(payment) {
    if (payment && typeof payment === "object") {
      return {
        ok: payment.ok !== false,
        spent: Number(payment.spent || 0),
        focusSpent: Number(payment.focusSpent === undefined ? payment.spent || 0 : payment.focusSpent),
        resources: { ...(payment.resources || {}) },
        resourceCount: Number(payment.resourceCount || 0)
      };
    }
    const spent = Number(payment || 0);
    return { ok: true, spent, focusSpent: spent, resources: {}, resourceCount: 0 };
  }

  function activeMovementCard(st, player, cardType, tradePayment) {
    const same = st.activeCard && st.activeCard.playerId === player.id &&
      st.activeCard.cardType === cardType ? st.activeCard : {};
    const normalizedPayment = normalizeFocusTradePayment(
      tradePayment === undefined && same.tradePayment ? same.tradePayment : tradePayment);
    st.activeCard = {
      ...same,
      playerId: player.id,
      cardType,
      tradeSpent: normalizedPayment.spent,
      tradePayment: normalizedPayment
    };
    return st.activeCard;
  }

  function isMassProductionRedeploy(st, player, unit) {
    const active = st && st.activeCard;
    return !!(active && player && unit && hasMassProductionRedeploy(player) &&
      active.playerId === player.id && active.cardType === "military" &&
      !active.redeployDefeatedUsed &&
      (active.defeatedArmyIds || []).includes(unit.id));
  }

  function canMoveUnitOnActiveCard(st, player, unit, cardType) {
    if (!unit) return false;
    if (!unit.movedThisCard) return true;
    return cardType === "military" && isMassProductionRedeploy(st, player, unit);
  }

  function consumeMassProductionRedeploy(st, player, unit) {
    if (!isMassProductionRedeploy(st, player, unit)) return false;
    const active = st.activeCard;
    active.redeployDefeatedUsed = true;
    active.redeployedArmyId = unit.id;
    // Every defeated army was temporarily offered in the picker. Choosing one
    // closes the shared, one-army allowance while leaving genuinely un-moved
    // armies available for their ordinary move.
    const defeated = new Set(active.defeatedArmyIds || []);
    (player.armies || []).forEach((army) => {
      if (defeated.has(army.id)) army.movedThisCard = true;
    });
    return true;
  }

  function offerMassProductionRedeploy(st, player, unit) {
    if (!hasMassProductionRedeploy(player)) return false;
    const active = st.activeCard;
    if (!active || active.redeployDefeatedUsed) return false;
    active.defeatedArmyIds = active.defeatedArmyIds || [];
    if (!active.defeatedArmyIds.includes(unit.id)) active.defeatedArmyIds.push(unit.id);
    // The existing movement picker treats false as "still available". All
    // defeated candidates remain selectable until one of them consumes the
    // single printed allowance.
    unit.movedThisCard = false;
    return true;
  }

  function unitsLeftToMove(player, cardType) {
    const list = cardType === "economy" ? player.caravans : player.armies;
    return (list || []).filter((u) => !u.movedThisCard).length;
  }

  function resetFigureMove(unit) {
    if (!unit) return;
    unit.exploredThisMove = false;
    unit.exploredThisCard = false; // retained for older save readers
    unit.moveInProgress = false;
  }

  function resetFigureForCard(unit) {
    if (!unit) return;
    unit.movedThisCard = false;
    resetFigureMove(unit);
  }

  function completeFigureMove(unit) {
    if (!unit) return;
    unit.movedThisCard = true;
    resetFigureMove(unit);
  }

  function finishActiveCard(st) {
    const active = st.activeCard;
    if (!active) return;
    const player = getPlayer(st, active.playerId);
    st.activeCard = null;
    if (!player) return;
    (player.caravans || []).forEach(resetFigureForCard);
    (player.armies || []).forEach(resetFigureForCard);
    resolveCard(st, player, active.cardType,
      active.tradePayment || active.tradeSpent);
  }

  function endUnitMovement(st, payload) {
    const continuation = st.movementContinuation;
    if (!continuation || continuation.playerId !== payload.playerId ||
        continuation.unitId !== payload.unitId) return st;
    const player = getPlayer(st, continuation.playerId);
    if (!player) return st;
    const list = continuation.unitType === "army" ? player.armies : player.caravans;
    const unit = (list || []).find((entry) => entry.id === continuation.unitId);
    if (!unit || unit.position !== continuation.fromKey) return st;
    // Stopping is not a way to coexist with an enemy. If exploration somehow
    // ended on a contested space, that space must be resolved by the matching
    // military attack action.
    if (continuation.unitType === "army" &&
        findDefender(st, continuation.fromKey, player.id)) return st;

    const redeploying = continuation.unitType === "army" &&
      isMassProductionRedeploy(st, player, unit);
    completeFigureMove(unit);
    st.movementContinuation = null;
    activeMovementCard(st, player, continuation.cardType,
      continuation.tradePayment || continuation.tradeSpent);
    if (redeploying) consumeMassProductionRedeploy(st, player, unit);
    log(st, `${player.name} ended ${continuation.unitType} movement.`);
    if (!unitsLeftToMove(player, continuation.cardType)) finishActiveCard(st);
    return st;
  }

  // Whether this player may resolve a card of this type right now. Normally
  // that is "you have not played one yet"; the Venetian Arsenal's replay is a
  // second go at one specific card and nothing else.
  function canResolveCard(player, cardType) {
    if (!player) return false;
    if (player.capitalismReplay) return player.capitalismReplay === cardType;
    if (player.arsenalReplay) return player.arsenalReplay === cardType;
    return !player.cardPlayed;
  }

  function finishFocusSequence(st, completion, tradePayment) {
    if (!completion) return false;
    const player = getPlayer(st, completion.playerId);
    if (!player || !canResolveCard(player, completion.cardType)) return false;
    if (st.cardResolution && completion.resolutionId &&
        st.cardResolution.id !== completion.resolutionId) return false;
    if (completion.resolutionId) st.cardResolution = null;
    resolveCard(st, player, completion.cardType,
      tradePayment === undefined
        ? (completion.tradePayment || Number(completion.tradeSpent || 0))
        : tradePayment);
    return true;
  }

  function beginCultureResolution(st, player, tradePayment, cardName, step) {
    const resolution = {
      id: makeChoiceId("culture-resolution"),
      kind: "focus_sequence",
      playerId: player.id,
      cardType: "culture",
      cardName,
      tradeSpent: Number(tradePayment && tradePayment.spent || tradePayment || 0),
      tradePayment: tradePayment && typeof tradePayment === "object"
        ? cloneSerializable(tradePayment) : null,
      step
    };
    st.cardResolution = resolution;
    return resolution;
  }

  function validControlAdjacentFriendlyHexes(st, playerId, maxTerrain) {
    const player = getPlayer(st, playerId);
    return Object.entries(st.map.hexes).filter(([hexKey, hex]) => {
      if (!hex || !hex.active || hex.terrain === "water" ||
          placementDifficulty(st, hex, player, "culture") > maxTerrain) return false;
      if (hex.city || hex.cityState || hex.barbarian || hex.control ||
          (hex.fortress && !hex.city)) return false;
      return hexNeighborKeys(hex.q, hex.r).some((neighborKey) => {
        const neighbor = st.map.hexes[neighborKey];
        return isFriendlySpace(neighbor, playerId) ||
          antananarivoIsFriendlyCity(st, neighbor, playerId);
      });
    }).map(([hexKey]) => hexKey);
  }

  function massMediaTargets(st, playerId) {
    const friendly = Object.values(st.map.hexes).filter((hex) =>
      isFriendlySpace(hex, playerId) || antananarivoIsFriendlyCity(st, hex, playerId));
    return Object.entries(st.map.hexes).filter(([hexKey, hex]) => {
      if (!hex || !hex.control || hex.control.ownerId === playerId || armyGuards(st, hexKey)) return false;
      // A reinforced token would only be flipped, which no pact forbids; an
      // unreinforced one would be replaced, which is destroying their piece.
      const interference = hex.control.fortified ? "unreinforce" : "replace";
      if (pactForbids(st, playerId, hex.control.ownerId, interference)) return false;
      return friendly.some((source) => hexDist(source, hex) <= 2);
    }).map(([hexKey]) => hexKey);
  }

  function stateWorkforceMountainTargets(st, playerId) {
    return Object.entries(st.map.hexes).filter(([, hex]) => {
      if (!hex || !hex.active || hex.terrain !== "mountain" || hex.city ||
          hex.cityState || hex.barbarian || hex.control || (hex.fortress && !hex.city)) return false;
      return hexNeighborKeys(hex.q, hex.r).some((neighborKey) =>
        isFriendlySpace(st.map.hexes[neighborKey], playerId, st));
    }).map(([hexKey]) => hexKey);
  }

  function radioCityTargets(st, playerId) {
    const friendlyCities = Object.values(st.map.hexes).filter((hex) =>
      isFriendlyCity(st, hex, playerId));
    return Object.entries(st.map.hexes).filter(([hexKey, hex]) => {
      if (!hex || !hex.city || hex.city.ownerId === playerId || hex.city.isCapital ||
          !canAffectRivalPiece(st, playerId, hex.city.ownerId) ||
          armyGuards(st, hexKey)) return false;
      return friendlyCities.some((city) => hexDist(city, hex) <= 4);
    }).map(([hexKey]) => hexKey);
  }

  function queueUniqueCultureFollowUp(st, player, tradePayment) {
    const unique = getActiveUniqueCard(player, "culture");
    if (!unique) return false;
    const slot = getSlotValue(player, "culture", st);

    if (unique.name === "State Workforce" && slot === 5) {
      const spots = stateWorkforceMountainTargets(st, player.id);
      if (!spots.length) return false;
      const resolution = beginCultureResolution(st, player, tradePayment,
        unique.name, "state_workforce_mountain");
      queuePendingChoice(st, {
        kind: "place_control",
        playerId: player.id,
        title: "State Workforce: Place a Control Token on a Mountain",
        source: unique.name,
        hexKeys: spots,
        cardResolutionId: resolution.id
      });
      return true;
    }

    if (unique.name === "Radio" && slot === 5) {
      const spots = radioCityTargets(st, player.id);
      if (!spots.length) return false;
      const resolution = beginCultureResolution(st, player, tradePayment,
        unique.name, "radio_city");
      queuePendingChoice(st, {
        kind: "seize_city",
        playerId: player.id,
        title: "Radio: Replace a Rival Non-Capital City",
        source: unique.name,
        hexKeys: spots,
        cardResolutionId: resolution.id
      });
      return true;
    }

    return false;
  }

  function queueCultureFollowUp(st, player, tradePayment) {
    // Civilization-specific replacements have their own printed paragraphs;
    // they must never inherit the standard card at the same tier.
    if (getActiveUniqueCard(player, "culture")) {
      return queueUniqueCultureFollowUp(st, player, tradePayment);
    }
    const tier = getCardTier(player, "culture");

    if (tier === 2) {
      const sources = dramaMoveSources(st, player.id);
      if (!sources.length) return false;
      const resolution = beginCultureResolution(st, player, tradePayment,
        "Drama and Poetry", "drama_move_source");
      queuePendingChoice(st, {
        kind: "move_control_source",
        playerId: player.id,
        title: "Drama and Poetry: Move a Control Token?",
        source: "Drama and Poetry",
        optional: true,
        hexKeys: sources,
        cardResolutionId: resolution.id
      });
      return true;
    }

    if (tier === 3) {
      const spots = validControlAdjacentFriendlyHexes(st, player.id,
        getSlotValue(player, "culture", st));
      if (!spots.length) return false;
      const resolution = beginCultureResolution(st, player, tradePayment,
        "Civil Service", "civil_service_control");
      queuePendingChoice(st, {
        kind: "place_control",
        playerId: player.id,
        title: "Civil Service: Place a Control Token by a Friendly Space",
        source: "Civil Service",
        hexKeys: spots,
        cardResolutionId: resolution.id
      });
      return true;
    }

    if (tier === 4) {
      const targets = massMediaTargets(st, player.id);
      if (!targets.length) return false;
      const resolution = beginCultureResolution(st, player, tradePayment,
        "Mass Media", "mass_media_target");
      queuePendingChoice(st, {
        kind: "mass_media_target",
        playerId: player.id,
        title: "Mass Media: Weaken or Replace a Rival Control Token",
        source: "Mass Media",
        hexKeys: targets,
        cardResolutionId: resolution.id
      });
      return true;
    }

    return false;
  }

  function queueDramaControlMove(st, player, tradePayment) {
    // Retained as an internal compatibility alias for old integrations.
    if (getCardTier(player, "culture") !== 2 || getActiveUniqueCard(player, "culture")) return false;
    const sources = dramaMoveSources(st, player.id);
    if (!sources.length) return false;
    const resolution = beginCultureResolution(st, player, tradePayment,
      "Drama and Poetry", "drama_move_source");
    queuePendingChoice(st, {
      kind: "move_control_source",
      playerId: player.id,
      title: "Drama and Poetry: Move a Control Token?",
      source: "Drama and Poetry",
      optional: true,
      hexKeys: sources,
      cardResolutionId: resolution.id
    });
    return true;
  }

  function beginScienceResolution(st, player, tradePayment, advanceAmount, cardName, step) {
    const resolution = {
      id: makeChoiceId("science-resolution"),
      kind: "focus_sequence",
      playerId: player.id,
      cardType: "science",
      cardName,
      tradeSpent: Number(tradePayment && tradePayment.spent || 0),
      tradePayment: cloneSerializable(tradePayment),
      advanceAmount: Number(advanceAmount || 0),
      step
    };
    st.cardResolution = resolution;
    return resolution;
  }

  function queueSciencePrelude(st, player, tradePayment, advanceAmount) {
    // Unique science cards replace, rather than supplement, the standard card
    // at their tier. Their own handlers decide whether they need a sequence.
    const unique = getActiveUniqueCard(player, "science");
    if (unique && unique.name === "Astronomy") {
      const resolution = beginScienceResolution(st, player, tradePayment,
        advanceAmount, "Astronomy", "astronomy_tiles");
      const visible = (st.tileStack || []).slice(-2);
      if (!visible.length) {
        finishScienceResolution(st, resolution);
        return true;
      }
      const options = [];
      const capitalKey = findCapital(st, player.id);
      const capital = capitalKey && st.map.hexes[capitalKey];
      const edgeSpaces = capital ? Object.entries(st.map.hexes)
        .filter(([, hex]) => hex && hex.active && hex.tileId === capital.tileId && isEdgeSpace(st, hex))
        .map(([hexKey]) => hexKey) : [];
      if (edgeSpaces.length) {
        visible.forEach((tileId) => {
          const remaining = visible.filter((id) => id !== tileId);
          if (!remaining.length) {
            options.push({ id: `place|${tileId}|bottom`, label: `Place tile ${tileId}` });
          } else {
            options.push({ id: `place|${tileId}|top`, label: `Place tile ${tileId}; return the other to the top` });
            options.push({ id: `place|${tileId}|bottom`, label: `Place tile ${tileId}; return the other to the bottom` });
          }
        });
      }
      ["top", "bottom"].forEach((where) => {
        options.push({ id: `none|${where}|forward`,
          label: `Place neither; return ${visible.join(" then ")} to the ${where}` });
        if (visible.length > 1) options.push({ id: `none|${where}|reverse`,
          label: `Place neither; return ${visible.slice().reverse().join(" then ")} to the ${where}` });
      });
      queuePendingChoice(st, {
        kind: "astronomy_tiles",
        playerId: player.id,
        title: "Astronomy: Inspect the Bottom Map Tiles",
        source: "Astronomy",
        tileIds: visible,
        edgeSpaces,
        options,
        cardResolutionId: resolution.id
      });
      return true;
    }
    if (unique) return false;
    const tier = getCardTier(player, "science");
    if (tier === 2) {
      const resolution = beginScienceResolution(st, player, tradePayment,
        advanceAmount, "Mathematics", "mathematics_trade");
      queuePendingChoice(st, {
        kind: "trade_any",
        playerId: player.id,
        amount: 1,
        title: "Mathematics: Place 1 Trade Token",
        source: "Mathematics",
        options: FOCUS_TYPES.map((cardType) => ({
          id: cardType, label: FOCUS_LABELS[cardType]
        })),
        cardResolutionId: resolution.id
      });
      return true;
    }
    if (tier === 3) {
      const options = RESOURCES.filter((resource) =>
        Number(player.resources[resource] || 0) === 0);
      if (!options.length) return false;
      const resolution = beginScienceResolution(st, player, tradePayment,
        advanceAmount, "Replaceable Parts", "replaceable_parts_resource");
      queuePendingChoice(st, {
        kind: "gain_resource",
        playerId: player.id,
        title: "Replaceable Parts: Gain a Resource Type You Do Not Have",
        source: "Replaceable Parts",
        options: options.map((resource) => ({ id: resource, label: resource })),
        cardResolutionId: resolution.id
      });
      return true;
    }
    if (tier === 4 && getSlotValue(player, "science", st) === 5) {
      const spaces = Object.entries(st.map.hexes)
        .filter(([, hex]) => hex && hex.active)
        .map(([hexKey]) => hexKey);
      if (!spaces.length) return false;
      const resolution = beginScienceResolution(st, player, tradePayment,
        advanceAmount, "Nuclear Power", "nuclear_power_target");
      queuePendingChoice(st, {
        kind: "nuclear_power_target",
        playerId: player.id,
        title: "Nuclear Power: Choose the Centre Space",
        source: "Nuclear Power",
        hexKeys: spaces,
        cardResolutionId: resolution.id
      });
      return true;
    }
    return false;
  }

  function finishScienceResolution(st, resolution) {
    if (!resolution || resolution.cardType !== "science") return false;
    const player = getPlayer(st, resolution.playerId);
    if (!player || !canResolveCard(player, "science")) return false;
    const payment = resolution.tradePayment || resolution.tradeSpent || 0;
    st.cardResolution = null;
    advanceTech(st, player, Number(resolution.advanceAmount || 0));
    resolveCard(st, player, "science", payment);
    return true;
  }

  function beginGrowthReinforcementStep(st, resolution, base) {
    resolution.step = "growth_reinforce";
    resolution.reinforceBase = Math.max(0, Number(base || 0));
    // If there is physically nothing to turn over, the instruction resolves
    // for no effect. No preselected trade is charged: Growth trade tokens pay
    // for actual additional reinforcements, one token per marker.
    if (resolution.reinforceBase + resolution.tradeBudget <= 0 ||
        validReinforceHexes(st, resolution.playerId).size === 0) {
      finishFocusSequence(st, {
        playerId: resolution.playerId, cardType: "growth", resolutionId: resolution.id
      }, 0);
    }
  }

  function mysticismControlDestinations(st, playerId, districtKey, fromKey) {
    const district = districtKey && st.map.hexes[districtKey];
    const from = fromKey && st.map.hexes[fromKey];
    if (!district || !from || !from.control || from.control.ownerId !== playerId ||
        from.control.district || hexDist(district, from) > 1) return [];
    return hexNeighborKeys(district.q, district.r).filter((hexKey) => {
      if (hexKey === fromKey) return false;
      const hex = st.map.hexes[hexKey];
      return hex && hex.active && hex.terrain !== "water" && !hex.city &&
        !hex.cityState && !hex.barbarian && !hex.control && !(hex.fortress && !hex.city);
    });
  }

  function mysticismControlSources(st, playerId, districtKey) {
    const district = districtKey && st.map.hexes[districtKey];
    if (!district) return [];
    return Object.entries(st.map.hexes).filter(([hexKey, hex]) =>
      hexKey !== districtKey && hex && hex.control &&
      hex.control.ownerId === playerId && !hex.control.district &&
      hexDist(district, hex) <= 1 &&
      mysticismControlDestinations(st, playerId, districtKey, hexKey).length
    ).map(([hexKey]) => hexKey);
  }

  function mysticismDistrictDestinations(st, districtKey) {
    const district = districtKey && st.map.hexes[districtKey];
    if (!district || !district.control || !district.control.district) return [];
    return hexNeighborKeys(district.q, district.r).filter((hexKey) => {
      const hex = st.map.hexes[hexKey];
      return hex && hex.active && hex.terrain !== "water" && !hex.city &&
        !hex.cityState && !hex.barbarian && !hex.control &&
        !(hex.fortress && !hex.city);
    });
  }

  function reinforceNearFriendlyArmies(st, player) {
    const armySpaces = new Set((player.armies || [])
      .map((army) => army.position).filter(Boolean));
    let reinforced = 0;
    Object.entries(st.map.hexes).forEach(([hexKey, hex]) => {
      if (!hex || !hex.control || hex.control.ownerId !== player.id ||
          hex.control.fortified) return;
      const nearArmy = armySpaces.has(hexKey) || hexNeighborKeys(hex.q, hex.r)
        .some((neighborKey) => armySpaces.has(neighborKey));
      if (!nearArmy) return;
      hex.control.fortified = true;
      reinforced++;
    });
    log(st, `${player.name} reinforced ${reinforced} control token${reinforced === 1 ? "" : "s"} near friendly armies (Military Engineering).`);
    return reinforced;
  }

  function startGrowthDistrictSequence(st, player, profile, slot, tradePayment, districtKey, context) {
    const normalizedPayment = tradePayment && typeof tradePayment === "object"
      ? cloneSerializable(tradePayment)
      : { spent: Number(tradePayment || 0), focusSpent: Number(tradePayment || 0), resources: {} };
    const resolution = {
      id: makeChoiceId("growth-resolution"),
      kind: "focus_sequence",
      playerId: player.id,
      cardType: "growth",
      cardName: profile.name,
      tier: profile.tier,
      standard: profile.standard,
      resolvedSlot: slot,
      tradeBudget: normalizedPayment.spent,
      tradePayment: normalizedPayment,
      districtKey: districtKey || null,
      mysticismControl: context && context.mysticismControl
        ? cloneSerializable(context.mysticismControl) : null,
      step: "starting"
    };
    st.cardResolution = resolution;

    if (profile.mysticism) {
      const destinations = resolution.mysticismControl
        ? mysticismDistrictDestinations(st, districtKey) : [];
      if (destinations.length) {
        resolution.step = "mysticism_control_destination";
        queuePendingChoice(st, {
          kind: "mysticism_control_destination",
          playerId: player.id,
          title: "Mysticism: Relocate the Replaced Control Token?",
          source: "Mysticism",
          optional: true,
          carriedControl: cloneSerializable(resolution.mysticismControl),
          hexKeys: destinations,
          cardResolutionId: resolution.id
        });
        return;
      }
    }

    if (profile.militaryEngineering) {
      const cities = Object.entries(st.map.hexes)
        .filter(([, hex]) => hex && hex.city && hex.city.ownerId === player.id)
        .map(([hexKey]) => hexKey);
      const armies = (player.armies || []).filter((army) => !army.position);
      if (cities.length && armies.length) {
        resolution.step = "military_engineering_armies";
        armies.forEach((army) => queuePendingChoice(st, {
          kind: "military_engineering_army",
          playerId: player.id,
          title: `Military Engineering: Deploy ${army.id}?`,
          source: "Military Engineering",
          optional: true,
          unitId: army.id,
          hexKeys: cities,
          cardResolutionId: resolution.id
        }));
        return;
      }
      reinforceNearFriendlyArmies(st, player);
    }

    if (profile.globalization) {
      resolution.step = "globalization_district_type";
      queuePendingChoice(st, {
        kind: "growth_globalization_type",
        playerId: player.id,
        title: "Globalization: Choose a District Type",
        source: "Globalization",
        cardResolutionId: resolution.id,
        options: DISTRICT_KINDS.map((kind) => ({ id: kind, label: DISTRICT_NAMES[kind] }))
      });
      return;
    }

    if (profile.engineering) {
      const spots = validControlNearDistrictHexes(st, player.id, slot);
      if (spots.length) {
        resolution.step = "engineering_control";
        queuePendingChoice(st, {
          kind: "place_control",
          playerId: player.id,
          title: "Engineering: Place a Control Token by a District",
          source: "Engineering",
          cardResolutionId: resolution.id,
          hexKeys: spots
        });
        return;
      }
    }

    // Sanitation's printed reinforcement is part of the main effect. For the
    // district branch of tiers I/II, only trade tokens add reinforcements.
    beginGrowthReinforcementStep(st, resolution,
      profile.standard && profile.tier >= 3 ? slot : 0);
  }

  function advanceCardResolution(st, resolutionId) {
    const resolution = st.cardResolution;
    if (!resolution || resolution.id !== resolutionId) return;
    if ((st.pendingChoices || []).some((choice) =>
      choice.cardResolutionId === resolutionId)) return;
    if (st.pendingBarbReward && st.pendingBarbReward.cardResolutionId === resolutionId) return;

    if (resolution.step === "engineering_control" ||
        resolution.step === "globalization_district_type" ||
        resolution.step === "globalization_district_effects") {
      beginGrowthReinforcementStep(st, resolution,
        resolution.standard && resolution.tier >= 3
          ? resolution.resolvedSlot : 0);
      return;
    }
    if (resolution.step === "mysticism_control_source" ||
        resolution.step === "mysticism_control_destination") {
      beginGrowthReinforcementStep(st, resolution, 0);
      return;
    }
    if (resolution.step === "military_engineering_armies") {
      const owner = getPlayer(st, resolution.playerId);
      if (owner) reinforceNearFriendlyArmies(st, owner);
      beginGrowthReinforcementStep(st, resolution, 0);
      return;
    }
    if (resolution.cardType === "culture" && [
      "drama_move_source", "drama_move_destination",
      "civil_service_control", "mass_media_target",
      "state_workforce_mountain", "radio_city"
    ].includes(resolution.step)) {
      finishFocusSequence(st, {
        playerId: resolution.playerId,
        cardType: "culture",
        resolutionId: resolution.id,
        tradeSpent: resolution.tradeSpent,
        tradePayment: resolution.tradePayment
      });
      return;
    }
    if (resolution.cardType === "science" && [
      "mathematics_trade", "replaceable_parts_resource", "nuclear_power_target"
    ].includes(resolution.step)) {
      finishScienceResolution(st, resolution);
    }
  }

  function resolveCard(st, player, cardType, tradePayment) {
    const capitalismReplay = player.capitalismReplay === cardType &&
      !!player.capitalismNoReset;
    const idx = player.focusRow.indexOf(cardType);
    // Terra p13: "For any ability that depends on a focus card being resolved
    // in a specific slot, the card is treated as though it is in the
    // farther-right slot." So a card shifted into the 5 slot counts as a 5.
    const resolvedSlot = getSlotValue(player, cardType, st);
    const wasReplay = player.arsenalReplay === cardType;
    if (idx >= 0 && !capitalismReplay) {
      player.focusRow.splice(idx, 1);
      player.focusRow.unshift(cardType);
    }
    spendFocusTradePayment(player, cardType, tradePayment, st);
    player.cardPlayed = true;
    player.arsenalReplay = null;
    player.capitalismReplay = null;
    player.capitalismNoReset = false;

    // Venetian Arsenal: a card resolved from the fifth slot may be resolved
    // again. It has just been reset to the front of the row, so the second go
    // is a slot-1 card without any further arithmetic.
    if (!wasReplay && resolvedSlot === 5 && !player.arsenalUsed &&
        hasWonder(st, player.id, "Venetian Arsenal")) {
      queuePendingChoice(st, {
        kind: "arsenal_replay", playerId: player.id, cardType,
        title: `Venetian Arsenal: Resolve ${FOCUS_LABELS[cardType]} Again?`,
        source: "Venetian Arsenal", optional: true,
        options: [{ id: "yes", label: `Resolve ${FOCUS_LABELS[cardType]} again (slot 1)` }]
      });
    }

    // Steam Power (economy III) and Capitalism (economy IV) fire when the
    // ECONOMY CARD IS RESOLVED, so they belong here, where cardType is in
    // scope. They had been pasted into queueStartOfTurnCityStates, which
    // takes only (st, player) - so every start of turn threw
    // "ReferenceError: cardType is not defined" and took the rest of the
    // turn down with it. Their resolvers were already in place; only the
    // queuing was in the wrong function.
    const standardEconomy = !getActiveUniqueCard(player, "economy");
    const economyTier = getCardTier(player, "economy");
    if (cardType === "economy" && standardEconomy && economyTier === 3) {
      const held = RESOURCES.filter((resource) => Number(player.resources[resource] || 0) > 0);
      if (held.length) {
        queuePendingChoice(st, {
          kind: "resource_exchange_source",
          playerId: player.id,
          title: "Steam Power: Exchange a Resource?",
          source: "Steam Power",
          optional: true,
          options: held.map((resource) => ({ id: resource, label: resource }))
        });
      }
    }
    if (cardType === "economy" && standardEconomy && economyTier === 4 &&
        !player.capitalismUsed) {
      const options = FOCUS_TYPES.filter((type) => type !== "economy" &&
        player.focusRow.includes(type));
      if (options.length) {
        queuePendingChoice(st, {
          kind: "capitalism_card",
          playerId: player.id,
          title: "Capitalism: Resolve Another Card as Slot 1",
          source: "Capitalism",
          options: options.map((type) => ({ id: type, label: FOCUS_LABELS[type] }))
        });
      }
    }

    // Estadio Do Maracana: the economy card may be resolved and reset before a
    // non-economy card, so this one does not cost you your turn's card.
    if (!wasReplay && cardType === "economy" && !player.estadioUsed &&
        hasWonder(st, player.id, "Estadio Do Maracana")) {
      queuePendingChoice(st, {
        kind: "estadio_free", playerId: player.id,
        title: "Estadio Do Maracana: Keep Your Card?",
        source: "Estadio Do Maracana", optional: true,
        options: [{ id: "yes", label: "Take this economy card for free" }]
      });
    }

    // Aztec: resetting the military card after a winning attack lets you
    // rearrange your row — swap any 2 cards.
    if (cardType === "military" && hasLeader(player, "aztec") && player.wonAttackThisTurn) {
      const pairs = [];
      for (let a = 0; a < FOCUS_TYPES.length; a++) {
        for (let b = a + 1; b < FOCUS_TYPES.length; b++) {
          pairs.push({ id: `${FOCUS_TYPES[a]}|${FOCUS_TYPES[b]}`, label: `${FOCUS_LABELS[FOCUS_TYPES[a]]} ↔ ${FOCUS_LABELS[FOCUS_TYPES[b]]}` });
        }
      }
      queuePendingChoice(st, {
        kind: "swap_cards", playerId: player.id,
        title: "Aztec: Swap 2 Focus Cards", options: pairs
      });
    }

    // Nubia: "After you reset your growth focus card, resolve the effect of any
    // 1 of your districts." That is the real district effect, chosen by her —
    // it used to hand over +1 trade of your choice instead, which is a
    // different and usually much weaker thing (a campus beside three of your
    // own mountains is worth 3 science, an encampment kills a barbarian).
    //
    // Restricted to her own districts by construction: districtHexesFor keys on
    // control.ownerId, and Terra p10 destroys a district rather than
    // transferring it, so a district she holds is one she placed.
    if (cardType === "growth" && hasLeader(player, "nubia")) {
      beginDistrictResolution(st, player, {
        limit: 1,
        title: "Nubia: Resolve 1 of Your Districts",
        source: "Nubia"
      });
    }

    // France's Humanism (unique Culture III): +1 trade token per mature city.
    if (cardType === "culture" && uniqueInPlay(player, "france")) {
      const mature = countDeveloped(st, player.id);
      for (let i = 0; i < mature; i++) {
        queuePendingChoice(st, {
          kind: "trade_any", playerId: player.id, amount: 1,
          title: "Humanism: Place a Trade Token",
          options: tradeTargets(st, player)
        });
      }
    }
  }

  // Spaces on the physical 0-24 dial that carry a technology-level tab.
  // The printed face has II at 3/6, III at 10/14, and IV at 19/24. Reaching or
  // passing each tab is a separate opportunity to gain that exact-level card.
  const TECH_LEVEL_SPACES = { 3: 2, 6: 2, 10: 3, 14: 3, 19: 4, 24: 4 };

  function scienceUpgradeOptions(player, level) {
    const opts = [];
    FOCUS_TYPES.filter((f) => (player.cardTiers[f] || 1) < level).forEach((f) => {
      opts.push({ id: f, label: `${FOCUS_LABELS[f]} \u2192 tier ${level}` });
      const uniq = uniqueUpgradeOption(player, f, level);
      if (uniq) opts.push(uniq);
    });
    return opts;
  }

  function refreshScienceUpgradeChoices(st, player) {
    (st.pendingChoices || []).forEach((choice) => {
      if (choice.kind === "science_upgrade" && choice.playerId === player.id && choice.techLevel) {
        choice.options = scienceUpgradeOptions(player, choice.techLevel);
      }
    });
  }

  function advanceTech(st, player, amount) {
    if (!(amount > 0)) return;
    const before = player.tech;
    let after = before + amount;

    // Crossing more than one level space in a single turn grants both (Terra p15).
    const reached = [];
    Object.entries(TECH_LEVEL_SPACES).forEach(([space, level]) => {
      const n = Number(space);
      if (n > before && n <= after) reached.push(level);
    });

    if (after > CFG.techWheelSize) {
      // The arrow does not wrap by the overshoot — it goes directly to 15, so
      // the 15-24 stretch can be run again for further level IV cards.
      after = CFG.techResetAt;
    }
    player.tech = after;

    reached.sort((a, b) => a - b).forEach((level) => {
      player.techTier = Math.max(player.techTier || 1, level);
      const opts = scienceUpgradeOptions(player, level);
      if (!opts.length) {
        log(st, `${player.name} reached technology level ${level} with nothing left to upgrade.`);
        return;
      }
      queuePendingChoice(st, {
        kind: "science_upgrade",
        playerId: player.id,
        techLevel: level,
        title: `Technology Level ${level}: Take a Card`,
        // Base p8: "the player MAY gain a new focus card." Sometimes you would
        // rather keep the card you are running than trade up.
        optional: true,
        options: opts
      });
      log(st, `${player.name} reached technology level ${level}!`);
    });

    log(st, `${player.name} advanced tech by ${amount}. (${player.tech}/${CFG.techWheelSize})`);
  }

  function spendResources(player, resources) {
    if (!resources) return;
    Object.entries(resources).forEach(([r, count]) => {
      player.resources[r] = Math.max(0, player.resources[r] - count);
    });
  }

  function makeChoiceId(kind) {
    return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // Every pending choice blocks the table until its seat answers it, and the
  // client can only answer one that offers something to pick: the wizard
  // renders `options` as buttons and `hexKeys` as board targets. A choice
  // carrying neither is unanswerable, so queuing it would stop the match with
  // no legal exit — the same shape of soft-lock as an unfinishable focus card.
  // Callers are expected to check first and log why (queueTradeGrant and
  // queueCapitalLootTake both do); this refuses the rest rather than hanging.
  function choiceIsAnswerable(choice) {
    if (!choice) return false;
    if (Array.isArray(choice.options) && choice.options.length) return true;
    if (Array.isArray(choice.hexKeys) && choice.hexKeys.length) return true;
    return false;
  }

  function queuePendingChoice(st, choice) {
    st.pendingChoices = st.pendingChoices || [];
    if (!choiceIsAnswerable(choice)) {
      log(st, `An effect (${(choice && (choice.source || choice.kind)) || "unknown"}) offered no legal choice and was skipped.`);
      return null;
    }
    const queued = {
      id: choice.id || makeChoiceId(choice.kind || "choice"),
      round: st.turn ? st.turn.round : 0,
      ...choice
    };
    st.pendingChoices.push(queued);
    const player = getPlayer(st, queued.playerId);
    log(st, `${player ? player.name : "Player"} has a pending choice: ${queued.title || queued.kind}.`);
    return queued.id;
  }

  function resolvePendingChoice(st, payload) {
    st.pendingChoices = st.pendingChoices || [];
    const idx = st.pendingChoices.findIndex((c) => c.id === payload.choiceId);
    if (idx < 0) return st;
    const choice = st.pendingChoices[idx];
    if (choice.playerId && payload.playerId && choice.playerId !== payload.playerId && !payload.hostOverride) return st;
    const player = getPlayer(st, choice.playerId);
    if (!player) return st;

    let resolved = false;
    if (choice.kind === "science_upgrade") {
      // "unique_<type>" is the same upgrade, except the card you end up with is
      // your civ's own — you can only take it on the level it is printed at.
      const takeUnique = typeof payload.optionId === "string" && payload.optionId.startsWith("unique_");
      const cardType = takeUnique ? payload.optionId.slice("unique_".length) : payload.optionId;
      const curTier = player.cardTiers[cardType] || 1;
      const targetTier = choice.techLevel
        ? Math.max(curTier, Math.min(4, choice.techLevel))
        : curTier + 1;
      const uniqueOk = !takeUnique || !!uniqueUpgradeOption(player, cardType,
        targetTier);
      if (FOCUS_TYPES.includes(cardType) && curTier < 4 && targetTier > curTier && uniqueOk &&
          (!choice.onlyTier || curTier === choice.onlyTier)) {
        // A tech level hands you a card of exactly that level, not the next one
        // up (p8). Wonder-driven upgrades carry no level, so they step by one.
        player.cardTiers[cardType] = choice.techLevel
          ? Math.max(curTier, Math.min(4, choice.techLevel))
          : curTier + 1;
        player.cardLevels[cardType] = player.cardTiers[cardType];
        if (takeUnique) player.uniqueTaken = true;
        player.upgradedThisTurn = true;   // University of Sankore looks at this
        if (cardType === "military" || cardType === "economy") syncUnitCounts(st, player);
        // Crossing more than one printed tab creates more than one prompt. Once
        // a card is taken, later prompts must stop offering that same card at a
        // level it has already reached.
        refreshScienceUpgradeChoices(st, player);
        log(st, takeUnique
          ? `${player.name} took their unique card ${getCardName(player, cardType)} at tier ${player.cardTiers[cardType]}.`
          : `${player.name} upgraded ${FOCUS_LABELS[cardType]} to tier ${player.cardTiers[cardType]}.`);
        // Multi-card wonders queue their next prompt only now, so it lists the
        // tiers as they stand after this upgrade.
        if (choice.chain) queueCardUpgrade(st, player, choice.chain);
        resolved = true;
      }
    } else if (choice.kind === "astronomy_tiles") {
      const option = (choice.options || []).find((entry) => entry.id === payload.optionId);
      const resolution = st.cardResolution;
      const visible = (choice.tileIds || []).slice();
      const tail = (st.tileStack || []).slice(-visible.length);
      if (option && resolution && resolution.id === choice.cardResolutionId &&
          JSON.stringify(tail) === JSON.stringify(visible)) {
        const [mode, value, orderMode] = option.id.split("|");
        st.tileStack.splice(st.tileStack.length - visible.length, visible.length);
        const returnTiles = (tiles, where) => {
          if (where === "top") st.tileStack = tiles.concat(st.tileStack);
          else st.tileStack = st.tileStack.concat(tiles);
        };
        if (mode === "place" && visible.includes(value)) {
          const remaining = visible.filter((tileId) => tileId !== value);
          returnTiles(remaining, orderMode === "top" ? "top" : "bottom");
          resolution.astronomyTileId = value;
          resolution.step = "astronomy_edge";
          queuePendingChoice(st, {
            kind: "astronomy_edge",
            playerId: player.id,
            title: `Astronomy: Explore Tile ${value} From Your Capital Tile`,
            source: "Astronomy",
            tileId: value,
            hexKeys: (choice.edgeSpaces || []).slice(),
            cardResolutionId: resolution.id
          });
        } else if (mode === "none") {
          const ordered = orderMode === "reverse" ? visible.slice().reverse() : visible;
          returnTiles(ordered, value === "top" ? "top" : "bottom");
          finishScienceResolution(st, resolution);
        } else {
          return st;
        }
        st.tileDeck = st.tileStack.slice();
        resolved = true;
      }
    } else if (choice.kind === "astronomy_edge") {
      const hexKey = payload.hexKey;
      const resolution = st.cardResolution;
      if ((choice.hexKeys || []).includes(hexKey) && resolution &&
          resolution.id === choice.cardResolutionId &&
          resolution.astronomyTileId === choice.tileId) {
        resolution.step = "astronomy_exploration";
        st.freeExplore = {
          playerId: player.id,
          fromKey: hexKey,
          source: "Astronomy",
          followUp: "astronomy_finish",
          tileId: choice.tileId,
          scienceResolutionId: resolution.id
        };
        beginExploration(st, { playerId: player.id, fromKey: hexKey });
        resolved = !!(st.pendingExploration && st.pendingExploration.tileId === choice.tileId);
        if (!resolved) st.freeExplore = null;
      }
    } else if (choice.kind === "shipbuilding_water") {
      const pickedKey = payload.hexKey;
      const skip = !!payload.dismiss;
      const legalPick = !skip && (choice.hexKeys || []).includes(pickedKey) &&
        isShipbuildingWaterSpace(st, choice.fromKey, pickedKey);
      if ((skip || legalPick) && continueShipbuildingExploration(st, choice, legalPick ? pickedKey : null)) {
        resolved = !skip;
      }
    } else if (choice.kind === "growth_globalization_type") {
      const kind = payload.optionId;
      const resolution = st.cardResolution;
      if (DISTRICT_KINDS.includes(kind) && resolution &&
          resolution.id === choice.cardResolutionId && resolution.playerId === player.id) {
        resolution.step = "globalization_district_effects";
        const order = (st.turn.order || []).slice();
        const start = Math.max(0, order.indexOf(player.id));
        const clockwise = order.slice(start).concat(order.slice(0, start));
        clockwise.forEach((playerId) => {
          const owner = getPlayer(st, playerId);
          const districtKeys = owner ? districtHexesFor(st, owner.id)[kind] : [];
          if (owner && districtKeys.length) {
            resolveDistrictKind(st, owner, kind, districtKeys, {
              cardResolutionId: resolution.id
            });
          }
        });
        log(st, `${player.name} chose ${DISTRICT_NAMES[kind]} for Globalization.`);
        resolved = true;
      }
    } else if (choice.kind === "district_order") {
      // Terra p9: "Each player resolves the abilities on their districts in the
      // order of their choice." Asked one at a time rather than as a whole
      // running order, because resolving one can change what the next is worth
      // — an encampment clears a barbarian off a space a theater square can
      // then claim — and a player should be able to see that before choosing.
      const kind = payload.optionId;
      const hexes = districtHexesFor(st, player.id);
      // Answering an option that was offered always spends the prompt, even if
      // the district itself has gone in the meantime — an encampment strike
      // resolved earlier in the same run can destroy the space a later choice
      // was pointing at. Leaving it queued would strand the turn behind a
      // question with no answer left.
      if ((choice.options || []).some((o) => o.id === kind)) {
        resolved = true;
        if (DISTRICT_KINDS.includes(kind) && hexes[kind].length) {
          resolveDistrictKind(st, player, kind, hexes[kind]);
        } else {
          log(st, `${player.name}'s ${DISTRICT_NAMES[kind] || kind} is no longer on the board.`);
        }
        const left = Number(choice.remaining || 1) - 1;
        // Re-ask for whatever is still standing. Nubia's single-district
        // prompt sets remaining to 1, so it never comes back.
        const rest = DISTRICT_KINDS.filter((k) => k !== kind && hexes[k].length);
        if (left > 0 && rest.length) {
          queuePendingChoice(st, {
            kind: "district_order",
            playerId: player.id,
            title: choice.title,
            source: choice.source,
            remaining: Math.min(left, rest.length),
            options: rest.map((k) => ({
              id: k,
              label: DISTRICT_NAMES[k] + (hexes[k].length > 1 ? " (" + hexes[k].length + ")" : "")
            }))
          });
        }
      }
    } else if (choice.kind === "choose_government") {
      const pick = payload.optionId;
      if (pick === "keep") {
        resolved = true;
      } else if (GOVERNMENTS[pick] && player.focusRow.slice(0, 2).includes(pick)) {
        // One marker at a time — choosing again moves it off the old card.
        player.government = pick;
        log(st, `${player.name} adopted ${GOVERNMENTS[pick].name}.`);
        resolved = true;
      }
    } else if (choice.kind === "geneva_return") {
      const option = (choice.options || []).find((entry) => entry.id === payload.optionId);
      const heldIndex = option ? (player.diplomacy || []).findIndex((card) =>
        card.fromId === option.fromId && card.cardId === option.cardId) : -1;
      if (option && heldIndex >= 0) {
        const returned = player.diplomacy.splice(heldIndex, 1)[0];
        const queued = grantPlayerDiplomacy(st, player, option.fromId, {
          excludeCardIds: [option.cardId],
          keepHeld: hasWonder(st, player.id, "Potala Palace"),
          title: "Geneva: Take a Different Diplomacy Card"
        });
        if (queued) {
          const source = getPlayer(st, option.fromId);
          log(st, `${player.name} returned ${returned.name} to ${source ? source.name : "a rival"} (Geneva).`);
          resolved = true;
        } else {
          player.diplomacy.splice(heldIndex, 0, returned);
        }
      }
    } else if (choice.kind === "seoul_move_barbarian") {
      const option = (choice.options || []).find((entry) => entry.id === payload.optionId);
      const currentMoves = seoulBarbarianMoves(st);
      const legal = option && currentMoves.some((move) =>
        move.fromKey === option.fromKey && move.toKey === option.toKey);
      if (legal) {
        const from = st.map.hexes[option.fromKey];
        const to = st.map.hexes[option.toKey];
        const barbarianId = from.barbarianId || null;
        const barbarianToken = from.barbarianToken || null;
        from.barbarian = false;
        from.barbarianId = null;
        from.barbarianToken = null;
        to.barbarian = true;
        to.barbarianId = barbarianId;
        to.barbarianToken = barbarianToken;
        log(st, `${player.name} moved a barbarian with Seoul (${option.fromKey} → ${option.toKey}).`);
        resolved = true;
      }
    } else if (choice.kind === "take_diplomacy") {
      const cardId = payload.optionId;
      const card = DIPLOMACY_CARDS[cardId];
      // Potala Palace keeps the whole hand, so the same card must not be taken
      // from the same rival twice.
      const dup = !!card && choice.keepHeld &&
        (player.diplomacy || []).some((d) => d.fromId === choice.fromId && d.cardId === cardId);
      if (card && !dup) {
        // Swapping returns the card you held before taking the new one — unless
        // Potala Palace lets you keep the whole hand.
        if (!choice.keepHeld) {
          player.diplomacy = (player.diplomacy || []).filter((d) => d.fromId !== choice.fromId);
        }
        player.diplomacy.push({
          fromId: choice.fromId, cardId, name: card.name, type: cardId, effect: card.effect
        });
        const src = getPlayer(st, choice.fromId);
        log(st, `${player.name} took ${card.name} from ${src ? src.name : "a rival"}.`);
        if (cardId === "embassy" && choice.embassyOnTake && src) {
          queueTradeGrant(st, {
            kind: "trade_grant",
            playerId: src.id,
            source: "Embassy",
            title: `Embassy: ${src.name}, Place a Trade Token`,
            nextChoice: {
              kind: "gain_resource",
              playerId: player.id,
              title: "Embassy: Gain a Resource",
              source: "Embassy",
              options: RESOURCES.map((resource) => ({ id: resource, label: resource }))
            }
          });
        }
        resolved = true;
      }
    } else if (choice.kind === "capital_loot_take") {
      const defender = getPlayer(st, choice.defenderId);
      const sourceType = payload.optionId;
      if (defender && FOCUS_TYPES.includes(sourceType) &&
          (choice.options || []).some((option) => option.id === sourceType) &&
          Number(defender.trade[sourceType] || 0) > 0 && focusTradeTargets(player).length) {
        defender.trade[sourceType]--;
        queuePendingChoice(st, {
          kind: "capital_loot_place",
          playerId: player.id,
          defenderId: defender.id,
          remaining: choice.remaining,
          stolenFrom: sourceType,
          title: "Captured Capital: Place the Stolen Trade Token",
          source: "Captured capital",
          options: focusTradeTargets(player)
        });
        resolved = true;
      }
    } else if (choice.kind === "capital_loot_place") {
      const targetType = payload.optionId;
      if (FOCUS_TYPES.includes(targetType) &&
          (choice.options || []).some((option) => option.id === targetType) &&
          Number(player.trade[targetType] || 0) < CFG.maxTrade) {
        player.trade[targetType]++;
        log(st, `${player.name} placed a captured trade token on ${FOCUS_LABELS[targetType]}.`);
        if (Number(choice.remaining || 1) > 1) {
          queueCapitalLootTake(st, player.id, choice.defenderId,
            Number(choice.remaining || 1) - 1);
        }
        resolved = true;
      }
    } else if (choice.kind === "trade_any") {
      const cardType = payload.optionId;
      const offered = !Array.isArray(choice.options) ||
        choice.options.some((option) => option.id === cardType);
      if (!offered) {
        resolved = false;
      } else if (cardType === "zimbabwe" && hasWonder(st, player.id, "Great Zimbabwe")) {
        const capacity = Math.max(0, 4 - Number(player.zimbabwe || 0));
        if (capacity > 0) {
          player.zimbabwe = Number(player.zimbabwe || 0) + 1;
          log(st, `${player.name} banked 1 trade token on Great Zimbabwe (${player.zimbabwe}/4).`);
          resolved = true;
        }
      } else if (FOCUS_TYPES.includes(cardType) &&
          Number(player.trade[cardType] || 0) < CFG.maxTrade) {
        player.trade[cardType] = Number(player.trade[cardType] || 0) + 1;
        log(st, `${player.name} gained +1 ${cardType} trade.`);
        resolved = true;
      }
      // Multi-token effects are separate physical placements. Recompute the
      // target list after each token so the player can distribute them and a
      // card that just filled cannot eat the rest through a stale UI option.
      if (resolved && Number(choice.amount || 1) > 1) {
        const remaining = Number(choice.amount || 1) - 1;
        const options = tradeTargets(st, player);
        if (options.length) {
          queuePendingChoice(st, {
            ...choice,
            id: undefined,
            amount: remaining,
            title: `${choice.source || "Trade reward"}: Place ${remaining} More Trade Token${remaining === 1 ? "" : "s"}`,
            options,
            nextChoice: choice.nextChoice || null
          });
          // Only the final token advances a parent card sequence or starts the
          // next player's interaction choice.
          choice.cardResolutionId = null;
          choice.nextChoice = null;
        } else {
          log(st, `${choice.source || "Trade reward"}: ${player.name} has no room for ${remaining} remaining trade token${remaining === 1 ? "" : "s"}.`);
        }
      }
    } else if (choice.kind === "place_control") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      const allowed = (choice.hexKeys || []).includes(hexKey);
      if (allowed && hex && hex.active && hex.terrain !== "water" && !hex.city && !hex.control && !hex.barbarian && !hex.cityState && !(hex.fortress && !hex.city)) {
        placeControlToken(st, hexKey, player.id, { fortified: !!choice.fortified });
        if (hex.resource && hex.resource !== "wonder" && player.resources[hex.resource] !== undefined) {
          player.resources[hex.resource]++;
          hex.resource = null;
        }
        log(st, `${player.name} placed a${choice.fortified ? " reinforced" : ""} control marker from ${choice.source || "a choice"}.`);
        // Inca: "After you place a control token on a mountain space, you may
        // place a control token on a space adjacent to that space (which can
        // trigger this effect again)." This used to read `choice.source ===
        // "inca"`, so the ability only ever CONTINUED its own chain - it was
        // started by the Culture card alone. A theater square, Engineering,
        // Urbanization, Hanging Gardens, Amundsen-Scott or England's expansion
        // landing on a mountain gave the Inca nothing. Like Stonehenge below,
        // it now listens to the placement itself rather than to who asked for
        // it, and the chain falls out of the same rule.
        //
        // This is the PLACE path only. Moving a token (Drama, Mysticism),
        // replacing a rival's (Mass Media, Statue of Liberty, capture), handing
        // one over (Eiffel Tower) and reinforcing one all have their own
        // handlers and none of them is a placement.
        if (hasLeader(player, "inca") && hex.terrain === "mountain") {
          queueIncaChain(st, player, hexKey);
        }
        // Stonehenge listens to every actual placement source (Hanging
        // Gardens, Engineering, Urbanization, Amundsen-Scott, Inca, etc.),
        // not only Culture-card placements or its own previous link.
        if (hasWonder(st, player.id, "Stonehenge") && hex.terrain === "hill") {
          queueStonehengeChain(st, player, hexKey);
        }
        if (choice.chainKey && choice.chainLeft > 0) {
          if (choice.source === "Urbanization") {
            queueUrbanizationTokens(st, player, choice.chainKey,
              choice.chainLeft, choice.resolvedSlot);
          } else {
            queueAmundsenTokens(st, player, choice.chainKey, choice.chainLeft);
          }
        }
        checkDevelopment(st, player.id);
        resolved = true;
      }
    } else if (choice.kind === "move_control_source") {
      const fromKey = payload.hexKey;
      const destinations = (choice.hexKeys || []).includes(fromKey)
        ? dramaMoveDestinations(st, player.id, fromKey) : [];
      const resolution = st.cardResolution;
      if (destinations.length && resolution && resolution.id === choice.cardResolutionId) {
        resolution.step = "drama_move_destination";
        queuePendingChoice(st, {
          kind: "move_control_destination",
          playerId: player.id,
          title: "Drama and Poetry: Choose the Adjacent Empty Space",
          source: "Drama and Poetry",
          fromKey,
          hexKeys: destinations,
          cardResolutionId: resolution.id
        });
        resolved = true;
      }
    } else if (choice.kind === "move_control_destination") {
      const toKey = payload.hexKey;
      const from = st.map.hexes[choice.fromKey];
      const legal = dramaMoveDestinations(st, player.id, choice.fromKey);
      if (from && from.control && !from.control.district && legal.includes(toKey) &&
          (choice.hexKeys || []).includes(toKey)) {
        const token = from.control;
        from.control = null;
        st.map.hexes[toKey].control = token;
        checkDevelopment(st, player.id);
        log(st, `${player.name} moved a control token with Drama and Poetry.`);
        resolved = true;
      }
    } else if (choice.kind === "mysticism_control_source") {
      const fromKey = payload.hexKey;
      const resolution = st.cardResolution;
      const destinations = resolution && resolution.id === choice.cardResolutionId
        ? mysticismControlDestinations(st, player.id, resolution.districtKey, fromKey)
        : [];
      if ((choice.hexKeys || []).includes(fromKey) && destinations.length) {
        resolution.step = "mysticism_control_destination";
        queuePendingChoice(st, {
          kind: "mysticism_control_destination",
          playerId: player.id,
          title: "Mysticism: Place That Token Beside the New District",
          source: "Mysticism",
          optional: true,
          fromKey,
          hexKeys: destinations,
          cardResolutionId: resolution.id
        });
        resolved = true;
      }
    } else if (choice.kind === "mysticism_control_destination") {
      const resolution = st.cardResolution;
      const toKey = payload.hexKey;
      const carried = choice.carriedControl ||
        (resolution && resolution.mysticismControl) || null;
      const destinations = carried && resolution
        ? mysticismDistrictDestinations(st, resolution.districtKey) : [];
      if (carried && carried.ownerId === player.id && !carried.district &&
          (choice.hexKeys || []).includes(toKey) && destinations.includes(toKey)) {
        const destination = st.map.hexes[toKey];
        destination.control = cloneSerializable(carried);
        if (destination.resource && destination.resource !== "wonder" &&
            player.resources[destination.resource] !== undefined) {
          player.resources[destination.resource]++;
          destination.resource = null;
        }
        checkDevelopment(st, player.id);
        log(st, `${player.name} relocated a control token with Mysticism.`);
        resolved = true;
      }
    } else if (choice.kind === "military_engineering_army") {
      const army = (player.armies || []).find((unit) => unit.id === choice.unitId);
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if (army && !army.position && (choice.hexKeys || []).includes(hexKey) &&
          hex && hex.city && hex.city.ownerId === player.id) {
        army.position = hexKey;
        log(st, `${player.name} deployed an army from Military Engineering.`);
        resolved = true;
      }
    } else if (choice.kind === "mass_media_target") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      const legal = (choice.hexKeys || []).includes(hexKey) &&
        massMediaTargets(st, player.id).includes(hexKey);
      if (legal && hex && hex.control) {
        const formerOwner = hex.control.ownerId;
        if (hex.control.fortified) {
          hex.control.fortified = false;
          log(st, `${player.name} flipped a rival reinforced control token with Mass Media.`);
        } else {
          placeControlToken(st, hexKey, player.id, { fortified: false });
          queueNonAggressionResponse(st, formerOwner, player.id, "Mass Media");
          log(st, `${player.name} replaced a rival control token with Mass Media.`);
        }
        checkDevelopment(st, formerOwner);
        checkDevelopment(st, player.id);
        resolved = true;
      }
    } else if (choice.kind === "remove_control") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.control &&
          hex.control.ownerId !== player.id && !armyGuards(st, hexKey) &&
          canAffectRivalPiece(st, player.id, hex.control.ownerId)) {
        const formerOwner = hex.control.ownerId;
        hex.control = null;
        queueNonAggressionResponse(st, formerOwner, player.id, choice.source || "Effect");
        log(st, `${player.name} removed a rival control token (${choice.source || "effect"}).`);
        resolved = true;
      }
    } else if (choice.kind === "amundsen_site") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      const from = st.map.hexes[choice.fromKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && from && from.city && from.city.wonder) {
        const wonder = from.city.wonder;
        from.city.wonder = null;
        from.city.hasWonder = false;
        hex.city = { ownerId: player.id, isCapital: false, developed: false,
          hasWonder: true, wonder };
        checkDevelopment(st, player.id);
        log(st, `${player.name} founded a city on the rim for Amundsen-Scott Research Station.`);
        onCityBuilt(st, { playerId: player.id, hexKey, source: "Amundsen-Scott" });
        queueAmundsenTokens(st, player, hexKey, 2);
        resolved = true;
      }
    } else if (choice.kind === "scorched_earth") {
      const hex = st.map.hexes[choice.hexKey];
      const army = (player.armies || []).find((unit) => unit.id === choice.unitId);
      if (payload.optionId === "discard" && !player.scorchedEarthUsedThisTurn &&
          hex && hex.control && hex.control.ownerId === player.id &&
          army && army.position === choice.hexKey) {
        hex.control = null;
        player.scorchedEarthUsedThisTurn = true;
        army.movedThisCard = false;
        army.moveInProgress = false;
        log(st, `${player.name} discarded the conquered control token and may move that army again (Scorched Earth).`);
        resolved = true;
      }
    } else if (choice.kind === "arsenal_replay") {
      if (payload.optionId === "yes" && FOCUS_TYPES.includes(choice.cardType)) {
        player.arsenalUsed = true;
        player.arsenalReplay = choice.cardType;
        player.cardPlayed = false;
        log(st, `${player.name} resolves ${FOCUS_LABELS[choice.cardType]} again (Venetian Arsenal).`);
        resolved = true;
      }
    } else if (choice.kind === "estadio_free") {
      if (payload.optionId === "yes" && !player.estadioUsed) {
        player.estadioUsed = true;
        player.cardPlayed = false;
        log(st, `${player.name}'s economy card was free this turn (Estadio Do Maracana).`);
        resolved = true;
      }
    } else if (choice.kind === "eiffel_target") {
      // Step 1: the rival. Step 2 and 3 pick the two tokens.
      const victim = getPlayer(st, payload.optionId);
      const spots = victim && canAffectRivalPiece(st, player.id, victim.id)
        ? Object.entries(st.map.hexes)
        .filter(([k, h]) => h.control && h.control.ownerId === victim.id && !armyGuards(st, k))
        .map(([k]) => k) : [];
      if (victim && spots.length >= 2) {
        queuePendingChoice(st, {
          kind: "eiffel_pick", playerId: player.id, victimId: victim.id, picked: [],
          title: `Eiffel Tower: Name a Token of ${victim.name}'s (1 of 2)`,
          source: "Eiffel Tower", hexKeys: spots
        });
        resolved = true;
      }
    } else if (choice.kind === "eiffel_pick") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.control &&
          hex.control.ownerId === choice.victimId &&
          canAffectRivalPiece(st, player.id, choice.victimId)) {
        const picked = (choice.picked || []).concat([hexKey]);
        if (picked.length < 2) {
          const victim = getPlayer(st, choice.victimId);
          queuePendingChoice(st, {
            kind: "eiffel_pick", playerId: player.id, victimId: choice.victimId, picked,
            title: `Eiffel Tower: Name a Token of ${victim ? victim.name : "theirs"} (2 of 2)`,
            source: "Eiffel Tower", hexKeys: choice.hexKeys.filter((k) => k !== hexKey)
          });
        } else {
          // The card gives the choice of which one to give up to its owner.
          queuePendingChoice(st, {
            kind: "eiffel_give", playerId: choice.victimId, takerId: player.id,
            title: "Eiffel Tower: Give Up One of These Tokens",
            source: "Eiffel Tower", hexKeys: picked
          });
        }
        resolved = true;
      }
    } else if (choice.kind === "eiffel_give") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      const taker = getPlayer(st, choice.takerId);
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.control && taker &&
          !armyGuards(st, hexKey) &&
          canAffectRivalPiece(st, taker.id, hex.control.ownerId)) {
        // "Unused, unreinforced" — the token that arrives is a plain one.
        const formerOwner = hex.control.ownerId;
        placeControlToken(st, hexKey, taker.id, { fortified: false });
        queueNonAggressionResponse(st, formerOwner, taker.id, "Eiffel Tower");
        checkDevelopment(st, taker.id);
        log(st, `${player.name} gave up a control token to ${taker.name} (Eiffel Tower).`);
        resolved = true;
      }
    } else if (choice.kind === "zimbabwe_move") {
      const cardType = payload.optionId;
      if (FOCUS_TYPES.includes(cardType) && (player.zimbabwe || 0) > 0 &&
          Number(player.trade[cardType] || 0) < CFG.maxTrade &&
          (choice.options || []).some((option) => option.id === cardType)) {
        player.zimbabwe--;
        player.trade[cardType] = Number(player.trade[cardType] || 0) + 1;
        log(st, `${player.name} moved a banked token onto ${FOCUS_LABELS[cardType]}.`);
        // Still more on the wonder: offer the next one.
        queueZimbabweRelease(st, player);
        resolved = true;
      }
    } else if (choice.kind === "library_copy") {
      const cardType = payload.optionId;
      const host = getPlayer(st, choice.fromId);
      const theirs = host ? (host.cardTiers[cardType] || 1) : 0;
      if (FOCUS_TYPES.includes(cardType) && theirs > (player.cardTiers[cardType] || 1)) {
        player.cardTiers[cardType] = theirs;
        player.cardLevels[cardType] = theirs;
        player.upgradedThisTurn = true;
        if (cardType === "military" || cardType === "economy") syncUnitCounts(st, player);
        log(st, `${player.name} copied ${host.name}'s ${FOCUS_LABELS[cardType]} card at the Great Library.`);
        resolved = true;
      }
    } else if (choice.kind === "city_state_fate") {
      const hex = st.map.hexes[choice.hexKey];
      const formerOwner = getPlayer(st, choice.defenderId);
      const cs = choice.cityState || {};
      const live = hex && hex.city && hex.city.ownerId === choice.defenderId &&
        hex.city.conqueredCityState && hex.city.conqueredCityState.name === cs.name;
      if (live && (payload.optionId === "conquer" || payload.optionId === "liberate")) {
        if (formerOwner) {
          formerOwner.cityStateTokens = (formerOwner.cityStateTokens || [])
            .filter((name) => name !== cs.name);
        }
        if (payload.optionId === "conquer") {
          if (!(player.cityStateTokens || []).includes(cs.name)) player.cityStateTokens.push(cs.name);
          const capturedWonderName = hex.city.wonder && hex.city.wonder.name;
          replaceAdjacentControlsForStatue(st, player, choice.hexKey);
          hex.city.ownerId = player.id;
          sweepFigures(st, choice.hexKey, player.id);
          const army = (player.armies || []).find((unit) => unit.id === choice.unitId);
          if (army && canOccupyAfterCombat(st, choice.hexKey, player.id)) {
            army.position = choice.hexKey;
          }
          triggerCapturedWonder(st, player, choice.hexKey, capturedWonderName);
          log(st, `${player.name} conquered ${cs.name} from ${formerOwner ? formerOwner.name : "a rival"}.`);
        } else {
          // City-state diplomacy cards are identical pairs, so liberation can
          // grant one immediately without another artificial choice.
          const unownedWonder = hex.city.wonder ? cloneSerializable(hex.city.wonder) : null;
          hex.city = null;
          hex.cityState = { name: cs.name, type: cs.type, diplomacyCards: 2 };
          hex.unownedWonder = unownedWonder;
          grantCityStateDiplomacy(st, player, hex.cityState);
          if (unownedWonder) {
            log(st, `${unownedWonder.name} remains in ${cs.name}'s space unowned until the city-state is conquered again.`);
          }
          log(st, `${player.name} liberated ${cs.name}.`);
        }
        queueNonAggressionResponse(st, choice.defenderId, player.id,
          payload.optionId === "conquer" ? "City-state conquest" : "City-state liberation");
        checkDevelopment(st, choice.defenderId);
        checkDevelopment(st, player.id);
        resolved = true;
      }
    } else if (choice.kind === "conquer_city_state") {
      const hex = st.map.hexes[choice.hexKey];
      if (payload.optionId === "yes" && hex && hex.cityState) {
        const cs = hex.cityState;
        const capturedWonder = hex.unownedWonder ? cloneSerializable(hex.unownedWonder) : null;
        player.trade[cs.type] = Math.min(CFG.maxTrade, player.trade[cs.type] + 1);
        if (!player.cityStateTokens.includes(cs.name)) player.cityStateTokens.push(cs.name);
        returnAllCityStateDiplomacy(st, cs.name);
        hex.cityState = null;
        hex.city = { ownerId: player.id, isCapital: false, developed: false,
          hasWonder: !!capturedWonder, wonder: capturedWonder,
          conqueredCityState: { name: cs.name, type: cs.type } };
        hex.unownedWonder = null;
        triggerCapturedWonder(st, player, choice.hexKey, capturedWonder && capturedWonder.name);
        checkDevelopment(st, player.id);
        log(st, `${player.name} conquered ${cs.name} with Orszaghaz.`);
        resolved = true;
      }
    } else if (choice.kind === "seize_city") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.city &&
          hex.city.ownerId !== player.id && !hex.city.isCapital && !armyGuards(st, hexKey) &&
          canAffectRivalPiece(st, player.id, hex.city.ownerId)) {
        const from = getPlayer(st, hex.city.ownerId);
        const formerOwner = hex.city.ownerId;
        const capturedWonderName = hex.city.wonder && hex.city.wonder.name;
        replaceAdjacentControlsForStatue(st, player, hexKey);
        // The wonder in that city, if any, changes hands with it.
        hex.city = { ownerId: player.id, isCapital: false, developed: false,
          hasWonder: hex.city.hasWonder, wonder: hex.city.wonder };
        checkDevelopment(st, player.id);
        log(st, `${player.name} took ${from ? from.name + "'s" : "a rival"} city with ${choice.source || "an effect"}.`);
        queueNonAggressionResponse(st, formerOwner, player.id, choice.source || "City replacement");
        triggerCapturedWonder(st, player, hexKey, capturedWonderName);
        resolved = true;
      }
    } else if (choice.kind === "apadana_explore") {
      const hexKey = payload.hexKey;
      if ((choice.hexKeys || []).includes(hexKey)) {
        // The expedition itself is a tile placement, so hand the UI a licence
        // to run one from this space and let EXPLORE_TILE do the rest.
        st.freeExplore = {
          playerId: player.id,
          fromKey: hexKey,
          source: "Apadana",
          followUp: "apadana_control"
        };
        log(st, `${player.name} sets out from Apadana.`);
        resolved = true;
      }
    } else if (choice.kind === "potala_pick") {
      const rival = getPlayer(st, payload.optionId);
      if (rival && rival.id !== player.id && grantPlayerDiplomacy(st, player, rival.id)) {
        if (choice.remaining > 1) queuePotalaPicks(st, player, choice.remaining - 1);
        resolved = true;
      }
    } else if (choice.kind === "swap_adjacent") {
      const i = parseInt(payload.optionId, 10);
      if (Number.isInteger(i) && i >= 0 && i < player.focusRow.length - 1) {
        const tmp = player.focusRow[i];
        player.focusRow[i] = player.focusRow[i + 1];
        player.focusRow[i + 1] = tmp;
        log(st, `${player.name} swapped two adjacent focus cards (${choice.source || "effect"}).`);
        resolved = true;
      }
    } else if (choice.kind === "natural_wonder_card") {
      // America names the card the token sits on. Any card in the focus row.
      const cardType = payload.optionId;
      const entry = (st.naturalWonders || {})[choice.tokenName];
      if (FOCUS_TYPES.includes(cardType) && entry && entry.ownerId === player.id) {
        entry.focusCard = cardType;
        log(st, `${player.name} placed the ${entry.name} token on ${FOCUS_LABELS[cardType]}.`);
        resolved = true;
      }
    } else if (choice.kind === "gain_resource") {
      const r = payload.optionId;
      const offered = !Array.isArray(choice.options) ||
        choice.options.some((option) => option.id === r);
      if (RESOURCES.includes(r) && offered) {
        player.resources[r] = (player.resources[r] || 0) + 1;
        log(st, `${player.name} gained 1 ${r}.`);
        resolved = true;
      }
    } else if (choice.kind === "resource_exchange_source") {
      const source = payload.optionId;
      const offered = (choice.options || []).some((option) => option.id === source);
      if (offered && RESOURCES.includes(source) &&
          Number(player.resources[source] || 0) > 0) {
        queuePendingChoice(st, {
          kind: "resource_exchange_target",
          playerId: player.id,
          title: `Steam Power: Exchange ${source} For`,
          source: "Steam Power",
          fromResource: source,
          options: RESOURCES.filter((resource) => resource !== source)
            .map((resource) => ({ id: resource, label: resource }))
        });
        resolved = true;
      }
    } else if (choice.kind === "resource_exchange_target") {
      const target = payload.optionId;
      const source = choice.fromResource;
      const offered = (choice.options || []).some((option) => option.id === target);
      if (offered && RESOURCES.includes(source) && RESOURCES.includes(target) &&
          Number(player.resources[source] || 0) > 0) {
        player.resources[source]--;
        player.resources[target] = Number(player.resources[target] || 0) + 1;
        log(st, `${player.name} exchanged ${source} for ${target} with Steam Power.`);
        resolved = true;
      }
    } else if (choice.kind === "capitalism_card") {
      const cardType = payload.optionId;
      const offered = (choice.options || []).some((option) => option.id === cardType);
      if (offered && FOCUS_TYPES.includes(cardType) && cardType !== "economy" &&
          !player.capitalismUsed) {
        player.capitalismUsed = true;
        player.capitalismReplay = cardType;
        player.capitalismNoReset = true;
        player.cardPlayed = false;
        log(st, `${player.name} will resolve ${FOCUS_LABELS[cardType]} as slot 1 without resetting it (Capitalism).`);
        resolved = true;
      }
    } else if (choice.kind === "nuclear_power_target") {
      const centerKey = payload.hexKey;
      const center = st.map.hexes[centerKey];
      if ((choice.hexKeys || []).includes(centerKey) && center && center.active) {
        const affectedOwners = new Set();
        [centerKey].concat(hexNeighborKeys(center.q, center.r)).forEach((hexKey) => {
          const hex = st.map.hexes[hexKey];
          if (!hex || !hex.control || armyGuards(st, hexKey)) return;
          const ownerId = hex.control.ownerId;
          // "Destroy all unreinforced control tokens and flip all reinforced
          // control tokens." A pact stops the destroying, not the flipping, so
          // it is decided per token rather than by skipping the whole space.
          const interference = hex.control.fortified ? "unreinforce" : "destroy";
          if (pactForbids(st, player.id, ownerId, interference)) return;
          affectedOwners.add(ownerId);
          if (hex.control.fortified) hex.control.fortified = false;
          else {
            hex.control = null;
            queueNonAggressionResponse(st, ownerId, player.id, "Nuclear Power");
          }
        });
        affectedOwners.forEach((ownerId) => checkDevelopment(st, ownerId));
        log(st, `${player.name} resolved Nuclear Power at ${centerKey}.`);
        resolved = true;
      }
    } else if (choice.kind === "swap_cards") {
      const [a, b] = String(payload.optionId || "").split("|");
      const ia = player.focusRow.indexOf(a);
      const ib = player.focusRow.indexOf(b);
      // Some sources leave one card type where it is — Sankore never moves science.
      const barred = choice.exclude && (a === choice.exclude || b === choice.exclude);
      if (ia >= 0 && ib >= 0 && !barred) {
        player.focusRow[ia] = b;
        player.focusRow[ib] = a;
        log(st, `${player.name} swapped ${FOCUS_LABELS[a]} and ${FOCUS_LABELS[b]}.`);
        resolved = true;
      }
    } else if (choice.kind === "non_aggression_swap") {
      const otherType = payload.optionId;
      const militaryIndex = player.focusRow.indexOf("military");
      const otherIndex = player.focusRow.indexOf(otherType);
      const heldIndex = (player.diplomacy || []).findIndex((card) =>
        card.cardId === "non_aggression" && card.fromId === choice.fromId);
      if (FOCUS_TYPES.includes(otherType) && otherType !== "military" &&
          militaryIndex >= 0 && otherIndex >= 0 && heldIndex >= 0) {
        player.diplomacy.splice(heldIndex, 1);
        player.focusRow[militaryIndex] = otherType;
        player.focusRow[otherIndex] = "military";
        const giver = getPlayer(st, choice.fromId);
        log(st, `${player.name} returned the Non-Aggression Pact from ${giver ? giver.name : "its giver"} and moved Military.`);
        resolved = true;
      }
    } else if (choice.kind === "give_ibrahim") {
      if (payload.optionId === "keep") {
        resolved = true;
      } else if (getPlayer(st, payload.optionId) && payload.optionId !== player.id) {
        st.ibrahimHolder = payload.optionId;
        log(st, `${player.name} gave the Ibrahim card to ${getPlayer(st, payload.optionId).name}.`);
        resolved = true;
      }
    } else if (choice.kind === "pick_rival_diplomacy") {
      const rival = getPlayer(st, payload.optionId);
      if (rival && rival.id !== player.id) {
        if (grantPlayerDiplomacy(st, player, rival.id)) {
          player.polandFirstTurnUsed = true;
          log(st, `${player.name} (Poland) chooses a diplomacy card from ${rival.name}.`);
          resolved = true;
        }
      }
    } else if (choice.kind === "reinforce") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.control && hex.control.ownerId === player.id) {
        hex.control.fortified = true;
        log(st, `${player.name} reinforced a marker from ${choice.source || "a choice"}.`);
        resolved = true;
      }
    } else if (choice.kind === "remove_barbarian") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.barbarian) {
        log(st, `${player.name} removed a barbarian from ${choice.source || "a choice"}.`);
        // A defeated barbarian pays a trade token wherever it was defeated
        // (Terra p9: "as normal"), not only when an army did the killing.
        resolved = onBarbarianDefeated(st, {
          playerId: player.id, hexKey,
          source: choice.source || "a choice",
          cardResolutionId: choice.cardResolutionId || null
        });
      }
    } else if (choice.kind === "encampment_strike") {
      // Terra p9: "Defeat a barbarian OR RIVAL ARMY within two spaces of your
      // encampment. If a barbarian is defeated, place one trade token on any
      // card in your focus row as normal." The rival-army half was missing, and
      // only a barbarian pays the token.
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex) {
        // ONE barbarian or ONE rival army. A space can hold several pieces, so
        // the target has to be a specific piece rather than a space: this used
        // to null every army the first matching player had standing there,
        // defeating two or three figures for a single district effect.
        const targets = encampmentTargetsAt(st, hexKey, player.id);
        if (targets.length === 1) {
          resolved = resolveEncampmentStrike(st, player, targets[0], choice);
        } else if (targets.length > 1) {
          queuePendingChoice(st, {
            kind: "encampment_pick",
            playerId: player.id,
            title: "Encampment: Which Piece?",
            source: "encampment",
            cardResolutionId: choice.cardResolutionId || null,
            hexKey,
            options: targets.map((t) => ({ id: encampmentTargetId(t), label: t.label }))
          });
          resolved = true;
        }
      }
    } else if (choice.kind === "encampment_pick") {
      const targets = encampmentTargetsAt(st, choice.hexKey, player.id);
      const picked = targets.find((t) => encampmentTargetId(t) === payload.optionId);
      if (picked) resolved = resolveEncampmentStrike(st, player, picked, choice);
    } else if (choice.kind === "build_city") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && isLegalCitySpace(st, hex, hexKey, player.id)) {
        if (hex.control && hex.control.ownerId === player.id) hex.control = null;
        hex.city = { ownerId: player.id, isCapital: false, developed: false, hasWonder: false, wonder: null };
        log(st, `${player.name} built a city at ${hexKey} (${choice.source || "a district"}).`);
        checkDevelopment(st, player.id);
        onCityBuilt(st, { playerId: player.id, hexKey, source: choice.source || "a district" });
        resolved = true;
      }
    } else if (choice.kind === "cartography_city") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      const legal = (choice.hexKeys || []).includes(hexKey) &&
        hex && isLegalCitySpace(st, hex, hexKey, player.id) &&
        !player.cartographyUsedThisTurn;
      if (legal) {
        if (hex.control && hex.control.ownerId === player.id) hex.control = null;
        hex.city = { ownerId: player.id, isCapital: false, developed: false,
          hasWonder: false, wonder: null };
        player.cartographyUsedThisTurn = true;
        checkDevelopment(st, player.id);
        log(st, `${player.name} built a distant city with Cartography.`);
        onCityBuilt(st, { playerId: player.id, hexKey, source: "Cartography" });
        resolved = true;
      }
    } else if (choice.kind === "district_mode") {
      // Terra p9 prints three of the five districts as a choice of one of two
      // options. Resolving the chosen one is what makes them the printed cards
      // rather than the fused always-on effects they used to be.
      const mode = (choice.options || []).find((o) => o.id === payload.optionId);
      const industrialCity = choice.districtKind === "industrial" && mode && mode.id === "city";
      const availability = industrialCity ? industrialZoneCityOption(st, player.id) : { ok: true };
      if (mode && !mode.disabled && availability.ok) {
        applyDistrictMode(st, player, choice.districtKind, choice.districtKey, mode.id, {
          cardResolutionId: choice.cardResolutionId || null
        });
        resolved = true;
      }
    } else if (choice.kind === "manual") {
      manualLog(st, `${player.name} resolved manual choice: ${choice.title || "choice"}.`);
      resolved = true;
    }

    const dismissed = !!payload.dismiss && (!!choice.optional || !!payload.hostOverride);
    if (dismissed && choice.optional) {
      log(st, `${player.name} declined ${choice.title || "an optional choice"}.`);
    }
    if (resolved || dismissed) {
      st.pendingChoices.splice(idx, 1);
      if (choice.nextChoice) queueInteractionChoice(st, choice.nextChoice);
      if (choice.cardResolutionId) advanceCardResolution(st, choice.cardResolutionId);
      if (choice.kind === "scorched_earth" && !player.scorchedEarthUsedThisTurn &&
          !unitsLeftToMove(player, "military")) {
        finishActiveCard(st);
      }
    }
    return st;
  }

  function manualLog(st, msg) {
    st.manualLog = st.manualLog || [];
    st.manualLog.push({ round: st.turn ? st.turn.round : 0, msg });
    if (st.manualLog.length > MAX_LOG_ENTRIES) {
      st.manualLog.splice(0, st.manualLog.length - MAX_LOG_ENTRIES);
    }
    log(st, `[Host] ${msg}`);
  }

  function applyHostHexEdit(st, hex, changes) {
    if ("active" in changes) hex.active = !!changes.active;
    if ("revealed" in changes) hex.revealed = !!changes.revealed;
    if (changes.terrain && TERRAIN[changes.terrain]) hex.terrain = changes.terrain;
    if ("resource" in changes) {
      hex.resource = changes.resource || null;
      if (hex.resource !== "wonder") { hex.naturalWonder = null; hex.naturalWonderSpace = null; }
    }
    if ("barbarian" in changes) {
      hex.barbarian = !!changes.barbarian;
      if (hex.barbarian) {
        hex.city = null;
        hex.cityState = null;
      }
    }
    if ("fortress" in changes) {
      hex.fortress = !!changes.fortress;
      hex.fortressOwnerId = changes.fortressOwnerId || null;
    }
    if ("cityStateName" in changes) {
      if (changes.cityStateName) {
        const data = CITY_STATE_DATA[changes.cityStateName] || {};
        hex.cityState = { name: changes.cityStateName, type: data.type || "economy", diplomacyCards: 2 };
        hex.city = null;
        hex.control = null;
      } else {
        hex.cityState = null;
      }
    }
    if ("controlOwnerId" in changes) {
      hex.control = changes.controlOwnerId
        ? { ownerId: changes.controlOwnerId, fortified: !!changes.fortified, district: changes.district || null }
        : null;
    }
    if ("district" in changes && hex.control) hex.control.district = changes.district || null;
    if ("fortified" in changes && hex.control) hex.control.fortified = !!changes.fortified;
    if ("cityOwnerId" in changes) {
      if (changes.cityOwnerId) {
        hex.city = { ownerId: changes.cityOwnerId, isCapital: !!changes.isCapital, developed: !!changes.developed, hasWonder: false, wonder: null };
        hex.cityState = null;
        hex.barbarian = false;
      } else {
        hex.city = null;
      }
    }
    if (changes.clearOccupants) {
      hex.city = null;
      hex.cityState = null;
      hex.control = null;
      hex.barbarian = false;
      hex.resource = null;
      hex.naturalWonder = null;
      hex.naturalWonderSpace = null;
    }
  }

  function applyHostPlayerAdjust(st, player, payload) {
    const amount = Number(payload.amount || 0);
    if (payload.tradeType && player.trade[payload.tradeType] !== undefined) {
      player.trade[payload.tradeType] = Math.max(0, Math.min(CFG.maxTrade, player.trade[payload.tradeType] + amount));
    }
    if (payload.resourceType && player.resources[payload.resourceType] !== undefined) {
      player.resources[payload.resourceType] = Math.max(0, player.resources[payload.resourceType] + amount);
    }
    if (payload.techAmount) {
      player.tech = Math.max(0, player.tech + Number(payload.techAmount || 0));
    }
    if (payload.cardType && payload.cardTier) {
      const tier = Math.max(1, Math.min(4, Number(payload.cardTier)));
      player.cardTiers[payload.cardType] = tier;
      player.cardLevels[payload.cardType] = tier;
    }
    if (payload.cityStateToken && !player.cityStateTokens.includes(payload.cityStateToken)) {
      player.cityStateTokens.push(payload.cityStateToken);
    }
    if (payload.diplomacySource) {
      player.diplomacy.push({ fromId: payload.diplomacySource, name: payload.diplomacySource, type: "manual", effect: "Host-added diplomacy card" });
    }
  }

  function grantCityStateDiplomacy(st, player, cityState) {
    if (!cityState || cityState.diplomacyCards <= 0) return false;
    if ((player.diplomacy || []).some((d) => d.fromCityState === cityState.name)) return false;
    const data = CITY_STATE_DATA[cityState.name] || {};
    cityState.diplomacyCards--;
    player.diplomacy.push({
      fromCityState: cityState.name,
      name: cityState.name,
      type: data.type || cityState.type,
      effectId: data.effectId || null,
      effect: data.diplomacy || `Diplomacy with ${cityState.name}`
    });
    log(st, `${player.name} gained ${cityState.name} diplomacy.`);
    return true;
  }

  function grantPlayerDiplomacy(st, player, sourcePlayerId, opts) {
    opts = opts || {};
    const source = getPlayer(st, sourcePlayerId);
    if (!source) return false;
    const mine = (player.diplomacy || []).filter((d) => d.fromId === sourcePlayerId);
    const held = mine[0];
    const cardIds = Object.keys(DIPLOMACY_CARDS);
    const taken = new Set(
      st.players.flatMap((p) => (p.diplomacy || [])
        .filter((d) => d.fromId === sourcePlayerId).map((d) => d.cardId))
    );
    // Potala Palace: its owner may hold all four of a rival's cards at once,
    // so nothing they already hold is swapped away.
    const potala = hasWonder(st, player.id, "Potala Palace");
    if (potala && mine.length >= 4) return false;
    // Each rival has four cards; you may not take one already in someone's hand,
    // and the one you hold is only on offer as a swap.
    let offer = potala
      ? cardIds.filter((id) => !taken.has(id))
      : cardIds.filter((id) => !taken.has(id) || (held && held.cardId === id));
    const excluded = new Set(opts.excludeCardIds || []);
    offer = offer.filter((id) => !excluded.has(id));
    if (!offer.length) return false;
    queuePendingChoice(st, {
      kind: "take_diplomacy", playerId: player.id, fromId: sourcePlayerId,
      keepHeld: potala || !!opts.keepHeld,
      embassyOnTake: !!opts.embassyOnTake,
      title: opts.title || `Diplomacy with ${source.name}`,
      options: offer.map((id) => ({
        id,
        label: DIPLOMACY_CARDS[id].name + (held && held.cardId === id ? " (keep)" : "")
      }))
    });
    return true;
  }

  function detachDiplomacyFromSource(st, player, sourceId) {
    if (!player || !sourceId) return [];
    const removed = [];
    player.diplomacy = (player.diplomacy || []).filter((card) => {
      const match = card.fromId === sourceId || card.fromCityState === sourceId || card.name === sourceId;
      if (match) removed.push(card);
      return !match;
    });
    if (removed.length) log(st, `${player.name} returned ${removed.length} diplomacy card(s) before attacking.`);
    return removed;
  }

  function returnDiplomacyFromSource(st, player, sourceId) {
    return detachDiplomacyFromSource(st, player, sourceId).length;
  }

  function returnAllCityStateDiplomacy(st, cityStateName) {
    let returned = 0;
    st.players.forEach((player) => {
      const before = (player.diplomacy || []).length;
      player.diplomacy = (player.diplomacy || [])
        .filter((card) => card.fromCityState !== cityStateName);
      const count = before - player.diplomacy.length;
      if (count) {
        returned += count;
        log(st, `${player.name} returned ${cityStateName} diplomacy because the city-state was conquered.`);
      }
    });
    return returned;
  }

  // Terra p11: "Abilities that remove pieces or replace one player's piece with
  // another player's piece cannot target a space with an army." An army on the
  // ground shields whatever else is standing there.
  function armyGuards(st, hexKey) {
    return st.players.some((p) => p.armies.some((u) => u.position === hexKey));
  }

  // Terra p10: "An army on a military card can move out of its player's capital
  // city or mature cities as though it was already in that city's space." The
  // same is true of a caravan on the economy card (base p8), so an undeployed
  // figure launches from any of these.
  function launchSpaces(st, playerId) {
    const out = new Set();
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.city || h.city.ownerId !== playerId) return;
      if (h.city.isCapital || isCityDeveloped(st, h)) out.add(k);
    });
    return out;
  }

  // Where a caravan still on the economy card may set out from. Base p8 is the
  // capital or a MATURE city, the same set an army uses. Rome: "When you move a
  // caravan FROM YOUR ECONOMY CARD, it can move from any of your cities (even a
  // city that is not mature)" - so it widens the set, and only for a caravan
  // that is on the card. A caravan already standing on the map sets off from
  // where it stands, Roman or not.
  function caravanLaunchSpaces(st, playerId) {
    const out = launchSpaces(st, playerId);
    if (!hasLeader(getPlayer(st, playerId), "rome")) return out;
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.city && h.city.ownerId === playerId) out.add(k);
    });
    return out;
  }

  // Where a figure of this kind may set off from: where it stands, or — if it
  // is still on its card — out of the cities it may launch from.
  function unitStartSpaces(st, player, kind) {
    const list = kind === "army" ? player.armies : player.caravans;
    const out = new Set();
    let anyOnCard = false;
    list.forEach((u) => { if (u.position) out.add(u.position); else anyOnCard = true; });
    // Only a figure still ON ITS CARD can pick a city to leave from, and for a
    // caravan Rome widens which cities those are. A caravan already on the map
    // sets off from where it stands.
    if (anyOnCard) {
      const from = kind === "caravan"
        ? caravanLaunchSpaces(st, player.id) : launchSpaces(st, player.id);
      from.forEach((k) => out.add(k));
    }
    return out;
  }

  // Terra p10, on winning against a city or a control token (district
  // included): "All rival armies and caravans in the space are defeated and
  // returned to their players' focus cards." Beating a lone figure does NOT do
  // this — only taking the ground under them.
  function sweepFigures(st, hexKey, attackerId) {
    st.players.forEach((p) => {
      if (p.id === attackerId) return;
      let n = 0;
      p.armies.forEach((u) => { if (u.position === hexKey) { u.position = null; n++; } });
      p.caravans.forEach((u) => { if (u.position === hexKey) { u.position = null; n++; } });
      if (n) log(st, `${p.name} lost ${n} figure(s) with the space; they return to their cards.`);
    });
  }

  // Whether the winning army may stand where it fought. Terra p10: it "remains
  // in the attacked space unless that space still contains a city-state,
  // unclaimed fort, or rival piece (for example ... attacked a space containing
  // more than one rival piece)". A piece is a caravan as much as an army, so
  // beating the escort and leaving the wagon standing does not clear the space.
  function canOccupyAfterCombat(st, hexKey, attackerId) {
    const h = st.map.hexes[hexKey];
    if (!h) return false;
    if (h.cityState) return false;
    if (h.fortress && !h.city) return false;
    if (h.city && h.city.ownerId !== attackerId) return false;
    if (h.control && h.control.ownerId !== attackerId) return false;
    if (h.barbarian) return false;
    return !st.players.some((p) => p.id !== attackerId &&
      (p.armies.some((u) => u.position === hexKey) ||
       p.caravans.some((u) => u.position === hexKey)));
  }

  // --- Combat, as an exchange -----------------------------------------------

  function combatTotals(c) {
    return {
      atk: c.atkRoll + c.atkBase + c.atkTrade + (c.atkResource || 0),
      def: c.defRoll + c.defBase + c.defTrade + (c.defResource || 0)
    };
  }

  // Whose hand the defender's die is in. A rival defends for themselves; for a
  // barbarian, city-state or empty fort it is "the player to the right of the
  // attacker" (base p11) — the next player in turn order.
  function combatDefenderRoller(st, c) {
    if (c.defenderOwnerId) return c.defenderOwnerId;
    const order = (st.turn && st.turn.order) || [];
    const i = order.indexOf(c.attackerId);
    if (i < 0 || order.length < 2) return c.attackerId;
    return order[(i + 1) % order.length];
  }

  // How many military trade tokens the side still has to bid with.
  function combatTokens(st, c, side) {
    const id = side === "attacker" ? c.attackerId : c.defenderOwnerId;
    const p = id ? getPlayer(st, id) : null;
    return p ? (p.trade.military || 0) : 0;
  }

  // Jebel Barkal lets its owner burn resource tokens in a fight, +2 apiece.
  // Natural wonder tokens are explicitly excluded on the card, and they are
  // not resources here, so nothing extra is needed to keep them out.
  function combatResources(st, c, side) {
    const id = side === "attacker" ? c.attackerId : c.defenderOwnerId;
    const p = id ? getPlayer(st, id) : null;
    if (!p || !hasWonder(st, p.id, "Jebel Barkal")) return [];
    return RESOURCES.filter((r) => (p.resources[r] || 0) > 0);
  }

  function combatPalenqueResources(st, c, side) {
    if (side !== "attacker") return [];
    const p = c && c.attackerId ? getPlayer(st, c.attackerId) : null;
    if (!p || !hasCityStateDiplomacy(p, "Palenque")) return [];
    return RESOURCES.filter((resource) => Number(p.resources[resource] || 0) > 0);
  }

  // Anything at all this side could still pay with.
  function combatSpendable(st, c, side) {
    const id = side === "attacker" ? c.attackerId : c.defenderOwnerId;
    const player = id ? getPlayer(st, id) : null;
    const maySpendResources = combatResources(st, c, side).length > 0 ||
      combatPalenqueResources(st, c, side).length > 0;
    const resources = maySpendResources && player
      ? RESOURCES.reduce((sum, resource) => sum + Number(player.resources[resource] || 0), 0)
      : 0;
    return combatTokens(st, c, side) + resources;
  }

  // Hands the bid on, skipping anybody who has nothing to spend — a barbarian,
  // a city-state and an empty military card all have no decision to make — and
  // settles the fight once both sides are done.
  function advanceCombat(st) {
    const c = st.combat;
    if (!c || !c.rolled) return;      // nobody bids over dice nobody has thrown
    while (c.turn !== "done" && combatSpendable(st, c, c.turn) <= 0) {
      c.turn = c.turn === "attacker" ? "defender" : "done";
    }
    if (c.turn === "done") resolveCombat(st);
  }

  function resolveCombat(st) {
    const c = st.combat;
    if (!c) return;
    c.turn = "done";
    const player = getPlayer(st, c.attackerId);
    const unit = player && player.armies.find((u) => u.id === c.unitId);
    const hex = st.map.hexes[c.toKey];
    if (!player || !unit || !hex) { st.combat = null; return; }

    const totals = combatTotals(c);
    const atkTotal = totals.atk;
    const defTotal = totals.def;
    const win = atkTotal > defTotal;      // the defender takes ties

    // Zulu cares whether the target was a rival city or city-state — note it
    // before the capture logic rewrites the hex.
    const targetWasCityOrCS = !!(hex.cityState || (hex.city && hex.city.ownerId !== c.attackerId));
    let scorchedOffer = null;

    // The breakdown has to outlive the fight. The result panel reads lastCombat
    // once combat is cleared, and without the parts it fell back to a bare
    // total - the numbers were visible right up until the moment you wanted to
    // check them. Resource burns (Jebel Barkal) are named too, so a player can
    // see what was spent rather than an unexplained jump in the total.
    const withBurn = (parts, burn) => {
      const rows = (parts || []).slice();
      if (burn) rows.push({ label: "resources burned", value: burn, category: "resource" });
      return rows;
    };
    st.lastCombat = { attacker: player.name, defender: c.defenderLabel, toKey: c.toKey,
      atkRoll: c.atkRoll, defRoll: c.defRoll, atkTotal, defTotal, win,
      leaderBonus: c.leaderBonus, atkTrade: c.atkTrade, defTrade: c.defTrade,
      atkParts: withBurn(c.atkParts, c.atkResource),
      defParts: withBurn(c.defParts, c.defResource),
      history: c.history.slice() };

    if (win) {
      player.maxCombatWin = Math.max(player.maxCombatWin || 0, atkTotal);
      // Base p11: an attack has ONE target, and only that target is resolved.
      // Terra p11's worked example makes the consequence plain — beating the
      // army standing in a rival city leaves the city exactly where it was.
      const target = c.defenderType || (hex.city ? "city" : hex.control ? "control" : null);
      // A fort still holding a barbarian is not captured. findDefender makes
      // the barbarian the mandatory target (Terra p10), so this can only be
      // reached by a stale or forged targetType — and letting it through put a
      // city on the fort with a barbarian standing in it, which then counted
      // toward the fort victory agenda and was razed by the next barbarian move.
      if (target === "fortress" && hex.fortress && !hex.city && !hex.barbarian) {
        hex.city = { ownerId: c.attackerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
        log(st, `${player.name} captured the fortress!`);
      }
      if (target === "barbarian" && hex.barbarian) {
        log(st, `${player.name} defeated a barbarian! Choose a focus card for +1 trade.`);
        onBarbarianDefeated(st, {
          playerId: c.attackerId, hexKey: c.toKey, source: "combat"
        });
      }
      if (target === "citystate" && hex.cityState) {
        const csType = hex.cityState.type;
        const csName = hex.cityState.name;
        const capturedWonder = hex.unownedWonder ? cloneSerializable(hex.unownedWonder) : null;
        player.trade[csType] = Math.min(CFG.maxTrade, player.trade[csType] + 1);
        if (!player.cityStateTokens.includes(csName)) player.cityStateTokens.push(csName);
        returnAllCityStateDiplomacy(st, csName);
        log(st, `${player.name} gained +1 ${csType} trade and a ${csName} token.`);
        hex.cityState = null;
        hex.city = { ownerId: c.attackerId, isCapital: false, developed: false,
          hasWonder: !!capturedWonder, wonder: capturedWonder,
          conqueredCityState: { name: csName, type: csType } };
        hex.unownedWonder = null;
        triggerCapturedWonder(st, player, c.toKey, capturedWonder && capturedWonder.name);
      }
      if (target === "control" && hex.control && hex.control.ownerId !== c.attackerId) {
        // Terra p10: beating a district replaces it with your own unreinforced,
        // NON-district token — the district itself is destroyed, not captured.
        placeControlToken(st, c.toKey, c.attackerId, { fortified: false });
        sweepFigures(st, c.toKey, c.attackerId);
        if (uniqueInPlay(player, "zulu") && !player.scorchedEarthUsedThisTurn) {
          scorchedOffer = { hexKey: c.toKey, unitId: unit.id };
        }
      }
      if (target === "city" && hex.city && hex.city.ownerId !== c.attackerId) {
        const defenderId = hex.city.ownerId;
        const defender = getPlayer(st, defenderId);
        const conqueredCityState = hex.city.conqueredCityState || null;
        const capturedWonderName = hex.city.wonder && hex.city.wonder.name;
        if (conqueredCityState) {
          queuePendingChoice(st, {
            kind: "city_state_fate",
            playerId: player.id,
            defenderId,
            hexKey: c.toKey,
            unitId: c.unitId,
            fromKey: c.fromKey,
            cityState: cloneSerializable(conqueredCityState),
            title: `${conqueredCityState.name}: Conquer or Liberate?`,
            source: conqueredCityState.name,
            options: [
              { id: "conquer", label: `Conquer ${conqueredCityState.name}` },
              { id: "liberate", label: `Liberate ${conqueredCityState.name}` }
            ]
          });
        } else {
          replaceAdjacentControlsForStatue(st, player, c.toKey);
        }
        if (hex.city.isCapital && defender) {
          queueCapitalLootTake(st, player.id, defender.id, 2);
          player.capturedCapitals = (player.capturedCapitals || 0) + 1;
        }
        if (!conqueredCityState) {
          hex.city.ownerId = c.attackerId;
          sweepFigures(st, c.toKey, c.attackerId);
          triggerCapturedWonder(st, player, c.toKey, capturedWonderName);
        }
      }
      // Terra p11: a beaten figure goes back to its player's card. Only the
      // figure that was attacked — the rest of the space is untouched.
      if ((target === "army" || target === "caravan") && c.defenderOwnerId) {
        const loser = getPlayer(st, c.defenderOwnerId);
        const beaten = loser && loser.armies.concat(loser.caravans)
          .find((u) => u.id === c.defenderUnitId);
        if (beaten) beaten.position = null;
        log(st, `${player.name} beat ${loser ? loser.name + "'s" : "a"} ${target}; it returns to its card.`);
      }

      // "Victoria's army cannot occupy the same space as Shaka's city, so the
      // army returns to the last space it occupied." (Terra p11)
      unit.position = canOccupyAfterCombat(st, c.toKey, c.attackerId) ? c.toKey : c.fromKey;
      // Zulu: a won attack stocks the military card — doubly so vs cities.
      if (hasLeader(player, "zulu")) {
        const gain = 1 + (targetWasCityOrCS ? 1 : 0);
        player.trade.military = Math.min(CFG.maxTrade, player.trade.military + gain);
        log(st, `${player.name}'s impi triumph: +${gain} military trade.`);
      }
      // Aztec: remember the win — resetting the military card may swap cards.
      player.wonAttackThisTurn = true;
      log(st, `${player.name} won combat vs ${c.defenderLabel}! (${atkTotal} vs ${defTotal})`);
    } else {
      // Base p11 says "if the defender wins, nothing happens" — but Terra p10
      // overrides it for army combat: "If the defender wins, the attacking army
      // is defeated and returned to its player's military focus card."
      unit.position = null;
      log(st, `${player.name}'s army was defeated by ${c.defenderLabel} and returns to the military card. (${atkTotal} vs ${defTotal})`);
    }
    completeFigureMove(unit);
    // Rebuilding activeCard from scratch here would drop the Mass Production
    // bookkeeping that lives on it, so the card is updated rather than replaced.
    activeMovementCard(st, player, "military",
      st.activeCard && st.activeCard.cardType === "military"
        ? st.activeCard.tradePayment || st.activeCard.tradeSpent
        : c.tradePayment || 0);
    if (scorchedOffer) {
      queuePendingChoice(st, {
        kind: "scorched_earth",
        playerId: player.id,
        title: "Scorched Earth: Discard the Conquered Token and Move Again?",
        source: "Scorched Earth",
        optional: true,
        hexKey: scorchedOffer.hexKey,
        unitId: scorchedOffer.unitId,
        options: [{ id: "discard", label: "Discard the token; move this army again" }]
      });
    }
    // Mass Production III: "You may move (and attack with) 1 of your armies that
    // was defeated this turn a second time after returning it to this card."
    // This is the moment the army returns to the card, so this is where the
    // offer is made; it keeps the card open by leaving that army un-moved, and
    // taking it up closes the allowance for every other defeated army.
    if (!win) offerMassProductionRedeploy(st, player, unit);
    if (c.defenderOwnerId) {
      queueNonAggressionResponse(st, c.defenderOwnerId, c.attackerId, "Attack");
    }
    checkDevelopment(st, c.attackerId);
    if (!scorchedOffer && !unitsLeftToMove(player, "military")) finishActiveCard(st);
      st.combat = null;
  }

  // --- Event Wheel ---

  // One click of the dial. A section can hold more than one icon, and they are
  // resolved in the order they are listed — the wonder icon comes last in its
  // space, as Terra p14 requires.
  function advanceEventWheel(st) {
    const wheel = st.eventWheel;
    wheel.position = (wheel.position + 1) % wheel.events.length;
    const section = wheel.events[wheel.position] || [];
    if (!section.length) { log(st, "The event dial turns to a blank space."); return; }
    log(st, `Event: ${section.map((e) => EVENT_LABELS[e]).join(" + ")}`);
    section.forEach((evt) => resolveEvent(st, evt));
  }

  // Barbarian movement, base rulebook p12. One die roll sets the direction for
  // every barbarian on the map; each then walks a single space, with water and
  // the map edge handled before anything on the destination is touched.
  function moveBarbarians(st) {
    const barbs = Object.entries(st.map.hexes).filter(([, h]) => h.barbarian)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));   // same order on every client
    if (!barbs.length) return;
    const roll = rollDie();
    // The die is read off the printed direction token, which is numbered
    // clockwise around the hex - not off HEX_DIRS, whose order is an
    // enumeration (E, W, SE, NW, NE, SW) in which faces 1 and 2 point at
    // opposite edges of the board.
    const dir = BARBARIAN_DIRS[roll - 1];
    // Only the host rolls, so the number has to travel with the state or the
    // other seats can only see the result and never the cause.
    st.barbarianMove = { roll, dir: dir.name, label: dir.label, steps: [] };
    log(st, `Barbarians march ${dir.label} (rolled ${roll}).`);

    // A barbarian may not stop on water: it keeps going the same way until it
    // reaches land. Walking off the edge sends it the opposite way instead
    // (base p12), and base p16 adds that if the reversal itself lands on water
    // it keeps going that way until it reaches land - which is what the second
    // pass of this loop does.
    function destinationFrom(fromKey, heading) {
      const from = st.map.hexes[fromKey];
      if (!from) return null;
      for (const d of [heading, { dq: -heading.dq, dr: -heading.dr }]) {
        let q = from.q, r = from.r;
        for (let step = 0; step < CFG.mapRadius * 2 + 2; step++) {
          q += d.dq; r += d.dr;
          const h = st.map.hexes[key(q, r)];
          if (!h || !h.active) break;            // off the map - try the other way
          if (h.terrain === "water") continue;   // can't stop here, keep walking
          return key(q, r);
        }
      }
      return null;
    }
    function protectedByPetra(hexKey) {
      const target = hexKey && st.map.hexes[hexKey];
      if (!target) return false;
      const ownerId = target.city ? target.city.ownerId
        : target.control && target.control.fortified ? target.control.ownerId : null;
      return !!ownerId && hasWonder(st, ownerId, "Petra");
    }

    function barbarianDestination(fromKey, heading) {
      const forward = destinationFrom(fromKey, heading);
      if (!protectedByPetra(forward)) return forward;
      const reverse = { dq: -heading.dq, dr: -heading.dr };
      const redirected = destinationFrom(fromKey, reverse);
      log(st, `Petra turned a barbarian away from ${forward}.`);
      // Petra's prohibition is absolute. On a cramped board where the normal
      // edge reversal points at another protected space, the barbarian stays.
      return protectedByPetra(redirected) ? null : redirected;
    }
    const destination = (fromKey) => barbarianDestination(fromKey, dir);

    // What a barbarian arriving at a space does to it. Barbarians already
    // standing there are NOT a reason to stop: base p16 lets them share a space
    // and then breaks the pile up with a die, which is what disperse() below
    // does. Everything else here is base p12 plus Terra p11.
    function outcomeAt(toKey) {
      const target = toKey ? st.map.hexes[toKey] : null;
      if (!target) return "none";
      if (armiesAt(st, toKey).length) return "army";
      if (target.control && target.control.fortified) return "reinforced";
      if (target.city && target.city.isCapital) return "capital";
      return "move";
    }

    // The effects of actually landing on a space. Called once per barbarian
    // that relocates there, including one pushed on by a dispersal roll.
    function overrun(toKey) {
      const target = st.map.hexes[toKey];
      st.players.forEach((p) => {
        p.caravans.forEach((u) => {
          if (u.position !== toKey) return;
          u.position = null;                     // back onto the economy card
          log(st, `Barbarians destroyed ${p.name}'s caravan.`);
        });
      });
      if (target.control) {
        target.control = null;
        log(st, `Barbarians destroyed a control marker at ${toKey}.`);
      }
      if (target.city && !target.city.isCapital) {
        // A wonder marker stays on the space when its city falls (p13).
        target.city = null;
        log(st, `Barbarians razed a city at ${toKey}.`);
      }
    }

    // Terra p11: an army in the way is defeated, but it shields its space. The
    // barbarian stays on the last non-water space it occupied, and anything
    // else in the army's space is protected.
    function bounceOffArmy(toKey) {
      armiesAt(st, toKey).forEach(({ player, unit }) => {
        unit.position = null;
        log(st, `Barbarians overran ${player.name}'s army at ${toKey}.`);
      });
    }

    // Where every barbarian ends up. A space may hold more than one for now;
    // the pile is broken up below before anything is written back to the map.
    const landing = new Map();
    // A figure is (letter, token): the letter is what is shown, the token is
    // which printed space it will return to when it is defeated. Both travel.
    const place = (k, figure) => {
      if (!landing.has(k)) landing.set(k, []);
      landing.get(k).push(figure);
    };

    let moved = 0;
    barbs.forEach(([fromKey]) => {
      const hexNow = st.map.hexes[fromKey];
      const id = { letter: hexNow.barbarianId || null, token: hexNow.barbarianToken || null };
      const toKey = destination(fromKey);
      const outcome = outcomeAt(toKey);
      if (outcome === "none") { place(fromKey, id); return; }
      const ownerPlayer = (() => {
        const owner = hexOwnerAt(st, toKey);
        return owner ? getPlayer(st, owner) : null;
      })();

      if (outcome === "army") { bounceOffArmy(toKey); place(fromKey, id); return; }
      if (outcome === "reinforced") {
        const target = st.map.hexes[toKey];
        if (target.control) target.control.fortified = false;
        log(st, `Barbarians battered a reinforced control marker at ${toKey}.`);
        place(fromKey, id);
        return;
      }
      if (outcome === "capital") {
        if (ownerPlayer) {
          let taken = 0;
          for (const f of FOCUS_TYPES) {
            while (taken < 2 && ownerPlayer.trade[f] > 0) { ownerPlayer.trade[f]--; taken++; }
            if (taken >= 2) break;
          }
          log(st, `Barbarians raided ${ownerPlayer.name}'s capital (-${taken} trade).`);
        }
        place(fromKey, id);
        return;
      }

      st.barbarianMove.steps.push({ from: fromKey, to: toKey, id: id.letter });
      overrun(toKey);
      place(toKey, id);
      moved++;
    });

    // Base p16: "After barbarians move, if a space contains more than one
    // barbarian, roll a die and move one of those barbarians in the rolled
    // direction. Repeat until no space contains more than one barbarian."
    //
    // The board itself cannot hold a pile - hex.barbarian is a flag, not a
    // count - so the pile only ever exists here, and is broken up before
    // anything is written back. Refusing the move instead, which is what this
    // used to do, left a barbarian standing still that the rules say should
    // have been pushed on.
    const crowded = () => {
      for (const [k, ids] of landing) if (ids.length > 1) return k;
      return null;
    };
    // Bounded: each roll either relocates a barbarian or gives up on it, and a
    // pathological board (every neighbour an army) must not spin forever.
    for (let guard = 0; guard < barbs.length * 12; guard++) {
      const k = crowded();
      if (!k) break;
      const ids = landing.get(k);
      const pushRoll = rollDie();
      const pushDir = BARBARIAN_DIRS[pushRoll - 1];
      const id = ids[ids.length - 1];            // deterministic on every client
      const toKey = barbarianDestination(k, pushDir);
      const outcome = outcomeAt(toKey);
      log(st, `Two barbarians met at ${k}: one is pushed ${pushDir.label} (rolled ${pushRoll}).`);
      if (outcome === "move") {
        ids.pop();
        overrun(toKey);
        place(toKey, id);
        st.barbarianMove.steps.push({ from: k, to: toKey, id: id && id.letter });
      } else if (outcome === "army") {
        bounceOffArmy(toKey);
        break;                                   // the pile stands; nothing more to push into
      } else {
        // A reinforced marker or capital turns this one back too. Rolling again
        // is the rule, and the guard above stops it running away.
        if (outcome === "reinforced" && st.map.hexes[toKey].control) {
          st.map.hexes[toKey].control.fortified = false;
          log(st, `Barbarians battered a reinforced control marker at ${toKey}.`);
        }
      }
    }

    // Lift the whole board and put it back, so a barbarian stepping into the
    // space ahead cannot overwrite the neighbour that has not stepped yet.
    barbs.forEach(([fromKey]) => {
      const h = st.map.hexes[fromKey];
      h.barbarian = false;
      h.barbarianId = null;
      h.barbarianToken = null;
    });
    landing.forEach((ids, k) => {
      const h = st.map.hexes[k];
      if (!h || !ids.length) return;
      h.barbarian = true;
      h.barbarianId = ids[0] && ids[0].letter;
      h.barbarianToken = ids[0] && ids[0].token;
      if (ids.length > 1) {
        // Should be unreachable: the dispersal loop above only exits with a
        // pile when the board leaves nowhere to push to.
        log(st, `${ids.length} barbarians are stuck together at ${k}.`);
      }
    });
    if (moved) log(st, `${moved} barbarian(s) moved.`);
  }

  // --- Districts -------------------------------------------------------
  //
  // Terra p9 resolves the district icon clockwise from the first player, and
  // within a player's own turn: "Each player resolves the abilities on their
  // districts in the order of their choice." That order can matter - an
  // encampment's strike can clear a barbarian off a space a theater square then
  // wants to claim - so it is the player's to pick, not the array's.
  //
  // A district is never captured: Terra p10 says beating one replaces it with a
  // plain, non-district token. So "your districts" and "the districts you
  // placed" are the same set, and control.ownerId is enough to tell them apart
  // without recording a placer alongside it.
  const DISTRICT_KINDS = ["campus", "trade", "encampment", "industrial", "theater"];
  const DISTRICT_NAMES = {
    campus: "Campus", trade: "Commercial Hub", encampment: "Encampment",
    industrial: "Industrial Zone", theater: "Theater Square"
  };

  function districtHexesFor(st, playerId) {
    const out = { campus: [], trade: [], encampment: [], industrial: [], theater: [] };
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.control && h.control.ownerId === playerId && h.control.district && out[h.control.district]) {
        out[h.control.district].push(k);
      }
    });
    return out;
  }

  // Start a player's district step. One kind needs no decision; more than one
  // is a choice, asked again after each is resolved so the player can react to
  // what the last one did rather than committing to a whole order up front.
  function beginDistrictResolution(st, player, opts) {
    const o = opts || {};
    const hexes = districtHexesFor(st, player.id);
    const kinds = DISTRICT_KINDS.filter((k) => hexes[k].length);
    if (!kinds.length) return false;
    if (kinds.length === 1) {
      resolveDistrictKind(st, player, kinds[0], hexes[kinds[0]]);
      return true;
    }
    queuePendingChoice(st, {
      kind: "district_order",
      playerId: player.id,
      title: o.title || "Resolve Your Districts",
      source: o.source || "district event",
      // Nubia resolves exactly one of hers; the dial resolves all of them.
      remaining: o.limit || kinds.length,
      options: kinds.map((k) => ({
        id: k,
        label: DISTRICT_NAMES[k] + (hexes[k].length > 1 ? " (" + hexes[k].length + ")" : "")
      }))
    });
    return true;
  }

  // A district's ability is resolved per district token, and three of the five
  // are a printed CHOICE of one of two options (Terra p9). The engine used to
  // fuse each pair into a single always-on effect, which is a different and
  // usually stronger card than the one printed.
  const DISTRICT_MODES = {
    trade: [
      { id: "cities", label: "1 trade per mature city, on any focus card" },
      { id: "desert", label: "1 economy trade per friendly desert in or beside it" }
    ],
    industrial: [
      { id: "forest", label: "1 industry trade per friendly forest in or beside it" },
      { id: "city", label: "Spend 3 industry trade to build a city" }
    ],
    theater: [
      { id: "near", label: "Control token within 2 of the district" },
      { id: "wonder", label: "Control token within 2 of a friendly city with a wonder" }
    ]
  };

  // Base p7: "the spaces that contain a player's cities or control tokens are
  // friendly to that player". Caravans do not make a space friendly.
  function isFriendlySpace(h, playerId, st) {
    return !!h && ((h.control && h.control.ownerId === playerId) ||
      (h.city && h.city.ownerId === playerId) ||
      (st && antananarivoIsFriendlyCity(st, h, playerId)));
  }

  // Open Borders is deliberately narrower than ordinary friendliness: it is
  // printed for district abilities and city maturity only. Keeping a separate
  // helper prevents it from accidentally extending Culture placement, unit
  // launch spaces, or city-building range.
  function isDistrictFriendlySpace(st, h, playerId) {
    if (isFriendlySpace(h, playerId, st)) return true;
    const ownerId = h && (h.control && h.control.ownerId || h.city && h.city.ownerId);
    if (ownerId && openBordersWith(st, playerId, ownerId)) return true;
    // Netherlands: water beside any of your districts is a friendly space of
    // every terrain type, but only while a district ability is resolving.
    // Keeping it here (rather than isFriendlySpace) prevents Dutch water from
    // becoming a Culture anchor, unit launch point, or city-building origin.
    if (!h || h.terrain !== "water" || !hasLeader(getPlayer(st, playerId), "netherlands")) {
      return false;
    }
    return hexNeighborKeys(h.q, h.r).some((neighborKey) => {
      const neighbor = st.map.hexes[neighborKey];
      return !!(neighbor && neighbor.control && neighbor.control.ownerId === playerId &&
        neighbor.control.district);
    });
  }

  function districtTerrainMatches(st, h, playerId, terrain) {
    return !!h && (h.terrain === terrain ||
      (h.terrain === "water" && isDistrictFriendlySpace(st, h, playerId) &&
        hasLeader(getPlayer(st, playerId), "netherlands")));
  }

  // "in or adjacent to" includes the district's own space, which the desert and
  // forest counts were both leaving out.
  function inOrAdjacent(st, hexKey) {
    return [hexKey].concat(hexNeighborKeys(parseQ(hexKey), parseR(hexKey)))
      .map((k) => ({ key: k, hex: st.map.hexes[k] }))
      .filter((entry) => !!entry.hex);
  }

  function countFriendlyTerrainNear(st, hexKey, playerId, terrain) {
    return inOrAdjacent(st, hexKey)
      .filter(({ hex }) => hex.active && districtTerrainMatches(st, hex, playerId, terrain) &&
        isDistrictFriendlySpace(st, hex, playerId))
      .length;
  }

  // Spaces a theater square may claim under its second option: within two of a
  // friendly city that holds a world wonder.
  function wonderCityControlChoices(st, playerId) {
    const out = new Set();
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.city || (h.city.ownerId !== playerId &&
          !openBordersWith(st, playerId, h.city.ownerId))) return;
      if (!h.city.hasWonder && !h.city.wonder) return;
      hexesWithinRange(st.map, k, 2).forEach((nk) => {
        const nh = st.map.hexes[nk];
        if (nh && nh.active && nh.terrain !== "water" && !nh.city && !nh.control &&
            !nh.barbarian && !nh.cityState && !(nh.fortress && !nh.city)) out.add(nk);
      });
    });
    return [...out];
  }

  function theaterControlChoices(st, districtKey) {
    return hexesWithinRange(st.map, districtKey, 2).filter((nk) => {
      const nh = st.map.hexes[nk];
      return nh && nh.active && nh.terrain !== "water" && !nh.city && !nh.control &&
        !nh.barbarian && !nh.cityState && !(nh.fortress && !nh.city);
    });
  }

  // Every individual piece an encampment could defeat on one space. The rule
  // defeats ONE barbarian or ONE rival army, and a space can hold several
  // figures, so identity is (ownerId, unitId) rather than the space.
  function encampmentTargetsAt(st, hexKey, playerId) {
    const hex = st && st.map && st.map.hexes[hexKey];
    if (!hex) return [];
    const out = [];
    if (hex.barbarian) out.push({ kind: "barbarian", hexKey });
    st.players.forEach((p) => {
      if (p.id === playerId || !canAffectRivalPiece(st, playerId, p.id)) return;
      (p.armies || []).forEach((unit) => {
        if (unit.position !== hexKey) return;
        out.push({ kind: "army", hexKey, ownerId: p.id, unitId: unit.id,
          label: `${p.name}'s army` });
      });
    });
    return out.map((t) => t.kind === "barbarian"
      ? { ...t, label: "Barbarian" } : t);
  }
  const encampmentTargetId = (t) =>
    t.kind === "barbarian" ? "barbarian" : `army:${t.ownerId}:${t.unitId}`;

  // Defeat exactly one named piece. Only a barbarian pays the trade token.
  function resolveEncampmentStrike(st, player, target, choice) {
    const hex = st.map.hexes[target.hexKey];
    if (!hex) return false;
    if (target.kind === "barbarian") {
      if (!hex.barbarian) return false;
      log(st, `${player.name}'s encampment defeated a barbarian at ${target.hexKey}.`);
      // Terra p9: a defeated BARBARIAN pays one trade token on any focus card,
      // exactly as combat does. A rival army pays nothing.
      return onBarbarianDefeated(st, {
        playerId: player.id, hexKey: target.hexKey, source: "encampment",
        cardResolutionId: (choice && choice.cardResolutionId) || null
      });
    }
    const owner = getPlayer(st, target.ownerId);
    const unit = owner && (owner.armies || []).find((u) => u.id === target.unitId);
    if (!unit || unit.position !== target.hexKey) return false;
    unit.position = null;
    queueNonAggressionResponse(st, owner.id, player.id, "Encampment");
    log(st, `${player.name}'s encampment defeated one of ${owner.name}'s armies at ${target.hexKey}.`);
    return true;
  }

  // Terra p9: "Defeat a barbarian or rival army within two spaces of your
  // encampment." The rival army half was missing entirely.
  function encampmentStrikeTargets(st, districtKey, playerId) {
    return hexesWithinRange(st.map, districtKey, 2).filter((nk) => {
      const h = st.map.hexes[nk];
      if (!h) return false;
      if (h.barbarian) return true;
      return st.players.some((p) => p.id !== playerId &&
        canAffectRivalPiece(st, playerId, p.id) &&
        (p.armies || []).some((u) => u.position === nk));
    });
  }

  function resolveDistrictKind(st, player, kind, districtKeys, context) {
    const cardResolutionId = context && context.cardResolutionId || null;
    const keys = (districtKeys && districtKeys.length)
      ? districtKeys : (districtHexesFor(st, player.id)[kind] || []);
    if (!keys.length) return;
    st.districtReport = st.districtReport || [];

    // Campus (Terra p9): one science trade for every FRIENDLY space with a
    // mountain or natural wonder in or adjacent to the campus. "Friendly"
    // means a space holding your own city or control token (base p7) - a
    // mountain nobody owns is worth nothing, however close it sits. This one
    // has no second option, so it simply resolves.
    if (kind === "campus") {
      // "...with a mountain or natural wonder in or adjacent to the campus."
      // This is the printed SPACE, not the token: a friendly natural wonder
      // space is by definition one you put a control token on, and doing that
      // takes the token away, so reading the token would make the clause
      // impossible to satisfy.
      const featured = (h) => !!h && (districtTerrainMatches(st, h, player.id, "mountain") ||
        h.resource === "wonder" || !!h.naturalWonderSpace);
      const paid = [];
      const nearMisses = [];
      keys.forEach((dk) => {
        inOrAdjacent(st, dk).forEach(({ key: nk, hex: h }) => {
          if (isDistrictFriendlySpace(st, h, player.id) && featured(h)) paid.push(nk);
          else if (featured(h) && h.active) nearMisses.push(nk);
        });
      });
      if (paid.length) {
        player.trade.science = Math.min(CFG.maxTrade, player.trade.science + paid.length);
        log(st, `${player.name}: +${paid.length} science trade (campus).`);
        st.districtReport.push({ playerId: player.id, district: "campus", paid, nearMisses });
      } else {
        log(st, nearMisses.length
          ? `${player.name}'s campus scored nothing: the nearby mountains are not yours yet \u2014 a campus only counts spaces holding your own city or control token.`
          : `${player.name}'s campus scored nothing: no mountain or natural wonder in or beside it.`);
        st.districtReport.push({ playerId: player.id, district: "campus", paid: [], nearMisses });
      }
      return;
    }

    // Encampment (Terra p9): "resolve EITHER OR BOTH" - so both are offered and
    // neither depends on the other.
    if (kind === "encampment") {
      keys.forEach((dk) => {
        const strikeHexes = encampmentStrikeTargets(st, dk, player.id);
        if (strikeHexes.length) {
          queuePendingChoice(st, {
            kind: "encampment_strike",
            playerId: player.id,
            title: "Encampment Strike",
            source: "encampment",
            optional: true,
            cardResolutionId,
            districtKey: dk,
            hexKeys: strikeHexes
          });
        }
        const reinforceHexes = getReinforceChoicesNear(st, dk, player.id, 2);
        if (reinforceHexes.length) {
          queuePendingChoice(st, {
            kind: "reinforce",
            playerId: player.id,
            title: "Encampment Reinforcement",
            source: "encampment",
            optional: true,
            cardResolutionId,
            hexKeys: reinforceHexes
          });
        }
      });
      return;
    }

    // The remaining three are a choice of one option, per district token.
    const modes = DISTRICT_MODES[kind];
    if (!modes) return;
    keys.forEach((dk) => {
      const options = modes.map((mode) => {
        if (kind !== "industrial" || mode.id !== "city") return { ...mode };
        const availability = industrialZoneCityOption(st, player.id);
        return {
          ...mode,
          disabled: !availability.ok,
          disabledReason: availability.ok ? "" : availability.message
        };
      });
      queuePendingChoice(st, {
        kind: "district_mode",
        playerId: player.id,
        title: `${DISTRICT_NAMES[kind]}: Choose an Effect`,
        source: DISTRICT_NAMES[kind].toLowerCase(),
        districtKind: kind,
        districtKey: dk,
        cardResolutionId,
        options
      });
    });
  }

  // One district token, one chosen option.
  function applyDistrictMode(st, player, kind, districtKey, modeId, context) {
    const cardResolutionId = context && context.cardResolutionId || null;
    st.districtReport = st.districtReport || [];

    if (kind === "trade") {
      // "Place a trade token from the supply on a card in your focus row for
      // each of your mature cities" - any card, so the player picks.
      if (modeId === "cities") {
        const total = countDeveloped(st, player.id);
        if (total > 0) {
          queuePendingChoice(st, {
            kind: "trade_any", playerId: player.id,
            title: "Commercial Hub Trade", source: "commercial hub",
            amount: total, options: tradeTargets(st, player), cardResolutionId
          });
        } else log(st, `${player.name}'s commercial hub scored nothing: no mature cities.`);
        return;
      }
      // "...on your ECONOMY focus card for each friendly space with a desert
      // that is in or adjacent to" - a fixed card, so no prompt.
      const deserts = countFriendlyTerrainNear(st, districtKey, player.id, "desert");
      if (deserts > 0) {
        player.trade.economy = Math.min(CFG.maxTrade, player.trade.economy + deserts);
        log(st, `${player.name}: +${deserts} economy trade (commercial hub deserts).`);
      } else log(st, `${player.name}'s commercial hub scored nothing: no friendly desert in or beside it.`);
      return;
    }

    if (kind === "industrial") {
      if (modeId === "forest") {
        const forests = countFriendlyTerrainNear(st, districtKey, player.id, "forest");
        if (forests > 0) {
          player.trade.industry = Math.min(CFG.maxTrade, player.trade.industry + forests);
          log(st, `${player.name}: +${forests} industry trade (industrial zone forests).`);
        } else log(st, `${player.name}'s industrial zone scored nothing: no friendly forest in or beside it.`);
        return;
      }
      // "Discard three trade tokens from your industry focus card to build a
      // city on a legal space within two spaces of a friendly space."
      if ((player.trade.industry || 0) < 3) {
        log(st, `${player.name}'s industrial zone cannot build: 3 industry trade tokens are needed.`);
        return;
      }
      const spots = [...validCityHexes(st, player.id, Infinity, 2)];
      if (!spots.length) {
        log(st, `${player.name}'s industrial zone has no legal space to build on.`);
        return;
      }
      player.trade.industry -= 3;
      queuePendingChoice(st, {
        kind: "build_city", playerId: player.id,
        title: "Industrial Zone: Build a City", source: "industrial zone",
        hexKeys: spots, cardResolutionId
      });
      return;
    }

    if (kind === "theater") {
      const spots = modeId === "wonder"
        ? wonderCityControlChoices(st, player.id)
        : theaterControlChoices(st, districtKey);
      if (!spots.length) {
        log(st, `${player.name}'s theater square has nowhere to place a control token.`);
        return;
      }
      queuePendingChoice(st, {
        kind: "place_control", playerId: player.id,
        title: "Theater Control Marker", source: "theater",
        hexKeys: spots, cardResolutionId
      });
    }
  }

  function resolveEvent(st, evt) {
    if (evt === "barbarian_return") {
      // p12: each defeated barbarian tries to return to ITS OWN printed space -
      // not the nearest icon, not a free one, and never to where it died. The
      // figures are asked one at a time, so a blocked one simply stays off the
      // map with its identity and its home intact and tries again next time.
      syncBarbarianRegistry(st);
      let back = 0, waiting = 0;
      offMapBarbarians(st).forEach((token) => {
        const k = token.homeKey;
        const h = st.map.hexes[k];
        if (!h || !h.active || h.barbarian || h.terrain === "water") { waiting++; return; }
        // The space has to be free of the things that actually block a spawn.
        // A caravan does not, and Terra's additional army rules say an army
        // does not either - both are simply defeated by the arrival.
        if (h.city || h.cityState || h.control || (h.fortress && !h.city)) { waiting++; return; }
        st.players.forEach((p) => {
          p.caravans.forEach((u) => {
            if (u.position !== k) return;
            u.position = null;   // back onto its economy focus card
            log(st, `Returning barbarian ${token.letter} destroyed ${p.name}'s caravan.`);
          });
          // Terra, additional army rules: an army standing on the icon does NOT
          // prevent the spawn. It is defeated and goes back to its owner's
          // military focus card, and the barbarian takes the space.
          p.armies.forEach((u) => {
            if (u.position !== k) return;
            u.position = null;   // back onto its military focus card
            log(st, `Returning barbarian ${token.letter} defeated ${p.name}'s army at ${k}.`);
          });
        });
        h.barbarian = true;
        h.barbarianId = token.letter;
        h.barbarianToken = token.homeKey;
        token.position = k;
        back++;
      });
      log(st, back
        ? `${back} defeated barbarian(s) returned to their printed spaces.` +
          (waiting ? ` ${waiting} could not and will try again.` : "")
        : (waiting ? `${waiting} defeated barbarian(s) could not return and will try again.`
                   : "No barbarians to return."));
    }
    if (evt === "barbarian_move") {
      moveBarbarians(st);
    }
    if (evt === "district_event") {
      // Which spaces actually paid out, so the board can show its working. A
      // campus that scores nothing is the rule doing its job, not a bug, and the
      // only way to tell is to say what it was looking for.
      st.districtReport = [];
      st.turn.order.map((id) => getPlayer(st, id)).filter(Boolean).forEach((player) => {
        beginDistrictResolution(st, player);
      });
    }
    if (evt === "gov_change") {
      // Terra p22: only now may a player change government, and only onto a card
      // sitting in one of the two "1" places.
      st.turn.order.map((id) => getPlayer(st, id)).filter(Boolean).forEach((player) => {
        const eligible = player.focusRow.slice(0, 2)
          .filter((f) => GOVERNMENTS[f] && f !== player.government);
        if (!eligible.length) return;
        queuePendingChoice(st, {
          kind: "choose_government", playerId: player.id,
          title: "Choose a Form of Government",
          options: eligible.map((f) => ({
            id: f,
            label: `${GOVERNMENTS[f].name} — ${FOCUS_LABELS[f]} resolves ${GOVERNMENTS[f].shift} places further right`
          })).concat(player.government
            ? [{ id: "keep", label: `Keep ${GOVERNMENTS[player.government].name}` }] : [])
        });
      });
      log(st, "The dial turns to government: players may change theirs.");
    }
    if (evt === "wonder_tokens") {
      resolveWonderTokens(st);
    }
    // A barbarian march destroys control tokens, which can un-mature a city.
    syncCityMaturity(st);
    syncNaturalWonderTokens(st);
    syncBarbarianRegistry(st);
  }

  // Terra p14: a trade token goes on every faceup wonder. A wonder that would
  // take a second one is removed from the game instead and the next card in its
  // deck is turned up. While the token is there the wonder costs 1 less; it goes
  // back to the supply the moment somebody builds it. So this is a countdown on
  // an unwanted wonder, not a standing discount.
  function resolveWonderTokens(st) {
    if (!st.wonderDecks) return;
    const marked = [];
    const gone = [];
    Object.entries(st.wonderDecks).forEach(([type, deckState]) => {
      const name = deckState.revealed || (deckState.deck && deckState.deck[0]);
      if (!name) return;
      if (deckState.token) {
        deckState.token = 0;
        removeWonderFromGame(st, type, name);
        gone.push(name);
      } else {
        deckState.token = 1;
        marked.push(name);
      }
    });
    if (marked.length) log(st, `A trade token is placed on ${marked.join(", ")} — each costs 1 less.`);
    if (gone.length) log(st, `${gone.join(", ")} went unbuilt too long and left the game.`);
  }

  function removeWonderFromGame(st, type, name) {
    const deckState = st.wonderDecks && st.wonderDecks[type];
    if (!deckState) return;
    const idx = deckState.deck.indexOf(name);
    if (idx >= 0) deckState.deck.splice(idx, 1);
    deckState.removed = deckState.removed || [];
    deckState.removed.push(name);
    deckState.revealed = deckState.deck[0] || null;
    deckState.token = 0;
  }

  // --- Victory & Scoring ---

  // Base p13: a city is mature while every active land space around it holds
  // its owner's control token. That is a property of the CURRENT board, not an
  // event that happens once — a barbarian raid, a Forbidden City removal or an
  // Eiffel Tower gift can end it again. Maturity was cached in
  // `hex.city.developed` and refreshed only by the handful of actions that
  // remembered to ask, so every other way of losing a ring token left cities
  // permanently "mature": agendas, scores and the Commercial Hub all
  // over-reported. Every rule now reads isCityDeveloped() directly and this
  // flag is only a mirror, kept in step for display and for saved games.
  function syncCityMaturity(st) {
    if (!st || !st.map || !st.map.hexes) return;
    Object.values(st.map.hexes).forEach((hex) => {
      if (!hex.city) return;
      const wasDeveloped = !!hex.city.developed;
      hex.city.developed = isCityDeveloped(st, hex);
      // Maturity itself grants no trade token. Terra Incognita's Commercial
      // Hub can award Economy trade based on mature cities during the district
      // event, but that is a separate printed effect.
      if (!wasDeveloped && hex.city.developed) {
        const player = getPlayer(st, hex.city.ownerId);
        if (player) log(st, `${player.name}'s city matured.`);
      }
    });
  }

  // Maturity is a board-wide property, so the player argument no longer
  // selects anything. The call sites are kept because they mark the moments a
  // rule expects the mirror to be up to date before it logs.
  function checkDevelopment(st) { syncCityMaturity(st); }

  function isCityDeveloped(st, hex) {
    if (!hex.city) return false;
    const ownerId = hex.city.ownerId;
    // Sydney Opera House: rival control tokens also count toward maturity.
    const anyControlCounts = hasWonder(st, ownerId, "Sydney Opera House");
    return hexNeighborKeys(hex.q, hex.r).every((nk) => {
      const n = st.map.hexes[nk];
      if (!n) return true;
      if (!n.active) return true;
      if (n.terrain === "water") return true;
      if (n.control && n.control.ownerId === ownerId) return true;
      if (anyControlCounts && n.control) return true;
      // Open Borders: "The cities and control tokens of the player who gave you
      // this card are friendly to you for the purposes of your districts'
      // effects and your cities' maturity." The districts in this game key off
      // terrain and mature cities rather than off whose token is next door, so
      // maturity is where the card actually bites.
      if (n.control && openBordersWith(st, ownerId, n.control.ownerId)) return true;
      if (n.city && openBordersWith(st, ownerId, n.city.ownerId)) return true;
      return false;
    });
  }

  function checkVictory(st) {
    updateAgendaClaims(st);
    const activeAgendaCount = victoryCards(st).length || 5;
    const needed = Math.min(4, activeAgendaCount);
    const contenders = st.players.filter((p) => getClaimedAgendaCount(st, p.id) >= needed);
    if (contenders.length === 1) {
      const p = contenders[0];
      return { playerName: p.name, type: "Agenda Victory", playerId: p.id };
    }
    if (contenders.length > 1) {
      contenders.sort((a, b) => {
        const agendaDiff = getClaimedAgendaCount(st, b.id) - getClaimedAgendaCount(st, a.id);
        if (agendaDiff) return agendaDiff;
        const wonderDiff = countWonders(st, b.id) - countWonders(st, a.id);
        if (wonderDiff) return wonderDiff;
        return countFriendlySpaces(st, b.id) - countFriendlySpaces(st, a.id);
      });
      const p = contenders[0];
      return { playerName: p.name, type: "Agenda Victory (tiebreak)", playerId: p.id };
    }
    if (st.turn.round >= CFG.maxRounds) {
      let best = st.players[0];
      let bestScore = computeScore(st, best.id);
      st.players.forEach((p) => {
        const s = computeScore(st, p.id);
        if (s > bestScore) { bestScore = s; best = p; }
      });
      return { playerName: best.name, type: `Highest Score (${bestScore})`, playerId: best.id };
    }
    return null;
  }

  // A token goes on the card and stays there, "even if the player ceases to
  // satisfy the agenda later" (base p12). Fort cards are the exception: Terra p8
  // says those must be met continually.
  function updateAgendaClaims(st) {
    st.claimedAgendas = st.claimedAgendas || {};
    const cards = victoryCards(st);
    st.players.forEach((p) => {
      const claims = st.claimedAgendas[p.id] || {};
      cards.forEach((card) => {
        const met = card.agendas.some((id) => isAgendaMet(st, p, id));
        if (card.fortress) claims[card.id] = met;
        else if (met) claims[card.id] = true;
        // Which half was completed, for the board to show.
        card.agendas.forEach((id) => { if (isAgendaMet(st, p, id)) claims[id] = true; });
      });
      st.claimedAgendas[p.id] = claims;
      p.agendaClaims = claims;
    });
  }

  function getClaimedAgendaCount(st, playerId) {
    const claims = (st.claimedAgendas && st.claimedAgendas[playerId]) || {};
    return victoryCards(st).filter((card) => claims[card.id]).length;
  }

  function isAgendaMet(st, player, agendaId) {
    switch (agendaId) {
      case "fortified": return countFortCities(st, player.id) >= 1;
      case "expeditionary": return countFortCities(st, player.id) >= 2;
      case "warmonger": return (player.capturedCapitals || 0) >= 1 || (player.cityStateTokens || []).length >= 2;
      case "paranoid": return countWondersByType(st, player.id, "military") >= 2;
      case "civilized": return countCities(st, player.id) >= 8;
      case "money_grubber": return countWondersByType(st, player.id, "economy") >= 2;
      case "defensive": return countReinforced(st, player.id) >= 15;
      case "devastating": return (player.maxCombatWin || 0) >= 16;
      case "diplomatic": return countDiplomacySources(player) >= 4;
      case "hoarder": return totalResources(player) + countNaturalWonders(st, player.id) >= 5;
      case "explorer": return countEdgeWaterControl(st, player.id) >= 15;
      case "aesthetic": return countWondersByType(st, player.id, "culture") >= 2;
      // Terra p16: five districts on the map, not one of each kind.
      case "industrious": return countDistricts(st, player.id) >= 5;
      case "provincial": return countMatureCityTiles(st, player.id) >= 4;
      case "diversified": return countWonderTypeVariety(st, player.id) >= 3;
      case "populous": return countDeveloped(st, player.id) >= 5;
      case "preservationist": return countNaturalWonders(st, player.id) >= 2;
      case "expansionist": return countCityTiles(st, player.id) >= 6;
      case "prolific": return maxWondersInEra(st, player.id) >= 2;
      case "progressive": return countWonderEras(st, player.id) >= 3;
      case "technophile": return FOCUS_TYPES.filter((f) => getCardTier(player, f) >= 4).length >= 3;
      case "scholarly": return countWondersByType(st, player.id, "science") >= 2;
      default: return false;
    }
  }

  function countDistricts(st, playerId) {
    return Object.values(st.map.hexes)
      .filter((h) => h.control && h.control.ownerId === playerId && h.control.district).length;
  }

  function computeScore(st, playerId) {
    let score = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.city && h.city.ownerId === playerId) { score += 3; if (isCityDeveloped(st, h)) score += 2; if (h.city.hasWonder) score += 4; }
      if (h.control && h.control.ownerId === playerId) { score++; if (h.control.district) score++; }
    });
    const p = getPlayer(st, playerId);
    if (p) score += Math.floor(p.tech / 4);
    return score;
  }

  // --- Query Helpers ---

  function countControl(st, playerId) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.control && h.control.ownerId === playerId) c++; }); return c;
  }
  function countWonders(st, playerId) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.hasWonder) c++; }); return c;
  }
  function countDeveloped(st, playerId) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && isCityDeveloped(st, h)) c++; }); return c;
  }
  function countCities(st, playerId) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId) c++; }); return c;
  }
  function countFriendlySpaces(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.city && h.city.ownerId === playerId) c++;
      if (h.control && h.control.ownerId === playerId) c++;
    });
    return c;
  }
  function countFortCities(st, playerId) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.fortress && h.city && h.city.ownerId === playerId) c++; }); return c;
  }
  function countWondersByType(st, playerId, type) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.wonder && h.city.wonder.type === type) c++; }); return c;
  }
  function countReinforced(st, playerId) {
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.control && h.control.ownerId === playerId && h.control.fortified) c++; }); return c;
  }
  function countDiplomacySources(player) {
    const sources = new Set();
    (player.diplomacy || []).forEach((d) => sources.add(d.fromId || d.fromCityState || d.name || d.type));
    return sources.size;
  }
  function totalResources(player) {
    return Object.values(player.resources || {}).reduce((sum, v) => sum + v, 0);
  }
  function countEdgeWaterControl(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (!h.control || h.control.ownerId !== playerId) return;
      // map.radius is only the allocated inactive margin. The actual edge is
      // where explored cardboard ends, and must not move when storage grows.
      const edge = hexNeighborKeys(h.q, h.r).some((nk) => {
        const neighbor = st.map.hexes[nk];
        return !neighbor || !neighbor.active;
      });
      const water = hexNeighborKeys(h.q, h.r).some((nk) => st.map.hexes[nk] && st.map.hexes[nk].terrain === "water");
      if (edge || water) c++;
    });
    return c;
  }
  function countDistrictTypes(st, playerId) {
    const types = new Set();
    Object.values(st.map.hexes).forEach((h) => { if (h.control && h.control.ownerId === playerId && h.control.district) types.add(h.control.district); });
    return types.size;
  }
  function countMatureCityTiles(st, playerId) {
    const tiles = new Set();
    Object.values(st.map.hexes).forEach((h) => {
      if (h.city && h.city.ownerId === playerId && isCityDeveloped(st, h)) tiles.add(h.tileId || `${Math.floor(h.q / 4)},${Math.floor(h.r / 4)}`);
    });
    return tiles.size;
  }
  function countWonderTypeVariety(st, playerId) {
    const types = new Set();
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.wonder) types.add(h.city.wonder.type); });
    return types.size;
  }
  // Hoarder counts tokens you HAVE and Preservationist natural wonders you
  // CONTROL; both are the token on your leader sheet, not the space it came
  // from, so neither is a question about the map any more.
  function countNaturalWonders(st, playerId) {
    return Object.values((st && st.naturalWonders) || {})
      .filter((entry) => entry && entry.ownerId === playerId).length;
  }
  function countCityTiles(st, playerId) {
    const tiles = new Set();
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId) tiles.add(h.tileId || `${h.q},${h.r}`); });
    return tiles.size;
  }
  function maxWondersInEra(st, playerId) {
    const counts = {};
    Object.values(st.map.hexes).forEach((h) => {
      if (h.city && h.city.ownerId === playerId && h.city.wonder) counts[h.city.wonder.era] = (counts[h.city.wonder.era] || 0) + 1;
    });
    return Math.max(0, ...Object.values(counts));
  }
  function countWonderEras(st, playerId) {
    const eras = new Set();
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.wonder) eras.add(h.city.wonder.era); });
    return eras.size;
  }
  function findCapital(st, playerId) {
    for (const [k, h] of Object.entries(st.map.hexes)) {
      if (h.city && h.city.ownerId === playerId && h.city.isCapital) return k;
    }
    return null;
  }
  function currentPlayer(st) {
    if (!st) return null;
    return st.players.find((p) => p.id === st.turn.order[st.turn.index]) || null;
  }
  function getPlayer(st, id) { return st.players.find((p) => p.id === id) || null; }
  function getCardTier(player, cardType) {
    return player.cardTiers ? (player.cardTiers[cardType] || 1) : 1;
  }

  // Terra's "weiter rechts" rule: count the given number of places along the
  // focus row from where the card sits and use the number printed there. Past
  // the last place it counts as place 5.
  function slotAfterShift(idx, shift) {
    const i = Math.min(idx + Math.max(0, shift || 0), FOCUS_SLOTS.length - 1);
    return FOCUS_SLOTS[i];
  }

  function getGovShift(player, cardType) {
    if (!player.government || player.government !== cardType) return 0;
    return (GOVERNMENTS[cardType] || {}).shift || 0;
  }

  // The slot a card resolves at: its place in the row, shifted right by every
  // effect that says so, capped at the "5" slot (Terra p13). Reaching a tech
  // level on the dial does NOT add to this — the dial hands you better cards
  // (base p8), it does not make the row itself stronger.
  function getSlotValue(player, cardType, st) {
    if (player && player.capitalismReplay === cardType && player.capitalismNoReset) {
      return 1;
    }
    const idx = player.focusRow.indexOf(cardType);
    if (idx < 0) return 1;
    // Georgia: a diplomacy card from a city-state of this card's type resolves
    // the card as though it sat 1 place farther to the right.
    const georgiaShift = hasLeader(player, "georgia") &&
      (player.diplomacy || []).some((d) => d.fromCityState && d.type === cardType) ? 1 : 0;
    // Taj Mahal: 1 place per world wonder you control matching this card's type.
    const tajShift = st && hasWonder(st, player.id, "Taj Mahal")
      ? countWondersOfType(st, player.id, cardType) : 0;
    // Machu Picchu: "When you resolve the card in the first or second slot of
    // your focus row, resolve it as though it is 2 slots farther to the right."
    // It reads the printed slot, not the shifted one, so it is decided before
    // anything else moves the card along.
    const machuShift = st && idx < 2 && hasWonder(st, player.id, "Machu Picchu") ? 2 : 0;
    const shift = getGovShift(player, cardType) + georgiaShift + tajShift + machuShift;
    return slotAfterShift(idx, shift);
  }

  function getMilitaryMove(player, st) {
    // Pentagon: "Your armies can move any number of spaces. (They must still
    // obey all other movement rules.)" Only the distance is lifted — stopping
    // on a rival piece, ending on entering a barbarian, and the rest still
    // apply, so this is a very large budget rather than a special case.
    if (st && hasWonder(st, player.id, "Pentagon")) return 99;
    const tier = getCardTier(player, "military");
    // Scythia's Horseback Riding (unique Military I): armies ride 6 spaces.
    if (uniqueInPlay(player, "scythia")) return 6;
    return CARD_TIERS.military.move[tier - 1];
  }

  function getEconomyMove(player, st) {
    const tier = getCardTier(player, "economy");
    // Egypt's Wheel (unique Economy I): caravans roll 4 spaces.
    const base = uniqueInPlay(player, "egypt") ? 4 : CARD_TIERS.economy.move[tier - 1];
    // Colossus: 6 additional spaces of caravan movement on the economy card.
    const colossus = st && player && hasWonder(st, player.id, "Colossus") ? 6 : 0;
    return base + colossus;
  }

  function getCultureMarkers(player, tradeSpent, st) {
    const tier = getCardTier(player, "culture");
    const base = CARD_TIERS.culture.markers[tier - 1];
    const franceBonus = st && player && hasLeader(player, "france")
      ? franceWonderBonus(st, player.id) : 0;
    return base + tradeSpent + franceBonus;
  }

  // The printed cards, not a flat table. Iron Working reads "your combat value
  // equals this slot's number, PLUS 2 IF ATTACKING A BARBARIAN" — the +2 was
  // being handed out against every defender, which is a permanent, invisible
  // +2 in every fight for a whole tier. Mass Production and Flight are
  // unconditional (+2 / +3). CARD_DEFS already carried `vsBarbarian`; nothing
  // read it.
  function getMilitaryCombatBonus(player, defenderType) {
    const tier = getCardTier(player, "military");
    const unique = getActiveUniqueCard(player, "military");
    if (unique) return Number(unique.combat || 0);
    const def = (CARD_DEFS.military || {})[tier] || {};
    const flat = Number(def.combat || 0);
    const vsBarb = Number(def.vsBarbarian || 0);
    if (vsBarb && defenderType === "barbarian") return flat + vsBarb;
    return flat;
  }

  // --- World wonder effects ---

  function hasWonder(st, playerId, wonderName) {
    if (!st || !playerId) return false;
    return Object.values(st.map.hexes).some((h) =>
      h.city && h.city.ownerId === playerId && h.city.wonder && h.city.wonder.name === wonderName);
  }

  function countWondersOfType(st, playerId, type) {
    let n = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.city && h.city.ownerId === playerId && h.city.wonder && h.city.wonder.type === type) n++;
    });
    return n;
  }

  function countAdjacentWater(st, hexKey) {
    let n = 0;
    hexNeighborKeys(parseQ(hexKey), parseR(hexKey)).forEach((nk) => {
      const nh = st.map.hexes[nk];
      if (nh && nh.active && nh.terrain === "water") n++;
    });
    return n;
  }

  function countAdjacentCaravans(st, hexKey, playerId) {
    const player = getPlayer(st, playerId);
    if (!player) return 0;
    const around = new Set(hexNeighborKeys(parseQ(hexKey), parseR(hexKey)));
    return player.caravans.filter((u) => u.position && around.has(u.position)).length;
  }

  function countReinforced(st, playerId) {
    let n = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.control && h.control.ownerId === playerId && h.control.fortified) n++;
    });
    return n;
  }

  // Where a trade token you have just gained may go. Great Zimbabwe adds its own
  // card as a fifth-and-more place to park one, up to a printed limit of 4.
  function focusTradeTargets(player) {
    if (!player) return [];
    return FOCUS_TYPES.filter((f) => Number(player.trade[f] || 0) < CFG.maxTrade)
      .map((f) => ({
        id: f,
        label: `${FOCUS_LABELS[f]} (${player.trade[f] || 0}/${CFG.maxTrade})`
      }));
  }

  function tradeTargets(st, player) {
    const opts = focusTradeTargets(player);
    if (hasWonder(st, player.id, "Great Zimbabwe") && (player.zimbabwe || 0) < 4) {
      opts.push({ id: "zimbabwe", label: `Great Zimbabwe (${player.zimbabwe || 0}/4 banked)` });
    }
    return opts;
  }

  // Cross-player rewards must be decisions owned by the player receiving the
  // token. A descriptor can carry the next decision in the printed sequence;
  // it is queued only after this one resolves, so two browsers cannot answer a
  // single card out of order.
  function queueInteractionChoice(st, descriptor) {
    if (!descriptor) return false;
    if (descriptor.kind === "trade_grant") return queueTradeGrant(st, descriptor);
    if (!getPlayer(st, descriptor.playerId)) return false;
    queuePendingChoice(st, descriptor);
    return true;
  }

  function queueTradeGrant(st, descriptor) {
    const player = getPlayer(st, descriptor && descriptor.playerId);
    if (!player) return false;
    const options = focusTradeTargets(player);
    if (!options.length) {
      log(st, `${descriptor.source || "Trade reward"}: ${player.name} has no focus card with room for another trade token.`);
      return descriptor.nextChoice
        ? queueInteractionChoice(st, descriptor.nextChoice) : false;
    }
    queuePendingChoice(st, {
      kind: "trade_any",
      playerId: player.id,
      title: descriptor.title || `${descriptor.source || "Trade reward"}: Place a Trade Token`,
      source: descriptor.source || "Trade reward",
      amount: 1,
      options,
      nextChoice: descriptor.nextChoice || null
    });
    return true;
  }

  function queueCapitalLootTake(st, attackerId, defenderId, remaining) {
    const attacker = getPlayer(st, attackerId);
    const defender = getPlayer(st, defenderId);
    if (!attacker || !defender || remaining <= 0) return false;
    if (!focusTradeTargets(attacker).length) {
      log(st, `${attacker.name} has no room to place captured trade tokens.`);
      return false;
    }
    const options = FOCUS_TYPES.filter((type) => Number(defender.trade[type] || 0) > 0)
      .map((type) => ({
        id: type,
        label: `${FOCUS_LABELS[type]} (${defender.trade[type]} available)`
      }));
    if (!options.length) return false;
    queuePendingChoice(st, {
      kind: "capital_loot_take",
      playerId: attacker.id,
      defenderId: defender.id,
      remaining,
      title: `Captured Capital: Choose Trade Token ${3 - remaining} of 2`,
      source: "Captured capital",
      optional: true,
      options
    });
    return true;
  }

  // Great Zimbabwe, at the start of the turn: move what is banked on the wonder
  // out onto the row, one token at a time.
  function queueZimbabweRelease(st, player) {
    if (!hasWonder(st, player.id, "Great Zimbabwe") || !(player.zimbabwe > 0)) return;
    const options = focusTradeTargets(player);
    if (!options.length) {
      log(st, `Great Zimbabwe: ${player.name} has no focus card with room for a banked token.`);
      return;
    }
    queuePendingChoice(st, {
      kind: "zimbabwe_move", playerId: player.id,
      title: `Great Zimbabwe: Move a Banked Trade Token (${player.zimbabwe} left)`,
      source: "Great Zimbabwe", optional: true,
      options
    });
  }

  // Great Library: a card of the same type and tech level as one in the row of
  // the player you just traded with, replacing your own card of that type. Only
  // worth offering where their card is actually ahead of yours.
  function queueGreatLibrary(st, player, hostId) {
    const host = getPlayer(st, hostId);
    if (!host) return;
    const better = FOCUS_TYPES.filter((f) =>
      (host.cardTiers[f] || 1) > (player.cardTiers[f] || 1));
    if (!better.length) return;
    queuePendingChoice(st, {
      kind: "library_copy", playerId: player.id, fromId: hostId,
      title: `Great Library: Copy a Card from ${host.name}`,
      source: "Great Library", optional: true,
      options: better.map((f) => ({
        id: f, label: `${FOCUS_LABELS[f]} \u2192 tier ${host.cardTiers[f]}` }))
    });
  }

  // Statue of Liberty is checked before every city replacement, including
  // focus-card and wonder effects. A district token is not captured: every
  // replaced marker comes from the attacker's unused, plain control supply.
  function replaceAdjacentControlsForStatue(st, player, cityKey) {
    const cityHex = st.map.hexes[cityKey];
    if (!cityHex || !hasWonder(st, player.id, "Statue of Liberty")) return 0;
    let replaced = 0;
    hexNeighborKeys(cityHex.q, cityHex.r).forEach((neighborKey) => {
      const neighbor = st.map.hexes[neighborKey];
      if (!neighbor || !neighbor.control || neighbor.control.ownerId === player.id) return;
      if (!canAffectRivalPiece(st, player.id, neighbor.control.ownerId)) return;
      if (armyGuards(st, neighborKey)) return;
      const formerOwner = neighbor.control.ownerId;
      placeControlToken(st, neighborKey, player.id, { fortified: false });
      queueNonAggressionResponse(st, formerOwner, player.id, "Statue of Liberty");
      replaced++;
    });
    if (replaced) log(st, `${player.name} replaced ${replaced} adjacent rival control marker${replaced === 1 ? "" : "s"} with Statue of Liberty.`);
    return replaced;
  }

  // The printed build-or-capture wonders trigger regardless of whether a city
  // changed hands through combat, Radio, Cristo Redentor, or another effect.
  function triggerCapturedWonder(st, player, cityKey, wonderName) {
    if (wonderName === "Apadana") queueApadanaExplore(st, player);
    if (wonderName === "Cristo Redentor") queueCristoTakeover(st, player, cityKey);
  }

  // Cristo Redentor: on building or capturing it, take a rival non-capital
  // city within 3 spaces that has no army standing in it.
  function queueCristoTakeover(st, player, fromKey) {
    const from = st.map.hexes[fromKey];
    if (!from) return;
    const spots = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.city || h.city.ownerId === player.id || h.city.isCapital ||
          !canAffectRivalPiece(st, player.id, h.city.ownerId)) return;
      if (hexDist(from, h) > 3) return;
      if (getUnitsAt(st, k).some((u) => u.type === "army")) return;
      spots.push(k);
    });
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "seize_city", playerId: player.id,
      title: "Cristo Redentor: Take a Rival City",
      source: "Cristo Redentor", hexKeys: spots
    });
  }

  function queueCartographyCity(st, player, rivalCityKey) {
    if (!uniqueInPlay(player, "netherlands") || player.cartographyUsedThisTurn) return false;
    const capitalKey = findCapital(st, player.id);
    const capital = capitalKey && st.map.hexes[capitalKey];
    const rivalCity = st.map.hexes[rivalCityKey];
    if (!capital || !rivalCity || !rivalCity.city ||
        rivalCity.city.ownerId === player.id || hexDist(capital, rivalCity) < 8) return false;
    const spots = Object.entries(st.map.hexes).filter(([hexKey, hex]) =>
      hex && hexDist(rivalCity, hex) <= 2 &&
      isLegalCitySpace(st, hex, hexKey, player.id)).map(([hexKey]) => hexKey);
    if (!spots.length) return false;
    queuePendingChoice(st, {
      kind: "cartography_city",
      playerId: player.id,
      title: "Cartography: Build a City Within 2 Spaces",
      source: "Cartography",
      optional: true,
      fromKey: rivalCityKey,
      hexKeys: spots
    });
    return true;
  }

  // Apadana: on building it, explore from any edge space on any tile.
  function queueApadanaExplore(st, player) {
    if (!st.tileStack || !st.tileStack.length) return;
    // "Any tile", so unlike a normal expedition this does not need the space to
    // sit on the tile your capital is on.
    const spots = Object.entries(st.map.hexes).filter(([, h]) => {
      if (!h.active) return false;
      return hexNeighborKeys(h.q, h.r).some((nk) => {
        const nh = st.map.hexes[nk];
        return nh && !nh.active;
      });
    }).map(([k]) => k);
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "apadana_explore", playerId: player.id,
      title: "Apadana: Explore From Any Edge Space",
      source: "Apadana", hexKeys: spots
    });
  }

  // Amundsen-Scott Research Station does not go into a city you already hold — it founds one
  // on any legal edge space and stands in that. Then up to 2 control tokens
  // land next to it.
  // Amundsen-Scott does not go into a city you already hold: the card says
  // "build a city on any legal space on the edge of the map and place this
  // wonder in that city". No legal rim space means the card cannot be resolved
  // at all - so this is a precondition of BUYING it, not a follow-up that may
  // quietly fizzle. It used to fizzle: the payment was spent, the deck advanced
  // to the next card, and the station stayed in the ordinary city it was bought
  // from, which is a board state the printed card cannot produce.
  function amundsenSites(st, playerId) {
    return Object.entries(st.map.hexes)
      .filter(([k, h]) => isEdgeSpace(st, h) && isLegalCitySpace(st, h, k, playerId))
      .map(([k]) => k);
  }

  // Every wonder whose printed text REQUIRES something the board may not be
  // able to provide. Checked before any irreversible step.
  function wonderResolutionBlocked(st, playerId, wonderName) {
    if (wonderName === "Amundsen-Scott Research Station" && !amundsenSites(st, playerId).length) {
      return {
        code: "amundsen_no_rim_city",
        message: "Amundsen-Scott Research Station must found its own city on a legal space at the edge of the map, and there is none."
      };
    }
    return null;
  }

  function queueAmundsenSite(st, player, builtAtKey) {
    const spots = amundsenSites(st, player.id);
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "amundsen_site", playerId: player.id, fromKey: builtAtKey,
      title: "Amundsen-Scott Research Station: Found Its City on the Rim",
      source: "Amundsen-Scott Research Station", hexKeys: spots
    });
  }

  // The 2 control tokens the station places once it has a home.
  function queueAmundsenTokens(st, player, cityKey, remaining) {
    if (remaining <= 0) return;
    const spots = hexNeighborKeys(parseQ(cityKey), parseR(cityKey)).filter((nk) => {
      const nh = st.map.hexes[nk];
      return nh && nh.active && nh.terrain !== "water" && !nh.city && !nh.control &&
        !nh.barbarian && !nh.cityState && !(nh.fortress && !nh.city);
    });
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "place_control", playerId: player.id,
      title: `Amundsen-Scott Research Station: Place a Control Token (${remaining} left)`,
      source: "Amundsen-Scott Research Station", hexKeys: spots, optional: true,
      chainKey: cityKey, chainLeft: remaining - 1
    });
  }

  // Potala Palace hands its builder three diplomacy cards. Each pick is a rival
  // first, then a card from that rival, so the prompts stay one decision each.
  function queuePotalaPicks(st, player, remaining) {
    if (remaining <= 0) return;
    const rivals = st.players.filter((p) => p.id !== player.id &&
      (player.diplomacy || []).filter((d) => d.fromId === p.id).length < 4);
    if (!rivals.length) return;
    queuePendingChoice(st, {
      kind: "potala_pick", playerId: player.id,
      title: `Potala Palace: Take a Diplomacy Card (${remaining} left)`,
      source: "Potala Palace",
      remaining,
      options: rivals.map((p) => ({ id: p.id, label: p.name })),
      optional: true
    });
  }

  // Any two cards in the row, optionally leaving one type where it is. The
  // pairs are listed by name, not by slot number, because nobody thinks of
  // their row as indices.
  function queueCardSwap(st, player, opts) {
    const types = FOCUS_TYPES.filter((f) => f !== opts.exclude);
    const options = [];
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        options.push({ id: `${types[i]}|${types[j]}`,
          label: `${FOCUS_LABELS[types[i]]} \u2194 ${FOCUS_LABELS[types[j]]}` });
      }
    }
    if (!options.length) return;
    queuePendingChoice(st, {
      kind: "swap_cards", playerId: player.id,
      title: opts.title, source: opts.source,
      exclude: opts.exclude || null,
      options, optional: true
    });
  }

  function queueUrbanizationTokens(st, player, cityKey, remaining, slot) {
    if (remaining <= 0) return;
    const city = st.map.hexes[cityKey];
    if (!city) return;
    const spots = hexNeighborKeys(city.q, city.r).filter((hexKey) => {
      const hex = st.map.hexes[hexKey];
      if (!hex || !hex.active || hex.terrain === "water" ||
          placementDifficulty(st, hex, player, "industry_control") > slot) return false;
      return !hex.city && !hex.cityState && !hex.control && !hex.barbarian &&
        !(hex.fortress && !hex.city);
    });
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "place_control",
      playerId: player.id,
      title: `Urbanization: Place a Control Token (${remaining} left)`,
      source: "Urbanization",
      hexKeys: spots,
      optional: true,
      chainKey: cityKey,
      chainLeft: remaining - 1,
      resolvedSlot: slot
    });
  }

  function genevaSwapOptions(st, player) {
    const cardIds = Object.keys(DIPLOMACY_CARDS);
    return (player.diplomacy || []).filter((card) => card.fromId && card.cardId)
      .filter((returned) => {
        const unavailable = new Set(st.players.flatMap((owner) =>
          (owner.diplomacy || [])
            .filter((card) => card.fromId === returned.fromId && card !== returned)
            .map((card) => card.cardId)));
        return cardIds.some((cardId) => cardId !== returned.cardId && !unavailable.has(cardId));
      })
      .map((card, index) => {
        const source = getPlayer(st, card.fromId);
        return {
          id: `geneva-${index}`,
          fromId: card.fromId,
          cardId: card.cardId,
          label: `Return ${card.name || DIPLOMACY_CARDS[card.cardId]?.name || card.cardId} from ${source ? source.name : "a rival"}`
        };
      });
  }

  function seoulBarbarianMoves(st) {
    const moves = [];
    Object.entries(st.map.hexes).forEach(([fromKey, from]) => {
      if (!from || !from.barbarian) return;
      hexNeighborKeys(from.q, from.r).forEach((toKey) => {
        const to = st.map.hexes[toKey];
        if (!to || !to.active || to.terrain === "water") return;
        if (to.city || to.cityState || to.control || to.fortress || to.barbarian ||
            to.resource || to.naturalWonder || getUnitsAt(st, toKey).length) return;
        moves.push({
          id: `seoul-${moves.length}`,
          fromKey,
          toKey,
          label: `${fromKey} → ${toKey}`
        });
      });
    });
    return moves;
  }

  // Seoul's offer lists moves read off the board, and it is queued for the next
  // player BEFORE the event wheel turns. When the wheel lands on the barbarian
  // march it moves the very figures the offer named, so every option becomes a
  // move from a space no barbarian is on any more — and the resolver, which
  // correctly re-checks legality, then refuses all of them. The offer is left
  // on the board unanswerable.
  //
  // Re-reading the options once the board has finished changing is the same
  // remedy refreshScienceUpgradeChoices already applies to the tech-level
  // prompt. An offer with nothing left to move is dropped rather than left
  // standing with an empty list.
  function refreshSeoulChoices(st) {
    if (!st || !Array.isArray(st.pendingChoices)) return;
    let moves = null;
    st.pendingChoices.forEach((choice) => {
      if (choice.kind !== "seoul_move_barbarian") return;
      if (!moves) moves = seoulBarbarianMoves(st);
      choice.options = moves;
    });
    st.pendingChoices = st.pendingChoices.filter((choice) =>
      choice.kind !== "seoul_move_barbarian" || (choice.options || []).length);
  }

  function queueStartOfTurnEffects(st, player) {
    if (!player) return;
    const pending = st.pendingChoices || [];

    // This path is shared by setup completion and ordinary turn rotation. The
    // first player therefore receives the same start-of-turn abilities as
    // everybody else instead of waiting a full round.
    if (hasLeader(player, "ottoman") && st.players.length > 1 &&
        !pending.some((c) => c.kind === "give_ibrahim" && c.playerId === player.id)) {
      queuePendingChoice(st, {
        kind: "give_ibrahim",
        playerId: player.id,
        title: "Ottoman: Give the Ibrahim Card?",
        source: "Ottoman",
        optional: true,
        options: st.players.filter((p) => p.id !== player.id)
          .map((p) => ({ id: p.id, label: p.name }))
          .concat([{ id: "keep", label: st.ibrahimHolder ? "Leave as is" : "Not this turn" }])
      });
    }

    if (hasLeader(player, "poland") && !player.polandFirstTurnUsed &&
        st.players.length > 1 &&
        !pending.some((c) => c.kind === "pick_rival_diplomacy" && c.playerId === player.id)) {
      queuePendingChoice(st, {
        kind: "pick_rival_diplomacy",
        playerId: player.id,
        title: "Poland: Take a Diplomacy Card",
        source: "Poland",
        options: st.players.filter((p) => p.id !== player.id)
          .map((p) => ({ id: p.id, label: p.name }))
      });
    }

    queueStartOfTurnCityStates(st, player);
    queueStartOfTurnWonders(st, player);
  }

  function queueStartOfTurnCityStates(st, player) {
    if (hasCityStateDiplomacy(player, "Geneva")) {
      const options = genevaSwapOptions(st, player);
      if (options.length) {
        queuePendingChoice(st, {
          kind: "geneva_return",
          playerId: player.id,
          title: "Geneva: Exchange a Diplomacy Card?",
          source: "Geneva",
          optional: true,
          options
        });
      }
    }
    if (hasCityStateDiplomacy(player, "Seoul")) {
      const options = seoulBarbarianMoves(st);
      if (options.length) {
        queuePendingChoice(st, {
          kind: "seoul_move_barbarian",
          playerId: player.id,
          title: "Seoul: Move a Barbarian?",
          source: "Seoul",
          optional: true,
          options
        });
      }
    }
  }

  // Wonders that trigger at the start of a player's turn. Each is optional, so
  // they queue a dismissible choice rather than resolving themselves.
  function queueStartOfTurnWonders(st, player) {
    const pid = player.id;

    // Great Zimbabwe: what is banked on the wonder can come out onto the row.
    queueZimbabweRelease(st, player);

    // Hanging Gardens: place 1 control on difficulty <= 4 next to a friendly city.
    if (hasWonder(st, pid, "Hanging Gardens")) {
      const spots = [];
      Object.entries(st.map.hexes).forEach(([k, h]) => {
        if (!h.active || h.terrain === "water" || h.city || h.control || h.barbarian ||
            h.cityState || (h.fortress && !h.city)) return;
        if (terrainDifficulty(h) > 4) return;
        if (!adjacentToFriendlyCity(st, h, pid)) return;
        spots.push(k);
      });
      if (spots.length) {
        queuePendingChoice(st, {
          kind: "place_control", playerId: pid,
          title: "Hanging Gardens: Place a Control Token",
          source: "Hanging Gardens", hexKeys: spots, optional: true
        });
      }
    }

    // Colosseum: reinforce 1 of your control tokens next to a friendly city.
    if (hasWonder(st, pid, "Colosseum")) {
      const spots = [];
      Object.entries(st.map.hexes).forEach(([k, h]) => {
        if (!h.control || h.control.ownerId !== pid || h.control.fortified) return;
        if (!adjacentToFriendlyCity(st, h, pid)) return;
        spots.push(k);
      });
      if (spots.length) {
        queuePendingChoice(st, {
          kind: "reinforce", playerId: pid,
          title: "Colosseum: Reinforce a Control Token",
          source: "Colosseum", hexKeys: spots, optional: true
        });
      }
    }

    // Forbidden City: remove 1 rival control token adjacent to a friendly space.
    if (hasWonder(st, pid, "Forbidden City")) {
      const spots = [];
      Object.entries(st.map.hexes).forEach(([k, h]) => {
        if (!h.control || h.control.ownerId === pid ||
            !canAffectRivalPiece(st, pid, h.control.ownerId)) return;
        if (armyGuards(st, k)) return;
        const nextToFriendly = hexNeighborKeys(h.q, h.r)
          .some((neighborKey) => isFriendlySpace(st.map.hexes[neighborKey], pid, st));
        if (nextToFriendly) spots.push(k);
      });
      if (spots.length) {
        queuePendingChoice(st, {
          kind: "remove_control", playerId: pid,
          title: "Forbidden City: Remove a Rival Control Token",
          source: "Forbidden City", hexKeys: spots, optional: true
        });
      }
    }

    // Eiffel Tower: name 2 of one rival's control tokens; they hand over
    // whichever of the two they choose.
    if (hasWonder(st, pid, "Eiffel Tower")) {
      const byOwner = {};
      Object.entries(st.map.hexes).forEach(([k, h]) => {
        if (!h.control || h.control.ownerId === pid || armyGuards(st, k) ||
            !canAffectRivalPiece(st, pid, h.control.ownerId)) return;
        (byOwner[h.control.ownerId] = byOwner[h.control.ownerId] || []).push(k);
      });
      const victims = Object.keys(byOwner).filter((id) => byOwner[id].length >= 2);
      if (victims.length) {
        queuePendingChoice(st, {
          kind: "eiffel_target", playerId: pid,
          title: "Eiffel Tower: Choose a Rival",
          source: "Eiffel Tower", optional: true,
          options: victims.map((id) => {
            const p = getPlayer(st, id);
            return { id, label: `${p ? p.name : "Rival"} (${byOwner[id].length} tokens)` };
          })
        });
      }
    }

    // Oracle: swap 2 adjacent cards in your focus row.
    if (hasWonder(st, pid, "Oracle")) {
      const opts = [];
      for (let i = 0; i < player.focusRow.length - 1; i++) {
        const a = player.focusRow[i], b = player.focusRow[i + 1];
        opts.push({ id: `${i}`, label: `${FOCUS_LABELS[a]} ↔ ${FOCUS_LABELS[b]}` });
      }
      if (opts.length) {
        queuePendingChoice(st, {
          kind: "swap_adjacent", playerId: pid,
          title: "Oracle: Swap 2 Adjacent Focus Cards",
          source: "Oracle", options: opts, optional: true
        });
      }
    }
  }

  // Attack-side wonder bonuses for an attack into toKey.
  function getWonderAttackBonus(st, playerId, toKey, defenderOwnerId) {
    if (!toKey) return 0;
    let bonus = 0;
    if (hasWonder(st, playerId, "Terracotta Army")) bonus += 2;
    if (hasWonder(st, playerId, "Alhambra")) bonus += 2;
    if (hasWonder(st, playerId, "Pentagon")) bonus += 2;
    if (hasWonder(st, playerId, "Big Ben")) bonus += 2 * countAdjacentCaravans(st, toKey, playerId);
    if (hasWonder(st, playerId, "Kremlin")) {
      const h = st.map.hexes[toKey];
      const defenderId = defenderOwnerId || (h ? hexOwnerAt(st, toKey) : null);
      // Rival spaces only — city-states are excluded.
      if (h && !h.cityState && defenderId && defenderId !== playerId &&
          countReinforced(st, playerId) > countReinforced(st, defenderId)) {
        bonus += 4;
      }
    }
    return bonus;
  }

  // Defence-side wonder bonuses for the owner of hexKey.
  function getWonderDefenseBonus(st, defenderId, hexKey) {
    if (!defenderId || !hexKey) return 0;
    let bonus = 0;
    if (hasWonder(st, defenderId, "Petra")) bonus += 2;
    if (hasWonder(st, defenderId, "Alhambra")) bonus += 2;
    if (hasWonder(st, defenderId, "Ruhr Valley")) bonus += 5;
    if (hasWonder(st, defenderId, "Huey Teocalli")) bonus += countAdjacentWater(st, hexKey);
    if (hasWonder(st, defenderId, "Big Ben")) bonus += 2 * countAdjacentCaravans(st, hexKey, defenderId);
    return bonus;
  }

  function hexOwnerAt(st, hexKey) {
    const h = st.map.hexes[hexKey];
    if (!h) return null;
    if (h.city) return h.city.ownerId;
    if (h.control) return h.control.ownerId;
    for (const p of st.players) {
      if (p.armies.some((u) => u.position === hexKey)) return p.id;
    }
    return null;
  }

  // France: extra culture tokens from your latest-era world wonder.
  function franceWonderBonus(st, playerId) {
    const rank = { ancient: 1, medieval: 2, modern: 3 };
    let best = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.city && h.city.ownerId === playerId && h.city.wonder) {
        best = Math.max(best, rank[h.city.wonder.era] || 0);
      }
    });
    return best;
  }

  // Inca: a token placed on a mountain may spawn a neighbour placement, which
  // itself chains if it lands on another mountain (handled in the resolver).
  // A control token can spill onto a neighbouring space, and that placement may
  // chain again. Inca spills from mountains onto any space; Stonehenge spills
  // from hills onto further hills. `terrain` restricts the eligible neighbours.
  function queueControlChain(st, player, fromKey, opts) {
    const spots = hexNeighborKeys(parseQ(fromKey), parseR(fromKey)).filter((nk) => {
      const nh = st.map.hexes[nk];
      if (!nh || !nh.active || nh.terrain === "water") return false;
      if (nh.city || nh.control || nh.barbarian || nh.cityState || (nh.fortress && !nh.city)) return false;
      return opts.terrain ? nh.terrain === opts.terrain : true;
    });
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "place_control",
      playerId: player.id,
      title: opts.title,
      source: opts.source,
      hexKeys: spots,
      optional: true
    });
  }
  const queueIncaChain = (st, player, key) =>
    queueControlChain(st, player, key, { source: "inca", title: "Inca: Mountain Expansion" });
  function queueStonehengeChain(st, player, fromKey) {
    const alreadyQueued = new Set((st.pendingChoices || [])
      .filter((choice) => choice.kind === "place_control" && choice.source === "Stonehenge")
      .flatMap((choice) => choice.hexKeys || []));
    const spots = hexNeighborKeys(parseQ(fromKey), parseR(fromKey)).filter((neighborKey) => {
      if (alreadyQueued.has(neighborKey)) return false;
      const neighbor = st.map.hexes[neighborKey];
      return neighbor && neighbor.active && neighbor.terrain === "hill" &&
        !neighbor.city && !neighbor.control && !neighbor.barbarian && !neighbor.cityState &&
        !(neighbor.fortress && !neighbor.city);
    });
    // "1 or more" is a set of independent optional placements. Queuing one
    // choice per adjacent hill lets the owner take any number of them, while
    // each hill that is actually taken can start its own chain.
    spots.forEach((hexKey) => queuePendingChoice(st, {
      kind: "place_control",
      playerId: player.id,
      title: "Stonehenge: Place on an Adjacent Hill?",
      source: "Stonehenge",
      originKey: fromKey,
      hexKeys: [hexKey],
      optional: true
    }));
  }

  // Is this space on the rim of the explored map? (same test exploration uses)
  function isEdgeSpace(st, hex) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => {
      const nh = st.map.hexes[nk];
      return !nh || !nh.active;
    });
  }

  // Chichen Itza lifts the adjacency requirement for empty forest spaces that
  // are NOT next to one of your cities.
  function chichenAllows(st, playerId, h) {
    return h.terrain === "forest" && hasWonder(st, playerId, "Chichen Itza") &&
      !adjacentToFriendlyCity(st, h, playerId);
  }

  // One focus-card upgrade prompt. Queued one at a time so each prompt lists
  // the tiers as they stand after the previous one resolved.
  function queueCardUpgrade(st, player, opts) {
    const types = FOCUS_TYPES.filter((f) => {
      const t = player.cardTiers[f] || 1;
      return t < 4 && (!opts.onlyTier || t === opts.onlyTier);
    });
    if (!types.length) return;
    const options = [];
    types.forEach((f) => {
      const next = (player.cardTiers[f] || 1) + 1;
      options.push({ id: f, label: FOCUS_LABELS[f] + " to tier " + next });
      const uniq = uniqueUpgradeOption(player, f, next);
      if (uniq) options.push(uniq);
    });
    queuePendingChoice(st, {
      kind: "science_upgrade",
      playerId: player.id,
      title: opts.title,
      source: opts.source,
      onlyTier: opts.onlyTier || null,
      // Pyramids says "choose UP TO 3" and Porcelain Tower "replace UP TO 2",
      // so 0, 1 and 2 are all legal answers and the player has to be able to
      // stop. Without this the prompt could not be dismissed and both wonders
      // forced their maximum. Declining ends the run: the chain is only queued
      // from the accepting branch below.
      optional: !!opts.optional,
      chain: opts.remaining > 1 ? Object.assign({}, opts, { remaining: opts.remaining - 1 }) : null,
      options: options
    });
  }

  // Leader combat bonus for an attack into toKey (shown in the combat preview
  // and applied by the engine so both always agree).
  // Diplomacy cards you hold from a rival. You get nothing from your own
  // (base p13), which falls out for free: a card is only in your hand because
  // somebody else gave it to you.
  function heldDiplomacy(player, cardId) {
    return (player && player.diplomacy || []).filter((d) => d.cardId === cardId);
  }

  // Joint War: "+2 when attacking unless you are attacking the player who gave
  // you this card." Two Joint Wars from two rivals both apply when you attack
  // a third, which is what the printed cards say and what makes them worth
  // collecting.
  function getDiplomacyAttackBonus(st, playerId, toKey, defenderOwnerId) {
    const player = getPlayer(st, playerId);
    if (!player || !toKey) return 0;
    const against = defenderOwnerId || hexOwnerAt(st, toKey);
    return heldDiplomacy(player, "joint_war")
      .filter((d) => !against || d.fromId !== against).length * 2;
  }

  // Defensive Pact, from the defender's side: "+2 when defending unless the
  // player who gave you this card is attacking."
  function getDiplomacyDefenseBonus(st, defenderId, attackerId) {
    const player = getPlayer(st, defenderId);
    if (!player) return 0;
    return heldDiplomacy(player, "defensive_pact")
      .filter((d) => d.fromId !== attackerId).length * 2;
  }

  // Non-Aggression Pact: "You cannot attack or destroy the pieces of the player
  // who gave you this card."
  function nonAggressionWith(st, playerId, otherId) {
    const player = getPlayer(st, playerId);
    if (!player || !otherId || playerId === otherId) return false;
    return heldDiplomacy(player, "non_aggression").some((d) => d.fromId === otherId);
  }

  // Non-Aggression Pact: "You cannot attack or destroy the pieces of the player
  // who gave you this card." Attacking and destroying are what it names.
  // Flipping a reinforced control token to its unreinforced side is neither -
  // the piece stays on the board and stays theirs - so a pact does not forbid
  // it, and suffering one does not hand back the card.
  //
  // Mass Media and Nuclear Power each do BOTH in one effect, which is why the
  // difference has to be a property of the interference rather than of the
  // card: Mass Media replaces an unreinforced token but only flips a reinforced
  // one, and a nuclear blast destroys the unreinforced and flips the rest.
  const PIECE_INTERFERENCE = {
    attack: true,        // a fight
    destroy: true,       // removed from the board
    replace: true,       // removed, and a rival token takes the space
    transfer: true,      // taken out of its owner's hands
    unreinforce: false,  // flipped over; still theirs, still there
    reinforce: false
  };
  function pactForbids(st, actorId, ownerId, interference) {
    if (!ownerId || actorId === ownerId) return false;
    if (!PIECE_INTERFERENCE[interference]) return false;
    return nonAggressionWith(st, actorId, ownerId);
  }
  // The shorthand for the aggressive cases, which is what almost every caller
  // means: may I take this piece off the board or fight it?
  function canAffectRivalPiece(st, actorId, ownerId) {
    return !pactForbids(st, actorId, ownerId, "destroy");
  }

  function queueNonAggressionResponse(st, victimId, aggressorId, source) {
    const victim = getPlayer(st, victimId);
    if (!victim || !aggressorId || victimId === aggressorId) return false;
    const held = heldDiplomacy(victim, "non_aggression")
      .find((card) => card.fromId === aggressorId);
    if (!held) return false;
    if ((st.pendingChoices || []).some((choice) => choice.kind === "non_aggression_swap" &&
        choice.playerId === victimId && choice.fromId === aggressorId)) return false;
    queuePendingChoice(st, {
      kind: "non_aggression_swap",
      playerId: victimId,
      fromId: aggressorId,
      cardId: held.cardId,
      title: "Non-Aggression Pact: Return It and Move Military?",
      source: source || "Non-Aggression Pact",
      optional: true,
      options: FOCUS_TYPES.filter((type) => type !== "military")
        .map((type) => ({ id: type, label: `Swap Military with ${FOCUS_LABELS[type]}` }))
    });
    return true;
  }

  // Open Borders: "The cities and control tokens of the player who gave you
  // this card are friendly to you for the purposes of your districts' effects
  // and your cities' maturity."
  function openBordersWith(st, playerId, otherId) {
    const player = getPlayer(st, playerId);
    if (!player || !otherId || playerId === otherId) return false;
    return heldDiplomacy(player, "open_borders").some((d) => d.fromId === otherId);
  }

  function countCarthageSupports(st, playerId, defendingKey) {
    const center = st.map.hexes[defendingKey];
    if (!center) return 0;
    const player = getPlayer(st, playerId);
    // The square cardboard city-state tokens gained by conquest are not the
    // unconquered city-state spaces on the map. They contribute wherever the
    // battle happens; only the friendly-city half is range-limited.
    let count = Number(player && player.cityStateTokens && player.cityStateTokens.length || 0);
    Object.values(st.map.hexes).forEach((hex) => {
      if (!hex || !hex.active || hexDist(center, hex) > 2) return;
      if (isFriendlyCity(st, hex, playerId)) count++;
    });
    return count;
  }

  function getCityStateAttackParts(st, player, toKey, defender) {
    if (!player || !toKey || !defender) return [];
    const parts = [];
    const target = st.map.hexes[toKey];
    if (hasCityStateDiplomacy(player, "Kabul") &&
        (defender.type === "city" || defender.type === "citystate") &&
        !(target && target.cityState && target.cityState.name === "Kabul")) {
      parts.push({ label: "Kabul diplomacy", value: 3, category: "diplomacy" });
    }
    if (hasCityStateDiplomacy(player, "Carthage") &&
        !(target && target.cityState && target.cityState.name === "Carthage")) {
      const value = countCarthageSupports(st, player.id, toKey);
      if (value) parts.push({ label: "Carthage diplomacy", value, category: "diplomacy" });
    }
    return parts;
  }

  function getCityStateDefenseBonus(st, playerId, defendingKey) {
    const player = getPlayer(st, playerId);
    return hasCityStateDiplomacy(player, "Carthage")
      ? countCarthageSupports(st, playerId, defendingKey) : 0;
  }

  function getLeaderAttackBonus(st, playerId, toKey, defenderOwnerId) {
    const player = getPlayer(st, playerId);
    if (!player || !toKey) return 0;
    let bonus = 0;
    const h = st.map.hexes[toKey];
    // Scythia: +3 when attacking a grassland or hill space.
    if (hasLeader(player, "scythia") && h && (h.terrain === "grass" || h.terrain === "hill")) bonus += 3;
    // Ottoman: +2 against the player holding the Ibrahim card.
    const against = defenderOwnerId || hexOwnerAt(st, toKey);
    if (hasLeader(player, "ottoman") && st.ibrahimHolder && against === st.ibrahimHolder) bonus += 2;
    // World wonders the attacker controls.
    bonus += getWonderAttackBonus(st, playerId, toKey, against);
    // Joint War pacts held against anyone but the defender.
    bonus += getDiplomacyAttackBonus(st, playerId, toKey, against);
    return bonus;
  }

  // Every number that goes into the attacker's strength, itemised, because a
  // total is not a reason. The parts travel with the combat so both players can
  // read the same sum: "military card 3, +2 vs barbarian, Scythia +3" rather
  // than a bare 8 that neither side can check.
  //
  // getLeaderAttackBonus returns one number covering the civ ability, the
  // wonders and the pacts. Those are three different reasons that appear and
  // disappear independently, so they are re-derived here as separate lines. All
  // of them keep category "leader" so that st.combat.leaderBonus stays the sum
  // getLeaderAttackBonus would have given.
  function getAttackCombatParts(st, player, toKey, defender, slot) {
    const parts = [{ label: "military card", value: slot, category: "card" }];
    const h = st.map.hexes[toKey];

    const tierBonus = getMilitaryCombatBonus(player, defender && defender.type);
    if (tierBonus) {
      // Iron Working's +2 is conditional, so it has to say what earned it.
      const vsBarb = defender && defender.type === "barbarian" &&
        Number(((CARD_DEFS.military || {})[getCardTier(player, "military")] || {}).vsBarbarian || 0);
      parts.push({
        label: vsBarb ? `${getCardName(player, "military")} vs barbarian` : getCardName(player, "military"),
        value: tierBonus, category: "card"
      });
    }

    if (hasLeader(player, "scythia") && h && (h.terrain === "grass" || h.terrain === "hill")) {
      parts.push({ label: "Scythia (grass/hill)", value: 3, category: "leader" });
    }
    const against = defender && defender.ownerId || hexOwnerAt(st, toKey);
    if (hasLeader(player, "ottoman") && st.ibrahimHolder && against === st.ibrahimHolder) {
      parts.push({ label: "Ottoman (vs Ibrahim)", value: 2, category: "leader" });
    }
    const wonderBonus = getWonderAttackBonus(st, player.id, toKey, against);
    if (wonderBonus) parts.push({ label: "world wonders", value: wonderBonus, category: "leader" });
    const pactBonus = getDiplomacyAttackBonus(st, player.id, toKey, against);
    if (pactBonus) parts.push({ label: "joint war pacts", value: pactBonus, category: "leader" });
    getCityStateAttackParts(st, player, toKey, defender).forEach((part) => parts.push(part));

    return parts;
  }

  function getCityRange(player) {
    const tier = getCardTier(player, "industry");
    return CARD_TIERS.industry.cityRange[tier - 1];
  }

  function hasCityStateDiplomacy(player, cityStateName) {
    return !!player && (player.diplomacy || [])
      .some((card) => card.fromCityState === cityStateName);
  }

  function naturalWonderTurnId(st) {
    if (!st || !st.turn) return "no-turn";
    const activeId = st.turn.order && st.turn.order[st.turn.index];
    return `${Number(st.turn.round || 0)}:${Number(st.turn.index || 0)}:${activeId || "none"}`;
  }

  // Build the registry entry for every natural wonder space the board has, so
  // a game created before the registry existed, or one whose map has grown by
  // exploration, still has a token to own.
  function ensureNaturalWonderRegistry(st) {
    if (!st || !st.map || !st.map.hexes) return;
    st.naturalWonders = st.naturalWonders || {};
    Object.entries(st.map.hexes).forEach(([hexKey, hex]) => {
      if (!hex) return;
      // Older states only ever carried the token field.
      if (!hex.naturalWonderSpace && hex.naturalWonder) {
        hex.naturalWonderSpace = hex.naturalWonder;
      }
      const name = hex.naturalWonderSpace;
      if (!name || st.naturalWonders[name]) return;
      st.naturalWonders[name] = {
        name,
        resource: NATURAL_WONDER_RESOURCES[name] || null,
        homeKey: hexKey,
        // A state written under the old model kept the token on the hex and
        // read ownership from the control marker there. Carry that reading
        // over once, so a save in progress does not lose a claimed wonder.
        ownerId: hex.naturalWonder
          ? null
          : ((hex.control && hex.control.ownerId) || (hex.city && hex.city.ownerId) || null),
        spaceControllerId: (hex.control && hex.control.ownerId) ||
          (hex.city && hex.city.ownerId) || null,
        focusCard: null
      };
    });
  }

  // Base rules: "when a player places a control token on a natural wonder
  // space, that player takes the natural wonder token and places it on their
  // leader sheet", and an attacker who defeats the control token of the player
  // holding one takes that token from them.
  //
  // Two different events, and the difference matters: taking a space whose
  // token was carried off several turns ago gains nothing, because there is no
  // token there to take. `spaceControllerId` is what tells them apart - it
  // records who held the space last time we looked, so a change of controller
  // away from the current owner is a conquest and a change from nobody is not.
  //
  // Ownership survives losing the space. The token is on a leader sheet, not
  // on the board, so destroying somebody's control marker does not reach it.
  function syncNaturalWonderTokens(st) {
    if (!st || !st.map || !st.map.hexes) return;
    ensureNaturalWonderRegistry(st);
    Object.values(st.naturalWonders).forEach((entry) => {
      const hex = st.map.hexes[entry.homeKey];
      if (!hex) return;
      const controllerId = (hex.control && hex.control.ownerId) ||
        (hex.city && hex.city.ownerId) || null;
      const previous = entry.spaceControllerId || null;
      entry.spaceControllerId = controllerId;
      if (!controllerId || controllerId === entry.ownerId) return;
      if (entry.ownerId === null) {
        // The token is still on its space: whoever just took the space takes it.
        entry.ownerId = controllerId;
        entry.focusCard = null;
        hex.naturalWonder = null;
        if (hex.resource === "wonder") hex.resource = null;
        const taker = getPlayer(st, controllerId);
        if (taker) log(st, `${taker.name} took the ${entry.name} natural wonder token.`);
        queueAmericaWonderCard(st, controllerId, entry.name, "America: gained");
        return;
      }
      if (previous === entry.ownerId) {
        // The holder was driven off the space: the token goes with it.
        const from = getPlayer(st, entry.ownerId);
        const to = getPlayer(st, controllerId);
        entry.ownerId = controllerId;
        // The token leaves whatever card it was on and, for an American new
        // owner, goes onto one of theirs.
        entry.focusCard = null;
        if (from && to) {
          log(st, `${to.name} took the ${entry.name} natural wonder token from ${from.name}.`);
        }
        queueAmericaWonderCard(st, controllerId, entry.name, "America: gained");
      }
      // Otherwise the space had been abandoned before this player arrived, and
      // there was nothing on it to pick up.
    });
  }

  // Natural-wonder ownership is explicit: the token is off the map and on a
  // leader sheet, so this reads the registry rather than the board. `hexKey` is
  // kept as the token's stable identity (the space it came from) because that
  // is what the payment payloads and the UI already name it by.
  function getControlledNaturalWonders(st, playerId) {
    const turnId = naturalWonderTurnId(st);
    const usage = st && st.naturalWonderUsage || {};
    const held = [];
    Object.values((st && st.naturalWonders) || {}).forEach((entry) => {
      if (!entry || entry.ownerId !== playerId) return;
      if (!RESOURCES.includes(entry.resource)) return;
      held.push({
        hexKey: entry.homeKey,
        name: entry.name,
        resource: entry.resource,
        focusCard: entry.focusCard || null,
        usedThisTurn: usage[entry.name] === turnId
      });
    });
    return held.sort((a, b) => a.name.localeCompare(b.name));
  }

  // America: "When you gain or spend a natural wonder token, place it on any
  // card in your focus row. You can spend a natural wonder token on a focus
  // card either as a trade token on that card or as a resource."
  //
  // So an American natural wonder token has a HOME CARD, and while it sits
  // there it can pay for that card exactly like a trade token on it. Spending
  // it does not consume it - natural wonder tokens are never consumed, only
  // exhausted for the turn - so the card it goes back on is chosen again.
  const isAmerica = (st, playerId) => hasLeader(getPlayer(st, playerId), "america");

  function americaTokensOnCard(st, playerId, cardType) {
    if (!isAmerica(st, playerId)) return [];
    return getControlledNaturalWonders(st, playerId)
      .filter((entry) => entry.focusCard === cardType && !entry.usedThisTurn);
  }

  // Ask where a token goes. Raised when one is gained and again when one is
  // spent, which is what the card prints.
  function queueAmericaWonderCard(st, playerId, tokenName, reason) {
    const player = getPlayer(st, playerId);
    if (!player || !isAmerica(st, playerId)) return;
    queuePendingChoice(st, {
      kind: "natural_wonder_card",
      playerId,
      tokenName,
      title: `America: Place ${tokenName} on a Focus Card`,
      source: reason || "America",
      options: (player.focusRow || FOCUS_TYPES).map((type) => ({
        id: type, label: FOCUS_LABELS[type] || type
      }))
    });
  }

  function validateOrdinaryResourceSpend(player, resources, eligibleResources) {
    const normalized = {};
    let count = 0;
    for (const [resource, raw] of Object.entries(resources || {})) {
      if (!RESOURCES.includes(resource)) {
        return { ok: false, code: "resource_type_invalid", message: `${resource} is not a resource type.` };
      }
      const amount = Number(raw);
      if (!Number.isInteger(amount) || amount < 0) {
        return { ok: false, code: "resource_amount_invalid", message: "Resource payments must use whole non-negative tokens." };
      }
      if (!amount) continue;
      if (eligibleResources && !eligibleResources.includes(resource)) {
        return {
          ok: false, code: "resource_not_eligible",
          message: `${resource} is not printed on this world wonder.`
        };
      }
      if (!player || (player.resources[resource] || 0) < amount) {
        return {
          ok: false, code: "resource_unavailable",
          message: `You do not have ${amount} ${resource} resource token${amount === 1 ? "" : "s"}.`
        };
      }
      normalized[resource] = amount;
      count += amount;
    }
    return { ok: true, resources: normalized, count };
  }

  function validateNaturalWonderSpend(st, player, wonder, hexKeys) {
    if (hexKeys !== undefined && !Array.isArray(hexKeys)) {
      return { ok: false, code: "natural_wonder_payment_invalid", message: "Natural-wonder payments must identify their map tokens." };
    }
    const requested = Array.isArray(hexKeys) ? hexKeys : [];
    if (new Set(requested).size !== requested.length) {
      return { ok: false, code: "natural_wonder_duplicate", message: "The same natural wonder cannot be used twice." };
    }
    // A token is identified by the space it came from or by its own name; it
    // is no longer on the board, so neither is a lookup into the map.
    const controlled = new Map();
    getControlledNaturalWonders(st, player && player.id).forEach((entry) => {
      controlled.set(entry.hexKey, entry);
      controlled.set(entry.name, entry);
    });
    const eligible = wonder && Array.isArray(wonder.eligibleResources)
      ? wonder.eligibleResources : (WONDER_RESOURCE_ELIGIBILITY[wonder && wonder.name] || []);
    const entries = [];
    for (const hexKey of requested) {
      const entry = controlled.get(hexKey);
      if (!entry) {
        return {
          ok: false, code: "natural_wonder_not_controlled",
          message: "That natural-wonder token is not currently under your control."
        };
      }
      if (entry.usedThisTurn) {
        return {
          ok: false, code: "natural_wonder_already_used",
          message: `${entry.name} has already contributed during this turn.`
        };
      }
      if (!eligible.includes(entry.resource)) {
        return {
          ok: false, code: "natural_wonder_not_eligible",
          message: `${entry.name}'s ${entry.resource} icon is not printed on ${wonder.name}.`
        };
      }
      entries.push(entry);
    }
    return { ok: true, entries, count: entries.length };
  }

  function markNaturalWondersUsed(st, entries) {
    st.naturalWonderUsage = st.naturalWonderUsage || {};
    const turnId = naturalWonderTurnId(st);
    (entries || []).forEach((entry) => { st.naturalWonderUsage[entry.name] = turnId; });
  }

  // All true cost modifiers meet here. Production bonuses are intentionally
  // kept out of this list; the UI can show both without treating +production
  // as if it changed the printed price.
  function calculateWonderCost(wonderName, player, st) {
    const wonder = getWonderByName(wonderName);
    const baseCost = wonder ? Number(wonder.cost || 0) : 7;
    const modifiers = [];
    if (hasLeader(player, "egypt")) {
      modifiers.push({ source: "Egypt", label: "Egypt civilization ability", value: -1 });
    }
    if (st && getWonderToken(st, wonderName)) {
      modifiers.push({ source: "event", label: "trade token on faceup wonder", value: -1 });
    }
    if (st && hasCityStateDiplomacy(player, "Brussels")) {
      const mature = countDeveloped(st, player.id);
      if (mature) modifiers.push({
        source: "Brussels", label: `${mature} mature ${mature === 1 ? "city" : "cities"}`, value: -mature
      });
    }
    if (st && wonder && hasCityStateDiplomacy(player, "Buenos Aires") &&
        countWondersByType(st, player.id, wonder.type) === 0) {
      modifiers.push({ source: "Buenos Aires", label: `no ${wonder.type} wonder controlled`, value: -2 });
    }
    const modifierTotal = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
    // Neither printed reducer specifies a minimum. A heavily reduced wonder
    // can therefore reach zero production cost.
    return {
      wonderName,
      baseCost,
      modifiers,
      modifierTotal,
      finalCost: Math.max(0, baseCost + modifierTotal)
    };
  }

  function getWonderCost(wonderName, player, st) {
    return calculateWonderCost(wonderName, player, st).finalCost;
  }

  // The dial's trade token, if this wonder is the faceup card of its deck.
  function getWonderToken(st, wonderName) {
    if (!st || !st.wonderDecks) return 0;
    const entry = Object.values(st.wonderDecks).find((d) =>
      (d.revealed || (d.deck && d.deck[0])) === wonderName);
    return entry ? (entry.token || 0) : 0;
  }

  function getWonderByName(wonderName) {
    return ALL_WONDERS.find((w) => w.name === wonderName) || null;
  }

  function getWonderBaseProduction(st, player) {
    const slot = getSlotValue(player, "industry", st);
    const tier = getCardTier(player, "industry");
    const printed = (CARD_DEFS.industry || {})[tier] || {};
    // Nationalism III explicitly contributes 7, rather than 5, when it is
    // treated as resolving in the fifth slot.
    const value = !getActiveUniqueCard(player, "industry") && slot === 5 &&
      Number(printed.wonderSlot5Production || 0) > 0
      ? Number(printed.wonderSlot5Production) : slot;
    return { slot, value, label: value === slot ? `Industry slot ${slot}` : `Nationalism in slot 5` };
  }

  function countPlayerDistricts(st, playerId) {
    return Object.values(st && st.map && st.map.hexes || {}).filter((hex) =>
      hex.control && hex.control.ownerId === playerId && hex.control.district).length;
  }

  // Shared preview + authoritative validator for world-wonder production.
  // `resources` are consumed ordinary tokens; `naturalWonders` are physical
  // map-token keys that are only marked used for this turn.
  function calculateWonderProduction(st, player, wonderName, payment) {
    payment = payment || {};
    const wonder = getWonderByName(wonderName);
    if (!wonder) {
      return { ok: false, code: "wonder_missing", message: "That world wonder does not exist." };
    }
    const eligibleResources = Array.isArray(wonder.eligibleResources)
      ? wonder.eligibleResources : (WONDER_RESOURCE_ELIGIBILITY[wonder.name] || []);
    const ordinary = validateOrdinaryResourceSpend(player, payment.resources, eligibleResources);
    if (!ordinary.ok) return ordinary;
    const natural = validateNaturalWonderSpend(st, player, wonder, payment.naturalWonders);
    if (!natural.ok) return natural;
    const trade = validateFocusTradeSpend(st, player, "industry", payment.tradeSpent,
      payment.tradeResources, ordinary.resources);
    if (!trade.ok) return trade;

    const base = getWonderBaseProduction(st, player);
    const resourceCount = ordinary.count + natural.count;
    const eachResource = CFG.resourceProdValue + (uniqueInPlay(player, "nubia") ? 1 : 0);
    const districtBonus = uniqueInPlay(player, "japan") ? countPlayerDistricts(st, player.id) : 0;
    const totalProduction = base.value + trade.spent + resourceCount * eachResource + districtBonus;
    const cost = calculateWonderCost(wonder.name, player, st);
    return {
      ok: true,
      wonder,
      cost,
      eligibleResources: eligibleResources.slice(),
      resources: ordinary.resources,
      naturalWonders: natural.entries,
      tradeSpent: trade.spent,
      tradePayment: trade,
      production: {
        base: base.value,
        slot: base.slot,
        trade: trade.spent,
        ordinaryResources: ordinary.count,
        naturalWonderResources: natural.count,
        eachResource,
        districtBonus,
        total: totalProduction
      },
      affordable: totalProduction >= cost.finalCost,
      shortfall: Math.max(0, cost.finalCost - totalProduction)
    };
  }

  // City and wonder building share the same focus-card payment rules, but
  // city resources are not restricted by icons printed on a wonder card.
  // Keeping this calculator next to the wonder calculator prevents the UI and
  // authoritative action from inventing different production totals.
  function calculateIndustryCityProduction(st, player, payment) {
    payment = payment || {};
    const ordinary = validateOrdinaryResourceSpend(player, payment.resources);
    if (!ordinary.ok) return ordinary;
    const trade = validateFocusTradeSpend(st, player, "industry", payment.tradeSpent,
      payment.tradeResources, ordinary.resources);
    if (!trade.ok) return trade;
    const base = getSlotValue(player, "industry", st);
    const total = base + trade.spent + ordinary.count * CFG.resourceProdValue;
    return {
      ok: true,
      resources: ordinary.resources,
      tradeSpent: trade.spent,
      tradePayment: trade,
      production: {
        base,
        trade: trade.spent,
        ordinaryResources: ordinary.count,
        eachResource: CFG.resourceProdValue,
        total
      }
    };
  }

  function getVisibleWonders(st) {
    if (!st || !st.wonderDecks) return [];
    return Object.entries(st.wonderDecks).map(([type, data]) => {
      const name = data.revealed || (data.deck && data.deck[0]);
      const wonder = getWonderByName(name);
      const left = Number.isInteger(data.remainingCount)
        ? data.remainingCount : (Array.isArray(data.deck) ? data.deck.length : 0);
      return wonder ? { ...wonder, type, token: data.token || 0, left } : null;
    }).filter(Boolean);
  }

  function advanceWonderDeck(st, type, builtName) {
    const deckState = st.wonderDecks && st.wonderDecks[type];
    if (!deckState) return;
    const idx = deckState.deck.indexOf(builtName);
    if (idx >= 0) deckState.deck.splice(idx, 1);
    deckState.built = deckState.built || [];
    deckState.built.push(builtName);
    deckState.revealed = deckState.deck[0] || null;
    deckState.token = 0;   // the token on a built wonder goes back to the supply
  }
  function getSlotIndex(player, cardType) { return player.focusRow.indexOf(cardType); }

  function terrainDifficulty(h) {
    if (h.resource === "wonder") return 5;
    return TERRAIN[h.terrain] || 1;
  }

  // Japan: during your turn, desert and mountain spaces adjacent to water or
  // the edge of the map are treated as terrain difficulty 3.
  function japanCoastalDifficulty(st, h, player, d) {
    if (!hasLeader(player, "japan")) return d;
    if (h.terrain !== "desert" && h.terrain !== "mountain") return d;
    if (h.resource === "wonder") return d;
    const coastalOrEdge = hexNeighborKeys(h.q, h.r).some((nk) => {
      const nh = st.map.hexes[nk];
      return !nh || !nh.active || nh.terrain === "water";
    });
    return coastalOrEdge ? Math.min(d, 3) : d;
  }

  // Terrain difficulty as seen by a specific player for a specific purpose.
  // Leader sheets and diplomacy cards bend the base numbers here rather than
  // at each UI/action call site.
  function placementDifficulty(st, h, player, context) {
    let difficulty = japanCoastalDifficulty(st, h, player, terrainDifficulty(h));
    const culturePlacement = context === "culture" || context === "growth_control" ||
      context === "industry_control" || context === "control";
    const industryCity = context === "industry_city" || context === "city";

    // Kumasi applies only while resolving Industry or Culture, not to Growth's
    // district/control steps or unrelated wonder effects.
    if (h.terrain === "forest" && hasCityStateDiplomacy(player, "Kumasi") &&
        (context === "culture" || context === "industry_control" || industryCity)) {
      difficulty = 1;
    }
    // Auckland changes city-building spaces adjacent to water and is separate
    // from its permission to count a range through water.
    if (industryCity && hasCityStateDiplomacy(player, "Auckland") &&
        hexNeighborKeys(h.q, h.r).some((nk) => {
          const neighbor = st.map.hexes[nk];
          return neighbor && neighbor.active && neighbor.terrain === "water";
        })) {
      difficulty = 1;
    }
    if (culturePlacement && hasCityStateDiplomacy(player, "Mohenjo Daro")) {
      difficulty -= 1;
    }
    return Math.max(0, difficulty);
  }

  function moveDifficulty(st, h, player, unitType) {
    return japanCoastalDifficulty(st, h, player, terrainDifficulty(h));
  }

  function validControlHexes(st, playerId, maxTerrain) {
    const player = getPlayer(st, playerId);
    const humanism = uniqueInPlay(player, "france");
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (placementDifficulty(st, h, player, "culture") > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || h.control || (h.fortress && !h.city)) return;
      // Humanism replaces the usual friendly-CITY restriction with friendly
      // SPACE adjacency. Every other Culture card keeps the printed city gate.
      const adjacent = humanism
        ? hexNeighborKeys(h.q, h.r).some((neighborKey) =>
            isFriendlySpace(st.map.hexes[neighborKey], playerId, st))
        : adjacentToFriendlyCity(st, h, playerId);
      if (!adjacent && !chichenAllows(st, playerId, h)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  // A focus-card payment is expressed as a total number of trade equivalents
  // plus (optionally) the ordinary resource tokens being substituted through
  // Palenque. Keeping the composition explicit is important: the resource is
  // consumed, a natural-wonder token is never legal here, and the remaining
  // amount must actually exist on the focus card.
  function validateFocusTradeSpend(st, player, cardType, tradeSpent, tradeResources, reservedResources) {
    const spent = tradeSpent === undefined ? 0 : Number(tradeSpent);
    if (!Number.isInteger(spent) || spent < 0) {
      return {
        ok: false, code: "invalid_trade_spend",
        message: "Trade spending must be a whole non-negative number."
      };
    }

    const resources = validateOrdinaryResourceSpend(player, tradeResources);
    if (!resources.ok) return resources;
    if (resources.count && !hasCityStateDiplomacy(player, "Palenque")) {
      return {
        ok: false, code: "palenque_required",
        message: "Only Palenque lets ordinary resource tokens stand in for focus-card trade tokens."
      };
    }
    if (resources.count > spent) {
      return {
        ok: false, code: "trade_resource_overpayment",
        message: "A substituted resource token must replace one of the selected trade tokens."
      };
    }

    const reserved = reservedResources || {};
    for (const resource of RESOURCES) {
      const combined = Number(resources.resources[resource] || 0) + Number(reserved[resource] || 0);
      if (combined > Number(player && player.resources[resource] || 0)) {
        return {
          ok: false, code: "resource_double_spent",
          message: `The same ${resource} token cannot pay two parts of this focus action.`
        };
      }
    }

    const focusSpent = spent - resources.count;
    const printedTrade = Number(player && player.trade && player.trade[cardType] || 0);
    // America's natural wonder tokens sitting on THIS card spend like trade
    // tokens on it. They are the last thing used, so an ordinary token is never
    // saved at the cost of exhausting a wonder that could have paid elsewhere.
    const americaTokens = st ? americaTokensOnCard(st, player && player.id, cardType) : [];
    const available = printedTrade + americaTokens.length;
    if (focusSpent > available) {
      const substitutes = hasCityStateDiplomacy(player, "Palenque")
        ? Object.values(player && player.resources || {}).reduce((sum, count) => sum + Number(count || 0), 0)
        : 0;
      return {
        ok: false, code: "invalid_trade_spend",
        message: `This payment has only ${available} ${cardType} trade token${available === 1 ? "" : "s"}` +
          (substitutes ? ` plus ${substitutes} Palenque resource substitute${substitutes === 1 ? "" : "s"}.` : ".")
      };
    }
    const fromWonders = Math.max(0, focusSpent - printedTrade);
    return {
      ok: true,
      spent,
      focusSpent,
      // How much of focusSpent comes off the printed card, and which natural
      // wonder tokens cover the rest. Kept apart so the deduction cannot take
      // trade the card never had.
      printedSpent: focusSpent - fromWonders,
      naturalWonderTokens: americaTokens.slice(0, fromWonders).map((e) => e.name),
      resources: resources.resources,
      resourceCount: resources.count
    };
  }

  // Growth can ask for a maximum payment before the player knows how many
  // legal markers they will actually reinforce. Trim that reserved payment to
  // the amount truly used, preferring printed trade tokens so an unneeded
  // Palenque resource is not burned accidentally.
  function trimFocusTradePayment(payment, amount) {
    const wanted = Math.max(0, Math.min(Number(amount || 0), Number(payment && payment.spent || 0)));
    const focusSpent = Math.min(wanted, Number(payment && payment.focusSpent || 0));
    let resourcesLeft = wanted - focusSpent;
    const resources = {};
    for (const resource of RESOURCES) {
      if (resourcesLeft <= 0) break;
      const take = Math.min(resourcesLeft, Number(payment && payment.resources && payment.resources[resource] || 0));
      if (take) resources[resource] = take;
      resourcesLeft -= take;
    }
    return {
      ok: true,
      spent: wanted - Math.max(0, resourcesLeft),
      focusSpent,
      resources,
      resourceCount: Object.values(resources).reduce((sum, count) => sum + count, 0)
    };
  }

  function spendFocusTradePayment(player, cardType, payment, st) {
    const normalized = payment && typeof payment === "object"
      ? payment
      : { spent: Number(payment || 0), focusSpent: Number(payment || 0), resources: {} };
    const focusSpent = Number(normalized.focusSpent === undefined
      ? normalized.spent || 0 : normalized.focusSpent);
    // Only the part the printed card actually covers comes off the card; the
    // rest was paid by America's natural wonder tokens, which are exhausted
    // for the turn rather than spent away.
    const fromCard = normalized.printedSpent === undefined
      ? focusSpent : Number(normalized.printedSpent || 0);
    if (fromCard > 0) {
      player.trade[cardType] = Math.max(0, Number(player.trade[cardType] || 0) - fromCard);
    }
    const wonders = normalized.naturalWonderTokens || [];
    if (st && wonders.length) {
      markNaturalWondersUsed(st, wonders.map((name) => ({ name })));
      wonders.forEach((name) => {
        log(st, `${player.name} spent the ${name} token as ${FOCUS_LABELS[cardType] || cardType} trade.`);
        queueAmericaWonderCard(st, player.id, name, "America: spent");
      });
    }
    spendResources(player, normalized.resources);
    return normalized;
  }

  // A focus-card placement is one transaction. In particular, two requested
  // markers may never turn into one marker plus a spent card merely because
  // one key became stale or was forged. The UI uses validControlHexes to offer
  // spaces; this preflight uses that exact set again immediately before any
  // resource, marker, trade, or focus-row state is changed.
  function validateCulturePlacement(st, playerId, hexKeys, tradeSpent, tradeResources) {
    const player = getPlayer(st, playerId);
    if (!player || !canResolveCard(player, "culture")) {
      return { ok: false, code: "culture_unavailable", message: "The culture card cannot be resolved now." };
    }
    const trade = validateFocusTradeSpend(st, player, "culture", tradeSpent, tradeResources);
    if (!trade.ok) return trade;
    if (!Array.isArray(hexKeys) || hexKeys.length === 0) {
      return { ok: false, code: "control_selection_empty", message: "Choose at least one control-marker space." };
    }
    if (hexKeys.some((hexKey) => typeof hexKey !== "string")) {
      return { ok: false, code: "control_space_invalid", message: "A selected control-marker space is invalid." };
    }
    const unique = new Set(hexKeys);
    if (unique.size !== hexKeys.length) {
      return { ok: false, code: "duplicate_control_space", message: "The same space cannot receive two control markers." };
    }
    const maxMarkers = getCultureMarkers(player, trade.spent, st);
    if (hexKeys.length > maxMarkers) {
      return {
        ok: false, code: "too_many_control_markers",
        message: `This culture card can place at most ${maxMarkers} control marker${maxMarkers === 1 ? "" : "s"}.`
      };
    }
    const slot = getSlotValue(player, "culture", st);
    const legal = validControlHexes(st, playerId, slot);
    const invalid = hexKeys.find((hexKey) => !legal.has(hexKey));
    if (invalid) {
      return {
        ok: false, code: "control_space_invalid",
        message: `${invalid} is no longer a legal control-marker space. Nothing was placed or spent.`
      };
    }
    const franceBonus = hasLeader(player, "france") ? franceWonderBonus(st, player.id) : 0;
    return {
      ok: true, hexKeys: hexKeys.slice(), maxMarkers, franceBonus,
      tradeSpent: trade.spent, tradePayment: trade
    };
  }

  function validDistrictHexes(st, playerId, maxTerrain) {
    const player = getPlayer(st, playerId);
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (placementDifficulty(st, h, player, "growth_district") > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || (h.fortress && !h.city)) return;
      if (h.control && (h.control.ownerId !== playerId || h.control.district)) return;
      if (!adjacentToFriendlyCity(st, h, playerId)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  // There is one physical token of each district type in every player's
  // supply. Board state is the source of truth, which also means destroying a
  // district returns that type to the supply without a second inventory that
  // can drift out of sync.
  function availableDistrictTypes(st, playerId) {
    const used = new Set();
    Object.values(st.map.hexes).forEach((h) => {
      if (h.control && h.control.ownerId === playerId && h.control.district) {
        used.add(h.control.district);
      }
    });
    return DISTRICTS.filter((kind) => !used.has(kind));
  }

  function growthCardProfile(player) {
    const tier = getCardTier(player, "growth");
    const name = getCardName(player, "growth");
    const standard = (CARD_NAMES.growth || [])[tier - 1] === name;
    return {
      tier,
      name,
      standard,
      sequential: (standard && tier >= 3) || name === "Military Engineering",
      engineering: standard && tier === 2,
      globalization: standard && tier === 4,
      mysticism: name === "Mysticism",
      militaryEngineering: name === "Military Engineering"
    };
  }

  function validateGrowthDistrictPlacement(st, playerId, payload) {
    const player = getPlayer(st, playerId);
    if (!player || !canResolveCard(player, "growth") || st.cardResolution) {
      return { ok: false, code: "growth_unavailable", message: "The growth card cannot start another effect now." };
    }
    const trade = validateFocusTradeSpend(st, player, "growth",
      payload.tradeSpent, payload.tradeResources);
    if (!trade.ok) return trade;
    if (!DISTRICTS.includes(payload.district)) {
      return { ok: false, code: "district_type_invalid", message: "Choose a printed district type." };
    }
    if (!availableDistrictTypes(st, playerId).includes(payload.district)) {
      return {
        ok: false, code: "district_token_unavailable",
        message: `Your ${DISTRICT_LABELS[payload.district] || payload.district} district token is already on the map.`
      };
    }
    const slot = getSlotValue(player, "growth", st);
    if (!validDistrictHexes(st, playerId, slot).has(payload.hexKey)) {
      return {
        ok: false, code: "district_space_invalid",
        message: "That is no longer a legal space for this district. Nothing was placed or spent."
      };
    }
    // Reinforcements are a later printed step. Reject the legacy combined
    // packet instead of partly applying it in an order the card does not print.
    if (Array.isArray(payload.reinforceKeys) && payload.reinforceKeys.length) {
      return {
        ok: false, code: "growth_sequence_required",
        message: "Place the district first; the reinforcement step follows after it is confirmed."
      };
    }
    return {
      ok: true, player, slot, tradeSpent: trade.spent, tradePayment: trade,
      profile: growthCardProfile(player)
    };
  }

  function validateGrowthDistrictSkip(st, playerId, tradeSpent, tradeResources) {
    const player = getPlayer(st, playerId);
    if (!player || !canResolveCard(player, "growth") || st.cardResolution) {
      return { ok: false, code: "growth_unavailable", message: "The growth card cannot start another effect now." };
    }
    const profile = growthCardProfile(player);
    if (!profile.sequential) {
      return { ok: false, code: "district_skip_not_available", message: "This growth card lets you choose its reinforce alternative instead." };
    }
    const trade = validateFocusTradeSpend(st, player, "growth", tradeSpent, tradeResources);
    if (!trade.ok) return trade;
    const hasType = availableDistrictTypes(st, playerId).length > 0;
    const hasSpace = validDistrictHexes(st, playerId, getSlotValue(player, "growth", st)).size > 0;
    if (hasType && hasSpace) {
      return { ok: false, code: "district_still_placeable", message: "At least one unused district can still be placed." };
    }
    return {
      ok: true, player, slot: getSlotValue(player, "growth", st),
      tradeSpent: trade.spent, tradePayment: trade, profile
    };
  }

  function validControlNearDistrictHexes(st, playerId, maxTerrain) {
    const player = getPlayer(st, playerId);
    const districts = Object.values(st.map.hexes).filter((h) =>
      h.control && h.control.ownerId === playerId && h.control.district);
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water" ||
          placementDifficulty(st, h, player, "growth_control") > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || h.control || (h.fortress && !h.city)) return;
      if (!districts.some((district) => hexDist(h, district) === 1)) return;
      valid.push(k);
    });
    return valid;
  }

  // Drama and Poetry explicitly says the destination contains neither a token
  // nor a plastic figure. Resource/natural-wonder tokens therefore block it,
  // unlike ordinary Culture placement, which is allowed to claim them.
  function dramaMoveDestinations(st, playerId, fromKey) {
    const from = st.map.hexes[fromKey];
    if (!from || !from.control || from.control.ownerId !== playerId || from.control.district) return [];
    return hexNeighborKeys(from.q, from.r).filter((key2) => {
      const h = st.map.hexes[key2];
      if (!h || !h.active || h.terrain === "water") return false;
      if (h.city || h.cityState || h.barbarian || h.control || h.fortress ||
          h.resource || h.naturalWonder) return false;
      return !getUnitsAt(st, key2).length;
    });
  }

  function dramaMoveSources(st, playerId) {
    return Object.entries(st.map.hexes)
      .filter(([key2, h]) => h.control && h.control.ownerId === playerId &&
        dramaMoveDestinations(st, playerId, key2).length)
      .map(([key2]) => key2);
  }

  // Turns unreinforced control tokens over, up to a limit, and says how many.
  function reinforceWithTokens(st, player, hexKeys, limit) {
    if (!limit || !Array.isArray(hexKeys)) return 0;
    let done = 0;
    for (const k of hexKeys) {
      if (done >= limit) break;
      const hex = st.map.hexes[k];
      if (!hex || !hex.control || hex.control.ownerId !== player.id) continue;
      if (hex.control.fortified) continue;
      hex.control.fortified = true;
      done++;
    }
    return done;
  }

  function validReinforceHexes(st, playerId) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.active && h.control && h.control.ownerId === playerId && !h.control.fortified) valid.push(k);
    });
    return new Set(valid);
  }

  function validateReinforcePlacement(st, playerId, hexKeys, tradeSpent, baseLimit, tradeResources) {
    const player = getPlayer(st, playerId);
    if (!player || !canResolveCard(player, "growth")) {
      return { ok: false, code: "growth_unavailable", message: "The growth card cannot be resolved now." };
    }
    const trade = validateFocusTradeSpend(st, player, "growth", tradeSpent, tradeResources);
    if (!trade.ok) return trade;
    if (!Array.isArray(hexKeys) || hexKeys.length === 0) {
      return { ok: false, code: "reinforce_selection_empty", message: "Choose at least one control marker to reinforce." };
    }
    if (hexKeys.some((hexKey) => typeof hexKey !== "string") || new Set(hexKeys).size !== hexKeys.length) {
      return { ok: false, code: "reinforce_space_invalid", message: "Each control marker may be reinforced only once." };
    }
    const freeLimit = Math.max(0, Number(baseLimit || 0));
    const limit = freeLimit + trade.spent;
    if (hexKeys.length > limit) {
      return {
        ok: false, code: "too_many_reinforcements",
        message: `This growth card can reinforce at most ${limit} control marker${limit === 1 ? "" : "s"}.`
      };
    }
    const legal = validReinforceHexes(st, playerId);
    const invalid = hexKeys.find((hexKey) => !legal.has(hexKey));
    if (invalid) {
      return {
        ok: false, code: "reinforce_space_invalid",
        message: `${invalid} is no longer one of your unreinforced control markers. Nothing was changed or spent.`
      };
    }
    return {
      ok: true,
      hexKeys: hexKeys.slice(),
      limit,
      tradeBudget: trade.spent,
      // Free printed reinforcements are always used before paid extras. A
      // player who reinforces fewer markers than previewed never loses unused
      // Growth trade tokens.
      tradeSpent: Math.max(0, hexKeys.length - freeLimit),
      tradePayment: trimFocusTradePayment(trade, Math.max(0, hexKeys.length - freeLimit))
    };
  }

  // A district play carries a second, independent batch: Terra p8 lets the same
  // growth card spend trade tokens to reinforce one control token each, "whether
  // or not the card's effect was used to reinforce control tokens".
  //
  // reinforceWithTokens skipped illegal keys with `continue` while the caller
  // charged the card and the trade anyway, so a stale selection cost tokens and
  // reinforced nothing — the same "place 2, get 1" the culture card had. This
  // makes the batch all-or-nothing, and it is the only place that also has to
  // validate tradeSpent: this branch never did, so a forged or stale payload
  // reinforced markers for free.
  function validateGrowthDistrictReinforcements(st, playerId, hexKeys, tradeSpent, districtKey) {
    const player = getPlayer(st, playerId);
    if (!player) return { ok: false, code: "unknown_actor", message: "No such player." };
    const trade = validateFocusTradeSpend(st, player, "growth", tradeSpent);
    if (!trade.ok) return trade;
    const keys = Array.isArray(hexKeys) ? hexKeys : [];
    if (!keys.length) return { ok: true, hexKeys: [], tradeSpent: trade.spent };
    if (keys.some((k) => typeof k !== "string") || new Set(keys).size !== keys.length) {
      return { ok: false, code: "reinforce_space_invalid", message: "Each control marker may be reinforced only once." };
    }
    // One reinforcement per trade token spent, and no more.
    if (keys.length > trade.spent) {
      return {
        ok: false, code: "too_many_reinforcements",
        message: `Reinforcing ${keys.length} marker${keys.length === 1 ? "" : "s"} costs ${keys.length} growth trade token${keys.length === 1 ? "" : "s"}, and ${trade.spent} were spent.`
      };
    }
    const legal = validReinforceHexes(st, playerId);
    // The space the district is going on is not a reinforcement target. Terra p9:
    // a district "is placed on its unreinforced side, even if it replaced a
    // reinforced control token" — so a marker there cannot be bought back up in
    // the same breath that replaces it.
    legal.delete(districtKey);
    const invalid = keys.find((k) => !legal.has(k));
    if (invalid) {
      return {
        ok: false, code: "reinforce_space_invalid",
        message: `${invalid} is not one of your unreinforced control markers. Nothing was placed or spent.`
      };
    }
    return { ok: true, hexKeys: keys.slice(), tradeSpent: trade.spent };
  }

  function validCityHexes(st, playerId, production, cityRange) {
    const range = cityRange || 2;
    const player = getPlayer(st, playerId);
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!isLegalCitySpace(st, h, k, playerId)) return;
      if (placementDifficulty(st, h, player, "industry_city") > production) return;
      if (!withinRangeOfFriendly(st, h, playerId, range)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validateIndustryCityAction(st, playerId, payload) {
    const player = getPlayer(st, playerId);
    if (!player || !canResolveCard(player, "industry")) {
      return { ok: false, code: "industry_unavailable", message: "The industry card cannot be resolved now." };
    }
    const hex = st.map.hexes[payload && payload.hexKey];
    if (!isLegalCitySpace(st, hex, payload && payload.hexKey, playerId)) {
      return { ok: false, code: "city_space_invalid", message: "That is not a legal city space." };
    }
    const requestedTrade = Number(payload && payload.tradeSpent || 0);
    const requestedResources = Object.values(payload && payload.resources || {})
      .reduce((sum, count) => sum + Number(count || 0), 0);
    const requestedTradeResources = Object.values(payload && payload.tradeResources || {})
      .reduce((sum, count) => sum + Number(count || 0), 0);
    if (requestedTrade || requestedResources || requestedTradeResources) {
      return {
        ok: false, code: "city_payment_not_applicable",
        message: "Industry trade and resource production build world wonders; they do not raise a city's terrain limit."
      };
    }
    const friendlyFigures = st.players.filter((owner) => owner.id === playerId)
      .flatMap((owner) => (owner.armies || []).concat(owner.caravans || []))
      .filter((figure) => figure.position === payload.hexKey);
    const animalHusbandry = getCardName(player, "industry") === "Animal Husbandry" &&
      !getActiveUniqueCard(player, "industry");
    const useFigure = !!payload.useFigure;
    const figure = useFigure
      ? (friendlyFigures.find((entry) => entry.id === payload.figureId) || friendlyFigures[0])
      : null;
    if (useFigure && (!animalHusbandry || !figure)) {
      return {
        ok: false, code: "animal_husbandry_figure_missing",
        message: "Animal Husbandry's third option requires one of your caravans or armies in that space."
      };
    }
    const difficulty = placementDifficulty(st, hex, player, "industry_city");
    const slot = getSlotValue(player, "industry", st);
    if (!useFigure && difficulty > slot) {
      return {
        ok: false, code: "city_terrain_too_difficult",
        message: `That space has terrain difficulty ${difficulty}; this Industry card resolves in slot ${slot}.`
      };
    }
    const range = getCityRange(player);
    if (!useFigure && !withinRangeOfFriendly(st, hex, playerId, range)) {
      return {
        ok: false, code: "city_range_invalid",
        message: animalHusbandry && friendlyFigures.length
          ? "Choose Animal Husbandry's figure option to build outside normal city range."
          : `That space is not within ${range} spaces of a friendly space.`
      };
    }
    return {
      ok: true, player, hex, range, difficulty, slot, useFigure, figure,
      payment: normalizeFocusTradePayment(0)
    };
  }

  function industrialZoneCityOption(st, playerId) {
    const player = getPlayer(st, playerId);
    if (!player || (player.trade.industry || 0) < 3) {
      return {
        ok: false, code: "insufficient_industry_trade",
        message: "The Industrial Zone city option requires exactly 3 trade tokens on Industry."
      };
    }
    const spots = [...validCityHexes(st, playerId, Infinity, 2)];
    if (!spots.length) {
      return {
        ok: false, code: "industrial_city_space_missing",
        message: "There is no legal city space within 2 spaces of a friendly space."
      };
    }
    return { ok: true, spots };
  }

  function validWonderHexes(st, playerId) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.city && h.city.ownerId === playerId && !h.city.hasWonder) valid.push(k);
    });
    return new Set(valid);
  }

  function canCrossWater(player, unitType) {
    if (!player) return false;
    // Indonesia: caravans and armies can always move into water.
    if (hasLeader(player, "indonesia")) return true;
    const cardType = unitType === "caravan" ? "economy" : "military";
    const tier = getCardTier(player, cardType);
    const waterTier = CARD_TIERS[cardType].water;
    return waterTier && tier >= waterTier;
  }

  function movementTerrainLimit(st, player, unitType) {
    if (!player) return 1;
    const cardType = unitType === "caravan" ? "economy" : "military";
    return getSlotValue(player, cardType, st);
  }

  // Flight IV prints: "They can move through spaces with unreinforced control
  // tokens, caravans, barbarians, and city-states." Nothing read the flag.
  function hasMovePassThrough(player, unitType) {
    if (unitType !== "army" || !player) return false;
    const tier = getCardTier(player, "military");
    return !!((CARD_DEFS.military || {})[tier] || {}).passThrough;
  }

  function armyCannotEndHere(st, h, playerId) {
    return antananarivoIsFriendlyCity(st, h, playerId);
  }

  // Base p12 and Terra p9: defeating a barbarian is ONE event, however it
  // happened - an army winning a combat, a card effect removing one, an
  // encampment striking one, a Currency caravan clearing its path. The reward
  // and any ability that keys off it belong here once, so that adding a new way
  // to defeat one cannot quietly miss them. Sumeria used to be checked inside
  // the combat resolver alone, so three of the four ways paid it nothing.
  //
  //   source: where the defeat came from, for the log and for the choice
  //   trade:  false only where the printed effect denies the trade token,
  //           which today is Currency and nothing else
  function onBarbarianDefeated(st, opts) {
    const o = opts || {};
    const hex = st.map.hexes[o.hexKey];
    const player = getPlayer(st, o.playerId);
    if (!hex || !hex.barbarian || !player) return false;
    const defeatedLetter = hex.barbarianId;
    const defeatedToken = hex.barbarianToken;
    hex.barbarian = false;
    hex.barbarianId = null;
    hex.barbarianToken = null;
    // Off the map, not gone: the registry still holds this figure's letter and
    // its printed home, and the next spawning event sends it back there.
    ensureBarbarianRegistry(st);
    const record = st.barbarians && st.barbarians[defeatedToken];
    if (record) record.position = null;
    else if (defeatedToken) {
      st.barbarians[defeatedToken] =
        { homeKey: defeatedToken, letter: defeatedLetter || null, position: null };
    }
    const cardResolutionId = o.cardResolutionId || null;
    if (o.trade !== false) {
      st.pendingBarbReward = { playerId: player.id, cardResolutionId };
    }
    // Sumeria: "When you defeat a barbarian, gain 1 resource of your choice
    // from the supply (in addition to a trade token)." It is the DEFEAT that
    // pays, not the combat, so it fires wherever one happens.
    if (hasLeader(player, "sumeria")) {
      queuePendingChoice(st, {
        kind: "gain_resource",
        playerId: player.id,
        title: "Sumeria: Gain a Resource",
        source: o.source || "barbarian",
        cardResolutionId,
        options: RESOURCES.map((r) => ({ id: r, label: r }))
      });
    }
    return true;
  }

  // Building a city is one event however it was paid for: the industry card,
  // an Industrial Zone, Cartography, the Amundsen-Scott rim city. England used
  // to be checked inside the industry action alone, so three of the four build
  // paths gave it nothing.
  //
  // This is deliberately NOT raised by capturing, conquering or replacing a
  // city, nor by the capital going down at setup. England's wording is "when
  // you BUILD a city", and taking one off a rival is not building it.
  function onCityBuilt(st, opts) {
    const o = opts || {};
    const player = getPlayer(st, o.playerId);
    const hex = st.map.hexes[o.hexKey];
    if (!player || !hex || !hex.city) return;
    // England: "When you build a city, if it is the only city on its tile
    // (excluding city-states), you MAY place 1 of your unused, reinforced
    // control tokens in a space adjacent to that city."
    if (!hasLeader(player, "england") || !hex.tileId) return;
    const onlyCityOnTile = !Object.values(st.map.hexes).some((h2) =>
      h2 !== hex && h2.tileId === hex.tileId && h2.city);
    if (!onlyCityOnTile) return;
    const spots = hexNeighborKeys(hex.q, hex.r).filter((nk) => {
      const nh = st.map.hexes[nk];
      return nh && nh.active && nh.terrain !== "water" && !nh.city && !nh.control &&
        !nh.barbarian && !nh.cityState && !(nh.fortress && !nh.city);
    });
    if (!spots.length) return;
    queuePendingChoice(st, {
      kind: "place_control", playerId: player.id, fortified: true,
      title: "England: Reinforced Expansion",
      // "you may" - declining is part of the printed card, not a way out of it.
      optional: true,
      source: o.source ? `england (${o.source})` : "england",
      hexKeys: spots
    });
  }

  // The barbarian figures themselves, keyed by the printed space each one
  // belongs to. This is the DYNAMIC half of the model; hex.barbarianHome is the
  // STATIC half and says only that an icon showing this letter is printed here.
  //
  //   homeKey  the printed spawn space: the token's permanent identity
  //   letter   the letter printed there, for display and for the log
  //   position the space it stands on, or null while it is off the map
  //
  // Keyed by space rather than by letter because a letter is not unique on a
  // board - E is printed on four different tiles - so two figures showing the
  // same letter can be in play at once. Keying by letter made one of them
  // unable to return: the respawn treated "an E is on the board" as "every E
  // is on the board".
  function ensureBarbarianRegistry(st) {
    if (!st || !st.map || !st.map.hexes) return;
    st.barbarians = st.barbarians || {};
    Object.entries(st.map.hexes).forEach(([homeKey, hex]) => {
      if (!hex || !hex.barbarianHome) return;
      if (st.barbarians[homeKey]) return;
      st.barbarians[homeKey] = {
        homeKey,
        letter: hex.barbarianHome,
        // A state written before the registry existed carried the figure only
        // on the map. Adopt it if it is standing on its own printed space;
        // otherwise the sync below finds it by its token id.
        position: hex.barbarian ? homeKey : null
      };
    });
  }

  // Read every figure's current position off the board. A figure with no space
  // carrying its token id is off the map, which is exactly the state a defeated
  // barbarian is in - it keeps its identity and its home while it waits.
  function syncBarbarianRegistry(st) {
    if (!st || !st.map || !st.map.hexes) return;
    ensureBarbarianRegistry(st);
    const seen = new Map();
    Object.entries(st.map.hexes).forEach(([k, hex]) => {
      if (!hex || !hex.barbarian) return;
      // Legacy states, and hand-built fixtures, may carry only the letter.
      // Adopt the figure onto a free token of that letter rather than dropping
      // it: a barbarian on the board is a barbarian on the board.
      if (!hex.barbarianToken) {
        const match = Object.values(st.barbarians).find((b) =>
          b.letter === hex.barbarianId && !seen.has(b.homeKey));
        hex.barbarianToken = match ? match.homeKey : k;
        if (!match) {
          st.barbarians[k] = st.barbarians[k] ||
            { homeKey: k, letter: hex.barbarianId || null, position: k };
        }
      }
      seen.set(hex.barbarianToken, k);
    });
    Object.values(st.barbarians).forEach((entry) => {
      entry.position = seen.has(entry.homeKey) ? seen.get(entry.homeKey) : null;
    });
  }

  // Every figure that is off the map right now, in printed-space order so the
  // return event is deterministic.
  function offMapBarbarians(st) {
    ensureBarbarianRegistry(st);
    return Object.values(st.barbarians || {})
      .filter((b) => !b.position)
      .sort((a, b) => a.homeKey.localeCompare(b.homeKey));
  }

  // Control tokens are a finite physical supply. Every placement goes through
  // here so that the supply has ONE place to be counted and ONE place to be
  // spent, rather than seven independent assignments each of which would have
  // to remember. A district is deliberately not counted: it is placed with the
  // district piece, and Terra gives each player one of each type, tracked
  // separately by availableDistrictTypes.
  //
  // BLOCKED: the number of control tokens an English base set gives a player,
  // and how many Terra Incognita adds, is a component count and not something
  // that can be derived from the rules text or the tile data. Until it is
  // verified CFG.controlTokens is Infinity, which is the behaviour this engine
  // has always had; everything else about the supply is implemented and driven,
  // so setting the number is the only thing left. See OVERNIGHT_PROGRESS.md.
  function controlTokensOnMap(st, playerId) {
    let n = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.control && h.control.ownerId === playerId && !h.control.district) n++;
    });
    return n;
  }
  function controlTokenLimit(st, playerId) {
    const player = getPlayer(st, playerId);
    if (!player) return 0;
    const configured = Number(CFG.controlTokens);
    return Number.isFinite(configured) ? configured : Infinity;
  }
  function controlTokensInSupply(st, playerId) {
    const limit = controlTokenLimit(st, playerId);
    if (!Number.isFinite(limit)) return Infinity;
    return Math.max(0, limit - controlTokensOnMap(st, playerId));
  }
  // Base rules: a player who may place a control token but has none left in
  // supply first removes one of their own from the map, and places that one.
  // So an exhausted supply never makes a placement illegal - it makes it cost
  // a token you already have somewhere else.
  function reclaimableControlHexes(st, playerId, exceptKey) {
    return Object.entries(st.map.hexes)
      .filter(([k, h]) => k !== exceptKey && h.control &&
        h.control.ownerId === playerId && !h.control.district)
      .map(([k]) => k);
  }

  // Put one of `playerId`'s control tokens on `hexKey`. Returns false only when
  // the space cannot take it at all; an empty supply is handled, not refused.
  function placeControlToken(st, hexKey, playerId, opts) {
    const o = opts || {};
    const hex = st.map.hexes[hexKey];
    const player = getPlayer(st, playerId);
    if (!hex || !player) return false;
    if (!Number.isFinite(controlTokenLimit(st, playerId)) ||
        controlTokensInSupply(st, playerId) > 0 ||
        // Replacing your own token on this space frees the very one being spent.
        (hex.control && hex.control.ownerId === playerId && !hex.control.district)) {
      // nothing to reclaim
    } else {
      const spare = reclaimableControlHexes(st, playerId, hexKey);
      if (!spare.length) return false;             // nothing on the map either
      const giveUp = o.reclaimKey && spare.includes(o.reclaimKey) ? o.reclaimKey : spare[0];
      st.map.hexes[giveUp].control = null;
      log(st, `${player.name} took a control token back from ${giveUp} to place one at ${hexKey}.`);
    }
    hex.control = {
      ownerId: playerId,
      fortified: !!o.fortified,
      district: o.district || null
    };
    return true;
  }

  function caravanCanDefeatBarbarian(player) {
    return !!player && getCardName(player, "economy") === "Currency" &&
      !getActiveUniqueCard(player, "economy");
  }

  function isForcedStopHex(st, h, unitType, playerId) {
    const hexKey = key(h.q, h.r);
    // Only the four things Flight names are waived. A reinforced token, a rival
    // city, a rival army and an uncontrolled fort still stop an army dead.
    //
    // This is about passing THROUGH. Ending a move in one of these spaces is
    // still an attack either way: PLAY_MILITARY_MOVE refuses a destination with
    // a defender in it, and PLAY_MILITARY_ATTACK is what resolves it. Masonry I
    // prints the general rule - "When an army enters a space containing a
    // barbarian, city-state, or rival piece, it must end its movement and
    // perform an attack" - and Flight is the exception to the entering, not to
    // the attacking.
    const flies = hasMovePassThrough(getPlayer(st, playerId), unitType);

    if (h.barbarian) return !flies;
    if (h.cityState) {
      if (unitType === "army" && antananarivoIsFriendlyCity(st, h, playerId)) return false;
      return !flies;
    }
    if (h.fortress && !h.city) return true;
    if (h.control && h.control.ownerId !== playerId) {
      if (unitType === "army" && hasCityStateDiplomacy(getPlayer(st, playerId), "Akkad")) {
        return false;
      }
      // Reinforced is the half Flight does not waive.
      return h.control.fortified ? true : !flies;
    }
    if (h.city && h.city.ownerId !== playerId) return true;
    const rivals = st.players.filter((p) => p.id !== playerId);
    if (rivals.some((p) => p.armies.some((u) => u.position === hexKey))) return true;
    // A rival caravan is a "rival piece" by Masonry's wording, so it stops an
    // army like anything else - and Flight would have no reason to name
    // caravans if they had never stopped anyone.
    if (unitType === "army" && rivals.some((p) => (p.caravans || []).some((u) => u.position === hexKey))) {
      return !flies;
    }
    return false;
  }

  function getReachable(st, startKey, maxSteps, unitType, playerId) {
    const player = getPlayer(st, playerId);
    const waterOk = canCrossWater(player, unitType);
    const terrainLimit = movementTerrainLimit(st, player, unitType);
    const visited = new Set([startKey]);
    const reachable = new Set();
    const queue = [{ key: startKey, steps: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.steps >= maxSteps) continue;
      hexNeighborKeys(parseQ(cur.key), parseR(cur.key)).forEach((nk) => {
        if (visited.has(nk)) return;
        const h = st.map.hexes[nk];
        if (!h || !h.active) return;
        if (h.terrain === "water" && !waterOk) return;
        if (h.terrain !== "water" && moveDifficulty(st, h, player, unitType) > terrainLimit) return;
      if (unitType === "caravan" && h.barbarian &&
          !caravanCanDefeatBarbarian(player)) return;
        visited.add(nk);
        if (!(unitType === "army" && armyCannotEndHere(st, h, playerId))) reachable.add(nk);
        if (!isForcedStopHex(st, h, unitType, playerId)) queue.push({ key: nk, steps: cur.steps + 1 });
      });
    }
    return reachable;
  }

  function findDefender(st, hexKey, attackerId, targetUnitId, targetOwnerId) {
    const h = st.map.hexes[hexKey];
    if (!h) return null;
    // Every defender hands back where its number came from, so the fight can
    // show you what you are up against instead of one unexplained total.
    const only = (label, value) => [{ label, value }];
    // The barbarian comes first, ahead of the fort and the city-state it may be
    // standing on. Terra p10: "If an army attacks a space with a barbarian, the
    // barbarian must be the target." Base p15 says the same for the other
    // static defender: "While a barbarian is in a city-state's space ... the
    // city-state cannot be attacked."
    //
    // It defends with the SPACE's terrain difficulty and never borrows what it
    // is standing on — a barbarian on a fort is a 3, because Terra p11 treats
    // fort spaces as forests of difficulty 3, not the fort's 6. Checking the
    // fort first made the barbarian unattackable and let a player capture a
    // fort out from under one.
    if (h.barbarian) {
      const terrainDiff = h.resource === "wonder" ? 5 : TERRAIN[h.terrain];
      return { type: "barbarian", label: "Barbarian", power: CFG.barbarianBase + terrainDiff,
        parts: only(`${TERRAIN_LABELS[h.terrain] || h.terrain} terrain`, CFG.barbarianBase + terrainDiff) };
    }
    if (h.fortress && !h.city) {
      return { type: "fortress", label: "Fortress", power: CFG.fortressDefense,
        parts: only("uncontrolled fort", CFG.fortressDefense) };
    }
    if (h.cityState && !antananarivoIsFriendlyCity(st, h, attackerId)) {
      return { type: "citystate", label: h.cityState.name, power: CFG.cityStateDefense,
        parts: only("city-state", CFG.cityStateDefense) };
    }
    // Defender-side leader effects: China's reinforced tokens count double,
    // Scythia adds +3 defending a grassland or hill space.
    const defenderLeaderBonus = (ownerId) => {
      const owner = getPlayer(st, ownerId);
      let value = hasLeader(owner, "scythia") &&
        (h.terrain === "grass" || h.terrain === "hill") ? 3 : 0;
      if (hasLeader(owner, "ottoman") && st.ibrahimHolder === attackerId) value += 2;
      return value;
    };
    const siegeReduction = uniqueInPlay(getPlayer(st, attackerId), "georgia") ? 1 : 0;
    const reinforcedTokenValue = (ownerId) => Math.max(0,
      (hasLeader(getPlayer(st, ownerId), "china") ? 2 : 1) - siegeReduction);
    const reinforcedValue = (ownerId) => {
      return countAdjacentReinforced(st, hexKey, ownerId) * reinforcedTokenValue(ownerId);
    };
    // Terra p16, under Rival Piece: "+2 if there is at least 1 army friendly to
    // the defender (other than the defender itself) also in the space."
    const escortBonus = (ownerId, defendingUnitId) => {
      const owner = getPlayer(st, ownerId);
      if (!owner) return 0;
      return owner.armies.some((u) => u.position === hexKey && u.id !== defendingUnitId) ? 2 : 0;
    };
    // Terra p10: "An army or caravan that is being attacked has a combat value
    // bonus equal to the difficulty of the terrain that figure is in. These
    // figures do NOT receive bonuses from reinforced control tokens." A city or
    // a control token gets the full stack; a figure gets terrain and escort.
    const breakdown = (ownerId, terrainPart, defendingUnitId, isFigure) => {
      const list = [terrainPart];
      const push = (label, value) => { if (value) list.push({ label, value }); };
      if (!isFigure) {
        push("reinforced", h.control && h.control.fortified
          ? reinforcedTokenValue(ownerId) : 0);
        push("adjacent reinforced", reinforcedValue(ownerId));
      }
      push("friendly army in the space", escortBonus(ownerId, defendingUnitId));
      const leaderValue = defenderLeaderBonus(ownerId);
      if (leaderValue) {
        const ottoman = hasLeader(getPlayer(st, ownerId), "ottoman") && st.ibrahimHolder === attackerId;
        push(ottoman ? "leader (including Ottoman vs Ibrahim)" : "leader", leaderValue);
      }
      push("wonder", getWonderDefenseBonus(st, ownerId, hexKey));
      push("defensive pact", getDiplomacyDefenseBonus(st, ownerId, attackerId));
      push("Carthage diplomacy", getCityStateDefenseBonus(st, ownerId, hexKey));
      return list;
    };
    if (h.control && h.control.ownerId !== attackerId) {
      const parts = breakdown(h.control.ownerId,
        { label: `${TERRAIN_LABELS[h.terrain] || h.terrain} terrain`, value: terrainDifficulty(h) });
      return { type: "control", label: "Control Marker", ownerId: h.control.ownerId,
        power: parts.reduce((a, x) => a + x.value, 0), parts };
    }
    if (h.city && h.city.ownerId !== attackerId) {
      const parts = breakdown(h.city.ownerId,
        { label: `${TERRAIN_LABELS[h.terrain] || h.terrain} terrain, doubled`, value: terrainDifficulty(h) * 2 });
      return { type: "city", label: h.city.isCapital ? "Capital" : "City", ownerId: h.city.ownerId,
        power: parts.reduce((a, x) => a + x.value, 0), parts };
    }
    // A lone rival figure is still a target: its defence is the space's terrain
    // difficulty. Without this, walking onto an enemy army was a free move.
    const rival = rivalUnitAt(st, hexKey, attackerId, targetUnitId, targetOwnerId);
    if (rival) {
      const parts = breakdown(rival.playerId,
        { label: `${TERRAIN_LABELS[h.terrain] || h.terrain} terrain`, value: terrainDifficulty(h) },
        rival.unitId, true);
      const rivalPlayer = getPlayer(st, rival.playerId);
      return { type: rival.kind,
        label: `${rivalPlayer ? rivalPlayer.name + "'s " : ""}${rival.kind === "army" ? "Army" : "Caravan"}`,
        ownerId: rival.playerId, unitId: rival.unitId,
        power: parts.reduce((a, x) => a + x.value, 0), parts };
    }
    return null;
  }

  // Every rival piece in a space that may be attacked. Base p11 step 1: "the
  // attacker chooses one rival piece in the space" — with a city and an army
  // both standing there, which one you go for is your decision, not a fixed
  // order the engine picks for you.
  function findDefenders(st, hexKey, attackerId) {
    const h = st.map.hexes[hexKey];
    if (!h) return [];
    // No choice is offered for these three, but for two different reasons, and
    // the comment here used to state both and contradict itself.
    //
    // A barbarian is not a choice because Terra p10 forbids one: "If an army
    // attacks a space with a barbarian, the barbarian must be the target." It
    // can genuinely share a space with a fort or a city-state.
    //
    // An uncontrolled fort and a city-state are not choices because nothing
    // else in their space is attackable — a fort takes no control token or
    // district (Terra p11), and a city-state's space holds only itself.
    const solo = findDefender(st, hexKey, attackerId);
    if (solo && ["fortress", "barbarian", "citystate"].includes(solo.type)) return [solo];

    const out = [];
    const seen = new Set();
    const add = (d) => {
      const identity = d && `${d.type}:${d.ownerId || ""}:${d.unitId || ""}`;
      if (d && !seen.has(identity)) { seen.add(identity); out.push(d); }
    };
    if (h.control && h.control.ownerId !== attackerId) add(defenderOfType(st, hexKey, attackerId, "control"));
    if (h.city && h.city.ownerId !== attackerId) add(defenderOfType(st, hexKey, attackerId, "city"));
    rivalUnitsAt(st, hexKey, attackerId).forEach((rival) => {
      add(defenderOfType(st, hexKey, attackerId, rival.kind, rival));
    });
    return out;
  }

  function selectCombatDefender(targets, payload) {
    const list = targets || [];
    const request = payload || {};
    const hasExactIdentity = !!(request.targetUnitId || request.targetOwnerId);
    if (hasExactIdentity) {
      return list.find((entry) =>
        (!request.targetType || entry.type === request.targetType) &&
        (!request.targetOwnerId || entry.ownerId === request.targetOwnerId) &&
        (!request.targetUnitId || entry.unitId === request.targetUnitId)) || null;
    }
    return request.targetType
      ? list.find((entry) => entry.type === request.targetType) || null
      : list[0] || null;
  }

  // findDefender with the top of its priority order suppressed, so each piece
  // in a shared space can be described on its own terms.
  function defenderOfType(st, hexKey, attackerId, type, rival) {
    const h = st.map.hexes[hexKey];
    if (!h) return null;
    const saveControl = h.control, saveCity = h.city;
    if (type !== "control") h.control = null;
    if (type !== "city") h.city = null;
    let d = null;
    try {
      d = findDefender(st, hexKey, attackerId,
        rival && rival.unitId, rival && rival.playerId);
    } finally {
      h.control = saveControl; h.city = saveCity;
    }
    return d && d.type === type ? d : null;
  }

  // The rival figure standing on a space, armies before caravans — an army is
  // what an attacker has to beat, and it is the one that escorts the caravan.
  function rivalUnitsAt(st, hexKey, attackerId) {
    const found = [];
    for (const p of st.players) {
      if (p.id === attackerId) continue;
      p.armies.filter((u) => u.position === hexKey).forEach((army) => {
        found.push({ playerId: p.id, unitId: army.id, kind: "army" });
      });
    }
    for (const p of st.players) {
      if (p.id === attackerId) continue;
      p.caravans.filter((u) => u.position === hexKey).forEach((caravan) => {
        found.push({ playerId: p.id, unitId: caravan.id, kind: "caravan" });
      });
    }
    return found;
  }

  function rivalUnitAt(st, hexKey, attackerId, targetUnitId, targetOwnerId) {
    const rivals = rivalUnitsAt(st, hexKey, attackerId);
    if (targetUnitId || targetOwnerId) {
      return rivals.find((unit) =>
        (!targetUnitId || unit.unitId === targetUnitId) &&
        (!targetOwnerId || unit.playerId === targetOwnerId)) || null;
    }
    return rivals[0] || null;
  }

  function armiesAt(st, hexKey) {
    const found = [];
    st.players.forEach((p) => {
      p.armies.forEach((unit) => { if (unit.position === hexKey) found.push({ player: p, unit }); });
    });
    return found;
  }

  // `id` is the figure's own id and `animId` matches the key the UI tweens
  // under, so a piece drawn here can be recognised as one already in motion.
  function getUnitsAt(st, hexKey) {
    const units = [];
    st.players.forEach((p) => {
      p.armies.forEach((u) => { if (u.position === hexKey) units.push({ type: "army", playerId: p.id, color: p.color, id: u.id, animId: `a${p.id}:${u.id}` }); });
      p.caravans.forEach((u) => { if (u.position === hexKey) units.push({ type: "caravan", playerId: p.id, color: p.color, id: u.id, animId: `c${p.id}:${u.id}` }); });
    });
    return units;
  }

  function antananarivoIsFriendlyCity(st, hex, playerId) {
    const active = currentPlayer(st);
    return !!hex && !!hex.cityState && hex.cityState.name === "Antananarivo" &&
      !!active && active.id === playerId &&
      hasCityStateDiplomacy(getPlayer(st, playerId), "Antananarivo");
  }

  function isFriendlyCity(st, hex, playerId) {
    return !!hex && ((hex.city && hex.city.ownerId === playerId) ||
      antananarivoIsFriendlyCity(st, hex, playerId));
  }

  function withinRangeOfCity(st, hex, playerId, range) {
    return Object.values(st.map.hexes).some((h) => {
      if (!isFriendlyCity(st, h, playerId)) return false;
      return hexDist(h, hex) <= range;
    });
  }
  function adjacentToFriendlyCity(st, hex, playerId) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => {
      return isFriendlyCity(st, st.map.hexes[nk], playerId);
    });
  }
  function adjacentToAnyCity(st, hex) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => { const n = st.map.hexes[nk]; return n && n.city; });
  }
  function adjacentToCityState(st, hex) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => { const n = st.map.hexes[nk]; return n && n.cityState; });
  }
  function adjacentToFortress(st, hex) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => { const n = st.map.hexes[nk]; return n && n.fortress && !n.city; });
  }
  // A legal space for a new city (base p9, restated as "Legal Space" on Terra
  // p14): non-water, not adjacent to a city, city-state or fort, and holding no
  // component EXCEPT a caravan, a friendly army, or a friendly control token.
  // The German edition reads as though the caravan or token were required. It is
  // the other way round — plain empty ground is the ordinary place to build.
  function isLegalCitySpace(st, hex, hexKey, playerId) {
    if (!hex || !hex.active || hex.terrain === "water") return false;
    if (hex.city || hex.cityState || hex.barbarian || hex.fortress) return false;
    if (hex.resource || hex.naturalWonder) return false;
    if (hex.control && hex.control.ownerId !== playerId) return false;
    if (adjacentToAnyCity(st, hex) || adjacentToCityState(st, hex) || adjacentToFortress(st, hex)) return false;
    // Caravans never block, whoever owns them; a rival army does (Terra p11).
    return !st.players.some((p) => p.id !== playerId &&
      p.armies.some((u) => u.position === hexKey));
  }

  function adjacentToFriendlyControl(st, hex, playerId) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => {
      const n = st.map.hexes[nk]; return n && n.control && n.control.ownerId === playerId;
    });
  }
  function withinRangeOfFriendly(st, hex, playerId, range) {
    // Great Lighthouse: build on the map's rim as though it were near home.
    if (hasWonder(st, playerId, "Great Lighthouse") && isEdgeSpace(st, hex)) return true;
    const player = getPlayer(st, playerId);
    const industryName = getCardName(player, "industry");
    const throughWater = hasCityStateDiplomacy(player, "Auckland") ||
      industryName === "Nationalism" || industryName === "Urbanization" ||
      industryName === "Industrialization";
    const targetKey = key(hex.q, hex.r);
    const seen = new Set();
    const queue = [];
    Object.entries(st.map.hexes).forEach(([hexKey, candidate]) => {
      if (!candidate || !candidate.active) return;
      const friendly = isFriendlyCity(st, candidate, playerId) ||
        (candidate.control && candidate.control.ownerId === playerId);
      if (!friendly) return;
      seen.add(hexKey);
      queue.push({ hexKey, distance: 0 });
    });
    while (queue.length) {
      const current = queue.shift();
      if (current.hexKey === targetKey) return true;
      if (current.distance >= range) continue;
      hexNeighborKeys(parseQ(current.hexKey), parseR(current.hexKey)).forEach((nextKey) => {
        if (seen.has(nextKey)) return;
        const next = st.map.hexes[nextKey];
        if (!next || !next.active) return;
        if (!throughWater && next.terrain === "water") return;
        seen.add(nextKey);
        queue.push({ hexKey: nextKey, distance: current.distance + 1 });
      });
    }
    return false;
  }

  function countAdjacentReinforced(st, hexKey, ownerId) {
    let count = 0;
    hexNeighborKeys(parseQ(hexKey), parseR(hexKey)).forEach((nk) => {
      const nh = st.map.hexes[nk];
      if (nh && nh.control && nh.control.ownerId === ownerId && nh.control.fortified) count++;
    });
    return count;
  }

  // "Within N spaces" includes the space itself: distance 0 is within 2. This
  // excluded the origin, and the consequence was a rule, not a rounding error -
  // a district IS a control token, so an unreinforced Encampment is a friendly
  // control token at distance 0 from itself and must be a legal target for its
  // own reinforcement option. Excluding the origin made that impossible.
  //
  // Every caller filters afterwards, so including it changes nothing else: the
  // theater and wonder-city placements require an EMPTY space and a district's
  // own hex is occupied, and an encampment strike requires a barbarian or a
  // rival army standing there - which, if one is standing on your district, is
  // a legal target anyway.
  function hexesWithinRange(map, hexKey, range) {
    const h = map.hexes[hexKey];
    if (!h) return [];
    const result = [];
    Object.entries(map.hexes).forEach(([k, hex]) => {
      if (hexDist(h, hex) <= range) result.push(k);
    });
    return result;
  }

  function getReinforceChoicesNear(st, hexKey, playerId, range) {
    if (!hexKey) return [];
    return hexesWithinRange(st.map, hexKey, range).filter((nk) => {
      const h = st.map.hexes[nk];
      return h && h.control && h.control.ownerId === playerId && !h.control.fortified;
    });
  }

  function revealAround(map, hexKey, radius) {
    const h = map.hexes[hexKey];
    if (!h) return;
    Object.values(map.hexes).forEach((hex) => {
      if (hexDist(h, hex) <= radius) hex.revealed = true;
    });
  }

  // --- Hex Utilities ---
  function key(q, r) { return `${q},${r}`; }
  function parseQ(k) { return parseInt(k.split(",")[0]); }
  function parseR(k) { return parseInt(k.split(",")[1]); }
  function hexNeighborKeys(q, r) { return HEX_DIRS.map((d) => key(q + d.dq, r + d.dr)); }
  function hexDist(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2; }
  function randomLandTerrain() {
    const roll = Math.random() * 100;
    if (roll < 30) return "grass";
    if (roll < 55) return "hill";
    if (roll < 75) return "forest";
    if (roll < 90) return "desert";
    return "mountain";
  }
  function pickRandom(arr, n) {
    const copy = arr.slice(); const result = [];
    while (copy.length && result.length < n) { const i = Math.floor(Math.random() * copy.length); result.push(copy.splice(i, 1)[0]); }
    return result;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function rollDie() { return Math.floor(Math.random() * 6) + 1; }
  function log(st, msg) {
    st.log = st.log || [];
    st.log.push(msg);
    if (st.log.length > MAX_LOG_ENTRIES) {
      st.log.splice(0, st.log.length - MAX_LOG_ENTRIES);
    }
  }

  // --- Exploration (Terra Incognita) ---

  function explorationTouchesOrigin(st, anchorKey, rotation, fromKey) {
    if (!fromKey) return false;
    return getTileHexKeys(anchorKey, rotation, st.map.hexes).some((cellKey) =>
      hexNeighborKeys(parseQ(cellKey), parseR(cellKey)).includes(fromKey)
    );
  }

  function explorationSideExists(tileId, side) {
    const def = getTileDef(tileId);
    return !def || !def.sides || !!def.sides[side];
  }

  function canPlaceExploration(st, tileId, anchorKey, rotation, side, fromKey) {
    return explorationSideExists(tileId, side) &&
      validateExploration(st, tileId, anchorKey, rotation).ok &&
      explorationTouchesOrigin(st, anchorKey, rotation, fromKey);
  }

  // A legal explored tile must include a space beside fromKey. That gives a
  // finite, exact set of anchors even though the axial board itself has no
  // boundary: choose which of the six neighbouring coordinates is covered,
  // then choose which of the tile's ten offsets covers it. This replaces a
  // scan of the preallocated canvas-sized dictionary, which incorrectly made
  // the edge of that dictionary the edge of the game world.
  function explorationCandidateAnchors(fromKey, rotation) {
    if (!fromKey) return [];
    const fq = parseQ(fromKey), fr = parseR(fromKey);
    if (!Number.isInteger(fq) || !Number.isInteger(fr)) return [];
    const anchors = new Set();
    const rotated = TILE_OFFSETS.map((offset) => rotateAxial(offset, rotation));
    HEX_DIRS.forEach((dir) => {
      const cellQ = fq + dir.dq;
      const cellR = fr + dir.dr;
      rotated.forEach((offset) => {
        anchors.add(key(cellQ - offset.q, cellR - offset.r));
      });
    });
    return Array.from(anchors);
  }

  function getLegalExplorationPlacements(st, pending, filters) {
    if (!st || !pending || !pending.tileId || !pending.fromKey) return [];
    const wantedSide = filters && filters.side;
    const wantedRotation = filters && filters.rotation;
    const sides = wantedSide ? [wantedSide] : ["A", "B"];
    const rotations = Number.isInteger(wantedRotation)
      ? [wantedRotation] : [0, 1, 2, 3, 4, 5];
    const placements = [];
    sides.forEach((side) => {
      if (!explorationSideExists(pending.tileId, side)) return;
      rotations.forEach((rotation) => {
        explorationCandidateAnchors(pending.fromKey, rotation).forEach((anchorKey) => {
          if (!canPlaceExploration(st, pending.tileId, anchorKey, rotation, side, pending.fromKey)) return;
          placements.push({
            side,
            rotation,
            anchorKey,
            cellKeys: getTileHexKeys(anchorKey, rotation, st.map.hexes)
          });
        });
      });
    });
    return placements;
  }

  // "Nowhere it fits" is a claim about the physical tile, not the currently
  // selected face or angle. The host therefore checks both faces at all six
  // rotations against every possible anchor before accepting an abandonment.
  function hasLegalExplorationPlacement(st, pending) {
    return getLegalExplorationPlacements(st, pending).length > 0;
  }

  function findExplorer(player, payload) {
    if (!player || !payload.fromKey) return null;
    const groups = payload.unitType === "army" ? [["army", player.armies || []]]
      : payload.unitType === "caravan" ? [["caravan", player.caravans || []]]
      : [["army", player.armies || []], ["caravan", player.caravans || []]];
    for (const [unitType, figures] of groups) {
      const unit = payload.unitId
        ? figures.find((entry) => entry.id === payload.unitId)
        : figures.find((entry) => entry.position === payload.fromKey);
      if (unit) return { unit, unitType };
    }
    return null;
  }

  function movementOrigin(st, player, unit, unitType, payload) {
    if (unit.position) {
      // Trajan may start a deployed caravan's route from any Roman city.
      if (unitType === "caravan" && hasLeader(player, "rome") && payload.startKey &&
          payload.startKey !== unit.position) {
        const startHex = st.map.hexes[payload.startKey];
        if (startHex && startHex.city && startHex.city.ownerId === player.id) return payload.startKey;
      }
      return unit.position;
    }
    const launches = launchSpaces(st, player.id);
    if (payload.startKey && launches.has(payload.startKey)) return payload.startKey;
    if (unitType === "caravan") {
      const capital = findCapital(st, player.id);
      if (capital && launches.has(capital)) return capital;
    }
    return null;
  }

  function sameResourcePayment(a, b) {
    return RESOURCES.every((resource) =>
      Number(a && a[resource] || 0) === Number(b && b[resource] || 0));
  }

  function movementTradePayment(st, player, cardType, payload) {
    const requested = payload.tradeSpent === undefined ? 0 : Number(payload.tradeSpent);
    if (!Number.isInteger(requested) || requested < 0) return null;
    // Military trade is bid after both combat dice are visible. It is not an
    // up-front movement purchase. Keeping it out of activeCard also prevents
    // the old double charge (once in COMBAT_SPEND and again on card reset).
    if (cardType === "military" && (requested !== 0 ||
        Object.values(payload.tradeResources || {}).some((count) => Number(count || 0) > 0))) {
      return null;
    }
    if (st.activeCard) {
      if (st.activeCard.playerId !== player.id || st.activeCard.cardType !== cardType) return null;
      const committed = normalizeFocusTradePayment(
        st.activeCard.tradePayment || st.activeCard.tradeSpent);
      if (payload.tradeSpent !== undefined && requested !== committed.spent) return null;
      if (payload.tradeResources !== undefined &&
          !sameResourcePayment(payload.tradeResources, committed.resources)) return null;
      return committed;
    }
    if (!canResolveCard(player, cardType)) return null;
    const payment = validateFocusTradeSpend(st, player, cardType, requested,
      payload.tradeResources);
    return payment.ok ? payment : null;
  }

  // Route entries are the successive hexes selected by the player. Each leg is
  // recomputed against the authoritative board; caller-supplied remaining or
  // spent values never participate in the result.
  function validateMovementRoute(st, startKey, fromKey, route, maxMove, unitType, playerId) {
    let stops = Array.isArray(route) ? route.slice() : [];
    if (stops.length > 32 || stops.some((hexKey) => typeof hexKey !== "string")) return null;
    if (stops[0] === startKey) stops.shift();
    if (!stops.length && fromKey !== startKey) stops = [fromKey];
    if ((stops.length ? stops[stops.length - 1] : startKey) !== fromKey) return null;

    let current = startKey;
    let spent = 0;
    for (let index = 0; index < stops.length; index++) {
      const target = stops[index];
      if (target === current) return null;
      const left = maxMove - spent;
      const distances = getReachableWithDist(st, current, left, unitType, playerId);
      if (!distances.has(target)) return null;
      spent += distances.get(target);
      const hex = st.map.hexes[target];
      if (index < stops.length - 1 && isForcedStopHex(st, hex, unitType, playerId)) return null;
      current = target;
    }
    return { spent, remaining: maxMove - spent };
  }

  function prepareExplorationMovement(st, player, payload) {
    const found = findExplorer(player, payload);
    if (!found || found.unit.movedThisCard || found.unit.exploredThisMove) return null;
    const { unit, unitType } = found;
    const cardType = unitType === "caravan" ? "economy" : "military";
    const tradePayment = movementTradePayment(st, player, cardType, payload);
    if (!tradePayment) return null;
    const startKey = movementOrigin(st, player, unit, unitType, payload);
    if (!startKey) return null;
    const maxMove = unitType === "caravan"
      ? getEconomyMove(player, st) + tradePayment.spent : getMilitaryMove(player, st);
    const route = validateMovementRoute(st, startKey, payload.fromKey, payload.route,
      maxMove, unitType, player.id);
    if (!route || route.remaining < 1) return null;
    return {
      kind: "post_exploration_movement",
      playerId: player.id,
      unitType,
      unitId: unit.id,
      cardType,
      startKey,
      fromKey: payload.fromKey,
      maxMove,
      spentBeforeExplore: route.spent,
      remaining: route.remaining - 1,
      tradeSpent: tradePayment.spent,
      tradePayment,
      status: "pending_tile"
    };
  }

  function shipbuildingWaterSpaces(st, fromKey) {
    if (!st || !st.map || !st.map.hexes || !fromKey) return [];
    const candidates = hexNeighborKeys(parseQ(fromKey), parseR(fromKey));
    // Exploration can grow beyond the map's current storage ring. Materialise
    // the six touching coordinates before the choice is projected to clients,
    // so a legal water-token space can never disappear merely because that
    // coordinate had not been needed by an earlier tile.
    ensureMapHexes(st.map, candidates, 1);
    return candidates.filter((hexKey) => {
      const hex = st.map.hexes[hexKey];
      return !!hex && !hex.active;
    });
  }

  function isShipbuildingWaterSpace(st, fromKey, hexKey) {
    if (!fromKey || !hexKey || !st || !st.map || !st.map.hexes) return false;
    if (!hexNeighborKeys(parseQ(fromKey), parseR(fromKey)).includes(hexKey)) return false;
    const hex = st.map.hexes[hexKey];
    return !!hex && !hex.active;
  }

  function placeShipbuildingWaterToken(st, player, hexKey) {
    ensureMapHexes(st.map, [hexKey], 1);
    const hex = st.map.hexes[hexKey];
    if (!hex || hex.active) return false;
    Object.assign(hex, {
      active: true,
      revealed: true,
      terrain: "water",
      resource: null,
      naturalWonder: null,
      naturalWonderSpace: null,
      cityState: null,
      barbarian: false,
      barbarianId: null,
      barbarianToken: null,
      barbarianHome: null,
      control: null,
      city: null,
      fortress: false,
      fortressOwnerId: null,
      core: false,
      coreAdjacent: false,
      tileId: "water-token",
      tileCell: null,
      tileSide: null
    });
    log(st, `${player.name} placed Shipbuilding's water token at ${hexKey}.`);
    return true;
  }

  function continueShipbuildingExploration(st, choice, waterHexKey) {
    const player = getPlayer(st, choice.playerId);
    if (!player || !choice.explorationPayload || st.pendingExploration) return false;
    if (waterHexKey && !isShipbuildingWaterSpace(st, choice.fromKey, waterHexKey)) return false;

    // Reveal first on the same transaction, then commit the optional token.
    // That keeps a stale/invalid choice from ever leaving a token behind without
    // the exploration it belongs to. The authoritative snapshot exposes both
    // changes together, which is still the printed "before exploring" window.
    beginExploration(st, {
      ...cloneSerializable(choice.explorationPayload),
      skipShipbuilding: true
    });
    if (!st.pendingExploration || st.pendingExploration.playerId !== player.id) return false;

    const active = activeMovementCard(st, player, "economy",
      st.pendingExploration.movementContinuation &&
        st.pendingExploration.movementContinuation.tradePayment);
    active.shipbuildingWaterOffered = true;
    if (waterHexKey) {
      if (!placeShipbuildingWaterToken(st, player, waterHexKey)) return false;
      active.shipbuildingWaterPlaced = true;
      st.pendingExploration.shipbuildingWaterKey = waterHexKey;
    }
    return true;
  }

  function beginExploration(st, payload) {
    if (st.phase !== "playing" || st.pendingExploration) return st;
    const current = currentPlayer(st);
    if (!current || current.id !== payload.playerId) return st;
    const player = getPlayer(st, payload.playerId);
    const freeRun = !!(st.freeExplore && st.freeExplore.playerId === player.id &&
      st.freeExplore.fromKey === payload.fromKey);
    const retainedTile = freeRun && st.freeExplore ? st.freeExplore.tileId || null : null;
    if (!player || !payload.fromKey || !st.tileStack ||
        (!st.tileStack.length && !retainedTile)) return st;

    if (!freeRun && !isExploreEligible(st, payload.fromKey)) return st;
    const movement = freeRun ? null : prepareExplorationMovement(st, player, payload);
    if (!freeRun && !movement) return st;

    // Indonesia's unique economy card inserts one optional component placement
    // immediately before one caravan explores. It is a real owned decision, so
    // the tile is not revealed and the movement point is not committed until
    // that player either places the token or explicitly skips it.
    const active = st.activeCard && st.activeCard.playerId === player.id &&
      st.activeCard.cardType === "economy" ? st.activeCard : null;
    const shipbuilding = movement && movement.unitType === "caravan" &&
      uniqueInPlay(player, "indonesia") && !payload.skipShipbuilding &&
      !(active && active.shipbuildingWaterOffered);
    if (shipbuilding) {
      const waterSpaces = shipbuildingWaterSpaces(st, payload.fromKey);
      if (waterSpaces.length) {
        queuePendingChoice(st, {
          kind: "shipbuilding_water",
          playerId: player.id,
          title: "Shipbuilding: Place a Water Token?",
          source: "Shipbuilding",
          optional: true,
          fromKey: payload.fromKey,
          hexKeys: waterSpaces,
          explorationPayload: cloneSerializable(payload)
        });
        return st;
      }
    }

    if (movement) {
      const list = movement.unitType === "army" ? player.armies : player.caravans;
      const explorer = list.find((unit) => unit.id === movement.unitId);
      if (!explorer) return st;
      explorer.position = payload.fromKey;
      // The restriction attaches to this physical figure and this continuous
      // move. It is set at the irreversible reveal, remains set through tile
      // placement and the remaining movement, and is cleared only when that
      // figure's move actually ends.
      explorer.exploredThisMove = true;
      explorer.exploredThisCard = true;
      explorer.moveInProgress = true;
      activeMovementCard(st, player, movement.cardType, movement.tradePayment);
    }

    // Draw from the bottom and remove it from the secret sequence immediately.
    // pendingExploration is public, so every reconnected player sees exactly
    // the same revealed tile until it is placed or returned.
    const tileId = retainedTile || st.tileStack.pop();
    st.tileDeck = st.tileStack.slice();
    st.pendingExploration = {
      playerId: player.id,
      tileId,
      fromKey: payload.fromKey,
      unitId: movement ? movement.unitId : null,
      freeRun,
      kind: "map_tile",
      status: "revealed",
      source: freeRun && st.freeExplore ? st.freeExplore.source || null : null,
      followUp: freeRun && st.freeExplore ? st.freeExplore.followUp || null : null,
      scienceResolutionId: freeRun && st.freeExplore
        ? st.freeExplore.scienceResolutionId || null : null,
      movementContinuation: movement
    };
    // Materialise every currently legal footprint before the snapshot reaches
    // the browser. The canvas can now draw/hover the ghost even when the legal
    // tile extends beyond the radius that happened to be allocated at setup.
    const legalCells = getLegalExplorationPlacements(st, st.pendingExploration)
      .flatMap((placement) => placement.cellKeys || []);
    if (legalCells.length) ensureMapHexes(st.map, legalCells, 2);
    log(st, `${player.name} revealed a map tile while exploring.`);
    return st;
  }

  function finishExplorationFigure(st, pending) {
    const player = getPlayer(st, pending.playerId);
    if (!player) return;
    if (pending.unitId) {
      const unit = (player.armies || []).concat(player.caravans || [])
        .find((entry) => entry.id === pending.unitId);
      if (unit) {
        // Old mid-exploration saves may predate the begin-time marker. Restoring
        // it here preserves the same per-figure guard through continuation.
        unit.exploredThisMove = true;
        unit.exploredThisCard = true;
        unit.moveInProgress = true;
      }
    }
    if (pending.freeRun && st.freeExplore && st.freeExplore.playerId === player.id) {
      st.freeExplore = null;
    }
    if (pending.movementContinuation) {
      st.movementContinuation = {
        ...pending.movementContinuation,
        fromKey: pending.fromKey,
        status: "ready"
      };
    }
  }

  function finishExplorationFollowUp(st, pending) {
    if (!pending || pending.followUp !== "astronomy_finish") return false;
    const resolution = st.cardResolution;
    if (!resolution || resolution.cardType !== "science" ||
        resolution.cardName !== "Astronomy" ||
        resolution.id !== pending.scienceResolutionId) return false;
    return finishScienceResolution(st, resolution);
  }

  function apadanaControlSpaces(st, tileId) {
    return Object.entries(st.map.hexes).filter(([hexKey, hex]) => {
      if (!hex || !hex.active || hex.tileId !== tileId || hex.terrain === "water") return false;
      if (hex.city || hex.cityState || hex.control || hex.fortress || hex.barbarian ||
          hex.resource || hex.naturalWonder) return false;
      return getUnitsAt(st, hexKey).length === 0;
    }).map(([hexKey]) => hexKey);
  }

  function placePendingExploration(st, payload) {
    const pending = st.pendingExploration;
    if (!pending || pending.playerId !== payload.playerId) return st;
    const current = st.phase === "playing" ? currentPlayer(st) : null;
    if (!current || current.id !== pending.playerId) return st;
    if (payload.side && payload.side !== "A" && payload.side !== "B") return st;
    const side = payload.side === "B" ? "B" : "A";
    const rotation = Number.isInteger(payload.rotation) ? payload.rotation : 0;
    if (rotation < 0 || rotation > 5) return st;
    if (!canPlaceExploration(st, pending.tileId, payload.anchorKey, rotation, side, pending.fromKey)) return st;

    placeExploredTile(st, pending.tileId, payload.anchorKey, rotation, side);
    finishExplorationFigure(st, pending);
    const player = getPlayer(st, pending.playerId);
    const tile = st.tiles[pending.tileId];
    st.pendingExploration = null;
    log(st, `${player ? player.name : "Player"} explored and placed a ${tile ? tile.type : "unknown"} tile.`);
    if (player && pending.followUp === "apadana_control") {
      const spots = apadanaControlSpaces(st, pending.tileId);
      if (spots.length) {
        queuePendingChoice(st, {
          kind: "place_control",
          playerId: player.id,
          title: "Apadana: Place a Control Token on the New Tile",
          source: "Apadana",
          tileId: pending.tileId,
          hexKeys: spots
        });
      } else {
        log(st, `${player.name}'s newly explored tile has no empty non-water space for Apadana.`);
      }
    }
    finishExplorationFollowUp(st, pending);
    return st;
  }

  function abandonPendingExploration(st, payload) {
    const pending = st.pendingExploration;
    if (!pending || pending.playerId !== payload.playerId) return st;
    const current = st.phase === "playing" ? currentPlayer(st) : null;
    if (!current || current.id !== pending.playerId) return st;
    if (!canAbandonExploration(st, payload.playerId).ok) return st;

    st.tileStack = st.tileStack || [];
    // Terra p12: an unplaceable bottom tile returns to the top of the stack.
    st.tileStack.unshift(pending.tileId);
    st.tileDeck = st.tileStack.slice();
    finishExplorationFigure(st, pending);
    const player = getPlayer(st, pending.playerId);
    st.pendingExploration = null;
    log(st, `${player ? player.name : "Player"} found nowhere to put the new land; it goes back on the stack.`);
    finishExplorationFollowUp(st, pending);
    return st;
  }

  function canAbandonExploration(st, playerId) {
    const pending = st && st.pendingExploration;
    if (!pending) {
      return { ok: false, code: "exploration_missing", message: "No exploration tile is waiting." };
    }
    if (playerId && pending.playerId !== playerId) {
      return { ok: false, code: "exploration_owner_mismatch", message: "This expedition belongs to another player." };
    }
    if (hasLegalExplorationPlacement(st, pending)) {
      return {
        ok: false, code: "tile_still_fits",
        message: "The tile fits on at least one side, rotation, and anchor."
      };
    }
    return { ok: true, code: "ok", message: "Neither side fits at any rotation or anchor." };
  }

  // Terra p12: you may only strike out from the edge of the known world, and
  // only from a tile that has a capital city on it. Standing on any old rim
  // space is not enough — the expedition sets out from somewhere settled.
  function isExploreEligible(st, hexKey) {
    const tilesLeft = Array.isArray(st.tileStack)
      ? st.tileStack.length : (st.tileStackCount ?? st.tileDeckCount ?? 0);
    if (tilesLeft === 0) return false;
    const h = st.map.hexes[hexKey];
    if (!h || !h.active) return false;
    // On the edge of the map means the space next door is not board. A space on
    // the outermost ring of the coordinate grid has no entry there at all —
    // which is as off the map as it gets, and used to read as "not an edge",
    // so nobody standing on the rim could explore.
    const onEdge = hexNeighborKeys(h.q, h.r).some((nk) => {
      const nh = st.map.hexes[nk];
      return !nh || !nh.active;
    });
    if (!onEdge) return false;
    return tileHasCapital(st, h.tileId);
  }

  function tileHasCapital(st, tileId) {
    if (!tileId) return false;
    return Object.values(st.map.hexes)
      .some((h) => h.tileId === tileId && h.city && h.city.isCapital);
  }

  function validateExploration(st, tileId, anchorKey, rotation) {
    const tile = st.tiles[tileId];
    if (!tile || tile.placed) return { ok: false };
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
    if (cellKeys.length !== TILE_OFFSETS.length) return { ok: false };
    if (cellKeys.some((k) => st.map.hexes[k] && st.map.hexes[k].active)) return { ok: false };

    const cellSet = new Set(cellKeys);
    const boardNeighbors = new Set();
    cellKeys.forEach((k) => {
      hexNeighborKeys(parseQ(k), parseR(k)).forEach((nk) => {
        if (cellSet.has(nk)) return;
        const nh = st.map.hexes[nk];
        if (!nh || !nh.active) return;
        boardNeighbors.add(nk);
      });
    });

    // Terra p12: "Place that tile so that it touches FOUR SPACES already on the
    // map, including the space from which the player is exploring." The count
    // is checked here; the caller checks the reach to the exploring figure.
    //
    // I once relaxed this to 1, on the theory that four was base p14's
    // map-setup rule wrongly imported. It is not — p12 states it for
    // exploration in as many words. Exploration being hard to place is the
    // printed difficulty, and the real reason a tile could not be placed was
    // an authorization gate, not this.
    if (boardNeighbors.size < 4) return { ok: false };
    return { ok: true };
  }

  function placeExploredTile(st, tileId, anchorKey, rotation, side) {
    const tile = st.tiles[tileId];
    if (!tile) return;
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
    ensureMapHexes(st.map, cellKeys, 2);
    tile.placed = true;
    tile.anchorKey = anchorKey;
    tile.rotation = rotation;
    tile.side = side;
    applyTileCells(st, tile, cellKeys, side || "A");

    updateCoreAdjacency(st);
    fillEnclosedHoles(st);
  }

  function getReachableWithDist(st, startKey, maxSteps, unitType, playerId) {
    const player = getPlayer(st, playerId);
    const waterOk = canCrossWater(player, unitType);
    const terrainLimit = movementTerrainLimit(st, player, unitType);
    const distances = new Map([[startKey, 0]]);
    const transitOnly = new Set();
    const queue = [{ key: startKey, steps: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.steps >= maxSteps) continue;
      hexNeighborKeys(parseQ(cur.key), parseR(cur.key)).forEach((nk) => {
        if (distances.has(nk)) return;
        const h = st.map.hexes[nk];
        if (!h || !h.active) return;
        if (h.terrain === "water" && !waterOk) return;
        if (h.terrain !== "water" && moveDifficulty(st, h, player, unitType) > terrainLimit) return;
        if (unitType === "caravan" && h.barbarian &&
            !caravanCanDefeatBarbarian(player)) return;
        distances.set(nk, cur.steps + 1);
        if (unitType === "army" && armyCannotEndHere(st, h, playerId)) transitOnly.add(nk);
        if (!isForcedStopHex(st, h, unitType, playerId)) queue.push({ key: nk, steps: cur.steps + 1 });
      });
    }
    distances.delete(startKey);
    transitOnly.forEach((hexKey) => distances.delete(hexKey));
    return distances;
  }

  return {
    TERRAIN, TERRAIN_LABELS, FOCUS_TYPES, FOCUS_LABELS, FOCUS_SLOTS, FOCUS_TRADE_DESC, CARD_NAMES, CARD_ICONS,
    DISTRICTS, DISTRICT_LABELS, DISTRICT_EFFECTS, RESOURCES, EVENTS, EVENT_NAMES, EVENT_LABELS, CFG,
    NATURAL_WONDER_RESOURCES, WONDER_RESOURCE_ELIGIBILITY,
    WONDERS, ALL_WONDERS, WONDER_ERAS, CARD_TIERS, AGENDA_CARDS, victoryCards, DIPLOMACY_CARDS, CITY_STATE_DATA,
    LEADERS, getLeader, getLeaderAttackBonus, getCardName, getActiveUniqueCard, uniqueInPlay,
    CARD_DEFS, getCardEffectText, syncUnitCounts, advanceTech, TECH_LEVEL_SPACES, resolveEvent, GOVERNMENTS, CIV_STYLE,
    hasWonder, getWonderAttackBonus, getWonderDefenseBonus,
    TILE_OFFSETS, getCoreAnchors, BARBARIAN_DIRS,
    SAVE_SCHEMA_VERSION, MAX_LOG_ENTRIES, MAX_CHAT_ENTRIES,
    createState, createLobbyState, createPlayer, migrateState, finalizeSetup,
    applyAction, tryApplyAction, getActionPermission, projectState, currentPlayer, getPlayer, getUndoStatus,
    SEAT_COLORS, seatColor, colorName, availableColors, colorIsFree,
    getDiplomacyAttackBonus, getDiplomacyDefenseBonus, nonAggressionWith, openBordersWith,
    isCityDeveloped,
    getSlotValue, getSlotIndex, getCardTier, getCardTierValue: getCardTier,
    getMilitaryMove, getEconomyMove, getCultureMarkers, getMilitaryCombatBonus,
    getCityRange, getWonderCost, getWonderToken, getVisibleWonders,
    getControlledNaturalWonders, calculateWonderCost, calculateWonderProduction,
    calculateIndustryCityProduction, validateFocusTradeSpend,
    hasCityStateDiplomacy, availableDistrictTypes, growthCardProfile,
    industrialZoneCityOption, placementDifficulty,
    combatTotals, combatTokens, combatResources, combatPalenqueResources,
    combatSpendable, combatDefenderRoller,
    launchSpaces, caravanLaunchSpaces, unitStartSpaces,
    canCrossWater, computeScore,
    findDefenders, validControlHexes, validDistrictHexes, validReinforceHexes,
    validCityHexes, validWonderHexes, getReachable, findDefender, getUnitsAt,
    adjacentToCityState, adjacentToFriendlyControl, terrainDifficulty, movementTerrainLimit, isForcedStopHex,
    validateCulturePlacement, validateReinforcePlacement,
    validateIndustryCityAction,
    countControl, countWonders, countDeveloped, countCities, countNaturalWonders, findCapital,
    getClaimedAgendaCount,
    amundsenSites, wonderResolutionBlocked,
    getValidFortressHexes, getValidTileAnchors, getTileAnchorsAnyRotation, tilePlacementFor, getTileDef,
    tileHasCapital,
    getTileHexKeys, validateTilePlacement, ensureMapRadius, ensureMapHexes,
    offMapBarbarians, syncBarbarianRegistry,
    controlTokensOnMap, controlTokensInSupply, reclaimableControlHexes,
    placeControlToken,
    hexNeighborKeys, parseQ, parseR, key, hexDist, rollDie, rotateAxial,
    isExploreEligible, validateExploration, placeExploredTile,
    getLegalExplorationPlacements, hasLegalExplorationPlacement,
    canAbandonExploration, getReachableWithDist
  };
})();
