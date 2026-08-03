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

  // World wonders. `effect` is the printed card text (from the Terra Incognita
  // player reference). `auto: true` marks the ones the engine enforces on its
  // own; the rest are shown to players to resolve at the table.
  // Pentagon and Machu Picchu are deliberately absent — Terra Incognita removes
  // them from the base game.
  const WONDER_DECKS = {
    military: [
      { name: "Jebel Barkal", era: "ancient", cost: 7,
        effect: "When attacking or defending, you can spend resource tokens (not natural wonder tokens) to increase your combat value by +2 for each token spent." },
      { name: "Petra", era: "ancient", cost: 7, auto: true,
        effect: "When defending, +2 combat value. Barbarians cannot move into spaces containing your cities or reinforced control tokens; instead they move in the opposite direction (Errata)." },
      { name: "Terracotta Army", era: "ancient", cost: 7, auto: true,
        effect: "When attacking, +2 combat value." },
      { name: "Huey Teocalli", era: "medieval", cost: 9, auto: true,
        effect: "When defending, increase your combat value by 1 for each water space that is adjacent to the defending space." },
      { name: "Venetian Arsenal", era: "medieval", cost: 10,
        effect: "Once per turn, after you resolve the card in the fifth slot (slot #5) of your focus row, you may resolve it again, treating it as if it was in the first slot (slot #1)." },
      { name: "Alhambra", era: "medieval", cost: 10, auto: true,
        effect: "When attacking or defending, increase your combat value by 2." },
      { name: "Ruhr Valley", era: "modern", cost: 11, auto: true,
        effect: "When defending, increase your combat value by 5." },
      { name: "Statue of Liberty", era: "modern", cost: 12,
        effect: "Before you replace a rival city with 1 of your cities, replace all rival control tokens that are adjacent to that rival city with your unused, unreinforced control tokens." }
    ],
    culture: [
      { name: "Stonehenge", era: "ancient", cost: 7,
        effect: "After you place a control token on a hill space, you may place a control token on 1 or more hill spaces adjacent to that space (which can trigger this effect again). Does not trigger on moved or replaced control tokens." },
      { name: "Hanging Gardens", era: "ancient", cost: 8, auto: true,
        effect: "At the start of your turn, you may place 1 control token on a space of terrain difficulty 4 (desert) or less that is adjacent to a friendly city." },
      { name: "Colosseum", era: "ancient", cost: 9, auto: true,
        effect: "At the start of your turn, you may reinforce 1 of your control tokens that is adjacent to a friendly city." },
      { name: "Taj Mahal", era: "medieval", cost: 9, auto: true,
        effect: "When you resolve a focus card, resolve it as though it is 1 slot farther to the right for each world wonder you control matching the focus card's type." },
      { name: "Forbidden City", era: "medieval", cost: 9, auto: true,
        effect: "At the start of your turn, you may remove 1 rival control token that is adjacent to a friendly space." },
      { name: "Chichen Itza", era: "medieval", cost: 10,
        effect: "When placing control tokens, you can place them on empty forest spaces that are not adjacent to a friendly city." },
      { name: "Sydney Opera House", era: "modern", cost: 10, auto: true,
        effect: "Rival control tokens contribute toward your cities' maturity." },
      { name: "Cristo Redentor", era: "modern", cost: 11,
        effect: "When you build or capture this wonder, choose a rival non-capital city (without an army in its space) within 3 spaces of this wonder. Replace that city with 1 of your unused cities." },
      { name: "Eiffel Tower", era: "modern", cost: 12,
        effect: "At the start of your turn, you may choose 2 rival control tokens on the map belonging to the same player. That player replaces 1 of those tokens with 1 of your unused, unreinforced control tokens." }
    ],
    economy: [
      { name: "Colossus", era: "ancient", cost: 7, auto: true,
        effect: "When resolving your economy focus card, your caravans can move a total of 6 additional spaces, divided as you choose." },
      { name: "Great Lighthouse", era: "ancient", cost: 8,
        effect: "When building cities, you can build in empty spaces on the edge of the map as if they were within 2 spaces of a friendly space." },
      { name: "Apadana", era: "ancient", cost: 8,
        effect: "When you build or capture this wonder, choose an edge space on any tile. Explore from that space." },
      { name: "Kilwa Kisiwani", era: "medieval", cost: 9, auto: true,
        effect: "When you move a caravan to a city-state, place 1 additional trade token from the supply on any 1 of your focus cards." },
      { name: "Great Zimbabwe", era: "medieval", cost: 9,
        effect: "You can place trade tokens on this card instead of on your focus cards, up to a limit of 4. At the start of your turn, you may move trade tokens from this card to cards in your focus row." },
      { name: "Big Ben", era: "modern", cost: 10, auto: true,
        effect: "When attacking or defending, increase your combat value by +2 for each of your caravans adjacent to the defending space." },
      { name: "Estadio Do Maracana", era: "modern", cost: 10,
        effect: "You may resolve and reset your economy card before you resolve a non-economy focus card (Errata)." },
      { name: "Orszaghaz", era: "modern", cost: 11,
        effect: "After you move a caravan to a city-state, you may conquer it." }
    ],
    science: [
      { name: "Oracle", era: "ancient", cost: 8, auto: true,
        effect: "At the start of your turn, you may swap 2 adjacent cards in your focus row." },
      { name: "Great Library", era: "ancient", cost: 8,
        effect: "When your caravan moves to another player's city, you may gain a focus card of the same type and tech level as a card in that player's focus row, replacing your card of the same type." },
      { name: "Pyramids", era: "ancient", cost: 9,
        effect: "When you build this wonder, choose up to 3 level-I cards in your focus row. Replace each with a level-II card of the same type." },
      { name: "University of Sankore", era: "medieval", cost: 9,
        effect: "At the end of your turn, if you replaced (tech upgrade) 1 or more of your focus cards this turn, you may swap any 2 non-science cards in your focus row." },
      { name: "Porcelain Tower", era: "medieval", cost: 9,
        effect: "When you build this wonder, replace up to 2 cards in your focus row with cards of the next highest tech level of the same type." },
      { name: "Potala Palace", era: "medieval", cost: 10,
        effect: "You can have 4 diplomacy cards from each other player. When you build this wonder, you may take a total of 3 diplomacy cards of your choice from other players." },
      { name: "Oxford University", era: "modern", cost: 10,
        effect: "When you replace (tech upgrade) a focus card other than a science focus card, you do not have to replace it with a card of the same type." },
      { name: "Amundsen-Scott RS", era: "modern", cost: 10,
        effect: "When you build this wonder, build a city on any legal space on the edge of the map and place this wonder in that city. THEN, place up to 2 control tokens in spaces adjacent to that city." },
      { name: "Kremlin", era: "modern", cost: 11, auto: true,
        effect: "When attacking a rival space (not city-state), increase your combat value by 4 if you have more reinforced control tokens on the map than the defending player." }
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

  // Leader roster — transcribed from the physical Terra Incognita leader
  // sheets. focusOrder: the sheet lists 5 starting cards for slots 1-5; the
  // Growth card sits on the extra duplicate-"1" slot at the far left of the
  // extended focus bar. `unique` is the civ's unique focus card; `auto: true`
  // means the engine enforces it, otherwise it is shown as a table reminder.
  // Abilities marked `manual: true` are reminders too (resolve via Host Tools).
  const LEADERS = [
    { id: "america", civ: "America", name: "America", source: "terra",
      ability: { text: "When you gain or spend a natural wonder token, place it on any card in your focus row. You can spend a natural wonder token on a focus card either as a trade token on that card or as a resource.", manual: true },
      focusOrder: ["growth", "military", "science", "industry", "culture", "economy"],
      unique: { name: "Radio", type: "culture", tier: 4, auto: false,
        text: "Place 3 control tokens on spaces matching this slot's terrain or lower that are adjacent to friendly cities. Then, if you resolved this card in the fifth slot, choose a rival non-capital city within 4 spaces of a friendly city (without an army in its space) and replace it with 1 of your unused cities." } },
    { id: "aztec", civ: "Aztec", name: "Aztec", source: "terra",
      ability: { text: "After you reset your military focus card, if you won at least 1 attack this turn, you may swap any 2 cards in your focus row." },
      focusOrder: ["growth", "science", "culture", "economy", "military", "industry"],
      unique: { name: "Mysticism", type: "growth", tier: 1, auto: false,
        text: "Place a district on a space matching this slot's terrain or lower that is adjacent to a friendly city. If you place this district on a space within 1 of your control tokens, you may place that token on a space adjacent to this district. Or, reinforce a number of your control tokens up to this slot's number." } },
    { id: "china", civ: "China", name: "China", source: "terra",
      ability: { text: "When defending, your reinforced control tokens increase your combat value by 2 instead of 1." },
      focusOrder: ["growth", "military", "industry", "economy", "culture", "science"],
      unique: { name: "Writing", type: "science", tier: 1, auto: true,
        text: "Advance your tech dial a number of spaces equal to this slot's number. Then, if you control a world wonder, advance your tech dial 1 additional space." } },
    { id: "egypt", civ: "Egypt", name: "Egypt", source: "terra",
      ability: { text: "The cost of all world wonders is reduced by 1 for you." },
      focusOrder: ["growth", "science", "economy", "industry", "military", "culture"],
      unique: { name: "Wheel", type: "economy", tier: 1, auto: true,
        text: "Move each of your caravans up to 4 spaces. They can move into spaces matching this slot's terrain or lower. When your caravan moves to a city-state or rival city, gain 1 resource of your choice from the supply (in addition to trade tokens)." } },
    { id: "england", civ: "England", name: "England", source: "terra",
      ability: { text: "When you build a city, if it is the only city on its tile (excluding city-states), you may place 1 of your unused, reinforced control tokens in a space adjacent to that city." },
      focusOrder: ["growth", "economy", "science", "culture", "industry", "military"],
      unique: { name: "Natural History", type: "science", tier: 3, auto: true,
        text: "Advance your tech dial a number of spaces equal to this slot's number, plus 1 for each type of resource you have (including resources on natural wonder tokens)." } },
    { id: "france", civ: "France", name: "France", source: "terra",
      ability: { text: "When resolving your culture focus card, place additional control tokens based on your latest-era world wonder: Ancient 1 token / Medieval 2 tokens / Modern 3 tokens." },
      focusOrder: ["growth", "military", "science", "economy", "industry", "culture"],
      unique: { name: "Humanism", type: "culture", tier: 3, auto: true,
        text: "Place 2 control tokens on spaces matching this slot's terrain or lower that are adjacent to friendly spaces. Then, for each of your mature cities, place 1 trade token from the supply on 1 of your focus cards." } },
    { id: "georgia", civ: "Georgia", name: "Georgia", source: "terra",
      ability: { text: "When resolving a focus card, if you have a diplomacy card from a city-state of that focus card's type, resolve it as though it is 1 slot farther to the right." },
      focusOrder: ["growth", "industry", "science", "economy", "military", "culture"],
      unique: { name: "Siege Tactics", type: "military", tier: 3, auto: false,
        text: "Move each of your armies up to 5 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. During your turn, reduce the combat bonus provided by each reinforced control token by 1." } },
    { id: "japan", civ: "Japan", name: "Japan", source: "terra",
      ability: { text: "During your turn, desert and mountain spaces that are adjacent to water or the edge of the map are treated as having a terrain difficulty of 3." },
      focusOrder: ["growth", "industry", "economy", "military", "science", "culture"],
      unique: { name: "Industrialization", type: "industry", tier: 3, auto: true,
        text: "Build 1 world wonder. Your production equals this slot's number, plus 1 for each of your districts on the map. Or, build 1 city on a legal space of this slot's terrain or lower within 4 spaces of a friendly space. You can count through water." } },
    { id: "inca", civ: "Inca", name: "Inca", source: "terra",
      ability: { text: "After you place a control token on a mountain space, you may place a control token on a space adjacent to that space (which can trigger this effect again)." },
      focusOrder: ["growth", "culture", "military", "science", "industry", "economy"],
      unique: { name: "State Workforce", type: "culture", tier: 2, auto: true,
        text: "Place 2 control tokens on spaces matching this slot's terrain or lower that are adjacent to friendly cities. Then, if you resolved this card in the fifth slot, place 1 control token on a mountain space adjacent to a friendly space." } },
    { id: "indonesia", civ: "Indonesia", name: "Indonesia", source: "terra",
      ability: { text: "Your caravans and armies can move into water. When you move a caravan, treat water spaces on the edge of the map as though they are adjacent to each other." },
      focusOrder: ["growth", "culture", "military", "science", "industry", "economy"],
      unique: { name: "Shipbuilding", type: "economy", tier: 2, auto: false,
        text: "Move each of your caravans up to 4 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. Before 1 of your caravans explores, you may place a water token touching that caravan's space." } },
    { id: "netherlands", civ: "Netherlands", name: "Netherlands", source: "terra",
      ability: { text: "Water spaces adjacent to your districts are treated as friendly spaces of all terrain types when resolving your districts' abilities.", manual: true },
      focusOrder: ["growth", "culture", "science", "industry", "economy", "military"],
      unique: { name: "Cartography", type: "economy", tier: 3, auto: false,
        text: "Move each of your caravans up to 6 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. Once per turn, when your caravan moves to a rival city that is 8 or more spaces from your capital, you may build a city on a legal space within 2 spaces of that city." } },
    { id: "nubia", civ: "Nubia", name: "Nubia", source: "terra",
      ability: { text: "After you reset your growth focus card, resolve the effect of any 1 of your districts." },
      focusOrder: ["growth", "economy", "industry", "culture", "science", "military"],
      unique: { name: "Construction", type: "industry", tier: 2, auto: true,
        text: "Build 1 world wonder. Your production equals this slot's number. Each resource spent to build this wonder increases production by an additional 1." } },
    { id: "ottoman", civ: "Ottoman", name: "Ottoman", source: "terra",
      ability: { text: "At the start of your turn, you may choose another player. Give that player the \"Ibrahim\" card. When attacking or defending against the player with the \"Ibrahim\" card, increase your combat value by 2. (Ibrahim: when its holder moves a caravan to an Ottoman city, both players place 1 trade token from the supply on a focus card.)" },
      focusOrder: ["growth", "science", "industry", "culture", "military", "economy"],
      unique: { name: "Banking", type: "economy", tier: 3, auto: true,
        text: "Move each of your caravans up to 6 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. After you move a caravan to the capital of the player with the \"Ibrahim\" card, gain 1 resource of your choice from the supply." } },
    { id: "poland", civ: "Poland", name: "Poland", source: "terra",
      ability: { text: "At the start of your first turn, choose another player. Take 1 diplomacy card of your choice from that player. You can have any number of diplomacy cards from the chosen player." },
      focusOrder: ["growth", "culture", "military", "industry", "economy", "science"],
      unique: { name: "Astronomy", type: "science", tier: 2, auto: false,
        text: "Look at up to 2 map tiles from the bottom of the map tile stack. You may place 1 as though you are exploring from any edge space of your capital tile. Return any remaining tiles to the top or bottom of the stack in any order. Then, advance your tech dial a number of spaces equal to this slot's number." } },
    { id: "rome", civ: "Rome", name: "Rome", source: "terra",
      ability: { text: "When you move a caravan from your economy card, it can move from any of your cities (even a city that is not mature)." },
      focusOrder: ["growth", "science", "economy", "military", "culture", "industry"],
      unique: { name: "Military Engineering", type: "growth", tier: 2, auto: false,
        text: "Place a district on a space matching this slot's terrain or lower that is adjacent to a friendly city. Then, for each army on your military card, you may place that army in a space containing one of your cities. Then reinforce each of your control tokens that is in or adjacent to a space containing a friendly army." } },
    { id: "scythia", civ: "Scythia", name: "Scythia", source: "terra",
      ability: { text: "When attacking or defending a grassland or hill space, increase your combat value by 3." },
      focusOrder: ["growth", "culture", "military", "science", "economy", "industry"],
      unique: { name: "Horseback Riding", type: "military", tier: 1, auto: true,
        text: "Move each of your armies up to 6 spaces. They can move into spaces matching this slot's terrain or lower. Your combat value equals this slot's number." } },
    { id: "sumeria", civ: "Sumeria", name: "Sumeria", source: "terra",
      ability: { text: "When you defeat a barbarian, gain 1 resource of your choice from the supply (in addition to a trade token)." },
      focusOrder: ["growth", "economy", "culture", "science", "military", "industry"],
      unique: { name: "Craftsmanship", type: "industry", tier: 1, auto: true,
        text: "Build 1 world wonder. Your production equals this slot's number. Then, advance your tech dial 1 space. Or, build 1 city on a legal space of this slot's terrain or lower within 2 spaces of a friendly space." } },
    { id: "zulu", civ: "Zulu", name: "Zulu", source: "terra",
      ability: { text: "After you win a combat as the attacker, place 1 trade token from the supply on your military focus card, plus 1 additional trade token if you attacked a rival city or city-state." },
      focusOrder: ["growth", "industry", "culture", "economy", "science", "military"],
      unique: { name: "Scorched Earth", type: "military", tier: 2, auto: false,
        text: "Move each of your armies up to 4 spaces. They can move into spaces matching this slot's terrain or lower. Your combat value equals this slot's number. Once per turn, after you win an attack against a control token, you may discard it instead of replacing it to move (and attack with) the attacking army a second time." } }
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
