// Entry point: load data, build controls, wire events, render.
import { loadData, loadTournamentTeams, TYPES, TYPE_COLORS, displayName, GEN_LABEL } from "./data.js";
import {
  DEFAULT_WEIGHTS, computeEffective, STAT_KEYS, STAT_LABELS, statScaleMax,
} from "./effective-stats.js";
import { buildSimContext } from "./similarity.js";
import {
  createFilterState, applyFilters, sortMons, activeFilterCount,
} from "./filters.js";
import { renderTable, renderGrid, ROLE_META } from "./table.js";
import { renderDetail, DETAIL_TABS } from "./detail.js";
import { presentImportNotes } from "./meta-view.js";
import { initMovesView } from "./moves-view.js";
import { initAbilitiesView } from "./abilities-view.js";
import { initCalcView } from "./calc-view.js";
import { renderTeamView, TEAM_MAX } from "./team-view.js";
import { attachAutocomplete } from "./autocomplete.js";
import { rosterAbilities, defaultRosterAbility } from "./type-defense.js";
import { initCoverageView } from "./coverage-view.js";
import { renderMovePopup, renderAbilityPopup } from "./info.js";
import { renderCompare } from "./compare.js";
import { tickStatLab, optimizeSpread, emptySpread, POOL, CAP, pointsUsed } from "./stat-lab.js";
import { initSync } from "./sync.js";
import { normalizeItem } from "./item-model.js";
import { initSyncView } from "./sync-view.js";
import { migrateSavedTeams, saveTeamRecord, emptyTeamContext } from "./team-store.js";
import { selectMetaDataset, mapTournamentTeam } from "./meta-model.js";
import { NATURES, SET_STATS, validSpread } from "./set-model.js";

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  data: null,
  all: [],
  bySlug: new Map(),
  simCtx: null,
  weights: { ...DEFAULT_WEIGHTS },
  filters: createFilterState(),
  sort: { key: "cleaned", dir: "desc" },
  view: "table",
  tab: "pokemon",
  statMode: "lv50",   // "base" | "lv50" — Champions battles are always Level 50
  extras: localStorage.getItem("pc-extra-cols") === "1",   // optional Weight/Usage table columns
  compare: [],
  compareAnchor: null,   // slug used as the comparison baseline
  pinned: new Set(),     // roster pins: stay on top of the list through any filters (persisted)
  cmpMoves: "all",       // movepool matrix filter: "all" | "diff"
  team: [],              // [{ slug, moves, ability, picked }] (working team, persisted)
  savedTeams: [],        // [{ id, name, members: [{slug,moves,ability,picked}] }] (persisted)
  teamContext: emptyTeamContext(),
  teamScope: "full",     // "full" | "battle" (view preference; picks themselves persist)
  selected: null,
  spread: emptySpread(), // eHP stat-point lab allocation for the open detail panel
  spreadNature: null,
  metaLimits: {},
  detailTab: "overview",
  metaTeamKind: null,
  metaTeamId: null,
  moveByName: new Map(),   // move name → id, used to parse shared-team codes
};

// A pull landed while you were working. Anything already on screen is stale, but
// a forced reload would throw away whatever you were in the middle of.
function showSyncToast() {
  if (document.getElementById("sync-toast")) return;
  const el = document.createElement("div");
  el.id = "sync-toast";
  el.className = "sync-toast";
  el.innerHTML = `<span>Updated from another device.</span>
    <button class="btn" id="sync-toast-reload">Refresh</button>
    <button class="sync-toast-x" id="sync-toast-x" aria-label="Dismiss">\u2715</button>`;
  document.body.appendChild(el);
  el.querySelector("#sync-toast-reload").addEventListener("click", () => location.reload());
  el.querySelector("#sync-toast-x").addEventListener("click", () => el.remove());
}

// ---------------------------------------------------------------- bootstrap
init();

