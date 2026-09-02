#!/usr/bin/env node
"use strict";

// Coverage matrix and gate for every rule-defined effect.
//
// The plan for this branch asks for one list of everything the printed
// components can do, and a gate that fails the moment an entry loses its
// behavioural proof. "Proof" here is deliberately concrete: the entry has to be
// named inside the rule harness (test.html), which is the file that actually
// drives the engine. A name that appears only in rules-data.js is transcription,
// not evidence that the effect runs.
//
// Entries the engine deliberately does NOT resolve live in KNOWN_GAPS with a
// reason. That list is checked in both directions: an unlisted gap fails the
// gate, and so does a listed gap that has since been implemented, so the file
// cannot quietly go stale.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appDir = path.resolve(__dirname, "..");

function loadRules() {
  const context = vm.createContext({ console });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(appDir, "rules-data.js"), "utf8"),
    context, { filename: "rules-data.js" });
  return context.CivRulesData;
}

const RULES = loadRules();
const harness = fs.readFileSync(path.join(appDir, "test.html"), "utf8");

// Effects the engine does not resolve on its own, each with the reason it is
// still open. Anything here is reported as a gap rather than a failure.
const KNOWN_GAPS = {
  "Oxford University":
    "Needs the focus row rebuilt as card instances: the row is one tier per " +
    "TYPE, so it cannot express holding two culture cards and no military one.",
  "America":
    "Needs natural-wonder tokens to live on a focus card (spendable as trade " +
    "or as a resource), which is a new per-player state shape plus migration."
};

function mentioned(name) {
  if (!name) return false;
  return harness.indexOf(name) >= 0;
}

const groups = [];

// 24 standard focus cards -------------------------------------------------
{
  const rows = [];
  Object.entries(RULES.CARD_DEFS || {}).forEach(([type, tiers]) => {
    Object.entries(tiers).forEach(([tier, def]) => {
      rows.push({ id: def.name, label: `${def.name} (${type} ${tier})`, tested: mentioned(def.name) });
    });
  });
  groups.push({ name: "Standard focus cards", expect: 24, rows });
}

// 18 unique focus cards + 18 civilization abilities ------------------------
{
  const uniques = [];
  const abilities = [];
  (RULES.LEADERS || []).forEach((leader) => {
    const u = leader.unique || {};
    uniques.push({ id: u.name, label: `${u.name} (${leader.civ})`, tested: mentioned(u.name) });
    abilities.push({
      id: leader.civ,
      label: `${leader.civ} ability`,
      // A leader ability counts as engine-resolved unless its own data says the
      // table has to do it. The id is what game.js keys off.
      manual: !!(leader.ability && leader.ability.manual),
      tested: mentioned(`"${leader.id}"`) || mentioned(leader.civ)
    });
  });
  groups.push({ name: "Unique focus cards", expect: 18, rows: uniques });
  groups.push({ name: "Civilization abilities", expect: 18, rows: abilities });
}

// 34 world wonders ---------------------------------------------------------
{
  const rows = [];
  Object.values(RULES.WONDER_DECKS || {}).forEach((deck) => deck.forEach((w) => {
    rows.push({ id: w.name, label: w.name, manual: !w.auto, tested: mentioned(w.name) });
  }));
  groups.push({ name: "World wonders", expect: 34, rows });
}

// 5 player diplomacy cards -------------------------------------------------
{
  const rows = Object.entries(RULES.DIPLOMACY_CARDS || {}).map(([id, card]) => ({
    id, label: card.name || id,
    tested: mentioned(`"${id}"`) || mentioned(card.name)
  }));
  groups.push({ name: "Player diplomacy cards", expect: 5, rows });
}

// 12 city-state abilities --------------------------------------------------
{
  const rows = Object.entries(RULES.CITY_STATES || {}).map(([name, cs]) => ({
    id: name, label: `${name} (${cs.type})`,
    tested: mentioned(name) || (cs.effectId && mentioned(cs.effectId))
  }));
  groups.push({ name: "City-state abilities", expect: 12, rows });
}

