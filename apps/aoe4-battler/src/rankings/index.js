import { units, unitIndex, getTypeOrder, getUnitMeta } from "../shared/data.js";
import {
  applyBuffs,
  getWeaponDisplayName,
  getWeaponProjectiles,
  unitSupportsBothWeapons,
} from "../shared/combat.js";
import {
  applyBundledDamageToTeam,
  applyKipchakBleed,
  applyPoison,
  collectBleedTickEvents,
  collectPoisonTickEvents,
  getNextBleedTick,
  getNextPoisonTick,
  syncTrackedTeamState,
} from "../shared/health-tracking.js";
import {
  applyBattleGlory,
  computeTeamAttack,
  createTeamState,
} from "../unit-battler/multi-battle-sim.js";
import {
  FALLBACK_TECH_IMG,
  TECH_EFFECTS,
  TECH_TO_EFFECT,
  filterTechByCiv,
  getMergedUpgradesForUnit,
  getTechImage,
  getTechKey,
} from "../unit-battler/techs.js";

const DEFAULTS = {
  rankedGroup: "Ranged Cavalry",
  damageOpponentGroup: "Light Infantry",
  damageOpponentUnit: "Spearman",
  tankOpponentGroup: "Ranged Infantry",
  tankOpponentUnit: "Archer",
};

const MAX_SIM_TIME = 600;
const EPSILON = 0.0001;
const NON_COMBAT_CATEGORIES = new Set([
  "Worker",
  "Trader",
  "Support",
  "Civilian",
]);
const SIMULATED_TECH_CATEGORIES = new Set([
  "attack",
  "armor",
  "hitpoints",
  "attackSpeed",
  "ability",
  "other",
]);
const BASE_EFFECT_DENYLIST = new Set([
  "arrowVolley",
  "berserking",
  "caracole",
  "deployPavise",
  "fortitude",
  "hardCasedBombs",
  "kaburaYaWhistlingArrow",
  "knightlyBrotherhood",
  "movementBurst",
  "numeri",
  "ruinousBlinding",
  "staticDeployment",
  "shieldWall",
  "trample",
  "triumph",
  "tripleShot",
]);
const TECH_MIN_AGE = {
  Bloomery: 2,
  "Steeled Arrow": 2,
  "Fitted Leatherwork": 2,
  "Iron Undermesh": 2,
  Decarbonization: 3,
  "Balanced Projectiles": 3,
  "Insulated Helm": 3,
  "Wedge Rivets": 3,
  "Damascus Steel": 4,
  "Platecutter Point": 4,
  "Master Smiths": 4,
  "Angled Surfaces": 4,
  Biology: 4,
  "Biology Improved": 4,
  "Elite Army Tactics": 4,
  "Improved Elite Army Tactics": 4,
  "Incendiary Arrows": 4,
  Chemistry: 4,
  "Siege Works": 4,
  "Military Academy": 3,
  "Archery Range Reinforcements": 3,
  "Barracks Reinforcements": 3,
  "Stables Reinforcements": 3,
  "Mehter Attack Drums": 2,
  "Mehter Melee Armor Drums": 2,
  "Mehter Ranged Armor Drums": 2,
  "Mehter Speed Bonus": 2,
};
const AGE_ATTACK_TECHS = {
  melee: ["Bloomery", "Decarbonization", "Damascus Steel"],
  ranged: ["Steeled Arrow", "Balanced Projectiles", "Platecutter Point"],
};
const AGE_MELEE_ARMOR_TECHS = [
  "Fitted Leatherwork",
  "Insulated Helm",
  "Master Smiths",
];
const AGE_RANGED_ARMOR_TECHS = [
  "Iron Undermesh",
  "Wedge Rivets",
  "Angled Surfaces",
];
const TECH_GROUP_ORDER = [
  "attack",
  "armor",
  "hitpoints",
  "attackSpeed",
  "ability",
  "other",
];
const TECH_GROUP_LABELS = {
  attack: "Attack",
  armor: "Armor",
  hitpoints: "Hitpoints",
  attackSpeed: "Attack Speed",
  ability: "Abilities",
  other: "Other",
};
const GOLDEN_HORDE_REINFORCEMENTS = new Set([
  "Archery Range Reinforcements",
  "Barracks Reinforcements",
  "Stables Reinforcements",
]);
const GOLDEN_HORDE_REINFORCEMENT_COST_FRACTION = {
  numerator: 2,
  denominator: 3,
};

const dom = {};
const rankingState = {
  mode: "damage",
  group: DEFAULTS.rankedGroup,
  age: 2,
  opponentGroup: DEFAULTS.damageOpponentGroup,
  opponentUnit: DEFAULTS.damageOpponentUnit,
  attackerWeaponMode: "primary",
  targetSpread: 1,
  extraUnits: [],
  rankedTechs: new Map(),
  opponentTechs: new Map(),
};

export function initRankingsApp() {
  cacheDom();
  if (!dom.row) return;
  populateGroupSelects();
  attachEvents();
  syncOpponentLabels();
  syncOpponentUnits();
  renderRankings();
  window.Aoe4Rankings = { renderRankings };
}

export function renderRankings() {
  if (!dom.results || !dom.row) return;
  syncModeButtons();
  syncOpponentLabels();

  const age = Number(rankingState.age) || 2;
  const opponentName = rankingState.opponentUnit;
  const opponentUnit = units[opponentName];
  const rankedNames = getRankedUnitNames(age);

  renderTechPanels(rankedNames, opponentName, age);
  renderExtraUnitControls(age);

  if (!opponentName || !opponentUnit) {
    renderEmpty("Select a valid target unit to calculate rankings.");
    return;
  }

  const rows = [];
  let skipped = 0;
  for (const unitName of rankedNames) {
    const selected = calculateRankingResult(unitName, opponentName, age);
    if (!selected || !Number.isFinite(selected.scoreSort)) {
      skipped++;
      continue;
    }
    rows.push({ unitName, selected });
  }

  rows.sort((a, b) => {
    if (rankingState.mode === "tankiness") {
      return b.selected.scoreSort - a.selected.scoreSort;
    }
    return a.selected.scoreSort - b.selected.scoreSort;
  });

  renderSummary(rows, skipped);
  renderResults(rows);
}

