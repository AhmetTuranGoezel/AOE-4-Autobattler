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
  compare: [],
  compareAnchor: null,   // slug used as the comparison baseline
  cmpMoves: "all",       // movepool matrix filter: "all" | "diff"
  team: [],              // slugs (persisted)
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
    loadTeam();
    state.simCtx = buildSimContext(state.all);
    recomputeEffective();
    buildToolbar();
    buildFilters();
    buildWeights();
    setupTabs();
    bindGlobal();
    render();
    $("#status").style.display = "none";
    $("#app").style.display = "flex";
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
function render() {
  const filtered = applyFilters(state.all, state.filters);
  const sorted = sortMons(filtered, state.sort);
  const cmp = new Set(state.compare);
  const max = statScaleMax(state.statMode);
  $("#results").innerHTML = state.view === "table"
    ? renderTable(sorted, state.sort, cmp, max)
    : renderGrid(sorted, cmp, max);
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
    ["dex", "Dex #"], ["name", "Name"],
  ];
  $("#sort-key").innerHTML = sortKeys
    .map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("#sort-key").value = state.sort.key;
  $("#sort-key").addEventListener("change", (e) => {
    state.sort.key = e.target.value; render();
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

  $("#btn-filters").addEventListener("click", () =>
    $("#filters").classList.toggle("open"));
}

function setView(v) {
  state.view = v;
  $("#view-table").classList.toggle("active", v === "table");
  $("#view-grid").classList.toggle("active", v === "grid");
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
  state.filters.move = id != null ? id : null;
  setNote("#move-note", id != null
    ? `${state.data.moves[id].count} Pokémon learn this`
    : (val ? "No exact match — pick from the list" : ""));
  render();
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
  $("#search").value = "";
  $("#f-ability").value = "";
  $("#f-move").value = "";
  renderAbilityChips();
  setNote("#move-note", "");
  $$("#f-types .type-chip").forEach((b) => b.classList.remove("inc", "exc"));
  $$("#f-roles .role-chip, #f-gens .gen-chip").forEach((b) => b.classList.remove("on"));
  $$("#f-stats .rng").forEach((i) => (i.value = ""));
  $("#f-available").checked = true;
  $$(".mega-seg button").forEach((x) =>
    x.classList.toggle("active", x.dataset.mega === "hide"));
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
  if (slug !== state.selected) state.spread = emptySpread(); // fresh mon → fresh points
  state.selected = slug;
  $("#detail-body").innerHTML = renderDetail(mon, state);
  $("#detail").classList.add("open");
  syncCmpButtons();
  syncTeamButtons();
  filterDetailMoves(); // apply the default (type-grouped) move ordering
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
const TEAM_KEY = "pc-team";
function loadTeam() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAM_KEY) || "[]");
    state.team = arr.filter((s) => state.bySlug.has(s)).slice(0, TEAM_MAX);
  } catch { state.team = []; }
}
function saveTeam() { try { localStorage.setItem(TEAM_KEY, JSON.stringify(state.team)); } catch { /* ignore */ } }
function toggleTeam(slug) {
  const i = state.team.indexOf(slug);
  if (i >= 0) state.team.splice(i, 1);
  else if (state.team.length < TEAM_MAX) state.team.push(slug);
  saveTeam();
  if (teamInited) renderTeam();
  syncTeamButtons();
}
function renderTeam() {
  const mons = state.team.map((s) => state.bySlug.get(s)).filter(Boolean);
  renderTeamView($("#team-results"), { data: state.data, team: mons });
}
function syncTeamButtons() {
  document.querySelectorAll("[data-team]").forEach((b) => {
    const on = state.team.includes(b.dataset.team);
    b.classList.toggle("on", on);
    if (b.hasAttribute("data-team-icon")) b.textContent = on ? "✓ In team" : "＋ Team";
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
    const c = e.target.closest("[data-cmp]");
    if (c) { toggleCompare(c.dataset.cmp); return; }
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
    if (ptOpt) { state.spread = optimizeSpread(state.bySlug.get(state.selected), ptOpt.dataset.ptOpt); tickLab(); return; }
    if (e.target.closest("[data-pt-reset]")) { state.spread = emptySpread(); tickLab(); return; }
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
    else closeDetail();
  });
}

function applyAbilityFilter(slug) {
  state.filters.abilities.add(slug);
  renderAbilityChips();
  closeDetail();
  $("#filters").classList.add("open");
  render();
}

function applyMoveFilter(id) {
  state.filters.move = id;
  const meta = state.data.moves[id];
  if (meta) { $("#f-move").value = meta.name; setNote("#move-note", `${meta.count} Pokémon learn this`); }
  closeDetail();
  $("#filters").classList.add("open");
  render();
}

// ---------------------------------------------------------------- tabs / views
let movesInited = false, abilInited = false, calcInited = false, teamInited = false, covInited = false;
let movesView = null;  // controller from initMovesView (for the compare → Moves bridge)

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
    initCalcView({ container: $("#calc-results"), data: state.data });
  }
  if (tab === "team" && !teamInited) {
    teamInited = true;
    const tc = $("#team-results");
    tc.addEventListener("change", (e) => {
      if (!e.target.classList.contains("team-add")) return;
      const slug = tc._nameToSlug?.get(e.target.value.trim().toLowerCase());
      if (slug && !state.team.includes(slug)) toggleTeam(slug);
      e.target.value = "";
    });
    tc.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-team-remove]");
      if (rm) { toggleTeam(rm.dataset.teamRemove); return; }
      const row = e.target.closest(".team-slot[data-slug], .spd-row[data-slug]");
      if (row) openDetail(row.dataset.slug);
    });
    renderTeam();
  }
  if (tab === "moves" && !movesInited) {
    movesInited = true;
    movesView = initMovesView({ toolbarEl: $(".tb-moves"), contentEl: $("#moves-results"), data: state.data,
      onInfo: (id) => openMovePopup(id),
      onFilter: (id) => { switchTab("pokemon"); applyMoveFilter(id); } });
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
