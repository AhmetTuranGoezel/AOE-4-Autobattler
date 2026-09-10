"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { reporter } = require("./browser-harness.js");
const { playtestBoard } = require("./playtest-fixtures.js");
const R = reporter(), ctx = vm.createContext({ console, structuredClone }); ctx.window = ctx;
for (const file of ["rules-data.js", "tile-art.js", "game.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),ctx);
const Game = vm.runInContext("Game",ctx);
const profiles = [1,2,3,4].map(i=>({id:`p${i}`,name:`P${i}`,color:['#e88b24','#d94747','#8b62b5','#489c67'][i-1]}));
const board=(mode,n=2)=>vm.runInContext(`(${playtestBoard.toString()})(Game,${JSON.stringify(profiles.slice(0,n))},${JSON.stringify(mode)})`,ctx);
const act=(st,type,payload={},actor='p1',role='player')=>Game.tryApplyAction(st,{type,payload},{actorId:actor,role});
const choose=(st,optionId,extra={},actor='p1')=>act(st,'RESOLVE_PENDING_CHOICE',{choiceId:st.pendingChoices[0].id,optionId,...extra},actor);
function astronomy(count=2){let st=board('astronomy');st=act(st,'PLAY_SCIENCE',{tradeSpent:0}).state;return choose(st,String(count)).state;}

// Independent contact oracle: it never calls an engine placement validator.
function geometry(st,anchor,rotation,origin){
  const cells=Game.getTileHexKeys(anchor,rotation,st.map.hexes),own=new Set(cells),contacts=new Set();
  for(const k of cells)for(const n of Game.hexNeighborKeys(Game.parseQ(k),Game.parseR(k)))if(!own.has(n)&&st.map.hexes[n]?.active)contacts.add(n);
  return {overlap:cells.some(k=>st.map.hexes[k]?.active),contacts:contacts.size,origin:contacts.has(origin),cells,neighbors:[...contacts]};
}
try {
  for(const count of [0,1,2]) {
    const st=astronomy(count);
    R.ok(`Astronomy legally inspects ${count}`,count ? st.pendingChoices[0]?.tileIds.length===count : !st.cardResolution&&st.players[0].tech===2);
  }
  let st=astronomy();st=choose(st,'origin|06').state;
  const expected=st.fixture.capitalKeys.filter(k=>{const h=st.map.hexes[k];return Game.hexNeighborKeys(h.q,h.r).some(n=>!st.map.hexes[n]?.active);}).sort();
  R.ok('origin set is exactly own physical capital map edges',JSON.stringify(st.pendingChoices[0].hexKeys.slice().sort())===JSON.stringify(expected));
  for(const k of ['5,0','5,1','4,2','1,0','10,10']) {
    const before=JSON.stringify(st),result=choose(st,undefined,{hexKey:k});
    R.ok(`origin ${k} rejected atomically`,!result.accepted&&JSON.stringify(st)===before,result.code);
  }
  const missing=structuredClone(st);missing.map.hexes['0,0'].tileId=null;
  R.ok('missing capital tile ID fails closed instead of matching every null ID',Game.astronomyCapitalEdges(missing,'p1').length===0);
  const water=st.fixture.water;
  st=choose(st,undefined,{hexKey:water}).state;
  R.ok('own water edge is a legal explicit origin',st.pendingChoices[0]?.selectedFromKey===water);
  const attempts={};
  for(let q=-6;q<=6;q++)for(let r=-5;r<=5;r++)for(let rotation=0;rotation<6;rotation++) {
    const anchorKey=`${q},${r}`,g=geometry(st,anchorKey,rotation,water);
    if(g.overlap)continue;
    const key=g.contacts>=4?(g.origin?'valid':'wrongOrigin'):(g.origin?'tooFew':null);
    if(key&&!attempts[key])attempts[key]={anchorKey,rotation,...g};
  }
  R.ok('independent fixture has valid, too-few and wrong-origin placements',!!attempts.valid&&!!attempts.tooFew&&!!attempts.wrongOrigin,attempts);
  for(const k of ['tooFew','wrongOrigin'])for(const side of ['A','B']) {
    const p=attempts[k],before=JSON.stringify(st),result=choose(st,'place|06',{tileId:'06',selectedFromKey:water,anchorKey:p.anchorKey,rotation:p.rotation,side});
    R.ok(`${k} ${side} rejected without losing tiles or effect`,!result.accepted&&JSON.stringify(st)===before,result.code);
  }
  const p=attempts.valid;
  for(const side of ['A','B']) {
    const r=choose(st,'place|06',{tileId:'06',selectedFromKey:water,anchorKey:p.anchorKey,rotation:p.rotation,side});
    R.ok(`valid four-contact placement ${side} including origin commits`,r.accepted&&r.state.tiles['06'].placed&&r.state.tiles['06'].side===side,r.code);
  }
  R.ok('hacked selectedFromKey cannot substitute another origin',!choose(st,'place|06',{selectedFromKey:'5,0',anchorKey:p.anchorKey,rotation:p.rotation,side:'A'}).accepted);
  const foreign=Game.projectState(st,'p2');
  R.ok('foreign snapshot carries no inspected IDs or stack order',!foreign.tileStack&&!foreign.cardResolution.astronomyInspected&&!foreign.cardResolution.astronomyTileId&&!foreign.pendingChoices[0].tileIds);
  R.ok('owner snapshot retains inspected tiles after serialization',Game.projectState(JSON.parse(JSON.stringify(st)),'p1').pendingChoices[0].tileIds.join()==='06,07');
  for(const end of ['bottom','top'])for(const order of ['forward','reverse']) {
    let s=astronomy();s=choose(s,'none').state;s=choose(s,`${end}|${order}`).state;
    const first=end==='top'?'15':order==='forward'?'07':'06';
    // A real deployed army starts ordinary exploration; no array-only proof.
    s.players[0].cardPlayed=false;s.players[0].armies[0].position='-1,0';
    s.players[0].armies[0].exploredThisMove=false;
    s.turnUndo=null;
    const result=act(s,'BEGIN_EXPLORATION',{fromKey:'-1,0',unitType:'army',unitId:s.players[0].armies[0].id});
    R.ok(`${end}/${order}: ordinary exploration actually draws ${first}`,result.accepted&&result.state.pendingExploration?.tileId===first,{code:result.code,draw:result.state.pendingExploration?.tileId});
  }
  // Capital neighbours may touch but never buy any of the four contacts.
  const setup=board('setup');setup.setup.phase='capital_tile';const ownTile=setup.setup.playerTiles.p1[0];
  Object.values(setup.map.hexes).forEach(h=>{h.active=false;h.core=false;h.fortress=false;});
  const cells=Game.getTileHexKeys('0,0',0,setup.map.hexes),set=new Set(cells);
  const ring=[...new Set(cells.flatMap(k=>Game.hexNeighborKeys(Game.parseQ(k),Game.parseR(k))).filter(k=>!set.has(k)))];
  for(let i=0;i<5;i++)Object.assign(setup.map.hexes[ring[i]],{active:true,core:i<4,tileId:i<4?'14':'02'});
  R.ok('capital may touch rival capital with four core contacts',Game.validateTilePlacement(setup,ownTile,'0,0',0).ok);
  setup.map.hexes[ring[3]].core=false;
  R.ok('rival capital contacts do not count toward four',!Game.validateTilePlacement(setup,ownTile,'0,0',0).ok);
  setup.map.hexes[ring[3]].fortress=true;
  R.ok('fort contacts count toward four',Game.validateTilePlacement(setup,ownTile,'0,0',0).ok);
  // Setup first player differs deliberately from the current turn's order.
  let d=board('district',4);d.setup.order=['p2','p1','p3','p4'];d.turn.order=['p4','p3','p1','p2'];
  Game.resolveEvent(d,'district_event');
  R.ok('district event starts at setup first player, not turn-order substitute',d.districtEvent.playerId==='p2');
  const before=JSON.stringify(d),head=d.pendingChoices[0];
  const fake={id:'later',kind:'district_order',playerId:'p4',remaining:1,options:[{id:'industrial'}]};d.pendingChoices.push(fake);
  const forbidden=act(d,'RESOLVE_PENDING_CHOICE',{choiceId:'later',optionId:'industrial'},'p4');
  R.ok('later player cannot answer their own district early',!forbidden.accepted&&forbidden.code==='district_priority',forbidden.code);
  d.pendingChoices.pop();
  R.ok('rejected district action leaves all effects unchanged',JSON.stringify(d)===before&&d.pendingChoices[0].id===head.id);
}catch(e){R.ok('focused rule scenarios completed',false,e.stack);}
console.log('playtest-rules-test:');R.print();if(R.fail)process.exitCode=1;
