"use strict";

const UI = (() => {
  let state = null;
  let localPlayerId = null;
  let roomCode = null;
  let lobbyPreviewLeaderId = null;
  let wizardCollapsed = false;
  let dismissedCombatKey = null;
  let sessionCredentials = null;
  let networkRoster = [];
  let networkStatus = { state: "local", revision: 0 };
  let actionPending = false;
  let backupFailure = null;
  let heartbeatTimer = null;
  let recoveryTimer = null;
  let readOnlySession = false;
  let processedActionIds = [];
  const PROTOCOL_VERSION = 2;
  const SAVE_SCHEMA_VERSION = 2;
  const HEARTBEAT_MS = 20000;
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
  let pieceArt = true;
  let tableArt = true;

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
    movementState: null,
    advancedDraft: false
  };

  // The tile-in-hand for setup: capital/tile phase reads playerTiles, the
  // advanced draft (Terra p14) reads its own hand so a capital dealt at the
  // same time doesn't get placed early.
  function setupHand(state, playerId) {
    return state.setup.phase === "draft_tile"
      ? (state.setup.draftTiles[playerId] || [])
      : (state.setup.playerTiles[playerId] || []);
  }

  // ── Live presence ─────────────────────────────────────────
  //
  // What everyone else is in the middle of doing, so the board reads like one
  // table rather than several. Only committed actions go through dispatch();
  // this carries the part before that — the hex under a cursor, the tile being
  // turned over a spot, the route a figure is being walked along. It is never
  // applied to the game, only drawn, so a late or lost packet cannot desync
  // anything.
  const presence = new Map();          // playerId -> last packet
  const PRESENCE_STALE_MS = 8000;      // a player who stops sending fades out
  let lastPresenceSent = "";
  let lastPresenceAt = 0;

  function presenceSnapshot() {
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return null;
    const ms = sub.movementState;
    const placing = placingTile();
    const tileId = isExploring(sub.phase) ? exploringTileId()
      : (state.phase === "setup" ? (setupHand(state, localPlayerId) || [])[0] : null);
    return {
      playerId: localPlayerId,
      name: me.name,
      color: me.color,
      phase: sub.phase,
      cardType: sub.cardType || null,
      hover: mouseHex ? Game.key(mouseHex.q, mouseHex.r) : null,
      // The tile in hand, at the angle they are holding it over the board.
      ghost: (placing && mouseHex && tileId)
        ? { tileId, anchor: Game.key(mouseHex.q, mouseHex.r), rotation: sub.tileRotation, side: sub.tileSide }
        : null,
      // A figure mid-walk: where it started, where it has got to, what is left.
      route: ms ? { unitType: ms.unitType, startKey: ms.startKey, currentKey: ms.currentKey, remaining: ms.remaining } : null
    };
  }

  function publishPresence(force) {
    if (!state || !localPlayerId || !Net.getPeerCount()) return;
    const snap = presenceSnapshot();
    if (!snap) return;
    const now = performance.now();
    const encoded = JSON.stringify(snap);
    // Throttled, and silent when nothing has changed — a cursor crossing the
    // board would otherwise flood the channel at screen refresh rate.
    if (!force && encoded === lastPresenceSent) return;
    if (!force && now - lastPresenceAt < 90) return;
    lastPresenceSent = encoded;
    lastPresenceAt = now;
    snap.at = Date.now();
    Net.sendPresence(snap);
  }

  function receivePresence(packet) {
    if (!packet || !packet.playerId || packet.playerId === localPlayerId) return;
    packet.seen = performance.now();
    presence.set(packet.playerId, packet);
    renderCanvas();
    renderPresenceStrip();
  }

  function livePresence() {
    const out = [];
    presence.forEach((p, id) => {
      if (performance.now() - p.seen > PRESENCE_STALE_MS) { presence.delete(id); return; }
      out.push(p);
    });
    return out;
  }

  // Animation system
  const anims = {
    hexFlashes: [],  // { key, color, startTime, duration }
    validPulse: 0,
    // Pieces caught mid-journey, keyed by the thing that moved:
    //   moves:  id -> { fromKey, toKey, start, ms }   slides A to B
    //   spawns: id -> { key, start, ms }              scales in where it appeared
    // The engine never knows about these. Positions are diffed between renders
    // (reactToChanges already did that to leave a trail of flashes), so nothing
    // in game.js has to be touched and a networked client animates a rival's
    // move from the state it receives, exactly as the mover does.
    moves: new Map(),
    spawns: new Map(),
    // Set by renderCanvas: true while the frame it just drew contains something
    // that changes over time. The loop keeps painting for exactly as long as
    // that is true and then stops, so an idle board costs nothing.
    living: false
  };

  const MOVE_MS = 420, SPAWN_MS = 320;

  function startMove(id, fromKey, toKey) {
    if (reducedMotion() || !fromKey || !toKey || fromKey === toKey) return;
    if (!state.map.hexes[fromKey] || !state.map.hexes[toKey]) return;
    anims.moves.set(id, { fromKey, toKey, start: performance.now(), ms: MOVE_MS });
  }

  function startSpawn(id, key) {
    if (reducedMotion() || !key || !state.map.hexes[key]) return;
    anims.spawns.set(id, { key, start: performance.now(), ms: SPAWN_MS });
  }

  // Ease-out so a piece leaves briskly and settles, the way a hand puts it down.
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Where a moving piece is right now, or null when it is not moving. Expired
  // entries are dropped here so the maps cannot grow without bound.
  function movePoint(id) {
    const m = anims.moves.get(id);
    if (!m) return null;
    const t = (performance.now() - m.start) / m.ms;
    if (t >= 1) { anims.moves.delete(id); return null; }
    const a = state.map.hexes[m.fromKey], b = state.map.hexes[m.toKey];
    if (!a || !b) { anims.moves.delete(id); return null; }
    const pa = axialToPixel(a.q, a.r), pb = axialToPixel(b.q, b.r);
    const e = easeOut(Math.max(0, t));
    return { x: pa.x + (pb.x - pa.x) * e, y: pa.y + (pb.y - pa.y) * e, t: e };
  }

  function spawnScale(id) {
    const s = anims.spawns.get(id);
    if (!s) return 1;
    const t = (performance.now() - s.start) / s.ms;
    if (t >= 1) { anims.spawns.delete(id); return 1; }
    // A touch of overshoot, so a piece lands rather than fades in.
    const e = easeOut(Math.max(0, t));
    return 0.35 + 0.75 * e - 0.1 * Math.sin(e * Math.PI);
  }

  function anythingAnimating() { return anims.moves.size > 0 || anims.spawns.size > 0; }

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
      // This used to ask only about sub.validHexes, which is one of the three
      // things that pulse. Setup's placement spaces and a pending choice's
      // highlighted spaces both animate too, and both left the loop idle — so
      // they only moved when a mousemove happened to force a repaint.
      // anythingAnimating() is asked directly, not via anims.living. living is
      // written by renderCanvas, and reactToChanges — which starts the tweens —
      // runs AFTER renderCanvas in a render pass. So a move begun this pass set
      // no flag the loop could see, the loop stayed idle, and the piece simply
      // appeared at its destination: the tween was running but never painted.
      if (hadFlashes || anims.hexFlashes.length > 0 || anims.living || anythingAnimating()) {
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
      placing_control: "Click green hexes adjacent to your cities to claim territory.",
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

  function safeColor(value) {
    const color = String(value || "");
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#a0aec0";
  }

  function randomToken() {
    if (window.CivSessionStore?.generateToken) return CivSessionStore.generateToken();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function newGameId() { return `civ-${randomToken().slice(0, 16)}`; }
  function newSeatId() { return `seat-${randomToken().slice(0, 16)}`; }
  function newActionId() { return `act-${randomToken()}`; }

  function rosterSeatId(entry) {
    return entry && (entry.seatId || entry.playerId || entry.id);
  }

  function rosterEntry(playerId) {
    return (networkRoster || []).find((entry) => rosterSeatId(entry) === playerId) || null;
  }

  function rosterState(entry) {
    if (!entry) return "offline";
    if (entry.online === true || entry.connected === true) return "online";
    const value = String(entry.status || entry.state || "").toLowerCase();
    if (["online", "connected", "open", "host"].includes(value)) return "online";
    if (["connecting", "reconnecting", "retrying"].includes(value)) return "reconnecting";
    return "offline";
  }

  function isNetworkGame() {
    return !!(sessionCredentials && sessionCredentials.gameId && !state?.solo);
  }

  function offlinePlayers() {
    if (!state || !isNetworkGame()) return [];
    return state.players.filter((player) => {
      if (player.id === localPlayerId) {
        const phase = String(networkStatus.phase || networkStatus.state || networkStatus.status || "").toLowerCase();
        return ["offline", "disconnected", "reconnecting", "connecting"].includes(phase);
      }
      return rosterState(rosterEntry(player.id)) !== "online";
    });
  }

  function interactionBlockReason(action) {
    if (!state) return "";
    if (readOnlySession) return "This recovered game is read-only.";
    if (state.solo || !isNetworkGame()) return "";
    if (backupFailure) return "Backup is unavailable. No game action can be confirmed.";
    const phase = String(networkStatus.phase || networkStatus.state || networkStatus.status || "").toLowerCase();
    if (["offline", "disconnected", "reconnecting", "connecting"].includes(phase)) {
      return "Connection is being restored.";
    }
    if (state.phase !== "lobby") {
      const missing = offlinePlayers();
      if (missing.length) return `Game paused: waiting for ${missing.map((p) => p.name).join(", ")}.`;
    }
    if (action?.type === "START_GAME") {
      const missing = offlinePlayers();
      if (missing.length) return "Every seated player must be online before starting.";
      if (!state.players.every((player) => player.ready)) return "Every player must be ready before starting.";
    }
    return "";
  }

  function rememberProcessed(ids) {
    const seen = new Set();
    processedActionIds = (ids || []).filter((id) => {
      if (typeof id !== "string" || !id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(-512);
    Net.restoreProcessedActionIds?.(processedActionIds);
  }

  async function saveSessionCredentials() {
    if (!sessionCredentials?.gameId || !window.CivSessionStore) return;
    await CivSessionStore.saveCredentials(sessionCredentials.gameId, sessionCredentials);
    try { localStorage.setItem("civ-nd-last-session", sessionCredentials.gameId); } catch { /* optional hint only */ }
  }

  async function saveLocalCheckpoint(fullState, revision) {
    if (!sessionCredentials?.gameId || !window.CivSessionStore) return;
    await CivSessionStore.saveCheckpoint({
      gameId: sessionCredentials.gameId,
      revision,
      hostEpoch: sessionCredentials.hostEpoch || 1,
      protocolVersion: PROTOCOL_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      rulesVersion: fullState.rulesVersion || 0,
      fullState,
      processedActionIds
    });
  }

  function remoteAuth(includeState) {
    if (sessionCredentials?.role === "host") {
      return { hostToken: sessionCredentials.hostToken, includeState: !!includeState };
    }
    return {
      seatId: sessionCredentials?.seatId,
      seatToken: sessionCredentials?.seatToken,
      includeState: false
    };
  }

  function normalizedNetState() {
    if (backupFailure) return "backup_failed";
    if (readOnlySession) return "readonly";
    if (actionPending) return "pending";
    const raw = String(networkStatus.phase || networkStatus.state || networkStatus.status || "local").toLowerCase();
    if (["open", "connected", "hosting", "ready", "synced"].includes(raw)) return "synced";
    if (["sending", "confirming", "pending"].includes(raw)) return "pending";
    if (["connecting", "retrying", "reconnecting", "disconnected"].includes(raw)) return "reconnecting";
    if (["offline", "closed", "destroyed"].includes(raw)) return "offline";
    return raw === "local" ? "local" : "synced";
  }

  function updateNetworkChrome() {
    const chip = document.getElementById("net-status");
    if (!chip) return;
    const kind = normalizedNetState();
    const revision = Number.isInteger(networkStatus.revision)
      ? networkStatus.revision
      : Number.isInteger(state?.revision) ? state.revision : 0;
    const labels = {
      local: "Local",
      synced: `Synchronisiert r${revision}`,
      pending: "Wird bestätigt",
      reconnecting: "Verbindung wird wiederhergestellt",
      offline: "Offline",
      backup_failed: "Backup nicht verfügbar",
      readonly: "Nur Lesen"
    };
    chip.className = `net-status ${kind}`;
    chip.textContent = labels[kind] || labels.synced;

    const missing = state && state.phase !== "lobby" ? offlinePlayers() : [];
    const paused = !!(readOnlySession || backupFailure || missing.length || ["reconnecting", "offline"].includes(kind));
    dom.game?.classList.toggle("actions-paused", paused);
    dom.game?.classList.toggle("action-pending", actionPending);

    const banner = document.getElementById("conn-banner");
    const message = document.getElementById("conn-message");
    const retry = document.getElementById("btn-net-retry");
    const takeover = document.getElementById("btn-host-takeover");
    if (!banner || !message) return;
    let text = "";
    if (backupFailure) text = `Backup unavailable: ${backupFailure.message || backupFailure}`;
    else if (readOnlySession) text = "This save cannot safely host an online game and is open read-only.";
    else if (missing.length) text = `Game paused until ${missing.map((p) => p.name).join(", ")} reconnect${missing.length === 1 ? "s" : ""}.`;
    else if (kind === "reconnecting") text = "Connection lost — reconnecting without giving up your seat.";
    else if (kind === "offline") text = "Offline — the game remains paused and your seat is reserved.";
    if (!text) {
      banner.classList.add("hidden");
      retry?.classList.add("hidden");
      takeover?.classList.add("hidden");
      return;
    }
    message.textContent = text;
    banner.classList.remove("hidden");
    retry?.classList.toggle("hidden", !["reconnecting", "offline", "backup_failed"].includes(kind));
    takeover?.classList.toggle("hidden", !networkStatus.canTakeover || sessionCredentials?.role === "host");
  }

  function stopSessionTimers() {
    clearTimeout(heartbeatTimer);
    clearTimeout(recoveryTimer);
    heartbeatTimer = null;
    recoveryTimer = null;
  }

  async function recoverAuthoritativeState(actionId) {
    if (!sessionCredentials?.gameId || sessionCredentials.role !== "host") return null;
    const remote = await CivSessionApi.status(sessionCredentials.gameId, remoteAuth(true));
    sessionCredentials.revision = remote.revision;
    sessionCredentials.hostEpoch = remote.hostEpoch;
    sessionCredentials.hostPeerId = remote.hostPeerId;
    rememberProcessed(remote.processedActionIds || []);
    if (remote.fullState) {
      state = Game.migrateState ? Game.migrateState(remote.fullState) : remote.fullState;
      state.revision = remote.revision;
      await saveLocalCheckpoint(state, remote.revision);
      Net.setRevision?.(remote.revision);
      await saveSessionCredentials();
      render();
    }
    return {
      committed: !!actionId && processedActionIds.includes(actionId),
      revision: remote.revision,
      state: remote.fullState || null
    };
  }

  async function checkpointCandidate(candidate, actionId, extraSeatTokens) {
    const expectedRevision = Number.isInteger(sessionCredentials.revision)
      ? sessionCredentials.revision
      : Number.isInteger(state.revision) ? state.revision : 0;
    const nextRevision = expectedRevision + 1;
    candidate.revision = nextRevision;
    candidate.saveSchemaVersion = SAVE_SCHEMA_VERSION;
    const nextIds = processedActionIds.concat(actionId || []).slice(-512);
    try {
      const saved = await CivSessionApi.checkpoint(sessionCredentials.gameId, {
        hostToken: sessionCredentials.hostToken,
        hostEpoch: sessionCredentials.hostEpoch,
        expectedRevision,
        fullState: candidate,
        processedActionIds: nextIds,
        ...(extraSeatTokens && Object.keys(extraSeatTokens).length ? { seatTokens: extraSeatTokens } : {})
      });
      sessionCredentials.revision = saved.revision;
      sessionCredentials.hostEpoch = saved.hostEpoch;
      sessionCredentials.hostPeerId = saved.hostPeerId;
      sessionCredentials.leaseUntil = saved.leaseUntil;
      rememberProcessed(nextIds);
      await saveLocalCheckpoint(candidate, saved.revision);
      await saveSessionCredentials();
      state = candidate;
      Net.setRevision?.(saved.revision);
      backupFailure = null;
      networkStatus = { ...networkStatus, revision: saved.revision };
      return { accepted: true, state: candidate, revision: saved.revision, code: "accepted", message: "Saved" };
    } catch (error) {
      // A response can be lost after the CAS already committed. Before calling
      // the action failed, ask the authority whether this exact actionId is in
      // its durable dedupe window.
      try {
        const recovered = await recoverAuthoritativeState(actionId);
        if (recovered?.committed) {
          backupFailure = null;
          return { accepted: true, state, revision: recovered.revision, code: "accepted", message: "Recovered confirmed action" };
        }
      } catch { /* retain the original, more useful failure below */ }
      if (["host_epoch_stale", "host_auth_failed", "session_active_elsewhere"].includes(error.code)) {
        readOnlySession = true;
      }
      backupFailure = error;
      updateNetworkChrome();
      return {
        accepted: false,
        state,
        revision: expectedRevision,
        code: error.code || "backup_unavailable",
        message: error.message || "The backup could not confirm this action"
      };
    }
  }

  async function applyAuthoritativeAction(action, context = {}) {
    const blocked = interactionBlockReason(action);
    if (blocked) return { accepted: false, state, revision: state?.revision || 0, code: "game_paused", message: blocked };
    const actionId = context.actionId || newActionId();
    const actorId = context.actorId || localPlayerId;
    const role = context.role || (Net.getIsHost() ? "host" : "player");
    const result = Game.tryApplyAction
      ? Game.tryApplyAction(state, action, { actorId, role })
      : { accepted: true, state: Game.applyAction(JSON.parse(JSON.stringify(state)), action), code: "accepted", message: "" };
    if (!result.accepted) return { ...result, state, revision: state?.revision || 0 };

    if (isNetworkGame() && sessionCredentials.role === "host") {
      return checkpointCandidate(result.state, actionId, context.extraSeatTokens);
    }
    const revision = (Number.isInteger(state?.revision) ? state.revision : 0) + 1;
    result.state.revision = revision;
    state = result.state;
    networkStatus = { ...networkStatus, revision };
    return { ...result, state, revision };
  }

  async function heartbeatHost() {
    clearTimeout(heartbeatTimer);
    if (!sessionCredentials?.gameId || sessionCredentials.role !== "host") return;
    try {
      const result = await CivSessionApi.heartbeat(sessionCredentials.gameId, {
        hostToken: sessionCredentials.hostToken,
        hostEpoch: sessionCredentials.hostEpoch,
        hostPeerId: sessionCredentials.hostPeerId
      });
      sessionCredentials.leaseUntil = result.leaseUntil;
      backupFailure = null;
      await saveSessionCredentials();
    } catch (error) {
      backupFailure = error;
      if (["host_epoch_stale", "session_active_elsewhere", "host_peer_mismatch"].includes(error.code)) {
        readOnlySession = true;
      }
    }
    updateNetworkChrome();
    heartbeatTimer = setTimeout(heartbeatHost, backupFailure ? 5000 : HEARTBEAT_MS);
  }

  async function pollRecoveryStatus() {
    clearTimeout(recoveryTimer);
    if (!sessionCredentials?.gameId || sessionCredentials.role === "host") return;
    try {
      const remote = await CivSessionApi.status(sessionCredentials.gameId, remoteAuth(false));
      networkStatus = { ...networkStatus, canTakeover: !!remote.leaseExpired };
      if (remote.hostPeerId && remote.hostPeerId !== sessionCredentials.hostPeerId) {
        sessionCredentials.hostPeerId = remote.hostPeerId;
        sessionCredentials.hostEpoch = remote.hostEpoch;
        sessionCredentials.revision = Math.max(sessionCredentials.revision || 0, remote.revision || 0);
        await saveSessionCredentials();
        Net.resumeSession?.(sessionCredentials);
      }
    } catch (error) {
      if (error.code === "session_closed") readOnlySession = true;
    }
    updateNetworkChrome();
    recoveryTimer = setTimeout(pollRecoveryStatus, 5000);
  }

  async function retryNetworkAndBackup() {
    Net.retryNow?.();
    if (!sessionCredentials?.gameId) return;
    try {
      if (sessionCredentials.role === "host") await heartbeatHost();
      else await pollRecoveryStatus();
    } catch { /* the status badge already explains that another retry follows */ }
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

    document.getElementById("btn-undo")?.addEventListener("click", () => {
      const status = Game.getUndoStatus ? Game.getUndoStatus(state, localPlayerId) : { canUndo: false };
      if (!status.canUndo) { showToast(status.reason || "This turn cannot be undone"); return; }
      clearSub();
      dispatch({ type: "UNDO_TURN", payload: { playerId: localPlayerId } });
    });

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
      onAction: applyAuthoritativeAction,
      onAuthenticate: authenticateSeatConnection,
      getStateView: (seatId) => Game.projectState ? Game.projectState(state, seatId) : state,
      projectState: (fullState, seatId) => Game.projectState ? Game.projectState(fullState, seatId) : fullState,
      onState: receiveNetworkState,
      onJoin: addJoinedSeat,
      onDisconnect: (seatId) => {
        const who = state && Game.getPlayer(state, seatId);
        showToast(`${who ? who.name : "A player"} disconnected — game paused`);
        if (!Net.getIsHost()) pollRecoveryStatus();
        updateNetworkChrome();
        renderPlayers();
      },
      onConnected: () => {
        backupFailure = null;
        if (Net.getIsHost() && state) Net.broadcast(state, state.revision || 0);
        updateNetworkChrome();
      },
      onStatus: (status) => {
        networkStatus = { ...networkStatus, ...status };
        if (!Net.getIsHost() && ["reconnecting", "offline", "protocol_error"].includes(status.phase)) {
          pollRecoveryStatus();
        }
        updateNetworkChrome();
      },
      onRoster: (roster) => {
        networkRoster = Array.isArray(roster) ? roster : [];
        updateNetworkChrome();
        if (state) renderPlayers();
      },
      onActionResult: (result) => {
        if (result.status !== "accepted") showToast(result.message || result.code || "Action rejected");
      },
      onChat: receiveChat,
      onPresence: receivePresence,
      onProtocolError: (error) => {
        showToast(error.message || "Multiplayer protocol error");
        updateNetworkChrome();
      }
    });

    document.getElementById("btn-net-retry")?.addEventListener("click", retryNetworkAndBackup);
    document.getElementById("btn-host-takeover")?.addEventListener("click", takeOverHost);
    document.getElementById("btn-ready")?.addEventListener("click", () => {
      const me = state && Game.getPlayer(state, localPlayerId);
      if (me) dispatch({ type: "SET_READY", payload: { playerId: localPlayerId, ready: !me.ready } });
    });
    window.addEventListener("beforeunload", () => {
      stopSessionTimers();
      Net.leaveRoom?.();
    });

    document.getElementById("chat-send").addEventListener("click", () => {
      const inp = document.getElementById("chat-input");
      sendChat(inp.value);
      inp.value = "";
    });
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { sendChat(e.target.value); e.target.value = ""; }
    });

    offerResumeOptions();
  }

  function startLocal() {
    stopSessionTimers();
    Net.leaveRoom?.();
    sessionCredentials = null;
    networkRoster = [];
    backupFailure = null;
    readOnlySession = false;
    processedActionIds = [];
    localPlayerId = "local";
    const name = dom.inpName.value.trim() || "Player";
    const color = dom.inpColor.value;
    Net.startLocal({ seatId: localPlayerId, profile: { name, color } });
    const player = Game.createPlayer(localPlayerId, name, color);
    state = Game.createLobbyState([player], { solo: true });
    state.revision = 0;
    networkStatus = Net.getStatus();
    showGame();
    render();
  }

  function startCreate() {
    if (typeof Peer === "undefined") { dom.lobbyStatus.textContent = "Multiplayer unavailable (PeerJS not loaded). Use Local Solo."; return; }
    const name = dom.inpName.value.trim() || "Host";
    const color = dom.inpColor.value;
    const gameId = newGameId();
    const seatId = newSeatId();
    const seatToken = randomToken();
    const hostToken = randomToken();
    stopSessionTimers();
    Net.leaveRoom?.();
    localPlayerId = seatId;
    roomCode = gameId;
    processedActionIds = [];
    readOnlySession = false;
    backupFailure = null;
    sessionCredentials = {
      role: "host", gameId, seatId, seatToken, hostToken,
      hostEpoch: 1, hostPeerId: gameId, peerId: gameId, revision: 0,
      profile: { name, color }
    };
    dom.lobbyStatus.textContent = "Creating room...";
    Net.createRoom({
      gameId, seatId, seatToken, hostPeerId: gameId, peerId: gameId,
      revision: 0, profile: { name, color }, seatTokens: { [seatId]: seatToken }
    }, async (hostPeerId) => {
      try {
        const player = Game.createPlayer(seatId, name, color);
        state = Game.createLobbyState([player]);
        state.revision = 0;
        const created = await CivSessionApi.create(gameId, {
          protocolVersion: PROTOCOL_VERSION,
          saveSchemaVersion: SAVE_SCHEMA_VERSION,
          rulesVersion: state.rulesVersion || 0,
          hostPeerId,
          fullState: state,
          processedActionIds: [],
          seatIds: [seatId],
          hostToken,
          seatTokens: { [seatId]: seatToken }
        });
        sessionCredentials = {
          ...sessionCredentials,
          hostPeerId,
          peerId: hostPeerId,
          hostEpoch: created.hostEpoch,
          revision: created.revision,
          leaseUntil: created.leaseUntil,
          hostToken: created.credentials.hostToken,
          seatToken: created.credentials.seatTokens[seatId]
        };
        await saveLocalCheckpoint(state, 0);
        await saveSessionCredentials();
        dom.hdrRoom.textContent = `Room: ${gameId}`;
        dom.lobbyStatus.textContent = "";
        heartbeatHost();
        showGame();
        render();
      } catch (error) {
        Net.leaveRoom();
        state = null;
        sessionCredentials = null;
        dom.lobbyStatus.textContent = `Room could not be created: ${error.message || error}`;
      }
    });
  }

  function startJoin() {
    if (typeof Peer === "undefined") { dom.lobbyStatus.textContent = "Multiplayer unavailable (PeerJS not loaded). Use Local Solo."; return; }
    const code = dom.inpJoin.value.trim();
    if (!code) { dom.lobbyStatus.textContent = "Enter a room code."; return; }
    const name = dom.inpName.value.trim() || "Player";
    const color = dom.inpColor.value;
    const seatId = newSeatId();
    const seatToken = randomToken();
    stopSessionTimers();
    Net.leaveRoom?.();
    state = null;
    localPlayerId = seatId;
    roomCode = code;
    readOnlySession = false;
    backupFailure = null;
    processedActionIds = [];
    sessionCredentials = {
      role: "client", gameId: code, seatId, seatToken,
      hostPeerId: code, revision: 0, profile: { name, color }
    };
    dom.lobbyStatus.textContent = "Connecting...";
    saveSessionCredentials().catch(() => {});
    Net.joinRoom({
      hostPeerId: code, gameId: code, seatId, seatToken,
      lastRevision: 0, profile: { name, color }
    }, async (connectedSeatId) => {
      localPlayerId = connectedSeatId || seatId;
      sessionCredentials = { ...sessionCredentials, seatId: localPlayerId, revision: Net.getStatus().revision || 0 };
      await saveSessionCredentials().catch(() => {});
      dom.hdrRoom.textContent = `Room: ${code}`;
      dom.lobbyStatus.textContent = "";
      showGame();
      render();
    });
  }

  function showGame() {
    dom.lobby.classList.add("hidden");
    dom.game.classList.remove("hidden");
    initCanvas();
    startAnimLoop();
  }

  function copySubState() {
    if (typeof structuredClone === "function") return structuredClone(sub);
    const copy = JSON.parse(JSON.stringify(sub));
    copy.validHexes = new Set(Array.from(sub.validHexes || []));
    return copy;
  }

  function restoreSubState(saved) {
    Object.keys(sub).forEach((key) => { if (!(key in saved)) delete sub[key]; });
    Object.entries(saved).forEach(([key, value]) => { sub[key] = value; });
  }

  async function dispatch(action) {
    if (!state) return { status: "rejected", code: "no_state", message: "No game is open." };
    // Mirror the host's permission table before putting an action on the wire.
    // This is only instant feedback; the host runs the same check again against
    // the authoritative revision. In particular, the host UI is not allowed to
    // masquerade as a different seat to answer that player's decision.
    if (Game.getActionPermission) {
      const permission = Game.getActionPermission(state, action, {
        actorId: localPlayerId,
        role: Net.getIsHost() ? "host" : "player"
      });
      if (!permission.ok) {
        showToast(permission.message || permission.code || "That decision belongs to another player.");
        return {
          status: "rejected", code: permission.code || "unauthorized",
          message: permission.message || "That action is not available to this seat."
        };
      }
    }
    const blocked = interactionBlockReason(action);
    if (blocked || actionPending) {
      const message = blocked || "The previous action is still being confirmed.";
      showToast(message);
      return { status: "rejected", code: "game_paused", message };
    }

    const beforeSub = copySubState();
    let afterSub = beforeSub;
    actionPending = true;
    updateNetworkChrome();
    const capture = Promise.resolve().then(() => {
      afterSub = copySubState();
      restoreSubState(beforeSub);
      render();
    });
    let result;
    try {
      result = await Net.submitAction(action);
      await capture;
      actionPending = false;
      if (result.status === "accepted") {
        restoreSubState(afterSub);
        if (!isNetworkGame()) {
          try { localStorage.setItem("civ-nd-save", JSON.stringify({ state, localPlayerId })); } catch(e) {}
        }
      } else {
        restoreSubState(beforeSub);
        showToast(result.message || result.code || "Action rejected");
      }
    } catch (error) {
      await capture;
      actionPending = false;
      restoreSubState(beforeSub);
      result = { status: "rejected", code: "action_failed", message: error.message || String(error) };
      showToast(result.message);
    }
    updateNetworkChrome();
    render();
    return result;
  }

  async function receiveNetworkState(payload, meta = {}) {
    if (!payload || typeof payload !== "object") return;
    const incomingRevision = Number.isInteger(meta.revision) ? meta.revision : (payload.revision || 0);
    if (state && Number.isInteger(state.revision) && incomingRevision < state.revision) return;
    state = Game.migrateState ? Game.migrateState(payload) : payload;
    state.revision = incomingRevision;
    if (sessionCredentials) {
      sessionCredentials.revision = incomingRevision;
      await saveSessionCredentials().catch(() => {});
      await saveLocalCheckpoint(state, incomingRevision).catch(() => {});
    }
    if (Array.isArray(state.chat)) {
      chatHistory.splice(0, chatHistory.length, ...state.chat.slice(-100));
    }
    render();
  }

  async function authenticateSeatConnection(hello) {
    if (!sessionCredentials?.gameId || !state) {
      return { accepted: false, code: "session_initializing", message: "The host is still restoring the session." };
    }
    if (String(hello.gameId || "") !== sessionCredentials.gameId) {
      return { accepted: false, code: "wrong_game", message: "That room code belongs to another game." };
    }
    const seatId = String(hello.seatId || "");
    const existing = !!Game.getPlayer(state, seatId);
    if (existing) {
      try {
        await CivSessionApi.status(sessionCredentials.gameId, {
          seatId, seatToken: hello.seatToken, includeState: false
        });
        return { accepted: true, existing: true, seatId };
      } catch (error) {
        return { accepted: false, code: error.code || "seat_auth_failed", message: error.message || "Seat credentials are invalid." };
      }
    }
    if (state.phase !== "lobby") {
      return { accepted: false, code: "game_started", message: "New seats cannot join after setup begins." };
    }
    if (state.players.length >= Game.CFG.maxPlayers) {
      return { accepted: false, code: "room_full", message: "This room is full." };
    }
    return { accepted: true, isNewSeat: true, seatId };
  }

  async function addJoinedSeat(seatId, name, color, context) {
    const cleanName = String(name || "Player").trim().slice(0, 16) || "Player";
    const player = Game.createPlayer(seatId, cleanName, color);
    const result = await applyAuthoritativeAction(
      { type: "ADD_PLAYER", payload: player },
      {
        actorId: localPlayerId,
        role: "host",
        actionId: `join-${seatId}`,
        extraSeatTokens: { [seatId]: context.seatToken }
      }
    );
    if (result.accepted) {
      render();
      return { accepted: true, revision: result.revision, state: result.state };
    }
    return result;
  }

  function receiveChat(message) {
    if (!message || typeof message !== "object") return;
    const clean = {
      sender: String(message.seatId || message.sender || ""),
      seatId: String(message.seatId || message.sender || ""),
      name: String(message.name || "Player").slice(0, 100),
      text: String(message.text || "").slice(0, 100),
      ts: Number(message.at || message.ts || Date.now())
    };
    if (!clean.text.trim()) return;
    const duplicate = chatHistory.some((entry) =>
      (entry.seatId || entry.sender) === clean.seatId && entry.ts === clean.ts && entry.text === clean.text
    );
    if (duplicate) return;
    chatHistory.push(clean);
    if (chatHistory.length > 100) chatHistory.splice(0, chatHistory.length - 100);
    if (state) state.chat = chatHistory.slice(-100);
    renderLog();
  }

  function sessionRoster(fullState) {
    return (fullState?.players || []).map((player) => ({
      seatId: player.id,
      name: player.name,
      color: player.color,
      status: player.id === localPlayerId ? "online" : "offline",
      ready: !!player.ready,
      role: player.id === localPlayerId ? "host" : "player"
    }));
  }

  async function offerResumeOptions() {
    const actions = dom.lobby.querySelector(".lobby-actions");
    let gameId = "";
    try { gameId = localStorage.getItem("civ-nd-last-session") || ""; } catch { /* no storage */ }
    if (gameId && window.CivSessionStore) {
      try {
        const credentials = await CivSessionStore.loadCredentials(gameId);
        const checkpoint = await CivSessionStore.loadLatest(gameId);
        if (credentials && checkpoint) {
          const button = document.createElement("button");
          button.textContent = `Resume online game (${gameId})`;
          button.className = "resume-session";
          button.addEventListener("click", () => resumeSavedSession(gameId));
          actions.appendChild(button);
          dom.lobbyStatus.textContent = `Saved revision r${checkpoint.revision} found.`;
        }
      } catch { /* a corrupt latest record is already skipped by SessionStore */ }
    }

    // One-way compatibility for saves made before schema v2. Missing hidden
    // orders are opened offline/read-only by Game.migrateState, never promoted
    // into an authoritative multiplayer host.
    try {
      const legacy = JSON.parse(localStorage.getItem("civ-nd-save") || "null");
      if (legacy?.state && legacy?.localPlayerId) {
        const button = document.createElement("button");
        button.textContent = "Open legacy save offline";
        button.className = "ghost";
        button.addEventListener("click", () => {
          sessionCredentials = null;
          localPlayerId = legacy.localPlayerId;
          state = Game.migrateState ? Game.migrateState(legacy.state) : legacy.state;
          readOnlySession = !!state.migrationStatus?.readOnly;
          Net.startLocal({ seatId: localPlayerId });
          showGame();
          render();
        });
        actions.appendChild(button);
      }
    } catch { /* ignore malformed legacy data */ }
  }

  async function resumeSavedSession(gameId) {
    dom.lobbyStatus.textContent = "Restoring the last confirmed revision...";
    stopSessionTimers();
    Net.leaveRoom?.();
    try {
      const savedCredentials = await CivSessionStore.loadCredentials(gameId);
      const checkpoint = await CivSessionStore.loadLatest(gameId);
      if (!savedCredentials || !checkpoint) throw new Error("No valid local checkpoint remains.");
      sessionCredentials = savedCredentials;
      localPlayerId = savedCredentials.seatId;
      roomCode = gameId;
      readOnlySession = false;
      backupFailure = null;

      if (savedCredentials.role === "host") {
        const remote = await CivSessionApi.status(gameId, {
          hostToken: savedCredentials.hostToken,
          includeState: true
        });
        state = Game.migrateState ? Game.migrateState(remote.fullState) : remote.fullState;
        state.revision = remote.revision;
        rememberProcessed(remote.processedActionIds || checkpoint.processedActionIds || []);
        sessionCredentials = {
          ...savedCredentials,
          role: "host",
          hostEpoch: remote.hostEpoch,
          hostPeerId: remote.hostPeerId,
          peerId: remote.hostPeerId,
          revision: remote.revision,
          leaseUntil: remote.leaseUntil
        };
        Net.resumeSession({
          ...sessionCredentials,
          roster: sessionRoster(state),
          profile: sessionCredentials.profile || {
            name: Game.getPlayer(state, localPlayerId)?.name || "Host",
            color: Game.getPlayer(state, localPlayerId)?.color || ""
          }
        }, () => {
          heartbeatHost();
          Net.broadcast(state, state.revision);
        });
      } else {
        const remote = await CivSessionApi.status(gameId, {
          seatId: savedCredentials.seatId,
          seatToken: savedCredentials.seatToken,
          includeState: false
        });
        state = Game.migrateState ? Game.migrateState(checkpoint.fullState) : checkpoint.fullState;
        state.revision = checkpoint.revision;
        sessionCredentials = {
          ...savedCredentials,
          role: "client",
          hostPeerId: remote.hostPeerId,
          revision: checkpoint.revision,
          hostEpoch: remote.hostEpoch,
          leaseUntil: remote.leaseUntil
        };
        Net.resumeSession({ ...sessionCredentials, lastRevision: checkpoint.revision }, () => {});
        pollRecoveryStatus();
      }
      await saveSessionCredentials();
      showGame();
      render();
    } catch (error) {
      backupFailure = error;
      dom.lobbyStatus.textContent = error.code === "session_active_elsewhere"
        ? "Session is already open elsewhere."
        : `Could not resume: ${error.message || error}`;
      if (state) {
        readOnlySession = true;
        showGame();
        render();
      }
    }
  }

  async function takeOverHost() {
    if (!sessionCredentials?.gameId || sessionCredentials.role === "host") return;
    if (!confirm("The host lease has expired. Take over hosting from the last confirmed revision?")) return;
    const newHostPeerId = `${sessionCredentials.gameId}-h${(sessionCredentials.hostEpoch || 1) + 1}-${randomToken().slice(0, 8)}`;
    try {
      const recovered = await CivSessionApi.takeover(sessionCredentials.gameId, {
        seatId: sessionCredentials.seatId,
        seatToken: sessionCredentials.seatToken,
        newHostPeerId
      });
      stopSessionTimers();
      Net.leaveRoom();
      state = Game.migrateState ? Game.migrateState(recovered.fullState) : recovered.fullState;
      state.revision = recovered.revision;
      rememberProcessed(recovered.processedActionIds || []);
      sessionCredentials = {
        ...sessionCredentials,
        role: "host",
        hostToken: recovered.hostToken,
        hostEpoch: recovered.hostEpoch,
        hostPeerId: newHostPeerId,
        peerId: newHostPeerId,
        revision: recovered.revision,
        leaseUntil: recovered.leaseUntil
      };
      await saveLocalCheckpoint(state, recovered.revision);
      await saveSessionCredentials();
      networkStatus = { phase: "connecting", revision: recovered.revision, canTakeover: false };
      Net.createRoom({
        ...sessionCredentials,
        roster: sessionRoster(state),
        profile: sessionCredentials.profile || {
          name: Game.getPlayer(state, localPlayerId)?.name || "Host",
          color: Game.getPlayer(state, localPlayerId)?.color || ""
        }
      }, () => {
        heartbeatHost();
        Net.broadcast(state, state.revision);
      });
      render();
    } catch (error) {
      showToast(error.code === "takeover_lost"
        ? "Another player completed the takeover first."
        : error.message || "Host takeover failed.");
      pollRecoveryStatus();
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
    // Middle-click turns the tile over, beside F. The wheel already turns it,
    // so the hand that is turning it is already on the mouse. mousedown is
    // where the browser starts autoscroll, so the default has to go there;
    // auxclick is what actually fires the flip, so a drag off the canvas does
    // not count as one.
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 1 && placingTile()) e.preventDefault();
    });
    canvas.addEventListener("auxclick", (e) => {
      if (e.button !== 1 || !placingTile()) return;
      e.preventDefault();
      flipTile();
    });
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

  // Put a space in the middle of the board and flash it, so a reference panel
  // can answer "where is that?" by showing you rather than telling you.
  function centerOnHex(hexKey) {
    const h = state && state.map.hexes[hexKey];
    if (!h || !canvas) return false;
    panX = (dom.map.clientWidth || 800) / 2 - HEX_SIZE * SQRT3 * (h.q + h.r / 2);
    panY = (dom.map.clientHeight || 600) / 2 - HEX_SIZE * 1.5 * h.r;
    flashHex(hexKey, "rgb(225,190,231)", 1400);
    renderCanvas();
    return true;
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
    drawTable(cw, ch);

    const hexes = state.map.hexes;

    // Compute setup-valid and ghost data
    let setupValid = new Set();
    let ghostKeys = new Set();
    let ghostValid = false;
    let fortressGhostKey = null;

    if (state.phase === "setup") {
      const activeId = state.setup.order[state.setup.turnIndex];
      if (activeId === localPlayerId) {
        if (state.setup.phase === "fortress") {
          // Fortress placement is a board-reading decision. Do not paint every
          // legal answer green; the only preview is the single space currently
          // under the pointer, and an invalid click gets a plain-language reason.
          if (mouseHex) {
            const hoveredKey = Game.key(mouseHex.q, mouseHex.r);
            const hovered = hexes[hoveredKey];
            if (hovered && !hovered.active) fortressGhostKey = hoveredKey;
          }
        } else if (state.setup.phase === "tile" || state.setup.phase === "capital_tile" || state.setup.phase === "draft_tile") {
          const playerTiles = setupHand(state, localPlayerId);
          if (playerTiles.length > 0) {
            const tileId = playerTiles[0];
            // Nothing is highlighted. Working out where your land can go is the
            // decision; lighting the legal anchors answers it for you. Point at
            // a space and the tile itself says yes or no under the pointer —
            // that is the only help there is, and you go looking for it.
            if (mouseHex) {
              const anchorKey = Game.key(mouseHex.q, mouseHex.r);
              // The angle you set is the angle you see. This used to ask
              // tilePlacementFor, which searches all six and hands back the
              // first that fits — so the tile turned itself under the cursor
              // and you laid down something other than what was on screen.
              const keys = Game.getTileHexKeys(anchorKey, sub.tileRotation, hexes);
              if (keys.length === Game.TILE_OFFSETS.length) {
                ghostKeys = new Set(keys);
                ghostValid = Game.validateTilePlacement(state, tileId, anchorKey, sub.tileRotation).ok;
              }
            }
          }
        }
      }
    }

    if (state.phase === "playing" &&
        isExploring(sub.phase) &&
        mouseHex && exploringTileId()) {
      const tileId = exploringTileId();
      const anchorKey = Game.key(mouseHex.q, mouseHex.r);
      const keys = Game.getTileHexKeys(anchorKey, sub.tileRotation, hexes);
      if (keys.length === Game.TILE_OFFSETS.length) {
        ghostKeys = new Set(keys);
        // Terra p12: the new land has to reach the space you set out from,
        // so the ghost is only
        // green when this angle manages both.
        const originKey = exploreOrigin();
        ghostValid = Game.validateExploration(state, tileId, anchorKey, sub.tileRotation).ok &&
          (!originKey || keys.some((ck) =>
            Game.hexNeighborKeys(Game.parseQ(ck), Game.parseR(ck)).includes(originKey)));
      }
    }

    const hexChoice = activeHexChoice();
    const combinedValid = new Set([...sub.validHexes, ...setupValid,
      ...(hexChoice ? hexChoice.hexKeys : [])]);
    // Everything on the board that moves by itself, in one place, so the loop
    // and the drawing can never disagree about whether a frame is worth having.
    anims.living = combinedValid.size > 0 || anythingAnimating();

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
      // A hole that exploration closed around is filled with the printed
      // single-hex water token (Terra p3) - a real component, not a gap in the
      // map. It belongs to no tile, so drawTileArt skips it and it used to come
      // out as flat terrain colour, visibly not the same material as the
      // photographed tiles around it.
      if (h.tileId === "water-fill" && window.CivCardArt &&
          drawToken(CivCardArt.waterToken(), p.x, p.y, HEX_TOKEN)) {
        hexPath(p.x, p.y, HEX_SIZE);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
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

    // Layer 5b: Targeting focus — while picking a hex, everything that is NOT a
    // legal target sinks into shadow so the choices pop out unmistakably.
    //
    // This has to come after the pieces, not before them. Dimming the bare
    // terrain first and then painting the tokens on top left every fortress,
    // city-state, city and marker at full brightness on a darkened board — the
    // pieces you most need to read as "not this one" were the only things still
    // lit. The ghost tile, pieces in transit and other players' cursors are
    // drawn after this deliberately: they are what you are doing now.
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

    // Layer 6: Ghost tile
    if (ghostKeys.size > 0) drawGhostTile(ghostKeys, ghostValid);

    // Layer 6a: pieces in transit, over the board they are crossing.
    drawMovingUnits();

    // Layer 6b: everyone else, mid-thought. Drawn under the local ghost so your
    // own tile is never hidden by a rival's cursor.
    drawPresence(hexes);

    // The fortress follows the pointer as one cardboard preview, and it still
    // reveals no space but the one under the cursor. It does say whether THAT
    // space is legal, though: it used to render identically over a spot that
    // would be refused, so the two-neighbour rule was something you only ever
    // learned from a toast after clicking.
    if (fortressGhostKey) {
      const h = hexes[fortressGhostKey];
      const p = axialToPixel(h.q, h.r);
      const legal = Game.getValidFortressHexes(state).has(fortressGhostKey);
      const fort = window.CivCardArt && CivCardArt.fort();
      if (!(fort && drawToken(fort, p.x, p.y, HEX_TOKEN, { alpha: legal ? 0.8 : 0.4, shadow: true }))) {
        ctx.save();
        ctx.globalAlpha = 0.76;
        hexPath(p.x, p.y, HEX_SIZE * 0.78);
        ctx.fillStyle = "#9aa1ad"; ctx.fill();
        ctx.strokeStyle = "#e6e9ef"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      hexPath(p.x, p.y, HEX_SIZE - 1);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = legal ? "#66bb6a" : "#ef5350";
      ctx.globalAlpha = 0.95;
      ctx.stroke();
      ctx.restore();
    }

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

      // A tile is a piece of card lying on the board, so it throws a shadow.
      // This has to be filled before the clip goes on, or the clip would cut
      // the shadow off at the same edge it is supposed to fall outside of.
      ctx.save();
      ctx.beginPath();
      for (const [, h] of cells) {
        const p = axialToPixel(h.q, h.r);
        hexSubPath(p.x, p.y, HEX_SIZE + 0.6);
      }
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = HEX_SIZE * 0.28;
      ctx.shadowOffsetY = HEX_SIZE * 0.1;
      ctx.fillStyle = "#0b0d14";
      ctx.fill();
      ctx.restore();

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

  // The photograph of the face being held, laid over the spaces it would cover.
  // This is the same fit drawTileArt uses for a placed tile — the ghost and the
  // board are then literally the same picture, so what you see under the cursor
  // is what ends up on the table.
  function drawGhostPhoto(ghostKeyArr, tileId, valid) {
    if (!tileArt || !window.CivTileArt || !tileId) return false;
    if (ghostKeyArr.length !== Game.TILE_OFFSETS.length) return false;
    const side = sub.tileSide === "B" ? "B" : "A";
    const img = CivTileArt.tileImage(tileId, side, () => { renderCanvas(); });
    if (!img || !img.complete || !img.naturalWidth) return false;

    const pts = CivTileArt.cellPoints(side);
    const src = [], dst = [];
    ghostKeyArr.forEach((k, idx) => {
      const h = state.map.hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      src.push(pts[idx]);
      dst.push([p.x, p.y]);
    });
    if (src.length !== Game.TILE_OFFSETS.length) return false;
    const m = fitAffine(src, dst);
    if (!m) return false;

    ctx.save();
    ctx.beginPath();
    ghostKeyArr.forEach((k) => {
      const h = state.map.hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      hexSubPath(p.x, p.y, HEX_SIZE + 0.6);
    });
    ctx.clip();
    ctx.globalAlpha = valid ? 0.82 : 0.5;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
    return true;
  }

  // What is printed on one space of the tile you are holding: the capital star,
  // a natural wonder, a city-state, a barbarian, a resource. Same token art as
  // the board, so nothing has to be decoded from a letter.
  function drawGhostCellMarks(cx, cy, cell, hexKey) {
    const s = HEX_SIZE / 30;
    const art = pieceArt && !!window.CivCardArt && HEX_SIZE >= 22;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (cell.feature === "capital") {
      ctx.font = `bold ${Math.round(16 * s)}px sans-serif`;
      ctx.fillStyle = "#ffd54f";
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 2.4 * s;
      ctx.strokeText("\u2605", cx, cy);
      ctx.fillText("\u2605", cx, cy);
      return;
    }
    if (cell.cityState) {
      if (art && drawToken(CivCardArt.cityStateToken(cell.cityState), cx, cy, HEX_TOKEN)) return;
      ctx.font = `bold ${Math.round(6.5 * s)}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText(cell.cityState.slice(0, 3).toUpperCase(), cx, cy);
      return;
    }
    if (cell.naturalWonder) {
      if (art && drawToken(CivCardArt.naturalWonder(cell.naturalWonder), cx, cy, 0.56)) return;
      ctx.font = `bold ${Math.round(12 * s)}px sans-serif`;
      ctx.fillStyle = "#e1bee7";
      ctx.fillText("\u2726", cx, cy);
      return;
    }
    if (cell.barbarian) {
      if (art && drawToken(CivCardArt.barbarianForSpace(cell.barbarian, hexKey), cx, cy, 0.38)) return;
      ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
      ctx.fillStyle = "#ffb4a9";
      ctx.fillText(String(cell.barbarian), cx, cy);
      return;
    }
    if (cell.resource) {
      if (art && drawToken(CivCardArt.resource(cell.resource), cx, cy, 0.3)) return;
      ctx.font = `bold ${Math.round(9 * s)}px sans-serif`;
      ctx.fillStyle = "#ffe082";
      ctx.fillText("\u25c6", cx, cy);
    }
  }

  // Plain-language for what somebody is doing, from the sub-phase they sent.
  const PRESENCE_VERB = {
    card_selected: "choosing how to spend a card",
    placing_control: "placing control markers",
    growth_choice: "deciding on growth",
    pick_district: "choosing a district",
    placing_district: "placing a district",
    reinforcing: "reinforcing markers",
    reinforcing_after_district: "reinforcing markers",
    move_caravan: "moving a caravan",
    move_army: "moving an army",
    move_army_post: "deciding after a march",
    move_caravan_post: "deciding after a move",
    move_army_exploring: "exploring",
    move_caravan_exploring: "exploring",
    free_exploring: "exploring",
    placing_city: "founding a city",
    picking_wonder: "choosing a wonder",
    placing_wonder: "building a wonder",
    choosing_target: "picking a target"
  };

  function presenceVerb(p) {
    if (p.phase && PRESENCE_VERB[p.phase]) return PRESENCE_VERB[p.phase];
    if (p.ghost) return "placing a tile";
    if (p.cardType) return `resolving ${Game.FOCUS_LABELS[p.cardType] || p.cardType}`;
    return "thinking";
  }

  // Another player's cursor, tile-in-hand and half-walked route, in their own
  // colour. Everything here is a hint, never a target: none of it takes clicks.
  function drawPresence(hexes) {
    const others = livePresence();
    if (!others.length) return;
    others.forEach((p) => {
      const color = p.color || "#fff";
      ctx.save();

      // The tile they are holding over a spot, as a dashed outline.
      if (p.ghost && p.ghost.anchor) {
        const keys = Game.getTileHexKeys(p.ghost.anchor, p.ghost.rotation || 0, hexes);
        if (keys.length === Game.TILE_OFFSETS.length) {
          ctx.globalAlpha = 0.5;
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = color;
          keys.forEach((k) => {
            const h = hexes[k]; if (!h) return;
            const q = axialToPixel(h.q, h.r);
            hexPath(q.x, q.y, HEX_SIZE - 1.5);
            ctx.stroke();
          });
          ctx.setLineDash([]);
        }
      }

      // Where their figure has walked to, and the space it set out from.
      if (p.route && p.route.currentKey) {
        const cur = hexes[p.route.currentKey];
        if (cur) {
          const q = axialToPixel(cur.q, cur.r);
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = color;
          hexPath(q.x, q.y, HEX_SIZE * 0.72);
          ctx.stroke();
        }
        const from = p.route.startKey && hexes[p.route.startKey];
        if (from && p.route.startKey !== p.route.currentKey && cur) {
          const a = axialToPixel(from.q, from.r), b = axialToPixel(cur.q, cur.r);
          ctx.globalAlpha = 0.45;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // The cursor itself, with a name tag so two rivals are never confused.
      if (p.hover && hexes[p.hover]) {
        const h = hexes[p.hover];
        const q = axialToPixel(h.q, h.r);
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        hexPath(q.x, q.y, HEX_SIZE - 2);
        ctx.stroke();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = color;
        ctx.fill();

        ctx.globalAlpha = 1;
        const label = p.name || "player";
        ctx.font = `600 ${Math.max(9, Math.round(HEX_SIZE * 0.34))}px system-ui, sans-serif`;
        const w = ctx.measureText(label).width + 10;
        const bx = q.x - w / 2, by = q.y - HEX_SIZE - 15;
        roundRect(bx, by, w, 15, 7);
        ctx.fillStyle = "rgba(10,12,22,0.85)"; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = color; ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, q.x, by + 8);
      }
      ctx.restore();
    });
    anims.living = true;   // keep repainting while anyone is moving about
  }

  function drawGhostTile(ghostKeys, valid) {
    const hexes = state.map.hexes;
    const fillColor = valid ? "rgba(102,187,106,0.25)" : "rgba(239,83,80,0.2)";
    const strokeColor = valid ? "#66bb6a" : "#ef5350";

    let tileId = null;
    let tile = null;
    if (state.phase === "setup") {
      // setupHand, not playerTiles: during the advanced draft the tile being
      // placed comes from draftTiles, while playerTiles still holds the capital
      // this player will lay down later. Reading the wrong one drew the wrong
      // tile's terrain under the cursor — verified showing tile 03's face while
      // tile 16 was the one actually in hand.
      const playerTiles = setupHand(state, localPlayerId);
      tileId = playerTiles[0];
      tile = tileId ? state.setup.tiles[tileId] : null;
    } else if (isExploring(sub.phase)) {
      tileId = exploringTileId();
      tile = tileId ? state.tiles[tileId] : null;
    }

    const ghostKeyArr = mouseHex ? Game.getTileHexKeys(
      Game.key(mouseHex.q, mouseHex.r), sub.tileRotation, hexes
    ) : [];

    // The face you are actually holding. This used to paint from two lists of
    // colours typed into this function, the same ten for every tile — so you
    // could not see what was on the land, and turning it over changed nothing
    // on screen because the side never reached the drawing at all.
    const def = tileId && Game.getTileDef ? Game.getTileDef(tileId) : null;
    const face = def && def.sides ? (def.sides[sub.tileSide] || def.sides.A) : null;
    const faceCells = face ? face.cells : null;
    const photoDrawn = drawGhostPhoto(ghostKeyArr, tileId, valid);

    ghostKeys.forEach((k) => {
      const h = hexes[k];
      if (!h) return;
      const p = axialToPixel(h.q, h.r);
      const idx = ghostKeyArr.indexOf(k);
      const cell = faceCells && idx >= 0 ? faceCells[idx] : null;
      hexPath(p.x, p.y, HEX_SIZE);

      if (h.active) {
        // Occupied ground: this is why it will not go here.
        ctx.fillStyle = "rgba(239,83,80,0.35)";
        ctx.fill();
      } else if (photoDrawn) {
        // The photograph is already down; only tint it for legal or not.
        ctx.fillStyle = valid ? "rgba(102,187,106,0.12)" : "rgba(239,83,80,0.3)";
        ctx.fill();
      } else if (cell) {
        ctx.fillStyle = TERRAIN_COLORS[cell.terrain] || fillColor;
        ctx.globalAlpha = valid ? 0.75 : 0.4;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }

      // What is printed on that space, drawn with the same tokens the board
      // uses, so the ghost and the placed tile are the same picture.
      if (!cell) return;
      ctx.save();
      ctx.globalAlpha = valid ? 0.95 : 0.55;
      drawGhostCellMarks(p.x, p.y, cell, k);
      ctx.restore();
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

  // The figures still standing on a card. Terra p10 and base p4 put armies on
  // the military card and caravans on the economy card until something moves
  // them out, so the card is where you count them — and where you can see at a
  // glance how many you have left to send.
  function onCardFigures(player, cardType) {
    const kind = cardType === "military" ? "armies" : cardType === "economy" ? "caravans" : null;
    if (!kind) return "";
    const list = player[kind] || [];
    if (!list.length) return "";
    const home = list.filter((u) => !u.position).length;
    const pieceKind = kind === "armies" ? "army" : "caravan";
    const glyph = kind === "armies" ? "\u2694" : "\u26fa";
    const sprite = window.CivCardArt ? CivCardArt.piece(pieceKind, player.color) : "";
    let pips = "";
    for (let i = 0; i < list.length; i++) {
      pips += sprite
        ? `<img class="cf-fig${i < home ? "" : " out"}" src="${sprite}" alt="${pieceKind}">`
        : `<span class="cf-fig${i < home ? "" : " out"}">${glyph}</span>`;
    }
    return `<div class="cface-onboard" title="${home} of ${list.length} still on this card">${pips}</div>`;
  }

  // The board the tiles are laid on: the printed parchment with its compass
  // rose and sea monsters. It is pinned to the world, not the viewport, so it
  // pans and zooms with the tiles the way a real board does under real tiles,
  // and it is drawn large enough that the map never runs off the edge of it.
  function drawTable(cw, ch) {
    if (!tableArt || !window.CivCardArt) return;
    const img = tokenImage(CivCardArt.board(0));
    if (!img || !img.complete || !img.naturalWidth) return;
    const origin = axialToPixel(0, 0);
    // Wide enough for the biggest board the tile stack can build, so growing
    // the map never exposes a seam.
    const span = HEX_SIZE * 30;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.drawImage(img, origin.x - span / 2, origin.y - span / 2, span, span);
    // Take the parchment down a stop. At full strength it is brighter than the
    // tiles lying on it, which reads as the board floating above them.
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(24,22,32,0.34)";
    ctx.fillRect(origin.x - span / 2, origin.y - span / 2, span, span);
    // Sink the edges into the dark so the parchment reads as a board on a
    // table rather than a rectangle pasted over the background.
    const fade = ctx.createRadialGradient(origin.x, origin.y, span * 0.30,
                                          origin.x, origin.y, span * 0.52);
    fade.addColorStop(0, "rgba(17,17,34,0)");
    fade.addColorStop(1, "rgba(17,17,34,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(origin.x - span / 2, origin.y - span / 2, span, span);
    ctx.restore();
  }

  // Loaded token art, keyed by URL. A miss starts the load and returns null;
  // the board redraws when it arrives, so a slow first paint costs a frame,
  // not a missing piece. A failed load is remembered as null so a broken path
  // costs one request rather than one per frame.
  // A pointy-top hex of circumradius r is r*sqrt(3) across, and drawToken sizes
  // by width as a fraction of 2r — so this is the fraction at which a hex token
  // covers its space exactly, which is how fortresses, districts and
  // city-states sit on the physical board.
  const HEX_TOKEN = Math.sqrt(3) / 2;

  const tokenImages = new Map();
  function tokenImage(url) {
    if (!url) return null;
    if (tokenImages.has(url)) return tokenImages.get(url);
    const img = new Image();
    img.onload = () => { renderCanvas(); };
    img.onerror = () => { tokenImages.set(url, null); };
    img.src = url;
    tokenImages.set(url, img);
    return img;
  }

  // Draw a round or hex token centred on a space, at a size given as a
  // fraction of the hex. Returns false when the art is not there yet, so every
  // caller can fall back to the shape it used to draw.
  //
  // Everything is clipped to the space it sits in. Several of the extracted
  // tokens are hexes photographed on a black rectangle rather than cut out —
  // the fortress is one — and without the clip those corners paint over the
  // tile underneath.
  function drawToken(url, cx, cy, frac, opts) {
    const img = tokenImage(url);
    if (!img || !img.complete || !img.naturalWidth) return false;
    const o = opts || {};
    const w = HEX_SIZE * 2 * frac;
    const hgt = w * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.beginPath();
    // opts.disc crops a hex-shaped token down to a round one of that radius, so
    // a district reads as a marker sitting on the space rather than as a second
    // tile covering it. Everything else is clipped to its space, because a few
    // of the extracted tokens are hexes photographed on a black rectangle.
    if (o.disc) ctx.arc(cx, cy, o.disc, 0, Math.PI * 2);
    else hexSubPath(cx, cy, HEX_SIZE);
    ctx.clip();
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    if (o.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = HEX_SIZE * 0.12;
      ctx.shadowOffsetY = HEX_SIZE * 0.04;
    }
    ctx.drawImage(img, cx - w / 2, cy - hgt / 2, w, hgt);
    ctx.restore();
    return true;
  }

  // Cities and figures are models rather than cardboard tokens. Their WebP
  // renders already include transparent breathing room and a tabletop shadow,
  // so they must not be cropped to the hex like printed tokens are.
  function drawPiece(url, cx, cy, frac, opts) {
    const img = tokenImage(url);
    if (!img || !img.complete || !img.naturalWidth) return false;
    const o = opts || {};
    const size = HEX_SIZE * 2 * frac;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    if (o.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate(o.rotation);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    }
    ctx.restore();
    return true;
  }

  // The colour a piece is drawn in. Player colours are the printed four now,
  // but a save from before that still carries an old hex, so it goes through
  // the component matcher rather than being used raw.
  function seatOf(playerId) {
    const p = playerId ? Game.getPlayer(state, playerId) : null;
    return p ? p.color : null;
  }

  function drawHexContent(cx, cy, h, k) {
    const s = HEX_SIZE / 30;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Below a certain size the printed tokens turn to mush and the drawn
    // shapes read better, so the art only comes out when there is room.
    const art = pieceArt && !!window.CivCardArt && HEX_SIZE >= 26;

    // ── Center piece: city / city-state / fortress / barbarian / control ──
    if (h.city) {
      const owner = Game.getPlayer(state, h.city.ownerId);
      const color = owner ? owner.color : "#fff";
      const w = 17 * s, hh = 11 * s;
      const model = art && CivCardArt.piece(h.city.isCapital ? "capital" : "city", color);
      const modelDrawn = model && drawPiece(model, cx, cy + 1.5 * s, 0.63);
      if (!modelDrawn) {
        // Fallback for a copy of the game without the tracked artwork pack.
        roundRect(cx - w / 2, cy - hh / 2 + 2 * s, w, hh, 2.5 * s);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "rgba(10,10,20,0.85)"; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - w / 2 - 1.5 * s, cy - hh / 2 + 2.5 * s);
        ctx.lineTo(cx, cy - hh / 2 - 5 * s);
        ctx.lineTo(cx + w / 2 + 1.5 * s, cy - hh / 2 + 2.5 * s);
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill(); ctx.stroke();
      }
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
        // On the table the wonder's own token goes on the city, which is what
        // tells you at a glance that Petra is here and the Kremlin is over
        // there. Every wonder used to get the same lozenge, so the board could
        // say "a wonder" but never which one, and the only way to find out was
        // to hover each city in turn. Four of the 36 have no printed token in
        // the pack, so they keep the lozenge.
        // Up in the corner, clear of the city model below it and of the
        // resource pip along the top, on a dark disc so it reads over any
        // terrain.
        const tok = art && CivCardArt.wonderToken(h.city.wonder ? h.city.wonder.name : "");
        const badgeX = cx + HEX_SIZE * 0.44, badgeY = cy - HEX_SIZE * 0.40;
        const rad = HEX_SIZE * 0.27;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, rad, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(12,10,20,0.72)"; ctx.fill();
        ctx.lineWidth = 1.4 * s; ctx.strokeStyle = "rgba(225,190,231,0.85)"; ctx.stroke();
        if (!(tok && drawToken(tok, badgeX, badgeY, 0.24))) {
          ctx.font = `bold ${Math.round(9 * s)}px sans-serif`;
          ctx.fillStyle = "#e1bee7";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("♦", badgeX, badgeY + 0.5 * s);
        }
      }
    } else if (h.cityState) {
      if (art && drawToken(CivCardArt.cityStateToken(h.cityState.name), cx, cy, HEX_TOKEN, { shadow: true })) {
        // The printed token carries the name and the type badge already.
      } else {
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
      }
    } else if (h.fortress) {
      const owner = h.fortressOwnerId ? Game.getPlayer(state, h.fortressOwnerId) : null;
      if (art && drawToken(CivCardArt.fort(), cx, cy, HEX_TOKEN, { shadow: true })) {
        // An uncontrolled fort is the printed hex alone; once somebody holds
        // it their colour goes round the outside, so you can see whose it is
        // without hunting for a legend.
        if (owner) {
          ctx.beginPath();
          hexSubPath(cx, cy, HEX_SIZE * 0.8);
          ctx.lineWidth = 2.6 * s; ctx.strokeStyle = owner.color; ctx.stroke();
        }
      } else {
      const w = 13 * s, hh = 10 * s;
      roundRect(cx - w / 2, cy - hh / 2 + 1 * s, w, hh, 1.5 * s);
      ctx.fillStyle = owner ? owner.color : "#9aa1ad"; ctx.fill();
      ctx.lineWidth = 1.5 * s; ctx.strokeStyle = "rgba(10,10,20,0.85)"; ctx.stroke();
      // battlements
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(cx + i * 4.2 * s - 1.5 * s, cy - hh / 2 - 2.5 * s, 3 * s, 3.5 * s);
      }
      }
    } else if (h.control) {
      const owner = Game.getPlayer(state, h.control.ownerId);
      const color = owner ? owner.color : "#fff";
      // A marker that has just arrived slides in from where it came, or lands
      // with a small scale if it was newly placed. The tween is keyed on the
      // space, so it follows the token rather than the hex being redrawn.
      const mkId = "mk:" + k;
      const at = movePoint(mkId);
      if (at) { cx = at.x; cy = at.y; }
      const mkScale = at ? 1 : spawnScale(mkId);
      // A district replaces the plain token; a plain token has two printed
      // faces, and reinforcing it is a flip to the back with its ring of dots.
      const face = art && (h.control.district
        ? CivCardArt.district(color, h.control.district)
        : CivCardArt.control(color, h.control.fortified));
      // A district is a marker on the space, not a second tile covering it, so
      // it is cropped to the same disc a control token occupies. The printed
      // hex art is drawn at full size and clipped, which keeps the glyph at its
      // designed size inside the disc instead of shrinking the whole hex.
      const discR = 0.44 * HEX_SIZE * mkScale;
      const drawn = face && (h.control.district
        ? drawToken(face, cx, cy, HEX_TOKEN * mkScale, { shadow: true, disc: discR })
        : drawToken(face, cx, cy, 0.44 * mkScale, { shadow: true }));
      if (drawn) {
        // The face says whose it is and what it is. Reinforcing is a flip on a
        // plain token, but a district has only one printed face, so the ring
        // carries it — the same white ring the fallback marker uses.
        if (h.control.district && h.control.fortified) {
          ctx.beginPath();
          ctx.arc(cx, cy, discR + 1.4 * s, 0, Math.PI * 2);
          ctx.lineWidth = 2 * s;
          ctx.strokeStyle = "#fff";
          ctx.stroke();
        }
      } else if (h.control.district) {
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
      // The dial marches them a space at a time, and reactToChanges already
      // starts a tween keyed on the barbarian rather than on the space. It was
      // never read here, so the tween ran to completion while the token stayed
      // pinned to its hex centre and the whole raid teleported.
      const bId = `b:${h.barbarianId || k}`;
      const bAt = movePoint(bId);
      const bx = bAt ? bAt.x : cx, by = bAt ? bAt.y : cy;
      const bScale = bAt ? 1 : spawnScale(bId);
      // Terra p6 step 4a: the token whose letter matches the space. A space
      // with no letter still has to look the same on every client, so the
      // token is picked from the space, never from a roll.
      if (art && drawToken(CivCardArt.barbarianForSpace(h.barbarianId, k), bx, by, 0.38 * bScale, { shadow: true })) {
        // The printed helm and its letter are the whole marker.
      } else {
      const r = 7 * s * bScale;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = "#b3261e"; ctx.fill();
      ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "#ffb4a9"; ctx.stroke();
      ctx.font = `bold ${Math.round(9 * s)}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText("☠", bx, by + 0.5 * s);
      }
    }

    // ── Top badge: resource / natural wonder pill ──
    if (h.resource || h.naturalWonder) {
      const isWonder = h.resource === "wonder" || h.naturalWonder;
      // A natural wonder token names the wonder and shows the resource it
      // gives; a plain resource token is just the resource. Both are printed,
      // so the pill below is only the fallback.
      const badge = art && (h.naturalWonder
        ? CivCardArt.naturalWonder(h.naturalWonder)
        : (h.resource && h.resource !== "wonder" ? CivCardArt.resource(h.resource) : ""));
      if (badge && drawToken(badge, cx, cy - HEX_SIZE * 0.5, h.naturalWonder ? 0.56 : 0.3, { shadow: true })) {
        return drawUnits(cx, cy, k, s);
      }
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

    drawUnits(cx, cy, k, s);
  }

  // The figures standing in a space, along the bottom edge so they never sit
  // on top of whatever holds the ground.
  // One figure, wherever it happens to be on screen.
  function paintUnit(u, ux, uy, s, scale) {
    const kind = u.type === "army" ? "army" : "caravan";
    const model = pieceArt && window.CivCardArt && CivCardArt.piece(kind, u.color);
    if (model && drawPiece(model, ux, uy, 0.32 * (scale || 1))) return;
    const r = 5.2 * s * (scale || 1);
    ctx.beginPath(); ctx.arc(ux, uy, r, 0, Math.PI * 2);
    ctx.fillStyle = u.color; ctx.fill();
    ctx.lineWidth = 1.6 * s;
    ctx.strokeStyle = u.type === "army" ? "#fff" : "rgba(20,20,30,0.9)";
    ctx.stroke();
    ctx.font = `bold ${Math.round(6.5 * s * (scale || 1))}px sans-serif`;
    ctx.fillStyle = u.type === "army" ? "#fff" : "rgba(15,15,25,0.95)";
    ctx.fillText(u.type === "army" ? "⚔" : "C", ux, uy + 0.4 * s);
  }

  function drawUnits(cx, cy, k, s) {
    const units = Game.getUnitsAt(state, k);
    if (!units.length) return;
    const uy = cy + HEX_SIZE * 0.55;
    const spread = 13 * s;
    const x0 = cx - ((units.length - 1) * spread) / 2;
    units.forEach((u, i) => {
      // A figure part-way through a move is painted afterwards, at the point it
      // has actually reached, so it is not also sitting at its destination.
      if (u.animId && anims.moves.has(u.animId)) return;
      paintUnit(u, x0 + i * spread, uy, s, spawnScale(u.animId));
    });
  }

  // Everything in transit, drawn after the board so a piece passes over the
  // spaces it crosses rather than under them.
  function drawMovingUnits() {
    if (!anims.moves.size) return;
    const s = HEX_SIZE / 30;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    state.players.forEach((p) => {
      [["army", p.armies], ["caravan", p.caravans]].forEach(([type, list]) => {
        (list || []).forEach((u) => {
          const id = `${type === "army" ? "a" : "c"}${p.id}:${u.id}`;
          const at = movePoint(id);
          if (!at) return;
          ctx.globalAlpha = 1;
          // A soft shadow under a travelling piece sells it as lifted.
          ctx.beginPath();
          ctx.ellipse(at.x, at.y + HEX_SIZE * 0.62, 6 * s, 2.6 * s, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
          paintUnit({ type, color: p.color }, at.x, at.y + HEX_SIZE * 0.55, s, 1);
        });
      });
    });
    ctx.restore();
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
      publishPresence();
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
    // Drop the cursor from everyone else's board when it leaves ours.
    if (mouseHex) { mouseHex = null; publishPresence(true); }

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
  // The revealed tile, once BEGIN_EXPLORATION has drawn it. It is popped off
  // the stack at that moment, so peeking at the stack would preview the NEXT
  // tile, not the one in hand. pendingExploration is also the only source a
  // joined client has: tileStack is redacted out of its view entirely.
  function exploringTileId() {
    const pending = state && state.pendingExploration;
    if (pending && pending.playerId === localPlayerId) return pending.tileId;
    return null;
  }

  function tilesLeftInStack() {
    if (!state) return 0;
    if (Array.isArray(state.tileStack)) return state.tileStack.length;
    return state.tileStackCount || state.tileDeckCount || 0;
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

  function setSubFromMovementContinuation(continuation) {
    if (!continuation || continuation.playerId !== localPlayerId) return false;
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) return false;
    const units = continuation.unitType === "army" ? me.armies : me.caravans;
    const unit = (units || []).find((entry) => entry.id === continuation.unitId);
    if (!unit) return false;
    clearSub();
    sub.cardType = continuation.cardType;
    sub.tradeSpent = Number(continuation.tradeSpent || 0);
    sub.movementState = {
      unitType: continuation.unitType,
      unitId: continuation.unitId,
      maxMove: Number(continuation.maxMove || 0),
      remaining: Math.max(0, Number(continuation.remaining || 0)),
      currentKey: continuation.fromKey,
      startKey: continuation.startKey || continuation.fromKey,
      explored: true,
      route: []
    };
    sub.selectedUnit = { id: unit.id, position: continuation.fromKey };
    sub.phase = continuation.unitType === "army" ? "move_army" : "move_caravan";
    sub.validHexes = Game.getReachable(state, continuation.fromKey,
      sub.movementState.remaining, continuation.unitType, localPlayerId);
    return true;
  }

  function setSubFromPendingExploration(pending) {
    if (!pending || pending.playerId !== localPlayerId) return false;
    if (pending.freeRun) {
      clearSub();
      sub.phase = "free_exploring";
      sub.freeFrom = pending.fromKey;
      sub.tileRotation = 0;
      return true;
    }
    const movement = pending.movementContinuation;
    if (!movement || !setSubFromMovementContinuation(movement)) return false;
    sub.phase = movement.unitType === "army"
      ? "move_army_exploring" : "move_caravan_exploring";
    sub.tileRotation = 0;
    return true;
  }

  // Snapshots are the source of truth for a multi-step action. This also makes
  // a reload in the middle of exploration resume the exact tile and remaining
  // movement instead of dropping back to the focus row with an unresolved
  // engine state behind it.
  function reconcileAuthoritativeResolution() {
    if (!state || state.phase !== "playing") return;
    const pending = state.pendingExploration;
    if (pending && pending.playerId === localPlayerId) {
      if (!isExploring(sub.phase)) setSubFromPendingExploration(pending);
      return;
    }
    const continuation = state.movementContinuation;
    if (continuation && continuation.playerId === localPlayerId && sub.phase === "idle") {
      setSubFromMovementContinuation(continuation);
    }
  }

  function continueFromAuthoritativeExploration() {
    const continuation = state && state.movementContinuation;
    if (!setSubFromMovementContinuation(continuation)) {
      showToast("The confirmed movement state could not be restored. Reconnecting…");
      Net.retryNow?.();
      return false;
    }
    render();
    return true;
  }

  function placingTile() {
    if (isExploring(sub.phase)) return true;
    if (!state || state.phase !== "setup") return false;
    if (state.setup.phase !== "tile" && state.setup.phase !== "capital_tile" && state.setup.phase !== "draft_tile") return false;
    return state.setup.order[state.setup.turnIndex] === localPlayerId;
  }

  // The tile in the panel is the thing in your hand, so it should move when you
  // spin it round or turn it over. The card redraws at the new angle and side,
  // and so does the ghost on the board — they read the same two variables.
  let pendingCardMove = null;

  function turnTile(step) {
    sub.tileRotation = (sub.tileRotation + step + 6) % 6;
    if (!reducedMotion()) pendingCardMove = step > 0 ? "turn-cw" : "turn-ccw";
    render();
  }

  function flipTile() {
    sub.tileSide = sub.tileSide === "A" ? "B" : "A";
    if (!reducedMotion()) pendingCardMove = "flip";
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
        lines.push(`${h.city.isCapital ? "Capital" : "City"}: ${escapeHtml(owner ? owner.name : "?")} ${h.city.developed ? "(Dev)" : ""}`);
        // Name it. "(Wonder)" told you one was here but never which.
        if (h.city.wonder) {
          lines.push(`<strong style="color:#e1bee7">Wonder: ${escapeHtml(h.city.wonder.name)}</strong>`
            + (h.city.wonder.era ? ` <em style="color:#e1bee788">${escapeHtml(h.city.wonder.era)}</em>` : ""));
        } else if (h.city.hasWonder) {
          lines.push(`<strong style="color:#e1bee7">Wonder</strong>`);
        }
      }
      if (h.control) {
        const owner = Game.getPlayer(state, h.control.ownerId);
        lines.push(`${h.control.district ? `District: ${escapeHtml(h.control.district)}` : "Control"}: ${escapeHtml(owner ? owner.name : "?")} ${h.control.fortified ? "(Fort)" : ""}`);
      }
      if (h.barbarian) lines.push(`Barbarian (power ${Game.TERRAIN[h.terrain]})`);
      if (h.cityState) lines.push(`City-State: ${escapeHtml(h.cityState.name)} (${escapeHtml(h.cityState.type)})`);
      if (h.resource) lines.push(`Resource: ${h.resource}`);
      if (h.fortress) {
        const owner = h.fortressOwnerId ? Game.getPlayer(state, h.fortressOwnerId) : null;
        lines.push(`Fortress: ${escapeHtml(owner ? owner.name : "Neutral")}`);
      }
      Game.getUnitsAt(state, hexKey).forEach((u) => {
        const p = Game.getPlayer(state, u.playerId);
        lines.push(`${escapeHtml(u.type)}: ${escapeHtml(p ? p.name : "?")}`);
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
    // Markers and barbarians, keyed by owner+kind so a token that moves from one
    // space to another is recognised as the same piece travelling rather than
    // one vanishing and another appearing.
    const markers = {}, barbarians = {};
    Object.entries(state.map.hexes).forEach(([k, h]) => {
      if (h.city && h.city.wonder) wonders[h.city.wonder.name] = k;
      if (h.city) cities[k] = h.city.ownerId;
      if (h.control && h.control.district) districts[k] = h.control.district;
      if (h.control) {
        markers[`m:${h.control.ownerId}:${h.control.district || "plain"}:${k}`] = k;
      }
      if (h.barbarian) barbarians[`b:${h.barbarianId || k}`] = k;
      if (h.active) land[k] = h.tileId || 1;
    });
    // Every player's figures, not just ours. Tracking only our own meant a
    // rival's army crossed the board instantly on our screen while sliding on
    // theirs — the opposite of the shared table this is meant to feel like.
    const units = {};
    state.players.forEach((p) => {
      (p.armies || []).forEach((u) => { units[`a${p.id}:${u.id}`] = u.position; });
      (p.caravans || []).forEach((u) => { units[`c${p.id}:${u.id}`] = u.position; });
    });
    const me = Game.getPlayer(state, localPlayerId);
    return {
      wonders, cities, districts, land, markers, barbarians,
      trade: me ? { ...me.trade } : null,
      government: me ? me.government : null,
      diplomacy: me && me.diplomacy ? me.diplomacy.length : 0,
      units
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

      // Nothing on the board changes place without being seen to. The piece
      // itself is tweened now; traceMove only ever flashed the hexes along the
      // way while the figure jumped, which is what "teleporting" looked like.
      Object.entries(now.units).forEach(([id, pos]) => {
        const was = prevSeen.units[id];
        // No hex-flash trail any more. That was the stand-in for an animation
        // back when the figure jumped; now that the figure actually travels,
        // the flash just paints over it — bright enough, at a full hex wide, to
        // hide the very thing it was standing in for.
        if (pos && was && pos !== was) startMove(id, was, pos);
        else if (pos && !was) startSpawn(id, pos);      // marched out of its card
      });

      // A control marker that changes space is one marker sliding — the Culture
      // card's move is the obvious case. Matching by owner and kind is what
      // tells a slide apart from one token being removed and another placed.
      const movedFrom = {}, movedTo = {};
      Object.entries(prevSeen.markers || {}).forEach(([id, k]) => {
        if (!(id in (now.markers || {}))) movedFrom[id.split(":").slice(0, 3).join(":")] = k;
      });
      Object.entries(now.markers || {}).forEach(([id, k]) => {
        if (!(id in (prevSeen.markers || {}))) movedTo[id.split(":").slice(0, 3).join(":")] = k;
      });
      Object.entries(movedTo).forEach(([kind, to]) => {
        const from = movedFrom[kind];
        if (from && from !== to) startMove("mk:" + to, from, to);
        else startSpawn("mk:" + to, to);
      });

      // Barbarians are steered a space at a time by the event dial.
      Object.entries(now.barbarians || {}).forEach(([id, k]) => {
        const was = (prevSeen.barbarians || {})[id];
        if (was && was !== k) startMove(id, was, k);
        else if (!was) startSpawn(id, k);
      });

      // A city or a wonder does not travel, but it should still arrive.
      Object.keys(now.cities).forEach((k) => {
        if (!(k in prevSeen.cities)) startSpawn("city:" + k, k);
      });
    }
    prevSeen = now;
  }

  function render() {
    if (!state) return;
    reconcileAuthoritativeResolution();
    dom.game.classList.toggle("lobby-active", state.phase === "lobby");
    dom.game.classList.toggle("preplay", state.phase === "lobby" || state.phase === "setup");
    renderHeader();
    renderPlayers();
    renderPresenceStrip();
    renderCanvas();
    renderWizard();
    decorateWizard();
    renderHostTools();
    renderEventWheel();
    renderCombatStage();
    renderBoardChip();
    publishPresence();
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
    el.innerHTML = `<div class="tb-inner" style="--pc:${safeColor(activeP.color)}">
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
    const undoBtn = document.getElementById("btn-undo");
    const undo = Game.getUndoStatus ? Game.getUndoStatus(state, localPlayerId) : { canUndo: false, reason: "Undo unavailable." };
    if (undoBtn) {
      undoBtn.disabled = !undo.canUndo;
      undoBtn.classList.toggle("undo-ready", !!undo.canUndo);
      undoBtn.title = undo.reason || "Undo current turn";
    }
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

  // A line per player who is doing something right now, under the seat list.
  function renderPresenceStrip() {
    const strip = document.getElementById("presence-strip");
    if (!strip) return;
    const others = livePresence();
    if (!others.length) { strip.innerHTML = ""; strip.classList.add("hidden"); return; }
    strip.classList.remove("hidden");
    strip.innerHTML = others.map((p) => `
      <div class="pres-row">
        <span class="dot" style="background:${escapeHtml(p.color || "#fff")}"></span>
        <b>${escapeHtml(p.name || "player")}</b>
        <span>${escapeHtml(presenceVerb(p))}</span>
        ${p.hover ? `<em>${escapeHtml(p.hover)}</em>` : ""}
      </div>`).join("");
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

      // Everyone's tableau is face up on a real table, so it is face up here.
      // This used to stop at cities/control/score, and a rival's resources and
      // diplomacy hand lived only behind the Players panel — which meant the
      // state of the game was something you had to go and ask for.
      let tableau = "";
      if (state.phase === "playing") {
        const res = Object.entries(p.resources || {}).filter(([, v]) => v > 0);
        const dip = p.diplomacy || [];
        const wonders = [];
        Object.values(state.map.hexes).forEach((h) => {
          if (h.city && h.city.ownerId === p.id && h.city.wonder) wonders.push(h.city.wonder.name);
        });
        const trade = Object.entries(p.trade || {}).filter(([, v]) => v > 0);
        const line = (label, body, title) =>
          `<div class="ptab-row"${title ? ` title="${escapeHtml(title)}"` : ""}>
            <span>${label}</span><b>${body}</b></div>`;
        tableau = `<div class="ptab">
          ${line("Res", res.length
            ? res.map(([k, v]) => `${escapeHtml(k.slice(0, 3))}&nbsp;${v}`).join(" · ")
            : "<i>none</i>")}
          ${line("Trade", trade.length
            ? trade.map(([k, v]) => `${escapeHtml((Game.FOCUS_LABELS[k] || k).slice(0, 3))}&nbsp;${v}`).join(" · ")
            : "<i>none</i>")}
          ${line("Diplo", dip.length
            ? dip.map((d) => escapeHtml(d.name || d.cardId)).join(", ")
            : "<i>none</i>",
            dip.map((d) => `${d.name || d.cardId}: ${d.effect || ""}`).join("\n"))}
          ${line("Wonders", wonders.length ? wonders.map(escapeHtml).join(", ") : "<i>none</i>")}
          ${p.government ? line("Gov",
            escapeHtml(((Game.GOVERNMENTS || {})[p.government] || {}).name || p.government)) : ""}
        </div>`;
      }

      return `<div class="player-card${active}">
        <div class="pname"><span class="dot" style="background:${safeColor(p.color)}"></span>${escapeHtml(p.name)}${civTag}</div>
        <div class="pstats">${stats}</div>
        ${tableau}
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
    </div>`;
  }

  // ── Wizard ────────────────────────────────────────────────

  function renderHostTools() {
    if (!dom.hostTools) return;
    if (!state || !Net.getIsHost() || state.phase === "lobby") { dom.hostTools.innerHTML = ""; return; }
    const playerOptions = state.players.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
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

    // A live fight owns the screen: it happens on the board, not under a second
    // prompt panel.
    if (state.combat) { dom.wizard.innerHTML = ""; return; }

    // Your own decisions come BEFORE the finished-combat blanking below, and
    // that order is load-bearing. resolveCombat queues the barbarian reward and
    // Sumeria's resource on any barbarian kill, and lastCombat is cleared only
    // by END_TURN — so blanking first left the reward unanswerable while the
    // engine's decision_pending gate refused END_TURN, and the game could not
    // be continued or undone at all.
    if (state.pendingBarbReward && state.pendingBarbReward.playerId === localPlayerId) { renderBarbReward(me); return; }
    const pending = getVisiblePendingChoice(me);
    if (pending) {
      if (sub.phase !== "idle") clearSub();
      renderPendingChoice(pending);
      return;
    }
    // A decision for any other authenticated seat pauses the shared game. Do
    // not leave stale card or map controls visible while the engine rejects
    // those same actions with decision_pending.
    const foreignDecision = otherPendingChoice(me) ||
      (state.pendingBarbReward && state.pendingBarbReward.playerId !== localPlayerId
        ? state.pendingBarbReward : null);
    if (foreignDecision) {
      if (sub.phase !== "idle") clearSub();
      renderIdleWizard(isMyTurn, cp, me);
      return;
    }
    // Nothing left to decide, so the finished fight's result panel can have the
    // screen to itself until the turn ends.
    if (state.lastCombat) { dom.wizard.innerHTML = ""; return; }
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

  function decorateWizard() {
    if (!dom.wizard || !state) return;
    const lobby = state.phase === "lobby";
    dom.wizard.classList.toggle("lobby-mode", lobby);
    dom.wizard.classList.toggle("setup-mode", state.phase === "setup");
    dom.wizard.classList.toggle("action-mode", state.phase === "playing");
    dom.wizard.classList.toggle("collapsed", !lobby && wizardCollapsed);
    if (lobby || !dom.wizard.innerHTML.trim()) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wiz-collapse";
    button.setAttribute("aria-label", wizardCollapsed ? "Expand action panel" : "Minimize action panel");
    button.title = wizardCollapsed ? "Show action panel" : "Minimize action panel";
    button.textContent = wizardCollapsed ? "▴" : "▾";
    button.addEventListener("click", () => {
      wizardCollapsed = !wizardCollapsed;
      render();
    });
    dom.wizard.prepend(button);
  }

  function refreshWizard() {
    renderWizard();
    decorateWizard();
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
        <span class="dot" style="background:${safeColor(p.color)}"></span>
        <span class="lp-name">${escapeHtml(p.name)}${lead ? ` <span class="lp-civ">${escapeHtml(lead.civ)}</span>` : ` <span class="lp-civ dim">Random civ</span>`}</span>
        ${i === 0 ? '<span class="lp-tag">Host</span>' : ""}
        ${p.id === localPlayerId ? '<span class="lp-tag you">You</span>' : ""}
      </div>`;
    }).join("");

    const me = Game.getPlayer(state, localPlayerId);
    const takenBy = {};
    state.players.forEach((p) => { if (p.leaderId && p.leaderId !== "random") takenBy[p.leaderId] = p.id; });
    if (!lobbyPreviewLeaderId) {
      lobbyPreviewLeaderId = me && me.leaderId && me.leaderId !== "random" ? me.leaderId : "random";
    }
    const preview = leaderById[lobbyPreviewLeaderId] || null;
    const previewTakenBy = preview && takenBy[preview.id] && takenBy[preview.id] !== localPlayerId
      ? Game.getPlayer(state, takenBy[preview.id]) : null;
    const previewUnique = preview && preview.unique
      ? `${preview.unique.name} (${Game.FOCUS_LABELS[preview.unique.type] || preview.unique.type} ${["I","II","III","IV"][preview.unique.tier - 1]})`
      : "";
    const previewArt = preview && window.CivCardArt ? CivCardArt.civilization(preview.id) : "";
    const leaderCards = (Game.LEADERS || []).map((l) => {
      const takenByOther = takenBy[l.id] && takenBy[l.id] !== localPlayerId;
      const mine = me && me.leaderId === l.id;
      const uniqueLine = l.unique ? `${l.unique.name} (${Game.FOCUS_LABELS[l.unique.type] || l.unique.type} ${["I","II","III","IV"][l.unique.tier - 1]})` : "";
      const tip = `${l.ability.text}${l.unique ? `\n\nUnique card — ${uniqueLine}: ${l.unique.text}` : ""}`;
      const art = window.CivCardArt ? CivCardArt.civilization(l.id) : "";
      return `<button class="leader-card leader-thumb${mine ? " picked" : ""}${takenByOther ? " taken" : ""}${lobbyPreviewLeaderId === l.id ? " previewing" : ""}"
        data-preview-leader="${l.id}" title="${escapeHtml(tip)}" aria-label="Preview ${escapeHtml(l.civ)}">
        ${art ? `<img src="${escapeHtml(art)}" alt="${escapeHtml(l.civ)} civilization sheet">` : `<span class="leader-art-fallback">${escapeHtml(l.civ)}</span>`}
        <span class="leader-thumb-label"><b>${escapeHtml(l.civ)}</b>${mine ? " · selected" : takenByOther ? " · taken" : ""}</span>
        <span class="lc-src ${l.source}">${l.source === "terra" ? "Terra" : "Base"}</span>
      </button>`;
    }).join("");
    const randomPicked = !me || !me.leaderId || me.leaderId === "random";
    const previewPanel = preview ? `
      <div class="leader-preview-art">${previewArt
        ? `<img src="${escapeHtml(previewArt)}" alt="Full ${escapeHtml(preview.civ)} civilization sheet">`
        : `<div class="leader-art-fallback large">${escapeHtml(preview.civ)}</div>`}</div>
      <div class="leader-preview-copy">
        <div><span class="lc-src ${preview.source}">${preview.source === "terra" ? "Terra Incognita" : "Base game"}</span></div>
        <h2>${escapeHtml(preview.civ)}${preview.name && preview.name !== preview.civ ? ` <small>${escapeHtml(preview.name)}</small>` : ""}</h2>
        <p>${escapeHtml(preview.ability.text)}</p>
        ${previewUnique ? `<p class="leader-unique"><b>Unique focus card:</b> ${escapeHtml(previewUnique)}<br>${escapeHtml(preview.unique.text)}</p>` : ""}
        <button id="leader-confirm" class="wiz-primary" ${previewTakenBy ? "disabled" : ""}>${previewTakenBy
          ? `Taken by ${escapeHtml(previewTakenBy.name)}`
          : me && me.leaderId === preview.id ? `${escapeHtml(preview.civ)} selected ✓` : `Choose ${escapeHtml(preview.civ)}`}</button>
      </div>` : `
      <div class="leader-random-art"><span>?</span><b>Random civilization</b><small>A remaining sheet is dealt when the game starts.</small></div>
      <div class="leader-preview-copy">
        <h2>Let fate decide</h2>
        <p>You will receive one of the civilization sheets no player selected.</p>
        <button id="leader-confirm" class="wiz-primary">${randomPicked ? "Random selected ✓" : "Choose Random"}</button>
      </div>`;

    const leaderSection = me ? `
      <div class="leader-picker-head">
        <div><b>Choose your civilization</b><span>All 18 sheets are visible; click once to inspect, then confirm.</span></div>
      </div>
      <div class="leader-picker">
        <div class="leader-preview">${previewPanel}</div>
        <div class="leader-grid" aria-label="Civilization sheets">
          <button class="leader-card leader-thumb random${randomPicked ? " picked" : ""}${lobbyPreviewLeaderId === "random" ? " previewing" : ""}"
            data-preview-leader="random" title="Draw a random remaining leader at game start">
            <span class="leader-random-thumb">?</span><span class="leader-thumb-label"><b>Random</b>${randomPicked ? " · selected" : ""}</span>
          </button>
          ${leaderCards}
        </div>
      </div>` : "";

    const solo = !!state.solo;
    dom.wizard.innerHTML = `
      <div class="lobby-topline">
        <div><div class="wiz-title">${solo ? "Solo Game" : "Game Lobby"}</div>
          <div class="wiz-hint">Inspect the complete printed sheet before choosing.</div></div>
        ${solo ? "" : `<div class="lobby-code-row"><span>Room</span><code id="lobby-code-val">${escapeHtml(code)}</code><button id="lobby-copy" class="sm">Copy</button></div>`}
        <div class="lobby-players compact"><div class="lobby-players-head">Players (${n}/${max})</div>${playerList}</div>
      </div>
      ${leaderSection}
      <div class="lobby-footer">${n < min && !solo ? `<span>Need at least ${min} players to start.</span>` : "<span></span>"}
        ${isHost
          ? `<label class="lobby-draft-toggle" title="Terra p14's optional variant: each player drafts 2 tiles and places them in turn order instead of the core revealing automatically.">
              <input type="checkbox" id="lobby-advanced-draft" ${sub.advancedDraft ? "checked" : ""}> Advanced setup: draft core tiles
            </label>
            <button id="lobby-start" class="wiz-primary" ${canStart ? "" : "disabled"}>${solo ? "Begin" : `Start Game (${n} player${n === 1 ? "" : "s"})`}</button>`
          : `<div class="wiz-body">Waiting for the host to start the game...</div>`}</div>
    `;

    dom.wizard.querySelectorAll("[data-preview-leader]").forEach((btn) => {
      btn.addEventListener("click", () => {
        lobbyPreviewLeaderId = btn.dataset.previewLeader;
        renderLobby();
      });
    });
    document.getElementById("leader-confirm")?.addEventListener("click", () => {
      dispatch({ type: "SET_LEADER", payload: { playerId: localPlayerId, leaderId: preview ? preview.id : "random" } });
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
    document.getElementById("lobby-advanced-draft")?.addEventListener("change", (e) => {
      sub.advancedDraft = e.target.checked;
    });
    const startBtn = document.getElementById("lobby-start");
    if (startBtn) startBtn.addEventListener("click", () => {
      if (!state.solo && state.players.length < Game.CFG.minPlayers) {
        showToast(`Need at least ${Game.CFG.minPlayers} players`); return;
      }
      dispatch({ type: "START_GAME", payload: { playerId: localPlayerId, advancedDraft: sub.advancedDraft } });
    });
  }

  function renderSetupWizard() {
    const activeId = state.setup.order[state.setup.turnIndex];
    const activeP = Game.getPlayer(state, activeId);
    const isMySetupTurn = activeId === localPlayerId;

    if (state.setup.phase === "fortress") {
      if (!isMySetupTurn) {
        dom.wizard.innerHTML = `<div class="wiz-title">Fortress Placement</div><div class="wiz-body">Waiting for <strong>${escapeHtml(activeP ? activeP.name : "...")}</strong>.</div>`;
        return;
      }
      const fort = window.CivCardArt && CivCardArt.fort();
      dom.wizard.innerHTML = `
        <div class="wiz-title">Place Your Fortress</div>
        <div class="wiz-body">
          ${fort ? `<div class="fortress-preview"><img src="${fort}" alt="Fortress tile"><span>This tile follows your pointer.</span></div>` : ""}
          Click an <strong>inactive hex</strong> bordering at least 2 active hexes.<br>
          This is a neutral defensive hex (defense ${Game.CFG.fortressDefense}). Your capital will go on your hometown tile next.<br>
          Read the board and choose; legal spaces are deliberately not highlighted.
        </div>`;
      return;
    }

    if (state.setup.phase === "tile" || state.setup.phase === "capital_tile" || state.setup.phase === "draft_tile") {
      const isCapitalPhase = state.setup.phase === "capital_tile";
      const isDraftPhase = state.setup.phase === "draft_tile";
      const phaseLabel = isCapitalPhase ? "Capital Tile Placement" : (isDraftPhase ? "Draft: Core Tile Placement" : "Tile Placement");
      const playerTiles = setupHand(state, activeId);
      if (!isMySetupTurn) {
        dom.wizard.innerHTML = `<div class="wiz-title">${escapeHtml(phaseLabel)}</div><div class="wiz-body">Waiting for <strong>${escapeHtml(activeP ? activeP.name : "...")}</strong>. (${playerTiles.length} remaining)</div>`;
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
        <div class="wiz-title">${isCapitalPhase ? "Place Your Capital Tile" : (isDraftPhase ? `Place Drafted Tile: ${tileType} (${tileId})` : `Place Tile: ${tileType} (${tileId})`)}</div>
        <div class="wiz-body">
          ${isDraftPhase ? `<div class="wiz-hint">Advanced setup: this tile joins the shared core — place it touching the growing map.</div>` : ""}
          <div class="tile-preview">${renderTileCard(tileId)}</div>
          <div class="trade-counter">
            <span>Turn it:</span>
            <button id="rot-dec" class="sm">\u21ba</button>
            <span class="tc-val">${sub.tileRotation + 1}/6</span>
            <button id="rot-inc" class="sm">\u21bb</button>
            <button id="side-toggle" class="sm">Side ${sub.tileSide}</button>
          </div>
          <br><strong>Find it a home.</strong> Hover the board — the tile shows
          <strong style="color:#66bb6a">green</strong> where it fits and
          <strong style="color:#ef5350">red</strong> where it does not. Click to lay it.<br>
          Scroll or <kbd>R</kbd> to turn it, <kbd>F</kbd> to flip it over.<br>
          Tiles remaining: <strong>${playerTiles.length}</strong>
          ${tileDeadEndNote(tileId)}
        </div>`;

      document.getElementById("rot-dec").addEventListener("click", () => turnTile(-1));
      document.getElementById("rot-inc").addEventListener("click", () => turnTile(1));
      document.getElementById("side-toggle").addEventListener("click", flipTile);
    }
  }

  // The tile in your hand, big enough to read.
  //
  // This replaced a 130x75 diagram at hex size 10 whose spaces were labelled
  // "C", "W", "CS", a bare letter for a barbarian and a lozenge for a resource.
  // You cannot plan a placement off that. It now draws the face at the side and
  // angle you have it turned to — the same geometry the ghost uses on the board
  // — with the real tokens on the spaces, and names everything underneath.
  function renderTileCard(tileId) {
    const def = tileId && Game.getTileDef ? Game.getTileDef(tileId) : null;
    if (!def || !def.sides) return "";
    const side = sub.tileSide === "B" ? "B" : "A";
    const face = def.sides[side] || def.sides.A;
    const cells = face.cells || [];

    const offs = Game.TILE_OFFSETS.map((o) => Game.rotateAxial(o, sub.tileRotation));
    const pts = offs.map((o) => ({ x: Math.sqrt(3) * (o.q + o.r / 2), y: 1.5 * o.r }));
    const minX = Math.min(...pts.map((p) => p.x)) - 1.08;
    const minY = Math.min(...pts.map((p) => p.y)) - 1.08;
    const w = Math.max(...pts.map((p) => p.x)) - minX + 1.08;
    const h = Math.max(...pts.map((p) => p.y)) - minY + 1.08;

    const art = window.CivCardArt;
    const body = pts.map((p, i) => {
      const c = cells[i] || {};
      const cx = p.x - minX, cy = p.y - minY;
      const corners = [];
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 180) * (60 * a - 30);
        corners.push(`${(cx + Math.cos(ang)).toFixed(3)},${(cy + Math.sin(ang)).toFixed(3)}`);
      }
      let out = `<polygon points="${corners.join(" ")}" fill="${TERRAIN_COLORS[c.terrain] || "#555"}"
        stroke="rgba(0,0,0,0.4)" stroke-width="0.05"/>`;
      // The token that is printed on the space, at the size it sits there.
      const put = (href, r) => `<image href="${href}" x="${(cx - r).toFixed(3)}" y="${(cy - r).toFixed(3)}"
        width="${(r * 2).toFixed(3)}" height="${(r * 2).toFixed(3)}" preserveAspectRatio="xMidYMid meet"/>`;
      if (c.feature === "capital") {
        out += `<text x="${cx.toFixed(3)}" y="${(cy + 0.34).toFixed(3)}" font-size="1.1"
          text-anchor="middle" fill="#ffd54f" stroke="rgba(0,0,0,0.85)" stroke-width="0.09"
          paint-order="stroke">\u2605</text>`;
      } else if (c.cityState && art && art.cityStateToken(c.cityState)) {
        out += put(art.cityStateToken(c.cityState), 0.95);
      } else if (c.naturalWonder && art && art.naturalWonder(c.naturalWonder)) {
        out += put(art.naturalWonder(c.naturalWonder), 0.7);
      } else if (c.barbarian && art && art.barbarianForSpace(c.barbarian, String(i))) {
        out += put(art.barbarianForSpace(c.barbarian, String(i)), 0.48);
      } else if (c.resource && art && art.resource(c.resource)) {
        out += put(art.resource(c.resource), 0.4);
      }
      return out;
    }).join("");

    // Everything printed on this face, named, with the piece beside the name.
    const rows = [];
    const line = (href, label, note) => rows.push(`<li>${
      href ? `<img class="tl-icon" src="${href}" alt="">` : `<span class="tl-icon"></span>`
    }<span class="tl-name">${escapeHtml(label)}</span>${
      note ? `<span class="tl-note">${escapeHtml(note)}</span>` : ""}</li>`);

    if (cells.some((c) => c.feature === "capital")) line("", "Capital space", "where your first city goes");
    cells.forEach((c) => {
      if (c.cityState) {
        const data = (Game.CITY_STATE_DATA || {})[c.cityState] || {};
        line(art ? art.cityStateToken(c.cityState) : "", c.cityState,
          data.type ? `${data.type} city-state` : "city-state");
      }
    });
    cells.forEach((c) => {
      if (c.naturalWonder) line(art ? art.naturalWonder(c.naturalWonder) : "", c.naturalWonder, "natural wonder");
    });
    const res = {};
    cells.forEach((c) => { if (c.resource) res[c.resource] = (res[c.resource] || 0) + 1; });
    Object.entries(res).forEach(([kind, n]) => {
      line(art ? art.resource(kind) : "", kind, n > 1 ? `${n} spaces` : "1 space");
    });
    cells.forEach((c) => {
      if (c.barbarian) line(art ? art.barbarianForSpace(c.barbarian, "0") : "",
        `Barbarian ${c.barbarian}`, "starts here");
    });
    // Terrain is the thing you actually plan around, so it is always listed.
    const terr = {};
    cells.forEach((c) => { terr[c.terrain] = (terr[c.terrain] || 0) + 1; });
    const terrText = Object.entries(terr)
      .sort((a, b) => (Game.TERRAIN[a[0]] || 0) - (Game.TERRAIN[b[0]] || 0))
      .map(([t, n]) => `${n}\u00d7 ${Game.TERRAIN_LABELS[t] || t} (${Game.TERRAIN[t]})`)
      .join(", ");

    const photo = window.CivTileArt ? CivTileArt.tileImagePath(tileId, side) : null;
    const move = pendingCardMove ? ` tc-${pendingCardMove}` : "";
    pendingCardMove = null;
    return `<div class="tile-card${move}">
      <div class="tc-top">
        <svg class="tc-face" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}"
          role="img" aria-label="Tile ${escapeHtml(tileId)}, side ${side}, turned to ${sub.tileRotation + 1} of 6">${body}</svg>
        ${photo ? `<img class="tc-photo" src="${photo}" alt="Printed tile, side ${side}"
          onerror="this.remove()">` : ""}
      </div>
      <div class="tc-side">Side ${side} \u00b7 turned ${sub.tileRotation + 1}/6</div>
      ${rows.length ? `<ul class="tc-list">${rows.join("")}</ul>` : ""}
      <div class="tc-terrain">${escapeHtml(terrText)}</div>
    </div>`;
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

  // Only ever your own. This used to fall back to choices[0] for the host, so
  // a prompt belonging to somebody else — Poland's opening diplomacy raid is
  // the one that always fires — took over the host's panel and, because the
  // caller returns as soon as it renders one, left the host unable to play
  // their own focus card until they had answered a question that was not
  // theirs. It also made the ability look as though every player had it.
  // Another player's outstanding prompt is now a waiting line, not a takeover.
  function getVisiblePendingChoice(me) {
    const choices = state.pendingChoices || [];
    if (!choices.length || !me) return null;
    return choices.find((c) => c.playerId === me.id) || null;
  }

  // What somebody else is being asked, for the idle panel to mention. It is
  // deliberately read-only: the host is the authority, not a substitute for
  // another seat. If that seat disconnects, the whole table pauses.
  function otherPendingChoice(me) {
    const choices = state.pendingChoices || [];
    return choices.find((c) => !me || c.playerId !== me.id) || null;
  }

  // Show the focus card a science upgrade will actually grant. The engine's
  // option payload intentionally stays small; every client can derive this
  // public printed information from the rules and art manifests.
  function upgradeCardPreview(owner, choice, option) {
    const takeUnique = String(option.id).indexOf("unique_") === 0;
    const cardType = takeUnique ? String(option.id).slice("unique_".length) : String(option.id);
    const cur = (owner && owner.cardTiers && owner.cardTiers[cardType]) || 1;
    const tier = choice.techLevel
      ? Math.max(cur, Math.min(4, choice.techLevel))
      : Math.min(4, cur + 1);
    const leader = owner && Game.getLeader ? Game.getLeader(owner) : null;
    const unique = takeUnique && leader ? leader.unique : null;
    const name = unique ? unique.name : (Game.CARD_NAMES[cardType] || [])[tier - 1] || cardType;
    const rules = unique ? (unique.text || "")
      : (((Game.CARD_DEFS[cardType] || {})[tier] || {}).effectText || "");
    const replaces = (Game.CARD_NAMES[cardType] || [])[cur - 1] || "";
    const art = window.CivCardArt
      ? (unique ? CivCardArt.uniqueUrl(owner && owner.leaderId)
        : CivCardArt.focusUrl(cardType, tier, owner ? owner.color : ""))
      : "";
    return `${art ? `<img class="opt-face" src="${escapeHtml(art)}" alt="" loading="lazy" draggable="false">` : ""}
      <span class="opt-copy">
        <span class="opt-head">
          <span class="opt-name">${unique ? "★ " : ""}${escapeHtml(name)}</span>
          <span class="opt-tier">${escapeHtml(Game.FOCUS_LABELS[cardType] || cardType)} ${TIER_ROMAN[tier - 1] || tier}</span>
        </span>
        <span class="opt-text">${escapeHtml(rules)}</span>
        ${replaces && replaces !== name ? `<span class="opt-from">replaces ${escapeHtml(replaces)}</span>` : ""}
      </span>`;
  }

  function renderPendingChoice(choice) {
    // Foreign choices are read-only waiting records. The host has the complete
    // state, but is still never a substitute for the authenticated owner.
    if (!choice || choice.playerId !== localPlayerId) {
      const waitingFor = choice && Game.getPlayer(state, choice.playerId);
      dom.wizard.innerHTML = `<div class="wiz-title">Waiting</div>
        <div class="wiz-body"><strong>${escapeHtml(waitingFor ? waitingFor.name : "Another player")}</strong>
        must finish their decision.</div>`;
      return;
    }
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
    let body = `<div>${escapeHtml(owner ? owner.name : "Player")}: ${escapeHtml(blurb)}</div>`;
    let controls = "";

    if (choice.options && choice.options.length) {
      // A civ's own unique card is worth pointing at when it turns up as an
      // option, so it does not read as just another line in the list.
      const asCards = choice.kind === "science_upgrade";
      controls = `<div class="wiz-actions pending-options${asCards ? " with-preview" : ""}">${choice.options.map((o) =>
        `<button class="sm pending-option${o.unique ? " unique-option" : ""}${asCards ? " option-card" : ""}" data-option="${escapeHtml(o.id)}"${
          o.text ? ` title="${escapeHtml(o.text)}"` : ""}>${
          asCards ? upgradeCardPreview(owner, choice, o) : escapeHtml(o.label || o.id)}</button>`
      ).join("")}</div>`;
    } else if (choice.hexKeys && choice.hexKeys.length) {
      // Picking a space is done by pointing at it. This used to be a dropdown
      // of raw axial keys — "3,-2" — which nobody can read off a board.
      body += `<div class="pending-note">Click one of the <strong>${choice.hexKeys.length}</strong>
        highlighted spaces on the map.</div>`;
    } else if (!choice.optional) {
      controls = `<div class="wiz-actions"><button id="pending-manual-ok">Resolve</button></div>`;
    } else {
      body += `<div class="pending-note">No eligible option remains; you may skip this opportunity.</div>`;
    }

    const mine = choice.playerId === localPlayerId;
    if (choice.optional && mine) {
      controls += `<div class="wiz-actions"><button class="ghost sm" id="pending-skip">Skip</button></div>`;
    }

    dom.wizard.innerHTML = `
      <div class="wiz-title">${escapeHtml(title)}</div>
      <div class="wiz-body">${body}</div>
      ${controls}`;

    document.querySelectorAll(".pending-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: { playerId: localPlayerId, choiceId: choice.id, optionId: btn.dataset.option } });
      });
    });
    document.getElementById("pending-manual-ok")?.addEventListener("click", () => {
      dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: { playerId: localPlayerId, choiceId: choice.id } });
    });
    document.getElementById("pending-skip")?.addEventListener("click", () => {
      dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: {
        playerId: localPlayerId, choiceId: choice.id, dismiss: true
      } });
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
      const face = window.CivCardArt ? CivCardArt.wonderCard(w.name) : "";
      return `<div class="ts-wonder type-${w.type} era-${w.era}${face ? " has-art" : ""}" title="${escapeHtml(w.effect || "")}">
        ${face ? `<img class="ts-w-face" src="${escapeHtml(face)}" alt="${escapeHtml(w.name)} world wonder card" draggable="false">` : ""}
        <div class="ts-w-info">
          <div class="ts-w-top">
            <span class="ts-w-icon">${WONDER_ICONS[w.type] || "\u2b50"}</span>
            <span class="ts-w-era">${escapeHtml(w.era)}</span>
            <span class="ts-w-cost">${cost}${cost !== w.cost ? `<s>${w.cost}</s>` : ""}</span>
          </div>
          <div class="ts-w-name">${escapeHtml(w.name)}</div>
          ${w.token ? `<div class="ts-w-token">\ud83e\ude99 costs 1 less \u00b7 leaves next dial</div>` : ""}
        </div>
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
        payload: { playerId: localPlayerId, choiceId: hexChoice.id, dismiss: true } }));
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
  const DIE_PIPS = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
  };

  function dieFace(value) {
    const face = Math.max(1, Math.min(6, Number(value) || 1));
    const occupied = new Set(DIE_PIPS[face]);
    let pips = "";
    for (let position = 1; position <= 9; position++) {
      pips += `<span class="die-pip${occupied.has(position) ? " on" : ""}"></span>`;
    }
    return `<span class="die-pips" aria-hidden="true">${pips}</span>`;
  }

  function renderCombatStage() {
    const stage = dom.combatStage;
    if (!stage) return;
    const live = state.combat && state.combat.turn !== "done" ? state.combat : null;
    const candidateDone = !live && state.lastCombat ? state.lastCombat : null;
    const doneKey = candidateDone
      ? [candidateDone.attacker, candidateDone.defender, candidateDone.toKey,
        candidateDone.atkRoll, candidateDone.defRoll, candidateDone.atkTotal,
        candidateDone.defTotal].join("|")
      : null;
    const done = candidateDone && doneKey !== dismissedCombatKey ? candidateDone : null;
    if (!live && !done) {
      stage.classList.add("hidden");
      stage.innerHTML = "";
      lastStageDice = null;
      return;
    }

    const atkName = live
      ? (Game.getPlayer(state, live.attackerId) || {}).name
      : done.attacker;
    const defName = live ? live.defenderLabel : done.defender;
    const totals = live ? Game.combatTotals(live) : { atk: done.atkTotal, def: done.defTotal };
    const atkRoll = live ? live.atkRoll : done.atkRoll;
    const defRoll = live ? live.defRoll : done.defRoll;

    const actorId = live ? (live.turn === "attacker" ? live.attackerId : live.defenderOwnerId) : null;
    const mine = live && actorId === localPlayerId;
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
        <div class="cs-die ${cls}${down ? "" : " waiting"}" role="img"
          aria-label="${down ? `Rolled ${roll || 1}` : "Not rolled yet"}">${down ? dieFace(roll) : `<span class="die-wait" aria-hidden="true">?</span>`}</div>
        <div class="cs-total">${down ? total : "\u2013"}</div>
        <div class="cs-note">${note}</div>
      </div>`;

    // Every point, named. A single total tells you nothing about whether to
    // spend, which is the only decision you have.
    const lines = (parts, roll, trade, thrown, burned) => {
      const rows = [];
      if (thrown) rows.push({ label: "die", value: roll });
      (parts || []).forEach((x) => { if (x.value) rows.push(x); });
      if (trade) rows.push({ label: "trade tokens", value: trade });
      // Jebel Barkal burns resources for +2 apiece, already totalled in points
      // by the engine. Named, or the total jumps for no reason a player can
      // point at - it used to be added to the trade line, so the breakdown
      // showed trade that had never been spent.
      if (burned) rows.push({ label: "resources burned", value: burned });
      return rows.map((r) => `<div class="cs-line"><span>${escapeHtml(r.label)}</span><b>+${r.value}</b></div>`).join("")
        || `<div class="cs-line"><span>nothing</span><b>0</b></div>`;
    };
    // Once the fight is over the parts come off lastCombat, which already
    // carries the burn as a part of its own - so it is not counted twice.
    const atkNote = lines(live ? live.atkParts : done.atkParts, atkRoll,
      live ? live.atkTrade : done.atkTrade, atkThrown, live ? live.atkResource : 0);
    const defNote = lines(live ? live.defParts : done.defParts, defRoll,
      live ? live.defTrade : done.defTrade, defThrown, live ? live.defResource : 0);

    let foot = "";
    if (live && !atkThrown) {
      const mineToThrow = live.attackerId === localPlayerId;
      foot = mineToThrow
        ? `<div class="cs-turn">Your die first.</div>
           <div class="cs-actions">
             <button class="cs-btn primary" id="cs-roll" data-side="attacker">Throw</button>
             <button class="cs-btn" id="cs-cancel-attack">Cancel attack</button>
           </div>`
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
      foot = mineToThrow
        ? `${beat}<div class="cs-actions"><button class="cs-btn primary" id="cs-roll" data-side="defender">Throw to answer</button></div>`
        : `${beat}<div class="cs-turn">Waiting for ${escapeHtml(rp ? rp.name : "the defender")} to answer\u2026</div>`;
    } else if (live) {
      const who = live.turn === "attacker" ? "Attacker" : "Defender";
      if (mine) {
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
      playerId: localPlayerId, side: live.turn, mode } });
    const rollBtn = document.getElementById("cs-roll");
    rollBtn?.addEventListener("click", () => dispatch({
      type: "COMBAT_ROLL", payload: { playerId: localPlayerId,
        side: rollBtn.dataset.side } }));
    document.getElementById("cs-cancel-attack")?.addEventListener("click", () => dispatch({
      type: "CANCEL_COMBAT", payload: { playerId: localPlayerId }
    }));
    document.getElementById("cs-plus")?.addEventListener("click", () => bid("plus"));
    document.getElementById("cs-reroll")?.addEventListener("click", () => bid("reroll"));
    document.querySelectorAll(".cs-res").forEach((b) => b.addEventListener("click", () => dispatch({
      type: "COMBAT_SPEND", payload: { playerId: localPlayerId, side: live.turn,
        mode: "resource", resource: b.dataset.res } })));
    document.getElementById("cs-done")?.addEventListener("click", () => dispatch({
      type: "COMBAT_PASS", payload: { playerId: localPlayerId, side: live.turn } }));
    document.getElementById("cs-ok")?.addEventListener("click", () => {
      dismissedCombatKey = doneKey;
      render();
    });

    // Track each physical die separately. A panel-wide key made the attacker's
    // settled die visibly roll again when the defender threw or somebody paid
    // +1 even though that die had not changed.
    const combatId = `${atkName || "?"}|${defName || "?"}|${(live || done).toKey || "?"}`;
    const sameCombat = lastStageDice && lastStageDice.id === combatId;
    const atkChanged = atkThrown && (!sameCombat || !lastStageDice.atkThrown || lastStageDice.atkRoll !== atkRoll);
    const defChanged = defThrown && (!sameCombat || !lastStageDice.defThrown || lastStageDice.defRoll !== defRoll);
    if (atkChanged) rollDice(stage.querySelector(".cs-die.atk"), atkRoll);
    if (defChanged) rollDice(stage.querySelector(".cs-die.def"), defRoll);
    if (atkChanged || defChanged) {
      flashHex((live || done).toKey || (state.combat && state.combat.toKey), "rgb(239,83,80)", 900);
    }
    lastStageDice = { id: combatId, atkThrown, defThrown, atkRoll, defRoll };
  }

  let lastStageDice = null;

  // A short cast through pip faces before settling on the decided result. The
  // transform runs once; it never spins indefinitely like a slot machine.
  function rollDice(el, result) {
    if (!el || reducedMotion()) return;
    const final = Math.max(1, Math.min(6, Number(result) || 1));
    let ticks = 0;
    el.classList.remove("landed");
    el.classList.add("rolling");
    const id = setInterval(() => {
      el.innerHTML = dieFace(1 + Math.floor(Math.random() * 6));
      if (++ticks >= 8) {
        clearInterval(id);
        el.innerHTML = dieFace(final);
        el.setAttribute("aria-label", `Rolled ${final}`);
        el.classList.remove("rolling");
        el.classList.add("landed");
        setTimeout(() => el.classList.remove("landed"), 400);
      }
    }, 80);
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
    // A disconnected or slower seat is never represented by the host. Major
    // decisions pause the table until their authenticated owner answers.
    const otherChoice = otherPendingChoice(me);
    const otherReward = state.pendingBarbReward && state.pendingBarbReward.playerId !== localPlayerId
      ? state.pendingBarbReward : null;
    const other = otherChoice || otherReward;
    const otherOwner = other ? Game.getPlayer(state, other.playerId) : null;
    if (other) {
      dom.wizard.innerHTML = `<div class="wiz-title">Waiting for a Decision</div>
        <div class="wiz-body"><strong>${escapeHtml(otherOwner ? otherOwner.name : "Another player")}</strong>
        must finish their game decision. Only that player can choose.</div>`;
      return;
    }
    if (!isMyTurn) {
      dom.wizard.innerHTML = `<div class="wiz-title">Waiting</div><div class="wiz-body">It's <strong>${escapeHtml(cp ? cp.name : "...")}</strong>'s turn.</div>`;
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
      document.getElementById("tc-dec").addEventListener("click", () => { sub.tradeSpent = Math.max(0, sub.tradeSpent - 1); refreshWizard(); });
      document.getElementById("tc-inc").addEventListener("click", () => { sub.tradeSpent = Math.min(tradeAvail, sub.tradeSpent + 1); refreshWizard(); });
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
        <button id="wiz-district"><span class="wiz-btn-icon" aria-hidden="true">🏘️</span> Place District</button>
        <button id="wiz-reinforce"><span class="wiz-btn-icon" aria-hidden="true">🛡️</span> Reinforce</button>
        <button class="ghost" id="wiz-cancel3">Cancel</button>
      </div>`;
    document.getElementById("wiz-district").addEventListener("click", () => { sub.phase = "pick_district"; refreshWizard(); });
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
    document.getElementById("wiz-back-growth").addEventListener("click", () => { sub.phase = "growth_choice"; refreshWizard(); });
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
        ${ms && ms.remaining <= 0 ? `<button id="wiz-finish-move">Finish movement</button>` : ""}
        ${cardOpen && selectingUnit ? `<button id="wiz-done-card">Done with card</button>` : ""}
        <button class="ghost" id="wiz-cancel6">${cardOpen ? "Back to unit choice" : "Cancel"}</button>
      </div>`;
    document.getElementById("wiz-finish-move")?.addEventListener("click", endMovement);
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
    // Your attack is not one number across the options. Iron Working reads
    // "plus 2 if attacking a barbarian", so the bonus depends on which piece
    // you pick — and this was calling getMilitaryCombatBonus with no defender
    // type at all, which silently dropped that +2 from the preview of the one
    // target it applies to.
    const attackAgainst = (d) => me ? Game.getSlotValue(me, "military", state) +
      Game.getMilitaryCombatBonus(me, d && d.type) +
      Game.getLeaderAttackBonus(state, localPlayerId, t.hexKey) : 0;
    dom.wizard.innerHTML = `
      <div class="wiz-title">Which piece are you attacking?</div>
      <div class="wiz-body">
        ${t.list.map((d, i) => `
          <button class="tgt-card" data-i="${i}">
            <span class="tgt-name">${escapeHtml(d.label)}</span>
            <span class="tgt-power">${d.power}</span>
            <span class="tgt-parts">${(d.parts || []).filter((x) => x.value)
              .map((x) => `${escapeHtml(x.label)} +${x.value}`).join(", ") || "no bonuses"}</span>
            <span class="tgt-mine">you attack at <b>${attackAgainst(d)}</b> before the die</span>
          </button>`).join("")}
      </div>
      <div class="wiz-actions"><button class="ghost" id="tgt-back">Back</button></div>`;

    document.querySelectorAll(".tgt-card").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const d = t.list[Number(btn.dataset.i)];
        flashHex(t.hexKey, "rgb(239,83,80)", 800);
        const result = await dispatch({ type: "PLAY_MILITARY_ATTACK", payload: {
          playerId: localPlayerId, unitId: t.unitId, toKey: t.hexKey,
          fromKey: t.fromKey, targetType: d.type } });
        if (!result || result.status !== "accepted") return;
        sub.attackTargets = null;
        nextUnitOrFinish("army");
      });
    });
    document.getElementById("tgt-back")?.addEventListener("click", () => {
      sub.attackTargets = null;
      continueMovement();
    });
  }

  // The one thing the panel still says out loud: when a tile genuinely cannot
  // go anywhere on the board. Hunting for a space that does not exist is not a
  // puzzle, it is a hang. How many spaces DO take it is deliberately not said —
  // finding them is the decision.
  function tileDeadEndNote(tileId, validate) {
    if (!state || !tileId) return "";
    const check = validate || Game.validateTilePlacement;
    for (const anchor of Object.keys(state.map.hexes)) {
      for (let rot = 0; rot < 6; rot++) {
        if (check(state, tileId, anchor, rot).ok) return "";
      }
    }
    return `<div class="wiz-note">There is nowhere on the board this tile can go.</div>`;
  }

  function renderExploring() {
    const expTileId = exploringTileId();
    // The engine's own test, so the button is only offered when the rule
    // actually allows it instead of being refused after the click.
    const canPutBack = !!(state.pendingExploration && Game.canAbandonExploration &&
      Game.canAbandonExploration(state, localPlayerId).ok);
    const expTile = expTileId ? state.tiles[expTileId] : null;
    const expType = expTile ? expTile.type.charAt(0).toUpperCase() + expTile.type.slice(1) : "?";
    dom.wizard.innerHTML = `
      <div class="wiz-title">Exploring: ${expType} Tile</div>
      <div class="wiz-body">
        <div class="tile-preview">${renderTileCard(expTileId)}</div>
        <div class="trade-counter">
          <span>Turn it:</span>
          <button id="rot-dec" class="sm">\u21ba</button>
          <span class="tc-val">${sub.tileRotation + 1}/6</span>
          <button id="rot-inc" class="sm">\u21bb</button>
          <button id="side-toggle" class="sm">Side ${sub.tileSide}</button>
        </div>
        <br>Place the tile touching ${sub.phase === "free_exploring" ? "the space you chose" : "your unit's hex"}.<br>
        <strong style="color:#66bb6a">Green</strong> = valid, <strong style="color:#ef5350">Red</strong> = invalid.
        <br>Tiles remaining in stack: <strong>${tilesLeftInStack()}</strong>
      </div>
      <div class="wiz-actions">
        ${canPutBack
          ? `<button class="ghost" id="wiz-abandon-explore">Nowhere it fits — put it back</button>`
          : `<span class="wiz-note">Terra p12: it only goes back if it fits nowhere. It fits somewhere — place it.</span>`}
      </div>`;

    document.getElementById("rot-dec").addEventListener("click", () => turnTile(-1));
    document.getElementById("rot-inc").addEventListener("click", () => turnTile(1));
    document.getElementById("side-toggle").addEventListener("click", flipTile);
    // Terra p12: a tile with nowhere to go returns to the top of the stack and
    // the expedition ends. The movement is spent either way.
    document.getElementById("wiz-abandon-explore")?.addEventListener("click", async () => {
      const freeRun = sub.phase === "free_exploring";
      const result = await dispatch({ type: "ABANDON_EXPLORATION", payload: {
        playerId: localPlayerId, fromKey: exploreOrigin()
      }});
      if (!result || result.status !== "accepted") return;  // toast already shown
      if (freeRun) { resetSub(); return; }
      continueFromAuthoritativeExploration();
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

  // Terra p12 step 1 is a real, public reveal: the tile comes off the bottom of
  // the stack and everyone sees it before it is placed. So exploring is two
  // actions, not one — this draws the tile, and the board click places it. The
  // engine also moves the figure to fromKey here after validating the route,
  // which is why the walked route is sent: the figure has not actually moved
  // yet, only sub.movementState has.
  async function startExploration() {
    const ms = sub.movementState;
    if (!ms) return;
    // dispatch is async: it awaits the authoritative result. Reading state
    // straight after calling it reads the state from BEFORE the action, which
    // silently skipped the phase change and left the player in the move panel
    // with a tile already revealed behind it.
    const result = await dispatch({ type: "BEGIN_EXPLORATION", payload: {
      playerId: localPlayerId,
      fromKey: ms.currentKey,
      unitId: ms.unitId,
      unitType: ms.unitType,
      startKey: ms.romeStart || ms.startKey,
      route: (ms.route || []).slice(),
      tradeSpent: sub.tradeSpent
    }});
    if (!result || result.status !== "accepted") return;   // toast already shown
    if (!setSubFromPendingExploration(state.pendingExploration)) {
      showToast("The revealed tile could not be restored. Reconnecting…");
      Net.retryNow?.();
    }
    render();
  }

  async function endMovement() {
    const ms = sub.movementState;
    if (!ms) { resetSub(); return; }
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { resetSub(); return; }

    const continuation = state.movementContinuation;
    if (continuation && continuation.playerId === localPlayerId &&
        continuation.unitId === ms.unitId && continuation.fromKey === ms.currentKey) {
      const result = await dispatch({ type: "END_UNIT_MOVE", payload: {
        playerId: localPlayerId, unitId: ms.unitId
      }});
      if (!result || result.status !== "accepted") return;
      nextUnitOrFinish(ms.unitType);
      return;
    }

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
        const result = await dispatch({ type: "PLAY_MILITARY_ATTACK", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey,
          fromKey: ms.startKey, targetType: defender.type
        }});
        if (!result || result.status !== "accepted") return;
      } else {
        const result = await dispatch({ type: "PLAY_MILITARY_MOVE", payload: {
          playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey,
          // An army that started on its card needs to say which city it left.
          startKey: ms.startKey, tradeSpent: sub.tradeSpent
        }});
        if (!result || result.status !== "accepted") return;
      }
    } else {
      const result = await dispatch({ type: "PLAY_ECONOMY", payload: {
        playerId: localPlayerId, unitId: ms.unitId, toKey: ms.currentKey, tradeSpent: sub.tradeSpent,
        startKey: ms.romeStart || undefined
      }});
      if (!result || result.status !== "accepted") return;
    }
    nextUnitOrFinish(ms.unitType);
  }

  // Economy and military cards move each of your figures. Hand the player the
  // next one; when none are left the engine has already reset the card.
  function nextUnitOrFinish(unitType) {
    const me = Game.getPlayer(state, localPlayerId);
    const active = state.activeCard;
    // A fight opens before activeCard is set, so bailing on "no active card"
    // here dropped the player back to idle mid-attack.
    if (state.combat) { sub.phase = "idle"; render(); return; }
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

  // A clicked hex outside sub.validHexes used to just do nothing — no toast,
  // no hint. That reads as "the game didn't register my click" rather than
  // "that space is not reachable for a real reason", so this works out which
  // reason applies and says so. Best-effort: it checks the space itself, not
  // full pathfinding, so a space that's merely unreachable through everything
  // in between falls through to the generic message.
  function explainUnreachable(hexKey, unitType, playerId) {
    const h = state.map.hexes[hexKey];
    if (!h || !h.active) return "That space hasn't been explored yet.";
    const player = Game.getPlayer(state, playerId);
    if (h.terrain === "water" && !Game.canCrossWater(player, unitType)) return "Can't cross water.";
    if (unitType === "caravan" && h.barbarian) return "A caravan can't enter a barbarian space.";
    if (h.terrain !== "water") {
      const limit = Game.movementTerrainLimit(state, player, unitType);
      if (Game.terrainDifficulty(h) > limit) {
        const cardType = unitType === "caravan" ? "Economy" : "Military";
        return `Terrain's too rough for your ${cardType} card to cross yet.`;
      }
    }
    return "Too far to reach with the movement you have left.";
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
        <button id="wiz-build-city"><span class="wiz-btn-icon" aria-hidden="true">🏰</span> Build City (cost=terrain, range=${Game.getCityRange(me)})</button>
        <button id="wiz-build-wonder"><span class="wiz-btn-icon" aria-hidden="true">🗿</span> Build Wonder (7/9/12)</button>
        <button class="ghost" id="wiz-cancel7">Cancel</button>
      </div>`;
    document.querySelectorAll(".res-btn").forEach((btn) => {
      btn.addEventListener("click", () => { sub.spentResources[btn.dataset.r] = !sub.spentResources[btn.dataset.r]; refreshWizard(); });
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

    let html = `<div class="wiz-title">Choose Visible Wonder (Production: ${prod})</div><div class="wiz-body wonder-pick-grid">`;
    visible.forEach((w) => {
      const affordable = prod >= w.cost;
      const disabled = affordable ? "" : " disabled";
      const face = window.CivCardArt ? CivCardArt.wonderCard(w.name) : "";
      html += `<button class="sm wonder-pick${disabled}" data-name="${escapeHtml(w.name)}"${disabled ? " disabled" : ""}>
        ${face ? `<img src="${escapeHtml(face)}" alt="" draggable="false">` : ""}
        <span class="wonder-pick-copy">
          <strong>${escapeHtml(w.name)}</strong> (${escapeHtml(w.type)}, ${escapeHtml(w.era)}, cost ${w.cost})${affordable ? "" : ` <span style="color:var(--danger)">need ${w.cost}</span>`}<br>
          <span class="wonder-pick-effect">${escapeHtml(w.effect || "")}</span>
        </span>
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
    // Where it stands, not just whose it is: "built by Red" still left you
    // hovering every city on the board to find the thing.
    let built = null, atKey = null, atHex = null;
    Object.entries(state.map.hexes).forEach(([k, h]) => {
      if (h.city && h.city.wonder && h.city.wonder.name === name) {
        built = h.city.ownerId; atKey = k; atHex = h;
      }
    });
    if (built) {
      const owner = Game.getPlayer(state, built);
      const where = atHex.city.isCapital ? "their capital"
        : `a city on tile ${atHex.tileId || "?"}`;
      return {
        label: owner ? `built by ${owner.name} — ${where}` : `built — ${where}`,
        cls: "built", hexKey: atKey, ownerColor: owner ? owner.color : null
      };
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
        you put in. You need a city of your own that has no wonder yet.</p>`;
    let anyShown = false;
    types.forEach((type) => {
      // Two of every ancient/medieval deck are shuffled out face-down before
      // the game starts (Terra p14) and never surface again — the whole point
      // being that nobody, including this reference, is meant to know which.
      // wonderState()'s "still in the deck" label covers both a wonder that
      // genuinely hasn't come up yet AND one that never will; showing it here
      // let a long game out the excluded ones by elimination once everything
      // else cycled through, so this only lists what has actually happened —
      // built, removed mid-game, or on top of its deck right now.
      const shown = (byType[type] || []).slice()
        .map((w) => ({ w, st8: wonderState(w.name) }))
        .filter(({ st8 }) => st8.cls !== "deck")
        .sort((a, b) => (a.w.era || "").localeCompare(b.w.era || "") || a.w.cost - b.w.cost);
      if (!shown.length) return;
      anyShown = true;
      html += `<h3 class="ref-group">${Game.FOCUS_LABELS[type] || type}</h3><div class="ref-grid wonders-grid">`;
      shown.forEach(({ w, st8 }) => {
          const afford = me ? Game.getWonderCost(w.name, me, state) : w.cost;
          const token = Game.getWonderToken(state, w.name);
          const wArt = window.CivCardArt ? CivCardArt.wonderCard(w.name) : "";
          html += `<div class="wcard type-${type} era-${w.era} st-${st8.cls}${wArt ? " has-face" : ""}">
            ${wArt ? `<img class="wcard-face" src="${escapeHtml(wArt)}" alt="${escapeHtml(w.name)} world wonder card" loading="lazy" draggable="false">` : ""}
            <div class="wcard-copy">
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
            <div class="wcard-foot st-${st8.cls}"${st8.ownerColor ? ` style="border-left:3px solid ${escapeHtml(st8.ownerColor)}"` : ""}>
              ${st8.label}
              ${st8.hexKey ? `<button class="wcard-goto" data-hex="${escapeHtml(st8.hexKey)}"
                title="Centre the board on it">show me</button>` : ""}
            </div>
            </div>
          </div>`;
        });
      html += `</div>`;
    });
    if (!anyShown) {
      html += `<p class="ref-lede">No wonder has come up yet this game — the top card
        of each deck appears here the moment it does.</p>`;
    }
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
      <div class="ref-grid">${active.map((card) => {
        // The printed card is indexed by the agendas on it, because that is
        // the only thing it and the rules data have in common.
        const face = window.CivCardArt ? CivCardArt.victory(card.agendas[0]) : "";
        return `
        <div class="vcard ${claims[card.id] ? "won" : ""}${face ? " has-art" : ""}">
          ${face ? `<img class="vcard-face" src="${face}" alt="" draggable="false">` : ""}
          <div class="vcard-top">${claims[card.id] ? "\u2713 claimed" : "not yet"}${card.fortress ? " \u00b7 must be held" : ""}</div>
          ${card.agendas.map((id) => {
            const a = agendaMap[id] || { name: id, description: "" };
            return `<div class="vcard-half ${claims[id] ? "done" : ""}">
              <div class="vcard-name">${escapeHtml(a.name)}</div>
              <div class="vcard-text">${escapeHtml(a.description || "")}</div>
            </div>`;
          }).join(`<div class="vcard-or">or</div>`)}
        </div>`;
      }).join("")}</div>
    </div>`;
  }

  // One city-state, in full. Opened by clicking it on the board, because the
  // thing you want to know about a city-state — what trading there actually
  // buys you — was only ever a line in the diplomacy panel's tail.
  function renderCityStateRef(name) {
    const data = (Game.CITY_STATE_DATA || {})[name] || {};
    const me = Game.getPlayer(state, localPlayerId);
    let atKey = null, left = null;
    Object.entries(state.map.hexes).forEach(([k, h]) => {
      if (h.cityState && h.cityState.name === name) {
        atKey = k;
        left = h.cityState.diplomacyCards;
      }
    });
    const held = ((me && me.diplomacy) || []).filter((d) => d.fromCityState === name).length;
    const face = window.CivCardArt ? CivCardArt.cityStateCard(name) : "";
    const token = window.CivCardArt ? CivCardArt.cityStateToken(name) : "";
    const type = data.type || "culture";
    return `<div class="ref-card">
      <button class="detail-close" id="ref-close" aria-label="Close">✕</button>
      <h2 class="ref-title">${escapeHtml(name)}</h2>
      <p class="ref-lede">A caravan that reaches a city-state goes back to its economy
        card and brings home <strong>2 trade tokens on the matching card</strong> plus
        <strong>one of the city-state's diplomacy cards</strong>. Two copies of each exist,
        and no two caravans may arrive in the same turn.</p>
      <div class="cs-detail">
        ${face ? `<img class="cs-face" src="${escapeHtml(face)}" alt="${escapeHtml(name)} city-state card" draggable="false">` : ""}
        <div class="cs-copy">
          <div class="cs-row"><span>Type</span>
            <b class="cs-type type-${escapeHtml(type)}">${token ? `<img class="cs-token" src="${escapeHtml(token)}" alt="" draggable="false">` : ""}${escapeHtml(Game.FOCUS_LABELS[type] || type)}</b></div>
          <div class="cs-row"><span>Trading here pays</span><b>2 trade on your ${escapeHtml(Game.FOCUS_LABELS[type] || type)} card</b></div>
          <div class="cs-row"><span>Its diplomacy card</span><b>${escapeHtml(data.diplomacy || "—")}</b></div>
          <div class="cs-row"><span>Copies left</span><b>${left === null ? "—" : left}${held ? ` · you hold ${held}` : ""}</b></div>
          <div class="cs-row"><span>On the board</span><b>${atKey ? escapeHtml(atKey) : "not in play"}</b></div>
          ${atKey ? `<button class="wcard-goto" data-hex="${escapeHtml(atKey)}">show me</button>` : ""}
        </div>
      </div>
    </div>`;
  }

  // Everyone's tableau side by side. The board shows whose pieces are whose,
  // but what a rival's cards actually resolve at — and what is propping those
  // numbers up — was private to each client, so you could not see a rival
  // about to out-produce you until it happened.
  function renderPlayersRef() {
    const wondersOf = {};
    Object.values(state.map.hexes).forEach((h) => {
      if (h.city && h.city.wonder) {
        (wondersOf[h.city.ownerId] = wondersOf[h.city.ownerId] || []).push(h.city.wonder);
      }
    });

    let html = `<div class="ref-card">
      <button class="detail-close" id="ref-close" aria-label="Close">✕</button>
      <h2 class="ref-title">Players</h2>
      <p class="ref-lede">Every focus row, at the number it actually resolves at.
        A card's place in the row is its base; a government marker, and the wonders
        and diplomacy cards listed under each player, move it further right.</p>`;

    state.players.forEach((p) => {
      const lead = Game.getLeader ? Game.getLeader(p) : null;
      const isMe = p.id === localPlayerId;
      const active = Game.currentPlayer(state) && Game.currentPlayer(state).id === p.id;
      const res = Object.entries(p.resources || {}).filter(([, v]) => v > 0);
      const dip = p.diplomacy || [];
      const won = wondersOf[p.id] || [];

      html += `<div class="pl-block${active ? " active" : ""}">
        <div class="pl-head">
          <span class="dot" style="background:${escapeHtml(p.color)}"></span>
          <b>${escapeHtml(p.name)}${isMe ? " (you)" : ""}</b>
          ${lead ? `<span class="pl-civ">${escapeHtml(lead.civ)} · ${escapeHtml(lead.name)}</span>` : ""}
          ${active ? `<span class="pl-turn">to move</span>` : ""}
          <span class="pl-score">Score ${Game.computeScore(state, p.id)}</span>
        </div>
        ${lead ? `<p class="pl-ability">${escapeHtml(lead.ability.text)}</p>` : ""}
        <div class="pl-row">`;

      // The row in play order, each card at its effective slot.
      p.focusRow.forEach((type) => {
        const slot = Game.getSlotValue(p, type, state);
        const tier = Game.getCardTier(p, type);
        const name = Game.getCardName ? Game.getCardName(p, type) : type;
        const gov = p.government === type ? (Game.GOVERNMENTS || {})[type] : null;
        const trade = (p.trade || {})[type] || 0;
        return html += `<div class="pl-card type-${type}${gov ? " has-gov" : ""}" title="${escapeHtml(name)}">
          <span class="pl-slot">${slot}</span>
          <span class="pl-ico">${Game.CARD_ICONS[type] || ""}</span>
          <span class="pl-type">${escapeHtml(Game.FOCUS_LABELS[type] || type)}</span>
          <span class="pl-tier">${TIER_ROMAN[tier - 1] || tier}</span>
          <span class="pl-trade">${trade ? "●".repeat(trade) : "·"}</span>
          ${gov ? `<span class="pl-gov" title="${escapeHtml(gov.name)}: resolves ${gov.shift} places further right">${escapeHtml(gov.name)}</span>` : ""}
        </div>`;
      });

      html += `</div><div class="pl-facts">
        <div><span>Tech</span><b>${p.tech || 0}/24 · tier ${p.techTier || 1}</b></div>
        <div><span>Armies / Caravans</span><b>${p.armies.length} / ${p.caravans.length}</b></div>
        <div><span>Cities</span><b>${Game.countCities(state, p.id)}${Game.countDeveloped ? ` (${Game.countDeveloped(state, p.id)} mature)` : ""}</b></div>
        <div><span>Control markers</span><b>${Game.countControl(state, p.id)}</b></div>
        <div><span>Resources</span><b>${res.length ? res.map(([k, v]) => `${escapeHtml(k)} ×${v}`).join(", ") : "none"}</b></div>
        <div><span>Government</span><b>${p.government ? escapeHtml(((Game.GOVERNMENTS || {})[p.government] || {}).name || p.government) : "none yet"}</b></div>
      </div>`;

      html += `<div class="pl-lists">
        <div><span class="pl-sub">Wonders (${won.length})</span>${won.length
          ? won.map((w) => `<div class="pl-item"><b>${escapeHtml(w.name)}</b><em>${escapeHtml(w.effect || "")}</em></div>`).join("")
          : `<div class="pl-none">none</div>`}</div>
        <div><span class="pl-sub">Diplomacy (${dip.length})</span>${dip.length
          ? dip.map((d) => {
              const from = d.fromCityState ? d.fromCityState
                : (Game.getPlayer(state, d.fromId) || {}).name || "a rival";
              return `<div class="pl-item"><b>${escapeHtml(d.name || d.cardId)}</b>
                <em>from ${escapeHtml(from)} — ${escapeHtml(d.effect || "")}</em></div>`;
            }).join("")
          : `<div class="pl-none">none</div>`}</div>
      </div></div>`;
    });

    return html + `</div>`;
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

    // Each colour has its own set, so the pictures are shown in the colour of
    // whoever is asking — that is the deck you would actually be handing out.
    const mySeat = me ? me.color : null;
    html += `<h3 class="ref-group">The rival cards</h3><div class="ref-grid">`;
    Object.entries(cards).forEach(([id, c]) => {
      const face = window.CivCardArt ? CivCardArt.diplomacy(mySeat, id) : "";
      html += `<div class="wcard type-military${face ? " has-face" : ""}">
        ${face ? `<img class="wcard-face" src="${face}" alt="" draggable="false">` : ""}
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
      const face = window.CivCardArt ? CivCardArt.cityStateCard(cs.name) : "";
      return `<div class="wcard type-${cs.type}${face ? " has-face" : ""}">
        ${face ? `<img class="wcard-face" src="${face}" alt="" draggable="false">` : ""}
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
        : which === "players" ? renderPlayersRef()
        : which === "citystate" ? renderCityStateRef(arg)
        : renderDiplomacyRef();
    } catch (err) {
      body.innerHTML = `<div class="ref-card"><button class="detail-close" id="ref-close">\u2715</button>
        <h2 class="ref-title">Could not build that panel</h2>
        <p class="ref-lede">${escapeHtml(String(err && err.message || err))}</p></div>`;
    }
    overlay.classList.remove("hidden");
    body.querySelector("#ref-close")?.addEventListener("click", () => overlay.classList.add("hidden"));
    // "show me" on a built wonder closes the panel and puts its city in the
    // middle of the board, flashing, rather than leaving you to go and find it.
    body.querySelectorAll(".wcard-goto").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        overlay.classList.add("hidden");
        centerOnHex(btn.dataset.hex);
      });
    });
  }

  function initReference() {
    const overlay = document.getElementById("reference");
    document.getElementById("btn-wonders")?.addEventListener("click", () => openReference("wonders"));
    document.getElementById("btn-players")?.addEventListener("click", () => openReference("players"));
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
      ${onCardFigures(player, cardType)}
      ${manual}
      <div class="cface-foot">
        <span class="cface-dots">${dots}</span>
        <span class="cface-trade">${escapeHtml(Game.FOCUS_TRADE_DESC[cardType])}</span>
      </div>
      ${o.hideSlot ? "" : `<div class="cface-slot">Focus slot ${slot}</div>`}
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
        // The Pentagon lifts the distance entirely, which the engine models as
        // a budget nobody can spend. Saying "99" would just look like a bug.
        const reach = Game.getMilitaryMove(player, state);
        outcome = `Move each army up to <strong>${reach >= 99 ? "any number of" : reach}</strong> spaces. ` +
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
    if (sub.cardType === "growth") { sub.phase = "growth_choice"; refreshWizard(); return; }
    if (sub.cardType === "economy") {
      sub.phase = "move_caravan"; sub.selectedUnit = null;
      // Highlight pickable caravans; Trajan may also launch from any friendly city.
      const starts = Game.unitStartSpaces(state, me, "caravan");
      if (Game.getLeader(me) && me.leaderId === "rome" && me.caravans.some((u) => u.position)) {
        Object.entries(state.map.hexes).forEach(([k, h]) => {
          if (h.city && h.city.ownerId === localPlayerId) starts.add(k);
        });
      }
      sub.validHexes = starts; render(); return;
    }
    if (sub.cardType === "military") {
      sub.phase = "move_army"; sub.selectedUnit = null;
      // Armies still on the military card march out of your capital or a mature
      // city (Terra p10), so those spaces are pickable too.
      sub.validHexes = Game.unitStartSpaces(state, me, "army");
      render(); return;
    }
    if (sub.cardType === "industry") { sub.phase = "industry_choice"; sub.spentResources = {}; refreshWizard(); return; }
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
    refreshWizard();
  }

  async function finishAction() {
    const placedNothing = !sub.placedKeys.length;
    let result = null;
    if (sub.phase === "placing_control" && !placedNothing) {
      result = await dispatch({ type: "PLAY_CULTURE", payload: {
        playerId: localPlayerId, hexKeys: sub.placedKeys.slice(), tradeSpent: sub.tradeSpent
      }});
    }
    if (sub.phase === "reinforcing" && !placedNothing) {
      result = await dispatch({ type: "PLAY_GROWTH_REINFORCE", payload: {
        playerId: localPlayerId, hexKeys: sub.placedKeys.slice(), tradeSpent: sub.tradeSpent
      }});
    }
    // Finishing having placed nothing still spends the card — otherwise a card
    // with nowhere legal to go leaves you owing a turn you cannot take.
    if (placedNothing && sub.cardType) {
      result = await dispatch({ type: "END_FOCUS_CARD", payload: {
        playerId: localPlayerId, cardType: sub.cardType, tradeSpent: 0 } });
    }
    if (result && result.status === "accepted") resetSub();
  }

  function cancelAction() {
    if (state && state.activeCard && state.activeCard.playerId === localPlayerId) {
      // Earlier figures on this card may already have moved. Cancelling only
      // throws away the current, still-local route; "Done with card" is the
      // explicit action that spends and resets the focus card.
      resumeActiveCard();
      return;
    }
    clearSub();
    render();
  }

  function clearSub() {
    sub.phase = "idle"; sub.cardType = null; sub.tradeSpent = 0; sub.remaining = 0;
    sub.totalMarkers = 0; sub.validHexes = new Set(); sub.selectedUnit = null;
    sub.districtType = null; sub.spentResources = {}; sub.placedKeys = [];
    sub.movementState = null; sub.selectedWonder = null; sub.wonderProduction = 0;
    sub.freeFrom = null; sub.attackTargets = null;
  }

  function resumeActiveCard() {
    const active = state && state.activeCard;
    const me = Game.getPlayer(state, localPlayerId);
    if (!active || !me || active.playerId !== localPlayerId ||
        (active.cardType !== "economy" && active.cardType !== "military")) {
      clearSub(); render(); return;
    }
    clearSub();
    sub.cardType = active.cardType;
    sub.tradeSpent = active.tradeSpent || 0;
    const kind = active.cardType === "economy" ? "caravan" : "army";
    sub.phase = kind === "caravan" ? "move_caravan" : "move_army";
    const starts = Game.unitStartSpaces(state, me, kind);
    if (kind === "caravan" && me.leaderId === "rome" && me.caravans.some((u) => u.position)) {
      Object.entries(state.map.hexes).forEach(([k, h]) => {
        if (h.city && h.city.ownerId === localPlayerId) starts.add(k);
      });
    }
    sub.validHexes = starts;
    render();
  }

  function resetSub() {
    clearSub();
    render();
  }

  // ── Hex Click Handler ─────────────────────────────────────

  async function handleHexClick(hexKey) {
    if (!state) return;

    // A choice waiting on a space takes the click before anything else.
    const hexChoice = activeHexChoice();
    if (hexChoice) {
      if (!hexChoice.hexKeys.includes(hexKey)) { showToast("Not one of the highlighted spaces"); return; }
      flashHex(hexKey, "rgb(255,213,79)", 700);
      const resolved = await dispatch({ type: "RESOLVE_PENDING_CHOICE", payload: {
        playerId: localPlayerId, choiceId: hexChoice.id, hexKey } });
      if (!resolved || resolved.status !== "accepted") return;
      // Apadana's edge space is only the start of it — the tile still has to be
      // turned and placed, so hand straight over to the exploring flow.
      if (hexChoice.kind === "apadana_explore") {
        const begun = await dispatch({ type: "BEGIN_EXPLORATION", payload: {
          playerId: localPlayerId, fromKey: hexKey
        }});
        if (!begun || begun.status !== "accepted") return;
        setSubFromPendingExploration(state.pendingExploration);
        render();
      }
      return;
    }

    if (state.phase === "setup") {
      const activeId = state.setup.order[state.setup.turnIndex];
      if (activeId !== localPlayerId) return;

      if (state.setup.phase === "fortress") {
        if (!Game.getValidFortressHexes(state).has(hexKey)) {
          flashHex(hexKey, "rgb(239,83,80)", 400);
          showToast("A fortress needs an inactive space beside at least 2 active spaces");
          return;
        }
        flashHex(hexKey, "rgb(255,213,79)", 600);
        dispatch({ type: "PLACE_FORTRESS", payload: { playerId: localPlayerId, hexKey } });
        return;
      }
      if (state.setup.phase === "tile" || state.setup.phase === "capital_tile" || state.setup.phase === "draft_tile") {
        const playerTiles = setupHand(state, localPlayerId);
        if (playerTiles.length === 0) return;
        const tileId = playerTiles[0];
        // You lay the tile down the way you are holding it. This used to turn
        // it for you — search all six angles, take the first that fits — which
        // meant the board ended up with something you had never seen.
        if (!Game.validateTilePlacement(state, tileId, hexKey, sub.tileRotation).ok) {
          const other = Game.tilePlacementFor(state, tileId, hexKey, sub.tileRotation);
          flashHex(hexKey, "rgb(239,83,80)", 400);
          showToast(other
            ? `Not at this angle \u2014 turn it to ${other.rotation + 1}/6 and it fits here`
            : "The tile will not fit there, at any angle");
          return;
        }
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
      if (!sub.validHexes.has(hexKey)) { showToast("Must be adjacent to one of your cities"); return; }
      flashHex(hexKey, "rgb(102,187,106)", 500);
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      // The offer used to grow outward from each token just placed, with no
      // city-adjacency test — so the board invited a chain the engine refuses
      // (base p8: "on a space adjacent to a friendly city"). The engine dropped
      // those hexes silently but still spent the card and the trade tokens, so
      // every chained click cost a marker that never landed. The legal set is
      // now the engine's own, asked again after each placement so a space that
      // has just been filled drops out.
      sub.validHexes = Game.validControlHexes(state, localPlayerId,
        Game.getSlotValue(me, "culture", state) || 1);
      sub.placedKeys.forEach((k) => sub.validHexes.delete(k));
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
      if (!sub.validHexes.has(hexKey)) { showToast("Needs your own unreinforced control marker there"); return; }
      sub.placedKeys.push(hexKey);
      sub.remaining--;
      sub.validHexes.delete(hexKey);
      flashHex(hexKey, "rgb(255,213,79)", 500);
      if (sub.remaining <= 0) finishDistrictWithReinforcements();
      else render();
      return;
    }
    if (sub.phase === "reinforcing") {
      if (!sub.validHexes.has(hexKey)) { showToast("Needs your own unreinforced control marker there"); return; }
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
          // Base p8: out of the capital or a MATURE city. Rome may use any.
          const onCard = me.caravans.find((u) => !u.position && free(u));
          if (onCard && (me.leaderId === "rome" || h.city.isCapital || h.city.developed)) {
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
        sub.movementState = { unitType: "caravan", unitId: unit.id, maxMove, remaining: maxMove, currentKey: originKey, startKey: originKey, romeStart, explored: false, route: [] };
        sub.selectedUnit = { id: unit.id, position: originKey };
        sub.validHexes = Game.getReachable(state, originKey, maxMove, "caravan", localPlayerId);
        render();
      } else {
        const ms0 = sub.movementState;
        if (ms0 && hexKey === ms0.currentKey) { endMovement(); return; }
        if (!sub.validHexes.has(hexKey)) { showToast(explainUnreachable(hexKey, "caravan", localPlayerId)); return; }
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "caravan", localPlayerId);
        flashHex(hexKey, "rgb(102,187,106)", 400);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        (ms.route = ms.route || []).push(hexKey);
        // Don't stop to ask. Either the move is spent, or the next hex is
        // already clickable — the chip on the board carries the rest.
        if (ms.remaining > 0) continueMovement(); else endMovement();
      }
      return;
    }
    if (sub.phase === "move_army") {
      if (!sub.selectedUnit) {
        const free = (u) => !u.movedThisCard;
        let unit = me.armies.find((u) => u.position === hexKey && free(u));
        let launched = null;
        const ah = state.map.hexes[hexKey];
        if (!unit && ah && ah.city && ah.city.ownerId === localPlayerId &&
            (ah.city.isCapital || ah.city.developed)) {
          // Terra p10: an army on the military card marches out of your capital
          // or a mature city as though it were already standing there.
          const onCard = me.armies.find((u) => !u.position && free(u));
          if (onCard) { unit = onCard; launched = hexKey; }
        }
        if (!unit) return;
        sub.selectedUnit = unit;
        const maxMove = Game.getMilitaryMove(me, state);
        sub.movementState = { unitType: "army", unitId: unit.id, maxMove, remaining: maxMove, currentKey: hexKey, startKey: hexKey, explored: false, route: [] };
        sub.validHexes = Game.getReachable(state, hexKey, maxMove, "army", localPlayerId);
        render();
      } else {
        const ms0 = sub.movementState;
        if (ms0 && hexKey === ms0.currentKey) { endMovement(); return; }
        if (!sub.validHexes.has(hexKey)) { showToast(explainUnreachable(hexKey, "army", localPlayerId)); return; }
        const ms = sub.movementState;
        const dist = computeStepDistance(state, ms.currentKey, hexKey, ms.remaining, "army", localPlayerId);
        flashHex(hexKey, "rgb(239,83,80)", 400);
        ms.remaining -= dist;
        ms.currentKey = hexKey;
        (ms.route = ms.route || []).push(hexKey);
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
      const tileId = exploringTileId();
      // Never swallow a click. This used to return in silence whenever the
      // tile could not be identified, which on a joined client is ALWAYS —
      // tileStack is redacted out of its view, so every click on the board
      // did nothing at all and said nothing about why.
      if (!tileId || !originKey) {
        showToast(state && state.pendingExploration
          ? "That expedition belongs to another player"
          : "No tile has been revealed yet");
        return;
      }
      // Terra p12: it has to reach the space you are exploring from, and the
      // land it covers must be empty. Checked at the angle you set — this used
      // to hunt for an angle that managed it and lay that one instead.
      const fitsHere = (rot) => {
        if (!Game.validateExploration(state, tileId, hexKey, rot).ok) return false;
        const cells = Game.getTileHexKeys(hexKey, rot, state.map.hexes);
        return cells.some((ck) => Game.hexNeighborKeys(Game.parseQ(ck), Game.parseR(ck)).includes(originKey));
      };
      if (!fitsHere(sub.tileRotation)) {
        let other = null;
        for (let i = 1; i < 6; i++) {
          const rot = (sub.tileRotation + i) % 6;
          if (fitsHere(rot)) { other = rot; break; }
        }
        flashHex(hexKey, "rgb(239,83,80)", 400);
        showToast(other !== null
          ? `Not at this angle \u2014 turn it to ${other + 1}/6 and it fits here`
          : "The new land will not reach there, at any angle");
        return;
      }
      // The tile was already revealed by BEGIN_EXPLORATION; this only places it.
      const freeRun = sub.phase === "free_exploring";
      dispatch({ type: "PLACE_EXPLORED_TILE", payload: {
        playerId: localPlayerId, anchorKey: hexKey,
        rotation: sub.tileRotation, side: sub.tileSide }
      }).then((result) => {
        if (!result || result.status !== "accepted") return;  // toast already shown
        // Apadana's expedition costs no movement, because there is nothing moving.
        if (freeRun || !ms) { resetSub(); return; }
        // BEGIN_EXPLORATION already charged the movement point in the engine.
        // Rebuild from the confirmed continuation instead of mutating `ms`:
        // dispatch clones/restores sub while waiting, so that reference is no
        // longer the object the interface renders after the ACK.
        continueFromAuthoritativeExploration();
      });
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

    // Nothing was waiting on the click. A city-state is the one space on the
    // board whose whole point is an effect you cannot see, so clicking it opens
    // the card rather than doing nothing.
    const idleHex = state.map.hexes[hexKey];
    if (idleHex && idleHex.cityState) openReference("citystate", idleHex.cityState.name);
  }

  // ── Gov Picker ────────────────────────────────────────────



  // ── Event Wheel / Log / Focus Row / Game Over ─────────────

  // The printed dial photograph already includes every wedge icon. These
  // vectors are only the fallback for a checkout without the extracted art;
  // emoji gave the dial unrelated skull, sword and triangle symbols.
  const EVENT_HELM =
    `<path d="M12 4.2c-3.4 0-5.8 2.5-5.8 5.9v3.4h11.6V10c0-3.4-2.4-5.8-5.8-5.8z"/>` +
    `<path d="M6.2 10.2C4 9.3 2.5 7.4 2.1 5c2.1.2 3.8 1.5 4.8 3.4zM17.8 10.2c2.2-.9 3.7-2.8 4.1-5.2-2.1.2-3.8 1.5-4.8 3.4z"/>`;
  const svgIcon = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  const EVENT_ICONS = {
    barbarian_move: svgIcon(EVENT_HELM + `<path d="M9.4 15.2h5.2L12 19.8z"/>`),
    barbarian_return: svgIcon(EVENT_HELM +
      `<path d="M12 14.6l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z"/>`),
    district_event: svgIcon(
      `<path d="M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8z" opacity=".3"/>` +
      `<path d="M6.4 17.4V11h2.2v6.4zm3.5 0V8.2h2.2v9.2zm3.5 0V5.4l1.6 2.2 1.6-2.2v12z"/>`),
    gov_change: svgIcon(
      `<path d="M12 2.4l9.4 4.7v1.7H2.6V7.1z"/>` +
      `<path d="M4.9 10.4h2.2v7.9H4.9zm4 0h2.2v7.9H8.9zm4 0h2.2v7.9h-2.2zm4 0h2.2v7.9h-2.2z"/>` +
      `<path d="M2.6 19.9h18.8v1.7H2.6z"/>`),
    wonder_tokens: svgIcon(`<path d="M12 2.6L22 20.4H2z"/><path d="M12 7.6l3.6 6.4H8.4z" opacity=".4"/>`)
  };
  const EVENT_ICON_FALLBACK = svgIcon(`<circle cx="12" cy="12" r="4"/>`);

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
      .map((e) => `<i class="ew-ico k-${e}">${EVENT_ICONS[e] || EVENT_ICON_FALLBACK}</i>`).join("");

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
    const photo = window.CivCardArt ? CivCardArt.eventDial() : "";
    const shape = JSON.stringify(wheel.events);
    if (dom.eventWheel.dataset.shape !== shape) {
      dom.eventWheel.innerHTML = `<h3>Event Dial</h3>
        <div class="ew-dial">
          ${photo ? `<div class="ew-photo" style="background-image:url('${photo}')"></div>` : ""}
          <div class="ew-ring ${photo ? "has-photo" : "no-photo"}">${segs}</div>
          <div class="ew-hand"></div>
          <div class="ew-hub"></div>
        </div>
        <div class="ew-now"></div>
        <div class="ew-next"></div>
        <div class="ew-roll"></div>`;
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
    // The photograph has its own bronze axle. Do not cover it with a second
    // symbol; the lit wedge and the text beneath it identify the active event.
    const hub = dom.eventWheel.querySelector(".ew-hub");
    hub.classList.toggle("has-photo", !!photo);
    hub.classList.toggle("no-photo", !photo);
    hub.innerHTML = photo ? "" : glyphs(now);
    dom.eventWheel.querySelector(".ew-now").textContent = name(now) || "Nothing this round";
    dom.eventWheel.querySelector(".ew-next").textContent = `Next: ${name(next) || "nothing"}`;
    // Only the host throws the barbarian die, so without this the other seats
    // see the raid but never the roll that caused it. The arrow points the way
    // they actually went: face 1 is the 1-o'clock edge and the rest follow
    // clockwise, so the bearing is (face - 1) * 60 from north-east.
    const march = state.barbarianMove;
    const rollEl = dom.eventWheel.querySelector(".ew-roll");
    if (march && march.roll) {
      const bearing = (march.roll - 1) * 60 + 30;   // 0deg = north on the arrow
      rollEl.innerHTML = `<span class="ew-die">${march.roll}</span>` +
        `<span class="ew-arrow" style="--a:${bearing}deg">↑</span>` +
        `<span>barbarians marched ${escapeHtml(march.label || "")}</span>`;
      rollEl.hidden = false;
    } else {
      rollEl.hidden = true;
      rollEl.textContent = "";
    }

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
    const logEntries = (state.log || []).slice(-15).map((msg) => ({
      html: `<div class="log-entry${logClass(msg)}">${escapeHtml(msg)}</div>`, ts: 0
    }));
    const chatEntries = chatHistory.slice(-10).map((m) => ({
      html: `<div class="chat-msg"><span class="chat-name" style="color:${getPlayerColor(m.sender)}">${escapeHtml(m.name)}:</span>${escapeHtml(m.text)}</div>`,
      ts: m.ts
    }));
    const all = [...logEntries, ...chatEntries];
    dom.gameLog.innerHTML = `<h3>Game Log</h3>` + all.map((e) => e.html).join("");
    dom.gameLog.scrollTop = dom.gameLog.scrollHeight;
  }

  function getPlayerColor(playerId) {
    if (!state) return "var(--text)";
    const p = state.players.find((pl) => pl.id === playerId);
    return p ? safeColor(p.color) : "var(--text)";
  }

  let prevFocusOrder = [];

  function renderFocusRow() {
    if (!state || state.phase !== "playing") return;
    const me = Game.getPlayer(state, localPlayerId);
    if (!me) { dom.focusRow.innerHTML = ""; return; }
    const cp = Game.currentPlayer(state);
    const isMyTurn = cp && cp.id === localPlayerId;
    // A card is also unplayable while one is still being resolved. After an
    // attack the row used to light up again: PLAY_MILITARY_ATTACK opens combat
    // without setting activeCard, so nextUnitOrFinish saw no active card, reset
    // to idle, and cardPlayed was still false because armies waiting on the
    // card kept unitsLeftToMove above zero. Picking a different card then
    // vanished silently, because the engine drops any PLAY_ that does not match
    // the card in progress.
    const resolving = !!(state.combat || state.lastCombat ||
      (state.activeCard && state.activeCard.playerId === localPlayerId) ||
      state.pendingExploration || state.movementContinuation ||
      (state.pendingChoices && state.pendingChoices.length) || state.pendingBarbReward);
    const canPlay = isMyTurn && !me.cardPlayed && sub.phase === "idle" && !resolving;
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
      const govtArt = govt && window.CivCardArt ? CivCardArt.gov(cardType) : "";
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
          ${govt ? `<span class="fc-gov-token" title="${escapeHtml(govt.name)}: resolves ${govt.shift} places farther right">
            ${govtArt ? `<img src="${escapeHtml(govtArt)}" alt="" draggable="false">` : `<span class="fc-gov-name">${escapeHtml(govt.name)}</span>`}
            <span class="fc-gov-shift">+${govt.shift} places</span>
          </span>` : ""}
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
        ${onCardFigures(me, cardType)}
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
        dom.mapTooltip.innerHTML = renderCardFace(me, cardType, { hideSlot: true });
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
          refreshWizard();
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
        `<div><span class="dot" style="background:${safeColor(p.color)};display:inline-block;width:8px;height:8px;border-radius:50%"></span> ${escapeHtml(p.name)}: ${Game.computeScore(state, p.id)} pts</div>`
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
