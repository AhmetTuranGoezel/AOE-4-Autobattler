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
    Object.values(units).forEach(unit => {
      if (unit.tags) {
        unit.tags.forEach(tag => allAvailableTags.add(tag));
      }
    });
    
    populateSelects();
    updateUnitStats("A");
    updateUnitStats("B");
  })
  .catch((error) => console.error("Error loading units:", error));

/**
 * 2. UI POPULATION - Dropdowns
 */
function populateSelects() {
  const selectA = document.getElementById("unitASelect");
  const selectB = document.getElementById("unitBSelect");

  selectA.innerHTML = "";
  selectB.innerHTML = "";

  Object.keys(units).forEach((name) => {
    selectA.innerHTML += `<option value="${name}">${name}</option>`;
    selectB.innerHTML += `<option value="${name}">${name}</option>`;
  });

  selectA.value = "Horseman";
  selectB.value = "Horseman";
}

/**
 * Helper: Returns available ages for a unit
 */
function getAvailableAges(unitName) {
  const unit = units[unitName];
  if (!unit || !unit.weapons || !unit.weapons.primary || !unit.weapons.primary.ages) return [];
  return Object.keys(unit.weapons.primary.ages);
}

/**
 * FIXED: Populate age dropdown while PRESERVING the currently selected age
 * This prevents the dropdown from resetting every time the unit changes.
 */
function populateAgeDropdown(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
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
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];
  const age = document.getElementById(`unit${side}Age`).value;

  const hasSecondary = unit.weapons.secondary && 
                       unit.weapons.secondary.ages && 
                       unit.weapons.secondary.ages[age];

  const secondaryRadio = document.getElementById(`secondary${side}`);
  const bothRadio = document.getElementById(`both${side}`);
  const primaryRadio = document.getElementById(`primary${side}`);

  secondaryRadio.disabled = !hasSecondary;
  bothRadio.disabled = !hasSecondary;

  const selectedMode = document.querySelector(`input[name="weaponMode${side}"]:checked`).value;
  if (!hasSecondary && (selectedMode === "secondary" || selectedMode === "both")) {
    primaryRadio.checked = true;
  }
}

/**
 * NEW: Render tag checkboxes dynamically
 * Shows all available tags with checkboxes, pre-selecting the unit's default tags
 */
function renderTagCheckboxes(side, selectedTags) {
  const container = document.getElementById(`${side}_tagsContainer`);
  container.innerHTML = '';
  
  // Sort tags alphabetically for consistent display
  const sortedTags = Array.from(allAvailableTags).sort();
  
  sortedTags.forEach(tag => {
    const isChecked = selectedTags.includes(tag);
    const checkboxId = `${side}_tag_${tag.replace(/\s+/g, '_')}`; // Handle tags with spaces
    
    container.innerHTML += `
      <div class="form-check form-check-inline">
        <input class="form-check-input tag-checkbox" type="checkbox" 
               id="${checkboxId}" value="${tag}" ${isChecked ? 'checked' : ''}>
        <label class="form-check-label small" for="${checkboxId}">${tag}</label>
      </div>
    `;
  });
  
  // Add event listeners to update bonus inputs when tags change
  container.querySelectorAll('.tag-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const currentBonuses = collectBonuses(side);
      renderBonusInputs(side, currentBonuses);
    });
  });
}

/**
 * NEW: Render editable bonus damage inputs
 * Only shows inputs for tags that are currently checked
 */
