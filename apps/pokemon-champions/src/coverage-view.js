// Type-coverage tool (à la pkmn.help). Two modes, both shown as clean grouped
// type badges:
//  • Offense: pick attacking type(s) → "Deals N× to …" each defending type, plus
//    a roster breakdown whose counts are clickable to list the actual Pokémon.
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
  const state = { mode: "offense", atk: new Set(), def: new Set(), lists: {} };

  // best multiplier of the selected attacking types vs a (single) defending type
  const offVs = (d) => Math.max(0, ...[...state.atk].map((a) => chart[a]?.[d] ?? 1));
  // best multiplier vs a real mon (its 1–2 types)
  const offVsMon = (m) => {
    let b = 0;
    for (const a of state.atk) {
      const e = (chart[a]?.[m.types[0]] ?? 1) * (m.types[1] ? (chart[a]?.[m.types[1]] ?? 1) : 1);
      if (e > b) b = e;
    }
    return b;
  };
  const defMult = (a) => { const d = [...state.def]; return (chart[a]?.[d[0]] ?? 1) * (d[1] && d[1] !== d[0] ? (chart[a]?.[d[1]] ?? 1) : 1); };
  const sameTyping = (mt, d) => { const s = new Set(mt); return s.size === d.length && d.every((t) => s.has(t)); };

  container.addEventListener("click", (e) => {
    const mode = e.target.closest(".cov-mode button");
    if (mode) { state.mode = mode.dataset.covMode; render(); return; }
    const chip = e.target.closest("[data-cov-type]");
    if (chip) {
      const t = chip.dataset.covType;
      const set = state.mode === "offense" ? state.atk : state.def;
      if (set.has(t)) set.delete(t);
      else { set.add(t); if (state.mode === "defense" && set.size > 2) set.delete([...set][0]); }
      render();
      return;
    }
    const bk = e.target.closest("[data-bucket]");
    if (bk && onShowMons) onShowMons(bk.dataset.title, state.lists[bk.dataset.bucket] || []);
  });

  const modeBar = () => `<div class="seg cov-mode">
    <button data-cov-mode="offense" class="${state.mode === "offense" ? "active" : ""}">⚔ Offense</button>
    <button data-cov-mode="defense" class="${state.mode === "defense" ? "active" : ""}">🛡 Defense</button></div>`;
  const chipRow = (set) => `<div class="type-chips">${TYPES.map((t) =>
    `<button class="type-chip ${set.has(t) ? "on" : ""}" data-cov-type="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>`;

  function renderOffense() {
    if (!state.atk.size) return `<p class="team-empty">Pick at least one attacking type above.</p>`;
    const byMult = new Map();
    for (const d of TYPES) pushMult(byMult, offVs(d), d);

    const se = [], neu = [], res = [], imm = [];
    for (const m of roster) { const e = offVsMon(m); (e >= 2 ? se : e === 0 ? imm : e < 1 ? res : neu).push(m); }
    state.lists = { se, neu, res, imm };

    return `${groupedBadges(byMult, (m) => `Deals ${multTxt(m)} to`)}
      <div class="cov-summary">Against all ${roster.length} Pokémon in the roster, your best hit is
        <button class="cov-link se" data-bucket="se" data-title="Super-effective (${se.length})">super-effective on ${se.length}</button> ·
        <button class="cov-link" data-bucket="neu" data-title="Neutral (${neu.length})">neutral on ${neu.length}</button> ·
        <button class="cov-link rs" data-bucket="res" data-title="Resist your coverage (${res.length})">resisted by ${res.length}</button> ·
        <button class="cov-link im" data-bucket="imm" data-title="No effect (${imm.length})">no effect on ${imm.length}</button>.
        <span class="muted">(click a number to list them)</span></div>`;
  }

  function renderDefense() {
    if (!state.def.size) return `<p class="team-empty">Pick a defending type (1–2) above.</p>`;
    const byMult = new Map();
    for (const a of TYPES) pushMult(byMult, defMult(a), a);
    const typed = roster.filter((m) => sameTyping(m.types, [...state.def]));
    state.lists = { typed };
    const typingTxt = [...state.def].map(cap).join(" / ");
    return `<div class="def-typing">Defending typing <b>${typingTxt}</b> —
        <button class="cov-link" data-bucket="typed" data-title="${typingTxt} (${typed.length})">${typed.length} Pokémon have it →</button></div>
      ${groupedBadges(byMult, (m) => `Takes ${multTxt(m)} from`)}`;
  }

  function render() {
    const off = state.mode === "offense";
    container.innerHTML = `<div class="cov">
      <div class="team-head"><h2>Type coverage</h2>
        <p class="calc-note">${off
          ? "Pick your attacking type(s) — see what your <b>best</b> hit deals to every defending type."
          : "Pick a defending typing — see how hard each attacking type hits it."}</p></div>
      <div class="cov-top">${modeBar()}<div class="cov-pick"><span class="cov-pick-lab">${off ? "Attacking types" : "Defending typing (1–2)"}</span>${chipRow(off ? state.atk : state.def)}</div></div>
      ${off ? renderOffense() : renderDefense()}
    </div>`;
  }

  render();
}
