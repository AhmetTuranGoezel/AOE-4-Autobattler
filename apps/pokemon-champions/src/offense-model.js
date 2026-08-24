// Shared offensive-ability model: how a mon's ONE active ability changes its damage.
// Used by the Damage lab (calc-view.js, full battle context) and the Moves table
// (moves-view.js, context-free expected damage). Single source of truth — moved out
// of calc-view.js verbatim so both views agree.

export const hasFlag = (mv, f) => (mv.flags || []).includes(f);

// Stat-stage multiplier (+1 = ×1.5, −1 = ×⅔ …).
export const stageMult = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));

// Offensive item presets (each ∈ Champions). mult(se, cat) → 1 | { m, note };
// Choice Scarf has no damage mult — it feeds the speed layer instead.
export const OFF_ITEMS = {
  none: { label: "No item", mult: () => 1 },
  "life-orb": { label: "Life Orb", mult: () => ({ m: 1.3, note: "Life Orb" }) },
  "expert-belt": { label: "Expert Belt", mult: (se) => (se ? { m: 1.2, note: "Expert Belt" } : 1) },
  "wide-lens": { label: "Wide Lens (+10% Acc)", accuracyBonus: 10, mult: () => 1 },
  "type-item": { label: "Type item ×1.2", mult: () => ({ m: 1.2, note: "type item" }) },
  "band-glasses": { label: "Band / Glasses", mult: (se, cat) => ({ m: 1.1, note: cat === "physical" ? "Muscle Band" : "Wise Glasses" }) },
  "choice-scarf": { label: "Choice Scarf (Spe ×1.5)", mult: () => 1 },
};

// Population Bomb rerolls accuracy for every strike and ends on its first miss.
export function expectedHitsForAccuracy(mv, hits, accuracy) {
  const p = Math.max(0, Math.min(1, accuracy));
  if (mv?.name !== "Population Bomb" || hits <= 1 || p >= 1) return hits * p;
  return p * (1 - p ** hits) / (1 - p);
}

