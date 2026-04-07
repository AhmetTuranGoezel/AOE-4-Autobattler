// ========================================
// Build-order civ-specific mechanics (no DOM dependencies)
// ========================================
import { units, unitIndex, getUnitMeta } from "../shared/data.js";
import {
  BO_BASE_RATES, BO_CIV_RATE_OVERRIDES, BO_CIV_STARTING_RESOURCES, BO_STARTING,
  BO_OTTOMAN_VIZIER_CHOICES, BO_OTTOMAN_VIZIER_THRESHOLDS,
  BO_CIV_BONUSES, BO_HOUSE_OF_WISDOM_CIVS,
  BO_BOAR_RESTRICTED_CIVS, BO_MUSLIM_CIVS,
  BO_AYYUBID_HOW_BRANCHES, BO_ABBASID_HOW_WINGS, BO_ABBASID_HOW_CHOICE_DEFS,
  BO_HOUSE_OF_WISDOM_GOLDEN_AGE_LABELS,
  BO_LANDMARK_AUTHORING, BO_BUILDING_DEFAULTS, BO_TECH_DEFAULTS,
  BO_PRODUCTION_BUILDINGS, BO_TECH_BUILDINGS, BO_BASE_TECH_BUILDINGS,
  BO_TECHS_REQUIRING_UNMODELED_EXACT_SITE,
  BO_HOUSE_OF_WISDOM_BUILDING, BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING,
  BO_OTTOMAN_MILITARY_SCHOOL_BUILDING,
  BO_UNIT_ALIASES, BO_EXTRA_UNIT_SPECS,
  getBoBuildingDefaults, getBoTechDefaults,
  setBoBoarRestrictedCivs,
} from "./bo-constants.js";

export function getBoRatesForCiv(civ) {
  const base = { ...BO_BASE_RATES };
  const overrides = BO_CIV_RATE_OVERRIDES[civ] || {};
  Object.entries(overrides).forEach(([key, val]) => {
    base[key] = val;
  });
  return base;
}

export function getBoStartingResourcesForCiv(civ) {
  const override = BO_CIV_STARTING_RESOURCES[civ];
  if (!override) {
    return {
      ...BO_STARTING.resources,
      oliveOil: 0,
      silver: 0
    };
  }
  return {
    food: override.food ?? 0,
    wood: override.wood ?? 0,
    gold: override.gold ?? 0,
    stone: override.stone ?? 0,
    oliveOil: override.oliveOil ?? 0,
    silver: override.silver ?? 0
  };
}

export function getBoAgeBonusValue(byAge, age) {
  if (!byAge) return 0;
  const direct = byAge[age];
  if (Number.isFinite(direct)) return direct;
  const stringVal = byAge[String(age)];
  return Number.isFinite(stringVal) ? stringVal : 0;
}

export function applyBoWorkRateToDuration(duration, workRatePct) {
  const base = Math.max(0, duration || 0);
  const pct = Math.max(0, workRatePct || 0);
  if (!pct) return base;
  return base / (1 + (pct / 100));
}

export function getBoOttomanChoiceDef(choiceId) {
  return BO_OTTOMAN_VIZIER_CHOICES[choiceId] || null;
}

export function getBoOttomanVizierCap(state = null) {
  if (state?.cap && Number.isFinite(state.cap)) return state.cap;
  if (state?.imperialPalace) return 8;
  return 5;
}

export function getBoOttomanVizierPointsEarned(xp = 0, cap = 5) {
  let points = 0;
  for (let i = 0; i < BO_OTTOMAN_VIZIER_THRESHOLDS.length && i < cap; i++) {
    if (xp >= BO_OTTOMAN_VIZIER_THRESHOLDS[i]) points += 1;
  }
  return points;
}

