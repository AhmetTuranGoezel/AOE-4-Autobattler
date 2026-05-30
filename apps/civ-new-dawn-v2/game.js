"use strict";

const Game = (() => {
  const RULES = window.CivRulesData || {};
  const RULE_VERSION = RULES.rulesVersion || 0;
  const RULE_TILES = Array.isArray(RULES.TILES) ? RULES.TILES : [];
  const RULE_TILE_BY_ID = Object.fromEntries(RULE_TILES.map((t) => [t.id, t]));
  const CITY_STATE_DATA = RULES.CITY_STATES || {};
  const DIPLOMACY_CARDS = RULES.DIPLOMACY_CARDS || {};
  const AGENDA_CARDS = Array.isArray(RULES.AGENDA_CARDS) ? RULES.AGENDA_CARDS : [];
  const TERRAIN = { grass: 1, hill: 2, forest: 3, desert: 4, mountain: 5, water: 1 };
  const TERRAIN_LABELS = { grass: "Grassland", hill: "Hills", forest: "Forest", desert: "Desert", mountain: "Mountain", water: "Water" };
  const FOCUS_TYPES = ["culture", "growth", "science", "economy", "military", "industry"];
  const FOCUS_LABELS = { culture: "Culture", growth: "Growth", science: "Science", economy: "Economy", military: "Military", industry: "Industry" };
  const FOCUS_SLOTS = [1, 1, 2, 3, 4, 5];
  const FOCUS_TRADE_DESC = {
    culture: "+1 effective slot value per trade spent",
    growth: "+1 extra district/reinforce per trade",
    science: "+1 tech advance per trade spent",
    economy: "+1 caravan movement per trade spent",
    military: "+1 combat strength per trade spent",
    industry: "+1 production per trade spent"
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
  const EVENTS = ["barbarian_spawn", "barbarian_move", "district_event", "gov_change", "wonder_aging"];
  const EVENT_LABELS = { barbarian_spawn: "Barbarian Spawn", barbarian_move: "Barbarian Move", district_event: "District Event", gov_change: "Government Change", wonder_aging: "Wonder Aging" };
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
    techResetAt: 15,
    maxRounds: 20,
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
    const boardNeighbors = new Set();
    let touchesCore = false;
    let touchesCoreAdj = false;

    cellKeys.forEach((k) => {
      hexNeighborKeys(parseQ(k), parseR(k)).forEach((nk) => {
        if (cellSet.has(nk)) return;
        const nh = st.map.hexes[nk];
        if (!nh || !nh.active) return;
        boardNeighbors.add(nk);
        if (nh.core) touchesCore = true;
        if (nh.coreAdjacent) touchesCoreAdj = true;
      });
    });

    if (!tile.isCore && boardNeighbors.size < 4) return { ok: false };
    if (!tile.isCore && st.setup.phase !== "capital_tile" && !touchesCore && !touchesCoreAdj) return { ok: false };
    return { ok: true, touchesCore, touchesCoreAdj };
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

    const coreCount = playerIds.length <= 3 ? 2 : 4;
    shuffle(mapDeck);
    const coreTiles = mapDeck.splice(Math.max(0, mapDeck.length - coreCount), coreCount);
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
      decks[type] = { deck, revealed: deck[0] || null, built: [] };
    });
    return decks;
  }

  function makeAgendaCards() {
    const fortress = AGENDA_CARDS.filter((a) => a.fortress).slice(0, 2);
    const normal = shuffle(AGENDA_CARDS.filter((a) => !a.fortress).slice()).slice(0, 3);
    return fortress.concat(normal).map((a) => a.id);
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

    const anchors = getCoreAnchors(players.length);
    setup.coreTiles.forEach((tileId, i) => {
      const anchor = anchors[i];
      const anchorKey = key(anchor.q, anchor.r);
      placeTileOnMap(st, tileId, anchorKey, anchor.rotation, setup.coreSide || "A");
    });

    log(st, "Core tiles placed. Fortress placement begins.");
    return st;
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
      govBonus: { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 },
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
    player.govBonus = player.govBonus || { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 };
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
        if (player.armies.length === 0) {
          player.armies.push({ id: `army-1-${player.id.slice(0,4)}`, position: capKey });
        }
        player.armies.forEach((u) => { if (!u.position) u.position = capKey; });
        player.caravans.forEach((u) => { if (!u.position) u.position = capKey; });
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

    if (type === "ADD_PLAYER") {
      if (st.players.find((p) => p.id === payload.id)) return st;
      migratePlayer(payload);
      st.players.push(payload);
      st.turn.order.push(payload.id);
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

      const tileId = st.tileStack[0];
      const result = validateExploration(st, tileId, payload.anchorKey, payload.rotation);
      if (!result.ok) return st;
      if (payload.fromKey) {
        const cellKeys = getTileHexKeys(payload.anchorKey, payload.rotation, st.map.hexes);
        const touchesUnit = cellKeys.some((ck) =>
          hexNeighborKeys(parseQ(ck), parseR(ck)).some((nk) => nk === payload.fromKey)
        );
        if (!touchesUnit) return st;
      }

      st.tileStack.shift();
      st.tileDeck = st.tileStack.slice();
      placeExploredTile(st, tileId, payload.anchorKey, payload.rotation, payload.side || "A");

      const tile = st.tiles[tileId];
      log(st, `${player.name} explored and placed a ${tile ? tile.type : "unknown"} tile.`);
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
      if (!EVENTS.includes(payload.event)) return st;
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

    if (type.startsWith("PLAY_") || type === "END_TURN" || type === "RECRUIT_ARMY" ||
        type === "RECRUIT_CARAVAN" || type === "ASSIGN_GOV") {
      if (st.phase !== "playing") return st;
    }
    if (type.startsWith("PLAY_") || type === "END_TURN") {
      const cp = currentPlayer(st);
      if (!cp) return st;
      if (payload.playerId && cp.id !== payload.playerId) return st;
      if (!payload.playerId) payload.playerId = cp.id;
    }

    if (type === "PLAY_CULTURE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const effectiveSlot = getSlotValue(player, "culture", st) + (payload.tradeSpent || 0);
      const maxMarkers = getCultureMarkers(player, payload.tradeSpent || 0, st);
      const hexKeys = (payload.hexKeys || []).slice(0, maxMarkers);
      let placed = 0;
      for (const k of hexKeys) {
        const hx = st.map.hexes[k];
        if (!hx || !hx.active || hx.terrain === "water" || hx.city || hx.barbarian || hx.cityState) continue;
        if (hx.control) continue;
        if (terrainDifficulty(hx) > effectiveSlot) continue;
        if (!adjacentToFriendlyCity(st, hx, payload.playerId) && !adjacentToFriendlyControl(st, hx, payload.playerId)) continue;
        if (hx.resource && hx.resource !== "wonder") {
          if (player.resources[hx.resource] !== undefined) player.resources[hx.resource]++;
          hx.resource = null;
        }
        hx.control = { ownerId: payload.playerId, fortified: false, district: null };
        placed++;
      }
      if (placed === 0) return st;
      resolveCard(st, player, "culture", payload.tradeSpent);
      log(st, `${player.name} placed ${placed} control marker(s).`);
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
      if (terrainDifficulty(hex) > growthSlot) return st;
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
      advanceTech(st, player, payload.amount);
      resolveCard(st, player, "science", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_ECONOMY") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const unit = player.caravans.find((u) => u.id === payload.unitId);
      if (!unit || !unit.position) return st;
      const ecoHex = st.map.hexes[payload.toKey];
      if (!ecoHex || !ecoHex.active) return st;
      const reachable = getReachable(st, unit.position, getEconomyMove(player) + (payload.tradeSpent || 0), "caravan", payload.playerId);
      if (!reachable.has(payload.toKey)) return st;
      unit.position = payload.toKey;
      const hex = st.map.hexes[payload.toKey];
      if (hex && hex.cityState) {
        const tradeType = hex.cityState.type;
        if (player.trade[tradeType] !== undefined) {
          player.trade[tradeType] = Math.min(CFG.maxTrade, player.trade[tradeType] + 2);
        }
        grantCityStateDiplomacy(st, player, hex.cityState);
        const capKey = findCapital(st, payload.playerId);
        unit.position = capKey;
        log(st, `${player.name}'s caravan traded at ${hex.cityState.name} (+2 ${tradeType} trade). Returned to capital.`);
      } else if (hex && hex.city && hex.city.ownerId !== payload.playerId) {
        const tradeType = payload.tradeType || "economy";
        if (player.trade[tradeType] !== undefined) {
          player.trade[tradeType] = Math.min(CFG.maxTrade, player.trade[tradeType] + 2);
        }
        grantPlayerDiplomacy(st, player, hex.city.ownerId);
        const capKey = findCapital(st, payload.playerId);
        unit.position = capKey;
        log(st, `${player.name}'s caravan traded at foreign city (+2 ${tradeType} trade). Returned to capital.`);
      } else {
        log(st, `${player.name} moved caravan.`);
      }
      resolveCard(st, player, "economy", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_MILITARY_MOVE") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit || !unit.position) return st;
      const moveHex = st.map.hexes[payload.toKey];
      if (!moveHex || !moveHex.active) return st;
      const reachable = getReachable(st, unit.position, getMilitaryMove(player) + (payload.tradeSpent || 0), "army", payload.playerId);
      if (!reachable.has(payload.toKey)) return st;
      unit.position = payload.toKey; log(st, `${player.name} moved army.`);
      resolveCard(st, player, "military", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_MILITARY_ATTACK") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit || !unit.position) return st;
      const hex = st.map.hexes[payload.toKey];
      if (!hex) return st;
      const reachable = getReachable(st, unit.position, getMilitaryMove(player) + (payload.tradeSpent || 0), "army", payload.playerId);
      if (!reachable.has(payload.toKey) && unit.position !== payload.toKey) return st;

      const atkRoll = rollDie();
      const defRoll = rollDie();
      const tierCombatBonus = getMilitaryCombatBonus(player);
      const atkTotal = atkRoll + payload.attackPower + tierCombatBonus;
      const defTotal = defRoll + payload.defensePower;
      const win = atkTotal > defTotal;

      st.lastCombat = { attacker: player.name, defender: payload.defenderLabel, atkRoll, defRoll, atkTotal, defTotal, win };

      if (win) {
        player.maxCombatWin = Math.max(player.maxCombatWin || 0, atkTotal);
        unit.position = payload.toKey;
        if (hex.fortress && !hex.city) {
          hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
          log(st, `${player.name} captured the fortress!`);
        }
        if (hex.barbarian) {
          hex.barbarian = false;
          st.pendingBarbReward = { playerId: payload.playerId };
          log(st, `${player.name} defeated a barbarian! Choose a focus card for +1 trade.`);
        }
        if (hex.cityState) {
          const csType = hex.cityState.type;
          const csName = hex.cityState.name;
          player.trade[csType] = Math.min(CFG.maxTrade, player.trade[csType] + 1);
          if (!player.cityStateTokens.includes(csName)) player.cityStateTokens.push(csName);
          returnDiplomacyFromSource(st, player, csName);
          log(st, `${player.name} gained +1 ${csType} trade and a ${csName} token.`);
          hex.cityState = null;
          hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false, wonder: null };
        }
        if (hex.control && hex.control.ownerId !== payload.playerId) {
          returnDiplomacyFromSource(st, player, hex.control.ownerId);
          hex.control = { ownerId: payload.playerId, fortified: false, district: null };
        }
        if (hex.city && hex.city.ownerId !== payload.playerId) {
          const defenderId = hex.city.ownerId;
          const defender = getPlayer(st, defenderId);
          returnDiplomacyFromSource(st, player, defenderId);
          if (defender) returnDiplomacyFromSource(st, defender, payload.playerId);
          if (defender) {
            defender.armies.forEach((u) => { if (u.position === payload.toKey) u.position = null; });
            defender.caravans.forEach((u) => { if (u.position === payload.toKey) u.position = null; });
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
          hex.city.ownerId = payload.playerId;
          hex.city.developed = false;
        }
        defeatEnemyUnitsAt(st, payload.toKey, payload.playerId);
        log(st, `${player.name} won combat vs ${payload.defenderLabel}! (${atkTotal} vs ${defTotal})`);
      } else {
        unit.position = null;
        log(st, `${player.name} lost combat vs ${payload.defenderLabel}. (${atkTotal} vs ${defTotal})`);
      }
      resolveCard(st, player, "military", payload.tradeSpent);
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_INDUSTRY_CITY") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.cardPlayed) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (!hex || !hex.active || hex.terrain === "water" || hex.city || hex.cityState || hex.barbarian) return st;
      if (adjacentToAnyCity(st, hex) || adjacentToCityState(st, hex)) return st;
      const slot = getSlotValue(player, "industry", st);
      let resBonus = 0;
      if (payload.resources) Object.values(payload.resources).forEach((v) => { if (v) resBonus += CFG.resourceProdValue; });
      const totalProd = slot + (payload.tradeSpent || 0) + resBonus;
      if (terrainDifficulty(hex) > totalProd) return st;
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

      const cost = getWonderCost(wonder.name);
      const slot = getSlotValue(player, "industry", st);
      let resBonus = 0;
      if (payload.resources) Object.values(payload.resources).forEach((v) => { if (v) resBonus += CFG.resourceProdValue; });
      const totalProd = slot + (payload.tradeSpent || 0) + resBonus;
      if (totalProd < cost) return st;

      spendResources(player, payload.resources);
      hex.city.hasWonder = true;
      hex.city.wonder = { name: wonder.name, era: wonder.era, type: wonder.type, cost, effect: wonder.effect };
      advanceWonderDeck(st, wonder.type, wonder.name);
      resolveCard(st, player, "industry", payload.tradeSpent);
      log(st, `${player.name} built ${wonder.name}! (${wonder.effect})`);
      return st;
    }

    if (type === "ASSIGN_GOV") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const maxGov = CFG.maxGovMarkers;
      const markers = (payload.markers || []).slice(0, maxGov);
      player.govMarkers = markers;
      FOCUS_TYPES.forEach((f) => { player.govBonus[f] = 0; });
      markers.forEach((f) => { player.govBonus[f] = (player.govBonus[f] || 0) + 1; });
      log(st, `${player.name} reassigned gov markers.`);
      return st;
    }

    if (type === "RECRUIT_ARMY") {
      const player = getPlayer(st, payload.playerId);
      const maxArmies = CFG.maxArmies + (player && player.techTier >= 3 ? 1 : 0);
      if (!player || player.armies.length >= maxArmies) return st;
      const capitalKey = findCapital(st, payload.playerId);
      player.armies.push({ id: `army-${player.armies.length + 1}`, position: capitalKey });
      log(st, `${player.name} recruited an army.`);
      return st;
    }

    if (type === "RECRUIT_CARAVAN") {
      const player = getPlayer(st, payload.playerId);
      const maxCaravans = CFG.maxCaravans + (player && player.techTier >= 3 ? 1 : 0);
      if (!player || player.caravans.length >= maxCaravans) return st;
      const capitalKey = findCapital(st, payload.playerId);
      player.caravans.push({ id: `caravan-${player.caravans.length + 1}`, position: capitalKey });
      log(st, `${player.name} recruited a caravan.`);
      return st;
    }

    if (type === "ADD_TRADE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      player.trade[payload.cardType] = Math.min(CFG.maxTrade, player.trade[payload.cardType] + (payload.amount || 1));
      st.pendingBarbReward = null;
      log(st, `${player.name} gained +${payload.amount || 1} ${payload.cardType} trade.`);
      return st;
    }

    if (type === "END_TURN") {
      const cp = currentPlayer(st);
      if (cp) cp.cardPlayed = false;
      st.turn.index = (st.turn.index + 1) % st.turn.order.length;
      st.lastCombat = null;
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

  function resolveCard(st, player, cardType, tradeSpent) {
    const idx = player.focusRow.indexOf(cardType);
    if (idx >= 0) {
      player.focusRow.splice(idx, 1);
      player.focusRow.unshift(cardType);
    }
    if (tradeSpent > 0) player.trade[cardType] = Math.max(0, player.trade[cardType] - tradeSpent);
    player.cardPlayed = true;
  }

  function advanceTech(st, player, amount) {
    player.tech += amount;
    if (player.tech >= CFG.techWheelSize) {
      player.tech = player.tech - CFG.techResetAt;
      player.techTier = Math.min(4, player.techTier + 1);
      const upgradeOptions = FOCUS_TYPES.filter((f) => (player.cardTiers[f] || 1) < 4);
      if (upgradeOptions.length) {
        queuePendingChoice(st, {
          kind: "science_upgrade",
          playerId: player.id,
          title: "Upgrade Focus Card",
          options: upgradeOptions.map((f) => ({ id: f, label: `${FOCUS_LABELS[f]} to tier ${(player.cardTiers[f] || 1) + 1}` }))
        });
      }
      log(st, `${player.name} advanced to tech tier ${player.techTier}!`);
    } else {
      log(st, `${player.name} advanced tech by ${amount}. (${player.tech}/${CFG.techWheelSize})`);
    }
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
      if (FOCUS_TYPES.includes(cardType) && (player.cardTiers[cardType] || 1) < 4) {
        player.cardTiers[cardType] = (player.cardTiers[cardType] || 1) + 1;
        player.cardLevels[cardType] = player.cardTiers[cardType];
        log(st, `${player.name} upgraded ${FOCUS_LABELS[cardType]} to tier ${player.cardTiers[cardType]}.`);
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
        hex.control = { ownerId: player.id, fortified: false, district: null };
        log(st, `${player.name} placed a control marker from ${choice.source || "a choice"}.`);
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
        const reinforceHexes = getReinforceChoicesNear(st, choice.districtKey, player.id, 2);
        if (reinforceHexes.length) {
          queuePendingChoice(st, {
            kind: "reinforce",
            playerId: player.id,
            title: "Encampment Reinforcement",
            source: "encampment",
            hexKeys: reinforceHexes
          });
        }
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
    if ((player.diplomacy || []).some((d) => d.fromId === sourcePlayerId)) return false;
    const source = getPlayer(st, sourcePlayerId);
    if (!source) return false;
    const cardIds = Object.keys(DIPLOMACY_CARDS);
    const cardId = cardIds[0] || "embassy";
    const card = DIPLOMACY_CARDS[cardId] || { name: "Diplomacy", effect: "Manual diplomacy effect" };
    player.diplomacy.push({ fromId: sourcePlayerId, cardId, name: card.name, type: cardId, effect: card.effect });
    log(st, `${player.name} gained a diplomacy card from ${source.name}.`);
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

  // --- Event Wheel ---

  function advanceEventWheel(st) {
    const wheel = st.eventWheel;
    wheel.position = (wheel.position + 1) % wheel.events.length;
    const evt = wheel.events[wheel.position];
    log(st, `Event: ${EVENT_LABELS[evt]}`);
    resolveEvent(st, evt);
  }

  function resolveEvent(st, evt) {
    if (evt === "barbarian_spawn") {
      const candidates = Object.keys(st.map.hexes).filter((k) => {
        const h = st.map.hexes[k];
        return h.active && h.terrain !== "water" && !h.city && !h.cityState && !h.barbarian && !h.control;
      });
      const count = Math.min(rollDie() <= 3 ? 1 : 2, candidates.length);
      pickRandom(candidates, count).forEach((k) => { st.map.hexes[k].barbarian = true; });
      if (count > 0) log(st, `${count} barbarian(s) spawned.`);
    }
    if (evt === "barbarian_move") {
      const barbs = Object.entries(st.map.hexes).filter(([, h]) => h.barbarian);
      let moved = 0;
      barbs.forEach(([k, hex]) => {
        const dir = HEX_DIRS[Math.floor(Math.random() * 6)];
        const tk = key(hex.q + dir.dq, hex.r + dir.dr);
        const target = st.map.hexes[tk];
        if (!target || !target.active || target.terrain === "water") return;
        hex.barbarian = false;
        if (target.control && !target.control.fortified) {
          target.control = null;
          target.barbarian = true;
          log(st, "Barbarian destroyed a control marker!");
        } else if (target.control && target.control.fortified) {
          target.control.fortified = false;
        } else if (!target.barbarian && !target.city) {
          target.barbarian = true;
        }
        moved++;
      });
      if (moved) log(st, `${moved} barbarian(s) moved.`);
    }
    if (evt === "district_event") {
      st.turn.order.map((id) => getPlayer(st, id)).filter(Boolean).forEach((player) => {
        const districtHexes = { campus: [], trade: [], encampment: [], industrial: [], theater: [] };
        Object.entries(st.map.hexes).forEach(([k, h]) => {
          if (h.control && h.control.ownerId === player.id && h.control.district) {
            districtHexes[h.control.district].push(k);
          }
        });

        // Campus: +1 trade (science) per adjacent mountain/wonder, max 3 per campus
        if (districtHexes.campus.length) {
          let total = 0;
          districtHexes.campus.forEach((dk) => {
            let adjCount = 0;
            hexNeighborKeys(parseQ(dk), parseR(dk)).forEach((nk) => {
              const nh = st.map.hexes[nk];
              if (nh && (nh.terrain === "mountain" || nh.resource === "wonder")) adjCount++;
            });
            total += Math.min(3, adjCount);
          });
          if (total > 0) {
            player.trade.science = Math.min(CFG.maxTrade, player.trade.science + total);
            log(st, `${player.name}: +${total} science trade (campus).`);
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
    if (evt === "gov_change") log(st, "Players may reassign gov markers.");
    if (evt === "wonder_aging") {
      let wc = 0;
      Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.hasWonder) wc++; });
      if (wc) log(st, `${wc} wonder(s) on the map.`);
    }
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
    return hexNeighborKeys(hex.q, hex.r).every((nk) => {
      const n = st.map.hexes[nk];
      if (!n) return true;
      if (!n.active) return true;
      if (n.terrain === "water") return true;
      if (n.control && n.control.ownerId === hex.city.ownerId) return true;
      return false;
    });
  }

  function checkVictory(st) {
    updateAgendaClaims(st);
    const activeAgendaCount = (st.agendaCards || []).length || 5;
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

  function updateAgendaClaims(st) {
    st.claimedAgendas = st.claimedAgendas || {};
    const active = new Set(st.agendaCards || []);
    st.players.forEach((p) => {
      const claims = st.claimedAgendas[p.id] || {};
      AGENDA_CARDS.forEach((agenda) => {
        if (!active.has(agenda.id)) return;
        const met = isAgendaMet(st, p, agenda.id);
        if (agenda.fortress) {
          claims[agenda.id] = met;
        } else if (met) {
          claims[agenda.id] = true;
        }
      });
      st.claimedAgendas[p.id] = claims;
      p.agendaClaims = claims;
    });
  }

  function getClaimedAgendaCount(st, playerId) {
    const active = new Set(st.agendaCards || []);
    const claims = (st.claimedAgendas && st.claimedAgendas[playerId]) || {};
    return Object.entries(claims).filter(([id, value]) => value && active.has(id)).length;
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
      case "industrious": return countDistrictTypes(st, player.id) >= 5;
      case "provincial": return countMatureCityTiles(st, player.id) >= 4;
      case "diversified": return countWonderTypeVariety(st, player.id) >= 3;
      case "populous": return countDeveloped(st, player.id) >= 5;
      case "preservationist": return countNaturalWonders(st, player.id) >= 2;
      case "expansionist": return countCityTiles(st, player.id) >= 6;
      case "prolific": return maxWondersInEra(st, player.id) >= 2;
      case "progressive": return countWonderEras(st, player.id) >= 3;
      default: return false;
    }
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

  function getSlotValue(player, cardType, st) {
    const idx = player.focusRow.indexOf(cardType);
    if (idx < 0) return 1;
    const tierBonus = player.techTier >= 4 ? 2 : (player.techTier >= 2 ? 1 : 0);
    return Math.min(5, FOCUS_SLOTS[idx] + (player.govBonus[cardType] || 0) + tierBonus);
  }

  function getMilitaryMove(player) {
    const tier = getCardTier(player, "military");
    return CARD_TIERS.military.move[tier - 1];
  }

  function getEconomyMove(player) {
    const tier = getCardTier(player, "economy");
    return CARD_TIERS.economy.move[tier - 1];
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

  function getCityRange(player) {
    const tier = getCardTier(player, "industry");
    return CARD_TIERS.industry.cityRange[tier - 1];
  }

  function getWonderCost(wonderName) {
    const wonder = getWonderByName(wonderName);
    return wonder ? wonder.cost : 7;
  }

  function getWonderByName(wonderName) {
    return ALL_WONDERS.find((w) => w.name === wonderName) || null;
  }

  function getVisibleWonders(st) {
    if (!st || !st.wonderDecks) return [];
    return Object.entries(st.wonderDecks).map(([type, data]) => {
      const name = data.revealed || (data.deck && data.deck[0]);
      const wonder = getWonderByName(name);
      return wonder ? { ...wonder, type } : null;
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
  }
  function getSlotIndex(player, cardType) { return player.focusRow.indexOf(cardType); }

  function terrainDifficulty(h) {
    if (h.resource === "wonder") return 5;
    return TERRAIN[h.terrain] || 1;
  }

  function validControlHexes(st, playerId, maxTerrain) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (terrainDifficulty(h) > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || h.control || (h.fortress && !h.city)) return;
      if (!adjacentToFriendlyCity(st, h, playerId) && !adjacentToFriendlyControl(st, h, playerId)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validDistrictHexes(st, playerId, maxTerrain) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (terrainDifficulty(h) > maxTerrain) return;
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
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (terrainDifficulty(h) > production) return;
      if (h.city || h.cityState || h.barbarian || (h.fortress && !h.city)) return;
      if (adjacentToAnyCity(st, h) || adjacentToCityState(st, h) || adjacentToFortress(st, h)) return;
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
        if (h.terrain !== "water" && terrainDifficulty(h) > terrainLimit) return;
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
    if (h.fortress && !h.city) {
      return { type: "fortress", label: "Fortress", power: CFG.fortressDefense };
    }
    if (h.barbarian) {
      const terrainDiff = h.resource === "wonder" ? 5 : TERRAIN[h.terrain];
      return { type: "barbarian", label: "Barbarian", power: CFG.barbarianBase + terrainDiff };
    }
    if (h.cityState) return { type: "citystate", label: h.cityState.name, power: CFG.cityStateDefense };
    if (h.control && h.control.ownerId !== attackerId) {
      const reinforced = countAdjacentReinforced(st, hexKey, h.control.ownerId);
      const def = terrainDifficulty(h) + (h.control.fortified ? 2 : 0) + reinforced;
      return { type: "control", label: "Control Marker", power: def };
    }
    if (h.city && h.city.ownerId !== attackerId) {
      const reinforced = countAdjacentReinforced(st, hexKey, h.city.ownerId);
      return { type: "city", label: h.city.isCapital ? "Capital" : "City", power: terrainDifficulty(h) * 2 + reinforced };
    }
    for (const p of st.players) {
      if (p.id === attackerId) continue;
      for (const u of p.armies) {
        if (u.position === hexKey) return { type: "army", label: `${p.name}'s Army`, power: 3 };
      }
    }
    return null;
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
  function adjacentToFriendlyControl(st, hex, playerId) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => {
      const n = st.map.hexes[nk]; return n && n.control && n.control.ownerId === playerId;
    });
  }
  function withinRangeOfFriendly(st, hex, playerId, range) {
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

  function isExploreEligible(st, hexKey) {
    if (!st.tileStack || st.tileStack.length === 0) return false;
    const h = st.map.hexes[hexKey];
    if (!h || !h.active) return false;
    return hexNeighborKeys(h.q, h.r).some((nk) => {
      const nh = st.map.hexes[nk];
      return nh && !nh.active;
    });
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
        if (h.terrain !== "water" && terrainDifficulty(h) > terrainLimit) return;
        if (unitType === "caravan" && h.barbarian) return;
        distances.set(nk, cur.steps + 1);
        if (!isForcedStopHex(st, h, unitType, playerId)) queue.push({ key: nk, steps: cur.steps + 1 });
      });
    }
    distances.delete(startKey);
    return distances;
  }

  return {
    TERRAIN, TERRAIN_LABELS, FOCUS_TYPES, FOCUS_LABELS, FOCUS_SLOTS, FOCUS_TRADE_DESC,
    DISTRICTS, DISTRICT_LABELS, DISTRICT_EFFECTS, RESOURCES, EVENTS, EVENT_LABELS, CFG,
    WONDERS, ALL_WONDERS, WONDER_ERAS, CARD_TIERS, AGENDA_CARDS, DIPLOMACY_CARDS, CITY_STATE_DATA,
    TILE_OFFSETS, getCoreAnchors,
    createState, createPlayer, migrateState, applyAction, currentPlayer, getPlayer,
    getSlotValue, getSlotIndex, getCardTier, getCardTierValue: getCardTier,
    getMilitaryMove, getEconomyMove, getCultureMarkers, getMilitaryCombatBonus,
    getCityRange, getWonderCost, getVisibleWonders, canCrossWater, computeScore,
    validControlHexes, validDistrictHexes, validReinforceHexes,
    validCityHexes, validWonderHexes, getReachable, findDefender, getUnitsAt,
    adjacentToCityState, adjacentToFriendlyControl, terrainDifficulty,
    countControl, countWonders, countDeveloped, countCities, findCapital,
    getClaimedAgendaCount,
    getValidFortressHexes, getValidTileAnchors, getTileHexKeys, validateTilePlacement,
    hexNeighborKeys, parseQ, parseR, key, hexDist, rollDie, rotateAxial,
    isExploreEligible, validateExploration, placeExploredTile, getReachableWithDist
  };
})();
