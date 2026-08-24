import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildDefensiveProfile,
  buildOffensiveProfile,
  rankTypingRecommendations,
} from "../src/team-analysis.js";

const raw = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../champions-data.json", import.meta.url)), "utf8"));
const chart = raw.typeChart;

const moves = {
  1: { name: "Test Normal", type: "normal", class: "physical", power: 80, accuracy: 100, target: "selected-pokemon", effect: "" },
  2: { name: "Test Status", type: "normal", class: "status", power: null, target: "user", effect: "Does nothing." },
  3: { name: "Test Fighting", type: "fighting", class: "physical", power: 80, accuracy: 100, target: "selected-pokemon", effect: "" },
  4: { name: "Test Ghost", type: "ghost", class: "special", power: 80, accuracy: 100, target: "selected-pokemon", effect: "" },
  5: { name: "Tailwind", type: "flying", class: "status", power: null, target: "users-field", effect: "For 4 turns, the user and its party members have their Speed doubled." },
  6: { name: "Test Flying", type: "flying", class: "special", power: 80, accuracy: 100, target: "selected-pokemon", effect: "" },
};

const mon = (slug, types, options = {}) => ({
  id: Math.abs([...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0)),
  slug,
  name: slug,
  types,
  available: options.available ?? true,
  abilities: options.abilities || [],
  moves: options.moves || [1],
  usage: options.usage,
  stats: options.stats || { hp: 80, atk: 90, def: 80, spa: 70, spd: 80, spe: 80 },
  off: options.off || { phys: 8, spec: 6 },
  sprite: "",
  artwork: "",
});
const member = (pokemon, moveIds = [], ability = null) => ({ mon: pokemon, moveIds, ability });
const dataFor = (pokemon, extra = {}) => ({
  pokemon,
  moves,
  typeChart: chart,
  abilities: {
    levitate: { name: "Levitate" },
    "flash-fire": { name: "Flash Fire" },
    "dry-skin": { name: "Dry Skin" },
    anticipation: { name: "Anticipation" },
    ...extra,
  },
});

// A relevant resistance with reciprocal cover must beat a historically safe typing
// that does not address the active roster's shared pressure.
{
  const poison = mon("test-poison", ["poison"]);
  const electric = mon("test-electric", ["electric"]);
  const flyingSteelBench = mon("test-flying-steel-bench", ["flying", "steel"]);
  const flyingSteelOther = mon("test-flying-steel-other", ["steel", "flying"]);
  const darkGhost = mon("test-dark-ghost", ["dark", "ghost"]);
  const unavailableNormal = mon("test-unavailable", ["normal"], { available: false });
  const activeTeam = [member(poison), member(electric)];
  const fullTeam = [...activeTeam, member(flyingSteelBench)];
  const result = rankTypingRecommendations({
    data: dataFor([poison, electric, flyingSteelBench, flyingSteelOther, darkGhost, unavailableNormal]),
    activeTeam,
    fullTeam,
  });
  const flyingSteel = result.defensive.find((entry) => entry.key === "flying/steel");
  const safe = result.defensive.find((entry) => entry.key === "ghost/dark");
  assert.ok(flyingSteel.score > safe.score, "Flying/Steel should beat Dark/Ghost when Ground is shared pressure");
  assert.equal(flyingSteel.matches[0].mon.slug, flyingSteelBench.slug, "bench candidates should win an exact tie");
  assert.equal(flyingSteel.matches[0].bench, true);
  assert.ok(flyingSteel.coveredWeaknessCount > 0, "reciprocal defensive cover should be tracked");
  assert.ok(flyingSteel.reasons.some((reason) => reason.startsWith("Team supports test-flying-steel-bench:")),
    "reciprocal cover wording must make clear that teammates protect the candidate");
  assert.equal(flyingSteel.reasons.some((reason) => reason.includes("team covers its")), false);
  assert.equal(result.defensive.some((entry) => entry.key === "normal"), false, "unavailable typings must be excluded");
}

// Selected defensive abilities affect the active profile.
{
  const electric = mon("ability-electric", ["electric"]);
  const normal = buildDefensiveProfile([member(electric)], chart);
  const levitating = buildDefensiveProfile([member(electric, [], "levitate")], chart);
  assert.ok(normal.rows.find((row) => row.attackType === "ground").penalty
    > levitating.rows.find((row) => row.attackType === "ground").penalty);
  assert.equal(levitating.rows.find((row) => row.attackType === "ground").cells[0], 0);

  const grass = mon("ability-grass", ["grass"]);
  assert.equal(buildDefensiveProfile([member(grass, [], "flash-fire")], chart)
    .rows.find((row) => row.attackType === "fire").cells[0], 0);
  assert.equal(buildDefensiveProfile([member(grass, [], "thick-fat")], chart)
    .rows.find((row) => row.attackType === "fire").cells[0], 1);
}

