import { units, unitIndex, allAvailableTags, loadUnitData, getCivOrder, getTypeOrder, getUnitMeta } from "../shared/data.js";
import { CIV_ORDER, CIV_FLAGS, UNIT_REPLACEMENTS, TYPE_ORDER, getCivFlagHtml, setFlagBackground } from "../shared/constants.js";
import { updateBoCivGate } from "../build-order/index.js";

// ========================================
// AOE4 BATTLE SIMULATOR - COMPLETE SCRIPT WITH ALL FIXES
// ========================================

let currentPage = "unitBattler";

// Multi battle state
let multiRosters = { A: [], B: [] };
let multiEditing = { A: null, B: null };
let multiEditorOpen = { A: false, B: false };
let multiIdCounters = { A: 1, B: 1 };
let selectedCivA = "";
let selectedCivB = "";

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
    civs: ["Golden Horde"]
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
/**
 * 2. UI POPULATION - Dropdowns (grouped by civilization)
 */

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

function getUnitsForCiv(civName) {
  if (unitIndex?.unitsByCiv?.[civName || "All"]) {
    return [...unitIndex.unitsByCiv[civName || "All"]];
  }

  if (!civName) return Object.keys(units);

  const replacements = UNIT_REPLACEMENTS[civName] || {};
  const replacedCommons = new Set(Object.keys(replacements));

  return Object.keys(units).filter((name) => {
    const unit = units[name];
    const civs = unit.civs || ["Common"];
    const exceptCivs = unit.exceptCivs || [];
    const belongsToCiv = civs.includes(civName) || civs.includes("Common");

    if (!belongsToCiv) return false;
    if (exceptCivs.includes(civName)) return false;
    if (civs.includes("Common") && replacedCommons.has(name)) return false;

    return true;
  });
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

function getResolvedCivOrder() {
  const order = getCivOrder();
  return Array.isArray(order) && order.length ? order : CIV_ORDER;
}

function getResolvedTypeOrder() {
  const order = getTypeOrder();
  return Array.isArray(order) && order.length ? order : TYPE_ORDER;
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
    getResolvedCivOrder().forEach((civ) => {
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
    getResolvedTypeOrder().forEach((type) => {
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

function getBuildingFlagHtml(buildingName, size = 18) {
  const civs = (BUILDINGS[buildingName]?.civs || []).filter((civ) => CIV_FLAGS[civ]);
  return civs.map((civ) =>
    `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:${size}px; border-radius:3px; vertical-align:middle;">`
  ).join("");
}

function updateBuildingSelectHeader(wrapper) {
  if (!wrapper) return;
  const val = wrapper.dataset.value || "Capital Town Center";
  const header = wrapper.querySelector(".custom-select-header");
  if (!header) return;
  const nameSpan = header.querySelector(".cs-name");
  const flagsSpan = header.querySelector(".cs-flags");
  if (nameSpan) nameSpan.textContent = val;
  if (flagsSpan) flagsSpan.innerHTML = getBuildingFlagHtml(val, 18);
}

function renderBuildingOptions(wrapper, filter) {
  const dropdown = wrapper?.querySelector(".custom-select-dropdown");
  const searchInput = dropdown?.querySelector(".custom-select-search");
  const nativeSelect = document.getElementById("buildingType");
  if (!dropdown || !searchInput || !nativeSelect) return;

  const currentVal = wrapper.dataset.value;
  const filterLower = (filter || "").toLowerCase();
  let html = "";

  nativeSelect.querySelectorAll("optgroup").forEach((group) => {
    const options = Array.from(group.querySelectorAll("option")).filter((opt) => {
      const label = (opt.textContent || opt.value || "").toLowerCase();
      return !filterLower || label.includes(filterLower);
    });
    if (!options.length) return;
    html += `<div class="custom-select-optgroup">${group.label}</div>`;
    options.forEach((opt) => {
      const value = opt.value;
      const sel = value === currentVal ? " selected" : "";
      const flags = getBuildingFlagHtml(value, 16);
      html += `<div class="custom-select-option${sel}" data-value="${value}"><span>${value}</span><span class="cs-opt-flags">${flags}</span></div>`;
    });
  });

  dropdown.querySelectorAll(".custom-select-optgroup, .custom-select-option").forEach((el) => el.remove());
  searchInput.insertAdjacentHTML("afterend", html);

  dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const value = opt.dataset.value;
      wrapper.dataset.value = value;
      updateBuildingSelectHeader(wrapper);
      closeDropdown(wrapper);
      if (nativeSelect.value !== value) {
        nativeSelect.value = value;
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        updateBuildingStats();
      }
    });
  });
}

function openBuildingDropdown(wrapper) {
  const header = wrapper?.querySelector(".custom-select-header");
  const dropdown = wrapper?.querySelector(".custom-select-dropdown");
  const search = dropdown?.querySelector(".custom-select-search");
  if (!header || !dropdown || !search) return;
  header.classList.add("open");
  dropdown.classList.add("show");
  search.value = "";
  search.focus();
  renderBuildingOptions(wrapper, "");
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

function initBuildingSelect() {
  const wrapper = document.getElementById("buildingTypeSelect");
  const nativeSelect = document.getElementById("buildingType");
  if (!wrapper || !nativeSelect) return;

  wrapper.dataset.value = nativeSelect.value || wrapper.dataset.value || "Capital Town Center";
  wrapper.innerHTML = `
    <div class="custom-select-header">
      <span class="cs-name">${wrapper.dataset.value}</span>
      <span class="cs-flags"></span>
      <span class="cs-arrow">&#9660;</span>
    </div>
    <div class="custom-select-dropdown">
      <input type="text" class="custom-select-search" placeholder="Search buildings...">
    </div>
  `;

  const header = wrapper.querySelector(".custom-select-header");
  const dropdown = wrapper.querySelector(".custom-select-dropdown");
  const search = dropdown?.querySelector(".custom-select-search");

  header?.addEventListener("click", () => {
    if (dropdown.classList.contains("show")) {
      closeDropdown(wrapper);
    } else {
      document.querySelectorAll(".custom-select-wrapper").forEach((w) => closeDropdown(w));
      openBuildingDropdown(wrapper);
    }
  });

  search?.addEventListener("input", () => {
    renderBuildingOptions(wrapper, search.value);
  });
  search?.addEventListener("click", (e) => e.stopPropagation());

  updateBuildingSelectHeader(wrapper);
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

  getResolvedCivOrder().forEach(civ => {
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
  const autoBalanceWrap = document.querySelector(".auto-balance-toggle");
  if (autoBalance) {
    if (active) {
      autoBalance.checked = false;
      autoBalance.disabled = true;
    } else {
      autoBalance.disabled = false;
    }
  }
  if (autoBalanceWrap) {
    autoBalanceWrap.style.display = active ? "none" : "";
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
  const buildingWrapper = document.getElementById("buildingTypeSelect");
  if (buildingWrapper) {
    buildingWrapper.dataset.value = bName;
    updateBuildingSelectHeader(buildingWrapper);
  }

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

function hydrateUnitBattlerUi() {
  populateCivDropdowns();
  populateSelects();
  initBuildingSelect();
  updateUnitStats("A");
  updateUnitStats("B");
  updateBuildingStats();
}

export async function initUnitBattlerApp() {
  updateMultiTotals();
  updateMultiBattleReadyState();
  await loadUnitData();
  hydrateUnitBattlerUi();
}

export { switchPage, showUnitDetail, showUnitDetailWith, filterByCiv, updateBuildingStats, updateMultiTotals, updateMultiBattleReadyState };


