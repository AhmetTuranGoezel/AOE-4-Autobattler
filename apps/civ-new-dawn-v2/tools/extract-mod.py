#!/usr/bin/env python3
"""Pull the asset list out of a Tabletop Simulator workshop save.

TTS writes its saves as BSON, not JSON, so this carries a small reader rather
than pulling in a dependency. What comes out is every image and mesh in the
save, labelled with the object that owns it and where that object sits.

    python3 extract-mod.py WorkshopUpload > mod-assets.json
    python3 extract-mod.py WorkshopUpload --tiles      # just the map tiles
    python3 extract-mod.py WorkshopUpload --fetch out/ > fetch.sh

The map tiles are the interesting part: each is a bag named with the tile
number, and its contents are the tile art plus every marker that belongs on it,
including both sides of the double-sided natural wonder / city-state tokens.
"""

import json
import re
import struct
import sys

# --- BSON ------------------------------------------------------------------

def _cstr(b, i):
    j = b.index(b"\x00", i)
    return b[i:j].decode("utf8", "replace"), j + 1


def read_doc(b, i=0):
    """Enough of BSON for a TTS save: the value types it actually emits."""
    size, = struct.unpack_from("<i", b, i)
    end = i + size
    i += 4
    out = {}
    while i < end - 1:
        t = b[i]; i += 1
        name, i = _cstr(b, i)
        if t == 0x01:                                   # double
            v, = struct.unpack_from("<d", b, i); i += 8
        elif t == 0x02:                                 # string
            n, = struct.unpack_from("<i", b, i); i += 4
            v = b[i:i + n - 1].decode("utf8", "replace"); i += n
        elif t in (0x03, 0x04):                         # document / array
            v, i = read_doc(b, i)
            if t == 0x04:
                v = [v[k] for k in sorted(v, key=lambda x: int(x))]
        elif t == 0x08:                                 # bool
            v = bool(b[i]); i += 1
        elif t == 0x0A:                                 # null
            v = None
        elif t == 0x10:                                 # int32
            v, = struct.unpack_from("<i", b, i); i += 4
        elif t in (0x11, 0x12):                         # timestamp / int64
            v, = struct.unpack_from("<q", b, i); i += 8
        else:
            raise ValueError("unhandled BSON type %#x for %r" % (t, name))
        out[name] = v
    return out, end


# --- walking the object tree ----------------------------------------------

def children(obj):
    """Bagged and stacked objects, plus the alternate faces held in States."""
    for kid in obj.get("ContainedObjects") or []:
        yield kid, None
    states = obj.get("States")
    if isinstance(states, dict):
        for idx in sorted(states, key=lambda x: int(x)):
            yield states[idx], int(idx)


def label(obj):
    return obj.get("Nickname") or obj.get("Name") or "?"


def walk(objs, path=(), state=None):
    for obj in objs or []:
        yield obj, path, state
        here = path + (label(obj),)
        for kid, kid_state in children(obj):
            yield from walk([kid], here, kid_state if kid_state is not None else state)


def assets_of(obj):
    """Every URL an object points at, tagged with what kind of asset it is."""
    out = []
    img = obj.get("CustomImage") or {}
    if img.get("ImageURL"):
        out.append(("face", img["ImageURL"]))
    if img.get("ImageSecondaryURL"):
        out.append(("back", img["ImageSecondaryURL"]))
    mesh = obj.get("CustomMesh") or {}
    for key, kind in (("MeshURL", "mesh"), ("DiffuseURL", "diffuse"),
                      ("NormalURL", "normal"), ("ColliderURL", "collider")):
        if mesh.get(key):
            out.append((kind, mesh[key]))
    deck = obj.get("CustomDeck") or {}
    for entry in deck.values():
        if isinstance(entry, dict):
            if entry.get("FaceURL"):
                out.append(("card-face", entry["FaceURL"]))
            if entry.get("BackURL"):
                out.append(("card-back", entry["BackURL"]))
    return out


# --- map tiles -------------------------------------------------------------

TILE_BAGS = ("Non Capitol Map Tile Bag", "Capitol Tile Bag")