async function init() {
  try {
    // Fold in anything another device saved before we read a single setting.
    await initSync();
    state.extras = localStorage.getItem("pc-extra-cols") === "1";
    const data = await loadData();
    state.data = data;
    state.all = data.pokemon;
    for (const m of state.all) { m._display = displayName(m); state.bySlug.set(m.slug, m); }
    loadPins();
    loadTeam();
    loadSavedTeams();
    try {
      const context = JSON.parse(localStorage.getItem("pc-team-context") || "null");
      if (context && typeof context.name === "string") state.teamContext = state.savedTeams.some((t) => t.id === context.loadedId)
        ? context : emptyTeamContext(context.name);
    } catch { /* Old installs have no working-team identity. */ }
    state.simCtx = buildSimContext(state.all);
    recomputeEffective();
    buildToolbar();
    buildFilters();
    buildWeights();
    setupTabs();
    bindGlobal();
    setupMobileView();
    initSyncView();
    render();
    // A pull that arrives while you are using the tool: offer the refresh, do
    // not snatch the page away mid-click.
    window.addEventListener("pc-sync-applied", () => showSyncToast());
    $("#status").style.display = "none";
    $("#app").style.display = "flex";
    // shared-team link: #t=<code> (or legacy #team=) imports the team and opens the Team tab
    const th = location.hash.match(/^#(?:t|team)=(.+)$/);
    if (th) {
      history.replaceState(null, "", location.pathname + location.search);
      switchTab("team");
      importTeam(th[1]);
    }
    $("#meta-line").textContent =
      `${data.meta.count} species · ${data.meta.megaCount} Megas · ` +
      `Updated ${data.meta.generated?.slice(0, 10) || "unknown"}`;
    const reg = $("#regulation-label");
    reg.textContent = `Regulation: ${data.meta.regulation || "unspecified"}`;
    reg.title = `${data.meta.rosterScope || "Champions roster snapshot"}. Check official rules for ranked eligibility.`;
    const source = data.meta.regulationDetails?.source;
    if (source?.startsWith("https://")) reg.href = source;
    const unverified = data.meta.learnsets?.unverified?.length || 0;
    const quality = $("#learnset-quality");
    quality.textContent = unverified ? `${unverified} unverified learnset${unverified === 1 ? "" : "s"}` : "Learnset report";
    quality.classList.toggle("has-warning", unverified > 0);
    quality.title = "Source provenance and withheld move candidates. Unverified moves are not selectable.";
    syncTopbarH();
    window.addEventListener("resize", syncTopbarH);
    // keep --topbar-h / --cmpbar-h exact as the toolbar / compare bar reflow
    new ResizeObserver(syncTopbarH).observe($(".topbar"));
    new ResizeObserver(syncCmpBarH).observe($("#compare-bar"));
  } catch (err) {
    $("#status").innerHTML =
      `<p class="err">Could not load data.<br><small>${err.message}</small><br>` +
      `<small>Run <code>python tools/generate_data.py</code> and serve over http.</small></p>`;
    console.error(err);
  }
}

function recomputeEffective() {
  for (const m of state.all) m._eff = computeEffective(m, state.weights, state.statMode);
}

// ---------------------------------------------------------------- render
// Roster pins: pinned mons render on top (current sort applied), ignoring every filter.
const PINS_KEY = "pc-pins";
function loadPins() {
  try {
    state.pinned = new Set(JSON.parse(localStorage.getItem(PINS_KEY) || "[]")
      .filter((s) => state.bySlug.has(s)));
  } catch { state.pinned = new Set(); }
}
const savePins = () => { try { localStorage.setItem(PINS_KEY, JSON.stringify([...state.pinned])); } catch { /* ignore */ } };
function togglePin(slug) {
  state.pinned.has(slug) ? state.pinned.delete(slug) : state.pinned.add(slug);
  savePins();
  render();
}

function render() {
  const filtered = applyFilters(state.all, state.filters);
  const sorted = sortMons(filtered, state.sort);
  const pinned = sortMons(state.all.filter((m) => state.pinned.has(m.slug)), state.sort);
  const unpinned = pinned.length ? sorted.filter((m) => !state.pinned.has(m.slug)) : sorted;
  const cmp = new Set(state.compare);
  const max = statScaleMax(state.statMode);
  const teamSet = new Set(state.team.map((t) => t.slug));
  const body = state.view === "table"
    ? renderTable(sorted, state.sort, cmp, max, state.extras, pinned, teamSet)
    : renderGrid(unpinned, cmp, max, pinned, teamSet);
  // friendly prompt instead of a blank pane when filters/search exclude everything
  const empty = sorted.length === 0
    ? `<p class="empty">No Pokémon match these filters. <button data-clear-all>Clear all</button></p>` : "";
  $("#results").innerHTML = renderActiveFilters(state.filters) + body + empty;
  $("#result-count").textContent = `${sorted.length} Pokémon`;
  const n = activeFilterCount(state.filters);
  const badge = $("#filter-badge");
  badge.textContent = n;
  badge.style.display = n ? "inline-flex" : "none";
}

// ---------------------------------------------------------------- toolbar
function buildToolbar() {
  const sortKeys = [
    ["cleaned", "Cleaned total"], ["bst", "BST"], ["wasted", "Wasted stats"],
    ...STAT_KEYS.map((k) => [k, STAT_LABELS[k]]),
    ["ehpMixed", "eHP (mixed)"], ["ehpPhys", "Phys eHP"], ["ehpSpec", "Spec eHP"],
    ["weight", "Weight"], ["usagePct", "Usage %"],
    ["name", "Name"],
  ];
  $("#sort-key").innerHTML = sortKeys
    .map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("#sort-key").value = state.sort.key;
  $("#sort-key").addEventListener("change", (e) => {
    state.sort.key = e.target.value; render();
  });
  const xb = $("#tb-extras");
  xb.classList.toggle("active", state.extras);
  xb.addEventListener("click", () => {
    state.extras = !state.extras;
    try { localStorage.setItem("pc-extra-cols", state.extras ? "1" : "0"); } catch { /* ignore */ }
    xb.classList.toggle("active", state.extras);
    render();
  });
  $("#sort-dir").addEventListener("click", () => {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    $("#sort-dir").textContent = state.sort.dir === "asc" ? "▲ Asc" : "▼ Desc";
    render();
  });

  $("#search").addEventListener("input", (e) => {
    state.filters.search = e.target.value; render();
  });

  $("#view-table").addEventListener("click", () => setView("table"));
  $("#view-grid").addEventListener("click", () => setView("grid"));

  $$(".mega-seg button").forEach((b) => b.addEventListener("click", () => {
    state.filters.mega = b.dataset.mega;
    $$(".mega-seg button").forEach((x) => x.classList.toggle("active", x === b));
    render();
  }));

  $$(".stat-seg button").forEach((b) => b.addEventListener("click", () => {
    state.statMode = b.dataset.statmode;
    $$(".stat-seg button").forEach((x) => x.classList.toggle("active", x === b));
    recomputeEffective();
    render();
    if (state.selected) openDetail(state.selected);
  }));

  $("#btn-filters").addEventListener("click", () => toggleFilters());
  $("#filters-close").addEventListener("click", () => toggleFilters(false));
  $("#filters-backdrop").addEventListener("click", () => toggleFilters(false));
}

// Filters drawer (mobile/tablet): open with a dimmed backdrop; close on ✕, backdrop tap, or Escape.
function toggleFilters(force) {
  const open = force === undefined ? !$("#filters").classList.contains("open") : force;
  $("#filters").classList.toggle("open", open);
  $("#filters-backdrop").hidden = !open;
}

// The roster table has 12+ columns and can't fit a phone, so default to the card
// (grid) view on small screens and switch automatically when crossing the breakpoint.
function setupMobileView() {
  const mq = window.matchMedia("(max-width: 640px)");
  if (mq.matches) setView("grid", true);   // init render() runs right after
  mq.addEventListener("change", (e) => setView(e.matches ? "grid" : "table"));
}

function setView(v, skipRender) {
  state.view = v;
  $("#view-table").classList.toggle("active", v === "table");
  $("#view-grid").classList.toggle("active", v === "grid");
  if (skipRender) return;
  render();
}

const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- filters
function buildFilters() {
  // type chips (cycle: off -> include -> exclude -> off)
  $("#f-types").innerHTML = TYPES.map((t) =>
    `<button class="chip type-chip" data-type="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`
  ).join("");
  $$("#f-types .type-chip").forEach((b) =>
    b.addEventListener("click", () => cycleType(b.dataset.type, b)));

  // role chips
  $("#f-roles").innerHTML = Object.entries(ROLE_META).map(([k, v]) =>
    `<button class="chip role-chip ${v.cls}" data-role="${k}">${v.label}</button>`).join("");
  $$("#f-roles .role-chip").forEach((b) => b.addEventListener("click", () => {
    toggleSet(state.filters.roles, b.dataset.role, b); render();
  }));

  // generation chips
  const gens = [...new Set(state.all.map((m) => m.gen))].sort((a, b) => a - b);
  $("#f-gens").innerHTML = gens.map((g) =>
    `<button class="chip gen-chip" data-gen="${g}">${GEN_LABEL(g)}</button>`).join("");
  $$("#f-gens .gen-chip").forEach((b) => b.addEventListener("click", () => {
    toggleSet(state.filters.gens, Number(b.dataset.gen), b); render();
  }));

  // ability + move filters: click/Enter a suggestion to add it (icon dropdown — never auto-commits mid-typing,
  // so e.g. typing "trick" stays put until you pick Trick Room instead of snapping to the move Trick)
  const abils = Object.entries(state.data.abilities)
    .map(([slug, a]) => ({ slug, ...a })).sort((a, b) => a.name.localeCompare(b.name));
  attachAutocomplete($("#f-ability"), {
    items: () => abils.filter((a) => !state.filters.abilities.has(a.slug))
      .map((a) => ({ value: a.slug, name: a.name, meta: a.count != null ? `${a.count}` : "" })),
    onPick: (slug) => { state.filters.abilities.add(slug); renderAbilityChips(); render(); },
  });
  $("#ability-chips").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-ability-remove]");
    if (rm) { state.filters.abilities.delete(rm.dataset.abilityRemove); renderAbilityChips(); render(); }
  });

  const moves = Object.entries(state.data.moves)
    .map(([id, m]) => ({ id: Number(id), ...m })).sort((a, b) => a.name.localeCompare(b.name));
  state.moveByName = new Map(moves.map((m) => [m.name.toLowerCase(), m.id]));   // also parses shared-team codes
  attachAutocomplete($("#f-move"), {
    items: () => moves.filter((m) => !state.filters.moves.has(m.id))
      .map((m) => ({ value: m.id, name: m.name, icon: m.type ? `<span class="type tiny" style="background:${TYPE_COLORS[m.type]}">${m.type}</span>` : "", meta: m.count != null ? `${m.count}` : "" })),
    onPick: (id) => { state.filters.moves.add(id); renderMoveChips(); render(); },
  });
  $("#move-chips").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-move-remove]");
    if (rm) { state.filters.moves.delete(Number(rm.dataset.moveRemove)); renderMoveChips(); render(); }
  });

  // stat range inputs
  const ranges = [["cleaned", "Cleaned"], ["bst", "BST"],
    ...STAT_KEYS.map((k) => [k, STAT_LABELS[k]])];
  $("#f-stats").innerHTML = ranges.map(([k, l]) => `<div class="range-row">
    <label>${l}</label>
    <input type="number" class="rng" data-stat="${k}" data-bound="min" placeholder="min" min="0">
    <input type="number" class="rng" data-stat="${k}" data-bound="max" placeholder="max" min="0">
  </div>`).join("");
  $$("#f-stats .rng").forEach((inp) => inp.addEventListener("input", () => {
    const { stat, bound } = inp.dataset;
    const v = inp.value === "" ? null : Number(inp.value);
    const tgt = bound === "min" ? state.filters.statMin : state.filters.statMax;
    if (v == null) delete tgt[stat]; else tgt[stat] = v;
    render();
  }));

  // available toggle + reset
  $("#f-available").checked = state.filters.availableOnly;
  $("#f-available").addEventListener("change", (e) => {
    state.filters.availableOnly = e.target.checked; render();
  });
  $("#btn-reset").addEventListener("click", resetFilters);
}

function renderAbilityChips() {
  $("#ability-chips").innerHTML = [...state.filters.abilities].map((slug) => {
    const a = state.data.abilities[slug] || { name: slug, count: 0 };
    return `<span class="fchip"><span>${a.name}</span><small>${a.count}</small>` +
      `<button data-ability-remove="${slug}" aria-label="Remove">✕</button></span>`;
  }).join("");
}

