// ========================================
// GLOBAL TECH / UPGRADE RULES
// ========================================
// This lets us define generic technologies (like Military Academy
// and Increased Supplies) once, instead of copying them onto every
// single unit in the JSON. Units only need their unique stuff; the
// generic techs are attached at runtime based on tags/civs.

export const GLOBAL_UPGRADE_TECHS = [
  // --- Military Academy / Increased Supplies (creation speed) ---
  {
    id: "militaryAcademy",
    name: "Military Academy",
    description:
      "+33% production speed for infantry, cavalry, siege and transport units at buildings (equivalent to -25% training time).",
    category: "creationSpeed",
    // Available to all civilizations except Ottomans (blacksmith/uni influence)
    // and Golden Horde (Increased Supplies instead).
    exceptCivs: ["Ottomans", "Golden Horde"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const relevantTags = ["Infantry", "Cavalry", "Siege", "Transport"];
      return tags.some((t) => relevantTags.includes(t));
    },
  },
  {
    id: "increasedSupplies",
    name: "Increased Supplies",
    description:
      "+50% production speed for infantry, cavalry, siege and transport units.",
    category: "creationSpeed",
    civs: ["Golden Horde"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      const relevantTags = ["Infantry", "Cavalry", "Siege", "Transport"];
      return tags.some((t) => relevantTags.includes(t));
    },
  },
  {
    id: "eliteArmyTacticsHp",
    name: "Elite Army Tactics",
    description: "+15% hit points for infantry.",
    category: "hitpoints",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
  {
    id: "eliteArmyTacticsAttack",
    name: "Elite Army Tactics",
    description: "+15% attack for infantry.",
    category: "attack",
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
  {
    id: "improvedEliteArmyTacticsHp",
    name: "Improved Elite Army Tactics",
    description: "+5% more hit points (stacks for +20% total), Mongols.",
    category: "hitpoints",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
  {
    id: "improvedEliteArmyTacticsAttack",
    name: "Improved Elite Army Tactics",
    description: "+5% more attack (stacks for +20% total), Mongols.",
    category: "attack",
    civs: ["Mongols"],
    appliesToUnit(unit) {
      const tags = unit.tags || [];
      return tags.includes("Infantry") && !tags.includes("Ranged");
    },
  },
];

// Names of techs that are driven by GLOBAL_UPGRADE_TECHS instead of per-unit copies
export const GLOBAL_UPGRADE_TECH_NAMES = new Set([
  ...GLOBAL_UPGRADE_TECHS.map((t) => t.name),
]);

export function computeGlobalUpgradesForUnit(unit) {
  const results = [];
  for (const tech of GLOBAL_UPGRADE_TECHS) {
    if (typeof tech.appliesToUnit === "function" && !tech.appliesToUnit(unit))
      continue;
    const entry = {
      name: tech.name,
      description: tech.description,
      category: tech.category,
    };
    if (tech.civs) entry.civs = [...tech.civs];
    if (tech.exceptCivs) entry.exceptCivs = [...tech.exceptCivs];
    results.push(entry);
  }
  return results;
}

export function getMergedUpgradesForUnit(unit) {
  // Drop per-unit copies of globally defined techs (by name)
  const base = (unit.upgrades || []).filter(
    (e) => !GLOBAL_UPGRADE_TECH_NAMES.has(e.name),
  );
  const derived = computeGlobalUpgradesForUnit(unit);
  return [...base, ...derived];
}

// ========================================
// TECHNOLOGIES & AURAS — clickable buff system
// ========================================

export const COMBAT_CATEGORIES = new Set([
  "attack",
  "armor",
  "hitpoints",
  "attackSpeed",
  "range",
]);

// Maps tech names to effect IDs for bidirectional sync between tech buttons and effect checkboxes
export const TECH_TO_EFFECT = {
  "Triple Shot": "tripleShot",
  "Farima Leadership": "farimaLeadership",
  "Arrow Volley": "arrowVolley",
  "Berserking": "berserking",
  "Static Deployment": "staticDeployment",
  "Ruinous Blinding": "ruinousBlinding",
  "Knightly Brotherhood": "knightlyBrotherhood",
  "Caracole": "caracole",
  "Kabura-ya Whistling Arrow": "kaburaYaWhistlingArrow",
  "Poisoned Arrows": "poisonedArrows",
  "Numeri": "numeri",
  "Triumph": "triumph",
};

// Inverse mapping: effectId → techName (for rendering tech buttons in effects)
export const EFFECT_TO_TECH = {};
for (const [techName, effectId] of Object.entries(TECH_TO_EFFECT)) {
  EFFECT_TO_TECH[effectId] = techName;
}

// Hardcoded map: "TechName|category" → buff effects
// Fields: attackAbs, meleeArmor, rangedArmor, hpAbs, hpPct, attackPct, speedPct
// Arrays = variable-level techs with labels
export const TECH_EFFECTS = {
  // === ATTACK (blacksmith line & civ) ===
  "Bloomery|attack": { attackAbs: 1 },
  "Decarbonization|attack": { attackAbs: 1 },
  "Damascus Steel|attack": { attackAbs: 1 },
  "Steeled Arrow|attack": { attackAbs: 1 },
  "Balanced Projectiles|attack": { attackAbs: 1 },
  "Platecutter Point|attack": { attackAbs: 1 },
  "Tatara|attack": { attackAbs: 1 },
  "Hizukuri|attack": { attackAbs: 1 },
  "Kobuse-gitae|attack": { attackAbs: 1 },
  "Yaki-ire|attack": { attackAbs: 1 },
  "Higoyumi|attack": { attackAbs: 1 },
  "Runestones|attack": { attackAbs: 1 },
  "Enlist Mansa Musofadi|attack": { attackAbs: 1 },
  "Two-Handed Weapons|attack": { attackAbs: 2 },
  "Awl Pikes|attack": { attackAbs: 2 },
  "Precision Training|attack": { attackAbs: 2 },
  "Cranequins|attack": { attackAbs: 2 },
  "Throwing Dagger Drills|attack": { attackAbs: 2 },
  "Honed Blades|attack": { attackAbs: 3 },
  "Heavy Maces|attack": { bonusVs: { "Heavy": 6 } },
  "Knight Poleaxes|attack": { attackAbs: 4 },
  "Janissary Guns|attack": { attackAbs: 4 },
  "Collar of Esses|attack": { bonusVs: { "Heavy": 5 } },
  "Rhomphaia|attack": { bonusVs: { "Light Infantry": 3 } },
  "Serpentine Powder|attack": { bonusVs: { "Melee Infantry": 5 } },
  "Bodkin Bolts|attack": { attackAbs: 20 },
  "Bolt Magazines|attack": { attackAbs: 1 },

  // Pattern Welding / Blade Inlaying / Sharpening Stones (tiered, Macedonian Dynasty)
  "Blade Inlaying|attack": {
    attackAbs: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1)", "Tier 2 (+2)", "Tier 3 (+3)", "Tier 4 (+4)", "Tier 5 (+5)", "Tier 6 (+6)"],
  },
  "Pattern Welding|attack": {
    attackAbs: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1)", "Tier 2 (+2)", "Tier 3 (+3)", "Tier 4 (+4)", "Tier 5 (+5)", "Tier 6 (+6)"],
  },
  "Sharpening Stones|attack": {
    attackAbs: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1)", "Tier 2 (+2)", "Tier 3 (+3)", "Tier 4 (+4)", "Tier 5 (+5)", "Tier 6 (+6)"],
  },

  // Percentage attack buffs
  "Incendiary Arrows|attack": { attackPct: 20 },
  "Fanaticism|attack": {
    attackPct: [10, 30],
    labels: ["Below 50% HP (+10%)", "Below 25% HP (+30%)"],
  },
  "Elite Army Tactics|attack": { attackPct: 15 },
  "Improved Elite Army Tactics|attack": { attackPct: 5 },
  "Inspiration Bonus|attack": { attackPct: 15 },
  "Khan Warcry|attack": {
    attackPct: [10, 20, 30],
    labels: ["Low Charge (+10%)", "Mid Charge (+20%)", "High Charge (+30%)"],
  },
  "Oda Tactics|attack": { attackPct: 15 },
  "Hippodrome Scout Aura|attack": { attackPct: 25 },
  "Hippodrome Horseman Aura|attack": { attackAbs: 2 },
  "Military Tactics Training|attack": { attackPct: 20 },
  "Collateral Damage|attack": { attackPct: 30 },
  "Neza Training|attack": { attackPct: 35 },
  "Khanda Drills|attack": { attackPct: 100 },

  // Charge-related attack buffs (mapped to attackAbs as bonus)
  // Cantled Saddles is a charge-duration buff, not permanent flat attack — not modeled here
  "Odachi|attack": { bonusVs: { "Infantry": 4 } },
  "Improved Yari|attack": { bonusVs: { "Cavalry": 2 } },
  "Mounted Samurai Odachi|attack": { bonusVs: { "Infantry": 4 } },
  "Lightweight Blades|attack": {},  // +5 vs workers — no Workers tag in battler
  "Nagae Yari|attack": { attackPct: 15 },
  "Siha Bow Limbs|attack": { attackAbs: [1, 2], labels: ["Standard (+1)", "Improved (+2)"] },
  "Poisoned Arrows|attack": {},
  "Enlist Mansa Javelineers|attack": { attackAbs: 3 },

  // Saint's Blessing attack
  "Saint's Blessing|attack": {
    attackAbs: [2, 3],
    labels: ["Standard (+2)", "With Fervor (+3)"],
  },

  // === ARMOR ===
  "Fitted Leatherwork|armor": { meleeArmor: 1 },
  "Insulated Helm|armor": { meleeArmor: 1 },
  "Master Smiths|armor": { meleeArmor: 1 },
  "Iron Undermesh|armor": { rangedArmor: 1 },
  "Wedge Rivets|armor": { rangedArmor: 1 },
  "Angled Surfaces|armor": { rangedArmor: 1 },
  "Armor Clad|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Steel Barding|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Brigandine|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Imported Armor|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Battlefield Salvage|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Camel Rider Barding|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Camel Rider Shields|armor": { meleeArmor: 3 },
  "Camel Support|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Gambesons|armor": { meleeArmor: 5 },
  "Infantry Support|armor": { meleeArmor: 3, rangedArmor: 3 },
  "Inspiration Bonus|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Saint's Blessing|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Kharash Aura|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Teardrop Shields|armor": { meleeArmor: 1, rangedArmor: 1 },
  "Padded Armor|armor": { meleeArmor: 2, rangedArmor: 2 },
  "Padded Jack|armor": { meleeArmor: 3 },
  "Armored Beasts|armor": { rangedArmor: 4 },
  "Howdahs|armor": { rangedArmor: 4 },
  "Scale Armor|armor": { rangedArmor: 3 },
  "Muscovy Yasak|armor": { rangedArmor: 2 },
  "Cross Folded Armor|armor": { rangedArmor: 2 },

  // Tiered armor (Macedonian Dynasty)
  "Butted Chainmail|armor": {
    meleeArmor: [1, 2, 3, 4, 5, 6],
    rangedArmor: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1/+1)", "Tier 2 (+2/+2)", "Tier 3 (+3/+3)", "Tier 4 (+4/+4)", "Tier 5 (+5/+5)", "Tier 6 (+6/+6)"],
  },
  "Lamellar Armor|armor": {
    meleeArmor: [1, 2, 3, 4, 5, 6],
    rangedArmor: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1/+1)", "Tier 2 (+2/+2)", "Tier 3 (+3/+3)", "Tier 4 (+4/+4)", "Tier 5 (+5/+5)", "Tier 6 (+6/+6)"],
  },
  "Scale Barding|armor": {
    meleeArmor: [1, 2, 3, 4, 5, 6],
    rangedArmor: [1, 2, 3, 4, 5, 6],
    labels: ["Tier 1 (+1/+1)", "Tier 2 (+2/+2)", "Tier 3 (+3/+3)", "Tier 4 (+4/+4)", "Tier 5 (+5/+5)", "Tier 6 (+6/+6)"],
  },

  // === HITPOINTS ===
  "Biology|hitpoints": { hpPct: 25 },
  "Biology Improved|hitpoints": { hpPct: 35 },
  "Royal Bloodlines|hitpoints": { hpPct: 35 },
  "Battle Hardened|hitpoints": { hpAbs: 30 },
  "Boyar's Fortitude|hitpoints": { hpAbs: 25 },
  "Piety|hitpoints": { hpAbs: 40 },
  "Boot Camp|hitpoints": { hpAbs: 15 },
  "Armored Beasts|hitpoints": { hpPct: 20 },
  "Howdahs|hitpoints": { hpPct: 25 },
  "Oda Tactics|hitpoints": { hpPct: 15 },
  "Elite Army Tactics|hitpoints": { hpPct: 15 },
  "Improved Elite Army Tactics|hitpoints": { hpPct: 5 },
  "Battlefield Salvage|hitpoints": { hpAbs: 25 },
  "Padded Armor|hitpoints": { hpAbs: 20 },
  "Khan and Torguuds|hitpoints": { hpAbs: 30 },
  "Enlist Mansa Musofadi|hitpoints": { hpAbs: 10 },
  "Defensive Aura Edict|hitpoints": { hpPct: 10 },

  // Tiered HP (Macedonian Dynasty)
  "Butted Chainmail|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: ["Tier 1 (+5%)", "Tier 2 (+10%)", "Tier 3 (+15%)", "Tier 4 (+20%)", "Tier 5 (+25%)", "Tier 6 (+30%)"],
  },
  "Lamellar Armor|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: ["Tier 1 (+5%)", "Tier 2 (+10%)", "Tier 3 (+15%)", "Tier 4 (+20%)", "Tier 5 (+25%)", "Tier 6 (+30%)"],
  },
  "Scale Barding|hitpoints": {
    hpPct: [5, 10, 15, 20, 25, 30],
    labels: ["Tier 1 (+5%)", "Tier 2 (+10%)", "Tier 3 (+15%)", "Tier 4 (+20%)", "Tier 5 (+25%)", "Tier 6 (+30%)"],
  },

  // === ATTACK SPEED ===
  "Composite Bows|attackSpeed": { speedPct: 33 },
  "Crossbow Stirrups|attackSpeed": { speedPct: 25 },
  "Dali Horses|attackSpeed": { speedPct: 20 },
  "Teardrop Shields|attackSpeed": { speedPct: 15 },
  "Mehter Attack Drums|attackSpeed": { speedPct: 15 },
  "Golden Age: Tier 5|attackSpeed": { speedPct: 20 },
  "Network of Castles|attackSpeed": {
    speedPct: [20, 30],
    labels: ["Network of Castles (+20%)", "Network of Citadels (+30%)"],
  },
  "Static Deployment|attackSpeed": { speedPct: 30 },
  "Tower of Victory|attackSpeed": { speedPct: 20 },
  "Zeal|attackSpeed": { speedPct: 50 },
  "Steppe Lancers|attackSpeed": {
    speedPct: [10, 15],
    labels: ["Standard (+10%)", "Improved (+15%)"],
  },
  "Sarai Lancers|attackSpeed": { speedPct: 10 },
  "3 units|attackSpeed": {},
  "Khan and Torguuds|attackSpeed": { speedPct: -20 },
  // Stone Armies is a cost/training unlock, not attack speed — not modeled here
  "Stronger Together|attackSpeed": { speedPct: 5 },

  // === RANGE ===
  "Bolt Magazines|range": {},
  "Cranequins|range": {},
  "Mounted Training|range": {},
  "Paiks|range": {},
  "Phalanx|range": {},
  "Pyrotechnics|range": {},
  "Silk Bowstrings|range": {},
  "Runestones|range": {},
  "Nagae Yari|range": {},
  "Wall Defense|range": {},

  // === ARMOR (buff field: melee armor drums) ===
  "Mehter Melee Armor Drums|armor": { meleeArmor: 2 },
  "Mehter Ranged Armor Drums|armor": { rangedArmor: 1 },

  // === EFFECT-LINKED TECHS (toggled via effects system, not stat buffs) ===
  "Triple Shot|range": {},
  "Arrow Volley|ability": {},
  "Arrow Volley|attackSpeed": {},
  "Berserking|attack": {},
  "Berserking|moveSpeed": {},
  "Farima Leadership|ability": {},
  "Farima Leadership|moveSpeed": {},
  "Ruinous Blinding|ability": {},
  "Knightly Brotherhood|hitpoints": {},
  "Caracole|moveSpeed": {},
  "Caracole|other": {},
  "Kabura-ya Whistling Arrow|ability": {},
  "Hard Cased Bombs|ability": {},
  "Numeri|ability": {},
  "Triumph|hitpoints": {},
  "Triumph|attack": {},
  "Triumph|moveSpeed": {},
};

