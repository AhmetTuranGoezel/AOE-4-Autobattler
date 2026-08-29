"use strict";

const assert = require("node:assert/strict");
const { createCivNet, CIV_NET_PROTOCOL_VERSION } = require("../net.js");

class Emitter {
  constructor() { this.listeners = new Map(); }
  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
    return this;
  }
  emit(type, ...args) {
    (this.listeners.get(type) || []).slice().forEach((handler) => handler(...args));
  }
}

class FakeClock {
  constructor() {
    this.time = 1000;
    this.nextId = 1;
    this.timeouts = new Map();
    this.intervals = new Map();
    this.scheduledDelays = [];
  }
  now = () => this.time;
  setTimeout = (handler, delay) => {
    const id = this.nextId++;
    this.timeouts.set(id, { handler, delay });
    this.scheduledDelays.push(delay);
    return id;
  };
  clearTimeout = (id) => { this.timeouts.delete(id); };
  setInterval = (handler, delay) => {
    const id = this.nextId++;
    this.intervals.set(id, { handler, delay });
    return id;
  };
  clearInterval = (id) => { this.intervals.delete(id); };
  runNextTimeout() {
    const entry = this.timeouts.entries().next();
    if (entry.done) return false;
    const [id, timer] = entry.value;
    this.timeouts.delete(id);
    this.time += timer.delay;
    timer.handler();
    return true;
  }
  advance(ms) { this.time += ms; }
}

class FakeConnection extends Emitter {
  constructor(hub, ownerId, peerId) {
    super();
    this.hub = hub;
    this.ownerId = ownerId;
    this.peer = peerId;
    this.open = false;
    this.other = null;
    this.dataChannel = { bufferedAmount: 0 };
  }
  send(message) {
    if (!this.open || !this.other || !this.other.open) throw new Error("connection closed");
    const copy = JSON.parse(JSON.stringify(message));
    this.hub.messages.push({ from: this.ownerId, to: this.peer, message: copy });
    queueMicrotask(() => {
      if (this.open && this.other && this.other.open) this.other.emit("data", copy);
    });
  }
  close() {
    if (!this.open && (!this.other || !this.other.open)) return;
    this.open = false;
    const other = this.other;
    if (other) other.open = false;
    queueMicrotask(() => this.emit("close"));
    if (other) queueMicrotask(() => other.emit("close"));
  }
}

class FakeHub {
  constructor() {
    this.peers = new Map();
    this.counter = 0;
    this.links = [];
    this.messages = [];
    const hub = this;
    this.Peer = class FakePeer extends Emitter {
      constructor(idOrOptions) {
        super();
        this.id = typeof idOrOptions === "string" ? idOrOptions : `peer-${++hub.counter}`;
        this.disconnected = false;
        this.destroyed = false;
        hub.peers.set(this.id, this);
        queueMicrotask(() => this.emit("open", this.id));
      }
      connect(targetId) {
        const target = hub.peers.get(targetId);
        const client = new FakeConnection(hub, this.id, targetId);
        if (!target || target.destroyed) {
          queueMicrotask(() => client.emit("error", { type: "peer-unavailable" }));
          return client;
        }
        const server = new FakeConnection(hub, targetId, this.id);
        client.other = server;
        server.other = client;
        hub.links.push({ client, server });
        queueMicrotask(() => {
          target.emit("connection", server);
          client.open = true;
          server.open = true;
          client.emit("open");
          server.emit("open");
        });
        return client;
      }
      reconnect() {
        this.disconnected = false;
        queueMicrotask(() => this.emit("open", this.id));
      }
      destroy() {
        this.destroyed = true;
        hub.peers.delete(this.id);
      }
    };
  }
  newestLink() { return this.links[this.links.length - 1]; }
}

async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