export function getBoOttomanVizierStateFromSample(sample = null) {
  const fallback = {
    xp: 0,
    cap: 5,
    pointsEarned: 0,
    pointsSpent: 0,
    pointsAvailable: 0,
    nextThreshold: BO_OTTOMAN_VIZIER_THRESHOLDS[0],
    imperialPalace: false,
    choices: [],
    effects: {}
  };
  if (!sample?.vizier) return fallback;
  const effects = sample.vizier.effects || {};
  return {
    xp: Math.max(0, sample.vizier.xp || 0),
    cap: getBoOttomanVizierCap(sample.vizier),
    pointsEarned: Math.max(0, sample.vizier.pointsEarned || 0),
    pointsSpent: Math.max(0, sample.vizier.pointsSpent || 0),
    pointsAvailable: Math.max(0, sample.vizier.pointsAvailable || 0),
    nextThreshold: Number.isFinite(sample.vizier.nextThreshold) ? sample.vizier.nextThreshold : null,
    imperialPalace: !!sample.vizier.imperialPalace,
    choices: Array.isArray(sample.vizier.choices) ? sample.vizier.choices.slice() : [],
    effects: { ...effects }
  };
}

export function getBoOttomanLevelStatus(level, state) {
  const previousLevel = level - 1;
  if (level <= 1) return { allowed: true, note: "Available immediately" };
  const hasPreviousChoice = (state?.choices || []).some((choiceId) => getBoOttomanChoiceDef(choiceId)?.level === previousLevel);
  return hasPreviousChoice
    ? { allowed: true, note: "Previous level unlocked" }
    : { allowed: false, note: `Choose a Level ${previousLevel} Vizier point first` };
}

export function getBoOttomanMilitarySchoolConfig(civ) {
  return civ === "Ottomans" ? (BO_CIV_BONUSES?.[civ]?.militarySchool || null) : null;
}

export function isBoHouseOfWisdomCiv(civ) {
  return BO_HOUSE_OF_WISDOM_CIVS.has((civ || "").trim());
}

export function getBoNoBoarCivSet() {
  if (BO_BOAR_RESTRICTED_CIVS?.size) return BO_BOAR_RESTRICTED_CIVS;
  const derived = Object.entries(BO_CIV_BONUSES || {})
    .filter(([, bonus]) => bonus?.noBoar)
    .map(([civ]) => civ);
  if (derived.length) {
    setBoBoarRestrictedCivs(new Set(derived));
    return BO_BOAR_RESTRICTED_CIVS;
  }
  return BO_MUSLIM_CIVS;
}

export function isBoNoBoarCiv(civ) {
  return getBoNoBoarCivSet().has((civ || "").trim());
}

export function getBoBerryBonusConfig(civ) {
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  if (civBonus.berryBonus) return civBonus.berryBonus;
  if (civBonus.grandOrchards) {
    return {
      label: "Grand Orchards",
      requiresMill: true,
      ...civBonus.grandOrchards
    };
  }
  return null;
}

export function getBoHouseOfWisdomConfig(civ) {
  return BO_CIV_BONUSES?.[civ]?.houseOfWisdom || null;
}

export function getBoHouseOfWisdomWingLabel(civ, wing, branch = null) {
  if (civ === "Ayyubids") {
    const wingDef = BO_AYYUBID_HOW_BRANCHES[wing];
    const branchDef = wingDef?.branches?.[branch];
    if (wingDef && branchDef) return `${wingDef.label} / ${branchDef.label}`;
  }
  return BO_ABBASID_HOW_WINGS[wing]?.label || wing || "Wing";
}

export function getBoHouseOfWisdomStateFromSample(sample = null) {
  const fallback = {
    wings: [],
    effects: {},
    goldenAge: {
      count: 0,
      tier: 0,
      bonuses: {}
    }
  };
  if (!sample?.houseOfWisdom) return fallback;
  return {
    wings: Array.isArray(sample.houseOfWisdom.wings) ? sample.houseOfWisdom.wings.map((entry) => ({ ...entry })) : [],
    effects: { ...(sample.houseOfWisdom.effects || {}) },
    goldenAge: {
      count: Math.max(0, sample.houseOfWisdom.goldenAge?.count || 0),
      tier: Math.max(0, sample.houseOfWisdom.goldenAge?.tier || 0),
      bonuses: { ...(sample.houseOfWisdom.goldenAge?.bonuses || {}) }
    }
  };
}

