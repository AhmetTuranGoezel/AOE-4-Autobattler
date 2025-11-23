// ========================================
// AOE4 BATTLE SIMULATOR - COMPLETE SCRIPT
// ========================================

// Global variable to store the unit data fetched from JSON
let units = {};

/**
 * 1. DATA LOADING
 * Fetches the JSON file containing unit stats.
 * This runs as soon as the page loads.
 */
fetch('units_restructured.json')
  .then(response => response.json())
  .then(data => {
    units = data; // Store in global variable
    populateSelects(); // Fill dropdown menus
    // Initialize stats for both sides to defaults
    updateUnitStats('A');
    updateUnitStats('B');
  })
  .catch(error => console.error('Error loading units:', error));

/**
 * 2. UI POPULATION
 * Fills the Unit selection dropdowns with keys from the JSON data.
 */
function populateSelects() {
  const selectA = document.getElementById('unitASelect');
  const selectB = document.getElementById('unitBSelect');
  
  // Clear existing options (in case of reload)
  selectA.innerHTML = '';
  selectB.innerHTML = '';
  
  // Create an option for every unit found in the JSON
  Object.keys(units).forEach(name => {
    selectA.innerHTML += `<option value="${name}">${name}</option>`;
    selectB.innerHTML += `<option value="${name}">${name}</option>`;
  });
  
  // Set default starting units for immediate usability
  selectA.value = 'Horseman';
  selectB.value = 'Spearman';
}

/**
 * Helper: Returns a list of valid Ages (e.g., ["2", "3", "4"]) for a specific unit.
 * Some units don't exist in all ages, so we need to check dynamically.
 */
function getAvailableAges(unitName) {
  const unit = units[unitName];
  // Specific check to ensure data structure exists before accessing
  if (!unit || !unit.weapons || !unit.weapons.primary || !unit.weapons.primary.ages) return [];
  return Object.keys(unit.weapons.primary.ages);
}

/**
 * Fills the "Age" dropdown based on the selected Unit.
 * e.g., If Unit A only exists in Age 2 and 3, only show those options.
 */
function populateAgeDropdown(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
  const ageSelect = document.getElementById(`unit${side}Age`);
  const availableAges = getAvailableAges(unitName);
  
  ageSelect.innerHTML = '';
  availableAges.forEach(age => {
    ageSelect.innerHTML += `<option value="${age}">Age ${age}</option>`;
  });
  
  // UX Improvement: Default to Age 3 if possible, otherwise the highest available
  if (availableAges.includes('3')) {
    ageSelect.value = '3';
  } else {
    ageSelect.value = availableAges[availableAges.length - 1];
  }
}

/**
 * NEW FUNCTION: Check if a unit has a secondary weapon for the selected age
 * and enable/disable the weapon mode buttons accordingly.
 */
function updateWeaponModeButtons(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];
  const age = document.getElementById(`unit${side}Age`).value;
  
  // Check if secondary weapon exists for this age
  const hasSecondary = unit.weapons.secondary && 
                       unit.weapons.secondary.ages && 
                       unit.weapons.secondary.ages[age];
  
  // Get the radio button elements
  const secondaryRadio = document.getElementById(`secondary${side}`);
  const bothRadio = document.getElementById(`both${side}`);
  const primaryRadio = document.getElementById(`primary${side}`);
  
  // Enable/disable based on whether secondary weapon exists
  secondaryRadio.disabled = !hasSecondary;
  bothRadio.disabled = !hasSecondary;
  
  // If secondary weapon doesn't exist and user has it selected, switch to primary
  const selectedMode = document.querySelector(`input[name="weaponMode${side}"]:checked`).value;
  if (!hasSecondary && (selectedMode === 'secondary' || selectedMode === 'both')) {
    primaryRadio.checked = true;
  }
}

/**
 * 3. UI UPDATES
 * Triggered when a User selects a different Unit, Age, or Weapon Mode.
 * Refreshes all input fields (HP, Attack, Armor) with data from the JSON.
 */
