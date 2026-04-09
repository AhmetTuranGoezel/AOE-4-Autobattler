// ========================================
// Pure combat math functions (no DOM dependencies)
// ========================================

export const SIMULTANEOUS_WEAPON_UNITS = new Set([
  "War Elephant",
  "Tower Elephant",
  "Sultans Tower Elephant",
]);

export function hasWeaponAtAge(weapon, age) {
  return !!(weapon && weapon.ages && weapon.ages[age]);
}

export function getWeaponProjectiles(weapon) {
  return Math.max(1, parseInt(weapon?.projectiles, 10) || 1);
}

export function getWeaponDisplayName(weapon) {
  if (!weapon) return "Attack";
  if (weapon.name) return weapon.name;
  return weapon.type === "ranged" ? "Ranged" : "Melee";
}

export function getWeaponInfoText(weapon, ageStats) {
  if (!weapon) return "";
  const attack = ageStats?.attack || 0;
  const projectileText =
    getWeaponProjectiles(weapon) > 1
      ? `${attack} x${getWeaponProjectiles(weapon)}`
      : `${attack}`;
  return `${getWeaponDisplayName(weapon)}: ${projectileText} atk, ${weapon.attackSpeed}s`;
}

export function unitHasSecondaryWeapon(unit, age) {
  return hasWeaponAtAge(unit?.weapons?.secondary, age);
}

export function unitSupportsBothWeapons(unitName, unit, age) {
  return unitHasSecondaryWeapon(unit, age) &&
    SIMULTANEOUS_WEAPON_UNITS.has(unitName);
}

export function getWeaponModeOptionState(unitName, unit, age) {
  const hasSecondary = unitHasSecondaryWeapon(unit, age);
  const supportsBoth = unitSupportsBothWeapons(unitName, unit, age);
  return { hasSecondary, supportsBoth };
}

export function getAttackLogLabel(unitData, firedPrimary, firedSecondary) {
  const primaryLabel = unitData.weaponLabel || "Attack";
  const secondaryLabel = unitData.secondaryWeapon?.name || "Secondary";
  if (firedPrimary && firedSecondary) {
    return `${primaryLabel} + ${secondaryLabel}`;
  }
  if (firedPrimary) return primaryLabel;
  if (firedSecondary) return secondaryLabel;
  return "—";
}

export function applyBuffs(unitData, time) {
  let hp = unitData.stats.hp;
  let attack = unitData.stats.attack;
  let attackSpeed = unitData.stats.attackSpeed;
  let meleeArmor = unitData.stats.meleeArmor;
  let rangedArmor = unitData.stats.rangedArmor;

  if (unitData.buffs.hpAbsDur === 0 || time < unitData.buffs.hpAbsDur) {
    hp += unitData.buffs.hpAbs;
  }

  if (unitData.buffs.hpPctDur === 0 || time < unitData.buffs.hpPctDur) {
    hp *= 1 + unitData.buffs.hpPct / 100;
  }

  if (unitData.buffs.attackAbsDur === 0 || time < unitData.buffs.attackAbsDur) {
    attack += unitData.buffs.attackAbs;
  }

  if (unitData.buffs.attackPctDur === 0 || time < unitData.buffs.attackPctDur) {
    attack *= 1 + unitData.buffs.attackPct / 100;
  }

  if (unitData.buffs.speedPctDur === 0 || time < unitData.buffs.speedPctDur) {
    attackSpeed /= 1 + unitData.buffs.speedPct / 100;
  }

  if (unitData.buffs.armorDur === 0 || time < unitData.buffs.armorDur) {
    meleeArmor += unitData.buffs.meleeArmor;
    rangedArmor += unitData.buffs.rangedArmor;
  }

  return { hp, attack, attackSpeed, meleeArmor, rangedArmor, rangedResistance: unitData.stats.rangedResistance || 0 };
}

