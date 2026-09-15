#!/usr/bin/env python3
"""Generate champions-data.json for the Pokemon Champions tool.

Roster (available species/forms, not a ranked eligibility whitelist) comes from
"List of Pokemon in Pokemon Champions" page via the MediaWiki API.
Learnsets come from verified Champions community records, with a form-aware
Serebii Champions fallback. PokeAPI/Pokebase movepools are never legality evidence.

Stdlib only. Regulation-scoped HTTP caches expire after 24 hours. --refresh
bypasses them immediately; failed refreshes never silently reuse expired data.

Usage:  python apps/pokemon-champions/tools/generate_data.py
"""
import argparse
import collections
import concurrent.futures
import html
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(APP, "champions-data.json")
OVERRIDES_PATH = os.path.join(HERE, "roster_overrides.json")
REGULATION_PATH = os.path.join(HERE, "regulation.json")
REPORT_PATH = os.path.join(APP, "learnset-report.json")
CACHE_MAX_AGE = 24 * 60 * 60
REGULATION = None
REFRESH = False
FETCHED = set()


def load_regulation(path=REGULATION_PATH):
    with open(path, encoding="utf-8") as f:
        config = json.load(f)
    if not re.fullmatch(r"M-[A-Z]+", config.get("id", "")):
        raise ValueError("Set a verified regulation id in tools/regulation.json")
    if not config.get("source", "").startswith("https://"):
        raise ValueError("regulation.json requires a source URL for the regulation")
    return config

UA = "OwlToolsPokeChampions/1.0 (contact: info@vapor-handel.de)"
POKEAPI = "https://pokeapi.co/api/v2"
BULBA = "https://bulbapedia.bulbagarden.net/w/api.php"
ROSTER_PAGE = "List of Pokémon in Pokémon Champions"
POKEBASE = "https://pokebase.app/pokemon-champions/pokemon"
POKEBASE_ABILITY = "https://pokebase.app/pokemon-champions/abilities"
POKEBASE_MOVE = "https://pokebase.app/pokemon-champions/moves"
# Open, structured Champions dataset (Showdown-derived + community-verified). Has
# mechanically PRECISE move/ability descriptions ("Raises Attack by 2 stages", etc.)
# that the in-game flavor text (pokebase) lacks. MIT-style open data, fetched as JSON.
CHAMP_REPO = "https://raw.githubusercontent.com/otterlyclueless/pokemon-champions-data/main"
SEREBII = "https://www.serebii.net/pokedex-champions"
MOVE_LINK_RE = re.compile(r"pokemon-champions/moves/([a-z0-9-]+)")
META_DESC_RE = re.compile(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', re.I)
ABILITY_RE = re.compile(
    r'class="min-w-0 text-sm font-semibold"\s+aria-label="([^"]+)"[^>]*>.*?'
    r'<p class="mt-1 text-sm">([^<]+)</p>', re.S)
# Competitive-usage rows on a pokebase mon page. Items/Natures/Moves share a
# "name span + NN<!-- -->% span" shape; ability usage is in an aria-label.
USAGE_NAMEPCT_RE = re.compile(r'truncate font-medium[^"]*">([^<]+)</span>.*?([\d.]+)(?:<!--.*?-->)*\s*%', re.S)
ABIL_USAGE_RE = re.compile(r'aria-label="([^",]+), ([\d.]+)% tournament usage"')
USAGE_CAP = 8  # keep the top-N of each usage category
# The meta's typical point investment per stat (pokebase "stat points allocator").
# Note pokebase naming: SPD = Speed, "Sp. Def" = special defense.
SPREAD_RE = re.compile(
    r'aria-label="(HP|ATK|DEF|Sp\. Atk|Sp\. Def|SPD) stat points allocator, '
    r'featured team usage ([^"]*?)% of featured team stat points"')
SPREAD_KEY = {"HP": "hp", "ATK": "atk", "DEF": "def",
              "Sp. Atk": "spa", "Sp. Def": "spd", "SPD": "spe"}
# A secondary-effect probability stated in a pokebase move description, e.g.
# Iron Head's "Has a 20% chance of making the target flinch." (Champions-exact).
PB_CHANCE_RE = re.compile(r"(\d+)%\s+chance", re.I)

ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5,
         "vi": 6, "vii": 7, "viii": 8, "ix": 9}

FORM_LABELS = {
    "alola": "Alolan", "hisui": "Hisuian", "galar": "Galarian",
    "paldea": "Paldean", "mega": "Mega", "mega-x": "Mega X", "mega-y": "Mega Y",
}


# ----------------------------------------------------------------------------
# HTTP with on-disk cache
# ----------------------------------------------------------------------------
def _cache_path(key):
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", key)
    reg = (REGULATION or load_regulation())["id"]
    # v2 also invalidates the old parser's persistent, unscoped caches.
    return os.path.join(CACHE, "v2", reg, safe + ".json")


