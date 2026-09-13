"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { reporter } = require("./browser-harness.js");
const { playtestBoard } = require("./playtest-fixtures.js");
const { transform } = require("./reliability-faults.cjs");
const R = reporter(), ctx = vm.createContext({ console, structuredClone }); ctx.window = ctx;
for (const f of ["rules-data.js", "tile-art.js", "game.js"]) vm.runInContext(transform(f,fs.readFileSync(path.join(__dirname,"..",f),"utf8")),ctx);
const G = vm.runInContext("Game",ctx);
const profiles = [1,2,3].map((n,i)=>({id:`p${n}`,name:`P${n}`,color:G.SEAT_COLORS[i]}));
const fixture = () => G.migrateState(playtestBoard(G,profiles,"movement"));
const act = (st,type,payload={},actorId="p1",role="player") => G.tryApplyAction(st,{type,payload},{actorId,role});
const req = (st,route=[],extra={}) => ({playerId:"p1",unitType:"caravan",unitId:st.players[0].caravans[0].id,
  cardId:G.getRowCards(st.players[0])[0].id,cardIndex:0,tradeSpent:0,startKey:"-5,0",toKey:route.at(-1)||"-5,0",route,...extra});
const inspect = (st,route=[],extra={},actorId="p1") => G.inspectMovement(st,req(st,route,extra),{actorId});
function pick(st,optionId,extra={}) {
  const c=st.pendingChoices[0];
  const r=act(st,"RESOLVE_PENDING_CHOICE",{choiceId:c.id,optionId,...extra},c.playerId);
  if(!r.accepted) throw Error(`Choice ${c.kind}/${c.source}: ${r.code}`);
  return r.state;
}
function normalTrade(st) {
  while(st.pendingChoices[0]?.source==="Trade run") st=pick(st,"culture");
  if(st.pendingChoices[0]?.kind==="take_diplomacy") st=pick(st,st.pendingChoices[0].options[0].id);
  return st;
}
function arrival(full=false,duplicate=false) {
  const st=fixture(), [holder,ottoman]=st.players;
  ottoman.leaderId="ottoman";st.ibrahimHolder=holder.id;
  st.map.hexes["6,0"].city={ownerId:ottoman.id,isCapital:true,developed:false};
  if(duplicate) holder.focusRow[5]={type:"culture",tier:2,trade:0};
  if(full) {for(const p of st.players) for(const t of G.FOCUS_TYPES)p.trade[t]=3;holder.trade.culture=2;ottoman.trade.science=2;}
  G.migrateState(st);
  const result=act(st,"PLAY_ECONOMY",req(st,["-4,0","4,0","5,0","6,0"]));
  if(!result.accepted)throw Error("Arrival: "+result.code);
  return result.state;
}