export function calcEffectiveAttackSpeed(unit, baseAttackSpeed, time, team) {
  const EPS = 0.0001;
  let atkSpeed = baseAttackSpeed;
  const fx = unit.effects;

  if (fx.arrowVolley && time <= fx.arrowVolley.duration + EPS) {
    atkSpeed /= 1 + fx.arrowVolley.atkSpeedBonus / 100;
  }
  if (fx.fortitude && time <= fx.fortitude.duration + EPS) {
    atkSpeed /= 1 + fx.fortitude.atkSpeedBonus / 100;
  }
  if (fx.staticDeployment && time >= fx.staticDeployment.delay - EPS) {
    atkSpeed /= 1 + fx.staticDeployment.atkSpeedBonus / 100;
  }
  if (fx.shieldWall) {
    atkSpeed /= 1 - fx.shieldWall.atkSpeedPenalty / 100;
  }
  if (team && team.atkSpeedDebuffUntil >= time - EPS) {
    atkSpeed /= 1 - team.atkSpeedDebuffReduction / 100;
  }
  return atkSpeed;
}

export function calcEffectiveAttack(unit, baseAttack, time, team) {
  const EPS = 0.0001;
  let atk = baseAttack;
  const fx = unit.effects;
  if (fx.berserking && time <= fx.berserking.duration + EPS) {
    atk += fx.berserking.attackBonus;
  }
  if (fx.triumph && time <= fx.triumph.duration + EPS) {
    atk += fx.triumph.attackBonus;
  }
  if (team && team.gloryBonusAtk) {
    atk += team.gloryBonusAtk;
  }
  return atk;
}

export function calcEffectiveArmor(
  unit,
  baseMeleeArmor,
  baseRangedArmor,
  time,
  enemyEffects,
) {
  const EPS = 0.0001;
  let mArmor = baseMeleeArmor;
  let rArmor = baseRangedArmor;
  const fx = unit.effects;
  if (fx.berserking && time <= fx.berserking.duration + EPS) {
    mArmor -= fx.berserking.armorPenalty;
    rArmor -= fx.berserking.armorPenalty;
  }
  if (fx.deployPavise && time <= fx.deployPavise.duration + EPS) {
    rArmor += fx.deployPavise.armorBonus;
  }
  if (fx.armorAura) {
    mArmor += fx.armorAura.armorBonus;
    rArmor += fx.armorAura.armorBonus;
  }
  if (enemyEffects && enemyEffects.armorDebuffAura) {
    mArmor -= enemyEffects.armorDebuffAura.armorReduction;
    rArmor -= enemyEffects.armorDebuffAura.armorReduction;
  }
  return { meleeArmor: mArmor, rangedArmor: rArmor };
}

export function calcWeaponDamage(
  weaponType,
  weaponAttack,
  weaponBonus,
  enemyTags,
  enemyStats,
  armorPen = 0,
  damageMultiplier = 1,
) {
  let damage = weaponAttack;

  for (let tag of enemyTags) {
    if (weaponBonus && weaponBonus[tag]) {
      damage += weaponBonus[tag];
    }
  }

  damage *= damageMultiplier;

  // Apply ranged resistance (percentage reduction, before armor)
  if (weaponType === "ranged" && enemyStats.rangedResistance) {
    damage *= 1 - enemyStats.rangedResistance / 100;
  }

  let armor =
    weaponType === "ranged" ? enemyStats.rangedArmor : enemyStats.meleeArmor;
  armor = Math.max(0, armor - armorPen);

  return Math.max(1, damage - armor);
}

export function calcDirectDamageAfterArmor(baseDamage, armor = 0, damageMultiplier = 1) {
  const effectiveArmor = Math.max(0, armor || 0);
  return Math.max(1, baseDamage * damageMultiplier - effectiveArmor);
}

export function getCamelUneaseDamageMultiplier(attackerTags = [], defenderEffects = {}) {
  if (!defenderEffects?.camelUnease) return 1;
  if (!Array.isArray(attackerTags) || !attackerTags.includes("Cavalry")) return 1;
  return Math.max(0, 1 - defenderEffects.camelUnease.reduction / 100);
}
