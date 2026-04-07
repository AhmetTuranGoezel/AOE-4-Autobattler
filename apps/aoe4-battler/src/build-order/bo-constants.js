// ========================================
// Build-order static constants (no DOM dependencies)
// ========================================

export let BO_CIV_AUDIT = {};
export let BO_LANDMARK_AUTHORING = { notes: [], civModes: {} };


export const BO_SAVE_STORAGE_KEY = "aoe4Battler.buildOrder.local.v1";
export const BO_SAVE_DRAFT_ID = "__draft__";
export const BO_SAVE_STORAGE_VERSION = 3;
export const BO_AUDIT_CONFIRM_STORAGE_KEY = "aoe4Battler.buildOrder.auditConfirm.v1";

export const BO_FOOD_SOURCES = ["berries", "deer", "boar", "sheep", "farm"];
export const BO_FINITE_FOOD_SOURCES = ["berries", "deer", "boar", "sheep"];
export const BO_RESOURCE_KEYS = [...BO_FOOD_SOURCES, "wood", "gold", "stone"];
export const BO_RESOURCE_LABELS = {
  sheep: "Sheep",
  berries: "Berries",
  deer: "Deer",
  boar: "Boar",
  farm: "Farm",
  wood: "Wood",
  gold: "Gold",
  stone: "Stone"
};
export const BO_ASSIGN_CAP_ORDER = ["stone", "gold", "wood", "farm", "sheep", "boar", "deer", "berries"];
export const BO_VILLAGER_TIME = 20;
export const BO_TIMELINE_BLOCK_HEIGHT = 28;
export const BO_ASSIGN_BLOCK_HEIGHT = 36;
export const BO_TIMELINE_ROW_GAP = 6;
export const BO_TIMELINE_HEADER_HEIGHT = 24;
export const BO_LANE_CAPTION_HEIGHT = 16;
export const BO_RESOURCE_MARKER_HEIGHT = 18;
export const BO_RESOURCE_MARKER_GAP = 6;
export const BO_TIMELINE_PADDING = 12;
export const BO_RESOURCE_LANE_HEIGHT = 150;
export const BO_TC_MARKER_DURATION = 6;
export let BO_BASE_RATES = {
  berries: 0.69,
  deer: 0.825,
  boar: 0.9,
  sheep: 0.75,
  farm: 0.75,
  wood: 0.75,
  gold: 0.75,
  stone: 0.75
};

export let BO_CIV_RATE_OVERRIDES = {
  "House of Lancaster": { sheep: 0.9 },
  "Knights Templar": { wood: 0.6 }
};

