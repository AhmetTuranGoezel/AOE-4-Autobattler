#!/usr/bin/env python3
"""Index the committed artwork in assets/tts-web/ so the game can draw it.

The pack is 633 WebP files with three kinds of name:

  * self-describing, e.g. `early-empire-culture-1__deck-3-cell-…` — a focus
    card whose name, type and tech level are right there in the filename, or
    `alhambra__image-face__…`, a wonder token named after its wonder;
  * role-only, e.g. `district__image-face__ugc-…` — we know it is a district
    but not which one, and the order within its group is all we have to go on;
  * `deck-NNN-card-NN` — nothing at all.

The first kind is derived here. The other two were read off the images by eye
and are written out below as ordered lists: the Nth file of a group, sorted by
filename, is the Nth entry of its list. Sorting is what makes that stable, so
never reorder these lists to "tidy" them — they are keyed to the sort.

Output: assets/art-manifest.json, which is committed. It also slices the
six city-state token atlases (two tokens per image) into single tokens under
assets/tts-web/tokens/derived/.

    python3 tools/build-art-manifest.py
"""

import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
PACK = os.path.join(APP, "assets", "tts-web")
OUT = os.path.join(APP, "assets", "art-data.js")

# The five printed player colours, in the order the components are numbered.
# Only the first four have control tokens in the pack, and the game seats four.
COLORS = ["green", "blue", "orange", "red", "purple"]

# --- read by eye off the images ------------------------------------------

# cards/wonders, sorted. These files name themselves, so the list below is not
# how they are matched — it is the cross-check: if the pack ever stops carrying
# all 36, or renames one, the build says so instead of quietly shipping 35.
WONDERS = [
    "Alhambra", "Amundsen-Scott Research Station", "Apadana", "Big Ben",
    "Chichen Itza", "Colosseum", "Colossus", "Cristo Redentor", "Eiffel Tower",
    "Estadio do Maracana", "Forbidden City", "Great Library", "Great Lighthouse",
    "Great Zimbabwe", "Hanging Gardens", "Huey Teocalli", "Jebel Barkal",
    "Kilwa Kisiwani", "Kremlin", "Machu Picchu", "Oracle", "Orszaghaz",
    "Oxford University", "Pentagon", "Petra", "Porcelain Tower", "Potala Palace",
    "Pyramids", "Ruhr Valley", "Statue of Liberty", "Stonehenge",
    "Sydney Opera House", "Taj Mahal", "Terracotta Army", "University of Sankore",
    "Venetian Arsenal",
]

# cards/civilizations, sorted.
CIVS = ["america", "aztec", "egypt", "france", "japan", "rome",
        "scythia", "sumeria", "china", "england", "georgia", "inca",
        "indonesia", "netherlands", "nubia", "ottoman", "poland", "zulu"]

# cards/victory, sorted. The two fort cards carry one agenda; the other ten
# carry two, and which two travel together is printed on the card.
VICTORY = [
    ["fortified"], ["expeditionary"],
    ["populous", "preservationist"],
    ["warmonger", "paranoid"],
    ["civilized", "money_grubber"],
    ["explorer", "aesthetic"],
    ["defensive", "devastating"],
    ["technophile", "scholarly"],
    ["provincial", "diversified"],
    ["industrious", "progressive"],
    ["expansionist", "prolific"],
    ["diplomatic", "hoarder"],
]

# cards/diplomacy, sorted: five per colour, and the colour is named in the
# card's own text ("the purple player's capital"), so this is not guesswork.
DIPLOMACY = [
    ("purple", "non_aggression"), ("purple", "defensive_pact"),
    ("purple", "embassy"), ("purple", "joint_war"), ("purple", "open_borders"),
    ("red", "defensive_pact"), ("red", "joint_war"), ("red", "open_borders"),
    ("red", "non_aggression"), ("red", "embassy"),
    ("orange", "defensive_pact"), ("orange", "embassy"), ("orange", "joint_war"),
    ("orange", "non_aggression"), ("orange", "open_borders"),
    ("green", "defensive_pact"), ("green", "embassy"), ("green", "joint_war"),
    ("green", "non_aggression"), ("green", "open_borders"),
    ("blue", "defensive_pact"), ("blue", "embassy"), ("blue", "joint_war"),
    ("blue", "non_aggression"), ("blue", "open_borders"),
]

