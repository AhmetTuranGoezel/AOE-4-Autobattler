// Manual damage calculator. You type the raw stats and pick everything with
// chips: the move type + defender type(s) auto-compute effectiveness, stat stages
// give effective Atk/Def, and STAB/Crit/Weather/Burn are chip toggles. Shows the
// Gen-9 formula and the min–max range from the 16 damage rolls (0.85–1.00).
import { TYPES, TYPE_COLORS, displayName, grassKnotBP } from "./data.js";
import { statsFor, roleOf } from "./effective-stats.js";
import { attachAutocomplete } from "./autocomplete.js";
import { defaultAbility, applyAbility } from "./type-defense.js";
import { POOL, CAP, pointsUsed } from "./stat-lab.js";

const pokeRound = (v) => { const f = Math.floor(v); return v - f > 0.5 ? f + 1 : f; };
const stageMult = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const fmtMult = (v) => (v === 0.25 ? "¼" : v === 0.5 ? "½" : v === 0.75 ? "¾" : String(v));

const MODGROUPS = {
  stab: { label: "STAB", opts: [["None", 1], ["×1.5", 1.5], ["×2 Adapt.", 2]] },
  crit: { label: "Crit", opts: [["No crit", 1], ["Crit ×1.5", 1.5]] },
  weather: { label: "Weather", opts: [["None", 1], ["Boost ×1.5", 1.5], ["Weaken ×0.5", 0.5]] },
  burn: { label: "Burn", opts: [["None", 1], ["Burn ×0.5", 0.5]] },
};

function computeDamage(p) {
  let base = 0;
  if (p.power && p.atk && p.def) {
    base = Math.floor(2 * p.level / 5 + 2);
    base = Math.floor(base * p.power * p.atk / p.def);
    base = Math.floor(base / 50) + 2;
  }
  if (!base || p.type === 0) return { base, rolls: new Array(16).fill(0), min: 0, max: 0 };
  const rolls = [];
  for (let r = 85; r <= 100; r++) {
    let d = base;
    d = pokeRound(d * p.weather);
    d = pokeRound(d * p.crit);
    d = Math.floor(d * r / 100);
    d = pokeRound(d * p.stab);
    d = Math.floor(d * p.type);
    if (p.burn < 1) d = Math.floor(d * p.burn);
    d = pokeRound(d * p.other);
    rolls.push(Math.max(1, d));
  }
  return { base, rolls, min: Math.min(...rolls), max: Math.max(...rolls) };
}

// --- eHP breaker helpers --------------------------------------------------
// Offensive model for the "who can break this target" finder. Each roster mon is
// ranked by real damage (via computeDamage, the exact Gen-9 formula) vs the target's
// real Lv50 HP, folding in multi-hit, weight/speed-based power, the correct attacking/
// defending stat per move, offensive abilities, accuracy, and move practicality.
const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// Moves whose damage is a flat amount or a fraction of HP, and unmodelable "return" moves.
const FIXED_DMG = { "Seismic Toss": 50, "Night Shade": 50, "Sonic Boom": 20, "Dragon Rage": 40 };  // Lv50
const FRAC_HP = { "Super Fang": 0.5, "Nature's Madness": 0.5, Ruination: 0.5, "Guardian of Alola": 0.75 };
const FIXED_BP = { Return: 102, Frustration: 102, "Hidden Power": 60 };   // variable BP → representative value
const LOWHP_BP = new Set(["Flail", "Reversal"]);                          // BP rises as HP drops — assume full HP (weakest)
const SE_BOOST_MOVES = new Set(["Collision Course", "Electro Drift"]);    // ×1.3333 when super-effective
const COUNTER_MOVES = new Set(["Counter", "Mirror Coat", "Metal Burst"]);
// Damaging moves whose special mechanic isn't fully modeled → surface a "~approx" flag so the number isn't trusted blindly.
const UNMODELED = new Set(["Beat Up", "Fling", "Present", "Spit Up", "Trump Card", "Natural Gift", "Wring Out", "Crush Grip", "Punishment", "Stored Power", "Power Trip", "Grass Pledge", "Fire Pledge", "Water Pledge", "Eruption", "Water Spout", "Dragon Energy", "Final Gambit", "Endeavor"]);
const isOHKO = (mv) => /equal to the target's maximum hp/i.test(mv.effect || "");
// Turn-wasting / self-risking moves that shouldn't be a mon's headline threat:
// charge/recharge turns, fails-if-hit, user faints, ½-max-HP cost, crash on miss.
const RISKY_MOVES = new Set(["Focus Punch", "Explosion", "Self-Destruct", "Misty Explosion", "Final Gambit", "Steel Beam", "Mind Blown", "High Jump Kick", "Jump Kick"]);
const isDrawback = (mv) => (mv.flags || []).includes("Recharge") || (mv.flags || []).includes("Two-turn") || RISKY_MOVES.has(mv.name);
// Charge moves with special handling: `skip` = weather that removes the charge turn
// (fires instantly — no longer a drawback); `boost` = stat stage gained while charging
// that applies to the hit itself (+1 = ×1.5). Power Herb is not in Champions.
const CHARGE_MOVES = {
  "Electro Shot": { boost: "spa", skip: "rain" },
  "Meteor Beam": { boost: "spa" },
  "Solar Beam": { skip: "sun" },
  "Solar Blade": { skip: "sun" },
};

// Classify a move's base output. ctx = { userWeight, targetWeight, userSpe, targetSpe }.
// Returns one of: {kind:'normal', bp, hits, notes} | {kind:'fixed', dmg, notes}
//  | {kind:'frac', frac, notes} | {kind:'ohko', notes} | {kind:'skip', note}
function effectivePower(mv, ctx) {
  const name = mv.name || "";
  const eff = (mv.effect || "").toLowerCase();
  const notes = [];
  if (COUNTER_MOVES.has(name)) return { kind: "skip", note: "depends on the hit taken" };
  if (isOHKO(mv)) return { kind: "ohko", notes: ["OHKO"] };
  if (name in FIXED_DMG) return { kind: "fixed", dmg: FIXED_DMG[name], notes: ["fixed dmg"] };
  if (name in FRAC_HP) return { kind: "frac", frac: FRAC_HP[name], notes: [`${Math.round(FRAC_HP[name] * 100)}% HP`] };
  if (name in FIXED_BP) return { kind: "normal", bp: FIXED_BP[name], hits: 1, notes: [] };   // Return/Frustration/Hidden Power → representative BP
  if (LOWHP_BP.has(name)) return { kind: "normal", bp: 20, hits: 1, notes: ["low-HP move (assumes full HP)"] };   // Flail/Reversal weakest at full

  const done = (bp, hits = 1) => ({ kind: "normal", bp, hits, notes });
  if (name === "Triple Axel") { notes.push("3 hits"); return done(120); }   // 20+40+60
  if (name === "Triple Kick") { notes.push("3 hits"); return done(60); }    // 10+20+30
  if (name === "Grass Knot" || name === "Low Kick") { notes.push("weight"); return done(grassKnotBP(ctx.targetWeight || 0)); }
  if (name === "Heavy Slam" || name === "Heat Crash") {
    const r = ctx.targetWeight ? Math.floor((ctx.userWeight || 0) / ctx.targetWeight) : 0;
    notes.push("weight");
    return done(r >= 5 ? 120 : r === 4 ? 100 : r === 3 ? 80 : r === 2 ? 60 : 40);
  }
  if (name === "Gyro Ball") { notes.push("speed"); return done(ctx.userSpe ? Math.min(150, Math.floor((25 * (ctx.targetSpe || 0)) / ctx.userSpe) + 1) : 1); }
  if (name === "Electro Ball") {
    const r = ctx.targetSpe ? (ctx.userSpe || 0) / ctx.targetSpe : 0;
    notes.push("speed");
    return done(r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40);
  }
  let hits = 1;
  const range = eff.match(/hits (\w+) to (\w+) times/);
  const fixedH = eff.match(/hits (\w+) times/);
  if (range && NUMWORD[range[1]] && NUMWORD[range[2]]) {
    const lo = NUMWORD[range[1]], hi = NUMWORD[range[2]];
    hits = ctx.skillLink ? hi : lo === 2 && hi === 5 ? 3.1 : (lo + hi) / 2;   // Skill Link always max hits; 2–5 uses the Gen-5+ weighting
    if (ctx.skillLink && hi > 1) notes.push("Skill Link");
  } else if (fixedH && NUMWORD[fixedH[1]]) hits = NUMWORD[fixedH[1]];
  else if (/hits twice/.test(eff)) hits = 2;
  if (hits !== 1) notes.push(`${hits % 1 ? hits.toFixed(1) : hits}× hits`);
  return done(mv.power || 0, hits);
}

// Conditional-damage effects, resolved from the real battle state we track. Each fn gets
// c = { eb, first, st, target }: first = attacker moves first (speed layer); st = attacker
// settings (item/ability/boost); target = the configured defender (item, Mega-ness, …).
// Returns { mult, bpMul, note, blocked }; flags without mult mark conditions we can't verify.
const CONDITIONAL = {
  "Weather Ball": (c) => (c.eb.weather !== "none" ? { mult: 2, note: "×2 weather (type change ~approx)" } : null),
  "Solar Beam": (c) => (["sand", "rain", "snow"].includes(c.eb.weather) ? { mult: 0.5, note: "½ weather" } : null),
  "Solar Blade": (c) => (["sand", "rain", "snow"].includes(c.eb.weather) ? { mult: 0.5, note: "½ weather" } : null),
  Facade: (c) => (c.eb.userStatus !== "none" ? { mult: 2, note: "×2 status" } : null),
  Hex: (c) => (c.eb.targetStatus !== "none" ? { mult: 2, note: "×2 status" } : null),
  "Infernal Parade": (c) => (c.eb.targetStatus !== "none" ? { mult: 2, note: "×2 status" } : null),
  Venoshock: (c) => (c.eb.targetStatus === "psn" ? { mult: 2, note: "×2 poison" } : null),
  "Barb Barrage": (c) => (c.eb.targetStatus === "psn" ? { mult: 2, note: "×2 poison" } : null),
  "Dream Eater": (c) => (c.eb.targetStatus === "slp" ? { note: "vs sleep" } : { blocked: true, note: "needs sleep" }),
  Nightmare: (c) => (c.eb.targetStatus === "slp" ? null : { blocked: true, note: "needs sleep" }),
  // items — the attacker's OWN item (per-mon override honoured), and only removable target items
  Acrobatics: (c) => (c.st.item === "none" || c.st.ability === "klutz" ? { mult: 2, note: "×2 no item" } : null),
  "Knock Off": (c) => (c.eb.item === "none" ? null
    : c.target.mon.isMega ? { note: "no boost — Mega stone can't be removed" }
    : { mult: 1.5, note: "×1.5 removes item" }),
  Poltergeist: (c) => (c.eb.item === "none" ? { blocked: true, note: "needs a target item" } : { note: "uses target's item" }),
  "Steel Roller": (c) => (c.eb.terrain === "none" ? { blocked: true, note: "needs terrain" } : null),
  // speed order
  "Bolt Beak": (c) => (c.first ? { mult: 2, note: "×2 first" } : null),
  "Fishious Rend": (c) => (c.first ? { mult: 2, note: "×2 first" } : null),
  Avalanche: (c) => (c.first === false ? { mult: 2, note: "×2 moving 2nd" } : { note: "×2 if it moves 2nd" }),
  Payback: (c) => (c.first === false ? { mult: 2, note: "×2 moving 2nd" } : { note: "×2 if it moves 2nd" }),
  Revenge: (c) => (c.first === false ? { mult: 2, note: "×2 moving 2nd" } : { note: "×2 if it moves 2nd" }),
  // boosts
  "Stored Power": (c) => (c.st.boost > 0 ? { bpMul: 1 + c.st.boost, note: `+${c.st.boost} boosts` } : null),
  "Power Trip": (c) => (c.st.boost > 0 ? { bpMul: 1 + c.st.boost, note: `+${c.st.boost} boosts` } : null),
  // terrain
  "Rising Voltage": (c) => (c.eb.terrain === "electric" ? { mult: 2, note: "×2 terrain" } : null),
  "Expanding Force": (c) => (c.eb.terrain === "psychic" ? { mult: 1.5, note: "×1.5 terrain" } : null),
  "Terrain Pulse": (c) => (c.eb.terrain !== "none" ? { mult: 2, note: "×2 terrain (type change ~approx)" } : null),
  "Misty Explosion": (c) => (c.eb.terrain === "misty" ? { mult: 1.5, note: "×1.5 terrain" } : null),
  // conditions we can't verify from tracked state — surfaced as explicit flags
  Assurance: () => ({ note: "×2 if target already hit this turn" }),
  "Lash Out": () => ({ note: "×2 if its stats were lowered this turn" }),
  "Sucker Punch": () => ({ note: "fails unless the target attacks" }),
  "Fake Out": () => ({ note: "turn 1 only · flinches" }),
  "First Impression": () => ({ note: "turn 1 only" }),
  Belch: () => ({ note: "needs a berry eaten first" }),
  "Stomping Tantrum": () => ({ note: "×2 after a failed move" }),
  "Last Resort": () => ({ note: "needs all other moves used" }),
};
function conditionalMods(mv, ctx) {
  const fn = CONDITIONAL[mv.name];
  const r = fn && fn(ctx);
  if (!r) return { mult: 1, bpMul: 1, notes: [], blocked: false };
  return { mult: r.mult || 1, bpMul: r.bpMul || 1, notes: r.note ? [r.note] : [], blocked: !!r.blocked };
}

