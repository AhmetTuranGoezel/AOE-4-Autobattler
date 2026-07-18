// Browsable Moves table: power / accuracy / PP / priority / target / flags /
// effect / how many roster Pokemon learn it. Click a column to sort, Shift-click
// to add a tiebreaker (multi-key). Defaults to grouped-by-type, then most-common
// first. Can also load a *set* of Pokémon (e.g. the compared ones) to show per-mon
// ownership columns + filter to the moves they share, with full move detail here
// rather than crammed into the compare popup.
import { TYPES, TYPE_COLORS, displayName, targetLabel, isSpread, rarityTier, TARGET_GROUPS, grassKnotBP } from "./data.js";
import { statsFor } from "./effective-stats.js";
import { damageAbilities, offenseMult, offDefaultAbility, stageMult, OFF_ITEMS } from "./offense-model.js";
import { POOL, CAP, pointsUsed } from "./stat-lab.js";

const COLS = [
  { key: "name", label: "Move" },
  { key: "type", label: "Type" },
  { key: "class", label: "Cat", nosort: true },
  { key: "target", label: "Affects" },
  { key: "power", label: "Pow", num: true },
  { key: "accuracy", label: "Acc", num: true },
  { key: "expp", label: "Exp. Pow", num: true, title: "Expected power — Power × Accuracy × crit × multi-hit × spread(×0.75), plus the loaded mon's STAB and ability (Huge Power, Sand Force …)." },
  { key: "expd", label: "Eff. Dmg", num: true, title: "Effective damage — 0.44 × Exp. Pow (STAB + ability already in) × the mon's effective Atk/Sp.Atk (Lv50 + its ⚙ setup: points, nature, boosts). Compare against a defender's effective HP (HP×Def)." },
  { key: "pp", label: "PP", num: true },
  { key: "priority", label: "Prio", num: true },
  { key: "chance", label: "Effect", num: true, title: "Secondary effect and its chance" },
  { key: "flags", label: "Flags", nosort: true },
  { key: "count", label: "Pokémon", num: true },
  { key: "effect", label: "Description", nosort: true },
];
const DEFAULT_SORT = [{ key: "type", dir: "asc" }, { key: "count", dir: "desc" }];
const STR_KEYS = new Set(["name", "type", "target"]);
const defDir = (k) => (STR_KEYS.has(k) || k === "owned" ? "asc" : "desc");   // owned asc = unique first
const sortVal = (m, k) => (k === "target" ? targetLabel(m.target)
  : k === "chance" ? (m._fx ? m._fx.chance : 0)
  : k === "owned" ? (m._own ?? -1)
  : k === "expp" ? (m._expp ?? -1)
  : k === "expd" ? (m._expd ?? -1)
  : STR_KEYS.has(k) ? (m[k] || "")
  : (m[k] == null ? -1 : m[k]));

// What a move DOES, as searchable facets — derived from its secondaries, effect text,
// class and priority. `chance` = its most reliable secondary (100 for guaranteed effects
// of status moves).
const FACETS = {
  drops: "Lowers stats", raises: "Raises stats", status: "Inflicts status", flinch: "Flinch",
  heal: "Heals/Drains", priority: "Priority", hazard: "Hazards", weather: "Weather/Terrain",
};
const WEATHER_MOVES = new Set(["Rain Dance", "Sunny Day", "Sandstorm", "Snowscape", "Chilly Reception",
  "Electric Terrain", "Grassy Terrain", "Psychic Terrain", "Misty Terrain"]);
const STAT_SHORT = { attack: "Atk", defense: "Def", "special attack": "Sp.Atk", "special defense": "Sp.Def", speed: "Spe", accuracy: "Acc", evasiveness: "Eva", evasion: "Eva" };
// "Lowers the target's Attack and Special Attack by 1 stage" → chips + facets. These are
// PRIMARY effects (guaranteed, unlike chance-based secondaries) and were previously invisible
// in the Effect column.
const STAGE_RE = /(Lowers|Raises) the (target|user|foe)'s ([A-Za-z ,]+?) by (\d+) stages?/gi;
const PRIM_STATUS_RE = /(Paralyzes|Burns|Poisons|Badly poisons|Confuses) the (target|foe)|puts? the target[^.]{0,24}to sleep/i;
function classifyMove(m) {
  const facets = new Set();
  const chips = [];
  let chance = 0;
  const eff = m.effect || "";
  for (const [c, l] of (m.secondaries || [])) {
    const lab = l || "";
    if (lab.startsWith("−") || lab.startsWith("-")) { facets.add("drops"); chance = Math.max(chance, c); }
    else if (/burn|paraly|poison|freeze|sleep|confusion/.test(lab)) { facets.add("status"); chance = Math.max(chance, c); }
    else if (lab === "flinch") { facets.add("flinch"); chance = Math.max(chance, c); }
    else if (lab) chance = Math.max(chance, c);
  }
  // primary stat-stage effects (Noble Roar, Swords Dance, Armor Cannon's self-drop, …)
  for (const mm of eff.matchAll(STAGE_RE)) {
    const [, verb, who, statsTxt, n] = mm;
    const lower = verb.toLowerCase() === "lowers";
    const self = who.toLowerCase() === "user";
    const stats = statsTxt.toLowerCase().split(/,| and /).map((s) => STAT_SHORT[s.trim()]).filter(Boolean);
    for (const st of stats) {
      chips.push({ txt: `${lower ? "−" : "+"}${n} ${st}${self ? " self" : ""}`, cls: self ? (lower ? "cost" : "gain") : (lower ? "sure" : "gain") });
    }
    if (lower && !self && stats.length) { facets.add("drops"); chance = Math.max(chance, 100); }
    if (!lower && stats.length) { facets.add("raises"); chance = Math.max(chance, 100); }
  }
  // primary status infliction (Thunder Wave, Will-O-Wisp, Spore, …)
  const ps = eff.match(PRIM_STATUS_RE);
  if (ps) {
    facets.add("status"); chance = Math.max(chance, 100);
    chips.push({ txt: ps[1] ? `100% ${ps[1].toLowerCase().replace("badly poisons", "toxic").replace(/s$/, "")}` : "100% sleep", cls: "sure" });
  }
  if (/raises? the user|boosts? the user|raises? its own/i.test(eff)) facets.add("raises");
  if (/(restores?|recovers?).{0,30}hp|drains?|leech|user gains|heals? the user/i.test(eff)) facets.add("heal");
  if ((m.priority || 0) > 0) facets.add("priority");
  if (/stealth rock|spikes|sticky web/i.test(eff)) facets.add("hazard");
  if (WEATHER_MOVES.has(m.name)) facets.add("weather");
  return { facets, chance, chips };
}

