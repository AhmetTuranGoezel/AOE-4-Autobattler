import assert from "node:assert/strict";
import { renderTable } from "../src/table.js";
import { applyFilters, createFilterState, sortMons } from "../src/filters.js";
import { computeEffective, DEFAULT_WEIGHTS } from "../src/effective-stats.js";
import { confirmedMoveIds, learnsetNotice } from "../src/data.js";

const mons = Array.from({ length: 20 }, (_, i) => {
  const mon = {
    slug: `mon-${i}`, _display: `Example ${i}`, dex: 900 - i, available: true,
    types: ["normal"], abilities: [], moves: [1], off: { phys: 1, spec: 0 },
    stats: { hp: 80, atk: 70 + i, def: 70, spa: 60, spd: 70, spe: 90 - i },
  };
  mon._eff = computeEffective(mon, DEFAULT_WEIGHTS, "base");
  return mon;
});
const rows = (markup) => [...markup.matchAll(/<tr data-slug="([^"]+)"[^>]*>\s*<td class="num rank"[^>]*>(.*?)<\/td>/g)]
  .map(([, slug, rank]) => [slug, rank]);
const render = (list, sort, pinned = [], extras = false) => renderTable(list, sort, new Set(), 200, extras, pinned);
const filters = createFilterState();
filters.statMin.atk = 73; // exactly 17 matches, with deliberately unrelated dex numbers
for (const key of ["atk", "spe", "name"]) {
  for (const dir of ["asc", "desc"]) {
    const sort = { key, dir };
    const list = sortMons(applyFilters(mons, filters), sort);
    assert.equal(list.length, 17);
    assert.deepEqual(rows(render(list, sort)), list.map((m, i) => [m.slug, String(i + 1)]));
    // A pin inside the filters retains its original position; outside pins get no rank.
    const pins = [mons[0], list[4]];
    for (const extras of [false, true]) {
      const markup = render(list, sort, pins, extras);
      const result = rows(markup);
      assert.deepEqual(result.slice(0, 2), [[mons[0].slug, "—"], [list[4].slug, "5"]]);
      assert.equal(result.length, 18);
      assert.equal(new Set(result.map(([slug]) => slug)).size, 18, "pins must not duplicate normal rows");
      assert.deepEqual(result.slice(2), list.flatMap((m, i) => i === 4 ? [] : [[m.slug, String(i + 1)]]));
      assert.match(markup, /sum-n">17</);
      assert.doesNotMatch(markup, /data-sort="(?:rank|dex)"/);
    }
  }
}
assert.deepEqual(rows(render([], { key: "atk", dir: "desc" }, [mons[0]])), [[mons[0].slug, "—"]]);
assert.deepEqual(rows(render([mons[0]], { key: "atk", dir: "desc" }, [mons[0]])), [[mons[0].slug, "1"]]);
assert.deepEqual(rows(render([], { key: "atk", dir: "asc" })), []);
assert.deepEqual(confirmedMoveIds(mons[0], [1, 2, 3]), [1]);
assert.match(learnsetNotice({ learnset: { status: "unverified" } }), /withheld/);
assert.match(learnsetNotice({ learnset: { status: "verified", source: "champions-repo" } }), /community/);
console.log("roster ranking and provenance tests passed");