function cacheDom() {
  dom.row = document.getElementById("rankingsRow");
  dom.resultCount = document.getElementById("rankingResultCount");
  dom.group = document.getElementById("rankingGroupSelect");
  dom.age = document.getElementById("rankingAgeSelect");
  dom.opponentGroup = document.getElementById("rankingOpponentGroupSelect");
  dom.opponentUnit = document.getElementById("rankingOpponentUnitSelect");
  dom.opponentGroupLabel = document.getElementById("rankingOpponentGroupLabel");
  dom.opponentUnitLabel = document.getElementById("rankingOpponentUnitLabel");
  dom.weaponModeLabel = document.getElementById("rankingWeaponModeLabel");
  dom.weaponMode = document.getElementById("rankingWeaponModeSelect");
  dom.targetSpread = document.getElementById("rankingTargetSpreadInput");
  dom.summary = document.getElementById("rankingSummary");
  dom.results = document.getElementById("rankingResults");
  dom.rankedTechBox = document.getElementById("rankingRankedTechBox");
  dom.opponentTechBox = document.getElementById("rankingOpponentTechBox");
  dom.opponentTechTitle = document.getElementById("rankingOpponentTechTitle");
  dom.clearRankedTechs = document.getElementById("rankingClearRankedTechs");
  dom.clearOpponentTechs = document.getElementById("rankingClearOpponentTechs");
  dom.extraUnit = document.getElementById("rankingExtraUnitSelect");
  dom.addExtraUnit = document.getElementById("rankingAddExtraUnit");
  dom.extraUnitChips = document.getElementById("rankingExtraUnitChips");
}

function attachEvents() {
  document.querySelectorAll(".ranking-mode-btn").forEach((button) => {
    button.addEventListener("click", () => {
      rankingState.mode = button.dataset.rankingMode || "damage";
      if (rankingState.mode === "damage") {
        rankingState.opponentGroup = DEFAULTS.damageOpponentGroup;
        rankingState.opponentUnit = DEFAULTS.damageOpponentUnit;
      } else {
        rankingState.opponentGroup = DEFAULTS.tankOpponentGroup;
        rankingState.opponentUnit = DEFAULTS.tankOpponentUnit;
      }
      rankingState.opponentTechs.clear();
      syncOpponentUnits();
      renderRankings();
    });
  });
  dom.group?.addEventListener("change", () => {
    rankingState.group = dom.group.value;
    rankingState.rankedTechs.clear();
    renderRankings();
  });
  dom.age?.addEventListener("change", () => {
    rankingState.age = Number(dom.age.value) || 2;
    rankingState.rankedTechs.clear();
    rankingState.opponentTechs.clear();
    syncOpponentUnits();
    renderRankings();
  });
  dom.opponentGroup?.addEventListener("change", () => {
    rankingState.opponentGroup = dom.opponentGroup.value;
    rankingState.opponentTechs.clear();
    syncOpponentUnits();
    renderRankings();
  });
  dom.opponentUnit?.addEventListener("change", () => {
    rankingState.opponentUnit = dom.opponentUnit.value;
    rankingState.opponentTechs.clear();
    renderRankings();
  });
  dom.weaponMode?.addEventListener("change", () => {
    rankingState.attackerWeaponMode = dom.weaponMode.value || "primary";
    syncOpponentUnits();
    renderRankings();
  });
  dom.targetSpread?.addEventListener("input", () => {
    rankingState.targetSpread = clampInteger(dom.targetSpread.value, 1, 50, 1);
    renderRankings();
  });
  dom.clearRankedTechs?.addEventListener("click", () => {
    rankingState.rankedTechs.clear();
    renderRankings();
  });
  dom.clearOpponentTechs?.addEventListener("click", () => {
    rankingState.opponentTechs.clear();
    renderRankings();
  });
  dom.addExtraUnit?.addEventListener("click", () => {
    addSelectedExtraUnit();
  });
  dom.extraUnit?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addSelectedExtraUnit();
  });
  dom.extraUnitChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-extra-unit]");
    if (!button) return;
    const unitName = button.dataset.removeExtraUnit;
    rankingState.extraUnits = rankingState.extraUnits.filter((name) => name !== unitName);
    rankingState.rankedTechs.clear();
    renderRankings();
  });
}

