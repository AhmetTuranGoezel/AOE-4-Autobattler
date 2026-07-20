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
import { attachAutocomplete } from "./autocomplete.js";

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
// Exported for info.js (the move popup's "Best users" button needs the same "rankable" test).
export const DYNAMIC_BP = new Set(["Grass Knot", "Low Kick", "Heavy Slam", "Heat Crash", "Gyro Ball", "Electro Ball"]);
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

export function initMovesView({ toolbarEl, contentEl, data, onInfo, onFilter, onMon, onAbil }) {
  const moves = Object.entries(data.moves).map(([id, m]) => ({ id: Number(id), ...m, _fx: classifyMove(m), _ep: expData(m) }));
  const allFlags = [...new Set(moves.flatMap((m) => m.flags || []))].sort();
  const monByName = new Map(data.pokemon.map((m) => [(m._display || displayName(m)).toLowerCase(), m]));
  const RANK_EXCL_KEY = "pc-mvrank-exclude";   // its OWN saved list — deliberately not the Damage tab's
  const RANK_ABIL_KEY = "pc-mvrank-abil-ignore";
  const loadRankExcluded = () => new Set(JSON.parse(localStorage.getItem(RANK_EXCL_KEY) || "[]"));
  const loadRankAbils = () => new Set(JSON.parse(localStorage.getItem(RANK_ABIL_KEY) || "[]"));
  const state = { search: "", type: "", cat: "", flags: new Set(), tgroup: "", facets: new Set(), chance: "",
    mons: [], ownMode: "any", focus: null, sort: structuredClone(DEFAULT_SORT),
    expBest: false,     // best case: conditional move effects AND conditional abilities assumed active
    useAcc: true,       // × accuracy in Exp. Pow — off = potential damage (low-acc moves at full power)
    cfgOpen: null,      // slug whose ⚙ customize popover (stats/boosts/item/ability) is open
    customMoves: [],    // invented what-if moves — pinned on top of the table, session-only
    cmvSeq: 1,
    mode: "browse",     // "browse" (the table) | "rank" (Best users — whole-roster Eff.Dmg ranking)
    rq: { moveId: null, type: "", cat: "", mega: "all", avail: false, tw: 70, ts: 100,
      excluded: loadRankExcluded(),      // move ids kept out of the archetype best-move pick
      ignoredAbils: loadRankAbils(),     // ability slugs treated as None for every ranked mon
      editing: null,                     // slug whose inline per-mon ⚙ panel is open
      presetOpen: false,                 // whether the global-build editor is expanded
      // global build (same shape as a per-mon cfg, minus ability) applied to every un-customized mon
      preset: { spread: { atk: 0, spa: 0, def: 0, spe: 0 }, stages: { atk: 0, spa: 0, def: 0, spe: 0 }, nature: "", item: "none" } } };
  const saveRankExcluded = () => localStorage.setItem(RANK_EXCL_KEY, JSON.stringify([...state.rq.excluded]));
  const saveRankAbils = () => localStorage.setItem(RANK_ABIL_KEY, JSON.stringify([...state.rq.ignoredAbils]));

  // Move-intrinsic power: BP × accuracy(×accMult) × crit × multi-hit × spread(0.75) × best-case cond.
  // `bpOverride` feeds weight/speed moves their computed BP.
  function intrinsicPower(m, accMult = 1, bpOverride) {
    const ep = m._ep;
    const bp = bpOverride != null ? bpOverride : m.power;
    if (!ep || bp == null) return null;
    // "× accuracy" toggle off → potential damage: every move counted as if it always hits
    const acc = state.useAcc ? (m.accuracy == null ? 1 : m.accuracy / 100) * accMult : 1;
    let v = bp * acc * ep.crit * ep.hits;
    if (isSpread(m.target)) v *= 0.75;                       // Champions is doubles (Reg M-B)
    if (state.expBest && ep.cond) v *= ep.cond.mult;         // conditional signature effects
    return v;
  }
  // A mon's effective stat: Lv50 base + distributed points, ×1.1 nature ON THE CHOSEN STAT, ×boost stage.
  // `cfg.nature` is a stat key ("atk"|"spa"|"def"|"spe"|"") — a real nature boosts one specific stat,
  // so a Def nature only helps the Def a Body Press attacks with, a Spe nature only Gyro Ball, etc.
  function effStatOf(mon, key) {
    const base = { atk: mon.lvAtk, spa: mon.lvSpa, def: mon.lvDef, spe: mon.lvSpe }[key];
    const c = mon.cfg;
    const nat = c.nature === key ? 1.1 : 1;
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
    return { v, pw: Math.round(pf.power), note: notes.join(" · ") };
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
    <div class="seg mv-mode" title="Browse = the move table · Best users = rank every Pokémon's effective damage for one move or an archetype">
      <button data-mvmode="browse" class="active">Browse moves</button>
      <button data-mvmode="rank">🏆 Best users</button>
    </div>
    <div class="mv-expctl" title="Exp. Pow = Power × Accuracy × crit × multi-hit × spread(×0.75). Eff. Dmg = 0.44 × Exp. Pow × the mon's effective Atk/Sp.Atk (⚙ setup) with its STAB + ability — compare against effective HP (HP×Def).">
      <label class="mv-exp-bestwrap" title="Assume conditional move effects and pinch abilities (Torrent …) are active"><input type="checkbox" class="mv-exp-best"> assume conditions active</label>
      <label class="mv-exp-bestwrap" title="Off = potential damage: low-accuracy moves count as if they always hit"><input type="checkbox" class="mv-exp-acc" checked> weight by accuracy</label>
    </div>
    <span class="count mv-count"></span>
    <div class="mv-browse-ctls">
      <input class="search mv-search" type="search" placeholder="Search move or effect…" autocomplete="off">
      <div class="seg mv-cat">
        <button data-cat="" class="active">All</button>
        <button data-cat="physical">Phys</button>
        <button data-cat="special">Spec</button>
        <button data-cat="status">Status</button>
      </div>
      <button class="btn-sm mv-cmv-btn" title="Invent a move to theorize — pinned on top of the table and computed for every loaded Pokémon as if all could learn it">＋ custom move</button>
      <button class="btn mv-filter-btn" title="Mechanical flags (Sound, Contact, …); on phones also the type & finder rows">☰ Flags</button>
      <!-- Owners cluster: add a Pokémon → its chips → owned-by-any/all, kept together -->
      <div class="mv-owners">
        <input class="search mv-mon" list="mv-mon-list" placeholder="Add Pokémon owners…" autocomplete="off">
        <datalist id="mv-mon-list">${data.pokemon.map((m) => `<option value="${m._display || displayName(m)}">`).join("")}</datalist>
        <div class="mv-mon-chips"></div>
        <div class="seg mv-own" hidden>
          <button data-own="any" class="active">Owned by any</button>
          <button data-own="all">Owned by all</button>
        </div>
      </div>
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
      <span class="mv-hint">Click a column to sort · Shift-click adds a tiebreaker · <button class="mv-reset">reset</button></span>
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
        `<button class="chip flag-chip" data-flag="${f}">${f}</button>`).join("")}</div>
    </div>
    <div class="mv-rank-ctls" hidden>
      <div class="ac-wrap mvr-acwrap"><input class="search mvr-move-input" placeholder="Rank a specific move…" autocomplete="off"></div>
      <div class="mvr-chipwrap"></div>
      <div class="mvr-arch">
        <span class="mv-lab">or best move of</span>
        <div class="seg mvr-cat">
          <button data-mvrcat="" class="active">Phys + Spec</button>
          <button data-mvrcat="physical">Phys</button>
          <button data-mvrcat="special">Spec</button>
        </div>
        <div class="type-chips mvr-types">${TYPES.map((t) =>
          `<button class="type-chip" data-mvrtype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
        <div class="mvr-exclrow">
          <div class="ac-wrap mvr-acwrap"><input class="search mvr-excl-input" placeholder="Exclude a move (saved)…" autocomplete="off" title="Take drawback moves (charge, recharge …) out of the best-move pick — saved list, separate from the Damage tab's"></div>
          <div class="mvr-exchips"></div>
        </div>
      </div>
      <div class="mvr-preset"></div>
      <div class="mvr-opts">
        <div class="seg mvr-mega">
          <button data-mvrmega="all" class="active">All</button>
          <button data-mvrmega="hide">No mega</button>
          <button data-mvrmega="only">Only mega</button>
        </div>
        <label class="cl-toggle" title="Only Pokémon currently obtainable in Champions"><input type="checkbox" class="mvr-avail"> Available</label>
        <span class="mvr-assume" title="For weight/speed-scaled moves (Grass Knot, Heavy Slam, Gyro Ball …)">
          <span class="mv-lab">Assumed target</span>
          <span class="mv-cfg-num"><input type="number" class="mvr-tw" value="70" min="0.1" max="999.9" step="0.1" inputmode="decimal"> kg</span>
          <span class="mv-cfg-num"><input type="number" class="mvr-ts" value="100" min="1" max="400" step="1" inputmode="numeric"> Spe</span>
        </span>
      </div>
      <div class="mvr-abilrow">
        <div class="ac-wrap mvr-acwrap"><input class="search mvr-abil-input" placeholder="Ignore an ability (saved)…" autocomplete="off" title="Treat an ability as inactive for EVERY ranked Pokémon — e.g. Torrent/Overgrow rarely trigger. Saved list."></div>
        <div class="mvr-abchips"></div>
      </div>
    </div>`;

  const $ = (s) => toolbarEl.querySelector(s);

  function updateMonUI() {
    const n = state.mons.length;
    // focus only makes sense with ≥2 loaded mons, while its mon is still loaded
    if (state.focus && (n < 2 || !state.mons.some((m) => m.slug === state.focus))) state.focus = null;
    if (state.cfgOpen && !state.mons.some((m) => m.slug === state.cfgOpen)) state.cfgOpen = null;
    $(".mv-mon-chips").innerHTML = state.mons.map((m) => {
      // ⚙ opens the customize popover; a tiny badge summarizes any non-default setup
      const c = m.cfg, parts = cfgBadgeParts(m);
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
  // ---- Shared per-mon customize editor (used by the browse ⚙ popover AND the rank inline editor) ----
  // Everything is chips / steppers / a checkbox — no free-text (except the browse-only assumed-target
  // inputs) — so re-rendering after a change never steals focus.
  const abilChipsHtml = (e) => `<div class="cl-abil"><span class="cl-stat-lab">Ability</span>
    <button class="tm-abil-chip ${!e.ability ? "on" : ""}" data-cfg-abil="" title="Attack with no ability">None</button>
    ${e.dmgAbils.map((a) => `<button class="tm-abil-chip ${e.ability === a.slug ? "on" : ""}" data-cfg-abil="${a.slug}">${a.name}</button>`).join("")}</div>`;
  const itemChipsHtml = (e) => `<div class="cl-abil"><span class="cl-stat-lab">Item</span>
    ${Object.entries(OFF_ITEMS).map(([k, v]) => `<button class="tm-abil-chip ${e.cfg.item === k ? "on" : ""}" data-cfg-item="${k}">${v.label}</button>`).join("")}</div>`;
  // Nature = which stat gets ×1.1 (a real nature boosts ONE stat). "" = neutral.
  const NATURES = [["", "Neutral"], ["atk", "Atk"], ["spa", "Sp.Atk"], ["def", "Def"], ["spe", "Speed"]];
  const natureChipsHtml = (e) => `<div class="cl-abil" title="A boosting nature: +10% to the one stat you pick — e.g. a Def nature helps Body Press attackers"><span class="cl-stat-lab">Nature +10%</span>
    ${NATURES.map(([k, l]) => `<button class="tm-abil-chip ${(e.cfg.nature || "") === k ? "on" : ""}" data-cfg-nature="${k}">${l}</button>`).join("")}</div>`;
  function cfgEditorBody(e, { assume = false } = {}) {
    const c = e.cfg;
    const used = pointsUsed(c.spread);
    const pt = (k, lab, extra = "") => `<div class="cl-stat"${extra ? ` title="${extra}"` : ""}><span class="cl-stat-lab">${lab}</span><div class="cl-step"><button data-cfg-spread="${k}" data-dir="-1">−</button><b>${c.spread[k] || 0}</b><button data-cfg-spread="${k}" data-dir="1">+</button></div></div>`;
    const step = (k, lab, extra = "") => `<div class="cl-stat"${extra ? ` title="${extra}"` : ""}><span class="cl-stat-lab">${lab}</span><div class="cl-step"><button data-cfg-stage="${k}" data-dir="-1">−</button><b>${c.stages[k] >= 0 ? "+" : ""}${c.stages[k]}</b><button data-cfg-stage="${k}" data-dir="1">+</button></div></div>`;
    return `
      ${e.dmgAbils.length ? abilChipsHtml(e) : ""}
      ${itemChipsHtml(e)}
      ${natureChipsHtml(e)}
      <div class="mv-cfg-sec">
        <div class="mv-cfg-sec-head"><span>Stat points</span><span class="cl-points ${used > POOL ? "over" : ""}" title="Champions: ${POOL} points to distribute, at most ${CAP} into one stat">Points ${used}/${POOL}</span><button class="btn-sm" data-cfg-reset title="Back to defaults">↺ reset</button></div>
        <div class="mv-cfg-grid">${pt("atk", "Atk")}${pt("spa", "Sp.Atk")}${pt("def", "Def", "Body Press attacks with Defense")}${pt("spe", "Speed", "Gyro Ball / Electro Ball power scales with Speed")}</div>
      </div>
      <div class="mv-cfg-sec">
        <div class="mv-cfg-sec-head"><span>Boost stages</span></div>
        <div class="mv-cfg-grid">${step("atk", "Atk")}${step("spa", "Sp.Atk")}${step("def", "Def", "Body Press attacks with Defense — this boosts it")}${step("spe", "Speed", "changes Gyro Ball / Electro Ball power")}</div>
      </div>
      ${assume ? `<div class="mv-cfg-sec">
        <div class="mv-cfg-sec-head"><span>Assumed target</span><small class="muted">Grass Knot · Low Kick · Heavy Slam · Heat Crash · Gyro Ball · Electro Ball</small></div>
        <div class="mv-cfg-grid">
          <div class="cl-stat" title="The defender's weight — Grass Knot/Low Kick scale with it; Heavy Slam/Heat Crash compare ${e.name}'s ${e.weight} kg against it"><span class="cl-stat-lab">Weight</span><span class="mv-cfg-num"><input type="number" data-cfg-tw value="${c.tw}" min="0.1" max="999.9" step="0.1" inputmode="decimal"> kg</span></div>
          <div class="cl-stat" title="The defender's Speed — Gyro Ball grows the slower ${e.name} is vs it, Electro Ball the faster"><span class="cl-stat-lab">Speed</span><span class="mv-cfg-num"><input type="number" data-cfg-ts value="${c.ts}" min="1" max="400" step="1" inputmode="numeric"></span></div>
        </div>
      </div>` : ""}`;
  }
  // Apply a click/change from either editor onto its entry. Returns true when something changed.
  function cfgClick(e, target) {
    const ab = target.closest("[data-cfg-abil]");
    if (ab) { e.ability = ab.dataset.cfgAbil || null; return true; }
    const it = target.closest("[data-cfg-item]");
    if (it) { e.cfg.item = it.dataset.cfgItem; return true; }
    const nt = target.closest("[data-cfg-nature]");
    if (nt) { e.cfg.nature = nt.dataset.cfgNature || ""; return true; }
    const sp = target.closest("[data-cfg-spread]");
    if (sp) {   // ±2 points per click, ≤32 into one stat, 66-point pool shared with the other stats
      const k = sp.dataset.cfgSpread, cur = e.cfg.spread[k] || 0, others = pointsUsed(e.cfg.spread) - cur;
      e.cfg.spread[k] = Math.max(0, Math.min(cur + 2 * Number(sp.dataset.dir), CAP, POOL - others));
      return true;
    }
    const st = target.closest("[data-cfg-stage]");
    if (st) { const k = st.dataset.cfgStage; e.cfg.stages[k] = Math.max(-6, Math.min(6, (e.cfg.stages[k] || 0) + Number(st.dataset.dir))); return true; }
    if (target.closest("[data-cfg-reset]")) { e.cfg = defaultCfg(); e.ability = e.defAbility; return true; }
    return false;
  }
  function cfgChange(e, target) {   // nature is now click-based chips; only the tw/ts number inputs use change
    if (target.matches("[data-cfg-tw],[data-cfg-ts]")) return readAssume(e, target);
    return false;
  }
  // ⚙ customize popover: pops up under the chips only when needed, one mon at a time.
  function renderCfgPop() {
    const el = $(".mv-cfg-wrap");
    const m = state.cfgOpen && state.mons.find((x) => x.slug === state.cfgOpen);
    if (!m) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="mv-cfg-pop">
      <div class="mv-cfg-head"><img src="${m.sprite}" alt=""><b>${m.name}</b><small class="muted">@50 — Atk ${m.lvAtk} · Sp.A ${m.lvSpa} · Def ${m.lvDef} · Spe ${m.lvSpe}${m.weight ? ` · ${m.weight} kg` : ""}</small><button class="tc-detail-x" data-cfg-close aria-label="Close">✕</button></div>
      ${cfgEditorBody(m, { assume: true })}
    </div>`;
  }
  // A compact summary of a ⚙ setup — the stat half (points / nature / boosts / item) and, with the
  // ability prepended, the whole thing (browse chips). Split so rank rows can hide the stat half when
  // it just mirrors the global preset.
  const STAT_ABBR = { atk: "Atk", spa: "SpA", def: "Def", spe: "Spe" };
  function cfgStatParts(e) {
    const c = e.cfg, parts = [];
    ["atk", "spa", "def", "spe"].forEach((k) => { if (c.spread[k]) parts.push(`${c.spread[k]} ${STAT_ABBR[k]}`); });   // per-stat points (which stat matters)
    if (c.nature) parts.push(`${STAT_ABBR[c.nature]}+nat`);
    ["atk", "spa", "def", "spe"].forEach((k) => { if (c.stages[k]) parts.push(`${c.stages[k] > 0 ? "+" : ""}${c.stages[k]} ${STAT_ABBR[k]} stage`); });
    if (c.item !== "none") parts.push((OFF_ITEMS[c.item] || {}).label);
    return parts;
  }
  function cfgAbilPart(e) { return e.ability !== e.defAbility ? [e.ability ? abilName(e.ability) : "no abil."] : []; }
  function cfgBadgeParts(e) { return [...cfgAbilPart(e), ...cfgStatParts(e)]; }
  // The per-mon context the Expected columns need: Lv50 attacking stats, typing (STAB),
  // raw stats (Protosynthesis picks the highest), damage-relevant abilities + the default,
  // weight + Lv50 Spe for the weight/speed-scaled moves.
  const defaultCfg = () => ({ spread: { atk: 0, spa: 0, def: 0, spe: 0 }, nature: "",
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

  // ---------- "Best users" ranking: the whole roster's Eff.Dmg for one move / an archetype ----------
  const moveById = new Map(moves.map((m) => [m.id, m]));
  // every rankable (damaging, incl. weight/speed-scaled) move as autocomplete items
  const rankableMoves = moves.filter((m) => m._ep).map((m) => ({ value: m.id, name: m.name,
    icon: `<span class="type tiny" style="background:${TYPE_COLORS[m.type]}">${m.type}</span>` }));
  // every damage-relevant ability on the roster — for the "ignore an ability" autocomplete
  const rankableAbils = [...new Set(data.pokemon.flatMap((m) => damageAbilities(m)))]
    .map((slug) => ({ value: slug, name: (data.abilities[slug] || {}).name || slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // One entry per roster mon, same shape the browse math uses — powerFor/monDmg work unchanged.
  // `ability` starts at the mon's real default (most-used); the user overrides it per-mon in the ⚙
  // editor — no auto "best ability" pick, so pinch abilities (Torrent …) don't silently inflate ranks.
  let rankMons = null;
  const getRankMons = () => {
    if (!rankMons) {
      rankMons = data.pokemon.map((mon) => Object.assign(monEntry(mon),
        { usagePct: mon.usagePct, isMega: mon.isMega, available: mon.available, touched: false }));
      applyPreset();
    }
    return rankMons;
  };
  // The global build is a full cfg (per-stat points + per-stat boosts + a specific nature + item),
  // exactly like a per-mon setup. Each seeded copy is deep-cloned + gets the shared weight/Spe target.
  const presetDefaultCfg = () => ({ spread: { atk: 0, spa: 0, def: 0, spe: 0 }, stages: { atk: 0, spa: 0, def: 0, spe: 0 }, nature: "", item: "none" });
  function presetToCfg() {
    const p = state.rq.preset;
    return { spread: { ...p.spread }, stages: { ...p.stages }, nature: p.nature, item: p.item, tw: state.rq.tw, ts: state.rq.ts };
  }
  // Seed the preset onto every mon the user hasn't individually customized (touched).
  function applyPreset() { if (rankMons) for (const e of rankMons) if (!e.touched) e.cfg = presetToCfg(); }
  const presetActive = () => { const p = state.rq.preset; return pointsUsed(p.spread) > 0 || Object.values(p.stages).some((v) => v) || p.nature || p.item !== "none"; };
  const abilName = (slug) => (data.abilities[slug] || {}).name || slug;
  // Damage for one mon + move using its CHOSEN ability, minus any globally-ignored ability (→ None).
  function rankDmg(e, m) {
    const saved = e.ability;
    const eff = saved && state.rq.ignoredAbils.has(saved) ? null : saved;
    e.ability = eff;
    const d = monDmg(e, m);
    e.ability = saved;
    return d ? { d, ability: eff } : null;
  }
  function rankFor() {
    const q = state.rq;
    const mons = getRankMons().filter((e) =>
      (q.mega === "hide" ? !e.isMega : q.mega === "only" ? e.isMega : true) && (!q.avail || e.available !== false));
    const rows = [];
    const exact = q.moveId != null ? moveById.get(q.moveId) : null;
    for (const e of mons) {
      e.cfg.tw = q.tw; e.cfg.ts = q.ts;   // rank-level assumed target for weight/speed moves
      let top = null;
      if (exact) {
        if (!exact._ep || !e.moves.has(exact.id)) continue;
        const b = rankDmg(e, exact);
        if (b) top = { m: exact, ...b };
      } else {
        for (const id of e.moves) {   // archetype: the mon's best QUALIFYING move (ability is fixed)
          const m = moveById.get(id);
          if (!m || !m._ep || q.excluded.has(m.id) || TARGET_STAT_MOVES.has(m.name)) continue;
          if (q.type && m.type !== q.type) continue;
          if (q.cat && m.class !== q.cat) continue;
          const b = rankDmg(e, m);
          if (b && (!top || b.d.v > top.d.v)) top = { m, ...b };
        }
      }
      if (top) rows.push({ e, ...top });
    }
    rows.sort((a, b) => b.d.v - a.d.v || a.e.name.localeCompare(b.e.name));
    return rows;
  }
  // Only the dynamic bits re-render (chips, actives) — the inputs/autocompletes are attached once.
  function renderRankCtls() {
    const q = state.rq;
    const m = q.moveId != null ? moveById.get(q.moveId) : null;
    $(".mvr-chipwrap").innerHTML = m
      ? `<span class="cl-exchip mvr-movechip"><span class="type tiny" style="background:${TYPE_COLORS[m.type]}">${m.type}</span><b>${m.name}</b><button data-mvr-clear aria-label="Clear — back to archetype ranking">✕</button></span>`
      : `<small class="muted">no move picked — ranking each Pokémon's best move of:</small>`;
    $(".mvr-arch").classList.toggle("dim", !!m);
    $(".mvr-exchips").innerHTML = [...q.excluded].map((id) => { const x = moveById.get(id);
      return x ? `<span class="cl-exchip">${x.name}<button data-mvr-unexclude="${id}" aria-label="restore ${x.name}">✕</button></span>` : ""; }).join("");
    $(".mvr-abchips").innerHTML = [...q.ignoredAbils].map((slug) =>
      `<span class="cl-exchip">🚫 ${abilName(slug)}<button data-mvr-unignore="${slug}" aria-label="restore ${abilName(slug)}">✕</button></span>`).join("");
    toolbarEl.querySelectorAll("[data-mvrcat]").forEach((b) => b.classList.toggle("active", b.dataset.mvrcat === q.cat));
    toolbarEl.querySelectorAll("[data-mvrtype]").forEach((b) => b.classList.toggle("on", b.dataset.mvrtype === q.type));
    toolbarEl.querySelectorAll("[data-mvrmega]").forEach((b) => b.classList.toggle("active", b.dataset.mvrmega === q.mega));
    // global build — a collapsible full cfg editor (reuses the same controls as the per-mon ⚙)
    const sum = presetActive() ? cfgStatParts({ cfg: q.preset }).join(" · ") : "none — every Pokémon at base Lv50";
    $(".mvr-preset").innerHTML = `
      <button class="mvr-preset-toggle ${q.presetOpen ? "open" : ""} ${presetActive() ? "has" : ""}" data-preset-toggle title="A build applied to every Pokémon you haven't individually customized">
        🛠 Everyone runs <b>${sum}</b> <span class="mvr-preset-caret">${q.presetOpen ? "▾" : "▸"}</span></button>
      ${q.presetOpen ? `<div class="mvr-preset-edit">${cfgEditorBody({ cfg: q.preset, dmgAbils: [] }, { assume: false })}</div>` : ""}`;
  }
  // Every damaging move the mon learns, with its Eff.Dmg under the mon's current setup — sorted desc.
  // Same math as the ranking (rankDmg respects ability / cfg / useAcc / expBest / ignored abilities).
  function monMoveList(e) {
    const out = [];
    for (const id of e.moves) {
      const mv = moveById.get(id);
      if (!mv || !mv._ep || TARGET_STAT_MOVES.has(mv.name)) continue;
      const b = rankDmg(e, mv);
      if (b) out.push({ mv, ...b });
    }
    out.sort((a, b) => b.d.v - a.d.v || a.mv.name.localeCompare(b.mv.name));
    return out;
  }
  // The full details panel for one expanded mon: all-moves damage + the customize controls.
  function monPanel(e, rankedId) {
    const list = monMoveList(e);
    const mvRow = ({ mv, d, ability }) => {
      const nm = ability ? abilName(ability) : null;
      const fl = (d.note ? d.note.split(" · ") : []).filter((x) => x !== nm)
        .map((x) => `<span class="ehp-flag">${x}</span>`).join("");
      return `<div class="mvr-mvrow ${mv.id === rankedId ? "is-ranked" : ""}">
        <span class="mvr-mv-nm"><span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span><button class="mvr-mvname" data-info-move="${mv.id}" title="Open ${mv.name}">${mv.name}</button></span>
        <span class="mvr-mv-pw" title="Expected power (STAB/ability in)">${d.pw} pw</span>
        <span class="mvr-mv-dmg" title="Effective damage — compare against effective HP (HP×Def)"><b>${sep(d.v)}</b></span>
        <span class="mvr-mv-fl">${fl}</span>
      </div>`;
    };
    return `<div class="mvr-panel" data-cfg-slug="${e.slug}">
      <div class="mvr-panel-head">
        <img src="${e.sprite}" alt=""><b>${e.name}</b>
        <small class="muted">@50 — Atk ${e.lvAtk} · Sp.A ${e.lvSpa} · Def ${e.lvDef} · Spe ${e.lvSpe}${e.weight ? ` · ${e.weight} kg` : ""}</small>
        <button class="btn-sm mvr-openfull" data-mon-open="${e.slug}" title="Open ${e.name}'s full page in the Pokédex">↗ Full page</button>
        <button class="tc-detail-x" data-cfg-close aria-label="Close">✕</button>
      </div>
      <div class="mvr-panel-sec"><div class="mv-cfg-sec-head"><span>All moves — effective damage</span><small class="muted">${list.length} damaging</small></div>
        <div class="mvr-mvlist">${list.length ? list.map(mvRow).join("") : '<p class="ehp-empty">No damaging moves.</p>'}</div>
      </div>
      <div class="mvr-panel-sec"><div class="mv-cfg-sec-head"><span>Customize</span>
        <small class="muted">${e.touched ? "custom — ↺ reset rejoins the global preset" : presetActive() ? "following the global preset — change anything to override just this Pokémon" : "base Lv50 — change anything to customize just this Pokémon"}</small></div>
        ${cfgEditorBody(e, { assume: false })}
      </div>
    </div>`;
  }
  function drawRank() {
    renderRankCtls();
    const q = state.rq;
    const rows = rankFor();
    const top = rows.slice(0, 75);
    const max = rows.length ? rows[0].d.v : 0;
    const m = q.moveId != null ? moveById.get(q.moveId) : null;
    const desc = m ? m.name
      : `best ${q.cat === "physical" ? "physical" : q.cat === "special" ? "special" : "phys/spec"} ${q.type || "any-type"} move`;
    $(".mv-count").textContent = `${rows.length} Pokémon ranked — ${desc}${state.useAcc ? "" : " · accuracy ignored"}${state.expBest ? " · best case" : ""}`;
    const rowHtml = ({ e, m: mv, d, ability }, i) => {
      const editing = state.rq.editing === e.slug;
      // notes minus the ability's own name (the ability gets its own clickable chip)
      const nm = ability ? abilName(ability) : null;
      const noteChips = (d.note ? d.note.split(" · ") : []).filter((x) => x !== nm)
        .slice(0, 3).map((x) => `<span class="ehp-flag">${x}</span>`).join("");
      const abilChip = ability ? `<button class="ehp-flag ab mvr-abil" data-info-abil="${ability}" title="${abilName(ability)} — open ability">${abilName(ability)}</button>` : "";
      // badge = ability if non-default + (only for individually-customized mons) its stat overrides,
      // so rows stay clean when everyone shares the global preset
      const badge = [...cfgAbilPart(e), ...(e.touched ? [...cfgStatParts(e), "✎ custom"] : [])];
      return `
      <div class="mvr-row ${editing ? "editing" : ""}" style="--bar:${max ? Math.round((d.v / max) * 100) : 0}%">
        <span class="mvr-rank">${i + 1}</span>
        <button class="mvr-cog ${editing ? "on" : ""}" data-cfg-toggle="${e.slug}" title="See every move's damage & customize ${e.name}">⚙</button>
        <span class="mvr-idn" data-panel-toggle="${e.slug}" title="${editing ? "Hide" : "Show every move's damage &"} customize ${e.name}"><img class="ehp-spr" loading="lazy" src="${e.sprite}" alt="">
          <span class="mvr-name">${e.name}${e.isMega ? ' <span class="mega-badge">MEGA</span>' : ""}${e.usagePct != null ? ` <span class="ehp-use" title="ladder usage">${e.usagePct}%</span>` : ""}${badge.length ? `<small class="mvr-setline">${badge.join(" · ")}</small>` : ""}</span></span>
        <span class="mvr-move"><span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span><button class="mvr-mvname" data-info-move="${mv.id}" title="Open ${mv.name}">${mv.name}</button><small class="mvr-pw" title="Exp. Pow for this Pokémon (STAB/ability in)">${d.pw} pw</small>${m ? "" : `<button class="mvr-ignore" data-mvr-ignore="${mv.id}" title="Ignore ${mv.name} — drop it from the best-move pick" aria-label="Ignore ${mv.name}">✕</button>`}</span>
        <span class="mvr-dmg" title="Effective damage — compare against effective HP (HP×Def)"><b>${sep(d.v)}</b></span>
        <span class="mvr-chips">${abilChip}${noteChips}</span>
      </div>${editing ? monPanel(e, mv.id) : ""}`;
    };
    const presetNote = presetActive()
      ? `Global build: <b>${cfgStatParts({ cfg: q.preset }).join(" · ")}</b> on every Pokémon (individually-customized ✎ ones keep their own).`
      : `Base Lv50 stats — set a global build above (<b>Everyone runs</b>) so stat-multiplying abilities and Body-Press/weight setups rank realistically.`;
    contentEl.innerHTML = `
      <p class="mvr-note">${presetNote} Click a <b>Pokémon</b> (or <b>⚙</b>) to see <b>every move's effective damage</b> and override its ability/stats/boosts/item; click a move to open it${m ? "" : ", or <b>✕</b> to drop it from the pick"}${state.useAcc ? "" : "; accuracy is ignored (potential damage)"}.</p>
      ${top.length ? `<div class="mvr-list">${top.map(rowHtml).join("")}</div>` : `<p class="ehp-empty">${m ? "No Pokémon learns this move under the current Mega/Available filters." : "No match — pick a move above, or a type/category."}</p>`}
      ${rows.length > 75 ? `<p class="ehp-more">Showing the top 75 of ${rows.length}.</p>` : ""}`;
  }
  function syncMvMode() {
    toolbarEl.querySelectorAll("[data-mvmode]").forEach((b) => b.classList.toggle("active", b.dataset.mvmode === state.mode));
    $(".mv-browse-ctls").hidden = state.mode !== "browse";
    $(".mv-rank-ctls").hidden = state.mode !== "rank";
    draw();
  }
  function rankMove(id) {
    state.mode = "rank";
    state.rq.moveId = id;
    syncMvMode();
    window.scrollTo({ top: 0 });
  }

  $(".mv-search").addEventListener("input", (e) => { state.search = e.target.value; draw(); });
  $(".mv-exp-best").addEventListener("change", (e) => { state.expBest = e.target.checked; draw(); });
  $(".mv-exp-acc").addEventListener("change", (e) => { state.useAcc = e.target.checked; draw(); });
  // ---- Best users (rank) controls ----
  toolbarEl.querySelectorAll("[data-mvmode]").forEach((b) => b.addEventListener("click", () => {
    if (state.mode === b.dataset.mvmode) return;
    state.mode = b.dataset.mvmode;
    syncMvMode();
  }));
  attachAutocomplete($(".mvr-move-input"), {
    items: () => rankableMoves,
    onPick: (id) => { state.rq.moveId = id; draw(); },
  });
  attachAutocomplete($(".mvr-excl-input"), {
    items: () => rankableMoves.filter((x) => !state.rq.excluded.has(x.value)),
    onPick: (id) => { state.rq.excluded.add(id); saveRankExcluded(); draw(); },
  });
  attachAutocomplete($(".mvr-abil-input"), {
    items: () => rankableAbils.filter((x) => !state.rq.ignoredAbils.has(x.value)),
    onPick: (slug) => { state.rq.ignoredAbils.add(slug); saveRankAbils(); draw(); },
  });
  $(".mvr-chipwrap").addEventListener("click", (e) => {
    if (e.target.closest("[data-mvr-clear]")) { state.rq.moveId = null; draw(); }
  });
  $(".mvr-exchips").addEventListener("click", (e) => {
    const u = e.target.closest("[data-mvr-unexclude]");
    if (u) { state.rq.excluded.delete(Number(u.dataset.mvrUnexclude)); saveRankExcluded(); draw(); }
  });
  $(".mvr-abchips").addEventListener("click", (e) => {
    const u = e.target.closest("[data-mvr-unignore]");
    if (u) { state.rq.ignoredAbils.delete(u.dataset.mvrUnignore); saveRankAbils(); draw(); }
  });
  toolbarEl.querySelectorAll("[data-mvrcat]").forEach((b) => b.addEventListener("click", () => { state.rq.cat = b.dataset.mvrcat; draw(); }));
  toolbarEl.querySelectorAll("[data-mvrmega]").forEach((b) => b.addEventListener("click", () => { state.rq.mega = b.dataset.mvrmega; draw(); }));
  toolbarEl.querySelectorAll("[data-mvrtype]").forEach((b) => b.addEventListener("click", () => {
    state.rq.type = state.rq.type === b.dataset.mvrtype ? "" : b.dataset.mvrtype;
    draw();
  }));
  $(".mvr-avail").addEventListener("change", (e) => { state.rq.avail = e.target.checked; draw(); });
  // global build — the same cfg editor as a per-mon ⚙, editing state.rq.preset; each change re-seeds
  // every un-customized mon then re-ranks. Delegated (the block re-renders on every draw).
  $(".mvr-preset").addEventListener("click", (e) => {
    if (e.target.closest("[data-preset-toggle]")) { state.rq.presetOpen = !state.rq.presetOpen; drawRank(); return; }
    if (!e.target.closest(".mvr-preset-edit")) return;
    if (e.target.closest("[data-cfg-reset]")) { state.rq.preset = presetDefaultCfg(); applyPreset(); draw(); return; }
    if (cfgClick({ cfg: state.rq.preset }, e.target)) { applyPreset(); draw(); }   // wrapper mutates rq.preset in place
  });
  // assumed-target inputs: live-update on input; the fields are never re-rendered, so no focus loss
  const readRankAssume = () => {
    const tw = parseFloat($(".mvr-tw").value), ts = parseFloat($(".mvr-ts").value);
    state.rq.tw = Number.isFinite(tw) ? Math.min(999.9, Math.max(0.1, Math.round(tw * 10) / 10)) : 70;
    state.rq.ts = Number.isFinite(ts) ? Math.min(400, Math.max(1, Math.round(ts))) : 100;
  };
  $(".mvr-tw").addEventListener("input", () => { readRankAssume(); draw(); });
  $(".mvr-ts").addEventListener("input", () => { readRankAssume(); draw(); });
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
  // ⚙ customize popover controls — the mutation logic lives in cfgClick/cfgChange (shared with rank).
  const cfgMon = () => state.mons.find((x) => x.slug === state.cfgOpen);
  const cfgApply = () => { updateMonUI(); draw(); };   // updateMonUI re-renders chips (badge) + popover
  // assumed-target inputs: clamp + write into cfg. Returns true when the value changed.
  function readAssume(m, el) {
    const v = parseFloat(el.value);
    if (el.matches("[data-cfg-tw]")) {
      const tw = Number.isFinite(v) ? Math.min(999.9, Math.max(0.1, Math.round(v * 10) / 10)) : 70;
      if (tw === m.cfg.tw) return false; m.cfg.tw = tw; return true;
    }
    const ts = Number.isFinite(v) ? Math.min(400, Math.max(1, Math.round(v))) : 100;
    if (ts === m.cfg.ts) return false; m.cfg.ts = ts; return true;
  }
  $(".mv-cfg-wrap").addEventListener("change", (e) => {
    const m = cfgMon(); if (!m) return;
    // commit (blur/Enter) on a number field: snap to the clamped value. Deferred a tick — replacing
    // the still-focused input inside its own change event re-fires change and crashes the teardown.
    if (e.target.matches("[data-cfg-tw],[data-cfg-ts]")) { readAssume(m, e.target); setTimeout(cfgApply, 0); }
    else if (cfgChange(m, e.target)) cfgApply();
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
    if (cfgClick(m, e.target)) cfgApply();
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
  // ☰ Flags reveals the mechanical-flag chip row (hidden by default; the type/finder rows also
  // collapse behind it on phones)
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

  const rankEntry = (slug) => getRankMons().find((x) => x.slug === slug);
  const togglePanel = (slug) => { state.rq.editing = state.rq.editing === slug ? null : slug; drawRank(); };
  contentEl.addEventListener("click", (e) => {
    // --- Best-users rank interactions (specific targets before the generic panel-cfg catch) ---
    if (e.target.closest("[data-cfg-close]")) { state.rq.editing = null; drawRank(); return; }
    const of = e.target.closest("[data-mon-open]");      // ↗ the only path that leaves for the Pokédex
    if (of) { onMon && onMon(of.dataset.monOpen); return; }
    const cog = e.target.closest("[data-cfg-toggle]");   // ⚙ toggles the in-place details panel
    if (cog) { togglePanel(cog.dataset.cfgToggle); return; }
    const pt = e.target.closest("[data-panel-toggle]");  // sprite/name → same panel, stays in place
    if (pt) { togglePanel(pt.dataset.panelToggle); return; }
    const ig = e.target.closest("[data-mvr-ignore]");    // ✕ on a ranked move → ignore it
    if (ig) { state.rq.excluded.add(Number(ig.dataset.mvrIgnore)); saveRankExcluded(); drawRank(); return; }
    const ia = e.target.closest("[data-info-abil]");     // ability chip → ability popup
    if (ia) { onAbil && onAbil(ia.dataset.infoAbil); return; }
    const im = e.target.closest("[data-info-move]");     // move name (row OR panel list) → move popup
    if (im) { onInfo && onInfo(Number(im.dataset.infoMove)); return; }
    const ed = e.target.closest(".mvr-panel[data-cfg-slug]");   // cfg controls inside the panel
    if (ed) {
      const en = rankEntry(ed.dataset.cfgSlug); if (!en) return;
      // reset means "rejoin the global preset" here, not "back to base zero"
      if (e.target.closest("[data-cfg-reset]")) { en.touched = false; en.cfg = presetToCfg(); en.ability = en.defAbility; drawRank(); return; }
      if (cfgClick(en, e.target)) {
        if (e.target.closest("[data-cfg-spread],[data-cfg-stage],[data-cfg-item],[data-cfg-nature]")) en.touched = true;  // stat override (not ability)
        drawRank();
      }
      return;
    }
    const rk = e.target.closest("[data-rank]");          // 🏆 on a browse row → rank this move
    if (rk) { rankMove(Number(rk.dataset.rank)); return; }
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
  // the only change-based control in the rank panel is the +nature checkbox (a stat override → touched)
  contentEl.addEventListener("change", (e) => {
    const ed = e.target.closest(".mvr-panel[data-cfg-slug]");
    if (ed) { const en = rankEntry(ed.dataset.cfgSlug); if (en && cfgChange(en, e.target)) { en.touched = true; drawRank(); } }
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

  // Every control funnels through draw(); it renders whichever sub-view is active.
  function draw() {
    if (state.mode === "rank") drawRank(); else drawBrowse();
  }
  function drawBrowse() {
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
        : `<td class="mv-nm"><button class="lens" data-filter="${m.id}" title="Filter roster by this move">🔍</button>${m._ep ? `<button class="lens" data-rank="${m.id}" title="Best users — rank every Pokémon's damage with this move">🏆</button>` : ""}${m.name}</td>`;
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
    state.mode = "browse";   // the compare bridge always lands on the table
    updateMonUI();
    syncMvMode();
    window.scrollTo({ top: 0 });
  }

  draw();
  return { browseMons, rankMove };
}
