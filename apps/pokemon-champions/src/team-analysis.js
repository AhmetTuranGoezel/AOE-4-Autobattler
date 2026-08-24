import { TYPES, displayName } from "./data.js";
import { roleOf } from "./effective-stats.js";
import { applyAbility, defaultRosterAbility, rosterAbilities } from "./type-defense.js";

const TYPE_INDEX = new Map(TYPES.map((type, index) => [type, index]));

const UTILITY_META = {
  speed: { label: "Speed control", weight: 4 },
  redirection: { label: "Redirection", weight: 4 },
  support: { label: "Ally support", weight: 3.6 },
  disruption: { label: "Disruption", weight: 3.4 },
  field: { label: "Field control", weight: 3 },
  setup: { label: "Setup", weight: 2.7 },
  sustain: { label: "Recovery", weight: 2.2 },
};

const ABILITY_UTILITY = {
  intimidate: ["disruption"],
  prankster: ["support"],
  "friend-guard": ["support"],
  hospitality: ["support", "sustain"],
  regenerator: ["sustain"],
  "lightning-rod": ["redirection"],
  "storm-drain": ["redirection"],
  drizzle: ["field"],
  drought: ["field"],
  "sand-stream": ["field"],
  "snow-warning": ["field"],
  "electric-surge": ["field"],
  "grassy-surge": ["field"],
  "misty-surge": ["field"],
  "psychic-surge": ["field"],
  battery: ["support"],
  "power-spot": ["support"],
  "steely-spirit": ["support"],
  "flower-gift": ["support"],
  costar: ["support"],
  commander: ["support"],
  "armor-tail": ["disruption"],
  "queenly-majesty": ["disruption"],
  dazzling: ["disruption"],
  "aroma-veil": ["support"],
  "sweet-veil": ["support"],
  "pastel-veil": ["support"],
};

const SPEED_MOVE_NAMES = new Set([
  "tailwind", "trick room", "icy wind", "electroweb", "bulldoze", "rock tomb",
  "scary face", "thunder wave", "string shot", "after you", "quash",
]);
const REDIRECTION_MOVE_NAMES = new Set(["follow me", "rage powder", "spotlight"]);
const SUPPORT_MOVE_NAMES = new Set([
  "helping hand", "coaching", "decorate", "instruct", "ally switch", "wide guard",
  "quick guard", "reflect", "light screen", "aurora veil", "safeguard", "mist",
  "life dew", "heal pulse", "pollen puff", "mat block",
]);
const DISRUPTION_MOVE_NAMES = new Set([
  "fake out", "taunt", "encore", "disable", "sleep powder", "spore", "hypnosis",
  "will o wisp", "thunder wave", "toxic", "snarl", "parting shot", "knock off",
  "clear smog", "haze", "roar", "whirlwind",
]);
const FIELD_MOVE_NAMES = new Set([
  "trick room", "rain dance", "sunny day", "sandstorm", "snowscape", "hail",
  "electric terrain", "grassy terrain", "misty terrain", "psychic terrain",
  "stealth rock", "spikes", "toxic spikes", "sticky web",
]);

export function canonicalTyping(types = []) {
  return [...new Set(types)].sort((a, b) =>
    (TYPE_INDEX.get(a) ?? TYPES.length) - (TYPE_INDEX.get(b) ?? TYPES.length));
}

export function typingKey(types = []) {
  return canonicalTyping(types).join("/");
}

export function typeMultiplier(chart, attackType, defenderTypes = []) {
  return defenderTypes.reduce((mult, type) => mult * (chart[attackType]?.[type] ?? 1), 1);
}

function weaknessLoad(mult) {
  if (mult >= 4) return 2;
  return mult > 1 ? 1 : 0;
}

function resistanceCover(mult) {
  if (mult === 0) return 2;
  if (mult <= 0.25) return 1.5;
  return mult < 1 ? 1 : 0;
}

export function defensiveRowPenalty({ weakCount, weakLoad, coverLoad }) {
  const sharedWeakness = Math.max(0, weakCount - 1) * 4;
  const uncoveredLoad = Math.max(0, weakLoad - coverLoad) * 3;
  return sharedWeakness + uncoveredLoad;
}

