"use strict";
process.env.CIV_BROWSER_LATENCY_MS ||= "250"; // 500 ms round trip, plus delayed duplicate messages.
const { reporter, waitUntil, sleep } = require("./browser-harness.js");
const { room, seedRoom, click, hex, settled } = require("./playtest-browser-helpers.js");
const R=reporter();
async function synced(table, revision) {
  if(await waitUntil(async()=> (await Promise.all(table.tabs.map(t=>t.eval("UI.debugState()?.revision")))).every(r=>r===revision),20000)<0)
    throw Error("Peers failed to agree at r"+revision);
}
async function resume(tab) {
  await tab.eval("window.__oldReliabilityDocument=true");await tab.reload();
  if(await waitUntil(async()=>{try{return await tab.eval("!window.__oldReliabilityDocument && !!document.querySelector('.resume-session')");}
    catch(e){if(/navigated|context.*destroyed/.test(e.message))return false;throw e;}},20000)<0)throw Error("No saved session to resume");
  await click(tab,".resume-session");
  if(await waitUntil(()=>tab.eval("!!UI.debugState() && Net.getStatus().phase==='synced'"),45000)<0)throw Error("Resume did not synchronize");
}
async function submit(table,tab,type,payload={}) {
  const result=await tab.eval(`UI.dispatch(${JSON.stringify({type,payload})})`);
  if(result.status!=="accepted")throw Error(`${type}: ${result.code} ${result.message}`);
  await synced(table,result.revision);return result;
}
async function choose(table,tab,option) {
  const rev=await tab.eval("UI.debugState().revision");
  await click(tab,`.pending-option[data-option="${option}"]`);await settled(tab);await synced(table,rev+1);
}
async function drainEvents(table) {
  for(let guard=0;guard<40;guard++) {
    const choice=await table.tabs[0].eval("UI.debugState().pendingChoices?.[0] || null");
    if(!choice)return;
    const tab=table.tabs[table.profiles.findIndex(p=>p.id===choice.playerId)];
    const payload={choiceId:choice.id};
    if(choice.optional)payload.dismiss=true;
    else if(choice.options?.some(o=>!o.disabled))payload.optionId=choice.options.find(o=>!o.disabled).id;
    else if(choice.hexKeys?.length)payload.hexKey=choice.hexKeys[0];
    else throw Error('No legal event decision: '+JSON.stringify(choice));
    await submit(table,tab,"RESOLVE_PENDING_CHOICE",payload);
  }
  throw Error('Event chain did not finish');
}
(async()=>{
  let table;
  try {
    table=await room(3);const [host,mover,observer]=table.tabs;
    const order=[table.profiles[1],table.profiles[0],table.profiles[2]];
    await seedRoom(table,"movement",order);
    const revision=await mover.eval("UI.debugState().revision");
    await click(mover,'.fcard[data-card="economy"]');
    await click(mover,'#wiz-start');
    for(const k of ["-5,0","-4,0","4,0","5,0","6,0"])await hex(mover,k);
    R.ok("exhausting movement only previews, never submits",await mover.eval(`UI.debugState().revision===${revision} && UI.debugInfo().movement.remaining===0 && !Net.__debug().pendingEnvelope`));
    await hex(mover,"6,0");await click(mover,"#bc-back-step");
    R.ok("same-space click and Back One Step do not submit",await mover.eval(`UI.debugState().revision===${revision} && UI.debugInfo().movement.remaining===1`));
    await click(mover,"#bc-clear-route");
    R.ok("Clear Route restores only the uncommitted allowance",await mover.eval(`UI.debugState().revision===${revision} && UI.debugInfo().movement.currentKey==='-5,0' && UI.debugInfo().movement.remaining===4`));
    for(const k of ["-4,0","4,0","5,0"])await hex(mover,k);
    await mover.eval("(()=>{const b=document.querySelector('#bc-done');b.click();b.click();})()");
    R.ok("route remains selected during the 500 ms acknowledgment",await mover.eval("UI.debugInfo().actionPending && UI.debugInfo().movement?.currentKey==='5,0'"));
    await settled(mover);await synced(table,revision+1);
    R.ok("double confirmation commits exactly once",await mover.eval(`UI.debugState().revision===${revision+1} && Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).caravans[0].position==='5,0'`));

    await seedRoom(table,"ibrahim",order);
    await click(mover,'.fcard[data-card="economy"]');
    await click(mover,'#wiz-start');
    for(const k of ["-5,0","-4,0","4,0","5,0","6,0"])await hex(mover,k);
    R.ok("rival city explicitly offers Trade",await mover.eval("document.querySelector('#bc-done')?.textContent==='Trade'"));
    await click(mover,"#bc-done");await settled(mover);
    await choose(table,mover,"culture");await choose(table,mover,"culture");
    const dip=await mover.eval("UI.debugState().pendingChoices[0].options.find(o=>o.id!=='embassy').id");
    await choose(table,mover,dip);
    R.ok("only holder sees the first Ibrahim placement",await mover.eval("UI.debugState().pendingChoices[0]?.source==='Ibrahim' && !!document.querySelector('.pending-option')") &&
      await host.eval("!document.querySelector('.pending-option')") && await observer.eval("!document.querySelector('.pending-option')"));
    const choiceId=await mover.eval("UI.debugState().pendingChoices[0].id");
    const unauthorized=await host.eval(`UI.dispatch({type:'RESOLVE_PENDING_CHOICE',payload:{choiceId:${JSON.stringify(choiceId)},optionId:'industry'}})`);
    R.ok("host cannot answer the holder's trade decision",unauthorized.status==="rejected"&&unauthorized.code==="choice_owner_mismatch",unauthorized);
    await choose(table,mover,"industry");await resume(mover);
    const r=await host.eval("UI.debugState().revision");await synced(table,r);
    R.ok("reconnect between recipients preserves Ottoman ownership",await host.eval("UI.debugState().pendingChoices[0]?.playerId===UI.debugInfo().localPlayerId && UI.debugState().pendingChoices[0]?.source==='Ibrahim'"));
    await choose(table,host,"science");
    R.ok("three normal-plus-Ibrahim tokens versus one Ottoman token",await host.eval(`(()=>{const st=UI.debugState(),p=Game.getPlayer(st,${JSON.stringify(order[0].id)}),o=Game.getPlayer(st,${JSON.stringify(order[1].id)});return p.trade.culture===2&&p.trade.industry===1&&o.trade.science===1&&!st.arrivalResolution&&p.cardPlayed;})()`));

    await seedRoom(table,"recovery",order);
    await submit(table,mover,"PLAY_SCIENCE",{cardIndex:3,tradeSpent:0});
    R.ok("guest's ordinary Undo Turn is enabled",await mover.eval("!document.querySelector('#btn-undo').disabled"));
    await click(mover,"#btn-undo");await settled(mover);await synced(table,await mover.eval("UI.debugState().revision"));
    R.ok("normal undo reaches all peers with a new generation",(await Promise.all(table.tabs.map(t=>t.eval("UI.debugState().recoveryGeneration")))).every(g=>g===1));
    const unit=await mover.eval(`Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).armies[0].id`);
    await submit(table,mover,"BEGIN_EXPLORATION",{unitType:"army",unitId:unit,cardIndex:4,fromKey:"-6,0",startKey:"-6,0"});
    R.ok("normal undo locks but Host Recovery remains available",await mover.eval("document.querySelector('#btn-undo').disabled")&&await host.eval("!document.querySelector('#btn-emergency-undo').disabled"));
    const snapshotId=await host.eval("UI.debugState().turnUndo.snapshotId");
    await resume(host);await synced(table,await host.eval("UI.debugState().revision"));
    R.ok("host reload restores the retained private snapshot",await host.eval(`UI.debugState().turnUndo?.snapshotId===${JSON.stringify(snapshotId)} && !!UI.debugState().turnUndo?.snapshot`));
    await host.eval("window.confirm=message=>{window.__recoveryWarning=message;return true;}");
    await click(host,"#btn-emergency-undo");await click(host,"#recovery-confirm");await settled(host);await synced(table,await host.eval("UI.debugState().revision"));
    R.ok("host warning explains revealed information",await host.eval("/revealed information/.test(window.__recoveryWarning)"));
    R.ok("emergency undo restores every browser without reconnect",(await Promise.all(table.tabs.map(t=>t.eval("UI.debugState().recoveryGeneration===2 && !UI.debugState().pendingExploration && !UI.debugInfo().movement")))).every(Boolean));
    await submit(table,mover,"PLAY_SCIENCE",{cardIndex:3,tradeSpent:0});
    R.ok("the recovered guest turn is immediately playable",await mover.eval("Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).tech>0"));

    if(!process.env.CIV_SKIP_SOAK) {
      await seedRoom(table,"soak",order);
      const startRevision=await host.eval("UI.debugState().revision");let comparisons=0;
      for(let turn=0;turn<39;turn++) {
        await drainEvents(table);
        const info=await host.eval(`(()=>{const st=UI.debugState(),p=Game.currentPlayer(st);return {id:p.id,index:st.players.indexOf(p),units:p.caravans.map(u=>u.id)};})()`);
        const tab=table.tabs[table.profiles.findIndex(p=>p.id===info.id)];
        if(turn===5||turn===19) { await resume(observer);await synced(table,await host.eval("UI.debugState().revision")); }
        if(turn===12) { await resume(mover);await synced(table,await host.eval("UI.debugState().revision")); }
        if(turn%10===0)await sleep(1200);
        for(const unitId of info.units) {
          const request=await tab.eval(`(()=>{
            const st=UI.debugState(),p=Game.currentPlayer(st),u=p.caravans.find(u=>u.id===${JSON.stringify(unitId)}),card=Game.getRowCards(p).find(c=>c.type==='economy');
            const q=${info.index}*5-5,capital=q+',0';let startKey=u.position||capital,route;
            if(p.leaderId==='indonesia')route=startKey==='3,0'?['4,0','-4,0','-5,1']:['-4,0','4,0','3,0'];
            else route=[startKey===capital?q+',1':capital];
            return {playerId:p.id,unitType:'caravan',unitId:u.id,cardIndex:card.index,cardId:card.id,startKey,toKey:route.at(-1),route,tradeSpent:0};
          })()`);
          const assessments=await Promise.all(table.tabs.map(t=>t.eval(`Game.inspectMovement(UI.debugState(),${JSON.stringify(request)},{actorId:${JSON.stringify(info.id)}})`)));
          if(!assessments.every(a=>a.ok&&JSON.stringify(a)===JSON.stringify(assessments[0])))throw Error('Movement disagreement at turn '+turn+': '+JSON.stringify(assessments));
          comparisons++;
          await submit(table,tab,"PLAY_ECONOMY",request);
        }
        await submit(table,tab,"END_TURN");
        if(turn%6===5)R.info("soak progress",`${turn+1} turns; ${await host.eval("UI.debugState().revision")-startRevision} confirmed actions`);
      }
      const endRevision=await host.eval("UI.debugState().revision");
      R.ok("three real peers complete 39 turns and at least 100 confirmed actions",endRevision-startRevision>=100,{turns:39,actions:endRevision-startRevision,comparisons,roundTripMs:500});
      const states=await Promise.all(table.tabs.map(t=>t.eval(`(()=>{const s=UI.debugState();return JSON.stringify({revision:s.revision,players:s.players,map:s.map,turn:s.turn,recoveryGeneration:s.recoveryGeneration});})()`)));
      R.ok("all peers finish with identical public gameplay state",states.every(s=>s===states[0]));
      R.ok("all clients settle back to synchronized",(await Promise.all(table.tabs.map(t=>t.eval("Net.getStatus().phase==='synced' && !UI.debugInfo().actionPending")))).every(Boolean));
    }
    R.ok("no uncaught browser errors",table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));
  } catch(e) {R.ok("three-peer reliability run",false,e.stack);}
  finally {table?.close();}
  console.log("reliability-browser-test:");R.print();if(R.fail)process.exitCode=1;
})();
