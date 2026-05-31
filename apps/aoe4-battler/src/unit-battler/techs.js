// ========================================
// GLOBAL TECH / UPGRADE RULES
// ========================================
// This lets us define generic technologies (like Military Academy
// and Increased Supplies) once, instead of copying them onto every
// single unit in the JSON. Units only need their unique stuff; the
// generic techs are attached at runtime based on tags/civs.

export const GLOBAL_UPGRADE_TECHS = [
  // --- Military Academy / Increased Supplies (creation speed) ---
  {
    id: "militaryAcademy",
    name: "Military Academy",
    description:
      "+33% production speed for infantry, cavalry, siege and transport units at buildings (equivalent to -25% training time).",
    category: "creationSpeed",
    // Available to all civilizations except Ottomans (blacksmith/uni influence)
    // and Golden Horde (Increased Supplies instead).
    exceptCivs: ["Ottomans", "Golden Horde"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const relevantTags = ["Infantry", "Cavalry", "Siege", "Transport"];
      return tags.some((t) => relevantTags.includes(t));
    },
  },
  {
    id: "increasedSupplies",
    name: "Increased Supplies",
    description:
      "+50% production speed for infantry, cavalry, siege and transport units.",
    category: "creationSpeed",
    civs: ["Golden Horde"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const relevantTags = ["Infantry", "Cavalry", "Siege", "Transport"];
      return tags.some((t) => relevantTags.includes(t));
    },
  },
  {
    id: "eliteArmyTacticsHp",
    name: "Elite Army Tactics",
    description: "+15% hit points for infantry.",
    category: "hitpoints",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
  {
    id: "eliteArmyTacticsAttack",
    name: "Elite Army Tactics",
    description: "+15% attack for infantry.",
    category: "attack",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
  {
    id: "improvedEliteArmyTacticsHp",
    name: "Improved Elite Army Tactics",
    description: "+5% more hit points (stacks for +20% total), Mongols.",
    category: "hitpoints",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
  {
    id: "improvedEliteArmyTacticsAttack",
    name: "Improved Elite Army Tactics",
    description: "+5% more attack (stacks for +20% total), Mongols.",
    category: "attack",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
];

// Names of techs that are driven by GLOBAL_UPGRADE_TECHS instead of per-unit copies
export const GLOBAL_UPGRADE_TECH_NAMES = new Set([
  ...GLOBAL_UPGRADE_TECHS.map((t) => t.name),
]);

const SIEGE_HP_TIER_LABELS = [
  "Tier 1 (+5%)",
  "Tier 2 (+10%)",
  "Tier 3 (+15%)",
  "Tier 4 (+20%)",
  "Tier 5 (+25%)",
  "Tier 6 (+30%)",
];

const ALL_WORKSHOP_SIEGE_UNITS = [
  "Battering Ram",
  "Bed Crossbow",
  "Springald",
  "Mangonel",
  "Counterweight Trebuchet",
  "Bombard",
  "Ribauldequin",
  "Culverin",
  "Cheirosiphon",
  "Nest of Bees",
  "Traction Trebuchet",
  "Cannon",
  "Great Bombard",
];

const TRUE_BUILDING_SIEGE_UNITS = [
  "Battering Ram",
  "Cheirosiphon",
  "Counterweight Trebuchet",
  "Traction Trebuchet",
  "Bombard",
  "Cannon",
  "Culverin",
  "Great Bombard",
];

const JIN_NATIVE_UNITS = new Set([
  "Bed Crossbow",
  "Emissary",
  "Eruptor",
  "Iron Pagoda",
  "Meng'an Mouke Defender",
  "Mohe Tribesman",
  "Mounted Grenadier",
  "Mounted Villager",
  "Reindeer Trader",
  "Zhanma Swordsman",
]);

const SIEGE_RUNTIME_UPGRADE_TECHS = [
  {
    name: "Siege Works",
    description: "+20% hit points for siege engines.",
    category: "hitpoints",
    unitNames: ALL_WORKSHOP_SIEGE_UNITS,
    exceptCivs: ["Macedonian Dynasty"],
  },
  {
    name: "Iron Fittings",
    description:
      "+5% hit points per research tier for siege engines, up to +30%, Macedonian Dynasty.",
    category: "hitpoints",
    unitNames: ALL_WORKSHOP_SIEGE_UNITS,
    civs: ["Macedonian Dynasty"],
  },
  {
    name: "Greased Axles",
    description: "+15% movement speed for siege engines.",
    category: "moveSpeed",
    unitNames: ALL_WORKSHOP_SIEGE_UNITS,
    exceptCivs: ["Jin Dynasty"],
  },
  {
    name: "Lightweight Beams",
    description:
      "+20% attack speed and +100% field construction speed for Battering Rams and Cheirosiphons.",
    category: "attackSpeed",
    unitNames: ["Battering Ram", "Cheirosiphon"],
  },
  {
    name: "Siege Carpentry",
    description:
      "Grants Structural Reinforcements, an active defensive ability for Ayyubid siege.",
    category: "hitpoints",
    unitNames: TRUE_BUILDING_SIEGE_UNITS,
    civs: ["Ayyubids"],
  },
  {
    name: "Wandering Town",
    description:
      "+25% attack and 2 HP/s in combat for Battering Rams, Rus.",
    category: "attack",
    unitNames: ["Battering Ram"],
    civs: ["Rus"],
  },
  {
    name: "Beachhead",
    description:
      "Unlocks the Beachhead Ram stance for Golden Horde Battering Rams.",
    category: "armor",
    unitNames: ["Battering Ram"],
    civs: ["Golden Horde"],
  },
  {
    name: "Roller Shutter Triggers",
    description:
      "Springalds +25% attack speed and +10% ranged resistance.",
    category: "attackSpeed",
    unitNames: ["Springald"],
    exceptCivs: ["Tughlaq Dynasty"],
  },
  {
    name: "Roman Fire",
    description:
      "Springalds +15% attack speed and leave Greek Fire after impact, Macedonian Dynasty.",
    category: "attackSpeed",
    unitNames: ["Springald"],
    civs: ["Macedonian Dynasty"],
  },
  {
    name: "Adjustable Crossbars",
    description:
      "Mangonels gain +1 range, +1 projectile, and +75% splash radius.",
    category: "attack",
    unitNames: ["Mangonel"],
    exceptCivs: ["Chinese", "Zhu Xi's Legacy"],
  },
  {
    name: "Additional Barrels",
    description: "Nest of Bees +3 rockets per volley.",
    category: "attack",
    unitNames: ["Nest of Bees"],
    civs: ["Chinese", "Zhu Xi's Legacy"],
  },
  {
    name: "Geometry",
    description: "+20% damage for trebuchets.",
    category: "attack",
    unitNames: ["Counterweight Trebuchet", "Traction Trebuchet"],
    exceptCivs: ["Byzantines", "Macedonian Dynasty", "Jin Dynasty"],
  },
  {
    name: "Greek Fire Projectiles",
    description:
      "Counterweight Trebuchets +30% damage and leave lingering Greek Fire, Byzantines and Macedonian Dynasty.",
    category: "attack",
    unitNames: ["Counterweight Trebuchet"],
    civs: ["Byzantines", "Macedonian Dynasty"],
  },
  {
    name: "Warwolf Trebuchet",
    description:
      "Counterweight Trebuchets +2 range and +50% hit points, House of Lancaster.",
    category: "hitpoints",
    unitNames: ["Counterweight Trebuchet"],
    civs: ["House of Lancaster"],
  },
  {
    name: "Counterweight Defenses",
    description:
      "Trebuchets +1 projectile, Knights Templar.",
    category: "attack",
    unitNames: ["Counterweight Trebuchet"],
    civs: ["Knights Templar"],
  },
  {
    name: "Shattering Projectiles",
    description:
      "Trebuchet projectiles gain Area of Effect, English.",
    category: "attack",
    unitNames: ["Counterweight Trebuchet"],
    civs: ["English"],
  },
  {
    name: "Prolonged Siege",
    description:
      "+10% base damage every 20 seconds while set up, up to +50%, Macedonian Dynasty.",
    category: "attack",
    unitNames: ["Mangonel", "Bombard", "Counterweight Trebuchet"],
    civs: ["Macedonian Dynasty"],
  },
  {
    name: "Siege Crew Training",
    description:
      "Counterweight Trebuchets, Mangonels, and Bombards set up and tear down instantly, Rus.",
    category: "attackSpeed",
    unitNames: ["Mangonel", "Bombard", "Counterweight Trebuchet"],
    civs: ["Rus"],
  },
  {
    name: "Reload Drills",
    description: "Bombards reload 25% faster, Chinese.",
    category: "attackSpeed",
    unitNames: ["Bombard"],
    civs: ["Chinese"],
  },
  {
    name: "Fine Tuned Guns",
    description:
      "Bombards gain +20% base and bonus damage, plus +50 vs Infantry, Rus.",
    category: "attack",
    unitNames: ["Bombard"],
    civs: ["Rus"],
  },
  {
    name: "Cloud of Terror",
    description: "Bombards gain Area of Effect damage, Zhu Xi's Legacy.",
    category: "attack",
    unitNames: ["Bombard"],
    civs: ["Zhu Xi's Legacy"],
  },
  {
    name: "Siege Crews",
    description:
      "While garrisoned, siege engines gain +25% attack and setup speed, Ottomans.",
    category: "attackSpeed",
    unitNames: [
      "Springald",
      "Mangonel",
      "Counterweight Trebuchet",
      "Bombard",
      "Great Bombard",
    ],
    civs: ["Ottomans"],
  },
  {
    name: "College of Artillery",
    description:
      "Royal artillery deals +30% damage and trains 50% faster, French and Jeanne d'Arc.",
    category: "attack",
    unitNames: ["Cannon", "Culverin", "Ribauldequin"],
    civs: ["French", "Jeanne d'Arc"],
  },
  {
    name: "Artillery Shot",
    description:
      "Next Cannon shot against a building deals +30% damage and gains +5 range.",
    category: "attack",
    unitNames: ["Cannon"],
    civs: ["French", "Jeanne d'Arc"],
  },
  {
    name: "Castle of the Crow Aura",
    description:
      "Siege gains +10% attack and +1 range, Sengoku Daimyo.",
    category: "attack",
    unitNames: [
      "Springald",
      "Mangonel",
      "Counterweight Trebuchet",
      "Bombard",
      "Ribauldequin",
      "Culverin",
    ],
    civs: ["Sengoku Daimyo"],
  },
  {
    name: "Divine Defense",
    description: "Siege gains +1 range, Zhu Xi's Legacy.",
    category: "range",
    unitNames: ["Bombard", "Nest of Bees"],
    civs: ["Zhu Xi's Legacy"],
  },
];

const JIN_GENERIC_MELEE_ATTACK_TECHS = [
  { name: "Bloomery", description: "+1", category: "attack" },
  { name: "Decarbonization", description: "+1", category: "attack" },
  { name: "Damascus Steel", description: "+1", category: "attack" },
];

const JIN_GENERIC_RANGED_ATTACK_TECHS = [
  { name: "Steeled Arrow", description: "+1", category: "attack" },
  { name: "Balanced Projectiles", description: "+1", category: "attack" },
  { name: "Platecutter Point", description: "+1", category: "attack" },
];

const JIN_MOHE_RANGED_TECHS = [
  {
    name: "Incendiary Arrows",
    description: "+20%, +3 siege damage vs buildings",
    category: "attack",
  },
  {
    name: "Silk Bowstrings",
    description: "+0.5 range",
    category: "range",
  },
];

const JIN_MOUNTED_VILLAGER_TECHS = [
  {
    name: "Textiles",
    description: "+42 hit points for Mounted Villagers.",
    category: "hitpoints",
  },
  {
    name: "Wheelbarrow",
    description: "+15% movement speed for Mounted Villagers.",
    category: "moveSpeed",
  },
];

const JIN_GENERIC_ARMOR_TECHS = [
  { name: "Fitted Leatherwork", description: "+1 melee", category: "armor" },
  { name: "Insulated Helm", description: "+1 melee", category: "armor" },
  { name: "Master Smiths", description: "+1 melee", category: "armor" },
  { name: "Iron Undermesh", description: "+1 ranged", category: "armor" },
  { name: "Wedge Rivets", description: "+1 ranged", category: "armor" },
  { name: "Angled Surfaces", description: "+1 ranged", category: "armor" },
];

const JIN_RUNTIME_UPGRADE_TECHS = [
  {
    name: "Padded Lamellar",
    description:
      "+25% hit points for cavalry and melee infantry. Replaces Biology and Elite Army Tactics for Jin.",
    category: "hitpoints",
    appliesToUnit(unit, unitName) {
      const tags = unit?.tags || [];
      return (
        tags.includes("Cavalry") ||
        (tags.includes("Infantry") && tags.includes("Melee")) ||
        unitName === "Reindeer Trader"
      );
    },
  },
  {
    name: "Grassland Horses (Melee Cavalry)",
    description:
      "Grassland Horses grant +2 maximum hit points per horse to melee cavalry.",
    category: "hitpoints",
    appliesToUnit(unit) {
      const tags = unit?.tags || [];
      return tags.includes("Cavalry") && tags.includes("Melee");
    },
  },
  {
    name: "Grassland Horses (Ranged Cavalry)",
    description:
      "Grassland Horses grant +1 maximum hit point per horse to ranged cavalry.",
    category: "hitpoints",
    appliesToUnit(unit) {
      const tags = unit?.tags || [];
      return tags.includes("Cavalry") && tags.includes("Ranged");
    },
  },
  {
    name: "Quilted Armor",
    description: "Mohe Tribesmen take -50% bonus damage.",
    category: "armor",
    unitNames: ["Mohe Tribesman"],
  },
  {
    name: "Tower Shields",
    description: "Man-at-Arms gain +3 ranged armor.",
    category: "armor",
    unitNames: ["MAA"],
  },
  {
    name: "Heaven Shaking Thunder",
    description:
      "Ranged attacks reduce enemy cavalry damage by 20% for 5 seconds.",
    category: "attack",
    unitNames: ["Eruptor", "Spearman"],
  },
  {
    name: "Storm Lances",
    description:
      "Spearmen gain a periodic explosive ranged attack. Displayed here; full secondary attack timing needs a dedicated weapon-mode pass.",
    category: "attack",
    unitNames: ["Spearman"],
    displayOnly: true,
  },
  {
    name: "Pili Pao",
    description:
      "Traction Trebuchets and Nest of Bees gain +1 range. In vs-building, Traction Trebuchets use the burst profile and buildings hit by them deal -20% damage for 8 seconds.",
    category: "attack",
    unitNames: ["Traction Trebuchet", "Nest of Bees"],
  },
  {
    name: "Porcupine Defense",
    description: "Nest of Bees deal 10 damage back to melee attackers.",
    category: "armor",
    unitNames: ["Nest of Bees"],
  },
  {
    name: "Great Wall Bastion",
    description: "Bed Crossbow projectiles deal +3 damage.",
    category: "attack",
    unitNames: ["Bed Crossbow"],
  },
  {
    name: "Wall Defense",
    description:
      "Wall-mounted infantry take reduced ranged and siege damage. Displayed only; wall positioning is not simulated.",
    category: "damageResistance",
    unitNames: ["Eruptor", "Zhanma Swordsman"],
    displayOnly: true,
  },
  {
    name: "Siege Engineering",
    description:
      "Can build Battering Rams and Siege Towers. Displayed only; field construction is outside the duel.",
    category: "ability",
    unitNames: ["Zhanma Swordsman"],
    displayOnly: true,
  },
  {
    name: "Flying Fire Battalions",
    description:
      "Improves Meng'an Mouke Emplacements and unlocks Mounted Grenadier spawns. Displayed only for defender-source context.",
    category: "other",
    unitNames: ["Meng'an Mouke Defender", "Mounted Grenadier"],
    displayOnly: true,
  },
  {
    name: "Lightweight Frames",
    description: "+10% movement speed for Jin siege engines.",
    category: "moveSpeed",
    appliesToUnit(unit) {
      return (unit?.tags || []).includes("Siege");
    },
  },
  {
    name: "Reinforced Axles",
    description: "+10% movement speed for Jin siege engines.",
    category: "moveSpeed",
    appliesToUnit(unit) {
      return (unit?.tags || []).includes("Siege");
    },
  },
  {
    name: "Flower Garden",
    description: "Military units within a Flower Garden gain +25% attack speed.",
    category: "attackSpeed",
    appliesToUnit(unit) {
      const tags = unit?.tags || [];
      return (
        tags.includes("Infantry") ||
        tags.includes("Cavalry") ||
        tags.includes("Siege")
      );
    },
  },
];

function deriveRuntimeUpgradesForUnit(unit, unitName) {
  if (!unit || !unitName) return [];
  const siegeTechs = SIEGE_RUNTIME_UPGRADE_TECHS
    .filter((tech) => tech.unitNames?.includes(unitName))
    .map((tech) => {
      const entry = {
        name: tech.name,
        description: tech.description,
        category: tech.category,
      };
      if (tech.civs) entry.civs = [...tech.civs];
      if (tech.exceptCivs) entry.exceptCivs = [...tech.exceptCivs];
      return entry;
    });

  const tags = unit.tags || [];
  const jinTechs = [];
  const isJinNativeUnit = JIN_NATIVE_UNITS.has(unitName);
  if (isJinNativeUnit && tags.includes("Melee") && !tags.includes("Siege")) {
    jinTechs.push(...JIN_GENERIC_MELEE_ATTACK_TECHS);
  }
  if (
    isJinNativeUnit &&
    ["Mohe Tribesman", "Mounted Villager"].includes(unitName)
  ) {
    jinTechs.push(...JIN_GENERIC_RANGED_ATTACK_TECHS);
  }
  if (unitName === "Mohe Tribesman") {
    jinTechs.push(...JIN_MOHE_RANGED_TECHS);
  }
  if (unitName === "Mounted Villager") {
    jinTechs.push(...JIN_MOUNTED_VILLAGER_TECHS);
  }
  if (isJinNativeUnit && !tags.includes("Siege")) {
    jinTechs.push(...JIN_GENERIC_ARMOR_TECHS);
  }
  for (const tech of JIN_RUNTIME_UPGRADE_TECHS) {
    const unitMatch = tech.unitNames?.includes(unitName);
    const appliesMatch =
      typeof tech.appliesToUnit === "function" &&
      tech.appliesToUnit(unit, unitName);
    if (!unitMatch && !appliesMatch) continue;
    jinTechs.push(tech);
  }

  const normalizedJinTechs = jinTechs.map((tech) => {
    const entry = {
      name: tech.name,
      description: tech.description,
      category: tech.category,
      civs: ["Jin Dynasty"],
    };
    if (tech.displayOnly) entry.displayOnly = true;
    return entry;
  });

  return [...siegeTechs, ...normalizedJinTechs];
}

function getKtUnitCosts(unit = {}) {
  return unit?.costs || unit?.cost || {};
}

function isKtHumanCombatUnit(unit = {}) {
  const tags = unit?.tags || [];
  if (!Array.isArray(tags) || tags.length === 0) return false;
  return !tags.includes("Siege") &&
    !tags.includes("Ship") &&
    !tags.includes("Building");
}

function isKtMeleeCombatUnit(unit = {}) {
  const tags = unit?.tags || [];
  return isKtHumanCombatUnit(unit) &&
    tags.includes("Melee") &&
    !tags.includes("Ranged");
}

function isKtCavalryUnit(unit = {}) {
  return isKtHumanCombatUnit(unit) && (unit?.tags || []).includes("Cavalry");
}

function isKtGoldHumanUnit(unit = {}) {
  return isKtHumanCombatUnit(unit) && (getKtUnitCosts(unit).gold || 0) > 0;
}

export const KT_DESERT_CITADELS_TECH = Object.freeze({
  name: "Desert Citadels",
  description:
    "Improves Desert Outposts. Units with the armor aura gain +1 melee and ranged armor.",
  category: "armor",
  civs: ["Knights Templar"],
  ktDesertCitadels: true,
});

function isKtDesertOutpostsArmorAura(aura = {}) {
  if (aura?.name !== "Desert Outposts") return false;
  if (aura?.category !== "armor") return false;
  return /melee\/ranged/i.test(String(aura?.description || ""));
}

function isKtDesertOutpostsBattlerPlaceholder(item) {
  return item?.name === "Desert Outposts";
}

export function getKtDesertCitadelsTechItem(unit = {}) {
  const auras = Array.isArray(unit?.auras) ? unit.auras : [];
  return auras.some(isKtDesertOutpostsArmorAura)
    ? { ...KT_DESERT_CITADELS_TECH }
    : null;
}

export const KT_COMMANDERIE_BRANCHES = Object.freeze({
  "Knights Hospitaller": {
    name: "Knights Hospitaller",
    branchId: "knightsHospitaller",
    ageGroup: "feudal",
    category: "hitpoints",
    description: "+30% healing received from all sources.",
    unlocksUnits: ["Hospitaller Knight"],
    combatVisible: true,
    alwaysOn: true,
    appliesToUnit: (unit) => isKtHumanCombatUnit(unit),
  },
  "Principality of Antioch": {
    name: "Principality of Antioch",
    branchId: "principalityOfAntioch",
    ageGroup: "feudal",
    category: "attack",
    description: "Melee units +15% damage.",
    unlocksUnits: ["Serjeant"],
    combatVisible: true,
    alwaysOn: true,
    appliesToUnit: (unit) => isKtMeleeCombatUnit(unit),
  },
  "Kingdom of France": {
    name: "Kingdom of France",
    branchId: "kingdomOfFrance",
    ageGroup: "feudal",
    category: "creationSpeed",
    description: "Unlocks Chevalier Confrere and training/gold bonuses.",
    unlocksUnits: ["Chevalier Confrere"],
    combatVisible: false,
    alwaysOn: true,
  },
  "Angevin Empire": {
    name: "Angevin Empire",
    branchId: "angevinEmpire",
    ageGroup: "castle",
    category: "hitpoints",
    description: "Unlocks Heavy Spearman and structure-health bonuses.",
    unlocksUnits: ["Heavy Spearman"],
    combatVisible: false,
    alwaysOn: true,
  },
  "Republic of Genoa": {
    name: "Republic of Genoa",
    branchId: "republicOfGenoa",
    ageGroup: "castle",
    category: "other",
    description: "Unlocks Genoese Crossbowman and Pilgrim gold bonuses.",
    unlocksUnits: ["Genoese Crossbowman"],
    combatVisible: false,
    alwaysOn: true,
  },
  "Kingdom of Castile": {
    name: "Kingdom of Castile",
    branchId: "kingdomOfCastile",
    ageGroup: "castle",
    category: "attack",
    description: "Near Sacred Sites: +20% damage and +1 HP/s.",
    unlocksUnits: ["Genitour"],
    combatVisible: true,
    alwaysOn: false,
    situational: true,
    appliesToUnit: (unit) => isKtHumanCombatUnit(unit),
  },
  "Kingdom of Poland": {
    name: "Kingdom of Poland",
    branchId: "kingdomOfPoland",
    ageGroup: "imperial",
    category: "hitpoints",
    description: "Cavalry +10% hit points and +50% charge damage.",
    unlocksUnits: ["Szlachta Cavalry"],
    combatVisible: true,
    alwaysOn: true,
    appliesToUnit: (unit) => isKtCavalryUnit(unit),
  },
  "Teutonic Order": {
    name: "Teutonic Order",
    branchId: "teutonicOrder",
    ageGroup: "imperial",
    category: "armor",
    description: "Human units that cost gold gain +2 melee armor.",
    unlocksUnits: ["Teutonic Knight"],
    combatVisible: true,
    alwaysOn: true,
    appliesToUnit: (unit) => isKtGoldHumanUnit(unit),
  },
  "Republic of Venice": {
    name: "Republic of Venice",
    branchId: "republicOfVenice",
    ageGroup: "imperial",
    category: "other",
    description: "Unlocks Condottiero and trade bonuses.",
    unlocksUnits: ["Condottiero"],
    combatVisible: false,
    alwaysOn: true,
  },
});

const KT_COMMANDERIE_ROUTE_LOCKS = Object.freeze({
  "Hospitaller Knight": "Knights Hospitaller",
  "Serjeant": "Principality of Antioch",
  "Chevalier Confrere": "Kingdom of France",
  "Heavy Spearman": "Angevin Empire",
  "Genoese Crossbowman": "Republic of Genoa",
  "Genitour": "Kingdom of Castile",
  "Szlachta Cavalry": "Kingdom of Poland",
  "Teutonic Knight": "Teutonic Order",
  "Condottiero": "Republic of Venice",
});

const KT_COMMANDERIE_BRANCH_NAME_SET = new Set(
  Object.keys(KT_COMMANDERIE_BRANCHES),
);

export function getKtCommanderieBranchByName(name = "") {
  return KT_COMMANDERIE_BRANCHES[name] || null;
}

export function getKtCommanderieRouteLock(unitName = "") {
  const branchName = KT_COMMANDERIE_ROUTE_LOCKS[unitName];
  return branchName ? getKtCommanderieBranchByName(branchName) : null;
}

export function isKtCommanderieBranchName(name = "") {
  return KT_COMMANDERIE_BRANCH_NAME_SET.has(name);
}

export function isKtCommanderiePlaceholder(item) {
  if (!item) return false;
  if (item.name === "Knights Templar") return true;
  return isKtCommanderieBranchName(item.name);
}

export function isKtBattlerPlaceholder(item) {
  return isKtCommanderiePlaceholder(item) ||
    isKtDesertOutpostsBattlerPlaceholder(item);
}

export function getKtCombatCommanderieBranchesForUnit(unit, unitName = "") {
  return Object.values(KT_COMMANDERIE_BRANCHES).filter((branch) => {
    if (!branch.combatVisible) return false;
    if (typeof branch.appliesToUnit === "function" &&
      !branch.appliesToUnit(unit, unitName)) {
      return false;
    }
    return true;
  });
}

export function computeGlobalUpgradesForUnit(unit, unitName = "") {
  const results = [];
  for (const tech of GLOBAL_UPGRADE_TECHS) {
    if (typeof tech.appliesToUnit === "function" && !tech.appliesToUnit(unit))
      continue;
    const entry = {
      name: tech.name,
      description: tech.description,
      category: tech.category,
    };
    if (tech.civs) entry.civs = [...tech.civs];
    if (tech.exceptCivs) entry.exceptCivs = [...tech.exceptCivs];
    results.push(entry);
  }
  results.push(...deriveRuntimeUpgradesForUnit(unit, unitName));
  return results;
}

export function getMergedUpgradesForUnit(unit, unitName = "") {
  // Drop per-unit copies of globally defined techs (by name)
  const base = (unit.upgrades || []).filter(
    (e) => !GLOBAL_UPGRADE_TECH_NAMES.has(e.name),
  );
  const derived = computeGlobalUpgradesForUnit(unit, unitName);
  return [...base, ...derived];
}

// ========================================
// TECHNOLOGIES & AURAS — clickable buff system
// ========================================

export const COMBAT_CATEGORIES = new Set([
  "attack",
  "armor",
  "hitpoints",
  "attackSpeed",
  "moveSpeed",
  "range",
]);

// Maps tech names to effect IDs for bidirectional sync between tech buttons and effect checkboxes
export const TECH_TO_EFFECT = {
  "Triple Shot": "tripleShot",
  "Farima Leadership": "farimaLeadership",
  "Arrow Volley": "arrowVolley",
  "Berserking": "berserking",
  "Static Deployment": "staticDeployment",
  "Ruinous Blinding": "ruinousBlinding",
  "Knightly Brotherhood": "knightlyBrotherhood",
  "Caracole": "caracole",
  "Kabura-ya Whistling Arrow": "kaburaYaWhistlingArrow",
  "Poisoned Arrows": "poisonedArrows",
  "Numeri": "numeri",
  "Triumph": "triumph",
};

// Inverse mapping: effectId → techName (for rendering tech buttons in effects)
export const EFFECT_TO_TECH = {};
for (const [techName, effectId] of Object.entries(TECH_TO_EFFECT)) {
  EFFECT_TO_TECH[effectId] = techName;
}

// Hardcoded map: "TechName|category" → buff effects
// Fields: attackAbs, meleeArmor, rangedArmor, hpAbs, hpPct, attackPct, speedPct
// Arrays = variable-level techs with labels
export const TECH_EFFECTS = {
  // === ATTACK (blacksmith line & civ) ===
  "Bloomery|attack": { attackAbs: 1 },
  "Decarbonization|attack": { attackAbs: 1 },
  "Damascus Steel|attack": { attackAbs: 1 },
  "Steeled Arrow|attack": { attackAbs: 1 },
  "Balanced Projectiles|attack": { attackAbs: 1 },
  "Platecutter Point|attack": { attackAbs: 1 },
  "Tatara|attack": { attackAbs: 1 },
  "Hizukuri|attack": { attackAbs: 1 },
  "Kobuse-gitae|attack": { attackAbs: 1 },
  "Yaki-ire|attack": { attackAbs: 1 },
  "Higoyumi|attack": { attackAbs: 1 },
  "Runestones|attack": { attackAbs: 1 },
  "Enlist Mansa Musofadi|attack": { attackAbs: 1 },
  "Two-Handed Weapons|attack": { attackAbs: 2 },
  "Awl Pikes|attack": { attackAbs: 2 },
  "Precision Training|attack": { attackAbs: 2 },
  "Cranequins|attack": { attackAbs: 2 },
  "Throwing Dagger Drills|attack": { attackAbs: 2 },
  "Honed Blades|attack": { attackAbs: 3 },
  "Heavy Maces|attack": { bonusVs: { "Heavy": 6 } },
  "Knight Poleaxes|attack": { attackAbs: 4 },
  "Janissary Guns|attack": { attackAbs: 4 },
  "Collar of Esses|attack": { bonusVs: { "Heavy": 5 } },
  "Rhomphaia|attack": { bonusVs: { "Light Infantry": 3 } },
  "Serpentine Powder|attack": { bonusVs: { "Melee Infantry": 5 } },
  "Bodkin Bolts|attack": { attackAbs: 20 },
  "Bolt Magazines|attack": { attackAbs: 1 },

  // Pattern Welding / Blade Inlaying / Sharpening Stones (tiered, Macedonian Dynasty)
  "Blade Inlaying|attack": {
    attackAbs: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1)", "Tier 2 (+2)", "Tier 3 (+3)", "Tier 4 (+4)", "Tier 5 (+5)", "Tier 6 (+6)"],
  },
  "Pattern Welding|attack": {
    attackAbs: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1)", "Tier 2 (+2)", "Tier 3 (+3)", "Tier 4 (+4)", "Tier 5 (+5)", "Tier 6 (+6)"],
  },
  "Sharpening Stones|attack": {
    attackAbs: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1)", "Tier 2 (+2)", "Tier 3 (+3)", "Tier 4 (+4)", "Tier 5 (+5)", "Tier 6 (+6)"],
  },

  // Percentage attack buffs
  "Incendiary Arrows|attack": { attackPct: 20 },
  "Fanaticism|attack": {
    attackPct: [10, 30],
    labels: ["Below 50% HP (+10%)", "Below 25% HP (+30%)"],
  },
  "Elite Army Tactics|attack": { attackPct: 15 },
  "Improved Elite Army Tactics|attack": { attackPct: 5 },
  "Inspiration Bonus|attack": { attackPct: 15 },
  "Khan Warcry|attack": {
    attackPct: [10, 20, 30],
    labels: ["Low Charge (+10%)", "Mid Charge (+20%)", "High Charge (+30%)"],
  },
  "Oda Tactics|attack": { attackPct: 15 },
  "Hippodrome Scout Aura|attack": { attackPct: 25 },
  "Hippodrome Horseman Aura|attack": { attackAbs: 2 },
  "Military Tactics Training|attack": { attackPct: 20 },
  "Collateral Damage|attack": { attackPct: 30 },
  "Neza Training|attack": { attackPct: 35 },
  "Khanda Drills|attack": { attackPct: 100 },
  "Geometry|attack": {},
  "Greek Fire Projectiles|attack": {},
  "Counterweight Defenses|attack": {},
  "Rule of Templars|attack": {},
  "Principality of Antioch|attack": { attackPct: 15 },
  "Kingdom of Castile|attack": { attackPct: 20 },
  "Prolonged Siege|attack": {},
  "Fine Tuned Guns|attack": {},
  "Cloud of Terror|attack": {},
  "College of Artillery|attack": {},
  "Artillery Shot|attack": {},
  "Castle of the Crow Aura|attack": {},
  "Wandering Town|attack": {},
  "Additional Barrels|attack": {},
  "Adjustable Crossbars|attack": {},
  "Shattering Projectiles|attack": {},
  "Pili Pao|attack": {},
  "Storm Lances|attack": {},
  "Heaven Shaking Thunder|attack": {},

  // Charge-related attack buffs (mapped to attackAbs as bonus)
  // Cantled Saddles is a charge-duration buff, not permanent flat attack — not modeled here
  "Odachi|attack": { bonusVs: { "Infantry": 4 } },
  "Improved Yari|attack": { bonusVs: { "Cavalry": 2 } },
  "Mounted Samurai Odachi|attack": { bonusVs: { "Infantry": 4 } },
  "Lightweight Blades|attack": {},  // +5 vs workers — no Workers tag in battler
  "Nagae Yari|attack": { attackPct: 15 },
  "Siha Bow Limbs|attack": { attackAbs: [1, 2], labels: ["Standard (+1)", "Improved (+2)"] },
  "Poisoned Arrows|attack": {},
  "Enlist Mansa Javelineers|attack": { attackAbs: 3 },

  // Saint's Blessing attack
  "Saint's Blessing|attack": {
    attackAbs: [2, 3],
    labels: ["Standard (+2)", "With Fervor (+3)"],
  },

  // === ARMOR ===
  "Fitted Leatherwork|armor": { meleeArmor: 1 },
  "Insulated Helm|armor": { meleeArmor: 1 },
  "Master Smiths|armor": { meleeArmor: 1 },
  "Iron Undermesh|armor": { rangedArmor: 1 },
  "Wedge Rivets|armor": { rangedArmor: 1 },
  "Angled Surfaces|armor": { rangedArmor: 1 },
  "Armor Clad|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Steel Barding|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Brigandine|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Imported Armor|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Battlefield Salvage|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Camel Rider Barding|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Camel Rider Shields|armor": { meleeArmor: 3 },
  "Camel Support|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Gambesons|armor": { meleeArmor: 5 },
  "Infantry Support|armor": { meleeArmor: 3, rangedArmor: 3 },
  "Inspiration Bonus|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Saint's Blessing|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Kharash Aura|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Teardrop Shields|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Padded Armor|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Padded Jack|armor": { meleeArmor: 3 },
  "Armored Beasts|armor": { rangedArmor: 4 },
  "Howdahs|armor": { rangedArmor: 4 },
  "Scale Armor|armor": { rangedArmor: 3 },
  "Muscovy Yasak|armor": { rangedArmor: 2 },
  "Cross Folded Armor|armor": { rangedArmor: 2 },
  "Teutonic Order|armor": { meleeArmor: 2 },
  "Desert Citadels|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Tower Shields|armor": { rangedArmor: 3 },
  "Quilted Armor|armor": {},
  "Porcupine Defense|armor": {},

  // Tiered armor (Macedonian Dynasty)
  "Butted Chainmail|armor": {
    meleeArmor: [1, 2, 3, 4, 5, 6],
    rangedArmor: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1/+1)", "Tier 2 (+2/+2)", "Tier 3 (+3/+3)", "Tier 4 (+4/+4)", "Tier 5 (+5/+5)", "Tier 6 (+6/+6)"],
  },
  "Lamellar Armor|armor": {
    meleeArmor: [1, 2, 3, 4, 5, 6],
    rangedArmor: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1/+1)", "Tier 2 (+2/+2)", "Tier 3 (+3/+3)", "Tier 4 (+4/+4)", "Tier 5 (+5/+5)", "Tier 6 (+6/+6)"],
  },
  "Scale Barding|armor": {
    meleeArmor: [1, 2, 3, 4, 5, 6],
    rangedArmor: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1/+1)", "Tier 2 (+2/+2)", "Tier 3 (+3/+3)", "Tier 4 (+4/+4)", "Tier 5 (+5/+5)", "Tier 6 (+6/+6)"],
  },

  // === HITPOINTS ===
  "Biology|hitpoints": { hpPct: 25 },
  "Biology Improved|hitpoints": { hpPct: 35 },
  "Royal Bloodlines|hitpoints": { hpPct: 35 },
  "Battle Hardened|hitpoints": { hpAbs: 30 },
  "Boyar's Fortitude|hitpoints": { hpAbs: 25 },
  "Piety|hitpoints": { hpAbs: 40 },
  "Boot Camp|hitpoints": { hpAbs: 15 },
  "Siege Works|hitpoints": { hpPct: 20 },
  "Iron Fittings|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: SIEGE_HP_TIER_LABELS,
  },
  "Armored Beasts|hitpoints": { hpPct: 20 },
  "Howdahs|hitpoints": { hpPct: 25 },
  "Oda Tactics|hitpoints": { hpPct: 15 },
  "Elite Army Tactics|hitpoints": { hpPct: 15 },
  "Improved Elite Army Tactics|hitpoints": { hpPct: 5 },
  "Battlefield Salvage|hitpoints": { hpAbs: 25 },
  "Padded Armor|hitpoints": { hpAbs: 20 },
  "Khan and Torguuds|hitpoints": { hpAbs: 30 },
  "Enlist Mansa Musofadi|hitpoints": { hpAbs: 10 },
  "Defensive Aura Edict|hitpoints": { hpPct: 10 },
  "Knights Hospitaller|hitpoints": {},
  "Kingdom of Poland|hitpoints": { hpPct: 10 },
  "Padded Lamellar|hitpoints": { hpPct: 25 },
  "Textiles|hitpoints": { hpAbs: 42 },
  "Grassland Horses (Melee Cavalry)|hitpoints": {
    hpAbs: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
    labels: [
      "1 Horse (+2)",
      "2 Horses (+4)",
      "3 Horses (+6)",
      "4 Horses (+8)",
      "5 Horses (+10)",
      "6 Horses (+12)",
      "7 Horses (+14)",
      "8 Horses (+16)",
      "9 Horses (+18)",
      "10 Horses (+20)",
      "11 Horses (+22)",
      "12 Horses (+24)",
      "13 Horses (+26)",
      "14 Horses (+28)",
      "15 Horses (+30)",
    ],
  },
  "Grassland Horses (Ranged Cavalry)|hitpoints": {
    hpAbs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    labels: [
      "1 Horse (+1)",
      "2 Horses (+2)",
      "3 Horses (+3)",
      "4 Horses (+4)",
      "5 Horses (+5)",
      "6 Horses (+6)",
      "7 Horses (+7)",
      "8 Horses (+8)",
      "9 Horses (+9)",
      "10 Horses (+10)",
      "11 Horses (+11)",
      "12 Horses (+12)",
      "13 Horses (+13)",
      "14 Horses (+14)",
      "15 Horses (+15)",
    ],
  },

  // Tiered HP (Macedonian Dynasty)
  "Butted Chainmail|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: ["Tier 1 (+5%)", "Tier 2 (+10%)", "Tier 3 (+15%)", "Tier 4 (+20%)", "Tier 5 (+25%)", "Tier 6 (+30%)"],
  },
  "Lamellar Armor|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: ["Tier 1 (+5%)", "Tier 2 (+10%)", "Tier 3 (+15%)", "Tier 4 (+20%)", "Tier 5 (+25%)", "Tier 6 (+30%)"],
  },
  "Scale Barding|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: ["Tier 1 (+5%)", "Tier 2 (+10%)", "Tier 3 (+15%)", "Tier 4 (+20%)", "Tier 5 (+25%)", "Tier 6 (+30%)"],
  },
  "Warwolf Trebuchet|hitpoints": { hpPct: 50 },
  "Siege Carpentry|hitpoints": {},

  // === ATTACK SPEED ===
  "Composite Bows|attackSpeed": { speedPct: 33 },
  "Crossbow Stirrups|attackSpeed": { speedPct: 25 },
  "Dali Horses|attackSpeed": { speedPct: 20 },
  "Teardrop Shields|attackSpeed": { speedPct: 15 },
  "Mehter Attack Drums|attackSpeed": { speedPct: 15 },
  "Golden Age: Tier 5|attackSpeed": { speedPct: 20 },
  "Network of Castles|attackSpeed": {
    speedPct: [20, 30],
    labels: ["Network of Castles (+20%)", "Network of Citadels (+30%)"],
  },
  "Static Deployment|attackSpeed": { speedPct: 30 },
  "Tower of Victory|attackSpeed": { speedPct: 20 },
  "Zeal|attackSpeed": { speedPct: 50 },
  "Steppe Lancers|attackSpeed": {
    speedPct: [10, 15],
    labels: ["Standard (+10%)", "Improved (+15%)"],
  },
  "Sarai Lancers|attackSpeed": { speedPct: 10 },
  "3 units|attackSpeed": {},
  "Khan and Torguuds|attackSpeed": { speedPct: -20 },
  // Stone Armies is a cost/training unlock, not attack speed — not modeled here
  "Stronger Together|attackSpeed": { speedPct: 5 },
  "Lightweight Beams|attackSpeed": { speedPct: 20 },
  "Roller Shutter Triggers|attackSpeed": { speedPct: 25 },
  "Roman Fire|attackSpeed": { speedPct: 15 },
  "Reload Drills|attackSpeed": { speedPct: 33 },
  "Siege Crew Training|attackSpeed": {},
  "Siege Crews|attackSpeed": {},
  "Flower Garden|attackSpeed": { speedPct: 25 },

  // === RANGE ===
  "Bolt Magazines|range": {},
  "Cranequins|range": {},
  "Mounted Training|range": {},
  "Paiks|range": {},
  "Phalanx|range": {},
  "Pyrotechnics|range": {},
  "Silk Bowstrings|range": {},
  "Runestones|range": {},
  "Nagae Yari|range": {},
  "Wall Defense|range": {},
  "Divine Defense|range": {},
  "Pili Pao|range": {},

  // === ARMOR (buff field: melee armor drums) ===
  "Mehter Melee Armor Drums|armor": { meleeArmor: 2 },
  "Mehter Ranged Armor Drums|armor": { rangedArmor: 1 },
  "Beachhead|armor": {},

  // === EFFECT-LINKED TECHS (toggled via effects system, not stat buffs) ===
  "Triple Shot|range": {},
  "Arrow Volley|ability": {},
  "Arrow Volley|attackSpeed": {},
  "Berserking|attack": {},
  "Berserking|moveSpeed": {},
  "Farima Leadership|ability": {},
  "Farima Leadership|moveSpeed": {},
  "Ruinous Blinding|ability": {},
  "Knightly Brotherhood|hitpoints": {},
  "Caracole|moveSpeed": {},
  "Caracole|other": {},
  "Kabura-ya Whistling Arrow|ability": {},
  "Hard Cased Bombs|ability": {},
  "Numeri|ability": {},
  "Triumph|hitpoints": {},
  "Triumph|attack": {},
  "Triumph|moveSpeed": {},
  "Greased Axles|moveSpeed": {},
  "Lightweight Frames|moveSpeed": {},
  "Reinforced Axles|moveSpeed": {},
  "Wheelbarrow|moveSpeed": {},
};

