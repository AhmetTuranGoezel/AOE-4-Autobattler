// Data loading + small shared helpers.

// Corrections for source-data errors (PokeAPI) — applied over the fetched moves at load.
// Keep this the single place such fixes live so a data regen can't silently undo them.
const MOVE_FIXES = {
  "Matcha Gotcha": { target: "all-opponents" },   // PokeAPI says single-target; in-game it hits all adjacent foes
};

export async function loadData() {
  // `no-cache` = revalidate every load (cheap 304 when unchanged) so a data regen
  // always reaches the browser instead of a stale cached champions-data.json.
  const res = await fetch("./champions-data.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  const d = await res.json();
  d.total = d.pokemon.length;
  for (const mv of Object.values(d.moves)) {
    const fix = MOVE_FIXES[mv.name];
    if (fix) Object.assign(mv, fix);
  }
  return d;
}

const REGION_ADJ = new Set(["Alolan", "Hisuian", "Galarian", "Paldean"]);

// A Mega belongs to the base form its slug derives from (slowbro-mega → slowbro), NOT to
// everything sharing its dex number — Galarian Slowbro / Alolan Raichu cannot Mega Evolve.
// Gender-split bases (pyroar-mega has no "pyroar" entry) fall back to the non-regional
// same-dex form.
export const megaBaseSlug = (slug) => slug.replace(/-mega(-[a-z0-9]+)?$/, "");
export function formFamily(mon, all) {
  const strip = mon.isMega ? megaBaseSlug(mon.slug) : mon.slug;
  const base = all.find((m) => !m.isMega && m.slug === strip)
    || (mon.isMega ? all.find((m) => !m.isMega && m.dex === mon.dex && !REGION_ADJ.has(m.formLabel)) : mon)
    || mon;
  if (REGION_ADJ.has(base.formLabel)) return { base, megas: [] };   // regional variants never mega evolve
  const megas = all.filter((m) => m.isMega && (
    megaBaseSlug(m.slug) === base.slug ||
    (m.dex === base.dex && !all.some((x) => !x.isMega && x.slug === megaBaseSlug(m.slug)))));
  return { base, megas };
}

export function displayName(mon) {
  if (mon.isMega) {
    const suffix = mon.formLabel.replace(/mega/i, "").trim();
    return `Mega ${mon.name}${suffix ? " " + suffix : ""}`;
  }
  if (REGION_ADJ.has(mon.formLabel)) return `${mon.formLabel} ${mon.name}`;
  if (mon.formLabel) return `${mon.name} (${mon.formLabel})`;
  return mon.name;
}

// Rarity tier for an ability/move given how many roster mons share it.
export function rarityTier(count, total) {
  const pct = count / total;
  if (count <= 1) return { label: "Unique", cls: "r-unique", pct };
  if (pct <= 0.03) return { label: "Rare", cls: "r-rare", pct };
  if (pct <= 0.12) return { label: "Uncommon", cls: "r-uncommon", pct };
  if (pct <= 0.35) return { label: "Common", cls: "r-common", pct };
  return { label: "Generic", cls: "r-generic", pct };
}

export const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark",
  "steel", "fairy",
];

export const TYPE_COLORS = {
  normal: "#9fa19f", fire: "#e8732c", water: "#3c93dd", electric: "#f2c218",
  grass: "#56ab2f", ice: "#75d0c1", fighting: "#cb3e34", poison: "#a23ea2",
  ground: "#cf8a3c", flying: "#8a7ce0", psychic: "#ef4a86", bug: "#9aa825",
  rock: "#b09b54", ghost: "#6f5797", dragon: "#6235d8", dark: "#5a5366",
  steel: "#5a8ea1", fairy: "#e08fc0",
};

export const GEN_LABEL = (g) => "Gen " + ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][g];

// Move targeting (from PokeAPI's move.target). "Spread" targets hit more than one
// Pokémon — the competitively important distinction the table/popup highlight.
export const TARGET_LABELS = {
  "selected-pokemon": "Single",
  "selected-pokemon-me-first": "Single",
  "random-opponent": "Random foe",
  "all-opponents": "All foes",
  "all-other-pokemon": "All nearby (ally too)",
  "all-pokemon": "Everyone",
  "all-allies": "Allies",
  "user-and-allies": "Self & allies",
  "ally": "Ally",
  "user-or-ally": "Self or ally",
  user: "Self",
  "entire-field": "Field",
  "users-field": "Your side",
  "opponents-field": "Foes' side",
  "specific-move": "Counter-style",
  "fainting-pokemon": "Fainted target",
};
export const SPREAD_TARGETS = new Set([
  "all-opponents", "all-other-pokemon", "all-pokemon", "all-allies", "user-and-allies",
]);
export const targetLabel = (t) => TARGET_LABELS[t] || (t ? t.replace(/-/g, " ") : "—");
export const isSpread = (t) => SPREAD_TARGETS.has(t);
// Human filter groups over the raw PokeAPI targets — what players actually ask for.
export const TARGET_GROUPS = {
  single: { label: "Single", set: new Set(["selected-pokemon", "selected-pokemon-me-first", "random-opponent", "specific-move", "fainting-pokemon"]) },
  foes: { label: "All foes", set: new Set(["all-opponents", "opponents-field"]) },
  nearby: { label: "All nearby", set: new Set(["all-other-pokemon", "all-pokemon"]) },
  selfally: { label: "Self / allies", set: new Set(["user", "user-and-allies", "all-allies", "ally", "user-or-ally", "users-field"]) },
  field: { label: "Field", set: new Set(["entire-field"]) },
};

// Base power of weight-based moves (Grass Knot, Low Kick) against a target of the
// given weight in kg — the standard breakpoint table.
export const GRASS_KNOT_BP = [[10, 20], [25, 40], [50, 60], [100, 80], [200, 100]];
export function grassKnotBP(kg) {
  for (const [max, bp] of GRASS_KNOT_BP) if (kg < max) return bp;
  return 120;
}