// Candidate recommendations test every legal ability and name the best one.
{
  const poison = mon("ground-pressure-poison", ["poison"]);
  const electric = mon("ground-pressure-electric", ["electric"]);
  const fire = mon("ability-fire", ["fire"], {
    abilities: [{ slug: "flash-fire", hidden: false }, { slug: "levitate", hidden: true }],
  });
  const result = rankTypingRecommendations({
    data: dataFor([poison, electric, fire]),
    activeTeam: [member(poison), member(electric)],
  });
  const fireFit = result.defensive.find((entry) => entry.key === "fire");
  assert.equal(fireFit.ability, "levitate");
  assert.ok(fireFit.reasons.some((reason) => reason.includes("Levitate") && reason.includes("Ground")));

  const rock = mon("water-pressure-rock", ["rock"]);
  const secondFire = mon("water-pressure-fire", ["fire"]);
  const drySkin = mon("dry-skin-user", ["poison", "fighting"], {
    abilities: [{ slug: "anticipation", hidden: false }, { slug: "dry-skin", hidden: false }],
  });
  const dryResult = rankTypingRecommendations({
    data: dataFor([rock, secondFire, drySkin]),
    activeTeam: [member(rock), member(secondFire)],
  });
  assert.equal(dryResult.defensive.find((entry) => entry.key === "fighting/poison").ability, "dry-skin");
}

// Offensive analysis uses selected damaging moves only and ignores status moves.
// Recommendations use actual likely moves; they do not grant automatic STAB.
{
  const normalUser = mon("normal-user", ["normal"]);
  const profile = buildOffensiveProfile([member(normalUser, [1, 2])], chart, moves);
  assert.equal(profile.hasDamagingMoves, true);
  assert.equal(profile.rows.find((row) => row.defendingType === "ghost").category, "no-effect");

  const statusFighting = mon("status-fighting", ["fighting"], {
    moves: [2],
    usage: { moves: [["Test Status", 100]] },
  });
  const attackingGhost = mon("attacking-ghost", ["ghost"], {
    moves: [4],
    usage: { moves: [["Test Ghost", 100]] },
  });
  const result = rankTypingRecommendations({
    data: dataFor([normalUser, statusFighting, attackingGhost]),
    activeTeam: [member(normalUser, [1, 2])],
  });
  assert.equal(result.offensive[0].key, "ghost", "a candidate without an attack must not receive imaginary STAB coverage");
  assert.ok(result.offensive[0].reasons.some((reason) => reason.includes("super-effective")));
}

// A useful support toolkit beats an otherwise identical one-dimensional option.
{
  const active = mon("support-test-active", ["normal"]);
  const attacker = mon("plain-flying", ["flying"], {
    usage: { moves: [["Test Flying", 100]] },
    moves: [6],
  });
  const support = mon("support-flying", ["flying"], {
    usage: { moves: [["Test Flying", 50], ["Tailwind", 50]] },
    moves: [5, 6],
  });
  const result = rankTypingRecommendations({
    data: dataFor([active, attacker, support]),
    activeTeam: [member(active, [1])],
  });
  const flying = result.offensive.find((entry) => entry.key === "flying");
  assert.equal(flying.representative.mon.slug, support.slug);
  assert.equal(flying.role, "support");
  assert.ok(flying.toolkit.some((tool) => tool.id === "speed"));
}

// Role/pressure fit must not ignore a new shared one-button weakness.
{
  const activeFire = mon("unsafe-active-fire", ["fire"]);
  const unsafeElectric = mon("unsafe-electric", ["electric"], { moves: [1] });
  const safeWater = mon("safe-water", ["water"], { moves: [1] });
  const result = rankTypingRecommendations({
    data: dataFor([activeFire, unsafeElectric, safeWater]),
    activeTeam: [member(activeFire, [1])],
  });
  const unsafe = result.offensive.find((entry) => entry.key === "electric");
  const safe = result.offensive.find((entry) => entry.key === "water");
  assert.ok(safe.score > unsafe.score);
  assert.ok(unsafe.warnings.some((warning) => warning.includes("shared weakness") && warning.includes("Ground")));
}

console.log("team-analysis tests passed");