// Image map: tech name → image path (relative to app root)
export const TECH_IMAGE_MAP = {
  "Bloomery": "assets/images/technologies/bloomery-2.png",
  "Decarbonization": "assets/images/technologies/decarbonization-3.png",
  "Damascus Steel": "assets/images/technologies/damascus-steel-4.png",
  "Steeled Arrow": "assets/images/technologies/steeled-arrow-2.png",
  "Balanced Projectiles": "assets/images/technologies/balanced-projectiles-3.png",
  "Platecutter Point": "assets/images/technologies/platecutter-point-4.png",
  "Fitted Leatherwork": "assets/images/technologies/fitted-leatherwork-2.png",
  "Insulated Helm": "assets/images/technologies/insulated-helm-3.png",
  "Master Smiths": "assets/images/technologies/master-smiths-4.png",
  "Iron Undermesh": "assets/images/technologies/iron-undermesh-2.png",
  "Wedge Rivets": "assets/images/technologies/wedge-rivets-3.png",
  "Angled Surfaces": "assets/images/technologies/angled-surfaces-4.png",
  "Biology": "assets/images/technologies/biology-4.png",
  "Biology Improved": "assets/images/technologies/biology-improved-4.png",
  "Royal Bloodlines": "assets/images/technologies/royal-bloodlines-3.png",
  "Battle Hardened": "assets/images/technologies/battle-hardened-4.png",
  "Boyar's Fortitude": "assets/images/technologies/boyars-fortitude-3.png",
  "Piety": "assets/images/technologies/piety-4.png",
  "Boot Camp": "assets/images/technologies/boot-camp-2.png",
  "Armor Clad": "assets/images/technologies/armor-clad-3.png",
  "Steel Barding": "assets/images/technologies/steel-barding-3.png",
  "Brigandine": "assets/images/technologies/brigandine-4.png",
  "Imported Armor": "assets/images/technologies/imported-armor-3.png",
  "Gambesons": "assets/images/technologies/gambesons-3.png",
  "Composite Bows": "assets/images/technologies/composite-bows-3.png",
  "Crossbow Stirrups": "assets/images/technologies/crossbow-stirrups-3.png",
  "Incendiary Arrows": "assets/images/technologies/incendiary-arrows-4.png",
  "Two-Handed Weapons": "assets/images/technologies/two-handed-weapons-3.png",
  "Awl Pikes": "assets/images/technologies/awl-pikes-2.png",
  "Heavy Maces": "assets/images/technologies/heavy-maces-3.png",
  "Knight Poleaxes": "assets/images/technologies/knight-poleaxes-4.png",
  "Honed Blades": "assets/images/technologies/honed-blades-3.png",
  "Precision Training": "assets/images/technologies/precision-training-4.png",
  "Janissary Guns": "assets/images/technologies/janissary-guns-4.png",
  "Cantled Saddles": "assets/images/technologies/cantled-saddles-3.png",
  "Odachi": "assets/images/technologies/odachi-3.png",
  "Improved Yari": "assets/images/technologies/improved-yari-1.png",
  "Scale Armor": "assets/images/technologies/scale-armor-3.png",
  "Camel Rider Barding": "assets/images/technologies/camel-rider-barding-4.png",
  "Camel Rider Shields": "assets/images/technologies/camel-rider-shields-3.png",
  "Camel Support": "assets/images/technologies/camel-support-4.png",
  "Infantry Support": "assets/images/technologies/infantry-support-4.png",
  "Battlefield Salvage": "assets/images/technologies/battlefield-salvage-3.png",
  "Howdahs": "assets/images/technologies/howdahs-4.png",
  "Armored Beasts": "assets/images/technologies/armored-beasts-4.png",
  "Bodkin Bolts": "assets/images/technologies/bodkin-bolts-4.png",
  "Bolt Magazines": "assets/images/technologies/bolt-magazines-3.png",
  "Tatara": "assets/images/technologies/tatara-1.png",
  "Hizukuri": "assets/images/technologies/hizukuri-2.png",
  "Kobuse-gitae": "assets/images/technologies/kobuse-gitae-3.png",
  "Yaki-ire": "assets/images/technologies/yaki-ire-4.png",
  "Higoyumi": "assets/images/technologies/higoyumi-1.png",
  "Runestones": "assets/images/technologies/inspired-warriors-3.png",
  "Dali Horses": "assets/images/technologies/dali-horses-2.png",
  "Pyrotechnics": "assets/images/technologies/pyrotechnics-4.png",
  "Paiks": "assets/images/technologies/paiks-3.png",
  "Phalanx": "assets/images/technologies/phalanx-2.png",
  "Silk Bowstrings": "assets/images/technologies/silk-bowstrings-4.png",
  "Mounted Training": "assets/images/technologies/mounted-training-4.png",
  "Rhomphaia": "assets/images/technologies/rhomphaia-3.png",
  "Serpentine Powder": "assets/images/technologies/serpentine-powder-4.png",
  "Collar of Esses": "assets/images/technologies/collar-of-esses-3.png",
  "Cranequins": "assets/images/technologies/cranequins-4.png",
  "Throwing Dagger Drills": "assets/images/technologies/throwing-dagger-drills-4.png",
  "Nagae Yari": "assets/images/technologies/nagae-yari-4.png",
  "Poisoned Arrows": "assets/images/technologies/poisoned-arrows-3.png",
  "Hard Cased Bombs": "assets/images/technologies/hard-cased-bombs-3.png",
  "Padded Armor": "assets/images/technologies/padded-armor-3.png",
  "Padded Jack": "assets/images/technologies/padded-jack-4.png",
  "Muscovy Yasak": "assets/images/technologies/muscovy-yasak-2.png",
  "Cross Folded Armor": "assets/images/technologies/cross-folded-armor-1.png",
  "Mounted Samurai Odachi": "assets/images/technologies/mounted-samurai-odachi-3.png",
  "Lightweight Blades": "assets/images/technologies/lightweight-blades-1.png",
  "Neza Training": "assets/images/technologies/neza-training-3.png",
  "Collateral Damage": "assets/images/technologies/collateral-damage-3.png",
  "Khanda Drills": "assets/images/technologies/khanda-drills-3.png",
  "Military Tactics Training": "assets/images/technologies/military-tactics-training-3.png",
  "Blade Inlaying": "assets/images/technologies/blade-inlaying-tier1-2.png",
  "Pattern Welding": "assets/images/technologies/pattern-welding-tier1-2.png",
  "Sharpening Stones": "assets/images/technologies/sharpening-stones-tier1-2.png",
  "Butted Chainmail": "assets/images/technologies/butted-chainmail-tier1-2.png",
  "Lamellar Armor": "assets/images/technologies/lamellar-armor-tier1-2.png",
  "Scale Barding": "assets/images/technologies/scale-barding-tier1-2.png",
  "Teardrop Shields": "assets/images/technologies/teardrop-shields-3.png",
  "Static Deployment": "assets/images/abilities/ability-static-deployment-1.png",
  "Fanaticism": "assets/images/technologies/fanaticism-4.png",
  "Rule of Templars": "assets/images/technologies/rule-of-templars-3.png",
  "Knights Hospitaller": "assets/images/technologies/knights-hospitaller-2.png",
  "Principality of Antioch": "assets/images/technologies/principality-of-antioch-2.png",
  "Kingdom of France": "assets/images/technologies/kingdom-of-france-2.png",
  "Angevin Empire": "assets/images/technologies/angevin-empire-3.png",
  "Republic of Genoa": "assets/images/technologies/republic-of-genoa-3.png",
  "Kingdom of Castile": "assets/images/technologies/kingdom-of-castile-3.png",
  "Kingdom of Poland": "assets/images/technologies/kingdom-of-poland-4.png",
  "Teutonic Order": "assets/images/technologies/teutonic-order-4.png",
  "Republic of Venice": "assets/images/technologies/republic-of-venice-4.png",
  "Elite Army Tactics": "assets/images/technologies/elite-army-tactics-4.png",
  "Oda Tactics": "assets/images/technologies/oda-tactics-4.png",
  "Khan Warcry": "assets/images/technologies/khan-debuff-arrow-2.png",
  "Zeal": "assets/images/technologies/zeal-4.png",
  "Golden Age: Tier 5": "assets/images/abilities/ability-golden-age-tier-5.png",
  "Network of Castles": "assets/images/abilities/ability-network-of-castles-1.png",
  "Mehter Attack Drums": "assets/images/technologies/mehter-drums-1.png",
  "Mehter Melee Armor Drums": "assets/images/technologies/mehter-drums-1.png",
  "Mehter Ranged Armor Drums": "assets/images/technologies/mehter-drums-1.png",
  "Tower of Victory": "assets/images/abilities/ability-tower-of-victory-aura-1.png",
  "Sarai Lancers": "assets/images/technologies/sarai-lancers-3.png",
  "Steppe Lancers": "assets/images/technologies/steppe-lancers-3.png",
  "Stone Armies": "assets/images/technologies/stone-armies-3.png",
  "Stronger Together": "assets/images/technologies/inspired-warriors-3.png",
  "Khan and Torguuds": "assets/images/technologies/khan-and-torguuds-1.png",
  "Archery Range Reinforcements": "assets/images/technologies/archery-range-reinforcements-3.png",
  "Barracks Reinforcements": "assets/images/technologies/barracks-reinforcements-3.png",
  "Stables Reinforcements": "assets/images/technologies/stables-reinforcements-3.png",
  "Defensive Aura Edict": "assets/images/abilities/ability-defensive-aura-edict-1.png",
  "Hippodrome Scout Aura": "assets/images/technologies/horse-training-1.png",
  "Inspiration Bonus": "assets/images/abilities/ability-inspired-1.png",
  "Saint's Blessing": "assets/images/abilities/ability-saints-blessing-1.png",
  "Kharash Aura": "assets/images/abilities/ability-kharash-edict-4.png",
  "Enlist Mansa Musofadi": "assets/images/technologies/farima-leadership-4.png",
  "Enlist Mansa Javelineers": "assets/images/technologies/poisoned-arrows-3.png",
  "Glorious Charge": "assets/images/technologies/glorious-charge-3.png",
  "Golden Cuirass": "assets/images/technologies/golden-cuirass-2.png",
  "Heavy Torches": "assets/images/technologies/heavy-torches-2.png",
  "Additional Torches": "assets/images/technologies/additional-torches-3.png",
  "Additional Torches Improved": "assets/images/technologies/additional-torches-improved-3.png",
  "Additional Torches Improved:": "assets/images/technologies/additional-torches-improved-3.png",
  "(Improved) Additional Torches": "assets/images/technologies/additional-torches-improved-3.png",
  "Desert Outposts": "assets/images/abilities/ability-desert-citadels-1.png",
  "Desert Citadels": "assets/images/technologies/desert-citadels-2.png",
  "Torch Attack": "assets/images/abilities/ability-improved-torch-1.png",
  "Siege Works": "assets/images/technologies/siege-works-4.png",
  "Iron Fittings": "assets/images/technologies/iron-fittings-tier1-2.png",
  "Greased Axles": "assets/images/technologies/greased-axles-3.png",
  "Lightweight Beams": "assets/images/technologies/lightweight-beams-4.png",
  "Siege Carpentry": "assets/images/technologies/siege-carpentry-3.png",
  "Wandering Town": "assets/images/technologies/wandering-town-4.png",
  "Beachhead": "assets/images/technologies/beachhead-1.png",
  "Roller Shutter Triggers": "assets/images/technologies/roller-shutter-triggers-4.png",
  "Roman Fire": "assets/images/technologies/roman-fire-4.png",
  "Adjustable Crossbars": "assets/images/technologies/adjustable-crossbars-4.png",
  "Additional Barrels": "assets/images/technologies/additional-barrels-4.png",
  "Geometry": "assets/images/technologies/geometry-4.png",
  "Greek Fire Projectiles": "assets/images/technologies/greek-fire-projectiles-4.png",
  "Warwolf Trebuchet": "assets/images/technologies/warwolf-trebuchet-3.png",
  "Counterweight Defenses": "assets/images/technologies/counterweight-defenses-4.png",
  "Shattering Projectiles": "assets/images/technologies/shattering-projectiles-4.png",
  "Prolonged Siege": "assets/images/technologies/prolonged-siege-4.png",
  "Siege Crew Training": "assets/images/technologies/siege-crew-training-4.png",
  "Reload Drills": "assets/images/technologies/reload-drills-4.png",
  "Fine Tuned Guns": "assets/images/technologies/fine-tuned-guns-4.png",
  "Cloud of Terror": "assets/images/technologies/cloud-of-terror-4.png",
  "Siege Crews": "assets/images/technologies/siege-crews-1.png",
  "College of Artillery": "assets/images/technologies/cannon.png",
  "Artillery Shot": "assets/images/abilities/ability-artillery-shot-1.png",
  "Castle of the Crow Aura": "assets/images/abilities/ability-castle-of-the-crow-aura-1.png",
  "Divine Defense": "assets/images/abilities/ability-divine-defense-1.png",
  "Padded Lamellar": "assets/images/technologies/padded-armor-3.png",
  "Quilted Armor": "assets/images/technologies/padded-armor-3.png",
  "Tower Shields": "assets/images/technologies/reinforced-defenses-4.png",
  "Storm Lances": "assets/images/technologies/upgrades.png",
  "Heaven Shaking Thunder": "assets/images/technologies/thunderclap-bombs-4.png",
  "Pili Pao": "assets/images/technologies/upgrades.png",
  "Porcupine Defense": "assets/images/technologies/reinforced-defenses-4.png",
  "Lightweight Frames": "assets/images/technologies/lightweight-beams-4.png",
  "Reinforced Axles": "assets/images/technologies/reinforced-arm-ballista-4.png",
  "Flower Garden": "assets/images/technologies/upgrades.png",
  "Textiles": "assets/images/technologies/textiles-1.png",
  "Wheelbarrow": "assets/images/technologies/wheelbarrow-1.png",
  "Grassland Horses (Melee Cavalry)": "assets/images/technologies/horsemen-2.png",
  "Grassland Horses (Ranged Cavalry)": "assets/images/technologies/horsemen-2.png",
  "Wall Defense": "assets/images/technologies/village-fortresses-3.png",
  "Hill Training": "assets/images/technologies/hill-training-3.png",
  "Improved Torch": "assets/images/abilities/ability-improved-torch-1.png",
  "3 units": "assets/images/technologies/siege-crews-1.png",
  // Non-combat but shown greyed
  "Horse Training": "assets/images/technologies/horse-training-1.png",
  "Mahouts": "assets/images/technologies/mahouts-3.png",
  "Camel Handling": "assets/images/technologies/camel-handling-3.png",
  "Herbal Medicine": "assets/images/technologies/herbal-medicine-3.png",
  "Arrow Volley": "assets/images/technologies/arrow-volley-4.png",
  "Forced March": "assets/images/technologies/forced-march-3.png",
  "Siege Engineering": "assets/images/technologies/siege-engineering-2.png",
  "Siha Bow Limbs": "assets/images/technologies/siha-bow-limbs-3.png",
  "Samurai Bow": "assets/images/technologies/samurai-bow-1.png",
  "Chivalry": "assets/images/technologies/chivalry-3.png",
  "Triple Shot": "assets/images/technologies/triple-shot-3.png",
  "Kabura-ya Whistling Arrow": "assets/images/technologies/kabura-ya-whistling-arrow-3.png",
  "Farima Leadership": "assets/images/technologies/farima-leadership-4.png",
  "Do-maru Armor": "assets/images/technologies/do-maru-armor-4.png",
  "Ferocious Speed": "assets/images/technologies/ferocious-speed-4.png",
  "Elephant Caretakers": "assets/images/technologies/elephant-caretakers-2.png",
  "Local Knowledge": "assets/images/technologies/local-knowledge-2.png",
  "Hippodrome Horseman Aura": "assets/images/units/hippodrome-horseman-1.png",
  "Numeri": "assets/images/technologies/numeri-4.png",
  "Triumph": "assets/images/abilities/ability-triumph-1.png",
};

