"use strict";

// Shared plumbing for the tests that drive the real app in real browsers:
// find Chrome, start the dev session server, open a tab, talk CDP to it.
//
// Extracted from two-client-test.js when a five-seat test needed the same
// machinery. Nothing here knows anything about the game - it opens pages and
// evaluates expressions in them.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const HEADED = process.argv.includes("--headed");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => {
        const child = spawn(process.execPath,
          [path.join(__dirname, "dev-session-server.mjs"), String(port)],
          { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        const settle = (good) => good
          ? resolve({ child, port })
          : reject(new Error("server failed:\n" + out));
        child.stdout.on("data", (b) => {
          out += b;
          if (/listening|http:\/\//i.test(String(b))) settle(true);
        });
        child.stderr.on("data", (b) => { out += b; });
        setTimeout(() => { if (!/listening|http:/i.test(out)) settle(false); }, 12000);
      });
    });
  });
}

async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const api = { ws, id: 0, pending: new Map(), errors: [] };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && api.pending.has(m.id)) {
      const { resolve, reject } = api.pending.get(m.id);
      api.pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      api.errors.push(d.exception?.description || d.text || "error");
    }
  };
  api.send = (method, params) => new Promise((resolve, reject) => {
    const id = ++api.id;
    api.pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  api.eval = async (expr) => {
    const r = await api.send("Runtime.evaluate", {
      expression: `(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({__err: String(e && e.stack || e)}); } })()`,
      awaitPromise: true, returnByValue: true
    });
    const raw = r.result?.value;
    if (raw === undefined) return undefined;
    const v = JSON.parse(raw);
    if (v && v.__err) throw new Error(v.__err);
    return v;
  };
  await api.send("Runtime.enable");
  return api;
}

class Tab {
  constructor(name, proc, cdp) {
    this.name = name;
    this.proc = proc;
    this.cdp = cdp;
    this.errors = cdp.errors;
  }
  static async open(name, url) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civ-tab-"));
    const args = ["--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run",
      "--no-default-browser-check", "--disable-extensions", "--disable-gpu", "--mute-audio",
      "--window-size=1280,800"];
    if (!HEADED) args.push("--headless=new");
    args.push(url);
    const proc = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let ws = null;
    proc.stderr.on("data", (b) => {
      const m = String(b).match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) ws = m[1];
    });
    const t0 = Date.now();
    while (!ws && Date.now() - t0 < 25000) await sleep(150);
    if (!ws) throw new Error(name + ": no DevTools endpoint");
    const hostPort = ws.split("/devtools/")[0].replace("ws://", "");
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await (await fetch(`http://${hostPort}/json/list`)).json();
        target = list.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"));
      } catch { /* not up yet */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error(name + ": no page target");
    return new Tab(name, proc, await attach(target.webSocketDebuggerUrl));
  }
  eval(expr) { return this.cdp.eval(expr); }
  reload() { return this.cdp.send("Page.reload"); }
  close() { try { this.proc.kill(); } catch { /* already gone */ } }
}

async function waitUntil(fn, ms, step = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return Date.now() - t0;
    await sleep(step);
  }
  return -1;
}

// A small PASS/FAIL recorder, so each test reports the same way.
function reporter() {
  const lines = [];
  const state = { pass: 0, fail: 0 };
  const show = (d) => d === undefined ? "" : (typeof d === "string" ? d : JSON.stringify(d));
  return {
    lines,
    get pass() { return state.pass; },
    get fail() { return state.fail; },
    ok(name, cond, detail) {
      if (cond) { state.pass++; lines.push(["PASS", name, ""]); }
      else { state.fail++; lines.push(["FAIL", name, show(detail)]); }
      return !!cond;
    },
    info(name, detail) { lines.push(["INFO", name, String(detail)]); },
    print() {
      for (const [tag, name, detail] of lines) {
        console.log(`  ${tag} ${name}${detail ? "  [" + detail + "]" : ""}`);
      }
      console.log(`  ${state.pass} passed, ${state.fail} failed`);
    }
  };
}

module.exports = { CHROME, HEADED, sleep, startServer, attach, Tab, waitUntil, reporter };