def write_json(path, data, **kwargs):
    """Atomic replacement: a failed fetch/run cannot leave half a JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=os.path.dirname(path),
                                     delete=False) as f:
        temp = f.name
        try:
            json.dump(data, f, ensure_ascii=False, **kwargs)
        except BaseException:
            f.close()
            os.unlink(temp)
            raise
    try:
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def cache_valid(path):
    if REFRESH and path not in FETCHED:
        return False
    return os.path.isfile(path) and 0 <= time.time() - os.path.getmtime(path) < CACHE_MAX_AGE


def http_json(url, cache_key=None, retries=4, *, text=False, missing=None):
    """Fetch JSON or text; only explicit HTTP 404s can use a supplied default."""
    cache_key = cache_key or url
    cp = _cache_path(cache_key)
    if cache_valid(cp):
        try:
            with open(cp, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            pass  # corrupt cache: refetch, not a partially valid snapshot
    safe_url = urllib.parse.quote(url, safe=":/?&=%+,")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(safe_url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                try:
                    body = raw.decode("utf-8")
                except UnicodeDecodeError:
                    if not text:
                        raise
                    body = raw.decode(r.headers.get_content_charset() or "windows-1252")
                data = body if text else json.loads(body)
            write_json(cp, data)
            FETCHED.add(cp)
            time.sleep(0.03)  # be polite to PokeAPI
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404 and missing is not None:
                write_json(cp, missing)
                FETCHED.add(cp)
                return missing
            if 400 <= e.code < 500:  # bad/unknown slug: permanent, don't retry
                raise
            last = e
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def fetch_pokebase_mon(slug):
    """Abilities/usage plus UNVERIFIED move candidates (some pages are mainline)."""
    page = http_json(f"{POKEBASE}/{slug}", f"pbmon_{slug}", text=True, missing="")
    i = page.find("Abilities")
    seg = page[i:i + 3000] if i >= 0 else ""
    return {
        "moves": sorted(set(MOVE_LINK_RE.findall(page))),
        "abilities": [[html.unescape(n).strip(), html.unescape(d).strip()]
                      for n, d in ABILITY_RE.findall(seg)],
        "usage": parse_pb_usage(page),
    }


# Global usage rate per mon, from the pokebase pokemon LIST page: each row is
# href="/pokemon-champions/pokemon/<slug>" followed by its rate as
# <span class="text-xs tabular-nums">NN.N<!-- -->%</span> before the next row's link.
def fetch_usage_rates():
    """Fetch the pokemon list page once (cached) -> {pokebase slug: usage %}."""
    page = http_json(POKEBASE, "pb_usage_rates", text=True)
    rates = {}
    # A slug binds to the FIRST rate after it, without stealing the next row's.
    links = [(m.start(), m.group(1)) for m in re.finditer(
        r'href="/pokemon-champions/pokemon/([a-z0-9\-]+)"', page)]
    rate_list = [(m.start(), float(m.group(1))) for m in re.finditer(
        r'class="[^"]*\btabular-nums\b[^"]*">([\d.]+)(?:<!-- -->)?%', page)]
    ri = 0
    for li, (lpos, slug) in enumerate(links):
        nxt = links[li + 1][0] if li + 1 < len(links) else len(page)
        while ri < len(rate_list) and rate_list[ri][0] < lpos:
            ri += 1
        if ri < len(rate_list) and rate_list[ri][0] < nxt and slug not in rates:
            rates[slug] = rate_list[ri][1]
    print(f"  usage rates: {len(rates)} mons from the pokebase list page")
    if not rates:
        print("  WARNING: no usage rates parsed; usage is omitted, not invented")
    return rates


def fetch_champ_repo(path):
    """A JSON file from the open Champions dataset repo (cached)."""
    return http_json(f"{CHAMP_REPO}/{path}", cache_key=f"repo_{path.replace('/', '_')}")


def _norm_key(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


# These need a Champions-table check, never a mainline/Pokebase union.
REPO_OMITTED_MOVES = {"psychic"}


def repo_candidates(mon):
    """Exact form names only. A shared dex number is NOT learnset evidence."""
    name, form = mon["species"], mon["formLabel"]
    if mon["isMega"]:
        suffix = form.removeprefix("Mega").strip()
        return [f"Mega {name}{' ' + suffix if suffix else ''}"]
    if form in ("Alolan", "Galarian", "Hisuian", "Paldean"):
        return [f"{form} {name}"]
    if form:
        return [f"{name} {form}"]
    return [name]


def plain_text(markup):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", markup))).strip()


def parse_serebii_moves(page, mon):
    """Read ONE form's Champions move table, never the union of the page.

    Unknown form headings fail closed. Move names come from link text (not the
    separator-free attack URL). Other-generation links and type links don't count.
    """
    tables = []
    for match in re.finditer(r"<h3>(.*?)</h3>(.*?)</table>", page, re.S | re.I):
        title, body = plain_text(match[1]), match[2]
        if "Standard Moves" in title:
            tables.append((title, body))
    slug = mon["slug"]
    keys = []
    for token, label in (("alola", "Alolan"), ("galar", "Galarian"),
                         ("hisui", "Hisuian"), ("paldea", "Paldean")):
        if token in slug.split("-"):
            keys.append(f"{label} Form Standard Moves")
            keys.append(f"{token.title()} Form Standard Moves")
    if mon["formLabel"]:
        keys.insert(0, f"Standard Moves - {mon['formLabel']} {mon['species']}")
    for token, label in (("blaze", "Blaze Breed"), ("aqua", "Aqua Breed"),
                         ("female", "Female"), ("male", "Male"),
                         ("midnight", "Midnight Form"), ("dusk", "Dusk Form")):
        if token in slug.split("-"):
            keys.insert(0, f"Standard Moves - {label}")
    # Standard is shared by a species' Mega/battle transformations unless the
    # source explicitly splits that form's learnset. Regional/sex splits never
    # fall through to the standard table when their specific table is absent.
    if (not any(x in slug.split("-") for x in ("alola", "galar", "hisui", "paldea", "female", "male", "midnight", "dusk"))
            or (len(tables) == 1 and tables[0][0] == "Standard Moves"
                    and not any(x in slug.split("-") for x in ("alola", "galar", "hisui", "paldea")))):
        keys.append("Standard Moves")
    if (not mon["isMega"] and mon.get("category") == "base"
            and not any(x in slug.split("-") for x in ("female", "alola", "galar", "hisui", "paldea"))):
        keys.append("Standard Moves - Male")
    selected = next(((title, body) for key in keys for title, body in tables if title == key), None)
    if selected is None:
        return None
    title, body = selected
    links = re.findall(r'<a\s+[^>]*href=["\']/attackdex-champions/[^"\']+\.shtml["\'][^>]*>([^<]+)</a>', body, re.I)
    moves = {slugify(html.unescape(name)) for name in links}
    # Rotom's signature moves live in a separate, form-restricted table. Each
    # row includes a Pokémon icon naming the only form allowed to use that move.
    if mon["species"] == "Rotom":
        for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", page, re.S | re.I):
            names = re.findall(r'/pokedex-champions/icon/[^>]+alt="([^"]+)"', row)
            if any(_norm_key(n) == _norm_key(f"{mon['formLabel']} Rotom") for n in names):
                moves.update(slugify(html.unescape(n)) for n in re.findall(
                    r'<a\s+[^>]*href="/attackdex-champions/[^" ]+\.shtml"[^>]*>([^<]+)</a>', row))
    return {"moves": sorted(moves), "entry": title} if moves else None


def fetch_serebii_learnset(mon):
    # Serebii retains punctuation in these species' URLs, unlike PokeAPI.
    api_slug = slugify(mon["species"])
    species_slug = {"farfetchd": "farfetch'd", "sirfetchd": "sirfetch'd",
                    "mr-mime": "mr.mime"}.get(api_slug, api_slug)
    url = f"{SEREBII}/{species_slug}/"
    page = http_json(url, f"serebii_{species_slug}", text=True, missing="")
    result = parse_serebii_moves(page, mon)
    if result:
        result["url"] = url
    return result


def apply_repo_learnsets(mons, learnsets=None, fallback=None):
    """Publish only source-verified Champions moves; retain rejected candidates
    as diagnostics, not selectable moves. Verification is the source's claim,
    not an assertion that community data or ranked eligibility is infallible.
    """
    ls = fetch_champ_repo("learnsets/learnsets.json") if learnsets is None else learnsets
    fallback = fallback or fetch_serebii_learnset
    name_idx = {_norm_key(k): (k, v) for k, v in ls.items()}
    forms = collections.Counter(m["dex"] for m in mons if not m["isMega"])
    for mon in mons:
        original = set(mon["_moves"])
        original_source = mon["_movesrc"]
        matched = next((name_idx[_norm_key(c)] for c in repo_candidates(mon)
                        if _norm_key(c) in name_idx), None)
        entry, record = matched if matched else (None, {})
        verified = (record.get("championsVerified") is True
                    and record.get("source") == "serebii-champions"
                    and record.get("dexNumber") == mon["dex"] and bool(record.get("moves")))
        new = {slugify(x["name"]) for x in record.get("moves", [])} if verified else set()
        provenance = {"status": "verified", "source": "champions-repo",
                      "url": f"{CHAMP_REPO}/learnsets/learnsets.json", "entry": entry}
        # The repo scraper unions forms on some pages (e.g. Slowbro, Rotom).
        # Consult the original form-specific tables for these, missing records,
        # and the known Psychic omission instead of merging mainline candidates.
        ambiguous = forms[mon["dex"]] > 1
        needs_check = bool(REPO_OMITTED_MOVES & (original - new))
        if not verified or ambiguous or needs_check:
            direct = fallback(mon)
            if direct:
                new = set(direct["moves"])
                provenance = {"status": "verified", "source": "serebii-champions",
                              "url": direct["url"], "entry": direct["entry"]}
            elif not verified or ambiguous:
                new = set()
                provenance = {"status": "unverified", "source": original_source,
                              "reason": "No verified, form-specific Champions learnset available."}
        mon["_moves"] = sorted(new)
        mon["_movesrc"] = provenance["source"]
        mon["learnset"] = provenance
        mon["_learnset_report"] = {
            "slug": mon["slug"], **provenance, "moveCount": len(new),
            "candidateSource": original_source,
            "withheldCandidates": sorted(original - new),
            "usageMovesNotConfirmed": sorted(slugify(n) for n, _ in mon.get("usage", {}).get("moves", [])
                                             if slugify(n) not in new),
        }
    counts = collections.Counter(m["learnset"]["source"] for m in mons)
    print(f"\nLearnset sources: {dict(counts)}")
    unresolved = [m["slug"] for m in mons if m["learnset"]["status"] != "verified"]
    print(f"  {len(unresolved)} unverified learnsets (moves withheld): {', '.join(unresolved) or 'none'}")
    return {"unverified": unresolved, "verifiedCount": len(mons) - len(unresolved),
            "entries": [m["_learnset_report"] for m in mons]}


def usage_sections(page):
    """Bound each usage category by the NEXT heading, regardless of its name.

    Pokebase reordered Abilities before Items and added Common Teammates. A
    search for an assumed later heading used to consume the rest of the page.
    Ignore hydration scripts and other sections such as the main movepool.
    """
    page = re.sub(r"<(script|style)\b[^>]*>.*?</\1\s*>", "", page, flags=re.S | re.I)
    headings = list(re.finditer(r"<h([1-6])\b[^>]*>(.*?)</h\1\s*>", page, re.S | re.I))
    blocks = {}
    current = None
    for i, heading in enumerate(headings):
        title = plain_text(heading[2])
        if int(heading[1]) <= 2:
            current = blocks.setdefault(title, {}) if title in ("Tournament Stats", "Season Stats") else None
        if current is None or title not in ("Items", "Natures", "Moves", "Abilities"):
            continue
        end = headings[i + 1].start() if i + 1 < len(headings) else len(page)
        current.setdefault(title.lower(), page[heading.end():end])
    # Keep all categories from ONE sample. A few mons have season data only;
    # don't drop that data or merge it into the tournament sample on other pages.
    return blocks.get("Tournament Stats") or blocks.get("Season Stats") or {}


def parse_pb_usage(page):
    """Competitive usage % per category from a pokebase mon page. Each list is
    [[name, pct], ...] sorted as shown (most-used first), capped to USAGE_CAP."""
    def pairs(seg, category):
        # A second boundary at the individual row prevents a missing percentage
        # from borrowing the next row's value. Item/move/ability URLs must also
        # belong to that category: a teammate link can never become an item.
        if category == "natures":
            rows = re.findall(r"<li\b[^>]*>(.*?)</li\s*>", seg, re.S | re.I)
        else:
            rows = re.findall(r'<a\b[^>]*href=["\']/pokemon-champions/' + category
                              + r'/[^"\']+["\'][^>]*>(.*?)</a\s*>', seg, re.S | re.I)
        result = []
        seen = set()
        for row in rows:
            match = USAGE_NAMEPCT_RE.search(row)
            if not match:
                continue
            name, pct = html.unescape(match[1]).strip(), round(float(match[2]), 1)
            if name not in seen and 0 <= pct <= 100:
                result.append([name, pct])
                seen.add(name)
        return result[:USAGE_CAP]

    sections = usage_sections(page)
    usage = {category: pairs(sections.get(category, ""), category)
             for category in ("abilities", "items", "natures", "moves")}
    if not usage["abilities"]:
        usage["abilities"] = [[html.unescape(n).strip(), round(float(p), 1)]
                              for n, p in ABIL_USAGE_RE.findall(sections.get("abilities", ""))][:USAGE_CAP]
    # meta point allocation per stat -> {hp:[pts,pct], ...}
    spread = {}
    for label, mid in SPREAD_RE.findall(page):
        pm = re.search(r"\+(\d+)", mid)
        cm = re.search(r"([\d.]+)\s*$", mid)
        spread[SPREAD_KEY[label]] = [int(pm.group(1)) if pm else 0,
                                     round(float(cm.group(1)), 1) if cm else 0.0]
    out = {k: v for k, v in usage.items() if v}
    if any(p for _, p in spread.values()):
        out["spread"] = spread
    return out


def _pb_move_stat(page, label):
    """A move page's numeric stat (Power/Accuracy/PP); None when shown as "—"."""
    m = re.search(r">" + re.escape(label) + r"</span><span[^>]*>([^<]+)</span>", page)
    if not m:
        return None
    digits = re.sub(r"[^\d]", "", m.group(1))
    return int(digits) if digits else None