export const FALLBACK_TECH_IMG = "assets/images/technologies/upgrades.png";

// Per-side state: Map<techKey, { level: number }>
export const activeTechs = { A: new Map(), B: new Map() };
// Track which unit is currently loaded per side (to reset on unit change)
export const techUnitTracker = { A: "", B: "" };

export function getTechKey(item) {
  return `${item.name}|${item.category}`;
}

export function getTechImage(name) {
  return TECH_IMAGE_MAP[name] || FALLBACK_TECH_IMG;
}

export function isCombatCategory(category) {
  return COMBAT_CATEGORIES.has(category);
}

export function filterTechByCiv(item, selectedCiv) {
  if (!selectedCiv) return true;
  if (
    selectedCiv === "Jin Dynasty" &&
    (item.name === "Biology" || item.name === "Elite Army Tactics")
  ) {
    return false;
  }
  if (item.exceptCivs && item.exceptCivs.includes(selectedCiv)) return false;
  if (item.civs && item.civs.length > 0) {
    return item.civs.includes(selectedCiv) || item.civs.includes("Common");
  }
  return true;
}

function parseTorchPercent(description = "") {
  const match = description.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : 0;
}

function parseTorchFireBonus(description = "") {
  const matches = [...description.matchAll(/([+-]?\d+(?:\.\d+)?)\s*fire/gi)];
  if (!matches.length) return 0;
  return Math.max(...matches.map((match) => parseFloat(match[1]) || 0));
}