export const OFF_ABIL = {
  "huge-power": ({ cat }) => (cat === "physical" ? { mult: 2, note: "Huge Power" } : null),
  "pure-power": ({ cat }) => (cat === "physical" ? { mult: 2, note: "Pure Power" } : null),
  "water-bubble": ({ mv }) => (mv.type === "water" ? { mult: 2, note: "Water Bubble" } : null),
  adaptability: () => ({ stab: 2, note: "Adaptability" }),
  technician: ({ bp }) => (bp <= 60 ? { mult: 1.5, note: "Technician" } : null),
  transistor: ({ mv }) => (mv.type === "electric" ? { mult: 1.5, note: "Transistor" } : null),
  "dragons-maw": ({ mv }) => (mv.type === "dragon" ? { mult: 1.5, note: "Dragon's Maw" } : null),
  "rocky-payload": ({ mv }) => (mv.type === "rock" ? { mult: 1.5, note: "Rocky Payload" } : null),
  steelworker: ({ mv }) => (mv.type === "steel" ? { mult: 1.5, note: "Steelworker" } : null),
  "steely-spirit": ({ mv }) => (mv.type === "steel" ? { mult: 1.5, note: "Steely Spirit" } : null),
  // weather-conditional
  "sand-force": ({ mv, weather }) => (weather === "sand" && ["ground", "rock", "steel"].includes(mv.type) ? { mult: 1.3, note: "Sand Force" } : null),
  "solar-power": ({ cat, weather }) => (weather === "sun" && cat === "special" ? { mult: 1.5, note: "Solar Power" } : null),
  // move-flag based
  "iron-fist": ({ mv }) => (hasFlag(mv, "Punch") ? { mult: 1.2, note: "Iron Fist" } : null),
  "tough-claws": ({ mv }) => (hasFlag(mv, "Contact") ? { mult: 1.3, note: "Tough Claws" } : null),
  "strong-jaw": ({ mv }) => (hasFlag(mv, "Bite") ? { mult: 1.5, note: "Strong Jaw" } : null),
  "mega-launcher": ({ mv }) => (hasFlag(mv, "Pulse") ? { mult: 1.5, note: "Mega Launcher" } : null),
  sharpness: ({ mv }) => (hasFlag(mv, "Slicing") ? { mult: 1.5, note: "Sharpness" } : null),
  "punk-rock": ({ mv }) => (hasFlag(mv, "Sound") ? { mult: 1.3, note: "Punk Rock" } : null),
  "sheer-force": ({ mv }) => ((mv.secondaries || []).length ? { mult: 1.3, note: "Sheer Force" } : null),
  // pinch boosters (assume active, flagged)
  overgrow: ({ mv }) => (mv.type === "grass" ? { mult: 1.5, note: "Overgrow" } : null),
  blaze: ({ mv }) => (mv.type === "fire" ? { mult: 1.5, note: "Blaze" } : null),
  torrent: ({ mv }) => (mv.type === "water" ? { mult: 1.5, note: "Torrent" } : null),
  swarm: ({ mv }) => (mv.type === "bug" ? { mult: 1.5, note: "Swarm" } : null),
  // paradox — boost the highest offensive stat in sun (Proto) / electric terrain (Quark)
  protosynthesis: ({ cat, weather, hiStat }) => (weather === "sun" && ((hiStat === "atk" && cat === "physical") || (hiStat === "spa" && cat === "special")) ? { mult: 1.3, note: "Protosynthesis" } : null),
  "quark-drive": ({ cat, terrain, hiStat }) => (terrain === "electric" && ((hiStat === "atk" && cat === "physical") || (hiStat === "spa" && cat === "special")) ? { mult: 1.3, note: "Quark Drive" } : null),
  // status-boosted (ctx.status = the user's specific status: none|brn|psn|par)
  guts: ({ cat, status }) => (status !== "none" && cat === "physical" ? { mult: 1.5, note: "Guts" } : null),
  "toxic-boost": ({ cat, status }) => (status === "psn" && cat === "physical" ? { mult: 1.5, note: "Toxic Boost" } : null),
  "flare-boost": ({ cat, status }) => (status === "brn" && cat === "special" ? { mult: 1.5, note: "Flare Boost" } : null),
  // raw attack boosters
  hustle: ({ cat }) => (cat === "physical" ? { mult: 1.5, note: "Hustle" } : null),
  "gorilla-tactics": ({ cat }) => (cat === "physical" ? { mult: 1.5, note: "Gorilla Tactics" } : null),
  // hits twice (2nd at 25%) — Mega Kangaskhan
  "parental-bond": () => ({ mult: 1.25, note: "2 hits (Parental Bond)" }),
  // Kingambit: ×1.1 per fainted ally — team state we can't know; numbers show 0 fallen
  "supreme-overlord": () => ({ mult: 1, note: "×1.1/fallen ally not counted" }),
  // Champions-original mega abilities
  "fairy-aura": ({ mv }) => (mv.type === "fairy" ? { mult: 4 / 3, note: "Fairy Aura" } : null),
  "fire-mane": ({ mv }) => (mv.type === "fire" ? { mult: 1.5, note: "Fire Mane" } : null),
  // effectiveness / order based
  "tinted-lens": ({ typeEff }) => (typeEff < 1 ? { mult: 2, note: "Tinted Lens" } : null),
  neuroforce: ({ typeEff }) => (typeEff > 1 ? { mult: 1.25, note: "Neuroforce" } : null),
  analytic: ({ first }) => (first === false ? { mult: 1.3, note: "Analytic" } : null),
  reckless: ({ mv }) => (/recoil/i.test(mv.effect || "") ? { mult: 1.2, note: "Reckless" } : null),
};

// Damage effect of the ONE active ability.
export function abilityMods(ability, ctx) {
  const fn = ability && OFF_ABIL[ability];
  const res = fn && fn(ctx);
  if (!res) return { mult: 1, stab: null, notes: [] };
  return { mult: res.mult || 1, stab: res.stab || null, notes: res.note ? [res.note] : [] };
}

// Highest non-HP base stat key (for Protosynthesis / Quark Drive).
export const hiStatOf = (mon) => { const s = mon.stats; return ["atk", "def", "spa", "spd", "spe"].reduce((m, k) => (s[k] > s[m] ? k : m), "atk"); };