export function buildDefensiveProfile(team, chart) {
  const rows = TYPES.map((attackType) => {
    const cells = team.map((entry) => {
      const types = entry.mon?.types || entry.types || [];
      const base = typeMultiplier(chart, attackType, types);
      return applyAbility(base, attackType, entry.ability ?? null);
    });
    const weakCount = cells.filter((mult) => mult > 1).length;
    const resistCount = cells.filter((mult) => mult < 1).length;
    const weakLoad = cells.reduce((sum, mult) => sum + weaknessLoad(mult), 0);
    const coverLoad = cells.reduce((sum, mult) => sum + resistanceCover(mult), 0);
    const row = { attackType, cells, weakCount, resistCount, weakLoad, coverLoad };
    return { ...row, penalty: defensiveRowPenalty(row) };
  });
  return { rows, totalPenalty: rows.reduce((sum, row) => sum + row.penalty, 0) };
}

function offenseCategory(mult) {
  if (mult <= 0) return "no-effect";
  if (mult < 1) return "reduced-only";
  if (mult < 2) return "neutral-only";
  return "super-effective";
}

function offenseGapPenalty(mult) {
  const category = offenseCategory(mult);
  if (category === "no-effect") return 8;
  if (category === "reduced-only") return 5;
  if (category === "neutral-only") return 2;
  return 0;
}

function unwrapMove(value, moves) {
  if (!value) return null;
  if (value.move) return value.move;
  if (value.name && value.type) return value;
  return moves[value] || null;
}

export function buildOffensiveProfile(team, chart, moves) {
  const contributors = team.map((entry) => {
    const selected = entry.moveObjects || entry.moveIds || entry.moves || [];
    return {
      mon: entry.mon,
      damagingMoves: selected
        .map((value) => unwrapMove(value, moves))
        .filter((move) => move && move.class !== "status" && move.type),
    };
  });

  const rows = TYPES.map((defendingType) => {
    const cells = contributors.map(({ mon, damagingMoves }) => {
      if (!damagingMoves.length) return { category: "none", mult: 0, mon };
      const options = damagingMoves.map((move) => ({
        move,
        mult: chart[move.type]?.[defendingType] ?? 1,
      }));
      const best = Math.max(...options.map((option) => option.mult));
      const tied = options.filter((option) => option.mult === best);
      const stab = tied.find((option) => mon?.types?.includes(option.move.type));
      const chosen = stab || tied[0];
      return {
        category: best >= 2 ? "se" : best >= 1 ? "neutral" : best > 0 ? "resisted" : "immune",
        mult: best,
        stab: Boolean(stab),
        move: chosen.move,
        mon,
      };
    });
    const bestMultiplier = Math.max(0, ...cells.map((cell) => cell.mult || 0));
    return {
      defendingType,
      cells,
      bestMultiplier,
      category: offenseCategory(bestMultiplier),
      superEffectiveMembers: cells.filter((cell) => cell.category === "se").length,
      canDealNeutral: cells.some((cell) => cell.mult >= 1),
      gapPenalty: offenseGapPenalty(bestMultiplier),
    };
  });

  return {
    rows,
    totalGapPenalty: rows.reduce((sum, row) => sum + row.gapPenalty, 0),
    hasDamagingMoves: contributors.some((entry) => entry.damagingMoves.length),
  };
}

function cap(type) {
  return type ? type[0].toUpperCase() + type.slice(1) : "";
}

function listTypes(types, max = 4) {
  const shown = types.slice(0, max).map(cap);
  if (types.length > max) shown.push(`+${types.length - max} more`);
  return shown.join(", ");
}

function normalizedName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function moveNameIndex(moves) {
  return new Map(Object.values(moves).map((move) => [normalizedName(move.name), move]));
}

function abilityName(data, slug) {
  if (!slug) return "No ability";
  return data.abilities?.[slug]?.name || slug.split("-").map(cap).join(" ");
}