function renderMoveChips() {
  $("#move-chips").innerHTML = [...state.filters.moves].map((id) => {
    const m = state.data.moves[id] || { name: `#${id}`, count: 0 };
    return `<span class="fchip"><span>${m.name}</span><small>${m.count}</small>` +
      `<button data-move-remove="${id}" aria-label="Remove">✕</button></span>`;
  }).join("");
}

function cycleType(t, btn) {
  const inc = state.filters.typesInclude;
  if (inc.has(t)) { inc.delete(t); btn.classList.remove("inc"); }
  else { inc.add(t); btn.classList.add("inc"); }
  render();
}

function toggleSet(set, val, btn) {
  if (set.has(val)) { set.delete(val); btn.classList.remove("on"); }
  else { set.add(val); btn.classList.add("on"); }
}

function resetFilters() {
  state.filters = createFilterState();
  $("#f-ability").value = "";
  syncFilterControls();
  render();
}

// Push the current state.filters back onto every sidebar control's visuals (used
// after Reset and after removing an active-filter chip).
function syncFilterControls() {
  const f = state.filters;
  $("#search").value = f.search;
  $("#f-available").checked = f.availableOnly;
  $$("#f-types .type-chip").forEach((b) => b.classList.toggle("inc", f.typesInclude.has(b.dataset.type)));
  $$("#f-roles .role-chip").forEach((b) => b.classList.toggle("on", f.roles.has(b.dataset.role)));
  $$("#f-gens .gen-chip").forEach((b) => b.classList.toggle("on", f.gens.has(Number(b.dataset.gen))));
  $$("#f-stats .rng").forEach((inp) => {
    const tgt = inp.dataset.bound === "min" ? f.statMin : f.statMax;
    inp.value = tgt[inp.dataset.stat] ?? "";
  });
  $("#f-move").value = "";
  $$(".mega-seg button").forEach((b) => b.classList.toggle("active", b.dataset.mega === f.mega));
  renderAbilityChips();
  renderMoveChips();
}

// A removable chip per active filter, shown above the results.
const capFirst = (s) => s[0].toUpperCase() + s.slice(1);
function renderActiveFilters(f) {
  const chips = [];
  const add = (token, label) => chips.push(
    `<button class="af-chip" data-rmfilter="${token}" title="Remove this filter">${label}<span class="af-x">✕</span></button>`);
  const rangeLab = (k) => STAT_LABELS[k] || (k === "bst" ? "BST" : k === "cleaned" ? "Cleaned" : k);
  if (f.search) add("search", `“${f.search}”`);
  for (const t of f.typesInclude) add(`type:${t}`, capFirst(t));
  if (f.mega === "only") add("mega:only", "Only Mega");
  if (f.mega === "all") add("mega:all", "All forms");
  for (const r of f.roles) add(`role:${r}`, ROLE_META[r].label);
  for (const g of f.gens) add(`gen:${g}`, GEN_LABEL(g));
  for (const slug of f.abilities) add(`ability:${slug}`, state.data.abilities[slug]?.name || slug);
  for (const id of f.moves) add(`move:${id}`, `learns ${state.data.moves[id]?.name || "move"}`);
  if (!f.availableOnly) add("available", "incl. unobtainable");
  for (const k in f.statMin) add(`min:${k}`, `${rangeLab(k)} ≥ ${f.statMin[k]}`);
  for (const k in f.statMax) add(`max:${k}`, `${rangeLab(k)} ≤ ${f.statMax[k]}`);
  if (!chips.length) return "";
  return `<div class="active-filters"><span class="af-lab">Filters</span>${chips.join("")}` +
    `<button class="af-clear" data-clear-all>Clear all</button></div>`;
}

function removeFilter(token) {
  const f = state.filters;
  const i = token.indexOf(":");
  const kind = i < 0 ? token : token.slice(0, i);
  const val = i < 0 ? "" : token.slice(i + 1);
  if (kind === "search") f.search = "";
  else if (kind === "type") f.typesInclude.delete(val);
  else if (kind === "role") f.roles.delete(val);
  else if (kind === "gen") f.gens.delete(Number(val));
  else if (kind === "ability") f.abilities.delete(val);
  else if (kind === "move") f.moves.delete(Number(val));
  else if (kind === "mega") f.mega = "hide";
  else if (kind === "available") f.availableOnly = true;
  else if (kind === "min") delete f.statMin[val];
  else if (kind === "max") delete f.statMax[val];
  syncFilterControls();
  render();
}

// ---------------------------------------------------------------- weights
// Simple presets (in the filter rail) that drive the underlying weight model.
function syncWeightUI() {
  $("#wt-atk").checked = state.weights.wasteLowerAtk;
  $("#wt-spe").checked = state.weights.wasteLowSpeed;
  $("#wt-cap").value = state.weights.speedCap;
  $("#wt-cap-val").textContent = state.weights.speedCap;
  $(".wt-speed").classList.toggle("disabled", !state.weights.wasteLowSpeed);
}

function buildWeights() {
  const toggle = $("#wt-toggle"), panel = $("#wt-panel");
  toggle.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.querySelector(".wt-caret").textContent = opening ? "▾" : "▸";
  });
  $("#wt-atk").addEventListener("change", (e) => {
    state.weights.wasteLowerAtk = e.target.checked; applyWeights();
  });
  $("#wt-spe").addEventListener("change", (e) => {
    state.weights.wasteLowSpeed = e.target.checked; syncWeightUI(); applyWeights();
  });
  $("#wt-cap").addEventListener("input", (e) => {
    state.weights.speedCap = Number(e.target.value); syncWeightUI(); applyWeights();
  });
  syncWeightUI();
}

function applyWeights() {
  recomputeEffective();
  render();
  if (state.selected) openDetail(state.selected); // refresh open panel
}

// ---------------------------------------------------------------- detail
let detailReturnFocus = null;
function openDetail(slug, { requestTeams = true } = {}) {
  const mon = state.bySlug.get(slug);
  if (!mon) return;
  const wasOpen = $("#detail").classList.contains("open");
  if (!wasOpen) detailReturnFocus = document.activeElement;
  if (requestTeams && state.detailTab === "teams" && state.data.tournamentMeta && !state.metaTeamsRequested && !state.data.tournamentTeams) {
    state.metaTeamsRequested = true;
    loadTournamentTeams(state.data).then(() => {
      state.metaTeamsRequested = false;
      // Render success/error without immediately starting another fetch. A later
      // detail open can retry a failure; concurrent opens share the same request.
      if (state.selected && $("#detail").classList.contains("open")) openDetail(state.selected, { requestTeams: false });
    });
  }
  const prev = state.bySlug.get(state.selected);
  if (slug !== state.selected) { state.spread = emptySpread(); state.spreadNature = null; state.metaLimits = {}; state.metaTeamId = null; state.metaTeamKind = null; }
  if (!prev || prev.dex !== mon.dex) state.detailShiny = false; // reset shiny only for a new species (keep across base⇄mega)
  state.selected = slug;
  const sameMon = prev?.slug === slug, scroll = $("#detail").scrollTop;
  const focusId = $("#detail").contains(document.activeElement) ? document.activeElement.id : null;
  $("#detail-body").innerHTML = renderDetail(mon, { ...state, pinned: state.pinned });
  $("#detail").scrollTop = sameMon ? scroll : 0;
  $("#detail").classList.add("open");
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  else if (!wasOpen) $(`#detail-tab-${state.detailTab}`)?.focus({ preventScroll: true });
  syncCmpButtons();
  syncTeamButtons();
  filterDetailMoves(); // apply the default (type-grouped) move ordering
}

// keep the detail header's labeled Pin button in sync (roster pins are icon-only, unaffected)
function syncPinButtons() {
  document.querySelectorAll("[data-pin][data-pin-icon]").forEach((b) => {
    const on = state.pinned.has(b.dataset.pin);
    b.classList.toggle("on", on);
    b.textContent = on ? "📌 Pinned" : "📌 Pin";
  });
}

function toggleDetailShiny() {
  state.detailShiny = !state.detailShiny;
  if (state.selected) openDetail(state.selected);
}