export function getBoPlannedHouseOfWisdomWings(civ, commands = []) {
  if (!isBoHouseOfWisdomCiv(civ) || !Array.isArray(commands)) return [];
  const wings = [];
  const seen = new Set();
  commands.forEach((cmd) => {
    if (cmd?.type !== "houseOfWisdomWing") return;
    const wing = cmd.payload?.wing || "culture";
    if (!wing || seen.has(wing)) return;
    seen.add(wing);
    const branch = civ === "Ayyubids"
      ? (cmd.payload?.branch || Object.keys(BO_AYYUBID_HOW_BRANCHES[wing]?.branches || {})[0] || null)
      : null;
    wings.push({
      wing,
      branch,
      targetAge: getBoHouseOfWisdomChoiceAgeFromCount(wings.length)
    });
  });
  return wings;
}

export function formatBoGoldenAgeBonuses(bonuses = {}) {
  const parts = [];
  Object.entries(BO_HOUSE_OF_WISDOM_GOLDEN_AGE_LABELS).forEach(([key, label]) => {
    const value = bonuses?.[key];
    if (!Number.isFinite(value) || value <= 0) return;
    if (key === "siegeCostMult") parts.push(`${label} -${Math.round((1 - value) * 100)}%`);
    else parts.push(`${label} +${Math.round(value)}%`);
  });
  return parts.join(" | ");
}

export function getBoLandmarkAuthoringConfig(civ) {
  const entry = BO_LANDMARK_AUTHORING?.civModes?.[civ] || {};
  if (entry.mode) return entry;
  if (isBoHouseOfWisdomCiv(civ)) return { mode: "houseOfWisdom" };
  if (civ === "Golden Horde") return { mode: "goldenTent" };
  if (civ === "Ottomans") return { mode: "imperialCouncil+named", hideTradeLandmarks: true };
  if (BO_CIV_BONUSES?.[civ]?.landmarksByAge) return { mode: "named", hideTradeLandmarks: true };
  return { mode: "generic" };
}

export function getBoLandmarkAuthoringMode(civ) {
  return getBoLandmarkAuthoringConfig(civ)?.mode || "generic";
}

export function isBoNamedLandmarkAuthoringMode(mode) {
  return mode === "named" || mode === "imperialCouncil+named";
}

export function isBoTradeLandmark(name) {
  return !!BO_BUILDING_DEFAULTS?.[name]?.tradeLandmark;
}

export function getBoLandmarkChoicesForCiv(civ) {
  const mode = getBoLandmarkAuthoringMode(civ);
  if (!isBoNamedLandmarkAuthoringMode(mode)) return {};
  const raw = BO_CIV_BONUSES?.[civ]?.landmarksByAge || {};
  const hideTradeLandmarks = getBoLandmarkAuthoringConfig(civ)?.hideTradeLandmarks !== false;
  const filtered = {};
  Object.entries(raw).forEach(([age, entries]) => {
    filtered[age] = (Array.isArray(entries) ? entries : []).filter((name) => {
      if (!name) return false;
      return !hideTradeLandmarks || !isBoTradeLandmark(name);
    });
  });
  return filtered;
}

export function getBoRusBountyConfig(civ) {
  return BO_CIV_BONUSES?.[civ]?.bounty || null;
}

export function getBoRusBountyState(civ, total = 0) {
  const config = getBoRusBountyConfig(civ);
  const thresholds = Array.isArray(config?.thresholds) ? config.thresholds : [];
  let tier = 0;
  let foodGatherPct = 0;
  thresholds.forEach((entry, idx) => {
    if (!Number.isFinite(entry?.bounty) || total < entry.bounty) return;
    tier = idx + 1;
    foodGatherPct = Math.max(foodGatherPct, entry.foodGatherPct || 0);
  });
  return {
    total: Math.max(0, total || 0),
    tier,
    foodGatherPct,
    goldPerFood: Number.isFinite(config?.goldPerFood) ? config.goldPerFood : 0,
    foodResources: Array.isArray(config?.foodResources) ? config.foodResources.slice() : []
  };
}

