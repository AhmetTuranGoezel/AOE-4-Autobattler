export const SET_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const NATURE_MODS = {
  lonely: ["atk", "def"], brave: ["atk", "spe"], adamant: ["atk", "spa"], naughty: ["atk", "spd"],
  bold: ["def", "atk"], relaxed: ["def", "spe"], impish: ["def", "spa"], lax: ["def", "spd"],
  timid: ["spe", "atk"], hasty: ["spe", "def"], jolly: ["spe", "spa"], naive: ["spe", "spd"],
  modest: ["spa", "atk"], mild: ["spa", "def"], quiet: ["spa", "spe"], rash: ["spa", "spd"],
  calm: ["spd", "atk"], gentle: ["spd", "def"], sassy: ["spd", "spe"], careful: ["spd", "spa"],
};
export const NATURES = [...Object.keys(NATURE_MODS), "hardy", "docile", "serious", "bashful", "quirky"].sort();
export const natureMultiplier = (nature, stat) => {
  const pair = NATURE_MODS[String(nature || "").toLowerCase()];
  return pair?.[0] === stat ? 1.1 : pair?.[1] === stat ? 0.9 : 1;
};
export function validSpread(spread) {
  return !!spread && SET_STATS.every((k) => Number.isInteger(spread[k]) && spread[k] >= 0 && spread[k] <= 32)
    && SET_STATS.reduce((n, k) => n + spread[k], 0) <= 66;
}
export const canonicalSlug = (s) => String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
