// ========================================
// Health tracking, bleed/poison DoT, and damage application
// Pure state-manipulation functions (no DOM dependencies)
// ========================================

import { KIPCHAK_TRIPLE_SHOT, POISON_TICK_INTERVAL } from "./combat-data.js";

export function isKipchakArcher(unitData) {
  return unitData?.name === "Kipchak Archer";
}

export function hasKipchakTripleShot(unitData) {
  return isKipchakArcher(unitData) && !!unitData?.effects?.tripleShot;
}

export function getKipchakBleedProfile(unitData) {
  const bleed = unitData?.effects?.bleed;
  if (!bleed) return null;
  let dps = bleed.dps || 0;
  if (hasKipchakTripleShot(unitData)) {
    dps +=
      KIPCHAK_TRIPLE_SHOT.extraArrows *
      KIPCHAK_TRIPLE_SHOT.extraBleedDpsPerArrow;
  }
  return {
    dps,
    duration: bleed.duration || 0,
  };
}

export function getBleedSlotCap(targetUnits, attackerUnits, splitEnabled, splitTargets) {
  if (!(targetUnits > 0) || !(attackerUnits > 0)) return 0;
  if (!splitEnabled) return 1;
  return Math.max(1, Math.min(splitTargets || 1, targetUnits, attackerUnits));
}

export function createTrackedUnitRecord(hp) {
  return { hp, bleed: null };
}

export function createTrackedTeamHealth(count, hp) {
  const frontUnits = [];
  const reserveUnits = [];
  if (count > 0) {
    frontUnits.push(createTrackedUnitRecord(hp));
    for (let i = 1; i < count; i++) reserveUnits.push(createTrackedUnitRecord(hp));
  }
  return { frontUnits, reserveUnits };
}

export function getAllTrackedUnits(team) {
  return [...(team?.frontUnits || []), ...(team?.reserveUnits || [])];
}

export function sumTrackedTeamHp(team) {
  return getAllTrackedUnits(team).reduce((sum, unit) => sum + (unit?.hp || 0), 0);
}

export function syncTrackedTeamState(team) {
  if (!team) return;
  team.units = (team.frontUnits?.length || 0) + (team.reserveUnits?.length || 0);
  team.totalHp = sumTrackedTeamHp(team);
  if (team.units <= 0) {
    team.frontUnits = [];
    team.reserveUnits = [];
    team.totalHp = 0;
  }
}

export function ensureFrontUnitCount(team, desiredCount) {
  if (!team) return;
  desiredCount = Math.max(0, Math.min(desiredCount, team.units || 0));
  team.frontUnits = team.frontUnits || [];
  team.reserveUnits = team.reserveUnits || [];
  while (team.frontUnits.length < desiredCount && team.reserveUnits.length > 0) {
    team.frontUnits.push(team.reserveUnits.shift());
  }
  while (team.frontUnits.length > desiredCount) {
    team.reserveUnits.unshift(team.frontUnits.pop());
  }
  syncTrackedTeamState(team);
}

export function removeTrackedUnitAt(team, laneIndex, fromReserve = false) {
  if (!team) return false;
  if (fromReserve) {
    if (laneIndex < 0 || laneIndex >= (team.reserveUnits?.length || 0)) return false;
    team.reserveUnits.splice(laneIndex, 1);
  } else {
    if (laneIndex < 0 || laneIndex >= (team.frontUnits?.length || 0)) return false;
    if (team.reserveUnits?.length) {
      team.frontUnits[laneIndex] = team.reserveUnits.shift();
    } else {
      team.frontUnits.splice(laneIndex, 1);
    }
  }
  syncTrackedTeamState(team);
  return true;
}

export function applyHpDeltaToTeam(team, delta) {
  if (!team || !delta) return;
  getAllTrackedUnits(team).forEach((unit) => {
    unit.hp = Math.max(1, unit.hp + delta);
  });
  syncTrackedTeamState(team);
}

export function healTrackedTeam(team, totalHeal) {
  if (!team || !(totalHeal > 0) || team.units <= 0) return 0;
  const maxHp = team.stats.hp;
  const damaged = getAllTrackedUnits(team)
    .filter((unit) => unit.hp < maxHp - 0.0001)
    .sort((a, b) => a.hp - b.hp);
  let remaining = totalHeal;
  for (const unit of damaged) {
    if (remaining <= 0) break;
    const missing = maxHp - unit.hp;
    const healed = Math.min(missing, remaining);
    unit.hp += healed;
    remaining -= healed;
  }
  syncTrackedTeamState(team);
  return totalHeal - remaining;
}

