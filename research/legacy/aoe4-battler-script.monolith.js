// ========================================
// AOE4 BATTLE SIMULATOR - COMPLETE SCRIPT WITH ALL FIXES
// ========================================

// Global variables
let units = {}; // All unit data from JSON
let unitIndex = null; // Lightweight metadata for dropdowns and BO defaults
let allAvailableTags = new Set(); // All unique tags found across all units
let currentPage = "unitBattler";

// Multi battle state
let multiRosters = { A: [], B: [] };
let multiEditing = { A: null, B: null };
let multiEditorOpen = { A: false, B: false };
let multiIdCounters = { A: 1, B: 1 };

// Build order state
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

// ========================================
// BUILDING DATA (Outpost, Keep, Town Center)
// ========================================
const BUILDINGS = {
  // --- Town Centers ---
  "Capital Town Center": {
    hp: 7000, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 15, range: 8,
    baseArrows: 1, baseArrowDmg: 8, baseArrowRate: 1.88,
    garrisonArrowDmg: 6, garrisonArrowRate: 3.88,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: [], civs: []
  },
  "Town Center": {
    hp: 2400, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 8, range: 6,
    baseArrows: 0, baseArrowDmg: 0, baseArrowRate: 0,
    garrisonArrowDmg: 6, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: [], civs: []
  },
  // --- Outposts ---
  "Outpost": {
    hp: 750, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 5, range: 6,
    baseArrows: 0, baseArrowDmg: 0, baseArrowRate: 0,
    garrisonArrowDmg: 6, garrisonArrowRate: 3.88,
    techs: ["courtArchitects", "arrowUpgrades", "fortifyOutpost"],
    emplacements: ["Arrowslits", "Handcannon Slits", "Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement"],
    civs: []
  },
  "Toll Outpost": {
    hp: 750, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 5, range: 6,
    baseArrows: 0, baseArrowDmg: 0, baseArrowRate: 0,
    garrisonArrowDmg: 6, garrisonArrowRate: 3.88,
    techs: ["courtArchitects", "arrowUpgrades", "fortifyOutpost"],
    emplacements: ["Arrowslits", "Handcannon Slits", "Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement"],
    civs: ["Holy Roman Empire", "Order of the Dragon"]
  },
  "Wooden Fortress": {
    hp: 1750, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 8, range: 6,
    baseArrows: 0, baseArrowDmg: 0, baseArrowRate: 0,
    garrisonArrowDmg: 6, garrisonArrowRate: 1.88,
    techs: ["courtArchitects", "arrowUpgrades", "castleTurret"],
    emplacements: ["Arrowslits", "Handcannon Slits", "Springald Emplacement", "Mangonel Emplacement"],
    civs: ["Rus", "Golden Horde"]
  },
  "Fortified Outpost": {
    hp: 1700, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 5, range: 6,
    baseArrows: 0, baseArrowDmg: 0, baseArrowRate: 0,
    garrisonArrowDmg: 6, garrisonArrowRate: 3.88,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Arrowslits", "Handcannon Slits", "Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement"],
    civs: ["Delhi Sultanate"]
  },
  // --- Keeps ---
  "Keep": {
    hp: 5000, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 15, range: 8,
    baseArrows: 3, baseArrowDmg: 12, baseArrowRate: 0.5,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: []
  },
  "Castle": {
    hp: 5500, rangedArmor: 50, fireArmor: 5,
    garrisonMax: 15, range: 9,
    baseArrows: 1, baseArrowDmg: 80, baseArrowRate: 4.125,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["Japanese", "Sengoku Daimyo"]
  },
  "Fortress": {
    hp: 5000, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 15, range: 8,
    baseArrows: 3, baseArrowDmg: 12, baseArrowRate: 0.5,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Trebuchet Emplacement"],
    civs: ["Knights Templar"]
  },
  "Tughlaqabad Fort": {
    hp: 2000, rangedArmor: 50, fireArmor: 0,
    garrisonMax: 10, range: 6,
    baseArrows: 2, baseArrowDmg: 10, baseArrowRate: 0.5,
    garrisonArrowDmg: 6, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement"],
    civs: ["Tughlaq Dynasty"]
  },
  // --- Landmarks ---
  "The White Tower": {
    hp: 5000, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 20, range: 8,
    baseArrows: 3, baseArrowDmg: 12, baseArrowRate: 0.5,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["English", "House of Lancaster"]
  },
  "Berkshire Palace": {
    hp: 6500, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 20, range: 14.5,
    baseArrows: 3, baseArrowDmg: 14, baseArrowRate: 0.5,
    garrisonArrowDmg: 12, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["English", "House of Lancaster"]
  },
  "Red Palace": {
    hp: 5000, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 15, range: 10,
    baseArrows: 2, baseArrowDmg: 60, baseArrowRate: 1.5,
    garrisonArrowDmg: 60, garrisonArrowRate: 1.5,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["French", "Jeanne d'Arc"]
  },
  "Elzbach Palace": {
    hp: 7500, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 20, range: 8,
    baseArrows: 3, baseArrowDmg: 12, baseArrowRate: 0.5,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["Holy Roman Empire", "Order of the Dragon"]
  },
  "Fort of the Huntress": {
    hp: 5000, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 15, range: 8,
    baseArrows: 3, baseArrowDmg: 15, baseArrowRate: 0.5,
    garrisonArrowDmg: 13, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["Rus", "Golden Horde"]
  },
  "Sea Gate Castle": {
    hp: 5000, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 15, range: 8,
    baseArrows: 3, baseArrowDmg: 12, baseArrowRate: 0.5,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["Japanese"]
  },
  "Castle of the Crow": {
    hp: 5500, rangedArmor: 50, fireArmor: 6,
    garrisonMax: 15, range: 9,
    baseArrows: 1, baseArrowDmg: 80, baseArrowRate: 4.125,
    garrisonArrowDmg: 10, garrisonArrowRate: 2.62,
    techs: ["courtArchitects", "arrowUpgrades"],
    emplacements: ["Springald Emplacement", "Mangonel Emplacement", "Cannon Emplacement", "Great Bombard Emplacement", "Arbalest Emplacement"],
    civs: ["Japanese", "Sengoku Daimyo"]
  }
};

// ========================================
// EMPLACEMENT DATA
// ========================================
const EMPLACEMENTS = {
  "Arrowslits":                { dmg: 10,  projectiles: 1, rate: 1.12,  range: 7,   type: "ranged", civs: [] },
  "Handcannon Slits":          { dmg: 25,  projectiles: 1, rate: 3.12,  range: 7,   type: "ranged", civs: ["Chinese", "Zhu Xi's Legacy"] },
  "Springald Emplacement":     { dmg: 40,  projectiles: 1, rate: 3.88,  range: 9,   type: "ranged", civs: [] },
  "Mangonel Emplacement":      { dmg: 7,   projectiles: 3, rate: 4.12,  range: 8,   type: "siege",  civs: ["Byzantines", "Macedonian Dynasty"] },
  "Cannon Emplacement":        { dmg: 70,  projectiles: 1, rate: 5.88,  range: 9.5, type: "ranged", civs: [] },
  "Great Bombard Emplacement": { dmg: 100, projectiles: 1, rate: 7.12,  range: 10,  type: "ranged", civs: ["Ottomans"] },
  "Arbalest Emplacement":      { dmg: 40,  projectiles: 1, rate: 1.50,  range: 9.5, type: "ranged", civs: ["French", "Jeanne d'Arc"] },
  "Trebuchet Emplacement":     { dmg: 25,  projectiles: 2, rate: 12.12, range: 18,  type: "siege",  civs: ["Knights Templar"] }
};

const TORCH_BY_AGE = { 2: 13, 3: 17, 4: 21 };
const TORCH_ATTACK_SPEED = 2.15;

/**
 * 1. DATA LOADING
 * Fetches the JSON file and extracts all unique tags from all units.
 */
async function loadUnitData() {
  try {
    const [indexResponse, unitsResponse] = await Promise.all([
      fetch("units_index.json"),
      fetch("units_restructured.json")
    ]);
    unitIndex = await indexResponse.json();
    units = await unitsResponse.json();
  } catch (error) {
    console.warn("Falling back to full unit data only.", error);
    const response = await fetch("units_restructured.json");
    units = await response.json();
    unitIndex = null;
  }

  allAvailableTags = new Set(unitIndex?.allTags || []);
  if (!allAvailableTags.size) {
    Object.values(units).forEach((unit) => {
      if (unit.tags) {
        unit.tags.forEach((tag) => allAvailableTags.add(tag));
      }
    });
  }

  populateCivDropdowns();
  populateSelects();
  updateUnitStats("A");
  updateUnitStats("B");
}

/**
 * 2. UI POPULATION - Dropdowns (grouped by civilization)
 */

// Civilization display order
const CIV_ORDER = [
  "Common",
  "English",
  "French",
  "Holy Roman Empire",
  "Mongols",
  "Rus",
  "Delhi Sultanate",
  "Abbasid Dynasty",
  "Chinese",
  "Ottomans",
  "Malians",
  "Byzantines",
  "Japanese",
  "Ayyubids",
  "Jeanne d'Arc",
  "Order of the Dragon",
  "Zhu Xi's Legacy",
  "House of Lancaster",
  "Knights Templar",
  "Golden Horde",
  "Macedonian Dynasty",
  "Sengoku Daimyo",
  "Tughlaq Dynasty",
];

// Civ name -> flag filename mapping
const CIV_FLAGS = {
  "English": "assets/flags/English_AoE4.webp",
  "French": "assets/flags/French_AoE4.webp",
  "Holy Roman Empire": "assets/flags/HRE_AoE4.webp",
  "Mongols": "assets/flags/Mongols_AoE4.webp",
  "Rus": "assets/flags/Rus_AoE4.webp",
  "Delhi Sultanate": "assets/flags/Delhi_Sultanate_AoE4.webp",
  "Abbasid Dynasty": "assets/flags/Abbasid_Dynasty_AoE4.webp",
  "Chinese": "assets/flags/Chinese_AoE4.webp",
  "Ottomans": "assets/flags/Ottomans_AoE4.webp",
  "Malians": "assets/flags/Malians_AoE4.webp",
  "Byzantines": "assets/flags/Byzantines_AoE4.webp",
  "Japanese": "assets/flags/Japanese_AoE4.webp",
  "Ayyubids": "assets/flags/Ayyubids_AoE4.webp",
  "Jeanne d'Arc": "assets/flags/Jeanne_d_Arc_AoE4.webp",
  "Order of the Dragon": "assets/flags/Order_of_the_Dragon_AoE4.webp",
  "Zhu Xi's Legacy": "assets/flags/Zhu_Xis_Legacy_AoE4.webp",
  "House of Lancaster": "assets/flags/House_of_Lancaster_AoE4.webp",
  "Knights Templar": "assets/flags/Knights_Templar_AoE4.webp",
  "Golden Horde": "assets/flags/Golden_Horde_AoE4.webp",
  "Macedonian Dynasty": "assets/flags/Macedonian_Dynasty_AoE4.webp",
  "Sengoku Daimyo": "assets/flags/Sengoku_Daimyo_AoE4.webp",
  "Tughlaq Dynasty": "assets/flags/Tughlaq_Dynasty_AoE4.webp",
};

// ========================================
// GLOBAL TECH / UPGRADE RULES
// ========================================
// This lets us define generic technologies (like Military Academy
// and Increased Supplies) once, instead of copying them onto every
// single unit in the JSON. Units only need their unique stuff; the
// generic techs are attached at runtime based on tags/civs.

const GLOBAL_UPGRADE_TECHS = [
  // --- Military Academy / Increased Supplies (creation speed) ---
  {
    id: "militaryAcademy",
    name: "Military Academy",
    description: "+33% production speed for infantry, cavalry, siege and transport units at buildings (equivalent to -25% training time).",
    category: "creationSpeed",
    // Available to all civilizations except Ottomans (blacksmith/uni influence)
    // and Golden Horde (Increased Supplies instead).
    exceptCivs: ["Ottomans", "Golden Horde"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const relevantTags = ["Infantry", "Cavalry", "Siege", "Transport"];
      return tags.some(t => relevantTags.includes(t));
    }
  },
  {
    id: "increasedSupplies",
    name: "Increased Supplies",
    description: "+50% production speed for infantry, cavalry, siege and transport units.",
    category: "creationSpeed",
    civs: ["Golden Horde"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const relevantTags = ["Infantry", "Cavalry", "Siege", "Transport"];
      return tags.some(t => relevantTags.includes(t));
    }
  },
  {
    id: "eliteArmyTacticsHp",
    name: "Elite Army Tactics",
    description: "+15% hit points for infantry.",
    category: "hitpoints",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry");
    }
  },
  {
    id: "eliteArmyTacticsAttack",
    name: "Elite Army Tactics",
    description: "+15% attack for infantry.",
    category: "attack",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry");
    }
  },
  {
    id: "improvedEliteArmyTacticsHp",
    name: "Improved Elite Army Tactics",
    description: "+5% more hit points (stacks for +20% total), Mongols.",
    category: "hitpoints",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry");
    }
  },
  {
    id: "improvedEliteArmyTacticsAttack",
    name: "Improved Elite Army Tactics",
    description: "+5% more attack (stacks for +20% total), Mongols.",
    category: "attack",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry");
    }
  },
  {
    id: "additionalTorches",
    name: "Additional Torches",
    description: "+3 torch damage vs buildings.",
    category: "attack",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const mustHave = ["Infantry", "Cavalry"];
      return tags.some(t => mustHave.includes(t));
    }
  },
  {
    id: "additionalTorchesImproved",
    name: "Additional Torches Improved",
    description: "+2 more torch damage (stacks for +5 total), Mongols.",
    category: "attack",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const mustHave = ["Infantry", "Cavalry"];
      return tags.some(t => mustHave.includes(t));
    }
  }
];

// Names of techs that are driven by GLOBAL_UPGRADE_TECHS instead of per-unit copies
const GLOBAL_UPGRADE_TECH_NAMES = new Set([
  ...GLOBAL_UPGRADE_TECHS.map(t => t.name),
  "Additional Torches Improved",
  "Additional Torches Improved:"  // typo variant in JSON
]);

function computeGlobalUpgradesForUnit(unit) {
  const results = [];
  for (const tech of GLOBAL_UPGRADE_TECHS) {
    if (typeof tech.appliesToUnit === "function" && !tech.appliesToUnit(unit)) continue;
    const entry = {
      name: tech.name,
      description: tech.description,
      category: tech.category
    };
    if (tech.civs) entry.civs = [...tech.civs];
    if (tech.exceptCivs) entry.exceptCivs = [...tech.exceptCivs];
    results.push(entry);
  }
  return results;
}

function getMergedUpgradesForUnit(unit) {
  // Drop per-unit copies of globally defined techs (by name)
  const base = (unit.upgrades || []).filter(e => !GLOBAL_UPGRADE_TECH_NAMES.has(e.name));
  const derived = computeGlobalUpgradesForUnit(unit);
  return [...base, ...derived];
}

// Most exclusions handled by exceptCivs in JSON data.
// Only needed when a civ has BOTH the common unit AND its replacement.
const UNIT_REPLACEMENTS = {
  "Chinese": { "Crossbow": "Zhuge Nu" },
};

// Selected civ for each side (empty = all civs)
let selectedCivA = "";
let selectedCivB = "";

// Get list of unit names available for a given civ
function getUnitsForCiv(civName) {
  if (unitIndex?.unitsByCiv?.[civName || "All"]) {
    return [...unitIndex.unitsByCiv[civName || "All"]];
  }
  if (!civName) return Object.keys(units);
  const replacements = UNIT_REPLACEMENTS[civName] || {};
  const replacedCommons = new Set(Object.keys(replacements));
  return Object.keys(units).filter(name => {
    const unit = units[name];
    const civs = unit.civs || ["Common"];
    const exceptCivs = unit.exceptCivs || [];
    // Check if unit belongs to this civ
    const belongsToCiv = civs.includes(civName) || civs.includes("Common");
    if (!belongsToCiv) return false;
    // Check if excluded for this civ
    if (exceptCivs.includes(civName)) return false;
    // Check if this common unit is replaced by a civ-specific one
    if (civs.includes("Common") && replacedCommons.has(name)) return false;
    return true;
  });
}

// Unit type categories for "sort by type" mode
const TYPE_ORDER = [
  "Light Infantry",
  "Heavy Infantry",
  "Ranged Infantry",
  "Light Cavalry",
  "Heavy Cavalry",
  "Ranged Cavalry",
  "Elephants",
  "Siege",
];

function getCivOrder() {
  return unitIndex?.civOrder || CIV_ORDER;
}

function getTypeOrder() {
  return unitIndex?.typeOrder || TYPE_ORDER;
}

function getUnitMeta(unitName) {
  return unitIndex?.units?.[unitName] || units?.[unitName] || null;
}

function getUnitCategory(unit) {
  if (unit?.category) return unit.category;
  const tags = unit.tags || [];
  const hasInfantry = tags.includes("Infantry");
  const hasCavalry = tags.includes("Cavalry");
  const hasHeavy = tags.includes("Heavy");
  const hasRanged = tags.includes("Ranged");
  const hasElephant = tags.includes("Elephant");
  const hasLight = tags.includes("Light Infantry");
  const hasSiege = tags.includes("Siege");

  if (hasSiege) return "Siege";
  if (hasElephant) return "Elephants";
  if (hasCavalry && hasRanged) return "Ranged Cavalry";
  if (hasCavalry && hasHeavy) return "Heavy Cavalry";
  if (hasCavalry) return "Light Cavalry";
  if (hasInfantry && hasHeavy && hasRanged) return "Ranged Infantry";
  if (hasInfantry && hasRanged) return "Ranged Infantry";
  if (hasInfantry && hasHeavy) return "Heavy Infantry";
  if (hasInfantry && hasLight) return "Light Infantry";
  if (hasInfantry) return "Light Infantry";
  return "Light Infantry";
}


// Helper: get flag HTML for a unit name (for dropdown & header)
function getUnitFlagHtml(unitName, imgHeight, preferredCiv) {
  const unit = getUnitMeta(unitName);
  if (!unit) return "";
  let civs = (unit.civs || ["Common"]).filter(c => c !== "Common" && CIV_FLAGS[c]);
  // If a preferred civ is specified and it's in the list, put it first
  if (preferredCiv && civs.includes(preferredCiv)) {
    civs = [preferredCiv, ...civs.filter(c => c !== preferredCiv)];
  }
  return civs.map(c => `<img src="${CIV_FLAGS[c]}" alt="${c}" style="height:${imgHeight}px; border-radius:2px;">`).join("");
}

// Build grouped unit list based on current sort mode, optionally filtered by civ
function buildGroupedUnits(filter, civFilter) {
  const groups = [];
  const filterLower = (filter || "").toLowerCase();
  const availableUnits = civFilter ? new Set(getUnitsForCiv(civFilter)) : null;

  if (!civFilter) {
    // Group by civ (only when no civ filter is active)
    const civGroups = {};
    Object.keys(unitIndex?.units || units).forEach((name) => {
      if (filterLower && !name.toLowerCase().includes(filterLower)) return;
      const civs = getUnitMeta(name)?.civs || ["Common"];
      civs.forEach((civ) => {
        if (!civGroups[civ]) civGroups[civ] = [];
        civGroups[civ].push(name);
      });
    });
    Object.values(civGroups).forEach((arr) => arr.sort());
    getCivOrder().forEach((civ) => {
      if (!civGroups[civ] || civGroups[civ].length === 0) return;
      groups.push({ label: civ, units: civGroups[civ] });
    });
  } else {
    // Sort by type (or when a civ is selected, always sort by type)
    const typeGroups = {};
    Object.keys(unitIndex?.units || units).forEach((name) => {
      if (filterLower && !name.toLowerCase().includes(filterLower)) return;
      if (availableUnits && !availableUnits.has(name)) return;
      const cat = getUnitCategory(getUnitMeta(name));
      if (!typeGroups[cat]) typeGroups[cat] = [];
      typeGroups[cat].push(name);
    });
    Object.values(typeGroups).forEach((arr) => arr.sort());
    getTypeOrder().forEach((type) => {
      if (!typeGroups[type] || typeGroups[type].length === 0) return;
      groups.push({ label: type, units: typeGroups[type] });
    });
  }
  return groups;
}

// Render the dropdown panel contents for a custom select
function renderDropdownOptions(wrapper, filter) {
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const currentVal = wrapper.dataset.value;
  const side = wrapper.id === "unitASelect" ? "A" : "B";
  const civFilter = side === "A" ? selectedCivA : selectedCivB;
  const groups = buildGroupedUnits(filter, civFilter);

  // Keep search input, rebuild options
  const searchInput = dropdown.querySelector(".custom-select-search");
  let html = "";
  groups.forEach((g) => {
    html += `<div class="custom-select-optgroup">${g.label}</div>`;
    g.units.forEach((name) => {
      const sel = name === currentVal ? " selected" : "";
      const flags = getUnitFlagHtml(name, 16, civFilter || g.label);
      html += `<div class="custom-select-option${sel}" data-value="${name}" data-civ-group="${civFilter || g.label}"><span>${name}</span><span class="cs-opt-flags">${flags}</span></div>`;
    });
  });

  // Remove old options (keep search)
  dropdown.querySelectorAll(".custom-select-optgroup, .custom-select-option").forEach(el => el.remove());
  searchInput.insertAdjacentHTML("afterend", html);

  // Attach click handlers
  dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const val = opt.dataset.value;
      wrapper.dataset.value = val;
      wrapper.dataset.civGroup = opt.dataset.civGroup || "";
      updateSelectHeader(wrapper);
      closeDropdown(wrapper);
      // Fire change event
      const side = wrapper.id === "unitASelect" ? "A" : "B";
      updateUnitStats(side);
    });
  });
}

function updateSelectHeader(wrapper) {
  const val = wrapper.dataset.value;
  const civGroup = wrapper.dataset.civGroup || "";
  const header = wrapper.querySelector(".custom-select-header");
  const nameSpan = header.querySelector(".cs-name");
  const flagsSpan = header.querySelector(".cs-flags");
  nameSpan.textContent = val;
  flagsSpan.innerHTML = getUnitFlagHtml(val, 18, civGroup);
}

function openDropdown(wrapper) {
  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  header.classList.add("open");
  dropdown.classList.add("show");
  const search = dropdown.querySelector(".custom-select-search");
  search.value = "";
  search.focus();
  renderDropdownOptions(wrapper, "");
}

function closeDropdown(wrapper) {
  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  header.classList.remove("open");
  dropdown.classList.remove("show");
}

function initCustomSelect(wrapperId) {
  const wrapper = document.getElementById(wrapperId);

  // Build initial structure
  wrapper.innerHTML = `
    <div class="custom-select-header">
      <span class="cs-name">${wrapper.dataset.value}</span>
      <span class="cs-flags"></span>
      <span class="cs-arrow">&#9660;</span>
    </div>
    <div class="custom-select-dropdown">
      <input type="text" class="custom-select-search" placeholder="Search units...">
    </div>
  `;

  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const search = dropdown.querySelector(".custom-select-search");

  // Toggle dropdown on header click
  header.addEventListener("click", () => {
    if (dropdown.classList.contains("show")) {
      closeDropdown(wrapper);
    } else {
      // Close any other open dropdowns
      document.querySelectorAll(".custom-select-wrapper").forEach(w => closeDropdown(w));
      openDropdown(wrapper);
    }
  });

  // Search filter
  search.addEventListener("input", () => {
    renderDropdownOptions(wrapper, search.value);
  });

  // Prevent search click from closing
  search.addEventListener("click", (e) => e.stopPropagation());

  updateSelectHeader(wrapper);
}

// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select-wrapper")) {
    document.querySelectorAll(".custom-select-wrapper").forEach(w => closeDropdown(w));
  }
});

function populateSelects(preserveSelection) {
  const wrapperA = document.getElementById("unitASelect");
  const wrapperB = document.getElementById("unitBSelect");

  if (!wrapperA.querySelector(".custom-select-header")) {
    // First time init
    initCustomSelect("unitASelect");
    initCustomSelect("unitBSelect");
  }

  if (!preserveSelection) {
    wrapperA.dataset.value = "Horseman";
    wrapperB.dataset.value = "Horseman";
  }

  updateSelectHeader(wrapperA);
  updateSelectHeader(wrapperB);
}

function initCivSelect(wrapperId, side) {
  const wrapper = document.getElementById(wrapperId);

  wrapper.innerHTML = `
    <div class="custom-select-header">
      <span class="cs-name">All Civilizations</span>
      <span class="cs-flags"></span>
      <span class="cs-arrow">&#9660;</span>
    </div>
    <div class="custom-select-dropdown">
      <input type="text" class="custom-select-search" placeholder="Search civilizations...">
    </div>
  `;

  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const search = dropdown.querySelector(".custom-select-search");

  header.addEventListener("click", () => {
    if (dropdown.classList.contains("show")) {
      closeDropdown(wrapper);
    } else {
      document.querySelectorAll(".custom-select-wrapper").forEach(w => closeDropdown(w));
      openCivDropdown(wrapper, side);
    }
  });

  search.addEventListener("input", () => {
    renderCivOptions(wrapper, side, search.value);
  });
  search.addEventListener("click", (e) => e.stopPropagation());
}

function openCivDropdown(wrapper, side) {
  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  header.classList.add("open");
  dropdown.classList.add("show");
  const search = dropdown.querySelector(".custom-select-search");
  search.value = "";
  search.focus();
  renderCivOptions(wrapper, side, "");
}

function renderCivOptions(wrapper, side, filter) {
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const searchInput = dropdown.querySelector(".custom-select-search");
  const currentVal = wrapper.dataset.value;
  const filterLower = (filter || "").toLowerCase();

  let html = "";
  // "All Civilizations" option
  if (!filterLower || "all civilizations".includes(filterLower)) {
    const sel = !currentVal ? " selected" : "";
    html += `<div class="custom-select-option${sel}" data-value="">All Civilizations</div>`;
  }

  getCivOrder().forEach(civ => {
    if (civ === "Common") return;
    if (filterLower && !civ.toLowerCase().includes(filterLower)) return;
    const sel = civ === currentVal ? " selected" : "";
    const flag = CIV_FLAGS[civ] ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:18px; border-radius:2px;">` : "";
    html += `<div class="custom-select-option${sel}" data-value="${civ}"><span>${flag} ${civ}</span></div>`;
  });

  // Remove old options
  dropdown.querySelectorAll(".custom-select-option").forEach(el => el.remove());
  searchInput.insertAdjacentHTML("afterend", html);

  // Attach click handlers
  dropdown.querySelectorAll(".custom-select-option").forEach(opt => {
    opt.addEventListener("click", () => {
      const val = opt.dataset.value;
      wrapper.dataset.value = val;
      updateCivSelectHeader(wrapper);
      closeDropdown(wrapper);
      onCivChange(side);
    });
  });
}

function updateCivSelectHeader(wrapper) {
  const val = wrapper.dataset.value;
  const header = wrapper.querySelector(".custom-select-header");
  const nameSpan = header.querySelector(".cs-name");
  const flagsSpan = header.querySelector(".cs-flags");
  if (val && CIV_FLAGS[val]) {
    nameSpan.textContent = val;
    flagsSpan.innerHTML = `<img src="${CIV_FLAGS[val]}" alt="${val}" style="height:18px; border-radius:2px;">`;
  } else {
    nameSpan.textContent = "All Civilizations";
    flagsSpan.innerHTML = "";
  }
}

function populateCivDropdowns() {
  initCivSelect("civSelectA", "A");
  initCivSelect("civSelectB", "B");
}

function onCivChange(side) {
  const wrapper = document.getElementById("civSelect" + side);
  const civ = wrapper.dataset.value;
  if (side === "A") selectedCivA = civ; else selectedCivB = civ;

  // Check if current unit is still available for this civ
  const unitWrapper = document.getElementById("unit" + side + "Select");
  const currentUnit = unitWrapper.dataset.value;
  if (civ) {
    const available = getUnitsForCiv(civ);
    if (!available.includes(currentUnit)) {
      unitWrapper.dataset.value = available[0] || "Horseman";
      updateSelectHeader(unitWrapper);
      updateUnitStats(side);
    }
  }

  // Re-render unit dropdown if open
  const dropdown = unitWrapper.querySelector(".custom-select-dropdown");
  if (dropdown && dropdown.classList.contains("show")) {
    renderDropdownOptions(unitWrapper, unitWrapper.querySelector(".custom-select-search").value);
  }
}


/**
 * Helper: Returns available ages for a unit
 */
function getAvailableAges(unitName) {
  const unit = units[unitName];
  if (
    !unit ||
    !unit.weapons ||
    !unit.weapons.primary ||
    !unit.weapons.primary.ages
  )
    return [];
  return Object.keys(unit.weapons.primary.ages);
}

/**
 * FIXED: Populate age dropdown while PRESERVING the currently selected age
 * This prevents the dropdown from resetting every time the unit changes.
 */
function populateAgeDropdown(side) {
  const unitName = document.getElementById(`unit${side}Select`).dataset.value;
  const ageSelect = document.getElementById(`unit${side}Age`);
  const currentAge = ageSelect.value; // Save what the user had selected
  const availableAges = getAvailableAges(unitName);

  ageSelect.innerHTML = "";
  availableAges.forEach((age) => {
    ageSelect.innerHTML += `<option value="${age}">Age ${age}</option>`;
  });

  // Try to keep the same age if it's still available for the new unit
  if (availableAges.includes(currentAge)) {
    ageSelect.value = currentAge;
  } else if (availableAges.includes("3")) {
    ageSelect.value = "3"; // Default to Age 3 if available
  } else {
    ageSelect.value = availableAges[availableAges.length - 1]; // Otherwise pick the last available
  }
}

/**
 * Update weapon mode buttons based on whether secondary weapon exists
 */
function updateWeaponModeButtons(side) {
  const unitName = document.getElementById(`unit${side}Select`).dataset.value;
  const unit = units[unitName];
  const age = document.getElementById(`unit${side}Age`).value;

  const hasSecondary =
    unit.weapons.secondary &&
    unit.weapons.secondary.ages &&
    unit.weapons.secondary.ages[age];

  const secondaryRadio = document.getElementById(`secondary${side}`);
  const bothRadio = document.getElementById(`both${side}`);
  const primaryRadio = document.getElementById(`primary${side}`);

  secondaryRadio.disabled = !hasSecondary;
  bothRadio.disabled = !hasSecondary;

  const selectedMode = document.querySelector(
    `input[name="weaponMode${side}"]:checked`
  )?.value || "primary";
  if (
    !hasSecondary &&
    (selectedMode === "secondary" || selectedMode === "both")
  ) {
    primaryRadio.checked = true;
  }

  // Update button labels based on weapon names or type
  const primaryLabel = document.querySelector(`label[for="primary${side}"]`);
  const secondaryLabel = document.querySelector(`label[for="secondary${side}"]`);
  const weaponInfoEl = document.getElementById(`weaponInfo${side}`);

  if (hasSecondary && unit.weapons.primary.name) {
    // Multi-weapon unit with named weapons
    primaryLabel.textContent = unit.weapons.primary.name;
    secondaryLabel.textContent = unit.weapons.secondary.name || "Secondary";

    // Show weapon info line
    const priAge = unit.weapons.primary.ages[age] || {};
    const secAge = unit.weapons.secondary.ages[age] || {};
    weaponInfoEl.textContent =
      `${unit.weapons.primary.name}: ${priAge.attack || 0} atk, ${unit.weapons.primary.attackSpeed}s` +
      ` | ${unit.weapons.secondary.name}: ${secAge.attack || 0} atk, ${unit.weapons.secondary.attackSpeed}s`;
    weaponInfoEl.style.display = "";
  } else {
    // Single-weapon unit: label as Melee/Ranged
    const typeLabel = (unit.weapons.primary.type || "melee") === "ranged" ? "Ranged" : "Melee";
    primaryLabel.textContent = typeLabel;
    secondaryLabel.textContent = "Secondary";
    weaponInfoEl.textContent = "";
    weaponInfoEl.style.display = "none";
  }
}

