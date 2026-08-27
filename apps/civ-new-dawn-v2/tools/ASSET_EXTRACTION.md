# Tabletop Simulator asset extraction

`extract-mod.py` reads the Civ: A New Dawn TTS save in `mod.json` (JSON or
BSON), discovers every referenced URL, downloads each raster once, and writes
locally usable assets under `../assets/tts-extracted/`.

Run on Windows:

```bat
extract-mod-assets.bat
```

Run on macOS/Linux:

```sh
./fetch-mod-assets.sh
```

Useful direct commands:

```sh
python extract-mod.py scan
python extract-mod.py extract
python extract-mod.py verify
python extract-mod.py extract --workshop-id 3566193474 --refresh-save
```

The output contains individually cropped cards, 21 two-sided map tiles,
tokens, boards, other images, untouched card sheets, and JSON/CSV provenance
manifests. `assets.json` is the complete manifest; `cards.csv` and
`map-tiles.csv` are convenient lookup tables.

For browser-only coding agents, build the smaller Git-trackable WebP pack:

```sh
python build-web-assets.py
```

That produces `../assets/tts-web/` with a searchable `catalog.json`, while the
full-resolution extraction remains local and ignored.

The Workshop source and generated artwork are intentionally ignored by Git.
They include publisher artwork, so do not redistribute them without the
appropriate rights.
