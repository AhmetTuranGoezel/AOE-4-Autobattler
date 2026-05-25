// ========================================
// Multi-battle simulation logic (pure functions, no DOM dependencies)
// ========================================
import {
  SIMULTANEOUS_WEAPON_UNITS,
  applyBuffs,
  calcEffectiveAttackSpeed,
  calcEffectiveAttack,
  calcEffectiveArmor,
  calcWeaponDamage,
  calcDirectDamageAfterArmor,
  getCamelUneaseDamageMultiplier,
  getAttackLogLabel,
} from "../shared/combat.js";
import { KIPCHAK_TRIPLE_SHOT } from "../shared/combat-data.js";
import {
  hasKipchakTripleShot,
  createTrackedTeamHealth,
  getAllTrackedUnits,
  syncTrackedTeamState,
  applyHpDeltaToTeam,
  getNextBleedTick,
  applyKipchakBleed,
  collectBleedTickEvents,
  applyPoison,
  getNextPoisonTick,
  collectPoisonTickEvents,
  applyBundledDamageToTeam,
  setTrackedTeamHpPerUnit,
} from "../shared/health-tracking.js";

export function createTeamState(group) {
  const unitData = group.unitData;
  const stats = applyBuffs(unitData, 0);
  const tracked = createTrackedTeamHealth(unitData.count, stats.hp);
  const team = {
    groupId: group.id,
    side: group.side,
    unitData,
    units: unitData.count,
    totalHp: 0,
    stats,
    originalStats: unitData.stats,
    nextPrimaryAttack: 0,
    nextSecondaryAttack: unitData.secondaryWeapon ? 0 : Infinity,
    tags: unitData.tags,
    hasCharged: false,
    chargeTime: -Infinity,
    hasBlocked: false,
    trampleTick: unitData.effects.trample ? 0 : Infinity,
    trampleActive: false,
    trampleEnd: -1,
    numeriDebuffEnd: -1,
    frontUnits: tracked.frontUnits,
    reserveUnits: tracked.reserveUnits,
    closingDelay: 0,
    currentTargetId: null,
    baseHp: stats.hp,
    gloryBonusHp: 0,
    gloryBonusAtk: 0,
  };

  if (unitData.effects.brotherhoodHP) {
    team.stats.hp =
      team.baseHp + unitData.effects.brotherhoodHP.hpPerUnit * (team.units - 1);
  }
  if (Math.abs(team.stats.hp - team.baseHp) > 0.0001) {
    applyHpDeltaToTeam(team, team.stats.hp - team.baseHp);
  }
  syncTrackedTeamState(team);
  return team;
}

export function pickNextTarget(team, enemyTeams) {
  const alive = enemyTeams.filter((t) => t.units > 0).map((t) => t.groupId);
  const priority = team.unitData.targetPriority || [];
  for (const id of priority) {
    if (alive.includes(id)) return id;
  }
  return alive[0] || null;
}

export function computeClosingDelay(attacker, defender) {
  const aIsCavalry =
    attacker.tags.includes("Cavalry") && attacker.unitData.chargeDamage > 0;
  const bIsCavalry =
    defender.tags.includes("Cavalry") && defender.unitData.chargeDamage > 0;
  const effectiveRangeA =
    (attacker.unitData.effects.spearwall ||
      attacker.unitData.effects.palings) &&
    bIsCavalry
      ? Math.max(attacker.unitData.weaponRange, 1.04)
      : attacker.unitData.weaponRange;
  const effectiveRangeB =
    (defender.unitData.effects.spearwall ||
      defender.unitData.effects.palings) &&
    aIsCavalry
      ? Math.max(defender.unitData.weaponRange, 1.04)
      : defender.unitData.weaponRange;
  const speedA = attacker.unitData.effects.movementBurst
    ? attacker.unitData.speed *
      (1 + attacker.unitData.effects.movementBurst.speedBonus / 100)
    : attacker.unitData.speed;
  if (effectiveRangeB > effectiveRangeA) {
    return (effectiveRangeB - effectiveRangeA) / speedA;
  }
  return 0;
}

