// Data loading + small shared helpers.

export async function loadData() {
  const res = await fetch("./champions-data.json");
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  const d = await res.json();
  d.total = d.pokemon.length;
  return d;
}

const REGION_ADJ = new Set(["Alolan", "Hisuian", "Galarian", "Paldean"]);

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
