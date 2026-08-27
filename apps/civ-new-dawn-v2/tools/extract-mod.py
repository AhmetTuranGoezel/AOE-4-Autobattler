#!/usr/bin/env python3
"""Extract locally usable image assets from a Tabletop Simulator save.

The input may be normal JSON or TTS's binary BSON ``WorkshopUpload`` format,
even when the file is named ``mod.json``. The default command performs a full
scan, downloads each unique raster URL once, splits referenced CustomDeck
cells and Civ map-tile atlases, and writes JSON/CSV provenance manifests.

Examples (from this directory):

    python extract-mod.py scan
    python extract-mod.py extract
    python extract-mod.py extract --workshop-id 3566193474 --refresh-save
    python extract-mod.py verify

Downloaded artwork is intentionally ignored by Git. Keep publisher artwork
local unless you have permission to redistribute it.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import struct
import sys
import threading
import time
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

try:
    from PIL import Image, UnidentifiedImageError
except ImportError:
    Image = None
    UnidentifiedImageError = OSError


SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
DEFAULT_INPUT = SCRIPT_DIR / "mod.json"
DEFAULT_OUTPUT = APP_DIR / "assets" / "tts-extracted"
DEFAULT_WORKSHOP_ID = "3566193474"
SCHEMA_VERSION = 2

HTTP_URL = re.compile(r"^https?://[^\s\"'<>]+$", re.IGNORECASE)
UGC_PATH = re.compile(r"/ugc/([^/]+)/([^/?#]+)/?", re.IGNORECASE)
WINDOWS_RESERVED = {
    "con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}
GENERIC_NAMES = {
    "asset", "bag", "card", "cardcustom", "custom board", "custom model",
    "custom model bag", "custom tile", "custom token", "deck", "model",
    "token", "?",
}
IMAGE_ROLES = {
    "card-face", "card-back", "image-face", "image-back", "diffuse",
    "normal", "decal", "ui-image", "sky", "image",
}
ROLE_PRIORITY = {
    "card-face": 0, "card-back": 1, "image-face": 2, "image-back": 3,
    "diffuse": 4, "decal": 5, "ui-image": 6, "image": 7,
    "normal": 8, "sky": 9, "mesh": 20, "collider": 21,
    "assetbundle": 22, "pdf": 23, "url": 30,
}
EXTENSIONS = {
    "JPEG": ".jpg", "PNG": ".png", "GIF": ".gif", "WEBP": ".webp",
    "BMP": ".bmp", "TIFF": ".tif", "ICO": ".ico",
}

# The Civ map models select one of three atlas columns with their UVs. Each
# column contains the two printed sides of a numbered physical tile. These
# bounds come from the selector OBJs referenced by this save and deliberately
# omit the unused transparent gutters around each panel.
MAP_TILE_COLUMN_UV = (
    (0.034667, 0.344726),
    (0.344970, 0.655028),
    (0.655272, 0.965331),
)
MAP_TILE_ROW_UV = (
    (0.508333, 0.991667),  # top image row (OBJ v coordinates)
    (0.008333, 0.491667),  # bottom image row
)


# ---------------------------------------------------------------------------
# Minimal BSON reader (enough for TTS WorkshopUpload files)


def _cstr(data: bytes, offset: int) -> tuple[str, int]:
    end = data.index(b"\x00", offset)
    return data[offset:end].decode("utf-8", "replace"), end + 1


def _bson_string(data: bytes, offset: int) -> tuple[str, int]:
    if offset + 4 > len(data):
        raise ValueError("truncated BSON string length")
    length, = struct.unpack_from("<i", data, offset)
    if length < 1 or offset + 4 + length > len(data):
        raise ValueError("invalid BSON string length")
    start = offset + 4
    return data[start:start + length - 1].decode("utf-8", "replace"), start + length


def read_bson_document(data: bytes, offset: int = 0) -> tuple[dict[str, Any], int]:
    if offset + 4 > len(data):
        raise ValueError("truncated BSON document")
    size, = struct.unpack_from("<i", data, offset)
    end = offset + size
    if size < 5 or end > len(data) or data[end - 1] != 0:
        raise ValueError("invalid BSON document size or terminator")
    cursor = offset + 4
    result: dict[str, Any] = {}
    while cursor < end - 1:
        value_type = data[cursor]
        cursor += 1
        name, cursor = _cstr(data, cursor)
        if value_type == 0x01:
            value, = struct.unpack_from("<d", data, cursor)
            cursor += 8
        elif value_type == 0x02:
            value, cursor = _bson_string(data, cursor)
        elif value_type in (0x03, 0x04):
            value, cursor = read_bson_document(data, cursor)
            if value_type == 0x04:
                try:
                    value = [value[key] for key in sorted(value, key=lambda item: int(item))]
                except (TypeError, ValueError):
                    value = list(value.values())
        elif value_type == 0x05:
            length, = struct.unpack_from("<i", data, cursor)
            cursor += 4
            subtype = data[cursor]
            cursor += 1
            value = {"subtype": subtype, "hex": data[cursor:cursor + length].hex()}
            cursor += length
        elif value_type == 0x07:
            value = data[cursor:cursor + 12].hex()
            cursor += 12
        elif value_type == 0x08:
            value = bool(data[cursor])
            cursor += 1
        elif value_type == 0x09:
            value, = struct.unpack_from("<q", data, cursor)
            cursor += 8
        elif value_type == 0x0A:
            value = None
        elif value_type == 0x0B:
            pattern, cursor = _cstr(data, cursor)
            options, cursor = _cstr(data, cursor)
            value = {"pattern": pattern, "options": options}
        elif value_type in (0x0D, 0x0E):
            value, cursor = _bson_string(data, cursor)
        elif value_type == 0x10:
            value, = struct.unpack_from("<i", data, cursor)
            cursor += 4
        elif value_type in (0x11, 0x12):
            value, = struct.unpack_from("<q", data, cursor)
            cursor += 8
        else:
            raise ValueError(f"unsupported BSON type {value_type:#x} for {name!r}")
        if cursor > end:
            raise ValueError(f"BSON value {name!r} extends beyond its document")
        result[name] = value
    return result, end


def load_save(path: Path) -> tuple[dict[str, Any], str, bytes]:
    raw = path.read_bytes()
    stripped = raw.lstrip()
    if stripped.startswith((b"{", b"[")):
        document = json.loads(raw.decode("utf-8-sig"))
        source_format = "json"
    else:
        document, end = read_bson_document(raw)
        if end != len(raw):
            raise ValueError(f"BSON parser stopped at {end:,} of {len(raw):,} bytes")
        source_format = "bson"
    if not isinstance(document, dict):
        raise ValueError("TTS save root must be an object")
    return document, source_format, raw


# ---------------------------------------------------------------------------
# TTS object traversal and URL discovery


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_tag(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", clean_text(value).lower()).strip("_")


def object_tags(obj: dict[str, Any]) -> set[str]:
    raw = obj.get("Tags") or []
    if isinstance(raw, str):
        raw = [raw]
    return {normalized_tag(tag) for tag in raw if clean_text(tag)}


def object_label(obj: dict[str, Any]) -> str:
    return clean_text(obj.get("Nickname") or obj.get("Name") or obj.get("GUID") or "?")


@dataclass
class ObjectContext:
    obj: dict[str, Any]
    path: tuple[str, ...]
    state_id: int | None
    tags: frozenset[str]

    @property
    def tts_path(self) -> str:
        return "/".join(self.path)


def walk_objects(
    objects: Iterable[dict[str, Any]] | None,
    parent: tuple[str, ...] = (),
    inherited_tags: frozenset[str] = frozenset(),
    edge: str = "root",
    state_id: int | None = None,
) -> Iterable[ObjectContext]:
    for index, obj in enumerate(objects or []):
        if not isinstance(obj, dict):
            continue
        tags = frozenset(set(inherited_tags) | object_tags(obj))
        guid = clean_text(obj.get("GUID"))
        segment = f"{edge}[{index}] {object_label(obj)}"
        if guid:
            segment += f"#{guid}"
        path = parent + (segment,)
        yield ObjectContext(obj=obj, path=path, state_id=state_id, tags=tags)
        yield from walk_objects(obj.get("ContainedObjects"), path, tags, "contained", state_id)
        states = obj.get("States")
        if isinstance(states, dict):
            def state_sort(item: tuple[Any, Any]) -> tuple[int, str]:
                try:
                    return int(item[0]), str(item[0])
                except (TypeError, ValueError):
                    return sys.maxsize, str(item[0])
            for raw_state, state_obj in sorted(states.items(), key=state_sort):
                if not isinstance(state_obj, dict):
                    continue
                try:
                    parsed_state = int(raw_state)
                except (TypeError, ValueError):
                    parsed_state = None
                yield from walk_objects([state_obj], path, tags, f"state:{raw_state}", parsed_state)


def iter_url_values(value: Any, path: tuple[str, ...] = ()) -> Iterable[tuple[tuple[str, ...], str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in ("ContainedObjects", "States"):
                continue
            yield from iter_url_values(child, path + (str(key),))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_url_values(child, path + (f"[{index}]",))
    elif isinstance(value, str):
        url = value.strip().rstrip(",;)")
        if HTTP_URL.fullmatch(url):
            yield path, url


def last_field(path: tuple[str, ...]) -> str:
    for part in reversed(path):
        if not part.startswith("["):
            return part.lower()
    return ""


def role_for_field(path: tuple[str, ...]) -> str:
    lower = [part.lower() for part in path]
    field = last_field(path)
    if field == "faceurl" and "customdeck" in lower:
        return "card-face"
    if field == "backurl" and "customdeck" in lower:
        return "card-back"
    if field == "imageurl":
        if "attacheddecals" in lower or "decalpallet" in lower:
            return "decal"
        return "image-face"
    if field == "imagesecondaryurl":
        return "image-back"
    if field == "diffuseurl":
        return "diffuse"
    if field == "normalurl":
        return "normal"
    if field == "meshurl":
        return "mesh"
    if field == "colliderurl":
        return "collider"
    if field in ("assetbundleurl", "assetbundleurl2"):
        return "assetbundle"
    if field in ("pdfurl", "pdfurl2"):
        return "pdf"
    if field == "skyurl":
        return "sky"
    if field == "url" and "customuiassets" in lower:
        return "ui-image"
    if "image" in field or field.endswith(("texture", "decal")):
        return "image"
    return "url"


def deck_entry_from_field(path: tuple[str, ...]) -> str | None:
    lower = [part.lower() for part in path]
    if "customdeck" not in lower:
        return None
    index = lower.index("customdeck")
    return path[index + 1] if index + 1 < len(path) else None


def canonical_url(url: str) -> str:
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit((scheme, host, parts.path or "/", parts.query, ""))


def discover_references(document: dict[str, Any], contexts: list[ObjectContext]) -> list[dict[str, Any]]:
    references: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()

    def add_context(ctx: ObjectContext, field_path: tuple[str, ...], url: str) -> None:
        role = role_for_field(field_path)
        key = (
            canonical_url(url), role, ctx.tts_path, "/".join(field_path),
            ctx.state_id, clean_text(ctx.obj.get("GUID")),
        )
        if key in seen:
            return
        seen.add(key)
        references.append({
            "ref_id": f"ref-{len(references) + 1:05d}",
            "url": url,
            "canonical_url": canonical_url(url),
            "tts_asset_type": role,
            "tts_field": "/".join(field_path),
            "deck_entry_id": deck_entry_from_field(field_path),
            "owner": object_label(ctx.obj),
            "guid": clean_text(ctx.obj.get("GUID")) or None,
            "object_name": clean_text(ctx.obj.get("Name")) or None,
            "nickname": clean_text(ctx.obj.get("Nickname")) or None,
            "tags": sorted(ctx.tags),
            "tts_path": ctx.tts_path,
            "tts_path_segments": list(ctx.path),
            "state_id": ctx.state_id,
        })

    for ctx in contexts:
        for field_path, url in iter_url_values(ctx.obj):
            add_context(ctx, field_path, url)
    root_without_objects = {key: value for key, value in document.items() if key != "ObjectStates"}
    root_ctx = ObjectContext(
        obj={"Name": "Save", "Nickname": document.get("SaveName") or "Save"},
        path=(f"save {clean_text(document.get('SaveName') or 'Save')}",),
        state_id=None,
        tags=frozenset(),
    )
    for field_path, url in iter_url_values(root_without_objects):
        add_context(root_ctx, field_path, url)
    return references


# ---------------------------------------------------------------------------
# Classification, naming, downloads


def slug(value: Any, maximum: int = 72) -> str:
    text = unicodedata.normalize("NFKD", clean_text(value))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-. ") or "asset"
    text = text[:maximum].rstrip("-. ") or "asset"
    if text.casefold() in WINDOWS_RESERVED:
        text = f"_{text}"
    return text


def meaningful_owner(references: list[dict[str, Any]]) -> str:
    candidates: list[str] = []
    for ref in references:
        for value in (ref.get("nickname"), ref.get("owner"), ref.get("object_name")):
            name = clean_text(value)
            if name and name.lower().replace("_", " ") not in GENERIC_NAMES:
                candidates.append(name)
    if candidates:
        return sorted(set(candidates), key=lambda value: (-len(value), value.casefold()))[0]
    tags = sorted({tag for ref in references for tag in ref.get("tags", [])})
    return tags[0] if tags else "asset"


def semantic_category(references: list[dict[str, Any]]) -> str:
    roles = {ref["tts_asset_type"] for ref in references}
    tags = {tag for ref in references for tag in ref.get("tags", [])}
    object_names = {clean_text(ref.get("object_name")).lower() for ref in references}
    text = " ".join(clean_text(ref.get("tts_path")).lower() for ref in references)
    if "card-face" in roles:
        return "card-sheet"
    if "card-back" in roles:
        return "card-back"
    if "maptile" in tags:
        return "map-tiles"
    if "nat_wonder" in tags:
        return "natural-wonders"
    if "cs_token" in tags or "cs_deck" in tags:
        return "city-states"
    if "resource" in tags:
        return "resources"
    if "gov" in tags:
        return "government"
    if "district" in tags:
        return "districts"
    if "fort" in tags:
        return "forts"
    if tags & {"barb", "trade", "control", "control_token", "wonder_token"} or "custom_token" in object_names:
        return "tokens"
    if "custom_board" in object_names or " board" in text:
        return "boards"
    return "other-images"


def output_bucket(category: str) -> str:
    if category == "card-sheet":
        return "raw-sheets"
    if category == "card-back":
        return "cards/shared-backs"
    if category == "map-tiles":
        return "map-tiles"
    if category in {"natural-wonders", "city-states", "resources", "government", "districts", "forts", "tokens"}:
        return "tokens"
    if category == "boards":
        return "boards"
    return "other-images"


def make_asset_records(references: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ref in references:
        grouped[ref["canonical_url"]].append(ref)
    assets: list[dict[str, Any]] = []
    used_paths: dict[str, str] = {}
    for url in sorted(grouped):
        refs = grouped[url]
        full_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
        asset_id = full_hash[:16]
        roles = sorted({ref["tts_asset_type"] for ref in refs}, key=lambda role: (ROLE_PRIORITY.get(role, 99), role))
        category = semantic_category(refs)
        owner = meaningful_owner(refs)
        role = roles[0] if roles else "image"
        ugc = UGC_PATH.search(urlsplit(url).path)
        steam_id = f"ugc-{ugc.group(1)}" if ugc else "url"
        stem = f"{slug(owner)}__{slug(role, 32)}__{steam_id}__{asset_id}"
        relative_base = f"{output_bucket(category)}/{stem}"
        folded = relative_base.casefold()
        if folded in used_paths and used_paths[folded] != url:
            relative_base += f"__{full_hash[16:24]}"
            folded = relative_base.casefold()
        if folded in used_paths and used_paths[folded] != url:
            raise RuntimeError(f"unable to allocate a unique path for {url}")
        used_paths[folded] = url
        image_candidate = bool(set(roles) & IMAGE_ROLES)
        assets.append({
            "asset_id": asset_id,
            "url": refs[0]["url"],
            "canonical_url": url,
            "roles": roles,
            "category": category,
            "owner": owner,
            "image_candidate": image_candidate,
            "planned_file_base": relative_base,
            "status": "pending" if image_candidate else "not-requested",
            "file": None, "resolved_url": None, "format": None,
            "width": None, "height": None, "mode": None, "bytes": None,
            "sha256": None, "content_type": None, "attempts": 0,
            "error": None, "references": refs,
        })
    return assets


def url_candidates(url: str) -> list[str]:
    candidates = [url]
    match = UGC_PATH.search(urlsplit(url).path)
    if match:
        suffix = f"/ugc/{match.group(1)}/{match.group(2)}/"
        candidates.extend([
            f"https://cdn.steamusercontent.com{suffix}",
            f"https://steamusercontent-a.akamaihd.net{suffix}",
            f"https://images.steamusercontent.com{suffix}",
        ])
    unique: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        canonical = canonical_url(candidate)
        if canonical not in seen:
            seen.add(canonical)
            unique.append(candidate)
    return unique


def validate_image(path: Path) -> dict[str, Any]:
    if Image is None:
        raise RuntimeError("Pillow is required: python -m pip install Pillow")
    with Image.open(path) as image:
        image.load()
        return {"format": image.format or "UNKNOWN", "width": image.width, "height": image.height, "mode": image.mode}


def previous_asset_files(output: Path) -> dict[str, dict[str, Any]]:
    manifest_path = output / "manifests" / "assets.json"
    if not manifest_path.exists():
        return {}
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
        return {asset["canonical_url"]: asset for asset in document.get("assets", []) if asset.get("canonical_url") and asset.get("file")}
    except (OSError, ValueError, TypeError):
        return {}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_asset(
    asset: dict[str, Any], output: Path, previous: dict[str, dict[str, Any]],
    timeout: float, retries: int, force: bool,
) -> dict[str, Any]:
    result = dict(asset)
    old = previous.get(asset["canonical_url"])
    if old and not force:
        old_file = output / old["file"]
        if old_file.is_file() and old_file.stat().st_size:
            try:
                image_info = validate_image(old_file)
                result.update(old)
                result.update(image_info)
                result["status"] = "cached"
                result["error"] = None
                return result
            except (OSError, RuntimeError):
                pass
    base = output / asset["planned_file_base"]
    base.parent.mkdir(parents=True, exist_ok=True)
    if not force:
        for candidate_file in sorted(base.parent.glob(base.name + ".*")):
            if candidate_file.suffix == ".part" or not candidate_file.is_file():
                continue
            try:
                image_info = validate_image(candidate_file)
                result.update(image_info)
                result.update({
                    "status": "cached", "file": candidate_file.relative_to(output).as_posix(),
                    "bytes": candidate_file.stat().st_size, "sha256": sha256_file(candidate_file), "error": None,
                })
                return result
            except (OSError, RuntimeError):
                continue
    temp_dir = output / ".tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp = temp_dir / f"{asset['asset_id']}-{threading.get_ident()}.part"
    errors: list[str] = []
    attempts = 0
    for candidate_url in url_candidates(asset["url"]):
        for retry in range(max(1, retries + 1)):
            attempts += 1
            try:
                request = Request(candidate_url, headers={
                    "User-Agent": "Civ-New-Dawn-TTS-Asset-Extractor/1.0",
                    "Accept": "image/*,*/*;q=0.5",
                })
                with urlopen(request, timeout=timeout) as response, temp.open("wb") as target:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        target.write(chunk)
                    content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
                    resolved_url = response.geturl()
                image_info = validate_image(temp)
                extension = EXTENSIONS.get(image_info["format"], ".img")
                destination = base.with_suffix(extension)
                if destination.exists() and sha256_file(destination) == sha256_file(temp):
                    temp.unlink(missing_ok=True)
                else:
                    os.replace(temp, destination)
                result.update(image_info)
                result.update({
                    "status": "downloaded", "file": destination.relative_to(output).as_posix(),
                    "resolved_url": resolved_url, "content_type": content_type,
                    "bytes": destination.stat().st_size, "sha256": sha256_file(destination),
                    "attempts": attempts, "error": None,
                })
                return result
            except HTTPError as exc:
                errors.append(f"{candidate_url} -> HTTP {exc.code}")
                temp.unlink(missing_ok=True)
                if exc.code in (400, 401, 403, 404, 410):
                    break
                if retry < retries:
                    time.sleep(min(2 ** retry, 4))
            except (URLError, TimeoutError, OSError, UnidentifiedImageError, RuntimeError) as exc:
                errors.append(f"{candidate_url} -> {type(exc).__name__}: {exc}")
                temp.unlink(missing_ok=True)
                if retry < retries:
                    time.sleep(min(2 ** retry, 4))
    result.update({"status": "failed", "attempts": attempts, "error": " | ".join(errors[-8:]) or "download failed"})
    return result


# ---------------------------------------------------------------------------
# CustomDeck resolution and cropping


def valid_deck_entries(obj: dict[str, Any]) -> dict[str, dict[str, Any]]:
    deck = obj.get("CustomDeck")
    if not isinstance(deck, dict):
        return {}
    return {str(key): entry for key, entry in deck.items() if isinstance(entry, dict) and clean_text(entry.get("FaceURL"))}


def card_category(ctx: ObjectContext) -> tuple[str, str]:
    tags = set(ctx.tags)
    guid = clean_text(ctx.obj.get("GUID")).lower()
    path = ctx.tts_path.lower()
    for tag, category in (
        ("focus_card", "focus"), ("focus_unique", "focus"),
        ("civ_card", "civilizations"), ("diplo_card", "diplomacy"),
        ("cs_deck", "city-states"), ("gov", "government"),
    ):
        if tag in tags:
            return category, f"tag:{tag}"
    if "wonder pile" in path:
        return "wonders", "ancestor:Wonder Pile"
    if guid in {"d84d68", "12249d", "f7f4a3"}:
        return "victory", f"guid:{guid}"
    if "victory" in path or "agenda" in path:
        return "victory", "path:victory/agenda"
    if "government" in path:
        return "government", "path:government"
    if "city state" in path or "city-state" in path:
        return "city-states", "path:city-state"
    if "diplomacy" in path:
        return "diplomacy", "path:diplomacy"
    if "civ card bag" in path or "civilization" in path or "leader" in path:
        return "civilizations", "path:civilization/leader"
    if "focus card" in path:
        return "focus", "path:focus"
    return "unknown", "unclassified"


def meaningful_card_name(value: Any) -> str | None:
    name = clean_text(value)
    if not name or name.lower().replace("_", " ") in GENERIC_NAMES:
        return None
    return name


def collect_card_cells(
    contexts: list[ObjectContext], all_sheet_cells: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    groups: dict[tuple[str, int, int, int], dict[str, Any]] = {}
    sheet_defs: dict[tuple[str, int, int, str, bool], dict[str, Any]] = {}
    issues: list[dict[str, Any]] = []
    for ctx in contexts:
        entries = valid_deck_entries(ctx.obj)
        for deck_id, entry in entries.items():
            face = clean_text(entry.get("FaceURL"))
            back = clean_text(entry.get("BackURL"))
            cols = max(1, int(entry.get("NumWidth") or 1))
            rows = max(1, int(entry.get("NumHeight") or 1))
            key = (canonical_url(face), cols, rows, canonical_url(back) if back else "", bool(entry.get("UniqueBack")))
            sheet_defs.setdefault(key, {
                "face_url": face, "back_url": back or None, "cols": cols, "rows": rows,
                "unique_back": bool(entry.get("UniqueBack")), "deck_ids": set(),
                "owners": set(), "paths": set(),
            })
            sheet_defs[key]["deck_ids"].add(str(deck_id))
            sheet_defs[key]["owners"].add(object_label(ctx.obj))
            sheet_defs[key]["paths"].add(ctx.tts_path)
        ids: list[tuple[int, bool]] = []
        if ctx.obj.get("CardID") is not None:
            try:
                ids.append((int(ctx.obj["CardID"]), True))
            except (TypeError, ValueError):
                issues.append({"type": "invalid-card-id", "tts_path": ctx.tts_path, "value": ctx.obj.get("CardID")})
        for raw_id in ctx.obj.get("DeckIDs") or []:
            try:
                ids.append((int(raw_id), False))
            except (TypeError, ValueError):
                issues.append({"type": "invalid-deck-card-id", "tts_path": ctx.tts_path, "value": raw_id})
        for card_id, individual in ids:
            raw_deck_id = str(card_id // 100)
            entry = entries.get(raw_deck_id)
            resolution = "exact"
            resolved_deck_id = raw_deck_id
            if entry is None and len(entries) == 1:
                resolved_deck_id, entry = next(iter(entries.items()))
                resolution = "sole-entry-fallback"
                issues.append({
                    "type": "sole-deck-entry-fallback", "card_id": card_id,
                    "requested_deck_id": raw_deck_id, "resolved_deck_id": resolved_deck_id,
                    "tts_path": ctx.tts_path,
                })
            if entry is None:
                if entries:
                    issues.append({
                        "type": "unresolved-deck-entry", "card_id": card_id,
                        "deck_id": raw_deck_id, "available": sorted(entries), "tts_path": ctx.tts_path,
                    })
                continue
            face = clean_text(entry.get("FaceURL"))
            back = clean_text(entry.get("BackURL"))
            cols = max(1, int(entry.get("NumWidth") or 1))
            rows = max(1, int(entry.get("NumHeight") or 1))
            index = card_id % 100
            if index >= cols * rows:
                issues.append({
                    "type": "card-index-out-of-range", "card_id": card_id,
                    "index": index, "grid": f"{cols}x{rows}", "tts_path": ctx.tts_path,
                })
                continue
            category, evidence = card_category(ctx)
            key = (canonical_url(face), cols, rows, index)
            group = groups.setdefault(key, {
                "face_url": face, "back_urls": set(), "cols": cols, "rows": rows,
                "sheet_index": index, "names": Counter(), "categories": Counter(),
                "category_evidence": defaultdict(Counter), "deck_ids": set(),
                "card_ids": set(), "unique_back": False, "occurrences": [],
            })
            if back:
                group["back_urls"].add(back)
            group["deck_ids"].add(raw_deck_id)
            group["card_ids"].add(card_id)
            group["unique_back"] = group["unique_back"] or bool(entry.get("UniqueBack"))
            group["categories"][category] += 1
            group["category_evidence"][category][evidence] += 1
            name = meaningful_card_name(ctx.obj.get("Nickname")) if individual else None
            if name:
                group["names"][name] += 1
            group["occurrences"].append({
                "card_id": card_id, "deck_id": raw_deck_id, "resolved_deck_id": resolved_deck_id,
                "resolution": resolution, "name": name, "category": category,
                "category_evidence": evidence, "guid": clean_text(ctx.obj.get("GUID")) or None,
                "tts_owner": object_label(ctx.obj), "tts_path": ctx.tts_path, "tags": sorted(ctx.tags),
            })
    if all_sheet_cells:
        for definition in sheet_defs.values():
            for index in range(definition["cols"] * definition["rows"]):
                key = (canonical_url(definition["face_url"]), definition["cols"], definition["rows"], index)
                groups.setdefault(key, {
                    "face_url": definition["face_url"],
                    "back_urls": {definition["back_url"]} if definition["back_url"] else set(),
                    "cols": definition["cols"], "rows": definition["rows"], "sheet_index": index,
                    "names": Counter(), "categories": Counter({"unknown": 1}),
                    "category_evidence": defaultdict(Counter, {"unknown": Counter({"unreferenced-sheet-cell": 1})}),
                    "deck_ids": set(definition["deck_ids"]), "card_ids": set(),
                    "unique_back": definition["unique_back"], "occurrences": [],
                })
    cells: list[dict[str, Any]] = []
    for key in sorted(groups):
        group = groups[key]
        if group["names"]:
            name = sorted(group["names"], key=lambda item: (-group["names"][item], item.casefold()))[0]
            meaningful = True
        else:
            deck_label = sorted(group["deck_ids"])[0] if group["deck_ids"] else "unknown"
            name = f"deck-{deck_label}-card-{group['sheet_index']:02d}"
            meaningful = False
        non_unknown = {category: count for category, count in group["categories"].items() if category != "unknown"}
        category_counts = non_unknown or dict(group["categories"]) or {"unknown": 1}
        category = sorted(category_counts, key=lambda item: (-category_counts[item], item))[0]
        evidence_counter = group["category_evidence"].get(category, Counter())
        evidence = evidence_counter.most_common(1)[0][0] if evidence_counter else "unclassified"
        cells.append({
            "card_image_id": hashlib.sha256(f"{key[0]}|{key[1]}x{key[2]}|{key[3]}".encode("utf-8")).hexdigest()[:16],
            "name": name, "names": sorted(group["names"]), "meaningful_name": meaningful,
            "category": category, "category_evidence": evidence, "file": None,
            "back_file": None, "status": "pending", "deck_ids": sorted(group["deck_ids"]),
            "card_ids": sorted(group["card_ids"]),
            "deck_id": sorted(group["deck_ids"])[0] if group["deck_ids"] else None,
            "card_id": min(group["card_ids"]) if group["card_ids"] else None,
            "sheet_index": group["sheet_index"], "sheet_row": group["sheet_index"] // group["cols"],
            "sheet_column": group["sheet_index"] % group["cols"], "sheet_grid": f"{group['cols']}x{group['rows']}",
            "cols": group["cols"], "rows": group["rows"], "face_url": group["face_url"],
            "back_url": sorted(group["back_urls"])[0] if group["back_urls"] else None,
            "unique_back": bool(group["unique_back"]), "crop_box": None, "source_size": None,
            "output_size": None,
            "tts_owner": group["occurrences"][0]["tts_owner"] if group["occurrences"] else None,
            "tts_path": group["occurrences"][0]["tts_path"] if group["occurrences"] else None,
            "occurrences": group["occurrences"], "error": None,
        })
    serializable_defs: list[dict[str, Any]] = []
    for definition in sheet_defs.values():
        serializable_defs.append({
            **{key: value for key, value in definition.items() if key not in ("deck_ids", "owners", "paths")},
            "deck_ids": sorted(definition["deck_ids"]), "owners": sorted(definition["owners"]),
            "paths": sorted(definition["paths"]),
        })
    serializable_defs.sort(key=lambda item: (canonical_url(item["face_url"]), item["cols"], item["rows"]))
    return cells, serializable_defs, issues


def map_tile_number(reference: dict[str, Any]) -> int | None:
    """Return the numbered parent tile for a tagged Custom_Model reference."""
    if "maptile" not in {normalized_tag(tag) for tag in reference.get("tags") or []}:
        return None
    segments = reference.get("tts_path_segments") or clean_text(reference.get("tts_path")).split("/")
    for segment in reversed(segments):
        match = re.search(r"(?:Tile\s+)?(\d+)#[0-9a-f]+$", clean_text(segment), re.IGNORECASE)
        if match:
            number = int(match.group(1))
            if 1 <= number <= 999:
                return number
    return None


def collect_map_tile_sides(
    assets: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Map each numbered physical tile to the two panels in its diffuse atlas."""
    mesh_by_guid: dict[str, str] = {}
    for asset in assets:
        if "mesh" not in asset.get("roles", []):
            continue
        for reference in asset.get("references", []):
            guid = clean_text(reference.get("guid")).lower()
            if guid:
                mesh_by_guid[guid] = asset["canonical_url"]

    tiles: dict[tuple[int, str], dict[str, Any]] = {}
    issues: list[dict[str, Any]] = []
    tile_atlas: dict[int, str] = {}
    for asset in assets:
        if (
            asset.get("category") != "map-tiles"
            or "diffuse" not in asset.get("roles", [])
            or not asset.get("image_candidate")
        ):
            continue
        for reference in asset.get("references", []):
            number = map_tile_number(reference)
            if number is None:
                continue
            previous = tile_atlas.get(number)
            if previous and previous != asset["canonical_url"]:
                issues.append({
                    "type": "conflicting-map-tile-atlas", "tile_number": number,
                    "atlas_urls": sorted({previous, asset["canonical_url"]}),
                    "tts_path": reference.get("tts_path"),
                })
                continue
            tile_atlas[number] = asset["canonical_url"]
            column = (number - 1) % 3
            # The middle selector OBJ intentionally swaps its +Y and -Y rows.
            positive_y_row = 1 if column == 1 else 0
            guid = clean_text(reference.get("guid")).lower()
            for side, atlas_row, normal_y in (
                ("side-a", positive_y_row, 1),
                ("side-b", 1 - positive_y_row, -1),
            ):
                key = (number, side)
                tiles.setdefault(key, {
                    "tile_number": number, "side": side,
                    "file": None, "status": "pending", "atlas_url": asset["url"],
                    "atlas_canonical_url": asset["canonical_url"],
                    "atlas_file": asset.get("file"), "atlas_column": column,
                    "atlas_row": atlas_row, "surface_normal_y": normal_y,
                    "mesh_url": mesh_by_guid.get(guid), "guid": guid or None,
                    "tts_path": reference.get("tts_path"),
                    "tags": reference.get("tags") or [], "crop_box": None,
                    "source_size": None, "output_size": None, "error": None,
                })
    return [tiles[key] for key in sorted(tiles)], issues