// --- Expected damage: BP folded with accuracy, crit, multi-hit + conditional signature effects ---
const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// Conditional-damage moves: best-case multiplier applied only when the "best-case effects" toggle is on;
// the note is always shown so the potential is visible (e.g. H-Typhlosion's Infernal Parade).
const COND_DMG = {
  Facade: { mult: 2, note: "×2 if statused" }, Hex: { mult: 2, note: "×2 vs status" },
  "Infernal Parade": { mult: 2, note: "×2 vs status" }, Venoshock: { mult: 2, note: "×2 vs poison" },
  "Barb Barrage": { mult: 2, note: "×2 vs poison" }, Acrobatics: { mult: 2, note: "×2 if no item" },
  "Knock Off": { mult: 1.5, note: "×1.5 removes item" }, "Bolt Beak": { mult: 2, note: "×2 if first" },
  "Fishious Rend": { mult: 2, note: "×2 if first" }, Avalanche: { mult: 2, note: "×2 if hit first" },
  Payback: { mult: 2, note: "×2 if moving 2nd" }, Revenge: { mult: 2, note: "×2 if hit first" },
  Assurance: { mult: 2, note: "×2 if already hit" }, "Stomping Tantrum": { mult: 2, note: "×2 after a miss" },
  "Temper Flare": { mult: 2, note: "×2 after a miss" }, "Weather Ball": { mult: 2, note: "×2 in weather" },
  "Terrain Pulse": { mult: 2, note: "×2 in terrain" }, "Rising Voltage": { mult: 2, note: "×2 elec terrain" },
  "Expanding Force": { mult: 1.5, note: "×1.5 psychic terrain" }, "Collision Course": { mult: 4 / 3, note: "×1.33 if SE" },
  "Electro Drift": { mult: 4 / 3, note: "×1.33 if SE" }, Retaliate: { mult: 2, note: "×2 if ally fainted" },
  "Lash Out": { mult: 2, note: "×2 if stats lowered" },
};
// Weight/speed-scaled moves: no fixed BP, but computable per mon + the popover's assumed target.
const DYNAMIC_BP = new Set(["Grass Knot", "Low Kick", "Heavy Slam", "Heat Crash", "Gyro Ball", "Electro Ball"]);
// Precompute a move's expected-power modifiers (null = no BP-based expected: status / variable power).
function expData(m) {
  if (m.class === "status" || (m.power == null && !DYNAMIC_BP.has(m.name))) return null;
  const eff = m.effect || "";
  let hits = 1, hitNote = "";
  const range = eff.match(/hits (\w+) to (\w+) times/i);
  const fixed = eff.match(/hits (\w+) times/i);
  if (range && NUMWORD[range[1].toLowerCase()] && NUMWORD[range[2].toLowerCase()]) {
    const lo = NUMWORD[range[1].toLowerCase()], hi = NUMWORD[range[2].toLowerCase()];
    hits = lo === 2 && hi === 5 ? 3.1 : (lo + hi) / 2;   // 2–5 uses the Gen-5+ weighting
  } else if (fixed && NUMWORD[fixed[1].toLowerCase()]) hits = NUMWORD[fixed[1].toLowerCase()];
  else if (/hits twice/i.test(eff)) hits = 2;
  if (hits !== 1) hitNote = `×${hits % 1 ? hits.toFixed(1) : hits} hits`;
  let crit = 1 + (1 / 24) * 0.5, critNote = "";   // baseline Gen-9 crit (1/24 → ×1.5)
  if (/always a critical hit/i.test(eff)) { crit = 1.5; critNote = "always crits"; }
  else if (/higher chance for a critical hit/i.test(eff)) { crit = 1 + (1 / 8) * 0.5; critNote = "high crit"; }
  return { hits, hitNote, crit, critNote, cond: COND_DMG[m.name] || null, dynamic: m.power == null && DYNAMIC_BP.has(m.name) };
}

