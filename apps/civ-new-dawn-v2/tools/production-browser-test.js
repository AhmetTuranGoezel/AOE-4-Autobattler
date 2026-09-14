"use strict";
process.env.CIV_BROWSER_LATENCY_MS="100";
const {reporter,waitUntil,sleep}=require("./browser-harness.js");
const {room,click,hex,settled}=require("./playtest-browser-helpers.js");
const {cultureBoard}=require("./production-fixtures.js");
const R=reporter();
async function converge(table,revision) {
  if(await waitUntil(async()=>(await Promise.all(table.tabs.map(t=>t.eval("UI.debugState()?.revision")))).every(r=>r===revision),20000)<0)throw Error("No convergence at r"+revision+" "+JSON.stringify(await Promise.all(table.tabs.map(t=>t.eval("({revision:UI.debugState()?.revision,phase:UI.debugState()?.phase,info:UI.debugInfo(),net:Net.getStatus(),toast:document.querySelector('#toast')?.innerText})")))));
}
async function action(table,tab,type,payload={}) {
  const r=await tab.eval(`UI.dispatch(${JSON.stringify({type,payload})})`);
  if(r.status!=="accepted")throw Error(type+": "+JSON.stringify(r));
  await converge(table,r.revision);return r;
}
async function drain(table) {
  for(let i=0;i<50;i++) {
    const c=await table.tabs[0].eval("UI.debugState().pendingChoices?.[0]||null");if(!c)return;
    const tab=table.tabs[table.profiles.findIndex(p=>p.id===c.playerId)],p={choiceId:c.id};
    if(c.optional)p.dismiss=true;else if(c.options?.length)p.optionId=c.options.find(o=>!o.disabled).id;
    else if(c.hexKeys?.length)p.hexKey=c.hexKeys[0];else throw Error("No choice solution "+JSON.stringify(c));
    await action(table,tab,"RESOLVE_PENDING_CHOICE",p);
  }
  throw Error("Choice chain did not finish");
}
async function reloadSeat(tab) {
  await tab.eval("window.__oldProductionDocument=true");await tab.reload();
  if(await waitUntil(async()=>{try{return await tab.eval("!window.__oldProductionDocument && !!document.querySelector('.resume-session')");}catch{return false;}},20000)<0)throw Error("No resume control");
  await click(tab,".resume-session");
  if(await waitUntil(()=>tab.eval("Net.getStatus().phase==='synced'"),30000)<0)throw Error("Seat failed to resume");
}
async function fullSetup(table) {
  for(let n=0;n<table.tabs.length;n++)await action(table,table.tabs[n],"SET_LEADER",{leaderId:["china","egypt","france"][n]});
  await action(table,table.tabs[0],"START_GAME");
  for(let guard=0;guard<20;guard++) {
    const next=await table.tabs[0].eval("({phase:UI.debugState().phase,setup:UI.debugState().setup.phase,id:UI.debugState().setup.order[UI.debugState().setup.turnIndex]})");
    if(next.phase==="playing")break;
    const tab=table.tabs[table.profiles.findIndex(p=>p.id===next.id)];
    for(const other of table.tabs.filter(t=>t!==tab))R.ok("waiting setup seat has no fake action buttons",await other.eval("document.querySelectorAll('#wizard button').length===0"),await other.eval("document.querySelector('#wizard').innerHTML"));
    if(next.setup==="fortress") {
      R.ok("fortress setup has no dead buttons",await tab.eval("document.querySelectorAll('#wizard button').length===0"));
      const k=await tab.eval("[...Game.getValidFortressHexes(UI.debugState())][0]");
      await hex(tab,k);await settled(tab);
    } else {
      const before=await tab.eval("UI.debugState().revision");
      R.ok("capital setup has exactly three useful controls",await tab.eval("[...document.querySelectorAll('#wizard button')].map(b=>b.id).join(',')==='rot-dec,rot-inc,side-toggle'"));
      const rotation=await tab.eval("UI.debugInfo().tilePlacement.rotation");
      await click(tab,"#rot-inc");R.ok("Rotate right changes orientation",await tab.eval(`UI.debugInfo().tilePlacement.rotation===${(rotation+1)%6}`));
      await click(tab,"#rot-dec");R.ok("Rotate left reverses orientation",await tab.eval(`UI.debugInfo().tilePlacement.rotation===${rotation}`));
      await click(tab,"#side-toggle");R.ok("Flip changes the side without a revision",await tab.eval(`UI.debugInfo().tilePlacement.side==='B'&&UI.debugState().revision===${before}`));
      const plan=await tab.eval(`(()=>{const s=UI.debugState(),tileId=s.setup.playerTiles[UI.debugInfo().localPlayerId][0];for(const k of Object.keys(s.map.hexes)){const p=Game.tilePlacementFor(s,tileId,k,0);if(p)return {k,rotation:p.rotation};}})()`);
      while(await tab.eval("UI.debugInfo().tilePlacement.rotation")!==plan.rotation)await click(tab,"#rot-inc");
      await hex(tab,plan.k);await settled(tab);
    }
    await converge(table,await tab.eval("UI.debugState().revision"));
  }
  R.ok("full three-seat setup enters play",(await Promise.all(table.tabs.map(t=>t.eval("UI.debugState().phase==='playing'&&UI.debugState().setup.phase==='done'")))).every(Boolean));
  await drain(table);
}
if(require.main===module)(async()=>{
  let table;
  try {
    table=await room(3);const [host,guest,observer]=table.tabs;
    await host.eval(`(()=>{const original=CivSessionApi.checkpoint;window.__maxCheckpointBytes=0;CivSessionApi.checkpoint=async(gameId,body,...args)=>{window.__maxCheckpointBytes=Math.max(window.__maxCheckpointBytes,new TextEncoder().encode(JSON.stringify({...body,op:'checkpoint'})).length);if(window.__failBackup==='before'){window.__failBackup=null;throw Error('lost request');}const r=await original(gameId,body,...args);if(window.__failBackup==='after'){window.__failBackup=null;throw Error('lost response');}return r;};})()`);
    await fullSetup(table);
    const capital=await host.eval(`(()=>{const s=UI.debugState();return Object.entries(s.map.hexes).find(([,h])=>h.city?.isCapital&&h.city.ownerId===s.players[1].id)[0];})()`);
    // Stage a substantial capital tableau, then commit it through the real host
    // checkpoint. The reconnect itself never uses fixtures or debugSetState.
    await host.eval(`(()=>{const s=UI.debugState(),k=${JSON.stringify(capital)},h=s.map.hexes[k],p=Game.getPlayer(s,h.city.ownerId);p.armies[0].position=k;p.caravans[0].position=k;
      const n=Object.values(s.map.hexes).find(x=>x.tileId===h.tileId&&!x.city&&!x.cityState&&x.terrain!=='water');n.control={ownerId:p.id,fortified:true,district:'campus'};n.resource=null;return true;})()`);
    await action(table,host,"HOST_EDIT_HEX",{hexKey:capital,changes:{terrain:"grass"}});
    for(let turn=0;turn<6;turn++) {
      await drain(table);const id=await host.eval("Game.currentPlayer(UI.debugState()).id"),tab=table.tabs[table.profiles.findIndex(p=>p.id===id)];
      await action(table,tab,"PLAY_SCIENCE",{tradeSpent:0});await drain(table);await action(table,tab,"END_TURN");
    }
    await drain(table);
    const before=await host.eval("JSON.stringify({map:UI.debugState().map,players:UI.debugState().players,phase:UI.debugState().phase,revision:UI.debugState().revision})");
    const ids=await Promise.all(table.tabs.map(t=>t.eval("Net.getCredentials().seatId")));
    await guest.eval("window.__oldProductionDocument=true");await reloadSeat(guest);
    const revision=await host.eval("UI.debugState().revision");await converge(table,revision);
    R.ok("one-client reconnect leaves the authoritative map byte-identical",before===await host.eval("JSON.stringify({map:UI.debugState().map,players:UI.debugState().players,phase:UI.debugState().phase,revision:UI.debugState().revision})"));
    R.ok("same authenticated seat returns",ids[1]===await guest.eval("Net.getCredentials().seatId"));
    const maps=await Promise.all(table.tabs.map(t=>t.eval("JSON.stringify(UI.debugState().map)")));
    R.ok("all peers retain the exact capital tile and map",maps.every(m=>m===maps[0]));
    R.ok("playing reconnect exposes no setup controls",await guest.eval("UI.debugState().phase==='playing'&&!document.querySelector('#rot-inc')&&!/place your capital/i.test(document.querySelector('#wizard').innerText)"));
    R.ok("other two peers stay connected",await host.eval("Net.getStatus().roster.every(p=>p.status==='online')")&&await observer.eval("Net.getStatus().phase==='synced'"));
    const r0=await host.eval("UI.debugState().revision"),terrain=await host.eval(`UI.debugState().map.hexes[${JSON.stringify(capital)}].terrain`);
    await action(table,host,"HOST_EDIT_HEX",{hexKey:capital,changes:{terrain:"mountain"}});
    await host.eval("window.confirm=()=>true");await click(host,"#btn-emergency-undo");
    if(await waitUntil(()=>host.eval("!!document.querySelector('#recovery-revision')"),10000)<0)throw Error("No recovery picker");
    await host.eval(`document.querySelector('#recovery-revision').value='${r0}'`);
    await click(host,"#recovery-confirm");await settled(host);await converge(table,r0+2);
    R.ok("chosen older revision restores to a NEW monotonic revision",await host.eval(`UI.debugState().revision===${r0+2}&&UI.debugState().recoveryGeneration===1&&UI.debugState().map.hexes[${JSON.stringify(capital)}].terrain===${JSON.stringify(terrain)}`));
    R.ok("restored head is broadcast to all peers without reload",(await Promise.all(table.tabs.map(t=>t.eval("UI.debugState().recoveryGeneration===1")))).every(Boolean));
    const gameId=await host.eval("Net.getCredentials().gameId");
    R.ok("host has at least twenty separate revision records",(await host.eval(`CivSessionStore.listHistory(${JSON.stringify(gameId)})`)).length>=20);
    await host.eval("window.__failBackup='before'");
    const lost=await host.eval(`UI.dispatch({type:'HOST_EDIT_HEX',payload:{hexKey:${JSON.stringify(capital)},changes:{terrain:'desert'}}})`);
    R.ok("lost HTTP request never advances local authority",lost.status==="rejected"&&await host.eval(`UI.debugState().revision===${r0+2}`),lost);
    await click(host,"#btn-net-retry");await waitUntil(()=>host.eval("!UI.debugInfo().backupFailure && Net.getStatus().phase==='synced'"),15000);
    await host.eval("window.__failBackup='after'");
    const ack=await action(table,host,"HOST_EDIT_HEX",{hexKey:capital,changes:{terrain:"hill"}});
    R.ok("lost HTTP ACK is recovered as one committed revision",ack.revision===r0+3);
    await host.eval(`(()=>{const save=CivSessionStore.saveCheckpoint;CivSessionStore.saveCheckpoint=async(...args)=>{CivSessionStore.saveCheckpoint=save;throw Error('local disk unavailable');};window.__failBackup='after';})()`);
    const durable=await action(table,host,"HOST_EDIT_HEX",{hexKey:capital,changes:{terrain:"forest"}});
    R.ok("lost HTTP ACK plus failed local write still confirms the durable action exactly once",durable.revision===r0+4);
    console.log("production browser: full setup, reconnect, history and HTTP failure paths completed");

    // Controlled rule/UI board, still using all three live peers and durable ACKs.
    await host.eval(`UI.debugSetState((${cultureBoard.toString()})(Game,UI.debugState(),${JSON.stringify(table.profiles[1].id)}))`);
    await action(table,host,"HOST_EDIT_HEX",{hexKey:"0,0",changes:{terrain:"grass"}});
    for(const type of ["growth","economy","science","military","industry","culture"]) {
      const baseline=await guest.eval("JSON.stringify(UI.debugState())");
      await click(guest,`.fcard[data-card="${type}"]`);
      R.ok(`${type} first click selects THAT card with zero gameplay mutation`,baseline===await guest.eval("JSON.stringify(UI.debugState())")&&await guest.eval(`UI.debugInfo().subPhase==='card_selected'&&!!document.querySelector('#wiz-start')&&document.querySelector('.fcard.selected')?.dataset.card===${JSON.stringify(type)}`));
    }
    R.ok("Culture preview explains two base markers",await guest.eval("/Markers to place: 2/.test(document.querySelector('#wizard').innerText)&&/2 base/.test(document.querySelector('#wizard').innerText)"));
    await click(guest,"#wiz-start");
    R.ok("Culture remaining begins at two",await guest.eval("/Remaining: 2 of 2/.test(document.querySelector('#wizard').innerText)"));
    R.ok("slot five mountain is clickable in the real UI",await guest.eval("UI.debugInfo().validHexes.includes('1,0')"));
    await hex(guest,"1,0");await hex(guest,"0,1");await hex(guest,"-1,1");await settled(guest);
    R.ok("third Culture target cannot create an extra token",await guest.eval("!!UI.debugState().map.hexes['1,0'].control&&!!UI.debugState().map.hexes['0,1'].control&&!UI.debugState().map.hexes['-1,1'].control"));
    for(const variant of ["trade","france","slot-four"]) {
      await host.eval(`(()=>{const s=(${cultureBoard.toString()})(Game,UI.debugState(),${JSON.stringify(table.profiles[1].id)}),p=Game.getPlayer(s,${JSON.stringify(table.profiles[1].id)});
        if(${JSON.stringify(variant)}==='trade')p.trade.culture=1;
        if(${JSON.stringify(variant)}==='france'){p.leaderId='france';s.map.hexes['0,0'].city.wonder={name:'Colossus',era:'ancient'};}
        if(${JSON.stringify(variant)}==='slot-four')p.focusRow=['growth','economy','science','military','culture','industry'];
        UI.debugSetState(s);})()`);
      await action(table,host,"HOST_EDIT_HEX",{hexKey:"0,0",changes:{terrain:"grass"}});
      await click(guest,'.fcard[data-card="culture"]');
      if(variant==='trade') {
        await click(guest,'#tc-inc');
        R.ok("Culture trade bonus is explained, not silently added",await guest.eval("/Markers to place: 3/.test(document.querySelector('#wizard').innerText)&&/2 base \\+ 1 Culture trade/.test(document.querySelector('#wizard').innerText)"));
        const before=await guest.eval("JSON.stringify(UI.debugState())");
        await click(guest,'.fcard[data-card="growth"]');await click(guest,'.fcard[data-card="culture"]');
        R.ok("changing card previews clears uncommitted trade without spending it",before===await guest.eval("JSON.stringify(UI.debugState())")&&await guest.eval("/Markers to place: 2/.test(document.querySelector('#wizard').innerText)&&document.querySelector('#tc-val').innerText==='0'"));
      } else if(variant==='france') {
        R.ok("France's ancient wonder explains the legitimate third marker",await guest.eval("/Markers to place: 3/.test(document.querySelector('#wizard').innerText)&&/2 base \\+ 1 France/.test(document.querySelector('#wizard').innerText)"));
      } else {
        await click(guest,'#wiz-start');
        R.ok("same mountain is not clickable from effective slot four",await guest.eval("!UI.debugInfo().validHexes.includes('1,0')"));
        await click(guest,'#wiz-cancel2');
      }
    }
    await host.eval(`UI.debugSetState((${cultureBoard.toString()})(Game,UI.debugState(),${JSON.stringify(table.profiles[1].id)}))`);
    await action(table,host,"HOST_EDIT_HEX",{hexKey:"0,0",changes:{terrain:"grass"}});
    const scienceBefore=await guest.eval("({revision:UI.debugState().revision,tech:Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).tech})");
    await click(guest,'.fcard[data-card="science"]');await click(guest,"#wiz-start");await settled(guest);await converge(table,scienceBefore.revision+1);
    R.ok("Science Start Action resolves exactly once",await guest.eval(`UI.debugState().revision===${scienceBefore.revision+1}&&Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).tech>${scienceBefore.tech}`));
    // Each fault uses a live client move; no direct reducer call is substituted.
    for(const fault of ["request","ack","stale"]) {
      await host.eval(`UI.debugSetState((${cultureBoard.toString()})(Game,UI.debugState(),${JSON.stringify(table.profiles[1].id)}))`);
      await action(table,host,"HOST_EDIT_HEX",{hexKey:"0,0",changes:{terrain:"grass"}});
      const base=await host.eval("UI.debugState().revision");
      const target=fault==="ack"?host:guest;
      await target.eval(`window.__productionFault={type:'${fault==="ack"?"actionResult":"action"}',remaining:1,hold:${fault==="stale"}}`);
      const pending=guest.eval("UI.dispatch({type:'PLAY_SCIENCE',payload:{tradeSpent:0}})");
      await waitUntil(()=>target.eval("window.__productionFault.remaining===0"),5000);
      if(fault==="stale") {
        await action(table,host,"HOST_EDIT_HEX",{hexKey:"0,0",changes:{terrain:"hill"}});
        await guest.eval("window.__releaseProductionPacket()");
      }
      const result=await pending;
      R.ok(`${fault} PeerJS fault has a single definite result`,fault==="stale"?result.status==="rejected"&&result.code==="stale_revision":result.status==="accepted",result);
      await converge(table,base+1);
      R.ok(`${fault} never applies an action twice`,await host.eval(`UI.debugState().revision===${base+1}`));
    }
    // Hover the real printed Grand Mesa terrain data at actual map coordinates.
    await host.eval(`(()=>{const s=UI.debugState();Game.placeExploredTile(s,'11','0,0',0,'A');UI.debugSetState(s);})()`);
    await action(table,host,"HOST_EDIT_HEX",{hexKey:"0,0",changes:{terrain:"hill"}});
    for(const cell of [7,9]) {
      const k=await host.eval(`Game.getTileHexKeys('0,0',0,UI.debugState().map.hexes)[${cell}]`);
      await hex(host,k,false);const tip=await host.eval("document.querySelector('#map-tooltip').innerText");
      R.ok(`Grand Mesa cell ${cell} tooltip is Mountain (diff 5)`,/Mountain.*diff\s*5/i.test(tip),tip);
    }
    R.info("largest actual HTTP checkpoint in browser run",await host.eval("window.__maxCheckpointBytes")+" bytes");
    R.ok("no uncaught browser errors",table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));
  }catch(e){R.ok("production browser scenario completed",false,e.stack);}
  finally{table?.close();}
  console.log("production-browser-test:");R.print();if(R.fail)process.exitCode=1;
})();
module.exports={fullSetup,R};
