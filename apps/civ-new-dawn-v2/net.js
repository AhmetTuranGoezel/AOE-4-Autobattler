"use strict";

/*
 * PeerJS is the transport, not the identity layer. A browser may get a new
 * PeerJS id after a reload while its game seat remains the same. Every
 * connection is therefore authenticated with stable game/seat credentials.
 *
 * This module has no dependency on Game or the UI. The host's async onAction
 * callback is the transaction boundary: validate, checkpoint remotely and
 * locally, then return accepted. Only then does Net publish the revision.
 */

const CIV_NET_PROTOCOL_VERSION = 2;

function createCivNet(dependencies) {
  const deps = dependencies || {};
  const root = deps.global || (typeof globalThis !== "undefined" ? globalThis : {});
  const clock = deps.clock || {
    now: () => Date.now(),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (id) => clearInterval(id)
  };
  const random = deps.random || Math.random;
  const reconnectDelays = deps.reconnectDelays || [1000, 2000, 4000, 8000, 15000];
  const pingIntervalMs = deps.pingIntervalMs || 10000;
  const connectionTimeoutMs = deps.connectionTimeoutMs || 35000;
  const presenceIntervalMs = deps.presenceIntervalMs || 100;
  const maxBufferedBytes = deps.maxBufferedBytes || 256 * 1024;

  let callbacks = normalizeCallbacks({});
  let peer = null;
  let role = "idle";
  let localPeerId = null;
  let credentials = null;
  let clientConnection = null;
  let connectingConnection = null;
  let hostConnections = new Map();
  let knownSeatTokens = new Map();
  let roster = new Map();
  let revision = 0;
  let lastSnapshotRevision = -1;
  let lastBroadcastState;
  let pendingAction = null;
  let processedActions = new Map();
  let hostActionQueue = Promise.resolve();
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let heartbeatTimer = null;
  let browserListenersInstalled = false;
  let lifecycleGeneration = 0;
  let initialOpenCallback = null;
  let initialOpenCalled = false;
  let lastPresenceSentAt = 0;
  let clientLastSeen = 0;
  let onlineOverride = null;
  let status = makeStatus("idle");

  function normalizeCallbacks(value) {
    const cb = value || {};
    return {
      onAction: typeof cb.onAction === "function" ? cb.onAction : null,
      onAuthenticate: typeof cb.onAuthenticate === "function" ? cb.onAuthenticate : null,
      getStateView: typeof cb.getStateView === "function" ? cb.getStateView : null,
      projectState: typeof cb.projectState === "function" ? cb.projectState : null,
      onState: typeof cb.onState === "function" ? cb.onState : (() => {}),
      onJoin: typeof cb.onJoin === "function" ? cb.onJoin : (() => {}),
      onDisconnect: typeof cb.onDisconnect === "function" ? cb.onDisconnect : (() => {}),
      onConnected: typeof cb.onConnected === "function" ? cb.onConnected : (() => {}),
      onChat: typeof cb.onChat === "function" ? cb.onChat : (() => {}),
      onPresence: typeof cb.onPresence === "function" ? cb.onPresence : (() => {}),
      onStatus: typeof cb.onStatus === "function" ? cb.onStatus : (() => {}),
      onRoster: typeof cb.onRoster === "function" ? cb.onRoster : (() => {}),
      onActionResult: typeof cb.onActionResult === "function" ? cb.onActionResult : (() => {}),
      onProtocolError: typeof cb.onProtocolError === "function" ? cb.onProtocolError : (() => {})
    };
  }

  function makeStatus(phase, patch) {
    return Object.assign({
      phase,
      connected: phase === "synced" || phase === "confirming" || phase === "local",
      isHost: role === "host" || role === "local",
      gameId: credentials && credentials.gameId || null,
      seatId: credentials && credentials.seatId || null,
      revision,
      pendingActionId: pendingAction && pendingAction.envelope.actionId || null,
      reconnectAttempt,
      lastError: null,
      allSeatsOnline: areAllSeatsOnline()
    }, patch || {});
  }

  function updateStatus(phase, patch) {
    status = makeStatus(phase, Object.assign({}, status, patch || {}, { phase }));
    status.connected = phase === "synced" || phase === "confirming" || phase === "local";
    status.isHost = role === "host" || role === "local";
    status.gameId = credentials && credentials.gameId || null;
    status.seatId = credentials && credentials.seatId || null;
    status.revision = revision;
    status.pendingActionId = pendingAction && pendingAction.envelope.actionId || null;
    status.reconnectAttempt = reconnectAttempt;
    status.allSeatsOnline = areAllSeatsOnline();
    try { callbacks.onStatus(Object.assign({}, status)); } catch (error) { reportCallbackError(error); }
  }

  function reportCallbackError(error) {
    if (typeof console !== "undefined" && console.error) console.error("Civ multiplayer callback failed:", error);
  }

  function init(value) {
    callbacks = normalizeCallbacks(value);
    installBrowserListeners();
    updateStatus(status.phase);
  }

  function peerConstructor() { return deps.Peer || root.Peer; }

  function isOnline() {
    if (onlineOverride !== null) return onlineOverride;
    if (deps.isOnline) return !!deps.isOnline();
    return !root.navigator || root.navigator.onLine !== false;
  }

  function installBrowserListeners() {
    if (browserListenersInstalled || !root.addEventListener) return;
    root.addEventListener("online", handleBrowserOnline);
    root.addEventListener("offline", handleBrowserOffline);
    browserListenersInstalled = true;
  }

  function removeBrowserListeners() {
    if (!browserListenersInstalled || !root.removeEventListener) return;
    root.removeEventListener("online", handleBrowserOnline);
    root.removeEventListener("offline", handleBrowserOffline);
    browserListenersInstalled = false;
  }

  function handleBrowserOffline() {
    onlineOverride = false;
    clearReconnectTimer();
    if (role === "client" || role === "host") updateStatus("offline", { lastError: "browser_offline" });
  }

  function handleBrowserOnline() {
    onlineOverride = true;
    if (role === "client" || role === "host") retryNow();
  }

  function randomHex(byteLength) {
    const bytes = new Uint8Array(byteLength);
    const cryptoObject = deps.crypto || root.crypto;
    if (cryptoObject && typeof cryptoObject.getRandomValues === "function") cryptoObject.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function newToken() { return randomHex(16); }
  function newSeatId() { return `seat-${randomHex(8)}`; }
  function newActionId() { return `action-${randomHex(16)}`; }

  function normalizeRevision(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : (fallback || 0);
  }

  function normalizeProfile(value, fallbackName, fallbackColor) {
    const source = isPlainObject(value) ? value : {};
    return {
      name: String(source.name || fallbackName || "Player").slice(0, 100),
      color: String(source.color || fallbackColor || "").slice(0, 40)
    };
  }

  function normalizeSeatTokens(value) {
    const result = new Map();
    if (value instanceof Map) value.forEach((token, seatId) => result.set(String(seatId), String(token)));
    else if (Array.isArray(value)) value.forEach((seat) => {
      if (seat && seat.seatId && seat.seatToken) result.set(String(seat.seatId), String(seat.seatToken));
    });
    else if (isPlainObject(value)) Object.keys(value).forEach((seatId) => result.set(String(seatId), String(value[seatId])));
    return result;
  }

  function normalizeHostOptions(value, legacy) {
    const options = isPlainObject(value) ? value : {};
    const seatId = String(options.seatId || "host");
    return {
      role: "host",
      gameId: options.gameId ? String(options.gameId) : null,
      seatId,
      seatToken: String(options.seatToken || newToken()),
      hostPeerId: options.hostPeerId || options.peerId || null,
      peerId: options.peerId || options.hostPeerId || null,
      peerOptions: options.peerOptions || null,
      revision: normalizeRevision(options.revision, 0),
      profile: normalizeProfile(options.profile, "Host", ""),
      seatTokens: options.seatTokens || null,
      roster: options.roster || null,
      legacy: !!legacy
    };
  }

  function normalizeClientOptions(codeOrOptions, name, color) {
    const options = isPlainObject(codeOrOptions) ? codeOrOptions : {
      hostPeerId: codeOrOptions, gameId: codeOrOptions, profile: { name, color }
    };
    const hostPeerId = String(options.hostPeerId || options.roomCode || "");
    return {
      role: "client",
      gameId: String(options.gameId || hostPeerId),
      seatId: String(options.seatId || newSeatId()),
      seatToken: String(options.seatToken || newToken()),
      hostPeerId,
      peerId: options.peerId || null,
      peerOptions: options.peerOptions || null,
      revision: normalizeRevision(options.lastRevision != null ? options.lastRevision : options.revision, 0),
      profile: normalizeProfile(options.profile, name, color)
    };
  }

  function resetTransport(nextRole) {
    cancelPendingAction("session_replaced");
    lifecycleGeneration++;
    clearReconnectTimer();
    stopHeartbeat();
    closeAllConnections();
    if (peer && !peer.destroyed && typeof peer.destroy === "function") {
      try { peer.destroy(); } catch (error) { /* already gone */ }
    }
    peer = null;
    localPeerId = null;
    role = nextRole || "idle";
    reconnectAttempt = 0;
    processedActions = new Map();
    hostActionQueue = Promise.resolve();
    initialOpenCalled = false;
  }

  function makePeer(options, generation) {
    const PeerConstructor = peerConstructor();
    if (typeof PeerConstructor !== "function") {
      updateStatus("offline", { lastError: "peerjs_unavailable" });
      return null;
    }
    const instance = options.peerId
      ? new PeerConstructor(options.peerId, options.peerOptions || undefined)
      : new PeerConstructor(options.peerOptions || undefined);
    instance.on("open", (id) => {
      if (generation === lifecycleGeneration) handlePeerOpen(String(id));
    });
    instance.on("connection", (connection) => {
      if (generation === lifecycleGeneration && role === "host") attachHostConnection(connection, generation);
    });
    instance.on("disconnected", () => {
      if (generation === lifecycleGeneration) scheduleReconnect("peer_disconnected");
    });
    instance.on("close", () => {
      if (generation === lifecycleGeneration && role !== "idle" && role !== "closed") scheduleReconnect("peer_closed");
    });
    instance.on("error", (error) => {
      if (generation !== lifecycleGeneration) return;
      scheduleReconnect(String(error && (error.type || error.message) || "peer_error"));
    });
    return instance;
  }

  function createRoom(optionsOrCallback, maybeCallback) {
    const legacy = typeof optionsOrCallback === "function" || optionsOrCallback == null;
    const options = normalizeHostOptions(legacy ? {} : optionsOrCallback, legacy);
    const callback = legacy ? optionsOrCallback : maybeCallback;
    resetTransport("host");
    installBrowserListeners();
    credentials = options;
    revision = options.revision;
    lastSnapshotRevision = revision;
    initialOpenCallback = typeof callback === "function" ? callback : null;
    knownSeatTokens = normalizeSeatTokens(options.seatTokens);
    knownSeatTokens.set(options.seatId, options.seatToken);
    roster = new Map();
    importRoster(options.roster);
    upsertRoster(options.seatId, Object.assign({}, options.profile, { status: "online", lastSeen: clock.now(), role: "host" }));
    updateStatus("connecting", { lastError: null });
    peer = makePeer(options, lifecycleGeneration);
    return getCredentials();
  }

  function joinRoom(codeOrOptions, nameOrCallback, color, legacyCallback) {
    const modern = isPlainObject(codeOrOptions);
    const options = normalizeClientOptions(codeOrOptions, modern ? null : nameOrCallback, modern ? null : color);
    const callback = modern ? (typeof nameOrCallback === "function" ? nameOrCallback : null) : legacyCallback;
    if (!options.hostPeerId) {
      updateStatus("offline", { lastError: "missing_host_peer_id" });
      return null;
    }
    resetTransport("client");
    installBrowserListeners();
    credentials = options;
    revision = options.revision;
    lastSnapshotRevision = revision - 1;
    initialOpenCallback = typeof callback === "function" ? callback : null;
    updateStatus("connecting", { lastError: null });
    peer = makePeer(options, lifecycleGeneration);
    return getCredentials();
  }

  function resumeSession(value, callback) {
    if (!isPlainObject(value)) throw new Error("Session credentials are required.");
    if (value.role === "host" || value.isHost === true) return createRoom(value, callback);
    return joinRoom(value, callback);
  }

  function startLocal(options) {
    resetTransport("local");
    credentials = Object.assign({
      role: "local", gameId: "local", seatId: "local", seatToken: newToken(),
      hostPeerId: null, revision: 0, profile: { name: "Player", color: "" }
    }, isPlainObject(options) ? options : {});
    revision = normalizeRevision(credentials.revision, 0);
    localPeerId = "local";
    roster = new Map();
    upsertRoster(credentials.seatId, Object.assign({}, credentials.profile, { status: "online", role: "host" }));
    updateStatus("local", { lastError: null });
    return getCredentials();
  }

  function handlePeerOpen(id) {
    localPeerId = id;
    clearReconnectTimer();
    reconnectAttempt = 0;
    if (role === "host") {
      if (!credentials.hostPeerId) credentials.hostPeerId = id;
      if (!credentials.gameId) credentials.gameId = id;
      if (credentials.legacy && credentials.seatId === "host" && !initialOpenCalled) {
        knownSeatTokens.delete(credentials.seatId);
        credentials.seatId = id;
        knownSeatTokens.set(id, credentials.seatToken);
        const hostSeat = Array.from(roster.values()).find((seat) => seat.role === "host");
        roster.clear();
        upsertRoster(id, Object.assign({}, hostSeat || credentials.profile, { status: "online", role: "host" }));
      }
      startHeartbeat();
      updateStatus("synced", { lastError: null });
      const resumed = initialOpenCalled;
      callInitialOpen(id);
      callbacks.onConnected(credentials.seatId, { role: "host", peerId: id, resumed });
    } else if (role === "client") {
      if (clientConnection && clientConnection.open) {
        startHeartbeat();
        updateStatus(pendingAction ? "confirming" : "synced", { lastError: null });
        resendPendingAction();
        return;
      }
      updateStatus("connecting", { lastError: null });
      connectToHost();
    }
  }

  function callInitialOpen(peerId) {
    if (initialOpenCalled) return;
    initialOpenCalled = true;
    if (!initialOpenCallback) return;
    const callback = initialOpenCallback;
    initialOpenCallback = null;
    try { callback(role === "host" ? peerId : credentials.seatId, getCredentials()); }
    catch (error) { reportCallbackError(error); }
  }

  function connectToHost() {
    if (role !== "client" || !peer || !credentials || !credentials.hostPeerId) return;
    if (!isOnline()) {
      updateStatus("offline", { lastError: "browser_offline" });
      return;
    }
    if ((clientConnection && clientConnection.open) || connectingConnection) return;
    let connection;
    try { connection = peer.connect(credentials.hostPeerId, { reliable: true, serialization: "json" }); }
    catch (error) { scheduleReconnect(error && error.message || "connect_failed"); return; }
    connectingConnection = connection;
    attachClientConnection(connection, lifecycleGeneration);
  }

  function attachClientConnection(connection, generation) {
    connection.on("open", () => {
      if (generation !== lifecycleGeneration) return;
      connectingConnection = null;
      clientConnection = connection;
      clientLastSeen = clock.now();
      reconnectAttempt = 0;
      updateStatus("handshaking", { lastError: null });
      safeSend(connection, {
        type: "hello", protocolVersion: CIV_NET_PROTOCOL_VERSION,
        gameId: credentials.gameId, seatId: credentials.seatId,
        seatToken: credentials.seatToken, lastRevision: revision,
        profile: credentials.profile
      });
    });
    connection.on("data", (message) => {
      if (generation === lifecycleGeneration && connection === clientConnection) handleClientMessage(message);
    });
    connection.on("error", (error) => {
      if (generation !== lifecycleGeneration) return;
      if (connection === connectingConnection) connectingConnection = null;
      if (connection === clientConnection) clientConnection = null;
      try { connection.close(); } catch (closeError) { /* ignored */ }
      scheduleReconnect(error && (error.type || error.message) || "connection_error");
    });
    connection.on("close", () => {
      if (generation !== lifecycleGeneration) return;
      if (connection === connectingConnection) connectingConnection = null;
      if (connection === clientConnection) clientConnection = null;
      stopHeartbeat();
      scheduleReconnect("connection_closed");
    });
  }

  function attachHostConnection(connection, generation) {
    const meta = {
      connection, peerId: String(connection.peer || ""), authenticated: false,
      authenticating: false, ready: false,
      seatId: null, profile: { name: "Player", color: "" },
      lastSeen: clock.now(), lastPresenceAt: 0
    };
    hostConnections.set(connection, meta);
    connection.on("data", (message) => {
      if (generation !== lifecycleGeneration || !hostConnections.has(connection)) return;
      meta.lastSeen = clock.now();
      handleHostMessage(meta, message);
    });
    connection.on("error", (error) => {
      if (generation === lifecycleGeneration) closeHostConnection(meta, error && (error.type || error.message) || "connection_error");
    });
    connection.on("close", () => {
      if (generation === lifecycleGeneration) closeHostConnection(meta, "connection_closed");
    });
  }

  function handleHostMessage(meta, message) {
    if (!isPlainObject(message) || typeof message.type !== "string") {
      sendProtocolError(meta.connection, "invalid_message", "Malformed multiplayer message.");
      return;
    }
    if (message.type === "hello") {
      if (meta.authenticated || meta.authenticating) return;
      meta.authenticating = true;
      hostActionQueue = hostActionQueue
        .then(() => authenticateConnection(meta, message))
        .catch(reportCallbackError);
      return;
    }
    if (!meta.authenticated) {
      sendProtocolError(meta.connection, "not_authenticated", "Complete the seat handshake first.");
      return;
    }
    if (!meta.ready) {
      sendProtocolError(meta.connection, "handshake_pending", "The host is still securing this seat.");
      return;
    }
    if (message.type === "action") {
      hostActionQueue = hostActionQueue.then(() => processRemoteAction(meta, message)).catch(reportCallbackError);
    } else if (message.type === "ping") {
      safeSend(meta.connection, { type: "pong", at: message.at, serverAt: clock.now() });
    } else if (message.type === "pong") {
      markSeatSeen(meta);
    } else if (message.type === "chat") {
      handleInboundChat(meta, message.payload);
    } else if (message.type === "presence") {
      handleInboundPresence(meta, message.payload);
    } else sendProtocolError(meta.connection, "unknown_message", "Unsupported multiplayer message.");
  }

  async function authenticateConnection(meta, hello) {
    const authenticationGeneration = lifecycleGeneration;
    if (meta.authenticated) return;
    if (hello.protocolVersion !== CIV_NET_PROTOCOL_VERSION) {
      rejectHandshake(meta, "protocol_mismatch", `This room requires multiplayer protocol ${CIV_NET_PROTOCOL_VERSION}.`); return;
    }
    if (String(hello.gameId || "") !== String(credentials.gameId || "")) {
      rejectHandshake(meta, "wrong_game", "These credentials belong to another game."); return;
    }
    const requestedSeatId = String(hello.seatId || "");
    const requestedToken = String(hello.seatToken || "");
    if (!requestedSeatId || !requestedToken) {
      rejectHandshake(meta, "missing_credentials", "Seat credentials are required."); return;
    }
    const profile = normalizeProfile(hello.profile);
    let authResult = null;
    if (callbacks.onAuthenticate) {
      try {
        authResult = await callbacks.onAuthenticate({
          protocolVersion: hello.protocolVersion, gameId: String(hello.gameId),
          seatId: requestedSeatId, seatToken: requestedToken,
          lastRevision: normalizeRevision(hello.lastRevision, 0), profile
        }, { peerId: meta.peerId, connection: meta.connection });
        if (authenticationGeneration !== lifecycleGeneration || !hostConnections.has(meta.connection)) return;
      } catch (error) {
        rejectHandshake(meta, "authentication_failed", error && error.message || "Seat authentication failed."); return;
      }
      if (authResult && authResult.accepted === false) {
        rejectHandshake(meta, authResult.code || "authentication_failed", authResult.message || "Seat authentication failed."); return;
      }
    }
    const seatId = String(authResult && authResult.seatId || requestedSeatId);
    const storedToken = knownSeatTokens.get(seatId);
    if (storedToken && !tokensEqual(storedToken, requestedToken)) {
      rejectHandshake(meta, "invalid_seat_token", "This seat is already bound to different credentials."); return;
    }
    const externallyAuthenticated = authResult === true || !!(authResult && authResult.accepted === true);
    if (!storedToken && roster.has(seatId) && !externallyAuthenticated) {
      rejectHandshake(meta, "seat_verification_required", "The host cannot verify this existing seat."); return;
    }
    const isNewSeat = authResult && authResult.isNewSeat === true
      ? true
      : !(authResult && authResult.existing === true) && !storedToken && !roster.has(seatId);
    if (!storedToken) knownSeatTokens.set(seatId, requestedToken);

    hostConnections.forEach((otherMeta, otherConnection) => {
      if (otherMeta !== meta && otherMeta.authenticated && otherMeta.seatId === seatId) {
        hostConnections.delete(otherConnection);
        try { otherConnection.close(); } catch (error) { /* already closed */ }
      }
    });
    meta.authenticated = true;
    meta.seatId = seatId;
    meta.profile = profile;
    meta.lastSeen = clock.now();
    if (isNewSeat) {
      try {
        // onJoin is intentionally awaited: ADD_PLAYER and its durable
        // checkpoint must finish before this seat receives welcome/snapshot.
        const joinOutcome = await callbacks.onJoin(seatId, profile.name, profile.color, {
          seatId, seatToken: requestedToken, profile: Object.assign({}, profile),
          peerId: meta.peerId, connection: meta.connection
        });
        if (authenticationGeneration !== lifecycleGeneration || !hostConnections.has(meta.connection)) return;
        if (joinOutcome && joinOutcome.accepted === false) {
          throw new Error(joinOutcome.message || "The host rejected this seat.");
        }
        if (joinOutcome && joinOutcome.revision != null) setRevision(joinOutcome.revision);
        if (joinOutcome && Object.prototype.hasOwnProperty.call(joinOutcome, "state")) {
          lastBroadcastState = joinOutcome.state;
        }
      } catch (error) {
        knownSeatTokens.delete(seatId);
        meta.authenticated = false;
        meta.authenticating = false;
        meta.seatId = null;
        roster.delete(seatId);
        emitRoster();
        rejectHandshake(meta, "join_rejected", error && error.message || "The host rejected this seat."); return;
      }
    }
    meta.authenticating = false;
    meta.ready = true;
    upsertRoster(seatId, Object.assign({}, profile, { status: "online", lastSeen: meta.lastSeen, peerId: meta.peerId, role: "player" }));
    emitRoster();
    safeSend(meta.connection, {
      type: "welcome", protocolVersion: CIV_NET_PROTOCOL_VERSION,
      gameId: credentials.gameId, seatId, revision,
      stateView: buildStateView(seatId), roster: getRoster()
    });
    callbacks.onConnected(seatId, { role: "player", peerId: meta.peerId, resumed: !isNewSeat });
    sendSnapshot(meta.connection, seatId, revision);
  }

  function rejectHandshake(meta, code, message) {
    meta.authenticating = false;
    meta.ready = false;
    safeSend(meta.connection, { type: "protocolError", code, message });
    callbacks.onProtocolError({ code, message, peerId: meta.peerId });
    // Give the reliable channel one event-loop turn to deliver the concrete
    // rejection reason before closing it. Immediate close can discard the
    // final frame in several WebRTC implementations.
    clock.setTimeout(() => {
      try { meta.connection.close(); } catch (error) { /* ignored */ }
    }, 0);
  }

  function handleClientMessage(message) {
    if (!isPlainObject(message) || typeof message.type !== "string") return;
    clientLastSeen = clock.now();
    if (message.type === "welcome") {
      if (message.protocolVersion !== CIV_NET_PROTOCOL_VERSION || String(message.gameId || "") !== credentials.gameId) {
        updateStatus("protocol_error", { lastError: "protocol_mismatch" }); return;
      }
      if (message.seatId && String(message.seatId) !== credentials.seatId) credentials.seatId = String(message.seatId);
      clearReconnectTimer();
      reconnectAttempt = 0;
      applyRoster(message.roster);
      applyIncomingState(message.stateView, message.revision, "welcome", true);
      startHeartbeat();
      updateStatus(pendingAction ? "confirming" : "synced", { lastError: null });
      const resumed = initialOpenCalled;
      callInitialOpen(localPeerId);
      callbacks.onConnected(credentials.seatId, { role: "client", peerId: credentials.hostPeerId, resumed });
      resendPendingAction();
    } else if (message.type === "snapshot") {
      if (String(message.gameId || "") !== credentials.gameId) return;
      applyIncomingState(message.stateView, message.revision, "snapshot", false);
      applyRoster(message.roster);
    } else if (message.type === "actionResult") handleActionResult(message);
    else if (message.type === "ping") safeSend(clientConnection, { type: "pong", at: message.at, clientAt: clock.now() });
    else if (message.type === "chat") callbacks.onChat(message.payload);
    else if (message.type === "presence") callbacks.onPresence(message.payload);
    else if (message.type === "roster") applyRoster(message.roster);
    else if (message.type === "protocolError") {
      callbacks.onProtocolError({ code: message.code, message: message.message });
      updateStatus("protocol_error", { lastError: message.code || "protocol_error" });
    }
  }

  function applyIncomingState(stateView, incomingRevision, source, allowEqual) {
    const nextRevision = normalizeRevision(incomingRevision, -1);
    if (nextRevision < revision || nextRevision < lastSnapshotRevision) return false;
    if (!allowEqual && nextRevision === lastSnapshotRevision) return false;
    revision = nextRevision;
    lastSnapshotRevision = nextRevision;
    if (stateView !== undefined) callbacks.onState(stateView, { revision: nextRevision, source });
    updateStatus(pendingAction ? "confirming" : "synced", { lastError: null });
    return true;
  }

  function sanitizeRemoteAction(action, actorId) {
    const clean = cloneJson(action);
    if (!isPlainObject(clean)) return null;
    delete clean.playerId;
    delete clean.hostOverride;
    delete clean.actorId;
    delete clean.seatId;
    if (isPlainObject(clean.payload)) {
      delete clean.payload.hostOverride;
      delete clean.payload.actorId;
      delete clean.payload.seatId;
      clean.payload.playerId = actorId;
    }
    return clean;
  }

  async function processRemoteAction(meta, message) {
    const actionGeneration = lifecycleGeneration;
    if (String(message.gameId || "") !== credentials.gameId) {
      sendActionResult(meta.connection, {
        actionId: String(message.actionId || ""), status: "rejected", revision,
        code: "wrong_game", message: "This action belongs to another game."
      }); return;
    }
    const actionId = String(message.actionId || "");
    if (!actionId || actionId.length > 100) {
      sendActionResult(meta.connection, { actionId, status: "rejected", revision,
        code: "invalid_action_id", message: "A valid action id is required." }); return;
    }
    if (jsonSize(message.action) > 256 * 1024) {
      const tooLarge = { actionId, status: "rejected", revision,
        code: "action_too_large", message: "The action exceeds the multiplayer size limit." };
      rememberProcessedAction(actionId, tooLarge);
      sendActionResult(meta.connection, tooLarge); return;
    }
    if (processedActions.has(actionId)) {
      const cached = processedActions.get(actionId);
      if (cached.status === "accepted") sendSnapshot(meta.connection, meta.seatId, revision);
      sendActionResult(meta.connection, cached); return;
    }
    const baseRevision = normalizeRevision(message.baseRevision, -1);
    if (baseRevision !== revision) {
      const stale = { actionId, status: "rejected", revision,
        code: "stale_revision", message: "The game advanced; the current state has been restored." };
      rememberProcessedAction(actionId, stale);
      sendSnapshot(meta.connection, meta.seatId, revision);
      sendActionResult(meta.connection, stale); return;
    }
    const action = sanitizeRemoteAction(message.action, meta.seatId);
    if (!action || typeof action.type !== "string") {
      const invalid = { actionId, status: "rejected", revision,
        code: "invalid_action", message: "Malformed game action." };
      rememberProcessedAction(actionId, invalid);
      sendActionResult(meta.connection, invalid); return;
    }
    upsertRoster(meta.seatId, { activeAction: action.type, lastSeen: clock.now(), status: "online" });
    emitRoster();
    let outcome;
    try {
      const context = {
        actorId: meta.seatId,
        role: "player",
        actionId,
        baseRevision,
        connection: meta.connection,
        processedActionIds: getProcessedActionIds(),
        nextProcessedActionIds: processedIdsIncluding(actionId)
      };
      outcome = callbacks.onAction ? await callbacks.onAction(action, context) : await callbacks.onState(action, context);
      if (actionGeneration !== lifecycleGeneration || !hostConnections.has(meta.connection)) return;
    } catch (error) {
      outcome = { accepted: false, code: "action_failed", message: error && error.message || "The action could not be completed." };
    }
    upsertRoster(meta.seatId, { activeAction: null, lastSeen: clock.now(), status: "online" });
    emitRoster();
    const result = normalizeActionOutcome(outcome, actionId, baseRevision);
    rememberProcessedAction(actionId, result);
    if (result.status === "accepted") {
      if (outcome && Object.prototype.hasOwnProperty.call(outcome, "state")) lastBroadcastState = outcome.state;
      broadcastSnapshots(outcome && outcome.state);
    }
    // Reliable DataConnection ordering guarantees snapshot before ACK.
    sendActionResult(meta.connection, result);
  }

  function normalizeActionOutcome(outcome, actionId, baseRevision) {
    const value = isPlainObject(outcome) ? outcome : {};
    const accepted = outcome === undefined || value.accepted === true || value.status === "accepted";
    if (!accepted) return {
      actionId, status: "rejected", revision,
      code: String(value.code || "action_rejected"),
      message: String(value.message || "The host rejected this action.").slice(0, 300)
    };
    const explicitRevision = Number(value.revision);
    if (Number.isSafeInteger(explicitRevision) && explicitRevision > baseRevision) {
      // The durable checkpoint callback may call Net.setRevision(N+1) before
      // returning the same explicit revision. That revision is already
      // committed and must never be advanced a second time here.
      revision = Math.max(revision, explicitRevision);
    } else if (revision <= baseRevision) {
      revision = baseRevision + 1;
    }
    return { actionId, status: "accepted", revision,
      code: String(value.code || "ok"), message: String(value.message || "").slice(0, 300) };
  }

  function rememberProcessedAction(actionId, result) {
    if (processedActions.has(actionId)) processedActions.delete(actionId);
    processedActions.set(actionId, Object.assign({}, result));
    while (processedActions.size > 512) processedActions.delete(processedActions.keys().next().value);
  }

  function sendActionResult(connection, result) {
    safeSend(connection, Object.assign({ type: "actionResult" }, result));
  }

  function handleActionResult(message) {
    if (!pendingAction || String(message.actionId || "") !== pendingAction.envelope.actionId) return;
    const result = {
      actionId: pendingAction.envelope.actionId,
      status: message.status === "accepted" ? "accepted" : "rejected",
      revision: normalizeRevision(message.revision, revision),
      code: String(message.code || (message.status === "accepted" ? "ok" : "action_rejected")),
      message: String(message.message || "")
    };
    revision = Math.max(revision, result.revision);
    const resolve = pendingAction.resolve;
    pendingAction = null;
    try { callbacks.onActionResult(result); } catch (error) { reportCallbackError(error); }
    updateStatus(clientConnection && clientConnection.open ? "synced" : "reconnecting", {
      lastError: result.status === "accepted" ? null : result.code
    });
    resolve(result);
  }

  function submitAction(action) {
    if (!isPlainObject(action) || typeof action.type !== "string") return Promise.resolve({
      status: "rejected", revision, code: "invalid_action", message: "Malformed game action."
    });
    if (pendingAction) return Promise.resolve({
      status: "rejected", revision, code: "action_in_flight", message: "Wait for the previous action to be confirmed."
    });
    const envelope = { type: "action", gameId: credentials && credentials.gameId,
      actionId: newActionId(), baseRevision: revision, action: cloneJson(action) };
    if (role === "host" || role === "local") return submitHostAction(envelope);
    if (role !== "client" || !credentials) return Promise.resolve({
      status: "rejected", revision, code: "not_connected", message: "No multiplayer session is open."
    });
    return new Promise((resolve) => {
      pendingAction = { envelope, resolve, sent: false };
      updateStatus(clientConnection && clientConnection.open ? "confirming" : "reconnecting", { lastError: null });
      resendPendingAction();
    });
  }

  function submitHostAction(envelope) {
    if (!callbacks.onAction) return Promise.resolve({
      status: "rejected", revision, code: "missing_action_handler", message: "No host action handler is installed."
    });
    if (pendingAction) return Promise.resolve({
      status: "rejected", revision, code: "action_in_flight", message: "Wait for the previous action to be confirmed."
    });
    return new Promise((resolve) => {
      const actionGeneration = lifecycleGeneration;
      pendingAction = { envelope, resolve, sent: true };
      updateStatus("confirming", { lastError: null });
      hostActionQueue = hostActionQueue.then(async () => {
        if (actionGeneration !== lifecycleGeneration) return;
        if (envelope.baseRevision !== revision) {
          const stale = {
            actionId: envelope.actionId,
            status: "rejected",
            revision,
            code: "stale_revision",
            message: "The game advanced before this action could be confirmed."
          };
          rememberProcessedAction(envelope.actionId, stale);
          pendingAction = null;
          callbacks.onActionResult(stale);
          updateStatus(role === "local" ? "local" : "synced", { lastError: stale.code });
          resolve(stale);
          return;
        }
        let outcome;
        try {
          outcome = await callbacks.onAction(cloneJson(envelope.action), {
            actorId: credentials.seatId, role: "host", actionId: envelope.actionId,
            baseRevision: envelope.baseRevision, connection: null,
            processedActionIds: getProcessedActionIds(),
            nextProcessedActionIds: processedIdsIncluding(envelope.actionId)
          });
          if (actionGeneration !== lifecycleGeneration) return;
        } catch (error) {
          outcome = { accepted: false, code: "action_failed", message: error && error.message || "The action could not be completed." };
        }
        const result = normalizeActionOutcome(outcome, envelope.actionId, envelope.baseRevision);
        rememberProcessedAction(envelope.actionId, result);
        if (result.status === "accepted") {
          if (outcome && Object.prototype.hasOwnProperty.call(outcome, "state")) lastBroadcastState = outcome.state;
          broadcastSnapshots(outcome && outcome.state);
        }
        pendingAction = null;
        callbacks.onActionResult(result);
        updateStatus(role === "local" ? "local" : "synced", { lastError: result.status === "accepted" ? null : result.code });
        resolve(result);
      });
    });
  }

  function resendPendingAction() {
    if (!pendingAction || role !== "client" || !clientConnection || !clientConnection.open) return false;
    pendingAction.sent = safeSend(clientConnection, pendingAction.envelope);
    if (pendingAction.sent) updateStatus("confirming", { lastError: null });
    else scheduleReconnect("action_send_failed");
    return pendingAction.sent;
  }

  function sendAction(action) { return submitAction(action); }

  function buildStateView(seatId, stateOverride) {
    try {
      if (stateOverride !== undefined && callbacks.projectState) return callbacks.projectState(stateOverride, seatId);
      if (callbacks.getStateView) return callbacks.getStateView(seatId);
      if (callbacks.projectState && lastBroadcastState !== undefined) return callbacks.projectState(lastBroadcastState, seatId);
      return lastBroadcastState;
    } catch (error) { reportCallbackError(error); return undefined; }
  }

  function sendSnapshot(connection, seatId, snapshotRevision, stateOverride) {
    if (!connection || !connection.open) return false;
    return safeSend(connection, {
      type: "snapshot", gameId: credentials.gameId,
      revision: normalizeRevision(snapshotRevision, revision),
      stateView: buildStateView(seatId, stateOverride), roster: getRoster()
    });
  }

  function broadcastSnapshots(stateOverride) {
    if (role !== "host") return;
    hostConnections.forEach((meta, connection) => {
      if (meta.authenticated && meta.ready && connection.open) sendSnapshot(connection, meta.seatId, revision, stateOverride);
    });
  }

  function broadcast(state, explicitRevision) {
    if (role !== "host") return false;
    lastBroadcastState = state;
    if (explicitRevision != null) revision = Math.max(revision, normalizeRevision(explicitRevision, revision));
    broadcastSnapshots(state);
    updateStatus("synced", { lastError: null });
    return true;
  }

  function handleInboundChat(meta, payload) {
    const text = String(isPlainObject(payload) ? payload.text || "" : payload || "").trim().slice(0, 100);
    if (!text) return;
    const stamped = { seatId: meta.seatId, name: String(meta.profile.name || "Player").slice(0, 100),
      text, time: formatTime(clock.now()), at: clock.now() };
    callbacks.onChat(stamped);
    relay({ type: "chat", payload: stamped });
  }

  function formatTime(milliseconds) {
    try { return new Date(milliseconds).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch (error) { return ""; }
  }

  function broadcastChat(message) {
    const text = String(isPlainObject(message) ? message.text || "" : message || "").trim().slice(0, 100);
    if (!text) return false;
    if (role === "host" || role === "local") {
      const stamped = { seatId: credentials && credentials.seatId,
        name: String(credentials && credentials.profile && credentials.profile.name || "Host").slice(0, 100),
        text, time: formatTime(clock.now()), at: clock.now() };
      if (role === "host") relay({ type: "chat", payload: stamped });
      return true;
    }
    return safeSend(clientConnection, { type: "chat", payload: { text } });
  }

  function validPresence(payload) {
    if (!isPlainObject(payload)) return false;
    try { return JSON.stringify(payload).length <= 8192; } catch (error) { return false; }
  }

  function handleInboundPresence(meta, payload) {
    const now = clock.now();
    if (!validPresence(payload) || now - meta.lastPresenceAt < presenceIntervalMs) return;
    meta.lastPresenceAt = now;
    const stamped = Object.assign({}, cloneJson(payload), {
      playerId: meta.seatId,
      seatId: meta.seatId,
      name: meta.profile.name,
      color: meta.profile.color,
      at: now
    });
    delete stamped.hostOverride;
    callbacks.onPresence(stamped);
    relay({ type: "presence", payload: stamped }, meta.connection, true);
  }

  function sendPresence(payload) {
    const now = clock.now();
    if (!validPresence(payload) || now - lastPresenceSentAt < presenceIntervalMs) return false;
    lastPresenceSentAt = now;
    const stamped = Object.assign({}, cloneJson(payload), {
      playerId: credentials && credentials.seatId,
      seatId: credentials && credentials.seatId,
      name: credentials && credentials.profile && credentials.profile.name || "Player",
      color: credentials && credentials.profile && credentials.profile.color || "",
      at: now
    });
    delete stamped.hostOverride;
    if (role === "host") {
      callbacks.onPresence(stamped);
      relay({ type: "presence", payload: stamped }, null, true);
      return true;
    }
    if (role === "client") return safeSend(clientConnection, { type: "presence", payload: stamped }, true);
    return false;
  }

  function relay(message, exceptConnection, dropOnBackpressure) {
    hostConnections.forEach((meta, connection) => {
      if (meta.authenticated && meta.ready && connection !== exceptConnection) safeSend(connection, message, dropOnBackpressure);
    });
  }

  function safeSend(connection, message, dropOnBackpressure) {
    if (!connection || !connection.open || typeof connection.send !== "function") return false;
    if (dropOnBackpressure && bufferedAmount(connection) > maxBufferedBytes) return false;
    try { connection.send(message); return true; } catch (error) { return false; }
  }

  function bufferedAmount(connection) {
    if (Number.isFinite(connection.bufferSize)) return connection.bufferSize;
    return connection.dataChannel && Number.isFinite(connection.dataChannel.bufferedAmount)
      ? connection.dataChannel.bufferedAmount : 0;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = clock.setInterval(() => {
      const now = clock.now();
      if (role === "host") {
        hostConnections.forEach((meta) => {
          if (!meta.authenticated) return;
          if (now - meta.lastSeen > connectionTimeoutMs) closeHostConnection(meta, "heartbeat_timeout");
          else safeSend(meta.connection, { type: "ping", at: now }, true);
        });
      } else if (role === "client" && clientConnection && clientConnection.open) {
        if (now - clientLastSeen > connectionTimeoutMs) {
          const staleConnection = clientConnection;
          clientConnection = null;
          try { staleConnection.close(); } catch (error) { /* ignored */ }
          scheduleReconnect("heartbeat_timeout");
        } else safeSend(clientConnection, { type: "ping", at: now }, true);
      }
    }, pingIntervalMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) clock.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function markSeatSeen(meta) {
    meta.lastSeen = clock.now();
    upsertRoster(meta.seatId, { lastSeen: meta.lastSeen, status: "online" });
  }

  function closeHostConnection(meta, reason) {
    if (!meta || !hostConnections.has(meta.connection)) return;
    hostConnections.delete(meta.connection);
    if (meta.authenticated && meta.seatId) {
      upsertRoster(meta.seatId, { status: "offline", lastSeen: clock.now(), activeAction: null });
      emitRoster();
      callbacks.onDisconnect(meta.seatId, { role: "player", peerId: meta.peerId, reason });
      broadcastRoster();
    }
  }

  function scheduleReconnect(reason) {
    if (role !== "client" && role !== "host") return;
    if (!isOnline()) {
      clearReconnectTimer();
      updateStatus("offline", { lastError: "browser_offline" }); return;
    }
    if (reconnectTimer !== null) return;
    const index = Math.min(reconnectAttempt, reconnectDelays.length - 1);
    const delay = Math.max(0, Math.round(reconnectDelays[index] * (0.8 + random() * 0.4)));
    reconnectAttempt++;
    const generation = lifecycleGeneration;
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      if (generation === lifecycleGeneration && (role === "client" || role === "host")) attemptReconnect();
    }, delay);
    updateStatus("reconnecting", { retryInMs: delay, lastError: reason || "connection_lost" });
  }

  function attemptReconnect() {
    if (!isOnline()) { updateStatus("offline", { lastError: "browser_offline" }); return; }
    if (!peer || peer.destroyed) {
      peer = makePeer(credentials || {}, lifecycleGeneration);
      scheduleReconnect("peer_recreated"); return;
    }
    if (peer.disconnected && typeof peer.reconnect === "function") {
      try { peer.reconnect(); } catch (error) { scheduleReconnect("peer_reconnect_failed"); return; }
      scheduleReconnect("peer_reconnecting"); return;
    }
    if (role === "client") {
      connectToHost();
      if (!clientConnection || !clientConnection.open) scheduleReconnect("host_unavailable");
    } else updateStatus("synced", { lastError: null });
  }

  function retryNow() {
    if (role !== "client" && role !== "host") return false;
    clearReconnectTimer();
    reconnectAttempt = 0;
    updateStatus("reconnecting", { retryInMs: 0, lastError: null });
    attemptReconnect();
    return true;
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) clock.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function closeAllConnections() {
    const seen = new Set();
    [clientConnection, connectingConnection].forEach((connection) => {
      if (connection && !seen.has(connection)) {
        seen.add(connection);
        try { connection.close(); } catch (error) { /* ignored */ }
      }
    });
    hostConnections.forEach((meta, connection) => {
      if (!seen.has(connection)) {
        seen.add(connection);
        try { connection.close(); } catch (error) { /* ignored */ }
      }
    });
    clientConnection = null;
    connectingConnection = null;
    hostConnections = new Map();
  }

  function leaveRoom() {
    const pending = pendingAction;
    pendingAction = null;
    resetTransport("closed");
    removeBrowserListeners();
    credentials = null;
    knownSeatTokens = new Map();
    roster = new Map();
    revision = 0;
    lastSnapshotRevision = -1;
    lastBroadcastState = undefined;
    if (pending) pending.resolve({
      actionId: pending.envelope.actionId, status: "rejected",
      revision: pending.envelope.baseRevision,
      code: pending.sent ? "resync_required" : "not_sent",
      message: pending.sent
        ? "The connection closed before confirmation; resynchronize before retrying."
        : "The action was not sent."
    });
    updateStatus("closed", { lastError: null });
  }

  function cancelPendingAction(code) {
    if (!pendingAction) return;
    const abandoned = pendingAction;
    pendingAction = null;
    abandoned.resolve({
      actionId: abandoned.envelope.actionId,
      status: "rejected",
      revision: abandoned.envelope.baseRevision,
      code: abandoned.sent ? "resync_required" : (code || "not_sent"),
      message: abandoned.sent
        ? "The session changed before confirmation; resynchronize before retrying."
        : "The action was not sent."
    });
  }

  function importRoster(value) {
    if (Array.isArray(value)) value.forEach((seat) => {
      if (seat && seat.seatId) upsertRoster(String(seat.seatId), seat);
    });
  }

  function upsertRoster(seatId, patch) {
    if (!seatId) return;
    const previous = roster.get(seatId) || {
      seatId, name: "Player", color: "", status: "offline", lastSeen: 0,
      ready: false, activeAction: null, role: "player"
    };
    const next = Object.assign({}, previous, patch || {}, { seatId });
    next.name = String(next.name || "Player").slice(0, 100);
    next.color = String(next.color || "").slice(0, 40);
    next.status = ["online", "reconnecting", "offline"].includes(next.status) ? next.status : "offline";
    next.lastSeen = normalizeRevision(next.lastSeen, 0);
    next.ready = !!next.ready;
    next.activeAction = next.activeAction ? String(next.activeAction).slice(0, 80) : null;
    delete next.seatToken;
    roster.set(seatId, next);
  }

  function setRoster(value) {
    roster = new Map();
    importRoster(value);
    if (credentials && (role === "host" || role === "local")) {
      upsertRoster(credentials.seatId, { status: "online", role: "host", lastSeen: clock.now() });
    }
    emitRoster();
  }

  function applyRoster(value) {
    if (!Array.isArray(value)) return;
    roster = new Map();
    importRoster(value);
    emitRoster();
  }

  function getRoster() { return Array.from(roster.values()).map((seat) => Object.assign({}, seat)); }

  function emitRoster() {
    try { callbacks.onRoster(getRoster()); } catch (error) { reportCallbackError(error); }
    updateStatus(status.phase);
  }

  function broadcastRoster() {
    if (role === "host") relay({ type: "roster", roster: getRoster() });
  }

  function areAllSeatsOnline() {
    if (!roster.size) return role === "local";
    return Array.from(roster.values()).every((seat) => seat.status === "online");
  }

  function setRevision(value) {
    const next = normalizeRevision(value, revision);
    if (next < revision) return false;
    revision = next;
    if (credentials) credentials.revision = next;
    updateStatus(status.phase);
    return true;
  }

  function getProcessedActionIds() {
    return Array.from(processedActions.keys());
  }

  function processedIdsIncluding(actionId) {
    const ids = getProcessedActionIds().filter((id) => id !== actionId);
    ids.push(String(actionId));
    return ids.slice(-512);
  }

  function restoreProcessedActionIds(value) {
    if (!Array.isArray(value)) return false;
    const restored = new Map();
    value.slice(-512).forEach((rawId) => {
      const actionId = String(rawId || "");
      if (!actionId || actionId.length > 100) return;
      restored.set(actionId, {
        actionId,
        status: "accepted",
        revision,
        code: "already_processed",
        message: "This action was already committed before host recovery."
      });
    });
    processedActions = restored;
    return true;
  }

  function getCredentials() {
    if (!credentials) return null;
    return {
      role: credentials.role || role, gameId: credentials.gameId,
      seatId: credentials.seatId, seatToken: credentials.seatToken,
      hostPeerId: credentials.hostPeerId, peerId: credentials.peerId || null,
      revision, profile: Object.assign({}, credentials.profile || {})
    };
  }

  function getStatus() { return Object.assign({}, status, { roster: getRoster() }); }
  function getLocalId() { return credentials && credentials.seatId || localPeerId; }
  function getTransportId() { return localPeerId; }
  function getIsHost() { return role === "host" || role === "local"; }
  function getPeerCount() {
    if (role === "host") return Array.from(hostConnections.values()).filter((meta) => meta.authenticated && meta.ready && meta.connection.open).length;
    return clientConnection && clientConnection.open ? 1 : 0;
  }

  function sendProtocolError(connection, code, message) {
    safeSend(connection, { type: "protocolError", code, message });
  }

  function tokensEqual(left, right) {
    left = String(left || ""); right = String(right || "");
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return difference === 0;
  }

  function isPlainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function cloneJson(value) { try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; } }
  function jsonSize(value) { try { return JSON.stringify(value).length; } catch (error) { return Infinity; } }

  function debugState() {
    return {
      role, revision, lastSnapshotRevision,
      processedActionIds: Array.from(processedActions.keys()),
      pendingEnvelope: pendingAction && cloneJson(pendingAction.envelope),
      reconnectAttempt, reconnectScheduled: reconnectTimer !== null,
      hostSeats: Array.from(hostConnections.values()).filter((meta) => meta.authenticated && meta.ready).map((meta) => meta.seatId)
    };
  }

  function setOnlineForTests(value) { onlineOverride = value == null ? null : !!value; }

  return {
    PROTOCOL_VERSION: CIV_NET_PROTOCOL_VERSION,
    init, createRoom, joinRoom, startLocal, resumeSession,
    submitAction, sendAction, broadcast, broadcastChat, sendPresence,
    retryNow, leaveRoom, setRevision, setRoster, getRoster,
    getProcessedActionIds, restoreProcessedActionIds,
    getStatus, getCredentials, getLocalId, getTransportId, getIsHost, getPeerCount,
    __debug: debugState, __setOnlineForTests: setOnlineForTests
  };
}

const Net = createCivNet();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createCivNet, CIV_NET_PROTOCOL_VERSION };
}
