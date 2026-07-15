// Filter + sort state and the (pure) functions that apply them.
import { STAT_KEYS } from "./effective-stats.js";

export function createFilterState() {
  return {
    search: "",
    typesInclude: new Set(),   // match ALL selected types (combo)
    mega: "hide",          // hide | only | all
    roles: new Set(),       // physical | special | mixed | defensive
    gens: new Set(),        // ints
    abilities: new Set(),   // slugs (match ANY)
    moves: new Set(),       // numeric move ids (match ALL — combo pieces like Iron Defense + Body Press)
    availableOnly: true,    // hide untransferable mons
    statMin: {},
    statMax: {},
  };
}

export function activeFilterCount(f) {
  let n = 0;
  if (f.search) n++;
  n += f.typesInclude.size;
  if (f.mega !== "hide") n++;
  n += f.roles.size + f.gens.size + f.abilities.size + f.moves.size;
  if (!f.availableOnly) n++;
  n += Object.keys(f.statMin).length + Object.keys(f.statMax).length;
  return n;
}

const RANGE_KEYS = [...STAT_KEYS, "bst", "cleaned"];

function statValue(m, k) {
  if (k === "bst") return m._eff.bst;
  if (k === "cleaned") return m._eff.cleaned;
  return m._eff.disp[k];
}

export function applyFilters(all, f) {
  const q = f.search.trim().toLowerCase();
  return all.filter((m) => {
    if (f.availableOnly && !m.available) return false;
    if (f.mega === "hide" && m.isMega) return false;
    if (f.mega === "only" && !m.isMega) return false;
    if (q && !m._display.toLowerCase().includes(q)) return false;

    // selected types are an AND combination (Fire + Bug → only Fire/Bug mons)
    for (const t of f.typesInclude) if (!m.types.includes(t)) return false;

    if (f.roles.size && !f.roles.has(m._eff.role)) return false;
    if (f.gens.size && !f.gens.has(m.gen)) return false;
    if (f.abilities.size && !m.abilities.some((a) => f.abilities.has(a.slug))) return false;
    // selected moves are an AND combination (Iron Defense + Body Press → learns both)
    for (const id of f.moves) if (!m.moves.includes(id)) return false;

    for (const k of RANGE_KEYS) {
      if (f.statMin[k] != null && statValue(m, k) < f.statMin[k]) return false;
      if (f.statMax[k] != null && statValue(m, k) > f.statMax[k]) return false;
    }
    return true;
  });
}

export function sortMons(list, sort) {
  const sign = sort.dir === "asc" ? 1 : -1;
  const val = (m) => {
    if (sort.key === "cleaned") return m._eff.cleaned;
    if (sort.key === "wasted") return m._eff.wasted;
    if (sort.key === "bst") return m._eff.bst;
    if (sort.key === "ehpPhys" || sort.key === "ehpSpec" || sort.key === "ehpMixed") return m._eff[sort.key];
    if (sort.key === "dex") return m.dex;
    if (sort.key === "name") return m._display;
    if (sort.key === "weight") return m.weight || 0;
    if (sort.key === "usagePct") return m.usagePct != null ? m.usagePct : -1;
    return m._eff.disp[sort.key];
  };
  return [...list].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (typeof va === "string") return sign * va.localeCompare(vb);
    return sign * (va - vb) || a.dex - b.dex;
  });
}