// -ate abilities retype Normal moves (and ×1.2); Protean/Libero give STAB to every move.
export const ATE_ABIL = { aerilate: "flying", pixilate: "fairy", refrigerate: "ice", galvanize: "electric", dragonize: "dragon" };   // dragonize = Mega Feraligatr (Champions)
export const PROTEAN = new Set(["protean", "libero"]);

// The attacker's default active ability: its most-used from usage, else its first.
export function offDefaultAbility(mon) {
  const abils = (mon.abilities || []).map((a) => a.slug);
  if (!abils.length) return null;
  const used = mon.usage && mon.usage.abilities;
  if (used && used.length) {
    for (const [name] of used) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (abils.includes(slug)) return slug;
    }
  }
  return abils[0];
}

// --- helpers for context-free views (the Moves table) --------------------------------

// The subset of a mon's abilities that can change its damage output.
// Abilities that change Expected Power through ACCURACY rather than a damage multiplier — they still
// belong in the damage picture (No Guard makes a 70%-accurate Hurricane land every time).
export const ACC_ABIL = new Set(["no-guard", "compound-eyes"]);
export function damageAbilities(mon) {
  return (mon.abilities || []).map((a) => a.slug)
    .filter((s) => s in OFF_ABIL || s in ATE_ABIL || PROTEAN.has(s) || ACC_ABIL.has(s));
}

// Ability effect on one move WITHOUT a battle: neutral context normally; with
// bestCase, conditional abilities (weather / terrain / status / pinch) count at their
// most favorable state. Target-dependent abilities (Tinted Lens, Neuroforce, Analytic)
// never fire here — they need a real matchup.
// Returns { mult, stab, acc, retype, note }.
export function offenseMult(ability, mon, mv, bp, bestCase, field = {}) {
  const out = { mult: 1, stab: null, acc: 1, alwaysHits: false, retype: null, note: "" };
  if (!ability) return out;
  const cat = mv.class;
  if (ATE_ABIL[ability] && mv.type === "normal") {   // -ate: retype Normal + ×1.2
    out.retype = ATE_ABIL[ability];
    out.mult *= 1.2;
    out.note = "→ " + out.retype;
  }
  if (PROTEAN.has(ability)) { out.stab = 1.5; out.note = "Protean"; }
  const hiStat = hiStatOf(mon);
  // A field the caller has actually pinned (Rain, Electric Terrain …) is REAL: best-case must not
  // upgrade it to "whichever weather flatters this ability most" — it only explores what's still unset.
  const weather = field.weather && field.weather !== "none" ? field.weather : "none";
  const terrain = field.terrain && field.terrain !== "none" ? field.terrain : "none";
  const base = { mv, cat, bp, weather, terrain, status: "none", typeEff: 1, first: null, hiStat };
  const ctxs = bestCase
    ? [base,
      ...(weather === "none" ? [{ ...base, weather: "sand" }, { ...base, weather: "sun" }, { ...base, weather: "rain" }, { ...base, weather: "snow" }] : []),
      ...(terrain === "none" ? [{ ...base, terrain: "electric" }] : []),
      { ...base, status: "brn" }, { ...base, status: "psn" }]
    : [base];
  let best = { mult: 1, stab: null, notes: [] };
  for (const ctx of ctxs) {
    const r = abilityMods(ability, ctx);
    if (r.mult > best.mult || (r.stab && !best.stab)) best = r;
  }
  out.mult *= best.mult;
  // a stab-modifying ability (Adaptability) only upgrades REAL STAB — the mon must have the
  // move's (post--ate) type, exactly like the calc's matchup math gates it
  const stabOk = best.stab && mon.types.includes(out.retype || mv.type);
  if (stabOk) out.stab = best.stab;
  // drop the ability's note when its only contribution was a stab boost that didn't apply
  if (best.notes.length && (best.mult !== 1 || stabOk)) out.note = out.note ? `${out.note} · ${best.notes[0]}` : best.notes[0];
  if (ability === "hustle" && cat === "physical") out.acc = 0.8;   // Hustle's accuracy cost
  if (ability === "compound-eyes") out.acc = 1.3;                  // Compound Eyes sharpens every move
  if (ability === "no-guard") out.alwaysHits = true;               // No Guard — accuracy stops mattering
  return out;
}
