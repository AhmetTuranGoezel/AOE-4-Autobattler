"use strict";
const { reporter, waitUntil } = require("./browser-harness.js");
const { room, seedRoom, click, hex } = require("./playtest-browser-helpers.js");
const R = reporter();
(async () => {
  let table;
  try {
    table = await room(4);
    const order = [table.profiles[1], table.profiles[0], table.profiles[2], table.profiles[3]];
    order.forEach((p, i) => { p.name = `District P${i + 1}`; });
    await seedRoom(table, "district", order);
    R.ok("four authenticated browsers share the fixture", table.tabs.length === 4);
    const ownerTab = (id) => table.tabs[table.profiles.findIndex((p) => p.id === id)];
    const trigger = await table.tabs[0].eval(`UI.dispatch({type:'FORCE_EVENT',payload:{event:'district_event'}})`);
    R.ok("host triggers the real district event", trigger.status === "accepted", trigger);
    await waitUntil(() => table.tabs[1].eval("!!UI.debugState().districtEvent"), 8000);
    R.ok("first player is used, not host, array index or current turn", await table.tabs[0].eval(
      `UI.debugState().districtEvent?.playerId === ${JSON.stringify(order[0].id)} && Game.currentPlayer(UI.debugState()).id === ${JSON.stringify(order[3].id)}`));
    const future = await table.tabs[0].eval(`(() => {
      const st = structuredClone(UI.debugState());
      const fake = {id:'future-own-answer',kind:'district_order',playerId:${JSON.stringify(order[1].id)},remaining:1,
        options:[{id:'theater'}]}; st.pendingChoices.push(fake);
      const before = JSON.stringify(st); const result = Game.tryApplyAction(st,
        {type:'RESOLVE_PENDING_CHOICE',payload:{choiceId:fake.id,optionId:'theater'}},
        {actorId:fake.playerId,role:'host'});
      return {accepted:result.accepted,code:result.code,unchanged:before===JSON.stringify(st)};
    })()`);
    R.ok("future player cannot resolve even an owned choice early", !future.accepted && future.code === "district_priority" && future.unchanged, future);
    const firstChoice = await table.tabs[0].eval("UI.debugState().pendingChoices[0].id");
    const hacked = await table.tabs[0].eval(`Net.submitAction({type:'RESOLVE_PENDING_CHOICE',payload:{playerId:${JSON.stringify(order[0].id)},choiceId:${JSON.stringify(firstChoice)},optionId:'industrial'}})`);
    R.ok("host cannot impersonate first player's decision on the live wire", hacked.status === "rejected" && hacked.code === "choice_owner_mismatch", hacked);
    const expected = [order[0].id, order[1].id, order[3].id];
    for (const id of expected) {
      const actor = ownerTab(id);
      const arrived = await waitUntil(() => actor.eval(`UI.debugState().districtEvent?.playerId === ${JSON.stringify(id)}`), 12000);
      R.ok(`${id}: clockwise ownership arrived`, arrived >= 0);
      const display = await Promise.all(table.tabs.map((t) => t.eval("document.querySelector('#wizard').innerText")));
      R.ok(`${id}: every client sees active district owner`, display.every((s, i) =>
        table.profiles[i].id === id ? /District Event.*Your Turn/is.test(s) : /Waiting for.*to resolve districts/is.test(s)), display);
      if (id !== order[1].id) {
        const options = await actor.eval("UI.debugState().pendingChoices[0].options.map(o=>o.id).sort()");
        R.ok(`${id}: both owned districts are offered as an order choice`, options.join() === "industrial,theater", options);
        await click(actor, '.pending-option[data-option="industrial"]');
        await waitUntil(() => actor.eval("UI.debugState().pendingChoices[0]?.districtKind === 'industrial'"), 8000);
        R.ok(`${id}: owner stays until industrial's nested decision completes`, await actor.eval(`UI.debugState().districtEvent.playerId === ${JSON.stringify(id)}`));
        await click(actor, '.pending-option[data-option="forest"]');
      }
      if (await waitUntil(() => actor.eval("UI.debugState().pendingChoices[0]?.districtKind === 'theater'"), 10000) < 0)
        throw Error('Theater not reached: ' + JSON.stringify(await actor.eval("({wizard:document.querySelector('#wizard').innerText,pending:UI.debugState().pendingChoices,event:UI.debugState().districtEvent,toast:document.querySelector('#toast').textContent})")));
      await click(actor, '.pending-option[data-option="near"]');
      await waitUntil(() => actor.eval("UI.debugState().pendingChoices[0]?.kind === 'place_control'"), 8000);
      R.ok(`${id}: no handoff before the theater token is placed`, await actor.eval(`UI.debugState().districtEvent.playerId === ${JSON.stringify(id)}`));
      const target = await actor.eval("UI.debugState().pendingChoices[0].hexKeys[0]");
      await hex(actor, target);
      R.ok(`${id}: own theater placement committed`, await waitUntil(() => actor.eval(
        `UI.debugState().map.hexes[${JSON.stringify(target)}].control?.ownerId === ${JSON.stringify(id)}`), 10000) >= 0,
        await actor.eval("({pending:UI.debugState().pendingChoices,toast:document.querySelector('#toast')?.textContent})"));
    }
    R.ok("P3 with no districts was skipped and event ends only after P4", await waitUntil(async () =>
      (await Promise.all(table.tabs.map((t) => t.eval("!UI.debugState().districtEvent && UI.debugState().pendingChoices.length === 0")))).every(Boolean), 12000) >= 0);
    const revisions = await Promise.all(table.tabs.map((t) => t.eval("UI.debugState().revision")));
    R.ok("all four clients finish at the same confirmed revision", new Set(revisions).size === 1, revisions);
    R.ok("no browser runtime errors", table.tabs.every((t) => !t.errors.length), table.tabs.flatMap((t) => t.errors));
  } catch (e) { R.ok("district scenario completed", false, e.stack); }
  finally { table?.close(); }
  console.log("district-order-browser-test:"); R.print(); if (R.fail) process.exitCode = 1;
})();
