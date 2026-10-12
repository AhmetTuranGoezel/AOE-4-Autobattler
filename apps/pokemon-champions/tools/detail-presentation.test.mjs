import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DETAIL_TABS } from "../src/detail.js";
import { renderStatSummary, statValues, tickStatLab, emptySpread } from "../src/stat-lab.js";
import { statColor } from "../src/table.js";

assert.deepEqual(DETAIL_TABS, ["overview", "meta", "moves"]);
const data = JSON.parse(readFileSync(new URL("../champions-data.json", import.meta.url)));
for (const slug of ["hydreigon", "florges"]) {
  const mon = data.pokemon.find(mon => mon.slug === slug);
  const spread = { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 };
  for (const [points, nature] of [[null, null], [spread, "modest"]]) {
    const html = renderStatSummary(mon, points, nature);
    const values = statValues(mon, points, nature);
    assert.equal((html.match(/data-stat-row=/g) || []).length, 6);
    for (const [stat, value] of Object.entries(values)) {
      assert.ok(html.includes(`data-stat-current="${stat}">${value}</b>`), `${slug} ${stat} must stay readable`);
      assert.ok(html.includes(`<span class="stat-summary-base">${mon.stats[stat]}</span>`));
    }
    assert.match(html, />Base<\/span>/);
    assert.match(html, />Lv50<\/span>/);
  }
}
const hydreigon = data.pokemon.find(mon => mon.slug === "hydreigon");
const bar = { style: { background: statColor(statValues(hydreigon).spa, 255) } };
const current = { dataset: { statCurrent: "spa" }, closest: () => ({ querySelector: () => bar }) };
const liveRoot = {
  querySelectorAll: selector => selector === "[data-stat-current]" ? [current] : [],
  querySelector: () => null,
};
const invested = { ...emptySpread(), spa: 32 };
const beforeColor = bar.style.background;
tickStatLab(liveRoot, hydreigon, invested, "modest");
const spa = statValues(hydreigon, invested, "modest").spa;
assert.equal(current.textContent, spa);
assert.equal(bar.style.background, statColor(spa, 255), "Live Overview bar color must reflect the current calculated value");
assert.notEqual(bar.style.background, beforeColor, "Fixture crosses a stat-color band");
assert.equal(bar.style.width, `${Math.min(100, spa / 255 * 100)}%`);
console.log("Detail presentation passed: three tabs; six Base/Lv50 values for neutral and edited Hydreigon/Florges; live stat-bar values, width and color");
