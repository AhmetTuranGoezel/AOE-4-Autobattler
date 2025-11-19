// script.js

/* -------------------------
   Utility: parse German-style numbers (commas as decimal sep)
   ------------------------- */
function parseGermanNumber(s) {
  if (s === null || s === undefined) return NaN;
  // if already a number, return
  if (typeof s === "number") return s;
  // remove non-numeric except , and - and digits
  const cleaned = String(s).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/* -------------------------
   Globals & DOM refs
   ------------------------- */
let unitsData = {};           // will hold parsed JSON units
let manualCountOverride = { A: false, B: false }; // if user manually changes counts

const refs = {
  selectA: document.getElementById("unitASelect"),
  selectB: document.getElementById("unitBSelect"),
  statsA: document.getElementById("unitAStats"),
  statsB: document.getElementById("unitBStats"),
  countA: document.getElementById("countA"),
  countB: document.getElementById("countB"),
  battleBtn: document.getElementById("battleBtn"),
  results: document.getElementById("results")
};

/* -------------------------
   Load local units.json
   - parses numeric fields into JS numbers
   - keeps boolean/category fields parsed to 0/1 -> boolean
   ------------------------- */
async function loadUnitsJson(path = "units.json") {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error("Could not load units.json");
    const raw = await res.json();

    // parse each unit's fields into usable JS types
    for (const [name, obj] of Object.entries(raw)) {
      const parsed = {};
      for (const [k, v] of Object.entries(obj)) {
        // keep empty/null as null
        if (v === null) {
          parsed[k] = null;
          continue;
        }

        // fields that are known booleans in your JSON: "Cav","Inf","Ranged","Heavy","Light Inf","Elephant","melee attack","ranged attack"
        const booleanKeys = new Set([
          "melee attack", "ranged attack", "Ranged", "Heavy",
          "Cav", "Inf", "Light Inf", "Elephant"
        ]);
        if (booleanKeys.has(k)) {
          // values are "1" or "0" strings in your file — convert to boolean
          parsed[k] = String(v).trim() === "1" ? true : false;
          continue;
        }

        // numeric looking fields: try to parse a number using German decimal rules
        const num = parseGermanNumber(v);
        if (!Number.isNaN(num)) parsed[k] = num;
        else parsed[k] = v; // fallback to raw string (e.g. names)
      }

      // store under same display name (e.g. "Horseman")
      unitsData[name] = parsed;
    }

    populateSelects();
  } catch (err) {
    console.error("Error loading units.json:", err);
    refs.results.innerText = "Error loading units.json (open console).";
  }
}

/* -------------------------
   Populate the two selects with unit names
   ------------------------- */
function populateSelects() {
  // clear any existing options
  refs.selectA.innerHTML = "";
  refs.selectB.innerHTML = "";

  const names = Object.keys(unitsData);
  for (const name of names) {
    const optA = new Option(name, name);
    const optB = new Option(name, name);
    refs.selectA.add(optA);
    refs.selectB.add(optB);
  }

  // sensible defaults: first two different units if available
  refs.selectA.value = names[0] ?? "";
  refs.selectB.value = names.length > 1 ? names[1] : names[0];

  // initial render
  updateUnitDisplay("A");
  updateUnitDisplay("B");

  // auto-equalize counts on initial load
  autoEqualizeCounts();
}

/* -------------------------
   Render unit stats for side ("A" or "B")
   Excludes "Total vs ..." fields per your request.
   ------------------------- */
