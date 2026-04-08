import {
  units,
  unitIndex,
  allAvailableTags,
  loadUnitData,
  getCivOrder,
  getTypeOrder,
  getUnitMeta,
} from "../shared/data.js";
import {
  CIV_ORDER,
  CIV_FLAGS,
  UNIT_REPLACEMENTS,
  TYPE_ORDER,
  getCivFlagHtml,
  setFlagBackground,
} from "../shared/constants.js";
import { updateBoCivGate } from "../build-order/index.js";
import {
  SIMULTANEOUS_WEAPON_UNITS,
  getWeaponProjectiles,
  getWeaponDisplayName,
  getWeaponInfoText,
  unitSupportsBothWeapons,
  getWeaponModeOptionState,
  getAttackLogLabel,
  applyBuffs,
  calcEffectiveAttackSpeed,
  calcEffectiveAttack,
  calcEffectiveArmor,
  calcWeaponDamage,
  calcDirectDamageAfterArmor,
  getCamelUneaseDamageMultiplier,
} from "../shared/combat.js";
import {
  BUILDINGS,
  EMPLACEMENTS,
  TORCH_BY_AGE,
  TORCH_ATTACK_SPEED,
  KIPCHAK_TRIPLE_SHOT,
} from "../shared/combat-data.js";
import {
  hasKipchakTripleShot,
  createTrackedTeamHealth,
  getAllTrackedUnits,
  syncTrackedTeamState,
  applyHpDeltaToTeam,
  healTrackedTeam,
  cloneUnitState,
  getNextBleedTick,
  applyKipchakBleed,
  collectBleedTickEvents,
  applyPoison,
  getNextPoisonTick,
  collectPoisonTickEvents,
  applyBundledDamageToTeam,
  setTrackedTeamHpPerUnit,
} from "../shared/health-tracking.js";
import {
  getMergedUpgradesForUnit,
  TECH_TO_EFFECT,
  EFFECT_TO_TECH,
  TECH_EFFECTS,
  FALLBACK_TECH_IMG,
  activeTechs,
  techUnitTracker,
  getTechKey,
  getTechImage,
  isCombatCategory,
  filterTechByCiv,
} from "./techs.js";
import {
  createTeamState,
  pickNextTarget,
  computeClosingDelay,
  applyBattleGlory,
  applyOpeningAttacks,
  formatSeconds,
  applyAntiCavEffects,
  computeTeamAttack,
} from "./multi-battle-sim.js";

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


/**
 * 1. DATA LOADING
 * Fetches the JSON file and extracts all unique tags from all units.
 */
/**
 * 2. UI POPULATION - Dropdowns (grouped by civilization)
 */


function renderTechButtons(side, unitName, unit) {
  const container = document.getElementById(`${side}_techContainer`);
  const box = document.getElementById(`${side}_techBox`);
  if (!container || !box) return;

  const selectedCiv = side === "A" ? selectedCivA : selectedCivB;

  // Reset active techs if unit changed
  const trackKey = `${unitName}|${selectedCiv}`;
  if (techUnitTracker[side] !== trackKey) {
    activeTechs[side].clear();
    techUnitTracker[side] = trackKey;
    syncTechBuffsToInputs(side);
  }

  // Merge upgrades and auras
  const upgrades = getMergedUpgradesForUnit(unit);
  const auras = unit.auras || [];
  const allItems = [...upgrades, ...auras];

  // Filter by civ and deduplicate
  const seen = new Set();
  const filtered = [];
  for (const item of allItems) {
    if (!filterTechByCiv(item, selectedCiv)) continue;
    const key = getTechKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(item);
  }

  if (filtered.length === 0) {
    box.style.display = "none";
    container.innerHTML = "";
    return;
  }

  box.style.display = "";

  // Group by display category
  const groups = {
    attack: [],
    armor: [],
    hitpoints: [],
    attackSpeed: [],
    range: [],
    nonCombat: [],
  };
  const groupLabels = {
    attack: "Attack",
    armor: "Armor",
    hitpoints: "Hitpoints",
    attackSpeed: "Attack Speed",
    range: "Range",
    nonCombat: "Other",
  };

  for (const item of filtered) {
    if (isCombatCategory(item.category)) {
      (groups[item.category] || groups.attack).push(item);
    } else {
      groups.nonCombat.push(item);
    }
  }

  let html = "";
  for (const [groupKey, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    html += `<div class="tech-group-label">${groupLabels[groupKey]}</div><div class="tech-grid">`;
    for (const item of items) {
      const key = getTechKey(item);
      const effects = TECH_EFFECTS[key];
      const isCombat = isCombatCategory(item.category);
      const isActive = activeTechs[side].has(key);
      const isUnmodeled = isCombat && !effects;
      const hasLevels = effects && Object.values(effects).some((v) => Array.isArray(v) && !["labels"].includes(v));
      const labels = effects?.labels;
      const imgSrc = getTechImage(item.name);
      const activeClass = isActive ? " active" : "";
      const nonCombatClass = (!isCombat || isUnmodeled) ? " non-combat" : "";
      const tooltipSuffix = isUnmodeled ? " (not modeled)" : "";
      const tooltip = `${item.name}: ${item.description || ""}${tooltipSuffix}`.replace(/"/g, "&quot;");

      if (hasLevels && labels && isCombat) {
        const currentLevel = activeTechs[side].get(key)?.level || 0;
        html += `<div class="tech-level-wrap">`;
        html += `<div class="tech-btn${activeClass}" data-tech-key="${key}" data-side="${side}" title="${tooltip}">`;
        html += `<img src="${imgSrc}" alt="${item.name}" onerror="this.src='${FALLBACK_TECH_IMG}'">`;
        html += `</div>`;
        html += `<select class="tech-level-select" data-tech-key="${key}" data-side="${side}">`;
        for (let i = 0; i < labels.length; i++) {
          const sel = i === currentLevel ? " selected" : "";
          html += `<option value="${i}"${sel}>${labels[i]}</option>`;
        }
        html += `</select></div>`;
      } else {
        html += `<div class="tech-btn${activeClass}${nonCombatClass}" data-tech-key="${key}" data-side="${side}" title="${tooltip}">`;
        html += `<img src="${imgSrc}" alt="${item.name}" onerror="this.src='${FALLBACK_TECH_IMG}'">`;
        html += `</div>`;
      }
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Attach click handlers for combat tech buttons
  container.querySelectorAll(".tech-btn:not(.non-combat)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.techKey;
      const s = btn.dataset.side;
      toggleTech(s, key, btn);
    });
  });

  // Attach level select handlers
  container.querySelectorAll(".tech-level-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.techKey;
      const s = sel.dataset.side;
      const state = activeTechs[s].get(key);
      if (state) {
        state.level = parseInt(sel.value) || 0;
        syncTechBuffsToInputs(s);
      }
    });
  });

  // Reverse sync: effect checkboxes → tech buttons
  const effectsContainer = document.getElementById(`${side}_effectsContainer`);
  if (effectsContainer) {
    effectsContainer.querySelectorAll(".effect-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (_syncingTechEffect) return;
        _syncingTechEffect = true;
        const effectId = cb.dataset.effect;
        const techName = Object.keys(TECH_TO_EFFECT).find(
          (k) => TECH_TO_EFFECT[k] === effectId,
        );
        if (techName) {
          // Find any tech button whose key starts with this tech name
          const techBtn = container.querySelector(
            `.tech-btn[data-tech-key^="${techName}|"]`,
          );
          if (techBtn) {
            const key = techBtn.dataset.techKey;
            const isActive = activeTechs[side].has(key);
            if (cb.checked !== isActive) {
              toggleTech(side, key, techBtn);
            }
          }
        }
        _syncingTechEffect = false;
      });
    });
  }
}

function renderBuildingUnitTechs(side) {
  const box = document.getElementById(`${side}_buildingUnitTechBox`);
  const container = document.getElementById(`${side}_buildingUnitTechContainer`);
  if (!box || !container) return;

  const unitName = document.getElementById(`unit${side}Select`)?.dataset.value;
  const unit = units[unitName];
  if (!unit) {
    box.style.display = "none";
    return;
  }

  const selectedCiv = side === "A" ? selectedCivA : selectedCivB;
  const upgrades = getMergedUpgradesForUnit(unit);
  const auras = unit.auras || [];
  const allItems = [...upgrades, ...auras];

  // Filter to siege/torch-relevant techs only
  const seen = new Set();
  const filtered = [];
  for (const item of allItems) {
    if (!filterTechByCiv(item, selectedCiv)) continue;
    const key = getTechKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    const desc = (item.description || "").toLowerCase();
    const name = (item.name || "").toLowerCase();
    if (
      desc.includes("siege") ||
      desc.includes("torch") ||
      desc.includes("fire") ||
      name.includes("additional torches") ||
      name.includes("incendiary arrows")
    ) {
      filtered.push(item);
    }
  }

  if (filtered.length === 0) {
    box.style.display = "none";
    container.innerHTML = "";
    return;
  }

  box.style.display = "";
  let html = '<div class="tech-grid">';
  for (const item of filtered) {
    const key = getTechKey(item);
    const isActive = activeTechs[side].has(key);
    const imgSrc = getTechImage(item.name);
    const activeClass = isActive ? " active" : "";
    const tooltip = `${item.name}: ${item.description || ""}`.replace(
      /"/g,
      "&quot;",
    );
    html += `<div class="tech-btn${activeClass}" data-tech-key="${key}" data-side="${side}" title="${tooltip}">`;
    html += `<img src="${imgSrc}" alt="${item.name}" onerror="this.src='${FALLBACK_TECH_IMG}'">`;
    html += `</div>`;
  }
  html += "</div>";
  container.innerHTML = html;

  // Attach click handlers
  container.querySelectorAll(".tech-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.techKey;
      const s = btn.dataset.side;
      toggleTech(s, key, btn);
      // Also update the torch damage input
      const torchDmgEl = document.getElementById(`${s}_torchDamage`);
      if (torchDmgEl) {
        let torchBonus = 0;
        for (const [tk] of activeTechs[s]) {
          const tn = tk.split("|")[0].toLowerCase();
          if (tn.includes("additional torches")) {
            if (tn.includes("improved")) torchBonus += 2;
            else torchBonus += 3;
          }
        }
        const age =
          parseInt(document.getElementById(`unit${s}Age`)?.value) || 2;
        const baseTorch = TORCH_BY_AGE[age] || 13;
        torchDmgEl.value = baseTorch + torchBonus;
      }
    });
  });
}

let _syncingTechEffect = false;

function toggleTech(side, techKey, btnEl) {
  if (activeTechs[side].has(techKey)) {
    activeTechs[side].delete(techKey);
    btnEl.classList.remove("active");
  } else {
    // Find the level select if it exists
    const wrap = btnEl.closest(".tech-level-wrap");
    const levelSel = wrap?.querySelector(".tech-level-select");
    const level = levelSel ? parseInt(levelSel.value) || 0 : 0;
    activeTechs[side].set(techKey, { level });
    btnEl.classList.add("active");
  }
  syncTechBuffsToInputs(side);

  // Sync linked effect toggle (tech button or checkbox)
  if (!_syncingTechEffect) {
    _syncingTechEffect = true;
    const techName = techKey.split("|")[0];
    const effectId = TECH_TO_EFFECT[techName];
    if (effectId) {
      const isNowActive = activeTechs[side].has(techKey);
      // Try tech toggle button first
      const techToggle = document.querySelector(
        `#${side}_effectsContainer .effect-tech-toggle[data-effect="${effectId}"]`
      );
      if (techToggle) {
        techToggle.classList.toggle("active", isNowActive);
      } else {
        // Fall back to checkbox
        const checkbox = document.querySelector(
          `#${side}_effectsContainer .effect-checkbox[data-effect="${effectId}"]`
        );
        if (checkbox) {
          checkbox.checked = isNowActive;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    _syncingTechEffect = false;
  }
}

const prevTechMins = { A: {}, B: {} };

function syncTechBuffsToInputs(side) {
  const totals = {
    attackAbs: 0,
    meleeArmor: 0,
    rangedArmor: 0,
    hpAbs: 0,
    attackPct: 0,
    hpPct: 0,
    speedPct: 0,
  };

  for (const [key, state] of activeTechs[side]) {
    const fx = TECH_EFFECTS[key];
    if (!fx) continue;
    for (const prop of Object.keys(totals)) {
      const val = fx[prop];
      if (val === undefined) continue;
      totals[prop] += Array.isArray(val) ? (val[state.level] ?? 0) : val;
    }
  }

  // Map totals to buff input field IDs
  const fieldMap = {
    attackAbs: `${side}_buffAttackAbs`,
    meleeArmor: `${side}_buffMeleeArmor`,
    rangedArmor: `${side}_buffRangedArmor`,
    hpAbs: `${side}_buffHPabs`,
    attackPct: `${side}_buffAttackPct`,
    hpPct: `${side}_buffHPpct`,
    speedPct: `${side}_buffSpeedPct`,
  };

  for (const [prop, fieldId] of Object.entries(fieldMap)) {
    const input = document.getElementById(fieldId);
    if (!input) continue;
    const techMin = totals[prop];
    const prevMin = prevTechMins[side][prop] || 0;
    const current = parseFloat(input.value) || 0;
    if (techMin < prevMin) {
      input.value = Math.max(techMin, current - (prevMin - techMin));
    } else if (current < techMin) {
      input.value = techMin;
    }
    prevTechMins[side][prop] = techMin;
    input.min = techMin;
    // Visual indicator when tech-driven
    if (techMin > 0) {
      input.style.borderColor = "rgba(212, 164, 74, 0.4)";
    } else {
      input.style.borderColor = "";
    }
  }

  // Sum bonus damage from techs (bonusVs: { "Heavy": 5 })
  const bonusTotals = {};
  for (const [key, state] of activeTechs[side]) {
    const fx = TECH_EFFECTS[key];
    if (!fx?.bonusVs) continue;
    for (const [tag, val] of Object.entries(fx.bonusVs)) {
      const v = Array.isArray(val) ? (val[state.level] ?? 0) : val;
      bonusTotals[tag] = (bonusTotals[tag] || 0) + v;
    }
  }

  // Apply tech-provided bonus minimums to bonus input fields
  for (const [tag, techMin] of Object.entries(bonusTotals)) {
    const safeTag = tag.replace(/\s+/g, "_");
    const input = document.getElementById(`${side}_bonus_${safeTag}`);
    if (!input) continue;
    const prevKey = `bonus_${safeTag}`;
    const prevMin = prevTechMins[side][prevKey] || 0;
    const current = parseFloat(input.value) || 0;
    if (techMin < prevMin) {
      input.value = Math.max(techMin, current - (prevMin - techMin));
    } else if (current < techMin) {
      input.value = techMin;
    }
    prevTechMins[side][prevKey] = techMin;
    input.min = techMin;
    input.style.borderColor = techMin > 0 ? "rgba(212, 164, 74, 0.4)" : "";
  }

  // Reset bonus inputs that no longer have tech minimums
  for (const key of Object.keys(prevTechMins[side])) {
    if (!key.startsWith("bonus_")) continue;
    const tag = key.slice(6);
    if (bonusTotals[tag.replace(/_/g, " ")] > 0) continue;
    const input = document.getElementById(`${side}_bonus_${tag}`);
    if (!input) continue;
    prevTechMins[side][key] = 0;
    input.min = 0;
    input.style.borderColor = "";
  }
}

// Enforce minimums on buff inputs (prevent going below tech-provided values)
function initTechInputEnforcement() {
  const fields = [
    "buffAttackAbs",
    "buffMeleeArmor",
    "buffRangedArmor",
    "buffHPabs",
    "buffAttackPct",
    "buffHPpct",
    "buffSpeedPct",
  ];
  for (const fieldId of fields) {
    for (const side of ["A", "B"]) {
      const input = document.getElementById(`${side}_${fieldId}`);
      if (!input) continue;
      input.addEventListener("input", () => {
        const min = parseFloat(input.min) || 0;
        if ((parseFloat(input.value) || 0) < min) {
          input.value = min;
        }
      });
    }
  }
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
  let civs = (unit.civs || ["Common"]).filter(
    (c) => c !== "Common" && CIV_FLAGS[c],
  );
  // If a preferred civ is specified and it's in the list, put it first
  if (preferredCiv && civs.includes(preferredCiv)) {
    civs = [preferredCiv, ...civs.filter((c) => c !== preferredCiv)];
  }
  return civs
    .map(
      (c) =>
        `<img src="${CIV_FLAGS[c]}" alt="${c}" style="height:${imgHeight}px; border-radius:2px;">`,
    )
    .join("");
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
  dropdown
    .querySelectorAll(".custom-select-optgroup, .custom-select-option")
    .forEach((el) => el.remove());
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
  const civs = (BUILDINGS[buildingName]?.civs || []).filter(
    (civ) => CIV_FLAGS[civ],
  );
  return civs
    .map(
      (civ) =>
        `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:${size}px; border-radius:3px; vertical-align:middle;">`,
    )
    .join("");
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
    const options = Array.from(group.querySelectorAll("option")).filter(
      (opt) => {
        const label = (opt.textContent || opt.value || "").toLowerCase();
        return !filterLower || label.includes(filterLower);
      },
    );
    if (!options.length) return;
    html += `<div class="custom-select-optgroup">${group.label}</div>`;
    options.forEach((opt) => {
      const value = opt.value;
      const sel = value === currentVal ? " selected" : "";
      const flags = getBuildingFlagHtml(value, 16);
      html += `<div class="custom-select-option${sel}" data-value="${value}"><span>${value}</span><span class="cs-opt-flags">${flags}</span></div>`;
    });
  });

  dropdown
    .querySelectorAll(".custom-select-optgroup, .custom-select-option")
    .forEach((el) => el.remove());
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
      document
        .querySelectorAll(".custom-select-wrapper")
        .forEach((w) => closeDropdown(w));
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

  wrapper.dataset.value =
    nativeSelect.value || wrapper.dataset.value || "Capital Town Center";
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
      document
        .querySelectorAll(".custom-select-wrapper")
        .forEach((w) => closeDropdown(w));
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
    document
      .querySelectorAll(".custom-select-wrapper")
      .forEach((w) => closeDropdown(w));
  }
});

