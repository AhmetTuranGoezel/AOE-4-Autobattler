"use strict";
// Test-only in-memory transforms. Production source files are NEVER rewritten.
function replace(source, before, after) {
  if(!source.includes(before)) throw Error("Mutation target no longer exists: "+before);
  return source.replace(before,after);
}
const mutations = {
  missing_adjacency: ["game.js", s=>replace(s,"return Array.from(new Set(normal.concat(edgeWater)));","return normal;")],
  forbidden_land_exit: ["game.js", s=>{
    const before='if (h.terrain === "water" && !waterOk) return;';
    if(!s.includes(before))throw Error("water boundary missing");
    return s.replaceAll(before,'if (st.map.hexes[cur.key]?.terrain === "water" && h.terrain !== "water") return; '+before);
  }],
  excessive_transition_cost: ["game.js", s=>replace(s,"distances.set(nk, cur.steps + 1);",
    'distances.set(nk, cur.steps + (hexDist(st.map.hexes[cur.key], h) > 1 ? 2 : 1));')],
  stale_targets: ["ui.js", s=>replace(s,
    'if (sub.movementState && !isExploring(sub.phase) && !actionPending) reconcileMovementDraft();',
    '/* mutation: leave cached movement targets untouched on snapshots */')],
  locked_host_recovery: ["game.js", s=>replace(s,'valid && role === "host" && !!getPlayer(st, playerId) && !st.stateView;',
    'valid && !undo.locked && role === "host" && !!getPlayer(st, playerId) && !st.stateView;')],
  local_only_undo: ["ui.js", s=>replace(s,'if (fullState.turnUndo?.snapshot) await CivSessionStore.saveTurnStart',
    'if (false) await CivSessionStore.saveTurnStart')],
  forced_economy_rewards: ["game.js", s=>replace(s,'const target = tradeChoiceCard(player, choice, cardType);',
    'const target = choice.source === "Ibrahim" ? rowCards(player).find(c=>c.type==="economy") : tradeChoiceCard(player, choice, cardType);')],
  replaced_normal_reward: ["game.js", s=>replace(s,'const tradeGain = 2;',
    'const tradeGain = st.ibrahimHolder === player.id ? 1 : 2;')],
  cross_seat_ibrahim: ["game.js", s=>replace(s,'const bound = bindActionActor(action, context || {});',
    `const bound = bindActionActor(action, context || {});
      const stolen = candidate.pendingChoices?.find(c=>c.id===bound.payload?.choiceId && c.source==='Ibrahim');
      if(stolen) { context={...context,actorId:stolen.playerId};bound.payload.playerId=stolen.playerId; }`)]
};
function transform(file, source) {
  const mutation=process.env.CIV_TEST_MUTATION;
  if(mutation) {
    const spec=mutations[mutation];if(!spec)throw Error("Unknown mutation: "+mutation);
    if(spec[0]===file)source=spec[1](source);
  }
  if(file==="net.js" && process.env.CIV_BROWSER_LATENCY_MS) {
    const ms=Number(process.env.CIV_BROWSER_LATENCY_MS);
    source=replace(source,'try { connection.send(message); return true; } catch (error) { return false; }',
      `try {
        const copy=cloneJson(message);
        const fault=globalThis.__productionFault;
        if(fault && fault.type===message.type && fault.remaining>0) {
          fault.remaining--; fault.message=copy;
          if(fault.hold)globalThis.__releaseProductionPacket=()=>connection.send(copy);
          return true;
        }
        setTimeout(()=>{try { if(connection.open) connection.send(copy); } catch {}}, ${ms});
        if(['action','snapshot','actionResult'].includes(message.type)) {
          globalThis.__faultPackets=(globalThis.__faultPackets||0)+1;
          if(globalThis.__faultPackets%7===0) setTimeout(()=>{try { if(connection.open) connection.send(copy); } catch {}}, ${ms+1100});
        }
        return true;
      } catch { return false; }`);
  }
  return source;
}
module.exports={mutations,transform};