export function getBoBuildingSurfaceConfig(buildingType, civ) {
  if (!buildingType) return {};
  return BO_CIV_BONUSES?.[civ]?.landmarkSurfaces?.[buildingType] || {};
}

export function getBoCivUnitTrainOverride(civ, unitName) {
  const resolved = resolveBoUnitName(unitName);
  const overrides = BO_CIV_BONUSES?.[civ]?.unitTrainOverrides || {};
  return overrides?.[unitName] || overrides?.[resolved] || null;
}

export function getBoTrainingSurface(buildingType, civ) {
  if (!buildingType) return null;
  return getBoBuildingSurfaceConfig(buildingType, civ).trainAs || buildingType;
}

export function getBoTechSurface(buildingType, civ) {
  if (!buildingType) return null;
  return getBoBuildingSurfaceConfig(buildingType, civ).techAs || buildingType;
}

export function isBoTownCenterSurface(buildingType, civ) {
  return getBoTrainingSurface(buildingType, civ) === "Town Center";
}

export function isBoProductionSurface(buildingType, civ) {
  const surface = getBoTrainingSurface(buildingType, civ);
  if (civ === "Malians" && buildingType === "Mill") return true;
  return !!surface && BO_PRODUCTION_BUILDINGS.has(surface);
}

export function getBoUnitTrainModifier(buildingType, civ, unitName) {
  const config = getBoBuildingSurfaceConfig(buildingType, civ);
  const unitMods = config.unitTrainMods?.[resolveBoUnitName(unitName)] || config.unitTrainMods?.[unitName] || {};
  return {
    costMult: Number.isFinite(unitMods.costMult) ? unitMods.costMult : 1,
    timePct: Number.isFinite(unitMods.timePct) ? unitMods.timePct : 0
  };
}

export function doesBoTechMatchBuilding(techType, buildingType, civ) {
  if (!buildingType) return false;
  const sites = getBoTechResearchSites(techType);
  if (!sites.length) return false;
  if (sites.includes(buildingType)) return true;
  const techSurface = getBoTechSurface(buildingType, civ);
  return !!techSurface && techSurface !== buildingType && sites.includes(techSurface);
}

export function refreshBoTechBuildings() {
  BO_TECH_BUILDINGS.clear();
  BO_BASE_TECH_BUILDINGS.forEach((name) => BO_TECH_BUILDINGS.add(name));
  Object.entries(BO_TECH_DEFAULTS || {}).forEach(([techName, def]) => {
    const sites = Array.isArray(def?.researchedAt) ? def.researchedAt : [];
    sites.forEach((site) => {
      if (isBoExactResearchSiteSupported(site, techName)) BO_TECH_BUILDINGS.add(site);
    });
  });
}

