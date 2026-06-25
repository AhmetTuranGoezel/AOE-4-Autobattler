// Type-coverage tool (à la pkmn.help). Two independent lookups, stacked on one
// page (each has its own type picker — they're separate questions, not two views
// of one thing, so there's no mode toggle):
//  • Offense: pick attacking type(s) → "Deals N× to …" each defending type, a
//    roster breakdown (with %, clickable to list the mons), and a "best type to
//    add next" table showing each candidate's marginal super-effective gain and
//    resist reduction across the roster (click a row to add it and re-base).
//  • Defense: pick a defending typing → "Takes N× from …" each attacking type.
import { TYPES, TYPE_COLORS } from "./data.js";

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const bigBadge = (t) => `<span class="def-badge" style="background:${TYPE_COLORS[t]}">${t}</span>`;
const multTxt = (m) => (m === 0 ? "0×" : m === 0.25 ? "¼×" : m === 0.5 ? "½×" : `${m}×`);
const CLS = { 4: "vweak", 2: "weak", 1: "neu", 0.5: "res", 0.25: "res2", 0: "imm" };

function groupedBadges(byMult, label) {
  return [4, 2, 1, 0.5, 0.25, 0].filter((m) => byMult.has(m)).map((m) =>
    `<div class="def-group"><h4 class="def-h ${CLS[m]}">${label(m)}${m === 0 ? " (no effect)" : ""}</h4>` +
    `<div class="def-badges">${byMult.get(m).map(bigBadge).join("")}</div></div>`).join("");
}
function pushMult(map, key, val) { (map.get(key) || map.set(key, []).get(key)).push(val); }