// --- eHP stat-point lab (inside the detail panel) ---
// Points available for stat k = the pool minus everything spent on the other stats.
const clampPts = (k, v) => Math.max(0, Math.min(v, CAP, POOL - (pointsUsed(state.spread) - (state.spread[k] || 0))));
// One live update for every interaction — refreshes eHP cards + pool + every row
// from state.spread without rebuilding the DOM (inputs keep focus).
function tickLab() {
  const mon = state.bySlug.get(state.selected);
  if (mon) tickStatLab($("#detail"), mon, state.spread, state.spreadNature);
}

function closeDetail() {
  state.selected = null;
  $("#detail").classList.remove("open");
  if (detailReturnFocus?.isConnected) detailReturnFocus.focus({ preventScroll: true });
}

function browseMovesOf(slug) {
  const mon = state.bySlug.get(slug);
  if (!mon) return;
  closeDetail();
  browseMonsInMoves([mon]);
}

// Popup listing a set of Pokémon (used by the Coverage tab's clickable counts).
function openMonListPopup(title, mons) {
  const sprites = mons.map((m) =>
    `<img class="lr" loading="lazy" alt="" title="${m._display}" data-slug="${m.slug}" src="${m.sprite || m.artwork || ""}">`).join("")
    || "<span class='muted'>none</span>";
  $("#popup-body").innerHTML = `<div class="info-card">
    <button class="detail-close" data-close-popup aria-label="Close">✕</button>
    <div class="info-head"><h3>${title}</h3><span class="rarity r-common">${mons.length}</span></div>
    <div class="info-learners">${sprites}</div></div>`;
  $("#popup").classList.add("open");
}

// Live filter/sort of a Pokemon's move list (sortable mini-table in the detail panel).
function filterDetailMoves() {
  const root = $("#detail");
  const table = root.querySelector(".dm-table"), tbody = root.querySelector(".mv-list");
  if (!tbody) return;
  const q = (root.querySelector(".mv-search")?.value || "").trim().toLowerCase();
  const key = table.dataset.dsort, dir = table.dataset.ddir, sign = dir === "asc" ? 1 : -1;
  table.querySelectorAll("th[data-dsort]").forEach((th) => {
    const on = th.dataset.dsort === key;
    th.classList.toggle("active", on);
    th.dataset.arrow = on ? (dir === "asc" ? " ▲" : " ▼") : "";
  });
  const rows = [...tbody.querySelectorAll(".mv-row")];
  rows.forEach((r) => { r.style.display = (!q || r.dataset.name.includes(q)) ? "" : "none"; });
  const num = (r, k) => Number(r.dataset[k]);
  const base = key === "name" || key === "type" || key === "class"
    ? (a, b) => a.dataset[key].localeCompare(b.dataset[key])
    : (a, b) => num(a, key) - num(b, key);
  rows.sort((a, b) => sign * base(a, b) || num(b, "power") - num(a, "power"))
    .forEach((r) => tbody.appendChild(r));
}

function detailSort(th) {
  const table = th.closest(".dm-table"), k = th.dataset.dsort;
  if (table.dataset.dsort === k) {
    table.dataset.ddir = table.dataset.ddir === "asc" ? "desc" : "asc";
  } else {
    table.dataset.dsort = k;
    table.dataset.ddir = k === "power" || k === "count" ? "desc" : "asc";
  }
  filterDetailMoves();
}

// ---------------------------------------------------------------- move/ability popups
function moveLearners(id) { return state.all.filter((m) => m.moves.includes(id)); }
function abilityLearners(slug) { return state.all.filter((m) => m.abilities.some((a) => a.slug === slug)); }

function openMovePopup(id) {
  const mv = { id, ...state.data.moves[id] };
  $("#popup-body").innerHTML = renderMovePopup(mv, moveLearners(id), state.data.total);
  $("#popup").classList.add("open");
}
function openAbilityPopup(slug) {
  const ab = { slug, ...state.data.abilities[slug] };
  $("#popup-body").innerHTML = renderAbilityPopup(ab, abilityLearners(slug), state.data.total);
  $("#popup").classList.add("open");
}
const closePopup = () => $("#popup").classList.remove("open");

// ---------------------------------------------------------------- compare
function toggleCompare(slug) {
  const i = state.compare.indexOf(slug);
  if (i >= 0) state.compare.splice(i, 1);
  else if (state.compare.length < 4) state.compare.push(slug);
  render();
  renderCompareBar();
  syncCmpButtons();
}
function syncCmpButtons() {
  document.querySelectorAll("[data-cmp]").forEach((b) => {
    const on = state.compare.includes(b.dataset.cmp);
    b.classList.toggle("on", on);
    if (b.hasAttribute("data-cmp-icon")) b.textContent = on ? "✓ In compare" : "＋ Compare";
  });
}
function syncCmpBarH() {
  const bar = $("#compare-bar");
  document.documentElement.style.setProperty("--cmpbar-h", (bar.hidden ? 0 : bar.offsetHeight) + "px");
}
function renderCompareBar() {
  const bar = $("#compare-bar");
  if (!state.compare.length) { bar.hidden = true; bar.innerHTML = ""; syncCmpBarH(); return; }
  bar.hidden = false;
  const chips = state.compare.map((slug) => {
    const m = state.bySlug.get(slug);
    return `<span class="cmp-chip"><img src="${m.sprite || ""}" alt=""><span>${m._display}</span>` +
      `<button data-cmp-remove="${slug}" aria-label="Remove">✕</button></span>`;
  }).join("");
  bar.innerHTML = `<div class="cmp-chips">${chips}</div>
    <div class="cmp-actions">
      <button class="btn-sm" data-cmp-clear>Clear</button>
      <button class="btn accent" data-cmp-open ${state.compare.length < 2 ? "disabled" : ""}>Compare ${state.compare.length}</button>
    </div>`;
  syncCmpBarH();
}
function openCompare() {
  if (state.compare.length < 2) return;
  if (!state.compare.includes(state.compareAnchor)) state.compareAnchor = state.compare[0];
  const mons = state.compare.map((s) => state.bySlug.get(s));
  $("#compare-body").innerHTML = renderCompare(mons, state.data, statScaleMax(state.statMode), state.compareAnchor, state.cmpMoves);
  $("#compare").classList.add("open");
}
const closeCompare = () => $("#compare").classList.remove("open");

// ---------------------------------------------------------------- team
const TEAM_KEY = "pc-team";       // working team
const TEAMS_KEY = "pc-teams";     // saved teams

// Coerce stored and imported members while upgrading legacy teams to four battle picks.
function normMember(m, index = 0) {
  const slug = typeof m === "string" ? m : m && m.slug;
  if (!slug || !state.bySlug.has(slug)) return null;
  const mon = state.bySlug.get(slug);
  const moves = (m && Array.isArray(m.moves) ? m.moves : [])
    .filter((id) => state.data.moves[id]).slice(0, 4);
  let ability = m && typeof m === "object" && "ability" in m ? m.ability : undefined;
  if (ability === undefined) ability = defaultRosterAbility(mon);
  else if (ability !== null && !rosterAbilities(mon).includes(ability)) ability = defaultRosterAbility(mon);
  const picked = m && typeof m === "object" && typeof m.picked === "boolean"
    ? m.picked
    : index < 4;
  return { slug, moves, ability, picked, item: normalizeItem(m?.item, mon),
    nature: NATURES.includes(m?.nature) ? m.nature : null, spread: validSpread(m?.spread) ? { ...m.spread } : null,
    ...(m?.sourceAbility ? { sourceAbility: m.sourceAbility } : {}), ...(m?.sourceItem ? { sourceItem: m.sourceItem } : {}) };
}
function capBattlePicks(members) {
  let picked = 0;
  return members.map((member) => {
    if (!member.picked) return member;
    picked += 1;
    return picked <= 4 ? member : { ...member, picked: false };
  });
}
function defaultBattlePicks(members) {
  return members.map((member, index) => ({ ...member, picked: index < 4 }));
}
function hasExplicitBattlePicks(members) {
  return members.some((member) => member && typeof member === "object" && typeof member.picked === "boolean");
}
function loadTeam() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAM_KEY) || "[]");
    const members = arr.map(normMember).filter(Boolean).slice(0, TEAM_MAX);
    state.team = capBattlePicks(hasExplicitBattlePicks(arr) ? members : defaultBattlePicks(members));
    saveTeam();  // upgrade legacy string-array storage to the {slug,moves} format
  } catch { state.team = []; }
}
function saveTeam() { try {
  localStorage.setItem(TEAM_KEY, JSON.stringify(state.team));
} catch { /* ignore */ } }
function saveTeamContext() { try { localStorage.setItem("pc-team-context", JSON.stringify(state.teamContext)); } catch { /* ignore */ } }
function loadSavedTeams() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAMS_KEY) || "[]");
    state.savedTeams = migrateSavedTeams(arr).map((t) => {
      const rawMembers = t.members || [];
      const members = rawMembers.map(normMember).filter(Boolean).slice(0, TEAM_MAX);
      return {
        ...t,
        id: t.id,
        name: String(t.name || "Team"),
        members: capBattlePicks(hasExplicitBattlePicks(rawMembers) ? members : defaultBattlePicks(members)),
      };
    });
    if (JSON.stringify(arr) !== JSON.stringify(state.savedTeams)) persistSavedTeams();
  } catch { state.savedTeams = []; state.savedTeamsReadError = true; state.teamNotice = "Saved-team data could not be read. The original storage was left untouched; saving is blocked until it is recovered."; }
}

