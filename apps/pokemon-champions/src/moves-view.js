// Browsable Moves table: power / accuracy / PP / priority / target / flags /
// effect / how many roster Pokemon learn it. Click a column to sort, Shift-click
// to add a tiebreaker (multi-key). Defaults to grouped-by-type, then most-common
// first. Can also load a *set* of Pokémon (e.g. the compared ones) to show per-mon
// ownership columns + filter to the moves they share, with full move detail here
// rather than crammed into the compare popup.
import { TYPES, TYPE_COLORS, displayName, targetLabel, isSpread, rarityTier, TARGET_GROUPS } from "./data.js";
import { statsFor } from "./effective-stats.js";
import { damageAbilities, offenseMult, offDefaultAbility } from "./offense-model.js";

const COLS = [
  { key: "name", label: "Move" },
  { key: "type", label: "Type" },
  { key: "class", label: "Cat", nosort: true },
  { key: "target", label: "Affects" },
  { key: "power", label: "Pow", num: true },
  { key: "accuracy", label: "Acc", num: true },
  { key: "expp", label: "Exp. Pow", num: true, title: "Expected power — Power × Accuracy × crit × multi-hit × spread(×0.75), plus the loaded mon's STAB and ability (Huge Power, Sand Force …)." },
  { key: "expd", label: "Eff. Dmg", num: true, title: "Effective damage — 0.44 × Exp. Pow (STAB + ability already in) × the mon's Lv50 Atk/Sp.Atk. Compare against a defender's effective HP (HP×Def)." },
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
// Precompute a move's expected-power modifiers (null = no BP-based expected: status / null / variable power).
function expData(m) {
  if (m.class === "status" || m.power == null) return null;
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
  return { hits, hitNote, crit, critNote, cond: COND_DMG[m.name] || null };
}

export function initMovesView({ toolbarEl, contentEl, data, onInfo, onFilter }) {
  const moves = Object.entries(data.moves).map(([id, m]) => ({ id: Number(id), ...m, _fx: classifyMove(m), _ep: expData(m) }));
  const allFlags = [...new Set(moves.flatMap((m) => m.flags || []))].sort();
  const monByName = new Map(data.pokemon.map((m) => [(m._display || displayName(m)).toLowerCase(), m]));
  const state = { search: "", type: "", cat: "", flags: new Set(), tgroup: "", facets: new Set(), chance: "",
    mons: [], ownMode: "any", focus: null, sort: structuredClone(DEFAULT_SORT),
    expBest: false };   // best case: conditional move effects AND conditional abilities assumed active

  // Move-intrinsic power: BP × accuracy(×accMult) × crit × multi-hit × spread(0.75) × best-case cond.
  function intrinsicPower(m, accMult = 1) {
    const ep = m._ep;
    if (!ep) return null;
    const acc = (m.accuracy == null ? 1 : m.accuracy / 100) * accMult;
    let v = m.power * acc * ep.crit * ep.hits;
    if (isSpread(m.target)) v *= 0.75;                       // Champions is doubles (Reg M-B)
    if (state.expBest && ep.cond) v *= ep.cond.mult;         // conditional signature effects
    return v;
  }
  // Expected power INCLUDING a mon's STAB AND its ability (both live HERE, in Exp. Pow — shown to
  //   the user). { power, stab, note }. mon = null → intrinsic only. -ate retypes → STAB follows the
  //   new type; ability damage multipliers (Huge Power, Sand Force …) are baked into `power`.
  function powerFor(m, mon) {
    const o = mon ? offenseMult(mon.ability, mon, m, m.power, state.expBest) : { mult: 1, stab: null, acc: 1, retype: null, note: "" };
    const ip = intrinsicPower(m, o.acc);
    if (ip == null) return null;
    const stab = o.stab || (mon && mon.types.includes(o.retype || m.type) ? 1.5 : 1);
    return { power: ip * stab * o.mult, stab, note: o.note };
  }
  // Effective damage for ONE mon = 0.44 (Gen-9 Lv50 coeff) × its Exp.Pow (STAB + ability already in)
  // × its Lv50 Atk|SpA. Compare against effective HP (HP×Def). null = doesn't learn / no BP.
  function monDmg(mon, m) {
    if (!m._ep || !mon.moves.has(m.id)) return null;
    const pf = powerFor(m, mon);
    if (!pf) return null;
    const v = Math.round(0.44 * pf.power * (m.class === "physical" ? mon.lvAtk : mon.lvSpa));
    const notes = [];
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
  // Eff. Dmg cell (the focused/first mon): full number + STAB/ability note.
  function expdCell(m) {
    if (m._expd == null) return `<span class="muted">—</span>`;
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
    <div class="mv-expctl" title="Exp. Pow = Power × Accuracy × crit × multi-hit × spread(×0.75). Eff. Dmg = 0.44 × Exp. Pow × the mon's Lv50 Atk/Sp.Atk with its STAB + ability — compare against effective HP (HP×Def).">
      <label class="mv-exp-bestwrap"><input type="checkbox" class="mv-exp-best"> best case <small>(conditions + abilities)</small></label>
    </div>
    <button class="btn mv-filter-btn" title="More filters — mechanical flags (Sound, Contact, …); on phones also the type & finder rows">☰ Filters</button>
    <span class="mv-hint">Click a column to sort · Shift-click adds a tiebreaker · <button class="mv-reset">reset</button></span>
    <span class="count mv-count"></span>
    <div class="mv-mon-chips"></div>
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
    $(".mv-mon-chips").innerHTML = state.mons.map((m) => {
      // ability picker: only abilities that can change damage; "no ability" = plain stats
      const abilSel = m.dmgAbils && m.dmgAbils.length
        ? `<select class="mon-abil" data-mon-abil="${m.slug}" title="Ability used for ${m.name}'s Eff. Dmg"><option value="">no ability</option>${m.dmgAbils.map((a) => `<option value="${a.slug}" ${m.ability === a.slug ? "selected" : ""}>${a.name}</option>`).join("")}</select>`
        : "";
      return `<span class="mon-chip ${state.focus === m.slug ? "focus" : ""}" data-focus-mon="${m.slug}" ${n >= 2 ? `title="${state.focus === m.slug ? "Unfocus" : `Focus — group the table around ${m.name}'s moves`}"` : ""}><img src="${m.sprite}" alt="">${m.name}${abilSel}<button data-rm-mon="${m.slug}" aria-label="Remove ${m.name}">✕</button></span>`;
    }).join("");
    // "any/all" toggle is irrelevant below 2 mons and superseded by the grouped view while focused
    $(".mv-own").hidden = n < 2 || !!state.focus;
    toolbarEl.querySelectorAll(".mv-own button").forEach((x) => x.classList.toggle("active", x.dataset.own === state.ownMode));
  }
  function toggleFocus(slug) {
    if (state.mons.length < 2) return;
    state.focus = state.focus === slug ? null : slug;
    updateMonUI(); draw();
  }
  // The per-mon context the Expected columns need: Lv50 attacking stats, typing (STAB),
  // raw stats (Protosynthesis picks the highest), damage-relevant abilities + the default.
  function monEntry(mon) {
    const lv = statsFor(mon, "lv50");
    const da = damageAbilities(mon).map((s) => ({ slug: s, name: (data.abilities[s] || {}).name || s }));
    const def = offDefaultAbility(mon);
    return { slug: mon.slug, name: mon._display || displayName(mon),
      sprite: mon.sprite || mon.artwork || "", moves: new Set(mon.moves),
      lvAtk: lv.atk, lvSpa: lv.spa, types: mon.types, stats: mon.stats,
      dmgAbils: da, ability: da.some((a) => a.slug === def) ? def : null };
  }
  function addMon(mon) {
    if (!mon || state.mons.some((x) => x.slug === mon.slug)) return;
    state.mons.push(monEntry(mon));
    updateMonUI(); draw();
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
  // per-mon ability picker inside the chips (change must not toggle focus)
  $(".mv-mon-chips").addEventListener("change", (e) => {
    const sel = e.target.closest(".mon-abil");
    if (!sel) return;
    const mon = state.mons.find((x) => x.slug === sel.dataset.monAbil);
    if (mon) { mon.ability = sel.value || null; draw(); }
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
    if (e.target.closest(".mon-abil")) return;         // ability picker clicks don't toggle focus
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
      // Expected columns — fresh each draw (depend on best-case + loaded mons + focus).
      // Exp. Pow includes the anchor mon's STAB (visible); Eff. Dmg reuses it (no double STAB).
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
      const flags = (m.flags || []).map((f) => `<span class="mflag">${f}</span>`).join("");
      const cat = m.class[0].toUpperCase();
      // owner cells: the mon's own Eff. Dmg (compact) when it learns a damaging move —
      // side-by-side comparable across the loaded mons; ✓ sprite for status/variable moves.
      const ownerCells = state.mons.map((pm) => {
        const learns = pm.moves.has(m.id);
        const d = learns ? m._dmg[pm.slug] : null;
        const inner = !learns ? ""
          : d ? `<span class="mv-own-dmg" title="${pm.name}: ${sep(d.v)}${d.note ? " · " + d.note : ""}">${compact(d.v)}</span>`
          : `<img class="cm-yes" loading="lazy" alt="✓" title="${pm.name}" src="${pm.sprite}">`;
        return `<td class="mv-owner ${state.focus === pm.slug ? "focus" : ""}">${inner}</td>`;
      }).join("") + (n >= 2 ? `<td class="num mv-shared">${m._own}/${n}</td>` : "");
      const tgt = m.target ? `<span class="mv-target ${isSpread(m.target) ? "spread" : ""}">${targetLabel(m.target)}</span>` : "—";
      return `<tr data-move="${m.id}" title="View move details">
        <td class="mv-nm"><button class="lens" data-filter="${m.id}" title="Filter roster by this move">🔍</button>${m.name}</td>
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
        <td class="num mv-cnt"><span class="rarity ${rarityTier(m.count, data.total).cls}">${m.count}</span></td>
        <td class="mv-eff">${m.effect || ""}</td>
      </tr>`;
    };
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
    contentEl.innerHTML = `<table class="poke-table moves-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
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