document.addEventListener(
  "wheel",
  (e) => {
    const dropdown = e.target.closest(".custom-select-dropdown.show");
    if (!dropdown) return;
    const canScroll = dropdown.scrollHeight > dropdown.clientHeight;
    if (!canScroll) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const atTop = dropdown.scrollTop <= 0;
    const atBottom =
      dropdown.scrollTop + dropdown.clientHeight >= dropdown.scrollHeight - 1;
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
      e.preventDefault();
    }
    e.stopPropagation();
  },
  { passive: false },
);

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
      document
        .querySelectorAll(".custom-select-wrapper")
        .forEach((w) => closeDropdown(w));
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

  getResolvedCivOrder().forEach((civ) => {
    if (civ === "Common") return;
    if (filterLower && !civ.toLowerCase().includes(filterLower)) return;
    const sel = civ === currentVal ? " selected" : "";
    const flag = CIV_FLAGS[civ]
      ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:18px; border-radius:2px;">`
      : "";
    html += `<div class="custom-select-option${sel}" data-value="${civ}"><span>${flag} ${civ}</span></div>`;
  });

  // Remove old options
  dropdown
    .querySelectorAll(".custom-select-option")
    .forEach((el) => el.remove());
  searchInput.insertAdjacentHTML("afterend", html);

  // Attach click handlers
  dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
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
  if (side === "A") selectedCivA = civ;
  else selectedCivB = civ;

  // Check if current unit is still available for this civ
  const unitWrapper = document.getElementById("unit" + side + "Select");
  const currentUnit = unitWrapper.dataset.value;
  if (civ) {
    const available = getUnitsForCiv(civ);
    if (!available.includes(currentUnit)) {
      unitWrapper.dataset.value = available[0] || "Horseman";
      updateSelectHeader(unitWrapper);
    }
    // Always refresh stats and tech buttons for the new civ
    updateUnitStats(side);
  }

  // Re-render unit dropdown if open
  const dropdown = unitWrapper.querySelector(".custom-select-dropdown");
  if (dropdown && dropdown.classList.contains("show")) {
    renderDropdownOptions(
      unitWrapper,
      unitWrapper.querySelector(".custom-select-search").value,
    );
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
  const { hasSecondary, supportsBoth } = getWeaponModeOptionState(
    unitName,
    unit,
    age,
  );

  const secondaryRadio = document.getElementById(`secondary${side}`);
  const bothRadio = document.getElementById(`both${side}`);
  const primaryRadio = document.getElementById(`primary${side}`);
  const bothLabel = document.querySelector(`label[for="both${side}"]`);

  secondaryRadio.disabled = !hasSecondary;
  bothRadio.disabled = !supportsBoth;

  const selectedMode =
    document.querySelector(`input[name="weaponMode${side}"]:checked`)?.value ||
    "primary";
  if (
    (!hasSecondary && selectedMode === "secondary") ||
    (!supportsBoth && selectedMode === "both")
  ) {
    primaryRadio.checked = true;
  }

  // Update button labels based on weapon names or type
  const primaryLabel = document.querySelector(`label[for="primary${side}"]`);
  const secondaryLabel = document.querySelector(
    `label[for="secondary${side}"]`,
  );
  const weaponInfoEl = document.getElementById(`weaponInfo${side}`);

  secondaryLabel.style.display = hasSecondary ? "" : "none";
  bothLabel.style.display = supportsBoth ? "" : "none";

  if (hasSecondary) {
    // Multi-weapon unit with named weapons
    primaryLabel.textContent = getWeaponDisplayName(unit.weapons.primary);
    secondaryLabel.textContent = getWeaponDisplayName(unit.weapons.secondary);
    bothLabel.textContent = "Both Attacks";

    // Show weapon info line
    const priAge = unit.weapons.primary.ages[age] || {};
    const secAge = unit.weapons.secondary.ages[age] || {};
    weaponInfoEl.textContent =
      `${getWeaponInfoText(unit.weapons.primary, priAge)} | ${getWeaponInfoText(unit.weapons.secondary, secAge)}`;
    weaponInfoEl.style.display = "";
  } else {
    // Single-weapon unit: label as Melee/Ranged
    const typeLabel =
      (unit.weapons.primary.type || "melee") === "ranged" ? "Ranged" : "Melee";
    primaryLabel.textContent = typeLabel;
    secondaryLabel.textContent = "Secondary";
    bothLabel.textContent = "Both";
    weaponInfoEl.textContent = "";
    weaponInfoEl.style.display = "none";
  }
}

function updateSecondaryWeaponInputs(side, unitName, unit, age, weaponMode) {
  const wrapper = document.getElementById(`${side}_secondaryWeaponFields`);
  if (!wrapper) return;
  const supportsBoth =
    weaponMode === "both" && unitSupportsBothWeapons(unitName, unit, age);
  if (!supportsBoth) {
    wrapper.style.display = "none";
    return;
  }

  const secondaryWeapon = unit.weapons.secondary;
  const secondaryStats = secondaryWeapon.ages[age] || {};
  const secondaryName = getWeaponDisplayName(secondaryWeapon);

  document.getElementById(`${side}_secondaryWeaponHeading`).textContent =
    secondaryName;
  document.getElementById(`${side}_secondaryAttackLabel`).textContent =
    `${secondaryName} Attack`;
  document.getElementById(`${side}_secondaryAttackSpeedLabel`).textContent =
    `${secondaryName} Speed (s)`;
  document.getElementById(`${side}_secondaryAttack`).value =
    secondaryStats.attack || "";
  document.getElementById(`${side}_secondaryAttackSpeed`).value =
    secondaryWeapon.attackSpeed || 1;
  wrapper.style.display = "";
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
    `#${side}_bonusesContainer .bonus-input`,
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
    `#${side}_tagsContainer .tag-checkbox:checked`,
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
    if (effect.civs && selectedCiv && !effect.civs.includes(selectedCiv))
      continue;
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
      const delayVal =
        effectId === "staticDeployment" ? effect.delay : effect.duration;
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
    } else if (effectId === "tripleShot") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <small class="text-muted" style="font-size:0.72rem;">Adds 2 extra arrows at 30% damage each and upgrades bleed to 3.2 DPS for 6s.</small>
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
    } else if (effectId === "numeri") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_dmgIncrease" class="form-control form-control-sm"
                   value="${effect.dmgIncrease}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Dmg Taken %</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "triumph") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-3">
            <input type="number" id="${checkId}_attackBonus" class="form-control form-control-sm"
                   value="${effect.attackBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Atk</small>
          </div>
          <div class="col-3">
            <input type="number" id="${checkId}_hps" class="form-control form-control-sm"
                   value="${effect.hps}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">HP/s</small>
          </div>
          <div class="col-3">
            <input type="number" id="${checkId}_speedPct" class="form-control form-control-sm"
                   value="${effect.speedPct}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Spd %</small>
          </div>
          <div class="col-3">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
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
    } else if (effectId === "poisonedArrows") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" id="${checkId}_totalDamage" class="form-control form-control-sm"
                   value="${effect.totalDamage}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Total Damage</small>
          </div>
          <div class="col-6">
            <input type="number" id="${checkId}_duration" class="form-control form-control-sm"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    }

    // Use tech button icon for effects that have a linked tech, checkbox otherwise
    const linkedTech = EFFECT_TO_TECH[effectId];
    if (linkedTech) {
      const techImg = getTechImage(linkedTech);
      container.innerHTML += `
        <div class="mb-2 effect-row" data-effect="${effectId}">
          <div class="d-flex align-items-center gap-2">
            <div class="tech-btn effect-tech-toggle active" data-effect="${effectId}"
                 style="width:28px;height:28px;min-width:28px;" title="${linkedTech}">
              <img src="${techImg}" alt="${effect.name}" onerror="this.src='${FALLBACK_TECH_IMG}'">
            </div>
            <label class="effect-label" style="font-size:0.85rem;">
              <strong>${effect.name}</strong>
              <span style="font-size:0.75rem; color:#b8ad9e;"> — ${effect.description}</span>
            </label>
          </div>
          <div class="effect-value-area">${valueHtml}</div>
        </div>`;
    } else {
      container.innerHTML += `
        <div class="mb-2 effect-row">
          <div class="form-check">
            <input class="form-check-input effect-checkbox" type="checkbox" id="${checkId}"
                   data-effect="${effectId}" checked>
            <label class="form-check-label" for="${checkId}" style="font-size:0.85rem;">
              <strong>${effect.name}</strong>
              <span style="font-size:0.75rem; color:#b8ad9e;"> — ${effect.description}</span>
            </label>
          </div>
          <div class="effect-value-area">${valueHtml}</div>
        </div>`;
    }
  }

  // Hide effects box if all effects were filtered out by civ
  if (!container.innerHTML.trim()) {
    box.style.display = "none";
  }

  // Attach click handlers for effect tech toggle buttons
  container.querySelectorAll(".effect-tech-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      // Sync with tech button in tech container
      if (!_syncingTechEffect) {
        _syncingTechEffect = true;
        const effectId = btn.dataset.effect;
        const techName = EFFECT_TO_TECH[effectId];
        if (techName) {
          const techContainer = document.getElementById(`${side}_techContainer`);
          const techBtn = techContainer?.querySelector(
            `.tech-btn[data-tech-key^="${techName}|"]`,
          );
          if (techBtn) {
            const key = techBtn.dataset.techKey;
            const isActive = activeTechs[side].has(key);
            const nowActive = btn.classList.contains("active");
            if (nowActive !== isActive) {
              toggleTech(side, key, techBtn);
            }
          }
        }
        _syncingTechEffect = false;
      }
    });
  });
}

/**
 * Collect enabled effects and their values from the UI
 */