export function initCoverageView({ container, data, onShowMons }) {
  const chart = data.typeChart;
  const roster = data.pokemon.filter((m) => m.available !== false);
  const state = { atk: new Set(), def: new Set(), lists: {}, nextSort: "se" };
  const pct = (n) => Math.round((n / roster.length) * 100);

  // best multiplier of the selected attacking types vs a (single) defending type
  const offVs = (d) => Math.max(0, ...[...state.atk].map((a) => chart[a]?.[d] ?? 1));
  // best multiplier a set of attacking types lands on a real mon (its 1–2 types)
  const bestVsMon = (m, types) => {
    let b = 0;
    for (const a of types) {
      const e = (chart[a]?.[m.types[0]] ?? 1) * (m.types[1] ? (chart[a]?.[m.types[1]] ?? 1) : 1);
      if (e > b) b = e;
    }
    return b;
  };
  // split the roster into super-effective / neutral / resisted / immune for a typing
  const bucketsOf = (types) => {
    const se = [], neu = [], res = [], imm = [];
    if (types.length) for (const m of roster) {
      const e = bestVsMon(m, types);
      (e >= 2 ? se : e === 0 ? imm : e < 1 ? res : neu).push(m);
    }
    return { se, neu, res, imm };
  };
  const defMult = (a) => { const d = [...state.def]; return (chart[a]?.[d[0]] ?? 1) * (d[1] && d[1] !== d[0] ? (chart[a]?.[d[1]] ?? 1) : 1); };
  const sameTyping = (mt, d) => { const s = new Set(mt); return s.size === d.length && d.every((t) => s.has(t)); };

  container.addEventListener("click", (e) => {
    const add = e.target.closest("[data-cov-add]");
    if (add) { state.atk.add(add.dataset.covAdd); render(); return; }
    const ns = e.target.closest("[data-next-sort]");
    if (ns) { state.nextSort = ns.dataset.nextSort; render(); return; }
    const atk = e.target.closest("[data-cov-atk]");
    if (atk) {
      const t = atk.dataset.covAtk;
      if (state.atk.has(t)) state.atk.delete(t); else state.atk.add(t);
      render();
      return;
    }
    const def = e.target.closest("[data-cov-def]");
    if (def) {
      const t = def.dataset.covDef;
      if (state.def.has(t)) state.def.delete(t);
      else { state.def.add(t); if (state.def.size > 2) state.def.delete([...state.def][0]); }
      render();
      return;
    }
    const bk = e.target.closest("[data-bucket]");
    if (bk && onShowMons) onShowMons(bk.dataset.title, state.lists[bk.dataset.bucket] || []);
  });

  const chipRow = (set, attr) => `<div class="type-chips">${TYPES.map((t) =>
    `<button class="type-chip ${set.has(t) ? "on" : ""}" data-${attr}="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>`;

  function renderOffense() {
    if (!state.atk.size) return `<p class="team-empty">Pick at least one attacking type to begin.</p>`;
    const byMult = new Map();
    for (const d of TYPES) pushMult(byMult, offVs(d), d);

    const base = bucketsOf([...state.atk]);
    state.lists = { se: base.se, neu: base.neu, res: base.res, imm: base.imm };
    const n = { se: base.se.length, neu: base.neu.length, res: base.res.length, imm: base.imm.length };

    const summary = `<div class="cov-summary">Against all ${roster.length} Pokémon in the roster, your best hit is
        <button class="cov-link se" data-bucket="se" data-title="Super-effective (${n.se})">super-effective on ${n.se} (${pct(n.se)}%)</button> ·
        <button class="cov-link" data-bucket="neu" data-title="Neutral (${n.neu})">neutral on ${n.neu} (${pct(n.neu)}%)</button> ·
        <button class="cov-link rs" data-bucket="res" data-title="Resist your coverage (${n.res})">resisted by ${n.res} (${pct(n.res)}%)</button> ·
        <button class="cov-link im" data-bucket="imm" data-title="No effect (${n.imm})">no effect on ${n.imm} (${pct(n.imm)}%)</button>.
        <span class="muted">(click a number to list them)</span></div>`;

    return `${groupedBadges(byMult, (m) => `Deals ${multTxt(m)} to`)}
      ${summary}
      ${renderNextType(base)}`;
  }

  // "best type to add next": marginal effect of each unpicked attacking type on
  // top of the current selection. Adding a type only raises each mon's best
  // multiplier, so super-effective can only grow and resisted can only shrink.
  function renderNextType(base) {
    const remaining = TYPES.filter((t) => !state.atk.has(t));
    const basisTxt = [...state.atk].map(cap).join(" / ");
    if (!remaining.length) {
      return `<div class="cov-next"><h4>Best type to add next</h4><p class="team-empty">All 18 types selected — coverage is maxed.</p></div>`;
    }
    const baseRes = base.res.length + base.imm.length;
    const rows = remaining.map((t) => {
      const c = bucketsOf([...state.atk, t]);
      return {
        t,
        dSe: c.se.length - base.se.length,
        dRes: baseRes - (c.res.length + c.imm.length),
        dNeu: c.neu.length - base.neu.length,
      };
    });
    const maxSe = Math.max(1, ...rows.map((r) => r.dSe));
    const maxRes = Math.max(1, ...rows.map((r) => r.dRes));
    rows.sort((a, b) => (state.nextSort === "res"
      ? (b.dRes - a.dRes || b.dSe - a.dSe)
      : (b.dSe - a.dSe || b.dRes - a.dRes)));

    const sign = (x) => (x > 0 ? "+" + x : x < 0 ? "−" + Math.abs(x) : "±0");
    const body = rows.map((r) => `<button class="cov-next-row" data-cov-add="${r.t}" title="Add ${cap(r.t)} to your attacking types">
        <span class="def-badge sm" style="background:${TYPE_COLORS[r.t]}">${r.t}</span>
        <span class="cov-bar-cell">
          <span class="cov-bar"><span class="cov-bar-fill se" style="width:${(r.dSe / maxSe) * 100}%"></span></span>
          <span class="cov-bar-num se">+${r.dSe} <small>(+${pct(r.dSe)}%)</small></span>
        </span>
        <span class="cov-bar-cell">
          <span class="cov-bar"><span class="cov-bar-fill res" style="width:${(r.dRes / maxRes) * 100}%"></span></span>
          <span class="cov-bar-num res">−${r.dRes} <small>(−${pct(r.dRes)}%)</small></span>
        </span>
        <span class="cov-neu" title="change in neutral matchups">neu ${sign(r.dNeu)}</span>
      </button>`).join("");

    return `<div class="cov-next">
      <div class="cov-next-head">
        <div><h4>Best type to add next</h4>
          <p class="cov-next-sub">Marginal gain on top of <b>${basisTxt}</b> — click a row to add it, then it re-bases on the new pair.</p></div>
        <div class="seg cov-next-sort">
          <button data-next-sort="se" class="${state.nextSort !== "res" ? "active" : ""}">Most super-effective</button>
          <button data-next-sort="res" class="${state.nextSort === "res" ? "active" : ""}">Most resist removed</button>
        </div>
      </div>
      <div class="cov-next-cols"><span></span><span class="cov-col-lab se">Super-effective gained</span><span class="cov-col-lab res">Resist removed</span><span></span></div>
      ${body}
    </div>`;
  }

  function renderDefense() {
    if (!state.def.size) return `<p class="team-empty">Pick a defending type (1–2) to begin.</p>`;
    const byMult = new Map();
    for (const a of TYPES) pushMult(byMult, defMult(a), a);
    const typed = roster.filter((m) => sameTyping(m.types, [...state.def]));
    Object.assign(state.lists, { typed });
    const typingTxt = [...state.def].map(cap).join(" / ");
    return `<div class="def-typing">Defending typing <b>${typingTxt}</b> —
        <button class="cov-link" data-bucket="typed" data-title="${typingTxt} (${typed.length})">${typed.length} Pokémon have it →</button></div>
      ${groupedBadges(byMult, (m) => `Takes ${multTxt(m)} from`)}`;
  }

  function render() {
    state.lists = {};
    container.innerHTML = `<div class="cov">
      <div class="team-head"><h2>Type coverage</h2>
        <p class="calc-note">Two independent tools, both live here — your offensive coverage up top, a defensive typing's matchups below.</p></div>

      <section class="cov-section">
        <div class="cov-sec-head"><h3>⚔ Offense</h3>
          <p class="cov-sec-note">Pick your attacking type(s) — see what your <b>best</b> hit deals to every defending type, and how it fares across the roster.</p></div>
        <div class="cov-pick">${chipRow(state.atk, "cov-atk")}</div>
        ${renderOffense()}
      </section>

      <section class="cov-section">
        <div class="cov-sec-head"><h3>🛡 Defense</h3>
          <p class="cov-sec-note">Pick a defending typing (1–2) — see how hard each attacking type hits it.</p></div>
        <div class="cov-pick">${chipRow(state.def, "cov-def")}</div>
        ${renderDefense()}
      </section>
    </div>`;
  }

  render();
}
