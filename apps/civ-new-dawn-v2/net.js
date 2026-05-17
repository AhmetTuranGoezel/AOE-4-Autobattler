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

  function init(callbacks) {
    onStateReceived = callbacks.onState || (() => {});
    onPlayerJoined = callbacks.onJoin || (() => {});
    onDisconnect = callbacks.onDisconnect || (() => {});
    onConnected = callbacks.onConnected || (() => {});
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

  function joinRoom(code, name, color, callback) {
    if (peer) peer.destroy();
    isHost = false;
    peer = new Peer();
    peer.on("open", (id) => {
      localId = id;
      const conn = peer.connect(code);
      conn.on("open", () => {
        conn.send({ type: "hello", name, color });
        connections = [conn];
        callback(id);
      });
      conn.on("data", (data) => {
        if (data.type === "state") {
          onStateReceived(data.payload);
        }
      });
      conn.on("close", () => {
        connections = [];
        onDisconnect(null);
      });
    });
    peer.on("error", (err) => console.error("PeerJS client error:", err));
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

  function sendAction(action) {
    if (isHost) return;
    if (connections[0] && connections[0].open) {
      connections[0].send({ type: "action", payload: action });
    }
  }

  function getLocalId() { return localId; }
  function getIsHost() { return isHost; }

  return { init, createRoom, joinRoom, startLocal, broadcast, sendAction, getLocalId, getIsHost };
})();
