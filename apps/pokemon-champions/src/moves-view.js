// Browsable Moves table: power / accuracy / PP / priority / target / flags /
// effect / how many roster Pokemon learn it. Click a column to sort, Shift-click
// to add a tiebreaker (multi-key). Defaults to grouped-by-type, then most-common
// first. Can also load a *set* of Pokémon (e.g. the compared ones) to show per-mon
// ownership columns + filter to the moves they share, with full move detail here
// rather than crammed into the compare popup.
import { TYPES, TYPE_COLORS, displayName, targetLabel, isSpread, rarityTier } from "./data.js";

const COLS = [
  { key: "name", label: "Move" },
  { key: "type", label: "Type" },
  { key: "class", label: "Cat", nosort: true },
  { key: "target", label: "Target" },
  { key: "power", label: "Pow", num: true },
  { key: "accuracy", label: "Acc", num: true },
  { key: "pp", label: "PP", num: true },
  { key: "priority", label: "Prio", num: true },
  { key: "flags", label: "Flags", nosort: true },
  { key: "count", label: "Pokémon", num: true },
  { key: "effect", label: "Effect", nosort: true },
];
const DEFAULT_SORT = [{ key: "type", dir: "asc" }, { key: "count", dir: "desc" }];
const STR_KEYS = new Set(["name", "type", "target"]);
const defDir = (k) => (STR_KEYS.has(k) ? "asc" : "desc");
const sortVal = (m, k) => (k === "target" ? targetLabel(m.target)
  : STR_KEYS.has(k) ? (m[k] || "")
  : (m[k] == null ? -1 : m[k]));

