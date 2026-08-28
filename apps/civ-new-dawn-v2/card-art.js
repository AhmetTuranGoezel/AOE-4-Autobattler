"use strict";

// Semantic registry for the browser-visible Tabletop Simulator artwork.
//
// The old loader pointed at ignored assets/mod/*.jpg sprite sheets, so card art
// silently disappeared for browser-only collaborators. Every path below is a
// tracked WebP in assets/tts-web; no local download, directory scan, or catalog
// fetch is required at runtime. Keep gameplay state out of this module.

(function () {
  const ROOT = "assets/tts-web/";
  const FOCUS_ROOT = ROOT + "cards/focus/";
  const CIV_ROOT = ROOT + "cards/civilizations/";
  const TOKEN_ROOT = ROOT + "tokens/";

  const PLAYER_COLORS = [
    { id: "blue", label: "Blue", value: "#169eae" },
    { id: "red", label: "Red", value: "#d94747" },
    { id: "orange", label: "Orange", value: "#e88b24" },
    { id: "green", label: "Green", value: "#76a94f" },
    { id: "purple", label: "Purple", value: "#8b62b5" }
  ];

  // Standard player focus cards. Rows are tech levels, columns are the five
  // physical component colors. The two oddly named source crops are genuine:
  // red Astrology was tagged "astronomy" and blue Mass Production had no name.
  const FOCUS = {
    culture: {
      1: { red: "early-empire__deck-212-cell-05__f4337b8203bdab20.webp", blue: "early-empire__deck-216-cell-05__ae192125ae7401d6.webp", green: "early-empire__deck-220-cell-05__5c331a12da76a4e5.webp", orange: "early-empire__deck-224-cell-05__29cc9a89a384523e.webp", purple: "early-empire__deck-228-cell-05__55bac63678d8f131.webp" },
      2: { red: "drama-and-poetry__deck-213-cell-05__88e3818a2ebdd083.webp", blue: "drama-and-poetry__deck-217-cell-05__585dfcb4eea120eb.webp", green: "drama-and-poetry__deck-221-cell-05__8a7ce9b8b146ee9b.webp", orange: "drama-and-poetry__deck-225-cell-05__a17830522982d9e7.webp", purple: "drama-and-poetry__deck-229-cell-05__0ce102e584da3112.webp" },
      3: { red: "civil-service__deck-214-cell-05__8d3e999f96a86923.webp", blue: "civil-service__deck-218-cell-05__f6a5e51ba839b992.webp", green: "civil-service__deck-222-cell-05__b73847fafce36709.webp", orange: "civil-service__deck-226-cell-05__8df7c12085d6f83b.webp", purple: "civil-service__deck-232-cell-05__9485a10975f518a1.webp" },
      4: { red: "mass-media__deck-215-cell-05__0f31d959a139c7e2.webp", blue: "mass-media__deck-219-cell-05__d2ff442015c4a4d0.webp", green: "mass-media__deck-223-cell-05__72c30a04a05633f9.webp", orange: "mass-media__deck-227-cell-05__2582a21d6b12846e.webp", purple: "mass-media__deck-239-cell-05__2b6df6bc814b9cd1.webp" }
    },
    growth: {
      1: { red: "irrigation__deck-212-cell-00__7b7ccf45a9f913c2.webp", blue: "irrigation__deck-216-cell-00__200485ce182fa872.webp", green: "irrigation__deck-220-cell-00__2b29529aa50c3069.webp", orange: "irrigation__deck-224-cell-00__35d6d011b4b6f98f.webp", purple: "irrigation__deck-228-cell-00__475cdd546f91d00f.webp" },
      2: { red: "engineering__deck-213-cell-00__29efe5a2fc2ee615.webp", blue: "engineering__deck-217-cell-00__303d753132e61e34.webp", green: "engineering__deck-221-cell-00__34e8876105c47fe8.webp", orange: "engineering__deck-225-cell-00__149381e11bf4da83.webp", purple: "engineering__deck-229-cell-00__6f2fb78fb94f626a.webp" },
      3: { red: "sanitation__deck-214-cell-00__0eb3bc0967e27666.webp", blue: "sanitation__deck-218-cell-00__b44e46a71458ff33.webp", green: "sanitation__deck-222-cell-00__0956997b4e18d1d2.webp", orange: "sanitation__deck-226-cell-00__c2313362f35cf896.webp", purple: "sanitation__deck-232-cell-00__99e942b10006454c.webp" },
      4: { red: "globalization__deck-215-cell-00__214cb6b03acffcb2.webp", blue: "globalization__deck-219-cell-00__3a7faeeb6bd7b5e9.webp", green: "globalization__deck-223-cell-00__b8c079b882ed2cdc.webp", orange: "globalization__deck-227-cell-00__926afdc72c93effe.webp", purple: "globalization__deck-239-cell-00__c59a9c6abd72fa62.webp" }
    },
    science: {
      1: { red: "astronomy__deck-212-cell-03__bac008d8c8dfd653.webp", blue: "astrology__deck-216-cell-03__5d799f9ae4a4bc96.webp", green: "astrology__deck-220-cell-03__aa24c9292a132f4a.webp", orange: "astrology__deck-224-cell-03__44414bc76962fe75.webp", purple: "astrology__deck-228-cell-03__519338d29201208f.webp" },
      2: { red: "mathematics__deck-213-cell-03__990794bc725a0b17.webp", blue: "mathematics__deck-217-cell-03__34fa458d8165ce6f.webp", green: "mathematics__deck-221-cell-03__b6d37fd58e244d8c.webp", orange: "mathematics__deck-225-cell-03__5fe8179b614a928a.webp", purple: "mathematics__deck-229-cell-03__f3e1d55585af0c15.webp" },
      3: { red: "replaceable-parts__deck-214-cell-03__b45e1dce6603de19.webp", blue: "replaceable-parts__deck-218-cell-03__1341b9d53ac3deec.webp", green: "replaceable-parts__deck-222-cell-03__0a20db690e5d6283.webp", orange: "replaceable-parts__deck-226-cell-03__9d4919fdd3aafee9.webp", purple: "replaceable-parts__deck-232-cell-03__350860d9e9e7b9b6.webp" },
      4: { red: "nuclear-power__deck-215-cell-03__9dd61db04bf7e166.webp", blue: "nuclear-power__deck-219-cell-03__e4348f77afa89182.webp", green: "nuclear-power__deck-223-cell-03__af32b5325f855c31.webp", orange: "nuclear-power__deck-227-cell-03__41a1db5c5b323a5b.webp", purple: "nuclear-power__deck-239-cell-03__c2bfce4986619b1c.webp" }
    },
    economy: {
      1: { red: "foreign-trade__deck-212-cell-01__b644bc2e5278233d.webp", blue: "foreign-trade__deck-216-cell-01__099a609a81d22819.webp", green: "foreign-trade__deck-220-cell-01__bd2fc52bf069b257.webp", orange: "foreign-trade__deck-224-cell-01__4f5edb5180a3056d.webp", purple: "foreign-trade__deck-228-cell-01__eb6b545a52b786ee.webp" },
      2: { red: "currency__deck-213-cell-01__b6255fe43c27589f.webp", blue: "currency__deck-217-cell-01__d8385c88d454e3ed.webp", green: "currency__deck-221-cell-01__aaaca4e01a2f85bd.webp", orange: "currency__deck-225-cell-01__4998511d9fa8bc9d.webp", purple: "currency__deck-229-cell-01__9d62f032bef1c43b.webp" },
      3: { red: "steam-power__deck-214-cell-01__d4d3d1b734cc167c.webp", blue: "steam-power__deck-218-cell-01__e521566558a3fceb.webp", green: "steam-power__deck-222-cell-01__737213654414fe28.webp", orange: "steam-power__deck-226-cell-02__e447d3d902b6a18d.webp", purple: "steam-power__deck-232-cell-01__cb91ad74c4324624.webp" },
      4: { red: "capitalism__deck-215-cell-01__8ab5bca8354ea737.webp", blue: "capitalism__deck-219-cell-01__f621512678491d86.webp", green: "capitalism__deck-223-cell-01__65cdd7692b810a7a.webp", orange: "capitalism__deck-227-cell-01__058f032d3120410b.webp", purple: "capitalism__deck-239-cell-01__3991351e8f0c21c6.webp" }
    },
    military: {
      1: { red: "masonry__deck-212-cell-02__1856f065b0543bf0.webp", blue: "masonry__deck-216-cell-02__2f90382c3aa63728.webp", green: "masonry__deck-220-cell-02__c719a8aa872650cd.webp", orange: "masonry__deck-224-cell-02__39c9760872adcf5b.webp", purple: "masonry__deck-228-cell-02__ad3036e8c7a66b53.webp" },
      2: { red: "iron-working__deck-213-cell-02__e92c53bcccd69f69.webp", blue: "iron-working__deck-217-cell-02__8bdaf66792beccdd.webp", green: "iron-working__deck-221-cell-02__30e370128a36e236.webp", orange: "iron-working__deck-225-cell-02__14d03de421d680c4.webp", purple: "iron-working__deck-229-cell-02__8753c3bcc14dbc48.webp" },
      3: { red: "mass-production__deck-214-cell-02__2796b2edbcbe4728.webp", blue: "deck-218-card-02__deck-218-cell-02__0beb6834ca6a4a68.webp", green: "mass-production__deck-222-cell-02__b0a21fedb5ecbb53.webp", orange: "mass-production__deck-226-cell-01__8dcfb766e520acbb.webp", purple: "mass-production__deck-232-cell-02__eee576e2f3498b72.webp" },
      4: { red: "flight__deck-215-cell-02__773c8d6fe743d01f.webp", blue: "flight__deck-219-cell-02__17c461fb4a6f5481.webp", green: "flight__deck-223-cell-02__0e91a339f23dc233.webp", orange: "flight__deck-227-cell-02__a7c83f3bde9c6c17.webp", purple: "flight__deck-239-cell-02__8e4fd41bca769bc0.webp" }
    },
    industry: {
      1: { red: "pottery__deck-212-cell-04__c891e261b4e5a7c1.webp", blue: "pottery__deck-216-cell-04__f9361333bb03ba96.webp", green: "pottery__deck-220-cell-04__bd71586fa4e58ab2.webp", orange: "pottery__deck-224-cell-04__4e6ccce1c5bf567c.webp", purple: "pottery__deck-228-cell-04__d4a24584d6f60f4c.webp" },
      2: { red: "animal-husbandry__deck-213-cell-04__70ea0285cebc0521.webp", blue: "animal-husbandry__deck-217-cell-04__b94f32112662bc82.webp", green: "animal-husbandry__deck-221-cell-04__99479c9a3808d72e.webp", orange: "animal-husbandry__deck-225-cell-04__58e2b47a7ab35fed.webp", purple: "animal-husbandry__deck-229-cell-04__80d54985cac0eb8f.webp" },
      3: { red: "nationalism__deck-214-cell-04__f6d8cd3c90c5feda.webp", blue: "nationalism__deck-218-cell-04__920dd70fda09667e.webp", green: "nationalism__deck-222-cell-04__84637b85ab66860d.webp", orange: "nationalism__deck-226-cell-04__8cca559db3b08a14.webp", purple: "nationalism__deck-232-cell-04__079bb59094f3c73a.webp" },
      4: { red: "urbanization__deck-215-cell-04__831ce0cd911a6d0d.webp", blue: "urbanization__deck-219-cell-04__9f2715987c38d1d2.webp", green: "urbanization__deck-223-cell-04__24ff7584a422e1a1.webp", orange: "urbanization__deck-227-cell-04__a72d402a5b8b3917.webp", purple: "urbanization__deck-239-cell-04__e1503802a7717535.webp" }
    }
  };

  const UNIQUE = {
    america: "radio__deck-211-cell-00__06da2cfb3844b5c8.webp",
    aztec: "mysticism__deck-211-cell-01__2afc5f4e09ed4ffe.webp",
    china: "writing__deck-211-cell-02__73b4264d37c8de25.webp",
    egypt: "wheel__deck-211-cell-03__a58f8a98bbc5f1c0.webp",
    england: "natural-history__deck-211-cell-04__b8e38dbded3b554e.webp",
    france: "humanism__deck-211-cell-05__587cecdef45565de.webp",
    georgia: "siege-tactics__deck-211-cell-06__fbb83c74ea21db17.webp",
    inca: "state-workforce__deck-211-cell-07__af38a98db024b996.webp",
    indonesia: "shipbuilding__deck-211-cell-08__bf6e19a566301c40.webp",
    japan: "industrialization__deck-211-cell-09__f95b3c889e4f1e56.webp",
    netherlands: "cartography__deck-211-cell-10__6657c8745985d678.webp",
    nubia: "construction__deck-211-cell-11__1c976b1afe480b25.webp",
    ottoman: "banking__deck-211-cell-12__1b8a7514ce834092.webp",
    poland: "astronomy__deck-211-cell-13__d61ea14125641dce.webp",
    rome: "military-engineering__deck-211-cell-14__1c927124f4f87ae1.webp",
    scythia: "horseback-riding__deck-211-cell-15__8607a5b3975aaed5.webp",
    sumeria: "craftsmanship__deck-211-cell-16__f9e52761f531ef8c.webp",
    zulu: "scorched-earth__deck-211-cell-17__dac6eb42c8d35a4c.webp"
  };

  const CIVILIZATIONS = {
    america: "deck-195-card-00__deck-195-cell-00__e2499021bd9e7bd5.webp",
    aztec: "deck-195-card-01__deck-195-cell-01__84fa7bb2d4aa745c.webp",
    egypt: "deck-195-card-02__deck-195-cell-02__6cb682624079aa25.webp",
    france: "deck-195-card-03__deck-195-cell-03__dca70508e18d4abf.webp",
    japan: "deck-195-card-04__deck-195-cell-04__fb2c438128eab837.webp",
    rome: "deck-195-card-05__deck-195-cell-05__f298565d6528d593.webp",
    scythia: "deck-195-card-06__deck-195-cell-06__539076635899f004.webp",
    sumeria: "deck-195-card-07__deck-195-cell-07__1f5a653719701df3.webp",
    china: "deck-196-card-00__deck-196-cell-00__d01d1209c4cbfbf1.webp",
    england: "deck-196-card-01__deck-196-cell-01__2684698434631406.webp",
    georgia: "deck-196-card-02__deck-196-cell-02__e7393135ca3c2808.webp",
    inca: "deck-196-card-03__deck-196-cell-03__3741f6f1ef53348b.webp",
    indonesia: "deck-196-card-04__deck-196-cell-04__7ed4fbfac0705759.webp",
    netherlands: "deck-196-card-05__deck-196-cell-05__e8318ec33811aa08.webp",
    nubia: "deck-196-card-06__deck-196-cell-06__c505e9b927b1ee1d.webp",
    ottoman: "deck-196-card-07__deck-196-cell-07__e6c281c011a9f5ca.webp",
    poland: "deck-196-card-08__deck-196-cell-08__4302c3a6de1ffe0a.webp",
    zulu: "deck-196-card-09__deck-196-cell-09__006161698a948012.webp"
  };

  const TECH_DIALS = {
    purple: "science__image-face__ugc-1883095391877772690__5167d141f0c33adb.webp",
    blue: "science__image-face__ugc-1994562021176698181__c1efcf1c729fcce0.webp",
    red: "science__image-face__ugc-1994562021176698327__11d5299fe10259fe.webp",
    green: "science__image-face__ugc-1994562021176698590__8f8a32dd64d192d6.webp",
    orange: "science__image-face__ugc-1994562021176699079__b05d5eef2e52f8eb.webp"
  };

  const FOCUS_BARS = {
    blue: "asset__image-face__ugc-1658972912263156766__c62f7490e9197040.webp",
    red: "asset__image-face__ugc-1658972912263159628__92e5d097aea25893.webp",
    orange: "asset__image-face__ugc-1658972912263160944__223dace18ea9744f.webp",
    green: "asset__image-face__ugc-1658972912263162640__bfb6e85af654a4bb.webp",
    purple: "asset__image-face__ugc-1658972912263164399__f94c3acab9cf143f.webp"
  };

  const LEGACY_COLOR_IDS = {
    "#e63946": "red", "#457b9d": "blue", "#2a9d8f": "blue",
    "#e9c46a": "orange", "#9b5de5": "purple", "#f77f00": "orange"
  };

  function colorId(value) {
    const raw = String(value || "").toLowerCase();
    const exact = PLAYER_COLORS.find((c) => c.id === raw || c.value.toLowerCase() === raw);
    if (exact) return exact.id;
    if (LEGACY_COLOR_IDS[raw]) return LEGACY_COLOR_IDS[raw];

    const match = raw.match(/^#([0-9a-f]{6})$/);
    if (!match) return "blue";
    const n = Number.parseInt(match[1], 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    let best = PLAYER_COLORS[0];
    let bestDistance = Infinity;
    PLAYER_COLORS.forEach((candidate) => {
      const c = Number.parseInt(candidate.value.slice(1), 16);
      const other = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      const distance = rgb.reduce((sum, part, i) => sum + (part - other[i]) ** 2, 0);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    });
    return best.id;
  }

  function styleFor(path) {
    return path ? `background-image:url("${path}");` : "";
  }

  function focusUrl(type, tier, color) {
    const row = FOCUS[type] && FOCUS[type][Math.max(1, Math.min(4, Number(tier) || 1))];
    if (!row) return "";
    return FOCUS_ROOT + (row[colorId(color)] || row.blue || row.red);
  }

  function uniqueUrl(leaderId) {
    const file = UNIQUE[String(leaderId || "").toLowerCase()];
    return file ? FOCUS_ROOT + file : "";
  }

  function civilizationUrl(leaderId) {
    const file = CIVILIZATIONS[String(leaderId || "").toLowerCase()];
    return file ? CIV_ROOT + file : "";
  }

  const CivCardArt = {
    // Kept async for callers written for the old manifest loader.
    load: () => Promise.resolve(true),
    available: () => true,
    colors: PLAYER_COLORS.map((c) => ({ ...c })),
    colorId,
    focusUrl,
    uniqueUrl,
    civilization: civilizationUrl,
    focus(type, tier, color) { return styleFor(focusUrl(type, tier, color)); },
    unique(leaderId) { return styleFor(uniqueUrl(leaderId)); },
    civilizationStyle(leaderId) { return styleFor(civilizationUrl(leaderId)); },
    techDial(color) { return TOKEN_ROOT + TECH_DIALS[colorId(color)]; },
    focusBar(color) { return TOKEN_ROOT + FOCUS_BARS[colorId(color)]; },
    ibrahim() { return FOCUS_ROOT + "deck-201-card-00__deck-201-cell-00__6b20af35a0e9c3cc.webp"; }
  };

  window.CivCardArt = CivCardArt;
})();
