"use strict";

const UI = (() => {
  let state = null;
  let localPlayerId = null;
  let roomCode = null;
  const lastTechByPlayer = new Map();

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

  // Board palette. The old one had two pairs that fought each other: grass and
  // forest were both mid green, hills and desert both tan. Now no two terrains
  // share a hue family, and the pair that stays closest — hills and desert —
  // is split by lightness instead: dry gold against bleached sand.
  //
  //   grass    lush yellow-green      1
  //   hill     saturated dry gold     2
  //   forest   deep teal-green        3
  //   desert   pale bleached sand     4
  //   mountain cold slate             5
  // The board wears the printed tile faces. Off, it falls back to the drawn
  // terrain — which is the same terrain, so nothing about play changes.
  let tileArt = true;

  const TERRAIN_COLORS = {
    grass: '#6faa3f', hill: '#c8993a', forest: '#1d6650',
    desert: '#ecd9a8', mountain: '#8b93ab', water: '#2f6fb5'
  };
  const TERRAIN_SHEEN = {
    grass: 'rgba(255,255,255,0.10)', hill: 'rgba(255,255,255,0.10)', forest: 'rgba(255,255,255,0.07)',
    desert: 'rgba(255,255,255,0.05)', mountain: 'rgba(255,255,255,0.13)', water: 'rgba(255,255,255,0.10)'
  };
  const TERRAIN_EDGE = {
    grass: '#4a7d29', hill: '#8f6a1e', forest: '#0f4436',
    desert: '#c2a86f', mountain: '#5f6880', water: '#215285'
  };

  // Small hand-drawn glyphs so terrain is identifiable without color alone.
  function drawTerrainGlyph(cx, cy, terrain, size) {
    const s = size / 30;
    ctx.save();
    ctx.lineWidth = Math.max(1, 1.4 * s);
    if (terrain === "mountain") {
      ctx.fillStyle = "rgba(40,44,52,0.55)";
      ctx.beginPath();
      ctx.moveTo(cx - 10 * s, cy + 7 * s); ctx.lineTo(cx - 3 * s, cy - 6 * s); ctx.lineTo(cx + 2 * s, cy + 7 * s);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 1 * s, cy + 7 * s); ctx.lineTo(cx + 6 * s, cy - 2 * s); ctx.lineTo(cx + 11 * s, cy + 7 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(cx - 5 * s, cy - 2 * s); ctx.lineTo(cx - 3 * s, cy - 6 * s); ctx.lineTo(cx - 1 * s, cy - 2 * s);
      ctx.closePath(); ctx.fill();
    } else if (terrain === "forest") {
      ctx.fillStyle = "rgba(16,48,22,0.6)";
      [[-6, 2], [1, -2], [6, 3]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx + (dx - 4) * s, cy + (dy + 5) * s);
        ctx.lineTo(cx + dx * s, cy + (dy - 6) * s);
        ctx.lineTo(cx + (dx + 4) * s, cy + (dy + 5) * s);
        ctx.closePath(); ctx.fill();
      });
    } else if (terrain === "hill") {
      ctx.strokeStyle = "rgba(80,58,28,0.55)";
      ctx.beginPath(); ctx.arc(cx - 5 * s, cy + 3 * s, 5 * s, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 5 * s, cy + 5 * s, 4 * s, Math.PI, 0); ctx.stroke();
    } else if (terrain === "desert") {
      ctx.strokeStyle = "rgba(120,88,36,0.5)";
      ctx.beginPath(); ctx.moveTo(cx - 8 * s, cy + 2 * s); ctx.quadraticCurveTo(cx - 3 * s, cy - 2 * s, cx + 1 * s, cy + 2 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 1 * s, cy + 6 * s); ctx.quadraticCurveTo(cx + 4 * s, cy + 2 * s, cx + 8 * s, cy + 6 * s); ctx.stroke();
    } else if (terrain === "water") {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      [[0, -2], [0, 3]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx - 7 * s + dx, cy + dy * s);
        ctx.quadraticCurveTo(cx - 3.5 * s + dx, cy + (dy - 3) * s, cx + dx, cy + dy * s);
        ctx.quadraticCurveTo(cx + 3.5 * s + dx, cy + (dy + 3) * s, cx + 7 * s + dx, cy + dy * s);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

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
    validPulse: 0,
    // Set by renderCanvas: true while the frame it just drew contains something
    // that changes over time. The loop keeps painting for exactly as long as
    // that is true and then stops, so an idle board costs nothing.
    living: false
  };

  function flashHex(hexKey, color, duration) {
    anims.hexFlashes.push({ key: hexKey, color, startTime: performance.now(), duration: duration || 600 });
  }

  function flashHexes(keys, color, duration) {
    keys.forEach((k) => flashHex(k, color, duration));
  }

  // A figure that changed hexes leaves a short trail behind it, so the eye can
  // see where it came from instead of it simply appearing somewhere new.
  function traceMove(fromKey, toKey) {
    if (reducedMotion() || !fromKey || !toKey) return;
    const q0 = Game.parseQ(fromKey), r0 = Game.parseR(fromKey);
    const q1 = Game.parseQ(toKey), r1 = Game.parseR(toKey);
    const steps = Math.max(Math.abs(q1 - q0), Math.abs(r1 - r0), Math.abs((q1 + r1) - (q0 + r0)));
    for (let i = 0; i <= steps; i++) {
      const k = Game.key(Math.round(q0 + ((q1 - q0) * i) / steps), Math.round(r0 + ((r1 - r0) * i) / steps));
      if (!state.map.hexes[k]) continue;
      setTimeout(() => flashHex(k, "rgba(129,212,250,0.9)", 420), i * 80);
    }
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
      // This used to ask only about sub.validHexes, which is one of the three
      // things that pulse. Setup's placement spaces and a pending choice's
      // highlighted spaces both animate too, and both left the loop idle — so
      // they only moved when a mousemove happened to force a repaint.
      if (hadFlashes || anims.hexFlashes.length > 0 || anims.living) {
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
      move_army_post: "Something is in the way. The chip on the board decides it.",
      move_caravan: "Click your caravan, then a green hex. Visit city-states to gain trade tokens.",
      choosing_district: "Select a district type to build on your controlled hex.",
      industry_choice: "Choose to build a city or a wonder with your production.",
      exploring: "Use R to rotate, F to flip. Click a valid hex to place the tile.",
      growth_choice: "Choose a hex near your city to build a district or fortify.",
      waiting: "Waiting for other player's turn..."
    };
    return helps[phase] || "";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    dom.myStats = document.getElementById("my-stats");
    dom.map = document.getElementById("map");
    dom.mapTooltip = document.getElementById("map-tooltip");
    dom.wizard = document.getElementById("wizard");
    dom.hostTools = document.getElementById("host-tools");
    dom.eventWheel = document.getElementById("event-wheel");
    dom.combatStage = document.getElementById("combat-stage");
    dom.mapContainer = document.getElementById("map-container");
    dom.boardChip = document.getElementById("board-chip");
    dom.tableStrip = document.getElementById("table-strip");
    dom.gameLog = document.getElementById("game-log");
    dom.focusRow = document.getElementById("focus-row");

    document.getElementById("btn-local").addEventListener("click", startLocal);
    document.getElementById("btn-create").addEventListener("click", startCreate);
    document.getElementById("btn-join").addEventListener("click", startJoin);
    document.getElementById("btn-new-game").addEventListener("click", () => {
      if (!confirm("Start a new game? Current progress will be lost.")) return;
      state = null;
      localPlayerId = null;
      roomCode = null;
      try { localStorage.removeItem("civ-nd-save"); } catch(e) {}
      resetSub();
      dom.game.classList.add("hidden");
      dom.lobby.classList.remove("hidden");
    });

    // The log, host tools and chat used to fill a column beside the board. They
    // are reference material, not play, so they live in a drawer now.
    const drawer = document.getElementById("drawer");
    document.getElementById("btn-drawer")?.addEventListener("click", () => drawer.classList.remove("hidden"));
    document.getElementById("drawer-close")?.addEventListener("click", () => drawer.classList.add("hidden"));
    drawer?.addEventListener("click", (e) => { if (e.target === drawer) drawer.classList.add("hidden"); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") drawer?.classList.add("hidden");
    });

    initReference();
    if (window.CivCardArt) {
      CivCardArt.load().then((usable) => { if (usable && state) render(); });
    }

    Net.init({
      onState: (payload) => {
        if (Net.getIsHost()) dispatch(payload);
        else {
          state = Game.migrateState ? Game.migrateState(payload) : payload;
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
        document.getElementById("conn-banner").textContent = "Connection lost - attempting to reconnect...";
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
            state = Game.migrateState ? Game.migrateState(data.state) : data.state;
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
    state = Game.createLobbyState([player], { solo: true });
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
      // Open a waiting room rather than a live 1-player board. The real game
      // is built (with everyone in it) when the host presses Start Game.
      state = Game.createLobbyState([player]);
      roomCode = id;
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
      roomCode = code;
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
      // With a tile in hand the wheel turns it, which is what your hand wants to
      // do anyway. Otherwise it zooms.
      if (placingTile()) { turnTile(e.deltaY > 0 ? 1 : -1); return; }
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

  // Appends a hex to the CURRENT path — for building a union of several, where
  // hexPath's beginPath would throw away everything before it.
  function hexSubPath(cx, cy, size) {
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(cx, cy, size, i);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
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
        } else if (state.setup.phase === "tile" || state.setup.phase === "capital_tile") {
          const playerTiles = state.setup.playerTiles[localPlayerId] || [];
          if (playerTiles.length > 0) {
            const tileId = playerTiles[0];
            // Deliberately NOT lighting up every legal anchor. Working out where
            // your land can go is the decision; a board covered in green answers
            // it for you. Point at a space and the ghost says yes or no — that
            // is the only help there is, and you have to go looking for it.
            if (mouseHex) {
              const anchorKey = Game.key(mouseHex.q, mouseHex.r);
              const fit = Game.tilePlacementFor(state, tileId, anchorKey, sub.tileRotation);
              const rot = fit ? fit.rotation : sub.tileRotation;
              const keys = Game.getTileHexKeys(anchorKey, rot, hexes);
              if (keys.length === Game.TILE_OFFSETS.length) {
                ghostKeys = new Set(keys);
                ghostValid = !!fit;
              }
            }
          }
        }
      }
    }

    if (state.phase === "playing" &&
        isExploring(sub.phase) &&
        mouseHex && state.tileStack && state.tileStack.length > 0) {
      const tileId = exploringTileId();
      const anchorKey = Game.key(mouseHex.q, mouseHex.r);
      const fit = Game.tilePlacementFor(state, tileId, anchorKey, sub.tileRotation, Game.validateExploration);
      const keys = Game.getTileHexKeys(anchorKey, fit ? fit.rotation : sub.tileRotation, hexes);
      if (keys.length === Game.TILE_OFFSETS.length) {
        ghostKeys = new Set(keys);
        ghostValid = !!fit;
      }
    }

    const hexChoice = activeHexChoice();
    const combinedValid = new Set([...sub.validHexes, ...setupValid,
      ...(hexChoice ? hexChoice.hexKeys : [])]);
    // Everything on the board that moves by itself, in one place, so the loop
    // and the drawing can never disagree about whether a frame is worth having.
    anims.living = combinedValid.size > 0;

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

    // Layer 2: Active hex terrain (fill + sheen + edge + glyph)
    const drawGlyphs = HEX_SIZE >= 18;
    const painted = tileArt ? drawTileArt(cw, ch) : new Set();
    Object.values(hexes).forEach((h) => {
      if (!h.active) return;
      const p = axialToPixel(h.q, h.r);
      if (p.x < -50 || p.x > cw + 50 || p.y < -50 || p.y > ch + 50) return;
      // A space wearing its printed face needs no flat colour under it.
      if (painted.has(Game.key(h.q, h.r))) {
        if (drawGlyphs) {
          hexPath(p.x, p.y, HEX_SIZE);
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        return;
      }
      hexPath(p.x, p.y, HEX_SIZE);
      ctx.fillStyle = TERRAIN_COLORS[h.terrain] || "#444";
      ctx.fill();
      // top-half sheen gives the board a lit, layered feel
      hexPath(p.x, p.y - HEX_SIZE * 0.18, HEX_SIZE * 0.82);
      ctx.fillStyle = TERRAIN_SHEEN[h.terrain] || "rgba(255,255,255,0.06)";
      ctx.fill();
      hexPath(p.x, p.y, HEX_SIZE);
      ctx.strokeStyle = TERRAIN_EDGE[h.terrain] || "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (drawGlyphs) drawTerrainGlyph(p.x, p.y, h.terrain, HEX_SIZE);
    });

    // Layer 3: Tile boundaries
    drawTileBoundaries(cw, ch);

    // Layer 3b: Targeting focus — while picking a hex, everything that is NOT a
    // legal target sinks into shadow so the choices pop out unmistakably.
    if (combinedValid.size > 0) {
      const keep = new Set(combinedValid);
      if (sub.movementState && sub.movementState.currentKey) keep.add(sub.movementState.currentKey);
      if (sub.selectedUnit && sub.selectedUnit.position) keep.add(sub.selectedUnit.position);
      Object.values(hexes).forEach((h) => {
        if (!h.active) return;
        const k = Game.key(h.q, h.r);
        if (keep.has(k)) return;
        const p = axialToPixel(h.q, h.r);
        if (p.x < -50 || p.x > cw + 50 || p.y < -50 || p.y > ch + 50) return;
        hexPath(p.x, p.y, HEX_SIZE);
        ctx.fillStyle = "rgba(10,12,24,0.55)";
        ctx.fill();
      });
    }

    // Layer 4: Valid hex highlights (pulsing)
    const pulseAlpha = 0.18 + 0.18 * Math.sin(anims.validPulse * Math.PI * 2);
    combinedValid.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      hexPath(p.x, p.y, HEX_SIZE - 2);
      ctx.fillStyle = `rgba(120,220,130,${pulseAlpha.toFixed(2)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(140,240,150,${(0.65 + pulseAlpha).toFixed(2)})`;
      ctx.lineWidth = 2.5;
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

  // The printed face of every placed tile, laid over the board in its own
  // footprint. The photograph and rules-data are two readings of the same
  // object — the terrain was transcribed off these very images — so the
  // picture and what the space actually IS cannot drift apart.
  //
  // Each face is fitted with a full affine solve rather than a rotation, since
  // a tile's B side is its A geometry mirrored and a reflection is not a
  // rotation. Ten point pairs, so the fit is exact and any misreading of the
  // geometry shows up immediately as a visibly crooked tile.
  function fitAffine(src, dst) {
    // Least squares for [a c e; b d f] over 10 points, via 3x3 normal equations.
    let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = src.length;
    let tx1 = 0, tx2 = 0, tx3 = 0, ty1 = 0, ty2 = 0, ty3 = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y;
      tx1 += x * u; tx2 += y * u; tx3 += u;
      ty1 += x * v; ty2 += y * v; ty3 += v;
    }
    const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const solve = (r1, r2, r3) => {
      const A = [M[0].concat(r1), M[1].concat(r2), M[2].concat(r3)];
      for (let c = 0; c < 3; c++) {
        let piv = c;
        for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        if (Math.abs(A[piv][c]) < 1e-9) return null;
        [A[c], A[piv]] = [A[piv], A[c]];
        for (let r = 0; r < 3; r++) {
          if (r === c) continue;
          const f = A[r][c] / A[c][c];
          for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
        }
      }
      return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
    };
    const u = solve(tx1, tx2, tx3), v = solve(ty1, ty2, ty3);
    return (u && v) ? { a: u[0], c: u[1], e: u[2], b: v[0], d: v[1], f: v[2] } : null;
  }

  function drawTileArt(cw, ch) {
    const done = new Set();
    if (!window.CivTileArt || !state) return done;
    const hexes = state.map.hexes;

    // Gather each placed tile's ten spaces by the cell index they carry.
    const groups = new Map();
    Object.entries(hexes).forEach(([k, h]) => {
      if (!h.active || !h.tileId || h.tileId === "water-fill") return;
      if (h.tileCell === undefined || h.tileCell === null) return;
      if (!groups.has(h.tileId)) groups.set(h.tileId, []);
      groups.get(h.tileId).push([k, h]);
    });

    groups.forEach((cells, tileId) => {
      if (cells.length !== Game.TILE_OFFSETS.length) return;
      const side = cells[0][1].tileSide === "B" ? "B" : "A";
      const img = CivTileArt.tileImage(tileId, side, () => { renderCanvas(); });
      if (!img || !img.complete || !img.naturalWidth) return;

      const src = [], dst = [];
      const pts = CivTileArt.cellPoints(side);
      let onScreen = false;
      for (const [, h] of cells) {
        const p = axialToPixel(h.q, h.r);
        if (p.x > -80 && p.x < cw + 80 && p.y > -80 && p.y < ch + 80) onScreen = true;
        src.push(pts[h.tileCell]);
        dst.push([p.x, p.y]);
      }
      if (!onScreen) return;
      const m = fitAffine(src, dst);
      if (!m) return;

      ctx.save();
      ctx.beginPath();
      for (const [, h] of cells) {
        const p = axialToPixel(h.q, h.r);
        // Overlap the seams very slightly so no hairline of board shows through.
        // hexSubPath, not hexPath — the latter would reset the path each time
        // and clip to the last hex alone, blacking out the other nine.
        hexSubPath(p.x, p.y, HEX_SIZE + 0.6);
      }
      ctx.clip();
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.restore();
      cells.forEach(([k]) => done.add(k));
    });
    return done;
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
    } else if (isExploring(sub.phase)) {
      tileId = exploringTileId();
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

  function roundRect(x, y, w, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hh, r);
    ctx.arcTo(x + w, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawHexContent(cx, cy, h, k) {
    const s = HEX_SIZE / 30;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // ── Center piece: city / city-state / fortress / barbarian / control ──
    if (h.city) {
      const owner = Game.getPlayer(state, h.city.ownerId);
      const color = owner ? owner.color : "#fff";
      const w = 17 * s, hh = 11 * s;
      // building base with roof, owner-coloured, dark outline
      roundRect(cx - w / 2, cy - hh / 2 + 2 * s, w, hh, 2.5 * s);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "rgba(10,10,20,0.85)"; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 - 1.5 * s, cy - hh / 2 + 2.5 * s);
      ctx.lineTo(cx, cy - hh / 2 - 5 * s);
      ctx.lineTo(cx + w / 2 + 1.5 * s, cy - hh / 2 + 2.5 * s);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); ctx.stroke();
      if (h.city.developed) { // developed = white keystone dot on the roof
        ctx.beginPath(); ctx.arc(cx, cy - hh / 2 - 1 * s, 1.8 * s, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
      }
      if (h.city.isCapital) {
        ctx.font = `bold ${Math.round(9 * s)}px sans-serif`;
        ctx.fillStyle = "#ffd54f";
        ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 2 * s;
        ctx.strokeText("★", cx, cy - hh / 2 - 8 * s);
        ctx.fillText("★", cx, cy - hh / 2 - 8 * s);
      }
      if (h.city.hasWonder) {
        ctx.font = `bold ${Math.round(8 * s)}px sans-serif`;
        ctx.fillStyle = "#e1bee7";
        ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 1.6 * s;
        ctx.strokeText("♦", cx + w / 2 + 3 * s, cy - 2 * s);
        ctx.fillText("♦", cx + w / 2 + 3 * s, cy - 2 * s);
      }
    } else if (h.cityState) {
      // neutral city-state: purple diamond with initials
      const r = 8.5 * s;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = "#8e5db0"; ctx.fill();
      ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "#e6ccf5"; ctx.stroke();
      ctx.font = `bold ${Math.round(6.5 * s)}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText(h.cityState.name.slice(0, 3).toUpperCase(), cx, cy);
    } else if (h.fortress) {
      const owner = h.fortressOwnerId ? Game.getPlayer(state, h.fortressOwnerId) : null;
      const w = 13 * s, hh = 10 * s;
      roundRect(cx - w / 2, cy - hh / 2 + 1 * s, w, hh, 1.5 * s);
      ctx.fillStyle = owner ? owner.color : "#9aa1ad"; ctx.fill();
      ctx.lineWidth = 1.5 * s; ctx.strokeStyle = "rgba(10,10,20,0.85)"; ctx.stroke();
      // battlements
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(cx + i * 4.2 * s - 1.5 * s, cy - hh / 2 - 2.5 * s, 3 * s, 3.5 * s);
      }
    } else if (h.control) {
      const owner = Game.getPlayer(state, h.control.ownerId);
      const color = owner ? owner.color : "#fff";
      if (h.control.district) {
        const w = 15 * s, hh = 11 * s;
        roundRect(cx - w / 2, cy - hh / 2, w, hh, 2 * s);
        ctx.fillStyle = "rgba(20,22,36,0.85)"; ctx.fill();
        ctx.lineWidth = 1.8 * s; ctx.strokeStyle = color; ctx.stroke();
        ctx.font = `bold ${Math.round(6.5 * s)}px sans-serif`;
        ctx.fillStyle = "#fff";
        ctx.fillText(h.control.district.slice(0, 3).toUpperCase(), cx, cy);
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, 6 * s, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "rgba(10,10,20,0.8)"; ctx.stroke();
        if (h.control.fortified) {
          ctx.beginPath(); ctx.arc(cx, cy, 8.2 * s, 0, Math.PI * 2);
          ctx.lineWidth = 1.8 * s; ctx.strokeStyle = "#fff"; ctx.stroke();
        }
      }
    }

    if (h.barbarian) {
      const r = 7 * s;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#b3261e"; ctx.fill();
      ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "#ffb4a9"; ctx.stroke();
      ctx.font = `bold ${Math.round(9 * s)}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText("☠", cx, cy + 0.5 * s);
    }

    // ── Top badge: resource / natural wonder pill ──
    if (h.resource || h.naturalWonder) {
      const isWonder = h.resource === "wonder" || h.naturalWonder;
      const resLabels = { marble: "MRB", mercury: "MRC", oil: "OIL", diamonds: "DIA", wonder: "NW" };
      const label = isWonder ? "NW" : (resLabels[h.resource] || String(h.resource).slice(0, 3).toUpperCase());
      const w = (label.length > 2 ? 16 : 12) * s, hh = 8 * s;
      const by = cy - HEX_SIZE * 0.62;
      roundRect(cx - w / 2, by - hh / 2, w, hh, hh / 2);
      ctx.fillStyle = isWonder ? "#1fb3a6" : "#d9a410"; ctx.fill();
      ctx.lineWidth = 1.2 * s; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.stroke();
      ctx.font = `bold ${Math.round(5.6 * s)}px sans-serif`;
      ctx.fillStyle = isWonder ? "#04302c" : "#3c2b00";
      ctx.fillText(label, cx, by + 0.4 * s);
    }

    // ── Bottom row: units as coloured discs ──
    const units = Game.getUnitsAt(state, k);
    if (units.length) {
      const uy = cy + HEX_SIZE * 0.55;
      const spread = 11 * s;
      const x0 = cx - ((units.length - 1) * spread) / 2;
      units.forEach((u, i) => {
        const ux = x0 + i * spread;
        ctx.beginPath(); ctx.arc(ux, uy, 5.2 * s, 0, Math.PI * 2);
        ctx.fillStyle = u.color; ctx.fill();
        ctx.lineWidth = 1.6 * s;
        ctx.strokeStyle = u.type === "army" ? "#fff" : "rgba(20,20,30,0.9)";
        ctx.stroke();
        ctx.font = `bold ${Math.round(6.5 * s)}px sans-serif`;
        ctx.fillStyle = u.type === "army" ? "#fff" : "rgba(15,15,25,0.95)";
        ctx.fillText(u.type === "army" ? "⚔" : "C", ux, uy + 0.4 * s);
      });
    }
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

  // True while a tile is in hand and waiting for a home.
  // Terra p12: an expedition draws the BOTTOM tile of the stack.
  function exploringTileId() {
    const stack = state && state.tileStack;
    return stack && stack.length ? stack[stack.length - 1] : null;
  }

  // Exploring covers a unit's expedition and Apadana's one-off, which has no
  // unit behind it at all.
  function isExploring(ph) {
    return ph === "move_army_exploring" || ph === "move_caravan_exploring" || ph === "free_exploring";
  }
  // Where the new land has to touch: the moving figure, or Apadana's edge space.
  function exploreOrigin() {
    if (sub.phase === "free_exploring") return sub.freeFrom || null;
    return sub.movementState ? sub.movementState.currentKey : null;
  }

  function placingTile() {
    if (isExploring(sub.phase)) return true;
    if (!state || state.phase !== "setup") return false;
    if (state.setup.phase !== "tile" && state.setup.phase !== "capital_tile") return false;
    return state.setup.order[state.setup.turnIndex] === localPlayerId;
  }

  // The little tile in the panel is the thing in your hand, so it should move
  // when you spin it round or turn it over.
  let pendingPreviewAnim = null;

  function turnTile(step) {
    sub.tileRotation = (sub.tileRotation + step + 6) % 6;
    if (!reducedMotion()) pendingPreviewAnim = step > 0 ? "turn-cw" : "turn-ccw";
    render();
  }

  function flipTile() {
    sub.tileSide = sub.tileSide === "A" ? "B" : "A";
    if (!reducedMotion()) pendingPreviewAnim = "flip";
    render();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      // Always a way back out, from any half-finished action.
      if (sub.phase !== "idle") { e.preventDefault(); cancelAction(); }
      return;
    }
    if (!placingTile()) return;
    const k = e.key.toLowerCase();
    if (k === "q") { e.preventDefault(); turnTile(-1); }
    else if (k === "e" || k === "r") { e.preventDefault(); turnTile(1); }
    else if (k === "f") { e.preventDefault(); flipTile(); }
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

  // What changed since the last render, so the board can react to it. Follows
  // the same shape as prevFocusOrder, which already FLIPs the focus cards.
  let prevSeen = null;
  const reportSeen = new WeakSet();

  function snapshotSeen() {
    const wonders = {}, cities = {}, districts = {}, land = {};
    Object.entries(state.map.hexes).forEach(([k, h]) => {
      if (h.city && h.city.wonder) wonders[h.city.wonder.name] = k;
      if (h.city) cities[k] = h.city.ownerId;
      if (h.control && h.control.district) districts[k] = h.control.district;
      if (h.active) land[k] = h.tileId || 1;
    });
    const me = Game.getPlayer(state, localPlayerId);
    return {
      wonders, cities, districts, land,
      trade: me ? { ...me.trade } : null,
      government: me ? me.government : null,
      diplomacy: me && me.diplomacy ? me.diplomacy.length : 0,
      units: me ? unitPositions(me) : {}
    };
  }

  function unitPositions(p) {
    const out = {};
    (p.armies || []).forEach((u) => { out["a" + u.id] = u.position; });
    (p.caravans || []).forEach((u) => { out["c" + u.id] = u.position; });
    return out;
  }

  // Sends a token arcing from one place to another and lands it. One helper
  // does trade tokens, the government marker and diplomacy cards, so they all
  // move the same way.
  function flyToken(from, to, glyph, tint) {
    if (reducedMotion() || !from || !to) return;
    const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
    const b = to.getBoundingClientRect();
    if (!a || !b || (!b.width && !b.height)) return;
    const el = document.createElement("div");
    el.className = "fly-token";
    el.textContent = glyph || "\u25cf";
    if (tint) el.style.color = tint;
    document.body.appendChild(el);
    const x0 = (a.left + (a.width || 0) / 2), y0 = (a.top + (a.height || 0) / 2);
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const anim = el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(0.5)`, opacity: 0.2 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 70}px) scale(1.3)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.85)`, opacity: 1 }
    ], { duration: 620, easing: "cubic-bezier(0.3, 0.9, 0.4, 1)" });
    anim.onfinish = () => {
      el.remove();
      to.classList.add("token-landed");
      setTimeout(() => to.classList.remove("token-landed"), 500);
    };
  }

  const focusCardEl = (type) => document.querySelector(`.fcard[data-card="${type}"]`);
  const boardCentre = () => {
    const r = dom.mapContainer ? dom.mapContainer.getBoundingClientRect() : null;
    return r ? { left: r.left + r.width / 2, top: r.top + r.height / 2, width: 0, height: 0 } : null;
  };

  function reactToChanges() {
    const now = snapshotSeen();
    if (prevSeen) {
      Object.entries(now.wonders).forEach(([name, k]) => {
        if (prevSeen.wonders[name]) return;
        announce(`\u2728 ${name} completed`, "wonder");
        flashHex(k, "rgb(255,213,79)", 1400);
      });
      Object.keys(now.cities).forEach((k) => {
        if (prevSeen.cities[k]) return;
        flashHex(k, "rgb(129,199,132)", 900);
      });
      Object.entries(now.districts).forEach(([k, d]) => {
        if (prevSeen.districts[k]) return;
        flashHex(k, "rgb(100,181,246)", 900);
      });

      // A tile landing on the table: the new ground ripples outward from the
      // middle of it rather than all appearing at once.
      const fresh = Object.keys(now.land).filter((k) => !prevSeen.land[k]);
      if (fresh.length > 1) {
        const cx = fresh.reduce((a, k) => a + Game.parseQ(k), 0) / fresh.length;
        const cy = fresh.reduce((a, k) => a + Game.parseR(k), 0) / fresh.length;
        fresh.forEach((k) => {
          const d = Math.abs(Game.parseQ(k) - cx) + Math.abs(Game.parseR(k) - cy);
          setTimeout(() => flashHex(k, "rgb(129,212,250)", 700), d * 70);
        });
      }

      // Trade tokens fly to the card they land on.
      if (now.trade && prevSeen.trade) {
        Object.keys(now.trade).forEach((type) => {
          const gained = now.trade[type] - prevSeen.trade[type];
          for (let i = 0; i < gained; i++) {
            setTimeout(() => flyToken(boardCentre(), focusCardEl(type), "\ud83e\ude99"), i * 130);
          }
        });
      }
      // The government marker stamps onto the card you chose.
      if (now.government && now.government !== prevSeen.government) {
        flyToken(boardCentre(), focusCardEl(now.government), "\ud83c\udfdb\ufe0f", "#ffd54f");
      }
      // A diplomacy card slides over to your leader sheet.
      if (now.diplomacy > prevSeen.diplomacy && dom.myStats) {
        flyToken(boardCentre(), dom.myStats, "\ud83e\udd1d", "#81d4fa");
      }
      // A district that paid out lights the spaces that paid, and one that paid
      // nothing lights what it was looking at, so "why did nothing happen" has
      // an answer on the board rather than in a rulebook.
      const report = (state.districtReport || []).filter((r) => r.playerId === localPlayerId);
      if (report.length) {
        report.forEach((r) => {
          if (reportSeen.has(r)) return;
          reportSeen.add(r);
          (r.paid || []).forEach((k) => flashHex(k, "rgb(129,212,250)", 1300));
          (r.nearMisses || []).forEach((k) => flashHex(k, "rgba(239,83,80,0.75)", 1300));
          if (!(r.paid || []).length && (r.nearMisses || []).length) {
            announce("Campus: those mountains are not yours yet", "warn");
          }
        });
      }

      // Units travel rather than teleport.
      Object.entries(now.units).forEach(([id, pos]) => {
        const was = prevSeen.units[id];
        if (!pos || !was || pos === was) return;
        traceMove(was, pos);
      });
    }
    prevSeen = now;
  }

  function render() {
    if (!state) return;
    renderHeader();
    renderPlayers();
    renderCanvas();
    renderWizard();
    renderHostTools();
    renderEventWheel();
    renderCombatStage();
    renderBoardChip();
    renderTableStrip();
    renderLog();

    if (state.phase === "playing" || state.phase === "gameover") {
      renderMyStats();
      renderFocusRow();
    } else {
      dom.myStats.innerHTML = "";
      dom.focusRow.innerHTML = "";
    }
    renderGameOver();
    reactToChanges();

    if (state.lastAction && state.lastAction.playerId !== localPlayerId) {
      const elapsed = Date.now() - state.lastAction.ts;
      if (elapsed < 4000) {
        const ap = state.players.find((p) => p.id === state.lastAction.playerId);
        const labels = { PLAY_CULTURE: "placed control markers", PLAY_GROWTH: "built a district", PLAY_SCIENCE: "advanced tech", PLAY_ECONOMY: "moved a caravan", PLAY_MILITARY_MOVE: "moved an army", PLAY_MILITARY_ATTACK: "attacked!", PLAY_INDUSTRY_CITY: "built a city", PLAY_INDUSTRY_WONDER: "built a wonder", EXPLORE_TILE: "explored a tile", END_TURN: "ended their turn" };
        const desc = labels[state.lastAction.type] || state.lastAction.type;
        showActionToast(`${ap ? ap.name : "Opponent"} ${desc}`);
      }
    }

    maybeShowTurnBanner();
  }

  // ── Turn banner: an animated splash whenever the active player changes ──
  let lastTurnSig = null;
  function maybeShowTurnBanner() {
    if (!state || (state.phase !== "playing" && state.phase !== "setup")) { lastTurnSig = null; return; }
    const activeP = state.phase === "setup"
      ? Game.getPlayer(state, state.setup.order[state.setup.turnIndex])
      : Game.currentPlayer(state);
    if (!activeP) return;
    const sig = `${state.phase}:${activeP.id}:${state.turn ? state.turn.round : 0}`;
    if (sig === lastTurnSig) return;
    const isFirst = lastTurnSig === null;
    lastTurnSig = sig;
    if (isFirst) return; // no splash when merely re-rendering into an existing turn
    let el = document.getElementById("turn-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "turn-banner";
      document.body.appendChild(el);
    }
    const mine = activeP.id === localPlayerId;
    el.innerHTML = `<div class="tb-inner" style="--pc:${activeP.color}">
      <span class="tb-round">${state.phase === "setup" ? "Setup" : `Round ${state.turn.round}`}</span>
      <span class="tb-name">${mine ? "YOUR TURN" : escapeHtml(activeP.name) + "'s turn"}</span>
    </div>`;
    el.classList.remove("show");
    void el.offsetWidth; // restart the animation
    el.classList.add("show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("show"), 2100);
  }

  // ── Header / Players / Stats ──────────────────────────────

  function renderHeader() {
    const cp = Game.currentPlayer(state);
    if (state.phase === "lobby") {
      dom.hdrRound.textContent = "Lobby";
      dom.hdrTurn.textContent = `${state.players.length}/${Game.CFG.maxPlayers} players`;
      dom.hdrTurn.style.color = "";
      if (roomCode || Net.getLocalId()) dom.hdrRoom.textContent = `Room: ${roomCode || Net.getLocalId()}`;
      return;
    }
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
        : (state.phase !== "lobby" && Game.currentPlayer(state)?.id === p.id ? " active" : "");
      const score = state.phase === "playing" ? ` | Score: ${Game.computeScore(state, p.id)}` : "";
      const stats = state.phase === "lobby" ? "In lobby"
        : state.phase === "setup" ? "Setup"
        : `Cities: ${Game.countCities(state, p.id)} | Ctrl: ${Game.countControl(state, p.id)}${score}`;
      const lead = Game.getLeader ? Game.getLeader(p) : null;
      const civTag = lead ? `<span class="pcv" title="${escapeHtml(lead.ability.text)}">${escapeHtml(lead.civ)}</span>` : "";
      return `<div class="player-card${active}">
        <div class="pname"><span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}${civTag}</div>
        <div class="pstats">${stats}</div>
      </div>`;
    }).join("");
  }

  function renderMyStats() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.myStats.innerHTML = ""; return; }
    const res = Object.entries(me.resources).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(", ") || "none";
    const techNow = Number(me.tech) || 0;
    const previousTech = lastTechByPlayer.has(me.id) ? lastTechByPlayer.get(me.id) : techNow;
    const techMoved = previousTech !== techNow;
    lastTechByPlayer.set(me.id, techNow);
    const dialSrc = window.CivCardArt ? CivCardArt.techDial(me.color) : "";
    const techDial = `<div class="tech-panel${techMoved ? " advancing" : ""}">
      <div class="tech-copy">
        <span class="tech-kicker">Science dial</span>
        <strong>${techNow}</strong><span> / ${Game.CFG.techWheelSize}</span>
        <small>Technology tier ${me.techTier}</small>
      </div>
      <div class="tech-dial" role="img" aria-label="Science dial at ${techNow} of ${Game.CFG.techWheelSize}"
        style="--tech-from:${previousTech};--tech-to:${techNow}">
        ${dialSrc ? `<img src="${dialSrc}" alt="" draggable="false">` : ""}
        <span class="tech-needle" aria-hidden="true"></span>
        <span class="tech-hub" aria-hidden="true"></span>
        <span class="tech-value">${techNow}</span>
      </div>
    </div>`;
    const govs = Game.GOVERNMENTS || {};
    const gov = me.government && govs[me.government]
      ? `${govs[me.government].name} <span class="lb-ut">(${Game.FOCUS_LABELS[me.government]} +${govs[me.government].shift} places)</span>`
      : "none yet — set when the dial reaches the government symbol";
    const maxA = me.armies.length;
    const maxW = me.caravans.length;
    const tiers = me.cardTiers ? Game.FOCUS_TYPES.map((f) => `${Game.FOCUS_LABELS[f][0]}${me.cardTiers[f] || 1}`).join(" ") : "";
    const dipCards = Game.DIPLOMACY_CARDS || {};
    const dip = me.diplomacy && me.diplomacy.length
      ? me.diplomacy.map((d) => {
          const meta = dipCards[d.type] || {};
          const tip = d.effect || meta.text || meta.effect || "";
          return `<span title="${escapeHtml(tip)}" style="cursor:help;text-decoration:underline dotted">${escapeHtml(d.name || d.type)}</span>`;
        }).join(", ")
      : "none";
    const csTokens = me.cityStateTokens && me.cityStateTokens.length ? me.cityStateTokens.join(", ") : "none";
    const builtWonders = new Set();
    const myWonders = [];
    if (state) Object.values(state.map.hexes).forEach((h) => {
      if (h.city && h.city.wonder) {
        builtWonders.add(h.city.wonder.name);
        if (h.city.ownerId === localPlayerId) myWonders.push(h.city.wonder.name);
      }
    });
    const myWonderStr = myWonders.length ? myWonders.join(", ") : "none";
    const visibleWonders = Game.getVisibleWonders ? Game.getVisibleWonders(state).filter((w) => !builtWonders.has(w.name)) : [];
    const wonderList = visibleWonders.length
      ? visibleWonders.map((w) => `<div class="wface era-${w.era}">
          <div class="wface-head"><span class="wface-name">${escapeHtml(w.name)}</span><span class="wface-cost">${w.cost}</span></div>
          <div class="wface-meta">${escapeHtml(w.era)} · ${escapeHtml(w.type)}</div>
          <div class="wface-text">${escapeHtml(w.effect || "")}</div>
        </div>`).join("")
      : `<div style="color:var(--text2)">none</div>`;
    const myLeader = Game.getLeader ? Game.getLeader(me) : null;
    let leaderRow = "";
    if (myLeader) {
      const u = myLeader.unique;
      const tierLabel = u ? ["I", "II", "III", "IV"][u.tier - 1] : "";
      const uActive = u && Game.getActiveUniqueCard && Game.getActiveUniqueCard(me, u.type);
      const uniqueLine = u
        ? `<div class="lb-unique ${uActive ? "on" : ""}">★ ${escapeHtml(u.name)} <span class="lb-ut">(${Game.FOCUS_LABELS[u.type]} ${tierLabel}${u.auto ? "" : " — manual"})</span>${uActive ? " <span class=\"lb-live\">active</span>" : ""}
           <div class="lb-utext">${escapeHtml(u.text)}</div></div>`
        : "";
      leaderRow = `<div class="leader-box"><div class="lb-head">${escapeHtml(myLeader.civ)}${myLeader.ability.manual ? ' <span class="lb-ut">(manual ability)</span>' : ""}</div>
         <div class="lb-ability">${escapeHtml(myLeader.ability.text)}</div>${uniqueLine}</div>`;
    }
    const ibrahim = state.ibrahimHolder === localPlayerId && window.CivCardArt
      ? `<div class="ibrahim-mini" title="Ibrahim is currently in your tableau">
          <img src="${CivCardArt.ibrahim()}" alt="Ibrahim unique diplomacy card">
          <span>Ibrahim</span>
        </div>` : "";
    dom.myStats.innerHTML = `<h3>My Tableau</h3>${techDial}${leaderRow}${ibrahim}<div class="stat-grid">
      <span>Card Tiers:</span><span class="sv">${tiers}</span>
      <span>Armies:</span><span class="sv">${me.armies.length}/${maxA}</span>
      <span>Caravans:</span><span class="sv">${me.caravans.length}/${maxW}</span>
      <span>Resources:</span><span class="sv">${res}</span>
      <span>Diplomacy:</span><span class="sv">${dip}</span>
      <span>CS Tokens:</span><span class="sv">${csTokens}</span>
      <span>Gov:</span><span class="sv">${gov}</span>
      <span>My Wonders:</span><span class="sv">${myWonderStr}</span>
    </div>
    <details style="margin-top:6px;font-size:11px"><summary style="cursor:pointer;color:var(--accent)">Visible Wonders (${visibleWonders.length})</summary>
      ${wonderList}
    </details>`;
  }

  // ── Wizard ────────────────────────────────────────────────

  function renderHostTools() {
    if (!dom.hostTools) return;
    if (!state || !Net.getIsHost() || state.phase === "lobby") { dom.hostTools.innerHTML = ""; return; }
    const playerOptions = state.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    const terrainOptions = Object.keys(Game.TERRAIN).map((t) => `<option value="${t}">${Game.TERRAIN_LABELS[t]}</option>`).join("");
    const focusOptions = Game.FOCUS_TYPES.map((f) => `<option value="${f}">${Game.FOCUS_LABELS[f]}</option>`).join("");
    const resourceOptions = ["", ...Game.RESOURCES, "wonder"].map((r) => `<option value="${r}">${r || "none"}</option>`).join("");
    const districtOptions = ["", ...Game.DISTRICTS].map((d) => `<option value="${d}">${d ? Game.DISTRICT_LABELS[d] : "none"}</option>`).join("");
    const eventOptions = Array.from(new Set(Game.EVENT_NAMES))
      .map((e) => `<option value="${e}">${Game.EVENT_LABELS[e]}</option>`).join("");
    const cityStateOptions = ["", ...Object.keys(Game.CITY_STATE_DATA || {})].map((c) => `<option value="${c}">${c || "none"}</option>`).join("");

    dom.hostTools.innerHTML = `
      <details class="host-tools">
        <summary>Host Tools</summary>
        <div class="host-grid">
          <label>Hex <input id="host-hex" placeholder="q,r" value="${mouseHex ? Game.key(mouseHex.q, mouseHex.r) : ""}"></label>
          <label>Terrain <select id="host-terrain">${terrainOptions}</select></label>
          <label>Resource <select id="host-resource">${resourceOptions}</select></label>
          <button id="host-apply-hex">Apply Hex</button>
          <button id="host-toggle-barb">Toggle Barb</button>
          <button id="host-clear-hex">Clear Hex</button>
          <label>Player <select id="host-player">${playerOptions}</select></label>
          <label>District <select id="host-district">${districtOptions}</select></label>
          <label><input type="checkbox" id="host-fortified"> Fortified</label>
          <button id="host-control">Set Control</button>
          <button id="host-city">Set City</button>
          <label>City-state <select id="host-citystate">${cityStateOptions}</select></label>
          <button id="host-citystate-btn">Set City-state</button>
          <label>Focus <select id="host-focus">${focusOptions}</select></label>
          <label>Amount <input id="host-amount" type="number" value="1"></label>
          <button id="host-trade">Adjust Trade</button>
          <button id="host-resource-player">Adjust Marble</button>
          <label>Event <select id="host-event">${eventOptions}</select></label>
          <button id="host-event-btn">Force Event</button>
          <button id="host-agendas">Check Agendas</button>
        </div>
      </details>`;

    const hexKey = () => document.getElementById("host-hex").value.trim();
    const hostPlayer = () => document.getElementById("host-player").value;
    document.getElementById("host-apply-hex").addEventListener("click", () => {
      dispatch({ type: "HOST_EDIT_HEX", payload: { hexKey: hexKey(), changes: {
        active: true,
        revealed: true,
        terrain: document.getElementById("host-terrain").value,
        resource: document.getElementById("host-resource").value || null
      }}});
    });
    document.getElementById("host-toggle-barb").addEventListener("click", () => {
      const h = state.map.hexes[hexKey()];
      dispatch({ type: "HOST_EDIT_HEX", payload: { hexKey: hexKey(), changes: { active: true, revealed: true, barbarian: !(h && h.barbarian) } } });
    });
    document.getElementById("host-clear-hex").addEventListener("click", () => {
      dispatch({ type: "HOST_EDIT_HEX", payload: { hexKey: hexKey(), changes: { clearOccupants: true } } });
    });
    document.getElementById("host-control").addEventListener("click", () => {
      dispatch({ type: "HOST_EDIT_HEX", payload: { hexKey: hexKey(), changes: {
        active: true,
        revealed: true,
        controlOwnerId: hostPlayer(),
        district: document.getElementById("host-district").value || null,
        fortified: document.getElementById("host-fortified").checked
      }}});
    });
    document.getElementById("host-city").addEventListener("click", () => {
      dispatch({ type: "HOST_EDIT_HEX", payload: { hexKey: hexKey(), changes: { active: true, revealed: true, cityOwnerId: hostPlayer() } } });
    });
    document.getElementById("host-citystate-btn").addEventListener("click", () => {
      dispatch({ type: "HOST_EDIT_HEX", payload: { hexKey: hexKey(), changes: { active: true, revealed: true, cityStateName: document.getElementById("host-citystate").value || null } } });
    });
    document.getElementById("host-trade").addEventListener("click", () => {
      dispatch({ type: "HOST_ADJUST_PLAYER", payload: { playerId: hostPlayer(), tradeType: document.getElementById("host-focus").value, amount: Number(document.getElementById("host-amount").value || 0) } });
    });
    document.getElementById("host-resource-player").addEventListener("click", () => {
      const resourceType = document.getElementById("host-resource").value;
      dispatch({ type: "HOST_ADJUST_PLAYER", payload: { playerId: hostPlayer(), resourceType: resourceType && resourceType !== "wonder" ? resourceType : "marble", amount: Number(document.getElementById("host-amount").value || 0) } });
    });
    document.getElementById("host-event-btn").addEventListener("click", () => {
      dispatch({ type: "FORCE_EVENT", payload: { event: document.getElementById("host-event").value } });
    });
    document.getElementById("host-agendas").addEventListener("click", () => {
      dispatch({ type: "CHECK_AGENDAS", payload: { playerId: localPlayerId } });
    });
  }

  function renderWizard() {
    if (!state) return;
    if (state.phase === "lobby") { renderLobby(); return; }
    if (state.phase === "setup") { renderSetupWizard(); return; }

    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    const me = Game.getPlayer(state, localPlayerId);

    // The fight itself happens on the board, not in this panel.
    if (state.combat || state.lastCombat) { renderIdleWizard(isMyTurn, cp, me); return; }
    if (state.pendingBarbReward && state.pendingBarbReward.playerId === localPlayerId) { renderBarbReward(me); return; }
    const pending = getVisiblePendingChoice(me);
    if (pending && sub.phase === "idle") { renderPendingChoice(pending); return; }
    if (sub.phase === "idle") { renderIdleWizard(isMyTurn, cp, me); }
    else if (sub.phase === "card_selected") { renderCardSelected(me); }
    else if (sub.phase === "placing_control") { renderPlacingControl(); }
    else if (sub.phase === "growth_choice") { renderGrowthChoice(); }
    else if (sub.phase === "pick_district") { renderPickDistrict(); }
    else if (sub.phase === "placing_district") { renderPlacingDistrict(); }
    else if (sub.phase === "reinforcing") { renderReinforcing(); }
    else if (sub.phase === "move_caravan" || sub.phase === "move_army") { renderMoving(); }
    else if (sub.phase === "reinforcing_after_district") { renderReinforceAfterDistrict(); }
    else if (sub.phase === "move_army_post" || sub.phase === "move_caravan_post") { renderMovingHint(); }
    else if (isExploring(sub.phase)) { renderExploring(); }
    else if (sub.phase === "industry_choice") { renderIndustryChoice(me); }
    else if (sub.phase === "placing_city") { renderPlacingCity(); }
    else if (sub.phase === "placing_wonder") { renderPlacingWonder(); }
    else if (sub.phase === "picking_wonder") { renderPickingWonder(); }
    else if (sub.phase === "choose_target") { renderChooseTarget(); }
    else { return; }

    const help = helpText(sub.phase);
    if (help) dom.wizard.insertAdjacentHTML("beforeend", `<div class="wiz-help">${help}</div>`);
  }

  function renderLobby() {
    const isHost = Net.getIsHost();
    const code = roomCode || Net.getLocalId() || "";
    const min = Game.CFG.minPlayers, max = Game.CFG.maxPlayers;
    const n = state.players.length;
    const canStart = isHost && n <= max && (state.solo || n >= min);
    const leaderById = Object.fromEntries((Game.LEADERS || []).map((l) => [l.id, l]));
    const playerList = state.players.map((p, i) => {
      const lead = leaderById[p.leaderId];
      return `
      <div class="lobby-player">
        <span class="dot" style="background:${p.color}"></span>
        <span class="lp-name">${escapeHtml(p.name)}${lead ? ` <span class="lp-civ">${escapeHtml(lead.civ)}</span>` : ` <span class="lp-civ dim">Random civ</span>`}</span>
        ${i === 0 ? '<span class="lp-tag">Host</span>' : ""}
        ${p.id === localPlayerId ? '<span class="lp-tag you">You</span>' : ""}
      </div>`;
    }).join("");

    const me = Game.getPlayer(state, localPlayerId);
    const takenBy = {};
    state.players.forEach((p) => { if (p.leaderId && p.leaderId !== "random") takenBy[p.leaderId] = p.id; });
    const leaderCards = (Game.LEADERS || []).map((l) => {
      const takenByOther = takenBy[l.id] && takenBy[l.id] !== localPlayerId;
      const mine = me && me.leaderId === l.id;
      const uniqueLine = l.unique ? `${l.unique.name} (${Game.FOCUS_LABELS[l.unique.type] || l.unique.type} ${["I","II","III","IV"][l.unique.tier - 1]})` : "";
      const tip = `${l.ability.text}${l.unique ? `\n\nUnique card — ${uniqueLine}: ${l.unique.text}` : ""}`;
      const art = window.CivCardArt ? CivCardArt.civilizationStyle(l.id) : "";
      return `<button class="leader-card${mine ? " picked" : ""}${takenByOther ? " taken" : ""}${art ? " has-art" : ""}" data-leader="${l.id}"
        ${takenByOther ? "disabled" : ""} title="${escapeHtml(tip)}" aria-label="Choose ${escapeHtml(l.civ)}"${art ? ` style='${art}'` : ""}>
        <span class="lc-shade" aria-hidden="true"></span>
        <span class="lc-civ">${escapeHtml(l.civ)}</span>
        <span class="lc-name">${escapeHtml(l.ability.text.slice(0, 64))}${l.ability.text.length > 64 ? "…" : ""}</span>
        <span class="lc-ability">★ ${escapeHtml(uniqueLine)}</span>
        <span class="lc-src ${l.source}">${l.source === "terra" ? "Terra" : "Base"}</span>
      </button>`;
    }).join("");
    const leaderSection = me ? `
      <div class="lobby-players-head" style="margin-top:12px">Choose your civilization</div>
      <div class="leader-grid">
        <button class="leader-card random${!me.leaderId || me.leaderId === "random" ? " picked" : ""}" data-leader="random" title="Draw a random remaining leader at game start">
          <span class="lc-civ">Random</span><span class="lc-name">Fate decides</span><span class="lc-ability">Dealt at start</span>
        </button>
        ${leaderCards}
      </div>` : "";

    const solo = !!state.solo;
    dom.wizard.innerHTML = `
      <div class="wiz-title">${solo ? "Solo Game" : "Game Lobby"}</div>
      ${solo ? `<div class="wiz-hint">Pick the civilization you want to play, then begin.</div>` : `
      <div class="lobby-code-row">
        <div class="lobby-code-label">Room code</div>
        <div class="lobby-code"><code id="lobby-code-val">${escapeHtml(code)}</code>
          <button id="lobby-copy" class="sm">Copy</button></div>
        <div class="wiz-hint">Share this code so friends can Join.</div>
      </div>
      <div class="lobby-players">
        <div class="lobby-players-head">Players (${n}/${max})</div>
        ${playerList}
        ${n < min ? `<div class="wiz-hint">Need at least ${min} players to start.</div>` : ""}
      </div>`}
      ${leaderSection}
      ${isHost
        ? `<button id="lobby-start" class="wiz-primary" ${canStart ? "" : "disabled"}>${
            solo ? "Begin" : `Start Game (${n} player${n === 1 ? "" : "s"})`}</button>`
        : `<div class="wiz-body">Waiting for the host to start the game...</div>`}
    `;

    dom.wizard.querySelectorAll(".leader-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        dispatch({ type: "SET_LEADER", payload: { playerId: localPlayerId, leaderId: btn.dataset.leader } });
      });
    });

    const copyBtn = document.getElementById("lobby-copy");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      const val = code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(() => showToast("Room code copied")).catch(() => showToast(val));
      } else {
        showToast(val);
      }
    });
    const startBtn = document.getElementById("lobby-start");
    if (startBtn) startBtn.addEventListener("click", () => {
      if (!state.solo && state.players.length < Game.CFG.minPlayers) {
        showToast(`Need at least ${Game.CFG.minPlayers} players`); return;
      }
      dispatch({ type: "START_GAME", payload: { playerId: localPlayerId } });
    });
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
            <span>Turn it:</span>
            <button id="rot-dec" class="sm">\u21ba</button>
            <span class="tc-val">${sub.tileRotation + 1}/6</span>
            <button id="rot-inc" class="sm">\u21bb</button>
            <button id="side-toggle" class="sm">Side ${sub.tileSide}</button>
          </div>
          <br><strong>Find it a home.</strong> Hover the board \u2014 the tile shows
          <strong style="color:#66bb6a">green</strong> where it fits and
          <strong style="color:#ef5350">red</strong> where it does not. Click to lay it.<br>
          Scroll or <kbd>R</kbd> to turn it, <kbd>F</kbd> to flip it over.<br>
          Tiles remaining: <strong>${playerTiles.length}</strong>
          ${Game.getTileAnchorsAnyRotation(state, tileId).size === 0
            ? `<div class="wiz-note">There is nowhere on the board this tile can go.</div>` : ""}
        </div>`;

      document.getElementById("rot-dec").addEventListener("click", () => turnTile(-1));
      document.getElementById("rot-inc").addEventListener("click", () => turnTile(1));
      document.getElementById("side-toggle").addEventListener("click", flipTile);
    }
  }

  function renderTilePreview() {
    const offsets = Game.TILE_OFFSETS.map((off) => Game.rotateAxial(off, sub.tileRotation));
    const minQ = Math.min(...offsets.map((o) => o.q));
    const minR = Math.min(...offsets.map((o) => o.r));
    const cells = offsets.map((o, i) => ({ q: o.q - minQ, r: o.r - minR, idx: i }));
    const s = 10;
    const anim = pendingPreviewAnim ? ` tp-${pendingPreviewAnim}` : "";
    pendingPreviewAnim = null;
    let svg = `<svg class="tp-svg${anim}" width="130" height="75" viewBox="-5 -5 130 75">`;

    let tile = null;
    if (state && state.phase === "setup") {
      const playerTiles = state.setup.playerTiles[localPlayerId] || [];
      tile = playerTiles[0] ? state.setup.tiles[playerTiles[0]] : null;
    } else if (state && isExploring(sub.phase)) {
      const tid = exploringTileId();
      tile = tid ? state.tiles[tid] : null;
    }
    // Show the tile's real face, so turning it over actually looks like turning
    // it over — the preview used to invent its own colours and both sides of
    // every tile came out identical.
    const def = tile && Game.getTileDef ? Game.getTileDef(tile.id) : null;
    const face = def && def.sides ? (def.sides[sub.tileSide] || def.sides.A) : null;
    const faceCells = face ? face.cells : null;
    const tileType = tile ? tile.type : "normal";

    cells.forEach((c) => {
      const cx = s * SQRT3 * (c.q + c.r / 2) + 5;
      const cy = s * 1.5 * c.r + 15;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push(`${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`);
      }
      const cell = faceCells ? faceCells[c.idx] : null;
      let fill = TERRAIN_COLORS[cell ? cell.terrain : "grass"] || "#4a7c3f";
      let label = "";
      if (cell && cell.feature === "capital") { fill = "#ffd54f"; label = "C"; }
      else if (cell && cell.naturalWonder) { fill = "#9c27b0"; label = "W"; }
      else if (cell && cell.cityState) { fill = "#ff9800"; label = "CS"; }
      else if (cell && cell.barbarian) { label = cell.barbarian; }
      else if (cell && cell.resource) { label = "\u25c6"; }
      svg += `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="#fff3" stroke-width="0.5"/>`;
      if (label) {
        svg += `<text x="${cx}" y="${cy + 1}" fill="${label === "C" ? "#000" : "#fff"}" font-size="6" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
      }
    });
    svg += `</svg>`;
    return svg;
  }

  // A pending choice that wants a space rather than an option. The map, the
  // chip and the click handler all read it from here so they cannot disagree.
  function activeHexChoice() {
    if (!state || state.phase !== "playing" || sub.phase !== "idle") return null;
    const choice = getVisiblePendingChoice(Game.getPlayer(state, localPlayerId));
    if (!choice || !choice.hexKeys || !choice.hexKeys.length) return null;
    if (choice.options && choice.options.length) return null;
    return choice;
  }

  function getVisiblePendingChoice(me) {
    const choices = state.pendingChoices || [];
    if (!choices.length) return null;
    if (me) {
      const mine = choices.find((c) => c.playerId === me.id);
      if (mine) return mine;
    }
    return Net.getIsHost() ? choices[0] : null;
  }

  function renderPendingChoice(choice) {
    const owner = Game.getPlayer(state, choice.playerId);
    const title = choice.title || "Pending Choice";
    // Never show a raw action name — "science_upgrade" means nothing at the table.
    const CHOICE_BLURB = {
      science_upgrade: "pick the card you take",
      choose_government: "choose a government",
      take_diplomacy: "take a diplomacy card",
      place_control: "place a control token",
      reinforce: "reinforce a control token",
      remove_control: "remove a control token",
      swap_adjacent: "move a control token",
      remove_barbarian: "remove a barbarian"
    };
    const blurb = choice.source || CHOICE_BLURB[choice.kind] || choice.kind;
    let body = `<div>${owner ? owner.name : "Player"}: ${blurb}</div>`;
    let controls = "";

    if (choice.options && choice.options.length) {
      // A civ's own unique card is worth pointing at when it turns up as an
      // option, so it does not read as just another line in the list.
      controls = `<div class="wiz-actions pending-options">${choice.options.map((o) =>
        `<button class="sm pending-option${o.unique ? " unique-option" : ""}" data-option="${o.id}"${
          o.text ? ` title="${escapeHtml(o.text)}"` : ""}>${o.label || o.id}</button>`
      ).join("")}</div>`;
    } else if (choice.hexKeys && choice.hexKeys.length) {
      // Picking a space is done by pointing at it. This used to be a dropdown
      // of raw axial keys — "3,-2" — which nobody can read off a board.
      body += `<div class="pending-note">Click one of the <strong>${choice.hexKeys.length}</strong>
        highlighted spaces on the map.</div>`;
    } else {
      controls = `<div class="wiz-actions"><button id="pending-manual-ok">Resolve</button></div>`;
    }

    if (Net.getIsHost()) {
      controls += `<div class="wiz-actions"><button class="ghost sm" id="pending-dismiss">Dismiss</button></div>`;
    }

    dom.wizard.innerHTML = `
      <div class="wiz-title">${title}</div>
      <div class="wiz-body">${body}</div>
      ${controls}`;

    document.querySelectorAll(".pending-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: { playerId: localPlayerId, choiceId: choice.id, optionId: btn.dataset.option, hostOverride: Net.getIsHost() } });
      });
    });
    document.getElementById("pending-manual-ok")?.addEventListener("click", () => {
      dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: { playerId: localPlayerId, choiceId: choice.id, hostOverride: Net.getIsHost() } });
    });
    document.getElementById("pending-dismiss")?.addEventListener("click", () => {
      dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: { playerId: localPlayerId, choiceId: choice.id, dismiss: true, hostOverride: true } });
    });
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

  // The wonders you can actually build and the cards you are trying to win on
  // both used to be tucked away — one behind a button, the other as grey rows in
  // a sidebar. On a table they sit beside the map where everyone can see them,
  // so that is where they go.
  function renderTableStrip() {
    const strip = dom.tableStrip;
    if (!strip) return;
    if (!state || state.phase !== "playing") { strip.innerHTML = ""; strip.classList.add("hidden"); return; }
    const me = Game.getPlayer(state, localPlayerId);
    const wonders = Game.getVisibleWonders(state) || [];
    const agendaMap = Object.fromEntries((Game.AGENDA_CARDS || []).map((a) => [a.id, a]));
    const active = Game.victoryCards ? Game.victoryCards(state) : [];
    const claims = (state.claimedAgendas && state.claimedAgendas[localPlayerId]) || (me && me.agendaClaims) || {};
    const won = Game.getClaimedAgendaCount ? Game.getClaimedAgendaCount(state, localPlayerId) : 0;

    const wonderCards = wonders.map((w) => {
      const cost = me ? Game.getWonderCost(w.name, me, state) : w.cost;
      return `<div class="ts-wonder type-${w.type} era-${w.era}" title="${escapeHtml(w.effect || "")}">
        <div class="ts-w-top">
          <span class="ts-w-icon">${WONDER_ICONS[w.type] || "\u2b50"}</span>
          <span class="ts-w-era">${escapeHtml(w.era)}</span>
          <span class="ts-w-cost">${cost}${cost !== w.cost ? `<s>${w.cost}</s>` : ""}</span>
        </div>
        <div class="ts-w-name">${escapeHtml(w.name)}</div>
        ${w.token ? `<div class="ts-w-token">\ud83e\ude99 costs 1 less \u00b7 leaves next dial</div>` : ""}
      </div>`;
    }).join("");

    // A victory card carries two agendas and either one claims it, so both are
    // listed with the one you have done marked.
    const agendaCards = active.map((card) => {
      const halves = card.agendas.map((id) => {
        const a = agendaMap[id] || { name: id, description: "" };
        return `<span class="ts-a-half ${claims[id] ? "done" : ""}"
          title="${escapeHtml(a.description || "")}">${escapeHtml(a.name)}</span>`;
      }).join(`<span class="ts-a-or">or</span>`);
      return `<div class="ts-agenda ${claims[card.id] ? "won" : ""}">
        <span class="ts-a-mark">${claims[card.id] ? "\u2713" : ""}</span>
        <span class="ts-a-name">${halves}</span>
      </div>`;
    }).join("");

    strip.classList.remove("hidden");
    strip.innerHTML = `
      <div class="ts-group ts-wonders" id="ts-wonders">
        <div class="ts-label">World Wonders</div>
        <div class="ts-row">${wonderCards || `<div class="ts-empty">none left</div>`}</div>
      </div>
      <div class="ts-group ts-victory" id="ts-victory">
        <div class="ts-label">Victory \u2014 ${won}/4</div>
        <div class="ts-row">${agendaCards}</div>
      </div>`;
    document.getElementById("ts-wonders").addEventListener("click", () => openReference("wonders"));
    document.getElementById("ts-victory").addEventListener("click", () => openReference("victory"));
  }

  // The one thing you might still want to say during a move, said where the move
  // is happening. Everything else the map already answers.
  function renderBoardChip() {
    const chip = dom.boardChip;
    if (!chip) return;
    const fighting = state.combat && state.combat.turn !== "done";

    // A choice waiting on a space says so here, next to the board it is asking
    // you to point at.
    const hexChoice = fighting ? null : activeHexChoice();
    if (hexChoice) {
      chip.innerHTML = `<span class="bc-label">${escapeHtml(hexChoice.title || "Choose a space")}</span>` +
        (hexChoice.optional ? `<button class="bc-btn" id="bc-skip">Skip</button>` : "");
      chip.classList.remove("hidden");
      document.getElementById("bc-skip")?.addEventListener("click", () => dispatch({
        type: "RESOLVE_PENDING_CHOICE",
        payload: { playerId: localPlayerId, choiceId: hexChoice.id, dismiss: true, hostOverride: true } }));
      return;
    }

    const ms = sub.movementState;
    const moving = ms && /^move_(army|caravan)(_post)?$/.test(sub.phase);
    if (!moving || fighting) {
      chip.classList.add("hidden");
      chip.innerHTML = "";
      return;
    }

    const targets = ms.unitType === "army"
      ? Game.findDefenders(state, ms.currentKey, localPlayerId) : [];
    const defender = targets[0] || null;
    const canExplore = Game.isExploreEligible(state, ms.currentKey) && ms.remaining > 0 && !ms.explored;

    let html = "";
    if (defender) {
      // With more than one piece standing there the chip says so rather than
      // naming one of them, because Attack leads to a choice.
      const label = targets.length > 1
        ? `${targets.map((d) => escapeHtml(d.label)).join(" and ")} \u00b7 pick your target`
        : `${escapeHtml(defender.label)} \u00b7 power ${defender.power}`;
      html += `<span class="bc-label bc-danger">${label}</span>
        <button class="bc-btn danger" id="bc-attack">Attack</button>
        <button class="bc-btn" id="bc-retreat">Retreat</button>`;
    } else {
      html += `<span class="bc-label">${ms.remaining} left</span>`;
      if (canExplore) html += `<button class="bc-btn" id="bc-explore">Explore</button>`;
      html += `<button class="bc-btn" id="bc-done">Done</button>`;
    }
    chip.innerHTML = html;
    chip.classList.remove("hidden");

    // It used to float right under the piece, which put it squarely on top of
    // the hex below — so you could not move that way at all, the chip ate the
    // click. It now sits along the bottom of the board, out of the way of every
    // hex, and only its buttons take clicks at all.

    document.getElementById("bc-attack")?.addEventListener("click", endMovement);
    document.getElementById("bc-retreat")?.addEventListener("click", () => {
      ms.currentKey = ms.startKey;
      endMovement();
    });
    document.getElementById("bc-explore")?.addEventListener("click", startExploration);
    document.getElementById("bc-done")?.addEventListener("click", endMovement);
  }

  // The fight takes the board: the map dims, both hexes stay lit, and the dice
  // are the biggest thing on screen. While a side still has military trade
  // tokens it gets to look at the roll and decide — +1, or a fresh die.
  function renderCombatStage() {
    const stage = dom.combatStage;
    if (!stage) return;
    const live = state.combat && state.combat.turn !== "done" ? state.combat : null;
    const done = !live && state.lastCombat ? state.lastCombat : null;
    if (!live && !done) {
      stage.classList.add("hidden");
      stage.innerHTML = "";
      lastStageKey = null;
      return;
    }

    const DICE = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];
    const atkName = live
      ? (Game.getPlayer(state, live.attackerId) || {}).name
      : done.attacker;
    const defName = live ? live.defenderLabel : done.defender;
    const totals = live ? Game.combatTotals(live) : { atk: done.atkTotal, def: done.defTotal };
    const atkRoll = live ? live.atkRoll : done.atkRoll;
    const defRoll = live ? live.defRoll : done.defRoll;

    const actorId = live ? (live.turn === "attacker" ? live.attackerId : live.defenderOwnerId) : null;
    const mine = live && actorId === localPlayerId;
    const asHost = live && !mine && Net.getIsHost();
    const actor = actorId ? Game.getPlayer(state, actorId) : null;
    const tokens = actor ? (actor.trade.military || 0) : 0;
    const barkal = live ? Game.combatResources(state, live, live.turn) : [];

    // Each side's die is its own now. The attacker's lands first and sits there
    // as the number to beat while the defender's is still in the cup.
    const atkThrown = live ? !!live.atkRolled : true;
    const defThrown = live ? !!live.defRolled : true;
    const thrown = live ? live.rolled : true;
    const side = (cls, label, roll, total, note, down, next) => `
      <div class="cs-side ${cls}${next ? " cs-next" : ""}">
        <div class="cs-name">${escapeHtml(label || "?")}</div>
        <div class="cs-die ${cls}${down ? "" : " waiting"}">${down ? DICE[(roll || 1) - 1] : "\u2b1c"}</div>
        <div class="cs-total">${down ? total : "\u2013"}</div>
        <div class="cs-note">${note}</div>
      </div>`;

    // Every point, named. A single total tells you nothing about whether to
    // spend, which is the only decision you have.
    const lines = (parts, roll, trade, thrown) => {
      const rows = [];
      if (thrown) rows.push({ label: "die", value: roll });
      (parts || []).forEach((x) => { if (x.value) rows.push(x); });
      if (trade) rows.push({ label: "trade tokens", value: trade });
      return rows.map((r) => `<div class="cs-line"><span>${escapeHtml(r.label)}</span><b>+${r.value}</b></div>`).join("")
        || `<div class="cs-line"><span>nothing</span><b>0</b></div>`;
    };
    const atkNote = lines(live ? live.atkParts : done.atkParts, atkRoll,
      live ? live.atkTrade : done.atkTrade, atkThrown);
    const defNote = lines(live ? live.defParts : done.defParts, defRoll,
      live ? live.defTrade : done.defTrade, defThrown);

    let foot = "";
    if (live && !atkThrown) {
      const mineToThrow = live.attackerId === localPlayerId;
      foot = mineToThrow || Net.getIsHost()
        ? `<div class="cs-turn">Your die first.</div>
           <div class="cs-actions"><button class="cs-btn primary" id="cs-roll" data-side="attacker">Throw</button></div>`
        : `<div class="cs-turn">Waiting for ${escapeHtml(atkName || "the attacker")} to throw\u2026</div>`;
    } else if (live && !defThrown) {
      const roller = Game.combatDefenderRoller(state, live);
      const rp = Game.getPlayer(state, roller);
      const mineToThrow = roller === localPlayerId;
      // The number to beat is on the table now, which is the moment worth
      // holding — say it out loud before the second die goes down. The defender
      // wins ties, so they need to MATCH the attacker's total, not pass it.
      const need = totals.atk - live.defBase - live.defTrade;
      const ask = need <= 1 ? "anything at all"
        : need > 6 ? "more than a die can give"
        : `a <b>${need}</b> or better`;
      const beat = `<div class="cs-turn cs-beat">${escapeHtml(atkName || "The attacker")} stands at
        <b>${totals.atk}</b>. ${escapeHtml(defName || "The defender")} needs ${ask}.</div>`;
      foot = mineToThrow || Net.getIsHost()
        ? `${beat}<div class="cs-actions"><button class="cs-btn primary" id="cs-roll" data-side="defender">Throw to answer</button></div>`
        : `${beat}<div class="cs-turn">Waiting for ${escapeHtml(rp ? rp.name : "the defender")} to answer\u2026</div>`;
    } else if (live) {
      const who = live.turn === "attacker" ? "Attacker" : "Defender";
      if (mine || asHost) {
        // Jebel Barkal turns your resources into ammunition, so they belong on
        // the stage next to the trade tokens rather than in a panel somewhere.
        const burn = barkal.map((r) => `<button class="cs-btn cs-res" data-res="${r}">
            ${escapeHtml(r)} +2</button>`).join("");
        foot = `<div class="cs-turn">${who}: spend a military trade token?
            <span class="cs-left">${tokens} left</span></div>
          <div class="cs-actions">
            <button class="cs-btn" id="cs-plus" ${tokens ? "" : "disabled"}>+1</button>
            <button class="cs-btn" id="cs-reroll" ${tokens ? "" : "disabled"}>Reroll</button>
            <button class="cs-btn primary" id="cs-done">Done</button>
          </div>
          ${burn ? `<div class="cs-turn cs-barkal">Jebel Barkal: burn a resource?</div>
            <div class="cs-actions">${burn}</div>` : ""}`;
      } else {
        foot = `<div class="cs-turn">Waiting for ${escapeHtml(actor ? actor.name : who)} to bid\u2026</div>`;
      }
    } else {
      foot = `<div class="cs-verdict ${done.win ? "cs-win" : "cs-lose"}">${done.win ? "VICTORY" : "DEFEATED"}</div>
        <div class="cs-actions"><button class="cs-btn primary" id="cs-ok">Continue</button></div>`;
    }

    const story = (live ? live.history : (done.history || [])).map((h) => {
      const who2 = h.side === "attacker" ? "Attacker" : "Defender";
      if (h.mode === "reroll") return `<li>${who2} rerolled a ${h.from} into a ${h.to}</li>`;
      if (h.mode === "resource") return `<li>${who2} burned ${escapeHtml(h.resource)} at Jebel Barkal for +2</li>`;
      return `<li>${who2} paid a token for +1</li>`;
    }).join("");

    stage.classList.remove("hidden");
    stage.innerHTML = `<div class="cs-scrim"></div>
      <div class="cs-body">
        <div class="cs-vs"><strong>${escapeHtml(atkName || "Attacker")}</strong> attacks <strong>${escapeHtml(defName || "?")}</strong></div>
        <div class="cs-duel">
          ${side("atk", atkName, atkRoll, totals.atk, atkNote, atkThrown, live && !atkThrown)}
          <div class="cs-x">\u2694</div>
          ${side("def", defName, defRoll, totals.def, defNote, defThrown, live && atkThrown && !defThrown)}
        </div>
        ${story ? `<ul class="cs-story">${story}</ul>` : ""}
        ${foot}
      </div>`;

    const bid = (mode) => dispatch({ type: "COMBAT_SPEND", payload: {
      playerId: localPlayerId, side: live.turn, mode, hostOverride: !!asHost } });
    const rollBtn = document.getElementById("cs-roll");
    rollBtn?.addEventListener("click", () => dispatch({
      type: "COMBAT_ROLL", payload: { playerId: localPlayerId,
        side: rollBtn.dataset.side, hostOverride: Net.getIsHost() } }));
    document.getElementById("cs-plus")?.addEventListener("click", () => bid("plus"));
    document.getElementById("cs-reroll")?.addEventListener("click", () => bid("reroll"));
    document.querySelectorAll(".cs-res").forEach((b) => b.addEventListener("click", () => dispatch({
      type: "COMBAT_SPEND", payload: { playerId: localPlayerId, side: live.turn,
        mode: "resource", resource: b.dataset.res, hostOverride: !!asHost } })));
    document.getElementById("cs-done")?.addEventListener("click", () => dispatch({
      type: "COMBAT_PASS", payload: { playerId: localPlayerId, side: live.turn, hostOverride: !!asHost } }));
    document.getElementById("cs-ok")?.addEventListener("click", () => {
      state.lastCombat = null; render();
    });

    // Re-tumble only when a die has actually changed, so the stage does not
    // spin every time the panel re-renders.
    const key = `${live ? "live" : "done"}:${atkThrown}:${defThrown}:${atkRoll}:${defRoll}:${totals.atk}:${totals.def}`;
    if ((atkThrown || defThrown) && key !== lastStageKey) {
      // Tumble only what has actually left the cup, so the second throw is its
      // own moment rather than a re-run of the first.
      if (atkThrown) rollDice(stage.querySelector(".cs-die.atk"), atkRoll);
      if (defThrown) rollDice(stage.querySelector(".cs-die.def"), defRoll);
      flashHex((live || done).toKey || (state.combat && state.combat.toKey), "rgb(239,83,80)", 900);
      lastStageKey = key;
    }
  }

  let lastStageKey = null;

  // Spin a die through random faces before it settles on what was actually
  // rolled. Purely decorative — the result is already decided.
  function rollDice(el, result) {
    if (!el || reducedMotion()) return;
    const faces = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];
    const final = faces[(result || 1) - 1];
    let ticks = 0;
    el.classList.add("rolling");
    const id = setInterval(() => {
      el.textContent = faces[Math.floor(Math.random() * 6)];
      if (++ticks >= 14) {
        clearInterval(id);
        el.textContent = final;
        el.classList.remove("rolling");
        el.classList.add("landed");
        setTimeout(() => el.classList.remove("landed"), 400);
      }
    }, 62);
  }

  const reducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A short banner for things worth noticing — a wonder finished, a city founded.
  function announce(text, kind) {
    const el = document.getElementById("announce");
    if (!el) return;
    el.textContent = text;
    el.className = `announce k-${kind || "info"}`;
    void el.offsetWidth;                       // restart the animation
    el.classList.add("show");
    clearTimeout(announce._t);
    announce._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function renderIdleWizard(isMyTurn, cp, me) {
    if (!isMyTurn) {
      dom.wizard.innerHTML = `<div class="wiz-title">Waiting</div><div class="wiz-body">It's <strong>${cp ? cp.name : "..."}</strong>'s turn.</div>`;
      return;
    }
    // Your turn IS resolving a focus card (base p6) — there is no passing. So
    // there is nothing to end until you have taken it, and no button offering
    // to skip the only thing a turn is made of.
    const taken = !!(me && me.cardPlayed);
    const body = taken
      ? `Card resolved. Nothing left to do this turn.`
      : `Resolve a <strong>focus card</strong> below \u2014 that is your turn.`;
    const actions = taken
      ? `<div class="wiz-actions"><button class="primary" id="wiz-end-turn">End Turn</button></div>`
      : "";
    dom.wizard.innerHTML = `<div class="wiz-title">Your Turn</div><div class="wiz-body">${body}</div>${actions}`;
    document.getElementById("wiz-end-turn")?.addEventListener("click", () => dispatch({ type: "END_TURN", payload: { playerId: localPlayerId } }));
  }

  function renderCardSelected(me) {
    const slot = Game.getSlotValue(me, sub.cardType, state);
    const tradeAvail = me.trade[sub.cardType];
    // Military tokens are handed over during the combat itself, after both
    // sides have rolled, so there is nothing to spend up front.
    const spendsUpFront = sub.cardType !== "military";
    const tradeBlock = spendsUpFront
      ? `<div class="trade-counter">
          <span>Spend:</span>
          <button id="tc-dec" class="sm">-</button>
          <span class="tc-val" id="tc-val">${sub.tradeSpent}</span>
          <button id="tc-inc" class="sm">+</button>
        </div>`
      : `<div class="wiz-note">Spent during combat, after both dice.</div>`;
    dom.wizard.innerHTML = `
      <div class="wiz-title">${Game.FOCUS_LABELS[sub.cardType]} (Slot ${slot})</div>
      <div class="wiz-body">
        ${Game.FOCUS_TRADE_DESC[sub.cardType]}<br>
        Trade available: <strong>${tradeAvail}</strong>
        ${tradeBlock}
        ${getCardPreview(sub.cardType, me, slot)}
      </div>
      <div class="wiz-actions">
        <button class="primary" id="wiz-start">Start Action</button>
        <button class="ghost" id="wiz-cancel">Cancel</button>
      </div>
      <div class="wiz-actions"><button class="ghost sm" id="wiz-nothing"
        title="Resolve and reset this card without doing anything. It still counts as your turn's card.">Resolve for nothing</button></div>`;
    if (spendsUpFront) {
      document.getElementById("tc-dec").addEventListener("click", () => { sub.tradeSpent = Math.max(0, sub.tradeSpent - 1); renderWizard(); });
      document.getElementById("tc-inc").addEventListener("click", () => { sub.tradeSpent = Math.min(tradeAvail, sub.tradeSpent + 1); renderWizard(); });
    }
    document.getElementById("wiz-start").addEventListener("click", startAction);
    document.getElementById("wiz-cancel").addEventListener("click", cancelAction);
    document.getElementById("wiz-nothing").addEventListener("click", () => {
      dispatch({ type: "END_FOCUS_CARD", payload: {
        playerId: localPlayerId, cardType: sub.cardType, tradeSpent: 0 } });
      resetSub();
    });
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
    const me = Game.getPlayer(state, localPlayerId);
    const list = me ? (unitType === "caravan" ? me.caravans : me.armies) : [];
    const left = (list || []).filter((u) => !u.movedThisCard).length;
    const cardOpen = state.activeCard && state.activeCard.playerId === localPlayerId;
    // The card moves every figure of its kind, so say how many are still waiting.
    const onCard = (list || []).filter((u) => !u.movedThisCard && !u.position).length;
    const hint = selectingUnit
      ? `Click one of your <strong>${unitType}s</strong> on the map.` +
        (onCard ? `<br><em>${onCard} waiting on the card — click one of your cities to send it out.</em>` : "")
      : `Click a <strong>highlighted hex</strong> to move.`;
    dom.wizard.innerHTML = `
      <div class="wiz-title">Move ${unitType === "caravan" ? "Caravan" : "Army"}${remaining}</div>
      <div class="wiz-body">${hint}${left > 1 ? `<br><span class="wiz-note">${left} still to move on this card.</span>` : ""}</div>
      <div class="wiz-actions">
        ${cardOpen && selectingUnit ? `<button id="wiz-done-card">Done with card</button>` : ""}
        <button class="ghost" id="wiz-cancel6">Cancel</button>
      </div>`;
    document.getElementById("wiz-done-card")?.addEventListener("click", () => {
      dispatch({ type: "END_FOCUS_CARD", payload: { playerId: localPlayerId } });
      resetSub();
    });
    document.getElementById("wiz-cancel6").addEventListener("click", cancelAction);
  }

  // The rail says what is happening; the board says what to do about it.
  function renderReinforceAfterDistrict() {
    dom.wizard.innerHTML = `
      <div class="wiz-title">Reinforce with your trade</div>
      <div class="wiz-body">The district is placed. Each trade token you spent also turns one of your
        control tokens over \u2014 click <strong>${sub.remaining}</strong> more on the map.</div>
      <div class="wiz-actions"><button id="wiz-skip-reinforce">Stop here</button></div>`;
    document.getElementById("wiz-skip-reinforce").addEventListener("click", finishDistrictWithReinforcements);
  }

  function renderMovingHint() {
    const ms = sub.movementState;
    if (!ms) { renderIdleWizard(false, Game.currentPlayer(state), Game.getPlayer(state, localPlayerId)); return; }
    const defender = ms.unitType === "army"
      ? Game.findDefender(state, ms.currentKey, localPlayerId) : null;
    dom.wizard.innerHTML = `
      <div class="wiz-title">${ms.unitType === "army" ? "Army" : "Caravan"} on the move</div>
      <div class="wiz-body">${defender
        ? `<strong style="color:#ef5350">${escapeHtml(defender.label)}</strong> is in the way \u2014 attack or pull back from the chip on the board.`
        : `Click another space to keep going, or the unit itself to stop. <kbd>Esc</kbd> cancels.`}</div>`;
  }

  // Two pieces in one space is a real fork: the city is worth more and defends
  // at double terrain, the army is softer and clears the way. Each option shows
  // what you would actually be rolling against.
  function renderChooseTarget() {
    const t = sub.attackTargets;
    if (!t) { resetSub(); return; }
    const me = Game.getPlayer(state, localPlayerId);
    const mine = me ? Game.getSlotValue(me, "military", state) +
      Game.getMilitaryCombatBonus(me) +
      Game.getLeaderAttackBonus(state, localPlayerId, t.hexKey) : 0;
    dom.wizard.innerHTML = `
      <div class="wiz-title">Which piece are you attacking?</div>
      <div class="wiz-body">
        <div class="tgt-mine">Your attack: <b>${mine}</b> before the die.</div>
        ${t.list.map((d, i) => `
          <button class="tgt-card" data-i="${i}">
            <span class="tgt-name">${escapeHtml(d.label)}</span>
            <span class="tgt-power">${d.power}</span>
            <span class="tgt-parts">${(d.parts || []).filter((x) => x.value)
              .map((x) => `${escapeHtml(x.label)} +${x.value}`).join(", ") || "no bonuses"}</span>
          </button>`).join("")}
      </div>
      <div class="wiz-actions"><button class="ghost" id="tgt-back">Back</button></div>`;

    document.querySelectorAll(".tgt-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = t.list[Number(btn.dataset.i)];
        flashHex(t.hexKey, "rgb(239,83,80)", 800);
        dispatch({ type: "PLAY_MILITARY_ATTACK", payload: {
          playerId: localPlayerId, unitId: t.unitId, toKey: t.hexKey,
          fromKey: t.fromKey, targetType: d.type } });
        sub.attackTargets = null;
        nextUnitOrFinish("army");
      });
    });
    document.getElementById("tgt-back")?.addEventListener("click", () => {
      sub.attackTargets = null;
      continueMovement();
    });
  }

  function renderExploring() {
    const expTileId = exploringTileId();
    const expTile = expTileId ? state.tiles[expTileId] : null;
    const expType = expTile ? expTile.type.charAt(0).toUpperCase() + expTile.type.slice(1) : "?";
    dom.wizard.innerHTML = `
      <div class="wiz-title">Exploring: ${expType} Tile</div>
      <div class="wiz-body">
        <div class="tile-preview">${renderTilePreview()}</div>
        <div class="trade-counter">
          <span>Rotation:</span>
          <button id="rot-dec" class="sm">Q</button>
          <span class="tc-val">${sub.tileRotation + 1}/6</span>
          <button id="rot-inc" class="sm">E</button>
        </div>
        <div class="trade-counter">
          <span>Side:</span>
          <button id="side-toggle" class="sm">${sub.tileSide}</button>
        </div>
        <br>Place the tile touching ${sub.phase === "free_exploring" ? "the space you chose" : "your unit's hex"}.<br>
        <strong style="color:#66bb6a">Green</strong> = valid, <strong style="color:#ef5350">Red</strong> = invalid.
        <br>Tiles remaining in stack: <strong>${state.tileStack ? state.tileStack.length : 0}</strong>
      </div>
      <div class="wiz-actions">
        <button class="ghost" id="wiz-cancel-explore">Back</button>
        <button class="ghost" id="wiz-abandon-explore">Nowhere it fits</button>
      </div>`;

    document.getElementById("rot-dec").addEventListener("click", () => turnTile(-1));
    document.getElementById("rot-inc").addEventListener("click", () => turnTile(1));
    document.getElementById("side-toggle").addEventListener("click", flipTile);
    document.getElementById("wiz-cancel-explore").addEventListener("click", () => {
      if (sub.phase === "free_exploring") { resetSub(); render(); return; }
      const ms = sub.movementState;
      sub.phase = ms.unitType === "army" ? "move_army_post" : "move_caravan_post";
      render();
    });
    // Terra p12: a tile with nowhere to go returns to the top of the stack and
    // the expedition ends. The movement is spent either way.
    document.getElementById("wiz-abandon-explore").addEventListener("click", () => {
      const ms = sub.movementState;
      dispatch({ type: "ABANDON_EXPLORATION", payload: { playerId: localPlayerId, fromKey: exploreOrigin() } });
      if (sub.phase === "free_exploring") { resetSub(); render(); return; }
      ms.remaining -= 1;
      ms.explored = true;
      if (ms.remaining > 0) continueMovement(); else endMovement();
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
      // Base p11: you attack ONE piece in the space. Where a city and an army
      // are both standing there, that is a real decision — so ask, but only
      // then. One target means no question.
      const targets = Game.findDefenders(state, ms.currentKey, localPlayerId);
      if (targets.length > 1) {
        sub.attackTargets = { hexKey: ms.currentKey, fromKey: ms.startKey,
          unitId: ms.unitId, list: targets };
        sub.phase = "choose_target";
        render();
        return;
      }
      const defender = targets[0] || null;
      if (defender) {
        flashHex(ms.currentKey, "rgb(239,83,80)", 800);
        dispatch({ type: "PLAY_MILITARY_ATTACK", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey,
          fromKey: ms.startKey, targetType: defender.type
        }});
      } else {
        dispatch({ type: "PLAY_MILITARY_MOVE", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey, tradeSpent: sub.tradeSpent
        }});
      }
    } else {
      dispatch({ type: "PLAY_ECONOMY", payload: {
        playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey, tradeSpent: sub.tradeSpent,
        startKey: ms.romeStart || undefined
      }});
    }
    nextUnitOrFinish(ms.unitType);
  }

  // Economy and military cards move each of your figures. Hand the player the
  // next one; when none are left the engine has already reset the card.
  function nextUnitOrFinish(unitType) {
    const me = Game.getPlayer(state, localPlayerId);
    const active = state.activeCard;
    if (!me || !active || active.playerId !== localPlayerId) { resetSub(); return; }
    const list = unitType === "caravan" ? me.caravans : me.armies;
    const left = (list || []).filter((u) => !u.movedThisCard);
    if (!left.length) { resetSub(); return; }
    sub.selectedUnit = null;
    sub.movementState = null;
    sub.phase = unitType === "caravan" ? "move_caravan" : "move_army";
    sub.validHexes = new Set();
    render();
  }

  function computeStepDistance(st, fromKey, toKey, maxSteps, unitType, playerId) {
    if (fromKey === toKey) return 0;
    const distances = Game.getReachableWithDist(st, fromKey, maxSteps, unitType, playerId);
    if (distances.has(toKey)) return distances.get(toKey);
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

    const visible = Game.getVisibleWonders(state).filter((w) => !builtWonders.has(w.name));

    let html = `<div class="wiz-title">Choose Visible Wonder (Production: ${prod})</div><div class="wiz-body" style="max-height:260px;overflow-y:auto">`;
    visible.forEach((w) => {
      const affordable = prod >= w.cost;
      const disabled = affordable ? "" : " disabled";
      html += `<button class="sm wonder-pick${disabled}" data-name="${w.name}" style="margin:2px;text-align:left;display:block;width:100%"${disabled ? " disabled" : ""}>
        <strong>${w.name}</strong> (${w.type}, ${w.era}, cost ${w.cost})${affordable ? "" : ` <span style="color:var(--danger)">need ${w.cost}</span>`}<br>
        <span style="font-size:10px;opacity:0.8">${w.effect}</span>
      </button>`;
    });
    if (!visible.length) html += `<div style="opacity:0.5;font-size:11px">No visible wonders left.</div>`;
    html += `</div><div class="wiz-actions"><button class="ghost" id="wiz-cancel-wonder">Cancel</button></div>`;

    dom.wizard.innerHTML = html;
    document.querySelectorAll(".wonder-pick:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wonder = Game.getVisibleWonders(state).find((w) => w.name === btn.dataset.name);
        if (!wonder) return;
        sub.selectedWonder = wonder;
        sub.phase = "placing_wonder";
        sub.validHexes = Game.validWonderHexes(state, localPlayerId);
        render();
      });
    });
    document.getElementById("wiz-cancel-wonder").addEventListener("click", cancelAction);
  }

  // --- Reference panels -----------------------------------------------------
  // Wonders, diplomacy and city-states were all but unreadable: costs and
  // effects only appeared deep inside the build flow, and diplomacy text hid in
  // a hover. These open from the header at any time.

  const WONDER_ICONS = { military: "\u2694\ufe0f", culture: "\ud83c\udfad", economy: "\ud83d\udcb0", science: "\ud83d\udd2c" };

  function wonderState(name) {
    let built = null;
    Object.values(state.map.hexes).forEach((h) => {
      if (h.city && h.city.wonder && h.city.wonder.name === name) built = h.city.ownerId;
    });
    if (built) {
      const owner = Game.getPlayer(state, built);
      return { label: owner ? `built by ${owner.name}` : "built", cls: "built" };
    }
    const gone = Object.values(state.wonderDecks || {})
      .some((d) => (d.removed || []).indexOf(name) >= 0);
    if (gone) return { label: "removed from the game", cls: "gone" };
    const onTop = (Game.getVisibleWonders(state) || []).some((w) => w.name === name);
    return onTop ? { label: "available now", cls: "top" } : { label: "still in the deck", cls: "deck" };
  }

  function renderWondersRef() {
    const me = Game.getPlayer(state, localPlayerId);
    // ALL_WONDERS is one flat list, each entry already carrying its type.
    const all = Game.ALL_WONDERS || [];
    const byType = {};
    all.forEach((w) => { (byType[w.type] = byType[w.type] || []).push(w); });
    const types = Object.keys(byType);
    let html = `<div class="ref-card">
      <button class="detail-close" id="ref-close" aria-label="Close">✕</button>
      <h2 class="ref-title">World Wonders</h2>
      <p class="ref-lede">Built with the industry card. Production is that card's
        place number, +1 per industry trade token spent, and +2 for every resource
        you put in. You need a city of your own that has no wonder yet.
        <em>Which resources a given wonder accepts is printed on its card art,
        which I do not have — so any resource counts here.</em></p>`;
    types.forEach((type) => {
      html += `<h3 class="ref-group">${Game.FOCUS_LABELS[type] || type}</h3><div class="ref-grid">`;
      (byType[type] || []).slice()
        .sort((a, b) => (a.era || "").localeCompare(b.era || "") || a.cost - b.cost)
        .forEach((w) => {
          const st8 = wonderState(w.name);
          const afford = me ? Game.getWonderCost(w.name, me, state) : w.cost;
          const token = Game.getWonderToken(state, w.name);
          const wArt = window.CivCardArt ? CivCardArt.wonder(w.name) : "";
          html += `<div class="wcard type-${type} era-${w.era} st-${st8.cls}${wArt ? " has-art" : ""}"${
            wArt ? ` style="${wArt}"` : ""}>
            <div class="wcard-top">
              <span class="wcard-icon">${WONDER_ICONS[type] || "\u2b50"}</span>
              <span class="wcard-era">${escapeHtml(w.era)}</span>
              <span class="wcard-coin" title="Production cost">${afford}${afford !== w.cost ? `<s>${w.cost}</s>` : ""}</span>
            </div>
            <div class="wcard-name">${escapeHtml(w.name)}</div>
            <div class="wcard-body">
              <p class="wcard-text">${escapeHtml(w.effect || "")}</p>
              ${w.auto ? "" : `<p class="wcard-manual">Resolve at the table — not automated</p>`}
            </div>
            ${token ? `<div class="wcard-token" title="Placed by the event dial">
              \ud83e\ude99 costs 1 less \u2014 leaves the game on the next wonder icon</div>` : ""}
            <div class="wcard-foot st-${st8.cls}">${st8.label}</div>
          </div>`;
        });
      html += `</div>`;
    });
    html += `</div>`;
    return html;
  }

  // The five cards you are racing on, in full, with what you have already done.
  function renderVictoryRef() {
    const agendaMap = Object.fromEntries((Game.AGENDA_CARDS || []).map((a) => [a.id, a]));
    const active = Game.victoryCards ? Game.victoryCards(state) : [];
    const claims = (state.claimedAgendas && state.claimedAgendas[localPlayerId]) || {};
    const won = Game.getClaimedAgendaCount ? Game.getClaimedAgendaCount(state, localPlayerId) : 0;
    return `<div class="ref-card">
      <button class="detail-close" id="ref-close" aria-label="Close">\u2715</button>
      <h2 class="ref-title">Victory \u2014 ${won} of 4</h2>
      <p class="ref-lede">Every victory card is divided into <strong>two agendas</strong>, and completing
        <strong>either</strong> one claims the card (base p12). Claim <strong>four</strong> of these five
        to win (Terra p8). Victory is checked at the end of each round, before the dial turns. A claim
        sticks even if you stop meeting it \u2014 except the fort cards, which must be held.</p>
      <div class="ref-grid">${active.map((card) => `
        <div class="vcard ${claims[card.id] ? "won" : ""}">
          <div class="vcard-top">${claims[card.id] ? "\u2713 claimed" : "not yet"}${card.fortress ? " \u00b7 must be held" : ""}</div>
          ${card.agendas.map((id) => {
            const a = agendaMap[id] || { name: id, description: "" };
            return `<div class="vcard-half ${claims[id] ? "done" : ""}">
              <div class="vcard-name">${escapeHtml(a.name)}</div>
              <div class="vcard-text">${escapeHtml(a.description || "")}</div>
            </div>`;
          }).join(`<div class="vcard-or">or</div>`)}
        </div>`).join("")}</div>
    </div>`;
  }

  function renderDiplomacyRef() {
    const me = Game.getPlayer(state, localPlayerId);
    const cards = Game.DIPLOMACY_CARDS || {};
    const mine = (me && me.diplomacy) || [];
    let html = `<div class="ref-card">
      <button class="detail-close" id="ref-close" aria-label="Close">✕</button>
      <h2 class="ref-title">Diplomacy</h2>
      <p class="ref-lede">A caravan reaching a city-state or a rival city brings one
        back. Each city-state has two copies of its own card; each rival offers a
        choice of theirs, and you may swap the one you hold for another.</p>
      <h3 class="ref-group">In your hand (${mine.length})</h3>`;
    html += mine.length ? `<div class="ref-grid">` + mine.map((d) => {
      const meta = cards[d.cardId] || cards[d.type] || {};
      const from = d.fromCityState
        ? `from ${escapeHtml(d.fromCityState)}`
        : `from ${escapeHtml((Game.getPlayer(state, d.fromId) || {}).name || "a rival")}`;
      return `<div class="wcard type-${d.type || "culture"} held">
        <div class="wcard-top"><span class="wcard-icon">\ud83e\udd1d</span><span class="wcard-era">${from}</span></div>
        <div class="wcard-name">${escapeHtml(d.name || d.cardId)}</div>
        <div class="wcard-body"><p class="wcard-text">${escapeHtml(d.effect || meta.text || meta.effect || "")}</p></div>
      </div>`;
    }).join("") + `</div>` : `<p class="ref-empty">None yet — send a caravan to a city-state or a rival city.</p>`;

    html += `<h3 class="ref-group">The four rival cards</h3><div class="ref-grid">`;
    Object.entries(cards).forEach(([id, c]) => {
      html += `<div class="wcard type-military">
        <div class="wcard-top"><span class="wcard-icon">\ud83d\udcdc</span><span class="wcard-era">rival card</span></div>
        <div class="wcard-name">${escapeHtml(c.name)}</div>
        <div class="wcard-body"><p class="wcard-text">${escapeHtml(c.text || c.effect || "")}</p></div>
      </div>`;
    });
    html += `</div>`;

    // City-states currently on the map, with what a caravan there would earn.
    const seen = [];
    Object.entries(state.map.hexes).forEach(([k, h]) => {
      if (h.cityState) seen.push({ key: k, cs: h.cityState });
    });
    html += `<h3 class="ref-group">City-states on the map (${seen.length})</h3>`;
    html += seen.length ? `<div class="ref-grid">` + seen.map(({ key, cs }) => {
      const data = (Game.CITY_STATE_DATA || {})[cs.name] || {};
      return `<div class="wcard type-${cs.type}">
        <div class="wcard-top">
          <span class="wcard-icon">\ud83c\udfdb\ufe0f</span>
          <span class="wcard-era">${escapeHtml(cs.type)}</span>
          <span class="wcard-coin" title="Defence value">${Game.CFG.cityStateDefense}</span>
        </div>
        <div class="wcard-name">${escapeHtml(cs.name)}</div>
        <div class="wcard-body">
          <p class="wcard-text">${escapeHtml(data.diplomacy || "")}</p>
          <p class="wcard-note">A caravan arriving earns 2 ${escapeHtml(cs.type)} trade and a diplomacy card.</p>
        </div>
        <div class="wcard-foot">${cs.diplomacyCards} card(s) left · ${key}</div>
      </div>`;
    }).join("") + `</div>` : `<p class="ref-empty">None revealed yet.</p>`;

    html += `</div>`;
    return html;
  }

  // The civ card: everything your civilization gives you, in one place, instead
  // of squeezed into the left panel.
  function renderCivRef(playerId) {
    const who = Game.getPlayer(state, playerId || localPlayerId);
    const lead = who && Game.getLeader ? Game.getLeader(who) : null;
    if (!lead) {
      return `<div class="ref-card"><button class="detail-close" id="ref-close">✕</button>
        <h2 class="ref-title">No civilization yet</h2>
        <p class="ref-lede">One is drawn when the game starts.</p></div>`;
    }
    const style = (Game.CIV_STYLE || {})[lead.id] || { emblem: "⭐", color: "#666" };
    const u = lead.unique;
    const tierRoman = ["I", "II", "III", "IV"];

    // The starting focus row, in the order the leader sheet prints it. The extra
    // duplicate "1" place sits at the far left, so the first two both read 1.
    const slots = Game.FOCUS_SLOTS || [1, 1, 2, 3, 4, 5];
    const order = (lead.focusOrder || []).map((f, i) => `
      <div class="civ-slot type-${f}">
        <span class="civ-slot-n">${slots[i] !== undefined ? slots[i] : i + 1}</span>
        <span class="civ-slot-ico">${Game.CARD_ICONS[f] || ""}</span>
        <span class="civ-slot-lab">${Game.FOCUS_LABELS[f] || f}</span>
      </div>`).join("");

    // The unique card drawn as a real focus card, the same face the footer uses.
    let uniqueFace = "";
    if (u) {
      const mock = {
        focusRow: [u.type], cardTiers: { [u.type]: u.tier },
        trade: { [u.type]: 0 }, techTier: 1, government: null,
        diplomacy: [], leaderId: lead.id, id: "civcard"
      };
      Game.FOCUS_TYPES.forEach((f) => {
        if (mock.cardTiers[f] === undefined) mock.cardTiers[f] = 1;
        if (mock.trade[f] === undefined) mock.trade[f] = 0;
      });
      uniqueFace = renderCardFace(mock, u.type);
    }

    const civArt = window.CivCardArt ? CivCardArt.civilization(lead.id) : "";
    const civSheet = civArt ? `<figure class="civ-sheet">
      <img src="${civArt}" alt="${escapeHtml(lead.civ)} civilization and leader sheet" draggable="false">
      <figcaption>The original civilization sheet</figcaption>
    </figure>` : "";
    const ibrahimHolder = state.ibrahimHolder ? Game.getPlayer(state, state.ibrahimHolder) : null;
    const ibrahimCard = lead.id === "ottoman" && window.CivCardArt
      ? `<h3 class="ref-group">Ibrahim</h3>
        <div class="ibrahim-feature">
          <img src="${CivCardArt.ibrahim()}" alt="Ibrahim card" draggable="false">
          <div><strong>${ibrahimHolder ? `Held by ${escapeHtml(ibrahimHolder.name)}` : "Not assigned yet"}</strong>
          <p>The holder and the Ottoman player each gain a trade token when the holder's caravan reaches an Ottoman city.</p></div>
        </div>` : "";

    return `<div class="ref-card">
      <button class="detail-close" id="ref-close" aria-label="Close">✕</button>
      ${civSheet}
      <div class="civ-head" style="--civ:${style.color}">
        <span class="civ-emblem">${style.emblem}</span>
        <div>
          <h2 class="civ-name">${escapeHtml(lead.civ)}</h2>
          <span class="civ-src">${lead.source === "terra" ? "Terra Incognita" : "Base game"}</span>
        </div>
      </div>

      <h3 class="ref-group">Leader ability</h3>
      <div class="civ-ability">
        <p>${escapeHtml(lead.ability.text)}</p>
        <span class="civ-flag ${lead.ability.manual ? "manual" : "auto"}">${
          lead.ability.manual ? "Resolve at the table" : "Handled automatically"}</span>
      </div>

      ${u ? `<h3 class="ref-group">Unique focus card</h3>
      <div class="civ-unique">
        ${uniqueFace}
        <div class="civ-unique-note">
          <p><strong>${escapeHtml(u.name)}</strong> replaces your
            ${escapeHtml(Game.FOCUS_LABELS[u.type] || u.type)} card at tier
            ${tierRoman[u.tier - 1]}.</p>
          <p class="wcard-text">${escapeHtml(u.text)}</p>
          <span class="civ-flag ${u.auto ? "auto" : "manual"}">${
            u.auto ? "Handled automatically" : "Resolve at the table"}</span>
        </div>
      </div>` : ""}

      ${ibrahimCard}

      <h3 class="ref-group">Starting focus row</h3>
      <p class="ref-lede">The order your cards begin in. A card resolves at the
        number of the place it sits on, then returns to place 1.</p>
      <div class="civ-order">${order}</div>
    </div>`;
  }

  // Everything about the tile a space belongs to: which physical tile it is,
  // which side is up, what is printed on it, and — where somebody has run the
  // extractor — a photograph of the real thing.
  function renderTileRef(tileId) {
    const tile = (state.tiles && state.tiles[tileId]) ||
      (state.setup && state.setup.tiles && state.setup.tiles[tileId]);
    const def = Game.getTileDef(tileId);
    const side = tile ? (tile.side || "A") : "A";
    const facts = window.CivTileArt ? CivTileArt.tileFacts(tileId) : null;
    const cells = Object.entries(state.map.hexes)
      .filter(([, h]) => h.tileId === tileId)
      .sort((a, b) => (a[1].tileCell || 0) - (b[1].tileCell || 0));

    const feature = (h) => {
      const bits = [];
      if (h.city) bits.push(h.city.isCapital ? "capital" : "city");
      if (h.cityState) bits.push(h.cityState.name);
      if (h.naturalWonder) bits.push(h.naturalWonder);
      else if (h.resource) bits.push(h.resource);
      if (h.fortress) bits.push("fort");
      if (h.barbarian) bits.push("barbarian");
      if (h.control) bits.push(h.control.district || "control");
      return bits.join(", ");
    };

    const rows = cells.map(([k, h]) => `<tr>
      <td>${h.tileCell + 1}</td>
      <td>${escapeHtml(Game.TERRAIN_LABELS[h.terrain] || h.terrain)}</td>
      <td>${Game.TERRAIN[h.terrain]}</td>
      <td>${escapeHtml(feature(h)) || "\u2014"}</td></tr>`).join("");

    const both = ["A", "B"].map((s) => {
      const src = window.CivTileArt ? CivTileArt.tileImagePath(tileId, s) : null;
      return `<figure class="tile-face${s === side ? " up" : ""}">
        ${src ? `<img src="${src}" alt="Tile ${escapeHtml(tileId)} side ${s}"
             onerror="this.closest('figure').classList.add('no-art')">` : ""}
        <div class="tile-face-fallback">${renderTileSideSvg(tileId, s)}</div>
        <figcaption>Side ${s}${s === side ? " \u2014 face up" : ""}</figcaption>
      </figure>`;
    }).join("");

    return `<div class="ref-card">
      <button class="detail-close" id="ref-close">\u2715</button>
      <h2 class="ref-title">Tile ${escapeHtml(tileId)}${def ? ` \u2014 ${escapeHtml(def.kind)}` : ""}</h2>
      <p class="ref-lede">
        ${facts ? `Printed tile <strong>${facts.number}</strong>${
            facts.certain
              ? ` \u2014 identified by its sides (${escapeHtml(facts.sides)}).`
              : ", assigned. Nothing is printed on this tile to tell it from the others in its group."}`
          : "This tile has no counterpart in the printed set."}
      </p>
      <div class="tile-faces">${both}</div>
      <p class="ref-lede">The terrain below is what the game is actually using.
        It is my own layout, not the printed one \u2014 see RULES-COVERAGE.md.</p>
      <table class="tile-cells"><thead><tr>
        <th>Space</th><th>Terrain</th><th>Difficulty</th><th>On it</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  // The drawn stand-in, used when there is no photograph of the tile.
  function renderTileSideSvg(tileId, side) {
    const def = Game.getTileDef(tileId);
    const cells = def && def.sides && def.sides[side] ? def.sides[side].cells : null;
    if (!cells) return "";
    const pts = Game.TILE_OFFSETS.map((o) => ({
      x: Math.sqrt(3) * (o.q + o.r / 2),
      y: 1.5 * o.r
    }));
    const minX = Math.min(...pts.map((p) => p.x)) - 1.1;
    const minY = Math.min(...pts.map((p) => p.y)) - 1.1;
    const w = Math.max(...pts.map((p) => p.x)) - minX + 1.1;
    const h = Math.max(...pts.map((p) => p.y)) - minY + 1.1;
    const hexes = pts.map((p, i) => {
      const c = cells[i] || {};
      const corners = [];
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 180) * (60 * a - 30);
        corners.push(`${(p.x - minX + Math.cos(ang)).toFixed(3)},${(p.y - minY + Math.sin(ang)).toFixed(3)}`);
      }
      return `<polygon points="${corners.join(" ")}" fill="${TERRAIN_COLORS[c.terrain] || "#555"}"
        stroke="rgba(0,0,0,0.35)" stroke-width="0.06"/>`;
    }).join("");
    return `<svg viewBox="${0} ${0} ${w.toFixed(2)} ${h.toFixed(2)}" class="tile-side-svg">${hexes}</svg>`;
  }

  function openReference(which, arg) {
    const overlay = document.getElementById("reference");
    const body = document.getElementById("reference-body");
    if (!overlay || !body || !state) return;
    try {
      body.innerHTML = which === "wonders" ? renderWondersRef()
        : which === "civ" ? renderCivRef()
        : which === "victory" ? renderVictoryRef()
        : which === "tile" ? renderTileRef(arg)
        : renderDiplomacyRef();
    } catch (err) {
      body.innerHTML = `<div class="ref-card"><button class="detail-close" id="ref-close">\u2715</button>
        <h2 class="ref-title">Could not build that panel</h2>
        <p class="ref-lede">${escapeHtml(String(err && err.message || err))}</p></div>`;
    }
    overlay.classList.remove("hidden");
    body.querySelector("#ref-close")?.addEventListener("click", () => overlay.classList.add("hidden"));
  }

  function initReference() {
    const overlay = document.getElementById("reference");
    document.getElementById("btn-wonders")?.addEventListener("click", () => openReference("wonders"));
    document.getElementById("btn-diplomacy")?.addEventListener("click", () => openReference("diplomacy"));
    document.getElementById("btn-civ")?.addEventListener("click", () => openReference("civ"));
    overlay?.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.add("hidden"); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay?.classList.add("hidden");
    });
  }

  // A printed card face: the same layout the physical focus card uses, so what
  // the card says on the table is what it says on screen.
  const TIER_ROMAN = ["I", "II", "III", "IV"];

  function renderCardFace(player, cardType, opts) {
    const o = opts || {};
    const tier = Game.getCardTier(player, cardType);
    const slot = Game.getSlotValue(player, cardType, state);
    const unique = Game.getActiveUniqueCard ? Game.getActiveUniqueCard(player, cardType) : null;
    const name = Game.getCardName ? Game.getCardName(player, cardType) : Game.CARD_NAMES[cardType][tier - 1];
    const printed = Game.getCardEffectText ? Game.getCardEffectText(player, cardType) : "";
    // The figure allowance is printed on the card as its own line.
    const def = (Game.CARD_DEFS[cardType] || {})[tier];
    const figures = !unique && def && def.figures ? def.figures : "";
    const maxT = Game.CFG.maxTrade;
    const filled = player.trade[cardType] || 0;
    let dots = "";
    for (let i = 0; i < maxT; i++) {
      dots += i < filled ? `<span class="trade-filled">●</span>` : `<span class="trade-empty">●</span>`;
    }
    const manual = unique && !unique.auto
      ? `<div class="cface-manual">Special clause is a table rule — resolve it between you.</div>` : "";
    const art = window.CivCardArt
      ? (unique ? CivCardArt.unique(player.leaderId) : CivCardArt.focus(cardType, tier, player.color))
      : "";
    return `<div class="cface type-${cardType}${unique ? " unique" : ""}${o.compact ? " compact" : ""}${art ? " has-art" : ""}"
      role="img" aria-label="${escapeHtml(name)}, ${Game.FOCUS_LABELS[cardType]} tier ${tier}"${art ? ` style='${art}'` : ""}>
      <div class="cface-head">
        <span class="cface-icon">${Game.CARD_ICONS[cardType]}</span>
        <span class="cface-type">${Game.FOCUS_LABELS[cardType]}</span>
        <span class="cface-tier">${unique ? "★" : TIER_ROMAN[tier - 1]}</span>
      </div>
      <div class="cface-title">${escapeHtml(name)}</div>
      <div class="cface-text">${escapeHtml(printed)}</div>
      ${figures ? `<div class="cface-figures">${escapeHtml(figures)}</div>` : ""}
      ${manual}
      <div class="cface-foot">
        <span class="cface-dots">${dots}</span>
        <span class="cface-trade">${escapeHtml(Game.FOCUS_TRADE_DESC[cardType])}</span>
      </div>
      <div class="cface-slot">Focus slot ${slot}</div>
    </div>`;
  }

  function getCardPreview(cardType, player, slot) {
    const spend = sub.tradeSpent;
    const face = renderCardFace(player, cardType);
    // What this particular play resolves to, given the tokens being spent.
    // Trade tokens do only what the card's trade track says they do.
    let outcome = "";
    switch (cardType) {
      case "culture": {
        const markers = Game.getCultureMarkers(player, spend, state);
        outcome = `Markers to place: <strong>${markers}</strong> (terrain ≤ ${slot})`;
        break;
      }
      case "growth":
        outcome = `Place 1 district (terrain ≤ ${slot}), or reinforce <strong>${slot + spend}</strong> markers.`;
        break;
      case "science":
        outcome = `Advance tech by <strong>${slot + spend}</strong>. Current: ${player.tech}/${Game.CFG.techWheelSize}`;
        break;
      case "economy":
        outcome = `Move each caravan up to <strong>${Game.getEconomyMove(player, state) + spend}</strong> spaces.`;
        break;
      case "military": {
        const combatBonus = Game.getMilitaryCombatBonus(player);
        outcome = `Move each army up to <strong>${Game.getMilitaryMove(player)}</strong> spaces. ` +
          `Combat: d6 + ${slot}${combatBonus ? ` +${combatBonus} tier` : ""}, plus any tokens spent in the fight.`;
        break;
      }
      case "industry":
        outcome = `Production: <strong>${slot + spend}</strong>. City range: ${Game.getCityRange(player)}.`;
        break;
    }
    return `${face}<div class="cface-outcome">${outcome}</div>`;
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
      sub.remaining = Game.getCultureMarkers(me, sub.tradeSpent, state);
      sub.totalMarkers = sub.remaining;
      sub.placedKeys = [];
      sub.validHexes = Game.validControlHexes(state, localPlayerId, slot);
      render(); return;
    }
    if (sub.cardType === "growth") { sub.phase = "growth_choice"; renderWizard(); return; }
    if (sub.cardType === "economy") {
      sub.phase = "move_caravan"; sub.selectedUnit = null;
      // Highlight pickable caravans; Trajan may also launch from any friendly city.
      const starts = new Set(me.caravans.filter((u) => u.position).map((u) => u.position));
      if (Game.getLeader(me) && me.leaderId === "rome" && me.caravans.some((u) => u.position)) {
        Object.entries(state.map.hexes).forEach(([k, h]) => {
          if (h.city && h.city.ownerId === localPlayerId) starts.add(k);
        });
      }
      sub.validHexes = starts; render(); return;
    }
    if (sub.cardType === "military") {
      sub.phase = "move_army"; sub.selectedUnit = null;
      sub.validHexes = new Set(me.armies.filter((u) => u.position).map((u) => u.position));
      render(); return;
    }
    if (sub.cardType === "industry") { sub.phase = "industry_choice"; sub.spentResources = {}; renderWizard(); return; }
  }

  function startDistrictPlace() {
    const me = Game.getPlayer(state, localPlayerId);
    const slot = Game.getSlotValue(me, "growth", state);
    sub.phase = "placing_district";
    sub.validHexes = Game.validDistrictHexes(state, localPlayerId, slot);
    render();
  }

  function finishDistrictWithReinforcements() {
    dispatch({ type: "PLAY_GROWTH_DISTRICT", payload: {
      playerId: localPlayerId, hexKey: sub.districtKey, district: sub.districtType,
      reinforceKeys: sub.placedKeys.slice(), tradeSpent: sub.tradeSpent } });
    resetSub();
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
    const placedNothing = !sub.placedKeys.length;
    if (sub.phase === "placing_control" && !placedNothing) {
      dispatch({ type: "PLAY_CULTURE", payload: { playerId: localPlayerId, hexKeys: sub.placedKeys, tradeSpent: sub.tradeSpent } });
    }
    if (sub.phase === "reinforcing" && !placedNothing) {
      dispatch({ type: "PLAY_GROWTH_REINFORCE", payload: { playerId: localPlayerId, hexKeys: sub.placedKeys, tradeSpent: sub.tradeSpent } });
    }
    // Finishing having placed nothing still spends the card — otherwise a card
    // with nowhere legal to go leaves you owing a turn you cannot take.
    if (placedNothing && sub.cardType) {
      dispatch({ type: "END_FOCUS_CARD", payload: {
        playerId: localPlayerId, cardType: sub.cardType, tradeSpent: 0 } });
    }
    resetSub();
  }

  function cancelAction() {
    if (state && state.activeCard && state.activeCard.playerId === localPlayerId) {
      dispatch({ type: "END_FOCUS_CARD", payload: { playerId: localPlayerId } });
      resetSub();
      return;
    }
    resetSub();
    render();
  }

  function resetSub() {
    sub.phase = "idle"; sub.cardType = null; sub.tradeSpent = 0; sub.remaining = 0;
    sub.totalMarkers = 0; sub.validHexes = new Set(); sub.selectedUnit = null;
    sub.districtType = null; sub.spentResources = {}; sub.placedKeys = [];
    sub.movementState = null; sub.selectedWonder = null; sub.wonderProduction = 0;
    sub.freeFrom = null; sub.attackTargets = null;
    render();
  }

  // ── Hex Click Handler ─────────────────────────────────────

  function handleHexClick(hexKey) {
    if (!state) return;

    // With nothing else going on, clicking a space asks about the land it is
    // part of. Idle only — an action in progress always owns the click.
    if (sub.phase === "idle" && !activeHexChoice() && state.phase === "playing") {
      const h = state.map.hexes[hexKey];
      if (h && h.active && h.tileId && h.tileId !== "water-fill") {
        openReference("tile", h.tileId);
        return;
      }
    }

    // A choice waiting on a space takes the click before anything else.
    const hexChoice = activeHexChoice();
    if (hexChoice) {
      if (!hexChoice.hexKeys.includes(hexKey)) { showToast("Not one of the highlighted spaces"); return; }
      flashHex(hexKey, "rgb(255,213,79)", 700);
      dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: {
        playerId: localPlayerId, choiceId: hexChoice.id, hexKey, hostOverride: Net.getIsHost() } });
      // Apadana's edge space is only the start of it — the tile still has to be
      // turned and placed, so hand straight over to the exploring flow.
      if (hexChoice.kind === "apadana_explore" &&
          state.freeExplore && state.freeExplore.fromKey === hexKey) {
        sub.phase = "free_exploring";
        sub.freeFrom = hexKey;
        sub.tileRotation = 0;
        render();
      }
      return;
    }

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
        // Turn the tile for them. Clicking somewhere the tile genuinely fits
        // should never be ignored just because the angle is wrong.
        const fit = Game.tilePlacementFor(state, tileId, hexKey, sub.tileRotation);
        if (!fit) { showToast("The tile will not fit there"); return; }
        sub.tileRotation = fit.rotation;
        const tileKeys = Game.getTileHexKeys(hexKey, fit.rotation, state.map.hexes);
        flashHexes(tileKeys, "rgb(102,187,106)", 600);
        dispatch({ type: "PLACE_TILE", payload: { playerId: localPlayerId, tileId, anchorKey: hexKey, rotation: fit.rotation, side: sub.tileSide } });
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
      const effectiveSlot = Game.getSlotValue(me, "culture", state) || 1;
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
      // Trade tokens on a growth card reinforce whether or not the card's own
      // effect did (Terra p8), so a district still leaves them to spend.
      if (sub.tradeSpent > 0) {
        sub.districtKey = hexKey;
        sub.phase = "reinforcing_after_district";
        sub.remaining = sub.tradeSpent;
        sub.totalMarkers = sub.tradeSpent;
        sub.placedKeys = [];
        sub.validHexes = Game.validReinforceHexes(state, localPlayerId);
        render();
        return;
      }
      dispatch({ type: "PLAY_GROWTH_DISTRICT", payload: { playerId: localPlayerId, hexKey, district: sub.districtType, tradeSpent: sub.tradeSpent } });
      resetSub(); return;
    }
    if (sub.phase === "reinforcing_after_district") {
      if (!sub.validHexes.has(hexKey)) return;
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      flashHex(hexKey, "rgb(255,213,79)", 500);
      if (sub.remaining <= 0) finishDistrictWithReinforcements();
      else render();
      return;
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
        const free = (u) => !u.movedThisCard;
        let unit = me.caravans.find((u) => u.position === hexKey && free(u));
        let romeStart = null;
        const h = state.map.hexes[hexKey];
        const myCity = h && h.city && h.city.ownerId === localPlayerId;
        if (!unit && myCity) {
          // A caravan resting on the economy card sets out from a city. Rome may
          // use any of theirs; everyone else launches from the capital.
          const onCard = me.caravans.find((u) => !u.position && free(u));
          if (onCard && (me.leaderId === "rome" || h.city.isCapital)) {
            unit = onCard;
            romeStart = hexKey;
          }
        }
        if (!unit && me.leaderId === "rome" && myCity) {
          // Trajan: clicking a friendly city launches a caravan from there.
          unit = me.caravans.find((u) => u.position && free(u));
          if (unit) romeStart = hexKey;
        }
        if (!unit) return;
        sub.selectedUnit = unit;
        const maxMove = Game.getEconomyMove(me, state) + sub.tradeSpent;
        const originKey = romeStart || unit.position;
        sub.movementState = { unitType: "caravan", unitId: unit.id, maxMove, remaining: maxMove, currentKey: originKey, startKey: originKey, romeStart, explored: false };
        sub.selectedUnit = { id: unit.id, position: originKey };
        sub.validHexes = Game.getReachable(state, originKey, maxMove, "caravan", localPlayerId);
        render();
      } else {
        const ms0 = sub.movementState;
        if (ms0 && hexKey === ms0.currentKey) { endMovement(); return; }
        if (!sub.validHexes.has(hexKey)) { showToast("Can't move there"); return; }
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "caravan", localPlayerId);
        flashHex(hexKey, "rgb(102,187,106)", 400);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        // Don't stop to ask. Either the move is spent, or the next hex is
        // already clickable — the chip on the board carries the rest.
        if (ms.remaining > 0) continueMovement(); else endMovement();
      }
      return;
    }
    if (sub.phase === "move_army") {
      if (!sub.selectedUnit) {
        const unit = me.armies.find((u) => u.position === hexKey && !u.movedThisCard);
        if (!unit) return;
        sub.selectedUnit = unit;
        const maxMove = Game.getMilitaryMove(me);
        sub.movementState = { unitType: "army", unitId: unit.id, maxMove, remaining: maxMove, currentKey: hexKey, startKey: hexKey, explored: false };
        sub.validHexes = Game.getReachable(state, hexKey, maxMove, "army", localPlayerId);
        render();
      } else {
        const ms0 = sub.movementState;
        if (ms0 && hexKey === ms0.currentKey) { endMovement(); return; }
        if (!sub.validHexes.has(hexKey)) return;
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "army", localPlayerId);
        flashHex(hexKey, "rgb(239,83,80)", 400);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        // An army that walks into something has a real choice to make; anything
        // else just carries on.
        if (Game.findDefender(state, ms.currentKey, localPlayerId)) {
          sub.phase = "move_army_post";
          render();
        } else if (ms.remaining > 0) {
          continueMovement();
        } else {
          endMovement();
        }
      }
      return;
    }
    if (isExploring(sub.phase)) {
      const ms = sub.movementState;
      const originKey = exploreOrigin();
      if (!state.tileStack || state.tileStack.length === 0 || !originKey) return;
      const tileId = exploringTileId();
      // The new tile has to touch the space you are exploring from, so look for
      // an angle that manages both rather than refusing the click.
      let fit = null;
      for (let i = 0; i < 6; i++) {
        const rot = (sub.tileRotation + i) % 6;
        if (!Game.validateExploration(state, tileId, hexKey, rot).ok) continue;
        const cells = Game.getTileHexKeys(hexKey, rot, state.map.hexes);
        if (!cells.some((ck) => Game.hexNeighborKeys(Game.parseQ(ck), Game.parseR(ck)).includes(originKey))) continue;
        fit = rot; break;
      }
      if (fit === null) { showToast("The new land will not fit there"); return; }
      sub.tileRotation = fit;
      dispatch({ type: "EXPLORE_TILE", payload: { playerId: localPlayerId, anchorKey: hexKey, rotation: fit, side: sub.tileSide, fromKey: originKey } });
      // Apadana's expedition costs no movement, because there is nothing moving.
      if (sub.phase === "free_exploring") { resetSub(); render(); return; }
      ms.remaining -= 1;
      ms.explored = true;
      // Terra p12: you may walk onto what you just found. Hand straight back to
      // picking a hex, with the new ground already in the reachable set.
      if (ms.remaining > 0) continueMovement(); else endMovement();
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



  // ── Event Wheel / Log / Focus Row / Game Over ─────────────

  // Chosen to read like the printed dial: a skyline for districts, a columned
  // hall for government, a pyramid for the wonder icon.
  const EVENT_ICONS = {
    barbarian_move: "\ud83d\udde1\ufe0f", barbarian_return: "\ud83d\udc80",
    district_event: "\ud83c\udfd9\ufe0f", gov_change: "\ud83c\udfdb\ufe0f",
    wonder_tokens: "\ud83d\udd3a"
  };

  let prevWheelPos = null;

  // The dial is a ring with a pointer, not a row of pills. The pointer sweeps to
  // the new segment when the round turns and the segment that fired pulses.
  // Kept across renders so the hand can sweep forwards past the wrap point.
  let wheelAngle = null;

  // The card whose "played" animation is owed, and until when. Playing a card
  // can rebuild the row twice in a row (the action, then the reset), so a
  // one-shot flag was consumed by the first build and gone by the second.
  let pendingCardAnim = null;

  function renderEventWheel() {
    if (!state) return;
    const wheel = state.eventWheel;
    const pos = wheel.position;
    const n = wheel.events.length;
    const turned = prevWheelPos !== null && prevWheelPos !== pos;

    // A section can carry two icons — on the real dial the wonder pyramid shares
    // its space with barbarian spawning and with government.
    const name = (section) => (section || []).map((e) => Game.EVENT_LABELS[e]).join(" + ");
    const glyphs = (section) => (section || [])
      .map((e) => `<i class="ew-ico">${EVENT_ICONS[e] || "\u25cf"}</i>`).join("");

    const segs = wheel.events.map((section, i) => {
      const angle = (i / n) * 360;
      const cls = ["ew-seg", (section || []).length ? "" : "blank",
        (section || []).length > 1 ? "pair" : "",
        i === pos ? "active" : "", i === (pos + 1) % n ? "next" : ""].filter(Boolean).join(" ");
      return `<span class="${cls}" style="--a:${angle}deg"
        title="${escapeHtml(name(section) || "Nothing happens")}">${glyphs(section)}</span>`;
    }).join("");

    const now = wheel.events[pos] || [];
    const next = wheel.events[(pos + 1) % n] || [];

    // The hand sweeps with a CSS transition, which needs the SAME element to
    // change angle. Rebuilding innerHTML every render gave it a brand new hand
    // already sitting at its destination, so the dial jumped instead of turning
    // — and any segment mid-animation was thrown away by an unrelated repaint.
    // Build the dial once and move its parts thereafter.
    const shape = JSON.stringify(wheel.events);
    if (dom.eventWheel.dataset.shape !== shape) {
      dom.eventWheel.innerHTML = `<h3>Event Dial</h3>
        <div class="ew-dial">
          <div class="ew-ring">${segs}</div>
          <div class="ew-hand"></div>
          <div class="ew-hub"></div>
        </div>
        <div class="ew-now"></div>
        <div class="ew-next"></div>`;
      dom.eventWheel.dataset.shape = shape;
      wheelAngle = null;
    }

    const dial = dom.eventWheel.querySelector(".ew-dial");
    const hand = dom.eventWheel.querySelector(".ew-hand");
    const segEls = dom.eventWheel.querySelectorAll(".ew-seg");

    // Always turn forwards. Going from the last section back to the first is
    // one step clockwise on the table, not a whip all the way round the other way.
    if (wheelAngle === null) {
      wheelAngle = (pos / n) * 360;
    } else if (turned) {
      wheelAngle += (((pos - prevWheelPos) % n) + n) % n * (360 / n);
    }
    hand.style.setProperty("--a", `${wheelAngle}deg`);

    segEls.forEach((el, i) => {
      el.classList.toggle("active", i === pos);
      el.classList.toggle("next", i === (pos + 1) % n);
    });
    dial.classList.toggle("turning", turned);
    dom.eventWheel.querySelector(".ew-hub").innerHTML = glyphs(now) || "\u2014";
    dom.eventWheel.querySelector(".ew-now").textContent = name(now) || "Nothing this round";
    dom.eventWheel.querySelector(".ew-next").textContent = `Next: ${name(next) || "nothing"}`;

    if (turned) {
      const seg = dom.eventWheel.querySelector(".ew-seg.active");
      if (seg) { seg.classList.add("fired"); setTimeout(() => seg.classList.remove("fired"), 900); }
      // The end of a round is the dial's moment: it comes off its corner and
      // takes the middle of the board while its icons fire, then settles back.
      if (!reducedMotion()) {
        dom.eventWheel.classList.add("staged");
        clearTimeout(renderEventWheel._settle);
        renderEventWheel._settle = setTimeout(() => dom.eventWheel.classList.remove("staged"), 2600);
      }
      announce(name(now), "event");
    }
    prevWheelPos = pos;
  }

  // Colour-code log lines by what happened so the feed scans at a glance.
  function logClass(msg) {
    const m = String(msg).toLowerCase();
    if (/(combat|defeated|attack|captured|barbarian|seized|lost)/.test(m)) return " lg-combat";
    if (/(trade|caravan|diplomacy)/.test(m)) return " lg-trade";
    if (/(wonder|built a new city|district)/.test(m)) return " lg-build";
    if (/(tech|upgraded|advanced)/.test(m)) return " lg-science";
    if (/(round \d|wins|joined|lead|drew|begins)/.test(m)) return " lg-sys";
    return "";
  }

  function renderLog() {
    if (!state) return;
    const logEntries = state.log.slice(-15).map((msg) => ({ html: `<div class="log-entry${logClass(msg)}">${msg}</div>`, ts: 0 }));
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
    const focusBoard = window.CivCardArt ? CivCardArt.focusBar(me.color) : "";
    dom.focusRow.classList.toggle("has-board-art", !!focusBoard);
    if (focusBoard) dom.focusRow.style.setProperty("--focus-board-art", `url("${focusBoard}")`);
    else dom.focusRow.style.removeProperty("--focus-board-art");

    const oldRects = {};
    document.querySelectorAll(".fcard").forEach((el) => {
      oldRects[el.dataset.card] = el.getBoundingClientRect();
    });

    const owed = pendingCardAnim && performance.now() < pendingCardAnim.until
      ? pendingCardAnim.type : null;
    dom.focusRow.innerHTML = me.focusRow.map((cardType, idx) => {
      const effective = Game.getSlotValue(me, cardType, state);
      const govt = me.government === cardType ? (Game.GOVERNMENTS || {})[cardType] : null;
      const tier = Game.getCardTier(me, cardType);
      const uniqueCard = Game.getActiveUniqueCard ? Game.getActiveUniqueCard(me, cardType) : null;
      const cardName = uniqueCard ? uniqueCard.name : Game.CARD_NAMES[cardType][tier - 1];
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
      const played = owed === cardType ? " card-anim" : "";

      // Laid out like the printed card: type band across the top, the name and
      // its tier, what it actually does, and the trade track along the bottom.
      const printed = Game.getCardEffectText ? Game.getCardEffectText(me, cardType) : "";
      const cardArt = window.CivCardArt
        ? (uniqueCard ? CivCardArt.unique(me.leaderId) : CivCardArt.focus(cardType, tier, me.color))
        : "";
      return `<div class="fcard type-${cardType}${disabled}${selected}${played}${uniqueCard ? " unique" : ""}${cardArt ? " has-art" : ""}"
        data-card="${cardType}" data-idx="${idx}" role="button" tabindex="${canPlay ? "0" : "-1"}"
        aria-label="Play ${escapeHtml(cardName)}, ${Game.FOCUS_LABELS[cardType]} tier ${tier}, focus slot ${effective}"${cardArt ? ` style='${cardArt}'` : ""}>
        <div class="fc-live">
          <span class="fc-live-slot" title="Current focus strength">${effective}</span>
          ${govt ? `<span class="fc-gov-token" title="${escapeHtml(govt.name)}: resolves ${govt.shift} places farther right">${escapeHtml(govt.name)}</span>` : ""}
          ${uniqueCard ? `<span class="fc-unique-seal" title="Unique ${escapeHtml(me.leaderId)} card">★</span>` : ""}
        </div>
        <div class="fc-header">
          <span class="fc-icon">${icon}</span>
          <span class="fc-type">${Game.FOCUS_LABELS[cardType]}</span>
          <span class="fc-tier-roman">${TIER_LABELS[tier - 1]}</span>
        </div>
        <div class="fc-body">
          <div class="fc-nameline">
            <span class="fc-power">${effective}${govt ? `<span class="gov-plus" title="${govt.name}: resolves ${govt.shift} places further right">${govt.name[0]}</span>` : ""}</span>
            <span class="fc-cardname">${uniqueCard ? "★ " : ""}${escapeHtml(cardName)}</span>
          </div>
          <div class="fc-printed">${escapeHtml(printed)}</div>
        </div>
        <div class="fc-footer">
          <span class="fc-trade-note">${escapeHtml(Game.FOCUS_TRADE_DESC[cardType] || "")}</span>
          <span class="fc-dots">${tradeDots}</span>
        </div>
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
      el.addEventListener("pointermove", (e) => {
        if (reducedMotion() || el.classList.contains("disabled")) return;
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        el.style.setProperty("--tilt-x", `${((0.5 - y) * 8).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${((x - 0.5) * 10).toFixed(2)}deg`);
        el.style.setProperty("--shine-x", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--shine-y", `${(y * 100).toFixed(1)}%`);
      });
      el.addEventListener("mouseenter", () => {
        dom.mapTooltip.innerHTML = renderCardFace(me, cardType);
        dom.mapTooltip.classList.add("card-face");
        dom.mapTooltip.classList.remove("hidden");
        const rect = el.getBoundingClientRect();
        const tip = dom.mapTooltip.getBoundingClientRect();
        const left = Math.min(Math.max(4, rect.left), window.innerWidth - tip.width - 8);
        dom.mapTooltip.style.left = left + "px";
        dom.mapTooltip.style.top = Math.max(4, rect.top - tip.height - 8) + "px";
      });
      el.addEventListener("mouseleave", () => {
        el.style.removeProperty("--tilt-x");
        el.style.removeProperty("--tilt-y");
        el.style.removeProperty("--shine-x");
        el.style.removeProperty("--shine-y");
        dom.mapTooltip.classList.add("hidden");
        dom.mapTooltip.classList.remove("card-face");
      });
      el.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !el.classList.contains("disabled")) {
          e.preventDefault();
          el.click();
        }
      });
    });

    if (canPlay) {
      document.querySelectorAll(".fcard:not(.disabled)").forEach((el) => {
        el.addEventListener("click", () => {
          // Playing a card re-renders the row, which threw away the element the
          // class had just been put on — so the card never visibly played. Hand
          // the animation to the next render instead, the way the tile preview
          // does, and let the freshly built card carry it.
          pendingCardAnim = { type: el.dataset.card, until: performance.now() + 420 };
          // One last repaint once the animation is spent, to take the class off.
          setTimeout(() => { pendingCardAnim = null; renderFocusRow(); }, 440);
          sub.phase = "card_selected";
          sub.cardType = el.dataset.card;
          sub.tradeSpent = 0;
          // With no tokens on the card there is nothing to decide, so don't ask:
          // clicking the card is the decision, and the action starts.
          const meNow = Game.getPlayer(state, localPlayerId);
          if (meNow && !meNow.trade[sub.cardType]) { startAction(); return; }
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

  // Where a hex currently sits on screen, in page coordinates. The board is a
  // canvas, so nothing outside can work this out on its own.
  function hexPoint(hexKey) {
    if (!canvas || !state || !state.map.hexes[hexKey]) return null;
    const p = axialToPixel(Game.parseQ(hexKey), Game.parseR(hexKey));
    const r = canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }

  document.addEventListener("DOMContentLoaded", init);
  return { render, dispatch, renderCardFace, hexPoint };
})();
