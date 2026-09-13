"use strict";
const { reporter, waitUntil } = require("./browser-harness.js");
const { room, seedRoom, click, hex } = require("./playtest-browser-helpers.js");
const R = reporter();
(async () => {
  let table;
  try {
    table = await room(3);
    await seedRoom(table, "movement", [table.profiles[1], table.profiles[0], table.profiles[2]]);
    const [host, mover] = table.tabs;
    await click(mover, '.fcard[data-card="economy"]');
    await hex(mover, "-5,0"); await hex(mover, "-4,0"); await hex(mover, "4,0");
    const capture = async (tab) => tab.eval(`(() => {
      const st=UI.debugState(), id=st.players.find(p=>p.leaderId==='indonesia').id;
      return {revision:st.revision,ui:UI.debugInfo(),active:st.activeCard,
        drafts:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('civ-movement:')).map(k=>[k,localStorage.getItem(k)])),
        terrain:st.map.hexes['5,0'].terrain,
        authoritative:[...Game.getReachable(st,'4,0',2,'caravan',id,0)].sort()};
    })()`);
    R.ok("land is initially a legal exit after one-step water adjacency",
      (await capture(mover)).ui.validHexes.includes("5,0"));
    const change = await host.eval("UI.dispatch({type:'HOST_EDIT_HEX',payload:{hexKey:'5,0',changes:{terrain:'mountain'}}})");
    R.ok("a real host correction broadcasts changed terrain", change.status === "accepted", change);
    await waitUntil(() => mover.eval(`UI.debugState().revision === ${change.revision}`),10000);
    const before = await capture(mover), authority = await capture(host);
    R.info("before reconnect", JSON.stringify({client:before,host:authority}));
    R.ok("live targets reconcile to the authoritative graph without reconnect",
      JSON.stringify(before.ui.validHexes.slice().sort()) === JSON.stringify(authority.authoritative), before);
    await mover.eval("window.__movementOldDocument=true"); await mover.reload();
    if(await waitUntil(() => mover.eval("!window.__movementOldDocument && !!document.querySelector('.resume-session')"),20000)<0)
      throw Error('Saved session was not offered after reload');
    await click(mover,'.resume-session');
    if(await waitUntil(() => mover.eval("!!UI.debugState()?.players?.length && Net.getStatus().phase==='synced'"),45000)<0)
      throw Error('Session did not resume: '+JSON.stringify(await mover.eval('Net.getStatus()')));
    const after=await capture(mover);
    R.info("after reconnect",JSON.stringify(after));
    R.ok("reconnect does not change authoritative revision or terrain legality",
      before.revision===after.revision && JSON.stringify(before.authoritative)===JSON.stringify(after.authoritative));
    R.ok("reload restores the private draft with the same allowance and corrected targets",
      after.ui.movement?.remaining===2 && after.ui.movement?.currentKey==='4,0' &&
      JSON.stringify(after.ui.validHexes.slice().sort())===JSON.stringify(after.authoritative),after);
    R.ok("no browser exceptions",table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));
  } catch(e) {R.ok("movement reconnect scenario",false,e.stack);}
  finally {table?.close();}
  R.print(); if(R.fail)process.exitCode=1;
})();
