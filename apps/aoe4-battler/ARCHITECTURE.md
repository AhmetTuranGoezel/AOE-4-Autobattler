# AoE4 Battler Architecture

## Purpose
This app is split so future work can stay inside one feature area instead of opening the whole battler.

## File Map
- `index.html`
  Thin shell for the battler UI. Loads `src/main.js`.
- `src/main.js`
  Bootstraps the app and wires compatibility globals.
- `src/shared/data.js`
  Loads `units_restructured.json` and `units_index.json`.
- `src/shared/constants.js`
  Shared civ ordering, flag paths, and cross-mode UI helpers.
- `src/unit-battler/index.js`
  Core combat surface for Unit Battler, vs Building, Multi Battle, and shared combat navigation.
- `src/build-order/index.js`
  Build Order timeline, simulation, UI, and metrics.
- `src/vs-building/index.js`
  Thin wrapper for vs Building exports.
- `src/multi-battle/index.js`
  Thin wrapper for Multi Battle exports.

## Data Guidance
- `units_restructured.json`
  Canonical full combat dataset.
- `units_index.json`
  Generated lightweight metadata for dropdowns, civ grouping, tags, and most Build Order unit lists/defaults.
- `tools/generate_unit_index.py`
  Regenerates `units_index.json` from the canonical dataset.

## Prompt Scope
- Build Order work:
  Start with `src/build-order/index.js`, then `src/shared/data.js` if unit metadata is involved.
- Unit Battler / vs Building work:
  Start with `src/unit-battler/index.js`, then `src/shared/constants.js` or `src/shared/data.js` as needed.
- Multi Battle work:
  Start with `src/unit-battler/index.js` and `src/multi-battle/index.js`.
- Data work:
  Start with `units_index.json`; only open `units_restructured.json` when you need deep combat stats.

## Notes
- The battler stays static-browser friendly: native ES modules, no bundler.
- The old battler monolith is archived under `research/legacy/` and should not be the default entrypoint for new work.
