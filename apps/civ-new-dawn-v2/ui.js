"use strict";

const UI = (() => {
  let state = null;
  let localPlayerId = null;

  // Canvas
  let canvas = null;
  let ctx = null;
  let HEX_SIZE = 30;
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

  // Animation system
  const anims = {
    hexFlashes: [],  // { key, color, startTime, duration }
    validPulse: 0
  };

  function flashHex(hexKey, color, duration) {
    anims.hexFlashes.push({ key: hexKey, color, startTime: performance.now(), duration: duration || 600 });
  }

  function flashHexes(keys, color, duration) {
    keys.forEach((k) => flashHex(k, color, duration));
  }

  let animFrameId = null;
  function startAnimLoop() {
    if (animFrameId) return;
    (function tick() {
      animFrameId = requestAnimationFrame(tick);
      anims.validPulse = (performance.now() % 2000) / 2000;
      const now = performance.now();
      const hadFlashes = anims.hexFlashes.length > 0;
      anims.hexFlashes = anims.hexFlashes.filter((f) => now - f.startTime < f.duration);
      if (hadFlashes || anims.hexFlashes.length > 0 || sub.validHexes.size > 0) {
        renderCanvas();
      }
    })();
  }

  const dom = {};

  // Toast system
  let toastTimeout = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  // Action notification toast
  let actionToastTimeout = null;
  function showActionToast(msg) {
    const el = document.getElementById("action-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(actionToastTimeout);
    actionToastTimeout = setTimeout(() => el.classList.add("hidden"), 3000);
  }

  // Chat
  const chatHistory = [];
  function sendChat(text) {
    if (!text.trim()) return;
    const me = state && state.players.find((p) => p.id === localPlayerId);
    const msg = { type: "chat", sender: localPlayerId, name: me ? me.name : "???", text: text.trim(), ts: Date.now() };
    chatHistory.push(msg);
    Net.broadcastChat(msg);
    renderLog();
  }

  // Help text lookup
  function helpText(phase) {
    const helps = {
      idle: "Click a focus card below to take your turn action. Cards in higher slots are more powerful.",
      card_selected: "Spend trade tokens for extra power. Click 'Start Action' when ready.",
      placing_control: "Click green hexes adjacent to your cities/control to claim territory.",
      move_army: "Click your army, then click a green hex to move it.",
      move_army_post: "Choose what to do next: continue moving, explore, attack, or end.",
      move_caravan: "Click your caravan, then a green hex. Visit city-states to gain trade tokens.",
      choosing_district: "Select a district type to build on your controlled hex.",
      industry_choice: "Choose to build a city or a wonder with your production.",
      exploring: "Use R to rotate, F to flip. Click a valid hex to place the tile.",
      growth_choice: "Choose a hex near your city to build a district or fortify.",
      waiting: "Waiting for other player's turn..."
    };
    return helps[phase] || "";
  }

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
    document.getElementById("btn-new-game").addEventListener("click", () => {
      if (!confirm("Start a new game? Current progress will be lost.")) return;
      state = null;
      localPlayerId = null;
      try { localStorage.removeItem("civ-nd-save"); } catch(e) {}
      resetSub();
      dom.game.classList.add("hidden");
      dom.lobby.classList.remove("hidden");
    });

    Net.init({
      onState: (payload) => {
        if (Net.getIsHost()) dispatch(payload);
        else {
          state = payload;
          try { localStorage.setItem("civ-nd-save", JSON.stringify({ state, localPlayerId })); } catch(e) {}
          render();
        }
      },
      onJoin: (peerId, name, color) => {
        const player = Game.createPlayer(peerId, name, color);
        state = Game.applyAction(state, { type: "ADD_PLAYER", payload: player });
        Net.broadcast(state);
        render();
      },
      onDisconnect: () => {
        document.getElementById("conn-banner").textContent = "Connection lost — attempting to reconnect...";
        document.getElementById("conn-banner").classList.remove("hidden");
        showToast("Connection lost");
      },
      onConnected: () => { if (Net.getIsHost() && state) Net.broadcast(state); },
      onChat: (msg) => { chatHistory.push(msg); renderLog(); }
    });

    document.getElementById("chat-send").addEventListener("click", () => {
      const inp = document.getElementById("chat-input");
      sendChat(inp.value);
      inp.value = "";
    });
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { sendChat(e.target.value); e.target.value = ""; }
    });

    try {
      const saved = localStorage.getItem("civ-nd-save");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.state && data.localPlayerId) {
          const resumeBtn = document.createElement("button");
          resumeBtn.textContent = "Resume Saved Game";
          resumeBtn.style.marginTop = "8px";
          const clearBtn = document.createElement("button");
          clearBtn.textContent = "Delete Save";
          clearBtn.className = "ghost";
          clearBtn.style.marginTop = "4px";
          dom.lobbyStatus.textContent = "Saved game found.";
          dom.lobby.querySelector(".lobby-actions").appendChild(resumeBtn);
          dom.lobby.querySelector(".lobby-actions").appendChild(clearBtn);
          resumeBtn.addEventListener("click", () => {
            state = data.state;
            localPlayerId = data.localPlayerId;
            Net.startLocal();
            showGame();
            render();
          });
          clearBtn.addEventListener("click", () => {
            localStorage.removeItem("civ-nd-save");
            resumeBtn.remove();
            clearBtn.remove();
            dom.lobbyStatus.textContent = "Save deleted.";
          });
        }
      }
    } catch(e) {}
  }

  function startLocal() {
    try { localStorage.removeItem("civ-nd-save"); } catch(e) {}
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
    if (typeof Peer === "undefined") { dom.lobbyStatus.textContent = "Multiplayer unavailable (PeerJS not loaded). Use Local Solo."; return; }
    try { localStorage.removeItem("civ-nd-save"); } catch(e) {}
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
    if (typeof Peer === "undefined") { dom.lobbyStatus.textContent = "Multiplayer unavailable (PeerJS not loaded). Use Local Solo."; return; }
    try { localStorage.removeItem("civ-nd-save"); } catch(e) {}
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
    startAnimLoop();
  }

  function dispatch(action) {
    if (!state) return;
    if (Net.getIsHost()) {
      state = Game.applyAction(state, action);
      Net.broadcast(state);
      try { localStorage.setItem("civ-nd-save", JSON.stringify({ state, localPlayerId })); } catch(e) {}
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
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -2 : 2;
      HEX_SIZE = Math.max(15, Math.min(60, HEX_SIZE + delta));
      renderCanvas();
    }, { passive: false });
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
        (sub.phase === "move_army_exploring" || sub.phase === "move_caravan_exploring") &&
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

    // Layer 4: Valid hex highlights (pulsing)
    const pulseAlpha = 0.15 + 0.15 * Math.sin(anims.validPulse * Math.PI * 2);
    combinedValid.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      hexPath(p.x, p.y, HEX_SIZE - 2);
      ctx.fillStyle = `rgba(102,187,106,${pulseAlpha.toFixed(2)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(102,187,106,${(0.5 + pulseAlpha).toFixed(2)})`;
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

    // Layer 7: Current unit position during movement
    if (sub.movementState && sub.movementState.currentKey) {
      const curHex = hexes[sub.movementState.currentKey];
      if (curHex) {
        const p = axialToPixel(curHex.q, curHex.r);
        hexPath(p.x, p.y, HEX_SIZE + 2);
        ctx.strokeStyle = "#4fc3f7";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Layer 7b: Selected unit indicator
    if (sub.selectedUnit && sub.selectedUnit.position) {
      const sh = hexes[sub.selectedUnit.position];
      if (sh) {
        const p = axialToPixel(sh.q, sh.r);
        hexPath(p.x, p.y, HEX_SIZE + 4);
        ctx.strokeStyle = "#ffd54f";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Layer 8: Hover ring
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

    // Layer 9: Hex flash animations
    const now = performance.now();
    anims.hexFlashes.forEach((f) => {
      const h = hexes[f.key];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      const progress = (now - f.startTime) / f.duration;
      const alpha = 1.0 - progress;
      const size = HEX_SIZE + progress * 8;
      hexPath(p.x, p.y, size);
      ctx.fillStyle = f.color.replace(")", `,${(alpha * 0.5).toFixed(2)})`).replace("rgb", "rgba");
      ctx.fill();
      ctx.strokeStyle = f.color.replace(")", `,${alpha.toFixed(2)})`).replace("rgb", "rgba");
      ctx.lineWidth = 3 * alpha;
      ctx.stroke();
    });
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

    let tileId = null;
    let tile = null;
    if (state.phase === "setup") {
      const playerTiles = state.setup.playerTiles[localPlayerId] || [];
      tileId = playerTiles[0];
      tile = tileId ? state.setup.tiles[tileId] : null;
    } else if (sub.phase === "move_army_exploring" || sub.phase === "move_caravan_exploring") {
      tileId = state.tileStack ? state.tileStack[0] : null;
      tile = tileId ? state.tiles[tileId] : null;
    }

    const ghostKeyArr = mouseHex ? Game.getTileHexKeys(
      Game.key(mouseHex.q, mouseHex.r), sub.tileRotation, hexes
    ) : [];
    const isCapitalTile = tile && tile.type === "capital";
    const capitalGhostKey = isCapitalTile ? ghostKeyArr[6] : null;
    const anchorKey = mouseHex ? Game.key(mouseHex.q, mouseHex.r) : null;

    const CAP_TERRAIN_COLORS = [
      "#8b7355", "#4a7c3f", "#2d5a27", "#8b7355",
      "#2d5a27", "#4a7c3f", "#4a7c3f", "#c4a35a",
      "#8b7355", "#4a7c3f"
    ];
    const GENERIC_TERRAIN = [
      "#4a7c3f", "#2d5a27", "#8b7355", "#4a7c3f",
      "#c4a35a", "#4a7c3f", "#8b7355", "#2d5a27",
      "#4a7c3f", "#8b7355"
    ];

    ghostKeys.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      hexPath(p.x, p.y, HEX_SIZE);

      if (h.active) {
        ctx.fillStyle = "rgba(239,83,80,0.35)";
        ctx.fill();
      } else if (tile) {
        const idx = ghostKeyArr.indexOf(k);
        if (isCapitalTile) {
          ctx.fillStyle = idx >= 0 ? CAP_TERRAIN_COLORS[idx] : fillColor;
        } else if (tile.type === "natural" && k === anchorKey) {
          ctx.fillStyle = "#9c27b0";
        } else if (tile.type === "citystate" && k === anchorKey) {
          ctx.fillStyle = "#ff9800";
        } else {
          ctx.fillStyle = idx >= 0 ? GENERIC_TERRAIN[idx] : fillColor;
        }
        ctx.globalAlpha = valid ? 0.7 : 0.4;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }

      if (!tile) return;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (k === capitalGhostKey) {
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("★ CAP", p.x, p.y);
      } else if (k === anchorKey && tile.type === "natural") {
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("★ WND", p.x, p.y);
      } else if (k === anchorKey && tile.type === "citystate") {
        ctx.font = "bold 9px sans-serif";
        ctx.fillText("⬟ CS", p.x, p.y);
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

    if (h.fortress && !h.city) {
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
      ctx.fillText(u.type === "army" ? "A" : "C", cx, cy + yOff);
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
    if (sub.phase === "move_army_exploring" || sub.phase === "move_caravan_exploring") {
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

    if (state.lastAction && state.lastAction.playerId !== localPlayerId) {
      const elapsed = Date.now() - state.lastAction.ts;
      if (elapsed < 4000) {
        const ap = state.players.find((p) => p.id === state.lastAction.playerId);
        const labels = { PLAY_CULTURE: "placed control markers", PLAY_GROWTH: "built a district", PLAY_SCIENCE: "advanced tech", PLAY_ECONOMY: "moved a caravan", PLAY_MILITARY_MOVE: "moved an army", PLAY_MILITARY_ATTACK: "attacked!", PLAY_INDUSTRY_CITY: "built a city", PLAY_INDUSTRY_WONDER: "built a wonder", EXPLORE_TILE: "explored a tile", END_TURN: "ended their turn" };
        const desc = labels[state.lastAction.type] || state.lastAction.type;
        showActionToast(`${ap ? ap.name : "Opponent"} ${desc}`);
      }
    }
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
      if (state.tileStack) dom.hdrRoom.textContent = `Tiles: ${state.tileStack.length}`;
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
    const maxA = Game.CFG.maxArmies + (me.techTier >= 3 ? 1 : 0);
    const maxW = Game.CFG.maxCaravans + (me.techTier >= 3 ? 1 : 0);
    const tiers = me.cardTiers ? Game.FOCUS_TYPES.map((f) => `${Game.FOCUS_LABELS[f][0]}${me.cardTiers[f] || 1}`).join(" ") : "";
    const builtWonders = new Set();
    const myWonders = [];
    if (state) Object.values(state.map.hexes).forEach((h) => {
      if (h.city && h.city.wonder) {
        builtWonders.add(h.city.wonder.name);
        if (h.city.ownerId === localPlayerId) myWonders.push(h.city.wonder.name);
      }
    });
    const myWonderStr = myWonders.length ? myWonders.join(", ") : "none";
    const availableWonders = Game.ALL_WONDERS.filter((w) => !builtWonders.has(w.name));
    const wonderList = Object.entries(Game.WONDER_ERAS).map(([era, data]) => {
      const avail = data.wonders.filter((w) => !builtWonders.has(w.name));
      if (avail.length === 0) return "";
      return `<div style="margin-top:2px"><strong style="font-size:10px">${era.charAt(0).toUpperCase() + era.slice(1)} (${data.cost})</strong>: ${avail.map((w) => `<span title="${w.effect}" style="cursor:help">${w.name}</span>`).join(", ")}</div>`;
    }).join("");
    dom.myStats.innerHTML = `<h3>My Stats</h3><div class="stat-grid">
      <span>Tech:</span><span class="sv">${me.tech}/${Game.CFG.techWheelSize} (T${me.techTier})</span>
      <span>Card Tiers:</span><span class="sv">${tiers}</span>
      <span>Armies:</span><span class="sv">${me.armies.length}/${maxA}</span>
      <span>Caravans:</span><span class="sv">${me.caravans.length}/${maxW}</span>
      <span>Resources:</span><span class="sv">${res}</span>
      <span>Gov:</span><span class="sv">${gov}</span>
      <span>My Wonders:</span><span class="sv">${myWonderStr}</span>
    </div>
    <details style="margin-top:6px;font-size:11px"><summary style="cursor:pointer;color:var(--accent)">Available Wonders (${availableWonders.length})</summary>
      ${wonderList}
    </details>`;
  }

  // ── Wizard ────────────────────────────────────────────────

  function renderWizard() {
    if (!state) return;
    if (state.phase === "setup") { renderSetupWizard(); return; }

    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    const me = Game.getPlayer(state, localPlayerId);

    if (state.lastCombat) { renderCombatResult(); return; }
    if (state.pendingBarbReward && state.pendingBarbReward.playerId === localPlayerId) { renderBarbReward(me); return; }
    if (sub.phase === "idle") { renderIdleWizard(isMyTurn, cp, me); }
    else if (sub.phase === "card_selected") { renderCardSelected(me); }
    else if (sub.phase === "placing_control") { renderPlacingControl(); }
    else if (sub.phase === "growth_choice") { renderGrowthChoice(); }
    else if (sub.phase === "pick_district") { renderPickDistrict(); }
    else if (sub.phase === "placing_district") { renderPlacingDistrict(); }
    else if (sub.phase === "reinforcing") { renderReinforcing(); }
    else if (sub.phase === "move_caravan" || sub.phase === "move_army") { renderMoving(); }
    else if (sub.phase === "combat_prep") { renderCombatPrep(); }
    else if (sub.phase === "move_army_post" || sub.phase === "move_caravan_post") { renderPostMove(); }
    else if (sub.phase === "move_army_exploring" || sub.phase === "move_caravan_exploring") { renderExploring(); }
    else if (sub.phase === "industry_choice") { renderIndustryChoice(me); }
    else if (sub.phase === "placing_city") { renderPlacingCity(); }
    else if (sub.phase === "placing_wonder") { renderPlacingWonder(); }
    else if (sub.phase === "picking_wonder") { renderPickingWonder(); }
    else { return; }

    const help = helpText(sub.phase);
    if (help) dom.wizard.insertAdjacentHTML("beforeend", `<div class="wiz-help">${help}</div>`);
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
          This is a neutral defensive hex (defense ${Game.CFG.fortressDefense}). Your capital will go on your hometown tile next.<br>
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
    const cells = offsets.map((o, i) => ({ q: o.q - minQ, r: o.r - minR, idx: i }));
    const s = 10;
    let svg = `<svg width="130" height="75" viewBox="-5 -5 130 75">`;

    let tile = null;
    if (state && state.phase === "setup") {
      const playerTiles = state.setup.playerTiles[localPlayerId] || [];
      tile = playerTiles[0] ? state.setup.tiles[playerTiles[0]] : null;
    } else if (state && (sub.phase === "move_army_exploring" || sub.phase === "move_caravan_exploring")) {
      const tid = state.tileStack ? state.tileStack[0] : null;
      tile = tid ? state.tiles[tid] : null;
    }
    const capColors = ["#8b7355", "#4a7c3f", "#2d5a27", "#8b7355", "#2d5a27", "#4a7c3f", "#4a7c3f", "#c4a35a", "#8b7355", "#4a7c3f"];
    const genColors = ["#4a7c3f", "#2d5a27", "#8b7355", "#4a7c3f", "#c4a35a", "#4a7c3f", "#8b7355", "#2d5a27", "#4a7c3f", "#8b7355"];
    const tileType = tile ? tile.type : "normal";

    cells.forEach((c) => {
      const cx = s * SQRT3 * (c.q + c.r / 2) + 5;
      const cy = s * 1.5 * c.r + 15;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push(`${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`);
      }
      const isAnchor = (c.q === (0 - minQ) && c.r === (0 - minR));
      const isCapHex = c.idx === 6;
      let fill, label = "";
      if (tileType === "capital") {
        fill = isCapHex ? "#ffd54f" : capColors[c.idx];
        if (isCapHex) label = "C";
      } else if (tileType === "natural") {
        fill = isAnchor ? "#9c27b0" : genColors[c.idx];
        if (isAnchor) label = "W";
      } else if (tileType === "citystate") {
        fill = isAnchor ? "#ff9800" : genColors[c.idx];
        if (isAnchor) label = "CS";
      } else {
        fill = genColors[c.idx];
      }
      svg += `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="#fff3" stroke-width="0.5"/>`;
      if (label) {
        svg += `<text x="${cx}" y="${cy + 1}" fill="${tileType === "capital" ? "#000" : "#fff"}" font-size="6" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
      }
    });
    svg += `</svg>`;
    return svg;
  }

  function renderBarbReward(me) {
    dom.wizard.innerHTML = `
      <div class="wiz-title">Barbarian Defeated!</div>
      <div class="wiz-body">Choose a focus card to receive +1 trade token:</div>
      <div class="wiz-actions" style="flex-wrap:wrap">
        ${Game.FOCUS_TYPES.map((f) => {
          const current = me.trade[f];
          return `<button class="sm barb-pick" data-type="${f}">${Game.FOCUS_LABELS[f]} (${current}/${Game.CFG.maxTrade})</button>`;
        }).join("")}
      </div>`;
    document.querySelectorAll(".barb-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        dispatch({ type: "ADD_TRADE", payload: { playerId: localPlayerId, cardType: btn.dataset.type, amount: 1 } });
      });
    });
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
    const maxArmies = Game.CFG.maxArmies + (me && me.techTier >= 3 ? 1 : 0);
    const maxCaravans = Game.CFG.maxCaravans + (me && me.techTier >= 3 ? 1 : 0);
    if (me && me.armies.length < maxArmies) actions += `<button class="sm" id="wiz-recruit-army">Recruit Army</button>`;
    if (me && me.caravans.length < maxCaravans) actions += `<button class="sm" id="wiz-recruit-caravan">Recruit Caravan</button>`;
    actions += `<button class="sm" id="wiz-gov">Assign Gov</button>`;
    actions += `<button id="wiz-end-turn">End Turn</button></div>`;
    dom.wizard.innerHTML = `<div class="wiz-title">Your Turn</div><div class="wiz-body">Select a <strong>focus card</strong> below to take an action.${me && me.cardPlayed ? "<br><em>Card already played this turn.</em>" : ""}</div>${actions}`;
    document.getElementById("wiz-recruit-army")?.addEventListener("click", () => dispatch({ type: "RECRUIT_ARMY", payload: { playerId: localPlayerId } }));
    document.getElementById("wiz-recruit-caravan")?.addEventListener("click", () => dispatch({ type: "RECRUIT_CARAVAN", payload: { playerId: localPlayerId } }));
    document.getElementById("wiz-gov")?.addEventListener("click", showGovPicker);
    document.getElementById("wiz-end-turn")?.addEventListener("click", () => dispatch({ type: "END_TURN", payload: { playerId: localPlayerId } }));
  }

  function renderCardSelected(me) {
    const slot = Game.getSlotValue(me, sub.cardType, state);
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
    const unitType = sub.phase === "move_caravan" ? "caravan" : "army";
    const selectingUnit = !sub.selectedUnit;
    const ms = sub.movementState;
    const remaining = ms ? ` (${ms.remaining} moves left)` : "";
    dom.wizard.innerHTML = `
      <div class="wiz-title">Move ${unitType === "caravan" ? "Caravan" : "Army"}${remaining}</div>
      <div class="wiz-body">${selectingUnit
        ? `Click one of your <strong>${unitType}s</strong> on the map.`
        : `Click a <strong>highlighted hex</strong> to move.`}</div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel6">Cancel</button></div>`;
    document.getElementById("wiz-cancel6").addEventListener("click", cancelAction);
  }

  function renderPostMove() {
    const ms = sub.movementState;
    if (!ms) return;
    const unitLabel = ms.unitType === "army" ? "Army" : "Caravan";
    const canExplore = Game.isExploreEligible(state, ms.currentKey) && ms.remaining > 0 && !ms.explored;
    const defender = ms.unitType === "army" ? Game.findDefender(state, ms.currentKey, localPlayerId) : null;

    let buttons = `<div class="wiz-actions">`;
    if (defender) buttons += `<button id="wiz-attack" class="primary">Attack ${defender.label} (pow ${defender.power})</button>`;
    if (ms.remaining > 0) buttons += `<button id="wiz-continue-move">Continue (${ms.remaining} left)</button>`;
    if (canExplore) buttons += `<button id="wiz-explore">Explore</button>`;
    buttons += `<button id="wiz-end-move">${defender ? "Retreat" : "End Movement"}</button></div>`;

    const bodyText = defender
      ? `<strong style="color:#ef5350">${defender.label}</strong> here! (power ${defender.power})`
      : `Remaining movement: <strong>${ms.remaining}</strong>`;

    dom.wizard.innerHTML = `
      <div class="wiz-title">${unitLabel} ${defender ? "— Encounter!" : "Moved"}</div>
      <div class="wiz-body">${bodyText}</div>
      ${buttons}`;

    document.getElementById("wiz-attack")?.addEventListener("click", () => {
      sub.phase = "combat_prep";
      sub.combatTradeSpent = 0;
      render();
    });
    document.getElementById("wiz-continue-move")?.addEventListener("click", continueMovement);
    document.getElementById("wiz-explore")?.addEventListener("click", startExploration);
    document.getElementById("wiz-end-move").addEventListener("click", () => {
      if (defender) {
        ms.currentKey = ms.startKey;
      }
      endMovement();
    });
  }

  function renderCombatPrep() {
    const ms = sub.movementState;
    if (!ms) return;
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;
    const defender = Game.findDefender(state, ms.currentKey, localPlayerId);
    if (!defender) { endMovement(); return; }
    const slot = Game.getSlotValue(me, "military", state);
    const tierBonus = Game.getMilitaryCombatBonus(me);
    const totalAttack = slot + sub.tradeSpent + (sub.combatTradeSpent || 0);
    const milTrade = me.trade.military;

    dom.wizard.innerHTML = `
      <div class="wiz-title">Combat Preparation</div>
      <div class="wiz-body">
        <div>Defender: <strong style="color:#ef5350">${defender.label}</strong> (power ${defender.power})</div>
        <div>Your attack: d6 + <strong>${totalAttack}</strong>${tierBonus ? ` +${tierBonus} tier` : ""}</div>
        <div style="margin-top:6px">Spend military trade for +1 combat each:</div>
        <div class="trade-counter">
          <span>Extra trade:</span>
          <button id="ct-dec" class="sm">−</button>
          <span class="tc-val" id="ct-val">${sub.combatTradeSpent || 0}</span>
          <button id="ct-inc" class="sm">+</button>
          <span style="color:var(--text2);margin-left:4px">(${milTrade} available)</span>
        </div>
      </div>
      <div class="wiz-actions">
        <button class="primary" id="wiz-fight">Fight!</button>
        <button class="ghost" id="wiz-retreat">Retreat</button>
      </div>`;
    document.getElementById("ct-dec").addEventListener("click", () => {
      sub.combatTradeSpent = Math.max(0, (sub.combatTradeSpent || 0) - 1);
      renderWizard();
    });
    document.getElementById("ct-inc").addEventListener("click", () => {
      sub.combatTradeSpent = Math.min(milTrade, (sub.combatTradeSpent || 0) + 1);
      renderWizard();
    });
    document.getElementById("wiz-fight").addEventListener("click", () => {
      const extraTrade = sub.combatTradeSpent || 0;
      sub.tradeSpent += extraTrade;
      endMovement();
    });
    document.getElementById("wiz-retreat").addEventListener("click", () => {
      ms.currentKey = ms.startKey;
      endMovement();
    });
  }

  function renderExploring() {
    const expTileId = state.tileStack ? state.tileStack[0] : null;
    const expTile = expTileId ? state.tiles[expTileId] : null;
    const expType = expTile ? expTile.type.charAt(0).toUpperCase() + expTile.type.slice(1) : "?";
    dom.wizard.innerHTML = `
      <div class="wiz-title">Exploring: ${expType} Tile</div>
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
        <br>Place the tile touching your unit's hex.<br>
        <strong style="color:#66bb6a">Green</strong> = valid, <strong style="color:#ef5350">Red</strong> = invalid.
        <br>Tiles remaining in stack: <strong>${state.tileStack ? state.tileStack.length : 0}</strong>
      </div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel-explore">Cancel</button></div>`;

    document.getElementById("rot-dec").addEventListener("click", () => { sub.tileRotation = (sub.tileRotation + 5) % 6; render(); });
    document.getElementById("rot-inc").addEventListener("click", () => { sub.tileRotation = (sub.tileRotation + 1) % 6; render(); });
    document.getElementById("side-toggle").addEventListener("click", () => { sub.tileSide = sub.tileSide === "A" ? "B" : "A"; render(); });
    document.getElementById("wiz-cancel-explore").addEventListener("click", () => {
      const ms = sub.movementState;
      sub.phase = ms.unitType === "army" ? "move_army_post" : "move_caravan_post";
      render();
    });
  }

  function continueMovement() {
    const ms = sub.movementState;
    if (!ms) return;
    sub.phase = ms.unitType === "army" ? "move_army" : "move_caravan";
    sub.selectedUnit = { id: ms.unitId, position: ms.currentKey };
    sub.validHexes = Game.getReachable(state, ms.currentKey, ms.remaining, ms.unitType, localPlayerId);
    render();
  }

  function startExploration() {
    const ms = sub.movementState;
    if (!ms) return;
    sub.phase = ms.unitType === "army" ? "move_army_exploring" : "move_caravan_exploring";
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
      const slot = Game.getSlotValue(me, "military", state);
      if (defender) {
        flashHex(ms.currentKey, "rgb(239,83,80)", 800);
        dispatch({ type: "PLAY_MILITARY_ATTACK", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey,
          fromKey: ms.startKey, attackPower: slot + sub.tradeSpent,
          defensePower: defender.power, defenderLabel: defender.label, tradeSpent: sub.tradeSpent
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
    const me = Game.getPlayer(st, playerId);
    const waterOk = me && (() => {
      const tier = Game.getCardTier(me, unitType === "caravan" ? "economy" : "military");
      const wt = Game.CARD_TIERS[unitType === "caravan" ? "economy" : "military"].water;
      return wt && tier >= wt;
    })();
    const visited = new Map([[fromKey, 0]]);
    const queue = [{ key: fromKey, steps: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.steps >= maxSteps) continue;
      const neighbors = Game.hexNeighborKeys(Game.parseQ(cur.key), Game.parseR(cur.key));
      for (const nk of neighbors) {
        if (visited.has(nk)) continue;
        const h = st.map.hexes[nk];
        if (!h || !h.active) continue;
        if (h.terrain === "water" && !waterOk) continue;
        if (unitType === "caravan" && h.barbarian) continue;
        visited.set(nk, cur.steps + 1);
        if (nk === toKey) return cur.steps + 1;
        queue.push({ key: nk, steps: cur.steps + 1 });
      }
    }
    return maxSteps;
  }

  function renderIndustryChoice(me) {
    const slot = Game.getSlotValue(me, "industry", state);
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
        <button id="wiz-build-city">Build City (cost=terrain, range=${Game.getCityRange(me)})</button>
        <button id="wiz-build-wonder">Build Wonder (7/9/12)</button>
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
    const wonderName = sub.selectedWonder ? sub.selectedWonder.name : "Wonder";
    dom.wizard.innerHTML = `
      <div class="wiz-title">Build ${wonderName}</div>
      <div class="wiz-body">Click one of your <strong>cities</strong> to build the wonder.</div>
      <div class="wiz-actions"><button class="ghost" id="wiz-cancel9">Cancel</button></div>`;
    document.getElementById("wiz-cancel9").addEventListener("click", cancelAction);
  }

  function renderPickingWonder() {
    const prod = sub.wonderProduction || 0;
    const builtWonders = new Set();
    Object.values(state.map.hexes).forEach((h) => { if (h.city && h.city.wonder) builtWonders.add(h.city.wonder.name); });

    const eras = Object.entries(Game.WONDER_ERAS).map(([eraName, eraData]) => {
      const affordable = prod >= eraData.cost;
      const available = eraData.wonders.filter((w) => !builtWonders.has(w.name));
      return { eraName, cost: eraData.cost, affordable, available };
    });

    let html = `<div class="wiz-title">Choose Wonder (Production: ${prod})</div><div class="wiz-body" style="max-height:260px;overflow-y:auto">`;
    eras.forEach((era) => {
      html += `<div style="margin-bottom:8px"><strong>${era.eraName.charAt(0).toUpperCase() + era.eraName.slice(1)} (cost ${era.cost})</strong>`;
      if (!era.affordable) html += ` <span style="color:var(--danger)">— need ${era.cost}</span>`;
      html += `</div>`;
      era.available.forEach((w) => {
        const disabled = era.affordable ? "" : " disabled";
        html += `<button class="sm wonder-pick${disabled}" data-name="${w.name}" style="margin:2px;text-align:left;display:block;width:100%"${disabled ? " disabled" : ""}>
          <strong>${w.name}</strong><br><span style="font-size:10px;opacity:0.8">${w.effect}</span>
        </button>`;
      });
      if (era.available.length === 0) html += `<div style="opacity:0.5;font-size:11px">All built</div>`;
    });
    html += `</div><div class="wiz-actions"><button class="ghost" id="wiz-cancel-wonder">Cancel</button></div>`;

    dom.wizard.innerHTML = html;
    document.querySelectorAll(".wonder-pick:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wonder = Game.ALL_WONDERS.find((w) => w.name === btn.dataset.name);
        if (!wonder) return;
        sub.selectedWonder = wonder;
        sub.phase = "placing_wonder";
        sub.validHexes = Game.validWonderHexes(state, localPlayerId);
        render();
      });
    });
    document.getElementById("wiz-cancel-wonder").addEventListener("click", cancelAction);
  }

  function getCardPreview(cardType, player, slot) {
    const spend = sub.tradeSpent;
    const tier = Game.getCardTier(player, cardType);
    switch (cardType) {
      case "culture": {
        const markers = Game.getCultureMarkers(player, spend, state);
        return `Markers to place: <strong>${markers}</strong> (terrain ≤ ${slot + spend}) [Tier ${tier}]`;
      }
      case "growth": return `Place 1 district or reinforce ${slot + spend} markers. [Tier ${tier}]`;
      case "science": return `Advance tech by <strong>${slot + spend}</strong>. Current: ${player.tech}/${Game.CFG.techWheelSize} [Tier ${tier}]`;
      case "economy": {
        const move = Game.getEconomyMove(player) + spend;
        return `Move caravan up to <strong>${move}</strong> hexes. [Tier ${tier}]`;
      }
      case "military": {
        const move = Game.getMilitaryMove(player) + spend;
        const combatBonus = Game.getMilitaryCombatBonus(player);
        return `Move army up to <strong>${move}</strong> hexes. Combat: d6 + ${slot + spend}${combatBonus ? ` +${combatBonus} tier` : ""} [Tier ${tier}]`;
      }
      case "industry": {
        const range = Game.getCityRange(player);
        return `Production: <strong>${slot + spend}</strong>. City range: ${range}. [Tier ${tier}]`;
      }
      default: return "";
    }
  }

  // ── Action Logic ──────────────────────────────────────────

  function startAction() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;
    const slot = Game.getSlotValue(me, sub.cardType, state);

    if (sub.cardType === "science") {
      dispatch({ type: "PLAY_SCIENCE", payload: { playerId: localPlayerId, amount: slot + sub.tradeSpent, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
    if (sub.cardType === "culture") {
      sub.phase = "placing_control";
      const effectiveSlot = slot + sub.tradeSpent;
      sub.remaining = Game.getCultureMarkers(me, sub.tradeSpent, state);
      sub.totalMarkers = sub.remaining;
      sub.placedKeys = [];
      sub.validHexes = Game.validControlHexes(state, localPlayerId, effectiveSlot);
      render(); return;
    }
    if (sub.cardType === "growth") { sub.phase = "growth_choice"; renderWizard(); return; }
    if (sub.cardType === "economy") { sub.phase = "move_caravan"; sub.selectedUnit = null; sub.validHexes = new Set(); render(); return; }
    if (sub.cardType === "military") { sub.phase = "move_army"; sub.selectedUnit = null; sub.validHexes = new Set(); render(); return; }
    if (sub.cardType === "industry") { sub.phase = "industry_choice"; sub.spentResources = {}; renderWizard(); return; }
  }

  function startDistrictPlace() {
    const me = Game.getPlayer(state, localPlayerId);
    const slot = Game.getSlotValue(me, "growth", state);
    sub.phase = "placing_district";
    sub.validHexes = Game.validDistrictHexes(state, localPlayerId, slot);
    render();
  }

  function startReinforce() {
    const me = Game.getPlayer(state, localPlayerId);
    const slot = Game.getSlotValue(me, "growth", state);
    sub.phase = "reinforcing";
    sub.remaining = slot + sub.tradeSpent;
    sub.totalMarkers = sub.remaining;
    sub.placedKeys = [];
    sub.validHexes = Game.validReinforceHexes(state, localPlayerId);
    render();
  }

  function startBuildCity(production) {
    const me = Game.getPlayer(state, localPlayerId);
    const range = me ? Game.getCityRange(me) : 2;
    sub.phase = "placing_city";
    sub.validHexes = Game.validCityHexes(state, localPlayerId, production, range);
    render();
  }

  function startBuildWonder(production) {
    sub.phase = "picking_wonder";
    sub.wonderProduction = production;
    renderWizard();
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
    sub.movementState = null; sub.selectedWonder = null; sub.wonderProduction = 0;
    sub.combatTradeSpent = 0;
    render();
  }

  // ── Hex Click Handler ─────────────────────────────────────

  function handleHexClick(hexKey) {
    if (!state) return;

    if (state.phase === "setup") {
      const activeId = state.setup.order[state.setup.turnIndex];
      if (activeId !== localPlayerId) return;

      if (state.setup.phase === "fortress") {
        flashHex(hexKey, "rgb(255,213,79)", 600);
        dispatch({ type: "PLACE_FORTRESS", payload: { playerId: localPlayerId, hexKey } });
        return;
      }
      if (state.setup.phase === "tile" || state.setup.phase === "capital_tile") {
        const playerTiles = state.setup.playerTiles[localPlayerId] || [];
        if (playerTiles.length === 0) return;
        const tileId = playerTiles[0];
        const result = Game.validateTilePlacement(state, tileId, hexKey, sub.tileRotation);
        if (!result.ok) return;
        const tileKeys = Game.getTileHexKeys(hexKey, sub.tileRotation, state.map.hexes);
        flashHexes(tileKeys, "rgb(102,187,106)", 600);
        dispatch({ type: "PLACE_TILE", payload: { playerId: localPlayerId, tileId, anchorKey: hexKey, rotation: sub.tileRotation, side: sub.tileSide } });
        return;
      }
      return;
    }

    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;

    if (sub.phase === "placing_control") {
      if (!sub.validHexes.has(hexKey)) { showToast("Must be adjacent to your city or control"); return; }
      flashHex(hexKey, "rgb(102,187,106)", 500);
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      const effectiveSlot = (Game.getSlotValue(me, "culture", state) || 1) + (sub.tradeSpent || 0);
      Game.hexNeighborKeys(Game.parseQ(hexKey), Game.parseR(hexKey)).forEach((nk) => {
        if (sub.placedKeys.includes(nk)) return;
        const nh = state.map.hexes[nk];
        if (!nh || !nh.active || nh.terrain === "water" || nh.city || nh.barbarian || nh.cityState || nh.control) return;
        if (Game.terrainDifficulty(nh) > effectiveSlot) return;
        sub.validHexes.add(nk);
      });
      if (sub.remaining <= 0) finishAction();
      else render();
      return;
    }
    if (sub.phase === "placing_district") {
      if (!sub.validHexes.has(hexKey)) { showToast("Must be adjacent to your city"); return; }
      flashHex(hexKey, "rgb(79,195,247)", 600);
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
    if (sub.phase === "move_caravan") {
      if (!sub.selectedUnit) {
        const unit = me.caravans.find((u) => u.position === hexKey);
        if (!unit) return;
        sub.selectedUnit = unit;
        const maxMove = Game.getEconomyMove(me) + sub.tradeSpent;
        sub.movementState = { unitType: "caravan", unitId: unit.id, maxMove, remaining: maxMove, currentKey: hexKey, startKey: hexKey, explored: false };
        sub.validHexes = Game.getReachable(state, hexKey, maxMove, "caravan", localPlayerId);
        render();
      } else {
        if (!sub.validHexes.has(hexKey)) { showToast("Can't move there"); return; }
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "caravan", localPlayerId);
        flashHex(hexKey, "rgb(102,187,106)", 400);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        if (ms.remaining > 0) {
          sub.phase = "move_caravan_post";
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
        const maxMove = Game.getMilitaryMove(me) + sub.tradeSpent;
        sub.movementState = { unitType: "army", unitId: unit.id, maxMove, remaining: maxMove, currentKey: hexKey, startKey: hexKey, explored: false };
        sub.validHexes = Game.getReachable(state, hexKey, maxMove, "army", localPlayerId);
        render();
      } else {
        if (!sub.validHexes.has(hexKey)) return;
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "army", localPlayerId);
        flashHex(hexKey, "rgb(239,83,80)", 400);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        if (ms.remaining > 0) {
          sub.phase = "move_army_post";
          render();
        } else {
          sub.phase = "move_army_post";
          render();
        }
      }
      return;
    }
    if (sub.phase === "move_army_exploring" || sub.phase === "move_caravan_exploring") {
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
      dispatch({ type: "EXPLORE_TILE", payload: { playerId: localPlayerId, anchorKey: hexKey, rotation: sub.tileRotation, side: sub.tileSide, fromKey: ms.currentKey } });
      ms.remaining -= 1;
      ms.explored = true;
      sub.phase = ms.unitType === "army" ? "move_army_post" : "move_caravan_post";
      render();
      return;
    }
    if (sub.phase === "placing_city") {
      if (!sub.validHexes.has(hexKey)) { showToast("Invalid city location"); return; }
      flashHex(hexKey, "rgb(255,213,79)", 800);
      const resources = {}; Object.entries(sub.spentResources).forEach(([r, spent]) => { if (spent) resources[r] = 1; });
      dispatch({ type: "PLAY_INDUSTRY_CITY", payload: { playerId: localPlayerId, hexKey, resources, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
    if (sub.phase === "placing_wonder") {
      if (!sub.validHexes.has(hexKey)) { showToast("Must be your city without a wonder"); return; }
      flashHex(hexKey, "rgb(206,147,216)", 800);
      const resources = {}; Object.entries(sub.spentResources).forEach(([r, spent]) => { if (spent) resources[r] = 1; });
      dispatch({ type: "PLAY_INDUSTRY_WONDER", payload: {
        playerId: localPlayerId, hexKey, resources, tradeSpent: sub.tradeSpent,
        wonderName: sub.selectedWonder ? sub.selectedWonder.name : null
      }});
      resetSub(); return;
    }
  }

  // ── Gov Picker ────────────────────────────────────────────

  function showGovPicker() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return;
    let selected = me.govMarkers.slice();
    const hasForbidden = Object.values(state.map.hexes).some((h) =>
      h.city && h.city.ownerId === localPlayerId && h.city.wonder && h.city.wonder.name === "Forbidden City"
    );
    const maxGov = Game.CFG.maxGovMarkers + (hasForbidden ? 1 : 0);
    const renderPicker = () => {
      dom.wizard.innerHTML = `
        <div class="wiz-title">Assign Gov Markers (max ${maxGov})</div>
        <div class="wiz-body">Each marker adds +1 to that focus card's slot value.${hasForbidden ? " <em>(+1 from Forbidden City)</em>" : ""}</div>
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
          else if (selected.length < maxGov) selected.push(f);
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
    const logEntries = state.log.slice(-15).map((msg) => ({ html: `<div class="log-entry">${msg}</div>`, ts: 0 }));
    const chatEntries = chatHistory.slice(-10).map((m) => ({
      html: `<div class="chat-msg"><span class="chat-name" style="color:${getPlayerColor(m.sender)}">${m.name}:</span>${m.text}</div>`,
      ts: m.ts
    }));
    const all = [...logEntries, ...chatEntries];
    dom.gameLog.innerHTML = `<h3>Game Log</h3>` + all.map((e) => e.html).join("");
    dom.gameLog.scrollTop = dom.gameLog.scrollHeight;
  }

  function getPlayerColor(playerId) {
    if (!state) return "var(--text)";
    const p = state.players.find((pl) => pl.id === playerId);
    return p ? p.color : "var(--text)";
  }

  let prevFocusOrder = [];

  function renderFocusRow() {
    if (!state || state.phase !== "playing") return;
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.focusRow.innerHTML = ""; return; }
    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    const canPlay = isMyTurn && !me.cardPlayed && sub.phase === "idle";
    const TIER_LABELS = ["I", "II", "III", "IV"];

    const oldRects = {};
    document.querySelectorAll(".fcard").forEach((el) => {
      oldRects[el.dataset.card] = el.getBoundingClientRect();
    });

    dom.focusRow.innerHTML = me.focusRow.map((cardType, idx) => {
      const effective = Game.getSlotValue(me, cardType, state);
      const bonus = me.govBonus[cardType] || 0;
      const tier = Game.getCardTier(me, cardType);
      const cardName = Game.CARD_NAMES[cardType][tier - 1];
      const icon = Game.CARD_ICONS[cardType];
      const maxT = Game.CFG.maxTrade;
      const filled = me.trade[cardType];
      let tradeDots = "";
      for (let i = 0; i < maxT; i++) {
        tradeDots += i < filled
          ? `<span class="trade-filled">●</span>`
          : `<span class="trade-empty">●</span>`;
      }
      const disabled = !canPlay ? " disabled" : "";
      const selected = sub.cardType === cardType && sub.phase !== "idle" ? " selected" : "";

      return `<div class="fcard type-${cardType}${disabled}${selected}" data-card="${cardType}" data-idx="${idx}">
        <div class="fc-header">
          <span class="fc-icon">${icon}</span>
          <span class="fc-type">${Game.FOCUS_LABELS[cardType]}</span>
          <span class="fc-slot-num">#${idx + 1}</span>
        </div>
        <div class="fc-body">
          <div class="fc-power">${effective}${bonus > 0 ? `<span class="gov-plus">+${bonus}</span>` : ""}</div>
          <div class="fc-cardname">${cardName}</div>
          <div class="fc-tier-badge">TIER ${TIER_LABELS[tier - 1]}</div>
        </div>
        <div class="fc-footer">${tradeDots}</div>
      </div>`;
    }).join("");

    const orderChanged = prevFocusOrder.length > 0 &&
      me.focusRow.some((c, i) => prevFocusOrder[i] !== c);

    if (orderChanged && Object.keys(oldRects).length > 0) {
      document.querySelectorAll(".fcard").forEach((el) => {
        const cardType = el.dataset.card;
        if (oldRects[cardType]) {
          const oldR = oldRects[cardType];
          const newR = el.getBoundingClientRect();
          const dx = oldR.left - newR.left;
          const dy = oldR.top - newR.top;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            el.style.transition = "none";
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.classList.add("shuffling");
                el.style.transform = "";
                el.addEventListener("transitionend", function handler() {
                  el.classList.remove("shuffling");
                  el.style.transition = "";
                  el.removeEventListener("transitionend", handler);
                }, { once: true });
              });
            });
          }
        }
      });
    }
    prevFocusOrder = me.focusRow.slice();

    document.querySelectorAll(".fcard").forEach((el) => {
      const cardType = el.dataset.card;
      el.addEventListener("mouseenter", () => {
        const slot = Game.getSlotValue(me, cardType, state);
        const tier = Game.getCardTier(me, cardType);
        const name = Game.CARD_NAMES[cardType][tier - 1];
        const desc = Game.FOCUS_TRADE_DESC[cardType];
        dom.mapTooltip.innerHTML = `<strong>${name}</strong> (Power: ${slot})<br>${desc}`;
        dom.mapTooltip.classList.remove("hidden");
        const rect = el.getBoundingClientRect();
        dom.mapTooltip.style.left = rect.left + "px";
        dom.mapTooltip.style.top = (rect.top - 60) + "px";
      });
      el.addEventListener("mouseleave", () => { dom.mapTooltip.classList.add("hidden"); });
    });

    if (canPlay) {
      document.querySelectorAll(".fcard:not(.disabled)").forEach((el) => {
        el.addEventListener("click", () => {
          el.classList.add("card-anim");
          setTimeout(() => el.classList.remove("card-anim"), 400);
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
      <div class="gameover-actions"><button class="primary" id="go-restart">Play Again</button></div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById("go-restart").addEventListener("click", () => {
      overlay.remove();
      state = null;
      localPlayerId = null;
      try { localStorage.removeItem("civ-nd-save"); } catch(e) {}
      dom.game.classList.add("hidden");
      dom.lobby.classList.remove("hidden");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  return { render, dispatch };
})();
