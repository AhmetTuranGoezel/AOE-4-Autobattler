// Manual damage calculator. You type the raw stats and pick everything with
// chips: the move type + defender type(s) auto-compute effectiveness, stat stages
// give effective Atk/Def, and STAB/Crit/Weather/Burn are chip toggles. Shows the
// Gen-9 formula and the min–max range from the 16 damage rolls (0.85–1.00).
import { TYPES, TYPE_COLORS, displayName, grassKnotBP, formFamily } from "./data.js";
import { statsFor, roleOf } from "./effective-stats.js";
import { attachAutocomplete } from "./autocomplete.js";
import { defaultAbility, applyAbility } from "./type-defense.js";
import { POOL, CAP, pointsUsed, optimizeSpread, emptySpread } from "./stat-lab.js";
import { hasFlag, OFF_ABIL, abilityMods, hiStatOf, ATE_ABIL, PROTEAN, offDefaultAbility, stageMult, OFF_ITEMS } from "./offense-model.js";

const pokeRound = (v) => { const f = Math.floor(v); return v - f > 0.5 ? f + 1 : f; };
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
const FIXED_BP = { Return: 102, Frustration: 102, "Hidden Power": 60, "Hard Press": 100 };   // variable BP → representative value (Hard Press: target at full HP = max 100)
const LOWHP_BP = new Set(["Flail", "Reversal"]);                          // BP rises as HP drops — assume full HP (weakest)
const SE_BOOST_MOVES = new Set(["Collision Course", "Electro Drift"]);    // ×1.3333 when super-effective
const COUNTER_MOVES = new Set(["Counter", "Mirror Coat", "Metal Burst", "Comeuppance"]);
// Damaging moves whose special mechanic isn't fully modeled → surface a "~approx" flag so the number isn't trusted blindly.
const UNMODELED = new Set(["Beat Up", "Fling", "Present", "Spit Up", "Trump Card", "Natural Gift", "Wring Out", "Crush Grip", "Punishment", "Stored Power", "Power Trip", "Grass Pledge", "Fire Pledge", "Water Pledge", "Eruption", "Water Spout", "Dragon Energy", "Final Gambit", "Endeavor"]);
const isOHKO = (mv) => /equal to the target's maximum hp/i.test(mv.effect || "");
// Turn-wasting / self-risking moves that shouldn't be a mon's headline threat:
// charge/recharge turns, fails-if-hit, user faints, ½-max-HP cost, crash on miss.
const RISKY_MOVES = new Set(["Focus Punch", "Explosion", "Self-Destruct", "Misty Explosion", "Final Gambit", "Steel Beam", "Mind Blown", "High Jump Kick", "Jump Kick", "Future Sight"]);   // Future Sight: hits 2 turns late
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
  if (!mv.power) return { kind: "skip", note: "variable power (unmodeled)" };   // never emit phantom 1-pw rows
  return done(mv.power, hits);
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
  // terrain (grounded-gated: the boosted/protected side must be on the ground)
  "Rising Voltage": (c) => (c.eb.terrain === "electric" && (c.grounded || {}).target !== false ? { mult: 2, note: "×2 terrain (grounded target)" } : null),
  "Expanding Force": (c) => (c.eb.terrain === "psychic" && (c.grounded || {}).user !== false ? { mult: 1.5, note: "×1.5 terrain" } : null),
  "Terrain Pulse": (c) => (c.eb.terrain !== "none" && (c.grounded || {}).user !== false ? { mult: 2, note: "×2 terrain (type change ~approx)" } : null),
  "Misty Explosion": (c) => (c.eb.terrain === "misty" && (c.grounded || {}).user !== false ? { mult: 1.5, note: "×1.5 terrain" } : null),
  // conditions we can't verify from tracked state — surfaced as explicit flags
  Assurance: () => ({ note: "×2 if target already hit this turn" }),
  "Lash Out": () => ({ note: "×2 if its stats were lowered this turn" }),
  "Sucker Punch": () => ({ note: "fails unless the target attacks" }),
  "Upper Hand": () => ({ note: "fails unless the target uses a priority move" }),
  "Fake Out": () => ({ note: "turn 1 only · flinches" }),
  "First Impression": () => ({ note: "turn 1 only" }),
  Belch: () => ({ note: "needs a berry eaten first" }),
  "Stomping Tantrum": () => ({ note: "×2 after a failed move" }),
  "Temper Flare": () => ({ note: "×2 after a failed move" }),
  Retaliate: () => ({ note: "×2 if an ally fainted last turn" }),
  "Last Resort": () => ({ note: "needs all other moves used" }),
  // variable-power mechanics we can't track — representative BP + explicit flag
  "Rage Fist": () => ({ note: "+50 BP per hit taken (not counted)" }),
  "Last Respects": () => ({ note: "+50 BP per fainted ally (not counted)" }),
  "Fickle Beam": () => ({ note: "30%: ×2 power (not counted)" }),
  "Shell Side Arm": () => ({ note: "picks phys/spec — special assumed" }),
  "Salt Cure": () => ({ note: "+12.5–25%/turn chip (not counted)" }),
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

// Offensive abilities: shared model (OFF_ABIL / abilityMods / -ate / Protean / default
// ability) lives in offense-model.js so the Moves table computes with the same rules.
const SPEED_ABIL = { "sand-rush": "sand", "swift-swim": "rain", chlorophyll: "sun", "slush-rush": "snow" };  // ×2 Spe in that weather
const MOLD_BREAKER = new Set(["mold-breaker", "teravolt", "turboblaze"]);   // ignore the target's ability
const PRIO_BLOCK = new Set(["dazzling", "queenly-majesty", "armor-tail"]);  // priority moves fail against these
const DAMP_BLOCKED = new Set(["Explosion", "Self-Destruct", "Mind Blown", "Misty Explosion"]);  // Damp shuts these down
// Heavy Metal doubles the holder's weight, Light Metal halves it (Grass Knot / Heavy Slam math)
const abilWeight = (w, ab) => (ab === "heavy-metal" ? w * 2 : ab === "light-metal" ? Math.max(0.1, Math.floor(w * 5) / 10) : w);
// Terrain only affects GROUNDED Pokémon: Flying-types and Levitate/Eelevate holders float.
const grounded = (types, ability) => !types.includes("flying") && ability !== "levitate" && ability !== "eelevate";
// Moves that ignore the target's defensive stat changes (so a Def boost doesn't help).
const STAT_IGNORE = new Set(["Sacred Sword", "Chip Away", "Darkest Lariat"]);
// Attackers whose ability ignores (or punishes) Intimidate's Atk drop.
const INTIM_IMMUNE = new Set(["clear-body", "white-smoke", "hyper-cutter", "inner-focus", "own-tempo", "oblivious", "scrappy", "guard-dog", "defiant", "competitive", "contrary"]);
// Target abilities that scale INCOMING damage (category / HP / field / status based).
const TARGET_DMG = {
  "fur-coat": ({ cat }) => (cat === "physical" ? 0.5 : 1),
  "ice-scales": ({ cat }) => (cat === "special" ? 0.5 : 1),
  multiscale: () => 0.5,          // assume full HP (a counter's first hit)
  "shadow-shield": () => 0.5,
  fluffy: ({ mv, noContact }) => (hasFlag(mv, "Contact") && !noContact ? 0.5 : 1),   // ½ contact (Long Reach attackers bypass); its ×2 Fire is in DEF_ABILITIES
  "punk-rock": ({ mv }) => (hasFlag(mv, "Sound") ? 0.5 : 1),
  intimidate: ({ cat, atkAbility }) => (cat === "physical" && !INTIM_IMMUNE.has(atkAbility) ? 2 / 3 : 1),   // many abilities shrug it off
  "grass-pelt": ({ cat, terrain }) => (terrain === "grassy" && cat === "physical" ? 2 / 3 : 1),
  "marvel-scale": ({ cat, tStatus }) => (tStatus !== "none" && cat === "physical" ? 2 / 3 : 1),
};
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

// Offensive items (OFF_ITEMS) are shared via offense-model.js — the Moves table uses the same list.
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
// damage); Infiltrator bypasses them. Terrain effects require the relevant side GROUNDED:
// the user for the 1.3 boosts, the target for the grassy-EQ and misty-Dragon reductions.
function fieldOffenseMult(mv, cat, eb, infiltrator = false, applyScreens = true, userGrounded = true, targetGrounded = true) {
  let m = 1; const notes = [];
  if (eb.weather === "rain") m *= mv.type === "water" ? 1.5 : mv.type === "fire" ? 0.5 : 1;
  else if (eb.weather === "sun") m *= mv.type === "fire" ? 1.5 : mv.type === "water" ? 0.5 : 1;
  if (m !== 1) notes.push(WEATHERS[eb.weather]);
  if (eb.terrain === "grassy") {
    if (mv.type === "grass" && userGrounded) { m *= 1.3; notes.push("grassy"); }
    if (EQ_MOVES.has(mv.name) && targetGrounded) { m *= 0.5; notes.push("grassy"); }
  } else if (eb.terrain === "electric" && mv.type === "electric" && userGrounded) { m *= 1.3; notes.push("terrain"); }
  else if (eb.terrain === "psychic" && mv.type === "psychic" && userGrounded) { m *= 1.3; notes.push("terrain"); }
  else if (eb.terrain === "misty" && mv.type === "dragon" && targetGrounded) { m *= 0.5; notes.push("misty"); }
  if (applyScreens && !infiltrator) {
    if ((eb.screen === "reflect" || eb.screen === "both") && cat === "physical") { m *= 0.5; notes.push("Reflect"); }
    if ((eb.screen === "light-screen" || eb.screen === "both") && cat === "special") { m *= 0.5; notes.push("Screen"); }
  } else if (applyScreens && infiltrator && eb.screen !== "none") notes.push("Infiltrator");
  return { m, notes };
}

