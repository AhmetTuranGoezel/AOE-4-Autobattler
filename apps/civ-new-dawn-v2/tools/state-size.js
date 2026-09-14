#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const {lateGame}=require("./production-fixtures.js");
const ctx=vm.createContext({console,structuredClone});ctx.window=ctx;
for(const f of ["rules-data.js","tile-art.js","game.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),ctx);
const G=vm.runInContext("Game",ctx), bytes=v=>Buffer.byteLength(JSON.stringify(v),"utf8");
let maximum=0;
for(let sample=0;sample<5;sample++){
  const st=lateGame(G);
  const saved=G.checkpointState(st);
  assert(!saved.turnUndo?.snapshot,"recovery must not be embedded");
  const restored=G.unpackCheckpoint(structuredClone(saved));
  assert.deepEqual(JSON.parse(JSON.stringify(restored.map)),JSON.parse(JSON.stringify(st.map)),"storage encoding must preserve the exact map");
  const request={op:"checkpoint",hostToken:"x".repeat(22),hostEpoch:1,expectedRevision:999,
    fullState:saved,processedActionIds:Array.from({length:512},(_,i)=>String(i).padStart(6,"0")+"x".repeat(94))};
  const size=bytes(request);maximum=Math.max(maximum,size);
  console.log(`five-player sample ${sample+1}: ${size} request bytes; ${Object.keys(st.map.hexes).length} allocated hexes; ${Object.values(st.map.hexes).filter(h=>h.active).length} active`);
  assert(size<768*1024,"require at least 256 KiB headroom below production's 1 MiB cap");
}
console.log(`state-size: 5 realistic late-game HTTP envelopes passed; maximum ${maximum} bytes; headroom ${1048576-maximum} bytes`);