async function protocolSuite() {
  const hub = new FakeHub();
  const clock = new FakeClock();
  const deps = { Peer: hub.Peer, clock, random: () => 0.5 };
  const host = createCivNet(deps);
  const client = createCivNet(deps);
  const clientStates = [];
  const actionContexts = [];
  const actions = [];
  const presence = [];
  const chats = [];
  let joins = 0;
  let stateRevision = 0;
  let slowRelease = null;

  host.init({
    onJoin: async (seatId, name, color, context) => {
      await Promise.resolve();
      joins++;
      assert.equal(seatId, "seat-a");
      assert.equal(name, "Alice");
      assert.equal(context.seatToken, "token-a");
      assert.deepEqual(context.profile, { name: "Alice", color: "blue" });
    },
    onAction: async (action, context) => {
      actions.push(action);
      actionContexts.push(context);
      if (action.type === "SLOW") await new Promise((resolve) => { slowRelease = resolve; });
      if (action.type === "PRESET_REVISION") {
        stateRevision++;
        host.setRevision(stateRevision);
        return { accepted: true, revision: stateRevision, state: { marker: `r${stateRevision}` } };
      }
      stateRevision++;
      return { accepted: true, revision: stateRevision, state: { marker: `r${stateRevision}` } };
    },
    projectState: (state, seatId) => Object.assign({}, state, { viewer: seatId }),
    onPresence: (value) => presence.push(value),
    onChat: (value) => chats.push(value)
  });
  client.init({ onState: (view, info) => clientStates.push({ view, info }) });

  host.createRoom({
    peerId: "room", gameId: "game-a", seatId: "host-seat", seatToken: "host-token",
    revision: 0, profile: { name: "Host", color: "red" }
  });
  client.joinRoom({
    hostPeerId: "room", gameId: "game-a", seatId: "seat-a", seatToken: "token-a",
    profile: { name: "Alice", color: "blue" }, lastRevision: 0
  });
  await flush();

  assert.equal(CIV_NET_PROTOCOL_VERSION, 2);
  assert.equal(joins, 1, "first connection adds the seat once");
  assert.equal(client.getStatus().phase, "synced");
  assert.deepEqual(host.__debug().hostSeats, ["seat-a"]);

  const result = await client.submitAction({
    type: "MOVE", playerId: "victim", hostOverride: true,
    payload: { playerId: "victim", hostOverride: true, value: 7 }
  });
  await flush();
  assert.equal(result.status, "accepted");
  assert.equal(result.revision, 1);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].payload.playerId, "seat-a", "wire player id is ignored");
  assert.equal(Object.hasOwn(actions[0].payload, "hostOverride"), false, "wire host override is stripped");
  assert.equal(actionContexts[0].actorId, "seat-a");
  assert.equal(actionContexts[0].role, "player");
  assert.deepEqual(actionContexts[0].nextProcessedActionIds, [result.actionId]);
  assert.equal(clientStates.at(-1).view.viewer, "seat-a");

  const firstWireAction = hub.messages.find((entry) => entry.from.startsWith("peer-") && entry.message.type === "action").message;
  hub.newestLink().client.send(firstWireAction);
  await flush();
  assert.equal(actions.length, 1, "duplicate actionId is applied exactly once");
  assert.deepEqual(host.getProcessedActionIds(), [firstWireAction.actionId]);

  hub.newestLink().client.send({
    type: "action", gameId: "game-a", actionId: "stale-action",
    baseRevision: 0, action: { type: "MOVE", payload: {} }
  });
  await flush();
  assert.equal(actions.length, 1, "stale base revision never reaches Game");
  const staleResult = hub.messages.filter((entry) => entry.message.type === "actionResult" && entry.message.actionId === "stale-action").at(-1);
  assert.equal(staleResult.message.code, "stale_revision");

  const beforeLate = clientStates.length;
  hub.newestLink().server.send({
    type: "snapshot", gameId: "game-a", revision: 0,
    stateView: { marker: "late" }, roster: []
  });
  await flush();
  assert.equal(clientStates.length, beforeLate, "late snapshot is ignored");

  clock.advance(101);
  assert.equal(client.sendPresence({ playerId: "victim", cursor: [2, 3] }), true);
  await flush();
  assert.equal(presence.at(-1).seatId, "seat-a");
  assert.equal(presence.at(-1).playerId, "seat-a");
  assert.equal(presence.at(-1).name, "Alice");
  assert.equal(presence.at(-1).color, "blue");
  assert.equal(client.sendPresence({ cursor: [4, 5] }), false, "presence is throttled");
  clock.advance(101);
  hub.newestLink().client.dataChannel.bufferedAmount = 300000;
  assert.equal(client.sendPresence({ cursor: [6, 7] }), false, "presence is dropped under backpressure");
  hub.newestLink().client.dataChannel.bufferedAmount = 0;

  client.broadcastChat({ name: "Mallory", text: "x".repeat(140) });
  await flush();
  assert.equal(chats.at(-1).seatId, "seat-a");
  assert.equal(chats.at(-1).name, "Alice");
  assert.equal(chats.at(-1).text.length, 100);

  const slowPromise = client.submitAction({ type: "SLOW", payload: {} });
  await flush();
  const pendingId = client.__debug().pendingEnvelope.actionId;
  const blocked = await client.submitAction({ type: "SECOND", payload: {} });
  assert.equal(blocked.code, "action_in_flight");
  assert.ok(slowRelease, "slow action reached the host");

  hub.newestLink().client.close();
  await flush();
  slowRelease();
  await flush();
  assert.equal(actions.filter((action) => action.type === "SLOW").length, 1);
  assert.equal(client.__debug().pendingEnvelope.actionId, pendingId, "retry retains action id");
  assert.equal(clock.runNextTimeout(), true);
  await flush(40);
  const slowResult = await slowPromise;
  assert.equal(slowResult.status, "accepted");
  assert.equal(slowResult.revision, 2);
  const slowIds = hub.messages
    .filter((entry) => entry.message.type === "action" && entry.message.action && entry.message.action.type === "SLOW")
    .map((entry) => entry.message.actionId);
  assert.ok(slowIds.length >= 2, "pending action was resent after reconnect");
  assert.equal(new Set(slowIds).size, 1, "network retry reused the exact action id");
  assert.equal(actions.filter((action) => action.type === "SLOW").length, 1, "resent action was deduplicated");
  assert.equal(joins, 1, "seat resume does not add another player");

  const presetResult = await client.submitAction({ type: "PRESET_REVISION", payload: {} });
  assert.equal(presetResult.revision, 3, "a checkpointed explicit revision is not incremented twice");
  assert.equal(host.getStatus().revision, 3);

  const intruderErrors = [];
  const intruder = createCivNet(deps);
  intruder.init({ onProtocolError: (error) => intruderErrors.push(error) });
  intruder.joinRoom({
    hostPeerId: "room", gameId: "game-a", seatId: "seat-a", seatToken: "wrong-token",
    profile: { name: "Impostor", color: "black" }
  });
  await flush(40);
  assert.equal(intruderErrors.at(-1).code, "invalid_seat_token");
  assert.equal(joins, 1);

  const restored = createCivNet(deps);
  restored.startLocal({ revision: 42 });
  const restoredIds = Array.from({ length: 600 }, (_, index) => `restored-${index}`);
  assert.equal(restored.restoreProcessedActionIds(restoredIds), true);
  assert.equal(restored.getProcessedActionIds().length, 512);
  assert.equal(restored.getProcessedActionIds()[0], "restored-88");

  intruder.leaveRoom();
  client.leaveRoom();
  host.leaveRoom();
}

