"use strict";

const Net = (() => {
  let peer = null;
  let connections = [];
  let isHost = false;
  let localId = null;
  let onStateReceived = null;
  let onPlayerJoined = null;
  let onDisconnect = null;
  let onConnected = null;
  let onChatReceived = null;

  function init(callbacks) {
    onStateReceived = callbacks.onState || (() => {});
    onPlayerJoined = callbacks.onJoin || (() => {});
    onDisconnect = callbacks.onDisconnect || (() => {});
    onConnected = callbacks.onConnected || (() => {});
    onChatReceived = callbacks.onChat || (() => {});
  }

  function createRoom(callback) {
    if (peer) peer.destroy();
    isHost = true;
    peer = new Peer();
    peer.on("open", (id) => {
      localId = id;
      callback(id);
    });
    peer.on("connection", (conn) => {
      connections.push(conn);
      conn.on("data", (data) => {
        if (data.type === "hello") {
          onPlayerJoined(conn.peer, data.name, data.color);
        } else if (data.type === "action") {
          onStateReceived(data.payload);
        } else if (data.type === "chat") {
          onChatReceived(data.payload);
          connections.forEach((c) => { if (c.open && c !== conn) c.send({ type: "chat", payload: data.payload }); });
        }
      });
      conn.on("close", () => {
        connections = connections.filter((c) => c !== conn);
        onDisconnect(conn.peer);
      });
      conn.on("open", () => {
        onConnected(conn.peer);
      });
    });
    peer.on("error", (err) => console.error("PeerJS host error:", err));
  }

  let lastRoomCode = null;
  let lastPlayerName = null;
  let lastPlayerColor = null;
  let reconnectAttempts = 0;

  function joinRoom(code, name, color, callback) {
    if (peer) peer.destroy();
    isHost = false;
    lastRoomCode = code;
    lastPlayerName = name;
    lastPlayerColor = color;
    reconnectAttempts = 0;
    peer = new Peer();
    peer.on("open", (id) => {
      localId = id;
      connectToHost(code, name, color, callback);
    });
    peer.on("error", (err) => console.error("PeerJS client error:", err));
  }

  function connectToHost(code, name, color, callback) {
    const conn = peer.connect(code);
    conn.on("open", () => {
      conn.send({ type: "hello", name, color });
      connections = [conn];
      reconnectAttempts = 0;
      if (callback) callback(localId);
    });
    conn.on("data", (data) => {
      if (data.type === "state") {
        onStateReceived(data.payload);
      } else if (data.type === "chat") {
        onChatReceived(data.payload);
      }
    });
    conn.on("close", () => {
      connections = [];
      if (reconnectAttempts < 3) {
        reconnectAttempts++;
        setTimeout(() => { connectToHost(lastRoomCode, lastPlayerName, lastPlayerColor, null); }, 2000 * reconnectAttempts);
      } else {
        onDisconnect(null);
      }
    });
  }

  function startLocal() {
    isHost = true;
    localId = "local";
    connections = [];
  }

  function broadcast(state) {
    if (!isHost) return;
    connections.forEach((conn) => {
      if (conn.open) conn.send({ type: "state", payload: state });
    });
  }

  function broadcastChat(msg) {
    if (isHost) {
      connections.forEach((conn) => { if (conn.open) conn.send({ type: "chat", payload: msg }); });
    } else if (connections[0] && connections[0].open) {
      connections[0].send({ type: "chat", payload: msg });
    }
  }

  function sendAction(action) {
    if (isHost) return;
    if (connections[0] && connections[0].open) {
      connections[0].send({ type: "action", payload: action });
    }
  }

  function getLocalId() { return localId; }
  function getIsHost() { return isHost; }

  return { init, createRoom, joinRoom, startLocal, broadcast, broadcastChat, sendAction, getLocalId, getIsHost };
})();