# cards/city-states, sorted: two decks of six.
CITY_STATE_CARDS = ["Antananarivo", "Auckland", "Brussels", "Carthage",
                    "Geneva", "Kabul", "Akkad", "Buenos Aires", "Kumasi",
                    "Mohenjo Daro", "Palenque", "Seoul"]

# tokens/cs-token…, sorted: six texture atlases, two tokens each, left then
# right. Sliced into single tokens by this script.
CITY_STATE_TOKENS = [
    ("Auckland", "Akkad"), ("Antananarivo", "Palenque"),
    ("Buenos Aires", "Kabul"), ("Mohenjo Daro", "Geneva"),
    ("Seoul", "Brussels"), ("Carthage", "Kumasi"),
]

# tokens/district__image-face…, sorted: five colours of five, in this order.
DISTRICT_ORDER = ["theater", "campus", "industrial", "trade", "encampment"]

# tokens/gov…, sorted — the token names the government and its focus type.
GOVERNMENTS = ["military", "industry", "science", "growth", "economy", "culture"]

# tokens/science…, sorted: the tech dial, one per colour.
DIAL_COLORS = ["purple", "blue", "red", "green", "orange"]

# tokens/asset…, sorted. Five of these are the printed focus bars, one per
# colour — and they are the extended Terra Incognita bar with two "1" slots
# (Terra p8). The sixth is not a bar at all: it is the barbarian direction
# token, the hex with the helm and the numbers 1-6 around it.
ASSET_TOKENS = [("focusBar", "blue"), ("focusBar", "red"), ("focusBar", "orange"),
                ("focusBar", "green"), ("focusBar", "purple"),
                ("barbDirection", None)]

# tokens/barb…, sorted: the letter printed on each barbarian token.
BARBARIANS = ["J", "K", "G", "I", "H", "F", "E", "D", "C", "B", "A"]

# The natural wonder tokens are filed by the resource printed on them, so they
# are scattered across four groups. This is the sorted concatenation of
# nat-wonder, diamond, marble, mercury and oil, with the four plain resource
# tokens marked as such.
RESOURCE_GROUP = [
    ("nw", "Mt Kilimanjaro"), ("nw", "Mount Everest"),
    ("nw", "Ha Long Bay"), ("nw", "Gobustan"),
    ("res", "diamonds"),
    ("nw", "Grand Mesa"), ("nw", "Galapagos Islands"), ("nw", "Torres del Paine"),
    ("nw", "Cliffs of Dover"), ("nw", "Dead Sea"), ("nw", "Mato Tipila"),
    ("res", "marble"),
    ("nw", "Pantanal"),
    ("res", "mercury"), ("nw", "Crater Lake"),
    ("res", "oil"),
]

FOCUS_TYPES = ["military", "science", "economy", "culture", "industry", "growth"]

# The focus deck exists five times over, once per player colour, as decks
# 212-239. The deck says which colour and which tech level; the card's own
# printed name says which type. These 24 names are the printed deck and mirror
# CARD_DEFS in rules-data.js — verify-art.js asserts the two still agree.
FOCUS_CARDS = {
    "irrigation": ("growth", 1), "engineering": ("growth", 2),
    "sanitation": ("growth", 3), "globalization": ("growth", 4),
    "foreign-trade": ("economy", 1), "currency": ("economy", 2),
    "steam-power": ("economy", 3), "capitalism": ("economy", 4),
    "masonry": ("military", 1), "iron-working": ("military", 2),
    "mass-production": ("military", 3), "flight": ("military", 4),
    "astrology": ("science", 1), "mathematics": ("science", 2),
    "replaceable-parts": ("science", 3), "nuclear-power": ("science", 4),
    "pottery": ("industry", 1), "animal-husbandry": ("industry", 2),
    "nationalism": ("industry", 3), "urbanization": ("industry", 4),
    "early-empire": ("culture", 1), "drama-and-poetry": ("culture", 2),
    "civil-service": ("culture", 3), "mass-media": ("culture", 4),
}