export function normalizeTorchTechName(name = "", description = "") {
  const raw = String(name || "").trim();
  const normalized = raw
    .toLowerCase()
    .replace(/[():]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lowerDescription = String(description || "").toLowerCase();

  if (
    normalized.includes("additional torches") &&
    (normalized.includes("improved") || lowerDescription.includes("(+5"))
  ) {
    return "Additional Torches Improved";
  }
  if (normalized.includes("additional torches")) return "Additional Torches";
  if (normalized.includes("improved torch")) return "Improved Torch";
  if (normalized.includes("heavy torches")) return "Heavy Torches";
  return raw;
}

export function getTorchTechMeta(item) {
  if (!item) return null;

  const description = String(item.description || "");
  const lowerDescription = description.toLowerCase();
  const displayName = normalizeTorchTechName(item.name, description);
  const effectKey = getTechKey(item);
  const baseMeta = {
    displayName,
    affectsTorchDamage: false,
    torchDamageFlat: 0,
    affectsTorchSpeed: false,
    affectsTorchRange: false,
    affectsTorchAoE: false,
    torchDamagePct: 0,
    simulationMode: "simulated",
  };

  if (
    item.category === "attackSpeed" &&
    (TECH_EFFECTS[effectKey] || lowerDescription.includes("torch"))
  ) {
    return {
      ...baseMeta,
      affectsTorchSpeed: true,
    };
  }

  if (displayName === "Improved Torch") {
    return {
      ...baseMeta,
      affectsTorchDamage: true,
      torchDamagePct: 25,
    };
  }

  if (displayName === "Additional Torches") {
    return {
      ...baseMeta,
      affectsTorchDamage: true,
      torchDamageFlat: parseTorchFireBonus(description) || 3,
    };
  }

  if (displayName === "Additional Torches Improved") {
    return {
      ...baseMeta,
      affectsTorchDamage: true,
      torchDamageFlat: Math.max(5, parseTorchFireBonus(description)),
    };
  }

  if (displayName === "Heavy Torches" || lowerDescription.includes("area of effect to torch")) {
    return {
      ...baseMeta,
      affectsTorchAoE: true,
      simulationMode: "display-only",
    };
  }

  if (lowerDescription.includes("torch range")) {
    return {
      ...baseMeta,
      affectsTorchRange: true,
      simulationMode: "display-only",
    };
  }

  if (lowerDescription.includes("torch")) {
    return {
      ...baseMeta,
      affectsTorchDamage: true,
      torchDamagePct: parseTorchPercent(description),
    };
  }

  return null;
}
