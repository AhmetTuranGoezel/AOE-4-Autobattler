"use strict";
const {room,click,settled}=require('./playtest-browser-helpers');
const {reporter,waitUntil,sleep}=require('./browser-harness');
const {install,converge}=require('./runtime-test-helpers');
const R=reporter();
(async()=>{let table;try{
 table=await room(2);const [host,guest]=table.tabs,order=[table.profiles[1],table.profiles[0]];
 for(const trade of [0,2]){
  await install(table,`p.focusRow=[{type:'science',tier:1,trade:${trade}},'economy','culture','science','military','industry'];p.trade.science=${trade};p.tech=0;`,order);
  await guest.eval(`window.__submitted=0;window.__submitOriginal ||= Net.submitAction;Net.submitAction=(...a)=>{window.__submitted++;return window.__submitOriginal(...a);}`);
  const before=await guest.eval('JSON.stringify(UI.debugState())');
  const checkpoints=await guest.eval('CivSessionStore.listCheckpoints(Net.getCredentials().gameId)');
  for(const index of [0,3])for(const input of ['mouse','Enter','Space','double']){
   const selector=`.fcard[data-idx="${index}"]`;
   if(input==='mouse')await click(guest,selector);
   else if(input==='double')await guest.eval(`document.querySelector('${selector}').click();document.querySelector('${selector}').click();true`);
   else {await guest.eval(`document.querySelector('${selector}').focus()`);await guest.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:input==='Space'?' ':input,code:input,windowsVirtualKeyCode:input==='Space'?32:13});await guest.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:input==='Space'?' ':input,code:input,windowsVirtualKeyCode:input==='Space'?32:13});}
   await sleep(80);
   R.ok(`${input}, trade ${trade}, physical Science ${index}: preview only`,before===await guest.eval('JSON.stringify(UI.debugState())')&&await guest.eval(`UI.debugInfo().subPhase==='card_selected'&&UI.debugInfo().cardIndex===${index}&&!!document.querySelector('#wiz-start')&&window.__submitted===0`),await guest.eval(`(()=>{const old=JSON.parse(${JSON.stringify(before)}),s=UI.debugState();return {info:UI.debugInfo(),submitted:window.__submitted,changed:Object.keys(s).filter(k=>JSON.stringify(s[k])!==JSON.stringify(old[k]))};})()`));
  }
  R.ok(`trade ${trade}: no checkpoint from selection`,JSON.stringify(checkpoints)===JSON.stringify(await guest.eval('CivSessionStore.listCheckpoints(Net.getCredentials().gameId)')));
  await click(guest,'#wiz-start');await settled(guest);
  R.ok('Science only resolves after explicit Start',await guest.eval('window.__submitted===1 && Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).cardPlayed'));
  await click(guest,'#btn-undo');await settled(guest);await converge(table,await guest.eval('UI.debugState().revision'));
  R.ok('ordinary Science undo restores complete gameplay from the private turn start',await host.eval(`(()=>{const s=UI.debugState(),start=s.turnUndo.snapshot;const copy=x=>{x=structuredClone(x);for(const k of ['turnUndo','undoSummary','revision','recoveryGeneration','log','lastAction','stateView'])delete x[k];return JSON.stringify(x);};return copy(s)===copy(start);})()`));
 }
 // Corrupt snapshots travel through the real PeerJS projection/receive path.
 await install(table,'',order);
 for(const [code,mutation] of [
  ['setup_regression',"bad.phase='setup';bad.setup.phase='capital_tile';"],
  ['missing_capital',"Object.values(bad.map.hexes).find(h=>h.city?.isCapital).city=null;"],
  ['unit_off_map',"bad.players[0].caravans[0].position='999,999';"],
  ['unknown_owner',"bad.pendingChoices=[{id:'orphan',playerId:'nobody'}];"]]){
  const before=await guest.eval('JSON.stringify(UI.debugState())');
  await host.eval(`(()=>{const bad=structuredClone(UI.debugState());${mutation}Net.broadcast(bad,bad.revision+1);})()`);
  await waitUntil(()=>guest.eval(`UI.debugInfo().integrityProblem?.some(f=>f.code==='${code}')`),10000);
  R.ok(`${code}: visible problem, map untouched, no capital-placement controls`,before===await guest.eval('JSON.stringify(UI.debugState())')&&await guest.eval(`!!document.querySelector('#integrity-panel')&&!document.querySelector('#rot-inc')&&UI.debugInfo().integrityProblem.some(f=>f.code==='${code}')`));
  const report=await guest.eval('UI.debugDiagnostics()');
  R.ok(`${code}: diagnostics excludes credential fields and secrets`,!/hostToken|seatToken|TokenHash|hostTokenHash|seatTokenHashes|privateKey|tileStack|wonderDeck|snapshot/.test(JSON.stringify(report)));
  await host.eval('UI.debugState().revision+=2;Net.broadcast(UI.debugState(),UI.debugState().revision)');
  await waitUntil(()=>guest.eval('!UI.debugInfo().integrityProblem'),10000);
 }
 // Even with no previous in-memory board, the persistent witness blocks setup.
 await guest.eval(`(async()=>{const c=Net.getCredentials(),s=structuredClone(UI.debugState());s.phase='setup';s.setup.phase='capital_tile';s.revision+=1;await CivSessionStore.saveCheckpoint({gameId:c.gameId,revision:s.revision,hostEpoch:1,fullState:s});})()`);
 await guest.eval('window.__oldSafety=true');await guest.reload();
 await waitUntil(async()=>{try{return await guest.eval("!window.__oldSafety&&!!document.querySelector('.resume-session')");}catch{return false;}},15000);
 await click(guest,'.resume-session');
 R.ok('reload cannot forget that this session reached play',await waitUntil(()=>guest.eval("!!document.querySelector('#integrity-panel')&&!document.querySelector('#rot-inc')"),10000)>=0);
 R.ok('diagnostic export works before any corrupt state is installed',await guest.eval("UI.debugDiagnostics().then(d=>d.integrity.some(f=>f.code==='setup_regression'))"));
 R.ok('no browser exceptions',table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));
}catch(e){R.ok('client safety scenario',false,e.stack);}finally{table?.close();}R.print();if(R.fail)process.exitCode=1;})();
