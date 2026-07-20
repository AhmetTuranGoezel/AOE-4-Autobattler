// Entry point: load data, build controls, wire events, render.
import { loadData, TYPES, TYPE_COLORS, displayName, GEN_LABEL } from "./data.js";
import {
  DEFAULT_WEIGHTS, computeEffective, STAT_KEYS, STAT_LABELS, statScaleMax,
} from "./effective-stats.js";
import { buildSimContext } from "./similarity.js";
import {
  createFilterState, applyFilters, sortMons, activeFilterCount,
} from "./filters.js";
import { renderTable, renderGrid, ROLE_META } from "./table.js";
import { renderDetail } from "./detail.js";
import { initMovesView } from "./moves-view.js";
import { initAbilitiesView } from "./abilities-view.js";
import { initCalcView } from "./calc-view.js";
import { renderTeamView, TEAM_MAX } from "./team-view.js";
import { attachAutocomplete } from "./autocomplete.js";
import { typingAbilities, defaultAbility } from "./type-defense.js";
import { initCoverageView } from "./coverage-view.js";
import { renderMovePopup, renderAbilityPopup } from "./info.js";
import { renderCompare } from "./compare.js";
import { tickStatLab, optimizeSpread, emptySpread, POOL, CAP, pointsUsed } from "./stat-lab.js";

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
  team: [],              // [{ slug, moves: [moveId,...] }] (working team, persisted)
  savedTeams: [],        // [{ id, name, members: [{slug,moves}] }] (persisted)
  selected: null,
  spread: emptySpread(), // eHP stat-point lab allocation for the open detail panel
  moveByName: new Map(),
  abilityByName: new Map(),
};

// ---------------------------------------------------------------- bootstrap
init();

async function init() {
  try {
    const data = await loadData();
    state.data = data;
    state.all = data.pokemon;
    for (const m of state.all) { m._display = displayName(m); state.bySlug.set(m.slug, m); }
    loadPins();
    loadTeam();
    loadSavedTeams();
    state.simCtx = buildSimContext(state.all);
    recomputeEffective();
    buildToolbar();
    buildFilters();
    buildWeights();
    setupTabs();
    bindGlobal();
    setupMobileView();
    render();
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
      `Regulation ${data.meta.regulation} · data from Bulbapedia + PokéAPI`;
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
    ? renderTable(unpinned, state.sort, cmp, max, state.extras, pinned, teamSet)
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
    ["dex", "Dex #"], ["name", "Name"],
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

  // ability + move (datalist combo boxes, sorted by name, with rarity in label)
  const abils = Object.entries(state.data.abilities)
    .map(([slug, a]) => ({ slug, ...a })).sort((a, b) => a.name.localeCompare(b.name));
  state.abilityByName = new Map(abils.map((a) => [a.name.toLowerCase(), a.slug]));
  $("#ability-list").innerHTML = abils.map((a) => `<option value="${a.name}">`).join("");
  $("#f-ability").addEventListener("input", onAbilityInput);
  $("#ability-chips").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-ability-remove]");
    if (rm) { state.filters.abilities.delete(rm.dataset.abilityRemove); renderAbilityChips(); render(); }
  });

  const moves = Object.entries(state.data.moves)
    .map(([id, m]) => ({ id: Number(id), ...m })).sort((a, b) => a.name.localeCompare(b.name));
  state.moveByName = new Map(moves.map((m) => [m.name.toLowerCase(), m.id]));
  $("#move-list").innerHTML = moves.map((m) => `<option value="${m.name}">`).join("");
  $("#f-move").addEventListener("input", onMoveInput);
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

function setNote(id, text) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("show", !!text);
}

function onAbilityInput(e) {
  const slug = state.abilityByName.get(e.target.value.trim().toLowerCase());
  if (!slug) return;                      // only react to an exact (picked) name
  state.filters.abilities.add(slug);
  e.target.value = "";
  renderAbilityChips();
  render();
}

function renderAbilityChips() {
  $("#ability-chips").innerHTML = [...state.filters.abilities].map((slug) => {
    const a = state.data.abilities[slug] || { name: slug, count: 0 };
    return `<span class="fchip"><span>${a.name}</span><small>${a.count}</small>` +
      `<button data-ability-remove="${slug}" aria-label="Remove">✕</button></span>`;
  }).join("");
}