def safe_png_mode(image: Any) -> Any:
    if image.mode in ("CMYK", "YCbCr"):
        return image.convert("RGB")
    if image.mode not in ("1", "L", "LA", "P", "RGB", "RGBA", "I", "I;16"):
        return image.convert("RGBA")
    return image


def crop_cards(cards: list[dict[str, Any]], assets_by_url: dict[str, dict[str, Any]], output: Path) -> list[dict[str, Any]]:
    if Image is None:
        raise RuntimeError("Pillow is required to crop card sheets")
    by_face: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card in cards:
        by_face[canonical_url(card["face_url"])].append(card)
    for face_url, face_cards in sorted(by_face.items()):
        asset = assets_by_url.get(face_url)
        if not asset or asset.get("status") not in ("downloaded", "cached") or not asset.get("file"):
            error = asset.get("error") if asset else "face URL was not discovered"
            for card in face_cards:
                card["status"] = "source-failed"
                card["error"] = error
            continue
        source = output / asset["file"]
        try:
            with Image.open(source) as sheet:
                sheet.load()
                for card in face_cards:
                    cols, rows = card["cols"], card["rows"]
                    col, row = card["sheet_column"], card["sheet_row"]
                    left, right = round(col * sheet.width / cols), round((col + 1) * sheet.width / cols)
                    top, bottom = round(row * sheet.height / rows), round((row + 1) * sheet.height / rows)
                    cropped = safe_png_mode(sheet.crop((left, top, right, bottom)))
                    directory = output / "cards" / card["category"]
                    directory.mkdir(parents=True, exist_ok=True)
                    filename = (
                        f"{slug(card['name'])}__deck-{slug(card.get('deck_id') or 'unknown', 20)}"
                        f"-cell-{card['sheet_index']:02d}__{card['card_image_id']}.png"
                    )
                    destination = directory / filename
                    temp = destination.with_suffix(".png.part")
                    cropped.save(temp, format="PNG", compress_level=6)
                    os.replace(temp, destination)
                    card.update({
                        "status": "extracted", "file": destination.relative_to(output).as_posix(),
                        "crop_box": [left, top, right, bottom], "source_size": [sheet.width, sheet.height],
                        "output_size": [right - left, bottom - top], "error": None,
                    })
        except (OSError, ValueError) as exc:
            for card in face_cards:
                card["status"] = "crop-failed"
                card["error"] = f"{type(exc).__name__}: {exc}"
    unique_by_back: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card in cards:
        if not card.get("back_url"):
            continue
        back_asset = assets_by_url.get(canonical_url(card["back_url"]))
        if not card["unique_back"]:
            if back_asset and back_asset.get("file"):
                card["back_file"] = back_asset["file"]
        else:
            unique_by_back[canonical_url(card["back_url"])].append(card)
    for back_url, back_cards in sorted(unique_by_back.items()):
        asset = assets_by_url.get(back_url)
        if not asset or asset.get("status") not in ("downloaded", "cached") or not asset.get("file"):
            continue
        source = output / asset["file"]
        try:
            with Image.open(source) as sheet:
                sheet.load()
                for card in back_cards:
                    cols, rows = card["cols"], card["rows"]
                    col, row = card["sheet_column"], card["sheet_row"]
                    left, right = round(col * sheet.width / cols), round((col + 1) * sheet.width / cols)
                    top, bottom = round(row * sheet.height / rows), round((row + 1) * sheet.height / rows)
                    cropped = safe_png_mode(sheet.crop((left, top, right, bottom)))
                    face_file = output / card["file"] if card.get("file") else None
                    if face_file:
                        destination = face_file.with_name(face_file.stem + "__back.png")
                    else:
                        directory = output / "cards" / card["category"]
                        directory.mkdir(parents=True, exist_ok=True)
                        destination = directory / f"{slug(card['name'])}__{card['card_image_id']}__back.png"
                    temp = destination.with_suffix(".png.part")
                    cropped.save(temp, format="PNG", compress_level=6)
                    os.replace(temp, destination)
                    card["back_file"] = destination.relative_to(output).as_posix()
        except (OSError, ValueError):
            continue
    return cards