function populateGroupSelects() {
  const groups = getGroupOptions();
  const options = groups.map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`).join("");
  if (dom.group) {
    dom.group.innerHTML = options;
    dom.group.value = groups.includes(DEFAULTS.rankedGroup) ? DEFAULTS.rankedGroup : groups[0] || "";
    rankingState.group = dom.group.value;
  }
  if (dom.opponentGroup) {
    dom.opponentGroup.innerHTML = options;
    dom.opponentGroup.value = DEFAULTS.damageOpponentGroup;
    rankingState.opponentGroup = dom.opponentGroup.value;
  }
  if (dom.age) dom.age.value = String(rankingState.age);
}

function syncModeButtons() {
  document.querySelectorAll(".ranking-mode-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.rankingMode === rankingState.mode);
  });
}

function syncOpponentLabels() {
  const isTank = rankingState.mode === "tankiness";
  if (dom.opponentGroupLabel) dom.opponentGroupLabel.textContent = isTank ? "Attacker Group" : "Target Group";
  if (dom.opponentUnitLabel) dom.opponentUnitLabel.textContent = isTank ? "Attacker Unit" : "Target Unit";
  if (dom.opponentTechTitle) dom.opponentTechTitle.textContent = isTank ? "Attacker Bonuses" : "Target Bonuses";
  if (dom.weaponModeLabel) dom.weaponModeLabel.textContent = isTank ? "Attacker Weapon" : "Ranked Weapon";
  if (dom.weaponMode) dom.weaponMode.value = rankingState.attackerWeaponMode;
  if (dom.targetSpread) dom.targetSpread.value = String(rankingState.targetSpread);
}

function syncOpponentUnits() {
  const age = Number(rankingState.age) || 2;
  const needsAttack = rankingState.mode === "tankiness";
  const names = getUnitsForGroup(rankingState.opponentGroup, age, {
    needsAttack,
    weaponMode: needsAttack ? rankingState.attackerWeaponMode : "primary",
  });
  const preferred = rankingState.mode === "tankiness"
    ? DEFAULTS.tankOpponentUnit
    : DEFAULTS.damageOpponentUnit;
  if (!names.includes(rankingState.opponentUnit)) {
    rankingState.opponentUnit = names.includes(preferred) ? preferred : names[0] || "";
  }
  if (dom.opponentGroup) dom.opponentGroup.value = rankingState.opponentGroup;
  if (dom.opponentUnit) {
    dom.opponentUnit.innerHTML = names.map((name) => `
      <option value="${escapeAttr(name)}">${escapeHtml(name)}</option>
    `).join("");
    dom.opponentUnit.value = rankingState.opponentUnit;
  }
}

function addSelectedExtraUnit() {
  const unitName = dom.extraUnit?.value;
  if (!unitName || rankingState.extraUnits.includes(unitName)) return;
  const age = Number(rankingState.age) || 2;
  if (!isValidRankingUnit(unitName, age, {
    needsAttack: rankingState.mode === "damage",
    weaponMode: rankingState.mode === "damage" ? rankingState.attackerWeaponMode : "primary",
  })) return;
  rankingState.extraUnits.push(unitName);
  rankingState.extraUnits.sort((a, b) => a.localeCompare(b));
  rankingState.rankedTechs.clear();
  renderRankings();
}

function getRankedUnitNames(age) {
  const baseNames = getUnitsForGroup(rankingState.group, age, {
    needsAttack: rankingState.mode === "damage",
    weaponMode: rankingState.mode === "damage" ? rankingState.attackerWeaponMode : "primary",
  });
  syncExtraUnits(age, baseNames);
  return [...new Set([...baseNames, ...rankingState.extraUnits])]
    .sort((a, b) => a.localeCompare(b));
}

function syncExtraUnits(age, baseNames = null) {
  const baseSet = new Set(
    baseNames || getUnitsForGroup(rankingState.group, age, {
      needsAttack: rankingState.mode === "damage",
      weaponMode: rankingState.mode === "damage" ? rankingState.attackerWeaponMode : "primary",
    }),
  );
  rankingState.extraUnits = rankingState.extraUnits.filter((unitName) => {
    if (baseSet.has(unitName)) return false;
    return isValidRankingUnit(unitName, age, {
      needsAttack: rankingState.mode === "damage",
      weaponMode: rankingState.mode === "damage" ? rankingState.attackerWeaponMode : "primary",
    });
  });
}

function renderExtraUnitControls(age) {
  if (!dom.extraUnit || !dom.extraUnitChips) return;
  const baseSet = new Set(getUnitsForGroup(rankingState.group, age, {
    needsAttack: rankingState.mode === "damage",
    weaponMode: rankingState.mode === "damage" ? rankingState.attackerWeaponMode : "primary",
  }));
  const extraSet = new Set(rankingState.extraUnits);
  const previousValue = dom.extraUnit.value;
  const candidates = Object.keys(unitIndex?.units || units || {})
    .filter((unitName) => !baseSet.has(unitName))
    .filter((unitName) => !extraSet.has(unitName))
    .filter((unitName) => isValidRankingUnit(unitName, age, {
      needsAttack: rankingState.mode === "damage",
      weaponMode: rankingState.mode === "damage" ? rankingState.attackerWeaponMode : "primary",
    }))
    .sort((a, b) => a.localeCompare(b));

  dom.extraUnit.innerHTML = candidates.map((unitName) => `
    <option value="${escapeAttr(unitName)}">${escapeHtml(unitName)} (${escapeHtml(getUnitCategory(unitName) || "Unit")})</option>
  `).join("");
  const preferred = candidates.includes(previousValue)
    ? previousValue
    : candidates.includes("Tower Elephant")
      ? "Tower Elephant"
      : candidates[0] || "";
  dom.extraUnit.value = preferred;
  if (dom.addExtraUnit) dom.addExtraUnit.disabled = !candidates.length;

  if (!rankingState.extraUnits.length) {
    dom.extraUnitChips.innerHTML = `<span class="ranking-extra-hint">No extra units added.</span>`;
    return;
  }
  dom.extraUnitChips.innerHTML = rankingState.extraUnits.map((unitName) => `
    <button class="ranking-extra-chip" type="button" data-remove-extra-unit="${escapeAttr(unitName)}" title="Remove ${escapeAttr(unitName)}">
      ${escapeHtml(unitName)}
      <span aria-hidden="true">&times;</span>
    </button>
  `).join("");
}

function renderTechPanels(rankedNames, opponentName, age) {
  const rankedWeaponMode = rankingState.mode === "damage"
    ? rankingState.attackerWeaponMode
    : "primary";
  const opponentWeaponMode = rankingState.mode === "tankiness"
    ? rankingState.attackerWeaponMode
    : "primary";
  const rankedItems = getGroupAvailableTechItems(rankedNames, age, rankedWeaponMode);
  const opponentItems = opponentName
    ? getAvailableRankingTechItems(opponentName, age, opponentWeaponMode)
    : [];
  syncActiveTechMap(rankingState.rankedTechs, rankedItems);
  syncActiveTechMap(rankingState.opponentTechs, opponentItems);
  renderTechBox(dom.rankedTechBox, rankedItems, rankingState.rankedTechs, "ranked");
  renderTechBox(dom.opponentTechBox, opponentItems, rankingState.opponentTechs, "opponent");
}

function renderTechBox(container, items, activeMap, scope) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="ranking-tech-empty">No modeled combat bonuses available for this selection.</div>`;
    return;
  }

  const groups = new Map();
  for (const item of items) {
    const category = TECH_GROUP_ORDER.includes(item.category) ? item.category : "other";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }

  let html = "";
  for (const category of TECH_GROUP_ORDER) {
    const groupItems = groups.get(category) || [];
    if (!groupItems.length) continue;
    html += `<div class="tech-group-label">${TECH_GROUP_LABELS[category] || "Other"}</div><div class="tech-grid ranking-tech-grid">`;
    for (const item of groupItems) {
      html += renderTechButton(item, activeMap, scope);
    }
    html += `</div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll(".tech-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleRankingTech(scope, button.dataset.techKey, button);
    });
  });
  container.querySelectorAll(".tech-level-select").forEach((select) => {
    select.addEventListener("change", () => {
      const map = getTechMapForScope(scope);
      const state = map.get(select.dataset.techKey);
      if (state) {
        state.level = Number(select.value) || 0;
        renderRankings();
      }
    });
  });
}

function renderTechButton(item, activeMap, scope) {
  const key = getTechKey(item);
  const effects = TECH_EFFECTS[key];
  const isActive = activeMap.has(key);
  const hasLevels =
    effects &&
    Object.values(effects).some(
      (value) => Array.isArray(value) && !["labels"].includes(value),
    );
  const labels = effects?.labels;
  const imgSrc = getTechImage(item.name);
  const activeClass = isActive ? " active" : "";
  const appliesSuffix = getAppliesTooltip(item);
  const compositionSuffix = isGoldenHordeReinforcementTech(item)
    ? " Modeled as 2/3 effective unit cost for equal-resource rankings."
    : "";
  const tooltip = `${item.name}: ${item.description || "modeled bonus"}${compositionSuffix}${appliesSuffix}`.replace(/"/g, "&quot;");

  if (hasLevels && labels) {
    const currentLevel = activeMap.get(key)?.level || 0;
    let html = `<div class="tech-level-wrap ranking-tech-level-wrap">`;
    html += `<button class="tech-btn${activeClass}" type="button" data-tech-key="${escapeAttr(key)}" data-scope="${scope}" title="${tooltip}">`;
    html += `<img src="${imgSrc}" alt="${escapeAttr(item.name)}" onerror="this.src='${FALLBACK_TECH_IMG}'">`;
    html += `</button>`;
    html += `<select class="tech-level-select" data-tech-key="${escapeAttr(key)}" data-scope="${scope}">`;
    for (let i = 0; i < labels.length; i++) {
      const selected = i === currentLevel ? " selected" : "";
      html += `<option value="${i}"${selected}>${escapeHtml(labels[i])}</option>`;
    }
    html += `</select></div>`;
    return html;
  }

  return `
    <button class="tech-btn${activeClass}" type="button" data-tech-key="${escapeAttr(key)}" data-scope="${scope}" title="${tooltip}">
      <img src="${imgSrc}" alt="${escapeAttr(item.name)}" onerror="this.src='${FALLBACK_TECH_IMG}'">
    </button>
  `;
}

function toggleRankingTech(scope, key, button) {
  const map = getTechMapForScope(scope);
  if (!map || !key) return;
  if (map.has(key)) {
    map.delete(key);
  } else {
    const wrap = button?.closest(".tech-level-wrap");
    const level = Number(wrap?.querySelector(".tech-level-select")?.value) || 0;
    map.set(key, { level });
  }
  renderRankings();
}

function getTechMapForScope(scope) {
  return scope === "opponent" ? rankingState.opponentTechs : rankingState.rankedTechs;
}

function syncActiveTechMap(activeMap, availableItems) {
  const availableKeys = new Set(availableItems.map((item) => getTechKey(item)));
  for (const key of [...activeMap.keys()]) {
    if (!availableKeys.has(key)) activeMap.delete(key);
  }
}

function getGroupAvailableTechItems(unitNames, age, weaponMode = "primary") {
  const byKey = new Map();
  for (const unitName of unitNames) {
    for (const item of getAvailableRankingTechItems(unitName, age, weaponMode)) {
      const key = getTechKey(item);
      if (!byKey.has(key)) {
        byKey.set(key, { ...item, rankingAppliesTo: [] });
      }
      byKey.get(key).rankingAppliesTo.push(unitName);
    }
  }
  return sortTechItems([...byKey.values()]);
}

function getAvailableRankingTechItems(unitName, age, weaponMode = "primary") {
  const unit = units[unitName];
  if (!unit) return [];
  const weaponSelection = getWeaponSelection(unitName, unit, age, weaponMode);
  const items = [
    ...getGenericTechItems(unit, age, weaponSelection),
    ...getMergedUpgradesForUnit(unit, unitName),
    ...(unit.auras || []),
    ...(unit.abilities || []),
  ];
  const byKey = new Map();
  for (const item of items) {
    if (!item || item.displayOnly) continue;
    if (!filterRankingTechByUnit(item, unitName)) continue;
    if (!techAvailableAtAge(item, age)) continue;
    if (!isRankingTechItem(item)) continue;
    const key = getTechKey(item);
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return sortTechItems([...byKey.values()]);
}

function filterRankingTechByUnit(item, unitName) {
  if (isGoldenHordeReinforcementTech(item)) {
    return unitHasCiv(unitName, "Golden Horde");
  }
  return filterTechByCiv(item, getNaturalCiv(unitName));
}

function getAvailableItemMap(unitName, age, weaponMode = "primary") {
  const map = new Map();
  for (const item of getAvailableRankingTechItems(unitName, age, weaponMode)) {
    map.set(getTechKey(item), item);
  }
  return map;
}

function sortTechItems(items) {
  return items.sort((a, b) => {
    const aGroup = TECH_GROUP_ORDER.indexOf(a.category);
    const bGroup = TECH_GROUP_ORDER.indexOf(b.category);
    const aOrder = aGroup === -1 ? TECH_GROUP_ORDER.length : aGroup;
    const bOrder = bGroup === -1 ? TECH_GROUP_ORDER.length : bGroup;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name).localeCompare(String(b.name));
  });
}

function calculateRankingResult(unitName, opponentName, age) {
  const rankedWeaponMode = rankingState.mode === "damage"
    ? rankingState.attackerWeaponMode
    : "primary";
  const opponentWeaponMode = rankingState.mode === "tankiness"
    ? rankingState.attackerWeaponMode
    : "primary";
  const ranked = buildRankingUnitData(unitName, age, rankingState.rankedTechs, {
    needsAttack: rankingState.mode === "damage",
    weaponMode: rankedWeaponMode,
  });
  const opponent = buildRankingUnitData(opponentName, age, rankingState.opponentTechs, {
    needsAttack: rankingState.mode === "tankiness",
    weaponMode: opponentWeaponMode,
  });
  if (!ranked || !opponent) return null;

  const rankedCost = getEffectiveCostProfile(unitName, age, rankingState.rankedTechs);
  const opponentCost = getEffectiveCostProfile(opponentName, age, rankingState.opponentTechs);
  if (!(rankedCost.effective > 0) || !(opponentCost.effective > 0)) return null;
  const counts = getEqualCostCounts(rankedCost, opponentCost);

  let attacker;
  let defender;
  if (rankingState.mode === "tankiness") {
    attacker = { ...opponent, count: counts.opponentCount };
    defender = { ...ranked, count: counts.rankedCount };
  } else {
    attacker = { ...ranked, count: counts.rankedCount };
    defender = { ...opponent, count: counts.opponentCount };
  }

  const sim = simulateOneWay(attacker, defender, {
    splitTargets: rankingState.targetSpread,
  });
  const totalRankedCost = rankedCost.effective * counts.rankedCount;
  const totalOpponentCost = opponentCost.effective * counts.opponentCount;
  const scoreSort = sim.finished ? sim.time : MAX_SIM_TIME + 1;

  return {
    time: sim.time,
    finished: sim.finished,
    scoreSort,
    rankedCount: counts.rankedCount,
    opponentCount: counts.opponentCount,
    totalRankedCost,
    totalOpponentCost,
    rankedApplied: ranked.appliedTechs,
    opponentApplied: opponent.appliedTechs,
    rankedCostAdjusted: rankedCost.adjusted,
    opponentCostAdjusted: opponentCost.adjusted,
    rankedEffectiveCost: rankedCost.effective,
    opponentEffectiveCost: opponentCost.effective,
    weaponLabel: attacker.weaponLabel,
  };
}

function buildRankingUnitData(unitName, age, activeTechMap, options = {}) {
  const unit = units[unitName];
  if (!unit) return null;
  const weaponSelection = getWeaponSelection(unitName, unit, age, options.weaponMode);
  const weapon = weaponSelection.weapon;
  const ageStats = weaponSelection.ageStats;
  if (!ageStats || !(ageStats.hp > 0)) return null;
  const weaponAttack = Number(ageStats.attack) || 0;
  if (options.needsAttack && !(weaponAttack > 0)) return null;

  const unitData = {
    name: unitName,
    count: 1,
    civGroup: getNaturalCiv(unitName),
    weaponMode: weaponSelection.mode,
    weaponLabel: weaponSelection.label,
    weaponType: weapon.type || "melee",
    weaponRange: Number(weapon.range) || 0,
    weaponProjectiles: getWeaponProjectiles(weapon),
    speed: Number(unit.speed) || 1,
    stats: {
      hp: Number(ageStats.hp) || 0,
      attack: weaponAttack,
      meleeArmor: Number(ageStats.meleeArmor) || 0,
      rangedArmor: Number(ageStats.rangedArmor) || 0,
      rangedResistance: Number(ageStats.rangedResistance) || 0,
      bonusDamageResistance: 0,
      attackSpeed: Number(weapon.attackSpeed) || 1,
      bonus: { ...(ageStats.bonus || {}) },
    },
    buffs: createEmptyBuffs(),
    tags: [...(unit.tags || [])],
    effects: getBaseRankingEffects(unit, unitName),
    chargeDamage: Number(ageStats.chargeDamage) || 0,
    appliedTechs: [],
    secondaryWeapon: null,
  };

  if (weaponSelection.useBoth) {
    const secondary = weaponSelection.secondary;
    const secondaryStats = weaponSelection.secondaryStats;
    if (secondary && secondaryStats) {
      unitData.secondaryWeapon = {
        name: getWeaponDisplayName(secondary),
        type: secondary.type || "melee",
        attackSpeed: Number(secondary.attackSpeed) || 1,
        range: Number(secondary.range) || 0,
        projectiles: getWeaponProjectiles(secondary),
        stats: {
          ...secondaryStats,
          attack: Number(secondaryStats.attack) || 0,
          bonus: { ...(secondaryStats.bonus || {}) },
        },
      };
    }
  }

  const availableItems = getAvailableItemMap(unitName, age, options.weaponMode || "primary");
  for (const [key, state] of activeTechMap) {
    const item = availableItems.get(key);
    if (!item) continue;
    applyTechItem(unitData, unit, item, state?.level || 0);
  }

  return unitData;
}

function simulateOneWay(attackerData, defenderData, options = {}) {
  const attacker = createTeamState({
    id: "ranking-attacker",
    side: "A",
    unitData: clonePlain(attackerData),
  });
  const defender = createTeamState({
    id: "ranking-defender",
    side: "B",
    unitData: clonePlain(defenderData),
  });

  let time = 0;
  while (attacker.units > 0 && defender.units > 0 && time < MAX_SIM_TIME) {
    const nextTime = Math.min(
      attacker.nextPrimaryAttack,
      attacker.nextSecondaryAttack,
      attacker.trampleTick,
      getNextBleedTick(defender),
      getNextPoisonTick(defender),
    );
    if (!Number.isFinite(nextTime)) break;
    if (nextTime > MAX_SIM_TIME) {
      time = MAX_SIM_TIME;
      break;
    }
    time = Math.max(time, nextTime);
    attacker.stats = applyBuffs(attacker.unitData, time);
    defender.stats = applyBuffs(defender.unitData, time);
    syncTrackedTeamState(attacker);
    syncTrackedTeamState(defender);

    collectBleedTickEvents(defender, time, EPSILON);
    collectPoisonTickEvents(defender, time, EPSILON);
    if (defender.units <= 0) break;

    const splitTargets = clampInteger(
      options.splitTargets,
      1,
      Math.max(1, defender.units, attacker.units),
      1,
    );
    const splitEnabled = splitTargets > 1;
    const attack = computeTeamAttack(attacker, defender, time, {
      splitEnabled,
      splitTargets,
      EPSILON,
    });
    if (attack.damage > 0) {
      const result = applyBundledDamageToTeam(
        defender,
        attack.damage,
        attacker.units,
        splitEnabled,
        splitTargets,
        false,
        attack.aoeTargets,
        attack.aoeFalloff,
      );
      if (attack.appliesBleed) {
        applyKipchakBleed(
          attacker,
          defender,
          time,
          splitEnabled,
          splitTargets,
          attacker.units,
        );
      }
      if (attack.appliesPoison) {
        applyPoison(
          attacker,
          defender,
          time,
          splitEnabled,
          splitTargets,
          attacker.units,
        );
      }
      applyBattleGlory(attacker, result.kills || 0);
    }
    if (attack.appliesAtkSpeedDebuff) {
      defender.atkSpeedDebuffUntil = time + attacker.unitData.effects.atkSpeedDebuff.duration;
      defender.atkSpeedDebuffReduction = attacker.unitData.effects.atkSpeedDebuff.reduction;
    }
    if (attack.appliesDamageDebuff) {
      defender.dmgDebuffUntil = time + attacker.unitData.effects.dmgDebuffOnHit.duration;
      defender.dmgDebuffReduction = attacker.unitData.effects.dmgDebuffOnHit.reduction;
    }
    if (time === 0 && attacker.nextPrimaryAttack === 0 && attacker.nextSecondaryAttack === 0) {
      break;
    }
  }

  return {
    time: Math.min(time, MAX_SIM_TIME),
    finished: defender.units <= 0,
  };
}

function getGenericTechItems(unit, age, weaponSelection = null) {
  const tags = unit.tags || [];
  if (tags.includes("Siege")) return [];
  const selectedType = weaponSelection?.weapon?.type || unit.weapons?.primary?.type || "melee";
  const attackLine = selectedType === "ranged" ? AGE_ATTACK_TECHS.ranged : AGE_ATTACK_TECHS.melee;
  const tierCount = Math.max(0, Math.min(3, age - 1));
  const items = [
    ...attackLine.slice(0, tierCount).map((name) => ({ name, category: "attack" })),
    ...AGE_MELEE_ARMOR_TECHS.slice(0, tierCount).map((name) => ({ name, category: "armor" })),
    ...AGE_RANGED_ARMOR_TECHS.slice(0, tierCount).map((name) => ({ name, category: "armor" })),
  ];
  if (age >= 4 && tags.includes("Cavalry")) {
    items.push({
      name: "Biology",
      category: "hitpoints",
      exceptCivs: ["Jin Dynasty"],
    });
  }
  if (age >= 4 && tags.includes("Infantry") && !tags.includes("Ranged")) {
    items.push({
      name: "Elite Army Tactics",
      category: "hitpoints",
      exceptCivs: ["Jin Dynasty"],
    });
    items.push({
      name: "Elite Army Tactics",
      category: "attack",
      exceptCivs: ["Jin Dynasty"],
    });
  }
  return items;
}

function getWeaponSelection(unitName, unit, age, requestedMode = "primary") {
  const primary = unit.weapons?.primary;
  const secondary = unit.weapons?.secondary;
  const primaryStats = getAgeStats(primary, age);
  const secondaryStats = getAgeStats(secondary, age);
  const hasSecondary = !!(secondary && secondaryStats);
  const supportsBoth = hasSecondary && unitSupportsBothWeapons(unitName, unit, String(age));
  const mode = requestedMode || "primary";

  if (mode === "secondary" && hasSecondary) {
    return {
      mode: "secondary",
      label: getWeaponDisplayName(secondary),
      weapon: secondary,
      ageStats: secondaryStats,
      useBoth: false,
      secondary,
      secondaryStats,
    };
  }

  if (mode === "both" && supportsBoth) {
    return {
      mode: "both",
      label: `${getWeaponDisplayName(primary)} + ${getWeaponDisplayName(secondary)}`,
      weapon: primary,
      ageStats: primaryStats,
      useBoth: true,
      secondary,
      secondaryStats,
    };
  }

  return {
    mode: "primary",
    label: getWeaponDisplayName(primary),
    weapon: primary,
    ageStats: primaryStats,
    useBoth: false,
    secondary,
    secondaryStats,
  };
}

function applyTechItem(unitData, sourceUnit, item, level = 0) {
  const key = getTechKey(item);
  const effect = TECH_EFFECTS[key];
  const parsedEffect = parseDescriptionEffect(item);
  const effectId = TECH_TO_EFFECT[item.name];
  if (effectId && sourceUnit.effects?.[effectId]) {
    unitData.effects[effectId] = clonePlain(sourceUnit.effects[effectId]);
  }
  applySpecialTechEffect(unitData, item.name);
  if (effect) applyStatEffect(unitData, effect, level);
  else if (parsedEffect) applyStatEffect(unitData, parsedEffect, level);
  unitData.appliedTechs.push({
    name: item.name,
    category: item.category,
    levelLabel: getEffectLevelLabel(effect, level),
  });
}

function applyStatEffect(unitData, effect, level = 0) {
  const attackAbs = resolveEffectValue(effect.attackAbs, level);
  const attackPct = resolveEffectValue(effect.attackPct, level);
  const hpAbs = resolveEffectValue(effect.hpAbs, level);
  const hpPct = resolveEffectValue(effect.hpPct, level);
  const speedPct = resolveEffectValue(effect.speedPct, level);
  const meleeArmor = resolveEffectValue(effect.meleeArmor, level);
  const rangedArmor = resolveEffectValue(effect.rangedArmor, level);
  if (attackAbs) unitData.stats.attack += attackAbs;
  if (attackPct) unitData.buffs.attackPct += attackPct;
  if (hpAbs) unitData.buffs.hpAbs += hpAbs;
  if (hpPct) unitData.buffs.hpPct += hpPct;
  if (speedPct) unitData.buffs.speedPct += speedPct;
  if (meleeArmor) unitData.buffs.meleeArmor += meleeArmor;
  if (rangedArmor) unitData.buffs.rangedArmor += rangedArmor;
  if (effect.bonusVs) {
    for (const [tag, value] of Object.entries(effect.bonusVs)) {
      unitData.stats.bonus[tag] = (unitData.stats.bonus[tag] || 0) + resolveEffectValue(value, level);
    }
  }
}

function applySpecialTechEffect(unitData, techName) {
  if (techName === "Quilted Armor") {
    unitData.stats.bonusDamageResistance = Math.max(
      unitData.stats.bonusDamageResistance || 0,
      50,
    );
  }
}

function isRankingTechItem(item) {
  if (!item?.name || !item?.category) return false;
  if (SIMULATED_TECH_CATEGORIES.has(item.category)) return hasRankingEffect(item);
  return !!TECH_TO_EFFECT[item.name];
}

function hasRankingEffect(item) {
  if (isGoldenHordeReinforcementTech(item)) return true;
  const effect = TECH_EFFECTS[getTechKey(item)];
  if (hasConcreteStatEffect(effect)) return true;
  if (TECH_TO_EFFECT[item.name]) return true;
  if (parseDescriptionEffect(item)) return true;
  return ["Quilted Armor"].includes(item.name);
}

function hasConcreteStatEffect(effect) {
  if (!effect) return false;
  return Object.keys(effect).some((key) => key !== "labels");
}

function isGoldenHordeReinforcementTech(item) {
  return !!item?.name && GOLDEN_HORDE_REINFORCEMENTS.has(item.name);
}

function techAvailableAtAge(item, age) {
  const minAge = getTechMinAge(item);
  return age >= minAge;
}

function getTechMinAge(item) {
  if (TECH_MIN_AGE[item.name]) return TECH_MIN_AGE[item.name];
  const img = getTechImage(item.name) || "";
  const match = img.match(/-(2|3|4)\.(?:png|webp|jpg|jpeg)$/i);
  if (match) return Number(match[1]);
  return 2;
}

function resolveEffectValue(value, level = 0) {
  if (Array.isArray(value)) return Number(value[level] ?? value[value.length - 1]) || 0;
  return Number(value) || 0;
}

function getEffectLevelLabel(effect, level) {
  if (!effect?.labels?.length) return "";
  return effect.labels[level] || effect.labels[effect.labels.length - 1] || "";
}

function parseDescriptionEffect(item) {
  const description = String(item?.description || "");
  if (!description.includes("+")) return null;
  const values = [...description.matchAll(/\+(\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (!values.length) return null;
  const value = Math.max(...values);
  const lower = description.toLowerCase();
  const hasPercent = description.includes("%");

  if (item.category === "attack") {
    return hasPercent ? { attackPct: value } : { attackAbs: value };
  }
  if (item.category === "hitpoints") {
    return hasPercent ? { hpPct: value } : { hpAbs: value };
  }
  if (item.category === "attackSpeed") {
    return hasPercent ? { speedPct: value } : null;
  }
  if (item.category === "armor") {
    const bothArmor =
      lower.includes("melee/ranged") ||
      (lower.includes("melee") && lower.includes("ranged"));
    if (bothArmor) return { meleeArmor: value, rangedArmor: value };
    if (lower.includes("melee")) return { meleeArmor: value };
    if (lower.includes("ranged")) return { rangedArmor: value };
  }
  return null;
}

function getBaseRankingEffects(unit, unitName) {
  const effects = {};
  const civ = getNaturalCiv(unitName);
  for (const [effectId, effect] of Object.entries(unit.effects || {})) {
    if (BASE_EFFECT_DENYLIST.has(effectId)) continue;
    if (effect?.civs?.length && !effect.civs.includes(civ)) continue;
    effects[effectId] = clonePlain(effect);
  }
  return effects;
}

function getAgeStats(weapon, age) {
  if (!weapon?.ages) return null;
  return weapon.ages[String(age)] || weapon.ages[age] || null;
}

function getTotalCost(unitName) {
  const unit = units[unitName];
  if (!unit?.costs) return 0;
  return Object.values(unit.costs).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function getEffectiveCostProfile(unitName, age, activeTechMap) {
  const baseCost = Math.max(0, Math.round(getTotalCost(unitName)));
  let numerator = baseCost;
  let denominator = 1;
  let adjusted = false;
  const availableItems = getAvailableItemMap(unitName, age);

  for (const [key] of activeTechMap) {
    const item = availableItems.get(key);
    if (!isGoldenHordeReinforcementTech(item)) continue;
    numerator *= GOLDEN_HORDE_REINFORCEMENT_COST_FRACTION.numerator;
    denominator *= GOLDEN_HORDE_REINFORCEMENT_COST_FRACTION.denominator;
    adjusted = true;
  }

  const divisor = gcd(Math.abs(numerator), Math.abs(denominator)) || 1;
  numerator /= divisor;
  denominator /= divisor;

  return {
    base: baseCost,
    numerator,
    denominator,
    effective: denominator ? numerator / denominator : baseCost,
    adjusted,
  };
}

function getEqualCostCounts(rankedCost, opponentCost) {
  const a = Math.max(1, Math.round(rankedCost.numerator * opponentCost.denominator));
  const b = Math.max(1, Math.round(opponentCost.numerator * rankedCost.denominator));
  const divisor = gcd(a, b);
  return {
    rankedCount: b / divisor,
    opponentCount: a / divisor,
  };
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function getUnitsForGroup(group, age, options = {}) {
  const names = Object.keys(unitIndex?.units || units || {});
  return names
    .filter((name) => getUnitCategory(name) === group)
    .filter((name) => isValidRankingUnit(name, age, options))
    .sort((a, b) => a.localeCompare(b));
}

function isValidRankingUnit(unitName, age, options = {}) {
  const unit = units[unitName];
  if (!unit || getTotalCost(unitName) <= 0) return false;
  const category = getUnitCategory(unitName);
  if (NON_COMBAT_CATEGORIES.has(category)) return false;
  const weaponSelection = getWeaponSelection(
    unitName,
    unit,
    age,
    options.weaponMode || "primary",
  );
  const ageStats = weaponSelection.ageStats;
  if (!ageStats || !(ageStats.hp > 0)) return false;
  if (options.needsAttack && !(Number(ageStats.attack) > 0)) return false;
  return true;
}

function getGroupOptions() {
  const groups = new Set(getTypeOrder());
  for (const name of Object.keys(unitIndex?.units || units || {})) {
    const category = getUnitCategory(name);
    if (category && !NON_COMBAT_CATEGORIES.has(category)) groups.add(category);
  }
  return [...groups].filter((group) => group && !NON_COMBAT_CATEGORIES.has(group));
}

function getUnitCategory(unitName) {
  const meta = getUnitMeta(unitName);
  if (meta?.category) return meta.category;
  const tags = units[unitName]?.tags || [];
  if (tags.includes("Siege")) return "Siege";
  if (tags.includes("Elephant")) return "Elephants";
  if (tags.includes("Cavalry") && tags.includes("Ranged")) return "Ranged Cavalry";
  if (tags.includes("Cavalry") && tags.includes("Heavy")) return "Heavy Cavalry";
  if (tags.includes("Cavalry")) return "Light Cavalry";
  if (tags.includes("Infantry") && tags.includes("Ranged")) return "Ranged Infantry";
  if (tags.includes("Infantry") && tags.includes("Heavy")) return "Heavy Infantry";
  if (tags.includes("Infantry")) return "Light Infantry";
  return "";
}

function getNaturalCiv(unitName) {
  const meta = getUnitMeta(unitName) || units[unitName] || {};
  const civs = meta.civs || [];
  return civs.find((civ) => civ && civ !== "Common") || "Common";
}

function unitHasCiv(unitName, civName) {
  const meta = getUnitMeta(unitName) || units[unitName] || {};
  return (meta.civs || []).includes(civName);
}

function createEmptyBuffs() {
  return {
    attackAbs: 0,
    attackAbsDur: 0,
    attackPct: 0,
    attackPctDur: 0,
    hpAbs: 0,
    hpAbsDur: 0,
    hpPct: 0,
    hpPctDur: 0,
    speedPct: 0,
    speedPctDur: 0,
    meleeArmor: 0,
    rangedArmor: 0,
    armorDur: 0,
  };
}

function renderSummary(rows, skipped) {
  if (dom.resultCount) dom.resultCount.textContent = String(rows.length);
  if (!dom.summary) return;
  const ageLabel = getAgeLabel(rankingState.age);
  const modeLabel = rankingState.mode === "tankiness" ? "Tankiness" : "Damage";
  const opponentLabel = rankingState.mode === "tankiness" ? "attacker" : "target";
  const rankedLabel = rankingState.extraUnits.length
    ? `${rankingState.group} + ${rankingState.extraUnits.length} extra / ${ageLabel}`
    : `${rankingState.group} / ${ageLabel}`;
  dom.summary.innerHTML = [
    renderSummaryCard("Mode", modeLabel),
    renderSummaryCard("Ranked", rankedLabel),
    renderSummaryCard(capitalize(opponentLabel), rankingState.opponentUnit || "None"),
    renderSummaryCard("Weapon", getWeaponModeLabel(rankingState.attackerWeaponMode)),
    renderSummaryCard("Spread", `${rankingState.targetSpread} target${rankingState.targetSpread === 1 ? "" : "s"}`),
    renderSummaryCard("Selected Bonuses", `${rankingState.rankedTechs.size} / ${rankingState.opponentTechs.size}`),
    renderSummaryCard("Skipped", `${skipped} invalid`),
  ].join("");
}

function renderSummaryCard(label, value) {
  return `<div class="ranking-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderResults(rows) {
  if (!dom.results) return;
  if (!rows.length) {
    renderEmpty("No valid units found for this group, age, and matchup.");
    return;
  }
  const bounds = getScoreBounds(rows);
  dom.results.innerHTML = `
    <div class="rankings-results-head">
      <div>
        <h2>${rankingState.mode === "tankiness" ? "Survival Ranking" : "TTK Ranking"}</h2>
        <p>${escapeHtml(getRankingSubtitle())}</p>
      </div>
      <span>${rankingState.mode === "tankiness" ? "Higher is better" : "Lower is better"}</span>
    </div>
    <div class="ranking-table">
      ${rows.map((row, index) => renderRankingRow(row, index, bounds)).join("")}
    </div>
  `;
}

