"use strict";
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {finishSetup}=require('./production-fixtures');
const ctx=vm.createContext({console,structuredClone});ctx.window=ctx;
for(const f of ['rules-data.js','game.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
const G=vm.runInContext('Game',ctx);let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function board(n=3){const s=finishSetup(G,G.createState(G.SEAT_COLORS.slice(0,n).map((co,i)=>G.createPlayer('p'+i,'Player '+i,co))));s.gameId='integrity-test';s.revision=20;return s;}
for(const n of [1,2,3,4,5])check(n+' legitimate completed seats have no fatal findings',()=>assert.equal(G.validateStateIntegrity(board(n)).filter(f=>f.severity==='fatal').length,0));
const valid=board(),cap=Object.keys(valid.map.hexes).find(k=>valid.map.hexes[k].city?.ownerId==='p0');
check('serialized setup validates its live catalogue after every placement',()=>{
 let s=G.createState(G.SEAT_COLORS.slice(0,3).map((co,i)=>G.createPlayer('p'+i,'Player '+i,co)));
 for(let n=0;s.phase==='setup'&&n<20;n++){
  s=G.migrateState(JSON.parse(JSON.stringify(s)));
  const id=s.setup.order[s.setup.turnIndex];let action;
  if(s.setup.phase==='fortress') action={type:'PLACE_FORTRESS',payload:{playerId:id,hexKey:[...G.getValidFortressHexes(s)][0]}};
  else {const tileId=s.setup.playerTiles[id][0];for(const k of Object.keys(s.map.hexes)){const p=G.tilePlacementFor(s,tileId,k,0);if(p){action={type:'PLACE_TILE',payload:{playerId:id,tileId,anchorKey:k,rotation:p.rotation,side:'A'}};break;}}}
  s=G.applyAction(s,action);
  assert.deepEqual(JSON.parse(JSON.stringify(G.validateStateIntegrity(s).filter(f=>f.severity==='fatal'))),[]);
 }
 assert.equal(s.phase,'playing');
});
const cases=[
 ['invalid_state',s=>s.players[0]=null],
 ['invalid_state',s=>s.players[0].armies={}],
 ['invalid_state',s=>s.pendingChoices={}],
 ['invalid_state',s=>s.tiles.bad=null],
 ['setup_regression',s=>{s.phase='setup';s.setup.phase='capital_tile';}],
 ['revision_regression',s=>s.revision=19],
 ['recovery_regression',s=>s.recoveryGeneration=0,{...valid,recoveryGeneration:1}],
 ['missing_capital',s=>s.map.hexes[cap].city=null],
 ['duplicate_capital',s=>{const h=Object.values(s.map.hexes).find(h=>h.active&&!h.city);h.city={...s.map.hexes[cap].city};}],
 ['inactive_piece',s=>s.map.hexes[cap].active=false],
 ['unknown_owner',s=>s.map.hexes[cap].city.ownerId='nobody'],
 ['duplicate_unit_id',s=>s.players[0].armies.push({...s.players[0].armies[0]})],
 ['unit_off_map',s=>s.players[0].caravans[0].position='999,999'],
 ['unit_off_map',s=>s.players[0].armies[0].position=Object.keys(s.map.hexes).find(k=>!s.map.hexes[k].active)],
 ['invalid_card_ids',s=>s.players[0].focusCardIds[1]=s.players[0].focusCardIds[0]],
 ['invalid_focus_card',s=>s.players[0].focusRow[0]='invalid'],
 ['tile_cells_mismatch',s=>s.map.hexes[cap].tileId='different'],
 ['missing_tile_geometry',s=>delete s.tiles[s.map.hexes[cap].tileId].anchorKey],
 ['tile_overlap',s=>{const placed=Object.values(s.tiles).filter(t=>t.placed);placed[1].anchorKey=placed[0].anchorKey;placed[1].rotation=placed[0].rotation;}],
 ['capital_tile_mismatch',s=>s.tiles[s.map.hexes[cap].tileId].ownerId='p1'],
 ['unplaced_tile_cell',s=>s.tiles[s.map.hexes[cap].tileId].placed=false],
 ['missing_active_player',s=>s.turn.order[s.turn.index]='missing'],
 ['unknown_owner',s=>s.pendingChoices=[{id:'orphan',playerId:'missing'}]],
 ['missing_resolution_unit',s=>s.movementContinuation={playerId:'p0',unitId:'missing'}],
 ['missing_resolution_card',s=>s.cardResolution={playerId:'p0',cardId:'removed'}],
 ['stale_resolution_generation',s=>s.activeCard={playerId:'p0',recoveryGeneration:99}],
 ['duplicate_player',s=>s.players.push(structuredClone(s.players[0]))],
 ['invalid_focus_row',s=>delete s.players[0].focusRow],
 ['invalid_hex',s=>s.map.hexes[cap]=null]
];
check('invalid checkpoint shape returns a structured finding',()=>assert.equal(G.validateStateIntegrity(null)[0].code,'invalid_state'));
check('unreadable encoded map returns a structured finding',()=>{
 const s=G.checkpointState(valid);s.map.hexEncoding='not-a-codec';
 assert.equal(G.validateStateIntegrity(s)[0].code,'invalid_map_encoding');
});
for(const [code,mutate,prev] of cases)check('fatal '+code+' is detected without mutation',()=>{
 const s=structuredClone(valid);mutate(s);const before=JSON.stringify(s);
 const report=G.validateStateIntegrity(s,prev||valid);
 assert.ok(report.some(f=>f.code===code&&f.severity==='fatal'),JSON.stringify(report));assert.equal(JSON.stringify(s),before);
});
check('persisted witness blocks setup without a previous state',()=>assert.ok(G.validateStateIntegrity({...valid,phase:'setup'},null,{witness:{observedPlay:true}}).some(f=>f.code==='setup_regression')));
check('explicit history review permits old revision but never setup',()=>{
 assert.equal(G.validateStateIntegrity({...valid,revision:1},valid,{recoveryCandidate:true}).length,0);
 assert.ok(G.validateStateIntegrity({...valid,phase:'setup'},valid,{recoveryCandidate:true}).some(f=>f.code==='setup_regression'));
});
check('Oxford duplicates and cross-type replacement retain physical identity',()=>{
 const s=structuredClone(valid),p=s.players[0];p.focusRow[0]={type:'science',tier:2,trade:1};
 assert.equal(G.validateStateIntegrity(s).length,0);
 s.activeCard={playerId:p.id,cardType:'science',cardId:p.focusCardIds[0],cardIndex:0};
 assert.equal(G.validateStateIntegrity(s).length,0);
});
check('redacted foreign Astronomy and pending choices validate',()=>{
 const s=structuredClone(valid);s.cardResolution={playerId:'p0',cardType:'science',cardName:'Astronomy',id:'astro'};
 s.pendingChoices=[{id:'astro-c',playerId:'p0',kind:'astronomy_tiles',tileIds:['06']}];
 assert.equal(G.validateStateIntegrity(G.projectState(s,'p1')).length,0);
});
check('legacy string cards are not mutated into different identities',()=>{
 const s=structuredClone(valid);delete s.players[0].focusCardIds;const before=JSON.stringify(s);
 assert.ok(G.validateStateIntegrity(s).some(f=>f.code==='legacy_card_ids'&&f.severity==='warning'));assert.equal(JSON.stringify(s),before);
});
check('compressed checkpoint is validated without rewriting it',()=>{
 const s=G.checkpointState(valid),before=JSON.stringify(s);assert.equal(G.validateStateIntegrity(s).length,0);assert.equal(JSON.stringify(s),before);
});
console.log(`integrity-test: ${passed} passed, 0 failed`);
