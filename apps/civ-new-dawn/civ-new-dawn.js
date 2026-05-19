(() => {
  const TERRAIN = {
    grass: { label: "Grass", difficulty: 1 },
    hill: { label: "Hill", difficulty: 2 },
    forest: { label: "Forest", difficulty: 3 },
    desert: { label: "Desert", difficulty: 4 },
    mountain: { label: "Mountain", difficulty: 5 },
    water: { label: "Water", difficulty: 1 }
  };

  const TERRAIN_LIST = Object.keys(TERRAIN);
  const RESOURCE_TYPES = ["marble", "mercury", "oil", "diamonds"];
  const DISTRICT_TYPES = ["campus", "trade", "encampment", "industrial", "theater"];
  const CITY_STATE_NAMES = [
    "Akkad",
    "Seoul",
    "Buenos Aires",
    "Antananarivo",
    "Venice",
    "Kabul",
    "Geneva",
    "Nan Madol",
    "Brussels",
    "Preslav",
    "Carthage",
    "Valletta"
  ];

  const FOCUS_SLOTS = [1, 1, 2, 3, 4, 5];
  const FOCUS_ORDER = ["growth", "culture", "science", "economy", "military", "industry"];
  const FOCUS_META = {
    growth: { label: "Growth", tradeBonus: "place 1 extra district or reinforce 1 extra" },
    culture: { label: "Culture", tradeBonus: "+1 control marker per trade" },
    science: { label: "Science", tradeBonus: "+1 tech advancement per trade" },
    economy: { label: "Economy", tradeBonus: "+1 wagon movement per trade" },
    military: { label: "Military", tradeBonus: "+1 combat strength per trade" },
    industry: { label: "Industry", tradeBonus: "+1 production per trade" }
  };

  const EVENT_WHEEL = [
    "barbarian_spawn",
    "barbarian_move",
    "district_event",
    "government_change",
    "wonder_aging"
  ];

  const TECH_WHEEL_SIZE = 24;
  const TECH_RESET_AT = 15;

  const VICTORY_TYPES = {
    military: { label: "Military Victory", check: (p) => countControlMarkers(p.id) >= 12 },
    science: { label: "Science Victory", check: (p) => p.tech >= 24 },
    culture: { label: "Culture Victory", check: (p) => countWonders(p.id) >= 3 },
    economy: { label: "Economy Victory", check: (p) => countDevelopedCities(p.id) >= 4 }
  };

  const MAX_GOV_MARKERS = 2;

  const BARBARIAN_DIRECTIONS = [
    { dq: 1, dr: 0 },
    { dq: -1, dr: 0 },
    { dq: 0, dr: 1 },
    { dq: 0, dr: -1 },
    { dq: 1, dr: -1 },
    { dq: -1, dr: 1 }
  ];

  const CORE_ANCHORS = [
    { q: -2, r: -1 },
    { q: 2, r: -1 },
    { q: -2, r: 2 },
    { q: 2, r: 2 }
  ];

  const TILE_OFFSETS = buildTileOffsets();

  const DEFAULTS = {
    mapRadius: 9,
    revealRadius: 2,
    baseWagonMove: 3,
    baseArmyMove: 4,
    maxTradePerCard: 3,
    maxArmies: 3,
    maxWagons: 2,
    barbarianBasePower: 3,
    cityStateDefense: 8,
    resourceProductionValue: 2,
    maxRounds: 20
  };

  let state = null;
  let ui = {
    mode: "inspect",
    activeCard: null,
    selectedUnit: null,
    selectable: new Set(),
    viewPlayerId: null,
    tradeLocked: false,
    setup: { rotation: 0, side: "A", tileId: null }
  };

  let isHost = false;
  let peer = null;
  let connections = [];
  let localPlayerId = null;
  const hexElements = new Map();

  const dom = {};

  function cacheDom() {
    dom.playerName = document.getElementById("player-name");
    dom.playerColor = document.getElementById("player-color");
    dom.createRoom = document.getElementById("create-room");
    dom.localGame = document.getElementById("local-game");
    dom.joinCode = document.getElementById("join-code");
    dom.joinRoom = document.getElementById("join-room");
    dom.copyRoom = document.getElementById("copy-room");
    dom.roomCode = document.getElementById("room-code");
    dom.status = document.getElementById("status");
    dom.roundDisplay = document.getElementById("round-display");
    dom.playerList = document.getElementById("player-list");
    dom.focusRow = document.getElementById("focus-row");
    dom.focusOwner = document.getElementById("focus-owner");
    dom.map = document.getElementById("map");
    dom.actionPanel = document.getElementById("action-panel");
    dom.turnIndicator = document.getElementById("turn-indicator");
    dom.rollDice = document.getElementById("roll-dice");
    dom.diceResult = document.getElementById("dice-result");
    dom.log = document.getElementById("log");
    dom.hostTools = document.getElementById("host-tools");
    dom.toolMode = document.getElementById("tool-mode");
    dom.toolOwner = document.getElementById("tool-owner");
    dom.toolDetail = document.getElementById("tool-detail");
    dom.revealMap = document.getElementById("reveal-map");
    dom.randomizeMap = document.getElementById("randomize-map");
    dom.startAdvancedSetup = document.getElementById("start-advanced-setup");
    dom.setupPhase = document.getElementById("setup-phase");
    dom.setupTurn = document.getElementById("setup-turn");
    dom.setupTile = document.getElementById("setup-tile");
    dom.rotateTile = document.getElementById("rotate-tile");
    dom.flipTile = document.getElementById("flip-tile");
    dom.eventDisplay = document.getElementById("event-display");
    dom.eventWheelTrack = document.getElementById("event-wheel-track");
  }

  function bindEvents() {
    dom.createRoom.addEventListener("click", createRoom);
    dom.joinRoom.addEventListener("click", joinRoom);
    dom.localGame.addEventListener("click", startLocalGame);
    dom.copyRoom.addEventListener("click", copyRoomCode);
    dom.rollDice.addEventListener("click", () => {
      const roll = rollDie();
      dom.diceResult.textContent = roll;
      if (state) {
        logEntry(`Rolled a ${roll}.`);
        commitState();
      }
    });
    dom.revealMap.addEventListener("click", () => {
      if (!isHost || !state) return;
      Object.values(state.map.hexes).forEach((hex) => {
        hex.revealed = true;
      });
      logEntry("Host revealed the entire map.");
      commitState();
    });
    dom.randomizeMap.addEventListener("click", () => {
      if (!isHost || !state) return;
      const currentPlayers = state.players.slice();
      state = buildInitialState(currentPlayers[0]);
      currentPlayers.slice(1).forEach((player) => {
        applyAction({ type: "ADD_PLAYER", payload: player });
      });
      logEntry("Host randomized the map.");
      commitState();
    });
    dom.toolMode.addEventListener("change", () => {
      ui.mode = dom.toolMode.value;
      refreshToolDetail();
    });
    dom.toolOwner.addEventListener("change", () => {
      refreshToolDetail();
    });
    dom.toolDetail.addEventListener("change", () => {
      refreshToolDetail();
    });
    dom.startAdvancedSetup.addEventListener("click", () => {
      if (!isHost) return;
      ui.setup.rotation = 0;
      ui.setup.side = "A";
      ui.setup.tileId = null;
      ui.activeCard = null;
      ui.mode = "inspect";
      ui.selectable.clear();
      dom.toolMode.value = "inspect";
      refreshToolDetail();
      dispatch({ type: "START_ADVANCED_SETUP" });
    });
    dom.rotateTile.addEventListener("click", () => {
      ui.setup.rotation = (ui.setup.rotation + 1) % 6;
      syncSetupUi();
      renderMap();
    });
    dom.flipTile.addEventListener("click", () => {
      ui.setup.side = ui.setup.side === "A" ? "B" : "A";
      syncSetupUi();
      renderMap();
    });
    dom.setupTile.addEventListener("change", () => {
      ui.setup.tileId = dom.setupTile.value;
      syncSetupUi();
      renderMap();
    });
  }

  function init() {
    cacheDom();
    bindEvents();
    setStatus("Ready.");
    setHostTools(false);
  }

  window.addEventListener("load", init);
  function setStatus(text) {
    dom.status.textContent = text;
  }

  function setHostTools(show) {
    dom.hostTools.style.display = show ? "grid" : "none";
  }

  function copyRoomCode() {
    const code = dom.roomCode.textContent.trim();
    if (!code || code === "-") return;
    navigator.clipboard.writeText(code).then(() => {
      setStatus("Room code copied.");
    });
  }

  function createRoom() {
    if (peer) {
      peer.destroy();
    }
    const name = (dom.playerName.value || "Host").trim();
    const color = dom.playerColor.value;
    isHost = true;
    setHostTools(true);
    peer = new Peer();
    peer.on("open", (id) => {
      localPlayerId = id;
      dom.roomCode.textContent = id;
      state = buildInitialState(createPlayer(id, name, color));
      ui.viewPlayerId = id;
      setStatus("Room created.");
      renderAll();
      commitState();
    });
    peer.on("connection", (conn) => {
      setupHostConnection(conn);
    });
  }

  function startLocalGame() {
    if (peer) {
      peer.destroy();
    }
    isHost = true;
    setHostTools(true);
    localPlayerId = "local-host";
    const name = (dom.playerName.value || "Host").trim();
    const color = dom.playerColor.value;
    state = buildInitialState(createPlayer(localPlayerId, name, color));
    dom.roomCode.textContent = "local";
    ui.viewPlayerId = localPlayerId;
    setStatus("Local game ready.");
    renderAll();
  }

  function joinRoom() {
    if (peer) {
      peer.destroy();
    }
    const code = dom.joinCode.value.trim();
    if (!code) {
      setStatus("Enter a room code.");
      return;
    }
    isHost = false;
    setHostTools(false);
    peer = new Peer();
    peer.on("open", (id) => {
      localPlayerId = id;
      dom.roomCode.textContent = code;
      const conn = peer.connect(code);
      setupClientConnection(conn);
    });
  }

  function setupHostConnection(conn) {
    connections.push(conn);
    conn.on("data", (data) => {
      if (data.type === "hello") {
        const player = createPlayer(conn.peer, data.name, data.color);
        applyAction({ type: "ADD_PLAYER", payload: player });
        logEntry(`${player.name} joined the game.`);
        commitState();
      } else if (data.type === "action") {
        applyAction(data.payload);
        commitState();
      }
    });
    conn.on("close", () => {
      connections = connections.filter((c) => c !== conn);
      const player = state?.players.find((p) => p.id === conn.peer);
      if (player) {
        player.connected = false;
        logEntry(`${player.name} disconnected.`);
        commitState();
      }
    });
    conn.on("open", () => {
      conn.send({ type: "state", payload: state });
    });
  }

  function setupClientConnection(conn) {
    conn.on("open", () => {
      const name = (dom.playerName.value || "Player").trim();
      const color = dom.playerColor.value;
      conn.send({ type: "hello", name, color });
      setStatus("Connected to host.");
    });
    conn.on("data", (data) => {
      if (data.type === "state") {
        state = data.payload;
        if (!ui.viewPlayerId) {
          ui.viewPlayerId = localPlayerId;
        }
        renderAll();
      }
    });
    conn.on("close", () => {
      setStatus("Disconnected from host.");
    });
    connections = [conn];
  }

  function dispatch(action) {
    if (!state) return;
    if (isHost) {
      applyAction(action);
      commitState();
    } else if (connections[0]) {
      connections[0].send({ type: "action", payload: action });
    }
  }

  function commitState() {
    renderAll();
    if (!isHost) return;
    connections.forEach((conn) => {
      if (conn.open) {
        conn.send({ type: "state", payload: state });
      }
    });
  }

  function buildInitialState(hostPlayer) {
    const map = buildMap(DEFAULTS.mapRadius, { activeAll: true, populate: true });
    const gameState = {
      settings: { expansion: true },
      map,
      players: [hostPlayer],
      turn: { order: [hostPlayer.id], index: 0, round: 1 },
      phase: "playing",
      eventWheel: { position: 0, events: EVENT_WHEEL.slice() },
      pendingEvent: null,
      log: [],
      lastRoll: null,
      startPositions: getStartPositions(DEFAULTS.mapRadius),
      winner: null
    };
    placeCapital(gameState, hostPlayer.id);
    return gameState;
  }

  function createPlayer(id, name, color) {
    return {
      id,
      name,
      color,
      connected: true,
      focusRow: FOCUS_ORDER.slice(),
      trade: {
        growth: 0,
        culture: 0,
        science: 0,
        economy: 0,
        military: 0,
        industry: 0
      },
      resources: {
        marble: 0,
        mercury: 0,
        oil: 0,
        diamonds: 0
      },
      tech: 0,
      techTier: 1,
      govBonus: {
        growth: 0,
        culture: 0,
        science: 0,
        economy: 0,
        military: 0,
        industry: 0
      },
      govMarkers: [],
      diplomacy: [],
      victoryPoints: { military: 0, science: 0, culture: 0, economy: 0 },
      armies: [createUnit("army", 1)],
      wagons: [createUnit("wagon", 1)],
      cardPlayed: false,
      agenda: null
    };
  }

  function createUnit(type, index) {
    return {
      id: `${type}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      position: null
    };
  }

  function buildMap(radius, options = {}) {
    const { activeAll = true, populate = true } = options;
    const hexes = {};
    for (let q = -radius; q <= radius; q += 1) {
      for (let r = -radius; r <= radius; r += 1) {
        if (Math.abs(q + r) > radius) continue;
        const key = keyFrom(q, r);
        hexes[key] = {
          q,
          r,
          terrain: randomTerrain(),
          active: activeAll,
          revealed: activeAll,
          resource: null,
          cityState: null,
          barbarian: false,
          fortress: false,
          fortressOwnerId: null,
          core: false,
          coreAdjacent: false,
          tradeMarker: false,
          control: null,
          city: null
        };
      }
    }

    const hexKeys = Object.keys(hexes);
    if (populate) {
      scatterResources(hexes, hexKeys);
      scatterCityStates(hexes, hexKeys);
      scatterBarbarians(hexes, hexKeys);
      scatterFortresses(hexes, hexKeys);
    }

    return { radius, hexes };
  }

  function scatterResources(hexes, hexKeys) {
    const picks = pickRandom(hexKeys.filter((key) => !isWater(hexes[key])), 8);
    picks.forEach((key, index) => {
      hexes[key].resource = RESOURCE_TYPES[index % RESOURCE_TYPES.length];
    });
  }

  function scatterCityStates(hexes, hexKeys) {
    const picks = pickRandom(hexKeys.filter((key) => !isWater(hexes[key])), 6);
    picks.forEach((key, index) => {
      hexes[key].cityState = {
        name: CITY_STATE_NAMES[index % CITY_STATE_NAMES.length],
        type: FOCUS_ORDER[index % FOCUS_ORDER.length]
      };
    });
  }

  function scatterBarbarians(hexes, hexKeys) {
    const picks = pickRandom(hexKeys.filter((key) => !isWater(hexes[key])), 6);
    picks.forEach((key) => {
      hexes[key].barbarian = true;
    });
  }

  function scatterFortresses(hexes, hexKeys) {
    const picks = pickRandom(hexKeys.filter((key) => !isWater(hexes[key])), 2);
    picks.forEach((key) => {
      hexes[key].fortress = true;
    });
  }

  function getStartPositions(radius) {
    return [
      keyFrom(-radius + 1, 0),
      keyFrom(radius - 1, 0),
      keyFrom(0, radius - 1),
      keyFrom(0, -radius + 1)
    ];
  }

  function placeCapital(gameState, playerId) {
    const pos = gameState.startPositions.find((key) => !gameState.map.hexes[key]?.city);
    if (!pos) return;
    const hex = gameState.map.hexes[pos];
    if (!hex) return;
    hex.active = true;
    hex.revealed = true;
    hex.city = { ownerId: playerId, isCapital: true, developed: false, hasWonder: false };
    hex.resource = null;
    hex.cityState = null;
    hex.barbarian = false;
    hex.fortress = false;
    hex.terrain = "grass";
    revealAround(gameState.map, pos, DEFAULTS.revealRadius);
    const player = gameState.players.find((p) => p.id === playerId);
    if (player) {
      player.armies.forEach((u) => { if (!u.position) u.position = pos; });
      player.wagons.forEach((u) => { if (!u.position) u.position = pos; });
    }
  }

  function revealAround(map, key, radius) {
    const { q, r } = map.hexes[key];
    Object.values(map.hexes).forEach((hex) => {
      const distance = hexDistance({ q, r }, hex);
      if (distance <= radius) {
        hex.revealed = true;
      }
    });
  }

  function buildStateForSetup(players) {
    return {
      settings: { expansion: true },
      map: buildMap(DEFAULTS.mapRadius, { activeAll: false, populate: false }),
      players,
      turn: { order: players.map((p) => p.id), index: 0, round: 1 },
      phase: "setup",
      eventWheel: { position: 0, events: EVENT_WHEEL.slice() },
      pendingEvent: null,
      log: [],
      lastRoll: null,
      startPositions: getStartPositions(DEFAULTS.mapRadius),
      setup: null,
      winner: null
    };
  }

  function createSetupState(playerIds) {
    const tiles = {};
    let nextId = 1;
    const order = shuffle(playerIds.slice());
    const makeTile = (type) => {
      const id = `T${nextId++}`;
      tiles[id] = {
        id,
        type,
        ownerId: null,
        side: "A",
        rotation: 0,
        placed: false,
        isCore: false,
        tradeMarker: false,
        anchorKey: null
      };
      return tiles[id];
    };

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

    const coreTiles = [naturalPool.pop(), naturalPool.pop(), cityPool.pop(), cityPool.pop()];
    coreTiles.forEach((tile) => {
      tile.isCore = true;
      tile.tradeMarker = true;
    });

    const remaining = normalPool.concat(naturalPool, cityPool);
    shuffle(remaining);
    playerIds.forEach((id) => {
      for (let i = 0; i < 2; i += 1) {
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
      coreTiles: coreTiles.map((tile) => tile.id),
      tiles,
      playerTiles,
      coreSide: rollDie() <= 3 ? "A" : "B",
      fortressPlaced: {}
    };
  }

  function placeCoreTiles() {
    const setup = state.setup;
    setup.coreTiles.forEach((tileId, index) => {
      const anchor = CORE_ANCHORS[index];
      placeTile(tileId, keyFrom(anchor.q, anchor.r), 0, setup.coreSide, null, true);
    });
    updateCoreAdjacency();
  }

  function advanceSetupTurn() {
    const setup = state.setup;
    if (!setup) return;
    const order = setup.order;
    const total = order.length;
    if (!total) return;

    if (setup.phase === "fortress") {
      const allPlaced = order.every((id) => setup.fortressPlaced[id]);
      if (allPlaced) {
        setup.phase = "tile";
        setup.turnIndex = 0;
        state.turn.index = 0;
        return;
      }
      let next = setup.turnIndex;
      for (let i = 0; i < total; i += 1) {
        next = (next + 1) % total;
        if (!setup.fortressPlaced[order[next]]) break;
      }
      setup.turnIndex = next;
      state.turn.index = next;
      return;
    }

    if (setup.phase === "tile") {
      const remaining = order.some((id) => (setup.playerTiles[id] || []).length > 0);
      if (!remaining) {
        finalizeSetup();
        return;
      }
      let next = setup.turnIndex;
      for (let i = 0; i < total; i += 1) {
        next = (next + 1) % total;
        if ((setup.playerTiles[order[next]] || []).length > 0) break;
      }
      setup.turnIndex = next;
      state.turn.index = next;
    }
  }

  function finalizeSetup() {
    const setup = state.setup;
    if (!setup) return;
    setup.phase = "done";
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.core) {
        hex.tradeMarker = false;
      }
    });
    state.turn.order = setup.order.slice();
    state.turn.index = 0;
    state.turn.round = 1;
    state.phase = "playing";
    state.eventWheel = { position: 0, events: EVENT_WHEEL.slice() };
    state.pendingEvent = null;
    state.winner = null;
    updateCoreAdjacency();
    scatterResourcesOnActive();
    scatterCityStatesOnActive();
    scatterBarbariansOnActive();
    logEntry("Advanced setup complete. Game begins!");
  }

  function scatterResourcesOnActive() {
    const active = Object.keys(state.map.hexes).filter((k) => {
      const h = state.map.hexes[k];
      return h.active && h.revealed && !isWater(h) && !h.city && !h.cityState && !h.barbarian && !h.resource && !h.fortress;
    });
    const picks = pickRandom(active, Math.min(8, Math.floor(active.length / 10)));
    picks.forEach((key, i) => {
      state.map.hexes[key].resource = RESOURCE_TYPES[i % RESOURCE_TYPES.length];
    });
  }

  function scatterCityStatesOnActive() {
    const active = Object.keys(state.map.hexes).filter((k) => {
      const h = state.map.hexes[k];
      return h.active && h.revealed && !isWater(h) && !h.city && !h.cityState && !h.barbarian && !h.resource && !h.fortress;
    });
    const picks = pickRandom(active, Math.min(6, Math.floor(active.length / 15)));
    picks.forEach((key, i) => {
      state.map.hexes[key].cityState = {
        name: CITY_STATE_NAMES[i % CITY_STATE_NAMES.length],
        type: FOCUS_ORDER[i % FOCUS_ORDER.length]
      };
    });
  }

  function scatterBarbariansOnActive() {
    const active = Object.keys(state.map.hexes).filter((k) => {
      const h = state.map.hexes[k];
      return h.active && h.revealed && !isWater(h) && !h.city && !h.cityState && !h.barbarian && !h.resource && !h.fortress && !h.control;
    });
    const picks = pickRandom(active, Math.min(6, Math.floor(active.length / 12)));
    picks.forEach((key) => {
      state.map.hexes[key].barbarian = true;
    });
  }

  function placeTile(tileId, anchorKey, rotation, side, ownerId, forceCore) {
    const tile = state.setup.tiles[tileId];
    if (!tile) return false;
    const cellKeys = tileKeysForAnchor(anchorKey, rotation);
    if (cellKeys.length !== TILE_OFFSETS.length) return false;

    tile.placed = true;
    tile.anchorKey = anchorKey;
    tile.rotation = rotation;
    tile.side = side;
    if (ownerId) tile.ownerId = ownerId;
    if (forceCore) tile.isCore = true;

    cellKeys.forEach((key) => {
      const hex = state.map.hexes[key];
      if (!hex) return;
      hex.active = true;
      hex.revealed = true;
      hex.terrain = randomLandTerrain();
      hex.resource = null;
      hex.cityState = null;
      hex.barbarian = false;
      hex.fortress = false;
      hex.fortressOwnerId = null;
      hex.control = null;
      hex.city = null;
      hex.tradeMarker = false;
      hex.core = tile.isCore;
      hex.coreAdjacent = false;
    });

    const pivot = state.map.hexes[anchorKey];
    if (pivot) {
      if (tile.tradeMarker) pivot.tradeMarker = true;
      if (tile.type === "natural") {
        pivot.resource = "wonder";
      }
      if (tile.type === "citystate") {
        pivot.cityState = {
          name: CITY_STATE_NAMES[Math.floor(Math.random() * CITY_STATE_NAMES.length)],
          type: FOCUS_ORDER[Math.floor(Math.random() * FOCUS_ORDER.length)]
        };
      }
      if (tile.type === "capital" && tile.ownerId) {
        pivot.terrain = "grass";
        pivot.city = { ownerId: tile.ownerId, isCapital: true, developed: false, hasWonder: false };
      }
    }
    return true;
  }

  function tilePlacementInfo(tileId, anchorKey, rotation) {
    const tile = state.setup?.tiles[tileId];
    if (!tile) return { ok: false, touchesCore: false, touchesCoreAdjacent: false };
    const cellKeys = tileKeysForAnchor(anchorKey, rotation);
    if (cellKeys.length !== TILE_OFFSETS.length) return { ok: false, touchesCore: false, touchesCoreAdjacent: false };
    if (cellKeys.some((key) => state.map.hexes[key]?.active)) {
      return { ok: false, touchesCore: false, touchesCoreAdjacent: false };
    }

    const cellKeySet = new Set(cellKeys);
    let adjacentTileCells = 0;
    let touchesCore = false;
    let touchesCoreAdjacent = false;
    cellKeys.forEach((key) => {
      let hasNeighbor = false;
      neighborsFromKey(key).forEach((neighborKey) => {
        if (cellKeySet.has(neighborKey)) return;
        const neighbor = state.map.hexes[neighborKey];
        if (!neighbor?.active) return;
        hasNeighbor = true;
        if (neighbor.core) touchesCore = true;
        if (neighbor.coreAdjacent) touchesCoreAdjacent = true;
      });
      if (hasNeighbor) adjacentTileCells += 1;
    });

    if (!tile.isCore && adjacentTileCells < 4) {
      return { ok: false, touchesCore, touchesCoreAdjacent };
    }
    return { ok: true, touchesCore, touchesCoreAdjacent };
  }

  function canPlaceTile(tileId, anchorKey, rotation) {
    const info = tilePlacementInfo(tileId, anchorKey, rotation);
    if (!info.ok) return false;
    const tile = state.setup?.tiles[tileId];
    if (!tile || tile.isCore) return info.ok;
    if (!info.touchesCore && !info.touchesCoreAdjacent) return false;
    return true;
  }

  function validTileAnchorsForRotation(tileId, rotation) {
    if (!tileId || !state.setup?.tiles[tileId]) return [];
    const tile = state.setup.tiles[tileId];
    const anchors = [];
    const coreAnchors = [];
    Object.values(state.map.hexes).forEach((hex) => {
      const anchorKey = keyFrom(hex.q, hex.r);
      const info = tilePlacementInfo(tileId, anchorKey, rotation);
      if (!info.ok) return;
      if (!tile.isCore && !info.touchesCore && !info.touchesCoreAdjacent) return;
      anchors.push(anchorKey);
      if (info.touchesCore) coreAnchors.push(anchorKey);
    });
    if (!tile.isCore && coreAnchors.length) return coreAnchors;
    return anchors;
  }

  function tileKeysForAnchor(anchorKey, rotation) {
    return tileCellsForAnchor(anchorKey, rotation)
      .map((cell) => keyFrom(cell.q, cell.r))
      .filter((key) => state.map.hexes[key]);
  }

  function tileCellsForAnchor(anchorKey, rotation) {
    const anchor = state.map.hexes[anchorKey];
    if (!anchor) return [];
    return TILE_OFFSETS.map((offset) => rotateAxial(offset, rotation)).map((rotated) => ({
      q: rotated.q + anchor.q,
      r: rotated.r + anchor.r
    }));
  }

  function activeNeighborCount(q, r) {
    return neighbors(q, r).filter((key) => state.map.hexes[key]?.active).length;
  }

  function updateCoreAdjacency() {
    Object.values(state.map.hexes).forEach((hex) => {
      hex.coreAdjacent = false;
    });
    Object.values(state.map.hexes)
      .filter((hex) => hex.core)
      .forEach((hex) => {
        neighbors(hex.q, hex.r).forEach((neighborKey) => {
          const neighbor = state.map.hexes[neighborKey];
          if (neighbor?.active) neighbor.coreAdjacent = true;
        });
      });
  }

  function isBoundaryHex(hex, radius) {
    const maxCoord = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.q + hex.r));
    return maxCoord === radius;
  }

  function fillEnclosedHoles() {
    if (!state) return;
    const { hexes, radius } = state.map;
    const outside = new Set();
    const queue = [];

    Object.values(hexes).forEach((hex) => {
      if (!hex.active && isBoundaryHex(hex, radius)) {
        const key = keyFrom(hex.q, hex.r);
        outside.add(key);
        queue.push(key);
      }
    });

    while (queue.length) {
      const key = queue.shift();
      neighborsFromKey(key).forEach((neighborKey) => {
        if (outside.has(neighborKey)) return;
        const neighbor = hexes[neighborKey];
        if (!neighbor || neighbor.active) return;
        outside.add(neighborKey);
        queue.push(neighborKey);
      });
    }

    Object.values(hexes).forEach((hex) => {
      if (hex.active) return;
      const key = keyFrom(hex.q, hex.r);
      if (outside.has(key)) return;
      hex.active = true;
      hex.revealed = true;
      hex.terrain = "water";
      hex.resource = null;
      hex.cityState = null;
      hex.barbarian = false;
      hex.fortress = false;
      hex.fortressOwnerId = null;
      hex.control = null;
      hex.city = null;
      hex.tradeMarker = false;
      hex.core = false;
      hex.coreAdjacent = false;
    });
  }

  function randomLandTerrain() {
    const roll = Math.random() * 100;
    if (roll < 30) return "grass";
    if (roll < 55) return "hill";
    if (roll < 75) return "forest";
    if (roll < 90) return "desert";
    return "mountain";
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function buildTileOffsets() {
    const coords = [
      { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 },
      { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 },
      { r: 2, c: 2 }, { r: 2, c: 3 }
    ];
    const pivot = { r: 1, c: 1 };
    const pivotAxial = offsetToAxial(pivot.r, pivot.c);
    return coords.map((cell) => {
      const axial = offsetToAxial(cell.r, cell.c);
      return { q: axial.q - pivotAxial.q, r: axial.r - pivotAxial.r };
    });
  }

  function offsetToAxial(row, col) {
    const q = col - Math.floor((row - (row & 1)) / 2);
    return { q, r: row };
  }

  function rotateAxial(coord, steps) {
    let x = coord.q;
    let z = coord.r;
    let y = -x - z;
    for (let i = 0; i < steps; i += 1) {
      const newX = -z;
      const newY = -x;
      const newZ = -y;
      x = newX;
      y = newY;
      z = newZ;
    }
    return { q: x, r: z };
  }
  function applyAction(action) {
    if (!state) return;
    const { type, payload } = action;
    if (type === "ADD_PLAYER") {
      if (state.players.find((p) => p.id === payload.id)) return;
      state.players.push(payload);
      state.turn.order.push(payload.id);
      placeCapital(state, payload.id);
      return;
    }

    if (type === "START_ADVANCED_SETUP") {
      const players = state.players.map((player) => ({
        ...player,
        resources: { ...player.resources },
        trade: { ...player.trade },
        govBonus: { ...player.govBonus },
        focusRow: player.focusRow.slice(),
        armies: player.armies.map((unit) => ({ ...unit, position: null })),
        wagons: player.wagons.map((unit) => ({ ...unit, position: null })),
        govMarkers: [],
        diplomacy: [],
        victoryPoints: { ...player.victoryPoints }
      }));
      state = buildStateForSetup(players);
      state.setup = createSetupState(players.map((player) => player.id));
      state.eventWheel = { position: 0, events: EVENT_WHEEL.slice() };
      state.pendingEvent = null;
      state.phase = "setup";
      state.winner = null;
      placeCoreTiles();
      state.turn.order = state.setup.order.slice();
      state.turn.index = 0;
      state.turn.round = 1;
      logEntry("Advanced setup started.");
      return;
    }

    if (type === "PLACE_FORTRESS") {
      if (!state.setup || state.setup.phase !== "fortress") return;
      const setup = state.setup;
      const activeId = setup.order[setup.turnIndex];
      if (payload.playerId !== activeId) return;
      const hex = state.map.hexes[payload.key];
      if (!hex || hex.active) return;
      if (activeNeighborCount(hex.q, hex.r) < 2) return;
      hex.active = true;
      hex.revealed = true;
      hex.terrain = randomLandTerrain();
      hex.resource = null;
      hex.cityState = null;
      hex.barbarian = false;
      hex.fortress = true;
      hex.fortressOwnerId = payload.playerId;
      hex.control = null;
      hex.city = null;
      hex.tradeMarker = false;
      hex.core = false;
      hex.coreAdjacent = false;
      setup.fortressPlaced[payload.playerId] = true;
      fillEnclosedHoles();
      updateCoreAdjacency();
      const player = getPlayer(payload.playerId);
      logEntry(`${player ? player.name : "Player"} placed a fortress.`);
      advanceSetupTurn();
      return;
    }

    if (type === "PLACE_TILE") {
      if (!state.setup || state.setup.phase !== "tile") return;
      const setup = state.setup;
      const activeId = setup.order[setup.turnIndex];
      if (payload.playerId !== activeId) return;
      const tiles = setup.playerTiles[payload.playerId] || [];
      if (!tiles.includes(payload.tileId)) return;
      const validAnchors = validTileAnchorsForRotation(payload.tileId, payload.rotation);
      if (!validAnchors.includes(payload.anchorKey)) return;
      const tile = setup.tiles[payload.tileId];
      if (!tile) return;
      placeTile(payload.tileId, payload.anchorKey, payload.rotation, payload.side, null, false);
      setup.playerTiles[payload.playerId] = tiles.filter((id) => id !== payload.tileId);
      fillEnclosedHoles();
      updateCoreAdjacency();
      logEntry(`${getPlayer(payload.playerId)?.name || "Player"} placed ${payload.tileId} (${tile.type}).`);
      advanceSetupTurn();
      return;
    }

    if (type === "EDIT_HEX") {
      const hex = state.map.hexes[payload.key];
      if (!hex) return;
      Object.assign(hex, payload.changes);
      return;
    }

    if (type === "PLACE_CONTROL") {
      const hex = state.map.hexes[payload.key];
      if (!hex) return;
      hex.control = { ownerId: payload.playerId, fortified: false, district: null };
      if (hex.resource) {
        const player = getPlayer(payload.playerId);
        if (player && player.resources[hex.resource] !== undefined) {
          player.resources[hex.resource] += 1;
        }
        hex.resource = null;
      }
      checkCityDevelopment(payload.playerId);
      return;
    }

    if (type === "PLACE_DISTRICT") {
      const hex = state.map.hexes[payload.key];
      if (!hex) return;
      hex.control = { ownerId: payload.playerId, fortified: false, district: payload.district };
      checkCityDevelopment(payload.playerId);
      return;
    }

    if (type === "TOGGLE_FORTIFY") {
      const hex = state.map.hexes[payload.key];
      if (!hex || !hex.control || hex.control.ownerId !== payload.playerId) return;
      hex.control.fortified = !hex.control.fortified;
      return;
    }

    if (type === "BUILD_CITY") {
      const hex = state.map.hexes[payload.key];
      if (!hex) return;
      hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, hasWonder: false };
      if (hex.control && hex.control.ownerId === payload.playerId) {
        hex.control = null;
      }
      checkCityDevelopment(payload.playerId);
      return;
    }

    if (type === "BUILD_WONDER") {
      const hex = state.map.hexes[payload.key];
      if (!hex || !hex.city || hex.city.ownerId !== payload.playerId) return;
      hex.city.hasWonder = true;
      return;
    }

    if (type === "MOVE_UNIT") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      const units = payload.unitType === "army" ? player.armies : player.wagons;
      const unit = units.find((u) => u.id === payload.unitId);
      if (!unit) return;
      unit.position = payload.to || null;
      if (payload.to) {
        revealAround(state.map, payload.to, 1);
      }
      return;
    }

    if (type === "RESOLVE_CARD") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      const index = player.focusRow.indexOf(payload.cardType);
      if (index >= 0) {
        player.focusRow.splice(index, 1);
        player.focusRow.unshift(payload.cardType);
      }
      if (payload.tradeSpent) {
        player.trade[payload.cardType] = Math.max(0, player.trade[payload.cardType] - payload.tradeSpent);
      }
      player.cardPlayed = true;
      return;
    }

    if (type === "ADVANCE_TECH") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      player.tech += payload.amount;
      if (player.tech >= TECH_WHEEL_SIZE) {
        player.tech = player.tech - TECH_RESET_AT;
        player.techTier = Math.min(4, (player.techTier || 1) + 1);
        logEntry(`${player.name} advanced to tech tier ${player.techTier}! Wheel reset.`);
      }
      return;
    }

    if (type === "ADD_TRADE") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      player.trade[payload.cardType] = Math.min(DEFAULTS.maxTradePerCard, player.trade[payload.cardType] + payload.amount);
      return;
    }

    if (type === "ATTACK") {
      resolveCombat(payload);
      return;
    }

    if (type === "RECRUIT_ARMY") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      if (player.armies.length >= DEFAULTS.maxArmies) return;
      player.armies.push(createUnit("army", player.armies.length + 1));
      logEntry(`${player.name} recruited a new army.`);
      return;
    }

    if (type === "RECRUIT_WAGON") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      if (player.wagons.length >= DEFAULTS.maxWagons) return;
      player.wagons.push(createUnit("wagon", player.wagons.length + 1));
      logEntry(`${player.name} recruited a new wagon.`);
      return;
    }

    if (type === "SET_GOV_BONUS") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      player.govBonus[payload.focusType] = payload.value;
      return;
    }

    if (type === "SPEND_RESOURCE") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      if (player.resources[payload.resourceType] <= 0) return;
      player.resources[payload.resourceType] -= 1;
      return;
    }

    if (type === "ASSIGN_GOV") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      const markers = (payload.markers || []).slice(0, MAX_GOV_MARKERS);
      player.govMarkers = markers;
      FOCUS_ORDER.forEach((f) => { player.govBonus[f] = 0; });
      markers.forEach((f) => { player.govBonus[f] = (player.govBonus[f] || 0) + 1; });
      logEntry(`${player.name} reassigned government markers.`);
      return;
    }

    if (type === "RESOLVE_EVENT") {
      resolveEvent(payload.eventType);
      return;
    }

    if (type === "ADVANCE_EVENT_WHEEL") {
      advanceEventWheel();
      return;
    }

    if (type === "END_TURN") {
      const cp = currentPlayer();
      if (cp) cp.cardPlayed = false;
      state.turn.index = (state.turn.index + 1) % state.turn.order.length;
      if (state.turn.index === 0) {
        state.turn.round += 1;
        advanceEventWheel();
        const winner = checkVictoryConditions();
        if (winner) {
          state.winner = winner;
          state.phase = "gameover";
          logEntry(`${winner.player.name} wins with ${winner.type}!`);
        } else {
          logEntry(`Round ${state.turn.round} begins.`);
        }
      }
      return;
    }
  }

  function resolveCombat(payload) {
    const attacker = getPlayer(payload.attackerId);
    if (!attacker) return;
    const hex = state.map.hexes[payload.key];
    if (!hex) return;

    const attackerRoll = rollDie();
    const defenderRoll = rollDie();

    const attackerValue = attackerRoll + payload.attackPower;
    const defenderValue = defenderRoll + payload.defensePower;

    state.lastRoll = { attackerRoll, defenderRoll, attackerValue, defenderValue };
    dom.diceResult.textContent = `${attackerRoll} vs ${defenderRoll}`;

    if (attackerValue > defenderValue) {
      applyCombatWin(payload, hex);
      logEntry(`${attacker.name} won the combat.`);
    } else {
      applyCombatLoss(payload);
      logEntry(`${attacker.name} lost the combat.`);
    }
  }

  function applyCombatWin(payload, hex) {
    const attacker = getPlayer(payload.attackerId);
    if (attacker) {
      const unit = attacker.armies.find((u) => u.id === payload.attackerUnitId);
      if (unit) {
        unit.position = payload.key;
      }
    }
    if (payload.defender.type === "barbarian") {
      hex.barbarian = false;
    }
    if (payload.defender.type === "control") {
      hex.control = { ownerId: payload.attackerId, fortified: false, district: null };
    }
    if (payload.defender.type === "city") {
      hex.city = { ownerId: payload.attackerId, isCapital: false, developed: false, hasWonder: hex.city?.hasWonder || false };
    }
    if (payload.defender.type === "citystate") {
      hex.cityState = null;
      hex.city = { ownerId: payload.attackerId, isCapital: false, developed: false, hasWonder: false };
    }
    if (payload.defender.type === "army" || payload.defender.type === "wagon") {
      const defenderPlayer = getPlayer(payload.defender.ownerId);
      if (defenderPlayer) {
        const units = payload.defender.type === "army" ? defenderPlayer.armies : defenderPlayer.wagons;
        const unit = units.find((u) => u.id === payload.defender.unitId);
        if (unit) unit.position = null;
      }
    }
  }

  function applyCombatLoss(payload) {
    const attacker = getPlayer(payload.attackerId);
    if (!attacker) return;
    const unit = attacker.armies.find((u) => u.id === payload.attackerUnitId);
    if (unit) {
      unit.position = null;
    }
  }

  function advanceEventWheel() {
    if (!state.eventWheel) return;
    const wheel = state.eventWheel;
    wheel.position = (wheel.position + 1) % wheel.events.length;
    const eventType = wheel.events[wheel.position];
    state.pendingEvent = eventType;
    logEntry(`Event: ${formatEventName(eventType)}`);
    resolveEvent(eventType);
    state.pendingEvent = null;
  }

  function formatEventName(eventType) {
    return eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function resolveEvent(eventType) {
    if (eventType === "barbarian_spawn") {
      spawnBarbarians();
    } else if (eventType === "barbarian_move") {
      moveBarbarians();
    } else if (eventType === "district_event") {
      resolveDistrictEvents();
    } else if (eventType === "government_change") {
      resolveGovernmentChange();
    } else if (eventType === "wonder_aging") {
      resolveWonderAging();
    }
  }

  function spawnBarbarians() {
    const spawnCandidates = Object.values(state.map.hexes).filter((hex) => {
      if (!hex.active || !hex.revealed) return false;
      if (hex.terrain === "water") return false;
      if (hex.city || hex.cityState || hex.barbarian || hex.fortress) return false;
      if (hex.control) return false;
      const hasAdjacentCity = neighbors(hex.q, hex.r).some((nk) => {
        const nh = state.map.hexes[nk];
        return nh && (nh.city || nh.cityState);
      });
      return !hasAdjacentCity;
    });

    const roll = rollDie();
    const count = roll <= 2 ? 1 : roll <= 4 ? 2 : 3;
    const picks = pickRandom(spawnCandidates.map((h) => keyFrom(h.q, h.r)), count);
    picks.forEach((key) => {
      state.map.hexes[key].barbarian = true;
    });
    if (picks.length > 0) {
      logEntry(`${picks.length} barbarian(s) spawned.`);
    }
  }

  function moveBarbarians() {
    const barbarianHexes = Object.values(state.map.hexes).filter((h) => h.barbarian);
    const moves = [];
    barbarianHexes.forEach((hex) => {
      const roll = rollDie();
      const dirIndex = roll - 1;
      const dir = BARBARIAN_DIRECTIONS[dirIndex];
      const targetQ = hex.q + dir.dq;
      const targetR = hex.r + dir.dr;
      const targetKey = keyFrom(targetQ, targetR);
      const targetHex = state.map.hexes[targetKey];
      if (!targetHex || !targetHex.active || targetHex.terrain === "water") return;

      const fromKey = keyFrom(hex.q, hex.r);
      moves.push({ from: fromKey, to: targetKey });
    });

    moves.forEach((move) => {
      const fromHex = state.map.hexes[move.from];
      const toHex = state.map.hexes[move.to];
      if (!fromHex || !toHex) return;
      if (!fromHex.barbarian) return;

      fromHex.barbarian = false;

      if (toHex.control && !toHex.control.fortified) {
        toHex.control = null;
        toHex.barbarian = true;
        logEntry("Barbarian destroyed a control marker.");
      } else if (toHex.control && toHex.control.fortified) {
        toHex.control.fortified = false;
        logEntry("Barbarian removed fortification from a marker.");
      } else if (toHex.city) {
        toHex.barbarian = true;
        logEntry("Barbarian reached a city!");
      } else if (!toHex.barbarian) {
        toHex.barbarian = true;
      }
    });

    if (moves.length > 0) {
      logEntry(`${moves.length} barbarian(s) moved.`);
    }
  }

  function resolveDistrictEvents() {
    state.players.forEach((player) => {
      let campusCount = 0;
      let tradeCount = 0;
      let encampmentCount = 0;
      let industrialCount = 0;
      let theaterCount = 0;

      Object.values(state.map.hexes).forEach((hex) => {
        if (!hex.control || hex.control.ownerId !== player.id || !hex.control.district) return;
        switch (hex.control.district) {
          case "campus": campusCount++; break;
          case "trade": tradeCount++; break;
          case "encampment": encampmentCount++; break;
          case "industrial": industrialCount++; break;
          case "theater": theaterCount++; break;
        }
      });

      if (campusCount > 0) {
        player.tech += campusCount;
        logEntry(`${player.name}: +${campusCount} tech from campus districts.`);
      }
      if (tradeCount > 0) {
        const tradeTypes = FOCUS_ORDER;
        for (let i = 0; i < tradeCount && i < tradeTypes.length; i++) {
          player.trade[tradeTypes[i]] = Math.min(DEFAULTS.maxTradePerCard, player.trade[tradeTypes[i]] + 1);
        }
        logEntry(`${player.name}: +${tradeCount} trade markers from trade districts.`);
      }
      if (encampmentCount > 0 && player.armies.length < DEFAULTS.maxArmies) {
        const toRecruit = Math.min(encampmentCount, DEFAULTS.maxArmies - player.armies.length);
        for (let i = 0; i < toRecruit; i++) {
          player.armies.push(createUnit("army", player.armies.length + 1));
        }
        logEntry(`${player.name}: recruited ${toRecruit} army(s) from encampment districts.`);
      }
      if (industrialCount > 0) {
        player.govBonus.industry = Math.min(3, (player.govBonus.industry || 0) + industrialCount);
        logEntry(`${player.name}: +${industrialCount} industry bonus from industrial districts.`);
      }
      if (theaterCount > 0) {
        player.govBonus.culture = Math.min(3, (player.govBonus.culture || 0) + theaterCount);
        logEntry(`${player.name}: +${theaterCount} culture bonus from theater districts.`);
      }
    });

    const developedCities = [];
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && isCityDeveloped(hex)) {
        hex.city.developed = true;
        const owner = getPlayer(hex.city.ownerId);
        if (owner) {
          owner.trade.economy = Math.min(DEFAULTS.maxTradePerCard, owner.trade.economy + 1);
          developedCities.push(owner.name);
        }
      }
    });
    if (developedCities.length > 0) {
      logEntry(`Developed cities gave trade to: ${[...new Set(developedCities)].join(", ")}`);
    }
  }

  function resolveGovernmentChange() {
    logEntry("Government change event — players may adjust government markers.");
  }

  function resolveWonderAging() {
    let wonderCount = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.hasWonder) wonderCount++;
    });
    if (wonderCount > 0) {
      logEntry(`Wonder aging: ${wonderCount} wonder(s) on the map.`);
    }
  }

  function checkCityDevelopment(playerId) {
    Object.values(state.map.hexes).forEach((hex) => {
      if (!hex.city || hex.city.ownerId !== playerId) return;
      const wasDeveloped = hex.city.developed;
      const nowDeveloped = isCityDeveloped(hex);
      hex.city.developed = nowDeveloped;
      if (!wasDeveloped && nowDeveloped) {
        const player = getPlayer(playerId);
        logEntry(`${player?.name || "Player"}'s city at ${keyFrom(hex.q, hex.r)} is now developed!`);
      }
    });
  }

  function checkVictoryConditions() {
    for (const player of state.players) {
      for (const [vtype, vdef] of Object.entries(VICTORY_TYPES)) {
        if (vdef.check(player)) {
          return { player, type: vdef.label };
        }
      }
    }
    if (state.turn.round >= DEFAULTS.maxRounds) {
      let best = null;
      let bestScore = -1;
      state.players.forEach((p) => {
        const score = computeScore(p);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      });
      if (best) {
        return { player: best, type: `Highest score (${bestScore}) after ${DEFAULTS.maxRounds} rounds` };
      }
    }
    return null;
  }

  function computeScore(player) {
    let score = 0;
    score += countCities(player.id).total * 3;
    score += countDevelopedCities(player.id) * 2;
    score += countWonders(player.id) * 4;
    score += countControlMarkers(player.id);
    score += Math.floor(player.tech / 4);
    score += countDistricts(player.id) * 2;
    return score;
  }

  function countControlMarkers(playerId) {
    let count = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.control && hex.control.ownerId === playerId) count++;
    });
    return count;
  }

  function countWonders(playerId) {
    let count = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && hex.city.hasWonder) count++;
    });
    return count;
  }

  function countDevelopedCities(playerId) {
    let count = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && isCityDeveloped(hex)) count++;
    });
    return count;
  }

  function countDistricts(playerId) {
    let count = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.control && hex.control.ownerId === playerId && hex.control.district) count++;
    });
    return count;
  }

  function getPlayer(id) {
    return state.players.find((p) => p.id === id);
  }

  function currentPlayer() {
    if (!state) return null;
    const id = state.turn.order[state.turn.index];
    return getPlayer(id);
  }

  function renderAll() {
    if (!state) {
      dom.actionPanel.innerHTML = "<div class=\"empty-state\">Create or join a room to begin.</div>";
      dom.playerList.innerHTML = "";
      dom.focusRow.innerHTML = "";
      dom.map.innerHTML = "";
      return;
    }
    renderPlayers();
    renderFocusRow();
    renderEventWheel();
    syncSetupUi();
    renderMap();
    renderActions();
    renderLog();
    renderHostTools();
  }

  function renderPlayers() {
    const current = currentPlayer();
    dom.turnIndicator.textContent = current ? `Turn: ${current.name}` : "Turn: -";
    dom.roundDisplay.textContent = `Round ${state.turn.round}`;

    dom.playerList.innerHTML = "";
    state.players.forEach((player) => {
      const card = document.createElement("div");
      card.className = "player-card";
      if (current && current.id === player.id) {
        card.classList.add("active");
      }
      card.addEventListener("click", () => {
        ui.viewPlayerId = player.id;
        renderFocusRow();
      });
      const cityStats = countCities(player.id);
      const ctrl = countControlMarkers(player.id);
      const wonders = countWonders(player.id);
      const districts = countDistricts(player.id);
      const resources = Object.values(player.resources).reduce((s, v) => s + v, 0);
      card.innerHTML = `
        <div class="player-name"><span class="color-dot" style="--player-color:${player.color}"></span>${player.name}</div>
        <div class="player-meta">
          <span>Cities: ${cityStats.total}</span>
          <span>Dev: ${cityStats.developed}</span>
          <span>Ctrl: ${ctrl}</span>
          <span>Wonders: ${wonders}</span>
        </div>
        <div class="player-meta">
          <span>Tech: ${player.tech}/${TECH_WHEEL_SIZE} (T${player.techTier || 1})</span>
          <span>Trade: ${totalTrade(player)}</span>
          <span>Res: ${resources}</span>
          <span>Dist: ${districts}</span>
        </div>
        <div class="player-meta">
          <span>Armies: ${player.armies.length}</span>
          <span>Wagons: ${player.wagons.length}</span>
          <span>Score: ${computeScore(player)}</span>
        </div>
      `;
      dom.playerList.appendChild(card);
    });
  }

  function renderFocusRow() {
    const player = getPlayer(ui.viewPlayerId) || currentPlayer();
    if (!player) return;
    dom.focusOwner.textContent = player.name;
    dom.focusRow.innerHTML = "";

    player.focusRow.forEach((cardType, index) => {
      const slot = FOCUS_SLOTS[index];
      const govB = player.govBonus[cardType] || 0;
      const effectiveSlot = Math.min(5, slot + govB);
      const card = document.createElement("div");
      card.className = "focus-card";
      card.classList.add(`focus-${cardType}`);
      const isCurrent = currentPlayer()?.id === player.id;
      const isLocal = localPlayerId === player.id;
      if (!isCurrent || !isLocal) {
        card.classList.add("disabled");
      }
      const tradeMarkers = "●".repeat(player.trade[cardType]) + "○".repeat(DEFAULTS.maxTradePerCard - player.trade[cardType]);
      card.innerHTML = `
        <div class="focus-slot">${effectiveSlot}${govB > 0 ? `<span class="gov-bonus">+${govB}</span>` : ""}</div>
        <div class="focus-name">${FOCUS_META[cardType].label}</div>
        <div class="focus-trade">${tradeMarkers}</div>
      `;
      card.addEventListener("click", () => {
        if (!isCurrent || !isLocal) return;
        startCardAction(player, cardType, index);
      });
      dom.focusRow.appendChild(card);
    });
  }

  function renderEventWheel() {
    if (!state || !state.eventWheel || !dom.eventWheelTrack) return;
    const wheel = state.eventWheel;
    const pos = wheel.position;
    dom.eventDisplay.textContent = formatEventName(wheel.events[pos]);
    dom.eventWheelTrack.innerHTML = "";
    wheel.events.forEach((evt, i) => {
      const el = document.createElement("div");
      el.className = "event-pip";
      if (i === pos) el.classList.add("active");
      if (i === (pos + 1) % wheel.events.length) el.classList.add("next");
      el.textContent = formatEventName(evt).slice(0, 3);
      el.title = formatEventName(evt);
      dom.eventWheelTrack.appendChild(el);
    });
  }

  function renderMap() {
    if (!state) return;
    if (hexElements.size === 0 || dom.map.childElementCount === 0) {
      buildMapDom();
    }
    const map = state.map;
    Object.values(map.hexes).forEach((hex) => {
      const key = keyFrom(hex.q, hex.r);
      const el = hexElements.get(key);
      if (!el) return;
      el.className = "hex";
      if (!hex.active) {
        el.classList.add("inactive");
      }
      if (!hex.revealed || !hex.active) {
        el.classList.add("hidden");
      } else {
        el.classList.add(`terrain-${hex.terrain}`);
      }
      if (ui.selectable.has(key)) {
        el.classList.add("selectable");
      }
      const tokens = [];
      if (hex.city) {
        const owner = getPlayer(hex.city.ownerId);
        tokens.push(tokenSpan("city", hex.city.isCapital ? "Cap" : "City", owner?.color));
        if (hex.city.hasWonder) {
          tokens.push(tokenSpan("resource", "Wonder"));
        }
      }
      if (hex.control) {
        const owner = getPlayer(hex.control.ownerId);
        const label = hex.control.district ? hex.control.district.slice(0, 3) : "Ctrl";
        tokens.push(tokenSpan(hex.control.district ? "district" : "control", label, owner?.color));
        if (hex.control.fortified) {
          tokens.push(tokenSpan("control", "Fort", owner?.color));
        }
      }
      if (hex.cityState) {
        tokens.push(tokenSpan("citystate", "CS"));
      }
      if (hex.barbarian) {
        tokens.push(tokenSpan("barbarian", "Barb"));
      }
      if (hex.resource) {
        tokens.push(tokenSpan("resource", hex.resource.slice(0, 3)));
      }
      if (hex.tradeMarker) {
        tokens.push(tokenSpan("resource", "Trade"));
      }
      if (hex.fortress) {
        const owner = hex.fortressOwnerId ? getPlayer(hex.fortressOwnerId) : null;
        tokens.push(tokenSpan("fortress", "Fort", owner?.color));
      }
      const units = getUnitsAt(key);
      units.forEach((unit) => {
        const owner = getPlayer(unit.playerId);
        tokens.push(tokenSpan(unit.type, unit.type === "army" ? "Army" : "Wag", owner?.color));
      });
      el.innerHTML = `<div class="hex-content"><div class="token-row">${tokens.join("")}</div></div>`;
    });
  }

  function buildMapDom() {
    dom.map.innerHTML = "";
    hexElements.clear();
    const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hex-size"));
    const width = size * 1.732;
    const height = size * 2;
    const xOffset = width * 0.75;

    Object.values(state.map.hexes).forEach((hex) => {
      const key = keyFrom(hex.q, hex.r);
      const el = document.createElement("div");
      const x = (hex.q + state.map.radius) * xOffset + (hex.r + state.map.radius) * xOffset * 0.5;
      const y = (hex.r + state.map.radius) * (height * 0.75);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.dataset.key = key;
      el.addEventListener("click", () => handleHexClick(key));
      dom.map.appendChild(el);
      hexElements.set(key, el);
    });
  }
  function renderActions() {
    const player = getPlayer(localPlayerId) || currentPlayer();
    if (!player) {
      dom.actionPanel.innerHTML = "<div class=\"empty-state\">Waiting for players.</div>";
      return;
    }
    if (state.setup && state.setup.phase !== "done") {
      dom.actionPanel.innerHTML = "<div class=\"action-card\"><div class=\"action-title\">Setup in progress</div><div class=\"action-row\">Host is building the world map.</div></div>";
      return;
    }

    if (state.winner) {
      dom.actionPanel.innerHTML = `
        <div class="action-card victory">
          <div class="action-title">Game Over!</div>
          <div class="action-row">${state.winner.player.name} wins!</div>
          <div class="action-row">${state.winner.type}</div>
          <div class="action-row scores">
            ${state.players.map((p) => `<div>${p.name}: ${computeScore(p)} pts</div>`).join("")}
          </div>
        </div>
      `;
      return;
    }

    const eventInfo = state.eventWheel
      ? `<div class="event-info"><span class="label">Next Event:</span> ${formatEventName(state.eventWheel.events[(state.eventWheel.position + 1) % state.eventWheel.events.length])}</div>`
      : "";

    if (!ui.activeCard) {
      const isMyTurn = currentPlayer()?.id === localPlayerId;
      const recruits = [];
      if (player.armies.length < DEFAULTS.maxArmies) {
        recruits.push(`<button class="btn tiny" id="recruit-army">Recruit Army</button>`);
      }
      if (player.wagons.length < DEFAULTS.maxWagons) {
        recruits.push(`<button class="btn tiny" id="recruit-wagon">Recruit Wagon</button>`);
      }

      const govDisplay = player.govMarkers.length
        ? `Gov: ${player.govMarkers.map((m) => FOCUS_META[m].label).join(", ")}`
        : "Gov: none assigned";

      dom.actionPanel.innerHTML = `
        <div class="action-card">
          ${eventInfo}
          <div class="action-title">${isMyTurn ? "Your Turn" : `${currentPlayer()?.name || "-"}'s Turn`}</div>
          <div class="action-row">${isMyTurn ? "Select a focus card to begin." : "Wait for your turn."}</div>
          ${isMyTurn ? `
            <div class="action-row recruit-row">${recruits.join(" ")}</div>
            <div class="action-row resource-row">
              ${Object.entries(player.resources).filter(([, v]) => v > 0).map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`).join(" ") || "<span class='dim'>No resources</span>"}
            </div>
            <div class="action-row"><span class="dim">${govDisplay}</span><button class="btn tiny" id="assign-gov">Assign Gov</button></div>
            <button class="btn" id="end-turn">End Turn</button>
          ` : ""}
        </div>
      `;
      if (isMyTurn) {
        const endBtn = document.getElementById("end-turn");
        if (endBtn) endBtn.addEventListener("click", () => dispatch({ type: "END_TURN" }));
        const raBtn = document.getElementById("recruit-army");
        if (raBtn) raBtn.addEventListener("click", () => dispatch({ type: "RECRUIT_ARMY", payload: { playerId: player.id } }));
        const rwBtn = document.getElementById("recruit-wagon");
        if (rwBtn) rwBtn.addEventListener("click", () => dispatch({ type: "RECRUIT_WAGON", payload: { playerId: player.id } }));
        const govBtn = document.getElementById("assign-gov");
        if (govBtn) govBtn.addEventListener("click", () => showGovPicker(player));
      }
      return;
    }

    const card = ui.activeCard;
    const tradeAvailable = player.trade[card.type];
    const spend = card.tradeSpent || 0;
    const slot = card.effectiveSlot;
    const lines = [];

    lines.push(eventInfo);
    lines.push(`<div class="action-title">Active: ${FOCUS_META[card.type].label} (Slot ${slot})</div>`);
    lines.push(`<div class="action-row">Trade on card: ${tradeAvailable} — ${FOCUS_META[card.type].tradeBonus}</div>`);
    lines.push(`
      <div class="action-row">
        <span>Spend trade</span>
        <div class="counter">
          <button id="trade-dec">-</button>
          <span id="trade-count">${spend}</span>
          <button id="trade-inc">+</button>
        </div>
      </div>
    `);

    if (card.type === "culture") {
      lines.push(`<div class="action-row">Place <strong>${slot + spend}</strong> control markers (terrain ≤ ${slot}).</div>`);
    }
    if (card.type === "growth") {
      lines.push(`<div class="action-row">Place <strong>1</strong> district OR reinforce <strong>${slot}</strong> markers.</div>`);
      if (spend > 0) lines.push(`<div class="action-row dim">+${spend} extra from trade.</div>`);
    }
    if (card.type === "science") {
      lines.push(`<div class="action-row">Advance tech by <strong>${slot + spend}</strong>. Current: ${player.tech}/${TECH_WHEEL_SIZE} (Tier ${player.techTier || 1})</div>`);
    }
    if (card.type === "economy") {
      lines.push(`<div class="action-row">Move wagons up to <strong>${DEFAULTS.baseWagonMove + spend}</strong> hexes.</div>`);
      lines.push(`<div class="action-row dim">Wagons trade at city-states and foreign cities.</div>`);
    }
    if (card.type === "industry") {
      const production = slot + spend;
      lines.push(`<div class="action-row">Production power: <strong>${production}</strong>. Build city (cost = terrain) or wonder (cost = 6).</div>`);
      lines.push(`<div class="action-row dim">Resources give +${DEFAULTS.resourceProductionValue} each.</div>`);
    }
    if (card.type === "military") {
      const moveRange = DEFAULTS.baseArmyMove + slot - 1;
      lines.push(`<div class="action-row">Move armies up to <strong>${moveRange}</strong>. Combat: roll d6 + ${slot + spend}.</div>`);
    }
    if (card.type === "economy" || card.type === "military") {
      lines.push(`<div class="action-row"><button class="btn tiny" id="action-explore">Explore Map Edge</button></div>`);
    }

    lines.push(`
      <div class="action-row btn-row">
        <button class="btn" id="action-start">Start Action</button>
        <button class="btn primary" id="action-complete">Complete Card</button>
        <button class="btn ghost" id="action-cancel">Cancel</button>
      </div>
    `);

    dom.actionPanel.innerHTML = `<div class="action-card">${lines.join("")}</div>`;

    document.getElementById("trade-dec").addEventListener("click", () => adjustTrade(-1));
    document.getElementById("trade-inc").addEventListener("click", () => adjustTrade(1));
    document.getElementById("action-start").addEventListener("click", () => startActionPhase());
    document.getElementById("action-complete").addEventListener("click", () => finishCardAction());
    document.getElementById("action-cancel").addEventListener("click", cancelCardAction);
    const exploreBtn = document.getElementById("action-explore");
    if (exploreBtn) {
      exploreBtn.addEventListener("click", startExplore);
    }
  }

  function renderLog() {
    if (!state) return;
    dom.log.innerHTML = "";
    state.log.slice(-15).forEach((entry) => {
      const row = document.createElement("div");
      row.className = "log-entry";
      row.textContent = entry;
      dom.log.appendChild(row);
    });
  }

  function renderHostTools() {
    if (!state) return;
    dom.toolOwner.innerHTML = "";
    const neutral = document.createElement("option");
    neutral.value = "neutral";
    neutral.textContent = "Neutral";
    dom.toolOwner.appendChild(neutral);
    state.players.forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.name;
      dom.toolOwner.appendChild(option);
    });
    refreshToolDetail();
    if (!state.setup) {
      dom.setupPhase.textContent = "-";
      dom.setupTurn.textContent = "-";
      dom.setupTile.innerHTML = "";
      dom.setupTile.disabled = true;
      return;
    }
    dom.setupPhase.textContent = state.setup.phase.toUpperCase();
    const activeId = state.setup.order[state.setup.turnIndex];
    const activePlayer = getPlayer(activeId);
    dom.setupTurn.textContent = activePlayer ? activePlayer.name : "-";
    dom.setupTile.innerHTML = "";
    if (state.setup.phase === "tile") {
      const tiles = state.setup.playerTiles[activeId] || [];
      tiles.forEach((tileId) => {
        const tile = state.setup.tiles[tileId];
        const option = document.createElement("option");
        option.value = tileId;
        option.textContent = `${tileId} (${tile.type})`;
        dom.setupTile.appendChild(option);
      });
      dom.setupTile.disabled = false;
      if (!ui.setup.tileId || !tiles.includes(ui.setup.tileId)) {
        ui.setup.tileId = tiles[0] || null;
      }
      dom.setupTile.value = ui.setup.tileId || "";
    } else {
      dom.setupTile.disabled = true;
    }
  }

  function refreshToolDetail() {
    dom.toolDetail.innerHTML = "";
    const mode = dom.toolMode.value;
    let options = [];
    if (mode === "terrain") options = TERRAIN_LIST;
    if (mode === "district") options = DISTRICT_TYPES;
    if (mode === "resource") options = RESOURCE_TYPES;
    if (mode === "citystate") options = CITY_STATE_NAMES;
    if (!options.length) options = ["-"];
    options.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      dom.toolDetail.appendChild(option);
    });
  }

  function syncSetupUi() {
    if (!state || !state.setup || state.setup.phase === "done" || !isHost) {
      if (ui.mode === "setup-fortress" || ui.mode === "setup-tile") {
        ui.mode = "inspect";
        ui.selectable.clear();
      }
      return;
    }
    if (state.setup.phase === "fortress") {
      ui.mode = "setup-fortress";
      ui.selectable = new Set(validFortressPlacements());
      return;
    }
    if (state.setup.phase === "tile") {
      ui.mode = "setup-tile";
      const activeId = state.setup.order[state.setup.turnIndex];
      const tiles = state.setup.playerTiles[activeId] || [];
      if (!tiles.length) {
        ui.setup.tileId = null;
        ui.selectable.clear();
        return;
      }
      if (!ui.setup.tileId || !tiles.includes(ui.setup.tileId)) {
        ui.setup.tileId = tiles[0] || null;
      }
      ui.selectable = new Set(validTileAnchors(ui.setup.tileId));
    }
  }

  function startCardAction(player, cardType, index) {
    const slot = FOCUS_SLOTS[index];
    const bonus = player.govBonus[cardType] || 0;
    ui.activeCard = {
      type: cardType,
      slotIndex: index,
      slot,
      effectiveSlot: Math.min(5, slot + bonus),
      tradeSpent: 0
    };
    ui.mode = "inspect";
    ui.selectable.clear();
    ui.tradeLocked = false;
    renderActions();
    renderMap();
  }

  function adjustTrade(delta) {
    if (!ui.activeCard || ui.tradeLocked) return;
    const player = getPlayer(localPlayerId);
    if (!player) return;
    const cardType = ui.activeCard.type;
    const maxSpend = player.trade[cardType];
    const current = ui.activeCard.tradeSpent || 0;
    const next = Math.max(0, Math.min(maxSpend, current + delta));
    ui.activeCard.tradeSpent = next;
    renderActions();
  }

  function startActionPhase() {
    if (!ui.activeCard) return;
    const card = ui.activeCard;
    const player = getPlayer(localPlayerId);
    if (!player) return;
    ui.tradeLocked = true;

    if (card.type === "culture") {
      ui.mode = "place-control";
      ui.remaining = 2 + card.tradeSpent;
      ui.selectable = new Set(validControlPlacements(player.id, card.effectiveSlot));
      logEntry(`${player.name} is placing control markers.`);
    } else if (card.type === "growth") {
      ui.mode = "growth-choice";
      ui.remaining = card.effectiveSlot;
      dom.actionPanel.innerHTML = `
        <div class="action-card">
          <div class="action-title">Growth Options</div>
          <div class="action-row"><button class="btn" id="growth-district">Place District</button></div>
          <div class="action-row"><button class="btn" id="growth-reinforce">Reinforce Markers</button></div>
          <div class="action-row"><button class="btn ghost" id="growth-back">Back</button></div>
        </div>
      `;
      document.getElementById("growth-district").addEventListener("click", () => {
        ui.mode = "pick-district";
        dom.actionPanel.innerHTML = `
          <div class="action-card">
            <div class="action-title">Choose District Type</div>
            ${DISTRICT_TYPES.map((d) => `<div class="action-row"><button class="btn district-pick" data-type="${d}">${d}</button></div>`).join("")}
            <div class="action-row"><button class="btn ghost" id="district-back">Back</button></div>
          </div>
        `;
        document.querySelectorAll(".district-pick").forEach((btn) => {
          btn.addEventListener("click", () => {
            ui.districtType = btn.dataset.type;
            ui.mode = "place-district";
            ui.remaining = 1;
            ui.selectable = new Set(validControlPlacements(player.id, card.effectiveSlot, true));
            renderActions();
            renderMap();
          });
        });
        document.getElementById("district-back").addEventListener("click", () => {
          startActionPhase();
        });
      });
      document.getElementById("growth-reinforce").addEventListener("click", () => {
        ui.mode = "reinforce";
        ui.selectable = new Set(validReinforceTargets(player.id));
        renderActions();
        renderMap();
      });
      document.getElementById("growth-back").addEventListener("click", () => {
        ui.mode = "inspect";
        ui.selectable.clear();
        renderActions();
        renderMap();
      });
      return;
    } else if (card.type === "science") {
      const amount = card.effectiveSlot + card.tradeSpent;
      dispatch({ type: "ADVANCE_TECH", payload: { playerId: player.id, amount } });
      finishCardAction();
      return;
    } else if (card.type === "economy") {
      ui.mode = "move-wagon";
      ui.remaining = DEFAULTS.baseWagonMove + card.tradeSpent;
      ui.selectedUnit = null;
      ui.selectable.clear();
      logEntry(`${player.name} is moving wagons.`);
    } else if (card.type === "industry") {
      ui.mode = "industry-choice";
      ui.spentResources = ui.spentResources || {};
      const showIndustry = () => {
        const baseProd = card.effectiveSlot + card.tradeSpent;
        const resEntries = Object.entries(player.resources).filter(([, v]) => v > 0);
        let spentBonus = 0;
        Object.values(ui.spentResources).forEach((v) => { if (v) spentBonus += DEFAULTS.resourceProductionValue; });
        const totalProd = baseProd + spentBonus;

        const resToggleHtml = resEntries.length > 0
          ? resEntries.map(([k, v]) => {
            const checked = ui.spentResources[k] ? "primary" : "";
            return `<button class="btn tiny res-toggle ${checked}" data-res="${k}">${k} (${v}) +${DEFAULTS.resourceProductionValue}</button>`;
          }).join(" ")
          : "<span class='dim'>No resources available</span>";

        dom.actionPanel.innerHTML = `
          <div class="action-card">
            <div class="action-title">Industry (Production: ${totalProd})</div>
            <div class="action-row dim">Base ${baseProd} + ${spentBonus} from spent resources</div>
            <div class="action-row resource-row">${resToggleHtml}</div>
            <div class="action-row"><button class="btn" id="industry-city">Build City (cost = terrain difficulty)</button></div>
            <div class="action-row"><button class="btn" id="industry-wonder">Build Wonder (cost = 6)</button></div>
            <div class="action-row"><button class="btn ghost" id="industry-back">Back</button></div>
          </div>
        `;
        document.querySelectorAll(".res-toggle").forEach((btn) => {
          btn.addEventListener("click", () => {
            const res = btn.dataset.res;
            ui.spentResources[res] = !ui.spentResources[res];
            showIndustry();
          });
        });
        document.getElementById("industry-city").addEventListener("click", () => {
          spendSelectedResources(player);
          ui.mode = "build-city";
          ui.selectable = new Set(validCityPlacements(player.id, totalProd));
          renderActions();
          renderMap();
        });
        document.getElementById("industry-wonder").addEventListener("click", () => {
          if (totalProd < 6) {
            logEntry("Not enough production to build a wonder (need 6).");
            return;
          }
          spendSelectedResources(player);
          ui.mode = "build-wonder";
          ui.selectable = new Set(validWonderPlacements(player.id));
          renderActions();
          renderMap();
        });
        document.getElementById("industry-back").addEventListener("click", () => {
          ui.spentResources = {};
          ui.mode = "inspect";
          ui.selectable.clear();
          renderActions();
          renderMap();
        });
      };
      showIndustry();
      return;
    } else if (card.type === "military") {
      ui.mode = "move-army";
      ui.remaining = DEFAULTS.baseArmyMove + card.effectiveSlot - 1;
      ui.selectedUnit = null;
      ui.selectable.clear();
      logEntry(`${player.name} is moving armies.`);
    }

    renderActions();
    renderMap();
  }

  function finishCardAction() {
    if (!ui.activeCard) return;
    const player = getPlayer(localPlayerId);
    if (!player) return;
    dispatch({
      type: "RESOLVE_CARD",
      payload: {
        playerId: player.id,
        cardType: ui.activeCard.type,
        tradeSpent: ui.activeCard.tradeSpent
      }
    });
    ui.activeCard = null;
    ui.mode = "inspect";
    ui.selectable.clear();
    ui.selectedUnit = null;
    ui.tradeLocked = false;
    renderActions();
    renderMap();
  }

  function cancelCardAction() {
    ui.activeCard = null;
    ui.mode = "inspect";
    ui.selectable.clear();
    ui.selectedUnit = null;
    ui.tradeLocked = false;
    renderActions();
    renderMap();
  }

  function startExplore() {
    const player = getPlayer(localPlayerId);
    if (!player) return;
    ui.mode = "explore";
    ui.selectable = new Set(validExploreTargets(player.id));
    renderMap();
  }
  function handleHexClick(key) {
    if (!state) return;
    if (state.setup && state.setup.phase !== "done" && isHost) {
      if (!ui.selectable.has(key)) return;
      const activeId = state.setup.order[state.setup.turnIndex];
      if (ui.mode === "setup-fortress") {
        dispatch({ type: "PLACE_FORTRESS", payload: { playerId: activeId, key } });
        return;
      }
      if (ui.mode === "setup-tile" && ui.setup.tileId) {
        dispatch({
          type: "PLACE_TILE",
          payload: {
            playerId: activeId,
            tileId: ui.setup.tileId,
            anchorKey: key,
            rotation: ui.setup.rotation,
            side: ui.setup.side
          }
        });
        return;
      }
    }
    if (isHost && dom.toolMode.value !== "inspect") {
      applyToolToHex(key);
      return;
    }
    const player = getPlayer(localPlayerId);
    if (!player || !ui.activeCard) {
      showHexInfo(key);
      return;
    }

    if (ui.mode === "place-control") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "PLACE_CONTROL", payload: { playerId: player.id, key } });
      ui.remaining -= 1;
      if (ui.remaining <= 0) {
        finishCardAction();
      }
      ui.selectable = new Set(validControlPlacements(player.id, ui.activeCard.effectiveSlot));
      renderMap();
      return;
    }

    if (ui.mode === "place-district") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "PLACE_DISTRICT", payload: { playerId: player.id, key, district: ui.districtType || "campus" } });
      finishCardAction();
      return;
    }

    if (ui.mode === "reinforce") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "TOGGLE_FORTIFY", payload: { playerId: player.id, key } });
      ui.remaining -= 1;
      if (ui.remaining <= 0) {
        finishCardAction();
      }
      renderMap();
      return;
    }

    if (ui.mode === "build-city") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "BUILD_CITY", payload: { playerId: player.id, key } });
      finishCardAction();
      return;
    }

    if (ui.mode === "build-wonder") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "BUILD_WONDER", payload: { playerId: player.id, key } });
      finishCardAction();
      return;
    }

    if (ui.mode === "move-wagon") {
      handleMoveUnit("wagon", player, key);
      return;
    }

    if (ui.mode === "move-army") {
      handleMoveUnit("army", player, key);
      return;
    }
    if (ui.mode === "explore") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "EDIT_HEX", payload: { key, changes: { revealed: true, active: true } } });
      ui.mode = "inspect";
      ui.selectable.clear();
      renderMap();
      return;
    }
  }

  function spendSelectedResources(player) {
    if (!ui.spentResources) return;
    Object.entries(ui.spentResources).forEach(([resType, spent]) => {
      if (spent) {
        dispatch({ type: "SPEND_RESOURCE", payload: { playerId: player.id, resourceType: resType } });
      }
    });
    ui.spentResources = {};
  }

  function showGovPicker(player) {
    let selected = player.govMarkers.slice();
    const render = () => {
      const buttons = FOCUS_ORDER.map((f) => {
        const isActive = selected.includes(f);
        return `<button class="btn tiny gov-btn ${isActive ? "primary" : ""}" data-focus="${f}">${FOCUS_META[f].label}${isActive ? " ✓" : ""}</button>`;
      }).join(" ");
      dom.actionPanel.innerHTML = `
        <div class="action-card">
          <div class="action-title">Assign Government Markers (max ${MAX_GOV_MARKERS})</div>
          <div class="action-row dim">Each marker adds +1 to that focus card's slot value.</div>
          <div class="action-row gov-picker">${buttons}</div>
          <div class="action-row">
            <button class="btn primary" id="gov-confirm">Confirm</button>
            <button class="btn ghost" id="gov-cancel">Cancel</button>
          </div>
        </div>
      `;
      document.querySelectorAll(".gov-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const f = btn.dataset.focus;
          if (selected.includes(f)) {
            selected = selected.filter((s) => s !== f);
          } else if (selected.length < MAX_GOV_MARKERS) {
            selected.push(f);
          }
          render();
        });
      });
      document.getElementById("gov-confirm").addEventListener("click", () => {
        dispatch({ type: "ASSIGN_GOV", payload: { playerId: player.id, markers: selected } });
        renderActions();
      });
      document.getElementById("gov-cancel").addEventListener("click", () => {
        renderActions();
      });
    };
    render();
  }

  function showHexInfo(key) {
    const hex = state.map.hexes[key];
    if (!hex) return;
    const lines = [];
    lines.push(`<div class="action-title">Hex Info (${key})</div>`);
    lines.push(`<div class="action-row"><span class="label">Terrain</span><span>${hex.terrain} (difficulty ${terrainDifficulty(hex.terrain)})</span></div>`);
    if (!hex.active) {
      lines.push(`<div class="action-row dim">Inactive / unexplored</div>`);
    } else if (!hex.revealed) {
      lines.push(`<div class="action-row dim">Hidden (fog of war)</div>`);
    }
    if (hex.city) {
      const owner = getPlayer(hex.city.ownerId);
      lines.push(`<div class="action-row"><span class="label">${hex.city.isCapital ? "Capital" : "City"}</span><span>${owner?.name || "?"} ${hex.city.developed ? "(Developed)" : ""} ${hex.city.hasWonder ? "(Wonder)" : ""}</span></div>`);
    }
    if (hex.control) {
      const owner = getPlayer(hex.control.ownerId);
      let ctrlLabel = "Control Marker";
      if (hex.control.district) ctrlLabel = `District: ${hex.control.district}`;
      if (hex.control.fortified) ctrlLabel += " (Fortified)";
      lines.push(`<div class="action-row"><span class="label">${ctrlLabel}</span><span>${owner?.name || "?"}</span></div>`);
    }
    if (hex.cityState) {
      lines.push(`<div class="action-row"><span class="label">City-State</span><span>${hex.cityState.name} (${hex.cityState.type})</span></div>`);
    }
    if (hex.barbarian) {
      lines.push(`<div class="action-row"><span class="label">Barbarian</span><span>Power: ${DEFAULTS.barbarianBasePower + terrainDifficulty(hex.terrain)}</span></div>`);
    }
    if (hex.resource) {
      lines.push(`<div class="action-row"><span class="label">Resource</span><span>${hex.resource}</span></div>`);
    }
    if (hex.fortress) {
      const owner = hex.fortressOwnerId ? getPlayer(hex.fortressOwnerId) : null;
      lines.push(`<div class="action-row"><span class="label">Fortress</span><span>${owner?.name || "Neutral"}</span></div>`);
    }
    if (hex.tradeMarker) {
      lines.push(`<div class="action-row"><span class="label">Trade Marker</span><span>Present</span></div>`);
    }
    const units = getUnitsAt(key);
    if (units.length) {
      units.forEach((u) => {
        const owner = getPlayer(u.playerId);
        lines.push(`<div class="action-row"><span class="label">${u.type}</span><span>${owner?.name || "?"}</span></div>`);
      });
    }
    dom.actionPanel.innerHTML = `<div class="action-card hex-info">${lines.join("")}</div>`;
  }

  function handleMoveUnit(type, player, key) {
    const units = type === "army" ? player.armies : player.wagons;
    if (!ui.selectedUnit) {
      ui.selectedUnit = units[0];
    }

    const unit = ui.selectedUnit;
    const startKey = unit.position || findDefaultStart(player.id);
    if (!startKey) return;

    const reachable = getReachable(startKey, ui.remaining, (hex) => canEnterHex(type, hex, player.id, ui.activeCard.effectiveSlot));
    ui.selectable = reachable;
    if (!reachable.has(key)) {
      renderMap();
      return;
    }

    if (type === "army") {
      const defender = findDefender(key, player.id);
      if (defender) {
        const attackPower = ui.activeCard.effectiveSlot + (ui.activeCard.tradeSpent || 0);
        const defensePower = defenderDefensePower(defender, key);
        dispatch({
          type: "ATTACK",
          payload: {
            attackerId: player.id,
            attackerUnitId: unit.id,
            key,
            attackPower,
            defensePower,
            defender
          }
        });
      } else {
        dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: key } });
      }
    } else {
      dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: key } });
      const hex = state.map.hexes[key];
      if (hex.cityState) {
        dispatch({ type: "ADD_TRADE", payload: { playerId: player.id, cardType: hex.cityState.type, amount: 2 } });
        dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: null } });
      } else if (hex.city && hex.city.ownerId !== player.id) {
        dispatch({ type: "ADD_TRADE", payload: { playerId: player.id, cardType: "economy", amount: 2 } });
        dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: null } });
      }
    }

    ui.selectable.clear();
    ui.selectedUnit = null;
    renderMap();
  }

  function findDefender(key, attackerId) {
    const hex = state.map.hexes[key];
    if (!hex) return null;
    if (hex.barbarian) return { type: "barbarian" };
    if (hex.cityState) return { type: "citystate" };
    if (hex.city && hex.city.ownerId !== attackerId) return { type: "city" };
    if (hex.control && hex.control.ownerId !== attackerId) return { type: "control" };
    const units = getUnitsAt(key).filter((u) => u.playerId !== attackerId);
    if (units.length) return { type: units[0].type, ownerId: units[0].playerId, unitId: units[0].unitId };
    return null;
  }

  function defenderDefensePower(defender, key) {
    const hex = state.map.hexes[key];
    if (!hex) return 0;
    if (defender.type === "barbarian") return terrainDifficulty(hex.terrain);
    if (defender.type === "citystate") return 8;
    if (defender.type === "control") return terrainDifficulty(hex.terrain) + fortifiedBonus(key);
    if (defender.type === "city") return terrainDifficulty(hex.terrain) * 2 + fortifiedBonus(key);
    return terrainDifficulty(hex.terrain);
  }

  function fortifiedBonus(key) {
    let bonus = 0;
    neighborsFromKey(key).forEach((neighborKey) => {
      const neighbor = state.map.hexes[neighborKey];
      if (neighbor?.control?.fortified) bonus += 1;
    });
    return bonus;
  }

  function validControlPlacements(playerId, maxTerrain, allowReplace) {
    return Object.values(state.map.hexes)
      .filter((hex) => {
        if (!hex.active) return false;
        if (!hex.revealed) return false;
        if (hex.terrain === "water") return false;
        if (terrainDifficulty(hex.terrain) > maxTerrain) return false;
        if (hex.city || hex.cityState || hex.barbarian) return false;
        if (hex.control && !allowReplace) return false;
        return isWithinRangeOfFriendlyCity(hex, playerId, maxTerrain);
      })
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function isWithinRangeOfFriendlyCity(hex, playerId, range) {
    return Object.values(state.map.hexes).some((candidate) => {
      if (!candidate.city || candidate.city.ownerId !== playerId) return false;
      return hexDistance(candidate, hex) <= range;
    });
  }

  function validReinforceTargets(playerId) {
    return Object.values(state.map.hexes)
      .filter((hex) => hex.control && hex.control.ownerId === playerId)
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validCityPlacements(playerId, maxTerrain) {
    return Object.values(state.map.hexes)
      .filter((hex) => {
        if (!hex.active) return false;
        if (!hex.revealed) return false;
        if (hex.terrain === "water") return false;
        if (terrainDifficulty(hex.terrain) > maxTerrain) return false;
        if (hex.city || hex.cityState || hex.barbarian || hex.fortress) return false;
        if (adjacentToCity(hex)) return false;
        return isWithinRangeOfFriendly(hex, playerId, 2);
      })
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validWonderPlacements(playerId) {
    return Object.values(state.map.hexes)
      .filter((hex) => hex.city && hex.city.ownerId === playerId && !hex.city.hasWonder)
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validFortressPlacements() {
    return Object.values(state.map.hexes)
      .filter((hex) => !hex.active)
      .filter((hex) => activeNeighborCount(hex.q, hex.r) >= 2)
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validTileAnchors(tileId) {
    return validTileAnchorsForRotation(tileId, ui.setup.rotation);
  }

  function validExploreTargets(playerId) {
    return Object.values(state.map.hexes)
      .filter((hex) => !hex.revealed)
      .filter((hex) => {
        const key = keyFrom(hex.q, hex.r);
        return neighbors(hex.q, hex.r).some((neighborKey) => {
          const neighbor = state.map.hexes[neighborKey];
          if (!neighbor || !neighbor.revealed || !neighbor.active) return false;
          if (neighbor.city && neighbor.city.ownerId === playerId) return true;
          if (neighbor.control && neighbor.control.ownerId === playerId) return true;
          const units = getUnitsAt(neighborKey).some((unit) => unit.playerId === playerId);
          return units;
        });
      })
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function isAdjacentToFriendlyCity(hex, playerId) {
    return neighbors(hex.q, hex.r).some((key) => {
      const neighbor = state.map.hexes[key];
      return neighbor?.city && neighbor.city.ownerId === playerId;
    });
  }

  function isWithinRangeOfFriendly(hex, playerId, range) {
    return Object.values(state.map.hexes).some((candidate) => {
      if (!candidate.revealed) return false;
      if (candidate.city?.ownerId !== playerId && candidate.control?.ownerId !== playerId) return false;
      return hexDistance(candidate, hex) <= range;
    });
  }

  function adjacentToCity(hex) {
    return neighbors(hex.q, hex.r).some((key) => state.map.hexes[key]?.city);
  }

  function findDefaultStart(playerId) {
    const capitalHex = Object.values(state.map.hexes).find((hex) => hex.city?.ownerId === playerId && hex.city.isCapital);
    return capitalHex ? keyFrom(capitalHex.q, capitalHex.r) : null;
  }

  function getReachable(startKey, maxSteps, canEnter) {
    const visited = new Set([startKey]);
    const reachable = new Set();
    const queue = [{ key: startKey, steps: 0 }];
    while (queue.length) {
      const current = queue.shift();
      if (current.steps >= maxSteps) continue;
      neighborsFromKey(current.key).forEach((nextKey) => {
        const hex = state.map.hexes[nextKey];
        if (!hex || !hex.revealed || !hex.active) return;
        if (!canEnter(hex)) return;
        if (visited.has(nextKey)) return;
        visited.add(nextKey);
        reachable.add(nextKey);
        queue.push({ key: nextKey, steps: current.steps + 1 });
      });
    }
    reachable.delete(startKey);
    return reachable;
  }

  function canEnterHex(type, hex, playerId, maxTerrain) {
    if (!hex.active) return false;
    if (terrainDifficulty(hex.terrain) > maxTerrain) return false;
    if (type === "wagon") {
      if (hex.barbarian) return false;
      if (hex.terrain === "water") return false;
    }
    return true;
  }

  function getUnitsAt(key) {
    const units = [];
    state.players.forEach((player) => {
      player.armies.forEach((unit) => {
        if (unit.position === key) {
          units.push({ type: "army", playerId: player.id, unitId: unit.id });
        }
      });
      player.wagons.forEach((unit) => {
        if (unit.position === key) {
          units.push({ type: "wagon", playerId: player.id, unitId: unit.id });
        }
      });
    });
    return units;
  }

  function countCities(playerId) {
    let total = 0;
    let developed = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId) {
        total += 1;
        if (isCityDeveloped(hex)) developed += 1;
      }
    });
    return { total, developed };
  }

  function isCityDeveloped(hex) {
    return neighbors(hex.q, hex.r).every((key) => {
      const neighbor = state.map.hexes[key];
      if (!neighbor) return true;
      if (neighbor.terrain === "water") return true;
      if (neighbor.control && neighbor.control.ownerId === hex.city.ownerId) return true;
      return false;
    });
  }

  function totalTrade(player) {
    return Object.values(player.trade).reduce((sum, value) => sum + value, 0);
  }
  function applyToolToHex(key) {
    if (!state) return;
    const mode = dom.toolMode.value;
    const owner = dom.toolOwner.value;
    const detail = dom.toolDetail.value;
    const hex = state.map.hexes[key];
    if (!hex) return;

    const changes = {};
    if (mode !== "clear") {
      changes.active = true;
      changes.revealed = true;
    }
    if (mode === "terrain") {
      changes.terrain = detail;
      changes.revealed = true;
    }
    if (mode === "control") {
      if (hex.control) {
        changes.control = null;
      } else {
        changes.control = { ownerId: owner, fortified: false, district: null };
      }
    }
    if (mode === "fortify") {
      if (hex.control && hex.control.ownerId === owner) {
        changes.control = { ...hex.control, fortified: !hex.control.fortified };
      }
    }
    if (mode === "district") {
      if (hex.control && hex.control.district) {
        changes.control = { ownerId: owner, fortified: false, district: null };
      } else {
        changes.control = { ownerId: owner, fortified: false, district: detail };
      }
    }
    if (mode === "city") {
      if (hex.city) {
        changes.city = null;
      } else {
        changes.city = { ownerId: owner, isCapital: false, developed: false, hasWonder: false };
      }
    }
    if (mode === "capital") {
      if (hex.city && hex.city.isCapital) {
        changes.city = null;
      } else {
        changes.city = { ownerId: owner, isCapital: true, developed: false, hasWonder: false };
      }
    }
    if (mode === "army") {
      toggleUnit(owner, "army", key);
      return;
    }
    if (mode === "wagon") {
      toggleUnit(owner, "wagon", key);
      return;
    }
    if (mode === "barbarian") {
      changes.barbarian = !hex.barbarian;
    }
    if (mode === "citystate") {
      changes.cityState = hex.cityState ? null : { name: detail, type: FOCUS_ORDER[0] };
    }
    if (mode === "resource") {
      changes.resource = hex.resource ? null : detail;
    }
    if (mode === "fortress") {
      changes.fortress = !hex.fortress;
    }
    if (mode === "clear") {
      changes.resource = null;
      changes.cityState = null;
      changes.barbarian = false;
      changes.fortress = false;
      changes.control = null;
      changes.city = null;
    }
    dispatch({ type: "EDIT_HEX", payload: { key, changes } });
  }

  function toggleUnit(ownerId, type, key) {
    const player = getPlayer(ownerId);
    if (!player) return;
    const units = type === "army" ? player.armies : player.wagons;
    const existing = units.find((unit) => unit.position === key);
    if (existing) {
      existing.position = null;
    } else {
      const free = units.find((unit) => unit.position === null);
      if (free) free.position = key;
    }
    commitState();
  }

  function tokenSpan(type, label, color) {
    const style = color ? ` style="--player-color:${color}"` : "";
    return `<span class="token ${type}"${style}>${label}</span>`;
  }

  function keyFrom(q, r) {
    return `${q},${r}`;
  }

  function neighbors(q, r) {
    return [
      keyFrom(q + 1, r),
      keyFrom(q - 1, r),
      keyFrom(q, r + 1),
      keyFrom(q, r - 1),
      keyFrom(q + 1, r - 1),
      keyFrom(q - 1, r + 1)
    ];
  }

  function neighborsFromKey(key) {
    const [q, r] = key.split(",").map(Number);
    return neighbors(q, r);
  }

  function hexDistance(a, b) {
    const dq = Math.abs(a.q - b.q);
    const dr = Math.abs(a.r - b.r);
    const ds = Math.abs(a.q + a.r - (b.q + b.r));
    return (dq + dr + ds) / 2;
  }

  function terrainDifficulty(type) {
    return TERRAIN[type]?.difficulty || 1;
  }

  function isWater(hex) {
    return hex.terrain === "water";
  }

  function randomTerrain() {
    const roll = Math.random() * 100;
    if (roll < 30) return "grass";
    if (roll < 50) return "hill";
    if (roll < 70) return "forest";
    if (roll < 85) return "desert";
    if (roll < 95) return "mountain";
    return "water";
  }

  function pickRandom(list, count) {
    const copy = list.slice();
    const picks = [];
    while (copy.length && picks.length < count) {
      const index = Math.floor(Math.random() * copy.length);
      picks.push(copy.splice(index, 1)[0]);
    }
    return picks;
  }

  function rollDie() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function logEntry(text) {
    if (!state) return;
    state.log.push(text);
  }
})();