function renderBonusInputs(side, bonuses) {
  const container = document.getElementById(`${side}_bonusesContainer`);
  container.innerHTML = '';
  
  // Get currently checked tags
  const checkedTags = collectTags(side);
  
  if (checkedTags.length === 0) {
    container.innerHTML = '<small class="text-muted">No tags selected</small>';
    return;
  }
  
  checkedTags.forEach(tag => {
    const bonusValue = bonuses[tag] || 0;
    const inputId = `${side}_bonus_${tag.replace(/\s+/g, '_')}`;
    
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
  const inputs = document.querySelectorAll(`#${side}_bonusesContainer .bonus-input`);
  
  inputs.forEach(input => {
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
  const checkboxes = document.querySelectorAll(`#${side}_tagsContainer .tag-checkbox:checked`);
  return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * 3. UI UPDATES
 * Called when unit, age, or weapon mode changes
 */
function updateUnitStats(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];

  if (!unit) return;

  // Update dropdowns (now preserves selected age!)
  populateAgeDropdown(side);
  updateWeaponModeButtons(side);

  const age = document.getElementById(`unit${side}Age`).value;
  const weaponMode = document.querySelector(`input[name="weaponMode${side}"]:checked`).value;

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
  document.getElementById(`${side}_attackSpeed`).value = weaponData.attackSpeed || 1;

  // NEW: Render tag checkboxes and bonus inputs
  renderTagCheckboxes(side, unit.tags || []);
  renderBonusInputs(side, stats.bonus || {});

  // Auto-balance costs if enabled
  if (document.getElementById("autoBalance").checked) {
    balanceCosts();
  }
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
  const unitAName = document.getElementById("unitASelect").value;
  const unitBName = document.getElementById("unitBSelect").value;

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
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];
  const age = document.getElementById(`unit${side}Age`).value;
  const weaponMode = document.querySelector(`input[name="weaponMode${side}"]:checked`).value;

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
      meleeArmor: parseFloat(document.getElementById(`${side}_meleeArmor`).value) || 0,
      rangedArmor: parseFloat(document.getElementById(`${side}_rangedArmor`).value) || 0,
      attackSpeed: parseFloat(document.getElementById(`${side}_attackSpeed`).value) || 1,
      bonus: collectBonuses(side) // NEW: Custom bonuses from UI
    },
    buffs: {
      attackAbs: parseFloat(document.getElementById(`${side}_buffAttackAbs`).value) || 0,
      attackAbsDur: parseFloat(document.getElementById(`${side}_buffAttackAbsDur`).value) || 0,
      attackPct: parseFloat(document.getElementById(`${side}_buffAttackPct`).value) || 0,
      attackPctDur: parseFloat(document.getElementById(`${side}_buffAttackPctDur`).value) || 0,
      hpAbs: parseFloat(document.getElementById(`${side}_buffHPabs`).value) || 0,
      hpAbsDur: parseFloat(document.getElementById(`${side}_buffHPabsDur`).value) || 0,
      hpPct: parseFloat(document.getElementById(`${side}_buffHPpct`).value) || 0,
      hpPctDur: parseFloat(document.getElementById(`${side}_buffHPpctDur`).value) || 0,
      speedPct: parseFloat(document.getElementById(`${side}_buffSpeedPct`).value) || 0,
      speedPctDur: parseFloat(document.getElementById(`${side}_buffSpeedPctDur`).value) || 0,
      meleeArmor: parseFloat(document.getElementById(`${side}_buffMeleeArmor`).value) || 0,
      rangedArmor: parseFloat(document.getElementById(`${side}_buffRangedArmor`).value) || 0,
      armorDur: parseFloat(document.getElementById(`${side}_buffArmorDur`).value) || 0
    },
    firstHitEnabled: document.getElementById(`${side}_firstHitEnabled`).checked,
    freeHits: parseInt(document.getElementById(`${side}_freeHits`).value) || 0,
    tags: collectTags(side), // NEW: Custom tags from checkboxes
    weaponType: weaponData.type || "melee",
    secondaryWeapon: weaponMode === "both" && unit.weapons.secondary ? {
      type: unit.weapons.secondary.type || "melee",
      attackSpeed: unit.weapons.secondary.attackSpeed || 1,
      stats: unit.weapons.secondary.ages[age] || {}
    } : null
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
 * 7. SIMULATION ENGINE - COMPLETELY FIXED
 * 
 * CRITICAL FIXES:
 * 1. Both teams calculate damage BEFORE any is applied (simultaneous attacks)
 * 2. Damage is applied at the same time, so identical units result in draws
 * 3. EPSILON ensures floating-point precision doesn't cause fake advantages
 */
function runBattle() {
  const unitA = getUnitData("A");
  const unitB = getUnitData("B");

  // --- TEAM INITIALIZATION ---
  
  let teamA = {
    units: unitA.count,
    totalHp: 0,
    stats: applyBuffs(unitA, 0),
    originalStats: unitA.stats,
    nextAttack: unitA.firstHitEnabled ? -unitA.freeHits * unitA.stats.attackSpeed : 0,
    tags: unitA.tags,
    unitData: unitA
  };

  let teamB = {
    units: unitB.count,
    totalHp: 0,
    stats: applyBuffs(unitB, 0),
    originalStats: unitB.stats,
    nextAttack: unitB.firstHitEnabled ? -unitB.freeHits * unitB.stats.attackSpeed : 0,
    tags: unitB.tags,
    unitData: unitB
  };

  teamA.totalHp = teamA.stats.hp * teamA.units;
  teamB.totalHp = teamB.stats.hp * teamB.units;

  const startingCostA = getTotalCost(unitA.name) * unitA.count;
  const startingCostB = getTotalCost(unitB.name) * unitB.count;

  let time = 0;
  const maxTime = 300;
  const EPSILON = 0.0001; // Treat attacks within this time as simultaneous

  // --- BATTLE LOOP ---

  while (teamA.units > 0 && teamB.units > 0 && time < maxTime) {
    // Advance to next attack
    const nextEventTime = Math.min(teamA.nextAttack, teamB.nextAttack);
    time = nextEventTime;

    // Refresh buffs
    teamA.stats = applyBuffs(unitA, time);
    teamB.stats = applyBuffs(unitB, time);

    // CRITICAL FIX: Calculate BOTH teams' damage BEFORE applying any
    let damageToB = 0;
    let damageToA = 0;

    // === TEAM A DAMAGE CALCULATION ===
    if (teamA.nextAttack <= time + EPSILON && teamA.units > 0) {
      let totalDamage = 0;
      
      // Primary weapon damage
      let damage = teamA.stats.attack;

      // Add bonus damage against enemy tags
      for (let tag of teamB.tags) {
        if (teamA.originalStats.bonus[tag]) {
          damage += teamA.originalStats.bonus[tag];
        }
      }

      // Subtract armor
      const armor = unitA.weaponType === "ranged" ? teamB.stats.rangedArmor : teamB.stats.meleeArmor;
      totalDamage += Math.max(1, damage - armor);

      // Secondary weapon (if using "both" mode)
      if (teamA.unitData.secondaryWeapon) {
        let secondaryDamage = teamA.unitData.secondaryWeapon.stats.attack || 0;

        for (let tag of teamB.tags) {
          if (teamA.unitData.secondaryWeapon.stats.bonus && 
              teamA.unitData.secondaryWeapon.stats.bonus[tag]) {
            secondaryDamage += teamA.unitData.secondaryWeapon.stats.bonus[tag];
          }
        }

        const secondaryArmor = teamA.unitData.secondaryWeapon.type === "ranged" ? 
                               teamB.stats.rangedArmor : teamB.stats.meleeArmor;
        totalDamage += Math.max(1, secondaryDamage - secondaryArmor);
      }

      damageToB = totalDamage * teamA.units;
      teamA.nextAttack = time + teamA.stats.attackSpeed;
    }

    // === TEAM B DAMAGE CALCULATION ===
    if (teamB.nextAttack <= time + EPSILON && teamB.units > 0) {
      let totalDamage = 0;
      
      // Primary weapon damage
      let damage = teamB.stats.attack;

      for (let tag of teamA.tags) {
        if (teamB.originalStats.bonus[tag]) {
          damage += teamB.originalStats.bonus[tag];
        }
      }

      const armor = unitB.weaponType === "ranged" ? teamA.stats.rangedArmor : teamA.stats.meleeArmor;
      totalDamage += Math.max(1, damage - armor);

      // Secondary weapon
      if (teamB.unitData.secondaryWeapon) {
        let secondaryDamage = teamB.unitData.secondaryWeapon.stats.attack || 0;

        for (let tag of teamA.tags) {
          if (teamB.unitData.secondaryWeapon.stats.bonus && 
              teamB.unitData.secondaryWeapon.stats.bonus[tag]) {
            secondaryDamage += teamB.unitData.secondaryWeapon.stats.bonus[tag];
          }
        }

        const secondaryArmor = teamB.unitData.secondaryWeapon.type === "ranged" ? 
                               teamA.stats.rangedArmor : teamA.stats.meleeArmor;
        totalDamage += Math.max(1, secondaryDamage - secondaryArmor);
      }

      damageToA = totalDamage * teamB.units;
      teamB.nextAttack = time + teamB.stats.attackSpeed;
    }

    // CRITICAL FIX: Apply damage SIMULTANEOUSLY
    teamB.totalHp -= damageToB;
    teamA.totalHp -= damageToA;

    // Update unit counts after both damages are applied
    if (damageToB > 0) {
      const unitsLost = Math.floor((teamB.stats.hp * teamB.units - teamB.totalHp) / teamB.stats.hp);
      teamB.units = Math.max(0, teamB.units - unitsLost);
    }

    if (damageToA > 0) {
      const unitsLost = Math.floor((teamA.stats.hp * teamA.units - teamA.totalHp) / teamA.stats.hp);
      teamA.units = Math.max(0, teamA.units - unitsLost);
    }
  }

  // --- RESULTS DISPLAY ---

  const winner = teamA.units > 0 ? "A" : teamB.units > 0 ? "B" : "Draw";
  const winningTeam = winner === "A" ? teamA : winner === "B" ? teamB : teamA;
  const winningUnit = winner === "A" ? unitA : winner === "B" ? unitB : unitA;
  const startingCost = winner === "A" ? startingCostA : winner === "B" ? startingCostB : startingCostA;

  const remainingHpPct = winningTeam.units > 0 ? 
    (winningTeam.totalHp / (winningTeam.stats.hp * winningUnit.count)) * 100 : 0;
  const resourcesLost = startingCost * (1 - remainingHpPct / 100);

  document.getElementById("results").style.display = "block";

  if (winner === "Draw") {
    document.getElementById("winnerText").textContent = "🤝 Perfect Draw!";
  } else {
    const winnerName = winner === "A" ? unitA.name : unitB.name;
    document.getElementById("winnerText").textContent = `🎉 Team ${winner} Wins! (${winnerName})`;
  }

  document.getElementById("remainingUnits").textContent = winningTeam.units;
  document.getElementById("remainingHP").textContent = remainingHpPct.toFixed(1) + "%";
  document.getElementById("resourcesLost").textContent = resourcesLost.toFixed(0);
  document.getElementById("battleDuration").textContent = time.toFixed(1) + "s";

  document.getElementById("finalCounts").textContent = 
    `Team A (${unitA.name}): ${teamA.units} units | Team B (${unitB.name}): ${teamB.units} units`;

  document.getElementById("results").scrollIntoView({ behavior: "smooth" });
}

// ========================================
// EVENT LISTENERS
// ========================================

document.getElementById("unitASelect").addEventListener("change", () => updateUnitStats("A"));
document.getElementById("unitBSelect").addEventListener("change", () => updateUnitStats("B"));
document.getElementById("unitAAge").addEventListener("change", () => updateUnitStats("A"));
document.getElementById("unitBAge").addEventListener("change", () => updateUnitStats("B"));

document.querySelectorAll('input[name="weaponModeA"]').forEach((radio) => {
  radio.addEventListener("change", () => updateUnitStats("A"));
});
document.querySelectorAll('input[name="weaponModeB"]').forEach((radio) => {
  radio.addEventListener("change", () => updateUnitStats("B"));
});

document.getElementById("battleBtn").addEventListener("click", runBattle);

document.getElementById("autoBalance").addEventListener("change", function () {
  if (this.checked) balanceCosts();
});