function updateUnitStats(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];
  
  if (!unit) return;
  
  // Must update the age dropdown first, because stats depend on Age
  populateAgeDropdown(side);
  
  // NEW: Update weapon mode buttons
  updateWeaponModeButtons(side);
  
  const age = document.getElementById(`unit${side}Age`).value;
  
  // Get selected weapon mode
  const weaponMode = document.querySelector(`input[name="weaponMode${side}"]:checked`).value;
  
  // Determine which weapon to use based on mode
  let weaponData, stats;
  
  if (weaponMode === 'secondary' && unit.weapons.secondary) {
    // Use secondary weapon
    weaponData = unit.weapons.secondary;
    stats = weaponData.ages[age] || {};
  } else {
    // Use primary weapon (default for 'primary' and 'both' modes)
    // Note: For 'both' mode, we'll handle the secondary in the battle simulation
    weaponData = unit.weapons.primary;
    stats = weaponData.ages[age] || {};
  }
  
  // Fill in the visible inputs with base stats
  document.getElementById(`${side}_hp`).value = stats.hp || '';
  document.getElementById(`${side}_attack`).value = stats.attack || '';
  document.getElementById(`${side}_meleeArmor`).value = stats.meleeArmor || 0;
  document.getElementById(`${side}_rangedArmor`).value = stats.rangedArmor || 0;
  document.getElementById(`${side}_attackSpeed`).value = weaponData.attackSpeed || 1;
  
  // Update text displays for Tags and Bonus Damage
  document.getElementById(`${side}_tags`).textContent = (unit.tags || []).join(', ');
  const bonuses = Object.entries(stats.bonus || {}).map(([k, v]) => `${k}: +${v}`).join(', ');
  document.getElementById(`${side}_bonuses`).textContent = bonuses || 'None';
  
  // If "Auto-Balance" is checked, recalculate unit counts immediately
  if (document.getElementById('autoBalance').checked) {
    balanceCosts();
  }
}

/**
 * Helper: Sums up Food + Wood + Gold to get total unit cost.
 */
function getTotalCost(unitName) {
  const unit = units[unitName];
  if (!unit || !unit.costs) return 0;
  return Object.values(unit.costs).reduce((sum, val) => sum + val, 0);
}

/**
 * 4. COST BALANCING
 * Calculates how many units of A and B are needed to have equal Total Resource Cost.
 * Uses GCD to find the simplest integer ratio (e.g., 2 Knights vs 5 Spearmen).
 */
function balanceCosts() {
  const unitAName = document.getElementById('unitASelect').value;
  const unitBName = document.getElementById('unitBSelect').value;
  
  const costA = getTotalCost(unitAName);
  const costB = getTotalCost(unitBName);
  
  if (costA === 0 || costB === 0) return;
  
  // Recursive Greatest Common Divisor function
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(costA, costB);
  
  // Set the input values
  document.getElementById('countA').value = costB / divisor;
  document.getElementById('countB').value = costA / divisor;
}

/**
 * 5. DATA COLLECTION
 * Scrapes the DOM inputs to build a clean object for the simulation.
 * This handles manual overrides the user might have typed into the input boxes.
 */
function getUnitData(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];
  const age = document.getElementById(`unit${side}Age`).value;
  const weaponMode = document.querySelector(`input[name="weaponMode${side}"]:checked`).value;
  
  // Determine which weapon to use
  let weaponData, ageStats;
  
  if (weaponMode === 'secondary' && unit.weapons.secondary) {
    weaponData = unit.weapons.secondary;
    ageStats = weaponData.ages[age] || {};
  } else {
    weaponData = unit.weapons.primary;
    ageStats = weaponData.ages[age] || {};
  }
  
  return {
    name: unitName,
    count: parseInt(document.getElementById(`count${side}`).value) || 1,
    weaponMode: weaponMode, // NEW: Store weapon mode
    stats: {
      // Use parseFloat to handle decimals if user enters them
      hp: parseFloat(document.getElementById(`${side}_hp`).value) || 0,
      attack: parseFloat(document.getElementById(`${side}_attack`).value) || 0,
      meleeArmor: parseFloat(document.getElementById(`${side}_meleeArmor`).value) || 0,
      rangedArmor: parseFloat(document.getElementById(`${side}_rangedArmor`).value) || 0,
      attackSpeed: parseFloat(document.getElementById(`${side}_attackSpeed`).value) || 1,
      bonus: ageStats.bonus || {} // Keep bonus mapping from JSON
    },
    buffs: {
      // UPDATED: Separate durations for flat and percentage buffs
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
    // First hit settings
    firstHitEnabled: document.getElementById(`${side}_firstHitEnabled`).checked,
    freeHits: parseInt(document.getElementById(`${side}_freeHits`).value) || 0,
    tags: unit.tags || [],
    weaponType: weaponData.type || 'melee',
    // NEW: Store secondary weapon data if using 'both' mode
    secondaryWeapon: weaponMode === 'both' && unit.weapons.secondary ? {
      type: unit.weapons.secondary.type || 'melee',
      attackSpeed: unit.weapons.secondary.attackSpeed || 1,
      stats: unit.weapons.secondary.ages[age] || {}
    } : null
  };
}