// 6 governments ------------------------------------------------------------
{
  const rows = Object.entries(RULES.GOVERNMENTS || {}).map(([id, gov]) => ({
    id, label: gov.name || id,
    tested: mentioned(`"${id}"`) || mentioned(gov.name)
  }));
  groups.push({ name: "Governments", expect: 6, rows });
}

// 5 districts --------------------------------------------------------------
{
  const kinds = ["campus", "trade", "encampment", "industrial", "theater"];
  const rows = kinds.map((kind) => ({
    id: kind, label: kind,
    tested: mentioned(`"${kind}"`)
  }));
  groups.push({ name: "Districts", expect: 5, rows });
}

// ---------------------------------------------------------------------------
// The gate is a RATCHET, not a cliff. 57 of the 122 effects have no behavioural
// proof yet; failing on all of them would just leave the suite permanently red
// and tell nobody anything new. Instead the proven count may never fall, the
// group sizes must stay exact, and KNOWN_GAPS may never go stale. Raise this
// number whenever tests are added — that is the whole point of it.
const PROVEN_BASELINE = 65;

const verbose = process.argv.includes("--list");
const failures = [];
const unproven = [];
let total = 0;
let proven = 0;
const gaps = [];

groups.forEach((group) => {
  const rows = group.rows;
  total += rows.length;
  if (rows.length !== group.expect) {
    failures.push(`${group.name}: expected ${group.expect} entries, found ${rows.length}`);
  }
  rows.forEach((row) => {
    const gapReason = Object.prototype.hasOwnProperty.call(KNOWN_GAPS, row.id)
      ? KNOWN_GAPS[row.id] : null;
    const engineResolves = !row.manual;
    if (gapReason) {
      gaps.push(`${group.name} / ${row.label}: ${gapReason}`);
      // A gap that has since been implemented must be removed from the list.
      if (engineResolves && row.tested) {
        failures.push(`${row.label} is listed in KNOWN_GAPS but now looks implemented and tested — remove the entry.`);
      }
      return;
    }
    if (!engineResolves) {
      failures.push(`${group.name} / ${row.label}: marked manual in the rules data but not listed in KNOWN_GAPS.`);
      return;
    }
    if (!row.tested) {
      unproven.push(`${group.name} / ${row.label}`);
      return;
    }
    proven++;
    if (verbose) console.log(`  ok   ${group.name} / ${row.label}`);
  });
});

console.log(`coverage-matrix: ${proven}/${total} rule-defined effects have a behavioural proof`);
groups.forEach((g) => {
  const ok = g.rows.filter((r) => r.tested && !r.manual &&
    !Object.prototype.hasOwnProperty.call(KNOWN_GAPS, r.id)).length;
  console.log(`  ${String(ok).padStart(3)}/${String(g.rows.length).padEnd(3)} ${g.name}`);
});

if (gaps.length) {
  console.log(`\ndeclared gaps (${gaps.length}):`);
  gaps.forEach((g) => console.log(`  - ${g}`));
}

if (unproven.length) {
  console.log(`\nno behavioural proof yet (${unproven.length}) — these are the tests still to write:`);
  unproven.forEach((u) => console.log(`  · ${u}`));
}

if (proven < PROVEN_BASELINE) {
  failures.push(`coverage went BACKWARDS: ${proven} effects proven, baseline is ${PROVEN_BASELINE}. ` +
    "A test that used to name an effect no longer does.");
} else if (proven > PROVEN_BASELINE) {
  console.log(`\ncoverage improved: ${proven} proven vs baseline ${PROVEN_BASELINE}. ` +
    `Raise PROVEN_BASELINE to ${proven} in tools/coverage-matrix.js.`);
}

if (failures.length) {
  console.log(`\ncoverage-matrix FAILED (${failures.length}):`);
  failures.forEach((f) => console.log(`  ! ${f}`));
  process.exitCode = 1;
} else {
  console.log("\ncoverage-matrix: gate passed");
}