function switchDetailTab(tab) {
  if (!DETAIL_TABS.includes(tab)) return;
  state.detailTab = tab;
  openDetail(state.selected);
  $("#detail").scrollTop = 0;
  $(`#detail-tab-${tab}`)?.focus({ preventScroll: true });
}

function backToPublishedTeams() {
  const id = state.metaTeamId;
  state.metaTeamId = null;
  openDetail(state.selected);
  const trigger = [...document.querySelectorAll("[data-meta-open-team]")].find(el => el.dataset.metaOpenTeam === id);
  trigger?.focus();
}
function persistSavedTeams(records = state.savedTeams) {
  if (state.savedTeamsReadError) return false;
  try { localStorage.setItem(TEAMS_KEY, JSON.stringify(records)); return true; }
  catch { state.teamNotice = "Could not save teams to browser storage. Your previously saved teams were not replaced."; return false; }
}

function teamAfterChange() { saveTeam(); saveTeamContext(); if (teamInited) renderTeam(); syncTeamButtons(); }

function toggleTeam(slug) {
  const i = state.team.findIndex((t) => t.slug === slug);
  if (i >= 0) state.team.splice(i, 1);
  else if (state.team.length < TEAM_MAX) state.team.push({
    slug,
    moves: [],
    ability: defaultRosterAbility(state.bySlug.get(slug)),
    item: normalizeItem("none", state.bySlug.get(slug)),
    picked: state.team.length < 4,
  });
  teamAfterChange();
}
function setTeamScope(scope) {
  state.teamScope = scope === "battle" ? "battle" : "full";
  if (teamInited) renderTeam();
}
function toggleBattlePick(slug) {
  const member = state.team.find((entry) => entry.slug === slug);
  if (!member) return;
  if (!member.picked && state.team.filter((entry) => entry.picked).length >= 4) return;
  member.picked = !member.picked;
  state.teamScope = "battle";
  teamAfterChange();
}
function setMemberAbility(slug, ability) {
  const t = state.team.find((x) => x.slug === slug);
  if (!t) return;
  t.ability = ability === "null" ? null : ability;
  teamAfterChange();
}
function addMove(slug, id) {
  const t = state.team.find((x) => x.slug === slug);
  const mon = state.bySlug.get(slug);
  if (!t || !mon || !mon.moves.includes(id) || t.moves.includes(id) || t.moves.length >= 4) return;
  t.moves.push(id);
  teamAfterChange();
}
function removeMove(slug, id) {
  const t = state.team.find((x) => x.slug === slug);
  if (!t) return;
  t.moves = t.moves.filter((m) => m !== id);
  teamAfterChange();
}
function clearTeam() { state.team = []; state.teamContext = emptyTeamContext(); state.teamNotice = ""; state.teamScope = "full"; teamAfterChange(); }
function saveWorkingTeam(name) {
  if (state.savedTeamsReadError) { state.teamNotice = "Saving is blocked because saved-team storage could not be read. The original data was left untouched."; renderTeam(); return; }
  state.teamContext.name = name || "";
  const result = saveTeamRecord(state.savedTeams, state.teamContext, state.team);
  if (result.error) { state.teamNotice = result.error; renderTeam(); return; }
  if (!persistSavedTeams(result.records)) { renderTeam(); return; }
  state.savedTeams = result.records;
  state.teamContext = result.context;
  state.teamNotice = `Team ${result.action}: ${result.context.name}`;
  saveTeamContext();
  renderTeam();
}
function loadSavedTeam(id) {
  const t = state.savedTeams.find((x) => x.id === id);
  if (!t) return;
  state.team = capBattlePicks(structuredClone(t.members).slice(0, TEAM_MAX));
  state.teamContext = { loadedId: t.id, originalName: t.name, name: t.name };
  state.teamNotice = "";
  state.teamScope = "full";
  teamAfterChange();
}
function deleteSavedTeam(id) {
  const remaining = state.savedTeams.filter((x) => x.id !== id);
  if (!persistSavedTeams(remaining)) { renderTeam(); return; }
  state.savedTeams = remaining;
  if (state.teamContext.loadedId === id) state.teamContext = emptyTeamContext(state.teamContext.name);
  saveTeamContext();
  renderTeam();
}

// ---- team sharing: a SHORT code in the URL (works across browsers/PCs, no server) ----
// v4: `4|<name>|pid36.abIdx.pick.item-slug.m36...` preserves held items.
// Pokemon use stable PokeAPI ids and moves use ids pinned in tools/move_ids.json.
// v1 (base64 JSON) and v2 links still decode so existing shared teams keep working.
const byPid = () => {
  if (!state.byPid) state.byPid = new Map(state.all.map((m) => [m.id, m]));
  return state.byPid;
};
function encodeTeam(name, members) {
  const exact = members.some((t) => t.nature || t.spread);
  const mons = members.map((t) => {
    const mon = state.bySlug.get(t.slug);
    if (!mon) return null;
    const ab = t.ability ? (mon.abilities || []).findIndex((a) => a.slug === t.ability) : -1;
    return [
      mon.id.toString(36),
      ab >= 0 ? String(ab) : "",
      t.picked === false ? "0" : "1",
      normalizeItem(t.item, mon),
      ...(exact ? [t.nature || "", t.spread ? SET_STATS.map((k) => t.spread[k]).join("-") : ""] : []),
      ...(t.moves || []).map((id) => Number(id).toString(36)),
    ].join(".");
  }).filter(Boolean);
  return `${exact ? 5 : 4}|${encodeURIComponent(name || "Shared team")}|${mons.join("|")}`;
}
const teamShareUrl = (code) => `${location.origin}${location.pathname}#t=${code}`;
// → { name, members, dropped: [names…] } or null when the code is unusable.
function decodeTeam(codeOrUrl) {
  try {
    let code = codeOrUrl.trim();
    const h = code.match(/#(?:t|team)=(.+)$/);
    if (h) code = h[1];
    if (["5|", "4|", "3|", "2|"].some((prefix) => code.startsWith(prefix))) {
      const version = code[0];
      const parts = code.split("|");
      const name = decodeURIComponent(parts[1] || "").slice(0, 160) || "Shared team";
      const dropped = [];
      let members = parts.slice(2, 2 + TEAM_MAX).map((seg, index) => {
        const fields = seg.split(".");
        const [pid36, ab] = fields;
        const picked = version !== "2" ? fields[2] !== "0" : index < 4;
        const item = ["4", "5"].includes(version) ? fields[3] : "none";
        const nature = version === "5" ? fields[4] || null : null;
        const values = version === "5" && fields[5] ? fields[5].split("-").map(Number) : null;
        const spread = values?.length === 6 ? Object.fromEntries(SET_STATS.map((k, i) => [k, values[i]])) : null;
        if (version === "5" && ((fields[5] && !validSpread(spread)) || (nature && !NATURES.includes(nature)))) {
          dropped.push(`slot ${index + 1}: invalid Nature or Stat Points`); return null;
        }
        const mv36 = fields.slice(version === "5" ? 6 : version === "4" ? 4 : version === "3" ? 3 : 2);
        const mon = byPid().get(parseInt(pid36, 36));
        if (!mon) { dropped.push("#" + pid36); return null; }
        const moves = mv36.map((x) => parseInt(x, 36)).filter((id) => state.data.moves[id] != null);
        if (moves.length < mv36.length) dropped.push(`${mon._display}: a move`);
        const abil = ab === "" ? null : mon.abilities?.[Number(ab)]?.slug;
        return normMember({ slug: mon.slug, moves, ability: abil, picked, item, nature, spread }, index);
      }).filter(Boolean);
      if (version === "2") members = defaultBattlePicks(members);
      return members.length ? { name, members, dropped } : null;
    }
    // legacy v1: base64url JSON { n, m: [{ s, a, v: [moveNames] }] }
    const d = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!Array.isArray(d.m)) return null;
    const dropped = [];
    const members = defaultBattlePicks(d.m.slice(0, TEAM_MAX).map((e, index) => {
      if (!state.bySlug.has(e.s)) { dropped.push(e.s); return null; }
      const moves = (Array.isArray(e.v) ? e.v : [])
        .map((nm) => { const id = state.moveByName.get(String(nm).toLowerCase()); if (id == null) dropped.push(nm); return id; })
        .filter((id) => id != null);
      return normMember({ slug: e.s, moves, ability: e.a ?? undefined }, index);
    }).filter(Boolean));
    if (!members.length) return null;
    return { name: String(d.n || "Shared team").slice(0, 30), members, dropped };
  } catch { return null; }
}
function importTeam(codeOrUrl) {
  state.sharePanel = null;
  const t = decodeTeam(codeOrUrl);
  if (!t) { state.teamNotice = "⚠ Couldn't read that team code."; if (teamInited) renderTeam(); return; }
  state.team = capBattlePicks(t.members);
  state.teamScope = "full";
  state.teamContext = emptyTeamContext(t.name);
  state.teamNotice = `✓ Imported “${t.name}” — ${t.members.length} Pokémon · unsaved; press Save to keep a named copy` +
    (t.dropped.length ? ` · dropped (unknown here): ${t.dropped.join(", ")}` : "");
  teamAfterChange();
}
// open the share panel with the short link (copying happens via its button)
function shareTeam(name, members) {
  state.sharePanel = { name: name || "My team", url: teamShareUrl(encodeTeam(name, members)) };
  state.teamNotice = "";
  if (teamInited) renderTeam();
}

