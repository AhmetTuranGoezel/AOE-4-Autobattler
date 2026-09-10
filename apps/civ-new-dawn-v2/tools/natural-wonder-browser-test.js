"use strict";
const { startServer, Tab, waitUntil, reporter } = require("./browser-harness.js");
const { playtestBoard, hex } = require("./playtest-browser-helpers.js");
const R = reporter();
(async () => {
  const { child: server, port } = await startServer(); let tab;
  try {
    tab = await Tab.open("natural-wonder", `http://127.0.0.1:${port}/`);
    R.ok("browser booted", await waitUntil(() => tab.eval("typeof UI === 'object'"), 20000) >= 0);
    await tab.eval("(() => { [...document.querySelectorAll('button')].find(b=>/solo/i.test(b.textContent)).click(); return true; })()");
    await waitUntil(() => tab.eval("!!UI.debugInfo().localPlayerId"), 10000);
    await tab.eval(`(() => { const st = (${playtestBoard.toString()})(Game,
      [{id:UI.debugInfo().localPlayerId,name:'Wonder Owner',color:'#e88b24'}], 'wonder'); UI.debugSetState(st); return true; })()`);
    const rules = await tab.eval(`(() => {
      const st=UI.debugState(),h=st.map.hexes['1,0'],id=st.players[0].id;
      const limits=[1,2,3,4,5].map(n=>Game.validControlHexes(st,id,n).has('1,0'));
      const combat=structuredClone(st); combat.map.hexes['1,0'].barbarian=true;
      return {type:Game.terrainType(h),difficulty:Game.terrainDifficulty(h),limits,
        resource:Game.NATURAL_WONDER_RESOURCES[h.naturalWonder],defender:Game.findDefender(combat,'1,0')}; })()`);
    R.ok("token space has no semantic terrain", rules.type === null, rules);
    R.ok("natural wonder terrain difficulty stays five", rules.difficulty === 5, rules);
    R.ok("Culture 1 through 4 exclude it; Culture 5 permits it", JSON.stringify(rules.limits) === '[false,false,false,false,true]', rules);
    R.ok("actual resource is oil, not the internal wonder sentinel", rules.resource === "oil", rules);
    R.ok("combat terrain component remains five", rules.defender?.power === 5, rules.defender);
    await hex(tab, "1,0", false);
    const tooltip = await tab.eval("document.querySelector('#map-tooltip').innerText");
    R.ok("real hover identifies a Natural Wonder", /Natural Wonder/.test(tooltip), tooltip);
    R.ok("tooltip explicitly says no terrain type", /No terrain type/.test(tooltip), tooltip);
    R.ok("tooltip explicitly says difficulty five", /Difficulty 5/.test(tooltip), tooltip);
    R.ok("tooltip never mislabels it Mountain", !/Mountain/i.test(tooltip), tooltip);
    R.ok("tooltip shows its name and Oil, never Resource: wonder", /Mt\. Everest/.test(tooltip) && /Resource: Oil/.test(tooltip) && !/Resource: wonder/i.test(tooltip), tooltip);
    const after = await tab.eval(`(() => { const st=UI.debugState(),h=st.map.hexes['1,0'];
      const terrain=h.terrain; h.resource=null; h.naturalWonder=null;
      return {terrain:Game.terrainType(h),unchanged:h.terrain===terrain}; })()`);
    R.ok("removing the token preserves existing underlying terrain", after.unchanged && after.terrain === "mountain", after);
    R.ok("no uncaught browser errors", tab.errors.length === 0, tab.errors);
  } catch (e) { R.ok("tooltip scenario completed", false, e.stack); }
  finally { tab?.close(); server.kill(); }
  console.log("natural-wonder-browser-test:"); R.print(); if (R.fail) process.exitCode = 1;
})();
