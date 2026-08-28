#!/usr/bin/env python3
"""Render the TTS player-piece OBJ meshes as transparent browser sprites.

Tabletop Simulator uses one untextured mesh for every seat and applies its
colour through `ColorDiffuse`.  The browser game is a 2D canvas, so these
orthographic renders preserve the actual silhouettes while baking the five
printed component colours into small WebP files.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "source-models"
OUTPUT = HERE.parent / "assets" / "tts-web" / "pieces"
SIZE = 256
SCALE = 3

# Keep these in the same order and values as card-art.js. Purple is the spare
# physical set, but its sprites are generated too so old saves remain visual.
COLORS = {
    "blue": "#169eae",
    "red": "#d94747",
    "orange": "#e88b24",
    "green": "#76a94f",
    "purple": "#8b62b5",
}

MODELS = {
    "army": SOURCE / "army.obj",
    "caravan": SOURCE / "caravan.obj",
    "city": SOURCE / "city.obj",
    "capital": SOURCE / "capital.obj",
}


def vec_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def unit(v):
    length = math.sqrt(dot(v, v)) or 1.0
    return tuple(part / length for part in v)


def read_obj(path: Path):
    vertices = []
    triangles = []
    with path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            if line.startswith("v "):
                vertices.append(tuple(map(float, line.split()[1:4])))
            elif line.startswith("f "):
                face = []
                for token in line.split()[1:]:
                    raw = int(token.split("/", 1)[0])
                    face.append(raw - 1 if raw > 0 else len(vertices) + raw)
                for i in range(1, len(face) - 1):
                    triangles.append((face[0], face[i], face[i + 1]))
    if not vertices or not triangles:
        raise ValueError(f"{path} is not a usable OBJ mesh")
    return vertices, triangles


def rgb(hex_colour):
    value = hex_colour.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def shade(colour, amount):
    # A small warm lift keeps the plastic from looking like a flat UI glyph.
    base = rgb(colour)
    return tuple(max(0, min(255, round(part * amount + 10))) for part in base) + (255,)


def render(vertices, triangles, colour, kind):
    canvas_size = SIZE * SCALE
    # Camera looks from the lower-right corner of the table. The wagon gets a
    # little more side view so both the cart body and draught animal read at
    # focus-card size.
    camera = unit((1.55, 1.65, 2.35) if kind == "caravan" else (1.45, 1.75, 2.15))
    world_up = (0.0, 1.0, 0.0)
    right = unit(cross(world_up, camera))
    screen_up = unit(cross(camera, right))
    light = unit((-0.65, 1.0, 0.45))

    projected = [(dot(v, right), -dot(v, screen_up), dot(v, camera)) for v in vertices]
    xs = [v[0] for v in projected]
    ys = [v[1] for v in projected]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    fit = (canvas_size * 0.76) / max(width, height)
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    # Lift the model slightly to leave a real tabletop shadow beneath it.
    pixel = [((x - cx) * fit + canvas_size / 2,
              (y - cy) * fit + canvas_size * 0.47,
              depth) for x, y, depth in projected]

    faces = []
    for tri in triangles:
        a, b, c = (vertices[i] for i in tri)
        normal = unit(cross(vec_sub(b, a), vec_sub(c, a)))
        # Some archived meshes have mixed winding. Two-sided plastic shading
        # avoids black holes while retaining enough facets to show the model.
        diffuse = abs(dot(normal, light))
        facing = abs(dot(normal, camera))
        amount = 0.48 + 0.38 * diffuse + 0.12 * facing
        depth = sum(pixel[i][2] for i in tri) / 3
        faces.append((depth, [pixel[i][:2] for i in tri], shade(colour, amount)))

    # Painter's algorithm: distant facets first, then the faces nearest camera.
    faces.sort(key=lambda item: item[0])
    model = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(model)
    for _, points, fill in faces:
        draw.polygon(points, fill=fill)

    alpha = model.getchannel("A")
    outline = ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(13)), alpha)
    outline_layer = Image.new("RGBA", model.size, (12, 15, 22, 210))
    outline_layer.putalpha(outline.point(lambda value: round(value * 0.78)))

    shadow = Image.new("RGBA", model.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    box_w = canvas_size * (0.31 if kind in {"city", "capital"} else 0.34)
    shadow_draw.ellipse(
        (canvas_size / 2 - box_w, canvas_size * 0.69,
         canvas_size / 2 + box_w, canvas_size * 0.84),
        fill=(0, 0, 0, 145),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(canvas_size * 0.025))

    result = Image.alpha_composite(shadow, outline_layer)
    result = Image.alpha_composite(result, model)
    return result.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for kind, source in MODELS.items():
        vertices, triangles = read_obj(source)
        for colour_id, colour in COLORS.items():
            target = OUTPUT / f"{kind}-{colour_id}.webp"
            render(vertices, triangles, colour, kind).save(
                target, "WEBP", quality=92, method=6, exact=True)
            print(target.relative_to(HERE.parent))


if __name__ == "__main__":
    main()