export let BO_NODE_AMOUNTS = { sheep: 200, berries: 250, deer: 350, boar: 2400 };
export let BO_STARTING = {
  resources: { food: 200, wood: 150, gold: 100, stone: 0 },
  sheep: 5
};
export const BO_STARTING_VILLAGERS = 6;
export const BO_DEFAULT_NODE_COUNTS = { sheep: 5, berries: 7, deer: 7, boar: 1 };
export const BO_DEFAULT_CARRY = { sheep: 10, berries: 10, deer: 25, boar: 25, farm: 10, wood: 10, gold: 10, stone: 10 };
export const BO_DEFAULT_TRIP = { sheep: 0.1, berries: 1.1, deer: 1.7, boar: 1.7, farm: 1.1, wood: 1.7, gold: 1.1, stone: 1.1 };
export const BO_WHEEL_CARRY_BONUS = 5;
export const BO_WHEEL_TRIP_MULT = 1 / 1.15;
export const BO_DROPOFF_ANIMATION_SEC = 0.5;
export const BO_FOOD_UPGRADE_MULT = 1.1;
export const BO_SPECIAL_RES_KEYS = ["oliveOil", "silver"];
export const BO_VALUE_RESOURCE_KEYS = ["food", "wood", "gold", "stone", ...BO_SPECIAL_RES_KEYS];
export const BO_CAPITAL_TC_ANCHOR = "__bo_tc1__";
export const BO_OTTOMAN_IMPERIAL_COUNCIL_BUILDING = "Imperial Council";
export const BO_HOUSE_OF_WISDOM_BUILDING = "House of Wisdom";
export const BO_GOLDEN_TENT_BUILDING = "Golden Tent";
export const BO_TIMELINE_BUILDING_SET = new Set([
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
  "Golden Tent",
  "Landmark (Age II)",
  "Landmark (Age III)",
  "Landmark (Age IV)",
  "Twin Minaret Medrese",
  "Sea Gate Castle",
  "Mehmed Imperial Armory",
  "Istanbul Imperial Palace",
  "Istanbul Observatory",
  "Council Hall",
  "Abbey of Kings",
  "King's Palace",
  "White Tower",
  "Berkshire Palace",
  "Wynguard Palace",
  "School of Cavalry",
  "Chamber of Commerce",
  "Royal Institute",
  "Guild Hall",
  "College of Artillery",
  "Red Palace",
  "Aachen Chapel",
  "Meinwerk Palace",
  "Burgrave Palace",
  "Regnitz Cathedral",
  "Elzbach Palace",
  "Palace of Swabia",
  "Tower of Victory",
  "Dome of the Faith",
  "Compound of the Defender",
  "House of Learning",
  "Hisar Academy",
  "Palace of the Sultan",
  "Hunting Cabin",
  "Wooden Fortress",
  "Golden Gate",
  "Kremlin",
  "Abbey of the Trinity",
  "High Trade House",
  "High Armory",
  "Spasskaya Tower",
  "Deer Stones",
  "Silver Tree",
  "Steppe Redoubt",
  "Kurultai",
  "White Stupa",
  "Khaganate Palace",
  "Farmhouse",
  "Forge",
  "Pit Mine",
  "Cattle Ranch",
  "Toll Outpost",
  "Fortified Outpost",
  "Stockyard",
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
export const BO_TRAINING_BUILDING_SET = new Set([
  "Town Center",
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop",
  "Military School",
  "Golden Tent",
  "Hunting Cabin",
  "Buddhist Temple",
  "Shinto Shrine",
  "Koka Township",
  "Tanegashima Gunsmith"
]);
export const BO_PRODUCTION_BUILDINGS = new Set([
  "Town Center",
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop",
  "Military School",
  "Golden Tent",
  "Hunting Cabin",
  "Buddhist Temple",
  "Shinto Shrine",
  "Koka Township",
  "Tanegashima Gunsmith"
]);
export const BO_TECH_BUILDINGS = new Set([
  "Mill",
  "Blacksmith",
  "Mosque",
  "Monastery",
  "Prayer Tent",
  "Golden Tent",
  "Fortified Outpost"
]);
export const BO_BASE_TECH_BUILDINGS = ["Mill", "Blacksmith", "Mosque", "Monastery", "Prayer Tent", "Golden Tent", "Fortified Outpost"];
export const BO_TECHS_REQUIRING_UNMODELED_EXACT_SITE = new Set([
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
export let BO_BUILD_TIME_MULT_BY_VILLAGERS = { 1: 1 };
export let BO_BUILDING_DEFAULTS = {};
export let BO_TECH_DEFAULTS = {};
export let BO_CIV_BONUSES = {};
export let BO_MUSLIM_CIVS = new Set([
  "Abbasid Dynasty",
  "Ayyubids",
  "Delhi Sultanate",
  "Tughlaq Dynasty",
  "Ottomans"
]);
export let BO_MUSLIM_BERRY_BONUS = { capacityBonusPerNode: 100, gatherBonusPct: 25, carryBonus: 3 };
export let BO_SACRED_SITE_GOLD_PER_MIN = 100;
export let BO_PASTURE_SHEEP_SECONDS = 116;
export let BO_OVOO_STONE_PER_MIN_BY_AGE = { 1: 70, 2: 100, 3: 130, 4: 160 };
export let BO_SCHOLAR = { costGold: 135, costGoldDome: 80, time: 30 };
export const BO_CIV_STARTING_RESOURCES = {
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
export let BO_BOAR_RESTRICTED_CIVS = BO_MUSLIM_CIVS;
export const BO_ENGLISH_FARM_BONUS_CIVS = new Set(["English", "House of Lancaster"]);
export const BO_ENGLISH_FARM_BONUS_BY_AGE = { 1: 20, 2: 25, 3: 30, 4: 30 };
export const BO_ENGLISH_FARM_GOLD_PER_SEC = 1 / 6;
export const BO_ENGLISH_FARM_COST_MULT = 0.5;
export const BO_AGE_UP_TIME_DEFAULTS = { 2: 190, 3: 220 };
export const BO_OTTOMAN_MILITARY_SCHOOL_BUILDING = "Military School";
export const BO_HOUSE_OF_WISDOM_CIVS = new Set(["Abbasid Dynasty", "Ayyubids"]);
export const BO_SUPPORTED_CIVS = new Set([
  "Abbasid Dynasty",
  "Ayyubids",
  "Delhi Sultanate",
  "English",
  "French",
  "Golden Horde",
  "Holy Roman Empire",
  "Order of the Dragon",
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
export const BO_UNIT_ALIASES = {
  "Crossbowman": "Crossbow",
  "Man-at-Arms": "MAA",
  "Lancer": "Knight/Lancer"
};
export const BO_COMPARE_COLUMNS = [
  { key: "civ", label: "Civ", sortType: "string" },
  { key: "saveName", label: "Build", sortType: "string" },
  { key: "simEnd", label: "Compare End", sortType: "number" },
  { key: "generatedTotalValue", label: "Generated", sortType: "number", better: "high" },
  { key: "freeUnitValueTotal", label: "Free Units", sortType: "number", better: "high" },
  { key: "combinedTotalValue", label: "Total Value", sortType: "number", better: "high" },
  { key: "bankFood", label: "Bank F", sortType: "number", better: "high" },
  { key: "bankWood", label: "Bank W", sortType: "number", better: "high" },
  { key: "bankGold", label: "Bank G", sortType: "number", better: "high" },
  { key: "bankStone", label: "Bank S", sortType: "number", better: "high" },
  { key: "incomeFood", label: "Income F", sortType: "number", better: "high" },
  { key: "incomeWood", label: "Income W", sortType: "number", better: "high" },
  { key: "incomeGold", label: "Income G", sortType: "number", better: "high" },
  { key: "incomeStone", label: "Income S", sortType: "number", better: "high" },
  { key: "villagers", label: "Villagers", sortType: "number", better: "high" },
  { key: "totalUnits", label: "Units", sortType: "number", better: "high" },
  { key: "age2", label: "Age II", sortType: "time", better: "low" },
  { key: "age3", label: "Age III", sortType: "time", better: "low" },
  { key: "age4", label: "Age IV", sortType: "time", better: "low" }
];
export const BO_EXTRA_UNIT_SPECS = {
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
  },
  "Batu Khan": {
    civs: ["Golden Horde"],
    cost: { food: 0, wood: 0, gold: 0, stone: 140 },
    time: 22.5,
    ages: [2, 3, 4],
    buildings: [BO_GOLDEN_TENT_BUILDING],
    population: 1
  },
  "Rus Tribute": {
    civs: ["Golden Horde"],
    cost: { food: 0, wood: 0, gold: 0, stone: 350 },
    time: 30,
    ages: [3, 4],
    buildings: [BO_GOLDEN_TENT_BUILDING],
    population: 4
  },
  "Traction Trebuchet": {
    civs: ["Golden Horde"],
    cost: { food: 0, wood: 0, gold: 0, stone: 200 },
    time: 15,
    ages: [4],
    buildings: [BO_GOLDEN_TENT_BUILDING],
    population: 1
  }
};
export const BO_OTTOMAN_VIZIER_THRESHOLDS = [60, 160, 310, 550, 870, 1190, 1510, 1830];
export const BO_OTTOMAN_VIZIER_AGE_XP = { 2: 15, 3: 45, 4: 100 };
export const BO_OTTOMAN_VIZIER_UNIT_XP = {
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
export const BO_OTTOMAN_DEFENSIVE_BUILDINGS = new Set(["Town Center", "Outpost", "Keep"]);
export const BO_ABBASID_HOW_WINGS = {
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
export const BO_ABBASID_HOW_CHOICE_DEFS = {
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
export const BO_AYYUBID_HOW_BRANCHES = {
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
export const BO_HOUSE_OF_WISDOM_GOLDEN_AGE_LABELS = {
  gatherPct: "Gather",
  researchPct: "Research",
  productionPct: "Production",
  siegeCostMult: "Siege cost",
  camelAttackSpeedPct: "Camel attack"
};
export const BO_OTTOMAN_VIZIER_CHOICES = {
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
export const BO_OTTOMAN_VIZIER_LEVELS = [1, 2, 3, 4].map((level) => ({
  level,
  choices: Object.values(BO_OTTOMAN_VIZIER_CHOICES).filter((choice) => choice.level === level).map((choice) => choice.id)
}));
export const BO_GOLDEN_HORDE_HEAVY_UNITS = new Set([
  "Batu Khan",
  "Torguud",
  "Keshik",
  "Knight/Lancer",
  "Lancer",
  "Man-at-Arms",
  "MAA",
  "Kharash"
]);
export const BO_GOLDEN_HORDE_STONE_ARMIES_UNITS = {
  "Kharash": { stone: 10, time: 10, count: 2 },
  "Kipchak Archer": { stone: 80, time: 24, count: 2 },
  "Keshik": { stone: 130, time: 30, count: 2 },
  "Traction Trebuchet": { stone: 200, time: 15, count: 1 }
};
export const BO_GOLDEN_HORDE_TENT_CHOICES = {
  khanAndTorguuds: {
    id: "khanAndTorguuds",
    label: "Khan and Torguuds",
    targetAge: 2,
    description: "+30 HP and -20% stone cost for Batu Khan and Torguud."
  },
  buildingCarts: {
    id: "buildingCarts",
    label: "Building Carts",
    targetAge: 2,
    description: "Gain free building-cart build credits."
  },
  muscovyYasak: {
    id: "muscovyYasak",
    label: "Muscovy Yasak",
    targetAge: 3,
    description: "Golden Tent generates wood income, reduced by active heavy units."
  },
  relicOvoos: {
    id: "relicOvoos",
    label: "Relic Ovoos",
    targetAge: 3,
    description: "Ovoos generate +20% more stone; relic-built extra Ovoos tracked only."
  },
  stoneArmies: {
    id: "stoneArmies",
    label: "Stone Armies",
    targetAge: 4,
    description: "Unlock stone-trained unique units at the Golden Tent and upgrade Rus Tribute."
  },
  yamNetworkTrade: {
    id: "yamNetworkTrade",
    label: "Yam Network Trade",
    targetAge: 4,
    description: "Golden Tent generates gold from Fortified Outposts."
  }
};
export const BO_GOLDEN_HORDE_EDICTS = {
  productionSpeed: {
    id: "productionSpeed",
    label: "Production Speed Edict",
    description: "+20% production speed for Golden Tent and military buildings."
  },
  defensiveAura: {
    id: "defensiveAura",
    label: "Defensive Aura Edict",
    description: "Tracked only.",
    modeled: false
  },
  kharash: {
    id: "kharash",
    label: "Kharash Edict",
    description: "Eligible influenced unit completions spawn 1 free Kharash.",
    requiresTech: "Unlock Kharash Edict"
  },
  stockyard: {
    id: "stockyard",
    label: "Stockyard Edict",
    description: "Worked Stockyards generate gold per worker.",
    requiresTech: "Unlock Stockyard Edict"
  }
};

// Simple accessors for mutable data
export function getBoBuildingDefaults(name) {
  return BO_BUILDING_DEFAULTS?.[name] || null;
}

export function getBoTechDefaults(name) {
  return BO_TECH_DEFAULTS?.[name] || null;
}

// Setter functions for mutable variables (called by async loaders)
export function setBoBaseRates(val) { BO_BASE_RATES = val; }
export function setBoBaseRatesMerge(data) { BO_BASE_RATES = { ...BO_BASE_RATES, ...data }; }
export function setBoCivRateOverrides(val) { BO_CIV_RATE_OVERRIDES = val; }
export function setBoCivRateOverridesMerge(data) { BO_CIV_RATE_OVERRIDES = { ...BO_CIV_RATE_OVERRIDES, ...data }; }
export function setBoNodeAmounts(val) { BO_NODE_AMOUNTS = val; }
export function setBoStarting(val) { BO_STARTING = val; }
export function setBoBuildingDefaults(val) { BO_BUILDING_DEFAULTS = val; }
export function setBoTechDefaults(val) { BO_TECH_DEFAULTS = val; }
export function setBoCivBonuses(val) { BO_CIV_BONUSES = val; }
export function setBoMuslimCivs(val) { BO_MUSLIM_CIVS = val; }
export function setBoMuslimBerryBonus(val) { BO_MUSLIM_BERRY_BONUS = val; }
export function setBoSacredSiteGoldPerMin(val) { BO_SACRED_SITE_GOLD_PER_MIN = val; }
export function setBoPastureSheepSeconds(val) { BO_PASTURE_SHEEP_SECONDS = val; }
export function setBoOvooStonePerMinByAge(val) { BO_OVOO_STONE_PER_MIN_BY_AGE = val; }
export function setBoScholar(val) { BO_SCHOLAR = val; }
export function setBoBuildTimeMultByVillagers(val) { BO_BUILD_TIME_MULT_BY_VILLAGERS = val; }
export function setBoBoarRestrictedCivs(val) { BO_BOAR_RESTRICTED_CIVS = val; }
export function setBoCivAudit(val) { BO_CIV_AUDIT = val; }
export function setBoLandmarkAuthoring(val) { BO_LANDMARK_AUTHORING = val; }
