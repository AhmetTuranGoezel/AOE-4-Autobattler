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
  // CITY_STATE_NAMES derived from CITY_STATE_DATA below

  const FOCUS_SLOTS = [1, 1, 2, 3, 4, 5];
  const FOCUS_ORDER = ["growth", "culture", "science", "economy", "military", "industry"];
  const FOCUS_META = {
    growth: { label: "Growth", tradeBonus: "place 1 extra district or reinforce 1 extra", wonderType: "culture" },
    culture: { label: "Culture", tradeBonus: "+1 control marker per trade", wonderType: "culture" },
    science: { label: "Science", tradeBonus: "+1 tech advancement per trade", wonderType: "science" },
    economy: { label: "Economy", tradeBonus: "+1 wagon movement per trade", wonderType: "commerce" },
    military: { label: "Military", tradeBonus: "+1 combat strength per trade", wonderType: "military" },
    industry: { label: "Industry", tradeBonus: "+1 production per trade", wonderType: "commerce" }
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

  const CARD_TIERS = {
    culture: {
      1: { name: "Early Empire", n: 2, effects: [] },
      2: { name: "Drama and Poetry", n: 2, effects: ["move1"] },
      3: { name: "Civil Service", n: 2, effects: ["extraControl"] },
      4: { name: "Mass Media", n: 3, effects: ["replaceRival"] }
    },
    growth: {
      1: { name: "Irrigation", effects: [] },
      2: { name: "Engineering", effects: ["controlNearDistrict"] },
      3: { name: "Sanitation", effects: ["extraReinforce"] },
      4: { name: "Globalization", effects: ["globalDistrict", "extraReinforce"] }
    },
    industry: {
      1: { name: "Pottery", cityRange: 2, wonderProdOverride: null, effects: [] },
      2: { name: "Animal Husbandry", cityRange: 3, wonderProdOverride: null, effects: ["buildOnUnit"] },
      3: { name: "Nationalism", cityRange: 4, wonderProdOverride: 7, effects: ["throughWater"] },
      4: { name: "Urbanization", cityRange: 5, wonderProdOverride: null, effects: ["throughWater", "controlAfterCity"] }
    },
    science: {
      1: { name: "Astrology", effects: [] },
      2: { name: "Mathematics", effects: ["bonusTrade"] },
      3: { name: "Replaceable Parts", effects: ["bonusResource"] },
      4: { name: "Nuclear Power", effects: ["nuke"] }
    },
    military: {
      1: { name: "Masonry", move: 3, armies: 1, combatBonus: 0, effects: [] },
      2: { name: "Iron Working", move: 4, armies: 2, combatBonus: 0, combatVsBarb: 2, effects: [] },
      3: { name: "Mass Production", move: 5, armies: 2, combatBonus: 2, effects: ["throughWater", "respawn"] },
      4: { name: "Flight", move: 6, armies: 2, combatBonus: 3, effects: ["throughWater", "throughTokens"] }
    },
    economy: {
      1: { name: "Foreign Trade", move: 3, caravans: 1, effects: [] },
      2: { name: "Currency", move: 4, caravans: 2, effects: ["removeBarb"] },
      3: { name: "Steam Power", move: 6, caravans: 2, effects: ["throughWater", "exchangeResource"] },
      4: { name: "Capitalism", move: 6, caravans: 3, effects: ["throughWater", "resolveExtra"] }
    }
  };

  const WONDERS = [
    { name: "Jebel Barkal", era: "ancient", type: "military", cost: 7, description: "When attacking or defending, spend resource tokens for +2 combat each." },
    { name: "Petra", era: "ancient", type: "military", cost: 7, description: "+2 defense. Barbarians cannot enter your cities or reinforced control tokens." },
    { name: "Terracotta Army", era: "ancient", type: "military", cost: 7, description: "+2 attack combat value." },
    { name: "Stonehenge", era: "ancient", type: "culture", cost: 7, description: "After placing control on hill, chain-place on adjacent hills." },
    { name: "Hanging Gardens", era: "ancient", type: "culture", cost: 8, description: "Start of turn: place 1 control on terrain ≤4 adjacent to city." },
    { name: "Colosseum", era: "ancient", type: "culture", cost: 9, description: "Start of turn: reinforce 1 control adjacent to city." },
    { name: "Colossus", era: "ancient", type: "commerce", cost: 7, description: "Caravans move 6 additional spaces on economy card." },
    { name: "Great Lighthouse", era: "ancient", type: "commerce", cost: 8, description: "Build cities on edge of map as if within 2 of friendly space." },
    { name: "Apadana", era: "ancient", type: "commerce", cost: 8, description: "On build/capture: explore from edge space, then place 1 control on new tile." },
    { name: "Oracle", era: "ancient", type: "science", cost: 8, description: "Start of turn: swap 2 adjacent cards in focus row." },
    { name: "Great Library", era: "ancient", type: "science", cost: 8, description: "Caravan to player city: gain matching focus card at same tier, replace yours." },
    { name: "Pyramids", era: "ancient", type: "science", cost: 9, description: "On build: upgrade up to 3 tier-I cards to tier-II." },
    { name: "Huey Teocalli", era: "medieval", type: "military", cost: 9, description: "+1 defense per adjacent water space." },
    { name: "Venetian Arsenal", era: "medieval", type: "military", cost: 10, description: "After resolving slot #5 card, resolve again as slot #1." },
    { name: "Alhambra", era: "medieval", type: "military", cost: 10, description: "+2 combat value (attack and defense)." },
    { name: "Taj Mahal", era: "medieval", type: "culture", cost: 9, description: "Resolve focus card as 1 slot further right per matching wonder you own." },
    { name: "Forbidden City", era: "medieval", type: "culture", cost: 9, description: "Start of turn: remove 1 rival control adjacent to friendly space." },
    { name: "Chichen Itza", era: "medieval", type: "culture", cost: 10, description: "Place control on forest spaces not adjacent to friendly city." },
    { name: "Kilwa Kisiwani", era: "medieval", type: "commerce", cost: 9, description: "Caravan to city-state: +1 additional trade on any focus card." },
    { name: "Great Zimbabwe", era: "medieval", type: "commerce", cost: 9, description: "Store up to 4 trade tokens on this wonder. Distribute at start of turn." },
    { name: "Machu Picchu", era: "medieval", type: "commerce", cost: 10, description: "Slot #1 or #2 resolves as 2 slots further right." },
    { name: "University of Sankore", era: "medieval", type: "science", cost: 9, description: "After tech upgrade: swap any 2 non-science cards." },
    { name: "Porcelain Tower", era: "medieval", type: "science", cost: 9, description: "On build: upgrade up to 2 cards to next tier." },
    { name: "Potala Palace", era: "medieval", type: "science", cost: 10, description: "Have 4 diplomacy from each player. On build: take 3 diplomacy cards." },
    { name: "Ruhr Valley", era: "modern", type: "military", cost: 11, description: "+5 defense combat value." },
    { name: "Pentagon", era: "modern", type: "military", cost: 12, description: "+2 attack. Armies can move any number of spaces." },
    { name: "Statue of Liberty", era: "modern", type: "military", cost: 12, description: "Before capturing rival city, replace adjacent rival control with yours." },
    { name: "Sydney Opera House", era: "modern", type: "culture", cost: 10, description: "Rival control tokens count toward your cities' maturity." },
    { name: "Cristo Redentor", era: "modern", type: "culture", cost: 11, description: "On build: steal rival non-capital city (no army) within 3 spaces." },
    { name: "Eiffel Tower", era: "modern", type: "culture", cost: 12, description: "Start of turn: choose 2 rival control of same player, replace 1 with yours." },
    { name: "Big Ben", era: "modern", type: "commerce", cost: 10, description: "+2 combat per your caravan adjacent to defending space." },
    { name: "Estádio Do Maracanã", era: "modern", type: "commerce", cost: 10, description: "Resolve economy card before resolving a non-economy focus card." },
    { name: "Országház", era: "modern", type: "commerce", cost: 11, description: "After caravan trades at city-state, you may conquer it." },
    { name: "Oxford University", era: "modern", type: "science", cost: 10, description: "Tech upgrade: don't need same type replacement." },
    { name: "Amundsen-Scott RS", era: "modern", type: "science", cost: 10, description: "On build: build city on edge, place wonder there, +2 adjacent control." },
    { name: "Kremlin", era: "modern", type: "science", cost: 11, description: "+4 attack vs rival if you have more reinforced tokens than defender." }
  ];

  const DIPLOMACY_CARDS = {
    joint_war: { name: "Joint War", description: "When attacking, +2 combat value (unless attacking the card owner)." },
    defensive_pact: { name: "Defensive Pact", description: "When defending, +2 combat value (unless the card owner is attacking)." },
    non_aggression: { name: "Non-Aggression", description: "You cannot attack the owner's pieces. If owner attacks you, swap your military card with any other." },
    open_borders: { name: "Open Borders", description: "Owner's cities and control are friendly for your districts and city maturity." },
    embassy: { name: "Embassy", description: "Caravan to owner's capital: +1 trade to owner's card, gain 1 resource of choice." }
  };

  const CITY_STATE_DATA = {
    Carthage: { type: "military", diplomacy: "When defending or attacking (not Carthage), +1 combat per city-state token and friendly city within 2 spaces." },
    Kumasi: { type: "culture", diplomacy: "When resolving industry or culture, forest terrain difficulty is 1." },
    Brussels: { type: "industry", diplomacy: "When building a wonder, -1 cost per mature city." },
    Seoul: { type: "science", diplomacy: "Start of turn: move 1 barbarian to adjacent empty space." },
    "Buenos Aires": { type: "industry", diplomacy: "When building a wonder, -2 cost if you don't already have a wonder of that type." },
    Kabul: { type: "military", diplomacy: "When attacking a city or city-state (not Kabul), +3 combat." },
    Geneva: { type: "science", diplomacy: "Start of turn: return 1 diplomacy card to take a different one from that player." },
    "Mohenjo Daro": { type: "culture", diplomacy: "When placing control tokens, terrain difficulty reduced by 1." },
    Auckland: { type: "industry", diplomacy: "When building city, count through water; terrain difficulty 1 for spaces adjacent to water." },
    Akkad: { type: "military", diplomacy: "Your armies can move through rival control tokens." },
    Antananarivo: { type: "culture", diplomacy: "During your turn, Antananarivo is treated as your city (armies cannot end there)." },
    Palenque: { type: "science", diplomacy: "When resolving a focus card, spend resource tokens as trade tokens (limit 3)." }
  };

  const CITY_STATE_NAMES = Object.keys(CITY_STATE_DATA);

  const AGENDA_CARDS = [
    { name: "Fortified", description: "Control 1+ Fort tiles with a city.", check: (p, st) => countFortCities(p.id, st) >= 1 },
    { name: "Expeditionary", description: "Control 2+ Fort tiles with a city.", check: (p, st) => countFortCities(p.id, st) >= 2 },
    { name: "Warmonger", description: "Defeat 1 rival capital OR control 2 conquered city-states.", check: (p, st) => p.capturedCapitals >= 1 || countConqueredCityStates(p.id, st) >= 2 },
    { name: "Paranoid", description: "Control 2 military world wonders.", check: (p, st) => countWondersByType(p.id, st, "military") >= 2 },
    { name: "Civilized", description: "Have 8 cities on the map.", check: (p, st) => countCities(p.id).total >= 8 },
    { name: "Money Grubber", description: "Control 2 economic world wonders.", check: (p, st) => countWondersByType(p.id, st, "commerce") >= 2 },
    { name: "Defensive", description: "Have 15 reinforced control tokens.", check: (p, st) => countReinforcedTokens(p.id, st) >= 15 },
    { name: "Devastating", description: "Win an attack with total combat value ≥ 16.", check: (p) => p.maxCombatWin >= 16 },
    { name: "Diplomatic", description: "Have 4 diplomacy cards from different players/city-states.", check: (p) => countUniqueDiplomacySources(p) >= 4 },
    { name: "Hoarder", description: "Have 5 resource/natural wonder tokens.", check: (p) => totalResources(p) >= 5 },
    { name: "Explorer", description: "Control 15 spaces adjacent to water or map edge.", check: (p, st) => countEdgeWaterControl(p.id, st) >= 15 },
    { name: "Aesthetic", description: "Control 2 cultural world wonders.", check: (p, st) => countWondersByType(p.id, st, "culture") >= 2 },
    { name: "Technophile", description: "Have 3 tier-IV focus cards.", check: (p) => countTier4Cards(p) >= 3 },
    { name: "Scholarly", description: "Control 2 science world wonders.", check: (p, st) => countWondersByType(p.id, st, "science") >= 2 },
    { name: "Industrious", description: "Have all 5 districts on the map.", check: (p, st) => countDistrictTypes(p.id, st) >= 5 },
    { name: "Provincial", description: "Control 1 mature city on 4 different map tiles.", check: (p, st) => countMatureCityTiles(p.id, st) >= 4 },
    { name: "Diversified", description: "Control 3 different types of world wonders.", check: (p, st) => countWonderTypeVariety(p.id, st) >= 3 },
    { name: "Populous", description: "Control 5 matured cities.", check: (p, st) => countDevelopedCities(p.id) >= 5 },
    { name: "Preservationist", description: "Control 2 natural wonders.", check: (p, st) => countNaturalWonders(p.id, st) >= 2 },
    { name: "Expansionist", description: "Control 1 city on 6 different map tiles.", check: (p, st) => countCityTiles(p.id, st) >= 6 },
    { name: "Prolific", description: "Control 2 wonders from the same era.", check: (p, st) => maxWondersInSameEra(p.id, st) >= 2 },
    { name: "Progressive", description: "Control 1 wonder from each era.", check: (p, st) => countWonderEras(p.id, st) >= 3 }
  ];

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

  document.addEventListener("DOMContentLoaded", init);
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
    if (typeof Peer === "undefined") {
      setStatus("Multiplayer unavailable (PeerJS not loaded). Use Local Solo.");
      return;
    }
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
    if (typeof Peer === "undefined") {
      setStatus("Multiplayer unavailable (PeerJS not loaded). Use Local Solo.");
      return;
    }
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
    const shuffledAgendas = AGENDA_CARDS.slice().sort(() => Math.random() - 0.5);
    hostPlayer.agenda = shuffledAgendas[0]?.name || null;

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
      winner: null,
      builtWonders: [],
      discountedWonders: []
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
      cardTiers: {
        culture: 1,
        growth: 1,
        science: 1,
        economy: 1,
        military: 1,
        industry: 1
      },
      diplomacy: [],
      cityStateTokens: [],
      capturedCapitals: 0,
      maxCombatWin: 0,
      wonderTokens: 0,
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
    const names = pickRandom(CITY_STATE_NAMES.slice(), 6);
    const picks = pickRandom(hexKeys.filter((key) => !isWater(hexes[key])), names.length);
    picks.forEach((key, index) => {
      const csName = names[index];
      const csData = CITY_STATE_DATA[csName];
      hexes[key].cityState = {
        name: csName,
        type: csData ? csData.type : FOCUS_ORDER[index % FOCUS_ORDER.length],
        diplomacyCards: 2
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
    const valid = hexKeys.filter((key) => {
      const h = hexes[key];
      if (isWater(h) || h.city || h.cityState) return false;
      return true;
    });
    const picks = pickRandom(valid, Math.min(5, Math.floor(valid.length / 20)));
    picks.forEach((key) => {
      hexes[key].fortress = true;
      hexes[key].terrain = "forest";
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
    hex.city = { ownerId: playerId, isCapital: true, developed: false, wonder: null };
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

  const CAPITAL_HEX_OFFSET_INDEX = 6;

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
      if (hex.city && hex.city.isCapital) return;
      hex.active = true;
      hex.revealed = true;
      hex.terrain = randomLandTerrain();
      hex.resource = null;
      hex.cityState = null;
      hex.barbarian = false;
      if (!hex.fortress) {
        hex.fortress = false;
        hex.fortressOwnerId = null;
      }
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
    }

    if (tile.type === "capital" && tile.ownerId) {
      const capitalKey = cellKeys[CAPITAL_HEX_OFFSET_INDEX] || anchorKey;
      const capitalHex = state.map.hexes[capitalKey];
      if (capitalHex) {
        capitalHex.active = true;
        capitalHex.revealed = true;
        capitalHex.terrain = "grass";
        capitalHex.city = { ownerId: tile.ownerId, isCapital: true, developed: false, wonder: null };
        capitalHex.resource = null;
        capitalHex.cityState = null;
        capitalHex.barbarian = false;
        capitalHex.fortress = false;
        capitalHex.fortressOwnerId = null;
        tile.capitalKey = capitalKey;
        revealAround(state.map, capitalKey, DEFAULTS.revealRadius);
        const player = state.players.find((p) => p.id === tile.ownerId);
        if (player) {
          player.armies.forEach((u) => { if (!u.position) u.position = capitalKey; });
          player.wagons.forEach((u) => { if (!u.position) u.position = capitalKey; });
        }
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
      if (!payload.agenda) {
        const usedAgendas = state.players.map((p) => p.agenda).filter(Boolean);
        const available = AGENDA_CARDS.filter((a) => !usedAgendas.includes(a.name));
        const shuffled = available.sort(() => Math.random() - 0.5);
        payload.agenda = shuffled[0]?.name || null;
      }
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
      hex.terrain = "forest";
      hex.resource = null;
      hex.cityState = null;
      hex.barbarian = false;
      hex.fortress = true;
      hex.fortressOwnerId = null;
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
      if (hex.terrain === "hill") {
        const wonders = getPlayerWonders(payload.playerId);
        if (wonders.some((w) => w.name === "Stonehenge")) {
          neighborsFromKey(payload.key).forEach((nk) => {
            const nh = state.map.hexes[nk];
            if (nh && nh.active && nh.revealed && nh.terrain === "hill" && !nh.control && !nh.city && !nh.cityState && !nh.barbarian) {
              nh.control = { ownerId: payload.playerId, fortified: false, district: null };
              logEntry(`Stonehenge: chain-placed control on adjacent hill at ${nk}.`);
            }
          });
        }
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
      hex.city = { ownerId: payload.playerId, isCapital: false, developed: false, wonder: null };
      if (hex.control && hex.control.ownerId === payload.playerId) {
        hex.control = null;
      }
      checkCityDevelopment(payload.playerId);
      return;
    }

    if (type === "BUILD_WONDER") {
      const hex = state.map.hexes[payload.key];
      if (!hex || !hex.city || hex.city.ownerId !== payload.playerId) return;
      const wonderDef = payload.wonder || null;
      hex.city.wonder = wonderDef ? { name: wonderDef.name, era: wonderDef.era, type: wonderDef.type } : { name: "Unknown", era: "ancient", type: "military" };
      logEntry(`${getPlayer(payload.playerId)?.name} built ${hex.city.wonder.name}!`);
      if (wonderDef) {
        state.builtWonders = state.builtWonders || [];
        state.builtWonders.push(wonderDef.name);
      }
      const player = getPlayer(payload.playerId);
      if (player && wonderDef) {
        applyOnBuildWonderEffects(player, wonderDef, payload.key);
      }
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
        let remaining = payload.tradeSpent;
        const fromTrade = Math.min(remaining, player.trade[payload.cardType]);
        player.trade[payload.cardType] = Math.max(0, player.trade[payload.cardType] - fromTrade);
        remaining -= fromTrade;
        if (remaining > 0) {
          for (const r of RESOURCE_TYPES) {
            if (remaining <= 0) break;
            if (player.resources[r] > 0) {
              player.resources[r] -= 1;
              remaining -= 1;
              logEntry(`Palenque: spent 1 ${r} as trade.`);
            }
          }
        }
      }
      const csTokens = player.cityStateTokens || [];
      csTokens.forEach((csName) => {
        const csData = CITY_STATE_DATA[csName];
        if (csData && csData.type === payload.cardType) {
          player.trade[payload.cardType] = Math.min(DEFAULTS.maxTradePerCard, player.trade[payload.cardType] + 1);
          logEntry(`${player.name} gained +1 trade (${payload.cardType}) from ${csName} city-state token.`);
        }
      });
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

    if (type === "UPGRADE_CARD") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      const cardType = payload.cardType;
      const currentTier = player.cardTiers[cardType] || 1;
      if (currentTier >= 4) return;
      player.cardTiers[cardType] = currentTier + 1;
      const tierData = CARD_TIERS[cardType][currentTier + 1];
      logEntry(`${player.name} upgraded ${cardType} to tier ${currentTier + 1}: ${tierData?.name || ""}`);
      const wonders = getPlayerWonders(payload.playerId);
      if (wonders.some((w) => w.name === "University of Sankore")) {
        const nonSci = player.focusRow.filter((f) => f !== "science");
        if (nonSci.length >= 2) {
          const idx0 = player.focusRow.indexOf(nonSci[0]);
          const idx1 = player.focusRow.indexOf(nonSci[1]);
          if (idx0 >= 0 && idx1 >= 0) {
            const tmp = player.focusRow[idx0];
            player.focusRow[idx0] = player.focusRow[idx1];
            player.focusRow[idx1] = tmp;
            logEntry(`University of Sankore: swapped ${nonSci[0]} and ${nonSci[1]} in focus row.`);
          }
        }
      }
      return;
    }

    if (type === "ADD_DIPLOMACY") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      player.diplomacy.push({
        type: payload.cardType,
        fromId: payload.fromPlayerId || null,
        fromCityState: payload.fromCityState || null
      });
      logEntry(`${player.name} gained diplomacy card: ${DIPLOMACY_CARDS[payload.cardType]?.name || payload.cardType}`);
      return;
    }

    if (type === "SET_AGENDA") {
      const player = getPlayer(payload.playerId);
      if (!player) return;
      player.agenda = payload.agendaName;
      logEntry(`${player.name} chose agenda: ${payload.agendaName}`);
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
      resolveStartOfTurnEffects(currentPlayer());
      return;
    }
  }

  function applyOnBuildWonderEffects(player, wonderDef, key) {
    if (wonderDef.name === "Pyramids") {
      let upgraded = 0;
      FOCUS_ORDER.forEach((f) => {
        if (upgraded >= 3 && (player.cardTiers[f] || 1) === 1) return;
        if ((player.cardTiers[f] || 1) === 1 && upgraded < 3) {
          player.cardTiers[f] = 2;
          upgraded++;
          logEntry(`Pyramids: upgraded ${f} to tier II.`);
        }
      });
    }
    if (wonderDef.name === "Porcelain Tower") {
      let upgraded = 0;
      FOCUS_ORDER.forEach((f) => {
        if (upgraded >= 2) return;
        const current = player.cardTiers[f] || 1;
        if (current < 4) {
          player.cardTiers[f] = current + 1;
          upgraded++;
          logEntry(`Porcelain Tower: upgraded ${f} to tier ${current + 1}.`);
        }
      });
    }
    if (wonderDef.name === "Potala Palace") {
      for (let i = 0; i < 3; i++) {
        const available = Object.keys(DIPLOMACY_CARDS);
        if (available.length > 0) {
          player.diplomacy.push({ type: available[i % available.length], fromId: null, fromCityState: null });
        }
      }
      logEntry("Potala Palace: gained 3 diplomacy cards.");
    }
    if (wonderDef.name === "Apadana") {
      const edgeHexes = Object.values(state.map.hexes).filter((h) => {
        if (!h.active || !h.revealed) return false;
        return Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r) >= (state.map.radius || 5) * 2 - 1;
      });
      for (const eh of edgeHexes) {
        const adjUnrevealed = neighbors(eh.q, eh.r).filter((nk) => {
          const nh = state.map.hexes[nk];
          return nh && !nh.revealed;
        });
        if (adjUnrevealed.length > 0) {
          revealAround(state.map, keyFrom(eh.q, eh.r), 1);
          logEntry("Apadana: explored from edge, revealing nearby tiles.");
          break;
        }
      }
      const adjToWonder = neighborsFromKey(key).filter((nk) => {
        const nh = state.map.hexes[nk];
        return nh && nh.active && nh.revealed && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water";
      });
      if (adjToWonder.length > 0) {
        state.map.hexes[adjToWonder[0]].control = { ownerId: player.id, fortified: false, district: null };
        logEntry(`Apadana: placed control at ${adjToWonder[0]}.`);
      }
    }
    if (wonderDef.name === "Amundsen-Scott RS") {
      const edgeHexes = Object.values(state.map.hexes).filter((h) => {
        if (!h.active || !h.revealed || h.city || h.cityState) return false;
        if (h.terrain === "water") return false;
        if (adjacentToCity(h)) return false;
        return Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r) >= (state.map.radius || 5) * 2 - 1;
      });
      if (edgeHexes.length > 0) {
        const eh = edgeHexes[0];
        const ek = keyFrom(eh.q, eh.r);
        eh.city = { ownerId: player.id, isCapital: false, developed: false, wonder: null };
        logEntry(`Amundsen-Scott RS: built city at edge ${ek}.`);
        let placed = 0;
        neighborsFromKey(ek).forEach((nk) => {
          if (placed >= 2) return;
          const nh = state.map.hexes[nk];
          if (nh && nh.active && nh.revealed && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water") {
            nh.control = { ownerId: player.id, fortified: false, district: null };
            placed++;
          }
        });
        logEntry(`Amundsen-Scott RS: placed ${placed} control adjacent to new city.`);
      }
    }
    if (wonderDef.name === "Cristo Redentor") {
      const playerCities = Object.keys(state.map.hexes).filter((k) => {
        const h = state.map.hexes[k];
        return h && h.city && h.city.ownerId === player.id;
      });
      Object.keys(state.map.hexes).some((k) => {
        const h = state.map.hexes[k];
        if (!h || !h.city || h.city.ownerId === player.id || h.city.isCapital) return false;
        const inRange = playerCities.some((pk) => hexDistance(state.map.hexes[pk], h) <= 3);
        if (!inRange) return false;
        const hasDefender = getUnitsAt(k).some((u) => u.type === "army" && u.playerId === h.city.ownerId);
        if (hasDefender) return false;
        const prevOwner = h.city.ownerId;
        h.city.ownerId = player.id;
        logEntry(`Cristo Redentor: stole ${getPlayer(prevOwner)?.name}'s city at ${k}!`);
        return true;
      });
    }
  }

  function resolveStartOfTurnEffects(player) {
    if (!player) return;
    const wonders = getPlayerWonders(player.id);
    wonders.forEach((w) => {
      if (w.name === "Hanging Gardens") {
        Object.values(state.map.hexes).some((hex) => {
          if (!hex.city || hex.city.ownerId !== player.id) return false;
          const adjKeys = neighbors(hex.q, hex.r);
          for (const nk of adjKeys) {
            const nh = state.map.hexes[nk];
            if (nh && nh.active && nh.revealed && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water" && terrainDifficulty(nh.terrain) <= 4) {
              nh.control = { ownerId: player.id, fortified: false, district: null };
              logEntry(`Hanging Gardens: placed control at ${nk}.`);
              return true;
            }
          }
          return false;
        });
      }
      if (w.name === "Colosseum") {
        Object.values(state.map.hexes).some((hex) => {
          if (!hex.city || hex.city.ownerId !== player.id) return false;
          const adjKeys = neighbors(hex.q, hex.r);
          for (const nk of adjKeys) {
            const nh = state.map.hexes[nk];
            if (nh && nh.control && nh.control.ownerId === player.id && !nh.control.fortified) {
              nh.control.fortified = true;
              logEntry(`Colosseum: reinforced control at ${nk}.`);
              return true;
            }
          }
          return false;
        });
      }
      if (w.name === "Oracle") {
        for (let i = 0; i < player.focusRow.length - 1; i++) {
          const tmp = player.focusRow[i];
          player.focusRow[i] = player.focusRow[i + 1];
          player.focusRow[i + 1] = tmp;
          logEntry(`Oracle: swapped ${player.focusRow[i]} and ${player.focusRow[i + 1]} in focus row.`);
          break;
        }
      }
      if (w.name === "Forbidden City") {
        const friendlyKeys = new Set();
        Object.keys(state.map.hexes).forEach((key) => {
          const h = state.map.hexes[key];
          if ((h.city && h.city.ownerId === player.id) || (h.control && h.control.ownerId === player.id)) {
            friendlyKeys.add(key);
          }
        });
        Object.keys(state.map.hexes).some((key) => {
          const h = state.map.hexes[key];
          if (!h || !h.control || h.control.ownerId === player.id) return false;
          const isAdj = neighborsFromKey(key).some((nk) => friendlyKeys.has(nk));
          if (isAdj) {
            h.control = null;
            logEntry(`Forbidden City: removed rival control at ${key}.`);
            return true;
          }
          return false;
        });
      }
      if (w.name === "Great Zimbabwe") {
        const stored = w.storedTrade || 0;
        if (stored > 0) {
          const distribType = player.focusRow[0] || "economy";
          player.trade[distribType] = Math.min(DEFAULTS.maxTradePerCard, player.trade[distribType] + stored);
          w.storedTrade = 0;
          logEntry(`Great Zimbabwe: distributed ${stored} stored trade token(s) to ${distribType}.`);
        }
      }
      if (w.name === "Eiffel Tower") {
        let removed = false;
        Object.keys(state.map.hexes).some((key) => {
          const h = state.map.hexes[key];
          if (!h || !h.control || h.control.ownerId === player.id) return false;
          const rivalId = h.control.ownerId;
          h.control = { ownerId: player.id, fortified: false, district: null };
          logEntry(`Eiffel Tower: replaced rival (${getPlayer(rivalId)?.name}) control at ${key} with yours.`);
          removed = true;
          return true;
        });
      }
    });

    const csTokens = player.cityStateTokens || [];
    if (csTokens.includes("Seoul")) {
      Object.keys(state.map.hexes).some((key) => {
        const h = state.map.hexes[key];
        if (!h || !h.barbarian) return false;
        const adjEmpty = neighborsFromKey(key).filter((nk) => {
          const nh = state.map.hexes[nk];
          return nh && nh.active && !nh.city && !nh.cityState && !nh.barbarian && !nh.control;
        });
        if (adjEmpty.length > 0) {
          h.barbarian = null;
          const target = adjEmpty[0];
          state.map.hexes[target].barbarian = true;
          logEntry(`Seoul: moved barbarian from ${key} to ${target}.`);
          return true;
        }
        return false;
      });
    }
    if (csTokens.includes("Geneva") && player.diplomacy.length > 0) {
      const oldCard = player.diplomacy[0];
      const fromId = oldCard.fromId;
      if (fromId) {
        const available = Object.keys(DIPLOMACY_CARDS).filter((ct) => ct !== oldCard.type);
        if (available.length > 0) {
          player.diplomacy.splice(0, 1);
          player.diplomacy.push({ type: available[0], fromId, fromCityState: null });
          logEntry(`Geneva: swapped ${oldCard.type} diplomacy card for ${available[0]}.`);
        }
      }
    }
  }

  function getPlayerWonders(playerId) {
    const wonders = [];
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && hex.city.wonder) {
        wonders.push(hex.city.wonder);
      }
    });
    return wonders;
  }

  function getWonderCombatBonus(playerId, isAttacker, defenderKey) {
    const wonders = getPlayerWonders(playerId);
    const player = getPlayer(playerId);
    let bonus = 0;
    wonders.forEach((w) => {
      if (w.name === "Terracotta Army" && isAttacker) bonus += 2;
      if (w.name === "Petra" && !isAttacker) bonus += 2;
      if (w.name === "Alhambra") bonus += 2;
      if (w.name === "Jebel Barkal" && player) {
        let spent = 0;
        RESOURCE_TYPES.forEach((r) => {
          if (player.resources[r] > 0) {
            player.resources[r] -= 1;
            spent++;
          }
        });
        bonus += spent * 2;
        if (spent > 0) logEntry(`Jebel Barkal: spent ${spent} resource(s) for +${spent * 2} combat.`);
      }
      if (w.name === "Pentagon" && isAttacker) bonus += 2;
      if (w.name === "Ruhr Valley" && !isAttacker) bonus += 5;
      if (w.name === "Huey Teocalli" && !isAttacker && defenderKey) {
        const waterAdj = neighborsFromKey(defenderKey).filter((nk) => {
          const nh = state.map.hexes[nk];
          return nh && nh.terrain === "water";
        }).length;
        bonus += waterAdj;
      }
      if (w.name === "Big Ben" && defenderKey) {
        const caravanAdj = neighborsFromKey(defenderKey).filter((nk) => {
          return getUnitsAt(nk).some((u) => u.type === "wagon" && u.playerId === playerId);
        }).length;
        bonus += caravanAdj * 2;
      }
      if (w.name === "Kremlin" && isAttacker && defenderKey) {
        const hex = state.map.hexes[defenderKey];
        if (hex && hex.control && hex.control.ownerId !== playerId) {
          const myReinforced = countReinforcedTokens(playerId, state);
          const theirReinforced = countReinforcedTokens(hex.control.ownerId, state);
          if (myReinforced > theirReinforced) bonus += 4;
        } else if (hex && hex.city && hex.city.ownerId !== playerId) {
          const myReinforced = countReinforcedTokens(playerId, state);
          const theirReinforced = countReinforcedTokens(hex.city.ownerId, state);
          if (myReinforced > theirReinforced) bonus += 4;
        }
      }
    });
    return bonus;
  }

  function getDiplomacyCombatBonus(playerId, isAttacker, defenderId) {
    const player = getPlayer(playerId);
    if (!player) return 0;
    let bonus = 0;
    player.diplomacy.forEach((card) => {
      if (isAttacker && card.type === "joint_war" && card.fromId !== defenderId) bonus += 2;
      if (!isAttacker && card.type === "defensive_pact" && card.fromId !== playerId) bonus += 2;
    });
    return bonus;
  }

  function getCityStateCombatBonus(playerId, isAttacker, defenderKey) {
    const player = getPlayer(playerId);
    if (!player) return 0;
    let bonus = 0;
    player.cityStateTokens.forEach((csName) => {
      if (csName === "Kabul" && isAttacker) {
        const hex = state.map.hexes[defenderKey];
        if (hex && (hex.city || hex.cityState)) bonus += 3;
      }
      if (csName === "Carthage") {
        const nearCount = neighborsFromKey(defenderKey).filter((nk) => {
          const nh = state.map.hexes[nk];
          return nh && ((nh.city && nh.city.ownerId === playerId) || (nh.cityState));
        }).length;
        const selfHex = state.map.hexes[defenderKey];
        if (selfHex && ((selfHex.city && selfHex.city.ownerId === playerId) || selfHex.cityState)) {
          bonus += nearCount + 1;
        } else {
          bonus += nearCount;
        }
      }
    });
    return bonus;
  }

  function resolveCombat(payload) {
    const attacker = getPlayer(payload.attackerId);
    if (!attacker) return;
    const hex = state.map.hexes[payload.key];
    if (!hex) return;

    const attackerRoll = rollDie();
    const defenderRoll = rollDie();

    let attackPower = payload.attackPower;
    const milTier = attacker.cardTiers.military;
    const tierData = CARD_TIERS.military[milTier];
    if (tierData) {
      if (payload.defender.type === "barbarian" && tierData.combatVsBarb) {
        attackPower += tierData.combatVsBarb;
      }
      attackPower += tierData.combatBonus || 0;
    }
    attackPower += getWonderCombatBonus(attacker.id, true, payload.key);
    attackPower += getDiplomacyCombatBonus(attacker.id, true, payload.defender.ownerId);
    attackPower += getCityStateCombatBonus(attacker.id, true, payload.key);
    if (payload.combatTradeSpent) attackPower += payload.combatTradeSpent;

    let defensePower = payload.defensePower;
    if (payload.defender.ownerId) {
      defensePower += getWonderCombatBonus(payload.defender.ownerId, false, payload.key);
      defensePower += getDiplomacyCombatBonus(payload.defender.ownerId, false, attacker.id);
      defensePower += getCityStateCombatBonus(payload.defender.ownerId, false, payload.key);
    }

    const attackerValue = attackerRoll + attackPower;
    const defenderValue = defenderRoll + defensePower;

    state.lastRoll = { attackerRoll, defenderRoll, attackerValue, defenderValue };
    dom.diceResult.textContent = `Atk: ${attackerRoll}+${attackPower}=${attackerValue} vs Def: ${defenderRoll}+${defensePower}=${defenderValue}`;

    if (attackerValue > defenderValue) {
      applyCombatWin(payload, hex, attackerValue);
      logEntry(`${attacker.name} won combat (${attackerValue} vs ${defenderValue}).`);
    } else {
      applyCombatLoss(payload);
      logEntry(`${attacker.name} lost combat (${attackerValue} vs ${defenderValue}). Defender wins ties.`);
    }
  }

  function applyCombatWin(payload, hex, attackerValue) {
    const attacker = getPlayer(payload.attackerId);
    if (!attacker) return;

    if (attackerValue > attacker.maxCombatWin) {
      attacker.maxCombatWin = attackerValue;
    }

    const unit = attacker.armies.find((u) => u.id === payload.attackerUnitId);
    if (unit) {
      unit.position = payload.key;
    }

    if (payload.defender.type === "barbarian") {
      hex.barbarian = false;
      state.pendingBarbReward = { playerId: payload.attackerId };
      logEntry(`${attacker.name} defeated a barbarian! Choose a focus card for +1 trade.`);
    }

    if (payload.defender.type === "fortress") {
      hex.city = { ownerId: payload.attackerId, isCapital: false, developed: false, wonder: null };
      logEntry(`${attacker.name} captured a fortress and built a city on it.`);
    }

    if (payload.defender.type === "control") {
      hex.control = { ownerId: payload.attackerId, fortified: false, district: null };
    }

    if (payload.defender.type === "city") {
      const attackerWonders = getPlayerWonders(payload.attackerId);
      if (attackerWonders.some((w) => w.name === "Statue of Liberty")) {
        neighborsFromKey(payload.key).forEach((nk) => {
          const nh = state.map.hexes[nk];
          if (nh && nh.control && nh.control.ownerId === hex.city?.ownerId) {
            nh.control = { ownerId: payload.attackerId, fortified: false, district: null };
            logEntry(`Statue of Liberty: replaced rival control at ${nk}.`);
          }
        });
      }
      const defenderId = hex.city?.ownerId;
      const wasCapital = hex.city?.isCapital || false;
      hex.city = {
        ownerId: payload.attackerId,
        isCapital: false,
        developed: false,
        wonder: hex.city?.wonder || null
      };
      if (defenderId) {
        const defender = getPlayer(defenderId);
        if (defender) {
          defender.armies.forEach((u) => { u.position = null; });
          defender.wagons.forEach((u) => { u.position = null; });
          logEntry(`${defender.name}'s armies and caravans returned to focus cards.`);
          if (wasCapital) {
            attacker.capturedCapitals = (attacker.capturedCapitals || 0) + 1;
            let tokensStolen = 0;
            for (const ft of FOCUS_ORDER) {
              if (tokensStolen >= 2) break;
              if (defender.trade[ft] > 0) {
                defender.trade[ft] -= 1;
                attacker.trade[ft] = Math.min(DEFAULTS.maxTradePerCard, attacker.trade[ft] + 1);
                tokensStolen++;
              }
            }
            if (tokensStolen > 0) {
              logEntry(`${attacker.name} stole ${tokensStolen} trade token(s) from ${defender.name}'s capital!`);
            }
          }
        }
      }
    }

    if (payload.defender.type === "citystate") {
      const csType = hex.cityState?.type || "military";
      const csName = hex.cityState?.name;
      hex.cityState = null;
      hex.city = { ownerId: payload.attackerId, isCapital: false, developed: false, wonder: null };
      if (csName) {
        attacker.cityStateTokens = attacker.cityStateTokens || [];
        attacker.cityStateTokens.push(csName);
      }
      logEntry(`${attacker.name} conquered city-state ${csName || ""} (${csType}).`);
    }

    if (payload.defender.type === "army" || payload.defender.type === "wagon") {
      const defenderPlayer = getPlayer(payload.defender.ownerId);
      if (defenderPlayer) {
        const units = payload.defender.type === "army" ? defenderPlayer.armies : defenderPlayer.wagons;
        const dUnit = units.find((u) => u.id === payload.defender.unitId);
        if (dUnit) dUnit.position = null;
      }
    }
  }

  function applyCombatLoss(payload) {
    const attacker = getPlayer(payload.attackerId);
    if (!attacker) return;
    const unit = attacker.armies.find((u) => u.id === payload.attackerUnitId);
    if (unit) {
      const milTier = CARD_TIERS.military[attacker.cardTiers.military] || {};
      if (milTier.effects && milTier.effects.includes("respawn")) {
        const capitalKey = findDefaultStart(attacker.id);
        if (capitalKey) {
          unit.position = capitalKey;
          logEntry(`${attacker.name}'s army respawned at capital (Mass Production).`);
          return;
        }
      }
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

      const petraOwner = toHex.city?.ownerId || toHex.control?.ownerId;
      const hasPetra = petraOwner && getPlayerWonders(petraOwner).some((w) => w.name === "Petra");
      if (hasPetra && (toHex.city || (toHex.control && toHex.control.fortified))) {
        logEntry("Petra: barbarian blocked from entering protected space.");
      } else if (toHex.control && !toHex.control.fortified) {
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

  function resolvePlayerDistricts(player) {
    const districts = [];
    Object.values(state.map.hexes).forEach((hex) => {
      if (!hex.control || hex.control.ownerId !== player.id || !hex.control.district) return;
      districts.push({ hex, type: hex.control.district, key: keyFrom(hex.q, hex.r) });
    });
    districts.forEach(({ hex, type, key }) => {
        if (type === "campus") {
          let tokens = 0;
          neighborsFromKey(key).forEach((nk) => {
            const nh = state.map.hexes[nk];
            if (nh && (nh.terrain === "mountain" || nh.resource === "natural_wonder")) tokens++;
          });
          tokens = Math.min(tokens, DEFAULTS.maxTradePerCard - player.trade.science);
          if (tokens > 0) {
            player.trade.science = Math.min(DEFAULTS.maxTradePerCard, player.trade.science + tokens);
            logEntry(`${player.name}: Campus +${tokens} science trade (adj mountains/NW).`);
          }
        }

        if (type === "trade") {
          let tokens = 0;
          const developedCount = Object.values(state.map.hexes).filter(
            (h) => h.city && h.city.ownerId === player.id && isCityDeveloped(h)
          ).length;
          if (developedCount > 0) {
            FOCUS_ORDER.forEach((ft) => {
              if (tokens < developedCount && player.trade[ft] < DEFAULTS.maxTradePerCard) {
                player.trade[ft] = Math.min(DEFAULTS.maxTradePerCard, player.trade[ft] + 1);
                tokens++;
              }
            });
            if (tokens > 0) logEntry(`${player.name}: Commercial Hub +${tokens} trade (${developedCount} mature cities).`);
          } else {
            let desertTokens = 0;
            neighborsFromKey(key).forEach((nk) => {
              const nh = state.map.hexes[nk];
              if (nh && nh.terrain === "desert") desertTokens++;
            });
            desertTokens = Math.min(desertTokens, DEFAULTS.maxTradePerCard - player.trade.economy);
            if (desertTokens > 0) {
              player.trade.economy = Math.min(DEFAULTS.maxTradePerCard, player.trade.economy + desertTokens);
              logEntry(`${player.name}: Commercial Hub +${desertTokens} economy trade (adj deserts).`);
            }
          }
        }

        if (type === "encampment") {
          let defeated = 0;
          neighborsFromKey(key).forEach((nk) => {
            const nh = state.map.hexes[nk];
            if (nh && nh.barbarian) {
              nh.barbarian = false;
              defeated++;
              player.trade.military = Math.min(DEFAULTS.maxTradePerCard, player.trade.military + 1);
            }
          });
          const nk2 = [];
          neighborsFromKey(key).forEach((nk) => {
            neighborsFromKey(nk).forEach((nk2key) => {
              if (!nk2.includes(nk2key) && nk2key !== key) nk2.push(nk2key);
            });
          });
          nk2.forEach((nk) => {
            const nh = state.map.hexes[nk];
            if (nh && nh.barbarian && !defeated) {
              nh.barbarian = false;
              defeated++;
              player.trade.military = Math.min(DEFAULTS.maxTradePerCard, player.trade.military + 1);
            }
          });
          if (defeated > 0) logEntry(`${player.name}: Encampment defeated ${defeated} barbarian(s).`);
          let reinforced = 0;
          neighborsFromKey(key).forEach((nk) => {
            const nh = state.map.hexes[nk];
            if (nh?.control?.ownerId === player.id && !nh.control.fortified && reinforced < 1) {
              nh.control.fortified = true;
              reinforced++;
            }
          });
          if (reinforced > 0) logEntry(`${player.name}: Encampment reinforced ${reinforced} token(s).`);
        }

        if (type === "industrial") {
          let tokens = 0;
          neighborsFromKey(key).forEach((nk) => {
            const nh = state.map.hexes[nk];
            if (nh && nh.terrain === "forest") tokens++;
          });
          tokens = Math.min(tokens, DEFAULTS.maxTradePerCard - player.trade.industry);
          if (tokens > 0) {
            player.trade.industry = Math.min(DEFAULTS.maxTradePerCard, player.trade.industry + tokens);
            logEntry(`${player.name}: Industrial Zone +${tokens} industry trade (adj forests).`);
          }
        }

        if (type === "theater") {
          const hexesWithin2 = getHexesWithinRange(hex, 2);
          let placed = 0;
          for (const targetKey of hexesWithin2) {
            if (placed >= 1) break;
            const th = state.map.hexes[targetKey];
            if (!th || th.terrain === "water" || th.city || th.cityState || th.barbarian || th.control) continue;
            th.control = { ownerId: player.id, fortified: false, district: null };
            placed++;
          }
          if (placed > 0) logEntry(`${player.name}: Theatre Square placed ${placed} control token(s).`);
        }
      });
  }

  function resolveDistrictEvents() {
    state.players.forEach((player) => {
      resolvePlayerDistricts(player);
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

  function getHexesWithinRange(centerHex, range) {
    const result = [];
    Object.values(state.map.hexes).forEach((hex) => {
      if (hexDistance(centerHex, hex) <= range && hex !== centerHex && hex.active) {
        result.push(keyFrom(hex.q, hex.r));
      }
    });
    return result;
  }

  function resolveGovernmentChange() {
    state.players.forEach((player) => {
      const slot1Cards = player.focusRow.filter((_, i) => FOCUS_SLOTS[i] === 1);
      if (slot1Cards.length >= 2) {
        player.govMarkers = slot1Cards.slice(0, 2);
        FOCUS_ORDER.forEach((f) => { player.govBonus[f] = 0; });
        player.govMarkers.forEach((f) => { player.govBonus[f] = (player.govBonus[f] || 0) + 1; });
        logEntry(`${player.name}: Government set from slot #1 cards: ${player.govMarkers.join(", ")}.`);
      }
    });
    logEntry("Government change event — players selected government from slot #1 focus cards.");
  }

  function resolveWonderAging() {
    state.builtWonders = state.builtWonders || [];
    const available = WONDERS.filter((w) => !state.builtWonders.includes(w.name));
    const discounted = state.discountedWonders || [];
    discounted.forEach((wn) => {
      const idx = available.findIndex((w) => w.name === wn);
      if (idx >= 0) available.splice(idx, 1);
    });
    state.discountedWonders = available.slice(0, 3).map((w) => w.name);
    let wonderCount = 0;
    Object.values(state.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.wonder) wonderCount++;
    });
    logEntry(`Wonder aging: ${wonderCount} wonder(s) on map. Discounted wonders refreshed.`);
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
      if (player.agenda) {
        const agendaDef = AGENDA_CARDS.find((a) => a.name === player.agenda);
        if (agendaDef && agendaDef.check(player, state)) {
          return { player, type: `Agenda: ${agendaDef.name}` };
        }
      }
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

  function countFortCities(playerId, st) {
    let count = 0;
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.fortress && hex.city && hex.city.ownerId === playerId) count++;
    });
    return count;
  }

  function countConqueredCityStates(playerId, st) {
    return (getPlayer(playerId)?.cityStateTokens || []).length;
  }

  function countWondersByType(playerId, st, wonderType) {
    let count = 0;
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && hex.city.wonder && hex.city.wonder.type === wonderType) count++;
    });
    return count;
  }

  function countReinforcedTokens(playerId, st) {
    let count = 0;
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.control && hex.control.ownerId === playerId && hex.control.fortified) count++;
    });
    return count;
  }

  function countUniqueDiplomacySources(player) {
    const sources = new Set();
    (player.diplomacy || []).forEach((c) => sources.add(c.fromId || c.fromCityState));
    return sources.size;
  }

  function totalResources(player) {
    return Object.values(player.resources).reduce((s, v) => s + v, 0);
  }

  function countEdgeWaterControl(playerId, st) {
    let count = 0;
    Object.values(st.map.hexes).forEach((hex) => {
      if (!hex.control || hex.control.ownerId !== playerId) return;
      const isEdge = Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(hex.q + hex.r) >= st.map.radius * 2 - 1;
      const adjWater = neighbors(hex.q, hex.r).some((nk) => {
        const nh = st.map.hexes[nk];
        return nh && nh.terrain === "water";
      });
      if (isEdge || adjWater) count++;
    });
    return count;
  }

  function countTier4Cards(player) {
    return FOCUS_ORDER.filter((f) => (player.cardTiers || {})[f] >= 4).length;
  }

  function countDistrictTypes(playerId, st) {
    const types = new Set();
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.control && hex.control.ownerId === playerId && hex.control.district) {
        types.add(hex.control.district);
      }
    });
    return types.size;
  }

  function countMatureCityTiles(playerId, st) {
    const tiles = new Set();
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && isCityDeveloped(hex)) {
        tiles.add(`${Math.floor(hex.q / 4)},${Math.floor(hex.r / 4)}`);
      }
    });
    return tiles.size;
  }

  function countWonderTypeVariety(playerId, st) {
    const types = new Set();
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && hex.city.wonder) {
        types.add(hex.city.wonder.type);
      }
    });
    return types.size;
  }

  function countNaturalWonders(playerId, st) {
    let count = 0;
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.control && hex.control.ownerId === playerId && hex.resource === "natural_wonder") count++;
    });
    return count;
  }

  function countCityTiles(playerId, st) {
    const tiles = new Set();
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId) {
        tiles.add(`${Math.floor(hex.q / 4)},${Math.floor(hex.r / 4)}`);
      }
    });
    return tiles.size;
  }

  function maxWondersInSameEra(playerId, st) {
    const eraCounts = {};
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && hex.city.wonder) {
        const era = hex.city.wonder.era;
        eraCounts[era] = (eraCounts[era] || 0) + 1;
      }
    });
    return Math.max(0, ...Object.values(eraCounts));
  }

  function countWonderEras(playerId, st) {
    const eras = new Set();
    Object.values(st.map.hexes).forEach((hex) => {
      if (hex.city && hex.city.ownerId === playerId && hex.city.wonder) {
        eras.add(hex.city.wonder.era);
      }
    });
    return eras.size;
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
      if (hex.city && hex.city.ownerId === playerId && hex.city.wonder) count++;
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
      const dipCount = (player.diplomacy || []).length;
      const agendaLabel = player.agenda || "None";
      const tierSummary = FOCUS_ORDER.map((f) => `${f[0].toUpperCase()}${player.cardTiers[f] || 1}`).join(" ");
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
          <span>Diplo: ${dipCount}</span>
          <span>Score: ${computeScore(player)}</span>
        </div>
        <div class="player-meta dim">
          <span>Cards: ${tierSummary}</span>
          <span>Agenda: ${agendaLabel}</span>
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
      const cardTier = player.cardTiers[cardType] || 1;
      const tierData = CARD_TIERS[cardType]?.[cardTier] || {};
      card.innerHTML = `
        <div class="focus-slot">${effectiveSlot}${govB > 0 ? `<span class="gov-bonus">+${govB}</span>` : ""}</div>
        <div class="focus-name">${tierData.name || FOCUS_META[cardType].label}</div>
        <div class="focus-tier">Tier ${cardTier}</div>
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
        tokens.push(tokenSpan(hex.city.isCapital ? "capital" : "city", hex.city.isCapital ? "Capital" : "City", owner?.color));
        if (hex.city.wonder) {
          tokens.push(tokenSpan("wonder", hex.city.wonder.name || "Wonder"));
        }
      }
      if (hex.control) {
        const owner = getPlayer(hex.control.ownerId);
        if (hex.control.fortified) {
          tokens.push(tokenSpan("control", "Reinforced" + (hex.control.district ? ` (${hex.control.district})` : ""), owner?.color));
        } else if (hex.control.district) {
          tokens.push(tokenSpan("district", hex.control.district, owner?.color));
        } else {
          tokens.push(tokenSpan("control", "Control", owner?.color));
        }
      }
      if (hex.cityState) {
        tokens.push(tokenSpan("citystate", hex.cityState.name || "City-State"));
      }
      if (hex.barbarian) {
        tokens.push(tokenSpan("barbarian", "Barbarian"));
      }
      if (hex.resource) {
        tokens.push(tokenSpan("resource", hex.resource.slice(0, 3)));
      }
      if (hex.tradeMarker) {
        tokens.push(tokenSpan("resource", "Trade"));
      }
      if (hex.fortress && !hex.city) {
        tokens.push(tokenSpan("fortress", "Fortress"));
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
          <button class="btn primary" id="new-game">New Game</button>
        </div>
      `;
      document.getElementById("new-game")?.addEventListener("click", () => {
        startLocalGame();
      });
      return;
    }

    if (state.pendingBarbReward && state.pendingBarbReward.playerId === localPlayerId) {
      dom.actionPanel.innerHTML = `
        <div class="action-card">
          <div class="action-title">Barbarian Defeated! Choose a focus card for +1 trade:</div>
          ${FOCUS_ORDER.map((f) => {
            const current = player.trade[f] || 0;
            return `<div class="action-row"><button class="btn barb-reward-pick" data-type="${f}">${FOCUS_META[f].label} (${current}/${DEFAULTS.maxTradePerCard})</button></div>`;
          }).join("")}
        </div>
      `;
      document.querySelectorAll(".barb-reward-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cardType = btn.dataset.type;
          dispatch({ type: "ADD_TRADE", payload: { playerId: player.id, cardType, amount: 1 } });
          logEntry(`${player.name} placed barbarian reward trade on ${cardType}.`);
          state.pendingBarbReward = null;
          renderActions();
          renderMap();
        });
      });
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

      const hasOxford = getPlayerWonders(player.id).some((w) => w.name === "Oxford University");
      const upgradeableCards = FOCUS_ORDER.filter((f) => {
        const ct = player.cardTiers[f] || 1;
        if (ct >= 4) return false;
        return hasOxford || ct < player.techTier;
      });
      const upgradeHtml = upgradeableCards.length > 0
        ? `<div class="action-row"><span class="dim">Upgradeable:</span> ${upgradeableCards.map((f) => {
            const ct = player.cardTiers[f] || 1;
            const nextTier = CARD_TIERS[f]?.[ct + 1];
            return `<button class="btn tiny upgrade-card" data-card="${f}">↑ ${FOCUS_META[f].label} → ${nextTier?.name || `T${ct + 1}`}</button>`;
          }).join(" ")}</div>`
        : "";

      const diploHtml = (player.diplomacy || []).length > 0
        ? `<div class="action-row dim">Diplomacy: ${player.diplomacy.map((d) => {
            const label = d.fromCityState || (getPlayer(d.fromId)?.name || "?");
            return `${DIPLOMACY_CARDS[d.type]?.name || d.type} (${label})`;
          }).join(", ")}</div>`
        : "";

      const agendaHtml = player.agenda
        ? `<div class="action-row dim">Agenda: ${player.agenda} — ${AGENDA_CARDS.find((a) => a.name === player.agenda)?.description || ""}</div>`
        : "";

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
            ${upgradeHtml}
            ${diploHtml}
            ${agendaHtml}
            <button class="btn" id="end-turn">End Turn</button>
            <button class="btn ghost tiny" id="restart-game">New Game</button>
          ` : ""}
        </div>
      `;
      if (isMyTurn) {
        const endBtn = document.getElementById("end-turn");
        if (endBtn) endBtn.addEventListener("click", () => dispatch({ type: "END_TURN" }));
        const restartBtn = document.getElementById("restart-game");
        if (restartBtn) restartBtn.addEventListener("click", () => {
          if (confirm("Start a new game? Current progress will be lost.")) startLocalGame();
        });
        const raBtn = document.getElementById("recruit-army");
        if (raBtn) raBtn.addEventListener("click", () => dispatch({ type: "RECRUIT_ARMY", payload: { playerId: player.id } }));
        const rwBtn = document.getElementById("recruit-wagon");
        if (rwBtn) rwBtn.addEventListener("click", () => dispatch({ type: "RECRUIT_WAGON", payload: { playerId: player.id } }));
        const govBtn = document.getElementById("assign-gov");
        if (govBtn) govBtn.addEventListener("click", () => showGovPicker(player));
        document.querySelectorAll(".upgrade-card").forEach((btn) => {
          btn.addEventListener("click", () => {
            dispatch({ type: "UPGRADE_CARD", payload: { playerId: player.id, cardType: btn.dataset.card } });
            renderAll();
          });
        });
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

    const tier = player.cardTiers[card.type] || 1;
    const tierData = CARD_TIERS[card.type]?.[tier] || {};
    const tierLabel = `${tierData.name || card.type} (Tier ${tier})`;

    if (card.type === "culture") {
      const n = (CARD_TIERS.culture[tier]?.n || 2) + spend;
      lines.push(`<div class="action-row">${tierLabel}: Place <strong>${n}</strong> control markers (terrain ≤ ${slot}).</div>`);
    }
    if (card.type === "growth") {
      lines.push(`<div class="action-row">${tierLabel}: Place <strong>1</strong> district OR reinforce markers.</div>`);
      if (spend > 0) lines.push(`<div class="action-row dim">+${spend} extra from trade.</div>`);
    }
    if (card.type === "science") {
      lines.push(`<div class="action-row">${tierLabel}: Advance tech by <strong>${slot + spend}</strong>. Current: ${player.tech}/${TECH_WHEEL_SIZE} (Tier ${player.techTier || 1})</div>`);
      if (tier >= 2) lines.push(`<div class="action-row dim">+1 trade token (Mathematics)</div>`);
      if (tier >= 3) lines.push(`<div class="action-row dim">+1 missing resource (Replaceable Parts)</div>`);
    }
    if (card.type === "economy") {
      const econTier = CARD_TIERS.economy[tier] || {};
      lines.push(`<div class="action-row">${tierLabel}: Move <strong>${econTier.caravans || 1}</strong> caravan(s) up to <strong>${(econTier.move || 3) + spend}</strong> hexes.</div>`);
      lines.push(`<div class="action-row dim">Caravans trade at city-states (+2 trade + diplomacy) and foreign cities (+2 economy trade).</div>`);
      if (tier >= 3) lines.push(`<div class="action-row dim">Can move through water.</div>`);
    }
    if (card.type === "industry") {
      const indTier = CARD_TIERS.industry[tier] || {};
      const production = slot + spend;
      lines.push(`<div class="action-row">${tierLabel}: Production <strong>${production}</strong>. City range: ${indTier.cityRange || 2}. Resources: +${DEFAULTS.resourceProductionValue} each.</div>`);
    }
    if (card.type === "military") {
      const milTier = CARD_TIERS.military[tier] || {};
      lines.push(`<div class="action-row">${tierLabel}: Move <strong>${milTier.armies || 1}</strong> army/armies up to <strong>${milTier.move || 3}</strong>. Combat: d6 + ${slot + spend} + tier bonus (${milTier.combatBonus || 0}).</div>`);
      if (tier >= 3) lines.push(`<div class="action-row dim">Can move through water.</div>`);
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
    let bonus = player.govBonus[cardType] || 0;
    const wonders = getPlayerWonders(player.id);
    const hasEstadio = wonders.some((w) => w.name === "Estádio Do Maracanã");
    if (hasEstadio && cardType !== "economy" && !ui.estadioDone) {
      ui.estadioDone = true;
      ui.estadioPendingCard = { cardType, index };
      ui.mode = "estadio-choice";
      dom.actionPanel.innerHTML = `
        <div class="action-card">
          <div class="action-title">Estádio Do Maracanã</div>
          <div class="action-row">Resolve economy card first (as slot #1)?</div>
          <div class="action-row">
            <button class="btn primary" id="estadio-yes">Yes, resolve economy first</button>
            <button class="btn ghost" id="estadio-no">No, skip</button>
          </div>
        </div>
      `;
      document.getElementById("estadio-yes")?.addEventListener("click", () => {
        const econTier = player.cardTiers.economy || 1;
        const econTierData = CARD_TIERS.economy?.[econTier] || {};
        ui.activeCard = {
          type: "economy",
          slotIndex: 0,
          slot: 1,
          effectiveSlot: 1,
          tier: econTier,
          tierData: econTierData,
          tradeSpent: 0,
          isResolveExtra: true
        };
        ui.mode = "inspect";
        ui.tradeLocked = true;
        startActionPhase();
      });
      document.getElementById("estadio-no")?.addEventListener("click", () => {
        const pending = ui.estadioPendingCard;
        ui.estadioPendingCard = null;
        startCardAction(player, pending.cardType, pending.index);
      });
      return;
    }
    wonders.forEach((w) => {
      if (w.name === "Taj Mahal") {
        const matchCount = wonders.filter((ow) => ow.type === cardType || FOCUS_META[cardType]?.wonderType === ow.type).length;
        if (matchCount > 0) bonus += matchCount;
      }
      if (w.name === "Machu Picchu" && (slot === 1 || slot === 2)) {
        bonus += 2;
      }
    });
    const tier = player.cardTiers[cardType] || 1;
    const tierData = CARD_TIERS[cardType]?.[tier] || {};
    ui.activeCard = {
      type: cardType,
      slotIndex: index,
      slot,
      effectiveSlot: Math.min(5, slot + bonus),
      tier,
      tierData,
      tradeSpent: 0
    };
    ui.mode = "inspect";
    ui.selectable.clear();
    ui.tradeLocked = false;
    ui.estadioPendingCard = null;
    renderActions();
    renderMap();
  }

  function adjustTrade(delta) {
    if (!ui.activeCard || ui.tradeLocked) return;
    const player = getPlayer(localPlayerId);
    if (!player) return;
    const cardType = ui.activeCard.type;
    let maxSpend = player.trade[cardType];
    const hasPalenque = (player.cityStateTokens || []).includes("Palenque");
    if (hasPalenque) {
      const totalRes = RESOURCE_TYPES.reduce((s, r) => s + (player.resources[r] || 0), 0);
      maxSpend += Math.min(3, totalRes);
    }
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
      const cultureTier = CARD_TIERS.culture[card.tier] || {};
      ui.remaining = (cultureTier.n || 2) + card.tradeSpent;
      ui.selectable = new Set(validControlPlacements(player.id, card.effectiveSlot));
      logEntry(`${player.name} is placing ${ui.remaining} control markers (${cultureTier.name || "Culture"}).`);
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
      const sciTier = CARD_TIERS.science[card.tier] || {};
      if (sciTier.effects.includes("bonusTrade")) {
        const tradeType = player.focusRow[player.focusRow.length - 1];
        dispatch({ type: "ADD_TRADE", payload: { playerId: player.id, cardType: tradeType, amount: 1 } });
        logEntry(`${player.name} gained +1 trade token (${tradeType}) from Mathematics.`);
      }
      if (sciTier.effects.includes("bonusResource")) {
        const missing = RESOURCE_TYPES.find((r) => player.resources[r] === 0);
        if (missing) {
          player.resources[missing] = (player.resources[missing] || 0) + 1;
          logEntry(`${player.name} gained 1 ${missing} from Replaceable Parts.`);
        }
      }
      if (sciTier.effects.includes("nuke")) {
        const nukeTargets = validNukeTargets(player.id);
        if (nukeTargets.length > 0) {
          ui.mode = "science-nuke";
          ui.selectable = new Set(nukeTargets);
          logEntry("Nuclear Power: destroy 1 barbarian or rival control within 3 of your city.");
          renderActions();
          renderMap();
          return;
        }
      }
      finishCardAction();
      return;
    } else if (card.type === "economy") {
      ui.mode = "move-wagon";
      const econTier = CARD_TIERS.economy[card.tier] || {};
      let econMove = (econTier.move || 3) + card.tradeSpent;
      const playerWonders = getPlayerWonders(player.id);
      if (playerWonders.some((w) => w.name === "Colossus")) econMove += 6;
      ui.remaining = econMove;
      ui.maxCaravans = econTier.caravans || 1;
      ui.caravansUsed = 0;
      ui.selectedUnit = null;
      ui.selectable.clear();
      logEntry(`${player.name} is moving caravans (${econTier.name || "Economy"}, range ${ui.remaining}, ${ui.maxCaravans} caravan(s)).`);
    } else if (card.type === "industry") {
      ui.mode = "industry-choice";
      ui.spentResources = ui.spentResources || {};
      const indTier = CARD_TIERS.industry[card.tier] || {};
      const cityRange = indTier.cityRange || 2;
      const showIndustry = () => {
        let baseProd = card.effectiveSlot + card.tradeSpent;
        if (indTier.wonderProdOverride && card.slot === 5) {
          baseProd = indTier.wonderProdOverride + card.tradeSpent;
        }
        const resEntries = Object.entries(player.resources).filter(([, v]) => v > 0);
        let spentBonus = 0;
        Object.values(ui.spentResources).forEach((v) => { if (v) spentBonus += DEFAULTS.resourceProductionValue; });
        const totalProd = baseProd + spentBonus;
        ui.industryTotalProd = totalProd;

        const builtNames = state.builtWonders || [];
        const discounted = state.discountedWonders || [];
        const csTokens = player.cityStateTokens || [];
        const matureCities = countDevelopedCities(player.id);
        const brusselsDiscount = csTokens.includes("Brussels") ? matureCities : 0;
        const ownedWonderTypes = new Set(getPlayerWonders(player.id).map((w) => w.type));
        const getEffectiveCost = (w) => {
          let cost = w.cost;
          if (discounted.includes(w.name)) cost -= 1;
          if (brusselsDiscount > 0) cost -= brusselsDiscount;
          if (csTokens.includes("Buenos Aires") && !ownedWonderTypes.has(w.type)) cost -= 2;
          return Math.max(1, cost);
        };
        const availableWonders = WONDERS.filter((w) => !builtNames.includes(w.name) && getEffectiveCost(w) <= totalProd);

        const resToggleHtml = resEntries.length > 0
          ? resEntries.map(([k, v]) => {
            const checked = ui.spentResources[k] ? "primary" : "";
            return `<button class="btn tiny res-toggle ${checked}" data-res="${k}">${k} (${v}) +${DEFAULTS.resourceProductionValue}</button>`;
          }).join(" ")
          : "<span class='dim'>No resources available</span>";

        const wonderListHtml = availableWonders.length > 0
          ? availableWonders.map((w) => {
            const eCost = getEffectiveCost(w);
            const disc = eCost < w.cost ? ` (reduced from ${w.cost})` : "";
            return `<button class="btn tiny wonder-pick" data-wonder="${w.name}">${w.name} [${w.era}/${w.type}] Cost:${eCost}${disc}</button>`;
          }).join("<br>")
          : "<span class='dim'>No affordable wonders</span>";

        dom.actionPanel.innerHTML = `
          <div class="action-card">
            <div class="action-title">${indTier.name || "Industry"} (Production: ${totalProd})</div>
            <div class="action-row dim">Base ${baseProd} + ${spentBonus} from resources. City range: ${cityRange} hexes.</div>
            <div class="action-row resource-row">${resToggleHtml}</div>
            <div class="action-row"><button class="btn" id="industry-city">Build City (cost = terrain, range ${cityRange})</button></div>
            <div class="action-row"><div class="action-title">Build Wonder:</div>${wonderListHtml}</div>
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
          const allowOnUnit = indTier.effects.includes("buildOnUnit");
          ui.selectable = new Set(validCityPlacements(player.id, totalProd, cityRange, allowOnUnit));
          renderActions();
          renderMap();
        });
        document.querySelectorAll(".wonder-pick").forEach((btn) => {
          btn.addEventListener("click", () => {
            const wonderName = btn.dataset.wonder;
            const wonderDef = WONDERS.find((w) => w.name === wonderName);
            const effCost = wonderDef ? getEffectiveCost(wonderDef) : Infinity;
            if (!wonderDef || totalProd < effCost) {
              logEntry(`Not enough production to build ${wonderName} (need ${effCost}).`);
              return;
            }
            spendSelectedResources(player);
            ui.selectedWonder = wonderDef;
            ui.mode = "build-wonder";
            ui.selectable = new Set(validWonderPlacements(player.id));
            renderActions();
            renderMap();
          });
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
      const milTier = CARD_TIERS.military[card.tier] || {};
      let milMove = milTier.move || 3;
      const milWonders = getPlayerWonders(player.id);
      if (milWonders.some((w) => w.name === "Pentagon")) milMove = 99;
      ui.remaining = milMove;
      ui.maxArmies = milTier.armies || 1;
      ui.armiesUsed = 0;
      ui.selectedUnit = null;
      ui.selectable.clear();
      logEntry(`${player.name} is moving armies (${milTier.name || "Military"}, range ${ui.remaining}, ${ui.maxArmies} army/armies).`);
    }

    renderActions();
    renderMap();
  }

  function finishCardAction() {
    if (!ui.activeCard) return;
    const player = getPlayer(localPlayerId);
    if (!player) return;

    const wasEconomy = ui.activeCard.type === "economy";
    const econEffects = (ui.activeCard.tierData || {}).effects || [];
    const canResolveExtra = wasEconomy && econEffects.includes("resolveExtra") && !ui.resolveExtraDone;

    const wonders = getPlayerWonders(player.id);
    const hasVenetianArsenal = wonders.some((w) => w.name === "Venetian Arsenal");
    const wasSlot5 = ui.activeCard.slot === 5 && !ui.activeCard.isResolveExtra && !ui.venetianArsenalDone;
    const canVenetianArsenal = hasVenetianArsenal && wasSlot5;

    dispatch({
      type: "RESOLVE_CARD",
      payload: {
        playerId: player.id,
        cardType: ui.activeCard.type,
        tradeSpent: ui.activeCard.tradeSpent
      }
    });

    if (canResolveExtra) {
      ui.resolveExtraDone = true;
      ui.activeCard = null;
      ui.mode = "economy-resolve-extra";
      ui.selectable.clear();
      ui.selectedUnit = null;
      logEntry("Capitalism: resolve another focus card as slot #1.");
      dom.actionPanel.innerHTML = `
        <div class="action-card">
          <div class="action-title">Capitalism: Resolve Extra Card (as Slot #1)</div>
          ${FOCUS_ORDER.filter((f) => f !== "economy").map((f) =>
            `<div class="action-row"><button class="btn resolve-extra-pick" data-type="${f}">${f}</button></div>`
          ).join("")}
          <div class="action-row"><button class="btn ghost" id="resolve-extra-skip">Skip</button></div>
        </div>
      `;
      document.querySelectorAll(".resolve-extra-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cardType = btn.dataset.type;
          const tier = player.cardTiers[cardType] || 1;
          const tierData = CARD_TIERS[cardType]?.[tier] || {};
          ui.activeCard = {
            type: cardType,
            slotIndex: 0,
            slot: 1,
            effectiveSlot: 1,
            tier,
            tierData,
            tradeSpent: 0,
            isResolveExtra: true
          };
          ui.mode = "inspect";
          ui.tradeLocked = true;
          startActionPhase();
        });
      });
      document.getElementById("resolve-extra-skip")?.addEventListener("click", () => {
        ui.activeCard = null;
        ui.mode = "inspect";
        ui.selectable.clear();
        ui.selectedUnit = null;
        ui.tradeLocked = false;
        renderActions();
        renderMap();
      });
      return;
    }

    if (canVenetianArsenal) {
      ui.venetianArsenalDone = true;
      const cardType = ui.activeCard.type;
      const tier = player.cardTiers[cardType] || 1;
      const tierData = CARD_TIERS[cardType]?.[tier] || {};
      ui.activeCard = {
        type: cardType,
        slotIndex: ui.activeCard.slotIndex,
        slot: 1,
        effectiveSlot: 1,
        tier,
        tierData,
        tradeSpent: 0,
        isResolveExtra: true
      };
      ui.mode = "inspect";
      ui.tradeLocked = true;
      logEntry(`Venetian Arsenal: re-resolve ${cardType} as slot #1.`);
      startActionPhase();
      return;
    }

    if (ui.estadioPendingCard) {
      const pending = ui.estadioPendingCard;
      ui.estadioPendingCard = null;
      ui.activeCard = null;
      ui.mode = "inspect";
      ui.selectable.clear();
      ui.selectedUnit = null;
      ui.tradeLocked = false;
      startCardAction(player, pending.cardType, pending.index);
      return;
    }

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
        const tierEffects = (ui.activeCard.tierData || {}).effects || [];
        if (tierEffects.includes("move1") && !ui.cultureMoveDone) {
          ui.mode = "culture-move";
          ui.cultureMoveDone = true;
          ui.selectable = new Set(validCultureMoveTargets(player.id));
          logEntry("Drama and Poetry: move 1 control token to empty adjacent space.");
          renderMap();
          return;
        }
        if (tierEffects.includes("extraControl") && !ui.cultureExtraDone) {
          ui.mode = "place-control";
          ui.cultureExtraDone = true;
          ui.remaining = 1;
          ui.selectable = new Set(validControlPlacementsNearFriendly(player.id, ui.activeCard.effectiveSlot));
          logEntry("Civil Service: place 1 extra control token adjacent to a friendly space.");
          renderMap();
          return;
        }
        if (tierEffects.includes("replaceRival") && !ui.cultureReplaceDone) {
          ui.mode = "culture-replace";
          ui.cultureReplaceDone = true;
          ui.selectable = new Set(validRivalReplaceTargets(player.id));
          logEntry("Mass Media: replace or flip 1 rival control token within 2 of friendly space.");
          renderMap();
          return;
        }
        finishCardAction();
      }
      ui.selectable = new Set(validControlPlacements(player.id, ui.activeCard.effectiveSlot));
      renderMap();
      return;
    }

    if (ui.mode === "culture-move") {
      if (!ui.selectable.has(key)) return;
      const hex = state.map.hexes[key];
      if (!hex) return;
      if (hex.control && hex.control.ownerId === player.id) {
        ui.cultureMoveFrom = key;
        const fromHex = state.map.hexes[key];
        const adjKeys = neighborsFromKey(key).filter((nk) => {
          const nh = state.map.hexes[nk];
          return nh && nh.active && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water";
        });
        ui.selectable = new Set(adjKeys);
        ui.mode = "culture-move-to";
        logEntry("Select empty adjacent space to move the token to.");
        renderMap();
      }
      return;
    }

    if (ui.mode === "culture-move-to") {
      if (!ui.selectable.has(key)) return;
      const fromHex = state.map.hexes[ui.cultureMoveFrom];
      if (fromHex && fromHex.control) {
        const controlData = { ...fromHex.control };
        fromHex.control = null;
        const toHex = state.map.hexes[key];
        toHex.control = controlData;
        logEntry(`Moved control token to ${key}.`);
      }
      finishCardAction();
      return;
    }

    if (ui.mode === "culture-replace") {
      if (!ui.selectable.has(key)) return;
      const hex = state.map.hexes[key];
      if (hex && hex.control && hex.control.ownerId !== player.id) {
        if (hex.control.fortified) {
          hex.control.fortified = false;
          logEntry("Mass Media: flipped rival reinforced token to unreinforced.");
        } else {
          hex.control = { ownerId: player.id, fortified: false, district: null };
          logEntry("Mass Media: replaced rival control token with yours.");
        }
      }
      finishCardAction();
      return;
    }

    if (ui.mode === "place-district") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "PLACE_DISTRICT", payload: { playerId: player.id, key, district: ui.districtType || "campus" } });
      const growthEffects = (ui.activeCard?.tierData || {}).effects || [];
      if (growthEffects.includes("globalDistrict") && !ui.globalDistrictDone) {
        ui.globalDistrictDone = true;
        resolvePlayerDistricts(player);
        logEntry("Globalization: triggered all district effects.");
      }
      if (growthEffects.includes("controlNearDistrict") && !ui.growthControlDone) {
        ui.growthControlDone = true;
        const targets = validControlNearDistricts(player.id);
        if (targets.length > 0) {
          ui.mode = "growth-control-near-district";
          ui.selectable = new Set(targets);
          logEntry("Engineering: place 1 control adjacent to any of your districts.");
          renderMap();
          return;
        }
      }
      afterGrowthAction(player);
      return;
    }

    if (ui.mode === "growth-control-near-district") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "PLACE_CONTROL", payload: { playerId: player.id, key } });
      afterGrowthAction(player);
      return;
    }

    if (ui.mode === "growth-extra-reinforce") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "TOGGLE_FORTIFY", payload: { playerId: player.id, key } });
      finishCardAction();
      renderMap();
      return;
    }

    if (ui.mode === "reinforce") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "TOGGLE_FORTIFY", payload: { playerId: player.id, key } });
      ui.remaining -= 1;
      if (ui.remaining <= 0) {
        const growthEffects = (ui.activeCard?.tierData || {}).effects || [];
        if (growthEffects.includes("extraReinforce") && !ui.growthExtraReinforceDone) {
          ui.growthExtraReinforceDone = true;
          const targets = validReinforceTargets(player.id);
          if (targets.length > 0) {
            ui.mode = "growth-extra-reinforce";
            ui.selectable = new Set(targets);
            logEntry("Bonus: reinforce 1 additional control token.");
            renderMap();
            return;
          }
        }
        finishCardAction();
      }
      renderMap();
      return;
    }

    if (ui.mode === "build-city") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "BUILD_CITY", payload: { playerId: player.id, key } });
      const indEffects = (ui.activeCard?.tierData || {}).effects || [];
      if (indEffects.includes("controlAfterCity") && !ui.industryControlDone) {
        ui.industryControlDone = true;
        const adjTargets = neighborsFromKey(key).filter((nk) => {
          const nh = state.map.hexes[nk];
          return nh && nh.active && nh.revealed && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water";
        });
        if (adjTargets.length > 0) {
          ui.mode = "industry-control-after-city";
          ui.selectable = new Set(adjTargets);
          logEntry("Urbanization: place 1 control adjacent to new city.");
          renderMap();
          return;
        }
      }
      finishCardAction();
      return;
    }

    if (ui.mode === "industry-control-after-city") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "PLACE_CONTROL", payload: { playerId: player.id, key } });
      finishCardAction();
      return;
    }

    if (ui.mode === "science-nuke") {
      if (!ui.selectable.has(key)) return;
      const hex = state.map.hexes[key];
      if (hex.barbarian) {
        hex.barbarian = null;
        logEntry(`Nuclear Power: destroyed barbarian at ${key}.`);
      } else if (hex.control && hex.control.ownerId !== player.id) {
        hex.control = null;
        logEntry(`Nuclear Power: destroyed rival control token at ${key}.`);
      }
      finishCardAction();
      return;
    }

    if (ui.mode === "build-wonder") {
      if (!ui.selectable.has(key)) return;
      dispatch({ type: "BUILD_WONDER", payload: { playerId: player.id, key, wonder: ui.selectedWonder || null } });
      ui.selectedWonder = null;
      finishCardAction();
      return;
    }

    if (ui.mode === "move-wagon") {
      handleMoveUnit("wagon", player, key);
      return;
    }

    if (ui.mode === "pre-combat" || ui.mode === "exchange-resource") {
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

  function showPreCombatUI() {
    const data = ui.combatData;
    if (!data) return;
    const player = getPlayer(data.attackerId);
    const defLabel = data.defender.type === "barbarian" ? "Barbarian" :
      data.defender.type === "citystate" ? "City-State" :
      data.defender.type === "city" ? "City" :
      data.defender.type === "control" ? "Control Token" : "Enemy";
    const renderCombat = () => {
      const spent = data.combatTradeSpent;
      const total = data.attackPower + spent;
      dom.actionPanel.innerHTML = `
        <div class="action-card">
          <div class="action-title">Combat: vs ${defLabel}</div>
          <div class="action-row dim">Base attack: ${data.attackPower} | Defense: ${data.defensePower}</div>
          <div class="action-row">
            <span>Spend military trade for +1 each: <strong>${spent}</strong> / ${data.maxCombatTrade}</span>
          </div>
          <div class="action-row">
            <button class="btn tiny" id="combat-trade-minus">-</button>
            <button class="btn tiny" id="combat-trade-plus">+</button>
          </div>
          <div class="action-row dim">Total attack power: <strong>${total}</strong></div>
          <div class="action-row">
            <button class="btn primary" id="combat-confirm">Fight!</button>
            <button class="btn ghost" id="combat-cancel">Cancel</button>
          </div>
        </div>
      `;
      document.getElementById("combat-trade-minus")?.addEventListener("click", () => {
        data.combatTradeSpent = Math.max(0, data.combatTradeSpent - 1);
        renderCombat();
      });
      document.getElementById("combat-trade-plus")?.addEventListener("click", () => {
        data.combatTradeSpent = Math.min(data.maxCombatTrade, data.combatTradeSpent + 1);
        renderCombat();
      });
      document.getElementById("combat-confirm")?.addEventListener("click", () => {
        if (player) {
          player.trade.military = Math.max(0, player.trade.military - data.combatTradeSpent);
        }
        dispatch({
          type: "ATTACK",
          payload: {
            attackerId: data.attackerId,
            attackerUnitId: data.attackerUnitId,
            key: data.key,
            attackPower: data.attackPower,
            defensePower: data.defensePower,
            defender: data.defender,
            combatTradeSpent: data.combatTradeSpent
          }
        });
        ui.combatData = null;
        ui.mode = "move-army";
        renderActions();
        renderMap();
      });
      document.getElementById("combat-cancel")?.addEventListener("click", () => {
        ui.combatData = null;
        ui.mode = "move-army";
        renderActions();
        renderMap();
      });
    };
    renderCombat();
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
      lines.push(`<div class="action-row"><span class="label">${hex.city.isCapital ? "Capital" : "City"}</span><span>${owner?.name || "?"} ${hex.city.developed ? "(Developed)" : ""} ${hex.city.wonder ? `(${hex.city.wonder.name})` : ""}</span></div>`);
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
      const fOwner = hex.city ? getPlayer(hex.city.ownerId) : null;
      const fStatus = fOwner ? `Controlled by ${fOwner.name}` : "Uncontrolled (Defense: 6)";
      lines.push(`<div class="action-row"><span class="label">Fortress</span><span>${fStatus}</span></div>`);
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

    const cardType = type === "army" ? "military" : "economy";
    const tierEffects = (CARD_TIERS[cardType]?.[ui.activeCard.tier] || {}).effects || [];
    const reachable = getReachable(startKey, ui.remaining, (hex) => canEnterHex(type, hex, player.id, ui.activeCard.effectiveSlot, tierEffects));
    ui.selectable = reachable;
    if (!reachable.has(key)) {
      renderMap();
      return;
    }

    if (type === "army") {
      const defender = findDefender(key, player.id);
      if (defender && defender.ownerId) {
        const hasNonAggression = player.diplomacy.some((d) => d.type === "non_aggression" && d.fromId === defender.ownerId);
        if (hasNonAggression) {
          logEntry(`Non-Aggression pact prevents attacking ${getPlayer(defender.ownerId)?.name}'s pieces.`);
          renderMap();
          return;
        }
      }
      if (defender) {
        const attackPower = ui.activeCard.effectiveSlot + (ui.activeCard.tradeSpent || 0);
        const defensePower = defenderDefensePower(defender, key);
        const totalMilTrade = player.trade.military || 0;
        if (totalMilTrade > 0) {
          ui.mode = "pre-combat";
          ui.combatData = {
            attackerId: player.id,
            attackerUnitId: unit.id,
            key,
            attackPower,
            defensePower,
            defender,
            combatTradeSpent: 0,
            maxCombatTrade: totalMilTrade
          };
          showPreCombatUI();
          return;
        }
        dispatch({
          type: "ATTACK",
          payload: {
            attackerId: player.id,
            attackerUnitId: unit.id,
            key,
            attackPower,
            defensePower,
            defender,
            combatTradeSpent: 0
          }
        });
      } else {
        dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: key } });
      }
    } else {
      dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: key } });
      const hex = state.map.hexes[key];
      if (hex.barbarian && tierEffects.includes("removeBarb")) {
        hex.barbarian = null;
        logEntry(`${player.name}'s caravan removed a barbarian (Currency).`);
      }
      if (hex.cityState) {
        let csTradeAmount = 2;
        const tradeWonders = getPlayerWonders(player.id);
        if (tradeWonders.some((w) => w.name === "Kilwa Kisiwani")) csTradeAmount += 1;
        dispatch({ type: "ADD_TRADE", payload: { playerId: player.id, cardType: hex.cityState.type, amount: csTradeAmount } });
        if (hex.cityState.diplomacyCards > 0) {
          hex.cityState.diplomacyCards -= 1;
          const csData = CITY_STATE_DATA[hex.cityState.name];
          dispatch({
            type: "ADD_DIPLOMACY",
            payload: {
              playerId: player.id,
              cardType: "city_state",
              fromCityState: hex.cityState.name
            }
          });
          logEntry(`${player.name} traded with ${hex.cityState.name} — gained diplomacy card.`);
        }
        const orghWonders = getPlayerWonders(player.id);
        if (orghWonders.some((w) => w.name === "Országház")) {
          const csName = hex.cityState?.name;
          hex.cityState = null;
          hex.city = { ownerId: player.id, isCapital: false, developed: false, wonder: null };
          logEntry(`Országház: conquered city-state ${csName} after trade!`);
        }
        dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: null } });
      } else if (hex.city && hex.city.ownerId !== player.id) {
        dispatch({ type: "ADD_TRADE", payload: { playerId: player.id, cardType: "economy", amount: 2 } });
        const rivalPlayer = getPlayer(hex.city.ownerId);
        if (rivalPlayer) {
          const availableCards = Object.keys(DIPLOMACY_CARDS).filter((ct) => {
            return !player.diplomacy.some((d) => d.type === ct && d.fromId === rivalPlayer.id);
          });
          if (availableCards.length > 0) {
            dispatch({
              type: "ADD_DIPLOMACY",
              payload: {
                playerId: player.id,
                cardType: availableCards[0],
                fromPlayerId: rivalPlayer.id
              }
            });
          }
          const glWonders = getPlayerWonders(player.id);
          if (glWonders.some((w) => w.name === "Great Library")) {
            FOCUS_ORDER.forEach((f) => {
              const rivalTier = rivalPlayer.cardTiers[f] || 1;
              const myTier = player.cardTiers[f] || 1;
              if (rivalTier > myTier && myTier < 4) {
                player.cardTiers[f] = rivalTier;
                logEntry(`Great Library: copied ${rivalPlayer.name}'s ${f} tier ${rivalTier}.`);
              }
            });
          }
          if (hex.city.isCapital) {
            const hasEmbassy = player.diplomacy.some((d) => d.type === "embassy" && d.fromId === rivalPlayer.id);
            if (hasEmbassy) {
              dispatch({ type: "ADD_TRADE", payload: { playerId: rivalPlayer.id, cardType: "economy", amount: 1 } });
              const resType = RESOURCE_TYPES.find((r) => player.resources[r] === 0) || RESOURCE_TYPES[0];
              player.resources[resType] = (player.resources[resType] || 0) + 1;
              logEntry(`Embassy: ${player.name} traded at ${rivalPlayer.name}'s capital — ${rivalPlayer.name} got +1 trade, ${player.name} got 1 ${resType}.`);
            }
          }
        }
        dispatch({ type: "MOVE_UNIT", payload: { playerId: player.id, unitType: type, unitId: unit.id, to: null } });
      }
    }

    const tradeHex = state.map.hexes[key];
    const didTrade = type === "wagon" && tradeHex && (tradeHex.cityState || (tradeHex.city && tradeHex.city.ownerId !== player.id));
    if (didTrade && tierEffects.includes("exchangeResource") && !ui.exchangeResourceDone) {
      const owned = RESOURCE_TYPES.filter((r) => player.resources[r] > 0);
      if (owned.length > 0) {
        ui.exchangeResourceDone = true;
        ui.mode = "exchange-resource";
        showExchangeResourceUI(player, owned);
        return;
      }
    }

    ui.selectable.clear();
    ui.selectedUnit = null;
    renderMap();
  }

  function showExchangeResourceUI(player, ownedResources) {
    const wanted = RESOURCE_TYPES.filter((r) => player.resources[r] === 0);
    if (wanted.length === 0) {
      ui.mode = "move-wagon";
      renderMap();
      return;
    }
    dom.actionPanel.innerHTML = `
      <div class="action-card">
        <div class="action-title">Steam Power: Exchange 1 Resource</div>
        <div class="action-row dim">Give one of yours:</div>
        ${ownedResources.map((r) => `<button class="btn tiny exchange-give" data-res="${r}">${r} (${player.resources[r]})</button>`).join(" ")}
        <div class="action-row dim">Receive:</div>
        ${wanted.map((r) => `<button class="btn tiny exchange-get" data-res="${r}" disabled>${r}</button>`).join(" ")}
        <div class="action-row">
          <button class="btn primary" id="exchange-confirm" disabled>Confirm</button>
          <button class="btn ghost" id="exchange-skip">Skip</button>
        </div>
      </div>
    `;
    let giveRes = null;
    let getRes = null;
    const updateBtns = () => {
      document.querySelectorAll(".exchange-give").forEach((b) => b.classList.toggle("primary", b.dataset.res === giveRes));
      document.querySelectorAll(".exchange-get").forEach((b) => {
        b.disabled = !giveRes;
        b.classList.toggle("primary", b.dataset.res === getRes);
      });
      const confirmBtn = document.getElementById("exchange-confirm");
      if (confirmBtn) confirmBtn.disabled = !(giveRes && getRes);
    };
    document.querySelectorAll(".exchange-give").forEach((btn) => {
      btn.addEventListener("click", () => { giveRes = btn.dataset.res; updateBtns(); });
    });
    document.querySelectorAll(".exchange-get").forEach((btn) => {
      btn.addEventListener("click", () => { getRes = btn.dataset.res; updateBtns(); });
    });
    document.getElementById("exchange-confirm")?.addEventListener("click", () => {
      if (giveRes && getRes) {
        player.resources[giveRes] = Math.max(0, player.resources[giveRes] - 1);
        player.resources[getRes] = (player.resources[getRes] || 0) + 1;
        logEntry(`Steam Power: exchanged 1 ${giveRes} for 1 ${getRes}.`);
      }
      ui.mode = "move-wagon";
      ui.selectable.clear();
      ui.selectedUnit = null;
      renderActions();
      renderMap();
    });
    document.getElementById("exchange-skip")?.addEventListener("click", () => {
      ui.mode = "move-wagon";
      ui.selectable.clear();
      ui.selectedUnit = null;
      renderActions();
      renderMap();
    });
  }

  function findDefender(key, attackerId) {
    const hex = state.map.hexes[key];
    if (!hex) return null;
    if (hex.barbarian) return { type: "barbarian" };
    if (hex.cityState) return { type: "citystate" };
    if (hex.fortress && !hex.city) return { type: "fortress" };
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
    if (defender.type === "citystate") return DEFAULTS.cityStateDefense;
    if (defender.type === "fortress") return 6;
    if (defender.type === "control") return terrainDifficulty(hex.terrain) + fortifiedBonus(key, hex.control?.ownerId);
    if (defender.type === "city") return terrainDifficulty(hex.terrain) * 2 + fortifiedBonus(key, hex.city?.ownerId);
    return terrainDifficulty(hex.terrain);
  }

  function fortifiedBonus(key, ownerId) {
    let bonus = 0;
    neighborsFromKey(key).forEach((neighborKey) => {
      const neighbor = state.map.hexes[neighborKey];
      if (neighbor?.control?.fortified && (!ownerId || neighbor.control.ownerId === ownerId)) bonus += 1;
    });
    return bonus;
  }

  function validControlPlacements(playerId, maxTerrain, allowReplace) {
    const hasChichenItza = getPlayerWonders(playerId).some((w) => w.name === "Chichen Itza");
    const player = getPlayer(playerId);
    const hasKumasi = (player?.cityStateTokens || []).includes("Kumasi");
    const hasMohenjoDaro = (player?.cityStateTokens || []).includes("Mohenjo Daro");
    return Object.values(state.map.hexes)
      .filter((hex) => {
        if (!hex.active) return false;
        if (!hex.revealed) return false;
        if (hex.terrain === "water") return false;
        if (hex.city || hex.cityState || hex.barbarian) return false;
        if (hex.fortress && !hex.city) return false;
        if (hex.control && !allowReplace) return false;
        let td = terrainDifficulty(hex.terrain);
        if (hasKumasi && hex.terrain === "forest") td = 1;
        if (hasMohenjoDaro) td = Math.max(1, td - 1);
        if (td <= maxTerrain && isWithinRangeOfFriendlyCity(hex, playerId, maxTerrain)) return true;
        if (hasChichenItza && hex.terrain === "forest" && !isAdjacentToFriendlyCity(hex, playerId)) return true;
        return false;
      })
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function isWithinRangeOfFriendlyCity(hex, playerId, range) {
    const player = getPlayer(playerId);
    const hasAntananarivo = (player?.cityStateTokens || []).includes("Antananarivo");
    return Object.values(state.map.hexes).some((candidate) => {
      if (candidate.city && candidate.city.ownerId === playerId) {
        return hexDistance(candidate, hex) <= range;
      }
      if (hasAntananarivo && candidate.cityState && candidate.cityState.name === "Antananarivo") {
        return hexDistance(candidate, hex) <= range;
      }
      return false;
    });
  }

  function validReinforceTargets(playerId) {
    return Object.values(state.map.hexes)
      .filter((hex) => hex.control && hex.control.ownerId === playerId)
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validNukeTargets(playerId) {
    const cityKeys = Object.keys(state.map.hexes).filter((key) => {
      const hex = state.map.hexes[key];
      return hex && hex.city && hex.city.ownerId === playerId;
    });
    const targets = new Set();
    Object.keys(state.map.hexes).forEach((key) => {
      const hex = state.map.hexes[key];
      if (!hex || !hex.active) return;
      const isTarget = (hex.barbarian) || (hex.control && hex.control.ownerId !== playerId);
      if (!isTarget) return;
      const inRange = cityKeys.some((ck) => {
        const cHex = state.map.hexes[ck];
        return hexDistance(cHex, hex) <= 3;
      });
      if (inRange) targets.add(key);
    });
    return [...targets];
  }

  function afterGrowthAction(player) {
    const growthEffects = (ui.activeCard?.tierData || {}).effects || [];
    if (growthEffects.includes("extraReinforce") && !ui.growthExtraReinforceDone) {
      ui.growthExtraReinforceDone = true;
      const targets = validReinforceTargets(player.id);
      if (targets.length > 0) {
        ui.mode = "growth-extra-reinforce";
        ui.selectable = new Set(targets);
        logEntry("Bonus: reinforce 1 additional control token.");
        renderMap();
        return;
      }
    }
    finishCardAction();
  }

  function validControlNearDistricts(playerId) {
    const districtKeys = Object.keys(state.map.hexes).filter((key) => {
      const hex = state.map.hexes[key];
      return hex && hex.control && hex.control.ownerId === playerId && hex.control.district;
    });
    const targets = new Set();
    districtKeys.forEach((dk) => {
      neighborsFromKey(dk).forEach((nk) => {
        const nh = state.map.hexes[nk];
        if (nh && nh.active && nh.revealed && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water") {
          targets.add(nk);
        }
      });
    });
    return [...targets];
  }

  function validCultureMoveTargets(playerId) {
    return Object.keys(state.map.hexes).filter((key) => {
      const hex = state.map.hexes[key];
      if (!hex || !hex.active || !hex.control || hex.control.ownerId !== playerId) return false;
      return neighborsFromKey(key).some((nk) => {
        const nh = state.map.hexes[nk];
        return nh && nh.active && !nh.control && !nh.city && !nh.cityState && !nh.barbarian && nh.terrain !== "water";
      });
    });
  }

  function validControlPlacementsNearFriendly(playerId, maxTerrain) {
    return Object.keys(state.map.hexes).filter((key) => {
      const hex = state.map.hexes[key];
      if (!hex || !hex.active || !hex.revealed) return false;
      if (hex.terrain === "water") return false;
      if (terrainDifficulty(hex.terrain) > maxTerrain) return false;
      if (hex.city || hex.cityState || hex.barbarian || hex.control) return false;
      return neighborsFromKey(key).some((nk) => {
        const nh = state.map.hexes[nk];
        if (!nh) return false;
        if (nh.city && nh.city.ownerId === playerId) return true;
        if (nh.control && nh.control.ownerId === playerId) return true;
        return false;
      });
    });
  }

  function validRivalReplaceTargets(playerId) {
    const friendlyKeys = new Set();
    Object.keys(state.map.hexes).forEach((key) => {
      const hex = state.map.hexes[key];
      if (!hex) return;
      if ((hex.city && hex.city.ownerId === playerId) || (hex.control && hex.control.ownerId === playerId)) {
        friendlyKeys.add(key);
      }
    });
    return Object.keys(state.map.hexes).filter((key) => {
      const hex = state.map.hexes[key];
      if (!hex || !hex.active || !hex.control || hex.control.ownerId === playerId) return false;
      const hexObj = hex;
      return [...friendlyKeys].some((fk) => {
        const fHex = state.map.hexes[fk];
        return fHex && hexDistance(fHex, hexObj) <= 2;
      });
    });
  }

  function validCityPlacements(playerId, maxTerrain, range, allowOnUnit) {
    const cityRange = range || 2;
    const hasGreatLighthouse = getPlayerWonders(playerId).some((w) => w.name === "Great Lighthouse");
    const player = getPlayer(playerId);
    const hasAuckland = (player?.cityStateTokens || []).includes("Auckland");
    const mapRadius = state.map.radius || 5;
    return Object.values(state.map.hexes)
      .filter((hex) => {
        if (!hex.active) return false;
        if (!hex.revealed) return false;
        if (hex.terrain === "water") return false;
        let td = terrainDifficulty(hex.terrain);
        if (hasAuckland && neighbors(hex.q, hex.r).some((nk) => { const nh = state.map.hexes[nk]; return nh && nh.terrain === "water"; })) {
          td = 1;
        }
        if (td > maxTerrain) return false;
        if (hex.city || hex.cityState || hex.barbarian || hex.fortress) return false;
        if (adjacentToCity(hex)) return false;
        const key = keyFrom(hex.q, hex.r);
        const inRange = isWithinRangeOfFriendly(hex, playerId, cityRange);
        if (inRange) return true;
        if (allowOnUnit) {
          const hasOwnUnit = getUnitsAt(key).some((u) => u.playerId === playerId);
          if (hasOwnUnit) return true;
        }
        if (hasGreatLighthouse) {
          const isEdge = Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(hex.q + hex.r) >= mapRadius * 2 - 1;
          if (isEdge) return true;
        }
        return false;
      })
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validWonderPlacements(playerId) {
    return Object.values(state.map.hexes)
      .filter((hex) => hex.city && hex.city.ownerId === playerId && !hex.city.wonder)
      .map((hex) => keyFrom(hex.q, hex.r));
  }

  function validFortressPlacements() {
    return Object.values(state.map.hexes)
      .filter((hex) => !hex.active)
      .filter((hex) => {
        const nKeys = neighbors(hex.q, hex.r);
        let coreNeighborCount = 0;
        let touchesFortress = false;
        let touchesCityState = false;
        nKeys.forEach((nk) => {
          const nh = state.map.hexes[nk];
          if (!nh || !nh.active) return;
          if (nh.core || nh.coreAdjacent) coreNeighborCount++;
          if (nh.fortress) touchesFortress = true;
          if (nh.cityState) touchesCityState = true;
        });
        return coreNeighborCount >= 2 && !touchesFortress && !touchesCityState;
      })
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
    return neighbors(hex.q, hex.r).some((key) => {
      const n = state.map.hexes[key];
      return n && (n.city || (n.fortress && !n.city) || n.cityState);
    });
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

  function canEnterHex(type, hex, playerId, maxTerrain, tierEffects) {
    if (!hex.active) return false;
    const effects = tierEffects || [];
    const canWater = effects.includes("throughWater");
    if (hex.terrain === "water" && !canWater) return false;
    if (hex.terrain !== "water" && terrainDifficulty(hex.terrain) > maxTerrain) return false;
    if (type === "wagon") {
      if (hex.barbarian && !effects.includes("removeBarb")) return false;
    }
    if (type === "army") {
      if (hex.control && hex.control.ownerId !== playerId && !hex.control.fortified) {
        const player = getPlayer(playerId);
        const hasAkkad = (player?.cityStateTokens || []).includes("Akkad");
        if (effects.includes("throughTokens") || hasAkkad) return true;
      }
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
    const ownerId = hex.city.ownerId;
    const player = getPlayer(ownerId);
    const hasSydneyOperaHouse = getPlayerWonders(ownerId).some((w) => w.name === "Sydney Opera House");
    const openBorderIds = new Set();
    if (player) {
      player.diplomacy.forEach((d) => {
        if (d.type === "open_borders" && d.fromId) openBorderIds.add(d.fromId);
      });
    }
    return neighbors(hex.q, hex.r).every((key) => {
      const neighbor = state.map.hexes[key];
      if (!neighbor) return true;
      if (neighbor.terrain === "water") return true;
      if (neighbor.control && neighbor.control.ownerId === ownerId) return true;
      if (hasSydneyOperaHouse && neighbor.control) return true;
      if (neighbor.control && openBorderIds.has(neighbor.control.ownerId)) return true;
      if (neighbor.city && openBorderIds.has(neighbor.city.ownerId)) return true;
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
        changes.city = { ownerId: owner, isCapital: false, developed: false, wonder: null };
      }
    }
    if (mode === "capital") {
      if (hex.city && hex.city.isCapital) {
        changes.city = null;
      } else {
        changes.city = { ownerId: owner, isCapital: true, developed: false, wonder: null };
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

  const TOKEN_ICONS = {
    city: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 21V7l5-4 5 4v2h8v12H3zm2-2h2v-2H5v2zm0-4h2v-2H5v2zm0-4h2V9H5v2zm5 8h2v-2h-2v2zm0-4h2v-2h-2v2zm0-4h2V9h-2v2zm6 8h2v-2h-2v2zm0-4h2v-2h-2v2z"/></svg>`,
    capital: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z"/></svg>`,
    control: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`,
    fortified: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/></svg>`,
    district: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    army: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l-2 4H4l2 4-2 4h6l2 4 2-4h6l-2-4 2-4h-6z"/></svg>`,
    wagon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3C2 4 1 5 1 6v11h2c0 1.7 1.3 3 3 3s3-1.3 3-3h6c0 1.7 1.3 3 3 3s3-1.3 3-3h2v-5l-3-4zM6 18.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg>`,
    barbarian: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 15l-5-5 1.4-1.4L11 14.2l7.6-7.6L20 8l-9 9z" transform="rotate(45 12 12)"/><path d="M5 5l14 14M5 19L19 5" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>`,
    citystate: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>`,
    resource: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.3l.7.7L12 18l6.8 3 .7-.7z"/></svg>`,
    fortress: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 8V4h-3v2h-2V4h-4v2H10V4H6v4H4v14h16V8h-3zm-9-2h0zm0 0h0zM6 8h3v2H6V8zm0 4h3v2H6v-2zm0 6v-2h3v2H6zm9 0h-3v-2h3v2zm0-4h-3v-2h3v2zm0-4h-3V8h3v2zm3 8h-1v-2h1v2zm0-4h-1v-2h1v2zm0-4h-1V8h1v2z"/></svg>`,
    wonder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm3.5-2L12 5.5 19.5 19H4.5z"/><path d="M11 15h2v2h-2zm0-6h2v5h-2z"/></svg>`
  };

  function tokenSpan(type, label, color) {
    const style = color ? ` style="--player-color:${color}"` : "";
    let iconKey = type;
    let cssClass = type;
    if (type === "control" && label && label.startsWith("Reinforced")) {
      iconKey = "fortified";
      cssClass = "control fortified";
    }
    const svg = TOKEN_ICONS[iconKey] || TOKEN_ICONS[type] || "";
    const tooltip = label || type;
    return `<span class="token ${cssClass}" title="${tooltip}"${style}>${svg}</span>`;
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