export function applyBattleGlory(team, kills) {
  if (!team.unitData.effects.battleGlory || kills <= 0 || team.units <= 0)
    return;
  const bg = team.unitData.effects.battleGlory;
  team.gloryBonusHp = (team.gloryBonusHp || 0) + bg.hpPerKill * kills;
  team.gloryBonusAtk = (team.gloryBonusAtk || 0) + bg.attackPerKill * kills;
  setTrackedTeamHpPerUnit(team, team.baseHp + team.gloryBonusHp);
}

export function applyOpeningAttacks(attackerTeams, teamById, battleLog) {
  attackerTeams.forEach((attacker) => {
    if (!attacker.unitData.effects.openingAttack || attacker.units <= 0) return;
    const targetId = attacker.currentTargetId;
    const defender = teamById[targetId];
    if (!defender || defender.units <= 0) return;
    const oa = attacker.unitData.effects.openingAttack;
    const armor = defender.stats.rangedArmor || 0;
    const camelMultiplier = getCamelUneaseDamageMultiplier(
      attacker.tags,
      defender.unitData.effects,
    );
    const dmgPerUnit = calcDirectDamageAfterArmor(
      oa.damage,
      armor,
      camelMultiplier,
    );
    const totalDmg = dmgPerUnit * attacker.units;
    const result = applyBundledDamageToTeam(
      defender,
      totalDmg,
      attacker.units,
      false,
      1,
      false,
    );
    battleLog.push({
      time: "Pre",
      attacker: attacker.groupId,
      attackerId: attacker.groupId,
      attackerSide: attacker.side,
      target: defender.groupId,
      weapon: "Opening",
      dmg: result.dealt.toFixed(1),
      waste: result.waste.toFixed(1),
      atkUnits: attacker.units,
      tgtUnits: defender.units,
      unitsDied: result.kills,
      killsA: attacker.side === "A" ? result.kills : 0,
      killsB: attacker.side === "B" ? result.kills : 0,
      notes: attacker.unitData.name,
    });
  });
}

export function formatSeconds(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString();
}

export function applyAntiCavEffects(allTeams, teamById, battleLog) {
  allTeams.forEach((attacker) => {
    const target = teamById[attacker.currentTargetId];
    if (!target) return;
    if (!attacker.tags.includes("Cavalry")) return;
    const palings = target.unitData.effects.palings;
    const spearwall = target.unitData.effects.spearwall;
    if (palings) {
      attacker.nextPrimaryAttack = Math.max(
        attacker.nextPrimaryAttack,
        palings.stunDuration,
      );
      attacker.unitData.chargeDamage = 0;
      const totalDmg = palings.damage * target.units;
      const result = applyBundledDamageToTeam(
        attacker,
        totalDmg,
        target.units,
        false,
        1,
        false,
      );
      if (battleLog) {
        battleLog.push({
          time: "Pre",
          attacker: target.groupId,
          attackerId: target.groupId,
          attackerSide: target.side,
          target: attacker.groupId,
          weapon: "Palings",
          dmg: result.dealt.toFixed(1),
          waste: result.waste.toFixed(1),
          atkUnits: target.units,
          tgtUnits: attacker.units,
          unitsDied: result.kills,
          killsA: target.side === "A" ? result.kills : 0,
          killsB: target.side === "B" ? result.kills : 0,
          notes: `Stun ${formatSeconds(palings.stunDuration)}s`,
        });
      }
    } else if (spearwall) {
      attacker.nextPrimaryAttack = Math.max(
        attacker.nextPrimaryAttack,
        spearwall.stunDuration,
      );
      attacker.unitData.chargeDamage = 0;
      if (battleLog) {
        battleLog.push({
          time: "Pre",
          attacker: target.groupId,
          attackerId: target.groupId,
          attackerSide: target.side,
          target: attacker.groupId,
          weapon: "Spearwall",
          dmg: "0.0",
          waste: "0.0",
          atkUnits: target.units,
          tgtUnits: attacker.units,
          unitsDied: 0,
          killsA: 0,
          killsB: 0,
          notes: `Stun ${formatSeconds(spearwall.stunDuration)}s`,
        });
      }
    }
  });
}

