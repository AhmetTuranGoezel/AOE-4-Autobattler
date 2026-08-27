#!/usr/bin/env python3
"""Build a compact, Git-trackable image pack for browser-based coding agents."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError


SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
DEFAULT_SOURCE = APP_DIR / "assets" / "tts-extracted"
DEFAULT_OUTPUT = APP_DIR / "assets" / "tts-web"
INCLUDED_ROOTS = (
    "cards",
    "map-tiles/individual",
    "tokens",
    "boards",
    "other-images",
)
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def source_metadata(source: Path) -> dict[str, dict[str, Any]]:
    manifest_path = source / "manifests" / "assets.json"
    if not manifest_path.is_file():
        return {}
    manifest = load_json(manifest_path)
    metadata: dict[str, dict[str, Any]] = {}
    for asset in manifest.get("assets", []):
        if asset.get("file"):
            metadata.setdefault(asset["file"], {
                "asset_id": asset.get("asset_id"),
                "source_url": asset.get("url"),
                "roles": asset.get("roles") or [],
                "tts_paths": sorted({ref.get("tts_path") for ref in asset.get("references", []) if ref.get("tts_path")}),
            })
    for card in manifest.get("cards", []):
        for field, side in (("file", "face"), ("back_file", "back")):
            if card.get(field):
                metadata.setdefault(card[field], {
                    "name": card.get("name"), "kind": "card", "side": side,
                    "category": card.get("category"), "source_url": card.get("face_url") if side == "face" else card.get("back_url"),
                    "sheet_grid": card.get("sheet_grid"), "sheet_index": card.get("sheet_index"),
                    "crop_box": card.get("crop_box") if side == "face" else None,
                    "tts_paths": [card.get("tts_path")] if card.get("tts_path") else [],
                })
    for tile in manifest.get("map_tiles", []):
        if tile.get("file"):
            metadata.setdefault(tile["file"], {
                "name": f"Tile {tile.get('tile_number')} {tile.get('side')}",
                "kind": "map-tile", "tile_number": tile.get("tile_number"),
                "side": tile.get("side"), "source_url": tile.get("atlas_url"),
                "crop_box": tile.get("crop_box"),
                "tts_paths": [tile.get("tts_path")] if tile.get("tts_path") else [],
            })
    return metadata


def image_files(source: Path) -> list[Path]:
    result: list[Path] = []
    for relative in INCLUDED_ROOTS:
        root = source / relative
        if root.is_dir():
            result.extend(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
    return sorted(set(result), key=lambda path: path.relative_to(source).as_posix().casefold())


def convert_image(source_file: Path, destination: Path, maximum: int, quality: int) -> dict[str, Any]:
    with Image.open(source_file) as original:
        original.seek(0)
        original.load()
        original_size = [original.width, original.height]
        has_alpha = original.mode in ("RGBA", "LA") or (original.mode == "P" and "transparency" in original.info)
        image = original.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".part")
        image.save(temporary, format="WEBP", quality=quality, method=6, exact=has_alpha)
        os.replace(temporary, destination)
        return {
            "source_size": original_size,
            "preview_size": [image.width, image.height],
            "has_alpha": has_alpha,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=str(DEFAULT_SOURCE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--max-size", type=int, default=1024)
    parser.add_argument("--quality", type=int, default=78)
    args = parser.parse_args()
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    if not (source / "manifests" / "assets.json").is_file():
        raise SystemExit(f"Missing extraction manifest: {source / 'manifests' / 'assets.json'}")
    metadata = source_metadata(source)
    entries: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    files = image_files(source)
    for index, source_file in enumerate(files, 1):
        relative = source_file.relative_to(source).as_posix()
        preview_relative = Path(relative).with_suffix(".webp").as_posix()
        destination = output / preview_relative
        try:
            image_info = convert_image(source_file, destination, max(64, args.max_size), max(1, min(100, args.quality)))
            entries.append({
                "id": hashlib.sha256(relative.encode("utf-8")).hexdigest()[:16],
                "source_file": relative, "file": preview_relative,
                "group": relative.split("/", 1)[0],
                "bytes": destination.stat().st_size,
                **image_info, **metadata.get(relative, {}),
            })
        except (OSError, UnidentifiedImageError, ValueError) as exc:
            failures.append({"source_file": relative, "error": f"{type(exc).__name__}: {exc}"})
        if index == 1 or index % 50 == 0 or index == len(files):
            print(f"[{index}/{len(files)}] converted {len(entries)}, failed {len(failures)}", flush=True)

    catalog = {
        "schema_version": 1,
        "description": "Compact WebP copies of Civ: A New Dawn TTS artwork for browser-based coding agents.",
        "source_manifest": "../tts-extracted/manifests/assets.json (local, Git-ignored)",
        "settings": {"max_size": args.max_size, "quality": args.quality, "format": "WebP"},
        "summary": {
            "images": len(entries), "failures": len(failures),
            "bytes": sum(entry["bytes"] for entry in entries),
            "groups": {group: sum(entry["group"] == group for entry in entries) for group in sorted({entry["group"] for entry in entries})},
        },
        "images": entries, "failures": failures,
    }
    output.mkdir(parents=True, exist_ok=True)
    catalog_path = output / "catalog.json"
    temporary = catalog_path.with_suffix(".json.part")
    temporary.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, catalog_path)
    print(json.dumps(catalog["summary"], indent=2), flush=True)
    return 2 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
