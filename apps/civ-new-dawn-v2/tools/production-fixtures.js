"use strict";

function finishSetup(Game, st) {
  for (let guard = 0; st.phase === "setup" && guard < 50; guard++) {
    const id = st.setup.order[st.setup.turnIndex];
    if (st.setup.phase === "fortress") {
      const hexKey = [...Game.getValidFortressHexes(st)][0];
      st = Game.applyAction(st, {type:"PLACE_FORTRESS",payload:{playerId:id,hexKey}});
    } else {
      const tileId = st.setup.playerTiles[id][0];
      let move;
      for (const k of Object.keys(st.map.hexes)) {
        const p = Game.tilePlacementFor(st, tileId, k, 0);
        if (p) { move = {tileId,anchorKey:k,rotation:p.rotation,side:"A"}; break; }
      }
      if (!move) throw Error("No legal capital placement");
      st = Game.applyAction(st, {type:"PLACE_TILE",payload:{playerId:id,...move}});
    }
  }
  if (st.phase !== "playing") throw Error("Setup did not finish");
  return st;
}

function lateGame(Game) {
  const players = Game.SEAT_COLORS.map((color,i) => Game.createPlayer(`p${i}`,`Player ${i}`,color));
  let st = finishSetup(Game, Game.createState(players));
  // Spread all remaining physical tiles across a plausible fully explored map.
  for (const tileId of st.tileStack.slice()) {
    if (st.tiles[tileId]?.placed) continue;
    let placed = false;
    const anchors = Object.keys(st.map.hexes).sort((a,b) =>
      Game.hexDist(st.map.hexes[a],{q:0,r:0})-Game.hexDist(st.map.hexes[b],{q:0,r:0}));
    for (const k of anchors) {
      for (let rotation=0;rotation<6;rotation++) {
        const keys=Game.getTileHexKeys(k,rotation,st.map.hexes);
        if (keys.some(key=>st.map.hexes[key]?.active)) continue;
        if (!keys.some(key=>Game.hexNeighborKeys(Game.parseQ(key),Game.parseR(key)).some(n=>st.map.hexes[n]?.active))) continue;
        Game.placeExploredTile(st,tileId,k,rotation,"A"); placed=true;break;
      }
      if(placed)break;
    }
    if (!placed) throw Error("Could not expand stress map with "+tileId);
  }
  const land = Object.entries(st.map.hexes).filter(([,h]) => h.active && h.terrain !== "water" && !h.fortress);
  land.forEach(([key,h],i) => {
    const p = st.players[i%5];
    if (i%5 === 0 && !h.city) h.city={ownerId:p.id,isCapital:false,developed:true,hasWonder:false,wonder:null};
    else if (!h.city && !h.cityState) h.control={ownerId:p.id,fortified:true,district:i%17===0?"campus":null};
    if (i<5) {p.armies[0].position=key;p.caravans[0].position=key;}
  });
  st.turn.round=30;st.revision=1000;st.gameId="size-regression-game";
  st.log=Array.from({length:500},(_,i)=>`Round ${i}: Player placed control tokens, claimed a resource and resolved a world wonder ability.`);
  st.chat=Array.from({length:100},(_,i)=>({seatId:"p0",name:"Player 0",text:"x".repeat(100),at:100000+i}));
  st.tileStack=[];st.tileDeck=[];
  return st;
}
function cultureBoard(Game, st, id) {
  st.pendingChoices=[];st.activeCard=null;st.cardResolution=null;st.movementContinuation=null;
  st.turn.index=st.turn.order.indexOf(id);
  const p=Game.getPlayer(st,id);p.leaderId="china";p.cardPlayed=false;p.government=null;
  p.cardTiers.culture=1;p.cardLevels.culture=1;
  p.focusRow=["growth","economy","science","military","industry","culture"];
  Game.FOCUS_TYPES.forEach(t=>p.trade[t]=0);
  Object.values(st.map.hexes).forEach(h=>Object.assign(h,{active:false,city:null,control:null,barbarian:false,cityState:null,fortress:false,naturalWonder:null,resource:null,terrain:"grass"}));
  Object.assign(st.map.hexes["0,0"],{active:true,city:{ownerId:id,isCapital:true,developed:false}});
  for (const k of ["1,0","0,1","-1,1"])Object.assign(st.map.hexes[k],{active:true,terrain:"mountain"});
  return st;
}
module.exports={finishSetup,lateGame,cultureBoard};