# deck number -> (colour, tech level).
FOCUS_DECKS = {
    212: ("red", 1), 216: ("blue", 1), 220: ("green", 1), 224: ("orange", 1), 228: ("purple", 1),
    213: ("red", 2), 217: ("blue", 2), 221: ("green", 2), 225: ("orange", 2), 229: ("purple", 2),
    214: ("red", 3), 218: ("blue", 3), 222: ("green", 3), 226: ("orange", 3), 232: ("purple", 3),
    215: ("red", 4), 219: ("blue", 4), 223: ("green", 4), 227: ("orange", 4), 239: ("purple", 4),
}


def rel(*parts):
    return "/".join(parts)


def listing(subdir, pattern=None):
    """Files in a pack subdirectory, sorted — the order every list above keys to."""
    d = os.path.join(PACK, *subdir.split("/"))
    if not os.path.isdir(d):
        return []
    names = sorted(n for n in os.listdir(d) if n.endswith(".webp"))
    if pattern:
        names = [n for n in names if re.match(pattern, n)]
    return [rel(subdir, n) for n in names]


def zip_exact(files, labels, what):
    """Pair a sorted listing with a hand-read list, refusing to guess.

    A mismatch means the pack changed under the lists, and quietly dropping the
    tail would put the wrong picture on the wrong card — so it is an error.
    """
    if len(files) != len(labels):
        raise SystemExit(
            f"{what}: {len(files)} files but {len(labels)} names. "
            "The pack changed; re-read the images before editing the list.")
    return zip(labels, files)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def build_focus_by_color():
    """The playable focus cards: one physical deck per player colour.

    Two files in the pack cannot be read by name — red's level-I science card
    is filed as "astronomy" though the card is Astrology, and blue's level-III
    military card lost its name entirely. Both fall out by elimination: once
    the other five types of that colour and level are placed, one type is left
    and one file is left, so there is nothing to guess.
    """
    table, leftovers = {}, []
    for path in listing("cards/focus"):
        m = re.match(r"^(.+?)__deck-(\d+)-cell-(\d+)__", os.path.basename(path))
        if not m:
            continue
        stem, deck = m.group(1), int(m.group(2))
        if deck not in FOCUS_DECKS:
            continue
        color, tier = FOCUS_DECKS[deck]
        card = FOCUS_CARDS.get(stem)
        if card and card[1] == tier:
            table.setdefault(card[0], {}).setdefault(str(tier), {})[color] = path
        else:
            leftovers.append((color, tier, path))

    for color, tier, path in leftovers:
        missing = [t for t in FOCUS_TYPES
                   if color not in table.get(t, {}).get(str(tier), {})]
        if len(missing) != 1:
            raise SystemExit(
                f"focus cards: {os.path.basename(path)} is unnamed and "
                f"{len(missing)} types are still open for {color} level {tier}. "
                "Read the card and add it to FOCUS_CARDS.")
        table.setdefault(missing[0], {}).setdefault(str(tier), {})[color] = path

    for t in FOCUS_TYPES:
        for tier in "1234":
            got = table.get(t, {}).get(tier, {})
            if len(got) != len(COLORS):
                raise SystemExit(f"focus cards: {t} level {tier} has {len(got)} of {len(COLORS)} colours")
    return table


def build_focus():
    """The reference focus deck, whose filenames carry type and tier outright:
    `<name>-<type>-<tier>`, and for the uniques `<name>-<type>-<tier>-<civ>`."""
    face, back, unique, unique_meta = {}, {}, {}, {}
    std = re.compile(r"^(.+)-(%s)-([1-4])$" % "|".join(FOCUS_TYPES))
    uniq = re.compile(r"^(.+)-(%s)-([1-4])-([a-z]+)$" % "|".join(FOCUS_TYPES))
    for path in listing("cards/focus"):
        name = os.path.basename(path)
        stem = name.split("__")[0]
        is_back = "__back" in name
        m = uniq.match(stem)
        if m and not is_back:
            unique[m.group(4)] = path
            unique_meta[m.group(4)] = {"name": m.group(1).replace("-", " "),
                                       "type": m.group(2), "tier": int(m.group(3))}
            continue
        m = std.match(stem)
        if m:
            (back if is_back else face)[f"{m.group(2)}-{m.group(3)}"] = path
    return face, back, unique, unique_meta


