// Champions-style stat lab for the detail panel. ONE stats section (no duplicate
// breakdown): each row shows the stat bar (with cleaned/wasted shading) + a point
// stepper (− N + / MAX), and the Lv50 / base values. Above it sit the three eHP
// figures; below, a one-click optimizer for the best bulk spread.
//
// eHP at Lv50: Physical = HP·Def, Special = HP·SpD. They share HP, so "Mixed" is
// their harmonic mean — effective HP against an equal physical+special mix.
import { STAT_KEYS, STAT_LABELS, statsFor, statScaleMax, explainEffective } from "./effective-stats.js";
import { statColor } from "./table.js";

export const POOL = 66;   // total points to distribute
export const CAP = 32;    // most points one stat can take
export const BULK_KEYS = ["hp", "def", "spd"];  // the stats that move eHP
const SCALE = 255;        // bar scale (a maxed Lv50 stat stays under 100%)

export const emptySpread = () => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
const used = (spread) => STAT_KEYS.reduce((s, k) => s + (spread[k] || 0), 0);
export const pointsUsed = used;
const sep = (x) => Math.round(x).toLocaleString("en-US");
const fmtDelta = (value, base) => { const d = Math.round(value - base); return d > 0 ? `+${sep(d)}` : ""; };
const barPct = (v) => Math.max(0, Math.min(100, (v / SCALE) * 100));

// Effective-HP figures for a mon under a given point spread (Lv50 stats + points).
export function ehpValues(mon, spread) {
  const lv = statsFor(mon, "lv50");
  const hm = (p, s) => (p + s ? (2 * p * s) / (p + s) : 0);
  const at = (h, d, s) => {
    const hp = lv.hp + h, def = lv.def + d, spd = lv.spd + s;
    return { hp, def, spd, phys: hp * def, spec: hp * spd, mixed: hm(hp * def, hp * spd) };
  };
  const cur = at(spread.hp || 0, spread.def || 0, spread.spd || 0);
  cur.base = at(0, 0, 0);
  return cur;
}

// Best bulk spread for a metric, brute-forced over HP/Def/SpD within the budget.
export function optimizeSpread(mon, metric) {
  const lv = statsFor(mon, "lv50");
  const score = (h, d, s) => {
    const hp = lv.hp + h, phys = hp * (lv.def + d), spec = hp * (lv.spd + s);
    if (metric === "phys") return phys;
    if (metric === "spec") return spec;
    return phys + spec ? (2 * phys * spec) / (phys + spec) : 0;  // mixed (harmonic mean)
  };
  let best = { h: 0, d: 0, s: 0, v: -1 };
  for (let h = 0; h <= CAP; h++) {
    for (let d = 0; d <= Math.min(CAP, POOL - h); d++) {
      const s = Math.min(CAP, POOL - h - d);
      const v = score(h, d, s);
      if (v > best.v) best = { h, d, s, v };
    }
  }
  return { ...emptySpread(), hp: best.h, def: best.d, spd: best.s };
}

// --- the three eHP cards (live region; updated by tick, never re-rendered) ---
function ehpCard(label, cls, value, base, hint) {
  return `<div class="ehp-card ${cls}" title="${hint}">
    <span class="ehp-lab">${label}</span>
    <span class="ehp-num"><b class="ehp-val">${sep(value)}</b><span class="ehp-delta">${fmtDelta(value, base)}</span></span>
  </div>`;
}
export function renderEhpCards(mon, spread) {
  const v = ehpValues(mon, spread);
  return `<div class="ehp-cards">
    ${ehpCard("Physical eHP", "phys", v.phys, v.base.phys, "HP × Def — survival vs physical hits")}
    ${ehpCard("Special eHP", "spec", v.spec, v.base.spec, "HP × Sp.Def — survival vs special hits")}
    ${ehpCard("Mixed eHP", "mixed", v.mixed, v.base.mixed, "Effective HP vs an equal physical+special mix (harmonic mean)")}
  </div>`;
}

