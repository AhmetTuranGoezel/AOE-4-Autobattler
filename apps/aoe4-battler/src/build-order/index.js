import { units, unitIndex, getUnitMeta } from "../shared/data.js";
import { CIV_ORDER, getCivFlagHtml, setFlagBackground } from "../shared/constants.js";

// ========================================
// BUILD ORDER (MVP)
// ========================================

let boCommands = [];
let boSelectedCommandId = null;
let boLastResults = null;
let boLastCommandType = "assign";
let boIdCounter = 1;
let boOverlayEnabled = true;
let boTargetBuilding = null;
let boSelectedBuilding = null;
let boHoverTime = null;
let boPinnedTime = null;
let boRunTimer = null;
let boPersistTimer = null;
let boMarkerDraft = null;
let boEditorScrollFrame = null;
let boOttomanLegacyWarning = "";

const BO_SAVE_STORAGE_KEY = "aoe4Battler.buildOrder.local.v1";
const BO_SAVE_DRAFT_ID = "__draft__";
const BO_SAVE_STORAGE_VERSION = 2;

const BO_FOOD_SOURCES = ["berries", "deer", "boar", "sheep", "farm"];
const BO_FINITE_FOOD_SOURCES = ["berries", "deer", "boar", "sheep"];
const BO_RESOURCE_KEYS = [...BO_FOOD_SOURCES, "wood", "gold", "stone"];
const BO_RESOURCE_LABELS = {
  sheep: "Sheep",
  berries: "Berries",
  deer: "Deer",
  boar: "Boar",
  farm: "Farm",
  wood: "Wood",
  gold: "Gold",
  stone: "Stone"
};
const BO_ASSIGN_CAP_ORDER = ["stone", "gold", "wood", "farm", "sheep", "boar", "deer", "berries"];
const BO_VILLAGER_TIME = 20;
const BO_TIMELINE_BLOCK_HEIGHT = 28;
const BO_ASSIGN_BLOCK_HEIGHT = 36;
const BO_TIMELINE_ROW_GAP = 6;
const BO_TIMELINE_HEADER_HEIGHT = 24;
const BO_LANE_CAPTION_HEIGHT = 16;
const BO_RESOURCE_MARKER_HEIGHT = 18;
const BO_RESOURCE_MARKER_GAP = 6;
const BO_TIMELINE_PADDING = 12;
const BO_RESOURCE_LANE_HEIGHT = 150;
const BO_TC_MARKER_DURATION = 6;
let BO_BASE_RATES = {
  berries: 0.69,
  deer: 0.825,
  boar: 0.9,
  sheep: 0.75,
  farm: 0.75,
  wood: 0.75,
  gold: 0.75,
  stone: 0.75
};

let BO_CIV_RATE_OVERRIDES = {
  "House of Lancaster": { sheep: 0.9 },
  "Knights Templar": { wood: 0.6 }
};

let BO_NODE_AMOUNTS = { sheep: 200, berries: 250, deer: 350, boar: 2400 };
let BO_STARTING = {
  resources: { food: 200, wood: 150, gold: 100, stone: 0 },
  sheep: 5
};
const BO_STARTING_VILLAGERS = 6;
const BO_DEFAULT_NODE_COUNTS = { sheep: 5, berries: 7, deer: 7, boar: 1 };
const BO_DEFAULT_CARRY = { sheep: 10, berries: 10, deer: 25, boar: 25, farm: 10, wood: 10, gold: 10, stone: 10 };
const BO_DEFAULT_TRIP = { sheep: 0.1, berries: 1.1, deer: 1.7, boar: 1.7, farm: 1.1, wood: 1.7, gold: 1.1, stone: 1.1 };
const BO_WHEEL_CARRY_BONUS = 5;
const BO_WHEEL_TRIP_MULT = 1 / 1.15;
const BO_DROPOFF_ANIMATION_SEC = 0.5;
const BO_FOOD_UPGRADE_MULT = 1.1;
const BO_SPECIAL_RES_KEYS = ["oliveOil", "silver"];
const BO_CAPITAL_TC_ANCHOR = "__bo_tc1__";
const BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING = "Imperial Council";
const BO_HOUSE_OF_WISDOM_BUILDING = "House of Wisdom";
const BO_TIMELINE_BUILDING_SET = new Set([
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop",
  "Military School",
  "Mill",
  "Blacksmith",
  "University",
  "Mosque",
  "Monastery",
  "Prayer Tent",
  "Town Center",
  "Imperial Council",
  "House of Wisdom",
  "Landmark (Age II)",
  "Landmark (Age III)",
  "Landmark (Age IV)",
  "Twin Minaret Medrese",
  "Mehmed Imperial Armory",
  "Istanbul Imperial Palace",
  "Istanbul Observatory",
  "Aachen Chapel",
  "Meinwerk Palace",
  "Burgrave Palace",
  "Regnitz Cathedral",
  "Elzbach Palace",
  "Palace of Swabia",
  "Hunting Cabin",
  "Wooden Fortress",
  "Golden Gate",
  "Kremlin",
  "Abbey of the Trinity",
  "High Trade House",
  "High Armory",
  "Spasskaya Tower",
  "Farmhouse",
  "Forge",
  "Pit Mine",
  "Cattle Ranch",
  "Toll Outpost",
  "Saharan Trade Network",
  "Mansa Quarry",
  "Grand Fulani Corral",
  "Farimba Garrison",
  "Fort of the Huntress",
  "Griot Bara",
  "Buddhist Temple",
  "Shinto Shrine",
  "Kura Storehouse",
  "Temple of Equality",
  "Floating Gate",
  "Koka Township",
  "Castle of the Crow",
  "Tanegashima Gunsmith"
]);
const BO_TRAINING_BUILDING_SET = new Set([
  "Town Center",
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop",
  "Military School",
  "Hunting Cabin",
  "Buddhist Temple",
  "Shinto Shrine",
  "Koka Township",
  "Tanegashima Gunsmith"
]);
const BO_PRODUCTION_BUILDINGS = new Set([
  "Town Center",
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop",
  "Military School",
  "Hunting Cabin",
  "Buddhist Temple",
  "Shinto Shrine",
  "Koka Township",
  "Tanegashima Gunsmith"
]);
const BO_TECH_BUILDINGS = new Set([
  "Mill",
  "Blacksmith",
  "Mosque",
  "Monastery",
  "Prayer Tent"
]);
const BO_BASE_TECH_BUILDINGS = ["Mill", "Blacksmith", "Mosque", "Monastery", "Prayer Tent"];
const BO_TECHS_REQUIRING_UNMODELED_EXACT_SITE = new Set([
  "Ajmer Benefactor",
  "Burgundian Imports",
  "Carrying Frame",
  "Collateral Damage",
  "Collar of Esses",
  "Curse of Auliya",
  "Dome of the Faith",
  "Elephant Caretakers",
  "Elephant Harness",
  "Field Repair Site",
  "Hearty Rations",
  "Hill Training",
  "Honed Blades",
  "Khanda Drills",
  "Mahouts",
  "Military Tactics Training",
  "Neza Training",
  "Paiks",
  "Red Brick Bastions",
  "Reinforced Foundations",
  "Shahi Walls",
  "Ships of the Crown",
  "Tranquil Venue",
  "Warwolf Trebuchet",
  "Woven Baskets"
]);
let BO_BUILD_TIME_MULT_BY_VILLAGERS = { 1: 1 };
let BO_BUILDING_DEFAULTS = {};
let BO_TECH_DEFAULTS = {};
let BO_CIV_BONUSES = {};
let BO_MUSLIM_CIVS = new Set([
  "Abbasid Dynasty",
  "Ayyubids",
  "Delhi Sultanate",
  "Tughlaq Dynasty",
  "Ottomans"
]);
let BO_MUSLIM_BERRY_BONUS = { capacityBonusPerNode: 100, gatherBonusPct: 25, carryBonus: 3 };
let BO_SACRED_SITE_GOLD_PER_MIN = 100;
let BO_PASTURE_SHEEP_SECONDS = 116;
let BO_OVOO_STONE_PER_MIN_BY_AGE = { 1: 70, 2: 100, 3: 130, 4: 160 };
let BO_SCHOLAR = { costGold: 135, costGoldDome: 80, time: 30 };
const BO_CIV_STARTING_RESOURCES = {
  "English": { food: 200, wood: 200, gold: 100, stone: 0 },
  "House of Lancaster": { food: 200, wood: 200, gold: 100, stone: 0 },
  "Rus": { food: 200, wood: 200, gold: 100, stone: 0 },
  "Delhi Sultanate": { food: 200, wood: 200, gold: 100, stone: 0 },
  "Order of the Dragon": { food: 200, wood: 200, gold: 100, stone: 0 },
  "Abbasid Dynasty": { food: 200, wood: 200, gold: 100, stone: 0 },
  "Ayyubids": { food: 200, wood: 200, gold: 100, stone: 0 },
  "Tughlaq Dynasty": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Sengoku Daimyo": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Malians": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Mongols": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Jeanne d'Arc": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Chinese": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Japanese": { food: 200, wood: 150, gold: 100, stone: 0 },
  "French": { food: 200, wood: 150, gold: 100, stone: 0 },
  "Knights Templar": { food: 200, wood: 100, gold: 100, stone: 0 },
  "Zhu Xi's Legacy": { food: 150, wood: 200, gold: 100, stone: 0 },
  "Holy Roman Empire": { food: 200, wood: 150, gold: 0, stone: 0 },
  "Ottomans": { food: 200, wood: 200, gold: 100, stone: 50 },
  "Golden Horde": { food: 200, wood: 225, gold: 150, stone: 50 },
  "Byzantines": { food: 200, wood: 150, gold: 100, stone: 100, oliveOil: 100 },
  "Macedonian Dynasty": { food: 200, wood: 200, gold: 100, stone: 0, silver: 100 }
};
let BO_BOAR_RESTRICTED_CIVS = BO_MUSLIM_CIVS;
const BO_ENGLISH_FARM_BONUS_CIVS = new Set(["English", "House of Lancaster"]);
const BO_ENGLISH_FARM_BONUS_BY_AGE = { 1: 20, 2: 25, 3: 30, 4: 30 };
const BO_ENGLISH_FARM_GOLD_PER_SEC = 1 / 6;
const BO_ENGLISH_FARM_COST_MULT = 0.5;
const BO_AGE_UP_TIME_DEFAULTS = { 2: 190, 3: 220 };
const BO_OTTOMAN_MILITARY_SCHOOL_BUILDING = "Military School";
const BO_HOUSE_OF_WISDOM_CIVS = new Set(["Abbasid Dynasty", "Ayyubids"]);
const BO_SUPPORTED_CIVS = new Set([
  "Abbasid Dynasty",
  "Ayyubids",
  "Delhi Sultanate",
  "English",
  "French",
  "Holy Roman Empire",
  "House of Lancaster",
  "Japanese",
  "Jeanne d'Arc",
  "Knights Templar",
  "Malians",
  "Mongols",
  "Ottomans",
  "Rus",
  "Tughlaq Dynasty"
]);
const BO_UNIT_ALIASES = {
  "Crossbowman": "Crossbow",
  "Man-at-Arms": "MAA",
  "Lancer": "Knight/Lancer"
};
const BO_EXTRA_UNIT_SPECS = {
  "Mehter": {
    civs: ["Ottomans"],
    cost: { food: 100, wood: 0, gold: 80, stone: 0 },
    time: 28,
    ages: [2, 3, 4],
    buildings: ["Stable", BO_OTTOMAN_MILITARY_SCHOOL_BUILDING]
  },
  "Janissary": {
    civs: ["Ottomans"],
    cost: { food: 60, wood: 0, gold: 100, stone: 0 },
    time: 24,
    ages: [3, 4],
    buildings: ["Archery Range", BO_OTTOMAN_MILITARY_SCHOOL_BUILDING]
  },
  "Worker Elephant": {
    civs: ["Tughlaq Dynasty"],
    cost: { food: 25, wood: 50, gold: 0, stone: 0 },
    time: 0.1,
    ages: [1, 2, 3, 4],
    buildings: ["Town Center"],
    population: 0
  },
  "Buddhist Monk": {
    civs: ["Japanese"],
    cost: { food: 0, wood: 0, gold: 80, stone: 0 },
    time: 30,
    ages: [3, 4],
    buildings: ["Buddhist Temple", "Temple of Equality"]
  },
  "Shinto Priest": {
    civs: ["Japanese"],
    cost: { food: 0, wood: 0, gold: 150, stone: 0 },
    time: 30,
    ages: [3, 4],
    buildings: ["Shinto Shrine", "Floating Gate"]
  },
  "Shinobi": {
    civs: ["Japanese"],
    cost: { food: 50, wood: 0, gold: 50, stone: 0 },
    time: 20,
    ages: [2, 3, 4],
    buildings: ["Koka Township"]
  },
  "Ozutsu": {
    civs: ["Japanese"],
    cost: { food: 85, wood: 0, gold: 155, stone: 0 },
    time: 35,
    ages: [4],
    buildings: ["Tanegashima Gunsmith"]
  },
  "Cattle": {
    civs: ["Malians"],
    cost: { food: 0, wood: 0, gold: 90, stone: 0 },
    time: 15,
    ages: [1, 2, 3, 4],
    buildings: ["Mill"],
    population: 0
  }
};
const BO_OTTOMAN_VIZIER_THRESHOLDS = [60, 160, 310, 550, 870, 1190, 1510, 1830];
const BO_OTTOMAN_VIZIER_AGE_XP = { 2: 15, 3: 45, 4: 100 };
const BO_OTTOMAN_VIZIER_UNIT_XP = {
  "Villager": 2,
  "Scout": 2,
  "Spearman": 2,
  "Archer": 2,
  "Sipahi": 4,
  "Akinji": 5,
  "Man-at-Arms": 3,
  "MAA": 3,
  "Crossbowman": 3,
  "Crossbow": 3,
  "Mehter": 5,
  "Janissary": 4,
  "Lancer": 6,
  "Knight/Lancer": 6,
  "Battering Ram": 5,
  "Ram": 5,
  "Springald": 6,
  "Mangonel": 15,
  "Counterweight Trebuchet": 14,
  "Trebuchet": 14,
  "Ribauldequin": 21,
  "Great Bombard": 31
};
const BO_OTTOMAN_DEFENSIVE_BUILDINGS = new Set(["Town Center", "Outpost", "Keep"]);
const BO_ABBASID_HOW_WINGS = {
  culture: {
    label: "Culture Wing",
    choicesByAge: {
      2: ["preservationOfKnowledge"],
      3: ["medicalCenters"],
      4: ["publicLibraries"]
    }
  },
  economic: {
    label: "Economic Wing",
    choicesByAge: {
      2: ["fertileCrescent"],
      3: ["agriculture"],
      4: ["improvedProcessing"]
    }
  },
  military: {
    label: "Military Wing",
    choicesByAge: {
      2: ["bootCamp"],
      3: ["compositeBows"],
      4: ["camelSupport"]
    },
    spawnByAge: {
      2: "Spawn 2 Spearmen and 2 Archers",
      3: "Spawn 2 Camel Riders",
      4: "Spawn 3 Handcannoneers"
    }
  },
  trade: {
    label: "Trade Wing",
    choicesByAge: {
      2: ["armoredCaravans"],
      3: ["grandBazaar"],
      4: ["spiceRoads"]
    },
    spawnByAge: {
      2: "Spawn 4 Trade Caravans",
      3: "Spawn 5 Trade Caravans",
      4: "Spawn 6 Trade Caravans"
    }
  }
};
const BO_ABBASID_HOW_CHOICE_DEFS = {
  preservationOfKnowledge: {
    id: "preservationOfKnowledge",
    label: "Preservation of Knowledge",
    effectNote: "Techs and future House of Wisdom wings cost 20% less."
  },
  medicalCenters: {
    id: "medicalCenters",
    label: "Medical Centers",
    effectNote: "Keeps and Town Centers heal nearby units (tracked only)."
  },
  publicLibraries: {
    id: "publicLibraries",
    label: "Public Libraries",
    effectNote: "Villagers and Trade Caravans gain +2 HP per economic technology (tracked only)."
  },
  fertileCrescent: {
    id: "fertileCrescent",
    label: "Fertile Crescent",
    effectNote: "Economic buildings and Houses cost 30% less."
  },
  agriculture: {
    id: "agriculture",
    label: "Agriculture",
    effectNote: "Farms gather 15% faster."
  },
  improvedProcessing: {
    id: "improvedProcessing",
    label: "Improved Processing",
    effectNote: "Villager dropoffs return 8% more resources."
  },
  bootCamp: {
    id: "bootCamp",
    label: "Boot Camp",
    effectNote: "Infantry +15% hit points (tracked only)."
  },
  compositeBows: {
    id: "compositeBows",
    label: "Composite Bows",
    effectNote: "Archers +30% attack speed (tracked only)."
  },
  camelSupport: {
    id: "camelSupport",
    label: "Camel Support",
    effectNote: "Camels grant nearby infantry +2 armor (tracked only)."
  },
  armoredCaravans: {
    id: "armoredCaravans",
    label: "Armored Caravans",
    effectNote: "Trade armor bonus unlocked (trade tracked only)."
  },
  grandBazaar: {
    id: "grandBazaar",
    label: "Grand Bazaar",
    effectNote: "Trade bonus unlocked (tracked only)."
  },
  spiceRoads: {
    id: "spiceRoads",
    label: "Spice Roads",
    effectNote: "Trade units generate +30% gold (tracked only)."
  }
};
const BO_AYYUBID_HOW_BRANCHES = {
  culture: {
    label: "Culture Wing",
    branches: {
      advancement: { label: "Advancement" },
      logistics: { label: "Logistics" }
    }
  },
  economic: {
    label: "Economic Wing",
    branches: {
      growth: { label: "Growth" },
      industry: { label: "Industry" }
    }
  },
  military: {
    label: "Military Wing",
    branches: {
      masterSmiths: { label: "Master Smiths" },
      reinforcement: { label: "Reinforcement" }
    }
  },
  trade: {
    label: "Trade Wing",
    branches: {
      advisors: { label: "Advisors" },
      bazaar: { label: "Bazaar" }
    }
  }
};
const BO_HOUSE_OF_WISDOM_GOLDEN_AGE_LABELS = {
  gatherPct: "Gather",
  researchPct: "Research",
  productionPct: "Production",
  siegeCostMult: "Siege cost",
  camelAttackSpeedPct: "Camel attack"
};
const BO_OTTOMAN_VIZIER_CHOICES = {
  fieldWork: {
    id: "fieldWork",
    label: "Field Work",
    level: 1,
    description: "Spawn 2 Imams at the Capital Town Center.",
    effectNote: "Spawns 2 Imams at the Capital Town Center."
  },
  mehterDrums: {
    id: "mehterDrums",
    label: "Mehter Drums",
    level: 1,
    description: "Spawn 2 Mehters at the Capital Town Center.",
    effectNote: "Spawns 2 Mehters at the Capital Town Center."
  },
  anatolianHills: {
    id: "anatolianHills",
    label: "Anatolian Hills",
    level: 1,
    description: "Spawn 10 Sheep and increase villager gold/stone mining by 15%.",
    effectNote: "Adds 10 Sheep and +15% villager gold/stone mining."
  },
  militaryCampus: {
    id: "militaryCampus",
    label: "Military Campus",
    level: 2,
    description: "Increase the Military School cap by +1.",
    effectNote: "Military School cap increased by +1."
  },
  akinjiSystem: {
    id: "akinjiSystem",
    label: "Akinji System",
    level: 2,
    description: "Unlock Akinji at Archery Range and Military School, and spawn 3 Akinji.",
    effectNote: "Unlocks Akinji and spawns 3 Akinji at the Capital Town Center."
  },
  extensiveFortifications: {
    id: "extensiveFortifications",
    label: "Extensive Fortifications",
    level: 2,
    description: "Town Centers, Outposts, and Keeps cost 20% less.",
    effectNote: "Town Centers, Outposts, and Keeps cost 20% less."
  },
  advancedAcademy: {
    id: "advancedAcademy",
    label: "Advanced Academy",
    level: 3,
    description: "+25% military production speed; unlock Lancer and Janissary in Military Schools from Age III.",
    effectNote: "+25% military production speed and Military School unlocks."
  },
  janissaryCompany: {
    id: "janissaryCompany",
    label: "Janissary Company",
    level: 3,
    description: "Spawn 2 Janissaries plus 2 more per Military School.",
    effectNote: "Spawns Janissaries at the Capital Town Center."
  },
  paxOttomana: {
    id: "paxOttomana",
    label: "Pax Ottomana",
    level: 3,
    description: "Villagers train 75% faster for 4 minutes.",
    effectNote: "Villagers train 75% faster for 4 minutes."
  },
  siegeCrews: {
    id: "siegeCrews",
    label: "Siege Crews",
    level: 4,
    description: "Track siege garrison/setup bonus as an unlocked effect.",
    effectNote: "Siege Crews unlocked (combat effect tracked only)."
  },
  greatBombard: {
    id: "greatBombard",
    label: "Great Bombard",
    level: 4,
    description: "Spawn 1 Great Bombard at the Capital Town Center.",
    effectNote: "Spawns 1 Great Bombard at the Capital Town Center."
  },
  tradeBags: {
    id: "tradeBags",
    label: "Trade Bags",
    level: 4,
    description: "Trade-only bonus. Visible for reference but not modeled in Build Order.",
    effectNote: "Trade not modeled in Build Order.",
    modeled: false
  }
};
const BO_OTTOMAN_VIZIER_LEVELS = [1, 2, 3, 4].map((level) => ({
  level,
  choices: Object.values(BO_OTTOMAN_VIZIER_CHOICES).filter((choice) => choice.level === level).map((choice) => choice.id)
}));

function getBoRatesForCiv(civ) {
  const base = { ...BO_BASE_RATES };
  const overrides = BO_CIV_RATE_OVERRIDES[civ] || {};
  Object.entries(overrides).forEach(([key, val]) => {
    base[key] = val;
  });
  return base;
}

function getBoStartingResourcesForCiv(civ) {
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

function getBoAgeBonusValue(byAge, age) {
  if (!byAge) return 0;
  const direct = byAge[age];
  if (Number.isFinite(direct)) return direct;
  const stringVal = byAge[String(age)];
  return Number.isFinite(stringVal) ? stringVal : 0;
}

function applyBoWorkRateToDuration(duration, workRatePct) {
  const base = Math.max(0, duration || 0);
  const pct = Math.max(0, workRatePct || 0);
  if (!pct) return base;
  return base / (1 + (pct / 100));
}

function getBoOttomanChoiceDef(choiceId) {
  return BO_OTTOMAN_VIZIER_CHOICES[choiceId] || null;
}

function getBoOttomanVizierCap(state = null) {
  if (state?.cap && Number.isFinite(state.cap)) return state.cap;
  if (state?.imperialPalace) return 8;
  return 5;
}

function getBoOttomanVizierPointsEarned(xp = 0, cap = 5) {
  let points = 0;
  for (let i = 0; i < BO_OTTOMAN_VIZIER_THRESHOLDS.length && i < cap; i++) {
    if (xp >= BO_OTTOMAN_VIZIER_THRESHOLDS[i]) points += 1;
  }
  return points;
}

function getBoOttomanVizierStateFromSample(sample = null) {
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

function getBoOttomanPreviewState(timeOverride = null) {
  const civ = (document.getElementById("boCiv")?.value || "").trim();
  if (civ !== "Ottomans") return getBoOttomanVizierStateFromSample(null);
  const sample = getBoSampleAtTimeFromSamples(
    Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime(),
    boLastResults?.samples || []
  );
  return getBoOttomanVizierStateFromSample(sample);
}

function getBoOttomanSettingsFromInputs() {
  return getBoOttomanPreviewState().effects || {};
}

function applyBoOttomanSettings() {
  boOttomanLegacyWarning = "";
}

function getBoOttomanLevelStatus(level, state) {
  const previousLevel = level - 1;
  if (level <= 1) return { allowed: true, note: "Available immediately" };
  const hasPreviousChoice = (state?.choices || []).some((choiceId) => getBoOttomanChoiceDef(choiceId)?.level === previousLevel);
  return hasPreviousChoice
    ? { allowed: true, note: "Previous level unlocked" }
    : { allowed: false, note: `Choose a Level ${previousLevel} Vizier point first` };
}

function getBoOttomanChoiceUiState(choiceId, state = null) {
  const choice = getBoOttomanChoiceDef(choiceId);
  if (!choice) return { disabled: true, reason: "Unknown choice" };
  const current = state || getBoOttomanPreviewState();
  if ((current.choices || []).includes(choiceId)) return { disabled: true, reason: "Already chosen" };
  if (choice.modeled === false) return { disabled: true, reason: choice.effectNote || "Unmodeled" };
  if ((current.pointsAvailable || 0) <= 0) return { disabled: true, reason: "No Vizier points available yet" };
  const levelStatus = getBoOttomanLevelStatus(choice.level, current);
  if (!levelStatus.allowed) return { disabled: true, reason: levelStatus.note };
  return { disabled: false, reason: choice.effectNote || choice.description };
}

function updateBoOttomanPanel(civ, timeOverride = null) {
  const panel = document.getElementById("boOttomanPanel");
  const summary = document.getElementById("boOttomanVizierSummary");
  const warning = document.getElementById("boOttomanVizierWarning");
  const anchor = document.getElementById("boOttomanVizierAnchor");
  if (!panel || !summary || !warning || !anchor) return;
  if (civ !== "Ottomans") {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";
  const state = getBoOttomanPreviewState(timeOverride);
  const currentTime = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  anchor.textContent = `State at ${formatTimeMMSS(currentTime)}`;
  warning.hidden = !boOttomanLegacyWarning;
  warning.textContent = boOttomanLegacyWarning || "";
  const nextThreshold = Number.isFinite(state.nextThreshold) ? state.nextThreshold : "Cap reached";
  const summaryItems = [
    ["Vizier XP", Math.floor(state.xp || 0)],
    ["Points earned", `${state.pointsEarned}/${state.cap}`],
    ["Spent / available", `${state.pointsSpent} / ${state.pointsAvailable}`],
    ["Next threshold", nextThreshold]
  ];
  summary.innerHTML = summaryItems.map(([label, value]) => `
    <div class="bo-vizier-summary-pill">
      <span class="bo-vizier-summary-pill-label">${label}</span>
      <span class="bo-vizier-summary-pill-value">${value}</span>
    </div>
  `).join("");
}

function getBoOttomanMilitarySchoolConfig(civ) {
  return civ === "Ottomans" ? (BO_CIV_BONUSES?.[civ]?.militarySchool || null) : null;
}

function isBoHouseOfWisdomCiv(civ) {
  return BO_HOUSE_OF_WISDOM_CIVS.has((civ || "").trim());
}

function getBoNoBoarCivSet() {
  if (BO_BOAR_RESTRICTED_CIVS?.size) return BO_BOAR_RESTRICTED_CIVS;
  const derived = Object.entries(BO_CIV_BONUSES || {})
    .filter(([, bonus]) => bonus?.noBoar)
    .map(([civ]) => civ);
  if (derived.length) {
    BO_BOAR_RESTRICTED_CIVS = new Set(derived);
    return BO_BOAR_RESTRICTED_CIVS;
  }
  return BO_MUSLIM_CIVS;
}

function isBoNoBoarCiv(civ) {
  return getBoNoBoarCivSet().has((civ || "").trim());
}

function getBoBerryBonusConfig(civ) {
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

function getBoHouseOfWisdomConfig(civ) {
  return BO_CIV_BONUSES?.[civ]?.houseOfWisdom || null;
}

function getBoHouseOfWisdomWingLabel(civ, wing, branch = null) {
  if (civ === "Ayyubids") {
    const wingDef = BO_AYYUBID_HOW_BRANCHES[wing];
    const branchDef = wingDef?.branches?.[branch];
    if (wingDef && branchDef) return `${wingDef.label} / ${branchDef.label}`;
  }
  return BO_ABBASID_HOW_WINGS[wing]?.label || wing || "Wing";
}

function getBoHouseOfWisdomStateFromSample(sample = null) {
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

function getBoPlannedHouseOfWisdomWings(civ, commands = boCommands) {
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

function getBoHouseOfWisdomPreviewState(timeOverride = null) {
  const civ = (document.getElementById("boCiv")?.value || "").trim();
  if (!isBoHouseOfWisdomCiv(civ)) return getBoHouseOfWisdomStateFromSample(null);
  const sample = getBoSampleAtTimeFromSamples(
    Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime(),
    boLastResults?.samples || []
  );
  return getBoHouseOfWisdomStateFromSample(sample);
}

function formatBoGoldenAgeBonuses(bonuses = {}) {
  const parts = [];
  Object.entries(BO_HOUSE_OF_WISDOM_GOLDEN_AGE_LABELS).forEach(([key, label]) => {
    const value = bonuses?.[key];
    if (!Number.isFinite(value) || value <= 0) return;
    if (key === "siegeCostMult") parts.push(`${label} -${Math.round((1 - value) * 100)}%`);
    else parts.push(`${label} +${Math.round(value)}%`);
  });
  return parts.join(" | ");
}

function getBoLandmarkChoicesForCiv(civ) {
  return BO_CIV_BONUSES?.[civ]?.landmarksByAge || {};
}

function getBoRusBountyConfig(civ) {
  return BO_CIV_BONUSES?.[civ]?.bounty || null;
}

function getBoRusBountyState(civ, total = 0) {
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

function getBoJapanesePreviewState(timeOverride = null) {
  const anchorTime = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = getBoSampleAtTimeFromSamples(anchorTime, boLastResults?.samples || []);
  const researched = new Set(sample?.researchedTechs || []);
  let farmhouseTechLevel = 0;
  if (researched.has("Tawara")) farmhouseTechLevel = 1;
  if (researched.has("Takezaiku")) farmhouseTechLevel = 2;
  if (researched.has("Fudasashi")) farmhouseTechLevel = 3;
  let daimyoTier = 0;
  if (researched.has("Daimyo Manor")) daimyoTier = 1;
  if (researched.has("Daimyo Palace")) daimyoTier = 2;
  if (researched.has("Shogunate Castle")) daimyoTier = 3;
  return {
    researched,
    farmhouseTechLevel,
    daimyoTier,
    kuraStorehouseCount: Math.max(0, sample?.japanese?.kuraStorehouseCount || 0),
    kuraGeneratedFarms: Math.max(0, sample?.japanese?.kuraGeneratedFarms || 0),
    buddhistMonkCount: Math.max(0, sample?.japanese?.buddhistMonkCount || 0),
    zenGoldPerSec: Math.max(0, sample?.japanese?.zenGoldPerSec || 0)
  };
}

function getBoMalianPreviewState(timeOverride = null) {
  const anchorTime = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = getBoSampleAtTimeFromSamples(anchorTime, boLastResults?.samples || []);
  return {
    pitMineCount: Math.max(0, sample?.malians?.pitMineCount || 0),
    pitMineSupportBuildings: Math.max(0, sample?.malians?.pitMineSupportBuildings || 0),
    pitMineGoldPerSec: Math.max(0, sample?.malians?.pitMineGoldPerSec || 0),
    cattleCount: Math.max(0, sample?.malians?.cattleCount || 0),
    garrisonedCattle: Math.max(0, sample?.malians?.garrisonedCattle || 0),
    cattleRanchCount: Math.max(0, sample?.malians?.cattleRanchCount || 0),
    cattleFoodPerSec: Math.max(0, sample?.malians?.cattleFoodPerSec || 0),
    grandFulaniCorralCount: Math.max(0, sample?.malians?.grandFulaniCorralCount || 0),
    grandFulaniFoodPerSec: Math.max(0, sample?.malians?.grandFulaniFoodPerSec || 0),
    mansaQuarryCount: Math.max(0, sample?.malians?.mansaQuarryCount || 0),
    mansaQuarryGoldPerSec: Math.max(0, sample?.malians?.mansaQuarryGoldPerSec || 0)
  };
}

function getBoBuildingSurfaceConfig(buildingType, civ) {
  if (!buildingType) return {};
  return BO_CIV_BONUSES?.[civ]?.landmarkSurfaces?.[buildingType] || {};
}

function getBoTrainingSurface(buildingType, civ) {
  if (!buildingType) return null;
  return getBoBuildingSurfaceConfig(buildingType, civ).trainAs || buildingType;
}

function getBoTechSurface(buildingType, civ) {
  if (!buildingType) return null;
  return getBoBuildingSurfaceConfig(buildingType, civ).techAs || buildingType;
}

function isBoTownCenterSurface(buildingType, civ) {
  return getBoTrainingSurface(buildingType, civ) === "Town Center";
}

function isBoProductionSurface(buildingType, civ) {
  const surface = getBoTrainingSurface(buildingType, civ);
  if (civ === "Malians" && buildingType === "Mill") return true;
  return !!surface && BO_PRODUCTION_BUILDINGS.has(surface);
}

function getBoUnitTrainModifier(buildingType, civ, unitName) {
  const config = getBoBuildingSurfaceConfig(buildingType, civ);
  const unitMods = config.unitTrainMods?.[resolveBoUnitName(unitName)] || config.unitTrainMods?.[unitName] || {};
  return {
    costMult: Number.isFinite(unitMods.costMult) ? unitMods.costMult : 1,
    timePct: Number.isFinite(unitMods.timePct) ? unitMods.timePct : 0
  };
}

function doesBoTechMatchBuilding(techType, buildingType, civ) {
  if (!buildingType) return false;
  const sites = getBoTechResearchSites(techType);
  if (!sites.length) return false;
  if (sites.includes(buildingType)) return true;
  const techSurface = getBoTechSurface(buildingType, civ);
  return !!techSurface && techSurface !== buildingType && sites.includes(techSurface);
}

function refreshBoTechBuildings() {
  BO_TECH_BUILDINGS.clear();
  BO_BASE_TECH_BUILDINGS.forEach((name) => BO_TECH_BUILDINGS.add(name));
  Object.entries(BO_TECH_DEFAULTS || {}).forEach(([techName, def]) => {
    const sites = Array.isArray(def?.researchedAt) ? def.researchedAt : [];
    sites.forEach((site) => {
      if (isBoExactResearchSiteSupported(site, techName)) BO_TECH_BUILDINGS.add(site);
    });
  });
}

function isBoExactResearchSiteSupported(site, techType = "") {
  if (!site) return false;
  if (BO_TECHS_REQUIRING_UNMODELED_EXACT_SITE.has(techType)) return false;
  if (site === BO_HOUSE_OF_WISDOM_BUILDING || site === BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING) return true;
  if (/^Landmark \(Age /.test(site)) return false;
  if (site === "Worker Elephant") return false;
  return !!BO_BUILDING_DEFAULTS?.[site];
}

function getBoTechResearchSites(techType) {
  const def = getBoTechDefaults(techType) || {};
  const sites = Array.isArray(def.researchedAt)
    ? def.researchedAt.filter((site) => isBoExactResearchSiteSupported(site, techType))
    : [];
  if (sites.length) return Array.from(new Set(sites));
  const millTechs = new Set(["Wheelbarrow", "Horticulture", "Survival Techniques"]);
  if (millTechs.has(techType) && isBoExactResearchSiteSupported("Mill", techType)) return ["Mill"];
  return [];
}

function getBoTechPreviewState(civ, timeOverride = null) {
  const anchorTime = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = getBoSampleAtTimeFromSamples(anchorTime, boLastResults?.samples || []);
  const fallbackAge = parseInt(document.getElementById("boStartAge")?.value, 10) || 1;
  const howState = getBoHouseOfWisdomStateFromSample(sample);
  if (!sample && isBoHouseOfWisdomCiv(civ)) {
    howState.wings = getBoPlannedHouseOfWisdomWings(civ);
  }
  return {
    age: Math.max(1, sample?.age || fallbackAge),
    researchedTechs: new Set(sample?.researchedTechs || []),
    houseOfWisdom: howState,
    buildingCounts: { ...(sample?.buildingCounts || {}) }
  };
}

function isBoTechNoteOnly(techType) {
  return !!getBoTechDefaults(techType)?.noteOnly;
}

function getBoTechNoteText(techType) {
  if (!isBoTechNoteOnly(techType)) return "";
  return "No Build Order eco effect; tracked for timing only.";
}

function doesBoPreviewMeetTechRequirements(def, previewState) {
  if (!def) return true;
  const minAge = Math.max(1, def.minAge || 1);
  if ((previewState?.age || 1) < minAge) return false;
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

function getBoBuildableBuildingsForCiv(civ) {
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
  const next = [];
  const seen = new Set();
  const push = (name) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    next.push(name);
  };
  buildingKeys.forEach((name) => {
    if (isBoHouseOfWisdomCiv(civ) && name.startsWith("Landmark (Age")) return;
    if (civ === "Rus" && (name === "Mill" || name === "Outpost")) return;
    if (civ === "Malians" && name === "Outpost") return;
    if (civ === "Japanese" && ["House", "Mill", "Mining Camp", "Blacksmith", "Keep", "Monastery"].includes(name)) return;
    if (name === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING && civ !== "Ottomans") return;
    if (name === "Landmark (Age II)" && landmarkChoices?.["2"]?.length) {
      landmarkChoices["2"].forEach(push);
      return;
    }
    if (name === "Landmark (Age III)" && landmarkChoices?.["3"]?.length) {
      landmarkChoices["3"].forEach(push);
      return;
    }
    if (name === "Landmark (Age IV)" && landmarkChoices?.["4"]?.length) {
      landmarkChoices["4"].forEach(push);
      return;
    }
    const def = BO_BUILDING_DEFAULTS?.[name];
    if (Array.isArray(def?.civs) && civ && !def.civs.includes(civ)) return;
    if (def?.buildable === false) return;
    if (def?.landmarkAge && civ !== "Ottomans") return;
    push(name);
  });
  return next;
}

function getBoHouseOfWisdomGoldenAgeState(civ, buildingCount = 0) {
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

function getBoLandmarkAgeCost(targetAge = 2) {
  const key = `Landmark (Age ${targetAge})`;
  const def = getBoBuildingDefaults(key) || {};
  return {
    food: def.cost?.food || 0,
    wood: def.cost?.wood || 0,
    gold: def.cost?.gold || 0,
    stone: def.cost?.stone || 0
  };
}

function getBoHouseOfWisdomChoiceAgeFromCount(completedCount = 0) {
  return Math.min(4, 2 + Math.max(0, completedCount || 0));
}

function getBoHouseOfWisdomCompletedCountBefore(cmd, commands = boCommands) {
  const idx = commands.findIndex((entry) => entry.id === cmd?.id);
  const source = idx >= 0 ? commands.slice(0, idx) : commands.slice();
  return source.filter((entry) => entry?.type === "houseOfWisdomWing").length;
}

function getBoHouseOfWisdomCommandSpec(cmd, civ, options = {}) {
  const howConfig = getBoHouseOfWisdomConfig(civ) || {};
  const completedCount = options.completedCount ?? getBoHouseOfWisdomCompletedCountBefore(cmd);
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

function getBoHouseOfWisdomWingDescription(civ, wing, branch = null, targetAge = 2) {
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

function getBoHouseOfWisdomActionChoices(civ, state = null) {
  const currentState = state || getBoHouseOfWisdomPreviewState();
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

function resolveBoUnitName(unitName) {
  return BO_UNIT_ALIASES[unitName] || unitName;
}

function getBoExtraUnitSpec(unitName, civ) {
  const direct = BO_EXTRA_UNIT_SPECS[unitName] || BO_EXTRA_UNIT_SPECS[resolveBoUnitName(unitName)];
  if (!direct) return null;
  if (Array.isArray(direct.civs) && civ && !direct.civs.includes(civ)) return null;
  return direct;
}

function getBoUnitAgeList(unitName, civ) {
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

function getBoUnitMinAge(unitName, civ) {
  const ages = getBoUnitAgeList(unitName, civ).filter((age) => Number.isFinite(age));
  return ages.length ? Math.min(...ages) : 1;
}

function isBoUnitTrainableAtBuilding(unitName, buildingType, civ, ottomanSettings = null) {
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

function getBoUnitOptionsForBuilding(buildingType, civ, ottomanSettings = null) {
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

function getBoPreviewTownCenterWorkRatePct(civ, ageOverride = null) {
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const age = Number.isFinite(ageOverride)
    ? ageOverride
    : (parseInt(document.getElementById("boStartAge")?.value, 10) || 1);
  let pct = getBoAgeBonusValue(civBonus.townCenterWorkRateByAge, age);
  if (isBoHouseOfWisdomCiv(civ)) {
    pct += getBoHouseOfWisdomPreviewState().goldenAge?.bonuses?.productionPct || 0;
  }
  return pct;
}

function renderBoCivBonuses(civ) {
  const box = document.getElementById("boCivBonuses");
  if (!box) return;
  updateBoOttomanPanel(isBoSupportedCiv(civ) ? civ : "");
  if (!civ) {
    box.innerHTML = `<span class="text-muted">Select a civilization to apply civ bonuses.</span>`;
    return;
  }
  if (!isBoSupportedCiv(civ)) {
    box.innerHTML = `<span class="text-muted">${civ} is not modeled in Build Order yet.</span>`;
    return;
  }
  const parts = [];
  const overrides = BO_CIV_RATE_OVERRIDES[civ];
  if (overrides) {
    const gatherParts = Object.entries(overrides).map(([res, rate]) => `${res.toUpperCase()}: ${rate.toFixed(3)}/s`);
    if (gatherParts.length) parts.push(`Gather: ${gatherParts.join(" | ")}`);
  }
  const berryBonus = getBoBerryBonusConfig(civ);
  if (berryBonus) {
    const label = berryBonus.label || "Berry bonus";
    const bonusParts = [];
    if ((berryBonus.capacityBonusPerNode || 0) > 0) {
      bonusParts.push(`+${berryBonus.capacityBonusPerNode}/berry node${berryBonus.requiresMill === false ? "" : " with Mill"}`);
    }
    if ((berryBonus.gatherBonusPct || 0) > 0) {
      bonusParts.push(`+${berryBonus.gatherBonusPct}% berry gather`);
    }
    if ((berryBonus.carryBonus || 0) > 0) {
      bonusParts.push(`+${berryBonus.carryBonus} carry`);
    }
    if (bonusParts.length) parts.push(`${label}: ${bonusParts.join(", ")}`);
  }
  if (isBoNoBoarCiv(civ)) {
    parts.push("Cannot harvest boar");
  }
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  if (isBoHouseOfWisdomCiv(civ)) {
    const previewState = getBoHouseOfWisdomPreviewState();
    const howConfig = getBoHouseOfWisdomConfig(civ) || {};
    const goldenAge = previewState.goldenAge || {};
    const hasLegacyLandmarks = boCommands.some((cmd) => cmd?.type === "buildBuilding" && getBoBuildSteps(cmd.payload).some((step) => /^Landmark \(Age /.test(step.building || "")));
    const previewWings = (previewState.wings || []).length
      ? previewState.wings
      : getBoPlannedHouseOfWisdomWings(civ);
    const wingSummary = previewWings
      .map((entry) => getBoHouseOfWisdomWingLabel(civ, entry.wing, entry.branch))
      .join(" -> ");
    parts.push(`House of Wisdom: ${civ === "Ayyubids" ? "Branches" : "Wings"} age up in ${howConfig.baseAgeUpTime || (civ === "Ayyubids" ? 120 : 100)}s`);
    parts.push(`Golden Age: ${goldenAge.count || 0} buildings${goldenAge.tier ? `, Tier ${goldenAge.tier}` : ""}${formatBoGoldenAgeBonuses(goldenAge.bonuses) ? ` (${formatBoGoldenAgeBonuses(goldenAge.bonuses)})` : ""}`);
    if (hasLegacyLandmarks) parts.push("Legacy landmarks detected: replace them with House of Wisdom wings");
    if (wingSummary) parts.push(`Chosen ${civ === "Ayyubids" ? "branches" : "wings"}: ${wingSummary}`);
    if (previewState.effects?.preservationOfKnowledge) parts.push("Preservation of Knowledge active: techs and future wings cost 20% less");
    if (previewState.effects?.fertileCrescent) parts.push("Fertile Crescent active: economic buildings and Houses cost 30% less");
    if (previewState.effects?.agriculture) parts.push("Agriculture active: farms gather 15% faster");
    if (previewState.effects?.improvedProcessing) parts.push("Improved Processing active: villager dropoff +8%");
    if (previewState.effects?.villagerWorkRatePct) parts.push(`Growth active: villagers +${previewState.effects.villagerWorkRatePct}% work rate`);
    if (previewState.effects?.buildSpeedPct) parts.push(`Industry active: villagers build +${previewState.effects.buildSpeedPct}% faster`);
    if (previewState.effects?.militaryAcademy) parts.push("Master Smiths active: Military Academy granted for free");
  }
  if (civBonus.farmGoldPerSec) parts.push("Farms generate gold (English/HoL)");
  if (civBonus.dropoffCostMult) parts.push("Dropoffs cheaper (French)");
  if (civBonus.ecoTechCostMult) parts.push("Eco techs cheaper (French/Jeanne)");
  if (civBonus.townCenterWorkRateByAge) parts.push("Town Center works faster by age (15/15/20/25%)");
  if (civ === "Holy Roman Empire") {
    parts.push("Pushcarts: villagers carry 40% more");
    parts.push("Army of the Empire: Man-at-Arms available in Feudal Age");
    parts.push("Landmarks: Aachen dropoff, Meinwerk Blacksmith techs 50% cheaper/faster, Burgrave Barracks x5 speed, Regnitz Monastery, Elzbach Keep, Swabia Town Center");
  }
  if (civ === "Rus") {
    const sample = getBoSampleAtTimeFromSamples(getBoAnchorTime(), boLastResults?.samples || []);
    const bountyState = getBoRusBountyState(civ, sample?.rus?.bountyTotal || 0);
    parts.push("Hunter Princes: Hunting Cabin replaces Mill, trains Scouts, and Early Knight is available in Feudal Age");
    parts.push("Woodland Federation: Wooden Fortress replaces Outpost; wood dropoff +20% once a Wooden Fortress or Kremlin is online (global no-position simplification)");
    parts.push("Bounty: +1 gold per 10 food from sheep, deer, and boar; 100/400/1000 bounty grants +5/+10/+15% food gather");
    parts.push("High Trade House: deer trickle every 60s");
    parts.push("Hunting Cabin tree-based passive gold is not modeled yet in the no-position sim");
    if (bountyState.total > 0) {
      parts.push(`Current bounty: ${Math.round(bountyState.total)}${bountyState.tier ? ` (Tier ${bountyState.tier}, +${bountyState.foodGatherPct}% food gather)` : ""}`);
    }
  }
  if (civ === "Japanese") {
    const preview = getBoJapanesePreviewState();
    parts.push("Samurai Districts: Barracks cost 50% less wood");
    parts.push("Calm of Mind: Barracks and Samurai available in Dark Age");
    parts.push("Buildings: Farmhouse replaces House + Mill, Forge replaces Mining Camp + Blacksmith");
    parts.push("Silver Mining: +20% dropped-off gold as stone and dropped-off stone as gold");
    parts.push("Kura Storehouse: acts as Farmhouse/Forge/Lumber Camp, grants 1 free Farm on completion, then 1 Farm every 50s up to 12, then 38 wood every 50s");
    parts.push("Temple of Equality: trains Buddhist Monks, spawns 4 on completion, unlocks Zen gold trickle");
    parts.push("Floating Gate: trains Shinto Priests");
    if (preview.farmhouseTechLevel > 0) {
      parts.push(`Farmhouse techs active: level ${preview.farmhouseTechLevel} (+${preview.farmhouseTechLevel * 3} carry, +${preview.farmhouseTechLevel * 7}% move, +${preview.farmhouseTechLevel * 25}% berry gather)`);
    }
    if (preview.daimyoTier > 0) {
      parts.push(`Town Center upgraded: Daimyo tier ${preview.daimyoTier} (+${preview.daimyoTier * 20}% farm gather, +${preview.daimyoTier} Villager granted)`);
    }
    if (preview.kuraStorehouseCount > 0) {
      parts.push(`Current Kura: ${preview.kuraStorehouseCount} storehouse(s), ${preview.kuraGeneratedFarms} free farm(s) generated`);
    }
    if (preview.zenGoldPerSec > 0) {
      parts.push(`Zen active: +${(preview.zenGoldPerSec * 60).toFixed(0)} gold/min from ${preview.buddhistMonkCount} Buddhist Monk(s)`);
    }
  }
  if (civ === "Malians") {
    const preview = getBoMalianPreviewState();
    parts.push("Houses are half cost and build 2x faster");
    parts.push("Town Centers cost 400 wood / 400 gold");
    parts.push("Buildings: Toll Outpost replaces Outpost, Pit Mine from Dark Age (1 per Age), Cattle Ranch from Feudal");
    parts.push("Pit Mine: 36 gold/min base, +25% per House/Mining Camp support (no-position cap: 8 support buildings per mine)");
    parts.push("Cattle: 90 gold / 15s at Mill, up to 20; Cattle Ranches hold 3 and generate 25 food/min per garrisoned Cattle");
    parts.push("Grand Fulani Corral: +18 food/min per garrisoned Cattle");
    parts.push("Mansa Quarry: modeled as 75 gold/min passive income (stone mode deferred)");
    parts.push("Manuscript Trade and Farari veteran-upgrade bonus are deferred until trade gold / upgrade techs are modeled");
    if (preview.pitMineCount > 0 || preview.cattleCount > 0 || preview.mansaQuarryCount > 0) {
      const liveParts = [];
      if (preview.pitMineCount > 0) {
        liveParts.push(`Pit Mines ${preview.pitMineCount} (${preview.pitMineSupportBuildings} support, ${(preview.pitMineGoldPerSec * 60).toFixed(0)} gold/min)`);
      }
      if (preview.cattleCount > 0) {
        liveParts.push(`Cattle ${preview.cattleCount} (${preview.garrisonedCattle} garrisoned, ${(preview.cattleFoodPerSec * 60).toFixed(0)} food/min)`);
      }
      if (preview.grandFulaniCorralCount > 0 && preview.grandFulaniFoodPerSec > 0) {
        liveParts.push(`Grand Fulani ${(preview.grandFulaniFoodPerSec * 60).toFixed(0)} food/min`);
      }
      if (preview.mansaQuarryCount > 0) {
        liveParts.push(`Mansa Quarry ${preview.mansaQuarryCount} (${(preview.mansaQuarryGoldPerSec * 60).toFixed(0)} gold/min)`);
      }
      if (liveParts.length) parts.push(`Current Malians eco: ${liveParts.join(" | ")}`);
    }
  }
  if (civ === "Mongols") parts.push("Pasture/Ovoo/Ger rules apply; farms disabled");
  if (civ === "Ottomans") {
    const school = civBonus.militarySchool || {};
    const costMult = civBonus.militaryInducementCostMult || 0.6;
    const influenceByAge = civBonus.productionInfluenceByAge || {};
    const previewState = getBoOttomanPreviewState();
    const ottomanEffects = previewState.effects || {};
    const influenceText = `${getBoAgeBonusValue(influenceByAge, 2)} / ${getBoAgeBonusValue(influenceByAge, 3)} / ${getBoAgeBonusValue(influenceByAge, 4)}%`;
    parts.push(`Military Inducement: ${Math.round((1 - costMult) * 100)}% cheaper Barracks/Range/Stable/Workshop/Blacksmith/University`);
    parts.push(`Influence: +${influenceText} production speed with Blacksmith or University`);
    parts.push(`Military School: Dark Age, 1 per Age${ottomanEffects.militaryCampus ? " (+1 via Military Campus)" : ""}, free production at ${school.trainTimeMult || 4.75}x train time`);
    parts.push("Imperial Council choices are made from the Imperial Council lane.");
    if (ottomanEffects.advancedAcademy) parts.push("Advanced Academy active: +25% military production speed, unlocks Lancer + Janissary in Military Schools");
    if (ottomanEffects.anatolianHills) parts.push("Anatolian Hills active: +10 Sheep, +15% gold/stone mining");
  }
  if (!parts.length) {
    box.innerHTML = `<span class="text-muted">No civ bonuses applied.</span>`;
    return;
  }
  box.innerHTML = `<strong>${civ} bonuses:</strong> ${parts.join(" | ")}`;
}

function applyBoCivRates(civ) {
  const rates = getBoRatesForCiv(civ);
  const setRate = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setRate("boRateBerries", rates.berries);
  setRate("boRateDeer", rates.deer);
  setRate("boRateBoar", rates.boar);
  setRate("boRateSheep", rates.sheep);
  setRate("boRateFarm", rates.farm);
  setRate("boRateWood", rates.wood);
  setRate("boRateGold", rates.gold);
  setRate("boRateStone", rates.stone);
}

function updateBoSpecialResourceVisibility(startRes) {
  const row = document.getElementById("boSpecialResourcesRow");
  const oliveCol = document.getElementById("boOliveCol");
  const silverCol = document.getElementById("boSilverCol");
  if (!row) return;
  const showOlive = (startRes?.oliveOil || 0) > 0;
  const showSilver = (startRes?.silver || 0) > 0;
  if (oliveCol) oliveCol.style.display = showOlive ? "" : "none";
  if (silverCol) silverCol.style.display = showSilver ? "" : "none";
  row.style.display = showOlive || showSilver ? "flex" : "none";
}

function applyBoStartingResources(civ) {
  const startRes = getBoStartingResourcesForCiv(civ);
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el || val === undefined || val === null || Number.isNaN(val)) return;
    el.value = val;
  };
  setVal("boStartFood", startRes.food ?? 200);
  setVal("boStartWood", startRes.wood ?? 150);
  setVal("boStartGold", startRes.gold ?? 100);
  setVal("boStartStone", startRes.stone ?? 0);
  setVal("boStartOlive", startRes.oliveOil ?? 0);
  setVal("boStartSilver", startRes.silver ?? 0);
  updateBoSpecialResourceVisibility(startRes);
}

function applyBoStartingVillagers(civ) {
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const startVills = Number.isFinite(civBonus.startVillagers)
    ? Math.max(0, Math.floor(civBonus.startVillagers))
    : BO_STARTING_VILLAGERS;
  const el = document.getElementById("boStartVills");
  if (el) el.value = startVills;
}

function applyBoBoarRestriction(civ) {
  const restricted = isBoNoBoarCiv(civ);
  const boarCount = document.getElementById("boBoarCount");
  const boarFood = document.getElementById("boBoarFood");
  const boarRate = document.getElementById("boRateBoar");
  const note = document.getElementById("boBoarRestrictedNote");
  if (boarCount) {
    boarCount.disabled = restricted;
    if (restricted) boarCount.value = 0;
  }
  if (boarFood) {
    boarFood.disabled = restricted;
  }
  if (boarRate) {
    boarRate.disabled = restricted;
    if (restricted) boarRate.value = 0;
  }
  if (note) note.style.display = restricted ? "" : "none";
}

function applyBoCivRestrictions(civ) {
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const disableFarm = civBonus.farmsDisabled || civ === "Mongols";
  const farmRate = document.getElementById("boRateFarm");
  const farmCarry = document.getElementById("boCarryFarm");
  if (farmRate) {
    farmRate.disabled = disableFarm;
    if (disableFarm) farmRate.value = 0;
  }
  if (farmCarry) farmCarry.disabled = disableFarm;
}

function applyBoDefaults() {
  const civ = getBoSelectedCiv();
  applyBoStartingResources(civ);
  applyBoStartingVillagers(civ);
  updateBoOttomanPanel(civ);

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el || val === undefined || val === null || Number.isNaN(val)) return;
    el.value = val;
  };

  setVal("boSheepCount", BO_STARTING?.sheep ?? BO_DEFAULT_NODE_COUNTS.sheep);
  setVal("boBerriesCount", BO_DEFAULT_NODE_COUNTS.berries);
  setVal("boDeerCount", BO_DEFAULT_NODE_COUNTS.deer);
  setVal("boBoarCount", BO_DEFAULT_NODE_COUNTS.boar);

  setVal("boSheepFood", BO_NODE_AMOUNTS?.sheep ?? 200);
  setVal("boBerriesFood", BO_NODE_AMOUNTS?.berries ?? 250);
  setVal("boDeerFood", BO_NODE_AMOUNTS?.deer ?? 350);
  setVal("boBoarFood", BO_NODE_AMOUNTS?.boar ?? 2400);
  setVal("boCarrySheep", BO_DEFAULT_CARRY.sheep);
  setVal("boCarryBerries", BO_DEFAULT_CARRY.berries);
  setVal("boCarryDeer", BO_DEFAULT_CARRY.deer);
  setVal("boCarryBoar", BO_DEFAULT_CARRY.boar);
  setVal("boCarryFarm", BO_DEFAULT_CARRY.farm);
  setVal("boCarryWood", BO_DEFAULT_CARRY.wood);
  setVal("boCarryGold", BO_DEFAULT_CARRY.gold);
  setVal("boCarryStone", BO_DEFAULT_CARRY.stone);

  applyBoCivRates(civ);
  applyBoCivRestrictions(civ);
  applyBoBoarRestriction(civ);
  renderBoCivBonuses(civ);
  updateBoCivFlags(civ);
  applyAutoDefaultsForAllCommands();
  renderBoTimelineEditor();
  renderBoCommandEditor(getSelectedBoCommand());
}

function resetBoTimeline() {
  boCommands = [];
  boSelectedCommandId = null;
  boLastResults = null;
  boLastCommandType = "assign";
  boIdCounter = 1;
  boPinnedTime = null;
  boHoverTime = null;
  boSelectedBuilding = null;
  clearBoTargetBuilding();
  clearBoMarkerDraft();
  applyBoDisplayDefaults();
  refreshBoSaveUi(BO_SAVE_DRAFT_ID);
  renderBoTimelineEditor();
  renderBoCommandEditor(null);
  renderBoGatherRates();
  renderBoTimelineFooter();
  scheduleRunBuildOrder();
  setBoSaveStatus("Timeline reset. Current draft cleared.");
}

function isBoSupportedCiv(civ) {
  return BO_SUPPORTED_CIVS.has((civ || "").trim());
}

function getBoRawSelectedCiv() {
  return (document.getElementById("boCiv")?.value || "").trim();
}

function getBoSelectedCiv() {
  const civ = getBoRawSelectedCiv();
  return isBoSupportedCiv(civ) ? civ : "";
}

function updateBoCivGate(forceOpen = false, message = "Select a modeled civilization to begin.") {
  const rawCiv = getBoRawSelectedCiv();
  const civ = getBoSelectedCiv();
  const addBtn = document.getElementById("boAddCommand");
  const runBtn = document.getElementById("boRunBtn");
  const overlay = document.getElementById("boCivGateOverlay");
  const shell = document.getElementById("boTimelineShell");
  const msg = document.getElementById("boCivGateMessage");
  if (addBtn) addBtn.disabled = !civ;
  if (runBtn) runBtn.disabled = !civ;
  if (shell) shell.classList.toggle("bo-gated", !civ);
  if (overlay) overlay.style.display = civ ? "none" : "flex";
  if (!civ) {
    if (msg) {
      msg.textContent = rawCiv && !isBoSupportedCiv(rawCiv)
        ? "This civilization is not modeled in Build Order yet."
        : message;
    }
    if (forceOpen) {
      const setup = document.getElementById("boSetupCollapse");
      const toggle = document.querySelector('[data-bs-target="#boSetupCollapse"]');
      if (setup) setup.classList.add("show");
      if (toggle) toggle.setAttribute("aria-expanded", "true");
      const civSelect = document.getElementById("boCiv");
      if (civSelect) civSelect.focus();
    }
  }
  return !!civ;
}

function runBuildOrder() {
  if (!updateBoCivGate(false)) return;
  normalizeBoCommands();
  const config = readBoSettings();
  const results = simulateBuildOrder(boCommands, config);
  renderBoResults(results);
  renderBoGatherRates();
}

function scheduleRunBuildOrder(delayMs = 120) {
  if (boRunTimer) clearTimeout(boRunTimer);
  boRunTimer = setTimeout(runBuildOrder, delayMs);
  scheduleBoDraftSave(Math.max(180, delayMs));
}

function cloneBoData(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function readBoSaveStorage() {
  try {
    const raw = localStorage.getItem(BO_SAVE_STORAGE_KEY);
    if (!raw) {
      return { version: BO_SAVE_STORAGE_VERSION, lastCiv: "", drafts: {}, saves: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || BO_SAVE_STORAGE_VERSION,
      lastCiv: parsed?.lastCiv || "",
      drafts: parsed?.drafts && typeof parsed.drafts === "object" ? parsed.drafts : {},
      saves: parsed?.saves && typeof parsed.saves === "object" ? parsed.saves : {}
    };
  } catch (error) {
    console.warn("Build Order: failed to read local saves.", error);
    return { version: BO_SAVE_STORAGE_VERSION, lastCiv: "", drafts: {}, saves: {} };
  }
}

function writeBoSaveStorage(storage) {
  try {
    localStorage.setItem(BO_SAVE_STORAGE_KEY, JSON.stringify({
      version: BO_SAVE_STORAGE_VERSION,
      lastCiv: storage?.lastCiv || "",
      drafts: storage?.drafts || {},
      saves: storage?.saves || {}
    }));
    return true;
  } catch (error) {
    console.warn("Build Order: failed to write local saves.", error);
    setBoSaveStatus("Could not save locally in this browser.");
    return false;
  }
}

function setBoSaveStatus(message) {
  const status = document.getElementById("boSaveStatus");
  if (status) status.textContent = message || "";
}

function applyBoDisplayDefaults() {
  const overlayToggle = document.getElementById("boOverlayToggle");
  const setupCollapse = document.getElementById("boSetupCollapse");
  const setupToggle = document.getElementById("boAdvancedToggle");

  boOverlayEnabled = true;
  if (overlayToggle) overlayToggle.setAttribute("aria-pressed", "true");
  setBoOverlayToggleLabel();

  if (setupCollapse?.classList.contains("show")) {
    if (window.bootstrap?.Collapse) {
      const collapse = window.bootstrap.Collapse.getOrCreateInstance(setupCollapse, { toggle: false });
      collapse.hide();
    } else {
      setupCollapse.classList.remove("show");
    }
  }
  setupToggle?.setAttribute("aria-expanded", "false");
  syncBoDisplayControlStates();
}

function getBoPersistedSnapshot() {
  normalizeBoCommands();
  const settings = readBoSettings();
  const civ = (settings?.civ || "").trim();
  if (!civ) return null;
  return {
    version: BO_SAVE_STORAGE_VERSION,
    civ,
    startAge: settings.startAge,
    simEnd: settings.simEnd,
    resources: cloneBoData(settings.resources || {}),
    foodNodes: cloneBoData(settings.foodNodes || {}),
    villagers: settings.villagers,
    gatherRates: cloneBoData(settings.gatherRates || {}),
    carry: cloneBoData(settings.carry || {}),
    overlayEnabled: !!boOverlayEnabled,
    commands: cloneBoData(boCommands),
    lastCommandType: boLastCommandType,
    savedAt: Date.now()
  };
}

function getBoNextIdCounter(commands) {
  let maxId = 0;
  (commands || []).forEach((cmd) => {
    const match = /^cmd(\d+)$/.exec(cmd?.id || "");
    if (match) maxId = Math.max(maxId, parseInt(match[1], 10) || 0);
  });
  return maxId + 1;
}

function syncBoSaveSelectionUi() {
  const civ = getBoSelectedCiv();
  const storage = readBoSaveStorage();
  const select = document.getElementById("boSaveSelect");
  const nameInput = document.getElementById("boSaveName");
  const saveBtn = document.getElementById("boSaveBtn");
  const loadBtn = document.getElementById("boLoadBtn");
  const deleteBtn = document.getElementById("boDeleteBtn");
  if (!select) return;

  const selectedId = select.value || BO_SAVE_DRAFT_ID;
  const draft = civ ? storage.drafts?.[civ] : null;
  const saves = civ ? (storage.saves?.[civ] || []) : [];
  const selectedSave = selectedId === BO_SAVE_DRAFT_ID
    ? null
    : saves.find((entry) => entry.id === selectedId) || null;

  if (nameInput) {
    nameInput.value = selectedSave?.name || "";
    nameInput.disabled = !civ;
  }
  if (saveBtn) saveBtn.disabled = !civ;
  if (loadBtn) loadBtn.disabled = !civ || (selectedId === BO_SAVE_DRAFT_ID ? !draft : !selectedSave);
  if (deleteBtn) deleteBtn.disabled = !selectedSave;
}

function refreshBoSaveUi(selectedId = null) {
  const civ = getBoSelectedCiv();
  const select = document.getElementById("boSaveSelect");
  if (!select) return;

  const storage = readBoSaveStorage();
  const draft = civ ? storage.drafts?.[civ] : null;
  const saves = civ ? (storage.saves?.[civ] || []) : [];
  const desired = selectedId || select.value || BO_SAVE_DRAFT_ID;

  select.innerHTML = "";
  const draftOpt = document.createElement("option");
  draftOpt.value = BO_SAVE_DRAFT_ID;
  draftOpt.textContent = draft
    ? "Current draft (autosaved)"
    : "Current draft (none yet)";
  select.appendChild(draftOpt);

  saves
    .slice()
    .sort((a, b) => (b?.savedAt || 0) - (a?.savedAt || 0))
    .forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = entry.name || "Unnamed build";
      select.appendChild(opt);
    });

  const optionValues = Array.from(select.options).map((opt) => opt.value);
  select.value = optionValues.includes(desired) ? desired : BO_SAVE_DRAFT_ID;
  select.disabled = !civ;
  syncBoSaveSelectionUi();
}

function applyBoSnapshot(snapshot, options = {}) {
  const civ = (snapshot?.civ || "").trim();
  if (!civ || !isBoSupportedCiv(civ)) {
    const civSelect = document.getElementById("boCiv");
    if (civSelect) civSelect.value = "";
    boCommands = [];
    boSelectedCommandId = null;
    boSelectedBuilding = null;
    setBoTargetBuilding(null);
    boPinnedTime = null;
    boHoverTime = null;
    boLastResults = null;
    boOttomanLegacyWarning = "";
    updateBoCivFlags("");
    renderBoCivBonuses(civ);
    updateBoCivGate(false, civ ? "This civilization is not modeled in Build Order yet." : "Select a modeled civilization to begin.");
    renderBoTimelineEditor();
    renderBoCommandEditor(null);
    renderBoGatherRates();
    renderBoTimelineFooter();
    refreshBoSaveUi(options.selectedId || BO_SAVE_DRAFT_ID);
    if (civ && options.statusText !== false) {
      setBoSaveStatus(`${civ} is not modeled in Build Order yet.`);
    }
    return false;
  }

  const civSelect = document.getElementById("boCiv");
  if (civSelect) civSelect.value = civ;

  const overlayToggle = document.getElementById("boOverlayToggle");
  boOverlayEnabled = snapshot.overlayEnabled !== false;
  if (overlayToggle) overlayToggle.setAttribute("aria-pressed", boOverlayEnabled ? "true" : "false");
  setBoOverlayToggleLabel();

  boSelectedCommandId = null;
  boSelectedBuilding = null;
  setBoTargetBuilding(null);
  boPinnedTime = null;
  boHoverTime = null;
  boLastResults = null;
  boOttomanLegacyWarning = "";

  applyBoStartingResources(civ);
  applyBoStartingVillagers(civ);
  const legacyOttomanBonuses = snapshot?.ottomanBonuses && typeof snapshot.ottomanBonuses === "object"
    ? snapshot.ottomanBonuses
    : null;
  if (civ === "Ottomans" && legacyOttomanBonuses && Object.values(legacyOttomanBonuses).some(Boolean)) {
    boOttomanLegacyWarning = "Legacy Ottoman checkbox bonuses were deprecated. Re-add Vizier choices from the Imperial Council lane.";
  }
  applyBoCivRates(civ);
  applyBoCivRestrictions(civ);
  applyBoBoarRestriction(civ);
  renderBoCivBonuses(civ);
  updateBoCivFlags(civ);

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el || val === undefined || val === null || Number.isNaN(val)) return;
    el.value = val;
  };
  const resources = snapshot.resources || {};
  const foodNodes = snapshot.foodNodes || {};
  const gatherRates = snapshot.gatherRates || {};
  const carry = snapshot.carry || {};

  setVal("boStartAge", snapshot.startAge ?? 1);
  setVal("boSimEnd", snapshot.simEnd ?? 420);
  setVal("boStartFood", resources.food ?? 200);
  setVal("boStartWood", resources.wood ?? 150);
  setVal("boStartGold", resources.gold ?? 100);
  setVal("boStartStone", resources.stone ?? 0);
  setVal("boStartOlive", resources.oliveOil ?? 0);
  setVal("boStartSilver", resources.silver ?? 0);
  updateBoSpecialResourceVisibility(resources);
  setVal("boStartVills", snapshot.villagers ?? BO_STARTING_VILLAGERS);

  setVal("boSheepCount", foodNodes.sheep?.count ?? BO_DEFAULT_NODE_COUNTS.sheep);
  setVal("boSheepFood", foodNodes.sheep?.amount ?? BO_NODE_AMOUNTS.sheep);
  setVal("boBerriesCount", foodNodes.berries?.count ?? BO_DEFAULT_NODE_COUNTS.berries);
  setVal("boBerriesFood", foodNodes.berries?.amount ?? BO_NODE_AMOUNTS.berries);
  setVal("boDeerCount", foodNodes.deer?.count ?? BO_DEFAULT_NODE_COUNTS.deer);
  setVal("boDeerFood", foodNodes.deer?.amount ?? BO_NODE_AMOUNTS.deer);
  setVal("boBoarCount", foodNodes.boar?.count ?? BO_DEFAULT_NODE_COUNTS.boar);
  setVal("boBoarFood", foodNodes.boar?.amount ?? BO_NODE_AMOUNTS.boar);

  setVal("boRateSheep", gatherRates.sheep ?? BO_BASE_RATES.sheep);
  setVal("boRateBerries", gatherRates.berries ?? BO_BASE_RATES.berries);
  setVal("boRateDeer", gatherRates.deer ?? BO_BASE_RATES.deer);
  setVal("boRateBoar", gatherRates.boar ?? BO_BASE_RATES.boar);
  setVal("boRateFarm", gatherRates.farm ?? BO_BASE_RATES.farm);
  setVal("boRateWood", gatherRates.wood ?? BO_BASE_RATES.wood);
  setVal("boRateGold", gatherRates.gold ?? BO_BASE_RATES.gold);
  setVal("boRateStone", gatherRates.stone ?? BO_BASE_RATES.stone);

  setVal("boCarrySheep", carry.sheep ?? BO_DEFAULT_CARRY.sheep);
  setVal("boCarryBerries", carry.berries ?? BO_DEFAULT_CARRY.berries);
  setVal("boCarryDeer", carry.deer ?? BO_DEFAULT_CARRY.deer);
  setVal("boCarryBoar", carry.boar ?? BO_DEFAULT_CARRY.boar);
  setVal("boCarryFarm", carry.farm ?? BO_DEFAULT_CARRY.farm);
  setVal("boCarryWood", carry.wood ?? BO_DEFAULT_CARRY.wood);
  setVal("boCarryGold", carry.gold ?? BO_DEFAULT_CARRY.gold);
  setVal("boCarryStone", carry.stone ?? BO_DEFAULT_CARRY.stone);

  boCommands = Array.isArray(snapshot.commands) ? cloneBoData(snapshot.commands) : [];
  normalizeBoCommands();
  applyAutoDefaultsForAllCommands();
  boIdCounter = Math.max(1, getBoNextIdCounter(boCommands));
  boLastCommandType = snapshot.lastCommandType || "assign";
  renderBoCivBonuses(civ);

  updateBoCivGate(false);
  renderBoTimelineEditor();
  renderBoCommandEditor(null);
  renderBoGatherRates();
  refreshBoSaveUi(options.selectedId || BO_SAVE_DRAFT_ID);
  scheduleRunBuildOrder();
  if (options.statusText) setBoSaveStatus(options.statusText);
  return true;
}

function scheduleBoDraftSave(delayMs = 220) {
  if (boPersistTimer) clearTimeout(boPersistTimer);
  boPersistTimer = setTimeout(() => {
    const snapshot = getBoPersistedSnapshot();
    if (!snapshot) {
      refreshBoSaveUi();
      return;
    }
    const storage = readBoSaveStorage();
    storage.lastCiv = snapshot.civ;
    storage.drafts[snapshot.civ] = snapshot;
    if (writeBoSaveStorage(storage)) refreshBoSaveUi(document.getElementById("boSaveSelect")?.value || BO_SAVE_DRAFT_ID);
  }, delayMs);
}

function loadBoDraftForCiv(civ, options = {}) {
  if (!civ || !isBoSupportedCiv(civ)) return false;
  const storage = readBoSaveStorage();
  const draft = storage.drafts?.[civ];
  if (!draft) return false;
  return applyBoSnapshot(draft, {
    selectedId: BO_SAVE_DRAFT_ID,
    statusText: options.statusText === false ? "" : `Restored ${civ} draft.`
  });
}

function saveBoNamedPreset() {
  if (!updateBoCivGate(true, "Select a civilization before saving a build order.")) return;
  const snapshot = getBoPersistedSnapshot();
  if (!snapshot) return;
  const civ = snapshot.civ;
  const storage = readBoSaveStorage();
  const select = document.getElementById("boSaveSelect");
  const nameInput = document.getElementById("boSaveName");
  const selectedId = select?.value || BO_SAVE_DRAFT_ID;
  const existing = selectedId === BO_SAVE_DRAFT_ID
    ? null
    : (storage.saves?.[civ] || []).find((entry) => entry.id === selectedId) || null;
  const name = (nameInput?.value || "").trim() || existing?.name || `Build ${new Date().toLocaleString()}`;
  const id = existing?.id || `save_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    name,
    savedAt: Date.now(),
    snapshot: { ...snapshot, savedAt: Date.now() }
  };

  const nextSaves = (storage.saves?.[civ] || []).filter((item) => item.id !== id);
  nextSaves.push(entry);
  storage.saves = storage.saves || {};
  storage.saves[civ] = nextSaves;
  storage.drafts = storage.drafts || {};
  storage.drafts[civ] = snapshot;
  storage.lastCiv = civ;
  if (!writeBoSaveStorage(storage)) return;
  refreshBoSaveUi(id);
  if (nameInput) nameInput.value = name;
  setBoSaveStatus(`Saved "${name}" locally for ${civ}.`);
}

function loadBoSelectedPreset() {
  if (!updateBoCivGate(true, "Select a civilization before loading a build order.")) return;
  const civ = getBoSelectedCiv();
  const select = document.getElementById("boSaveSelect");
  const selectedId = select?.value || BO_SAVE_DRAFT_ID;
  const storage = readBoSaveStorage();
  if (selectedId === BO_SAVE_DRAFT_ID) {
    if (!loadBoDraftForCiv(civ)) {
      setBoSaveStatus(`No autosaved draft found for ${civ}.`);
    }
    return;
  }
  const entry = (storage.saves?.[civ] || []).find((item) => item.id === selectedId);
  if (!entry?.snapshot) {
    setBoSaveStatus("That saved build could not be loaded.");
    refreshBoSaveUi();
    return;
  }
  applyBoSnapshot(entry.snapshot, {
    selectedId,
    statusText: `Loaded "${entry.name}" for ${civ}.`
  });
}

function deleteBoSelectedPreset() {
  const civ = getBoSelectedCiv();
  const select = document.getElementById("boSaveSelect");
  const selectedId = select?.value || BO_SAVE_DRAFT_ID;
  if (!civ || selectedId === BO_SAVE_DRAFT_ID) return;
  const storage = readBoSaveStorage();
  const existing = (storage.saves?.[civ] || []).find((item) => item.id === selectedId);
  storage.saves = storage.saves || {};
  storage.saves[civ] = (storage.saves[civ] || []).filter((item) => item.id !== selectedId);
  if (!writeBoSaveStorage(storage)) return;
  refreshBoSaveUi(BO_SAVE_DRAFT_ID);
  setBoSaveStatus(existing?.name ? `Deleted "${existing.name}" from ${civ}.` : `Deleted saved build from ${civ}.`);
}

function restoreBoSavedStateOnInit() {
  const storage = readBoSaveStorage();
  const civ = storage.lastCiv || "";
  const civSelect = document.getElementById("boCiv");
  if (!civSelect || !civ) {
    refreshBoSaveUi();
    return false;
  }
  const hasOption = Array.from(civSelect.options).some((opt) => opt.value === civ);
  if (!hasOption || !isBoSupportedCiv(civ)) {
    refreshBoSaveUi();
    return false;
  }
  const draft = storage.drafts?.[civ];
  if (draft) {
    return applyBoSnapshot(draft, {
      selectedId: BO_SAVE_DRAFT_ID,
      statusText: `Restored ${civ} draft.`
    });
  }
  civSelect.value = civ;
  applyBoStartingResources(civ);
  applyBoStartingVillagers(civ);
  boOttomanLegacyWarning = "";
  applyBoCivRates(civ);
  applyBoCivRestrictions(civ);
  applyBoBoarRestriction(civ);
  renderBoCivBonuses(civ);
  updateBoCivFlags(civ);
  updateBoCivGate(false);
  renderBoTimelineEditor();
  renderBoCommandEditor(getSelectedBoCommand());
  renderBoGatherRates();
  refreshBoSaveUi();
  return true;
}

async function loadBoResourceData() {
  try {
    const res = await fetch("bo_resource_data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.baseRates) {
      BO_BASE_RATES = { ...BO_BASE_RATES, ...data.baseRates };
    }
    if (data?.civOverrides) {
      BO_CIV_RATE_OVERRIDES = { ...BO_CIV_RATE_OVERRIDES, ...data.civOverrides };
    }
    if (data?.nodeAmounts) {
      BO_NODE_AMOUNTS = {
        ...BO_NODE_AMOUNTS,
        sheep: data.nodeAmounts.sheep ?? BO_NODE_AMOUNTS.sheep,
        berries: data.nodeAmounts.berries ?? BO_NODE_AMOUNTS.berries,
        deer: data.nodeAmounts.deer ?? BO_NODE_AMOUNTS.deer,
        boar: data.nodeAmounts.boar ?? BO_NODE_AMOUNTS.boar
      };
    }
    if (data?.starting) {
      const resStart = data.starting.resources || {};
      BO_STARTING = {
        resources: {
          food: resStart.food ?? BO_STARTING.resources.food,
          wood: resStart.wood ?? BO_STARTING.resources.wood,
          gold: resStart.gold ?? BO_STARTING.resources.gold,
          stone: resStart.stone ?? BO_STARTING.resources.stone
        },
        sheep: data.starting.sheep ?? BO_STARTING.sheep
      };
    }
  } catch (err) {
    console.warn("Build Order: failed to load bo_resource_data.json, using defaults.", err);
  }
  applyBoDefaults();
}

async function loadBoCivBonusData() {
  try {
    const res = await fetch("bo_civ_bonuses.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    BO_BUILDING_DEFAULTS = data.buildings || BO_BUILDING_DEFAULTS;
    BO_TECH_DEFAULTS = data.techs || BO_TECH_DEFAULTS;
    BO_CIV_BONUSES = data.civs || BO_CIV_BONUSES;
    if (data.buildTimeMultByVillagers) {
      BO_BUILD_TIME_MULT_BY_VILLAGERS = data.buildTimeMultByVillagers;
    }
    if (Array.isArray(data.muslimCivs)) {
      BO_MUSLIM_CIVS = new Set(data.muslimCivs);
    }
    BO_BOAR_RESTRICTED_CIVS = new Set(
      Object.entries(BO_CIV_BONUSES || {})
        .filter(([, bonus]) => bonus?.noBoar)
        .map(([civ]) => civ)
    );
    if (!BO_BOAR_RESTRICTED_CIVS.size) BO_BOAR_RESTRICTED_CIVS = BO_MUSLIM_CIVS;
    if (data.muslimBerryBonus) BO_MUSLIM_BERRY_BONUS = data.muslimBerryBonus;
    if (typeof data.sacredSiteGoldPerMin === "number") BO_SACRED_SITE_GOLD_PER_MIN = data.sacredSiteGoldPerMin;
    if (typeof data.pastureSheepSeconds === "number") BO_PASTURE_SHEEP_SECONDS = data.pastureSheepSeconds;
    if (data.ovooStonePerMinByAge) BO_OVOO_STONE_PER_MIN_BY_AGE = data.ovooStonePerMinByAge;
    if (data.scholar) BO_SCHOLAR = { ...BO_SCHOLAR, ...data.scholar };
    refreshBoTechBuildings();
  } catch (err) {
    console.warn("Build Order: failed to load bo_civ_bonuses.json, using defaults.", err);
  }
  refreshBoTechBuildings();
  applyBoDefaults();
}

function initBuildOrderUI() {
  const civSelect = document.getElementById("boCiv");
  const overlayToggle = document.getElementById("boOverlayToggle");
  const timelineFooter = document.getElementById("boTimelineFooter");
  const setupCollapse = document.getElementById("boSetupCollapse");
  boOverlayEnabled = overlayToggle ? overlayToggle.getAttribute("aria-pressed") !== "false" : true;
  setBoOverlayToggleLabel();
  if (timelineFooter && setupCollapse && timelineFooter.nextElementSibling !== setupCollapse) {
    timelineFooter.insertAdjacentElement("afterend", setupCollapse);
  }
  if (civSelect && civSelect.options.length === 1) {
    CIV_ORDER.filter((c) => c !== "Common").forEach((civ) => {
      const opt = document.createElement("option");
      opt.value = civ;
      const supported = isBoSupportedCiv(civ);
      opt.textContent = supported ? civ : `${civ} (unmodeled)`;
      opt.disabled = !supported;
      civSelect.appendChild(opt);
    });
  }
  if (civSelect) {
    civSelect.addEventListener("change", () => {
      const rawCiv = getBoRawSelectedCiv();
      const civ = getBoSelectedCiv();
      boSelectedBuilding = null;
      clearBoTargetBuilding();
      if (loadBoDraftForCiv(civ, { statusText: false })) {
        setBoSaveStatus(`Restored ${civ} draft.`);
        return;
      }
      applyBoStartingResources(civ);
      applyBoStartingVillagers(civ);
      boOttomanLegacyWarning = "";
      applyBoCivRates(civ);
      applyBoCivRestrictions(civ);
      applyBoBoarRestriction(civ);
      renderBoCivBonuses(rawCiv || civ);
      updateBoCivFlags(civ);
      applyAutoDefaultsForAllCommands();
      boLastResults = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(getSelectedBoCommand());
      updateBoCivGate(false);
      refreshBoSaveUi();
      scheduleRunBuildOrder();
    });
  }
  applyBoDisplayDefaults();
  applyBoDefaults();
  renderBoTimelineEditor();
  renderBoCommandEditor(getSelectedBoCommand());
  updateBoCivGate(true);
  renderBoGatherRates();
  renderBoTimelineFooter();
  syncBoDisplayControlStates();
  refreshBoSaveUi();
}

function updateBoCivFlags(civ) {
  const buildCard = document.getElementById("boBuildCard");
  const resultsCard = document.getElementById("boResultsCard");
  const flagWrap = document.getElementById("boCivFlags");
  const titleText = document.getElementById("boTitleText");
  if (!civ) {
    if (flagWrap) flagWrap.innerHTML = "";
    if (titleText) titleText.textContent = "Build Order";
    setFlagBackground(buildCard, []);
    setFlagBackground(resultsCard, []);
    return;
  }
  if (flagWrap) flagWrap.innerHTML = getCivFlagHtml(civ, 22);
  if (titleText) titleText.textContent = `Build Order (${civ})`;
  setFlagBackground(buildCard, [civ]);
  setFlagBackground(resultsCard, [civ]);
}

function createBoCommand(type = "assign") {
  const id = `cmd${boIdCounter++}`;
  const cmd = {
    id,
    type,
    timeMode: "afterPrev",
    afterId: null,
    atTime: 0,
    payload: {},
    autoCost: true,
    autoTime: true
  };
  setBoDefaults(cmd);
  return cmd;
}

function setBoDefaults(cmd) {
  if (cmd.type === "assign") {
    cmd.payload = {
      berries: 0,
      deer: 0,
      boar: 0,
      sheep: 0,
      farm: 0,
      wood: 0,
      gold: 0,
      stone: 0,
      travelDelaySec: 0,
      tripOverrides: {}
    };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "autoVill") {
    cmd.payload = {
      durationSec: 60,
      rallyTarget: "idle"
    };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "buildBuilding") {
    cmd.payload = {
      steps: [
        {
          building: "Mill",
          count: 1,
          time: 20,
          autoTime: true,
          autoCost: true,
          cost: { food: 0, wood: 50, gold: 0, stone: 0 }
        }
      ],
      builders: 1,
      builderSource: "idle",
      returnTarget: null,
      travelDelaySec: 0
    };
  } else if (cmd.type === "tech") {
    cmd.payload = {
      techType: "Wheelbarrow",
      time: 60,
      cost: { food: 150, wood: 50, gold: 0, stone: 0 }
    };
  } else if (cmd.type === "ageUp") {
    cmd.payload = {
      targetAge: 2,
      time: BO_AGE_UP_TIME_DEFAULTS[2] || 120,
      cost: { food: 400, wood: 0, gold: 200, stone: 0 }
    };
  } else if (cmd.type === "houseOfWisdomWing") {
    cmd.payload = {
      wing: "culture",
      branch: null,
      building: BO_HOUSE_OF_WISDOM_BUILDING,
      buildingId: BO_HOUSE_OF_WISDOM_BUILDING,
      targetAge: 2,
      time: 100,
      cost: { food: 400, wood: 0, gold: 200, stone: 0 }
    };
  } else if (cmd.type === "resourceTrip") {
    cmd.payload = {
      resource: "sheep",
      tripOverrideSec: BO_DEFAULT_TRIP.sheep
    };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "vizierChoice") {
    cmd.payload = {
      choiceId: "fieldWork"
    };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "rally") {
    cmd.payload = { target: "idle", travelDelaySec: 0, tripOverrideSec: null };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "trainUnit") {
    cmd.payload = {
      unitName: "Spearman",
      building: "Barracks",
      count: 1,
      repeatUntilEnd: false,
      timePerUnit: 15,
      cost: { food: 60, wood: 20, gold: 0, stone: 0 },
      buildingId: null,
      rallyTarget: null,
      rallyTravelDelaySec: 0,
      rallyTripOverrideSec: null
    };
  } else if (cmd.type === "autoQueue") {
    cmd.payload = {
      unitName: "Spearman",
      building: "Barracks",
      buildingId: null,
      durationSec: 0,
      timePerUnit: 15,
      cost: { food: 60, wood: 20, gold: 0, stone: 0 },
      rallyTarget: null,
      rallyTravelDelaySec: 0,
      rallyTripOverrideSec: null
    };
  } else if (cmd.type === "bonus") {
    cmd.payload = {
      bonusType: "deerCamp",
      enabled: true,
      deerCampPct: 10,
      targetBuildingType: "Barracks"
    };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "sacredSite") {
    cmd.payload = { count: 1 };
    cmd.autoCost = false;
    cmd.autoTime = false;
  } else if (cmd.type === "garrisonScholars") {
    cmd.payload = {
      count: 1,
      timePerScholar: BO_SCHOLAR.time,
      costGold: BO_SCHOLAR.costGold
    };
  }
}

function createBoBuildStep(building = "Mill") {
  const def = getBoBuildingDefaults?.(building) || null;
  return {
    building,
    count: 1,
    time: def?.time ?? 20,
    autoTime: true,
    autoCost: true,
    cost: { ...(def?.cost || { food: 0, wood: 50, gold: 0, stone: 0 }) }
  };
}

function normalizeBoBuildPayload(payload) {
  const next = payload && typeof payload === "object" ? payload : {};
  let steps = Array.isArray(next.steps) ? next.steps : null;
  if (!steps || !steps.length) {
    steps = [{
      building: next.building || "Mill",
      count: Math.max(1, Math.floor(next.count || 1)),
      time: Number.isFinite(next.time) ? next.time : 20,
      autoTime: next.autoTime !== false,
      autoCost: next.autoCost !== false,
      cost: { ...(next.cost || { food: 0, wood: 50, gold: 0, stone: 0 }) }
    }];
  }
  next.steps = steps.map((step) => {
    const def = getBoBuildingDefaults?.(step?.building || "Mill") || null;
    return {
      building: step?.building || "Mill",
      count: Math.max(1, Math.floor(step?.count || 1)),
      time: Number.isFinite(step?.time) ? step.time : (def?.time ?? 20),
      autoTime: step?.autoTime !== false,
      autoCost: step?.autoCost !== false,
      cost: { ...(step?.cost || def?.cost || { food: 0, wood: 50, gold: 0, stone: 0 }) }
    };
  });
  const first = next.steps[0] || createBoBuildStep("Mill");
  next.building = first.building;
  next.time = first.time;
  next.cost = { ...(first.cost || { food: 0, wood: 50, gold: 0, stone: 0 }) };
  next.builders = Math.max(1, Math.floor(next.builders || 1));
  next.builderSource = next.builderSource || "idle";
  next.returnTarget = next.returnTarget === undefined ? null : next.returnTarget;
  next.travelDelaySec = Math.max(0, next.travelDelaySec || 0);
  return next;
}

function getBoBuildSteps(payload) {
  return normalizeBoBuildPayload(payload).steps;
}

function getBoBuildStepCost(step, civ, civBonus, options = {}) {
  const def = getBoBuildingDefaults(step.building) || null;
  let cost = { ...(step.cost || def?.cost || { food: 0, wood: 0, gold: 0, stone: 0 }) };
  const ottomanSettings = options.ottomanSettings || getBoOttomanSettingsFromInputs();
  const howEffects = options.houseOfWisdomEffects || getBoHouseOfWisdomPreviewState().effects || {};
  const isEconomicBuild = def?.type === "economic" || def?.type === "dropoff" || def?.type === "house";
  if (step.autoCost && def?.cost) {
    cost = { ...def.cost };
    if (civ === "Malians" && step.building === "House") {
      cost.wood = Math.round((cost.wood || 0) * (civBonus?.houseWoodCostMult || 0.5));
    }
    if (civ === "Malians" && step.building === "Town Center" && civBonus?.townCenterCostOverride) {
      cost = { ...civBonus.townCenterCostOverride };
    }
    if (civ === "Japanese" && step.building === "Barracks") {
      cost.wood = Math.round((cost.wood || 0) * (civBonus?.barracksWoodCostMult || 0.5));
    }
    if (BO_ENGLISH_FARM_BONUS_CIVS.has(civ) && step.building === "Farm") {
      cost.wood = Math.round((cost.wood || 0) * (civBonus?.farmCostMult || BO_ENGLISH_FARM_COST_MULT));
    }
    if (howEffects.fertileCrescent && isEconomicBuild) {
      cost = {
        food: Math.round((cost.food || 0) * 0.7),
        wood: Math.round((cost.wood || 0) * 0.7),
        gold: Math.round((cost.gold || 0) * 0.7),
        stone: Math.round((cost.stone || 0) * 0.7)
      };
    }
    if (civ === "French" && def?.type === "dropoff") {
      const mult = civBonus?.dropoffCostMult || 0.5;
      cost = {
        food: Math.round((cost.food || 0) * mult),
        wood: Math.round((cost.wood || 0) * mult),
        gold: Math.round((cost.gold || 0) * mult),
        stone: Math.round((cost.stone || 0) * mult)
      };
    }
    if (civ === "Ottomans" && civBonus?.militaryInducementBuildings?.includes(step.building)) {
      const mult = civBonus?.militaryInducementCostMult || 0.6;
      cost = {
        food: Math.round((cost.food || 0) * mult),
        wood: Math.round((cost.wood || 0) * mult),
        gold: Math.round((cost.gold || 0) * mult),
        stone: Math.round((cost.stone || 0) * mult)
      };
    }
    if (civ === "Ottomans" && ottomanSettings?.extensiveFortifications && BO_OTTOMAN_DEFENSIVE_BUILDINGS.has(step.building)) {
      cost = {
        food: Math.round((cost.food || 0) * 0.8),
        wood: Math.round((cost.wood || 0) * 0.8),
        gold: Math.round((cost.gold || 0) * 0.8),
        stone: Math.round((cost.stone || 0) * 0.8)
      };
    }
    if (civ === "Holy Roman Empire" && step.building === "Palace of Swabia") {
      cost = {
        food: Math.round((cost.food || 0) * 0.9),
        wood: Math.round((cost.wood || 0) * 0.9),
        gold: Math.round((cost.gold || 0) * 0.9),
        stone: Math.round((cost.stone || 0) * 0.9)
      };
    }
  }
  return cost;
}

function getBoBuildStepTime(step) {
  const def = getBoBuildingDefaults(step.building) || null;
  if (step.autoTime && def?.time != null) return def.time;
  return Number.isFinite(step.time) ? step.time : (def?.time ?? 20);
}

function getBoBuildQueueSummary(payload) {
  const steps = getBoBuildSteps(payload);
  if (!steps.length) return "Build";
  return steps
    .map((step) => step.count > 1 ? `${step.building} x${step.count}` : step.building)
    .join(" -> ");
}

function getBoBuildQueueSegments(payload, startTime = 0, options = {}) {
  const normalized = normalizeBoBuildPayload(payload);
  const builders = Math.max(1, normalized.builders || 1);
  const summary = getBoBuildQueueSummary(normalized);
  const civ = getBoSelectedCiv();
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const howEffects = isBoHouseOfWisdomCiv(civ) ? getBoHouseOfWisdomPreviewState(startTime).effects || {} : {};
  const segments = [];
  let cursor = startTime;
  let segmentIndex = 0;
  normalized.steps.forEach((step, stepIndex) => {
    let perBuildDuration = getBuildDurationSeconds(getBoBuildStepTime(step), builders);
    if (civ === "Malians" && step.building === "House" && civBonus?.houseBuildTimeMult) {
      perBuildDuration *= civBonus.houseBuildTimeMult;
    }
    if (civ === "Jeanne d'Arc" && (parseInt(document.getElementById("boStartAge")?.value, 10) || 1) === 1 && civBonus.darkAgeBuildSpeedMult) {
      perBuildDuration = perBuildDuration / civBonus.darkAgeBuildSpeedMult;
    }
    if (howEffects.buildSpeedPct > 0) {
      perBuildDuration = applyBoWorkRateToDuration(perBuildDuration, howEffects.buildSpeedPct);
    }
    for (let repeatIndex = 0; repeatIndex < Math.max(1, step.count || 1); repeatIndex++) {
      const duration = perBuildDuration + (segmentIndex === 0 ? Math.max(0, normalized.travelDelaySec || 0) : 0);
      const segStart = cursor;
      const segEnd = segStart + duration;
      const instanceOrdinal = repeatIndex + 1;
      const repeatSuffix = Math.max(1, step.count || 1) > 1 ? ` (${instanceOrdinal}/${Math.max(1, step.count || 1)})` : "";
      segments.push({
        start: segStart,
        end: segEnd,
        buildingType: step.building,
        stepIndex,
        repeatIndex,
        segmentIndex,
        action: `Build ${step.building}`,
        shortLabel: step.building,
        fullLabel: `${summary} | ${step.building}${repeatSuffix}`,
        notes: segmentIndex === 0 && normalized.travelDelaySec > 0 ? `Travel ${normalized.travelDelaySec}s` : "",
        commandId: options.commandId || null,
        order: options.order ?? 0
      });
      cursor = segEnd;
      segmentIndex += 1;
    }
  });
  return segments;
}

function isBoRepeatQueueCommand(cmd) {
  return !!(cmd && cmd.type === "trainUnit" && cmd.payload?.repeatUntilEnd);
}

function normalizeBoCommands(commands = boCommands) {
  if (!Array.isArray(commands) || !commands.length) return false;
  let changed = false;
  commands.forEach((cmd) => {
    if (cmd?.type === "buildBuilding") {
      const before = JSON.stringify(cmd.payload || {});
      cmd.payload = normalizeBoBuildPayload(cmd.payload);
      if (before !== JSON.stringify(cmd.payload || {})) changed = true;
    }
    if (cmd?.type === "resourceTrip") {
      const resource = BO_RESOURCE_KEYS.includes(cmd.payload?.resource) ? cmd.payload.resource : "sheep";
      const nextTrip = Number.isFinite(cmd.payload?.tripOverrideSec)
        ? Math.max(0, cmd.payload.tripOverrideSec)
        : (BO_DEFAULT_TRIP[resource] || 0);
      if (cmd.payload?.resource !== resource || cmd.payload?.tripOverrideSec !== nextTrip) {
        cmd.payload = { resource, tripOverrideSec: nextTrip };
        changed = true;
      }
    }
    if (cmd?.type === "houseOfWisdomWing") {
      const civ = getBoSelectedCiv();
      const wing = cmd.payload?.wing || "culture";
      const branch = civ === "Ayyubids"
        ? (cmd.payload?.branch || Object.keys(BO_AYYUBID_HOW_BRANCHES[wing]?.branches || {})[0] || null)
        : null;
      const nextPayload = {
        ...(cmd.payload || {}),
        wing,
        branch,
        building: BO_HOUSE_OF_WISDOM_BUILDING,
        buildingId: BO_HOUSE_OF_WISDOM_BUILDING
      };
      if (JSON.stringify(nextPayload) !== JSON.stringify(cmd.payload || {})) {
        cmd.payload = nextPayload;
        changed = true;
      }
    }
    if (cmd?.type === "vizierChoice") {
      const nextChoiceId = getBoOttomanChoiceDef(cmd.payload?.choiceId) ? cmd.payload.choiceId : "fieldWork";
      if (cmd.payload?.choiceId !== nextChoiceId) {
        cmd.payload = { choiceId: nextChoiceId };
        changed = true;
      }
    }
    if (!cmd || cmd.type !== "autoQueue") return;
    if (!cmd.payload?.buildingId) return;
    const payload = cmd.payload || {};
    cmd.type = "trainUnit";
    cmd.payload = {
      unitName: payload.unitName || "Spearman",
      building: payload.building || inferBuildingTypeFromId(payload.buildingId) || "Barracks",
      count: Math.max(1, Math.floor(payload.count || 1)),
      repeatUntilEnd: true,
      timePerUnit: payload.timePerUnit || 15,
      cost: { ...(payload.cost || { food: 0, wood: 0, gold: 0, stone: 0 }) },
      buildingId: payload.buildingId || null,
      rallyTarget: payload.rallyTarget ?? null,
      rallyTravelDelaySec: Math.max(0, payload.rallyTravelDelaySec || 0),
      rallyTripOverrideSec: Number.isFinite(payload.rallyTripOverrideSec) ? payload.rallyTripOverrideSec : null
    };
    changed = true;
  });
  if (changed && commands === boCommands) {
    applyAutoDefaultsForAllCommands();
  }
  return changed;
}

function getPrevBoCommandId(id) {
  const idx = boCommands.findIndex((c) => c.id === id);
  if (idx > 0) return boCommands[idx - 1].id;
  return null;
}

function addBoCommand(type, insertAfterId = null) {
  discardBoMarkerDraft(false);
  const cmd = createBoCommand(type);
  boLastCommandType = type === "trainUnit" ? "assign" : type;
  applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  if (insertAfterId) {
    const idx = boCommands.findIndex((c) => c.id === insertAfterId);
    cmd.afterId = insertAfterId;
    if (idx >= 0) boCommands.splice(idx + 1, 0, cmd);
    else boCommands.push(cmd);
  } else {
    boCommands.push(cmd);
  }
  if (cmd.type === "assign") {
    const info = estimateBoVillagerState(cmd.id);
    if (info?.counts) {
      cmd.payload = { ...cmd.payload, ...info.counts };
    }
  }
  boSelectedCommandId = cmd.id;
  boLastResults = null;
  renderBoTimelineEditor();
  renderBoCommandEditor(cmd);
  scheduleRunBuildOrder();
  return cmd;
}

function setBoCommandToTimelineStart(cmd) {
  if (!cmd) return;
  cmd.timeMode = "atTime";
  cmd.atTime = 0;
  cmd.afterId = null;
}

function setBoTargetBuilding(target) {
  boTargetBuilding = target;
}

function clearBoTargetBuilding() {
  setBoTargetBuilding(null);
}

function renderBoCommands() {
  renderBoTimelineEditor();
}

function getSelectedBoCommand() {
  return boCommands.find((c) => c.id === boSelectedCommandId) || null;
}

function getBoMarkerDraftKey(marker) {
  if (!marker) return "";
  const buildingId = marker.buildingId || "TC #1";
  const target = marker.target || "idle";
  const time = Math.round((Math.max(0, marker.time || 0)) * 1000) / 1000;
  return `${buildingId}|${time.toFixed(3)}|${target}|${marker.sourceCommandId || ""}`;
}

function isBoMarkerDraftCommand(cmd) {
  return !!(boMarkerDraft && cmd && boMarkerDraft.cmd?.id === cmd.id);
}

function clearBoMarkerDraft() {
  boMarkerDraft = null;
}

function discardBoMarkerDraft(render = false) {
  if (!boMarkerDraft) return;
  clearBoMarkerDraft();
  if (render) {
    renderBoTimelineEditor();
    renderBoCommandEditor(getSelectedBoCommand());
    renderBoGatherRates();
  }
}

function commitBoMarkerDraft() {
  if (!boMarkerDraft?.cmd) return null;
  const cmd = boMarkerDraft.cmd;
  insertBoCommandAtTime(cmd, boMarkerDraft.marker?.time || 0);
  clearBoMarkerDraft();
  boSelectedBuilding = null;
  setBoTargetBuilding(null);
  boSelectedCommandId = cmd.id;
  boLastCommandType = "trainUnit";
  boLastResults = null;
  return cmd;
}

function isBoEditorComfortablyVisible(editorEl) {
  if (!editorEl) return true;
  const rect = editorEl.getBoundingClientRect();
  const minTop = 72;
  const maxTop = Math.min(Math.max(160, window.innerHeight * 0.35), 260);
  return rect.top >= minTop && rect.top <= maxTop;
}

function animateBoWindowScroll(targetY, durationMs = 200) {
  const startY = window.scrollY || window.pageYOffset || 0;
  const endY = Math.max(0, Math.round(targetY));
  if (Math.abs(endY - startY) < 6) return;
  if (boEditorScrollFrame) cancelAnimationFrame(boEditorScrollFrame);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    window.scrollTo(0, endY);
    return;
  }
  const startTime = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / durationMs);
    const eased = easeOutCubic(progress);
    window.scrollTo(0, startY + ((endY - startY) * eased));
    if (progress < 1) boEditorScrollFrame = requestAnimationFrame(step);
    else boEditorScrollFrame = null;
  };
  boEditorScrollFrame = requestAnimationFrame(step);
}

function scrollBoEditorIntoView() {
  const editor = document.getElementById("boCommandEditor");
  if (!editor || isBoEditorComfortablyVisible(editor)) return;
  const targetY = (window.scrollY || window.pageYOffset || 0) + editor.getBoundingClientRect().top - 88;
  animateBoWindowScroll(targetY, 190);
}

function selectBoCommand(id, options = {}) {
  discardBoMarkerDraft(false);
  boSelectedCommandId = id;
  boSelectedBuilding = null;
  setBoTargetBuilding(null);
  const cmd = boCommands.find((c) => c.id === id);
  if (cmd) {
    boLastCommandType = cmd.type === "trainUnit" ? "assign" : cmd.type;
  }
  renderBoTimelineEditor();
  renderBoCommandEditor(getSelectedBoCommand());
  renderBoGatherRates();
  if (options.scrollToEditor) scrollBoEditorIntoView();
}

function selectBoBuilding(building, options = {}) {
  discardBoMarkerDraft(false);
  boSelectedCommandId = null;
  boSelectedBuilding = building;
  if (building) setBoTargetBuilding({ id: building.id, type: building.type });
  renderBoTimelineEditor();
  renderBoCommandEditor(null);
  renderBoGatherRates();
  if (options.scrollToEditor) scrollBoEditorIntoView();
}

function setBoOverlayToggleLabel() {
  const overlayToggle = document.getElementById("boOverlayToggle");
  if (!overlayToggle) return;
  const stateLabel = boOverlayEnabled ? "On" : "Off";
  const icon = boOverlayEnabled ? "bi-bar-chart-line-fill" : "bi-bar-chart-line";
  overlayToggle.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>Resources lane: ${stateLabel}</span>`;
  overlayToggle.setAttribute("title", boOverlayEnabled ? "Hide the resources lane" : "Show the resources lane");
}

function setBoLaneCaption(laneKey, text) {
  if (!laneKey) return;
  const laneEl = document.getElementById("boLaneTimeline");
  if (!laneEl) return;
  const caption = laneEl.querySelector(`.bo-lane-caption[data-lane-key="${laneKey}"]`);
  if (caption) caption.textContent = text || "";
}

function clearBoLaneCaptions() {
  const laneEl = document.getElementById("boLaneTimeline");
  if (!laneEl) return;
  laneEl.querySelectorAll(".bo-lane-caption").forEach((el) => { el.textContent = ""; });
}

function applyBoLaneCaptionSelection() {
  clearBoLaneCaptions();
  const laneEl = document.getElementById("boLaneTimeline");
  if (!laneEl) return;
  let block = null;
  if (boSelectedCommandId) {
    block = laneEl.querySelector(`.bo-lane-block[data-command-id="${boSelectedCommandId}"]`);
  }
  if (block) {
    const laneKey = block.dataset.laneKey;
    const label = block.dataset.fullLabel || block.textContent || "";
    setBoLaneCaption(laneKey, label);
  } else if (boSelectedBuilding?.id) {
    const laneKey = boSelectedBuilding.type === BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING
      ? "imperialCouncil"
      : (boSelectedBuilding.id.startsWith("TC ") ? "tc" : `building:${boSelectedBuilding.id}`);
    setBoLaneCaption(laneKey, `${boSelectedBuilding.type} - ${boSelectedBuilding.id}`);
  } else {
    const lastAssign = [...boCommands].reverse().find((cmd) => cmd.type === "assign");
    if (lastAssign) {
      setBoLaneCaption("assignments", formatBoAssignmentLabel(lastAssign.payload || {}));
    }
  }
}

function applyAutoDefaultsForAllCommands() {
  const civ = document.getElementById("boCiv")?.value || "";
  boCommands.forEach((cmd) => applyAutoDefaultsForCommand(cmd, civ));
}

function getBoBuildingDefaults(name) {
  return BO_BUILDING_DEFAULTS?.[name] || null;
}

function getBoTechDefaults(name) {
  return BO_TECH_DEFAULTS?.[name] || null;
}

function getBoUnitDefaults(unitName, civ) {
  const resolved = resolveBoUnitName(unitName);
  if (resolved === "Villager") {
    return {
      cost: { food: 50, wood: 0, gold: 0, stone: 0 },
      time: BO_VILLAGER_TIME,
      population: 1
    };
  }
  if (resolved === "Scout") {
    return {
      cost: { food: 65, wood: 0, gold: 0, stone: 0 },
      time: 23,
      population: 1
    };
  }
  const extra = getBoExtraUnitSpec(unitName, civ);
  if (extra) {
    return {
      cost: {
        food: extra.cost?.food || 0,
        wood: extra.cost?.wood || 0,
        gold: extra.cost?.gold || 0,
        stone: extra.cost?.stone || 0
      },
      time: extra.time || 0,
      population: extra.population || 1
    };
  }
  const unit = getUnitMeta(resolved);
  if (!unit) return null;
  const civs = unit.civs || [];
  const exceptCivs = unit.exceptCivs || [];
  const isAllowed = civ
    ? (civs.includes("Common") || civs.includes(civ)) && !exceptCivs.includes(civ)
    : civs.includes("Common");
  if (!isAllowed) return null;
  return {
    cost: {
      food: unit.costs?.food || 0,
      wood: unit.costs?.wood || 0,
      gold: unit.costs?.gold || 0,
      stone: unit.costs?.stone || 0
    },
    time: unit.trainingTime || unit.training_time || 0,
    population: unit.population || 1
  };
}

function getBoUnitOptions(civ) {
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

function getBoMilitaryProductionSpeedPct(civ, buildingType, age, options = {}) {
  if (civ !== "Ottomans") return 0;
  if (!BO_PRODUCTION_BUILDINGS.has(buildingType) || buildingType === "Town Center") return 0;
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const ottomanSettings = options.ottomanSettings || getBoOttomanSettingsFromInputs();
  let pct = 0;
  if (options.hasInfluenceSource) {
    pct += getBoAgeBonusValue(civBonus.productionInfluenceByAge, age);
  }
  if (ottomanSettings?.advancedAcademy) {
    pct += civBonus.militarySchool?.advancedAcademySpeedPct || 25;
  }
  return pct;
}

function getBoPreviewTrainSpec(unitName, buildingType, civ, options = {}) {
  const base = getBoUnitDefaults(unitName, civ);
  if (!base) return null;
  const surfaceConfig = getBoBuildingSurfaceConfig(buildingType, civ);
  const trainingSurface = getBoTrainingSurface(buildingType, civ);
  const unitTrainMod = getBoUnitTrainModifier(buildingType, civ, unitName);
  let cost = { ...(base.cost || { food: 0, wood: 0, gold: 0, stone: 0 }) };
  let time = base.time || 0;
  const ottomanSettings = options.ottomanSettings || getBoOttomanSettingsFromInputs();
  const howState = isBoHouseOfWisdomCiv(civ) ? getBoHouseOfWisdomPreviewState(options.timeOverride) : null;
  const previewTechState = getBoTechPreviewState(civ, options.timeOverride);
  if (civ === "Abbasid Dynasty" && resolveBoUnitName(unitName) === "Villager" && previewTechState.researchedTechs.has("Fresh Foodstuffs")) {
    cost.food = Math.round((cost.food || 0) * 0.6);
  }
  if (civ === "Mongols" && /horseman/i.test(resolveBoUnitName(unitName))) {
    const civBonus = BO_CIV_BONUSES?.[civ] || {};
    time *= civBonus.horsemenTrainTimeMult || 0.75;
  }
  if (isSiegeUnit(unitName) && Number.isFinite(howState?.goldenAge?.bonuses?.siegeCostMult) && howState.goldenAge.bonuses.siegeCostMult > 0) {
    const mult = howState.goldenAge.bonuses.siegeCostMult;
    cost = {
      food: Math.round((cost.food || 0) * mult),
      wood: Math.round((cost.wood || 0) * mult),
      gold: Math.round((cost.gold || 0) * mult),
      stone: Math.round((cost.stone || 0) * mult)
    };
  }
  if (buildingType === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING) {
    const school = getBoOttomanMilitarySchoolConfig(civ);
    if (school) {
      cost = { food: 0, wood: 0, gold: 0, stone: 0 };
      time *= school.trainTimeMult || 4.75;
      time = applyBoWorkRateToDuration(
        time,
        getBoMilitaryProductionSpeedPct(civ, buildingType, options.age || (parseInt(document.getElementById("boStartAge")?.value, 10) || 1), {
          ottomanSettings,
          hasInfluenceSource: !!options.hasInfluenceSource
        })
      );
    }
  } else if (trainingSurface === "Town Center") {
    time = applyBoWorkRateToDuration(time, getBoPreviewTownCenterWorkRatePct(civ, options.age));
  }
  if (Number.isFinite(unitTrainMod.costMult) && unitTrainMod.costMult > 0 && unitTrainMod.costMult !== 1) {
    cost = {
      food: Math.round((cost.food || 0) * unitTrainMod.costMult),
      wood: Math.round((cost.wood || 0) * unitTrainMod.costMult),
      gold: Math.round((cost.gold || 0) * unitTrainMod.costMult),
      stone: Math.round((cost.stone || 0) * unitTrainMod.costMult)
    };
  }
  if (Number.isFinite(unitTrainMod.timePct) && unitTrainMod.timePct > 0) {
    time = applyBoWorkRateToDuration(time, unitTrainMod.timePct);
  }
  if (Number.isFinite(surfaceConfig.trainTimePct) && surfaceConfig.trainTimePct > 0) {
    time = applyBoWorkRateToDuration(time, surfaceConfig.trainTimePct);
  }
  if (howState?.goldenAge?.bonuses?.productionPct && BO_PRODUCTION_BUILDINGS.has(trainingSurface) && trainingSurface !== "Town Center") {
    time = applyBoWorkRateToDuration(time, howState.goldenAge.bonuses.productionPct);
  }
  if (civ === "Ottomans" && resolveBoUnitName(unitName) === "Villager" && ottomanSettings?.paxOttomana) {
    time = applyBoWorkRateToDuration(time, 75);
  }
  return {
    cost,
    time,
    population: base.population || 1
  };
}

function applyAutoDefaultsForCommand(cmd, civ) {
  if (!cmd) return;
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  if (cmd.type === "buildBuilding") {
    cmd.payload = normalizeBoBuildPayload(cmd.payload);
    cmd.payload.steps.forEach((step) => {
      step.time = getBoBuildStepTime(step);
      step.cost = getBoBuildStepCost(step, civ, civBonus);
    });
    const first = cmd.payload.steps[0];
    if (first) {
      cmd.payload.building = first.building;
      cmd.payload.time = first.time;
      cmd.payload.cost = { ...first.cost };
    }
  }
  if (cmd.type === "tech") {
    const inferredBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId) || null;
    const techBuildingType = inferredBuilding && doesBoTechMatchBuilding(cmd.payload.techType, inferredBuilding, civ) ? inferredBuilding : null;
    cmd.payload.building = techBuildingType;
    if (cmd.payload.buildingId && inferBoBuildingTypeFromId(cmd.payload.buildingId) !== techBuildingType) {
      cmd.payload.buildingId = null;
    }
    const info = getBoTechDisplayInfo(cmd.payload.techType, civ, techBuildingType);
    if (cmd.autoTime) cmd.payload.time = info.time;
    if (cmd.autoCost) cmd.payload.cost = { ...info.cost };
  }
  if (cmd.type === "trainUnit") {
    const trainingBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
    const preview = getBoPreviewTrainSpec(cmd.payload.unitName, trainingBuilding, civ, {
      ottomanSettings: getBoOttomanSettingsFromInputs()
    });
    if (preview) {
      if (cmd.autoTime) cmd.payload.timePerUnit = preview.time;
      if (cmd.autoCost) cmd.payload.cost = { ...preview.cost };
    }
    if (trainingBuilding === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING) {
      cmd.payload.repeatUntilEnd = true;
      cmd.payload.count = 1;
    }
  }
  if (cmd.type === "autoQueue") {
    const trainingBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
    const preview = getBoPreviewTrainSpec(cmd.payload.unitName, trainingBuilding, civ, {
      ottomanSettings: getBoOttomanSettingsFromInputs()
    });
    if (preview) {
      if (cmd.autoTime) cmd.payload.timePerUnit = preview.time;
      if (cmd.autoCost) cmd.payload.cost = { ...preview.cost };
    }
  }
  if (cmd.type === "garrisonScholars") {
    if (cmd.autoTime) cmd.payload.timePerScholar = BO_SCHOLAR.time;
    if (cmd.autoCost) cmd.payload.costGold = BO_SCHOLAR.costGold;
  }
  if (cmd.type === "houseOfWisdomWing") {
    const spec = getBoHouseOfWisdomCommandSpec(cmd, civ);
    cmd.payload.building = BO_HOUSE_OF_WISDOM_BUILDING;
    cmd.payload.buildingId = BO_HOUSE_OF_WISDOM_BUILDING;
    if (cmd.autoTime) cmd.payload.time = spec.time;
    if (cmd.autoCost) cmd.payload.cost = { ...spec.cost };
    cmd.payload.targetAge = spec.targetAge;
  }
  if (cmd.type === "ageUp") {
    const ageTimes = civBonus.ageUpTimeByTarget || BO_AGE_UP_TIME_DEFAULTS;
    const targetAge = cmd.payload?.targetAge || 2;
    if (cmd.autoTime && ageTimes?.[targetAge]) cmd.payload.time = ageTimes[targetAge];
  }
}

function getBuildTimeMultiplier(builders) {
  const count = Math.max(1, Math.floor(builders || 1));
  const table = BO_BUILD_TIME_MULT_BY_VILLAGERS || {};
  const keys = Object.keys(table).map((k) => parseInt(k, 10)).filter((k) => Number.isFinite(k)).sort((a, b) => a - b);
  if (!keys.length) return 1;
  if (table[count] != null) return table[count];
  if (count <= keys[0]) return table[keys[0]];
  if (count >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  let lower = keys[0];
  let upper = keys[keys.length - 1];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] < count) lower = keys[i];
    if (keys[i] > count) {
      upper = keys[i];
      break;
    }
  }
  const lowVal = table[lower];
  const upVal = table[upper];
  if (lowVal == null || upVal == null) return table[lower] ?? table[upper] ?? 1;
  const ratio = (count - lower) / Math.max(1, upper - lower);
  return lowVal + (upVal - lowVal) * ratio;
}

function getBuildDurationSeconds(baseTime, builders) {
  const mult = getBuildTimeMultiplier(builders);
  return (baseTime || 0) * (Number.isFinite(mult) ? mult : 1);
}

function inferBoBuildingTypeFromId(id) {
  if (!id) return null;
  if (id.startsWith("TC ")) return "Town Center";
  return id.split(" #")[0] || null;
}

function getBoCommandDuration(cmd, startTime = 0, simEndOverride = null) {
  if (!cmd) return 0;
  if (cmd.type === "assign") return cmd.payload.travelDelaySec || 0;
  if (cmd.type === "houseOfWisdomWing") return Math.max(0, cmd.payload.time || 0);
  if (cmd.type === "resourceTrip") return 0;
  if (cmd.type === "vizierChoice") return 0;
  if (cmd.type === "buildBuilding") {
    const segments = getBoBuildQueueSegments(cmd.payload, startTime);
    if (!segments.length) return 0;
    return segments[segments.length - 1].end - startTime;
  }
  if (cmd.type === "tech") {
    let duration = cmd.payload.time || 0;
    if (cmd.autoTime) {
      const civ = document.getElementById("boCiv")?.value || "";
      const techBuildingType = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
      if (getBoTechSurface(techBuildingType, civ) === "Town Center") {
        duration = applyBoWorkRateToDuration(duration, getBoPreviewTownCenterWorkRatePct(civ));
      }
    }
    return duration;
  }
  if (cmd.type === "ageUp") return cmd.payload.time || 0;
  if (cmd.type === "trainUnit") {
    let perUnit = cmd.payload.timePerUnit || 0;
    if (cmd.autoTime) {
      const civ = document.getElementById("boCiv")?.value || "";
      const trainingBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
      if (getBoTrainingSurface(trainingBuilding, civ) === "Town Center") {
        perUnit = applyBoWorkRateToDuration(perUnit, getBoPreviewTownCenterWorkRatePct(civ));
      }
    }
    if (cmd.payload?.repeatUntilEnd) {
      const simEnd = Number.isFinite(simEndOverride) ? simEndOverride : getBoSimEndInput();
      return Math.max(0, simEnd - (startTime || 0));
    }
    return perUnit * Math.max(1, cmd.payload.count || 1);
  }
  if (cmd.type === "autoQueue") {
    const simEnd = Number.isFinite(simEndOverride) ? simEndOverride : getBoSimEndInput();
    return Math.max(0, simEnd - (startTime || 0));
  }
  if (cmd.type === "garrisonScholars") return (cmd.payload.timePerScholar || 0) * Math.max(0, cmd.payload.count || 0);
  return 0;
}

function getBoCommandLabel(cmd) {
  if (!cmd) return "Command";
  if (cmd.type === "assign") return "Assign Villagers";
  if (cmd.type === "autoVill") return "Auto-TC (legacy)";
  if (cmd.type === "buildBuilding") return `Build ${getBoBuildQueueSummary(cmd.payload)}`;
  if (cmd.type === "tech") return `Tech: ${cmd.payload.techType}`;
  if (cmd.type === "ageUp") return `Age Up to ${cmd.payload.targetAge}`;
  if (cmd.type === "houseOfWisdomWing") {
    const civ = getBoSelectedCiv();
    return `House of Wisdom: ${getBoHouseOfWisdomWingLabel(civ, cmd.payload?.wing, cmd.payload?.branch)}`;
  }
  if (cmd.type === "resourceTrip") return `${getBoResourceLabel(cmd.payload?.resource)} trip ${formatBoTripOverrideValue(cmd.payload?.tripOverrideSec || 0)}`;
  if (cmd.type === "vizierChoice") return `Imperial Council: ${getBoOttomanChoiceDef(cmd.payload?.choiceId)?.label || "Vizier Choice"}`;
  if (cmd.type === "rally") return `Rally -> ${cmd.payload.target}`;
  if (cmd.type === "trainUnit") {
    const civ = getBoSelectedCiv();
    const isTownCenterVillager =
      isBoTownCenterSurface(cmd.payload?.building || inferBoBuildingTypeFromId(cmd.payload?.buildingId) || null, civ) &&
      cmd.payload?.unitName === "Villager";
    if (cmd.payload?.repeatUntilEnd) {
      if (cmd.payload.unitName === "Villager" && cmd.payload.rallyTarget) {
        return isTownCenterVillager
          ? `Rally Villagers -> ${cmd.payload.rallyTarget}`
          : `Repeat Villager -> ${cmd.payload.rallyTarget}`;
      }
      return `Repeat ${cmd.payload.unitName}`;
    }
    if (cmd.payload.unitName === "Villager" && cmd.payload.rallyTarget) {
      return isTownCenterVillager
        ? `Rally next ${cmd.payload.count || 1} -> ${cmd.payload.rallyTarget}`
        : `Train ${cmd.payload.count || 1} Villager -> ${cmd.payload.rallyTarget}`;
    }
    return `Train ${cmd.payload.count || 1} ${cmd.payload.unitName}`;
  }
  if (cmd.type === "autoQueue") return `Legacy Repeat ${cmd.payload.unitName}`;
  if (cmd.type === "bonus") return `Bonus: ${cmd.payload.bonusType}`;
  if (cmd.type === "sacredSite") return `Sacred Sites: ${cmd.payload.count || 0}`;
  if (cmd.type === "garrisonScholars") return `Garrison Scholars (${cmd.payload.count || 0})`;
  return "Command";
}

function formatBoAssignmentLabel(payload) {
  const counts = payload || {};
  const berries = counts.berries || 0;
  const deer = counts.deer || 0;
  const boar = counts.boar || 0;
  const sheep = counts.sheep || 0;
  const farm = counts.farm || 0;
  const wood = counts.wood || 0;
  const gold = counts.gold || 0;
  const stone = counts.stone || 0;
  return `Assign vills (B${berries} D${deer} Bo${boar} Sh${sheep} Fm${farm} | W${wood} G${gold} S${stone})`;
}

function boLaneForCommand(cmd) {
  if (!cmd) return "General";
  if (cmd.type === "assign") return "Assignments";
  if (cmd.type === "houseOfWisdomWing") return BO_HOUSE_OF_WISDOM_BUILDING;
  if (cmd.type === "resourceTrip") return getBoResourceLabel(cmd.payload?.resource);
  if (cmd.type === "vizierChoice") return BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING;
  if (cmd.type === "buildBuilding") return "Construction";
  if (cmd.type === "tech") return "Tech";
  if (cmd.type === "rally") return "TC #1";
  if (cmd.type === "trainUnit") return cmd.payload.buildingId || cmd.payload.building || "Production";
  if (cmd.type === "autoQueue") return cmd.payload.buildingId || cmd.payload.building || "Production";
  if (cmd.type === "sacredSite") return "Sacred";
  if (cmd.type === "garrisonScholars") return "Mosque";
  return "General";
}

function getBoBuildingAnchorTime(cmd, buildById) {
  const buildingId = cmd?.payload?.buildingId;
  if (!buildingId) return null;
  if (buildingId.startsWith("TC ")) return 0;
  if (buildById && buildById.has(buildingId)) {
    const readyAt = buildById.get(buildingId)?.readyAt;
    if (Number.isFinite(readyAt)) return readyAt;
  }
  return null;
}

function getBoCommandStart(cmd, prevEnd, plannedById, buildById) {
  if (cmd.timeMode === "atPin") return Math.max(0, cmd.atTime ?? boPinnedTime ?? 0);
  if (cmd.timeMode === "atTime") return Math.max(0, cmd.atTime ?? 0);
  if (cmd.timeMode === "afterPrev") {
    const buildingAnchor = getBoBuildingAnchorTime(cmd, buildById);
    if (buildingAnchor !== null) return buildingAnchor;
  }
  if (cmd.afterId && plannedById.has(cmd.afterId)) return plannedById.get(cmd.afterId).end;
  return prevEnd;
}

function getBoCommandExecutionPriority(cmd) {
  if (!cmd) return 99;
  if (cmd.type === "assign") return 0;
  if (cmd.type === "resourceTrip" || cmd.type === "vizierChoice") return 1;
  if (cmd.type === "houseOfWisdomWing") return 2;
  if (cmd.type === "buildBuilding") return 2;
  return 2;
}

function sortBoExecutionEntries(entries) {
  return entries
    .slice()
    .sort((a, b) => {
      const startDiff = (a.start || 0) - (b.start || 0);
      if (Math.abs(startDiff) > 0.0001) return startDiff;
      const prioDiff = getBoCommandExecutionPriority(a.cmd) - getBoCommandExecutionPriority(b.cmd);
      if (prioDiff !== 0) return prioDiff;
      return (a.idx || 0) - (b.idx || 0);
    });
}

function shouldAdvanceBoChain(cmd) {
  if (cmd.timeMode === "afterPrev" && cmd.payload?.buildingId) return false;
  if (cmd.timeMode === "afterPrev" && cmd.afterId) return false;
  if (isBoRepeatQueueCommand(cmd) || cmd.type === "autoQueue") return false;
  return true;
}

function buildBoPreviewTimelineRows() {
  const planned = buildBoPlannedCommands(boCommands);
  const rows = [];
  planned.forEach((entry) => {
    if (entry.cmd?.type === "buildBuilding") {
      const segments = getBoBuildQueueSegments(entry.cmd.payload, entry.start, {
        commandId: entry.cmd.id,
        order: entry.idx
      });
      segments.forEach((segment) => {
        rows.push({
          commandId: entry.cmd.id,
          start: segment.start,
          end: segment.end,
          action: segment.action,
          notes: segment.notes || "",
          lane: boLaneForCommand(entry.cmd),
          order: entry.idx,
          buildingType: segment.buildingType,
          fullLabel: segment.fullLabel,
          shortLabel: segment.shortLabel,
          segmentIndex: segment.segmentIndex
        });
      });
      return;
    }
    rows.push({
      commandId: entry.cmd.id,
      start: entry.start,
      end: entry.end,
      action: getBoCommandLabel(entry.cmd),
      notes: "",
      lane: boLaneForCommand(entry.cmd),
      order: entry.idx
    });
  });
  return rows;
}

function getBoBuildReadyMap(planned) {
  const civ = getBoSelectedCiv();
  const buildCounts = { "Town Center": 1 };
  const buildById = new Map();
  buildById.set("TC #1", {
    buildingType: "Town Center",
    buildingId: "TC #1",
      readyAt: 0,
      sourceCommandId: BO_CAPITAL_TC_ANCHOR
  });
  if (isBoHouseOfWisdomCiv(civ)) {
    buildCounts[BO_HOUSE_OF_WISDOM_BUILDING] = 1;
    buildById.set(BO_HOUSE_OF_WISDOM_BUILDING, {
      buildingType: BO_HOUSE_OF_WISDOM_BUILDING,
      buildingId: BO_HOUSE_OF_WISDOM_BUILDING,
      readyAt: 0,
      sourceCommandId: BO_CAPITAL_TC_ANCHOR
    });
  }
  const segments = [];
  planned
    .filter((p) => p.cmd?.type === "buildBuilding")
    .forEach((p) => {
      getBoBuildQueueSegments(p.cmd.payload, p.start, {
        commandId: p.cmd.id,
        order: p.idx
      }).forEach((segment) => segments.push({
        ...segment,
        sourceCommandId: p.cmd.id,
        order: p.idx
      }));
    });
  segments
    .sort((a, b) => (a.end - b.end) || ((a.order ?? 0) - (b.order ?? 0)) || ((a.segmentIndex ?? 0) - (b.segmentIndex ?? 0)))
    .forEach((segment) => {
      const name = segment.buildingType || "Building";
      buildCounts[name] = (buildCounts[name] || 0) + 1;
      const instanceId = name === "Town Center"
        ? `TC #${buildCounts[name]}`
        : `${name} #${buildCounts[name]}`;
      if (isBoTimelineCounterBuilding(name)) return;
      buildById.set(instanceId, {
        buildingType: name,
        buildingId: instanceId,
        readyAt: segment.end,
        sourceCommandId: segment.sourceCommandId
      });
    });
  return buildById;
}

function getBoRepeatEndMap(planned) {
  const repeatEndById = new Map();
  const byBuilding = new Map();
  planned.forEach((entry) => {
    if (!isBoRepeatQueueCommand(entry.cmd)) return;
    const buildingId = entry.cmd.payload?.buildingId;
    if (!buildingId) return;
    if (!byBuilding.has(buildingId)) byBuilding.set(buildingId, []);
    byBuilding.get(buildingId).push(entry);
  });
  byBuilding.forEach((entries) => {
    entries
      .slice()
      .sort((a, b) => (a.start - b.start) || ((a.idx ?? 0) - (b.idx ?? 0)))
      .forEach((entry, idx, arr) => {
        const next = arr[idx + 1];
        if (next) repeatEndById.set(entry.cmd.id, next.start);
      });
  });
  return repeatEndById;
}

function planBoCommands(commands, buildById, repeatEndById = null) {
  let prevEnd = 0;
  const planned = [];
  const plannedById = new Map();
  plannedById.set(BO_CAPITAL_TC_ANCHOR, { start: 0, end: 0 });
  const simEnd = getBoSimEndInput();
  commands.forEach((cmd, idx) => {
    const start = getBoCommandStart(cmd, prevEnd, plannedById, buildById);
    const duration = getBoCommandDuration(cmd, start, simEnd);
    let end = start + duration;
    const repeatCutoff = repeatEndById?.get?.(cmd.id);
    if (Number.isFinite(repeatCutoff)) end = Math.min(end, repeatCutoff);
    planned.push({ cmd, start, end, idx });
    plannedById.set(cmd.id, { start, end });
    if (shouldAdvanceBoChain(cmd)) prevEnd = end;
  });
  return planned;
}

function buildBoPlannedCommands(commands) {
  normalizeBoCommands(commands);
  const firstPass = planBoCommands(commands, null);
  const buildById = getBoBuildReadyMap(firstPass);
  const secondPass = planBoCommands(commands, buildById);
  const repeatEndById = getBoRepeatEndMap(secondPass);
  const finalPass = planBoCommands(commands, buildById, repeatEndById);
  finalPass.buildById = buildById;
  return finalPass;
}

function getBoExecutionPlan(commands = boCommands) {
  return sortBoExecutionEntries(buildBoPlannedCommands(commands));
}

function getBoBlockFamilyClass(cmd, row) {
  if (row?.laneDisabled) return "bo-family-disabled";
  if (row?.gatherSegment) return "bo-family-gather";
  if (row?.villagerMarker) return "bo-family-marker";
  if (!cmd) return "bo-family-generic";
  if (cmd.type === "assign") return "bo-family-assign";
  if (cmd.type === "buildBuilding") return "bo-family-build";
  if (cmd.type === "houseOfWisdomWing") return "bo-family-build";
  if (cmd.type === "tech") return "bo-family-tech";
  if (cmd.type === "trainUnit") return cmd.payload?.repeatUntilEnd ? "bo-family-repeat" : "bo-family-queue";
  if (cmd.type === "autoQueue") return "bo-family-repeat";
  return "bo-family-generic";
}

function getBoLaneActionBadges(lane) {
  if (lane?.type === "resource") {
    return [{ label: "Trip", className: "trip", icon: "bi-signpost-split-fill" }];
  }
  if (lane?.buildingType === BO_HOUSE_OF_WISDOM_BUILDING || lane?.key === "houseOfWisdom") {
    return [{ label: "Wings", className: "tech", icon: "bi-building-fill-gear" }];
  }
  if (lane?.buildingType === BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING || lane?.key === "imperialCouncil") {
    return [{ label: "Vizier", className: "vizier", icon: "bi-diagram-3-fill" }];
  }
  const buildingType = lane?.type === "building"
    ? lane.buildingType
    : (lane?.key === "tc" ? "Town Center" : null);
  if (!buildingType) return [];
  const civ = getBoSelectedCiv();
  const badges = [];
  if (isBoProductionSurface(buildingType, civ)) {
    badges.push({ label: "Queue", className: "queue", icon: "bi-people-fill" });
  }
  if (getBoAvailableTechs(civ, buildingType, { ignoreAvailability: true }).length) {
    badges.push({ label: "Research", className: "tech", icon: "bi-stars" });
  }
  return badges;
}

function renderBoTimelineEditor() {
  const laneEl = document.getElementById("boLaneTimeline");
  const labelsEl = document.getElementById("boLaneLabels");
  const tracksEl = document.getElementById("boLaneTracks");
  const stackEl = document.getElementById("boTrackStack");
  const resourceLaneEl = document.getElementById("boResourceLane");
  if (!laneEl || !labelsEl || !tracksEl || !stackEl || !resourceLaneEl) return;

  const baseRows = boLastResults?.timeline?.length
    ? boLastResults.timeline.filter((row) => row.commandId)
    : buildBoPreviewTimelineRows();
  const civ = getBoSelectedCiv();
  const total = getBoTimelineTotal(baseRows);
  const timelineTotal = Math.max(total, 240);

  const buildMeta = {};
  const buildCounts = { "Town Center": 1 };
  const buildInstances = [];
  baseRows
    .map((row) => ({ row, cmd: boCommands.find((c) => c.id === row.commandId) }))
    .filter((entry) => entry.cmd && entry.cmd.type === "buildBuilding" && entry.row.buildingType)
    .sort((a, b) => (a.row.end - b.row.end) || ((a.row.order ?? 0) - (b.row.order ?? 0)))
    .forEach(({ row, cmd }) => {
      const name = row.buildingType || "Building";
      const highlight = BO_TIMELINE_BUILDING_SET.has(name);
      const blocked = row.notes && row.notes.toLowerCase().includes("blocked");
      if (blocked) {
        buildMeta[`${row.commandId}:${row.segmentIndex ?? 0}`] = { label: `Build ${name}`, highlight, blocked: true };
        return;
      }
      buildCounts[name] = (buildCounts[name] || 0) + 1;
      const instanceId = name === "Town Center"
        ? `TC #${buildCounts[name]}`
        : `${name} #${buildCounts[name]}`;
      buildMeta[`${row.commandId}:${row.segmentIndex ?? 0}`] = {
        label: `Build ${name} #${buildCounts[name]}`,
        highlight,
        buildingType: name,
        buildingId: instanceId,
        sourceCommandId: row.commandId
      };
      if (!isBoTimelineCounterBuilding(name)) {
        buildInstances.push({
          buildingType: name,
          buildingId: instanceId,
          start: row.end,
          sourceCommandId: row.commandId,
          highlight
        });
      }
    });

  const resourceOrder = ["sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"];
  const usedResources = new Set();
  const gatherSegments = boLastResults?.gatherSegments || [];
  const villagerMarkers = boLastResults?.villagerMarkers || [];
  const hasAssign = boCommands.some((cmd) => cmd.type === "assign");
  boCommands.forEach((cmd) => {
    if (cmd.type !== "assign") return;
    resourceOrder.forEach((res) => {
      if ((cmd.payload?.[res] || 0) > 0) usedResources.add(res);
    });
  });
  boCommands.forEach((cmd) => {
    if (cmd?.type === "resourceTrip" && BO_RESOURCE_KEYS.includes(cmd.payload?.resource)) {
      usedResources.add(cmd.payload.resource);
    }
  });
  gatherSegments.forEach((seg) => {
    if ((seg?.count || 0) > 0 && seg.resource) usedResources.add(seg.resource);
  });
  villagerMarkers.forEach((marker) => {
    const target = marker?.target;
    if (target && target !== "idle") usedResources.add(target);
  });

  const laneDefs = [];
  const laneIndex = new Map();
  const addLane = (key, label, meta = {}) => {
    if (laneIndex.has(key)) return;
    laneIndex.set(key, laneDefs.length);
    laneDefs.push({ key, label, ...meta });
  };

  addLane("tc", "Town Center", { type: "tc" });
  if (isBoHouseOfWisdomCiv(civ)) {
    addLane("houseOfWisdom", BO_HOUSE_OF_WISDOM_BUILDING, {
      type: "building",
      buildingId: BO_HOUSE_OF_WISDOM_BUILDING,
      buildingType: BO_HOUSE_OF_WISDOM_BUILDING,
      readyAt: 0,
      sourceCommandId: BO_CAPITAL_TC_ANCHOR
    });
  }
  if (civ === "Ottomans") {
    addLane("imperialCouncil", BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING, {
      type: "building",
      buildingId: BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING,
      buildingType: BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING,
      readyAt: 0,
      sourceCommandId: BO_CAPITAL_TC_ANCHOR
    });
  }
  if (hasAssign) addLane("assignments", "Assignments", { type: "assignments", blockHeight: BO_ASSIGN_BLOCK_HEIGHT });
  addLane("construction", "Construction", { type: "construction" });
  resourceOrder.forEach((res) => {
    if (usedResources.has(res)) addLane(`res:${res}`, getBoResourceLabel(res), { type: "resource", resource: res });
  });

  const buildingLaneSet = new Set();
  const buildingLaneDefs = [];
  buildInstances.forEach((inst) => {
    if (inst.buildingType === "Town Center") return;
    const key = `building:${inst.buildingId}`;
    if (buildingLaneSet.has(key)) return;
    buildingLaneSet.add(key);
    buildingLaneDefs.push({
      key,
      label: inst.buildingId,
      type: "building",
      buildingId: inst.buildingId,
      buildingType: inst.buildingType,
      readyAt: inst.start,
      sourceCommandId: inst.sourceCommandId
    });
  });
  buildingLaneDefs.forEach((lane) => addLane(lane.key, lane.label, lane));

  let needsGlobal = false;
  const blocks = [];
  const MIN_VISUAL_SECONDS = 0.25;
  const disabledBlocks = [];

  buildingLaneDefs.forEach((lane) => {
    if (!Number.isFinite(lane.readyAt) || lane.readyAt <= 0) return;
    disabledBlocks.push({
      commandId: null,
      start: 0,
      end: lane.readyAt,
      laneKey: lane.key,
      label: "Not built",
      shortLabel: "Not built",
      fullLabel: `${lane.label} not built`,
      displayDuration: Math.max(lane.readyAt, MIN_VISUAL_SECONDS),
      laneDisabled: true
    });
  });

  disabledBlocks.forEach((block) => blocks.push(block));

  gatherSegments.forEach((seg) => {
    if (!seg || !seg.resource) return;
    if (!usedResources.has(seg.resource)) return;
    const dur = Math.max(0, seg.end - seg.start);
    if (dur <= 0) return;
    blocks.push({
      commandId: null,
      start: seg.start,
      end: seg.end,
      laneKey: `res:${seg.resource}`,
      label: `${getBoResourceLabel(seg.resource)} x${seg.count || 0}`,
      shortLabel: `x${seg.count || 0}`,
      fullLabel: `${getBoResourceLabel(seg.resource)} x${seg.count || 0}`,
      displayDuration: Math.max(dur, MIN_VISUAL_SECONDS),
      gatherSegment: true
    });
  });

  const markerMap = new Map();
  villagerMarkers.forEach((marker) => {
    if (!marker || !Number.isFinite(marker.time)) return;
    const target = marker.target || "idle";
    if (target === "idle") return;
    const key = `${target}|${marker.time.toFixed(3)}|${marker.buildingId || "TC #1"}|${marker.sourceCommandId || ""}`;
    const existing = markerMap.get(key) || {
      time: marker.time,
      target,
      count: 0,
      sourceCommandId: marker.sourceCommandId || null,
      buildingId: marker.buildingId || "TC #1",
      buildingType: marker.buildingType || "Town Center",
      timePerUnit: marker.timePerUnit || BO_VILLAGER_TIME,
      rallyTravelDelaySec: marker.rallyTravelDelaySec || 0,
      rallyTripOverrideSec: Number.isFinite(marker.rallyTripOverrideSec) ? marker.rallyTripOverrideSec : null
    };
    existing.count += Math.max(1, marker.count || 1);
    markerMap.set(key, existing);
  });
  markerMap.forEach((marker) => {
    const laneKey = usedResources.has(marker.target) ? `res:${marker.target}` : "global";
    const markerLabel = `Rally +${marker.count}`;
    blocks.push({
      commandId: null,
      start: marker.time,
      end: marker.time,
      laneKey,
      label: markerLabel,
      shortLabel: markerLabel,
      fullLabel: `Villager completion -> ${getBoResourceLabel(marker.target)} (+${marker.count}) | click to change rally from this point`,
      displayDuration: MIN_VISUAL_SECONDS,
      villagerMarker: true,
      minWidthPx: 54,
      markerTime: marker.time,
      markerTarget: marker.target,
      markerCount: marker.count || 1,
      markerSourceCommandId: marker.sourceCommandId || "",
      markerBuildingId: marker.buildingId || "TC #1",
      markerBuildingType: marker.buildingType || "Town Center",
      markerTimePerUnit: marker.timePerUnit || BO_VILLAGER_TIME,
      markerRallyTravelDelaySec: marker.rallyTravelDelaySec || 0,
      markerRallyTripOverrideSec: Number.isFinite(marker.rallyTripOverrideSec) ? marker.rallyTripOverrideSec : ""
    });
  });

  baseRows.forEach((row) => {
    const cmd = boCommands.find((c) => c.id === row.commandId);
    if (!cmd) return;
    const displayDuration = Math.max(row.end - row.start, MIN_VISUAL_SECONDS);

    if (cmd.type === "assign") {
      const assignLabel = formatBoAssignmentLabel(cmd.payload || {});
      blocks.push({
        ...row,
        laneKey: "assignments",
        label: "Assign",
        shortLabel: "Assign",
        fullLabel: assignLabel,
        displayDuration,
        commandId: row.commandId,
        title: assignLabel,
        assignBlock: true,
        minWidthPx: 76
      });
      return;
    }

    let laneKey = "global";
    if (cmd.type === "rally") {
      laneKey = "tc";
    } else if (cmd.type === "vizierChoice") {
      laneKey = "imperialCouncil";
    } else if (cmd.type === "resourceTrip") {
      laneKey = BO_RESOURCE_KEYS.includes(cmd.payload?.resource) ? `res:${cmd.payload.resource}` : "global";
    } else if (cmd.type === "buildBuilding") {
      laneKey = "construction";
    } else if (cmd.type === "trainUnit" || cmd.type === "autoQueue" || cmd.type === "tech") {
      const buildingId = cmd.payload?.buildingId;
      if (buildingId) laneKey = buildingId.startsWith("TC ") ? "tc" : `building:${buildingId}`;
      else if (cmd.payload?.building === "Town Center") laneKey = "tc";
    }

    if (laneKey === "global") needsGlobal = true;
    const metaKey = row.commandId ? `${row.commandId}:${row.segmentIndex ?? 0}` : null;
    const meta = metaKey ? buildMeta[metaKey] : null;
    const fullLabel = row.fullLabel || meta?.label || row.action;
    let shortLabel = row.action;
    if (cmd.type === "buildBuilding") shortLabel = row.shortLabel || "Build";
    if (cmd.type === "tech") shortLabel = "Tech";
    if (cmd.type === "resourceTrip") shortLabel = `Trip ${formatBoTripOverrideValue(cmd.payload?.tripOverrideSec || 0)}`;
    if (cmd.type === "vizierChoice") shortLabel = getBoOttomanChoiceDef(cmd.payload?.choiceId)?.label || "Vizier";
    if (cmd.type === "trainUnit") {
      const civ = getBoSelectedCiv();
      const isTownCenterVillager =
        isBoTownCenterSurface(cmd.payload?.building || inferBoBuildingTypeFromId(cmd.payload?.buildingId) || null, civ) &&
        cmd.payload?.unitName === "Villager";
      shortLabel = isTownCenterVillager
        ? "Rally"
        : (cmd.payload?.repeatUntilEnd ? "Repeat" : "Queue");
    }
    if (cmd.type === "autoQueue") shortLabel = "Repeat";
    if (cmd.type === "sacredSite") shortLabel = "Sacred";
    if (cmd.type === "garrisonScholars") shortLabel = "Scholars";
    blocks.push({
      ...row,
      laneKey,
      label: meta?.label || row.action,
      shortLabel,
      fullLabel,
      displayDuration,
      commandId: row.commandId,
      highlight: meta?.highlight,
      minWidthPx: cmd.type === "buildBuilding" || cmd.type === "trainUnit" || cmd.type === "autoQueue" || cmd.type === "resourceTrip" || cmd.type === "vizierChoice" ? 54 : undefined
    });
  });

  if (needsGlobal) addLane("global", "Global", { type: "global" });

  const laneBlocks = new Map();
  laneDefs.forEach((lane) => laneBlocks.set(lane.key, []));
  blocks.forEach((block) => {
    if (!laneBlocks.has(block.laneKey)) laneBlocks.set(block.laneKey, []);
    laneBlocks.get(block.laneKey).push(block);
  });

  const laneHeights = new Map();
  const laneRowCounts = new Map();
  const laneBlockHeights = new Map();
  const laneMetaByKey = new Map();
  laneDefs.forEach((lane) => {
    laneBlockHeights.set(lane.key, lane.blockHeight || BO_TIMELINE_BLOCK_HEIGHT);
    laneMetaByKey.set(lane.key, lane);
  });
  const assignLaneRows = (laneKey, list) => {
    const laneMeta = laneMetaByKey.get(laneKey);
    const blockHeight = laneBlockHeights.get(laneKey) || BO_TIMELINE_BLOCK_HEIGHT;
    if (laneMeta?.type === "resource") {
      const hasMarkers = (list || []).some((block) => block.villagerMarker);
      const markerHeight = hasMarkers ? BO_RESOURCE_MARKER_HEIGHT : 0;
      const markerGap = hasMarkers ? BO_RESOURCE_MARKER_GAP : 0;
      (list || []).forEach((block) => {
        block._laneRow = 0;
        block._resourceTrack = block.villagerMarker ? "marker" : "gather";
      });
      laneHeights.set(laneKey, BO_LANE_CAPTION_HEIGHT + markerHeight + markerGap + BO_TIMELINE_BLOCK_HEIGHT);
      laneRowCounts.set(laneKey, 1);
      return;
    }
    if (!list || list.length === 0) {
      laneHeights.set(laneKey, blockHeight + BO_LANE_CAPTION_HEIGHT);
      laneRowCounts.set(laneKey, 1);
      return;
    }
    const rowsEnd = [];
    const stackList = list.filter((block) => !block.laneDisabled);
    stackList
      .slice()
      .sort((a, b) => (a.start - b.start) || ((a.end || 0) - (b.end || 0)))
      .forEach((block) => {
        const start = block.start || 0;
        const dur = Math.max(0, block.displayDuration || (block.end - block.start));
        const end = start + dur;
        let rowIdx = -1;
        for (let i = 0; i < rowsEnd.length; i++) {
          if (start >= rowsEnd[i]) {
            rowIdx = i;
            break;
          }
        }
        if (rowIdx === -1) {
          rowIdx = rowsEnd.length;
          rowsEnd.push(end);
        } else {
          rowsEnd[rowIdx] = Math.max(rowsEnd[rowIdx], end);
        }
        block._laneRow = rowIdx;
      });
    list.forEach((block) => {
      if (block.laneDisabled) block._laneRow = 0;
    });
    const rowCount = Math.max(1, rowsEnd.length);
    laneRowCounts.set(laneKey, rowCount);
    const rowsHeight = (blockHeight * rowCount) + (BO_TIMELINE_ROW_GAP * (rowCount - 1));
    laneHeights.set(laneKey, rowsHeight + BO_LANE_CAPTION_HEIGHT);
  };

  laneDefs.forEach((lane) => assignLaneRows(lane.key, laneBlocks.get(lane.key)));

  const laneTops = new Map();
  let currentTop = BO_TIMELINE_PADDING + BO_TIMELINE_HEADER_HEIGHT;
  laneDefs.forEach((lane, idx) => {
    const height = laneHeights.get(lane.key) || BO_TIMELINE_BLOCK_HEIGHT;
    laneTops.set(lane.key, currentTop);
    currentTop += height;
    if (idx < laneDefs.length - 1) currentTop += BO_TIMELINE_ROW_GAP;
  });

  const timelineHeight = currentTop + BO_TIMELINE_PADDING;
  const baseTimelineHeight = Math.max(timelineHeight, 240);
  const viewportWidth = tracksEl.clientWidth || laneEl.clientWidth || 900;
  const timelineLeftPad = 12;
  const timelineRightPad = 12;
  const pxPerSecond = viewportWidth / 240;
  const timelineWidth = (Math.max(timelineTotal, 240) * pxPerSecond) + timelineLeftPad + timelineRightPad;
  const chartEl = document.getElementById("boResourceChart");
  const resourceLaneHeight = boOverlayEnabled ? BO_RESOURCE_LANE_HEIGHT : 0;
  const totalHeight = baseTimelineHeight + (boOverlayEnabled ? resourceLaneHeight : 0);

  laneEl.style.height = `${baseTimelineHeight}px`;
  laneEl.style.width = `${timelineWidth}px`;
  laneEl.dataset.leftPad = String(timelineLeftPad);
  laneEl.dataset.pxPerSec = String(pxPerSecond);
  laneEl.dataset.total = String(timelineTotal);
  labelsEl.style.height = `${totalHeight}px`;
  tracksEl.style.height = `${totalHeight}px`;
  stackEl.style.width = `${timelineWidth}px`;
  stackEl.style.height = `${totalHeight}px`;
  resourceLaneEl.style.width = `${timelineWidth}px`;
  resourceLaneEl.style.height = `${resourceLaneHeight}px`;
  resourceLaneEl.style.display = boOverlayEnabled ? "block" : "none";
  if (chartEl) {
    chartEl.style.width = `${timelineWidth}px`;
    chartEl.style.height = `${Math.max(resourceLaneHeight, 0)}px`;
  }

  const labelRows = laneDefs.map((lane) => {
    const resourceAttr = lane.type === "resource" ? ` data-resource="${lane.resource}" data-base-label="${lane.label}"` : "";
    const buildingAttr = lane.type === "building"
      ? ` data-building-id="${lane.buildingId}" data-building-type="${(lane.buildingType || lane.buildingId || "").split(" #")[0]}" data-building-ready="${Number.isFinite(lane.readyAt) ? lane.readyAt : ""}" data-building-source="${lane.sourceCommandId || ""}"`
      : "";
    const laneHeight = laneHeights.get(lane.key) || (BO_TIMELINE_BLOCK_HEIGHT + BO_LANE_CAPTION_HEIGHT);
    const top = laneTops.get(lane.key) || BO_TIMELINE_PADDING;
    const actionBadges = getBoLaneActionBadges(lane);
    const interactiveClass = actionBadges.length ? " bo-interactive-lane" : "";
    const badgeHtml = actionBadges.length
      ? `<span class="bo-lane-label-badges">${actionBadges.map((badge) => `<span class="bo-lane-badge ${badge.className}"><i class="bi ${badge.icon}" aria-hidden="true"></i>${badge.label}</span>`).join("")}</span>`
      : "";
    return `<div class="bo-lane-label-row${interactiveClass}" data-lane-key="${lane.key}"${resourceAttr}${buildingAttr} style="top:${top}px;height:${laneHeight}px;"><div class="bo-lane-label-content"><span class="bo-lane-label-name">${lane.label}</span>${badgeHtml}</div></div>`;
  }).join("");
  const resourceLabel = boOverlayEnabled
    ? `<div class="bo-lane-label-row bo-resource-label-row" data-lane-key="resources" style="top:${baseTimelineHeight}px;height:${BO_RESOURCE_LANE_HEIGHT}px;">Resources</div>`
    : "";
  labelsEl.innerHTML = labelRows + resourceLabel;

  let html = "";
  const captionHtml = [];
  laneDefs.forEach((lane, idx) => {
    const top = laneTops.get(lane.key) || BO_TIMELINE_PADDING;
    const height = laneHeights.get(lane.key) || (BO_TIMELINE_BLOCK_HEIGHT + BO_LANE_CAPTION_HEIGHT);
    const bandClass = idx % 2 === 0 ? "bo-timeline-row-band" : "bo-timeline-row-band alt";
    html += `<div class="${bandClass}" style="top:${top}px; height:${height}px; width:${timelineWidth}px;"></div>`;
    captionHtml.push(`<div class="bo-lane-caption" data-lane-key="${lane.key}" style="top:${top}px; height:${BO_LANE_CAPTION_HEIGHT}px; left:${timelineLeftPad}px;"></div>`);
  });

  html += `<div class="bo-timeline-header-band" style="height:${BO_TIMELINE_HEADER_HEIGHT}px;"></div>`;
  html += captionHtml.join("");

  const minuteGrid = [];
  for (let t = 0; t <= timelineTotal; t += 60) {
    const left = timelineLeftPad + (t * pxPerSecond);
    const zeroClass = t === 0 ? " at-zero" : "";
    minuteGrid.push(`
      <div class="bo-minute-line" style="left:${left}px; top:${BO_TIMELINE_HEADER_HEIGHT}px;"></div>
      <div class="bo-minute-label${zeroClass}" style="left:${left}px">${formatTimeMMSS(t)}</div>
    `);
  }
  html += `<div class="bo-minute-grid">${minuteGrid.join("")}</div>`;

  const escapeAttr = (val) => String(val || "").replace(/"/g, "&quot;");
  blocks.forEach((row) => {
    if (!laneIndex.has(row.laneKey)) return;
    const cmd = row.commandId ? boCommands.find((entry) => entry.id === row.commandId) || null : null;
    const left = timelineLeftPad + (row.start * pxPerSecond);
    const minWidthPx = row.minWidthPx ?? 6;
    const width = Math.max(minWidthPx, (row.displayDuration || (row.end - row.start)) * pxPerSecond);
    const laneTop = laneTops.get(row.laneKey) ?? (BO_TIMELINE_PADDING + BO_TIMELINE_HEADER_HEIGHT);
    const laneMeta = laneMetaByKey.get(row.laneKey);
    let blockHeight = laneBlockHeights.get(row.laneKey) || BO_TIMELINE_BLOCK_HEIGHT;
    let rowOffset = (row._laneRow || 0) * (blockHeight + BO_TIMELINE_ROW_GAP);
    let top = laneTop + BO_LANE_CAPTION_HEIGHT + rowOffset;
    if (laneMeta?.type === "resource") {
      const hasMarkers = (laneBlocks.get(row.laneKey) || []).some((block) => block.villagerMarker);
      if (row._resourceTrack === "marker") {
        blockHeight = BO_RESOURCE_MARKER_HEIGHT;
        rowOffset = 0;
        top = laneTop + BO_LANE_CAPTION_HEIGHT;
      } else {
        blockHeight = BO_TIMELINE_BLOCK_HEIGHT;
        rowOffset = 0;
        top = laneTop + BO_LANE_CAPTION_HEIGHT + (hasMarkers ? BO_RESOURCE_MARKER_HEIGHT + BO_RESOURCE_MARKER_GAP : 0);
      }
    }
    const readyNote = row.laneDisabled && Number.isFinite(row.end) ? `\nReady: ${formatTimeMMSS(row.end)}` : "";
    const titleLabel = row.fullLabel || row.title || row.label;
    const title = `${titleLabel}\n${formatTimeMMSS(row.start)} -> ${formatTimeMMSS(row.end)}${readyNote}${row.notes ? `\n${row.notes}` : ""}`;
    const classes = ["bo-lane-block"];
    classes.push(getBoBlockFamilyClass(cmd, row));
    if (row.commandId && row.commandId === boSelectedCommandId) classes.push("selected");
    if (row.villagerMarker && boMarkerDraft?.key === getBoMarkerDraftKey({
      time: row.markerTime ?? row.start,
      target: row.markerTarget || "idle",
      buildingId: row.markerBuildingId || "TC #1",
      sourceCommandId: row.markerSourceCommandId || ""
    })) classes.push("selected");
    if (row.assignBlock) classes.push("bo-assign-block");
    if (row.laneDisabled) classes.push("bo-lane-disabled");
    if (row.gatherSegment) classes.push("bo-gather-segment");
    if (row.villagerMarker) classes.push("bo-villager-marker");
    const buildingAttrs = "";
    const markerAttrs = row.villagerMarker
      ? ` data-marker="villager" data-marker-key="${escapeAttr(getBoMarkerDraftKey({ time: row.markerTime ?? row.start, target: row.markerTarget || "idle", buildingId: row.markerBuildingId || "TC #1", sourceCommandId: row.markerSourceCommandId || "" }))}" data-marker-time="${row.markerTime ?? row.start}" data-marker-target="${row.markerTarget || ""}" data-marker-count="${row.markerCount || 1}" data-marker-source-command="${row.markerSourceCommandId || ""}" data-marker-building-id="${row.markerBuildingId || ""}" data-marker-building-type="${row.markerBuildingType || ""}" data-marker-time-per-unit="${row.markerTimePerUnit || BO_VILLAGER_TIME}" data-marker-rally-delay="${row.markerRallyTravelDelaySec || 0}" data-marker-rally-trip="${row.markerRallyTripOverrideSec}"`
      : "";
    const shortLabel = row.shortLabel || row.label || "";
    html += `<div class="${classes.join(" ")}" data-command-id="${row.commandId || ""}" data-lane-key="${row.laneKey}" data-full-label="${escapeAttr(titleLabel)}"${buildingAttrs}${markerAttrs}
      style="left:${left}px; width:${width}px; top:${top}px; height:${blockHeight}px;" title="${escapeAttr(title)}">${shortLabel}</div>`;
  });

  laneEl.innerHTML = html;
  if (Number.isFinite(boPinnedTime)) {
    const pinLeft = timelineLeftPad + (Math.max(0, Math.min(timelineTotal, boPinnedTime)) * pxPerSecond);
    laneEl.classList.add("has-pin");
    laneEl.style.setProperty("--bo-pin-left", `${pinLeft}px`);
    resourceLaneEl.classList.add("has-pin");
    resourceLaneEl.style.setProperty("--bo-pin-left", `${pinLeft}px`);
  } else {
    laneEl.classList.remove("has-pin");
    laneEl.style.removeProperty("--bo-pin-left");
    resourceLaneEl.classList.remove("has-pin");
    resourceLaneEl.style.removeProperty("--bo-pin-left");
  }
  const shell = document.getElementById("boTimelineShell");
  if (shell && !shell.querySelector("#boTimelineTooltip")) {
    shell.insertAdjacentHTML("beforeend", `<div class="bo-timeline-tooltip" id="boTimelineTooltip"></div>`);
  }
  applyBoLaneCaptionSelection();
  renderBoGatherRates();
}

function getBoTimelineRowsForHover() {
  if (boLastResults?.timeline?.length) {
    return boLastResults.timeline.filter((row) => row.commandId);
  }
  return buildBoPreviewTimelineRows();
}

function getBoSimEndInput() {
  const simEndInput = parseFloat(document.getElementById("boSimEnd")?.value);
  return Number.isFinite(simEndInput) ? simEndInput : 300;
}

function getBoTimelineTotal(rows) {
  const simEnd = getBoSimEndInput();
  if (!rows || !rows.length) return Math.max(simEnd, 60);
  return Math.max(simEnd, ...rows.map((r) => r.end), 1);
}

function getBoTimelinePointerTime(event) {
  const laneEl = document.getElementById("boLaneTimeline");
  const currentTarget = event?.currentTarget;
  if (!laneEl || !currentTarget) return null;
  const rect = currentTarget.getBoundingClientRect();
  const total = parseFloat(laneEl.dataset.total || "0") || 0;
  const leftPad = parseFloat(laneEl.dataset.leftPad || "0") || 0;
  const pxPerSec = parseFloat(laneEl.dataset.pxPerSec || "0") || 0;
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return null;
  const xRaw = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const x = Math.max(0, xRaw - leftPad);
  return Math.min(total, Math.max(0, x / pxPerSec));
}

function getBoPinToggleThreshold() {
  const laneEl = document.getElementById("boLaneTimeline");
  const pxPerSec = parseFloat(laneEl?.dataset.pxPerSec || "0") || 0;
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return 1;
  return 6 / pxPerSec;
}

function getBoSampleAtTime(time) {
  const samples = boLastResults?.samples || [];
  if (!samples.length) return null;
  let last = samples[0];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample.time <= time + 0.0001) {
      last = sample;
    } else {
      break;
    }
  }
  return last;
}

function getBoSampleAtTimeFromSamples(time, samples) {
  if (!Array.isArray(samples) || !samples.length) return null;
  let last = samples[0];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample.time <= time + 0.0001) {
      last = sample;
    } else {
      break;
    }
  }
  return last;
}

function getBoLiveResourceSnapshot(sample, settings) {
  if (sample) {
    return {
      food: sample.food ?? 0,
      wood: sample.wood ?? 0,
      gold: sample.gold ?? 0,
      stone: sample.stone ?? 0,
      oliveOil: sample.oliveOil ?? 0,
      silver: sample.silver ?? 0
    };
  }
  return {
    food: settings?.resources?.food ?? 0,
    wood: settings?.resources?.wood ?? 0,
    gold: settings?.resources?.gold ?? 0,
    stone: settings?.resources?.stone ?? 0,
    oliveOil: settings?.resources?.oliveOil ?? 0,
    silver: settings?.resources?.silver ?? 0
  };
}

function buildBoLiveRatePill(label, value, suffix = "/s") {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `<div class="bo-live-pill"><span>${label}</span><strong>${safeValue.toFixed(3)}${suffix}</strong></div>`;
}

function buildBoLiveValuePill(label, value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `<div class="bo-live-pill"><span>${label}</span><strong>${Math.floor(safeValue)}</strong></div>`;
}

function renderBoLiveGroupTitle(badge, title) {
  return `<div class="bo-live-group-title"><span class="bo-live-group-badge">${badge}</span><span>${title}</span></div>`;
}

function getBoAnchorTime() {
  if (Number.isFinite(boPinnedTime)) return boPinnedTime;
  if (Number.isFinite(boHoverTime)) return boHoverTime;
  if (boMarkerDraft?.cmd) {
    return Number.isFinite(boMarkerDraft.cmd.atTime) ? boMarkerDraft.cmd.atTime : 0;
  }
  if (boSelectedCommandId) {
    const planned = buildBoPlannedCommands(boCommands);
    const match = planned.find((p) => p.cmd.id === boSelectedCommandId);
    if (match) return match.start;
  }
  return 0;
}

function renderBoGatherRates(timeOverride = null) {
  const bar = document.getElementById("boGatherRates");
  if (!bar) return;
  const civ = getBoSelectedCiv();
  if (!civ) {
    bar.innerHTML = "<span class='text-muted'>Select a civilization to see gather rates.</span>";
    renderBoTimelineFooter(0);
    return;
  }
  const settings = readBoSettings();
  const time = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = getBoSampleAtTimeFromSamples(time, boLastResults?.samples || []);
  const currentRateInfo = getBoCurrentRatesAtTime(boLastResults, time);
  const gatherSpeeds = currentRateInfo.gatherSpeeds || {};
  const actualIncome = currentRateInfo.actualIncome || {};
  const liveResources = getBoLiveResourceSnapshot(sample, settings);
  let farmBuilt = sample?.farmCount;
  let houseBuilt = sample?.houseCount;
  if (!Number.isFinite(farmBuilt)) {
    const info = estimateBoVillagerState(boSelectedCommandId);
    farmBuilt = info?.farmCount ?? 0;
    houseBuilt = info?.houseCount ?? 0;
  } else if (!Number.isFinite(houseBuilt)) {
    const info = estimateBoVillagerState(boSelectedCommandId);
    houseBuilt = info?.houseCount ?? 0;
  }
  const gatherLabels = [
    { key: "sheep", label: "Sheep" },
    { key: "berries", label: "Berries" },
    { key: "deer", label: "Deer" },
    { key: "boar", label: "Boar" },
    { key: "farm", label: "Farm" },
    { key: "wood", label: "Wood" },
    { key: "gold", label: "Gold" },
    { key: "stone", label: "Stone" }
  ];
  const gatherHtml = gatherLabels
    .map((item) => buildBoLiveRatePill(item.label, gatherSpeeds[item.key]))
    .join("");
  const incomePills = [
    ["Food", actualIncome.food],
    ["Wood", actualIncome.wood],
    ["Gold", actualIncome.gold],
    ["Stone", actualIncome.stone]
  ];
  if ((actualIncome.oliveOil || 0) > 0) incomePills.push(["Olive", actualIncome.oliveOil || 0]);
  if ((actualIncome.silver || 0) > 0) incomePills.push(["Silver", actualIncome.silver || 0]);
  const incomeHtml = incomePills
    .map(([label, value]) => buildBoLiveRatePill(label, value))
    .join("");
  const resourcePills = [
    ["Food", liveResources.food],
    ["Wood", liveResources.wood],
    ["Gold", liveResources.gold],
    ["Stone", liveResources.stone]
  ];
  if ((liveResources.oliveOil || 0) > 0) resourcePills.push(["Olive", liveResources.oliveOil || 0]);
  if ((liveResources.silver || 0) > 0) resourcePills.push(["Silver", liveResources.silver || 0]);
  resourcePills.push(["Farms built", Math.max(0, Math.floor(farmBuilt || 0))]);
  resourcePills.push(["Houses built", Math.max(0, Math.floor(houseBuilt || 0))]);
  const resourceHtml = resourcePills
    .map(([label, value]) => buildBoLiveValuePill(label, value))
    .join("");
  const anchorInfo = getBoSummaryAnchorInfo(time);

  bar.innerHTML = `
    <div class="bo-live-header">
      <div class="bo-live-title">Current state at ${formatTimeMMSS(time)}</div>
      <div class="bo-live-anchor-note">${anchorInfo.label}</div>
    </div>
    <div class="bo-live-help">Wheelbarrow improves actual income through carry + movement, even when per-vill gather speed stays the same.</div>
    <div class="bo-live-groups">
      <div class="bo-live-group">
        ${renderBoLiveGroupTitle("Stock", "Resources")}
        <div class="bo-live-pill-row">${resourceHtml}</div>
      </div>
      <div class="bo-live-group">
        ${renderBoLiveGroupTitle("Live", "Current actual income")}
        <div class="bo-live-pill-row">${incomeHtml}</div>
      </div>
      <div class="bo-live-group">
        ${renderBoLiveGroupTitle("Per vill", "Gather speed / vill")}
        <div class="bo-live-pill-row">${gatherHtml}</div>
      </div>
    </div>
  `;

  const labelEls = document.querySelectorAll(".bo-lane-label-row[data-resource]");
  labelEls.forEach((el) => {
    const key = el.dataset.resource;
    const base = el.dataset.baseLabel || "";
    if (!key) return;
    const val = Number.isFinite(gatherSpeeds[key]) ? gatherSpeeds[key] : 0;
    const nameEl = el.querySelector(".bo-lane-label-name");
    if (nameEl) nameEl.textContent = `${base} (${val.toFixed(3)}/s)`;
  });
  updateBoOttomanPanel(civ, time);
  renderBoTimelineFooter(time);
  if (boLastResults) renderBoSummary(boLastResults, time);
}

function interpolateBoSample(samples, t) {
  if (!samples || !samples.length) return null;
  if (t <= samples[0].time) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.time) return last;
  for (let i = 1; i < samples.length; i++) {
    const curr = samples[i];
    if (curr.time >= t) {
      const prev = samples[i - 1];
      const span = curr.time - prev.time;
      if (span <= 0) return curr;
      const ratio = (t - prev.time) / span;
      const lerp = (a, b) => a + (b - a) * ratio;
      return {
        time: t,
        food: lerp(prev.food, curr.food),
        wood: lerp(prev.wood, curr.wood),
        gold: lerp(prev.gold, curr.gold),
        stone: lerp(prev.stone, curr.stone),
        oliveOil: lerp(prev.oliveOil || 0, curr.oliveOil || 0),
        silver: lerp(prev.silver || 0, curr.silver || 0)
      };
    }
  }
  return last;
}

function updateBoTimelineTooltip(e) {
  const laneEl = document.getElementById("boLaneTimeline");
  const shell = document.getElementById("boTimelineShell");
  if (!laneEl || !shell) return;
  const tooltip = shell.querySelector("#boTimelineTooltip");
  if (!tooltip) return;
  const rows = getBoTimelineRowsForHover();
  const total = Math.max(getBoTimelineTotal(rows), 240);
  const samples = boLastResults?.samples || [];
  if (!total || !samples.length) {
    tooltip.style.display = "none";
    return;
  }
  const shellRect = shell.getBoundingClientRect();
  const t = getBoTimelinePointerTime(e);
  if (!Number.isFinite(t)) {
    tooltip.style.display = "none";
    return;
  }
  boHoverTime = t;
  const sample = getBoSampleAtTime(t);
  if (!sample) {
    tooltip.style.display = "none";
    return;
  }
  const parts = [
    `<div><strong>${formatTimeMMSS(t)}</strong></div>`,
    `<div>F ${Math.floor(sample.food)} | W ${Math.floor(sample.wood)} | G ${Math.floor(sample.gold)} | S ${Math.floor(sample.stone)}</div>`
  ];
  if ((sample.oliveOil || 0) > 0 || (sample.silver || 0) > 0) {
    const extra = [];
    if ((sample.oliveOil || 0) > 0) extra.push(`Olive ${Math.floor(sample.oliveOil)}`);
    if ((sample.silver || 0) > 0) extra.push(`Silver ${Math.floor(sample.silver)}`);
    parts.push(`<div>${extra.join(" | ")}</div>`);
  }
  tooltip.innerHTML = parts.join("");
  tooltip.style.display = "block";
  const pad = 8;
  const half = tooltip.offsetWidth / 2;
  let left = e.clientX - shellRect.left;
  const minLeft = half + pad;
  const maxLeft = Math.max(minLeft, shellRect.width - half - pad);
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;
  const y = e.clientY - shellRect.top;
  const showBelow = y < 48;
  tooltip.classList.toggle("is-below", showBelow);
  const top = showBelow ? Math.min(shellRect.height - pad, y + 12) : Math.max(pad, y - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  const hoveredBlock = e.target?.closest?.(".bo-lane-block");
  if (hoveredBlock) {
    clearBoLaneCaptions();
    const laneKey = hoveredBlock.dataset.laneKey;
    const label = hoveredBlock.dataset.fullLabel || hoveredBlock.textContent || "";
    setBoLaneCaption(laneKey, label);
  } else {
    applyBoLaneCaptionSelection();
  }
  renderBoGatherRates(Number.isFinite(boPinnedTime) ? boPinnedTime : t);
}

function getBoEstimateBaseStateAtTime(time) {
  const epsilon = 0.0005;
  const sample = time > epsilon ? getBoSampleAtTime(time - epsilon) : null;
  if (sample?.assignments) {
    const counts = {};
    BO_RESOURCE_KEYS.forEach((key) => { counts[key] = Math.max(0, sample.assignments[key] || 0); });
    const assigned = BO_RESOURCE_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0);
    const total = Number.isFinite(sample.villagers)
      ? sample.villagers
      : Math.max(0, assigned + (sample.assignments.idle || 0));
    const idle = Number.isFinite(sample.assignments.idle)
      ? Math.max(0, sample.assignments.idle)
      : Math.max(0, total - assigned);
    const busy = Math.max(0, total - assigned - idle);
    return {
      total,
      assigned,
      idle,
      busy,
      counts,
      farmCount: Math.max(0, sample.farmCount || 0),
      houseCount: Math.max(0, sample.houseCount || 0),
      fromSample: true
    };
  }

  const execution = getBoExecutionPlan();
  const buildRows = buildBoPreviewTimelineRows().filter((row) => row.buildingType);
  const startVills = Math.max(0, parseInt(document.getElementById("boStartVills")?.value, 10) || 0);
  let total = startVills;
  let farmCount = 0;
  let houseCount = 0;

  execution.forEach((p) => {
    if (p.start >= time - epsilon) return;
    const cmd = p.cmd;
    if (!cmd || cmd.type !== "trainUnit") return;
    if ((cmd.payload.unitName || "") !== "Villager") return;
    if (cmd.payload?.repeatUntilEnd) return;
    const per = Math.max(0, cmd.payload.timePerUnit || BO_VILLAGER_TIME);
    const count = Math.max(1, Math.floor(cmd.payload.count || 1));
    for (let i = 1; i <= count; i++) {
      const doneAt = p.start + (per * i);
      if (doneAt < time - epsilon || Math.abs(doneAt - (time - epsilon)) <= epsilon) total += 1;
    }
  });

  buildRows.forEach((row) => {
    if (row.end >= time - epsilon && Math.abs(row.end - (time - epsilon)) > epsilon) return;
    if (row.buildingType === "Farm") farmCount += 1;
    if (row.buildingType === "House" || row.buildingType === "Farmhouse") houseCount += 1;
  });

  const counts = {
    berries: 0,
    deer: 0,
    boar: 0,
    sheep: 0,
    farm: 0,
    wood: 0,
    gold: 0,
    stone: 0
  };
  const assigned = 0;
  const idle = total;
  const busy = 0;
  return { total, assigned, idle, busy, counts, farmCount, houseCount, fromSample: false };
}

function previewCountAvailableBuilders(source, counts, idle, farmCount) {
  const pools = ["idle", "sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"];
  if (source === "any") {
    return pools.reduce((sum, key) => {
      if (key === "idle") return sum + Math.max(0, idle);
      if (key === "farm") return sum + Math.max(0, Math.min(counts.farm || 0, farmCount));
      return sum + Math.max(0, counts[key] || 0);
    }, 0);
  }
  if (source === "idle") return Math.max(0, idle);
  if (source === "farm") return Math.max(0, Math.min(counts.farm || 0, farmCount));
  return Math.max(0, counts[source] || 0);
}

function previewPullBuilders(source, requested, counts, idle, farmCount) {
  let remaining = Math.max(0, requested || 0);
  const nextCounts = { ...counts };
  let nextIdle = Math.max(0, idle || 0);
  const takeFrom = (key) => {
    if (remaining <= 0) return;
    if (key === "idle") {
      const used = Math.min(nextIdle, remaining);
      nextIdle -= used;
      remaining -= used;
      return;
    }
    const available = key === "farm"
      ? Math.max(0, Math.min(nextCounts.farm || 0, farmCount))
      : Math.max(0, nextCounts[key] || 0);
    if (available <= 0) return;
    const used = Math.min(available, remaining);
    nextCounts[key] = Math.max(0, (nextCounts[key] || 0) - used);
    remaining -= used;
  };

  if (source === "any") {
    ["idle", "sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"].forEach(takeFrom);
  } else {
    takeFrom(source);
  }

  return {
    used: Math.max(0, requested - remaining),
    counts: nextCounts,
    idle: nextIdle
  };
}

function estimateBoVillagerState(commandId) {
  const execution = getBoExecutionPlan();
  const targetIndex = execution.findIndex((p) => p.cmd.id === commandId);
  const time = targetIndex >= 0 ? execution[targetIndex].start : 0;
  const base = getBoEstimateBaseStateAtTime(time);
  let total = base.total;
  let farmCount = base.farmCount;
  let counts = { ...base.counts };
  let idle = Math.max(0, base.idle);
  let busy = Math.max(0, base.busy || 0);

  execution.forEach((entry, idx) => {
    if (idx >= targetIndex) return;
    if (Math.abs((entry.start || 0) - time) > 0.0001) return;
    const command = entry.cmd;
    if (!command) return;
    if (command.type === "assign") {
      const desired = {
        berries: command.payload.berries || 0,
        deer: command.payload.deer || 0,
        boar: command.payload.boar || 0,
        sheep: command.payload.sheep || 0,
        farm: Math.min(command.payload.farm || 0, farmCount),
        wood: command.payload.wood || 0,
        gold: command.payload.gold || 0,
        stone: command.payload.stone || 0
      };
      const availableForAssign = Math.max(0, total - busy);
      const capped = capAssignmentCounts(desired, availableForAssign).capped;
      counts = { ...capped };
      idle = Math.max(0, availableForAssign - BO_RESOURCE_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0));
      return;
    }
    if (command.type === "buildBuilding") {
      const source = command.payload.builderSource || "idle";
      const requested = Math.max(1, command.payload.builders || 1);
      const available = previewCountAvailableBuilders(source, counts, idle, farmCount);
      if (available <= 0) return;
      const pulled = previewPullBuilders(source, Math.min(requested, available), counts, idle, farmCount);
      counts = pulled.counts;
      idle = pulled.idle;
      busy += pulled.used;
    }
  });

  const assigned = BO_RESOURCE_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0);
  idle = Math.max(0, total - assigned - busy);
  return { total, assigned, idle, busy, counts, farmCount };
}

function estimateBoVillagerStateAtTime(time) {
  return getBoEstimateBaseStateAtTime(time);
}

function insertBoAssignAtTime(time) {
  const cmd = createBoCommand("assign");
  cmd.timeMode = "atTime";
  cmd.atTime = Math.max(0, time || 0);
  cmd.afterId = null;
  const snapshot = estimateBoVillagerStateAtTime(cmd.atTime);
  let counts = { ...snapshot.counts };
  const capped = capAssignmentCounts(counts, snapshot.total);
  counts = capped.capped;
  const farmCap = Math.max(0, snapshot.farmCount || 0);
  if (counts.farm > farmCap) counts.farm = farmCap;
  cmd.payload = {
    ...counts,
    travelDelaySec: 0,
    tripOverrides: {}
  };

  const planned = buildBoPlannedCommands(boCommands);
  let insertIdx = boCommands.length;
  for (let i = planned.length - 1; i >= 0; i--) {
    if (planned[i].start <= cmd.atTime + 0.0001) {
      insertIdx = planned[i].idx + 1;
      break;
    }
  }
  boCommands.splice(insertIdx, 0, cmd);
  boSelectedCommandId = cmd.id;
  boSelectedBuilding = null;
  boLastCommandType = "assign";
  boLastResults = null;
  renderBoTimelineEditor();
  renderBoCommandEditor(getSelectedBoCommand());
  scheduleRunBuildOrder();
}

function insertBoCommandAtTime(cmd, time) {
  const planned = buildBoPlannedCommands(boCommands);
  let insertIdx = boCommands.length;
  for (let i = planned.length - 1; i >= 0; i--) {
    if (planned[i].start <= time + 0.0001) {
      insertIdx = planned[i].idx + 1;
      break;
    }
  }
  cmd.timeMode = "atTime";
  cmd.atTime = Math.max(0, time || 0);
  cmd.afterId = null;
  boCommands.splice(insertIdx, 0, cmd);
}

function showBoPinHint(message) {
  const status = document.getElementById("boPinStatus");
  if (status) {
    status.textContent = message;
    status.classList.remove("is-pinned");
  }
}

function getBoResourceTripSeed(resource, time = 0) {
  const settingsTrip = readBoSettings().trip?.[resource];
  let value = Number.isFinite(settingsTrip) ? Math.max(0, settingsTrip) : Math.max(0, BO_DEFAULT_TRIP[resource] || 0);
  const planned = sortBoExecutionEntries(buildBoPlannedCommands(boCommands));
  planned.forEach((entry) => {
    if ((entry.start || 0) > time + 0.0001) return;
    const cmd = entry.cmd;
    if (!cmd) return;
    if (cmd.type === "resourceTrip" && cmd.payload?.resource === resource && Number.isFinite(cmd.payload?.tripOverrideSec)) {
      value = Math.max(0, cmd.payload.tripOverrideSec);
      return;
    }
    if (cmd.type === "assign" && Number.isFinite(cmd.payload?.tripOverrides?.[resource])) {
      value = Math.max(0, cmd.payload.tripOverrides[resource]);
    }
  });
  return value;
}

function findBoResourceTripCommand(resource, time) {
  if (!BO_RESOURCE_KEYS.includes(resource) || !Number.isFinite(time)) return null;
  const planned = buildBoPlannedCommands(boCommands);
  const matches = planned
    .filter((entry) => (
      entry.cmd?.type === "resourceTrip" &&
      entry.cmd.payload?.resource === resource &&
      Math.abs((entry.start || 0) - time) <= 0.0001
    ))
    .map((entry) => entry.cmd);
  return matches.length ? matches[matches.length - 1] : null;
}

function selectOrCreateBoResourceTripCommand(resource) {
  if (!BO_RESOURCE_KEYS.includes(resource)) return null;
  if (!Number.isFinite(boPinnedTime)) {
    showBoPinHint(`Set a pin first to edit ${getBoResourceLabel(resource)} trip time.`);
    return null;
  }
  const targetTime = Math.max(0, boPinnedTime || 0);
  const existing = findBoResourceTripCommand(resource, targetTime);
  if (existing) {
    selectBoCommand(existing.id, { scrollToEditor: true });
    return existing;
  }
  discardBoMarkerDraft(false);
  const cmd = createBoCommand("resourceTrip");
  cmd.payload.resource = resource;
  cmd.payload.tripOverrideSec = getBoResourceTripSeed(resource, targetTime);
  insertBoCommandAtTime(cmd, targetTime);
  boSelectedBuilding = null;
  setBoTargetBuilding(null);
  boSelectedCommandId = cmd.id;
  boLastCommandType = "resourceTrip";
  boLastResults = null;
  renderBoTimelineEditor();
  renderBoCommandEditor(cmd);
  renderBoGatherRates();
  scrollBoEditorIntoView();
  scheduleRunBuildOrder();
  return cmd;
}

function createBoVillagerMarkerDraft(marker) {
  const civ = document.getElementById("boCiv")?.value || "";
  const sourceCmd = boCommands.find((cmd) => cmd.id === marker?.sourceCommandId);
  const nextCmd = createBoCommand("trainUnit");
  if (sourceCmd?.type === "trainUnit") {
    nextCmd.autoCost = sourceCmd.autoCost;
    nextCmd.autoTime = sourceCmd.autoTime;
    nextCmd.payload = {
      ...cloneBoData(sourceCmd.payload),
      unitName: "Villager",
      building: marker.buildingType || sourceCmd.payload.building || "Town Center",
      buildingId: marker.buildingId || sourceCmd.payload.buildingId || "TC #1",
      rallyTarget: marker.target || sourceCmd.payload.rallyTarget || "idle",
      rallyTravelDelaySec: Math.max(0, Number.isFinite(marker.rallyTravelDelaySec) ? marker.rallyTravelDelaySec : (sourceCmd.payload.rallyTravelDelaySec || 0)),
      rallyTripOverrideSec: Number.isFinite(marker.rallyTripOverrideSec) ? marker.rallyTripOverrideSec : (sourceCmd.payload.rallyTripOverrideSec ?? null),
      repeatUntilEnd: true,
      count: 1,
      timePerUnit: marker.timePerUnit || sourceCmd.payload.timePerUnit || BO_VILLAGER_TIME
    };
  } else {
    nextCmd.payload.building = marker.buildingType || "Town Center";
    nextCmd.payload.buildingId = marker.buildingId || "TC #1";
    nextCmd.payload.unitName = "Villager";
    nextCmd.payload.count = 1;
    nextCmd.payload.repeatUntilEnd = true;
    nextCmd.payload.rallyTarget = marker.target || "idle";
    nextCmd.payload.rallyTravelDelaySec = Math.max(0, marker.rallyTravelDelaySec || 0);
    nextCmd.payload.rallyTripOverrideSec = Number.isFinite(marker.rallyTripOverrideSec) ? marker.rallyTripOverrideSec : null;
    applyAutoDefaultsForCommand(nextCmd, civ);
  }
  nextCmd.timeMode = "atTime";
  nextCmd.atTime = Math.max(0, marker?.time || 0);
  nextCmd.afterId = null;
  return {
    key: getBoMarkerDraftKey(marker),
    marker: cloneBoData(marker),
    cmd: nextCmd,
    dirty: false
  };
}

function findBoVillagerMarkerCommand(marker) {
  if (!marker) return null;
  const buildingId = marker.buildingId || "TC #1";
  const targetTime = Math.max(0, marker.time || 0);
  const matches = boCommands.filter((cmd) => (
    cmd?.type === "trainUnit" &&
    (cmd.payload?.unitName || "") === "Villager" &&
    (cmd.payload?.buildingId || "") === buildingId &&
    cmd.timeMode === "atTime" &&
    Math.abs((cmd.atTime || 0) - targetTime) <= 0.0001
  ));
  return matches.length ? matches[matches.length - 1] : null;
}

function selectOrCreateBoVillagerMarkerCommand(marker) {
  const markerKey = getBoMarkerDraftKey(marker);
  if (boMarkerDraft?.key === markerKey) {
    discardBoMarkerDraft(true);
    return null;
  }
  const existing = findBoVillagerMarkerCommand(marker);
  if (existing) {
    selectBoCommand(existing.id, { scrollToEditor: true });
    return existing;
  }
  discardBoMarkerDraft(false);
  boMarkerDraft = createBoVillagerMarkerDraft(marker);
  if (!boMarkerDraft?.cmd) return null;
  boSelectedBuilding = null;
  setBoTargetBuilding(null);
  boSelectedCommandId = null;
  boLastCommandType = "trainUnit";
  renderBoTimelineEditor();
  renderBoCommandEditor(boMarkerDraft.cmd);
  renderBoGatherRates();
  scrollBoEditorIntoView();
  return boMarkerDraft.cmd;
}

function updateAssignSummary(editor, cmd) {
  if (!editor || cmd?.type !== "assign") return;
  const summaryEl = editor.querySelector('[data-role="assignSummary"]');
  const currentEl = editor.querySelector('[data-role="assignCurrent"]');
  const info = estimateBoVillagerState(cmd.id);
  if (summaryEl) {
    summaryEl.textContent = `Assigned ${info.assigned} / Idle ${info.idle} / Busy ${info.busy || 0} / Total ${info.total} / Farms built ${info.farmCount || 0} / Houses built ${info.houseCount || 0}`;
  }
  if (currentEl) {
    const c = info.counts;
    currentEl.textContent = `Current: B${c.berries || 0} D${c.deer || 0} Bo${c.boar || 0} Sh${c.sheep || 0} Fm${c.farm || 0} | W${c.wood || 0} G${c.gold || 0} S${c.stone || 0}`;
  }
}

function capAssignmentCounts(counts, total) {
  const capped = { ...counts };
  let assigned = BO_RESOURCE_KEYS.reduce((sum, key) => sum + (capped[key] || 0), 0);
  if (assigned <= total) return { capped, changed: false };
  let over = assigned - total;
  BO_ASSIGN_CAP_ORDER.forEach((res) => {
    if (over <= 0) return;
    const take = Math.min(over, capped[res] || 0);
    capped[res] -= take;
    over -= take;
  });
  return { capped, changed: true };
}

function renderBoBuildStepFields(cmd, buildingOptions) {
  const steps = getBoBuildSteps(cmd.payload);
  return `
    <div class="bo-build-queue" data-role="buildQueue">
      ${steps.map((step, index) => {
        const autoTime = step.autoTime !== false;
        const autoCost = step.autoCost !== false;
        return `
          <div class="bo-build-step" data-step-index="${index}">
            <div class="bo-build-step-head">
              <div class="bo-build-step-title">Step ${index + 1}</div>
              <div class="bo-build-step-actions">
                <button type="button" class="bo-step-btn" data-action="move-build-step-up" data-step-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>
                <button type="button" class="bo-step-btn" data-action="move-build-step-down" data-step-index="${index}" ${index === steps.length - 1 ? "disabled" : ""}>Down</button>
                <button type="button" class="bo-step-btn bo-step-btn-danger" data-action="remove-build-step" data-step-index="${index}" ${steps.length === 1 ? "disabled" : ""}>Remove</button>
              </div>
            </div>
            <div class="row g-2">
              <div class="col-5">
                <small class="text-muted">Building</small>
                <select class="form-select form-select-sm" data-build-field="building" data-step-index="${index}">${buildingOptions}</select>
              </div>
              <div class="col-2">
                <small class="text-muted">Count</small>
                <input type="number" class="form-control form-control-sm" data-build-field="count" data-step-index="${index}" value="${Math.max(1, step.count || 1)}" min="1" step="1">
              </div>
              <div class="col-3" data-build-manual-time="${index}" ${autoTime ? "hidden" : ""}>
                <small class="text-muted">Time (s)</small>
                <input type="number" class="form-control form-control-sm" data-build-field="time" data-step-index="${index}" value="${step.time}" min="0">
              </div>
              <div class="col bo-build-auto">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" data-build-field="autoTime" data-step-index="${index}" id="boBuildAutoTime_${cmd.id}_${index}" ${autoTime ? "checked" : ""}>
                  <label class="form-check-label" for="boBuildAutoTime_${cmd.id}_${index}">Auto time</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" data-build-field="autoCost" data-step-index="${index}" id="boBuildAutoCost_${cmd.id}_${index}" ${autoCost ? "checked" : ""}>
                  <label class="form-check-label" for="boBuildAutoCost_${cmd.id}_${index}">Auto cost</label>
                </div>
              </div>
            </div>
            <div class="row g-2 mt-1" data-build-manual-cost="${index}" ${autoCost ? "hidden" : ""}>
              <div class="col-3"><small class="text-muted">Food</small><input type="number" class="form-control form-control-sm" data-build-field="food" data-step-index="${index}" value="${step.cost?.food || 0}" min="0" ${autoCost ? "disabled" : ""}></div>
              <div class="col-3"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-build-field="wood" data-step-index="${index}" value="${step.cost?.wood || 0}" min="0" ${autoCost ? "disabled" : ""}></div>
              <div class="col-3"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-build-field="gold" data-step-index="${index}" value="${step.cost?.gold || 0}" min="0" ${autoCost ? "disabled" : ""}></div>
              <div class="col-3"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-build-field="stone" data-step-index="${index}" value="${step.cost?.stone || 0}" min="0" ${autoCost ? "disabled" : ""}></div>
            </div>
          </div>
        `;
      }).join("")}
      <button type="button" class="btn btn-outline-secondary btn-sm mt-2" data-action="add-build-step">+ Add step</button>
    </div>
  `;
}

function syncBoBuildStepUi(editor, cmd) {
  if (!editor || cmd?.type !== "buildBuilding") return;
  getBoBuildSteps(cmd.payload).forEach((step, index) => {
    const buildingEl = editor.querySelector(`[data-build-field="building"][data-step-index="${index}"]`);
    if (buildingEl) buildingEl.value = step.building || "Mill";
    const autoTime = step.autoTime !== false;
    const autoCost = step.autoCost !== false;
    const timeEl = editor.querySelector(`[data-build-field="time"][data-step-index="${index}"]`);
    if (timeEl) timeEl.disabled = autoTime;
    const timeWrap = editor.querySelector(`[data-build-manual-time="${index}"]`);
    if (timeWrap) timeWrap.hidden = autoTime;
    ["food", "wood", "gold", "stone"].forEach((key) => {
      const input = editor.querySelector(`[data-build-field="${key}"][data-step-index="${index}"]`);
      if (input) input.disabled = autoCost;
    });
    const costWrap = editor.querySelector(`[data-build-manual-cost="${index}"]`);
    if (costWrap) costWrap.hidden = autoCost;
  });
}

function readBoBuildStepsFromEditor(editor) {
  const steps = [];
  editor.querySelectorAll(".bo-build-step").forEach((row) => {
    const idx = parseInt(row.dataset.stepIndex || "0", 10) || 0;
    const getField = (field) => row.querySelector(`[data-build-field="${field}"][data-step-index="${idx}"]`);
    const getNum = (field, fallback = 0) => {
      const raw = parseFloat(getField(field)?.value);
      return Number.isFinite(raw) ? raw : fallback;
    };
    const autoTime = !!getField("autoTime")?.checked;
    const autoCost = !!getField("autoCost")?.checked;
    steps.push({
      building: getField("building")?.value || "Mill",
      count: Math.max(1, Math.floor(getNum("count", 1) || 1)),
      time: getNum("time", 0),
      autoTime,
      autoCost,
      cost: {
        food: getNum("food", 0),
        wood: getNum("wood", 0),
        gold: getNum("gold", 0),
        stone: getNum("stone", 0)
      }
    });
  });
  return steps.length ? steps : [createBoBuildStep("Mill")];
}

function renderBoEditorSection(title, body, options = {}) {
  const muted = options.muted ? `<div class="bo-editor-section-note">${options.muted}</div>` : "";
  return `
    <section class="bo-editor-section${options.compact ? " is-compact" : ""}">
      <div class="bo-editor-section-header">
        <div class="bo-editor-section-title">${title}</div>
        ${muted}
      </div>
      <div class="bo-editor-section-body">${body}</div>
    </section>
  `;
}

function renderBoEditorAdvanced(title, body, open = false) {
  return `
    <details class="bo-editor-advanced"${open ? " open" : ""}>
      <summary>${title}</summary>
      <div class="bo-editor-advanced-body">${body}</div>
    </details>
  `;
}

function escapeBoHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeBoAttr(value) {
  return escapeBoHtml(value).replace(/"/g, "&quot;");
}

function getBoAvailableTechs(civ, buildingType = null, options = {}) {
  const fallbackTechs = ["Wheelbarrow", "Horticulture", "Survival Techniques", "Sanctity", "Enlistment Incentives", "Dome of the Faith"];
  const techKeys = Object.keys(BO_TECH_DEFAULTS || {}).length ? Object.keys(BO_TECH_DEFAULTS || {}) : fallbackTechs;
  if (!buildingType) return [];
  const previewState = getBoTechPreviewState(civ, options.timeOverride);
  return techKeys.filter((name) => {
    const def = getBoTechDefaults(name) || {};
    if (Array.isArray(def.civs) && civ && !def.civs.includes(civ)) return false;
    if (buildingType && !doesBoTechMatchBuilding(name, buildingType, civ)) return false;
    if (options.ignoreAvailability) return true;
    return doesBoPreviewMeetTechRequirements({ ...def, name }, previewState);
  });
}

function formatBoCompactCost(cost = {}) {
  const parts = [];
  if ((cost.food || 0) > 0) parts.push(`${Math.round(cost.food)}F`);
  if ((cost.wood || 0) > 0) parts.push(`${Math.round(cost.wood)}W`);
  if ((cost.gold || 0) > 0) parts.push(`${Math.round(cost.gold)}G`);
  if ((cost.stone || 0) > 0) parts.push(`${Math.round(cost.stone)}S`);
  return parts.join(" ");
}

function getBoTechDisplayInfo(techType, civ, buildingType = null) {
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const howState = isBoHouseOfWisdomCiv(civ) ? getBoHouseOfWisdomPreviewState() : null;
  const def = getBoTechDefaults(techType) || {};
  const surfaceConfig = getBoBuildingSurfaceConfig(buildingType, civ);
  const techSurface = getBoTechSurface(buildingType, civ);
  let time = Number(def.time) || 0;
  let cost = def.cost
    ? {
      food: def.cost.food || 0,
      wood: def.cost.wood || 0,
      gold: def.cost.gold || 0,
      stone: def.cost.stone || 0
    }
    : { food: 0, wood: 0, gold: 0, stone: 0 };
  if (techSurface === "Town Center") {
    time = applyBoWorkRateToDuration(time, getBoPreviewTownCenterWorkRatePct(civ));
  }
  if (howState?.goldenAge?.bonuses?.researchPct) {
    time = applyBoWorkRateToDuration(time, howState.goldenAge.bonuses.researchPct);
  }
  if (civ === "Delhi Sultanate" && civBonus.techCostFree) {
    cost = { food: 0, wood: 0, gold: 0, stone: 0 };
  } else if ((civ === "French" || civ === "Jeanne d'Arc") && def.category === "eco") {
    const mult = civBonus.ecoTechCostMult || 0.65;
    cost = {
      food: Math.round((cost.food || 0) * mult),
      wood: Math.round((cost.wood || 0) * mult),
      gold: Math.round((cost.gold || 0) * mult),
      stone: Math.round((cost.stone || 0) * mult)
    };
  }
  if (howState?.effects?.preservationOfKnowledge) {
    cost = {
      food: Math.round((cost.food || 0) * 0.8),
      wood: Math.round((cost.wood || 0) * 0.8),
      gold: Math.round((cost.gold || 0) * 0.8),
      stone: Math.round((cost.stone || 0) * 0.8)
    };
  }
  if (Number.isFinite(surfaceConfig.techCostMult) && surfaceConfig.techCostMult > 0) {
    cost = {
      food: Math.round((cost.food || 0) * surfaceConfig.techCostMult),
      wood: Math.round((cost.wood || 0) * surfaceConfig.techCostMult),
      gold: Math.round((cost.gold || 0) * surfaceConfig.techCostMult),
      stone: Math.round((cost.stone || 0) * surfaceConfig.techCostMult)
    };
  }
  if (Number.isFinite(surfaceConfig.techTimePct) && surfaceConfig.techTimePct > 0) {
    time = applyBoWorkRateToDuration(time, surfaceConfig.techTimePct);
  }
  if (civ === "Tughlaq Dynasty" && def.category !== "emplacement") {
    time = 5;
    cost = {
      food: Math.round((cost.food || 0) * 1.2),
      wood: Math.round((cost.wood || 0) * 1.2),
      gold: Math.round((cost.gold || 0) * 1.2),
      stone: Math.round((cost.stone || 0) * 1.2)
    };
  }
  return { time, cost };
}

function renderBoTechButtonGrid(fieldName, selectedTech, techChoices, civ, buildingType = null) {
  const choices = Array.isArray(techChoices) && techChoices.length ? techChoices : ["Wheelbarrow"];
  const selected = choices.includes(selectedTech) ? selectedTech : choices[0];
  return `
    <div class="bo-tech-grid" data-tech-grid="${fieldName}">
      <input type="hidden" data-field="${fieldName}" value="${escapeBoAttr(selected)}">
      ${choices.map((techName) => {
        const info = getBoTechDisplayInfo(techName, civ, buildingType);
        const metaParts = [];
        if (info.time > 0) metaParts.push(`${Math.round(info.time)}s`);
        const costText = formatBoCompactCost(info.cost);
        metaParts.push(costText || "Free");
        if (isBoTechNoteOnly(techName)) metaParts.push("Tracked only");
        return `
          <button type="button" class="bo-tech-btn${selected === techName ? " selected" : ""}" data-tech-field="${fieldName}" data-tech-value="${escapeBoAttr(techName)}">
            <span class="bo-tech-btn-label">${escapeBoHtml(techName)}</span>
            <span class="bo-tech-btn-meta">${escapeBoHtml(metaParts.join(" • "))}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function applyBoTechButtonSelection(root, fieldName, value) {
  if (!root || !fieldName) return;
  const hidden = root.querySelector(`[data-field="${fieldName}"]`);
  if (hidden) hidden.value = value;
  root.querySelectorAll(`.bo-tech-btn[data-tech-field="${fieldName}"]`).forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.techValue === value);
  });
}

function renderBoCommandEditor(cmd) {
  normalizeBoCommands();
  if (cmd?.id && !isBoMarkerDraftCommand(cmd)) cmd = boCommands.find((entry) => entry.id === cmd.id) || cmd;
  const current = document.getElementById("boCommandEditor");
  if (!current) return;
  const editor = current.cloneNode(false);
  editor.id = current.id;
  current.replaceWith(editor);
  if (boSelectedBuilding) {
    renderBoBuildingPanel(editor, boSelectedBuilding);
    return;
  }
  if (!cmd && boMarkerDraft?.cmd) {
    cmd = boMarkerDraft.cmd;
  }
  if (!cmd) {
    editor.innerHTML = "<span class='text-muted'>Select a command in the timeline to edit.</span>";
    return;
  }
  const isMarkerDraft = isBoMarkerDraftCommand(cmd);
  const civ = document.getElementById("boCiv")?.value || "";
  const isHowCiv = isBoHouseOfWisdomCiv(civ);
  if (!civ) {
    editor.innerHTML = "<span class='text-muted'>Select a civilization to begin.</span>";
    return;
  }
  if (cmd.type === "autoVill") {
    editor.innerHTML = "<div class='bo-warning'>Legacy Auto-TC commands are disabled. Remove this command and use Train Unit instead.</div>";
    return;
  }
  if (cmd.type === "ageUp" || cmd.type === "bonus") {
    editor.innerHTML = `
      <div class="bo-warning">This command type is no longer supported. Use Landmark builds (Age II/III/IV) or building actions instead.</div>
      <button class="bo-remove-btn mt-2" data-action="remove" type="button">Remove</button>
    `;
    editor.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset.action;
      if (action === "remove") {
        boCommands = boCommands.filter((c) => c.id !== cmd.id);
        boSelectedCommandId = boCommands[0]?.id || null;
        boLastResults = null;
        renderBoTimelineEditor();
        renderBoCommandEditor(getSelectedBoCommand());
        scheduleRunBuildOrder();
      }
    });
    return;
  }
  if (cmd.type === "trainUnit" && !cmd.payload?.buildingId) {
    editor.innerHTML = `
      <div class="bo-warning">Train Unit commands should be created from a building. Select a building and use Queue Unit.</div>
      <button class="bo-remove-btn mt-2" data-action="remove" type="button">Remove</button>
    `;
    editor.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset.action;
      if (action === "remove") {
        boCommands = boCommands.filter((c) => c.id !== cmd.id);
        boSelectedCommandId = boCommands[0]?.id || null;
        boLastResults = null;
        renderBoTimelineEditor();
        renderBoCommandEditor(getSelectedBoCommand());
        scheduleRunBuildOrder();
      }
    });
    return;
  }
  if (cmd.type === "autoQueue") {
    editor.innerHTML = `
      <div class="bo-warning">Legacy repeat queue could not be migrated automatically. Remove it and recreate it from the building queue panel.</div>
      <button class="bo-remove-btn mt-2" data-action="remove" type="button">Remove</button>
    `;
    editor.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset.action;
      if (action === "remove") {
        boCommands = boCommands.filter((c) => c.id !== cmd.id);
        boSelectedCommandId = boCommands[0]?.id || null;
        boLastResults = null;
        renderBoTimelineEditor();
        renderBoCommandEditor(getSelectedBoCommand());
        scheduleRunBuildOrder();
      }
    });
    return;
  }
  if (cmd.type === "rally") {
    editor.innerHTML = `
      <div class="bo-warning">Rally commands are no longer supported. Use per-queue targets on Town Center queues.</div>
      <button class="bo-remove-btn mt-2" data-action="remove" type="button">Remove</button>
    `;
    editor.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset.action;
      if (action === "remove") {
        boCommands = boCommands.filter((c) => c.id !== cmd.id);
        boSelectedCommandId = boCommands[0]?.id || null;
        boLastResults = null;
        renderBoTimelineEditor();
        renderBoCommandEditor(getSelectedBoCommand());
        scheduleRunBuildOrder();
      }
    });
    return;
  }

  const isDelhi = civ === "Delhi Sultanate";
  const noBoarCiv = isBoNoBoarCiv(civ);
  const delhiOnlyTechs = new Set(["Sanctity", "Dome of the Faith"]);
  const isDelhiOnly = (!isDelhi) && (cmd.type === "garrisonScholars" || (cmd.type === "tech" && delhiOnlyTechs.has(cmd.payload?.techType)));
  if (isDelhiOnly) {
    editor.innerHTML = `
      <div class="bo-warning">This command is Delhi-only for the selected civilization.</div>
      <button class="bo-remove-btn mt-2" data-action="remove" type="button">Remove</button>
    `;
    editor.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset.action;
      if (action === "remove") {
        boCommands = boCommands.filter((c) => c.id !== cmd.id);
        boSelectedCommandId = boCommands[0]?.id || null;
        boLastResults = null;
        renderBoTimelineEditor();
        renderBoCommandEditor(getSelectedBoCommand());
        scheduleRunBuildOrder();
      }
    });
    return;
  }
  const farmsDisabled = (BO_CIV_BONUSES?.[civ]?.farmsDisabled || civ === "Mongols");
  const ottomanSettings = getBoOttomanSettingsFromInputs();
  const trainBuildingTarget = (cmd.type === "trainUnit")
    ? (cmd.payload?.building || inferBoBuildingTypeFromId(cmd.payload?.buildingId) || "Barracks")
    : "Barracks";
  const isTcTarget = cmd.type === "trainUnit" && isBoTownCenterSurface(trainBuildingTarget, civ);
  const isMilitarySchoolTarget = cmd.type === "trainUnit" && trainBuildingTarget === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING;
  const unitPool = cmd.type === "trainUnit"
    ? Array.from(new Set([
      ...getBoUnitOptionsForBuilding(trainBuildingTarget, civ, ottomanSettings),
      ...(cmd.payload?.unitName ? [cmd.payload.unitName] : [])
    ]))
    : getBoUnitOptions(civ);
  const unitOptions = unitPool.map((name) => `<option value="${name}">${name}</option>`).join("");
  const buildingKeys = getBoBuildableBuildingsForCiv(civ);
  const buildingOptions = buildingKeys
    .filter((name) => !(farmsDisabled && name === "Farm"))
    .map((name) => `<option value="${name}">${name}</option>`).join("");
  const trainBuildingChoices = [
    "Barracks",
    "Archery Range",
    "Stable",
    "Siege Workshop",
    ...((civ === "Ottomans" || isMilitarySchoolTarget) ? [BO_OTTOMAN_MILITARY_SCHOOL_BUILDING] : []),
    "Town Center"
  ];
  const rallyOptions = `
    <option value="sheep">Sheep</option>
    <option value="berries">Berries</option>
    <option value="deer">Deer</option>
    <option value="boar" ${noBoarCiv ? "disabled" : ""}>Boar</option>
    <option value="farm">Farm</option>
    <option value="wood">Wood</option>
    <option value="gold">Gold</option>
    <option value="stone">Stone</option>
    <option value="idle">Idle</option>
  `;
  const tripOverrides = cmd.payload.tripOverrides || {};
  const legacyAssignTripSummary = formatBoLegacyTripOverrides(tripOverrides);
  const showRallyFields = isTcTarget && (cmd.payload?.unitName === "Villager");
  const hasLegacyRallyTripOverride = Number.isFinite(cmd.payload?.rallyTripOverrideSec);

  const costInputs = (cost) => `
    <div class="row g-2 mt-2">
      <div class="col-3"><small class="text-muted">Food</small><input type="number" class="form-control form-control-sm" data-field="costFood" value="${cost.food}" min="0"></div>
      <div class="col-3"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-field="costWood" value="${cost.wood}" min="0"></div>
      <div class="col-3"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-field="costGold" value="${cost.gold}" min="0"></div>
      <div class="col-3"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-field="costStone" value="${cost.stone}" min="0"></div>
    </div>`;

  let typeFields = "";
  if (cmd.type === "assign") {
    const basics = `
      <div class="bo-assign-summary" data-role="assignSummary"></div>
      <div class="bo-assign-current text-muted" data-role="assignCurrent"></div>
      <div class="row g-2">
        <div class="col-md-3 col-6"><small class="text-muted">Berries</small><input type="number" class="form-control form-control-sm" data-field="assignBerries" value="${cmd.payload.berries}" min="0" step="1"></div>
        <div class="col-md-3 col-6"><small class="text-muted">Deer</small><input type="number" class="form-control form-control-sm" data-field="assignDeer" value="${cmd.payload.deer}" min="0" step="1"></div>
        <div class="col-md-3 col-6"><small class="text-muted">Boar</small><input type="number" class="form-control form-control-sm" data-field="assignBoar" value="${cmd.payload.boar}" min="0" step="1" ${noBoarCiv ? "disabled" : ""}></div>
        <div class="col-md-3 col-6"><small class="text-muted">Sheep</small><input type="number" class="form-control form-control-sm" data-field="assignSheep" value="${cmd.payload.sheep}" min="0" step="1"></div>
        <div class="col-md-3 col-6"><small class="text-muted">Farms</small><input type="number" class="form-control form-control-sm" data-field="assignFarm" value="${cmd.payload.farm}" min="0" step="1" ${farmsDisabled ? "disabled" : ""}></div>
        <div class="col-md-3 col-6"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-field="assignWood" value="${cmd.payload.wood}" min="0" step="1"></div>
        <div class="col-md-3 col-6"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-field="assignGold" value="${cmd.payload.gold}" min="0" step="1"></div>
        <div class="col-md-3 col-6"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-field="assignStone" value="${cmd.payload.stone}" min="0" step="1"></div>
      </div>
    `;
    const advanced = `
      <div class="row g-2">
        <div class="col-md-4 col-sm-6">
          <small class="text-muted">Travel Delay (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="assignTravelDelay" value="${cmd.payload.travelDelaySec || 0}" min="0" step="0.1" title="One-time travel before this assignment starts.">
        </div>
      </div>
      ${legacyAssignTripSummary ? `<div class="bo-target-note text-muted">Legacy trip overrides: ${legacyAssignTripSummary}. New trip changes should be created from the resource lane.</div>` : ""}
    `;
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", basics, { muted: "Sets total assigned villagers. Remaining villagers stay idle." })}
        ${renderBoEditorAdvanced("Advanced Economy Overrides", advanced)}
      </div>
    `;
  } else if (cmd.type === "buildBuilding") {
    const basics = `
      <div class="row g-2">
        <div class="col-md-3 col-sm-4">
          <small class="text-muted">Builders</small>
          <input type="number" class="form-control form-control-sm" data-field="buildBuilders" value="${cmd.payload.builders}" min="1" title="How many villagers build this structure.">
        </div>
        <div class="col-md-9 col-sm-8 d-flex align-items-end">
          <div class="bo-target-note text-muted">Queued builds run one by one with the same builders.</div>
        </div>
      </div>
    `;
    const routing = `
      <div class="row g-2">
        <div class="col-12">
          <small class="text-muted">Pull builders from</small>
          <input type="hidden" data-field="buildBuilderSource" value="${cmd.payload.builderSource || "idle"}">
          <div class="bo-builder-btns" role="group">
            <button type="button" class="bo-builder-btn" data-source="idle">Idle</button>
            <button type="button" class="bo-builder-btn" data-source="sheep">Sheep</button>
            <button type="button" class="bo-builder-btn" data-source="berries">Berries</button>
            <button type="button" class="bo-builder-btn" data-source="deer">Deer</button>
            <button type="button" class="bo-builder-btn" data-source="wood">Wood</button>
            <button type="button" class="bo-builder-btn" data-source="gold">Gold</button>
            <button type="button" class="bo-builder-btn" data-source="stone">Stone</button>
          </div>
        </div>
        <div class="col-12 mt-2">
          <small class="text-muted">Return to</small>
          <input type="hidden" data-field="buildReturnTarget" value="${cmd.payload.returnTarget || ""}">
          <div class="bo-builder-btns bo-return-btns" role="group">
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="">Same</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="idle">Idle</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="sheep">Sheep</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="berries">Berries</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="deer">Deer</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="boar" ${noBoarCiv ? "disabled" : ""}>Boar</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="farm" ${farmsDisabled ? "disabled" : ""}>Farm</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="wood">Wood</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="gold">Gold</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="stone">Stone</button>
          </div>
        </div>
      </div>
    `;
    const advanced = `
      <div class="row g-2">
        <div class="col-md-4 col-sm-6">
          <small class="text-muted">Travel (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="buildTravelDelay" value="${cmd.payload.travelDelaySec || 0}" min="0" step="0.1" title="One-time travel before building starts.">
        </div>
      </div>
    `;
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", basics)}
        ${renderBoEditorSection("Routing / Return", routing)}
        ${renderBoEditorSection("Build Queue", renderBoBuildStepFields(cmd, buildingOptions))}
        ${renderBoEditorAdvanced("Advanced Economy Overrides", advanced)}
      </div>
    `;
  } else if (cmd.type === "tech") {
    const selectedTechType = cmd.payload.techType || "Wheelbarrow";
    const anchoredTechBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId) || null;
    const techBuildingSites = getBoTechResearchSites(selectedTechType);
    const techBuildingType = anchoredTechBuilding && techBuildingSites.includes(anchoredTechBuilding)
      ? anchoredTechBuilding
      : null;
    const techChoices = Array.from(new Set([
      ...getBoAvailableTechs(civ, techBuildingType, { ignoreAvailability: true }),
      selectedTechType
    ])).filter(Boolean);
    const techNoteText = getBoTechNoteText(selectedTechType);
    const techTargetLabel = cmd.payload.buildingId || techBuildingType || "Missing exact research site";
    const basics = `
      <div class="row g-2">
        <div class="col-12">
          <small class="text-muted">Tech</small>
          ${renderBoTechButtonGrid("techType", cmd.payload.techType || "Wheelbarrow", techChoices, civ, techBuildingType)}
        </div>
        <div class="col-md-5 col-sm-6">
          <small class="text-muted">Research Site</small>
          <input type="text" class="form-control form-control-sm" value="${escapeBoAttr(techTargetLabel)}" disabled>
        </div>
        <div class="col-md-3 col-sm-4">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="techTime" value="${cmd.payload.time}" min="0">
        </div>
        <div class="col-md-4 col-sm-6 d-flex align-items-end justify-content-end">
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoTime" title="Use default time for this item." ${cmd.autoTime ? "checked" : ""}>
            <label class="form-check-label" title="Use default time for this item.">Auto time</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoCost" title="Use default cost for this item." ${cmd.autoCost ? "checked" : ""}>
            <label class="form-check-label" title="Use default cost for this item.">Auto cost</label>
          </div>
        </div>
      </div>
      <div class="bo-target-note text-muted">Anchored to the selected building or civ lane.${!techBuildingType ? " This command is blocked until the exact research site is modeled." : ""}</div>
      ${techNoteText ? `<div class="bo-target-note text-muted">${escapeBoHtml(techNoteText)}</div>` : ""}
    `;
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", basics)}
        ${renderBoEditorSection("Timing", costInputs(cmd.payload.cost))}
      </div>
    `;
  } else if (cmd.type === "ageUp") {
    typeFields = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Target Age</small>
          <select class="form-select form-select-sm" data-field="targetAge">
            <option value="2">Age II</option>
            <option value="3">Age III</option>
            <option value="4">Age IV</option>
          </select>
        </div>
        <div class="col-3">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="ageTime" value="${cmd.payload.time}" min="0">
        </div>
        <div class="col-3 d-flex align-items-end justify-content-end">
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoTime" title="Use default time for this item." ${cmd.autoTime ? "checked" : ""}>
            <label class="form-check-label" title="Use default time for this item.">Auto time</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoCost" title="Use default cost for this item." ${cmd.autoCost ? "checked" : ""}>
            <label class="form-check-label" title="Use default cost for this item.">Auto cost</label>
          </div>
        </div>
      </div>
      ${costInputs(cmd.payload.cost)}
    `;
  } else if (cmd.type === "houseOfWisdomWing") {
    const previewState = getBoHouseOfWisdomPreviewState(cmd.atTime || 0);
    const spec = getBoHouseOfWisdomCommandSpec(cmd, civ, {
      effects: previewState.effects,
      researchPct: previewState.goldenAge?.bonuses?.researchPct || 0
    });
    const currentWing = cmd.payload?.wing || "culture";
    const wingEntries = civ === "Ayyubids"
      ? Object.entries(BO_AYYUBID_HOW_BRANCHES)
      : Object.entries(BO_ABBASID_HOW_WINGS);
    const wingOptions = wingEntries
      .map(([wingKey, wingDef]) => `<option value="${wingKey}">${wingDef.label}</option>`)
      .join("");
    const branchOptions = civ === "Ayyubids"
      ? Object.entries(BO_AYYUBID_HOW_BRANCHES[currentWing]?.branches || {})
        .map(([branchKey, branchDef]) => `<option value="${branchKey}">${branchDef.label}</option>`)
        .join("")
      : "";
    const selectedLabel = getBoHouseOfWisdomWingLabel(civ, cmd.payload?.wing, cmd.payload?.branch);
    const description = getBoHouseOfWisdomWingDescription(civ, cmd.payload?.wing, cmd.payload?.branch, spec.targetAge);
    const goldenAgeText = formatBoGoldenAgeBonuses(previewState.goldenAge?.bonuses || {});
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("House of Wisdom", `
          <div class="row g-2">
            <div class="col-md-5">
              <small class="text-muted">Wing</small>
              <select class="form-select form-select-sm" data-field="howWing">${wingOptions}</select>
            </div>
            ${civ === "Ayyubids" ? `
              <div class="col-md-4">
                <small class="text-muted">Branch</small>
                <select class="form-select form-select-sm" data-field="howBranch">${branchOptions}</select>
              </div>
            ` : ""}
            <div class="col-md-${civ === "Ayyubids" ? "3" : "7"}">
              <small class="text-muted">Target Age</small>
              <input type="text" class="form-control form-control-sm" value="Age ${spec.targetAge}" disabled>
            </div>
          </div>
          <div class="bo-target-note text-muted mt-2">Selected: ${selectedLabel}. ${description || "Choose one unused House of Wisdom wing."}</div>
          <div class="bo-target-note text-muted">Golden Age count ${previewState.goldenAge?.count || 0} • Tier ${previewState.goldenAge?.tier || 0}${goldenAgeText ? ` • ${goldenAgeText}` : ""}</div>
        `)}
        ${renderBoEditorSection("Timing", `
          <div class="row g-2">
            <div class="col-md-3">
              <small class="text-muted">Time (s)</small>
              <input type="number" class="form-control form-control-sm" data-field="howTime" value="${cmd.payload.time}" min="0">
            </div>
            <div class="col-md-9 d-flex align-items-end justify-content-end">
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" data-field="autoTime" ${cmd.autoTime ? "checked" : ""}>
                <label class="form-check-label">Auto time</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" data-field="autoCost" ${cmd.autoCost ? "checked" : ""}>
                <label class="form-check-label">Auto cost</label>
              </div>
            </div>
          </div>
          ${costInputs(cmd.payload.cost)}
        `, { muted: "House of Wisdom wings replace landmark age-ups for Abbasid Dynasty and Ayyubids." })}
      </div>
    `;
  } else if (cmd.type === "rally") {
    typeFields = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Rally Target</small>
          <select class="form-select form-select-sm" data-field="rallyTarget">
            <option value="sheep">Sheep</option>
            <option value="berries">Berries</option>
            <option value="deer">Deer</option>
            <option value="boar" ${noBoarCiv ? "disabled" : ""}>Boar</option>
            <option value="farm">Farm</option>
            <option value="wood">Wood</option>
            <option value="gold">Gold</option>
            <option value="stone">Stone</option>
            <option value="idle">Idle</option>
          </select>
        </div>
      </div>
    `;
  } else if (cmd.type === "trainUnit") {
    const militarySchoolNote = isMilitarySchoolTarget
      ? `<div class="bo-target-note text-muted">Military Schools continuously produce one selected unit for free. Output speed uses the Ottoman school multiplier and bonuses.</div>`
      : "";
    const targetInfo = `<div class="bo-target-note text-muted">Anchored to: ${escapeBoHtml(cmd.payload.buildingId || trainBuildingTarget)}</div>`;
    const rallyFields = showRallyFields ? `
      <div class="row g-2 mt-2">
        <div class="col-4">
          <small class="text-muted">Rally Target</small>
          <select class="form-select form-select-sm" data-field="rallyTarget">${rallyOptions}</select>
        </div>
        <div class="col-8">
          <small class="text-muted">Travel delay (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="rallyTravelDelay" value="${cmd.payload.rallyTravelDelaySec || 0}" min="0" step="0.1">
        </div>
      </div>
      ${hasLegacyRallyTripOverride ? `<div class="bo-target-note text-muted">Legacy trip override: ${formatBoTripOverrideValue(cmd.payload.rallyTripOverrideSec)}. New trip changes should be created from the ${getBoResourceLabel(cmd.payload.rallyTarget || "resource").toLowerCase()} lane.</div>` : ""}
    ` : "";
    const basics = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Unit</small>
          <select class="form-select form-select-sm" data-field="trainUnit">${unitOptions}</select>
        </div>
        <div class="col-3" data-role="trainCountWrap" ${isMilitarySchoolTarget ? "hidden" : ""}>
          <small class="text-muted">Count</small>
          <input type="number" class="form-control form-control-sm" data-field="trainCount" value="${cmd.payload.count}" min="1">
        </div>
        <div class="col-3">
          <small class="text-muted">Building</small>
          <input type="text" class="form-control form-control-sm" value="${escapeBoAttr(trainBuildingTarget)}" disabled>
        </div>
      </div>
      ${targetInfo}
      <div class="form-check mt-2" ${isMilitarySchoolTarget ? "hidden" : ""}>
        <input class="form-check-input" type="checkbox" data-field="trainRepeatUntilEnd" id="trainRepeatUntilEnd_${cmd.id}" ${cmd.payload.repeatUntilEnd ? "checked" : ""}>
        <label class="form-check-label" for="trainRepeatUntilEnd_${cmd.id}">Repeat until sim end</label>
      </div>
      <div class="bo-target-note text-muted" data-role="trainRepeatNote" ${(cmd.payload.repeatUntilEnd && !isMilitarySchoolTarget) ? "" : "hidden"}>Keeps training whenever this building is idle and resources allow.</div>
      ${militarySchoolNote}
    `;
    const timing = `
      <div class="row g-2">
        <div class="col-3">
          <small class="text-muted">Time / unit (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="trainTime" value="${cmd.payload.timePerUnit}" min="0">
        </div>
        <div class="col-9 d-flex align-items-end justify-content-end">
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoTime" title="Use default time for this item." ${cmd.autoTime ? "checked" : ""}>
            <label class="form-check-label" title="Use default time for this item.">Auto time</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoCost" title="Use default cost for this item." ${cmd.autoCost ? "checked" : ""}>
            <label class="form-check-label" title="Use default cost for this item.">Auto cost</label>
          </div>
        </div>
      </div>
      ${costInputs(cmd.payload.cost)}
    `;
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", basics)}
        ${renderBoEditorSection("Timing", timing)}
        ${showRallyFields ? renderBoEditorAdvanced("Routing / Return", rallyFields, true) : ""}
      </div>
    `;
  } else if (cmd.type === "sacredSite") {
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", `
          <div class="row g-2">
            <div class="col-md-4 col-sm-6">
              <small class="text-muted">Sacred Sites</small>
              <input type="number" class="form-control form-control-sm" data-field="sacredCount" value="${cmd.payload.count}" min="0">
            </div>
          </div>
          <div class="bo-target-note text-muted">Requires Age III (Age II with Sanctity for Delhi).</div>
        `)}
      </div>
    `;
  } else if (cmd.type === "garrisonScholars") {
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", `
          <div class="row g-2">
        <div class="col-3">
          <small class="text-muted">Scholars</small>
          <input type="number" class="form-control form-control-sm" data-field="scholarCount" value="${cmd.payload.count}" min="0">
        </div>
        <div class="col-3">
          <small class="text-muted">Time / scholar (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="scholarTime" value="${cmd.payload.timePerScholar}" min="0">
        </div>
        <div class="col-3">
          <small class="text-muted">Gold / scholar</small>
          <input type="number" class="form-control form-control-sm" data-field="scholarGold" value="${cmd.payload.costGold}" min="0">
        </div>
        <div class="col-3 d-flex align-items-end justify-content-end">
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoTime" title="Use default time for this item." ${cmd.autoTime ? "checked" : ""}>
            <label class="form-check-label" title="Use default time for this item.">Auto time</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" data-field="autoCost" title="Use default cost for this item." ${cmd.autoCost ? "checked" : ""}>
            <label class="form-check-label" title="Use default cost for this item.">Auto cost</label>
          </div>
        </div>
      </div>
        `)}
      </div>
    `;
  } else if (cmd.type === "resourceTrip") {
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Basics", `
          <div class="row g-2">
            <div class="col-md-6">
              <small class="text-muted">Resource</small>
              <select class="form-select form-select-sm" data-field="resourceTripResource">
                ${BO_RESOURCE_KEYS.map((resource) => `<option value="${resource}">${getBoResourceLabel(resource)}</option>`).join("")}
              </select>
            </div>
            <div class="col-md-6">
              <small class="text-muted">Trip time (one-way)</small>
              <input type="number" class="form-control form-control-sm" data-field="resourceTripValue" value="${cmd.payload.tripOverrideSec ?? ""}" min="0" step="0.1">
            </div>
          </div>
        `, { muted: "Applies to this resource from the command time onward. Use the resource lane label to create new trip settings at the current pin." })}
      </div>
    `;
  } else if (cmd.type === "vizierChoice") {
    const previewState = getBoOttomanPreviewState(cmd.atTime || 0);
    const options = Object.values(BO_OTTOMAN_VIZIER_CHOICES).map((choice) => `
      <option value="${choice.id}" ${choice.modeled === false ? "disabled" : ""}>Level ${choice.level}: ${choice.label}${choice.modeled === false ? " (unmodeled)" : ""}</option>
    `).join("");
    typeFields = `
      <div class="bo-editor-stack">
        ${renderBoEditorSection("Imperial Council", `
          <div class="row g-2">
            <div class="col-md-6">
              <small class="text-muted">Choice</small>
              <select class="form-select form-select-sm" data-field="vizierChoiceId">
                ${options}
              </select>
            </div>
            <div class="col-md-6">
              <small class="text-muted">Current status</small>
              <div class="bo-vizier-note">XP ${Math.floor(previewState.xp || 0)} | Points ${previewState.pointsSpent}/${previewState.pointsEarned} spent</div>
            </div>
          </div>
        `, { muted: "Vizier choices are authored from the Imperial Council lane. Trade Bags remains visible for reference but is not modeled." })}
      </div>
    `;
  }

  const typeOptions = [
    { value: "assign", label: "Assign Villagers" },
    { value: "buildBuilding", label: "Build Building" },
    { value: "tech", label: "Research Tech", includeIf: cmd.type === "tech" },
    { value: "houseOfWisdomWing", label: "House of Wisdom", includeIf: cmd.type === "houseOfWisdomWing" },
    { value: "resourceTrip", label: "Resource Trip", includeIf: cmd.type === "resourceTrip" },
    { value: "vizierChoice", label: "Imperial Council", includeIf: cmd.type === "vizierChoice" },
    { value: "trainUnit", label: "Queue Unit", includeIf: cmd.type === "trainUnit" },
    { value: "sacredSite", label: "Sacred Sites" },
    { value: "garrisonScholars", label: "Garrison Scholars", delhiOnly: true }
  ]
    .filter((opt) => (Object.prototype.hasOwnProperty.call(opt, "includeIf") ? opt.includeIf : true))
    .filter((opt) => isDelhi || !opt.delhiOnly)
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");

  editor.innerHTML = `
    <div class="bo-card-header">
      <div class="bo-card-title">Command</div>
      <button class="bo-remove-btn" data-action="remove" type="button">${isMarkerDraft ? "Discard draft" : "Remove"}</button>
    </div>
    ${isMarkerDraft ? `<div class="bo-target-note text-muted">Draft reroute from ${formatTimeMMSS(cmd.atTime || 0)}. No command is inserted until you change something.</div>` : ""}
    <div class="bo-editor-stack">
      ${renderBoEditorSection("Command", `
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label fw-bold">Type</label>
            <select class="form-select form-select-sm" data-field="type">
              ${typeOptions}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-bold">Timing</label>
            <select class="form-select form-select-sm" data-field="timeMode">
              ${renderBoTimingModeOptions(cmd.timeMode)}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-bold">Time (s)</label>
            <input type="number" class="form-control form-control-sm" data-field="atTime" value="${Number.isFinite(cmd.atTime) ? cmd.atTime : 0}" min="0" step="1">
          </div>
        </div>
      `)}
      <div data-role="typeFields">${typeFields}</div>
    </div>
  `;

  const typeEl = editor.querySelector('[data-field="type"]');
  if (typeEl) typeEl.value = cmd.type;
  const timeModeEl = editor.querySelector('[data-field="timeMode"]');
  if (timeModeEl) timeModeEl.value = cmd.timeMode === "atPin" ? "atPin" : cmd.timeMode;
  updateBoTimeMode(editor, cmd.timeMode);

  if (cmd.type === "buildBuilding") {
    const source = editor.querySelector('[data-field="buildBuilderSource"]');
    const sourceVal = cmd.payload.builderSource || "idle";
    if (source) source.value = sourceVal;
    editor.querySelectorAll(".bo-builder-btn[data-source]").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.source === sourceVal);
    });
    const returnInput = editor.querySelector('[data-field="buildReturnTarget"]');
    const returnVal = cmd.payload.returnTarget || "";
    if (returnInput) returnInput.value = returnVal;
    editor.querySelectorAll(".bo-return-btn").forEach((btn) => {
      btn.classList.toggle("selected", (btn.dataset.return || "") === returnVal);
    });
    syncBoBuildStepUi(editor, cmd);
  }
  if (cmd.type === "tech") {
    applyBoTechButtonSelection(editor, "techType", cmd.payload.techType || "Wheelbarrow");
  }
  if (cmd.type === "resourceTrip") {
    const resourceSel = editor.querySelector('[data-field="resourceTripResource"]');
    if (resourceSel) resourceSel.value = BO_RESOURCE_KEYS.includes(cmd.payload?.resource) ? cmd.payload.resource : "sheep";
  }
  if (cmd.type === "houseOfWisdomWing") {
    const wingSel = editor.querySelector('[data-field="howWing"]');
    if (wingSel) wingSel.value = cmd.payload?.wing || "culture";
    const branchSel = editor.querySelector('[data-field="howBranch"]');
    if (branchSel) {
      const fallbackBranch = Object.keys(BO_AYYUBID_HOW_BRANCHES[cmd.payload?.wing || "culture"]?.branches || {})[0] || "";
      branchSel.value = cmd.payload?.branch || fallbackBranch;
    }
  }
  if (cmd.type === "vizierChoice") {
    const choiceSel = editor.querySelector('[data-field="vizierChoiceId"]');
    if (choiceSel) choiceSel.value = getBoOttomanChoiceDef(cmd.payload?.choiceId) ? cmd.payload.choiceId : "fieldWork";
  }
  if (cmd.type === "rally") {
    const rally = editor.querySelector('[data-field="rallyTarget"]');
    if (rally) rally.value = cmd.payload.target || "idle";
  }
  if (cmd.type === "trainUnit") {
    const unitSel = editor.querySelector('[data-field="trainUnit"]');
    if (unitSel) unitSel.value = cmd.payload.unitName || "";
    const rallySel = editor.querySelector('[data-field="rallyTarget"]');
    if (rallySel) rallySel.value = cmd.payload.rallyTarget || "idle";
    const repeatToggle = editor.querySelector('[data-field="trainRepeatUntilEnd"]');
    const countWrap = editor.querySelector('[data-role="trainCountWrap"]');
    const repeatNote = editor.querySelector('[data-role="trainRepeatNote"]');
    const syncRepeatUi = () => {
      const selectedBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId) || "Barracks";
      const isMilitarySchool = selectedBuilding === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING;
      if (repeatToggle) {
        repeatToggle.checked = isMilitarySchool ? true : repeatToggle.checked;
        repeatToggle.disabled = isMilitarySchool;
      }
      const repeating = isMilitarySchool || !!repeatToggle?.checked;
      if (countWrap) countWrap.hidden = repeating;
      if (repeatNote) repeatNote.hidden = !repeating || isMilitarySchool;
    };
    syncRepeatUi();
    repeatToggle?.addEventListener("change", syncRepeatUi);
  }
  if (cmd.type === "sacredSite") {
    const count = editor.querySelector('[data-field="sacredCount"]');
    if (count) count.value = cmd.payload.count || 0;
  }
  if (cmd.type === "garrisonScholars") {
    const count = editor.querySelector('[data-field="scholarCount"]');
    if (count) count.value = cmd.payload.count || 0;
  }

  updateAssignSummary(editor, cmd);

  const ensureDraftCommitted = () => {
    if (!isBoMarkerDraftCommand(cmd)) return cmd;
    const committed = commitBoMarkerDraft();
    if (committed) cmd = committed;
    return cmd;
  };

  editor.addEventListener("click", (e) => {
    const techBtn = e.target.closest(".bo-tech-btn");
    if (techBtn && cmd.type === "tech") {
      cmd = ensureDraftCommitted();
      const fieldName = techBtn.dataset.techField || "techType";
      const value = techBtn.dataset.techValue || "Wheelbarrow";
      applyBoTechButtonSelection(editor, fieldName, value);
      syncBoCommandFromEditor(editor, cmd);
      boLastResults = null;
      renderBoCommandEditor(cmd);
      renderBoTimelineEditor();
      scheduleRunBuildOrder();
      return;
    }
    const action = e.target.closest("button")?.dataset.action;
    if (action === "remove") {
      if (isBoMarkerDraftCommand(cmd)) {
        discardBoMarkerDraft(true);
        return;
      }
      const removedId = cmd.id;
      boCommands = boCommands.filter((c) => c.id !== removedId);
      boCommands.forEach((c) => {
        if (c.afterId === removedId) c.afterId = null;
      });
      boSelectedCommandId = boCommands[0]?.id || null;
      boLastResults = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(getSelectedBoCommand());
      scheduleRunBuildOrder();
      return;
    }
    if (cmd.type === "buildBuilding") {
      if (action === "add-build-step") {
        const steps = getBoBuildSteps(cmd.payload).slice();
        steps.push(createBoBuildStep(farmsDisabled ? "Mill" : "Farm"));
        cmd.payload.steps = steps;
        applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
        boLastResults = null;
        renderBoCommandEditor(cmd);
        renderBoTimelineEditor();
        scheduleRunBuildOrder();
        return;
      }
      if (action === "remove-build-step" || action === "move-build-step-up" || action === "move-build-step-down") {
        const stepIndex = parseInt(e.target.closest("button")?.dataset.stepIndex || "-1", 10);
        const steps = getBoBuildSteps(cmd.payload).slice();
        if (stepIndex >= 0 && stepIndex < steps.length) {
          if (action === "remove-build-step" && steps.length > 1) {
            steps.splice(stepIndex, 1);
          } else if (action === "move-build-step-up" && stepIndex > 0) {
            [steps[stepIndex - 1], steps[stepIndex]] = [steps[stepIndex], steps[stepIndex - 1]];
          } else if (action === "move-build-step-down" && stepIndex < steps.length - 1) {
            [steps[stepIndex], steps[stepIndex + 1]] = [steps[stepIndex + 1], steps[stepIndex]];
          }
          cmd.payload.steps = steps;
          applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
          boLastResults = null;
          renderBoCommandEditor(cmd);
          renderBoTimelineEditor();
          scheduleRunBuildOrder();
          return;
        }
      }
    }
    const returnBtn = e.target.closest(".bo-return-btn");
    if (returnBtn && cmd.type === "buildBuilding") {
      const target = returnBtn.dataset.return ?? "";
      const returnInput = editor.querySelector('[data-field="buildReturnTarget"]');
      if (returnInput) returnInput.value = target;
      editor.querySelectorAll(".bo-return-btn").forEach((btn) => {
        btn.classList.toggle("selected", (btn.dataset.return || "") === target);
      });
      syncBoCommandFromEditor(editor, cmd);
      scheduleRunBuildOrder();
      return;
    }
    const builderBtn = e.target.closest(".bo-builder-btn[data-source]");
    if (builderBtn && cmd.type === "buildBuilding") {
      const source = builderBtn.dataset.source || "idle";
      const sourceInput = editor.querySelector('[data-field="buildBuilderSource"]');
      if (sourceInput) sourceInput.value = source;
      editor.querySelectorAll(".bo-builder-btn[data-source]").forEach((btn) => {
        btn.classList.toggle("selected", btn.dataset.source === source);
      });
      syncBoCommandFromEditor(editor, cmd);
      scheduleRunBuildOrder();
    }
  });

  editor.addEventListener("change", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    const buildField = e.target.closest("[data-build-field]")?.dataset.buildField;
    if (buildField) {
      cmd = ensureDraftCommitted();
      syncBoCommandFromEditor(editor, cmd);
      if (["building", "autoTime", "autoCost"].includes(buildField)) {
        renderBoCommandEditor(cmd);
      } else {
        syncBoBuildStepUi(editor, cmd);
      }
      scheduleRunBuildOrder();
      return;
    }
    if (!field) return;
    cmd = ensureDraftCommitted();
    if (field === "type") {
      cmd.type = e.target.value;
      boLastCommandType = cmd.type === "trainUnit" ? "assign" : cmd.type;
      setBoDefaults(cmd);
      applyAutoDefaultsForCommand(cmd, civ);
      boLastResults = null;
      renderBoCommandEditor(cmd);
      renderBoTimelineEditor();
      scheduleRunBuildOrder();
      return;
    }
    if (field === "timeMode") {
      const selectedMode = e.target.value;
      const hasBuildingAnchor = !!cmd.payload?.buildingId;
      const resolvedTiming = resolveBoTimingModeSelection(selectedMode, cmd.atTime);
      cmd.timeMode = resolvedTiming.timeMode;
      if (selectedMode === "atPin") {
        cmd.atTime = resolvedTiming.atTime;
        cmd.afterId = null;
        const atEl = editor.querySelector('[data-field="atTime"]');
        if (atEl) atEl.value = String(Math.round(cmd.atTime));
        e.target.value = "atTime";
      } else if (cmd.timeMode === "atTime") {
        cmd.afterId = null;
        if (!Number.isFinite(cmd.atTime)) cmd.atTime = 0;
        const atEl = editor.querySelector('[data-field="atTime"]');
        if (atEl && !atEl.value) atEl.value = "0";
      } else if (!cmd.afterId && !hasBuildingAnchor) {
        cmd.afterId = getPrevBoCommandId(cmd.id);
      }
      updateBoTimeMode(editor, cmd.timeMode);
      updateAssignSummary(editor, cmd);
      boLastResults = null;
      renderBoTimelineEditor();
      scheduleRunBuildOrder();
      return;
    }
    syncBoCommandFromEditor(editor, cmd);
    if (["buildBuilding", "techType", "trainUnit", "trainBuilding", "trainRepeatUntilEnd", "autoTime", "autoCost", "howWing", "howBranch"].includes(field)) {
      renderBoCommandEditor(cmd);
    }
    scheduleRunBuildOrder();
  });

  editor.addEventListener("input", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    const buildField = e.target.closest("[data-build-field]")?.dataset.buildField;
    if (buildField) {
      cmd = ensureDraftCommitted();
      syncBoCommandFromEditor(editor, cmd);
      scheduleRunBuildOrder();
      return;
    }
    if (!field) return;
    cmd = ensureDraftCommitted();
    syncBoCommandFromEditor(editor, cmd);
    scheduleRunBuildOrder();
  }, { passive: true });
}

function syncBoCommandFromEditor(editor, cmd) {
  const getVal = (field) => editor.querySelector(`[data-field="${field}"]`)?.value;
  const getNum = (field) => parseFloat(getVal(field)) || 0;
  const timing = resolveBoTimingModeSelection(getVal("timeMode") || cmd.timeMode, getNum("atTime"));
  cmd.atTime = timing.atTime;
  cmd.timeMode = timing.timeMode;
  const hasBuildingAnchor = !!cmd.payload?.buildingId;
  if (cmd.timeMode === "atTime") {
    cmd.afterId = null;
  } else if (!cmd.afterId && !hasBuildingAnchor) {
    cmd.afterId = getPrevBoCommandId(cmd.id);
  }

  const updateAuto = () => {
    cmd.autoTime = editor.querySelector('[data-field="autoTime"]')?.checked ?? cmd.autoTime;
    cmd.autoCost = editor.querySelector('[data-field="autoCost"]')?.checked ?? cmd.autoCost;
  };

  if (cmd.type === "assign") {
    const civ = document.getElementById("boCiv")?.value || "";
    const noBoarCiv = isBoNoBoarCiv(civ);
    const farmsDisabled = (BO_CIV_BONUSES?.[civ]?.farmsDisabled || civ === "Mongols");
    const overrides = { ...(cmd.payload.tripOverrides || {}) };
    const applyOverride = (field, key, allow = true) => {
      if (!allow) return;
      const raw = editor.querySelector(`[data-field="${field}"]`)?.value;
      if (raw === "" || raw === null || raw === undefined) return;
      const num = parseFloat(raw);
      if (!Number.isFinite(num)) return;
      overrides[key] = Math.max(0, num);
    };
    applyOverride("tripSheep", "sheep");
    applyOverride("tripBerries", "berries");
    applyOverride("tripDeer", "deer");
    applyOverride("tripBoar", "boar", !noBoarCiv);
    applyOverride("tripFarm", "farm", !farmsDisabled);
    applyOverride("tripWood", "wood");
    applyOverride("tripGold", "gold");
    applyOverride("tripStone", "stone");
    let counts = {
      berries: getNum("assignBerries"),
      deer: getNum("assignDeer"),
      boar: noBoarCiv ? 0 : getNum("assignBoar"),
      sheep: getNum("assignSheep"),
      farm: farmsDisabled ? 0 : getNum("assignFarm"),
      wood: getNum("assignWood"),
      gold: getNum("assignGold"),
      stone: getNum("assignStone")
    };
    const info = estimateBoVillagerState(cmd.id);
    const availableForAssign = Math.max(0, info.total - (info.busy || 0));
    const capped = capAssignmentCounts(counts, availableForAssign);
    counts = capped.capped;
    const farmCap = Math.max(0, info.farmCount || 0);
    if (counts.farm > farmCap) {
      counts.farm = farmCap;
      const setVal = (field, value) => {
        const el = editor.querySelector(`[data-field="${field}"]`);
        if (el) el.value = value;
      };
      setVal("assignFarm", counts.farm);
    }
    if (capped.changed) {
      const setVal = (field, value) => {
        const el = editor.querySelector(`[data-field="${field}"]`);
        if (el) el.value = value;
      };
      setVal("assignBerries", counts.berries);
      setVal("assignDeer", counts.deer);
      setVal("assignBoar", counts.boar);
      setVal("assignSheep", counts.sheep);
      setVal("assignFarm", counts.farm);
      setVal("assignWood", counts.wood);
      setVal("assignGold", counts.gold);
      setVal("assignStone", counts.stone);
    }
    cmd.payload = {
      ...counts,
      travelDelaySec: Math.max(0, getNum("assignTravelDelay")),
      tripOverrides: overrides
    };
    updateAssignSummary(editor, cmd);
  } else if (cmd.type === "houseOfWisdomWing") {
    updateAuto();
    const wing = getVal("howWing") || cmd.payload?.wing || "culture";
    const branch = (document.getElementById("boCiv")?.value || "") === "Ayyubids"
      ? (getVal("howBranch") || Object.keys(BO_AYYUBID_HOW_BRANCHES[wing]?.branches || {})[0] || null)
      : null;
    cmd.payload = {
      ...cmd.payload,
      wing,
      branch,
      building: BO_HOUSE_OF_WISDOM_BUILDING,
      buildingId: BO_HOUSE_OF_WISDOM_BUILDING,
      time: Math.max(0, getNum("howTime")),
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      }
    };
    applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  } else if (cmd.type === "resourceTrip") {
    const resource = getVal("resourceTripResource") || cmd.payload.resource || "sheep";
    cmd.payload = {
      resource: BO_RESOURCE_KEYS.includes(resource) ? resource : "sheep",
      tripOverrideSec: Math.max(0, getNum("resourceTripValue"))
    };
  } else if (cmd.type === "vizierChoice") {
    const choiceId = getVal("vizierChoiceId") || cmd.payload.choiceId || "fieldWork";
    cmd.payload = {
      choiceId: getBoOttomanChoiceDef(choiceId) ? choiceId : "fieldWork"
    };
  } else if (cmd.type === "buildBuilding") {
    const returnTargetRaw = getVal("buildReturnTarget");
    const returnTarget = returnTargetRaw === "" || returnTargetRaw === undefined ? null : returnTargetRaw;
    cmd.payload = {
      steps: readBoBuildStepsFromEditor(editor),
      builders: Math.max(1, Math.floor(getNum("buildBuilders") || 1)),
      builderSource: getVal("buildBuilderSource") || "idle",
      returnTarget,
      travelDelaySec: Math.max(0, getNum("buildTravelDelay"))
    };
    applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  } else if (cmd.type === "tech") {
    updateAuto();
    const techType = getVal("techType") || "Wheelbarrow";
    const sites = getBoTechResearchSites(techType);
    const anchoredBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId) || null;
    cmd.payload = {
      techType,
      time: getNum("techTime"),
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      },
      building: anchoredBuilding && sites.includes(anchoredBuilding) ? anchoredBuilding : null,
      buildingId: (cmd.payload.buildingId && sites.includes(inferBoBuildingTypeFromId(cmd.payload.buildingId))) ? cmd.payload.buildingId : null
    };
    applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  } else if (cmd.type === "rally") {
    const civ = document.getElementById("boCiv")?.value || "";
    const noBoarCiv = isBoNoBoarCiv(civ);
    const target = getVal("rallyTarget") || "idle";
    const tripRaw = editor.querySelector('[data-field="rallyTripOverride"]')?.value;
    const tripOverride = tripRaw === "" || tripRaw === null || tripRaw === undefined ? null : parseFloat(tripRaw);
    cmd.payload = {
      target: noBoarCiv && target === "boar" ? "idle" : target,
      travelDelaySec: Math.max(0, getNum("rallyTravelDelay")),
      tripOverrideSec: Number.isFinite(tripOverride) ? Math.max(0, tripOverride) : null
    };
  } else if (cmd.type === "trainUnit") {
    updateAuto();
    const selectedBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId) || "Barracks";
    const selectedSurface = getBoTrainingSurface(selectedBuilding, civ);
    const unitName = getVal("trainUnit") || cmd.payload.unitName;
    const repeatUntilEnd = selectedBuilding === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING
      ? true
      : !!editor.querySelector('[data-field="trainRepeatUntilEnd"]')?.checked;
    const rallyTarget = editor.querySelector('[data-field="rallyTarget"]')?.value;
    const rallyTravelDelay = parseFloat(editor.querySelector('[data-field="rallyTravelDelay"]')?.value);
    const rallyPayload = (selectedSurface === "Town Center" && unitName === "Villager") ? {
      rallyTarget: rallyTarget || "idle",
      rallyTravelDelaySec: Math.max(0, Number.isFinite(rallyTravelDelay) ? rallyTravelDelay : 0),
      rallyTripOverrideSec: Number.isFinite(cmd.payload.rallyTripOverrideSec) ? cmd.payload.rallyTripOverrideSec : null
    } : {
      rallyTarget: null,
      rallyTravelDelaySec: 0,
      rallyTripOverrideSec: null
    };
    cmd.payload = {
      unitName,
      building: selectedBuilding,
      count: selectedBuilding === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING
        ? 1
        : Math.max(1, Math.floor(getNum("trainCount") || 1)),
      repeatUntilEnd,
      timePerUnit: getNum("trainTime"),
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      },
      buildingId: (cmd.payload.buildingId && cmd.payload.building === selectedBuilding) ? cmd.payload.buildingId : null,
      ...rallyPayload
    };
    applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  } else if (cmd.type === "sacredSite") {
    cmd.payload = { count: Math.max(0, Math.floor(getNum("sacredCount") || 0)) };
  } else if (cmd.type === "garrisonScholars") {
    updateAuto();
    cmd.payload = {
      count: Math.max(0, Math.floor(getNum("scholarCount") || 0)),
      timePerScholar: getNum("scholarTime") || BO_SCHOLAR.time,
      costGold: getNum("scholarGold") || BO_SCHOLAR.costGold
    };
    applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  }

  boLastResults = null;
  renderBoTimelineEditor();
}

function renderBoBuildingPanel(editor, building) {
  const civ = getBoSelectedCiv();
  if (!civ) {
    editor.innerHTML = "<span class='text-muted'>Select a civilization to begin.</span>";
    return;
  }
  if (building?.type === BO_HOUSE_OF_WISDOM_BUILDING && isBoHouseOfWisdomCiv(civ)) {
    const anchorTime = getBoAnchorTime();
    const state = getBoHouseOfWisdomPreviewState(anchorTime);
    const howTechs = getBoAvailableTechs(civ, BO_HOUSE_OF_WISDOM_BUILDING, { timeOverride: anchorTime });
    const displayWings = (state.wings || []).length
      ? state.wings
      : getBoPlannedHouseOfWisdomWings(civ);
    const choices = getBoHouseOfWisdomActionChoices(civ, state);
    const goldenAgeText = formatBoGoldenAgeBonuses(state.goldenAge?.bonuses || {});
    const wingSummary = displayWings.length
      ? displayWings.map((entry) => {
        const label = getBoHouseOfWisdomWingLabel(civ, entry.wing, entry.branch);
        return `${label} (Age ${entry.targetAge || getBoHouseOfWisdomChoiceAgeFromCount(0)})`;
      }).join(" • ")
      : "No wings chosen yet";
    const summaryItems = [
      ["Golden Age", `Tier ${state.goldenAge?.tier || 0}`],
      ["Counted buildings", state.goldenAge?.count || 0],
      ["Active bonuses", goldenAgeText || "None yet"],
      ["Chosen wings", wingSummary]
    ];
    const summaryHtml = summaryItems.map(([label, value]) => `
      <div class="bo-vizier-summary-pill">
        <span class="bo-vizier-summary-pill-label">${label}</span>
        <span class="bo-vizier-summary-pill-value">${value}</span>
      </div>
    `).join("");
    const actionsHtml = choices.length
      ? choices.map((choice) => `
        <button class="bo-vizier-choice-btn" type="button" data-how-wing="${choice.wing}" data-how-branch="${choice.branch || ""}">
          <div class="bo-vizier-choice-title">
            <span>${choice.label}</span>
            <span class="bo-vizier-choice-level">Age ${getBoHouseOfWisdomChoiceAgeFromCount(displayWings.length)}</span>
          </div>
          <div class="bo-vizier-choice-body">${choice.description || "Choose this wing from the House of Wisdom."}</div>
        </button>
      `).join("")
      : `<div class="bo-target-note text-muted">All House of Wisdom wings are already chosen.</div>`;
    const howTechBlock = howTechs.length ? `
      <div class="bo-action-block">
        <div class="bo-action-title">Research Tech</div>
        <div class="row g-2">
          <div class="col-12">
            <small class="text-muted">Tech</small>
            ${renderBoTechButtonGrid("howTechSelect", howTechs[0], howTechs, civ, BO_HOUSE_OF_WISDOM_BUILDING)}
          </div>
          <div class="col-md-4 col-sm-5">
            <small class="text-muted">Timing</small>
            <select class="form-select form-select-sm" data-field="howTechTimeMode">
              ${renderBoTimingModeOptions("afterPrev")}
            </select>
          </div>
          <div class="col-md-4 col-sm-4">
            <small class="text-muted">Time (s)</small>
            <input type="number" class="form-control form-control-sm" data-field="howTechAtTime" value="${Math.round(anchorTime)}" min="0" step="1">
          </div>
          <div class="col-md-4 col-sm-3 d-flex align-items-end justify-content-end">
            <button class="btn btn-outline-secondary btn-sm" type="button" data-action="queueHowTech">Add Research</button>
          </div>
        </div>
        <div class="bo-target-note text-muted" data-role="howTechNote">${escapeBoHtml(getBoTechNoteText(howTechs[0]))}</div>
      </div>
    ` : "";
    editor.innerHTML = `
      <div class="bo-card-header">
        <div class="bo-card-title">House of Wisdom</div>
      </div>
      <div class="bo-building-meta"><strong>Selected:</strong> ${BO_HOUSE_OF_WISDOM_BUILDING} <span class="text-muted">Always available from 0:00</span></div>
      <div class="bo-vizier-note">Age up through House of Wisdom wings instead of generic landmarks.</div>
      <div class="bo-vizier-summary-grid">${summaryHtml}</div>
      <div class="bo-action-block">
        <div class="bo-action-title">Add Wing</div>
        <div class="row g-2">
          <div class="col-md-4 col-sm-4">
            <small class="text-muted">Timing</small>
            <select class="form-select form-select-sm" data-field="howTimeMode">
              ${renderBoTimingModeOptions("afterPrev")}
            </select>
          </div>
          <div class="col-md-4 col-sm-4">
            <small class="text-muted">Time (s)</small>
            <input type="number" class="form-control form-control-sm" data-field="howAtTime" value="${Math.round(anchorTime)}" min="0" step="1">
          </div>
          <div class="col-md-4 col-sm-4 d-flex align-items-end">
            <div class="bo-vizier-note">Use a timeline pin for exact House of Wisdom timing.</div>
          </div>
        </div>
      </div>
      <div class="bo-vizier-choice-grid">${actionsHtml}</div>
      ${howTechBlock}
    `;
    const queueHowChoice = (wing, branch) => {
      const mode = editor.querySelector('[data-field="howTimeMode"]')?.value || "afterPrev";
      const atTime = parseFloat(editor.querySelector('[data-field="howAtTime"]')?.value) || 0;
      const timing = resolveBoTimingModeSelection(mode, atTime);
      const cmd = createBoCommand("houseOfWisdomWing");
      cmd.payload.wing = wing;
      cmd.payload.branch = branch || null;
      applyAutoDefaultsForCommand(cmd, civ);
      if (timing.timeMode === "atTime") {
        insertBoCommandAtTime(cmd, timing.atTime);
      } else {
        cmd.timeMode = "afterPrev";
        cmd.afterId = getPrevBoCommandId(cmd.id);
        boCommands.push(cmd);
      }
      boSelectedCommandId = cmd.id;
      boSelectedBuilding = null;
      setBoTargetBuilding(null);
      boLastCommandType = "houseOfWisdomWing";
      boLastResults = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(cmd);
      renderBoGatherRates();
      scheduleRunBuildOrder();
    };
    editor.querySelectorAll("[data-how-wing]").forEach((btn) => {
      btn.addEventListener("click", () => {
        queueHowChoice(btn.dataset.howWing, btn.dataset.howBranch || null);
      });
    });
    applyBoTechButtonSelection(editor, "howTechSelect", howTechs[0] || "");
    editor.addEventListener("click", (e) => {
      const techBtn = e.target.closest('.bo-tech-btn[data-tech-field="howTechSelect"]');
      if (!techBtn) return;
      const nextTech = techBtn.dataset.techValue || "";
      applyBoTechButtonSelection(editor, "howTechSelect", nextTech);
      const noteEl = editor.querySelector('[data-role="howTechNote"]');
      if (noteEl) noteEl.textContent = getBoTechNoteText(nextTech);
    });
    editor.querySelector('[data-action="queueHowTech"]')?.addEventListener("click", () => {
      const techType = editor.querySelector('[data-field="howTechSelect"]')?.value || howTechs[0];
      const mode = editor.querySelector('[data-field="howTechTimeMode"]')?.value || "afterPrev";
      const atTime = parseFloat(editor.querySelector('[data-field="howTechAtTime"]')?.value) || 0;
      const cmd = addBoCommand("tech", mode === "afterPrev" ? building.sourceCommandId : null);
      cmd.payload.techType = techType;
      cmd.payload.building = BO_HOUSE_OF_WISDOM_BUILDING;
      cmd.payload.buildingId = BO_HOUSE_OF_WISDOM_BUILDING;
      applyAutoDefaultsForCommand(cmd, civ);
      const timing = resolveBoTimingModeSelection(mode, atTime);
      if (timing.timeMode === "atTime") {
        insertBoCommandAtTime(cmd, timing.atTime);
      } else {
        cmd.timeMode = "afterPrev";
        cmd.afterId = getPrevBoCommandId(cmd.id);
      }
      boSelectedCommandId = cmd.id;
      boSelectedBuilding = null;
      setBoTargetBuilding(null);
      boLastResults = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(cmd);
      renderBoGatherRates();
      scheduleRunBuildOrder();
    });
    return;
  }
  if (building?.type === BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING) {
    const anchorTime = getBoAnchorTime();
    const state = getBoOttomanPreviewState(anchorTime);
    const summaryItems = [
      ["Vizier XP", Math.floor(state.xp || 0)],
      ["Points earned", `${state.pointsEarned}/${state.cap}`],
      ["Spent / available", `${state.pointsSpent} / ${state.pointsAvailable}`],
      ["Next threshold", Number.isFinite(state.nextThreshold) ? state.nextThreshold : "Cap reached"]
    ];
    const summaryHtml = summaryItems.map(([label, value]) => `
      <div class="bo-vizier-summary-pill">
        <span class="bo-vizier-summary-pill-label">${label}</span>
        <span class="bo-vizier-summary-pill-value">${value}</span>
      </div>
    `).join("");
    const sectionsHtml = BO_OTTOMAN_VIZIER_LEVELS.map((levelDef) => {
      const choiceButtons = levelDef.choices.map((choiceId) => {
        const choice = getBoOttomanChoiceDef(choiceId);
        const uiState = getBoOttomanChoiceUiState(choiceId, state);
        return `
          <button class="bo-vizier-choice-btn${uiState.disabled ? " is-disabled" : ""}" type="button" data-choice-id="${choiceId}" ${uiState.disabled ? "disabled" : ""}>
            <div class="bo-vizier-choice-title">
              <span>${choice.label}</span>
              <span class="bo-vizier-choice-level">Level ${choice.level}</span>
            </div>
            <div class="bo-vizier-choice-body">${choice.description}</div>
            <div class="bo-vizier-choice-state">${uiState.reason}</div>
          </button>
        `;
      }).join("");
      return `
        <div class="bo-action-block">
          <div class="bo-action-title">Level ${levelDef.level}</div>
          <div class="bo-vizier-choice-grid">${choiceButtons}</div>
        </div>
      `;
    }).join("");
    editor.innerHTML = `
      <div class="bo-card-header">
        <div class="bo-card-title">Imperial Council</div>
      </div>
      <div class="bo-building-meta"><strong>Selected:</strong> ${BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING} <span class="text-muted">Always available from 0:00</span></div>
      ${boOttomanLegacyWarning ? `<div class="bo-vizier-warning">${boOttomanLegacyWarning}</div>` : ""}
      <div class="bo-vizier-note">Spend Vizier points here. Trade-only choices stay visible for reference but remain disabled.</div>
      <div class="bo-vizier-summary-grid">${summaryHtml}</div>
      <div class="bo-action-block">
        <div class="bo-action-title">Add Vizier Choice</div>
        <div class="row g-2">
          <div class="col-md-4 col-sm-4">
            <small class="text-muted">Timing</small>
            <select class="form-select form-select-sm" data-field="vizierTimeMode">
              ${renderBoTimingModeOptions("afterPrev")}
            </select>
          </div>
          <div class="col-md-4 col-sm-4">
            <small class="text-muted">Time (s)</small>
            <input type="number" class="form-control form-control-sm" data-field="vizierAtTime" value="${Math.round(anchorTime)}" min="0" step="1">
          </div>
          <div class="col-md-4 col-sm-4 d-flex align-items-end">
            <div class="bo-vizier-note">Use a timeline pin for exact Vizier timing.</div>
          </div>
        </div>
      </div>
      ${sectionsHtml}
    `;
    const queueVizierChoice = (choiceId) => {
      const mode = editor.querySelector('[data-field="vizierTimeMode"]')?.value || "afterPrev";
      const atTime = parseFloat(editor.querySelector('[data-field="vizierAtTime"]')?.value) || 0;
      const timing = resolveBoTimingModeSelection(mode, atTime);
      const cmd = createBoCommand("vizierChoice");
      cmd.payload.choiceId = choiceId;
      if (timing.timeMode === "atTime") {
        insertBoCommandAtTime(cmd, timing.atTime);
      } else {
        cmd.timeMode = "afterPrev";
        cmd.afterId = getPrevBoCommandId(cmd.id);
        boCommands.push(cmd);
      }
      boSelectedCommandId = cmd.id;
      boSelectedBuilding = null;
      setBoTargetBuilding(null);
      boLastCommandType = "vizierChoice";
      boLastResults = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(cmd);
      renderBoGatherRates();
      scheduleRunBuildOrder();
    };
    editor.querySelectorAll("[data-choice-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choiceId = btn.dataset.choiceId;
        if (choiceId) queueVizierChoice(choiceId);
      });
    });
    return;
  }
  const isDelhi = civ === "Delhi Sultanate";
  const noBoarCiv = isBoNoBoarCiv(civ);
  const delhiOnlyTechs = new Set(["Sanctity", "Dome of the Faith"]);
  const readyAt = Number.isFinite(building.readyAt) ? formatTimeMMSS(building.readyAt) : "0:00";

  const ottomanSettings = getBoOttomanSettingsFromInputs();
  const unitPool = getBoUnitOptionsForBuilding(building.type, civ, ottomanSettings);
  const unitOptions = unitPool.map((name) => `<option value="${name}">${name}</option>`).join("");
  const techTimeOverride = Math.max(getBoAnchorTime(), Number.isFinite(building.readyAt) ? building.readyAt : 0);
  const filteredTechs = getBoAvailableTechs(civ, building.type, { timeOverride: techTimeOverride });
  const isProduction = isBoProductionSurface(building.type, civ);
  const isTech = filteredTechs.length > 0;
  const isTownCenter = isBoTownCenterSurface(building.type, civ);
  const isMilitarySchool = building.type === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING;

  const rallyOptions = `
    <option value="sheep">Sheep</option>
    <option value="berries">Berries</option>
    <option value="deer">Deer</option>
    <option value="boar" ${noBoarCiv ? "disabled" : ""}>Boar</option>
    <option value="farm">Farm</option>
    <option value="wood">Wood</option>
    <option value="gold">Gold</option>
    <option value="stone">Stone</option>
    <option value="idle">Idle</option>
  `;

  const queueRallyFields = isTownCenter ? `
      <div class="row g-2 mt-2">
        <div class="col-4">
          <small class="text-muted">Rally Target</small>
          <select class="form-select form-select-sm" data-field="queueRallyTarget">${rallyOptions}</select>
        </div>
        <div class="col-8">
          <small class="text-muted">Travel delay (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="queueRallyTravel" value="0" min="0" step="0.1">
        </div>
      </div>
  ` : "";
  const queueActionTitle = isMilitarySchool ? "Set Military School Output" : "Queue Unit";
  const queueActionLabel = isMilitarySchool ? "Set Output" : "Add Queue";
  const queueBlock = isProduction ? `
    <div class="bo-action-block">
      <div class="bo-action-title">${queueActionTitle}</div>
      <div class="row g-2 align-items-end">
        <div class="col-5">
          <small class="text-muted">Unit</small>
          <select class="form-select form-select-sm" data-field="queueUnit">${unitOptions}</select>
        </div>
        <div class="col-3" data-role="queueCountWrap" ${isMilitarySchool ? "hidden" : ""}>
          <small class="text-muted">Count</small>
          <input type="number" class="form-control form-control-sm" data-field="queueCount" value="1" min="1" title="How many units to queue.">
        </div>
        <div class="col-4">
          <small class="text-muted">Timing</small>
          <select class="form-select form-select-sm" data-field="queueTimeMode">
            ${renderBoTimingModeOptions("afterPrev")}
          </select>
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-4">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="queueAtTime" value="0" min="0" step="1" title="Start time if using 'At time'.">
        </div>
        <div class="col-8 d-flex align-items-end justify-content-end">
          <button class="btn btn-outline-secondary btn-sm" type="button" data-action="queueUnit">${queueActionLabel}</button>
        </div>
      </div>
      <div class="form-check mt-2" ${isMilitarySchool ? "hidden" : ""}>
        <input class="form-check-input" type="checkbox" data-field="queueRepeatUntilEnd" id="queueRepeat_${building.id.replace(/[^a-zA-Z0-9]/g, "_")}">
        <label class="form-check-label" for="queueRepeat_${building.id.replace(/[^a-zA-Z0-9]/g, "_")}">Repeat until sim end</label>
      </div>
      <div class="bo-target-note text-muted" data-role="queueRepeatNote" hidden>Uses this building continuously until the sim ends or a newer repeat queue replaces it.</div>
      ${queueRallyFields}
      <div class="bo-target-note text-muted">${isMilitarySchool ? "Military Schools continuously produce one selected unit for free. The output command uses repeat mode automatically." : "After previous anchors to this building's completion."}</div>
    </div>
  ` : "";
  const rallyHint = isTownCenter
    ? `<div class="bo-target-note text-muted">Tip: click a Vill marker on the resource lane to reroute villagers from that time.</div>`
    : "";

  const techBlock = isTech && filteredTechs.length ? `
    <div class="bo-action-block">
      <div class="bo-action-title">Research Tech</div>
      <div class="row g-2">
        <div class="col-12">
          <small class="text-muted">Tech</small>
          ${renderBoTechButtonGrid("techSelect", filteredTechs[0] || "Wheelbarrow", filteredTechs, civ, building.type)}
        </div>
        <div class="col-md-3 col-sm-4">
          <small class="text-muted">Timing</small>
          <select class="form-select form-select-sm" data-field="techTimeMode">
            ${renderBoTimingModeOptions("afterPrev")}
          </select>
        </div>
        <div class="col-md-3 col-sm-4">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="techAtTime" value="0" min="0" step="1" title="Start time if using 'At time'.">
        </div>
        <div class="col-md-6 col-sm-4 d-flex align-items-end justify-content-end">
          <button class="btn btn-outline-secondary btn-sm" type="button" data-action="queueTech">Add Research</button>
        </div>
      </div>
    </div>
  ` : "";

  const capabilityBadges = [
    isProduction || isTownCenter ? `<span class="bo-lane-badge queue"><i class="bi bi-people-fill" aria-hidden="true"></i>Queue</span>` : "",
    isTech ? `<span class="bo-lane-badge tech"><i class="bi bi-stars" aria-hidden="true"></i>Research</span>` : ""
  ].filter(Boolean).join("");
  const emptyBlock = (!isProduction && !isTech && !isTownCenter)
    ? `<div class="text-muted">No actions available for this building.</div>`
    : "";

  editor.innerHTML = `
    <div class="bo-card-header">
      <div class="bo-card-title">Building Actions</div>
    </div>
    <div class="bo-building-meta"><strong>Selected:</strong> ${building.type} - ${building.id} <span class="text-muted">Ready ${readyAt}</span></div>
    ${capabilityBadges ? `<div class="bo-building-capabilities">${capabilityBadges}</div>` : ""}
    ${queueBlock}
    ${rallyHint}
    ${techBlock}
    ${emptyBlock}
  `;

  if (isTownCenter) {
    const queueSel = editor.querySelector('[data-field="queueUnit"]');
    if (queueSel) queueSel.value = "Villager";
    const queueRally = editor.querySelector('[data-field="queueRallyTarget"]');
    if (queueRally) queueRally.value = "idle";
  }
  if (isMilitarySchool) {
    const queueRepeat = editor.querySelector('[data-field="queueRepeatUntilEnd"]');
    if (queueRepeat) queueRepeat.checked = true;
  }

  const queueRepeatToggle = editor.querySelector('[data-field="queueRepeatUntilEnd"]');
  const queueCountWrap = editor.querySelector('[data-role="queueCountWrap"]');
  const queueRepeatNote = editor.querySelector('[data-role="queueRepeatNote"]');
  const syncQueueRepeatUi = () => {
    const repeating = isMilitarySchool || !!queueRepeatToggle?.checked;
    if (queueCountWrap) queueCountWrap.hidden = repeating;
    if (queueRepeatNote) queueRepeatNote.hidden = !repeating || isMilitarySchool;
  };
  syncQueueRepeatUi();
  queueRepeatToggle?.addEventListener("change", syncQueueRepeatUi);
  applyBoTechButtonSelection(editor, "techSelect", filteredTechs[0] || "Wheelbarrow");

  editor.addEventListener("click", (e) => {
    const techBtn = e.target.closest(".bo-tech-btn");
    if (!techBtn) return;
    const fieldName = techBtn.dataset.techField || "techSelect";
    const value = techBtn.dataset.techValue || "Wheelbarrow";
    applyBoTechButtonSelection(editor, fieldName, value);
  });

  const anchorId = building.sourceCommandId || null;

  const applyTimingToCommand = (cmd, mode, atTime) => {
    const timing = resolveBoTimingModeSelection(mode, atTime);
    cmd.timeMode = timing.timeMode;
    if (cmd.timeMode === "atTime") {
      cmd.atTime = timing.atTime;
      cmd.afterId = null;
    } else {
      if (anchorId) {
        cmd.atTime = 0;
        cmd.afterId = anchorId;
      } else {
        setBoCommandToTimelineStart(cmd);
      }
    }
  };

  editor.querySelector('[data-action="queueUnit"]')?.addEventListener("click", () => {
    const unitName = editor.querySelector('[data-field="queueUnit"]')?.value || (isTownCenter ? "Villager" : "Spearman");
    const count = isMilitarySchool ? 1 : Math.max(1, parseInt(editor.querySelector('[data-field="queueCount"]')?.value, 10) || 1);
    const repeatUntilEnd = isMilitarySchool ? true : !!editor.querySelector('[data-field="queueRepeatUntilEnd"]')?.checked;
    const mode = editor.querySelector('[data-field="queueTimeMode"]')?.value || "afterPrev";
    const atTime = parseFloat(editor.querySelector('[data-field="queueAtTime"]')?.value) || 0;
    const rallyTarget = editor.querySelector('[data-field="queueRallyTarget"]')?.value || "idle";
    const rallyTravel = parseFloat(editor.querySelector('[data-field="queueRallyTravel"]')?.value);
    const cmd = addBoCommand("trainUnit", mode === "afterPrev" ? anchorId : null);
    cmd.payload.building = building.type;
    cmd.payload.buildingId = building.id;
    cmd.payload.unitName = unitName;
    cmd.payload.count = count;
    cmd.payload.repeatUntilEnd = repeatUntilEnd;
    if (isTownCenter && unitName === "Villager") {
      cmd.payload.rallyTarget = rallyTarget || "idle";
      cmd.payload.rallyTravelDelaySec = Math.max(0, Number.isFinite(rallyTravel) ? rallyTravel : 0);
      cmd.payload.rallyTripOverrideSec = null;
    } else {
      cmd.payload.rallyTarget = null;
      cmd.payload.rallyTravelDelaySec = 0;
      cmd.payload.rallyTripOverrideSec = null;
    }
    applyAutoDefaultsForCommand(cmd, civ);
    applyTimingToCommand(cmd, mode, atTime);
    boLastResults = null;
    renderBoTimelineEditor();
    renderBoCommandEditor(null);
    scheduleRunBuildOrder();
  });

  editor.querySelector('[data-action="queueTech"]')?.addEventListener("click", () => {
    const techType = editor.querySelector('[data-field="techSelect"]')?.value || "Wheelbarrow";
    const mode = editor.querySelector('[data-field="techTimeMode"]')?.value || "afterPrev";
    const atTime = parseFloat(editor.querySelector('[data-field="techAtTime"]')?.value) || 0;
    const cmd = addBoCommand("tech", mode === "afterPrev" ? anchorId : null);
    cmd.payload.techType = techType;
    cmd.payload.building = building.type;
    cmd.payload.buildingId = building.id;
    applyAutoDefaultsForCommand(cmd, civ);
    applyTimingToCommand(cmd, mode, atTime);
    boLastResults = null;
    renderBoTimelineEditor();
    renderBoCommandEditor(null);
    scheduleRunBuildOrder();
  });

}

function updateBoTimeMode(card, mode) {
  const atTimeEl = card.querySelector('[data-field="atTime"]');
  if (atTimeEl) {
    atTimeEl.disabled = mode !== "atTime";
    atTimeEl.style.opacity = mode === "atTime" ? "1" : "0.5";
  }
}

function renderBoFields(card, cmd) {
  const container = card.querySelector('[data-role="typeFields"]');
  if (!container) return;
  if (!cmd.payload) setBoDefaults(cmd);
  let html = "";

  const costInputs = (cost) => `
    <div class="row g-2 mt-2">
      <div class="col-3"><small class="text-muted">Food</small><input type="number" class="form-control form-control-sm" data-field="costFood" value="${cost.food}" min="0"></div>
      <div class="col-3"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-field="costWood" value="${cost.wood}" min="0"></div>
      <div class="col-3"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-field="costGold" value="${cost.gold}" min="0"></div>
      <div class="col-3"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-field="costStone" value="${cost.stone}" min="0"></div>
    </div>`;

  if (cmd.type === "assign") {
    html = `
      <div class="row g-2">
        <div class="col-3"><small class="text-muted">Berries</small><input type="number" class="form-control form-control-sm" data-field="assignBerries" value="${cmd.payload.berries}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Deer</small><input type="number" class="form-control form-control-sm" data-field="assignDeer" value="${cmd.payload.deer}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Boar</small><input type="number" class="form-control form-control-sm" data-field="assignBoar" value="${cmd.payload.boar}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Sheep</small><input type="number" class="form-control form-control-sm" data-field="assignSheep" value="${cmd.payload.sheep}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Farms</small><input type="number" class="form-control form-control-sm" data-field="assignFarm" value="${cmd.payload.farm}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-field="assignWood" value="${cmd.payload.wood}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-field="assignGold" value="${cmd.payload.gold}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-field="assignStone" value="${cmd.payload.stone}" min="0" step="1"></div>
      </div>
      <small class="text-muted">Sets total assigned villagers (remaining become idle).</small>
    `;
  } else if (cmd.type === "buildBuilding") {
    html = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Building</small>
          <select class="form-select form-select-sm" data-field="buildBuilding">
            <option value="Mill">Mill</option>
            <option value="Lumber Camp">Lumber Camp</option>
            <option value="Mining Camp">Mining Camp</option>
            <option value="Town Center">Town Center</option>
          </select>
        </div>
        <div class="col-3">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="buildTime" value="${cmd.payload.time}" min="0">
        </div>
        <div class="col-3">
          <small class="text-muted">Builders</small>
          <input type="number" class="form-control form-control-sm" data-field="buildBuilders" value="${cmd.payload.builders}" min="1">
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-6">
          <small class="text-muted">Builder Source</small>
          <select class="form-select form-select-sm" data-field="buildBuilderSource">
            <option value="any">Any</option>
            <option value="sheep">Sheep</option>
            <option value="berries">Berries</option>
            <option value="deer">Deer</option>
            <option value="boar">Boar</option>
            <option value="farm">Farm</option>
            <option value="wood">Wood</option>
            <option value="gold">Gold</option>
            <option value="stone">Stone</option>
            <option value="idle">Idle</option>
          </select>
        </div>
      </div>
      ${costInputs(cmd.payload.cost)}
    `;
  } else if (cmd.type === "tech") {
    html = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Tech</small>
          <select class="form-select form-select-sm" data-field="techType">
            <option value="wheelbarrow">Wheelbarrow</option>
            <option value="foodUpgrade">Food Upgrade</option>
          </select>
        </div>
        <div class="col-3">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="techTime" value="${cmd.payload.time}" min="0">
        </div>
      </div>
      ${costInputs(cmd.payload.cost)}
    `;
  } else if (cmd.type === "ageUp") {
    html = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Target Age</small>
          <select class="form-select form-select-sm" data-field="targetAge">
            <option value="2">Age II</option>
            <option value="3">Age III</option>
            <option value="4">Age IV</option>
          </select>
        </div>
        <div class="col-3">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="ageTime" value="${cmd.payload.time}" min="0">
        </div>
      </div>
      ${costInputs(cmd.payload.cost)}
    `;
  } else if (cmd.type === "rally") {
    html = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Rally Target</small>
          <select class="form-select form-select-sm" data-field="rallyTarget">
            <option value="sheep">Sheep</option>
            <option value="berries">Berries</option>
            <option value="deer">Deer</option>
            <option value="boar">Boar</option>
            <option value="farm">Farm</option>
            <option value="wood">Wood</option>
            <option value="gold">Gold</option>
            <option value="stone">Stone</option>
            <option value="idle">Idle</option>
          </select>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  if (cmd.type === "buildBuilding") {
    const buildSel = card.querySelector('[data-field="buildBuilding"]');
    if (buildSel) buildSel.value = cmd.payload.building || "Mill";
    const source = card.querySelector('[data-field="buildBuilderSource"]');
    if (source) source.value = cmd.payload.builderSource || "sheep";
  }
  if (cmd.type === "tech") {
    const techSel = card.querySelector('[data-field="techType"]');
    if (techSel) techSel.value = cmd.payload.techType || "wheelbarrow";
  }
  if (cmd.type === "ageUp") {
    const target = card.querySelector('[data-field="targetAge"]');
    if (target) target.value = String(cmd.payload.targetAge || 2);
  }
  if (cmd.type === "rally") {
    const rally = card.querySelector('[data-field="rallyTarget"]');
    if (rally) rally.value = cmd.payload.target || "sheep";
  }
}

function attachBoCardListeners(card, cmd) {
  card.addEventListener("click", (e) => {
    const action = e.target.closest("button")?.dataset.action;
    if (action === "remove") {
      boCommands = boCommands.filter((c) => c.id !== cmd.id);
      renderBoCommands();
    }
  });

  card.addEventListener("change", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    if (!field) return;
    if (field === "type") {
      cmd.type = e.target.value;
      setBoDefaults(cmd);
      renderBoFields(card, cmd);
      return;
    }
    if (field === "timeMode") {
      const resolvedTiming = resolveBoTimingModeSelection(e.target.value, cmd.atTime);
      cmd.timeMode = resolvedTiming.timeMode;
      if (e.target.value === "atPin") {
        cmd.atTime = resolvedTiming.atTime;
        const atEl = card.querySelector('[data-field="atTime"]');
        if (atEl) atEl.value = String(Math.round(cmd.atTime));
        e.target.value = "atTime";
      }
      updateBoTimeMode(card, cmd.timeMode);
      return;
    }
    syncBoCommandFromCard(card, cmd);
  });

  card.addEventListener("input", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    if (!field) return;
    syncBoCommandFromCard(card, cmd);
  });
}

function syncBoCommandFromCard(card, cmd) {
  const getVal = (field) => card.querySelector(`[data-field="${field}"]`)?.value;
  const getNum = (field) => parseFloat(getVal(field)) || 0;
  const timing = resolveBoTimingModeSelection(getVal("timeMode") || cmd.timeMode, getNum("atTime"));
  cmd.timeMode = timing.timeMode;
  cmd.atTime = timing.atTime;
  cmd.type = getVal("type") || cmd.type;

  if (cmd.type === "assign") {
    cmd.payload = {
      berries: getNum("assignBerries"),
      deer: getNum("assignDeer"),
      boar: getNum("assignBoar"),
      sheep: getNum("assignSheep"),
      farm: getNum("assignFarm"),
      wood: getNum("assignWood"),
      gold: getNum("assignGold"),
      stone: getNum("assignStone")
    };
  } else if (cmd.type === "buildBuilding") {
    cmd.payload = {
      building: getVal("buildBuilding") || "Building",
      time: getNum("buildTime"),
      builders: Math.max(1, Math.floor(getNum("buildBuilders") || 1)),
      builderSource: getVal("buildBuilderSource") || "sheep",
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      }
    };
  } else if (cmd.type === "tech") {
    cmd.payload = {
      techType: getVal("techType") || "wheelbarrow",
      time: getNum("techTime"),
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      }
    };
  } else if (cmd.type === "ageUp") {
    updateAuto();
    cmd.payload = {
      targetAge: parseInt(getVal("targetAge"), 10) || 2,
      time: getNum("ageTime"),
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      }
    };
  } else if (cmd.type === "rally") {
    cmd.payload = {
      target: getVal("rallyTarget") || "sheep"
    };
  }
}

function formatTimeMMSS(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getBoResourceLabel(resource) {
  return BO_RESOURCE_LABELS[resource] || resource || "Resource";
}

function formatBoTripOverrideValue(value) {
  return `${(Math.round((Math.max(0, value || 0)) * 10) / 10).toFixed(1)}s`;
}

function formatBoLegacyTripOverrides(overrides = {}) {
  return Object.entries(overrides)
    .filter(([key, value]) => BO_RESOURCE_KEYS.includes(key) && Number.isFinite(value))
    .map(([key, value]) => `${getBoResourceLabel(key)} ${formatBoTripOverrideValue(value)}`)
    .join(" | ");
}

function isBoTimelineCounterBuilding(name) {
  return name === "Farm" || name === "House";
}

function renderBoTimingModeOptions(selectedMode = "afterPrev") {
  const hasPin = Number.isFinite(boPinnedTime);
  const pinLabel = hasPin ? `At pin (${formatTimeMMSS(boPinnedTime)})` : "At pin (set a pin first)";
  return `
    <option value="afterPrev"${selectedMode === "afterPrev" ? " selected" : ""}>After previous</option>
    <option value="atTime"${selectedMode === "atTime" ? " selected" : ""}>At time</option>
    <option value="atPin"${selectedMode === "atPin" ? " selected" : ""}${hasPin ? "" : " disabled"}>${pinLabel}</option>
  `;
}

function resolveBoTimingModeSelection(mode, fallbackAtTime = 0) {
  if (mode === "atPin") {
    return {
      timeMode: "atTime",
      atTime: Number.isFinite(boPinnedTime) ? Math.max(0, boPinnedTime) : Math.max(0, fallbackAtTime || 0)
    };
  }
  return {
    timeMode: mode === "atTime" ? "atTime" : "afterPrev",
    atTime: Math.max(0, fallbackAtTime || 0)
  };
}

function readBoSettings() {
  const getNum = (id, def = 0) => parseFloat(document.getElementById(id)?.value) || def;
  const start = BO_STARTING?.resources || {};
  const civ = getBoSelectedCiv();
  const boarRestricted = isBoNoBoarCiv(civ);
  return {
    civ,
    startAge: parseInt(document.getElementById("boStartAge")?.value, 10) || 1,
    resources: {
      food: getNum("boStartFood", start.food ?? 200),
      wood: getNum("boStartWood", start.wood ?? 150),
      gold: getNum("boStartGold", start.gold ?? 100),
      stone: getNum("boStartStone", start.stone ?? 0),
      oliveOil: getNum("boStartOlive", 0),
      silver: getNum("boStartSilver", 0)
    },
    foodNodes: {
      sheep: {
        count: Math.max(0, Math.floor(getNum("boSheepCount", BO_STARTING?.sheep ?? BO_DEFAULT_NODE_COUNTS.sheep))),
        amount: Math.max(0, getNum("boSheepFood", BO_NODE_AMOUNTS?.sheep ?? 200))
      },
      berries: {
        count: Math.max(0, Math.floor(getNum("boBerriesCount", BO_DEFAULT_NODE_COUNTS.berries))),
        amount: Math.max(0, getNum("boBerriesFood", BO_NODE_AMOUNTS?.berries ?? 250))
      },
      deer: {
        count: Math.max(0, Math.floor(getNum("boDeerCount", BO_DEFAULT_NODE_COUNTS.deer))),
        amount: Math.max(0, getNum("boDeerFood", BO_NODE_AMOUNTS?.deer ?? 350))
      },
      boar: {
        count: boarRestricted ? 0 : Math.max(0, Math.floor(getNum("boBoarCount", BO_DEFAULT_NODE_COUNTS.boar))),
        amount: Math.max(0, getNum("boBoarFood", BO_NODE_AMOUNTS?.boar ?? 2400))
      }
    },
    boarRestricted,
    villagers: Math.max(1, Math.floor(getNum("boStartVills", BO_STARTING_VILLAGERS))),
    gatherRates: {
      berries: getNum("boRateBerries", BO_BASE_RATES.berries),
      deer: getNum("boRateDeer", BO_BASE_RATES.deer),
      boar: boarRestricted ? 0 : getNum("boRateBoar", BO_BASE_RATES.boar),
      sheep: getNum("boRateSheep", BO_BASE_RATES.sheep),
      farm: getNum("boRateFarm", BO_BASE_RATES.farm),
      wood: getNum("boRateWood", BO_BASE_RATES.wood),
      gold: getNum("boRateGold", BO_BASE_RATES.gold),
      stone: getNum("boRateStone", BO_BASE_RATES.stone)
    },
    carry: {
      sheep: getNum("boCarrySheep", BO_DEFAULT_CARRY.sheep),
      berries: getNum("boCarryBerries", BO_DEFAULT_CARRY.berries),
      deer: getNum("boCarryDeer", BO_DEFAULT_CARRY.deer),
      boar: getNum("boCarryBoar", BO_DEFAULT_CARRY.boar),
      farm: getNum("boCarryFarm", BO_DEFAULT_CARRY.farm),
      wood: getNum("boCarryWood", BO_DEFAULT_CARRY.wood),
      gold: getNum("boCarryGold", BO_DEFAULT_CARRY.gold),
      stone: getNum("boCarryStone", BO_DEFAULT_CARRY.stone)
    },
    trip: {
      sheep: BO_DEFAULT_TRIP.sheep,
      berries: BO_DEFAULT_TRIP.berries,
      deer: BO_DEFAULT_TRIP.deer,
      boar: boarRestricted ? 0 : BO_DEFAULT_TRIP.boar,
      farm: BO_DEFAULT_TRIP.farm,
      wood: BO_DEFAULT_TRIP.wood,
      gold: BO_DEFAULT_TRIP.gold,
      stone: BO_DEFAULT_TRIP.stone
    },
    bonusData: {
      civBonuses: BO_CIV_BONUSES,
      noBoarCivs: getBoNoBoarCivSet(),
      sacredSiteGoldPerMin: BO_SACRED_SITE_GOLD_PER_MIN,
      pastureSheepSeconds: BO_PASTURE_SHEEP_SECONDS,
      ovooStonePerMinByAge: BO_OVOO_STONE_PER_MIN_BY_AGE,
      scholar: BO_SCHOLAR,
      buildingDefaults: BO_BUILDING_DEFAULTS,
      techDefaults: BO_TECH_DEFAULTS
    },
    techEffects: {
      wheelCarryBonus: BO_WHEEL_CARRY_BONUS,
      wheelTripMult: BO_WHEEL_TRIP_MULT,
      foodUpgradeMult: BO_FOOD_UPGRADE_MULT
    },
    simEnd: Math.max(0, getNum("boSimEnd", 300))
  };
}

function simulateBuildOrder(commands, config) {
  normalizeBoCommands(commands);
  let time = 0;
  let age = config.startAge;
  const civ = config.civ || "";
  const bonusData = config.bonusData || {};
  const civBonus = bonusData.civBonuses?.[civ] || BO_CIV_BONUSES?.[civ] || {};
  const noBoarCiv = bonusData.noBoarCivs ? bonusData.noBoarCivs.has(civ) : isBoNoBoarCiv(civ);
  const berryBonus = getBoBerryBonusConfig(civ);
  const howCiv = isBoHouseOfWisdomCiv(civ);
  const howConfig = civBonus.houseOfWisdom || getBoHouseOfWisdomConfig(civ) || null;
  const sacredSiteGoldPerMin = bonusData.sacredSiteGoldPerMin ?? BO_SACRED_SITE_GOLD_PER_MIN;
  const pastureSheepSeconds = bonusData.pastureSheepSeconds ?? BO_PASTURE_SHEEP_SECONDS;
  const ovooStonePerMinByAge = bonusData.ovooStonePerMinByAge || BO_OVOO_STONE_PER_MIN_BY_AGE;
  const scholarInfo = bonusData.scholar || BO_SCHOLAR;
  let villagers = config.villagers;
  let assignments = { berries: 0, deer: 0, boar: 0, sheep: 0, farm: 0, wood: 0, gold: 0, stone: 0, idle: villagers };
  let resources = { ...config.resources };
  const foodNodes = config.foodNodes || {};
  const foodRemaining = {
    sheep: Math.max(0, (foodNodes.sheep?.count || 0) * (foodNodes.sheep?.amount || 0)),
    berries: Math.max(0, (foodNodes.berries?.count || 0) * (foodNodes.berries?.amount || 0)),
    deer: Math.max(0, (foodNodes.deer?.count || 0) * (foodNodes.deer?.amount || 0)),
    boar: Math.max(0, (foodNodes.boar?.count || 0) * (foodNodes.boar?.amount || 0))
  };
  let berryCapacityBonusApplied = 0;
  const held = { sheep: 0, berries: 0, deer: 0, boar: 0, farm: 0, wood: 0, gold: 0, stone: 0 };
  let tripOverrides = {};
  const researchedTechs = new Set();
  const buildingCounts = {
    "Town Center": 1,
    [BO_HOUSE_OF_WISDOM_BUILDING]: howCiv ? 1 : 0,
    "Mill": 0,
    "Lumber Camp": 0,
    "Mining Camp": 0,
    "Barracks": 0,
    "Archery Range": 0,
    "Stable": 0,
    "Siege Workshop": 0,
    "Keep": 0,
    "University": 0,
    "Military School": 0,
    "Mosque": 0,
    "Farm": 0,
    "Pasture": 0,
    "Ger": 0,
    "Ovoo": 0,
    "House": 0,
    "Manor": 0,
    "Dock": 0,
    "Market": 0,
    "Outpost": 0,
    "Blacksmith": 0,
    "Farmhouse": 0,
    "Forge": 0,
    "Buddhist Temple": 0,
    "Shinto Shrine": 0,
    "Kura Storehouse": 0,
    "Temple of Equality": 0,
    "Floating Gate": 0,
    "Koka Township": 0,
    "Castle of the Crow": 0,
    "Tanegashima Gunsmith": 0
  };
  const productionQueues = {
    "Town Center": [{ id: "TC #1", busyUntil: 0 }],
    "Barracks": [],
    "Archery Range": [],
    "Stable": [],
    "Siege Workshop": [],
    "Military School": []
  };
  const buildingInstances = {};
  Object.keys(buildingCounts).forEach((name) => {
    if (name === "Town Center") buildingInstances[name] = ["TC #1"];
    else if (name === BO_HOUSE_OF_WISDOM_BUILDING && howCiv) buildingInstances[name] = [BO_HOUSE_OF_WISDOM_BUILDING];
    else buildingInstances[name] = [];
  });
  let farmCount = 0;
  let pastureCount = 0;
  let ovooCount = 0;
  let gerCount = 0;
  let workerElephantCount = 0;
  let highTradeHouseCount = 0;
  let kuraStorehouseCount = 0;
  let kuraGeneratedFarms = 0;
  let kuraPassiveSeconds = 0;
  let japaneseBuddhistMonkCount = 0;
  let malianCattleCount = 0;
  let sacredSites = 0;
  let scholarGarrison = 0;
  let sanctityActive = false;
  let enlistmentActive = false;
  let domeActive = false;
  let wheelbarrowActive = false;
  let foodTechLevel = 0;
  let survivalTechActive = false;
  let tcBusyUntil = 0;
  const timeline = [];
  const samples = [];
  const gatherSegments = [];
  const villagerMarkers = [];
  const gatheredTotals = { food: 0, wood: 0, gold: 0, stone: 0, oliveOil: 0, silver: 0 };
  const gatherActive = {};
  const milestones = {};
  const warnings = [];
  const busy = [];
  const autoQueues = [];
  const finiteQueues = [];
  const buildQueues = [];
  const dropoffCohorts = Object.fromEntries(BO_RESOURCE_KEYS.map((res) => [res, []]));
  let nextDropoffCohortId = 1;
  let advanceFiniteReservation = null;
  let rusBountyTotal = 0;
  let vizierXp = 0;
  const vizierChoices = [];
  const vizierChoiceSet = new Set();
  let imperialPalaceCompleted = false;
  let paxOttomanaUntil = 0;
  let greatBombardNeedsImperialUpgrade = false;
  let houseOfWisdomBusyUntil = 0;
  const houseOfWisdomState = {
    wings: [],
    effects: {
      preservationOfKnowledge: false,
      fertileCrescent: false,
      agriculture: false,
      improvedProcessing: false,
      medicalCenters: false,
      publicLibraries: false,
      bootCamp: false,
      compositeBows: false,
      camelSupport: false,
      armoredCaravans: false,
      grandBazaar: false,
      spiceRoads: false,
      villagerWorkRatePct: 0,
      orchardExtraPerNode: 0,
      buildSpeedPct: 0,
      masterSmiths: false,
      militaryAcademy: false,
      logistics: false,
      reinforcementCount: 0,
      advisors: false,
      bazaar: false
    }
  };

  function getOttomanActiveEffects(now = time) {
    const effects = {
      militaryCampus: vizierChoiceSet.has("militaryCampus"),
      advancedAcademy: vizierChoiceSet.has("advancedAcademy"),
      anatolianHills: vizierChoiceSet.has("anatolianHills"),
      akinjiSystem: vizierChoiceSet.has("akinjiSystem"),
      extensiveFortifications: vizierChoiceSet.has("extensiveFortifications"),
      fieldWork: vizierChoiceSet.has("fieldWork"),
      mehterDrums: vizierChoiceSet.has("mehterDrums"),
      janissaryCompany: vizierChoiceSet.has("janissaryCompany"),
      siegeCrews: vizierChoiceSet.has("siegeCrews"),
      greatBombard: vizierChoiceSet.has("greatBombard"),
      paxOttomana: now <= paxOttomanaUntil + 0.0001,
      imperialPalace: imperialPalaceCompleted
    };
    return effects;
  }

  function getOttomanVizierCap() {
    return imperialPalaceCompleted ? 8 : 5;
  }

  function getOttomanVizierPointsEarned() {
    return getBoOttomanVizierPointsEarned(vizierXp, getOttomanVizierCap());
  }

  function getOttomanVizierPointsAvailable() {
    return Math.max(0, getOttomanVizierPointsEarned() - vizierChoices.length);
  }

  function getOttomanVizierNextThreshold() {
    const earned = getOttomanVizierPointsEarned();
    if (earned >= getOttomanVizierCap()) return null;
    return BO_OTTOMAN_VIZIER_THRESHOLDS[earned] ?? null;
  }

  function addOttomanVizierXp(amount, options = {}) {
    if (civ !== "Ottomans") return;
    const gain = Math.max(0, amount || 0);
    if (!gain) return;
    const doubled = options.allowImperialPalaceDouble && imperialPalaceCompleted;
    vizierXp += doubled ? gain * 2 : gain;
  }

  function getOttomanVizierChoiceIssue(choiceId) {
    const choice = getBoOttomanChoiceDef(choiceId);
    if (civ !== "Ottomans") return "Blocked (Ottomans only)";
    if (!choice) return "Blocked (unknown Vizier choice)";
    if (choice.modeled === false) return choice.effectNote || "Blocked (not modeled)";
    if (vizierChoiceSet.has(choiceId)) return "Blocked (already chosen)";
    if (getOttomanVizierPointsAvailable() <= 0) return "Blocked (no Vizier point available)";
    if (choice.level > 1) {
      const previousLevel = choice.level - 1;
      const hasPreviousChoice = vizierChoices.some((entry) => getBoOttomanChoiceDef(entry.id)?.level === previousLevel);
      if (!hasPreviousChoice) return `Blocked (choose a Level ${previousLevel} Vizier point first)`;
    }
    return null;
  }

  function getOttomanVizierSpawnNote(choiceId) {
    if (choiceId === "fieldWork") return "Spawn 2 Imams at the Capital Town Center";
    if (choiceId === "mehterDrums") return "Spawn 2 Mehters at the Capital Town Center";
    if (choiceId === "akinjiSystem") return "Spawn 3 Akinji at the Capital Town Center";
    if (choiceId === "janissaryCompany") {
      const total = 2 + ((buildingCounts[BO_OTTOMAN_MILITARY_SCHOOL_BUILDING] || 0) * 2);
      return `Spawn ${total} Janissaries at the Capital Town Center`;
    }
    if (choiceId === "greatBombard") {
      return age >= 4
        ? "Spawn 1 Great Bombard at the Capital Town Center"
        : "Spawn 1 Great Bombard at the Capital Town Center (weaker before Imperial Age)";
    }
    return null;
  }

  function countGoldenAgeBuildings() {
    if (!howCiv) return 0;
    return Object.entries(buildingCounts).reduce((sum, [name, count]) => {
      const safeCount = Math.max(0, count || 0);
      if (!safeCount) return sum;
      if (name === "Farm") return sum;
      if (/wall/i.test(name)) return sum;
      return sum + safeCount;
    }, 0);
  }

  function getHouseOfWisdomGoldenAgeNow() {
    return howCiv ? getBoHouseOfWisdomGoldenAgeState(civ, countGoldenAgeBuildings()) : { count: 0, tier: 0, bonuses: {} };
  }

  function getHouseOfWisdomEffects() {
    const goldenAge = getHouseOfWisdomGoldenAgeNow();
    return {
      ...houseOfWisdomState.effects,
      goldenAge
    };
  }

  function getHouseOfWisdomResearchPct() {
    return getHouseOfWisdomEffects().goldenAge?.bonuses?.researchPct || 0;
  }

  function getHouseOfWisdomProductionPct() {
    return getHouseOfWisdomEffects().goldenAge?.bonuses?.productionPct || 0;
  }

  function getSimTechDef(techType) {
    const def = getBoTechDefaults(techType) || {};
    return { ...def, name: techType };
  }

  function isTechResearched(techType) {
    return researchedTechs.has(techType);
  }

  function isHouseOfWisdomWingChosen(wing) {
    return houseOfWisdomState.wings.some((entry) => entry?.wing === wing);
  }

  function getTughlaqWorkerElephantBonusLevel() {
    let level = 0;
    if (isTechResearched("Woven Baskets")) level += 1;
    if (isTechResearched("Carrying Frame")) level += 1;
    if (isTechResearched("Elephant Harness")) level += 1;
    return level;
  }

  function getJapaneseFarmhouseTechLevel() {
    let level = 0;
    if (isTechResearched("Tawara")) level = 1;
    if (isTechResearched("Takezaiku")) level = 2;
    if (isTechResearched("Fudasashi")) level = 3;
    return level;
  }

  function getJapaneseDaimyoTier() {
    let tier = 0;
    if (isTechResearched("Daimyo Manor")) tier = 1;
    if (isTechResearched("Daimyo Palace")) tier = 2;
    if (isTechResearched("Shogunate Castle")) tier = 3;
    return tier;
  }

  function getJapaneseSilverMiningPct() {
    return civ === "Japanese" ? Math.max(0, civBonus.silverMiningPct || 0) : 0;
  }

  function getJapaneseZenGoldPerSec() {
    if (civ !== "Japanese" || !isTechResearched("Zen")) return 0;
    return japaneseBuddhistMonkCount * ((civBonus.zenGoldPerMinPerMonk || 25) / 60);
  }

  function addJapaneseSilverMiningBonus(res, droppedAmount) {
    if (civ !== "Japanese") return 0;
    const pct = getJapaneseSilverMiningPct();
    if (!pct || !Number.isFinite(droppedAmount) || droppedAmount <= 0) return 0;
    const bonus = droppedAmount * (pct / 100);
    if (res === "gold") {
      resources.stone += bonus;
      addGathered("stone", bonus);
      return bonus;
    }
    if (res === "stone") {
      resources.gold += bonus;
      addGathered("gold", bonus);
      return bonus;
    }
    return 0;
  }

  function addJapaneseSilverMiningArrival(arrivalMap, timeVal, res, droppedAmount) {
    if (civ !== "Japanese") return;
    const pct = getJapaneseSilverMiningPct();
    if (!pct || !Number.isFinite(timeVal) || !Number.isFinite(droppedAmount) || droppedAmount <= 0) return;
    const roundedTime = Math.round(timeVal * 1000) / 1000;
    const mapKey = roundedTime.toFixed(3);
    if (!arrivalMap.has(mapKey)) {
      arrivalMap.set(mapKey, { time: roundedTime, food: 0, wood: 0, gold: 0, stone: 0 });
    }
    if (res === "gold") arrivalMap.get(mapKey).stone += droppedAmount * (pct / 100);
    if (res === "stone") arrivalMap.get(mapKey).gold += droppedAmount * (pct / 100);
  }

  function grantJapaneseKuraTick(now, count = 1) {
    const ticks = Math.max(0, Math.floor(count || 0));
    if (ticks <= 0) return;
    for (let i = 0; i < ticks; i++) {
      const farmCap = Math.max(0, kuraStorehouseCount * (civBonus.kuraFarmCapPerStorehouse || 12));
      if (kuraGeneratedFarms < farmCap) {
        kuraGeneratedFarms += 1;
        farmCount += 1;
        if ((assignments.farm || 0) > 0) syncDropoffCohorts(["farm"], now);
      } else {
        const woodGain = civBonus.kuraOverflowWood || 38;
        resources.wood += woodGain;
        addGathered("wood", woodGain);
      }
    }
  }

  function getMalianPitMineSupportBuildings() {
    if (civ !== "Malians") return 0;
    const pitMines = Math.max(0, buildingCounts["Pit Mine"] || 0);
    if (pitMines <= 0) return 0;
    const supportPool = Math.max(0, (buildingCounts["House"] || 0) + (buildingCounts["Mining Camp"] || 0));
    const supportCap = Math.max(0, pitMines * (civBonus.pitMineSupportCapPerMine || 8));
    return Math.min(supportPool, supportCap);
  }

  function getMalianPitMineGoldPerSec() {
    if (civ !== "Malians") return 0;
    const pitMines = Math.max(0, buildingCounts["Pit Mine"] || 0);
    if (pitMines <= 0) return 0;
    const basePerSec = (civBonus.pitMineGoldPerMin || 36) / 60;
    const supportPct = (civBonus.pitMineSupportPct || 25) / 100;
    return (pitMines * basePerSec) + (getMalianPitMineSupportBuildings() * basePerSec * supportPct);
  }

  function getMalianGarrisonedCattleCount() {
    if (civ !== "Malians") return 0;
    const ranchCapacity = Math.max(0, (buildingCounts["Cattle Ranch"] || 0) * (civBonus.cattleRanchCapacity || 3));
    return Math.min(Math.max(0, malianCattleCount || 0), ranchCapacity);
  }

  function getMalianCattleFoodPerSec() {
    if (civ !== "Malians") return 0;
    const garrisoned = getMalianGarrisonedCattleCount();
    if (garrisoned <= 0) return 0;
    return garrisoned * ((civBonus.cattleRanchFoodPerMinPerCattle || 25) / 60) * foodMult();
  }

  function getMalianGrandFulaniFoodPerSec() {
    if (civ !== "Malians" || (buildingCounts["Grand Fulani Corral"] || 0) <= 0) return 0;
    const garrisoned = getMalianGarrisonedCattleCount();
    if (garrisoned <= 0) return 0;
    return garrisoned * ((civBonus.grandFulaniFoodPerMinPerCattle || 18) / 60);
  }

  function getMalianMansaQuarryGoldPerSec() {
    if (civ !== "Malians") return 0;
    const quarries = Math.max(0, buildingCounts["Mansa Quarry"] || 0);
    if (quarries <= 0) return 0;
    return quarries * ((civBonus.mansaQuarryGoldPerMin || 75) / 60);
  }

  function getRusBountyStateNow() {
    return getBoRusBountyState(civ, rusBountyTotal);
  }

  function getRusBountyGoldFromHarvest(res, harvestedAmount) {
    const bountyState = getRusBountyStateNow();
    if (!bountyState.goldPerFood || !bountyState.foodResources.includes(res)) return 0;
    return harvestedAmount * bountyState.goldPerFood;
  }

  function addRusBountyGold(res, harvestedAmount) {
    const bonusGold = getRusBountyGoldFromHarvest(res, harvestedAmount);
    if (bonusGold <= 0) return 0;
    resources.gold += bonusGold;
    rusBountyTotal += bonusGold;
    addGathered("gold", bonusGold);
    return bonusGold;
  }

  function getDropoffReturnMult(res = null) {
    let mult = houseOfWisdomState.effects.improvedProcessing ? 1.08 : 1;
    if (civ === "Tughlaq Dynasty") {
      mult *= 1 + (getTughlaqWorkerElephantBonusLevel() * 0.05);
    }
    if (civ === "Rus" && res === "wood" && ((buildingCounts["Wooden Fortress"] || 0) > 0 || (buildingCounts["Kremlin"] || 0) > 0)) {
      mult *= 1 + ((civBonus.woodDropoffPct || 0) / 100);
    }
    return mult;
  }

  function hasActiveBerryBonus() {
    if (!berryBonus) return false;
    if (berryBonus.requiresMill === false) return true;
    return (buildingCounts["Mill"] || 0) > 0;
  }

  function getBerryCapacityBonusPerNode() {
    if (!hasActiveBerryBonus()) return 0;
    return Math.max(0, berryBonus.capacityBonusPerNode || 0) + Math.max(0, houseOfWisdomState.effects.orchardExtraPerNode || 0);
  }

  function syncBerryCapacityBonus() {
    const desired = getBerryCapacityBonusPerNode() * Math.max(0, foodNodes.berries?.count || 0);
    if (Math.abs(desired - berryCapacityBonusApplied) <= 0.0001) return;
    foodRemaining.berries = Math.max(0, (foodRemaining.berries || 0) + (desired - berryCapacityBonusApplied));
    berryCapacityBonusApplied = desired;
  }

  function isSiegeUnit(unitName) {
    const resolved = resolveBoUnitName(unitName);
    const direct = new Set(["Battering Ram", "Ram", "Springald", "Mangonel", "Counterweight Trebuchet", "Trebuchet", "Ribauldequin", "Great Bombard"]);
    if (direct.has(unitName) || direct.has(resolved)) return true;
    const unitMeta = getUnitMeta(resolved);
    return Array.isArray(unitMeta?.tags) ? unitMeta.tags.includes("Siege") : false;
  }

  function getHouseOfWisdomSampleState() {
    const goldenAge = getHouseOfWisdomGoldenAgeNow();
    const effects = { ...houseOfWisdomState.effects };
    return {
      wings: houseOfWisdomState.wings.map((entry) => ({ ...entry })),
      effects,
      goldenAge
    };
  }

  function getManualDropoffSnapshot(now) {
    const heldResources = { food: 0, wood: 0, gold: 0, stone: 0, oliveOil: 0, silver: 0 };
    const arrivalMap = new Map();
    const addArrival = (timeVal, key, amount) => {
      if (!Number.isFinite(timeVal) || !Number.isFinite(amount) || amount <= 0) return;
      const roundedTime = Math.round(timeVal * 1000) / 1000;
      const mapKey = roundedTime.toFixed(3);
      if (!arrivalMap.has(mapKey)) {
        arrivalMap.set(mapKey, { time: roundedTime, food: 0, wood: 0, gold: 0, stone: 0 });
      }
      arrivalMap.get(mapKey)[key] += amount;
    };

    BO_RESOURCE_KEYS.forEach((res) => {
      const bankKey = isFood(res) ? "food" : res;
      const dropoffMult = getDropoffReturnMult(res);
      getResourceCohorts(res).forEach((cohort) => {
        if (!cohort || (cohort.count || 0) <= 0 || cohort.phase === "toResource") return;
        const carryPerVill = (cohort.phase === "toDropoff" || cohort.phase === "dropoff")
          ? Math.max(0, cohort.phaseStartCarry || cohort.phaseEndCarry || 0)
          : Math.max(0, getCohortCarryNow(cohort, now));
        const totalCarry = carryPerVill * Math.max(0, cohort.count || 0) * dropoffMult;
        if (totalCarry <= 0.0001) return;
        heldResources[bankKey] += totalCarry;
        const rawFoodCarry = carryPerVill * Math.max(0, cohort.count || 0);
        const bountyGold = getRusBountyGoldFromHarvest(res, rawFoodCarry);
        if (bountyGold > 0) heldResources.gold += bountyGold;
        const arrivalTime = cohort.phase === "toDropoff"
          ? Math.max(now, cohort.phaseEndsAt || now) + BO_DROPOFF_ANIMATION_SEC
          : cohort.phase === "dropoff"
            ? Math.max(now, cohort.phaseEndsAt || now)
            : now + effectiveTrip(res) + BO_DROPOFF_ANIMATION_SEC;
        addArrival(arrivalTime, bankKey, totalCarry);
        addJapaneseSilverMiningArrival(arrivalMap, arrivalTime, res, totalCarry);
        if (bountyGold > 0) addArrival(arrivalTime, "gold", bountyGold);
      });

      const legacyHeld = Math.max(0, held[res] || 0);
      if (legacyHeld > 0) {
        const totalHeld = legacyHeld * dropoffMult;
        heldResources[bankKey] += totalHeld;
        const bountyGold = getRusBountyGoldFromHarvest(res, legacyHeld);
        if (bountyGold > 0) heldResources.gold += bountyGold;
        if (dropoffAvailable(res)) {
          const arrivalTime = now + effectiveTrip(res) + BO_DROPOFF_ANIMATION_SEC;
          addArrival(arrivalTime, bankKey, totalHeld);
          addJapaneseSilverMiningArrival(arrivalMap, arrivalTime, res, totalHeld);
          if (bountyGold > 0) addArrival(arrivalTime, "gold", bountyGold);
        }
      }
    });

    return {
      heldResources,
      manualDropoffEvents: Array.from(arrivalMap.values()).sort((a, b) => a.time - b.time)
    };
  }

  function pushSample(t, res) {
    const rounded = Math.round(t * 1000) / 1000;
    const existing = samples.find((s) => Math.abs(s.time - rounded) < 0.0005);
    const gatherSpeedSnapshot = {};
    BO_RESOURCE_KEYS.forEach((key) => {
      gatherSpeedSnapshot[key] = gatherRate(key);
    });
    const actualIncomeRates = getIncomeRates();
    const manualDropoffSnapshot = getManualDropoffSnapshot(rounded);
    const ottomanEffects = getOttomanActiveEffects(rounded);
    const vizierCap = getOttomanVizierCap();
    const vizierPointsEarned = getOttomanVizierPointsEarned();
    const vizierPointsSpent = vizierChoices.length;
    const payload = {
      time: rounded,
      age,
      food: res.food,
      wood: res.wood,
      gold: res.gold,
      stone: res.stone,
      oliveOil: res.oliveOil,
      silver: res.silver,
      rates: gatherSpeedSnapshot,
      gatherSpeeds: gatherSpeedSnapshot,
      actualIncomeRates: {
        food: actualIncomeRates.food || 0,
        wood: actualIncomeRates.wood || 0,
        gold: actualIncomeRates.gold || 0,
        stone: actualIncomeRates.stone || 0,
        oliveOil: 0,
        silver: 0
      },
      buildingCounts: { ...buildingCounts },
      farmCount,
      houseCount: Math.max(0, (buildingCounts["House"] || 0) + (buildingCounts["Farmhouse"] || 0)),
      manorCount: Math.max(0, buildingCounts["Manor"] || 0),
      workerElephantCount,
      villagers,
      assignments: { ...assignments },
      researchedTechs: Array.from(researchedTechs).sort(),
      heldResources: manualDropoffSnapshot.heldResources,
      manualDropoffEvents: manualDropoffSnapshot.manualDropoffEvents,
      houseOfWisdom: getHouseOfWisdomSampleState(),
      rus: {
        bountyTotal: rusBountyTotal,
        bountyTier: getRusBountyStateNow().tier,
        foodGatherPct: getRusBountyStateNow().foodGatherPct
      },
      japanese: {
        farmhouseTechLevel: getJapaneseFarmhouseTechLevel(),
        daimyoTier: getJapaneseDaimyoTier(),
        kuraStorehouseCount,
        kuraGeneratedFarms,
        buddhistMonkCount: japaneseBuddhistMonkCount,
        zenGoldPerSec: getJapaneseZenGoldPerSec()
      },
      malians: {
        pitMineCount: Math.max(0, buildingCounts["Pit Mine"] || 0),
        pitMineSupportBuildings: getMalianPitMineSupportBuildings(),
        pitMineGoldPerSec: getMalianPitMineGoldPerSec(),
        cattleCount: Math.max(0, malianCattleCount || 0),
        garrisonedCattle: getMalianGarrisonedCattleCount(),
        cattleRanchCount: Math.max(0, buildingCounts["Cattle Ranch"] || 0),
        cattleFoodPerSec: getMalianCattleFoodPerSec(),
        grandFulaniCorralCount: Math.max(0, buildingCounts["Grand Fulani Corral"] || 0),
        grandFulaniFoodPerSec: getMalianGrandFulaniFoodPerSec(),
        mansaQuarryCount: Math.max(0, buildingCounts["Mansa Quarry"] || 0),
        mansaQuarryGoldPerSec: getMalianMansaQuarryGoldPerSec()
      },
      vizier: {
        xp: vizierXp,
        cap: vizierCap,
        pointsEarned: vizierPointsEarned,
        pointsSpent: vizierPointsSpent,
        pointsAvailable: Math.max(0, vizierPointsEarned - vizierPointsSpent),
        nextThreshold: getOttomanVizierNextThreshold(),
        imperialPalace: imperialPalaceCompleted,
        choices: vizierChoices.map((entry) => entry.id),
        effects: ottomanEffects
      }
    };
    if (existing) Object.assign(existing, payload);
    else samples.push(payload);
  }

  function addGathered(resourceKey, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (gatheredTotals[resourceKey] === undefined) gatheredTotals[resourceKey] = 0;
    gatheredTotals[resourceKey] += amount;
  }

  function isGathering(res) {
    const assigned = res === "farm"
      ? Math.min(assignments.farm || 0, farmCount)
      : (assignments[res] || 0);
    if (assigned <= 0) return false;
    if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) return false;
    if (res === "farm" && farmCount <= 0) return false;
    const rate = gatherRate(res);
    if (rate <= 0) return false;
    if (!dropoffAvailable(res)) return false;
    return true;
  }

  function syncGatherSegments(now) {
    BO_RESOURCE_KEYS.forEach((res) => {
      const assigned = res === "farm"
        ? Math.min(assignments.farm || 0, farmCount)
        : (assignments[res] || 0);
      const active = isGathering(res);
      const current = gatherActive[res];
      if (active) {
        if (!current || current.count !== assigned) {
          if (current) {
            current.end = now;
            gatherSegments.push(current);
          }
          gatherActive[res] = { resource: res, start: now, end: now, count: assigned };
        }
      } else if (current) {
        current.end = now;
        gatherSegments.push(current);
        gatherActive[res] = null;
      }
    });
  }

  function finalizeGatherSegments(finalTime) {
    BO_RESOURCE_KEYS.forEach((res) => {
      const current = gatherActive[res];
      if (current) {
        current.end = finalTime;
        gatherSegments.push(current);
        gatherActive[res] = null;
      }
    });
  }

  function laneFor(cmd) {
    if (cmd.type === "assign") return "Assignments";
    if (cmd.type === "houseOfWisdomWing") return BO_HOUSE_OF_WISDOM_BUILDING;
    if (cmd.type === "resourceTrip") return getBoResourceLabel(cmd.payload?.resource);
    if (cmd.type === "vizierChoice") return BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING;
    if (cmd.type === "buildBuilding") return "Construction";
    if (cmd.type === "tech") return cmd.payload?.buildingId || cmd.payload?.building || "Tech";
    if (cmd.type === "rally") return "TC #1";
    if (cmd.type === "trainUnit") return cmd.payload.buildingId || cmd.payload.building || "Production";
    if (cmd.type === "autoQueue") return cmd.payload.buildingId || cmd.payload.building || "Production";
    if (cmd.type === "sacredSite") return "Sacred";
    if (cmd.type === "garrisonScholars") return "Mosque";
    return "General";
  }

  function pushEvent(action, notes = "", lane = "General", commandId = null) {
    const resBefore = { ...resources };
    timeline.push({
      start: time,
      end: time,
      action,
      notes,
      lane,
      commandId,
      before: resBefore,
      after: { ...resources }
    });
    pushSample(time, resBefore);
    pushSample(time, resources);
  }

  function addHouseOfWisdomWingEntry(wing, branch, targetAge, completedAt) {
    houseOfWisdomState.wings.push({
      wing,
      branch: branch || null,
      targetAge,
      completedAt
    });
  }

  function applyHouseOfWisdomCompletion(entry, completedAt) {
    if (!howCiv || !entry) return;
    const targetAge = Math.max(2, entry.targetAge || age);
    addHouseOfWisdomWingEntry(entry.wing, entry.branch, targetAge, completedAt);
    const label = getBoHouseOfWisdomWingLabel(civ, entry.wing, entry.branch);
    const notes = [];

    if (age < targetAge) {
      age = targetAge;
      milestones[`Age ${age} complete`] = completedAt;
    }

    if (civ === "Abbasid Dynasty") {
      const wingDef = BO_ABBASID_HOW_WINGS[entry.wing];
      const unlocked = Object.keys(wingDef?.choicesByAge || {})
        .map((ageKey) => parseInt(ageKey, 10))
        .filter((ageKey) => ageKey <= targetAge)
        .sort((a, b) => a - b)
        .flatMap((ageKey) => wingDef?.choicesByAge?.[ageKey] || []);
      if (wingDef?.spawnByAge?.[targetAge]) notes.push(wingDef.spawnByAge[targetAge]);
      if (unlocked.length) {
        notes.push(`Unlocks: ${unlocked.map((choiceId) => BO_ABBASID_HOW_CHOICE_DEFS[choiceId]?.label || choiceId).join(" | ")}`);
      }
    } else if (civ === "Ayyubids") {
      if (entry.wing === "culture" && entry.branch === "logistics") {
        houseOfWisdomState.effects.logistics = true;
        notes.push(targetAge === 2 ? "Spawn 2 Dervishes" : targetAge === 3 ? "Spawn 3 Dervishes" : "Spawn 4 Dervishes");
      }
      if (entry.wing === "economic" && entry.branch === "growth") {
        const villagerSpawns = targetAge === 2 ? 3 : targetAge === 3 ? 7 : 10;
        villagers += villagerSpawns;
        assignments.idle += villagerSpawns;
        if (targetAge === 2) houseOfWisdomState.effects.orchardExtraPerNode = 50;
        if (targetAge === 3) houseOfWisdomState.effects.orchardExtraPerNode = 100;
        if (targetAge === 4) houseOfWisdomState.effects.villagerWorkRatePct = 10;
        syncBerryCapacityBonus();
        notes.push(`Spawn ${villagerSpawns} Villagers`);
        if (targetAge === 2) notes.push("Orchards +50 food per berry bush");
        if (targetAge === 3) notes.push("Orchards +100 food per berry bush");
        if (targetAge === 4) notes.push("Villagers +10% work rate");
      }
      if (entry.wing === "economic" && entry.branch === "industry") {
        if (targetAge === 2) {
          resources.wood += 400;
          houseOfWisdomState.effects.buildSpeedPct = 30;
          notes.push("Grant 400 wood");
        } else if (targetAge === 3) {
          resources.wood += 900;
          resources.stone += 400;
          houseOfWisdomState.effects.buildSpeedPct = 40;
          notes.push("Grant 900 wood and 400 stone");
        } else {
          resources.wood += 2000;
          resources.stone += 1000;
          houseOfWisdomState.effects.buildSpeedPct = 50;
          notes.push("Grant 2000 wood and 1000 stone");
        }
        notes.push(`Villagers build +${houseOfWisdomState.effects.buildSpeedPct}% faster`);
      }
      if (entry.wing === "military" && entry.branch === "masterSmiths") {
        houseOfWisdomState.effects.masterSmiths = true;
        if (targetAge >= 3) houseOfWisdomState.effects.militaryAcademy = true;
        notes.push("Free Blacksmith upgrades unlocked");
        if (houseOfWisdomState.effects.militaryAcademy) notes.push("Military Academy granted");
      }
      if (entry.wing === "military" && entry.branch === "reinforcement") {
        const waveCount = targetAge === 2 ? 1 : targetAge === 3 ? 3 : 7;
        houseOfWisdomState.effects.reinforcementCount = waveCount;
        if (targetAge === 2) {
          busy.push({
            endTime: completedAt + 15,
            kind: "houseOfWisdomReinforcement",
            count: waveCount,
            repeatEvery: 120
          });
          notes.push("Spawn 1 Desert Raider after 15s, then every 120s");
        } else {
          pushEvent("Desert Raiders arrive", `Spawn ${waveCount} Desert Raiders`, BO_HOUSE_OF_WISDOM_BUILDING);
          busy.push({
            endTime: completedAt + 120,
            kind: "houseOfWisdomReinforcement",
            count: waveCount,
            repeatEvery: 120
          });
          notes.push(`Spawn ${waveCount} Desert Raiders now, then every 120s`);
        }
      }
      if (entry.wing === "trade" && entry.branch === "advisors") {
        houseOfWisdomState.effects.advisors = true;
        notes.push(targetAge === 2 ? "Spawn 3 Atabegs" : targetAge === 3 ? "Spawn 5 Atabegs" : "Spawn 7 Atabegs");
      }
      if (entry.wing === "trade" && entry.branch === "bazaar") {
        houseOfWisdomState.effects.bazaar = true;
        notes.push("Bazaar trade effect tracked only");
      }
    }

    pushEvent(`House of Wisdom complete: ${label}`, notes.join(", "), BO_HOUSE_OF_WISDOM_BUILDING);
    syncBerryCapacityBonus();
    pushSample(completedAt, resources);
  }

  pushSample(0, resources);
  syncGatherSegments(0);
  syncDropoffCohorts(BO_RESOURCE_KEYS, 0);

  function foodMult() {
    return Math.pow(config.techEffects.foodUpgradeMult || 1, foodTechLevel);
  }

  function isFood(res) {
    return ["sheep", "berries", "deer", "boar", "farm"].includes(res);
  }

  function dropoffAvailable(res) {
    if (buildingCounts["Town Center"] > 0) return true;
    if (gerCount > 0) return true;
    if (workerElephantCount > 0) return true;
    if ((buildingCounts["Manor"] || 0) > 0) return true;
    if ((buildingCounts["Aachen Chapel"] || 0) > 0) return true;
    if (isTechResearched("Cistercian Churches") && ((buildingCounts["Monastery"] || 0) > 0 || (buildingCounts["Regnitz Cathedral"] || 0) > 0)) {
      return true;
    }
    if (isFood(res)) return buildingCounts["Mill"] > 0 || (buildingCounts["Hunting Cabin"] || 0) > 0 || (buildingCounts["High Trade House"] || 0) > 0;
    if (res === "wood") return buildingCounts["Lumber Camp"] > 0;
    if (res === "gold" || res === "stone") return buildingCounts["Mining Camp"] > 0;
    return false;
  }

  function effectiveCarry(res) {
    let base = config.carry[res] || 0;
    if (Number.isFinite(civBonus.carryMult) && civBonus.carryMult > 0) {
      base *= civBonus.carryMult;
    }
    if (res === "berries" && hasActiveBerryBonus()) {
      base += berryBonus.carryBonus || 0;
    }
    if (civ === "Japanese") {
      base += getJapaneseFarmhouseTechLevel() * 3;
    }
    if (wheelbarrowActive) base += (config.techEffects.wheelCarryBonus || BO_WHEEL_CARRY_BONUS);
    return base;
  }

  function effectiveTrip(res) {
    const override = tripOverrides[res];
    let base = Number.isFinite(override) ? override : (config.trip[res] || 0);
    if (!Number.isFinite(override)) {
      if (civ === "Mongols" && gerCount > 0) base *= 0.3;
      if (civ === "Tughlaq Dynasty" && workerElephantCount > 0) base *= 0.3;
    }
    return effectiveMoveTime(base);
  }

  function effectiveMoveTime(baseTime) {
    const base = Math.max(0, baseTime || 0);
    const japaneseMoveMult = civ === "Japanese" ? (1 / (1 + (getJapaneseFarmhouseTechLevel() * 0.07))) : 1;
    return base * japaneseMoveMult * (wheelbarrowActive ? (config.techEffects.wheelTripMult || BO_WHEEL_TRIP_MULT) : 1);
  }

  function gatherRate(res) {
    const base = config.gatherRates[res] || 0;
    let rate = isFood(res) ? base * foodMult() : base;
    const ottomanEffects = getOttomanActiveEffects();
    const howEffects = getHouseOfWisdomEffects();
    const goldenAgeGatherPct = howEffects.goldenAge?.bonuses?.gatherPct || 0;
    if (res === "farm" && (buildingCounts["Mill"] || 0) > 0 && BO_ENGLISH_FARM_BONUS_CIVS.has(civ)) {
      const pct = (civBonus.farmBonusByAge || BO_ENGLISH_FARM_BONUS_BY_AGE)[age] || 0;
      rate *= 1 + pct / 100;
    }
    if (res === "berries" && hasActiveBerryBonus()) {
      rate *= 1 + (berryBonus.gatherBonusPct || 0) / 100;
    }
    if (civ === "Japanese" && res === "berries") {
      rate *= 1 + (getJapaneseFarmhouseTechLevel() * 0.25);
    }
    if ((res === "deer" || res === "boar") && survivalTechActive) {
      rate *= 1.15;
    }
    if (civ === "Rus" && isFood(res)) {
      rate *= 1 + (getRusBountyStateNow().foodGatherPct / 100);
    }
    if (goldenAgeGatherPct > 0) {
      rate *= 1 + goldenAgeGatherPct / 100;
    }
    if (houseOfWisdomState.effects.villagerWorkRatePct > 0) {
      rate *= 1 + houseOfWisdomState.effects.villagerWorkRatePct / 100;
    }
    if (houseOfWisdomState.effects.agriculture && res === "farm") {
      rate *= 1.15;
    }
    if (civ === "Japanese" && res === "farm") {
      rate *= 1 + (getJapaneseDaimyoTier() * 0.2);
    }
    if (civ === "Ottomans" && ottomanEffects.anatolianHills && (res === "gold" || res === "stone")) {
      rate *= 1.15;
    }
    if (civ === "Tughlaq Dynasty") {
      rate *= 1 + (getTughlaqWorkerElephantBonusLevel() * 0.05);
    }
    return rate;
  }

  function depositRate(res) {
    const vills = (res === "farm")
      ? Math.min(assignments.farm || 0, farmCount)
      : (assignments[res] || 0);
    if (vills <= 0) return 0;
    if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) return 0;
    if (!dropoffAvailable(res)) return 0;
    const rate = gatherRate(res);
    if (rate <= 0) return 0;
    const carry = effectiveCarry(res);
    const trip = effectiveTrip(res);
    const cycleTime = (carry / rate) + trip + BO_DROPOFF_ANIMATION_SEC + trip;
    if (cycleTime <= 0) return 0;
    const perVill = (carry * getDropoffReturnMult(res)) / cycleTime;
    return perVill * vills;
  }

  function assignedCount(res) {
    return (res === "farm")
      ? Math.min(assignments.farm || 0, farmCount)
      : (assignments[res] || 0);
  }

  function getResourceCohorts(res) {
    if (!Array.isArray(dropoffCohorts[res])) dropoffCohorts[res] = [];
    return dropoffCohorts[res];
  }

  function getResourceCohortCount(res) {
    return getResourceCohorts(res).reduce((sum, cohort) => sum + Math.max(0, cohort?.count || 0), 0);
  }

  function canUseDropoffCohorts(res) {
    if (assignedCount(res) <= 0) return false;
    if (!dropoffAvailable(res)) return false;
    if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) return false;
    return gatherRate(res) > 0 && effectiveCarry(res) > 0;
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  function getCohortProgress(cohort, now) {
    const start = Number.isFinite(cohort?.phaseStartedAt) ? cohort.phaseStartedAt : now;
    const end = Number.isFinite(cohort?.phaseEndsAt) ? cohort.phaseEndsAt : start;
    const duration = end - start;
    if (duration <= 0.0001) return now >= end - 0.0001 ? 1 : 0;
    return clamp01((now - start) / duration);
  }

  function getCohortCarryNow(cohort, now) {
    const progress = getCohortProgress(cohort, now);
    const startCarry = cohort?.phaseStartCarry || 0;
    const endCarry = cohort?.phaseEndCarry || 0;
    return startCarry + ((endCarry - startCarry) * progress);
  }

  function scheduleCohortGather(res, cohort, now, startCarry = 0) {
    const rate = gatherRate(res);
    const carryTarget = Math.max(0, effectiveCarry(res));
    const clampedStart = Math.max(0, Math.min(startCarry, carryTarget));
    const remainingCarry = Math.max(0, carryTarget - clampedStart);
    const duration = rate > 0 ? (remainingCarry / rate) : Infinity;
    cohort.phase = "gather";
    cohort.phaseStartedAt = now;
    cohort.phaseEndsAt = Number.isFinite(duration) ? now + duration : Infinity;
    cohort.phaseStartCarry = clampedStart;
    cohort.phaseEndCarry = carryTarget;
  }

  function scheduleCohortMove(res, cohort, phase, now, progress = 0, carryAmount = 0) {
    const trip = Math.max(0, effectiveTrip(res));
    const clampedProgress = clamp01(progress);
    const load = phase === "toDropoff" ? Math.max(0, carryAmount) : 0;
    cohort.phase = phase;
    cohort.phaseStartCarry = load;
    cohort.phaseEndCarry = load;
    cohort.phaseStartedAt = now - (trip * clampedProgress);
    cohort.phaseEndsAt = cohort.phaseStartedAt + trip;
  }

  function scheduleCohortDropoff(cohort, now, progress = 0, carryAmount = 0) {
    const duration = Math.max(0, BO_DROPOFF_ANIMATION_SEC);
    const clampedProgress = clamp01(progress);
    const load = Math.max(0, carryAmount);
    cohort.phase = "dropoff";
    cohort.phaseStartCarry = load;
    cohort.phaseEndCarry = load;
    cohort.phaseStartedAt = now - (duration * clampedProgress);
    cohort.phaseEndsAt = cohort.phaseStartedAt + duration;
  }

  function rebaseResourceCohorts(res, now) {
    const cohorts = getResourceCohorts(res);
    if (!cohorts.length) return;
    cohorts.forEach((cohort) => {
      if (!cohort || (cohort.count || 0) <= 0) return;
      const progress = getCohortProgress(cohort, now);
      if (cohort.phase === "gather") {
        scheduleCohortGather(res, cohort, now, getCohortCarryNow(cohort, now));
      } else if (cohort.phase === "toDropoff") {
        scheduleCohortMove(res, cohort, "toDropoff", now, progress, cohort.phaseStartCarry || cohort.phaseEndCarry || 0);
      } else if (cohort.phase === "dropoff") {
        scheduleCohortDropoff(cohort, now, progress, cohort.phaseStartCarry || cohort.phaseEndCarry || 0);
      } else if (cohort.phase === "toResource") {
        scheduleCohortMove(res, cohort, "toResource", now, progress, 0);
      } else {
        scheduleCohortGather(res, cohort, now, 0);
      }
    });
    dropoffCohorts[res] = cohorts.filter((cohort) => cohort && (cohort.count || 0) > 0);
  }

  function addResourceCohort(res, count, now) {
    const safeCount = Math.max(0, Math.floor(count || 0));
    if (safeCount <= 0 || !canUseDropoffCohorts(res)) return;
    const cohort = {
      id: nextDropoffCohortId++,
      count: safeCount,
      phase: "gather",
      phaseStartedAt: now,
      phaseEndsAt: now,
      phaseStartCarry: 0,
      phaseEndCarry: 0
    };
    scheduleCohortGather(res, cohort, now, 0);
    getResourceCohorts(res).push(cohort);
  }

  function removeResourceWorkers(res, count) {
    let remaining = Math.max(0, Math.floor(count || 0));
    if (remaining <= 0) return;
    const cohorts = getResourceCohorts(res);
    for (let i = cohorts.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const cohort = cohorts[i];
      if (!cohort || (cohort.count || 0) <= 0) {
        cohorts.splice(i, 1);
        continue;
      }
      const used = Math.min(remaining, cohort.count);
      cohort.count -= used;
      remaining -= used;
      if (cohort.count <= 0) cohorts.splice(i, 1);
    }
  }

  function syncDropoffCohorts(resourcesToSync, now) {
    const list = resourcesToSync
      ? (resourcesToSync instanceof Set ? Array.from(resourcesToSync) : resourcesToSync)
      : BO_RESOURCE_KEYS;
    list.forEach((res) => {
      if (!BO_RESOURCE_KEYS.includes(res)) return;
      rebaseResourceCohorts(res, now);
      if (!canUseDropoffCohorts(res)) {
        dropoffCohorts[res] = [];
        return;
      }
      const targetCount = assignedCount(res);
      const currentCount = getResourceCohortCount(res);
      if (currentCount < targetCount) addResourceCohort(res, targetCount - currentCount, now);
      else if (currentCount > targetCount) removeResourceWorkers(res, currentCount - targetCount);
    });
  }

  function nextCohortEventTime() {
    let soonest = null;
    BO_RESOURCE_KEYS.forEach((res) => {
      getResourceCohorts(res).forEach((cohort) => {
        if (!cohort || (cohort.count || 0) <= 0 || !Number.isFinite(cohort.phaseEndsAt)) return;
        if (soonest === null || cohort.phaseEndsAt < soonest) soonest = cohort.phaseEndsAt;
      });
    });
    return soonest;
  }

  function processCohortEvent(res, cohort, now) {
    if (!cohort || (cohort.count || 0) <= 0) return;
    if (!getResourceCohorts(res).includes(cohort)) return;
    if (!canUseDropoffCohorts(res)) {
      dropoffCohorts[res] = [];
      return;
    }
    if (cohort.phase === "gather") {
      const carried = Math.max(0, cohort.phaseEndCarry || getCohortCarryNow(cohort, now));
      scheduleCohortMove(res, cohort, "toDropoff", now, 0, carried);
      return;
    }
    if (cohort.phase === "toDropoff") {
      const carried = Math.max(0, cohort.phaseStartCarry || cohort.phaseEndCarry || 0);
      scheduleCohortDropoff(cohort, now, 0, carried);
      return;
    }
    if (cohort.phase === "dropoff") {
      const rawHarvest = Math.max(0, (cohort.phaseStartCarry || cohort.phaseEndCarry || 0) * Math.max(0, cohort.count || 0));
      let harvested = rawHarvest;
      if (BO_FINITE_FOOD_SOURCES.includes(res)) {
        const remaining = foodRemaining[res] || 0;
        harvested = Math.min(harvested, remaining);
        foodRemaining[res] = Math.max(0, remaining - harvested);
      }
      const gain = harvested * getDropoffReturnMult(res);
      if (gain > 0) {
        if (isFood(res)) resources.food += gain;
        else resources[res] += gain;
        addGathered(isFood(res) ? "food" : res, gain);
        addJapaneseSilverMiningBonus(res, gain);
        addRusBountyGold(res, harvested);
        pushSample(now, resources);
      }
      if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) {
        const label = res.charAt(0).toUpperCase() + res.slice(1);
        pushEvent(`${label} depleted`, "", "Assignments");
        dropoffCohorts[res] = [];
        syncGatherSegments(now);
        return;
      }
      scheduleCohortMove(res, cohort, "toResource", now, 0, 0);
      return;
    }
    if (cohort.phase === "toResource") {
      scheduleCohortGather(res, cohort, now, 0);
    }
  }

  function processCohortEvents(now) {
    while (true) {
      const due = [];
      BO_RESOURCE_KEYS.forEach((res) => {
        getResourceCohorts(res).forEach((cohort) => {
          if (!cohort || (cohort.count || 0) <= 0 || !Number.isFinite(cohort.phaseEndsAt)) return;
          if (cohort.phaseEndsAt <= now + 0.0001) due.push({ res, cohort });
        });
      });
      if (!due.length) break;
      due.sort((a, b) => (a.cohort.phaseEndsAt - b.cohort.phaseEndsAt) || ((a.cohort.id || 0) - (b.cohort.id || 0)));
      due.forEach(({ res, cohort }) => processCohortEvent(res, cohort, now));
    }
  }

  function applyPassiveIncome(dt) {
    if (BO_ENGLISH_FARM_BONUS_CIVS.has(civ) && (civBonus.farmGoldPerSec || BO_ENGLISH_FARM_GOLD_PER_SEC)) {
      const goldRate = civBonus.farmGoldPerSec || BO_ENGLISH_FARM_GOLD_PER_SEC;
      const farmVills = Math.min(assignments.farm || 0, farmCount);
      if (farmVills > 0) {
        const gain = farmVills * goldRate * dt;
        resources.gold += gain;
        addGathered("gold", gain);
      }
    }
    if (ovooCount > 0) {
      const perMin = ovooStonePerMinByAge?.[age] || 0;
      const gain = (perMin / 60) * ovooCount * dt;
      resources.stone += gain;
      addGathered("stone", gain);
    }
    if (sacredSites > 0) {
      const goldPerMin = sacredSiteGoldPerMin * (civ === "Delhi Sultanate" && sanctityActive ? (civBonus.sanctityGoldMult || 1.25) : 1);
      const gain = (goldPerMin / 60) * sacredSites * dt;
      resources.gold += gain;
      addGathered("gold", gain);
    }
    if (pastureCount > 0) {
      const sheepFood = BO_NODE_AMOUNTS?.sheep ?? 200;
      const perSec = sheepFood / Math.max(1, pastureSheepSeconds);
      const sheepBefore = foodRemaining.sheep || 0;
      foodRemaining.sheep += pastureCount * perSec * dt;
      if (sheepBefore <= 0 && foodRemaining.sheep > 0 && (assignments.sheep || 0) > 0) {
        syncDropoffCohorts(["sheep"], time);
      }
    }
    if (highTradeHouseCount > 0) {
      const deerFood = BO_NODE_AMOUNTS?.deer ?? 350;
      const perSec = deerFood / Math.max(1, civBonus.highTradeHouseDeerSeconds || 60);
      const deerBefore = foodRemaining.deer || 0;
      foodRemaining.deer += highTradeHouseCount * perSec * dt;
      if (deerBefore <= 0 && foodRemaining.deer > 0 && (assignments.deer || 0) > 0) {
        syncDropoffCohorts(["deer"], time);
      }
    }
    if (kuraStorehouseCount > 0) {
      kuraPassiveSeconds += dt * kuraStorehouseCount;
      const cycle = Math.max(1, civBonus.kuraCycleSeconds || 50);
      if (kuraPassiveSeconds >= cycle) {
        const ticks = Math.floor(kuraPassiveSeconds / cycle);
        kuraPassiveSeconds -= ticks * cycle;
        grantJapaneseKuraTick(time, ticks);
      }
    }
    const zenGoldPerSec = getJapaneseZenGoldPerSec();
    if (zenGoldPerSec > 0) {
      const gain = zenGoldPerSec * dt;
      resources.gold += gain;
      addGathered("gold", gain);
    }
    const malianPitMineGoldPerSec = getMalianPitMineGoldPerSec();
    if (malianPitMineGoldPerSec > 0) {
      const gain = malianPitMineGoldPerSec * dt;
      resources.gold += gain;
      addGathered("gold", gain);
    }
    const malianMansaQuarryGoldPerSec = getMalianMansaQuarryGoldPerSec();
    if (malianMansaQuarryGoldPerSec > 0) {
      const gain = malianMansaQuarryGoldPerSec * dt;
      resources.gold += gain;
      addGathered("gold", gain);
    }
    const malianCattleFoodPerSec = getMalianCattleFoodPerSec();
    if (malianCattleFoodPerSec > 0) {
      const gain = malianCattleFoodPerSec * dt;
      resources.food += gain;
      addGathered("food", gain);
    }
    const malianGrandFulaniFoodPerSec = getMalianGrandFulaniFoodPerSec();
    if (malianGrandFulaniFoodPerSec > 0) {
      const gain = malianGrandFulaniFoodPerSec * dt;
      resources.food += gain;
      addGathered("food", gain);
    }
  }

  function applyIncome(dt) {
    applyPassiveIncome(dt);
  }

  function nextBusyTime() {
    if (busy.length === 0) return null;
    return Math.min(...busy.map((b) => b.endTime));
  }

  function returnBuildersToTarget(source, count, rawReturnTarget) {
    const rawTarget = (rawReturnTarget === undefined || rawReturnTarget === null || rawReturnTarget === "")
      ? source
      : rawReturnTarget;
    const target = rawTarget || "idle";
    let valid = true;
    if (target === "boar" && noBoarCiv) valid = false;
    if (target === "farm" && farmCount <= 0) valid = false;
    if (target !== "idle" && assignments[target] === undefined) valid = false;
    if (!valid) {
      assignments.idle += count;
      const warn = `Builder return target invalid (${target}) -> idle`;
      if (!warnings.includes(warn)) warnings.push(warn);
    } else if (target === "idle") {
      assignments.idle += count;
    } else if (target === "farm") {
      const available = Math.max(0, farmCount - (assignments.farm || 0));
      const toFarm = Math.min(available, count);
      if (toFarm > 0) assignments.farm += toFarm;
      const leftover = count - toFarm;
      if (leftover > 0) {
        if (assignments[source] !== undefined) assignments[source] += leftover;
        else assignments.idle += leftover;
        const warn = "Builder return exceeds farm capacity";
        if (!warnings.includes(warn)) warnings.push(warn);
      }
    } else {
      assignments[target] += count;
    }
  }

  function releaseBusy(endTime) {
    const priority = {
      buildComplete: 0,
      houseOfWisdomComplete: 0,
      techComplete: 1,
      scholarComplete: 2,
      builder: 3,
      trainVill: 4,
      unitComplete: 5,
      houseOfWisdomReinforcement: 5,
      rallyDelay: 6,
      assignDelay: 7
    };
    const releasing = busy
      .filter((b) => b.endTime <= endTime + 0.0001)
      .sort((a, b) => (priority[a.kind] ?? 99) - (priority[b.kind] ?? 99));
    if (releasing.length === 0) return;
    let needsGlobalDropoffSync = false;
    const targetedDropoffSync = new Set();
    releasing.forEach((b) => {
      if (b.kind === "buildComplete") {
        needsGlobalDropoffSync = true;
        const name = b.buildingName;
        buildingCounts[name] = (buildingCounts[name] || 0) + 1;
        if (name === "Farm") farmCount += 1;
        const instanceId = name === "Town Center"
          ? `TC #${buildingCounts[name]}`
          : `${name} #${buildingCounts[name]}`;
        if (!isBoTimelineCounterBuilding(name)) {
          if (!buildingInstances[name]) buildingInstances[name] = [];
          buildingInstances[name].push(instanceId);
        }
        if (name === "Pasture") pastureCount += 1;
        if (name === "Ger") gerCount += 1;
        if (name === "Ovoo") ovooCount += 1;
        if (name === "High Trade House") highTradeHouseCount += 1;
        if (name === "Kura Storehouse") {
          kuraStorehouseCount += 1;
          grantJapaneseKuraTick(endTime, 1);
        }
        if (name === "Temple of Equality") {
          japaneseBuddhistMonkCount += 4;
          pushEvent("Buddhist Monks arrive", "Spawn 4 Buddhist Monks", instanceId);
        }
        const landmarkAge = getLandmarkTargetAge(name);
        if (landmarkAge && age < landmarkAge) {
          age = landmarkAge;
          milestones[`Age ${age} complete`] = endTime;
          if (civ === "Ottomans") {
            addOttomanVizierXp(BO_OTTOMAN_VIZIER_AGE_XP[age] || 0);
          }
          if (age >= 4 && greatBombardNeedsImperialUpgrade) {
            greatBombardNeedsImperialUpgrade = false;
            pushEvent("Great Bombard upgraded", "Upgraded automatically on reaching Imperial Age", BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING);
          }
        }
        if (name === "Istanbul Imperial Palace") {
          imperialPalaceCompleted = true;
        }
        syncBerryCapacityBonus();
        if (isBoProductionSurface(name, civ)) {
          const list = productionQueues[name] || [];
          list.push({ id: instanceId, busyUntil: endTime });
          productionQueues[name] = list;
        }
        ["sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"].forEach(depositHeldIfAvailable);
        if (b.queueId) {
          const queue = buildQueues.find((entry) => entry.id === b.queueId);
          if (queue) {
            queue.active = false;
            queue.nextIndex += 1;
            queue.availableAt = endTime;
            if (queue.nextIndex >= queue.steps.length) {
              queue.done = true;
              queue.entries.forEach((entry) => returnBuildersToTarget(entry.source, entry.count, queue.returnTarget));
            }
          }
        }
      } else if (b.kind === "houseOfWisdomComplete") {
        needsGlobalDropoffSync = true;
        houseOfWisdomBusyUntil = endTime;
        applyHouseOfWisdomCompletion(b, endTime);
      } else if (b.kind === "techComplete") {
        needsGlobalDropoffSync = true;
        researchedTechs.add(b.techType);
        if (b.techType === "Wheelbarrow") wheelbarrowActive = true;
        if (b.techType === "Food Upgrade" || b.techType === "Horticulture") foodTechLevel += 1;
        if (b.techType === "Survival Techniques") survivalTechActive = true;
        if (b.techType === "Sanctity") sanctityActive = true;
        if (b.techType === "Enlistment Incentives") enlistmentActive = true;
        if (b.techType === "Dome of the Faith") domeActive = true;
        if (b.techType === "Preservation of Knowledge") houseOfWisdomState.effects.preservationOfKnowledge = true;
        if (b.techType === "Fertile Crescent") houseOfWisdomState.effects.fertileCrescent = true;
        if (b.techType === "Agriculture") houseOfWisdomState.effects.agriculture = true;
        if (b.techType === "Improved Processing") houseOfWisdomState.effects.improvedProcessing = true;
        if (b.techType === "Medical Centers") houseOfWisdomState.effects.medicalCenters = true;
        if (b.techType === "Public Libraries") houseOfWisdomState.effects.publicLibraries = true;
        if (b.techType === "Boot Camp") houseOfWisdomState.effects.bootCamp = true;
        if (b.techType === "Composite Bows") houseOfWisdomState.effects.compositeBows = true;
        if (b.techType === "Camel Support") houseOfWisdomState.effects.camelSupport = true;
        if (b.techType === "Armored Caravans") houseOfWisdomState.effects.armoredCaravans = true;
        if (b.techType === "Grand Bazaar") houseOfWisdomState.effects.grandBazaar = true;
        if (b.techType === "Spice Roads") houseOfWisdomState.effects.spiceRoads = true;
        if (civ === "Japanese" && ["Daimyo Manor", "Daimyo Palace", "Shogunate Castle"].includes(b.techType)) {
          villagers += 1;
          assignments.idle += 1;
          pushEvent("Villager granted", `${b.techType} grants 1 Villager`, b.buildingId || "TC #1");
        }
        if (b.milestoneLabel) milestones[b.milestoneLabel] = endTime;
      } else if (b.kind === "scholarComplete") {
        scholarGarrison = Math.max(0, b.count || 0);
      } else if (b.kind === "builder") {
        needsGlobalDropoffSync = true;
        returnBuildersToTarget(b.source, b.count, b.returnTarget);
      } else if (b.kind === "trainVill") {
        if (civ === "Ottomans") addOttomanVizierXp(BO_OTTOMAN_VIZIER_UNIT_XP.Villager || 0, { allowImperialPalaceDouble: true });
        villagers += 1;
        const rally = b.rallyTarget || "idle";
        if (Number.isFinite(b.rallyTripOverrideSec) && BO_RESOURCE_KEYS.includes(rally)) {
          tripOverrides[rally] = Math.max(0, b.rallyTripOverrideSec);
          targetedDropoffSync.add(rally);
        }
        const travelDelay = effectiveMoveTime(b.rallyTravelDelaySec || 0);
        if (rally !== "idle" && assignments[rally] !== undefined && travelDelay > 0) {
          assignments.idle += 1;
          busy.push({
            endTime: endTime + travelDelay,
            kind: "rallyDelay",
            target: rally,
            count: 1,
            tripOverrideSec: b.rallyTripOverrideSec,
            sourceCommandId: b.sourceCommandId || null,
            buildingId: b.buildingId || b.tcId || "TC #1",
            buildingType: b.buildingType || "Town Center",
            rallyTravelDelaySec: b.rallyTravelDelaySec || 0,
            timePerUnit: b.timePerUnit || BO_VILLAGER_TIME
          });
        } else if (assignments[rally] !== undefined) {
          assignments[rally] += 1;
          if (BO_RESOURCE_KEYS.includes(rally)) targetedDropoffSync.add(rally);
        } else {
          assignments.idle += 1;
        }
        if (!(rally !== "idle" && assignments[rally] !== undefined && travelDelay > 0)) {
          villagerMarkers.push({
            time: endTime,
            target: rally,
            count: 1,
            sourceCommandId: b.sourceCommandId || null,
            buildingId: b.buildingId || b.tcId || "TC #1",
            buildingType: b.buildingType || "Town Center",
            timePerUnit: b.timePerUnit || BO_VILLAGER_TIME,
            rallyTravelDelaySec: b.rallyTravelDelaySec || 0,
            rallyTripOverrideSec: Number.isFinite(b.rallyTripOverrideSec) ? b.rallyTripOverrideSec : null
          });
        }
        pushEvent("Villager complete", "", b.tcId || "TC #1");
      } else if (b.kind === "unitComplete") {
        if (civ === "Ottomans") {
          addOttomanVizierXp(BO_OTTOMAN_VIZIER_UNIT_XP[b.unitName] || BO_OTTOMAN_VIZIER_UNIT_XP[resolveBoUnitName(b.unitName)] || 0, {
            allowImperialPalaceDouble: true
          });
        }
        if (resolveBoUnitName(b.unitName) === "Worker Elephant") {
          workerElephantCount += 1;
          pushEvent("Worker Elephant ready", "Movable dropoff active", b.buildingId || b.tcId || "TC #1");
        }
        if (b.unitName === "Cattle") {
          malianCattleCount += Math.max(1, b.count || 1);
        }
        if (b.unitName === "Buddhist Monk") {
          japaneseBuddhistMonkCount += Math.max(1, b.count || 1);
        }
      } else if (b.kind === "houseOfWisdomReinforcement") {
        const waveCount = Math.max(1, b.count || 1);
        pushEvent("Desert Raiders arrive", `Spawn ${waveCount} Desert Raiders`, BO_HOUSE_OF_WISDOM_BUILDING);
        const nextWaveTime = endTime + Math.max(1, b.repeatEvery || 120);
        if (nextWaveTime <= (config.simEnd || 0) + 0.0001) {
          busy.push({
            endTime: nextWaveTime,
            kind: "houseOfWisdomReinforcement",
            count: waveCount,
            repeatEvery: b.repeatEvery || 120
          });
        }
      } else if (b.kind === "rallyDelay") {
        const target = b.target || "idle";
        const count = Math.max(1, b.count || 1);
        if (Number.isFinite(b.tripOverrideSec) && BO_RESOURCE_KEYS.includes(target)) {
          tripOverrides[target] = Math.max(0, b.tripOverrideSec);
          targetedDropoffSync.add(target);
        }
        if (assignments[target] !== undefined) {
          assignments[target] += count;
          if (BO_RESOURCE_KEYS.includes(target)) targetedDropoffSync.add(target);
        } else {
          assignments.idle += count;
        }
        villagerMarkers.push({
          time: endTime,
          target,
          count,
          sourceCommandId: b.sourceCommandId || null,
          buildingId: b.buildingId || "TC #1",
          buildingType: b.buildingType || "Town Center",
          timePerUnit: b.timePerUnit || BO_VILLAGER_TIME,
          rallyTravelDelaySec: b.rallyTravelDelaySec || 0,
          rallyTripOverrideSec: Number.isFinite(b.tripOverrideSec) ? b.tripOverrideSec : null
        });
      } else if (b.kind === "assignDelay") {
        const notes = [];
        applyAssignment(b.desired, notes, b.overrides);
      }
    });
    for (let i = busy.length - 1; i >= 0; i--) {
      if (busy[i].endTime <= endTime + 0.0001) busy.splice(i, 1);
    }
    if (needsGlobalDropoffSync) syncDropoffCohorts(BO_RESOURCE_KEYS, endTime);
    else syncDropoffCohorts(targetedDropoffSync, endTime);
    syncGatherSegments(endTime);
    tryStartBuildQueues();
    tryStartFiniteQueues();
    tryStartAutoQueues();
    pushSample(endTime, resources);
  }

  function nextFoodDepleteTime() {
    let soonest = null;
    BO_FINITE_FOOD_SOURCES.forEach((res) => {
      const remaining = foodRemaining[res] || 0;
      if (remaining <= 0) return;
      const vills = assignments[res] || 0;
      if (vills <= 0) return;
      let rate = 0;
      if (!dropoffAvailable(res)) {
        const cap = vills * effectiveCarry(res);
        if (cap <= 0 || held[res] >= cap) return;
        rate = gatherRate(res) * vills;
      } else {
        rate = depositRate(res);
      }
      if (res === "sheep" && pastureCount > 0) {
        const sheepFood = BO_NODE_AMOUNTS?.sheep ?? 200;
        const perSec = sheepFood / Math.max(1, pastureSheepSeconds);
        rate = rate - pastureCount * perSec;
      }
      if (res === "deer" && highTradeHouseCount > 0) {
        const deerFood = BO_NODE_AMOUNTS?.deer ?? 350;
        const perSec = deerFood / Math.max(1, civBonus.highTradeHouseDeerSeconds || 60);
        rate = rate - highTradeHouseCount * perSec;
      }
      if (rate <= 0) return;
      const t = time + remaining / rate;
      if (soonest === null || t < soonest.time) soonest = { time: t, res };
    });
    return soonest;
  }

  function nextHoldFillTime() {
    let soonest = null;
    Object.keys(held).forEach((res) => {
      if (dropoffAvailable(res)) return;
      const vills = assignments[res] || 0;
      const rate = gatherRate(res);
      if (vills <= 0 || rate <= 0) return;
      if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) return;
      const cap = vills * effectiveCarry(res);
      if (held[res] >= cap) return;
      const ttc = (cap - held[res]) / (rate * vills);
      const t = time + ttc;
      if (soonest === null || t < soonest.time) soonest = { time: t, res };
    });
    return soonest;
  }

  function advanceTo(targetTime, options = {}) {
    const previousReservation = advanceFiniteReservation;
    advanceFiniteReservation = options?.finiteReservation || previousReservation;
    try {
      while (time < targetTime) {
        const nextBusy = nextBusyTime();
        const nextDrop = nextCohortEventTime();
        const nextBuild = nextBuildQueueStartTime();
        const nextFinite = nextFiniteQueueStartTime();
        const nextAuto = nextAutoQueueStartTime();
        let next = targetTime;
        if (nextBusy !== null && nextBusy < next) next = nextBusy;
        if (nextDrop !== null && nextDrop < next) next = nextDrop;
        if (nextBuild !== null && nextBuild < next) next = nextBuild;
        if (nextFinite !== null && nextFinite < next) next = nextFinite;
        if (nextAuto !== null && nextAuto < next) next = nextAuto;

        applyIncome(next - time);
        time = next;

        if (nextBusy !== null && Math.abs(time - nextBusy) < 0.0001) {
          releaseBusy(time);
        }
        if (nextDrop !== null && Math.abs(time - nextDrop) < 0.0001) processCohortEvents(time);
        tryStartBuildQueues();
        tryStartFiniteQueues();
        tryStartAutoQueues();
      }
    } finally {
      advanceFiniteReservation = previousReservation;
    }
  }

  function hasResources(cost) {
    return resources.food >= cost.food &&
      resources.wood >= cost.wood &&
      resources.gold >= cost.gold &&
      resources.stone >= cost.stone;
  }

  function getIncomeRates() {
    const farmGoldRate = (BO_ENGLISH_FARM_BONUS_CIVS.has(civ) ? (civBonus.farmGoldPerSec || BO_ENGLISH_FARM_GOLD_PER_SEC) * (assignments.farm || 0) : 0);
    const sacredGoldRate = sacredSites > 0 ? (sacredSiteGoldPerMin / 60) * sacredSites * (civ === "Delhi Sultanate" && sanctityActive ? (civBonus.sanctityGoldMult || 1.25) : 1) : 0;
    const ovooStoneRate = ovooCount > 0 ? ((ovooStonePerMinByAge?.[age] || 0) / 60) * ovooCount : 0;
    const rusBountyGoldRate = civ === "Rus"
      ? (depositRate("sheep") + depositRate("deer") + depositRate("boar")) * (getRusBountyStateNow().goldPerFood || 0)
      : 0;
    const japaneseSilverPct = getJapaneseSilverMiningPct() / 100;
    const japaneseGoldStoneBonus = depositRate("stone") * japaneseSilverPct;
    const japaneseStoneGoldBonus = depositRate("gold") * japaneseSilverPct;
    const japaneseZenGoldRate = getJapaneseZenGoldPerSec();
    const kuraWoodRate = kuraStorehouseCount > 0 && kuraGeneratedFarms >= (kuraStorehouseCount * (civBonus.kuraFarmCapPerStorehouse || 12))
      ? (kuraStorehouseCount * (civBonus.kuraOverflowWood || 38) / Math.max(1, civBonus.kuraCycleSeconds || 50))
      : 0;
    const malianPitMineGoldRate = getMalianPitMineGoldPerSec();
    const malianMansaQuarryGoldRate = getMalianMansaQuarryGoldPerSec();
    const malianCattleFoodRate = getMalianCattleFoodPerSec();
    const malianGrandFulaniFoodRate = getMalianGrandFulaniFoodPerSec();
    return {
      food: depositRate("sheep") + depositRate("berries") + depositRate("deer") + depositRate("boar") + depositRate("farm") + malianCattleFoodRate + malianGrandFulaniFoodRate,
      wood: depositRate("wood") + kuraWoodRate,
      gold: depositRate("gold") + farmGoldRate + sacredGoldRate + rusBountyGoldRate + japaneseGoldStoneBonus + japaneseZenGoldRate + malianPitMineGoldRate + malianMansaQuarryGoldRate,
      stone: depositRate("stone") + ovooStoneRate + japaneseStoneGoldBonus
    };
  }

  function timeToAfford(cost) {
    const rates = getIncomeRates();
    const needs = {
      food: Math.max(0, cost.food - resources.food),
      wood: Math.max(0, cost.wood - resources.wood),
      gold: Math.max(0, cost.gold - resources.gold),
      stone: Math.max(0, cost.stone - resources.stone)
    };
    const timeNeeded = Math.max(
      rates.food > 0 ? needs.food / rates.food : needs.food > 0 ? Infinity : 0,
      rates.wood > 0 ? needs.wood / rates.wood : needs.wood > 0 ? Infinity : 0,
      rates.gold > 0 ? needs.gold / rates.gold : needs.gold > 0 ? Infinity : 0,
      rates.stone > 0 ? needs.stone / rates.stone : needs.stone > 0 ? Infinity : 0
    );
    return timeNeeded;
  }

  function waitForResources(cost) {
    while (!hasResources(cost)) {
      const timeNeeded = timeToAfford(cost);
      if (!isFinite(timeNeeded)) return false;
      const nextBusy = nextBusyTime();
      if (nextBusy !== null && time + timeNeeded > nextBusy) {
        advanceTo(nextBusy);
      } else {
        advanceTo(time + timeNeeded);
      }
    }
    return true;
  }

  const capOrder = ["stone", "gold", "wood", ...BO_FOOD_SOURCES.slice().reverse()];

  function sumAssignments(obj) {
    return BO_RESOURCE_KEYS.reduce((sum, key) => sum + (obj[key] || 0), 0);
  }

  function assignmentLabelFromCounts(counts) {
    return `Assign vills (B${counts.berries} D${counts.deer} Bo${counts.boar} Sh${counts.sheep} Fm${counts.farm} | W${counts.wood} G${counts.gold} S${counts.stone})`;
  }

  function applyTripOverrideUpdates(overrides) {
    if (!overrides) return;
    Object.entries(overrides).forEach(([res, val]) => {
      if (!Number.isFinite(val)) return;
      tripOverrides[res] = Math.max(0, val);
    });
  }

  function applyAssignment(desired, notes, overrides) {
    const queueReservedBuilders = buildQueues.reduce((sum, queue) => {
      if (!queue || queue.done) return sum;
      return sum + (queue.entries || []).reduce((inner, entry) => inner + Math.max(0, entry.count || 0), 0);
    }, 0);
    const busyBuilders = queueReservedBuilders + busy.reduce((sum, entry) => {
      if (entry.kind !== "builder") return sum;
      if ((entry.endTime || 0) <= time + 0.0001) return sum;
      return sum + Math.max(0, entry.count || 0);
    }, 0);
    const availableVillagers = Math.max(0, villagers - busyBuilders);
    const next = { ...desired };
    if (noBoarCiv && next.boar > 0) {
      next.boar = 0;
      notes.push("Boar unavailable for this civ");
    }
    if (civBonus.farmsDisabled && next.farm > 0) {
      next.farm = 0;
      notes.push("Farms disabled for this civ");
    }
    if (next.farm > farmCount) {
      next.farm = farmCount;
      notes.push(farmCount > 0 ? `Farm cap ${farmCount}` : "No farms built");
    }
    const totalAssigned = sumAssignments(next);
    if (totalAssigned > availableVillagers) {
      notes.push(busyBuilders > 0 ? `Assigned > available (busy builders: ${busyBuilders})` : "Assigned > available (capped)");
    }
    const capped = { ...next };
    let over = totalAssigned - availableVillagers;
    capOrder.forEach((r) => {
      if (over <= 0) return;
      const take = Math.min(over, capped[r] || 0);
      capped[r] -= take;
      over -= take;
    });

    assignments.berries = capped.berries;
    assignments.deer = capped.deer;
    assignments.boar = capped.boar;
    assignments.sheep = capped.sheep;
    assignments.farm = capped.farm;
    assignments.wood = capped.wood;
    assignments.gold = capped.gold;
    assignments.stone = capped.stone;
    assignments.idle = Math.max(0, availableVillagers - sumAssignments(capped));

    applyTripOverrideUpdates(overrides);
    syncGatherSegments(time);
    syncDropoffCohorts(BO_RESOURCE_KEYS, time);
    return assignmentLabelFromCounts(capped);
  }

  function countAvailableBuilders(source) {
    const pools = ["idle", "sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"];
    if (source === "any") {
      return pools.reduce((sum, key) => sum + Math.max(0, key === "farm" ? Math.min(assignments.farm || 0, farmCount) : (assignments[key] || 0)), 0);
    }
    if (source === "farm") return Math.max(0, Math.min(assignments.farm || 0, farmCount));
    return Math.max(0, assignments[source] || 0);
  }

  function pullBuilders(source, count) {
    const entries = [];
    let remaining = count;
    const takeFrom = (src) => {
      if (remaining <= 0) return;
      const available = assignments[src] || 0;
      if (available <= 0) return;
      const used = Math.min(available, remaining);
      assignments[src] -= used;
      entries.push({ source: src, count: used });
      remaining -= used;
    };

    if (source === "any") {
      ["idle", "sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"].forEach(takeFrom);
    } else if (assignments[source] !== undefined) {
      takeFrom(source);
    }

    syncGatherSegments(time);
    syncDropoffCohorts(BO_RESOURCE_KEYS, time);

    return { used: count - remaining, entries };
  }

  function depositHeldIfAvailable(res) {
    if (!dropoffAvailable(res)) return;
    if (held[res] > 0) {
      const harvested = held[res];
      const deposit = harvested * getDropoffReturnMult(res);
      if (isFood(res)) resources.food += deposit;
      else resources[res] += deposit;
      addGathered(isFood(res) ? "food" : res, deposit);
      addJapaneseSilverMiningBonus(res, deposit);
      addRusBountyGold(res, harvested);
      held[res] = 0;
    }
  }

  function waitForTcIdle() {
    const queue = (productionQueues["Town Center"] || []).find((q) => q.id === "TC #1");
    const tcAuto = busy.find((b) => b.kind === "tcAuto" && b.tcId === "TC #1");
    const next = Math.max(queue?.busyUntil || 0, tcAuto?.endTime || 0, tcBusyUntil || 0);
    if (next > time) {
      advanceTo(next);
    }
  }

  function hasOttomanInfluenceSource() {
    if (civ !== "Ottomans") return false;
    return (buildingCounts["Blacksmith"] || 0) > 0 || (buildingCounts["University"] || 0) > 0;
  }

  function getOttomanMilitarySchoolCap() {
    const school = civBonus.militarySchool || {};
    const basePerAge = school.baseLimitPerAge || 1;
    const bonus = getOttomanActiveEffects().militaryCampus ? (school.militaryCampusBonus || 1) : 0;
    return (Math.max(1, age) * basePerAge) + bonus;
  }

  function getUnitAvailabilityIssue(unitName, buildingType) {
    const ottomanEffects = getOttomanActiveEffects();
    if (civ === "Malians" && unitName === "Cattle" && malianCattleCount >= 20) {
      return { type: "blocked", message: "Blocked (Cattle limit reached)" };
    }
    if (
      civ === "Ottomans" &&
      buildingType === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING &&
      (civBonus.militarySchool?.advancedAcademyUnits || []).includes(unitName) &&
      !ottomanEffects.advancedAcademy
    ) {
      return { type: "blocked", message: "Blocked (requires Advanced Academy)" };
    }
    if (!isBoUnitTrainableAtBuilding(unitName, buildingType, civ, ottomanEffects)) {
      return { type: "blocked", message: `Blocked (${unitName} unavailable at ${buildingType})` };
    }
    const minAge = getBoUnitMinAge(unitName, civ);
    if (age < minAge) {
      return { type: "waitAge", message: `Waiting for Age ${minAge}` };
    }
    return null;
  }

  function waitForUnitUnlock(unitName, buildingType, notes) {
    let warned = false;
    while (true) {
      const issue = getUnitAvailabilityIssue(unitName, buildingType);
      if (!issue) return true;
      if (issue.type !== "waitAge") {
        if (issue.message) notes?.push(issue.message);
        return false;
      }
      const nextBusy = nextBusyTime();
      if (nextBusy === null) {
        if (issue.message) notes?.push(issue.message);
        return false;
      }
      if (!warned && issue.message) {
        notes?.push(issue.message);
        warned = true;
      }
      advanceTo(nextBusy);
    }
  }

  function getUnitProductionSpec(unitName, buildingType, count = 1) {
    const unitDef = getBoUnitDefaults(unitName, civ);
    const baseCost = unitDef?.cost || { food: 0, wood: 0, gold: 0, stone: 0 };
    const baseTime = unitDef?.time || 0;
    const trainingSurface = getBoTrainingSurface(buildingType, civ);
    const surfaceConfig = getBoBuildingSurfaceConfig(buildingType, civ);
    const unitTrainMod = getBoUnitTrainModifier(buildingType, civ, unitName);
    const ottomanEffects = getOttomanActiveEffects();
    const howEffects = getHouseOfWisdomEffects();
    let cost = {
      food: (baseCost.food || 0) * count,
      wood: (baseCost.wood || 0) * count,
      gold: (baseCost.gold || 0) * count,
      stone: (baseCost.stone || 0) * count
    };
    let timePerUnit = baseTime;
    if (civ === "Abbasid Dynasty" && resolveBoUnitName(unitName) === "Villager" && isTechResearched("Fresh Foodstuffs")) {
      cost.food = Math.round((cost.food || 0) * 0.6);
    }
    if (civ === "Mongols" && /horseman/i.test(unitName)) {
      timePerUnit *= civBonus.horsemenTrainTimeMult || 0.75;
    }
    if (trainingSurface === "Town Center") {
      const tcWorkRatePct = getBoAgeBonusValue(civBonus.townCenterWorkRateByAge, age);
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, tcWorkRatePct);
    }
    if (isSiegeUnit(unitName) && Number.isFinite(howEffects.goldenAge?.bonuses?.siegeCostMult) && howEffects.goldenAge.bonuses.siegeCostMult > 0) {
      const mult = howEffects.goldenAge.bonuses.siegeCostMult;
      cost = {
        food: Math.round((cost.food || 0) * mult),
        wood: Math.round((cost.wood || 0) * mult),
        gold: Math.round((cost.gold || 0) * mult),
        stone: Math.round((cost.stone || 0) * mult)
      };
    }
    if (buildingType === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING && civ === "Ottomans") {
      const school = civBonus.militarySchool || {};
      cost = { food: 0, wood: 0, gold: 0, stone: 0 };
      timePerUnit *= school.trainTimeMult || 4.75;
    }
    if (Number.isFinite(unitTrainMod.costMult) && unitTrainMod.costMult > 0 && unitTrainMod.costMult !== 1) {
      cost = {
        food: Math.round((cost.food || 0) * unitTrainMod.costMult),
        wood: Math.round((cost.wood || 0) * unitTrainMod.costMult),
        gold: Math.round((cost.gold || 0) * unitTrainMod.costMult),
        stone: Math.round((cost.stone || 0) * unitTrainMod.costMult)
      };
    }
    if (Number.isFinite(unitTrainMod.timePct) && unitTrainMod.timePct > 0) {
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, unitTrainMod.timePct);
    }
    if (Number.isFinite(surfaceConfig.trainTimePct) && surfaceConfig.trainTimePct > 0) {
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, surfaceConfig.trainTimePct);
    }
    const houseProductionPct = getHouseOfWisdomProductionPct();
    if (BO_PRODUCTION_BUILDINGS.has(trainingSurface) && houseProductionPct > 0) {
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, houseProductionPct);
    }
    const militarySpeedPct = getBoMilitaryProductionSpeedPct(civ, trainingSurface, age, {
      ottomanSettings: ottomanEffects,
      hasInfluenceSource: hasOttomanInfluenceSource()
    });
    if (militarySpeedPct) {
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, militarySpeedPct);
    }
    if (civ === "Ottomans" && resolveBoUnitName(unitName) === "Villager" && ottomanEffects.paxOttomana) {
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, 75);
    }
    const duration = timePerUnit * count;
    return { unitDef, cost, duration, timePerUnit };
  }

  function inferBuildingTypeFromId(id) {
    if (!id) return null;
    if (id.startsWith("TC ")) return "Town Center";
    return id.split(" #")[0] || null;
  }

  function getLandmarkTargetAge(name) {
    if (!name) return null;
    const defAge = getBoBuildingDefaults(name)?.landmarkAge;
    if (Number.isFinite(defAge)) return defAge;
    if (name.includes("Age II")) return 2;
    if (name.includes("Age III")) return 3;
    if (name.includes("Age IV")) return 4;
    return null;
  }

  function hasBuildingInstance(type, id) {
    if (!type) return false;
    if (!id) return (buildingCounts[type] || 0) > 0;
    const list = buildingInstances[type] || [];
    return list.includes(id);
  }

  function meetsSimTechRequirements(def) {
    if (!def) return true;
    if ((age || 1) < Math.max(1, def.minAge || 1)) return false;
    if (isTechResearched(def.name)) return false;
    const requiresTechs = Array.isArray(def.requiresTechs) ? def.requiresTechs : [];
    if (requiresTechs.some((name) => !isTechResearched(name))) return false;
    const requiresBuildings = Array.isArray(def.requiresBuildings) ? def.requiresBuildings : [];
    if (requiresBuildings.some((name) => (buildingCounts[name] || 0) <= 0)) return false;
    if (def.requiresHouseOfWisdomWing && !isHouseOfWisdomWingChosen(def.requiresHouseOfWisdomWing)) return false;
    return true;
  }

  function getTechWaitReason(def) {
    if (!def) return null;
    if ((age || 1) < Math.max(1, def.minAge || 1)) return `Age ${def.minAge}`;
    const requiresTechs = Array.isArray(def.requiresTechs) ? def.requiresTechs : [];
    const missingTech = requiresTechs.find((name) => !isTechResearched(name));
    if (missingTech) return missingTech;
    const requiresBuildings = Array.isArray(def.requiresBuildings) ? def.requiresBuildings : [];
    const missingBuilding = requiresBuildings.find((name) => (buildingCounts[name] || 0) <= 0);
    if (missingBuilding) return missingBuilding;
    if (def.requiresHouseOfWisdomWing && !isHouseOfWisdomWingChosen(def.requiresHouseOfWisdomWing)) {
      return `${getBoHouseOfWisdomWingLabel(civ, def.requiresHouseOfWisdomWing)} Wing`;
    }
    if (isTechResearched(def.name)) return def.name;
    return null;
  }

  function waitForBuildingAvailable(type, id, actionLabel, notes) {
    const resolvedType = type || inferBuildingTypeFromId(id);
    if (!resolvedType) return true;
    while (!hasBuildingInstance(resolvedType, id)) {
      const nextBusy = nextBusyTime();
      if (nextBusy === null) {
        return false;
      }
      notes?.push(`Waiting for ${id || resolvedType}`);
      advanceTo(nextBusy);
    }
    return true;
  }

  function waitForTechAvailable(def, actionLabel, notes) {
    if (!def) return true;
    while (!meetsSimTechRequirements(def)) {
      const waitFor = getTechWaitReason(def);
      if (isTechResearched(def.name)) return false;
      const nextBusy = nextBusyTime();
      if (nextBusy === null) return false;
      if (waitFor) notes?.push(`Waiting for ${waitFor}`);
      advanceTo(nextBusy);
    }
    return true;
  }

  function getQueueForAutoQueue(buildingType, buildingId) {
    if (!buildingType) return null;
    const list = productionQueues[buildingType] || [];
    if (!list.length) return null;
    if (buildingId) return list.find((q) => q.id === buildingId) || null;
    return list.reduce((best, q) => (q.busyUntil < best.busyUntil ? q : best), list[0]);
  }

  function getAutoQueueSpec(cmd, buildingType) {
    const unitName = cmd.payload.unitName;
    const spec = getUnitProductionSpec(unitName, buildingType, 1);
    let cost = spec.cost;
    let timePerUnit = spec.timePerUnit;
    if (!cmd.autoCost) cost = { ...(cmd.payload.cost || cost) };
    if (!cmd.autoTime) timePerUnit = cmd.payload.timePerUnit || timePerUnit;
    if (!Number.isFinite(timePerUnit) || timePerUnit <= 0) timePerUnit = spec.timePerUnit || 0.1;
    return { unitName, cost, timePerUnit, unitDef: spec.unitDef };
  }

  function getFiniteQueueKey(buildingType, buildingId) {
    return `${buildingType || ""}|${buildingId || ""}`;
  }

  function hasBlockingFiniteQueueAtTime(buildingType, buildingId, atTime) {
    const key = getFiniteQueueKey(buildingType, buildingId);
    if (
      advanceFiniteReservation &&
      getFiniteQueueKey(advanceFiniteReservation.buildingType, advanceFiniteReservation.buildingId) === key &&
      (advanceFiniteReservation.startTime || 0) <= atTime + 0.0001
    ) {
      return true;
    }
    return finiteQueues.some((queue) =>
      !queue.done &&
      getFiniteQueueKey(queue.buildingType, queue.buildingId) === key &&
      (queue.startTime || 0) <= atTime + 0.0001
    );
  }

  function nextBuildQueueStartTime() {
    if (!buildQueues.length) return null;
    let soonest = null;
    buildQueues.forEach((queue) => {
      if (!queue || queue.done || queue.active) return;
      const step = queue.steps?.[queue.nextIndex];
      if (!step) return;
      if ((step.minAge || 1) > age) return;
      if (step.buildingName === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING && (buildingCounts[BO_OTTOMAN_MILITARY_SCHOOL_BUILDING] || 0) >= getOttomanMilitarySchoolCap()) return;
      const readyAt = Math.max(time, queue.availableAt || 0);
      const timeNeeded = timeToAfford(step.cost || { food: 0, wood: 0, gold: 0, stone: 0 });
      if (!Number.isFinite(timeNeeded)) return;
      const candidate = Math.max(readyAt, time + timeNeeded);
      if (soonest === null || candidate < soonest) soonest = candidate;
    });
    return soonest;
  }

  function tryStartBuildQueues() {
    if (!buildQueues.length) return;
    buildQueues.forEach((queue) => {
      if (!queue || queue.done || queue.active) return;
      const step = queue.steps?.[queue.nextIndex];
      if (!step) {
        queue.done = true;
        return;
      }
      if ((step.minAge || 1) > age) return;
      if (step.buildingName === BO_OTTOMAN_MILITARY_SCHOOL_BUILDING && (buildingCounts[BO_OTTOMAN_MILITARY_SCHOOL_BUILDING] || 0) >= getOttomanMilitarySchoolCap()) return;
      if (time + 0.0001 < (queue.availableAt || 0)) return;
      if (!hasResources(step.cost || { food: 0, wood: 0, gold: 0, stone: 0 })) return;
      const resBefore = { ...resources };
      const cost = step.cost || { food: 0, wood: 0, gold: 0, stone: 0 };
      resources.food -= cost.food || 0;
      resources.wood -= cost.wood || 0;
      resources.gold -= cost.gold || 0;
      resources.stone -= cost.stone || 0;
      const start = time;
      const end = start + Math.max(0, step.duration || 0);
      queue.active = true;
      queue.availableAt = end;
      busy.push({
        endTime: end,
        kind: "buildComplete",
        buildingName: step.buildingName,
        queueId: queue.id
      });
      timeline.push({
        start,
        end,
        action: `Build ${step.buildingName}`,
        notes: step.notes || "",
        lane: "Construction",
        commandId: queue.id,
        before: resBefore,
        after: { ...resources },
        buildingType: step.buildingName,
        fullLabel: step.fullLabel,
        shortLabel: step.shortLabel || step.buildingName,
        segmentIndex: step.segmentIndex
      });
      pushSample(start, resBefore);
      pushSample(start + 0.001, resources);
    });
  }

  function nextAutoQueueStartTime() {
    if (!autoQueues.length) return null;
    let soonest = null;
    autoQueues.forEach((aq) => {
      if (time >= aq.endTime) return;
      const cmd = aq.cmd;
      const buildingType = cmd.payload.building || aq.buildingType || "Barracks";
      const buildingId = cmd.payload.buildingId || aq.buildingId || null;
      if (!buildingId) return;
      const queue = getQueueForAutoQueue(buildingType, buildingId);
      if (!queue) return;
      const unitName = cmd.payload.unitName;
      const isTc = isBoTownCenterSurface(buildingType, civ);
      if (isTc && !(unitName === "Villager" || unitName === "Scout")) return;
      if (!isTc && (unitName === "Villager" || unitName === "Scout")) return;
      const unitIssue = getUnitAvailabilityIssue(unitName, buildingType);
      if (unitIssue) return;
      const windowStart = Math.max(time, aq.startTime || 0);
      if (windowStart >= aq.endTime) return;
      const queueReady = Math.max(windowStart, queue.busyUntil || 0);
      if (queueReady >= aq.endTime) return;
      if (hasBlockingFiniteQueueAtTime(buildingType, buildingId, queueReady)) return;
      const { cost } = getAutoQueueSpec(cmd, buildingType);
      const timeNeeded = timeToAfford(cost);
      if (!isFinite(timeNeeded)) return;
      const candidate = Math.max(queueReady, time + timeNeeded);
      if (candidate >= aq.endTime) return;
      if (soonest === null || candidate < soonest) soonest = candidate;
    });
    return soonest;
  }

  function tryStartAutoQueues() {
    if (!autoQueues.length) return;
    autoQueues.splice(0, autoQueues.length, ...autoQueues.filter((aq) => aq.endTime > time));
    if (!autoQueues.length) return;
    let startedAny = false;
    autoQueues.forEach((aq) => {
      if (time < aq.startTime || time >= aq.endTime) return;
      const cmd = aq.cmd;
      const buildingType = cmd.payload.building || aq.buildingType || "Barracks";
      const buildingId = cmd.payload.buildingId || aq.buildingId || null;
      const queue = getQueueForAutoQueue(buildingType, buildingId);
      if (!queue || queue.busyUntil > time + 0.0001) return;
      if (hasBlockingFiniteQueueAtTime(buildingType, buildingId, time)) return;
      if (isBoTownCenterSurface(buildingType, civ) && !(cmd.payload.unitName === "Villager" || cmd.payload.unitName === "Scout")) return;
      if (!isBoTownCenterSurface(buildingType, civ) && (cmd.payload.unitName === "Villager" || cmd.payload.unitName === "Scout")) return;
      if (getUnitAvailabilityIssue(cmd.payload.unitName, buildingType)) return;
      const { unitName, cost, timePerUnit } = getAutoQueueSpec(cmd, buildingType);
      if (!hasResources(cost)) return;
      const resBefore = { ...resources };
      resources.food -= cost.food;
      resources.wood -= cost.wood;
      resources.gold -= cost.gold;
      resources.stone -= cost.stone;
      const start = time;
      const costTime = start + 0.001;
      const end = time + Math.max(0.1, timePerUnit || 0.1);
      queue.busyUntil = end;
      if (unitName === "Villager" && queue.id) {
        busy.push({
          endTime: end,
          kind: "trainVill",
          rallyTarget: cmd.payload.rallyTarget || "idle",
          rallyTravelDelaySec: Math.max(0, cmd.payload.rallyTravelDelaySec || 0),
          rallyTripOverrideSec: Number.isFinite(cmd.payload.rallyTripOverrideSec) ? cmd.payload.rallyTripOverrideSec : null,
          tcId: queue.id
        });
      } else {
        busy.push({
          endTime: end,
          kind: "unitComplete",
          unitName,
          buildingId: queue.id,
          buildingType,
          label: `${unitName} complete`
        });
      }
      const rallyLabel = unitName === "Villager" ? (cmd.payload.rallyTarget || "idle") : null;
      timeline.push({
        start,
        end: start,
        action: unitName === "Villager" && isBoTownCenterSurface(buildingType, civ)
          ? `Rally Villagers -> ${rallyLabel}`
          : (rallyLabel ? `Repeat Villager -> ${rallyLabel}` : `Repeat ${unitName}`),
        notes: buildingId ? `(${buildingId})` : "",
        lane: queue.id || buildingType,
        commandId: null,
        before: resBefore,
        after: { ...resources }
      });
      pushSample(start, resBefore);
      pushSample(costTime, resources);
      startedAny = true;
    });
    if (startedAny) {
      autoQueues.splice(0, autoQueues.length, ...autoQueues.filter((aq) => aq.endTime > time));
    }
  }

  function nextFiniteQueueStartTime() {
    if (!finiteQueues.length) return null;
    let soonest = null;
    finiteQueues.forEach((fq) => {
      if (!fq || fq.done || fq.remainingCount <= 0) return;
      if (time + 0.0001 < (fq.startTime || 0)) {
        const candidate = fq.startTime || 0;
        if (soonest === null || candidate < soonest) soonest = candidate;
        return;
      }
      const queue = getQueueForAutoQueue(fq.buildingType, fq.buildingId);
      if (!queue) return;
      const unitIssue = getUnitAvailabilityIssue(fq.unitName, fq.buildingType);
      if (unitIssue) return;
      const readyAt = Math.max(time, queue.busyUntil || 0, fq.startTime || 0);
      const timeNeeded = timeToAfford(fq.cost);
      if (!isFinite(timeNeeded)) return;
      const candidate = Math.max(readyAt, time + timeNeeded);
      if (soonest === null || candidate < soonest) soonest = candidate;
    });
    return soonest;
  }

  function tryStartFiniteQueues() {
    if (!finiteQueues.length) return;
    finiteQueues.forEach((fq) => {
      if (!fq || fq.done || fq.remainingCount <= 0) return;
      if (time + 0.0001 < (fq.startTime || 0)) return;
      const queue = getQueueForAutoQueue(fq.buildingType, fq.buildingId);
      if (!queue || queue.busyUntil > time + 0.0001) return;
      if (getUnitAvailabilityIssue(fq.unitName, fq.buildingType)) return;
      if (!hasResources(fq.cost)) return;

      const resBefore = { ...resources };
      resources.food -= fq.cost.food || 0;
      resources.wood -= fq.cost.wood || 0;
      resources.gold -= fq.cost.gold || 0;
      resources.stone -= fq.cost.stone || 0;

      const start = time;
      const end = start + Math.max(0.1, fq.timePerUnit || 0.1);
      queue.busyUntil = end;
      busy.push({
        endTime: end,
        kind: "trainVill",
        rallyTarget: fq.rallyTarget || "idle",
        rallyTravelDelaySec: Math.max(0, fq.rallyTravelDelaySec || 0),
        rallyTripOverrideSec: Number.isFinite(fq.rallyTripOverrideSec) ? fq.rallyTripOverrideSec : null,
        tcId: queue.id,
        sourceCommandId: fq.commandId || null,
        buildingId: fq.buildingId || queue.id,
        buildingType: fq.buildingType || "Town Center",
        timePerUnit: fq.timePerUnit || BO_VILLAGER_TIME
      });

      if (!fq.timelineRow) {
        fq.timelineRow = {
          start,
          end,
          action: fq.actionLabel,
          notes: fq.notes || "",
          lane: fq.lane || queue.id || fq.buildingType,
          commandId: fq.commandId || null,
          before: resBefore,
          after: { ...resources }
        };
        timeline.push(fq.timelineRow);
      } else {
        fq.timelineRow.end = end;
      }

      fq.remainingCount -= 1;
      if (fq.remainingCount <= 0) fq.done = true;

      pushSample(start, resBefore);
      pushSample(start + 0.001, resources);
    });
    for (let i = finiteQueues.length - 1; i >= 0; i--) {
      if (finiteQueues[i]?.done) finiteQueues.splice(i, 1);
    }
  }

  const plannedCommands = getBoExecutionPlan(commands);
  plannedCommands.forEach(({ cmd, start: plannedStart, end: plannedEnd }) => {
    const earliest = plannedStart;
    const reserveFiniteRallyAtStart =
      cmd?.type === "trainUnit" &&
      !cmd.payload?.repeatUntilEnd &&
      cmd.payload?.unitName === "Villager" &&
      isBoTownCenterSurface(cmd.payload?.building || inferBuildingTypeFromId(cmd.payload?.buildingId) || "Barracks", civ) &&
      !!cmd.payload?.buildingId
        ? {
            buildingType: cmd.payload?.building || inferBuildingTypeFromId(cmd.payload?.buildingId) || "Town Center",
            buildingId: cmd.payload.buildingId,
            startTime: earliest
          }
        : null;
    if (time < earliest) {
      advanceTo(earliest, reserveFiniteRallyAtStart ? { finiteReservation: reserveFiniteRallyAtStart } : undefined);
    }

    let cost = { food: 0, wood: 0, gold: 0, stone: 0 };
    let duration = 0;
    let effectiveTrainTimePerUnit = null;
    let notes = [];
    let actionLabel = "";

    if (cmd.type === "autoVill") {
      warnings.push("Ignored legacy Auto-TC command");
      pushEvent("Auto-TC (legacy)", "Ignored (manual training only)", laneFor(cmd), cmd.id);
      return;
    }
    if (cmd.type === "ageUp" || cmd.type === "bonus") {
      warnings.push(`Ignored legacy command: ${cmd.type}`);
      pushEvent(cmd.type === "ageUp" ? "Age Up (legacy)" : "Bonus (legacy)", "Ignored (use Landmark builds)", laneFor(cmd), cmd.id);
      return;
    }
    if (cmd.type === "rally") {
      warnings.push("Ignored legacy Rally command");
      pushEvent("Rally (legacy)", "Ignored (use per-queue target)", laneFor(cmd), cmd.id);
      return;
    }
    if (cmd.type === "trainUnit" && !cmd.payload?.buildingId) {
      warnings.push("Blocked: Train Unit (select a building)");
      pushEvent("Train Unit", "Blocked (select a building)", laneFor(cmd), cmd.id);
      return;
    }
    if (cmd.type === "autoQueue" && !cmd.payload?.buildingId) {
      warnings.push("Blocked: Legacy repeat queue (select a building)");
      pushEvent("Legacy repeat queue", "Blocked (select a building)", laneFor(cmd), cmd.id);
      return;
    }

    if (cmd.type === "garrisonScholars" && civ !== "Delhi Sultanate") {
      warnings.push("Blocked: Garrison Scholars (Delhi only)");
      pushEvent("Garrison Scholars", "Blocked (Delhi only)", laneFor(cmd), cmd.id);
      return;
    }
    if (cmd.type === "tech" && civ !== "Delhi Sultanate") {
      const delhiOnlyTechs = new Set(["Sanctity", "Dome of the Faith"]);
      if (delhiOnlyTechs.has(cmd.payload?.techType)) {
        warnings.push(`Blocked: ${cmd.payload?.techType} (Delhi only)`);
        pushEvent(`Research ${cmd.payload?.techType}`, "Blocked (Delhi only)", laneFor(cmd), cmd.id);
        return;
      }
    }

    if (cmd.type === "assign") {
      const resBefore = { ...resources };
      const desired = {
        berries: cmd.payload.berries || 0,
        deer: cmd.payload.deer || 0,
        boar: cmd.payload.boar || 0,
        sheep: cmd.payload.sheep || 0,
        farm: cmd.payload.farm || 0,
        wood: cmd.payload.wood || 0,
        gold: cmd.payload.gold || 0,
        stone: cmd.payload.stone || 0
      };
      const overrides = cmd.payload.tripOverrides || {};
      const travelDelay = effectiveMoveTime(cmd.payload.travelDelaySec || 0);
      if (travelDelay > 0) {
        actionLabel = assignmentLabelFromCounts(desired);
        const start = time;
        const end = time + travelDelay;
        notes.push(`Travel ${Number(travelDelay.toFixed(2))}s`);
        busy.push({ endTime: end, kind: "assignDelay", desired, overrides });
        timeline.push({
          start,
          end,
          action: actionLabel,
          notes: notes.join(", "),
          lane: laneFor(cmd),
          commandId: cmd.id,
          before: resBefore,
          after: { ...resources }
        });
        pushSample(start, resBefore);
        return;
      }

      actionLabel = applyAssignment(desired, notes, overrides);
      timeline.push({
        start: time,
        end: time,
        action: actionLabel,
        notes: notes.join(", "),
        lane: laneFor(cmd),
        commandId: cmd.id,
        before: resBefore,
        after: { ...resources }
      });
      pushSample(time, resBefore);
      pushSample(time, resources);
      return;
    } else if (cmd.type === "resourceTrip") {
      const resource = BO_RESOURCE_KEYS.includes(cmd.payload?.resource) ? cmd.payload.resource : null;
      const nextTrip = Number.isFinite(cmd.payload?.tripOverrideSec) ? Math.max(0, cmd.payload.tripOverrideSec) : null;
      if (!resource || nextTrip === null) {
        warnings.push("Blocked: Resource trip (invalid resource)");
        pushEvent("Resource trip", "Blocked (invalid resource)", laneFor(cmd), cmd.id);
        return;
      }
      const resBefore = { ...resources };
      syncDropoffCohorts([resource], time);
      tripOverrides[resource] = nextTrip;
      syncDropoffCohorts([resource], time);
      actionLabel = getBoCommandLabel(cmd);
      timeline.push({
        start: time,
        end: time,
        action: actionLabel,
        notes: "",
        lane: laneFor(cmd),
        commandId: cmd.id,
        before: resBefore,
        after: { ...resources }
      });
      pushSample(time, resBefore);
      pushSample(time, resources);
      return;
    } else if (cmd.type === "vizierChoice") {
      const choice = getBoOttomanChoiceDef(cmd.payload?.choiceId);
      const issue = getOttomanVizierChoiceIssue(cmd.payload?.choiceId);
      if (!choice || issue) {
        const reason = issue || "Blocked (invalid Vizier choice)";
        warnings.push(`${getBoCommandLabel(cmd)}: ${reason}`);
        pushEvent(getBoCommandLabel(cmd), reason, laneFor(cmd), cmd.id);
        return;
      }
      const resBefore = { ...resources };
      vizierChoices.push({ id: choice.id, time });
      vizierChoiceSet.add(choice.id);
      let choiceNotes = [];
      if (choice.id === "anatolianHills") {
        const addedSheepFood = 10 * Math.max(0, foodNodes.sheep?.amount || BO_NODE_AMOUNTS.sheep || 200);
        foodRemaining.sheep += addedSheepFood;
        choiceNotes.push("Spawn 10 Sheep at the Capital Town Center");
      }
      if (choice.id === "paxOttomana") {
        paxOttomanaUntil = Math.max(paxOttomanaUntil, time + 240);
      }
      if (choice.id === "greatBombard" && age < 4) {
        greatBombardNeedsImperialUpgrade = true;
      }
      const spawnNote = getOttomanVizierSpawnNote(choice.id);
      if (spawnNote) choiceNotes.push(spawnNote);
      if (choice.id === "siegeCrews") choiceNotes.push("Combat effect tracked as unlocked only");
      if (choice.id === "extensiveFortifications") choiceNotes.push("Town Centers, Outposts, and Keeps cost 20% less from now on");
      actionLabel = getBoCommandLabel(cmd);
      timeline.push({
        start: time,
        end: time,
        action: actionLabel,
        notes: choiceNotes.join(", "),
        lane: laneFor(cmd),
        commandId: cmd.id,
        before: resBefore,
        after: { ...resources }
      });
      pushSample(time, resBefore);
      pushSample(time, resources);
      return;
    } else if (cmd.type === "houseOfWisdomWing") {
      if (!howCiv) {
        warnings.push("Blocked: House of Wisdom (civ not supported)");
        pushEvent(getBoCommandLabel(cmd), "Blocked (House of Wisdom not used by this civ)", laneFor(cmd), cmd.id);
        return;
      }
      const wing = cmd.payload?.wing || "culture";
      const branch = cmd.payload?.branch || null;
      if (houseOfWisdomState.wings.some((entry) => entry.wing === wing)) {
        warnings.push(`Blocked: ${getBoCommandLabel(cmd)} (wing already chosen)`);
        pushEvent(getBoCommandLabel(cmd), "Blocked (wing already chosen)", laneFor(cmd), cmd.id);
        return;
      }
      if (civ === "Ayyubids" && !BO_AYYUBID_HOW_BRANCHES[wing]?.branches?.[branch]) {
        warnings.push(`Blocked: ${getBoCommandLabel(cmd)} (invalid branch)`);
        pushEvent(getBoCommandLabel(cmd), "Blocked (invalid branch)", laneFor(cmd), cmd.id);
        return;
      }
      const spec = getBoHouseOfWisdomCommandSpec(cmd, civ, {
        completedCount: houseOfWisdomState.wings.length,
        effects: houseOfWisdomState.effects,
        researchPct: getHouseOfWisdomResearchPct()
      });
      if (cmd.autoCost) cmd.payload.cost = { ...spec.cost };
      if (cmd.autoTime) cmd.payload.time = spec.time;
      cmd.payload.targetAge = spec.targetAge;
      cmd.payload.building = BO_HOUSE_OF_WISDOM_BUILDING;
      cmd.payload.buildingId = BO_HOUSE_OF_WISDOM_BUILDING;
      cost = { ...(cmd.payload.cost || spec.cost) };
      duration = Math.max(0, cmd.payload.time || spec.time || 0);
      actionLabel = getBoCommandLabel(cmd);
      if (time + 0.0001 < houseOfWisdomBusyUntil) {
        notes.push("Delayed (House of Wisdom)");
        advanceTo(houseOfWisdomBusyUntil);
      }
    } else if (cmd.type === "buildBuilding") {
      const buildSteps = getBoBuildSteps(cmd.payload);
      const legacyLandmarkStep = howCiv ? buildSteps.find((step) => /^Landmark \(Age /.test(step.building || "")) : null;
      if (legacyLandmarkStep) {
        warnings.push(`Blocked: ${legacyLandmarkStep.building} (use House of Wisdom)`);
        pushEvent(`Build ${legacyLandmarkStep.building}`, "Blocked (replace with House of Wisdom wing)", laneFor(cmd), cmd.id);
        return;
      }
      const buildingName = buildSteps[0]?.building || "Building";
      const def = getBoBuildingDefaults(buildingName) || {};
      let minAge = def.minAge || 1;
      if (civ === "Mongols" && buildingName === "Stable") minAge = 1;
      if (civ === "Japanese" && buildingName === "Barracks") minAge = 1;
      const blockedFarm = buildSteps.find((step) => civBonus.farmsDisabled && step.building === "Farm");
      if (blockedFarm) {
        warnings.push(`Blocked: Build ${blockedFarm.building} (farms disabled)`);
        pushEvent(`Build ${blockedFarm.building}`, "Blocked (farms disabled)", laneFor(cmd), cmd.id);
        return;
      }
      const blockedShintoShrine = civ === "Japanese" && buildSteps.find((step) => step.building === "Shinto Shrine") && (buildingCounts["Floating Gate"] || 0) <= 0;
      if (blockedShintoShrine) {
        warnings.push("Blocked: Build Shinto Shrine (requires Floating Gate)");
        pushEvent("Build Shinto Shrine", "Blocked (requires Floating Gate)", laneFor(cmd), cmd.id);
        return;
      }
      const blockedBuddhistTemple = civ === "Japanese" && buildSteps.find((step) => step.building === "Buddhist Temple") && (buildingCounts["Temple of Equality"] || 0) <= 0;
      if (blockedBuddhistTemple) {
        warnings.push("Blocked: Build Buddhist Temple (requires Temple of Equality)");
        pushEvent("Build Buddhist Temple", "Blocked (requires Temple of Equality)", laneFor(cmd), cmd.id);
        return;
      }
      const requestedPitMines = civ === "Malians"
        ? buildSteps.reduce((sum, step) => step.building === "Pit Mine" ? sum + Math.max(1, step.count || 1) : sum, 0)
        : 0;
      if (civ === "Malians" && requestedPitMines > 0 && ((buildingCounts["Pit Mine"] || 0) + requestedPitMines) > age) {
        warnings.push("Blocked: Build Pit Mine (limit 1 per Age)");
        pushEvent("Build Pit Mine", "Blocked (limit 1 per Age)", laneFor(cmd), cmd.id);
        return;
      }
      if (age < minAge) {
        warnings.push(`Blocked: Build ${buildingName} (requires Age ${minAge})`);
        pushEvent(`Build ${buildingName}`, `Blocked (requires Age ${minAge})`, laneFor(cmd), cmd.id);
        return;
      }
      actionLabel = `Build ${getBoBuildQueueSummary(cmd.payload)}`;
    } else if (cmd.type === "tech") {
      cost = { ...cmd.payload.cost };
      duration = cmd.payload.time || 0;
      if (cmd.autoTime) {
        const techBuildingType = cmd.payload.building || inferBuildingTypeFromId(cmd.payload.buildingId);
        if (getBoTechSurface(techBuildingType, civ) === "Town Center") {
          const tcWorkRatePct = getBoAgeBonusValue(civBonus.townCenterWorkRateByAge, age);
          duration = applyBoWorkRateToDuration(duration, tcWorkRatePct);
        }
      }
      actionLabel = `Research ${cmd.payload.techType}`;
      if (civ === "Delhi Sultanate" && civBonus.techCostFree) {
        cost = { food: 0, wood: 0, gold: 0, stone: 0 };
      }
      if (civ === "Delhi Sultanate" && civBonus.scholarFormula) {
        const base = duration;
        const min = base * (civBonus.scholarFormula.minFraction || 1 / 15);
        const ratio = civBonus.scholarFormula.ratio || 0.8780845;
        const maxN = civBonus.scholarFormula.maxScholars || 53;
        const n = Math.min(maxN, Math.max(0, scholarGarrison));
        duration = Math.floor((base - min) * Math.pow(ratio, n) + min);
      }
      if (getHouseOfWisdomResearchPct() > 0) {
        duration = applyBoWorkRateToDuration(duration, getHouseOfWisdomResearchPct());
      }
    } else if (cmd.type === "rally") {
      actionLabel = `Set Rally -> ${cmd.payload.target}`;
    } else if (cmd.type === "trainUnit") {
      const unitName = cmd.payload.unitName;
      const repeating = !!cmd.payload.repeatUntilEnd;
      const count = repeating ? 1 : Math.max(1, cmd.payload.count || 1);
      const buildingType = cmd.payload.building || "Barracks";
      const buildingId = cmd.payload.buildingId || null;
      const availabilityIssue = getUnitAvailabilityIssue(unitName, buildingType);
      if (availabilityIssue?.type === "blocked") {
        warnings.push(`${actionLabel || `Train ${unitName}`}: ${availabilityIssue.message}`);
        pushEvent(actionLabel || `Train ${unitName}`, availabilityIssue.message, laneFor(cmd), cmd.id);
        return;
      }
      if (!buildingId) {
        warnings.push(`Blocked: Train ${unitName} (select a building)`);
        pushEvent(`Train ${unitName}`, "Blocked (select a building)", laneFor(cmd), cmd.id);
        return;
      }
      const isTc = isBoTownCenterSurface(buildingType, civ);
      if (isTc && !(unitName === "Villager" || unitName === "Scout")) {
        warnings.push(`Blocked: Train ${unitName} (Town Center trains Villager/Scout only)`);
        pushEvent(`Train ${unitName}`, "Blocked (Town Center trains Villager/Scout only)", laneFor(cmd), cmd.id);
        return;
      }
      if (!isTc && (unitName === "Villager" || unitName === "Scout")) {
        warnings.push(`Blocked: Train ${unitName} (Use Town Center for Villager/Scout)`);
        pushEvent(`Train ${unitName}`, "Blocked (Use Town Center for Villager/Scout)", laneFor(cmd), cmd.id);
        return;
      }
      if (repeating) {
        const spec = getAutoQueueSpec(cmd, buildingType);
        if (!spec.unitDef) notes.push("Unit data not found (manual values)");
        cost = spec.cost;
        effectiveTrainTimePerUnit = spec.timePerUnit;
        duration = Math.max(0, plannedEnd - time);
        if (unitName === "Villager") {
          const rallyLabel = cmd.payload.rallyTarget || "idle";
          actionLabel = getBoCommandLabel(cmd);
          cmd.payload.rallyTarget = rallyLabel;
        } else {
          actionLabel = `Repeat ${unitName}`;
        }
      } else {
        const spec = getUnitProductionSpec(unitName, buildingType, count);
        if (!spec.unitDef) notes.push("Unit data not found (manual values)");
        cost = spec.cost;
        duration = spec.duration;
        effectiveTrainTimePerUnit = spec.timePerUnit;
        if (unitName === "Villager") {
          const rallyLabel = cmd.payload.rallyTarget || "idle";
          actionLabel = getBoCommandLabel(cmd);
          cmd.payload.rallyTarget = rallyLabel;
        } else {
          actionLabel = `Train ${count} ${unitName}`;
        }
      }
    } else if (cmd.type === "autoQueue") {
      const unitName = cmd.payload.unitName;
      const buildingType = cmd.payload.building || "Barracks";
      const spec = getAutoQueueSpec(cmd, buildingType);
      if (!spec.unitDef) notes.push("Unit data not found (manual values)");
      cost = spec.cost;
      duration = Math.max(0, plannedEnd - time);
      if (unitName === "Villager") {
        const rallyLabel = cmd.payload.rallyTarget || "idle";
        actionLabel = isBoTownCenterSurface(buildingType, civ)
          ? `Rally Villagers -> ${rallyLabel}`
          : `Repeat Villager -> ${rallyLabel}`;
      } else {
        actionLabel = `Repeat ${unitName}`;
      }
    } else if (cmd.type === "sacredSite") {
      actionLabel = `Sacred Sites: ${cmd.payload.count || 0}`;
    } else if (cmd.type === "garrisonScholars") {
      actionLabel = `Garrison Scholars (${cmd.payload.count || 0})`;
      const count = Math.max(0, cmd.payload.count || 0);
      const delta = Math.max(0, count - scholarGarrison);
      cost = { food: 0, wood: 0, gold: delta * (domeActive ? scholarInfo.costGoldDome : scholarInfo.costGold), stone: 0 };
      duration = delta * (cmd.payload.timePerScholar || scholarInfo.time || 0);
    }

    if (cmd.type === "sacredSite") {
      const minAge = (civ === "Delhi Sultanate" && sanctityActive) ? 2 : 3;
      if (age < minAge) {
        warnings.push(`Blocked: ${actionLabel} (requires Age ${minAge})`);
        pushEvent(actionLabel, `Blocked (requires Age ${minAge})`, laneFor(cmd), cmd.id);
        return;
      }
      sacredSites = Math.max(0, cmd.payload.count || 0);
      pushEvent(actionLabel, "", laneFor(cmd), cmd.id);
      return;
    }

    if (cmd.type === "autoQueue" || isBoRepeatQueueCommand(cmd)) {
      const buildingType = cmd.payload.building || "Barracks";
      const buildingId = cmd.payload.buildingId || null;
      const availabilityIssue = getUnitAvailabilityIssue(cmd.payload.unitName, buildingType);
      if (availabilityIssue?.type === "blocked") {
        warnings.push(`${actionLabel}: ${availabilityIssue.message}`);
        pushEvent(actionLabel, availabilityIssue.message, laneFor(cmd), cmd.id);
        return;
      }
      if (!buildingId) {
        warnings.push(`Blocked: ${actionLabel} (select a building)`);
        pushEvent(actionLabel, "Blocked (select a building)", laneFor(cmd), cmd.id);
        return;
      }
      const isTc = isBoTownCenterSurface(buildingType, civ);
      const unitName = cmd.payload.unitName;
      if (isTc && !(unitName === "Villager" || unitName === "Scout")) {
        warnings.push(`Blocked: ${actionLabel} (Town Center trains Villager/Scout only)`);
        pushEvent(actionLabel, "Blocked (Town Center trains Villager/Scout only)", laneFor(cmd), cmd.id);
        return;
      }
      if (!isTc && (unitName === "Villager" || unitName === "Scout")) {
        warnings.push(`Blocked: ${actionLabel} (Use Town Center for Villager/Scout)`);
        pushEvent(actionLabel, "Blocked (Use Town Center for Villager/Scout)", laneFor(cmd), cmd.id);
        return;
      }
      if (!productionQueues[buildingType]) {
        warnings.push(`Blocked: ${actionLabel} (no queue for ${buildingType})`);
        pushEvent(actionLabel, `Blocked (no queue for ${buildingType})`, laneFor(cmd), cmd.id);
        return;
      }
      if ((buildingCounts[buildingType] || 0) <= 0) {
        notes.push(`Waiting for ${buildingType}`);
      }
      if (buildingId && !hasBuildingInstance(buildingType, buildingId)) {
        notes.push(`Waiting for ${buildingId}`);
      }
      const start = time;
      const end = time + duration;
      autoQueues.push({ cmd, buildingType, buildingId, startTime: start, endTime: end });
      timeline.push({
        start,
        end,
        action: actionLabel,
        notes: notes.join(", "),
        lane: laneFor(cmd),
        commandId: cmd.id,
        before: { ...resources },
        after: { ...resources }
      });
      pushSample(start, resources);
      tryStartAutoQueues();
      return;
    }


    if (cmd.type === "tech") {
      const techType = cmd.payload.techType;
      const techDef = getSimTechDef(techType);
      const targetBuildingType = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId) || null;
      const targetBuildingId = cmd.payload.buildingId || null;
      if (isTechResearched(techType)) {
        warnings.push(`Blocked: ${actionLabel} (already researched)`);
        pushEvent(actionLabel, "Blocked (already researched)", laneFor(cmd), cmd.id);
        return;
      }
      if (!targetBuildingType || !doesBoTechMatchBuilding(techType, targetBuildingType, civ)) {
        warnings.push(`Blocked: ${actionLabel} (missing exact research site)`);
        pushEvent(actionLabel, "Blocked (missing exact research site)", laneFor(cmd), cmd.id);
        return;
      }
      const available = waitForTechAvailable(techDef, actionLabel, notes);
      if (!available) {
        warnings.push(`Blocked: ${actionLabel} (requirements not met)`);
        pushEvent(actionLabel, "Blocked (requirements not met)", laneFor(cmd), cmd.id);
        return;
      }
      if (targetBuildingType || targetBuildingId) {
        const ok = waitForBuildingAvailable(targetBuildingType, targetBuildingId, actionLabel, notes);
        if (!ok) {
          warnings.push(`Blocked: ${actionLabel} (missing ${targetBuildingId || targetBuildingType})`);
          pushEvent(actionLabel, `Blocked (missing ${targetBuildingId || targetBuildingType})`, laneFor(cmd), cmd.id);
          return;
        }
      }
      if (techDef.noteOnly) {
        notes.push("Tracked only");
      }
    }

    if (cmd.type === "garrisonScholars") {
      if (buildingCounts["Mosque"] <= 0) {
        warnings.push(`Blocked: ${actionLabel} (no Mosque)`);
        pushEvent(actionLabel, "Blocked (no Mosque)", laneFor(cmd), cmd.id);
        return;
      }
      if (cmd.payload.count <= scholarGarrison) {
        scholarGarrison = Math.max(0, cmd.payload.count || 0);
        pushEvent(actionLabel, "", laneFor(cmd), cmd.id);
        return;
      }
    }

    let queuedBuilding = null;
    if (cmd.type === "trainUnit") {
      const buildingType = cmd.payload.building || "Barracks";
      const buildingId = cmd.payload.buildingId || null;
      if (cmd.payload.unitName === "Villager" && !isBoTownCenterSurface(buildingType, civ)) {
        warnings.push(`Blocked: ${actionLabel} (Villagers require Town Center)`);
        pushEvent(actionLabel, "Blocked (Villagers require Town Center)", laneFor(cmd), cmd.id);
        return;
      }
      if (!productionQueues[buildingType]) {
        warnings.push(`Blocked: ${actionLabel} (no queue for ${buildingType})`);
        pushEvent(actionLabel, `Blocked (no queue for ${buildingType})`, laneFor(cmd), cmd.id);
        return;
      }
      let waited = false;
      while (true) {
        if ((buildingCounts[buildingType] || 0) <= 0) {
          const nextBusy = nextBusyTime();
          if (nextBusy === null) {
            warnings.push(`Blocked: ${actionLabel} (no ${buildingType})`);
            pushEvent(actionLabel, `Blocked (no ${buildingType})`, laneFor(cmd), cmd.id);
            return;
          }
          if (!waited) {
            notes.push(`Waiting for ${buildingType}`);
            waited = true;
          }
          advanceTo(nextBusy);
          continue;
        }
        const queues = productionQueues[buildingType] || [];
        if (buildingId) {
          queuedBuilding = queues.find((q) => q.id === buildingId) || null;
          if (!queuedBuilding) {
            const nextBusy = nextBusyTime();
            if (nextBusy === null) {
              warnings.push(`Blocked: ${actionLabel} (missing ${buildingId})`);
              pushEvent(actionLabel, `Blocked (missing ${buildingId})`, laneFor(cmd), cmd.id);
              return;
            }
            if (!waited) {
              notes.push(`Waiting for ${buildingId}`);
              waited = true;
            }
            advanceTo(nextBusy);
            continue;
          }
        } else if (queues.length) {
          queuedBuilding = queues.reduce((best, q) => (q.busyUntil < best.busyUntil ? q : best), queues[0]);
        }
        break;
      }
      const unlocked = waitForUnitUnlock(cmd.payload.unitName, buildingType, notes);
      if (!unlocked) {
        warnings.push(`Blocked: ${actionLabel}`);
        pushEvent(actionLabel, notes.join(", "), laneFor(cmd), cmd.id);
        return;
      }
      if (queuedBuilding && queuedBuilding.busyUntil > time) {
        advanceTo(queuedBuilding.busyUntil);
        notes.push("Delayed (queue)");
      }
    }

    const isFiniteTownCenterVillagerQueue =
      cmd.type === "trainUnit" &&
      !cmd.payload?.repeatUntilEnd &&
      cmd.payload?.unitName === "Villager" &&
      isBoTownCenterSurface(cmd.payload?.building || "Barracks", civ) &&
      !!queuedBuilding?.id;

    if (isFiniteTownCenterVillagerQueue) {
      const spec = getAutoQueueSpec(cmd, cmd.payload?.building || inferBuildingTypeFromId(cmd.payload?.buildingId) || "Town Center");
      if (!spec.unitDef && !notes.includes("Unit data not found (manual values)")) {
        notes.push("Unit data not found (manual values)");
      }
      if (cmd.timeMode === "atTime" && !hasResources(spec.cost)) {
        notes.push("Delayed (resources)");
      }
      finiteQueues.push({
        commandId: cmd.id,
        unitName: cmd.payload.unitName,
        buildingType: "Town Center",
        buildingId: queuedBuilding.id,
        startTime: time,
        remainingCount: Math.max(1, cmd.payload.count || 1),
        cost: { ...spec.cost },
        timePerUnit: Math.max(0.1, spec.timePerUnit || BO_VILLAGER_TIME),
        rallyTarget: cmd.payload.rallyTarget || "idle",
        rallyTravelDelaySec: effectiveMoveTime(cmd.payload.rallyTravelDelaySec || 0),
        rallyTripOverrideSec: Number.isFinite(cmd.payload.rallyTripOverrideSec) ? cmd.payload.rallyTripOverrideSec : null,
        actionLabel,
        notes: notes.join(", "),
        lane: queuedBuilding.id || laneFor(cmd),
        timelineRow: null,
        done: false
      });
      tryStartFiniteQueues();
      return;
    }

    const ok = waitForResources(cost);
    if (!ok) {
      warnings.push(`Blocked: ${actionLabel}`);
      pushEvent(actionLabel, "Blocked (no income for required resources)", laneFor(cmd), cmd.id);
      return;
    }
    if (cmd.type === "buildBuilding") {
      const source = cmd.payload.builderSource || "idle";
      const availableBuilders = countAvailableBuilders(source);
      const requestedBuilders = Math.max(1, cmd.payload.builders || 1);
      if (availableBuilders < requestedBuilders) {
        const sourceLabel = source === "any" ? "available villagers" : source;
        const note = `Blocked (need ${requestedBuilders} from ${sourceLabel}, have ${availableBuilders})`;
        warnings.push(`${actionLabel}: ${note}`);
        pushEvent(actionLabel, note, laneFor(cmd), cmd.id);
        return;
      }
    }
    if (cmd.timeMode === "atTime" && time > earliest + 0.0001) {
      notes.push("Delayed (resources)");
    }
    if (cmd.type === "buildBuilding") {
      const source = cmd.payload.builderSource || "idle";
      const requestedBuilders = Math.max(1, cmd.payload.builders || 1);
      const availableBuilders = countAvailableBuilders(source);
      if (availableBuilders < requestedBuilders) {
        const sourceLabel = source === "any" ? "available villagers" : source;
        const note = `Blocked (need ${requestedBuilders} from ${sourceLabel}, have ${availableBuilders})`;
        warnings.push(`${actionLabel}: ${note}`);
        pushEvent(actionLabel, note, laneFor(cmd), cmd.id);
        return;
      }
      const pulled = pullBuilders(source, requestedBuilders);
      const queueSummary = getBoBuildQueueSummary(cmd.payload);
      const travelDelay = effectiveMoveTime(cmd.payload.travelDelaySec || 0);
      const queueSteps = [];
      let segmentIndex = 0;
      getBoBuildSteps(cmd.payload).forEach((step) => {
        const stepDef = getBoBuildingDefaults(step.building) || {};
        let minAge = stepDef.minAge || 1;
        if (civ === "Mongols" && step.building === "Stable") minAge = 1;
        const baseDuration = getBuildDurationSeconds(getBoBuildStepTime(step), requestedBuilders);
        let durationPerBuilding = baseDuration;
        if (civ === "Malians" && step.building === "House" && civBonus?.houseBuildTimeMult) {
          durationPerBuilding *= civBonus.houseBuildTimeMult;
        }
        if (civ === "Jeanne d'Arc") {
          let mult = 1;
          if (age === 1 && civBonus.darkAgeBuildSpeedMult) mult *= civBonus.darkAgeBuildSpeedMult;
          if (mult > 1) durationPerBuilding = durationPerBuilding / mult;
        }
        if (houseOfWisdomState.effects.buildSpeedPct > 0) {
          durationPerBuilding = applyBoWorkRateToDuration(durationPerBuilding, houseOfWisdomState.effects.buildSpeedPct);
        }
        const costForStep = getBoBuildStepCost(step, civ, civBonus, {
          ottomanSettings: getOttomanActiveEffects(),
          houseOfWisdomEffects: getHouseOfWisdomEffects()
        });
        for (let i = 0; i < Math.max(1, step.count || 1); i++) {
          const stepSuffix = Math.max(1, step.count || 1) > 1 ? ` (${i + 1}/${Math.max(1, step.count || 1)})` : "";
          queueSteps.push({
            buildingName: step.building,
            cost: { ...costForStep },
            duration: durationPerBuilding + (segmentIndex === 0 ? travelDelay : 0),
            notes: segmentIndex === 0 && travelDelay > 0 ? `Travel ${Number(travelDelay.toFixed(2))}s` : "",
            fullLabel: `${queueSummary} | ${step.building}${stepSuffix}`,
            shortLabel: step.building,
            minAge,
            segmentIndex
          });
          segmentIndex += 1;
        }
      });
      buildQueues.push({
        id: cmd.id,
        steps: queueSteps,
        nextIndex: 0,
        active: false,
        done: false,
        availableAt: time,
        entries: pulled.entries,
        returnTarget: cmd.payload.returnTarget ?? null
      });
      tryStartBuildQueues();
      return;
    }
    const resBefore = { ...resources };
    resources.food -= cost.food;
    resources.wood -= cost.wood;
    resources.gold -= cost.gold;
    resources.stone -= cost.stone;
    const resAfterCost = { ...resources };

    const start = time;
    const end = time + duration;
    let laneName = laneFor(cmd);
    if (cmd.type === "trainUnit" && queuedBuilding?.id) laneName = queuedBuilding.id;

    if (cmd.type === "buildBuilding") {
      busy.push({
        endTime: end,
        kind: "buildComplete",
        buildingName: cmd.payload.building
      });
      if (duration > 0) {
        const source = cmd.payload.builderSource || "any";
        const pulled = pullBuilders(source, cmd.payload.builders);
        const returnTarget = cmd.payload.returnTarget ?? null;
        pulled.entries.forEach((entry) => {
          busy.push({
            endTime: end,
            count: entry.count,
            source: entry.source,
            kind: "builder",
            returnTarget
          });
        });
        syncGatherSegments(time);
      }
    }

    if (cmd.type === "trainUnit" && cmd.payload.unitName === "Villager" && queuedBuilding?.id) {
      const perUnit = Math.max(0, effectiveTrainTimePerUnit || cmd.payload.timePerUnit || BO_VILLAGER_TIME);
      const count = Math.max(1, cmd.payload.count || 1);
      const rallyTarget = cmd.payload.rallyTarget || "idle";
      const rallyDelay = effectiveMoveTime(cmd.payload.rallyTravelDelaySec || 0);
      const rallyTrip = Number.isFinite(cmd.payload.rallyTripOverrideSec) ? cmd.payload.rallyTripOverrideSec : null;
      for (let i = 1; i <= count; i++) {
        busy.push({
          endTime: start + perUnit * i,
          kind: "trainVill",
          rallyTarget,
          rallyTravelDelaySec: rallyDelay,
          rallyTripOverrideSec: rallyTrip,
          tcId: queuedBuilding.id,
          sourceCommandId: cmd.id,
          buildingId: queuedBuilding.id,
          buildingType: cmd.payload.building || "Town Center",
          timePerUnit: perUnit
        });
      }
    }
    if (cmd.type === "trainUnit" && queuedBuilding?.id && cmd.payload.unitName !== "Villager") {
      const perUnit = Math.max(0, effectiveTrainTimePerUnit || cmd.payload.timePerUnit || 0.1);
      const count = Math.max(1, cmd.payload.count || 1);
      for (let i = 1; i <= count; i++) {
        busy.push({
          endTime: start + perUnit * i,
          kind: "unitComplete",
          unitName: cmd.payload.unitName,
          buildingId: queuedBuilding.id,
          buildingType: cmd.payload.building || inferBoBuildingTypeFromId(queuedBuilding.id) || "Production",
          label: `${cmd.payload.unitName} complete`
        });
      }
    }

    if (cmd.type === "ageUp") {
      tcBusyUntil = Math.max(tcBusyUntil, end);
      const queue = (productionQueues["Town Center"] || []).find((q) => q.id === "TC #1");
      if (queue) queue.busyUntil = Math.max(queue.busyUntil, end);
    }

    if (cmd.type === "houseOfWisdomWing") {
      houseOfWisdomBusyUntil = Math.max(houseOfWisdomBusyUntil, end);
      busy.push({
        endTime: end,
        kind: "houseOfWisdomComplete",
        wing: cmd.payload?.wing || "culture",
        branch: cmd.payload?.branch || null,
        targetAge: cmd.payload?.targetAge || 2
      });
    }

    if (cmd.type === "tech") {
      busy.push({
        endTime: end,
        kind: "techComplete",
        techType: cmd.payload.techType,
        milestoneLabel: actionLabel
      });
    }

    if (cmd.type === "trainUnit" && queuedBuilding) {
      queuedBuilding.busyUntil = end;
    }

    if (cmd.type === "garrisonScholars") {
      busy.push({
        endTime: end,
        kind: "scholarComplete",
        count: Math.max(0, cmd.payload.count || 0)
      });
    }

    timeline.push({
      start,
      end,
      action: actionLabel,
      notes: notes.join(", "),
      lane: laneName,
      commandId: cmd.id,
      before: resBefore,
      after: { ...resAfterCost }
    });
    pushSample(start, resBefore);
    pushSample(start + 0.001, resAfterCost);
    if (end <= time + 0.0001) {
      releaseBusy(time);
    }
  });

  const simEnd = Math.max(time, config.simEnd || 0);
  if (simEnd > time) {
    advanceTo(simEnd);
    pushSample(time, resources);
  }
  finalizeGatherSegments(time);
  samples.sort((a, b) => a.time - b.time);
  return { timeline, milestones, warnings, finalResources: resources, samples, simEnd, gatherSegments, villagerMarkers, gatheredTotals };
}

function getBoEarliestAffordTime(samples, cost) {
  if (!samples?.length) return null;
  for (const sample of samples) {
    if ((sample.food || 0) >= (cost.food || 0) &&
        (sample.wood || 0) >= (cost.wood || 0) &&
        (sample.gold || 0) >= (cost.gold || 0) &&
        (sample.stone || 0) >= (cost.stone || 0)) {
      return sample.time;
    }
  }
  return null;
}

function meetsBoCost(resourceState, cost) {
  return (resourceState.food || 0) >= (cost.food || 0) &&
    (resourceState.wood || 0) >= (cost.wood || 0) &&
    (resourceState.gold || 0) >= (cost.gold || 0) &&
    (resourceState.stone || 0) >= (cost.stone || 0);
}

function getBoEarliestManualDropoffAffordTime(samples, cost) {
  if (!samples?.length) return null;
  for (const sample of samples) {
    const banked = {
      food: sample.food || 0,
      wood: sample.wood || 0,
      gold: sample.gold || 0,
      stone: sample.stone || 0
    };
    if (meetsBoCost(banked, cost)) return sample.time;
    const events = Array.isArray(sample.manualDropoffEvents) ? sample.manualDropoffEvents : [];
    for (const event of events) {
      banked.food += event.food || 0;
      banked.wood += event.wood || 0;
      banked.gold += event.gold || 0;
      banked.stone += event.stone || 0;
      if (meetsBoCost(banked, cost)) return event.time;
    }
  }
  return null;
}

function getBoMetrics(results) {
  const samples = results?.samples || [];
  const simEnd = Math.max(1, results?.simEnd || 1);
  const gathered = results?.gatheredTotals || { food: 0, wood: 0, gold: 0, stone: 0, oliveOil: 0, silver: 0 };
  const age2Cost = { food: 400, wood: 0, gold: 200, stone: 0 };
  const age3Cost = { food: 1200, wood: 0, gold: 600, stone: 0 };
  const age4Cost = { food: 2400, wood: 0, gold: 1200, stone: 0 };
  return {
    gathered,
    perMin: {
      food: (gathered.food || 0) * 60 / simEnd,
      wood: (gathered.wood || 0) * 60 / simEnd,
      gold: (gathered.gold || 0) * 60 / simEnd,
      stone: (gathered.stone || 0) * 60 / simEnd
    },
    afford: {
      age2: {
        normal: getBoEarliestAffordTime(samples, age2Cost),
        manual: getBoEarliestManualDropoffAffordTime(samples, age2Cost)
      },
      age3: {
        normal: getBoEarliestAffordTime(samples, age3Cost),
        manual: getBoEarliestManualDropoffAffordTime(samples, age3Cost)
      },
      age4: {
        normal: getBoEarliestAffordTime(samples, age4Cost),
        manual: getBoEarliestManualDropoffAffordTime(samples, age4Cost)
      }
    }
  };
}

function getBoCurrentRatesAtTime(results, timeOverride = null) {
  const time = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = results ? getBoSampleAtTimeFromSamples(time, results?.samples || []) : null;
  const fallbackRates = readBoSettings().gatherRates || {};
  const gatherSpeeds = sample?.gatherSpeeds || sample?.rates || fallbackRates;
  const actualIncome = sample?.actualIncomeRates || {
    food: 0,
    wood: 0,
    gold: 0,
    stone: 0,
    oliveOil: 0,
    silver: 0
  };
  return {
    time,
    gatherSpeeds: {
      food: 0,
      wood: Number.isFinite(gatherSpeeds.wood) ? gatherSpeeds.wood : 0,
      gold: Number.isFinite(gatherSpeeds.gold) ? gatherSpeeds.gold : 0,
      stone: Number.isFinite(gatherSpeeds.stone) ? gatherSpeeds.stone : 0,
      sheep: Number.isFinite(gatherSpeeds.sheep) ? gatherSpeeds.sheep : 0,
      berries: Number.isFinite(gatherSpeeds.berries) ? gatherSpeeds.berries : 0,
      deer: Number.isFinite(gatherSpeeds.deer) ? gatherSpeeds.deer : 0,
      boar: Number.isFinite(gatherSpeeds.boar) ? gatherSpeeds.boar : 0,
      farm: Number.isFinite(gatherSpeeds.farm) ? gatherSpeeds.farm : 0
    },
    actualIncome: {
      food: Number.isFinite(actualIncome.food) ? actualIncome.food : 0,
      wood: Number.isFinite(actualIncome.wood) ? actualIncome.wood : 0,
      gold: Number.isFinite(actualIncome.gold) ? actualIncome.gold : 0,
      stone: Number.isFinite(actualIncome.stone) ? actualIncome.stone : 0,
      oliveOil: Number.isFinite(actualIncome.oliveOil) ? actualIncome.oliveOil : 0,
      silver: Number.isFinite(actualIncome.silver) ? actualIncome.silver : 0
    }
  };
}

function getBoSummaryAnchorInfo(time) {
  if (Number.isFinite(boPinnedTime)) {
    return { label: `Pinned time ${formatTimeMMSS(time)}`, clearable: true };
  }
  if (Number.isFinite(boHoverTime)) {
    return { label: `Hover time ${formatTimeMMSS(time)}`, clearable: false };
  }
  if (boMarkerDraft?.cmd) {
    return { label: `Draft reroute ${formatTimeMMSS(time)}`, clearable: false };
  }
  if (boSelectedCommandId) {
    return { label: `Selected command ${formatTimeMMSS(time)}`, clearable: false };
  }
  return { label: `Timeline start ${formatTimeMMSS(time)}`, clearable: false };
}

function renderBoTimelineFooter(timeOverride = null) {
  const status = document.getElementById("boPinStatus");
  const clearBtn = document.getElementById("boClearPinBtn");
  const civ = getBoSelectedCiv();
  const time = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const anchorInfo = getBoSummaryAnchorInfo(time);
  if (status) {
    status.textContent = civ ? anchorInfo.label : "Timeline start 0:00";
    status.classList.toggle("is-pinned", !!anchorInfo.clearable);
  }
  if (clearBtn) {
    clearBtn.hidden = !anchorInfo.clearable;
    clearBtn.classList.toggle("is-active", !!anchorInfo.clearable);
  }
  syncBoDisplayControlStates();
}

function renderBoSummary(results, timeOverride = null) {
  const summary = document.getElementById("boSummary");
  if (!summary || !results) return;
  const milestoneEntries = Object.entries(results.milestones || {});
  const metrics = getBoMetrics(results);
  const currentRateInfo = getBoCurrentRatesAtTime(results, timeOverride);
  const gatheredHtml = [
    ["Food", metrics.gathered.food],
    ["Wood", metrics.gathered.wood],
    ["Gold", metrics.gathered.gold],
    ["Stone", metrics.gathered.stone]
  ].map(([label, value]) => `<div class="bo-summary-row"><span>${label}</span><strong>${Math.floor(value || 0)}</strong></div>`).join("");
  const perMinHtml = [
    ["Food/min", metrics.perMin.food],
    ["Wood/min", metrics.perMin.wood],
    ["Gold/min", metrics.perMin.gold],
    ["Stone/min", metrics.perMin.stone]
  ].map(([label, value]) => `<div class="bo-summary-row"><span>${label}</span><strong>${Math.floor(value || 0)}</strong></div>`).join("");
  const finalResHtml = [
    ["Food", results.finalResources.food],
    ["Wood", results.finalResources.wood],
    ["Gold", results.finalResources.gold],
    ["Stone", results.finalResources.stone]
  ].map(([label, value]) => `<div class="bo-summary-row"><span>${label}</span><strong>${Math.floor(value || 0)}</strong></div>`).join("");
  const affordStripHtml = [
    ["Age II", metrics.afford.age2],
    ["Age III", metrics.afford.age3],
    ["Age IV", metrics.afford.age4]
  ].map(([label, affordInfo]) => {
    const normalTime = affordInfo?.normal ?? null;
    const manualTime = affordInfo?.manual ?? null;
    const showManual = manualTime !== null && (normalTime === null || manualTime < normalTime - 0.0001);
    return `
    <div class="bo-afford-pill">
      <span class="bo-afford-label">${label}</span>
      <strong class="bo-afford-time">${normalTime === null ? "Not reached" : formatTimeMMSS(normalTime)}</strong>
      ${showManual ? `<div class="bo-afford-manual">Manual dropoff: ${formatTimeMMSS(manualTime)}</div>` : ""}
    </div>
  `;
  }).join("");

  let summaryHtml = `
    <div class="bo-afford-strip">
      ${affordStripHtml}
    </div>
    <div class="bo-summary-grid bo-summary-grid-compact">
      <div class="bo-summary-card">
        <div class="bo-summary-card-title">Collected</div>
        ${gatheredHtml}
      </div>
      <div class="bo-summary-card">
        <div class="bo-summary-card-title">Avg collected / min</div>
        <div class="bo-summary-card-help">Full sim average. Live values above are anchored to ${formatTimeMMSS(currentRateInfo.time)}.</div>
        ${perMinHtml}
      </div>
      <div class="bo-summary-card">
        <div class="bo-summary-card-title">Final resources</div>
        ${finalResHtml}
      </div>
    </div>
  `;
  const metaParts = [];
  if (milestoneEntries.length) {
    metaParts.push(milestoneEntries.map(([k, v]) => `<span><strong>${k}:</strong> ${formatTimeMMSS(v)}</span>`).join(""));
  }
  const extraParts = [];
  if ((results.finalResources.oliveOil || 0) > 0) extraParts.push(`Olive ${Math.floor(results.finalResources.oliveOil)}`);
  if ((results.finalResources.silver || 0) > 0) extraParts.push(`Silver ${Math.floor(results.finalResources.silver)}`);
  if (extraParts.length) {
    metaParts.push(`<span><strong>Special:</strong> ${extraParts.join(" | ")}</span>`);
  }
  if (metaParts.length) {
    summaryHtml += `<div class="bo-summary-meta">${metaParts.join("")}</div>`;
  }
  if (results.warnings.length) {
    summaryHtml += `<div class="bo-warning mt-2">${results.warnings.join(" | ")}</div>`;
  }
  summary.innerHTML = summaryHtml;
}

function syncBoDisplayControlStates() {
  const overlayToggle = document.getElementById("boOverlayToggle");
  const setupToggle = document.getElementById("boAdvancedToggle");
  const setupCollapse = document.getElementById("boSetupCollapse");
  const eventToggle = document.getElementById("boEventToggle");
  const eventCollapse = document.getElementById("boEventCollapse");
  if (overlayToggle) {
    overlayToggle.classList.toggle("is-active", !!boOverlayEnabled);
    overlayToggle.setAttribute("aria-pressed", boOverlayEnabled ? "true" : "false");
    setBoOverlayToggleLabel();
  }
  const setupActive = !!setupCollapse?.classList.contains("show");
  setupToggle?.classList.toggle("is-active", setupActive);
  setupToggle?.setAttribute("aria-expanded", setupActive ? "true" : "false");
  const eventActive = !!eventCollapse?.classList.contains("show");
  eventToggle?.classList.toggle("is-active", eventActive);
  eventToggle?.setAttribute("aria-expanded", eventActive ? "true" : "false");
}

function renderBoResults(results) {
  const chartEl = document.getElementById("boResourceChart");
  const laneEl = document.getElementById("boLaneTimeline");
  const eventEl = document.getElementById("boEventList");
  if (!chartEl || !laneEl || !eventEl) return;

  boLastResults = results;
  renderBoSummary(results);
  renderBoTimelineEditor();
  renderBoResourceChart(results.samples || []);
  renderBoEventList(results.timeline || []);
  renderBoGatherRates();
  renderBoTimelineFooter();
}

function renderBoResourceChart(samples) {
  const chartEl = document.getElementById("boResourceChart");
  if (!chartEl) return;
  if (!boOverlayEnabled) {
    chartEl.style.display = "none";
    return;
  }
  chartEl.style.display = "block";
  if (!samples.length) {
    chartEl.innerHTML = "";
    return;
  }
  const maxTime = Math.max(...samples.map((s) => s.time), 240);
  const hasOlive = samples.some((s) => (s.oliveOil || 0) > 0);
  const hasSilver = samples.some((s) => (s.silver || 0) > 0);
  const maxVal = Math.max(
    1,
    ...samples.map((s) => Math.max(
      s.food,
      s.wood,
      s.gold,
      s.stone,
      hasOlive ? (s.oliveOil || 0) : 0,
      hasSilver ? (s.silver || 0) : 0
    ))
  );
  const rect = chartEl.getBoundingClientRect();
  const w = rect.width || 1000;
  const h = rect.height || 120;
  const padY = Math.max(4, Math.min(10, h * 0.25));
  const timelineEl = document.getElementById("boLaneTimeline");
  const leftPad = parseFloat(timelineEl?.dataset.leftPad || "0") || 0;
  const pxPerSec = parseFloat(timelineEl?.dataset.pxPerSec || "0") || (w / Math.max(maxTime, 1));
  const totalFromTimeline = parseFloat(timelineEl?.dataset.total || "") || maxTime;
  const timeSpan = Math.max(maxTime, totalFromTimeline, 1);
  const x = (t) => Math.min(w, leftPad + (t * pxPerSec));
  const y = (v) => h - padY - ((h - padY * 2) * v) / maxVal;
  const ordered = samples.slice().sort((a, b) => a.time - b.time);
  const buildPath = (key) => {
    if (!ordered.length) return "";
    let d = `M ${x(ordered[0].time).toFixed(1)} ${y(ordered[0][key] || 0).toFixed(1)}`;
    for (let i = 1; i < ordered.length; i++) {
      const pt = ordered[i];
      d += ` H ${x(pt.time).toFixed(1)} V ${y(pt[key] || 0).toFixed(1)}`;
    }
    return d;
  };

  const lines = [
    { key: "food", color: "#8fd36b", label: "Food" },
    { key: "wood", color: "#caa57a", label: "Wood" },
    { key: "gold", color: "#f3d26c", label: "Gold" },
    { key: "stone", color: "#b7b7c6", label: "Stone" }
  ];
  if (hasOlive) lines.push({ key: "oliveOil", color: "#cfe56b", label: "Olive Oil" });
  if (hasSilver) lines.push({ key: "silver", color: "#c8d6ff", label: "Silver" });

  const showLegend = false;
  const legend = "";

  const grid = [0.25, 0.5, 0.75].map((p) => {
    const yy = padY + (h - padY * 2) * p;
    const x1 = leftPad;
    const x2 = Math.min(w, leftPad + (timeSpan * pxPerSec));
    return `<line x1="${x1}" x2="${x2}" y1="${yy}" y2="${yy}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;
  }).join("");

  const paths = lines
    .map((l) => `<path d="${buildPath(l.key)}" fill="none" stroke="${l.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />`)
    .join("");

  chartEl.innerHTML = `
    ${showLegend ? `<div class="bo-chart-legend">${legend}</div>` : ""}
    <svg class="bo-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      ${grid}
      ${paths}
    </svg>
  `;
}

function renderBoLaneTimeline(timeline) {
  const laneEl = document.getElementById("boLaneTimeline");
  if (!laneEl) return;
  if (!timeline.length) {
    laneEl.innerHTML = "<span class='text-muted'>No timeline events.</span>";
    return;
  }
  const total = Math.max(...timeline.map((t) => t.end), 1);
  const lanes = {};
  timeline.forEach((row) => {
    const lane = row.lane || "General";
    if (!lanes[lane]) lanes[lane] = [];
    lanes[lane].push(row);
  });

  let html = "";
  Object.entries(lanes).forEach(([lane, items]) => {
    html += `<div class="bo-lane-row">
      <div class="bo-lane-label">${lane}</div>
      <div class="bo-lane-track">`;
    items.forEach((row) => {
      const left = (row.start / total) * 100;
      const width = Math.max(2, ((row.end - row.start) / total) * 100);
      const title = `${row.action}\n${formatTimeMMSS(row.start)} -> ${formatTimeMMSS(row.end)}${row.notes ? `\n${row.notes}` : ""}`;
      html += `<div class="bo-lane-block" style="left:${left}%; width:${width}%;" title="${title.replace(/"/g, "&quot;")}">${row.action}</div>`;
    });
    html += `</div></div>`;
  });
  laneEl.innerHTML = html;
}

function renderBoEventList(timeline) {
  const eventEl = document.getElementById("boEventList");
  if (!eventEl) return;
  if (!timeline.length) {
    eventEl.innerHTML = "<span class='text-muted'>No events.</span>";
    return;
  }
  const extraKeys = BO_SPECIAL_RES_KEYS.filter((key) =>
    timeline.some((row) => (row.after?.[key] || row.before?.[key] || 0) > 0)
  );
  const extraHeaders = extraKeys.map((key) => {
    const label = key === "oliveOil" ? "Olive Oil" : "Silver";
    return `<th>${label}</th>`;
  }).join("");
  let html = `<table class="bo-event-table"><thead><tr>
    <th>Time</th><th>Action</th><th>Notes</th>
    <th>Food</th><th>Wood</th><th>Gold</th><th>Stone</th>${extraHeaders}
  </tr></thead><tbody>`;
  timeline.forEach((row) => {
    const timeLabel = row.start === row.end
      ? formatTimeMMSS(row.end)
      : `${formatTimeMMSS(row.start)} -> ${formatTimeMMSS(row.end)}`;
    const extraCols = extraKeys.map((key) => `<td>${Math.floor(row.after?.[key] || 0)}</td>`).join("");
    html += `<tr>
      <td>${timeLabel}</td>
      <td>${row.action}</td>
      <td class="${row.notes ? "bo-warning" : ""}">${row.notes || ""}</td>
      <td class="bo-resource-food">${Math.floor(row.after.food)}</td>
      <td class="bo-resource-wood">${Math.floor(row.after.wood)}</td>
      <td class="bo-resource-gold">${Math.floor(row.after.gold)}</td>
      <td class="bo-resource-stone">${Math.floor(row.after.stone)}</td>${extraCols}
    </tr>`;
  });
  html += "</tbody></table>";
  eventEl.innerHTML = html;
}
function createTeamState(group) {
  const unitData = group.unitData;
  const stats = applyBuffs(unitData, 0);
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
    closingDelay: 0,
    currentTargetId: null,
    baseHp: stats.hp,
    gloryBonusHp: 0,
    gloryBonusAtk: 0
  };

  if (unitData.effects.brotherhoodHP) {
    team.stats.hp = team.baseHp + unitData.effects.brotherhoodHP.hpPerUnit * (team.units - 1);
  }
  team.totalHp = team.stats.hp * team.units;
  return team;
}

function pickNextTarget(team, enemyTeams) {
  const alive = enemyTeams.filter((t) => t.units > 0).map((t) => t.groupId);
  const priority = team.unitData.targetPriority || [];
  for (const id of priority) {
    if (alive.includes(id)) return id;
  }
  return alive[0] || null;
}

function computeClosingDelay(attacker, defender) {
  const aIsCavalry = attacker.tags.includes("Cavalry") && attacker.unitData.chargeDamage > 0;
  const bIsCavalry = defender.tags.includes("Cavalry") && defender.unitData.chargeDamage > 0;
  const effectiveRangeA = ((attacker.unitData.effects.spearwall || attacker.unitData.effects.palings) && bIsCavalry)
    ? Math.max(attacker.unitData.weaponRange, 1.04)
    : attacker.unitData.weaponRange;
  const effectiveRangeB = ((defender.unitData.effects.spearwall || defender.unitData.effects.palings) && aIsCavalry)
    ? Math.max(defender.unitData.weaponRange, 1.04)
    : defender.unitData.weaponRange;
  const speedA = attacker.unitData.effects.movementBurst
    ? attacker.unitData.speed * (1 + attacker.unitData.effects.movementBurst.speedBonus / 100)
    : attacker.unitData.speed;
  if (effectiveRangeB > effectiveRangeA) {
    return (effectiveRangeB - effectiveRangeA) / speedA;
  }
  return 0;
}

function applyBattleGlory(team, kills) {
  if (!team.unitData.effects.battleGlory || kills <= 0 || team.units <= 0) return;
  const bg = team.unitData.effects.battleGlory;
  team.gloryBonusHp = (team.gloryBonusHp || 0) + bg.hpPerKill * kills;
  team.gloryBonusAtk = (team.gloryBonusAtk || 0) + bg.attackPerKill * kills;
  team.stats.hp = team.baseHp + team.gloryBonusHp;
  team.totalHp += bg.hpPerKill * kills * team.units;
}

function applyOpeningAttacks(attackerTeams, teamById, battleLog) {
  attackerTeams.forEach((attacker) => {
    if (!attacker.unitData.effects.openingAttack || attacker.units <= 0) return;
    const targetId = attacker.currentTargetId;
    const defender = teamById[targetId];
    if (!defender || defender.units <= 0) return;
    const oa = attacker.unitData.effects.openingAttack;
    const armor = defender.stats.rangedArmor || 0;
    const dmgPerUnit = Math.max(1, oa.damage - armor);
    const totalDmg = dmgPerUnit * attacker.units;
    defender.totalHp -= totalDmg;
    let unitsLost = 0;
    if (totalDmg > 0) {
      unitsLost = Math.floor((defender.stats.hp * defender.units - defender.totalHp) / defender.stats.hp);
      defender.units = Math.max(0, defender.units - unitsLost);
    }
    battleLog.push({
      time: "Pre",
      attacker: attacker.groupId,
      attackerId: attacker.groupId,
      attackerSide: attacker.side,
      target: defender.groupId,
      weapon: "Opening",
      dmg: totalDmg.toFixed(1),
      waste: "0.0",
      atkUnits: attacker.units,
      tgtUnits: defender.units,
      unitsDied: unitsLost,
      killsA: attacker.side === "A" ? unitsLost : 0,
      killsB: attacker.side === "B" ? unitsLost : 0,
      notes: attacker.unitData.name
    });
  });
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString();
}

function applyAntiCavEffects(allTeams, teamById, battleLog) {
  allTeams.forEach((attacker) => {
    const target = teamById[attacker.currentTargetId];
    if (!target) return;
    if (!attacker.tags.includes("Cavalry")) return;
    const palings = target.unitData.effects.palings;
    const spearwall = target.unitData.effects.spearwall;
    if (palings) {
      attacker.nextPrimaryAttack = Math.max(attacker.nextPrimaryAttack, palings.stunDuration);
      attacker.unitData.chargeDamage = 0;
      const totalDmg = palings.damage * target.units;
      attacker.totalHp -= totalDmg;
      let unitsLost = 0;
      if (totalDmg > 0) {
        unitsLost = Math.floor((attacker.stats.hp * attacker.units - attacker.totalHp) / attacker.stats.hp);
        attacker.units = Math.max(0, attacker.units - unitsLost);
      }
      if (battleLog) {
        battleLog.push({
          time: "Pre",
          attacker: target.groupId,
          attackerId: target.groupId,
          attackerSide: target.side,
          target: attacker.groupId,
          weapon: "Palings",
          dmg: totalDmg.toFixed(1),
          waste: "0.0",
          atkUnits: target.units,
          tgtUnits: attacker.units,
          unitsDied: unitsLost,
          killsA: target.side === "A" ? unitsLost : 0,
          killsB: target.side === "B" ? unitsLost : 0,
          notes: `Stun ${formatSeconds(palings.stunDuration)}s`
        });
      }
    } else if (spearwall) {
      attacker.nextPrimaryAttack = Math.max(attacker.nextPrimaryAttack, spearwall.stunDuration);
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
          notes: `Stun ${formatSeconds(spearwall.stunDuration)}s`
        });
      }
    }
  });
}

function computeTeamAttack(attacker, target, time, config) {
  const { overkillEnabled, splitEnabled, splitTargets, EPSILON } = config;
  const unitA = attacker.unitData;
  const unitB = target.unitData;

  let damageToB = 0;
  let logNotes = [];
  let firedPrimary = false;
  let firedSecondary = false;

  const atkSpeedA = calcEffectiveAttackSpeed(unitA, attacker.stats.attackSpeed, time, attacker);
  const armorB = calcEffectiveArmor(unitB, target.stats.meleeArmor, target.stats.rangedArmor, time, unitA.effects);
  const effectiveStatsB = { ...target.stats, ...armorB };

  if (attacker.nextPrimaryAttack <= time + EPSILON && attacker.units > 0) {
    let attackValue = calcEffectiveAttack(unitA, attacker.stats.attack, time, attacker);
    if (!attacker.hasCharged && unitA.chargeDamage > 0) {
      attackValue += unitA.chargeDamage;
      attacker.hasCharged = true;
      attacker.chargeTime = time;
    }
    const pcBuff = unitA.effects.postChargeAttackBuff;
    if (pcBuff && attacker.hasCharged && time <= attacker.chargeTime + pcBuff.duration + EPSILON && time > attacker.chargeTime + EPSILON) {
      attackValue += pcBuff.value;
    }
    const armorPenA = unitA.effects.armorPenetration ? unitA.effects.armorPenetration.penetration : 0;
    const dmg = calcWeaponDamage(
      unitA.weaponType,
      attackValue,
      attacker.originalStats.bonus,
      target.tags,
      effectiveStatsB,
      armorPenA
    );
    let splashA = 1;
    let totalTargetsA = 1;
    if (unitA.effects.aoeSplash) {
      splashA = Math.min(unitA.effects.aoeSplash.unitsHit, target.units);
      totalTargetsA = splashA;
    } else if (unitA.effects.aoeFalloff) {
      totalTargetsA = Math.min(unitA.effects.aoeFalloff.unitsHit, target.units);
      splashA = (totalTargetsA + 1) / 2;
    }
    damageToB += dmg * attacker.units * splashA;
    attacker.nextPrimaryAttack = time + atkSpeedA;
    firedPrimary = true;
    if (unitA.chargeDamage > 0 && (!attacker.hasCharged || time <= attacker.chargeTime + EPSILON)) logNotes.push("Charge");
    if (unitA.effects.aoeSplash && totalTargetsA > 1) logNotes.push(`AoEÃ—${totalTargetsA}`);
    if (unitA.effects.aoeFalloff && totalTargetsA > 1) logNotes.push(`AoEÃ—${totalTargetsA}(falloff)`);
    if (unitA.effects.atkSpeedDebuff) {
      target.atkSpeedDebuffUntil = time + unitA.effects.atkSpeedDebuff.duration;
      target.atkSpeedDebuffReduction = unitA.effects.atkSpeedDebuff.reduction;
    }
    if (unitA.effects.dmgDebuffOnHit) {
      target.dmgDebuffUntil = time + unitA.effects.dmgDebuffOnHit.duration;
      target.dmgDebuffReduction = unitA.effects.dmgDebuffOnHit.reduction;
    }
  }

  if (attacker.unitData.secondaryWeapon &&
      attacker.nextSecondaryAttack <= time + EPSILON && attacker.units > 0) {
    const sec = attacker.unitData.secondaryWeapon;
    const armorPenA2 = unitA.effects.armorPenetration ? unitA.effects.armorPenetration.penetration : 0;
    const dmg = calcWeaponDamage(
      sec.type,
      sec.stats.attack || 0,
      sec.stats.bonus || {},
      target.tags,
      effectiveStatsB,
      armorPenA2
    );
    damageToB += dmg * attacker.units;
    attacker.nextSecondaryAttack = time + sec.attackSpeed;
    firedSecondary = true;
  }

  // Trample ticks
  if (unitA.effects.trample && attacker.trampleTick <= time + EPSILON && attacker.units > 0) {
    const t = unitA.effects.trample;
    if (!attacker.trampleActive) {
      attacker.trampleActive = true;
      attacker.trampleEnd = time + t.duration;
    }
    const tickDmg = t.dps * 0.5;
    const targets = Math.min(t.unitsHit || 1, target.units);
    damageToB += tickDmg * attacker.units * targets;
    if (time + 0.5 < attacker.trampleEnd - EPSILON) {
      attacker.trampleTick = time + 0.5;
    } else {
      attacker.trampleActive = false;
      attacker.trampleTick = attacker.trampleEnd + t.cooldown;
    }
    logNotes.push("Trample");
  }

  // Defender-based reductions
  if (target.unitData.effects.camelUnease && attacker.tags.includes("Cavalry")) {
    damageToB *= (1 - target.unitData.effects.camelUnease.reduction / 100);
  }
  if (target.unitData.effects.gunpowderResistance && (attacker.tags.includes("Gunpowder") || attacker.tags.includes("Light Gunpowder"))) {
    damageToB *= (1 - target.unitData.effects.gunpowderResistance.reduction / 100);
  }
  if (target.unitData.effects.fortitude && time <= target.unitData.effects.fortitude.duration + EPSILON && unitA.weaponType === "melee") {
    damageToB *= (1 + target.unitData.effects.fortitude.dmgTakenIncrease / 100);
  }
  if (target.unitData.effects.shieldWall && unitA.weaponType === "ranged") {
    damageToB *= (1 - target.unitData.effects.shieldWall.rangedDmgReduction / 100);
  }
  if (attacker.dmgDebuffUntil && attacker.dmgDebuffUntil > time) {
    damageToB *= (1 - attacker.dmgDebuffReduction / 100);
  }

  if (target.unitData.effects.deflectiveArmor && !target.hasBlocked && damageToB > 0) {
    damageToB = 0;
    target.hasBlocked = true;
    logNotes.push("Blocked");
  }

  if (unitA.effects.percentDamage && damageToB > 0) {
    damageToB += (unitA.effects.percentDamage.percent / 100) * target.stats.hp * attacker.units;
    logNotes.push("%HP");
  }
  if (unitA.effects.bleed && damageToB > 0) {
    const bleed = unitA.effects.bleed;
    damageToB += bleed.dps * bleed.duration * attacker.units;
    logNotes.push("Bleed");
  }

  // Overkill waste
  let waste = 0;
  if (overkillEnabled) {
    const rawDmg = damageToB;
    if (damageToB > 0 && attacker.units > 0) {
      const dmgPer = damageToB / attacker.units;
      const hpPer = target.stats.hp;
      const frontHpRaw = target.totalHp - (target.units - 1) * hpPer;
      const frontHp = Math.min(hpPer, Math.max(EPSILON, frontHpRaw));
      const targets = (splitEnabled && target.units > 1) ? Math.min(splitTargets, target.units, attacker.units) : 1;
      let eff = 0;
      if (targets > 1) {
        const perGroup = Math.floor(attacker.units / targets);
        const extra = attacker.units % targets;
        for (let g = 0; g < targets; g++) {
          const groupSize = perGroup + (g < extra ? 1 : 0);
          let tgtHp = (g === 0) ? frontHp : hpPer;
          for (let i = 0; i < groupSize; i++) {
            if (tgtHp <= 0) break;
            const dealt = Math.min(dmgPer, tgtHp);
            eff += dealt;
            tgtHp -= dealt;
            if (tgtHp <= 0) tgtHp = hpPer;
          }
        }
      } else {
        let fHp = frontHp;
        for (let i = 0; i < attacker.units; i++) {
          if (fHp <= 0) break;
          const dealt = Math.min(dmgPer, fHp);
          eff += dealt;
          fHp -= dealt;
          if (fHp <= 0) fHp = hpPer;
        }
      }
      damageToB = eff;
    }
    waste = rawDmg - damageToB;
  }

  if (unitA.effects.armorPenetration && (firedPrimary || firedSecondary)) logNotes.push("ArmorPen");
  if (unitA.effects.atkSpeedDebuff && firedPrimary) logNotes.push("Slow");
  if (unitA.effects.dmgDebuffOnHit && (firedPrimary || firedSecondary)) logNotes.push("Weaken");
  if (attacker.dmgDebuffUntil && attacker.dmgDebuffUntil > time && (firedPrimary || firedSecondary)) logNotes.push("Weakened");
  if (unitA.effects.berserking && time <= unitA.effects.berserking.duration + EPSILON) logNotes.push("Berserk");
  if (unitA.effects.shieldWall) logNotes.push("ShieldWall");
  if (unitA.effects.camelUnease && target.tags.includes("Cavalry")) logNotes.push("CamelUnease");
  if (unitA.effects.gunpowderResistance && (target.tags.includes("Gunpowder") || target.tags.includes("Light Gunpowder"))) logNotes.push("GunpowderRes");
  if (unitA.effects.armorDebuffAura) logNotes.push("-Armor");
  if (unitA.effects.movementBurst && time <= unitA.effects.movementBurst.duration + EPSILON) logNotes.push("SpeedBurst");
  if (unitA.effects.infantrySpeedAura) logNotes.push("FarimaAura");

  const weapon = firedPrimary && firedSecondary ? "Both" : firedPrimary ? "Primary" : firedSecondary ? "Secondary" : "â€”";
  const log = (firedPrimary || firedSecondary || (unitA.effects.trample && attacker.trampleActive)) ? {
    time: time.toFixed(2),
    attacker: attacker.groupId,
    attackerId: attacker.groupId,
    attackerSide: attacker.side,
    target: target.groupId,
    weapon,
    dmg: damageToB.toFixed(1),
    waste: waste.toFixed(1),
    atkUnits: attacker.units,
    tgtUnits: target.units,
    killsA: 0,
    killsB: 0,
    notes: logNotes.join(", ")
  } : null;

  return { damage: damageToB, log };
}

function runMultiBattle() {
  if (multiRosters.A.length === 0 || multiRosters.B.length === 0) {
    alert("Add at least one group on each side.");
    return;
  }
  collapseAllOpenGroups();
  syncAllGroupsFromCards();

  const overkillEnabled = document.getElementById("overkillEnabled").checked;
  const rangeSpeedEnabled = document.getElementById("rangeSpeedEnabled")?.checked;
  const splitA = document.getElementById("multiSplitA")?.checked;
  const splitTargetsA = Math.max(1, parseInt(document.getElementById("multiSplitTargetsA")?.value) || 1);
  const splitB = document.getElementById("multiSplitB")?.checked;
  const splitTargetsB = Math.max(1, parseInt(document.getElementById("multiSplitTargetsB")?.value) || 1);

  syncTargetPriorities();

  const teamsA = multiRosters.A.map((g) => createTeamState(g));
  const teamsB = multiRosters.B.map((g) => createTeamState(g));
  const allTeams = [...teamsA, ...teamsB];
  const teamById = Object.fromEntries(allTeams.map((t) => [t.groupId, t]));

  allTeams.forEach((team) => {
    team.currentTargetId = pickNextTarget(team, team.side === "A" ? teamsB : teamsA);
    if (team.currentTargetId) {
      const target = teamById[team.currentTargetId];
      team.closingDelay = rangeSpeedEnabled ? computeClosingDelay(team, target) : 0;
      team.nextPrimaryAttack = (team.unitData.firstHitEnabled
        ? -team.unitData.freeHits * team.unitData.stats.attackSpeed
        : 0) + team.closingDelay;
      team.nextSecondaryAttack = team.unitData.secondaryWeapon ? 0 : Infinity;
    } else {
      team.nextPrimaryAttack = Infinity;
      team.nextSecondaryAttack = Infinity;
    }
  });

  const battleLog = [];
  applyOpeningAttacks(teamsA, teamById, battleLog);
  applyOpeningAttacks(teamsB, teamById, battleLog);
  applyAntiCavEffects(allTeams, teamById, battleLog);

  let time = 0;
  const maxTime = 300;
  const EPSILON = 0.0001;

  allTeams.forEach((t) => {
    t.atkSpeedDebuffUntil = -Infinity;
    t.dmgDebuffUntil = -Infinity;
    t.lastHealAuraTime = 0;
  });

  while (teamsA.some(t => t.units > 0) && teamsB.some(t => t.units > 0) && time < maxTime) {
    let nextEventTime = Infinity;
    allTeams.forEach((t) => {
      if (t.units <= 0) return;
      const next = Math.min(t.nextPrimaryAttack, t.nextSecondaryAttack, t.trampleTick);
      if (next < nextEventTime) nextEventTime = next;
    });
    if (!isFinite(nextEventTime)) break;
    time = nextEventTime;

    allTeams.forEach((t) => {
      if (t.units > 0) t.stats = applyBuffs(t.unitData, time);
    });

    const incoming = new Map();
    const stepLogs = [];

    allTeams.forEach((attacker) => {
      if (attacker.units <= 0) return;
      let targetId = attacker.currentTargetId;
      if (!targetId) return;
      let target = teamById[targetId];
      if (!target || target.units <= 0) {
        targetId = pickNextTarget(attacker, attacker.side === "A" ? teamsB : teamsA);
        attacker.currentTargetId = targetId;
        if (!targetId) return;
        target = teamById[targetId];
      }

      const atkResult = computeTeamAttack(attacker, target, time, {
        overkillEnabled,
        splitEnabled: attacker.side === "A" ? splitA : splitB,
        splitTargets: attacker.side === "A" ? splitTargetsA : splitTargetsB,
        EPSILON
      });

      if (atkResult.log) {
        battleLog.push(atkResult.log);
        stepLogs.push(atkResult.log);
      }
      if (atkResult.damage > 0) {
        if (!incoming.has(targetId)) incoming.set(targetId, { total: 0, details: [] });
        const entry = incoming.get(targetId);
        entry.total += atkResult.damage;
        entry.details.push({ attacker, damage: atkResult.damage });
      }

      const healA = attacker.unitData.effects.healPerAttack;
      if (healA && atkResult.damage > 0) {
        const maxHp = attacker.stats.hp * attacker.units;
        attacker.totalHp = Math.min(maxHp, attacker.totalHp + healA.value * attacker.units);
      }
    });

    incoming.forEach((entry, targetId) => {
      const target = teamById[targetId];
      if (!target || target.units <= 0) return;
      target.totalHp -= entry.total;
    });

    allTeams.forEach((t) => {
      if (t.units <= 0) return;
      if (t.unitData.effects.healAura) {
        const dt = time - (t.lastHealAuraTime || 0);
        if (dt > 0) {
          const maxHp = t.stats.hp * t.units;
          t.totalHp = Math.min(maxHp, t.totalHp + t.unitData.effects.healAura.hps * t.units * dt);
        }
      }
      t.lastHealAuraTime = time;
    });

    const prevUnits = new Map(allTeams.map((t) => [t.groupId, t.units]));
    allTeams.forEach((t) => {
      if (t.units <= 0) return;
      const unitsLost = Math.floor((t.stats.hp * t.units - t.totalHp) / t.stats.hp);
      if (unitsLost > 0) {
        t.units = Math.max(0, t.units - unitsLost);
      }
    });

    const killsByAttacker = new Map();
    incoming.forEach((entry, targetId) => {
      const target = teamById[targetId];
      if (!target) return;
      const lost = (prevUnits.get(targetId) || 0) - target.units;
      if (lost <= 0) return;
      const totalDmg = entry.details.reduce((s, d) => s + d.damage, 0);
      if (totalDmg <= 0) return;
      const allocations = entry.details.map((d) => {
        const share = d.damage / totalDmg;
        return { attacker: d.attacker, base: Math.floor(lost * share), frac: (lost * share) % 1 };
      });
      let allocated = allocations.reduce((s, a) => s + a.base, 0);
      allocations.sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < lost - allocated; i++) {
        allocations[i % allocations.length].base += 1;
      }
      allocations.forEach((a) => {
        if (a.base > 0) applyBattleGlory(a.attacker, a.base);
        if (a.base > 0) {
          killsByAttacker.set(a.attacker.groupId, (killsByAttacker.get(a.attacker.groupId) || 0) + a.base);
        }
      });
    });

    stepLogs.forEach((log) => {
      const kills = killsByAttacker.get(log.attackerId) || 0;
      if (log.attackerSide === "A") {
        log.killsA = kills;
        log.killsB = 0;
      } else if (log.attackerSide === "B") {
        log.killsA = 0;
        log.killsB = kills;
      }
      log.unitsDied = kills;
    });

    allTeams.forEach((t) => {
      if (t.unitData.effects.brotherhoodHP && t.units > 0) {
        const oldHpPer = t.stats.hp;
        const newHpPer = t.baseHp + t.unitData.effects.brotherhoodHP.hpPerUnit * (t.units - 1);
        if (newHpPer !== oldHpPer) {
          t.totalHp -= (oldHpPer - newHpPer) * t.units;
          t.totalHp = Math.max(t.units, t.totalHp);
          t.stats.hp = newHpPer;
        }
      }
    });

    allTeams.forEach((t) => {
      if (t.units <= 0) {
        t.nextPrimaryAttack = Infinity;
        t.nextSecondaryAttack = Infinity;
        t.trampleTick = Infinity;
        return;
      }
      const target = teamById[t.currentTargetId];
      if (!target || target.units <= 0) {
        t.currentTargetId = pickNextTarget(t, t.side === "A" ? teamsB : teamsA);
        if (!t.currentTargetId) {
          t.nextPrimaryAttack = Infinity;
          t.nextSecondaryAttack = Infinity;
        }
      }
    });
  }

  const winner = teamsA.some(t => t.units > 0) ? (teamsB.some(t => t.units > 0) ? "Draw" : "A")
    : (teamsB.some(t => t.units > 0) ? "B" : "Draw");

  renderMultiResults(teamsA, teamsB, time, winner);
  renderMultiBattleLog(battleLog);
}







function runBattle() {
  // === BUILDING MODE ===
  if (document.getElementById("vsBuildingToggle")?.checked) {
    try {
      return runBuildingBattle();
    } catch (e) {
      console.error("Building battle error:", e);
      alert("Building battle error: " + e.message);
      return;
    }
  }

  const unitA = getUnitData("A");
  const unitB = getUnitData("B");
  const overkillEnabled = document.getElementById("overkillEnabled").checked;
  const rangeSpeedEnabled = document.getElementById("rangeSpeedEnabled")?.checked;
  const splitA = document.getElementById("A_splitDamage")?.checked;
  const splitTargetsA = Math.max(1, parseInt(document.getElementById("A_splitTargets")?.value) || 1);
  const splitB = document.getElementById("B_splitDamage")?.checked;
  const splitTargetsB = Math.max(1, parseInt(document.getElementById("B_splitTargets")?.value) || 1);

  // --- TEAM INITIALIZATION ---
  // Each team tracks separate timers for primary and secondary weapons.
  // If no secondary weapon, its timer is Infinity (never fires).

  // Range & Speed: shorter-range unit must close distance before attacking
  let closingDelayA = 0, closingDelayB = 0;
  if (rangeSpeedEnabled) {
    // Spearwall/palings extend effective engagement range only vs charging cavalry
    const bIsCavalry = unitB.tags.includes("Cavalry") && unitB.chargeDamage > 0;
    const aIsCavalry = unitA.tags.includes("Cavalry") && unitA.chargeDamage > 0;
    const effectiveRangeA = ((unitA.effects.spearwall || unitA.effects.palings) && bIsCavalry) ? Math.max(unitA.weaponRange, 1.04) : unitA.weaponRange;
    const effectiveRangeB = ((unitB.effects.spearwall || unitB.effects.palings) && aIsCavalry) ? Math.max(unitB.weaponRange, 1.04) : unitB.weaponRange;
    const speedA = unitA.effects.movementBurst ? unitA.speed * (1 + unitA.effects.movementBurst.speedBonus / 100) : unitA.speed;
    const speedB = unitB.effects.movementBurst ? unitB.speed * (1 + unitB.effects.movementBurst.speedBonus / 100) : unitB.speed;
    if (effectiveRangeB > effectiveRangeA) closingDelayA = (effectiveRangeB - effectiveRangeA) / speedA;
    if (effectiveRangeA > effectiveRangeB) closingDelayB = (effectiveRangeA - effectiveRangeB) / speedB;
  }

  const primaryStartA = (unitA.firstHitEnabled
    ? -unitA.freeHits * unitA.stats.attackSpeed
    : 0) + closingDelayA;

  const primaryStartB = (unitB.firstHitEnabled
    ? -unitB.freeHits * unitB.stats.attackSpeed
    : 0) + closingDelayB;

  let teamA = {
    units: unitA.count,
    totalHp: 0,
    stats: applyBuffs(unitA, 0),
    originalStats: unitA.stats,
    nextPrimaryAttack: primaryStartA,
    nextSecondaryAttack: unitA.secondaryWeapon ? 0 : Infinity,
    tags: unitA.tags,
    unitData: unitA,
    hasCharged: false,
    chargeTime: -Infinity,
    hasBlocked: false,
    trampleTick: unitA.effects.trample ? 0 : Infinity,
    trampleActive: false,
    trampleEnd: -1,
  };

  let teamB = {
    units: unitB.count,
    totalHp: 0,
    stats: applyBuffs(unitB, 0),
    originalStats: unitB.stats,
    nextPrimaryAttack: primaryStartB,
    nextSecondaryAttack: unitB.secondaryWeapon ? 0 : Infinity,
    tags: unitB.tags,
    unitData: unitB,
    hasCharged: false,
    chargeTime: -Infinity,
    hasBlocked: false,
    trampleTick: unitB.effects.trample ? 0 : Infinity,
    trampleActive: false,
    trampleEnd: -1,
  };

  // Brotherhood HP: track base hp separately, effective hp includes brotherhood bonus
  teamA.baseHp = teamA.stats.hp;
  teamB.baseHp = teamB.stats.hp;
  if (unitA.effects.brotherhoodHP) {
    teamA.stats.hp = teamA.baseHp + unitA.effects.brotherhoodHP.hpPerUnit * (teamA.units - 1);
  }
  if (unitB.effects.brotherhoodHP) {
    teamB.stats.hp = teamB.baseHp + unitB.effects.brotherhoodHP.hpPerUnit * (teamB.units - 1);
  }

  teamA.totalHp = teamA.stats.hp * teamA.units;
  teamB.totalHp = teamB.stats.hp * teamB.units;

  // --- PRE-BATTLE: Opening attacks (Donso javelin, Earl's Guard dagger) ---
  function applyOpeningAttack(attackerUnit, attackerTeam, defenderTeam, defenderStats) {
    const oa = attackerUnit.effects.openingAttack;
    if (!oa) return;
    const armor = defenderStats.rangedArmor || 0;
    const dmgPerUnit = Math.max(1, oa.damage - armor);
    const totalDmg = dmgPerUnit * attackerTeam.units;
    defenderTeam.totalHp -= totalDmg;
    if (totalDmg > 0) {
      const unitsLost = Math.floor(
        (defenderTeam.stats.hp * defenderTeam.units - defenderTeam.totalHp) / defenderTeam.stats.hp
      );
      defenderTeam.units = Math.max(0, defenderTeam.units - unitsLost);
    }
  }
  applyOpeningAttack(unitA, teamA, teamB, teamB.stats);
  applyOpeningAttack(unitB, teamB, teamA, teamA.stats);

  // --- PRE-BATTLE: Spearwall / Palings vs Cavalry ---
  // Stun delays enemy first attack, cancels charge bonus
  function applyAntiCav(defenderUnit, defenderTeam, attackerUnit, attackerTeam) {
    if (!attackerTeam.tags.includes("Cavalry")) return;
    // Palings (higher priority, longer stun + damage)
    const palings = defenderUnit.effects.palings;
    if (palings) {
      attackerTeam.nextPrimaryAttack = Math.max(attackerTeam.nextPrimaryAttack, palings.stunDuration);
      attackerUnit.chargeDamage = 0; // cancel charge
      // Deal palings damage
      const totalDmg = palings.damage * defenderTeam.units;
      attackerTeam.totalHp -= totalDmg;
      if (totalDmg > 0) {
        const unitsLost = Math.floor(
          (attackerTeam.stats.hp * attackerTeam.units - attackerTeam.totalHp) / attackerTeam.stats.hp
        );
        attackerTeam.units = Math.max(0, attackerTeam.units - unitsLost);
      }
      return;
    }
    // Spearwall
    const spearwall = defenderUnit.effects.spearwall;
    if (spearwall) {
      attackerTeam.nextPrimaryAttack = Math.max(attackerTeam.nextPrimaryAttack, spearwall.stunDuration);
      attackerUnit.chargeDamage = 0; // cancel charge
    }
  }
  applyAntiCav(unitA, teamA, unitB, teamB);
  applyAntiCav(unitB, teamB, unitA, teamA);

  const battleLog = [];
  // Log opening attacks if any occurred
  if (unitA.effects.openingAttack || unitB.effects.openingAttack) {
    battleLog.push({
      time: "Pre",
      aWeapon: unitA.effects.openingAttack ? "Opening" : "â€”",
      aDmg: unitA.effects.openingAttack ? (Math.max(1, unitA.effects.openingAttack.damage - (teamB.stats.rangedArmor || 0)) * teamA.units) : 0,
      aUnits: teamA.units, aHp: Math.round(teamA.totalHp),
      bWeapon: unitB.effects.openingAttack ? "Opening" : "â€”",
      bDmg: unitB.effects.openingAttack ? (Math.max(1, unitB.effects.openingAttack.damage - (teamA.stats.rangedArmor || 0)) * teamB.units) : 0,
      bUnits: teamB.units, bHp: Math.round(teamB.totalHp),
      notes: [unitA.effects.openingAttack ? unitA.name : "", unitB.effects.openingAttack ? unitB.name : ""].filter(Boolean).join(", ")
    });
  }

  // Log spearwall/palings if triggered
  const antiCavNotesA = [];
  const antiCavNotesB = [];
  if (unitA.effects.palings && teamB.tags.includes("Cavalry")) {
    antiCavNotesA.push(`Palings (stun ${formatSeconds(unitA.effects.palings.stunDuration)}s)`);
  } else if (unitA.effects.spearwall && teamB.tags.includes("Cavalry")) {
    antiCavNotesA.push(`Spearwall (stun ${formatSeconds(unitA.effects.spearwall.stunDuration)}s)`);
  }
  if (unitB.effects.palings && teamA.tags.includes("Cavalry")) {
    antiCavNotesB.push(`Palings (stun ${formatSeconds(unitB.effects.palings.stunDuration)}s)`);
  } else if (unitB.effects.spearwall && teamA.tags.includes("Cavalry")) {
    antiCavNotesB.push(`Spearwall (stun ${formatSeconds(unitB.effects.spearwall.stunDuration)}s)`);
  }
  if (antiCavNotesA.length || antiCavNotesB.length) {
    battleLog.push({
      time: "Pre",
      aWeapon: antiCavNotesA[0] || "â€”", aDmg: unitA.effects.palings && teamB.tags.includes("Cavalry") ? unitA.effects.palings.damage * teamA.units : 0,
      aUnits: teamA.units, aHp: Math.round(teamA.totalHp),
      bWeapon: antiCavNotesB[0] || "â€”", bDmg: unitB.effects.palings && teamA.tags.includes("Cavalry") ? unitB.effects.palings.damage * teamB.units : 0,
      bUnits: teamB.units, bHp: Math.round(teamB.totalHp),
      notes: [...antiCavNotesA, ...antiCavNotesB].join(", ")
    });
  }

  let time = 0;
  const maxTime = 300;
  const EPSILON = 0.0001;

  // Track atkSpeedDebuff applied by enemy
  teamA.atkSpeedDebuffUntil = -Infinity;
  teamB.atkSpeedDebuffUntil = -Infinity;

  // --- Helper: apply unique effect stat modifiers for a team at current time ---
  function getEffectiveAttackSpeed(unit, baseAttackSpeed, time, team) {
    let atkSpeed = baseAttackSpeed;
    const fx = unit.effects;

    // Arrow Volley: +X% attack speed for duration (starts at t=0)
    if (fx.arrowVolley && time <= fx.arrowVolley.duration + EPSILON) {
      atkSpeed /= (1 + fx.arrowVolley.atkSpeedBonus / 100);
    }
    // Fortitude: +X% attack speed for duration (starts at t=0)
    if (fx.fortitude && time <= fx.fortitude.duration + EPSILON) {
      atkSpeed /= (1 + fx.fortitude.atkSpeedBonus / 100);
    }
    // Static Deployment: +X% attack speed after delay
    if (fx.staticDeployment && time >= fx.staticDeployment.delay - EPSILON) {
      atkSpeed /= (1 + fx.staticDeployment.atkSpeedBonus / 100);
    }
    // Shield Wall: -X% attack speed (permanent while enabled)
    if (fx.shieldWall) {
      atkSpeed /= (1 - fx.shieldWall.atkSpeedPenalty / 100);
    }
    // Atk Speed Debuff from enemy (e.g. Szlachta Bludgeoning Attacks)
    if (team && team.atkSpeedDebuffUntil >= time - EPSILON) {
      atkSpeed /= (1 - team.atkSpeedDebuffReduction / 100);
    }
    return atkSpeed;
  }

  function getEffectiveAttack(unit, baseAttack, time, team) {
    let atk = baseAttack;
    const fx = unit.effects;
    // Berserking: +attackBonus for duration
    if (fx.berserking && time <= fx.berserking.duration + EPSILON) {
      atk += fx.berserking.attackBonus;
    }
    // Battle Glory: accumulated attack bonus from kills
    if (team && team.gloryBonusAtk) {
      atk += team.gloryBonusAtk;
    }
    return atk;
  }

  function getEffectiveArmor(unit, baseMeleeArmor, baseRangedArmor, time, enemyEffects) {
    let mArmor = baseMeleeArmor;
    let rArmor = baseRangedArmor;
    const fx = unit.effects;
    // Berserking: -armorPenalty for duration
    if (fx.berserking && time <= fx.berserking.duration + EPSILON) {
      mArmor -= fx.berserking.armorPenalty;
      rArmor -= fx.berserking.armorPenalty;
    }
    // Deploy Pavise: +armorBonus ranged armor for duration
    if (fx.deployPavise && time <= fx.deployPavise.duration + EPSILON) {
      rArmor += fx.deployPavise.armorBonus;
    }
    // Armor Aura (Kharash): +armorBonus to self team
    if (fx.armorAura) {
      mArmor += fx.armorAura.armorBonus;
      rArmor += fx.armorAura.armorBonus;
    }
    // Teutonic Wrath: enemy reduces our armor
    if (enemyEffects && enemyEffects.armorDebuffAura) {
      mArmor -= enemyEffects.armorDebuffAura.armorReduction;
      rArmor -= enemyEffects.armorDebuffAura.armorReduction;
    }
    return { meleeArmor: mArmor, rangedArmor: rArmor };
  }

  // --- BATTLE LOOP ---

  while (teamA.units > 0 && teamB.units > 0 && time < maxTime) {
    // Advance to next weapon event (any weapon from either team)
    const nextEventTime = Math.min(
      teamA.nextPrimaryAttack,
      teamA.nextSecondaryAttack,
      teamB.nextPrimaryAttack,
      teamB.nextSecondaryAttack,
      teamA.trampleTick,
      teamB.trampleTick
    );
    time = nextEventTime;

    // Refresh buffs at current time
    teamA.stats = applyBuffs(unitA, time);
    teamB.stats = applyBuffs(unitB, time);

    // Apply unique effect stat modifiers
    const atkSpeedA = getEffectiveAttackSpeed(unitA, teamA.stats.attackSpeed, time, teamA);
    const atkSpeedB = getEffectiveAttackSpeed(unitB, teamB.stats.attackSpeed, time, teamB);
    const armorA = getEffectiveArmor(unitA, teamA.stats.meleeArmor, teamA.stats.rangedArmor, time, unitB.effects);
    const armorB = getEffectiveArmor(unitB, teamB.stats.meleeArmor, teamB.stats.rangedArmor, time, unitA.effects);

    // Build effective stat objects for damage calc
    const effectiveStatsA = { ...teamA.stats, ...armorA };
    const effectiveStatsB = { ...teamB.stats, ...armorB };

    // Calculate ALL damage BEFORE applying any (simultaneous)
    let damageToB = 0;
    let damageToA = 0;
    let logNotesA = [], logNotesB = [];
    let aFiredPrimary = false, aFiredSecondary = false;
    let bFiredPrimary = false, bFiredSecondary = false;

    // === TEAM A PRIMARY WEAPON ===
    if (teamA.nextPrimaryAttack <= time + EPSILON && teamA.units > 0) {
      let attackValue = getEffectiveAttack(unitA, teamA.stats.attack, time, teamA);
      if (!teamA.hasCharged && unitA.chargeDamage > 0) {
        attackValue += unitA.chargeDamage;
        teamA.hasCharged = true;
        teamA.chargeTime = time;
      }
      // Post-charge attack buff (e.g. Royal Knight +3 for 5s)
      const pcBuff = unitA.effects.postChargeAttackBuff;
      if (pcBuff && teamA.hasCharged && time <= teamA.chargeTime + pcBuff.duration + EPSILON && time > teamA.chargeTime + EPSILON) {
        attackValue += pcBuff.value;
      }
      const armorPenA = unitA.effects.armorPenetration ? unitA.effects.armorPenetration.penetration : 0;
      const dmg = calcWeaponDamage(
        unitA.weaponType,
        attackValue,
        teamA.originalStats.bonus,
        teamB.tags,
        effectiveStatsB,
        armorPenA
      );
      // AoE: splash (full damage) or falloff (center=full, outer=linear decrease)
      let splashA = 1;
      let totalTargetsA = 1;
      if (unitA.effects.aoeSplash) {
        splashA = Math.min(unitA.effects.aoeSplash.unitsHit, teamB.units);
        totalTargetsA = splashA;
      } else if (unitA.effects.aoeFalloff) {
        totalTargetsA = Math.min(unitA.effects.aoeFalloff.unitsHit, teamB.units);
        splashA = (totalTargetsA + 1) / 2;
      }
      damageToB += dmg * teamA.units * splashA;
      teamA.nextPrimaryAttack = time + atkSpeedA;
      aFiredPrimary = true;
      if (unitA.chargeDamage > 0 && (!teamA.hasCharged || time <= teamA.chargeTime + EPSILON)) logNotesA.push("Charge");
      if (unitA.effects.aoeSplash && totalTargetsA > 1) logNotesA.push(`AoEÃ—${totalTargetsA}`);
      if (unitA.effects.aoeFalloff && totalTargetsA > 1) logNotesA.push(`AoEÃ—${totalTargetsA}(falloff)`);
      // Atk Speed Debuff: slow enemy on hit
      if (unitA.effects.atkSpeedDebuff) {
        teamB.atkSpeedDebuffUntil = time + unitA.effects.atkSpeedDebuff.duration;
        teamB.atkSpeedDebuffReduction = unitA.effects.atkSpeedDebuff.reduction;
      }
      // Damage Debuff on Hit (Ruinous Blinding): reduce enemy damage output
      if (unitA.effects.dmgDebuffOnHit) {
        teamB.dmgDebuffUntil = time + unitA.effects.dmgDebuffOnHit.duration;
        teamB.dmgDebuffReduction = unitA.effects.dmgDebuffOnHit.reduction;
      }
    }

    // === TEAM A SECONDARY WEAPON ===
    if (teamA.unitData.secondaryWeapon &&
        teamA.nextSecondaryAttack <= time + EPSILON && teamA.units > 0) {
      const sec = teamA.unitData.secondaryWeapon;
      const armorPenA2 = unitA.effects.armorPenetration ? unitA.effects.armorPenetration.penetration : 0;
      const dmg = calcWeaponDamage(
        sec.type,
        sec.stats.attack || 0,
        sec.stats.bonus || {},
        teamB.tags,
        effectiveStatsB,
        armorPenA2
      );
      damageToB += dmg * teamA.units;
      teamA.nextSecondaryAttack = time + sec.attackSpeed;
      aFiredSecondary = true;
    }

    // === TEAM B PRIMARY WEAPON ===
    if (teamB.nextPrimaryAttack <= time + EPSILON && teamB.units > 0) {
      let attackValue = getEffectiveAttack(unitB, teamB.stats.attack, time, teamB);
      if (!teamB.hasCharged && unitB.chargeDamage > 0) {
        attackValue += unitB.chargeDamage;
        teamB.hasCharged = true;
        teamB.chargeTime = time;
      }
      // Post-charge attack buff (e.g. Royal Knight +3 for 5s)
      const pcBuff = unitB.effects.postChargeAttackBuff;
      if (pcBuff && teamB.hasCharged && time <= teamB.chargeTime + pcBuff.duration + EPSILON && time > teamB.chargeTime + EPSILON) {
        attackValue += pcBuff.value;
      }
      const armorPenB = unitB.effects.armorPenetration ? unitB.effects.armorPenetration.penetration : 0;
      const dmg = calcWeaponDamage(
        unitB.weaponType,
        attackValue,
        teamB.originalStats.bonus,
        teamA.tags,
        effectiveStatsA,
        armorPenB
      );
      // AoE: splash (full damage) or falloff (center=full, outer=linear decrease)
      let splashB = 1;
      let totalTargetsB = 1;
      if (unitB.effects.aoeSplash) {
        splashB = Math.min(unitB.effects.aoeSplash.unitsHit, teamA.units);
        totalTargetsB = splashB;
      } else if (unitB.effects.aoeFalloff) {
        totalTargetsB = Math.min(unitB.effects.aoeFalloff.unitsHit, teamA.units);
        splashB = (totalTargetsB + 1) / 2;
      }
      damageToA += dmg * teamB.units * splashB;
      teamB.nextPrimaryAttack = time + atkSpeedB;
      bFiredPrimary = true;
      if (unitB.chargeDamage > 0 && (!teamB.hasCharged || time <= teamB.chargeTime + EPSILON)) logNotesB.push("Charge");
      if (unitB.effects.aoeSplash && totalTargetsB > 1) logNotesB.push(`AoEÃ—${totalTargetsB}`);
      if (unitB.effects.aoeFalloff && totalTargetsB > 1) logNotesB.push(`AoEÃ—${totalTargetsB}(falloff)`);
      // Atk Speed Debuff: slow enemy on hit
      if (unitB.effects.atkSpeedDebuff) {
        teamA.atkSpeedDebuffUntil = time + unitB.effects.atkSpeedDebuff.duration;
        teamA.atkSpeedDebuffReduction = unitB.effects.atkSpeedDebuff.reduction;
      }
      // Damage Debuff on Hit (Ruinous Blinding): reduce enemy damage output
      if (unitB.effects.dmgDebuffOnHit) {
        teamA.dmgDebuffUntil = time + unitB.effects.dmgDebuffOnHit.duration;
        teamA.dmgDebuffReduction = unitB.effects.dmgDebuffOnHit.reduction;
      }
    }

    // === TEAM B SECONDARY WEAPON ===
    if (teamB.unitData.secondaryWeapon &&
        teamB.nextSecondaryAttack <= time + EPSILON && teamB.units > 0) {
      const sec = teamB.unitData.secondaryWeapon;
      const armorPenB2 = unitB.effects.armorPenetration ? unitB.effects.armorPenetration.penetration : 0;
      const dmg = calcWeaponDamage(
        sec.type,
        sec.stats.attack || 0,
        sec.stats.bonus || {},
        teamA.tags,
        effectiveStatsA,
        armorPenB2
      );
      damageToA += dmg * teamB.units;
      teamB.nextSecondaryAttack = time + sec.attackSpeed;
      bFiredSecondary = true;
    }

    // === APPLY CAMEL UNEASE: reduce enemy cavalry damage ===
    if (unitA.effects.camelUnease && teamB.tags.includes("Cavalry")) {
      damageToA *= (1 - unitA.effects.camelUnease.reduction / 100);
    }
    if (unitB.effects.camelUnease && teamA.tags.includes("Cavalry")) {
      damageToB *= (1 - unitB.effects.camelUnease.reduction / 100);
    }

    // === APPLY GUNPOWDER RESISTANCE: reduce damage from gunpowder units ===
    if (unitA.effects.gunpowderResistance && (teamB.tags.includes("Gunpowder") || teamB.tags.includes("Light Gunpowder"))) {
      damageToA *= (1 - unitA.effects.gunpowderResistance.reduction / 100);
    }
    if (unitB.effects.gunpowderResistance && (teamA.tags.includes("Gunpowder") || teamA.tags.includes("Light Gunpowder"))) {
      damageToB *= (1 - unitB.effects.gunpowderResistance.reduction / 100);
    }

    // === APPLY FORTITUDE: increased melee damage taken ===
    if (unitA.effects.fortitude && time <= unitA.effects.fortitude.duration + EPSILON && unitB.weaponType === "melee") {
      damageToA *= (1 + unitA.effects.fortitude.dmgTakenIncrease / 100);
    }
    if (unitB.effects.fortitude && time <= unitB.effects.fortitude.duration + EPSILON && unitA.weaponType === "melee") {
      damageToB *= (1 + unitB.effects.fortitude.dmgTakenIncrease / 100);
    }

    // === APPLY SHIELD WALL: reduce incoming ranged damage ===
    if (unitA.effects.shieldWall && unitB.weaponType === "ranged") {
      damageToA *= (1 - unitA.effects.shieldWall.rangedDmgReduction / 100);
    }
    if (unitB.effects.shieldWall && unitA.weaponType === "ranged") {
      damageToB *= (1 - unitB.effects.shieldWall.rangedDmgReduction / 100);
    }

    // === APPLY DAMAGE DEBUFF ON HIT (Ruinous Blinding): reduce damage output ===
    if (teamA.dmgDebuffUntil && teamA.dmgDebuffUntil > time) {
      damageToB *= (1 - teamA.dmgDebuffReduction / 100);
    }
    if (teamB.dmgDebuffUntil && teamB.dmgDebuffUntil > time) {
      damageToA *= (1 - teamB.dmgDebuffReduction / 100);
    }

    // === APPLY DEFLECTIVE ARMOR: block first incoming hit (Samurai) ===
    if (unitA.effects.deflectiveArmor && !teamA.hasBlocked && damageToA > 0) {
      damageToA = 0;
      teamA.hasBlocked = true;
    }
    if (unitB.effects.deflectiveArmor && !teamB.hasBlocked && damageToB > 0) {
      damageToB = 0;
      teamB.hasBlocked = true;
    }

    // === APPLY PERCENT DAMAGE (Kanabo Samurai): add % of enemy max HP as bonus ===
    if (unitA.effects.percentDamage && damageToB > 0) {
      damageToB += (unitA.effects.percentDamage.percent / 100) * teamB.stats.hp * teamA.units;
    }
    if (unitB.effects.percentDamage && damageToA > 0) {
      damageToA += (unitB.effects.percentDamage.percent / 100) * teamA.stats.hp * teamB.units;
    }

    // === APPLY BLEED (Kipchak Archer): total bleed = dps * duration per attacking unit, ignores armor ===
    if (unitA.effects.bleed && damageToB > 0) {
      const bleed = unitA.effects.bleed;
      damageToB += bleed.dps * bleed.duration * teamA.units;
    }
    if (unitB.effects.bleed && damageToA > 0) {
      const bleed = unitB.effects.bleed;
      damageToA += bleed.dps * bleed.duration * teamB.units;
    }

    // === APPLY TRAMPLE (Raider Elephant): Periodic AoE ticks over duration ===
    const TRAMPLE_TICK = 0.5; // 0.5s between ticks
    if (unitA.effects.trample && teamA.trampleTick <= time + EPSILON && teamA.units > 0) {
      const t = unitA.effects.trample;
      if (!teamA.trampleActive) {
        teamA.trampleActive = true;
        teamA.trampleEnd = time + t.duration;
      }
      const tickDmg = t.dps * TRAMPLE_TICK;
      const targets = Math.min(t.unitsHit || 1, teamB.units);
      damageToB += tickDmg * teamA.units * targets;
      if (time + TRAMPLE_TICK < teamA.trampleEnd - EPSILON) {
        teamA.trampleTick = time + TRAMPLE_TICK;
      } else {
        teamA.trampleActive = false;
        teamA.trampleTick = teamA.trampleEnd + t.cooldown;
      }
    }
    if (unitB.effects.trample && teamB.trampleTick <= time + EPSILON && teamB.units > 0) {
      const t = unitB.effects.trample;
      if (!teamB.trampleActive) {
        teamB.trampleActive = true;
        teamB.trampleEnd = time + t.duration;
      }
      const tickDmg = t.dps * TRAMPLE_TICK;
      const targets = Math.min(t.unitsHit || 1, teamA.units);
      damageToA += tickDmg * teamB.units * targets;
      if (time + TRAMPLE_TICK < teamB.trampleEnd - EPSILON) {
        teamB.trampleTick = time + TRAMPLE_TICK;
      } else {
        teamB.trampleActive = false;
        teamB.trampleTick = teamB.trampleEnd + t.cooldown;
      }
    }

    // === APPLY OVERKILL WASTE: each attacker can only kill its target, excess is lost ===
    // Split-aware: when split is enabled, attackers are divided into groups per split target
    let wasteA = 0, wasteB = 0;
    if (overkillEnabled) {
      const rawDmgToB = damageToB, rawDmgToA = damageToA;
      if (damageToB > 0 && teamA.units > 0) {
        const dmgPer = damageToB / teamA.units;
        const hpPer = teamB.stats.hp;
        const frontHpRaw = teamB.totalHp - (teamB.units - 1) * hpPer;
        const frontHp = Math.min(hpPer, Math.max(EPSILON, frontHpRaw));
        const targets = (splitA && teamB.units > 1) ? Math.min(splitTargetsA, teamB.units, teamA.units) : 1;
        let eff = 0;
        if (targets > 1) {
          const perGroup = Math.floor(teamA.units / targets);
          const extra = teamA.units % targets;
          for (let g = 0; g < targets; g++) {
            const groupSize = perGroup + (g < extra ? 1 : 0);
            let tgtHp = (g === 0) ? frontHp : hpPer;
            for (let i = 0; i < groupSize; i++) {
              if (tgtHp <= 0) break;
              const dealt = Math.min(dmgPer, tgtHp);
              eff += dealt;
              tgtHp -= dealt;
              if (tgtHp <= 0) tgtHp = hpPer;
            }
          }
        } else {
          let fHp = frontHp;
          for (let i = 0; i < teamA.units; i++) {
            if (fHp <= 0) break;
            const dealt = Math.min(dmgPer, fHp);
            eff += dealt;
            fHp -= dealt;
            if (fHp <= 0) fHp = hpPer;
          }
        }
        damageToB = eff;
      }
      if (damageToA > 0 && teamB.units > 0) {
        const dmgPer = damageToA / teamB.units;
        const hpPer = teamA.stats.hp;
        const frontHpRaw = teamA.totalHp - (teamA.units - 1) * hpPer;
        const frontHp = Math.min(hpPer, Math.max(EPSILON, frontHpRaw));
        const targets = (splitB && teamA.units > 1) ? Math.min(splitTargetsB, teamA.units, teamB.units) : 1;
        let eff = 0;
        if (targets > 1) {
          const perGroup = Math.floor(teamB.units / targets);
          const extra = teamB.units % targets;
          for (let g = 0; g < targets; g++) {
            const groupSize = perGroup + (g < extra ? 1 : 0);
            let tgtHp = (g === 0) ? frontHp : hpPer;
            for (let i = 0; i < groupSize; i++) {
              if (tgtHp <= 0) break;
              const dealt = Math.min(dmgPer, tgtHp);
              eff += dealt;
              tgtHp -= dealt;
              if (tgtHp <= 0) tgtHp = hpPer;
            }
          }
        } else {
          let fHp = frontHp;
          for (let i = 0; i < teamB.units; i++) {
            if (fHp <= 0) break;
            const dealt = Math.min(dmgPer, fHp);
            eff += dealt;
            fHp -= dealt;
            if (fHp <= 0) fHp = hpPer;
          }
        }
        damageToA = eff;
      }
      wasteA = rawDmgToB - damageToB;
      wasteB = rawDmgToA - damageToA;
    }


    // Apply damage SIMULTANEOUSLY
    teamB.totalHp -= damageToB;
    teamA.totalHp -= damageToA;

    // Apply heal-per-attack effects (e.g. Keshik Battle Veteran)
    const healA = unitA.effects.healPerAttack;
    if (healA && damageToB > 0) {
      const maxHpA = teamA.stats.hp * teamA.units;
      teamA.totalHp = Math.min(maxHpA, teamA.totalHp + healA.value * teamA.units);
    }
    const healB = unitB.effects.healPerAttack;
    if (healB && damageToA > 0) {
      const maxHpB = teamB.stats.hp * teamB.units;
      teamB.totalHp = Math.min(maxHpB, teamB.totalHp + healB.value * teamB.units);
    }

    // Heal Aura: passive HP/s regen for all friendly units (e.g. Hospitaller Knight)
    if (unitA.effects.healAura && teamA.units > 0) {
      const dt = time - (teamA.lastHealAuraTime || 0);
      if (dt > 0) {
        const maxHpA = teamA.stats.hp * teamA.units;
        teamA.totalHp = Math.min(maxHpA, teamA.totalHp + unitA.effects.healAura.hps * teamA.units * dt);
      }
    }
    if (unitB.effects.healAura && teamB.units > 0) {
      const dt = time - (teamB.lastHealAuraTime || 0);
      if (dt > 0) {
        const maxHpB = teamB.stats.hp * teamB.units;
        teamB.totalHp = Math.min(maxHpB, teamB.totalHp + unitB.effects.healAura.hps * teamB.units * dt);
      }
    }
    teamA.lastHealAuraTime = time;
    teamB.lastHealAuraTime = time;

    // Update unit counts after both damages are applied
    const prevUnitsB = teamB.units;
    const prevUnitsA = teamA.units;
    if (damageToB > 0) {
      const unitsLost = Math.floor(
        (teamB.stats.hp * teamB.units - teamB.totalHp) / teamB.stats.hp
      );
      teamB.units = Math.max(0, teamB.units - unitsLost);
    }

    if (damageToA > 0) {
      const unitsLost = Math.floor(
        (teamA.stats.hp * teamA.units - teamA.totalHp) / teamA.stats.hp
      );
      teamA.units = Math.max(0, teamA.units - unitsLost);
    }

    // === SPLIT DAMAGE CORRECTION: fewer units die when damage is spread ===
    // Split requires >1 attacker and >1 defender; targets capped at both counts
    if (splitA && damageToB > 0 && prevUnitsA > 1 && prevUnitsB > 1 && teamB.units < prevUnitsB) {
      const targets = Math.min(splitTargetsA, prevUnitsB, prevUnitsA);
      if (targets > 1) {
        const dmgPerTarget = damageToB / targets;
        const hpPer = teamB.stats.hp;
        const prevTotalHp = teamB.totalHp + damageToB;
        const frontHpBefore = prevTotalHp - (prevUnitsB - 1) * hpPer;
        let kills = 0, tgtHp = frontHpBefore;
        for (let t = 0; t < targets; t++) {
          if (dmgPerTarget >= tgtHp) { kills++; tgtHp = hpPer; }
          else break;
        }
        const poolKills = prevUnitsB - teamB.units;
        if (kills < poolKills) {
          teamB.units = prevUnitsB - kills;
          const minHp = (teamB.units - 1) * hpPer + 1;
          if (teamB.totalHp < minHp) teamB.totalHp = minHp;
        }
      }
    }
    if (splitB && damageToA > 0 && prevUnitsB > 1 && prevUnitsA > 1 && teamA.units < prevUnitsA) {
      const targets = Math.min(splitTargetsB, prevUnitsA, prevUnitsB);
      if (targets > 1) {
        const dmgPerTarget = damageToA / targets;
        const hpPer = teamA.stats.hp;
        const prevTotalHp = teamA.totalHp + damageToA;
        const frontHpBefore = prevTotalHp - (prevUnitsA - 1) * hpPer;
        let kills = 0, tgtHp = frontHpBefore;
        for (let t = 0; t < targets; t++) {
          if (dmgPerTarget >= tgtHp) { kills++; tgtHp = hpPer; }
          else break;
        }
        const poolKills = prevUnitsA - teamA.units;
        if (kills < poolKills) {
          teamA.units = prevUnitsA - kills;
          const minHp = (teamA.units - 1) * hpPer + 1;
          if (teamA.totalHp < minHp) teamA.totalHp = minHp;
        }
      }
    }

    // Battle Glory: +HP and +attack per kill (e.g. Teutonic Knight)
    const killsByA = prevUnitsB - teamB.units;
    const killsByB = prevUnitsA - teamA.units;
    if (unitA.effects.battleGlory && killsByA > 0 && teamA.units > 0) {
      const bg = unitA.effects.battleGlory;
      teamA.gloryBonusHp = (teamA.gloryBonusHp || 0) + bg.hpPerKill * killsByA;
      teamA.gloryBonusAtk = (teamA.gloryBonusAtk || 0) + bg.attackPerKill * killsByA;
      teamA.stats.hp = teamA.baseHp + teamA.gloryBonusHp;
      teamA.totalHp += bg.hpPerKill * killsByA * teamA.units;
    }
    if (unitB.effects.battleGlory && killsByB > 0 && teamB.units > 0) {
      const bg = unitB.effects.battleGlory;
      teamB.gloryBonusHp = (teamB.gloryBonusHp || 0) + bg.hpPerKill * killsByB;
      teamB.gloryBonusAtk = (teamB.gloryBonusAtk || 0) + bg.attackPerKill * killsByB;
      teamB.stats.hp = teamB.baseHp + teamB.gloryBonusHp;
      teamB.totalHp += bg.hpPerKill * killsByB * teamB.units;
    }

    // Brotherhood HP: recalculate effective HP per unit as allies die
    if (unitA.effects.brotherhoodHP && teamA.units > 0) {
      const oldHpPer = teamA.stats.hp;
      const newHpPer = teamA.baseHp + unitA.effects.brotherhoodHP.hpPerUnit * (teamA.units - 1);
      if (newHpPer !== oldHpPer) {
        // Reduce totalHp proportionally: each surviving unit loses the difference
        teamA.totalHp -= (oldHpPer - newHpPer) * teamA.units;
        teamA.totalHp = Math.max(teamA.units, teamA.totalHp); // at least 1 hp per unit
        teamA.stats.hp = newHpPer;
      }
    }
    if (unitB.effects.brotherhoodHP && teamB.units > 0) {
      const oldHpPer = teamB.stats.hp;
      const newHpPer = teamB.baseHp + unitB.effects.brotherhoodHP.hpPerUnit * (teamB.units - 1);
      if (newHpPer !== oldHpPer) {
        teamB.totalHp -= (oldHpPer - newHpPer) * teamB.units;
        teamB.totalHp = Math.max(teamB.units, teamB.totalHp);
        teamB.stats.hp = newHpPer;
      }
    }

    // --- Build log notes for effects ---
    if (unitA.effects.bleed && damageToB > 0) logNotesA.push("Bleed");
    if (unitA.effects.percentDamage && damageToB > 0) logNotesA.push("%HP");
    if (unitA.effects.trample && teamA.trampleActive) logNotesA.push("Trample");
    if (unitA.effects.deflectiveArmor && teamA.hasBlocked && damageToA === 0) logNotesA.push("Blocked");
    if (unitB.effects.bleed && damageToA > 0) logNotesB.push("Bleed");
    if (unitB.effects.percentDamage && damageToA > 0) logNotesB.push("%HP");
    if (unitB.effects.trample && teamB.trampleActive) logNotesB.push("Trample");
    if (unitB.effects.deflectiveArmor && teamB.hasBlocked && damageToB === 0) logNotesB.push("Blocked");
    if (unitA.effects.atkSpeedDebuff && aFiredPrimary) logNotesA.push("Slow");
    if (unitB.effects.atkSpeedDebuff && bFiredPrimary) logNotesB.push("Slow");
    if (unitA.effects.healAura) logNotesA.push("Heal");
    if (unitB.effects.healAura) logNotesB.push("Heal");
    if (unitA.effects.armorPenetration && (aFiredPrimary || aFiredSecondary)) logNotesA.push("ArmorPen");
    if (unitB.effects.armorPenetration && (bFiredPrimary || bFiredSecondary)) logNotesB.push("ArmorPen");
    if (unitA.effects.dmgDebuffOnHit && (aFiredPrimary || aFiredSecondary)) logNotesA.push("Weaken");
    if (unitB.effects.dmgDebuffOnHit && (bFiredPrimary || bFiredSecondary)) logNotesB.push("Weaken");
    if (teamA.dmgDebuffUntil && teamA.dmgDebuffUntil > time && (aFiredPrimary || aFiredSecondary)) logNotesA.push("Weakened");
    if (teamB.dmgDebuffUntil && teamB.dmgDebuffUntil > time && (bFiredPrimary || bFiredSecondary)) logNotesB.push("Weakened");
    if (unitA.effects.berserking && time <= unitA.effects.berserking.duration + EPSILON) logNotesA.push("Berserk");
    if (unitB.effects.berserking && time <= unitB.effects.berserking.duration + EPSILON) logNotesB.push("Berserk");
    if (unitA.effects.shieldWall) logNotesA.push("ShieldWall");
    if (unitB.effects.shieldWall) logNotesB.push("ShieldWall");
    if (unitA.effects.camelUnease && teamB.tags.includes("Cavalry")) logNotesA.push("CamelUnease");
    if (unitB.effects.camelUnease && teamA.tags.includes("Cavalry")) logNotesB.push("CamelUnease");
    if (unitA.effects.gunpowderResistance && (teamB.tags.includes("Gunpowder") || teamB.tags.includes("Light Gunpowder"))) logNotesA.push("GunpowderRes");
    if (unitB.effects.gunpowderResistance && (teamA.tags.includes("Gunpowder") || teamA.tags.includes("Light Gunpowder"))) logNotesB.push("GunpowderRes");
    if (unitA.effects.armorDebuffAura) logNotesA.push("-Armor");
    if (unitB.effects.armorDebuffAura) logNotesB.push("-Armor");
    if (unitA.effects.movementBurst && time <= unitA.effects.movementBurst.duration + EPSILON) logNotesA.push("SpeedBurst");
    if (unitB.effects.movementBurst && time <= unitB.effects.movementBurst.duration + EPSILON) logNotesB.push("SpeedBurst");
    if (unitA.effects.infantrySpeedAura) logNotesA.push("FarimaAura");
    if (unitB.effects.infantrySpeedAura) logNotesB.push("FarimaAura");

    // --- Push battle log entry ---
    const aWeapon = aFiredPrimary && aFiredSecondary ? "Both" : aFiredPrimary ? "Primary" : aFiredSecondary ? "Secondary" : "â€”";
    const bWeapon = bFiredPrimary && bFiredSecondary ? "Both" : bFiredPrimary ? "Primary" : bFiredSecondary ? "Secondary" : "â€”";
    battleLog.push({
      time: time.toFixed(2),
      aWeapon, aDmg: damageToB.toFixed(1), aWaste: wasteA.toFixed(1),
      aUnits: teamA.units, aHp: Math.round(teamA.totalHp),
      aKills: killsByA,
      bWeapon, bDmg: damageToA.toFixed(1), bWaste: wasteB.toFixed(1),
      bUnits: teamB.units, bHp: Math.round(teamB.totalHp),
      bKills: killsByB,
      notes: [...logNotesA, ...logNotesB].join(", ")
    });
  }

  // --- RESULTS DISPLAY ---

  const winner = teamA.units > 0 ? "A" : teamB.units > 0 ? "B" : "Draw";

  // Calculate stats for BOTH teams
  function calcTeamResults(team, unitData, side, splitTargetsAgainst) {
    const hpPct = team.units > 0
      ? (team.totalHp / (team.stats.hp * unitData.count)) * 100
      : 0;
    const unitsLost = unitData.count - team.units;
    const costPerUnit = getTotalCost(unitData.name, side);
    const resourcesLost = costPerUnit * unitsLost;

    // Per-resource breakdown for tooltip (use civ-specific costs if available)
    const unit = units[unitData.name];
    const civGroup = side ? (document.getElementById(`unit${side}Select`).dataset.civGroup || "") : "";
    const costs = (unit && unit.civCosts && civGroup && unit.civCosts[civGroup]) ? unit.civCosts[civGroup] : (unit && unit.costs ? unit.costs : {});
    const costBreakdown = {};
    for (const [res, val] of Object.entries(costs)) {
      costBreakdown[res] = val * unitsLost;
    }

    // Last unit HP calculation
    let lastUnitHp = 0;
    let lastUnitHpMax = team.stats.hp;
    if (team.units > 0) {
      const remainder = team.totalHp % team.stats.hp;
      lastUnitHp = (remainder === 0) ? team.stats.hp : remainder;
    }

    // Partial resource loss from injured surviving units
    const fullHpAlive = team.stats.hp * team.units;
    const hpLostOnSurvivors = fullHpAlive - team.totalHp;
    const partialResLost = team.units > 0 ? (hpLostOnSurvivors / fullHpAlive) * costPerUnit * team.units : 0;

    // Split damage visualization: distribute HP deficit across multiple units
    let splitDamagedUnits = 1;
    let splitUnitHp = lastUnitHp;
    if (splitTargetsAgainst > 1 && team.units > 0 && hpLostOnSurvivors > 0) {
      splitDamagedUnits = Math.min(splitTargetsAgainst, team.units);
      const hpLostPerUnit = hpLostOnSurvivors / splitDamagedUnits;
      splitUnitHp = Math.max(1, team.stats.hp - hpLostPerUnit);
    }

    return { hpPct, unitsLost, resourcesLost, partialResLost, costBreakdown, lastUnitHp, lastUnitHpMax, splitDamagedUnits, splitUnitHp, aliveUnits: team.units, startingUnits: unitData.count };
  }

  const splitAgainstA = (splitB && teamB.units > 1) ? Math.min(splitTargetsB, teamA.units || 1, teamB.units) : 1;
  const splitAgainstB = (splitA && teamA.units > 1) ? Math.min(splitTargetsA, teamB.units || 1, teamA.units) : 1;
  const resultsA = calcTeamResults(teamA, unitA, "A", splitAgainstA);
  const resultsB = calcTeamResults(teamB, unitB, "B", splitAgainstB);

  // Show results container with animation
  const resultsEl = document.getElementById("results");
  resultsEl.style.display = "block";
  resultsEl.style.animation = "none";
  resultsEl.offsetHeight; // trigger reflow
  resultsEl.style.animation = "";
  const multiResults = document.getElementById("multiResultsContainer");
  if (multiResults) multiResults.style.display = "none";
  document.getElementById("resultPanelA").style.display = "";
  document.getElementById("resultPanelB").style.display = "";

  // Winner text
  const winnerTextEl = document.getElementById("winnerText");
  if (winner === "Draw") {
    winnerTextEl.textContent = "Perfect Draw!";
    winnerTextEl.classList.add("draw-banner");
    winnerTextEl.classList.remove("winner-banner");
  } else {
    const winnerName = winner === "A" ? unitA.name : unitB.name;
    winnerTextEl.textContent = `Team ${winner} Wins! (${winnerName})`;
    winnerTextEl.classList.add("winner-banner");
    winnerTextEl.classList.remove("draw-banner");
  }

  // Battle duration
  document.getElementById("battleDuration").textContent = time.toFixed(1) + "s";

  // Team A results
  document.getElementById("resultNameA").textContent = `${unitA.name} (x${unitA.count})`;
  document.getElementById("resultUnitsA").textContent = teamA.units;
  document.getElementById("resultUnitsLostA").textContent = resultsA.unitsLost;
  document.getElementById("resultCostLostA").innerHTML = resultsA.resourcesLost.toFixed(0) +
    (resultsA.partialResLost > 0 ? ` <span style="font-size:0.75em;color:#b8ad9e;">(${resultsA.partialResLost.toFixed(0)})</span>` : "");
  document.getElementById("resultHpPctA").textContent = resultsA.hpPct.toFixed(1) + "%";

  // Team B results
  document.getElementById("resultNameB").textContent = `${unitB.name} (x${unitB.count})`;
  document.getElementById("resultUnitsB").textContent = teamB.units;
  document.getElementById("resultUnitsLostB").textContent = resultsB.unitsLost;
  document.getElementById("resultCostLostB").innerHTML = resultsB.resourcesLost.toFixed(0) +
    (resultsB.partialResLost > 0 ? ` <span style="font-size:0.75em;color:#b8ad9e;">(${resultsB.partialResLost.toFixed(0)})</span>` : "");
  document.getElementById("resultHpPctB").textContent = resultsB.hpPct.toFixed(1) + "%";

  // Feature 1: Resource breakdown tooltips
  setResLostTooltip("resultCostLostA", resultsA.costBreakdown);
  setResLostTooltip("resultCostLostB", resultsB.costBreakdown);

  // Feature 2: Last unit HP info
  setLastUnitHp("lastUnitHpA", resultsA);
  setLastUnitHp("lastUnitHpB", resultsB);

  // Feature 4: Unit grid visualization
  renderUnitGrid("unitGridA", resultsA, "a");
  renderUnitGrid("unitGridB", resultsB, "b");

  // Apply winner/loser styling
  const panelA = document.getElementById("resultPanelA");
  const panelB = document.getElementById("resultPanelB");
  panelA.classList.remove("winner", "loser");
  panelB.classList.remove("winner", "loser");

  const badgeA = document.getElementById("badgeContainerA");
  const badgeB = document.getElementById("badgeContainerB");
  badgeA.innerHTML = "";
  badgeB.innerHTML = "";

  if (winner === "A") {
    panelA.classList.add("winner");
    panelB.classList.add("loser");
    badgeA.innerHTML = '<span class="winner-badge">Winner</span>';
  } else if (winner === "B") {
    panelB.classList.add("winner");
    panelA.classList.add("loser");
    badgeB.innerHTML = '<span class="winner-badge">Winner</span>';
  }

  // Animate HP bars (reset then fill)
  const hpBarA = document.getElementById("hpBarA");
  const hpBarB = document.getElementById("hpBarB");
  hpBarA.style.transition = "none";
  hpBarB.style.transition = "none";
  hpBarA.style.width = "0%";
  hpBarB.style.width = "0%";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hpBarA.style.transition = "width 1s ease-out";
      hpBarB.style.transition = "width 1s ease-out";
      hpBarA.style.width = resultsA.hpPct.toFixed(1) + "%";
      hpBarB.style.width = resultsB.hpPct.toFixed(1) + "%";
    });
  });

  // Render battle log table
  const logContainer = document.getElementById("battleLogContainer");
  if (battleLog.length > 0) {
    const showWaste = overkillEnabled;
    let html = `<table class="battle-log-table">
      <thead><tr>
        <th>Time</th>
        <th class="team-a-col">Weapon</th><th class="team-a-col">Dmg Dealt</th>${showWaste ? '<th class="team-a-col">Wasted</th>' : ''}
        <th class="team-a-col">Units</th><th class="team-a-col">Kills</th><th class="team-a-col">Total HP</th>
        <th class="team-b-col">Weapon</th><th class="team-b-col">Dmg Dealt</th>${showWaste ? '<th class="team-b-col">Wasted</th>' : ''}
        <th class="team-b-col">Units</th><th class="team-b-col">Kills</th><th class="team-b-col">Total HP</th>
        <th>Notes</th>
      </tr></thead><tbody>`;
    for (const e of battleLog) {
      html += `<tr>
        <td>${e.time}s</td>
        <td class="team-a-col">${e.aWeapon}</td><td class="team-a-col">${e.aDmg}</td>${showWaste ? `<td class="team-a-col">${e.aWaste || '0.0'}</td>` : ''}
        <td class="team-a-col">${e.aUnits}</td><td class="team-a-col">${e.aKills ?? 0}</td><td class="team-a-col">${e.aHp}</td>
        <td class="team-b-col">${e.bWeapon}</td><td class="team-b-col">${e.bDmg}</td>${showWaste ? `<td class="team-b-col">${e.bWaste || '0.0'}</td>` : ''}
        <td class="team-b-col">${e.bUnits}</td><td class="team-b-col">${e.bKills ?? 0}</td><td class="team-b-col">${e.bHp}</td>
        <td class="log-notes">${e.notes}</td>
      </tr>`;
    }
    html += "</tbody></table>";
    logContainer.innerHTML = html;
  } else {
    logContainer.innerHTML = "<p class='text-muted'>No events recorded.</p>";
  }

  // Collapse the log by default on new battle
  const logCollapse = document.getElementById("battleLogCollapse");
  if (logCollapse.classList.contains("show")) {
    logCollapse.classList.remove("show");
  }

  resultsEl.scrollIntoView({ behavior: "smooth" });
}


const boAddPickerEl = document.getElementById("boAddPicker");
const boAddCommandBtn = document.getElementById("boAddCommand");

function getBoPickerDefaultType() {
  if (boSelectedCommandId) {
    const cmd = boCommands.find((c) => c.id === boSelectedCommandId);
    const type = cmd?.type || boLastCommandType || "assign";
    const allowed = ["assign", "buildBuilding"];
    if (allowed.includes(type)) return type;
    return allowed.includes(boLastCommandType) ? boLastCommandType : "assign";
  }
  return "assign";
}

function showBoAddPicker() {
  if (!boAddPickerEl) return;
  const def = getBoPickerDefaultType();
  boAddPickerEl.hidden = false;
  boAddPickerEl.querySelectorAll(".bo-add-picker-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.type === def);
  });
}

function hideBoAddPicker() {
  if (boAddPickerEl) boAddPickerEl.hidden = true;
}

boAddCommandBtn?.addEventListener("click", (e) => {
  if (!updateBoCivGate(true, "Select a civilization before adding commands.")) return;
  e.preventDefault();
  if (!boAddPickerEl) return;
  if (boAddPickerEl.hidden) showBoAddPicker();
  else hideBoAddPicker();
});

boAddPickerEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".bo-add-picker-btn");
  if (!btn) return;
  const type = btn.dataset.type || "assign";
  if (!updateBoCivGate(true, "Select a civilization before adding commands.")) return;
  const hadSelectedCommand = !!boSelectedCommandId;
  const insertAfter = boSelectedCommandId || null;
  const cmd = addBoCommand(type, insertAfter);
  if (!cmd) return;

  if (!hadSelectedCommand) {
    setBoCommandToTimelineStart(cmd);
  }
  applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  boLastResults = null;
  hideBoAddPicker();
  selectBoCommand(cmd.id);
  scheduleRunBuildOrder();
});

document.addEventListener("click", (e) => {
  if (!boAddPickerEl || boAddPickerEl.hidden) return;
  if (e.target.closest("#boAddCommand")) return;
  if (e.target.closest("#boAddPicker")) return;
  hideBoAddPicker();
});

document.getElementById("boRunBtn")?.addEventListener("click", () => {
  if (!updateBoCivGate(true, "Select a civilization before running the build order.")) return;
  runBuildOrder();
});

document.getElementById("boOverlayToggle")?.addEventListener("click", () => {
  boOverlayEnabled = !boOverlayEnabled;
  renderBoTimelineEditor();
  renderBoResourceChart(boLastResults?.samples || []);
  renderBoTimelineFooter();
  scheduleBoDraftSave();
});

document.getElementById("boClearPinBtn")?.addEventListener("click", () => {
  if (!Number.isFinite(boPinnedTime)) return;
  boPinnedTime = null;
  renderBoTimelineEditor();
  renderBoGatherRates();
  renderBoTimelineFooter();
});

document.getElementById("boSetupCollapse")?.addEventListener("shown.bs.collapse", () => {
  syncBoDisplayControlStates();
});
document.getElementById("boSetupCollapse")?.addEventListener("hidden.bs.collapse", () => {
  syncBoDisplayControlStates();
});
document.getElementById("boEventCollapse")?.addEventListener("shown.bs.collapse", () => {
  syncBoDisplayControlStates();
});
document.getElementById("boEventCollapse")?.addEventListener("hidden.bs.collapse", () => {
  syncBoDisplayControlStates();
});

document.getElementById("boSaveSelect")?.addEventListener("change", () => {
  syncBoSaveSelectionUi();
});

document.getElementById("boSaveBtn")?.addEventListener("click", () => {
  saveBoNamedPreset();
});

document.getElementById("boLoadBtn")?.addEventListener("click", () => {
  loadBoSelectedPreset();
});

document.getElementById("boDeleteBtn")?.addEventListener("click", () => {
  deleteBoSelectedPreset();
});

document.getElementById("boResetTimelineBtn")?.addEventListener("click", () => {
  if (!boCommands.length && !boSelectedCommandId && !boLastResults) {
    applyBoDisplayDefaults();
    renderBoTimelineEditor();
    renderBoGatherRates();
    renderBoTimelineFooter();
    setBoSaveStatus("Timeline is already empty.");
    return;
  }
  const confirmed = window.confirm("Reset the current timeline? This clears all Build Order commands from the current draft but keeps your civ and settings.");
  if (!confirmed) return;
  resetBoTimeline();
});

document.getElementById("buildOrderRow")?.addEventListener("input", (e) => {
  if (!e.target?.id?.startsWith("bo")) return;
  if (e.target.closest("#boCommandEditor")) return;
  if (e.target.closest(".bo-save-menu-panel")) return;
  scheduleRunBuildOrder();
});
document.getElementById("buildOrderRow")?.addEventListener("change", (e) => {
  if (!e.target?.id?.startsWith("bo")) return;
  if (e.target.closest("#boCommandEditor")) return;
  if (e.target.closest(".bo-save-menu-panel")) return;
  scheduleRunBuildOrder();
});

function toggleBoPinnedTimeFromEvent(event) {
  if (boMarkerDraft) {
    discardBoMarkerDraft(false);
  }
  const targetTime = getBoTimelinePointerTime(event);
  if (!Number.isFinite(targetTime)) return;
  const threshold = getBoPinToggleThreshold();
  if (Number.isFinite(boPinnedTime) && Math.abs(boPinnedTime - targetTime) <= threshold) {
    boPinnedTime = null;
  } else {
    boPinnedTime = targetTime;
  }
  renderBoTimelineEditor();
  renderBoGatherRates();
  renderBoTimelineFooter();
}

document.getElementById("boLaneTimeline")?.addEventListener("click", (e) => {
  if (!updateBoCivGate(true)) return;
  const block = e.target.closest(".bo-lane-block");
  if (!block) {
    toggleBoPinnedTimeFromEvent(e);
    return;
  }
  if (block.dataset?.marker === "villager") {
    const marker = {
      time: parseFloat(block.dataset?.markerTime || "0"),
      target: block.dataset?.markerTarget || "idle",
      count: Math.max(1, parseInt(block.dataset?.markerCount || "1", 10) || 1),
      sourceCommandId: block.dataset?.markerSourceCommand || null,
      buildingId: block.dataset?.markerBuildingId || "TC #1",
      buildingType: block.dataset?.markerBuildingType || "Town Center",
      timePerUnit: parseFloat(block.dataset?.markerTimePerUnit || `${BO_VILLAGER_TIME}`),
      rallyTravelDelaySec: parseFloat(block.dataset?.markerRallyDelay || "0"),
      rallyTripOverrideSec: (() => {
        const raw = block.dataset?.markerRallyTrip;
        const parsed = parseFloat(raw ?? "");
        return Number.isFinite(parsed) ? parsed : null;
      })()
    };
    selectOrCreateBoVillagerMarkerCommand(marker);
    return;
  }
  const id = block.dataset?.commandId;
  if (id) {
    if (id === boSelectedCommandId) {
      boSelectedCommandId = null;
      discardBoMarkerDraft(false);
      renderBoTimelineEditor();
      renderBoCommandEditor(null);
      renderBoGatherRates();
      return;
    }
    selectBoCommand(id, { scrollToEditor: true });
  }
});

document.getElementById("boResourceLane")?.addEventListener("click", (e) => {
  if (!updateBoCivGate(true)) return;
  toggleBoPinnedTimeFromEvent(e);
});

document.getElementById("boLaneLabels")?.addEventListener("click", (e) => {
  if (!updateBoCivGate(true)) return;
  const label = e.target.closest(".bo-lane-label-row");
  if (!label) return;
  const laneKey = label.dataset?.laneKey || "";
  const buildingId = label.dataset?.buildingId;
  const buildingType = label.dataset?.buildingType;
  const buildingReady = parseFloat(label.dataset?.buildingReady || "0");
  const buildingSource = label.dataset?.buildingSource || null;
  const resource = label.dataset?.resource || null;
  if (laneKey === "tc") {
    if (boSelectedBuilding?.id === "TC #1") {
      boSelectedBuilding = null;
      discardBoMarkerDraft(false);
      setBoTargetBuilding(null);
      renderBoTimelineEditor();
      renderBoCommandEditor(getSelectedBoCommand());
      renderBoGatherRates();
      return;
    }
    selectBoBuilding({ id: "TC #1", type: "Town Center", sourceCommandId: BO_CAPITAL_TC_ANCHOR, readyAt: 0 }, { scrollToEditor: true });
    return;
  }
  if (resource) {
    selectOrCreateBoResourceTripCommand(resource);
    return;
  }
  if (buildingId && buildingType) {
    if (boSelectedBuilding?.id === buildingId) {
      boSelectedBuilding = null;
      discardBoMarkerDraft(false);
      setBoTargetBuilding(null);
      renderBoTimelineEditor();
      renderBoCommandEditor(getSelectedBoCommand());
      renderBoGatherRates();
      return;
    }
    selectBoBuilding({
      id: buildingId,
      type: buildingType,
      sourceCommandId: buildingSource || null,
      readyAt: Number.isFinite(buildingReady) ? buildingReady : undefined
    }, { scrollToEditor: true });
  }
});

document.getElementById("boLaneTimeline")?.addEventListener("mousemove", updateBoTimelineTooltip);
document.getElementById("boLaneTimeline")?.addEventListener("mouseleave", () => {
  const shell = document.getElementById("boTimelineShell");
  const tooltip = shell?.querySelector("#boTimelineTooltip");
  if (tooltip) tooltip.style.display = "none";
  boHoverTime = null;
  applyBoLaneCaptionSelection();
  renderBoGatherRates();
});
document.getElementById("boResourceLane")?.addEventListener("mousemove", updateBoTimelineTooltip);
document.getElementById("boResourceLane")?.addEventListener("mouseleave", () => {
  const shell = document.getElementById("boTimelineShell");
  const tooltip = shell?.querySelector("#boTimelineTooltip");
  if (tooltip) tooltip.style.display = "none";
  boHoverTime = null;
  applyBoLaneCaptionSelection();
  renderBoGatherRates();
});

export async function initBuildOrderApp() {
  initBuildOrderUI();
  const civSelect = document.getElementById("boCiv");
  if (civSelect && civSelect.options.length <= 1) {
    console.error("Build Order bootstrap failed: boCiv did not populate beyond the placeholder option.");
  }
  await Promise.all([loadBoResourceData(), loadBoCivBonusData()]);
  restoreBoSavedStateOnInit();
}

export { updateBoCivGate, initBuildOrderUI, loadBoResourceData, loadBoCivBonusData, runBuildOrder };
