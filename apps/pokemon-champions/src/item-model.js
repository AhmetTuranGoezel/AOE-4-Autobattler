// One item catalogue and effect model for Damage, Moves and saved teams.
// Catalogue availability: item-catalog.js. Mechanics: Showdown's Champions mod
// (inherits the base item mechanics unless overridden), checked 2026-09-13.
import { ITEM_CATALOG, ITEM_CATALOG_META } from "./item-catalog.js";
export { ITEM_CATALOG_META };

const TYPE_ITEMS = {
  "silk-scarf": "normal", "black-belt": "fighting", "sharp-beak": "flying",
  "poison-barb": "poison", "soft-sand": "ground", "hard-stone": "rock",
  "silver-powder": "bug", "spell-tag": "ghost", "metal-coat": "steel",
  charcoal: "fire", "mystic-water": "water", "miracle-seed": "grass",
  magnet: "electric", "twisted-spoon": "psychic", "never-melt-ice": "ice",
  "dragon-fang": "dragon", "black-glasses": "dark", "fairy-feather": "fairy",
};
const RESIST_BERRIES = {
  "chilan-berry": "normal", "chople-berry": "fighting", "coba-berry": "flying",
  "kebia-berry": "poison", "shuca-berry": "ground", "charti-berry": "rock",
  "tanga-berry": "bug", "kasib-berry": "ghost", "babiri-berry": "steel",
  "occa-berry": "fire", "passho-berry": "water", "rindo-berry": "grass",
  "wacan-berry": "electric", "payapa-berry": "psychic", "yache-berry": "ice",
  "haban-berry": "dragon", "colbur-berry": "dark", "roseli-berry": "fairy",
};
const SEEDS = { "electric-seed": ["electric", "def"], "grassy-seed": ["grassy", "def"],
  "misty-seed": ["misty", "spd"], "psychic-seed": ["psychic", "spd"] };
