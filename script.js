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


function updateUnitAStats() {}
function updateUnitBStats() {}
function runBattle() {}