try {
  for(const route of [["-4,0"],["-4,0","4,0"],["-4,0","4,0","5,0"],["-4,0","4,0","5,0","6,0"]]) {
    const st=fixture(),before=JSON.stringify(st),a=inspect(st,route);
    R.ok(`Indonesia route ${route.join(" > ")} costs ${route.length}`,a.ok&&a.spent===route.length&&a.remaining===4-route.length,a);
    R.ok("assessment never mutates authority",JSON.stringify(st)===before);
    const view=G.projectState(st,"p1"),b=inspect(view,route);
    R.ok("projected and host movement agree",JSON.stringify(a)===JSON.stringify(b));
    const result=act(st,"PLAY_ECONOMY",req(st,route));
    R.ok("the reducer accepts exactly the previewed route",result.accepted&&result.state.players[0].caravans[0].position===route.at(-1),result.code);
  }
  for(const [label,setup,extra,code] of [
    ["foreign seat",()=>{},{},"movement_owner_mismatch"],
    ["wrong civilization",s=>s.players[0].leaderId="china",{},"movement_unreachable"],
    ["armies have no distant adjacency",s=>s.players[0].armies[0].position="-5,0",{unitType:"army",cardId:null,cardIndex:4},"movement_unreachable"],
    ["wrong card",()=>{},{cardIndex:3},"movement_card_mismatch"],
    ["removed card identity",()=>{},{cardId:"removed"},"movement_card_mismatch"],
    ["unpaid movement",()=>{},{tradeSpent:1},"movement_payment_mismatch"],
    ["moved unit",s=>s.players[0].caravans[0].movedThisCard=true,{},"movement_exhausted"],
    ["changed generation",s=>s.recoveryGeneration=2,{recoveryGeneration:1},"movement_state_changed"],
    ["pending choice",s=>s.pendingChoices=[{id:"choice",playerId:"p2",kind:"gain_resource",options:[{id:"oil"}]}],{},"movement_pending_decision"]
  ]) {
    const st=fixture();setup(st);const p={...extra};if(p.unitType==="army")p.unitId=st.players[0].armies[0].id;
    const before=JSON.stringify(st),r=inspect(st,["-4,0","4,0"],p,label==="foreign seat"?"p2":"p1");
    R.ok(label+" has a specific rejection",!r.ok&&r.code===code,r.code);
    R.ok(label+" leaves state byte-identical",JSON.stringify(st)===before);
  }
  {
    const st=fixture();
    for(const k of G.hexNeighborKeys(4,0))st.map.hexes[k].active=true;
    R.ok("new topology removes a formerly exposed edge-water jump",!inspect(st,["-4,0","4,0"]).ok);
    st.map.hexes["4,1"].active=false;
    R.ok("active map topology reopens the one-step edge transition",inspect(st,["-4,0","4,0"]).spent===2);
    R.ok("an exhausted four-step route cannot continue",!inspect(st,["-4,0","4,0","5,0","6,0","5,0"]).ok);
  }
  {
    const st=fixture();delete st.players[0].focusCardIds;delete st.players[0].focusCardSerial;
    G.migrateState(st);const first=JSON.stringify(st);G.migrateState(st);
    R.ok("legacy card identities migrate deterministically and idempotently",JSON.stringify(st)===first);
    const id=G.getRowCards(st.players[0])[0].id;
    const moved=act(st,"PLAY_ECONOMY",req(st,["-4,0"])).state;
    R.ok("reset moves the physical ID with the card",G.getRowCards(moved.players[0])[0].id===id);
    st.players[0].focusRow[5]={type:"economy",tier:1,trade:0};G.migrateState(st);
    R.ok("ambiguous legacy movement cannot choose the first matching type",!inspect(st,[],{cardId:null,cardIndex:undefined}).ok);
  }
  for(const water of [false,true]) {
    let st=fixture();st.map.hexes["-6,0"].tileId="01";st.map.hexes["-5,0"].tileId="01";
    const begun=act(st,"BEGIN_EXPLORATION",{...req(st),fromKey:"-5,0"});
    R.ok("Shipbuilding binds the optional window to its physical card",begun.accepted&&begun.state.pendingChoices[0]?.cardId===req(st).cardId);
    st=begun.state;const c=st.pendingChoices[0];
    const key=c.hexKeys[0];st=pick(st,undefined,water?{hexKey:key}:{dismiss:true});
    R.ok(`Shipbuilding ${water?"placement":"skip"} reveals once and spends one movement`,!!st.pendingExploration&&st.pendingExploration.movementContinuation.remaining===3);
    R.ok("water token and reveal are committed atomically",(st.map.hexes[key].tileId==="water-token")===water,st.map.hexes[key]);
    const restored=G.migrateState(JSON.parse(JSON.stringify(st)));
    R.ok("exploration survives checkpoint and owner projection",G.projectState(restored,"p1").pendingExploration.movementContinuation.cardId===req(st).cardId);
    const placement=G.getLegalExplorationPlacements(st,st.pendingExploration)[0];
    if(placement) {
      const r=act(st,"PLACE_EXPLORED_TILE",placement);R.ok("placement preserves remaining movement",r.accepted&&r.state.movementContinuation.remaining===3);
      if(r.accepted) {
        const a=inspect(r.state,["-4,0","4,0"]);R.ok("post-exploration continuation uses three, not four, movement",a.ok&&a.remaining===1,a);
      }
    } else R.ok("an unplaceable tile is checked against both sides",G.canAbandonExploration(st,"p1").ok);
  }
  {
    const st=fixture();st.players[0].uniqueTaken=false;st.map.hexes["-6,0"].tileId="01";st.map.hexes["-5,0"].tileId="01";
    const r=act(st,"BEGIN_EXPLORATION",{...req(st),fromKey:"-5,0"});
    R.ok("Currency II does not offer Shipbuilding's water token",r.accepted&&!!r.state.pendingExploration&&!r.state.pendingChoices.length);
  }
  {
    let st=fixture();G.finalizeSetup(st);st.revision=99;
    const owner="p1",snap=st.turnUndo.snapshotId;
    const r=act(st,"PLAY_SCIENCE",{cardIndex:3,tradeSpent:0});st=r.state;
    R.ok("genuine turn boundary arms normal undo",r.accepted&&G.getUndoStatus(st,owner).canUndo);
    R.ok("guest receives availability, never the recovery state",G.getUndoStatus(G.projectState(st,owner),owner).canUndo&&!G.projectState(st,owner).turnUndo);
    for(const id of ["p2","p3"]) {
      const before=JSON.stringify(st),bad=act(st,"UNDO_TURN",{},id,"host");
      R.ok("another seat cannot normal-undo for the player",!bad.accepted&&JSON.stringify(st)===before);
    }
    const undone=act(st,"UNDO_TURN");
    R.ok("normal undo atomically restores and increments generation",undone.accepted&&undone.state.players[0].tech===0&&undone.state.recoveryGeneration===1&&undone.state.revision===99);
    R.ok("undo creates a different confirmation identity",undone.state.turnUndo.snapshotId!==snap);
    st=undone.state;st.map.hexes["-6,0"].tileId="01";
    const begun=act(st,"BEGIN_EXPLORATION",{unitType:"army",unitId:st.players[0].armies[0].id,cardIndex:4,startKey:"-6,0",fromKey:"-6,0"});
    st=begun.state;
    R.ok("revealing locks normal undo and retains emergency recovery",begun.accepted&&!G.getUndoStatus(st,owner).canUndo&&G.getUndoStatus(st,"p2",{role:"host"}).canEmergencyUndo&&!!st.turnUndo.snapshot);
    const snapshotId=G.getUndoStatus(st,"p2",{role:"host"}).snapshotId;
    R.ok("player cannot invoke emergency recovery",!act(st,"EMERGENCY_UNDO_TURN",{snapshotId},owner).accepted);
    R.ok("obsolete emergency confirmation is refused",!act(st,"EMERGENCY_UNDO_TURN",{snapshotId:"old"},"p2","host").accepted);
    st=G.migrateState(JSON.parse(JSON.stringify(st)));
    const recovered=act(st,"EMERGENCY_UNDO_TURN",{snapshotId},"p2","host");
    R.ok("host can recover another seat after checkpoint reload",recovered.accepted&&!recovered.state.pendingExploration&&recovered.state.recoveryGeneration===2&&recovered.state.revision===99,recovered.code);
    R.ok("no recursive recovery snapshot is retained",!recovered.state.turnUndo.snapshot.turnUndo);
    R.ok("restored turn can be played without reconnect",act(recovered.state,"PLAY_SCIENCE",{tradeSpent:0}).accepted);
    const legacy=fixture();legacy.turnUndo=null;
    const action=act(legacy,"PLAY_SCIENCE",{tradeSpent:0});
    R.ok("mid-turn legacy saves never fabricate a start snapshot",action.accepted&&!action.state.turnUndo&&!G.getUndoStatus(action.state,"p1",{role:"host"}).canEmergencyUndo);
  }
  {
    let st=arrival();const beforeRow=st.players[0].focusCardIds.join();
    R.ok("normal trade is the only exposed first arrival decision",st.pendingChoices.length===1&&st.pendingChoices[0].source==="Trade run"&&st.pendingChoices[0].amount===2);
    R.ok("Economy remains open through arrival",!!st.activeCard&&!st.players[0].cardPlayed);
    st=normalTrade(st);let c=st.pendingChoices[0];
    R.ok("normal two tokens are not replaced by Ibrahim",st.players[0].trade.culture===2&&c.source==="Ibrahim"&&c.playerId==="p1");
    for(const actor of ["p2","p3"])for(const role of ["player","host"]) {
      const before=JSON.stringify(st),r=act(st,"RESOLVE_PENDING_CHOICE",{choiceId:c.id,optionId:"industry"},actor,role);
      R.ok(`${actor}/${role} cannot answer holder's Ibrahim choice`,!r.accepted&&JSON.stringify(st)===before,r.code);
    }
    st=pick(st,"industry");st=G.migrateState(JSON.parse(JSON.stringify(st)));c=st.pendingChoices[0];
    R.ok("Ottoman independently chooses after reconnect",c.playerId==="p2"&&c.source==="Ibrahim"&&st.players[0].focusCardIds.join()===beforeRow);
    R.ok("holder cannot answer the Ottoman decision",!act(st,"RESOLVE_PENDING_CHOICE",{choiceId:c.id,optionId:"science"}).accepted);
    R.ok("observer view reveals no queued arrival decisions",!G.projectState(st,"p3").arrivalResolution.queue&&!G.projectState(st,"p3").pendingChoices[0].options);
    st=pick(st,"science");
    R.ok("visitor receives three total and Ottoman one on chosen cards",st.players[0].trade.culture===2&&st.players[0].trade.industry===1&&st.players[1].trade.science===1&&st.players[0].trade.economy===0);
    R.ok("only after both recipients does Economy finish",!st.arrivalResolution&&!st.activeCard&&st.players[0].cardPlayed);
  }
  {
    let st=normalTrade(arrival(true));
    R.ok("full holder cards skip safely to the Ottoman",st.pendingChoices[0]?.playerId==="p2"&&st.pendingChoices[0]?.source==="Ibrahim");
    R.ok("full-card overflow is explicitly returned to supply",st.log.some(l=>/supply/.test(typeof l==="string"?l:l.text||l.msg||"")),st.log.slice(-6));
    st=pick(st,"science");R.ok("capacity is never exceeded",G.getRowCards(st.players[1]).every(c=>c.trade<=3)&&!st.arrivalResolution);
  }
  {
    let st=arrival(false,true),c=st.pendingChoices[0];
    const choices=c.options.filter(o=>o.id.startsWith("card|"));
    R.ok("Oxford duplicates have distinct physical trade destinations",choices.length===2&&choices[0].cardId!==choices[1].cardId);
    R.ok("removed Industry card is never offered",!c.options.some(o=>o.id==="industry"));
    R.ok("ambiguous type-only trade is refused",!act(st,"RESOLVE_PENDING_CHOICE",{choiceId:c.id,optionId:"culture"}).accepted);
    const targetId=choices[1].cardId;st=pick(st,choices[1].id);
    R.ok("trade reaches only the selected duplicate",G.getRowCards(st.players[0]).find(c=>c.id===targetId).trade===1&&st.players[0].trade.culture===0);
  }
} catch(e) { R.ok("reliability scenario completed",false,e.stack); }
console.log("reliability-rules-test:");R.print();if(R.fail)process.exitCode=1;
