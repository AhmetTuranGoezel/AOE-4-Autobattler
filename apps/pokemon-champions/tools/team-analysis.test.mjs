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

const mon = (slug, types, available = true) => ({
  id: Math.abs([...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0)),
  slug,
  name: slug,
  types,
  available,
  abilities: [],
  sprite: "",
  artwork: "",
});
const member = (pokemon, moveIds = [], ability = null) => ({ mon: pokemon, moveIds, ability });

// A relevant resistance with reciprocal cover must beat a historically safe typing
// that does not address the active roster's shared pressure.
{
  const poison = mon("test-poison", ["poison"]);
  const electric = mon("test-electric", ["electric"]);
  const flyingSteelBench = mon("test-flying-steel-bench", ["flying", "steel"]);
  const flyingSteelOther = mon("test-flying-steel-other", ["steel", "flying"]);
  const darkGhost = mon("test-dark-ghost", ["dark", "ghost"]);
  const unavailableNormal = mon("test-unavailable", ["normal"], false);
  const activeTeam = [member(poison), member(electric)];
  const fullTeam = [...activeTeam, member(flyingSteelBench)];
  const result = rankTypingRecommendations({
    data: { pokemon: [poison, electric, flyingSteelBench, flyingSteelOther, darkGhost, unavailableNormal], moves: {}, typeChart: chart },
    activeTeam,
    fullTeam,
  });
  const flyingSteel = result.defensive.find((entry) => entry.key === "flying/steel");
  const safe = result.defensive.find((entry) => entry.key === "ghost/dark");
  assert.ok(flyingSteel.score > safe.score, "Flying/Steel should beat Dark/Ghost when Ground is shared pressure");
  assert.equal(flyingSteel.matches[0].mon.slug, flyingSteelBench.slug, "bench candidates should be listed first");
  assert.equal(flyingSteel.matches[0].bench, true);
  assert.ok(flyingSteel.coveredWeaknessCount > 0, "reciprocal defensive cover should be tracked");
  assert.equal(result.defensive.some((entry) => entry.key === "normal"), false, "unavailable typings must be excluded");
}

// Selected defensive abilities affect the active profile and therefore the fit score.
{
  const electric = mon("ability-electric", ["electric"]);
  const normal = buildDefensiveProfile([member(electric)], chart);
  const levitating = buildDefensiveProfile([member(electric, [], "levitate")], chart);
  const normalGround = normal.rows.find((row) => row.attackType === "ground");
  const levitateGround = levitating.rows.find((row) => row.attackType === "ground");
  assert.ok(normalGround.penalty > levitateGround.penalty);
  assert.equal(levitateGround.cells[0], 0);
}

// Offensive analysis uses selected damaging moves only and ignores status moves.
{
  const normalUser = mon("normal-user", ["normal"]);
  const moves = {
    1: { name: "Test Normal", type: "normal", class: "physical" },
    2: { name: "Test Status", type: "normal", class: "status" },
  };
  const profile = buildOffensiveProfile([member(normalUser, [1, 2])], chart, moves);
  assert.equal(profile.hasDamagingMoves, true);
  assert.equal(profile.rows.find((row) => row.defendingType === "ghost").category, "no-effect");

  const fighting = mon("test-fighting", ["fighting"]);
  const ghost = mon("test-ghost", ["ghost"]);
  const result = rankTypingRecommendations({
    data: { pokemon: [normalUser, fighting, ghost], moves, typeChart: chart },
    activeTeam: [member(normalUser, [1, 2])],
  });
  assert.equal(result.offensive[0].key, "fighting");
  assert.ok(result.offensive[0].reasons.some((reason) => reason.includes("super-effective")));
}

console.log("team-analysis tests passed");
