#!/usr/bin/env python3
"""Scrape Technologies and Aura sections from AoE4 wiki for all units."""
import json, re, html, subprocess, time, sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BATTLER_DIR = BASE_DIR.parent.parent / "apps" / "aoe4-battler"
UNITS_PATH = BATTLER_DIR / "units_restructured.json"
WIKI_DATA_PATH = BASE_DIR / "wiki_data.json"

with UNITS_PATH.open('r', encoding='utf-8') as f:
    data = json.load(f)

# Load existing results to avoid re-fetching successful ones
try:
    with WIKI_DATA_PATH.open('r', encoding='utf-8') as f:
        results = json.load(f)
except:
    results = {}

# Wiki URL mappings - many pages need (Age_of_Empires_IV) suffix
WIKI_URLS = {
    "Knight/Lancer": "Knight_(Age_of_Empires_IV)",
    "MAA": "Man-at-Arms_(Age_of_Empires_IV)",
    "Sultans Tower Elephant": "Sultan%27s_Tower_Elephant",
    "Archer": "Archer_(Age_of_Empires_IV)",
    "Spearman": "Spearman_(Age_of_Empires_IV)",
    "Crossbow": "Crossbowman_(Age_of_Empires_IV)",
    "Horseman": "Horseman_(Age_of_Empires_IV)",
    "Longbow": "Longbowman_(Age_of_Empires_IV)",
    "Yoeman": "Wynguard_Ranger",
    "Keshik": "Keshik_(Age_of_Empires_IV)",
    "Samurai": "Samurai_(Age_of_Empires_IV)",
    "Mangudai": "Mangudai_(Age_of_Empires_IV)",
    "Camel Archer": "Camel_Archer_(Age_of_Empires_IV)",
    "Camel Rider": "Camel_Rider_(Age_of_Empires_IV)",
    "Horse Archer": "Horse_Archer_(Age_of_Empires_IV)",
    "Cataphract": "Cataphract_(Age_of_Empires_IV)",
    "Fire Lancer": "Fire_Lancer_(Age_of_Empires_IV)",
    "Landsknecht": "Landsknecht_(Age_of_Empires_IV)",
    "War Elephant": "War_Elephant_(Age_of_Empires_IV)",
    "Sipahi": "Sipahi_(Age_of_Empires_IV)",
    "Ghulam": "Ghulam_(Age_of_Empires_IV)",
    "Teutonic Knight": "Teutonic_Knight_(Age_of_Empires_IV)",
    "Condottiero": "Condottiero_(Age_of_Empires_IV)",
    "Genitour": "Genitour_(Age_of_Empires_IV)",
    "Jannisary": "Janissary_(Age_of_Empires_IV)",
    "Serjeant": "Serjeant_(Age_of_Empires_IV)",
    "Desert Raider": "Desert_Raider",
    "Yumi": "Yumi_Ashigaru",
    "Earls Guard": "Earl%27s_Guard",
    "Onna Musha": "Onna-Musha",
    "Mounted Samurai": "Mounted_Samurai",
    "Gilded MAA": "Gilded_Man-at-Arms",
    "Ballista Elephant": "Ballista_Elephant",
    "Templar Brother": "Templar_Brother",
    "Genoese Crossbowman": "Genoese_Crossbowman_(Age_of_Empires_IV)",
    "Black Rider": "Black_Rider",
}

def fetch_wiki(unit_name):
    """Fetch and parse Technologies + Aura sections from wiki."""
    wiki_name = WIKI_URLS.get(unit_name, unit_name.replace(' ', '_'))
    url = f"https://ageofempires.fandom.com/wiki/{wiki_name}"

    try:
        result = subprocess.run(
            ['curl', '-s', '-L', '-A',
             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
             url],
            capture_output=True, text=True, timeout=30, encoding='utf-8', errors='replace'
        )
        content = result.stdout
    except Exception as e:
        return None, f"Error fetching: {e}"

    if len(content) < 10000:
        return None, f"Page too short ({len(content)} bytes) - URL: {url}"

    # Find the real Technologies table (the one with font-size:110%)
    tech_match = re.search(r'font-size:110%[^>]*>Technologies', content)
    if not tech_match:
        return None, f"No Technologies section found - URL: {url}"

    start = tech_match.start()

    # Find end
    end = len(content)
    for marker in ['id="Changelog"', 'id="Strategy"', 'id="Gallery"', 'id="Trivia"',
                   'Dialogue_lines', 'Dialogue lines', 'id="History"']:
        idx = content.find(marker, start + 100)
        if idx > 0 and idx < end:
            end = idx

    section = content[start:end]

    # Clean HTML
    clean = re.sub(r'<img[^>]*?alt="([^"]*?)"[^>]*?/?>', r'[\1]', section)
    clean = re.sub(r'<br\s*/?>', '\n', clean)
    clean = re.sub(r'</tr>', '\n', clean)
    clean = re.sub(r'</td>', ' | ', clean)
    clean = re.sub(r'</li>', '\n', clean)
    clean = re.sub(r'<[^>]+>', '', clean)
    clean = re.sub(r'[ \t]+', ' ', clean)
    clean = re.sub(r'\n\s*\n+', '\n', clean)
    clean = html.unescape(clean)

    return clean.strip(), None

# Only re-fetch failed units
for i, name in enumerate(data.keys()):
    if name in results and not results[name].startswith('ERROR'):
        continue  # Already have good data

    text, error = fetch_wiki(name)
    if error:
        print(f"[{name}] ERROR - {error}", file=sys.stderr)
        results[name] = f"ERROR: {error}"
    else:
        print(f"[{name}] OK ({len(text)} chars)", file=sys.stderr)
        results[name] = text
    time.sleep(0.3)

with WIKI_DATA_PATH.open('w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

ok = sum(1 for v in results.values() if not v.startswith('ERROR'))
failed = [n for n, v in results.items() if v.startswith('ERROR')]
print(f"\nSuccess: {ok}/{len(data)}", file=sys.stderr)
if failed:
    print(f"Still failed: {failed}", file=sys.stderr)
