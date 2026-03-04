// ========================================
// AOE4 BATTLE SIMULATOR - COMPLETE SCRIPT WITH ALL FIXES
// ========================================

// Global variables
let units = {}; // All unit data from JSON
let allAvailableTags = new Set(); // All unique tags found across all units

/**
 * 1. DATA LOADING
 * Fetches the JSON file and extracts all unique tags from all units.
 */
fetch("units_restructured.json")
  .then((response) => response.json())
  .then((data) => {
    units = data;

    // Extract all unique tags from all units in the JSON
    // This allows us to show checkboxes for every possible tag
    Object.values(units).forEach((unit) => {
      if (unit.tags) {
        unit.tags.forEach((tag) => allAvailableTags.add(tag));
      }
    });

    populateSelects();
    updateUnitStats("A");
    updateUnitStats("B");
  })
  .catch((error) => console.error("Error loading units:", error));

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

// Civ name → flag filename mapping
const CIV_FLAGS = {
  "English": "AoE 4 Flags/English_AoE4.webp",
  "French": "AoE 4 Flags/French_AoE4.webp",
  "Holy Roman Empire": "AoE 4 Flags/HRE_AoE4.webp",
  "Mongols": "AoE 4 Flags/Mongols_AoE4.webp",
  "Rus": "AoE 4 Flags/Rus_AoE4.webp",
  "Delhi Sultanate": "AoE 4 Flags/Delhi_Sultanate_AoE4.webp",
  "Abbasid Dynasty": "AoE 4 Flags/Abbasid_Dynasty_AoE4.webp",
  "Chinese": "AoE 4 Flags/Chinese_AoE4.webp",
  "Ottomans": "AoE 4 Flags/Ottomans_AoE4.webp",
  "Malians": "AoE 4 Flags/Malians_AoE4.webp",
  "Byzantines": "AoE 4 Flags/Byzantines_AoE4.webp",
  "Japanese": "AoE 4 Flags/Japanese_AoE4.webp",
  "Ayyubids": "AoE 4 Flags/Ayyubids_AoE4.webp",
  "Jeanne d'Arc": "AoE 4 Flags/Jeanne_d_Arc_AoE4.webp",
  "Order of the Dragon": "AoE 4 Flags/Order_of_the_Dragon_AoE4.webp",
  "Zhu Xi's Legacy": "AoE 4 Flags/Zhu_Xis_Legacy_AoE4.webp",
  "House of Lancaster": "AoE 4 Flags/House_of_Lancaster_AoE4.webp",
  "Knights Templar": "AoE 4 Flags/Knights_Templar_AoE4.webp",
  "Golden Horde": "AoE 4 Flags/Golden_Horde_AoE4.webp",
  "Macedonian Dynasty": "AoE 4 Flags/Macedonian_Dynasty_AoE4.webp",
  "Sengoku Daimyo": "AoE 4 Flags/Sengoku_Daimyo_AoE4.webp",
  "Tughlaq Dynasty": "AoE 4 Flags/Tughlaq_Dynasty_AoE4.webp",
};

// Unit type categories for "sort by type" mode
const TYPE_ORDER = [
  "Light Infantry",
  "Heavy Infantry",
  "Ranged Infantry",
  "Light Cavalry",
  "Heavy Cavalry",
  "Ranged Cavalry",
  "Elephants",
];