async function takeoverAuthenticationSuite() {
  const hub = new FakeHub();
  const clock = new FakeClock();
  let joins = 0;
  let authentications = 0;
  const host = createCivNet({ Peer: hub.Peer, clock, random: () => 0.5 });
  const client = createCivNet({ Peer: hub.Peer, clock, random: () => 0.5 });
  host.init({
    onAuthenticate: async (hello) => {
      await Promise.resolve();
      authentications++;
      return hello.seatToken === "restored-token"
        ? { accepted: true, existing: true }
        : { accepted: false, code: "invalid_seat_token", message: "bad token" };
    },
    onJoin: async () => { joins++; }
  });
  client.init({});
  host.createRoom({
    peerId: "recovered-room", gameId: "recovered-game",
    seatId: "new-host", seatToken: "new-host-token", revision: 17,
    roster: [{ seatId: "seat-a", name: "Alice", status: "offline" }]
  });
  client.joinRoom({
    hostPeerId: "recovered-room", gameId: "recovered-game",
    seatId: "seat-a", seatToken: "restored-token", lastRevision: 17,
    profile: { name: "Alice", color: "blue" }
  });
  await flush(40);
  assert.equal(authentications, 1);
  assert.equal(joins, 0, "an authenticated recovered seat is not added again");
  assert.equal(client.getStatus().phase, "synced");
  assert.equal(host.getRoster().find((seat) => seat.seatId === "seat-a").status, "online");
  client.leaveRoom();
  host.leaveRoom();
}

async function reconnectScheduleSuite() {
  const hub = new FakeHub();
  const clock = new FakeClock();
  const statuses = [];
  const client = createCivNet({ Peer: hub.Peer, clock, random: () => 0.5 });
  client.init({ onStatus: (status) => {
    if (status.phase === "reconnecting" && status.retryInMs) statuses.push(status.retryInMs);
  } });
  client.joinRoom({
    hostPeerId: "missing", gameId: "missing", seatId: "seat", seatToken: "token"
  });
  await flush();
  for (let i = 0; i < 6; i++) {
    assert.equal(clock.runNextTimeout(), true);
    await flush();
  }
  assert.deepEqual(statuses.slice(0, 6), [1000, 2000, 4000, 8000, 15000, 15000]);
  client.leaveRoom();
}

(async () => {
  await protocolSuite();
  await takeoverAuthenticationSuite();
  await reconnectScheduleSuite();
  console.log("net-protocol-test: all assertions passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