function renderRankingRow(row, index, bounds) {
  const meta = getUnitMeta(row.unitName) || {};
  const selected = row.selected;
  const barPct = getBarPercent(selected.scoreSort, bounds);
  const civLabel = formatCivs(meta.civs);
  const scoreClass = rankingState.mode === "tankiness" ? "survive" : "damage";
  return `
    <article class="ranking-row-card">
      <div class="ranking-row-main">
        <div class="ranking-rank ${index < 3 ? `top-${index + 1}` : ""}">#${index + 1}</div>
        <div class="ranking-unit">
          <strong>${escapeHtml(row.unitName)}</strong>
          <span>${escapeHtml(civLabel)} ${civLabel ? " / " : ""}${escapeHtml(getUnitCategory(row.unitName))}</span>
        </div>
        <div class="ranking-score ${scoreClass}">
          <strong>${formatResultTime(selected)}</strong>
          <span>${rankingState.mode === "tankiness" ? "survival" : "TTK"}</span>
        </div>
      </div>
      <div class="ranking-bar"><span style="width:${barPct}%"></span></div>
      <div class="ranking-row-meta">
        <span>${selected.rankedCount} ${escapeHtml(row.unitName)}</span>
        <span>vs ${selected.opponentCount} ${escapeHtml(rankingState.opponentUnit)}</span>
        <span>${Math.round(selected.totalRankedCost)} res each side</span>
        <span>${escapeHtml(selected.weaponLabel || "Attack")}</span>
        ${renderCostAdjustmentMeta(selected)}
      </div>
      <details class="ranking-details">
        <summary>Applied bonuses</summary>
        <div class="ranking-applied-grid">
          <div><strong>Ranked unit</strong><small>${formatTechList(selected.rankedApplied)}</small></div>
          <div><strong>${rankingState.mode === "tankiness" ? "Attacker" : "Target"}</strong><small>${formatTechList(selected.opponentApplied)}</small></div>
        </div>
      </details>
    </article>
  `;
}

