import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderTeamView, teamBuildStats } from "../src/team-view.js";
import { initCoverageView } from "../src/coverage-view.js";
import { initAbilitiesView } from "../src/abilities-view.js";
import { renderAbilityPopup } from "../src/info.js";
import { renderCompare } from "../src/compare.js";
import { computeEffective, DEFAULT_WEIGHTS } from "../src/effective-stats.js";
import { retainRenderFocus } from "../src/render-focus.js";

const chart = JSON.parse(readFileSync(new URL("../champions-data.json", import.meta.url))).typeChart;
const mon = {
  slug: "test-mon", name: "Test Mon", stats: { hp: 80, atk: 90, def: 80, spa: 70, spd: 80, spe: 80 },
  types: ["normal"], off: { phys: 8, spec: 6 }, moves: [1], abilities: [{ slug: "levitate" }], sprite: "test.png",
};
const data = {
  pokemon: [mon], total: 1, typeChart: chart,
  abilities: { levitate: { name: "Levitate", count: 1, desc: "Floats." } },
  moves: { 1: { name: "Test Hit", type: "normal", class: "physical", power: 80, accuracy: 100 } },
};
const spread = { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 };
assert.deepEqual(teamBuildStats(mon, spread, "modest"), { hp: 157, atk: 99, def: 100, spa: 134, spd: 100, spe: 132 });
assert.deepEqual(teamBuildStats(mon), { hp: 155, atk: 110, def: 100, spa: 90, spd: 100, spe: 100 });

const container = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
const member = { mon, spread, nature: "modest", item: "none", ability: "levitate", moveIds: [1], picked: true };
renderTeamView(container, { data, team: [member], savedTeams: [{ id: "stable-team", name: "Saved", members: [{ slug: mon.slug }] }] });
const html = container.innerHTML;
const pointEditor = html.match(/<details class="tm-build"[^>]*>([\s\S]*?)<\/details>/);
assert.ok(pointEditor, "Points remain editable");
assert.doesNotMatch(pointEditor[0].split(">", 1)[0], /\bopen\b/, "An imported spread must start compact");
assert.doesNotMatch(pointEditor[1], /data-team-nature|data-team-stat-value|data-team-item|data-set-ability|tm-moves/,
  "Collapsing points must never hide build identity, calculated stats or moves");
assert.equal((html.match(/data-team-stat-value=/g) || []).length, 6);
assert.match(html, /data-team-stat-value="spa">134/);
assert.match(html, /value="modest" selected/);
assert.match(html, /data-load-team="stable-team"/);
assert.ok(html.indexOf('class="team-members"') < html.indexOf('class="team-analysis-bar"'));
container.querySelectorAll = () => [{ dataset: { teamBuild: mon.slug } }];
renderTeamView(container, { data, team: [member] });
assert.match(container.innerHTML, /<details class="tm-build"[^>]*\bopen\b/, "Live edits keep their point editor open");
container.querySelectorAll = () => [];
renderTeamView(container, { data, team: [{ ...member, nature: null, spread: null }] });
assert.match(container.innerHTML, /Points unknown · assuming 0/);
assert.match(container.innerHTML, /Nature unknown/);
assert.match(container.innerHTML, /data-team-stat-value="spa">90/);

let coverageClick;
const coverage = { innerHTML: "", addEventListener: (_, fn) => { coverageClick = fn; } };
initCoverageView({ container: coverage, data });
assert.match(coverage.innerHTML, /class="cov-core-grid"/);
coverageClick({ target: { closest: (selector) => selector === "[data-cov-atk]" ? { dataset: { covAtk: "normal" } } : null } });
assert.ok(coverage.innerHTML.indexOf("🛡 Defense") < coverage.innerHTML.indexOf("Best type to add next"),
  "The defense lookup must come before next-type recommendations");

