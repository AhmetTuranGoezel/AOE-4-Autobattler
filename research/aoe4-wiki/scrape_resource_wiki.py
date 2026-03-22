#!/usr/bin/env python3
"""Scrape AoE4 resource gather rates and node amounts from the AoE4 wiki."""
import json
import re
import html as html_lib
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import subprocess

URL = "https://ageofempires.fandom.com/wiki/Resource_(Age_of_Empires_IV)"
API_URL = "https://ageofempires.fandom.com/api.php?action=parse&page=Resource_(Age_of_Empires_IV)&prop=wikitext&format=json"

DEFAULT_DATA = {
    "baseRates": {
        "sheep": 0.75,
        "berries": 0.69,
        "deer": 0.825,
        "boar": 0.9,
        "farm": 0.75,
        "wood": 0.9,
        "gold": 0.75,
        "stone": 0.75,
    },
    "civOverrides": {
        "House of Lancaster": {"sheep": 0.9},
        "Abbasid Dynasty": {"berries": 0.8625},
        "Ayyubids": {"berries": 0.8625},
        "Delhi Sultanate": {"berries": 0.8625},
        "Knights Templar": {"wood": 0.6},
    },
    "nodeAmounts": {
        "sheep": 200,
        "berries": 250,
        "deer": 350,
        "boar": 2400,
        "tree": 150,
        "goldVein": {"tiny": 1600, "small": 4000, "large": 8000},
        "stoneOutcrop": {"small": 1200, "large": 2400},
        "shoreFish": {"amount": 600, "rates": {"villager": 1, "fishingBoat": 0.675, "lodya": 1.2825}},
        "deepFish": {"amount": 1000, "rates": {"fishingBoat": 0.75, "lodya": 1.42}},
    },
    "starting": {
        "resources": {"food": 200, "wood": 150, "gold": 100, "stone": 0},
        "sheep": 5,
    },
}


def fetch_html(url):
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", "replace")
    except Exception:
        # Fallback to curl if urllib is blocked
        result = subprocess.run(
            ["curl.exe", "-s", "-L", "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", url],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        if result.returncode != 0 or not result.stdout:
            raise RuntimeError("curl fetch failed")
        return result.stdout


def fetch_wikitext():
    try:
        text = fetch_html(API_URL)
        payload = json.loads(text)
        return payload.get("parse", {}).get("wikitext", {}).get("*", "")
    except Exception:
        return ""


def clean(text):
    text = re.sub(r"<script.*?</script>", "", text, flags=re.S)
    text = re.sub(r"<style.*?</style>", "", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_number(text):
    m = re.search(r"\d+(?:\.\d+)?", text.replace(",", ""))
    return float(m.group(0)) if m else None


def parse_numbers(text):
    return [float(x) for x in re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))]


def map_resource_key(label):
    label = label.strip()
    if "Sheep" in label:
        return "sheep"
    if "Berry" in label:
        return "berries"
    if "Deer" in label:
        return "deer"
    if "Boar" in label:
        return "boar"
    if "Farm" in label:
        return "farm"
    if "Tree" in label:
        return "tree"
    if "Gold Vein" in label:
        return "goldVein"
    if "Stone Outcropping" in label:
        return "stoneOutcrop"
    if "Shoreline Fish" in label:
        return "shoreFish"
    if "Deep Water Fish" in label:
        return "deepFish"
    return None


def parse_overrides(res_key, rate_text):
    overrides = {}
    for num, civs in re.findall(r"([0-9.]+) for ([^)]+)", rate_text):
        rate = float(num)
        civ_list = [c.strip() for c in re.split(r",| and ", civs) if c.strip()]
        for civ in civ_list:
            overrides.setdefault(civ, {})[res_key] = rate
    return overrides


