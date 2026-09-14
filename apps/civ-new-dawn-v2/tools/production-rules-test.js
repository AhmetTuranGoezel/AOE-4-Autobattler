"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {reporter}=require("./browser-harness.js"),{finishSetup,cultureBoard}=require("./production-fixtures.js");
const R=reporter(),ctx=vm.createContext({console,structuredClone});ctx.window=ctx;
for(const f of ["rules-data.js","tile-art.js","game.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),ctx);
const G=vm.runInContext("Game",ctx);
let st=finishSetup(G,G.createState([G.createPlayer("p1","P1",G.SEAT_COLORS[0]),G.createPlayer("p2","P2",G.SEAT_COLORS[1])]));
st.gameId="production-regression";st.revision=100;
const originalRadius=st.map.radius;G.ensureMapHexes(st.map,["0,0"],2);G.ensureMapHexes(st.map,["0,0"],2);
R.ok("placing inside allocated map never grows the empty margin",st.map.radius===originalRadius);
const saved=G.checkpointState(st);
R.ok("canonical checkpoint has no second state",!saved.turnUndo?.snapshot);
const restored=G.unpackCheckpoint(structuredClone(saved));
R.ok("exact map survives checkpoint encoding",JSON.stringify(Object.entries(restored.map.hexes).map(([k,h])=>[k,Object.entries(h).sort()]))===JSON.stringify(Object.entries(st.map.hexes).map(([k,h])=>[k,Object.entries(h).sort()])));
for(const corrupt of [s=>s.map.hexRows[0][3]=-1,s=>s.map.hexColumns.push('__proto__'),s=>s.map.hexRows.push(s.map.hexRows[0]),s=>s.map.hexTemplates[0].push(999,null)]) {
  const invalid=structuredClone(saved);corrupt(invalid);const before=JSON.stringify(invalid);let rejected=false;
  try{G.unpackCheckpoint(invalid);}catch{rejected=true;}
  R.ok("invalid map encoding is rejected without partial restoration",rejected&&JSON.stringify(invalid)===before);
}
const past=structuredClone(st);st.revision=104;
for(const actor of ["p1","p2"]) {
  const before=JSON.stringify(st),r=G.tryApplyAction(st,{type:"RESTORE_REVISION",payload:{revision:100}},{actorId:actor,role:"player",recoveryState:past});
  R.ok(actor+" cannot invoke host history",!r.accepted&&r.code==="host_only"&&before===JSON.stringify(st));
}
const restoredResult=G.tryApplyAction(st,{type:"RESTORE_REVISION",payload:{revision:100}},{actorId:"p1",role:"host",recoveryState:past});
R.ok("trusted history restore advances recovery generation",restoredResult.accepted&&restoredResult.state.recoveryGeneration===(st.recoveryGeneration||0)+1,restoredResult.code);
R.ok("history restore keeps current revision for the next CAS",restoredResult.state.revision===104);
const wrong={...past,phase:"setup"};
R.ok("even recovery cannot re-enable setup",G.tryApplyAction(st,{type:"RESTORE_REVISION",payload:{revision:100}},{actorId:"p1",role:"host",recoveryState:wrong}).code==="setup_regression");
const face=G.getTileDef("11").sides.A.cells;
R.ok("Grand Mesa remains on cell 6",face[6].naturalWonder==="Grand Mesa");
for(const n of [7,9])R.ok(`Grand Mesa adjacent cell ${n} is mountain difficulty 5`,face[n].terrain==="mountain"&&G.terrainDifficulty(face[n])===5);
R.ok("Grand Mesa cell 8 remains printed desert",face[8].terrain==="desert");
R.ok("Grand Mesa token has no terrain and difficulty 5",G.terrainType(face[6])===null&&G.terrainDifficulty(face[6])===5);
st=cultureBoard(G,st,"p1");const p=st.players[0];
R.ok("Early Empire I with no bonuses is exactly two",G.getCultureMarkers(p,0,st)===2);
R.ok("one Culture trade is exactly one extra",G.getCultureMarkers(p,1,st)===3);
R.ok("effective slot five permits an empty adjacent mountain",G.getSlotValue(p,"culture",st)===5&&G.validControlHexes(st,p.id,5).has("1,0"));
R.ok("slot four rejects the same mountain",!G.validControlHexes(st,p.id,4).has("1,0"));
const action={type:"PLAY_CULTURE",payload:{playerId:"p1",hexKeys:["1,0","0,1","-1,1"],tradeSpent:0}};
R.ok("engine rejects a third marker atomically",!G.tryApplyAction(st,action,{actorId:"p1"}).accepted&&!st.map.hexes["1,0"].control);
action.payload.hexKeys.pop();
R.ok("engine accepts exactly two mountain markers in slot five",G.tryApplyAction(st,action,{actorId:"p1"}).accepted);
for(const [era,bonus] of [[null,0],["ancient",1],["medieval",2],["modern",3]]) {
  const french=structuredClone(st),fp=french.players[0];fp.leaderId="france";
  french.map.hexes["0,0"].city.wonder=era?{name:"France bonus fixture",era}:null;
  const parts=G.getCultureMarkerBreakdown(fp,1,french,5);
  R.ok(`France ${era||"no wonder"} breakdown keeps base, trade and era bonus separate`,parts.base===2&&parts.trade===1&&parts.franceBonus===bonus&&parts.total===3+bonus,parts);
}
// Drama's move is to an adjacent empty non-water space, not a second ordinary
// placement restricted by slot terrain or city adjacency.
const drama=structuredClone(st),dp=drama.players[0];dp.cardTiers.culture=2;dp.cardLevels.culture=2;
dp.focusRow=["culture","growth","economy","science","military","industry"];
drama.map.hexes["1,0"].terrain="grass";drama.map.hexes["0,1"].terrain="grass";
Object.assign(drama.map.hexes["2,0"],{active:true,terrain:"mountain"});
const placed=G.tryApplyAction(drama,{type:"PLAY_CULTURE",payload:{hexKeys:["1,0","0,1"],tradeSpent:0}},{actorId:"p1"});
const choice=placed.state.pendingChoices.find(c=>c.kind==="move_control_source");
R.ok("Drama places grass tokens from effective slot one",placed.accepted&&!!choice,placed.code);
if(choice){
  const source=G.tryApplyAction(placed.state,{type:"RESOLVE_PENDING_CHOICE",payload:{choiceId:choice.id,hexKey:"1,0"}},{actorId:"p1"});
  const dest=source.state.pendingChoices.find(c=>c.kind==="move_control_destination");
  R.ok("Drama can move onto an empty adjacent mountain outside city adjacency",source.accepted&&dest?.hexKeys.includes("2,0"));
  if(dest){const moved=G.tryApplyAction(source.state,{type:"RESOLVE_PENDING_CHOICE",payload:{choiceId:dest.id,hexKey:"2,0"}},{actorId:"p1"});
    R.ok("Drama actually moves the token without creating another",moved.accepted&&!moved.state.map.hexes["1,0"].control&&moved.state.map.hexes["2,0"].control?.ownerId==="p1"&&G.countControl(moved.state,"p1")===2,moved.code);
  }
}
st.turn.round=99;st.turn.index=st.turn.order.length-1;G.currentPlayer(st).cardPlayed=true;
const after=G.applyAction(st,{type:"END_TURN",payload:{playerId:G.currentPlayer(st).id}});
R.ok("round 100 does not invent a score victory",after.phase==="playing"&&!after.winner);
R.ok("Terra still deals five real victory cards",after.agendaCards.length===5);
R.print();if(R.fail)process.exitCode=1;