def build_named(subdir):
    """Tokens whose filename is their name, e.g. `ruhr-valley__image-face…`."""
    out = {}
    for path in listing(subdir):
        stem = os.path.basename(path).split("__")[0]
        out[stem] = path
    return out


def build_wonder_cards():
    """Wonder cards, matched to the printed name in their own filename."""
    def loose(text):
        return re.sub(r"[^a-z0-9]", "", text.lower())

    have = {}
    for path in listing("cards/wonders"):
        stem = os.path.basename(path).split("__")[0]
        have[loose(stem)] = path

    out, missing = {}, []
    for name in WONDERS:
        path = have.get(loose(name))
        if path:
            out[name] = path
        else:
            missing.append(name)
    if missing:
        raise SystemExit("no card art for: " + ", ".join(missing) +
                         " — the pack changed; re-read cards/wonders.")
    return out


def build_wonder_tokens():
    """Wonder tokens, matched to their card by a loosened name.

    The pack misspells one — `amunden-scott-…`, missing the *s* in Amundsen —
    so an exact slug match silently loses it. Four wonders genuinely have no
    token in the pack; those keep their drawn symbol and are named here so the
    gap is a known one rather than a surprise.
    """
    def loose(text):
        return re.sub(r"[^a-z0-9]", "", text.lower())

    have = {}
    for stem, path in build_named("tokens").items():
        have[loose(stem)] = path
    # Amundsen-Scott, as the pack spells it.
    aliases = {"amundsenscottresearchstation": "amundenscottresearchstation"}

    out, missing = {}, []
    for name in WONDERS:
        key = loose(name)
        path = have.get(key) or have.get(aliases.get(key, ""))
        if path:
            out[name] = path
        else:
            missing.append(name)
    if missing:
        print("no token art (drawn symbol is used): " + ", ".join(missing),
              file=sys.stderr)
    return out