function renderCostAdjustmentMeta(result) {
  const parts = [];
  if (result.rankedCostAdjusted) {
    parts.push(`${formatNumber(result.rankedEffectiveCost)} effective res/${result.rankedCount === 1 ? "unit" : "unit"}`);
  }
  if (result.opponentCostAdjusted) {
    parts.push(`${formatNumber(result.opponentEffectiveCost)} effective target res/unit`);
  }
  if (!parts.length) return "";
  return `<span title="Golden Horde Reinforcements are modeled as a 2/3 effective cost multiplier.">${escapeHtml(parts.join(" / "))}</span>`;
}

function renderEmpty(message) {
  if (dom.resultCount) dom.resultCount.textContent = "0";
  if (dom.summary) dom.summary.innerHTML = "";
  if (dom.results) {
    dom.results.innerHTML = `<div class="ranking-empty">${escapeHtml(message)}</div>`;
  }
}

function getRankingSubtitle() {
  const action = rankingState.mode === "tankiness" ? "surviving against" : "killing";
  const extras = rankingState.extraUnits.length
    ? ` plus ${rankingState.extraUnits.join(", ")}`
    : "";
  const spread = rankingState.targetSpread > 1
    ? `, spreading attacks across up to ${rankingState.targetSpread} targets`
    : "";
  return `${rankingState.group}${extras} ranked by ${action} equal-cost ${rankingState.opponentUnit} groups with ${getWeaponModeLabel(rankingState.attackerWeaponMode).toLowerCase()}${spread}.`;
}

