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
    mapRadius: 6,
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

  function createState(hostPlayer) {
    const map = buildMap(CFG.mapRadius);
    const st = {
      phase: "playing",
      map,
      players: [hostPlayer],
      turn: { order: [hostPlayer.id], index: 0, round: 1 },
      eventWheel: { position: 0, events: EVENTS.slice() },
      lastCombat: null,
      winner: null,
      log: []
    };
    placeCapital(st, hostPlayer.id, 0);
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

  function buildMap(radius) {
    const hexes = {};
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.abs(q + r) > radius) continue;
        hexes[key(q, r)] = {
          q, r,
          terrain: randomTerrain(),
          revealed: true,
          resource: null,
          cityState: null,
          barbarian: false,
          control: null,
          city: null
        };
      }
    }
    scatterFeatures(hexes);
    return { radius, hexes };
  }

  function scatterFeatures(hexes) {
    const land = Object.keys(hexes).filter((k) => hexes[k].terrain !== "water");
    const picks1 = pickRandom(land, 8);
    picks1.forEach((k, i) => { hexes[k].resource = RESOURCES[i % RESOURCES.length]; });
    const remaining = land.filter((k) => !hexes[k].resource);
    const picks2 = pickRandom(remaining, 6);
    picks2.forEach((k, i) => {
      hexes[k].cityState = { name: CITY_NAMES[i % CITY_NAMES.length], type: FOCUS_TYPES[i % FOCUS_TYPES.length] };
    });
    const barbCandidates = remaining.filter((k) => !hexes[k].cityState);
    const picks3 = pickRandom(barbCandidates, 5);
    picks3.forEach((k) => { hexes[k].barbarian = true; });
  }

  const START_POSITIONS = [
    (r) => key(-r + 1, 0),
    (r) => key(r - 1, 0),
    (r) => key(0, -r + 1),
    (r) => key(0, r - 1)
  ];

  function placeCapital(st, playerId, posIndex) {
    const pos = START_POSITIONS[posIndex % START_POSITIONS.length](st.map.radius);
    const hex = st.map.hexes[pos];
    if (!hex) return;
    hex.terrain = "grass";
    hex.city = { ownerId: playerId, isCapital: true, developed: false, hasWonder: false };
    hex.resource = null;
    hex.cityState = null;
    hex.barbarian = false;
    hex.control = null;
    const player = st.players.find((p) => p.id === playerId);
    if (player) {
      player.armies.forEach((u) => { if (!u.position) u.position = pos; });
      player.wagons.forEach((u) => { if (!u.position) u.position = pos; });
    }
  }

  function applyAction(st, action) {
    const { type, payload } = action;

    if (type === "ADD_PLAYER") {
      if (st.players.find((p) => p.id === payload.id)) return st;
      st.players.push(payload);
      st.turn.order.push(payload.id);
      placeCapital(st, payload.id, st.players.length - 1);
      log(st, `${payload.name} joined.`);
      return st;
    }

    if (type === "SELECT_CARD") return st;

    if (type === "PLAY_CULTURE") {
      const player = getPlayer(st, payload.playerId);
      if (!player) return st;
      payload.hexKeys.forEach((k) => {
        const hex = st.map.hexes[k];
        if (!hex) return;
        if (hex.resource) {
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
      if (hex) {
        hex.control = { ownerId: payload.playerId, fortified: false, district: payload.district };
      }
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
        if (hex && hex.control && hex.control.ownerId === payload.playerId) {
          hex.control.fortified = true;
        }
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
      if (unit) {
        unit.position = payload.toKey;
        log(st, `${player.name} moved army.`);
      }
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

      st.lastCombat = {
        attacker: player.name,
        defender: payload.defenderLabel,
        atkRoll, defRoll, atkTotal, defTotal, win
      };

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

  function resolveCard(st, player, cardType, tradeSpent) {
    const idx = player.focusRow.indexOf(cardType);
    if (idx >= 0) {
      player.focusRow.splice(idx, 1);
      player.focusRow.unshift(cardType);
    }
    if (tradeSpent > 0) {
      player.trade[cardType] = Math.max(0, player.trade[cardType] - tradeSpent);
    }
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
        return h.terrain !== "water" && !h.city && !h.cityState && !h.barbarian && !h.control;
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
        const tq = hex.q + dir.dq;
        const tr = hex.r + dir.dr;
        const tk = key(tq, tr);
        const target = st.map.hexes[tk];
        if (!target || target.terrain === "water") return;
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
          if (h.control && h.control.ownerId === player.id && h.control.district) {
            counts[h.control.district]++;
          }
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

    if (evt === "gov_change") {
      log(st, "Players may reassign gov markers.");
    }

    if (evt === "wonder_aging") {
      let wc = 0;
      Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.hasWonder) wc++; });
      if (wc) log(st, `${wc} wonder(s) on the map.`);
    }
  }

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

  function countControl(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => { if (h.control && h.control.ownerId === playerId) c++; });
    return c;
  }

  function countWonders(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.hasWonder) c++; });
    return c;
  }

  function countDeveloped(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId && h.city.developed) c++; });
    return c;
  }

  function countCities(st, playerId) {
    let c = 0;
    Object.values(st.map.hexes).forEach((h) => { if (h.city && h.city.ownerId === playerId) c++; });
    return c;
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
    const base = FOCUS_SLOTS[idx];
    const bonus = player.govBonus[cardType] || 0;
    return Math.min(5, base + bonus);
  }

  function getSlotIndex(player, cardType) {
    return player.focusRow.indexOf(cardType);
  }

  function validControlHexes(st, playerId, maxTerrain) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.terrain === "water") return;
      if (TERRAIN[h.terrain] > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian) return;
      if (h.control) return;
      if (!withinRangeOfCity(st, h, playerId, maxTerrain)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validDistrictHexes(st, playerId, maxTerrain) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.terrain === "water") return;
      if (TERRAIN[h.terrain] > maxTerrain) return;
      if (h.city || h.cityState || h.barbarian) return;
      if (h.control) return;
      if (!adjacentToFriendlyCity(st, h, playerId)) return;
      valid.push(k);
    });
    return new Set(valid);
  }

  function validReinforceHexes(st, playerId) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.control && h.control.ownerId === playerId && !h.control.fortified) valid.push(k);
    });
    return new Set(valid);
  }

  function validCityHexes(st, playerId, production) {
    const valid = [];
    Object.entries(st.map.hexes).forEach(([k, h]) => {
      if (h.terrain === "water") return;
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
        if (!h) return;
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
    if (h.city && h.city.ownerId !== attackerId) {
      return { type: "city", label: "City", power: TERRAIN[h.terrain] * 2 };
    }
    for (const p of st.players) {
      if (p.id === attackerId) continue;
      for (const u of p.armies) {
        if (u.position === hexKey) return { type: "army", label: `${p.name}'s Army`, power: 3, ownerId: p.id, unitId: u.id };
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
      const n = st.map.hexes[nk];
      return n && n.city && n.city.ownerId === playerId;
    });
  }

  function adjacentToAnyCity(st, hex) {
    return hexNeighborKeys(hex.q, hex.r).some((nk) => {
      const n = st.map.hexes[nk];
      return n && n.city;
    });
  }

  function withinRangeOfFriendly(st, hex, playerId, range) {
    return Object.values(st.map.hexes).some((h) => {
      if (h.city && h.city.ownerId === playerId) return hexDist(h, hex) <= range;
      if (h.control && h.control.ownerId === playerId) return hexDist(h, hex) <= range;
      return false;
    });
  }

  // Hex utilities
  function key(q, r) { return `${q},${r}`; }
  function parseQ(k) { return parseInt(k.split(",")[0]); }
  function parseR(k) { return parseInt(k.split(",")[1]); }
  function hexNeighborKeys(q, r) {
    return HEX_DIRS.map((d) => key(q + d.dq, r + d.dr));
  }
  function hexDist(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
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

  function pickRandom(arr, n) {
    const copy = arr.slice();
    const result = [];
    while (copy.length && result.length < n) {
      const i = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(i, 1)[0]);
    }
    return result;
  }

  function rollDie() { return Math.floor(Math.random() * 6) + 1; }
  function log(st, msg) { st.log.push(msg); }

  return {
    TERRAIN, TERRAIN_LABELS, FOCUS_TYPES, FOCUS_LABELS, FOCUS_SLOTS, FOCUS_TRADE_DESC,
    DISTRICTS, DISTRICT_LABELS, DISTRICT_EFFECTS, RESOURCES, EVENTS, EVENT_LABELS, CFG,
    createState, createPlayer, applyAction, currentPlayer, getPlayer,
    getSlotValue, getSlotIndex, computeScore,
    validControlHexes, validDistrictHexes, validReinforceHexes,
    validCityHexes, validWonderHexes, getReachable, findDefender, getUnitsAt,
    countControl, countWonders, countDeveloped, countCities, findCapital,
    hexNeighborKeys, parseQ, parseR, key, hexDist, rollDie
  };
})();