def crop_map_tiles(
    map_tiles: list[dict[str, Any]], assets_by_url: dict[str, dict[str, Any]], output: Path,
) -> list[dict[str, Any]]:
    if Image is None:
        raise RuntimeError("Pillow is required to crop map-tile atlases")
    for tile in map_tiles:
        asset = assets_by_url.get(tile["atlas_canonical_url"])
        if not asset or asset.get("status") not in ("downloaded", "cached") or not asset.get("file"):
            tile["status"] = "source-failed"
            tile["error"] = asset.get("error") if asset else "map-tile atlas was not discovered"
            continue
        tile["atlas_file"] = asset["file"]
        source = output / asset["file"]
        try:
            with Image.open(source) as atlas:
                atlas.load()
                u_min, u_max = MAP_TILE_COLUMN_UV[tile["atlas_column"]]
                v_min, v_max = MAP_TILE_ROW_UV[tile["atlas_row"]]
                left, right = round(u_min * atlas.width), round(u_max * atlas.width)
                top, bottom = round((1 - v_max) * atlas.height), round((1 - v_min) * atlas.height)
                cropped = safe_png_mode(atlas.crop((left, top, right, bottom)))
                directory = output / "map-tiles" / "individual"
                directory.mkdir(parents=True, exist_ok=True)
                destination = directory / f"tile-{tile['tile_number']:02d}-{tile['side']}.png"
                temp = destination.with_suffix(".png.part")
                cropped.save(temp, format="PNG", compress_level=6)
                os.replace(temp, destination)
                tile.update({
                    "status": "extracted", "file": destination.relative_to(output).as_posix(),
                    "crop_box": [left, top, right, bottom],
                    "source_size": [atlas.width, atlas.height],
                    "output_size": [right - left, bottom - top], "error": None,
                })
        except (OSError, ValueError) as exc:
            tile["status"] = "crop-failed"
            tile["error"] = f"{type(exc).__name__}: {exc}"
    return map_tiles