/**
 * NEW: Render tag checkboxes dynamically
 * Shows all available tags with checkboxes, pre-selecting the unit's default tags
 */
function renderTagCheckboxes(side, selectedTags) {
  const container = document.getElementById(`${side}_tagsContainer`);
  container.innerHTML = "";

  // Sort tags alphabetically for consistent display
  const sortedTags = Array.from(allAvailableTags).sort();

  sortedTags.forEach((tag) => {
    const isChecked = selectedTags.includes(tag);
    const checkboxId = `${side}_tag_${tag.replace(/\s+/g, "_")}`; // Handle tags with spaces

    container.innerHTML += `
      <div class="form-check form-check-inline">
        <input class="form-check-input tag-checkbox" type="checkbox" 
               id="${checkboxId}" value="${tag}" ${isChecked ? "checked" : ""}>
        <label class="form-check-label small" for="${checkboxId}">${tag}</label>
      </div>
    `;
  });
}

/**
 * NEW: Render editable bonus damage inputs
 * Only shows inputs for tags that are currently checked
 */
function renderBonusInputs(side, bonuses) {
  const container = document.getElementById(`${side}_bonusesContainer`);
  container.innerHTML = "";

  // Show bonus inputs for ALL available tags (sorted)
  const sortedTags = Array.from(allAvailableTags).sort();

  sortedTags.forEach((tag) => {
    const bonusValue = bonuses[tag] || 0;
    const inputId = `${side}_bonus_${tag.replace(/\s+/g, "_")}`;

    container.innerHTML += `
      <div class="row g-2 mb-2">
        <div class="col-6">
          <small class="text-muted">vs ${tag}</small>
        </div>
        <div class="col-6">
          <input type="number" id="${inputId}" class="form-control form-control-sm bonus-input" 
                 data-tag="${tag}" value="${bonusValue}" placeholder="0">
        </div>
      </div>
    `;
  });
}

/**
 * NEW: Collect current bonus values from the input fields
 */
function collectBonuses(side) {
  const bonuses = {};
  const inputs = document.querySelectorAll(
    `#${side}_bonusesContainer .bonus-input`
  );

  inputs.forEach((input) => {
    const tag = input.dataset.tag;
    const value = parseFloat(input.value) || 0;
    if (value > 0) {
      bonuses[tag] = value;
    }
  });

  return bonuses;
}

/**
 * NEW: Collect currently selected tags from checkboxes
 */
function collectTags(side) {
  const checkboxes = document.querySelectorAll(
    `#${side}_tagsContainer .tag-checkbox:checked`
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

/**
 * Render unique effects checkboxes and editable values
 */
function renderEffects(side, effects) {
  const box = document.getElementById(`${side}_effectsBox`);
  const container = document.getElementById(`${side}_effectsContainer`);

  if (!effects || Object.keys(effects).length === 0) {
    box.style.display = "none";
    container.innerHTML = "";
    return;
  }

  box.style.display = "";
  container.innerHTML = "";

  const selectedCiv = side === "A" ? selectedCivA : selectedCivB;
  for (const [effectId, effect] of Object.entries(effects)) {
    // Skip effects restricted to specific civs if current civ doesn't match
    if (effect.civs && selectedCiv && !effect.civs.includes(selectedCiv)) continue;
    if (effect.civs && !selectedCiv) continue; // "All Civilizations" — skip civ-conditional effects

    const checkId = `${side}_effect_${effectId}`;
    let valueHtml = "";

    if (effectId === "postChargeAttackBuff") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_value" class="form-control form-control-sm"
                   value="${effect.value}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Attack</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "healPerAttack") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_value" class="form-control form-control-sm"
                 value="${effect.value}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">HP per attack</small>
        </div>`;
    } else if (effectId === "berserking") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-4">
            <input type="number" id="${checkId}_attackBonus" class="form-control form-control-sm"
                   value="${effect.attackBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Attack</small>
          </div>
          <div class="col-4">
            <input type="number" id="${checkId}_armorPenalty" class="form-control form-control-sm"
                   value="${effect.armorPenalty}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">-Armor</small>
          </div>
          <div class="col-4">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
        </div>`;
    } else if (effectId === "fortitude") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-4">
            <input type="number" id="${checkId}_atkSpeedBonus" class="form-control form-control-sm"
                   value="${effect.atkSpeedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Atk Spd %</small>
          </div>
          <div class="col-4">
            <input type="number" id="${checkId}_dmgTakenIncrease" class="form-control form-control-sm"
                   value="${effect.dmgTakenIncrease}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Dmg Taken %</small>
          </div>
          <div class="col-4">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
        </div>`;
    } else if (effectId === "deployPavise") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_armorBonus" class="form-control form-control-sm"
                   value="${effect.armorBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Ranged Armor</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "arrowVolley" || effectId === "staticDeployment") {
      const delayOrDur = effectId === "staticDeployment" ? "delay" : "duration";
      const delayVal = effectId === "staticDeployment" ? effect.delay : effect.duration;
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_atkSpeedBonus" class="form-control form-control-sm"
                   value="${effect.atkSpeedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Atk Spd %</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_${delayOrDur}" class="form-control form-control-sm"
                   value="${delayVal}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">${effectId === "staticDeployment" ? "Delay (s)" : "Duration (s)"}</small>
          </div>
        </div>`;
    } else if (effectId === "openingAttack") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_damage" class="form-control form-control-sm"
                 value="${effect.damage}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Damage</small>
        </div>`;
    } else if (effectId === "gunpowderResistance") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_reduction" class="form-control form-control-sm"
                 value="${effect.reduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Reduction % vs Gunpowder</small>
        </div>`;
    } else if (effectId === "camelUnease") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_reduction" class="form-control form-control-sm"
                 value="${effect.reduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Reduction %</small>
        </div>`;
    } else if (effectId === "shieldWall") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_atkSpeedPenalty" class="form-control form-control-sm"
                   value="${effect.atkSpeedPenalty}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">-Atk Spd %</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_rangedDmgReduction" class="form-control form-control-sm"
                   value="${effect.rangedDmgReduction}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">-Ranged Dmg %</small>
          </div>
        </div>`;
    } else if (effectId === "bleed") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_dps" class="form-control form-control-sm"
                   value="${effect.dps}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dmg/s</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "armorAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_armorBonus" class="form-control form-control-sm"
                 value="${effect.armorBonus}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">+Armor</small>
        </div>`;
    } else if (effectId === "trample") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-3">
            <input type="number" id="${checkId}_dps" class="form-control form-control-sm"
                   value="${effect.dps}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dmg/s</small>
          </div>
          <div class="col-3">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
          <div class="col-3">
            <input type="number" id="${checkId}_cooldown" class="form-control form-control-sm"
                   value="${effect.cooldown}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">CD (s)</small>
          </div>
          <div class="col-3">
            <input type="number" id="${checkId}_unitsHit" class="form-control form-control-sm"
                   value="${effect.unitsHit || 3}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Units Hit</small>
          </div>
        </div>`;
    } else if (effectId === "percentDamage") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_percent" class="form-control form-control-sm"
                 value="${effect.percent}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">% of Max HP</small>
        </div>`;
    } else if (effectId === "brotherhoodHP") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_hpPerUnit" class="form-control form-control-sm"
                 value="${effect.hpPerUnit}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">HP per nearby unit</small>
        </div>`;
    } else if (effectId === "healAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_hps" class="form-control form-control-sm"
                 value="${effect.hps}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">HP/s healed</small>
        </div>`;
    } else if (effectId === "atkSpeedDebuff") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_reduction" class="form-control form-control-sm"
                   value="${effect.reduction}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">-Atk Spd %</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "caracole") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-4">
            <input type="number" id="${checkId}_speedBonus" class="form-control form-control-sm"
                   value="${effect.speedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Speed %</small>
          </div>
          <div class="col-4">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
          <div class="col-4">
            <input type="number" id="${checkId}_cooldown" class="form-control form-control-sm"
                   value="${effect.cooldown}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">CD (s)</small>
          </div>
        </div>`;
    } else if (effectId === "armorDebuffAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_armorReduction" class="form-control form-control-sm"
                 value="${effect.armorReduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">-Armor to enemies</small>
        </div>`;
    } else if (effectId === "battleGlory") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_hpPerKill" class="form-control form-control-sm"
                   value="${effect.hpPerKill}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+HP per kill</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_attackPerKill" class="form-control form-control-sm"
                   value="${effect.attackPerKill}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Atk per kill</small>
          </div>
        </div>`;
    } else if (effectId === "aoeSplash") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_unitsHit" class="form-control form-control-sm"
                 value="${effect.unitsHit}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Units hit per attack</small>
        </div>`;
    } else if (effectId === "aoeFalloff") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_unitsHit" class="form-control form-control-sm"
                 value="${effect.unitsHit}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Units hit (center=full, outer=falloff)</small>
        </div>`;
    } else if (effectId === "armorPenetration") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_penetration" class="form-control form-control-sm"
                 value="${effect.penetration}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Armor ignored</small>
        </div>`;
    } else if (effectId === "dmgDebuffOnHit") {
      valueHtml = `
        <div class="ms-4 mt-1 d-flex align-items-center gap-2 flex-wrap">
          <div>
            <input type="number" id="${checkId}_reduction" class="form-control form-control-sm"
                   value="${effect.reduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
            <small class="text-muted" style="font-size:0.7rem;">% dmg reduction</small>
          </div>
          <div>
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;width:80px;display:inline-block;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "spearwall") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_stunDuration" class="form-control form-control-sm"
                 value="${effect.stunDuration}" step="0.1" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Stun duration (s) vs cavalry</small>
        </div>`;
    } else if (effectId === "palings") {
      valueHtml = `
        <div class="ms-4 mt-1 d-flex align-items-center gap-2 flex-wrap">
          <div>
            <input type="number" id="${checkId}_stunDuration" class="form-control form-control-sm"
                   value="${effect.stunDuration}" step="0.1" style="font-size:0.8rem;width:80px;display:inline-block;">
            <small class="text-muted" style="font-size:0.7rem;">Stun (s)</small>
          </div>
          <div>
            <input type="number" id="${checkId}_damage" class="form-control form-control-sm"
                   value="${effect.damage}" style="font-size:0.8rem;width:80px;display:inline-block;">
            <small class="text-muted" style="font-size:0.7rem;">Damage</small>
          </div>
        </div>`;
    } else if (effectId === "movementBurst") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_speedBonus" class="form-control form-control-sm"
                   value="${effect.speedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Speed %</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "infantrySpeedAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" id="${checkId}_speedBonus" class="form-control form-control-sm"
                 value="${effect.speedBonus}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">+Speed % for infantry</small>
        </div>`;
    }

    container.innerHTML += `
      <div class="mb-2">
        <div class="form-check">
          <input class="form-check-input effect-checkbox" type="checkbox" id="${checkId}"
                 data-effect="${effectId}" checked>
          <label class="form-check-label" for="${checkId}" style="font-size:0.85rem;">
            <strong>${effect.name}</strong>
            <span style="font-size:0.75rem; color:#b8ad9e;"> — ${effect.description}</span>
          </label>
        </div>
        ${valueHtml}
      </div>`;
  }

  // Hide effects box if all effects were filtered out by civ
  if (!container.innerHTML.trim()) {
    box.style.display = "none";
  }
}

/**
 * Collect enabled effects and their values from the UI
 */
function collectEffects(side) {
  const effects = {};
  const checkboxes = document.querySelectorAll(`#${side}_effectsContainer .effect-checkbox`);

  checkboxes.forEach((cb) => {
    if (!cb.checked) return;
    const effectId = cb.dataset.effect;
    const checkId = cb.id;
    const getVal = (suffix) => parseFloat(document.getElementById(`${checkId}_${suffix}`)?.value) || 0;

    if (effectId === "postChargeAttackBuff") {
      effects.postChargeAttackBuff = { value: getVal("value"), duration: getVal("duration") };
    } else if (effectId === "healPerAttack") {
      effects.healPerAttack = { value: getVal("value") };
    } else if (effectId === "berserking") {
      effects.berserking = { attackBonus: getVal("attackBonus"), armorPenalty: getVal("armorPenalty"), duration: getVal("duration") };
    } else if (effectId === "fortitude") {
      effects.fortitude = { atkSpeedBonus: getVal("atkSpeedBonus"), dmgTakenIncrease: getVal("dmgTakenIncrease"), duration: getVal("duration") };
    } else if (effectId === "deployPavise") {
      effects.deployPavise = { armorBonus: getVal("armorBonus"), duration: getVal("duration") };
    } else if (effectId === "arrowVolley") {
      effects.arrowVolley = { atkSpeedBonus: getVal("atkSpeedBonus"), duration: getVal("duration") };
    } else if (effectId === "staticDeployment") {
      effects.staticDeployment = { atkSpeedBonus: getVal("atkSpeedBonus"), delay: getVal("delay") };
    } else if (effectId === "deflectiveArmor") {
      effects.deflectiveArmor = true;
    } else if (effectId === "doubleAttack") {
      effects.doubleAttack = true;
    } else if (effectId === "thrownAxes") {
      effects.thrownAxes = true;
    } else if (effectId === "openingAttack") {
      effects.openingAttack = { damage: getVal("damage") };
    } else if (effectId === "gunpowderResistance") {
      effects.gunpowderResistance = { reduction: getVal("reduction") };
    } else if (effectId === "camelUnease") {
      effects.camelUnease = { reduction: getVal("reduction") };
    } else if (effectId === "shieldWall") {
      effects.shieldWall = { atkSpeedPenalty: getVal("atkSpeedPenalty"), rangedDmgReduction: getVal("rangedDmgReduction") };
    } else if (effectId === "bleed") {
      effects.bleed = { dps: getVal("dps"), duration: getVal("duration") };
    } else if (effectId === "armorAura") {
      effects.armorAura = { armorBonus: getVal("armorBonus") };
    } else if (effectId === "trample") {
      effects.trample = { dps: getVal("dps"), duration: getVal("duration"), cooldown: getVal("cooldown"), unitsHit: getVal("unitsHit") || 3 };
    } else if (effectId === "percentDamage") {
      effects.percentDamage = { percent: getVal("percent") };
    } else if (effectId === "brotherhoodHP") {
      effects.brotherhoodHP = { hpPerUnit: getVal("hpPerUnit") };
    } else if (effectId === "healAura") {
      effects.healAura = { hps: getVal("hps") };
    } else if (effectId === "atkSpeedDebuff") {
      effects.atkSpeedDebuff = { reduction: getVal("reduction"), duration: getVal("duration") };
    } else if (effectId === "caracole") {
      effects.caracole = { speedBonus: getVal("speedBonus"), duration: getVal("duration"), cooldown: getVal("cooldown") };
    } else if (effectId === "armorDebuffAura") {
      effects.armorDebuffAura = { armorReduction: getVal("armorReduction") };
    } else if (effectId === "battleGlory") {
      effects.battleGlory = { hpPerKill: getVal("hpPerKill"), attackPerKill: getVal("attackPerKill") };
    } else if (effectId === "aoeSplash") {
      effects.aoeSplash = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "aoeFalloff") {
      effects.aoeFalloff = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "armorPenetration") {
      effects.armorPenetration = { penetration: getVal("penetration") };
    } else if (effectId === "dmgDebuffOnHit") {
      effects.dmgDebuffOnHit = { reduction: getVal("reduction"), duration: getVal("duration") };
    } else if (effectId === "spearwall") {
      effects.spearwall = { stunDuration: getVal("stunDuration") };
    } else if (effectId === "palings") {
      effects.palings = { stunDuration: getVal("stunDuration"), damage: getVal("damage") };
    } else if (effectId === "movementBurst") {
      effects.movementBurst = { speedBonus: getVal("speedBonus"), duration: getVal("duration") };
    } else if (effectId === "infantrySpeedAura") {
      effects.infantrySpeedAura = { speedBonus: getVal("speedBonus") };
    }
  });

  return effects;
}

/**
 * 3. UI UPDATES
 * Called when unit, age, or weapon mode changes
 */
function updateUnitStats(side) {
  const unitName = document.getElementById(`unit${side}Select`).dataset.value;
  const unit = units[unitName];

  if (!unit) return;

  // Update dropdowns (now preserves selected age!)
  populateAgeDropdown(side);
  updateWeaponModeButtons(side);

  const age = document.getElementById(`unit${side}Age`).value;
  const weaponMode = document.querySelector(
    `input[name="weaponMode${side}"]:checked`
  )?.value || "primary";

  // Determine which weapon to display stats for
  let weaponData, stats;

  if (weaponMode === "secondary" && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    stats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    stats = weaponData.ages[age] || {};
  }

  // Fill in stat inputs
  document.getElementById(`${side}_hp`).value = stats.hp || "";
  document.getElementById(`${side}_attack`).value = stats.attack || "";
  document.getElementById(`${side}_meleeArmor`).value = stats.meleeArmor || 0;
  document.getElementById(`${side}_rangedArmor`).value = stats.rangedArmor || 0;
  document.getElementById(`${side}_attackSpeed`).value =
    weaponData.attackSpeed || 1;

  // Render unique effects, tag checkboxes, and bonus inputs
  renderEffects(side, unit.effects || {});
  renderTagCheckboxes(side, unit.tags || []);
  renderBonusInputs(side, stats.bonus || {});

  // Show charge damage indicator if unit has charge
  const chargeInfo = document.getElementById(`${side}_chargeInfo`);
  const chargeDmg = stats.chargeDamage || 0;
  if (chargeDmg > 0) {
    chargeInfo.style.display = "";
    document.getElementById(`${side}_chargeDamage`).textContent = `+${chargeDmg} (first hit)`;
  } else {
    chargeInfo.style.display = "none";
  }

  // Update torch damage display if in building mode (Team A only)
  if (side === "A") {
    const torchInfo = document.getElementById("A_torchInfo");
    const torchDmgEl = document.getElementById("A_torchDamage");
    const attackCol = document.getElementById("A_attackCol");
    const attackSpeedCol = document.getElementById("A_attackSpeedCol");
    const inBuildingMode = document.getElementById("vsBuildingToggle")?.checked;
    if (inBuildingMode) {
      const weaponType = stats.type || "melee";
      if (weaponType === "melee") {
        const age = parseInt(document.getElementById("unitAAge")?.value) || 2;
        if (torchDmgEl) torchDmgEl.value = TORCH_BY_AGE[age] || 13;
        if (torchInfo) torchInfo.style.display = "";
        if (attackCol) attackCol.style.display = "none";
        if (attackSpeedCol) attackSpeedCol.style.display = "none";
      } else {
        if (torchInfo) torchInfo.style.display = "none";
        if (attackCol) attackCol.style.display = "";
        if (attackSpeedCol) attackSpeedCol.style.display = "";
      }
    }
  }

  // Get selected civ group for flag ordering
  const selectedCivGroup = document.getElementById(`unit${side}Select`).dataset.civGroup || "";

  // Update card title: name left, flags right
  const titleEl = document.getElementById(`title${side}`);
  if (titleEl) {
    let civs = (unit.civs || ["Common"]).filter(c => c !== "Common" && CIV_FLAGS[c]);
    if (selectedCivGroup && civs.includes(selectedCivGroup)) {
      civs = [selectedCivGroup, ...civs.filter(c => c !== selectedCivGroup)];
    }
    let flagsHtml = "";
    civs.forEach((civ) => {
      flagsHtml += `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:28px; border-radius:3px; margin-left:6px;">`;
    });
    titleEl.style.display = "flex";
    titleEl.style.justifyContent = "space-between";
    titleEl.style.alignItems = "center";
    titleEl.innerHTML = `<span>${unitName}</span><span>${flagsHtml}</span>`;
  }

  // Set flag as semi-transparent card background via CSS custom properties
  const card = document.querySelector(`.card-team-${side.toLowerCase()}`);
  if (card) {
    let civs = (unit.civs || ["Common"]).filter(c => c !== "Common" && CIV_FLAGS[c]);
    if (selectedCivGroup && civs.includes(selectedCivGroup)) {
      civs = [selectedCivGroup, ...civs.filter(c => c !== selectedCivGroup)];
    }
    card.style.setProperty("--flag-bg", civs[0] ? `url('${CIV_FLAGS[civs[0]]}')` : "none");
    card.style.setProperty("--flag-bg-2", civs[1] ? `url('${CIV_FLAGS[civs[1]]}')` : "none");
  }

  // Auto-balance costs if enabled
  if (document.getElementById("autoBalance").checked) {
    balanceCosts();
  }
}

/**
 * Show unit detail modal when clicking the unit name header
 */
function showUnitDetail(side) {
  const unitName = document.getElementById(`unit${side}Select`).dataset.value;
  const age = document.getElementById(`unit${side}Age`).value;
  const selectedCiv = side === "A" ? selectedCivA : selectedCivB;
  showUnitDetailWith({ unitName, age, side, selectedCiv });
}

