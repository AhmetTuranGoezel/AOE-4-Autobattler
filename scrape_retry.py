#!/usr/bin/env python3
"""Retry failed wiki scrapes with longer delays."""
import json, re, html, subprocess, time, sys

with open('wiki_data.json', 'r', encoding='utf-8') as f:
    results = json.load(f)

RETRY_URLS = {
    "Desert Raider": "Desert_Raider",
    "Archer": "Archer_(Age_of_Empires_IV)",
    "Crossbow": "Crossbowman_(Age_of_Empires_IV)",
    "Onna Musha": "Onna-Musha",
    "Sultans Tower Elephant": "Sultan%27s_Tower_Elephant",
    "Ballista Elephant": "Ballista_Elephant",
    "Cataphract": "Cataphract_(Age_of_Empires_IV)",
    "Mounted Samurai": "Mounted_Samurai",
    "Black Rider": "Black_Rider",
}

def fetch_wiki(wiki_name):
    url = f"https://ageofempires.fandom.com/wiki/{wiki_name}"
    try:
        result = subprocess.run(
            ['curl', '-s', '-L', '-A',
             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
             url],
            capture_output=True, text=True, timeout=30, encoding='utf-8', errors='replace'
        )
        content = result.stdout
    except Exception as e:
        return None, f"Error: {e}"

    if len(content) < 10000:
        return None, f"Page too short ({len(content)} bytes)"

    tech_match = re.search(r'font-size:110%[^>]*>Technologies', content)
    if not tech_match:
        # Try alternate pattern
        tech_match = re.search(r'>Technologies</th>', content)
    if not tech_match:
        return None, f"No Technologies section"

    start = tech_match.start()
    end = len(content)
    for marker in ['id="Changelog"', 'id="Strategy"', 'id="Gallery"', 'id="Trivia"',
                   'Dialogue_lines', 'Dialogue lines', 'id="History"']:
        idx = content.find(marker, start + 100)
        if idx > 0 and idx < end:
            end = idx

    section = content[start:end]
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

for name, wiki_name in RETRY_URLS.items():
    print(f"Fetching {name}...", file=sys.stderr)
    time.sleep(3)  # Longer delay
    text, error = fetch_wiki(wiki_name)
    if error:
        print(f"  ERROR: {error}", file=sys.stderr)
        results[name] = f"ERROR: {error}"
    else:
        print(f"  OK ({len(text)} chars)", file=sys.stderr)
        results[name] = text

with open('wiki_data.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

ok = sum(1 for v in results.values() if not v.startswith('ERROR'))
failed = [n for n, v in results.items() if v.startswith('ERROR')]
print(f"\nSuccess: {ok}/{len(results)}", file=sys.stderr)
if failed:
    print(f"Still failed: {failed}", file=sys.stderr)
