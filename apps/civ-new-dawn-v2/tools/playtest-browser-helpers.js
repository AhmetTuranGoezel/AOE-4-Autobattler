"use strict";
const { Tab, startServer, waitUntil } = require("./browser-harness.js");
const { playtestBoard } = require("./playtest-fixtures.js");

async function room(count) {
  const { child: server, port } = await startServer();
  const tabs = [];
  const close = () => { tabs.forEach((t) => t.close()); server.kill(); };
  try {
    for (let i = 0; i < count; i++) {
      const tab = await Tab.open(`playtest-${i + 1}`, `http://127.0.0.1:${port}/`);
      tabs.push(tab);
      if (await waitUntil(() => tab.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000) < 0) throw Error("Page failed to boot");
    }
    let code;
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      await tabs[0].eval(`(() => { document.querySelector('#inp-name').value = 'P1'; document.querySelector('#btn-create').click(); return true; })()`);
      await waitUntil(async () => !!(code = await tabs[0].eval("document.querySelector('#lobby-code-val')?.textContent?.trim()")), 40000);
      if (!code) {
        await tabs[0].eval("window.__oldPlaytestDocument = true");
        await tabs[0].reload();
        await waitUntil(() => tabs[0].eval("!window.__oldPlaytestDocument && document.readyState === 'complete' && typeof UI === 'object' && !!document.querySelector('#inp-name')"), 20000);
      }
    }
    if (!code) throw Error("PeerJS broker did not create a room after three attempts");
    for (let i = 1; i < count; i++) {
      await tabs[i].eval(`(() => { document.querySelector('#inp-name').value = 'P${i + 1}';
        document.querySelector('#inp-join').value = ${JSON.stringify(code)}; document.querySelector('#btn-join').click(); return true; })()`);
      if (await waitUntil(() => tabs[i].eval(`UI.debugState()?.players.length === ${i + 1}`), 40000) < 0) throw Error(`Seat ${i + 1} failed to join`);
    }
    await waitUntil(() => tabs[0].eval(`UI.debugState()?.players.length === ${count}`), 15000);
    const profiles = await tabs[0].eval("UI.debugState().players.map(({id,name,color}) => ({id,name,color}))");
    return { tabs, profiles, close };
  } catch (e) { close(); throw e; }
}

async function seedRoom(room, mode, order = room.profiles, options = {}) {
  if (await waitUntil(async () => (await Promise.all(room.tabs.map(t => t.eval(
    `!['offline','disconnected','reconnecting','connecting'].includes(Net.getStatus().phase) && Net.getStatus().roster.every(p=>p.state==='online'||p.status==='online')`
  )))).every(Boolean), 30000) < 0) throw Error('Peers did not reconnect before next fixture: '+JSON.stringify(await Promise.all(room.tabs.map(t=>t.eval('Net.getStatus()')))));
  const result = await room.tabs[0].eval(`(async () => {
    const previous = UI.debugState();
    const st = (${playtestBoard.toString()})(Game, ${JSON.stringify(order)}, ${JSON.stringify(mode)});
    const options = ${JSON.stringify(options)};
    if (options.stack) { st.tileStack = options.stack.slice(); st.tileDeck = st.tileStack.slice(); }
    st.gameId = previous.gameId; st.revision = previous.revision;
    UI.debugSetState(st);
    return await UI.dispatch({type:'HOST_EDIT_HEX',payload:{hexKey:'0,0',changes:{terrain:st.map.hexes['0,0'].terrain}}});
  })()`);
  if (result.status !== "accepted") throw Error("Fixture checkpoint failed: " + JSON.stringify(result));
  if (await waitUntil(async () => (await Promise.all(room.tabs.map((t) => t.eval("UI.debugState()?.revision"))))
    .every((r) => r === result.revision), 15000) < 0) throw Error("Fixture snapshot did not reach every real peer");
  for (const tab of room.tabs) await click(tab, '[data-camera="fit"]');
  return result;
}

