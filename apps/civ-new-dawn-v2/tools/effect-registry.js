"use strict";

// The authoritative list of every card/ability effect that needs a behavioural
// proof, and the one place the 124 denominator is defined.
//
// The ids are DERIVED from rules-data.js rather than typed out here, so the
// registry cannot drift from the cards: add a wonder to the data and it appears
// here as unproven, rather than silently not counting. The expected counts
// below are the printed component counts and are asserted against what the data
// actually yields, so a data edit that loses a card fails loudly.
//
// This file deliberately knows nothing about which effects are implemented or
// tested. It is the denominator only.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..");

function loadRules() {
  const context = vm.createContext({ console });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(APP, "rules-data.js"), "utf8"),
    context, { filename: "rules-data.js" });
  return context.CivRulesData;
}

// Human-readable, deterministic, and stable across renames of unrelated things.
function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const EXPECTED = {
  "Standard Focus": 24,
  "Unique Focus": 18,
  "Civilization abilities": 18,
  "World Wonders": 36,
  "Player Diplomacy": 5,
  "City States": 12,
  "Governments": 6,
  "Districts": 5
};

// The five printed district tokens. These are the only entries not derived from
// a rules-data collection, because districts are a fixed enumeration in game.js
// rather than a data table; DISTRICT_LABELS is the printed naming.
const DISTRICT_KINDS = ["campus", "trade", "encampment", "industrial", "theater"];

function buildRegistry() {
  const RULES = loadRules();
  const effects = [];
  const add = (category, id, label) => effects.push({ category, id, label });

  // 24 standard focus cards: six types x four tech levels.
  Object.entries(RULES.CARD_DEFS || {}).forEach(([type, tiers]) => {
    Object.entries(tiers).forEach(([tier, def]) => {
      add("Standard Focus", `standard.${type}.${slug(def.name)}`,
        `${def.name} (${type} ${tier})`);
    });
  });

  // 18 unique focus cards and 18 civilization abilities.
  (RULES.LEADERS || []).forEach((leader) => {
    const unique = leader.unique || {};
    if (unique.name) {
      add("Unique Focus", `unique.${slug(leader.id)}.${slug(unique.name)}`,
        `${unique.name} (${leader.civ})`);
    }
    add("Civilization abilities", `civ.${slug(leader.id)}`, `${leader.civ} ability`);
  });

  // 36 world wonders: nine per type.
  Object.entries(RULES.WONDER_DECKS || {}).forEach(([type, deck]) => {
    (deck || []).forEach((wonder) => {
      add("World Wonders", `wonder.${type}.${slug(wonder.name)}`, wonder.name);
    });
  });

  // 5 player diplomacy cards.
  Object.entries(RULES.DIPLOMACY_CARDS || {}).forEach(([id, card]) => {
    add("Player Diplomacy", `diplomacy.${slug(id)}`, card.name || id);
  });

  // 12 city-state abilities.
  Object.keys(RULES.CITY_STATES || {}).forEach((name) => {
    add("City States", `citystate.${slug(name)}`, name);
  });

  // 6 governments.
  Object.keys(RULES.GOVERNMENTS || {}).forEach((id) => {
    const gov = RULES.GOVERNMENTS[id];
    add("Governments", `government.${slug(id)}`, (gov && gov.name) || id);
  });

  // 5 districts.
  DISTRICT_KINDS.forEach((kind) => add("Districts", `district.${kind}`, kind));

  return effects;
}

// A registry that does not match the printed component counts is a data bug,
// not a coverage result, so it is reported separately and loudly.
function registryProblems(effects) {
  const problems = [];
  const byCategory = {};
  effects.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + 1; });
  Object.entries(EXPECTED).forEach(([category, count]) => {
    const actual = byCategory[category] || 0;
    if (actual !== count) {
      problems.push(`${category}: expected ${count} effects, the rules data yields ${actual}`);
    }
  });
  const seen = new Set();
  effects.forEach((e) => {
    if (seen.has(e.id)) problems.push(`duplicate effect id in the registry: ${e.id}`);
    seen.add(e.id);
  });
  return problems;
}

const EFFECTS = buildRegistry();

module.exports = {
  EFFECTS,
  EXPECTED,
  TOTAL: Object.values(EXPECTED).reduce((a, b) => a + b, 0),
  CATEGORIES: Object.keys(EXPECTED),
  registryProblems,
  slug
};

if (require.main === module) {
  const problems = registryProblems(EFFECTS);
  console.log(`effect-registry: ${EFFECTS.length} required effect ids`);
  Object.keys(EXPECTED).forEach((category) => {
    const rows = EFFECTS.filter((e) => e.category === category);
    console.log(`  ${String(rows.length).padStart(3)}/${String(EXPECTED[category]).padEnd(3)} ${category}`);
    if (process.argv.includes("--list")) rows.forEach((r) => console.log(`        ${r.id}`));
  });
  if (problems.length) {
    console.log("\nregistry problems:");
    problems.forEach((p) => console.log("  ! " + p));
    process.exitCode = 1;
  }
}