export function cloneBleedState(bleed) {
  return bleed ? { ...bleed } : null;
}

export function clonePoisonState(poisons) {
  return poisons ? poisons.map(p => ({ ...p })) : null;
}

export function cloneUnitState(unit) {
  return {
    hp: unit.hp,
    bleed: cloneBleedState(unit.bleed),
    poisons: clonePoisonState(unit.poisons),
  };
}

export function cloneTrackedTeamHealth(team) {
  return {
    frontUnits: (team.frontUnits || []).map((unit) => cloneUnitState(unit)),
    reserveUnits: (team.reserveUnits || []).map((unit) => cloneUnitState(unit)),
  };
}

export function restoreTrackedTeamHealth(team, snapshot) {
  team.frontUnits = snapshot.frontUnits.map((unit) => cloneUnitState(unit));
  team.reserveUnits = snapshot.reserveUnits.map((unit) => cloneUnitState(unit));
  syncTrackedTeamState(team);
}

export function getNextBleedTick(team) {
  let nextTick = Infinity;
  for (const unit of getAllTrackedUnits(team)) {
    const bleed = unit?.bleed;
    if (!bleed) continue;
    if (bleed.nextTickAt <= bleed.expiresAt + 0.0001) {
      nextTick = Math.min(nextTick, bleed.nextTickAt);
    }
  }
  return nextTick;
}

export function applyKipchakBleed(
  attacker,
  target,
  time,
  splitEnabled,
  splitTargets,
  attackerUnitsOverride,
) {
  const bleed = getKipchakBleedProfile(attacker?.unitData);
  if (!bleed || !(bleed.dps > 0) || !(bleed.duration > 0) || target.units <= 0) {
    return 0;
  }
  const attackerUnits =
    attackerUnitsOverride != null ? attackerUnitsOverride : attacker.units;
  const slotCap = getBleedSlotCap(
    target.units,
    attackerUnits,
    splitEnabled,
    splitTargets,
  );
  if (slotCap <= 0) {
    return 0;
  }

  ensureFrontUnitCount(target, slotCap);
  for (let i = 0; i < slotCap; i++) {
    const unit = target.frontUnits[i];
    if (!unit) break;
    if (unit.bleed) {
      unit.bleed.dps = bleed.dps;
      unit.bleed.expiresAt = time + bleed.duration;
      unit.bleed.sourceId = attacker.groupId || attacker.side || "?";
      unit.bleed.sourceSide = attacker.side || null;
    } else {
      unit.bleed = {
        dps: bleed.dps,
        nextTickAt: time + KIPCHAK_TRIPLE_SHOT.tickInterval,
        expiresAt: time + bleed.duration,
        sourceId: attacker.groupId || attacker.side || "?",
        sourceSide: attacker.side || null,
      };
    }
  }
  return slotCap;
}

export function collectBleedTickEvents(target, time, EPSILON) {
  if (!target || target.units <= 0) return [];
  const grouped = new Map();
  const frontUnits = target.frontUnits || [];
  const reserveUnits = target.reserveUnits || [];
  const collectFrom = (units, fromReserve = false) => {
    for (let index = units.length - 1; index >= 0; index--) {
      const unit = units[index];
      const bleed = unit?.bleed;
      if (!bleed) continue;
      if (
        bleed.nextTickAt <= time + EPSILON &&
        bleed.nextTickAt <= bleed.expiresAt + EPSILON
      ) {
        const applied = Math.min(bleed.dps, unit.hp);
        const waste = Math.max(0, bleed.dps - applied);
        unit.hp -= applied;
        const key = `${bleed.sourceSide || "?"}:${bleed.sourceId || "?"}`;
        let unitsDied = 0;
        if (unit.hp <= EPSILON) {
          unitsDied = removeTrackedUnitAt(target, index, fromReserve) ? 1 : 0;
        } else {
          bleed.nextTickAt += KIPCHAK_TRIPLE_SHOT.tickInterval;
          if (
            !(bleed.expiresAt > time + EPSILON) ||
            bleed.nextTickAt > bleed.expiresAt + EPSILON
          ) {
            unit.bleed = null;
          }
        }
        syncTrackedTeamState(target);
        if (!grouped.has(key)) {
          grouped.set(key, {
            sourceId: bleed.sourceId || "?",
            sourceSide: bleed.sourceSide || null,
            damage: 0,
            waste: 0,
            kills: 0,
          });
        }
        const entry = grouped.get(key);
        entry.damage += applied;
        entry.waste += waste;
        entry.kills += unitsDied;
      } else if (
        !(bleed.expiresAt > time + EPSILON) ||
        bleed.nextTickAt > bleed.expiresAt + EPSILON
      ) {
        unit.bleed = null;
      }
    }
  };
  collectFrom(reserveUnits, true);
  collectFrom(frontUnits, false);
  return Array.from(grouped.values()).filter(
    (entry) => entry.damage > 0 || entry.kills > 0,
  );
}