function collectEffects(side) {
  const effects = {};
  const container = document.getElementById(`${side}_effectsContainer`);
  if (!container) return effects;

  // Collect from both checkbox effects and tech-toggle effects
  const enabledEffectIds = new Set();
  container.querySelectorAll(".effect-checkbox").forEach((cb) => {
    if (cb.checked) enabledEffectIds.add(cb.dataset.effect);
  });
  container.querySelectorAll(".effect-tech-toggle.active").forEach((btn) => {
    enabledEffectIds.add(btn.dataset.effect);
  });

  enabledEffectIds.forEach((effectId) => {
    const checkId = `${side}_effect_${effectId}`;
    const getVal = (suffix) =>
      parseFloat(document.getElementById(`${checkId}_${suffix}`)?.value) || 0;

    if (effectId === "postChargeAttackBuff") {
      effects.postChargeAttackBuff = {
        value: getVal("value"),
        duration: getVal("duration"),
      };
    } else if (effectId === "healPerAttack") {
      effects.healPerAttack = { value: getVal("value") };
    } else if (effectId === "berserking") {
      effects.berserking = {
        attackBonus: getVal("attackBonus"),
        armorPenalty: getVal("armorPenalty"),
        duration: getVal("duration"),
      };
    } else if (effectId === "fortitude") {
      effects.fortitude = {
        atkSpeedBonus: getVal("atkSpeedBonus"),
        dmgTakenIncrease: getVal("dmgTakenIncrease"),
        duration: getVal("duration"),
      };
    } else if (effectId === "deployPavise") {
      effects.deployPavise = {
        armorBonus: getVal("armorBonus"),
        duration: getVal("duration"),
      };
    } else if (effectId === "arrowVolley") {
      effects.arrowVolley = {
        atkSpeedBonus: getVal("atkSpeedBonus"),
        duration: getVal("duration"),
      };
    } else if (effectId === "staticDeployment") {
      effects.staticDeployment = {
        atkSpeedBonus: getVal("atkSpeedBonus"),
        delay: getVal("delay"),
      };
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
      effects.shieldWall = {
        atkSpeedPenalty: getVal("atkSpeedPenalty"),
        rangedDmgReduction: getVal("rangedDmgReduction"),
      };
    } else if (effectId === "bleed") {
      effects.bleed = { dps: getVal("dps"), duration: getVal("duration") };
    } else if (effectId === "tripleShot") {
      effects.tripleShot = true;
    } else if (effectId === "armorAura") {
      effects.armorAura = { armorBonus: getVal("armorBonus") };
    } else if (effectId === "trample") {
      effects.trample = {
        dps: getVal("dps"),
        duration: getVal("duration"),
        cooldown: getVal("cooldown"),
        unitsHit: getVal("unitsHit") || 3,
      };
    } else if (effectId === "numeri") {
      effects.numeri = {
        dmgIncrease: getVal("dmgIncrease"),
        duration: getVal("duration"),
      };
    } else if (effectId === "triumph") {
      effects.triumph = {
        attackBonus: getVal("attackBonus"),
        hps: getVal("hps"),
        speedPct: getVal("speedPct"),
        duration: getVal("duration"),
      };
    } else if (effectId === "percentDamage") {
      effects.percentDamage = { percent: getVal("percent") };
    } else if (effectId === "brotherhoodHP") {
      effects.brotherhoodHP = { hpPerUnit: getVal("hpPerUnit") };
    } else if (effectId === "healAura") {
      effects.healAura = { hps: getVal("hps") };
    } else if (effectId === "atkSpeedDebuff") {
      effects.atkSpeedDebuff = {
        reduction: getVal("reduction"),
        duration: getVal("duration"),
      };
    } else if (effectId === "caracole") {
      effects.caracole = {
        speedBonus: getVal("speedBonus"),
        duration: getVal("duration"),
        cooldown: getVal("cooldown"),
      };
    } else if (effectId === "armorDebuffAura") {
      effects.armorDebuffAura = { armorReduction: getVal("armorReduction") };
    } else if (effectId === "battleGlory") {
      effects.battleGlory = {
        hpPerKill: getVal("hpPerKill"),
        attackPerKill: getVal("attackPerKill"),
      };
    } else if (effectId === "aoeSplash") {
      effects.aoeSplash = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "aoeFalloff") {
      effects.aoeFalloff = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "armorPenetration") {
      effects.armorPenetration = { penetration: getVal("penetration") };
    } else if (effectId === "dmgDebuffOnHit") {
      effects.dmgDebuffOnHit = {
        reduction: getVal("reduction"),
        duration: getVal("duration"),
      };
    } else if (effectId === "spearwall") {
      effects.spearwall = { stunDuration: getVal("stunDuration") };
    } else if (effectId === "palings") {
      effects.palings = {
        stunDuration: getVal("stunDuration"),
        damage: getVal("damage"),
      };
    } else if (effectId === "movementBurst") {
      effects.movementBurst = {
        speedBonus: getVal("speedBonus"),
        duration: getVal("duration"),
      };
    } else if (effectId === "infantrySpeedAura") {
      effects.infantrySpeedAura = { speedBonus: getVal("speedBonus") };
    } else if (effectId === "poisonedArrows") {
      effects.poisonedArrows = {
        totalDamage: getVal("totalDamage"),
        duration: getVal("duration"),
      };
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
  const weaponMode =
    document.querySelector(`input[name="weaponMode${side}"]:checked`)?.value ||
    "primary";

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
  updateSecondaryWeaponInputs(side, unitName, unit, age, weaponMode);

  // Render unique effects, tag checkboxes, and bonus inputs
  renderEffects(side, unit.effects || {});
  renderTagCheckboxes(side, unit.tags || []);
  renderBonusInputs(side, stats.bonus || {});
  renderTechButtons(side, unitName, unit);

  // Also update building unit techs if in vs-building mode
  if (document.getElementById("vsBuildingToggle")?.checked && side === "A") {
    renderBuildingUnitTechs("A");
  }

  // Show charge damage indicator if unit has charge
  const chargeInfo = document.getElementById(`${side}_chargeInfo`);
  const chargeDmg = stats.chargeDamage || 0;
  if (chargeDmg > 0) {
    chargeInfo.style.display = "";
    document.getElementById(`${side}_chargeDamage`).textContent =
      `+${chargeDmg} (first hit)`;
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
  const selectedCivGroup =
    document.getElementById(`unit${side}Select`).dataset.civGroup || "";

  // Update card title: name left, flags right
  const titleEl = document.getElementById(`title${side}`);
  if (titleEl) {
    let civs = (unit.civs || ["Common"]).filter(
      (c) => c !== "Common" && CIV_FLAGS[c],
    );
    if (selectedCivGroup && civs.includes(selectedCivGroup)) {
      civs = [selectedCivGroup, ...civs.filter((c) => c !== selectedCivGroup)];
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
    let civs = (unit.civs || ["Common"]).filter(
      (c) => c !== "Common" && CIV_FLAGS[c],
    );
    if (selectedCivGroup && civs.includes(selectedCivGroup)) {
      civs = [selectedCivGroup, ...civs.filter((c) => c !== selectedCivGroup)];
    }
    setFlagBackground(card, civs);
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

let unitDetailModalInstance = null;
let unitDetailModalCleanupBound = false;

function cleanupUnitDetailModalState() {
  if (document.querySelector(".modal.show")) return;
  document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
}

function getUnitDetailModalInstance() {
  const modalEl = document.getElementById("unitDetailModal");
  if (!modalEl || !window.bootstrap?.Modal) return null;
  unitDetailModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
  if (!unitDetailModalCleanupBound) {
    modalEl.addEventListener("hidden.bs.modal", cleanupUnitDetailModalState);
    unitDetailModalCleanupBound = true;
  }
  return unitDetailModalInstance;
}

function setUnitTitleInteractivity(side, enabled) {
  const titleEl = document.getElementById(`title${side}`);
  if (!titleEl) return;
  titleEl.style.cursor = enabled ? "pointer" : "default";
  titleEl.onclick = enabled ? (() => showUnitDetail(side)) : null;
}

function showUnitDetailWith({ unitName, age, side, selectedCiv }) {
  const unit = units[unitName];
  if (!unit) return;

  const selectedAgeKey = String(age || "2");
  const ageNames = {
    1: "Dark Age",
    2: "Feudal Age",
    3: "Castle Age",
    4: "Imperial Age",
  };
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
      const flag = CIV_FLAGS[civ]
        ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:14px; border-radius:2px; vertical-align:middle;">`
        : civ;
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
  const weaponTypes = [
    ["primary", "Primary"],
    ["secondary", "Secondary"],
  ];
  for (const [wKey, wLabel] of weaponTypes) {
    const weapon = unit.weapons[wKey];
    if (!weapon) continue;

    weaponsHtml += `<h6 style="color:${teamColor}; margin-top:12px; font-family:'Cinzel',serif;">${wLabel} — ${weapon.type.charAt(0).toUpperCase() + weapon.type.slice(1)}</h6>`;
    weaponsHtml += `<div style="font-size:0.8rem; color:#b8ad9e; margin-bottom:8px;">Attack Speed: ${weapon.attackSpeed}s | Range: ${weapon.range}</div>`;
    weaponsHtml += `<div class="table-responsive"><table class="table table-sm" style="color:#e0d6c2; font-size:0.85rem;">`;
    weaponsHtml += `<thead><tr style="border-color:#444;"><th>Age</th><th>HP</th><th>Atk</th><th>M.Arm</th><th>R.Arm</th><th>Charge</th><th>Bonuses</th></tr></thead><tbody>`;

    for (const [ageKey, ageStats] of Object.entries(weapon.ages)) {
      const bonuses = ageStats.bonus
        ? Object.entries(ageStats.bonus)
            .map(([t, v]) => `+${v} vs ${t}`)
            .join(", ")
        : "—";
      const charge = ageStats.chargeDamage ? `+${ageStats.chargeDamage}` : "—";
      const isSelected = ageKey === selectedAgeKey;
      const rowStyle = isSelected
        ? `background:rgba(${teamColorRgb},0.15); font-weight:600;`
        : "";
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

  const tags = (unit.tags || [])
    .map(
      (t) =>
        `<span style="display:inline-block; padding:2px 10px; margin:2px; border-radius:12px; font-size:0.75rem; background:rgba(212,164,74,0.15); color:#d4a44a; border:1px solid rgba(212,164,74,0.3);">${t}</span>`,
    )
    .join("");

  // Merge per-unit upgrades with global tech rules (e.g. Military Academy, Increased Supplies)
  const mergedUpgrades = getMergedUpgradesForUnit(unit);

  // Collect all unique civs from upgrades + auras for filter dropdown
  const allEntryCivs = new Set();
  for (const item of [...mergedUpgrades, ...(unit.auras || [])]) {
    if (item.civs) item.civs.forEach((c) => allEntryCivs.add(c));
  }
  const sortedEntryCivs = CIV_ORDER.filter((c) => allEntryCivs.has(c));

  // Build civ filter dropdown (only if there are civ-specific entries)
  let civFilterHtml = "";
  if (sortedEntryCivs.length > 0) {
    let opts = `<option value="all">All Civilizations</option>`;
    sortedEntryCivs.forEach((civ) => {
      opts += `<option value="${civ}">${civ}</option>`;
    });
    civFilterHtml = `<div style="margin-top:16px; margin-bottom:8px;">
      <select id="civFilterSelect" class="form-select civ-filter-select" onchange="filterByCiv(this.value)">
        ${opts}
      </select>
    </div>`;
  }

  const catLabels = {
    hitpoints: "Hit Points",
    attack: "Attack",
    armor: "Armor",
    attackSpeed: "Attack Speed",
    moveSpeed: "Move Speed",
    range: "Range",
    creationSpeed: "Creation Speed",
    upgrading: "Upgrading",
    ability: "Ability",
    cost: "Cost",
    other: "Other",
  };
  const catIcons = {
    hitpoints: "\u2764\uFE0F",
    attack: "\u2694\uFE0F",
    armor: "\uD83D\uDEE1\uFE0F",
    attackSpeed: "\u23F1\uFE0F",
    moveSpeed: "\uD83D\uDC5F",
    range: "\uD83C\uDFAF",
    creationSpeed: "\u23F3",
    upgrading: "\u2B06\uFE0F",
    ability: "\u2728",
    cost: "\uD83D\uDCB0",
    other: "\u2699\uFE0F",
  };
  const flagImg = (civ) =>
    CIV_FLAGS[civ]
      ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:16px; border-radius:2px; vertical-align:middle;">`
      : `<span style="font-size:0.7rem; color:#b8ad9e;" title="${civ}">${civ}</span>`;

  // Helper: render entries with category headers and civ sub-group headers (wiki-style)
  function renderEntries(
    entries,
    containerId,
    accentColor,
    accentBg,
    accentText,
  ) {
    const catOrder = [
      "attackSpeed",
      "attack",
      "armor",
      "hitpoints",
      "moveSpeed",
      "range",
      "creationSpeed",
      "upgrading",
      "ability",
      "cost",
      "other",
    ];
    const byCategory = {};
    for (const e of entries) {
      if (!byCategory[e.category]) byCategory[e.category] = [];
      byCategory[e.category].push(e);
    }
    const sortedCats = Object.keys(byCategory).sort(
      (a, b) => catOrder.indexOf(a) - catOrder.indexOf(b),
    );
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
          if (!exceptGroups[key])
            exceptGroups[key] = { exceptCivs: e.exceptCivs, entries: [] };
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

      const hasMultipleSections =
        namedGroups.length +
          Object.keys(exceptGroups).length +
          (universal.length > 0 ? 1 : 0) +
          (unique.length > 0 ? 1 : 0) >
        1;

      // 1. Named civ groups (e.g. "Japanese, Sengoku Daimyo")
      for (const grp of namedGroups) {
        const label = grp.civs.map((c) => `${flagImg(c)} ${c}`).join(", ");
        const civAttr = grp.civs.join(",");
        html += `<div class="tech-subheader tech-entry" data-civs="${civAttr}" style="${subStyle}">${label}</div>`;
        for (const e of grp.entries) html += renderSingleEntry(e, false);
      }

      // 2. Except groups (e.g. "All except Japanese, Sengoku Daimyo, Macedonian Dynasty")
      for (const grp of Object.values(exceptGroups)) {
        const exceptLabel = grp.exceptCivs
          .map((c) => `${flagImg(c)} ${c}`)
          .join(", ");
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
    const civAttr = hasExcept ? "all" : hasCivs ? e.civs.join(",") : "all";
    const exceptAttr = hasExcept ? e.exceptCivs.join(",") : "";
    let civInfo =
      showFlags && hasCivs
        ? `<span style="margin-left:6px;">${e.civs.map((c) => flagImg(c)).join(" ")}</span>`
        : "";
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
    upgradesHtml += renderEntries(
      mergedUpgrades,
      "upgradesContainer",
      "rgba(212,164,74,0.2)",
      "rgba(212,164,74,0.12)",
      "#d4a44a",
    );
  }

  // Build aura buffs detail
  let aurasHtml = "";
  if (unit.auras && unit.auras.length > 0) {
    aurasHtml = `<h6 style="color:${teamColor}; margin-top:16px; font-family:'Cinzel',serif;">Aura Buffs</h6>`;
    aurasHtml += renderEntries(
      unit.auras,
      "aurasContainer",
      "rgba(100,180,255,0.2)",
      "rgba(100,180,255,0.08)",
      "#6ab4ff",
    );
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

  cleanupUnitDetailModalState();
  const modal = getUnitDetailModalInstance();
  modal?.show();

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
  entries.forEach((el) => {
    const civs = el.dataset.civs;
    const exceptCivs = el.dataset.exceptCivs;
    let show =
      selectedCiv === "all" ||
      civs === "all" ||
      civs.split(",").includes(selectedCiv);
    // Hide if selected civ is in the exception list
    if (
      show &&
      exceptCivs &&
      selectedCiv !== "all" &&
      exceptCivs.split(",").includes(selectedCiv)
    ) {
      show = false;
    }
    el.style.display = show ? "" : "none";
  });
  // Hide category headers that have no visible entries below them
  const headers = document.querySelectorAll(".tech-cat-header");
  headers.forEach((header) => {
    let hasVisible = false;
    let next = header.nextElementSibling;
    while (next && !next.classList.contains("tech-cat-header")) {
      if (
        next.classList.contains("tech-entry") &&
        next.style.display !== "none"
      ) {
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
    const civGroup =
      document.getElementById(`unit${side}Select`).dataset.civGroup || "";
    if (civGroup && unit.civCosts[civGroup]) {
      return Object.values(unit.civCosts[civGroup]).reduce(
        (sum, val) => sum + val,
        0,
      );
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
  const weaponMode =
    document.querySelector(`input[name="weaponMode${side}"]:checked`)?.value ||
    "primary";

  let weaponData, ageStats;

  if (weaponMode === "secondary" && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    ageStats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    ageStats = weaponData.ages[age] || {};
  }
  const supportsBoth =
    weaponMode === "both" && unitSupportsBothWeapons(unitName, unit, age);
  const secondaryStats = unit.weapons.secondary?.ages?.[age] || {};

  return {
    name: unitName,
    count: parseInt(document.getElementById(`count${side}`).value) || 1,
    weaponMode: weaponMode,
    weaponLabel: getWeaponDisplayName(weaponData),
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
    weaponProjectiles: getWeaponProjectiles(weaponData),
    speed: unit.speed || 1,
    secondaryWeapon:
      supportsBoth
        ? {
            name: getWeaponDisplayName(unit.weapons.secondary),
            type: unit.weapons.secondary.type || "melee",
            attackSpeed:
              parseFloat(
                document.getElementById(`${side}_secondaryAttackSpeed`).value,
              ) || unit.weapons.secondary.attackSpeed || 1,
            range: unit.weapons.secondary.range || 0,
            projectiles: getWeaponProjectiles(unit.weapons.secondary),
            stats: {
              ...secondaryStats,
              attack:
                parseFloat(
                  document.getElementById(`${side}_secondaryAttack`).value,
                ) || secondaryStats.attack || 0,
            },
          }
        : null,
  };
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
 * Set native tooltip on Res Lost showing per-resource breakdown
 */
function setResLostTooltip(elementId, costBreakdown) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const lines = Object.entries(costBreakdown)
    .map(
      ([res, val]) => `${res.charAt(0).toUpperCase() + res.slice(1)}: ${val}`,
    )
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
    const pct = ((results.splitUnitHp / results.lastUnitHpMax) * 100).toFixed(
      0,
    );
    el.textContent = `${results.splitDamagedUnits} units damaged: ${pct}% HP each (${Math.round(results.splitUnitHp)}/${Math.round(results.lastUnitHpMax)})`;
  } else {
    const pct = ((results.lastUnitHp / results.lastUnitHpMax) * 100).toFixed(0);
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
  const partialPct = hasPartial
    ? (results.splitUnitHp / results.lastUnitHpMax) * 100
    : 100;

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
  const rangeSpeedEnabled =
    document.getElementById("rangeSpeedEnabled")?.checked;
  const splitA = document.getElementById("A_splitDamage")?.checked;
  const splitTargetsA = Math.max(
    1,
    parseInt(document.getElementById("A_splitTargets")?.value) || 1,
  );
  const splitB = document.getElementById("B_splitDamage")?.checked;
  const splitTargetsB = Math.max(
    1,
    parseInt(document.getElementById("B_splitTargets")?.value) || 1,
  );

  // --- TEAM INITIALIZATION ---
  // Each team tracks separate timers for primary and secondary weapons.
  // If no secondary weapon, its timer is Infinity (never fires).

  // Range & Speed: shorter-range unit must close distance before attacking
  let closingDelayA = 0,
    closingDelayB = 0;
  if (rangeSpeedEnabled) {
    // Spearwall/palings extend effective engagement range only vs charging cavalry
    const bIsCavalry = unitB.tags.includes("Cavalry") && unitB.chargeDamage > 0;
    const aIsCavalry = unitA.tags.includes("Cavalry") && unitA.chargeDamage > 0;
    const effectiveRangeA =
      (unitA.effects.spearwall || unitA.effects.palings) && bIsCavalry
        ? Math.max(unitA.weaponRange, 1.04)
        : unitA.weaponRange;
    const effectiveRangeB =
      (unitB.effects.spearwall || unitB.effects.palings) && aIsCavalry
        ? Math.max(unitB.weaponRange, 1.04)
        : unitB.weaponRange;
    const speedA = unitA.effects.movementBurst
      ? unitA.speed * (1 + unitA.effects.movementBurst.speedBonus / 100)
      : unitA.speed;
    const speedB = unitB.effects.movementBurst
      ? unitB.speed * (1 + unitB.effects.movementBurst.speedBonus / 100)
      : unitB.speed;
    if (effectiveRangeB > effectiveRangeA)
      closingDelayA = (effectiveRangeB - effectiveRangeA) / speedA;
    if (effectiveRangeA > effectiveRangeB)
      closingDelayB = (effectiveRangeA - effectiveRangeB) / speedB;
  }

  const primaryStartA =
    (unitA.firstHitEnabled ? -unitA.freeHits * unitA.stats.attackSpeed : 0) +
    closingDelayA;

  const primaryStartB =
    (unitB.firstHitEnabled ? -unitB.freeHits * unitB.stats.attackSpeed : 0) +
    closingDelayB;

  const trackedA = createTrackedTeamHealth(unitA.count, applyBuffs(unitA, 0).hp);
  const trackedB = createTrackedTeamHealth(unitB.count, applyBuffs(unitB, 0).hp);

  let teamA = {
    side: "A",
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
    numeriDebuffEnd: -1,
    frontUnits: trackedA.frontUnits,
    reserveUnits: trackedA.reserveUnits,
  };

  let teamB = {
    side: "B",
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
    numeriDebuffEnd: -1,
    frontUnits: trackedB.frontUnits,
    reserveUnits: trackedB.reserveUnits,
  };

  // Brotherhood HP: track base hp separately, effective hp includes brotherhood bonus
  teamA.baseHp = teamA.stats.hp;
  teamB.baseHp = teamB.stats.hp;
  if (unitA.effects.brotherhoodHP) {
    teamA.stats.hp =
      teamA.baseHp + unitA.effects.brotherhoodHP.hpPerUnit * (teamA.units - 1);
  }
  if (unitB.effects.brotherhoodHP) {
    teamB.stats.hp =
      teamB.baseHp + unitB.effects.brotherhoodHP.hpPerUnit * (teamB.units - 1);
  }

  if (Math.abs(teamA.stats.hp - teamA.baseHp) > 0.0001) {
    applyHpDeltaToTeam(teamA, teamA.stats.hp - teamA.baseHp);
  }
  if (Math.abs(teamB.stats.hp - teamB.baseHp) > 0.0001) {
    applyHpDeltaToTeam(teamB, teamB.stats.hp - teamB.baseHp);
  }
  syncTrackedTeamState(teamA);
  syncTrackedTeamState(teamB);
  const camelUneaseMultiplierAtoB = getCamelUneaseDamageMultiplier(
    teamA.tags,
    unitB.effects,
  );
  const camelUneaseMultiplierBtoA = getCamelUneaseDamageMultiplier(
    teamB.tags,
    unitA.effects,
  );

  // --- PRE-BATTLE: Opening attacks (Donso javelin, Earl's Guard dagger) ---
  function applyOpeningAttack(
    attackerUnit,
    attackerTeam,
    defenderTeam,
    defenderStats,
  ) {
    const oa = attackerUnit.effects.openingAttack;
    if (!oa) return;
    const armor = defenderStats.rangedArmor || 0;
    const camelMultiplier = getCamelUneaseDamageMultiplier(
      attackerTeam.tags,
      defenderTeam.unitData.effects,
    );
    const dmgPerUnit = calcDirectDamageAfterArmor(
      oa.damage,
      armor,
      camelMultiplier,
    );
    const totalDmg = dmgPerUnit * attackerTeam.units;
    applyBundledDamageToTeam(
      defenderTeam,
      totalDmg,
      attackerTeam.units,
      false,
      1,
      false,
    );
  }
  applyOpeningAttack(unitA, teamA, teamB, teamB.stats);
  applyOpeningAttack(unitB, teamB, teamA, teamA.stats);

  // --- PRE-BATTLE: Spearwall / Palings vs Cavalry ---
  // Stun delays enemy first attack, cancels charge bonus
  function applyAntiCav(
    defenderUnit,
    defenderTeam,
    attackerUnit,
    attackerTeam,
  ) {
    if (!attackerTeam.tags.includes("Cavalry")) return;
    // Palings (higher priority, longer stun + damage)
    const palings = defenderUnit.effects.palings;
    if (palings) {
      attackerTeam.nextPrimaryAttack = Math.max(
        attackerTeam.nextPrimaryAttack,
        palings.stunDuration,
      );
      attackerUnit.chargeDamage = 0; // cancel charge
      // Deal palings damage
      const totalDmg = palings.damage * defenderTeam.units;
      applyBundledDamageToTeam(
        attackerTeam,
        totalDmg,
        defenderTeam.units,
        false,
        1,
        false,
      );
      return;
    }
    // Spearwall
    const spearwall = defenderUnit.effects.spearwall;
    if (spearwall) {
      attackerTeam.nextPrimaryAttack = Math.max(
        attackerTeam.nextPrimaryAttack,
        spearwall.stunDuration,
      );
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
      aDmg: unitA.effects.openingAttack
        ? calcDirectDamageAfterArmor(
            unitA.effects.openingAttack.damage,
            teamB.stats.rangedArmor || 0,
            camelUneaseMultiplierAtoB,
          ) * teamA.units
        : 0,
      aUnits: teamA.units,
      aHp: Math.round(teamA.totalHp),
      bWeapon: unitB.effects.openingAttack ? "Opening" : "—",
      bDmg: unitB.effects.openingAttack
        ? calcDirectDamageAfterArmor(
            unitB.effects.openingAttack.damage,
            teamA.stats.rangedArmor || 0,
            camelUneaseMultiplierBtoA,
          ) * teamB.units
        : 0,
      bUnits: teamB.units,
      bHp: Math.round(teamB.totalHp),
      notes: [
        unitA.effects.openingAttack ? unitA.name : "",
        unitB.effects.openingAttack ? unitB.name : "",
      ]
        .filter(Boolean)
        .join(", "),
    });
  }

  // Log spearwall/palings if triggered
  const antiCavNotesA = [];
  const antiCavNotesB = [];
  if (unitA.effects.palings && teamB.tags.includes("Cavalry")) {
    antiCavNotesA.push(
      `Palings (stun ${formatSeconds(unitA.effects.palings.stunDuration)}s)`,
    );
  } else if (unitA.effects.spearwall && teamB.tags.includes("Cavalry")) {
    antiCavNotesA.push(
      `Spearwall (stun ${formatSeconds(unitA.effects.spearwall.stunDuration)}s)`,
    );
  }
  if (unitB.effects.palings && teamA.tags.includes("Cavalry")) {
    antiCavNotesB.push(
      `Palings (stun ${formatSeconds(unitB.effects.palings.stunDuration)}s)`,
    );
  } else if (unitB.effects.spearwall && teamA.tags.includes("Cavalry")) {
    antiCavNotesB.push(
      `Spearwall (stun ${formatSeconds(unitB.effects.spearwall.stunDuration)}s)`,
    );
  }
  if (antiCavNotesA.length || antiCavNotesB.length) {
    battleLog.push({
      time: "Pre",
      aWeapon: antiCavNotesA[0] || "—",
      aDmg:
        unitA.effects.palings && teamB.tags.includes("Cavalry")
          ? unitA.effects.palings.damage * teamA.units
          : 0,
      aUnits: teamA.units,
      aHp: Math.round(teamA.totalHp),
      bWeapon: antiCavNotesB[0] || "—",
      bDmg:
        unitB.effects.palings && teamA.tags.includes("Cavalry")
          ? unitB.effects.palings.damage * teamB.units
          : 0,
      bUnits: teamB.units,
      bHp: Math.round(teamB.totalHp),
      notes: [...antiCavNotesA, ...antiCavNotesB].join(", "),
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
      atkSpeed /= 1 + fx.arrowVolley.atkSpeedBonus / 100;
    }
    // Fortitude: +X% attack speed for duration (starts at t=0)
    if (fx.fortitude && time <= fx.fortitude.duration + EPSILON) {
      atkSpeed /= 1 + fx.fortitude.atkSpeedBonus / 100;
    }
    // Static Deployment: +X% attack speed after delay
    if (fx.staticDeployment && time >= fx.staticDeployment.delay - EPSILON) {
      atkSpeed /= 1 + fx.staticDeployment.atkSpeedBonus / 100;
    }
    // Shield Wall: -X% attack speed (permanent while enabled)
    if (fx.shieldWall) {
      atkSpeed /= 1 - fx.shieldWall.atkSpeedPenalty / 100;
    }
    // Atk Speed Debuff from enemy (e.g. Szlachta Bludgeoning Attacks)
    if (team && team.atkSpeedDebuffUntil >= time - EPSILON) {
      atkSpeed /= 1 - team.atkSpeedDebuffReduction / 100;
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
    // Triumph: +attackBonus for duration
    if (fx.triumph && time <= fx.triumph.duration + EPSILON) {
      atk += fx.triumph.attackBonus;
    }
    // Battle Glory: accumulated attack bonus from kills
    if (team && team.gloryBonusAtk) {
      atk += team.gloryBonusAtk;
    }
    return atk;
  }

  function getEffectiveArmor(
    unit,
    baseMeleeArmor,
    baseRangedArmor,
    time,
    enemyEffects,
  ) {
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
      teamB.trampleTick,
      getNextBleedTick(teamA),
      getNextBleedTick(teamB),
      getNextPoisonTick(teamA),
      getNextPoisonTick(teamB),
    );
    time = nextEventTime;

    // Refresh buffs at current time
    teamA.stats = applyBuffs(unitA, time);
    teamB.stats = applyBuffs(unitB, time);

    const bleedFromB = collectBleedTickEvents(teamA, time, EPSILON);
    const bleedFromA = collectBleedTickEvents(teamB, time, EPSILON);
    const bleedDamageToA = bleedFromB.reduce((sum, entry) => sum + entry.damage, 0);
    const bleedDamageToB = bleedFromA.reduce((sum, entry) => sum + entry.damage, 0);
    const bleedWasteToA = bleedFromB.reduce(
      (sum, entry) => sum + (entry.waste || 0),
      0,
    );
    const bleedWasteToB = bleedFromA.reduce(
      (sum, entry) => sum + (entry.waste || 0),
      0,
    );
    const bleedKillsByB = bleedFromB.reduce(
      (sum, entry) => sum + (entry.kills || 0),
      0,
    );
    const bleedKillsByA = bleedFromA.reduce(
      (sum, entry) => sum + (entry.kills || 0),
      0,
    );

    if (
      bleedDamageToA > 0 ||
      bleedDamageToB > 0 ||
      bleedKillsByA > 0 ||
      bleedKillsByB > 0
    ) {
      battleLog.push({
        time: time.toFixed(2),
        aWeapon: bleedDamageToB > 0 ? "Bleed" : "—",
        aDmg: bleedDamageToB.toFixed(1),
        aWaste: bleedWasteToB.toFixed(1),
        aUnits: teamA.units,
        aInjured: getAllTrackedUnits(teamA).filter(u => u.hp < teamA.stats.hp - 0.0001).length,
        aHp: Math.round(teamA.totalHp),
        aKills: bleedKillsByA,
        bWeapon: bleedDamageToA > 0 ? "Bleed" : "—",
        bDmg: bleedDamageToA.toFixed(1),
        bWaste: bleedWasteToA.toFixed(1),
        bUnits: teamB.units,
        bInjured: getAllTrackedUnits(teamB).filter(u => u.hp < teamB.stats.hp - 0.0001).length,
        bHp: Math.round(teamB.totalHp),
        bKills: bleedKillsByB,
        notes: "Bleed Tick",
      });
    }
    if (teamA.units <= 0 || teamB.units <= 0) break;

    // Poison DoT ticks
    const poisonFromB = collectPoisonTickEvents(teamA, time, EPSILON);
    const poisonFromA = collectPoisonTickEvents(teamB, time, EPSILON);
    const poisonDamageToA = poisonFromB.reduce((sum, e) => sum + e.damage, 0);
    const poisonDamageToB = poisonFromA.reduce((sum, e) => sum + e.damage, 0);
    const poisonWasteToA = poisonFromB.reduce((sum, e) => sum + (e.waste || 0), 0);
    const poisonWasteToB = poisonFromA.reduce((sum, e) => sum + (e.waste || 0), 0);
    const poisonKillsByB = poisonFromB.reduce((sum, e) => sum + (e.kills || 0), 0);
    const poisonKillsByA = poisonFromA.reduce((sum, e) => sum + (e.kills || 0), 0);

    if (poisonDamageToA > 0 || poisonDamageToB > 0 || poisonKillsByA > 0 || poisonKillsByB > 0) {
      battleLog.push({
        time: time.toFixed(2),
        aWeapon: poisonDamageToB > 0 ? "Poison" : "—",
        aDmg: poisonDamageToB.toFixed(1),
        aWaste: poisonWasteToB.toFixed(1),
        aUnits: teamA.units,
        aInjured: getAllTrackedUnits(teamA).filter(u => u.hp < teamA.stats.hp - 0.0001).length,
        aHp: Math.round(teamA.totalHp),
        aKills: poisonKillsByA,
        bWeapon: poisonDamageToA > 0 ? "Poison" : "—",
        bDmg: poisonDamageToA.toFixed(1),
        bWaste: poisonWasteToA.toFixed(1),
        bUnits: teamB.units,
        bInjured: getAllTrackedUnits(teamB).filter(u => u.hp < teamB.stats.hp - 0.0001).length,
        bHp: Math.round(teamB.totalHp),
        bKills: poisonKillsByB,
        notes: "Poison Tick",
      });
    }
    if (teamA.units <= 0 || teamB.units <= 0) break;

    // Apply unique effect stat modifiers
    const atkSpeedA = getEffectiveAttackSpeed(
      unitA,
      teamA.stats.attackSpeed,
      time,
      teamA,
    );
    const atkSpeedB = getEffectiveAttackSpeed(
      unitB,
      teamB.stats.attackSpeed,
      time,
      teamB,
    );
    const armorA = getEffectiveArmor(
      unitA,
      teamA.stats.meleeArmor,
      teamA.stats.rangedArmor,
      time,
      unitB.effects,
    );
    const armorB = getEffectiveArmor(
      unitB,
      teamB.stats.meleeArmor,
      teamB.stats.rangedArmor,
      time,
      unitA.effects,
    );

    // Build effective stat objects for damage calc
    const effectiveStatsA = { ...teamA.stats, ...armorA };
    const effectiveStatsB = { ...teamB.stats, ...armorB };

    // Calculate ALL damage BEFORE applying any (simultaneous)
    let damageToB = 0;
    let damageToA = 0;
    // For simultaneous-weapon units: track primary/secondary damage separately
    let primaryDmgToB = 0, secondaryDmgToB = 0;
    let primaryDmgToA = 0, secondaryDmgToA = 0;
    const aIsSimultaneous = SIMULTANEOUS_WEAPON_UNITS.has(unitA.name);
    const bIsSimultaneous = SIMULTANEOUS_WEAPON_UNITS.has(unitB.name);
    // AoE tracking (set during primary weapon calc, used during application)
    let aoeTargetsA = 1, aoeFalloffA = false;
    let aoeTargetsB = 1, aoeFalloffB = false;
    let logNotesA = [],
      logNotesB = [];
    let aFiredPrimary = false,
      aFiredSecondary = false;
    let bFiredPrimary = false,
      bFiredSecondary = false;
    let aCanApplyBleed = false;
    let bCanApplyBleed = false;

    // === TEAM A PRIMARY WEAPON ===
    if (teamA.nextPrimaryAttack <= time + EPSILON && teamA.units > 0) {
      let attackValue = getEffectiveAttack(
        unitA,
        teamA.stats.attack,
        time,
        teamA,
      );
      if (!teamA.hasCharged && unitA.chargeDamage > 0) {
        attackValue += unitA.chargeDamage;
        teamA.hasCharged = true;
        teamA.chargeTime = time;
      }
      // Post-charge attack buff (e.g. Royal Knight +3 for 5s)
      const pcBuff = unitA.effects.postChargeAttackBuff;
      if (
        pcBuff &&
        teamA.hasCharged &&
        time <= teamA.chargeTime + pcBuff.duration + EPSILON &&
        time > teamA.chargeTime + EPSILON
      ) {
        attackValue += pcBuff.value;
      }
      const armorPenA = unitA.effects.armorPenetration
        ? unitA.effects.armorPenetration.penetration
        : 0;
      const dmg = calcWeaponDamage(
        unitA.weaponType,
        attackValue,
        teamA.originalStats.bonus,
        teamB.tags,
        effectiveStatsB,
        armorPenA,
        camelUneaseMultiplierAtoB,
      );
      // AoE target count (applied during damage distribution, not as multiplier)
      aoeTargetsA = 1;
      aoeFalloffA = false;
      if (unitA.effects.aoeSplash) {
        aoeTargetsA = Math.min(unitA.effects.aoeSplash.unitsHit, teamB.units);
      } else if (unitA.effects.aoeFalloff) {
        aoeTargetsA = Math.min(
          unitA.effects.aoeFalloff.unitsHit,
          teamB.units,
        );
        aoeFalloffA = true;
      }
      let primaryDamage =
        dmg * teamA.units * (unitA.weaponProjectiles || 1);
      if (hasKipchakTripleShot(unitA)) {
        const extraArrowDmg = calcWeaponDamage(
          unitA.weaponType,
          attackValue,
          teamA.originalStats.bonus,
          teamB.tags,
          effectiveStatsB,
          armorPenA,
          camelUneaseMultiplierAtoB * KIPCHAK_TRIPLE_SHOT.damageMultiplier,
        );
        primaryDamage +=
          extraArrowDmg * teamA.units * KIPCHAK_TRIPLE_SHOT.extraArrows;
        logNotesA.push("Triple Shot");
      }
      if (aIsSimultaneous) {
        primaryDmgToB += primaryDamage;
      }
      damageToB += primaryDamage;
      teamA.nextPrimaryAttack = time + atkSpeedA;
      aFiredPrimary = true;
      aCanApplyBleed = true;
      if (
        unitA.chargeDamage > 0 &&
        (!teamA.hasCharged || time <= teamA.chargeTime + EPSILON)
      )
        logNotesA.push("Charge");
      if (unitA.effects.aoeSplash && aoeTargetsA > 1)
        logNotesA.push(`AoE×${aoeTargetsA}`);
      if (unitA.effects.aoeFalloff && aoeTargetsA > 1)
        logNotesA.push(`AoE×${aoeTargetsA}(falloff)`);
      // Atk Speed Debuff: slow enemy on hit
      if (unitA.effects.atkSpeedDebuff) {
        teamB.atkSpeedDebuffUntil =
          time + unitA.effects.atkSpeedDebuff.duration;
        teamB.atkSpeedDebuffReduction = unitA.effects.atkSpeedDebuff.reduction;
      }
      // Damage Debuff on Hit (Ruinous Blinding): reduce enemy damage output
      if (unitA.effects.dmgDebuffOnHit) {
        teamB.dmgDebuffUntil = time + unitA.effects.dmgDebuffOnHit.duration;
        teamB.dmgDebuffReduction = unitA.effects.dmgDebuffOnHit.reduction;
      }
    }

    // === TEAM A SECONDARY WEAPON ===
    if (
      teamA.unitData.secondaryWeapon &&
      teamA.nextSecondaryAttack <= time + EPSILON &&
      teamA.units > 0
    ) {
      const sec = teamA.unitData.secondaryWeapon;
      const armorPenA2 = unitA.effects.armorPenetration
        ? unitA.effects.armorPenetration.penetration
        : 0;
      // Apply attack buff delta to secondary weapon only if same type as primary
      const atkBuffDeltaA = (sec.type === unitA.weaponType) ? (teamA.stats.attack - unitA.stats.attack) : 0;
      const secAttack = (sec.stats.attack || 0) + atkBuffDeltaA;
      const dmg = calcWeaponDamage(
        sec.type,
        secAttack,
        sec.stats.bonus || {},
        teamB.tags,
        effectiveStatsB,
        armorPenA2,
        camelUneaseMultiplierAtoB,
      );
      const secDmgA = dmg * teamA.units * (sec.projectiles || 1);
      if (aIsSimultaneous) {
        secondaryDmgToB += secDmgA;
      }
      damageToB += secDmgA;
      const secSpeedA = aIsSimultaneous ? sec.attackSpeed * (atkSpeedA / teamA.stats.attackSpeed) : sec.attackSpeed;
      teamA.nextSecondaryAttack = time + secSpeedA;
      aFiredSecondary = true;
    }

    // === TEAM B PRIMARY WEAPON ===
    if (teamB.nextPrimaryAttack <= time + EPSILON && teamB.units > 0) {
      let attackValue = getEffectiveAttack(
        unitB,
        teamB.stats.attack,
        time,
        teamB,
      );
      if (!teamB.hasCharged && unitB.chargeDamage > 0) {
        attackValue += unitB.chargeDamage;
        teamB.hasCharged = true;
        teamB.chargeTime = time;
      }
      // Post-charge attack buff (e.g. Royal Knight +3 for 5s)
      const pcBuff = unitB.effects.postChargeAttackBuff;
      if (
        pcBuff &&
        teamB.hasCharged &&
        time <= teamB.chargeTime + pcBuff.duration + EPSILON &&
        time > teamB.chargeTime + EPSILON
      ) {
        attackValue += pcBuff.value;
      }
      const armorPenB = unitB.effects.armorPenetration
        ? unitB.effects.armorPenetration.penetration
        : 0;
      const dmg = calcWeaponDamage(
        unitB.weaponType,
        attackValue,
        teamB.originalStats.bonus,
        teamA.tags,
        effectiveStatsA,
        armorPenB,
        camelUneaseMultiplierBtoA,
      );
      // AoE target count (applied during damage distribution, not as multiplier)
      aoeTargetsB = 1;
      aoeFalloffB = false;
      if (unitB.effects.aoeSplash) {
        aoeTargetsB = Math.min(unitB.effects.aoeSplash.unitsHit, teamA.units);
      } else if (unitB.effects.aoeFalloff) {
        aoeTargetsB = Math.min(
          unitB.effects.aoeFalloff.unitsHit,
          teamA.units,
        );
        aoeFalloffB = true;
      }
      let primaryDamage =
        dmg * teamB.units * (unitB.weaponProjectiles || 1);
      if (hasKipchakTripleShot(unitB)) {
        const extraArrowDmg = calcWeaponDamage(
          unitB.weaponType,
          attackValue,
          teamB.originalStats.bonus,
          teamA.tags,
          effectiveStatsA,
          armorPenB,
          camelUneaseMultiplierBtoA * KIPCHAK_TRIPLE_SHOT.damageMultiplier,
        );
        primaryDamage +=
          extraArrowDmg * teamB.units * KIPCHAK_TRIPLE_SHOT.extraArrows;
        logNotesB.push("Triple Shot");
      }
      if (bIsSimultaneous) {
        primaryDmgToA += primaryDamage;
      }
      damageToA += primaryDamage;
      teamB.nextPrimaryAttack = time + atkSpeedB;
      bFiredPrimary = true;
      bCanApplyBleed = true;
      if (
        unitB.chargeDamage > 0 &&
        (!teamB.hasCharged || time <= teamB.chargeTime + EPSILON)
      )
        logNotesB.push("Charge");
      if (unitB.effects.aoeSplash && aoeTargetsB > 1)
        logNotesB.push(`AoE×${aoeTargetsB}`);
      if (unitB.effects.aoeFalloff && aoeTargetsB > 1)
        logNotesB.push(`AoE×${aoeTargetsB}(falloff)`);
      // Atk Speed Debuff: slow enemy on hit
      if (unitB.effects.atkSpeedDebuff) {
        teamA.atkSpeedDebuffUntil =
          time + unitB.effects.atkSpeedDebuff.duration;
        teamA.atkSpeedDebuffReduction = unitB.effects.atkSpeedDebuff.reduction;
      }
      // Damage Debuff on Hit (Ruinous Blinding): reduce enemy damage output
      if (unitB.effects.dmgDebuffOnHit) {
        teamA.dmgDebuffUntil = time + unitB.effects.dmgDebuffOnHit.duration;
        teamA.dmgDebuffReduction = unitB.effects.dmgDebuffOnHit.reduction;
      }
    }

    // === TEAM B SECONDARY WEAPON ===
    if (
      teamB.unitData.secondaryWeapon &&
      teamB.nextSecondaryAttack <= time + EPSILON &&
      teamB.units > 0
    ) {
      const sec = teamB.unitData.secondaryWeapon;
      const armorPenB2 = unitB.effects.armorPenetration
        ? unitB.effects.armorPenetration.penetration
        : 0;
      // Apply attack buff delta to secondary weapon only if same type as primary
      const atkBuffDeltaB = (sec.type === unitB.weaponType) ? (teamB.stats.attack - unitB.stats.attack) : 0;
      const secAttack = (sec.stats.attack || 0) + atkBuffDeltaB;
      const dmg = calcWeaponDamage(
        sec.type,
        secAttack,
        sec.stats.bonus || {},
        teamA.tags,
        effectiveStatsA,
        armorPenB2,
        camelUneaseMultiplierBtoA,
      );
      const secDmgB = dmg * teamB.units * (sec.projectiles || 1);
      if (bIsSimultaneous) {
        secondaryDmgToA += secDmgB;
      }
      damageToA += secDmgB;
      const secSpeedB = bIsSimultaneous ? sec.attackSpeed * (atkSpeedB / teamB.stats.attackSpeed) : sec.attackSpeed;
      teamB.nextSecondaryAttack = time + secSpeedB;
      bFiredSecondary = true;
    }

    // === APPLY GUNPOWDER RESISTANCE: reduce damage from gunpowder units ===
    if (
      unitA.effects.gunpowderResistance &&
      (teamB.tags.includes("Gunpowder") ||
        teamB.tags.includes("Light Gunpowder"))
    ) {
      damageToA *= 1 - unitA.effects.gunpowderResistance.reduction / 100;
    }
    if (
      unitB.effects.gunpowderResistance &&
      (teamA.tags.includes("Gunpowder") ||
        teamA.tags.includes("Light Gunpowder"))
    ) {
      damageToB *= 1 - unitB.effects.gunpowderResistance.reduction / 100;
    }

    // === APPLY FORTITUDE: increased melee damage taken ===
    if (
      unitA.effects.fortitude &&
      time <= unitA.effects.fortitude.duration + EPSILON &&
      unitB.weaponType === "melee"
    ) {
      damageToA *= 1 + unitA.effects.fortitude.dmgTakenIncrease / 100;
    }
    if (
      unitB.effects.fortitude &&
      time <= unitB.effects.fortitude.duration + EPSILON &&
      unitA.weaponType === "melee"
    ) {
      damageToB *= 1 + unitB.effects.fortitude.dmgTakenIncrease / 100;
    }

    // === APPLY SHIELD WALL: reduce incoming ranged damage ===
    if (unitA.effects.shieldWall && unitB.weaponType === "ranged") {
      damageToA *= 1 - unitA.effects.shieldWall.rangedDmgReduction / 100;
    }
    if (unitB.effects.shieldWall && unitA.weaponType === "ranged") {
      damageToB *= 1 - unitB.effects.shieldWall.rangedDmgReduction / 100;
    }

    // === APPLY DAMAGE DEBUFF ON HIT (Ruinous Blinding): reduce damage output ===
    if (teamA.dmgDebuffUntil && teamA.dmgDebuffUntil > time) {
      damageToB *= 1 - teamA.dmgDebuffReduction / 100;
    }
    if (teamB.dmgDebuffUntil && teamB.dmgDebuffUntil > time) {
      damageToA *= 1 - teamB.dmgDebuffReduction / 100;
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
      damageToB +=
        (unitA.effects.percentDamage.percent / 100) *
        teamB.stats.hp *
        teamA.units;
    }
    if (unitB.effects.percentDamage && damageToA > 0) {
      damageToA +=
        (unitB.effects.percentDamage.percent / 100) *
        teamA.stats.hp *
        teamB.units;
    }

    // === APPLY TRAMPLE: Periodic AoE ticks over duration ===
    const TRAMPLE_TICK = 0.5; // 0.5s between ticks
    if (
      unitA.effects.trample &&
      teamA.trampleTick <= time + EPSILON &&
      teamA.units > 0
    ) {
      const t = unitA.effects.trample;
      if (!teamA.trampleActive) {
        teamA.trampleActive = true;
        teamA.trampleEnd = time + t.duration;
        // Trample delays normal attacks by its duration
        teamA.nextPrimaryAttack = Math.max(teamA.nextPrimaryAttack, teamA.trampleEnd);
        if (teamA.nextSecondaryAttack !== Infinity)
          teamA.nextSecondaryAttack = Math.max(teamA.nextSecondaryAttack, teamA.trampleEnd);
      }
      const tickDmg = t.dps * TRAMPLE_TICK * camelUneaseMultiplierAtoB;
      const targets = Math.min(t.unitsHit || 1, teamB.units);
      damageToB += tickDmg * teamA.units * targets;
      // Numeri: trampled enemies take +dmgIncrease% from all sources
      if (unitA.effects.numeri) {
        teamB.numeriDebuffEnd = time + unitA.effects.numeri.duration;
      }
      if (time + TRAMPLE_TICK < teamA.trampleEnd - EPSILON) {
        teamA.trampleTick = time + TRAMPLE_TICK;
      } else {
        teamA.trampleActive = false;
        teamA.trampleTick = teamA.trampleEnd + t.cooldown;
      }
    }
    if (
      unitB.effects.trample &&
      teamB.trampleTick <= time + EPSILON &&
      teamB.units > 0
    ) {
      const t = unitB.effects.trample;
      if (!teamB.trampleActive) {
        teamB.trampleActive = true;
        teamB.trampleEnd = time + t.duration;
        // Trample delays normal attacks by its duration
        teamB.nextPrimaryAttack = Math.max(teamB.nextPrimaryAttack, teamB.trampleEnd);
        if (teamB.nextSecondaryAttack !== Infinity)
          teamB.nextSecondaryAttack = Math.max(teamB.nextSecondaryAttack, teamB.trampleEnd);
      }
      const tickDmg = t.dps * TRAMPLE_TICK * camelUneaseMultiplierBtoA;
      const targets = Math.min(t.unitsHit || 1, teamA.units);
      damageToA += tickDmg * teamB.units * targets;
      // Numeri: trampled enemies take +dmgIncrease% from all sources
      if (unitB.effects.numeri) {
        teamA.numeriDebuffEnd = time + unitB.effects.numeri.duration;
      }
      if (time + TRAMPLE_TICK < teamB.trampleEnd - EPSILON) {
        teamB.trampleTick = time + TRAMPLE_TICK;
      } else {
        teamB.trampleActive = false;
        teamB.trampleTick = teamB.trampleEnd + t.cooldown;
      }
    }

    // === NUMERI DEBUFF: Amplify all damage to debuffed teams ===
    if (teamB.numeriDebuffEnd > time + EPSILON && damageToB > 0) {
      const numeriPct = unitA.effects.numeri ? unitA.effects.numeri.dmgIncrease : 15;
      damageToB *= (1 + numeriPct / 100);
    }
    if (teamA.numeriDebuffEnd > time + EPSILON && damageToA > 0) {
      const numeriPct = unitB.effects.numeri ? unitB.effects.numeri.dmgIncrease : 15;
      damageToA *= (1 + numeriPct / 100);
    }

    const startUnitsA = teamA.units;
    const startUnitsB = teamB.units;

    // --- Preview pass (clone to compute waste/kills/dealt) ---
    // AoE params: only primary weapon has AoE; secondary (spear) is single-target
    const aoeA = aFiredPrimary ? aoeTargetsA : 1;
    const aoeB = bFiredPrimary ? aoeTargetsB : 1;
    let wasteA = 0, wasteB = 0, killsByA = 0, killsByB = 0;

    if (aIsSimultaneous && aFiredPrimary && aFiredSecondary) {
      // Simultaneous weapon (e.g. War Elephant): apply tusks then spear sequentially
      const cloneB1 = {
        ...teamB,
        frontUnits: teamB.frontUnits.map((unit) => cloneUnitState(unit)),
        reserveUnits: teamB.reserveUnits.map((unit) => cloneUnitState(unit)),
      };
      const r1 = applyBundledDamageToTeam(cloneB1, primaryDmgToB, startUnitsA, splitA, splitTargetsA, overkillEnabled, aoeA, aoeFalloffA);
      const r2 = applyBundledDamageToTeam(cloneB1, secondaryDmgToB, startUnitsA, splitA, splitTargetsA, overkillEnabled);
      wasteA = r1.waste + r2.waste;
      damageToB = r1.dealt + r2.dealt;
      killsByA = r1.kills + r2.kills;
    } else {
      const resultToB = applyBundledDamageToTeam(
        {
          ...teamB,
          frontUnits: teamB.frontUnits.map((unit) => cloneUnitState(unit)),
          reserveUnits: teamB.reserveUnits.map((unit) => cloneUnitState(unit)),
        },
        damageToB,
        startUnitsA,
        splitA,
        splitTargetsA,
        overkillEnabled,
        aoeA,
        aoeFalloffA,
      );
      wasteA = resultToB.waste;
      damageToB = resultToB.dealt;
      killsByA = resultToB.kills;
    }

    if (bIsSimultaneous && bFiredPrimary && bFiredSecondary) {
      const cloneA1 = {
        ...teamA,
        frontUnits: teamA.frontUnits.map((unit) => cloneUnitState(unit)),
        reserveUnits: teamA.reserveUnits.map((unit) => cloneUnitState(unit)),
      };
      const r1 = applyBundledDamageToTeam(cloneA1, primaryDmgToA, startUnitsB, splitB, splitTargetsB, overkillEnabled, aoeB, aoeFalloffB);
      const r2 = applyBundledDamageToTeam(cloneA1, secondaryDmgToA, startUnitsB, splitB, splitTargetsB, overkillEnabled);
      wasteB = r1.waste + r2.waste;
      damageToA = r1.dealt + r2.dealt;
      killsByB = r1.kills + r2.kills;
    } else {
      const resultToA = applyBundledDamageToTeam(
        {
          ...teamA,
          frontUnits: teamA.frontUnits.map((unit) => cloneUnitState(unit)),
          reserveUnits: teamA.reserveUnits.map((unit) => cloneUnitState(unit)),
        },
        damageToA,
        startUnitsB,
        splitB,
        splitTargetsB,
        overkillEnabled,
        aoeB,
        aoeFalloffB,
      );
      wasteB = resultToA.waste;
      damageToA = resultToA.dealt;
      killsByB = resultToA.kills;
    }

    // --- Real damage application ---
    if (aIsSimultaneous && aFiredPrimary && aFiredSecondary) {
      if (primaryDmgToB > 0) {
        applyBundledDamageToTeam(teamB, primaryDmgToB, startUnitsA, splitA, splitTargetsA, overkillEnabled, aoeA, aoeFalloffA);
      }
      if (secondaryDmgToB > 0) {
        applyBundledDamageToTeam(teamB, secondaryDmgToB, startUnitsA, splitA, splitTargetsA, overkillEnabled);
      }
    } else if (damageToB > 0) {
      applyBundledDamageToTeam(
        teamB,
        damageToB,
        startUnitsA,
        splitA,
        splitTargetsA,
        overkillEnabled,
        aoeA,
        aoeFalloffA,
      );
    }
    if (bIsSimultaneous && bFiredPrimary && bFiredSecondary) {
      if (primaryDmgToA > 0) {
        applyBundledDamageToTeam(teamA, primaryDmgToA, startUnitsB, splitB, splitTargetsB, overkillEnabled, aoeB, aoeFalloffB);
      }
      if (secondaryDmgToA > 0) {
        applyBundledDamageToTeam(teamA, secondaryDmgToA, startUnitsB, splitB, splitTargetsB, overkillEnabled);
      }
    } else if (damageToA > 0) {
      applyBundledDamageToTeam(
        teamA,
        damageToA,
        startUnitsB,
        splitB,
        splitTargetsB,
        overkillEnabled,
        aoeB,
        aoeFalloffB,
      );
    }

    if (aCanApplyBleed && unitA.effects.bleed && damageToB > 0) {
      applyKipchakBleed(teamA, teamB, time, splitA, splitTargetsA, startUnitsA);
    }
    if (bCanApplyBleed && unitB.effects.bleed && damageToA > 0) {
      applyKipchakBleed(teamB, teamA, time, splitB, splitTargetsB, startUnitsB);
    }

    // Apply Poisoned Arrows DoT
    if (unitA.effects.poisonedArrows && damageToB > 0) {
      applyPoison(teamA, teamB, time, splitA, splitTargetsA, startUnitsA);
    }
    if (unitB.effects.poisonedArrows && damageToA > 0) {
      applyPoison(teamB, teamA, time, splitB, splitTargetsB, startUnitsB);
    }

    const healA = unitA.effects.healPerAttack;
    if (healA && damageToB > 0) {
      const maxHpA = teamA.stats.hp;
      const injuredA = getAllTrackedUnits(teamA).filter(u => u.hp < maxHpA - 0.0001).length;
      if (injuredA > 0) {
        healTrackedTeam(teamA, healA.value * Math.min(teamA.units, injuredA));
      }
    }
    const healB = unitB.effects.healPerAttack;
    if (healB && damageToA > 0) {
      const maxHpB = teamB.stats.hp;
      const injuredB = getAllTrackedUnits(teamB).filter(u => u.hp < maxHpB - 0.0001).length;
      if (injuredB > 0) {
        healTrackedTeam(teamB, healB.value * Math.min(teamB.units, injuredB));
      }
    }

    if (unitA.effects.healAura && teamA.units > 0) {
      const dt = time - (teamA.lastHealAuraTime || 0);
      if (dt > 0) {
        healTrackedTeam(teamA, unitA.effects.healAura.hps * teamA.units * dt);
      }
    }
    if (unitB.effects.healAura && teamB.units > 0) {
      const dt = time - (teamB.lastHealAuraTime || 0);
      if (dt > 0) {
        healTrackedTeam(teamB, unitB.effects.healAura.hps * teamB.units * dt);
      }
    }
    // Triumph healing: +hps regen for duration (heals even during trample)
    if (unitA.effects.triumph && time <= unitA.effects.triumph.duration + EPSILON && teamA.units > 0) {
      const dt = time - (teamA.lastHealAuraTime || 0);
      if (dt > 0) {
        healTrackedTeam(teamA, unitA.effects.triumph.hps * teamA.units * dt);
      }
    }
    if (unitB.effects.triumph && time <= unitB.effects.triumph.duration + EPSILON && teamB.units > 0) {
      const dt = time - (teamB.lastHealAuraTime || 0);
      if (dt > 0) {
        healTrackedTeam(teamB, unitB.effects.triumph.hps * teamB.units * dt);
      }
    }
    teamA.lastHealAuraTime = time;
    teamB.lastHealAuraTime = time;

    // Battle Glory: +HP and +attack per kill (e.g. Teutonic Knight)
    if (unitA.effects.battleGlory && killsByA > 0 && teamA.units > 0) {
      const bg = unitA.effects.battleGlory;
      teamA.gloryBonusHp = (teamA.gloryBonusHp || 0) + bg.hpPerKill * killsByA;
      teamA.gloryBonusAtk =
        (teamA.gloryBonusAtk || 0) + bg.attackPerKill * killsByA;
      setTrackedTeamHpPerUnit(teamA, teamA.baseHp + teamA.gloryBonusHp);
    }
    if (unitB.effects.battleGlory && killsByB > 0 && teamB.units > 0) {
      const bg = unitB.effects.battleGlory;
      teamB.gloryBonusHp = (teamB.gloryBonusHp || 0) + bg.hpPerKill * killsByB;
      teamB.gloryBonusAtk =
        (teamB.gloryBonusAtk || 0) + bg.attackPerKill * killsByB;
      setTrackedTeamHpPerUnit(teamB, teamB.baseHp + teamB.gloryBonusHp);
    }

    // Brotherhood HP: recalculate effective HP per unit as allies die
    if (unitA.effects.brotherhoodHP && teamA.units > 0) {
      const newHpPer =
        teamA.baseHp +
        unitA.effects.brotherhoodHP.hpPerUnit * (teamA.units - 1);
      setTrackedTeamHpPerUnit(teamA, newHpPer);
    }
    if (unitB.effects.brotherhoodHP && teamB.units > 0) {
      const newHpPer =
        teamB.baseHp +
        unitB.effects.brotherhoodHP.hpPerUnit * (teamB.units - 1);
      setTrackedTeamHpPerUnit(teamB, newHpPer);
    }

    // --- Build log notes for effects ---
    if (unitA.effects.percentDamage && damageToB > 0) logNotesA.push("%HP");
    if (unitA.effects.trample && teamA.trampleActive) logNotesA.push("Trample");
    if (unitA.effects.deflectiveArmor && teamA.hasBlocked && damageToA === 0)
      logNotesA.push("Blocked");
    if (unitB.effects.percentDamage && damageToA > 0) logNotesB.push("%HP");
    if (unitB.effects.trample && teamB.trampleActive) logNotesB.push("Trample");
    if (unitB.effects.deflectiveArmor && teamB.hasBlocked && damageToB === 0)
      logNotesB.push("Blocked");
    if (unitA.effects.atkSpeedDebuff && aFiredPrimary) logNotesA.push("Slow");
    if (unitB.effects.atkSpeedDebuff && bFiredPrimary) logNotesB.push("Slow");
    if (unitA.effects.healAura) logNotesA.push("Heal");
    if (unitB.effects.healAura) logNotesB.push("Heal");
    if (unitA.effects.triumph && time <= unitA.effects.triumph.duration + EPSILON) logNotesA.push("Triumph");
    if (unitB.effects.triumph && time <= unitB.effects.triumph.duration + EPSILON) logNotesB.push("Triumph");
    if (teamB.numeriDebuffEnd > time + EPSILON && damageToB > 0) logNotesA.push("Numeri");
    if (teamA.numeriDebuffEnd > time + EPSILON && damageToA > 0) logNotesB.push("Numeri");
    if (unitA.effects.armorPenetration && (aFiredPrimary || aFiredSecondary))
      logNotesA.push("ArmorPen");
    if (unitB.effects.armorPenetration && (bFiredPrimary || bFiredSecondary))
      logNotesB.push("ArmorPen");
    if (unitA.effects.dmgDebuffOnHit && (aFiredPrimary || aFiredSecondary))
      logNotesA.push("Weaken");
    if (unitB.effects.dmgDebuffOnHit && (bFiredPrimary || bFiredSecondary))
      logNotesB.push("Weaken");
    if (
      teamA.dmgDebuffUntil &&
      teamA.dmgDebuffUntil > time &&
      (aFiredPrimary || aFiredSecondary)
    )
      logNotesA.push("Weakened");
    if (
      teamB.dmgDebuffUntil &&
      teamB.dmgDebuffUntil > time &&
      (bFiredPrimary || bFiredSecondary)
    )
      logNotesB.push("Weakened");
    if (
      unitA.effects.berserking &&
      time <= unitA.effects.berserking.duration + EPSILON
    )
      logNotesA.push("Berserk");
    if (
      unitB.effects.berserking &&
      time <= unitB.effects.berserking.duration + EPSILON
    )
      logNotesB.push("Berserk");
    if (unitA.effects.shieldWall) logNotesA.push("ShieldWall");
    if (unitB.effects.shieldWall) logNotesB.push("ShieldWall");
    if (unitA.effects.camelUnease && teamB.tags.includes("Cavalry"))
      logNotesA.push("CamelUnease");
    if (unitB.effects.camelUnease && teamA.tags.includes("Cavalry"))
      logNotesB.push("CamelUnease");
    if (
      unitA.effects.gunpowderResistance &&
      (teamB.tags.includes("Gunpowder") ||
        teamB.tags.includes("Light Gunpowder"))
    )
      logNotesA.push("GunpowderRes");
    if (
      unitB.effects.gunpowderResistance &&
      (teamA.tags.includes("Gunpowder") ||
        teamA.tags.includes("Light Gunpowder"))
    )
      logNotesB.push("GunpowderRes");
    if (unitA.effects.armorDebuffAura) logNotesA.push("-Armor");
    if (unitB.effects.armorDebuffAura) logNotesB.push("-Armor");
    if (
      unitA.effects.movementBurst &&
      time <= unitA.effects.movementBurst.duration + EPSILON
    )
      logNotesA.push("SpeedBurst");
    if (
      unitB.effects.movementBurst &&
      time <= unitB.effects.movementBurst.duration + EPSILON
    )
      logNotesB.push("SpeedBurst");
    if (unitA.effects.infantrySpeedAura) logNotesA.push("FarimaAura");
    if (unitB.effects.infantrySpeedAura) logNotesB.push("FarimaAura");

    // Simultaneous weapon damage breakdown in log notes
    if (aIsSimultaneous && aFiredPrimary && aFiredSecondary) {
      const pLabel = unitA.weaponLabel || "Primary";
      const sLabel = unitA.secondaryWeapon?.name || "Secondary";
      logNotesA.push(`${pLabel}:${primaryDmgToB.toFixed(1)} ${sLabel}:${secondaryDmgToB.toFixed(1)}`);
    }
    if (bIsSimultaneous && bFiredPrimary && bFiredSecondary) {
      const pLabel = unitB.weaponLabel || "Primary";
      const sLabel = unitB.secondaryWeapon?.name || "Secondary";
      logNotesB.push(`${pLabel}:${primaryDmgToA.toFixed(1)} ${sLabel}:${secondaryDmgToA.toFixed(1)}`);
    }

    // --- Push battle log entry ---
    const aWeapon = getAttackLogLabel(unitA, aFiredPrimary, aFiredSecondary);
    const bWeapon = getAttackLogLabel(unitB, bFiredPrimary, bFiredSecondary);
    const aInjured = getAllTrackedUnits(teamA).filter(u => u.hp < teamA.stats.hp - 0.0001).length;
    const bInjured = getAllTrackedUnits(teamB).filter(u => u.hp < teamB.stats.hp - 0.0001).length;
    if (
      aFiredPrimary ||
      aFiredSecondary ||
      bFiredPrimary ||
      bFiredSecondary ||
      (unitA.effects.trample && teamA.trampleActive) ||
      (unitB.effects.trample && teamB.trampleActive) ||
      damageToA > 0 ||
      damageToB > 0 ||
      wasteA > 0 ||
      wasteB > 0 ||
      killsByA > 0 ||
      killsByB > 0
    ) {
      battleLog.push({
        time: time.toFixed(2),
        aWeapon,
        aDmg: damageToB.toFixed(1),
        aWaste: wasteA.toFixed(1),
        aUnits: teamA.units,
        aInjured: aInjured,
        aHp: Math.round(teamA.totalHp),
        aKills: killsByA,
        bWeapon,
        bDmg: damageToA.toFixed(1),
        bWaste: wasteB.toFixed(1),
        bUnits: teamB.units,
        bInjured: bInjured,
        bHp: Math.round(teamB.totalHp),
        bKills: killsByB,
        notes: [...logNotesA, ...logNotesB].join(", "),
      });
    }
  }

  // --- RESULTS DISPLAY ---

  const winner = teamA.units > 0 ? "A" : teamB.units > 0 ? "B" : "Draw";

  // Calculate stats for BOTH teams
  function calcTeamResults(team, unitData, side, splitTargetsAgainst) {
    const hpPct =
      team.units > 0
        ? (team.totalHp / (team.stats.hp * unitData.count)) * 100
        : 0;
    const unitsLost = unitData.count - team.units;
    const costPerUnit = getTotalCost(unitData.name, side);
    const resourcesLost = costPerUnit * unitsLost;

    // Per-resource breakdown for tooltip (use civ-specific costs if available)
    const unit = units[unitData.name];
    const civGroup = side
      ? document.getElementById(`unit${side}Select`).dataset.civGroup || ""
      : "";
    const costs =
      unit && unit.civCosts && civGroup && unit.civCosts[civGroup]
        ? unit.civCosts[civGroup]
        : unit && unit.costs
          ? unit.costs
          : {};
    const costBreakdown = {};
    for (const [res, val] of Object.entries(costs)) {
      costBreakdown[res] = val * unitsLost;
    }

    // Last unit HP calculation
    let lastUnitHp = 0;
    let lastUnitHpMax = team.stats.hp;
    if (team.units > 0) {
      const remainder = team.totalHp % team.stats.hp;
      lastUnitHp = remainder === 0 ? team.stats.hp : remainder;
    }

    // Partial resource loss from injured surviving units
    const fullHpAlive = team.stats.hp * team.units;
    const hpLostOnSurvivors = fullHpAlive - team.totalHp;
    const partialResLost =
      team.units > 0
        ? (hpLostOnSurvivors / fullHpAlive) * costPerUnit * team.units
        : 0;

    // Split damage visualization: distribute HP deficit across multiple units
    let splitDamagedUnits = 1;
    let splitUnitHp = lastUnitHp;
    if (splitTargetsAgainst > 1 && team.units > 0 && hpLostOnSurvivors > 0) {
      splitDamagedUnits = Math.min(splitTargetsAgainst, team.units);
      const hpLostPerUnit = hpLostOnSurvivors / splitDamagedUnits;
      splitUnitHp = Math.max(1, team.stats.hp - hpLostPerUnit);
    }

    return {
      hpPct,
      unitsLost,
      resourcesLost,
      partialResLost,
      costBreakdown,
      lastUnitHp,
      lastUnitHpMax,
      splitDamagedUnits,
      splitUnitHp,
      aliveUnits: team.units,
      startingUnits: unitData.count,
    };
  }

  const splitAgainstA =
    splitB && teamB.units > 1
      ? Math.min(splitTargetsB, teamA.units || 1, teamB.units)
      : 1;
  const splitAgainstB =
    splitA && teamA.units > 1
      ? Math.min(splitTargetsA, teamB.units || 1, teamA.units)
      : 1;
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
  document.getElementById("resultNameA").textContent =
    `${unitA.name} (x${unitA.count})`;
  document.getElementById("resultUnitsA").textContent = teamA.units;
  document.getElementById("resultUnitsLostA").textContent = resultsA.unitsLost;
  document.getElementById("resultCostLostA").innerHTML =
    resultsA.resourcesLost.toFixed(0) +
    (resultsA.partialResLost > 0
      ? ` <span style="font-size:0.75em;color:#b8ad9e;">(${resultsA.partialResLost.toFixed(0)})</span>`
      : "");
  document.getElementById("resultHpPctA").textContent =
    resultsA.hpPct.toFixed(1) + "%";

  // Team B results
  document.getElementById("resultNameB").textContent =
    `${unitB.name} (x${unitB.count})`;
  document.getElementById("resultUnitsB").textContent = teamB.units;
  document.getElementById("resultUnitsLostB").textContent = resultsB.unitsLost;
  document.getElementById("resultCostLostB").innerHTML =
    resultsB.resourcesLost.toFixed(0) +
    (resultsB.partialResLost > 0
      ? ` <span style="font-size:0.75em;color:#b8ad9e;">(${resultsB.partialResLost.toFixed(0)})</span>`
      : "");
  document.getElementById("resultHpPctB").textContent =
    resultsB.hpPct.toFixed(1) + "%";

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
        <th class="team-a-col">Weapon</th><th class="team-a-col">Dmg Dealt</th>${showWaste ? '<th class="team-a-col">Wasted</th>' : ""}
        <th class="team-a-col">Units</th><th class="team-a-col">Injured</th><th class="team-a-col">Kills</th><th class="team-a-col">Total HP</th>
        <th class="team-b-col">Weapon</th><th class="team-b-col">Dmg Dealt</th>${showWaste ? '<th class="team-b-col">Wasted</th>' : ""}
        <th class="team-b-col">Units</th><th class="team-b-col">Injured</th><th class="team-b-col">Kills</th><th class="team-b-col">Total HP</th>
        <th>Notes</th>
      </tr></thead><tbody>`;
    for (const e of battleLog) {
      html += `<tr>
        <td>${e.time}s</td>
        <td class="team-a-col">${e.aWeapon}</td><td class="team-a-col">${e.aDmg}</td>${showWaste ? `<td class="team-a-col">${e.aWaste || "0.0"}</td>` : ""}
        <td class="team-a-col">${e.aUnits}</td><td class="team-a-col">${e.aInjured ?? 0}</td><td class="team-a-col">${e.aKills ?? 0}</td><td class="team-a-col">${e.aHp}</td>
        <td class="team-b-col">${e.bWeapon}</td><td class="team-b-col">${e.bDmg}</td>${showWaste ? `<td class="team-b-col">${e.bWaste || "0.0"}</td>` : ""}
        <td class="team-b-col">${e.bUnits}</td><td class="team-b-col">${e.bInjured ?? 0}</td><td class="team-b-col">${e.bKills ?? 0}</td><td class="team-b-col">${e.bHp}</td>
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
  const torchDmg =
    parseFloat(document.getElementById("A_torchDamage")?.value) ||
    TORCH_BY_AGE[age] ||
    13;
  const torchSpeed =
    parseFloat(document.getElementById("A_torchSpeed")?.value) ||
    TORCH_ATTACK_SPEED;

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
  const empTimers = (building.emplacements || []).map((emp) => ({
    emp,
    nextHit: 0,
  }));

  const battleLog = [];
  let time = 0;
  const maxTime = 300;
  const EPSILON = 0.0001;

  while (teamA.units > 0 && buildingHp > 0 && time < maxTime) {
    // Find next event
    const nextEmpTime =
      empTimers.length > 0
        ? Math.min(...empTimers.map((t) => t.nextHit))
        : Infinity;
    const nextEvent = Math.min(
      nextAttackerHit,
      nextBaseArrow,
      nextGarrisonArrow,
      nextEmpTime,
    );
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
        // Incendiary Arrows converts ranged attack to siege (bypasses ranged armor)
        const hasIncendiary = [...activeTechs.A.keys()].some(
          (k) => k.split("|")[0] === "Incendiary Arrows",
        );
        const armor = hasIncendiary ? 0 : building.rangedArmor;
        const dmgPerUnit = Math.max(
          1,
          teamA.stats.attack - armor,
        );
        dmgToBuilding = dmgPerUnit * teamA.units;
        logNotesA.push(hasIncendiary ? "Siege" : "Ranged");
      }
      nextAttackerHit = time + (isMelee ? torchSpeed : teamA.stats.attackSpeed);
    }

    // Building -> Attackers (base arrows)
    if (building.baseArrows > 0 && nextBaseArrow <= time + EPSILON) {
      const dmgPerArrow = Math.max(
        1,
        building.baseArrowDmg - teamA.stats.rangedArmor,
      );
      dmgToAttackers += dmgPerArrow * building.baseArrows;
      nextBaseArrow = time + building.baseArrowRate;
      logNotesB.push(`Base×${building.baseArrows}`);
    }

    // Building -> Attackers (garrison arrows)
    if (building.garrison > 0 && nextGarrisonArrow <= time + EPSILON) {
      const dmgPerArrow = Math.max(
        1,
        building.garrisonArrowDmg - teamA.stats.rangedArmor,
      );
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
        (teamA.stats.hp * teamA.units - teamA.totalHp) / teamA.stats.hp,
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
      notes: "",
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
    const pct = ((buildingHp / maxBuildingHp) * 100).toFixed(1);
    winnerTextEl.textContent = `Time limit! ${building.name} at ${pct}% HP`;
    winnerTextEl.classList.add("draw-banner");
    winnerTextEl.classList.remove("winner-banner");
  }

  // Duration
  document.getElementById("battleDuration").textContent = time.toFixed(1) + "s";

  // Team A results (attackers)
  const hpPctA =
    teamA.units > 0
      ? (teamA.totalHp / (teamA.stats.hp * unitA.count)) * 100
      : 0;
  const unitsLostA = unitA.count - teamA.units;
  const costPerUnit = getTotalCost(unitA.name, "A");
  const resourcesLostA = costPerUnit * unitsLostA;

  document.getElementById("resultNameA").textContent =
    `${unitA.name} (x${unitA.count})`;
  document.getElementById("resultUnitsA").textContent = teamA.units;
  document.getElementById("resultUnitsLostA").textContent = unitsLostA;
  document.getElementById("resultCostLostA").textContent =
    resourcesLostA.toFixed(0);
  document.getElementById("resultHpPctA").textContent = hpPctA.toFixed(1) + "%";

  // Last unit HP for attackers
  let lastUnitHp = 0;
  if (teamA.units > 0) {
    const remainder = teamA.totalHp % teamA.stats.hp;
    lastUnitHp = remainder === 0 ? teamA.stats.hp : remainder;
  }
  const resultsAObj = {
    aliveUnits: teamA.units,
    startingUnits: unitA.count,
    lastUnitHp,
    lastUnitHpMax: teamA.stats.hp,
    splitDamagedUnits: 1,
    splitUnitHp: lastUnitHp,
  };
  setLastUnitHp("lastUnitHpA", resultsAObj);
  renderUnitGrid("unitGridA", resultsAObj, "a");

  // Team B results (building)
  const buildingHpPct = (buildingHp / maxBuildingHp) * 100;
  document.getElementById("resultNameB").textContent = building.name;
  document.getElementById("resultUnitsB").textContent =
    buildingHp > 0 ? "1" : "0";
  document.getElementById("resultUnitsLostB").textContent =
    buildingHp <= 0 ? "1" : "0";
  document.getElementById("resultCostLostB").textContent = "";
  document.getElementById("resultHpPctB").textContent =
    buildingHpPct.toFixed(1) + "%";

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
  if (logCollapse.classList.contains("show"))
    logCollapse.classList.remove("show");

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
  unitData.civGroup =
    document.getElementById(`unit${side}Select`)?.dataset.civGroup || "";
  // Save active tech state for this group
  unitData.activeTechs = Array.from(activeTechs[side].entries());
  return { unitData };
}

function applyUnitDataToEditor(side, unitData) {
  const wrapper = document.getElementById(`unit${side}Select`);
  if (wrapper) {
    wrapper.dataset.value = unitData.name;
    if (unitData.civGroup !== undefined)
      wrapper.dataset.civGroup = unitData.civGroup || "";
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
  document.getElementById(`${side}_meleeArmor`).value =
    unitData.stats.meleeArmor ?? 0;
  document.getElementById(`${side}_rangedArmor`).value =
    unitData.stats.rangedArmor ?? 0;
  document.getElementById(`${side}_attackSpeed`).value =
    unitData.stats.attackSpeed ?? 1;

  document.getElementById(`${side}_buffAttackAbs`).value =
    unitData.buffs.attackAbs ?? 0;
  document.getElementById(`${side}_buffAttackAbsDur`).value =
    unitData.buffs.attackAbsDur ?? 0;
  document.getElementById(`${side}_buffAttackPct`).value =
    unitData.buffs.attackPct ?? 0;
  document.getElementById(`${side}_buffAttackPctDur`).value =
    unitData.buffs.attackPctDur ?? 0;
  document.getElementById(`${side}_buffHPabs`).value =
    unitData.buffs.hpAbs ?? 0;
  document.getElementById(`${side}_buffHPabsDur`).value =
    unitData.buffs.hpAbsDur ?? 0;
  document.getElementById(`${side}_buffHPpct`).value =
    unitData.buffs.hpPct ?? 0;
  document.getElementById(`${side}_buffHPpctDur`).value =
    unitData.buffs.hpPctDur ?? 0;
  document.getElementById(`${side}_buffSpeedPct`).value =
    unitData.buffs.speedPct ?? 0;
  document.getElementById(`${side}_buffSpeedPctDur`).value =
    unitData.buffs.speedPctDur ?? 0;
  document.getElementById(`${side}_buffMeleeArmor`).value =
    unitData.buffs.meleeArmor ?? 0;
  document.getElementById(`${side}_buffRangedArmor`).value =
    unitData.buffs.rangedArmor ?? 0;
  document.getElementById(`${side}_buffArmorDur`).value =
    unitData.buffs.armorDur ?? 0;

  document.getElementById(`${side}_firstHitEnabled`).checked =
    !!unitData.firstHitEnabled;
  document.getElementById(`${side}_freeHits`).value = unitData.freeHits ?? 0;

  const tagChecks = document.querySelectorAll(
    `#${side}_tagsContainer .tag-checkbox`,
  );
  tagChecks.forEach((cb) => {
    cb.checked = unitData.tags?.includes(cb.value) || false;
  });

  const bonusInputs = document.querySelectorAll(
    `#${side}_bonusesContainer .bonus-input`,
  );
  bonusInputs.forEach((input) => {
    const tag = input.dataset.tag;
    input.value = unitData.stats.bonus?.[tag] ?? 0;
  });

  const effectChecks = document.querySelectorAll(
    `#${side}_effectsContainer .effect-checkbox`,
  );
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

  // Restore saved tech state for this group
  if (group.unitData.activeTechs) {
    activeTechs[side] = new Map(group.unitData.activeTechs);
    const unitName = group.unitData.name;
    const civ = side === "A" ? selectedCivA : selectedCivB;
    techUnitTracker[side] = `${unitName}|${civ}`;
    const unit = units[unitName];
    if (unit) renderTechButtons(side, unitName, unit);
    syncTechBuffsToInputs(side);
  }

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
    const idx = multiRosters[side].findIndex(
      (g) => g.id === multiEditing[side],
    );
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
  const totalA = multiRosters.A.reduce(
    (sum, g) => sum + (parseInt(g.unitData.count, 10) || 0),
    0,
  );
  const totalB = multiRosters.B.reduce(
    (sum, g) => sum + (parseInt(g.unitData.count, 10) || 0),
    0,
  );
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

    // Build active tech icons for this group
    let techIconsHtml = "";
    if (g.unitData.activeTechs && g.unitData.activeTechs.length > 0) {
      techIconsHtml = `<div class="d-flex flex-wrap gap-1 mb-2">`;
      for (const [key] of g.unitData.activeTechs) {
        const techName = key.split("|")[0];
        const img = getTechImage(techName);
        techIconsHtml += `<div class="tech-btn active" style="width:22px;height:22px;min-width:22px;" title="${techName}">
          <img src="${img}" alt="${techName}" onerror="this.src='${FALLBACK_TECH_IMG}'">
        </div>`;
      }
      techIconsHtml += `</div>`;
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
      ${techIconsHtml}
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
    return Object.values(unit.civCosts[unitData.civGroup]).reduce(
      (sum, val) => sum + val,
      0,
    );
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
  const totals = {
    A: { units: 0, cost: 0, pop: 0 },
    B: { units: 0, cost: 0, pop: 0 },
  };
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
  return (
    multiRosters.A.find((g) => g.id === groupId) ||
    multiRosters.B.find((g) => g.id === groupId)
  );
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
  const checkboxes = card.querySelectorAll(".tag-checkbox:checked");
  return Array.from(checkboxes).map((cb) => cb.value);
}

function collectBonusesFromCard(card) {
  const bonuses = {};
  const inputs = card.querySelectorAll(".bonus-input");
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
    if (effect.civs && selectedCiv && !effect.civs.includes(selectedCiv))
      continue;
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
    } else if (effectId === "tripleShot") {
      valueHtml = `
        <div class="ms-4 mt-1">
          <small class="text-muted" style="font-size:0.72rem;">Adds 2 extra arrows at 30% damage each and upgrades bleed to 3.2 DPS for 6s.</small>
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
    } else if (effectId === "numeri") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="dmgIncrease"
                   value="${effect.dmgIncrease}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Dmg Taken %</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    } else if (effectId === "triumph") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="attackBonus"
                   value="${effect.attackBonus}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Atk</small>
          </div>
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="hps"
                   value="${effect.hps}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">HP/s</small>
          </div>
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="speedPct"
                   value="${effect.speedPct}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">+Spd %</small>
          </div>
          <div class="col-3">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Dur (s)</small>
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
    } else if (effectId === "poisonedArrows") {
      valueHtml = `
        <div class="row g-1 mt-1 ms-4">
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="totalDamage"
                   value="${effect.totalDamage}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Total Damage</small>
          </div>
          <div class="col-6">
            <input type="number" class="form-control form-control-sm" data-effect-id="${effectId}" data-effect-field="duration"
                   value="${effect.duration}" style="font-size:0.8rem;">
            <small class="text-muted" style="font-size:0.7rem;">Duration (s)</small>
          </div>
        </div>`;
    }

    // Use tech button icon for effects that have a linked tech, checkbox otherwise
    const linkedTech = EFFECT_TO_TECH[effectId];
    if (linkedTech) {
      const techImg = getTechImage(linkedTech);
      container.innerHTML += `
        <div class="mb-2 effect-row" data-effect="${effectId}">
          <div class="d-flex align-items-center gap-2">
            <div class="tech-btn effect-tech-toggle active" data-effect="${effectId}"
                 style="width:28px;height:28px;min-width:28px;" title="${linkedTech}">
              <img src="${techImg}" alt="${effect.name}" onerror="this.src='${FALLBACK_TECH_IMG}'">
            </div>
            <label class="effect-label" style="font-size:0.85rem;">
              <strong>${effect.name}</strong>
              <span style="font-size:0.75rem; color:#b8ad9e;"> — ${effect.description}</span>
            </label>
          </div>
          <div class="effect-value-area">${valueHtml}</div>
        </div>`;
    } else {
      container.innerHTML += `
        <div class="mb-2 effect-row">
          <div class="form-check">
            <input class="form-check-input effect-checkbox" type="checkbox" id="${checkId}" data-effect="${effectId}" checked>
            <label class="form-check-label" for="${checkId}" style="font-size:0.85rem;">
              <strong>${effect.name}</strong>
              <span style="font-size:0.75rem; color:#b8ad9e;"> — ${effect.description}</span>
            </label>
          </div>
          <div class="effect-value-area">${valueHtml}</div>
        </div>`;
    }
  }

  if (!container.innerHTML.trim()) {
    box.style.display = "none";
  }

  // Attach click handlers for effect tech toggle buttons (multi-battler)
  container.querySelectorAll(".effect-tech-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
    });
  });
}

function collectEffectsFromCard(card) {
  const effects = {};

  // Collect from both checkbox effects and tech-toggle effects
  const enabledEffectIds = new Set();
  card.querySelectorAll(".effect-checkbox").forEach((cb) => {
    if (cb.checked) enabledEffectIds.add(cb.dataset.effect);
  });
  card.querySelectorAll(".effect-tech-toggle.active").forEach((btn) => {
    enabledEffectIds.add(btn.dataset.effect);
  });

  enabledEffectIds.forEach((effectId) => {
    const getVal = (field) => {
      const input = card.querySelector(
        `[data-effect-id="${effectId}"][data-effect-field="${field}"]`,
      );
      return parseFloat(input?.value) || 0;
    };

    if (effectId === "postChargeAttackBuff") {
      effects.postChargeAttackBuff = {
        value: getVal("value"),
        duration: getVal("duration"),
      };
    } else if (effectId === "healPerAttack") {
      effects.healPerAttack = { value: getVal("value") };
    } else if (effectId === "berserking") {
      effects.berserking = {
        attackBonus: getVal("attackBonus"),
        armorPenalty: getVal("armorPenalty"),
        duration: getVal("duration"),
      };
    } else if (effectId === "fortitude") {
      effects.fortitude = {
        atkSpeedBonus: getVal("atkSpeedBonus"),
        dmgTakenIncrease: getVal("dmgTakenIncrease"),
        duration: getVal("duration"),
      };
    } else if (effectId === "deployPavise") {
      effects.deployPavise = {
        armorBonus: getVal("armorBonus"),
        duration: getVal("duration"),
      };
    } else if (effectId === "arrowVolley") {
      effects.arrowVolley = {
        atkSpeedBonus: getVal("atkSpeedBonus"),
        duration: getVal("duration"),
      };
    } else if (effectId === "staticDeployment") {
      effects.staticDeployment = {
        atkSpeedBonus: getVal("atkSpeedBonus"),
        delay: getVal("delay"),
      };
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
      effects.shieldWall = {
        atkSpeedPenalty: getVal("atkSpeedPenalty"),
        rangedDmgReduction: getVal("rangedDmgReduction"),
      };
    } else if (effectId === "bleed") {
      effects.bleed = { dps: getVal("dps"), duration: getVal("duration") };
    } else if (effectId === "tripleShot") {
      effects.tripleShot = true;
    } else if (effectId === "armorAura") {
      effects.armorAura = { armorBonus: getVal("armorBonus") };
    } else if (effectId === "trample") {
      effects.trample = {
        dps: getVal("dps"),
        duration: getVal("duration"),
        cooldown: getVal("cooldown"),
        unitsHit: getVal("unitsHit") || 3,
      };
    } else if (effectId === "numeri") {
      effects.numeri = {
        dmgIncrease: getVal("dmgIncrease"),
        duration: getVal("duration"),
      };
    } else if (effectId === "triumph") {
      effects.triumph = {
        attackBonus: getVal("attackBonus"),
        hps: getVal("hps"),
        speedPct: getVal("speedPct"),
        duration: getVal("duration"),
      };
    } else if (effectId === "percentDamage") {
      effects.percentDamage = { percent: getVal("percent") };
    } else if (effectId === "brotherhoodHP") {
      effects.brotherhoodHP = { hpPerUnit: getVal("hpPerUnit") };
    } else if (effectId === "healAura") {
      effects.healAura = { hps: getVal("hps") };
    } else if (effectId === "atkSpeedDebuff") {
      effects.atkSpeedDebuff = {
        reduction: getVal("reduction"),
        duration: getVal("duration"),
      };
    } else if (effectId === "caracole") {
      effects.caracole = {
        speedBonus: getVal("speedBonus"),
        duration: getVal("duration"),
        cooldown: getVal("cooldown"),
      };
    } else if (effectId === "armorDebuffAura") {
      effects.armorDebuffAura = { armorReduction: getVal("armorReduction") };
    } else if (effectId === "battleGlory") {
      effects.battleGlory = {
        hpPerKill: getVal("hpPerKill"),
        attackPerKill: getVal("attackPerKill"),
      };
    } else if (effectId === "aoeSplash") {
      effects.aoeSplash = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "aoeFalloff") {
      effects.aoeFalloff = { unitsHit: getVal("unitsHit") };
    } else if (effectId === "armorPenetration") {
      effects.armorPenetration = { penetration: getVal("penetration") };
    } else if (effectId === "dmgDebuffOnHit") {
      effects.dmgDebuffOnHit = {
        reduction: getVal("reduction"),
        duration: getVal("duration"),
      };
    } else if (effectId === "spearwall") {
      effects.spearwall = { stunDuration: getVal("stunDuration") };
    } else if (effectId === "palings") {
      effects.palings = {
        stunDuration: getVal("stunDuration"),
        damage: getVal("damage"),
      };
    } else if (effectId === "movementBurst") {
      effects.movementBurst = {
        speedBonus: getVal("speedBonus"),
        duration: getVal("duration"),
      };
    } else if (effectId === "infantrySpeedAura") {
      effects.infantrySpeedAura = { speedBonus: getVal("speedBonus") };
    } else if (effectId === "poisonedArrows") {
      effects.poisonedArrows = {
        totalDamage: getVal("totalDamage"),
        duration: getVal("duration"),
      };
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
  const labels = group.querySelectorAll("label");
  const primaryLabel = labels[0];
  const secondaryLabel = labels[1];
  const bothLabel = labels[2];
  const weaponInfoEl = card.querySelector('[data-role="weaponInfo"]');
  const unitName = getMultiField(card, "unitSelect")?.dataset.value || "";
  const { hasSecondary, supportsBoth } = getWeaponModeOptionState(
    unitName,
    unit,
    age,
  );

  inputs.forEach((input) => {
    const disabled =
      (input.value === "secondary" && !hasSecondary) ||
      (input.value === "both" && !supportsBoth);
    input.disabled = disabled;
    if (disabled && input.checked) {
      inputs[0].checked = true;
    }
  });

  secondaryLabel.style.display = hasSecondary ? "" : "none";
  bothLabel.style.display = supportsBoth ? "" : "none";

  if (hasSecondary) {
    primaryLabel.textContent = getWeaponDisplayName(unit.weapons.primary);
    secondaryLabel.textContent = getWeaponDisplayName(unit.weapons.secondary);
    bothLabel.textContent = "Both Attacks";
    const priAge = unit.weapons.primary.ages[age] || {};
    const secAge = unit.weapons.secondary.ages[age] || {};
    weaponInfoEl.textContent =
      `${getWeaponInfoText(unit.weapons.primary, priAge)} | ${getWeaponInfoText(unit.weapons.secondary, secAge)}`;
    weaponInfoEl.style.display = "";
  } else {
    const typeLabel =
      (unit.weapons.primary.type || "melee") === "ranged" ? "Ranged" : "Melee";
    primaryLabel.textContent = typeLabel;
    secondaryLabel.textContent = "Secondary";
    bothLabel.textContent = "Both";
    weaponInfoEl.textContent = "";
    weaponInfoEl.style.display = "none";
  }
}

function updateMultiSecondaryWeaponInputs(card, unitName, unit, age, weaponMode) {
  const wrapper = card.querySelector('[data-role="secondaryWeaponFields"]');
  if (!wrapper) return;
  const supportsBoth =
    weaponMode === "both" && unitSupportsBothWeapons(unitName, unit, age);
  if (!supportsBoth) {
    wrapper.style.display = "none";
    return;
  }

  const secondaryWeapon = unit.weapons.secondary;
  const secondaryStats = secondaryWeapon.ages[age] || {};
  const secondaryName = getWeaponDisplayName(secondaryWeapon);
  const heading = card.querySelector('[data-role="secondaryWeaponHeading"]');
  const attackLabel = card.querySelector('[data-role="secondaryAttackLabel"]');
  const attackSpeedLabel = card.querySelector(
    '[data-role="secondaryAttackSpeedLabel"]',
  );

  if (heading) heading.textContent = secondaryName;
  if (attackLabel) attackLabel.textContent = `${secondaryName} Attack`;
  if (attackSpeedLabel) {
    attackSpeedLabel.textContent = `${secondaryName} Speed (s)`;
  }
  getMultiField(card, "secondaryAttack").value = secondaryStats.attack || "";
  getMultiField(card, "secondaryAttackSpeed").value =
    secondaryWeapon.attackSpeed || 1;
  wrapper.style.display = "";
}

function updateMultiUnitStats(card, group) {
  const unitWrapper = getMultiField(card, "unitSelect");
  const unitName = unitWrapper.dataset.value;
  const unit = units[unitName];
  if (!unit) return;

  populateAgeDropdownMulti(card, unitName);
  const age = getMultiField(card, "age").value;
  updateWeaponModeButtonsMulti(card, unit, age);

  const weaponMode =
    card.querySelector('input[data-field="weaponMode"]:checked')?.value ||
    "primary";
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
  updateMultiSecondaryWeaponInputs(card, unitName, unit, age, weaponMode);

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
      document
        .querySelectorAll(".custom-select-wrapper")
        .forEach((w) => closeDropdown(w));
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
  dropdown
    .querySelectorAll(".custom-select-optgroup, .custom-select-option")
    .forEach((el) => el.remove());
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
      document
        .querySelectorAll(".custom-select-wrapper")
        .forEach((w) => closeDropdown(w));
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
  CIV_ORDER.forEach((civ) => {
    if (civ === "Common") return;
    if (filterLower && !civ.toLowerCase().includes(filterLower)) return;
    const sel = civ === currentVal ? " selected" : "";
    const flag = CIV_FLAGS[civ]
      ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:14px; border-radius:2px; vertical-align:middle;">`
      : "";
    html += `<div class="custom-select-option${sel}" data-value="${civ}"><span>${flag} ${civ}</span></div>`;
  });
  dropdown
    .querySelectorAll(".custom-select-option")
    .forEach((el) => el.remove());
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
  const weaponMode =
    card.querySelector('input[data-field="weaponMode"]:checked')?.value ||
    "primary";

  let weaponData, ageStats;
  if (weaponMode === "secondary" && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    ageStats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    ageStats = weaponData.ages[age] || {};
  }
  const supportsBoth =
    weaponMode === "both" && unitSupportsBothWeapons(unitName, unit, age);
  const secondaryStats = unit.weapons.secondary?.ages?.[age] || {};

  const countInput = getMultiField(card, "count");
  const collapsedInput = getMultiField(card, "countCollapsed");
  let count = group.ui?.collapsed
    ? parseInt(collapsedInput.value, 10)
    : parseInt(countInput.value, 10);
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
    weaponLabel: getWeaponDisplayName(weaponData),
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
      attackAbsDur:
        parseFloat(getMultiField(card, "buffAttackAbsDur").value) || 0,
      attackPct: parseFloat(getMultiField(card, "buffAttackPct").value) || 0,
      attackPctDur:
        parseFloat(getMultiField(card, "buffAttackPctDur").value) || 0,
      hpAbs: parseFloat(getMultiField(card, "buffHPabs").value) || 0,
      hpAbsDur: parseFloat(getMultiField(card, "buffHPabsDur").value) || 0,
      hpPct: parseFloat(getMultiField(card, "buffHPpct").value) || 0,
      hpPctDur: parseFloat(getMultiField(card, "buffHPpctDur").value) || 0,
      speedPct: parseFloat(getMultiField(card, "buffSpeedPct").value) || 0,
      speedPctDur:
        parseFloat(getMultiField(card, "buffSpeedPctDur").value) || 0,
      meleeArmor: parseFloat(getMultiField(card, "buffMeleeArmor").value) || 0,
      rangedArmor:
        parseFloat(getMultiField(card, "buffRangedArmor").value) || 0,
      armorDur: parseFloat(getMultiField(card, "buffArmorDur").value) || 0,
    },
    firstHitEnabled: getMultiField(card, "firstHitEnabled").checked,
    freeHits: parseInt(getMultiField(card, "freeHits").value, 10) || 0,
    tags,
    effects,
    chargeDamage: ageStats.chargeDamage || 0,
    weaponType: weaponData.type || "melee",
    weaponRange: weaponData.range || 0,
    weaponProjectiles: getWeaponProjectiles(weaponData),
    speed: unit.speed || 1,
    secondaryWeapon:
      supportsBoth
        ? {
            name: getWeaponDisplayName(unit.weapons.secondary),
            type: unit.weapons.secondary.type || "melee",
            attackSpeed:
              parseFloat(getMultiField(card, "secondaryAttackSpeed").value) ||
              unit.weapons.secondary.attackSpeed ||
              1,
            range: unit.weapons.secondary.range || 0,
            projectiles: getWeaponProjectiles(unit.weapons.secondary),
            stats: {
              ...secondaryStats,
              attack:
                parseFloat(getMultiField(card, "secondaryAttack").value) ||
                secondaryStats.attack ||
                0,
            },
          }
        : null,
  };

  updateGroupSummary(card, group);
  updateMultiTotals();
  if (prevName !== unitName) refreshTargetLabels();
}

function initMultiCard(card, group) {
  const modeGroup = card.querySelector('[data-role="weaponModeGroup"]');
  const modeInputs = modeGroup.querySelectorAll(
    'input[data-field="weaponMode"]',
  );
  const modeLabels = modeGroup.querySelectorAll("label");
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

  // Collapsible section toggles (Tags, Bonus Damage)
  card.querySelectorAll('[data-action="toggleSection"]').forEach((h6) => {
    h6.addEventListener("click", (e) => {
      e.stopPropagation();
      const content = h6.nextElementSibling;
      const arrow = h6.querySelector(".toggle-arrow");
      const expanded = content.style.display !== "none";
      content.style.display = expanded ? "none" : "";
      if (arrow) arrow.style.transform = expanded ? "rotate(-90deg)" : "";
      h6.setAttribute("aria-expanded", String(!expanded));
    });
  });

  card.addEventListener("click", (e) => {
    if (!group.ui?.collapsed) return;
    const interactive = e.target.closest(
      "input, select, textarea, button, .custom-select-wrapper, .target-actions, .section-toggle",
    );
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


function runMultiBattle() {
  if (multiRosters.A.length === 0 || multiRosters.B.length === 0) {
    alert("Add at least one group on each side.");
    return;
  }
  collapseAllOpenGroups();
  syncAllGroupsFromCards();

  const overkillEnabled = document.getElementById("overkillEnabled").checked;
  const rangeSpeedEnabled =
    document.getElementById("rangeSpeedEnabled")?.checked;
  const splitA = document.getElementById("multiSplitA")?.checked;
  const splitTargetsA = Math.max(
    1,
    parseInt(document.getElementById("multiSplitTargetsA")?.value) || 1,
  );
  const splitB = document.getElementById("multiSplitB")?.checked;
  const splitTargetsB = Math.max(
    1,
    parseInt(document.getElementById("multiSplitTargetsB")?.value) || 1,
  );

  syncTargetPriorities();

  const teamsA = multiRosters.A.map((g) => createTeamState(g));
  const teamsB = multiRosters.B.map((g) => createTeamState(g));
  const allTeams = [...teamsA, ...teamsB];
  const teamById = Object.fromEntries(allTeams.map((t) => [t.groupId, t]));

  allTeams.forEach((team) => {
    team.currentTargetId = pickNextTarget(
      team,
      team.side === "A" ? teamsB : teamsA,
    );
    if (team.currentTargetId) {
      const target = teamById[team.currentTargetId];
      team.closingDelay = rangeSpeedEnabled
        ? computeClosingDelay(team, target)
        : 0;
      team.nextPrimaryAttack =
        (team.unitData.firstHitEnabled
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

  while (
    teamsA.some((t) => t.units > 0) &&
    teamsB.some((t) => t.units > 0) &&
    time < maxTime
  ) {
    let nextEventTime = Infinity;
    allTeams.forEach((t) => {
      if (t.units <= 0) return;
      const next = Math.min(
        t.nextPrimaryAttack,
        t.nextSecondaryAttack,
        t.trampleTick,
        getNextBleedTick(t),
        getNextPoisonTick(t),
      );
      if (next < nextEventTime) nextEventTime = next;
    });
    if (!isFinite(nextEventTime)) break;
    time = nextEventTime;

    allTeams.forEach((t) => {
      if (t.units > 0) t.stats = applyBuffs(t.unitData, time);
    });

    allTeams.forEach((target) => {
      if (target.units <= 0) return;
      const bleedEntries = collectBleedTickEvents(target, time, EPSILON);
      bleedEntries.forEach((entry) => {
        const sourceTeam = entry.sourceId ? teamById[entry.sourceId] : null;
        battleLog.push({
          time: time.toFixed(2),
          attacker: entry.sourceId || entry.sourceSide || "?",
          attackerId: entry.sourceId || entry.sourceSide || "?",
          attackerSide: entry.sourceSide || sourceTeam?.side || null,
          target: target.groupId,
          weapon: "Bleed",
          dmg: entry.damage.toFixed(1),
          waste: (entry.waste || 0).toFixed(1),
          atkUnits: sourceTeam?.units || 0,
          tgtUnits: target.units,
          killsA:
            (entry.sourceSide || sourceTeam?.side) === "A" ? entry.kills || 0 : 0,
          killsB:
            (entry.sourceSide || sourceTeam?.side) === "B" ? entry.kills || 0 : 0,
          unitsDied: entry.kills || 0,
          notes: "Bleed Tick",
        });
      });
      // Poison ticks
      const poisonEntries = collectPoisonTickEvents(target, time, EPSILON);
      poisonEntries.forEach((entry) => {
        const sourceTeam = entry.sourceId ? teamById[entry.sourceId] : null;
        battleLog.push({
          time: time.toFixed(2),
          attacker: entry.sourceId || entry.sourceSide || "?",
          attackerId: entry.sourceId || entry.sourceSide || "?",
          attackerSide: entry.sourceSide || sourceTeam?.side || null,
          target: target.groupId,
          weapon: "Poison",
          dmg: entry.damage.toFixed(1),
          waste: (entry.waste || 0).toFixed(1),
          atkUnits: sourceTeam?.units || 0,
          tgtUnits: target.units,
          killsA:
            (entry.sourceSide || sourceTeam?.side) === "A" ? entry.kills || 0 : 0,
          killsB:
            (entry.sourceSide || sourceTeam?.side) === "B" ? entry.kills || 0 : 0,
          unitsDied: entry.kills || 0,
          notes: "Poison Tick",
        });
      });
    });

    const incoming = new Map();

    allTeams.forEach((attacker) => {
      if (attacker.units <= 0) return;
      let targetId = attacker.currentTargetId;
      if (!targetId) return;
      let target = teamById[targetId];
      if (!target || target.units <= 0) {
        targetId = pickNextTarget(
          attacker,
          attacker.side === "A" ? teamsB : teamsA,
        );
        attacker.currentTargetId = targetId;
        if (!targetId) return;
        target = teamById[targetId];
      }

      const atkResult = computeTeamAttack(attacker, target, time, {
        overkillEnabled,
        splitEnabled: attacker.side === "A" ? splitA : splitB,
        splitTargets: attacker.side === "A" ? splitTargetsA : splitTargetsB,
        EPSILON,
      });

      if (atkResult.log) {
        battleLog.push(atkResult.log);
      }
      if (atkResult.damage > 0) {
        if (!incoming.has(targetId))
          incoming.set(targetId, { details: [] });
        const entry = incoming.get(targetId);
        entry.details.push({
          attacker,
          attackerUnits: attacker.units,
          damage: atkResult.damage,
          log: atkResult.log,
          splitEnabled: atkResult.splitEnabled,
          splitTargets: atkResult.splitTargets,
          appliesBleed: atkResult.appliesBleed,
          appliesPoison: atkResult.appliesPoison,
          appliesAtkSpeedDebuff: atkResult.appliesAtkSpeedDebuff,
          appliesDamageDebuff: atkResult.appliesDamageDebuff,
          isSimultaneous: atkResult.isSimultaneous,
          primaryDamage: atkResult.primaryDamage,
          secondaryDamage: atkResult.secondaryDamage,
          aoeTargets: atkResult.aoeTargets,
          aoeFalloff: atkResult.aoeFalloff,
        });
      }
    });

    incoming.forEach((entry, targetId) => {
      const target = teamById[targetId];
      if (!target || target.units <= 0) return;
      entry.details.forEach((detail) => {
        if (!target || target.units <= 0) return;
        let result;
        if (detail.isSimultaneous) {
          // Apply primary (tusks) then secondary (spear) sequentially
          const r1 = applyBundledDamageToTeam(
            target, detail.primaryDamage, detail.attackerUnits,
            detail.splitEnabled, detail.splitTargets, overkillEnabled,
            detail.aoeTargets, detail.aoeFalloff,
          );
          const r2 = applyBundledDamageToTeam(
            target, detail.secondaryDamage, detail.attackerUnits,
            detail.splitEnabled, detail.splitTargets, overkillEnabled,
          );
          result = {
            dealt: r1.dealt + r2.dealt,
            waste: r1.waste + r2.waste,
            kills: r1.kills + r2.kills,
          };
        } else {
          result = applyBundledDamageToTeam(
            target,
            detail.damage,
            detail.attackerUnits,
            detail.splitEnabled,
            detail.splitTargets,
            overkillEnabled,
            detail.aoeTargets,
            detail.aoeFalloff,
          );
        }
        if (detail.log) {
          detail.log.dmg = result.dealt.toFixed(1);
          detail.log.waste = result.waste.toFixed(1);
          detail.log.tgtUnits = target.units;
          if (detail.attacker.side === "A") {
            detail.log.killsA = result.kills;
            detail.log.killsB = 0;
          } else {
            detail.log.killsA = 0;
            detail.log.killsB = result.kills;
          }
          detail.log.unitsDied = result.kills;
        }
        if (result.kills > 0) {
          applyBattleGlory(detail.attacker, result.kills);
        }
        if (detail.appliesBleed && result.dealt > 0) {
          applyKipchakBleed(
            detail.attacker,
            target,
            time,
            detail.splitEnabled,
            detail.splitTargets,
            detail.attackerUnits,
          );
        }
        if (detail.appliesPoison && result.dealt > 0) {
          applyPoison(
            detail.attacker,
            target,
            time,
            detail.splitEnabled,
            detail.splitTargets,
            detail.attackerUnits,
          );
        }
        if (detail.appliesAtkSpeedDebuff && result.dealt > 0) {
          target.atkSpeedDebuffUntil =
            time + detail.attacker.unitData.effects.atkSpeedDebuff.duration;
          target.atkSpeedDebuffReduction =
            detail.attacker.unitData.effects.atkSpeedDebuff.reduction;
        }
        if (detail.appliesDamageDebuff && result.dealt > 0) {
          target.dmgDebuffUntil =
            time + detail.attacker.unitData.effects.dmgDebuffOnHit.duration;
          target.dmgDebuffReduction =
            detail.attacker.unitData.effects.dmgDebuffOnHit.reduction;
        }
        const healEffect = detail.attacker.unitData.effects.healPerAttack;
        if (healEffect && result.dealt > 0) {
          const maxHp = detail.attacker.stats.hp;
          const injured = getAllTrackedUnits(detail.attacker).filter(u => u.hp < maxHp - 0.0001).length;
          if (injured > 0) {
            healTrackedTeam(
              detail.attacker,
              healEffect.value * Math.min(detail.attacker.units, injured),
            );
          }
        }
      });
    });

    allTeams.forEach((t) => {
      if (t.units <= 0) return;
      if (t.unitData.effects.healAura) {
        const dt = time - (t.lastHealAuraTime || 0);
        if (dt > 0) {
          healTrackedTeam(t, t.unitData.effects.healAura.hps * t.units * dt);
        }
      }
      // Triumph healing: +hps regen for duration (heals even during trample)
      if (t.unitData.effects.triumph && time <= t.unitData.effects.triumph.duration + EPSILON) {
        const dt = time - (t.lastHealAuraTime || 0);
        if (dt > 0) {
          healTrackedTeam(t, t.unitData.effects.triumph.hps * t.units * dt);
        }
      }
      t.lastHealAuraTime = time;
    });

    allTeams.forEach((t) => {
      if (t.unitData.effects.brotherhoodHP && t.units > 0) {
        const newHpPer =
          t.baseHp + t.unitData.effects.brotherhoodHP.hpPerUnit * (t.units - 1);
        setTrackedTeamHpPerUnit(t, newHpPer);
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

  const winner = teamsA.some((t) => t.units > 0)
    ? teamsB.some((t) => t.units > 0)
      ? "Draw"
      : "A"
    : teamsB.some((t) => t.units > 0)
      ? "B"
      : "Draw";

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
    const attackerClass =
      e.attackerSide === "A"
        ? "team-a-col"
        : e.attackerSide === "B"
          ? "team-b-col"
          : "";
    const targetClass =
      e.attackerSide === "A"
        ? "team-b-col"
        : e.attackerSide === "B"
          ? "team-a-col"
          : "";
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

  document.getElementById("multiSummaryA").innerHTML = buildSummaryHtml(
    teamsA,
    "A",
  );
  document.getElementById("multiSummaryB").innerHTML = buildSummaryHtml(
    teamsB,
    "B",
  );

  const logCollapse = document.getElementById("battleLogCollapse");
  if (logCollapse.classList.contains("show"))
    logCollapse.classList.remove("show");
  resultsEl.scrollIntoView({ behavior: "smooth" });
}

// ========================================
// PAGE NAVIGATION
// ========================================

function switchPage(pageName) {
  currentPage = pageName;
  // Update nav tabs
  document.querySelectorAll(".aoe4-nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === pageName);
  });

  if (pageName === "buildOrder") {
    const buildEls = document.querySelectorAll(".build-only");
    const hideEls = document.querySelectorAll(
      ".single-only, .multi-only, .battle-only",
    );
    if (buildEls.length)
      buildEls.forEach((el) => {
        el.style.display = "";
      });
    if (hideEls.length)
      hideEls.forEach((el) => {
        el.style.display = "none";
      });
    updateBoCivGate(true);
    return;
  } else {
    const buildEls = document.querySelectorAll(".build-only");
    const battleEls = document.querySelectorAll(".battle-only");
    if (buildEls.length)
      buildEls.forEach((el) => {
        el.style.display = "none";
      });
    if (battleEls.length)
      battleEls.forEach((el) => {
        el.style.display = "";
      });
  }

  // Toggle building mode
  const toggle = document.getElementById("vsBuildingToggle");
  const buildingPanel = document.getElementById("buildingPanel");
  const teamBNormal = document.getElementById("teamBNormal");

  const teamASections = document.getElementById("teamASectionsNormal");
  const torchInfo = document.getElementById("A_torchInfo");
  const torchDmgEl = document.getElementById("A_torchDamage");
  const attackCol = document.getElementById("A_attackCol");
  const attackSpeedCol = document.getElementById("A_attackSpeedCol");

  setUnitTitleInteractivity("A", true);

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
    const weaponMode = document.querySelector(
      'input[name="weaponModeA"]:checked',
    )?.value;
    const unitName = document.getElementById("unitASelect")?.dataset.value;
    const unit = units[unitName];
    const weaponType =
      unit?.weapons?.[weaponMode === "secondary" ? "secondary" : "primary"]
        ?.type || "melee";
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
    // Render unit siege/torch tech buttons for vs-building mode
    renderBuildingUnitTechs("A");
    // Update Team B title to show building name
    const bName = document.getElementById("buildingType")?.value || "Building";
    setUnitTitleInteractivity("B", false);
    const titleB = document.getElementById("titleB");
    if (titleB) {
      titleB.innerHTML = `<span>${bName}</span>`;
    }
  } else if (pageName === "multiBattle") {
    if (toggle) toggle.checked = false;
    if (teamBNormal) teamBNormal.style.display = "";
    if (buildingPanel) buildingPanel.style.display = "none";
    if (teamASections) teamASections.style.display = "";
    if (torchInfo) torchInfo.style.display = "none";
    if (attackCol) attackCol.style.display = "";
    if (attackSpeedCol) attackSpeedCol.style.display = "";
    setUnitTitleInteractivity("B", true);
    if (teamBNormal) updateUnitStats("B");
  } else {
    if (toggle) toggle.checked = false;
    if (teamBNormal) teamBNormal.style.display = "";
    if (buildingPanel) buildingPanel.style.display = "none";
    if (teamASections) teamASections.style.display = "";
    if (torchInfo) torchInfo.style.display = "none";
    if (attackCol) attackCol.style.display = "";
    if (attackSpeedCol) attackSpeedCol.style.display = "";
    setUnitTitleInteractivity("B", true);
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
  if (parseInt(garrisonInput.value) > b.garrisonMax)
    garrisonInput.value = b.garrisonMax;

  // Calculate effective stats with techs
  let hp = b.hp;
  let fireArmor = b.fireArmor;
  let rangedArmor = b.rangedArmor;
  let arrowUpgrades = 0;

  // Court Architects: +30% HP
  if (
    document.getElementById("techCourtArchitects")?.classList.contains("active")
  ) {
    hp = Math.round(hp * 1.3);
  }

  // Fortify Outpost: +1000 HP, +5 fire armor
  if (
    b.techs?.includes("fortifyOutpost") &&
    document.getElementById("techFortifyOutpost")?.classList.contains("active")
  ) {
    hp += 1000;
    fireArmor += 5;
  }

  // Castle Turret: +2 arrow damage
  if (
    b.techs?.includes("castleTurret") &&
    document.getElementById("techCastleTurret")?.classList.contains("active")
  ) {
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
  document.getElementById("buildingBaseArrowDmg").value =
    b.baseArrowDmg + arrowUpgrades;
  document.getElementById("buildingBaseArrowRate").value = b.baseArrowRate;
  document.getElementById("buildingGarrisonArrowDmg").value =
    b.garrisonArrowDmg + arrowUpgrades;
  document.getElementById("buildingGarrisonArrowRate").value =
    b.garrisonArrowRate;

  // Update Team B title to building name with civ flags
  const titleB = document.getElementById("titleB");
  if (titleB && document.getElementById("vsBuildingToggle")?.checked) {
    const civs = (b.civs || []).filter((c) => CIV_FLAGS[c]);
    const flagsHtml = civs
      .map(
        (c) =>
          `<img src="${CIV_FLAGS[c]}" alt="${c}" style="height:28px; border-radius:3px; margin-left:6px;">`,
      )
      .join("");
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
  if (castleTurretEl)
    castleTurretEl.style.display = hasCastleTurret ? "" : "none";

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
      const isOutpost = [
        "Outpost",
        "Toll Outpost",
        "Wooden Fortress",
        "Fortified Outpost",
      ].includes(bName);
      emplacementGrid.dataset.mode = isOutpost ? "radio" : "toggle";
      emplacementGrid.innerHTML = "";
      empList.forEach((name) => {
        const emp = EMPLACEMENTS[name];
        if (!emp) return;
        const civLabel = emp.civs?.length
          ? ` (${emp.civs[0].replace("Macedonian Dynasty", "Macedon.").replace("Knights Templar", "KT")})`
          : "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "building-tech-btn";
        btn.dataset.emplacement = name;
        const dmgText =
          emp.projectiles > 1 ? `${emp.dmg}×${emp.projectiles}` : `${emp.dmg}`;
        btn.title = `${dmgText} dmg, ${emp.rate}s, range ${emp.range}`;
        btn.textContent = name.replace(" Emplacement", "") + civLabel;
        btn.addEventListener("click", function () {
          if (emplacementGrid.dataset.mode === "radio") {
            // Radio: deactivate all others
            emplacementGrid
              .querySelectorAll(".building-tech-btn")
              .forEach((b) => b.classList.remove("active"));
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
  active.forEach((btn) => {
    const name = btn.dataset.emplacement;
    const emp = EMPLACEMENTS[name];
    if (!emp) return;
    const dmgText =
      emp.projectiles > 1 ? `${emp.dmg}×${emp.projectiles}` : `${emp.dmg}`;
    parts.push(
      `${name.replace(" Emplacement", "")}: ${dmgText} dmg / ${emp.rate}s`,
    );
  });
  summaryEl.textContent = parts.join(" | ");
}

function getBuildingData() {
  const bName = document.getElementById("buildingType").value;
  const b = BUILDINGS[bName];
  const garrison =
    parseInt(document.getElementById("buildingGarrison").value) || 0;
  const hp = parseFloat(document.getElementById("buildingHp").value) || b.hp;
  const rangedArmor =
    parseFloat(document.getElementById("buildingRangedArmor").value) || 0;
  const fireArmor =
    parseFloat(document.getElementById("buildingFireArmor").value) || 0;

  // Read active emplacements from toggle buttons
  const emplacements = [];
  const grid = document.getElementById("emplacementGrid");
  if (grid) {
    grid.querySelectorAll(".building-tech-btn.active").forEach((btn) => {
      const name = btn.dataset.emplacement;
      const empData = EMPLACEMENTS[name];
      if (empData) {
        emplacements.push({
          name,
          dmg: empData.dmg,
          projectiles: empData.projectiles,
          rate: empData.rate,
          range: empData.range,
          type: empData.type,
        });
      }
    });
  }

  return {
    name: bName,
    hp,
    rangedArmor,
    fireArmor,
    garrison,
    baseArrows:
      parseInt(document.getElementById("buildingBaseArrows").value) || 0,
    baseArrowDmg:
      parseFloat(document.getElementById("buildingBaseArrowDmg").value) || 0,
    baseArrowRate:
      parseFloat(document.getElementById("buildingBaseArrowRate").value) || 1,
    garrisonArrowDmg:
      parseFloat(document.getElementById("buildingGarrisonArrowDmg").value) ||
      0,
    garrisonArrowRate:
      parseFloat(document.getElementById("buildingGarrisonArrowRate").value) ||
      1,
    emplacements,
    range: b.range,
  };
}

function cycleArrowUpgrades() {
  const btn = document.getElementById("techArrowUpgrades");
  if (!btn) return;
  let level = (parseInt(btn.dataset.level) || 0) + 1;
  if (level > 3) level = 0;
  btn.dataset.level = level;
  btn.classList.toggle("active", level > 0);
  const labels = ["Arrows: 0", "Steeled: +1", "Balanced: +2", "Platecutter: +3"];
  const icons = [
    "assets/images/technologies/steeled-arrow-2.png",
    "assets/images/technologies/steeled-arrow-2.png",
    "assets/images/technologies/balanced-projectiles-3.png",
    "assets/images/technologies/platecutter-point-4.png",
  ];
  const labelEl = btn.querySelector(".building-tech-label");
  const imgEl = btn.querySelector("img");
  if (labelEl) labelEl.textContent = labels[level];
  if (imgEl) imgEl.src = icons[level];
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
    } else runBattle();
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
  const flatBox = document
    .getElementById(`collapseA_flatBuffs`)
    ?.closest(".buff-box");
  const pctBox = document
    .getElementById(`collapseA_pctBuffs`)
    ?.closest(".buff-box");
  const fhBox = document
    .getElementById(`collapseA_firstHit`)
    ?.closest(".first-hit-box");
  const effBox = document.getElementById(`${side}_effectsBox`);

  [
    ["A", "collapseA_flatBuffs", "collapseA_pctBuffs", "collapseA_firstHit"],
    ["B", "collapseB_flatBuffs", "collapseB_pctBuffs", "collapseB_firstHit"],
  ].forEach(([s, flatId, pctId, fhId]) => {
    if (s !== side) return;

    const flatEl = document.getElementById(flatId)?.closest(".buff-box");
    const pctEl = document.getElementById(pctId)?.closest(".buff-box");
    const fhEl = document.getElementById(fhId)?.closest(".first-hit-box");
    const effEl = document.getElementById(`${s}_effectsBox`);

    // Check flat buffs
    if (flatEl) {
      const hasFlat = [
        `${s}_buffAttackAbs`,
        `${s}_buffHPabs`,
        `${s}_buffMeleeArmor`,
        `${s}_buffRangedArmor`,
      ].some((id) => {
        const el = document.getElementById(id);
        return el && parseFloat(el.value);
      });
      flatEl.classList.toggle("section-active", hasFlat);
    }

    // Check pct buffs
    if (pctEl) {
      const hasPct = [`${s}_buffAttackPct`, `${s}_buffHPpct`].some((id) => {
        const el = document.getElementById(id);
        return el && parseFloat(el.value);
      });
      pctEl.classList.toggle("section-active", hasPct);
    }

    // Check first-hit
    if (fhEl) {
      const enabled = document.getElementById(`${s}_firstHitEnabled`)?.checked;
      const hits =
        parseInt(document.getElementById(`${s}_freeHits`)?.value) || 0;
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
document
  .getElementById("buildingType")
  ?.addEventListener("change", updateBuildingStats);
document.getElementById("buildingGarrison")?.addEventListener("input", () => {
  const input = document.getElementById("buildingGarrison");
  const max = parseInt(input.max) || 15;
  if (parseInt(input.value) > max) input.value = max;
});

// Tech toggle buttons
document
  .getElementById("techCourtArchitects")
  ?.addEventListener("click", function () {
    this.classList.toggle("active");
    updateBuildingStats();
  });
document
  .getElementById("techArrowUpgrades")
  ?.addEventListener("click", cycleArrowUpgrades);
document
  .getElementById("techFortifyOutpost")
  ?.addEventListener("click", function () {
    this.classList.toggle("active");
    updateBuildingStats();
  });
document
  .getElementById("techCastleTurret")
  ?.addEventListener("click", function () {
    this.classList.toggle("active");
    updateBuildingStats();
  });

// Emplacement toggle buttons are created dynamically in updateBuildingStats()

function hydrateUnitBattlerUi() {
  populateCivDropdowns();
  populateSelects();
  initBuildingSelect();
  initTechInputEnforcement();
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

export {
  switchPage,
  showUnitDetail,
  showUnitDetailWith,
  filterByCiv,
  updateBuildingStats,
  updateMultiTotals,
  updateMultiBattleReadyState,
};
