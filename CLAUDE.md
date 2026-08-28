# Claude Code workspace notes

## Civ: A New Dawn artwork

Browser-visible artwork for `apps/civ-new-dawn-v2` is tracked in:

`apps/civ-new-dawn-v2/assets/tts-web/`

Read `assets/tts-web/README.md` and search `assets/tts-web/catalog.json` before
creating placeholder graphics. The catalog maps descriptive names, categories,
tile numbers, source URLs, and TTS paths to 633 individual WebP files. It
includes cards, both sides of all 21 map tiles, tokens, boards, and other useful
gameplay images.

The full-resolution source extraction is intentionally Git-ignored. The WebP
files are the repository-safe copies to inspect and use in the browser app.

### Current browser integration

`apps/civ-new-dawn-v2/card-art.js` is the semantic, runtime-safe artwork
registry. It maps focus type + tier + physical player color, civilization IDs,
unique focus cards, science dials, focus bars, Ibrahim, the wonder/victory/
diplomacy/city-state cards, and the map tokens (control and its reinforced
back, districts, forts, city-states, resources, natural wonders, barbarians)
to tracked WebP paths. Keep this module free of gameplay state and do not
restore the old ignored `assets/mod/*.jpg` sprite-sheet dependency.

Its data is **generated**, not hand-written. `tools/build-art-manifest.py`
reads the pack and writes `assets/art-data.js`, a plain
`window.CivArtData = {...}` script loaded before `card-art.js`, so lookups stay
synchronous with no fetch. Re-run it after any change to the pack, then
`node tools/verify-art.js`, which checks that every card, token and colour the
rules name resolves to a file that exists. The tool refuses to guess: if a
sorted file listing stops matching the hand-read list beside it, the build
fails rather than shipping the wrong picture on a card.

The browser UI consumes that registry from `apps/civ-new-dawn-v2/ui.js`:

- the focus row uses the color-matched printed cards and focus bar;
- the tableau uses the color-matched science dial;
- the lobby and Civilization reference use the printed civilization sheets;
- live state (slot strength, trade, government, and unique-card status) remains
  an HTML overlay, so artwork and rules state do not become coupled.

The supported physical component colors are blue, red, orange, green, and
purple. Reuse `CivCardArt.colorId()` when a color-to-component lookup is needed.