function showUnitDetailWith({ unitName, age, side, selectedCiv }) {
  const unit = units[unitName];
  if (!unit) return;

  const selectedAgeKey = String(age || "2");
  const ageNames = { "1": "Dark Age", "2": "Feudal Age", "3": "Castle Age", "4": "Imperial Age" };
  const teamColor = side === "A" ? "#4a90d9" : "#d94a4a";
  const teamColorRgb = side === "A" ? "74,144,217" : "217,74,74";

  document.getElementById("unitDetailTitle").textContent = unitName;
  document.getElementById("unitDetailTitle").style.color = teamColor;

  // Build costs string (with per-civ costs if available)
  let costDisplay = "";
  if (unit.civCosts) {
    const parts = [];
    for (const [civ, cc] of Object.entries(unit.civCosts)) {
      const cp = [];
      if (cc.food) cp.push(`${cc.food} Food`);
      if (cc.wood) cp.push(`${cc.wood} Wood`);
      if (cc.gold) cp.push(`${cc.gold} Gold`);
      if (cc.stone) cp.push(`${cc.stone} Stone`);
      const flag = CIV_FLAGS[civ] ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:14px; border-radius:2px; vertical-align:middle;">` : civ;
      parts.push(`${flag} ${cp.join(" / ")}`);
    }
    costDisplay = parts.join(" &nbsp;|&nbsp; ");
  } else {
    const costs = unit.costs || {};
    const costParts = [];
    if (costs.food) costParts.push(`${costs.food} Food`);
    if (costs.wood) costParts.push(`${costs.wood} Wood`);
    if (costs.gold) costParts.push(`${costs.gold} Gold`);
    if (costs.stone) costParts.push(`${costs.stone} Stone`);
    costDisplay = costParts.join(" / ") || "Free";
  }

  // Build weapons detail for all ages
  let weaponsHtml = "";
  const weaponTypes = [["primary", "Primary"], ["secondary", "Secondary"]];
  for (const [wKey, wLabel] of weaponTypes) {
    const weapon = unit.weapons[wKey];
    if (!weapon) continue;

    weaponsHtml += `<h6 style="color:${teamColor}; margin-top:12px; font-family:'Cinzel',serif;">${wLabel} — ${weapon.type.charAt(0).toUpperCase() + weapon.type.slice(1)}</h6>`;
    weaponsHtml += `<div style="font-size:0.8rem; color:#b8ad9e; margin-bottom:8px;">Attack Speed: ${weapon.attackSpeed}s | Range: ${weapon.range}</div>`;
    weaponsHtml += `<div class="table-responsive"><table class="table table-sm" style="color:#e0d6c2; font-size:0.85rem;">`;
    weaponsHtml += `<thead><tr style="border-color:#444;"><th>Age</th><th>HP</th><th>Atk</th><th>M.Arm</th><th>R.Arm</th><th>Charge</th><th>Bonuses</th></tr></thead><tbody>`;

    for (const [ageKey, ageStats] of Object.entries(weapon.ages)) {
      const bonuses = ageStats.bonus ? Object.entries(ageStats.bonus).map(([t, v]) => `+${v} vs ${t}`).join(", ") : "—";
      const charge = ageStats.chargeDamage ? `+${ageStats.chargeDamage}` : "—";
      const isSelected = ageKey === selectedAgeKey;
      const rowStyle = isSelected ? `background:rgba(${teamColorRgb},0.15); font-weight:600;` : "";
      weaponsHtml += `<tr style="border-color:#333;${rowStyle}">`;
      weaponsHtml += `<td>${ageNames[ageKey] || "Age " + ageKey}</td>`;
      weaponsHtml += `<td>${ageStats.hp}</td><td>${ageStats.attack}</td>`;
      weaponsHtml += `<td>${ageStats.meleeArmor}</td><td>${ageStats.rangedArmor}</td>`;
      weaponsHtml += `<td>${charge}</td><td style="font-size:0.8rem;">${bonuses}</td></tr>`;
    }
    weaponsHtml += `</tbody></table></div>`;
  }

  // Build effects detail
  let effectsHtml = "";
  if (unit.effects && Object.keys(unit.effects).length > 0) {
    effectsHtml = `<h6 style="color:${teamColor}; margin-top:12px; font-family:'Cinzel',serif;">Unique Effects</h6><ul style="font-size:0.85rem; padding-left:20px;">`;
    for (const [key, effect] of Object.entries(unit.effects)) {
      effectsHtml += `<li><strong>${effect.label || key}</strong>: ${effect.description || JSON.stringify(effect)}</li>`;
    }
    effectsHtml += `</ul>`;
  }

  const tags = (unit.tags || []).map(t => `<span style="display:inline-block; padding:2px 10px; margin:2px; border-radius:12px; font-size:0.75rem; background:rgba(212,164,74,0.15); color:#d4a44a; border:1px solid rgba(212,164,74,0.3);">${t}</span>`).join("");

  // Merge per-unit upgrades with global tech rules (e.g. Military Academy, Increased Supplies)
  const mergedUpgrades = getMergedUpgradesForUnit(unit);

  // Collect all unique civs from upgrades + auras for filter dropdown
  const allEntryCivs = new Set();
  for (const item of [...mergedUpgrades, ...(unit.auras || [])]) {
    if (item.civs) item.civs.forEach(c => allEntryCivs.add(c));
  }
  const sortedEntryCivs = CIV_ORDER.filter(c => allEntryCivs.has(c));

  // Build civ filter dropdown (only if there are civ-specific entries)
  let civFilterHtml = "";
  if (sortedEntryCivs.length > 0) {
    let opts = `<option value="all">All Civilizations</option>`;
    sortedEntryCivs.forEach(civ => {
      opts += `<option value="${civ}">${civ}</option>`;
    });
    civFilterHtml = `<div style="margin-top:16px; margin-bottom:8px;">
      <select id="civFilterSelect" class="form-select civ-filter-select" onchange="filterByCiv(this.value)">
        ${opts}
      </select>
    </div>`;
  }

  const catLabels = {hitpoints:"Hit Points", attack:"Attack", armor:"Armor", attackSpeed:"Attack Speed", moveSpeed:"Move Speed", range:"Range", creationSpeed:"Creation Speed", upgrading:"Upgrading", ability:"Ability", cost:"Cost", other:"Other"};
  const catIcons = {hitpoints:"\u2764\uFE0F", attack:"\u2694\uFE0F", armor:"\uD83D\uDEE1\uFE0F", attackSpeed:"\u23F1\uFE0F", moveSpeed:"\uD83D\uDC5F", range:"\uD83C\uDFAF", creationSpeed:"\u23F3", upgrading:"\u2B06\uFE0F", ability:"\u2728", cost:"\uD83D\uDCB0", other:"\u2699\uFE0F"};
  const flagImg = (civ) => CIV_FLAGS[civ] ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:16px; border-radius:2px; vertical-align:middle;">` : `<span style="font-size:0.7rem; color:#b8ad9e;" title="${civ}">${civ}</span>`;

  // Helper: render entries with category headers and civ sub-group headers (wiki-style)
  function renderEntries(entries, containerId, accentColor, accentBg, accentText) {
    const catOrder = ["attackSpeed", "attack", "armor", "hitpoints", "moveSpeed", "range", "creationSpeed", "upgrading", "ability", "cost", "other"];
    const byCategory = {};
    for (const e of entries) {
      if (!byCategory[e.category]) byCategory[e.category] = [];
      byCategory[e.category].push(e);
    }
    const sortedCats = Object.keys(byCategory).sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b));
    const subStyle = `padding:4px 12px; font-size:0.74rem; font-weight:600; color:#b8ad9e; background:rgba(255,255,255,0.03); border-top:1px solid rgba(255,255,255,0.05);`;

    let html = `<div id="${containerId}" style="border:1px solid ${accentColor}; border-radius:8px; overflow:hidden;">`;
    for (const cat of sortedCats) {
      html += `<div class="tech-cat-header" data-cat="${cat}" style="background:${accentBg}; padding:6px 12px; font-size:0.8rem; font-weight:600; color:${accentText}; border-top:1px solid ${accentColor};">${catIcons[cat] || ""} ${catLabels[cat] || cat}</div>`;

      const catEntries = byCategory[cat];
      // Sub-group entries by their civ classification
      const civGroups = {}; // keyed by sorted civs string
      const exceptGroups = {}; // keyed by sorted exceptCivs string
      const universal = [];

      for (const e of catEntries) {
        if (e.exceptCivs && e.exceptCivs.length > 0) {
          const key = [...e.exceptCivs].sort().join(",");
          if (!exceptGroups[key]) exceptGroups[key] = { exceptCivs: e.exceptCivs, entries: [] };
          exceptGroups[key].entries.push(e);
        } else if (e.civs && e.civs.length > 0) {
          const key = [...e.civs].sort().join(",");
          if (!civGroups[key]) civGroups[key] = { civs: e.civs, entries: [] };
          civGroups[key].entries.push(e);
        } else {
          universal.push(e);
        }
      }

      // Split civGroups: 2+ entries = named group with header, 1 entry = unique
      const namedGroups = [];
      const unique = [];
      for (const grp of Object.values(civGroups)) {
        if (grp.entries.length >= 2) namedGroups.push(grp);
        else unique.push(...grp.entries);
      }

      const hasMultipleSections = (namedGroups.length + Object.keys(exceptGroups).length + (universal.length > 0 ? 1 : 0) + (unique.length > 0 ? 1 : 0)) > 1;

      // 1. Named civ groups (e.g. "Japanese, Sengoku Daimyo")
      for (const grp of namedGroups) {
        const label = grp.civs.map(c => `${flagImg(c)} ${c}`).join(", ");
        const civAttr = grp.civs.join(",");
        html += `<div class="tech-subheader tech-entry" data-civs="${civAttr}" style="${subStyle}">${label}</div>`;
        for (const e of grp.entries) html += renderSingleEntry(e, false);
      }

      // 2. Except groups (e.g. "All except Japanese, Sengoku Daimyo, Macedonian Dynasty")
      for (const grp of Object.values(exceptGroups)) {
        const exceptLabel = grp.exceptCivs.map(c => `${flagImg(c)} ${c}`).join(", ");
        const exceptAttr = grp.exceptCivs.join(",");
        html += `<div class="tech-subheader tech-entry" data-civs="all" data-except-civs="${exceptAttr}" style="${subStyle}">All except ${exceptLabel}</div>`;
        for (const e of grp.entries) html += renderSingleEntry(e, false);
      }

      // 3. Universal (no civs, no except)
      if (universal.length > 0 && hasMultipleSections) {
        html += `<div class="tech-subheader tech-entry" data-civs="all" style="${subStyle}">All Civilizations</div>`;
      }
      for (const e of universal) html += renderSingleEntry(e, false);

      // 4. Unique (single-civ entries) with per-entry flags
      if (unique.length > 0 && hasMultipleSections) {
        html += `<div class="tech-subheader tech-entry" data-civs="all" style="${subStyle}">Unique</div>`;
      }
      for (const e of unique) html += renderSingleEntry(e, true);
    }
    html += `</div>`;
    return html;
  }

  function renderSingleEntry(e, showFlags) {
    const hasExcept = e.exceptCivs && e.exceptCivs.length > 0;
    const hasCivs = e.civs && e.civs.length > 0;
    const civAttr = hasExcept ? "all" : (hasCivs ? e.civs.join(",") : "all");
    const exceptAttr = hasExcept ? e.exceptCivs.join(",") : "";
    let civInfo = showFlags && hasCivs ? `<span style="margin-left:6px;">${e.civs.map(c => flagImg(c)).join(" ")}</span>` : "";
    let html = `<div class="tech-entry" data-civs="${civAttr}"${exceptAttr ? ` data-except-civs="${exceptAttr}"` : ""} style="padding:5px 12px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.82rem; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">`;
    html += `<strong style="color:#e0d6c2;">${e.name}</strong>`;
    html += `<span style="color:#e0d6c2;">(${e.description})</span>`;
    html += civInfo;
    html += `</div>`;
    return html;
  }

  // Build upgrades detail
  let upgradesHtml = "";
  if (mergedUpgrades.length > 0) {
    upgradesHtml = `<h6 style="color:${teamColor}; margin-top:16px; font-family:'Cinzel',serif;">Technologies</h6>`;
    upgradesHtml += renderEntries(mergedUpgrades, "upgradesContainer", "rgba(212,164,74,0.2)", "rgba(212,164,74,0.12)", "#d4a44a");
  }

  // Build aura buffs detail
  let aurasHtml = "";
  if (unit.auras && unit.auras.length > 0) {
    aurasHtml = `<h6 style="color:${teamColor}; margin-top:16px; font-family:'Cinzel',serif;">Aura Buffs</h6>`;
    aurasHtml += renderEntries(unit.auras, "aurasContainer", "rgba(100,180,255,0.2)", "rgba(100,180,255,0.08)", "#6ab4ff");
  }

  document.getElementById("unitDetailBody").innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:0.9rem;">
      <div><span style="color:#b8ad9e;">Civilizations:</span> ${unit.civs.join(", ")}</div>
      <div><span style="color:#b8ad9e;">Cost:</span> ${costDisplay}</div>
      <div><span style="color:#b8ad9e;">Training Time:</span> ${unit.trainingTime || "—"}s</div>
      <div><span style="color:#b8ad9e;">Speed:</span> ${unit.speed || "—"}</div>
      <div><span style="color:#b8ad9e;">Population:</span> ${unit.population || 1}</div>
    </div>
    <div style="margin-bottom:12px;">${tags}</div>
    ${weaponsHtml}
    ${effectsHtml}
    ${civFilterHtml}
    ${upgradesHtml}
    ${aurasHtml}
  `;

  new bootstrap.Modal(document.getElementById("unitDetailModal")).show();

  // Pre-select the civ from the battler dropdown in the popup's civ filter
  if (selectedCiv) {
    const civSelect = document.getElementById("civFilterSelect");
    if (civSelect) {
      civSelect.value = selectedCiv;
      filterByCiv(selectedCiv);
    }
  }
}

/**
 * Filter Technologies and Auras by selected civ
 */
function filterByCiv(selectedCiv) {
  const entries = document.querySelectorAll(".tech-entry");
  entries.forEach(el => {
    const civs = el.dataset.civs;
    const exceptCivs = el.dataset.exceptCivs;
    let show = selectedCiv === "all" || civs === "all" || civs.split(",").includes(selectedCiv);
    // Hide if selected civ is in the exception list
    if (show && exceptCivs && selectedCiv !== "all" && exceptCivs.split(",").includes(selectedCiv)) {
      show = false;
    }
    el.style.display = show ? "" : "none";
  });
  // Hide category headers that have no visible entries below them
  const headers = document.querySelectorAll(".tech-cat-header");
  headers.forEach(header => {
    let hasVisible = false;
    let next = header.nextElementSibling;
    while (next && !next.classList.contains("tech-cat-header")) {
      if (next.classList.contains("tech-entry") && next.style.display !== "none") {
        hasVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    header.style.display = hasVisible ? "" : "none";
  });
}

/**
 * Helper: Calculate total resource cost (uses civ-specific cost if available)
 */
function getTotalCost(unitName, side) {
  const unit = units[unitName];
  if (!unit || !unit.costs) return 0;
  if (unit.civCosts && side) {
    const civGroup = document.getElementById(`unit${side}Select`).dataset.civGroup || "";
    if (civGroup && unit.civCosts[civGroup]) {
      return Object.values(unit.civCosts[civGroup]).reduce((sum, val) => sum + val, 0);
    }
  }
  return Object.values(unit.costs).reduce((sum, val) => sum + val, 0);
}

/**
 * 4. COST BALANCING
 */
function balanceCosts() {
  const unitAName = document.getElementById("unitASelect").dataset.value;
  const unitBName = document.getElementById("unitBSelect").dataset.value;

  const costA = getTotalCost(unitAName, "A");
  const costB = getTotalCost(unitBName, "B");

  if (costA === 0 || costB === 0) return;

  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(costA, costB);

  document.getElementById("countA").value = costB / divisor;
  document.getElementById("countB").value = costA / divisor;
}

/**
 * 5. DATA COLLECTION
 * Gather all data from the UI for simulation
 */
function getUnitData(side) {
  const unitName = document.getElementById(`unit${side}Select`).dataset.value;
  const unit = units[unitName];
  const age = document.getElementById(`unit${side}Age`).value;
  const weaponMode = document.querySelector(
    `input[name="weaponMode${side}"]:checked`
  )?.value || "primary";

  let weaponData, ageStats;

  if (weaponMode === "secondary" && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    ageStats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    ageStats = weaponData.ages[age] || {};
  }

  return {
    name: unitName,
    count: parseInt(document.getElementById(`count${side}`).value) || 1,
    weaponMode: weaponMode,
    stats: {
      hp: parseFloat(document.getElementById(`${side}_hp`).value) || 0,
      attack: parseFloat(document.getElementById(`${side}_attack`).value) || 0,
      meleeArmor:
        parseFloat(document.getElementById(`${side}_meleeArmor`).value) || 0,
      rangedArmor:
        parseFloat(document.getElementById(`${side}_rangedArmor`).value) || 0,
      attackSpeed:
        parseFloat(document.getElementById(`${side}_attackSpeed`).value) || 1,
      bonus: collectBonuses(side), // NEW: Custom bonuses from UI
    },
    buffs: {
      attackAbs:
        parseFloat(document.getElementById(`${side}_buffAttackAbs`).value) || 0,
      attackAbsDur:
        parseFloat(document.getElementById(`${side}_buffAttackAbsDur`).value) ||
        0,
      attackPct:
        parseFloat(document.getElementById(`${side}_buffAttackPct`).value) || 0,
      attackPctDur:
        parseFloat(document.getElementById(`${side}_buffAttackPctDur`).value) ||
        0,
      hpAbs:
        parseFloat(document.getElementById(`${side}_buffHPabs`).value) || 0,
      hpAbsDur:
        parseFloat(document.getElementById(`${side}_buffHPabsDur`).value) || 0,
      hpPct:
        parseFloat(document.getElementById(`${side}_buffHPpct`).value) || 0,
      hpPctDur:
        parseFloat(document.getElementById(`${side}_buffHPpctDur`).value) || 0,
      speedPct:
        parseFloat(document.getElementById(`${side}_buffSpeedPct`).value) || 0,
      speedPctDur:
        parseFloat(document.getElementById(`${side}_buffSpeedPctDur`).value) ||
        0,
      meleeArmor:
        parseFloat(document.getElementById(`${side}_buffMeleeArmor`).value) ||
        0,
      rangedArmor:
        parseFloat(document.getElementById(`${side}_buffRangedArmor`).value) ||
        0,
      armorDur:
        parseFloat(document.getElementById(`${side}_buffArmorDur`).value) || 0,
    },
    firstHitEnabled: document.getElementById(`${side}_firstHitEnabled`).checked,
    freeHits: parseInt(document.getElementById(`${side}_freeHits`).value) || 0,
    tags: collectTags(side),
    effects: collectEffects(side),
    chargeDamage: ageStats.chargeDamage || 0,
    weaponType: weaponData.type || "melee",
    weaponRange: weaponData.range || 0,
    speed: unit.speed || 1,
    secondaryWeapon:
      weaponMode === "both" && unit.weapons.secondary
        ? {
            type: unit.weapons.secondary.type || "melee",
            attackSpeed: unit.weapons.secondary.attackSpeed || 1,
            stats: unit.weapons.secondary.ages[age] || {},
          }
        : null,
  };
}

/**
 * 6. BUFF LOGIC
 * Apply time-based buffs to stats
 */
function applyBuffs(unitData, time) {
  let hp = unitData.stats.hp;
  let attack = unitData.stats.attack;
  let attackSpeed = unitData.stats.attackSpeed;
  let meleeArmor = unitData.stats.meleeArmor;
  let rangedArmor = unitData.stats.rangedArmor;

  // Apply flat HP buff
  if (unitData.buffs.hpAbsDur === 0 || time < unitData.buffs.hpAbsDur) {
    hp += unitData.buffs.hpAbs;
  }

  // Apply percentage HP buff (separate duration)
  if (unitData.buffs.hpPctDur === 0 || time < unitData.buffs.hpPctDur) {
    hp *= 1 + unitData.buffs.hpPct / 100;
  }

  // Apply flat attack buff
  if (unitData.buffs.attackAbsDur === 0 || time < unitData.buffs.attackAbsDur) {
    attack += unitData.buffs.attackAbs;
  }

  // Apply percentage attack buff (separate duration)
  if (unitData.buffs.attackPctDur === 0 || time < unitData.buffs.attackPctDur) {
    attack *= 1 + unitData.buffs.attackPct / 100;
  }

  // Apply attack speed buff
  if (unitData.buffs.speedPctDur === 0 || time < unitData.buffs.speedPctDur) {
    attackSpeed /= 1 + unitData.buffs.speedPct / 100;
  }

  // Apply armor buffs
  if (unitData.buffs.armorDur === 0 || time < unitData.buffs.armorDur) {
    meleeArmor += unitData.buffs.meleeArmor;
    rangedArmor += unitData.buffs.rangedArmor;
  }

  return { hp, attack, attackSpeed, meleeArmor, rangedArmor };
}

function calcEffectiveAttackSpeed(unit, baseAttackSpeed, time, team) {
  const EPS = 0.0001;
  let atkSpeed = baseAttackSpeed;
  const fx = unit.effects;

  if (fx.arrowVolley && time <= fx.arrowVolley.duration + EPS) {
    atkSpeed /= (1 + fx.arrowVolley.atkSpeedBonus / 100);
  }
  if (fx.fortitude && time <= fx.fortitude.duration + EPS) {
    atkSpeed /= (1 + fx.fortitude.atkSpeedBonus / 100);
  }
  if (fx.staticDeployment && time >= fx.staticDeployment.delay - EPS) {
    atkSpeed /= (1 + fx.staticDeployment.atkSpeedBonus / 100);
  }
  if (fx.shieldWall) {
    atkSpeed /= (1 - fx.shieldWall.atkSpeedPenalty / 100);
  }
  if (team && team.atkSpeedDebuffUntil >= time - EPS) {
    atkSpeed /= (1 - team.atkSpeedDebuffReduction / 100);
  }
  return atkSpeed;
}

function calcEffectiveAttack(unit, baseAttack, time, team) {
  const EPS = 0.0001;
  let atk = baseAttack;
  const fx = unit.effects;
  if (fx.berserking && time <= fx.berserking.duration + EPS) {
    atk += fx.berserking.attackBonus;
  }
  if (team && team.gloryBonusAtk) {
    atk += team.gloryBonusAtk;
  }
  return atk;
}

function calcEffectiveArmor(unit, baseMeleeArmor, baseRangedArmor, time, enemyEffects) {
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

/**
 * 7. SIMULATION ENGINE
 *
 * Each weapon (primary + secondary) has its own independent attack timer.
 * In "Both" mode, the two weapons fire at their own rate of fire.
 * Both teams' damage is calculated BEFORE any is applied (simultaneous).
 * EPSILON ensures floating-point precision doesn't cause fake advantages.
 */

/**
 * Helper: Calculate damage for a single weapon attack against a target team
 */
function calcWeaponDamage(weaponType, weaponAttack, weaponBonus, enemyTags, enemyStats, armorPen = 0) {
  let damage = weaponAttack;

  // Add bonus damage against enemy tags
  for (let tag of enemyTags) {
    if (weaponBonus && weaponBonus[tag]) {
      damage += weaponBonus[tag];
    }
  }

  // Subtract armor (minimum 1 damage), reduced by armor penetration
  let armor = weaponType === "ranged"
    ? enemyStats.rangedArmor
    : enemyStats.meleeArmor;
  armor = Math.max(0, armor - armorPen);

  return Math.max(1, damage - armor);
}

/**
 * Set native tooltip on Res Lost showing per-resource breakdown
 */
function setResLostTooltip(elementId, costBreakdown) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const lines = Object.entries(costBreakdown)
    .map(([res, val]) => `${res.charAt(0).toUpperCase() + res.slice(1)}: ${val}`)
    .join("\n");
  el.title = lines || "No losses";
}

/**
 * Display last unit HP info under HP bar
 */
function setLastUnitHp(elementId, results) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (results.aliveUnits <= 0) {
    el.textContent = "All units dead";
  } else if (results.splitUnitHp >= results.lastUnitHpMax) {
    el.textContent = "All units full HP";
  } else if (results.splitDamagedUnits > 1) {
    const pct = (results.splitUnitHp / results.lastUnitHpMax * 100).toFixed(0);
    el.textContent = `${results.splitDamagedUnits} units damaged: ${pct}% HP each (${Math.round(results.splitUnitHp)}/${Math.round(results.lastUnitHpMax)})`;
  } else {
    const pct = (results.lastUnitHp / results.lastUnitHpMax * 100).toFixed(0);
    el.textContent = `Last unit: ${pct}% HP (${Math.round(results.lastUnitHp)}/${Math.round(results.lastUnitHpMax)})`;
  }
}

/**
 * Render unit grid visualization showing alive/partial/dead cells
 */
function renderUnitGrid(elementId, results, teamClass) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startCount = results.startingUnits;
  const alive = results.aliveUnits;

  // For large armies, show compact summary instead
  if (startCount > 40) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }

  el.style.display = "";
  el.innerHTML = "";

  // How many are fully healthy vs damaged (split damage can damage multiple units)
  const damagedCount = results.splitDamagedUnits || 1;
  const hasPartial = alive > 0 && results.splitUnitHp < results.lastUnitHpMax;
  const fullUnits = hasPartial ? Math.max(0, alive - damagedCount) : alive;
  const partialPct = hasPartial ? (results.splitUnitHp / results.lastUnitHpMax * 100) : 100;

  for (let i = 0; i < startCount; i++) {
    const cell = document.createElement("div");
    cell.className = "unit-cell";

    if (i < fullUnits) {
      // Full HP unit
      cell.classList.add(`unit-alive-${teamClass}`);
    } else if (i < fullUnits + damagedCount && i < alive && hasPartial) {
      // Partial HP unit(s) - split damage spreads across multiple
      cell.classList.add(`unit-partial-${teamClass}`);
      cell.style.setProperty("--fill-pct", partialPct + "%");
    } else if (i < alive) {
      // Full HP unit (no damage)
      cell.classList.add(`unit-alive-${teamClass}`);
    } else {
      // Dead unit
      cell.classList.add("unit-dead");
    }

    el.appendChild(cell);
  }
}

function runBuildingBattle() {
  const unitA = getUnitData("A");
  const building = getBuildingData();
  const age = parseInt(document.getElementById("unitAAge").value) || 2;

  // Determine if attacker uses torch (melee) or ranged attack
  const isMelee = unitA.weaponType === "melee";
  const torchDmg = parseFloat(document.getElementById("A_torchDamage")?.value) || TORCH_BY_AGE[age] || 13;
  const torchSpeed = parseFloat(document.getElementById("A_torchSpeed")?.value) || TORCH_ATTACK_SPEED;

  // Team A setup (attackers)
  let teamA = {
    units: unitA.count,
    totalHp: 0,
    stats: applyBuffs(unitA, 0),
    originalStats: unitA.stats,
    unitData: unitA,
    tags: unitA.tags,
  };
  teamA.totalHp = teamA.stats.hp * teamA.units;

  // Building setup
  let buildingHp = building.hp;
  const maxBuildingHp = building.hp;

  // Attack timers
  const attackerSpeed = isMelee ? torchSpeed : teamA.stats.attackSpeed;
  let nextAttackerHit = 0;
  let nextBaseArrow = building.baseArrows > 0 ? 0 : Infinity;
  let nextGarrisonArrow = building.garrison > 0 ? 0 : Infinity;
  // Emplacement timers (one per active emplacement)
  const empTimers = (building.emplacements || []).map(emp => ({ emp, nextHit: 0 }));

  const battleLog = [];
  let time = 0;
  const maxTime = 300;
  const EPSILON = 0.0001;

  while (teamA.units > 0 && buildingHp > 0 && time < maxTime) {
    // Find next event
    const nextEmpTime = empTimers.length > 0 ? Math.min(...empTimers.map(t => t.nextHit)) : Infinity;
    const nextEvent = Math.min(nextAttackerHit, nextBaseArrow, nextGarrisonArrow, nextEmpTime);
    time = nextEvent;
    if (time >= maxTime) break;

    // Refresh buffs
    teamA.stats = applyBuffs(unitA, time);

    let dmgToBuilding = 0;
    let dmgToAttackers = 0;
    let logNotesA = [];
    let logNotesB = [];

    // Attackers -> Building
    if (nextAttackerHit <= time + EPSILON && teamA.units > 0) {
      if (isMelee) {
        const dmgPerUnit = Math.max(1, torchDmg - building.fireArmor);
        dmgToBuilding = dmgPerUnit * teamA.units;
        logNotesA.push("Torch");
      } else {
        const dmgPerUnit = Math.max(1, teamA.stats.attack - building.rangedArmor);
        dmgToBuilding = dmgPerUnit * teamA.units;
        logNotesA.push("Ranged");
      }
      nextAttackerHit = time + (isMelee ? torchSpeed : teamA.stats.attackSpeed);
    }

    // Building -> Attackers (base arrows)
    if (building.baseArrows > 0 && nextBaseArrow <= time + EPSILON) {
      const dmgPerArrow = Math.max(1, building.baseArrowDmg - teamA.stats.rangedArmor);
      dmgToAttackers += dmgPerArrow * building.baseArrows;
      nextBaseArrow = time + building.baseArrowRate;
      logNotesB.push(`Base×${building.baseArrows}`);
    }

    // Building -> Attackers (garrison arrows)
    if (building.garrison > 0 && nextGarrisonArrow <= time + EPSILON) {
      const dmgPerArrow = Math.max(1, building.garrisonArrowDmg - teamA.stats.rangedArmor);
      dmgToAttackers += dmgPerArrow * building.garrison;
      nextGarrisonArrow = time + building.garrisonArrowRate;
      logNotesB.push(`Garrison×${building.garrison}`);
    }

    // Building -> Attackers (emplacement weapons)
    for (const et of empTimers) {
      if (et.nextHit <= time + EPSILON) {
        const emp = et.emp;
        // Siege type bypasses ranged armor
        const armor = emp.type === "siege" ? 0 : teamA.stats.rangedArmor;
        const dmgPerProjectile = Math.max(1, emp.dmg - armor);
        dmgToAttackers += dmgPerProjectile * emp.projectiles;
        et.nextHit = time + emp.rate;
        logNotesB.push(emp.name.replace(" Emplacement", ""));
      }
    }

    // Apply damage
    buildingHp -= dmgToBuilding;
    teamA.totalHp -= dmgToAttackers;

    // Update attacker unit count
    if (dmgToAttackers > 0 && teamA.units > 0) {
      const unitsLost = Math.floor(
        (teamA.stats.hp * teamA.units - teamA.totalHp) / teamA.stats.hp
      );
      teamA.units = Math.max(0, teamA.units - unitsLost);
    }

    buildingHp = Math.max(0, buildingHp);

    battleLog.push({
      time: time.toFixed(2),
      aWeapon: logNotesA.join("+") || "—",
      aDmg: dmgToBuilding.toFixed(1),
      aWaste: "0.0",
      aUnits: teamA.units,
      aHp: Math.round(teamA.totalHp),
      bWeapon: logNotesB.join("+") || "—",
      bDmg: dmgToAttackers.toFixed(1),
      bWaste: "0.0",
      bUnits: buildingHp > 0 ? 1 : 0,
      bHp: Math.round(buildingHp),
      notes: ""
    });
  }

  // --- RESULTS DISPLAY (Building Mode) ---
  const attackerWins = buildingHp <= 0;
  const winner = attackerWins ? "A" : teamA.units > 0 ? "timeout" : "B";

  const resultsEl = document.getElementById("results");
  resultsEl.style.display = "block";
  resultsEl.style.animation = "none";
  resultsEl.offsetHeight;
  resultsEl.style.animation = "";

  // Winner text
  const winnerTextEl = document.getElementById("winnerText");
  if (winner === "A") {
    winnerTextEl.textContent = `Units destroyed the ${building.name}!`;
    winnerTextEl.classList.add("winner-banner");
    winnerTextEl.classList.remove("draw-banner");
  } else if (winner === "B") {
    winnerTextEl.textContent = `${building.name} survived! All attackers dead.`;
    winnerTextEl.classList.add("winner-banner");
    winnerTextEl.classList.remove("draw-banner");
  } else {
    const pct = (buildingHp / maxBuildingHp * 100).toFixed(1);
    winnerTextEl.textContent = `Time limit! ${building.name} at ${pct}% HP`;
    winnerTextEl.classList.add("draw-banner");
    winnerTextEl.classList.remove("winner-banner");
  }

  // Duration
  document.getElementById("battleDuration").textContent = time.toFixed(1) + "s";

  // Team A results (attackers)
  const hpPctA = teamA.units > 0 ? (teamA.totalHp / (teamA.stats.hp * unitA.count)) * 100 : 0;
  const unitsLostA = unitA.count - teamA.units;
  const costPerUnit = getTotalCost(unitA.name, "A");
  const resourcesLostA = costPerUnit * unitsLostA;

  document.getElementById("resultNameA").textContent = `${unitA.name} (x${unitA.count})`;
  document.getElementById("resultUnitsA").textContent = teamA.units;
  document.getElementById("resultUnitsLostA").textContent = unitsLostA;
  document.getElementById("resultCostLostA").textContent = resourcesLostA.toFixed(0);
  document.getElementById("resultHpPctA").textContent = hpPctA.toFixed(1) + "%";

  // Last unit HP for attackers
  let lastUnitHp = 0;
  if (teamA.units > 0) {
    const remainder = teamA.totalHp % teamA.stats.hp;
    lastUnitHp = remainder === 0 ? teamA.stats.hp : remainder;
  }
  const resultsAObj = {
    aliveUnits: teamA.units, startingUnits: unitA.count,
    lastUnitHp, lastUnitHpMax: teamA.stats.hp,
    splitDamagedUnits: 1, splitUnitHp: lastUnitHp
  };
  setLastUnitHp("lastUnitHpA", resultsAObj);
  renderUnitGrid("unitGridA", resultsAObj, "a");

  // Team B results (building)
  const buildingHpPct = (buildingHp / maxBuildingHp) * 100;
  document.getElementById("resultNameB").textContent = building.name;
  document.getElementById("resultUnitsB").textContent = buildingHp > 0 ? "1" : "0";
  document.getElementById("resultUnitsLostB").textContent = buildingHp <= 0 ? "1" : "0";
  document.getElementById("resultCostLostB").textContent = "";
  document.getElementById("resultHpPctB").textContent = buildingHpPct.toFixed(1) + "%";

  // Building HP display
  const lastUnitHpB = document.getElementById("lastUnitHpB");
  if (lastUnitHpB) {
    if (buildingHp <= 0) {
      lastUnitHpB.textContent = "Building destroyed";
    } else {
      lastUnitHpB.textContent = `${Math.round(buildingHp)} / ${maxBuildingHp} HP`;
    }
  }

  // Building "unit grid" - single cell
  const gridB = document.getElementById("unitGridB");
  if (gridB) {
    gridB.style.display = "";
    gridB.innerHTML = "";
    const cell = document.createElement("div");
    cell.className = "unit-cell building-cell";
    if (buildingHp > 0) {
      cell.classList.add("unit-partial-b");
      cell.style.setProperty("--fill-pct", buildingHpPct + "%");
      cell.style.width = "40px";
      cell.style.height = "40px";
    } else {
      cell.classList.add("unit-dead");
      cell.style.width = "40px";
      cell.style.height = "40px";
    }
    gridB.appendChild(cell);
  }

  // Winner/loser panels
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

  // HP bars
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
      hpBarA.style.width = hpPctA.toFixed(1) + "%";
      hpBarB.style.width = buildingHpPct.toFixed(1) + "%";
    });
  });

  // Resource tooltips
  setResLostTooltip("resultCostLostA", {});
  setResLostTooltip("resultCostLostB", {});

  // Battle log
  const logContainer = document.getElementById("battleLogContainer");
  if (battleLog.length > 0) {
    let html = `<table class="battle-log-table">
      <thead><tr>
        <th>Time</th>
        <th class="team-a-col">Weapon</th><th class="team-a-col">Dmg</th>
        <th class="team-a-col">Units</th><th class="team-a-col">Total HP</th>
        <th class="team-b-col">Arrows</th><th class="team-b-col">Dmg</th>
        <th class="team-b-col">Building HP</th>
        <th>Notes</th>
      </tr></thead><tbody>`;
    for (const e of battleLog) {
      html += `<tr>
        <td>${e.time}s</td>
        <td class="team-a-col">${e.aWeapon}</td><td class="team-a-col">${e.aDmg}</td>
        <td class="team-a-col">${e.aUnits}</td><td class="team-a-col">${e.aHp}</td>
        <td class="team-b-col">${e.bWeapon}</td><td class="team-b-col">${e.bDmg}</td>
        <td class="team-b-col">${e.bHp}</td>
        <td class="log-notes">${e.notes}</td>
      </tr>`;
    }
    html += "</tbody></table>";
    logContainer.innerHTML = html;
  } else {
    logContainer.innerHTML = "<p class='text-muted'>No events recorded.</p>";
  }

  const logCollapse = document.getElementById("battleLogCollapse");
  if (logCollapse.classList.contains("show")) logCollapse.classList.remove("show");

  resultsEl.scrollIntoView({ behavior: "smooth" });
}

// ========================================
// MULTI BATTLE HELPERS
// ========================================

function isMultiMode() {
  return currentPage === "multiBattle";
}

function setEditorCollapsed(side, collapsed) {
  const body = document.getElementById(`${side}_editorBody`);
  const collapsedEl = document.getElementById(`${side}_editorCollapsed`);
  if (!body || !collapsedEl) return;
  if (collapsed) {
    body.style.display = "none";
    collapsedEl.style.display = "";
  } else {
    body.style.display = "";
    collapsedEl.style.display = "none";
  }
}

function setMultiModeUI(active) {
  document.querySelectorAll(".multi-only").forEach((el) => {
    el.style.display = active ? "" : "none";
  });
  const autoBalance = document.getElementById("autoBalance");
  if (autoBalance) {
    if (active) {
      autoBalance.checked = false;
      autoBalance.disabled = true;
    } else {
      autoBalance.disabled = false;
    }
  }
  if (active) {
    setEditorCollapsed("A", !multiEditorOpen.A);
    setEditorCollapsed("B", !multiEditorOpen.B);
    updateEditingLabel("A");
    updateEditingLabel("B");
  } else {
    setEditorCollapsed("A", false);
    setEditorCollapsed("B", false);
  }
}

function nextGroupId(side) {
  const id = `${side}${multiIdCounters[side]++}`;
  return id;
}

function updateEditingLabel(side) {
  const label = document.getElementById(`${side}_editingLabel`);
  const saveBtn = document.getElementById(`${side}_saveGroupBtn`);
  if (!label || !saveBtn) return;
  if (multiEditing[side]) {
    label.textContent = `Active: ${multiEditing[side]}`;
    saveBtn.textContent = "Update Unit";
  } else {
    label.textContent = "Active: None";
    saveBtn.textContent = "Save Unit";
  }
  if (isMultiMode()) {
    setEditorCollapsed(side, !multiEditorOpen[side]);
  }
}

function serializeGroupFromEditor(side) {
  const unitData = getUnitData(side);
  unitData.age = parseInt(document.getElementById(`unit${side}Age`).value) || 2;
  unitData.civGroup = document.getElementById(`unit${side}Select`)?.dataset.civGroup || "";
  return { unitData };
}

function applyUnitDataToEditor(side, unitData) {
  const wrapper = document.getElementById(`unit${side}Select`);
  if (wrapper) {
    wrapper.dataset.value = unitData.name;
    if (unitData.civGroup !== undefined) wrapper.dataset.civGroup = unitData.civGroup || "";
    updateSelectHeader(wrapper);
  }

  const ageEl = document.getElementById(`unit${side}Age`);
  if (ageEl && unitData.age) ageEl.value = String(unitData.age);

  const wm = unitData.weaponMode || "primary";
  const wmEl = document.getElementById(`${wm}${side}`);
  if (wmEl) wmEl.checked = true;

  updateUnitStats(side);

  document.getElementById(`count${side}`).value = unitData.count || 1;
  document.getElementById(`${side}_hp`).value = unitData.stats.hp ?? "";
  document.getElementById(`${side}_attack`).value = unitData.stats.attack ?? "";
  document.getElementById(`${side}_meleeArmor`).value = unitData.stats.meleeArmor ?? 0;
  document.getElementById(`${side}_rangedArmor`).value = unitData.stats.rangedArmor ?? 0;
  document.getElementById(`${side}_attackSpeed`).value = unitData.stats.attackSpeed ?? 1;

  document.getElementById(`${side}_buffAttackAbs`).value = unitData.buffs.attackAbs ?? 0;
  document.getElementById(`${side}_buffAttackAbsDur`).value = unitData.buffs.attackAbsDur ?? 0;
  document.getElementById(`${side}_buffAttackPct`).value = unitData.buffs.attackPct ?? 0;
  document.getElementById(`${side}_buffAttackPctDur`).value = unitData.buffs.attackPctDur ?? 0;
  document.getElementById(`${side}_buffHPabs`).value = unitData.buffs.hpAbs ?? 0;
  document.getElementById(`${side}_buffHPabsDur`).value = unitData.buffs.hpAbsDur ?? 0;
  document.getElementById(`${side}_buffHPpct`).value = unitData.buffs.hpPct ?? 0;
  document.getElementById(`${side}_buffHPpctDur`).value = unitData.buffs.hpPctDur ?? 0;
  document.getElementById(`${side}_buffSpeedPct`).value = unitData.buffs.speedPct ?? 0;
  document.getElementById(`${side}_buffSpeedPctDur`).value = unitData.buffs.speedPctDur ?? 0;
  document.getElementById(`${side}_buffMeleeArmor`).value = unitData.buffs.meleeArmor ?? 0;
  document.getElementById(`${side}_buffRangedArmor`).value = unitData.buffs.rangedArmor ?? 0;
  document.getElementById(`${side}_buffArmorDur`).value = unitData.buffs.armorDur ?? 0;

  document.getElementById(`${side}_firstHitEnabled`).checked = !!unitData.firstHitEnabled;
  document.getElementById(`${side}_freeHits`).value = unitData.freeHits ?? 0;

  const tagChecks = document.querySelectorAll(`#${side}_tagsContainer .tag-checkbox`);
  tagChecks.forEach((cb) => {
    cb.checked = unitData.tags?.includes(cb.value) || false;
  });

  const bonusInputs = document.querySelectorAll(`#${side}_bonusesContainer .bonus-input`);
  bonusInputs.forEach((input) => {
    const tag = input.dataset.tag;
    input.value = unitData.stats.bonus?.[tag] ?? 0;
  });

  const effectChecks = document.querySelectorAll(`#${side}_effectsContainer .effect-checkbox`);
  effectChecks.forEach((cb) => {
    const effectId = cb.dataset.effect;
    cb.checked = !!unitData.effects?.[effectId];
  });

  if (unitData.effects) {
    Object.entries(unitData.effects).forEach(([effectId, effectVal]) => {
      const checkId = `${side}_effect_${effectId}`;
      if (effectVal && typeof effectVal === "object") {
        Object.entries(effectVal).forEach(([k, v]) => {
          const input = document.getElementById(`${checkId}_${k}`);
          if (input) input.value = v;
        });
      }
    });
  }
}