# ---------------------------------------------------------------------------
# Manifests and command-line commands


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".part")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temp, path)


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".part")
    with temp.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temp, path)


def build_summary(
    contexts: list[ObjectContext], references: list[dict[str, Any]],
    assets: list[dict[str, Any]], cards: list[dict[str, Any]],
    map_tiles: list[dict[str, Any]], sheet_defs: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    files = [asset.get("file") for asset in assets if asset.get("file")]
    path_collisions = len(files) - len({path.casefold() for path in files})
    content_groups: dict[str, list[str]] = defaultdict(list)
    for asset in assets:
        if asset.get("sha256"):
            content_groups[asset["sha256"]].append(asset["canonical_url"])
    duplicate_groups = [urls for urls in content_groups.values() if len(urls) > 1]
    image_assets = [asset for asset in assets if asset["image_candidate"]]
    downloaded = [asset for asset in image_assets if asset["status"] == "downloaded"]
    cached = [asset for asset in image_assets if asset["status"] == "cached"]
    failed = [asset for asset in image_assets if asset["status"] == "failed"]
    extracted_cards = [card for card in cards if card["status"] == "extracted"]
    categories = Counter(card["category"] for card in cards)
    map_assets = [asset for asset in image_assets if asset["category"] == "map-tiles"]
    return {
        "walked_objects": len(contexts), "asset_references_found": len(references),
        "unique_urls": len(assets), "image_urls": len(image_assets),
        "successful_downloads": len(downloaded), "cached_downloads": len(cached),
        "failed_or_dead_urls": len(failed),
        "card_face_sheets": len({canonical_url(item["face_url"]) for item in sheet_defs}),
        "multi_cell_sprite_sheets": len({canonical_url(item["face_url"]) for item in sheet_defs if item["cols"] * item["rows"] > 1}),
        "referenced_card_cells": len(cards), "individual_card_images_extracted": len(extracted_cards),
        "cards_with_meaningful_names": sum(card["meaningful_name"] for card in cards),
        "unnamed_cards": sum(not card["meaningful_name"] for card in cards),
        "card_categories": dict(sorted(categories.items())),
        "map_tile_atlases_found": len(map_assets),
        "map_tile_atlases_downloaded": sum(asset["status"] in ("downloaded", "cached") for asset in map_assets),
        "individual_map_tile_sides_found": len(map_tiles),
        "individual_map_tile_sides_extracted": sum(tile["status"] == "extracted" for tile in map_tiles),
        "manifest_path_collisions": path_collisions, "byte_identical_url_groups": len(duplicate_groups),
        "deck_resolution_warnings": sum(issue["type"] == "sole-deck-entry-fallback" for issue in issues),
        "out_of_range_card_indices": sum(issue["type"] == "card-index-out-of-range" for issue in issues),
    }


def source_metadata(path: Path, source_format: str, raw: bytes, document: dict[str, Any]) -> dict[str, Any]:
    return {
        "path": str(path.resolve()), "format": source_format, "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "save_name": clean_text(document.get("SaveName")) or None,
    }


def scan_save(input_path: Path, all_sheet_cells: bool = False) -> dict[str, Any]:
    document, source_format, raw = load_save(input_path)
    contexts = list(walk_objects(document.get("ObjectStates") or []))
    references = discover_references(document, contexts)
    assets = make_asset_records(references)
    cards, sheet_defs, issues = collect_card_cells(contexts, all_sheet_cells=all_sheet_cells)
    map_tiles, map_issues = collect_map_tile_sides(assets)
    issues.extend(map_issues)
    summary = build_summary(contexts, references, assets, cards, map_tiles, sheet_defs, issues)
    return {
        "document": document, "source_format": source_format, "raw": raw,
        "contexts": contexts, "references": references, "assets": assets,
        "cards": cards, "map_tiles": map_tiles, "sheet_defs": sheet_defs,
        "issues": issues, "summary": summary,
    }


def fetch_workshop_save(workshop_id: str, destination: Path) -> dict[str, Any]:
    data = urlencode({"itemcount": "1", "publishedfileids[0]": workshop_id}).encode("ascii")
    request = Request(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        data=data, headers={"User-Agent": "Civ-New-Dawn-TTS-Asset-Extractor/1.0"},
    )
    with urlopen(request, timeout=45) as response:
        payload = json.load(response)
    details = payload.get("response", {}).get("publishedfiledetails", [])
    if not details or details[0].get("result") != 1 or not details[0].get("file_url"):
        raise RuntimeError(f"Steam did not return a downloadable file for Workshop item {workshop_id}")
    metadata = details[0]
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(destination.suffix + ".part")
    file_request = Request(metadata["file_url"], headers={"User-Agent": "Civ-New-Dawn-TTS-Asset-Extractor/1.0"})
    with urlopen(file_request, timeout=120) as response, temp.open("wb") as target:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            target.write(chunk)
    os.replace(temp, destination)
    safe_metadata = {key: metadata.get(key) for key in (
        "publishedfileid", "creator", "filename", "file_size", "file_url",
        "title", "time_created", "time_updated",
    )}
    atomic_json(destination.with_name("workshop-source.json"), safe_metadata)
    return safe_metadata


def ensure_input(args: argparse.Namespace) -> Path:
    path = Path(args.input).resolve()
    workshop_id = getattr(args, "workshop_id", None)
    refresh = getattr(args, "refresh_save", False)
    if workshop_id and (refresh or not path.exists()):
        print(f"Downloading Workshop save {workshop_id} -> {path}", flush=True)
        fetch_workshop_save(workshop_id, path)
    if not path.exists():
        raise FileNotFoundError(
            f"TTS save not found: {path}\nPlace it there or pass --workshop-id {DEFAULT_WORKSHOP_ID}."
        )
    return path


def command_scan(args: argparse.Namespace) -> int:
    input_path = ensure_input(args)
    scanned = scan_save(input_path)
    result = {
        "source": source_metadata(input_path, scanned["source_format"], scanned["raw"], scanned["document"]),
        "summary": scanned["summary"],
        "issues": dict(Counter(issue["type"] for issue in scanned["issues"])),
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def command_extract(args: argparse.Namespace) -> int:
    started = utc_now()
    input_path = ensure_input(args)
    output = Path(args.output).resolve()
    for directory in ("cards", "map-tiles", "tokens", "boards", "other-images", "raw-sheets", "manifests"):
        (output / directory).mkdir(parents=True, exist_ok=True)
    scanned = scan_save(input_path, all_sheet_cells=args.all_sheet_cells)
    assets, cards, map_tiles = scanned["assets"], scanned["cards"], scanned["map_tiles"]
    print(
        f"Found {len(scanned['references']):,} references, {len(assets):,} unique URLs, "
        f"{sum(asset['image_candidate'] for asset in assets):,} image URLs, {len(cards):,} referenced card cells.",
        flush=True,
    )
    if args.metadata_only:
        for asset in assets:
            if asset["image_candidate"]:
                asset["status"] = "metadata-only"
        for tile in map_tiles:
            tile["status"] = "metadata-only"
    else:
        if Image is None:
            raise RuntimeError("Pillow is required: python -m pip install Pillow")
        previous = previous_asset_files(output)
        pending = [asset for asset in assets if asset["image_candidate"]]
        finished_assets: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures = {
                pool.submit(download_asset, asset, output, previous, args.timeout, args.retries, args.force): asset
                for asset in pending
            }
            total = len(futures)
            for completed, future in enumerate(as_completed(futures), 1):
                result = future.result()
                finished_assets[result["canonical_url"]] = result
                if completed == 1 or completed % 10 == 0 or completed == total:
                    ok = sum(item["status"] in ("downloaded", "cached") for item in finished_assets.values())
                    failed = sum(item["status"] == "failed" for item in finished_assets.values())
                    print(f"[{completed}/{total}] images: {ok} available, {failed} failed", flush=True)
        assets = [finished_assets.get(asset["canonical_url"], asset) for asset in assets]
        assets_by_url = {asset["canonical_url"]: asset for asset in assets}
        cards = crop_cards(cards, assets_by_url, output)
        map_tiles = crop_map_tiles(map_tiles, assets_by_url, output)
    summary = build_summary(
        scanned["contexts"], scanned["references"], assets, cards, map_tiles,
        scanned["sheet_defs"], scanned["issues"],
    )
    failures = [
        {"asset_id": asset["asset_id"], "url": asset["url"], "roles": asset["roles"],
         "category": asset["category"], "error": asset.get("error")}
        for asset in assets if asset.get("status") == "failed"
    ]
    failures.extend(
        {"card_image_id": card["card_image_id"], "face_url": card["face_url"], "error": card.get("error")}
        for card in cards if card.get("status") in ("source-failed", "crop-failed")
    )
    failures.extend(
        {"tile_number": tile["tile_number"], "side": tile["side"],
         "atlas_url": tile["atlas_url"], "error": tile.get("error")}
        for tile in map_tiles if tile.get("status") in ("source-failed", "crop-failed")
    )
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generator": "apps/civ-new-dawn-v2/tools/extract-mod.py",
        "source": source_metadata(input_path, scanned["source_format"], scanned["raw"], scanned["document"]),
        "run": {"started_at": started, "finished_at": utc_now(), "output": str(output),
                "metadata_only": bool(args.metadata_only), "workers": args.workers,
                "retries": args.retries, "timeout": args.timeout},
        "summary": summary, "assets": assets, "card_sheets": scanned["sheet_defs"],
        "cards": cards, "map_tiles": map_tiles,
        "map_tile_layout": {
            "description": "Three atlas columns by two printed sides; side-a is the selector model's +Y surface.",
            "column_uv_bounds": MAP_TILE_COLUMN_UV, "row_uv_bounds": MAP_TILE_ROW_UV,
        },
        "issues": scanned["issues"],
    }
    manifests = output / "manifests"
    atomic_json(manifests / "assets.json", manifest)
    atomic_json(manifests / "summary.json", summary)
    atomic_json(manifests / "failures.json", failures)
    asset_rows = []
    for asset in assets:
        asset_rows.append({
            "asset_id": asset["asset_id"], "status": asset["status"], "category": asset["category"],
            "file": asset.get("file") or "", "url": asset["url"],
            "resolved_url": asset.get("resolved_url") or "", "roles": ";".join(asset["roles"]),
            "format": asset.get("format") or "", "width": asset.get("width") or "",
            "height": asset.get("height") or "", "bytes": asset.get("bytes") or "",
            "sha256": asset.get("sha256") or "", "reference_count": len(asset["references"]),
            "owners": ";".join(sorted({ref["owner"] for ref in asset["references"]})),
            "tts_paths": ";".join(sorted({ref["tts_path"] for ref in asset["references"]})),
            "error": asset.get("error") or "",
        })
    write_csv(manifests / "assets.csv", [
        "asset_id", "status", "category", "file", "url", "resolved_url", "roles",
        "format", "width", "height", "bytes", "sha256", "reference_count", "owners", "tts_paths", "error",
    ], asset_rows)
    card_rows = []
    for card in cards:
        card_rows.append({
            "name": card["name"], "category": card["category"], "file": card.get("file") or "",
            "back_file": card.get("back_file") or "", "deck_id": card.get("deck_id") or "",
            "card_id": card.get("card_id") or "", "sheet_index": card["sheet_index"],
            "sheet_row": card["sheet_row"], "sheet_column": card["sheet_column"],
            "sheet_grid": card["sheet_grid"], "face_url": card["face_url"],
            "back_url": card.get("back_url") or "", "tts_path": card.get("tts_path") or "",
            "tts_owner": card.get("tts_owner") or "", "meaningful_name": card["meaningful_name"],
            "status": card["status"], "category_evidence": card["category_evidence"],
            "error": card.get("error") or "",
        })
    write_csv(manifests / "cards.csv", [
        "name", "category", "file", "back_file", "deck_id", "card_id", "sheet_index",
        "sheet_row", "sheet_column", "sheet_grid", "face_url", "back_url", "tts_path",
        "tts_owner", "meaningful_name", "status", "category_evidence", "error",
    ], card_rows)
    write_csv(manifests / "map-tiles.csv", [
        "tile_number", "side", "file", "status", "atlas_file", "atlas_url",
        "atlas_column", "atlas_row", "surface_normal_y", "mesh_url", "guid",
        "tts_path", "crop_box", "source_size", "output_size", "error",
    ], ({
        **tile,
        "crop_box": json.dumps(tile.get("crop_box"), separators=(",", ":")) if tile.get("crop_box") else "",
        "source_size": json.dumps(tile.get("source_size"), separators=(",", ":")) if tile.get("source_size") else "",
        "output_size": json.dumps(tile.get("output_size"), separators=(",", ":")) if tile.get("output_size") else "",
        "error": tile.get("error") or "",
    } for tile in map_tiles))
    print(json.dumps(summary, indent=2, ensure_ascii=False), flush=True)
    print(f"Manifests: {manifests}", flush=True)
    if args.strict and (summary["failed_or_dead_urls"] or summary["manifest_path_collisions"]):
        return 2
    return 0


def command_verify(args: argparse.Namespace) -> int:
    output = Path(args.output).resolve()
    manifest_path = output / "manifests" / "assets.json"
    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    missing: list[str] = []
    invalid: list[str] = []
    paths: list[str] = []
    checked = 0
    for asset in document.get("assets", []):
        if asset.get("status") not in ("downloaded", "cached") or not asset.get("file"):
            continue
        checked += 1
        paths.append(asset["file"])
        path = output / asset["file"]
        if not path.is_file():
            missing.append(asset["file"])
            continue
        try:
            validate_image(path)
        except (OSError, RuntimeError) as exc:
            invalid.append(f"{asset['file']}: {exc}")
    for card in document.get("cards", []):
        for field in ("file", "back_file"):
            relative = card.get(field)
            if not relative or relative in paths:
                continue
            checked += 1
            paths.append(relative)
            path = output / relative
            if not path.is_file():
                missing.append(relative)
                continue
            try:
                validate_image(path)
            except (OSError, RuntimeError) as exc:
                invalid.append(f"{relative}: {exc}")
    for tile in document.get("map_tiles", []):
        relative = tile.get("file")
        if not relative or relative in paths:
            continue
        checked += 1
        paths.append(relative)
        path = output / relative
        if not path.is_file():
            missing.append(relative)
            continue
        try:
            validate_image(path)
        except (OSError, RuntimeError) as exc:
            invalid.append(f"{relative}: {exc}")
    collisions = len(paths) - len({path.casefold() for path in paths})
    result = {
        "checked_files": checked, "missing_files": missing, "invalid_images": invalid,
        "case_insensitive_path_collisions": collisions,
        "recorded_remote_failures": document.get("summary", {}).get("failed_or_dead_urls", 0),
        "ok": not missing and not invalid and not collisions,
    }
    atomic_json(output / "manifests" / "verify.json", result)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ok"] else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="command", required=True)
    def add_source_options(command: argparse.ArgumentParser) -> None:
        command.add_argument("--input", default=str(DEFAULT_INPUT), help="TTS JSON or BSON save (default: tools/mod.json)")
        command.add_argument("--workshop-id", help="Download this Workshop save if input is missing")
        command.add_argument("--refresh-save", action="store_true", help="Redownload --workshop-id even when input exists")
    scan = subparsers.add_parser("scan", help="Inspect the save without downloading assets")
    add_source_options(scan)
    scan.set_defaults(func=command_scan)
    extract = subparsers.add_parser("extract", help="Download images, crop cards, and write manifests")
    add_source_options(extract)
    extract.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Extraction output directory")
    extract.add_argument("--workers", type=int, default=8, help="Concurrent downloads (default: 8)")
    extract.add_argument("--retries", type=int, default=2, help="Retries after transient failures (default: 2)")
    extract.add_argument("--timeout", type=float, default=30, help="Per-request timeout in seconds")
    extract.add_argument("--force", action="store_true", help="Redownload verified cached files")
    extract.add_argument("--metadata-only", action="store_true", help="Write manifests without network downloads or crops")
    extract.add_argument("--all-sheet-cells", action="store_true", help="Also crop unreferenced grid cells")
    extract.add_argument("--strict", action="store_true", help="Exit nonzero when remote assets fail")
    extract.set_defaults(func=command_extract)
    verify = subparsers.add_parser("verify", help="Validate files recorded in an existing manifest")
    verify.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Extraction output directory")
    verify.set_defaults(func=command_verify)
    return parser


def main(argv: list[str] | None = None) -> int:
    args_list = list(sys.argv[1:] if argv is None else argv)
    if not args_list:
        args_list = ["extract"]
    elif args_list[0] not in {"scan", "extract", "verify", "-h", "--help"}:
        args_list.insert(0, "extract")
    parser = build_parser()
    args = parser.parse_args(args_list)
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