def fetch_pokebase_move(slug):
    """Champions-accurate move numbers (power/accuracy/pp) + effect text from
    pokebase's move page (mainline PokeAPI/Showdown values are often re-tuned in
    Champions, e.g. Iron Head flinch 20% not 30%, PP 16 not 15). Cached; {} on 404."""
    page = http_json(f"{POKEBASE_MOVE}/{slug}", f"pbmove_{slug}", text=True, missing="")
    if not page:
        return {}
    eff = META_DESC_RE.search(page)
    return {
        "power": _pb_move_stat(page, "Power"),
        "accuracy": _pb_move_stat(page, "Accuracy"),
        "pp": _pb_move_stat(page, "PP"),
        "effect": re.sub(r"\s+", " ", html.unescape(eff.group(1))).strip() if eff else None,
    }


def fetch_pokebase_ability_desc(slug):
    """Champions-accurate ability effect from pokebase's ability page meta
    description. Cached as a string; returns None on 404/missing so the caller
    falls back to PokeAPI."""
    page = http_json(f"{POKEBASE_ABILITY}/{slug}", f"pb_ability_{slug}", text=True, missing="")
    m = META_DESC_RE.search(page)
    return html.unescape(m.group(1)).strip() if m else None


# ----------------------------------------------------------------------------
# Roster parsing (Bulbapedia wikitext)
# ----------------------------------------------------------------------------
def slugify(name):
    s = name.strip()
    s = s.replace("♀", "-f").replace("♂", "-m")  # gender signs
    s = unicodedata.normalize("NFKD", s)            # decompose accents
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = s.replace("’", "").replace("'", "")            # apostrophes
    s = s.replace(".", "").replace(":", "")
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s)
    return s


