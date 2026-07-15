// Abilities that change how a Pokémon takes damage of a given type. Used by the
// team builder's Defensive coverage so weaknesses/resists reflect the picked ability
// (Levitate → Ground ×0, Thick Fat → ½ Fire/Ice, Filter → ¾ vs super-effective, …).
//
// Each entry is either a per-type multiplier map, or a function (mult, atkType) => mult
// for effects that key off the incoming multiplier (Filter, Wonder Guard).
export const DEF_ABILITIES = {
  levitate: { ground: 0 },
  eelevate: { ground: 0 },   // Mega Eelektross (Champions-original): floats — Ground immunity
  "flash-fire": { fire: 0 },
  "well-baked-body": { fire: 0 },
  heatproof: { fire: 0.5 },
  "water-bubble": { fire: 0.5 },          // (also doubles Water attacks — offense, not here)
  "thick-fat": { fire: 0.5, ice: 0.5 },
  "water-absorb": { water: 0 },
  "storm-drain": { water: 0 },
  "dry-skin": { water: 0, fire: 1.25 },   // takes more from Fire
  "volt-absorb": { electric: 0 },
  "lightning-rod": { electric: 0 },
  "motor-drive": { electric: 0 },
  "sap-sipper": { grass: 0 },
  "earth-eater": { ground: 0 },
  "purifying-salt": { ghost: 0.5 },
  fluffy: { fire: 2 },                     // (also halves contact — needs move flags, skipped)
  // "reduce super-effective" family
  filter: (m) => (m > 1 ? m * 0.75 : m),
  "solid-rock": (m) => (m > 1 ? m * 0.75 : m),
  "prism-armor": (m) => (m > 1 ? m * 0.75 : m),
  // Shedinja: only super-effective hits land
  "wonder-guard": (m) => (m >= 2 ? m : 0),
};

export function affectsTyping(slug) {
  return Object.prototype.hasOwnProperty.call(DEF_ABILITIES, slug);
}

// The mon's abilities that change defensive typing (for the selector).
export function typingAbilities(mon) {
  return (mon.abilities || []).map((a) => a.slug).filter(affectsTyping);
}

// Default selected ability: the mon's most-used ability if it changes typing, else
// null (= types-only). Falls back to its first typing ability when no usage data.
export function defaultAbility(mon) {
  const tas = typingAbilities(mon);
  if (!tas.length) return null;
  const used = mon.usage && mon.usage.abilities;
  if (used && used.length) {
    for (const [name] of used) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (tas.includes(slug)) return slug;
    }
    return null;   // top ability isn't a typing one → don't assume
  }
  return tas[0];
}

// Apply the selected ability to a base type-effectiveness multiplier.
export function applyAbility(mult, atkType, abilitySlug) {
  const spec = abilitySlug && DEF_ABILITIES[abilitySlug];
  if (!spec) return mult;
  if (typeof spec === "function") return spec(mult);
  return atkType in spec ? mult * spec[atkType] : mult;
}