export function isBoExactResearchSiteSupported(site, techType = "") {
  if (!site) return false;
  if (BO_TECHS_REQUIRING_UNMODELED_EXACT_SITE.has(techType)) return false;
  if (site === BO_HOUSE_OF_WISDOM_BUILDING || site === BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING) return true;
  if (/^Landmark \(Age /.test(site)) return false;
  if (site === "Worker Elephant") return false;
  return !!BO_BUILDING_DEFAULTS?.[site];
}

export function getBoTechResearchSites(techType) {
  const def = getBoTechDefaults(techType) || {};
  const sites = Array.isArray(def.researchedAt)
    ? def.researchedAt.filter((site) => isBoExactResearchSiteSupported(site, techType))
    : [];
  if (sites.length) return Array.from(new Set(sites));
  const millTechs = new Set(["Wheelbarrow", "Horticulture", "Survival Techniques"]);
  if (millTechs.has(techType) && isBoExactResearchSiteSupported("Mill", techType)) return ["Mill"];
  return [];
}

export function isBoTechNoteOnly(techType) {
  return !!getBoTechDefaults(techType)?.noteOnly;
}

export function getBoTechNoteText(techType) {
  if (!isBoTechNoteOnly(techType)) return "";
  return "No Build Order eco effect; tracked for timing only.";
}

export function doesBoPreviewMeetTechRequirements(def, previewState) {
  if (!def) return true;
  const minAge = Math.max(1, def.minAge || 1);
  if ((previewState?.age || 1) < minAge) return false;
  if (Number.isFinite(def.advancesToAge) && (previewState?.age || 1) >= def.advancesToAge) return false;
  const researched = previewState?.researchedTechs || new Set();
  if (researched.has(def.name || "")) return false;
  const reqs = Array.isArray(def.requiresTechs) ? def.requiresTechs : [];
  if (reqs.some((name) => !researched.has(name))) return false;
  const reqBuildings = Array.isArray(def.requiresBuildings) ? def.requiresBuildings : [];
  const buildingCounts = previewState?.buildingCounts || {};
  if (reqBuildings.some((name) => (buildingCounts[name] || 0) <= 0)) return false;
  const reqWing = def.requiresHouseOfWisdomWing || null;
  if (reqWing) {
    const wings = previewState?.houseOfWisdom?.wings || [];
    if (!wings.some((entry) => entry?.wing === reqWing)) return false;
  }
  return true;
}

export function getBoBuildableBuildingsForCiv(civ) {
  const fallbackBuildings = [
    "Farm",
    "Mill",
    "Lumber Camp",
    "Mining Camp",
    "Town Center",
    "Barracks",
    "Archery Range",
    "Stable",
    "Keep",
    "Mosque",
    "Monastery",
    "Prayer Tent",
    "Pasture",
    "Ger",
    "Ovoo",
    "Blacksmith",
    "University",
    "Military School",
    "Landmark (Age II)",
    "Landmark (Age III)",
    "Landmark (Age IV)"
  ];
  const buildingKeys = Object.keys(BO_BUILDING_DEFAULTS || {}).length ? Object.keys(BO_BUILDING_DEFAULTS || {}) : fallbackBuildings;
  const landmarkChoices = getBoLandmarkChoicesForCiv(civ);
  const landmarkMode = getBoLandmarkAuthoringMode(civ);
  const usesNamedLandmarks = isBoNamedLandmarkAuthoringMode(landmarkMode);
  const next = [];
  const seen = new Set();
  const push = (name) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    next.push(name);
  };
  buildingKeys.forEach((name) => {
    if (name === "Landmark (Age II)" || name === "Landmark (Age III)" || name === "Landmark (Age IV)") {
      if (usesNamedLandmarks) {
        const targetAge = name === "Landmark (Age II)" ? "2" : name === "Landmark (Age III)" ? "3" : "4";
        (landmarkChoices?.[targetAge] || []).forEach(push);
      }
      if (usesNamedLandmarks || landmarkMode === "houseOfWisdom" || landmarkMode === "goldenTent") return;
    }
    if (civ === "Rus" && (name === "Mill" || name === "Outpost")) return;
    if (civ === "Malians" && name === "Outpost") return;
    if (civ === "Japanese" && ["House", "Mill", "Mining Camp", "Blacksmith", "Keep", "Monastery"].includes(name)) return;
    if (civ === "Golden Horde" && ["House", "Farm", "Pasture", "Keep", "Stone Wall", "Mill", "Lumber Camp", "Mining Camp", "Outpost", "Mosque", "Monastery", "Landmark (Age II)", "Landmark (Age III)", "Landmark (Age IV)"].includes(name)) return;
    if (name === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING && civ !== "Ottomans") return;
    const def = BO_BUILDING_DEFAULTS?.[name];
    if (Array.isArray(def?.civs) && civ && !def.civs.includes(civ)) return;
    if (def?.buildable === false) return;
    if (def?.landmarkAge) return;
    push(name);
  });
  return next;
}