function loadGroupIntoEditor(side, group) {
  if (!group) return;
  applyUnitDataToEditor(side, group.unitData);
  multiEditing[side] = group.id;
  multiEditorOpen[side] = true;
  updateEditingLabel(side);
  renderRoster(side);
}

function clearGroupEditor(side) {
  multiEditing[side] = null;
  multiEditorOpen[side] = true;
  updateEditingLabel(side);
  renderRoster(side);
}

function collapseGroupEditor(side) {
  multiEditing[side] = null;
  multiEditorOpen[side] = false;
  updateEditingLabel(side);
}

function saveGroupFromEditor(side) {
  const { unitData } = serializeGroupFromEditor(side);
  if (!unitData || !unitData.name) return;

  if (multiEditing[side]) {
    const idx = multiRosters[side].findIndex((g) => g.id === multiEditing[side]);
    if (idx >= 0) {
      multiRosters[side][idx].unitData = unitData;
    }
  } else {
    const id = nextGroupId(side);
    multiRosters[side].push({ id, side, unitData, targetPriority: [] });
    multiEditing[side] = id;
  }

  syncTargetPriorities();
  collapseGroupEditor(side);
  renderRoster("A");
  renderRoster("B");
}

function removeGroup(side, groupId) {
  const idx = multiRosters[side].findIndex((g) => g.id === groupId);
  if (idx >= 0) {
    multiRosters[side].splice(idx, 1);
  }
  if (multiEditing[side] === groupId) {
    multiEditing[side] = null;
    multiEditorOpen[side] = false;
    updateEditingLabel(side);
  }
  syncTargetPriorities();
  renderRoster("A");
  renderRoster("B");
}

function syncTargetPriorities() {
  const enemyIds = {
    A: multiRosters.B.map((g) => g.id),
    B: multiRosters.A.map((g) => g.id),
  };
  ["A", "B"].forEach((side) => {
    multiRosters[side].forEach((g) => {
      let list = g.targetPriority || [];
      list = list.filter((id) => enemyIds[side].includes(id));
      enemyIds[side].forEach((id) => {
        if (!list.includes(id)) list.push(id);
      });
      g.targetPriority = list;
      g.unitData.targetPriority = list;
    });
  });
}

function renderRosterTotals() {
  const totalA = multiRosters.A.reduce((sum, g) => sum + (parseInt(g.unitData.count, 10) || 0), 0);
  const totalB = multiRosters.B.reduce((sum, g) => sum + (parseInt(g.unitData.count, 10) || 0), 0);
  const totalAEl = document.getElementById("multiTotalsA");
  const totalBEl = document.getElementById("multiTotalsB");
  const diffEl = document.getElementById("multiRosterDiff");
  if (totalAEl) totalAEl.textContent = `Total units: ${totalA}`;
  if (totalBEl) totalBEl.textContent = `Total units: ${totalB}`;
  if (diffEl) {
    const diff = totalA - totalB;
    const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
    diffEl.textContent = `Unit diff: ${diffLabel}`;
  }
}

function renderRoster(side) {
  const container = document.getElementById(`rosterList${side}`);
  if (!container) return;
  container.innerHTML = "";

  if (multiRosters[side].length === 0) {
    container.innerHTML = `<div class="text-muted" style="font-size:0.8rem;">No units added.</div>`;
    renderRosterTotals();
    return;
  }

  multiRosters[side].forEach((g) => {
    const unitName = g.unitData.name;
    const count = g.unitData.count || 1;
    const weaponMode = g.unitData.weaponMode || "primary";
    const age = g.unitData.age || 2;
    const priority = g.targetPriority || [];
    const isActive = multiEditing[side] === g.id && multiEditorOpen[side];

    let targetHtml = "";
    if (priority.length === 0) {
      targetHtml = `<div class="text-muted">No targets.</div>`;
    } else {
      priority.forEach((tid, idx) => {
        targetHtml += `
          <div class="target-row">
            <span class="target-name">${tid}</span>
            <div class="target-actions">
              <button class="btn btn-sm btn-outline-secondary" data-action="target-up" data-id="${g.id}" data-target="${tid}" ${idx === 0 ? "disabled" : ""}>&uarr;</button>
              <button class="btn btn-sm btn-outline-secondary" data-action="target-down" data-id="${g.id}" data-target="${tid}" ${idx === priority.length - 1 ? "disabled" : ""}>&darr;</button>
            </div>
          </div>`;
      });
    }

    const card = document.createElement("div");
    card.className = `multi-group-card${isActive ? " is-active" : ""}`;
    card.dataset.groupId = g.id;
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <div class="multi-group-title">${g.id} - ${unitName}</div>
          <div class="multi-group-meta">Age ${age} | ${weaponMode}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger" data-action="remove" data-id="${g.id}">Remove</button>
      </div>
      <div class="d-flex align-items-center gap-2 mb-2">
        <div class="text-muted" style="font-size:0.75rem;">Units</div>
        <input type="number" class="form-control form-control-sm multi-count-input" min="1" data-action="count" data-id="${g.id}" value="${count}">
      </div>
      <div class="target-priority">
        <div class="text-muted mb-1">Target Priority</div>
        ${targetHtml}
      </div>
    `;
    container.appendChild(card);
  });
  renderRosterTotals();
}

function handleRosterClick(side, event) {
  const btn = event.target.closest("button");
  if (!btn) {
    const input = event.target.closest("input");
    if (input) return;
    const card = event.target.closest(".multi-group-card");
    if (card) {
      const groupId = card.dataset.groupId;
      const group = multiRosters[side].find((g) => g.id === groupId);
      if (group) loadGroupIntoEditor(side, group);
    }
    return;
  }
  const action = btn.dataset.action;
  const groupId = btn.dataset.id;
  const targetId = btn.dataset.target;
  if (!action || !groupId) return;

  const group = multiRosters[side].find((g) => g.id === groupId);
  if (!group) return;

  if (action === "remove") {
    removeGroup(side, groupId);
  } else if (action === "target-up" || action === "target-down") {
    const list = group.targetPriority || [];
    const idx = list.indexOf(targetId);
    if (idx === -1) return;
    const swapWith = action === "target-up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= list.length) return;
    [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
    group.targetPriority = list;
    group.unitData.targetPriority = list;
    renderRoster(side);
  }
}

function handleRosterInput(side, event) {
  const input = event.target.closest("input");
  if (!input || input.dataset.action !== "count") return;
  const groupId = input.dataset.id;
  const group = multiRosters[side].find((g) => g.id === groupId);
  if (!group) return;
  let value = parseInt(input.value, 10);
  if (!Number.isFinite(value) || value < 1) value = 1;
  input.value = value;
  group.unitData.count = value;
  if (multiEditing[side] === groupId && multiEditorOpen[side]) {
    const editorCount = document.getElementById(`count${side}`);
    if (editorCount) editorCount.value = value;
  }
  renderRosterTotals();
}

// === MULTI CARD MODE OVERRIDES ===
function setMultiModeUI(active) {
  document.querySelectorAll(".multi-only").forEach((el) => {
    el.style.display = active ? "" : "none";
  });
  document.querySelectorAll(".single-only").forEach((el) => {
    el.style.display = active ? "none" : "";
  });
  const autoBalance = document.getElementById("autoBalance");
  if (autoBalance) {
    if (active) {
      autoBalance.checked = false;
      autoBalance.disabled = true;
    } else {
      autoBalance.disabled = false;
    }
  }
  updateMultiTotals();
  updateMultiBattleReadyState();
}

function updateMultiBattleReadyState() {
  const buttons = document.querySelectorAll(".battle-btn");
  if (!isMultiMode()) {
    buttons.forEach((btn) => {
      btn.disabled = false;
      btn.title = "";
    });
    return;
  }
  buttons.forEach((btn) => {
    btn.disabled = false;
    btn.title = "";
  });
}

function getMultiField(card, name) {
  return card.querySelector(`[data-field="${name}"]`);
}

function getTotalCostForUnitData(unitData) {
  const unit = units[unitData.name];
  if (!unit || !unit.costs) return 0;
  if (unit.civCosts && unitData.civGroup && unit.civCosts[unitData.civGroup]) {
    return Object.values(unit.civCosts[unitData.civGroup]).reduce((sum, val) => sum + val, 0);
  }
  return Object.values(unit.costs).reduce((sum, val) => sum + val, 0);
}

function getCostBreakdownForUnitData(unitData) {
  const unit = units[unitData.name];
  if (!unit) return {};
  if (unit.civCosts && unitData.civGroup && unit.civCosts[unitData.civGroup]) {
    return unit.civCosts[unitData.civGroup];
  }
  return unit.costs || {};
}

function updateMultiTotals() {
  const totals = { A: { units: 0, cost: 0, pop: 0 }, B: { units: 0, cost: 0, pop: 0 } };
  ["A", "B"].forEach((side) => {
    multiRosters[side].forEach((g) => {
      const count = g.unitData?.count || 0;
      const cost = g.unitData ? getTotalCostForUnitData(g.unitData) : 0;
      const unit = g.unitData ? units[g.unitData.name] : null;
      const pop = unit?.population || 1;
      totals[side].units += count;
      totals[side].cost += cost * count;
      totals[side].pop += pop * count;
    });
  });
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("multiTotalUnitsA", totals.A.units);
  setText("multiTotalCostA", Math.round(totals.A.cost));
  setText("multiTotalPopA", totals.A.pop);
  setText("multiTotalUnitsB", totals.B.units);
  setText("multiTotalCostB", Math.round(totals.B.cost));
  setText("multiTotalPopB", totals.B.pop);
}

function updateGroupSummary(card, group) {
  const title = card.querySelector('[data-role="summaryTitle"]');
  const meta = card.querySelector('[data-role="summaryMeta"]');
  if (!group.unitData) return;
  const data = group.unitData;
  if (title) title.textContent = `${group.id} - ${data.name}`;
  const civ = data.civGroup || "";
  if (meta) {
    const civLabel = civ ? `${getCivFlagHtml(civ, 14)} ${civ}` : "";
    meta.innerHTML = `Age ${data.age || 2} | ${data.weaponMode || "primary"} | x${data.count || 1}${civ ? ` | ${civLabel}` : ""}`;
  }
  setFlagBackground(card, civ ? [civ] : []);
}

function setGroupCollapsed(group, card, collapsed) {
  group.ui = group.ui || {};
  group.ui.collapsed = collapsed;
  card.classList.toggle("is-collapsed", collapsed);
  if (!collapsed) card.classList.add("is-active");
  else card.classList.remove("is-active");
  updateMultiBattleReadyState();
}

function collapseOtherGroups(activeGroup) {
  const sideGroups = multiRosters[activeGroup.side] || [];
  sideGroups.forEach((g) => {
    if (g === activeGroup) return;
    if (g.ui?.collapsed === false && g.cardEl) {
      syncGroupFromCard(g.cardEl, g);
      setGroupCollapsed(g, g.cardEl, true);
    }
  });
}

function collapseAllOpenGroups() {
  ["A", "B"].forEach((side) => {
    (multiRosters[side] || []).forEach((g) => {
      if (g.ui?.collapsed === false && g.cardEl) {
        syncGroupFromCard(g.cardEl, g);
        setGroupCollapsed(g, g.cardEl, true);
      }
    });
  });
}

function syncTargetPriorities() {
  const enemyIds = {
    A: multiRosters.B.map((g) => g.id),
    B: multiRosters.A.map((g) => g.id),
  };
  ["A", "B"].forEach((side) => {
    multiRosters[side].forEach((g) => {
      let list = g.targetPriority || [];
      list = list.filter((id) => enemyIds[side].includes(id));
      enemyIds[side].forEach((id) => {
        if (!list.includes(id)) list.push(id);
      });
      g.targetPriority = list;
      if (g.unitData) g.unitData.targetPriority = list;
      if (g.cardEl) renderTargetPriority(g.cardEl, g);
    });
  });
}

function renderTargetPriority(card, group) {
  const container = card.querySelector('[data-role="targetList"]');
  if (!container) return;
  const list = group.targetPriority || [];
  if (list.length === 0) {
    container.innerHTML = '<div class="text-muted">No targets.</div>';
    return;
  }
  let html = "";
  list.forEach((tid, idx) => {
    const label = getGroupLabel(tid);
    html += `
      <div class="target-row">
        <span class="target-name">${label}</span>
        <div class="target-actions">
          <button class="btn btn-sm btn-outline-secondary" data-action="target-up" data-id="${group.id}" data-target="${tid}" ${idx === 0 ? "disabled" : ""}>&uarr;</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="target-down" data-id="${group.id}" data-target="${tid}" ${idx === list.length - 1 ? "disabled" : ""}>&darr;</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function findGroupById(groupId) {
  return multiRosters.A.find((g) => g.id === groupId) || multiRosters.B.find((g) => g.id === groupId);
}

function getGroupLabel(groupId) {
  const group = findGroupById(groupId);
  const name = group?.unitData?.name;
  return name ? `${groupId} ${name}` : groupId;
}

function refreshTargetLabels() {
  ["A", "B"].forEach((side) => {
    multiRosters[side].forEach((g) => {
      if (g.cardEl) renderTargetPriority(g.cardEl, g);
    });
  });
}

function renderTagCheckboxesMulti(container, selectedTags, groupId) {
  container.innerHTML = "";
  const sortedTags = Array.from(allAvailableTags).sort();
  sortedTags.forEach((tag) => {
    const isChecked = selectedTags.includes(tag);
    const checkboxId = `${groupId}_tag_${tag.replace(/\s+/g, "_")}`;
    container.innerHTML += `
      <div class="form-check form-check-inline">
        <input class="form-check-input tag-checkbox" type="checkbox" id="${checkboxId}" value="${tag}" ${isChecked ? "checked" : ""}>
        <label class="form-check-label small" for="${checkboxId}">${tag}</label>
      </div>
    `;
  });
}

function renderBonusInputsMulti(container, bonuses, groupId) {
  container.innerHTML = "";
  const sortedTags = Array.from(allAvailableTags).sort();
  sortedTags.forEach((tag) => {
    const bonusValue = bonuses[tag] || 0;
    const inputId = `${groupId}_bonus_${tag.replace(/\s+/g, "_")}`;
    container.innerHTML += `
      <div class="row g-2 mb-2">
        <div class="col-6">
          <small class="text-muted">vs ${tag}</small>
        </div>
        <div class="col-6">
          <input type="number" id="${inputId}" class="form-control form-control-sm bonus-input" data-tag="${tag}" value="${bonusValue}" placeholder="0">
        </div>
      </div>
    `;
  });
}

function collectTagsFromCard(card) {
  const checkboxes = card.querySelectorAll('.tag-checkbox:checked');
  return Array.from(checkboxes).map((cb) => cb.value);
}

function collectBonusesFromCard(card) {
  const bonuses = {};
  const inputs = card.querySelectorAll('.bonus-input');
  inputs.forEach((input) => {
    const tag = input.dataset.tag;
    const value = parseFloat(input.value) || 0;
    if (value > 0) bonuses[tag] = value;
  });
  return bonuses;
}

function renderEffectsMulti(card, effects, groupId, selectedCiv) {
  const box = card.querySelector('[data-role="effectsBox"]');
  const container = card.querySelector('[data-role="effectsContainer"]');
  if (!effects || Object.keys(effects).length === 0) {
    box.style.display = "none";
    container.innerHTML = "";
    return;
  }
  box.style.display = "";
  container.innerHTML = "";

  for (const [effectId, effect] of Object.entries(effects)) {
    if (effect.civs && selectedCiv && !effect.civs.includes(selectedCiv)) continue;
    if (effect.civs && !selectedCiv) continue;

    const checkId = `${groupId}_effect_${effectId}`;
    let valueHtml = "";

    if (effectId === "postChargeAttackBuff") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="value"
                   value="${effect.value}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Attack</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "healPerAttack") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="value"
                 value="${effect.value}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">HP per attack</small>
        </div>`;
    } else if (effectId === "berserking") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="attackBonus"
                   value="${effect.attackBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Attack</small>
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="armorPenalty"
                   value="${effect.armorPenalty}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">-Armor</small>
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
        </div>`;
    } else if (effectId === "fortitude") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="atkSpeedBonus"
                   value="${effect.atkSpeedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Atk Spd %</small>
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="dmgTakenIncrease"
                   value="${effect.dmgTakenIncrease}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dmg Taken %</small>
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
        </div>`;
    } else if (effectId === "deployPavise") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="armorBonus"
                   value="${effect.armorBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Ranged Armor</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "arrowVolley") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="atkSpeedBonus"
                   value="${effect.atkSpeedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Atk Spd %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
        </div>`;
    } else if (effectId === "staticDeployment") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="atkSpeedBonus"
                   value="${effect.atkSpeedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Atk Spd %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="delay"
                   value="${effect.delay}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Delay (s)</small>
          </div>
        </div>`;
    } else if (effectId === "openingAttack") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="damage"
                 value="${effect.damage}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Damage</small>
        </div>`;
    } else if (effectId === "gunpowderResistance") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="reduction"
                 value="${effect.reduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Damage reduction %</small>
        </div>`;
    } else if (effectId === "camelUnease") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="reduction"
                 value="${effect.reduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Attack reduction %</small>
        </div>`;
    } else if (effectId === "shieldWall") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="atkSpeedPenalty"
                   value="${effect.atkSpeedPenalty}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Atk Speed %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="rangedDmgReduction"
                   value="${effect.rangedDmgReduction}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Ranged Dmg %</small>
          </div>
        </div>`;
    } else if (effectId === "bleed") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="dps"
                   value="${effect.dps}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">DPS</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "armorAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="armorBonus"
                 value="${effect.armorBonus}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Armor bonus</small>
        </div>`;
    } else if (effectId === "trample") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="dps"
                   value="${effect.dps}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">DPS</small>
          </div>
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="cooldown"
                   value="${effect.cooldown}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">CD</small>
          </div>
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="unitsHit"
                   value="${effect.unitsHit || 3}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Units</small>
          </div>
        </div>`;
    } else if (effectId === "percentDamage") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="percent"
                 value="${effect.percent}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">% HP damage</small>
        </div>`;
    } else if (effectId === "brotherhoodHP") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="hpPerUnit"
                 value="${effect.hpPerUnit}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">HP per ally</small>
        </div>`;
    } else if (effectId === "healAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="hps"
                 value="${effect.hps}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">HP/s</small>
        </div>`;
    } else if (effectId === "atkSpeedDebuff") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="reduction"
                   value="${effect.reduction}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Reduction %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "caracole") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="speedBonus"
                   value="${effect.speedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Speed %</small>
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="cooldown"
                   value="${effect.cooldown}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">CD</small>
          </div>
        </div>`;
    } else if (effectId === "armorDebuffAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="armorReduction"
                 value="${effect.armorReduction}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Armor reduction</small>
        </div>`;
    } else if (effectId === "battleGlory") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="hpPerKill"
                   value="${effect.hpPerKill}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">HP per kill</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="attackPerKill"
                   value="${effect.attackPerKill}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Attack per kill</small>
          </div>
        </div>`;
    } else if (effectId === "aoeSplash") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="unitsHit"
                 value="${effect.unitsHit}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Units hit</small>
        </div>`;
    } else if (effectId === "aoeFalloff") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="unitsHit"
                 value="${effect.unitsHit}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Units hit</small>
        </div>`;
    } else if (effectId === "armorPenetration") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="penetration"
                 value="${effect.penetration}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Armor pen</small>
        </div>`;
    } else if (effectId === "dmgDebuffOnHit") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="reduction"
                   value="${effect.reduction}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Reduction %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "spearwall") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="stunDuration"
                 value="${effect.stunDuration}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">Stun (s)</small>
        </div>`;
    } else if (effectId === "palings") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="stunDuration"
                   value="${effect.stunDuration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Stun (s)</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="damage"
                   value="${effect.damage}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Damage</small>
          </div>
        </div>`;
    } else if (effectId === "movementBurst") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="speedBonus"
                   value="${effect.speedBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Speed %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "infantrySpeedAura") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="speedBonus"
                 value="${effect.speedBonus}" style="font-size:0.8rem;width:80px;display:inline-block;">
          <small class="text-muted" style="font-size:0.7rem;">+Speed % for infantry</small>
        </div>`;
    }

    container.innerHTML += `
      <div class="mb-2">
        <div class="form-check">
          <input class="form-check-input effect-checkbox" type="checkbox" id="${checkId}" data-effect="${effectId}" checked>
          <label class="form-check-label" for="${checkId}" style="font-size:0.85rem;">
            <strong>${effect.name}</strong>
            <span style="font-size:0.75rem; color:#b8ad9e;"> - ${effect.description}</span>
          </label>
        </div>
        ${valueHtml}
      </div>`;
  }

  if (!container.innerHTML.trim()) {
    box.style.display = "none";
  }
}

function collectEffectsFromCard(card) {
  const effects = {};
  const checkboxes = card.querySelectorAll('.effect-checkbox');
  checkboxes.forEach((cb) => {
    if (!cb.checked) return;
    const effectId = cb.dataset.effect;
    const getVal = (field) => {
      const input = card.querySelector(`[data-effect-id="${effectId}"][data-effect-field="${field}"]`);
      return parseFloat(input?.value) || 0;
    };

    if (effectId === "postChargeAttackBuff") {
      effects.postChargeAttackBuff = { value: getVal("value"), duration: getVal("duration") };
    } else if (effectId === "healPerAttack") {
      effects.healPerAttack = { value: getVal("value") };
    } else if (effectId === "berserking") {
      effects.berserking = { attackBonus: getVal("attackBonus"), armorPenalty: getVal("armorPenalty"), duration: getVal("duration") };
    } else if (effectId === "fortitude") {
      effects.fortitude = { atkSpeedBonus: getVal("atkSpeedBonus"), dmgTakenIncrease: getVal("dmgTakenIncrease"), duration: getVal("duration") };
    } else if (effectId === "deployPavise") {
      effects.deployPavise = { armorBonus: getVal("armorBonus"), duration: getVal("duration") };
    } else if (effectId === "arrowVolley") {
      effects.arrowVolley = { atkSpeedBonus: getVal("atkSpeedBonus"), duration: getVal("duration") };
    } else if (effectId === "staticDeployment") {
      effects.staticDeployment = { atkSpeedBonus: getVal("atkSpeedBonus"), delay: getVal("delay") };
    } else if (effectId === "deflectiveArmor") {
      effects.deflectiveArmor = true;
    } else if (effectId === "doubleAttack") {
      effects.doubleAttack = true;
    } else if (effectId === "thrownAxes") {
      effects.thrownAxes = true;
    } else if (effectId === "openingAttack") {
      effects.openingAttack = { damage: getVal("damage") };
    } else if (effectId === "gunpowderResistance") {
      effects.gunpowderResistance = { reduction: getVal("reduction") };
    } else if (effectId === "camelUnease") {
      effects.camelUnease = { reduction: getVal("reduction") };
    } else if (effectId === "shieldWall") {
      effects.shieldWall = { atkSpeedPenalty: getVal("atkSpeedPenalty"), rangedDmgReduction: getVal("rangedDmgReduction") };
    } else if (effectId === "bleed") {
      effects.bleed = { dps: getVal("dps"), duration: getVal("duration") };
    } else if (effectId === "armorAura") {
      effects.armorAura = { armorBonus: getVal("armorBonus") };
    } else if (effectId === "trample") {
      effects.trample = { dps: getVal("dps"), duration: getVal("duration"), cooldown: getVal("cooldown"), unitsHit: getVal("unitsHit") || 3 };
    } else if (effectId === "percentDamage") {
      effects.percentDamage = { percent: getVal("percent") };
    } else if (effectId === "brotherhoodHP") {
      effects.brotherhoodHP = { hpPerUnit: getVal("hpPerUnit") };
    } else if (effectId === "healAura") {
      effects.healAura = { hps: getVal("hps") };
    } else if (effectId === "atkSpeedDebuff") {
      effects.atkSpeedDebuff = { reduction: getVal("reduction"), duration: getVal("duration") };
    } else if (effectId === "caracole") {
      effects.caracole = { speedBonus: getVal("speedBonus"), duration: getVal("duration"), cooldown: getVal("cooldown") };
    } else if (effectId === "armorDebuffAura") {
      effects.armorDebuffAura = { armorReduction: getVal("armorReduction") };
    } else if (effectId === "battleGlory") {
      effects.battleGlory = { hpPerKill: getVal("hpPerKill"), attackPerKill: getVal("attackPerKill") };
    } else if (effectId === "aoeSplash") {
      effects.aoeSplash = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "aoeFalloff") {
      effects.aoeFalloff = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "armorPenetration") {
      effects.armorPenetration = { penetration: getVal("penetration") };
    } else if (effectId === "dmgDebuffOnHit") {
      effects.dmgDebuffOnHit = { reduction: getVal("reduction"), duration: getVal("duration") };
    } else if (effectId === "spearwall") {
      effects.spearwall = { stunDuration: getVal("stunDuration") };
    } else if (effectId === "palings") {
      effects.palings = { stunDuration: getVal("stunDuration"), damage: getVal("damage") };
    } else if (effectId === "movementBurst") {
      effects.movementBurst = { speedBonus: getVal("speedBonus"), duration: getVal("duration") };
    } else if (effectId === "infantrySpeedAura") {
      effects.infantrySpeedAura = { speedBonus: getVal("speedBonus") };
    }
  });
  return effects;
}

function populateAgeDropdownMulti(card, unitName) {
  const ageSelect = getMultiField(card, "age");
  const currentAge = ageSelect.value;
  const availableAges = getAvailableAges(unitName);
  ageSelect.innerHTML = "";
  availableAges.forEach((age) => {
    ageSelect.innerHTML += `<option value="${age}">Age ${age}</option>`;
  });
  if (availableAges.includes(currentAge)) {
    ageSelect.value = currentAge;
  } else if (availableAges.includes("3")) {
    ageSelect.value = "3";
  } else {
    ageSelect.value = availableAges[availableAges.length - 1];
  }
}

function updateWeaponModeButtonsMulti(card, unit, age) {
  const group = card.querySelector('[data-role="weaponModeGroup"]');
  const inputs = group.querySelectorAll('input[data-field="weaponMode"]');
  const labels = group.querySelectorAll('label');
  const primaryLabel = labels[0];
  const secondaryLabel = labels[1];
  const bothLabel = labels[2];
  const weaponInfoEl = card.querySelector('[data-role="weaponInfo"]');

  const hasSecondary = unit.weapons.secondary && unit.weapons.secondary.ages && unit.weapons.secondary.ages[age];

  inputs.forEach((input) => {
    const disabled = !hasSecondary && (input.value === "secondary" || input.value === "both");
    input.disabled = disabled;
    if (disabled && input.checked) {
      inputs[0].checked = true;
    }
  });

  if (hasSecondary && unit.weapons.primary.name) {
    primaryLabel.textContent = unit.weapons.primary.name;
    secondaryLabel.textContent = unit.weapons.secondary.name || "Secondary";
    bothLabel.textContent = "Both";
    const priAge = unit.weapons.primary.ages[age] || {};
    const secAge = unit.weapons.secondary.ages[age] || {};
    weaponInfoEl.textContent =
      `${unit.weapons.primary.name}: ${priAge.attack || 0} atk, ${unit.weapons.primary.attackSpeed}s` +
      ` | ${unit.weapons.secondary.name}: ${secAge.attack || 0} atk, ${unit.weapons.secondary.attackSpeed}s`;
    weaponInfoEl.style.display = "";
  } else {
    const typeLabel = (unit.weapons.primary.type || "melee") === "ranged" ? "Ranged" : "Melee";
    primaryLabel.textContent = typeLabel;
    secondaryLabel.textContent = "Secondary";
    bothLabel.textContent = "Both";
    weaponInfoEl.textContent = "";
    weaponInfoEl.style.display = "none";
  }
}

function updateMultiUnitStats(card, group) {
  const unitWrapper = getMultiField(card, "unitSelect");
  const unitName = unitWrapper.dataset.value;
  const unit = units[unitName];
  if (!unit) return;

  populateAgeDropdownMulti(card, unitName);
  const age = getMultiField(card, "age").value;
  updateWeaponModeButtonsMulti(card, unit, age);

  const weaponMode = card.querySelector('input[data-field="weaponMode"]:checked')?.value || "primary";
  let weaponData, stats;
  if (weaponMode === "secondary" && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    stats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    stats = weaponData.ages[age] || {};
  }

  getMultiField(card, "hp").value = stats.hp || "";
  getMultiField(card, "attack").value = stats.attack || "";
  getMultiField(card, "meleeArmor").value = stats.meleeArmor || 0;
  getMultiField(card, "rangedArmor").value = stats.rangedArmor || 0;
  getMultiField(card, "attackSpeed").value = weaponData.attackSpeed || 1;

  const tagsContainer = card.querySelector('[data-role="tagsContainer"]');
  renderTagCheckboxesMulti(tagsContainer, unit.tags || [], group.id);
  const bonusesContainer = card.querySelector('[data-role="bonusesContainer"]');
  renderBonusInputsMulti(bonusesContainer, stats.bonus || {}, group.id);

  const civWrapper = getMultiField(card, "civSelect");
  const selectedCiv = civWrapper?.dataset.value || "";
  renderEffectsMulti(card, unit.effects || {}, group.id, selectedCiv);

  const chargeInfo = card.querySelector('[data-role="chargeInfo"]');
  const chargeDmgEl = card.querySelector('[data-role="chargeDamage"]');
  const chargeDmg = stats.chargeDamage || 0;
  if (chargeDmg > 0) {
    chargeInfo.style.display = "";
    chargeDmgEl.textContent = `+${chargeDmg} (first hit)`;
  } else {
    chargeInfo.style.display = "none";
  }
}

function initMultiUnitSelect(wrapper, card) {
  wrapper.innerHTML = `
    <div class="custom-select-header">
      <span class="cs-name">${wrapper.dataset.value}</span>
      <span class="cs-flags"></span>
      <span class="cs-arrow">&#9660;</span>
    </div>
    <div class="custom-select-dropdown">
      <input type="text" class="custom-select-search" placeholder="Search units...">
    </div>
  `;

  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const search = dropdown.querySelector(".custom-select-search");

  header.addEventListener("click", () => {
    if (dropdown.classList.contains("show")) {
      closeDropdown(wrapper);
    } else {
      document.querySelectorAll(".custom-select-wrapper").forEach(w => closeDropdown(w));
      openMultiUnitDropdown(wrapper, card);
    }
  });

  search.addEventListener("input", () => {
    renderMultiUnitOptions(wrapper, card, search.value);
  });
  search.addEventListener("click", (e) => e.stopPropagation());

  updateSelectHeader(wrapper);
}

function openMultiUnitDropdown(wrapper, card) {
  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  header.classList.add("open");
  dropdown.classList.add("show");
  const search = dropdown.querySelector(".custom-select-search");
  search.value = "";
  search.focus();
  renderMultiUnitOptions(wrapper, card, "");
}

function renderMultiUnitOptions(wrapper, card, filter) {
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const currentVal = wrapper.dataset.value;
  const civFilter = getMultiField(card, "civSelect")?.dataset.value || "";
  const groups = buildGroupedUnits(filter, civFilter);
  const searchInput = dropdown.querySelector(".custom-select-search");
  let html = "";
  groups.forEach((g) => {
    html += `<div class="custom-select-optgroup">${g.label}</div>`;
    g.units.forEach((name) => {
      const sel = name === currentVal ? " selected" : "";
      const flags = getUnitFlagHtml(name, 16, civFilter || g.label);
      html += `<div class="custom-select-option${sel}" data-value="${name}" data-civ-group="${civFilter || g.label}"><span>${name}</span><span class="cs-opt-flags">${flags}</span></div>`;
    });
  });
  dropdown.querySelectorAll(".custom-select-optgroup, .custom-select-option").forEach(el => el.remove());
  searchInput.insertAdjacentHTML("afterend", html);

  dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const val = opt.dataset.value;
      wrapper.dataset.value = val;
      wrapper.dataset.civGroup = opt.dataset.civGroup || "";
      updateSelectHeader(wrapper);
      closeDropdown(wrapper);
      updateMultiUnitStats(card, card._groupRef);
      syncGroupFromCard(card, card._groupRef);
    });
  });
}

function initMultiCivSelect(wrapper, card) {
  wrapper.innerHTML = `
    <div class="custom-select-header">
      <span class="cs-name">All Civilizations</span>
      <span class="cs-flags"></span>
      <span class="cs-arrow">&#9660;</span>
    </div>
    <div class="custom-select-dropdown">
      <input type="text" class="custom-select-search" placeholder="Search civilizations...">
    </div>
  `;

  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const search = dropdown.querySelector(".custom-select-search");

  header.addEventListener("click", () => {
    if (dropdown.classList.contains("show")) {
      closeDropdown(wrapper);
    } else {
      document.querySelectorAll(".custom-select-wrapper").forEach(w => closeDropdown(w));
      openMultiCivDropdown(wrapper, card);
    }
  });

  search.addEventListener("input", () => {
    renderMultiCivOptions(wrapper, card, search.value);
  });
  search.addEventListener("click", (e) => e.stopPropagation());
}

function openMultiCivDropdown(wrapper, card) {
  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  header.classList.add("open");
  dropdown.classList.add("show");
  const search = dropdown.querySelector(".custom-select-search");
  search.value = "";
  search.focus();
  renderMultiCivOptions(wrapper, card, "");
}

function renderMultiCivOptions(wrapper, card, filter) {
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const searchInput = dropdown.querySelector(".custom-select-search");
  const currentVal = wrapper.dataset.value;
  const filterLower = (filter || "").toLowerCase();
  let html = "";
  if (!filterLower || "all civilizations".includes(filterLower)) {
    const sel = !currentVal ? " selected" : "";
    html += `<div class="custom-select-option${sel}" data-value="">All Civilizations</div>`;
  }
  CIV_ORDER.forEach(civ => {
    if (civ === "Common") return;
    if (filterLower && !civ.toLowerCase().includes(filterLower)) return;
    const sel = civ === currentVal ? " selected" : "";
    const flag = CIV_FLAGS[civ] ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:14px; border-radius:2px; vertical-align:middle;">` : "";
    html += `<div class="custom-select-option${sel}" data-value="${civ}"><span>${flag} ${civ}</span></div>`;
  });
  dropdown.querySelectorAll(".custom-select-option").forEach(el => el.remove());
  searchInput.insertAdjacentHTML("afterend", html);

  dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const val = opt.dataset.value;
      wrapper.dataset.value = val;
      updateCivSelectHeader(wrapper);
      closeDropdown(wrapper);
      handleMultiCivChange(card, val);
    });
  });
}