export function computeTeamAttack(attacker, target, time, config) {
  const { splitEnabled, splitTargets, EPSILON } = config;
  const unitA = attacker.unitData;
  const unitB = target.unitData;

  let damageToB = 0;
  let logNotes = [];
  let firedPrimary = false;
  let firedSecondary = false;
  let canApplyBleed = false;
  let appliesAtkSpeedDebuff = false;
  let appliesDamageDebuff = false;
  const isSimultaneous = SIMULTANEOUS_WEAPON_UNITS.has(unitA.name);
  let mPrimaryDmg = 0, mSecondaryDmg = 0;
  let mAoeTargets = 1, mAoeFalloff = false;

  const atkSpeedA = calcEffectiveAttackSpeed(
    unitA,
    attacker.stats.attackSpeed,
    time,
    attacker,
  );
  const camelUneaseMultiplier = getCamelUneaseDamageMultiplier(
    attacker.tags,
    unitB.effects,
  );
  const armorB = calcEffectiveArmor(
    unitB,
    target.stats.meleeArmor,
    target.stats.rangedArmor,
    time,
    unitA.effects,
  );
  const effectiveStatsB = { ...target.stats, ...armorB };

  if (attacker.nextPrimaryAttack <= time + EPSILON && attacker.units > 0) {
    let attackValue = calcEffectiveAttack(
      unitA,
      attacker.stats.attack,
      time,
      attacker,
    );
    if (!attacker.hasCharged && unitA.chargeDamage > 0) {
      attackValue += unitA.chargeDamage;
      attacker.hasCharged = true;
      attacker.chargeTime = time;
    }
    const pcBuff = unitA.effects.postChargeAttackBuff;
    if (
      pcBuff &&
      attacker.hasCharged &&
      time <= attacker.chargeTime + pcBuff.duration + EPSILON &&
      time > attacker.chargeTime + EPSILON
    ) {
      attackValue += pcBuff.value;
    }
    const armorPenA = unitA.effects.armorPenetration
      ? unitA.effects.armorPenetration.penetration
      : 0;
    const dmg = calcWeaponDamage(
      unitA.weaponType,
      attackValue,
      attacker.originalStats.bonus,
      target.tags,
      effectiveStatsB,
      armorPenA,
      camelUneaseMultiplier,
    );
    mAoeTargets = 1;
    mAoeFalloff = false;
    if (unitA.effects.aoeSplash) {
      mAoeTargets = Math.min(unitA.effects.aoeSplash.unitsHit, target.units);
    } else if (unitA.effects.aoeFalloff) {
      mAoeTargets = Math.min(unitA.effects.aoeFalloff.unitsHit, target.units);
      mAoeFalloff = true;
    }
    let primaryDamage =
      dmg * attacker.units * (unitA.weaponProjectiles || 1);
    if (hasKipchakTripleShot(unitA)) {
      const extraArrowDmg = calcWeaponDamage(
        unitA.weaponType,
        attackValue,
        attacker.originalStats.bonus,
        target.tags,
        effectiveStatsB,
        armorPenA,
        camelUneaseMultiplier * KIPCHAK_TRIPLE_SHOT.damageMultiplier,
      );
      primaryDamage +=
        extraArrowDmg * attacker.units * KIPCHAK_TRIPLE_SHOT.extraArrows;
      logNotes.push("Triple Shot");
    }
    if (isSimultaneous) mPrimaryDmg += primaryDamage;
    damageToB += primaryDamage;
    attacker.nextPrimaryAttack = time + atkSpeedA;
    firedPrimary = true;
    canApplyBleed = true;
    if (
      unitA.chargeDamage > 0 &&
      (!attacker.hasCharged || time <= attacker.chargeTime + EPSILON)
    )
      logNotes.push("Charge");
    if (unitA.effects.aoeSplash && mAoeTargets > 1)
      logNotes.push(`AoE×${mAoeTargets}`);
    if (unitA.effects.aoeFalloff && mAoeTargets > 1)
      logNotes.push(`AoE×${mAoeTargets}(falloff)`);
    appliesAtkSpeedDebuff = !!unitA.effects.atkSpeedDebuff;
    appliesDamageDebuff =
      !!unitA.effects.dmgDebuffOnHit &&
      (!unitA.effects.dmgDebuffOnHit.cavalryOnly ||
        target.tags.includes("Cavalry"));
  }

  if (
    attacker.unitData.secondaryWeapon &&
    attacker.nextSecondaryAttack <= time + EPSILON &&
    attacker.units > 0
  ) {
    const sec = attacker.unitData.secondaryWeapon;
    const armorPenA2 = unitA.effects.armorPenetration
      ? unitA.effects.armorPenetration.penetration
      : 0;
    // Apply attack buff delta to secondary weapon only if same type as primary
    const atkBuffDeltaM = (sec.type === unitA.weaponType) ? (attacker.stats.attack - unitA.stats.attack) : 0;
    const secAttackM = (sec.stats.attack || 0) + atkBuffDeltaM;
    const dmg = calcWeaponDamage(
      sec.type,
      secAttackM,
      sec.stats.bonus || {},
      target.tags,
      effectiveStatsB,
      armorPenA2,
      camelUneaseMultiplier,
    );
    const secDmgM = dmg * attacker.units * (sec.projectiles || 1);
    if (isSimultaneous) mSecondaryDmg += secDmgM;
    damageToB += secDmgM;
    const secSpeedM = isSimultaneous ? sec.attackSpeed * (atkSpeedA / attacker.stats.attackSpeed) : sec.attackSpeed;
    attacker.nextSecondaryAttack = time + secSpeedM;
    firedSecondary = true;
  }

  // Trample ticks
  if (
    unitA.effects.trample &&
    attacker.trampleTick <= time + EPSILON &&
    attacker.units > 0
  ) {
    const t = unitA.effects.trample;
    if (!attacker.trampleActive) {
      attacker.trampleActive = true;
      attacker.trampleEnd = time + t.duration;
      // Trample delays normal attacks by its duration
      attacker.nextPrimaryAttack = Math.max(attacker.nextPrimaryAttack, attacker.trampleEnd);
      if (attacker.nextSecondaryAttack !== Infinity)
        attacker.nextSecondaryAttack = Math.max(attacker.nextSecondaryAttack, attacker.trampleEnd);
    }
    const tickDmg = t.dps * 0.5 * camelUneaseMultiplier;
    const targets = Math.min(t.unitsHit || 1, target.units);
    damageToB += tickDmg * attacker.units * targets;
    // Numeri: trampled enemies take +dmgIncrease% from all sources
    if (unitA.effects.numeri) {
      target.numeriDebuffEnd = time + unitA.effects.numeri.duration;
    }
    if (time + 0.5 < attacker.trampleEnd - EPSILON) {
      attacker.trampleTick = time + 0.5;
    } else {
      attacker.trampleActive = false;
      attacker.trampleTick = attacker.trampleEnd + t.cooldown;
    }
    logNotes.push("Trample");
  }

  // Numeri debuff: amplify all damage to debuffed target
  if (target.numeriDebuffEnd > time + EPSILON && damageToB > 0) {
    const numeriPct = unitA.effects.numeri ? unitA.effects.numeri.dmgIncrease : 15;
    damageToB *= (1 + numeriPct / 100);
    logNotes.push("Numeri");
  }

  // Defender-based reductions
  if (
    target.unitData.effects.gunpowderResistance &&
    (attacker.tags.includes("Gunpowder") ||
      attacker.tags.includes("Light Gunpowder"))
  ) {
    damageToB *=
      1 - target.unitData.effects.gunpowderResistance.reduction / 100;
  }
  if (
    target.unitData.effects.fortitude &&
    time <= target.unitData.effects.fortitude.duration + EPSILON &&
    unitA.weaponType === "melee"
  ) {
    damageToB *= 1 + target.unitData.effects.fortitude.dmgTakenIncrease / 100;
  }
  if (target.unitData.effects.shieldWall && unitA.weaponType === "ranged") {
    damageToB *=
      1 - target.unitData.effects.shieldWall.rangedDmgReduction / 100;
  }
  if (attacker.dmgDebuffUntil && attacker.dmgDebuffUntil > time) {
    damageToB *= 1 - attacker.dmgDebuffReduction / 100;
  }

  if (
    target.unitData.effects.deflectiveArmor &&
    !target.hasBlocked &&
    damageToB > 0
  ) {
    damageToB = 0;
    target.hasBlocked = true;
    logNotes.push("Blocked");
  }

  if (unitA.effects.percentDamage && damageToB > 0) {
    damageToB +=
      (unitA.effects.percentDamage.percent / 100) *
      target.stats.hp *
      attacker.units;
    logNotes.push("%HP");
  }
  if (unitA.effects.armorPenetration && (firedPrimary || firedSecondary))
    logNotes.push("ArmorPen");
  if (unitA.effects.atkSpeedDebuff && firedPrimary) logNotes.push("Slow");
  if (appliesDamageDebuff && (firedPrimary || firedSecondary))
    logNotes.push("Weaken");
  if (
    attacker.dmgDebuffUntil &&
    attacker.dmgDebuffUntil > time &&
    (firedPrimary || firedSecondary)
  )
    logNotes.push("Weakened");
  if (
    unitA.effects.berserking &&
    time <= unitA.effects.berserking.duration + EPSILON
  )
    logNotes.push("Berserk");
  if (unitA.effects.shieldWall) logNotes.push("ShieldWall");
  if (unitA.effects.camelUnease && target.tags.includes("Cavalry"))
    logNotes.push("CamelUnease");
  if (
    unitA.effects.gunpowderResistance &&
    (target.tags.includes("Gunpowder") ||
      target.tags.includes("Light Gunpowder"))
  )
    logNotes.push("GunpowderRes");
  if (unitA.effects.armorDebuffAura) logNotes.push("-Armor");
  if (
    unitA.effects.movementBurst &&
    time <= unitA.effects.movementBurst.duration + EPSILON
  )
    logNotes.push("SpeedBurst");
  if (unitA.effects.infantrySpeedAura) logNotes.push("FarimaAura");
  if (unitA.effects.triumph && time <= unitA.effects.triumph.duration + EPSILON)
    logNotes.push("Triumph");

  // Simultaneous weapon damage breakdown in log notes
  if (isSimultaneous && firedPrimary && firedSecondary) {
    const pLabel = unitA.weaponLabel || "Primary";
    const sLabel = unitA.secondaryWeapon?.name || "Secondary";
    logNotes.push(`${pLabel}:${mPrimaryDmg.toFixed(1)} ${sLabel}:${mSecondaryDmg.toFixed(1)}`);
  }

  const weapon = getAttackLogLabel(unitA, firedPrimary, firedSecondary);
  const log =
    firedPrimary ||
    firedSecondary ||
    (unitA.effects.trample && attacker.trampleActive)
      ? {
          time: time.toFixed(2),
          attacker: attacker.groupId,
          attackerId: attacker.groupId,
          attackerSide: attacker.side,
          target: target.groupId,
          weapon,
          dmg: damageToB.toFixed(1),
          waste: "0.0",
          atkUnits: attacker.units,
          tgtUnits: target.units,
          killsA: 0,
          killsB: 0,
          notes: logNotes.join(", "),
        }
      : null;

  return {
    damage: damageToB,
    log,
    appliesBleed: canApplyBleed && !!unitA.effects.bleed && damageToB > 0,
    appliesPoison: !!unitA.effects.poisonedArrows && damageToB > 0,
    splitEnabled,
    splitTargets,
    appliesAtkSpeedDebuff,
    appliesDamageDebuff,
    // Simultaneous weapon split: primary (tusks) applied before secondary (spear)
    isSimultaneous: isSimultaneous && firedPrimary && firedSecondary,
    primaryDamage: mPrimaryDmg,
    secondaryDamage: mSecondaryDmg,
    // AoE: pass to damage application (only applies to primary weapon)
    aoeTargets: firedPrimary ? mAoeTargets : 1,
    aoeFalloff: mAoeFalloff,
  };
}