function onMoveInput(e) {
  const val = e.target.value.trim();
  const id = state.moveByName.get(val.toLowerCase());
  if (id == null) {                       // only react to an exact (picked) name
    setNote("#move-note", val ? "No exact match — pick from the list" : "");
    return;
  }
  state.filters.moves.add(id);
  e.target.value = "";
  setNote("#move-note", "");
  renderMoveChips();
  render();
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
  setNote("#move-note", "");
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
function openDetail(slug) {
  const mon = state.bySlug.get(slug);
  if (!mon) return;
  const prev = state.bySlug.get(state.selected);
  if (slug !== state.selected) state.spread = emptySpread(); // fresh mon → fresh points
  if (!prev || prev.dex !== mon.dex) state.detailShiny = false; // reset shiny only for a new species (keep across base⇄mega)
  state.selected = slug;
  $("#detail-body").innerHTML = renderDetail(mon, { ...state, pinned: state.pinned });
  $("#detail").classList.add("open");
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
  if (mon) tickStatLab($("#detail"), mon, state.spread);
}

function closeDetail() {
  state.selected = null;
  $("#detail").classList.remove("open");
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

// Coerce a stored member to {slug, moves[], ability}; supports the old string-array
// and the {slug,moves} formats. ability: null = types-only, else a typing-ability slug.
function normMember(m) {
  const slug = typeof m === "string" ? m : m && m.slug;
  if (!slug || !state.bySlug.has(slug)) return null;
  const mon = state.bySlug.get(slug);
  const moves = (m && Array.isArray(m.moves) ? m.moves : [])
    .filter((id) => state.data.moves[id]).slice(0, 4);
  let ability = m && typeof m === "object" && "ability" in m ? m.ability : undefined;
  if (ability === undefined) ability = defaultAbility(mon);
  else if (ability !== null && !typingAbilities(mon).includes(ability)) ability = defaultAbility(mon);
  return { slug, moves, ability };
}
function loadTeam() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAM_KEY) || "[]");
    state.team = arr.map(normMember).filter(Boolean).slice(0, TEAM_MAX);
    saveTeam();  // upgrade legacy string-array storage to the {slug,moves} format
  } catch { state.team = []; }
}
function saveTeam() { try { localStorage.setItem(TEAM_KEY, JSON.stringify(state.team)); } catch { /* ignore */ } }
function loadSavedTeams() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAMS_KEY) || "[]");
    state.savedTeams = arr.map((t) => ({
      id: t.id || String(Date.now() + Math.random()),
      name: String(t.name || "Team"),
      members: (t.members || []).map(normMember).filter(Boolean).slice(0, TEAM_MAX),
    }));
  } catch { state.savedTeams = []; }
}
function persistSavedTeams() { try { localStorage.setItem(TEAMS_KEY, JSON.stringify(state.savedTeams)); } catch { /* ignore */ } }

function teamAfterChange() { saveTeam(); if (teamInited) renderTeam(); syncTeamButtons(); }

