# Civ artwork for browser-based coding agents

This directory contains compact WebP copies of the useful Tabletop Simulator
artwork. Unlike `tts-extracted`, it is intended to be tracked by Git so a
browser-only Claude Code session can inspect and use the images.

Open `catalog.json` to search by card name, category, tile number, source URL,
or original TTS path. The pack includes individual cards, both sides of all 21
map tiles, tokens, boards, and miscellaneous gameplay images. Raw sprite sheets
and duplicate map atlases are omitted.

Regenerate it after running the full extractor:

```sh
python apps/civ-new-dawn-v2/tools/build-web-assets.py
```

These are reduced copies of publisher artwork. Keep the repository private and
do not redistribute the files without the appropriate rights.