export function initMovesView({ toolbarEl, contentEl, data, onInfo, onFilter }) {
  const moves = Object.entries(data.moves).map(([id, m]) => ({ id: Number(id), ...m, _fx: classifyMove(m), _ep: expData(m) }));
  const allFlags = [...new Set(moves.flatMap((m) => m.flags || []))].sort();
  const monByName = new Map(data.pokemon.map((m) => [(m._display || displayName(m)).toLowerCase(), m]));
  const state = { search: "", type: "", cat: "", flags: new Set(), tgroup: "", facets: new Set(), chance: "",
    mons: [], ownMode: "any", focus: null, sort: structuredClone(DEFAULT_SORT),
    expBest: false,     // best case: conditional move effects AND conditional abilities assumed active
    cfgOpen: null,      // slug whose ⚙ customize popover (stats/boosts/item/ability) is open
    customMoves: [],    // invented what-if moves — pinned on top of the table, session-only
    cmvSeq: 1 };

  // Move-intrinsic power: BP × accuracy(×accMult) × crit × multi-hit × spread(0.75) × best-case cond.
  // `bpOverride` feeds weight/speed moves their computed BP.
  function intrinsicPower(m, accMult = 1, bpOverride) {
    const ep = m._ep;
    const bp = bpOverride != null ? bpOverride : m.power;
    if (!ep || bp == null) return null;
    const acc = (m.accuracy == null ? 1 : m.accuracy / 100) * accMult;
    let v = bp * acc * ep.crit * ep.hits;
    if (isSpread(m.target)) v *= 0.75;                       // Champions is doubles (Reg M-B)
    if (state.expBest && ep.cond) v *= ep.cond.mult;         // conditional signature effects
    return v;
  }
  // A mon's effective stat: Lv50 base + distributed points, ×1.1 nature (attacking stat), ×boost stage.
  function effStatOf(mon, key) {
    const base = { atk: mon.lvAtk, spa: mon.lvSpa, def: mon.lvDef, spe: mon.lvSpe }[key];
    const c = mon.cfg;
    const nat = c.nature && (key === "atk" || key === "spa" || key === "def") ? 1.1 : 1;   // def for Body Press setups
    return Math.floor(Math.floor((base + (c.spread[key] || 0)) * nat) * stageMult(c.stages[key] || 0));
  }
  // BP of weight/speed-scaled moves, from the mon + the popover's assumed target (kg / Spe).
  function dynamicBP(m, mon) {
    const c = mon.cfg;
    if (m.name === "Grass Knot" || m.name === "Low Kick") return { bp: grassKnotBP(c.tw), note: `weight ${c.tw}kg` };
    if (m.name === "Heavy Slam" || m.name === "Heat Crash") {
      const r = c.tw ? Math.floor((mon.weight || 0) / c.tw) : 0;
      return { bp: r >= 5 ? 120 : r === 4 ? 100 : r === 3 ? 80 : r === 2 ? 60 : 40, note: `${mon.weight}kg vs ${c.tw}kg` };
    }
    const spe = effStatOf(mon, "spe");
    if (m.name === "Gyro Ball") return { bp: spe ? Math.min(150, Math.floor((25 * c.ts) / spe) + 1) : 1, note: `Spe ${spe} vs ${c.ts}` };
    if (m.name === "Electro Ball") { const r = c.ts ? spe / c.ts : 0; return { bp: r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40, note: `Spe ${spe} vs ${c.ts}` }; }
    return null;
  }
  // Expected power INCLUDING a mon's STAB AND its ability (both live HERE, in Exp. Pow — shown to
  //   the user). { power, stab, note }. mon = null → intrinsic only. -ate retypes → STAB follows the
  //   new type; ability damage multipliers (Huge Power, Sand Force …) are baked into `power`.
  function powerFor(m, mon) {
    if (!m._ep) return null;
    let dyn = null;
    if (m._ep.dynamic) { if (!mon) return null; dyn = dynamicBP(m, mon); if (!dyn) return null; }
    const bp = dyn ? dyn.bp : m.power;
    const o = mon ? offenseMult(mon.ability, mon, m, bp, state.expBest) : { mult: 1, stab: null, acc: 1, retype: null, note: "" };
    const ip = intrinsicPower(m, o.acc, bp);
    if (ip == null) return null;
    const stab = o.stab || (mon && mon.types.includes(o.retype || m.type) ? 1.5 : 1);
    let itemM = 1, itemNote = "";
    if (mon && mon.cfg.item !== "none") {   // the mon's item is part of its effective power too
      const r = OFF_ITEMS[mon.cfg.item].mult(state.expBest, m.class);   // Expert Belt: SE assumed only in best-case
      if (r && r.m) { itemM = r.m; itemNote = r.note; }
    }
    return { power: ip * stab * o.mult * itemM, stab, note: [dyn && dyn.note, o.note, itemNote].filter(Boolean).join(" · ") };
  }
  // The stat a move actually attacks with (Body Press = the user's Defense);
  // Foul Play uses the TARGET's Atk — no target exists here, so it gets no Eff. Dmg.
  const ATK_STAT_OVERRIDE = { "Body Press": "def" };
  const TARGET_STAT_MOVES = new Set(["Foul Play"]);
  // Effective damage for ONE mon = 0.44 (Gen-9 Lv50 coeff) × its Exp.Pow (STAB + ability + item in)
  // × its EFFECTIVE attacking stat (distributed points / +10% nature / boost stages from the ⚙ setup).
  function monDmg(mon, m) {
    if (!m._ep || !(mon.moves.has(m.id) || m._custom) || TARGET_STAT_MOVES.has(m.name)) return null;
    const pf = powerFor(m, mon);
    if (!pf) return null;
    const key = ATK_STAT_OVERRIDE[m.name] || (m.class === "physical" ? "atk" : "spa");
    const stat = effStatOf(mon, key);
    const c = mon.cfg;
    const v = Math.round(0.44 * pf.power * stat);
    const notes = [];
    if (key === "def") notes.push("uses Def");
    if (c.stages[key]) notes.push(`${c.stages[key] > 0 ? "+" : ""}${c.stages[key]} boost`);
    if (pf.stab > 1) notes.push(pf.stab >= 2 ? "STAB ×2" : "STAB");
    if (pf.note) notes.push(pf.note);
    return { v, note: notes.join(" · ") };
  }
  // The mon whose Exp.Pow STAB + Eff. Dmg column reflect: the focused one, else the first loaded.
  const expMon = () => (state.focus && state.mons.find((x) => x.slug === state.focus)) || state.mons[0] || null;
  const sep = (v) => v.toLocaleString("en-US");
  const compact = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
  // Exp. Pow cell: number (incl. the anchor mon's STAB) + a tiny note (STAB / spread / hits / crit / cond).
  function exppCell(m) {
    if (m._expp == null) return `<span class="muted">—</span>`;
    const ep = m._ep, notes = [];
    if (m._exppStab > 1) notes.push(m._exppStab >= 2 ? "STAB ×2" : "STAB");
    if (m._exppNote) notes.push(m._exppNote);   // ability (Huge Power / Sand Force / → retype …)
    if (isSpread(m.target)) notes.push("×0.75");
    if (ep.hitNote) notes.push(ep.hitNote);
    if (ep.critNote) notes.push(ep.critNote);
    if (state.expBest && ep.cond) notes.push(ep.cond.note);
    return `<b class="mv-expv">${m._expp}</b>${notes.length ? `<small class="mv-exp-note">${notes.slice(0, 2).join(" · ")}</small>` : ""}`;
  }
  // Eff. Dmg cell (the focused/first mon): full number + STAB/ability/boost note.
  function expdCell(m) {
    if (m._expd == null) return `<span class="muted" ${TARGET_STAT_MOVES.has(m.name) ? `title="${m.name} attacks with the TARGET's stat — no target here"` : ""}>—</span>`;
    return `<b class="mv-expv">${sep(m._expd)}</b>${m._expdNote ? `<small class="mv-exp-note">${m._expdNote}</small>` : ""}`;
  }
  // ownMode: "any" | "all" | "diff" (some but not all) | "1".."9" (owned by exactly k of the loaded mons).
  // focus: slug of ONE loaded mon — only its moves show, so the count modes read as
  // "his unique moves" (1), "he + exactly 1 more" (2), … the compare-detail workflow.

  toolbarEl.innerHTML = `
    <input class="search mv-search" type="search" placeholder="Search move or effect…" autocomplete="off">
    <input class="search mv-mon" list="mv-mon-list" placeholder="Add Pokémon owners…" autocomplete="off">
    <datalist id="mv-mon-list">${data.pokemon.map((m) => `<option value="${m._display || displayName(m)}">`).join("")}</datalist>
    <div class="seg mv-cat">
      <button data-cat="" class="active">All</button>
      <button data-cat="physical">Phys</button>
      <button data-cat="special">Spec</button>
      <button data-cat="status">Status</button>
    </div>
    <div class="seg mv-own" hidden>
      <button data-own="any" class="active">Owned by any</button>
      <button data-own="all">Owned by all</button>
    </div>
    <div class="mv-expctl" title="Exp. Pow = Power × Accuracy × crit × multi-hit × spread(×0.75). Eff. Dmg = 0.44 × Exp. Pow × the mon's effective Atk/Sp.Atk (⚙ setup) with its STAB + ability — compare against effective HP (HP×Def).">
      <label class="mv-exp-bestwrap"><input type="checkbox" class="mv-exp-best"> best case <small>(conditions + abilities)</small></label>
      <button class="btn-sm mv-cmv-btn" title="Invent a move to theorize — pinned on top of the table and computed for every loaded Pokémon as if all could learn it">＋ custom move</button>
    </div>
    <button class="btn mv-filter-btn" title="More filters — mechanical flags (Sound, Contact, …); on phones also the type & finder rows">☰ Filters</button>
    <span class="mv-hint">Click a column to sort · Shift-click adds a tiebreaker · <button class="mv-reset">reset</button></span>
    <span class="count mv-count"></span>
    <div class="mv-mon-chips"></div>
    <div class="mv-cfg-wrap"></div>
    <div class="mv-cmv" hidden>
      <span class="mv-lab">Custom move</span>
      <select class="cl-sel mv-cmv-type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
      <select class="cl-sel mv-cmv-class"><option value="physical">Physical</option><option value="special">Special</option></select>
      <input class="mv-cmv-pow" type="number" min="1" max="250" value="80" aria-label="base power" title="Base power (1–250)">
      <input class="mv-cmv-name" type="text" maxlength="24" placeholder="name (optional)" aria-label="move name">
      <button class="btn-sm" data-cmv-add>＋ Add</button>
      <small class="muted">plain single hit · 100% acc · STAB if the type matches · treated as learnable by all loaded mons</small>
    </div>
    <div class="type-chips mv-types">${TYPES.map((t) =>
      `<button class="type-chip" data-mvtype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
    <div class="mv-finder">
      <div class="mv-finder-item"><span class="mv-lab">Affects</span>
        <div class="seg mv-tgroup"><button data-tgroup="" class="active">Any</button>${Object.entries(TARGET_GROUPS).map(([k, g]) =>
          `<button data-tgroup="${k}">${g.label}</button>`).join("")}</div></div>
      <div class="mv-finder-item"><span class="mv-lab">Does</span>
        <div class="mv-facets">${Object.entries(FACETS).map(([k, l]) =>
          `<button class="chip facet-chip" data-facet="${k}">${l}</button>`).join("")}</div></div>
      <div class="mv-finder-item"><span class="mv-lab">Chance</span>
        <div class="seg mv-chanceseg"><button data-chance="" class="active">Any</button><button data-chance="100">100%</button><button data-chance="50">≥50%</button></div></div>
    </div>
    <div class="flag-chips">${allFlags.map((f) =>
      `<button class="chip flag-chip" data-flag="${f}">${f}</button>`).join("")}</div>`;

  const $ = (s) => toolbarEl.querySelector(s);

  function updateMonUI() {
    const n = state.mons.length;
    // focus only makes sense with ≥2 loaded mons, while its mon is still loaded
    if (state.focus && (n < 2 || !state.mons.some((m) => m.slug === state.focus))) state.focus = null;
    if (state.cfgOpen && !state.mons.some((m) => m.slug === state.cfgOpen)) state.cfgOpen = null;
    $(".mv-mon-chips").innerHTML = state.mons.map((m) => {
      // ⚙ opens the customize popover; a tiny badge summarizes any non-default setup
      const c = m.cfg, parts = [];
      if (m.ability !== m.defAbility) parts.push(m.ability ? (m.dmgAbils.find((a) => a.slug === m.ability) || {}).name : "no abil.");
      const pts = pointsUsed(c.spread);
      if (pts) parts.push(`${pts} pts`);
      if (c.nature) parts.push("+nat");
      ["atk", "spa", "def", "spe"].forEach((k) => { if (c.stages[k]) parts.push(`${c.stages[k] > 0 ? "+" : ""}${c.stages[k]} ${{ atk: "Atk", spa: "SpA", def: "Def", spe: "Spe" }[k]}`); });
      if (c.item !== "none") parts.push((OFF_ITEMS[c.item] || {}).label);
      if (c.tw !== 70) parts.push(`tgt ${c.tw}kg`);
      if (c.ts !== 100) parts.push(`tgt ${c.ts} Spe`);
      const badge = parts.length ? `<small class="mon-cfg-badge">${parts.join(" · ")}</small>` : "";
      return `<span class="mon-chip ${state.focus === m.slug ? "focus" : ""}" data-focus-mon="${m.slug}" ${n >= 2 ? `title="${state.focus === m.slug ? "Unfocus" : `Focus — group the table around ${m.name}'s moves`}"` : ""}><img src="${m.sprite}" alt="">${m.name}${badge}<button class="mon-cfg ${state.cfgOpen === m.slug ? "on" : ""}" data-mon-cfg="${m.slug}" title="Customize ${m.name} — stats, boosts, item, ability">⚙</button><button data-rm-mon="${m.slug}" aria-label="Remove ${m.name}">✕</button></span>`;
    }).join("");
    renderCfgPop();
    // "any/all" toggle is irrelevant below 2 mons and superseded by the grouped view while focused
    $(".mv-own").hidden = n < 2 || !!state.focus;
    toolbarEl.querySelectorAll(".mv-own button").forEach((x) => x.classList.toggle("active", x.dataset.own === state.ownMode));
  }
  function toggleFocus(slug) {
    if (state.mons.length < 2) return;
    state.focus = state.focus === slug ? null : slug;
    updateMonUI(); draw();
  }
  // ⚙ customize popover: pops up under the chips only when needed, one mon at a time.
  // Same freedom as the Damage tab's set editors: full 66-point distribution, ±6 boost
  // stages (incl. Speed), item, ability, and the assumed target for weight/speed moves.
  function renderCfgPop() {
    const el = $(".mv-cfg-wrap");
    const m = state.cfgOpen && state.mons.find((x) => x.slug === state.cfgOpen);
    if (!m) { el.innerHTML = ""; return; }
    const c = m.cfg;
    const used = pointsUsed(c.spread);
    const pt = (k, lab, extra = "") => `<div class="cl-stat"${extra ? ` title="${extra}"` : ""}><span class="cl-stat-lab">${lab}</span><div class="cl-step"><button data-cfg-spread="${k}" data-dir="-1">−</button><b>${c.spread[k] || 0}</b><button data-cfg-spread="${k}" data-dir="1">+</button></div></div>`;
    const step = (k, lab, extra = "") => `<div class="cl-stat"${extra ? ` title="${extra}"` : ""}><span class="cl-stat-lab">${lab}</span><div class="cl-step"><button data-cfg-stage="${k}" data-dir="-1">−</button><b>${c.stages[k] >= 0 ? "+" : ""}${c.stages[k]}</b><button data-cfg-stage="${k}" data-dir="1">+</button></div></div>`;
    el.innerHTML = `<div class="mv-cfg-pop">
      <div class="mv-cfg-head"><img src="${m.sprite}" alt=""><b>${m.name}</b><small class="muted">@50 — Atk ${m.lvAtk} · Sp.A ${m.lvSpa} · Def ${m.lvDef} · Spe ${m.lvSpe}${m.weight ? ` · ${m.weight} kg` : ""}</small><button class="tc-detail-x" data-cfg-close aria-label="Close">✕</button></div>
      <div class="mv-cfg-grid">
        ${m.dmgAbils.length ? `<div class="cl-stat"><span class="cl-stat-lab">Ability</span><select class="cl-sel" data-cfg-abil><option value="">no ability</option>${m.dmgAbils.map((a) => `<option value="${a.slug}" ${m.ability === a.slug ? "selected" : ""}>${a.name}</option>`).join("")}</select></div>` : ""}
        <label class="cl-toggle" title="+10% on the attacking stat"><input type="checkbox" data-cfg-nature ${c.nature ? "checked" : ""}> +10% nature</label>
        <div class="cl-stat"><span class="cl-stat-lab">Item</span><select class="cl-sel" data-cfg-item>${Object.entries(OFF_ITEMS).map(([k, v]) => `<option value="${k}" ${c.item === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
        <button class="btn-sm" data-cfg-reset title="Back to defaults">↺ reset</button>
      </div>
      <div class="mv-cfg-sec">
        <div class="mv-cfg-sec-head"><span>Stat points</span><span class="cl-points ${used > POOL ? "over" : ""}" title="Champions: ${POOL} points to distribute, at most ${CAP} into one stat">Points ${used}/${POOL}</span></div>
        <div class="mv-cfg-grid">${pt("atk", "Atk")}${pt("spa", "Sp.Atk")}${pt("def", "Def", "Body Press attacks with Defense")}${pt("spe", "Speed", "Gyro Ball / Electro Ball power scales with Speed")}</div>
      </div>
      <div class="mv-cfg-sec">
        <div class="mv-cfg-sec-head"><span>Boost stages</span></div>
        <div class="mv-cfg-grid">${step("atk", "Atk")}${step("spa", "Sp.Atk")}${step("def", "Def", "Body Press attacks with Defense — this boosts it")}${step("spe", "Speed", "changes Gyro Ball / Electro Ball power")}</div>
      </div>
      <div class="mv-cfg-sec">
        <div class="mv-cfg-sec-head"><span>Assumed target</span><small class="muted">Grass Knot · Low Kick · Heavy Slam · Heat Crash · Gyro Ball · Electro Ball</small></div>
        <div class="mv-cfg-grid">
          <div class="cl-stat" title="The defender's weight — Grass Knot/Low Kick scale with it; Heavy Slam/Heat Crash compare ${m.name}'s ${m.weight} kg against it"><span class="cl-stat-lab">Weight</span><span class="mv-cfg-num"><input type="number" data-cfg-tw value="${c.tw}" min="0.1" max="999.9" step="0.1" inputmode="decimal"> kg</span></div>
          <div class="cl-stat" title="The defender's Speed — Gyro Ball grows the slower ${m.name} is vs it, Electro Ball the faster"><span class="cl-stat-lab">Speed</span><span class="mv-cfg-num"><input type="number" data-cfg-ts value="${c.ts}" min="1" max="400" step="1" inputmode="numeric"></span></div>
        </div>
      </div>
    </div>`;
  }
  // The per-mon context the Expected columns need: Lv50 attacking stats, typing (STAB),
  // raw stats (Protosynthesis picks the highest), damage-relevant abilities + the default,
  // weight + Lv50 Spe for the weight/speed-scaled moves.
  const defaultCfg = () => ({ spread: { atk: 0, spa: 0, def: 0, spe: 0 }, nature: false,
    stages: { atk: 0, spa: 0, def: 0, spe: 0 }, item: "none", tw: 70, ts: 100 });
  function monEntry(mon) {
    const lv = statsFor(mon, "lv50");
    const da = damageAbilities(mon).map((s) => ({ slug: s, name: (data.abilities[s] || {}).name || s }));
    const def = offDefaultAbility(mon);
    const ability = da.some((a) => a.slug === def) ? def : null;
    return { slug: mon.slug, name: mon._display || displayName(mon),
      sprite: mon.sprite || mon.artwork || "", moves: new Set(mon.moves),
      lvAtk: lv.atk, lvSpa: lv.spa, lvDef: lv.def, lvSpe: lv.spe, weight: mon.weight || 0,
      types: mon.types, stats: mon.stats,
      dmgAbils: da, ability, defAbility: ability,
      cfg: defaultCfg() };
  }
  function addMon(mon) {
    if (!mon || state.mons.some((x) => x.slug === mon.slug)) return;
    state.mons.push(monEntry(mon));
    updateMonUI(); draw();
  }
  // An invented move: negative id (never collides with real move ids), plain single hit,
  // 100% acc. Name is HTML-escaped ONCE here — every render spot interpolates it raw.
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  function customEntry(type, cls, power, name) {
    const m = { id: -(state.cmvSeq++), name: esc(name) || `Custom ${power}`, type, class: cls, power,
      accuracy: 100, pp: null, priority: 0, target: "selected-pokemon", flags: [],
      secondaries: [], count: 0, effect: "Invented move — theorycraft only, not in any movepool.", _custom: true };
    m._fx = classifyMove(m);
    m._ep = expData(m);
    return m;
  }
  function resetFilters() {
    state.search = ""; state.type = ""; state.cat = ""; state.flags.clear();
    state.tgroup = ""; state.facets.clear(); state.chance = "";
    $(".mv-search").value = "";
    toolbarEl.querySelectorAll("[data-mvtype]").forEach((x) => x.classList.remove("on"));
    toolbarEl.querySelectorAll(".mv-cat button").forEach((x) => x.classList.toggle("active", x.dataset.cat === ""));
    toolbarEl.querySelectorAll(".flag-chip, .facet-chip").forEach((x) => x.classList.remove("on"));
    toolbarEl.querySelectorAll("[data-tgroup]").forEach((x) => x.classList.toggle("active", x.dataset.tgroup === ""));
    toolbarEl.querySelectorAll("[data-chance]").forEach((x) => x.classList.toggle("active", x.dataset.chance === ""));
  }

  $(".mv-search").addEventListener("input", (e) => { state.search = e.target.value; draw(); });
  $(".mv-exp-best").addEventListener("change", (e) => { state.expBest = e.target.checked; draw(); });
  // ＋ custom move: toggle the builder row, add an invented move (pinned row in the table)
  $(".mv-cmv-btn").addEventListener("click", () => {
    const box = $(".mv-cmv");
    box.hidden = !box.hidden;
    $(".mv-cmv-btn").classList.toggle("active", !box.hidden);
    if (!box.hidden) $(".mv-cmv-name").focus();
  });
  $("[data-cmv-add]").addEventListener("click", () => {
    const power = Math.max(1, Math.min(250, Math.round(Number($(".mv-cmv-pow").value)) || 80));
    state.customMoves.push(customEntry($(".mv-cmv-type").value, $(".mv-cmv-class").value, power, $(".mv-cmv-name").value.trim()));
    $(".mv-cmv-name").value = "";
    draw();
  });
  $(".mv-cmv-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("[data-cmv-add]").click(); });
  // ⚙ customize popover controls
  const cfgMon = () => state.mons.find((x) => x.slug === state.cfgOpen);
  const cfgApply = () => { updateMonUI(); draw(); };   // updateMonUI re-renders chips (badge) + popover
  // assumed-target inputs: clamp + write into cfg. Returns true when the value changed.
  const readAssume = (m, el) => {
    const v = parseFloat(el.value);
    if (el.matches("[data-cfg-tw]")) {
      const tw = Number.isFinite(v) ? Math.min(999.9, Math.max(0.1, Math.round(v * 10) / 10)) : 70;
      if (tw === m.cfg.tw) return false; m.cfg.tw = tw; return true;
    }
    const ts = Number.isFinite(v) ? Math.min(400, Math.max(1, Math.round(v))) : 100;
    if (ts === m.cfg.ts) return false; m.cfg.ts = ts; return true;
  };
  $(".mv-cfg-wrap").addEventListener("change", (e) => {
    const m = cfgMon(); if (!m) return;
    if (e.target.matches("[data-cfg-abil]")) { m.ability = e.target.value || null; cfgApply(); }
    else if (e.target.matches("[data-cfg-item]")) { m.cfg.item = e.target.value; cfgApply(); }
    else if (e.target.matches("[data-cfg-nature]")) { m.cfg.nature = e.target.checked; cfgApply(); }
    // commit (blur/Enter): sync badge + snap the field to the clamped value. Deferred a tick:
    // replacing the still-focused input inside its own change event re-fires change from the
    // blur and crashes the innerHTML teardown mid-flight.
    else if (e.target.matches("[data-cfg-tw],[data-cfg-ts]")) { readAssume(m, e.target); setTimeout(cfgApply, 0); }
  });
  // while typing in the number fields, refresh the table live but do NOT re-render the
  // popover (that would steal focus mid-keystroke)
  $(".mv-cfg-wrap").addEventListener("input", (e) => {
    const m = cfgMon(); if (!m) return;
    if (e.target.matches("[data-cfg-tw],[data-cfg-ts]") && readAssume(m, e.target)) draw();
  });
  $(".mv-cfg-wrap").addEventListener("click", (e) => {
    const m = cfgMon(); if (!m) return;
    if (e.target.closest("[data-cfg-close]")) { state.cfgOpen = null; updateMonUI(); return; }
    const sp = e.target.closest("[data-cfg-spread]");
    if (sp) {   // ±2 points per click, ≤32 into one stat, 66-point pool shared with the other stats
      const k = sp.dataset.cfgSpread, cur = m.cfg.spread[k] || 0;
      const others = pointsUsed(m.cfg.spread) - cur;
      m.cfg.spread[k] = Math.max(0, Math.min(cur + 2 * Number(sp.dataset.dir), CAP, POOL - others));
      cfgApply(); return;
    }
    const st = e.target.closest("[data-cfg-stage]");
    if (st) { const k = st.dataset.cfgStage; m.cfg.stages[k] = Math.max(-6, Math.min(6, (m.cfg.stages[k] || 0) + Number(st.dataset.dir))); cfgApply(); return; }
    if (e.target.closest("[data-cfg-reset]")) {
      m.cfg = defaultCfg();
      m.ability = m.defAbility;
      cfgApply();
    }
  });
  $(".mv-mon").addEventListener("change", (e) => {
    const mon = monByName.get(e.target.value.trim().toLowerCase());
    if (mon) addMon(mon);
    e.target.value = "";
  });
  $(".mv-mon-chips").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm-mon]");
    if (rm) {
      state.mons = state.mons.filter((m) => m.slug !== rm.dataset.rmMon);
      updateMonUI(); draw();
      return;
    }
    const cfg = e.target.closest("[data-mon-cfg]");    // ⚙ toggles the customize popover, not focus
    if (cfg) { state.cfgOpen = state.cfgOpen === cfg.dataset.monCfg ? null : cfg.dataset.monCfg; updateMonUI(); return; }
    const fc = e.target.closest("[data-focus-mon]");   // chip body = focus toggle
    if (fc) toggleFocus(fc.dataset.focusMon);
  });
  $(".mv-own").addEventListener("click", (e) => {
    const b = e.target.closest("[data-own]");
    if (!b) return;
    state.ownMode = b.dataset.own;
    updateMonUI(); draw();
  });
  toolbarEl.querySelectorAll("[data-mvtype]").forEach((b) => b.addEventListener("click", () => {
    state.type = state.type === b.dataset.mvtype ? "" : b.dataset.mvtype;
    toolbarEl.querySelectorAll("[data-mvtype]").forEach((x) => x.classList.toggle("on", x.dataset.mvtype === state.type));
    draw();
  }));
  $(".mv-reset").addEventListener("click", () => { state.sort = structuredClone(DEFAULT_SORT); draw(); });
  // phone: the chip filter groups collapse behind this toggle (CSS shows the button ≤640px only)
  $(".mv-filter-btn").addEventListener("click", () => {
    const open = toolbarEl.classList.toggle("mv-chips-open");
    $(".mv-filter-btn").classList.toggle("active", open);
  });
  toolbarEl.querySelectorAll(".mv-cat button").forEach((b) =>
    b.addEventListener("click", () => {
      state.cat = b.dataset.cat;
      toolbarEl.querySelectorAll(".mv-cat button").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    }));
  toolbarEl.querySelectorAll(".flag-chip").forEach((b) =>
    b.addEventListener("click", () => {
      const f = b.dataset.flag;
      if (state.flags.has(f)) { state.flags.delete(f); b.classList.remove("on"); }
      else { state.flags.add(f); b.classList.add("on"); }
      draw();
    }));
  toolbarEl.querySelectorAll("[data-tgroup]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tgroup = b.dataset.tgroup;
      toolbarEl.querySelectorAll("[data-tgroup]").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    }));
  toolbarEl.querySelectorAll(".facet-chip").forEach((b) =>
    b.addEventListener("click", () => {
      const f = b.dataset.facet;
      if (state.facets.has(f)) { state.facets.delete(f); b.classList.remove("on"); }
      else { state.facets.add(f); b.classList.add("on"); }
      draw();
    }));
  toolbarEl.querySelectorAll("[data-chance]").forEach((b) =>
    b.addEventListener("click", () => {
      state.chance = b.dataset.chance;
      toolbarEl.querySelectorAll("[data-chance]").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    }));

  contentEl.addEventListener("click", (e) => {
    const rmc = e.target.closest("[data-rm-custom]");   // ✕ on an invented move's pinned row
    if (rmc) { state.customMoves = state.customMoves.filter((c) => c.id !== Number(rmc.dataset.rmCustom)); draw(); return; }
    const fo = e.target.closest("th[data-focus]");   // owner sprite header = focus toggle
    if (fo) { toggleFocus(fo.dataset.focus); return; }
    const th = e.target.closest("th.sortable");
    if (th) { onHeaderClick(th.dataset.sort, e.shiftKey); return; }
    const lens = e.target.closest(".lens[data-filter]");
    if (lens) { onFilter && onFilter(Number(lens.dataset.filter)); return; }
    const row = e.target.closest("tr[data-move]");
    if (row && onInfo) onInfo(Number(row.dataset.move));
  });

  function onHeaderClick(k, shift) {
    const i = state.sort.findIndex((s) => s.key === k);
    if (shift) {
      if (i < 0) state.sort.push({ key: k, dir: defDir(k) });
      else state.sort[i].dir = state.sort[i].dir === "asc" ? "desc" : "asc";
    } else if (state.sort.length === 1 && i === 0) {
      state.sort[0].dir = state.sort[0].dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = [{ key: k, dir: defDir(k) }];
    }
    draw();
  }

  // Expected columns — fresh each draw (depend on best-case + loaded mons + focus + ⚙ setups).
  // Exp. Pow includes the anchor mon's STAB (visible); Eff. Dmg reuses it (no double STAB).
  function computeCols(m) {
    const em = expMon();
    const pf = powerFor(m, em);
    m._expp = pf ? Math.round(pf.power) : null;
    m._exppStab = pf ? pf.stab : 1;
    m._exppNote = pf ? pf.note : "";
    m._dmg = {};
    for (const pm of state.mons) { const d = monDmg(pm, m); if (d) m._dmg[pm.slug] = d; }
    const ed = em ? m._dmg[em.slug] : null;
    m._expd = ed ? ed.v : null;
    m._expdNote = ed ? ed.note : "";
  }

  function apply() {
    const q = state.search.trim().toLowerCase();
    const ownSets = state.mons.map((m) => m.moves);
    const list = moves.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q) && !(m.effect || "").toLowerCase().includes(q)) return false;
      if (state.type && m.type !== state.type) return false;
      if (state.cat && m.class !== state.cat) return false;
      if (state.tgroup && !TARGET_GROUPS[state.tgroup].set.has(m.target)) return false;
      for (const f of state.facets) if (!m._fx.facets.has(f)) return false;
      if (state.chance && m._fx.chance < Number(state.chance)) return false;
      for (const f of state.flags) if (!(m.flags || []).includes(f)) return false;
      computeCols(m);
      if (ownSets.length) {
        const owners = ownSets.reduce((a, s) => a + (s.has(m.id) ? 1 : 0), 0);
        m._own = owners;   // for the Shared column + its sort
        if (state.focus) {   // focused: every move the focused mon learns (grouping happens in draw)
          const fm = state.mons.find((x) => x.slug === state.focus);
          if (fm && !fm.moves.has(m.id)) return false;
        } else if (state.ownMode === "all" ? owners < ownSets.length : owners === 0) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      for (const { key, dir } of state.sort) {
        const va = sortVal(a, key), vb = sortVal(b, key);
        const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        if (c) return (dir === "asc" ? 1 : -1) * c;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function draw() {
    const list = apply();
    const n = state.mons.length;
    const fi = state.focus ? state.mons.findIndex((m) => m.slug === state.focus) : -1;
    const focused = fi >= 0 && n >= 2;
    const em = expMon();
    const dmgCtx = em ? ` · Exp.Pow +STAB+ability & Eff.Dmg for ${em.name}${em.ability ? ` (${(em.dmgAbils.find((a) => a.slug === em.ability) || {}).name || em.ability})` : ""}` : "";
    $(".mv-count").textContent = n
      ? (focused
        ? `${list.length} moves · focus: ${state.mons[fi].name} — grouped by who shares them${dmgCtx}`
        : `${list.length} moves · ${state.ownMode === "all" ? `owned by all ${n}` : "owned by any"} — ${state.mons.map((m) => m.name).join(", ")}${dmgCtx}`)
      : `${list.length} moves`;
    const multi = state.sort.length > 1;
    const cols = COLS.filter((c) => c.key !== "expd" || em);   // Eff. Dmg column only with a loaded mon
    const ownerHead = state.mons.map((m) =>
      `<th class="mv-owner ${state.focus === m.slug ? "focus" : ""}" data-focus="${m.slug}" title="${state.focus === m.slug ? "Unfocus" : `Focus — group the table around ${m.name}'s moves`}"><img src="${m.sprite}" alt=""></th>`).join("");
    // sortable owners-count column ("Shared") — only next to the per-mon columns
    let sharedHead = "";
    if (n >= 2) {
      const i = state.sort.findIndex((s) => s.key === "owned");
      const on = i >= 0;
      const arrow = on ? (state.sort[i].dir === "asc" ? " ▲" : " ▼") : "";
      const prio = on && multi ? `<sup class="sort-prio">${i + 1}</sup>` : "";
      sharedHead = `<th class="num sortable ${on ? "active" : ""}" data-sort="owned" title="How many of the loaded Pokémon learn it — sort ascending for unique-first">Shared${arrow}${prio}</th>`;
    }
    const headArr = cols.map((c) => {
      const i = state.sort.findIndex((s) => s.key === c.key);
      const on = i >= 0;
      const arrow = on ? (state.sort[i].dir === "asc" ? " ▲" : " ▼") : "";
      const prio = on && multi ? `<sup class="sort-prio">${i + 1}</sup>` : "";
      const cls = `${c.num ? "num" : ""} ${c.nosort ? "" : "sortable"} ${on ? "active" : ""}`;
      return `<th class="${cls}" ${c.nosort ? "" : `data-sort="${c.key}"`}>${c.label}${arrow}${prio}</th>`;
    });
    const head = [headArr[0], ownerHead, sharedHead, ...headArr.slice(1)].join("");
    const rowHtml = (m) => {
      const custom = !!m._custom;
      const flags = (m.flags || []).map((f) => `<span class="mflag">${f}</span>`).join("");
      const cat = m.class[0].toUpperCase();
      // owner cells: the mon's own Eff. Dmg (compact) when it learns a damaging move —
      // side-by-side comparable across the loaded mons; ✓ sprite for status/variable moves.
      // Invented moves count as learnable by everyone.
      const ownerCells = state.mons.map((pm) => {
        const learns = custom || pm.moves.has(m.id);
        const d = learns ? m._dmg[pm.slug] : null;
        const inner = !learns ? ""
          : d ? `<span class="mv-own-dmg" title="${pm.name}: ${sep(d.v)}${d.note ? " · " + d.note : ""}">${compact(d.v)}</span>`
          : `<img class="cm-yes" loading="lazy" alt="✓" title="${pm.name}" src="${pm.sprite}">`;
        return `<td class="mv-owner ${state.focus === pm.slug ? "focus" : ""}">${inner}</td>`;
      }).join("") + (n >= 2 ? `<td class="num mv-shared">${custom ? `${n}/${n}` : `${m._own}/${n}`}</td>` : "");
      const tgt = m.target ? `<span class="mv-target ${isSpread(m.target) ? "spread" : ""}">${targetLabel(m.target)}</span>` : "—";
      const nameCell = custom
        ? `<td class="mv-nm"><button class="mv-cmv-x" data-rm-custom="${m.id}" title="Remove this invented move" aria-label="Remove ${m.name}">✕</button>${m.name}<span class="mv-cmv-tag" title="Invented here — not a real move">invented</span></td>`
        : `<td class="mv-nm"><button class="lens" data-filter="${m.id}" title="Filter roster by this move">🔍</button>${m.name}</td>`;
      return `<tr ${custom ? 'class="mv-custom-row"' : `data-move="${m.id}" title="View move details"`}>
        ${nameCell}
        ${ownerCells}
        <td class="mv-ty">${m.type ? `<span class="type" style="background:${TYPE_COLORS[m.type]}">${m.type}</span>` : "—"}</td>
        <td class="mv-cat"><span class="mv-class mv-${m.class}" title="${m.class}">${cat}</span></td>
        <td class="mv-tg">${tgt}</td>
        <td class="num mv-pow">${m.power == null ? (m.class === "status" ? "—" : '<span class="mv-varies" title="Power varies — see effect">varies</span>') : m.power}</td>
        <td class="num mv-acc">${m.accuracy ?? "—"}</td>
        <td class="num mv-expp">${exppCell(m)}</td>
        ${expMon() ? `<td class="num mv-expd">${expdCell(m)}</td>` : ""}
        <td class="num mv-pp">${m.pp ?? "—"}</td>
        <td class="num mv-prio">${m.priority ? (m.priority > 0 ? "+" + m.priority : m.priority) : "0"}</td>
        <td class="mv-sec">${[
          ...(m.secondaries || []).map(([c, l]) => `<span class="mv-chance ${c >= 100 ? "sure" : c >= 50 ? "often" : "rare"}" title="secondary-effect chance">${c}%${l ? " " + l : ""}</span>`),
          ...m._fx.chips.map((ch) => `<span class="mv-chance ${ch.cls}" title="guaranteed primary effect">${ch.txt}</span>`),
          ...(m._ep && m._ep.cond ? [`<span class="mv-chance cond" title="conditional damage — folds into Expected with 'best-case effects' on">${m._ep.cond.note}</span>`] : []),
          ...(m._ep && m._ep.critNote ? [`<span class="mv-chance often" title="raises Expected damage">${m._ep.critNote}</span>`] : []),
        ].join(" ") || "<span class='muted'>—</span>"}</td>
        <td class="mv-flags">${flags || "<span class='muted'>—</span>"}</td>
        <td class="num mv-cnt">${custom ? "<span class='muted'>—</span>" : `<span class="rarity ${rarityTier(m.count, data.total).cls}">${m.count}</span>`}</td>
        <td class="mv-eff">${m.effect || ""}</td>
      </tr>`;
    };
    // invented moves ride on top of the table — visible through every filter/sort/focus state
    state.customMoves.forEach(computeCols);
    const pinned = state.customMoves.map(rowHtml).join("");
    let rows;
    if (focused) {
      // Grouped view: contiguous sections per exact owner-combo, ascending overlap —
      // his unique moves first, then "him + one partner" (one block per partner, in the
      // order the mons were added), then 3-owner combos, "All n" last. The user's column
      // sort still applies WITHIN each group (list is already sorted).
      const combos = new Map();
      for (const m of list) {
        const idx = state.mons.map((pm, i) => (pm.moves.has(m.id) ? i : -1)).filter((i) => i >= 0);
        const key = idx.join(",");
        if (!combos.has(key)) combos.set(key, { idx, moves: [] });
        combos.get(key).moves.push(m);
      }
      const partners = (g) => g.idx.filter((i) => i !== fi);
      const groups = [...combos.values()].sort((a, b) => {
        if (a.idx.length !== b.idx.length) return a.idx.length - b.idx.length;
        const pa = partners(a), pb = partners(b);
        for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
        return 0;
      });
      const label = (g) => (g.idx.length === 1 ? `Only ${state.mons[fi].name}`
        : g.idx.length === n ? `All ${n}`
        : [state.mons[fi].name, ...partners(g).map((i) => state.mons[i].name)].join(" + "));
      const nCols = cols.length + n + 1;   // name + owner cols + Shared + the rest
      rows = groups.map((g) => `
        <tr class="mv-grouphead"><td colspan="${nCols}">${g.idx.map((i) =>
          `<img src="${state.mons[i].sprite}" alt="" title="${state.mons[i].name}">`).join("")}<b>${label(g)}</b><span class="mv-gcount">${g.moves.length} ${g.moves.length === 1 ? "move" : "moves"}</span></td></tr>
        ${g.moves.map(rowHtml).join("")}`).join("");
    } else {
      rows = list.map(rowHtml).join("");
    }
    contentEl.innerHTML = `<table class="poke-table moves-table"><thead><tr>${head}</tr></thead><tbody>${pinned}${rows}</tbody></table>`;
  }

  // Load a set of mons (e.g. the compared roster) → per-mon ownership columns +
  // restrict to the moves they share; full detail lives here, not the popup.
  function browseMons(list) {
    resetFilters();
    state.ownMode = "any";
    state.focus = null;
    state.mons = (list || []).filter(Boolean).map(monEntry);
    updateMonUI();
    draw();
    window.scrollTo({ top: 0 });
  }

  draw();
  return { browseMons };
}