function getScoreBounds(rows) {
  const values = rows.map((row) => row.selected.scoreSort).filter(Number.isFinite);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getBarPercent(score, bounds) {
  if (!Number.isFinite(score) || bounds.max <= bounds.min) return 100;
  const ratio = (score - bounds.min) / (bounds.max - bounds.min);
  const normalized = rankingState.mode === "tankiness" ? ratio : 1 - ratio;
  return Math.max(18, Math.min(100, 18 + normalized * 82));
}

function getAppliesTooltip(item) {
  const names = item.rankingAppliesTo || [];
  if (!names.length) return "";
  return ` (applies to ${names.join(", ")})`;
}

function formatResultTime(result) {
  if (!result.finished) return `>${MAX_SIM_TIME}s`;
  return `${formatNumber(result.time)}s`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value >= 100) return value.toFixed(0);
  return value.toFixed(1);
}

function formatTechList(items) {
  if (!items?.length) return "none";
  const names = [...new Set(items.map((item) => item.levelLabel ? `${item.name} (${item.levelLabel})` : item.name))];
  if (names.length <= 5) return names.map(escapeHtml).join(", ");
  return `${names.slice(0, 5).map(escapeHtml).join(", ")} +${names.length - 5}`;
}

function formatCivs(civs = []) {
  const filtered = civs.filter((civ) => civ !== "Common");
  if (!filtered.length) return "Common";
  if (filtered.length <= 2) return filtered.join(" / ");
  return `${filtered.slice(0, 2).join(" / ")} +${filtered.length - 2}`;
}

function getWeaponModeLabel(mode) {
  if (mode === "secondary") return "Secondary if available";
  if (mode === "both") return "Both if supported";
  return "Primary";
}

function getAgeLabel(age) {
  return age === 2 ? "Feudal" : age === 3 ? "Castle" : "Imperial";
}

function capitalize(value) {
  return String(value || "").replace(/^./, (char) => char.toUpperCase());
}

function clampInteger(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