// --- the single stat section: bar + stepper + Lv50/base, per stat ---
export function renderStatRows(mon, spread) {
  const lv = statsFor(mon, "lv50");
  const e = mon._eff;
  const u = used(spread);

  const metaSpread = mon.usage && mon.usage.spread;
  const rows = STAT_KEYS.map((k) => {
    const pts = spread[k] || 0;
    const bulk = BULK_KEYS.includes(k);
    const wasted = e && e.eff[k] === 0;          // cleaned to zero (lower attacker / too slow)
    const base = lv[k], cur = base + pts;
    const bp = barPct(base), inv = barPct(cur) - bp;
    const meta = metaSpread && metaSpread[k];     // [pts, pct] the meta typically invests here
    const metaPts = meta ? meta[0] : 0;
    const metaTick = metaPts ? `<i class="pt-bar-meta" style="left:${barPct(base + metaPts)}%" title="Meta avg: +${metaPts} (${meta[1]}% of all points)"></i>` : "";
    const metaLab = metaPts ? `<small class="pt-meta" title="${meta[1]}% of points">meta +${metaPts}</small>` : "";
    return `<div class="pt-row${wasted ? " is-wasted" : ""}">
      <span class="pt-lab">${STAT_LABELS[k]}${bulk ? '<i class="pt-bulk-dot" title="affects eHP"></i>' : ""}${wasted ? '<span class="pt-wtag" title="counts as 0 in the cleaned total">wasted</span>' : ""}</span>
      <span class="pt-bar"><i class="pt-bar-base" style="width:${bp}%;background:${statColor(base, SCALE)}"></i><i class="pt-bar-inv" style="left:${bp}%;width:${inv}%"></i>${metaTick}</span>
      <span class="pt-step">
        <button class="pt-pm" data-pt-step="${k}" data-dir="-1" aria-label="${STAT_LABELS[k]} minus">−</button>
        <input class="pt-num" type="number" min="0" max="${CAP}" value="${pts}" data-pt-num="${k}" aria-label="${STAT_LABELS[k]} points">
        <button class="pt-pm" data-pt-step="${k}" data-dir="1" aria-label="${STAT_LABELS[k]} plus">+</button>
      </span>
      <button class="pt-max" data-pt-max="${k}" title="Fill with the points you have left">MAX</button>
      <button class="pt-x" data-pt-clear="${k}" ${pts ? "" : "disabled"} title="Clear">✕</button>
      <span class="pt-rl"><b class="pt-cur">${cur}</b><small class="pt-amt">${pts ? ` +${pts}` : ""}</small><small class="pt-raw">${base} base</small>${metaLab}</span>
    </div>`;
  }).join("");

  const reasons = e ? explainEffective(mon, e).map((r) => `<li>${r}</li>`).join("") : "";
  const metaNote = metaSpread ? '<p class="lab-meta-note"><i class="pt-bar-meta-legend"></i> caret marks the meta\'s typical point investment (pokebase)</p>' : "";

  return `<section class="stat-rows">
    <div class="pt-pool">
      <span class="pt-pool-lab">Points <b class="pt-pool-used">${u}</b> / ${POOL} <em class="pt-pool-left">(${POOL - u} left)</em></span>
      <span class="pt-pool-bar"><i style="width:${(u / POOL) * 100}%"></i></span>
    </div>
    <div class="pt-rows">${rows}</div>
    ${metaNote}
    <ul class="why">${reasons}</ul>
    <div class="lab-actions">
      <span class="lab-opt-lab">Best spread for eHP</span>
      <div class="seg lab-opt">
        <button data-pt-opt="phys">Physical</button>
        <button data-pt-opt="spec">Special</button>
        <button data-pt-opt="mixed">Mixed</button>
      </div>
      <button class="btn-sm lab-reset" data-pt-reset>Clear all</button>
    </div>
  </section>`;
}

// Single live update for every interaction: refresh eHP cards, the pool, and each
// row's number / bar / values — no DOM rebuild, so inputs keep focus and it's snappy.
// `root` is the detail panel (#detail) since eHP cards and stat rows are siblings.
export function tickStatLab(root, mon, spread) {
  const v = ehpValues(mon, spread);
  const lv = statsFor(mon, "lv50");
  const u = used(spread);
  const card = (cls, value, base) => {
    const c = root.querySelector(`.ehp-card.${cls}`);
    if (!c) return;
    c.querySelector(".ehp-val").textContent = sep(value);
    c.querySelector(".ehp-delta").textContent = fmtDelta(value, base);
  };
  card("phys", v.phys, v.base.phys);
  card("spec", v.spec, v.base.spec);
  card("mixed", v.mixed, v.base.mixed);
  const set = (sel, txt) => { const el = root.querySelector(sel); if (el) el.textContent = txt; };
  set(".pt-pool-used", u);
  set(".pt-pool-left", `(${POOL - u} left)`);
  const pbar = root.querySelector(".pt-pool-bar i"); if (pbar) pbar.style.width = `${(u / POOL) * 100}%`;
  root.querySelectorAll(".pt-row").forEach((rowEl, i) => {
    const k = STAT_KEYS[i];
    const pts = spread[k] || 0;
    const cur = lv[k] + pts;
    const num = rowEl.querySelector(".pt-num"); if (num && +num.value !== pts) num.value = pts;
    const inv = rowEl.querySelector(".pt-bar-inv"); if (inv) inv.style.width = `${barPct(cur) - barPct(lv[k])}%`;
    const curEl = rowEl.querySelector(".pt-cur"); if (curEl) curEl.textContent = cur;
    const amt = rowEl.querySelector(".pt-amt"); if (amt) amt.textContent = pts ? ` +${pts}` : "";
    const x = rowEl.querySelector(".pt-x"); if (x) x.disabled = !pts;
  });
}
