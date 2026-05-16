export const CIV_ORDER = [
  "Common",
  "English",
  "French",
  "Holy Roman Empire",
  "Mongols",
  "Rus",
  "Delhi Sultanate",
  "Abbasid Dynasty",
  "Chinese",
  "Ottomans",
  "Malians",
  "Byzantines",
  "Japanese",
  "Ayyubids",
  "Jeanne d'Arc",
  "Order of the Dragon",
  "Zhu Xi's Legacy",
  "House of Lancaster",
  "Knights Templar",
  "Golden Horde",
  "Macedonian Dynasty",
  "Sengoku Daimyo",
  "Tughlaq Dynasty",
  "Jin Dynasty",
];

export const CIV_FLAGS = {
  "English": "assets/flags/English_AoE4.webp",
  "French": "assets/flags/French_AoE4.webp",
  "Holy Roman Empire": "assets/flags/HRE_AoE4.webp",
  "Mongols": "assets/flags/Mongols_AoE4.webp",
  "Rus": "assets/flags/Rus_AoE4.webp",
  "Delhi Sultanate": "assets/flags/Delhi_Sultanate_AoE4.webp",
  "Abbasid Dynasty": "assets/flags/Abbasid_Dynasty_AoE4.webp",
  "Chinese": "assets/flags/Chinese_AoE4.webp",
  "Ottomans": "assets/flags/Ottomans_AoE4.webp",
  "Malians": "assets/flags/Malians_AoE4.webp",
  "Byzantines": "assets/flags/Byzantines_AoE4.webp",
  "Japanese": "assets/flags/Japanese_AoE4.webp",
  "Ayyubids": "assets/flags/Ayyubids_AoE4.webp",
  "Jeanne d'Arc": "assets/flags/Jeanne_d_Arc_AoE4.webp",
  "Order of the Dragon": "assets/flags/Order_of_the_Dragon_AoE4.webp",
  "Zhu Xi's Legacy": "assets/flags/Zhu_Xis_Legacy_AoE4.webp",
  "House of Lancaster": "assets/flags/House_of_Lancaster_AoE4.webp",
  "Knights Templar": "assets/flags/Knights_Templar_AoE4.webp",
  "Golden Horde": "assets/flags/Golden_Horde_AoE4.webp",
  "Macedonian Dynasty": "assets/flags/Macedonian_Dynasty_AoE4.webp",
  "Sengoku Daimyo": "assets/flags/Sengoku_Daimyo_AoE4.webp",
  "Tughlaq Dynasty": "assets/flags/Tughlaq_Dynasty_AoE4.webp",
  "Jin Dynasty": "assets/flags/Jin_Dynasty_AoE4.webp",
};

export const UNIT_REPLACEMENTS = {
  "Chinese": { "Crossbow": "Zhuge Nu" },
  "Jin Dynasty": { "Archer": "Mohe Tribesman", "Knight/Lancer": "Iron Pagoda", "Handcannoneer": "Eruptor" },
};

export const TYPE_ORDER = [
  "Light Infantry",
  "Heavy Infantry",
  "Ranged Infantry",
  "Light Cavalry",
  "Heavy Cavalry",
  "Ranged Cavalry",
  "Elephants",
  "Siege",
];

export function getCivFlagHtml(civ, size = 18) {
  if (!civ || !CIV_FLAGS[civ]) return "";
  return `<img src="${CIV_FLAGS[civ]}" alt="${civ}" style="height:${size}px; border-radius:3px; vertical-align:middle;">`;
}

export function setFlagBackground(card, civs) {
  if (!card) return;
  card.classList.add("flag-card");
  const primary = civs[0];
  const secondary = civs[1];
  card.style.setProperty("--flag-bg", primary && CIV_FLAGS[primary] ? `url('${CIV_FLAGS[primary]}')` : "none");
  card.style.setProperty("--flag-bg-2", secondary && CIV_FLAGS[secondary] ? `url('${CIV_FLAGS[secondary]}')` : "none");
}
