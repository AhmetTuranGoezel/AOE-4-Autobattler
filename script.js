// script.js - Main file for AOE4 Battle Simulator

let units = {}; // Global object to hold all unit data from JSON

// Wait for HTML to fully load before running any code
document.addEventListener('DOMContentLoaded', () => {
  loadUnits(); // Step 2: Load JSON here

  // Add listeners for Unit A changes
  document.getElementById('unitASelect').addEventListener('change', updateUnitAStats);
  document.getElementById('unitAAge').addEventListener('change', updateUnitAStats);
  // Listen for weapon toggle changes (primary/secondary/both)
  document.querySelectorAll('input[name="attackSelectA"]').forEach(radio => {
    radio.addEventListener('change', updateUnitAStats);
  });

  // Same for Unit B
  document.getElementById('unitBSelect').addEventListener('change', updateUnitBStats);
  document.getElementById('unitBAge').addEventListener('change', updateUnitBStats);
  document.querySelectorAll('input[name="attackSelectB"]').forEach(radio => {
    radio.addEventListener('change', updateUnitBStats);
  });

  // Battle button click
  document.getElementById('battleBtn').addEventListener('click', runBattle);
});

// Placeholder functions – we'll fill these in next steps
function loadUnits() {
  fetch('units_restructured.json')
    .then(response => response.json())
    .then(data => {
      units = data;
      populateSelects(); // New function we'll add in Step 3
    })
    .catch(error => console.error('Error loading units JSON:', error));
}
function populateSelects() {
  const selectA = document.getElementById('unitASelect');
  const selectB = document.getElementById('unitBSelect');

  selectA.innerHTML = '';
  selectB.innerHTML = '';

  for (const name of Object.keys(units)) {
    const optionHTML = `<option value="${name}">${name}</option>`;
    selectA.innerHTML += optionHTML;
    selectB.innerHTML += optionHTML;
  }

  if (Object.keys(units).length > 0) {
    selectA.value = Object.keys(units)[0];
    selectB.value = Object.keys(units)[0];
    updateUnitAStats();
    updateUnitBStats();
  }
}

function updateUnitAStats() {
  const unitName = document.getElementById('unitASelect').value;
  const age = document.getElementById('unitAAge').value;
  const unit = units[unitName] || {};
  const stats = unit.weapons?.primary?.ages?.[age] || {};

  document.getElementById('A_hp').value = stats.hp || '';
  document.getElementById('A_meleeArmor').value = stats.meleeArmor || '';
  document.getElementById('A_rangedArmor').value = stats.rangedArmor || '';
  document.getElementById('A_attack').value = stats.attack || '';
  document.getElementById('A_attackSpeed').value = unit.weapons?.primary?.attackSpeed || '';
  document.getElementById('A_bonus').value = JSON.stringify(stats.bonus || {});
}

function updateUnitBStats() {
  const unitName = document.getElementById('unitBSelect').value;
  const age = document.getElementById('unitBAge').value;
  const unit = units[unitName] || {};
  const stats = unit.weapons?.primary?.ages?.[age] || {};

  document.getElementById('B_hp').value = stats.hp || '';
  document.getElementById('B_meleeArmor').value = stats.meleeArmor || '';
  document.getElementById('B_rangedArmor').value = stats.rangedArmor || '';
  document.getElementById('B_attack').value = stats.attack || '';
  document.getElementById('B_attackSpeed').value = unit.weapons?.primary?.attackSpeed || '';
  document.getElementById('B_bonus').value = JSON.stringify(stats.bonus || {});
}
function runBattle() {}