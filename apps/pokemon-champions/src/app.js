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
import { renderMovePopup, renderAbilityPopup } from "./info.js";
import { renderCompare } from "./compare.js";

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
  statMode: "base",   // "base" | "lv50"
  compare: [],
  compareAnchor: null,   // slug used as the comparison baseline
  selected: null,
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
  state.selected = slug;
  $("#detail-body").innerHTML = renderDetail(mon, state);
  $("#detail").classList.add("open");
  syncCmpButtons();
  filterDetailMoves(); // apply the default (type-grouped) move ordering
}

function closeDetail() {
  state.selected = null;
  $("#detail").classList.remove("open");
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
function renderCompareBar() {
  const bar = $("#compare-bar");
  if (!state.compare.length) { bar.hidden = true; bar.innerHTML = ""; return; }
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
}
function openCompare() {
  if (state.compare.length < 2) return;
  if (!state.compare.includes(state.compareAnchor)) state.compareAnchor = state.compare[0];
  const mons = state.compare.map((s) => state.bySlug.get(s));
  $("#compare-body").innerHTML = renderCompare(mons, state.data, statScaleMax(state.statMode), state.compareAnchor);
  $("#compare").classList.add("open");
}
const closeCompare = () => $("#compare").classList.remove("open");

// ---------------------------------------------------------------- global events
function bindGlobal() {
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
    if (e.target.classList.contains("mv-search")) filterDetailMoves();
  });
  $("#detail").addEventListener("click", (e) => {
    if (e.target.id === "detail" || e.target.dataset.close !== undefined) { closeDetail(); return; }
    const th = e.target.closest(".dm-table th[data-dsort]");
    if (th) { detailSort(th); return; }
    const c = e.target.closest("[data-cmp]");
    if (c) { toggleCompare(c.dataset.cmp); return; }
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
let movesInited = false, abilInited = false, calcInited = false;

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

  if (tab === "calc" && !calcInited) {
    calcInited = true;
    initCalcView({ container: $("#calc-results"), data: state.data });
  }
  if (tab === "moves" && !movesInited) {
    movesInited = true;
    initMovesView({ toolbarEl: $(".tb-moves"), contentEl: $("#moves-results"), data: state.data,
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