const controls = new Map();
const toolbar = { innerHTML: "", querySelector: selector => {
  if (!controls.has(selector)) controls.set(selector, { addEventListener() {}, textContent: "" });
  return controls.get(selector);
} };
const listeners = new Map();
const abilities = { innerHTML: "", addEventListener: (event, fn) => listeners.set(event, fn) };
let opened = null;
initAbilitiesView({ toolbarEl: toolbar, contentEl: abilities, data, onInfo: slug => { opened = slug; } });
assert.match(abilities.innerHTML, /role="button" tabindex="0"/);
for (const key of ["Enter", " "]) {
  opened = null;
  listeners.get("keydown")({ key, preventDefault() {}, target: { matches: () => true, dataset: { ability: "levitate" } } });
  assert.equal(opened, "levitate");
}
assert.match(renderAbilityPopup({ ...data.abilities.levitate, slug: "levitate" }, [mon], 1),
  /<button class="lr learner-link" data-slug="test-mon"/);
mon._eff = computeEffective(mon, DEFAULT_WEIGHTS, "lv50");
assert.match(renderCompare([mon], data, 220), /Lv50 stats · 0 points · neutral Nature/);
assert.match(renderCompare([mon], data, 200), /Base species stats/);

// Rebuilt editing controls retain identity, without focusing another team member.
const doc = { activeElement: null };
let controlsAfterRender = [];
const focusRoot = {
  ownerDocument: doc,
  contains: el => controlsAfterRender.includes(el),
  querySelectorAll: tag => controlsAfterRender.filter(el => el.tagName.toLowerCase() === tag),
};
function makeControl(tag, attrs, { hidden = false, disabled = false } = {}) {
  const el = {
    tagName: tag.toUpperCase(), attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    getAttribute: name => attrs[name] ?? null, isConnected: true, disabled,
    getClientRects: () => hidden ? [] : [{}],
  };
  el.focus = opts => { assert.deepEqual(opts, { preventScroll: true }); doc.activeElement = el; };
  return el;
}
const previous = makeControl("select", { "data-team-nature": "", "data-slug": "test-mon" });
controlsAfterRender = [previous]; doc.activeElement = previous;
const restoreNature = retainRenderFocus(focusRoot);
previous.isConnected = false;
const otherNature = makeControl("select", { "data-team-nature": "", "data-slug": "another-mon" });
const nextNature = makeControl("select", { "data-team-nature": "", "data-slug": "test-mon" });
controlsAfterRender = [otherNature, nextNature]; doc.activeElement = null;
restoreNature();
assert.equal(doc.activeElement, nextNature);

const persistent = makeControl("input", {});
Object.assign(persistent, { selectionStart: 2, selectionEnd: 4, setSelectionRange: (...range) => { persistent.selection = range; } });
controlsAfterRender = [persistent]; doc.activeElement = persistent;
const restorePersistent = retainRenderFocus(focusRoot);
doc.activeElement = null;
restorePersistent();
assert.equal(doc.activeElement, persistent);
assert.deepEqual(persistent.selection, [2, 4], "Persistent result searches retain their text selection");

controlsAfterRender = [nextNature]; doc.activeElement = nextNature;
const ambiguousRestore = retainRenderFocus(focusRoot);
nextNature.isConnected = false;
controlsAfterRender = [makeControl("select", { "data-team-nature": "", "data-slug": "test-mon" }), makeControl("select", { "data-team-nature": "", "data-slug": "test-mon" })];
doc.activeElement = null;
ambiguousRestore();
assert.equal(doc.activeElement, null, "Ambiguous controls must not steal focus");

for (const options of [{ hidden: true }, { disabled: true }]) {
  const prior = makeControl("select", { "data-ebsel": "nature" });
  controlsAfterRender = [prior]; doc.activeElement = prior;
  const restore = retainRenderFocus(focusRoot);
  prior.isConnected = false;
  controlsAfterRender = [makeControl("select", { "data-ebsel": "nature" }, options)]; doc.activeElement = null;
  restore();
  assert.equal(doc.activeElement, null, "Hidden or disabled controls must not take focus");
}
console.log("UI cohesion passed: permanent six-stat/Nature/build summary, compact imported points, editor continuity, analysis placement, coverage peers, keyboard abilities/learner buttons and scoped render focus");
