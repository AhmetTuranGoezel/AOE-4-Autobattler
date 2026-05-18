"use strict";

const UI = (() => {
  let state = null;
  let localPlayerId = null;

  // Canvas
  let canvas = null;
  let ctx = null;
  const HEX_SIZE = 30;
  const SQRT3 = Math.sqrt(3);
  let panX = 0, panY = 0;
  let isPanning = false;
  let panStart = null;
  let dragDistance = 0;
  let mouseHex = null;

  const TERRAIN_COLORS = {
    grass: '#4a7c3f', hill: '#8b7355', forest: '#2d5a27',
    desert: '#c4a35a', mountain: '#6b6b6b', water: '#2563a0'
  };

  const EDGE_NEIGHBORS = [
    { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 },
    { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }
  ];

  const sub = {
    phase: "idle", cardType: null, tradeSpent: 0, remaining: 0,
    totalMarkers: 0, validHexes: new Set(), selectedUnit: null,
    districtType: null, spentResources: {}, placedKeys: [],
    tileRotation: 0, tileSide: "A",
    movementState: null
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
        if (Net.getIsHost()) dispatch(payload);
        else { state = payload; render(); }
      },
      onJoin: (peerId, name, color) => {
        const player = Game.createPlayer(peerId, name, color);
        state = Game.applyAction(state, { type: "ADD_PLAYER", payload: player });
        Net.broadcast(state);
        render();
      },
      onDisconnect: () => {},
      onConnected: () => { if (Net.getIsHost() && state) Net.broadcast(state); }
    });
  }

  function startLocal() {
    Net.startLocal();
    localPlayerId = "local";
    const name = dom.inpName.value.trim() || "Player";
    const color = dom.inpColor.value;
    const player = Game.createPlayer(localPlayerId, name, color);
    state = Game.createState([player]);
    showGame();
    render();
  }

  function startCreate() {
    const name = dom.inpName.value.trim() || "Host";
    const color = dom.inpColor.value;
    dom.lobbyStatus.textContent = "Creating room...";
    Net.createRoom((id) => {
      localPlayerId = id;
      const player = Game.createPlayer(id, name, color);
      state = Game.createState([player]);
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
    initCanvas();
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

  // ── Canvas Setup ──────────────────────────────────────────

  function initCanvas() {
    canvas = document.createElement("canvas");
    dom.map.innerHTML = "";
    dom.map.appendChild(canvas);
    ctx = canvas.getContext("2d");

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("mousemove", onCanvasMouseMove);
    canvas.addEventListener("mousedown", onCanvasMouseDown);
    canvas.addEventListener("mouseup", onCanvasMouseUp);
    canvas.addEventListener("mouseleave", onCanvasMouseLeave);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("keydown", onKeyDown);

    panX = (dom.map.clientWidth || 800) / 2;
    panY = (dom.map.clientHeight || 600) / 2;
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = dom.map.clientWidth || 800;
    const h = dom.map.clientHeight || 600;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state) renderCanvas();
  }

  // ── Hex Math ──────────────────────────────────────────────

  function axialToPixel(q, r) {
    return {
      x: HEX_SIZE * SQRT3 * (q + r / 2) + panX,
      y: HEX_SIZE * 1.5 * r + panY
    };
  }

  function pixelToAxial(px, py) {
    const x = px - panX;
    const y = py - panY;
    const fq = (SQRT3 / 3 * x - y / 3) / HEX_SIZE;
    const fr = (2 / 3 * y) / HEX_SIZE;
    return axialRound(fq, fr);
  }

  function axialRound(fq, fr) {
    const fs = -fq - fr;
    let rq = Math.round(fq), rr = Math.round(fr), rs = Math.round(fs);
    const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs - fs);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  function hexCorner(cx, cy, size, i) {
    const angle = Math.PI / 180 * (60 * i - 30);
    return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
  }

  function hexPath(cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(cx, cy, size, i);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
  }

  // ── Canvas Rendering ─────────────────────────────────────

  function renderCanvas() {
    if (!state || !ctx) return;
    const cw = canvas.width / (window.devicePixelRatio || 1);
    const ch = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#111122";
    ctx.fillRect(0, 0, cw, ch);

    const hexes = state.map.hexes;

    // Compute setup-valid and ghost data
    let setupValid = new Set();
    let ghostKeys = new Set();
    let ghostValid = false;

    if (state.phase === "setup") {
      const activeId = state.setup.order[state.setup.turnIndex];
      if (activeId === localPlayerId) {
        if (state.setup.phase === "fortress") {
          setupValid = Game.getValidFortressHexes(state);
        } else if ((state.setup.phase === "tile" || state.setup.phase === "capital_tile") && mouseHex) {
          const playerTiles = state.setup.playerTiles[localPlayerId] || [];
          if (playerTiles.length > 0) {
            const tileId = playerTiles[0];
            const anchorKey = Game.key(mouseHex.q, mouseHex.r);
            const keys = Game.getTileHexKeys(anchorKey, sub.tileRotation, hexes);
            if (keys.length === Game.TILE_OFFSETS.length) {
              const result = Game.validateTilePlacement(state, tileId, anchorKey, sub.tileRotation);
              ghostKeys = new Set(keys);
              ghostValid = result.ok;
            }
          }
        }
      }
    }

    if (state.phase === "playing" &&
        (sub.phase === "move_army_exploring" || sub.phase === "move_wagon_exploring") &&
        mouseHex && state.tileStack && state.tileStack.length > 0) {
      const tileId = state.tileStack[0];
      const anchorKey = Game.key(mouseHex.q, mouseHex.r);
      const keys = Game.getTileHexKeys(anchorKey, sub.tileRotation, hexes);
      if (keys.length === Game.TILE_OFFSETS.length) {
        const result = Game.validateExploration(state, tileId, anchorKey, sub.tileRotation);
        ghostKeys = new Set(keys);
        ghostValid = result.ok;
      }
    }

    const combinedValid = new Set([...sub.validHexes, ...setupValid]);

    // Layer 1: Inactive hexes
    Object.values(hexes).forEach((h) => {
      if (h.active || ghostKeys.has(Game.key(h.q, h.r))) return;
      const p = axialToPixel(h.q, h.r);
      if (p.x < -50 || p.x > cw + 50 || p.y < -50 || p.y > ch + 50) return;
      hexPath(p.x, p.y, HEX_SIZE);
      ctx.fillStyle = "rgba(30,30,50,0.3)";
      ctx.fill();
      ctx.strokeStyle = "rgba(60,60,90,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Layer 2: Active hex terrain
    Object.values(hexes).forEach((h) => {
      if (!h.active) return;
      const p = axialToPixel(h.q, h.r);
      if (p.x < -50 || p.x > cw + 50 || p.y < -50 || p.y > ch + 50) return;
      hexPath(p.x, p.y, HEX_SIZE);
      ctx.fillStyle = TERRAIN_COLORS[h.terrain] || "#444";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Layer 3: Tile boundaries
    drawTileBoundaries(cw, ch);

    // Layer 4: Valid hex highlights
    combinedValid.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      hexPath(p.x, p.y, HEX_SIZE - 2);
      ctx.fillStyle = "rgba(102,187,106,0.2)";
      ctx.fill();
      ctx.strokeStyle = "#66bb6a";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Layer 5: Hex content
    Object.entries(hexes).forEach(([k, h]) => {
      if (!h.active) return;
      const p = axialToPixel(h.q, h.r);
      if (p.x < -50 || p.x > cw + 50 || p.y < -50 || p.y > ch + 50) return;
      drawHexContent(p.x, p.y, h, k);
    });

    // Layer 6: Ghost tile
    if (ghostKeys.size > 0) drawGhostTile(ghostKeys, ghostValid);

    // Layer 7: Hover ring
    if (mouseHex) {
      const mk = Game.key(mouseHex.q, mouseHex.r);
      const mh = hexes[mk];
      if (mh) {
        const p = axialToPixel(mouseHex.q, mouseHex.r);
        hexPath(p.x, p.y, HEX_SIZE);
        ctx.strokeStyle = mh.active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawTileBoundaries(cw, ch) {
    if (!state) return;
    const hexes = state.map.hexes;
    ctx.strokeStyle = "rgba(255,213,79,0.45)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    Object.values(hexes).forEach((h) => {
      if (!h.active || !h.tileId) return;
      const p = axialToPixel(h.q, h.r);
      if (p.x < -60 || p.x > cw + 60 || p.y < -60 || p.y > ch + 60) return;

      for (let i = 0; i < 6; i++) {
        const n = EDGE_NEIGHBORS[i];
        const nk = Game.key(h.q + n.dq, h.r + n.dr);
        const nh = hexes[nk];
        if (!nh || !nh.active || nh.tileId !== h.tileId) {
          const c1 = hexCorner(p.x, p.y, HEX_SIZE, i);
          const c2 = hexCorner(p.x, p.y, HEX_SIZE, (i + 1) % 6);
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.stroke();
        }
      }
    });
  }

  function drawGhostTile(ghostKeys, valid) {
    const hexes = state.map.hexes;
    const fillColor = valid ? "rgba(102,187,106,0.25)" : "rgba(239,83,80,0.2)";
    const strokeColor = valid ? "#66bb6a" : "#ef5350";

    // Get tile data for terrain preview
    let tileId = null;
    let tile = null;
    if (state.phase === "setup") {
      const playerTiles = state.setup.playerTiles[localPlayerId] || [];
      tileId = playerTiles[0];
      tile = tileId ? state.setup.tiles[tileId] : null;
    } else if (sub.phase === "move_army_exploring" || sub.phase === "move_wagon_exploring") {
      tileId = state.tileStack ? state.tileStack[0] : null;
      tile = tileId ? state.tiles[tileId] : null;
    }

    ghostKeys.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      hexPath(p.x, p.y, HEX_SIZE);
      ctx.fillStyle = h.active ? "rgba(239,83,80,0.3)" : fillColor;
      ctx.fill();

      // Show tile type indicator at anchor
      if (tile && k === Game.key(mouseHex.q, mouseHex.r)) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labels = { capital: "CAP", natural: "WND", citystate: "CS", normal: "" };
        ctx.fillText(labels[tile.type] || "", p.x, p.y);
      }
    });

    // Ghost outline
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ghostKeys.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      for (let i = 0; i < 6; i++) {
        const n = EDGE_NEIGHBORS[i];
        const nk = Game.key(h.q + n.dq, h.r + n.dr);
        if (!ghostKeys.has(nk)) {
          const c1 = hexCorner(p.x, p.y, HEX_SIZE, i);
          const c2 = hexCorner(p.x, p.y, HEX_SIZE, (i + 1) % 6);
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.stroke();
        }
      }
    });
  }

  function drawHexContent(cx, cy, h, k) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let yOff = -8;
    const step = 11;

    if (h.city) {
      const owner = Game.getPlayer(state, h.city.ownerId);
      const color = owner ? owner.color : "#fff";
      const label = h.city.isCapital ? "CAP" : "CTY";
      const extra = h.city.hasWonder ? "★" : (h.city.developed ? "✓" : "");
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(cx - 14, cy + yOff - 5, 28, 11);
      ctx.fillStyle = color;
      ctx.font = "bold 8px sans-serif";
      ctx.fillText(label + extra, cx, cy + yOff);
      yOff += step;
    }

    if (h.fortress) {
      const owner = h.fortressOwnerId ? Game.getPlayer(state, h.fortressOwnerId) : null;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(cx - 11, cy + yOff - 5, 22, 11);
      ctx.fillStyle = owner ? owner.color : "#aaa";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("FRT", cx, cy + yOff);
      yOff += step;
    }

    if (h.control) {
      const owner = Game.getPlayer(state, h.control.ownerId);
      const color = owner ? owner.color : "#fff";
      if (h.control.district) {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(cx - 11, cy + yOff - 5, 22, 10);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 11, cy + yOff - 5, 22, 10);
        ctx.fillStyle = color;
        ctx.font = "bold 7px sans-serif";
        ctx.fillText(h.control.district.slice(0, 3).toUpperCase(), cx, cy + yOff);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy + yOff, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (h.control.fortified) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      yOff += step;
    }

    if (h.barbarian) {
      ctx.fillStyle = "#ff5722";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("☠", cx, cy + yOff);
      yOff += step;
    }

    if (h.cityState) {
      ctx.fillStyle = "#ce93d8";
      ctx.font = "bold 7px sans-serif";
      ctx.fillText(h.cityState.name.slice(0, 4), cx, cy + yOff);
      yOff += step;
    }

    if (h.resource) {
      ctx.fillStyle = "#ffd54f";
      ctx.font = "bold 7px sans-serif";
      const resLabels = { marble: "MRB", mercury: "MRC", oil: "OIL", diamonds: "DIA", wonder: "WND" };
      ctx.fillText(resLabels[h.resource] || h.resource.slice(0, 3), cx, cy + yOff);
      yOff += step;
    }

    const units = Game.getUnitsAt(state, k);
    units.forEach((u) => {
      ctx.beginPath();
      ctx.arc(cx, cy + yOff, 5, 0, Math.PI * 2);
      ctx.fillStyle = u.type === "army" ? "rgba(239,83,80,0.5)" : "rgba(102,187,106,0.5)";
      ctx.fill();
      ctx.fillStyle = u.color;
      ctx.font = "bold 8px sans-serif";
      ctx.fillText(u.type === "army" ? "A" : "W", cx, cy + yOff);
      yOff += step;
    });
  }

  // ── Mouse / Keyboard ─────────────────────────────────────

  function onCanvasMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPanning && panStart) {
      const dx = mx - panStart.x;
      const dy = my - panStart.y;
      dragDistance = Math.sqrt(dx * dx + dy * dy);
      panX = panStart.panX + dx;
      panY = panStart.panY + dy;
      canvas.style.cursor = "grabbing";
      hideTooltip();
      renderCanvas();
      return;
    }

    const newHex = pixelToAxial(mx, my);
    const newKey = Game.key(newHex.q, newHex.r);
    const oldKey = mouseHex ? Game.key(mouseHex.q, mouseHex.r) : null;

    if (newKey !== oldKey) {
      mouseHex = state && state.map.hexes[newKey] ? newHex : null;
      if (mouseHex) showTooltip(e.clientX, e.clientY, newKey);
      else hideTooltip();
      renderCanvas();
    } else if (mouseHex) {
      dom.mapTooltip.style.left = (e.clientX + 14) + "px";
      dom.mapTooltip.style.top = (e.clientY + 14) + "px";
    }
  }

  function onCanvasMouseDown(e) {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    isPanning = true;
    dragDistance = 0;
    panStart = { x: e.clientX - rect.left, y: e.clientY - rect.top, panX, panY };
  }

  function onCanvasMouseUp() {
    isPanning = false;
    panStart = null;
    canvas.style.cursor = "grab";
  }

  function onCanvasMouseLeave() {
    isPanning = false;
    panStart = null;
    mouseHex = null;
    hideTooltip();
    canvas.style.cursor = "grab";
    renderCanvas();
  }

  function onCanvasClick(e) {
    if (dragDistance > 5) { dragDistance = 0; return; }
    dragDistance = 0;
    const rect = canvas.getBoundingClientRect();
    const hex = pixelToAxial(e.clientX - rect.left, e.clientY - rect.top);
    handleHexClick(Game.key(hex.q, hex.r));
  }

  function onKeyDown(e) {
    if (sub.phase === "move_army_exploring" || sub.phase === "move_wagon_exploring") {
      if (e.key === "q" || e.key === "Q") { e.preventDefault(); sub.tileRotation = (sub.tileRotation + 5) % 6; render(); }
      else if (e.key === "e" || e.key === "E") { e.preventDefault(); sub.tileRotation = (sub.tileRotation + 1) % 6; render(); }
      return;
    }
    if (!state || state.phase !== "setup" || (state.setup.phase !== "tile" && state.setup.phase !== "capital_tile")) return;
    const activeId = state.setup.order[state.setup.turnIndex];
    if (activeId !== localPlayerId) return;

    if (e.key === "q" || e.key === "Q") {
      e.preventDefault();
      sub.tileRotation = (sub.tileRotation + 5) % 6;
      render();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      sub.tileRotation = (sub.tileRotation + 1) % 6;
      render();
    }
  }

  // ── Tooltip ───────────────────────────────────────────────

  function showTooltip(screenX, screenY, hexKey) {
    const h = state.map.hexes[hexKey];
    if (!h) return;
    const lines = [];
    if (!h.active) {
      lines.push(`<strong>Inactive</strong> (${hexKey})`);
    } else {
      lines.push(`<strong>${Game.TERRAIN_LABELS[h.terrain]}</strong> (diff ${Game.TERRAIN[h.terrain]})`);
      if (h.city) {
        const owner = Game.getPlayer(state, h.city.ownerId);
        lines.push(`${h.city.isCapital ? "Capital" : "City"}: ${owner ? owner.name : "?"} ${h.city.developed ? "(Dev)" : ""} ${h.city.hasWonder ? "(Wonder)" : ""}`);
      }
      if (h.control) {
        const owner = Game.getPlayer(state, h.control.ownerId);
        lines.push(`${h.control.district ? `District: ${h.control.district}` : "Control"}: ${owner ? owner.name : "?"} ${h.control.fortified ? "(Fort)" : ""}`);
      }
      if (h.barbarian) lines.push(`Barbarian (power ${Game.TERRAIN[h.terrain]})`);
      if (h.cityState) lines.push(`City-State: ${h.cityState.name} (${h.cityState.type})`);
      if (h.resource) lines.push(`Resource: ${h.resource}`);
      if (h.fortress) {
        const owner = h.fortressOwnerId ? Game.getPlayer(state, h.fortressOwnerId) : null;
        lines.push(`Fortress: ${owner ? owner.name : "Neutral"}`);
      }
      Game.getUnitsAt(state, hexKey).forEach((u) => {
        const p = Game.getPlayer(state, u.playerId);
        lines.push(`${u.type}: ${p ? p.name : "?"}`);
      });
      if (h.tileId) lines.push(`<em style="color:#ffd54f88">Tile: ${h.tileId}</em>`);
    }
    dom.mapTooltip.innerHTML = lines.join("<br>");
    dom.mapTooltip.classList.remove("hidden");
    dom.mapTooltip.style.left = (screenX + 14) + "px";
    dom.mapTooltip.style.top = (screenY + 14) + "px";
  }

  function hideTooltip() { dom.mapTooltip.classList.add("hidden"); }

  // ── Render Orchestrator ───────────────────────────────────

  function render() {
    if (!state) return;
    renderHeader();
    renderPlayers();
    renderCanvas();
    renderWizard();
    renderEventWheel();
    renderLog();

    if (state.phase === "playing" || state.phase === "gameover") {
      renderVictoryTracker();
      renderMyStats();
      renderFocusRow();
    } else {
      dom.victoryTracker.innerHTML = "";
      dom.myStats.innerHTML = "";
      dom.focusRow.innerHTML = "";
    }
    renderGameOver();
  }

  // ── Header / Players / Stats ──────────────────────────────

  function renderHeader() {
    const cp = Game.currentPlayer(state);
    if (state.phase === "setup") {
      dom.hdrRound.textContent = `Setup: ${state.setup.phase}`;
      const activeId = state.setup.order[state.setup.turnIndex];
      const activeP = Game.getPlayer(state, activeId);
      dom.hdrTurn.textContent = activeP ? (activeId === localPlayerId ? "Your Turn" : `${activeP.name}'s Turn`) : "";
      dom.hdrTurn.style.color = activeP ? activeP.color : "";
    } else {
      dom.hdrRound.textContent = `Round ${state.turn.round}/${Game.CFG.maxRounds}`;
      dom.hdrTurn.textContent = cp ? (cp.id === localPlayerId ? "Your Turn" : `${cp.name}'s Turn`) : "";
      dom.hdrTurn.style.color = cp ? cp.color : "";
    }
  }

  function renderPlayers() {
    dom.players.innerHTML = state.players.map((p) => {
      const active = state.phase === "setup"
        ? (state.setup.order[state.setup.turnIndex] === p.id ? " active" : "")
        : (Game.currentPlayer(state)?.id === p.id ? " active" : "");
      const score = state.phase === "playing" ? ` | Score: ${Game.computeScore(state, p.id)}` : "";
      return `<div class="player-card${active}">
        <div class="pname"><span class="dot" style="background:${p.color}"></span>${p.name}</div>
        <div class="pstats">${state.phase === "setup" ? "Setup" : `Cities: ${Game.countCities(state, p.id)} | Ctrl: ${Game.countControl(state, p.id)}${score}`}</div>
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
      return `<div class="vtrack-row"><span class="vlabel">${r.label}</span><div class="vtrack-bar"><div class="vtrack-fill" style="width:${pct}%;background:${r.color}"></div></div><span class="vtrack-val">${r.val}/${r.max}</span></div>`;
    }).join("");
  }

  function renderMyStats() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.myStats.innerHTML = ""; return; }
    const res = Object.entries(me.resources).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(", ") || "none";
    const gov = me.govMarkers.length ? me.govMarkers.map((m) => Game.FOCUS_LABELS[m]).join(", ") : "none";
    dom.myStats.innerHTML = `<h3>My Stats</h3><div class="stat-grid">
      <span>Tech:</span><span class="sv">${me.tech}/${Game.CFG.techWheelSize} (T${me.techTier})</span>
      <span>Armies:</span><span class="sv">${me.armies.length}/${Game.CFG.maxArmies}</span>
      <span>Wagons:</span><span class="sv">${me.wagons.length}/${Game.CFG.maxWagons}</span>
      <span>Resources:</span><span class="sv">${res}</span>
      <span>Gov:</span><span class="sv">${gov}</span>
    </div>`;
  }

  // ── Wizard ────────────────────────────────────────────────

  function renderWizard() {
    if (!state) return;
    if (state.phase === "setup") { renderSetupWizard(); return; }

    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    const me = Game.getPlayer(state, localPlayerId);

    if (state.lastCombat) { renderCombatResult(); return; }
    if (sub.phase === "idle") { renderIdleWizard(isMyTurn, cp, me); return; }
    if (sub.phase === "card_selected") { renderCardSelected(me); return; }
    if (sub.phase === "placing_control") { renderPlacingControl(); return; }
    if (sub.phase === "growth_choice") { renderGrowthChoice(); return; }
    if (sub.phase === "pick_district") { renderPickDistrict(); return; }
    if (sub.phase === "placing_district") { renderPlacingDistrict(); return; }
    if (sub.phase === "reinforcing") { renderReinforcing(); return; }
    if (sub.phase === "move_wagon" || sub.phase === "move_army") { renderMoving(); return; }
    if (sub.phase === "move_army_post" || sub.phase === "move_wagon_post") { renderPostMove(); return; }
    if (sub.phase === "move_army_exploring" || sub.phase === "move_wagon_exploring") { renderExploring(); return; }
    if (sub.phase === "industry_choice") { renderIndustryChoice(me); return; }
    if (sub.phase === "placing_city") { renderPlacingCity(); return; }
    if (sub.phase === "placing_wonder") { renderPlacingWonder(); return; }
  }

  function renderSetupWizard() {
    const activeId = state.setup.order[state.setup.turnIndex];
    const activeP = Game.getPlayer(state, activeId);
    const isMySetupTurn = activeId === localPlayerId;

    if (state.setup.phase === "fortress") {
      if (!isMySetupTurn) {
        dom.wizard.innerHTML = `<div class="wiz-title">Fortress Placement</div><div class="wiz-body">Waiting for <strong>${activeP ? activeP.name : "..."}</strong>.</div>`;
        return;
      }
      dom.wizard.innerHTML = `
        <div class="wiz-title">Place Your Fortress</div>
        <div class="wiz-body">
          Click an <strong>inactive hex</strong> bordering at least 2 active hexes.<br>
          Valid positions glow <strong style="color:#66bb6a">green</strong>.
        </div>`;
      return;
    }

    if (state.setup.phase === "tile" || state.setup.phase === "capital_tile") {
      const isCapitalPhase = state.setup.phase === "capital_tile";
      const phaseLabel = isCapitalPhase ? "Capital Tile Placement" : "Tile Placement";
      const playerTiles = state.setup.playerTiles[activeId] || [];
      if (!isMySetupTurn) {
        dom.wizard.innerHTML = `<div class="wiz-title">${phaseLabel}</div><div class="wiz-body">Waiting for <strong>${activeP ? activeP.name : "..."}</strong>. (${playerTiles.length} remaining)</div>`;
        return;
      }
      if (playerTiles.length === 0) {
        dom.wizard.innerHTML = `<div class="wiz-title">${phaseLabel}</div><div class="wiz-body">All tiles placed! Waiting for others...</div>`;
        return;
      }
      const tileId = playerTiles[0];
      const tile = state.setup.tiles[tileId];
      const tileType = tile ? tile.type.charAt(0).toUpperCase() + tile.type.slice(1) : "?";

      dom.wizard.innerHTML = `
        <div class="wiz-title">${isCapitalPhase ? "Place Your Capital Tile" : `Place Tile: ${tileType} (${tileId})`}</div>
        <div class="wiz-body">
          <div class="tile-preview">${renderTilePreview()}</div>
          <div class="trade-counter">
            <span>Rotation:</span>
            <button id="rot-dec" class="sm">◄ Q</button>
            <span class="tc-val">${sub.tileRotation + 1}/6</span>
            <button id="rot-inc" class="sm">E ►</button>
          </div>
          <div class="trade-counter">
            <span>Side:</span>
            <button id="side-toggle" class="sm">${sub.tileSide}</button>
          </div>
          <br>Hover the map to preview tile placement.<br>
          <strong style="color:#66bb6a">Green</strong> = valid, <strong style="color:#ef5350">Red</strong> = invalid.<br>
          Tiles remaining: <strong>${playerTiles.length}</strong>
        </div>`;

      document.getElementById("rot-dec").addEventListener("click", () => { sub.tileRotation = (sub.tileRotation + 5) % 6; render(); });
      document.getElementById("rot-inc").addEventListener("click", () => { sub.tileRotation = (sub.tileRotation + 1) % 6; render(); });
      document.getElementById("side-toggle").addEventListener("click", () => { sub.tileSide = sub.tileSide === "A" ? "B" : "A"; render(); });
    }
  }

  function renderTilePreview() {
    const offsets = Game.TILE_OFFSETS.map((off) => Game.rotateAxial(off, sub.tileRotation));
    const minQ = Math.min(...offsets.map((o) => o.q));
    const minR = Math.min(...offsets.map((o) => o.r));
    const cells = offsets.map((o) => ({ q: o.q - minQ, r: o.r - minR }));
    const s = 10;
    const w3 = SQRT3 * s;
    let svg = `<svg width="130" height="75" viewBox="-5 -5 130 75">`;
    cells.forEach((c) => {
      const cx = s * SQRT3 * (c.q + c.r / 2) + 5;
      const cy = s * 1.5 * c.r + 15;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push(`${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`);
      }
      const isAnchor = (c.q === (0 - minQ) && c.r === (0 - minR));
      const fill = isAnchor ? "#4fc3f7" : "#4a7c3f";
      svg += `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="#fff3" stroke-width="0.5"/>`;
    });
    svg += `</svg>`;
    return svg;
  }

  function renderCombatResult() {
    const c = state.lastCombat;
    const cls = c.win ? "cr-win" : "cr-lose";
    const txt = c.win ? "VICTORY!" : "DEFEATED";
    dom.wizard.innerHTML = `
      <div class="wiz-title">Combat Result</div>
      <div class="combat-result">
        <div>${c.attacker} vs ${c.defender}</div>
        <div>Attack: d6(${c.atkRoll}) + bonus = <strong>${c.atkTotal}</strong></div>
        <div>Defense: d6(${c.defRoll}) + bonus = <strong>${c.defTotal}</strong></div>
        <div class="${cls}">${txt}</div>
      </div>
      <div class="wiz-actions"><button id="wiz-combat-ok">Continue</button></div>`;
    document.getElementById("wiz-combat-ok").addEventListener("click", () => { state.lastCombat = null; render(); });
  }

  function renderIdleWizard(isMyTurn, cp, me) {
    if (!isMyTurn) {
      dom.wizard.innerHTML = `<div class="wiz-title">Waiting</div><div class="wiz-body">It's <strong>${cp ? cp.name : "..."}</strong>'s turn.</div>`;
      return;
    }
    let actions = `<div class="wiz-actions">`;
    if (me && me.armies.length < Game.CFG.maxArmies) actions += `<button class="sm" id="wiz-recruit-army">Recruit Army</button>`;
    if (me && me.wagons.length < Game.CFG.maxWagons) actions += `<button class="sm" id="wiz-recruit-wagon">Recruit Wagon</button>`;
    actions += `<button class="sm" id="wiz-gov">Assign Gov</button>`;
    actions += `<button id="wiz-end-turn">End Turn</button></div>`;
    dom.wizard.innerHTML = `<div class="wiz-title">Your Turn</div><div class="wiz-body">Select a <strong>focus card</strong> below to take an action.${me && me.cardPlayed ? "<br><em>Card already played this turn.</em>" : ""}</div>${actions}`;
    document.getElementById("wiz-recruit-army")?.addEventListener("click", () => dispatch({ type: "RECRUIT_ARMY", payload: { playerId: localPlayerId } }));
    document.getElementById("wiz-recruit-wagon")?.addEventListener("click", () => dispatch({ type: "RECRUIT_WAGON", payload: { playerId: localPlayerId } }));
    document.getElementById("wiz-gov")?.addEventListener("click", showGovPicker);
    document.getElementById("wiz-end-turn")?.addEventListener("click", () => dispatch({ type: "END_TURN", payload: {} }));
  }

  function renderCardSelected(me) {
    const slot = Game.getSlotValue(me, sub.cardType);
    const tradeAvail = me.trade[sub.cardType];
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
        ${getCardPreview(sub.cardType, me, slot)}
      </div>
      <div class="wiz-actions">
        <button class="primary" id="wiz-start">Start Action</button>
        <button class="ghost" id="wiz-cancel">Cancel</button>
      </div>`;
    document.getElementById("tc-dec").addEventListener("click", () => { sub.tradeSpent = Math.max(0, sub.tradeSpent - 1); renderWizard(); });
    document.getElementById("tc-inc").addEventListener("click", () => { sub.tradeSpent = Math.min(tradeAvail, sub.tradeSpent + 1); renderWizard(); });
    document.getElementById("wiz-start").addEventListener("click", startAction);
    document.getElementById("wiz-cancel").addEventListener("click", cancelAction);
  }

  function renderPlacingControl() {
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
  }

  function renderGrowthChoice() {
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
  }

  function renderPickDistrict() {
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
      btn.addEventListener("click", () => { sub.districtType = btn.dataset.d; startDistrictPlace(); });
    });
    document.getElementById("wiz-back-growth").addEventListener("click", () => { sub.phase = "growth_choice"; renderWizard(); });
  }

  function renderPlacingDistrict() {
    dom.wizard.innerHTML = `
      <div class="wiz-title">Place ${Game.DISTRICT_LABELS[sub.districtType]} District</div>
      <div class="wiz-body">Click a <strong>highlighted hex</strong> adjacent to your city.</div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel4">Cancel</button></div>`;
    document.getElementById("wiz-cancel4").addEventListener("click", cancelAction);
  }

  function renderReinforcing() {
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
  }

  function renderMoving() {
    const unitType = sub.phase === "move_wagon" ? "wagon" : "army";
    const selectingUnit = !sub.selectedUnit;
    dom.wizard.innerHTML = `
      <div class="wiz-title">Move ${unitType === "wagon" ? "Wagon" : "Army"}</div>
      <div class="wiz-body">${selectingUnit
        ? `Click one of your <strong>${unitType}s</strong> on the map.`
        : `Click a <strong>highlighted hex</strong> to move.`}</div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel6">Cancel</button></div>`;
    document.getElementById("wiz-cancel6").addEventListener("click", cancelAction);
  }

  function renderPostMove() {
    const ms = sub.movementState;
    if (!ms) return;
    const unitLabel = ms.unitType === "army" ? "Army" : "Wagon";
    const canExplore = Game.isExploreEligible(state, ms.currentKey) && ms.remaining > 0 && !ms.explored;

    let buttons = `<div class="wiz-actions">`;
    if (ms.remaining > 0) buttons += `<button id="wiz-continue-move">Continue (${ms.remaining} left)</button>`;
    if (canExplore) buttons += `<button id="wiz-explore">Explore</button>`;
    buttons += `<button id="wiz-end-move">End Movement</button></div>`;

    dom.wizard.innerHTML = `
      <div class="wiz-title">${unitLabel} Moved</div>
      <div class="wiz-body">Remaining movement: <strong>${ms.remaining}</strong></div>
      ${buttons}`;

    document.getElementById("wiz-continue-move")?.addEventListener("click", continueMovement);
    document.getElementById("wiz-explore")?.addEventListener("click", startExploration);
    document.getElementById("wiz-end-move").addEventListener("click", endMovement);
  }

  function renderExploring() {
    dom.wizard.innerHTML = `
      <div class="wiz-title">Exploring</div>
      <div class="wiz-body">
        <div class="tile-preview">${renderTilePreview()}</div>
        <div class="trade-counter">
          <span>Rotation:</span>
          <button id="rot-dec" class="sm">◄ Q</button>
          <span class="tc-val">${sub.tileRotation + 1}/6</span>
          <button id="rot-inc" class="sm">E ►</button>
        </div>
        <br>Place the tile touching your unit's hex.<br>
        <strong style="color:#66bb6a">Green</strong> = valid, <strong style="color:#ef5350">Red</strong> = invalid.
        <br>Tiles remaining in stack: <strong>${state.tileStack ? state.tileStack.length : 0}</strong>
      </div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel-explore">Cancel</button></div>`;

    document.getElementById("rot-dec").addEventListener("click", () => { sub.tileRotation = (sub.tileRotation + 5) % 6; render(); });
    document.getElementById("rot-inc").addEventListener("click", () => { sub.tileRotation = (sub.tileRotation + 1) % 6; render(); });
    document.getElementById("wiz-cancel-explore").addEventListener("click", () => {
      const ms = sub.movementState;
      sub.phase = ms.unitType === "army" ? "move_army_post" : "move_wagon_post";
      render();
    });
  }

  function continueMovement() {
    const ms = sub.movementState;
    if (!ms) return;
    sub.phase = ms.unitType === "army" ? "move_army" : "move_wagon";
    sub.selectedUnit = { id: ms.unitId, position: ms.currentKey };
    sub.validHexes = Game.getReachable(state, ms.currentKey, ms.remaining, ms.unitType, localPlayerId);
    render();
  }

  function startExploration() {
    const ms = sub.movementState;
    if (!ms) return;
    sub.phase = ms.unitType === "army" ? "move_army_exploring" : "move_wagon_exploring";
    sub.tileRotation = 0;
    render();
  }

  function endMovement() {
    const ms = sub.movementState;
    if (!ms) { resetSub(); return; }
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { resetSub(); return; }

    if (ms.unitType === "army") {
      const defender = Game.findDefender(state, ms.currentKey, localPlayerId);
      const slot = Game.getSlotValue(me, "military");
      if (defender) {
        dispatch({ type: "PLAY_MILITARY_ATTACK", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey,
          attackPower: slot + sub.tradeSpent, defensePower: defender.power,
          defenderLabel: defender.label, tradeSpent: sub.tradeSpent
        }});
      } else {
        dispatch({ type: "PLAY_MILITARY_MOVE", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey, tradeSpent: sub.tradeSpent
        }});
      }
    } else {
      dispatch({ type: "PLAY_ECONOMY", payload: {
        playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey, tradeSpent: sub.tradeSpent
      }});
    }
    resetSub();
  }

  function computeStepDistance(st, fromKey, toKey, maxSteps, unitType, playerId) {
    if (fromKey === toKey) return 0;
    const visited = new Map([[fromKey, 0]]);
    const queue = [{ key: fromKey, steps: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.steps >= maxSteps) continue;
      const neighbors = Game.hexNeighborKeys(Game.parseQ(cur.key), Game.parseR(cur.key));
      for (const nk of neighbors) {
        if (visited.has(nk)) continue;
        const h = st.map.hexes[nk];
        if (!h || !h.active || h.terrain === "water") continue;
        if (unitType === "wagon" && h.barbarian) continue;
        visited.set(nk, cur.steps + 1);
        if (nk === toKey) return cur.steps + 1;
        queue.push({ key: nk, steps: cur.steps + 1 });
      }
    }
    return maxSteps;
  }

  function renderIndustryChoice(me) {
    const slot = Game.getSlotValue(me, "industry");
    let spentBonus = 0;
    Object.values(sub.spentResources).forEach((v) => { if (v) spentBonus += Game.CFG.resourceProdValue; });
    const totalProd = slot + sub.tradeSpent + spentBonus;
    const resEntries = Object.entries(me.resources).filter(([, v]) => v > 0);
    const resHtml = resEntries.length ? resEntries.map(([k, v]) => {
      const active = sub.spentResources[k] ? " primary" : "";
      return `<button class="sm res-btn${active}" data-r="${k}">${k}(${v}) +${Game.CFG.resourceProdValue}</button>`;
    }).join(" ") : "<em>No resources</em>";

    dom.wizard.innerHTML = `
      <div class="wiz-title">Industry (Production: ${totalProd})</div>
      <div class="wiz-body">Base ${slot} + ${sub.tradeSpent} trade + ${spentBonus} resources<br><div style="margin:6px 0">${resHtml}</div></div>
      <div class="wiz-actions">
        <button id="wiz-build-city">Build City (cost=terrain)</button>
        <button id="wiz-build-wonder">Build Wonder (cost=6)</button>
        <button class="ghost" id="wiz-cancel7">Cancel</button>
      </div>`;
    document.querySelectorAll(".res-btn").forEach((btn) => {
      btn.addEventListener("click", () => { sub.spentResources[btn.dataset.r] = !sub.spentResources[btn.dataset.r]; renderWizard(); });
    });
    document.getElementById("wiz-build-city").addEventListener("click", () => startBuildCity(totalProd));
    document.getElementById("wiz-build-wonder").addEventListener("click", () => startBuildWonder(totalProd));
    document.getElementById("wiz-cancel7").addEventListener("click", cancelAction);
  }

  function renderPlacingCity() {
    dom.wizard.innerHTML = `
      <div class="wiz-title">Place New City</div>
      <div class="wiz-body">Click a <strong>highlighted hex</strong> to build your city.</div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel8">Cancel</button></div>`;
    document.getElementById("wiz-cancel8").addEventListener("click", cancelAction);
  }

  function renderPlacingWonder() {
    dom.wizard.innerHTML = `
      <div class="wiz-title">Build Wonder</div>
      <div class="wiz-body">Click one of your <strong>cities</strong> to build the wonder.</div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel9">Cancel</button></div>`;
    document.getElementById("wiz-cancel9").addEventListener("click", cancelAction);
  }

  function getCardPreview(cardType, player, slot) {
    const spend = sub.tradeSpent;
    switch (cardType) {
      case "culture": return `Markers to place: <strong>${2 + spend}</strong> (terrain ≤ ${slot})`;
      case "growth": return `Place 1 district or reinforce ${slot + spend} markers.`;
      case "science": return `Advance tech by <strong>${slot + spend}</strong>. Current: ${player.tech}/${Game.CFG.techWheelSize}`;
      case "economy": return `Move wagon up to <strong>${Game.CFG.baseWagonMove + spend}</strong> hexes.`;
      case "military": return `Move army up to <strong>${Game.CFG.baseArmyMove + slot - 1}</strong>. Combat: d6 + ${slot + spend}`;
      case "industry": return `Production: <strong>${slot + spend}</strong>. Build city (terrain cost) or wonder (6).`;
      default: return "";
    }
  }

  // ── Action Logic ──────────────────────────────────────────

  function startAction() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;
    const slot = Game.getSlotValue(me, sub.cardType);

    if (sub.cardType === "science") {
      dispatch({ type: "PLAY_SCIENCE", payload: { playerId: localPlayerId, amount: slot + sub.tradeSpent, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
    if (sub.cardType === "culture") {
      sub.phase = "placing_control";
      sub.remaining = 2 + sub.tradeSpent;
      sub.totalMarkers = sub.remaining;
      sub.placedKeys = [];
      sub.validHexes = Game.validControlHexes(state, localPlayerId, slot);
      render(); return;
    }
    if (sub.cardType === "growth") { sub.phase = "growth_choice"; renderWizard(); return; }
    if (sub.cardType === "economy") { sub.phase = "move_wagon"; sub.selectedUnit = null; sub.validHexes = new Set(); render(); return; }
    if (sub.cardType === "military") { sub.phase = "move_army"; sub.selectedUnit = null; sub.validHexes = new Set(); render(); return; }
    if (sub.cardType === "industry") { sub.phase = "industry_choice"; sub.spentResources = {}; renderWizard(); return; }
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
    if (production < 6) { dom.wizard.innerHTML += `<div style="color:var(--danger);margin-top:6px">Need 6 production!</div>`; return; }
    sub.phase = "placing_wonder";
    sub.validHexes = Game.validWonderHexes(state, localPlayerId);
    render();
  }

  function finishAction() {
    if (sub.phase === "placing_control" && sub.placedKeys.length > 0) {
      dispatch({ type: "PLAY_CULTURE", payload: { playerId: localPlayerId, hexKeys: sub.placedKeys, tradeSpent: sub.tradeSpent } });
    }
    if (sub.phase === "reinforcing" && sub.placedKeys.length > 0) {
      dispatch({ type: "PLAY_GROWTH_REINFORCE", payload: { playerId: localPlayerId, hexKeys: sub.placedKeys, tradeSpent: sub.tradeSpent } });
    }
    resetSub();
  }

  function cancelAction() { resetSub(); render(); }

  function resetSub() {
    sub.phase = "idle"; sub.cardType = null; sub.tradeSpent = 0; sub.remaining = 0;
    sub.totalMarkers = 0; sub.validHexes = new Set(); sub.selectedUnit = null;
    sub.districtType = null; sub.spentResources = {}; sub.placedKeys = [];
    sub.movementState = null;
    render();
  }

  // ── Hex Click Handler ─────────────────────────────────────

  function handleHexClick(hexKey) {
    if (!state) return;

    if (state.phase === "setup") {
      const activeId = state.setup.order[state.setup.turnIndex];
      if (activeId !== localPlayerId) return;

      if (state.setup.phase === "fortress") {
        dispatch({ type: "PLACE_FORTRESS", payload: { playerId: localPlayerId, hexKey } });
        return;
      }
      if (state.setup.phase === "tile" || state.setup.phase === "capital_tile") {
        const playerTiles = state.setup.playerTiles[localPlayerId] || [];
        if (playerTiles.length === 0) return;
        const tileId = playerTiles[0];
        const result = Game.validateTilePlacement(state, tileId, hexKey, sub.tileRotation);
        if (!result.ok) return;
        dispatch({ type: "PLACE_TILE", payload: { playerId: localPlayerId, tileId, anchorKey: hexKey, rotation: sub.tileRotation, side: sub.tileSide } });
        return;
      }
      return;
    }

    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;

    if (sub.phase === "placing_control") {
      if (!sub.validHexes.has(hexKey)) return;
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      if (sub.remaining <= 0) finishAction();
      else render();
      return;
    }
    if (sub.phase === "placing_district") {
      if (!sub.validHexes.has(hexKey)) return;
      dispatch({ type: "PLAY_GROWTH_DISTRICT", payload: { playerId: localPlayerId, hexKey, district: sub.districtType, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
    if (sub.phase === "reinforcing") {
      if (!sub.validHexes.has(hexKey)) return;
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      if (sub.remaining <= 0) finishAction();
      else render();
      return;
    }
    if (sub.phase === "move_wagon") {
      if (!sub.selectedUnit) {
        const unit = me.wagons.find((u) => u.position === hexKey);
        if (!unit) return;
        sub.selectedUnit = unit;
        const maxMove = Game.CFG.baseWagonMove + sub.tradeSpent;
        sub.movementState = { unitType: "wagon", unitId: unit.id, maxMove, remaining: maxMove, currentKey: hexKey, startKey: hexKey, explored: false };
        sub.validHexes = Game.getReachable(state, hexKey, maxMove, "wagon", localPlayerId);
        render();
      } else {
        if (!sub.validHexes.has(hexKey)) return;
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "wagon", localPlayerId);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        if (ms.remaining > 0) {
          sub.phase = "move_wagon_post";
          render();
        } else {
          endMovement();
        }
      }
      return;
    }
    if (sub.phase === "move_army") {
      if (!sub.selectedUnit) {
        const unit = me.armies.find((u) => u.position === hexKey);
        if (!unit) return;
        sub.selectedUnit = unit;
        const slot = Game.getSlotValue(me, "military");
        const maxMove = Game.CFG.baseArmyMove + slot - 1;
        sub.movementState = { unitType: "army", unitId: unit.id, maxMove, remaining: maxMove, currentKey: hexKey, startKey: hexKey, explored: false };
        sub.validHexes = Game.getReachable(state, hexKey, maxMove, "army", localPlayerId);
        render();
      } else {
        if (!sub.validHexes.has(hexKey)) return;
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "army", localPlayerId);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        const defender = Game.findDefender(state, hexKey, localPlayerId);
        if (defender) {
          endMovement();
        } else if (ms.remaining > 0) {
          sub.phase = "move_army_post";
          render();
        } else {
          endMovement();
        }
      }
      return;
    }
    if (sub.phase === "move_army_exploring" || sub.phase === "move_wagon_exploring") {
      const ms = sub.movementState;
      if (!state.tileStack || state.tileStack.length === 0) return;
      const tileId = state.tileStack[0];
      const result = Game.validateExploration(state, tileId, hexKey, sub.tileRotation);
      if (!result.ok) return;
      const cellKeys = Game.getTileHexKeys(hexKey, sub.tileRotation, state.map.hexes);
      const touchesUnit = cellKeys.some((ck) =>
        Game.hexNeighborKeys(Game.parseQ(ck), Game.parseR(ck)).includes(ms.currentKey)
      );
      if (!touchesUnit) return;
      dispatch({ type: "EXPLORE_TILE", payload: { playerId: localPlayerId, anchorKey: hexKey, rotation: sub.tileRotation, side: sub.tileSide } });
      ms.remaining -= 1;
      ms.explored = true;
      sub.phase = ms.unitType === "army" ? "move_army_post" : "move_wagon_post";
      render();
      return;
    }
    if (sub.phase === "placing_city") {
      if (!sub.validHexes.has(hexKey)) return;
      const resources = {}; Object.entries(sub.spentResources).forEach(([r, spent]) => { if (spent) resources[r] = 1; });
      dispatch({ type: "PLAY_INDUSTRY_CITY", payload: { playerId: localPlayerId, hexKey, resources, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
    if (sub.phase === "placing_wonder") {
      if (!sub.validHexes.has(hexKey)) return;
      const resources = {}; Object.entries(sub.spentResources).forEach(([r, spent]) => { if (spent) resources[r] = 1; });
      dispatch({ type: "PLAY_INDUSTRY_WONDER", payload: { playerId: localPlayerId, hexKey, resources, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
  }

  // ── Gov Picker ────────────────────────────────────────────

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
      document.getElementById("gov-ok").addEventListener("click", () => { dispatch({ type: "ASSIGN_GOV", payload: { playerId: localPlayerId, markers: selected } }); renderWizard(); });
      document.getElementById("gov-cancel").addEventListener("click", renderWizard);
    };
    renderPicker();
  }

  // ── Event Wheel / Log / Focus Row / Game Over ─────────────

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
    dom.gameLog.innerHTML = `<h3>Game Log</h3>` + state.log.slice(-20).reverse().map((msg) => `<div class="log-entry">${msg}</div>`).join("");
  }

  function renderFocusRow() {
    if (!state || state.phase !== "playing") return;
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
          sub.phase = "card_selected";
          sub.cardType = el.dataset.card;
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