export function getBoHouseOfWisdomGoldenAgeState(civ, buildingCount = 0) {
  const tiers = getBoHouseOfWisdomConfig(civ)?.goldenAgeTiers || [];
  let tier = 0;
  const bonuses = {};
  tiers.forEach((entry, idx) => {
    if ((buildingCount || 0) < (entry.threshold || 0)) return;
    tier = idx + 1;
    Object.entries(entry).forEach(([key, value]) => {
      if (key === "threshold" || !Number.isFinite(value)) return;
      bonuses[key] = value;
    });
  });
  return { count: Math.max(0, buildingCount || 0), tier, bonuses };
}

export function getBoLandmarkAgeCost(targetAge = 2) {
  const key = `Landmark (Age ${targetAge})`;
  const def = getBoBuildingDefaults(key) || {};
  return {
    food: def.cost?.food || 0,
    wood: def.cost?.wood || 0,
    gold: def.cost?.gold || 0,
    stone: def.cost?.stone || 0
  };
}

export function getBoHouseOfWisdomChoiceAgeFromCount(completedCount = 0) {
  return Math.min(4, 2 + Math.max(0, completedCount || 0));
}

export function getBoHouseOfWisdomCompletedCountBefore(cmd, commands = []) {
  const idx = commands.findIndex((entry) => entry.id === cmd?.id);
  const source = idx >= 0 ? commands.slice(0, idx) : commands.slice();
  return source.filter((entry) => entry?.type === "houseOfWisdomWing").length;
}

export function getBoHouseOfWisdomCommandSpec(cmd, civ, options = {}) {
  const howConfig = getBoHouseOfWisdomConfig(civ) || {};
  const completedCount = options.completedCount ?? getBoHouseOfWisdomCompletedCountBefore(cmd, options.commands || []);
  const targetAge = getBoHouseOfWisdomChoiceAgeFromCount(completedCount);
  const effects = options.effects || {};
  let cost = getBoLandmarkAgeCost(targetAge);
  let time = howConfig.baseAgeUpTime || (civ === "Ayyubids" ? 120 : 100);
  if (civ === "Ayyubids" && cmd?.payload?.branch === "advancement") {
    const advancement = howConfig.advancementByAge || {};
    const advancementDef = advancement[targetAge] || advancement[String(targetAge)] || {};
    cost = {
      food: advancementDef.cost?.food || cost.food,
      wood: advancementDef.cost?.wood || 0,
      gold: advancementDef.cost?.gold || cost.gold,
      stone: advancementDef.cost?.stone || 0
    };
    time = advancementDef.time || 96;
  }
  if (effects.preservationOfKnowledge) {
    cost = {
      food: Math.round((cost.food || 0) * 0.8),
      wood: Math.round((cost.wood || 0) * 0.8),
      gold: Math.round((cost.gold || 0) * 0.8),
      stone: Math.round((cost.stone || 0) * 0.8)
    };
  }
  if (Number.isFinite(options.researchPct) && options.researchPct > 0) {
    time = applyBoWorkRateToDuration(time, options.researchPct);
  }
  return { targetAge, cost, time };
}