// Image map: tech name → image path (relative to app root)
export const TECH_IMAGE_MAP = {
  "Bloomery": "assets/images/technologies/bloomery-2.png",
  "Decarbonization": "assets/images/technologies/decarbonization-3.png",
  "Damascus Steel": "assets/images/technologies/damascus-steel-4.png",
  "Steeled Arrow": "assets/images/technologies/steeled-arrow-2.png",
  "Balanced Projectiles": "assets/images/technologies/balanced-projectiles-3.png",
  "Platecutter Point": "assets/images/technologies/platecutter-point-4.png",
  "Fitted Leatherwork": "assets/images/technologies/fitted-leatherwork-2.png",
  "Insulated Helm": "assets/images/technologies/insulated-helm-3.png",
  "Master Smiths": "assets/images/technologies/master-smiths-4.png",
  "Iron Undermesh": "assets/images/technologies/iron-undermesh-2.png",
  "Wedge Rivets": "assets/images/technologies/wedge-rivets-3.png",
  "Angled Surfaces": "assets/images/technologies/angled-surfaces-4.png",
  "Biology": "assets/images/technologies/biology-4.png",
  "Biology Improved": "assets/images/technologies/biology-improved-4.png",
  "Royal Bloodlines": "assets/images/technologies/royal-bloodlines-3.png",
  "Battle Hardened": "assets/images/technologies/battle-hardened-4.png",
  "Boyar's Fortitude": "assets/images/technologies/boyars-fortitude-3.png",
  "Piety": "assets/images/technologies/piety-4.png",
  "Boot Camp": "assets/images/technologies/boot-camp-2.png",
  "Armor Clad": "assets/images/technologies/armor-clad-3.png",
  "Steel Barding": "assets/images/technologies/steel-barding-3.png",
  "Brigandine": "assets/images/technologies/brigandine-4.png",
  "Imported Armor": "assets/images/technologies/imported-armor-3.png",
  "Gambesons": "assets/images/technologies/gambesons-3.png",
  "Composite Bows": "assets/images/technologies/composite-bows-3.png",
  "Crossbow Stirrups": "assets/images/technologies/crossbow-stirrups-3.png",
  "Incendiary Arrows": "assets/images/technologies/incendiary-arrows-4.png",
  "Two-Handed Weapons": "assets/images/technologies/two-handed-weapons-3.png",
  "Awl Pikes": "assets/images/technologies/awl-pikes-2.png",
  "Heavy Maces": "assets/images/technologies/heavy-maces-3.png",
  "Knight Poleaxes": "assets/images/technologies/knight-poleaxes-4.png",
  "Honed Blades": "assets/images/technologies/honed-blades-3.png",
  "Precision Training": "assets/images/technologies/precision-training-4.png",
  "Janissary Guns": "assets/images/technologies/janissary-guns-4.png",
  "Cantled Saddles": "assets/images/technologies/cantled-saddles-3.png",
  "Odachi": "assets/images/technologies/odachi-3.png",
  "Improved Yari": "assets/images/technologies/improved-yari-1.png",
  "Scale Armor": "assets/images/technologies/scale-armor-3.png",
  "Camel Rider Barding": "assets/images/technologies/camel-rider-barding-4.png",
  "Camel Rider Shields": "assets/images/technologies/camel-rider-shields-3.png",
  "Camel Support": "assets/images/technologies/camel-support-4.png",
  "Infantry Support": "assets/images/technologies/infantry-support-4.png",
  "Battlefield Salvage": "assets/images/technologies/battlefield-salvage-3.png",
  "Howdahs": "assets/images/technologies/howdahs-4.png",
  "Armored Beasts": "assets/images/technologies/armored-beasts-4.png",
  "Bodkin Bolts": "assets/images/technologies/bodkin-bolts-4.png",
  "Bolt Magazines": "assets/images/technologies/bolt-magazines-3.png",
  "Tatara": "assets/images/technologies/tatara-1.png",
  "Hizukuri": "assets/images/technologies/hizukuri-2.png",
  "Kobuse-gitae": "assets/images/technologies/kobuse-gitae-3.png",
  "Yaki-ire": "assets/images/technologies/yaki-ire-4.png",
  "Higoyumi": "assets/images/technologies/higoyumi-1.png",
  "Runestones": "assets/images/technologies/inspired-warriors-3.png",
  "Dali Horses": "assets/images/technologies/dali-horses-2.png",
  "Pyrotechnics": "assets/images/technologies/pyrotechnics-4.png",
  "Paiks": "assets/images/technologies/paiks-3.png",
  "Phalanx": "assets/images/technologies/phalanx-2.png",
  "Silk Bowstrings": "assets/images/technologies/silk-bowstrings-4.png",
  "Mounted Training": "assets/images/technologies/mounted-training-4.png",
  "Rhomphaia": "assets/images/technologies/rhomphaia-3.png",
  "Serpentine Powder": "assets/images/technologies/serpentine-powder-4.png",
  "Collar of Esses": "assets/images/technologies/collar-of-esses-3.png",
  "Cranequins": "assets/images/technologies/cranequins-4.png",
  "Throwing Dagger Drills": "assets/images/technologies/throwing-dagger-drills-4.png",
  "Nagae Yari": "assets/images/technologies/nagae-yari-4.png",
  "Poisoned Arrows": "assets/images/technologies/poisoned-arrows-3.png",
  "Hard Cased Bombs": "assets/images/technologies/hard-cased-bombs-3.png",
  "Padded Armor": "assets/images/technologies/padded-armor-3.png",
  "Padded Jack": "assets/images/technologies/padded-jack-4.png",
  "Muscovy Yasak": "assets/images/technologies/muscovy-yasak-2.png",
  "Cross Folded Armor": "assets/images/technologies/cross-folded-armor-1.png",
  "Mounted Samurai Odachi": "assets/images/technologies/mounted-samurai-odachi-3.png",
  "Lightweight Blades": "assets/images/technologies/lightweight-blades-1.png",
  "Neza Training": "assets/images/technologies/neza-training-3.png",
  "Collateral Damage": "assets/images/technologies/collateral-damage-3.png",
  "Khanda Drills": "assets/images/technologies/khanda-drills-3.png",
  "Military Tactics Training": "assets/images/technologies/military-tactics-training-3.png",
  "Blade Inlaying": "assets/images/technologies/blade-inlaying-tier1-2.png",
  "Pattern Welding": "assets/images/technologies/pattern-welding-tier1-2.png",
  "Sharpening Stones": "assets/images/technologies/sharpening-stones-tier1-2.png",
  "Butted Chainmail": "assets/images/technologies/butted-chainmail-tier1-2.png",
  "Lamellar Armor": "assets/images/technologies/lamellar-armor-tier1-2.png",
  "Scale Barding": "assets/images/technologies/scale-barding-tier1-2.png",
  "Teardrop Shields": "assets/images/technologies/teardrop-shields-3.png",
  "Static Deployment": "assets/images/abilities/ability-static-deployment-1.png",
  "Fanaticism": "assets/images/technologies/fanaticism-4.png",
  "Elite Army Tactics": "assets/images/technologies/elite-army-tactics-4.png",
  "Oda Tactics": "assets/images/technologies/oda-tactics-4.png",
  "Khan Warcry": "assets/images/technologies/khan-debuff-arrow-2.png",
  "Zeal": "assets/images/technologies/zeal-4.png",
  "Golden Age: Tier 5": "assets/images/abilities/ability-golden-age-tier-5.png",
  "Network of Castles": "assets/images/abilities/ability-network-of-castles-1.png",
  "Mehter Attack Drums": "assets/images/technologies/mehter-drums-1.png",
  "Mehter Melee Armor Drums": "assets/images/technologies/mehter-drums-1.png",
  "Mehter Ranged Armor Drums": "assets/images/technologies/mehter-drums-1.png",
  "Tower of Victory": "assets/images/abilities/ability-tower-of-victory-aura-1.png",
  "Sarai Lancers": "assets/images/technologies/sarai-lancers-3.png",
  "Steppe Lancers": "assets/images/technologies/steppe-lancers-3.png",
  "Stone Armies": "assets/images/technologies/stone-armies-3.png",
  "Stronger Together": "assets/images/technologies/inspired-warriors-3.png",
  "Khan and Torguuds": "assets/images/technologies/khan-and-torguuds-1.png",
  "Defensive Aura Edict": "assets/images/abilities/ability-defensive-aura-edict-1.png",
  "Hippodrome Scout Aura": "assets/images/technologies/horse-training-1.png",
  "Inspiration Bonus": "assets/images/abilities/ability-inspired-1.png",
  "Saint's Blessing": "assets/images/abilities/ability-saints-blessing-1.png",
  "Kharash Aura": "assets/images/abilities/ability-kharash-edict-4.png",
  "Enlist Mansa Musofadi": "assets/images/technologies/farima-leadership-4.png",
  "Enlist Mansa Javelineers": "assets/images/technologies/poisoned-arrows-3.png",
  "Glorious Charge": "assets/images/technologies/glorious-charge-3.png",
  "Golden Cuirass": "assets/images/technologies/golden-cuirass-2.png",
  "Heavy Torches": "assets/images/technologies/heavy-torches-2.png",
  "Wall Defense": "assets/images/technologies/village-fortresses-3.png",
  "Hill Training": "assets/images/technologies/hill-training-3.png",
  "Improved Torch": "assets/images/abilities/ability-improved-torch-1.png",
  "3 units": "assets/images/technologies/siege-crews-1.png",
  // Non-combat but shown greyed
  "Horse Training": "assets/images/technologies/horse-training-1.png",
  "Mahouts": "assets/images/technologies/mahouts-3.png",
  "Camel Handling": "assets/images/technologies/camel-handling-3.png",
  "Herbal Medicine": "assets/images/technologies/herbal-medicine-3.png",
  "Arrow Volley": "assets/images/technologies/arrow-volley-4.png",
  "Forced March": "assets/images/technologies/forced-march-3.png",
  "Siege Engineering": "assets/images/technologies/siege-engineering-2.png",
  "Siha Bow Limbs": "assets/images/technologies/siha-bow-limbs-3.png",
  "Samurai Bow": "assets/images/technologies/samurai-bow-1.png",
  "Chivalry": "assets/images/technologies/chivalry-3.png",
  "Triple Shot": "assets/images/technologies/triple-shot-3.png",
  "Kabura-ya Whistling Arrow": "assets/images/technologies/kabura-ya-whistling-arrow-3.png",
  "Farima Leadership": "assets/images/technologies/farima-leadership-4.png",
  "Do-maru Armor": "assets/images/technologies/do-maru-armor-4.png",
  "Ferocious Speed": "assets/images/technologies/ferocious-speed-4.png",
  "Elephant Caretakers": "assets/images/technologies/elephant-caretakers-2.png",
  "Local Knowledge": "assets/images/technologies/local-knowledge-2.png",
  "Hippodrome Horseman Aura": "assets/images/units/hippodrome-horseman-1.png",
  "Numeri": "assets/images/technologies/numeri-4.png",
  "Triumph": "assets/images/abilities/ability-triumph-1.png",
};

export const FALLBACK_TECH_IMG = "assets/images/technologies/upgrades.png";

// Per-side state: Map<techKey, { level: number }>
const activeTechs = { A: new Map(), B: new Map() };
// Track which unit is currently loaded per side (to reset on unit change)
const techUnitTracker = { A: "", B: "" };

export function getTechKey(item) {
  return `${item.name}|${item.category}`;
}

export function getTechImage(name) {
  return TECH_IMAGE_MAP[name] || FALLBACK_TECH_IMG;
}

export function isCombatCategory(category) {
  return COMBAT_CATEGORIES.has(category);
}

export function filterTechByCiv(item, selectedCiv) {
  if (!selectedCiv) return true;
  if (item.exceptCivs && item.exceptCivs.includes(selectedCiv)) return false;
  if (item.civs && item.civs.length > 0) {
    return item.civs.includes(selectedCiv) || item.civs.includes("Common");
  }
  return true;
}
