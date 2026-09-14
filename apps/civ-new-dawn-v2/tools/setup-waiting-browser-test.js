"use strict";
// The former private-capital-planning test is superseded by the requested
// direct-placement contract: no actionable buttons for a waiting player.
const {room}=require("./playtest-browser-helpers.js");
const {fullSetup,R}=require("./production-browser-test.js");
(async()=>{
  let table;
  try{table=await room(2);await fullSetup(table);R.ok("no setup browser errors",table.tabs.every(t=>!t.errors.length),table.tabs.flatMap(t=>t.errors));}
  catch(e){R.ok("setup scenario completed",false,e.stack);}
  finally{table?.close();}
  console.log("setup-waiting-browser-test:");R.print();if(R.fail)process.exitCode=1;
})();