function updateUnitDisplay(side) {
  const sel = side === "A" ? refs.selectA : refs.selectB;
  const statsEl = side === "A" ? refs.statsA : refs.statsB;
  const unit = unitsData[sel.value];
  if (!unit) {
    statsEl.innerHTML = "<em>No unit selected</em>";
    return;
  }

  // fields we want to show (if present)
  const showKeys = [
    "Food", "Wood", "Gold", "Training time",
    "Hit points (Regular)", "Hit points (Veteran)", "Hit points (Elite)",
    "Attack speed in s", "attack (Regular)", "attack (Veteran)", "attack (Elite)",
    "Armor 2", "Armor 3", "Armor 4",
    "Ranged Armor 2", "Ranged Armor 3", "Ranged Armor 4",
    "Range", "Speed", "Pop",
    "melee attack", "ranged attack", "Ranged", "Heavy", "Cav", "Inf", "Light Inf", "Elephant"
  ];

  // build HTML list
  let html = "<ul class='list-unstyled mb-0'>";
  for (const key of showKeys) {
    if (unit[key] !== undefined && unit[key] !== null) {
      let displayVal = unit[key];
      // convert booleans to readable text
      if (typeof displayVal === "boolean") displayVal = displayVal ? "yes" : "no";
      // format numbers: convert dot decimals back to comma for display
      if (typeof displayVal === "number") displayVal = displayVal.toString().replace(".", ",");
      html += `<li><strong>${key}:</strong> ${displayVal}</li>`;
    }
  }
  html += "</ul>";

  // store unit cost (Food+Wood+Gold) as data attribute on the stats element for quick access
  const food = parseGermanNumber(unit["Food"]) || 0;
  const wood = parseGermanNumber(unit["Wood"]) || 0;
  const gold = parseGermanNumber(unit["Gold"]) || 0;
  const totalCost = food + wood + gold;
  statsEl.dataset.unitCost = totalCost; // numeric
  statsEl.dataset.hpPerUnit = parseGermanNumber(unit["Hit points 2"]) || 0;

  // show cost as well
  html += `<div class="mt-2"><small>Total cost (F+W+G): <strong>${(totalCost).toString().replace(".", ",")}</strong></small></div>`;

  statsEl.innerHTML = html;
}

/* -------------------------
   Auto-equalize unit counts
   - Finds small integer pair (a,b) that minimizes |a*costA - b*costB|
   - Scans counts from 1..maxUnits (keeps numbers reasonable)
   - Only runs when user has NOT manually overridden counts (manualCountOverride)
   ------------------------- */
function autoEqualizeCounts() {
  if (manualCountOverride.A || manualCountOverride.B) return; // don't override manual edits

  const costA = parseFloat(refs.statsA.dataset.unitCost) || 0;
  const costB = parseFloat(refs.statsB.dataset.unitCost) || 0;
  if (costA <= 0 || costB <= 0) {
    // fallback to 1 each
    refs.countA.value = 1;
    refs.countB.value = 1;
    return;
  }

  const maxUnits = 50; // search ceiling
  let best = { a: 1, b: 1, diff: Math.abs(costA - costB) };

  for (let a = 1; a <= maxUnits; a++) {
    for (let b = 1; b <= maxUnits; b++) {
      const diff = Math.abs(a * costA - b * costB);
      // prefer smaller diff; tie-breaker: smaller total units
      if (
        diff < best.diff ||
        (diff === best.diff && a + b < best.a + best.b)
      ) {
        best = { a, b, diff };
      }
      // perfect match early exit
      if (diff === 0) break;
    }
    if (best.diff === 0) break;
  }

  refs.countA.value = best.a;
  refs.countB.value = best.b;
}

/* -------------------------
   Event wiring
   ------------------------- */
window.addEventListener("DOMContentLoaded", () => {
  // load units file
  loadUnitsJson();

  // when selection changes, update stats and auto-equalize
  refs.selectA.addEventListener("change", () => {
    updateUnitDisplay("A");
    // reset manual override so auto-equalize runs after a selection change
    manualCountOverride.A = false;
    manualCountOverride.B = false;
    autoEqualizeCounts();
  });

  refs.selectB.addEventListener("change", () => {
    updateUnitDisplay("B");
    manualCountOverride.A = false;
    manualCountOverride.B = false;
    autoEqualizeCounts();
  });

  // if user manually edits counts, we remember and stop auto-equalizing
  refs.countA.addEventListener("input", () => {
    manualCountOverride.A = true;
  });
  refs.countB.addEventListener("input", () => {
    manualCountOverride.B = true;
  });

  // battle button placeholder (we'll fill logic later)
  refs.battleBtn.addEventListener("click", () => {
    refs.results.innerHTML = "<em>Battle simulation not implemented yet — JS parsed UI and unit stats are ready.</em>";
  });
});