/**
 * 6. BUFF LOGIC
 * Modifies a unit's stats based on the current simulation time.
 * Checks if a buff duration has expired before applying it.
 * UPDATED: Now handles separate durations for flat and percentage buffs.
 */
function applyBuffs(unitData, time) {
  let hp = unitData.stats.hp;
  let attack = unitData.stats.attack;
  let attackSpeed = unitData.stats.attackSpeed;
  let meleeArmor = unitData.stats.meleeArmor;
  let rangedArmor = unitData.stats.rangedArmor;
  
  // Apply flat HP buff (if duration is 0 = permanent, or time hasn't expired)
  if (unitData.buffs.hpAbsDur === 0 || time < unitData.buffs.hpAbsDur) {
    hp += unitData.buffs.hpAbs;
  }
  
  // Apply percentage HP buff (separate duration)
  if (unitData.buffs.hpPctDur === 0 || time < unitData.buffs.hpPctDur) {
    hp *= (1 + unitData.buffs.hpPct / 100);
  }
  
  // Apply flat attack buff
  if (unitData.buffs.attackAbsDur === 0 || time < unitData.buffs.attackAbsDur) {
    attack += unitData.buffs.attackAbs;
  }
  
  // Apply percentage attack buff (separate duration)
  if (unitData.buffs.attackPctDur === 0 || time < unitData.buffs.attackPctDur) {
    attack *= (1 + unitData.buffs.attackPct / 100);
  }
  
  // Apply attack speed buff (Higher speed % = Lower attack interval)
  if (unitData.buffs.speedPctDur === 0 || time < unitData.buffs.speedPctDur) {
    attackSpeed /= (1 + unitData.buffs.speedPct / 100);
  }
  
  // Apply armor buffs (both melee and ranged share the same duration)
  if (unitData.buffs.armorDur === 0 || time < unitData.buffs.armorDur) {
    meleeArmor += unitData.buffs.meleeArmor;
    rangedArmor += unitData.buffs.rangedArmor;
  }
  
  return { hp, attack, attackSpeed, meleeArmor, rangedArmor };
}

/**
 * 7. SIMULATION ENGINE
 * The core loop that fights the two units against each other.
 * 
 * WHY SAME UNITS DON'T DRAW:
 * The issue happens because of floating-point precision with attack timing.
 * When both teams have identical stats, there can be tiny rounding differences
 * in when attacks happen due to how JavaScript handles decimal numbers.
 * 
 * FIX: We now use a small epsilon (0.0001) to treat simultaneous attacks as truly simultaneous.
 */