export function getBoHouseOfWisdomWingDescription(civ, wing, branch = null, targetAge = 2) {
  if (civ === "Ayyubids") {
    const ageName = targetAge === 2 ? "Feudal" : targetAge === 3 ? "Castle" : "Imperial";
    if (wing === "culture" && branch === "advancement") return `${ageName} discount age-up`;
    if (wing === "culture" && branch === "logistics") return `Spawn ${targetAge === 2 ? 2 : targetAge === 3 ? 3 : 4} Dervishes`;
    if (wing === "economic" && branch === "growth") return targetAge === 2 ? "Spawn 3 Villagers, Orchards +50" : targetAge === 3 ? "Spawn 7 Villagers, Orchards +100" : "Spawn 10 Villagers, +10% villager work";
    if (wing === "economic" && branch === "industry") return targetAge === 2 ? "Grant 400 wood, +30% build speed" : targetAge === 3 ? "Grant 900 wood + 400 stone, +40% build speed" : "Grant 2000 wood + 1000 stone, +50% build speed";
    if (wing === "military" && branch === "masterSmiths") return "Grant free Blacksmith techs / Military Academy";
    if (wing === "military" && branch === "reinforcement") return targetAge === 2 ? "Desert Raider trickle" : targetAge === 3 ? "Spawn 3 Desert Raiders, then trickle" : "Spawn 7 Desert Raiders, then trickle";
    if (wing === "trade" && branch === "advisors") return `Spawn ${targetAge === 2 ? 3 : targetAge === 3 ? 5 : 7} Atabegs`;
    if (wing === "trade" && branch === "bazaar") return "Track Bazaar caravan bonus";
  }
  const wingDef = BO_ABBASID_HOW_WINGS[wing];
  if (!wingDef) return "";
  const unlocks = Object.keys(wingDef.choicesByAge || {})
    .map((ageKey) => parseInt(ageKey, 10))
    .filter((ageKey) => ageKey <= targetAge)
    .sort((a, b) => a - b)
    .flatMap((ageKey) => wingDef.choicesByAge[ageKey] || [])
    .map((choiceId) => BO_ABBASID_HOW_CHOICE_DEFS[choiceId]?.label || choiceId);
  const spawn = wingDef.spawnByAge?.[targetAge] || null;
  return [unlocks.length ? unlocks.join(", ") : "", spawn].filter(Boolean).join(" | ");
}

export function getBoHouseOfWisdomActionChoices(civ, state = null) {
  const currentState = state || getBoHouseOfWisdomStateFromSample(null);
  const effectiveWings = (currentState.wings || []).length
    ? currentState.wings
    : getBoPlannedHouseOfWisdomWings(civ);
  const usedWings = new Set(effectiveWings.map((entry) => entry.wing));
  const targetAge = getBoHouseOfWisdomChoiceAgeFromCount(effectiveWings.length);
  if (civ === "Ayyubids") {
    return Object.entries(BO_AYYUBID_HOW_BRANCHES)
      .filter(([wing]) => !usedWings.has(wing))
      .flatMap(([wing, wingDef]) => Object.entries(wingDef.branches || {}).map(([branch, branchDef]) => ({
        wing,
        branch,
        label: `${wingDef.label} / ${branchDef.label}`,
        description: getBoHouseOfWisdomWingDescription(civ, wing, branch, targetAge)
      })));
  }
  return Object.entries(BO_ABBASID_HOW_WINGS)
    .filter(([wing]) => !usedWings.has(wing))
    .map(([wing, wingDef]) => ({
      wing,
      branch: null,
      label: wingDef.label,
      description: getBoHouseOfWisdomWingDescription(civ, wing, null, targetAge)
    }));
}

export function resolveBoUnitName(unitName) {
  return BO_UNIT_ALIASES[unitName] || unitName;
}

export function getBoExtraUnitSpec(unitName, civ) {
  const direct = BO_EXTRA_UNIT_SPECS[unitName] || BO_EXTRA_UNIT_SPECS[resolveBoUnitName(unitName)];
  if (!direct) return null;
  if (Array.isArray(direct.civs) && civ && !direct.civs.includes(civ)) return null;
  return direct;
}

export function getBoUnitAgeList(unitName, civ) {
  const extra = getBoExtraUnitSpec(unitName, civ);
  if (extra?.ages?.length) return extra.ages.slice();
  const resolved = resolveBoUnitName(unitName);
  if (resolved === "Villager" || resolved === "Scout") return [1, 2, 3, 4];
  if (civ === "Holy Roman Empire" && resolved === "MAA") return [2, 3, 4];
  if (civ === "Japanese" && resolved === "Samurai") return [1, 2, 3, 4];
  if (civ === "Rus" && resolved === "Knight/Lancer") return [2, 3, 4];
  const unit = getUnitMeta(resolved);
  if (Array.isArray(unit?.ages) && unit.ages.length) return unit.ages.slice();
  return [1, 2, 3, 4];
}