function renderTeam() {
  const team = state.team
    .map((t) => ({
      mon: state.bySlug.get(t.slug), moveIds: t.moves, ability: t.ability, picked: t.picked, item: t.item, nature: t.nature, spread: t.spread,
    }))
    .filter((x) => x.mon);
  renderTeamView($("#team-results"), { data: state.data, team, savedTeams: state.savedTeams,
    notice: state.teamNotice, share: state.sharePanel, analysisScope: state.teamScope, teamContext: state.teamContext });
  attachTeamAutocompletes();
}
function syncTeamButtons() {
  document.querySelectorAll("[data-team]").forEach((b) => {
    const on = state.team.some((t) => t.slug === b.dataset.team);
    b.classList.toggle("on", on);
    if (b.hasAttribute("data-team-icon")) b.textContent = on ? "✓ In team" : "＋ Team";
    else if (b.classList.contains("team-add")) { b.textContent = on ? "✓" : "＋T"; b.title = on ? "In your team" : "Add to team"; }
  });
}

// Wire the icon dropdowns after each team render (inputs are freshly created).
let teamDetachers = [];
function attachTeamAutocompletes() {
  teamDetachers.forEach((d) => d());
  teamDetachers = [];
  const add = $("#team-results .team-add");
  if (add && !add.disabled) {
    teamDetachers.push(attachAutocomplete(add, {
      items: () => state.all
        .filter((m) => m.available !== false && !state.team.some((t) => t.slug === m.slug))
        .map((m) => ({ value: m.slug, name: m._display,
          icon: `<img src="${m.sprite || m.artwork || ""}" alt="">` })),
      onPick: toggleTeam,
    }));
  }
  $$("#team-results .tm-move-add").forEach((inp) => {
    const slug = inp.dataset.slug;
    const mon = state.bySlug.get(slug);
    if (!mon) return;
    const chosen = new Set(state.team.find((t) => t.slug === slug)?.moves || []);
    teamDetachers.push(attachAutocomplete(inp, {
      items: () => mon.moves
        .map((id) => ({ id, mv: state.data.moves[id] }))
        .filter((x) => x.mv && !chosen.has(x.id))
        .map((x) => ({ value: x.id, name: x.mv.name,
          icon: x.mv.type ? `<span class="type tiny" style="background:${TYPE_COLORS[x.mv.type]}">${x.mv.type}</span>` : "" })),
      onPick: (id) => addMove(slug, Number(id)),
    }));
  });
}