const NOTES = {
  "life-orb": "Damage ×1.3. Recoil is reported, but is not included in survival/KO verdicts.",
  "expert-belt": "Damage ×1.2 only on super-effective hits; Moves assumes SE only in Best case.",
  "muscle-band": "Physical damage ×1.1; no boost to special moves.",
  "wise-glasses": "Special damage ×1.1; no boost to physical moves.",
  "light-ball": "Pikachu only: Attack and Sp. Atk ×2. Body Press does not use these stats.",
  "choice-scarf": "Speed ×1.5, including speed-based moves. Comparisons assume a fresh move choice, not a locked turn sequence.",
  "iron-ball": "Speed ×0.5 and grounded, including Flying/Levitate holders. Ground hits Flying holders neutrally (without other grounding effects).",
  "air-balloon": "Assumes an intact balloon: Ground immunity and no grounded terrain bonuses. Popping between different attacks is not simulated.",
  "normal-gem": "Normal damage ×1.3 on the first attack only. Damage KO estimates remove the boost on later attacks; Moves is first-use power.",
  "wide-lens": "Accuracy ×1.1 (90% becomes 99%, not 100%).",
  "zoom-lens": "Damage: accuracy ×1.2 when modeled slower than the target (priority exceptions not modeled). Moves has no turn order, so omits this bonus.",
  "bright-powder": "Incoming accuracy ×0.9; does not reduce damage when an attack connects.",
  leek: "Farfetch’d/Sirfetch’d only: +2 critical stages. Damage shows noncritical ranges unless guaranteed; Expected power averages crit chance.",
  "scope-lens": "+1 critical stage. Damage shows noncritical ranges unless guaranteed; Expected power averages crit chance.",
  "focus-sash": "Single-hit full-HP survival and repeated-hit KO estimates; multi-hit moves can break the sash.",
  leftovers: "Damage KO estimate: restores 1/16 max HP between attacks, not on the knockout turn.",
  "sitrus-berry": "Damage KO estimate: restores 1/4 max HP once at half HP or below. Mid-multihit activation is approximate.",
  "oran-berry": "Damage KO estimate: restores 10 HP once at half HP or below. Mid-multihit activation is approximate.",
  "rocky-helmet": "Contact recoil (1/6 attacker HP per hit) is reported separately; not included in survival/KO verdicts.",
  "binding-band": "Binding chip is 1/6 target HP per turn. Residual trapping turns are not simulated or added to direct damage.",
  "eject-button": "Switches the damaged holder out. Switching and interrupted attack sequences are not simulated; KO counts assume it stays in.",
  "red-card": "Forces the attacker out after damage. Switching and interrupted attack sequences are not simulated; KO counts assume it stays in.",
  "terrain-extender": "Terrain lasts 8 turns. Set terrain in the field controls; turn duration is not simulated.",
  "light-clay": "Screens last 8 turns. Set screens in Damage field controls; turn duration is not simulated.",
  "damp-rock": "Rain lasts 8 turns. Set Rain in field controls; turn duration is not simulated.",
  "heat-rock": "Sun lasts 8 turns. Set Sun in field controls; turn duration is not simulated.",
  "icy-rock": "Snow lasts 8 turns. Set Snow in field controls; turn duration is not simulated.",
  "smooth-rock": "Sand lasts 8 turns. Set Sand in field controls; turn duration is not simulated.",
  "white-herb": "Restoring lowered stages is not simulated. Enter the post-Herb stages yourself.",
  "mental-herb": "Curing move restrictions is not simulated; does not directly boost damage.",
  "shed-shell": "Escape from trapping is not simulated; does not directly boost damage.",
  "quick-claw": "Random priority activation is not simulated; speed/first-move results exclude it.",
  "focus-band": "Random survival is not simulated; KO results exclude it.",
  "kings-rock": "Additional flinch chance is not simulated; does not directly boost damage.",
  metronome: "Repeated-use damage boosts are not simulated; results assume the first use.",
  "big-root": "Additional drain healing is not simulated; does not boost damage.",
  "shell-bell": "Healing after dealing damage is not simulated; does not boost damage.",
};
export const ITEMS = {
  none: { label: "No item", group: "None", note: "No held item. This alone does not activate Unburden." },
  ...Object.fromEntries(Object.entries(ITEM_CATALOG).map(([id, v]) => [id, { ...v,
    note: TYPE_ITEMS[id] ? `${TYPE_ITEMS[id]} moves only: damage ×1.2 (uses the move’s final type).`
      : RESIST_BERRIES[id] ? `Halves the first ${RESIST_BERRIES[id]} hit${id === "chilan-berry" ? "" : " only if super-effective"}. Unnerve blocks consumption.`
      : SEEDS[id] ? `+1 ${SEEDS[id][1] === "def" ? "Defense" : "Sp. Def"} on ${SEEDS[id][0]} terrain, consumed before attacks; activates Unburden. Stacks with entered stages; changing terrain resets this scenario.`
      : v.group === "Mega Stones" ? "Choose the matching Mega form to model its stats and ability; the stone occupies its item slot. Evolution timing is not simulated."
      : NOTES[id] || "Utility/status effect not simulated. Item is saved, but no numerical bonus is assumed.",
  }])),
  "mega-stone": { label: "Matching Mega Stone (form selected)", group: "Mega Stones", note: "Mega stats/ability already come from the selected form. No second held item; stone cannot be removed." },
  // Read-only compatibility for old lab presets: never silently invent a specific item.
  "type-item": { label: "Legacy: any-type ×1.2 assumption", group: "Legacy assumptions", note: "Not a real item. Replace with a named type item for valid comparisons." },
  "band-glasses": { label: "Legacy: Band / Glasses assumption", group: "Legacy assumptions", note: "Not one held item. Replace with Muscle Band or Wise Glasses." },
  "resist-berry": { label: "Legacy: any SE resist berry", group: "Legacy assumptions", note: "Not one held item. Replace with the matching named resist berry." },
};
export const itemLabel = (id) => ITEMS[id]?.label || "No item";
export function normalizeItem(id, mon) {
  if (mon?.isMega) return "mega-stone";
  if (mon && id === "mega-stone") return "none";
  return Object.hasOwn(ITEMS, id) ? id : "none";
}
export function itemActive(id, ability, mon) {
  return id !== "none" && Object.hasOwn(ITEMS, id) && ability !== "klutz" && (!mon?.isMega || ITEMS[id]?.group === "Mega Stones");
}
export function seedEffect(id, ability, terrain, mon) {
  const seed = SEEDS[id];
  return itemActive(id, ability, mon) && seed && seed[0] === terrain
    ? { stat: seed[1], stages: ability === "contrary" ? -1 : ability === "simple" ? 2 : 1, consumed: true } : null;
}
export function itemAtHit(id, ability, terrain, mon) {
  id = normalizeItem(id, mon);
  return seedEffect(id, ability, terrain, mon) ? "none" : id;
}
export function itemSpeed(id, ability, terrain, mon) {
  if (!itemActive(id, ability, mon)) return 1;
  return id === "choice-scarf" ? 1.5 : id === "iron-ball" ? 0.5 : seedEffect(id, ability, terrain, mon) && ability === "unburden" ? 2 : 1;
}
export function isGrounded(types, ability, id = "none") {
  if (itemActive(id, ability) && id === "iron-ball") return true;
  if (itemActive(id, ability) && id === "air-balloon") return false;
  return !types.includes("flying") && !["levitate", "eelevate"].includes(ability);
}
export function itemDamage(id, { type, cat, se = false, ability, mon, moveName, firstUse = true } = {}) {
  if (!itemActive(id, ability, mon)) return 1;
  if (id === "life-orb") return 1.3;
  if (id === "expert-belt") return se ? 1.2 : 1;
  if (TYPE_ITEMS[id]) return type === TYPE_ITEMS[id] ? 1.2 : 1;
  if (id === "muscle-band") return cat === "physical" ? 1.1 : 1;
  if (id === "wise-glasses") return cat === "special" ? 1.1 : 1;
  if (id === "light-ball") return /^pikachu(?:-|$)/.test(mon?.slug || "") && !["Body Press", "Foul Play"].includes(moveName) ? 2 : 1;
  if (id === "normal-gem") return type === "normal" && firstUse ? 1.3 : 1;
  if (id === "type-item") return 1.2;
  if (id === "band-glasses") return 1.1;
  return 1;
}
export function itemAccuracy(id, ability, first = null, mon) {
  if (!itemActive(id, ability, mon)) return 1;
  return id === "wide-lens" ? 1.1 : id === "zoom-lens" && first === false ? 1.2 : 1;
}
export function resistBerry(id, type, effectiveness, ability, attackerAbility) {
  if (!itemActive(id, ability) || attackerAbility === "unnerve") return 1;
  return ((id === "resist-berry" && effectiveness > 1) || (RESIST_BERRIES[id] === type && (effectiveness > 1 || id === "chilan-berry"))) ? 0.5 : 1;
}
export function critChance(mv, id, ability, mon, targetAbility = null) {
  if (["battle-armor", "shell-armor"].includes(targetAbility)) return 0;
  if (/always (?:results in a critical hit|lands a critical hit)|always.*critical hit/i.test(mv.effect || "") || ["Wicked Blow", "Surging Strikes", "Flower Trick", "Storm Throw", "Frost Breath"].includes(mv.name)) return 1;
  let stages = /(?:high|increased) critical.hit|higher chance for a critical hit|critical.hit (?:ratio|rate).*(?:boost|higher)|1-stage Critical-Hit/i.test(mv.effect || "") ? 1 : 0;
  if (ability === "super-luck") stages++;
  if (itemActive(id, ability, mon)) {
    if (id === "scope-lens") stages++;
    if (id === "leek" && /^(?:sirfetchd|farfetchd)(?:-|$)/.test(mon?.slug || "")) stages += 2;
  }
  return [1 / 24, 1 / 8, 1 / 2, 1][Math.min(3, stages)];
}
export function usageItem(mon) {
  if (mon.isMega) return "mega-stone";
  const name = mon.usage?.items?.[0]?.[0];
  const canon = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return Object.keys(ITEM_CATALOG).find((id) => canon(ITEM_CATALOG[id].label) === canon(name)) || "none";
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function itemSelect(attrs, value = "none", mon = null, ability = null) {
  const id = normalizeItem(value, mon);
  const groups = new Map();
  for (const [key, it] of Object.entries(ITEMS)) {
    if (mon?.isMega ? key !== "mega-stone" : key === "mega-stone") continue;
    if (it.group === "Legacy assumptions" && key !== id) continue;
    if (!groups.has(it.group)) groups.set(it.group, []);
    groups.get(it.group).push(`<option value="${key}" ${key === id ? "selected" : ""}>${esc(it.label)}</option>`);
  }
  const note = ITEMS[id].note + (ability === "klutz" && id !== "none" ? " Klutz: item effect is suppressed." : "");
  return `<div class="item-picker"><select class="cl-sel" aria-label="Held item" ${attrs}>${[...groups].map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.join("")}</optgroup>`).join("")}</select><small class="item-note">${esc(note)}</small></div>`;
}
