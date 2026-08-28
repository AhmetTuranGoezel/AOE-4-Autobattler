#!/usr/bin/env python3
"""Check the transcribed tile terrain against the printed faces it came from.

    python3 tools/audit-tile-terrain.py

rules-data.js says its 420 cells were read off the photographs in
assets/tts-web/map-tiles/individual/ by eye. Reading 420 hexes by eye gets
some of them wrong, and a wrong one is not cosmetic: terrain difficulty gates
movement and every placement rule, so a space printed as water that is
transcribed as hill lets tokens be placed out to sea, and a grass space
transcribed as hill refuses a card that should resolve on it. Both of those
were real, and both came in as bug reports rather than being caught here.

This measures each cell's mean colour in the middle of the hex, away from the
printed borders, and compares it against what the data claims:

  * Water is separable. It is the only blue-dominant surface on these tiles;
    every land type is red-dominant or neutral grey. A disagreement on that
    axis is reported as an ERROR.
  * The land types (grass / hill / forest / desert / mountain) are a green,
    olive and grey continuum that genuinely overlaps, so those are reported as
    REVIEW: the tool says which signature a cell sits closest to and by how
    much, and a person looks at the crop. It does not know better than you.

Cells carrying a printed token (resource, natural wonder, city-state,
barbarian) have a graphic covering their middle, so their ground colour cannot
be measured and they are skipped.

Use --crops DIR to write out the flagged hexes as images to look at.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
FACES = os.path.join(APP, "assets", "tts-web", "map-tiles", "individual")

# The sampling geometry rules-data.js documents: 635x990 faces, hex
# circumradius 127, three columns, side A running bottom-to-top per column.
CELL_A = [(127, 880), (127, 660), (127, 440), (127, 220),
          (317.5, 770), (317.5, 550), (317.5, 330), (317.5, 110),
          (508, 440), (508, 220)]
IMG_H = 990
HALF_W, HALF_H = 127, 110

# How far inside the hex to sample, so no border or neighbouring hex leaks in.
INSET_X, INSET_Y, STEP = 58, 50, 5

# A land cell has to beat its own terrain's signature by this much, in RGB
# distance, before it is worth a person's time.
REVIEW_MARGIN = 22


def load_tiles():
    out = subprocess.run(
        ["node", "-e",
         "const fs=require('fs'),vm=require('vm');"
         "const c=vm.createContext({window:{}});"
         "vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);"
         "console.log(JSON.stringify(c.window.CivRulesData.TILES));",
         os.path.join(APP, "rules-data.js")],
        capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def load_tile_numbers():
    src = open(os.path.join(APP, "tile-art.js"), encoding="utf-8").read()
    return {m.group(1): int(m.group(2))
            for m in re.finditer(r'"([A-Z0-9]+)":\s*\{\s*n:\s*(\d+)', src)}


def cell_points(side):
    return CELL_A if side == "A" else [(x, IMG_H - y) for x, y in CELL_A]


def sample(im, cx, cy):
    r = g = b = n = 0
    for dx in range(-INSET_X, INSET_X + 1, STEP):
        for dy in range(-INSET_Y, INSET_Y + 1, STEP):
            px = im.getpixel((int(cx + dx), int(cy + dy)))
            r += px[0]; g += px[1]; b += px[2]; n += 1
    return r / n, g / n, b / n


def collect(Image):
    tiles, numbers = load_tiles(), load_tile_numbers()
    obs = []
    for t in tiles:
        n = numbers.get(t["id"])
        if not n:
            continue
        for side in ("A", "B"):
            path = os.path.join(FACES, f"tile-{n:02d}-side-{side.lower()}.webp")
            if not os.path.isfile(path):
                continue
            im = Image.open(path).convert("RGB")
            pts = cell_points(side)
            for i, cell in enumerate(t["sides"][side]["cells"]):
                busy = any(cell.get(k) for k in
                           ("resource", "naturalWonder", "cityState", "barbarian"))
                rgb = sample(im, *pts[i])
                obs.append({"tile": t["id"], "n": n, "side": side, "cell": i,
                            "terr": cell.get("terrain"), "busy": busy,
                            "rgb": rgb, "br": rgb[2] - rgb[0], "path": path})
    return obs


def write_crop(Image, ImageDraw, o, out_dir, note):
    os.makedirs(out_dir, exist_ok=True)
    im = Image.open(o["path"]).convert("RGB")
    cx, cy = cell_points(o["side"])[o["cell"]]
    crop = im.crop((int(cx - HALF_W), int(cy - HALF_H),
                    int(cx + HALF_W), int(cy + HALF_H)))
    canvas = Image.new("RGB", (crop.width, crop.height + 30), (18, 20, 30))
    canvas.paste(crop, (0, 0))
    ImageDraw.Draw(canvas).text((6, crop.height + 9), note, fill=(255, 235, 160))
    name = f"tile{o['n']:02d}{o['side']}-cell{o['cell']}-{o['terr']}.png"
    canvas.save(os.path.join(out_dir, name))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--crops", metavar="DIR",
                    help="write the flagged hexes here as images")
    args = ap.parse_args()

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise SystemExit("Pillow is needed: python -m pip install pillow")

    if not os.path.isdir(FACES):
        raise SystemExit(f"no tile faces at {FACES}")

    obs = collect(Image)
    plain = [o for o in obs if not o["busy"]]
    print(f"{len(obs)} cells, {len(plain)} of them measurable "
          f"({len(obs) - len(plain)} carry a printed token)\n")

    # --- water: an error, because it is unambiguous in the pixels -----------
    wet = sorted(o["br"] for o in plain if o["terr"] == "water")
    dry = sorted(o["br"] for o in plain if o["terr"] != "water")
    if wet and dry:
        print(f"blue-minus-red   water: {wet[0]:+.0f} .. {wet[-1]:+.0f}   "
              f"land: {dry[0]:+.0f} .. {dry[-1]:+.0f}")

    errors = [o for o in plain if (o["br"] > 0) != (o["terr"] == "water")]
    if errors:
        print("\nERROR - the water axis disagrees with the data:")
        for o in sorted(errors, key=lambda o: (o["n"], o["side"], o["cell"])):
            r, g, b = o["rgb"]
            says = ("photo is WATER, data says " + str(o["terr"])
                    if o["br"] > 0 else "data says water, photo is LAND")
            print(f"  tile {o['tile']:<5} (printed {o['n']:>2}{o['side']}) "
                  f"cell {o['cell']}: {says}   RGB=({r:3.0f},{g:3.0f},{b:3.0f}) "
                  f"b-r={o['br']:+.0f}")
            if args.crops:
                write_crop(Image, ImageDraw, o, args.crops, says)
    else:
        print("\nno water/land disagreements.")

    # --- land: a prompt to look, not a verdict ------------------------------
    groups = defaultdict(list)
    for o in plain:
        if o["terr"] != "water":
            groups[o["terr"]].append(o)
    means = {t: tuple(sum(o["rgb"][i] for o in lst) / len(lst) for i in range(3))
             for t, lst in groups.items()}

    print("\nland signatures learned from the data:")
    for t in sorted(means):
        r, g, b = means[t]
        print(f"  {t:<9} n={len(groups[t]):<4} RGB=({r:3.0f},{g:3.0f},{b:3.0f})")

    review = []
    for terr, lst in groups.items():
        for o in lst:
            d = {t: sum((o["rgb"][i] - means[t][i]) ** 2 for i in range(3)) ** 0.5
                 for t in means}
            best = min(d, key=d.get)
            if best != terr and d[terr] - d[best] > REVIEW_MARGIN:
                o["looks"], o["d_own"], o["d_best"] = best, d[terr], d[best]
                review.append(o)

    if review:
        print(f"\nREVIEW - {len(review)} land cell(s) closer to another signature."
              "\n(overlapping terrain, so look at the crop before believing it)")
        for o in sorted(review, key=lambda o: o["d_best"] - o["d_own"]):
            r, g, b = o["rgb"]
            note = f"data={o['terr']} looks={o['looks']}"
            print(f"  tile {o['tile']:<5} (printed {o['n']:>2}{o['side']}) "
                  f"cell {o['cell']}: {note:<28} "
                  f"RGB=({r:3.0f},{g:3.0f},{b:3.0f}) "
                  f"own={o['d_own']:5.1f} best={o['d_best']:5.1f}")
            if args.crops:
                write_crop(Image, ImageDraw, o, args.crops, note)

    if args.crops:
        print(f"\ncrops written to {args.crops}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