export function initCalcView({ container, data, onOpen, onMoveInfo, getTeam, onGotoTeam, onAddTeamMove }) {
  const team = () => (getTeam ? getTeam() : []);   // live saved team from the Team builder
  const s = {
    mode: "ehp", // "ehp" (All vs one — historical key, kept for saved states) | "rev" (One vs all) | "team" (Team check)
  };
  // Counters lab: rank the roster against a chosen target under editable conditions.
  const EXCLUDE_KEY = "pc-move-exclude";
  const loadExcluded = () => { try { return new Set(JSON.parse(localStorage.getItem(EXCLUDE_KEY) || "[]")); } catch { return new Set(); } };
  // A fresh per-target defensive config (prefilled from usage on pick via usageCfg).
  const newTargetCfg = () => ({ slug: null, spread: { hp: 0, def: 0, spd: 0, spe: 0, atk: 0, spa: 0 }, nature: "Serious", defStage: 0, spdStage: 0, speStage: 0, ability: null, item: "none", targetMoves: null });
  const eb = {
    // up to two targets (Counters can rank vs both); `editing` = which one the editor binds to
    targets: [newTargetCfg(), null], editing: 0,
    // shared field conditions
    weather: "none", terrain: "none", screen: "none",
    targetStatus: "none", userStatus: "none", doubles: true,   // doubles → spread moves ×0.75
    // global attacker offense preset
    atkInvest: 32, atkNature: "auto", atkItem: "none", atkBoost: 0, atkSpeed: "base", candBulk: "base",  // atkNature "auto" boosts the used stat; candBulk: candidates' HP for the survive math (base | hp = +32)
    // "One vs all" reverse mode: one attacker vs the whole roster
    revSlug: null, revSort: "usage", revLaddered: false, revSearch: "", revMega: "all", revTypesOff: new Set(), revBasis: "ladder",
    revCfg: { ability: null, invest: 32, nature: "auto", item: "none", boost: 0, speed: "base", stages: { atk: 0, spa: 0, def: 0, spd: 0, spe: 0 }, movepool: "all", moveset: null,
      custom: [] },   // invented moves [{type, class, power}] — evaluated alongside the movepool
    movepool: "all",   // attackers use every learnable move | only their ladder set
    revOverrides: new Map(),   // per-defender config overrides (bulk/boosts/ability/item/nature)
    // pinned rows: stay on top of the results regardless of filters/search/threshold
    pinned: new Set(), revPinned: new Set(),
    // per-attacker overrides + which row is expanded
    overrides: new Map(), expanded: null,
    // rules + filters
    useAccuracy: true, excluded: loadExcluded(),
    threshold: "any", fTypesOff: new Set(), fTypeMode: "any", moveTypesOff: new Set(), fCat: "any", fRole: "any", fAvail: false, fMega: "all", fSurvive: false, fFaster: false, fSearch: "",
    showTypeFilters: false,   // the two 18-chip type grids collapse behind a toggle (both modes)
    // invented Pokémon (usable as target / defender / attacker / threat) + the builder's draft
    customMons: [], customDraft: null,
    // "Team check" mode: opponents to test the saved team against; teamExpanded = the
    // "memberSlug|threatSlug" cell whose fix-it detail panel is open (transient, not persisted)
    threats: [], teamExpanded: null,
  };
  const tc = () => eb.targets[eb.editing];   // the target config the editor is bound to
  const TCFG_KEYS = new Set(["nature", "item", "defStage", "spdStage", "speStage"]);   // per-target scalars routed through the generic select/stage handlers
  const saveExcluded = () => { try { localStorage.setItem(EXCLUDE_KEY, JSON.stringify([...eb.excluded])); } catch { /* ignore */ } };

  // ---- lab persistence: the working setup survives reloads; named target presets ----
  const STATE_KEY = "pc-counters-state", PRESETS_KEY = "pc-counters-presets";
  const LAB_FIELDS = ["editing", "revSlug", "revSort", "revLaddered", "revCfg", "revMega", "revBasis", "movepool",
    // NOTE: targetStatus/userStatus are deliberately NOT persisted — a burn silently
    // surviving into the next session halves physical damage and reads like a bug.
    "weather", "terrain", "screen", "doubles",
    "atkInvest", "atkNature", "atkItem", "atkBoost", "atkSpeed", "candBulk", "useAccuracy",
    "threshold", "fTypeMode", "fCat", "fRole", "fAvail", "fMega", "fSurvive", "fFaster", "showTypeFilters",
    "customMons", "threats"];
  function serializeLab() {
    const out = { mode: s.mode, targets: eb.targets.map((c) => (c ? { ...c, spread: { ...c.spread } } : null)),
      fTypesOff: [...eb.fTypesOff], moveTypesOff: [...eb.moveTypesOff], revTypesOff: [...eb.revTypesOff],
      pinned: [...eb.pinned], revPinned: [...eb.revPinned],
      overrides: Object.fromEntries(eb.overrides), revOverrides: Object.fromEntries(eb.revOverrides) };
    LAB_FIELDS.forEach((k) => (out[k] = eb[k]));
    return out;
  }
  function applyLab(st) {
    if (!st) return;
    LAB_FIELDS.forEach((k) => { if (st[k] !== undefined) eb[k] = st[k]; });
    if (!Array.isArray(eb.customMons)) eb.customMons = [];
    eb.customDraft = null;   // never restore a half-finished builder draft
    syncCustom();   // custom mons must resolve BEFORE any slug validation below
    if (st.targets) {   // validate each slug still exists (roster or custom); drop unknowns
      eb.targets = st.targets.map((c) => (c && c.slug && hasMon(c.slug)
        ? { ...newTargetCfg(), ...c, spread: { hp: 0, def: 0, spd: 0, spe: 0, atk: 0, spa: 0, ...(c.spread || {}) } } : null));
      if (!eb.targets[0]) eb.targets[0] = newTargetCfg();
      if (eb.targets.length < 2) eb.targets[1] = null;
    }
    if (!Array.isArray(eb.revCfg.custom)) eb.revCfg.custom = [];   // pre-custom-move stored states
    if (st.mode) s.mode = st.mode === "calc" ? "ehp" : st.mode;   // the manual calculator is gone
    if (eb.editing > 1 || !eb.targets[eb.editing]) eb.editing = 0;
    if (eb.revSlug && !hasMon(eb.revSlug)) eb.revSlug = null;
    eb.threats = (Array.isArray(eb.threats) ? eb.threats : []).filter((sl) => hasMon(sl));
    eb.fTypesOff = new Set(st.fTypesOff || []);
    eb.moveTypesOff = new Set(st.moveTypesOff || []);
    eb.revTypesOff = new Set(st.revTypesOff || []);
    eb.pinned = new Set((st.pinned || []).filter((sl) => hasMon(sl)));
    eb.revPinned = new Set((st.revPinned || []).filter((sl) => hasMon(sl)));
    eb.overrides = new Map(Object.entries(st.overrides || {}));
    eb.revOverrides = new Map(Object.entries(st.revOverrides || {}));
    // statuses always start Healthy — never restored from storage or old/legacy values
    eb.userStatus = "none";
    eb.targetStatus = "none";
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

  // ---- custom (invented) Pokémon ----------------------------------------------------------
  // A user-built mon usable anywhere a real one is: Counters target, One-vs-all attacker/defender,
  // Team-check threat. Names are user input → escape everywhere they hit innerHTML (security).
  const esc = (str) => String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CUSTOM_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
  const clampStat = (v) => Math.max(1, Math.min(255, Math.round(Number(v) || 1)));
  // Shape a stored custom into a data.pokemon-compatible object the engine already accepts.
  function customMon(c) {
    const stats = {}; CUSTOM_STATS.forEach((k) => { stats[k] = clampStat(c.stats && c.stats[k]); });
    const nm = esc((c.name || "").trim() || "Custom");
    const types = (c.types || []).filter((t) => TYPES.includes(t)).slice(0, 2);
    return { slug: "custom:" + c.id, name: nm, _display: nm, types: types.length ? types : ["normal"], stats,
      bst: CUSTOM_STATS.reduce((sum, k) => sum + stats[k], 0), weight: 50, isMega: false, available: true,
      dex: 0, gen: 0, usagePct: null, usage: {}, sprite: "", artwork: "",
      abilities: c.ability && data.abilities[c.ability] ? [{ slug: c.ability, hidden: false }] : [],
      moves: (c.moves || []).filter((id) => data.moves[id]), isCustom: true };
  }
  let customIdx = new Map();   // slug → synthesized custom mon; rebuilt whenever eb.customMons changes
  const syncCustom = () => { customIdx = new Map(eb.customMons.map((c) => { const m = customMon(c); return [m.slug, m]; })); };
  const resolveMon = (slug) => bySlug.get(slug) || (slug && slug.startsWith("custom:") ? customIdx.get(slug) : undefined);
  const hasMon = (slug) => !!resolveMon(slug);
  const customMons = () => [...customIdx.values()];
  const nextCustomId = () => String(Date.now()) + Math.random().toString(36).slice(2, 6);
  const capNat = (x) => x[0].toUpperCase() + x.slice(1);
  const NAT_NAMES = Object.fromEntries(Object.keys(NATURE_MODS).map((n) => [capNat(n), capNat(n)]));   // all named natures
  // Attacker natures include the smart "auto" (+10% to whatever stat the move uses — Def for Body Press);
  // target natures are named-only.
  const natSelect = (dataAttr, cur, withAuto = false) => {
    const opts = { Serious: "Neutral", ...(withAuto ? { auto: "+Attacking stat" } : {}), ...NAT_NAMES };
    if (!(cur in opts)) opts[cur] = cur;
    return `<select class="cl-sel" ${dataAttr}>${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  };

  container.innerHTML = `<div class="calc">
    <div class="calc-head">
      <div class="calc-modes seg">
        <button data-calcmode="ehp" class="active">All vs one</button>
        <button data-calcmode="rev">One vs all</button>
        <button data-calcmode="team">Team check</button>
      </div>
      <h2 class="calc-title-ehp" hidden>All vs one <small class="muted">— the whole roster's damage into one or two targets</small></h2>
      <p class="calc-note calc-title-ehp" hidden>Pick a target — its defensive set prefills from real ladder usage; edit its investment, nature, boosts, ability and field conditions. Add a 2nd target to find attackers that break both. Real Gen-9 damage (0.85–1.00 roll) vs its real HP.</p>
      <h2 class="calc-title-rev" hidden>One vs all <small class="muted">— your attacker's damage into the whole roster</small></h2>
      <p class="calc-note calc-title-rev" hidden>Pick an attacker and set its offense; every defender is built from its own ladder set (Champions exposes per-mon usage, not a global usage share). Ranked by damage.</p>
      <h2 class="calc-title-team" hidden>Team check <small class="muted">— can your team handle these threats?</small></h2>
      <p class="calc-note calc-title-team" hidden>Uses your saved team from the Team tab. Add the opponents you're worried about (or import your pinned mons); each teammate's best answer to every threat is scored so you can see instantly what's covered and what isn't.</p>
    </div>
    <div id="calc-custom" class="calc-custom"></div>

    <div class="ehp-breaker" id="calc-mode-ehp" hidden>
      <div class="cl-pick">
        <div class="ci cl-pick-target">Target Pokémon
          <div class="ac-wrap"><input class="ehp-target-input" placeholder="Search a popular target…" autocomplete="off"></div>
        </div>
        <button class="btn cl-setup-btn" data-setup="ehp-setup">⚙ More setup</button>
        <div class="cl-setup" id="ehp-setup">
          <div class="ci cl-pick-search">Filter attackers by name
            <input class="ehp-atk-search" placeholder="type a name…" autocomplete="off">
          </div>
          <div class="ci cl-pick-exclude">Exclude an attack <small>(saved)</small>
            <div class="ac-wrap"><input class="ehp-exclude-input" placeholder="add a move to ignore…" autocomplete="off"></div>
          </div>
          <div class="ci cl-pick-tmove">Add a target move <small>(what it hits back with)</small>
            <div class="ac-wrap"><input class="ehp-tmove-input" placeholder="add a move to the target…" autocomplete="off"></div>
          </div>
          <div class="ci cl-pick-target2">2nd target <small>(counter both)</small>
            <div class="ac-wrap"><input class="ehp-target2-input" placeholder="add a 2nd target…" autocomplete="off"></div>
          </div>
          <div id="ehp-presets" class="cl-presets"></div>
        </div>
      </div>
      <div id="ehp-controls" class="cl-controls"></div>
      <div id="ehp-filters" class="cl-filters"></div>
      <div class="ehp-results" id="ehp-results"></div>
    </div>

    <div class="ehp-breaker" id="calc-mode-rev" hidden>
      <div class="cl-pick">
        <div class="ci cl-pick-target">Attacker
          <div class="ac-wrap"><input class="rev-atk-input" placeholder="Search an attacker…" autocomplete="off"></div>
        </div>
        <button class="btn cl-setup-btn" data-setup="rev-setup">⚙ More setup</button>
        <div class="cl-setup" id="rev-setup">
          <div class="ci cl-pick-search">Filter defenders by name
            <input class="rev-def-search" placeholder="type a name…" autocomplete="off">
          </div>
          <div class="ci cl-pick-tmove">Assign an attack <small>(lock its moveset)</small>
            <div class="ac-wrap"><input class="rev-move-input" placeholder="add one of its moves…" autocomplete="off"></div>
          </div>
          <div id="rev-presets" class="cl-presets"></div>
        </div>
      </div>
      <div id="rev-controls" class="cl-controls"></div>
      <div class="ehp-results" id="rev-results"></div>
    </div>

    <div class="ehp-breaker" id="calc-mode-team" hidden>
      <div class="cl-pick">
        <div class="ci cl-pick-target">Add a threat
          <div class="ac-wrap"><input class="team-threat-input" placeholder="Search an opponent…" autocomplete="off"></div>
        </div>
        <button class="btn tc-import" data-import-pinned title="Add every mon you've pinned in All-vs-one / One-vs-all">⇩ Import pinned</button>
      </div>
      <div id="team-controls"></div>
      <div class="ehp-results" id="team-results-calc"></div>
    </div>

  </div>`;

  const $ = (sel) => container.querySelector(sel);

  // Pick a target and prefill its defensive set from real ladder usage.
  // Build a defensive config for a mon from its ladder usage. usage.spread lists each stat's
  // most-common investment INDEPENDENTLY, so the six values can sum past the 66-point pool —
  // allocate greedily in usage-% order until the pool runs out. Reused for targets AND the
  // "One vs all" defenders.
  function usageCfg(mon) {
    const u = mon.usage || {};
    const spread = { hp: 0, def: 0, spd: 0, spe: 0, atk: 0, spa: 0 };
    let pool = POOL;
    Object.entries(u.spread || {})
      .map(([k, v]) => ({ k, pts: (v || [0])[0] || 0, pct: (v || [0, 0])[1] || 0 }))
      .filter((x) => x.pts > 0 && x.k in spread)
      .sort((a, b) => b.pct - a.pct)
      .forEach((x) => { const give = Math.min(x.pts, CAP, pool); spread[x.k] = give; pool -= give; });
    return {
      slug: mon.slug, spread,
      nature: (u.natures && u.natures[0] && u.natures[0][0]) || "Serious",
      defStage: 0, spdStage: 0, speStage: 0,
      ability: offDefaultAbility(mon),   // its actual most-used ability (may be Multiscale, Intimidate, …)
      item: "none",
      targetMoves: (u.moves || []).map(([nm]) => moveIdByName.get(nm)).filter((id) => id != null && data.moves[id] && data.moves[id].class !== "status" && data.moves[id].type).slice(0, 4),
    };
  }
  function setTarget(slug, keepConfig = false) {
    const mon = resolveMon(slug);
    if (!mon) return;
    if (keepConfig) { tc().slug = slug; }   // form switch keeps the current spread/ability/etc.
    else { eb.targets[eb.editing] = usageCfg(mon); }
    // a fresh primary pick also clears shared field conditions
    if (eb.editing === 0 && !keepConfig) {
      eb.weather = "none"; eb.terrain = "none"; eb.screen = "none"; eb.targetStatus = "none"; eb.userStatus = "none";
    }
    eb.expanded = null;
    renderEb();
  }
  // Add / edit / drop the 2nd target.
  function setTarget2(slug) {
    const mon = resolveMon(slug);
    if (!mon) return;
    eb.targets[1] = usageCfg(mon);
    eb.editing = 1; eb.expanded = null;
    renderEb();
  }
  function clearTarget2() { eb.targets[1] = null; eb.editing = 0; eb.expanded = null; renderEb(); }
  // popular first: real M-B usage rate sorts the suggestions, shown as a right-aligned %.
  // Custom mons sort to the very top with a "CUSTOM" tag so they're easy to find.
  const monItems = () => [
    ...customMons().map((m) => ({ value: m.slug, name: nameOf(m), icon: `<span class="ac-custico">★</span>`, meta: "CUSTOM" })),
    ...[...data.pokemon]
      .sort((a, b) => ((b.usagePct != null ? b.usagePct : -1) - (a.usagePct != null ? a.usagePct : -1)))
      .map((m) => ({ value: m.slug, name: nameOf(m), icon: `<img src="${m.sprite || m.artwork || ""}" alt="" loading="lazy" decoding="async">`, meta: m.usagePct != null ? `${m.usagePct}%` : "" })),
  ];
  attachAutocomplete(container.querySelector(".ehp-target-input"), {
    items: monItems,
    onPick: (slug) => setTarget(slug),
  });
  attachAutocomplete(container.querySelector(".ehp-target2-input"), {
    items: monItems,
    onPick: (slug) => setTarget2(slug),
  });
  attachAutocomplete(container.querySelector(".team-threat-input"), {
    items: () => monItems().filter((it) => !eb.threats.includes(it.value)),
    onPick: (slug) => addThreat(slug),
  });
  attachAutocomplete(container.querySelector(".rev-atk-input"), {
    items: monItems,
    onPick: (slug) => { eb.revSlug = slug; eb.revCfg.ability = offDefaultAbility(resolveMon(slug)); eb.revCfg.moveset = null; eb.expanded = null; renderRev(); },
  });
  attachAutocomplete(container.querySelector(".rev-move-input"), {
    items: () => {
      const mon = eb.revSlug ? resolveMon(eb.revSlug) : null;
      if (!mon) return [];
      return mon.moves.map((id) => ({ id, mv: data.moves[id] })).filter(({ mv }) => mv && mv.class !== "status" && mv.type)
        .map(({ id, mv }) => ({ value: id, name: mv.name, icon: `<span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span>` }));
    },
    onPick: (id) => { if (!Array.isArray(eb.revCfg.moveset)) eb.revCfg.moveset = []; if (!eb.revCfg.moveset.includes(id)) eb.revCfg.moveset.push(id); renderRev(); },
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
      const mon = tc().slug ? resolveMon(tc().slug) : null;
      if (!mon) return [];
      return mon.moves.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type)
        .map((mv) => ({ value: moveIdByName.get(mv.name), name: mv.name, icon: `<span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span>` }));
    },
    onPick: (id) => { const cfg = tc(); if (!cfg.targetMoves) cfg.targetMoves = []; if (!cfg.targetMoves.includes(id)) cfg.targetMoves.push(id); renderEb(); },
  });

  const clampPts = (v) => Math.max(0, Math.min(32, v));
  container.addEventListener("input", (e) => {
    if (e.target.classList.contains("ehp-atk-search")) { eb.fSearch = e.target.value.trim().toLowerCase(); renderResults(); return; }
    if (e.target.classList.contains("rev-def-search")) { eb.revSearch = e.target.value.trim().toLowerCase(); renderRevResults(); return; }
    // custom-mon draft fields: update the draft live WITHOUT re-rendering (inputs keep focus)
    const cf = e.target.dataset.cdraft;
    if (cf && eb.customDraft) {
      if (cf === "name") eb.customDraft.name = e.target.value.slice(0, 24);
      else if (cf.startsWith("stat.")) eb.customDraft.stats[cf.slice(5)] = clampStat(e.target.value);
      return;
    }
  });
  container.addEventListener("change", (e) => {
    // custom-mon draft selects (types / ability) — re-render so the preview updates
    const cf = e.target.dataset.cdraft;
    if (cf && eb.customDraft) {
      if (cf === "type1") eb.customDraft.types[0] = e.target.value;
      else if (cf === "type2") eb.customDraft.types = e.target.value ? [eb.customDraft.types[0], e.target.value] : [eb.customDraft.types[0]];
      else if (cf === "ability") eb.customDraft.ability = e.target.value || null;
      renderCustom(); return;
    }
    const ovr = e.target.dataset.ovrsel;
    if (ovr) { setOverride(ovr, e.target.value); return; }
    const sel = e.target.dataset.ebsel;
    if (sel) { const o = TCFG_KEYS.has(sel) ? tc() : eb; o[sel] = e.target.type === "checkbox" ? e.target.checked : e.target.value; renderActive(); return; }
    const rsel = e.target.dataset.revsel;
    if (rsel) { const val = e.target.type === "checkbox" ? e.target.checked : e.target.value; if (rsel === "revLaddered") eb.revLaddered = val; else eb.revCfg[rsel] = val; renderRev(); return; }
    const dsel = e.target.dataset.dovrsel;
    if (dsel && eb.expanded) {
      const o = { ...(eb.revOverrides.get(eb.expanded) || {}), [dsel]: e.target.value };
      eb.revOverrides.set(eb.expanded, o);
      saveLab(); renderRevResults(); return;
    }
  });
  container.addEventListener("click", (e) => {
    // Team-check "add to team" buttons live inside move rows that also carry data-move-info —
    // handle the add first so the button doesn't open the move popup instead.
    const admEarly = e.target.closest("[data-addteammove]");
    if (admEarly) { const [slug, id] = admEarly.dataset.addteammove.split(":"); if (onAddTeamMove) onAddTeamMove(slug, Number(id)); renderTeam(); return; }
    // result rows: ✕ excludes the move, caret/controls adjust the attacker, the move opens
    // the move popup, the name/rest opens the mon.
    const rex = e.target.closest("[data-exclude]");
    if (rex) { eb.excluded.add(Number(rex.dataset.exclude)); saveExcluded(); renderActive(); return; }
    const rux = e.target.closest("[data-unexclude]");
    if (rux) { eb.excluded.delete(Number(rux.dataset.unexclude)); saveExcluded(); renderActive(); return; }
    const tgo = e.target.closest("[data-target-open]");
    if (tgo) { onOpen && onOpen(tgo.dataset.targetOpen); return; }   // click the target's name/sprite → detail popup
    const exp = e.target.closest("[data-expand]");
    if (exp) { eb.expanded = eb.expanded === exp.dataset.expand ? null : exp.dataset.expand; if (s.mode === "rev") renderRevResults(); else renderResults(); return; }
    // pin rows: stays on top of the results through any filters (per mode)
    const pin = e.target.closest("[data-pin]");
    if (pin) {
      const set = s.mode === "rev" ? eb.revPinned : eb.pinned;
      const slug = pin.dataset.pin;
      set.has(slug) ? set.delete(slug) : set.add(slug);
      saveLab(); if (s.mode === "rev") renderRevResults(); else renderResults(); return;
    }
    if (e.target.closest("[data-pin-clear]")) {
      (s.mode === "rev" ? eb.revPinned : eb.pinned).clear();
      saveLab(); if (s.mode === "rev") renderRevResults(); else renderResults(); return;
    }
    // per-defender override controls (One vs all expander)
    const setDefOvr = (patch) => {
      const slug = eb.expanded; if (!slug) return;
      const o = { ...(eb.revOverrides.get(slug) || {}), ...patch };
      Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
      eb.revOverrides.set(slug, o);
      saveLab(); renderRevResults();
    };
    const da = e.target.closest("[data-dovrability]");
    if (da) { setDefOvr({ ability: da.dataset.dovrability }); return; }
    const ds = e.target.closest("[data-dovrstage]");
    if (ds) {
      const k = ds.dataset.dovrstage;
      const cur = { ...usageCfg(bySlug.get(eb.expanded)), ...(eb.revOverrides.get(eb.expanded) || {}) }[k] || 0;
      setDefOvr({ [k]: Math.max(-6, Math.min(6, cur + Number(ds.dataset.dir))) }); return;
    }
    const db = e.target.closest("[data-dovrbulk]");
    if (db) {
      const v = db.dataset.dovrbulk;
      const spreads = { hpdef: { hp: 32, def: 32, spd: 2, spe: 0, atk: 0, spa: 0 }, hpspd: { hp: 32, def: 2, spd: 32, spe: 0, atk: 0, spa: 0 }, spe: { hp: 32, def: 2, spd: 0, spe: 32, atk: 0, spa: 0 } };
      setDefOvr({ spread: v === "usage" ? undefined : spreads[v] }); return;
    }
    if (e.target.closest("[data-dovrreset]")) { if (eb.expanded) { eb.revOverrides.delete(eb.expanded); saveLab(); renderRevResults(); } return; }
    const oa = e.target.closest("[data-ovrability]");
    if (oa) { setOverride("ability", oa.dataset.ovrability); return; }
    const oi = e.target.closest("[data-ovrinvest]");
    if (oi) { setOverride("invest", Number(oi.dataset.ovrinvest)); return; }
    const osp = e.target.closest("[data-ovrspeed]");
    if (osp) { setOverride("speed", osp.dataset.ovrspeed); return; }
    const ostg = e.target.closest("[data-ovrstage]");
    if (ostg) {   // per-stat setup stage (Iron Defense = +2 def)
      const k = ostg.dataset.ovrstage;
      const cur = ((eb.overrides.get(eb.expanded) || {}).stages || {})[k] || 0;
      const stages = { ...((eb.overrides.get(eb.expanded) || {}).stages || {}), [k]: Math.max(-6, Math.min(6, cur + Number(ostg.dataset.dir))) };
      setOverride("stages", stages); return;
    }
    const opl = e.target.closest("[data-ovrpool]");
    if (opl) { setOverride("movepool", opl.dataset.ovrpool); return; }
    if (e.target.closest("[data-ovrreset]")) { eb.overrides.delete(eb.expanded); renderResults(); return; }
    const rmi = e.target.closest("[data-move-info]");
    if (rmi) { onMoveInfo && onMoveInfo(Number(rmi.dataset.moveInfo)); return; }
    const op = e.target.closest(".ehp-row[data-open]");
    if (op) { onOpen && onOpen(op.dataset.open); return; }
    const cm = e.target.closest("[data-calcmode]");
    if (cm) { s.mode = cm.dataset.calcmode; eb.expanded = null; syncMode(); return; }
    const su = e.target.closest("[data-setup]");
    if (su) { const box = $("#" + su.dataset.setup); const open = box.classList.toggle("open"); su.classList.toggle("active", open); return; }   // mobile "More setup" disclosure
    // --- counters-lab controls ---
    const tf = e.target.closest("[data-target-form]");
    if (tf) { setTarget(tf.dataset.targetForm, true); return; }
    const th = e.target.closest("[data-thresh]");
    if (th) { eb.threshold = th.dataset.thresh; renderActive(); return; }
    // reverse-mode controls
    const rab = e.target.closest("[data-revability]");
    if (rab) { eb.revCfg.ability = rab.dataset.revability; renderRev(); return; }
    const rin = e.target.closest("[data-revinvest]");
    if (rin) { eb.revCfg.invest = Number(rin.dataset.revinvest); renderRev(); return; }
    const rsp = e.target.closest("[data-revspeed]");
    if (rsp) { eb.revCfg.speed = rsp.dataset.revspeed; renderRev(); return; }
    const rvstg = e.target.closest("[data-revstage]");
    if (rvstg) {
      const k = rvstg.dataset.revstage;
      if (!eb.revCfg.stages) eb.revCfg.stages = { atk: 0, spa: 0, def: 0, spd: 0, spe: 0 };
      eb.revCfg.stages[k] = Math.max(-6, Math.min(6, (eb.revCfg.stages[k] || 0) + Number(rvstg.dataset.dir)));
      renderRev(); return;
    }
    const rvpl = e.target.closest("[data-revpool]");
    if (rvpl) { eb.revCfg.movepool = rvpl.dataset.revpool; renderRev(); return; }
    const rvb = e.target.closest("[data-revbasis]");
    if (rvb) { eb.revBasis = rvb.dataset.revbasis; renderRev(); return; }
    const rmr = e.target.closest("[data-rmv-remove]");
    if (rmr) { const id = Number(rmr.dataset.rmvRemove); eb.revCfg.moveset = (eb.revCfg.moveset || []).filter((x) => x !== id); if (!eb.revCfg.moveset.length) eb.revCfg.moveset = null; renderRev(); return; }
    // invented-move builder (One vs all): add from the three inputs / remove by index
    if (e.target.closest("[data-addcustom]")) {
      const type = $(".cmv-type").value, cls = $(".cmv-class").value;
      const power = Math.max(1, Math.min(250, Number($(".cmv-pow").value) || 80));
      if (!Array.isArray(eb.revCfg.custom)) eb.revCfg.custom = [];
      eb.revCfg.custom.push({ type, class: cls, power });
      renderRev(); return;
    }
    const rcm = e.target.closest("[data-rmv-custom]");
    if (rcm) { (eb.revCfg.custom || []).splice(Number(rcm.dataset.rmvCustom), 1); renderRev(); return; }
    // ---- Team check: threat list + per-cell fix-it detail ----
    if (e.target.closest("[data-import-pinned]")) {
      [...eb.pinned, ...eb.revPinned].forEach((sl) => { if (hasMon(sl) && !eb.threats.includes(sl)) eb.threats.push(sl); });
      renderTeam(); return;
    }
    const trm = e.target.closest("[data-threat-remove]");
    if (trm) { eb.threats = eb.threats.filter((sl) => sl !== trm.dataset.threatRemove); eb.teamExpanded = null; renderTeam(); return; }
    if (e.target.closest("[data-threats-clear]")) { eb.threats = []; eb.teamExpanded = null; renderTeam(); return; }
    if (e.target.closest("[data-goto-team]")) { onGotoTeam && onGotoTeam(); return; }
    const t2c = e.target.closest("[data-threat2counter]");
    if (t2c) { eb.editing = 0; s.mode = "ehp"; eb.expanded = null; setTarget(t2c.dataset.threat2counter); syncMode(); return; }
    if (e.target.closest("[data-tcell-close]")) { eb.teamExpanded = null; renderTeam(); return; }
    const tcl = e.target.closest("[data-tcell]");
    if (tcl) { eb.teamExpanded = eb.teamExpanded === tcl.dataset.tcell ? null : tcl.dataset.tcell; renderTeam(); return; }
    // ---- custom Pokémon builder ----
    if (e.target.closest("[data-custom-new]")) { eb.customDraft = newCustomDraft(); renderCustom(); return; }
    if (e.target.closest("[data-custom-cancel]")) { eb.customDraft = null; renderCustom(); return; }
    const ced = e.target.closest("[data-custom-edit]");
    if (ced) { const c = eb.customMons.find((x) => x.id === ced.dataset.customEdit); if (c) { eb.customDraft = { ...c, stats: { ...c.stats }, types: [...c.types], moves: [...(c.moves || [])] }; renderCustom(); } return; }
    const cdl = e.target.closest("[data-custom-del]");
    if (cdl) { removeCustom(cdl.dataset.customDel); return; }
    const cmr = e.target.closest("[data-cdraft-move-remove]");
    if (cmr && eb.customDraft) { eb.customDraft.moves = eb.customDraft.moves.filter((x) => x !== Number(cmr.dataset.cdraftMoveRemove)); renderCustom(); return; }
    if (e.target.closest("[data-custom-save]")) { saveCustomDraft(); return; }
    const rso = e.target.closest("[data-revsort]");
    if (rso) { eb.revSort = rso.dataset.revsort; renderRev(); return; }
    const rmg = e.target.closest("[data-revmega]");
    if (rmg) { eb.revMega = rmg.dataset.revmega; renderRev(); return; }
    const rft = e.target.closest("[data-revftype]");
    if (rft) { const t = rft.dataset.revftype; eb.revTypesOff.has(t) ? eb.revTypesOff.delete(t) : eb.revTypesOff.add(t); renderRev(); return; }
    const rts = e.target.closest("[data-revtypeset]");
    if (rts) { eb.revTypesOff.clear(); if (rts.dataset.revtypeset === "none") TYPES.forEach((t) => eb.revTypesOff.add(t)); renderRev(); return; }
    const r2c = e.target.closest("[data-rev2counter]");
    if (r2c) { eb.editing = 0; s.mode = "ehp"; eb.expanded = null; setTarget(r2c.dataset.rev2counter); syncMode(); return; }   // open this defender fully configurable in Counters
    const pt = e.target.closest("[data-ebstep]");
    if (pt) {
      const [g, k] = pt.dataset.ebstep.split(".");
      if (g === "spread") {
        // ±2 (real spreads are 32/32/2-style), capped per-stat at 32 AND by the shared 66-point pool
        const sp = tc().spread;
        const cur = sp[k] || 0;
        const room = POOL - (pointsUsed(sp) - cur);
        sp[k] = Math.max(0, Math.min(cur + Number(pt.dataset.dir) * 2, CAP, room));
      } else {
        const o = TCFG_KEYS.has(k) ? tc() : eb;
        o[k] = clampPts((o[k] || 0) + Number(pt.dataset.dir));
      }
      renderEb(); return;
    }
    const bs = e.target.closest("[data-ebstage]");
    if (bs) { const k = bs.dataset.ebstage; const o = TCFG_KEYS.has(k) ? tc() : eb; o[k] = Math.max(-6, Math.min(6, (o[k] || 0) + Number(bs.dataset.dir))); renderEb(); return; }
    const ta = e.target.closest("[data-ebability]");
    if (ta) { tc().ability = ta.dataset.ebability === "null" ? null : ta.dataset.ebability; renderEb(); return; }
    const rf = e.target.closest("[data-ebreset]");
    if (rf) { setTarget(tc().slug); return; }   // reset defenses to usage
    const tmr = e.target.closest("[data-tmove-remove]");
    if (tmr) { const id = Number(tmr.dataset.tmoveRemove); const cur = tc().targetMoves || currentTarget().threat.moves.map((mv) => moveIdByName.get(mv.name)); tc().targetMoves = cur.filter((x) => x !== id); renderEb(); return; }
    // target 1/2 tabs + drop 2nd target
    const tt = e.target.closest("[data-target-tab]");
    if (tt) { eb.editing = Number(tt.dataset.targetTab); eb.expanded = null; renderEb(); return; }
    if (e.target.closest("[data-target2-clear]")) { clearTarget2(); return; }
    const ai = e.target.closest("[data-atkinvest]");
    if (ai) { eb.atkInvest = Number(ai.dataset.atkinvest); renderEb(); return; }
    if (e.target.closest("[data-acc-toggle]")) { eb.useAccuracy = !eb.useAccuracy; renderActive(); return; }
    if (e.target.closest("[data-toggle-typefilters]")) { eb.showTypeFilters = !eb.showTypeFilters; renderActive(); return; }
    // filters
    const ft = e.target.closest("[data-ftype]");
    if (ft) { const t = ft.dataset.ftype; eb.fTypesOff.has(t) ? eb.fTypesOff.delete(t) : eb.fTypesOff.add(t); renderEb(); return; }
    const fmt = e.target.closest("[data-fmtype]");
    if (fmt) { const t = fmt.dataset.fmtype; eb.moveTypesOff.has(t) ? eb.moveTypesOff.delete(t) : eb.moveTypesOff.add(t); renderActive(); return; }
    const ftm = e.target.closest("[data-ftypemode]");
    if (ftm) { eb.fTypeMode = ftm.dataset.ftypemode; renderEb(); return; }
    const tset = e.target.closest("[data-typeset]");
    if (tset) {   // All/None quick buttons for either type row
      const [row, act] = tset.dataset.typeset.split(".");
      const set = row === "atk" ? eb.fTypesOff : eb.moveTypesOff;
      set.clear();
      if (act === "none") TYPES.forEach((t) => set.add(t));
      row === "mv" ? renderActive() : renderEb(); return;
    }
    const fc = e.target.closest("[data-fcat]");
    if (fc) { eb.fCat = fc.dataset.fcat; renderEb(); return; }
    const fmg = e.target.closest("[data-fmega]");
    if (fmg) { eb.fMega = fmg.dataset.fmega; renderEb(); return; }
    const asp = e.target.closest("[data-atkspeed]");
    if (asp) { eb.atkSpeed = asp.dataset.atkspeed; renderEb(); return; }
    const cb = e.target.closest("[data-candbulk]");
    if (cb) { eb.candBulk = cb.dataset.candbulk; renderEb(); return; }
    const apl = e.target.closest("[data-atkpool]");
    if (apl) { eb.movepool = apl.dataset.atkpool; renderEb(); return; }
    if (e.target.closest("[data-preset-save]")) {
      const inp = $(`${s.mode === "rev" ? "#rev-presets" : "#ehp-presets"} .cl-preset-name`);
      const baseSlug = s.mode === "rev" ? eb.revSlug : tc().slug;
      const name = (inp && inp.value.trim()) || (baseSlug && resolveMon(baseSlug) ? `${nameOf(resolveMon(baseSlug))} ${s.mode === "rev" ? "sweep" : "setup"}` : "Preset");
      const list = loadPresets(); list.push({ id: Date.now(), name, state: serializeLab() });
      savePresets(list); renderPresets(); return;
    }
    const pl = e.target.closest("[data-preset-load]");
    if (pl) { const p = loadPresets().find((x) => String(x.id) === pl.dataset.presetLoad); if (p) { applyLab(p.state); syncMode(); } return; }
    const pd = e.target.closest("[data-preset-del]");
    if (pd) { savePresets(loadPresets().filter((x) => String(x.id) !== pd.dataset.presetDel)); renderPresets(); return; }
  });

  // ---- mode switch (Counters | One vs all | Team check) ----
  function syncMode() {
    container.querySelectorAll("[data-calcmode]").forEach((b) => b.classList.toggle("active", b.dataset.calcmode === s.mode));
    ["ehp", "rev", "team"].forEach((m) => {
      container.querySelectorAll(`.calc-title-${m}`).forEach((el) => (el.hidden = s.mode !== m));
      $(`#calc-mode-${m}`).hidden = s.mode !== m;
    });
    renderCustom();
    if (s.mode === "rev") renderRev(); else if (s.mode === "team") renderTeam(); else renderEb();
  }

  // Resolve a defensive CONFIG into effective Lv50 stats + its own offense (the "what it does
  // back" reverse calc). Used by both the editable targets and the reverse-mode defenders.
  function targetFromCfg(cfg) {
    const mon = cfg && cfg.slug ? resolveMon(cfg.slug) : null;
    if (!mon) return null;
    const sp = cfg.spread, nat = cfg.nature, abil = cfg.ability, item = cfg.item;
    const base = statsFor(mon, "lv50");
    const hp = base.hp + (sp.hp || 0);
    let def = Math.floor((base.def + (sp.def || 0)) * natureMult(nat, "def"));
    let spd = Math.floor((base.spd + (sp.spd || 0)) * natureMult(nat, "spd"));
    if (eb.weather === "snow" && mon.types.includes("ice")) def = Math.floor(def * 1.5);   // Snow → Ice Def ×1.5
    if (eb.weather === "sand" && mon.types.includes("rock")) spd = Math.floor(spd * 1.5);  // Sand → Rock SpD ×1.5
    const defRaw = Math.max(1, def), spdRaw = Math.max(1, spd);   // before boost stages — for stat-ignore moves (Sacred Sword)
    const effDef = Math.max(1, Math.floor(def * stageMult(cfg.defStage)));
    const effSpd = Math.max(1, Math.floor(spd * stageMult(cfg.spdStage)));
    let spe = Math.max(1, Math.floor((base.spe + (sp.spe || 0)) * natureMult(nat, "spe") * stageMult(cfg.speStage)));
    // the target's own speed ability + Choice Scarf count too (Swift Swim wall in rain, Scarf user…)
    if (eb.weather !== "none" && SPEED_ABIL[abil] === eb.weather) spe *= 2;
    else if (abil === "surge-surfer" && eb.terrain === "electric") spe *= 2;
    else if (abil === "quick-feet" && eb.targetStatus !== "none") spe = Math.floor(spe * 1.5);
    if (abil === "unburden" && item === "none") spe *= 2;   // assumed: its Gem/Berry was already consumed
    if (item === "choice-scarf" && abil !== "klutz") spe = Math.floor(spe * 1.5);
    if (eb.targetStatus === "par" && abil !== "quick-feet") spe = Math.floor(spe / 2);   // paralysis halves Speed
    // the threat's own attacking set (editable; prefilled from usage) for the reverse calc
    const u = mon.usage || {};
    const tAtk = Math.floor((base.atk + (sp.atk || 0)) * natureMult(nat, "atk"));
    const tSpa = Math.floor((base.spa + (sp.spa || 0)) * natureMult(nat, "spa"));
    const um = (u.moves || []).map(([nm]) => movesByName.get(nm)).filter((mv) => mv && mv.class !== "status" && mv.type);
    const pool = mon.moves.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type);
    const chosen = cfg.targetMoves && cfg.targetMoves.length ? cfg.targetMoves.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type) : (um.length ? um : pool);
    const threat = { mon, atk: tAtk, spa: tSpa, def: effDef, spe, types: mon.types, ability: abil, item, weight: mon.weight, moves: chosen };
    return { mon, hp, def: effDef, spd: effSpd, spe, defRaw, spdRaw, ability: abil, threat,
      lv: { hp, def: effDef, spd: effSpd, atk: base.atk, spe } };
  }
  const currentTarget = (i = eb.editing) => targetFromCfg(eb.targets[i]);
  // Reverse mode: a defender at the chosen basis (ladder set | base 0-invest), plus any
  // per-defender overrides. defenderCfg is also what the row set-line and panel display.
  function defenderCfg(mon) {
    let basis;
    if (eb.revBasis === "base") basis = { ...newTargetCfg(), slug: mon.slug, ability: offDefaultAbility(mon) };
    else if (eb.revBasis === "bulk") basis = { ...newTargetCfg(), slug: mon.slug, ability: offDefaultAbility(mon), spread: optimizeSpread(mon, "mixed", emptySpread()) };  // global preset: every defender at max mixed bulk
    else basis = usageCfg(mon);
    return { ...basis, ...(eb.revOverrides.get(mon.slug) || {}) };
  }
  const defenderTarget = (mon) => targetFromCfg(defenderCfg(mon));

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
  const NO_STAGES = { atk: 0, spa: 0, def: 0, spd: 0, spe: 0 };
  function atkSettings(entry) {
    const o = eb.overrides.get(entry.mon.slug) || {};
    return {
      ability: o.ability !== undefined ? o.ability : smartDefaultAbility(entry.mon),
      invest: o.invest !== undefined ? o.invest : eb.atkInvest,
      nature: o.nature !== undefined ? o.nature : eb.atkNature,
      item: o.item !== undefined ? o.item : eb.atkItem,
      boost: o.boost !== undefined ? o.boost : eb.atkBoost,
      speed: o.speed !== undefined ? o.speed : eb.atkSpeed,
      stages: { ...NO_STAGES, ...(o.stages || {}) },   // per-stat setup (Iron Defense = +2 def)
      movepool: o.movepool !== undefined ? o.movepool : eb.movepool,
    };
  }
  // Effective attacker Speed (invest + stages + speed-boosting abilities + Choice Scarf).
  function attackerSpe(entry, st) {
    let spe = entry.lv.spe + (st.speed === "max" ? 32 : 0);
    if (st.stages && st.stages.spe) spe = Math.max(1, Math.floor(spe * stageMult(st.stages.spe)));
    const a = st.ability;
    if (eb.weather !== "none" && SPEED_ABIL[a] === eb.weather) spe *= 2;         // Sand Rush / Swift Swim / Chlorophyll / Slush Rush
    else if (a === "surge-surfer" && eb.terrain === "electric") spe *= 2;         // Surge Surfer
    else if (a === "quick-feet" && eb.userStatus !== "none") spe = Math.floor(spe * 1.5);
    else if ((a === "protosynthesis" && eb.weather === "sun") || (a === "quark-drive" && eb.terrain === "electric")) {
      if (hiStatOf(entry.mon) === "spe") spe = Math.floor(spe * 1.3);            // Paradox: Speed boosted if it's the highest stat
    }
    if (a === "unburden" && st.item === "none") spe *= 2;   // assumed: its Gem/Berry was already consumed
    if (st.item === "choice-scarf" && a !== "klutz") spe = Math.floor(spe * 1.5);
    if (eb.userStatus === "par" && a !== "quick-feet") spe = Math.floor(spe / 2);   // paralysis halves Speed (Quick Feet ignores)
    return spe;
  }
  // Effective attacking stats after invest/nature/stages — what the damage math actually uses.
  function effOffense(entry, st) {
    const eff = (base, key) => {
      const nat = st.nature === "auto" ? 1.1 : natureMult(st.nature, key);
      const stg = Math.max(-6, Math.min(6, (st.boost || 0) + ((st.stages || NO_STAGES)[key] || 0)));
      return Math.max(1, Math.floor(Math.floor((base + st.invest) * nat) * stageMult(stg)));
    };
    return { atk: eff(entry.lv.atk, "atk"), spa: eff(entry.lv.spa, "spa") };
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
  function threatEval(th, defEntry, mv, defStages = null) {
    const defHP = defEntry.lv.hp + (eb.candBulk === "hp" ? 32 : 0);   // candidates' bulk preset
    const defAbil = defaultAbility(defEntry.mon);
    const ctx = { userWeight: abilWeight(th.weight, th.ability), targetWeight: abilWeight(defEntry.mon.weight, defAbil), userSpe: th.spe, targetSpe: defEntry.lv.spe, skillLink: th.ability === "skill-link" };
    const ep = effectivePower(mv, ctx);
    if (ep.kind === "skip" || ep.kind === "ohko") return null;
    const cat = mv.class;
    const moldBreaker = MOLD_BREAKER.has(th.ability);
    if (!moldBreaker) {   // the candidate's move-class immunities block the return hit
      if (defAbil === "bulletproof" && hasFlag(mv, "Bomb/Ball")) return null;
      if (defAbil === "soundproof" && hasFlag(mv, "Sound")) return null;
      if (defAbil === "damp" && DAMP_BLOCKED.has(mv.name)) return null;
    }
    const ebW = th.ability === "mega-sol" && eb.weather !== "sun" ? { ...eb, weather: "sun" } : eb;
    // Liquid Voice (e.g. target Primarina): its Sound moves hit back as Water
    const mvType = th.ability === "liquid-voice" && (mv.flags || []).includes("Sound") && mv.type !== "water" ? "water" : mv.type;
    const typeEff = typeEffOf(mvType, mv.name, defEntry.mon.types, defAbil, moldBreaker, th.ability === "scrappy");
    if (typeEff === 0) return null;
    const se = typeEff > 1;
    // conditionals with roles swapped: the TARGET is the user here (its status, its item as the
    // held item; the candidate's item/mega-ness for Knock Off etc.; "first" = target outspeeds)
    const cond = conditionalMods(mv, {
      eb: { ...ebW, userStatus: eb.targetStatus, targetStatus: eb.userStatus, item: eb.atkItem },
      first: th.spe > defEntry.lv.spe,
      st: { item: th.item, ability: th.ability, boost: 0 },
      target: { mon: defEntry.mon },
    });
    if (cond.blocked) return null;
    let minPct, maxPct;
    if (ep.kind === "fixed") minPct = maxPct = (ep.dmg / defHP) * 100;
    else if (ep.kind === "frac") minPct = maxPct = ep.frac * 100;
    else {
      const am = abilityMods(th.ability, { mv, cat, bp: ep.bp, weather: ebW.weather, terrain: eb.terrain, typeEff, first: true, hiStat: hiStatOf(th.mon), status: eb.targetStatus });
      const stab = th.types.includes(mvType) ? (am.stab || 1.5) : 1;
      let atk = mv.name === "Foul Play" ? defEntry.lv.atk : mv.name === "Body Press" ? th.def : cat === "physical" ? th.atk : th.spa;
      const chg = CHARGE_MOVES[mv.name];
      if (chg && chg.boost && defAbil !== "unaware") atk = Math.floor(atk * stageMult(1));   // its charge boost hits back too
      // the candidate's own setup stages harden it (Iron Defense = less taken)
      const dst = defStages || NO_STAGES;
      const def = cat === "physical" || PSY_DEF.has(mv.name)
        ? Math.max(1, Math.floor(defEntry.lv.def * stageMult(dst.def || 0)))
        : Math.max(1, Math.floor(defEntry.lv.spd * stageMult(dst.spd || 0)));
      let other = am.mult * cond.mult;
      // Merciless target: guaranteed crit onto a poisoned candidate (unless crit-proof)
      if (th.ability === "merciless" && eb.userStatus === "psn" && !["shell-armor", "battle-armor"].includes(defAbil)) other *= 1.5;
      if (defAbil === "fairy-aura" && mvType === "fairy") other *= 4 / 3;   // the candidate's aura boosts the threat's fairy moves too
      if (th.item && th.ability !== "klutz" && OFF_ITEMS[th.item]) { const r = OFF_ITEMS[th.item].mult(se, cat); if (r && r.m) other *= r.m; }   // target's offensive item
      const field = fieldOffenseMult(mv, cat, ebW, false, false); other *= field.m;   // screens protect the target, not the candidate
      if (eb.doubles && isSpread(mv)) other *= 0.75;
      if (TARGET_DMG[defAbil]) other *= TARGET_DMG[defAbil]({ mv, cat, terrain: eb.terrain, tStatus: "none", atkAbility: th.ability });  // candidate's Multiscale/Fur Coat/…
      const burn = eb.targetStatus === "brn" && cat === "physical" && th.ability !== "guts" && mv.name !== "Facade" ? 0.5 : 1;   // burned target's physical return is halved
      const r = computeDamage({ level: 50, power: Math.max(1, Math.round(ep.bp * cond.bpMul)), atk, def, type: typeEff, stab, crit: 1, weather: 1, burn, other });
      const hits = ep.hits || 1;
      minPct = (r.min * hits / defHP) * 100; maxPct = (r.max * hits / defHP) * 100;
    }
    return { mv, minPct, maxPct, prio: (mv.priority || 0)
      + (th.ability === "gale-wings" && mvType === "flying" ? 1 : 0)
      + (mv.name === "Grassy Glide" && eb.terrain === "grassy" && grounded(th.types, th.ability) ? 1 : 0) };
  }
  // The target's move list onto a candidate, best-first (for the survive readout + expander).
  // The candidate's own setup stages (Iron Defense…) harden it here.
  function threatMovesOnto(defEntry, target, stOverride = null) {
    const dst = (stOverride || atkSettings(defEntry)).stages;
    const rows = target.threat.moves.map((mv) => threatEval(target.threat, defEntry, mv, dst)).filter(Boolean).sort((a, b) => b.maxPct - a.maxPct);
    return rows;
  }
  function threatBestOnto(entry, target, stOverride = null) {
    const rows = threatMovesOnto(entry, target, stOverride);
    const b = rows[0];
    return b ? { pct: b.maxPct, minPct: b.minPct, mv: b.mv, prio: b.prio } : { pct: 0, minPct: 0, mv: null, prio: 0 };
  }

  // Evaluate one move for an attacker vs the target under `st` (per-attacker settings). null = unusable.
  function evalMove(entry, target, mv, st, ctx, speFirst) {
    if (!mv || mv.class === "status" || !mv.type) return null;
    // -ate abilities retype Normal moves (Aerilate/Pixilate/…); Liquid Voice retypes Sound
    // moves to Water (no ×1.2). The effective type drives eff/STAB.
    const ate = ATE_ABIL[st.ability] && mv.type === "normal" ? ATE_ABIL[st.ability] : null;
    const liquid = st.ability === "liquid-voice" && (mv.flags || []).includes("Sound") && mv.type !== "water" ? "water" : null;
    const mvType = liquid || ate || mv.type;
    if (eb.moveTypesOff.has(mvType)) return null;   // move-type filter: don't use moves of dropped types
    const cat = mv.class;
    const ep = effectivePower(mv, ctx);
    if (ep.kind === "skip") return null;
    const moldBreaker = MOLD_BREAKER.has(st.ability);
    if (!moldBreaker) {   // move-class immunities on the target
      if (target.ability === "bulletproof" && hasFlag(mv, "Bomb/Ball")) return null;
      if (target.ability === "soundproof" && hasFlag(mv, "Sound")) return null;
      if (target.ability === "damp" && DAMP_BLOCKED.has(mv.name)) return null;
    }
    const typeEff = typeEffOf(mvType, mv.name, target.mon.types, target.ability, moldBreaker, st.ability === "scrappy");
    if (typeEff === 0) return null;
    // Mega Sol: the HOLDER's own moves behave as if it were sunny (offense-side only)
    const ebW = st.ability === "mega-sol" && eb.weather !== "sun" ? { ...eb, weather: "sun" } : eb;
    const uGrd = grounded(entry.mon.types, st.ability), tGrd = grounded(target.mon.types, target.ability);
    const se = typeEff > 1;
    const cond = conditionalMods(mv, { eb: ebW, first: speFirst, st, target, grounded: { user: uGrd, target: tGrd } });
    if (cond.blocked) return null;
    const realHP = target.lv.hp;
    const charge = CHARGE_MOVES[mv.name];
    const chargeSkipped = !!(charge && charge.skip && ebW.weather === charge.skip);
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
      const am = abilityMods(st.ability, { mv, cat, bp: ep.bp, weather: ebW.weather, terrain: eb.terrain, typeEff, first: speFirst, hiStat: hiStatOf(entry.mon), status: eb.userStatus });
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
        // Unaware target ignores the attacker's stat boosts (setup AND charge-turn boosts).
        // Stage = global "+attacking stat" preset + this mon's per-stat stage for the stat
        // THIS move uses (Body Press reads the Def stage — Iron Defense setups work).
        const stg = Math.max(-6, Math.min(6, (st.boost || 0) + ((st.stages || NO_STAGES)[as.key] || 0)));
        if (stg && !(target.ability === "unaware")) atk = Math.max(1, Math.floor(atk * stageMult(stg)));
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
      if (liquid) notes.push("→ water (Liquid Voice)");
      if (st.ability === "merciless" && eb.targetStatus === "psn" && target.ability !== "shell-armor" && target.ability !== "battle-armor") { other *= 1.5; notes.push("crit (Merciless)"); }
      if (protean && !entry.mon.types.includes(mvType)) notes.push("Protean");
      if (st.item !== "none" && st.ability !== "klutz" && OFF_ITEMS[st.item]) { const r = OFF_ITEMS[st.item].mult(se, cat); if (r && r.m) { other *= r.m; if (r.note) notes.push(r.note); } }
      if (target.ability === "fairy-aura" && mvType === "fairy") { other *= 4 / 3; notes.push("Fairy Aura (aura is field-wide)"); }   // the aura boosts EVERYONE's fairy moves
      const field = fieldOffenseMult(mv, cat, ebW, st.ability === "infiltrator", true, uGrd, tGrd); other *= field.m; field.notes.forEach((n) => notes.push(n));
      if (eb.doubles && isSpread(mv)) { other *= 0.75; notes.push("spread"); }   // doubles spread reduction
      // one-time reductions apply to the FIRST hit only (full-HP shields / a consumed berry);
      // later hits in the KO simulation use the unshielded number.
      let oneTime = 1;
      if (eb.item === "resist-berry" && eb.ability !== "klutz" && se) { oneTime *= 0.5; notes.push("berry ½ (1st hit)"); }
      if (!moldBreaker && (target.ability === "multiscale" || target.ability === "shadow-shield")) { oneTime *= 0.5; notes.push(`${(data.abilities[target.ability] || {}).name} ½ (1st hit)`); }
      if (!moldBreaker && TARGET_DMG[target.ability] && target.ability !== "multiscale" && target.ability !== "shadow-shield") {
        const tdm = TARGET_DMG[target.ability]({ mv, cat, terrain: eb.terrain, tStatus: eb.targetStatus, noContact: st.ability === "long-reach", atkAbility: st.ability });
        if (tdm !== 1) { other *= tdm; notes.push(`${(data.abilities[target.ability] || {}).name || target.ability} ×${tdm.toFixed(2).replace(/\.?0+$/, "")}`); }
        else if (target.ability === "intimidate" && cat === "physical" && INTIM_IMMUNE.has(st.ability)) {
          notes.push(["defiant", "competitive", "contrary"].includes(st.ability) ? "Intimidate backfires (+boost)" : "ignores Intimidate");
        }
      }
      pw = Math.max(1, Math.round(ep.bp * cond.bpMul));
      // burn halves the burned user's physical damage — Guts and Facade ignore it
      const burn = eb.userStatus === "brn" && cat === "physical" && st.ability !== "guts" && mv.name !== "Facade" ? 0.5 : 1;
      if (burn < 1) notes.push("burn ½");
      // one-time shields (Multiscale/berry) only cover the FIRST strike of a multi-hit move
      const hits = ep.hits || 1;
      const shieldMult = hits > 1 ? (oneTime + (hits - 1)) / hits : oneTime;
      const r = computeDamage({ level: 50, power: pw, atk, def, type: typeEff, stab, crit: 1, weather: 1, burn, other: other * shieldMult });
      if (!r.max) return null;
      minPct = (r.min * hits / realHP) * 100; maxPct = (r.max * hits / realHP) * 100;
      if (shieldMult !== 1) {   // unshielded later-hit damage for the KO simulation
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
    // honest KO count: sequential hits with one-time shields, Leftovers/Sitrus recovery,
    // and per-turn status chip on the target (burn −6.25%, poison −12.5%; Magic Guard blocks
    // chip, Poison Heal turns poison into +12.5%, Ice Body/Rain Dish heal in their weather)
    let chip = 0;
    if (eb.targetStatus === "brn" && target.ability !== "magic-guard") chip -= 6.25;
    else if (eb.targetStatus === "psn") chip += target.ability === "poison-heal" ? 12.5 : (target.ability === "magic-guard" ? 0 : -12.5);
    if (target.ability === "ice-body" && eb.weather === "snow") chip += 6.25;
    if (target.ability === "rain-dish" && eb.weather === "rain") chip += 6.25;
    const simOpts = {
      block: guard === "Disguise", absorb: guard === "Sash" || guard === "Sturdy",
      leftovers: eb.item === "leftovers" && eb.ability !== "klutz",
      sitrus: eb.item === "sitrus-berry" && eb.ability !== "klutz",
      chip,
    };
    const nMin = simKO(minPct, laterMin ?? minPct, simOpts);
    const nBest = simKO(maxPct, laterMax ?? maxPct, simOpts);
    const prio = (mv.priority || 0)
      + (st.ability === "gale-wings" && mvType === "flying" ? 1 : 0)                       // Gale Wings
      + (mv.name === "Grassy Glide" && eb.terrain === "grassy" && uGrd ? 1 : 0);           // Grassy Glide in terrain
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
      if (o.chip) { hp = Math.min(100, hp + o.chip); if (hp <= 0) return n; }   // status chip can finish the KO
    }
    return 99;
  }

  // Every usable move for an attacker vs the target (sorted by max %), respecting exclusions.
  // stOverride lets the "into range" ladder simulate hypothetical settings.
  function movesVsTarget(entry, target, includeExcluded = false, stOverride = null) {
    const st = stOverride || atkSettings(entry);
    const ctx = { userWeight: abilWeight(entry.mon.weight, st.ability), targetWeight: abilWeight(target.mon.weight, target.ability), userSpe: attackerSpe(entry, st), targetSpe: target.spe, skillLink: st.ability === "skill-link" };
    const speFirst = attackerSpe(entry, st) > target.spe;
    let pool = entry.mon.moves;
    if (Array.isArray(st.moveset) && st.moveset.length) pool = st.moveset;   // explicit custom moveset wins
    else if (st.movepool === "ladder") {   // else restrict to the mon's real ladder moveset (falls back to all if unladdered)
      const um = ((entry.mon.usage || {}).moves || []).map(([nm]) => moveIdByName.get(nm)).filter((id) => id != null);
      if (um.length) pool = um;
    }
    const rows = [];
    for (const id of pool) {
      if (!includeExcluded && eb.excluded.has(id)) continue;
      const row = evalMove(entry, target, data.moves[id], st, ctx, speFirst);
      if (row) { row.id = id; rows.push(row); }
    }
    // invented moves (One vs all builder) — evaluated like real moves, flagged "custom"
    (st.custom || []).forEach((c, i) => {
      const row = evalMove(entry, target, customMove(c), st, ctx, speFirst);
      if (row) { row.id = "c" + i; row.custom = true; row.notes.push("custom"); rows.push(row); }
    });
    return rows.sort((a, b) => b.maxPct - a.maxPct);
  }
  // A synthetic move object for the builder — plain single hit, no flags/secondaries,
  // so none of the special-case tables match and evalMove treats it as a vanilla attack.
  const customMove = (c) => ({ name: `Custom ${c.power}`, type: c.type, class: c.class, power: c.power,
    accuracy: 100, pp: null, priority: 0, target: "selected-pokemon", flags: [], secondaries: [], effect: "" });

  // Best move each attacker has vs the target (null if none), + speed/survivability.
  function bestVsTarget(entry, target, stOverride = null) {
    const st = stOverride || atkSettings(entry);
    const cands = movesVsTarget(entry, target, false, st);
    if (!cands.length) return null;
    const reliable = cands.filter((c) => !c.risky);
    const best = (reliable.length ? reliable : cands).sort((a, b) => b.expected - a.expected)[0];
    const aSpe = attackerSpe(entry, st);
    const back = threatBestOnto(entry, target, st);
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
    const fam = mon.isCustom ? { base: null, megas: [] } : formFamily(mon, data.pokemon);   // slug-derived: regionals never offer a Mega
    const forms = [];
    if (fam.base) forms.push(fam.base);
    forms.push(...fam.megas);
    const formBtns = forms.length > 1 ? forms.map((f) =>
      `<button class="df-btn ${f.slug === mon.slug ? "on" : ""}" data-target-form="${f.slug}">${f.isMega ? (f.formLabel || "Mega") : "Base"}</button>`).join("") : "";
    const cfg = tc();
    const tabils = (mon.abilities || []).map((a) => a.slug);
    const abilRow = tabils.length ? `<div class="cl-abil"><span class="cl-stat-lab">Ability</span>
      <button class="tm-abil-chip ${cfg.ability == null ? "on" : ""}" data-ebability="null">None</button>
      ${tabils.map((slug) => `<button class="tm-abil-chip ${cfg.ability === slug ? "on" : ""}" data-ebability="${slug}">${(data.abilities[slug] || {}).name || slug}</button>`).join("")}</div>` : "";
    const excludedChips = eb.excluded.size ? `<div class="cl-excluded"><span class="cl-stat-lab">Excluded moves</span>
      ${[...eb.excluded].map((id) => data.moves[id] ? `<span class="cl-exchip"><span class="cl-exchip-nm" data-move-info="${id}" title="Open ${data.moves[id].name}">${data.moves[id].name}</span><button data-unexclude="${id}" aria-label="restore">✕</button></span>` : "").join("")}</div>` : "";
    // target 1/2 tabs (only when a 2nd target exists)
    const t2 = eb.targets[1];
    const tabRow = t2 ? `<div class="cl-ttabs">
      ${[0, 1].map((i) => { const c = eb.targets[i]; const m = c && resolveMon(c.slug); return `<button class="cl-ttab ${eb.editing === i ? "on" : ""}" data-target-tab="${i}"><img src="${m ? (m.sprite || m.artwork || "") : ""}" alt="">T${i + 1} ${m ? nameOf(m) : ""}</button>`; }).join("")}
      <button class="cl-ttab-x" data-target2-clear title="Remove the 2nd target">✕ 2nd</button>
    </div>` : "";

    return `<section class="calc-card cl-target">
      ${tabRow}
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
        <div class="cl-sec-head"><span>${t2 ? `Target ${eb.editing + 1} set` : "Target set"}</span>
          <span class="cl-points ${pointsUsed(cfg.spread) > POOL ? "over" : ""}">Points ${pointsUsed(cfg.spread)}/${POOL}</span>
          <button class="btn-sm cl-reset" data-ebreset title="Reset to this mon's ladder usage">↺ usage</button></div>
        <div class="cl-editor">
          ${ptStepper("HP", "spread.hp", cfg.spread.hp)}
          ${ptStepper("Def", "spread.def", cfg.spread.def)}
          ${ptStepper("Sp.Def", "spread.spd", cfg.spread.spd, "Special Defense — not Speed")}
          ${ptStepper("Speed", "spread.spe", cfg.spread.spe, "Speed — decides who moves first")}
          ${ptStepper("Atk", "spread.atk", cfg.spread.atk, "Attack — its physical damage back")}
          ${ptStepper("Sp.Atk", "spread.spa", cfg.spread.spa, "Sp. Atk — its special damage back")}
          <div class="cl-stat"><span class="cl-stat-lab">Nature</span>${natSelect('data-ebsel="nature"', cfg.nature)}</div>
          ${stageStepper("Def boost", "defStage", cfg.defStage)}
          ${stageStepper("Sp.Def boost", "spdStage", cfg.spdStage, "Special Defense — not Speed")}
          ${stageStepper("Speed boost", "speStage", cfg.speStage)}
        </div>
        <div class="cl-tmoves"><span class="cl-stat-lab">Its moves</span>
          ${(target.threat.moves || []).map((mv) => `<span class="cl-exchip"><span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span><span class="cl-exchip-nm" data-move-info="${moveIdByName.get(mv.name)}" title="Open ${mv.name}">${mv.name}</span><button data-tmove-remove="${moveIdByName.get(mv.name)}" aria-label="remove">✕</button></span>`).join("") || '<small class="muted">no damaging moves</small>'}
        </div>
        ${abilRow}
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Field conditions</span></div>
        <div class="cl-conditions">
          <div class="cl-stat"><span class="cl-stat-lab">Weather</span>${seg("weather", WEATHERS, eb.weather)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Terrain</span>${seg("terrain", TERRAINS, eb.terrain)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Screen</span>${seg("screen", SCREENS, eb.screen)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Target item</span>${seg("item", DEF_ITEMS, cfg.item)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Target status</span>${seg("targetStatus", { none: "Healthy", psn: "Poisoned", brn: "Burned", par: "Paralyzed", slp: "Asleep" }, eb.targetStatus)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Attacker status</span>${seg("userStatus", { none: "Healthy", brn: "Burned", psn: "Poisoned", par: "Paralyzed" }, eb.userStatus)}</div>
          <label class="cl-avail cl-doubles" title="Champions is doubles (Reg M-B): spread moves like Earthquake do ×0.75"><input type="checkbox" data-ebsel="doubles" ${eb.doubles ? "checked" : ""}> Doubles spread ×0.75</label>
        </div>
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Attackers — global preset</span>
          <label class="cl-toggle" data-acc-toggle title="Weight damage by each move's accuracy (off = potential damage)"><input type="checkbox" tabindex="-1" ${eb.useAccuracy ? "checked" : ""}> weight by accuracy</label></div>
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
          <div class="cl-stat" title="All learnable moves or only each mon's real ladder set"><span class="cl-stat-lab">Movepool</span>
            <div class="seg cl-invest">${[["all", "All"], ["ladder", "Ladder"]].map(([v, l]) => `<button data-atkpool="${v}" class="${eb.movepool === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
        </div>
        ${excludedChips}
      </div>
      ${renderFilters()}
    </section>`;
  }

  // The two 18-chip type grids (attacker types + move types) collapse behind one toggle so
  // results sit far higher up. Badge = how many types are currently filtered out.
  function typeFilterToggle() {
    const n = eb.fTypesOff.size + eb.moveTypesOff.size;
    return `<button class="cl-typetoggle ${eb.showTypeFilters ? "open" : ""} ${n ? "has" : ""}" data-toggle-typefilters title="Filter by attacker type / move type">
      <span class="cl-tt-ico">◧</span> Type filters ${n ? `<span class="cl-tt-badge">${n}</span>` : ""}<span class="cl-tt-caret">${eb.showTypeFilters ? "▾" : "▸"}</span></button>`;
  }
  // "Attackers — filter & sort": lives INSIDE the target card as its last section —
  // the exact mirror of One-vs-all's "Defenders — filter & sort".
  function renderFilters() {
    const roleOpts = { any: "Any role", physical: "Physical", special: "Special", mixed: "Mixed", defensive: "Defensive" };
    return `<div class="cl-sec">
      <div class="cl-sec-head"><span>Attackers — filter &amp; sort</span></div>
      <div class="cl-conditions">
        <div class="seg cl-catseg">${[["any", "All"], ["physical", "Phys"], ["special", "Spec"]].map(([v, l]) => `<button data-fcat="${v}" class="${eb.fCat === v ? "active" : ""}">${l}</button>`).join("")}</div>
        <div class="seg cl-megaseg">${[["all", "All"], ["hide", "No mega"], ["only", "Only mega"]].map(([v, l]) => `<button data-fmega="${v}" class="${eb.fMega === v ? "active" : ""}">${l}</button>`).join("")}</div>
        ${seg("fRole", roleOpts, eb.fRole)}
        <div class="seg ehp-thresh">${[["any", "Any dmg"], ["ohko", "OHKO"], ["2hko", "2HKO"], ["3hko", "3HKO"]].map(([v, l]) => `<button data-thresh="${v}" class="${eb.threshold === v ? "active" : ""}">${l}</button>`).join("")}</div>
        <label class="cl-toggle"><input type="checkbox" data-ebsel="fAvail" ${eb.fAvail ? "checked" : ""}> Available</label>
        <label class="cl-toggle" title="Hide attackers the target OHKOs back"><input type="checkbox" data-ebsel="fSurvive" ${eb.fSurvive ? "checked" : ""}> Survives target</label>
        <label class="cl-toggle" title="Only attackers that move first"><input type="checkbox" data-ebsel="fFaster" ${eb.fFaster ? "checked" : ""}> Outspeeds</label>
        ${typeFilterToggle()}
      </div>
      <div class="cl-typefilters" ${eb.showTypeFilters ? "" : "hidden"}>
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

  // The two-column matchup (your moves → target, and its moves → you) for one target.
  function matchupBlock(entry, target, stOverride = null) {
    const mon = entry.mon;
    const moves = movesVsTarget(entry, target, true, stOverride).map((r) => {
      const v = verdict(r);
      const fl = [];
      if (r.se) fl.push(`<span class="ehp-flag se">SE ×${r.typeEff}</span>`);
      else if (r.typeEff < 1) fl.push(`<span class="ehp-flag nve" title="Not very effective — the target resists this type">resisted ×${fracMult(r.typeEff)}</span>`);
      if (r.stab > 1) fl.push(`<span class="ehp-flag stab">STAB</span>`);
      if (eb.useAccuracy && r.acc < 100) fl.push(`<span class="ehp-flag acc">${r.acc}%</span>`);
      if (r.risky) fl.push(`<span class="ehp-flag risky">risky</span>`);
      r.notes.forEach((n) => fl.push(`<span class="ehp-flag mh">${n}</span>`));
      const excl = !r.custom && eb.excluded.has(r.id);
      // custom moves: no popup, and ✕ removes the invented move instead of excluding
      const xBtn = r.custom
        ? `<button class="ehp-x" data-rmv-custom="${r.id.slice(1)}" title="remove this custom move">✕</button>`
        : `<button class="ehp-x" ${excl ? `data-unexclude="${r.id}"` : `data-exclude="${r.id}"`} title="${excl ? "re-include this move" : "exclude this move"}">${excl ? "＋" : "✕"}</button>`;
      return `<div class="apm-move ${excl ? "excl" : ""}" ${r.custom ? "" : `data-move-info="${r.id}"`}>
        <span class="apm-mv"><span class="type tiny" style="background:${TYPE_COLORS[r.effType]}">${r.effType}</span>${r.mv.name}${r.pw ? `<small class="ehp-pw">${r.pw}</small>` : ""}</span>
        <span class="apm-pct">${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${v.cls}">${v.txt}</span>
        <span class="apm-fl">${fl.join("")}</span>
        ${xBtn}
      </div>`;
    }).join("");
    const back = threatMovesOnto(entry, target, stOverride).map((r) => {
      const ko = r.maxPct >= 100 ? "faints you" : `you keep ${Math.round(100 - r.maxPct)}%`;
      const cls = r.maxPct >= 100 ? "ko-o" : 2 * r.minPct >= 100 ? "ko-2" : "ko-n";
      return `<div class="apm-move back" data-move-info="${moveIdByName.get(r.mv.name)}">
        <span class="apm-mv"><span class="type tiny" style="background:${TYPE_COLORS[r.mv.type]}">${r.mv.type}</span>${r.mv.name}${r.prio ? `<small class="ehp-pw">prio ${r.prio > 0 ? "+" + r.prio : r.prio}</small>` : ""}</span>
        <span class="apm-pct">${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${cls}">${ko}</span>
      </div>`;
    }).join("");
    return `<div class="ap-matchup">
      <div class="ap-col"><div class="ap-col-h">${nameOf(mon)} → ${nameOf(target.mon)}</div>
        <div class="ap-moves">${moves || '<p class="ehp-empty">No usable damaging move.</p>'}</div></div>
      <div class="ap-col"><div class="ap-col-h back">${nameOf(target.mon)} → ${nameOf(mon)} <small>(what you survive)</small></div>
        <div class="ap-moves">${back || '<p class="ehp-empty">Target has no damaging move set.</p>'}</div></div>
    </div>`;
  }

  // Minimal cumulative upgrade ladder to reach the KO threshold on ALL given targets.
  function intoRange(entry, targets, baseOverride = null) {
    const thr = eb.threshold === "any" ? "2hko" : eb.threshold;   // "Any" ⇒ aim for a 2HKO
    const need = (r) => r && (thr === "ohko" ? r.nBest === 1 : thr === "2hko" ? r.nMin <= 2 : r.nMin <= 3);
    const meets = (st) => targets.every((t) => need(bestVsTarget(entry, t, st)));
    const label = { ohko: "OHKO", "2hko": "2HKO", "3hko": "3HKO" }[thr];
    const base = baseOverride || atkSettings(entry);
    // cumulative steps layered onto the current settings
    const steps = [
      { note: "as configured", set: (s) => s },
      { note: "Max invest", set: (s) => ({ ...s, invest: 32 }) },
      { note: "+ +Atk nature", set: (s) => ({ ...s, nature: "auto" }) },
      { note: "+ Life Orb", set: (s) => ({ ...s, item: "life-orb" }) },
      { note: "+ +1", set: (s) => ({ ...s, boost: Math.max(s.boost, 1) }) },
      { note: "+ +2", set: (s) => ({ ...s, boost: Math.max(s.boost, 2) }) },
    ];
    let st = { ...base }, used = [];
    for (const step of steps) {
      st = step.set(st);
      if (step.note !== "as configured") used.push(step.note.replace("+ ", ""));
      if (meets(st)) {
        return step.note === "as configured"
          ? `<span class="ir ok">✓ already reaches ${label} on ${targets.length > 1 ? "both" : "the target"}</span>`
          : `<span class="ir ok">reaches ${label} on ${targets.length > 1 ? "both" : "target"} with: <b>${used.join(" · ")}</b></span>`;
      }
    }
    return `<span class="ir no">✗ not in ${label} range on ${targets.length > 1 ? "both" : "target"} even at Max + +Atk + Life Orb + +2</span>`;
  }

  // Inline per-attacker inspector: ability + override controls + speed line + matchup(s).
  function renderAttackerPanel(entry, t1, t2 = null) {
    const mon = entry.mon;
    const st = atkSettings(entry);
    const abilChips = (mon.abilities || []).map((a) => `<button class="tm-abil-chip ${st.ability === a.slug ? "on" : ""}" data-ovrability="${a.slug}">${(data.abilities[a.slug] || {}).name || a.slug}</button>`).join("");
    const investSeg = `<div class="seg cl-invest">${[[32, "Max"], [16, "Half"], [0, "None"]].map(([v, l]) => `<button data-ovrinvest="${v}" class="${st.invest === v ? "active" : ""}">${l}</button>`).join("")}</div>`;
    const speedSeg = `<div class="seg cl-invest">${[["base", "Base"], ["max", "Max"]].map(([v, l]) => `<button data-ovrspeed="${v}" class="${st.speed === v ? "active" : ""}">${l}</button>`).join("")}</div>`;
    const natSel = natSelect('data-ovrsel="nature"', st.nature, true);
    const itemSel = `<select class="cl-sel" data-ovrsel="item">${Object.entries(OFF_ITEMS).map(([k, val]) => `<option value="${k}" ${st.item === k ? "selected" : ""}>${val.label}</option>`).join("")}</select>`;
    // per-stat setup stages: Iron Defense = +2 Def → powers Body Press AND halves physical taken
    const stageStep = (k, label, title = "") => `<div class="cl-stat"${title ? ` title="${title}"` : ""}><span class="cl-stat-lab">${label}</span>
      <div class="cl-step"><button data-ovrstage="${k}" data-dir="-1">−</button><b>${st.stages[k] >= 0 ? "+" : ""}${st.stages[k]}</b><button data-ovrstage="${k}" data-dir="1">+</button></div></div>`;
    const poolSeg = `<div class="seg cl-invest">${[["all", "All"], ["ladder", "Ladder"]].map(([v, l]) => `<button data-ovrpool="${v}" class="${st.movepool === v ? "active" : ""}">${l}</button>`).join("")}</div>`;
    const aSpe = attackerSpe(entry, st);
    const abilName = (data.abilities[st.ability] || {}).name || st.ability || "—";
    const speVs = (t) => { const v = aSpe > t.spe ? `<b class="sp-fast">outspeeds</b>` : aSpe < t.spe ? `<b class="sp-slow">slower</b>` : `<b>speed tie</b>`; return `${nameOf(t.mon)} <b>${t.spe}</b> → ${v}`; };
    const targets = t2 ? [t1, t2] : [t1];
    return `<div class="ehp-panel">
      <div class="ap-controls">
        <div class="cl-stat"><span class="cl-stat-lab">Ability</span><div class="ap-abils">${abilChips}</div></div>
        <div class="cl-stat"><span class="cl-stat-lab">Invest</span>${investSeg}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Atk nature</span>${natSel}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Speed</span>${speedSeg}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Item</span>${itemSel}</div>
        <div class="cl-stat" title="All learnable moves or only its real ladder set"><span class="cl-stat-lab">Movepool</span>${poolSeg}</div>
        <button class="btn-sm" data-ovrreset title="Reset this attacker to the global preset">↺ reset</button>
      </div>
      <div class="ap-controls" title="Setup stages — the stat each move actually uses (Iron Defense = +2 Def → powers Body Press and halves physical damage taken)">
        ${stageStep("atk", "Atk stage")}
        ${stageStep("spa", "Sp.Atk stage")}
        ${stageStep("def", "Def stage", "Body Press scales with this; also hardens it defensively")}
        ${stageStep("spe", "Spe stage", "Decides who moves first")}
      </div>
      <div class="ap-speed">Spe <b>${aSpe}</b> <small>(${abilName}${(eb.weather !== "none" && SPEED_ABIL[st.ability] === eb.weather) ? " ×2 " + eb.weather : (st.ability === "surge-surfer" && eb.terrain === "electric") ? " ×2 terrain" : (st.ability === "unburden" && st.item === "none") ? " ×2 — item used" : ""})</small> vs ${targets.map(speVs).join(" · ")}
        &ensp;·&ensp;eff Atk <b>${effOffense(entry, st).atk}</b> · eff Sp.A <b>${effOffense(entry, st).spa}</b> <small>(after invest/nature/stages)</small></div>
      <div class="ap-intorange">Into range: ${intoRange(entry, targets)}</div>
      ${targets.map((t) => matchupBlock(entry, t)).join("")}
    </div>`;
  }

  // Every globally active condition, as unmissable chips in the results summary — a
  // persisted burn or screen silently reshaping all numbers is worse than clutter.
  function condChips() {
    const c = [];
    if (eb.weather !== "none") c.push([WEATHERS[eb.weather], ""]);
    if (eb.terrain !== "none") c.push([TERRAINS[eb.terrain], ""]);
    if (eb.screen !== "none") c.push([SCREENS[eb.screen] + " (dmg ×0.5)", "warn"]);
    if (eb.targetStatus !== "none") c.push([`target ${{ brn: "burned", psn: "poisoned", par: "paralyzed", slp: "asleep" }[eb.targetStatus]}`, ""]);
    if (eb.userStatus !== "none") c.push([`attackers ${{ brn: "BURNED — phys ×0.5", psn: "poisoned", par: "paralyzed — Spe ×0.5" }[eb.userStatus]}`, "warn"]);
    if (eb.doubles) c.push(["doubles: spread ×0.75", ""]);
    if (eb.movepool === "ladder") c.push(["ladder movesets", ""]);
    return c.length ? `<span class="ehp-conds">${c.map(([x, w]) => `<span class="cond-chip ${w}">${x}</span>`).join("")}</span>` : "";
  }

  // Speed/survive badges for one attacker-vs-one-target row.
  function badgesFor(row, tgt) {
    const pr = row.prio ? ` ${row.prio > 0 ? "+" + row.prio : row.prio}` : "";
    const spd = row.first === true ? `<span class="ehp-spd first" title="Moves first${row.prio ? " (priority " + row.prio + ")" : ""}">⚡ 1st${pr}</span>`
      : row.first === "tie" ? `<span class="ehp-spd tie" title="Speed tie">= tie</span>`
      : `<span class="ehp-spd slow" title="Target moves first">🐢 2nd${pr}</span>`;
    const backTxt = row.threatMv ? `${nameOf(tgt.mon)} ${row.threatMv.name} ${Math.round(row.threatMin)}–${Math.round(row.threatPct)}%` : "no damage back";
    const surv = !row.threatMv ? `<span class="ehp-surv ok" title="Target has no damaging move set">no threat back</span>`
      : row.first !== true && row.ohkoBack
        ? `<span class="ehp-surv dead" title="${backTxt} → you faint before attacking">🐢 2nd · ${backTxt} → faints you</span>`
        : row.ohkoBack
          ? `<span class="ehp-surv risk" title="${backTxt} — you move first but get OHKO'd if you don't KO">glass cannon · ${backTxt}</span>`
          : `<span class="ehp-surv ok" title="${backTxt}">survives · takes ${backTxt.replace(nameOf(tgt.mon) + " ", "")}</span>`;
    return spd + surv;
  }
  const fracMult = (v) => (v === 0.25 ? "¼" : v === 0.5 ? "½" : String(v));
  // The move/%/verdict/flags cluster for one attacker-vs-one-target row.
  // sepX = emit the exclude ✕ as its OWN grid cell (dual lines) instead of inside the move cell.
  function moveCells(row, sepX = false) {
    const v = verdict(row);
    const flags = [`<span class="ehp-flag cat ${row.cat}">${row.cat === "physical" ? "Phys" : "Spec"}</span>`];
    if (row.se) flags.push(`<span class="ehp-flag se">SE ×${row.typeEff}</span>`);
    else if (row.typeEff < 1) flags.push(`<span class="ehp-flag nve" title="Not very effective — the target resists this type">resisted ×${fracMult(row.typeEff)}</span>`);
    if (row.stab > 1) flags.push(`<span class="ehp-flag stab">STAB</span>`);
    if (eb.useAccuracy && row.acc < 100) flags.push(`<span class="ehp-flag acc">acc ${row.acc}%</span>`);
    if (row.risky) flags.push(`<span class="ehp-flag risky">risky</span>`);
    if (row.asNote) flags.push(`<span class="ehp-flag ab">${row.asNote}</span>`);
    if (row.noInvMax < 100 && row.maxPct >= 100) flags.push(`<span class="ehp-flag inv">needs invest</span>`);
    row.notes.forEach((n) => flags.push(`<span class="ehp-flag mh">${n}</span>`));
    // custom (invented) moves: no popup to open, and ✕ removes the move instead of excluding it
    const x = row.custom
      ? `<button class="ehp-x" data-rmv-custom="${row.id.slice(1)}" title="Remove this custom move">✕</button>`
      : `<button class="ehp-x" data-exclude="${row.id}" title="Exclude this move (saved)">✕</button>`;
    return `<span class="ehp-move" ${row.custom ? "" : `data-move-info="${row.id}"`} title="${row.mv.name}${row.custom ? "" : " — view move details"}"><span class="type tiny" style="background:${TYPE_COLORS[row.effType]}">${row.effType}</span>${row.mv.name}${row.pw ? `<small class="ehp-pw">${row.pw} pw</small>` : ""}${sepX ? "" : x}</span>
      <span class="ehp-pct">${row.minPct.toFixed(0)}–${row.maxPct.toFixed(0)}%</span>
      <span class="ehp-ko ${v.cls}">${v.txt}</span>
      <span class="ehp-flags">${flags.join("")}</span>${sepX ? `<span class="ehp-xcell">${x}</span>` : ""}`;
  }

  function renderResults() {
    const t1 = currentTarget(0);
    const t2 = eb.targets[1] ? currentTarget(1) : null;
    if (!t1) { $("#ehp-results").innerHTML = ""; return; }
    // rank by worst-case damage across the target(s); a counter must beat BOTH
    const scored = roster.map((entry) => {
      const r1 = bestVsTarget(entry, t1);
      const r2 = t2 ? bestVsTarget(entry, t2) : null;
      if (!r1 || (t2 && !r2)) return null;   // a mon with no usable move vs a target can't be a counter
      const worst = r2 ? (r2.maxPct < r1.maxPct ? r2 : r1) : r1;
      return { entry, r1, r2, worst, metric: r2 ? Math.min(r1.maxPct, r2.maxPct) : r1.maxPct };
    }).filter(Boolean);
    const ranked = scored
      .filter((x) => meetsThreshold(x.r1) && (!t2 || meetsThreshold(x.r2)) && passesFilters(x.entry, x.worst))
      .sort((a, b) => b.metric - a.metric);

    const counterRow = ({ entry, r1, r2, worst }) => {
      const slug = entry.mon.slug;
      const open = eb.expanded === slug;
      const pinned = eb.pinned.has(slug);
      const nameCell = `<span class="ehp-name"><span class="ehp-nm-row"><button class="ehp-caret" data-expand="${slug}" title="Adjust this attacker (ability, moves, EVs…)">${open ? "▾" : "▸"}</button><button class="ehp-pin ${pinned ? "on" : ""}" data-pin="${slug}" title="${pinned ? "Unpin" : "Pin — stays on top through any filters"}">📌</button>${nameOf(entry.mon)}</span><span class="ehp-badges">${badgesFor(worst, worst === r2 ? t2 : t1)}</span></span>`;
      const body = t2
        ? `<div class="ehp-dual">
             <div class="ehp-dline"><img class="ehp-dspr" src="${t1.mon.sprite || t1.mon.artwork || ""}" alt="" loading="lazy" decoding="async" title="${nameOf(t1.mon)}">${moveCells(r1, true)}</div>
             <div class="ehp-dline"><img class="ehp-dspr" src="${t2.mon.sprite || t2.mon.artwork || ""}" alt="" loading="lazy" decoding="async" title="${nameOf(t2.mon)}">${moveCells(r2, true)}</div>
           </div>`
        : moveCells(r1);
      return `<div class="ehp-item ${open ? "open" : ""} ${t2 ? "dual" : ""}">
        <div class="ehp-row" data-open="${slug}">
          <img class="ehp-spr" loading="lazy" decoding="async" src="${entry.mon.sprite || entry.mon.artwork || ""}" alt="">
          ${nameCell}
          ${body}
        </div>
        ${open ? renderAttackerPanel(entry, t1, t2) : ""}</div>`;
    };
    // pinned rows: always shown, above the list, no filters/threshold applied
    const pinnedScored = scored.filter((x) => eb.pinned.has(x.entry.mon.slug)).sort((a, b) => b.metric - a.metric);
    const pinnedBlock = pinnedScored.length ? `
      <div class="ehp-pinhead">📌 Pinned (${pinnedScored.length}) <small>ignores filters &amp; threshold</small><button class="btn-sm" data-pin-clear>clear all</button></div>
      <div class="ehp-list ehp-pinned">${pinnedScored.map(counterRow).join("")}</div>` : "";
    const unpinned = ranked.filter((x) => !eb.pinned.has(x.entry.mon.slug));
    const CAP = 150;   // generous DOM cap; count is always the true total
    const rows = unpinned.slice(0, CAP).map(counterRow).join("");
    const threshLabel = { any: "damage", ohko: "OHKO", "2hko": "2HKO+", "3hko": "3HKO+" }[eb.threshold];
    const filtered = eb.fTypesOff.size || eb.moveTypesOff.size || eb.fCat !== "any" || eb.fRole !== "any" || eb.fAvail || eb.fSurvive || eb.fFaster || eb.fSearch || eb.fMega !== "all";
    const who = t2 ? `<b>${nameOf(t1.mon)}</b> AND <b>${nameOf(t2.mon)}</b>` : `<b>${nameOf(t1.mon)}</b> (HP ${t1.hp} · Def ${t1.def} · Sp.Def ${t1.spd})`;
    $("#ehp-results").innerHTML = `
      ${pinnedBlock}
      <div class="ehp-summary"><b>${ranked.length}</b> Pokémon reach <b>${threshLabel}</b> on ${who}${eb.atkBoost ? ` · attackers at +${eb.atkBoost}` : ""}${eb.candBulk === "hp" ? " · candidates +32 HP" : ""}${filtered ? " · filtered" : ""}.${condChips()}</div>
      ${unpinned.length ? `<div class="ehp-list">${rows}</div>` : `<p class="ehp-empty">No attacker meets the current filters/threshold${t2 ? " on both targets" : ""} — loosen them or edit the target's bulk.</p>`}
      ${unpinned.length > CAP ? `<p class="ehp-more">Showing the top ${CAP} of ${unpinned.length} by worst-case %. Filter to narrow it down.</p>` : ""}
      <p class="ehp-approx">Real Gen-9 damage (exact formula, 0.85–1.00 roll) vs effective HP. Best <b>reliable</b> move per attacker.${t2 ? " With two targets, ranking uses the <b>worse</b> of the two and both must meet the threshold." : ""} <b>⚡/🐢</b> = who moves first; <b>survives</b> = how hard the target hits back with its usage set. 📌 pins a row on top; ✕ removes a move for good.</p>`;
  }

  // Named presets (save/load/delete the whole lab setup — both modes).
  function renderPresets() {
    const list = loadPresets();
    const savable = s.mode === "rev" ? !!eb.revSlug : !!tc().slug;
    const html = `
      <input class="cl-preset-name" placeholder="Preset name…" maxlength="24" autocomplete="off">
      <button class="btn-sm" data-preset-save ${savable ? "" : "disabled"}>Save preset</button>
      ${list.map((p) => `<span class="cl-exchip cl-preset"><button class="cl-preset-load" data-preset-load="${p.id}" title="Load this setup">${p.name}</button><button data-preset-del="${p.id}" aria-label="delete" title="Delete">✕</button></span>`).join("")}`;
    ["#ehp-presets", "#rev-presets"].forEach((sel) => { const el = $(sel); if (el) el.innerHTML = html; });
    // the mobile "More setup" button carries a badge so hidden state is never misleading
    const nEhp = eb.excluded.size + (eb.targets[1] ? 1 : 0) + (eb.fSearch ? 1 : 0);
    const nRev = ((eb.revCfg.moveset || []).length ? 1 : 0) + eb.excluded.size + (eb.revSearch ? 1 : 0);
    const be = container.querySelector('[data-setup="ehp-setup"]'); if (be) be.textContent = `⚙ More setup${nEhp ? ` · ${nEhp}` : ""}`;
    const br = container.querySelector('[data-setup="rev-setup"]'); if (br) br.textContent = `⚙ More setup${nRev ? ` · ${nRev}` : ""}`;
  }

  const renderActive = () => { if (s.mode === "rev") renderRev(); else if (s.mode === "team") renderTeam(); else renderEb(); };   // shared field handlers re-render the active mode
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
    $("#ehp-filters").innerHTML = "";   // filters live inside the target card now (mirrors One-vs-all)
    renderResults();
  }

  // ---------- "One vs all" reverse mode ----------
  const revSt = () => ({ ...eb.revCfg, stages: { ...NO_STAGES, ...(eb.revCfg.stages || {}) } });   // settings object for evalMove (same shape atkSettings returns)
  function renderRevControls(entry) {
    const mon = entry.mon;
    const c = eb.revCfg;
    const abilChips = (mon.abilities || []).map((a) => `<button class="tm-abil-chip ${c.ability === a.slug ? "on" : ""}" data-revability="${a.slug}">${(data.abilities[a.slug] || {}).name || a.slug}</button>`).join("");
    return `<section class="calc-card cl-target">
      <div class="cl-target-head">
        <img class="ehp-target-spr cl-target-open" data-target-open="${mon.slug}" title="Open ${nameOf(mon)} details" src="${mon.artwork || mon.sprite || ""}" alt="">
        <div class="ehp-target-meta">
          <div class="ehp-target-name cl-target-open" data-target-open="${mon.slug}" title="Open ${nameOf(mon)} details">${nameOf(mon)} ${mon.isMega ? '<span class="mega-badge">MEGA</span>' : ""}</div>
          <div class="ehp-target-types">${mon.types.map(typeSpan).join("")}</div>
        </div>
        <div class="ehp-target-bulk">
          <div class="ehp-bulk phys" title="base → effective (after invest/nature/stages)"><span class="ehp-bulk-lab">Atk</span><span class="ehp-bulk-val">${entry.lv.atk}<small class="eff-arrow">→${effOffense(entry, revSt()).atk}</small></span></div>
          <div class="ehp-bulk spec" title="base → effective (after invest/nature/stages)"><span class="ehp-bulk-lab">Sp.Atk</span><span class="ehp-bulk-val">${entry.lv.spa}<small class="eff-arrow">→${effOffense(entry, revSt()).spa}</small></span></div>
          <div class="ehp-bulk spe" title="base → effective (after speed invest/stages/item)"><span class="ehp-bulk-lab">Spe</span><span class="ehp-bulk-val">${entry.lv.spe}<small class="eff-arrow">→${attackerSpe(entry, revSt())}</small></span></div>
        </div>
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Attacker offense</span>
          <label class="cl-toggle" data-acc-toggle title="Weight damage by each move's accuracy (off = potential damage)"><input type="checkbox" tabindex="-1" ${eb.useAccuracy ? "checked" : ""}> weight by accuracy</label></div>
        <div class="cl-attacker">
          <div class="cl-stat"><span class="cl-stat-lab">Invest</span>
            <div class="seg cl-invest">${[[32, "Max"], [16, "Half"], [0, "None"]].map(([v, l]) => `<button data-revinvest="${v}" class="${c.invest === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
          <div class="cl-stat"><span class="cl-stat-lab">Nature</span>${natSelect('data-revsel="nature"', c.nature, true)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Speed</span>
            <div class="seg cl-invest">${[["base", "Base"], ["max", "Max"]].map(([v, l]) => `<button data-revspeed="${v}" class="${c.speed === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
          <div class="cl-stat"><span class="cl-stat-lab">Item</span><select class="cl-sel" data-revsel="item">${Object.entries(OFF_ITEMS).map(([k, v]) => `<option value="${k}" ${c.item === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
          <div class="cl-stat" title="All learnable moves or only its real ladder set"><span class="cl-stat-lab">Movepool</span>
            <div class="seg cl-invest">${[["all", "All"], ["ladder", "Ladder"]].map(([v, l]) => `<button data-revpool="${v}" class="${(c.movepool || "all") === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
        </div>
        <div class="cl-attacker" title="Setup stages — the stat each move actually uses (Iron Defense = +2 Def powers Body Press and halves physical taken)">
          ${["atk", "spa", "def", "spe"].map((k) => `<div class="cl-stat"><span class="cl-stat-lab">${{ atk: "Atk stage", spa: "Sp.Atk stage", def: "Def stage", spe: "Spe stage" }[k]}</span>
            <div class="cl-step"><button data-revstage="${k}" data-dir="-1">−</button><b>${(c.stages?.[k] || 0) >= 0 ? "+" : ""}${c.stages?.[k] || 0}</b><button data-revstage="${k}" data-dir="1">+</button></div></div>`).join("")}
        </div>
        ${abilChips ? `<div class="cl-abil"><span class="cl-stat-lab">Ability</span>${abilChips}</div>` : ""}
        <div class="cl-tmoves"><span class="cl-stat-lab">Its attacks</span>
          ${Array.isArray(c.moveset) && c.moveset.length
            ? c.moveset.map((id) => { const mv = data.moves[id]; return mv ? `<span class="cl-exchip"><span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span><span class="cl-exchip-nm" data-move-info="${id}" title="Open ${mv.name}">${mv.name}</span><button data-rmv-remove="${id}" aria-label="remove">✕</button></span>` : ""; }).join("")
            : `<small class="muted">using ${(c.movepool || "all") === "ladder" ? "its ladder set" : "all learnable moves"} — add specific attacks to lock the set</small>`}
          ${(c.custom || []).map((cm, i) => `<span class="cl-exchip cl-cmv-chip" title="Invented move — not in its real movepool"><span class="type tiny" style="background:${TYPE_COLORS[cm.type]}">${cm.type}</span>Custom ${cm.power} <small>${cm.class === "physical" ? "Phys" : "Spec"}</small><button data-rmv-custom="${i}" aria-label="remove">✕</button></span>`).join("")}
        </div>
        <div class="cl-custommv" title="Invent a move to test: type + category + base power. Plain single hit, 100% accuracy; STAB applies if the type matches.">
          <span class="cl-stat-lab">Custom move</span>
          <select class="cl-sel cmv-type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          <select class="cl-sel cmv-class"><option value="physical">Physical</option><option value="special">Special</option></select>
          <input class="cmv-pow" type="number" min="1" max="250" value="80" aria-label="base power">
          <button class="btn-sm" data-addcustom>＋ Add</button>
        </div>
        ${eb.excluded.size ? `<div class="cl-excluded"><span class="cl-stat-lab">Excluded moves</span>
          ${[...eb.excluded].map((id) => data.moves[id] ? `<span class="cl-exchip"><span class="cl-exchip-nm" data-move-info="${id}" title="Open ${data.moves[id].name}">${data.moves[id].name}</span><button data-unexclude="${id}" aria-label="restore">✕</button></span>` : "").join("")}</div>` : ""}
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Field conditions</span></div>
        <div class="cl-conditions">
          <div class="cl-stat"><span class="cl-stat-lab">Weather</span>${seg("weather", WEATHERS, eb.weather)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Terrain</span>${seg("terrain", TERRAINS, eb.terrain)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Screen</span>${seg("screen", SCREENS, eb.screen)}</div>
          <div class="cl-stat" title="Burn halves the attacker's physical damage (Guts/Facade exempt); paralysis halves its Speed"><span class="cl-stat-lab">Attacker status</span>${seg("userStatus", { none: "Healthy", brn: "Burned", psn: "Poisoned", par: "Paralyzed" }, eb.userStatus)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Defender status</span>${seg("targetStatus", { none: "Healthy", psn: "Poisoned", brn: "Burned", par: "Paralyzed", slp: "Asleep" }, eb.targetStatus)}</div>
          <label class="cl-avail cl-doubles" title="Champions is doubles (Reg M-B): spread moves like Earthquake do ×0.75"><input type="checkbox" data-ebsel="doubles" ${eb.doubles ? "checked" : ""}> Doubles spread ×0.75</label>
        </div>
      </div>
      <div class="cl-sec">
        <div class="cl-sec-head"><span>Defenders — filter &amp; sort</span></div>
        <div class="cl-conditions">
          <div class="cl-stat" title="Global preset — what set EVERY defender is assumed to run: Ladder = its real usage spread/nature/ability; Base = 0 investment, neutral; Max bulk = all 66 points into HP/Def/Sp.Def (best-case walls)"><span class="cl-stat-lab">Defenders</span>
            <div class="seg cl-invest">${[["ladder", "Ladder set"], ["base", "Base 0-invest"], ["bulk", "Max bulk"]].map(([v, l]) => `<button data-revbasis="${v}" class="${eb.revBasis === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
          <div class="seg ehp-thresh">${[["usage", "Usage ↓"], ["dmg", "Damage ↓"], ["tough", "Toughest ↑"]].map(([v, l]) => `<button data-revsort="${v}" class="${eb.revSort === v ? "active" : ""}">${l}</button>`).join("")}</div>
          <div class="seg">${[["all", "All"], ["hide", "No mega"], ["only", "Only mega"]].map(([v, l]) => `<button data-revmega="${v}" class="${eb.revMega === v ? "active" : ""}">${l}</button>`).join("")}</div>
          <div class="seg ehp-thresh">${[["any", "Any dmg"], ["ohko", "OHKO"], ["2hko", "2HKO"], ["3hko", "3HKO"]].map(([v, l]) => `<button data-thresh="${v}" class="${eb.threshold === v ? "active" : ""}">${l}</button>`).join("")}</div>
          <label class="cl-toggle" title="Only defenders with real ladder usage data"><input type="checkbox" data-revsel="revLaddered" ${eb.revLaddered ? "checked" : ""}> Laddered only</label>
          <button class="cl-typetoggle ${eb.showTypeFilters ? "open" : ""} ${eb.revTypesOff.size + eb.moveTypesOff.size ? "has" : ""}" data-toggle-typefilters title="Filter by defender type / move type">
            <span class="cl-tt-ico">◧</span> Type filters ${eb.revTypesOff.size + eb.moveTypesOff.size ? `<span class="cl-tt-badge">${eb.revTypesOff.size + eb.moveTypesOff.size}</span>` : ""}<span class="cl-tt-caret">${eb.showTypeFilters ? "▾" : "▸"}</span></button>
        </div>
        <div class="cl-typefilters" ${eb.showTypeFilters ? "" : "hidden"}>
        <div class="cl-typerow" title="Lit types are shown; click a type to toggle it">
          <div class="cl-typectl">
            <span class="cl-typelab">Defender type</span>
            <button class="btn-sm" data-revtypeset="all">All</button>
            <button class="btn-sm" data-revtypeset="none">None</button>
          </div>
          <div class="cl-ftypes">${TYPES.map((t) => `<button class="type-chip ${eb.revTypesOff.has(t) ? "off" : "on"}" data-revftype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
        </div>
        <div class="cl-typerow" title="Lit move types are used by YOUR attacker; click a type to stop using moves of that type">
          <div class="cl-typectl">
            <span class="cl-typelab">Move type</span>
            <button class="btn-sm" data-typeset="mv.all">All</button>
            <button class="btn-sm" data-typeset="mv.none">None</button>
          </div>
          <div class="cl-ftypes">${TYPES.map((t) => `<button class="type-chip ${eb.moveTypesOff.has(t) ? "off" : "on"}" data-fmtype="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("")}</div>
        </div>
        </div>
      </div>
    </section>`;
  }
  // Expander panel for one defender: its (editable) set + the full two-way matchup + into-range.
  function renderDefenderPanel(entry, d, dt) {
    const st = revSt();
    const slug = d.mon.slug;
    const ovr = eb.revOverrides.get(slug) || {};
    const cfg = defenderCfg(d.mon);   // honors the Ladder/Base basis + overrides
    const edited = Object.keys(ovr).length > 0;
    const abilChips = (d.mon.abilities || []).map((a) => `<button class="tm-abil-chip ${cfg.ability === a.slug ? "on" : ""}" data-dovrability="${a.slug}">${(data.abilities[a.slug] || {}).name || a.slug}</button>`).join("");
    const itemSel = `<select class="cl-sel" data-dovrsel="item">${Object.entries(DEF_ITEMS).map(([k, l]) => `<option value="${k}" ${cfg.item === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    const natSel = natSelect('data-dovrsel="nature"', cfg.nature);
    const stg = (label, key, title = "") => `<div class="cl-stat"${title ? ` title="${title}"` : ""}><span class="cl-stat-lab">${label}</span>
      <div class="cl-step"><button data-dovrstage="${key}" data-dir="-1">−</button><b>${cfg[key] >= 0 ? "+" : ""}${cfg[key]}</b><button data-dovrstage="${key}" data-dir="1">+</button></div></div>`;
    const bulkNow = ovr.spread ? (ovr.spread.spe === 32 ? "spe" : ovr.spread.spd === 32 ? "hpspd" : "hpdef") : "usage";
    const bulkSeg = `<div class="seg cl-invest">${[["usage", "Usage"], ["hpdef", "HP+Def"], ["hpspd", "HP+SpD"], ["spe", "HP+Spe"]].map(([v, l]) => `<button data-dovrbulk="${v}" class="${bulkNow === v ? "active" : ""}">${l}</button>`).join("")}</div>`;
    const SPL = { hp: "HP", atk: "Atk", def: "Def", spa: "Sp.Atk", spd: "Sp.Def", spe: "Spe" };
    const spTxt = Object.entries(cfg.spread).filter(([, v]) => v > 0).map(([k, v]) => `${SPL[k] || k} ${v}`).join(" · ") || "no investment";
    const aSpe = attackerSpe(entry, st);
    const spV = aSpe > dt.spe ? `<b class="sp-fast">outspeeds</b>` : aSpe < dt.spe ? `<b class="sp-slow">slower</b>` : `<b>speed tie</b>`;
    return `<div class="ehp-panel">
      <div class="ap-controls">
        <div class="cl-stat"><span class="cl-stat-lab">Ability</span><div class="ap-abils">${abilChips}</div></div>
        <div class="cl-stat" title="Replace its ladder spread with a 32/32/2 preset"><span class="cl-stat-lab">Bulk</span>${bulkSeg}</div>
        ${stg("Def boost", "defStage")}
        ${stg("Sp.Def boost", "spdStage", "Special Defense — not Speed")}
        ${stg("Spe boost", "speStage", "Speed — decides who moves first")}
        <div class="cl-stat"><span class="cl-stat-lab">Nature</span>${natSel}</div>
        <div class="cl-stat"><span class="cl-stat-lab">Item</span>${itemSel}</div>
        <button class="btn-sm" data-dovrreset title="Reset this defender to its ladder usage">↺ reset</button>
      </div>
      <div class="ap-speed">${edited ? `<b class="ap-edited">edited</b> · ` : ""}Set: <b>${(data.abilities[cfg.ability] || {}).name || "—"}</b> · ${cfg.nature} · ${spTxt} · ${DEF_ITEMS[cfg.item] || "No item"}&ensp;—&ensp;your Spe <b>${aSpe}</b> vs ${nameOf(d.mon)} <b>${dt.spe}</b> → ${spV}
        <button class="btn-sm ap-tocounters" data-rev2counter="${slug}" title="Open this defender fully configurable in All vs one">⚔ Open in All vs one</button></div>
      <div class="ap-intorange">Into range: ${intoRange(entry, [dt], revSt())}</div>
      ${matchupBlock(entry, dt, st)}
    </div>`;
  }

  function renderRevResults() {
    const mon = eb.revSlug ? resolveMon(eb.revSlug) : null;
    if (!mon) { $("#rev-results").innerHTML = ""; return; }
    const entry = { mon, lv: statsFor(mon, "lv50") };
    const st = revSt();
    const evalDef = (d) => { const dt = defenderTarget(d.mon); return { d, dt, row: dt ? bestVsTarget(entry, dt, st) : null }; };
    const usageOf = (d) => (d.mon.usagePct != null ? d.mon.usagePct : -1);
    const bySort = (a, b) => eb.revSort === "tough" ? a.row.maxPct - b.row.maxPct
      : eb.revSort === "usage" ? (usageOf(b.d) - usageOf(a.d)) || (b.row.maxPct - a.row.maxPct)
      : b.row.maxPct - a.row.maxPct;
    const revRow = ({ d, dt, row }) => {
      const slug = d.mon.slug;
      const open = eb.expanded === slug;
      const pinned = eb.revPinned.has(slug);
      const use = d.mon.usagePct != null ? `<span class="ehp-use" title="M-B ladder usage (pokebase)">${d.mon.usagePct}%</span>` : "";
      // the assumed defender set, visible WITHOUT opening the expander — no hidden assumptions
      const cfg = defenderCfg(d.mon);
      const edited = eb.revOverrides.has(slug) && Object.keys(eb.revOverrides.get(slug)).length > 0;
      const setLine = `<span class="ehp-setline" title="The set this row assumes (edit via ▸)">${dt.hp} HP · ${dt.def} Def · ${dt.spd} SpD · ${dt.spe} Spe · ${cfg.nature === "Serious" ? "Neutral" : cfg.nature} · ${(data.abilities[cfg.ability] || {}).name || "—"}${edited ? ' · <b class="ap-edited">edited</b>' : ""}</span>`;
      return `<div class="ehp-item ${open ? "open" : ""}">
        <div class="ehp-row" data-open="${slug}">
          <img class="ehp-spr" loading="lazy" decoding="async" src="${d.mon.sprite || d.mon.artwork || ""}" alt="">
          <span class="ehp-name"><span class="ehp-nm-row"><button class="ehp-caret" data-expand="${slug}" title="Full matchup vs this defender — bulk/speed/ability editable">${open ? "▾" : "▸"}</button><button class="ehp-pin ${pinned ? "on" : ""}" data-pin="${slug}" title="${pinned ? "Unpin" : "Pin — stays on top through any filters"}">📌</button>${nameOf(d.mon)}${use}</span><span class="ehp-badges">${badgesFor(row, dt)}</span>${setLine}</span>
          ${moveCells(row)}
        </div>
        ${open ? renderDefenderPanel(entry, d, dt) : ""}</div>`;
    };
    const defenders = [...roster, ...customMons().map((m) => ({ mon: m, lv: statsFor(m, "lv50") }))];   // custom mons join the roster as defenders
    const scored = defenders
      .filter((d) => d.mon.slug !== mon.slug)
      .filter((d) => !eb.revLaddered || (d.mon.usage && (d.mon.usage.moves || []).length))
      .filter((d) => eb.revMega === "all" || (eb.revMega === "hide" ? !d.mon.isMega : d.mon.isMega))
      .filter((d) => !eb.revTypesOff.size || d.mon.types.some((t) => !eb.revTypesOff.has(t)))
      .filter((d) => !eb.revSearch || nameOf(d.mon).toLowerCase().includes(eb.revSearch))
      .filter((d) => !eb.revPinned.has(d.mon.slug))
      .map(evalDef)
      .filter((x) => x.row && meetsThreshold(x.row));
    scored.sort(bySort);
    // pinned defenders: always shown on top, no filters/threshold
    const pinnedRows = [...eb.revPinned].filter((sl) => sl !== mon.slug)
      .map((sl) => { const d = defenders.find((r) => r.mon.slug === sl); return d ? evalDef(d) : null; })
      .filter((x) => x && x.row).sort(bySort);
    const pinnedBlock = pinnedRows.length ? `
      <div class="ehp-pinhead">📌 Pinned (${pinnedRows.length}) <small>ignores filters &amp; threshold</small><button class="btn-sm" data-pin-clear>clear all</button></div>
      <div class="ehp-list ehp-pinned">${pinnedRows.map(revRow).join("")}</div>` : "";
    const CAP = 150;
    const rows = scored.slice(0, CAP).map(revRow).join("");
    $("#rev-results").innerHTML = `
      ${pinnedBlock}
      <div class="ehp-summary"><b>${nameOf(mon)}</b> reaches <b>${{ any: "damage", ohko: "OHKO", "2hko": "2HKO+", "3hko": "3HKO+" }[eb.threshold]}</b> on <b>${scored.length}</b> defenders${eb.revLaddered ? " (laddered)" : ""}${eb.revMega !== "all" || eb.revTypesOff.size || eb.revSearch ? " · filtered" : ""}.${condChips()}</div>
      ${scored.length ? `<div class="ehp-list">${rows}</div>` : `<p class="ehp-empty">No defender meets the threshold/filters — loosen them.</p>`}
      ${scored.length > CAP ? `<p class="ehp-more">Showing the top ${CAP} of ${scored.length}. Search or filter to narrow it down.</p>` : ""}
      <p class="ehp-approx">Every defender is built from its own ladder set (spread/nature/ability) — the caret opens the full two-way matchup where its bulk, boosts, Speed, ability and item are editable. Champions exposes per-mon usage, not a global usage share, so this is ranked by damage, not popularity. 📌 pins a defender on top through any filters.</p>`;
  }
  function renderRev() {
    saveLab();
    renderPresets();
    const mon = eb.revSlug ? resolveMon(eb.revSlug) : null;
    if (!mon) {
      $("#rev-controls").innerHTML = "";
      $("#rev-results").innerHTML = `<p class="ehp-empty ehp-pick-hint">Pick an attacker above to see its damage into every defender.</p>`;
      return;
    }
    $("#rev-controls").innerHTML = renderRevControls({ mon, lv: statsFor(mon, "lv50") });
    renderRevResults();
  }

  // ---------- custom Pokémon builder (shared across all three modes) ----------
  const newCustomDraft = () => ({ id: null, name: "", types: ["normal"], stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: null, moves: [] });
  function saveCustomDraft() {
    const d = eb.customDraft; if (!d) return;
    const clean = { id: d.id || nextCustomId(), name: (d.name || "").trim().slice(0, 24) || "Custom",
      types: (d.types || []).filter((t) => TYPES.includes(t)).slice(0, 2),
      stats: Object.fromEntries(CUSTOM_STATS.map((k) => [k, clampStat(d.stats && d.stats[k])])),
      ability: d.ability && data.abilities[d.ability] ? d.ability : null,
      moves: (d.moves || []).filter((id) => data.moves[id]).slice(0, 8) };
    if (!clean.types.length) clean.types = ["normal"];
    const i = eb.customMons.findIndex((x) => x.id === clean.id);
    if (i >= 0) eb.customMons[i] = clean; else eb.customMons.push(clean);
    eb.customDraft = null; syncCustom(); saveLab(); renderCustom(); renderActive();
  }
  function removeCustom(id) {
    eb.customMons = eb.customMons.filter((c) => c.id !== id);
    const slug = "custom:" + id;
    eb.threats = eb.threats.filter((sl) => sl !== slug);
    eb.targets = eb.targets.map((c) => (c && c.slug === slug ? null : c));
    if (!eb.targets[0]) eb.targets[0] = newTargetCfg();
    if (eb.revSlug === slug) eb.revSlug = null;
    eb.pinned.delete(slug); eb.revPinned.delete(slug);
    syncCustom(); saveLab(); renderCustom(); renderActive();
  }
  const cdMoveInput = { detach: null };   // the draft's move-adder autocomplete (re-attached each render)
  function renderCustom() {
    const el = $("#calc-custom"); if (!el) return;
    const chips = customMons().map((m) => `<span class="cx-chip"><span class="cx-star">★</span>${nameOf(m)}<button data-custom-edit="${m.slug.slice(7)}" title="Edit" aria-label="Edit">✎</button><button data-custom-del="${m.slug.slice(7)}" title="Delete" aria-label="Delete">✕</button></span>`).join("");
    const d = eb.customDraft;
    const form = d ? (() => {
      const typeSel = (which, cur, allowNone) => `<select class="cl-sel" data-cdraft="${which}">${(allowNone ? `<option value="">— none —</option>` : "") + TYPES.map((t) => `<option value="${t}" ${t === cur ? "selected" : ""}>${t}</option>`).join("")}</select>`;
      const statBox = (k, lab) => `<div class="cl-stat"><span class="cl-stat-lab">${lab}</span><input class="cx-stat" type="number" min="1" max="255" value="${clampStat(d.stats[k])}" data-cdraft="stat.${k}" aria-label="${lab}"></div>`;
      const abilOpts = `<option value="">— none —</option>` + Object.entries(data.abilities).map(([slug, a]) => `<option value="${slug}" ${d.ability === slug ? "selected" : ""}>${a.name}</option>`).sort().join("");
      const moveChips = (d.moves || []).map((id) => { const mv = data.moves[id]; return mv ? `<span class="cl-exchip"><span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span><span class="cl-exchip-nm" data-move-info="${id}" title="Open ${mv.name}">${mv.name}</span><button data-cdraft-move-remove="${id}" aria-label="remove">✕</button></span>` : ""; }).join("");
      return `<div class="cx-form">
        <div class="cx-form-head"><b>${d.id ? "Edit" : "New"} custom Pokémon</b><span class="muted cx-bst">BST ${CUSTOM_STATS.reduce((s2, k) => s2 + clampStat(d.stats[k]), 0)}</span></div>
        <div class="cx-form-grid">
          <div class="cl-stat cx-name"><span class="cl-stat-lab">Name</span><input class="cx-nameinp" type="text" maxlength="24" placeholder="e.g. Threat-mon" value="${esc(d.name)}" data-cdraft="name"></div>
          <div class="cl-stat"><span class="cl-stat-lab">Type 1</span>${typeSel("type1", d.types[0], false)}</div>
          <div class="cl-stat"><span class="cl-stat-lab">Type 2</span>${typeSel("type2", d.types[1] || "", true)}</div>
          <div class="cl-stat cx-abil"><span class="cl-stat-lab">Ability <small>(optional)</small></span><select class="cl-sel" data-cdraft="ability">${abilOpts}</select></div>
        </div>
        <div class="cx-stats">${[["hp", "HP"], ["atk", "Atk"], ["def", "Def"], ["spa", "Sp.Atk"], ["spd", "Sp.Def"], ["spe", "Spe"]].map(([k, l]) => statBox(k, l)).join("")}</div>
        <div class="cl-tmoves"><span class="cl-stat-lab">Moves <small>(optional — needed to use it as an attacker)</small></span>
          ${moveChips || '<small class="muted">no moves yet</small>'}
          <div class="ac-wrap cx-movewrap"><input class="cx-move-input" placeholder="+ add a move…" autocomplete="off"></div>
        </div>
        <div class="cx-form-actions"><button class="btn accent" data-custom-save>Save Pokémon</button><button class="btn" data-custom-cancel>Cancel</button></div>
      </div>`;
    })() : "";
    el.innerHTML = `<div class="cx-bar"><span class="cx-lab">Custom Pokémon</span>${chips}<button class="btn-sm cx-new" data-custom-new>＋ New</button></div>${form}`;
    // (re)attach the draft move adder
    if (cdMoveInput.detach) { cdMoveInput.detach(); cdMoveInput.detach = null; }
    const mi = el.querySelector(".cx-move-input");
    if (mi) cdMoveInput.detach = attachAutocomplete(mi, {
      items: () => damagingMoves.filter((m) => !(eb.customDraft.moves || []).includes(m.value)),
      onPick: (id) => { if (!eb.customDraft.moves) eb.customDraft.moves = []; if (!eb.customDraft.moves.includes(id)) eb.customDraft.moves.push(id); renderCustom(); },
    });
  }

  // ---------- "Team check" mode: your team vs a list of threats ----------
  function addThreat(slug) { if (hasMon(slug) && !eb.threats.includes(slug)) { eb.threats.push(slug); renderTeam(); } }
  // One attacker (team member) vs one threat → a scored cell.
  function teamCell(memberMon, memberMoveIds, threatTarget) {
    const entry = { mon: memberMon, lv: statsFor(memberMon, "lv50") };
    const st = { ...atkSettings(entry) };
    if (Array.isArray(memberMoveIds) && memberMoveIds.length) st.moveset = memberMoveIds;   // lock to the team's chosen moves
    const row = bestVsTarget(entry, threatTarget, st);
    if (!row) return { tier: 1, label: "—", note: "no damaging move" };
    const v = verdict(row);
    const kos = row.nMin;   // best-case-min hits to KO (1=OHKO)
    const safe = row.first === true || !row.ohkoBack;   // outspeeds, or survives the threat's best hit
    // tier: 3 handled cleanly · 2 trades/risky · 1 chip only · (verdict "no KO" → 1)
    let tier;
    if (row.nMin >= 99 && row.nBest >= 99) tier = 1;
    else if (kos <= 2 && safe) tier = 3;
    else if (kos <= 2 || row.nBest <= 2) tier = 2;
    else tier = 1;
    return { tier, label: v.txt, ko: kos, first: row.first, ohkoBack: row.ohkoBack,
      mv: row.mv, pct: row.maxPct, threatPct: row.threatPct, threatMv: row.threatMv };
  }
  function renderTeam() {
    saveLab();
    const roster2 = team().map((t) => ({ mon: bySlug.get(t.slug), moves: (t.moves || []) })).filter((t) => t.mon);
    const controls = $("#team-controls"), out = $("#team-results-calc");
    // threat chips + clear
    const threatChips = eb.threats.map((sl) => { const m = resolveMon(sl); return m
      ? `<span class="tc-threat"><img src="${m.sprite || m.artwork || ""}" alt="">${nameOf(m)}<button data-threat-remove="${sl}" aria-label="remove">✕</button></span>` : ""; }).join("");
    controls.innerHTML = `<div class="tc-threatbar">
      <span class="cl-stat-lab">Threats (${eb.threats.length})</span>${threatChips || '<small class="muted">none yet — search above or import your pinned mons</small>'}
      ${eb.threats.length ? `<button class="btn-sm" data-threats-clear>clear</button>` : ""}
    </div>`;

    if (!roster2.length) {
      out.innerHTML = `<div class="tc-empty"><p>Your saved team is empty.</p><button class="btn accent" data-goto-team>Build a team in the Team tab</button></div>`;
      return;
    }
    if (!eb.threats.length) {
      out.innerHTML = `<p class="ehp-empty">Add the opponents you want to check — search above, or <b>⇩ Import pinned</b> to pull the mons you've pinned in All-vs-one / One-vs-all. Each teammate's best answer to every threat is then scored below.</p>`;
      return;
    }

    // header: team member sprites
    const memberHead = roster2.map(({ mon }) => `<th class="tc-mhead" title="${nameOf(mon)}"><img src="${mon.sprite || mon.artwork || ""}" alt="">${mon.types.map((t) => `<span class="type tiny" style="background:${TYPE_COLORS[t]}">${t}</span>`).join("")}</th>`).join("");

    const rows = eb.threats.map((sl) => {
      const tmon = resolveMon(sl); if (!tmon) return "";
      const target = defenderTarget(tmon);
      const cells = roster2.map(({ mon, moves }) => teamCell(mon, moves, target));
      const handlers = roster2.filter((_, i) => cells[i].tier === 3).map(({ mon }) => nameOf(mon));
      const riskers = roster2.filter((_, i) => cells[i].tier === 2).map(({ mon }) => nameOf(mon));
      const vtier = handlers.length ? 3 : riskers.length ? 2 : 1;
      const verdictTxt = vtier === 3 ? `handled by ${handlers.slice(0, 3).join(", ")}${handlers.length > 3 ? " +" + (handlers.length - 3) : ""}`
        : vtier === 2 ? `risky — only ${riskers.slice(0, 3).join(", ")}` : "✗ nobody handles this";
      const cellHtml = roster2.map(({ mon }, i) => {
        const c = cells[i];
        const spd = c.first === true ? "⚡" : c.first === false ? "🐢" : "";
        const key = mon.slug + "|" + sl;
        return `<td class="tc-cell tier-${c.tier} ${eb.teamExpanded === key ? "expanded" : ""}" data-tcell="${key}" title="Click to see how ${esc(nameOf(mon))} could better handle ${esc(nameOf(tmon))}"><b>${c.label}</b><span class="tc-spd">${spd}${c.ohkoBack ? " ⚠" : ""}</span></td>`;
      }).join("");
      return `<tr>
        <td class="tc-threatcell"><img src="${tmon.sprite || tmon.artwork || ""}" alt=""><span class="tc-tname">${nameOf(tmon)}${tmon.isCustom ? '<span class="cx-star">★</span>' : ""}</span>
          <button class="tc-open" data-threat2counter="${sl}" title="Open in All vs one">⚔</button></td>
        ${cellHtml}
        <td class="tc-verdict v-${vtier}">${verdictTxt}</td>
      </tr>`;
    }).join("");

    const uncovered = eb.threats.filter((sl) => { const m = resolveMon(sl); if (!m) return false;
      const target = defenderTarget(m); return !roster2.some(({ mon, moves }) => teamCell(mon, moves, target).tier === 3); });
    const summary = uncovered.length
      ? `<div class="team-callout warn">⚠ ${uncovered.length} threat${uncovered.length > 1 ? "s" : ""} not cleanly handled: ${uncovered.map((sl) => nameOf(resolveMon(sl))).join(" · ")}</div>`
      : `<div class="team-callout ok">✓ Every threat is handled by at least one teammate.</div>`;

    // fix-it detail for the expanded cell — validate the pair still exists
    let detail = "";
    if (eb.teamExpanded) {
      const [mslug, tslug] = eb.teamExpanded.split("|");
      const member = roster2.find((r) => r.mon.slug === mslug);
      const tmon = resolveMon(tslug);
      if (member && tmon && eb.threats.includes(tslug)) detail = renderTeamDetail(member.mon, member.moves, tmon);
      else eb.teamExpanded = null;
    }

    out.innerHTML = `${summary}
      <div class="tc-matrix-wrap"><table class="tc-matrix">
        <thead><tr><th class="tc-corner">Threat \\ Team</th>${memberHead}<th class="tc-vhead">Verdict</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="tc-legend"><span class="tc-key tier-3">handled</span><span class="tc-key tier-2">risky</span><span class="tc-key tier-1">can't</span>
        <span class="tc-note">click a cell to see how to fix it · ⚡ outspeeds · 🐢 slower · ⚠ gets OHKO'd back</span></div>
      ${detail}
      <p class="ehp-approx">Each teammate uses its chosen team moves (or its full movepool if none set) at the global attacker preset. Threats use their real ladder set. Real Gen-9 damage vs real HP.</p>`;
  }

  // Setup moves that grant a boost, for naming the "boost fix" (best-effort).
  const SETUP_MOVES = {
    "Swords Dance": { key: "atk", n: 2 }, "Nasty Plot": { key: "spa", n: 2 }, "Dragon Dance": { key: "atk", n: 1 },
    "Bulk Up": { key: "atk", n: 1 }, "Calm Mind": { key: "spa", n: 1 }, "Quiver Dance": { key: "spa", n: 1 },
    "Work Up": { key: "atk", n: 1 }, "Howl": { key: "atk", n: 1 }, "Growth": { key: "atk", n: 1 },
    "Tail Glow": { key: "spa", n: 3 }, "Victory Dance": { key: "atk", n: 1 }, "Shift Gear": { key: "atk", n: 1 },
    "Clangorous Soul": { key: "atk", n: 1 }, "Fillet Away": { key: "atk", n: 2 }, "Belly Drum": { key: "atk", n: 6 },
  };
  // The "fix-it" detail: how this teammate could better handle this threat (add a move / set up).
  function renderTeamDetail(memberMon, memberMoves, threatMon) {
    const entry = { mon: memberMon, lv: statsFor(memberMon, "lv50") };
    const threatTarget = defenderTarget(threatMon);
    const teamSet = new Set(memberMoves || []);
    const cur = teamCell(memberMon, memberMoves, threatTarget);   // current locked-moveset result
    const curKO = cur.ko != null ? cur.ko : 99;
    // full learnable pool at the same global preset (no moveset lock) — reveals alternatives
    const stFull = { ...atkSettings(entry), movepool: "all", moveset: null };
    const all = movesVsTarget(entry, threatTarget, false, stFull);
    const cat = (row) => (row.cat === "physical" ? "atk" : "spa");

    // ---- fix 1: best learnable move NOT on the team that improves the KO ----
    const better = all.filter((r) => !teamSet.has(r.id) && r.nMin < curKO);
    const moveFix = (better.find((r) => !r.risky) || better[0]);
    const canAdd = (memberMoves || []).length < 4;
    const moveFixHtml = moveFix
      ? `<div class="tc-fix good"><span class="tc-fix-ico">⊕</span><span class="type tiny" style="background:${TYPE_COLORS[moveFix.effType]}">${moveFix.effType}</span><b>${moveFix.mv.name}</b> → ${verdict(moveFix).txt} <small class="muted">(now ${cur.label})</small>
          ${canAdd ? `<button class="btn-sm tc-addmove" data-addteammove="${memberMon.slug}:${moveFix.id}">＋ add to team</button>` : `<small class="muted tc-swap">team full — swap a move for it</small>`}</div>`
      : "";
    // ---- fix 2: minimal setup boost (on the current team moves) that reaches the threshold ----
    const thr = eb.threshold === "any" ? 2 : eb.threshold === "ohko" ? 1 : eb.threshold === "2hko" ? 2 : 3;
    const stLock = { ...atkSettings(entry) };
    if (Array.isArray(memberMoves) && memberMoves.length) stLock.moveset = memberMoves;
    let boostFix = "";
    for (const b of [1, 2]) {
      const r = bestVsTarget(entry, threatTarget, { ...stLock, boost: b });
      if (r && r.nMin <= thr && (curKO > thr || curKO > r.nMin)) {
        const stat = r.cat === "physical" ? "Atk" : "Sp.Atk";
        const setup = Object.entries(SETUP_MOVES).find(([nm, v]) => v.key === (r.cat === "physical" ? "atk" : "spa") && v.n >= b && (memberMon.moves || []).includes(moveIdByName.get(nm)));
        boostFix = `<div class="tc-fix good"><span class="tc-fix-ico">↑</span><b>+${b} ${stat}</b> → ${verdict(r).txt} <small class="muted">(now ${cur.label})</small>${setup ? ` <small class="muted">via ${setup[0]}</small>` : ""}</div>`;
        break;
      }
    }
    const handlesClean = cur.tier >= 3;
    const fixes = [moveFixHtml, boostFix].filter(Boolean).join("");
    const thrLab = { any: "2HKO", ohko: "OHKO", "2hko": "2HKO", "3hko": "3HKO" }[eb.threshold];
    const fixesBlock = fixes
      ? (handlesClean ? `<div class="tc-fix ok">✓ Already handles this — options to hit even harder:</div>${fixes}` : fixes)
      : (handlesClean
        ? `<div class="tc-fix ok">✓ Already handles this threat cleanly.</div>`
        : `<div class="tc-fix none">No single added move or setup boost reaches ${thrLab} range — consider a different teammate for this threat.</div>`);

    // ---- full move list vs the threat (alternatives visible; team moves tagged) ----
    const moveRows = all.map((r) => {
      const v = verdict(r);
      const fl = [];
      if (r.se) fl.push(`<span class="ehp-flag se">SE ×${r.typeEff}</span>`);
      else if (r.typeEff < 1) fl.push(`<span class="ehp-flag nve">resisted ×${fracMult(r.typeEff)}</span>`);
      if (r.stab > 1) fl.push(`<span class="ehp-flag stab">STAB</span>`);
      if (r.risky) fl.push(`<span class="ehp-flag risky">risky</span>`);
      const inTeam = teamSet.has(r.id);
      const tag = inTeam ? `<span class="tc-inteam">in team</span>`
        : ((memberMoves || []).length < 4 ? `<button class="tc-addmini" data-addteammove="${memberMon.slug}:${r.id}" title="Add to team">＋</button>` : "");
      return `<div class="tc-mrow ${inTeam ? "in" : ""}" ${`data-move-info="${r.id}"`}>
        <span class="apm-mv"><span class="type tiny" style="background:${TYPE_COLORS[r.effType]}">${r.effType}</span>${r.mv.name}</span>
        <span class="apm-pct">${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${v.cls}">${v.txt}</span>
        <span class="apm-fl">${fl.join("")}</span>${tag}</div>`;
    }).join("") || `<p class="ehp-empty">No usable damaging move in its whole pool.</p>`;

    // ---- what it survives (threat's best return) ----
    const back = threatMovesOnto(entry, threatTarget).slice(0, 3).map((r) => {
      const ko = r.maxPct >= 100 ? "faints you" : `you keep ${Math.round(100 - r.maxPct)}%`;
      const cls = r.maxPct >= 100 ? "ko-o" : 2 * r.minPct >= 100 ? "ko-2" : "ko-n";
      return `<div class="tc-mrow" data-move-info="${moveIdByName.get(r.mv.name)}">
        <span class="apm-mv"><span class="type tiny" style="background:${TYPE_COLORS[r.mv.type]}">${r.mv.type}</span>${r.mv.name}</span>
        <span class="apm-pct">${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%</span>
        <span class="ehp-ko ${cls}">${ko}</span></div>`;
    }).join("") || `<p class="ehp-empty">This threat has no damaging move set.</p>`;

    return `<div class="tc-detail">
      <div class="tc-detail-head"><img src="${memberMon.sprite || memberMon.artwork || ""}" alt=""><b>${nameOf(memberMon)}</b> <span class="muted">vs</span> <img src="${threatMon.sprite || threatMon.artwork || ""}" alt=""><b>${nameOf(threatMon)}</b>
        <button class="tc-detail-x" data-tcell-close aria-label="Close">✕</button></div>
      <div class="tc-detail-grid">
        <div class="tc-detail-col">
          <div class="tc-sec-lab">How to fix it</div>
          ${fixesBlock}
          <div class="tc-sec-lab">${nameOf(threatMon)} → ${nameOf(memberMon)} <small>(what you survive)</small></div>
          <div class="tc-mlist">${back}</div>
        </div>
        <div class="tc-detail-col">
          <div class="tc-sec-lab">All of ${nameOf(memberMon)}'s moves vs ${nameOf(threatMon)}</div>
          <div class="tc-mlist">${moveRows}</div>
        </div>
      </div>
    </div>`;
  }

  try { applyLab(JSON.parse(localStorage.getItem(STATE_KEY) || "null")); } catch { /* ignore */ }
  syncMode();

  return { refresh: () => { if (s.mode === "team") renderTeam(); } };
}
