#!/usr/bin/env python3
"""Generate champions-data.json for the Pokemon Champions tool.

Roster (which species/forms are legal) is scraped from Bulbapedia's
"List of Pokemon in Pokemon Champions" page via the MediaWiki API.
Per-Pokemon data (stats, types, abilities, movepools, sprites) comes from
PokeAPI. Derived fields (offensive bias, ability/move rarity) are computed
here so the front-end loads one static file.

Stdlib only. HTTP responses are cached on disk (.cache/) so re-runs are fast
and polite. Re-run after a balance patch to refresh the data.

Usage:  python apps/pokemon-champions/tools/generate_data.py
"""
import collections
import html
import json
import os
import re
import sys
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
MOVE_LINK_RE = re.compile(r"pokemon-champions/moves/([a-z0-9-]+)")
META_DESC_RE = re.compile(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', re.I)
ABILITY_RE = re.compile(
    r'class="min-w-0 text-sm font-semibold"\s+aria-label="([^"]+)"[^>]*>.*?'
    r'<p class="mt-1 text-sm">([^<]+)</p>', re.S)
# Competitive-usage rows on a pokebase mon page. Items/Natures/Moves share a
# "name span + NN<!-- -->% span" shape; ability usage is in an aria-label.
USAGE_NAMEPCT_RE = re.compile(r'truncate font-medium[^"]*">([^<]+)</span>.*?([\d.]+)<!-- -->%', re.S)
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
    return os.path.join(CACHE, safe + ".json")


def http_json(url, cache_key=None, retries=4):
    cache_key = cache_key or url
    cp = _cache_path(cache_key)
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8") as f:
            return json.load(f)
    safe_url = urllib.parse.quote(url, safe=":/?&=%+,")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(safe_url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            os.makedirs(CACHE, exist_ok=True)
            with open(cp, "w", encoding="utf-8") as f:
                json.dump(data, f)
            time.sleep(0.03)  # be polite to PokeAPI
            return data
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:  # bad/unknown slug: permanent, don't retry
                raise
            last = e
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def fetch_pokebase_mon(slug):
    """Fetch a mon's pokebase Champions page once (cached) and pull out the two
    things only pokebase has Champions-accurate: its real movepool (move slugs appear
    as /pokemon-champions/moves/<slug> links) and its abilities with descriptions
    (incl. Champions-original ones like Mega Eelektross's "Eelevate" that PokeAPI
    doesn't know), plus competitive usage % (abilities/items/natures/moves).
    Returns {"moves": [...], "abilities": [[name, desc]...], "usage": {...}};
    fields stay empty on 404 so callers can fall back to PokeAPI."""
    cp = _cache_path(f"pbmon_{slug}")
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8") as f:
            return json.load(f)
    out = {"moves": [], "abilities": [], "usage": {}}
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{POKEBASE}/{slug}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                page = r.read().decode("utf-8", "ignore")
            out["moves"] = sorted(set(MOVE_LINK_RE.findall(page)))
            i = page.find("Abilities")
            seg = page[i:i + 3000] if i >= 0 else ""
            out["abilities"] = [[html.unescape(n).strip(), html.unescape(d).strip()]
                                for n, d in ABILITY_RE.findall(seg)]
            out["usage"] = parse_pb_usage(page)
            os.makedirs(CACHE, exist_ok=True)
            with open(cp, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False)
            time.sleep(0.1)  # be polite to pokebase
            return out
        except urllib.error.HTTPError as e:
            if e.code == 404:
                os.makedirs(CACHE, exist_ok=True)
                with open(cp, "w", encoding="utf-8") as f:
                    json.dump(out, f)
                return out
            time.sleep(1.5 * (attempt + 1))
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    return out


def fetch_champions_moves(slug):
    return fetch_pokebase_mon(slug)["moves"]


# Global M-B usage rate per mon, from the pokebase pokemon LIST page: each row is
# href="/pokemon-champions/pokemon/<slug>" followed by its rate as
# <span class="text-xs tabular-nums">NN.N<!-- -->%</span> before the next row's link.
def fetch_usage_rates():
    """Fetch the pokemon list page once (cached) -> {pokebase slug: usage %}."""
    cp = _cache_path("pb_usage_rates")
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8") as f:
            return json.load(f)
    rates = {}
    for attempt in range(4):
        try:
            req = urllib.request.Request(POKEBASE, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                page = r.read().decode("utf-8", "ignore")
            # pair-up: a slug binds to the FIRST rate after it, but only if no other
            # mon link sits in between (a row without a rate must not steal the next's).
            link_re = re.compile(r'href="/pokemon-champions/pokemon/([a-z0-9\-]+)"')
            links = [(m.start(), m.group(1)) for m in link_re.finditer(page)]
            rate_re = re.compile(r'tabular-nums">([\d.]+)<!-- -->%')
            rate_list = [(m.start(), float(m.group(1))) for m in rate_re.finditer(page)]
            ri = 0
            for li, (lpos, slug) in enumerate(links):
                nxt = links[li + 1][0] if li + 1 < len(links) else len(page)
                while ri < len(rate_list) and rate_list[ri][0] < lpos:
                    ri += 1
                if ri < len(rate_list) and rate_list[ri][0] < nxt and slug not in rates:
                    rates[slug] = rate_list[ri][1]
            os.makedirs(CACHE, exist_ok=True)
            with open(cp, "w", encoding="utf-8") as f:
                json.dump(rates, f)
            print(f"  usage rates: {len(rates)} mons from the pokebase list page")
            return rates
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    print("  WARNING: usage rates unavailable (pokebase list fetch failed)")
    return rates


def fetch_champ_repo(path):
    """A JSON file from the open Champions dataset repo (cached)."""
    return http_json(f"{CHAMP_REPO}/{path}", cache_key=f"repo_{path.replace('/', '_')}")


def _norm_key(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


# Moves the dataset repo omits from EVERY learnset while listing them in its own
# moves.json — an upstream generator bug (the move "Psychic" collides with the type
# name: 0/240 repo learnsets contain it, yet 23 mons' real ladder usage sets run it,
# e.g. Alakazam 16.7%). For these, keep the pokebase movepool as the source of truth.
REPO_OMITTED_MOVES = {"psychic"}


def apply_repo_learnsets(mons):
    """Replace each mon's movepool with the curated Champions learnset (Serebii-
    Champions, community-verified) from the dataset repo. pokebase lists the *full*
    mainline movepool (e.g. Aegislash with Autotomize), which isn't Champions-legal;
    the repo learnsets are reg-accurate. Mons the repo doesn't cover keep the pokebase
    movepool (strictly >= current accuracy)."""
    ls = fetch_champ_repo("learnsets/learnsets.json")
    name_idx = {_norm_key(k): v.get("moves", []) for k, v in ls.items()}
    dex_base = {}
    for v in ls.values():
        if str(v.get("form", "")).lower() in ("base", "normal", "") and v.get("dexNumber"):
            dex_base.setdefault(v["dexNumber"], v.get("moves", []))

    def candidates(m):
        nm, fl = m["species"], m["formLabel"]
        out = []
        if m["isMega"]:
            out.append(f"Mega {nm} X" if fl == "Mega X" else
                       f"Mega {nm} Y" if fl == "Mega Y" else f"Mega {nm}")
        if fl in ("Alolan", "Galarian", "Hisuian", "Paldean"):
            out.append(f"{fl} {nm}")
        if "Paldea" in fl:
            out.append(f"Paldean {nm}")
        if fl and not m["isMega"]:
            out.append(f"{nm} {fl}")
        out.append(nm)
        return out

    hits, miss = 0, []
    for m in mons:
        learn = None
        for c in candidates(m):
            learn = name_idx.get(_norm_key(c))
            if learn:
                break
        if learn is None and not m["isMega"]:
            learn = dex_base.get(m["dex"])
        if learn:
            new = {slugify(x["name"]) for x in learn}
            # re-add moves the repo omits globally, but only if pokebase agrees
            new |= REPO_OMITTED_MOVES & set(m["_moves"])
            m["_moves"] = sorted(new)
            m["_movesrc"] = "repo"
            hits += 1
        else:
            miss.append(m["slug"])  # keep pokebase movepool
    print(f"\nLearnsets: {hits}/{len(mons)} from the Champions dataset, "
          f"{len(miss)} kept pokebase{(' -> ' + ', '.join(miss)) if miss else ''}")
    # Diagnostic: a mon's real ladder usage moves are legal by definition — any of
    # them missing from its final learnset signals another repo omission to vet.
    gaps = collections.Counter()
    for m in mons:
        have = set(m["_moves"])
        for nm, _pct in (m.get("usage", {}).get("moves") or []):
            if slugify(nm) not in have:
                gaps[nm] += 1
    if gaps:
        print("  WARNING: usage-set moves missing from learnsets (possible repo omissions):")
        for nm, n in gaps.most_common(10):
            print(f"    {nm}: {n} mons")


def _between(page, a, b):
    """The slice of `page` from header `a` up to the next header `b` (or end)."""
    i = page.find(a)
    if i < 0:
        return ""
    j = page.find(b, i + len(a))
    return page[i:j] if j >= 0 else page[i:]


def parse_pb_usage(page):
    """Competitive usage % per category from a pokebase mon page. Each list is
    [[name, pct], ...] sorted as shown (most-used first), capped to USAGE_CAP."""
    def pairs(seg):
        return [[html.unescape(n).strip(), round(float(p), 1)]
                for n, p in USAGE_NAMEPCT_RE.findall(seg)][:USAGE_CAP]
    usage = {
        "abilities": [[html.unescape(n).strip(), round(float(p), 1)]
                      for n, p in ABIL_USAGE_RE.findall(page)][:USAGE_CAP],
        "items": pairs(_between(page, ">Items</h3>", ">Abilities</h3>")),
        "natures": pairs(_between(page, ">Natures</h3>", ">Items</h3>")),
        "moves": pairs(_between(page, ">Moves</h3>", ">Featured Teams</h3>")),
    }
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
    cp = _cache_path(f"pbmove_{slug}")
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8") as f:
            return json.load(f)
    out = {}
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{POKEBASE_MOVE}/{slug}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                page = r.read().decode("utf-8", "ignore")
            eff = META_DESC_RE.search(page)
            out = {
                "power": _pb_move_stat(page, "Power"),
                "accuracy": _pb_move_stat(page, "Accuracy"),
                "pp": _pb_move_stat(page, "PP"),
                "effect": re.sub(r"\s+", " ", html.unescape(eff.group(1))).strip() if eff else None,
            }
            os.makedirs(CACHE, exist_ok=True)
            with open(cp, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False)
            time.sleep(0.1)  # be polite to pokebase
            return out
        except urllib.error.HTTPError as e:
            if e.code == 404:
                os.makedirs(CACHE, exist_ok=True)
                with open(cp, "w", encoding="utf-8") as f:
                    json.dump(out, f)
                return out
            time.sleep(1.5 * (attempt + 1))
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    return out


def fetch_pokebase_ability_desc(slug):
    """Champions-accurate ability effect from pokebase's ability page meta
    description. Cached as a string; returns None on 404/missing so the caller
    falls back to PokeAPI."""
    cp = _cache_path(f"pb_ability_{slug}")
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8") as f:
            return json.load(f)
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{POKEBASE_ABILITY}/{slug}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                page = r.read().decode("utf-8", "ignore")
            m = META_DESC_RE.search(page)
            desc = html.unescape(m.group(1)).strip() if m else None
            os.makedirs(CACHE, exist_ok=True)
            with open(cp, "w", encoding="utf-8") as f:
                json.dump(desc, f)
            time.sleep(0.1)  # be polite to pokebase
            return desc
        except urllib.error.HTTPError as e:
            if e.code == 404:
                os.makedirs(CACHE, exist_ok=True)
                with open(cp, "w", encoding="utf-8") as f:
                    json.dump(None, f)
                return None
            time.sleep(1.5 * (attempt + 1))
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    return None


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
    p = http_json(f"{POKEAPI}/pokemon/{slug}", cache_key=f"poke_{slug}")

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

    # Real Champions movepool + abilities come from a single pokebase page fetch.
    # PokeAPI is the fallback for the movepool and supplies the hidden-ability flag.
    pb = fetch_pokebase_mon(slug)
    if pb["moves"]:
        moves, move_src = pb["moves"], "pokebase"
    else:
        moves = sorted({m["move"]["name"] for m in p["moves"]})
        move_src = "fallback"

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
def main():
    roster = fetch_roster()

    print("Fetching Pokemon data from PokeAPI ...")
    species_cache = {}
    mons, misses = [], []
    for i, e in enumerate(roster, 1):
        try:
            mons.append(fetch_pokemon(e, species_cache))
        except urllib.error.HTTPError as ex:
            if 400 <= ex.code < 500:
                misses.append(e["slug"])
                continue
            raise
        if i % 25 == 0 or i == len(roster):
            print(f"  {i}/{len(roster)} ({len(misses)} missing)")

    if misses:
        print("\n!! Slugs not found on PokeAPI (add to roster_overrides.json "
              "_remap or _skip):")
        for s in misses:
            print("   -", s)

    fb = [m["slug"] for m in mons if m["_movesrc"] == "fallback"]
    print(f"\nMovepools: {len(mons) - len(fb)} from pokebase, {len(fb)} fell back "
          f"to PokeAPI{(' -> ' + ', '.join(fb)) if fb else ''}")
    afb = [m["slug"] for m in mons if m["_abilsrc"] == "fallback"]
    print(f"Abilities: {len(mons) - len(afb)} mons from pokebase, {len(afb)} fell back "
          f"to PokeAPI{(' -> ' + ', '.join(afb)) if afb else ''}")

    # Replace pokebase's mainline movepools with the curated Champions learnsets.
    apply_repo_learnsets(mons)

    # ---- unique moves ----
    all_moves = sorted({m for mon in mons for m in mon["_moves"]})
    print(f"\nFetching {len(all_moves)} unique moves ...")
    move_meta, move_misses = {}, []
    for i, mv in enumerate(all_moves, 1):
        try:
            move_meta[mv] = fetch_move(mv)
        except urllib.error.HTTPError:
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
    for i, (mv, meta) in enumerate(move_meta.items(), 1):
        pb = fetch_pokebase_move(mv)
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
    with open(ids_path, "w", encoding="utf-8") as f:
        json.dump(name_ids, f, ensure_ascii=False, indent=0, sort_keys=True)
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
            except urllib.error.HTTPError:
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
        # global M-B usage rate: own list-page row, else inherit the base form's
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
            "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": "Bulbapedia (roster) + PokeAPI (stats/moves/abilities)",
            "regulation": "M-B",
            "count": sum(1 for m in out_mons if not m["isMega"]),
            "megaCount": sum(1 for m in out_mons if m["isMega"]),
        },
        "moves": moves_out,
        "abilities": abils_out,
        "typeChart": fetch_type_chart(),
        "pokemon": out_mons,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT) / 1024
    print(f"\nWrote {OUT}")
    print(f"  {data['meta']['count']} species, {data['meta']['megaCount']} "
          f"megas, {len(moves_out)} moves, {len(abils_out)} abilities "
          f"({size:.0f} KB)")
    if misses:
        print(f"  WARNING: {len(misses)} entries skipped (see above)")


if __name__ == "__main__":
    sys.exit(main())