def parse_template_args(inner):
    """inner is the text between {{ and }} for a single (non-nested) template."""
    parts = inner.split("|")
    pos, named = [], {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            named[k.strip()] = v.strip()
        else:
            pos.append(p.strip())
    return pos, named


def form_token(named):
    return named.get("ig") or named.get("form") or ""


def make_slug(species, token):
    base = slugify(species)
    if not token:
        return base
    suf = slugify(token.strip().lstrip("-"))
    return base + "-" + suf if suf else base


def form_label(token):
    if not token:
        return ""
    suf = slugify(token.strip().lstrip("-"))
    return FORM_LABELS.get(suf, suf.replace("-", " ").title())


def section(text, start_marker, end_markers):
    i = text.find(start_marker)
    if i < 0:
        return ""
    i += len(start_marker)
    end = len(text)
    for m in end_markers:
        j = text.find(m, i)
        if 0 <= j < end:
            end = j
    return text[i:end]


def parse_section(wikitext, category, available=True):
    """Yield roster entries from one wikitext section."""
    # Version notes contain nested {{tt|...}} templates (e.g. Pawmot in M-C).
    # Remove only inner helper templates so their braces don't hide a roster row.
    previous = None
    while previous != wikitext:
        previous = wikitext
        wikitext = re.sub(r"\{\{(?!(?:gdex|MSP)/Champs\|)[^{}]*\}\}", "", wikitext)
    entries = []
    for m in re.finditer(r"\{\{(gdex/Champs\|[^{}]*?)\}\}", wikitext):
        pos, named = parse_template_args(m.group(1))
        if len(pos) < 2:
            continue
        dex = int(re.sub(r"\D", "", pos[0]) or 0)
        species = pos[1]
        tok = form_token(named)
        entries.append({
            "dex": dex, "species": species,
            "slug": make_slug(species, tok),
            "formLabel": form_label(tok),
            "category": category, "available": available,
        })
    for m in re.finditer(r"\{\{(MSP/Champs\|[^{}]*?)\}\}", wikitext):
        pos, named = parse_template_args(m.group(1))
        if len(pos) < 2:
            continue
        dex = int(re.sub(r"\D", "", pos[0]) or 0)
        species = pos[1]
        tok = named.get("form", "")
        entries.append({
            "dex": dex, "species": species,
            "slug": make_slug(species, tok),
            "formLabel": form_label(tok),
            "category": category, "available": available,
        })
    return entries


def fetch_roster():
    print("Fetching roster from Bulbapedia ...")
    url = BULBA + "?" + urllib.parse.urlencode({
        "action": "parse", "page": ROSTER_PAGE, "prop": "wikitext",
        "format": "json", "formatversion": "2",
    })
    wt = http_json(url, cache_key="bulba_roster")["parse"]["wikitext"]
    # Drop HTML comments so commented-out / "Transfer only" entries (e.g. the
    # main-list Pawmot) aren't parsed as available and don't shadow the real
    # Untransferable entry.
    wt = re.sub(r"<!--.*?-->", "", wt, flags=re.S)

    main = section(wt, "==List of Pok", ["====Mega Evolutions===="])
    mega = section(wt, "====Mega Evolutions====", ["====Other forms===="])
    other = section(wt, "====Other forms====", ["==Untransferable"])
    untrans = section(wt, "==Untransferable", ["==Trivia=="])

    rows = []
    rows += parse_section(main, "base", True)
    rows += parse_section(mega, "mega", True)
    rows += parse_section(other, "other", True)
    rows += parse_section(untrans, "base", False)

    # de-dup by slug (first occurrence wins)
    seen, roster = set(), []
    overrides = {}
    if os.path.exists(OVERRIDES_PATH):
        with open(OVERRIDES_PATH, "r", encoding="utf-8") as f:
            overrides = json.load(f)
    skips = set(overrides.get("_skip", []))
    remap = overrides.get("_remap", {})

    for e in rows:
        if e["slug"] in remap:
            e["slug"] = remap[e["slug"]]
        if e["slug"] in skips or not e["slug"]:
            continue
        if e["slug"] in seen:
            continue
        seen.add(e["slug"])
        e["apiSlug"] = overrides.get("_api", {}).get(e["slug"], e["slug"])
        roster.append(e)
    print(f"  parsed {len(roster)} roster entries "
          f"(base/mega/other/untransferable)")
    return roster


# ----------------------------------------------------------------------------
# PokeAPI enrichment
# ----------------------------------------------------------------------------
def gen_to_int(gen_name):
    roman = gen_name.replace("generation-", "")
    return ROMAN.get(roman, 0)


def fetch_pokemon(entry, species_cache):
    slug = entry["slug"]
    api_slug = entry.get("apiSlug", slug)
    p = http_json(f"{POKEAPI}/pokemon/{api_slug}", cache_key=f"poke_{api_slug}")

    stats = {}
    name_map = {"hp": "hp", "attack": "atk", "defense": "def",
                "special-attack": "spa", "special-defense": "spd",
                "speed": "spe"}
    for s in p["stats"]:
        key = name_map.get(s["stat"]["name"])
        if key:
            stats[key] = s["base_stat"]
    bst = sum(stats.values())

    types = [t["type"]["name"] for t in p["types"]]

    # These move candidates are diagnostics only until apply_repo_learnsets runs.
    # PokeAPI supplies stats and the hidden-ability flag, not Champions legality.
    pb = fetch_pokebase_mon(slug)
    if pb["moves"]:
        moves, move_src = pb["moves"], "pokebase"
    else:
        moves = sorted({m["move"]["name"] for m in p["moves"]})
        move_src = "pokeapi-mainline"

    poke_hidden = {a["ability"]["name"]: a["is_hidden"] for a in p["abilities"]}
    if pb["abilities"]:
        abilities = [{"slug": slugify(name),
                      "hidden": poke_hidden.get(slugify(name), False),
                      "_name": name, "_desc": re.sub(r"\s+", " ", desc).strip()}
                     for name, desc in pb["abilities"]]
        abil_src = "pokebase"
    else:
        abilities = [{"slug": a["ability"]["name"], "hidden": a["is_hidden"]}
                     for a in p["abilities"]]
        abil_src = "fallback"

    sp_name = p["species"]["name"]
    if sp_name not in species_cache:
        sp = http_json(f"{POKEAPI}/pokemon-species/{sp_name}",
                       cache_key=f"species_{sp_name}")
        species_cache[sp_name] = {
            "gen": gen_to_int(sp["generation"]["name"]),
            "legendary": sp["is_legendary"],
            "mythical": sp["is_mythical"],
        }
    sp = species_cache[sp_name]

    artwork = (p["sprites"].get("other", {})
               .get("official-artwork", {}).get("front_default"))
    sprite = p["sprites"].get("front_default")

    return {
        "pid": p["id"], "slug": slug, "species": entry["species"],
        "dex": entry["dex"], "formLabel": entry["formLabel"],
        "category": entry["category"],
        "isMega": entry["category"] == "mega",
        "available": entry["available"],
        "types": types, "stats": stats, "bst": bst,
        "weight": round(p.get("weight", 0) / 10, 1),  # hectograms -> kg (Grass Knot etc.)
        "abilities": abilities, "_moves": moves,
        "gen": sp["gen"], "legendary": sp["legendary"],
        "mythical": sp["mythical"],
        "sprite": sprite, "artwork": artwork,
        "_movesrc": move_src, "_abilsrc": abil_src,
        "usage": pb.get("usage", {}),
    }


# Move "flags" (contact, slicing, etc.) aren't in PokeAPI, so we merge them from
# Pokemon Showdown's data dump (the canonical competitive source).
SD_FLAGS = {
    "contact": "Contact", "sound": "Sound", "punch": "Punch", "bite": "Bite",
    "bullet": "Bomb/Ball", "slicing": "Slicing", "pulse": "Pulse",
    "powder": "Powder", "wind": "Wind", "dance": "Dance",
    "bypasssub": "Bypass Sub", "defrost": "Thaws", "recharge": "Recharge",
    "charge": "Two-turn", "reflectable": "Reflectable",
}


def sd_id(slug):
    return re.sub(r"[^a-z0-9]", "", slug.lower())


SD_STATUS = {"brn": "burn", "par": "paralysis", "frz": "freeze", "psn": "poison",
             "tox": "badly poisoned", "slp": "sleep"}
SD_VOLATILE = {"flinch": "flinch", "confusion": "confusion"}
SD_STAT = {"atk": "Atk", "def": "Def", "spa": "Sp.Atk", "spd": "Sp.Def",
           "spe": "Spe", "accuracy": "Acc", "evasion": "Eva"}


def _sec_label(s):
    """A short label for what a secondary effect does (e.g. "burn", "−1 Def")."""
    if s.get("status"):
        return SD_STATUS.get(s["status"], s["status"])
    if s.get("volatileStatus"):
        return SD_VOLATILE.get(s["volatileStatus"], s["volatileStatus"])
    if s.get("boosts"):
        return ", ".join(f"{'+' if v > 0 else '−'}{abs(v)} {SD_STAT.get(k, k)}"
                         for k, v in s["boosts"].items())
    return ""  # e.g. Tri Attack (status chosen at random) — just the %


def _sd_secondaries(m):
    """Every secondary effect as [chance, label] (e.g. Fire Fang → [[10,"burn"],
    [10,"flinch"]]); empty for guaranteed/no secondary effects."""
    sec = m.get("secondary")
    secs = m.get("secondaries") or ([sec] if isinstance(sec, dict) else [])
    return [[s["chance"], _sec_label(s)] for s in secs if s.get("chance")]


def fetch_showdown():
    d = http_json("https://play.pokemonshowdown.com/data/moves.json",
                  cache_key="showdown_moves")
    out = {}
    for sid, m in d.items():
        flags = sorted(SD_FLAGS[k] for k in (m.get("flags") or {}) if k in SD_FLAGS)
        out[sid] = {"flags": flags, "short": (m.get("shortDesc") or "").strip(),
                    "secondaries": _sd_secondaries(m)}
    return out


def fetch_move(name):
    d = http_json(f"{POKEAPI}/move/{name}", cache_key=f"move_{name}")
    eng = next((n["name"] for n in d.get("names", [])
                if n["language"]["name"] == "en"), None)
    short = next((e["short_effect"] for e in d.get("effect_entries", [])
                  if e["language"]["name"] == "en"), "")
    ec = d.get("effect_chance")
    if ec is not None:
        short = short.replace("$effect_chance", str(ec))
    return {
        "name": eng or name.replace("-", " ").title(),
        "type": d["type"]["name"] if d.get("type") else None,
        "class": d["damage_class"]["name"] if d.get("damage_class") else "status",
        "power": d.get("power"),
        "pp": d.get("pp"),
        "accuracy": d.get("accuracy"),
        "priority": d.get("priority", 0),
        "target": d["target"]["name"] if d.get("target") else None,
        "effect": re.sub(r"\s+", " ", short).strip(),
    }


TYPE_NAMES = [
    "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
    "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark",
    "steel", "fairy",
]


def fetch_type_chart():
    """Type-effectiveness chart from PokeAPI: chart[atk][def] = multiplier
    (only non-1 entries stored)."""
    chart = {}
    for t in TYPE_NAMES:
        d = http_json(f"{POKEAPI}/type/{t}", cache_key=f"type_{t}")
        rel = d["damage_relations"]
        m = {}
        for x in rel["double_damage_to"]:
            m[x["name"]] = 2
        for x in rel["half_damage_to"]:
            m[x["name"]] = 0.5
        for x in rel["no_damage_to"]:
            m[x["name"]] = 0
        chart[t] = m
    return chart


def fetch_ability(slug):
    d = http_json(f"{POKEAPI}/ability/{slug}", cache_key=f"ability_{slug}")
    eng = next((n["name"] for n in d.get("names", [])
                if n["language"]["name"] == "en"), None)
    pb = fetch_pokebase_ability_desc(slug)  # Champions-accurate effect
    if pb:
        desc, src = pb, "pokebase"
    else:
        short = next((e["short_effect"] for e in d.get("effect_entries", [])
                      if e["language"]["name"] == "en"), "")
        desc, src = re.sub(r"\s+", " ", short).strip(), "pokeapi"
    return {"name": eng or slug.replace("-", " ").title(), "desc": desc, "src": src}


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def parallel_map(fn, values):
    # A small bounded pool keeps full regulation refreshes practical. map retains
    # input order, so snapshot ordering and stable move-id allocation don't race.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        yield from pool.map(fn, values)


def fetch_roster_mon(entry):
    try:
        return fetch_pokemon(entry, {})
    except urllib.error.HTTPError as ex:
        if ex.code == 404:
            return None
        raise


def main(argv=None):
    global REGULATION, REFRESH
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Fetch all sources anew, ignoring HTTP caches")
    parser.add_argument("--strict-learnsets", action="store_true",
                        help="Write the report but refuse to publish if any learnsets are unverified")
    args = parser.parse_args(argv)
    REGULATION, REFRESH = load_regulation(), args.refresh
    FETCHED.clear()
    print(f"Regulation {REGULATION['id']} ({REGULATION['source']}); "
          f"cache: {'refresh all' if REFRESH else '24-hour TTL'}, {_cache_path('')}")
    roster = fetch_roster()
    if not roster:
        raise ValueError("Roster parser returned no entries; keeping the existing snapshot")

    print("Fetching Pokemon data from PokeAPI ...")
    mons, misses = [], []
    for i, (e, mon) in enumerate(zip(roster, parallel_map(fetch_roster_mon, roster)), 1):
        if mon is None:
            misses.append(e["slug"])
        else:
            mons.append(mon)
        if i % 25 == 0 or i == len(roster):
            print(f"  {i}/{len(roster)} ({len(misses)} missing)")

    if misses:
        print("\n!! Slugs not found on PokeAPI (add to roster_overrides.json "
              "_remap or _skip):")
        for s in misses:
            print("   -", s)

    fb = [m["slug"] for m in mons if m["_movesrc"] == "pokeapi-mainline"]
    print(f"\nUNVERIFIED move candidates: {len(mons) - len(fb)} from pokebase, {len(fb)} from PokeAPI")
    afb = [m["slug"] for m in mons if m["_abilsrc"] == "fallback"]
    print(f"Abilities: {len(mons) - len(afb)} mons from pokebase, {len(afb)} fell back "
          f"to PokeAPI{(' -> ' + ', '.join(afb)) if afb else ''}")

    # Replace pokebase's mainline movepools with the curated Champions learnsets.
    learnset_report = apply_repo_learnsets(mons)
    generated = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_json(REPORT_PATH, {"regulation": REGULATION["id"], "generated": generated,
                            "skippedRosterEntries": misses, **learnset_report}, indent=2)
    if args.strict_learnsets and learnset_report["unverified"]:
        raise ValueError("Unverified learnsets; see learnset-report.json. Snapshot not replaced.")

    # ---- unique moves ----
    all_moves = sorted({m for mon in mons for m in mon["_moves"]})
    print(f"\nFetching {len(all_moves)} unique moves ...")
    move_meta, move_misses = {}, []
    for i, mv in enumerate(all_moves, 1):
        try:
            move_meta[mv] = fetch_move(mv)
        except urllib.error.HTTPError as ex:
            if ex.code != 404:
                raise
            move_meta[mv] = {"name": mv.replace("-", " ").title(),
                             "type": None, "class": "status", "power": None,
                             "pp": None, "accuracy": None, "priority": 0, "effect": ""}
            move_misses.append(mv)
        if i % 100 == 0 or i == len(all_moves):
            print(f"  {i}/{len(all_moves)}")
    if move_misses:
        print(f"  {len(move_misses)} move slugs not on PokeAPI (kept name only): "
              f"{', '.join(move_misses)}")

    print("Merging move flags from Pokemon Showdown ...")
    showdown = fetch_showdown()
    matched = 0
    for mv, meta in move_meta.items():
        sd = showdown.get(sd_id(mv))
        if sd:
            matched += 1
            meta["flags"] = sd["flags"]
            meta["secondaries"] = sd["secondaries"]   # [[%, label], ...] (mainline standard)
            if sd["short"]:
                meta["effect"] = sd["short"]  # Showdown's wording is more concise
        meta.setdefault("flags", [])
        meta.setdefault("secondaries", [])
    print(f"  matched {matched}/{len(move_meta)} moves to Showdown flags")

    # Champions re-tunes some moves vs mainline (power/accuracy/PP/effect). pokebase
    # has the in-game numbers, so let it win over PokeAPI+Showdown. Only override
    # when pokebase actually provides a value (never blank out good data on a miss).
    print("Applying Champions-accurate move data from pokebase ...")
    pb_hits = 0
    for i, ((mv, meta), pb) in enumerate(zip(move_meta.items(), parallel_map(fetch_pokebase_move, move_meta)), 1):
        if not pb:
            continue
        pb_hits += 1
        for f in ("power", "accuracy", "pp"):
            if pb.get(f) is not None:
                meta[f] = pb[f]
        if pb.get("effect"):
            meta["effect"] = pb["effect"]
            cm = PB_CHANCE_RE.search(pb["effect"])  # Champions states its own % for some moves
            if cm:
                n = int(cm.group(1))
                secs = meta.get("secondaries") or []
                if len(secs) == 1:
                    secs[0][0] = n            # re-tune the single secondary (e.g. Iron Head 30→20)
                elif not secs:
                    meta["secondaries"] = [[n, ""]]
        if i % 100 == 0 or i == len(move_meta):
            print(f"  {i}/{len(move_meta)}")
    print(f"  pokebase move pages used for {pb_hits}/{len(move_meta)} moves")

    # Precise effect text from the open Champions dataset (pokebase's in-game flavor
    # is vague for stat/status moves). Keep Champions' own secondary % (re-tuned into
    # meta["secondaries"] above) by patching the "N% chance" number in the repo text.
    print("Applying precise move descriptions from the Champions dataset ...")
    repo_moves = {slugify(m["name"]): m for m in fetch_champ_repo("moves/moves.json")}
    repo_hits = 0
    for mv, meta in move_meta.items():
        rm = repo_moves.get(mv)
        if not rm or not rm.get("description"):
            continue
        repo_hits += 1
        desc = rm["description"]
        secs = meta.get("secondaries") or []
        if len(secs) == 1 and re.search(r"\d+%\s+chance", desc):
            desc = re.sub(r"\d+%\s+chance", f"{secs[0][0]}% chance", desc, count=1)
        meta["effect"] = desc
    print(f"  precise descriptions for {repo_hits}/{len(move_meta)} moves")

    # Final word: Champions-specific effect corrections where pokebase/the repo flavor is stale for a move
    # whose NUMBERS already came through (e.g. Make It Rain: 95% acc landed, but the −2 Sp.Atk did not).
    MOVE_EFFECT_OVERRIDES = {
        "Make It Rain": "Lowers the user's Special Attack by 2 stages.",
    }
    for _mv, _meta in move_meta.items():
        _ov = MOVE_EFFECT_OVERRIDES.get(_meta.get("name"))
        if _ov:
            _meta["effect"] = _ov

    # Stable move ids: persisted in tools/move_ids.json (name -> id) so ids NEVER shift
    # across regens — team share codes reference them. Existing names keep their id; new
    # moves append after the current max. First run seeds from the shipped champions-data.json.
    ids_path = os.path.join(HERE, "move_ids.json")
    name_ids = {}
    if os.path.exists(ids_path):
        with open(ids_path, "r", encoding="utf-8") as f:
            name_ids = json.load(f)
    elif os.path.exists(OUT):
        with open(OUT, "r", encoding="utf-8") as f:
            name_ids = {m["name"]: int(i) for i, m in json.load(f)["moves"].items()}
    next_id = max(name_ids.values(), default=-1) + 1
    move_id = {}
    for mv in all_moves:
        nm = move_meta[mv]["name"]
        if nm not in name_ids:
            name_ids[nm] = next_id
            next_id += 1
        move_id[mv] = name_ids[nm]
    move_count = {mv: 0 for mv in all_moves}

    # ---- unique abilities ----
    # Names + Champions-accurate descriptions already came from each mon's pokebase
    # page (carried on the ability records as _name/_desc). Use those directly; only
    # reach out to fetch_ability for any slug pokebase didn't supply (PokeAPI fallback).
    pb_ability = {}
    for mon in mons:
        for a in mon["abilities"]:
            if "_name" in a and a["slug"] not in pb_ability:
                pb_ability[a["slug"]] = {"name": a["_name"], "desc": a["_desc"]}
    all_abils = sorted({a["slug"] for mon in mons for a in mon["abilities"]})
    print(f"Resolving {len(all_abils)} unique abilities ...")
    abil_meta, abil_count = {}, {}
    for slug in all_abils:
        if slug in pb_ability:
            abil_meta[slug] = {"name": pb_ability[slug]["name"],
                               "desc": pb_ability[slug]["desc"], "src": "pokebase"}
        else:
            try:
                abil_meta[slug] = fetch_ability(slug)
            except urllib.error.HTTPError as ex:
                if ex.code != 404:
                    raise
                abil_meta[slug] = {"name": slug.replace("-", " ").title(),
                                   "desc": "", "src": "pokeapi"}
        abil_count[slug] = 0
    ab_pb = sum(1 for a in abil_meta.values() if a.get("src") == "pokebase")
    print(f"  ability effects: {ab_pb} from pokebase, {len(all_abils) - ab_pb} from PokeAPI")

    # Prefer the open dataset's precise ability text where it has it (pokebase's is the
    # vague in-game flavor). pokebase stays the fallback for Champions-original mega
    # abilities (e.g. Eelevate) that the repo doesn't list.
    repo_abils = {slugify(a["name"]): a.get("description", "")
                  for a in fetch_champ_repo("abilities/abilities.json")}
    ab_repo = 0
    for slug, meta in abil_meta.items():
        rd = repo_abils.get(slug)
        if rd:
            meta["desc"], meta["src"], ab_repo = rd, "repo", ab_repo + 1
    print(f"  ability descriptions: {ab_repo} precise from dataset, "
          f"{len(all_abils) - ab_repo} kept from pokebase/PokeAPI")

    # ---- derived per-mon fields + rarity tallies ----
    usage_rates = fetch_usage_rates()
    out_mons = []
    for mon in mons:
        phys = spec = 0
        phys_top = spec_top = 0
        ids = []
        for mv in mon["_moves"]:
            move_count[mv] += 1
            ids.append(move_id[mv])
            cls = move_meta[mv]["class"]
            pw = move_meta[mv]["power"] or 0
            if cls == "physical":
                phys += 1
                phys_top = max(phys_top, pw)
            elif cls == "special":
                spec += 1
                spec_top = max(spec_top, pw)
        for a in mon["abilities"]:
            abil_count[a["slug"]] += 1
        # Global source usage rate: own list-page row, else inherit the base form's
        # (megas share their base mon's ladder identity)
        pct = usage_rates.get(mon["slug"])
        if pct is None:
            base_slug = mon["slug"].split("-mega")[0]
            pct = usage_rates.get(base_slug)
        out_mons.append({
            "id": mon["pid"], "slug": mon["slug"], "name": mon["species"],
            "dex": mon["dex"], "formLabel": mon["formLabel"],
            "category": mon["category"], "isMega": mon["isMega"],
            "available": mon["available"], "types": mon["types"],
            "stats": mon["stats"], "bst": mon["bst"], "weight": mon["weight"],
            "usagePct": pct,
            "abilities": [{"slug": a["slug"], "hidden": a["hidden"]}
                          for a in mon["abilities"]],
            "moves": sorted(ids),
            "learnset": mon["learnset"],
            "off": {"phys": phys, "spec": spec,
                    "physTop": phys_top, "specTop": spec_top},
            "gen": mon["gen"],
            "sprite": mon["sprite"], "artwork": mon["artwork"],
            "usage": {k: (sorted(v, key=lambda x: -x[1]) if isinstance(v, list) else v)
                      for k, v in mon["usage"].items()},
        })

    moves_out = {}
    for mv, idx in move_id.items():
        m = move_meta[mv]
        moves_out[idx] = {"name": m["name"], "type": m["type"],
                          "class": m["class"], "power": m["power"],
                          "pp": m.get("pp"), "accuracy": m.get("accuracy"),
                          "priority": m.get("priority", 0), "target": m.get("target"),
                          "secondaries": m.get("secondaries", []),
                          "effect": m.get("effect", ""), "flags": m.get("flags", []),
                          "count": move_count[mv]}
    abils_out = {}
    for slug in all_abils:
        a = abil_meta[slug]
        abils_out[slug] = {"name": a["name"], "desc": a["desc"],
                           "count": abil_count[slug]}

    # Distinguish forms whose *default* entry is itself a named form (e.g. dex 681 has
    # "aegislash-shield" with no label next to "aegislash-blade"). For any unlabeled
    # entry that shares its dex with another and whose slug carries a suffix beyond the
    # bare species, derive the label from that suffix (Shield / Male / Zero / …). The
    # shared-dex + suffix guards leave single hyphenated names (Kommo-o, Mr. Rime) alone.
    dex_counts = collections.Counter(m["dex"] for m in out_mons)
    for m in out_mons:
        if m["formLabel"] or m["isMega"] or dex_counts[m["dex"]] < 2:
            continue
        prefix = slugify(m["name"]) + "-"
        if m["slug"].startswith(prefix) and len(m["slug"]) > len(prefix):
            m["formLabel"] = form_label(m["slug"][len(prefix):])

    out_mons.sort(key=lambda m: (m["dex"], 0 if not m["isMega"] else 1,
                                 m["formLabel"]))
    data = {
        "meta": {
            "generated": generated,
            "source": "Bulbapedia (availability); Champions community dataset + Serebii Champions (learnsets); PokeAPI + Pokebase + Showdown (metadata)",
            "regulation": REGULATION["id"],
            "regulationDetails": REGULATION,
            "rosterScope": "Champions availability, not a ranked eligibility whitelist",
            "learnsets": {"verifiedCount": learnset_report["verifiedCount"],
                          "unverified": learnset_report["unverified"], "report": "learnset-report.json"},
            "cacheMaxAgeHours": CACHE_MAX_AGE // 3600,
            "skippedRosterEntries": misses,
            "count": sum(1 for m in out_mons if not m["isMega"]),
            "megaCount": sum(1 for m in out_mons if m["isMega"]),
        },
        "moves": moves_out,
        "abilities": abils_out,
        "typeChart": fetch_type_chart(),
        "pokemon": out_mons,
    }
    # Reserve new IDs before publishing the snapshot (old IDs are never removed).
    write_json(ids_path, name_ids, indent=0, sort_keys=True)
    write_json(OUT, data, separators=(",", ":"))
    size = os.path.getsize(OUT) / 1024
    print(f"\nWrote {OUT}")
    print(f"  {data['meta']['count']} species, {data['meta']['megaCount']} "
          f"megas, {len(moves_out)} moves, {len(abils_out)} abilities "
          f"({size:.0f} KB)")
    if misses:
        print(f"  WARNING: {len(misses)} entries skipped (see above)")


if __name__ == "__main__":
    sys.exit(main())