export function getBoUnitMinAge(unitName, civ) {
  const ages = getBoUnitAgeList(unitName, civ).filter((age) => Number.isFinite(age));
  return ages.length ? Math.min(...ages) : 1;
}

export function isBoUnitTrainableAtBuilding(unitName, buildingType, civ, ottomanSettings = null) {
  const trainingSurface = getBoTrainingSurface(buildingType, civ);
  const resolved = resolveBoUnitName(unitName);
  if (trainingSurface === "Hunting Cabin") {
    return resolved === "Scout";
  }
  if (trainingSurface === "Town Center") {
    return resolved === "Villager" || resolved === "Scout";
  }
  if (buildingType === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING) {
    const school = getBoOttomanMilitarySchoolConfig(civ);
    if (!school) return false;
    const baseUnits = school.baseUnits || [];
    const advancedUnits = school.advancedAcademyUnits || [];
    if (unitName === "Akinji") return !!ottomanSettings?.akinjiSystem;
    if (baseUnits.includes(unitName)) return true;
    return !!ottomanSettings?.advancedAcademy && advancedUnits.includes(unitName);
  }
  if (civ === "Ottomans" && buildingType === "Archery Range" && unitName === "Akinji" && !ottomanSettings?.akinjiSystem) {
    return false;
  }
  const extra = getBoExtraUnitSpec(unitName, civ);
  if (extra?.buildings?.length) {
    return extra.buildings.includes(buildingType) || extra.buildings.includes(trainingSurface);
  }
  const unit = getUnitMeta(resolved);
  if (!unit) return false;
  const tags = Array.isArray(unit.tags) ? unit.tags : [];
  const category = String(unit.category || "");
  if (trainingSurface === "Siege Workshop") return tags.includes("Siege") || category === "Siege";
  if (trainingSurface === "Stable") return tags.includes("Cavalry") && !tags.includes("Ranged");
  if (trainingSurface === "Archery Range") return !tags.includes("Siege") && (tags.includes("Ranged") || category.includes("Ranged"));
  if (trainingSurface === "Barracks") return tags.includes("Infantry") && !tags.includes("Ranged") && !tags.includes("Siege");
  return false;
}

export function getBoUnitOptionsForBuilding(buildingType, civ, ottomanSettings = null) {
  if (!buildingType) return [];
  if (buildingType === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING) {
    const school = getBoOttomanMilitarySchoolConfig(civ);
    if (!school) return [];
    const choices = [...(school.baseUnits || [])];
    if (ottomanSettings?.akinjiSystem) choices.push("Akinji");
    if (ottomanSettings?.advancedAcademy) choices.push(...(school.advancedAcademyUnits || []));
    return Array.from(new Set(choices));
  }
  return getBoUnitOptions(civ).filter((unitName) => isBoUnitTrainableAtBuilding(unitName, buildingType, civ, ottomanSettings));
}

export function getBoUnitOptions(civ) {
  const base = unitIndex?.units ? Object.keys(unitIndex.units) : (units ? Object.keys(units) : []);
  const pool = civ
    ? base.filter((name) => {
      const unit = getUnitMeta(name);
      const civs = unit.civs || [];
      const exceptCivs = unit.exceptCivs || [];
      return (civs.includes("Common") || civs.includes(civ)) && !exceptCivs.includes(civ);
    })
    : base.slice();
  const extraUnits = Object.entries(BO_EXTRA_UNIT_SPECS)
    .filter(([, spec]) => !civ || !Array.isArray(spec?.civs) || spec.civs.includes(civ))
    .map(([name]) => name);
  const list = ["Villager", "Scout", ...pool, ...extraUnits];
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}

