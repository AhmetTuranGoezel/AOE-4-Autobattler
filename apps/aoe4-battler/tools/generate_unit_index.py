from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


CIV_ORDER = [
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
]

UNIT_REPLACEMENTS = {
    "Chinese": {"Crossbow": "Zhuge Nu"},
    "Jin Dynasty": {"Archer": "Mohe Tribesman", "Knight/Lancer": "Iron Pagoda", "Handcannoneer": "Eruptor"},
}

TYPE_ORDER = [
    "Light Infantry",
    "Heavy Infantry",
    "Ranged Infantry",
    "Light Cavalry",
    "Heavy Cavalry",
    "Ranged Cavalry",
    "Elephants",
    "Siege",
]


def get_unit_category(tags: list[str]) -> str:
    tag_set = set(tags or [])
    has_infantry = "Infantry" in tag_set
    has_cavalry = "Cavalry" in tag_set
    has_heavy = "Heavy" in tag_set
    has_ranged = "Ranged" in tag_set
    has_elephant = "Elephant" in tag_set
    has_light = "Light Infantry" in tag_set
    has_siege = "Siege" in tag_set

    if has_siege:
        return "Siege"
    if has_elephant:
        return "Elephants"
    if has_cavalry and has_ranged:
        return "Ranged Cavalry"
    if has_cavalry and has_heavy:
        return "Heavy Cavalry"
    if has_cavalry:
        return "Light Cavalry"
    if has_infantry and has_ranged:
        return "Ranged Infantry"
    if has_infantry and has_heavy:
        return "Heavy Infantry"
    if has_infantry and has_light:
        return "Light Infantry"
    if has_infantry:
        return "Light Infantry"
    return "Light Infantry"


def extract_ages(weapons: dict) -> list[int]:
    ages: set[int] = set()
    for weapon in (weapons or {}).values():
        for key in (weapon.get("ages") or {}).keys():
            try:
                ages.add(int(key))
            except (TypeError, ValueError):
                continue
    return sorted(ages)


def build_units_by_civ(units_meta: dict[str, dict]) -> dict[str, list[str]]:
    units_by_civ: dict[str, list[str]] = {}
    all_units = sorted(units_meta.keys())

    units_by_civ["All"] = all_units
    for civ in CIV_ORDER:
        if civ == "Common":
            units_by_civ[civ] = sorted(
                name for name, meta in units_meta.items() if "Common" in meta["civs"]
            )
            continue

        replacements = UNIT_REPLACEMENTS.get(civ, {})
        replaced_commons = set(replacements.keys())
        visible = []
        for name, meta in units_meta.items():
            civs = meta["civs"]
            except_civs = meta["exceptCivs"]
            belongs = civ in civs or "Common" in civs
            if not belongs:
                continue
            if civ in except_civs:
                continue
            if "Common" in civs and name in replaced_commons:
                continue
            visible.append(name)
        units_by_civ[civ] = sorted(visible)
    return units_by_civ


def main() -> None:
    app_dir = Path(__file__).resolve().parent.parent
    source_path = app_dir / "units_restructured.json"
    out_path = app_dir / "units_index.json"

    with source_path.open(encoding="utf-8") as f:
        units = json.load(f)

    all_tags: set[str] = set()
    units_meta: dict[str, dict] = {}
    for name, unit in sorted(units.items()):
        tags = unit.get("tags") or []
        all_tags.update(tags)
        units_meta[name] = {
            "name": name,
            "civs": unit.get("civs") or ["Common"],
            "exceptCivs": unit.get("exceptCivs") or [],
            "costs": unit.get("costs") or {},
            "trainingTime": unit.get("trainingTime", 0),
            "population": unit.get("population", 1),
            "speed": unit.get("speed", 0),
            "tags": tags,
            "category": get_unit_category(tags),
            "weaponModes": sorted((unit.get("weapons") or {}).keys()),
            "ages": extract_ages(unit.get("weapons") or {}),
            "hasAuras": bool(unit.get("auras")),
            "hasEffects": bool(unit.get("effects")),
        }

    index = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedFrom": "units_restructured.json",
        "civOrder": CIV_ORDER,
        "typeOrder": TYPE_ORDER,
        "unitReplacements": UNIT_REPLACEMENTS,
        "allTags": sorted(all_tags),
        "units": units_meta,
        "unitsByCiv": build_units_by_civ(units_meta),
    }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=True)
        f.write("\n")

    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