function moveUtilityIds(move) {
  const ids = new Set();
  const name = normalizedName(move.name);
  const effect = String(move.effect || "").toLowerCase();
  const target = move.target || "";
  const restoresHp = /restore|recover|heal/.test(effect);

  if (SPEED_MOVE_NAMES.has(name)
      || /lower(?:s)? the target'?s speed|speed doubled|paralyz/.test(effect)) ids.add("speed");
  if (REDIRECTION_MOVE_NAMES.has(name) || effect.includes("redirected to the user")) ids.add("redirection");
  if (SUPPORT_MOVE_NAMES.has(name)
      || ["ally", "all-allies", "user-and-allies", "users-field"].includes(target)) ids.add("support");
  if (DISRUPTION_MOVE_NAMES.has(name)
      || /flinch|burns? the target|poisons? the target|fall asleep|confus|forced to repeat|becomes disabled|prevents the target|lower(?:s)? the target'?s/.test(effect)) ids.add("disruption");
  if (move.class === "status" && target === "user" && /raises? the user'?s|raises? its own|maximizes? the user'?s/.test(effect)) ids.add("setup");
  if (restoresHp && ["user", "ally", "user-or-ally", "user-and-allies", "selected-pokemon"].includes(target)) ids.add("sustain");
  if (FIELD_MOVE_NAMES.has(name) || target === "entire-field" || target === "opponents-field"
      || /weather|terrain|entry hazard/.test(effect)) ids.add("field");

  return [...ids];
}

function abilityUtilityIds(slug, data) {
  if (!slug) return [];
  const ids = new Set(ABILITY_UTILITY[slug] || []);
  const desc = String(data.abilities?.[slug]?.desc || "").toLowerCase();
  if (desc.includes("redirects that move to itself")) ids.add("redirection");
  if (desc.includes("allies receive") || desc.includes("its ally's maximum hp")) ids.add("support");
  if (desc.includes("lowers the attack of opposing")) ids.add("disruption");
  return [...ids];
}

function usageFactor(share) {
  if (share == null) return 1;
  return Math.max(0.3, Math.min(1, Number(share) / 12.5));
}

function toolkitProfile(moveEntries, ability, data) {
  const byId = new Map();
  const add = (id, factor, source) => {
    const meta = UTILITY_META[id];
    if (!meta) return;
    const score = meta.weight * factor;
    const current = byId.get(id);
    if (!current || score > current.score) byId.set(id, { id, label: meta.label, score, source });
  };

  for (const entry of moveEntries) {
    const move = entry.move || entry;
    const factor = (entry.confidence ?? 1) * usageFactor(entry.share);
    for (const id of moveUtilityIds(move)) add(id, factor, move.name);
  }
  for (const id of abilityUtilityIds(ability, data)) add(id, 1, abilityName(data, ability));
  return [...byId.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function selectedMoveEntries(entry, data) {
  return (entry.moveIds || entry.moves || [])
    .map((id) => data.moves[id])
    .filter(Boolean)
    .map((move) => ({ move, confidence: 1 }));
}

function activeToolkit(team, data) {
  const byId = new Map();
  for (const entry of team) {
    for (const item of toolkitProfile(selectedMoveEntries(entry, data), entry.ability, data)) {
      const current = byId.get(item.id);
      if (!current || item.score > current.score) byId.set(item.id, item);
    }
  }
  return byId;
}

function candidateMoveSet(mon, data, byName) {
  const common = (mon.usage?.moves || [])
    .map(([name, share]) => ({ move: byName.get(normalizedName(name)), share: Number(share), confidence: 1 }))
    .filter((entry) => entry.move)
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);
  if (common.length) return { entries: common, source: "common moves" };

  const pool = (mon.moves || []).map((id) => data.moves[id]).filter(Boolean);
  const damaging = pool.filter((move) => move.class !== "status" && move.type && Number(move.power) > 0)
    .sort((a, b) => {
      const aScore = Number(a.power) * (mon.types.includes(a.type) ? 1.35 : 1) * ((a.accuracy ?? 100) / 100);
      const bScore = Number(b.power) * (mon.types.includes(b.type) ? 1.35 : 1) * ((b.accuracy ?? 100) / 100);
      return bScore - aScore;
    });
  const bestDamageByType = [];
  const usedTypes = new Set();
  for (const move of damaging) {
    if (usedTypes.has(move.type)) continue;
    usedTypes.add(move.type);
    bestDamageByType.push(move);
  }
  const utility = pool.filter((move) => moveUtilityIds(move).length)
    .sort((a, b) => Math.max(...moveUtilityIds(b).map((id) => UTILITY_META[id].weight))
      - Math.max(...moveUtilityIds(a).map((id) => UTILITY_META[id].weight)));
  const chosen = [];
  for (const move of [...bestDamageByType.slice(0, 2), ...utility.slice(0, 2), ...bestDamageByType]) {
    if (!chosen.includes(move)) chosen.push(move);
    if (chosen.length === 4) break;
  }
  return {
    entries: chosen.map((move) => ({ move, confidence: 0.55 })),
    source: "movepool estimate",
  };
}

function candidatePool(data, activeTeam, fullTeam) {
  const active = new Set(activeTeam.map((entry) => entry.mon?.slug || entry.slug));
  const full = new Map(fullTeam.map((entry) => [entry.mon?.slug || entry.slug, entry]));
  const groups = new Map();

  for (const mon of data.pokemon) {
    if (mon.available === false || active.has(mon.slug) || !mon.types?.length) continue;
    const types = canonicalTyping(mon.types);
    const key = typingKey(types);
    if (!groups.has(key)) groups.set(key, { key, types, matches: [] });
    groups.get(key).matches.push({ mon, bench: full.has(mon.slug) && !active.has(mon.slug) });
  }

  return [...groups.values()].map((candidate) => ({
    ...candidate,
    label: candidate.types.map(cap).join(" / "),
    matches: candidate.matches.sort((a, b) =>
      Number(b.bench) - Number(a.bench) || displayName(a.mon).localeCompare(displayName(b.mon))),
  }));
}

function roleId(mon, toolkit) {
  if (toolkit.some((item) => ["speed", "redirection", "support", "field"].includes(item.id))) return "support";
  if (!mon.stats) return "unknown";
  return roleOf(mon);
}

function roleLabel(id) {
  return ({
    support: "Support",
    physical: "Physical attacker",
    special: "Special attacker",
    mixed: "Mixed attacker",
    defensive: "Defensive",
    unknown: "Unclassified",
  })[id] || cap(id);
}

function fragilityPenalty(mon) {
  if (!mon.stats) return 0;
  const mixedBulk = mon.stats.hp * ((mon.stats.def + mon.stats.spd) / 2);
  return Math.min(3.5, Math.max(0, (6200 - mixedBulk) / 900));
}

function toolkitContribution(toolkit, currentToolkit) {
  const fills = [];
  let score = 0;
  for (const item of toolkit) {
    const missing = !currentToolkit.has(item.id);
    score += item.score * (missing ? 1 : 0.18);
    if (missing) fills.push(item);
  }
  return { score: Math.min(12, score), fills };
}

function coverageUpgrades(current, next) {
  const currentByType = new Map(current.rows.map((row) => [row.defendingType, row]));
  return next.rows.map((row) => {
    const before = currentByType.get(row.defendingType).bestMultiplier;
    return {
      defendingType: row.defendingType,
      before,
      after: row.bestMultiplier,
      gain: offenseGapPenalty(before) - offenseGapPenalty(row.bestMultiplier),
    };
  }).filter((entry) => entry.gain > 0);
}

function abilityOptions(mon) {
  const abilities = rosterAbilities(mon);
  return abilities.length ? abilities : [null];
}

function evaluateVariant({ match, ability, team, data, currentDefense, currentOffense, currentToolkit, activeRoles, moveSet }) {
  const mon = match.mon;
  const candidateEntry = { mon, ability, moveObjects: moveSet.entries };
  const nextDefense = buildDefensiveProfile([...team, candidateEntry], data.typeChart);
  const nextOffense = buildOffensiveProfile([...team, candidateEntry], data.typeChart, data.moves);
  const currentDefenseByType = new Map(currentDefense.rows.map((row) => [row.attackType, row]));
  const nextDefenseByType = new Map(nextDefense.rows.map((row) => [row.attackType, row]));
  const candidateMultipliers = new Map(TYPES.map((type) => {
    const base = typeMultiplier(data.typeChart, type, mon.types);
    return [type, { base, final: applyAbility(base, type, ability) }];
  }));
  const pressureTypes = currentDefense.rows.filter((row) => row.penalty > 0).map((row) => row.attackType);
  const pressureResists = pressureTypes.filter((type) => candidateMultipliers.get(type).final < 1);
  const ownWeaknesses = TYPES.filter((type) => candidateMultipliers.get(type).final > 1);
  const coveredWeaknesses = ownWeaknesses.filter((type) => currentDefenseByType.get(type).coverLoad > 0);
  const improved = nextDefense.rows
    .filter((row) => row.penalty < currentDefenseByType.get(row.attackType).penalty)
    .sort((a, b) => (currentDefenseByType.get(b.attackType).penalty - b.penalty)
      - (currentDefenseByType.get(a.attackType).penalty - a.penalty))
    .map((row) => row.attackType);
  const newShared = TYPES.filter((type) => {
    const current = currentDefenseByType.get(type);
    return current.weakCount > 0 && candidateMultipliers.get(type).final > 1
      && nextDefenseByType.get(type).weakCount > current.weakCount;
  });
  const abilityImproves = TYPES.filter((type) => {
    const mult = candidateMultipliers.get(type);
    return mult.final < mult.base && (currentDefenseByType.get(type).penalty > 0 || mult.base > 1);
  });
  const abilityWorsens = TYPES.filter((type) => {
    const mult = candidateMultipliers.get(type);
    return mult.final > mult.base && (mult.final > 1 || currentDefenseByType.get(type).weakCount > 0);
  });

  const upgrades = coverageUpgrades(currentOffense, nextOffense);
  const coverageGain = upgrades.reduce((sum, entry) => sum + entry.gain, 0);
  const pressurePoints = Math.min(14, coverageGain / 3.5);
  const addsSe = upgrades.filter((entry) => entry.after >= 2).map((entry) => entry.defendingType);
  const fixesHardGap = upgrades.filter((entry) => entry.before < 1 && entry.after >= 1).map((entry) => entry.defendingType);
  const toolkit = toolkitProfile(moveSet.entries, ability, data);
  const utility = toolkitContribution(toolkit, currentToolkit);
  const candidateRole = roleId(mon, toolkit);
  const roleGap = activeRoles.has(candidateRole) ? 0 : 1.25;
  const defenseDelta = currentDefense.totalPenalty - nextDefense.totalPenalty;
  const unsafePenalty = newShared.reduce((sum, type) => {
    const row = currentDefenseByType.get(type);
    const mult = candidateMultipliers.get(type).final;
    return sum + (mult >= 4 ? 5 : 2.5) + Math.max(0, row.weakCount - 1) * 1.5;
  }, 0);
  const frailty = fragilityPenalty(mon);
  const usefulActionPenalty = !moveSet.entries.length && !toolkit.length ? 6 : 0;
  const contributionPenalty = Math.max(0, 3 - pressurePoints - utility.score) * 1.5;
  const defensiveScore = defenseDelta * 1.4 + utility.score * 0.65 + pressurePoints * 0.35
    + roleGap - unsafePenalty - frailty - usefulActionPenalty - contributionPenalty;
  const rolePressureScore = pressurePoints + utility.score * 1.15 + defenseDelta * 0.65
    + roleGap - unsafePenalty * 1.2 - frailty - usefulActionPenalty - contributionPenalty;
  const assumedAbility = abilityName(data, ability);
  const candidateName = displayName(mon);
  const defenseReasons = [];
  const roleReasons = [];
  if (improved.length) defenseReasons.push(`Helps your team: adds a safer switch into ${listTypes(improved)}`);
  if (abilityImproves.length) {
    const blocked = abilityImproves.filter((type) => candidateMultipliers.get(type).final === 0);
    defenseReasons.push(`${candidateName}'s ${assumedAbility} ${blocked.length ? "blocks" : "softens"} ${listTypes(abilityImproves)}`);
  } else if (pressureResists.length) {
    defenseReasons.push(`${candidateName} resists ${listTypes(pressureResists)} pressure`);
  }
  if (coveredWeaknesses.length) {
    defenseReasons.push(`Team supports ${candidateName}: existing teammates resist ${listTypes(coveredWeaknesses)}`);
  }
  if (utility.fills.length) {
    const labels = utility.fills.slice(0, 3).map((item) => item.label);
    roleReasons.push(`Battle role: adds ${labels.join(", ").toLowerCase()}`);
    defenseReasons.push(`Battle role: adds ${labels.join(", ").toLowerCase()}`);
  }
  if (addsSe.length) roleReasons.push(`Offense: adds super-effective pressure vs ${listTypes(addsSe)}`);
  if (fixesHardGap.length) roleReasons.push(`Offense: fixes weak coverage into ${listTypes(fixesHardGap)}`);
  if (!addsSe.length && coverageGain > 0) roleReasons.push("Offense: improves neutral coverage with its likely moves");
  if (pressureResists.length) roleReasons.push(`Defense: gives your team a switch into ${listTypes(pressureResists)}`);
  if (!defenseReasons.length) defenseReasons.push("adds a usable role without relieving a major shared weakness");
  if (!roleReasons.length) roleReasons.push("offers limited new pressure or team utility with its likely set");

  const warnings = [];
  if (newShared.length) warnings.push(`adds shared weakness to ${listTypes(newShared)}`);
  if (abilityWorsens.length) warnings.push(`${assumedAbility} worsens damage from ${listTypes(abilityWorsens)}`);
  if (frailty >= 2) warnings.push("low mixed bulk makes safe switches harder");
  if (contributionPenalty >= 3) warnings.push("adds little new pressure or team utility");
  if (moveSet.source === "movepool estimate") warnings.push("toolkit is estimated because no common set is available");

  return {
    match,
    ability,
    abilityName: assumedAbility,
    preferredAbility: ability === defaultRosterAbility(mon),
    toolkit,
    role: candidateRole,
    roleLabel: roleLabel(candidateRole),
    moveSource: moveSet.source,
    pressureResistCount: pressureResists.length,
    coveredWeaknessCount: coveredWeaknesses.length,
    upgradedGapCount: upgrades.length,
    superEffectiveGainCount: addsSe.length,
    defensiveScore,
    rolePressureScore,
    defenseReasons: defenseReasons.slice(0, 4),
    roleReasons: roleReasons.slice(0, 4),
    warnings: warnings.slice(0, 3),
  };
}

function bestVariant(candidate, context, lens) {
  const variants = [];
  for (const match of candidate.matches) {
    const moveSet = context.moveSets.get(match.mon.slug);
    for (const ability of abilityOptions(match.mon)) {
      variants.push(evaluateVariant({ match, ability, moveSet, ...context }));
    }
  }
  const scoreKey = lens === "defensive" ? "defensiveScore" : "rolePressureScore";
  variants.sort((a, b) => b[scoreKey] - a[scoreKey]
    || Number(b.preferredAbility) - Number(a.preferredAbility)
    || Number(b.match.bench) - Number(a.match.bench)
    || displayName(a.match.mon).localeCompare(displayName(b.match.mon)));
  return variants[0];
}

function rankedGroups(candidates, context, lens) {
  const scoreKey = lens === "defensive" ? "defensiveScore" : "rolePressureScore";
  const reasonsKey = lens === "defensive" ? "defenseReasons" : "roleReasons";
  return candidates.map((candidate) => {
    const best = bestVariant(candidate, context, lens);
    const matches = [best.match, ...candidate.matches.filter((match) => match.mon.slug !== best.match.mon.slug)];
    return {
      ...candidate,
      matches,
      score: best[scoreKey],
      reasons: best[reasonsKey],
      warnings: best.warnings,
      representative: best.match,
      ability: best.ability,
      abilityName: best.abilityName,
      toolkit: best.toolkit,
      role: best.role,
      roleLabel: best.roleLabel,
      moveSource: best.moveSource,
      pressureResistCount: best.pressureResistCount,
      coveredWeaknessCount: best.coveredWeaknessCount,
      upgradedGapCount: best.upgradedGapCount,
      superEffectiveGainCount: best.superEffectiveGainCount,
    };
  }).sort((a, b) => b.score - a.score
    || Number(b.representative.bench) - Number(a.representative.bench)
    || a.label.localeCompare(b.label));
}

export function rankTypingRecommendations({ data, activeTeam, fullTeam = activeTeam, limit = 5 }) {
  const candidates = candidatePool(data, activeTeam, fullTeam);
  const currentDefense = buildDefensiveProfile(activeTeam, data.typeChart);
  const currentOffense = buildOffensiveProfile(activeTeam, data.typeChart, data.moves);
  const currentToolkit = activeToolkit(activeTeam, data);
  const activeRoles = new Set(activeTeam.map((entry) =>
    roleId(entry.mon, toolkitProfile(selectedMoveEntries(entry, data), entry.ability, data))));
  const byName = moveNameIndex(data.moves);
  const moveSets = new Map(candidates.flatMap((candidate) => candidate.matches)
    .map(({ mon }) => [mon.slug, candidateMoveSet(mon, data, byName)]));
  const context = {
    team: activeTeam,
    data,
    currentDefense,
    currentOffense,
    currentToolkit,
    activeRoles,
    moveSets,
  };
  return {
    defensive: rankedGroups(candidates, context, "defensive").slice(0, limit),
    offensive: rankedGroups(candidates, context, "role-pressure").slice(0, limit),
    hasDamagingMoves: currentOffense.hasDamagingMoves,
    candidateCount: candidates.length,
    candidatePokemonCount: candidates.reduce((sum, candidate) => sum + candidate.matches.length, 0),
  };
}