// The attacking stat a move actually uses (Foul Play = target's Atk; Body Press = user's Def).
// `key` = which stat a nature/boost/invest applies to.
function attackStat(entry, target, mv, cat) {
  if (mv.name === "Foul Play") return { base: target.lv.atk, invest: false, key: "atk", note: "target's Atk" };
  if (mv.name === "Body Press") return { base: entry.lv.def, invest: true, key: "def", note: "user's Def" };
  return { base: cat === "physical" ? entry.lv.atk : entry.lv.spa, invest: true, key: cat === "physical" ? "atk" : "spa", note: null };
}
// The defending stat a move hits (Psyshock family = Defense even though special).
const PSY_DEF = new Set(["Psyshock", "Psystrike", "Secret Sword"]);
const defendStat = (target, mv, cat) => (PSY_DEF.has(mv.name) ? target.lv.def : cat === "physical" ? target.lv.def : target.lv.spd);
// Same, but ignoring the target's boost stages (Sacred Sword / Chip Away / Darkest Lariat).
const defendStatRaw = (target, mv, cat) => (PSY_DEF.has(mv.name) ? target.defRaw : cat === "physical" ? target.defRaw : target.spdRaw);

// Offensive abilities. A mon has exactly ONE active ability (default = most-used from
// usage, overridable per attacker). ctx = { mv, cat, bp, weather }.
const hasFlag = (mv, f) => (mv.flags || []).includes(f);
const SPEED_ABIL = { "sand-rush": "sand", "swift-swim": "rain", chlorophyll: "sun", "slush-rush": "snow" };  // ×2 Spe in that weather
const MOLD_BREAKER = new Set(["mold-breaker", "teravolt", "turboblaze"]);   // ignore the target's ability
const PRIO_BLOCK = new Set(["dazzling", "queenly-majesty", "armor-tail"]);  // priority moves fail against these
const OFF_ABIL = {
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
  // effectiveness / order based
  "tinted-lens": ({ typeEff }) => (typeEff < 1 ? { mult: 2, note: "Tinted Lens" } : null),
  neuroforce: ({ typeEff }) => (typeEff > 1 ? { mult: 1.25, note: "Neuroforce" } : null),
  analytic: ({ first }) => (first === false ? { mult: 1.3, note: "Analytic" } : null),
  reckless: ({ mv }) => (/recoil/i.test(mv.effect || "") ? { mult: 1.2, note: "Reckless" } : null),
};
// Damage effect of the ONE active ability.
function abilityMods(ability, ctx) {
  const fn = ability && OFF_ABIL[ability];
  const res = fn && fn(ctx);
  if (!res) return { mult: 1, stab: null, notes: [] };
  return { mult: res.mult || 1, stab: res.stab || null, notes: res.note ? [res.note] : [] };
}
// Highest non-HP base stat key (for Protosynthesis / Quark Drive).
const hiStatOf = (mon) => { const s = mon.stats; return ["atk", "def", "spa", "spd", "spe"].reduce((m, k) => (s[k] > s[m] ? k : m), "atk"); };
// -ate abilities retype Normal moves (and ×1.2); Protean/Libero give STAB to every move.
const ATE_ABIL = { aerilate: "flying", pixilate: "fairy", refrigerate: "ice", galvanize: "electric" };
const PROTEAN = new Set(["protean", "libero"]);
// Moves that ignore the target's defensive stat changes (so a Def boost doesn't help).
const STAT_IGNORE = new Set(["Sacred Sword", "Chip Away", "Darkest Lariat"]);
// Target abilities that scale INCOMING damage (category / HP / field / status based).
const TARGET_DMG = {
  "fur-coat": ({ cat }) => (cat === "physical" ? 0.5 : 1),
  "ice-scales": ({ cat }) => (cat === "special" ? 0.5 : 1),
  multiscale: () => 0.5,          // assume full HP (a counter's first hit)
  "shadow-shield": () => 0.5,
  fluffy: ({ mv }) => (hasFlag(mv, "Contact") ? 0.5 : 1),   // ½ contact (its ×2 Fire is in DEF_ABILITIES)
  "punk-rock": ({ mv }) => (hasFlag(mv, "Sound") ? 0.5 : 1),
  intimidate: ({ cat }) => (cat === "physical" ? 2 / 3 : 1),
  "grass-pelt": ({ cat, terrain }) => (terrain === "grassy" && cat === "physical" ? 2 / 3 : 1),
  "marvel-scale": ({ cat, tStatus }) => (tStatus !== "none" && cat === "physical" ? 2 / 3 : 1),
};
// The attacker's default active ability: its most-used from usage, else its first.
function offDefaultAbility(mon) {
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

// --- nature / item / field-condition model (items verified present in Champions) ----
// Natures: +10% / -10% on the [plus, minus] stats. Neutral natures omitted (no effect).
const NATURE_MODS = {
  lonely: ["atk", "def"], brave: ["atk", "spe"], adamant: ["atk", "spa"], naughty: ["atk", "spd"],
  bold: ["def", "atk"], relaxed: ["def", "spe"], impish: ["def", "spa"], lax: ["def", "spd"],
  timid: ["spe", "atk"], hasty: ["spe", "def"], jolly: ["spe", "spa"], naive: ["spe", "spd"],
  modest: ["spa", "atk"], mild: ["spa", "def"], quiet: ["spa", "spe"], rash: ["spa", "spd"],
  calm: ["spd", "atk"], gentle: ["spd", "def"], sassy: ["spd", "spe"], careful: ["spd", "spa"],
};
function natureMult(nature, stat) {
  const n = NATURE_MODS[(nature || "").toLowerCase()];
  if (!n) return 1;
  return n[0] === stat ? 1.1 : n[1] === stat ? 0.9 : 1;
}
// Defensively-relevant natures for the target's picker (raise Def or SpD, or neutral).
const DEF_NATURES = ["Bold", "Impish", "Lax", "Relaxed", "Calm", "Careful", "Gentle", "Sassy", "Serious"];

// Offensive item presets (each ∈ Champions). mult folds into computeDamage's `other`;
// Choice Scarf has no damage mult — it feeds the speed layer instead.
const OFF_ITEMS = {
  none: { label: "No item", mult: () => 1 },
  "life-orb": { label: "Life Orb", mult: () => ({ m: 1.3, note: "Life Orb" }) },
  "expert-belt": { label: "Expert Belt", mult: (se) => (se ? { m: 1.2, note: "Expert Belt" } : 1) },
  "type-item": { label: "Type item ×1.2", mult: () => ({ m: 1.2, note: "type item" }) },   // assume the move-type booster (Charcoal/Magnet/…)
  "band-glasses": { label: "Band / Glasses", mult: (se, cat) => ({ m: 1.1, note: cat === "physical" ? "Muscle Band" : "Wise Glasses" }) },
  "choice-scarf": { label: "Choice Scarf (Spe ×1.5)", mult: () => 1 },
};
// The target holds ONE item (Champions-only). Offensive ones (Life Orb…) boost its return damage;
// defensive ones (Focus Sash / resist berry) help it take a hit; Scarf boosts its Speed.
const DEF_ITEMS = { none: "No item", "life-orb": "Life Orb", "expert-belt": "Expert Belt", "type-item": "Type item", "choice-scarf": "Choice Scarf (Spe ×1.5)", "focus-sash": "Focus Sash", "resist-berry": "Resist berry (½ SE)", leftovers: "Leftovers (+6% per turn)", "sitrus-berry": "Sitrus Berry (+25% once)" };

const WEATHERS = { none: "No weather", sand: "Sandstorm", snow: "Snow", rain: "Rain", sun: "Sun" };
const TERRAINS = { none: "No terrain", grassy: "Grassy", electric: "Electric", psychic: "Psychic", misty: "Misty" };
const SCREENS = { none: "No screen", reflect: "Reflect", "light-screen": "Light Screen", both: "Both screens" };
const EQ_MOVES = new Set(["Earthquake", "Bulldoze", "Magnitude"]);
// Spread moves (hit multiple targets) take ×0.75 in doubles — Champions is Reg M-B (doubles).
const isSpread = (mv) => mv.target === "all-opponents" || mv.target === "all-other-pokemon";

// Weather/terrain/screen multiplier on an attacker's damage for one move.
// Screens protect the TARGET only (skip via applyScreens=false for the target's own return
// damage); Infiltrator bypasses them.
function fieldOffenseMult(mv, cat, eb, infiltrator = false, applyScreens = true) {
  let m = 1; const notes = [];
  if (eb.weather === "rain") m *= mv.type === "water" ? 1.5 : mv.type === "fire" ? 0.5 : 1;
  else if (eb.weather === "sun") m *= mv.type === "fire" ? 1.5 : mv.type === "water" ? 0.5 : 1;
  if (m !== 1) notes.push(WEATHERS[eb.weather]);
  if (eb.terrain === "grassy") { if (mv.type === "grass") { m *= 1.3; notes.push("grassy"); } if (EQ_MOVES.has(mv.name)) { m *= 0.5; notes.push("grassy"); } }
  else if (eb.terrain === "electric" && mv.type === "electric") { m *= 1.3; notes.push("terrain"); }
  else if (eb.terrain === "psychic" && mv.type === "psychic") { m *= 1.3; notes.push("terrain"); }
  else if (eb.terrain === "misty" && mv.type === "dragon") { m *= 0.5; notes.push("misty"); }
  if (applyScreens && !infiltrator) {
    if ((eb.screen === "reflect" || eb.screen === "both") && cat === "physical") { m *= 0.5; notes.push("Reflect"); }
    if ((eb.screen === "light-screen" || eb.screen === "both") && cat === "special") { m *= 0.5; notes.push("Screen"); }
  } else if (applyScreens && infiltrator && eb.screen !== "none") notes.push("Infiltrator");
  return { m, notes };
}

export function initCalcView({ container, data, onOpen, onMoveInfo }) {
  const s = {
    level: 50, power: 90, category: "physical",
    atkStat: 150, atkStage: 0, defStat: 100, defStage: 0, hp: 0, other: 1,
    moveType: "", defTypes: [],
    stab: 1.5, crit: 1, weather: 1, burn: 1,
    showFormula: false,
    mode: "calc", // "calc" (manual) | "ehp" (eHP breaker)
  };
  // Counters lab: rank the roster against a chosen target under editable conditions.
  const EXCLUDE_KEY = "pc-move-exclude";
  const loadExcluded = () => { try { return new Set(JSON.parse(localStorage.getItem(EXCLUDE_KEY) || "[]")); } catch { return new Set(); } };
  const eb = {
    targetSlug: null,
    // target defensive config (prefilled from usage on pick)
    spread: { hp: 0, def: 0, spd: 0, spe: 0, atk: 0, spa: 0 }, nature: "Serious", defStage: 0, spdStage: 0, speStage: 0, targetMoves: null,
    ability: null, item: "none", weather: "none", terrain: "none", screen: "none",
    targetStatus: "none", userStatus: "none", doubles: true,   // doubles → spread moves ×0.75
    // global attacker offense preset
    atkInvest: 32, atkNature: "auto", atkItem: "none", atkBoost: 0, atkSpeed: "base", candBulk: "base",  // atkNature "auto" boosts the used stat; candBulk: candidates' HP for the survive math (base | hp = +32)
    // per-attacker overrides + which row is expanded
    overrides: new Map(), expanded: null,
    // rules + filters
    useAccuracy: true, excluded: loadExcluded(),
    threshold: "any", fTypesOff: new Set(), fTypeMode: "any", moveTypesOff: new Set(), fCat: "any", fRole: "any", fAvail: false, fMega: "all", fSurvive: false, fFaster: false, fSearch: "",
  };
  const saveExcluded = () => { try { localStorage.setItem(EXCLUDE_KEY, JSON.stringify([...eb.excluded])); } catch { /* ignore */ } };

  // ---- lab persistence: the working setup survives reloads; named target presets ----
  const STATE_KEY = "pc-counters-state", PRESETS_KEY = "pc-counters-presets";
  const LAB_FIELDS = ["targetSlug", "nature", "defStage", "spdStage", "speStage", "ability", "item", "targetMoves",
    "weather", "terrain", "screen", "targetStatus", "userStatus", "doubles",
    "atkInvest", "atkNature", "atkItem", "atkBoost", "atkSpeed", "candBulk", "useAccuracy",
    "threshold", "fTypeMode", "fCat", "fRole", "fAvail", "fMega", "fSurvive", "fFaster"];
  function serializeLab() {
    const s = { spread: { ...eb.spread }, fTypesOff: [...eb.fTypesOff], moveTypesOff: [...eb.moveTypesOff], overrides: Object.fromEntries(eb.overrides) };
    LAB_FIELDS.forEach((k) => (s[k] = eb[k]));
    return s;
  }
  function applyLab(s) {
    if (!s || (s.targetSlug && !bySlug.has(s.targetSlug))) return;
    LAB_FIELDS.forEach((k) => { if (s[k] !== undefined) eb[k] = s[k]; });
    if (s.spread) eb.spread = { hp: 0, def: 0, spd: 0, spe: 0, atk: 0, spa: 0, ...s.spread };
    eb.fTypesOff = new Set(s.fTypesOff || []);
    eb.moveTypesOff = new Set(s.moveTypesOff || []);
    eb.overrides = new Map(Object.entries(s.overrides || {}));
    eb.expanded = null;
  }
  const saveLab = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(serializeLab())); } catch { /* ignore */ } };
  const loadPresets = () => { try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]"); } catch { return []; } };
  const savePresets = (list) => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
  const roster = data.pokemon.map((mon) => ({ mon, lv: statsFor(mon, "lv50") }));
  const bySlug = new Map(data.pokemon.map((m) => [m.slug, m]));
  const movesByName = new Map(Object.values(data.moves).map((m) => [m.name, m]));  // for the target's usage moveset
  const moveIdByName = new Map(Object.entries(data.moves).map(([id, m]) => [m.name, Number(id)]));
  const nameOf = (m) => m._display || displayName(m);
  const capNat = (x) => x[0].toUpperCase() + x.slice(1);
  const NAT_NAMES = Object.fromEntries(Object.keys(NATURE_MODS).map((n) => [capNat(n), capNat(n)]));   // all named natures
  // Attacker natures include the smart "auto" (+10% to whatever stat the move uses — Def for Body Press);
  // target natures are named-only.
  const natSelect = (dataAttr, cur, withAuto = false) => {
    const opts = { Serious: "Neutral", ...(withAuto ? { auto: "+Attacking stat" } : {}), ...NAT_NAMES };
    if (!(cur in opts)) opts[cur] = cur;
    return `<select class="cl-sel" ${dataAttr}>${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  };

  const typeChips = (attr) => TYPES.map((t) =>
    `<button class="type-chip" data-${attr}="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("");

  const modGroups = Object.entries(MODGROUPS).map(([k, g]) => `<div class="mod-group">
    <span class="mod-label">${g.label}</span>
    <div class="seg mod-seg">${g.opts.map(([n, v]) =>
      `<button class="mod-opt" data-mod="${k}" data-val="${v}">${n}</button>`).join("")}</div>
  </div>`).join("");

  const stage = (which) => `<div class="stage"><button class="stage-btn" data-stage="${which}" data-dir="-1">−</button>` +
    `<span class="stage-val" id="${which}-stage">+0</span><button class="stage-btn" data-stage="${which}" data-dir="1">+</button></div>`;

  container.innerHTML = `<div class="calc">
    <div class="calc-head">
      <div class="calc-modes seg">
        <button data-calcmode="calc" class="active">Calculator</button>
        <button data-calcmode="ehp">Counters</button>
      </div>
      <h2 class="calc-title-calc">Damage calculator</h2>
      <p class="calc-note calc-title-calc">Type the stats, pick the types &amp; modifiers with chips. Range = the 16 rolls (0.85–1.00). Champions battles are Level 50.</p>
      <h2 class="calc-title-ehp" hidden>Counters <small class="muted">— who breaks a popular target, under your conditions</small></h2>
      <p class="calc-note calc-title-ehp" hidden>Pick a target — its defensive set prefills from real ladder usage; edit its investment, nature, boosts, ability and field conditions. Set the attackers' offense preset, exclude junk moves (saved), and filter the roster. Real Gen-9 damage (0.85–1.00 roll) vs its real HP.</p>
    </div>

    <div class="ehp-breaker" id="calc-mode-ehp" hidden>
      <div class="cl-pick">
        <div class="ci cl-pick-target">Target Pokémon
          <div class="ac-wrap"><input class="ehp-target-input" placeholder="Search a popular target…" autocomplete="off"></div>
        </div>
        <div class="ci cl-pick-search">Filter attackers by name
          <input class="ehp-atk-search" placeholder="type a name…" autocomplete="off">
        </div>
        <div class="ci cl-pick-exclude">Exclude an attack <small>(saved)</small>
          <div class="ac-wrap"><input class="ehp-exclude-input" placeholder="add a move to ignore…" autocomplete="off"></div>
        </div>
        <div class="ci cl-pick-tmove">Add a target move <small>(what it hits back with)</small>
          <div class="ac-wrap"><input class="ehp-tmove-input" placeholder="add a move to the target…" autocomplete="off"></div>
        </div>
      </div>
      <div id="ehp-presets" class="cl-presets"></div>
      <div id="ehp-controls" class="cl-controls"></div>
      <div id="ehp-filters" class="cl-filters"></div>
      <div class="ehp-results" id="ehp-results"></div>
    </div>

    <div class="calc-grid" id="calc-mode-calc">
      <div class="calc-form">
        <section class="calc-card">
          <h3>Move</h3>
          <div class="calc-row">
            <label class="ci">Base power<input type="number" data-in="power" min="0" value="${s.power}"></label>
            <div class="ci">Category<div class="seg calc-cat"><button data-cat="physical" class="active">Physical</button><button data-cat="special">Special</button></div></div>
          </div>
          <div class="ci">Move type<div class="type-chips" id="mtype">${typeChips("mtype")}</div></div>
        </section>

        <section class="calc-card">
          <h3>Attacker</h3>
          <div class="calc-row">
            <label class="ci">Level<input type="number" data-in="level" min="1" max="100" value="${s.level}"></label>
            <div class="ci"><span class="lbl-a">Attack</span>
              <div class="stat-stage"><input type="number" data-in="atkStat" min="1" value="${s.atkStat}">${stage("atk")}</div>
              <span class="eff-readout" id="eff-atk"></span></div>
          </div>
        </section>

        <section class="calc-card">
          <h3>Defender</h3>
          <div class="calc-row">
            <div class="ci"><span class="lbl-d">Defense</span>
              <div class="stat-stage"><input type="number" data-in="defStat" min="1" value="${s.defStat}">${stage("def")}</div>
              <span class="eff-readout" id="eff-def"></span></div>
            <label class="ci">Target HP <small>(optional)</small><input type="number" data-in="hp" min="0" value="${s.hp}"></label>
          </div>
          <div class="ci">Defender type(s) <small>up to 2</small><div class="type-chips" id="dtype">${typeChips("dtype")}</div>
            <span class="type-eff" id="type-eff"></span></div>
        </section>

        <section class="calc-card">
          <h3>Modifiers</h3>
          ${modGroups}
          <label class="ci other-row">Other multiplier <small>(item / ability)</small><input type="number" data-in="other" min="0" step="0.05" value="${s.other}"></label>
        </section>
      </div>

      <div class="calc-result-wrap">
        <div class="calc-result">
          <div class="calc-dmg" id="calc-dmg"></div>
          <div class="hp-wrap" id="hp-wrap"></div>
          <div class="calc-pct" id="calc-pct"></div>
        </div>
        <div class="calc-formula" id="calc-formula"></div>
      </div>
    </div>
  </div>`;

  const $ = (sel) => container.querySelector(sel);

  // Pick a target and prefill its defensive set from real ladder usage.
  function setTarget(slug, keepConfig = false) {
    const mon = bySlug.get(slug);
    if (!mon) return;
    eb.targetSlug = slug;
    if (!keepConfig) {
      const u = mon.usage || {};
      const sp = u.spread || {};
      // usage.spread lists each stat's most-common investment INDEPENDENTLY, so the six
      // values can sum past the game's 66-point pool. Build a legal spread by allocating
      // greedily in usage-% order until the pool runs out.
      eb.spread = { hp: 0, def: 0, spd: 0, spe: 0, atk: 0, spa: 0 };
      let pool = POOL;
      Object.entries(sp)
        .map(([k, v]) => ({ k, pts: (v || [0])[0] || 0, pct: (v || [0, 0])[1] || 0 }))
        .filter((x) => x.pts > 0 && x.k in eb.spread)
        .sort((a, b) => b.pct - a.pct)
        .forEach((x) => { const give = Math.min(x.pts, CAP, pool); eb.spread[x.k] = give; pool -= give; });
      eb.nature = (u.natures && u.natures[0] && u.natures[0][0]) || "Serious";
      eb.ability = offDefaultAbility(mon);   // its actual most-used ability (may be Multiscale, Intimidate, …)
      eb.targetMoves = (u.moves || []).map(([nm]) => moveIdByName.get(nm)).filter((id) => id != null && data.moves[id] && data.moves[id].class !== "status" && data.moves[id].type).slice(0, 4);  // prefill its usage moveset
      eb.defStage = 0; eb.spdStage = 0; eb.speStage = 0; eb.item = "none";
      eb.weather = "none"; eb.terrain = "none"; eb.screen = "none"; eb.targetStatus = "none"; eb.userStatus = "none";
      eb.expanded = null;
    }
    renderEb();
  }
  attachAutocomplete(container.querySelector(".ehp-target-input"), {
    items: () => data.pokemon.map((m) => ({ value: m.slug, name: nameOf(m), icon: `<img src="${m.sprite || m.artwork || ""}" alt="">` })),
    onPick: (slug) => setTarget(slug),
  });
  // exclude any attack (not just the ones showing) — persisted
  const damagingMoves = Object.entries(data.moves).filter(([, mv]) => mv && mv.class !== "status" && mv.type)
    .map(([id, mv]) => ({ value: Number(id), name: mv.name, icon: `<span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span>` }));
  attachAutocomplete(container.querySelector(".ehp-exclude-input"), {
    items: () => damagingMoves.filter((m) => !eb.excluded.has(m.value)),
    onPick: (id) => { eb.excluded.add(id); saveExcluded(); renderEb(); },
  });
  // add a move to the TARGET's return set (only among moves it can learn)
  attachAutocomplete(container.querySelector(".ehp-tmove-input"), {
    items: () => {
      const mon = eb.targetSlug ? bySlug.get(eb.targetSlug) : null;
      if (!mon) return [];
      return mon.moves.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type)
        .map((mv) => ({ value: moveIdByName.get(mv.name), name: mv.name, icon: `<span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span>` }));
    },
    onPick: (id) => { if (!eb.targetMoves) eb.targetMoves = []; if (!eb.targetMoves.includes(id)) eb.targetMoves.push(id); renderEb(); },
  });

  const clampPts = (v) => Math.max(0, Math.min(32, v));
  container.addEventListener("input", (e) => {
    if (e.target.classList.contains("ehp-atk-search")) { eb.fSearch = e.target.value.trim().toLowerCase(); renderResults(); return; }
    const k = e.target.dataset.in;
    if (!k) return;
    s[k] = e.target.value === "" ? 0 : Number(e.target.value);
    render();
  });
  container.addEventListener("change", (e) => {
    const ovr = e.target.dataset.ovrsel;
    if (ovr) { setOverride(ovr, e.target.value); return; }
    const sel = e.target.dataset.ebsel;
    if (sel) { eb[sel] = e.target.type === "checkbox" ? e.target.checked : e.target.value; renderEb(); return; }
  });
  container.addEventListener("click", (e) => {
    // result rows: ✕ excludes the move, caret/controls adjust the attacker, the move opens
    // the move popup, the name/rest opens the mon.
    const rex = e.target.closest("[data-exclude]");
    if (rex) { eb.excluded.add(Number(rex.dataset.exclude)); saveExcluded(); renderEb(); return; }
    const rux = e.target.closest("[data-unexclude]");
    if (rux) { eb.excluded.delete(Number(rux.dataset.unexclude)); saveExcluded(); renderEb(); return; }
    const tgo = e.target.closest("[data-target-open]");
    if (tgo) { onOpen && onOpen(tgo.dataset.targetOpen); return; }   // click the target's name/sprite → detail popup
    const exp = e.target.closest("[data-expand]");
    if (exp) { eb.expanded = eb.expanded === exp.dataset.expand ? null : exp.dataset.expand; renderResults(); return; }
    const oa = e.target.closest("[data-ovrability]");
    if (oa) { setOverride("ability", oa.dataset.ovrability); return; }
    const oi = e.target.closest("[data-ovrinvest]");
    if (oi) { setOverride("invest", Number(oi.dataset.ovrinvest)); return; }
    const osp = e.target.closest("[data-ovrspeed]");
    if (osp) { setOverride("speed", osp.dataset.ovrspeed); return; }
    const ost = e.target.closest("[data-ovrstep]");
    if (ost) { const cur = (eb.overrides.get(eb.expanded) || {}).boost; const bse = cur !== undefined ? cur : eb.atkBoost; setOverride("boost", Math.max(-6, Math.min(6, bse + Number(ost.dataset.ovrstep)))); return; }
    if (e.target.closest("[data-ovrreset]")) { eb.overrides.delete(eb.expanded); renderResults(); return; }
    const rmi = e.target.closest("[data-move-info]");
    if (rmi) { onMoveInfo && onMoveInfo(Number(rmi.dataset.moveInfo)); return; }
    const op = e.target.closest(".ehp-row[data-open]");
    if (op) { onOpen && onOpen(op.dataset.open); return; }
    const cm = e.target.closest("[data-calcmode]");
    if (cm) { s.mode = cm.dataset.calcmode; syncMode(); return; }
    // --- counters-lab controls ---
    const tf = e.target.closest("[data-target-form]");
    if (tf) { setTarget(tf.dataset.targetForm, true); return; }
    const th = e.target.closest("[data-thresh]");
    if (th) { eb.threshold = th.dataset.thresh; renderEb(); return; }
    const pt = e.target.closest("[data-ebstep]");
    if (pt) {
      const [g, k] = pt.dataset.ebstep.split(".");
      if (g === "spread") {
        // ±2 (real spreads are 32/32/2-style), capped per-stat at 32 AND by the shared 66-point pool
        const cur = eb.spread[k] || 0;
        const room = POOL - (pointsUsed(eb.spread) - cur);
        eb.spread[k] = Math.max(0, Math.min(cur + Number(pt.dataset.dir) * 2, CAP, room));
      } else {
        eb[k] = clampPts((eb[k] || 0) + Number(pt.dataset.dir));
      }
      renderEb(); return;
    }
    const bs = e.target.closest("[data-ebstage]");
    if (bs) { const k = bs.dataset.ebstage; eb[k] = Math.max(-6, Math.min(6, eb[k] + Number(bs.dataset.dir))); renderEb(); return; }
    const ta = e.target.closest("[data-ebability]");
    if (ta) { eb.ability = ta.dataset.ebability === "null" ? null : ta.dataset.ebability; renderEb(); return; }
    const rf = e.target.closest("[data-ebreset]");
    if (rf) { setTarget(eb.targetSlug); return; }   // reset defenses to usage
    const tmr = e.target.closest("[data-tmove-remove]");
    if (tmr) { const id = Number(tmr.dataset.tmoveRemove); const cur = eb.targetMoves || currentTarget().threat.moves.map((mv) => moveIdByName.get(mv.name)); eb.targetMoves = cur.filter((x) => x !== id); renderEb(); return; }
    const ai = e.target.closest("[data-atkinvest]");
    if (ai) { eb.atkInvest = Number(ai.dataset.atkinvest); renderEb(); return; }
    if (e.target.closest("[data-acc-toggle]")) { eb.useAccuracy = !eb.useAccuracy; renderEb(); return; }
    // filters
    const ft = e.target.closest("[data-ftype]");
    if (ft) { const t = ft.dataset.ftype; eb.fTypesOff.has(t) ? eb.fTypesOff.delete(t) : eb.fTypesOff.add(t); renderEb(); return; }
    const fmt = e.target.closest("[data-fmtype]");
    if (fmt) { const t = fmt.dataset.fmtype; eb.moveTypesOff.has(t) ? eb.moveTypesOff.delete(t) : eb.moveTypesOff.add(t); renderEb(); return; }
    const ftm = e.target.closest("[data-ftypemode]");
    if (ftm) { eb.fTypeMode = ftm.dataset.ftypemode; renderEb(); return; }
    const tset = e.target.closest("[data-typeset]");
    if (tset) {   // All/None quick buttons for either type row
      const [row, act] = tset.dataset.typeset.split(".");
      const set = row === "atk" ? eb.fTypesOff : eb.moveTypesOff;
      set.clear();
      if (act === "none") TYPES.forEach((t) => set.add(t));
      renderEb(); return;
    }
    const fc = e.target.closest("[data-fcat]");
    if (fc) { eb.fCat = fc.dataset.fcat; renderEb(); return; }
    const fmg = e.target.closest("[data-fmega]");
    if (fmg) { eb.fMega = fmg.dataset.fmega; renderEb(); return; }
    const asp = e.target.closest("[data-atkspeed]");
    if (asp) { eb.atkSpeed = asp.dataset.atkspeed; renderEb(); return; }
    const cb = e.target.closest("[data-candbulk]");
    if (cb) { eb.candBulk = cb.dataset.candbulk; renderEb(); return; }
    if (e.target.closest("[data-preset-save]")) {
      const inp = $("#ehp-presets .cl-preset-name");
      const name = (inp && inp.value.trim()) || (eb.targetSlug ? `${nameOf(bySlug.get(eb.targetSlug))} setup` : "Preset");
      const list = loadPresets(); list.push({ id: Date.now(), name, state: serializeLab() });
      savePresets(list); renderPresets(); return;
    }
    const pl = e.target.closest("[data-preset-load]");
    if (pl) { const p = loadPresets().find((x) => String(x.id) === pl.dataset.presetLoad); if (p) { applyLab(p.state); renderEb(); } return; }
    const pd = e.target.closest("[data-preset-del]");
    if (pd) { savePresets(loadPresets().filter((x) => String(x.id) !== pd.dataset.presetDel)); renderPresets(); return; }
    const cat = e.target.closest(".calc-cat button");
    if (cat) { s.category = cat.dataset.cat; render(); return; }
    const mt = e.target.closest("[data-mtype]");
    if (mt) { s.moveType = s.moveType === mt.dataset.mtype ? "" : mt.dataset.mtype; render(); return; }
    const dt = e.target.closest("[data-dtype]");
    if (dt) {
      const t = dt.dataset.dtype, i = s.defTypes.indexOf(t);
      if (i >= 0) s.defTypes.splice(i, 1);
      else if (s.defTypes.length < 2) s.defTypes.push(t);
      render(); return;
    }
    const mo = e.target.closest(".mod-opt");
    if (mo) { s[mo.dataset.mod] = Number(mo.dataset.val); render(); return; }
    const st = e.target.closest(".stage-btn");
    if (st) {
      const key = st.dataset.stage === "atk" ? "atkStage" : "defStage";
      s[key] = Math.max(-6, Math.min(6, s[key] + Number(st.dataset.dir)));
      render();
      return;
    }
    if (e.target.closest(".fmono-toggle")) { s.showFormula = !s.showFormula; render(); }
  });

  function typeEff() {
    if (!s.moveType || !s.defTypes.length) return 1;
    return s.defTypes.reduce((e, t) => e * (data.typeChart[s.moveType]?.[t] ?? 1), 1);
  }

  function render() {
    const eff = typeEff();
    const effAtk = Math.floor(s.atkStat * stageMult(s.atkStage));
    const effDef = Math.max(1, Math.floor(s.defStat * stageMult(s.defStage)));
    const r = computeDamage({
      level: s.level, power: s.power, atk: effAtk, def: effDef, type: eff,
      stab: s.stab, crit: s.crit, weather: s.weather, burn: s.burn, other: s.other,
    });

    // selection highlights
    $(".lbl-a").textContent = s.category === "physical" ? "Attack" : "Sp. Atk";
    $(".lbl-d").textContent = s.category === "physical" ? "Defense" : "Sp. Def";
    container.querySelectorAll(".calc-cat button").forEach((b) => b.classList.toggle("active", b.dataset.cat === s.category));
    container.querySelectorAll("[data-mtype]").forEach((b) => b.classList.toggle("on", b.dataset.mtype === s.moveType));
    container.querySelectorAll("[data-dtype]").forEach((b) => b.classList.toggle("on", s.defTypes.includes(b.dataset.dtype)));
    container.querySelectorAll(".mod-opt").forEach((b) => b.classList.toggle("active", Number(b.dataset.val) === s[b.dataset.mod]));
    $("#atk-stage").textContent = (s.atkStage >= 0 ? "+" : "") + s.atkStage;
    $("#def-stage").textContent = (s.defStage >= 0 ? "+" : "") + s.defStage;
    $("#eff-atk").textContent = s.atkStage ? `→ ${effAtk}` : "";
    $("#eff-def").textContent = s.defStage ? `→ ${effDef}` : "";

    // type effectiveness read-out
    const effLabel = eff === 0 ? "Immune ×0" : `×${fmtMult(eff)}`;
    const effClass = eff === 0 ? "imm" : eff > 1 ? "se" : eff < 1 ? "nve" : "neutral";
    $("#type-eff").innerHTML = s.moveType
      ? `Effectiveness <span class="type-eff-badge ${effClass}">${effLabel}</span>`
      : `<span class="muted">pick a move type for effectiveness</span>`;

    const avg = r.max ? Math.round(r.rolls.reduce((a, b) => a + b, 0) / r.rolls.length) : 0;
    const aLbl = s.category === "physical" ? "Atk" : "Sp.Atk";
    const dLbl = s.category === "physical" ? "Def" : "Sp.Def";

    // result hero
    if (r.max === 0) {
      $("#calc-dmg").innerHTML = `<span class="calc-zero">0</span><span class="dmg-lab">no damage</span>`;
      $("#hp-wrap").innerHTML = ""; $("#calc-pct").textContent = "";
    } else {
      $("#calc-dmg").innerHTML = `<span class="dmg-nums">${r.min}<span class="dash">–</span>${r.max}</span>` +
        `<span class="dmg-lab">damage · effective ø ${avg}</span>`;
      if (s.hp > 0) {
        const minPct = Math.min(100, r.min / s.hp * 100);
        const maxPct = Math.min(100, r.max / s.hp * 100);
        $("#hp-wrap").innerHTML = `<div class="hpbar"><i class="hp-range" style="width:${maxPct}%"></i><i class="hp-min" style="width:${minPct}%"></i></div>`;
        const p = (x) => Math.round(x / s.hp * 1000) / 10;
        const hits = Math.ceil(s.hp / r.min);
        const ko = r.min >= s.hp ? "guaranteed OHKO"
          : r.max >= s.hp ? `possible OHKO · guaranteed ${hits}HKO`
            : `${hits}HKO`;
        const remMin = Math.max(0, s.hp - r.max), remMax = Math.max(0, s.hp - r.min);
        $("#calc-pct").innerHTML = `${p(r.min)}% – ${p(r.max)}% of ${s.hp} HP · <b>${ko}</b>` +
          `<span class="calc-remain">Health left after the hit: <b>${remMin} – ${remMax}</b> HP</span>`;
      } else {
        $("#hp-wrap").innerHTML = ""; $("#calc-pct").innerHTML = `<span class="muted">Enter Target HP to see % and remaining health.</span>`;
      }
    }

    // formula: plain-language explanation (+ exact formula behind a toggle)
    const pills = [["Base", r.base, "base"]];
    const add = (l, v) => { if (v !== 1) pills.push([l, "×" + fmtMult(v), v > 1 ? "up" : "down"]); };
    add("STAB", s.stab); add("Type", eff); add("Crit", s.crit);
    add("Weather", s.weather); add("Burn", s.burn); add("Other", s.other);
    pills.push(["random", "×0.85–1.00", "rand"]);

    const words = [];
    if (s.stab !== 1) words.push(`STAB ×${s.stab}`);
    if (eff !== 1) words.push(eff === 0 ? "immune" : eff > 1 ? `super-effective ×${fmtMult(eff)}` : `resisted ×${fmtMult(eff)}`);
    if (s.crit !== 1) words.push("crit ×1.5");
    if (s.weather !== 1) words.push(s.weather > 1 ? "weather ×1.5" : "weather ×0.5");
    if (s.burn !== 1) words.push("burn ×0.5");
    if (s.other !== 1) words.push(`other ×${s.other}`);
    const wordStr = words.length ? words.join(", ") + ", " : "";

    $("#calc-formula").innerHTML = `
      <div class="fpills">${pills.map(([l, v, c]) => `<span class="fpill ${c}"><span class="fpill-l">${l}</span><span class="fpill-v">${v}</span></span>`).join("")}</div>
      <div class="fexplain"><b>Base ${r.base}</b> from Level ${s.level}, ${s.power} power, ${effAtk} ${aLbl} vs ${effDef} ${dLbl}. Then ${wordStr}× the random roll (0.85–1.00) → <b>${r.min}–${r.max}</b> damage (effective ø ${avg}).</div>
      <button class="fmono-toggle">${s.showFormula ? "Hide" : "Show"} exact game formula</button>
      <div class="fmono" ${s.showFormula ? "" : "hidden"}>⌊⌊(⌊2·${s.level}÷5+2⌋ · ${s.power} · ${effAtk}) ÷ ${effDef}⌋ ÷ 50⌋ + 2 = ${r.base} → × STAB ${s.stab} × type ${fmtMult(eff)} × crit ${s.crit} × weather ${s.weather} × burn ${s.burn} × other ${s.other} × roll</div>`;
  }

  // ---- eHP breaker ----
  function syncMode() {
    container.querySelectorAll("[data-calcmode]").forEach((b) => b.classList.toggle("active", b.dataset.calcmode === s.mode));
    container.querySelectorAll(".calc-title-calc").forEach((el) => (el.hidden = s.mode !== "calc"));
    container.querySelectorAll(".calc-title-ehp").forEach((el) => (el.hidden = s.mode !== "ehp"));
    $("#calc-mode-calc").hidden = s.mode !== "calc";
    $("#calc-mode-ehp").hidden = s.mode !== "ehp";
    if (s.mode === "ehp") renderEb(); else render();
  }

  // Resolve the picked target into its EFFECTIVE Lv50 stats under the current config,
  // plus its own offense (for the "what it does back" reverse calc).
  function currentTarget() {
    const mon = eb.targetSlug ? bySlug.get(eb.targetSlug) : null;
    if (!mon) return null;
    const base = statsFor(mon, "lv50");
    const hp = base.hp + (eb.spread.hp || 0);
    let def = Math.floor((base.def + (eb.spread.def || 0)) * natureMult(eb.nature, "def"));
    let spd = Math.floor((base.spd + (eb.spread.spd || 0)) * natureMult(eb.nature, "spd"));
    if (eb.weather === "snow" && mon.types.includes("ice")) def = Math.floor(def * 1.5);   // Snow → Ice Def ×1.5
    if (eb.weather === "sand" && mon.types.includes("rock")) spd = Math.floor(spd * 1.5);  // Sand → Rock SpD ×1.5
    const defRaw = Math.max(1, def), spdRaw = Math.max(1, spd);   // before boost stages — for stat-ignore moves (Sacred Sword)
    const effDef = Math.max(1, Math.floor(def * stageMult(eb.defStage)));
    const effSpd = Math.max(1, Math.floor(spd * stageMult(eb.spdStage)));
    let spe = Math.max(1, Math.floor((base.spe + (eb.spread.spe || 0)) * natureMult(eb.nature, "spe") * stageMult(eb.speStage)));
    // the target's own speed ability + Choice Scarf count too (Swift Swim wall in rain, Scarf user…)
    if (eb.weather !== "none" && SPEED_ABIL[eb.ability] === eb.weather) spe *= 2;
    else if (eb.ability === "surge-surfer" && eb.terrain === "electric") spe *= 2;
    else if (eb.ability === "quick-feet" && eb.targetStatus !== "none") spe = Math.floor(spe * 1.5);
    if (eb.item === "choice-scarf" && eb.ability !== "klutz") spe = Math.floor(spe * 1.5);
    if (eb.targetStatus === "par" && eb.ability !== "quick-feet") spe = Math.floor(spe / 2);   // paralysis halves Speed
    // the threat's own attacking set (editable; prefilled from usage) for the reverse calc
    const u = mon.usage || {};
    const tAtk = Math.floor((base.atk + (eb.spread.atk || 0)) * natureMult(eb.nature, "atk"));
    const tSpa = Math.floor((base.spa + (eb.spread.spa || 0)) * natureMult(eb.nature, "spa"));
    const um = (u.moves || []).map(([nm]) => movesByName.get(nm)).filter((mv) => mv && mv.class !== "status" && mv.type);
    const pool = mon.moves.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type);
    const chosen = eb.targetMoves && eb.targetMoves.length ? eb.targetMoves.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type) : (um.length ? um : pool);
    const threat = { mon, atk: tAtk, spa: tSpa, def: effDef, spe, types: mon.types, ability: eb.ability, item: eb.item, weight: mon.weight, moves: chosen };
    return { mon, hp, def: effDef, spd: effSpd, spe, defRaw, spdRaw, ability: eb.ability, threat,
      lv: { hp, def: effDef, spd: effSpd, atk: base.atk, spe } };
  }

  // Per-attacker effective settings: overrides merged over the global preset.
  // Default ability: the override, else — when the field matches one of the mon's weather/terrain
  // speed abilities — that ability (rain set ⇒ a Swift Swim mon runs Swift Swim), else its most-used.
  function smartDefaultAbility(mon) {
    for (const a of mon.abilities || []) {
      if (eb.weather !== "none" && SPEED_ABIL[a.slug] === eb.weather) return a.slug;
      if (a.slug === "surge-surfer" && eb.terrain === "electric") return a.slug;
    }
    return offDefaultAbility(mon);
  }
  function atkSettings(entry) {
    const o = eb.overrides.get(entry.mon.slug) || {};
    return {
      ability: o.ability !== undefined ? o.ability : smartDefaultAbility(entry.mon),
      invest: o.invest !== undefined ? o.invest : eb.atkInvest,
      nature: o.nature !== undefined ? o.nature : eb.atkNature,
      item: o.item !== undefined ? o.item : eb.atkItem,
      boost: o.boost !== undefined ? o.boost : eb.atkBoost,
      speed: o.speed !== undefined ? o.speed : eb.atkSpeed,
    };
  }
  // Effective attacker Speed (invest + speed-boosting abilities + Choice Scarf).
  function attackerSpe(entry, st) {
    let spe = entry.lv.spe + (st.speed === "max" ? 32 : 0);
    const a = st.ability;
    if (eb.weather !== "none" && SPEED_ABIL[a] === eb.weather) spe *= 2;         // Sand Rush / Swift Swim / Chlorophyll / Slush Rush
    else if (a === "surge-surfer" && eb.terrain === "electric") spe *= 2;         // Surge Surfer
    else if (a === "quick-feet" && eb.userStatus !== "none") spe = Math.floor(spe * 1.5);
    else if ((a === "protosynthesis" && eb.weather === "sun") || (a === "quark-drive" && eb.terrain === "electric")) {
      if (hiStatOf(entry.mon) === "spe") spe = Math.floor(spe * 1.3);            // Paradox: Speed boosted if it's the highest stat
    }
    if (st.item === "choice-scarf" && a !== "klutz") spe = Math.floor(spe * 1.5);
    if (eb.userStatus === "par" && a !== "quick-feet") spe = Math.floor(spe / 2);   // paralysis halves Speed (Quick Feet ignores)
    return spe;
  }

  // Type effectiveness of a move vs a defender — with per-move overrides (Freeze-Dry, Flying Press,
  // Thousand Arrows) and the defender's ability (unless Mold Breaker).
  function typeEffOf(mvType, mvName, defTypes, defAbility, moldBreaker, scrappy = false) {
    let e = defTypes.reduce((x, t) => {
      let m = data.typeChart[mvType]?.[t] ?? 1;
      if (mvName === "Freeze-Dry" && t === "water") m = 2;                                     // Ice hits Water SE
      if ((mvName === "Thousand Arrows" || mvName === "Smack Down") && t === "flying") m = 1;  // Ground can hit Flying
      if (scrappy && t === "ghost" && (mvType === "normal" || mvType === "fighting")) m = 1;   // Scrappy hits Ghosts
      return x * m;
    }, 1);
    if (mvName === "Flying Press") e *= defTypes.reduce((x, t) => x * (data.typeChart.flying?.[t] ?? 1), 1);  // dual Fighting+Flying
    if (!moldBreaker) e = applyAbility(e, mvType, defAbility);
    return e;
  }

  // The THREAT's damage onto a candidate for one move (%HP min/max) — mirror of the forward calc,
  // honouring the target's ability/item/nature/spread + the candidate's defensive abilities.
  function threatEval(th, defEntry, mv) {
    const defHP = defEntry.lv.hp + (eb.candBulk === "hp" ? 32 : 0);   // candidates' bulk preset
    const ctx = { userWeight: th.weight, targetWeight: defEntry.mon.weight, userSpe: th.spe, targetSpe: defEntry.lv.spe, skillLink: th.ability === "skill-link" };
    const ep = effectivePower(mv, ctx);
    if (ep.kind === "skip" || ep.kind === "ohko") return null;
    const cat = mv.class;
    const moldBreaker = MOLD_BREAKER.has(th.ability);
    const typeEff = typeEffOf(mv.type, mv.name, defEntry.mon.types, defaultAbility(defEntry.mon), moldBreaker, th.ability === "scrappy");
    if (typeEff === 0) return null;
    const se = typeEff > 1;
    // conditionals with roles swapped: the TARGET is the user here (its status, its item as the
    // held item; the candidate's item/mega-ness for Knock Off etc.; "first" = target outspeeds)
    const cond = conditionalMods(mv, {
      eb: { ...eb, userStatus: eb.targetStatus, targetStatus: eb.userStatus, item: eb.atkItem },
      first: th.spe > defEntry.lv.spe,
      st: { item: th.item, ability: th.ability, boost: 0 },
      target: { mon: defEntry.mon },
    });
    if (cond.blocked) return null;
    let minPct, maxPct;
    if (ep.kind === "fixed") minPct = maxPct = (ep.dmg / defHP) * 100;
    else if (ep.kind === "frac") minPct = maxPct = ep.frac * 100;
    else {
      const am = abilityMods(th.ability, { mv, cat, bp: ep.bp, weather: eb.weather, terrain: eb.terrain, typeEff, first: true, hiStat: hiStatOf(th.mon), status: eb.targetStatus });
      const stab = th.types.includes(mv.type) ? (am.stab || 1.5) : 1;
      let atk = mv.name === "Foul Play" ? defEntry.lv.atk : mv.name === "Body Press" ? th.def : cat === "physical" ? th.atk : th.spa;
      const chg = CHARGE_MOVES[mv.name];
      if (chg && chg.boost && defaultAbility(defEntry.mon) !== "unaware") atk = Math.floor(atk * stageMult(1));   // its charge boost hits back too
      const def = cat === "physical" || PSY_DEF.has(mv.name) ? defEntry.lv.def : defEntry.lv.spd;
      let other = am.mult * cond.mult;
      if (th.item && th.ability !== "klutz" && OFF_ITEMS[th.item]) { const r = OFF_ITEMS[th.item].mult(se, cat); if (r && r.m) other *= r.m; }   // target's offensive item
      const field = fieldOffenseMult(mv, cat, eb, false, false); other *= field.m;   // screens protect the target, not the candidate
      if (eb.doubles && isSpread(mv)) other *= 0.75;
      if (TARGET_DMG[defaultAbility(defEntry.mon)]) other *= TARGET_DMG[defaultAbility(defEntry.mon)]({ mv, cat, terrain: eb.terrain, tStatus: "none" });  // candidate's Multiscale/Fur Coat/…
      const burn = eb.targetStatus === "brn" && cat === "physical" && th.ability !== "guts" && mv.name !== "Facade" ? 0.5 : 1;   // burned target's physical return is halved
      const r = computeDamage({ level: 50, power: Math.max(1, Math.round(ep.bp * cond.bpMul)), atk, def, type: typeEff, stab, crit: 1, weather: 1, burn, other });
      const hits = ep.hits || 1;
      minPct = (r.min * hits / defHP) * 100; maxPct = (r.max * hits / defHP) * 100;
    }
    return { mv, minPct, maxPct, prio: (mv.priority || 0) + (th.ability === "gale-wings" && mv.type === "flying" ? 1 : 0) };
  }
  // The target's move list onto a candidate, best-first (for the survive readout + expander).
  function threatMovesOnto(defEntry, target) {
    const rows = target.threat.moves.map((mv) => threatEval(target.threat, defEntry, mv)).filter(Boolean).sort((a, b) => b.maxPct - a.maxPct);
    return rows;
  }
  function threatBestOnto(entry, target) {
    const rows = threatMovesOnto(entry, target);
    const b = rows[0];
    return b ? { pct: b.maxPct, minPct: b.minPct, mv: b.mv, prio: b.prio } : { pct: 0, minPct: 0, mv: null, prio: 0 };
  }

  // Evaluate one move for an attacker vs the target under `st` (per-attacker settings). null = unusable.
  function evalMove(entry, target, mv, st, ctx, speFirst) {
    if (!mv || mv.class === "status" || !mv.type) return null;
    // -ate abilities retype Normal moves (Aerilate/Pixilate/…); the effective type drives eff/STAB.
    const ate = ATE_ABIL[st.ability] && mv.type === "normal" ? ATE_ABIL[st.ability] : null;
    const mvType = ate || mv.type;
    if (eb.moveTypesOff.has(mvType)) return null;   // move-type filter: don't use moves of dropped types
    const cat = mv.class;
    const ep = effectivePower(mv, ctx);
    if (ep.kind === "skip") return null;
    const moldBreaker = MOLD_BREAKER.has(st.ability);
    const typeEff = typeEffOf(mvType, mv.name, target.mon.types, target.ability, moldBreaker, st.ability === "scrappy");
    if (typeEff === 0) return null;
    const se = typeEff > 1;
    const cond = conditionalMods(mv, { eb, first: speFirst, st, target });
    if (cond.blocked) return null;
    const realHP = target.lv.hp;
    const charge = CHARGE_MOVES[mv.name];
    const chargeSkipped = !!(charge && charge.skip && eb.weather === charge.skip);
    let risky = isDrawback(mv);
    if (chargeSkipped) risky = false;   // Electro Shot in rain / Solar Beam in sun fire instantly
    let minPct, maxPct, laterMin = null, laterMax = null, notes = [...(ep.notes || []), ...cond.notes];
    if (chargeSkipped) notes.push(`fires instantly (${eb.weather})`);
    let noInvMax = 0, stab = 1, asNote = null, pw = null;
    if (moldBreaker) notes.push("Mold Breaker");
    // accuracy layer: No Guard (either side) → always hits; Hustle costs phys acc; weather evasion abilities
    let acc = mv.accuracy == null ? 100 : mv.accuracy;
    if (st.ability === "no-guard" || target.ability === "no-guard") { if (acc < 100) notes.push("No Guard"); acc = 100; }
    else {
      if (st.ability === "hustle" && cat === "physical") { acc = Math.round(acc * 0.8); notes.push("Hustle acc ×0.8"); }
      if ((target.ability === "sand-veil" && eb.weather === "sand") || (target.ability === "snow-cloak" && eb.weather === "snow")) { acc = Math.round(acc * 0.8); notes.push("evasion ×0.8"); }
    }

    if (ep.kind === "ohko") { minPct = maxPct = 100; noInvMax = 100; }
    else if (ep.kind === "fixed") { const p = (ep.dmg / realHP) * 100; minPct = maxPct = p; noInvMax = p; }
    else if (ep.kind === "frac") { const p = ep.frac * 100; minPct = maxPct = p; noInvMax = p; }
    else {
      const am = abilityMods(st.ability, { mv, cat, bp: ep.bp, weather: eb.weather, terrain: eb.terrain, typeEff, first: speFirst, hiStat: hiStatOf(entry.mon), status: eb.userStatus });
      const protean = PROTEAN.has(st.ability);
      stab = protean || entry.mon.types.includes(mvType) ? (am.stab || 1.5) : 1;
      const as = attackStat(entry, target, mv, cat);
      asNote = as.note;
      const def = STAT_IGNORE.has(mv.name) || st.ability === "unaware" ? defendStatRaw(target, mv, cat) : defendStat(target, mv, cat);   // Sacred Sword / attacker Unaware ignore boosts
      let atk = as.base;
      if (as.invest) {
        // "auto" = +10% to whatever stat the move uses (Atk / SpA / Def for Body Press); named natures via natureMult
        const natM = st.nature === "auto" ? 1.1 : natureMult(st.nature, as.key);
        atk = Math.floor((atk + st.invest) * natM);
        // Unaware target ignores the attacker's stat boosts (setup AND charge-turn boosts)
        if (st.boost && !(target.ability === "unaware")) atk = Math.max(1, Math.floor(atk * stageMult(st.boost)));
        if (charge && charge.boost === as.key && target.ability !== "unaware") {   // Electro Shot / Meteor Beam +1 SpA from the charge
          atk = Math.floor(atk * stageMult(1));
          notes.push("+1 SpA (charge)");
        }
      }
      let other = am.mult * cond.mult;
      am.notes.forEach((n) => notes.push(n));
      if (st.ability === "download" && ((cat === "physical" && target.def <= target.spd) || (cat === "special" && target.spd < target.def))) { other *= 1.5; notes.push("Download"); }
      if (SE_BOOST_MOVES.has(mv.name) && se) { other *= 4 / 3; notes.push("×1.33 SE"); }
      if (UNMODELED.has(mv.name)) notes.push("~approx");
      if (ate) { other *= 1.2; notes.push(`→ ${mvType}`); }   // -ate retype + ×1.2
      if (protean && !entry.mon.types.includes(mvType)) notes.push("Protean");
      if (st.item !== "none" && st.ability !== "klutz" && OFF_ITEMS[st.item]) { const r = OFF_ITEMS[st.item].mult(se, cat); if (r && r.m) { other *= r.m; if (r.note) notes.push(r.note); } }
      const field = fieldOffenseMult(mv, cat, eb, st.ability === "infiltrator"); other *= field.m; field.notes.forEach((n) => notes.push(n));
      if (eb.doubles && isSpread(mv)) { other *= 0.75; notes.push("spread"); }   // doubles spread reduction
      // one-time reductions apply to the FIRST hit only (full-HP shields / a consumed berry);
      // later hits in the KO simulation use the unshielded number.
      let oneTime = 1;
      if (eb.item === "resist-berry" && eb.ability !== "klutz" && se) { oneTime *= 0.5; notes.push("berry ½ (1st hit)"); }
      if (!moldBreaker && (target.ability === "multiscale" || target.ability === "shadow-shield")) { oneTime *= 0.5; notes.push(`${(data.abilities[target.ability] || {}).name} ½ (1st hit)`); }
      if (!moldBreaker && TARGET_DMG[target.ability] && target.ability !== "multiscale" && target.ability !== "shadow-shield") {
        const tdm = TARGET_DMG[target.ability]({ mv, cat, terrain: eb.terrain, tStatus: eb.targetStatus });
        if (tdm !== 1) { other *= tdm; notes.push(`${(data.abilities[target.ability] || {}).name || target.ability} ×${tdm.toFixed(2).replace(/\.?0+$/, "")}`); }
      }
      pw = Math.max(1, Math.round(ep.bp * cond.bpMul));
      // burn halves the burned user's physical damage — Guts and Facade ignore it
      const burn = eb.userStatus === "brn" && cat === "physical" && st.ability !== "guts" && mv.name !== "Facade" ? 0.5 : 1;
      if (burn < 1) notes.push("burn ½");
      const r = computeDamage({ level: 50, power: pw, atk, def, type: typeEff, stab, crit: 1, weather: 1, burn, other: other * oneTime });
      if (!r.max) return null;
      const hits = ep.hits || 1;
      minPct = (r.min * hits / realHP) * 100; maxPct = (r.max * hits / realHP) * 100;
      if (oneTime !== 1) {   // unshielded later-hit damage for the KO simulation
        const rl = computeDamage({ level: 50, power: pw, atk, def, type: typeEff, stab, crit: 1, weather: 1, burn, other });
        laterMin = (rl.min * hits / realHP) * 100; laterMax = (rl.max * hits / realHP) * 100;
      }
      noInvMax = as.invest && st.invest ? maxPct * (as.base / (as.base + st.invest)) : maxPct;
    }
    // one-hit guards: Disguise blocks the first single hit outright; Sash/Sturdy absorb a
    // would-be KO from full HP (multi-hit moves break all three)
    const singleHit = (ep.hits || 1) <= 1;
    let guard = null;
    if (target.ability === "disguise" && singleHit && !moldBreaker) guard = "Disguise";
    else if (maxPct >= 100 && singleHit) {
      if (eb.item === "focus-sash" && eb.ability !== "klutz") guard = "Sash";
      else if (target.ability === "sturdy" && !moldBreaker) guard = "Sturdy";
    }
    // honest KO count: sequential hits with one-time shields, Leftovers/Sitrus recovery
    const simOpts = {
      block: guard === "Disguise", absorb: guard === "Sash" || guard === "Sturdy",
      leftovers: eb.item === "leftovers" && eb.ability !== "klutz",
      sitrus: eb.item === "sitrus-berry" && eb.ability !== "klutz",
    };
    const nMin = simKO(minPct, laterMin ?? minPct, simOpts);
    const nBest = simKO(maxPct, laterMax ?? maxPct, simOpts);
    const prio = (mv.priority || 0) + (st.ability === "gale-wings" && mvType === "flying" ? 1 : 0);   // Gale Wings
    if (prio > 0 && PRIO_BLOCK.has(target.ability) && !moldBreaker) return null;   // Dazzling & co: priority moves fail
    const accW = eb.useAccuracy ? acc / 100 : 1;
    const expected = maxPct * accW * (risky ? 0.5 : 1);
    return { id: null /* set by movesVsTarget */, mv, effType: mvType, cat, kind: ep.kind, stab, asNote, typeEff, acc, risky, minPct, maxPct, nMin, nBest, noInvMax, expected, se, sash: !!guard, guard, prio, notes, pw };
  }

  // Sequential KO simulation on 100 HP: first hit may be shielded (Multiscale/berry already
  // folded into firstPct), Disguise blocks hit 1, Sash/Sturdy absorb a lethal hit from full,
  // Leftovers heals 6.25%/turn, Sitrus +25% once at ≤50%. Returns hits needed (99 = no KO).
  function simKO(firstPct, laterPct, o) {
    if (firstPct <= 0 && laterPct <= 0) return 99;
    let hp = 100, sitrus = o.sitrus, absorb = o.absorb, usedReal = false;
    for (let n = 1; n <= 12; n++) {
      let dmg;
      if (o.block && n === 1) dmg = 0;
      else if (!usedReal) { dmg = firstPct; usedReal = true; }
      else dmg = laterPct;
      const wasFull = hp >= 99.99;
      hp -= dmg;
      if (hp <= 0) {
        if (absorb && wasFull) { absorb = false; hp = 0.01; }   // Sash/Sturdy only work from full HP
        else return n;
      }
      if (sitrus && hp <= 50) { hp = Math.min(100, hp + 25); sitrus = false; }
      if (o.leftovers) hp = Math.min(100, hp + 6.25);
    }
    return 99;
  }

  // Every usable move for an attacker vs the target (sorted by max %), respecting exclusions.
  function movesVsTarget(entry, target, includeExcluded = false) {
    const st = atkSettings(entry);
    const ctx = { userWeight: entry.mon.weight, targetWeight: target.mon.weight, userSpe: attackerSpe(entry, st), targetSpe: target.spe, skillLink: st.ability === "skill-link" };
    const speFirst = attackerSpe(entry, st) > target.spe;
    const rows = [];
    for (const id of entry.mon.moves) {
      if (!includeExcluded && eb.excluded.has(id)) continue;
      const row = evalMove(entry, target, data.moves[id], st, ctx, speFirst);
      if (row) { row.id = id; rows.push(row); }
    }
    return rows.sort((a, b) => b.maxPct - a.maxPct);
  }

  // Best move each attacker has vs the target (null if none), + speed/survivability.
  function bestVsTarget(entry, target) {
    const st = atkSettings(entry);
    const cands = movesVsTarget(entry, target);
    if (!cands.length) return null;
    const reliable = cands.filter((c) => !c.risky);
    const best = (reliable.length ? reliable : cands).sort((a, b) => b.expected - a.expected)[0];
    const aSpe = attackerSpe(entry, st);
    const back = threatBestOnto(entry, target);
    // who moves first: higher move priority wins (Gale Wings included on both sides); else raw Speed
    const aPrio = best.prio || 0, tPrio = back.prio || 0;
    best.first = aPrio > tPrio ? true : aPrio < tPrio ? false : aSpe === target.spe ? "tie" : aSpe > target.spe;
    best.threatPct = back.pct; best.threatMin = back.minPct; best.threatMv = back.mv; best.ohkoBack = back.pct >= 100;
    return best;
  }

  // Verdicts come from the sequential KO simulation (one-time shields + recovery honoured).
  function verdict(row) {
    const g = row.guard ? ` (${row.guard})` : "";
    if (row.nMin >= 99 && row.nBest >= 99) return { txt: "no KO", cls: "ko-n" };
    if (row.nMin === 1) return { txt: "OHKO", cls: "ko-o" };
    if (row.nBest === 1) return { txt: "poss. OHKO", cls: "ko-op" };
    if (row.nMin >= 99) return { txt: `${row.nBest}HKO best case${g}`, cls: "ko-n" };
    return { txt: `${row.nMin}HKO${g}`, cls: row.nMin <= 2 ? "ko-2" : "ko-n" };
  }
  function meetsThreshold(row) {
    if (eb.threshold === "ohko") return row.nBest === 1;
    if (eb.threshold === "2hko") return row.nMin <= 2;
    if (eb.threshold === "3hko") return row.nMin <= 3;
    return row.maxPct > 0;
  }
  function passesFilters(entry, row) {
    const m = entry.mon;
    if (eb.fMega === "hide" && m.isMega) return false;
    if (eb.fMega === "only" && !m.isMega) return false;
    if (eb.fAvail && m.available === false) return false;
    if (eb.fTypesOff.size) {
      if (eb.fTypeMode === "any") {   // keep if at least ONE of its types is still lit
        if (!m.types.some((t) => !eb.fTypesOff.has(t))) return false;
      } else if (m.types.some((t) => eb.fTypesOff.has(t))) return false;   // strict: ALL its types must be lit
    }
    if (eb.fCat !== "any" && row.cat !== eb.fCat) return false;
    if (eb.fRole && eb.fRole !== "any" && roleOf(m) !== eb.fRole) return false;
    if (eb.fSurvive && row.ohkoBack) return false;                // hide mons the threat OHKOs back
    if (eb.fFaster && row.first !== true) return false;           // only ones that move first
    if (eb.fSearch && !nameOf(m).toLowerCase().includes(eb.fSearch)) return false;
    return true;
  }

  const typeSpan = (t) => `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`;
  const seg = (key, map, cur) => `<select class="cl-sel" data-ebsel="${key}">${Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const ptStepper = (label, key, val, title = "") => `<div class="cl-stat"${title ? ` title="${title}"` : ""}><span class="cl-stat-lab">${label}</span>
    <div class="cl-step"><button data-ebstep="${key}" data-dir="-1">−</button><b>${val}</b><button data-ebstep="${key}" data-dir="1">+</button></div></div>`;
  const stageStepper = (label, key, val, title = "") => `<div class="cl-stat"${title ? ` title="${title}"` : ""}><span class="cl-stat-lab">${label}</span>
    <div class="cl-step"><button data-ebstage="${key}" data-dir="-1">−</button><b>${val >= 0 ? "+" : ""}${val}</b><button data-ebstage="${key}" data-dir="1">+</button></div></div>`;

  // Controls: target card + defenses editor + conditions + attacker preset + rules.
  function renderControls(target) {
    const mon = target.mon;
    const forms = [];
    const base = data.pokemon.find((m) => m.dex === mon.dex && !m.isMega);
    if (base) forms.push(base);
    forms.push(...data.pokemon.filter((m) => m.dex === mon.dex && m.isMega));
    const formBtns = forms.length > 1 ? forms.map((f) =>
      `<button class="df-btn ${f.slug === mon.slug ? "on" : ""}" data-target-form="${f.slug}">${f.isMega ? (f.formLabel || "Mega") : "Base"}</button>`).join("") : "";
    const tabils = (mon.abilities || []).map((a) => a.slug);
    const abilRow = tabils.length ? `<div class="cl-abil"><span class="cl-stat-lab">Ability</span>
      <button class="tm-abil-chip ${eb.ability == null ? "on" : ""}" data-ebability="null">None</button>
      ${tabils.map((slug) => `<button class="tm-abil-chip ${eb.ability === slug ? "on" : ""}" data-ebability="${slug}">${(data.abilities[slug] || {}).name || slug}</button>`).join("")}</div>` : "";
    const excludedChips = eb.excluded.size ? `<div class="cl-excluded"><span class="cl-stat-lab">Excluded moves</span>
      ${[...eb.excluded].map((id) => data.moves[id] ? `<span class="cl-exchip">${data.moves[id].name}<button data-unexclude="${id}" aria-label="restore">✕</button></span>` : "").join("")}</div>` : "";

    return `<section class="calc-card cl-target">
      <div class="cl-target-head">
        <img class="ehp-target-spr cl-target-open" data-target-open="${mon.slug}" title="Open ${nameOf(mon)} details" src="${mon.artwork || mon.sprite || ""}" alt="">
        <div class="ehp-target-meta">
          <div class="ehp-target-name cl-target-open" data-target-open="${mon.slug}" title="Open ${nameOf(mon)} details">${nameOf(mon)} ${mon.isMega ? '<span class="mega-badge">MEGA</span>' : ""}</div>
          <div class="ehp-target-types">${mon.types.map(typeSpan).join("")}</div>
          ${formBtns ? `<div class="ehp-target-forms">${formBtns}</div>` : ""}
        </div>
        <div class="ehp-target-bulk">
          <div class="ehp-bulk hp"><span class="ehp-bulk-lab">HP</span><span class="ehp-bulk-val">${target.hp}</span></div>
          <div class="ehp-bulk phys"><span class="ehp-bulk-lab">Def</span><span class="ehp-bulk-val">${target.def}</span></div>
          <div class="ehp-bulk spec"><span class="ehp-bulk-lab">Sp.Def</span><span class="ehp-bulk-val">${target.spd}</span></div>
          <div class="ehp-bulk spe"><span class="ehp-bulk-lab">Spe</span><span class="ehp-bulk-val">${target.spe}</span></div>
        </div>
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Target set</span>
          <span class="cl-points ${pointsUsed(eb.spread) > POOL ? "over" : ""}">Points ${pointsUsed(eb.spread)}/${POOL}</span>
          <button class="btn-sm cl-reset" data-ebreset title="Reset to this mon's ladder usage">↺ usage</button></div>
        <div class="cl-editor">
          ${ptStepper("HP", "spread.hp", eb.spread.hp)}
          ${ptStepper("Def", "spread.def", eb.spread.def)}
          ${ptStepper("Sp.Def", "spread.spd", eb.spread.spd, "Special Defense — not Speed")}
          ${ptStepper("Speed", "spread.spe", eb.spread.spe, "Speed — decides who moves first")}
          ${ptStepper("Atk", "spread.atk", eb.spread.atk, "Attack — its physical damage back")}
          ${ptStepper("Sp.Atk", "spread.spa", eb.spread.spa, "Sp. Atk — its special damage back")}
          <div class="cl-stat"><span class="cl-stat-lab">Nature</span>${natSelect('data-ebsel="nature"', eb.nature)}</div>
          ${stageStepper("Def boost", "defStage", eb.defStage)}
          ${stageStepper("Sp.Def boost", "spdStage", eb.spdStage, "Special Defense — not Speed")}
          ${stageStepper("Speed boost", "speStage", eb.speStage)}
        </div>
        <div class="cl-tmoves"><span class="cl-stat-lab">Its moves</span>
          ${(target.threat.moves || []).map((mv) => `<span class="cl-exchip"><span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span>${mv.name}<button data-tmove-remove="${moveIdByName.get(mv.name)}" aria-label="remove">✕</button></span>`).join("") || '<small class="muted">no damaging moves</small>'}
        </div>
        ${abilRow}
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Field conditions</span></div>
        <div class="cl-conditions">
          <div class="cl-stat"><span class="cl-stat-lab">Weather</span>${seg("weather", WEATHERS, eb.weather)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Terrain</span>${seg("terrain", TERRAINS, eb.terrain)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Screen</span>${seg("screen", SCREENS, eb.screen)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Target item</span>${seg("item", DEF_ITEMS, eb.item)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Target status</span>${seg("targetStatus", { none: "Healthy", psn: "Poisoned", brn: "Burned", par: "Paralyzed", slp: "Asleep" }, eb.targetStatus)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Attacker status</span>${seg("userStatus", { none: "Healthy", brn: "Burned", psn: "Poisoned", par: "Paralyzed" }, eb.userStatus)}</div>
          <label class="cl-avail cl-doubles" title="Champions is doubles (Reg M-B): spread moves like Earthquake do ×0.75"><input type="checkbox" data-ebsel="doubles" ${eb.doubles ? "checked" : ""}> Doubles spread ×0.75</label>
        </div>
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Attackers — global preset</span>
          <button class="cl-acc ${eb.useAccuracy ? "on" : ""}" data-acc-toggle title="Weight ranking by accuracy">Accuracy ${eb.useAccuracy ? "on" : "off"}</button></div>
        <div class="cl-attacker">
          <div class="cl-stat"><span class="cl-stat-lab">Invest</span>
            <div class="seg cl-invest">${[[32, "Max"], [16, "Half"], [0, "None"]].map(([v, l]) => `<button data-atkinvest="${v}" class="${eb.atkInvest === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
          <div class="cl-stat"><span class="cl-stat-lab">Nature</span>${natSelect('data-ebsel="atkNature"', eb.atkNature, true)}</div>
          ${stageStepper("Boost", "atkBoost", eb.atkBoost)}
          <div class="cl-stat"><span class="cl-stat-lab">Speed</span>
            <div class="seg cl-invest">${[["base", "Base"], ["max", "Max"]].map(([v, l]) => `<button data-atkspeed="${v}" class="${eb.atkSpeed === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
          <div class="cl-stat"><span class="cl-stat-lab">Item</span>${seg("atkItem", Object.fromEntries(Object.entries(OFF_ITEMS).map(([k, v]) => [k, v.label])), eb.atkItem)}</div>
          <div class="cl-stat" title="How bulky the candidates are for the 'survives' math"><span class="cl-stat-lab">Their bulk</span>
            <div class="seg cl-invest">${[["base", "Base"], ["hp", "+32 HP"]].map(([v, l]) => `<button data-candbulk="${v}" class="${eb.candBulk === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
        </div>
        ${excludedChips}
      </div>
    </section>`;
  }

  function renderFilters() {
    const roleOpts = { any: "Any role", physical: "Physical", special: "Special", mixed: "Mixed", defensive: "Defensive" };
    return `<div class="cl-filter-bar">
      <div class="seg cl-catseg">${[["any", "All"], ["physical", "Phys"], ["special", "Spec"]].map(([v, l]) => `<button data-fcat="${v}" class="${eb.fCat === v ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="seg cl-megaseg">${[["all", "All"], ["hide", "No mega"], ["only", "Only mega"]].map(([v, l]) => `<button data-fmega="${v}" class="${eb.fMega === v ? "active" : ""}">${l}</button>`).join("")}</div>
      ${seg("fRole", roleOpts, eb.fRole)}
      <label class="cl-avail"><input type="checkbox" data-ebsel="fAvail" ${eb.fAvail ? "checked" : ""}> Available</label>
      <label class="cl-avail" title="Hide attackers the target OHKOs back"><input type="checkbox" data-ebsel="fSurvive" ${eb.fSurvive ? "checked" : ""}> Survives target</label>
      <label class="cl-avail" title="Only attackers that move first"><input type="checkbox" data-ebsel="fFaster" ${eb.fFaster ? "checked" : ""}> Outspeeds</label>
      <div class="seg ehp-thresh">${[["any", "Any dmg"], ["ohko", "OHKO"], ["2hko", "2HKO"], ["3hko", "3HKO"]].map(([v, l]) => `<button data-thresh="${v}" class="${eb.threshold === v ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="cl-typerow" title="Lit types are allowed; click a type to toggle it">
        <div class="cl-typectl">
          <span class="cl-typelab">Attacker type</span>
          <div class="seg cl-typemode">
            <button data-ftypemode="any" class="${eb.fTypeMode === "any" ? "active" : ""}" title="Keep attackers that have at least one lit type (Flying lit → every Flying-type)">Any of</button>
            <button data-ftypemode="strict" class="${eb.fTypeMode === "strict" ? "active" : ""}" title="Every one of the attacker's types must be lit — note: no mono-Flying exists, so 'Exact only' with just Flying lit matches nothing">Exact only</button>
          </div>
          <button class="btn-sm" data-typeset="atk.all">All</button>
          <button class="btn-sm" data-typeset="atk.none">None</button>
        </div>
        <div class="cl-ftypes">${TYPES.map((t) => `<button class="type-chip ${eb.fTypesOff.has(t) ? "off" : "on"}" data-ftype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
      </div>
      <div class="cl-typerow" title="Lit move types are used; click a type to stop using moves of that type">
        <div class="cl-typectl">
          <span class="cl-typelab">Move type</span>
          <button class="btn-sm" data-typeset="mv.all">All</button>
          <button class="btn-sm" data-typeset="mv.none">None</button>
        </div>
        <div class="cl-ftypes">${TYPES.map((t) => `<button class="type-chip ${eb.moveTypesOff.has(t) ? "off" : "on"}" data-fmtype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
      </div>
    </div>`;
  }

  function setOverride(key, val) {
    const slug = eb.expanded;
    if (!slug) return;
    const o = eb.overrides.get(slug) || {};
    o[key] = val;
    eb.overrides.set(slug, o);
    renderResults();
  }

  // Inline per-attacker inspector: ability + override controls + speed line + full move list.
  function renderAttackerPanel(entry, target) {
    const mon = entry.mon;
    const st = atkSettings(entry);
    const o = eb.overrides.get(mon.slug) || {};
    const abilChips = (mon.abilities || []).map((a) => `<button class="tm-abil-chip ${st.ability === a.slug ? "on" : ""}" data-ovrability="${a.slug}">${(data.abilities[a.slug] || {}).name || a.slug}</button>`).join("");
    const investSeg = `<div class="seg cl-invest">${[[32, "Max"], [16, "Half"], [0, "None"]].map(([v, l]) => `<button data-ovrinvest="${v}" class="${st.invest === v ? "active" : ""}">${l}</button>`).join("")}</div>`;
    const speedSeg = `<div class="seg cl-invest">${[["base", "Base"], ["max", "Max"]].map(([v, l]) => `<button data-ovrspeed="${v}" class="${st.speed === v ? "active" : ""}">${l}</button>`).join("")}</div>`;
    const natSel = natSelect('data-ovrsel="nature"', st.nature, true);
    const itemSel = `<select class="cl-sel" data-ovrsel="item">${Object.entries(OFF_ITEMS).map(([k, val]) => `<option value="${k}" ${st.item === k ? "selected" : ""}>${val.label}</option>`).join("")}</select>`;
    const boostStep = `<div class="cl-step"><button data-ovrstep="-1">−</button><b>${st.boost >= 0 ? "+" : ""}${st.boost}</b><button data-ovrstep="1">+</button></div>`;
    const aSpe = attackerSpe(entry, st);
    const abilName = (data.abilities[st.ability] || {}).name || st.ability || "—";
    const spV = aSpe > target.spe ? `<b class="sp-fast">outspeeds</b>` : aSpe < target.spe ? `<b class="sp-slow">slower</b>` : `<b>speed tie</b>`;
    // full move list vs the target under these settings
    const moves = movesVsTarget(entry, target, true).map((r) => {
      const v = verdict(r);
      const fl = [];
      if (r.se) fl.push(`<span class="ehp-flag se">SE ×${r.typeEff}</span>`);
      if (r.stab > 1) fl.push(`<span class="ehp-flag stab">STAB</span>`);
      if (eb.useAccuracy && r.acc < 100) fl.push(`<span class="ehp-flag acc">${r.acc}%</span>`);
      if (r.risky) fl.push(`<span class="ehp-flag risky">risky</span>`);
      r.notes.forEach((n) => fl.push(`<span class="ehp-flag mh">${n}</span>`));
      const excl = eb.excluded.has(r.id);
      return `<div class="apm-move ${excl ? "excl" : ""}" data-move-info="${r.id}">
        <span class="apm-mv"><span class="type tiny" style="background:${TYPE_COLORS[r.effType]}">${r.effType}</span>${r.mv.name}${r.pw ? `<small class="ehp-pw">${r.pw}</small>` : ""}</span>
        <span class="apm-pct">${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${v.cls}">${v.txt}</span>
        <span class="apm-fl">${fl.join("")}</span>
        <button class="ehp-x" ${excl ? `data-unexclude="${r.id}"` : `data-exclude="${r.id}"`} title="${excl ? "re-include this move" : "exclude this move"}">${excl ? "＋" : "✕"}</button>
      </div>`;
    }).join("");
    // what the TARGET does back to this candidate (its move set → %HP of the candidate)
    const back = threatMovesOnto(entry, target).map((r) => {
      const ko = r.maxPct >= 100 ? "faints you" : `you keep ${Math.round(100 - r.maxPct)}%`;
      const cls = r.maxPct >= 100 ? "ko-o" : 2 * r.minPct >= 100 ? "ko-2" : "ko-n";
      return `<div class="apm-move back" data-move-info="${moveIdByName.get(r.mv.name)}">
        <span class="apm-mv"><span class="type tiny" style="background:${TYPE_COLORS[r.mv.type]}">${r.mv.type}</span>${r.mv.name}${r.prio ? `<small class="ehp-pw">prio ${r.prio > 0 ? "+" + r.prio : r.prio}</small>` : ""}</span>
        <span class="apm-pct">${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${cls}">${ko}</span>
      </div>`;
    }).join("");
    return `<div class="ehp-panel">
      <div class="ap-controls">
        <div class="cl-stat"><span class="cl-stat-lab">Ability</span><div class="ap-abils">${abilChips}</div></div>
        <div class="cl-stat"><span class="cl-stat-lab">Invest</span>${investSeg}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Atk boost</span>${boostStep}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Atk nature</span>${natSel}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Speed</span>${speedSeg}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Item</span>${itemSel}</div>
        <button class="btn-sm" data-ovrreset title="Reset this attacker to the global preset">↺ reset</button>
      </div>
      <div class="ap-speed">Spe <b>${aSpe}</b> <small>(${abilName}${(eb.weather !== "none" && SPEED_ABIL[st.ability] === eb.weather) ? " ×2 " + eb.weather : (st.ability === "surge-surfer" && eb.terrain === "electric") ? " ×2 terrain" : ""})</small> vs ${nameOf(target.mon)} <b>${target.spe}</b> → ${spV}</div>
      <div class="ap-matchup">
        <div class="ap-col"><div class="ap-col-h">${nameOf(mon)} → ${nameOf(target.mon)}</div>
          <div class="ap-moves">${moves || '<p class="ehp-empty">No usable damaging move.</p>'}</div></div>
        <div class="ap-col"><div class="ap-col-h back">${nameOf(target.mon)} → ${nameOf(mon)} <small>(what you survive)</small></div>
          <div class="ap-moves">${back || '<p class="ehp-empty">Target has no damaging move set.</p>'}</div></div>
      </div>
    </div>`;
  }

  function renderResults() {
    const target = currentTarget();
    if (!target) { $("#ehp-results").innerHTML = ""; return; }
    const ranked = roster
      .map((entry) => ({ entry, row: bestVsTarget(entry, target) }))
      .filter((x) => x.row && meetsThreshold(x.row) && passesFilters(x.entry, x.row))
      .sort((a, b) => b.row.maxPct - a.row.maxPct);

    const CAP = 150;   // generous DOM cap; count is always the true total
    const shown = ranked.slice(0, CAP);
    const rows = shown.map(({ entry, row }) => {
      const v = verdict(row);
      // speed badge (with priority) + concrete survivability (what the target hits you with)
      const pr = row.prio ? ` ${row.prio > 0 ? "+" + row.prio : row.prio}` : "";
      const spd = row.first === true ? `<span class="ehp-spd first" title="Moves first${row.prio ? " (priority " + row.prio + ")" : ""}">⚡ 1st${pr}</span>`
        : row.first === "tie" ? `<span class="ehp-spd tie" title="Speed tie">= tie</span>`
        : `<span class="ehp-spd slow" title="Target moves first">🐢 2nd${pr}</span>`;
      const backTxt = row.threatMv ? `${nameOf(target.mon)} ${row.threatMv.name} ${Math.round(row.threatMin)}–${Math.round(row.threatPct)}%` : "no damage back";
      const surv = !row.threatMv ? `<span class="ehp-surv ok" title="Target has no damaging move set">no threat back</span>`
        : row.first !== true && row.ohkoBack
          ? `<span class="ehp-surv dead" title="${backTxt} → you faint before attacking">🐢 2nd · ${backTxt} → faints you</span>`
          : row.ohkoBack
            ? `<span class="ehp-surv risk" title="${backTxt} — you move first but get OHKO'd if you don't KO">glass cannon · ${backTxt}</span>`
            : `<span class="ehp-surv ok" title="${backTxt}">survives · takes ${backTxt.replace(nameOf(target.mon) + " ", "")}</span>`;
      const flags = [`<span class="ehp-flag cat ${row.cat}">${row.cat === "physical" ? "Phys" : "Spec"}</span>`];
      if (row.se) flags.push(`<span class="ehp-flag se">SE ×${row.typeEff}</span>`);
      if (row.stab > 1) flags.push(`<span class="ehp-flag stab">STAB</span>`);
      if (eb.useAccuracy && row.acc < 100) flags.push(`<span class="ehp-flag acc">acc ${row.acc}%</span>`);
      if (row.risky) flags.push(`<span class="ehp-flag risky">risky</span>`);
      if (row.asNote) flags.push(`<span class="ehp-flag ab">${row.asNote}</span>`);
      if (row.noInvMax < 100 && row.maxPct >= 100) flags.push(`<span class="ehp-flag inv">needs invest</span>`);
      row.notes.forEach((n) => flags.push(`<span class="ehp-flag mh">${n}</span>`));
      const open = eb.expanded === entry.mon.slug;
      return `<div class="ehp-item ${open ? "open" : ""}">
      <div class="ehp-row" data-open="${entry.mon.slug}">
        <img class="ehp-spr" src="${entry.mon.sprite || entry.mon.artwork || ""}" alt="">
        <span class="ehp-name"><span class="ehp-nm-row"><button class="ehp-caret" data-expand="${entry.mon.slug}" title="Adjust this attacker (ability, moves, EVs…)">${open ? "▾" : "▸"}</button>${nameOf(entry.mon)}</span><span class="ehp-badges">${spd}${surv}</span></span>
        <span class="ehp-move" data-move-info="${row.id}" title="${row.mv.name} — view move details"><span class="type tiny" style="background:${TYPE_COLORS[row.effType]}">${row.effType}</span>${row.mv.name}${row.pw ? `<small class="ehp-pw">${row.pw} pw</small>` : ""}<button class="ehp-x" data-exclude="${row.id}" title="Exclude this move (saved)">✕</button></span>
        <span class="ehp-pct">${row.minPct.toFixed(0)}–${row.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${v.cls}">${v.txt}</span>
        <span class="ehp-flags">${flags.join("")}</span>
      </div>
      ${open ? renderAttackerPanel(entry, target) : ""}</div>`;
    }).join("");
    const threshLabel = { any: "damage", ohko: "OHKO", "2hko": "2HKO+", "3hko": "3HKO+" }[eb.threshold];
    const filtered = eb.fTypesOff.size || eb.moveTypesOff.size || eb.fCat !== "any" || eb.fRole !== "any" || eb.fAvail || eb.fSurvive || eb.fFaster || eb.fSearch || eb.fMega !== "all";
    $("#ehp-results").innerHTML = `
      <div class="ehp-summary"><b>${ranked.length}</b> Pokémon reach <b>${threshLabel}</b> on <b>${nameOf(target.mon)}</b> (HP ${target.hp} · Def ${target.def} · Sp.Def ${target.spd})${eb.atkBoost ? ` · attackers at +${eb.atkBoost}` : ""}${eb.candBulk === "hp" ? " · candidates +32 HP" : ""}${filtered ? " · filtered" : ""}.</div>
      ${ranked.length ? `<div class="ehp-list">${rows}</div>` : `<p class="ehp-empty">No attacker meets the current filters/threshold — loosen them or edit the target's bulk.</p>`}
      ${ranked.length > CAP ? `<p class="ehp-more">Showing the top ${CAP} of ${ranked.length} by max %. Filter to narrow it down.</p>` : ""}
      <p class="ehp-approx">Real Gen-9 damage (exact formula, 0.85–1.00 roll) vs the target's effective HP. Best <b>reliable</b> move per attacker (all move types considered incl. weight/fixed/%HP/OHKO — flagged & accuracy-weighted). <b>⚡/🐢</b> = who moves first (speed + priority); <b>survives/revenge only</b> = how hard the target hits back with its usage set. Conditions (weather/terrain/screens/status/item/boosts) auto-apply; ✕ removes a move for good; only Champions items offered.</p>`;
  }

  // Named target presets (save/load/delete the whole lab setup).
  function renderPresets() {
    const list = loadPresets();
    $("#ehp-presets").innerHTML = `
      <input class="cl-preset-name" placeholder="Preset name…" maxlength="24" autocomplete="off">
      <button class="btn-sm" data-preset-save ${eb.targetSlug ? "" : "disabled"}>Save preset</button>
      ${list.map((p) => `<span class="cl-exchip cl-preset"><button class="cl-preset-load" data-preset-load="${p.id}" title="Load this setup">${p.name}</button><button data-preset-del="${p.id}" aria-label="delete" title="Delete">✕</button></span>`).join("")}`;
  }

  function renderEb() {
    saveLab();   // the working setup survives reloads
    renderPresets();
    const target = currentTarget();
    if (!target) {
      $("#ehp-controls").innerHTML = "";
      $("#ehp-filters").innerHTML = "";
      $("#ehp-results").innerHTML = `<p class="ehp-empty ehp-pick-hint">Pick a popular target above to find its counters — its defensive set will prefill from ladder usage.</p>`;
      return;
    }
    $("#ehp-controls").innerHTML = renderControls(target);
    $("#ehp-filters").innerHTML = renderFilters();
    renderResults();
  }

  try { applyLab(JSON.parse(localStorage.getItem(STATE_KEY) || "null")); } catch { /* ignore */ }
  syncMode();
}