function handleMultiCivChange(card, civ) {
  const unitWrapper = getMultiField(card, "unitSelect");
  const currentUnit = unitWrapper.dataset.value;
  if (civ) {
    const available = getUnitsForCiv(civ);
    if (!available.includes(currentUnit)) {
      unitWrapper.dataset.value = available[0] || "Horseman";
      updateSelectHeader(unitWrapper);
    }
  }
  updateMultiUnitStats(card, card._groupRef);
  syncGroupFromCard(card, card._groupRef);
}

function syncGroupFromCard(card, group) {
  const prevName = group.unitData?.name;
  const unitWrapper = getMultiField(card, "unitSelect");
  const unitName = unitWrapper.dataset.value;
  const unit = units[unitName];
  if (!unit) return;

  const age = getMultiField(card, "age").value;
  const weaponMode = card.querySelector('input[data-field="weaponMode"]:checked')?.value || "primary";

  let weaponData, ageStats;
  if (weaponMode === "secondary" && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    ageStats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    ageStats = weaponData.ages[age] || {};
  }

  const countInput = getMultiField(card, "count");
  const collapsedInput = getMultiField(card, "countCollapsed");
  let count = group.ui?.collapsed ? parseInt(collapsedInput.value, 10) : parseInt(countInput.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  countInput.value = count;
  collapsedInput.value = count;

  const tags = collectTagsFromCard(card);
  const bonuses = collectBonusesFromCard(card);
  const effects = collectEffectsFromCard(card);

  group.unitData = {
    name: unitName,
    count,
    age: parseInt(age, 10) || 2,
    civGroup: unitWrapper.dataset.civGroup || "",
    weaponMode,
    stats: {
      hp: parseFloat(getMultiField(card, "hp").value) || 0,
      attack: parseFloat(getMultiField(card, "attack").value) || 0,
      meleeArmor: parseFloat(getMultiField(card, "meleeArmor").value) || 0,
      rangedArmor: parseFloat(getMultiField(card, "rangedArmor").value) || 0,
      attackSpeed: parseFloat(getMultiField(card, "attackSpeed").value) || 1,
      bonus: bonuses,
    },
    buffs: {
      attackAbs: parseFloat(getMultiField(card, "buffAttackAbs").value) || 0,
      attackAbsDur: parseFloat(getMultiField(card, "buffAttackAbsDur").value) || 0,
      attackPct: parseFloat(getMultiField(card, "buffAttackPct").value) || 0,
      attackPctDur: parseFloat(getMultiField(card, "buffAttackPctDur").value) || 0,
      hpAbs: parseFloat(getMultiField(card, "buffHPabs").value) || 0,
      hpAbsDur: parseFloat(getMultiField(card, "buffHPabsDur").value) || 0,
      hpPct: parseFloat(getMultiField(card, "buffHPpct").value) || 0,
      hpPctDur: parseFloat(getMultiField(card, "buffHPpctDur").value) || 0,
      speedPct: parseFloat(getMultiField(card, "buffSpeedPct").value) || 0,
      speedPctDur: parseFloat(getMultiField(card, "buffSpeedPctDur").value) || 0,
      meleeArmor: parseFloat(getMultiField(card, "buffMeleeArmor").value) || 0,
      rangedArmor: parseFloat(getMultiField(card, "buffRangedArmor").value) || 0,
      armorDur: parseFloat(getMultiField(card, "buffArmorDur").value) || 0,
    },
    firstHitEnabled: getMultiField(card, "firstHitEnabled").checked,
    freeHits: parseInt(getMultiField(card, "freeHits").value, 10) || 0,
    tags,
    effects,
    chargeDamage: ageStats.chargeDamage || 0,
    weaponType: weaponData.type || "melee",
    weaponRange: weaponData.range || 0,
    speed: unit.speed || 1,
    secondaryWeapon:
      weaponMode === "both" && unit.weapons.secondary
        ? {
            type: unit.weapons.secondary.type || "melee",
            attackSpeed: unit.weapons.secondary.attackSpeed || 1,
            stats: unit.weapons.secondary.ages[age] || {},
          }
        : null,
  };

  updateGroupSummary(card, group);
  updateMultiTotals();
  if (prevName !== unitName) refreshTargetLabels();
}

function initMultiCard(card, group) {
  const modeGroup = card.querySelector('[data-role="weaponModeGroup"]');
  const modeInputs = modeGroup.querySelectorAll('input[data-field="weaponMode"]');
  const modeLabels = modeGroup.querySelectorAll('label');
  modeInputs.forEach((input, idx) => {
    const id = `${group.id}_weapon_${input.value}`;
    input.id = id;
    input.name = `weaponMode_${group.id}`;
    modeLabels[idx].setAttribute("for", id);
  });

  const civWrapper = getMultiField(card, "civSelect");
  const unitWrapper = getMultiField(card, "unitSelect");
  initMultiCivSelect(civWrapper, card);
  initMultiUnitSelect(unitWrapper, card);

  updateMultiUnitStats(card, group);
  syncGroupFromCard(card, group);
  updateGroupSummary(card, group);
  setGroupCollapsed(group, card, false);
}

function attachCardListeners(card, group) {
  card._groupRef = group;
  const summaryTitle = card.querySelector('[data-role="summaryTitle"]');
  if (summaryTitle) {
    summaryTitle.title = "Click for details";
    summaryTitle.addEventListener("click", (e) => {
      e.stopPropagation();
      const data = group.unitData;
      if (!data) return;
      showUnitDetailWith({
        unitName: data.name,
        age: data.age,
        side: group.side,
        selectedCiv: data.civGroup || "",
      });
    });
  }
  card.addEventListener("click", (e) => {
    const action = e.target.closest("button")?.dataset.action;
    if (!action) return;
    if (action === "remove") {
      removeMultiGroup(group);
    } else if (action === "collapse") {
      syncGroupFromCard(card, group);
      setGroupCollapsed(group, card, true);
      syncTargetPriorities();
    } else if (action === "expand") {
      collapseOtherGroups(group);
      setGroupCollapsed(group, card, false);
    } else if (action === "target-up" || action === "target-down") {
      const targetId = e.target.dataset.target;
      const list = group.targetPriority || [];
      const idx = list.indexOf(targetId);
      const swapWith = action === "target-up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapWith < 0 || swapWith >= list.length) return;
      [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
      group.targetPriority = list;
      renderTargetPriority(card, group);
    }
  });

  card.addEventListener("click", (e) => {
    if (!group.ui?.collapsed) return;
    const interactive = e.target.closest("input, select, textarea, button, .custom-select-wrapper, .target-actions");
    if (interactive) return;
    collapseOtherGroups(group);
    setGroupCollapsed(group, card, false);
  });

  card.addEventListener("input", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    if (!field) return;
    syncGroupFromCard(card, group);
    if (field === "count" || field === "countCollapsed") {
      updateGroupSummary(card, group);
    }
  });

  card.addEventListener("change", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    if (field === "age" || field === "weaponMode") {
      updateMultiUnitStats(card, group);
      syncGroupFromCard(card, group);
    }
  });
}

function createMultiGroup(side) {
  return {
    id: nextGroupId(side),
    side,
    unitData: null,
    targetPriority: [],
    ui: { collapsed: false },
    cardEl: null,
  };
}