async function click(tab, selector) {
  await settled(tab);
  if (await waitUntil(() => tab.eval(`(() => {const b=document.querySelector(${JSON.stringify(selector)});
    return b && !b.disabled && b.getBoundingClientRect().width>0;})()`),10000)<0)
    throw Error('Control did not appear: '+selector+' '+JSON.stringify(await tab.eval(
      `({info:UI.debugInfo(),wizard:document.querySelector('#wizard')?.innerText,chip:document.querySelector('#board-chip')?.innerText,net:Net.getStatus().phase})`)));
  // A newly received fixture/turn can animate the focus row. Track the actual
  // control until it settles; a coordinate sampled before mouse travel can hit
  // its neighbour instead. Never click through another control or an overlay.
  for (let attempt=0;attempt<20;attempt++) {
    const point = await tab.eval(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b || b.disabled) return null;
      b.scrollIntoView({block:'nearest'}); const r = b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    if (!point) throw Error("No enabled control: " + selector);
    await pointer(tab, point);
    const stable = await tab.eval(`(async () => {
      await new Promise(r => setTimeout(r, 40));
      const b=document.querySelector(${JSON.stringify(selector)}),r=b?.getBoundingClientRect();
      return b && !b.disabled && b.contains(document.elementFromPoint(${point.x},${point.y})) &&
        Math.abs(r.x+r.width/2-${point.x})<1 && Math.abs(r.y+r.height/2-${point.y})<1;
    })()`);
    if (!stable) continue;
    await pointer(tab, point, true);
    return;
  }
  throw Error("Control did not settle under pointer: " + selector+' '+JSON.stringify(await tab.eval(`(() => {
    const b=document.querySelector(${JSON.stringify(selector)}),r=b?.getBoundingClientRect(),
      hit=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {rect:r?.toJSON(),hit:hit?.outerHTML,wizard:document.querySelector('#wizard')?.getBoundingClientRect().toJSON(),info:UI.debugInfo()};
  })()`)));
}
async function pointer(tab, point, clickIt = false) {
  if (tab.lastPlaytestPointer) {
    const previous = tab.lastPlaytestPointer;
    for (let step=1;step<9;step++) await tab.cdp.send("Input.dispatchMouseEvent", {
      type:"mouseMoved",x:previous.x+(point.x-previous.x)*step/9,
      y:previous.y+(point.y-previous.y)*step/9,button:"none"
    });
  }
  await tab.cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved",x:point.x,y:point.y,button:"none"});
  tab.lastPlaytestPointer = {x:point.x,y:point.y};
  if (clickIt) for (const type of ["mousePressed", "mouseReleased"]) await tab.cdp.send("Input.dispatchMouseEvent", {
    type, x:point.x,y:point.y,button:"left",clickCount:1
  });
}
async function hex(tab, key, clickIt = true) {
  await settled(tab);
  const panTrace=[];
  // Use the same pan gesture as a player; do not click through a wizard or
  // assume that a fixture's far-away space happens to be in the viewport.
  for (let i = 0; i < 32; i++) {
    const view = await tab.eval(`(() => { const p=UI.hexPoint(${JSON.stringify(key)}); if(!p) return null;
      const c=document.querySelector('#map canvas'),r=c.getBoundingClientRect();
      const targets=[];for(let y=Math.max(16,r.top+16);y<Math.min(innerHeight-16,r.bottom-16);y+=30)
        for(let x=Math.max(16,r.left+16);x<Math.min(innerWidth-16,r.right-16);x+=30)
        if(document.elementFromPoint(x,y)===c)targets.push({x,y});
      const visible=document.elementFromPoint(p.x,p.y)===c;
      if(visible||!targets.length)return {p,visible};
      const goal=targets.reduce((best,t)=>Math.hypot(t.x-p.x,t.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?t:best);
      const distance=Math.hypot(goal.x-p.x,goal.y-p.y),scale=Math.min(1,160/distance);
      // Choose BOTH ends of a usable drag. Starting at the leftmost sliver
      // of canvas then shrinking a leftward gesture barely moves the map.
      for(const fraction of [1,.75,.5,.25,.125]) {
        const dx=(goal.x-p.x)*scale*fraction,dy=(goal.y-p.y)*scale*fraction;
        if(Math.hypot(dx,dy)<6)continue;
        for(const target of targets) {
          const end={x:target.x+dx,y:target.y+dy};
          if(Array.from({length:9},(_,j)=>j/8).every(t=>document.elementFromPoint(target.x+dx*t,target.y+dy*t)===c))
            return {p,visible,target,end};
        }
      }
      return {p,visible}; })()`);
    if (!view) throw Error("Unknown hex: " + key);
    if (view.visible) break;
    if (!view.target) throw Error('No unobscured map area for panning: '+JSON.stringify(view));
    const end = view.end;
    await pointer(tab, view.target);
    await tab.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...view.target,button:'left',clickCount:1});
    await tab.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});
    await tab.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});
    tab.lastPlaytestPointer = end;
    panTrace.push({before:view.p,start:view.target,end,after:await tab.eval(`UI.hexPoint(${JSON.stringify(key)})`)});
  }
  const point = await tab.eval(`UI.hexPoint(${JSON.stringify(key)})`);
  if (!point) throw Error("Hex not visible: " + key);
  const hit = await tab.eval(`(() => {const p=UI.hexPoint(${JSON.stringify(key)}),el=document.elementFromPoint(p.x,p.y);
    return {ok:el===document.querySelector('#map canvas'),tag:el?.tagName,id:el?.id,point:p};})()`);
  if (!hit.ok) throw Error("Map space remains obscured: " + key + ' ' + JSON.stringify({hit,panTrace}));
  await pointer(tab, point, clickIt);
}
async function settled(tab) {
  if (await waitUntil(() => tab.eval("!UI.debugInfo().actionPending && !Net.getStatus().pendingActionId"), 15000) < 0) throw Error("Action did not settle");
}
module.exports = { room, seedRoom, click, hex, pointer, settled, playtestBoard };