// ---------------------------------------------------------------- global events
function bindGlobal() {
  $("#detail").addEventListener("change", (e) => {
    if (e.target.matches("[data-meta-regulation]")) {
      selectMetaDataset(state.data, e.target.value); state.metaLimits = {}; state.metaTeamId = null; state.metaTeamKind = null; openDetail(state.selected); render();
    }
    if (e.target.matches("[data-lab-nature]")) { state.spreadNature = e.target.value || null; tickLab(); }
  });
  $("#detail").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-detail-tab]");
    if (tab) { switchDetailTab(tab.dataset.detailTab); return; }
    const kind = e.target.closest("[data-meta-team-kind]");
    if (kind) { state.metaTeamKind = kind.dataset.metaTeamKind; state.metaTeamId = null; openDetail(state.selected); $(`[data-meta-team-kind="${state.metaTeamKind}"]`)?.focus({ preventScroll: true }); return; }
    const teamOpen = e.target.closest("[data-meta-open-team]");
    if (teamOpen) { state.metaTeamId = teamOpen.dataset.metaOpenTeam; openDetail(state.selected); $("#detail").scrollTop = 0; $("#published-team-title")?.focus({ preventScroll: true }); return; }
    if (e.target.closest("[data-meta-team-back]")) { backToPublishedTeams(); return; }
    if (e.target.closest("[data-meta-retry]")) { openDetail(state.selected); return; }
    const setTarget = e.target.closest("[data-meta-set-target]");
    if (setTarget) { $(`#published-set-${setTarget.dataset.metaSetTarget}`)?.focus(); return; }
    const more = e.target.closest("[data-meta-more]");
    if (more) { const key = more.dataset.metaMore; state.metaLimits[key] = Number(more.dataset.metaNext); openDetail(state.selected); ($(`[data-meta-more="${key}"]`) || $(".detail-tab-panel"))?.focus({ preventScroll: true }); return; }
    const spread = e.target.closest("[data-meta-spread],[data-meta-joint]");
    if (spread) {
      const entry = state.bySlug.get(state.selected)?.metaUsage;
      const joint = spread.hasAttribute("data-meta-joint");
      const row = (joint ? entry?.observedSpreads : entry?.spreads)?.[Number(joint ? spread.dataset.metaJoint : spread.dataset.metaSpread)];
      if (row) { state.spread = { ...row.stats }; state.spreadNature = joint ? spread.dataset.metaNature : null; state.detailTab = "builds"; openDetail(state.selected); $("[data-lab-nature]", $("#detail"))?.focus(); }
      return;
    }
    if (e.target.closest("[data-lab-to-team]")) {
      let member = state.team.find((m) => m.slug === state.selected);
      if (!member && state.team.length >= TEAM_MAX) { alert("Your team already has six Pokémon. Remove a member first."); return; }
      if (!member) { toggleTeam(state.selected); member = state.team.find((m) => m.slug === state.selected); }
      member.spread = { ...state.spread }; member.nature = state.spreadNature; teamAfterChange(); closeDetail(); switchTab("team"); return;
    }
    const action = e.target.closest("[data-meta-import],[data-meta-opponent]");
    if (!action) return;
    const opponent = action.hasAttribute("data-meta-opponent");
    const id = opponent ? action.dataset.metaOpponent : action.dataset.metaImport;
    const external = state.data.tournamentTeams.teams.find((t) => t.id === id && t.regulation === state.data.metaRegulation);
    const mapped = mapTournamentTeam(external, state.data);
    if (mapped.errors.length) { alert(mapped.errors.join("\n")); return; }
    if (opponent) { closeDetail(); switchTab("calc"); calcView.loadOpponentTeam(mapped); return; }
    if (state.team.length && !confirm("Replace the current working team with this published team? Saved teams will not be changed.")) return;
    state.team = mapped.members; state.teamContext = emptyTeamContext(mapped.name); state.teamScope = "full";
    const notes = presentImportNotes(mapped);
    state.teamNotice = `Imported unsaved team.${notes.undisclosed ? ` ${notes.undisclosed}/6 spreads unavailable; left unknown.` : ""} ${notes.notes.join(" ")}`; teamAfterChange(); closeDetail(); switchTab("team");
  });
  // Logo = home: plain left-click resets in-app (no reload); modified/middle/right
  // clicks fall through to the anchor's href so the browser can open a new tab.
  $(".brand-home").addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    switchTab("pokemon");
    window.scrollTo({ top: 0 });
  });
  // table/grid: compare button, header sort, row open
  $("#results").addEventListener("click", (e) => {
    if (e.target.closest("[data-clear-all]")) { resetFilters(); return; }
    const rmf = e.target.closest("[data-rmfilter]");
    if (rmf) { removeFilter(rmf.dataset.rmfilter); return; }
    const pn = e.target.closest("[data-pin]");
    if (pn) { togglePin(pn.dataset.pin); return; }
    if (e.target.closest("[data-pin-clear]")) { state.pinned.clear(); savePins(); render(); return; }
    const c = e.target.closest("[data-cmp]");
    if (c) { toggleCompare(c.dataset.cmp); return; }
    const tm = e.target.closest("[data-team]");
    if (tm) { toggleTeam(tm.dataset.team); return; }
    const th = e.target.closest("th.sortable");
    if (th) {
      const key = th.dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      else { state.sort.key = key; state.sort.dir = key === "name" || key === "dex" ? "asc" : "desc"; }
      $("#sort-key").value = key;
      $("#sort-dir").textContent = state.sort.dir === "asc" ? "▲ Asc" : "▼ Desc";
      render();
      return;
    }
    const row = e.target.closest("[data-slug]");
    if (row) openDetail(row.dataset.slug);
  });

  // detail interactions
  $("#detail").addEventListener("input", (e) => {
    if (e.target.classList.contains("mv-search")) { filterDetailMoves(); return; }
    const num = e.target.closest("[data-pt-num]");
    if (num) {
      const k = num.dataset.ptNum;
      state.spread[k] = clampPts(k, Number(num.value) || 0);
      tickLab();
    }
  });
  $("#detail").addEventListener("click", (e) => {
    if (e.target.id === "detail" || e.target.dataset.close !== undefined) { closeDetail(); return; }
    if (e.target.closest("[data-shiny]")) { toggleDetailShiny(); return; }
    const fm = e.target.closest("[data-form]");
    if (fm) { openDetail(fm.dataset.form); $("#detail-body").scrollTop = 0; return; }
    const th = e.target.closest(".dm-table th[data-dsort]");
    if (th) { detailSort(th); return; }
    // eHP stat-point lab controls
    const ptStep = e.target.closest("[data-pt-step]");
    if (ptStep) { const k = ptStep.dataset.ptStep; state.spread[k] = clampPts(k, (state.spread[k] || 0) + Number(ptStep.dataset.dir)); tickLab(); return; }
    const ptMax = e.target.closest("[data-pt-max]");
    if (ptMax) { const k = ptMax.dataset.ptMax; state.spread[k] = clampPts(k, CAP); tickLab(); return; }
    const ptClr = e.target.closest("[data-pt-clear]");
    if (ptClr) { state.spread[ptClr.dataset.ptClear] = 0; tickLab(); return; }
    const ptOpt = e.target.closest("[data-pt-opt]");
    if (ptOpt) { state.spread = optimizeSpread(state.bySlug.get(state.selected), ptOpt.dataset.ptOpt, state.spread, state.spreadNature); tickLab(); return; }
    if (e.target.closest("[data-pt-reset]")) { state.spread = emptySpread(); tickLab(); return; }
    const pn = e.target.closest("[data-pin]");
    if (pn) { togglePin(pn.dataset.pin); syncPinButtons(); return; }
    const c = e.target.closest("[data-cmp]");
    if (c) { toggleCompare(c.dataset.cmp); return; }
    const tm = e.target.closest("[data-team]");
    if (tm) { toggleTeam(tm.dataset.team); return; }
    const bm = e.target.closest("[data-browse-moves]");
    if (bm) { browseMovesOf(bm.dataset.browseMoves); return; }
    const mf = e.target.closest("[data-move-filter]");
    if (mf) { applyMoveFilter(Number(mf.dataset.moveFilter)); return; }
    const af = e.target.closest("[data-ability-filter]");
    if (af) { applyAbilityFilter(af.dataset.abilityFilter); return; }
    const mi = e.target.closest("[data-move-info]");
    if (mi) { openMovePopup(Number(mi.dataset.moveInfo)); return; }
    const ai = e.target.closest("[data-ability-info]");
    if (ai) { openAbilityPopup(ai.dataset.abilityInfo); return; }
    const sim = e.target.closest(".sim-card[data-slug]");
    if (sim) { openDetail(sim.dataset.slug); $("#detail-body").scrollTop = 0; }
  });

  // move/ability popup
  $("#popup").addEventListener("click", (e) => {
    if (e.target.id === "popup" || e.target.dataset.closePopup !== undefined) { closePopup(); return; }
    const mf = e.target.closest("[data-move-filter]");
    if (mf) { closePopup(); switchTab("pokemon"); applyMoveFilter(Number(mf.dataset.moveFilter)); return; }
    const mr = e.target.closest("[data-move-rank]");   // 🏆 → Moves tab "Best users" (switchTab first: it lazily inits movesView)
    if (mr) { closePopup(); switchTab("moves"); movesView?.rankMove(Number(mr.dataset.moveRank)); return; }
    const af = e.target.closest("[data-ability-filter]");
    if (af) { closePopup(); switchTab("pokemon"); applyAbilityFilter(af.dataset.abilityFilter); return; }
    const lr = e.target.closest(".lr[data-slug]");
    if (lr) { closePopup(); switchTab("pokemon"); openDetail(lr.dataset.slug); }
  });

  // compare overlay + bar
  $("#compare").addEventListener("click", (e) => {
    if (e.target.id === "compare" || e.target.dataset.closeCompare !== undefined) { closeCompare(); return; }
    if (e.target.closest("[data-open-moves]")) {
      const mons = state.compare.map((s) => state.bySlug.get(s));
      closeCompare();
      browseMonsInMoves(mons);
      return;
    }
    const mi = e.target.closest("[data-move-info]");
    if (mi) { openMovePopup(Number(mi.dataset.moveInfo)); return; }
    const ai = e.target.closest("[data-ability-info]");
    if (ai) { openAbilityPopup(ai.dataset.abilityInfo); return; }
    const mv = e.target.closest("[data-cmp-moves]");
    if (mv) { state.cmpMoves = mv.dataset.cmpMoves; openCompare(); return; }
    const a = e.target.closest("[data-anchor]");
    if (a) { state.compareAnchor = a.dataset.anchor; openCompare(); }
  });
  $("#compare-bar").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-cmp-remove]");
    if (rm) { toggleCompare(rm.dataset.cmpRemove); return; }
    if (e.target.closest("[data-cmp-clear]")) { state.compare = []; render(); renderCompareBar(); syncCmpButtons(); return; }
    if (e.target.closest("[data-cmp-open]")) openCompare();
  });

  document.addEventListener("keydown", (e) => {
    if ($("#detail").classList.contains("open") && !$("#popup").classList.contains("open") && !$("#compare").classList.contains("open")) {
      if (e.key === "Tab") {
        const root = document.querySelector(":popover-open") || $("#detail");
        const stops = [...root.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length && el.tabIndex >= 0);
        const first = stops[0], last = stops.at(-1);
        if (stops.length && (e.shiftKey ? document.activeElement === first || !root.contains(document.activeElement) : document.activeElement === last || !root.contains(document.activeElement))) {
          e.preventDefault(); (e.shiftKey ? last : first).focus();
        }
      }
      const tab = e.target.closest('[role="tab"][data-detail-tab]');
      if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const index = DETAIL_TABS.indexOf(tab.dataset.detailTab);
        switchDetailTab(DETAIL_TABS[e.key === "Home" ? 0 : e.key === "End" ? DETAIL_TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + DETAIL_TABS.length) % DETAIL_TABS.length]);
        return;
      }
      if (e.key === "Escape" && document.querySelector(":popover-open")) { document.querySelector(":popover-open").hidePopover(); e.preventDefault(); return; }
      if (e.key === "Escape" && state.detailTab === "teams" && state.metaTeamId) { backToPublishedTeams(); e.preventDefault(); return; }
    }
    if (e.key !== "Escape") return;
    if ($("#compare").classList.contains("open")) closeCompare();
    else if ($("#popup").classList.contains("open")) closePopup();
    else if ($("#filters").classList.contains("open")) toggleFilters(false);
    else closeDetail();
  });
}