export function applyPoison(attacker, target, time, splitEnabled, splitTargets, attackerUnitsOverride) {
  const poison = attacker?.unitData?.effects?.poisonedArrows;
  if (!poison || !(poison.totalDamage > 0) || !(poison.duration > 0) || target.units <= 0) return 0;
  const attackerUnits = attackerUnitsOverride != null ? attackerUnitsOverride : attacker.units;
  const slotCap = getBleedSlotCap(target.units, attackerUnits, splitEnabled, splitTargets);
  if (slotCap <= 0) return 0;

  const dps = poison.totalDamage / poison.duration;
  const attackerGroupId = attacker.groupId || attacker.side || "?";

  ensureFrontUnitCount(target, slotCap);
  for (let i = 0; i < slotCap; i++) {
    const unit = target.frontUnits[i];
    if (!unit) break;
    if (!unit.poisons) unit.poisons = [];

    // Each attacker unit applies its own poison stack (5 archers = 5 stacks)
    for (let srcIdx = 0; srcIdx < attackerUnits; srcIdx++) {
      const sourceKey = `${attackerGroupId}:${srcIdx}`;
      const existing = unit.poisons.find(p => p.sourceKey === sourceKey);
      if (existing) {
        // Same archer re-hitting: reset timer
        existing.dps = dps;
        existing.expiresAt = time + poison.duration;
        existing.nextTickAt = time + POISON_TICK_INTERVAL;
      } else {
        unit.poisons.push({
          dps,
          nextTickAt: time + POISON_TICK_INTERVAL,
          expiresAt: time + poison.duration,
          sourceKey,
          sourceSide: attacker.side || null,
          sourceId: attackerGroupId,
        });
      }
    }
  }
  return slotCap;
}

export function getNextPoisonTick(team) {
  let nextTick = Infinity;
  for (const unit of getAllTrackedUnits(team)) {
    if (!unit?.poisons) continue;
    for (const p of unit.poisons) {
      if (p.nextTickAt <= p.expiresAt + 0.0001) {
        nextTick = Math.min(nextTick, p.nextTickAt);
      }
    }
  }
  return nextTick;
}

export function collectPoisonTickEvents(target, time, EPSILON) {
  if (!target || target.units <= 0) return [];
  const grouped = new Map();
  const collectFrom = (units, fromReserve = false) => {
    for (let index = units.length - 1; index >= 0; index--) {
      const unit = units[index];
      if (!unit?.poisons) continue;
      for (let pi = unit.poisons.length - 1; pi >= 0; pi--) {
        const p = unit.poisons[pi];
        if (p.nextTickAt <= time + EPSILON && p.nextTickAt <= p.expiresAt + EPSILON) {
          const applied = Math.min(p.dps, unit.hp);
          const waste = Math.max(0, p.dps - applied);
          unit.hp -= applied;
          const key = `${p.sourceSide || "?"}:${p.sourceId || "?"}`;
          let unitsDied = 0;
          if (unit.hp <= EPSILON) {
            unitsDied = removeTrackedUnitAt(target, index, fromReserve) ? 1 : 0;
            // Unit died - no need to process remaining poisons
            syncTrackedTeamState(target);
            if (!grouped.has(key)) {
              grouped.set(key, { sourceId: p.sourceId || "?", sourceSide: p.sourceSide || null, damage: 0, waste: 0, kills: 0 });
            }
            const entry = grouped.get(key);
            entry.damage += applied;
            entry.waste += waste;
            entry.kills += unitsDied;
            break; // unit is dead, stop processing its poisons
          } else {
            p.nextTickAt += POISON_TICK_INTERVAL;
            if (!(p.expiresAt > time + EPSILON) || p.nextTickAt > p.expiresAt + EPSILON) {
              unit.poisons.splice(pi, 1);
            }
          }
          syncTrackedTeamState(target);
          if (!grouped.has(key)) {
            grouped.set(key, { sourceId: p.sourceId || "?", sourceSide: p.sourceSide || null, damage: 0, waste: 0, kills: 0 });
          }
          const entry = grouped.get(key);
          entry.damage += applied;
          entry.waste += waste;
          entry.kills += unitsDied;
        } else if (!(p.expiresAt > time + EPSILON) || p.nextTickAt > p.expiresAt + EPSILON) {
          unit.poisons.splice(pi, 1);
        }
      }
    }
  };
  collectFrom(target.reserveUnits || [], true);
  collectFrom(target.frontUnits || [], false);
  return Array.from(grouped.values()).filter(entry => entry.damage > 0 || entry.kills > 0);
}