def clear_flat_background(im, tol=26):
    """Flood the flat background in from the four corners and trim.

    Only pixels connected to an edge are cleared, so a white highlight inside
    the token keeps its opacity. Returns None when the corners disagree — a
    token photographed against a busy backdrop is left alone rather than eaten
    into.
    """
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    r0, g0, b0 = corners[0][:3]
    for c in corners[1:]:
        if abs(c[0] - r0) > tol or abs(c[1] - g0) > tol or abs(c[2] - b0) > tol:
            return None

    seen = bytearray(w * h)
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        r, g, b, a = px[x, y]
        if a and (abs(r - r0) > tol or abs(g - g0) > tol or abs(b - b0) > tol):
            continue
        seen[i] = 1
        px[x, y] = (r, g, b, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    box = im.getbbox()
    return im.crop(box) if box else im


def cutout(rel_path, tol=26):
    """Make a token's flat background transparent, and cache the result.

    Some of the extracted tokens carry their alpha and some do not: the plain
    control token is cut out, its reinforced back is the same disc on solid
    white, and the districts sit on a rectangle of grey stone. Drawn as they
    are, those rectangles paint over the tile underneath.

    The background is found by flooding in from the four corners, so only pixels
    connected to an edge are cleared — a white highlight inside the token keeps
    its opacity. Returns the original path unchanged when the file already has
    alpha, or when Pillow is not installed.
    """
    try:
        from PIL import Image
    except ImportError:
        return rel_path

    src = os.path.join(PACK, *rel_path.split("/"))
    im = Image.open(src)
    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
        return rel_path

    im = clear_flat_background(im.convert("RGBA"), tol)
    if im is None:
        return rel_path
    out_dir = os.path.join(PACK, "tokens", "derived")
    os.makedirs(out_dir, exist_ok=True)
    name = "cut-" + os.path.basename(rel_path)
    im.save(os.path.join(out_dir, name), "WEBP", quality=90)
    return rel("tokens/derived", name)


def hexify(rel_path):
    """Store a hex token as a clean pointy-top hex that fills a space exactly.

    The pack mixes the two hex orientations. The fortress and the city-states
    are photographed flat-top (wider than tall, 2/sqrt(3)); the districts are
    already pointy-top but sit on a rectangle of grey stone that no flood fill
    reaches cleanly. The board draws pointy-top, so a flat-top token lands 90
    degrees out and its corners spill over the neighbours.

    Rotating and masking here means the renderer can simply draw the file into
    the space and be right, with nothing to fudge per token.
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return rel_path

    src = os.path.join(PACK, *rel_path.split("/"))
    im = Image.open(src).convert("RGBA")
    box = im.getbbox()
    if box:
        im = im.crop(box)

    # Flat-top is wider than tall. Turn it upright.
    if im.width > im.height * 1.05:
        im = im.rotate(90, expand=True, resample=Image.BICUBIC)

    # Fit the widest pointy-top hex inside what we have, then mask to it. A
    # pointy-top hex of height h is h*sqrt(3)/2 across.
    h = im.height
    w = int(round(h * math.sqrt(3) / 2))
    if w > im.width:
        w = im.width
        h = int(round(w * 2 / math.sqrt(3)))
    im = im.resize((w, h), Image.LANCZOS)

    mask = Image.new("L", (w, h), 0)
    cx, cy, r = w / 2, h / 2, h / 2
    ImageDraw.Draw(mask).polygon(
        [(cx + r * math.sin(math.radians(60 * i)),
          cy - r * math.cos(math.radians(60 * i))) for i in range(6)],
        fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)

    out_dir = os.path.join(PACK, "tokens", "derived")
    os.makedirs(out_dir, exist_ok=True)
    name = "hex-" + os.path.basename(rel_path).replace("cut-", "")
    out.save(os.path.join(out_dir, name), "WEBP", quality=90)
    return rel("tokens/derived", name)


def slice_city_state_tokens():
    """Cut the six two-up atlases into twelve single tokens."""
    try:
        from PIL import Image
    except ImportError:
        print("Pillow not installed; keeping any previously sliced tokens.",
              file=sys.stderr)
        return {}
    files = listing("tokens", r"^cs-token")
    out_dir = os.path.join(PACK, "tokens", "derived")
    os.makedirs(out_dir, exist_ok=True)
    made = {}
    for (left, right), path in zip_exact(files, CITY_STATE_TOKENS, "cs-token atlases"):
        im = Image.open(os.path.join(PACK, *path.split("/"))).convert("RGBA")
        half = im.width // 2
        for name, box in ((left, (0, 0, half, im.height)),
                          (right, (half, 0, im.width, im.height))):
            crop = im.crop(box)
            # Two of the six atlases carry no alpha at all — the tokens sit on
            # flat black or flat white — so the same flood that cuts out the
            # control tokens runs here, and the trim comes with it.
            cut = clear_flat_background(crop)
            crop = cut if cut is not None else crop.crop(crop.getbbox() or (0, 0, crop.width, crop.height))
            out_name = f"cs-{slug(name)}.webp"
            crop.save(os.path.join(out_dir, out_name), "WEBP", quality=88)
            made[name] = hexify(rel("tokens/derived", out_name))
    return made


def main():
    if not os.path.isdir(PACK):
        raise SystemExit(f"no artwork pack at {PACK}")

    focus, focus_back, unique, unique_meta = build_focus()
    focus_by_color = build_focus_by_color()
    control, district, dial, gov, barb, focus_bar = {}, {}, {}, {}, {}, {}

    for path in listing("other-images", r"^control-"):
        name = os.path.basename(path)
        color = name.split("__")[0].split("-")[1]
        side = "plain" if "image-face" in name else "reinforced"
        control.setdefault(color, {})[side] = cutout(path)

    faces = listing("tokens", r"^district__image-face")
    if len(faces) != len(COLORS) * len(DISTRICT_ORDER):
        raise SystemExit(f"districts: expected {len(COLORS) * len(DISTRICT_ORDER)}, got {len(faces)}")
    for i, path in enumerate(faces):
        district.setdefault(COLORS[i // len(DISTRICT_ORDER)], {})[DISTRICT_ORDER[i % len(DISTRICT_ORDER)]] = hexify(cutout(path))

    for color, path in zip_exact(listing("tokens", r"^science"), DIAL_COLORS, "tech dials"):
        dial[color] = path
    # The bars are filed under the generic `asset` role, so the only thing
    # separating them from each other, and from the direction token, is order.
    barb_direction = None
    for (group, key), path in zip_exact(listing("tokens", r"^asset"), ASSET_TOKENS, "asset tokens"):
        if group == "focusBar":
            focus_bar[key] = path
        else:
            barb_direction = path
    for kind, path in zip_exact(listing("tokens", r"^gov"), GOVERNMENTS, "government tokens"):
        gov[kind] = path
    for letter, path in zip_exact(listing("tokens", r"^barb"), BARBARIANS, "barbarian tokens"):
        barb[letter] = cutout(path)

    natural, resource = {}, {}
    res_files = []
    for pat in (r"^nat-wonder", r"^diamond", r"^marble", r"^mercury", r"^oil"):
        res_files += listing("tokens", pat)
    for (kind, name), path in zip_exact(res_files, RESOURCE_GROUP, "resource tokens"):
        (natural if kind == "nw" else resource)[name] = cutout(path)

    diplomacy = {}
    for (color, kind), path in zip_exact(listing("cards/diplomacy"), DIPLOMACY, "diplomacy cards"):
        diplomacy.setdefault(color, {})[kind] = path

    manifest = {
        "note": "Generated by tools/build-art-manifest.py. Paths are relative to base.",
        "base": "assets/tts-web/",
        "colors": COLORS,
        "focus": focus,
        "focusBack": focus_back,
        "focusByColor": focus_by_color,
        "focusBar": focus_bar,
        "unique": unique,
        "uniqueMeta": unique_meta,
        "wonderCard": build_wonder_cards(),
        "wonderToken": build_wonder_tokens(),
        "civ": dict(zip_exact(listing("cards/civilizations"), CIVS, "civilization cards")),
        "victory": [{"agendas": a, "file": f}
                    for a, f in zip_exact(listing("cards/victory"), VICTORY, "victory cards")],
        "cityStateCard": dict(zip_exact(listing("cards/city-states"), CITY_STATE_CARDS, "city-state cards")),
        "cityStateToken": slice_city_state_tokens(),
        "diplomacy": diplomacy,
        "control": control,
        "district": district,
        "dial": dial,
        "gov": gov,
        "barbarian": barb,
        "naturalWonder": natural,
        "resource": resource,
        # The Ottoman "Ibrahim" card, handed to another player at the start of
        # a turn. It is a deck of one, so there is nothing to disambiguate.
        "ibrahim": (listing("cards/focus", r"^deck-201-card-00") or [None])[0],
        "barbDirection": barb_direction,
        "fort": hexify(cutout((listing("tokens", r"^fort") or [None])[0])),
        "eventTracker": (listing("tokens", r"^event-tracker") or [None])[0],
        "boards": listing("boards"),
    }

    # Written as a script, not JSON, so the page can read it with a plain
    # <script> tag: no fetch, no await, and card-art.js stays synchronous.
    # verify-art.js evals it the same way it evals rules-data.js.
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write('"use strict";\n\n')
        fh.write("// Generated by tools/build-art-manifest.py. Do not edit by hand:\n")
        fh.write("// re-run the tool instead, then `node tools/verify-art.js`.\n")
        fh.write("window.CivArtData = ")
        json.dump(manifest, fh, indent=1, sort_keys=False, ensure_ascii=False)
        fh.write(";\n")

    counts = {k: (len(v) if isinstance(v, (dict, list)) else 1)
              for k, v in manifest.items() if isinstance(v, (dict, list))}
    print(f"wrote {os.path.relpath(OUT, APP)}")
    for k in sorted(counts):
        print(f"  {k}: {counts[k]}")


if __name__ == "__main__":
    main()