function getUnitCategory(unit) {
  const tags = unit.tags || [];
  const hasInfantry = tags.includes("Infantry");
  const hasCavalry = tags.includes("Cavalry");
  const hasHeavy = tags.includes("Heavy");
  const hasRanged = tags.includes("Ranged");
  const hasElephant = tags.includes("Elephant");
  const hasLight = tags.includes("Light Infantry");

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

// Current sort mode
let sortByCiv = true;

// Helper: get flag HTML for a unit name (for dropdown & header)
function getUnitFlagHtml(unitName, imgHeight) {
  const unit = units[unitName];
  if (!unit) return "";
  const civs = (unit.civs || ["Common"]).filter(c => c !== "Common" && CIV_FLAGS[c]);
  return civs.map(c => `<img src="${CIV_FLAGS[c]}" alt="${c}" style="height:${imgHeight}px; border-radius:2px;">`).join("");
}

// Build grouped unit list based on current sort mode
function buildGroupedUnits(filter) {
  const groups = [];
  const filterLower = (filter || "").toLowerCase();

  if (sortByCiv) {
    const civGroups = {};
    Object.keys(units).forEach((name) => {
      if (filterLower && !name.toLowerCase().includes(filterLower)) return;
      const civs = units[name].civs || ["Common"];
      civs.forEach((civ) => {
        if (!civGroups[civ]) civGroups[civ] = [];
        civGroups[civ].push(name);
      });
    });
    Object.values(civGroups).forEach((arr) => arr.sort());
    CIV_ORDER.forEach((civ) => {
      if (!civGroups[civ] || civGroups[civ].length === 0) return;
      groups.push({ label: civ, units: civGroups[civ] });
    });
  } else {
    const typeGroups = {};
    Object.keys(units).forEach((name) => {
      if (filterLower && !name.toLowerCase().includes(filterLower)) return;
      const cat = getUnitCategory(units[name]);
      if (!typeGroups[cat]) typeGroups[cat] = [];
      typeGroups[cat].push(name);
    });
    Object.values(typeGroups).forEach((arr) => arr.sort());
    TYPE_ORDER.forEach((type) => {
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
  const groups = buildGroupedUnits(filter);

  // Keep search input, rebuild options
  const searchInput = dropdown.querySelector(".custom-select-search");
  let html = "";
  groups.forEach((g) => {
    html += `<div class="custom-select-optgroup">${g.label}</div>`;
    g.units.forEach((name) => {
      const sel = name === currentVal ? " selected" : "";
      const flags = getUnitFlagHtml(name, 16);
      html += `<div class="custom-select-option${sel}" data-value="${name}"><span>${name}</span><span class="cs-opt-flags">${flags}</span></div>`;
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
  const header = wrapper.querySelector(".custom-select-header");
  const nameSpan = header.querySelector(".cs-name");
  const flagsSpan = header.querySelector(".cs-flags");
  nameSpan.textContent = val;
  flagsSpan.innerHTML = getUnitFlagHtml(val, 18);
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

function toggleSortMode() {
  sortByCiv = !sortByCiv;
  const btn = document.getElementById("sortToggleBtn");
  btn.textContent = sortByCiv ? "Sort: by Civ" : "Sort: by Type";
  // Re-render any open dropdowns
  document.querySelectorAll(".custom-select-wrapper").forEach(w => {
    if (w.querySelector(".custom-select-dropdown.show")) {
      renderDropdownOptions(w, w.querySelector(".custom-select-search").value);
    }
  });
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
  ).value;
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

  for (const [effectId, effect] of Object.entries(effects)) {
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
    } else if (effectId === "openingAttack") {
      effects.openingAttack = { damage: getVal("damage") };
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
  ).value;

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

  // Update card title: name left, flags right
  const titleEl = document.getElementById(`title${side}`);
  if (titleEl) {
    const civs = (unit.civs || ["Common"]).filter(c => c !== "Common" && CIV_FLAGS[c]);
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
    const civs = (unit.civs || ["Common"]).filter(c => c !== "Common" && CIV_FLAGS[c]);
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
  const unit = units[unitName];
  if (!unit) return;

  const age = document.getElementById(`unit${side}Age`).value;
  const ageNames = { "1": "Dark Age", "2": "Feudal Age", "3": "Castle Age", "4": "Imperial Age" };
  const teamColor = side === "A" ? "#4a90d9" : "#d94a4a";

  document.getElementById("unitDetailTitle").textContent = unitName;
  document.getElementById("unitDetailTitle").style.color = teamColor;

  // Build costs string
  const costs = unit.costs || {};
  const costParts = [];
  if (costs.food) costParts.push(`${costs.food} Food`);
  if (costs.wood) costParts.push(`${costs.wood} Wood`);
  if (costs.gold) costParts.push(`${costs.gold} Gold`);
  if (costs.stone) costParts.push(`${costs.stone} Stone`);

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
      const isSelected = ageKey === age;
      const rowStyle = isSelected ? `background:rgba(${side === "A" ? "74,144,217" : "217,74,74"},0.15); font-weight:600;` : "";
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

  // Build upgrades detail grouped by category
  let upgradesHtml = "";
  if (unit.upgrades && unit.upgrades.length > 0) {
    upgradesHtml = `<h6 style="color:${teamColor}; margin-top:16px; font-family:'Cinzel',serif;">Technologies</h6>`;
    const catLabels = {hitpoints:"Hit Points", attack:"Attack", armor:"Armor", attackSpeed:"Attack Speed", moveSpeed:"Move Speed", range:"Range", creationSpeed:"Creation Speed", upgrading:"Upgrading", ability:"Ability", cost:"Cost", other:"Other"};
    const catIcons = {hitpoints:"\u2764\uFE0F", attack:"\u2694\uFE0F", armor:"\uD83D\uDEE1\uFE0F", attackSpeed:"\u23F1\uFE0F", moveSpeed:"\uD83D\uDC5F", range:"\uD83C\uDFAF", creationSpeed:"\u23F3", upgrading:"\u2B06\uFE0F", ability:"\u2728", cost:"\uD83D\uDCB0", other:"\u2699\uFE0F"};
    let curCat = null;
    const flagImg = (civ) => CIV_FLAGS[civ] ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:16px; border-radius:2px; vertical-align:middle;">` : `<span style="font-size:0.7rem; color:#b8ad9e;" title="${civ}">${civ}</span>`;

    upgradesHtml += `<div style="border:1px solid rgba(212,164,74,0.2); border-radius:8px; overflow:hidden;">`;
    for (const upg of unit.upgrades) {
      if (upg.category !== curCat) {
        curCat = upg.category;
        upgradesHtml += `<div style="background:rgba(212,164,74,0.12); padding:6px 12px; font-size:0.8rem; font-weight:600; color:#d4a44a; border-top:1px solid rgba(212,164,74,0.2);">${catIcons[curCat] || ""} ${catLabels[curCat] || curCat}</div>`;
      }
      let civInfo = "";
      if (upg.civs && upg.civs.length > 0) {
        civInfo = `<span style="margin-left:6px;">${upg.civs.map(c => flagImg(c)).join(" ")}</span>`;
      }

      upgradesHtml += `<div style="padding:5px 12px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.82rem; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">`;
      upgradesHtml += `<strong style="color:#e0d6c2;">${upg.name}</strong>`;
      upgradesHtml += `<span style="color:#e0d6c2;">(${upg.description})</span>`;
      upgradesHtml += civInfo;
      upgradesHtml += `</div>`;

    }
    upgradesHtml += `</div>`;
  }

  // Build aura buffs display grouped by category
  let aurasHtml = "";
  if (unit.auras && unit.auras.length > 0) {
    aurasHtml = `<h6 style="color:${teamColor}; margin-top:16px; font-family:'Cinzel',serif;">Aura Buffs</h6>`;
    const catLabels = {hitpoints:"Hit Points", attack:"Attack", armor:"Armor", attackSpeed:"Attack Speed", moveSpeed:"Move Speed", range:"Range", creationSpeed:"Creation Speed", upgrading:"Upgrading", ability:"Ability", cost:"Cost", other:"Other"};
    const catIcons = {hitpoints:"\u2764\uFE0F", attack:"\u2694\uFE0F", armor:"\uD83D\uDEE1\uFE0F", attackSpeed:"\u23F1\uFE0F", moveSpeed:"\uD83D\uDC5F", range:"\uD83C\uDFAF", creationSpeed:"\u23F3", upgrading:"\u2B06\uFE0F", ability:"\u2728", cost:"\uD83D\uDCB0", other:"\u2699\uFE0F"};
    const flagImg = (civ) => CIV_FLAGS[civ] ? `<img src="${CIV_FLAGS[civ]}" alt="${civ}" title="${civ}" style="height:16px; border-radius:2px; vertical-align:middle;">` : `<span style="font-size:0.7rem; color:#b8ad9e;" title="${civ}">${civ}</span>`;

    // Sort auras by category
    const catOrder = ["attackSpeed", "attack", "armor", "hitpoints", "moveSpeed", "range", "creationSpeed", "ability", "cost", "other"];
    const sortedAuras = [...unit.auras].sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category));

    let curCat = null;
    aurasHtml += `<div style="border:1px solid rgba(100,180,255,0.2); border-radius:8px; overflow:hidden;">`;
    for (const aura of sortedAuras) {
      if (aura.category !== curCat) {
        curCat = aura.category;
        aurasHtml += `<div style="background:rgba(100,180,255,0.08); padding:6px 12px; font-size:0.8rem; font-weight:600; color:#6ab4ff; border-top:1px solid rgba(100,180,255,0.2);">${catIcons[curCat] || ""} ${catLabels[curCat] || curCat}</div>`;
      }
      let civInfo = "";
      if (aura.civs && aura.civs.length > 0) {
        civInfo = `<span style="margin-left:6px;">${aura.civs.map(c => flagImg(c)).join(" ")}</span>`;
      }
      aurasHtml += `<div style="padding:5px 12px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.82rem; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">`;
      aurasHtml += `<strong style="color:#e0d6c2;">${aura.name}</strong>`;
      aurasHtml += `<span style="color:#e0d6c2;">(${aura.description})</span>`;
      aurasHtml += civInfo;
      aurasHtml += `</div>`;
    }
    aurasHtml += `</div>`;
  }

  document.getElementById("unitDetailBody").innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:0.9rem;">
      <div><span style="color:#b8ad9e;">Civilizations:</span> ${unit.civs.join(", ")}</div>
      <div><span style="color:#b8ad9e;">Cost:</span> ${costParts.join(" / ") || "Free"}</div>
      <div><span style="color:#b8ad9e;">Training Time:</span> ${unit.trainingTime || "—"}s</div>
      <div><span style="color:#b8ad9e;">Speed:</span> ${unit.speed || "—"}</div>
      <div><span style="color:#b8ad9e;">Population:</span> ${unit.population || 1}</div>
    </div>
    <div style="margin-bottom:12px;">${tags}</div>
    ${weaponsHtml}
    ${effectsHtml}
    ${upgradesHtml}
    ${aurasHtml}
  `;

  new bootstrap.Modal(document.getElementById("unitDetailModal")).show();
}

/**
 * Helper: Calculate total resource cost
 */
function getTotalCost(unitName) {
  const unit = units[unitName];
  if (!unit || !unit.costs) return 0;
  return Object.values(unit.costs).reduce((sum, val) => sum + val, 0);
}

/**
 * 4. COST BALANCING
 */
function balanceCosts() {
  const unitAName = document.getElementById("unitASelect").dataset.value;
  const unitBName = document.getElementById("unitBSelect").dataset.value;

  const costA = getTotalCost(unitAName);
  const costB = getTotalCost(unitBName);

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
  ).value;

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
function calcWeaponDamage(weaponType, weaponAttack, weaponBonus, enemyTags, enemyStats) {
  let damage = weaponAttack;

  // Add bonus damage against enemy tags
  for (let tag of enemyTags) {
    if (weaponBonus && weaponBonus[tag]) {
      damage += weaponBonus[tag];
    }
  }

  // Subtract armor (minimum 1 damage)
  const armor = weaponType === "ranged"
    ? enemyStats.rangedArmor
    : enemyStats.meleeArmor;

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
  } else if (results.lastUnitHp >= results.lastUnitHpMax) {
    el.textContent = "All units full HP";
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

  // How many are fully healthy vs the last damaged one
  const fullUnits = (results.lastUnitHp >= results.lastUnitHpMax) ? alive : Math.max(0, alive - 1);
  const hasPartial = alive > 0 && results.lastUnitHp < results.lastUnitHpMax;
  const partialPct = hasPartial ? (results.lastUnitHp / results.lastUnitHpMax * 100) : 0;

  for (let i = 0; i < startCount; i++) {
    const cell = document.createElement("div");
    cell.className = "unit-cell";

    if (i < fullUnits) {
      // Full HP unit
      cell.classList.add(`unit-alive-${teamClass}`);
    } else if (i === fullUnits && hasPartial) {
      // Partial HP unit - use gradient fill
      cell.classList.add(`unit-partial-${teamClass}`);
      cell.style.setProperty("--fill-pct", partialPct + "%");
    } else {
      // Dead unit
      cell.classList.add("unit-dead");
    }

    el.appendChild(cell);
  }
}

function runBattle() {
  const unitA = getUnitData("A");
  const unitB = getUnitData("B");
  const overkillEnabled = document.getElementById("overkillEnabled").checked;

  // --- TEAM INITIALIZATION ---
  // Each team tracks separate timers for primary and secondary weapons.
  // If no secondary weapon, its timer is Infinity (never fires).

  const primaryStartA = unitA.firstHitEnabled
    ? -unitA.freeHits * unitA.stats.attackSpeed
    : 0;

  const primaryStartB = unitB.firstHitEnabled
    ? -unitB.freeHits * unitB.stats.attackSpeed
    : 0;

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
      const dmg = calcWeaponDamage(
        unitA.weaponType,
        attackValue,
        teamA.originalStats.bonus,
        teamB.tags,
        effectiveStatsB
      );
      // AoE Splash: each unit hits multiple enemies
      const splashA = unitA.effects.aoeSplash ? Math.min(unitA.effects.aoeSplash.unitsHit, teamB.units) : 1;
      damageToB += dmg * teamA.units * splashA;
      teamA.nextPrimaryAttack = time + atkSpeedA;
      aFiredPrimary = true;
      if (unitA.chargeDamage > 0 && (!teamA.hasCharged || time <= teamA.chargeTime + EPSILON)) logNotesA.push("Charge");
      if (unitA.effects.aoeSplash && splashA > 1) logNotesA.push(`AoE×${splashA}`);
      // Atk Speed Debuff: slow enemy on hit
      if (unitA.effects.atkSpeedDebuff) {
        teamB.atkSpeedDebuffUntil = time + unitA.effects.atkSpeedDebuff.duration;
        teamB.atkSpeedDebuffReduction = unitA.effects.atkSpeedDebuff.reduction;
      }
    }

    // === TEAM A SECONDARY WEAPON ===
    if (teamA.unitData.secondaryWeapon &&
        teamA.nextSecondaryAttack <= time + EPSILON && teamA.units > 0) {
      const sec = teamA.unitData.secondaryWeapon;
      const dmg = calcWeaponDamage(
        sec.type,
        sec.stats.attack || 0,
        sec.stats.bonus || {},
        teamB.tags,
        effectiveStatsB
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
      const dmg = calcWeaponDamage(
        unitB.weaponType,
        attackValue,
        teamB.originalStats.bonus,
        teamA.tags,
        effectiveStatsA
      );
      // AoE Splash: each unit hits multiple enemies
      const splashB = unitB.effects.aoeSplash ? Math.min(unitB.effects.aoeSplash.unitsHit, teamA.units) : 1;
      damageToA += dmg * teamB.units * splashB;
      teamB.nextPrimaryAttack = time + atkSpeedB;
      bFiredPrimary = true;
      if (unitB.chargeDamage > 0 && (!teamB.hasCharged || time <= teamB.chargeTime + EPSILON)) logNotesB.push("Charge");
      if (unitB.effects.aoeSplash && splashB > 1) logNotesB.push(`AoE×${splashB}`);
      // Atk Speed Debuff: slow enemy on hit
      if (unitB.effects.atkSpeedDebuff) {
        teamA.atkSpeedDebuffUntil = time + unitB.effects.atkSpeedDebuff.duration;
        teamA.atkSpeedDebuffReduction = unitB.effects.atkSpeedDebuff.reduction;
      }
    }

    // === TEAM B SECONDARY WEAPON ===
    if (teamB.unitData.secondaryWeapon &&
        teamB.nextSecondaryAttack <= time + EPSILON && teamB.units > 0) {
      const sec = teamB.unitData.secondaryWeapon;
      const dmg = calcWeaponDamage(
        sec.type,
        sec.stats.attack || 0,
        sec.stats.bonus || {},
        teamA.tags,
        effectiveStatsA
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
    let wasteA = 0, wasteB = 0;
    if (overkillEnabled) {
      const rawDmgToB = damageToB, rawDmgToA = damageToA;
      if (damageToB > 0 && teamA.units > 0) {
        const dmgPer = damageToB / teamA.units;
        const hpPer = teamB.stats.hp;
        let frontHp = teamB.totalHp - (teamB.units - 1) * hpPer;
        let eff = 0;
        for (let i = 0; i < teamA.units; i++) {
          if (frontHp <= 0) break;
          const dealt = Math.min(dmgPer, frontHp);
          eff += dealt;
          frontHp -= dealt;
          if (frontHp <= 0) frontHp = hpPer;
        }
        damageToB = eff;
      }
      if (damageToA > 0 && teamB.units > 0) {
        const dmgPer = damageToA / teamB.units;
        const hpPer = teamA.stats.hp;
        let frontHp = teamA.totalHp - (teamA.units - 1) * hpPer;
        let eff = 0;
        for (let i = 0; i < teamB.units; i++) {
          if (frontHp <= 0) break;
          const dealt = Math.min(dmgPer, frontHp);
          eff += dealt;
          frontHp -= dealt;
          if (frontHp <= 0) frontHp = hpPer;
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

    // --- Push battle log entry ---
    const aWeapon = aFiredPrimary && aFiredSecondary ? "Both" : aFiredPrimary ? "Primary" : aFiredSecondary ? "Secondary" : "—";
    const bWeapon = bFiredPrimary && bFiredSecondary ? "Both" : bFiredPrimary ? "Primary" : bFiredSecondary ? "Secondary" : "—";
    battleLog.push({
      time: time.toFixed(2),
      aWeapon, aDmg: damageToB.toFixed(1), aWaste: wasteA.toFixed(1),
      aUnits: teamA.units, aHp: Math.round(teamA.totalHp),
      bWeapon, bDmg: damageToA.toFixed(1), bWaste: wasteB.toFixed(1),
      bUnits: teamB.units, bHp: Math.round(teamB.totalHp),
      notes: [...logNotesA, ...logNotesB].join(", ")
    });
  }

  // --- RESULTS DISPLAY ---

  const winner = teamA.units > 0 ? "A" : teamB.units > 0 ? "B" : "Draw";

  // Calculate stats for BOTH teams
  function calcTeamResults(team, unitData) {
    const hpPct = team.units > 0
      ? (team.totalHp / (team.stats.hp * unitData.count)) * 100
      : 0;
    const unitsLost = unitData.count - team.units;
    const costPerUnit = getTotalCost(unitData.name);
    const resourcesLost = costPerUnit * unitsLost;

    // Per-resource breakdown for tooltip
    const unit = units[unitData.name];
    const costs = unit && unit.costs ? unit.costs : {};
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

    return { hpPct, unitsLost, resourcesLost, costBreakdown, lastUnitHp, lastUnitHpMax, aliveUnits: team.units, startingUnits: unitData.count };
  }

  const resultsA = calcTeamResults(teamA, unitA);
  const resultsB = calcTeamResults(teamB, unitB);

  // Show results container with animation
  const resultsEl = document.getElementById("results");
  resultsEl.style.display = "block";
  resultsEl.style.animation = "none";
  resultsEl.offsetHeight; // trigger reflow
  resultsEl.style.animation = "";

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
  document.getElementById("resultCostLostA").textContent = resultsA.resourcesLost.toFixed(0);
  document.getElementById("resultHpPctA").textContent = resultsA.hpPct.toFixed(1) + "%";

  // Team B results
  document.getElementById("resultNameB").textContent = `${unitB.name} (x${unitB.count})`;
  document.getElementById("resultUnitsB").textContent = teamB.units;
  document.getElementById("resultUnitsLostB").textContent = resultsB.unitsLost;
  document.getElementById("resultCostLostB").textContent = resultsB.resourcesLost.toFixed(0);
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
        <th class="team-a-col">Units</th><th class="team-a-col">Total HP</th>
        <th class="team-b-col">Weapon</th><th class="team-b-col">Dmg Dealt</th>${showWaste ? '<th class="team-b-col">Wasted</th>' : ''}
        <th class="team-b-col">Units</th><th class="team-b-col">Total HP</th>
        <th>Notes</th>
      </tr></thead><tbody>`;
    for (const e of battleLog) {
      html += `<tr>
        <td>${e.time}s</td>
        <td class="team-a-col">${e.aWeapon}</td><td class="team-a-col">${e.aDmg}</td>${showWaste ? `<td class="team-a-col">${e.aWaste || '0.0'}</td>` : ''}
        <td class="team-a-col">${e.aUnits}</td><td class="team-a-col">${e.aHp}</td>
        <td class="team-b-col">${e.bWeapon}</td><td class="team-b-col">${e.bDmg}</td>${showWaste ? `<td class="team-b-col">${e.bWaste || '0.0'}</td>` : ''}
        <td class="team-b-col">${e.bUnits}</td><td class="team-b-col">${e.bHp}</td>
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

document.getElementById("battleBtn").addEventListener("click", function () {
  // Button press animation
  const btn = this;
  btn.style.animation = "none";
  btn.style.transform = "scale(0.9)";
  btn.style.boxShadow = "0 0 60px rgba(212, 164, 74, 0.8)";

  setTimeout(() => {
    btn.style.transform = "";
    btn.style.boxShadow = "";
    btn.style.animation = "";
  }, 300);

  runBattle();
});

document.getElementById("autoBalance").addEventListener("change", function () {
  if (this.checked) balanceCosts();
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
