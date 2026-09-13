"use strict";
const {execFileSync}=require("node:child_process"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {mutations}=require("./reliability-faults.cjs");
const hashes=()=>Object.fromEntries(["game.js","ui.js","net.js"].map(file=>[file,crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname,"..",file))).digest("hex")]));
const before=hashes();let killed=0,failed=0;
const signatures={
  missing_adjacency:/FAIL Indonesia route/,forbidden_land_exit:/FAIL Indonesia route/,
  excessive_transition_cost:/FAIL Indonesia route/,stale_targets:/FAIL live targets reconcile/,
  locked_host_recovery:/FAIL revealing locks normal undo and retains emergency recovery/,
  local_only_undo:/FAIL host reload restores the retained private snapshot/,
  forced_economy_rewards:/FAIL visitor receives three total and Ottoman one on chosen cards/,
  replaced_normal_reward:/FAIL normal two tokens are not replaced by Ibrahim/,
  cross_seat_ibrahim:/FAIL p2\/host cannot answer holder's Ibrahim choice/
};
for(const [name,[file]] of Object.entries(mutations)) {
  if(process.argv.includes("--engine-only")&&file!=="game.js")continue;
  const script=name==="stale_targets"?"movement-reconnect-browser-test.js":name==="local_only_undo"?"reliability-browser-test.js":"reliability-rules-test.js";
  let output="",code=0;
  try {output=execFileSync(process.execPath,[path.join(__dirname,script)],{encoding:"utf8",env:{...process.env,CIV_TEST_MUTATION:name,CIV_SKIP_SOAK:"1"},timeout:240000});}
  catch(e) {code=e.status;output=String(e.stdout||"")+String(e.stderr||"");}
  const detected=code!==0&&signatures[name].test(output);
  console.log(`${detected?"KILLED":"FAILED"} ${name}: ${output.split(/\r?\n/).find(line=>signatures[name].test(line))||output.slice(-350)}`);
  if(detected)killed++;else failed++;
}
const unchanged=JSON.stringify(hashes())===JSON.stringify(before);
console.log(`Mutation verification: ${killed} detected, ${failed} failed; runtime source restored/unchanged: ${unchanged}`);
if(failed||!unchanged)process.exitCode=1;
