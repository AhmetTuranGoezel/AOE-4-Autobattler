"use strict";

const Game = (() => {
  const RULES = window.CivRulesData || {};
  const RULE_VERSION = RULES.rulesVersion || 0;
  const RULE_TILES = Array.isArray(RULES.TILES) ? RULES.TILES : [];
  const RULE_TILE_BY_ID = Object.fromEntries(RULE_TILES.map((t) => [t.id, t]));
  const CITY_STATE_DATA = RULES.CITY_STATES || {};
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
  // type at its tier (tier-I uniques replace the start card; higher tiers are
  // taken when upgrading to that tier).
  function getActiveUniqueCard(player, cardType) {
    const leader = getLeader(player);
    if (!leader || !leader.unique) return null;
    const u = leader.unique;
    if (u.type !== cardType) return null;
    const tier = (player.cardTiers && player.cardTiers[cardType]) || 1;
    return tier === u.tier ? u : null;
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
  const CARD_ICONS = {
    culture: "🎭", growth: "🌿", science: "🔬",
    economy: "💰", military: "⚔️", industry: "🏗️"
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
    maxPlayers: 4,
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
    }).filter((k) => mapHexes[k] !== undefined);
  }

  function validateTilePlacement(st, tileId, anchorKey, rotation) {
    const tile = st.setup.tiles[tileId];
    if (!tile || tile.placed) return { ok: false };
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
    if (cellKeys.length !== TILE_OFFSETS.length) return { ok: false };
    if (cellKeys.some((k) => st.map.hexes[k].active)) return { ok: false };

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
      hex.barbarian = false;
      hex.barbarianId = null;
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
      }
      if (cell.cityState) {
        const cs = CITY_STATE_DATA[cell.cityState] || { type: FOCUS_TYPES[Math.floor(Math.random() * FOCUS_TYPES.length)] };
        hex.cityState = { name: cell.cityState, type: cs.type, diplomacyCards: 2 };
      }
      if (cell.barbarian) {
        hex.barbarian = true;
        hex.barbarianId = cell.barbarian;
        hex.barbarianHome = cell.barbarian;   // printed on the tile; never moves
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

  function createSetupState(playerIds) {
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
      if (byEra.ancient.length > 2) byEra.ancient.pop();
      if (byEra.medieval.length > 2) byEra.medieval.pop();
      const deck = [...byEra.ancient, ...byEra.medieval, ...byEra.modern].map((w) => w.name);
      decks[type] = { deck, revealed: deck[0] || null, built: [], removed: [], token: 0 };
    });
    return decks;
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

  function createState(players) {
    const map = buildEmptyMap(CFG.mapRadius);
    const playerIds = players.map((p) => p.id);
    const setup = createSetupState(playerIds);

    const st = {
      rulesVersion: RULE_VERSION,
      phase: "setup",
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
      winner: null,
      log: []
    };

    const anchors = getCoreAnchors(st.players.length);
    setup.coreTiles.forEach((tileId, i) => {
      const anchor = anchors[i];
      const anchorKey = key(anchor.q, anchor.r);
      placeTileOnMap(st, tileId, anchorKey, anchor.rotation, setup.coreSide || "A");
    });

    log(st, "Core tiles placed. Fortress placement begins.");
    return st;
  }

  // A pre-game waiting room. The host creates this when opening an online room;
  // players join into it via ADD_PLAYER and the host triggers START_GAME once
  // everyone is present. Only then is the real board (createState) built, so a
  // late join can never wipe an in-progress setup.
  function createLobbyState(players, opts) {
    const list = (players || []).slice(0, CFG.maxPlayers);
    return {
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
      log: ["Waiting for players to join..."]
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
  function syncUnitCounts(st, player) {
    const capKey = st ? findCapital(st, player.id) : null;
    const want = {
      armies: CARD_TIERS.military.armies[getCardTier(player, "military") - 1],
      caravans: CARD_TIERS.economy.wagons[getCardTier(player, "economy") - 1]
    };
    for (const [key, n] of Object.entries(want)) {
      const list = player[key] || (player[key] = []);
      while (list.length > n) list.pop();
      while (list.length < n) list.push({ id: key + "-" + (list.length + 1) + "-" + player.id.slice(0, 4), position: capKey });
    }
  }

  function createPlayer(id, name, color) {
    const cardTiers = { culture: 1, growth: 1, science: 1, economy: 1, military: 1, industry: 1 };
    return {
      id, name, color,
      leaderId: "random",
      focusRow: FOCUS_TYPES.slice(),
      trade: { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 },
      resources: { marble: 0, mercury: 0, oil: 0, diamonds: 0 },
      tech: 0, techTier: 1,
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
    player.leaderId = player.leaderId || "random";
    player.trade = player.trade || { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 };
    player.resources = player.resources || { marble: 0, mercury: 0, oil: 0, diamonds: 0 };
    player.cardTiers = player.cardTiers || player.cardLevels || { culture: 1, growth: 1, science: 1, economy: 1, military: 1, industry: 1 };
    player.cardLevels = player.cardLevels || { ...player.cardTiers };
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
    return player;
  }

  function migrateState(st) {
    if (!st) return st;
    st.rulesVersion = st.rulesVersion || RULE_VERSION;
    st.players = (st.players || []).map(migratePlayer);
    st.tileDeck = st.tileDeck || (st.tileStack ? st.tileStack.slice() : []);
    st.wonderDecks = st.wonderDecks || makeWonderDecks();
    st.agendaCards = st.agendaCards || makeAgendaCards();
    st.claimedAgendas = st.claimedAgendas || {};
    if (st.ibrahimHolder === undefined) st.ibrahimHolder = null;
    st.pendingChoices = st.pendingChoices || [];
    st.manualLog = st.manualLog || [];
    st.log = st.log || [];
    Object.values(st.map?.hexes || {}).forEach((h) => {
      if (h.city && h.city.wonder) h.city.hasWonder = true;
      if (h.city && h.city.hasWonder && !h.city.wonder) h.city.wonder = { name: "Unknown", era: "ancient", type: "military", effect: "" };
      if (h.cityState && h.cityState.diplomacyCards === undefined) h.cityState.diplomacyCards = 2;
    });
    return st;
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
      const capKey = findCapital(st, player.id);
      if (capKey) {
        syncUnitCounts(st, player);
        player.armies.forEach((u) => { if (!u.position) u.position = capKey; });
        player.caravans.forEach((u) => { if (!u.position) u.position = capKey; });
      }
    });

    // Poland: before their first turn they raid a rival's diplomacy hand.
    st.players.forEach((player) => {
      if (hasLeader(player, "poland") && st.players.length > 1) {
        queuePendingChoice(st, {
          kind: "pick_rival_diplomacy", playerId: player.id,
          title: "Poland: Take a Diplomacy Card",
          options: st.players.filter((p) => p.id !== player.id).map((p) => ({ id: p.id, label: p.name }))
        });
      }
    });

    log(st, "Setup complete! Game begins.");
  }

  // --- Actions ---

  function applyAction(st, action) {
    migrateState(st);
    const { type, payload = {} } = action;
    const logBefore = st.log ? st.log.length : 0;
    const result = applyActionInner(st, action);
    if (result.log && result.log.length > logBefore && payload && payload.playerId) {
      result.lastAction = { type, playerId: payload.playerId, ts: Date.now() };
    }
    return result;
  }

  function applyActionInner(st, action) {
    const { type, payload = {} } = action;

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
        log(st, `${player.name} will lead ${leader.civ} (${leader.name}).`);
      } else {
        player.leaderId = "random";
        player.focusRow = FOCUS_TYPES.slice();
        log(st, `${player.name} will draw a random leader.`);
      }
      return st;
    }

    if (type === "START_GAME") {
      if (st.phase !== "lobby") return st;
      if (!st.solo && st.players.length < CFG.minPlayers) return st;
      assignRandomLeaders(st);
      const newState = createState(st.players);
      newState.solo = !!st.solo;
      // Carry the lobby chatter into the game log for continuity.
      newState.log = (st.log || []).concat(newState.log);
      return newState;
    }

    if (type === "ADD_PLAYER") {
      if (st.players.find((p) => p.id === payload.id)) return st;
      // Players may only join before the board is built (lobby), or during the
      // very first setup phase. Never mid-game.
      if (st.phase !== "lobby" && st.phase !== "setup") return st;
      if (st.players.length >= CFG.maxPlayers) return st;
      migratePlayer(payload);
      st.players.push(payload);
      st.turn.order.push(payload.id);
      if (st.phase === "lobby") {
        log(st, `${payload.name} joined the lobby. (${st.players.length}/${CFG.maxPlayers})`);
        return st;
      }
      // Rebuild setup with new player
      if (st.phase === "setup") {
        const newSetup = createSetupState(st.players.map((p) => p.id));
        st.setup = newSetup;
        st.turn.order = newSetup.order.slice();
        // Re-place core tiles
        st.map = buildEmptyMap(CFG.mapRadius);
        const anchors = getCoreAnchors(st.players.length);
        newSetup.coreTiles.forEach((tileId, i) => {
          const anchor = anchors[i];
          placeTileOnMap(st, tileId, key(anchor.q, anchor.r), anchor.rotation, newSetup.coreSide || "A");
        });
        st.tileDeck = newSetup.tileStack.slice();
      }
      log(st, `${payload.name} joined.`);
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
      if (st.phase !== "setup" || st.setup.phase !== "capital_tile") return st;
      const activeId = st.setup.order[st.setup.turnIndex];
      if (payload.playerId !== activeId) return st;
      const playerTiles = st.setup.playerTiles[payload.playerId] || [];
      if (!playerTiles.includes(payload.tileId)) return st;

      const result = validateTilePlacement(st, payload.tileId, payload.anchorKey, payload.rotation);
      if (!result.ok) return st;

      placeTileOnMap(st, payload.tileId, payload.anchorKey, payload.rotation, payload.side);
      st.setup.playerTiles[payload.playerId] = playerTiles.filter((id) => id !== payload.tileId);

      const player = getPlayer(st, payload.playerId);
      const tile = st.setup.tiles[payload.tileId];
      log(st, `${player ? player.name : "Player"} placed a ${tile.type} tile.`);

      // Check if all tiles placed
      const allDone = st.setup.order.every((id) => (st.setup.playerTiles[id] || []).length === 0);
      if (allDone) {
        finalizeSetup(st);
      } else {
        advanceSetupTurnTile(st);
      }
      return st;
    }

    if (type === "EXPLORE_TILE") {
      if (st.phase !== "playing") return st;
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      if (!st.tileStack || st.tileStack.length === 0) return st;
      if (payload.fromKey && !isExploreEligible(st, payload.fromKey)) return st;

      // Terra p12: a figure may explore once per move. That has to live here —
      // the UI's own bookkeeping is thrown away by a cancel, which used to hand
      // out a free tile every time you pressed Escape.
      let explorer = null;
      if (payload.fromKey) {
        explorer = player.armies.concat(player.caravans)
          .find((u) => u.position === payload.fromKey);
        if (!explorer) return st;                  // not your figure standing there
        if (explorer.exploredThisCard) return st;  // already explored this move
      }

      // Terra p12 step 1: the bottom tile, not the top.
      const tileId = st.tileStack[st.tileStack.length - 1];
      const result = validateExploration(st, tileId, payload.anchorKey, payload.rotation);
      if (!result.ok) return st;
      if (payload.fromKey) {
        const cellKeys = getTileHexKeys(payload.anchorKey, payload.rotation, st.map.hexes);
        const touchesUnit = cellKeys.some((ck) =>
          hexNeighborKeys(parseQ(ck), parseR(ck)).some((nk) => nk === payload.fromKey)
        );
        if (!touchesUnit) return st;
      }

      st.tileStack.pop();
      st.tileDeck = st.tileStack.slice();
      placeExploredTile(st, tileId, payload.anchorKey, payload.rotation, payload.side || "A");

      if (explorer) explorer.exploredThisCard = true;
      const tile = st.tiles[tileId];
      log(st, `${player.name} explored and placed a ${tile ? tile.type : "unknown"} tile.`);
      return st;
    }

    // Terra p12 step 2: a tile that cannot be placed anywhere goes back on top
    // of the stack and the expedition is over — the movement is still spent.
    if (type === "ABANDON_EXPLORATION") {
      const player = getPlayer(st, payload.playerId);
      if (!player || !st.tileStack || !st.tileStack.length) return st;
      const tileId = st.tileStack.pop();
      st.tileStack.unshift(tileId);
      st.tileDeck = st.tileStack.slice();
      const unit = player.armies.concat(player.caravans)
        .find((u) => u.position === payload.fromKey);
      if (unit) unit.exploredThisCard = true;
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
      if (!u || u.movedThisCard) return st;
    }

    if (type === "PLAY_CULTURE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const effectiveSlot = getSlotValue(player, "culture", st);
      // France: the latest-era wonder you own grants extra tokens (1/2/3).
      let maxMarkers = getCultureMarkers(player, payload.tradeSpent || 0, st);
      const franceBonus = hasLeader(player, "france") ? franceWonderBonus(st, player.id) : 0;
      maxMarkers += franceBonus;
      const hexKeys = (payload.hexKeys || []).slice(0, maxMarkers);
      let placed = 0;
      const placedMountains = [];
      const placedHills = [];
      for (const k of hexKeys) {
        const hx = st.map.hexes[k];
        if (!hx || !hx.active || hx.terrain === "water" || hx.city || hx.barbarian || hx.cityState) continue;
        if (hx.control) continue;
        if (placementDifficulty(st, hx, player, "control") > effectiveSlot) continue;
        if (!adjacentToFriendlyCity(st, hx, payload.playerId) && !adjacentToFriendlyControl(st, hx, payload.playerId)
          && !chichenAllows(st, payload.playerId, hx)) continue;
        if (hx.resource && hx.resource !== "wonder") {
          if (player.resources[hx.resource] !== undefined) player.resources[hx.resource]++;
          hx.resource = null;
        }
        hx.control = { ownerId: payload.playerId, fortified: false, district: null };
        placed++;
        if (hx.terrain === "mountain") placedMountains.push(k);
        if (hx.terrain === "hill") placedHills.push(k);
      }
      if (placed === 0) return st;
      resolveCard(st, player, "culture", payload.tradeSpent);
      log(st, `${player.name} placed ${placed} control marker(s).${franceBonus ? ` (+${franceBonus} from wonders)` : ""}`);
      // Inca: each token placed on a mountain may spill onto an adjacent space.
      if (hasLeader(player, "inca")) {
        placedMountains.forEach((k) => queueIncaChain(st, player, k));
      }
      // Stonehenge: a token landing on a hill can spread along the ridge.
      if (hasWonder(st, player.id, "Stonehenge")) {
        placedHills.forEach((k) => queueStonehengeChain(st, player, k));
      }
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_GROWTH_DISTRICT") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (!hex || !hex.active || hex.terrain === "water" || hex.city) return st;
      if (hex.control && hex.control.ownerId !== payload.playerId) return st;
      if (hex.control && hex.control.district) return st;
      if (!adjacentToFriendlyCity(st, hex, payload.playerId)) return st;
      const growthSlot = getSlotValue(player, "growth", st) + (payload.tradeSpent || 0);
      if (placementDifficulty(st, hex, player, "district") > growthSlot) return st;
      hex.control = { ownerId: payload.playerId, fortified: false, district: payload.district };
      resolveCard(st, player, "growth", payload.tradeSpent);
      log(st, `${player.name} placed a ${payload.district} district.`);
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_GROWTH_REINFORCE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      payload.hexKeys.forEach((k) => {
        const hex = st.map.hexes[k];
        if (hex && hex.control && hex.control.ownerId === payload.playerId) hex.control.fortified = true;
      });
      resolveCard(st, player, "growth", payload.tradeSpent);
      log(st, `${player.name} reinforced ${payload.hexKeys.length} marker(s).`);
      return st;
    }

    if (type === "PLAY_SCIENCE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      let bonus = 0;
      // China's Writing (unique Science I): +1 step while you control a wonder.
      if (hasLeader(player, "china") && getCardTier(player, "science") === 1 && countWonders(st, player.id) > 0) bonus += 1;
      // England's Natural History (unique Science III): +1 per resource type held.
      if (hasLeader(player, "england") && getCardTier(player, "science") >= 3) {
        bonus += RESOURCES.filter((r) => (player.resources[r] || 0) > 0).length;
      }
      advanceTech(st, player, payload.amount + bonus);
      resolveCard(st, player, "science", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_ECONOMY") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const unit = player.caravans.find((u) => u.id === payload.unitId);
      if (!unit) return st;
      const ecoHex = st.map.hexes[payload.toKey];
      if (!ecoHex || !ecoHex.active) return st;
      // Rome: a caravan leaving the economy card may set out from any friendly city.
      let startKey = unit.position || findCapital(st, payload.playerId);
      if (payload.startKey && payload.startKey !== startKey && hasLeader(player, "rome")) {
        const sh = st.map.hexes[payload.startKey];
        if (sh && sh.city && sh.city.ownerId === payload.playerId) startKey = payload.startKey;
      }
      if (!startKey) return st;
      const reachable = getReachable(st, startKey, getEconomyMove(player, st) + (payload.tradeSpent || 0), "caravan", payload.playerId);
      if (!reachable.has(payload.toKey)) return st;
      unit.position = payload.toKey;
      const hex = st.map.hexes[payload.toKey];
      const tradeGain = 2;
      // Egypt's Wheel (unique Economy I): trade runs also yield a resource.
      const wheelResource = hasLeader(player, "egypt") && getCardTier(player, "economy") === 1;
      const queueWheel = () => {
        if (!wheelResource) return;
        queuePendingChoice(st, {
          kind: "gain_resource", playerId: player.id,
          title: "Wheel: Gain a Resource",
          options: RESOURCES.map((r) => ({ id: r, label: r }))
        });
      };
      const arrival = hex && (hex.cityState || (hex.city && hex.city.ownerId !== payload.playerId))
        ? payload.toKey : null;
      if (arrival) {
        player.citiesTradedThisTurn = player.citiesTradedThisTurn || [];
        if (player.citiesTradedThisTurn.includes(arrival)) return st;   // p9
        player.citiesTradedThisTurn.push(arrival);
      }
      if (hex && hex.cityState) {
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
            options: FOCUS_TYPES.map((f) => ({ id: f, label: FOCUS_LABELS[f] }))
          });
        }
        unit.position = null;   // back onto the economy card
        log(st, `${player.name}'s caravan traded at ${hex.cityState.name} (+${tradeGain} ${tradeType} trade). Back to the economy card.`);
      } else if (hex && hex.city && hex.city.ownerId !== payload.playerId) {
        for (let i = 0; i < tradeGain; i++) {
          queuePendingChoice(st, {
            kind: "trade_any", playerId: player.id, amount: 1,
            title: `Trade run: place token ${i + 1} of ${tradeGain}`,
            options: FOCUS_TYPES.map((f) => ({ id: f, label: FOCUS_LABELS[f] }))
          });
        }
        grantPlayerDiplomacy(st, player, hex.city.ownerId);
        queueWheel();
        const hostPlayer = getPlayer(st, hex.city.ownerId);
        // Ibrahim card: its holder trading at an Ottoman city enriches both sides.
        if (st.ibrahimHolder === player.id && hasLeader(hostPlayer, "ottoman")) {
          player.trade.economy = Math.min(CFG.maxTrade, player.trade.economy + 1);
          hostPlayer.trade.economy = Math.min(CFG.maxTrade, hostPlayer.trade.economy + 1);
          log(st, `Ibrahim: ${player.name} and ${hostPlayer.name} each gain +1 economy trade.`);
        }
        // Ottoman Banking (unique Economy III): a caravan reaching the Ibrahim
        // holder's capital brings home a resource.
        if (hasLeader(player, "ottoman") && getCardTier(player, "economy") >= 3 &&
            st.ibrahimHolder && hex.city.ownerId === st.ibrahimHolder && hex.city.isCapital) {
          queuePendingChoice(st, {
            kind: "gain_resource", playerId: player.id,
            title: "Banking: Gain a Resource",
            options: RESOURCES.map((r) => ({ id: r, label: r }))
          });
        }
        unit.position = null;   // back onto the economy card
        log(st, `${player.name}'s caravan traded at a rival city (+${tradeGain} trade to place). Back to the economy card.`);
      } else {
        log(st, `${player.name} moved caravan.`);
      }
      unit.movedThisCard = true;
      st.activeCard = { playerId: player.id, cardType: "economy", tradeSpent: payload.tradeSpent || 0 };
      if (!unitsLeftToMove(player, "economy")) finishActiveCard(st);
      return st;
    }

    if (type === "PLAY_MILITARY_MOVE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit || !unit.position) return st;
      const moveHex = st.map.hexes[payload.toKey];
      if (!moveHex || !moveHex.active) return st;
      const reachable = getReachable(st, unit.position, getMilitaryMove(player), "army", payload.playerId);
      if (!reachable.has(payload.toKey)) return st;
      unit.position = payload.toKey; log(st, `${player.name} moved army.`);
      unit.movedThisCard = true;
      st.activeCard = { playerId: player.id, cardType: "military", tradeSpent: payload.tradeSpent || 0 };
      if (!unitsLeftToMove(player, "military")) finishActiveCard(st);
      return st;
    }

    if (type === "PLAY_MILITARY_ATTACK") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      if (st.combat && st.combat.turn !== "done") return st;   // one fight at a time
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit || !unit.position) return st;
      const hex = st.map.hexes[payload.toKey];
      if (!hex) return st;
      const reachable = getReachable(st, unit.position, getMilitaryMove(player), "army", payload.playerId);
      if (!reachable.has(payload.toKey) && unit.position !== payload.toKey) return st;

      // Nothing is rolled yet. The dice are thrown when somebody throws them,
      // and only then does the bidding start — the attacker spending everything
      // they mean to spend before the defender may answer (Terra p10).
      const leaderBonus = getLeaderAttackBonus(st, payload.playerId, payload.toKey);
      const tierBonus = getMilitaryCombatBonus(player);
      const atkParts = [{ label: "military card", value: payload.attackPower || 0 }];
      if (tierBonus) atkParts.push({ label: "card tier", value: tierBonus });
      if (leaderBonus) atkParts.push({ label: "leader", value: leaderBonus });
      st.combat = {
        attackerId: payload.playerId,
        unitId: payload.unitId,
        fromKey: payload.fromKey || unit.position,
        toKey: payload.toKey,
        defenderLabel: payload.defenderLabel,
        defenderOwnerId: payload.defenderOwnerId || null,
        atkBase: (payload.attackPower || 0) + tierBonus + leaderBonus,
        defBase: payload.defensePower || 0,
        atkParts,
        defParts: payload.defenderParts || [{ label: "defence", value: payload.defensePower || 0 }],
        leaderBonus,
        atkRoll: 0,
        defRoll: 0,
        rolled: false,
        atkTrade: 0,
        defTrade: 0,
        turn: "attacker",
        history: []
      };
      log(st, `${player.name} attacks ${payload.defenderLabel}.`);
      return st;
    }

    if (type === "COMBAT_ROLL") {
      const c = st.combat;
      if (!c || c.rolled || c.turn === "done") return st;
      c.atkRoll = rollDie();
      c.defRoll = rollDie();
      c.rolled = true;
      log(st, `Dice: ${c.atkRoll} against ${c.defRoll}.`);
      advanceCombat(st);
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
      if (!actor || (actor.trade.military || 0) <= 0) return st;
      actor.trade.military--;
      const before = side === "attacker" ? c.atkRoll : c.defRoll;
      if (payload.mode === "reroll") {
        // A token buys a fresh die instead of a flat +1 — and you get to look
        // before deciding whether to buy another.
        const rolled = rollDie();
        if (side === "attacker") c.atkRoll = rolled; else c.defRoll = rolled;
        c.history.push({ side, mode: "reroll", from: before, to: rolled });
        log(st, `${actor.name} rerolled a ${before} into a ${rolled}.`);
      } else {
        if (side === "attacker") c.atkTrade++; else c.defTrade++;
        c.history.push({ side, mode: "plus" });
        log(st, `${actor.name} spent a military trade token for +1.`);
      }
      advanceCombat(st);
      return st;
    }

    if (type === "PLAY_INDUSTRY_CITY") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (!isLegalCitySpace(st, hex, payload.hexKey, payload.playerId)) return st;
      const slot = getSlotValue(player, "industry", st);
      let resBonus = 0;
      if (payload.resources) Object.values(payload.resources).forEach((v) => { if (v) resBonus += CFG.resourceProdValue; });
      const totalProd = slot + (payload.tradeSpent || 0) + resBonus;
      if (placementDifficulty(st, hex, player, "city") > totalProd) return st;
      const range = getCityRange(player);
      if (!withinRangeOfFriendly(st, hex, payload.playerId, range)) return st;
      if (payload.resources) {
        for (const [r, count] of Object.entries(payload.resources)) {
          if ((player.resources[r] || 0) < count) return st;
        }
      }
      spendResources(player, payload.resources);
      if (hex) {
        hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
        if (hex.control && hex.control.ownerId === payload.playerId) hex.control = null;
      }
      resolveCard(st, player, "industry", payload.tradeSpent);
      log(st, `${player.name} built a new city.`);
      // England: the first city on a tile may plant a reinforced token beside it.
      if (hasLeader(player, "england") && hex.tileId) {
        const onlyCityOnTile = !Object.values(st.map.hexes).some((h2) =>
          h2 !== hex && h2.tileId === hex.tileId && h2.city);
        if (onlyCityOnTile) {
          const spots = hexNeighborKeys(hex.q, hex.r).filter((nk) => {
            const nh = st.map.hexes[nk];
            return nh && nh.active && nh.terrain !== "water" && !nh.city && !nh.control &&
              !nh.barbarian && !nh.cityState && !(nh.fortress && !nh.city);
          });
          if (spots.length) {
            queuePendingChoice(st, {
              kind: "place_control", playerId: player.id, fortified: true,
              title: "England: Reinforced Expansion",
              source: "england", hexKeys: spots
            });
          }
        }
      }
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_INDUSTRY_WONDER") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (!hex || !hex.city || hex.city.ownerId !== payload.playerId || hex.city.hasWonder) return st;
      if (payload.resources) {
        for (const [r, count] of Object.entries(payload.resources)) {
          if ((player.resources[r] || 0) < count) return st;
        }
      }
      const builtWonders = new Set();
      Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.wonder) builtWonders.add(h.city.wonder.name); });

      let wonder = null;
      if (payload.wonderName) {
        wonder = getVisibleWonders(st).find((w) => w.name === payload.wonderName && !builtWonders.has(w.name));
      }
      if (!wonder) {
        const available = getVisibleWonders(st).filter((w) => !builtWonders.has(w.name));
        wonder = available.length > 0 ? available[0] : ALL_WONDERS[0];
      }
      if (!wonder || builtWonders.has(wonder.name)) return st;

      const cost = getWonderCost(wonder.name, player, st);
      const slot = getSlotValue(player, "industry", st);
      // Nubia's Construction (unique Industry II): each resource spent is worth
      // 1 extra production.
      const perResource = CFG.resourceProdValue +
        (hasLeader(player, "nubia") && getCardTier(player, "industry") === 2 ? 1 : 0);
      let resBonus = 0;
      if (payload.resources) Object.values(payload.resources).forEach((v) => { if (v) resBonus += perResource; });
      let totalProd = slot + (payload.tradeSpent || 0) + resBonus;
      // Japan's Industrialization (unique Industry III): +1 production per district.
      if (hasLeader(player, "japan") && getCardTier(player, "industry") >= 3) {
        totalProd += Object.values(st.map.hexes).filter((h) =>
          h.control && h.control.ownerId === player.id && h.control.district).length;
      }
      if (totalProd < cost) return st;

      spendResources(player, payload.resources);
      hex.city.hasWonder = true;
      hex.city.wonder = { name: wonder.name, era: wonder.era, type: wonder.type, cost, effect: wonder.effect };
      advanceWonderDeck(st, wonder.type, wonder.name);
      resolveCard(st, player, "industry", payload.tradeSpent);
      log(st, `${player.name} built ${wonder.name}! (${wonder.effect})`);
      if (wonder.name === "Pyramids") {
        queueCardUpgrade(st, player, { onlyTier: 1, remaining: 3, source: "Pyramids", title: "Pyramids: Upgrade a Level-I Card" });
      }
      if (wonder.name === "Porcelain Tower") {
        queueCardUpgrade(st, player, { remaining: 2, source: "Porcelain Tower", title: "Porcelain Tower: Upgrade a Card" });
      }
      // Sumeria's Craftsmanship (unique Industry I): building also teaches.
      if (hasLeader(player, "sumeria") && getCardTier(player, "industry") === 1) {
        advanceTech(st, player, 1);
      }
      return st;
    }


    // No recruit actions: army and caravan counts are printed on the military
    // and economy focus cards, and syncUnitCounts keeps the figures in step.

    if (type === "ADD_TRADE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      player.trade[payload.cardType] = Math.min(CFG.maxTrade, player.trade[payload.cardType] + (payload.amount || 1));
      st.pendingBarbReward = null;
      log(st, `${player.name} gained +${payload.amount || 1} ${payload.cardType} trade.`);
      return st;
    }

    if (type === "END_FOCUS_CARD") {
      if (st.activeCard && st.activeCard.playerId === payload.playerId) finishActiveCard(st);
      return st;
    }

    if (type === "END_TURN") {
      // A card left mid-play still counts as played; it must never carry over.
      if (st.activeCard) finishActiveCard(st);
      const cp = currentPlayer(st);
      if (cp) {
        cp.cardPlayed = false;
        cp.wonAttackThisTurn = false;
        cp.citiesTradedThisTurn = [];
        (cp.caravans || []).forEach((u) => { u.movedThisCard = false; u.exploredThisCard = false; });
        (cp.armies || []).forEach((u) => { u.movedThisCard = false; u.exploredThisCard = false; });
      }
      st.turn.index = (st.turn.index + 1) % st.turn.order.length;
      st.lastCombat = null;
      // Ottoman: at the start of their turn they may hand out the Ibrahim card.
      const np = currentPlayer(st);
      if (np && hasLeader(np, "ottoman") && st.players.length > 1 &&
          !(st.pendingChoices || []).some((c) => c.kind === "give_ibrahim" && c.playerId === np.id)) {
        queuePendingChoice(st, {
          kind: "give_ibrahim", playerId: np.id,
          title: "Ottoman: Give the Ibrahim Card?",
          options: st.players.filter((p) => p.id !== np.id).map((p) => ({ id: p.id, label: p.name }))
            .concat([{ id: "keep", label: st.ibrahimHolder ? "Leave as is" : "Not this turn" }])
        });
      }
      if (np) queueStartOfTurnWonders(st, np);
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

  function advanceSetupTurnTile(st) {
    const order = st.setup.order;
    let next = st.setup.turnIndex;
    for (let i = 0; i < order.length; i++) {
      next = (next + 1) % order.length;
      if ((st.setup.playerTiles[order[next]] || []).length > 0) break;
    }
    st.setup.turnIndex = next;
    st.turn.index = next;
  }

  // --- Card Resolution ---

  // An economy or military card moves every figure of its kind, so the card is
  // only spent once all of them have had their move (or the player says stop).
  const player0 = (st, payload) => getPlayer(st, payload.playerId) || { caravans: [], armies: [] };

  function unitsLeftToMove(player, cardType) {
    const list = cardType === "economy" ? player.caravans : player.armies;
    return (list || []).filter((u) => !u.movedThisCard).length;
  }

  function finishActiveCard(st) {
    const active = st.activeCard;
    if (!active) return;
    const player = getPlayer(st, active.playerId);
    st.activeCard = null;
    if (!player) return;
    (player.caravans || []).forEach((u) => { u.movedThisCard = false; u.exploredThisCard = false; });
    (player.armies || []).forEach((u) => { u.movedThisCard = false; u.exploredThisCard = false; });
    resolveCard(st, player, active.cardType, active.tradeSpent);
  }

  function resolveCard(st, player, cardType, tradeSpent) {
    const idx = player.focusRow.indexOf(cardType);
    if (idx >= 0) {
      player.focusRow.splice(idx, 1);
      player.focusRow.unshift(cardType);
    }
    if (tradeSpent > 0) player.trade[cardType] = Math.max(0, player.trade[cardType] - tradeSpent);
    player.cardPlayed = true;

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

    // Nubia: resetting the growth card resolves one of your districts —
    // adapted here as the district event's reward (+1 trade of your choice).
    if (cardType === "growth" && hasLeader(player, "nubia")) {
      const hasDistrict = Object.values(st.map.hexes).some((h) =>
        h.control && h.control.ownerId === player.id && h.control.district);
      if (hasDistrict) {
        queuePendingChoice(st, {
          kind: "trade_any", playerId: player.id, amount: 1,
          title: "Nubia: District Effect",
          options: FOCUS_TYPES.map((f) => ({ id: f, label: FOCUS_LABELS[f] }))
        });
      }
    }

    // France's Humanism (unique Culture III): +1 trade token per mature city.
    if (cardType === "culture" && hasLeader(player, "france") && getCardTier(player, "culture") >= 3) {
      const mature = countDeveloped(st, player.id);
      for (let i = 0; i < mature; i++) {
        queuePendingChoice(st, {
          kind: "trade_any", playerId: player.id, amount: 1,
          title: "Humanism: Place a Trade Token",
          options: FOCUS_TYPES.map((f) => ({ id: f, label: FOCUS_LABELS[f] }))
        });
      }
    }
  }

  // Spaces on the tech dial that carry a technology level. Reaching or passing
  // one lets you swap in a focus card of exactly that level. The rulebook does
  // not number the spaces in text, so the positions here are evenly spread —
  // but level IV sits on 24, which the "past 24 go back to 15" rule requires.
  const TECH_LEVEL_SPACES = { 8: 2, 16: 3, 24: 4 };

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
      const options = FOCUS_TYPES.filter((f) => (player.cardTiers[f] || 1) < level);
      if (!options.length) {
        log(st, `${player.name} reached technology level ${level} with nothing left to upgrade.`);
        return;
      }
      queuePendingChoice(st, {
        kind: "science_upgrade",
        playerId: player.id,
        techLevel: level,
        title: `Technology Level ${level}: Take a Card`,
        options: options.map((f) => ({ id: f, label: `${FOCUS_LABELS[f]} \u2192 tier ${level}` }))
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

  function queuePendingChoice(st, choice) {
    st.pendingChoices = st.pendingChoices || [];
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
      const cardType = payload.optionId;
      const curTier = player.cardTiers[cardType] || 1;
      if (FOCUS_TYPES.includes(cardType) && curTier < 4 &&
          (!choice.onlyTier || curTier === choice.onlyTier)) {
        // A tech level hands you a card of exactly that level, not the next one
        // up (p8). Wonder-driven upgrades carry no level, so they step by one.
        player.cardTiers[cardType] = choice.techLevel
          ? Math.max(curTier, Math.min(4, choice.techLevel))
          : curTier + 1;
        player.cardLevels[cardType] = player.cardTiers[cardType];
        if (cardType === "military" || cardType === "economy") syncUnitCounts(st, player);
        log(st, `${player.name} upgraded ${FOCUS_LABELS[cardType]} to tier ${player.cardTiers[cardType]}.`);
        // Multi-card wonders queue their next prompt only now, so it lists the
        // tiers as they stand after this upgrade.
        if (choice.chain) queueCardUpgrade(st, player, choice.chain);
        resolved = true;
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
    } else if (choice.kind === "take_diplomacy") {
      const cardId = payload.optionId;
      const card = DIPLOMACY_CARDS[cardId];
      if (card) {
        // Swapping returns the card you held before taking the new one.
        player.diplomacy = (player.diplomacy || []).filter((d) => d.fromId !== choice.fromId);
        player.diplomacy.push({
          fromId: choice.fromId, cardId, name: card.name, type: cardId, effect: card.effect
        });
        const src = getPlayer(st, choice.fromId);
        log(st, `${player.name} took ${card.name} from ${src ? src.name : "a rival"}.`);
        resolved = true;
      }
    } else if (choice.kind === "trade_any") {
      const cardType = payload.optionId;
      if (FOCUS_TYPES.includes(cardType)) {
        const amount = choice.amount || 1;
        player.trade[cardType] = Math.min(CFG.maxTrade, (player.trade[cardType] || 0) + amount);
        log(st, `${player.name} gained +${amount} ${cardType} trade.`);
        resolved = true;
      }
    } else if (choice.kind === "place_control") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      const allowed = (choice.hexKeys || []).includes(hexKey);
      if (allowed && hex && hex.active && hex.terrain !== "water" && !hex.city && !hex.control && !hex.barbarian && !hex.cityState && !(hex.fortress && !hex.city)) {
        hex.control = { ownerId: player.id, fortified: !!choice.fortified, district: null };
        if (hex.resource && hex.resource !== "wonder" && player.resources[hex.resource] !== undefined) {
          player.resources[hex.resource]++;
          hex.resource = null;
        }
        log(st, `${player.name} placed a${choice.fortified ? " reinforced" : ""} control marker from ${choice.source || "a choice"}.`);
        // Inca chain: landing on another mountain keeps the expansion rolling.
        if (choice.source === "inca" && hex.terrain === "mountain") {
          queueIncaChain(st, player, hexKey);
        }
        if (choice.source === "Stonehenge" && hex.terrain === "hill") {
          queueStonehengeChain(st, player, hexKey);
        }
        checkDevelopment(st, player.id);
        resolved = true;
      }
    } else if (choice.kind === "remove_control") {
      const hexKey = payload.hexKey;
      const hex = st.map.hexes[hexKey];
      if ((choice.hexKeys || []).includes(hexKey) && hex && hex.control && hex.control.ownerId !== player.id) {
        hex.control = null;
        log(st, `${player.name} removed a rival control token (${choice.source || "effect"}).`);
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
    } else if (choice.kind === "gain_resource") {
      const r = payload.optionId;
      if (RESOURCES.includes(r)) {
        player.resources[r] = (player.resources[r] || 0) + 1;
        log(st, `${player.name} gained 1 ${r}.`);
        resolved = true;
      }
    } else if (choice.kind === "swap_cards") {
      const [a, b] = String(payload.optionId || "").split("|");
      const ia = player.focusRow.indexOf(a);
      const ib = player.focusRow.indexOf(b);
      if (ia >= 0 && ib >= 0) {
        player.focusRow[ia] = b;
        player.focusRow[ib] = a;
        log(st, `${player.name} swapped ${FOCUS_LABELS[a]} and ${FOCUS_LABELS[b]}.`);
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
        grantPlayerDiplomacy(st, player, rival.id);
        log(st, `${player.name} (Poland) took a diplomacy card from ${rival.name}.`);
        resolved = true;
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
        hex.barbarian = false;
        log(st, `${player.name} removed a barbarian from ${choice.source || "a choice"}.`);
        // A defeated barbarian pays a trade token wherever it was defeated
        // (Terra p9: "as normal"), not only when an army did the killing.
        st.pendingBarbReward = { playerId: player.id };
        resolved = true;
      }
    } else if (choice.kind === "manual") {
      manualLog(st, `${player.name} resolved manual choice: ${choice.title || "choice"}.`);
      resolved = true;
    }

    if (resolved || payload.dismiss) {
      st.pendingChoices.splice(idx, 1);
    }
    return st;
  }

  function manualLog(st, msg) {
    st.manualLog = st.manualLog || [];
    st.manualLog.push({ round: st.turn ? st.turn.round : 0, msg });
    log(st, `[Host] ${msg}`);
  }

  function applyHostHexEdit(st, hex, changes) {
    if ("active" in changes) hex.active = !!changes.active;
    if ("revealed" in changes) hex.revealed = !!changes.revealed;
    if (changes.terrain && TERRAIN[changes.terrain]) hex.terrain = changes.terrain;
    if ("resource" in changes) {
      hex.resource = changes.resource || null;
      if (hex.resource !== "wonder") hex.naturalWonder = null;
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
      effect: data.diplomacy || `Diplomacy with ${cityState.name}`
    });
    log(st, `${player.name} gained ${cityState.name} diplomacy.`);
    return true;
  }

  function grantPlayerDiplomacy(st, player, sourcePlayerId) {
    const source = getPlayer(st, sourcePlayerId);
    if (!source) return false;
    const held = (player.diplomacy || []).find((d) => d.fromId === sourcePlayerId);
    const cardIds = Object.keys(DIPLOMACY_CARDS);
    const taken = new Set(
      st.players.flatMap((p) => (p.diplomacy || [])
        .filter((d) => d.fromId === sourcePlayerId).map((d) => d.cardId))
    );
    // Each rival has four cards; you may not take one already in someone's hand,
    // and the one you hold is only on offer as a swap.
    const offer = cardIds.filter((id) => !taken.has(id) || (held && held.cardId === id));
    if (!offer.length) return false;
    queuePendingChoice(st, {
      kind: "take_diplomacy", playerId: player.id, fromId: sourcePlayerId,
      title: `Diplomacy with ${source.name}`,
      options: offer.map((id) => ({
        id,
        label: DIPLOMACY_CARDS[id].name + (held && held.cardId === id ? " (keep)" : "")
      }))
    });
    return true;
  }

  function returnDiplomacyFromSource(st, player, sourceId) {
    if (!player || !sourceId) return 0;
    const before = (player.diplomacy || []).length;
    player.diplomacy = (player.diplomacy || []).filter((d) => d.fromId !== sourceId && d.fromCityState !== sourceId && d.name !== sourceId);
    const returned = before - player.diplomacy.length;
    if (returned > 0) log(st, `${player.name} returned ${returned} diplomacy card(s).`);
    return returned;
  }

  function defeatEnemyUnitsAt(st, hexKey, attackerId) {
    st.players.forEach((p) => {
      if (p.id === attackerId) return;
      p.armies.forEach((u) => { if (u.position === hexKey) u.position = null; });
      p.caravans.forEach((u) => { if (u.position === hexKey) u.position = null; });
    });
  }

  // --- Combat, as an exchange -----------------------------------------------

  function combatTotals(c) {
    return {
      atk: c.atkRoll + c.atkBase + c.atkTrade,
      def: c.defRoll + c.defBase + c.defTrade
    };
  }

  // How many military trade tokens the side still has to bid with.
  function combatTokens(st, c, side) {
    const id = side === "attacker" ? c.attackerId : c.defenderOwnerId;
    const p = id ? getPlayer(st, id) : null;
    return p ? (p.trade.military || 0) : 0;
  }

  // Hands the bid on, skipping anybody who has nothing to spend — a barbarian,
  // a city-state and an empty military card all have no decision to make — and
  // settles the fight once both sides are done.
  function advanceCombat(st) {
    const c = st.combat;
    if (!c || !c.rolled) return;      // nobody bids over dice nobody has thrown
    while (c.turn !== "done" && combatTokens(st, c, c.turn) <= 0) {
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

    st.lastCombat = { attacker: player.name, defender: c.defenderLabel, toKey: c.toKey,
      atkRoll: c.atkRoll, defRoll: c.defRoll, atkTotal, defTotal, win,
      leaderBonus: c.leaderBonus, atkTrade: c.atkTrade, defTrade: c.defTrade,
      history: c.history.slice() };

    if (win) {
      player.maxCombatWin = Math.max(player.maxCombatWin || 0, atkTotal);
      unit.position = c.toKey;
      if (hex.fortress && !hex.city) {
        hex.city = { ownerId: c.attackerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
        log(st, `${player.name} captured the fortress!`);
      }
      if (hex.barbarian) {
        hex.barbarian = false;
        st.pendingBarbReward = { playerId: c.attackerId };
        log(st, `${player.name} defeated a barbarian! Choose a focus card for +1 trade.`);
        if (hasLeader(player, "sumeria")) {
          // Sumeria: a defeated barbarian also yields a resource of choice.
          queuePendingChoice(st, {
            kind: "gain_resource", playerId: player.id,
            title: "Sumeria: Gain a Resource",
            options: RESOURCES.map((r) => ({ id: r, label: r }))
          });
        }
      }
      if (hex.cityState) {
        const csType = hex.cityState.type;
        const csName = hex.cityState.name;
        player.trade[csType] = Math.min(CFG.maxTrade, player.trade[csType] + 1);
        if (!player.cityStateTokens.includes(csName)) player.cityStateTokens.push(csName);
        returnDiplomacyFromSource(st, player, csName);
        log(st, `${player.name} gained +1 ${csType} trade and a ${csName} token.`);
        hex.cityState = null;
        hex.city = { ownerId: c.attackerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
      }
      if (hex.control && hex.control.ownerId !== c.attackerId) {
        returnDiplomacyFromSource(st, player, hex.control.ownerId);
        hex.control = { ownerId: c.attackerId, fortified: false, district: null };
      }
      if (hex.city && hex.city.ownerId !== c.attackerId) {
        const defenderId = hex.city.ownerId;
        const defender = getPlayer(st, defenderId);
        returnDiplomacyFromSource(st, player, defenderId);
        if (defender) returnDiplomacyFromSource(st, defender, c.attackerId);
        if (defender) {
          defender.armies.forEach((u) => { if (u.position === c.toKey) u.position = null; });
          defender.caravans.forEach((u) => { if (u.position === c.toKey) u.position = null; });
        }
        // Statue of Liberty: the ring of rival control around the city falls with it.
        if (hasWonder(st, c.attackerId, "Statue of Liberty")) {
          hexNeighborKeys(hex.q, hex.r).forEach((nk) => {
            const nh = st.map.hexes[nk];
            if (nh && nh.control && nh.control.ownerId !== c.attackerId) {
              nh.control = { ownerId: c.attackerId, fortified: false, district: nh.control.district };
            }
          });
        }
        if (hex.city.isCapital && defender) {
          let taken = 0;
          FOCUS_TYPES.forEach((f) => {
            if (taken >= 2 && defender.trade[f] > 0) return;
            if (defender.trade[f] > 0) { defender.trade[f]--; player.trade[f] = Math.min(CFG.maxTrade, player.trade[f] + 1); taken++; }
          });
          if (taken > 0) log(st, `${player.name} seized ${taken} trade token(s) from ${defender.name}'s capital!`);
          player.capturedCapitals = (player.capturedCapitals || 0) + 1;
        }
        hex.city.ownerId = c.attackerId;
        hex.city.developed = false;
      }
      defeatEnemyUnitsAt(st, c.toKey, c.attackerId);
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
      unit.position = null;
      log(st, `${player.name} lost combat vs ${c.defenderLabel}. (${atkTotal} vs ${defTotal})`);
    }
    unit.movedThisCard = true;
    st.activeCard = {
      playerId: player.id, cardType: "military",
      tradeSpent: (st.activeCard && st.activeCard.cardType === "military" ? st.activeCard.tradeSpent : 0) + c.atkTrade
    };
    checkDevelopment(st, c.attackerId);
    if (!unitsLeftToMove(player, "military")) finishActiveCard(st);
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
    const barbs = Object.entries(st.map.hexes).filter(([, h]) => h.barbarian);
    if (!barbs.length) return;
    const roll = rollDie();
    let dir = HEX_DIRS[roll - 1];
    log(st, `Barbarians march (rolled ${roll}).`);

    // A barbarian may not stop on water: it keeps going the same way until it
    // reaches land. Walking off the edge sends it the opposite way instead.
    function destination(fromKey) {
      const from = st.map.hexes[fromKey];
      for (const d of [dir, { dq: -dir.dq, dr: -dir.dr }]) {
        let q = from.q, r = from.r;
        for (let step = 0; step < CFG.mapRadius * 2 + 2; step++) {
          q += d.dq; r += d.dr;
          const h = st.map.hexes[key(q, r)];
          if (!h || !h.active) break;            // off the map — try the other way
          if (h.terrain === "water") continue;   // can't stop here, keep walking
          return key(q, r);
        }
      }
      return null;
    }

    let moved = 0;
    barbs.forEach(([fromKey]) => {
      const from = st.map.hexes[fromKey];
      if (!from.barbarian) return;               // already displaced this pass
      const toKey = destination(fromKey);
      if (!toKey) return;
      const target = st.map.hexes[toKey];
      // Base p16 disperses barbarians that end up sharing a space; here they
      // simply never do, which reaches the same board.
      if (target.barbarian) return;

      const owner = hexOwnerAt(st, toKey);
      const ownerPlayer = owner ? getPlayer(st, owner) : null;

      // Terra p11: an army in the way is defeated, but it shields its space.
      // The barbarian falls back to the land it came from and nothing else in
      // the army's space is destroyed or flipped.
      const defenders = armiesAt(st, toKey);
      if (defenders.length) {
        defenders.forEach(({ player, unit }) => {
          unit.position = null;
          log(st, `Barbarians overran ${player.name}'s army at ${toKey}.`);
        });
        return;
      }

      // A reinforced marker or a capital turns the raid back: the barbarian
      // stays where it started.
      if (target.control && target.control.fortified) {
        target.control.fortified = false;
        log(st, `Barbarians battered a reinforced control marker at ${toKey}.`);
        return;
      }
      if (target.city && target.city.isCapital) {
        if (ownerPlayer) {
          let taken = 0;
          for (const f of FOCUS_TYPES) {
            while (taken < 2 && ownerPlayer.trade[f] > 0) { ownerPlayer.trade[f]--; taken++; }
            if (taken >= 2) break;
          }
          log(st, `Barbarians raided ${ownerPlayer.name}'s capital (-${taken} trade).`);
        }
        return;
      }

      // Everything else is overrun.
      from.barbarian = false;
      target.barbarian = true;
      target.barbarianId = from.barbarianId;
      from.barbarianId = null;
      moved++;

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
        target.developed = false;
        log(st, `Barbarians razed a city at ${toKey}.`);
      }
    });
    if (moved) log(st, `${moved} barbarian(s) moved.`);
  }

  function resolveEvent(st, evt) {
    if (evt === "barbarian_return") {
      const onBoard = new Set();
      Object.values(st.map.hexes).forEach((h) => { if (h.barbarian && h.barbarianId) onBoard.add(h.barbarianId); });
      let back = 0;
      Object.entries(st.map.hexes).forEach(([k, h]) => {
        if (!h.barbarianHome || onBoard.has(h.barbarianHome)) return;
        if (!h.active || h.barbarian || h.terrain === "water") return;
        // p12: the space has to be empty, or hold nothing but a caravan — and
        // that caravan is destroyed. Anything else and the barbarian waits
        // outside the map for its next chance.
        if (h.city || h.cityState || h.control || (h.fortress && !h.city)) return;
        // Terra p11: an army on the icon does not hold the barbarian off — it
        // is simply defeated, the same as a caravan.
        st.players.forEach((p) => {
          p.caravans.forEach((u) => {
            if (u.position !== k) return;
            u.position = null;
            log(st, `A returning barbarian destroyed ${p.name}'s caravan.`);
          });
          p.armies.forEach((u) => {
            if (u.position !== k) return;
            u.position = null;
            log(st, `A barbarian spawned on top of ${p.name}'s army.`);
          });
        });
        h.barbarian = true;
        h.barbarianId = h.barbarianHome;
        onBoard.add(h.barbarianHome);
        back++;
      });
      log(st, back ? `${back} defeated barbarian(s) returned.` : "No barbarians to return.");
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
        const districtHexes = { campus: [], trade: [], encampment: [], industrial: [], theater: [] };
        Object.entries(st.map.hexes).forEach(([k, h]) => {
          if (h.control && h.control.ownerId === player.id && h.control.district) {
            districtHexes[h.control.district].push(k);
          }
        });

        // Campus (Terra p9): one science trade for every FRIENDLY space with a
        // mountain or natural wonder in or adjacent to the campus. "Friendly"
        // means a space holding your own city or control token (base p7) — a
        // mountain nobody owns is worth nothing, however close it sits.
        if (districtHexes.campus.length) {
          const friendly = (h) => !!h && ((h.control && h.control.ownerId === player.id) ||
            (h.city && h.city.ownerId === player.id));
          const featured = (h) => !!h && (h.terrain === "mountain" || h.resource === "wonder" || !!h.naturalWonder);
          const scores = (h) => friendly(h) && featured(h);
          const paid = [];
          const nearMisses = [];
          districtHexes.campus.forEach((dk) => {
            [dk].concat(hexNeighborKeys(parseQ(dk), parseR(dk))).forEach((nk) => {
              const h = st.map.hexes[nk];
              if (scores(h)) paid.push(nk);
              else if (featured(h) && h.active) nearMisses.push(nk);
            });
          });
          if (paid.length) {
            player.trade.science = Math.min(CFG.maxTrade, player.trade.science + paid.length);
            log(st, `${player.name}: +${paid.length} science trade (campus).`);
            st.districtReport.push({ playerId: player.id, district: "campus", paid, nearMisses });
          } else {
            log(st, nearMisses.length
              ? `${player.name}'s campus scored nothing: the nearby mountains are not yours yet — a campus only counts spaces holding your own city or control token.`
              : `${player.name}'s campus scored nothing: no mountain or natural wonder in or beside it.`);
            st.districtReport.push({ playerId: player.id, district: "campus", paid: [], nearMisses });
          }
        }

        // Commercial Hub (trade): +1 trade per mature city OR +1 per adjacent desert
        if (districtHexes.trade.length) {
          let total = 0;
          const matureCities = countDeveloped(st, player.id);
          districtHexes.trade.forEach((dk) => {
            let adjDesert = 0;
            hexNeighborKeys(parseQ(dk), parseR(dk)).forEach((nk) => {
              const nh = st.map.hexes[nk];
              if (nh && nh.terrain === "desert") adjDesert++;
            });
            total += Math.max(matureCities, adjDesert);
          });
          if (total > 0) {
            queuePendingChoice(st, {
              kind: "trade_any",
              playerId: player.id,
              title: "Commercial Hub Trade",
              source: "commercial hub",
              amount: total,
              options: FOCUS_TYPES.map((f) => ({ id: f, label: FOCUS_LABELS[f] }))
            });
          }
        }

        // Encampment: defeat a chosen barbarian within 2, then choose a reinforcement.
        if (districtHexes.encampment.length) {
          // Terra p9: "either or both" — the reinforcement does not depend on
          // there being anything to kill.
          districtHexes.encampment.forEach((dk) => {
            const barbHexes = hexesWithinRange(st.map, dk, 2).filter((nk) => st.map.hexes[nk] && st.map.hexes[nk].barbarian);
            if (barbHexes.length) {
              queuePendingChoice(st, {
                kind: "remove_barbarian",
                playerId: player.id,
                title: "Encampment Strike",
                source: "encampment",
                districtKey: dk,
                hexKeys: barbHexes
              });
            }
            const reinforceHexes = getReinforceChoicesNear(st, dk, player.id, 2);
            if (reinforceHexes.length) {
              queuePendingChoice(st, {
                kind: "reinforce",
                playerId: player.id,
                title: "Encampment Reinforcement",
                source: "encampment",
                hexKeys: reinforceHexes
              });
            }
          });
        }

        // Industrial Zone: +1 trade per adjacent forest, max 3 per district
        if (districtHexes.industrial.length) {
          let total = 0;
          districtHexes.industrial.forEach((dk) => {
            let adjForest = 0;
            hexNeighborKeys(parseQ(dk), parseR(dk)).forEach((nk) => {
              const nh = st.map.hexes[nk];
              if (nh && nh.terrain === "forest") adjForest++;
            });
            total += Math.min(3, adjForest);
          });
          if (total > 0) {
            player.trade.industry = Math.min(CFG.maxTrade, player.trade.industry + total);
            log(st, `${player.name}: +${total} industry trade (industrial zone).`);
          }
        }

        // Theater Square: choose a control marker space within 2 of the district.
        if (districtHexes.theater.length) {
          districtHexes.theater.forEach((dk) => {
            const candidates = [];
            hexesWithinRange(st.map, dk, 2).forEach((nk) => {
              const nh = st.map.hexes[nk];
              if (nh && nh.active && nh.terrain !== "water" && !nh.city && !nh.control && !nh.barbarian && !nh.cityState && !(nh.fortress && !nh.city)) {
                candidates.push(nk);
              }
            });
            if (candidates.length) {
              queuePendingChoice(st, {
                kind: "place_control",
                playerId: player.id,
                title: "Theater Control Marker",
                source: "theater",
                hexKeys: candidates
              });
            }
          });
        }
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

  function checkDevelopment(st, playerId) {
    const player = getPlayer(st, playerId);
    Object.values(st.map.hexes).forEach((hex) => {
      if (!hex.city || hex.city.ownerId !== playerId) return;
      const wasDeveloped = hex.city.developed;
      hex.city.developed = isCityDeveloped(st, hex);
      if (!wasDeveloped && hex.city.developed && player) {
        const t = FOCUS_TYPES[Math.floor(Math.random() * FOCUS_TYPES.length)];
        player.trade[t] = Math.min(CFG.maxTrade, player.trade[t] + 1);
        log(st, `${player.name}'s city matured! +1 ${t} trade.`);
      }
    });
  }

  function isCityDeveloped(st, hex) {
    if (!hex.city) return false;
    // Sydney Opera House: rival control tokens also count toward maturity.
    const anyControlCounts = hasWonder(st, hex.city.ownerId, "Sydney Opera House");
    return hexNeighborKeys(hex.q, hex.r).every((nk) => {
      const n = st.map.hexes[nk];
      if (!n) return true;
      if (!n.active) return true;
      if (n.terrain === "water") return true;
      if (n.control && n.control.ownerId === hex.city.ownerId) return true;
      if (anyControlCounts && n.control) return true;
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
      case "hoarder": return totalResources(player) >= 5;
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
      if (h.city && h.city.ownerId === playerId) { score += 3; if (h.city.developed) score += 2; if (h.city.hasWonder) score += 4; }
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
    let c = 0; Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.developed) c++; }); return c;
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
      const edge = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)) >= st.map.radius - 1;
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
      if (h.city && h.city.ownerId === playerId && h.city.developed) tiles.add(h.tileId || `${Math.floor(h.q / 4)},${Math.floor(h.r / 4)}`);
    });
    return tiles.size;
  }
  function countWonderTypeVariety(st, playerId) {
    const types = new Set();
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.wonder) types.add(h.city.wonder.type); });
    return types.size;
  }
  function countNaturalWonders(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => {
      if (h.resource !== "wonder" && !h.naturalWonder) return;
      if ((h.control && h.control.ownerId === playerId) || (h.city && h.city.ownerId === playerId)) c++;
    });
    return c;
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

  function getSlotValue(player, cardType, st) {
    const idx = player.focusRow.indexOf(cardType);
    if (idx < 0) return 1;
    const tierBonus = player.techTier >= 4 ? 2 : (player.techTier >= 2 ? 1 : 0);
    // Georgia: a diplomacy card from a city-state of this card's type resolves
    // the card as though it sat 1 place farther to the right.
    const georgiaShift = hasLeader(player, "georgia") &&
      (player.diplomacy || []).some((d) => d.fromCityState && d.type === cardType) ? 1 : 0;
    // Taj Mahal: 1 place per world wonder you control matching this card's type.
    const tajShift = st && hasWonder(st, player.id, "Taj Mahal")
      ? countWondersOfType(st, player.id, cardType) : 0;
    const shift = getGovShift(player, cardType) + georgiaShift + tajShift;
    return Math.min(5, slotAfterShift(idx, shift) + tierBonus);
  }

  function getMilitaryMove(player) {
    const tier = getCardTier(player, "military");
    // Scythia's Horseback Riding (unique Military I): armies ride 6 spaces.
    if (tier === 1 && hasLeader(player, "scythia")) return 6;
    return CARD_TIERS.military.move[tier - 1];
  }

  function getEconomyMove(player, st) {
    const tier = getCardTier(player, "economy");
    // Egypt's Wheel (unique Economy I): caravans roll 4 spaces.
    const base = (tier === 1 && hasLeader(player, "egypt")) ? 4 : CARD_TIERS.economy.move[tier - 1];
    // Colossus: 6 additional spaces of caravan movement on the economy card.
    const colossus = st && player && hasWonder(st, player.id, "Colossus") ? 6 : 0;
    return base + colossus;
  }

  function getCultureMarkers(player, tradeSpent, st) {
    const tier = getCardTier(player, "culture");
    const base = CARD_TIERS.culture.markers[tier - 1];
    return base + tradeSpent;
  }

  function getMilitaryCombatBonus(player) {
    const tier = getCardTier(player, "military");
    return CARD_TIERS.military.combatBonus[tier - 1];
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

  // Wonders that trigger at the start of a player's turn. Each is optional, so
  // they queue a dismissible choice rather than resolving themselves.
  function queueStartOfTurnWonders(st, player) {
    const pid = player.id;

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
        if (!h.control || h.control.ownerId === pid) return;
        const nextToFriendly = hexNeighborKeys(h.q, h.r).some((nk) => {
          const nh = st.map.hexes[nk];
          if (!nh) return false;
          return (nh.city && nh.city.ownerId === pid) ||
                 (nh.control && nh.control.ownerId === pid);
        });
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
  function getWonderAttackBonus(st, playerId, toKey) {
    if (!toKey) return 0;
    let bonus = 0;
    if (hasWonder(st, playerId, "Terracotta Army")) bonus += 2;
    if (hasWonder(st, playerId, "Alhambra")) bonus += 2;
    if (hasWonder(st, playerId, "Big Ben")) bonus += 2 * countAdjacentCaravans(st, toKey, playerId);
    if (hasWonder(st, playerId, "Kremlin")) {
      const h = st.map.hexes[toKey];
      const defenderId = h ? hexOwnerAt(st, toKey) : null;
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
  const queueStonehengeChain = (st, player, key) =>
    queueControlChain(st, player, key, { terrain: "hill", source: "Stonehenge", title: "Stonehenge: Hill Chain" });

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
    queuePendingChoice(st, {
      kind: "science_upgrade",
      playerId: player.id,
      title: opts.title,
      source: opts.source,
      onlyTier: opts.onlyTier || null,
      chain: opts.remaining > 1 ? Object.assign({}, opts, { remaining: opts.remaining - 1 }) : null,
      options: types.map((f) => ({ id: f, label: FOCUS_LABELS[f] + " to tier " + ((player.cardTiers[f] || 1) + 1) }))
    });
  }

  // Leader combat bonus for an attack into toKey (shown in the combat preview
  // and applied by the engine so both always agree).
  function getLeaderAttackBonus(st, playerId, toKey) {
    const player = getPlayer(st, playerId);
    if (!player || !toKey) return 0;
    let bonus = 0;
    const h = st.map.hexes[toKey];
    // Scythia: +3 when attacking a grassland or hill space.
    if (hasLeader(player, "scythia") && h && (h.terrain === "grass" || h.terrain === "hill")) bonus += 3;
    // Ottoman: +2 against the player holding the Ibrahim card.
    if (hasLeader(player, "ottoman") && st.ibrahimHolder && hexOwnerAt(st, toKey) === st.ibrahimHolder) bonus += 2;
    // World wonders the attacker controls.
    bonus += getWonderAttackBonus(st, playerId, toKey);
    return bonus;
  }

  function getCityRange(player) {
    const tier = getCardTier(player, "industry");
    return CARD_TIERS.industry.cityRange[tier - 1];
  }

  function getWonderCost(wonderName, player, st) {
    const wonder = getWonderByName(wonderName);
    let cost = wonder ? wonder.cost : 7;
    // Egypt: all world wonders cost 1 less. This one really is permanent.
    if (hasLeader(player, "egypt")) cost -= 1;
    // Terra p14: and 1 less again while the dial's trade token sits on it.
    if (st && getWonderToken(st, wonderName)) cost -= 1;
    return Math.max(1, cost);
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

  function getVisibleWonders(st) {
    if (!st || !st.wonderDecks) return [];
    return Object.entries(st.wonderDecks).map(([type, data]) => {
      const name = data.revealed || (data.deck && data.deck[0]);
      const wonder = getWonderByName(name);
      return wonder ? { ...wonder, type, token: data.token || 0, left: data.deck.length } : null;
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
  // Leader sheets bend the base numbers here rather than at each call site.
  function placementDifficulty(st, h, player, context) {
    return japanCoastalDifficulty(st, h, player, terrainDifficulty(h));
  }

  function moveDifficulty(st, h, player, unitType) {
    return japanCoastalDifficulty(st, h, player, terrainDifficulty(h));
  }

  function validControlHexes(st, playerId, maxTerrain) {
    const player = getPlayer(st, playerId);
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (placementDifficulty(st, h, player, "control") > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || h.control || (h.fortress && !h.city)) return;
      // Base p8: "on a space adjacent to a friendly city" — next to one of your
      // own control tokens is not enough, or territory would sprawl for ever.
      if (!adjacentToFriendlyCity(st, h, playerId) && !chichenAllows(st, playerId, h)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validDistrictHexes(st, playerId, maxTerrain) {
    const player = getPlayer(st, playerId);
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (placementDifficulty(st, h, player, "district") > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || (h.fortress && !h.city)) return;
      if (h.control && (h.control.ownerId !== playerId || h.control.district)) return;
      if (!adjacentToFriendlyCity(st, h, playerId)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validReinforceHexes(st, playerId) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.active && h.control && h.control.ownerId === playerId && !h.control.fortified) valid.push(k);
    });
    return new Set(valid);
  }

  function validCityHexes(st, playerId, production, cityRange) {
    const range = cityRange || 2;
    const player = getPlayer(st, playerId);
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!isLegalCitySpace(st, h, k, playerId)) return;
      if (placementDifficulty(st, h, player, "city") > production) return;
      if (!withinRangeOfFriendly(st, h, playerId, range)) return;
      valid.push(k);
    });
    return new Set(valid);
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

  function isForcedStopHex(st, h, unitType, playerId) {
    if (h.barbarian || h.cityState || (h.fortress && !h.city)) return true;
    if (h.control && h.control.ownerId !== playerId) return true;
    if (h.city && h.city.ownerId !== playerId) return true;
    return st.players.some((p) => p.id !== playerId && p.armies.some((u) => u.position === key(h.q, h.r)));
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
        if (unitType === "caravan" && h.barbarian) return;
        visited.add(nk);
        reachable.add(nk);
        if (!isForcedStopHex(st, h, unitType, playerId)) queue.push({ key: nk, steps: cur.steps + 1 });
      });
    }
    return reachable;
  }

  function findDefender(st, hexKey, attackerId) {
    const h = st.map.hexes[hexKey];
    if (!h) return null;
    // Every defender hands back where its number came from, so the fight can
    // show you what you are up against instead of one unexplained total.
    const only = (label, value) => [{ label, value }];
    if (h.fortress && !h.city) {
      return { type: "fortress", label: "Fortress", power: CFG.fortressDefense,
        parts: only("uncontrolled fort", CFG.fortressDefense) };
    }
    if (h.barbarian) {
      const terrainDiff = h.resource === "wonder" ? 5 : TERRAIN[h.terrain];
      return { type: "barbarian", label: "Barbarian", power: CFG.barbarianBase + terrainDiff,
        parts: only(`${TERRAIN_LABELS[h.terrain] || h.terrain} terrain`, CFG.barbarianBase + terrainDiff) };
    }
    if (h.cityState) return { type: "citystate", label: h.cityState.name, power: CFG.cityStateDefense,
      parts: only("city-state", CFG.cityStateDefense) };
    // Defender-side leader effects: China's reinforced tokens count double,
    // Scythia adds +3 defending a grassland or hill space.
    const defenderLeaderBonus = (ownerId) => {
      const owner = getPlayer(st, ownerId);
      return hasLeader(owner, "scythia") && (h.terrain === "grass" || h.terrain === "hill") ? 3 : 0;
    };
    const reinforcedValue = (ownerId) => {
      const owner = getPlayer(st, ownerId);
      return countAdjacentReinforced(st, hexKey, ownerId) * (hasLeader(owner, "china") ? 2 : 1);
    };
    const breakdown = (ownerId, terrainPart) => {
      const list = [terrainPart];
      const push = (label, value) => { if (value) list.push({ label, value }); };
      push("reinforced", h.control && h.control.fortified ? 1 : 0);
      push("adjacent reinforced", reinforcedValue(ownerId));
      push("leader", defenderLeaderBonus(ownerId));
      push("wonder", getWonderDefenseBonus(st, ownerId, hexKey));
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
    return null;
  }

  function armiesAt(st, hexKey) {
    const found = [];
    st.players.forEach((p) => {
      p.armies.forEach((unit) => { if (unit.position === hexKey) found.push({ player: p, unit }); });
    });
    return found;
  }

  function getUnitsAt(st, hexKey) {
    const units = [];
    st.players.forEach((p) => {
      p.armies.forEach((u) => { if (u.position === hexKey) units.push({ type: "army", playerId: p.id, color: p.color }); });
      p.caravans.forEach((u) => { if (u.position === hexKey) units.push({ type: "caravan", playerId: p.id, color: p.color }); });
    });
    return units;
  }

  function withinRangeOfCity(st, hex, playerId, range) {
    return Object.values(st.map.hexes).some((h) => {
      if (!h.city || h.city.ownerId !== playerId) return false;
      return hexDist(h, hex) <= range;
    });
  }
  function adjacentToFriendlyCity(st, hex, playerId) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => {
      const n = st.map.hexes[nk]; return n && n.city && n.city.ownerId === playerId;
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
    return Object.values(st.map.hexes).some((h) => {
      if (h.city && h.city.ownerId === playerId) return hexDist(h, hex) <= range;
      if (h.control && h.control.ownerId === playerId) return hexDist(h, hex) <= range;
      return false;
    });
  }

  function countAdjacentReinforced(st, hexKey, ownerId) {
    let count = 0;
    hexNeighborKeys(parseQ(hexKey), parseR(hexKey)).forEach((nk) => {
      const nh = st.map.hexes[nk];
      if (nh && nh.control && nh.control.ownerId === ownerId && nh.control.fortified) count++;
    });
    return count;
  }

  function hexesWithinRange(map, hexKey, range) {
    const h = map.hexes[hexKey];
    if (!h) return [];
    const result = [];
    Object.entries(map.hexes).forEach(([k, hex]) => {
      if (k !== hexKey && hexDist(h, hex) <= range) result.push(k);
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
  function log(st, msg) { st.log.push(msg); }

  // --- Exploration (Terra Incognita) ---

  // Terra p12: you may only strike out from the edge of the known world, and
  // only from a tile that has a capital city on it. Standing on any old rim
  // space is not enough — the expedition sets out from somewhere settled.
  function isExploreEligible(st, hexKey) {
    if (!st.tileStack || st.tileStack.length === 0) return false;
    const h = st.map.hexes[hexKey];
    if (!h || !h.active) return false;
    const onEdge = hexNeighborKeys(h.q, h.r).some((nk) => {
      const nh = st.map.hexes[nk];
      return nh && !nh.active;
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
    if (cellKeys.some((k) => st.map.hexes[k].active)) return { ok: false };

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

    if (boardNeighbors.size < 4) return { ok: false };
    return { ok: true };
  }

  function placeExploredTile(st, tileId, anchorKey, rotation, side) {
    const tile = st.tiles[tileId];
    if (!tile) return;
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
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
        if (unitType === "caravan" && h.barbarian) return;
        distances.set(nk, cur.steps + 1);
        if (!isForcedStopHex(st, h, unitType, playerId)) queue.push({ key: nk, steps: cur.steps + 1 });
      });
    }
    distances.delete(startKey);
    return distances;
  }

  return {
    TERRAIN, TERRAIN_LABELS, FOCUS_TYPES, FOCUS_LABELS, FOCUS_SLOTS, FOCUS_TRADE_DESC, CARD_NAMES, CARD_ICONS,
    DISTRICTS, DISTRICT_LABELS, DISTRICT_EFFECTS, RESOURCES, EVENTS, EVENT_NAMES, EVENT_LABELS, CFG,
    WONDERS, ALL_WONDERS, WONDER_ERAS, CARD_TIERS, AGENDA_CARDS, victoryCards, DIPLOMACY_CARDS, CITY_STATE_DATA,
    LEADERS, getLeader, getLeaderAttackBonus, getCardName, getActiveUniqueCard,
    CARD_DEFS, getCardEffectText, syncUnitCounts, advanceTech, resolveEvent, GOVERNMENTS, CIV_STYLE,
    hasWonder, getWonderAttackBonus, getWonderDefenseBonus,
    TILE_OFFSETS, getCoreAnchors,
    createState, createLobbyState, createPlayer, migrateState, applyAction, currentPlayer, getPlayer,
    getSlotValue, getSlotIndex, getCardTier, getCardTierValue: getCardTier,
    getMilitaryMove, getEconomyMove, getCultureMarkers, getMilitaryCombatBonus,
    getCityRange, getWonderCost, getWonderToken, getVisibleWonders,
    combatTotals, combatTokens, canCrossWater, computeScore,
    validControlHexes, validDistrictHexes, validReinforceHexes,
    validCityHexes, validWonderHexes, getReachable, findDefender, getUnitsAt,
    adjacentToCityState, adjacentToFriendlyControl, terrainDifficulty,
    countControl, countWonders, countDeveloped, countCities, findCapital,
    getClaimedAgendaCount,
    getValidFortressHexes, getValidTileAnchors, getTileAnchorsAnyRotation, tilePlacementFor, getTileDef,
    tileHasCapital,
    getTileHexKeys, validateTilePlacement,
    hexNeighborKeys, parseQ, parseR, key, hexDist, rollDie, rotateAxial,
    isExploreEligible, validateExploration, placeExploredTile, getReachableWithDist
  };
})();
