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

  // The 21 physical map tiles, read off photographs of the printed tiles in
  // assets/tts-web/map-tiles/. Terrain, resources, barbarian spawns, capitals,
  // city-states and natural wonders are all transcribed from the artwork —
  // none of it is invented any more.
  //
  // Sampling geometry, for anyone checking the work: each extracted face is
  // 635x990 with a hex circumradius of 127, columns at x = 127 / 317.5 / 508.
  // Side A cell centres run bottom-to-top per column; side B is the same
  // geometry mirrored vertically. Cell 6 is the capital space, which is where
  // the printed star sits on all five capital tiles.
  //
  // The barbarian letters are the ones printed inside the helm on the tile,
  // matching the lettered barbarian tokens. They repeat across tiles and they
  // are decoration — nothing reads them but the tile inspector and the token
  // drawn on the space. They came off a 635x990 scan where the helm is about
  // forty pixels across, so E, F and H are the ones to re-check first if one
  // ever looks wrong.
  const TILES = [
    // Printed tile 7
    tile("01", "capital",
      ["forest","mountain","water","water","forest","grass","grass","water","mountain","water"],
      ["grass","forest","hill","water","forest","hill","grass","forest","mountain","water"],
      { 0: { resource: "mercury" }, 6: { feature: "capital" } },
      { 1: { resource: "diamonds" }, 6: { feature: "capital" } }),
    // Printed tile 9
    // Cell 9 read as "hill" on the first pass and is water: the bay in cell 7
    // continues into it, and it measures (79,115,99) against (112,107,47) for
    // this tile's actual hills. It sits next to the capital, so the miss let
    // control tokens and districts be placed out to sea.
    tile("02", "capital",
      ["mountain","hill","hill","grass","grass","grass","hill","water","hill","water"],
      ["forest","forest","grass","forest","grass","hill","hill","forest","hill","water"],
      { 0: { resource: "diamonds" }, 6: { feature: "capital" } },
      { 1: { resource: "oil" }, 6: { feature: "capital" } }),
    // Printed tile 11
    // Cell 8 read as "hill" and is grass: it measures (144,153,53), greener
    // than this tile's own capital grass at (135,147,57), where its hills are
    // olive and red-dominant at (118,115,49). It borders the capital, so the
    // miss put a difficulty-2 space where a difficulty-1 one is printed and
    // blocked growth cards resolving from a grass slot.
    tile("03", "capital",
      ["forest","hill","hill","mountain","forest","forest","grass","mountain","grass","hill"],
      ["grass","desert","grass","hill","grass","mountain","grass","hill","hill","water"],
      { 0: { barbarian: "G" }, 3: { resource: "diamonds" }, 6: { feature: "capital" } },
      { 4: { resource: "marble" }, 6: { feature: "capital" } }),
    // Printed tile 16
    tile("04", "capital",
      ["water","water","grass","grass","hill","grass","grass","desert","grass","desert"],
      ["water","grass","forest","desert","hill","grass","forest","mountain","grass","grass"],
      { 6: { feature: "capital" }, 9: { resource: "oil" } },
      { 4: { resource: "marble" }, 6: { feature: "capital" } }),
    // Printed tile 17
    tile("05", "capital",
      ["hill","desert","hill","hill","desert","desert","desert","hill","mountain","forest"],
      ["water","water","grass","hill","water","grass","grass","mountain","hill","mountain"],
      { 6: { feature: "capital" }, 9: { resource: "oil" } },
      { 6: { feature: "capital" }, 7: { resource: "mercury" } }),
    // Printed tile 6 — Carthage / Kumasi
    tile("06", "citystate",
      ["water","water","water","forest","grass","mountain","water","grass","hill","forest"],
      ["mountain","forest","grass","hill","grass","mountain","mountain","grass","hill","mountain"],
      { 7: { cityState: "Carthage" } },
      { 0: { resource: "marble" }, 7: { cityState: "Kumasi" } }),
    // Printed tile 12 — Brussels / Seoul
    tile("07", "citystate",
      ["desert","mountain","hill","hill","desert","hill","grass","hill","hill","hill"],
      ["grass","forest","water","grass","desert","water","grass","hill","hill","forest"],
      { 1: { resource: "mercury" }, 6: { cityState: "Brussels" } },
      { 0: { barbarian: "B" }, 3: { cityState: "Seoul" }, 9: { resource: "mercury" } }),
    // Printed tile 15 — Kabul / Buenos Aires
    tile("08", "citystate",
      ["mountain","forest","mountain","water","grass","mountain","grass","water","water","water"],
      ["grass","grass","mountain","desert","grass","mountain","hill","desert","mountain","water"],
      { 1: { barbarian: "H" }, 2: { resource: "marble" }, 6: { cityState: "Buenos Aires" } },
      { 0: { cityState: "Kabul" }, 2: { barbarian: "E" }, 7: { resource: "oil" } }),
    // Printed tile 14 — Geneva / Mohenjo Daro
    tile("09", "citystate",
      ["mountain","hill","hill","forest","forest","forest","forest","hill","forest","grass"],
      ["mountain","hill","grass","hill","grass","grass","desert","forest","desert","desert"],
      { 4: { resource: "marble" }, 9: { cityState: "Geneva" } },
      { 0: { resource: "oil" }, 2: { cityState: "Mohenjo Daro" } }),
    // Printed tile 20 — Akkad / Auckland
    tile("10", "citystate",
      ["hill","forest","grass","water","water","water","water","mountain","hill","water"],
      ["desert","desert","water","desert","desert","water","grass","desert","desert","desert"],
      { 2: { cityState: "Auckland" }, 7: { resource: "diamonds" }, 8: { barbarian: "K" } },
      { 0: { barbarian: "K" }, 4: { resource: "mercury" }, 6: { cityState: "Akkad" } }),
    // Printed tile 4 — Galapagos Islands / Grand Mesa
    tile("11", "natural",
      ["mountain","mountain","hill","forest","grass","hill","desert","mountain","desert","desert"],
      ["mountain","hill","grass","water","hill","water","grass","water","water","water"],
      { 0: { resource: "mercury" }, 4: { barbarian: "D" }, 6: { naturalWonder: "Galapagos Islands" } },
      { 0: { barbarian: "D" }, 6: { naturalWonder: "Grand Mesa" } }),
    // Printed tile 18 — Mato Tipila / Dead Sea
    tile("12", "natural",
      ["grass","hill","desert","mountain","water","hill","desert","desert","water","desert"],
      ["grass","grass","hill","grass","forest","forest","desert","hill","hill","grass"],
      { 6: { naturalWonder: "Mato Tipila" }, 7: { resource: "oil" }, 9: { barbarian: "F" } },
      { 0: { resource: "marble" }, 5: { barbarian: "E" }, 6: { naturalWonder: "Dead Sea" } }),
    // Printed tile 13 — Mt Kilimanjaro / Pantanal
    tile("13", "natural",
      ["forest","forest","desert","desert","hill","grass","mountain","desert","hill","hill"],
      ["water","grass","water","forest","forest","grass","grass","water","water","forest"],
      { 6: { naturalWonder: "Mt Kilimanjaro" } },
      { 1: { resource: "diamonds" }, 6: { naturalWonder: "Pantanal" } }),
    // Printed tile 3
    tile("14", "normal",
      ["mountain","mountain","grass","water","forest","hill","water","mountain","grass","desert"],
      ["desert","forest","grass","desert","forest","desert","desert","desert","desert","desert"],
      { 1: { barbarian: "C" }, 4: { resource: "oil" }, 9: { resource: "marble" } },
      { 0: { resource: "mercury" }, 6: { barbarian: "C" }, 7: { resource: "oil" } }),
    // Printed tile 5
    tile("15", "normal",
      ["forest","forest","hill","hill","grass","grass","mountain","hill","grass","mountain"],
      ["grass","grass","grass","hill","grass","hill","mountain","forest","forest","forest"],
      { 1: { resource: "oil" }, 9: { resource: "diamonds" } },
      { 1: { barbarian: "E" }, 6: { resource: "mercury" } }),
    // Printed tile 1 — Cliffs of Dover / Torres del Paine
    tile("16", "natural",
      ["water","mountain","mountain","mountain","mountain","hill","mountain","hill","grass","desert"],
      ["grass","grass","hill","forest","water","water","mountain","grass","water","water"],
      { 2: { barbarian: "A" }, 4: { resource: "marble" }, 6: { naturalWonder: "Cliffs of Dover" } },
      { 6: { naturalWonder: "Torres del Paine" }, 7: { barbarian: "A" } }),
    // Printed tile 21 — Antananarivo / Palenque
    tile("TI01", "citystate",
      ["grass","mountain","forest","water","hill","hill","water","grass","water","forest"],
      ["hill","forest","forest","water","mountain","grass","forest","forest","mountain","forest"],
      { 5: { resource: "marble" }, 7: { cityState: "Antananarivo" } },
      { 5: { cityState: "Palenque" } }),
    // Printed tile 19 — Ha Long Bay / Gobustan
    tile("TI02", "natural",
      ["forest","forest","mountain","forest","grass","grass","mountain","water","water","water"],
      ["forest","forest","desert","desert","mountain","hill","desert","hill","mountain","mountain"],
      { 6: { naturalWonder: "Ha Long Bay" } },
      { 5: { resource: "diamonds" }, 6: { naturalWonder: "Gobustan" } }),
    // Printed tile 8
    tile("TI03", "normal",
      ["forest","forest","water","water","forest","forest","forest","grass","forest","forest"],
      ["water","forest","desert","water","mountain","mountain","forest","water","forest","water"],
      { 1: { resource: "diamonds" }, 9: { resource: "mercury" } },
      { 8: { resource: "mercury" } }),
    // Printed tile 10
    tile("TI04", "normal",
      ["mountain","desert","desert","hill","mountain","water","water","grass","grass","grass"],
      ["water","water","grass","desert","water","grass","forest","forest","desert","hill"],
      { 1: { barbarian: "F" }, 2: { resource: "oil" } },
      { 3: { resource: "marble" }, 6: { barbarian: "E" }, 8: { resource: "diamonds" } }),
    // Printed tile 2 — Crater Lake / Mount Everest
    tile("TI05", "natural",
      ["mountain","hill","grass","hill","mountain","mountain","mountain","mountain","hill","hill"],
      ["forest","hill","mountain","mountain","forest","mountain","water","mountain","hill","mountain"],
      { 4: { barbarian: "B" }, 6: { naturalWonder: "Crater Lake" } },
      { 5: { naturalWonder: "Mount Everest" }, 9: { resource: "diamonds" } })
  ];

  const CARD_DEFS = {
    culture: {
      1: { name: "Early Empire", effectText: "Place 2 control tokens on empty spaces matching this slot's terrain or lower that are adjacent to a friendly city. Taking a space with a resource or natural wonder claims that token.", markers: 2 },
      2: { name: "Drama and Poetry", effectText: "Place 2 control tokens on spaces matching this slot's terrain or lower that are adjacent to friendly cities. Then, you may move 1 of your control tokens to an adjacent, non-water space that is empty (does not contain a token or plastic figure).", markers: 2,
        resolution: [
          { kind: "place_control", count: 2 },
          { kind: "move_control", distance: 1, optional: true }
        ] },
      3: { name: "Civil Service", effectText: "Place 2 control tokens on spaces matching this slot's terrain or lower that are adjacent to friendly cities. Then, place 1 control token on a space matching this slot's terrain or lower that is adjacent to a friendly space.", markers: 2, effect: "extra_control" },
      4: { name: "Mass Media", effectText: "Place 3 control tokens on spaces matching this slot's terrain or lower that are adjacent to friendly cities. Then, choose a rival control token within 2 spaces of a friendly space. If it is unreinforced, replace it with 1 of your unreinforced control tokens. If it is reinforced, flip it to its unreinforced side.", markers: 3, effect: "replace_rival" }
    },
    growth: {
      1: { name: "Irrigation", effectText: "Place a district on a space matching this slot's terrain or lower that is adjacent to a friendly city. Or, reinforce a number of your control tokens up to this slot's number.",
        resolution: { mode: "choice", options: ["place_district", "reinforce"] } },
      2: { name: "Engineering", effectText: "Place a district on a space matching this slot's terrain or lower that is adjacent to a friendly city. Then, place 1 control token on a space matching this slot's terrain or lower that is adjacent to a friendly district. Or, reinforce a number of your control tokens up to this slot's number.",
        resolution: { mode: "choice", options: [
          { kind: "sequence", steps: ["place_district", "control_near_district"] },
          "reinforce"
        ] } },
      3: { name: "Sanitation", effectText: "Place a district on a space matching this slot's terrain or lower that is adjacent to a friendly city. Then, reinforce a number of your control tokens up to this slot's number.",
        resolution: { mode: "sequence", steps: ["place_district", "reinforce"] } },
      4: { name: "Globalization", effectText: "Place a district on a space matching this slot's terrain or lower that is adjacent to a friendly city. Then, choose a type of district. Each player that has a district of that type on the map resolves its effect. Then, reinforce a number of your control tokens up to this slot's number.",
        resolution: { mode: "sequence", steps: ["place_district", "resolve_chosen_district_type", "reinforce"] } }
    },
    science: {
      1: { name: "Astrology", effectText: "Advance the arrow on your tech dial a number of spaces equal to this slot's number. Reaching a tech level lets you swap in a focus card of that level." },
      2: { name: "Mathematics", effectText: "Place 1 trade token from the supply on 1 of your focus cards. Then, advance your tech dial a number of spaces equal to this slot's number.", effect: "bonus_trade" },
      3: { name: "Replaceable Parts", effectText: "Gain 1 resource of your choice from the supply. You cannot gain a resource of a type that you already have. Then, advance your tech dial a number of spaces equal to this slot's number.", effect: "bonus_resource" },
      4: { name: "Nuclear Power", effectText: "If you resolved this card in the fifth slot, choose 1 space. In that space and all adjacent spaces, destroy all unreinforced control tokens and flip all reinforced control tokens to their unreinforced side. Then, advance your tech dial a number of spaces equal to this slot's number.", effect: "nuke" }
    },
    economy: {
      1: { name: "Foreign Trade", effectText: "Move each of your caravans up to 3 spaces, onto terrain matching this slot or lower. Reaching a city-state or rival city returns the caravan to this card and earns 2 trade tokens and a diplomacy card.", figures: "1 caravan", move: 3, caravans: 1 },
      2: { name: "Currency", effectText: "Move each of your caravans up to 4 spaces. They can move into spaces matching this slot's terrain or lower. Your caravans can move into a barbarian's space; remove that barbarian without gaining a trade token and end that caravan's movement.", figures: "2 caravans", move: 4, caravans: 2, effect: "remove_barbarian" },
      3: { name: "Steam Power", effectText: "Move each of your caravans up to 6 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. Then, you may exchange 1 of your resource tokens with another resource token of any type from the supply.", figures: "2 caravans", move: 6, caravans: 2, water: true, effect: "exchange_resource" },
      4: { name: "Capitalism", effectText: "Move each of your caravans up to 6 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. Once per turn, after you reset this card, choose another card in your focus row. Resolve that card as though it is in the first slot, but do not reset it.", figures: "3 caravans", move: 6, caravans: 3, water: true, effect: "resolve_extra" }
    },
    // Read off the printed Terra cards in assets/tts-web/cards/focus/. Terra p2
    // removes ALL base military cards and replaces them, and these carried the
    // base text: they claimed to reinforce control tokens, which Terra p8 moved
    // to growth cards ("a function that is no longer provided by military focus
    // cards"), and they dropped the clause that makes each card interesting.
    military: {
      1: { name: "Masonry", effectText: "Move each of your armies up to 3 spaces. They can move into spaces matching this slot's terrain or lower. Your combat value equals this slot's number. When an army enters a space containing a barbarian, city-state, or rival piece, it must end its movement and perform an attack.", figures: "1 army", move: 3, armies: 1, combat: 0 },
      2: { name: "Iron Working", effectText: "Move each of your armies up to 4 spaces. They can move into spaces matching this slot's terrain or lower. Your combat value equals this slot's number, plus 2 if attacking a barbarian.", figures: "2 armies", move: 4, armies: 2, combat: 0, vsBarbarian: 2 },
      3: { name: "Mass Production", effectText: "Move each of your armies up to 5 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. Your combat value equals this slot's number plus 2. You may move (and attack with) 1 of your armies that was defeated this turn a second time after returning it to this card.", figures: "2 armies", move: 5, armies: 2, combat: 2, water: true, redeployDefeated: 1 },
      4: { name: "Flight", effectText: "Move each of your armies up to 6 spaces. They can move into spaces matching this slot's terrain or lower, as well as water. They can move through spaces with unreinforced control tokens, caravans, barbarians, and city-states. Your combat value equals this slot's number plus 3.", figures: "2 armies", move: 6, armies: 2, combat: 3, water: true, passThrough: true }
    },
    industry: {
      1: { name: "Pottery", effectText: "Build 1 world wonder, contributing production equal to this slot's number. Or build 1 city on a legal space matching this slot's terrain or lower, within 2 spaces of a friendly space. A city must be founded on a space holding your own caravan or control token.", cityRange: 2 },
      2: { name: "Animal Husbandry", effectText: "Build 1 world wonder; production equals this slot's number. Or, build 1 city on a legal space of this slot's terrain or lower within 3 spaces of a friendly space. Or, build 1 city on a legal space containing a friendly caravan or army, then return that figure to its focus card.", cityRange: 3, effect: "build_on_unit" },
      3: { name: "Nationalism", effectText: "Build 1 world wonder, contributing production equal to this slot's number. Or build 1 city on a legal space matching this slot's terrain or lower, within 4 spaces of a friendly space. A city must be founded on a space holding your own caravan or control token.", cityRange: 4, water: true, wonderSlot5Production: 7 },
      4: { name: "Urbanization", effectText: "Build 1 world wonder; production equals this slot's number. Or, build 1 city on a legal space of this slot's terrain or lower within 5 spaces of a friendly space; you can count through water. Then, if you built a city, place up to 2 control tokens adjacent to that city on spaces matching this slot's terrain or lower.", cityRange: 5, water: true, effect: "control_after_city" }
    }
  };

  // Natural-wonder filenames in the TTS mod are not a reliable resource tag:
  // several sit in a folder named for a different resource. These values were
  // read from the icon printed on each physical token face. There are exactly
  // three of every resource type in the combined game.
  const NATURAL_WONDER_RESOURCES = Object.freeze({
    "Mt Kilimanjaro": "oil",
    "Mount Everest": "oil",
    Gobustan: "oil",
    "Ha Long Bay": "diamonds",
    "Grand Mesa": "diamonds",
    "Torres del Paine": "diamonds",
    "Galapagos Islands": "mercury",
    "Mato Tipila": "mercury",
    "Crater Lake": "mercury",
    "Cliffs of Dover": "marble",
    "Dead Sea": "marble",
    Pantanal: "marble"
  });

  // The two resource icons printed at the lower-right of every wonder card.
  // A resource may contribute production only when its type appears here.
  const WONDER_RESOURCE_ELIGIBILITY = Object.freeze({
    "Jebel Barkal": ["oil", "mercury"],
    Petra: ["oil", "diamonds"],
    "Terracotta Army": ["oil", "marble"],
    "Huey Teocalli": ["oil", "mercury"],
    "Venetian Arsenal": ["oil", "diamonds"],
    Alhambra: ["oil", "marble"],
    "Ruhr Valley": ["oil", "mercury"],
    "Statue of Liberty": ["oil", "marble"],
    Pentagon: ["oil", "diamonds"],
    Stonehenge: ["marble", "mercury"],
    "Hanging Gardens": ["marble", "diamonds"],
    Colosseum: ["marble", "oil"],
    "Taj Mahal": ["marble", "diamonds"],
    "Forbidden City": ["marble", "oil"],
    "Chichen Itza": ["marble", "mercury"],
    "Sydney Opera House": ["marble", "diamonds"],
    "Cristo Redentor": ["marble", "mercury"],
    "Eiffel Tower": ["marble", "oil"],
    Colossus: ["diamonds", "oil"],
    "Great Lighthouse": ["diamonds", "mercury"],
    Apadana: ["diamonds", "marble"],
    "Kilwa Kisiwani": ["diamonds", "marble"],
    "Great Zimbabwe": ["diamonds", "oil"],
    "Machu Picchu": ["diamonds", "mercury"],
    "Big Ben": ["diamonds", "mercury"],
    "Estadio Do Maracana": ["diamonds", "marble"],
    Orszaghaz: ["diamonds", "oil"],
    Oracle: ["mercury", "marble"],
    "Great Library": ["mercury", "diamonds"],
    Pyramids: ["mercury", "oil"],
    "University of Sankore": ["mercury", "oil"],
    "Porcelain Tower": ["mercury", "diamonds"],
    "Potala Palace": ["mercury", "marble"],
    "Oxford University": ["mercury", "marble"],
    "Amundsen-Scott Research Station": ["mercury", "diamonds"],
    Kremlin: ["mercury", "oil"]
  });

  // World wonders. `effect` is the printed card text (from the Terra Incognita
  // player reference). `auto: true` marks the ones the engine enforces on its
  // own; the rest are shown to players to resolve at the table.
  // Pentagon and Machu Picchu are deliberately absent — Terra Incognita removes
  // them from the base game.
  const WONDER_DECKS = {
    military: [
      { name: "Jebel Barkal", era: "ancient", cost: 7, auto: true,
        effect: "When attacking or defending, you can spend resource tokens (not natural wonder tokens) to increase your combat value by +2 for each token spent." },
      { name: "Petra", era: "ancient", cost: 7, auto: true,
        effect: "When defending, +2 combat value. Barbarians cannot move into spaces containing your cities or reinforced control tokens; instead they move in the opposite direction (Errata)." },
      { name: "Terracotta Army", era: "ancient", cost: 7, auto: true,
        effect: "When attacking, +2 combat value." },
      { name: "Huey Teocalli", era: "medieval", cost: 9, auto: true,
        effect: "When defending, increase your combat value by 1 for each water space that is adjacent to the defending space." },
      { name: "Venetian Arsenal", era: "medieval", cost: 10, auto: true,
        effect: "Once per turn, after you resolve the card in the fifth slot (slot #5) of your focus row, you may resolve it again, treating it as if it was in the first slot (slot #1)." },
      { name: "Alhambra", era: "medieval", cost: 10, auto: true,
        effect: "When attacking or defending, increase your combat value by 2." },
      { name: "Ruhr Valley", era: "modern", cost: 11, auto: true,
        effect: "When defending, increase your combat value by 5." },
      { name: "Statue of Liberty", era: "modern", cost: 12, auto: true,
        effect: "Before you replace a rival city with 1 of your cities, replace all rival control tokens that are adjacent to that rival city with your unused, unreinforced control tokens." }
    ],
    culture: [
      { name: "Stonehenge", era: "ancient", cost: 7, auto: true,
        effect: "After you place a control token on a hill space, you may place a control token on 1 or more hill spaces adjacent to that space (which can trigger this effect again). Does not trigger on moved or replaced control tokens." },
      { name: "Hanging Gardens", era: "ancient", cost: 8, auto: true,
        effect: "At the start of your turn, you may place 1 control token on a space of terrain difficulty 4 (desert) or less that is adjacent to a friendly city." },
      { name: "Colosseum", era: "ancient", cost: 9, auto: true,
        effect: "At the start of your turn, you may reinforce 1 of your control tokens that is adjacent to a friendly city." },
      { name: "Taj Mahal", era: "medieval", cost: 9, auto: true,
        effect: "When you resolve a focus card, resolve it as though it is 1 slot farther to the right for each world wonder you control matching the focus card's type." },
      { name: "Forbidden City", era: "medieval", cost: 9, auto: true,
        effect: "At the start of your turn, you may remove 1 rival control token that is adjacent to a friendly space." },
      { name: "Chichen Itza", era: "medieval", cost: 10, auto: true,
        effect: "When placing control tokens, you can place them on empty forest spaces that are not adjacent to a friendly city." },
      { name: "Sydney Opera House", era: "modern", cost: 10, auto: true,
        effect: "Rival control tokens contribute toward your cities' maturity." },
      { name: "Cristo Redentor", era: "modern", cost: 11, auto: true,
        effect: "When you build or capture this wonder, choose a rival non-capital city (without an army in its space) within 3 spaces of this wonder. Replace that city with 1 of your unused cities." },
      { name: "Eiffel Tower", era: "modern", cost: 12, auto: true,
        effect: "At the start of your turn, you may choose 2 rival control tokens on the map belonging to the same player. That player replaces 1 of those tokens with 1 of your unused, unreinforced control tokens." }
    ],
    economy: [
      { name: "Colossus", era: "ancient", cost: 7, auto: true,
        effect: "When resolving your economy focus card, your caravans can move a total of 6 additional spaces, divided as you choose." },
      { name: "Great Lighthouse", era: "ancient", cost: 8, auto: true,
        effect: "When building cities, you can build in empty spaces on the edge of the map as if they were within 2 spaces of a friendly space." },
      { name: "Apadana", era: "ancient", cost: 8, auto: true,
        effect: "When you build or capture this wonder, choose an edge space on any tile. Explore from that space. Then, if you placed a tile, place 1 control token on an empty space on that tile.",
        resolution: [
          { kind: "explore_from_any_tile_edge" },
          { kind: "place_control_on_explored_tile", condition: "tile_placed" }
        ] },
      { name: "Kilwa Kisiwani", era: "medieval", cost: 9, auto: true,
        effect: "When you move a caravan to a city-state, place 1 additional trade token from the supply on any 1 of your focus cards." },
      { name: "Great Zimbabwe", era: "medieval", cost: 9, auto: true,
        effect: "You can place trade tokens on this card instead of on your focus cards, up to a limit of 4. At the start of your turn, you may move trade tokens from this card to cards in your focus row." },
      { name: "Big Ben", era: "modern", cost: 10, auto: true,
        effect: "When attacking or defending, increase your combat value by +2 for each of your caravans adjacent to the defending space." },
      { name: "Estadio Do Maracana", era: "modern", cost: 10, auto: true,
        effect: "You may resolve and reset your economy card before you resolve a non-economy focus card (Errata)." },
      { name: "Orszaghaz", era: "modern", cost: 11, auto: true,
        effect: "After you move a caravan to a city-state, you may conquer it." }
    ],
    science: [
      { name: "Oracle", era: "ancient", cost: 8, auto: true,
        effect: "At the start of your turn, you may swap 2 adjacent cards in your focus row." },
      { name: "Great Library", era: "ancient", cost: 8, auto: true,
        effect: "When your caravan moves to another player's city, you may gain a focus card of the same type and tech level as a card in that player's focus row, replacing your card of the same type." },
      { name: "Pyramids", era: "ancient", cost: 9, auto: true,
        effect: "When you build this wonder, choose up to 3 level-I cards in your focus row. Replace each with a level-II card of the same type." },
      { name: "University of Sankore", era: "medieval", cost: 9, auto: true,
        effect: "At the end of your turn, if you replaced (tech upgrade) 1 or more of your focus cards this turn, you may swap any 2 non-science cards in your focus row." },
      { name: "Porcelain Tower", era: "medieval", cost: 9, auto: true,
        effect: "When you build this wonder, replace up to 2 cards in your focus row with cards of the next highest tech level of the same type." },
      { name: "Potala Palace", era: "medieval", cost: 10, auto: true,
        effect: "You can have 4 diplomacy cards from each other player. When you build this wonder, you may take a total of 3 diplomacy cards of your choice from other players." },
      { name: "Oxford University", era: "modern", cost: 10,
        effect: "When you replace (tech upgrade) a focus card other than a science focus card, you do not have to replace it with a card of the same type." },
      { name: "Amundsen-Scott Research Station", era: "modern", cost: 10, auto: true,
        effect: "When you build this wonder, build a city on any legal space on the edge of the map and place this wonder in that city. THEN, place up to 2 control tokens in spaces adjacent to that city." },
      { name: "Kremlin", era: "modern", cost: 11, auto: true,
        effect: "When attacking a rival space (not city-state), increase your combat value by 4 if you have more reinforced control tokens on the map than the defending player." }
    ]
  };

  // Attach the printed resource eligibility to the executable wonder objects,
  // so references, affordability previews and the authoritative action all use
  // the same data instead of maintaining parallel name checks.
  Object.values(WONDER_DECKS).forEach((deck) => {
    deck.forEach((wonder) => {
      wonder.eligibleResources = (WONDER_RESOURCE_ELIGIBILITY[wonder.name] || []).slice();
    });
  });

  const CITY_STATES = {
    Carthage: {
      type: "military", effectId: "carthage_combat",
      diplomacy: "When defending or when attacking a target other than Carthage, increase your combat value by 1 for each city-state token and friendly city within 2 spaces of the defending space."
    },
    Kumasi: {
      type: "culture", effectId: "kumasi_forest",
      diplomacy: "When resolving your industry or culture focus card, the terrain difficulty of forest spaces is 1."
    },
    Brussels: {
      type: "industry", effectId: "brussels_wonder_cost",
      diplomacy: "When you are building a wonder, reduce its cost by 1 for each of your mature cities."
    },
    Seoul: {
      type: "science", effectId: "seoul_barbarian",
      diplomacy: "At the start of your turn, you may move 1 barbarian to an adjacent non-water empty space."
    },
    "Buenos Aires": {
      type: "industry", effectId: "buenos_aires_wonder_cost",
      diplomacy: "When you are building a wonder, reduce its cost by 2 if you do not already have a wonder of that type."
    },
    Kabul: {
      type: "military", effectId: "kabul_attack",
      diplomacy: "When attacking a city or city-state other than Kabul, increase your combat value by 3."
    },
    Geneva: {
      type: "science", effectId: "geneva_swap_diplomacy",
      diplomacy: "At the start of your turn, you may return 1 diplomacy card you have taken from another player. If you do, choose and take a different diplomacy card from that player."
    },
    "Mohenjo Daro": {
      type: "culture", effectId: "mohenjo_control_difficulty",
      diplomacy: "When placing control tokens, reduce the terrain difficulty of all spaces by 1."
    },
    Auckland: {
      type: "industry", effectId: "auckland_city_building",
      diplomacy: "When building a city, you can count through water spaces, and the terrain difficulty of all spaces adjacent to water is 1."
    },
    Akkad: {
      type: "military", effectId: "akkad_movement",
      diplomacy: "Your armies can move through spaces containing rival control tokens."
    },
    Antananarivo: {
      type: "culture", effectId: "antananarivo_city",
      diplomacy: "During your turn, Antananarivo is treated as one of your cities and not as a city-state. Your armies cannot end their movement in Antananarivo's space."
    },
    Palenque: {
      type: "science", effectId: "palenque_resource_trade",
      diplomacy: "When resolving a focus card, you may spend resource tokens (not natural wonder tokens) as trade tokens on that card."
    }
  };

  // The four player diplomacy cards. Each player holds one set; a caravan
  // trading at a rival city hands one of these to that rival.
  // Each player has a set of five diplomacy cards in their own colour, and gets
  // no effect from their own (base p13). The wording below is off the printed
  // cards in assets/tts-web/cards/diplomacy, which name the giver by colour:
  // "the purple player's capital", and so on.
  const DIPLOMACY_CARDS = {
    joint_war: {
      name: "Joint War",
      effect: "+2 attacking, except against the giver.",
      text: "When attacking, increase your combat value by 2 unless you are attacking the player who gave you this card."
    },
    defensive_pact: {
      name: "Defensive Pact",
      effect: "+2 defending, except against the giver.",
      text: "When defending, increase your combat value by 2 unless the player who gave you this card is attacking."
    },
    non_aggression: {
      name: "Non-Aggression Pact",
      effect: "You cannot attack the giver; if they attack you, swap your military card.",
      text: "You cannot attack or destroy the pieces of the player who gave you this card. If that player attacks or destroys any of your pieces, you may return this card to swap your military focus card with any other card in your focus row."
    },
    embassy: {
      name: "Embassy",
      effect: "A caravan to the giver's capital pays them trade and pays you a resource.",
      text: "When you move a caravan to the capital of the player who gave you this card (including the one used to take it), place 1 trade token from the supply on a card in that player's focus row. Then, gain 1 resource of your choice from the supply."
    },
    open_borders: {
      name: "Open Borders",
      effect: "The giver's cities and control tokens count as friendly to you.",
      text: "The cities and control tokens of the player who gave you this card are friendly to you for the purposes of your districts' effects and your cities' maturity."
    }
  };

  // Forms of government (Terra Incognita p22). You start without one. When the
  // event dial reaches the government symbol every player may change theirs: you
  // pick one of your focus cards sitting in one of the two "1" places and put the
  // marker of the same type on it — so each government belongs to exactly one
  // focus card type. You hold one marker at a time; a new choice moves it.
  //
  // A card carrying a marker is resolved as if it sat `shift` places further
  // right, and the marker prints that number as arrows beside its focus icon.
  // These were all 2 on the reasoning that the set ought to be symmetrical;
  // the markers in assets/tts-web/tokens/gov* say otherwise. Four of them
  // print two arrows, but Communism and Democracy print one — the two whose
  // focus types are the strongest to shift, which is why they are cheaper.
  const GOVERNMENTS = {
    culture:  { name: "Republic",  shift: 2 },
    growth:   { name: "Monarchy",  shift: 2 },
    science:  { name: "Democracy", shift: 1 },
    economy:  { name: "Oligarchy", shift: 2 },
    military: { name: "Autocracy", shift: 2 },
    industry: { name: "Communism", shift: 1 }
  };

  // A victory card is divided into TWO agendas and you complete either one to
  // claim the card (base p12). These pairings used to be invented, because
  // neither rulebook lists them; they are now read off the printed cards in
  // assets/tts-web/cards/victory. Which two agendas share a card decides what
  // is reachable in a game — three of the ten are drawn each time (Terra p8)
  // and either half claims its card — so a wrong pairing is a wrong game.
  //
  // The two fort cards carry a single agenda each and must be held: lose the
  // fort and the claim goes with it.
  const VICTORY_CARDS = [
    { id: "vc-forts-1",   fortress: true, agendas: ["fortified"] },
    { id: "vc-forts-2",   fortress: true, agendas: ["expeditionary"] },
    { id: "vc-cities",    agendas: ["populous", "preservationist"] },
    { id: "vc-war",       agendas: ["warmonger", "paranoid"] },
    { id: "vc-spread",    agendas: ["civilized", "money_grubber"] },
    { id: "vc-reach",     agendas: ["explorer", "aesthetic"] },
    { id: "vc-shield",    agendas: ["defensive", "devastating"] },
    { id: "vc-learned",   agendas: ["technophile", "scholarly"] },
    { id: "vc-provinces", agendas: ["provincial", "diversified"] },
    { id: "vc-works",     agendas: ["industrious", "progressive"] },
    { id: "vc-empire",    agendas: ["expansionist", "prolific"] },
    { id: "vc-envoys",    agendas: ["diplomatic", "hoarder"] }
  ];

  const AGENDA_CARDS = [
    { id: "fortified", name: "Fortified", fortress: true, description: "Control 1 or more fortress cities." },
    { id: "expeditionary", name: "Expeditionary", fortress: true, description: "Control 2 or more fortress cities." },
    { id: "warmonger", name: "Warmonger", description: "Defeat 1 rival capital or control 2 conquered city-states." },
    { id: "paranoid", name: "Paranoid", description: "Control 2 military world wonders." },
    { id: "civilized", name: "Civilized", description: "Have 8 cities on the map." },
    { id: "money_grubber", name: "Money Grubber", description: "Control 2 economic world wonders." },
    { id: "defensive", name: "Defensive", description: "Have 15 reinforced control tokens." },
    { id: "devastating", name: "Devastating", description: "Win an attack as the attacker with a total combat value of 16 or more." },
    { id: "diplomatic", name: "Diplomatic", description: "Have 4 diplomacy cards from different sources." },
    { id: "hoarder", name: "Hoarder", description: "Have 5 resource and/or natural wonder tokens." },
    { id: "explorer", name: "Explorer", description: "Control 15 spaces adjacent to water or map edge." },
    { id: "aesthetic", name: "Aesthetic", description: "Control 2 cultural world wonders." },
    { id: "industrious", name: "Industrious", description: "Have 5 districts on the map." },
    { id: "provincial", name: "Provincial", description: "Have 1 mature city on 4 different map tiles. Forts count as their own tile." },
    { id: "diversified", name: "Diversified", description: "Control 3 different types of world wonders." },
    { id: "populous", name: "Populous", description: "Control 5 mature cities." },
    { id: "preservationist", name: "Preservationist", description: "Control 2 natural wonders." },
    { id: "expansionist", name: "Expansionist", description: "Control a city on 6 different map tiles. Forts count as their own tile." },
    { id: "prolific", name: "Prolific", description: "Control 2 wonders from the same era." },
    { id: "progressive", name: "Progressive", description: "Control 1 world wonder from each era." },
    // Terra replaces the base game's Technophile/Scholarly victory card with its
    // own (Terra p2, setup step 6).
    { id: "technophile", name: "Technophile", description: "Have 3 level-IV focus cards in your focus row." },
    { id: "scholarly", name: "Scholarly", description: "Control 2 scientific world wonders." }
  ];

  // Leader roster — transcribed from the physical Terra Incognita leader
  // sheets. focusOrder: the sheet lists 5 starting cards for slots 1-5; the
  // Growth card sits on the extra duplicate-"1" slot at the far left of the
  // extended focus bar. `unique` is the civ's unique focus card; `auto: true`
  // means the engine enforces it, otherwise it is shown as a table reminder.
  // Abilities marked `manual: true` are reminders too (resolve via Host Tools).
  // An emblem and a colour per civilization. Eighteen names in a list all look
  // the same; a glyph and a colour each give them an identity in the picker, on
  // the civ card and in the player list.
  const CIV_STYLE = {
    america:     { emblem: "\ud83e\udd85", color: "#3f6fb5" },
    aztec:       { emblem: "\ud83c\udf1e", color: "#c0632b" },
    china:       { emblem: "\ud83d\udc09", color: "#c62828" },
    egypt:       { emblem: "\ud83d\udd3a", color: "#d4a017" },
    england:     { emblem: "\ud83d\udc51", color: "#8e2f45" },
    france:      { emblem: "\u269c\ufe0f", color: "#4a63b8" },
    georgia:     { emblem: "\ud83c\udf47", color: "#7b3f8f" },
    japan:       { emblem: "\ud83c\udf38", color: "#d1567f" },
    inca:        { emblem: "\ud83c\udfd4\ufe0f", color: "#c9a227" },
    indonesia:   { emblem: "\ud83c\udf0a", color: "#1e8a8a" },
    netherlands: { emblem: "\ud83c\udf37", color: "#e07b1f" },
    nubia:       { emblem: "\ud83c\udff9", color: "#a8642a" },
    ottoman:     { emblem: "\ud83c\udf19", color: "#1f7a4d" },
    poland:      { emblem: "\ud83e\udd85", color: "#b03050" },
    rome:        { emblem: "\ud83e\udd85", color: "#9e2b2b" },
    scythia:     { emblem: "\ud83c\udff9", color: "#b58b2e" },
    sumeria:     { emblem: "\ud83d\udcdc", color: "#6a7f3a" },
    zulu:        { emblem: "\ud83d\udee1\ufe0f", color: "#2f6b4f" }
  };

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
    WONDER_RESOURCE_ELIGIBILITY,
    NATURAL_WONDER_RESOURCES,
    CITY_STATES,
    DIPLOMACY_CARDS,
    AGENDA_CARDS,
    VICTORY_CARDS,
    GOVERNMENTS,
    CIV_STYLE,
    LEADERS
  };
})();
