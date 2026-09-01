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
    this.connectOptions = [];
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
      connect(targetId, options) {
        hub.connectOptions.push(options || null);
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
  assert.ok(host.getProcessedActionIds().includes(pendingId),
    "a committed action is cached even when its original transport closed");
  assert.equal(host.getRoster().find((seat) => seat.seatId === "seat-a").status, "offline",
    "finishing an in-flight action does not revive its closed transport in the roster");
  assert.equal(hub.messages.filter((entry) =>
    entry.message.type === "actionResult" && entry.message.actionId === pendingId).length, 0,
    "the host does not ACK the committed result on the stale transport");
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

async function lifecycleIsolationSuite() {
  const hub = new FakeHub();
  const clock = new FakeClock();
  const host = createCivNet({ Peer: hub.Peer, clock, random: () => 0.5 });
  const client = createCivNet({ Peer: hub.Peer, clock, random: () => 0.5 });
  let releaseObsoleteAction;

  host.init({
    onAction: async () => {
      await new Promise((resolve) => { releaseObsoleteAction = resolve; });
      throw new Error("obsolete transaction failed");
    }
  });
  client.init({});
  host.createRoom({
    peerId: "old-room", gameId: "old-game", seatId: "old-host", seatToken: "old-host-token",
    revision: 0, profile: { name: "Old Host", color: "red" }
  });
  client.joinRoom({
    hostPeerId: "old-room", gameId: "old-game", seatId: "old-seat", seatToken: "old-seat-token",
    profile: { name: "Old Client", color: "blue" }, lastRevision: 0
  });
  await flush();

  const obsoletePromise = client.submitAction({ type: "OBSOLETE", payload: {} });
  await flush();
  assert.ok(releaseObsoleteAction, "the obsolete action reached the original host lifecycle");

  host.createRoom({
    peerId: "replacement-room", gameId: "replacement-game",
    seatId: "replacement-host", seatToken: "replacement-host-token",
    revision: 7, profile: { name: "Replacement Host", color: "green" }
  });
  await flush();
  releaseObsoleteAction();
  await flush(40);

  assert.equal(host.getStatus().revision, 7,
    "an obsolete action outcome cannot advance the replacement session");
  assert.deepEqual(host.getProcessedActionIds(), [],
    "an obsolete action outcome cannot enter the replacement session's dedupe cache");
  assert.deepEqual(host.getRoster().map((seat) => seat.seatId), ["replacement-host"],
    "an obsolete action outcome cannot recreate a seat in the replacement roster");

  client.leaveRoom();
  const abandoned = await obsoletePromise;
  assert.equal(abandoned.code, "resync_required");
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

// A joining client never got into the game: the host authenticated the seat,
// ran ADD_PLAYER and sent its welcome, and the joiner sat in "handshaking"
// forever. The welcome carries the whole state view - the map alone is ~64KB in
// a fresh lobby - and the connection was opened with serialization: "json",
// which hands that to the WebRTC data channel as ONE message. Anything much
// over 16KB is dropped in silence: the channel stays open, send() reports
// success, and nothing arrives. Small messages (hello, ping, chat) crossed
// fine, which is exactly why it looked like a stalled handshake.
//
// PeerJS only chunks under its default "binary" serialization. The size limit
// itself cannot be reproduced against a fake data channel, so what is pinned
// here is the option that caused it.
async function largePayloadSerializationSuite() {
  const hub = new FakeHub();
  const clock = new FakeClock();
  const deps = { Peer: hub.Peer, clock, random: () => 0.5 };
  const host = createCivNet(deps);
  const client = createCivNet(deps);
  host.init({});
  client.init({});

  host.createRoom({
    gameId: "game-size-0001", seatId: "seat-host", seatToken: "tok-host-000000000000",
    hostPeerId: "game-size-0001", peerId: "game-size-0001", revision: 0,
    profile: { name: "Host", color: "#111111" }, seatTokens: { "seat-host": "tok-host-000000000000" }
  }, () => {});
  await flush();
  client.joinRoom({
    hostPeerId: "game-size-0001", gameId: "game-size-0001",
    seatId: "seat-guest", seatToken: "tok-guest-00000000000",
    lastRevision: 0, profile: { name: "Guest", color: "#222222" }
  }, () => {});
  await flush();

  assert.ok(hub.connectOptions.length > 0, "the client should have dialled the host");
  const forced = hub.connectOptions.filter(Boolean)
    .map((options) => options.serialization)
    .filter((value) => value !== undefined);
  assert.deepEqual(forced, [],
    "the client must not pin a serialization: PeerJS only chunks large messages " +
    "under its default 'binary' mode, and a welcome carrying the map is far over " +
    "the single-message limit. Found: " + JSON.stringify(forced));
  host.leaveRoom();
  client.leaveRoom();
}

// This runner used to exit 0 while printing nothing at all: protocolSuite hangs
// on `await slowPromise`, so the final log was never reached and node simply
// ran out of work. An exit code of 0 therefore meant "nothing crashed", not
// "the assertions passed" - and it was being read as the latter. The watchdog
// makes an unfinished run a loud failure.
const WATCHDOG_MS = 20_000;
let finished = false;
let running = "(none)";
const watchdog = setTimeout(() => {
  if (finished) return;
  console.error(`net-protocol-test: TIMED OUT in ${running}.`);
  console.error("  A protocol promise did not settle before the watchdog expired.");
  process.exit(1);
}, WATCHDOG_MS);

async function run(name, suite) {
  running = name;
  await suite();
  console.log(`net-protocol-test: ${name} OK`);
}

(async () => {
  // Runs first, so a hang later in the file cannot quietly skip it.
  await run("large-payload serialization", largePayloadSerializationSuite);
  await run("protocol", protocolSuite);
  await run("takeover authentication", takeoverAuthenticationSuite);
  await run("lifecycle isolation", lifecycleIsolationSuite);
  await run("reconnect schedule", reconnectScheduleSuite);
  finished = true;
  clearTimeout(watchdog);
  console.log("net-protocol-test: all assertions passed");
})().catch((error) => {
  finished = true;
  clearTimeout(watchdog);
  console.error(`net-protocol-test: FAILED in ${running}`);
  console.error(error);
  process.exitCode = 1;
});