function toggleTeam(slug) {
  const i = state.team.findIndex((t) => t.slug === slug);
  if (i >= 0) state.team.splice(i, 1);
  else if (state.team.length < TEAM_MAX) state.team.push({ slug, moves: [], ability: defaultAbility(state.bySlug.get(slug)) });
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
function clearTeam() { state.team = []; teamAfterChange(); }
function saveWorkingTeam(name) {
  name = (name || "").trim();
  if (!name || !state.team.length) return;
  const members = state.team.map((t) => ({ slug: t.slug, moves: [...t.moves], ability: t.ability }));
  const existing = state.savedTeams.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.members = members;
  else state.savedTeams.push({ id: String(Date.now()) + Math.random().toString(36).slice(2), name, members });
  persistSavedTeams();
  renderTeam();
}
function loadSavedTeam(id) {
  const t = state.savedTeams.find((x) => x.id === id);
  if (!t) return;
  state.team = t.members.map((m) => ({ slug: m.slug, moves: [...m.moves], ability: m.ability })).slice(0, TEAM_MAX);
  teamAfterChange();
}
function deleteSavedTeam(id) {
  state.savedTeams = state.savedTeams.filter((x) => x.id !== id);
  persistSavedTeams();
  renderTeam();
}

// ---- team sharing: a SHORT code in the URL (works across browsers/PCs, no server) ----
// v2: `2|<name>|pid36.abIdx.m36.m36…` — mons by PokeAPI pid (stable forever), moves by id
// (ids are pinned permanently via tools/move_ids.json), ability as an index into the mon's
// ability list. Charset [0-9a-z.|%~-] → URL-hash-safe raw, ~100 chars for a full team.
// v1 (legacy base64-JSON with move names) still decodes so old links keep working.
const byPid = () => {
  if (!state.byPid) state.byPid = new Map(state.all.map((m) => [m.id, m]));
  return state.byPid;
};
function encodeTeam(name, members) {
  const mons = members.map((t) => {
    const mon = state.bySlug.get(t.slug);
    if (!mon) return null;
    const ab = t.ability ? (mon.abilities || []).findIndex((a) => a.slug === t.ability) : -1;
    return [mon.id.toString(36), ab >= 0 ? String(ab) : "", ...(t.moves || []).map((id) => Number(id).toString(36))].join(".");
  }).filter(Boolean);
  return `2|${encodeURIComponent(name || "Shared team")}|${mons.join("|")}`;
}
const teamShareUrl = (code) => `${location.origin}${location.pathname}#t=${code}`;
// → { name, members, dropped: [names…] } or null when the code is unusable.
function decodeTeam(codeOrUrl) {
  try {
    let code = codeOrUrl.trim();
    const h = code.match(/#(?:t|team)=(.+)$/);
    if (h) code = h[1];
    if (code.startsWith("2|")) {
      const parts = code.split("|");
      const name = decodeURIComponent(parts[1] || "").slice(0, 30) || "Shared team";
      const dropped = [];
      const members = parts.slice(2, 2 + TEAM_MAX).map((seg) => {
        const [pid36, ab, ...mv36] = seg.split(".");
        const mon = byPid().get(parseInt(pid36, 36));
        if (!mon) { dropped.push("#" + pid36); return null; }
        const moves = mv36.map((x) => parseInt(x, 36)).filter((id) => state.data.moves[id] != null);
        if (moves.length < mv36.length) dropped.push(`${mon._display}: a move`);
        const abil = ab !== "" && mon.abilities && mon.abilities[Number(ab)] ? mon.abilities[Number(ab)].slug : undefined;
        return normMember({ slug: mon.slug, moves, ability: abil });
      }).filter(Boolean);
      return members.length ? { name, members, dropped } : null;
    }
    // legacy v1: base64url JSON { n, m: [{ s, a, v: [moveNames] }] }
    const d = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!Array.isArray(d.m)) return null;
    const dropped = [];
    const members = d.m.slice(0, TEAM_MAX).map((e) => {
      if (!state.bySlug.has(e.s)) { dropped.push(e.s); return null; }
      const moves = (Array.isArray(e.v) ? e.v : [])
        .map((nm) => { const id = state.moveByName.get(String(nm).toLowerCase()); if (id == null) dropped.push(nm); return id; })
        .filter((id) => id != null);
      return normMember({ slug: e.s, moves, ability: e.a ?? undefined });
    }).filter(Boolean);
    if (!members.length) return null;
    return { name: String(d.n || "Shared team").slice(0, 30), members, dropped };
  } catch { return null; }
}
function importTeam(codeOrUrl) {
  state.sharePanel = null;
  const t = decodeTeam(codeOrUrl);
  if (!t) { state.teamNotice = "⚠ Couldn't read that team code."; if (teamInited) renderTeam(); return; }
  state.team = t.members;
  // auto-save under its name (suffix if taken)
  let name = t.name;
  if (state.savedTeams.some((x) => x.name.toLowerCase() === name.toLowerCase())) name += " (2)";
  saveWorkingTeam(name);
  state.teamNotice = `✓ Imported “${name}” — ${t.members.length} Pokémon` +
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
    .map((t) => ({ mon: state.bySlug.get(t.slug), moveIds: t.moves, ability: t.ability }))
    .filter((x) => x.mon);
  renderTeamView($("#team-results"), { data: state.data, team, savedTeams: state.savedTeams,
    notice: state.teamNotice, share: state.sharePanel });
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
    if (ptOpt) { state.spread = optimizeSpread(state.bySlug.get(state.selected), ptOpt.dataset.ptOpt, state.spread); tickLab(); return; }
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
      getTeam: () => state.team.map((t) => ({ slug: t.slug, moves: t.moves })), onGotoTeam: () => switchTab("team"),
      onAddTeamMove: (slug, id) => addMove(slug, id) });
  }
  if (tab === "calc" && calcView) calcView.refresh();   // Team check reflects live team edits on entry
  if (tab === "team" && !teamInited) {
    teamInited = true;
    const tc = $("#team-results");
    tc.addEventListener("click", (e) => {
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
      onMon: (slug) => { switchTab("pokemon"); openDetail(slug); } });
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