def strip_wiki(text):
    text = re.sub(r"\[\[File:[^\]]+\]\]", "", text, flags=re.I)
    text = re.sub(r"rowspan\s*=\s*\"?\d+\"?\|", "", text)
    text = re.sub(r"\{\{Resources\|[^}]*?=\s*([0-9,]+)[^}]*\}\}", r"\1", text)
    text = re.sub(r"\{\{4icons\|([^}]+)\}\}", r"\1", text)
    text = re.sub(r"\{\{tt\|([^|}]+)\|[^}]+\}\}", r"\1", text)
    text = re.sub(r"\{\{[^}]+\}\}", "", text)
    text = re.sub(r"\[\[([^|\]]+\|)?([^\]]+)\]\]", r"\2", text)
    text = text.replace("'''", "")
    text = text.replace("<br />", "\n")
    text = re.sub(r"\b\d+px\b", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_wiki_table(wikitext):
    header_idx = wikitext.find("=== Summary of resources and gather rates ===")
    if header_idx == -1:
        return None
    table_start = wikitext.find("{|", header_idx)
    table_end = wikitext.find("|}", table_start)
    if table_start == -1 or table_end == -1:
        return None

    table_text = wikitext[table_start:table_end]
    rows = table_text.split("\n|-")

    base_rates = {}
    civ_overrides = {}
    node_amounts = {}

    current_resource = None
    current_amount = None

    civ_aliases = {
        "HoL": "House of Lancaster",
        "KT": "Knights Templar",
    }

    for row in rows:
        lines = [ln for ln in row.splitlines() if ln.strip()]
        if not lines:
            continue

        cells = []
        buf = []
        for line in lines:
            if line.startswith("|") or line.startswith("!"):
                if buf:
                    cells.append("\n".join(buf))
                buf = [line[1:].strip()]
            else:
                buf.append(line.strip())
        if buf:
            cells.append("\n".join(buf))

        if not cells:
            continue

        # Skip header rows
        if strip_wiki(cells[0]).lower() == "resource":
            continue

        res_text = ""
        amt_text = ""
        rate_text = ""

        if len(cells) >= 3:
            res_text = strip_wiki(cells[0])
            amt_text = strip_wiki(cells[1])
            rate_text = strip_wiki(cells[2])
        elif len(cells) == 2:
            res_text_candidate = strip_wiki(cells[0])
            res_key_candidate = map_resource_key(res_text_candidate)
            if res_key_candidate:
                res_text = res_text_candidate
                amt_text = strip_wiki(cells[1])
                rate_text = ""
            else:
                res_text = current_resource or ""
                amt_text = current_amount or ""
                rate_text = strip_wiki(cells[1])
        elif len(cells) == 1:
            res_text = current_resource or ""
            amt_text = current_amount or ""
            rate_text = strip_wiki(cells[0])
        else:
            continue

        res_key = map_resource_key(res_text)
        if res_key:
            current_resource = res_text
            current_amount = amt_text

        # Amount parsing
        if res_key in ("goldVein", "stoneOutcrop"):
            size_key = None
            if res_text.lower().startswith("tiny"):
                size_key = "tiny"
            elif res_text.lower().startswith("small"):
                size_key = "small"
            elif res_text.lower().startswith("large"):
                size_key = "large"
            amt = parse_number(amt_text)
            if size_key and amt is not None:
                node_amounts.setdefault(res_key, {})[size_key] = int(amt)
        elif res_key:
            amt = parse_number(amt_text)
            if amt is not None:
                if res_key in ("shoreFish", "deepFish"):
                    node_amounts[res_key] = {"amount": int(amt)}
                else:
                    node_amounts[res_key] = int(amt)

        # Rate parsing
        if res_key:
            rate_key = "wood" if res_key == "tree" else res_key.replace("Vein", "").replace("Outcrop", "")
            if rate_text and rate_key in ("sheep", "berries", "deer", "boar", "farm", "wood", "gold", "stone"):
                # Overrides (explicit civ list)
                if ":" in rate_text and not rate_text.lower().startswith("all others"):
                    left, right = rate_text.split(":", 1)
                    rate_val = parse_number(right)
                    civs = [c.strip() for c in re.split(r",| and ", left) if c.strip()]
                    for civ in civs:
                        civ = civ_aliases.get(civ, civ)
                        if rate_val is not None:
                            civ_overrides.setdefault(civ, {})[rate_key] = rate_val

                # Overrides for shorthand civ tags (e.g., HoL, KT)
                for short, full in civ_aliases.items():
                    m = re.search(rf"{re.escape(short)}\s*:?\s*([0-9.]+)", rate_text)
                    if m:
                        civ_overrides.setdefault(full, {})[rate_key] = float(m.group(1))

                # Base rate from "All others" if present
                m_all = re.search(r"All others[:\s]*([0-9.]+)", rate_text, flags=re.I)
                if m_all:
                    base_rates[rate_key] = float(m_all.group(1))
                else:
                    nums = parse_numbers(rate_text)
                    if nums:
                        base_rates[rate_key] = nums[0]

        if res_key in ("shoreFish", "deepFish") and rate_text:
            nums = parse_numbers(rate_text)
            if nums:
                if res_key == "shoreFish":
                    node_amounts.setdefault(res_key, {})["rates"] = {
                        "villager": nums[0],
                        "fishingBoat": nums[1] if len(nums) > 1 else None,
                        "lodya": nums[2] if len(nums) > 2 else None,
                    }
                else:
                    node_amounts.setdefault(res_key, {})["rates"] = {
                        "fishingBoat": nums[0],
                        "lodya": nums[1] if len(nums) > 1 else None,
                    }

    return base_rates, civ_overrides, node_amounts


def parse_starting(page_text):
    starting = {"resources": {}, "sheep": None}
    m = re.search(r"food\s*=\s*(\d+)\|wood\s*=\s*(\d+)\|gold\s*=\s*(\d+)", page_text)
    if m:
        starting["resources"] = {
            "food": int(m.group(1)),
            "wood": int(m.group(2)),
            "gold": int(m.group(3)),
            "stone": 0,
        }
    sheep_match = re.search(r"start(?:s)?(?: out)? with\s+(\w+)\s+Sheep", page_text, flags=re.I)
    if sheep_match:
        word = sheep_match.group(1).lower()
        word_map = {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10,
        }
        starting["sheep"] = word_map.get(word, None)
    return starting


def main():
    base_dir = Path(__file__).resolve().parent
    battler_dir = base_dir.parent.parent / "apps" / "aoe4-battler"
    out_path = battler_dir / "bo_resource_data.json"
    wiki_text = fetch_wikitext()
    parsed = parse_wiki_table(wiki_text) if wiki_text else None
    base_rates, civ_overrides, node_amounts = (parsed or (None, None, None))
    starting = parse_starting(wiki_text or "")

    data = {
        "sourceUrl": URL,
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "baseRates": base_rates or DEFAULT_DATA["baseRates"],
        "civOverrides": civ_overrides or DEFAULT_DATA["civOverrides"],
        "nodeAmounts": node_amounts or DEFAULT_DATA["nodeAmounts"],
        "starting": {
            "resources": starting["resources"] or DEFAULT_DATA["starting"]["resources"],
            "sheep": starting["sheep"] or DEFAULT_DATA["starting"]["sheep"],
        },
    }

    # Fill missing keys with defaults
    for key, val in DEFAULT_DATA["baseRates"].items():
        data["baseRates"].setdefault(key, val)
    for civ, overrides in DEFAULT_DATA["civOverrides"].items():
        data["civOverrides"].setdefault(civ, overrides)
    for key, val in DEFAULT_DATA["nodeAmounts"].items():
        data["nodeAmounts"].setdefault(key, val)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