def map_tiles(root):
    """The numbered map tiles, each with its pieces and their images."""
    bags = {}
    for obj, _, _ in walk(root):
        nick = obj.get("Nickname") or ""
        if nick in TILE_BAGS:
            bags[nick] = obj

    tiles = []
    for bag_name in TILE_BAGS:
        bag = bags.get(bag_name)
        if not bag:
            continue
        for tile in bag.get("ContainedObjects") or []:
            number = re.sub(r"^Tile\s*", "", str(tile.get("Nickname") or "")).strip()
            sides = re.match(r"\((.+?)\s*/\s*(.+?)\)", tile.get("Description") or "")
            pieces = []
            for obj, path, state in walk(list(children_only(tile)), (), None):
                found = assets_of(obj)
                if not found:
                    continue
                pieces.append({
                    "kind": obj.get("Name"),
                    "state": state,
                    "scale": round((obj.get("Transform") or {}).get("scaleX", 0), 3),
                    "assets": [{"type": k, "url": u} for k, u in found],
                })
            tiles.append({
                "number": number,
                "capital": bag_name == "Capitol Tile Bag",
                "description": tile.get("Description") or "",
                "sideA": sides.group(1) if sides else None,
                "sideB": sides.group(2) if sides else None,
                "pieces": pieces,
            })
    tiles.sort(key=lambda t: (t["capital"], int(t["number"]) if t["number"].isdigit() else 99))
    return tiles


def children_only(obj):
    for kid, _ in children(obj):
        yield kid


# --- naming for the fetch script ------------------------------------------

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "asset"


def piece_name(piece, asset):
    """Self-describing suffix, so the downloaded files say what they are.

    A tile bag holds the hex art plus the markers that get placed on it; the
    double-sided wonder / city-state token carries each side in its own state.
    """
    kind = piece.get("kind")
    if kind == "Custom_Tile":
        # One distinct image per tile at marker scale. Almost certainly the
        # board art, but I could not download one to confirm — open it and see.
        return "tile-image"
    if kind == "Custom_Token":
        state = piece.get("state")
        return "marker-%s" % ("b" if state and state > 1 else "a")
    if kind and kind.startswith("Custom_Model"):
        return "figure-%s" % asset["type"]
    if kind == "Deck":
        return "diplomacy-%s" % asset["type"].replace("card-", "")
    return "%s-%s" % (slug(kind or "piece"), asset["type"])


def fetch_script(tiles, everything, out_dir):
    lines = [
        "#!/usr/bin/env bash",
        "# Download the Civ: A New Dawn mod assets. Run this where Steam is",
        "# reachable — the sandbox this was generated in cannot reach it.",
        "#",
        "# These are scans of published Fantasy Flight / Asmodee artwork. Fine for",
        "# your own copy of the game; think before publishing them.",
        "set -euo pipefail",
        'cd "$(dirname "$0")"',
        "mkdir -p %s" % out_dir,
        "",
        "get() {  # get <url> <destination>",
        '  [ -s "$2" ] && { echo "have $2"; return; }',
        '  echo "-> $2"',
        '  curl -fsSL --retry 3 -o "$2" "$1"',
        "}",
        "",
    ]
    seen = set()
    for tile in tiles:
        name = "%s%s" % ("capital-" if tile["capital"] else "tile-", tile["number"])
        if tile["sideA"]:
            name += "-%s-%s" % (slug(tile["sideA"]), slug(tile["sideB"]))
        lines.append("# tile %s  %s" % (tile["number"], tile["description"]))
        for piece in tile["pieces"]:
            for asset in piece["assets"]:
                if asset["url"] in seen:
                    continue
                seen.add(asset["url"])
                ext = "obj" if asset["type"] == "mesh" else "jpg"
                lines.append('get "%s" "%s/%s-%s.%s"'
                             % (asset["url"], out_dir, name, piece_name(piece, asset), ext))
        lines.append("")

    lines.append("# everything else in the save")
    for item in everything:
        if item["url"] in seen:
            continue
        seen.add(item["url"])
        ext = "obj" if item["type"] == "mesh" else "jpg"
        lines.append('get "%s" "%s/%s-%s.%s"'
                     % (item["url"], out_dir, slug(item["owner"]), item["type"], ext))
    lines.append("")
    lines.append('echo "done: $(ls -1 %s | wc -l) files"' % out_dir)
    return "\n".join(lines)


# --- entry point -----------------------------------------------------------

def main(argv):
    if len(argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    raw = open(argv[1], "rb").read()
    doc, _ = read_doc(raw)
    root = doc.get("ObjectStates", [])

    everything = []
    for obj, path, state in walk(root):
        for kind, url in assets_of(obj):
            everything.append({
                "type": kind,
                "url": url,
                "owner": label(obj),
                "path": "/".join(path),
                "state": state,
            })

    tiles = map_tiles(root)

    if "--tiles" in argv:
        print(json.dumps(tiles, indent=1, ensure_ascii=False))
        return 0

    if "--fetch" in argv:
        out_dir = argv[argv.index("--fetch") + 1]
        print(fetch_script(tiles, everything, out_dir))
        return 0

    print(json.dumps({
        "saveName": doc.get("SaveName"),
        "objectCount": sum(1 for _ in walk(root)),
        "assetCount": len(everything),
        "tiles": tiles,
        "assets": everything,
    }, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
