"use strict";
const { reporter, waitUntil } = require('./browser-harness.js');
const { room, seedRoom, click } = require('./playtest-browser-helpers.js');
const R = reporter();
(async () => {
  let table;
  try {
    table = await room(2);
    const [observer, actor] = table.tabs;
    await seedRoom(table, 'dice', [table.profiles[1], table.profiles[0]]);
    const attack = await actor.eval(`UI.dispatch({type:'PLAY_MILITARY_ATTACK',payload:{
      unitId:Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).armies[0].id,
      fromKey:'0,0',toKey:'1,0',tradeSpent:0}})`);
    R.ok('guest starts a real attack against the barbarian', attack.status === 'accepted', attack);
    R.ok('observer already watches the combat before the throw', await waitUntil(() => observer.eval(
      "!!UI.debugState().combat && !document.querySelector('#combat-stage').classList.contains('hidden')"),8000)>=0);
    R.ok('uninvolved observer has no attacker throw button', await observer.eval("!document.querySelector('#cs-roll[data-side=attacker]')"));
    await click(actor, '#cs-roll');
    R.ok('live observer animates the newly received roll sequence', await waitUntil(() => observer.eval(
      "UI.debugState().combat.atkRollSeq===1 && document.querySelector('.cs-die.atk').classList.contains('rolling')"),4000,25)>=0);
    const face = await actor.eval('UI.debugState().combat.atkRoll');
    R.ok('observer lands on exactly the authoritative face', await waitUntil(() => observer.eval(
      `document.querySelector('.cs-die.atk')?.getAttribute('aria-label')==='Rolled ${face}'`),4000,25)>=0);
    await observer.eval('UI.render()');
    R.ok('observer rerender does not replay the settled throw', await observer.eval(
      "!document.querySelector('.cs-die.atk').classList.contains('rolling') && UI.debugInfo().diceAnimations.length===0"));
    R.ok('observer and actor share the confirmed roll revision', (await observer.eval('UI.debugState().revision'))===(await actor.eval('UI.debugState().revision')));
    R.ok('no browser exceptions', table.tabs.every(t=>!t.errors.length), table.tabs.flatMap(t=>t.errors));
  } catch(e) { R.ok('observer dice scenario completed', false, e.stack); }
  finally { table?.close(); }
  console.log('dice-observer-browser-test:'); R.print(); if(R.fail) process.exitCode=1;
})();