export function applyDamageToTeam(team, damage) {
  if (!team || !(damage > 0) || team.units <= 0) return 0;
  ensureFrontUnitCount(team, team.frontUnits?.length || Math.min(1, team.units));
  let kills = 0;
  let remaining = damage;
  while (remaining > 0.0001 && team.units > 0) {
    const target = team.frontUnits[0];
    if (!target) break;
    const applied = Math.min(remaining, target.hp);
    target.hp -= applied;
    remaining -= applied;
    if (target.hp <= 0.0001) {
      target.bleed = null;
      if (removeTrackedUnitAt(team, 0, false)) kills++;
    }
  }
  syncTrackedTeamState(team);
  return kills;
}

export function applyBundledDamageToTeam(
  team,
  totalDamage,
  attackerUnits,
  splitEnabled,
  splitTargets,
  overkillEnabled,
  aoeTargets,
  aoeFalloff,
) {
  if (!team || !(totalDamage > 0) || !(attackerUnits > 0) || team.units <= 0) {
    return { dealt: 0, waste: 0, kills: 0 };
  }
  const laneCount = getBleedSlotCap(
    team.units,
    attackerUnits,
    splitEnabled,
    splitTargets,
  );
  if (laneCount <= 0) return { dealt: 0, waste: 0, kills: 0 };
  const aoeCount = Math.max(1, aoeTargets || 1);
  const totalAoeSlots = laneCount * aoeCount;
  ensureFrontUnitCount(team, totalAoeSlots);
  const bundleDamage = totalDamage / attackerUnits;
  const perLane = Math.floor(attackerUnits / laneCount);
  const extra = attackerUnits % laneCount;
  let dealt = 0;
  let waste = 0;
  let kills = 0;

  for (let lane = laneCount - 1; lane >= 0; lane--) {
    const bundleCount = perLane + (lane < extra ? 1 : 0);
    for (let i = 0; i < bundleCount; i++) {
      // Apply damage to primary lane target
      let remaining = bundleDamage;
      while (remaining > 0.0001) {
        const target = team.frontUnits[lane];
        if (!target) {
          if (overkillEnabled) waste += remaining;
          remaining = 0;
          break;
        }
        const applied = Math.min(remaining, target.hp);
        target.hp -= applied;
        dealt += applied;
        remaining -= applied;
        if (target.hp <= 0.0001) {
          target.bleed = null;
          if (removeTrackedUnitAt(team, lane, false)) kills++;
          if (overkillEnabled) {
            waste += remaining;
            remaining = 0;
          }
        } else {
          if (overkillEnabled) {
            waste += remaining;
            remaining = 0;
          }
        }
      }
      // AoE: apply damage to additional front units beyond the primary lane
      if (aoeCount > 1) {
        for (let a = 0; a < aoeCount - 1; a++) {
          let aoeIdx = laneCount + lane * (aoeCount - 1) + a;
          if (aoeIdx >= team.frontUnits.length && team.frontUnits.length > 0) {
            aoeIdx = aoeIdx % team.frontUnits.length;
          }
          // For falloff: linearly decrease damage per additional target
          const falloffMult = aoeFalloff
            ? Math.max(0, 1 - (a + 1) / aoeCount)
            : 1;
          let aoeDmg = bundleDamage * falloffMult;
          const aoeTarget = team.frontUnits[aoeIdx];
          if (!aoeTarget || aoeDmg <= 0.0001) continue;
          const applied = Math.min(aoeDmg, aoeTarget.hp);
          aoeTarget.hp -= applied;
          dealt += applied;
          if (aoeTarget.hp <= 0.0001) {
            aoeTarget.bleed = null;
            if (removeTrackedUnitAt(team, aoeIdx, false)) kills++;
          }
        }
      }
    }
  }
  syncTrackedTeamState(team);
  return { dealt, waste, kills };
}

export function setTrackedTeamHpPerUnit(team, newHp) {
  if (!team || !Number.isFinite(newHp)) return;
  const oldHp = team.stats.hp;
  if (Math.abs(newHp - oldHp) <= 0.0001) return;
  applyHpDeltaToTeam(team, newHp - oldHp);
  team.stats.hp = newHp;
  syncTrackedTeamState(team);
}
