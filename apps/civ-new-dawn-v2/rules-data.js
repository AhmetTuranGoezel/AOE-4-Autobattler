"use strict";

// Terra Incognita data surface for the v2 game.
// Tile cells follow Game.TILE_OFFSETS order:
// row0 col0-3, row1 col0-3, row2 col2-3, with row1 col1 as anchor.
(function () {
  const TILE_OFFSETS = [
    { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
    { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
    { q: 1, r: 1 }, { q: 2, r: 1 }
  ];

  function cells(terrains, features) {
    return terrains.map((terrain, i) => Object.assign({ terrain }, features && features[i] ? features[i] : {}));
  }

  function tile(id, kind, aTerrains, bTerrains, aFeatures, bFeatures) {
    return {
      id,
      kind,
      sides: {
        A: { cells: cells(aTerrains, aFeatures) },
        B: { cells: cells(bTerrains, bFeatures) }
      }
    };
  }

  const TILES = [
    tile("01", "capital",
      ["grass","hill","grass","forest","grass","grass","hill","desert","forest","mountain"],
      ["hill","grass","forest","grass","desert","grass","grass","hill","mountain","forest"],
      { 6: { feature: "capital" }, 2: { resource: "marble" } },
      { 6: { feature: "capital" }, 4: { barbarian: "A" } }),
    tile("02", "capital",
      ["grass","forest","hill","grass","hill","grass","grass","mountain","desert","forest"],
      ["forest","grass","desert","hill","grass","hill","grass","forest","mountain","grass"],
      { 6: { feature: "capital" }, 8: { resource: "diamonds" } },
      { 6: { feature: "capital" }, 1: { resource: "mercury" } }),
    tile("03", "capital",
      ["desert","grass","hill","forest","grass","grass","hill","grass","mountain","desert"],
      ["grass","hill","forest","desert","forest","grass","grass","hill","desert","mountain"],
      { 6: { feature: "capital" }, 0: { barbarian: "B" } },
      { 6: { feature: "capital" }, 9: { resource: "oil" } }),
    tile("04", "capital",
      ["forest","hill","grass","grass","desert","grass","grass","forest","hill","mountain"],
      ["grass","grass","hill","mountain","forest","grass","desert","hill","grass","forest"],
      { 6: { feature: "capital" }, 3: { resource: "marble" } },
      { 6: { feature: "capital" }, 8: { barbarian: "C" } }),
    tile("05", "capital",
      ["hill","grass","forest","desert","grass","grass","hill","forest","mountain","grass"],
      ["desert","forest","grass","hill","grass","hill","grass","mountain","forest","grass"],
      { 6: { feature: "capital" }, 9: { resource: "mercury" } },
      { 6: { feature: "capital" }, 2: { resource: "diamonds" } }),

    tile("06", "citystate",
      ["grass","hill","forest","grass","desert","grass","hill","forest","mountain","grass"],
      ["forest","grass","hill","desert","grass","forest","grass","mountain","hill","grass"],
      { 5: { cityState: "Carthage" }, 1: { barbarian: "D" } },
      { 5: { cityState: "Kumasi" }, 8: { resource: "marble" } }),
    tile("07", "citystate",
      ["hill","grass","desert","forest","grass","hill","grass","mountain","forest","desert"],
      ["grass","forest","hill","grass","mountain","desert","grass","hill","forest","grass"],
      { 5: { cityState: "Brussels" }, 9: { resource: "oil" } },
      { 5: { cityState: "Seoul" }, 0: { barbarian: "E" } }),
    tile("08", "citystate",
      ["forest","hill","grass","mountain","grass","desert","grass","forest","hill","grass"],
      ["desert","grass","forest","hill","grass","mountain","grass","desert","forest","hill"],
      { 5: { cityState: "Buenos Aires" }, 7: { barbarian: "F" } },
      { 5: { cityState: "Kabul" }, 2: { resource: "diamonds" } }),
    tile("09", "citystate",
      ["grass","desert","hill","forest","mountain","grass","hill","grass","forest","desert"],
      ["hill","forest","grass","desert","grass","mountain","forest","grass","hill","grass"],
      { 5: { cityState: "Geneva" }, 3: { resource: "mercury" } },
      { 5: { cityState: "Mohenjo Daro" }, 9: { barbarian: "G" } }),
    tile("10", "citystate",
      ["forest","grass","mountain","hill","grass","desert","forest","grass","hill","grass"],
      ["grass","hill","desert","forest","mountain","grass","hill","forest","grass","desert"],
      { 5: { cityState: "Auckland" }, 0: { resource: "oil" } },
      { 5: { cityState: "Akkad" }, 8: { resource: "marble" } }),

    tile("11", "natural",
      ["mountain","hill","grass","forest","grass","desert","hill","grass","forest","mountain"],
      ["forest","grass","hill","mountain","desert","grass","forest","hill","grass","mountain"],
      { 5: { naturalWonder: "Galapagos Islands" }, 2: { barbarian: "H" } },
      { 5: { naturalWonder: "Grand Mesa" }, 9: { resource: "diamonds" } }),
    tile("12", "natural",
      ["desert","grass","forest","hill","mountain","grass","desert","forest","hill","grass"],
      ["grass","mountain","hill","forest","grass","desert","hill","grass","mountain","forest"],
      { 5: { naturalWonder: "Dead Sea" }, 0: { resource: "mercury" } },
      { 5: { naturalWonder: "Mount Everest" }, 7: { barbarian: "I" } }),
    tile("13", "natural",
      ["forest","hill","grass","desert","mountain","grass","forest","hill","grass","desert"],
      ["hill","grass","mountain","forest","desert","grass","hill","forest","grass","mountain"],
      { 5: { naturalWonder: "Pantanal" }, 3: { resource: "oil" } },
      { 5: { naturalWonder: "Torres del Paine" }, 1: { barbarian: "J" } }),

    tile("14", "normal",
      ["grass","hill","forest","desert","grass","mountain","hill","grass","forest","desert"],
      ["desert","forest","grass","hill","mountain","grass","desert","hill","forest","grass"],
      { 1: { resource: "marble" }, 7: { barbarian: "K" } },
      { 4: { resource: "oil" }, 8: { barbarian: "L" } }),
    tile("15", "normal",
      ["forest","grass","hill","grass","desert","mountain","forest","hill","grass","desert"],
      ["hill","desert","forest","grass","grass","mountain","hill","forest","desert","grass"],
      { 2: { resource: "diamonds" }, 9: { barbarian: "M" } },
      { 0: { resource: "mercury" }, 6: { barbarian: "N" } }),
    tile("16", "normal",
      ["grass","desert","hill","forest","mountain","grass","forest","hill","desert","grass"],
      ["forest","hill","grass","mountain","desert","grass","hill","forest","grass","desert"],
      { 4: { barbarian: "O" }, 6: { resource: "oil" } },
      { 2: { resource: "marble" }, 9: { barbarian: "P" } }),

    tile("TI01", "citystate",
      ["grass","forest","hill","desert","mountain","grass","hill","forest","desert","grass"],
      ["hill","grass","desert","forest","grass","mountain","forest","hill","grass","desert"],
      { 5: { cityState: "Antananarivo" }, 1: { resource: "diamonds" } },
      { 5: { cityState: "Palenque" }, 7: { barbarian: "Q" } }),
    tile("TI02", "natural",
      ["mountain","forest","grass","hill","desert","grass","mountain","forest","hill","grass"],
      ["desert","grass","hill","mountain","forest","grass","desert","hill","forest","mountain"],
      { 5: { naturalWonder: "Ha Long Bay" }, 8: { resource: "mercury" } },
      { 5: { naturalWonder: "Uluru" }, 3: { barbarian: "R" } }),
    tile("TI03", "normal",
      ["grass","water","hill","forest","grass","desert","water","mountain","forest","grass"],
      ["forest","grass","water","hill","desert","grass","mountain","water","hill","forest"],
      { 0: { resource: "oil" }, 8: { barbarian: "S" } },
      { 3: { resource: "diamonds" }, 6: { barbarian: "T" } }),
    tile("TI04", "normal",
      ["water","grass","forest","hill","desert","grass","mountain","forest","grass","water"],
      ["grass","hill","water","forest","mountain","desert","grass","hill","water","forest"],
      { 2: { resource: "marble" }, 5: { barbarian: "U" } },
      { 1: { resource: "oil" }, 9: { barbarian: "V" } }),
    tile("TI05", "normal",
      ["forest","desert","grass","water","hill","grass","mountain","forest","desert","grass"],
      ["grass","mountain","forest","desert","water","hill","grass","forest","hill","water"],
      { 4: { resource: "mercury" }, 7: { barbarian: "W" } },
      { 2: { resource: "marble" }, 8: { barbarian: "X" } })
  ];

  const CARD_DEFS = {
    culture: {
      1: { name: "Early Empire", markers: 2 },
      2: { name: "Drama and Poetry", markers: 2, effect: "move_control" },
      3: { name: "Civil Service", markers: 2, effect: "extra_control" },
      4: { name: "Mass Media", markers: 3, effect: "replace_rival" }
    },
    growth: {
      1: { name: "Irrigation" },
      2: { name: "Engineering", effect: "control_near_district" },
      3: { name: "Sanitation", effect: "extra_reinforce" },
      4: { name: "Globalization", effect: "global_district" }
    },
    science: {
      1: { name: "Astrology" },
      2: { name: "Mathematics", effect: "bonus_trade" },
      3: { name: "Replaceable Parts", effect: "bonus_resource" },
      4: { name: "Nuclear Power", effect: "nuke" }
    },
    economy: {
      1: { name: "Foreign Trade", move: 3, caravans: 1 },
      2: { name: "Currency", move: 4, caravans: 2, effect: "remove_barbarian" },
      3: { name: "Steam Power", move: 6, caravans: 2, water: true, effect: "exchange_resource" },
      4: { name: "Capitalism", move: 6, caravans: 3, water: true, effect: "resolve_extra" }
    },
    military: {
      1: { name: "Masonry", move: 3, armies: 1, combat: 0 },
      2: { name: "Iron Working", move: 4, armies: 2, combat: 0, vsBarbarian: 2 },
      3: { name: "Mass Production", move: 5, armies: 2, combat: 2, water: true },
      4: { name: "Flight", move: 6, armies: 2, combat: 3, water: true }
    },
    industry: {
      1: { name: "Pottery", cityRange: 2 },
      2: { name: "Animal Husbandry", cityRange: 3, effect: "build_on_unit" },
      3: { name: "Nationalism", cityRange: 4, water: true, wonderSlot5Production: 7 },
      4: { name: "Urbanization", cityRange: 5, water: true, effect: "control_after_city" }
    }
  };

  const WONDER_DECKS = {
    military: [
      { name: "Jebel Barkal", era: "ancient", cost: 7, effect: "Spend resources for +2 combat each." },
      { name: "Petra", era: "ancient", cost: 7, effect: "+2 defense; barbarians cannot enter protected spaces." },
      { name: "Terracotta Army", era: "ancient", cost: 7, effect: "+2 attack combat value." },
      { name: "Huey Teocalli", era: "medieval", cost: 9, effect: "+1 defense per adjacent water." },
      { name: "Venetian Arsenal", era: "medieval", cost: 10, effect: "Resolve slot 5 again as slot 1." },
      { name: "Alhambra", era: "medieval", cost: 10, effect: "+2 attack and defense." },
      { name: "Ruhr Valley", era: "modern", cost: 11, effect: "+5 defense combat value." },
      { name: "Statue of Liberty", era: "modern", cost: 12, effect: "Replace adjacent rival control before city capture." }
    ],
    culture: [
      { name: "Stonehenge", era: "ancient", cost: 7, effect: "Hill control chain placement." },
      { name: "Hanging Gardens", era: "ancient", cost: 8, effect: "Start of turn: place one control near a city." },
      { name: "Colosseum", era: "ancient", cost: 9, effect: "Start of turn: reinforce one control near a city." },
      { name: "Taj Mahal", era: "medieval", cost: 9, effect: "Resolve focus cards farther right by matching wonders." },
      { name: "Forbidden City", era: "medieval", cost: 9, effect: "Start of turn: remove rival control near a friendly space." },
      { name: "Chichen Itza", era: "medieval", cost: 10, effect: "Place culture control on non-adjacent forests." },
      { name: "Sydney Opera House", era: "modern", cost: 10, effect: "Rival control counts toward city maturity." },
      { name: "Cristo Redentor", era: "modern", cost: 11, effect: "On build/capture: steal a nearby rival non-capital city." },
      { name: "Eiffel Tower", era: "modern", cost: 12, effect: "Start of turn: replace one of two rival controls." }
    ],
    economy: [
      { name: "Colossus", era: "ancient", cost: 7, effect: "+6 total caravan movement on economy." },
      { name: "Great Lighthouse", era: "ancient", cost: 8, effect: "Build cities on edge spaces as nearby friendly." },
      { name: "Apadana", era: "ancient", cost: 8, effect: "On build/capture: explore from an edge space." },
      { name: "Kilwa Kisiwani", era: "medieval", cost: 9, effect: "City-state trades gain +1 trade." },
      { name: "Great Zimbabwe", era: "medieval", cost: 9, effect: "Store and distribute trade." },
      { name: "Big Ben", era: "modern", cost: 10, effect: "+2 combat per adjacent caravan." },
      { name: "Estadio Do Maracana", era: "modern", cost: 10, effect: "Resolve economy before another focus card." },
      { name: "Orszaghaz", era: "modern", cost: 11, effect: "May conquer city-state after trading there." }
    ],
    science: [
      { name: "Oracle", era: "ancient", cost: 8, effect: "Start of turn: swap two adjacent focus cards." },
      { name: "Great Library", era: "ancient", cost: 8, effect: "Caravan to player city can copy matching focus tier." },
      { name: "Pyramids", era: "ancient", cost: 9, effect: "On build: upgrade up to three level-I cards." },
      { name: "University of Sankore", era: "medieval", cost: 9, effect: "After tech upgrade: swap two non-science cards." },
      { name: "Porcelain Tower", era: "medieval", cost: 9, effect: "On build: upgrade up to two cards." },
      { name: "Potala Palace", era: "medieval", cost: 10, effect: "On build: gain diplomacy cards." },
      { name: "Oxford University", era: "modern", cost: 10, effect: "Tech upgrade can ignore type matching." },
      { name: "Amundsen-Scott RS", era: "modern", cost: 10, effect: "On build: edge city with adjacent control." },
      { name: "Kremlin", era: "modern", cost: 11, effect: "+4 attack with more reinforced controls." }
    ]
  };

  const CITY_STATES = {
    Carthage: { type: "military", diplomacy: "Combat bonus near city-states and friendly cities." },
    Kumasi: { type: "culture", diplomacy: "Forests count as difficulty 1 for industry/culture." },
    Brussels: { type: "industry", diplomacy: "Wonder cost reduced by mature cities." },
    Seoul: { type: "science", diplomacy: "Start of turn: move a barbarian." },
    "Buenos Aires": { type: "industry", diplomacy: "Wonder cost -2 if no same-type wonder." },
    Kabul: { type: "military", diplomacy: "+3 attack vs cities and city-states." },
    Geneva: { type: "science", diplomacy: "Start of turn: swap a diplomacy card." },
    "Mohenjo Daro": { type: "culture", diplomacy: "Control placement terrain difficulty reduced by 1." },
    Auckland: { type: "industry", diplomacy: "City building treats adjacent-water terrain as 1." },
    Akkad: { type: "military", diplomacy: "Armies can move through rival control." },
    Antananarivo: { type: "culture", diplomacy: "Treat Antananarivo as your city during your turn." },
    Palenque: { type: "science", diplomacy: "Spend resources as trade tokens." }
  };

  const DIPLOMACY_CARDS = {
    joint_war: { name: "Joint War", effect: "+2 attack unless attacking owner." },
    defensive_pact: { name: "Defensive Pact", effect: "+2 defense unless owner attacks." },
    non_aggression: { name: "Non-Aggression Pact", effect: "Cannot attack owner; retaliation swaps military." },
    embassy: { name: "Embassy", effect: "Capital trade gives owner trade and trader resource." }
  };

  const AGENDA_CARDS = [
    { id: "fortified", name: "Fortified", fortress: true, description: "Control 1 or more fortress cities." },
    { id: "expeditionary", name: "Expeditionary", fortress: true, description: "Control 2 or more fortress cities." },
    { id: "warmonger", name: "Warmonger", description: "Defeat 1 rival capital or control 2 conquered city-states." },
    { id: "paranoid", name: "Paranoid", description: "Control 2 military world wonders." },
    { id: "civilized", name: "Civilized", description: "Have 8 cities on the map." },
    { id: "money_grubber", name: "Money Grubber", description: "Control 2 economic world wonders." },
    { id: "defensive", name: "Defensive", description: "Have 15 reinforced control tokens." },
    { id: "devastating", name: "Devastating", description: "Win an attack with total combat value of 16 or more." },
    { id: "diplomatic", name: "Diplomatic", description: "Have 4 diplomacy cards from different sources." },
    { id: "hoarder", name: "Hoarder", description: "Have 5 resource and/or natural wonder tokens." },
    { id: "explorer", name: "Explorer", description: "Control 15 spaces adjacent to water or map edge." },
    { id: "aesthetic", name: "Aesthetic", description: "Control 2 cultural world wonders." },
    { id: "industrious", name: "Industrious", description: "Have all 5 district types on the map." },
    { id: "provincial", name: "Provincial", description: "Control 1 mature city on 4 different map tiles." },
    { id: "diversified", name: "Diversified", description: "Control 3 different types of world wonders." },
    { id: "populous", name: "Populous", description: "Control 5 mature cities." },
    { id: "preservationist", name: "Preservationist", description: "Control 2 natural wonders." },
    { id: "expansionist", name: "Expansionist", description: "Control 1 city on 6 different map tiles." },
    { id: "prolific", name: "Prolific", description: "Control 2 wonders from the same era." },
    { id: "progressive", name: "Progressive", description: "Control 1 world wonder from each era." }
  ];

  const LEADERS = [
    { id: "random", name: "Random Leader", ability: "Use manual tools for unique leader focus cards." }
  ];

  window.CivRulesData = {
    rulesVersion: 1,
    TILES,
    TILE_OFFSETS,
    CARD_DEFS,
    WONDER_DECKS,
    CITY_STATES,
    DIPLOMACY_CARDS,
    AGENDA_CARDS,
    LEADERS
  };
})();
