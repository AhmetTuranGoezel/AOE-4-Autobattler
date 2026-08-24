import { TYPES, displayName } from "./data.js";
import { applyAbility } from "./type-defense.js";

const TYPE_INDEX = new Map(TYPES.map((type, index) => [type, index]));

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

export function buildOffensiveProfile(team, chart, moves) {
  const contributors = team.map((entry) => ({
    mon: entry.mon,
    damagingMoves: (entry.moveIds || entry.moves || [])
      .map((id) => moves[id])
      .filter((move) => move && move.class !== "status" && move.type),
  }));

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

function candidatePool(data, activeTeam, fullTeam) {
  const active = new Set(activeTeam.map((entry) => entry.mon?.slug || entry.slug));
  const full = new Map(fullTeam.map((entry) => [entry.mon?.slug || entry.slug, entry]));
  const groups = new Map();

  for (const mon of data.pokemon) {
    if (mon.available === false || active.has(mon.slug) || !mon.types?.length) continue;
    const types = canonicalTyping(mon.types);
    const key = typingKey(types);
    if (!groups.has(key)) groups.set(key, { key, types, matches: [] });
    groups.get(key).matches.push({
      mon,
      bench: full.has(mon.slug) && !active.has(mon.slug),
    });
  }

  return [...groups.values()].map((candidate) => ({
    ...candidate,
    label: candidate.types.map(cap).join(" / "),
    matches: candidate.matches.sort((a, b) =>
      Number(b.bench) - Number(a.bench) || displayName(a.mon).localeCompare(displayName(b.mon))),
  }));
}

function rankDefensiveCandidates(candidates, team, chart) {
  const current = buildDefensiveProfile(team, chart);
  const currentByType = new Map(current.rows.map((row) => [row.attackType, row]));
  const pressureTypes = current.rows.filter((row) => row.penalty > 0).map((row) => row.attackType);

  return candidates.map((candidate) => {
    const next = buildDefensiveProfile([...team, { types: candidate.types, ability: null }], chart);
    const improved = next.rows
      .filter((row) => row.penalty < currentByType.get(row.attackType).penalty)
      .sort((a, b) =>
        (currentByType.get(b.attackType).penalty - b.penalty)
        - (currentByType.get(a.attackType).penalty - a.penalty))
      .map((row) => row.attackType);
    const pressureResists = pressureTypes.filter((type) =>
      typeMultiplier(chart, type, candidate.types) < 1);
    const ownWeaknesses = TYPES.filter((type) => typeMultiplier(chart, type, candidate.types) > 1);
    const coveredWeaknesses = ownWeaknesses.filter((type) => currentByType.get(type).coverLoad > 0);
    const score = current.totalPenalty - next.totalPenalty;
    const reasons = [];
    if (improved.length) reasons.push(`reduces team pressure from ${listTypes(improved)}`);
    if (pressureResists.length) reasons.push(`resists or blocks ${listTypes(pressureResists)} pressure`);
    if (coveredWeaknesses.length) reasons.push(`team covers its ${listTypes(coveredWeaknesses)} weaknesses`);
    if (!reasons.length) reasons.push("does not directly relieve a current shared weakness");
    return {
      ...candidate,
      score,
      pressureResistCount: pressureResists.length,
      coveredWeaknessCount: coveredWeaknesses.length,
      reasons,
    };
  }).sort((a, b) =>
    b.score - a.score
    || b.pressureResistCount - a.pressureResistCount
    || b.coveredWeaknessCount - a.coveredWeaknessCount
    || a.label.localeCompare(b.label));
}

function rankOffensiveCandidates(candidates, team, chart, moves) {
  const current = buildOffensiveProfile(team, chart, moves);
  const currentByType = new Map(current.rows.map((row) => [row.defendingType, row]));

  return candidates.map((candidate) => {
    const upgrades = TYPES.map((defendingType) => {
      const before = currentByType.get(defendingType).bestMultiplier;
      const stab = Math.max(...candidate.types.map((type) => chart[type]?.[defendingType] ?? 1));
      const after = Math.max(before, stab);
      return {
        defendingType,
        before,
        after,
        gain: offenseGapPenalty(before) - offenseGapPenalty(after),
      };
    }).filter((entry) => entry.gain > 0);
    const score = upgrades.reduce((sum, entry) => sum + entry.gain, 0);
    const addsSe = upgrades.filter((entry) => entry.after >= 2).map((entry) => entry.defendingType);
    const fixesNoEffect = upgrades
      .filter((entry) => entry.before === 0 && entry.after > 0 && entry.after < 2)
      .map((entry) => entry.defendingType);
    const fixesReduced = upgrades
      .filter((entry) => entry.before > 0 && entry.before < 1 && entry.after >= 1 && entry.after < 2)
      .map((entry) => entry.defendingType);
    const reasons = [];
    if (addsSe.length) reasons.push(`adds super-effective pressure vs ${listTypes(addsSe)}`);
    if (fixesNoEffect.length) reasons.push(`turns no-effect gaps into damage vs ${listTypes(fixesNoEffect)}`);
    if (fixesReduced.length) reasons.push(`turns reduced-only coverage neutral vs ${listTypes(fixesReduced)}`);
    if (!reasons.length) reasons.push("adds no new coverage tier with the selected moves");
    return {
      ...candidate,
      score,
      upgradedGapCount: upgrades.length,
      superEffectiveGainCount: addsSe.length,
      reasons,
    };
  }).sort((a, b) =>
    b.score - a.score
    || b.superEffectiveGainCount - a.superEffectiveGainCount
    || b.upgradedGapCount - a.upgradedGapCount
    || a.label.localeCompare(b.label));
}

export function rankTypingRecommendations({ data, activeTeam, fullTeam = activeTeam, limit = 5 }) {
  const candidates = candidatePool(data, activeTeam, fullTeam);
  const offensiveProfile = buildOffensiveProfile(activeTeam, data.typeChart, data.moves);
  return {
    defensive: rankDefensiveCandidates(candidates, activeTeam, data.typeChart).slice(0, limit),
    offensive: rankOffensiveCandidates(candidates, activeTeam, data.typeChart, data.moves).slice(0, limit),
    hasDamagingMoves: offensiveProfile.hasDamagingMoves,
    candidateCount: candidates.length,
  };
}
