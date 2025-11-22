// Global variable to store the unit data fetched from JSON
let units = {};

/**
 * 1. DATA LOADING
 * Fetches the JSON file containing unit stats.
 */
fetch('units_restructured.json')
  .then(response => response.json())
  .then(data => {
    units = data;
    populateSelects();
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
  
  // Clear existing options
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
 */
function getAvailableAges(unitName) {
  const unit = units[unitName];
  // specific check to ensure data structure exists before accessing
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
 * 3. UI UPDATES
 * Triggered when a User selects a different Unit or Age.
 * Refreshes all input fields (HP, Attack, Armor) with data from the JSON.
 */
function updateUnitStats(side) {
  const unitName = document.getElementById(`unit${side}Select`).value;
  const unit = units[unitName];
  
  if (!unit) return;
  
  // Must update the age dropdown first, because stats depend on Age
  populateAgeDropdown(side);
  
  const age = document.getElementById(`unit${side}Age`).value;
  const weaponData = unit.weapons.primary;
  const stats = weaponData.ages[age] || {};
  
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
  const weaponData = unit.weapons.primary;
  const ageStats = weaponData.ages[age] || {};
  
  return {
    name: unitName,
    count: parseInt(document.getElementById(`count${side}`).value) || 1,
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
      // Buff data collection
      attackAbs: parseFloat(document.getElementById(`${side}_buffAttackAbs`).value) || 0,
      attackPct: parseFloat(document.getElementById(`${side}_buffAttackPct`).value) || 0,
      attackDur: parseFloat(document.getElementById(`${side}_buffAttackDur`).value) || 0,
      hpAbs: parseFloat(document.getElementById(`${side}_buffHPabs`).value) || 0,
      hpPct: parseFloat(document.getElementById(`${side}_buffHPpct`).value) || 0,
      hpDur: parseFloat(document.getElementById(`${side}_buffHPDur`).value) || 0,
      speedPct: parseFloat(document.getElementById(`${side}_buffSpeedPct`).value) || 0,
      speedDur: parseFloat(document.getElementById(`${side}_buffSpeedDur`).value) || 0
    },
    // First hit settings
    firstHitEnabled: document.getElementById(`${side}_firstHitEnabled`).checked,
    freeHits: parseInt(document.getElementById(`${side}_freeHits`).value) || 0,
    tags: unit.tags || [],
    weaponType: weaponData.type || 'melee'
  };
}

/**
 * 6. BUFF LOGIC
 * Modifies a unit's stats based on the current simulation time.
 * Checks if a buff duration has expired before applying it.
 */
function applyBuffs(unitData, time) {
  let hp = unitData.stats.hp;
  let attack = unitData.stats.attack;
  let attackSpeed = unitData.stats.attackSpeed;
  let meleeArmor = unitData.stats.meleeArmor;
  let rangedArmor = unitData.stats.rangedArmor;
  
  // Apply HP Buffs (Note: usually HP buffs are permanent in AoE4, but this allows temporary)
  if (unitData.buffs.hpDur === 0 || time < unitData.buffs.hpDur) {
    hp += unitData.buffs.hpAbs;
    hp *= (1 + unitData.buffs.hpPct / 100);
  }
  // Apply Attack Buffs
  if (unitData.buffs.attackDur === 0 || time < unitData.buffs.attackDur) {
    attack += unitData.buffs.attackAbs;
    attack *= (1 + unitData.buffs.attackPct / 100);
  }
  // Apply Speed Buffs (Higher speed % = Lower attack interval)
  if (unitData.buffs.speedDur === 0 || time < unitData.buffs.speedDur) {
    attackSpeed /= (1 + unitData.buffs.speedPct / 100);
  }
  
  return { hp, attack, attackSpeed, meleeArmor, rangedArmor };
}

/**
 * 7. SIMULATION ENGINE
 * The core loop that fights the two units against each other.
 */
function runBattle() {
  const unitA = getUnitData('A');
  const unitB = getUnitData('B');
  
  // --- SIMULATION SETUP ---
  
  // Team A Init
  let teamA = {
    units: unitA.count,
    totalHp: 0, // Will be calculated shortly
    stats: applyBuffs(unitA, 0), // Get initial stats
    originalStats: unitA.stats, // Keep for bonus damage reference
    // If free hits enabled, set nextAttack to negative time so they attack immediately
    nextAttack: unitA.firstHitEnabled ? -unitA.freeHits * unitA.stats.attackSpeed : 0,
    tags: unitA.tags,
    unitData: unitA
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
  
  // --- BATTLE LOOP ---
  
  while (teamA.units > 0 && teamB.units > 0 && time < maxTime) {
    // Advance time to the next soonest attack
    const nextEventTime = Math.min(teamA.nextAttack, teamB.nextAttack);
    time = nextEventTime;
    
    // Refresh stats (in case temporary buffs expired)
    teamA.stats = applyBuffs(unitA, time);
    teamB.stats = applyBuffs(unitB, time);
    
    // TEAM A ATTACKS TEAM B
    if (teamA.nextAttack <= time && teamA.units > 0) {
      let damage = teamA.stats.attack;
      
      // 1. Add Bonus Damage (e.g., Spearman vs Cavalry)
      for (let tag of teamB.tags) {
        if (teamA.originalStats.bonus[tag]) {
          damage += teamA.originalStats.bonus[tag];
        }
      }
      
      // 2. Subtract Armor (Ranged or Melee)
      const armor = unitA.weaponType === 'ranged' ? teamB.stats.rangedArmor : teamB.stats.meleeArmor;
      damage = Math.max(1, damage - armor); // Minimum 1 damage rule
      
      // 3. Apply Damage to HP Pool
      teamB.totalHp -= damage * teamA.units; // All living units attack
      
      // 4. Recalculate Living Units
      // Uses HP Pool logic: (TotalHP / SingleUnitHP) = Count
      const unitsLost = Math.floor((teamB.stats.hp * teamB.units - teamB.totalHp) / teamB.stats.hp);
      teamB.units = Math.max(0, teamB.units - unitsLost);
      
      // 5. Schedule Next Attack
      teamA.nextAttack = time + teamA.stats.attackSpeed;
    }
    
    // TEAM B ATTACKS TEAM A (Symmetric Logic)
    if (teamB.nextAttack <= time && teamB.units > 0) {
      let damage = teamB.stats.attack;
      
      for (let tag of teamA.tags) {
        if (teamB.originalStats.bonus[tag]) {
          damage += teamB.originalStats.bonus[tag];
        }
      }
      
      const armor = unitB.weaponType === 'ranged' ? teamA.stats.rangedArmor : teamA.stats.meleeArmor;
      damage = Math.max(1, damage - armor);
      
      teamA.totalHp -= damage * teamB.units;
      
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
  const remainingHpPct = winningTeam.units > 0 ? (winningTeam.totalHp / (winningTeam.stats.hp * winningUnit.count)) * 100 : 0;
  const resourcesLost = startingCost * (1 - remainingHpPct / 100);
  
  // Display to DOM
  document.getElementById('results').style.display = 'block';
  document.getElementById('winnerText').textContent = winner === 'Draw' ? '🤝 Draw!' : `🎉 Team ${winner} Wins!`;
  document.getElementById('remainingUnits').textContent = winningTeam.units;
  document.getElementById('remainingHP').textContent = remainingHpPct.toFixed(1) + '%';
  document.getElementById('resourcesLost').textContent = resourcesLost.toFixed(0);
  document.getElementById('battleDuration').textContent = time.toFixed(1) + 's';
  document.getElementById('finalCounts').textContent = `Team A: ${teamA.units} units | Team B: ${teamB.units} units`;
  
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

// Event Listeners Setup
document.getElementById('unitASelect').addEventListener('change', () => updateUnitStats('A'));
document.getElementById('unitBSelect').addEventListener('change', () => updateUnitStats('B'));
document.getElementById('unitAAge').addEventListener('change', () => updateUnitStats('A'));
document.getElementById('unitBAge').addEventListener('change', () => updateUnitStats('B'));
document.getElementById('battleBtn').addEventListener('click', runBattle);
document.getElementById('autoBalance').addEventListener('change', function() {
  if (this.checked) balanceCosts();
});