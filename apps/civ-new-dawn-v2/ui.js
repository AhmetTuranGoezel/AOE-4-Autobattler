"use strict";

const UI = (() => {
  let state = null;
  let localPlayerId = null;
  let hexEls = new Map();

  const sub = {
    phase: "idle",
    cardType: null,
    tradeSpent: 0,
    remaining: 0,
    validHexes: new Set(),
    selectedUnit: null,
    districtType: null,
    spentResources: {}
  };

  const dom = {};

  function init() {
    dom.lobby = document.getElementById("lobby");
    dom.game = document.getElementById("game");
    dom.lobbyStatus = document.getElementById("lobby-status");
    dom.inpName = document.getElementById("inp-name");
    dom.inpColor = document.getElementById("inp-color");
    dom.inpJoin = document.getElementById("inp-join");
    dom.hdrRoom = document.getElementById("hdr-room");
    dom.hdrRound = document.getElementById("hdr-round");
    dom.hdrTurn = document.getElementById("hdr-turn");
    dom.players = document.getElementById("players");
    dom.victoryTracker = document.getElementById("victory-tracker");
    dom.myStats = document.getElementById("my-stats");
    dom.map = document.getElementById("map");
    dom.mapTooltip = document.getElementById("map-tooltip");
    dom.wizard = document.getElementById("wizard");
    dom.eventWheel = document.getElementById("event-wheel");
    dom.gameLog = document.getElementById("game-log");
    dom.focusRow = document.getElementById("focus-row");

    document.getElementById("btn-local").addEventListener("click", startLocal);
    document.getElementById("btn-create").addEventListener("click", startCreate);
    document.getElementById("btn-join").addEventListener("click", startJoin);

    Net.init({
      onState: (payload) => {
        if (Net.getIsHost()) {
          dispatch(payload);
        } else {
          state = payload;
          render();
        }
      },
      onJoin: (peerId, name, color) => {
        const player = Game.createPlayer(peerId, name, color);
        state = Game.applyAction(state, { type: "ADD_PLAYER", payload: player });
        Net.broadcast(state);
        render();
      },
      onDisconnect: () => {},
      onConnected: (peerId) => {
        if (Net.getIsHost() && state) Net.broadcast(state);
      }
    });
  }

  function startLocal() {
    Net.startLocal();
    localPlayerId = "local";
    const name = dom.inpName.value.trim() || "Player";
    const color = dom.inpColor.value;
    state = Game.createState(Game.createPlayer(localPlayerId, name, color));
    showGame();
    render();
  }

  function startCreate() {
    const name = dom.inpName.value.trim() || "Host";
    const color = dom.inpColor.value;
    dom.lobbyStatus.textContent = "Creating room...";
    Net.createRoom((id) => {
      localPlayerId = id;
      state = Game.createState(Game.createPlayer(id, name, color));
      dom.hdrRoom.textContent = `Room: ${id}`;
      showGame();
      render();
    });
  }

  function startJoin() {
    const code = dom.inpJoin.value.trim();
    if (!code) { dom.lobbyStatus.textContent = "Enter a room code."; return; }
    const name = dom.inpName.value.trim() || "Player";
    const color = dom.inpColor.value;
    dom.lobbyStatus.textContent = "Connecting...";
    Net.joinRoom(code, name, color, (id) => {
      localPlayerId = id;
      dom.hdrRoom.textContent = `Room: ${code}`;
      showGame();
    });
  }

  function showGame() {
    dom.lobby.classList.add("hidden");
    dom.game.classList.remove("hidden");
  }

  function dispatch(action) {
    if (!state) return;
    if (Net.getIsHost()) {
      state = Game.applyAction(state, action);
      Net.broadcast(state);
      render();
    } else {
      Net.sendAction(action);
    }
  }

  function render() {
    if (!state) return;
    renderHeader();
    renderPlayers();
    renderVictoryTracker();
    renderMyStats();
    renderMap();
    renderWizard();
    renderEventWheel();
    renderLog();
    renderFocusRow();
    renderGameOver();
  }

  function renderHeader() {
    const cp = Game.currentPlayer(state);
    dom.hdrRound.textContent = `Round ${state.turn.round}/${Game.CFG.maxRounds}`;
    dom.hdrTurn.textContent = cp ? (cp.id === localPlayerId ? "Your Turn" : `${cp.name}'s Turn`) : "";
    dom.hdrTurn.style.color = cp ? cp.color : "";
  }

  function renderPlayers() {
    const cp = Game.currentPlayer(state);
    dom.players.innerHTML = state.players.map((p) => {
      const active = cp && cp.id === p.id ? " active" : "";
      const ctrl = Game.countControl(state, p.id);
      const cities = Game.countCities(state, p.id);
      const dev = Game.countDeveloped(state, p.id);
      const wonders = Game.countWonders(state, p.id);
      const score = Game.computeScore(state, p.id);
      return `<div class="player-card${active}">
        <div class="pname"><span class="dot" style="background:${p.color}"></span>${p.name}</div>
        <div class="pstats">Cities: ${cities} | Dev: ${dev} | Ctrl: ${ctrl} | W: ${wonders} | Score: ${score}</div>
      </div>`;
    }).join("");
  }

  function renderVictoryTracker() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.victoryTracker.innerHTML = ""; return; }
    const ctrl = Game.countControl(state, me.id);
    const wonders = Game.countWonders(state, me.id);
    const dev = Game.countDeveloped(state, me.id);
    const rows = [
      { label: "Military", val: ctrl, max: Game.CFG.victoryMilitary, color: "#ef5350" },
      { label: "Science", val: me.tech, max: Game.CFG.victoryScience, color: "#4fc3f7" },
      { label: "Culture", val: wonders, max: Game.CFG.victoryCulture, color: "#ce93d8" },
      { label: "Economy", val: dev, max: Game.CFG.victoryEconomy, color: "#ffd54f" }
    ];
    dom.victoryTracker.innerHTML = `<h3>Victory Progress</h3>` + rows.map((r) => {
      const pct = Math.min(100, (r.val / r.max) * 100);
      return `<div class="vtrack-row">
        <span class="vlabel">${r.label}</span>
        <div class="vtrack-bar"><div class="vtrack-fill" style="width:${pct}%;background:${r.color}"></div></div>
        <span class="vtrack-val">${r.val}/${r.max}</span>
      </div>`;
    }).join("");
  }

  function renderMyStats() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.myStats.innerHTML = ""; return; }
    const res = Object.entries(me.resources).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(", ") || "none";
    const gov = me.govMarkers.length ? me.govMarkers.map((m) => Game.FOCUS_LABELS[m]).join(", ") : "none";
    dom.myStats.innerHTML = `<h3>My Stats</h3>
      <div class="stat-grid">
        <span>Tech:</span><span class="sv">${me.tech}/${Game.CFG.techWheelSize} (T${me.techTier})</span>
        <span>Armies:</span><span class="sv">${me.armies.length}/${Game.CFG.maxArmies}</span>
        <span>Wagons:</span><span class="sv">${me.wagons.length}/${Game.CFG.maxWagons}</span>
        <span>Resources:</span><span class="sv">${res}</span>
        <span>Gov:</span><span class="sv">${gov}</span>
      </div>`;
  }

  function renderMap() {
    if (!state) return;
    const hexes = state.map.hexes;
    if (hexEls.size === 0) buildMapDom();

    Object.entries(hexes).forEach(([k, h]) => {
      const el = hexEls.get(k);
      if (!el) return;
      el.className = "hex";
      if (h.terrain === "water" && !h.revealed) el.classList.add("fog");
      else el.classList.add(`terrain-${h.terrain}`);
      if (sub.validHexes.has(k)) el.classList.add("valid");

      let content = "";
      if (h.city) {
        const owner = Game.getPlayer(state, h.city.ownerId);
        const label = h.city.isCapital ? "CAP" : "CTY";
        const extra = h.city.hasWonder ? "+W" : "";
        content += `<span class="hex-token city" style="color:${owner ? owner.color : "#fff"}">${label}${extra}</span>`;
      }
      if (h.control) {
        const owner = Game.getPlayer(state, h.control.ownerId);
        const label = h.control.district ? h.control.district.slice(0, 3).toUpperCase() : "●";
        const cls = h.control.district ? "dist" : "ctrl";
        content += `<span class="hex-token ${cls}" style="border-color:${owner ? owner.color : "#fff"};color:${owner ? owner.color : "#fff"}">${label}</span>`;
      }
      if (h.barbarian) content += `<span class="hex-token barb">☠</span>`;
      if (h.cityState) content += `<span class="hex-token cs">${h.cityState.name.slice(0, 3)}</span>`;
      if (h.resource) content += `<span class="hex-token res">${h.resource.slice(0, 3)}</span>`;

      const units = Game.getUnitsAt(state, k);
      units.forEach((u) => {
        const icon = u.type === "army" ? "⚔" : "🛒";
        const cls = u.type === "army" ? "army" : "wagon";
        content += `<span class="hex-token ${cls}" style="color:${u.color}">${icon}</span>`;
      });

      el.querySelector(".hex-content").innerHTML = content;
    });
  }

  function buildMapDom() {
    dom.map.innerHTML = "";
    hexEls.clear();
    const size = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hex-size"));
    const h = size * 1.155;
    const w = size;
    const radius = state.map.radius;

    Object.entries(state.map.hexes).forEach(([k, hex]) => {
      const el = document.createElement("div");
      el.className = "hex";
      el.innerHTML = `<div class="hex-content"></div>`;
      const px = (hex.q + radius) * (w * 0.88) + (hex.r + radius) * (w * 0.44);
      const py = (hex.r + radius) * (h * 0.77);
      el.style.left = `${px + 20}px`;
      el.style.top = `${py + 20}px`;
      el.addEventListener("click", () => handleHexClick(k));
      el.addEventListener("mouseenter", (e) => showTooltip(e, k));
      el.addEventListener("mouseleave", hideTooltip);
      dom.map.appendChild(el);
      hexEls.set(k, el);
    });

    const maxX = (radius * 2 + 1) * (w * 0.88) + radius * (w * 0.44) + 80;
    const maxY = (radius * 2 + 1) * (h * 0.77) + 80;
    dom.map.style.width = `${maxX}px`;
    dom.map.style.height = `${maxY}px`;
  }

  function showTooltip(e, hexKey) {
    const h = state.map.hexes[hexKey];
    if (!h) return;
    let lines = [`<strong>${Game.TERRAIN_LABELS[h.terrain]}</strong> (difficulty ${Game.TERRAIN[h.terrain]})`];
    if (h.city) {
      const owner = Game.getPlayer(state, h.city.ownerId);
      lines.push(`${h.city.isCapital ? "Capital" : "City"}: ${owner ? owner.name : "?"} ${h.city.developed ? "(Dev)" : ""} ${h.city.hasWonder ? "(Wonder)" : ""}`);
    }
    if (h.control) {
      const owner = Game.getPlayer(state, h.control.ownerId);
      lines.push(`${h.control.district ? `District: ${h.control.district}` : "Control"}: ${owner ? owner.name : "?"} ${h.control.fortified ? "(Fort)" : ""}`);
    }
    if (h.barbarian) lines.push(`Barbarian (power ${Game.CFG.barbarianBase + Game.TERRAIN[h.terrain]})`);
    if (h.cityState) lines.push(`City-State: ${h.cityState.name} (${h.cityState.type})`);
    if (h.resource) lines.push(`Resource: ${h.resource}`);
    const units = Game.getUnitsAt(state, hexKey);
    units.forEach((u) => { const p = Game.getPlayer(state, u.playerId); lines.push(`${u.type}: ${p ? p.name : "?"}`); });

    dom.mapTooltip.innerHTML = lines.join("<br>");
    dom.mapTooltip.classList.remove("hidden");
    dom.mapTooltip.style.left = `${e.clientX + 12}px`;
    dom.mapTooltip.style.top = `${e.clientY + 12}px`;
  }

  function hideTooltip() { dom.mapTooltip.classList.add("hidden"); }

  function renderWizard() {
    if (!state) return;
    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    const me = Game.getPlayer(state, localPlayerId);

    if (state.lastCombat) {
      const c = state.lastCombat;
      const resultCls = c.win ? "cr-win" : "cr-lose";
      const resultText = c.win ? "VICTORY!" : "DEFEATED";
      dom.wizard.innerHTML = `
        <div class="wiz-title">Combat Result</div>
        <div class="combat-result">
          <div>${c.attacker} vs ${c.defender}</div>
          <div>Attack: d6(${c.atkRoll}) + bonus = <strong>${c.atkTotal}</strong></div>
          <div>Defense: d6(${c.defRoll}) + bonus = <strong>${c.defTotal}</strong></div>
          <div class="${resultCls}">${resultText}</div>
        </div>
        <div class="wiz-actions"><button id="wiz-combat-ok">Continue</button></div>`;
      document.getElementById("wiz-combat-ok").addEventListener("click", () => {
        state.lastCombat = null;
        render();
      });
      return;
    }

    if (sub.phase === "idle") {
      if (!isMyTurn) {
        dom.wizard.innerHTML = `<div class="wiz-title">Waiting</div><div class="wiz-body">It's <strong>${cp ? cp.name : "..."}</strong>'s turn.</div>`;
        return;
      }
      let actions = `<div class="wiz-actions">`;
      if (me && me.armies.length < Game.CFG.maxArmies) actions += `<button class="sm" id="wiz-recruit-army">Recruit Army</button>`;
      if (me && me.wagons.length < Game.CFG.maxWagons) actions += `<button class="sm" id="wiz-recruit-wagon">Recruit Wagon</button>`;
      actions += `<button class="sm" id="wiz-gov">Assign Gov</button>`;
      actions += `<button id="wiz-end-turn">End Turn</button>`;
      actions += `</div>`;
      dom.wizard.innerHTML = `<div class="wiz-title">Your Turn</div><div class="wiz-body">Select a <strong>focus card</strong> below to take an action.${me && me.cardPlayed ? "<br><em>Card already played this turn.</em>" : ""}</div>${actions}`;
      const raBtn = document.getElementById("wiz-recruit-army");
      if (raBtn) raBtn.addEventListener("click", () => dispatch({ type: "RECRUIT_ARMY", payload: { playerId: localPlayerId } }));
      const rwBtn = document.getElementById("wiz-recruit-wagon");
      if (rwBtn) rwBtn.addEventListener("click", () => dispatch({ type: "RECRUIT_WAGON", payload: { playerId: localPlayerId } }));
      const govBtn = document.getElementById("wiz-gov");
      if (govBtn) govBtn.addEventListener("click", showGovPicker);
      const endBtn = document.getElementById("wiz-end-turn");
      if (endBtn) endBtn.addEventListener("click", () => dispatch({ type: "END_TURN", payload: {} }));
      return;
    }

    if (sub.phase === "card_selected") {
      const me2 = Game.getPlayer(state, localPlayerId);
      const slot = Game.getSlotValue(me2, sub.cardType);
      const tradeAvail = me2.trade[sub.cardType];
      dom.wizard.innerHTML = `
        <div class="wiz-title">${Game.FOCUS_LABELS[sub.cardType]} (Slot ${slot})</div>
        <div class="wiz-body">
          ${Game.FOCUS_TRADE_DESC[sub.cardType]}<br>
          Trade available: <strong>${tradeAvail}</strong>
          <div class="trade-counter">
            <span>Spend:</span>
            <button id="tc-dec" class="sm">−</button>
            <span class="tc-val" id="tc-val">${sub.tradeSpent}</span>
            <button id="tc-inc" class="sm">+</button>
          </div>
          ${getCardPreview(sub.cardType, me2, slot)}
        </div>
        <div class="wiz-actions">
          <button class="primary" id="wiz-start">Start Action</button>
          <button class="ghost" id="wiz-cancel">Cancel</button>
        </div>`;
      document.getElementById("tc-dec").addEventListener("click", () => { sub.tradeSpent = Math.max(0, sub.tradeSpent - 1); renderWizard(); });
      document.getElementById("tc-inc").addEventListener("click", () => { sub.tradeSpent = Math.min(tradeAvail, sub.tradeSpent + 1); renderWizard(); });
      document.getElementById("wiz-start").addEventListener("click", startAction);
      document.getElementById("wiz-cancel").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "placing_control") {
      const total = sub.totalMarkers || 0;
      const placed = total - sub.remaining;
      const pct = total > 0 ? (placed / total) * 100 : 0;
      dom.wizard.innerHTML = `
        <div class="wiz-title">Placing Control Markers</div>
        <div class="wiz-body">Click <strong>highlighted hexes</strong> on the map.<br>Remaining: ${sub.remaining} of ${total}</div>
        <div class="wiz-progress"><div class="wiz-progress-fill" style="width:${pct}%"></div></div>
        <div class="wiz-actions"><button id="wiz-done">Done Early</button><button class="ghost" id="wiz-cancel2">Cancel</button></div>`;
      document.getElementById("wiz-done").addEventListener("click", finishAction);
      document.getElementById("wiz-cancel2").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "growth_choice") {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Growth: Choose Action</div>
        <div class="wiz-body">Place a district adjacent to your city, or reinforce existing control markers.</div>
        <div class="wiz-actions">
          <button id="wiz-district">Place District</button>
          <button id="wiz-reinforce">Reinforce</button>
          <button class="ghost" id="wiz-cancel3">Cancel</button>
        </div>`;
      document.getElementById("wiz-district").addEventListener("click", () => { sub.phase = "pick_district"; renderWizard(); });
      document.getElementById("wiz-reinforce").addEventListener("click", startReinforce);
      document.getElementById("wiz-cancel3").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "pick_district") {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Choose District Type</div>
        <div class="district-grid">${Game.DISTRICTS.map((d) =>
          `<button class="sm dist-btn" data-d="${d}">${Game.DISTRICT_LABELS[d]}</button>`
        ).join("")}</div>
        <div class="wiz-body" style="margin-top:6px;font-size:10px">${Game.DISTRICTS.map((d) =>
          `<div><strong>${Game.DISTRICT_LABELS[d]}</strong>: ${Game.DISTRICT_EFFECTS[d]}</div>`
        ).join("")}</div>
        <div class="wiz-actions"><button class="ghost" id="wiz-back-growth">Back</button></div>`;
      document.querySelectorAll(".dist-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          sub.districtType = btn.dataset.d;
          startDistrictPlace();
        });
      });
      document.getElementById("wiz-back-growth").addEventListener("click", () => { sub.phase = "growth_choice"; renderWizard(); });
      return;
    }

    if (sub.phase === "placing_district") {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Place ${Game.DISTRICT_LABELS[sub.districtType]} District</div>
        <div class="wiz-body">Click a <strong>highlighted hex</strong> adjacent to your city.</div>
        <div class="wiz-actions"><button class="ghost" id="wiz-cancel4">Cancel</button></div>`;
      document.getElementById("wiz-cancel4").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "reinforcing") {
      const total = sub.totalMarkers || 0;
      const placed = total - sub.remaining;
      const pct = total > 0 ? (placed / total) * 100 : 0;
      dom.wizard.innerHTML = `
        <div class="wiz-title">Reinforcing Markers</div>
        <div class="wiz-body">Click your control markers to fortify them.<br>Remaining: ${sub.remaining} of ${total}</div>
        <div class="wiz-progress"><div class="wiz-progress-fill" style="width:${pct}%"></div></div>
        <div class="wiz-actions"><button id="wiz-done2">Done</button><button class="ghost" id="wiz-cancel5">Cancel</button></div>`;
      document.getElementById("wiz-done2").addEventListener("click", finishAction);
      document.getElementById("wiz-cancel5").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "move_wagon" || sub.phase === "move_army") {
      const unitType = sub.phase === "move_wagon" ? "wagon" : "army";
      const selectingUnit = !sub.selectedUnit;
      dom.wizard.innerHTML = `
        <div class="wiz-title">Move ${unitType === "wagon" ? "Wagon" : "Army"}</div>
        <div class="wiz-body">${selectingUnit
          ? `Click one of your <strong>${unitType}s</strong> on the map to select it.`
          : `Click a <strong>highlighted hex</strong> to move.`}</div>
        <div class="wiz-actions"><button class="ghost" id="wiz-cancel6">Cancel</button></div>`;
      document.getElementById("wiz-cancel6").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "industry_choice") {
      const me3 = Game.getPlayer(state, localPlayerId);
      const slot = Game.getSlotValue(me3, "industry");
      let spentBonus = 0;
      Object.values(sub.spentResources).forEach((v) => { if (v) spentBonus += Game.CFG.resourceProdValue; });
      const totalProd = slot + sub.tradeSpent + spentBonus;
      const resEntries = Object.entries(me3.resources).filter(([, v]) => v > 0);
      const resHtml = resEntries.length ? resEntries.map(([k, v]) => {
        const active = sub.spentResources[k] ? " primary" : "";
        return `<button class="sm res-btn${active}" data-r="${k}">${k}(${v}) +${Game.CFG.resourceProdValue}</button>`;
      }).join(" ") : "<em>No resources</em>";

      dom.wizard.innerHTML = `
        <div class="wiz-title">Industry (Production: ${totalProd})</div>
        <div class="wiz-body">
          Base ${slot} + ${sub.tradeSpent} trade + ${spentBonus} resources<br>
          <div style="margin:6px 0">${resHtml}</div>
        </div>
        <div class="wiz-actions">
          <button id="wiz-build-city">Build City (cost=terrain)</button>
          <button id="wiz-build-wonder">Build Wonder (cost=6)</button>
          <button class="ghost" id="wiz-cancel7">Cancel</button>
        </div>`;
      document.querySelectorAll(".res-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const r = btn.dataset.r;
          sub.spentResources[r] = !sub.spentResources[r];
          renderWizard();
        });
      });
      document.getElementById("wiz-build-city").addEventListener("click", () => startBuildCity(totalProd));
      document.getElementById("wiz-build-wonder").addEventListener("click", () => startBuildWonder(totalProd));
      document.getElementById("wiz-cancel7").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "placing_city") {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Place New City</div>
        <div class="wiz-body">Click a <strong>highlighted hex</strong> to build your city.</div>
        <div class="wiz-actions"><button class="ghost" id="wiz-cancel8">Cancel</button></div>`;
      document.getElementById("wiz-cancel8").addEventListener("click", cancelAction);
      return;
    }

    if (sub.phase === "placing_wonder") {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Build Wonder</div>
        <div class="wiz-body">Click one of your <strong>cities</strong> to build the wonder.</div>
        <div class="wiz-actions"><button class="ghost" id="wiz-cancel9">Cancel</button></div>`;
      document.getElementById("wiz-cancel9").addEventListener("click", cancelAction);
      return;
    }
  }

  function getCardPreview(cardType, player, slot) {
    const spend = sub.tradeSpent;
    switch (cardType) {
      case "culture":
        return `Markers to place: <strong>${2 + spend}</strong> (terrain ≤ ${slot})`;
      case "growth":
        return `Place 1 district or reinforce ${slot + spend} markers.`;
      case "science":
        return `Advance tech by <strong>${slot + spend}</strong>. Current: ${player.tech}/${Game.CFG.techWheelSize}`;
      case "economy":
        return `Move wagon up to <strong>${Game.CFG.baseWagonMove + spend}</strong> hexes.`;
      case "military":
        return `Move army up to <strong>${Game.CFG.baseArmyMove + slot - 1}</strong>. Combat: d6 + ${slot + spend}`;
      case "industry":
        return `Production: <strong>${slot + spend}</strong>. Build city (terrain cost) or wonder (6).`;
      default: return "";
    }
  }

  function startAction() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;
    const slot = Game.getSlotValue(me, sub.cardType);

    if (sub.cardType === "science") {
      const amount = slot + sub.tradeSpent;
      dispatch({ type: "PLAY_SCIENCE", payload: { playerId: localPlayerId, amount, tradeSpent: sub.tradeSpent } });
      resetSub();
      return;
    }

    if (sub.cardType === "culture") {
      sub.phase = "placing_control";
      sub.remaining = 2 + sub.tradeSpent;
      sub.totalMarkers = sub.remaining;
      sub.placedKeys = [];
      sub.validHexes = Game.validControlHexes(state, localPlayerId, slot);
      render();
      return;
    }

    if (sub.cardType === "growth") {
      sub.phase = "growth_choice";
      renderWizard();
      return;
    }

    if (sub.cardType === "economy") {
      sub.phase = "move_wagon";
      sub.selectedUnit = null;
      sub.validHexes = new Set();
      render();
      return;
    }

    if (sub.cardType === "military") {
      sub.phase = "move_army";
      sub.selectedUnit = null;
      sub.validHexes = new Set();
      render();
      return;
    }

    if (sub.cardType === "industry") {
      sub.phase = "industry_choice";
      sub.spentResources = {};
      renderWizard();
      return;
    }
  }

  function startDistrictPlace() {
    const me = Game.getPlayer(state, localPlayerId);
    const slot = Game.getSlotValue(me, "growth");
    sub.phase = "placing_district";
    sub.validHexes = Game.validDistrictHexes(state, localPlayerId, slot);
    render();
  }

  function startReinforce() {
    const me = Game.getPlayer(state, localPlayerId);
    const slot = Game.getSlotValue(me, "growth");
    sub.phase = "reinforcing";
    sub.remaining = slot + sub.tradeSpent;
    sub.totalMarkers = sub.remaining;
    sub.placedKeys = [];
    sub.validHexes = Game.validReinforceHexes(state, localPlayerId);
    render();
  }

  function startBuildCity(production) {
    sub.phase = "placing_city";
    sub.validHexes = Game.validCityHexes(state, localPlayerId, production);
    render();
  }

  function startBuildWonder(production) {
    if (production < 6) {
      dom.wizard.innerHTML += `<div style="color:var(--danger);margin-top:6px">Need 6 production for a wonder!</div>`;
      return;
    }
    sub.phase = "placing_wonder";
    sub.validHexes = Game.validWonderHexes(state, localPlayerId);
    render();
  }

  function finishAction() {
    if (sub.phase === "placing_control" && sub.placedKeys && sub.placedKeys.length > 0) {
      dispatch({ type: "PLAY_CULTURE", payload: { playerId: localPlayerId, hexKeys: sub.placedKeys, tradeSpent: sub.tradeSpent } });
    }
    if (sub.phase === "reinforcing" && sub.placedKeys && sub.placedKeys.length > 0) {
      dispatch({ type: "PLAY_GROWTH_REINFORCE", payload: { playerId: localPlayerId, hexKeys: sub.placedKeys, tradeSpent: sub.tradeSpent } });
    }
    resetSub();
  }

  function cancelAction() {
    resetSub();
    render();
  }

  function resetSub() {
    sub.phase = "idle";
    sub.cardType = null;
    sub.tradeSpent = 0;
    sub.remaining = 0;
    sub.validHexes = new Set();
    sub.selectedUnit = null;
    sub.districtType = null;
    sub.spentResources = {};
    sub.placedKeys = [];
    sub.totalMarkers = 0;
    render();
  }

  function handleHexClick(hexKey) {
    if (!state) return;
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;

    if (sub.phase === "placing_control") {
      if (!sub.validHexes.has(hexKey)) return;
      if (!sub.placedKeys) sub.placedKeys = [];
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      if (sub.remaining <= 0) {
        finishAction();
      } else {
        renderMap();
        renderWizard();
      }
      return;
    }

    if (sub.phase === "placing_district") {
      if (!sub.validHexes.has(hexKey)) return;
      dispatch({ type: "PLAY_GROWTH_DISTRICT", payload: { playerId: localPlayerId, hexKey, district: sub.districtType, tradeSpent: sub.tradeSpent } });
      resetSub();
      return;
    }

    if (sub.phase === "reinforcing") {
      if (!sub.validHexes.has(hexKey)) return;
      if (!sub.placedKeys) sub.placedKeys = [];
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      if (sub.remaining <= 0) {
        finishAction();
      } else {
        renderMap();
        renderWizard();
      }
      return;
    }

    if (sub.phase === "move_wagon") {
      if (!sub.selectedUnit) {
        const unit = me.wagons.find((u) => u.position === hexKey);
        if (!unit) return;
        sub.selectedUnit = unit;
        const slot = Game.getSlotValue(me, "economy");
        const range = Game.CFG.baseWagonMove + sub.tradeSpent;
        sub.validHexes = Game.getReachable(state, hexKey, range, "wagon", localPlayerId);
        renderMap();
        renderWizard();
      } else {
        if (!sub.validHexes.has(hexKey)) return;
        dispatch({ type: "PLAY_ECONOMY", payload: { playerId: localPlayerId, unitId: sub.selectedUnit.id, toKey: hexKey, tradeSpent: sub.tradeSpent } });
        resetSub();
      }
      return;
    }

    if (sub.phase === "move_army") {
      if (!sub.selectedUnit) {
        const unit = me.armies.find((u) => u.position === hexKey);
        if (!unit) return;
        sub.selectedUnit = unit;
        const slot = Game.getSlotValue(me, "military");
        const range = Game.CFG.baseArmyMove + slot - 1;
        sub.validHexes = Game.getReachable(state, hexKey, range, "army", localPlayerId);
        renderMap();
        renderWizard();
      } else {
        if (!sub.validHexes.has(hexKey)) return;
        const defender = Game.findDefender(state, hexKey, localPlayerId);
        const slot = Game.getSlotValue(me, "military");
        if (defender) {
          dispatch({
            type: "PLAY_MILITARY_ATTACK",
            payload: {
              playerId: localPlayerId,
              unitId: sub.selectedUnit.id,
              toKey: hexKey,
              attackPower: slot + sub.tradeSpent,
              defensePower: defender.power,
              defenderLabel: defender.label,
              tradeSpent: sub.tradeSpent
            }
          });
        } else {
          dispatch({ type: "PLAY_MILITARY_MOVE", payload: { playerId: localPlayerId, unitId: sub.selectedUnit.id, toKey: hexKey, tradeSpent: sub.tradeSpent } });
        }
        resetSub();
      }
      return;
    }

    if (sub.phase === "placing_city") {
      if (!sub.validHexes.has(hexKey)) return;
      const resources = {};
      Object.entries(sub.spentResources).forEach(([r, spent]) => { if (spent) resources[r] = 1; });
      dispatch({ type: "PLAY_INDUSTRY_CITY", payload: { playerId: localPlayerId, hexKey, resources, tradeSpent: sub.tradeSpent } });
      resetSub();
      return;
    }

    if (sub.phase === "placing_wonder") {
      if (!sub.validHexes.has(hexKey)) return;
      const resources = {};
      Object.entries(sub.spentResources).forEach(([r, spent]) => { if (spent) resources[r] = 1; });
      dispatch({ type: "PLAY_INDUSTRY_WONDER", payload: { playerId: localPlayerId, hexKey, resources, tradeSpent: sub.tradeSpent } });
      resetSub();
      return;
    }
  }

  function showGovPicker() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;
    let selected = me.govMarkers.slice();
    const renderPicker = () => {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Assign Gov Markers (max ${Game.CFG.maxGovMarkers})</div>
        <div class="wiz-body">Each marker adds +1 to that focus card's slot value.</div>
        <div class="wiz-actions" style="flex-wrap:wrap">
          ${Game.FOCUS_TYPES.map((f) => {
            const active = selected.includes(f) ? " primary" : "";
            return `<button class="sm gov-pick${active}" data-f="${f}">${Game.FOCUS_LABELS[f]}</button>`;
          }).join("")}
        </div>
        <div class="wiz-actions" style="margin-top:8px">
          <button class="primary" id="gov-ok">Confirm</button>
          <button class="ghost" id="gov-cancel">Cancel</button>
        </div>`;
      document.querySelectorAll(".gov-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          const f = btn.dataset.f;
          if (selected.includes(f)) selected = selected.filter((x) => x !== f);
          else if (selected.length < Game.CFG.maxGovMarkers) selected.push(f);
          renderPicker();
        });
      });
      document.getElementById("gov-ok").addEventListener("click", () => {
        dispatch({ type: "ASSIGN_GOV", payload: { playerId: localPlayerId, markers: selected } });
        renderWizard();
      });
      document.getElementById("gov-cancel").addEventListener("click", renderWizard);
    };
    renderPicker();
  }

  function renderEventWheel() {
    if (!state) return;
    const wheel = state.eventWheel;
    const pos = wheel.position;
    dom.eventWheel.innerHTML = `<h3>Event Wheel</h3><div class="ew-track">${
      wheel.events.map((evt, i) => {
        let cls = "ew-pip";
        if (i === pos) cls += " active";
        if (i === (pos + 1) % wheel.events.length) cls += " next";
        return `<span class="${cls}">${Game.EVENT_LABELS[evt]}</span>`;
      }).join("")
    }</div>`;
  }

  function renderLog() {
    if (!state) return;
    dom.gameLog.innerHTML = `<h3>Game Log</h3>` + state.log.slice(-20).reverse().map((msg) =>
      `<div class="log-entry">${msg}</div>`
    ).join("");
  }

  function renderFocusRow() {
    if (!state) return;
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.focusRow.innerHTML = ""; return; }
    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    const canPlay = isMyTurn && !me.cardPlayed && sub.phase === "idle";

    dom.focusRow.innerHTML = me.focusRow.map((cardType, idx) => {
      const baseSlot = Game.FOCUS_SLOTS[idx];
      const bonus = me.govBonus[cardType] || 0;
      const effective = Math.min(5, baseSlot + bonus);
      const trade = "●".repeat(me.trade[cardType]) + "○".repeat(Game.CFG.maxTrade - me.trade[cardType]);
      const disabled = !canPlay ? " disabled" : "";
      const selected = sub.cardType === cardType && sub.phase !== "idle" ? " selected" : "";
      return `<div class="fcard type-${cardType}${disabled}${selected}" data-card="${cardType}">
        <span class="fc-pos">#${idx + 1}</span>
        <span class="fc-slot">${effective}${bonus > 0 ? `<span class="gov-plus">+${bonus}</span>` : ""}</span>
        <span class="fc-name">${Game.FOCUS_LABELS[cardType]}</span>
        <span class="fc-trade">${trade}</span>
      </div>`;
    }).join("");

    if (canPlay) {
      document.querySelectorAll(".fcard:not(.disabled)").forEach((el) => {
        el.addEventListener("click", () => {
          const ct = el.dataset.card;
          sub.phase = "card_selected";
          sub.cardType = ct;
          sub.tradeSpent = 0;
          renderWizard();
          renderFocusRow();
        });
      });
    }
  }

  function renderGameOver() {
    const existing = document.querySelector(".gameover-overlay");
    if (existing) existing.remove();
    if (!state || state.phase !== "gameover" || !state.winner) return;
    const overlay = document.createElement("div");
    overlay.className = "gameover-overlay";
    overlay.innerHTML = `<div class="gameover-box">
      <h2>Game Over!</h2>
      <div class="go-type">${state.winner.type}</div>
      <div style="margin-bottom:12px"><strong>${state.winner.playerName}</strong> wins!</div>
      <div class="gameover-scores">${state.players.map((p) =>
        `<div><span class="dot" style="background:${p.color};display:inline-block;width:8px;height:8px;border-radius:50%"></span> ${p.name}: ${Game.computeScore(state, p.id)} pts</div>`
      ).join("")}</div>
    </div>`;
    document.body.appendChild(overlay);
  }

  window.addEventListener("load", init);
  return { render, dispatch };
})();