export function initMovesView({ toolbarEl, contentEl, data, onInfo, onFilter }) {
  const moves = Object.entries(data.moves).map(([id, m]) => ({ id: Number(id), ...m }));
  const allFlags = [...new Set(moves.flatMap((m) => m.flags || []))].sort();
  const allTargets = [...new Set(moves.map((m) => m.target).filter(Boolean))]
    .sort((a, b) => (isSpread(b) - isSpread(a)) || targetLabel(a).localeCompare(targetLabel(b)));
  const monByName = new Map(data.pokemon.map((m) => [(m._display || displayName(m)).toLowerCase(), m]));
  const state = { search: "", type: "", cat: "", flags: new Set(), targets: new Set(),
    mons: [], ownMode: "any", sort: structuredClone(DEFAULT_SORT) };

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
    <span class="mv-hint">Click a column to sort · Shift-click adds a tiebreaker · <button class="mv-reset">reset</button></span>
    <span class="count mv-count"></span>
    <div class="mv-mon-chips"></div>
    <div class="type-chips mv-types">${TYPES.map((t) =>
      `<button class="type-chip" data-mvtype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
    <div class="target-chips">${allTargets.map((t) =>
      `<button class="chip target-chip ${isSpread(t) ? "spread" : ""}" data-target="${t}" title="Target: ${targetLabel(t)}">${targetLabel(t)}</button>`).join("")}</div>
    <div class="flag-chips">${allFlags.map((f) =>
      `<button class="chip flag-chip" data-flag="${f}">${f}</button>`).join("")}</div>`;

  const $ = (s) => toolbarEl.querySelector(s);

  function updateMonUI() {
    $(".mv-mon-chips").innerHTML = state.mons.map((m) =>
      `<span class="mon-chip"><img src="${m.sprite}" alt="">${m.name}<button data-rm-mon="${m.slug}" aria-label="Remove ${m.name}">✕</button></span>`).join("");
    $(".mv-own").hidden = state.mons.length < 2;  // "any" and "all" only differ with ≥2
  }
  function addMon(mon) {
    if (!mon || state.mons.some((x) => x.slug === mon.slug)) return;
    state.mons.push({ slug: mon.slug, name: mon._display || displayName(mon),
      sprite: mon.sprite || mon.artwork || "", moves: new Set(mon.moves) });
    updateMonUI(); draw();
  }
  function resetFilters() {
    state.search = ""; state.type = ""; state.cat = ""; state.flags.clear(); state.targets.clear();
    $(".mv-search").value = "";
    toolbarEl.querySelectorAll("[data-mvtype]").forEach((x) => x.classList.remove("on"));
    toolbarEl.querySelectorAll(".mv-cat button").forEach((x) => x.classList.toggle("active", x.dataset.cat === ""));
    toolbarEl.querySelectorAll(".flag-chip, .target-chip").forEach((x) => x.classList.remove("on"));
  }

  $(".mv-search").addEventListener("input", (e) => { state.search = e.target.value; draw(); });
  $(".mv-mon").addEventListener("change", (e) => {
    const mon = monByName.get(e.target.value.trim().toLowerCase());
    if (mon) addMon(mon);
    e.target.value = "";
  });
  $(".mv-mon-chips").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm-mon]");
    if (!rm) return;
    state.mons = state.mons.filter((m) => m.slug !== rm.dataset.rmMon);
    updateMonUI(); draw();
  });
  toolbarEl.querySelectorAll(".mv-own button").forEach((b) => b.addEventListener("click", () => {
    state.ownMode = b.dataset.own;
    toolbarEl.querySelectorAll(".mv-own button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  toolbarEl.querySelectorAll("[data-mvtype]").forEach((b) => b.addEventListener("click", () => {
    state.type = state.type === b.dataset.mvtype ? "" : b.dataset.mvtype;
    toolbarEl.querySelectorAll("[data-mvtype]").forEach((x) => x.classList.toggle("on", x.dataset.mvtype === state.type));
    draw();
  }));
  $(".mv-reset").addEventListener("click", () => { state.sort = structuredClone(DEFAULT_SORT); draw(); });
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
  toolbarEl.querySelectorAll(".target-chip").forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.target;
      if (state.targets.has(t)) { state.targets.delete(t); b.classList.remove("on"); }
      else { state.targets.add(t); b.classList.add("on"); }
      draw();
    }));

  contentEl.addEventListener("click", (e) => {
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
      if (state.targets.size && !state.targets.has(m.target)) return false;
      for (const f of state.flags) if (!(m.flags || []).includes(f)) return false;
      if (ownSets.length) {
        const owners = ownSets.reduce((a, s) => a + (s.has(m.id) ? 1 : 0), 0);
        if (state.ownMode === "all" ? owners < ownSets.length : owners === 0) return false;
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
    $(".mv-count").textContent = state.mons.length
      ? `${list.length} moves · owners: ${state.mons.map((m) => m.name).join(", ")}`
      : `${list.length} moves`;
    const multi = state.sort.length > 1;
    const ownerHead = state.mons.map((m) =>
      `<th class="mv-owner" title="${m.name}"><img src="${m.sprite}" alt=""></th>`).join("");
    const headArr = COLS.map((c) => {
      const i = state.sort.findIndex((s) => s.key === c.key);
      const on = i >= 0;
      const arrow = on ? (state.sort[i].dir === "asc" ? " ▲" : " ▼") : "";
      const prio = on && multi ? `<sup class="sort-prio">${i + 1}</sup>` : "";
      const cls = `${c.num ? "num" : ""} ${c.nosort ? "" : "sortable"} ${on ? "active" : ""}`;
      return `<th class="${cls}" ${c.nosort ? "" : `data-sort="${c.key}"`}>${c.label}${arrow}${prio}</th>`;
    });
    const head = [headArr[0], ownerHead, ...headArr.slice(1)].join("");
    const rows = list.map((m) => {
      const flags = (m.flags || []).map((f) => `<span class="mflag">${f}</span>`).join("");
      const cat = m.class[0].toUpperCase();
      const ownerCells = state.mons.map((pm) =>
        `<td class="mv-owner">${pm.moves.has(m.id) ? `<img class="cm-yes" loading="lazy" alt="✓" title="${pm.name}" src="${pm.sprite}">` : ""}</td>`).join("");
      const tgt = m.target ? `<span class="mv-target ${isSpread(m.target) ? "spread" : ""}">${targetLabel(m.target)}</span>` : "—";
      return `<tr data-move="${m.id}" title="View move details">
        <td class="mv-nm"><button class="lens" data-filter="${m.id}" title="Filter roster by this move">🔍</button>${m.name}</td>
        ${ownerCells}
        <td>${m.type ? `<span class="type" style="background:${TYPE_COLORS[m.type]}">${m.type}</span>` : "—"}</td>
        <td><span class="mv-class mv-${m.class}" title="${m.class}">${cat}</span></td>
        <td class="mv-tg">${tgt}</td>
        <td class="num">${m.power == null ? (m.class === "status" ? "—" : '<span class="mv-varies" title="Power varies — see effect">varies</span>') : m.power}</td>
        <td class="num">${m.accuracy ?? "—"}</td>
        <td class="num">${m.pp ?? "—"}</td>
        <td class="num">${m.priority ? (m.priority > 0 ? "+" + m.priority : m.priority) : "0"}</td>
        <td class="mv-flags">${flags || "<span class='muted'>—</span>"}</td>
        <td class="num"><span class="rarity ${rarityTier(m.count, data.total).cls}">${m.count}</span></td>
        <td class="mv-eff">${(m.secondaries || []).map(([c, l]) => `<span class="mv-chance" title="secondary-effect chance">${c}%${l ? " " + l : ""}</span>`).join(" ")} ${m.effect || ""}</td>
      </tr>`;
    }).join("");
    contentEl.innerHTML = `<table class="poke-table moves-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Load a set of mons (e.g. the compared roster) → per-mon ownership columns +
  // restrict to the moves they share; full detail lives here, not the popup.
  function browseMons(list) {
    resetFilters();
    state.ownMode = "any";
    toolbarEl.querySelectorAll(".mv-own button").forEach((x) => x.classList.toggle("active", x.dataset.own === "any"));
    state.mons = (list || []).filter(Boolean).map((m) => ({
      slug: m.slug, name: m._display || displayName(m),
      sprite: m.sprite || m.artwork || "", moves: new Set(m.moves),
    }));
    updateMonUI();
    draw();
    window.scrollTo({ top: 0 });
  }

  draw();
  return { browseMons };
}
