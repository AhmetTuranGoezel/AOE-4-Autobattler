"use strict";
const {finishSetup}=require('./production-fixtures');
const {waitUntil}=require('./browser-harness');
async function install(table,configure='',order=table.profiles){
 const result=await table.tabs[0].eval(`(async()=>{
  const old=UI.debugState(),s=Game.createState(${JSON.stringify(order)}.map(p=>Game.createPlayer(p.id,p.name,p.color)));
  s.players.forEach(p=>p.leaderId='china');
  (${finishSetup.toString()})(Game,s);
  s.gameId=Net.getCredentials().gameId;s.revision=old.revision;s.recoveryGeneration=old.recoveryGeneration||0;
  s.turn.round=100+old.revision;const p=s.players[0];${configure}
  Game.finalizeSetup(s);UI.debugSetState(s);
  const key=Object.keys(s.map.hexes).find(k=>s.map.hexes[k].city?.isCapital);
  return UI.dispatch({type:'HOST_EDIT_HEX',payload:{hexKey:key,changes:{terrain:s.map.hexes[key].terrain}}});
 })()`);
 if(result.status!=='accepted')throw Error('Install failed '+JSON.stringify(result));
 await converge(table,result.revision);return result;
}
async function converge(table,revision){
 if(await waitUntil(async()=>(await Promise.all(table.tabs.map(t=>t.eval('UI.debugState()?.revision')))).every(r=>r===revision),20000)<0)throw Error('No convergence '+revision);
}
module.exports={install,converge};
