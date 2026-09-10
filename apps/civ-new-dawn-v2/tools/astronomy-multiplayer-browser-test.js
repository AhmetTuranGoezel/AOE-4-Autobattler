"use strict";
const { reporter, waitUntil } = require('./browser-harness.js');
const { room, seedRoom, click, hex, settled } = require('./playtest-browser-helpers.js');
const R=reporter();
(async()=>{
  let table;
  try{
    table=await room(2);const [host,guest]=table.tabs,order=[table.profiles[1],table.profiles[0]];
    async function start(options){await seedRoom(table,'astronomy',order,options);await click(guest,'.fcard[data-card="science"]');
      if(await waitUntil(()=>guest.eval("UI.debugState().pendingChoices[0]?.kind==='astronomy_count'"),10000)<0)throw Error('No Astronomy count: '+JSON.stringify(await guest.eval(`({info:UI.debugInfo(),wizard:document.querySelector('#wizard')?.innerText,toast:document.querySelector('#toast')?.innerText,card:document.querySelector('.fcard[data-card="science"]')?.outerHTML})`)));}
    async function exploreNext(expected, end) {
      // Advance two real turns; never replace or reorder the returned stack
      // in the fixture. The guest then uses the actual Military/Explore UI.
      for (const [tab,action] of [[guest,{type:'END_TURN'}],
        [host,{type:'END_FOCUS_CARD',payload:{cardType:'growth',tradeSpent:0}}],
        [host,{type:'END_TURN'}]]) {
        const r=await tab.eval(`UI.dispatch(${JSON.stringify(action)})`);
        if(r.status!=='accepted')throw Error('Turn advancement failed: '+JSON.stringify(r));
        await waitUntil(()=>guest.eval(`UI.debugState().revision===${r.revision}`),8000);
      }
      await click(guest,'.fcard[data-card="military"]');
      await hex(guest,'-1,0');await click(guest,'#bc-explore');
      R.ok(`${end}: ordinary Explore button actually draws tile ${expected}`,await waitUntil(()=>guest.eval(
        `UI.debugState().pendingExploration?.tileId===${JSON.stringify(expected)}`),10000)>=0);
      R.ok(`${end}: observer receives that same public ordinary draw`,await waitUntil(()=>host.eval(
        `UI.debugState().pendingExploration?.tileId===${JSON.stringify(expected)}`),10000)>=0);
      // Finish this actual expedition/turn before loading another scenario;
      // hot-swapping fixtures mid-move would leave private movement UI alive.
      const placement=await guest.eval(`Game.getLegalExplorationPlacements(UI.debugState(),UI.debugState().pendingExploration)[0]`);
      if(!placement)throw Error('Ordinary draw fixture has no placement');
      if((await guest.eval('UI.debugInfo().tilePlacement.side'))!==placement.side)await click(guest,'#side-toggle');
      for(let i=0;i<6&&(await guest.eval('UI.debugInfo().tilePlacement.rotation'))!==placement.rotation;i++)await click(guest,'#rot-inc');
      await hex(guest,placement.anchorKey);
      if(await waitUntil(()=>guest.eval('!UI.debugState().pendingExploration'),8000)<0)throw Error('Ordinary tile placement was not confirmed');
      await click(guest,'#bc-done');await settled(guest);
      for(const action of [{type:'END_FOCUS_CARD',payload:{cardType:'military',tradeSpent:0}},{type:'END_TURN'}]) {
        if(action.type==='END_FOCUS_CARD' && await guest.eval('UI.debugState().players[0].cardPlayed'))continue;
        const r=await guest.eval(`UI.dispatch(${JSON.stringify(action)})`);
        if(r.status!=='accepted')throw Error('Expedition finish failed: '+JSON.stringify(r));
        await waitUntil(()=>host.eval(`UI.debugState().revision===${r.revision}`),8000);
      }
    }
    for(const count of ['0','1']){
      await start();
      R.ok(`count ${count}: Inspect 2 is primary and fewer choices are disclosed separately`,await guest.eval(
        `document.querySelector('.pending-option.primary')?.textContent.trim()==='Inspect 2 Tiles' && !document.querySelector('.astro-fewer').open`));
      await click(guest,'.astro-fewer summary');await click(guest,`.pending-option[data-option="${count}"]`);
      if(count==='0')R.ok('Skip Inspection legally completes science',await waitUntil(()=>guest.eval("!UI.debugState().cardResolution && UI.debugState().players[0].tech===2"),8000)>=0);
      else{
        R.ok('Inspect 1 reveals only one private candidate',await waitUntil(()=>guest.eval("document.querySelectorAll('.astro-candidate').length===1"),8000)>=0);
        await click(guest,'#astro-none');await waitUntil(()=>guest.eval("!!document.querySelector('[data-astro-return]')"),8000);
        R.ok('single-tile return explains next draw and far end',await guest.eval("/Next to Be Explored/.test(document.querySelector('#wizard').innerText)&&/Far End/.test(document.querySelector('#wizard').innerText)"));
        await click(guest,'[data-astro-return="top"]');
        await settled(guest);await exploreNext('06','top return');
      }
      await settled(guest);
    }
    await start({stack:['07']});
    R.ok('one remaining tile offers Inspect 1 as primary and never Inspect 2',await guest.eval(
      `document.querySelector('.pending-option.primary')?.textContent.trim()==='Inspect 1 Tile' && !document.querySelector('[data-option="2"]') && !!document.querySelector('[data-option="0"]')`));
    await click(guest,'.pending-option[data-option="0"]');await settled(guest);
    await start();await click(guest,'.pending-option[data-option="2"]');await click(guest,'#astro-none');
    await waitUntil(()=>guest.eval("document.querySelectorAll('.astro-return-tile').length===2"),8000);
    R.ok('two returned tiles are shown in actual next-draw order',await guest.eval(
      `Array.from(document.querySelectorAll('.astro-return-tile b'),b=>b.textContent).join()==='Tile 07,Tile 06'`));
    await click(guest,'[data-astro-return="bottom"]');await settled(guest);await exploreNext('07','bottom return');
    await start();await click(guest,'.pending-option[data-option="2"]');
    await waitUntil(()=>guest.eval("document.querySelectorAll('.astro-candidate').length===2"),8000);
    R.ok('guest sees exactly the known bottom tiles',await guest.eval("UI.debugState().pendingChoices[0].tileIds.join()==='06,07'"));
    const observerBefore=await host.eval("JSON.stringify(UI.debugState().map)");
    const privateBefore=await guest.eval("JSON.stringify(UI.debugState())");
    await click(guest,'[data-astro-tile="07"]');await click(guest,'[data-astro-tile="06"]');
    R.ok('candidate switching is strictly private and state-neutral',await guest.eval(`JSON.stringify(UI.debugState())===${JSON.stringify(privateBefore)}`));
    await click(guest,'#astro-choose-origin');
    await waitUntil(()=>guest.eval("UI.debugState().pendingChoices[0]?.kind==='astronomy_edge'"),8000);
    const origins=await guest.eval(`(() => {const st=UI.debugState();return {expected:st.fixture.capitalKeys.filter(k=>{
      const h=st.map.hexes[k];return Game.hexNeighborKeys(h.q,h.r).some(n=>!st.map.hexes[n]?.active);}).sort(),
      actual:UI.debugInfo().boardHighlights.slice().sort(),water:st.fixture.water};})()`);
    R.ok('only actual own-capital map edges are highlighted',JSON.stringify(origins.expected)===JSON.stringify(origins.actual),origins);
    for(const key of ['5,0','5,1','4,2','1,0']){
      await hex(guest,key);
      R.ok(`real map click at ineligible ${key} cannot become origin`,await guest.eval("UI.debugState().pendingChoices[0]?.kind==='astronomy_edge' && !UI.debugState().cardResolution.astronomySelectedFromKey"));
    }
    await hex(guest,origins.water);
    R.ok('own water map-edge origin advances into placement',await waitUntil(()=>guest.eval(
      `UI.debugState().pendingChoices[0]?.selectedFromKey===${JSON.stringify(origins.water)} && !!document.querySelector('#astro-place')`),8000)>=0);
    const plans=await guest.eval(`(() => {const st=UI.debugState(),origin=st.pendingChoices[0].selectedFromKey,out={};
      for(let q=-6;q<=6;q++)for(let r=-5;r<=5;r++)for(let rot=0;rot<6;rot++){
        const anchor=q+','+r,keys=Game.getTileHexKeys(anchor,rot,st.map.hexes),set=new Set(keys),contacts=new Set();
        if(keys.some(k=>st.map.hexes[k]?.active))continue;
        keys.forEach(k=>Game.hexNeighborKeys(Game.parseQ(k),Game.parseR(k)).forEach(n=>{if(!set.has(n)&&st.map.hexes[n]?.active)contacts.add(n);}));
        const kind=contacts.size>=4?(contacts.has(origin)?'valid':'wrongOrigin'):(contacts.has(origin)?'tooFew':null);
        if(kind&&!out[kind])out[kind]={anchor,rot,contacts:contacts.size};
      }return out;})()`);
    for(const kind of ['tooFew','wrongOrigin','valid']){
      const plan=plans[kind];
      for(let i=0;i<6&&(await guest.eval("UI.debugInfo().astronomyPreview.rotation"))!==plan.rot;i++)await click(guest,'#astro-rot-inc');
      await hex(guest,plan.anchor,true);
      R.ok(`${kind}: current physical attempt gets the right feedback`,await guest.eval(
        `document.querySelector('#astro-place').disabled===${kind!=='valid'} && UI.debugInfo().astronomyPreview.anchorKey===${JSON.stringify(plan.anchor)} && UI.debugInfo().boardHighlights.length===0`));
    }
    R.ok('observer map remains unchanged throughout private preview',await host.eval(`JSON.stringify(UI.debugState().map)===${JSON.stringify(observerBefore)}`));
    // Inspect the actual projected object, not just the DOM. Host has full
    // authority, so projection is also checked for a hypothetical third seat.
    const secret=await host.eval(`(() => {const s=Game.projectState(UI.debugState(),'observer');return {resolution:s.cardResolution,choice:s.pendingChoices[0],stack:s.tileStack};})()`);
    R.ok('other seats receive no inspected candidates or stack order',!secret.resolution.astronomyInspected&&!secret.resolution.astronomyTileId&&!secret.choice.tileIds&&!secret.stack,secret);
    const validAnchor=plans.valid.anchor;
    // This uses mouse movement to the button, unlike the old DOM .click()
    // shortcut. The map click has held the physical tile at its chosen anchor.
    await click(guest,'#astro-place');
    R.ok('guest commits without aborting after moving pointer to Place',await waitUntil(()=>guest.eval("UI.debugState().pendingChoices[0]?.kind==='astronomy_return'"),10000)>=0);
    R.ok('observer receives the exact committed tile only',await waitUntil(()=>host.eval(
      `UI.debugState().tiles['06'].placed && UI.debugState().tiles['06'].anchorKey===${JSON.stringify(validAnchor)} && !UI.debugState().tiles['07'].placed`),10000)>=0);
    R.ok('return UI states actual next draw, includes a stack diagram and defers tech',await guest.eval(
      `/tile 07 will be the next map tile explored/i.test(document.querySelector('#wizard').innerText) && !!document.querySelector('.astro-stack-diagram') && UI.debugState().players[0].tech===0`));
    await click(guest,'[data-astro-return="bottom"]');
    R.ok('only the completed return advances tech and clears Astronomy',await waitUntil(()=>guest.eval("!UI.debugState().cardResolution && UI.debugState().players[0].tech===2"),10000)>=0);
    await settled(guest);
    R.ok('both clients finish at one confirmed revision',(await host.eval('UI.debugState().revision'))===(await guest.eval('UI.debugState().revision')));
    R.ok('no browser exceptions',table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));
  }catch(e){R.ok('multiplayer Astronomy scenario completed',false,e.stack);}
  finally{table?.close();}
  console.log('astronomy-multiplayer-browser-test:');R.print();if(R.fail)process.exitCode=1;
})();