function runBattle() {
  const unitA = getUnitData('A');
  const unitB = getUnitData('B');
  
  // --- SIMULATION SETUP ---
  
  // Team A Init
  let teamA = {
    units: unitA.count,
    totalHp: 0, // Will be calculated shortly
    stats: applyBuffs(unitA, 0), // Get initial stats with buffs applied
    originalStats: unitA.stats, // Keep original for bonus damage reference
    // If free hits enabled, set nextAttack to negative time so they attack immediately
    nextAttack: unitA.firstHitEnabled ? -unitA.freeHits * unitA.stats.attackSpeed : 0,
    tags: unitA.tags,
    unitData: unitA // Store full unit data for secondary weapon access
  };
  
  // Team B Init
  let teamB = {
    units: unitB.count,
    totalHp: 0,
    stats: applyBuffs(unitB, 0),
    originalStats: unitB.stats,
    nextAttack: unitB.firstHitEnabled ? -unitB.freeHits * unitB.stats.attackSpeed : 0,
    tags: unitB.tags,
    unitData: unitB
  };
  
  // Calculate "HP Pool" (Total HP of the army)
  teamA.totalHp = teamA.stats.hp * teamA.units;
  teamB.totalHp = teamB.stats.hp * teamB.units;
  
  const startingCostA = getTotalCost(unitA.name) * unitA.count;
  const startingCostB = getTotalCost(unitB.name) * unitB.count;
  
  let time = 0;
  const maxTime = 300; // Timeout at 5 minutes to prevent infinite loops
  const EPSILON = 0.0001; // Small value to treat near-simultaneous events as simultaneous
  
  // --- BATTLE LOOP ---
  
  while (teamA.units > 0 && teamB.units > 0 && time < maxTime) {
    // Advance time to the next soonest attack
    const nextEventTime = Math.min(teamA.nextAttack, teamB.nextAttack);
    time = nextEventTime;
    
    // Refresh stats (in case temporary buffs expired)
    teamA.stats = applyBuffs(unitA, time);
    teamB.stats = applyBuffs(unitB, time);
    
    // Check if both teams attack at the same time (within epsilon for floating point precision)
    const bothAttack = Math.abs(teamA.nextAttack - teamB.nextAttack) < EPSILON;
    
    // TEAM A ATTACKS TEAM B
    if (teamA.nextAttack <= time + EPSILON && teamA.units > 0) {
      let totalDamage = 0;
      
      // 1. Calculate primary weapon damage
      let damage = teamA.stats.attack;
      
      // Add Bonus Damage (e.g., Spearman vs Cavalry)
      for (let tag of teamB.tags) {
        if (teamA.originalStats.bonus[tag]) {
          damage += teamA.originalStats.bonus[tag];
        }
      }
      
      // Subtract Armor (Ranged or Melee based on weapon type)
      const armor = unitA.weaponType === 'ranged' ? teamB.stats.rangedArmor : teamB.stats.meleeArmor;
      totalDamage += Math.max(1, damage - armor); // Minimum 1 damage rule
      
      // 2. NEW: If using 'both' weapons, add secondary weapon damage
      if (teamA.unitData.secondaryWeapon) {
        let secondaryDamage = teamA.unitData.secondaryWeapon.stats.attack || 0;
        
        // Apply bonus damage from secondary weapon
        for (let tag of teamB.tags) {
          if (teamA.unitData.secondaryWeapon.stats.bonus && 
              teamA.unitData.secondaryWeapon.stats.bonus[tag]) {
            secondaryDamage += teamA.unitData.secondaryWeapon.stats.bonus[tag];
          }
        }
        
        // Apply armor for secondary weapon
        const secondaryArmor = teamA.unitData.secondaryWeapon.type === 'ranged' ? 
                               teamB.stats.rangedArmor : teamB.stats.meleeArmor;
        totalDamage += Math.max(1, secondaryDamage - secondaryArmor);
      }
      
      // 3. Apply Total Damage to HP Pool
      teamB.totalHp -= totalDamage * teamA.units; // All living units attack
      
      // 4. Recalculate Living Units (HP Pool logic)
      // Formula: (TotalHP / SingleUnitHP) = Count
      const unitsLost = Math.floor((teamB.stats.hp * teamB.units - teamB.totalHp) / teamB.stats.hp);
      teamB.units = Math.max(0, teamB.units - unitsLost);
      
      // 5. Schedule Next Attack
      teamA.nextAttack = time + teamA.stats.attackSpeed;
    }
    
    // TEAM B ATTACKS TEAM A (Symmetric Logic)
    if (teamB.nextAttack <= time + EPSILON && teamB.units > 0) {
      let totalDamage = 0;
      
      // Primary weapon damage
      let damage = teamB.stats.attack;
      
      for (let tag of teamA.tags) {
        if (teamB.originalStats.bonus[tag]) {
          damage += teamB.originalStats.bonus[tag];
        }
      }
      
      const armor = unitB.weaponType === 'ranged' ? teamA.stats.rangedArmor : teamA.stats.meleeArmor;
      totalDamage += Math.max(1, damage - armor);
      
      // NEW: Secondary weapon for Team B
      if (teamB.unitData.secondaryWeapon) {
        let secondaryDamage = teamB.unitData.secondaryWeapon.stats.attack || 0;
        
        for (let tag of teamA.tags) {
          if (teamB.unitData.secondaryWeapon.stats.bonus && 
              teamB.unitData.secondaryWeapon.stats.bonus[tag]) {
            secondaryDamage += teamB.unitData.secondaryWeapon.stats.bonus[tag];
          }
        }
        
        const secondaryArmor = teamB.unitData.secondaryWeapon.type === 'ranged' ? 
                               teamA.stats.rangedArmor : teamA.stats.meleeArmor;
        totalDamage += Math.max(1, secondaryDamage - secondaryArmor);
      }
      
      teamA.totalHp -= totalDamage * teamB.units;
      
      const unitsLost = Math.floor((teamA.stats.hp * teamA.units - teamA.totalHp) / teamA.stats.hp);
      teamA.units = Math.max(0, teamA.units - unitsLost);
      
      teamB.nextAttack = time + teamB.stats.attackSpeed;
    }
  }
  
  // --- RESULTS PROCESSING ---
  
  const winner = teamA.units > 0 ? 'A' : teamB.units > 0 ? 'B' : 'Draw';
  const winningTeam = winner === 'A' ? teamA : teamB;
  const winningUnit = winner === 'A' ? unitA : unitB;
  const startingCost = winner === 'A' ? startingCostA : startingCostB;
  
  // Calculate Resource Efficiency
  const remainingHpPct = winningTeam.units > 0 ? 
    (winningTeam.totalHp / (winningTeam.stats.hp * winningUnit.count)) * 100 : 0;
  const resourcesLost = startingCost * (1 - remainingHpPct / 100);
  
  // Display to DOM with UPDATED winner text showing unit names
  document.getElementById('results').style.display = 'block';
  
  // NEW: Show unit names in the winner announcement
  if (winner === 'Draw') {
    document.getElementById('winnerText').textContent = '🤝 Draw!';
  } else {
    const winnerName = winner === 'A' ? unitA.name : unitB.name;
    document.getElementById('winnerText').textContent = `🎉 Team ${winner} Wins! (${winnerName})`;
  }
  
  document.getElementById('remainingUnits').textContent = winningTeam.units;
  document.getElementById('remainingHP').textContent = remainingHpPct.toFixed(1) + '%';
  document.getElementById('resourcesLost').textContent = resourcesLost.toFixed(0);
  document.getElementById('battleDuration').textContent = time.toFixed(1) + 's';
  
  // NEW: Show unit names alongside final counts
  document.getElementById('finalCounts').textContent = 
    `Team A (${unitA.name}): ${teamA.units} units | Team B (${unitB.name}): ${teamB.units} units`;
  
  // Scroll to results smoothly
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

// ========================================
// EVENT LISTENERS SETUP
// ========================================

// Listen for unit changes
document.getElementById('unitASelect').addEventListener('change', () => updateUnitStats('A'));
document.getElementById('unitBSelect').addEventListener('change', () => updateUnitStats('B'));

// Listen for age changes
document.getElementById('unitAAge').addEventListener('change', () => updateUnitStats('A'));
document.getElementById('unitBAge').addEventListener('change', () => updateUnitStats('B'));

// NEW: Listen for weapon mode changes
document.querySelectorAll('input[name="weaponModeA"]').forEach(radio => {
  radio.addEventListener('change', () => updateUnitStats('A'));
});
document.querySelectorAll('input[name="weaponModeB"]').forEach(radio => {
  radio.addEventListener('change', () => updateUnitStats('B'));
});

// Battle button
document.getElementById('battleBtn').addEventListener('click', runBattle);

// Auto-balance toggle
document.getElementById('autoBalance').addEventListener('change', function() {
  if (this.checked) balanceCosts();
});