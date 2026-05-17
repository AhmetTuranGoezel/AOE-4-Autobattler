"use strict";

const Game = (() => {
  const TERRAIN = { grass: 1, hill: 2, forest: 3, desert: 4, mountain: 5, water: 1 };
  const TERRAIN_LABELS = { grass: "Grassland", hill: "Hills", forest: "Forest", desert: "Desert", mountain: "Mountain", water: "Water" };
  const FOCUS_TYPES = ["culture", "growth", "science", "economy", "military", "industry"];
  const FOCUS_LABELS = { culture: "Culture", growth: "Growth", science: "Science", economy: "Economy", military: "Military", industry: "Industry" };
  const FOCUS_SLOTS = [1, 1, 2, 3, 4, 5];
  const FOCUS_TRADE_DESC = {
    culture: "+1 control marker per trade spent",
    growth: "+1 extra district/reinforce per trade",
    science: "+1 tech advance per trade spent",
    economy: "+1 wagon movement per trade spent",
    military: "+1 combat strength per trade spent",
    industry: "+1 production per trade spent"
  };
  const DISTRICTS = ["campus", "trade", "encampment", "industrial", "theater"];
  const DISTRICT_LABELS = { campus: "Campus", trade: "Market", encampment: "Encampment", industrial: "Industrial", theater: "Theater" };
  const DISTRICT_EFFECTS = {
    campus: "+1 tech on district event",
    trade: "+1 trade marker on district event",
    encampment: "recruit army on district event",
    industrial: "+1 industry bonus on district event",
    theater: "+1 culture bonus on district event"
  };
  const RESOURCES = ["marble", "mercury", "oil", "diamonds"];
  const EVENTS = ["barbarian_spawn", "barbarian_move", "district_event", "gov_change", "wonder_aging"];
  const EVENT_LABELS = { barbarian_spawn: "Barbarian Spawn", barbarian_move: "Barbarian Move", district_event: "District Event", gov_change: "Government Change", wonder_aging: "Wonder Aging" };
  const CITY_NAMES = ["Akkad", "Seoul", "Buenos Aires", "Venice", "Kabul", "Geneva", "Nan Madol", "Brussels", "Preslav", "Carthage", "Valletta", "Antananarivo"];

  const CFG = {
    mapRadius: 9,
    maxTrade: 3,
    maxArmies: 3,
    maxWagons: 2,
    maxGovMarkers: 2,
    baseWagonMove: 3,
    baseArmyMove: 4,
    barbarianBase: 3,
    cityStateDefense: 8,
    resourceProdValue: 2,
    techWheelSize: 24,
    techResetAt: 15,
    maxRounds: 20,
    victoryMilitary: 12,
    victoryScience: 24,
    victoryCulture: 3,
    victoryEconomy: 4
  };

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
    if (playerCount <= 3) return [{ q: -2, r: 0 }, { q: 2, r: 0 }];
    return [{ q: -2, r: -1 }, { q: 2, r: -1 }, { q: -2, r: 2 }, { q: 2, r: 2 }];
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
    let adjacentCount = 0;
    let touchesCore = false;
    let touchesCoreAdj = false;

    cellKeys.forEach((k) => {
      let hasNeighbor = false;
      hexNeighborKeys(parseQ(k), parseR(k)).forEach((nk) => {
        if (cellSet.has(nk)) return;
        const nh = st.map.hexes[nk];
        if (!nh || !nh.active) return;
        hasNeighbor = true;
        if (nh.core) touchesCore = true;
        if (nh.coreAdjacent) touchesCoreAdj = true;
      });
      if (hasNeighbor) adjacentCount++;
    });

    if (!tile.isCore && adjacentCount < 4) return { ok: false };
    if (!tile.isCore && !touchesCore && !touchesCoreAdj) return { ok: false };
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

  function placeTileOnMap(st, tileId, anchorKey, rotation, side) {
    const tile = st.setup.tiles[tileId];
    if (!tile) return;
    const cellKeys = getTileHexKeys(anchorKey, rotation, st.map.hexes);
    tile.placed = true;
    tile.anchorKey = anchorKey;
    tile.rotation = rotation;
    tile.side = side;

    cellKeys.forEach((k) => {
      const hex = st.map.hexes[k];
      hex.active = true;
      hex.revealed = true;
      hex.terrain = randomLandTerrain();
      hex.core = tile.isCore;
      hex.tileId = tileId;
    });

    const anchorHex = st.map.hexes[anchorKey];
    if (anchorHex) {
      if (tile.type === "capital" && tile.ownerId) {
        anchorHex.terrain = "grass";
        anchorHex.city = { ownerId: tile.ownerId, isCapital: true, developed: false, hasWonder: false };
      }
      if (tile.type === "natural") {
        anchorHex.resource = "wonder";
      }
      if (tile.type === "citystate") {
        anchorHex.cityState = {
          name: CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)],
          type: FOCUS_TYPES[Math.floor(Math.random() * FOCUS_TYPES.length)]
        };
      }
    }

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
      hexNeighborKeys(h.q, h.r).forEach((nk) => {
        const nh = st.map.hexes[nk];
        if (nh && nh.active) activeNeighbors++;
      });
      if (activeNeighbors >= 2) valid.push(k);
    });
    return new Set(valid);
  }

  // --- Setup State Creation ---

  function createSetupState(playerIds) {
    const tiles = {};
    let nextId = 1;
    const order = shuffle(playerIds.slice());

    function makeTile(type) {
      const id = `T${nextId++}`;
      tiles[id] = { id, type, ownerId: null, side: "A", rotation: 0, placed: false, isCore: false, anchorKey: null };
      return tiles[id];
    }

    const capitalPool = Array.from({ length: playerIds.length + 2 }, () => makeTile("capital"));
    const naturalPool = Array.from({ length: 4 }, () => makeTile("natural"));
    const cityPool = Array.from({ length: 4 }, () => makeTile("citystate"));
    const normalPool = Array.from({ length: playerIds.length * 2 + 6 }, () => makeTile("normal"));

    shuffle(capitalPool);
    const playerTiles = {};
    playerIds.forEach((id) => {
      const tile = capitalPool.pop();
      tile.ownerId = id;
      playerTiles[id] = [tile.id];
    });

    const coreCount = playerIds.length <= 3 ? 2 : 4;
    const coreTiles = [];
    for (let i = 0; i < Math.ceil(coreCount / 2); i++) coreTiles.push(naturalPool.pop());
    for (let i = 0; i < Math.floor(coreCount / 2); i++) coreTiles.push(cityPool.pop());
    coreTiles.forEach((tile) => { tile.isCore = true; });

    const remaining = normalPool.concat(naturalPool, cityPool, capitalPool);
    shuffle(remaining);
    playerIds.forEach((id) => {
      for (let i = 0; i < 2; i++) {
        const tile = remaining.pop();
        if (!tile) continue;
        tile.ownerId = id;
        playerTiles[id].push(tile.id);
      }
    });

    return {
      phase: "fortress",
      order,
      turnIndex: 0,
      tiles,
      playerTiles,
      coreTiles: coreTiles.map((t) => t.id),
      fortressPlaced: {}
    };
  }

  function createState(players) {
    const map = buildEmptyMap(CFG.mapRadius);
    const playerIds = players.map((p) => p.id);
    const setup = createSetupState(playerIds);

    const st = {
      phase: "setup",
      map,
      players: players.slice(),
      turn: { order: setup.order.slice(), index: 0, round: 1 },
      setup,
      eventWheel: { position: 0, events: EVENTS.slice() },
      lastCombat: null,
      winner: null,
      log: []
    };

    const anchors = getCoreAnchors(players.length);
    setup.coreTiles.forEach((tileId, i) => {
      const anchor = anchors[i];
      const anchorKey = key(anchor.q, anchor.r);
      placeTileOnMap(st, tileId, anchorKey, 0, "A");
    });

    log(st, "Core tiles placed. Fortress placement begins.");
    return st;
  }

  function createPlayer(id, name, color) {
    return {
      id, name, color,
      focusRow: FOCUS_TYPES.slice(),
      trade: { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 },
      resources: { marble: 0, mercury: 0, oil: 0, diamonds: 0 },
      tech: 0, techTier: 1,
      govMarkers: [],
      govBonus: { culture: 0, growth: 0, science: 0, economy: 0, military: 0, industry: 0 },
      armies: [{ id: "army-1", position: null }],
      wagons: [{ id: "wagon-1", position: null }],
      cardPlayed: false
    };
  }

  // --- Finalize Setup ---

  function finalizeSetup(st) {
    st.setup.phase = "done";
    st.phase = "playing";
    st.turn.round = 1;
    st.turn.index = 0;

    // Place armies and wagons at each player's capital
    st.players.forEach((player) => {
      const capKey = findCapital(st, player.id);
      if (capKey) {
        player.armies.forEach((u) => { if (!u.position) u.position = capKey; });
        player.wagons.forEach((u) => { if (!u.position) u.position = capKey; });
      }
    });

    // Scatter resources, barbarians on active land hexes
    const activeLand = Object.keys(st.map.hexes).filter((k) => {
      const h = st.map.hexes[k];
      return h.active && h.terrain !== "water" && !h.city && !h.cityState && !h.resource && !h.fortress;
    });

    const resPicks = pickRandom(activeLand, Math.min(8, Math.floor(activeLand.length / 8)));
    resPicks.forEach((k, i) => { st.map.hexes[k].resource = RESOURCES[i % RESOURCES.length]; });

    const barbCandidates = activeLand.filter((k) => !st.map.hexes[k].resource);
    const barbPicks = pickRandom(barbCandidates, Math.min(5, Math.floor(barbCandidates.length / 10)));
    barbPicks.forEach((k) => { st.map.hexes[k].barbarian = true; });

    log(st, "Setup complete! Game begins.");
  }

  // --- Actions ---

  function applyAction(st, action) {
    const { type, payload } = action;

    if (type === "ADD_PLAYER") {
      if (st.players.find((p) => p.id === payload.id)) return st;
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
          placeTileOnMap(st, tileId, key(anchor.q, anchor.r), 0, "A");
        });
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
      hex.terrain = randomLandTerrain();
      hex.fortress = true;
      hex.fortressOwnerId = payload.playerId;
      hex.tileId = "fortress";
      st.setup.fortressPlaced[payload.playerId] = true;

      updateCoreAdjacency(st);
      fillEnclosedHoles(st);

      const player = getPlayer(st, payload.playerId);
      log(st, `${player ? player.name : "Player"} placed a fortress.`);

      // Advance to next player or next phase
      const allPlaced = st.setup.order.every((id) => st.setup.fortressPlaced[id]);
      if (allPlaced) {
        st.setup.phase = "tile";
        st.setup.turnIndex = 0;
        log(st, "All fortresses placed. Tile placement begins.");
      } else {
        advanceSetupTurn(st);
      }
      return st;
    }

    if (type === "PLACE_TILE") {
      if (st.phase !== "setup" || st.setup.phase !== "tile") return st;
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

    // --- Playing phase actions (same as before) ---

    if (type === "PLAY_CULTURE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      payload.hexKeys.forEach((k) => {
        const hex = st.map.hexes[k];
        if (!hex) return;
        if (hex.resource && hex.resource !== "wonder") {
          if (player.resources[hex.resource] !== undefined) player.resources[hex.resource]++;
          hex.resource = null;
        }
        hex.control = { ownerId: payload.playerId, fortified: false, district: null };
      });
      resolveCard(st, player, "culture", payload.tradeSpent);
      log(st, `${player.name} placed ${payload.hexKeys.length} control marker(s).`);
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_GROWTH_DISTRICT") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const hex = st.map.hexes[payload.hexKey];
      if (hex) hex.control = { ownerId: payload.playerId, fortified: false, district: payload.district };
      resolveCard(st, player, "growth", payload.tradeSpent);
      log(st, `${player.name} placed a ${payload.district} district.`);
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_GROWTH_REINFORCE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
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
      if (!player) return st;
      advanceTech(st, player, payload.amount);
      resolveCard(st, player, "science", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_ECONOMY") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const unit = player.wagons.find((u) => u.id === payload.unitId);
      if (unit) {
        unit.position = payload.toKey;
        const hex = st.map.hexes[payload.toKey];
        if (hex && hex.cityState) {
          player.trade[hex.cityState.type] = Math.min(CFG.maxTrade, player.trade[hex.cityState.type] + 2);
          unit.position = null;
          log(st, `${player.name}'s wagon traded at ${hex.cityState.name} (+2 ${hex.cityState.type} trade).`);
        } else if (hex && hex.city && hex.city.ownerId !== payload.playerId) {
          player.trade.economy = Math.min(CFG.maxTrade, player.trade.economy + 2);
          unit.position = null;
          log(st, `${player.name}'s wagon traded at foreign city (+2 economy trade).`);
        } else {
          log(st, `${player.name} moved wagon.`);
        }
      }
      resolveCard(st, player, "economy", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_MILITARY_MOVE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (unit) { unit.position = payload.toKey; log(st, `${player.name} moved army.`); }
      resolveCard(st, player, "military", payload.tradeSpent);
      return st;
    }

    if (type === "PLAY_MILITARY_ATTACK") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const unit = player.armies.find((u) => u.id === payload.unitId);
      if (!unit) return st;
      const hex = st.map.hexes[payload.toKey];
      if (!hex) return st;

      const atkRoll = rollDie();
      const defRoll = rollDie();
      const atkTotal = atkRoll + payload.attackPower;
      const defTotal = defRoll + payload.defensePower;
      const win = atkTotal > defTotal;

      st.lastCombat = { attacker: player.name, defender: payload.defenderLabel, atkRoll, defRoll, atkTotal, defTotal, win };

      if (win) {
        unit.position = payload.toKey;
        if (hex.barbarian) hex.barbarian = false;
        if (hex.cityState) {
          hex.cityState = null;
          hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false };
        }
        if (hex.control && hex.control.ownerId !== payload.playerId) {
          hex.control = { ownerId: payload.playerId, fortified: false, district: null };
        }
        if (hex.city && hex.city.ownerId !== payload.playerId) {
          hex.city.ownerId = payload.playerId;
          hex.city.developed = false;
        }
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
      if (!player) return st;
      spendResources(player, payload.resources);
      const hex = st.map.hexes[payload.hexKey];
      if (hex) {
        hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false };
        if (hex.control && hex.control.ownerId === payload.playerId) hex.control = null;
      }
      resolveCard(st, player, "industry", payload.tradeSpent);
      log(st, `${player.name} built a new city.`);
      checkDevelopment(st, payload.playerId);
      return st;
    }

    if (type === "PLAY_INDUSTRY_WONDER") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      spendResources(player, payload.resources);
      const hex = st.map.hexes[payload.hexKey];
      if (hex && hex.city) hex.city.hasWonder = true;
      resolveCard(st, player, "industry", payload.tradeSpent);
      log(st, `${player.name} built a wonder!`);
      return st;
    }

    if (type === "ASSIGN_GOV") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      const markers = (payload.markers || []).slice(0, CFG.maxGovMarkers);
      player.govMarkers = markers;
      FOCUS_TYPES.forEach((f) => { player.govBonus[f] = 0; });
      markers.forEach((f) => { player.govBonus[f] = (player.govBonus[f] || 0) + 1; });
      log(st, `${player.name} reassigned gov markers.`);
      return st;
    }

    if (type === "RECRUIT_ARMY") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.armies.length >= CFG.maxArmies) return st;
      const capitalKey = findCapital(st, payload.playerId);
      player.armies.push({ id: `army-${player.armies.length + 1}`, position: capitalKey });
      log(st, `${player.name} recruited an army.`);
      return st;
    }

    if (type === "RECRUIT_WAGON") {
      const player = getPlayer(st, payload.playerId);
      if (!player || player.wagons.length >= CFG.maxWagons) return st;
      const capitalKey = findCapital(st, payload.playerId);
      player.wagons.push({ id: `wagon-${player.wagons.length + 1}`, position: capitalKey });
      log(st, `${player.name} recruited a wagon.`);
      return st;
    }

    if (type === "END_TURN") {
      const cp = currentPlayer(st);
      if (cp) cp.cardPlayed = false;
      st.turn.index = (st.turn.index + 1) % st.turn.order.length;
      st.lastCombat = null;
      if (st.turn.index === 0) {
        st.turn.round++;
        advanceEventWheel(st);
        const winner = checkVictory(st);
        if (winner) {
          st.winner = winner;
          st.phase = "gameover";
          log(st, `${winner.playerName} wins by ${winner.type}!`);
        } else {
          log(st, `Round ${st.turn.round} begins.`);
        }
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
      st.players.forEach((player) => {
        const counts = { campus: 0, trade: 0, encampment: 0, industrial: 0, theater: 0 };
        Object.values(st.map.hexes).forEach((h) => {
          if (h.control && h.control.ownerId === player.id && h.control.district) counts[h.control.district]++;
        });
        if (counts.campus) { player.tech += counts.campus; log(st, `${player.name}: +${counts.campus} tech (campus).`); }
        if (counts.trade) {
          for (let i = 0; i < counts.trade; i++) {
            const t = FOCUS_TYPES[i % FOCUS_TYPES.length];
            player.trade[t] = Math.min(CFG.maxTrade, player.trade[t] + 1);
          }
        }
        if (counts.encampment && player.armies.length < CFG.maxArmies) {
          player.armies.push({ id: `army-${player.armies.length + 1}`, position: findCapital(st, player.id) });
          log(st, `${player.name}: recruited army (encampment).`);
        }
        if (counts.industrial) player.govBonus.industry = Math.min(3, player.govBonus.industry + counts.industrial);
        if (counts.theater) player.govBonus.culture = Math.min(3, player.govBonus.culture + counts.theater);
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
    Object.values(st.map.hexes).forEach((hex) => {
      if (!hex.city || hex.city.ownerId !== playerId) return;
      hex.city.developed = isCityDeveloped(st, hex);
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
    for (const p of st.players) {
      const ctrl = countControl(st, p.id);
      if (ctrl >= CFG.victoryMilitary) return { playerName: p.name, type: "Military Victory", playerId: p.id };
      if (p.tech >= CFG.victoryScience) return { playerName: p.name, type: "Science Victory", playerId: p.id };
      if (countWonders(st, p.id) >= CFG.victoryCulture) return { playerName: p.name, type: "Culture Victory", playerId: p.id };
      if (countDeveloped(st, p.id) >= CFG.victoryEconomy) return { playerName: p.name, type: "Economy Victory", playerId: p.id };
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
  function getSlotValue(player, cardType) {
    const idx = player.focusRow.indexOf(cardType);
    if (idx < 0) return 1;
    return Math.min(5, FOCUS_SLOTS[idx] + (player.govBonus[cardType] || 0));
  }
  function getSlotIndex(player, cardType) { return player.focusRow.indexOf(cardType); }

  function validControlHexes(st, playerId, maxTerrain) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (TERRAIN[h.terrain] > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || h.control) return;
      if (!withinRangeOfCity(st, h, playerId, maxTerrain)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validDistrictHexes(st, playerId, maxTerrain) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (TERRAIN[h.terrain] > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian || h.control) return;
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

  function validCityHexes(st, playerId, production) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (!h.active || h.terrain === "water") return;
      if (TERRAIN[h.terrain] > production) return;
      if (h.city || h.cityState || h.barbarian) return;
      if (adjacentToAnyCity(st, h)) return;
      if (!withinRangeOfFriendly(st, h, playerId, 2)) return;
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

  function getReachable(st, startKey, maxSteps, unitType, playerId) {
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
        if (h.terrain === "water") return;
        if (unitType === "wagon" && h.barbarian) return;
        visited.add(nk);
        reachable.add(nk);
        queue.push({ key: nk, steps: cur.steps + 1 });
      });
    }
    return reachable;
  }

  function findDefender(st, hexKey, attackerId) {
    const h = st.map.hexes[hexKey];
    if (!h) return null;
    if (h.barbarian) return { type: "barbarian", label: "Barbarian", power: CFG.barbarianBase + TERRAIN[h.terrain] };
    if (h.cityState) return { type: "citystate", label: h.cityState.name, power: CFG.cityStateDefense };
    if (h.control && h.control.ownerId !== attackerId) {
      const def = TERRAIN[h.terrain] + (h.control.fortified ? 2 : 0);
      return { type: "control", label: "Control Marker", power: def };
    }
    if (h.city && h.city.ownerId !== attackerId) return { type: "city", label: "City", power: TERRAIN[h.terrain] * 2 };
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
      p.wagons.forEach((u) => { if (u.position === hexKey) units.push({ type: "wagon", playerId: p.id, color: p.color }); });
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
  function withinRangeOfFriendly(st, hex, playerId, range) {
    return Object.values(st.map.hexes).some((h) => {
      if (h.city && h.city.ownerId === playerId) return hexDist(h, hex) <= range;
      if (h.control && h.control.ownerId === playerId) return hexDist(h, hex) <= range;
      return false;
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

  return {
    TERRAIN, TERRAIN_LABELS, FOCUS_TYPES, FOCUS_LABELS, FOCUS_SLOTS, FOCUS_TRADE_DESC,
    DISTRICTS, DISTRICT_LABELS, DISTRICT_EFFECTS, RESOURCES, EVENTS, EVENT_LABELS, CFG,
    TILE_OFFSETS, getCoreAnchors,
    createState, createPlayer, applyAction, currentPlayer, getPlayer,
    getSlotValue, getSlotIndex, computeScore,
    validControlHexes, validDistrictHexes, validReinforceHexes,
    validCityHexes, validWonderHexes, getReachable, findDefender, getUnitsAt,
    countControl, countWonders, countDeveloped, countCities, findCapital,
    getValidFortressHexes, getValidTileAnchors, getTileHexKeys, validateTilePlacement,
    hexNeighborKeys, parseQ, parseR, key, hexDist, rollDie, rotateAxial
  };
})();