function addMultiGroup(side) {
  const group = createMultiGroup(side);
  multiRosters[side].push(group);

  const template = document.getElementById("multiGroupTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.groupId = group.id;
  group.cardEl = card;

  initMultiCard(card, group);
  attachCardListeners(card, group);
  collapseOtherGroups(group);

  const stack = document.getElementById(`multiStack${side}`);
  stack.appendChild(card);

  syncTargetPriorities();
  updateMultiTotals();
  updateMultiBattleReadyState();
}

function removeMultiGroup(group) {
  const side = group.side;
  multiRosters[side] = multiRosters[side].filter((g) => g.id !== group.id);
  if (group.cardEl) group.cardEl.remove();
  syncTargetPriorities();
  updateMultiTotals();
  updateMultiBattleReadyState();
}

function syncAllGroupsFromCards() {
  ["A", "B"].forEach((side) => {
    multiRosters[side].forEach((g) => {
      if (g.cardEl) syncGroupFromCard(g.cardEl, g);
    });
  });
}

function renderMultiBattleLog(battleLog) {
  const logContainer = document.getElementById("battleLogContainer");
  if (!logContainer) return;
  if (battleLog.length === 0) {
    logContainer.innerHTML = "<p class='text-muted'>No events recorded.</p>";
    return;
  }
  let html = `<table class="battle-log-table">
    <thead><tr>
      <th>Time</th><th>Attacker</th><th>Target</th><th>Weapon</th>
      <th>Dmg</th><th>Waste</th><th>Atk Units</th><th>Tgt Units</th><th>Units Died</th><th>Notes</th>
    </tr></thead><tbody>`;
  for (const e of battleLog) {
    const attackerClass = e.attackerSide === "A" ? "team-a-col" : e.attackerSide === "B" ? "team-b-col" : "";
    const targetClass = e.attackerSide === "A" ? "team-b-col" : e.attackerSide === "B" ? "team-a-col" : "";
    const timeLabel = e.time === "Pre" ? "Pre" : `${e.time}s`;
    const unitsDied = e.unitsDied ?? e.killsA ?? e.killsB ?? 0;
    html += `<tr>
      <td>${timeLabel}</td>
      <td class="${attackerClass}">${e.attacker}</td>
      <td class="${targetClass}">${e.target}</td>
      <td>${e.weapon}</td>
      <td>${e.dmg}</td>
      <td>${e.waste}</td>
      <td>${e.atkUnits}</td>
      <td>${e.tgtUnits}</td>
      <td class="${targetClass}">${unitsDied}</td>
      <td class="log-notes">${e.notes}</td>
    </tr>`;
  }
  html += "</tbody></table>";
  logContainer.innerHTML = html;
}

function renderMultiResults(teamsA, teamsB, time, winner) {
  const resultsEl = document.getElementById("results");
  resultsEl.style.display = "block";
  resultsEl.style.animation = "none";
  resultsEl.offsetHeight;
  resultsEl.style.animation = "";
  const multiResults = document.getElementById("multiResultsContainer");
  if (multiResults) multiResults.style.display = "none";
  document.getElementById("resultPanelA").style.display = "";
  document.getElementById("resultPanelB").style.display = "";

  const winnerTextEl = document.getElementById("winnerText");
  if (winner === "A") {
    winnerTextEl.textContent = "Team A wins!";
    winnerTextEl.classList.add("winner-banner");
    winnerTextEl.classList.remove("draw-banner");
  } else if (winner === "B") {
    winnerTextEl.textContent = "Team B wins!";
    winnerTextEl.classList.add("winner-banner");
    winnerTextEl.classList.remove("draw-banner");
  } else {
    winnerTextEl.textContent = "Draw";
    winnerTextEl.classList.add("draw-banner");
    winnerTextEl.classList.remove("winner-banner");
  }

  document.getElementById("battleDuration").textContent = time.toFixed(1) + "s";

  document.getElementById("multiResultsContainer").style.display = "";
  document.getElementById("resultPanelA").style.display = "none";
  document.getElementById("resultPanelB").style.display = "none";

  function buildSummaryHtml(teams, side) {
    let totalStart = 0;
    let totalLeft = 0;
    let totalResLost = 0;
    let rows = "";
    teams.forEach((t) => {
      const start = t.unitData.count;
      const left = t.units;
      const hpPct = left > 0 ? (t.totalHp / (t.stats.hp * start)) * 100 : 0;
      const unitsLost = start - left;
      const costPerUnit = getTotalCostForUnitData(t.unitData);
      const resLost = costPerUnit * unitsLost;
      totalStart += start;
      totalLeft += left;
      totalResLost += resLost;
      rows += `<tr><td>${t.groupId}</td><td>${t.unitData.name}</td><td>${start}</td><td>${left}</td><td>${hpPct.toFixed(1)}%</td><td>${Math.round(resLost)}</td></tr>`;
    });
    rows += `<tr><th colspan="2">Total</th><th>${totalStart}</th><th>${totalLeft}</th><th></th><th>${Math.round(totalResLost)}</th></tr>`;
    return `
      <table class="multi-summary-table">
        <thead><tr><th>Group</th><th>Unit</th><th>Start</th><th>Left</th><th>HP%</th><th>Res Lost</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  document.getElementById("multiSummaryA").innerHTML = buildSummaryHtml(teamsA, "A");
  document.getElementById("multiSummaryB").innerHTML = buildSummaryHtml(teamsB, "B");

  const logCollapse = document.getElementById("battleLogCollapse");
  if (logCollapse.classList.contains("show")) logCollapse.classList.remove("show");
  resultsEl.scrollIntoView({ behavior: "smooth" });
}

// ========================================
// BUILD ORDER (MVP)
// ========================================

const BO_FOOD_SOURCES = ["berries", "deer", "boar", "sheep", "farm"];
const BO_FINITE_FOOD_SOURCES = ["berries", "deer", "boar", "sheep"];
const BO_RESOURCE_KEYS = [...BO_FOOD_SOURCES, "wood", "gold", "stone"];
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
  "Abbasid Dynasty": { berries: 0.8625 },
  "Ayyubids": { berries: 0.8625 },
  "Delhi Sultanate": { berries: 0.8625 },
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
const BO_WHEEL_CARRY_BONUS = 5;
const BO_WHEEL_TRIP_MULT = 0.85;
const BO_FOOD_UPGRADE_MULT = 1.1;
const BO_SPECIAL_RES_KEYS = ["oliveOil", "silver"];
const BO_CAPITAL_TC_ANCHOR = "__bo_tc1__";
const BO_TIMELINE_BUILDING_SET = new Set([
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop",
  "Mill",
  "Blacksmith",
  "Mosque",
  "Monastery",
  "Prayer Tent",
  "Town Center",
  "Landmark (Age II)",
  "Landmark (Age III)",
  "Landmark (Age IV)"
]);
const BO_TRAINING_BUILDING_SET = new Set([
  "Town Center",
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop"
]);
const BO_PRODUCTION_BUILDINGS = new Set([
  "Town Center",
  "Barracks",
  "Archery Range",
  "Stable",
  "Siege Workshop"
]);
const BO_TECH_BUILDINGS = new Set([
  "Mill",
  "Blacksmith",
  "Mosque",
  "Monastery",
  "Prayer Tent"
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
  "Holy Roman Empire": { food: 200, wood: 100, gold: 0, stone: 0 },
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

function getCivFlagHtml(civ, size = 18) {
  if (!civ || !CIV_FLAGS[civ]) return "";
  return `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:${size}px; border-radius:3px; vertical-align:middle;">`;
}

function setFlagBackground(card, civs) {
  if (!card) return;
  card.classList.add("flag-card");
  const primary = civs[0];
  const secondary = civs[1];
  card.style.setProperty("--flag-bg", primary && CIV_FLAGS[primary] ? `url('${CIV_FLAGS[primary]}')` : "none");
  card.style.setProperty("--flag-bg-2", secondary && CIV_FLAGS[secondary] ? `url('${CIV_FLAGS[secondary]}')` : "none");
}

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

function getBoPreviewTownCenterWorkRatePct(civ, ageOverride = null) {
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  const age = Number.isFinite(ageOverride)
    ? ageOverride
    : (parseInt(document.getElementById("boStartAge")?.value, 10) || 1);
  return getBoAgeBonusValue(civBonus.townCenterWorkRateByAge, age);
}

function renderBoCivBonuses(civ) {
  const box = document.getElementById("boCivBonuses");
  if (!box) return;
  if (!civ) {
    box.innerHTML = `<span class="text-muted">Select a civilization to apply civ bonuses.</span>`;
    return;
  }
  const parts = [];
  const overrides = BO_CIV_RATE_OVERRIDES[civ];
  if (overrides) {
    const gatherParts = Object.entries(overrides).map(([res, rate]) => `${res.toUpperCase()}: ${rate.toFixed(3)}/s`);
    if (gatherParts.length) parts.push(`Gather: ${gatherParts.join(" | ")}`);
  }
  if (BO_MUSLIM_CIVS.has(civ)) {
    parts.push("Muslim berries: +100/node, +25% with Mill bonus, +3 carry; no boar");
  }
  const civBonus = BO_CIV_BONUSES?.[civ] || {};
  if (civBonus.farmGoldPerSec) parts.push("Farms generate gold (English/HoL)");
  if (civBonus.dropoffCostMult) parts.push("Dropoffs cheaper (French)");
  if (civBonus.ecoTechCostMult) parts.push("Eco techs cheaper (French/Jeanne)");
  if (civBonus.townCenterWorkRateByAge) parts.push("Town Center works faster by age (15/15/20/25%)");
  if (civ === "Mongols") parts.push("Pasture/Ovoo/Ger rules apply; farms disabled");
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
  const restricted = BO_BOAR_RESTRICTED_CIVS.has(civ);
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
  const civ = document.getElementById("boCiv")?.value || "";
  applyBoStartingResources(civ);
  applyBoStartingVillagers(civ);

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

function getBoSelectedCiv() {
  return (document.getElementById("boCiv")?.value || "").trim();
}

function updateBoCivGate(forceOpen = false, message = "Select a civilization to begin.") {
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
    if (msg) msg.textContent = message;
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
      BO_BOAR_RESTRICTED_CIVS = BO_MUSLIM_CIVS;
    }
    if (data.muslimBerryBonus) BO_MUSLIM_BERRY_BONUS = data.muslimBerryBonus;
    if (typeof data.sacredSiteGoldPerMin === "number") BO_SACRED_SITE_GOLD_PER_MIN = data.sacredSiteGoldPerMin;
    if (typeof data.pastureSheepSeconds === "number") BO_PASTURE_SHEEP_SECONDS = data.pastureSheepSeconds;
    if (data.ovooStonePerMinByAge) BO_OVOO_STONE_PER_MIN_BY_AGE = data.ovooStonePerMinByAge;
    if (data.scholar) BO_SCHOLAR = { ...BO_SCHOLAR, ...data.scholar };
  } catch (err) {
    console.warn("Build Order: failed to load bo_civ_bonuses.json, using defaults.", err);
  }
  applyBoDefaults();
}

function initBuildOrderUI() {
  const civSelect = document.getElementById("boCiv");
  const overlayToggle = document.getElementById("boOverlayToggle");
  if (overlayToggle) boOverlayEnabled = !!overlayToggle.checked;
  if (civSelect && civSelect.options.length === 1) {
    CIV_ORDER.filter((c) => c !== "Common").forEach((civ) => {
      const opt = document.createElement("option");
      opt.value = civ;
      opt.textContent = civ;
      civSelect.appendChild(opt);
    });
  }
  if (civSelect) {
    civSelect.addEventListener("change", () => {
      const civ = civSelect.value;
      boSelectedBuilding = null;
      clearBoTargetBuilding();
      applyBoStartingResources(civ);
      applyBoStartingVillagers(civ);
      applyBoCivRates(civ);
      applyBoCivRestrictions(civ);
      applyBoBoarRestriction(civ);
      renderBoCivBonuses(civ);
      updateBoCivFlags(civ);
      applyAutoDefaultsForAllCommands();
      boLastResults = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(getSelectedBoCommand());
      updateBoCivGate(false);
      scheduleRunBuildOrder();
    });
  }
  applyBoDefaults();
  renderBoTimelineEditor();
  renderBoCommandEditor(getSelectedBoCommand());
  updateBoCivGate(true);
  renderBoGatherRates();
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
      cost: { food: 0, wood: 50, gold: 150, stone: 0 }
    };
  } else if (cmd.type === "ageUp") {
    cmd.payload = {
      targetAge: 2,
      time: BO_AGE_UP_TIME_DEFAULTS[2] || 120,
      cost: { food: 400, wood: 0, gold: 200, stone: 0 }
    };
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

function getBoBuildStepCost(step, civ, civBonus) {
  const def = getBoBuildingDefaults(step.building) || null;
  let cost = { ...(step.cost || def?.cost || { food: 0, wood: 0, gold: 0, stone: 0 }) };
  if (step.autoCost && def?.cost) {
    cost = { ...def.cost };
    if (BO_ENGLISH_FARM_BONUS_CIVS.has(civ) && step.building === "Farm") {
      cost.wood = Math.round((cost.wood || 0) * (civBonus?.farmCostMult || BO_ENGLISH_FARM_COST_MULT));
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
  const segments = [];
  let cursor = startTime;
  let segmentIndex = 0;
  normalized.steps.forEach((step, stepIndex) => {
    const perBuildDuration = getBuildDurationSeconds(getBoBuildStepTime(step), builders);
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
        fullLabel: `${summary} · ${step.building}${repeatSuffix}`,
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

function selectBoCommand(id) {
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
}

function selectBoBuilding(building) {
  boSelectedBuilding = building;
  if (building) setBoTargetBuilding({ id: building.id, type: building.type });
  renderBoTimelineEditor();
  renderBoCommandEditor(null);
  renderBoGatherRates();
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
    const laneKey = boSelectedBuilding.id.startsWith("TC ") ? "tc" : `building:${boSelectedBuilding.id}`;
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
  if (unitName === "Villager") {
    return {
      cost: { food: 50, wood: 0, gold: 0, stone: 0 },
      time: BO_VILLAGER_TIME,
      population: 1
    };
  }
  if (unitName === "Scout") {
    return {
      cost: { food: 65, wood: 0, gold: 0, stone: 0 },
      time: 23,
      population: 1
    };
  }
  const unit = getUnitMeta(unitName);
  if (!unit) return null;
  const civs = unit.civs || [];
  const isAllowed = civ ? (civs.includes("Common") || civs.includes(civ)) : civs.includes("Common");
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
      return civs.includes("Common") || civs.includes(civ);
    })
    : base.slice();
  const list = ["Villager", "Scout", ...pool];
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
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
    const def = getBoTechDefaults(cmd.payload.techType) || null;
    if (cmd.autoTime && def?.time != null) cmd.payload.time = def.time;
    if (cmd.autoTime) {
      const techBuildingType = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
      if (techBuildingType === "Town Center") {
        const tcPct = getBoPreviewTownCenterWorkRatePct(civ);
        cmd.payload.time = applyBoWorkRateToDuration(cmd.payload.time, tcPct);
      }
    }
    if (cmd.autoCost && def?.cost) {
      cmd.payload.cost = { ...def.cost };
      if (civ === "Delhi Sultanate") {
        cmd.payload.cost = { food: 0, wood: 0, gold: 0, stone: 0 };
      } else if ((civ === "French" || civ === "Jeanne d'Arc") && def?.category === "eco") {
        const mult = civBonus.ecoTechCostMult || 0.65;
        cmd.payload.cost = {
          food: Math.round((cmd.payload.cost.food || 0) * mult),
          wood: Math.round((cmd.payload.cost.wood || 0) * mult),
          gold: Math.round((cmd.payload.cost.gold || 0) * mult),
          stone: Math.round((cmd.payload.cost.stone || 0) * mult)
        };
      }
    }
  }
  if (cmd.type === "trainUnit") {
    const def = getBoUnitDefaults(cmd.payload.unitName, civ);
    if (def) {
      if (cmd.autoTime) cmd.payload.timePerUnit = def.time;
      if (cmd.autoTime) {
        const trainingBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
        if (trainingBuilding === "Town Center") {
          const tcPct = getBoPreviewTownCenterWorkRatePct(civ);
          cmd.payload.timePerUnit = applyBoWorkRateToDuration(cmd.payload.timePerUnit, tcPct);
        }
      }
      if (cmd.autoCost) cmd.payload.cost = { ...def.cost };
    }
  }
  if (cmd.type === "autoQueue") {
    const def = getBoUnitDefaults(cmd.payload.unitName, civ);
    if (def) {
      if (cmd.autoTime) cmd.payload.timePerUnit = def.time;
      if (cmd.autoTime) {
        const trainingBuilding = cmd.payload.building || inferBoBuildingTypeFromId(cmd.payload.buildingId);
        if (trainingBuilding === "Town Center") {
          const tcPct = getBoPreviewTownCenterWorkRatePct(civ);
          cmd.payload.timePerUnit = applyBoWorkRateToDuration(cmd.payload.timePerUnit, tcPct);
        }
      }
      if (cmd.autoCost) cmd.payload.cost = { ...def.cost };
    }
  }
  if (cmd.type === "garrisonScholars") {
    if (cmd.autoTime) cmd.payload.timePerScholar = BO_SCHOLAR.time;
    if (cmd.autoCost) cmd.payload.costGold = BO_SCHOLAR.costGold;
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
      if (techBuildingType === "Town Center") {
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
      if (trainingBuilding === "Town Center") {
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
  if (cmd.type === "rally") return `Rally -> ${cmd.payload.target}`;
  if (cmd.type === "trainUnit") {
    if (cmd.payload?.repeatUntilEnd) {
      if (cmd.payload.unitName === "Villager" && cmd.payload.rallyTarget) {
        return `Repeat Villager -> ${cmd.payload.rallyTarget}`;
      }
      return `Repeat ${cmd.payload.unitName}`;
    }
    if (cmd.payload.unitName === "Villager" && cmd.payload.rallyTarget) {
      return `Train ${cmd.payload.count || 1} Villager -> ${cmd.payload.rallyTarget}`;
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
  if (cmd.timeMode === "atTime") return Math.max(0, cmd.atTime ?? 0);
  if (cmd.timeMode === "afterPrev") {
    const buildingAnchor = getBoBuildingAnchorTime(cmd, buildById);
    if (buildingAnchor !== null) return buildingAnchor;
  }
  if (cmd.afterId && plannedById.has(cmd.afterId)) return plannedById.get(cmd.afterId).end;
  return prevEnd;
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
  const buildCounts = { "Town Center": 1 };
  const buildById = new Map();
  buildById.set("TC #1", {
    buildingType: "Town Center",
    buildingId: "TC #1",
      readyAt: 0,
      sourceCommandId: BO_CAPITAL_TC_ANCHOR
  });
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
      if (name === "Farm") return;
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

function getBoBlockFamilyClass(cmd, row) {
  if (row?.laneDisabled) return "bo-family-disabled";
  if (row?.gatherSegment) return "bo-family-gather";
  if (row?.villagerMarker) return "bo-family-marker";
  if (!cmd) return "bo-family-generic";
  if (cmd.type === "assign") return "bo-family-assign";
  if (cmd.type === "buildBuilding") return "bo-family-build";
  if (cmd.type === "tech") return "bo-family-tech";
  if (cmd.type === "trainUnit") return cmd.payload?.repeatUntilEnd ? "bo-family-repeat" : "bo-family-queue";
  if (cmd.type === "autoQueue") return "bo-family-repeat";
  return "bo-family-generic";
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
      if (name !== "Farm") {
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
  const resourceLabels = {
    sheep: "Sheep",
    berries: "Berries",
    deer: "Deer",
    boar: "Boar",
    farm: "Farm",
    wood: "Wood",
    gold: "Gold",
    stone: "Stone"
  };

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
  if (hasAssign) addLane("assignments", "Assignments", { type: "assignments", blockHeight: BO_ASSIGN_BLOCK_HEIGHT });
  addLane("construction", "Construction", { type: "construction" });
  resourceOrder.forEach((res) => {
    if (usedResources.has(res)) addLane(`res:${res}`, resourceLabels[res], { type: "resource", resource: res });
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
      label: `${resourceLabels[seg.resource]} x${seg.count || 0}`,
      shortLabel: `x${seg.count || 0}`,
      fullLabel: `${resourceLabels[seg.resource]} x${seg.count || 0}`,
      displayDuration: Math.max(dur, MIN_VISUAL_SECONDS),
      gatherSegment: true
    });
  });

  const markerMap = new Map();
  villagerMarkers.forEach((marker) => {
    if (!marker || !Number.isFinite(marker.time)) return;
    const target = marker.target || "idle";
    if (target === "idle") return;
    const key = `${target}|${marker.time.toFixed(3)}`;
    const existing = markerMap.get(key) || { time: marker.time, target, count: 0 };
    existing.count += Math.max(1, marker.count || 1);
    markerMap.set(key, existing);
  });
  markerMap.forEach((marker) => {
    const laneKey = usedResources.has(marker.target) ? `res:${marker.target}` : "global";
    blocks.push({
      commandId: null,
      start: marker.time,
      end: marker.time,
      laneKey,
      label: `V+${marker.count}`,
      shortLabel: `V+${marker.count}`,
      fullLabel: `Villager -> ${resourceLabels[marker.target] || marker.target} (+${marker.count})`,
      displayDuration: MIN_VISUAL_SECONDS,
      villagerMarker: true,
      minWidthPx: 22,
      markerTime: marker.time,
      markerTarget: marker.target
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
    if (cmd.type === "trainUnit") shortLabel = cmd.payload?.repeatUntilEnd ? "Repeat" : "Queue";
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
      minWidthPx: cmd.type === "buildBuilding" || cmd.type === "trainUnit" || cmd.type === "autoQueue" ? 54 : undefined
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
    return `<div class="bo-lane-label-row" data-lane-key="${lane.key}"${resourceAttr}${buildingAttr} style="top:${top}px;height:${laneHeight}px;">${lane.label}</div>`;
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
    if (row.assignBlock) classes.push("bo-assign-block");
    if (row.laneDisabled) classes.push("bo-lane-disabled");
    if (row.gatherSegment) classes.push("bo-gather-segment");
    if (row.villagerMarker) classes.push("bo-villager-marker");
    const buildingAttrs = "";
    const markerAttrs = row.villagerMarker
      ? ` data-marker="villager" data-marker-time="${row.markerTime ?? row.start}" data-marker-target="${row.markerTarget || ""}"`
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

function getBoAnchorTime() {
  if (Number.isFinite(boPinnedTime)) return boPinnedTime;
  if (Number.isFinite(boHoverTime)) return boHoverTime;
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
    return;
  }
  const time = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = getBoSampleAtTime(time);
  const rates = sample?.rates || readBoSettings().gatherRates || {};
  let farmBuilt = sample?.farmCount;
  if (!Number.isFinite(farmBuilt)) {
    const info = estimateBoVillagerState(boSelectedCommandId);
    farmBuilt = info?.farmCount ?? 0;
  }
  const labels = [
    { key: "sheep", label: "Sheep" },
    { key: "berries", label: "Berries" },
    { key: "deer", label: "Deer" },
    { key: "boar", label: "Boar" },
    { key: "farm", label: "Farm" },
    { key: "wood", label: "Wood" },
    { key: "gold", label: "Gold" },
    { key: "stone", label: "Stone" }
  ];
  const rateHtml = labels
    .map((item) => {
      const val = Number.isFinite(rates[item.key]) ? rates[item.key] : 0;
      return `<div class="bo-gather-rate"><span>${item.label}</span><strong>${val.toFixed(3)}/s</strong></div>`;
    })
    .join("");
  bar.innerHTML = `${rateHtml}<div class="bo-gather-rate"><span>Farms built</span><strong>${Math.max(0, Math.floor(farmBuilt || 0))}</strong></div>`;

  const labelEls = document.querySelectorAll(".bo-lane-label-row[data-resource]");
  labelEls.forEach((el) => {
    const key = el.dataset.resource;
    const base = el.dataset.baseLabel || el.textContent;
    if (!key) return;
    const val = Number.isFinite(rates[key]) ? rates[key] : 0;
    el.textContent = `${base} (${val.toFixed(3)}/s)`;
  });
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

function estimateBoVillagerState(commandId) {
  const planned = buildBoPlannedCommands(boCommands);
  const buildRows = buildBoPreviewTimelineRows().filter((row) => row.buildingType);
  const targetIndex = planned.findIndex((p) => p.cmd.id === commandId);
  const time = targetIndex >= 0 ? planned[targetIndex].start : 0;
  const estimateBusyBuilders = () => planned.reduce((sum, p, idx) => {
    if (p.cmd?.type !== "buildBuilding") return sum;
    if (p.start > time || (p.start === time && idx >= targetIndex)) return sum;
    if (p.end <= time + 0.0001) return sum;
    return sum + Math.max(1, p.cmd.payload?.builders || 1);
  }, 0);
  const sample = getBoSampleAtTime(time);
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
    const farmCount = Math.max(0, sample.farmCount || 0);
    return { total, assigned, idle, busy, counts, farmCount };
  }
  const startVills = Math.max(0, parseInt(document.getElementById("boStartVills")?.value, 10) || 0);
  let total = startVills;
  let farmCount = 0;

  planned.forEach((p, idx) => {
    if (p.start > time || (p.start === time && idx >= targetIndex)) return;
    const cmd = p.cmd;
    if (!cmd || cmd.type !== "trainUnit") return;
    if ((cmd.payload.unitName || "") !== "Villager") return;
    const per = Math.max(0, cmd.payload.timePerUnit || BO_VILLAGER_TIME);
    const count = Math.max(1, Math.floor(cmd.payload.count || 1));
    for (let i = 1; i <= count; i++) {
      const doneAt = p.start + per * i;
      if (doneAt <= time + 0.0001) total += 1;
    }
  });

  buildRows.forEach((row) => {
    if (row.start > time) return;
    if (row.buildingType !== "Farm") return;
    if (row.end <= time + 0.0001) farmCount += 1;
  });

  let lastAssign = null;
  planned.forEach((p, idx) => {
    if (p.start > time || (p.start === time && idx >= targetIndex)) return;
    const cmd = p.cmd;
    if (cmd && cmd.type === "assign") lastAssign = cmd;
  });

  const counts = lastAssign?.payload || {
    berries: 0,
    deer: 0,
    boar: 0,
    sheep: 0,
    farm: 0,
    wood: 0,
    gold: 0,
    stone: 0
  };
  const busy = estimateBusyBuilders();
  const assigned = BO_RESOURCE_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const idle = Math.max(0, total - busy - assigned);

  return { total, assigned, idle, busy, counts, farmCount };
}

function estimateBoVillagerStateAtTime(time) {
  const planned = buildBoPlannedCommands(boCommands);
  const buildRows = buildBoPreviewTimelineRows().filter((row) => row.buildingType);
  const estimateBusyBuilders = () => planned.reduce((sum, p) => {
    if (p.cmd?.type !== "buildBuilding") return sum;
    if (p.start > time) return sum;
    if (p.end <= time + 0.0001) return sum;
    return sum + Math.max(1, p.cmd.payload?.builders || 1);
  }, 0);
  const sample = getBoSampleAtTime(time);
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
    const farmCount = Math.max(0, sample.farmCount || 0);
    return { total, assigned, idle, busy, counts, farmCount };
  }
  const startVills = Math.max(0, parseInt(document.getElementById("boStartVills")?.value, 10) || 0);
  let total = startVills;
  let farmCount = 0;
  planned.forEach((p) => {
    if (p.start > time) return;
    const cmd = p.cmd;
    if (cmd?.type === "trainUnit" && (cmd.payload.unitName || "") === "Villager") {
      const per = Math.max(0, cmd.payload.timePerUnit || BO_VILLAGER_TIME);
      const count = Math.max(1, Math.floor(cmd.payload.count || 1));
      for (let i = 1; i <= count; i++) {
        const doneAt = p.start + per * i;
        if (doneAt <= time + 0.0001) total += 1;
      }
    }
  });
  buildRows.forEach((row) => {
    if (row.start > time) return;
    if (row.buildingType !== "Farm") return;
    if (row.end <= time + 0.0001) farmCount += 1;
  });
  let lastAssign = null;
  planned.forEach((p) => {
    if (p.start > time) return;
    if (p.cmd?.type === "assign") lastAssign = p.cmd;
  });
  const counts = lastAssign?.payload || {
    berries: 0,
    deer: 0,
    boar: 0,
    sheep: 0,
    farm: 0,
    wood: 0,
    gold: 0,
    stone: 0
  };
  const busy = estimateBusyBuilders();
  const assigned = BO_RESOURCE_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const idle = Math.max(0, total - busy - assigned);
  return { total, assigned, idle, busy, counts, farmCount };
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

function updateAssignSummary(editor, cmd) {
  if (!editor || cmd?.type !== "assign") return;
  const summaryEl = editor.querySelector('[data-role="assignSummary"]');
  const currentEl = editor.querySelector('[data-role="assignCurrent"]');
  const info = estimateBoVillagerState(cmd.id);
  if (summaryEl) {
    summaryEl.textContent = `Assigned ${info.assigned} / Idle ${info.idle} / Busy ${info.busy || 0} / Total ${info.total} / Farms built ${info.farmCount || 0}`;
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
              <div class="col-3">
                <small class="text-muted">Time (s)</small>
                <input type="number" class="form-control form-control-sm" data-build-field="time" data-step-index="${index}" value="${step.time}" min="0" ${autoTime ? "disabled" : ""}>
              </div>
              <div class="col-2 bo-build-auto">
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
            <div class="row g-2 mt-1">
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
    ["food", "wood", "gold", "stone"].forEach((key) => {
      const input = editor.querySelector(`[data-build-field="${key}"][data-step-index="${index}"]`);
      if (input) input.disabled = autoCost;
    });
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

function renderBoCommandEditor(cmd) {
  normalizeBoCommands();
  if (cmd?.id) cmd = boCommands.find((entry) => entry.id === cmd.id) || cmd;
  const current = document.getElementById("boCommandEditor");
  if (!current) return;
  const editor = current.cloneNode(false);
  editor.id = current.id;
  current.replaceWith(editor);
  if (boSelectedBuilding) {
    renderBoBuildingPanel(editor, boSelectedBuilding);
    return;
  }
  if (!cmd) {
    editor.innerHTML = "<span class='text-muted'>Select a command in the timeline to edit.</span>";
    return;
  }
  const civ = document.getElementById("boCiv")?.value || "";
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
  const isMuslim = BO_MUSLIM_CIVS.has(civ);
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
  const baseUnitPool = getBoUnitOptions(civ);
  const isTcTarget = (cmd.type === "trainUnit")
    ? ((cmd.payload?.buildingId || "").startsWith("TC ") || cmd.payload?.building === "Town Center")
    : false;
  const unitPool = isTcTarget
    ? baseUnitPool.filter((u) => u === "Villager" || u === "Scout")
    : baseUnitPool.filter((u) => u !== "Villager" && u !== "Scout");
  const unitOptions = unitPool.map((name) => `<option value="${name}">${name}</option>`).join("");
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
    "Landmark (Age II)",
    "Landmark (Age III)",
    "Landmark (Age IV)"
  ];
  const buildingKeys = Object.keys(BO_BUILDING_DEFAULTS || {}).length ? Object.keys(BO_BUILDING_DEFAULTS || {}) : fallbackBuildings;
  const buildingOptions = buildingKeys
    .filter((name) => !(farmsDisabled && name === "Farm"))
    .map((name) => `<option value="${name}">${name}</option>`).join("");
  const fallbackTechs = ["Wheelbarrow", "Food Upgrade", "Survival Techniques", "Sanctity", "Enlistment Incentives", "Dome of the Faith"];
  const techKeys = Object.keys(BO_TECH_DEFAULTS || {}).length ? Object.keys(BO_TECH_DEFAULTS || {}) : fallbackTechs;
  const filteredTechs = isDelhi ? techKeys : techKeys.filter((name) => !delhiOnlyTechs.has(name));
  const techOptions = filteredTechs.map((name) => `<option value="${name}">${name}</option>`).join("");
  const rallyOptions = `
    <option value="sheep">Sheep</option>
    <option value="berries">Berries</option>
    <option value="deer">Deer</option>
    <option value="boar" ${isMuslim ? "disabled" : ""}>Boar</option>
    <option value="farm">Farm</option>
    <option value="wood">Wood</option>
    <option value="gold">Gold</option>
    <option value="stone">Stone</option>
    <option value="idle">Idle</option>
  `;
  const tripOverrides = cmd.payload.tripOverrides || {};
  const tripValue = (key) => (tripOverrides[key] === undefined || tripOverrides[key] === null ? "" : tripOverrides[key]);
  const showRallyFields = isTcTarget && (cmd.payload?.unitName === "Villager");

  const costInputs = (cost) => `
    <div class="row g-2 mt-2">
      <div class="col-3"><small class="text-muted">Food</small><input type="number" class="form-control form-control-sm" data-field="costFood" value="${cost.food}" min="0"></div>
      <div class="col-3"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-field="costWood" value="${cost.wood}" min="0"></div>
      <div class="col-3"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-field="costGold" value="${cost.gold}" min="0"></div>
      <div class="col-3"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-field="costStone" value="${cost.stone}" min="0"></div>
    </div>`;

  let typeFields = "";
  if (cmd.type === "assign") {
    typeFields = `
      <div class="bo-assign-summary" data-role="assignSummary"></div>
      <div class="bo-assign-current text-muted" data-role="assignCurrent"></div>
      <div class="row g-2">
        <div class="col-3"><small class="text-muted">Berries</small><input type="number" class="form-control form-control-sm" data-field="assignBerries" value="${cmd.payload.berries}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Deer</small><input type="number" class="form-control form-control-sm" data-field="assignDeer" value="${cmd.payload.deer}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Boar</small><input type="number" class="form-control form-control-sm" data-field="assignBoar" value="${cmd.payload.boar}" min="0" step="1" ${isMuslim ? "disabled" : ""}></div>
        <div class="col-3"><small class="text-muted">Sheep</small><input type="number" class="form-control form-control-sm" data-field="assignSheep" value="${cmd.payload.sheep}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Farms</small><input type="number" class="form-control form-control-sm" data-field="assignFarm" value="${cmd.payload.farm}" min="0" step="1" ${farmsDisabled ? "disabled" : ""}></div>
        <div class="col-3"><small class="text-muted">Wood</small><input type="number" class="form-control form-control-sm" data-field="assignWood" value="${cmd.payload.wood}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Gold</small><input type="number" class="form-control form-control-sm" data-field="assignGold" value="${cmd.payload.gold}" min="0" step="1"></div>
        <div class="col-3"><small class="text-muted">Stone</small><input type="number" class="form-control form-control-sm" data-field="assignStone" value="${cmd.payload.stone}" min="0" step="1"></div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-4">
          <small class="text-muted">Travel Delay (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="assignTravelDelay" value="${cmd.payload.travelDelaySec || 0}" min="0" step="0.1" title="One-time travel before this assignment starts.">
        </div>
      </div>
      <div class="mt-2">
      <small class="text-muted">Trip Overrides (s) - leave blank to keep previous values</small>
        <div class="row g-2 mt-1">
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripSheep" placeholder="Sheep" value="${tripValue("sheep")}" min="0" step="0.1" title="Override round-trip time for sheep."></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripBerries" placeholder="Berries" value="${tripValue("berries")}" min="0" step="0.1" title="Override round-trip time for berries."></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripDeer" placeholder="Deer" value="${tripValue("deer")}" min="0" step="0.1" title="Override round-trip time for deer."></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripBoar" placeholder="Boar" value="${tripValue("boar")}" min="0" step="0.1" title="Override round-trip time for boar." ${isMuslim ? "disabled" : ""}></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripFarm" placeholder="Farm" value="${tripValue("farm")}" min="0" step="0.1" title="Override round-trip time for farms." ${farmsDisabled ? "disabled" : ""}></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripWood" placeholder="Wood" value="${tripValue("wood")}" min="0" step="0.1" title="Override round-trip time for wood."></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripGold" placeholder="Gold" value="${tripValue("gold")}" min="0" step="0.1" title="Override round-trip time for gold."></div>
          <div class="col-3"><input type="number" class="form-control form-control-sm" data-field="tripStone" placeholder="Stone" value="${tripValue("stone")}" min="0" step="0.1" title="Override round-trip time for stone."></div>
        </div>
      </div>
      <small class="text-muted">Sets total assigned villagers (remaining become idle).</small>
    `;
  } else if (cmd.type === "buildBuilding") {
    typeFields = `
      <div class="row g-2">
        <div class="col-3">
          <small class="text-muted">Builders</small>
          <input type="number" class="form-control form-control-sm" data-field="buildBuilders" value="${cmd.payload.builders}" min="1" title="How many villagers build this structure.">
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-3">
          <small class="text-muted">Travel (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="buildTravelDelay" value="${cmd.payload.travelDelaySec || 0}" min="0" step="0.1" title="One-time travel before building starts.">
        </div>
        <div class="col-5">
          <small class="text-muted">Builder Source</small>
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
        <div class="col-4 d-flex align-items-end">
          <div class="bo-target-note text-muted">Queued builds run one by one with the same builders.</div>
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-12">
          <small class="text-muted">Return to</small>
          <input type="hidden" data-field="buildReturnTarget" value="${cmd.payload.returnTarget || ""}">
          <div class="bo-builder-btns bo-return-btns" role="group">
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="">Same</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="idle">Idle</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="sheep">Sheep</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="berries">Berries</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="deer">Deer</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="boar" ${isMuslim ? "disabled" : ""}>Boar</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="farm" ${farmsDisabled ? "disabled" : ""}>Farm</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="wood">Wood</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="gold">Gold</button>
            <button type="button" class="bo-builder-btn bo-return-btn" data-return="stone">Stone</button>
          </div>
        </div>
      </div>
      <div class="mt-3">
        <small class="text-muted">Build Queue</small>
        ${renderBoBuildStepFields(cmd, buildingOptions)}
      </div>
    `;
  } else if (cmd.type === "tech") {
    const techTargetInfo = cmd.payload.buildingId ? `<div class="bo-target-note text-muted">Targeted: ${cmd.payload.buildingId}</div>` : "";
    typeFields = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Tech</small>
          <select class="form-select form-select-sm" data-field="techType">${techOptions}</select>
        </div>
        <div class="col-3">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="techTime" value="${cmd.payload.time}" min="0">
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
      ${techTargetInfo}
      ${costInputs(cmd.payload.cost)}
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
  } else if (cmd.type === "rally") {
    typeFields = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Rally Target</small>
          <select class="form-select form-select-sm" data-field="rallyTarget">
            <option value="sheep">Sheep</option>
            <option value="berries">Berries</option>
            <option value="deer">Deer</option>
            <option value="boar" ${isMuslim ? "disabled" : ""}>Boar</option>
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
    const targetInfo = cmd.payload.buildingId ? `<div class="bo-target-note text-muted">Targeted: ${cmd.payload.buildingId}</div>` : "";
    const rallyFields = showRallyFields ? `
      <div class="row g-2 mt-2">
        <div class="col-4">
          <small class="text-muted">Rally Target</small>
          <select class="form-select form-select-sm" data-field="rallyTarget">${rallyOptions}</select>
        </div>
        <div class="col-4">
          <small class="text-muted">Travel delay (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="rallyTravelDelay" value="${cmd.payload.rallyTravelDelaySec || 0}" min="0" step="0.1">
        </div>
        <div class="col-4">
          <small class="text-muted">Trip override (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="rallyTripOverride" value="${cmd.payload.rallyTripOverrideSec ?? ""}" min="0" step="0.1">
        </div>
      </div>
    ` : "";
    typeFields = `
      <div class="row g-2">
        <div class="col-6">
          <small class="text-muted">Unit</small>
          <select class="form-select form-select-sm" data-field="trainUnit">${unitOptions}</select>
        </div>
        <div class="col-3" data-role="trainCountWrap">
          <small class="text-muted">Count</small>
          <input type="number" class="form-control form-control-sm" data-field="trainCount" value="${cmd.payload.count}" min="1">
        </div>
        <div class="col-3">
          <small class="text-muted">Building</small>
          <select class="form-select form-select-sm" data-field="trainBuilding">
            <option value="Barracks">Barracks</option>
            <option value="Archery Range">Archery Range</option>
            <option value="Stable">Stable</option>
            <option value="Siege Workshop">Siege Workshop</option>
            <option value="Town Center">Town Center</option>
          </select>
        </div>
      </div>
      ${targetInfo}
      ${rallyFields}
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" data-field="trainRepeatUntilEnd" id="trainRepeatUntilEnd_${cmd.id}" ${cmd.payload.repeatUntilEnd ? "checked" : ""}>
        <label class="form-check-label" for="trainRepeatUntilEnd_${cmd.id}">Repeat until sim end</label>
      </div>
      <div class="bo-target-note text-muted" data-role="trainRepeatNote" ${cmd.payload.repeatUntilEnd ? "" : "hidden"}>Keeps training whenever this building is idle and resources allow.</div>
      <div class="row g-2 mt-2">
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
  } else if (cmd.type === "sacredSite") {
    typeFields = `
      <div class="row g-2">
        <div class="col-4">
          <small class="text-muted">Sacred Sites</small>
          <input type="number" class="form-control form-control-sm" data-field="sacredCount" value="${cmd.payload.count}" min="0">
        </div>
      </div>
      <div class="bo-target-note text-muted">Requires Age III (Age II with Sanctity for Delhi).</div>
    `;
  } else if (cmd.type === "garrisonScholars") {
    typeFields = `
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
    `;
  }

  const typeOptions = [
    { value: "assign", label: "Assign Villagers" },
    { value: "buildBuilding", label: "Build Building" },
    { value: "tech", label: "Research Tech" },
    { value: "trainUnit", label: "Train Unit", includeIf: cmd.type === "trainUnit" },
    { value: "sacredSite", label: "Sacred Sites" },
    { value: "garrisonScholars", label: "Garrison Scholars", delhiOnly: true }
  ]
    .filter((opt) => (opt.includeIf ? opt.includeIf : true))
    .filter((opt) => isDelhi || !opt.delhiOnly)
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");

  editor.innerHTML = `
    <div class="bo-card-header">
      <div class="bo-card-title">Command</div>
      <button class="bo-remove-btn" data-action="remove" type="button">Remove</button>
    </div>
    <div class="row g-2 mb-2">
      <div class="col-4">
        <label class="form-label fw-bold">Type</label>
        <select class="form-select form-select-sm" data-field="type">
          ${typeOptions}
        </select>
      </div>
      <div class="col-4">
        <label class="form-label fw-bold">Timing</label>
        <select class="form-select form-select-sm" data-field="timeMode">
          <option value="afterPrev">After previous</option>
          <option value="atTime">At time</option>
        </select>
      </div>
      <div class="col-4">
        <label class="form-label fw-bold">Time (s)</label>
        <input type="number" class="form-control form-control-sm" data-field="atTime" value="${Number.isFinite(cmd.atTime) ? cmd.atTime : 0}" min="0" step="1">
      </div>
    </div>
    <div data-role="typeFields">${typeFields}</div>
  `;

  const typeEl = editor.querySelector('[data-field="type"]');
  if (typeEl) typeEl.value = cmd.type;
  const timeModeEl = editor.querySelector('[data-field="timeMode"]');
  if (timeModeEl) timeModeEl.value = cmd.timeMode;
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
    const techSel = editor.querySelector('[data-field="techType"]');
    if (techSel) techSel.value = cmd.payload.techType || "Wheelbarrow";
  }
  if (cmd.type === "rally") {
    const rally = editor.querySelector('[data-field="rallyTarget"]');
    if (rally) rally.value = cmd.payload.target || "idle";
  }
  if (cmd.type === "trainUnit") {
    const unitSel = editor.querySelector('[data-field="trainUnit"]');
    if (unitSel) unitSel.value = cmd.payload.unitName || "";
    const buildSel = editor.querySelector('[data-field="trainBuilding"]');
    if (buildSel) buildSel.value = cmd.payload.building || "Barracks";
    const rallySel = editor.querySelector('[data-field="rallyTarget"]');
    if (rallySel) rallySel.value = cmd.payload.rallyTarget || "idle";
    const repeatToggle = editor.querySelector('[data-field="trainRepeatUntilEnd"]');
    const countWrap = editor.querySelector('[data-role="trainCountWrap"]');
    const repeatNote = editor.querySelector('[data-role="trainRepeatNote"]');
    const syncRepeatUi = () => {
      const repeating = !!repeatToggle?.checked;
      if (countWrap) countWrap.hidden = repeating;
      if (repeatNote) repeatNote.hidden = !repeating;
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

  editor.addEventListener("click", (e) => {
    const action = e.target.closest("button")?.dataset.action;
    if (action === "remove") {
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
      cmd.timeMode = e.target.value;
      const hasBuildingAnchor = !!cmd.payload?.buildingId;
      if (cmd.timeMode === "atTime") {
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
    if (["buildBuilding", "techType", "trainUnit", "trainBuilding", "trainRepeatUntilEnd", "autoTime", "autoCost"].includes(field)) {
      renderBoCommandEditor(cmd);
    }
    scheduleRunBuildOrder();
  });

  editor.addEventListener("input", (e) => {
    const field = e.target.closest("[data-field]")?.dataset.field;
    const buildField = e.target.closest("[data-build-field]")?.dataset.buildField;
    if (buildField) {
      syncBoCommandFromEditor(editor, cmd);
      scheduleRunBuildOrder();
      return;
    }
    if (!field) return;
    syncBoCommandFromEditor(editor, cmd);
    scheduleRunBuildOrder();
  }, { passive: true });
}

function syncBoCommandFromEditor(editor, cmd) {
  const getVal = (field) => editor.querySelector(`[data-field="${field}"]`)?.value;
  const getNum = (field) => parseFloat(getVal(field)) || 0;
  cmd.atTime = getNum("atTime");
  cmd.timeMode = getVal("timeMode") || cmd.timeMode;
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
    const isMuslim = BO_MUSLIM_CIVS.has(civ);
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
    applyOverride("tripBoar", "boar", !isMuslim);
    applyOverride("tripFarm", "farm", !farmsDisabled);
    applyOverride("tripWood", "wood");
    applyOverride("tripGold", "gold");
    applyOverride("tripStone", "stone");
    let counts = {
      berries: getNum("assignBerries"),
      deer: getNum("assignDeer"),
      boar: isMuslim ? 0 : getNum("assignBoar"),
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
    cmd.payload = {
      techType: getVal("techType") || "Wheelbarrow",
      time: getNum("techTime"),
      cost: {
        food: getNum("costFood"),
        wood: getNum("costWood"),
        gold: getNum("costGold"),
        stone: getNum("costStone")
      },
      building: cmd.payload.building || null,
      buildingId: cmd.payload.buildingId || null
    };
    applyAutoDefaultsForCommand(cmd, document.getElementById("boCiv")?.value || "");
  } else if (cmd.type === "rally") {
    const civ = document.getElementById("boCiv")?.value || "";
    const isMuslim = BO_MUSLIM_CIVS.has(civ);
    const target = getVal("rallyTarget") || "idle";
    const tripRaw = editor.querySelector('[data-field="rallyTripOverride"]')?.value;
    const tripOverride = tripRaw === "" || tripRaw === null || tripRaw === undefined ? null : parseFloat(tripRaw);
    cmd.payload = {
      target: isMuslim && target === "boar" ? "idle" : target,
      travelDelaySec: Math.max(0, getNum("rallyTravelDelay")),
      tripOverrideSec: Number.isFinite(tripOverride) ? Math.max(0, tripOverride) : null
    };
  } else if (cmd.type === "trainUnit") {
    updateAuto();
    const selectedBuilding = getVal("trainBuilding") || cmd.payload.building || "Barracks";
    const unitName = getVal("trainUnit") || cmd.payload.unitName;
    const repeatUntilEnd = !!editor.querySelector('[data-field="trainRepeatUntilEnd"]')?.checked;
    const rallyTarget = editor.querySelector('[data-field="rallyTarget"]')?.value;
    const rallyTravelDelay = parseFloat(editor.querySelector('[data-field="rallyTravelDelay"]')?.value);
    const tripRaw = editor.querySelector('[data-field="rallyTripOverride"]')?.value;
    const tripOverride = tripRaw === "" || tripRaw === null || tripRaw === undefined ? null : parseFloat(tripRaw);
    const rallyPayload = (selectedBuilding === "Town Center" && unitName === "Villager") ? {
      rallyTarget: rallyTarget || "idle",
      rallyTravelDelaySec: Math.max(0, Number.isFinite(rallyTravelDelay) ? rallyTravelDelay : 0),
      rallyTripOverrideSec: Number.isFinite(tripOverride) ? Math.max(0, tripOverride) : null
    } : {
      rallyTarget: null,
      rallyTravelDelaySec: 0,
      rallyTripOverrideSec: null
    };
    cmd.payload = {
      unitName,
      building: selectedBuilding,
      count: Math.max(1, Math.floor(getNum("trainCount") || 1)),
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
  const isDelhi = civ === "Delhi Sultanate";
  const isMuslim = BO_MUSLIM_CIVS.has(civ);
  const delhiOnlyTechs = new Set(["Sanctity", "Dome of the Faith"]);
  const isProduction = BO_PRODUCTION_BUILDINGS.has(building.type);
  const isTech = BO_TECH_BUILDINGS.has(building.type);
  const isTownCenter = building.type === "Town Center";
  const readyAt = Number.isFinite(building.readyAt) ? formatTimeMMSS(building.readyAt) : "0:00";

  const unitPool = getBoUnitOptions(civ).filter((u) => {
    if (isTownCenter) return u === "Villager" || u === "Scout";
    return u !== "Villager" && u !== "Scout";
  });
  const unitOptions = unitPool.map((name) => `<option value="${name}">${name}</option>`).join("");

  const fallbackTechs = ["Wheelbarrow", "Food Upgrade", "Survival Techniques", "Sanctity", "Enlistment Incentives", "Dome of the Faith"];
  const techKeys = Object.keys(BO_TECH_DEFAULTS || {}).length ? Object.keys(BO_TECH_DEFAULTS || {}) : fallbackTechs;
  const filteredTechs = isDelhi ? techKeys : techKeys.filter((name) => !delhiOnlyTechs.has(name));
  const techOptions = filteredTechs.map((name) => `<option value="${name}">${name}</option>`).join("");

  const rallyOptions = `
    <option value="sheep">Sheep</option>
    <option value="berries">Berries</option>
    <option value="deer">Deer</option>
    <option value="boar" ${isMuslim ? "disabled" : ""}>Boar</option>
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
        <div class="col-4">
          <small class="text-muted">Travel delay (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="queueRallyTravel" value="0" min="0" step="0.1">
        </div>
        <div class="col-4">
          <small class="text-muted">Trip override (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="queueRallyTrip" value="" min="0" step="0.1">
        </div>
      </div>
  ` : "";
  const queueBlock = isProduction ? `
    <div class="bo-action-block">
      <div class="bo-action-title">Queue Unit</div>
      <div class="row g-2 align-items-end">
        <div class="col-5">
          <small class="text-muted">Unit</small>
          <select class="form-select form-select-sm" data-field="queueUnit">${unitOptions}</select>
        </div>
        <div class="col-3" data-role="queueCountWrap">
          <small class="text-muted">Count</small>
          <input type="number" class="form-control form-control-sm" data-field="queueCount" value="1" min="1" title="How many units to queue.">
        </div>
        <div class="col-4">
          <small class="text-muted">Timing</small>
          <select class="form-select form-select-sm" data-field="queueTimeMode">
            <option value="afterPrev">After previous</option>
            <option value="atTime">At time</option>
          </select>
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-4">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="queueAtTime" value="0" min="0" step="1" title="Start time if using 'At time'.">
        </div>
        <div class="col-8 d-flex align-items-end justify-content-end">
          <button class="btn btn-outline-secondary btn-sm" type="button" data-action="queueUnit">Add Queue</button>
        </div>
      </div>
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" data-field="queueRepeatUntilEnd" id="queueRepeat_${building.id.replace(/[^a-zA-Z0-9]/g, "_")}">
        <label class="form-check-label" for="queueRepeat_${building.id.replace(/[^a-zA-Z0-9]/g, "_")}">Repeat until sim end</label>
      </div>
      <div class="bo-target-note text-muted" data-role="queueRepeatNote" hidden>Uses this building continuously until the sim ends or a newer repeat queue replaces it.</div>
      ${queueRallyFields}
      <div class="bo-target-note text-muted">After previous anchors to this building's completion.</div>
    </div>
  ` : "";
  const rallyHint = isTownCenter
    ? `<div class="bo-target-note text-muted">Tip: click a V+ marker on the resource lane to reassign from that time.</div>`
    : "";

  const techBlock = isTech ? `
    <div class="bo-action-block">
      <div class="bo-action-title">Research Tech</div>
      <div class="row g-2 align-items-end">
        <div class="col-6">
          <small class="text-muted">Tech</small>
          <select class="form-select form-select-sm" data-field="techSelect">${techOptions}</select>
        </div>
        <div class="col-3">
          <small class="text-muted">Timing</small>
          <select class="form-select form-select-sm" data-field="techTimeMode">
            <option value="afterPrev">After previous</option>
            <option value="atTime">At time</option>
          </select>
        </div>
        <div class="col-3">
          <small class="text-muted">Time (s)</small>
          <input type="number" class="form-control form-control-sm" data-field="techAtTime" value="0" min="0" step="1" title="Start time if using 'At time'.">
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-12 d-flex justify-content-end">
          <button class="btn btn-outline-secondary btn-sm" type="button" data-action="queueTech">Add Research</button>
        </div>
      </div>
    </div>
  ` : "";

  const emptyBlock = (!isProduction && !isTech && !isTownCenter)
    ? `<div class="text-muted">No actions available for this building.</div>`
    : "";

  editor.innerHTML = `
    <div class="bo-card-header">
      <div class="bo-card-title">Building Actions</div>
    </div>
    <div class="bo-building-meta"><strong>Selected:</strong> ${building.type} - ${building.id} <span class="text-muted">Ready ${readyAt}</span></div>
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

  const queueRepeatToggle = editor.querySelector('[data-field="queueRepeatUntilEnd"]');
  const queueCountWrap = editor.querySelector('[data-role="queueCountWrap"]');
  const queueRepeatNote = editor.querySelector('[data-role="queueRepeatNote"]');
  const syncQueueRepeatUi = () => {
    const repeating = !!queueRepeatToggle?.checked;
    if (queueCountWrap) queueCountWrap.hidden = repeating;
    if (queueRepeatNote) queueRepeatNote.hidden = !repeating;
  };
  syncQueueRepeatUi();
  queueRepeatToggle?.addEventListener("change", syncQueueRepeatUi);

  const anchorId = building.sourceCommandId || null;

  const applyTimingToCommand = (cmd, mode, atTime) => {
    cmd.timeMode = mode;
    if (mode === "atTime") {
      cmd.atTime = Math.max(0, atTime || 0);
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
    const count = Math.max(1, parseInt(editor.querySelector('[data-field="queueCount"]')?.value, 10) || 1);
    const repeatUntilEnd = !!editor.querySelector('[data-field="queueRepeatUntilEnd"]')?.checked;
    const mode = editor.querySelector('[data-field="queueTimeMode"]')?.value || "afterPrev";
    const atTime = parseFloat(editor.querySelector('[data-field="queueAtTime"]')?.value) || 0;
    const rallyTarget = editor.querySelector('[data-field="queueRallyTarget"]')?.value || "idle";
    const rallyTravel = parseFloat(editor.querySelector('[data-field="queueRallyTravel"]')?.value);
    const tripRaw = editor.querySelector('[data-field="queueRallyTrip"]')?.value;
    const tripOverride = tripRaw === "" || tripRaw === null || tripRaw === undefined ? null : parseFloat(tripRaw);
    const cmd = addBoCommand("trainUnit", mode === "afterPrev" ? anchorId : null);
    cmd.payload.building = building.type;
    cmd.payload.buildingId = building.id;
    cmd.payload.unitName = unitName;
    cmd.payload.count = count;
    cmd.payload.repeatUntilEnd = repeatUntilEnd;
    if (isTownCenter && unitName === "Villager") {
      cmd.payload.rallyTarget = rallyTarget || "idle";
      cmd.payload.rallyTravelDelaySec = Math.max(0, Number.isFinite(rallyTravel) ? rallyTravel : 0);
      cmd.payload.rallyTripOverrideSec = Number.isFinite(tripOverride) ? Math.max(0, tripOverride) : null;
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
      cmd.timeMode = e.target.value;
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
  cmd.timeMode = getVal("timeMode") || cmd.timeMode;
  cmd.atTime = getNum("atTime");
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

function readBoSettings() {
  const getNum = (id, def = 0) => parseFloat(document.getElementById(id)?.value) || def;
  const start = BO_STARTING?.resources || {};
  const civ = document.getElementById("boCiv")?.value || "";
  const boarRestricted = BO_BOAR_RESTRICTED_CIVS.has(civ);
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
      sheep: 0,
      berries: 0,
      deer: 0,
      boar: 0,
      farm: 0,
      wood: 0,
      gold: 0,
      stone: 0
    },
    bonusData: {
      civBonuses: BO_CIV_BONUSES,
      muslimCivs: BO_MUSLIM_CIVS,
      muslimBerryBonus: BO_MUSLIM_BERRY_BONUS,
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
  const muslimCiv = bonusData.muslimCivs ? bonusData.muslimCivs.has(civ) : BO_MUSLIM_CIVS.has(civ);
  const muslimBerryBonus = bonusData.muslimBerryBonus || BO_MUSLIM_BERRY_BONUS;
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
  let berryCapacityBonusApplied = false;
  const held = { sheep: 0, berries: 0, deer: 0, boar: 0, farm: 0, wood: 0, gold: 0, stone: 0 };
  let tripOverrides = {};
  const buildingCounts = {
    "Town Center": 1,
    "Mill": 0,
    "Lumber Camp": 0,
    "Mining Camp": 0,
    "Barracks": 0,
    "Archery Range": 0,
    "Stable": 0,
    "Keep": 0,
    "Mosque": 0,
    "Farm": 0,
    "Pasture": 0,
    "Ger": 0,
    "Ovoo": 0
  };
  const productionQueues = {
    "Town Center": [{ id: "TC #1", busyUntil: 0 }],
    "Barracks": [],
    "Archery Range": [],
    "Stable": [],
    "Siege Workshop": []
  };
  const buildingInstances = {};
  Object.keys(buildingCounts).forEach((name) => {
    buildingInstances[name] = name === "Town Center" ? ["TC #1"] : [];
  });
  let farmCount = 0;
  let pastureCount = 0;
  let ovooCount = 0;
  let gerCount = 0;
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
  const buildQueues = [];
  const nextDropoff = {};

  function pushSample(t, res) {
    const rounded = Math.round(t * 1000) / 1000;
    const existing = samples.find((s) => Math.abs(s.time - rounded) < 0.0005);
    const rateSnapshot = {};
    BO_RESOURCE_KEYS.forEach((key) => {
      rateSnapshot[key] = gatherRate(key);
    });
    const payload = {
      time: rounded,
      food: res.food,
      wood: res.wood,
      gold: res.gold,
      stone: res.stone,
      oliveOil: res.oliveOil,
      silver: res.silver,
      rates: rateSnapshot,
      farmCount,
      villagers,
      assignments: { ...assignments }
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
    if (cmd.type === "buildBuilding") return "Construction";
    if (cmd.type === "tech") return "Tech";
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

  pushSample(0, resources);
  syncGatherSegments(0);
  rescheduleAllDropoffs(0);

  function foodMult() {
    return Math.pow(config.techEffects.foodUpgradeMult || 1, foodTechLevel);
  }

  function isFood(res) {
    return ["sheep", "berries", "deer", "boar", "farm"].includes(res);
  }

  function dropoffAvailable(res) {
    if (buildingCounts["Town Center"] > 0) return true;
    if (gerCount > 0) return true;
    if (isFood(res)) return buildingCounts["Mill"] > 0;
    if (res === "wood") return buildingCounts["Lumber Camp"] > 0;
    if (res === "gold" || res === "stone") return buildingCounts["Mining Camp"] > 0;
    return false;
  }

  function effectiveCarry(res) {
    let base = config.carry[res] || 0;
    if (res === "berries" && muslimCiv && (buildingCounts["Mill"] || 0) > 0) {
      base += muslimBerryBonus.carryBonus || 0;
    }
    if (wheelbarrowActive) base += (config.techEffects.wheelCarryBonus || BO_WHEEL_CARRY_BONUS);
    return base;
  }

  function effectiveTrip(res) {
    const override = tripOverrides[res];
    const base = Number.isFinite(override) ? override : (config.trip[res] || 0);
    return base * (wheelbarrowActive ? (config.techEffects.wheelTripMult || BO_WHEEL_TRIP_MULT) : 1);
  }

  function gatherRate(res) {
    const base = config.gatherRates[res] || 0;
    let rate = isFood(res) ? base * foodMult() : base;
    if (res === "farm" && (buildingCounts["Mill"] || 0) > 0 && BO_ENGLISH_FARM_BONUS_CIVS.has(civ)) {
      const pct = (civBonus.farmBonusByAge || BO_ENGLISH_FARM_BONUS_BY_AGE)[age] || 0;
      rate *= 1 + pct / 100;
    }
    if (res === "berries" && muslimCiv && (buildingCounts["Mill"] || 0) > 0) {
      rate *= 1 + (muslimBerryBonus.gatherBonusPct || 0) / 100;
    }
    if ((res === "deer" || res === "boar") && survivalTechActive) {
      rate *= 1.15;
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
    const perVill = carry / (carry / rate + trip);
    return perVill * vills;
  }

  function assignedCount(res) {
    return (res === "farm")
      ? Math.min(assignments.farm || 0, farmCount)
      : (assignments[res] || 0);
  }

  function scheduleDropoff(res, now) {
    const vills = assignedCount(res);
    if (vills <= 0) {
      nextDropoff[res] = null;
      return;
    }
    if (!dropoffAvailable(res)) {
      nextDropoff[res] = null;
      return;
    }
    if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) {
      nextDropoff[res] = null;
      return;
    }
    const rate = gatherRate(res);
    if (rate <= 0) {
      nextDropoff[res] = null;
      return;
    }
    const carry = effectiveCarry(res);
    if (carry <= 0) {
      nextDropoff[res] = null;
      return;
    }
    const gatherTime = carry / rate;
    const trip = effectiveTrip(res);
    const first = now + gatherTime + trip;
    const interval = gatherTime + (2 * trip);
    nextDropoff[res] = { time: first, interval };
  }

  function rescheduleAllDropoffs(now) {
    BO_RESOURCE_KEYS.forEach((res) => scheduleDropoff(res, now));
  }

  function nextDropoffTime() {
    let soonest = null;
    let resource = null;
    Object.entries(nextDropoff).forEach(([res, entry]) => {
      if (!entry || !Number.isFinite(entry.time)) return;
      if (soonest === null || entry.time < soonest) {
        soonest = entry.time;
        resource = res;
      }
    });
    if (soonest === null) return null;
    return { time: soonest, res: resource };
  }

  function processDropoff(res, now) {
    const entry = nextDropoff[res];
    if (!entry) return;
    const vills = assignedCount(res);
    if (vills <= 0 || !dropoffAvailable(res) || gatherRate(res) <= 0) {
      nextDropoff[res] = null;
      return;
    }
    const carry = effectiveCarry(res);
    let gain = carry * vills;
    if (gain <= 0) {
      nextDropoff[res] = null;
      return;
    }
    if (BO_FINITE_FOOD_SOURCES.includes(res)) {
      const remaining = foodRemaining[res] || 0;
      gain = Math.min(gain, remaining);
      foodRemaining[res] = Math.max(0, remaining - gain);
    }
    if (gain > 0) {
      if (isFood(res)) resources.food += gain;
      else resources[res] += gain;
      addGathered(isFood(res) ? "food" : res, gain);
      pushSample(now, resources);
    }
    if (BO_FINITE_FOOD_SOURCES.includes(res) && (foodRemaining[res] || 0) <= 0) {
      const label = res.charAt(0).toUpperCase() + res.slice(1);
      pushEvent(`${label} depleted`, "", "Assignments");
      syncGatherSegments(now);
      nextDropoff[res] = null;
      return;
    }
    scheduleDropoff(res, now);
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
      foodRemaining.sheep += pastureCount * perSec * dt;
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
    if (target === "boar" && muslimCiv) valid = false;
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
      techComplete: 1,
      scholarComplete: 2,
      builder: 3,
      trainVill: 4,
      rallyDelay: 5,
      assignDelay: 6
    };
    const releasing = busy
      .filter((b) => b.endTime <= endTime + 0.0001)
      .sort((a, b) => (priority[a.kind] ?? 99) - (priority[b.kind] ?? 99));
    if (releasing.length === 0) return;
    releasing.forEach((b) => {
      if (b.kind === "buildComplete") {
        const name = b.buildingName;
        buildingCounts[name] = (buildingCounts[name] || 0) + 1;
        if (name === "Farm") farmCount += 1;
        const instanceId = name === "Town Center"
          ? `TC #${buildingCounts[name]}`
          : `${name} #${buildingCounts[name]}`;
        if (name !== "Farm") {
          if (!buildingInstances[name]) buildingInstances[name] = [];
          buildingInstances[name].push(instanceId);
        }
        if (name === "Pasture") pastureCount += 1;
        if (name === "Ger") gerCount += 1;
        if (name === "Ovoo") ovooCount += 1;
        const landmarkAge = getLandmarkTargetAge(name);
        if (landmarkAge && age < landmarkAge) {
          age = landmarkAge;
          milestones[`Age ${age} complete`] = endTime;
        }
        if (name === "Mill" && muslimCiv && !berryCapacityBonusApplied) {
          const bonus = (muslimBerryBonus.capacityBonusPerNode || 0) * (foodNodes.berries?.count || 0);
          if (bonus > 0) {
            foodRemaining.berries += bonus;
            berryCapacityBonusApplied = true;
          }
        }
        if (name === "Barracks" || name === "Archery Range" || name === "Stable" || name === "Siege Workshop" || name === "Town Center") {
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
      } else if (b.kind === "techComplete") {
        if (b.techType === "Wheelbarrow") wheelbarrowActive = true;
        if (b.techType === "Food Upgrade") foodTechLevel += 1;
        if (b.techType === "Survival Techniques") survivalTechActive = true;
        if (b.techType === "Sanctity") sanctityActive = true;
        if (b.techType === "Enlistment Incentives") enlistmentActive = true;
        if (b.techType === "Dome of the Faith") domeActive = true;
        if (b.milestoneLabel) milestones[b.milestoneLabel] = endTime;
      } else if (b.kind === "scholarComplete") {
        scholarGarrison = Math.max(0, b.count || 0);
      } else if (b.kind === "builder") {
        returnBuildersToTarget(b.source, b.count, b.returnTarget);
      } else if (b.kind === "trainVill") {
        villagers += 1;
        const rally = b.rallyTarget || "idle";
        if (Number.isFinite(b.rallyTripOverrideSec) && BO_RESOURCE_KEYS.includes(rally)) {
          tripOverrides[rally] = Math.max(0, b.rallyTripOverrideSec);
        }
        const travelDelay = Math.max(0, b.rallyTravelDelaySec || 0);
        if (rally !== "idle" && assignments[rally] !== undefined && travelDelay > 0) {
          assignments.idle += 1;
          busy.push({ endTime: endTime + travelDelay, kind: "rallyDelay", target: rally, count: 1, tripOverrideSec: b.rallyTripOverrideSec });
        } else if (assignments[rally] !== undefined) {
          assignments[rally] += 1;
        } else {
          assignments.idle += 1;
        }
        if (!(rally !== "idle" && assignments[rally] !== undefined && travelDelay > 0)) {
          villagerMarkers.push({ time: endTime, target: rally, count: 1 });
        }
        rescheduleAllDropoffs(endTime);
        pushEvent("Villager complete", "", b.tcId || "TC #1");
      } else if (b.kind === "rallyDelay") {
        const target = b.target || "idle";
        const count = Math.max(1, b.count || 1);
        if (Number.isFinite(b.tripOverrideSec) && BO_RESOURCE_KEYS.includes(target)) {
          tripOverrides[target] = Math.max(0, b.tripOverrideSec);
        }
        if (assignments[target] !== undefined) assignments[target] += count;
        else assignments.idle += count;
        villagerMarkers.push({ time: endTime, target, count });
        rescheduleAllDropoffs(endTime);
      } else if (b.kind === "assignDelay") {
        const notes = [];
        applyAssignment(b.desired, notes, b.overrides);
      }
    });
    for (let i = busy.length - 1; i >= 0; i--) {
      if (busy[i].endTime <= endTime + 0.0001) busy.splice(i, 1);
    }
    rescheduleAllDropoffs(endTime);
    syncGatherSegments(endTime);
    tryStartBuildQueues();
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

  function advanceTo(targetTime) {
    while (time < targetTime) {
      const nextBusy = nextBusyTime();
      const nextDrop = nextDropoffTime();
      const nextBuild = nextBuildQueueStartTime();
      const nextAuto = nextAutoQueueStartTime();
      let next = targetTime;
      if (nextBusy !== null && nextBusy < next) next = nextBusy;
      if (nextDrop !== null && nextDrop.time < next) next = nextDrop.time;
      if (nextBuild !== null && nextBuild < next) next = nextBuild;
      if (nextAuto !== null && nextAuto < next) next = nextAuto;

      applyIncome(next - time);
      time = next;

      if (nextBusy !== null && Math.abs(time - nextBusy) < 0.0001) {
        releaseBusy(time);
      }
      if (nextDrop !== null && Math.abs(time - nextDrop.time) < 0.0001) {
        const due = Object.entries(nextDropoff)
          .filter(([_, entry]) => entry && Math.abs(entry.time - time) < 0.0001)
          .map(([res]) => res);
        due.forEach((res) => processDropoff(res, time));
      }
      tryStartBuildQueues();
      tryStartAutoQueues();
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
    return {
      food: depositRate("sheep") + depositRate("berries") + depositRate("deer") + depositRate("boar") + depositRate("farm"),
      wood: depositRate("wood"),
      gold: depositRate("gold") + farmGoldRate + sacredGoldRate,
      stone: depositRate("stone") + ovooStoneRate
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
    if (muslimCiv && next.boar > 0) {
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
    rescheduleAllDropoffs(time);
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
    rescheduleAllDropoffs(time);

    return { used: count - remaining, entries };
  }

  function depositHeldIfAvailable(res) {
    if (!dropoffAvailable(res)) return;
    if (held[res] > 0) {
      if (isFood(res)) resources.food += held[res];
      else resources[res] += held[res];
      addGathered(isFood(res) ? "food" : res, held[res]);
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

  function getUnitProductionSpec(unitName, buildingType, count = 1) {
    const unitDef = getBoUnitDefaults(unitName, civ);
    const baseCost = unitDef?.cost || { food: 0, wood: 0, gold: 0, stone: 0 };
    const baseTime = unitDef?.time || 0;
    let cost = {
      food: (baseCost.food || 0) * count,
      wood: (baseCost.wood || 0) * count,
      gold: (baseCost.gold || 0) * count,
      stone: (baseCost.stone || 0) * count
    };
    let timePerUnit = baseTime;
    if (civ === "Mongols" && /horseman/i.test(unitName)) {
      timePerUnit *= civBonus.horsemenTrainTimeMult || 0.75;
    }
    if (buildingType === "Town Center") {
      const tcWorkRatePct = getBoAgeBonusValue(civBonus.townCenterWorkRateByAge, age);
      timePerUnit = applyBoWorkRateToDuration(timePerUnit, tcWorkRatePct);
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

  function nextBuildQueueStartTime() {
    if (!buildQueues.length) return null;
    let soonest = null;
    buildQueues.forEach((queue) => {
      if (!queue || queue.done || queue.active) return;
      const step = queue.steps?.[queue.nextIndex];
      if (!step) return;
      if ((step.minAge || 1) > age) return;
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
      const isTc = buildingType === "Town Center";
      if (isTc && !(unitName === "Villager" || unitName === "Scout")) return;
      if (!isTc && (unitName === "Villager" || unitName === "Scout")) return;
      const windowStart = Math.max(time, aq.startTime || 0);
      if (windowStart >= aq.endTime) return;
      const queueReady = Math.max(windowStart, queue.busyUntil || 0);
      if (queueReady >= aq.endTime) return;
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
      if (buildingType === "Town Center" && !(cmd.payload.unitName === "Villager" || cmd.payload.unitName === "Scout")) return;
      if (buildingType !== "Town Center" && (cmd.payload.unitName === "Villager" || cmd.payload.unitName === "Scout")) return;
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
      }
      const rallyLabel = unitName === "Villager" ? (cmd.payload.rallyTarget || "idle") : null;
      timeline.push({
        start,
        end: start,
        action: rallyLabel ? `Repeat Villager -> ${rallyLabel}` : `Repeat ${unitName}`,
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

  const plannedCommands = buildBoPlannedCommands(commands)
    .slice()
    .sort((a, b) => (a.start - b.start) || (a.idx - b.idx));
  plannedCommands.forEach(({ cmd, start: plannedStart, end: plannedEnd }) => {
    const earliest = plannedStart;
    if (time < earliest) advanceTo(earliest);

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
      const travelDelay = Math.max(0, cmd.payload.travelDelaySec || 0);
      if (travelDelay > 0) {
        actionLabel = assignmentLabelFromCounts(desired);
        const start = time;
        const end = time + travelDelay;
        notes.push(`Travel ${travelDelay}s`);
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
    } else if (cmd.type === "buildBuilding") {
      const buildSteps = getBoBuildSteps(cmd.payload);
      const buildingName = buildSteps[0]?.building || "Building";
      const def = getBoBuildingDefaults(buildingName) || {};
      let minAge = def.minAge || 1;
      if (civ === "Mongols" && buildingName === "Stable") minAge = 1;
      const blockedFarm = buildSteps.find((step) => civBonus.farmsDisabled && step.building === "Farm");
      if (blockedFarm) {
        warnings.push(`Blocked: Build ${blockedFarm.building} (farms disabled)`);
        pushEvent(`Build ${blockedFarm.building}`, "Blocked (farms disabled)", laneFor(cmd), cmd.id);
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
        if (techBuildingType === "Town Center") {
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
    } else if (cmd.type === "rally") {
      actionLabel = `Set Rally -> ${cmd.payload.target}`;
    } else if (cmd.type === "trainUnit") {
      const unitName = cmd.payload.unitName;
      const repeating = !!cmd.payload.repeatUntilEnd;
      const count = repeating ? 1 : Math.max(1, cmd.payload.count || 1);
      const buildingType = cmd.payload.building || "Barracks";
      const buildingId = cmd.payload.buildingId || null;
      if (!buildingId) {
        warnings.push(`Blocked: Train ${unitName} (select a building)`);
        pushEvent(`Train ${unitName}`, "Blocked (select a building)", laneFor(cmd), cmd.id);
        return;
      }
      const isTc = buildingType === "Town Center";
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
          actionLabel = `Repeat Villager -> ${rallyLabel}`;
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
          actionLabel = `Train ${count} Villager -> ${rallyLabel}`;
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
        actionLabel = `Repeat Villager -> ${rallyLabel}`;
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
      if (!buildingId) {
        warnings.push(`Blocked: ${actionLabel} (select a building)`);
        pushEvent(actionLabel, "Blocked (select a building)", laneFor(cmd), cmd.id);
        return;
      }
      const isTc = buildingType === "Town Center";
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
      const millTechs = new Set(["Wheelbarrow", "Food Upgrade", "Survival Techniques"]);
      const targetBuildingType = cmd.payload.building || (millTechs.has(techType) ? "Mill" : null);
      const targetBuildingId = cmd.payload.buildingId || null;
      if (targetBuildingType || targetBuildingId) {
        const ok = waitForBuildingAvailable(targetBuildingType, targetBuildingId, actionLabel, notes);
        if (!ok) {
          warnings.push(`Blocked: ${actionLabel} (missing ${targetBuildingId || targetBuildingType})`);
          pushEvent(actionLabel, `Blocked (missing ${targetBuildingId || targetBuildingType})`, laneFor(cmd), cmd.id);
          return;
        }
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
      if (cmd.payload.unitName === "Villager" && buildingType !== "Town Center") {
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
      if (queuedBuilding && queuedBuilding.busyUntil > time) {
        advanceTo(queuedBuilding.busyUntil);
        notes.push("Delayed (queue)");
      }
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
      const travelDelay = Math.max(0, cmd.payload.travelDelaySec || 0);
      const queueSteps = [];
      let segmentIndex = 0;
      getBoBuildSteps(cmd.payload).forEach((step) => {
        const stepDef = getBoBuildingDefaults(step.building) || {};
        let minAge = stepDef.minAge || 1;
        if (civ === "Mongols" && step.building === "Stable") minAge = 1;
        const baseDuration = getBuildDurationSeconds(getBoBuildStepTime(step), requestedBuilders);
        let durationPerBuilding = baseDuration;
        if (civ === "Jeanne d'Arc") {
          let mult = 1;
          if (age === 1 && civBonus.darkAgeBuildSpeedMult) mult *= civBonus.darkAgeBuildSpeedMult;
          if (mult > 1) durationPerBuilding = durationPerBuilding / mult;
        }
        const costForStep = getBoBuildStepCost(step, civ, civBonus);
        for (let i = 0; i < Math.max(1, step.count || 1); i++) {
          const stepSuffix = Math.max(1, step.count || 1) > 1 ? ` (${i + 1}/${Math.max(1, step.count || 1)})` : "";
          queueSteps.push({
            buildingName: step.building,
            cost: { ...costForStep },
            duration: durationPerBuilding + (segmentIndex === 0 ? travelDelay : 0),
            notes: segmentIndex === 0 && travelDelay > 0 ? `Travel ${travelDelay}s` : "",
            fullLabel: `${queueSummary} · ${step.building}${stepSuffix}`,
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
      const rallyDelay = Math.max(0, cmd.payload.rallyTravelDelaySec || 0);
      const rallyTrip = Number.isFinite(cmd.payload.rallyTripOverrideSec) ? cmd.payload.rallyTripOverrideSec : null;
      for (let i = 1; i <= count; i++) {
        busy.push({
          endTime: start + perUnit * i,
          kind: "trainVill",
          rallyTarget,
          rallyTravelDelaySec: rallyDelay,
          rallyTripOverrideSec: rallyTrip,
          tcId: queuedBuilding.id
        });
      }
    }

    if (cmd.type === "ageUp") {
      tcBusyUntil = Math.max(tcBusyUntil, end);
      const queue = (productionQueues["Town Center"] || []).find((q) => q.id === "TC #1");
      if (queue) queue.busyUntil = Math.max(queue.busyUntil, end);
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

function getBoMetrics(results) {
  const samples = results?.samples || [];
  const simEnd = Math.max(1, results?.simEnd || 1);
  const gathered = results?.gatheredTotals || { food: 0, wood: 0, gold: 0, stone: 0, oliveOil: 0, silver: 0 };
  return {
    gathered,
    perMin: {
      food: (gathered.food || 0) * 60 / simEnd,
      wood: (gathered.wood || 0) * 60 / simEnd,
      gold: (gathered.gold || 0) * 60 / simEnd,
      stone: (gathered.stone || 0) * 60 / simEnd
    },
    afford: {
      age2: getBoEarliestAffordTime(samples, { food: 400, wood: 0, gold: 200, stone: 0 }),
      age3: getBoEarliestAffordTime(samples, { food: 1200, wood: 0, gold: 600, stone: 0 }),
      age4: getBoEarliestAffordTime(samples, { food: 2400, wood: 0, gold: 1200, stone: 0 })
    }
  };
}

function getBoCurrentRatesAtTime(results, timeOverride = null) {
  const time = Number.isFinite(timeOverride) ? timeOverride : getBoAnchorTime();
  const sample = results ? getBoSampleAtTime(time) : null;
  const fallbackRates = readBoSettings().gatherRates || {};
  const rates = sample?.rates || fallbackRates;
  return {
    time,
    rates: {
      food: 0,
      wood: Number.isFinite(rates.wood) ? rates.wood : 0,
      gold: Number.isFinite(rates.gold) ? rates.gold : 0,
      stone: Number.isFinite(rates.stone) ? rates.stone : 0,
      sheep: Number.isFinite(rates.sheep) ? rates.sheep : 0,
      berries: Number.isFinite(rates.berries) ? rates.berries : 0,
      deer: Number.isFinite(rates.deer) ? rates.deer : 0,
      boar: Number.isFinite(rates.boar) ? rates.boar : 0,
      farm: Number.isFinite(rates.farm) ? rates.farm : 0
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
  if (boSelectedCommandId) {
    return { label: `Selected command ${formatTimeMMSS(time)}`, clearable: false };
  }
  return { label: `Timeline start ${formatTimeMMSS(time)}`, clearable: false };
}

function renderBoSummary(results, timeOverride = null) {
  const summary = document.getElementById("boSummary");
  if (!summary || !results) return;
  const milestoneEntries = Object.entries(results.milestones || {});
  const metrics = getBoMetrics(results);
  const currentRateInfo = getBoCurrentRatesAtTime(results, timeOverride);
  const currentRateRows = [
    ["Sheep", currentRateInfo.rates.sheep],
    ["Berries", currentRateInfo.rates.berries],
    ["Deer", currentRateInfo.rates.deer],
    ["Boar", currentRateInfo.rates.boar],
    ["Farm", currentRateInfo.rates.farm],
    ["Wood", currentRateInfo.rates.wood],
    ["Gold", currentRateInfo.rates.gold],
    ["Stone", currentRateInfo.rates.stone]
  ].map(([label, value]) => `<div class="bo-metric-row"><span>${label}</span><strong>${(value || 0).toFixed(3)}/s</strong></div>`).join("");
  const affordHtml = [
    ["Age II afford", metrics.afford.age2],
    ["Age III afford", metrics.afford.age3],
    ["Age IV afford", metrics.afford.age4]
  ].map(([label, timeVal]) => `<div class="bo-metric-row"><span>${label}</span><strong>${timeVal === null ? "Not reached" : formatTimeMMSS(timeVal)}</strong></div>`).join("");
  const gatheredHtml = [
    ["Food", metrics.gathered.food],
    ["Wood", metrics.gathered.wood],
    ["Gold", metrics.gathered.gold],
    ["Stone", metrics.gathered.stone]
  ].map(([label, value]) => `<div class="bo-metric-row"><span>${label}</span><strong>${Math.floor(value || 0)}</strong></div>`).join("");
  const perMinHtml = [
    ["Food/min", metrics.perMin.food],
    ["Wood/min", metrics.perMin.wood],
    ["Gold/min", metrics.perMin.gold],
    ["Stone/min", metrics.perMin.stone]
  ].map(([label, value]) => `<div class="bo-metric-row"><span>${label}</span><strong>${Math.floor(value || 0)}</strong></div>`).join("");
  const finalResHtml = [
    ["Food", results.finalResources.food],
    ["Wood", results.finalResources.wood],
    ["Gold", results.finalResources.gold],
    ["Stone", results.finalResources.stone]
  ].map(([label, value]) => `<div class="bo-metric-row"><span>${label}</span><strong>${Math.floor(value || 0)}</strong></div>`).join("");
  const anchorInfo = getBoSummaryAnchorInfo(currentRateInfo.time);
  let summaryHtml = `
    <div class="bo-summary-anchor">
      <div class="bo-summary-anchor-text">${anchorInfo.label}</div>
      ${anchorInfo.clearable ? '<button class="bo-summary-anchor-clear" type="button" data-action="clear-pin">Clear pin</button>' : ""}
    </div>
    <div class="bo-metric-grid">
      <div class="bo-metric-card">
        <div class="bo-metric-title">Age Up Timing</div>
        ${affordHtml}
      </div>
      <div class="bo-metric-card">
        <div class="bo-metric-title">Collected</div>
        ${gatheredHtml}
      </div>
      <div class="bo-metric-card">
        <div class="bo-metric-title">Avg collected / min</div>
        <div class="bo-metric-help">Total gathered over full sim duration.</div>
        ${perMinHtml}
      </div>
      <div class="bo-metric-card">
        <div class="bo-metric-title">Current effective rate</div>
        <div class="bo-metric-help">Live rate at the active time anchor (${formatTimeMMSS(currentRateInfo.time)}).</div>
        ${currentRateRows}
      </div>
      <div class="bo-metric-card">
        <div class="bo-metric-title">Final Res</div>
        ${finalResHtml}
      </div>
    </div>
  `;
  if (milestoneEntries.length === 0) {
    summaryHtml += "<span class='text-muted'>No milestones recorded.</span>";
  } else {
    summaryHtml += milestoneEntries.map(([k, v]) => `<div><strong>${k}:</strong> ${formatTimeMMSS(v)}</div>`).join("");
  }
  const extraParts = [];
  if ((results.finalResources.oliveOil || 0) > 0) extraParts.push(`Olive ${Math.floor(results.finalResources.oliveOil)}`);
  if ((results.finalResources.silver || 0) > 0) extraParts.push(`Silver ${Math.floor(results.finalResources.silver)}`);
  if (extraParts.length) {
    summaryHtml += `<div class="mt-1"><strong>Special:</strong> ${extraParts.join(" | ")}</div>`;
  }
  if (results.warnings.length) {
    summaryHtml += `<div class="bo-warning mt-2">${results.warnings.join(" | ")}</div>`;
  }
  summary.innerHTML = summaryHtml;
  summary.querySelector('[data-action="clear-pin"]')?.addEventListener("click", () => {
    boPinnedTime = null;
    renderBoTimelineEditor();
    renderBoGatherRates();
  });
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
    if (unitA.effects.aoeSplash && totalTargetsA > 1) logNotes.push(`AoE×${totalTargetsA}`);
    if (unitA.effects.aoeFalloff && totalTargetsA > 1) logNotes.push(`AoE×${totalTargetsA}(falloff)`);
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

  const weapon = firedPrimary && firedSecondary ? "Both" : firedPrimary ? "Primary" : firedSecondary ? "Secondary" : "—";
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
      aWeapon: unitA.effects.openingAttack ? "Opening" : "—",
      aDmg: unitA.effects.openingAttack ? (Math.max(1, unitA.effects.openingAttack.damage - (teamB.stats.rangedArmor || 0)) * teamA.units) : 0,
      aUnits: teamA.units, aHp: Math.round(teamA.totalHp),
      bWeapon: unitB.effects.openingAttack ? "Opening" : "—",
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
      aWeapon: antiCavNotesA[0] || "—", aDmg: unitA.effects.palings && teamB.tags.includes("Cavalry") ? unitA.effects.palings.damage * teamA.units : 0,
      aUnits: teamA.units, aHp: Math.round(teamA.totalHp),
      bWeapon: antiCavNotesB[0] || "—", bDmg: unitB.effects.palings && teamA.tags.includes("Cavalry") ? unitB.effects.palings.damage * teamB.units : 0,
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
      if (unitA.effects.aoeSplash && totalTargetsA > 1) logNotesA.push(`AoE×${totalTargetsA}`);
      if (unitA.effects.aoeFalloff && totalTargetsA > 1) logNotesA.push(`AoE×${totalTargetsA}(falloff)`);
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
      if (unitB.effects.aoeSplash && totalTargetsB > 1) logNotesB.push(`AoE×${totalTargetsB}`);
      if (unitB.effects.aoeFalloff && totalTargetsB > 1) logNotesB.push(`AoE×${totalTargetsB}(falloff)`);
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
    const aWeapon = aFiredPrimary && aFiredSecondary ? "Both" : aFiredPrimary ? "Primary" : aFiredSecondary ? "Secondary" : "—";
    const bWeapon = bFiredPrimary && bFiredSecondary ? "Both" : bFiredPrimary ? "Primary" : bFiredSecondary ? "Secondary" : "—";
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

// ========================================
// PAGE NAVIGATION
// ========================================

function switchPage(pageName) {
  currentPage = pageName;
  // Update nav tabs
  document.querySelectorAll(".aoe4-nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.page === pageName);
  });

  if (pageName === "buildOrder") {
    const buildEls = document.querySelectorAll(".build-only");
    const hideEls = document.querySelectorAll(".single-only, .multi-only, .battle-only");
    if (buildEls.length) buildEls.forEach((el) => { el.style.display = ""; });
    if (hideEls.length) hideEls.forEach((el) => { el.style.display = "none"; });
    updateBoCivGate(true);
    return;
  } else {
    const buildEls = document.querySelectorAll(".build-only");
    const battleEls = document.querySelectorAll(".battle-only");
    if (buildEls.length) buildEls.forEach((el) => { el.style.display = "none"; });
    if (battleEls.length) battleEls.forEach((el) => { el.style.display = ""; });
  }

  // Toggle building mode
  const toggle = document.getElementById("vsBuildingToggle");
  const buildingPanel = document.getElementById("buildingPanel");
  const teamBNormal = document.getElementById("teamBNormal");

  const titleB = document.getElementById("titleB");

  const teamASections = document.getElementById("teamASectionsNormal");
  const torchInfo = document.getElementById("A_torchInfo");
  const torchDmgEl = document.getElementById("A_torchDamage");
  const attackCol = document.getElementById("A_attackCol");
  const attackSpeedCol = document.getElementById("A_attackSpeedCol");

  setMultiModeUI(pageName === "multiBattle");
  if (pageName !== "multiBattle") {
    const multiResults = document.getElementById("multiResultsContainer");
    if (multiResults) multiResults.style.display = "none";
    const rpA = document.getElementById("resultPanelA");
    const rpB = document.getElementById("resultPanelB");
    if (rpA) rpA.style.display = "";
    if (rpB) rpB.style.display = "";
  }

  if (pageName === "vsBuilding") {
    if (toggle) toggle.checked = true;
    if (teamBNormal) teamBNormal.style.display = "none";
    if (buildingPanel) buildingPanel.style.display = "block";
    if (teamASections) teamASections.style.display = "none";
    if (buildingPanel && teamBNormal) updateBuildingStats();
    // Show torch damage for melee units, hide normal attack stats
    const age = parseInt(document.getElementById("unitAAge")?.value) || 2;
    const weaponMode = document.querySelector('input[name="weaponModeA"]:checked')?.value;
    const unitName = document.getElementById("unitASelect")?.dataset.value;
    const unit = units[unitName];
    const weaponType = unit?.weapons?.[weaponMode === "secondary" ? "secondary" : "primary"]?.type || "melee";
    if (weaponType === "melee") {
      if (torchDmgEl) torchDmgEl.value = TORCH_BY_AGE[age] || 13;
      if (torchInfo) torchInfo.style.display = "";
      if (attackCol) attackCol.style.display = "none";
      if (attackSpeedCol) attackSpeedCol.style.display = "none";
    } else {
      if (torchInfo) torchInfo.style.display = "none";
      if (attackCol) attackCol.style.display = "";
      if (attackSpeedCol) attackSpeedCol.style.display = "";
    }
    // Update Team B title to show building name
    const bName = document.getElementById("buildingType")?.value || "Building";
    if (titleB) {
      titleB.innerHTML = `<span>${bName}</span>`;
      titleB.style.cursor = "default";
      titleB.onclick = null;
    }
  } else if (pageName === "multiBattle") {
    if (toggle) toggle.checked = false;
    if (teamBNormal) teamBNormal.style.display = "";
    if (buildingPanel) buildingPanel.style.display = "none";
    if (teamASections) teamASections.style.display = "";
    if (torchInfo) torchInfo.style.display = "none";
    if (attackCol) attackCol.style.display = "";
    if (attackSpeedCol) attackSpeedCol.style.display = "";
    if (titleB) {
      titleB.style.cursor = "pointer";
      titleB.onclick = () => showUnitDetail('B');
    }
    if (teamBNormal) updateUnitStats("B");
  } else {
    if (toggle) toggle.checked = false;
    if (teamBNormal) teamBNormal.style.display = "";
    if (buildingPanel) buildingPanel.style.display = "none";
    if (teamASections) teamASections.style.display = "";
    if (torchInfo) torchInfo.style.display = "none";
    if (attackCol) attackCol.style.display = "";
    if (attackSpeedCol) attackSpeedCol.style.display = "";
    // Restore Team B title to unit name
    if (titleB) {
      titleB.style.cursor = "pointer";
      titleB.onclick = () => showUnitDetail('B');
    }
    if (teamBNormal) updateUnitStats("B");
  }
}

window.switchPage = switchPage;

// Keep for backwards compatibility if called directly
function toggleBuildingMode() {
  const toggle = document.getElementById("vsBuildingToggle");
  switchPage(toggle && toggle.checked ? "vsBuilding" : "unitBattler");
}

function updateBuildingStats() {
  const select = document.getElementById("buildingType");
  if (!select) return;
  const bName = select.value;
  const b = BUILDINGS[bName];
  if (!b) return;

  // Update garrison max
  const garrisonInput = document.getElementById("buildingGarrison");
  garrisonInput.max = b.garrisonMax;
  document.getElementById("buildingGarrisonMax").textContent = b.garrisonMax;
  if (parseInt(garrisonInput.value) > b.garrisonMax) garrisonInput.value = b.garrisonMax;

  // Calculate effective stats with techs
  let hp = b.hp;
  let fireArmor = b.fireArmor;
  let rangedArmor = b.rangedArmor;
  let arrowUpgrades = 0;

  // Court Architects: +30% HP
  if (document.getElementById("techCourtArchitects")?.classList.contains("active")) {
    hp = Math.round(hp * 1.3);
  }

  // Fortify Outpost: +1000 HP, +5 fire armor
  if (b.techs?.includes("fortifyOutpost") && document.getElementById("techFortifyOutpost")?.classList.contains("active")) {
    hp += 1000;
    fireArmor += 5;
  }

  // Castle Turret: +2 arrow damage
  if (b.techs?.includes("castleTurret") && document.getElementById("techCastleTurret")?.classList.contains("active")) {
    arrowUpgrades += 2;
  }

  // Arrow Upgrades: +1/+2/+3
  const arrowUpgradeBtn = document.getElementById("techArrowUpgrades");
  if (arrowUpgradeBtn) {
    arrowUpgrades += parseInt(arrowUpgradeBtn.dataset.level) || 0;
  }

  // Set editable fields
  document.getElementById("buildingHp").value = hp;
  document.getElementById("buildingRangedArmor").value = rangedArmor;
  document.getElementById("buildingFireArmor").value = fireArmor;

  // Set arrow stats
  document.getElementById("buildingBaseArrows").value = b.baseArrows;
  document.getElementById("buildingBaseArrowDmg").value = b.baseArrowDmg + arrowUpgrades;
  document.getElementById("buildingBaseArrowRate").value = b.baseArrowRate;
  document.getElementById("buildingGarrisonArrowDmg").value = b.garrisonArrowDmg + arrowUpgrades;
  document.getElementById("buildingGarrisonArrowRate").value = b.garrisonArrowRate;

  // Update Team B title to building name with civ flags
  const titleB = document.getElementById("titleB");
  if (titleB && document.getElementById("vsBuildingToggle")?.checked) {
    const civs = (b.civs || []).filter(c => CIV_FLAGS[c]);
    const flagsHtml = civs.map(c => `<img src="${CIV_FLAGS[c]}" alt="${c}" style="height:28px; border-radius:3px; margin-left:6px;">`).join("");
    titleB.style.display = "flex";
    titleB.style.justifyContent = "space-between";
    titleB.style.alignItems = "center";
    titleB.innerHTML = `<span>${bName}</span><span>${flagsHtml}</span>`;
  }

  // Show/hide conditional techs
  const hasFortify = b.techs?.includes("fortifyOutpost");
  const hasCastleTurret = b.techs?.includes("castleTurret");
  const fortifyEl = document.getElementById("techFortifyOutpost");
  const castleTurretEl = document.getElementById("techCastleTurret");
  if (fortifyEl) fortifyEl.style.display = hasFortify ? "" : "none";
  if (castleTurretEl) castleTurretEl.style.display = hasCastleTurret ? "" : "none";

  // Reset hidden tech states
  if (!hasFortify) {
    document.getElementById("techFortifyOutpost")?.classList.remove("active");
  }
  if (!hasCastleTurret) {
    document.getElementById("techCastleTurret")?.classList.remove("active");
  }

  // Populate emplacement toggle buttons
  const emplacementSection = document.getElementById("emplacementSection");
  const emplacementGrid = document.getElementById("emplacementGrid");
  const emplacementSummary = document.getElementById("emplacementSummary");
  if (emplacementSection && emplacementGrid) {
    const empList = b.emplacements || [];
    if (empList.length === 0) {
      emplacementSection.style.display = "none";
    } else {
      emplacementSection.style.display = "";
      // Outposts = single emplacement (radio), Keeps/Landmarks = multiple (toggle)
      const isOutpost = ["Outpost", "Toll Outpost", "Wooden Fortress", "Fortified Outpost"].includes(bName);
      emplacementGrid.dataset.mode = isOutpost ? "radio" : "toggle";
      emplacementGrid.innerHTML = "";
      empList.forEach(name => {
        const emp = EMPLACEMENTS[name];
        if (!emp) return;
        const civLabel = emp.civs?.length ? ` (${emp.civs[0].replace("Macedonian Dynasty", "Macedon.").replace("Knights Templar", "KT")})` : "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "building-tech-btn";
        btn.dataset.emplacement = name;
        const dmgText = emp.projectiles > 1 ? `${emp.dmg}×${emp.projectiles}` : `${emp.dmg}`;
        btn.title = `${dmgText} dmg, ${emp.rate}s, range ${emp.range}`;
        btn.textContent = name.replace(" Emplacement", "") + civLabel;
        btn.addEventListener("click", function() {
          if (emplacementGrid.dataset.mode === "radio") {
            // Radio: deactivate all others
            emplacementGrid.querySelectorAll(".building-tech-btn").forEach(b => b.classList.remove("active"));
          }
          this.classList.toggle("active");
          updateEmplacementSummary();
        });
        emplacementGrid.appendChild(btn);
      });
    }
    if (emplacementSummary) emplacementSummary.textContent = "";
  }
}

function updateEmplacementSummary() {
  const summaryEl = document.getElementById("emplacementSummary");
  if (!summaryEl) return;
  const grid = document.getElementById("emplacementGrid");
  if (!grid) return;
  const active = grid.querySelectorAll(".building-tech-btn.active");
  if (active.length === 0) {
    summaryEl.textContent = "";
    return;
  }
  const parts = [];
  active.forEach(btn => {
    const name = btn.dataset.emplacement;
    const emp = EMPLACEMENTS[name];
    if (!emp) return;
    const dmgText = emp.projectiles > 1 ? `${emp.dmg}×${emp.projectiles}` : `${emp.dmg}`;
    parts.push(`${name.replace(" Emplacement", "")}: ${dmgText} dmg / ${emp.rate}s`);
  });
  summaryEl.textContent = parts.join(" | ");
}

function getBuildingData() {
  const bName = document.getElementById("buildingType").value;
  const b = BUILDINGS[bName];
  const garrison = parseInt(document.getElementById("buildingGarrison").value) || 0;
  const hp = parseFloat(document.getElementById("buildingHp").value) || b.hp;
  const rangedArmor = parseFloat(document.getElementById("buildingRangedArmor").value) || 0;
  const fireArmor = parseFloat(document.getElementById("buildingFireArmor").value) || 0;

  // Read active emplacements from toggle buttons
  const emplacements = [];
  const grid = document.getElementById("emplacementGrid");
  if (grid) {
    grid.querySelectorAll(".building-tech-btn.active").forEach(btn => {
      const name = btn.dataset.emplacement;
      const empData = EMPLACEMENTS[name];
      if (empData) {
        emplacements.push({
          name,
          dmg: empData.dmg,
          projectiles: empData.projectiles,
          rate: empData.rate,
          range: empData.range,
          type: empData.type
        });
      }
    });
  }

  return {
    name: bName,
    hp, rangedArmor, fireArmor,
    garrison,
    baseArrows: parseInt(document.getElementById("buildingBaseArrows").value) || 0,
    baseArrowDmg: parseFloat(document.getElementById("buildingBaseArrowDmg").value) || 0,
    baseArrowRate: parseFloat(document.getElementById("buildingBaseArrowRate").value) || 1,
    garrisonArrowDmg: parseFloat(document.getElementById("buildingGarrisonArrowDmg").value) || 0,
    garrisonArrowRate: parseFloat(document.getElementById("buildingGarrisonArrowRate").value) || 1,
    emplacements,
    range: b.range
  };
}

function cycleArrowUpgrades() {
  const btn = document.getElementById("techArrowUpgrades");
  if (!btn) return;
  let level = (parseInt(btn.dataset.level) || 0) + 1;
  if (level > 3) level = 0;
  btn.dataset.level = level;
  btn.classList.toggle("active", level > 0);
  const labels = ["Arrow Upgrades: 0", "Steeled Arrow: +1", "Balanced Arrow: +2", "Platecutter: +3"];
  btn.textContent = labels[level];
  updateBuildingStats();
}

// ========================================
// EVENT LISTENERS
// ========================================

// Unit select change is handled by custom dropdown click handler
document
  .getElementById("unitAAge")
  .addEventListener("change", () => updateUnitStats("A"));
document
  .getElementById("unitBAge")
  .addEventListener("change", () => updateUnitStats("B"));

document.querySelectorAll('input[name="weaponModeA"]').forEach((radio) => {
  radio.addEventListener("change", () => updateUnitStats("A"));
});
document.querySelectorAll('input[name="weaponModeB"]').forEach((radio) => {
  radio.addEventListener("change", () => updateUnitStats("B"));
});

document.querySelectorAll(".battle-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    if (this.disabled) return;
    if (this.id === "boRunBtn") return;
    // Button press animation
    this.style.animation = "none";
    this.style.transform = "scale(0.9)";
    this.style.boxShadow = "0 0 60px rgba(212, 164, 74, 0.8)";

    setTimeout(() => {
      this.style.transform = "";
      this.style.boxShadow = "";
      this.style.animation = "";
    }, 300);

    if (isMultiMode()) {
      collapseAllOpenGroups();
      syncAllGroupsFromCards();
      runMultiBattle();
    }
    else runBattle();
  });
});

document.getElementById("autoBalance").addEventListener("change", function () {
  if (this.checked) balanceCosts();
});

document.querySelectorAll(".multi-add-tile").forEach((btn) => {
  btn.addEventListener("click", () => {
    const side = btn.dataset.side;
    if (side) addMultiGroup(side);
  });
});

document.querySelectorAll(".aoe4-nav-tab").forEach((tab) => {
  tab.addEventListener("click", (e) => {
    e.preventDefault();
    const page = tab.dataset.page;
    if (page) switchPage(page);
  });
});

document.addEventListener("click", (e) => {
  if (!isMultiMode()) return;
  if (e.target.closest(".multi-group-card")) return;
  collapseAllOpenGroups();
});

const boAddPickerEl = document.getElementById("boAddPicker");
const boAddCommandBtn = document.getElementById("boAddCommand");

function getBoPickerDefaultType() {
  if (boSelectedBuilding) return "trainUnit";
  if (boSelectedCommandId) {
    const cmd = boCommands.find((c) => c.id === boSelectedCommandId);
    const type = cmd?.type || "assign";
    const allowed = ["assign", "buildBuilding", "tech", "trainUnit"];
    return allowed.includes(type) ? type : "assign";
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
  const buildingTargetedType = !!boSelectedBuilding && (type === "trainUnit" || type === "tech");
  const insertAfter = buildingTargetedType
    ? (boSelectedBuilding?.sourceCommandId || null)
    : (boSelectedCommandId || null);
  const cmd = addBoCommand(type, insertAfter);
  if (!cmd) return;

  if (boSelectedBuilding && (type === "trainUnit" || type === "tech")) {
    cmd.payload.building = boSelectedBuilding.type;
    cmd.payload.buildingId = boSelectedBuilding.id;
    if (boSelectedBuilding.type === "Town Center" || boSelectedBuilding.id.startsWith("TC ")) {
      if (type === "trainUnit") cmd.payload.unitName = "Villager";
    }
  }
  if (!hadSelectedCommand && !buildingTargetedType) {
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

document.getElementById("boOverlayToggle")?.addEventListener("change", (e) => {
  boOverlayEnabled = !!e.target.checked;
  renderBoTimelineEditor();
  renderBoResourceChart(boLastResults?.samples || []);
});

document.getElementById("buildOrderRow")?.addEventListener("input", (e) => {
  if (!e.target?.id?.startsWith("bo")) return;
  if (e.target.closest("#boCommandEditor")) return;
  scheduleRunBuildOrder();
});
document.getElementById("buildOrderRow")?.addEventListener("change", (e) => {
  if (!e.target?.id?.startsWith("bo")) return;
  if (e.target.closest("#boCommandEditor")) return;
  scheduleRunBuildOrder();
});

function toggleBoPinnedTimeFromEvent(event) {
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
}

document.getElementById("boLaneTimeline")?.addEventListener("click", (e) => {
  if (!updateBoCivGate(true)) return;
  const block = e.target.closest(".bo-lane-block");
  if (!block) {
    toggleBoPinnedTimeFromEvent(e);
    return;
  }
  if (block.dataset?.marker === "villager") {
    const markerTime = parseFloat(block.dataset?.markerTime || "0");
    insertBoAssignAtTime(markerTime);
    return;
  }
  const id = block.dataset?.commandId;
  if (id) {
    if (id === boSelectedCommandId) {
      boSelectedCommandId = null;
      renderBoTimelineEditor();
      renderBoCommandEditor(null);
      renderBoGatherRates();
      return;
    }
    selectBoCommand(id);
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
  if (laneKey === "tc") {
    if (boSelectedBuilding?.id === "TC #1") {
      boSelectedBuilding = null;
      setBoTargetBuilding(null);
      renderBoTimelineEditor();
      renderBoCommandEditor(getSelectedBoCommand());
      renderBoGatherRates();
      return;
    }
    selectBoBuilding({ id: "TC #1", type: "Town Center", sourceCommandId: BO_CAPITAL_TC_ANCHOR, readyAt: 0 });
    return;
  }
  if (buildingId && buildingType) {
    if (boSelectedBuilding?.id === buildingId) {
      boSelectedBuilding = null;
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
    });
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

// Collapse toggle arrow rotation
document.querySelectorAll('[data-bs-toggle="collapse"]').forEach((toggle) => {
  const targetId = toggle.getAttribute("data-bs-target");
  const target = document.querySelector(targetId);

  if (target) {
    target.addEventListener("show.bs.collapse", () => {
      const arrow = toggle.querySelector(".toggle-arrow");
      if (arrow) arrow.style.transform = "rotate(0deg)";
    });
    target.addEventListener("hide.bs.collapse", () => {
      const arrow = toggle.querySelector(".toggle-arrow");
      if (arrow) arrow.style.transform = "rotate(-90deg)";
    });
  }
});

/**
 * Section glow: highlight buff/first-hit/effects boxes when they have active values
 */
function updateSectionGlow(side) {
  // Flat Buffs
  const flatBox = document.getElementById(`collapseA_flatBuffs`)?.closest(".buff-box");
  const pctBox = document.getElementById(`collapseA_pctBuffs`)?.closest(".buff-box");
  const fhBox = document.getElementById(`collapseA_firstHit`)?.closest(".first-hit-box");
  const effBox = document.getElementById(`${side}_effectsBox`);

  [["A", "collapseA_flatBuffs", "collapseA_pctBuffs", "collapseA_firstHit"],
   ["B", "collapseB_flatBuffs", "collapseB_pctBuffs", "collapseB_firstHit"]].forEach(([s, flatId, pctId, fhId]) => {
    if (s !== side) return;

    const flatEl = document.getElementById(flatId)?.closest(".buff-box");
    const pctEl = document.getElementById(pctId)?.closest(".buff-box");
    const fhEl = document.getElementById(fhId)?.closest(".first-hit-box");
    const effEl = document.getElementById(`${s}_effectsBox`);

    // Check flat buffs
    if (flatEl) {
      const hasFlat = [`${s}_buffAttackAbs`, `${s}_buffHPabs`, `${s}_buffMeleeArmor`, `${s}_buffRangedArmor`]
        .some(id => { const el = document.getElementById(id); return el && parseFloat(el.value); });
      flatEl.classList.toggle("section-active", hasFlat);
    }

    // Check pct buffs
    if (pctEl) {
      const hasPct = [`${s}_buffAttackPct`, `${s}_buffHPpct`]
        .some(id => { const el = document.getElementById(id); return el && parseFloat(el.value); });
      pctEl.classList.toggle("section-active", hasPct);
    }

    // Check first-hit
    if (fhEl) {
      const enabled = document.getElementById(`${s}_firstHitEnabled`)?.checked;
      const hits = parseInt(document.getElementById(`${s}_freeHits`)?.value) || 0;
      fhEl.classList.toggle("section-active", enabled && hits > 0);
    }

    // Check effects
    if (effEl && effEl.style.display !== "none") {
      const hasChecked = effEl.querySelector(".effect-checkbox:checked");
      effEl.classList.toggle("section-active", !!hasChecked);
    }
  });
}

// Listen for input changes on buff/first-hit sections
document.addEventListener("input", (e) => {
  const card = e.target.closest(".card-team-a, .card-team-b");
  if (card) {
    const side = card.classList.contains("card-team-a") ? "A" : "B";
    updateSectionGlow(side);
  }
});
document.addEventListener("change", (e) => {
  const card = e.target.closest(".card-team-a, .card-team-b");
  if (card) {
    const side = card.classList.contains("card-team-a") ? "A" : "B";
    updateSectionGlow(side);
  }
});

// Building mode event listeners
document.getElementById("buildingType")?.addEventListener("change", updateBuildingStats);
document.getElementById("buildingGarrison")?.addEventListener("input", () => {
  const input = document.getElementById("buildingGarrison");
  const max = parseInt(input.max) || 15;
  if (parseInt(input.value) > max) input.value = max;
});

// Tech toggle buttons
document.getElementById("techCourtArchitects")?.addEventListener("click", function() {
  this.classList.toggle("active");
  updateBuildingStats();
});
document.getElementById("techArrowUpgrades")?.addEventListener("click", cycleArrowUpgrades);
document.getElementById("techFortifyOutpost")?.addEventListener("click", function() {
  this.classList.toggle("active");
  updateBuildingStats();
});
document.getElementById("techCastleTurret")?.addEventListener("click", function() {
  this.classList.toggle("active");
  updateBuildingStats();
});

// Emplacement toggle buttons are created dynamically in updateBuildingStats()

updateMultiTotals();
updateMultiBattleReadyState();
loadUnitData().catch((error) => console.error("Error loading units:", error));
initBuildOrderUI();
loadBoResourceData();
loadBoCivBonusData();