function applyAbilityFilter(slug) {
  state.filters.abilities.add(slug);
  renderAbilityChips();
  closeDetail();
  toggleFilters(true);
  render();
}

function applyMoveFilter(id) {
  state.filters.moves.add(id);
  renderMoveChips();
  closeDetail();
  toggleFilters(true);
  render();
}

// ---------------------------------------------------------------- tabs / views
let movesInited = false, abilInited = false, calcInited = false, teamInited = false, covInited = false;
let movesView = null;  // controller from initMovesView (for the compare → Moves bridge)
let calcView = null;   // controller from initCalcView (for Team-check live refresh)

// Switch to the Moves tab and load a set of mons as ownership columns (lazy-inits
// the view if needed). Used by the detail "browse moves" button and compare popup.
function browseMonsInMoves(mons) {
  switchTab("moves");
  movesView?.browseMons(mons.filter(Boolean));
}

function setupTabs() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
}

function switchTab(tab) {
  state.tab = tab;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $(".tb-pokemon").hidden = tab !== "pokemon";
  $(".tb-moves").hidden = tab !== "moves";
  $(".tb-abilities").hidden = tab !== "abilities";
  $("#filters").style.display = tab === "pokemon" ? "" : "none";
  // the "N species · M Megas · Regulation…" meta line only describes the roster — hide it elsewhere
  $("#meta-line").hidden = tab !== "pokemon";
  $("#results").hidden = tab !== "pokemon";
  $("#moves-results").hidden = tab !== "moves";
  $("#abilities-results").hidden = tab !== "abilities";
  $("#calc-results").hidden = tab !== "calc";
  $("#team-results").hidden = tab !== "team";
  $("#coverage-results").hidden = tab !== "coverage";

  if (tab === "coverage" && !covInited) {
    covInited = true;
    initCoverageView({ container: $("#coverage-results"), data: state.data, onShowMons: openMonListPopup });
  }

  if (tab === "calc" && !calcInited) {
    calcInited = true;
    calcView = initCalcView({ container: $("#calc-results"), data: state.data, onOpen: openDetail, onMoveInfo: openMovePopup,
      getTeam: () => {
        const picked = state.team.filter((member) => member.picked);
        const roster = picked.length ? picked : state.team;
        return roster.map((member) => ({ ...member }));
      }, onGotoTeam: () => switchTab("team"),
      onAddTeamMove: (slug, id) => addMove(slug, id) });
  }
  if (tab === "calc" && calcView) calcView.refresh();   // Team check reflects live team edits on entry
  if (tab === "team" && !teamInited) {
    teamInited = true;
    const tc = $("#team-results");
    tc.addEventListener("change", (e) => {
      const build = e.target.closest("[data-team-nature],[data-team-stat]");
      if (build) {
        const member = state.team.find((m) => m.slug === build.dataset.slug);
        if (!member) return;
        if (build.hasAttribute("data-team-nature")) member.nature = build.value || null;
        else {
          const spread = member.spread || emptySpread(), key = build.dataset.teamStat;
          const remaining = POOL - pointsUsed(spread) + spread[key];
          member.spread = { ...spread, [key]: Math.max(0, Math.min(CAP, remaining, Math.floor(Number(build.value) || 0))) };
        }
        teamAfterChange(); return;
      }
      const select = e.target.closest("[data-team-item]");
      const member = select && state.team.find((m) => m.slug === select.dataset.teamItem);
      if (member) { member.item = normalizeItem(select.value, state.bySlug.get(member.slug)); teamAfterChange(); }
    });
    tc.addEventListener("click", (e) => {
      const scope = e.target.closest("[data-team-scope]");
      if (scope) { setTeamScope(scope.dataset.teamScope); return; }
      const pick = e.target.closest("[data-battle-pick]");
      if (pick) { toggleBattlePick(pick.dataset.battlePick); return; }
      const rm = e.target.closest("[data-team-remove]");
      if (rm) { toggleTeam(rm.dataset.teamRemove); return; }
      const mr = e.target.closest("[data-move-remove]");
      if (mr) { removeMove(mr.dataset.slug, Number(mr.dataset.moveRemove)); return; }
      const mi = e.target.closest("[data-move-info]");
      if (mi) { openMovePopup(Number(mi.dataset.moveInfo)); return; }
      const sa = e.target.closest("[data-set-ability]");
      if (sa) { setMemberAbility(sa.dataset.slug, sa.dataset.setAbility); return; }
      const lt = e.target.closest("[data-load-team]");
      if (lt) { loadSavedTeam(lt.dataset.loadTeam); return; }
      const dt = e.target.closest("[data-del-team]");
      if (dt) { deleteSavedTeam(dt.dataset.delTeam); return; }
      if (e.target.closest("[data-new-team]")) { clearTeam(); return; }
      if (e.target.closest("[data-save-team]")) {
        saveWorkingTeam($("#team-results .team-name")?.value);
        return;
      }
      if (e.target.closest("[data-share-working]")) {
        shareTeam($("#team-results .team-name")?.value.trim() || "My team", state.team);
        return;
      }
      const sh = e.target.closest("[data-share-team]");
      if (sh) { const t = state.savedTeams.find((x) => x.id === sh.dataset.shareTeam); if (t) shareTeam(t.name, t.members); return; }
      if (e.target.closest("[data-share-close]")) { state.sharePanel = null; renderTeam(); return; }
      const cp = e.target.closest("[data-share-copy]");
      if (cp && state.sharePanel) {
        const inp = $("#team-results .tm-share-link");
        const ok = () => { cp.textContent = "✓ copied"; setTimeout(() => { if (cp.isConnected) cp.textContent = "Copy link"; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(state.sharePanel.url).then(ok, () => { inp?.select(); });
        else { inp?.select(); document.execCommand && document.execCommand("copy") && ok(); }
        return;
      }
      const open = e.target.closest("[data-open]");
      if (open) { openDetail(open.dataset.open); return; }
      const row = e.target.closest(".spd-row[data-slug]");
      if (row) openDetail(row.dataset.slug);
    });
    tc.addEventListener("input", (e) => {
      if (e.target.matches(".team-name")) {
        state.teamContext.name = e.target.value;
        saveTeamContext();
        const button = tc.querySelector("[data-save-team]");
        if (button) button.textContent = state.teamContext.loadedId && e.target.value.trim() !== state.teamContext.originalName ? "Save as new" : "Save";
      }
    });
    tc.addEventListener("change", (e) => {   // paste a share link/code → import
      if (e.target.classList.contains("tm-import") && e.target.value.trim()) {
        importTeam(e.target.value);
        e.target.value = "";
      }
    });
    renderTeam();
  }
  if (tab === "moves" && !movesInited) {
    movesInited = true;
    movesView = initMovesView({ toolbarEl: $(".tb-moves"), contentEl: $("#moves-results"), data: state.data,
      onInfo: (id) => openMovePopup(id),
      onAbil: (slug) => openAbilityPopup(slug),
      onFilter: (id) => { switchTab("pokemon"); applyMoveFilter(id); },
      onMon: (slug) => openDetail(slug) });   // detail is a global overlay — open it in place, don't jump to the roster
  }
  if (tab === "abilities" && !abilInited) {
    abilInited = true;
    initAbilitiesView({ toolbarEl: $(".tb-abilities"), contentEl: $("#abilities-results"), data: state.data,
      onInfo: (slug) => openAbilityPopup(slug),
      onFilter: (slug) => { switchTab("pokemon"); applyAbilityFilter(slug); } });
  }
  window.scrollTo(0, 0);
  syncTopbarH();
}

function syncTopbarH() {
  const h = $(".topbar").offsetHeight;
  document.documentElement.style.setProperty("--topbar-h", h + "px");
}
