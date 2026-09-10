"use strict";
const { reporter, waitUntil } = require("./browser-harness.js");
const { room, seedRoom, click, hex, settled } = require("./playtest-browser-helpers.js");
const R = reporter();
(async () => {
  let table;
  try {
    table = await room(2); await seedRoom(table, "setup");
    const [host, guest] = table.tabs;
    await click(guest, '#setup-capital-preview-mode');
    R.ok("waiting player has both own tile faces and a private ghost", await guest.eval(`
      document.querySelectorAll('.astro-faces img').length===2 && UI.debugInfo().capitalPreview.enabled`));
    await guest.eval(`(() => { window.previewPackets={actions:0,presence:0};
      for(const [method,key] of [['submitAction','actions'],['sendPresence','presence']]) {
        const original=Net[method]; Net[method]=function(...args){window.previewPackets[key]++;return original(...args);};
      } window.previewBefore=JSON.stringify(UI.debugState()); return true; })()`);
    await hex(guest, "2,3");
    const anchor = await guest.eval("UI.debugInfo().capitalPreview.anchorKey");
    await click(guest, '#preview-rot-inc'); await click(guest, '#preview-side-toggle');
    await click(guest, '[data-camera="zoom-out"]'); await click(guest, '[data-camera="zoom-in"]');
    const preview = await guest.eval(`({unchanged:window.previewBefore===JSON.stringify(UI.debugState()),
      packets:window.previewPackets,info:UI.debugInfo().capitalPreview,highlights:UI.debugInfo().boardHighlights,
      color:Game.getPlayer(UI.debugState(),UI.debugInfo().localPlayerId).color,
      disabled:document.querySelector('#capital-preview-place').disabled})`);
    R.ok("moving, rotating, flipping and zooming do not mutate authoritative state", preview.unchanged, preview);
    R.ok("private planning emits no action or presence packets", preview.packets.actions === 0 && preview.packets.presence === 0, preview.packets);
    R.ok("pinned ghost retains anchor through rotation, flip and zoom", preview.info.anchorKey === anchor && preview.info.side === "B", preview.info);
    R.ok("ghost outline uses local assigned colour", preview.info.rendered.playerColor === preview.color, preview);
    R.ok("waiting confirm disabled and no blanket legal-anchor highlights", preview.disabled && preview.highlights.length === 0);
    R.ok("other browser never sees the waiting ghost", !(await host.eval("UI.debugInfo().capitalPreview.enabled")));
    for (const actor of table.tabs) {
      await settled(actor);
      const r = await actor.eval(`UI.dispatch({type:'PLACE_FORTRESS',payload:{hexKey:[...Game.getValidFortressHexes(UI.debugState())][0]}})`);
      R.ok("active fortress action acknowledged", r.status === "accepted", r);
      await waitUntil(() => guest.eval(`UI.debugState().revision === ${r.revision}`), 8000);
    }
    await waitUntil(() => host.eval("UI.debugState().setup.phase==='capital_tile'"), 8000);
    const hostPlan = await host.eval(`(() => { const st=UI.debugState(),id=st.setup.playerTiles[UI.debugInfo().localPlayerId][0];
      for(const k of Object.keys(st.map.hexes)) {const p=Game.tilePlacementFor(st,id,k,0); if(p)return {tileId:id,anchorKey:k,rotation:p.rotation};} })()`);
    for (let i=0;i<6 && (await guest.eval("UI.debugInfo().capitalPreview.rotation"))!==hostPlan.rotation;i++) await click(guest,'#preview-rot-inc');
    await hex(guest,hostPlan.anchorKey);
    R.ok("waiting player can plan a currently valid capital location", await guest.eval("UI.debugInfo().capitalPreview.rendered.valid"));
    const denied = await guest.eval(`Net.submitAction({type:'PLACE_TILE',payload:{tileId:UI.debugInfo().capitalPreview.tileId,
      anchorKey:${JSON.stringify(hostPlan.anchorKey)},rotation:${hostPlan.rotation},side:'B'}})`);
    R.ok("a hacked waiting commit is rejected by host authority", denied.status === "rejected", denied);
    for (let i=0;i<6 && (await host.eval("UI.debugInfo().tilePlacement.rotation"))!==hostPlan.rotation;i++) await click(host,'#rot-inc');
    await hex(host,hostPlan.anchorKey);
    R.ok("only active player commits and advances setup", await waitUntil(() => guest.eval(`UI.debugState().setup.order[UI.debugState().setup.turnIndex]===UI.debugInfo().localPlayerId`),10000)>=0);
    const blocked = await guest.eval(`({p:UI.debugInfo().capitalPreview,disabled:document.querySelector('#capital-preview-place')?.disabled,
      placed:UI.debugState().setup.tiles[UI.debugInfo().capitalPreview.tileId].placed})`);
    R.ok("newly occupied planned anchor stays put and becomes invalid", blocked.p.anchorKey===hostPlan.anchorKey && !blocked.p.rendered.valid && blocked.disabled,blocked);
    R.ok("turn arrival does not silently commit the preview", !blocked.placed, blocked);
    const guestPlan = await guest.eval(`(() => {const st=UI.debugState(),id=UI.debugInfo().capitalPreview.tileId;
      for(const k of Object.keys(st.map.hexes)){const p=Game.tilePlacementFor(st,id,k,0);if(p)return {anchorKey:k,rotation:p.rotation};} })()`);
    for(let i=0;i<6&&(await guest.eval("UI.debugInfo().capitalPreview.rotation"))!==guestPlan.rotation;i++)await click(guest,'#preview-rot-inc');
    await hex(guest,guestPlan.anchorKey);
    const beforeConfirm=await guest.eval("UI.debugState().revision");
    R.ok("valid active preview still needs explicit confirmation", await guest.eval(`!document.querySelector('#capital-preview-place').disabled && UI.debugState().phase==='setup'`));
    await click(guest,'#capital-preview-place');
    R.ok("explicit confirm commits once and both peers enter play", await waitUntil(async()=>
      (await Promise.all(table.tabs.map(t=>t.eval(`UI.debugState().phase==='playing' && UI.debugState().revision===${beforeConfirm+1}`)))).every(Boolean),12000)>=0);
    R.ok("no browser runtime errors",table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));
  } catch(e){R.ok("setup waiting scenario completed",false,e.stack);}
  finally{table?.close();}
  console.log("setup-waiting-browser-test:");R.print();if(R.fail)process.exitCode=1;
})();
