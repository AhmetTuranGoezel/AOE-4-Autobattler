import assert from "node:assert/strict";
import { movePassesRankExclusions } from "../src/moves-view.js";

const HEX = 1;
const slug = "test-ghost";
const excluded = new Set();
const monExcluded = new Map();
const monAllowed = new Map();

assert.equal(movePassesRankExclusions(HEX, slug, excluded, monExcluded, monAllowed), true);

excluded.add(HEX);
assert.equal(movePassesRankExclusions(HEX, slug, excluded, monExcluded, monAllowed), false,
  "a global ban must remove the move from every normal archetype pick");

monAllowed.set(slug, new Set([HEX]));
assert.equal(movePassesRankExclusions(HEX, slug, excluded, monExcluded, monAllowed), true,
  "a per-Pokemon allow must override the global ban");

monExcluded.set(slug, new Set([HEX]));
assert.equal(movePassesRankExclusions(HEX, slug, excluded, monExcluded, monAllowed), false,
  "an explicit per-Pokemon ban must win over an old allow exception");

excluded.clear();
assert.equal(movePassesRankExclusions(HEX, slug, excluded, monExcluded, monAllowed), false,
  "a per-Pokemon ban must also work without a global ban");

console.log("move ranking rule tests passed");
