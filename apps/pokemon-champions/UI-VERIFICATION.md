# Cohesive UI refactor — verification

## Scope

Changes are confined to `apps/pokemon-champions`. Existing renderers, components,
calculations, storage, imports, and tournament models are reused. No live PokéBase
refresh, commit, push, staging, cleanup, or restoration was performed.

Primary competitive information stays visible. Point controls, secondary setup,
and detailed explanations expand separately. Battle and roster assumptions show
their current values even when mobile editing controls are closed.

## Final automated results

| Check | Result |
| --- | --- |
| `python -X utf8 -m unittest discover -s apps/pokemon-champions/tools -p 'test_*.py'` | 47 tests; OK; exit 0. Final discovery run: 29.347s. |
| Every `apps/pokemon-champions/tools/*.test.mjs`, run with Node | All 12 suites passed; each exit 0. |
| `python -X utf8 apps/pokemon-champions/tools/browser-smoke.py` | Exit 0; 1440×1000 and 390×844. |
| `python -X utf8 apps/pokemon-champions/tools/browser-items.py` | Exit 0; damage, items, build persistence, sharing, and practical Moves presets. |
| `python -X utf8 apps/pokemon-champions/tools/browser-meta.py` | Exit 0; fetch retry, regulation, exact evidence, stable IDs, and isolated imports. |
| `python -X utf8 apps/pokemon-champions/tools/browser-meta-presentation.py --live-images` | Exit 0; both viewport sizes, loaded sprites, compact dashboard and team navigation. |
| `python -X utf8 apps/pokemon-champions/tools/browser-cohesion.py --live-images` | Exit 0; 62 screenshots; loaded primary images; no page errors or page/overlay overflow. |
| `git diff --check -- apps/pokemon-champions` | Exit 0. Only Git's existing LF→CRLF warnings. |

The 12 Node suites are data-loading, detail-presentation, item-model, meta-model,
meta-presentation, move-effects, moves-rank-rules, roster-rank, snapshot,
team-analysis, team-store, and ui-cohesion.

These include both Shift Gear deletion mutations, the Champions Healer generator
regression, later tournament-fetch retry, exact spread/Nature evidence, source-only
portraits, stable saved IDs, and imported-build defaults. The roster remains 350
forms with one explicitly unverified learnset; missing source data is not invented.

## Visual review

Reviewed desktop **1440×1000** and mobile **390×844** screenshots with successfully
loaded Pokémon images—not just DOM assertions or blocked-image previews.

- Overview uses three detail tabs and shows six Base/Lv50 rows, explicit
  assumptions, nearby eHP, and secondary radar. Hydreigon and Florges are covered.
- Meta uses four horizontal usage cards on desktop and a readable 2×2 grid on
  mobile. Builds unite exact spreads with captured Nature evidence and distinct
  denominators. Common teammates have sprites; source/provenance help is optional.
- Team lists show six sprite slots, player, placement, record, event, and date.
  Only an opened team shows its compact sets. Undisclosed points are quiet;
  genuine unmapped Pokémon remain prominent and block import. Source portraits
  do not change mapping or eligibility.
- Moves keeps subject/current-stat summaries, mode-specific assumptions,
  practical item presets, Custom item, species-specific choices, and results
  visible. Browse and Best users retain independent settings.
- Damage follows subject → battle/roster assumptions → result filters/search →
  results. Current assumptions and individual overrides survive closed editing.
- Imported and edited Team Builder members retain all six calculated stats,
  directly editable Nature, ability, item, and moves when point editing closes.
  The first complete compact member is visible on populated mobile screens.
- Coverage offense/defense are peer desktop panels and stacked mobile panels;
  recommendations follow both. Compare puts numeric values ahead of the radar
  on mobile and contains matrix scrolling.
- Abilities/popups, autocomplete, and Sync have keyboard access, close/escape
  behavior, and focus restoration. Sync handles frontmost-dialog keyboard events.

Measured bottom edges in the final real-image run:

| Visible content | Desktop bottom (px) | Mobile bottom (px) |
| --- | ---: | ---: |
| All six Overview stat rows | 614 | 584 |
| First Moves Browse result | 439 | 771 |
| First Best users result | 440 | 704 |
| First All vs one damage result | 926 | 815 |
| First pinned One vs all damage result | 956 | 833 |
| First Team member's six current stats | 458 | 581 |

Screenshot artifacts are ignored local files under `.tmp-smoke/cohesion` and
`.tmp-smoke/meta-presentation`. The current successful set is the 62 named
cohesion captures; an older `failure-*` diagnostic is not final evidence.
Public image-host access was enabled only for image requests. Tournament
snapshots were served locally; no live tournament refresh ran.

## Numerical and interaction regressions

- Steelix, neutral Nature, zero offense investment, no item: Heavy Slam into
  Mega Floette **60–72%**; Metal Coat **72–87%**.
- Sirfetch'd Leaf Blade: no item **48–58%**, Leek **73–86%**.
- Team exact-build save/load and v5 share round-trip passed.
- Point/Nature/stage edits, persistent result searches, and assigned-move
  autocomplete retain focus and values through rerenders.
- Fixed a verified Team numeric-input recursion: removing a focused number
  field could emit its pending change again during blur. Same-value guards
  prevent duplicate rebuilding; HP editing stays focused, with no page errors.

The refactor does not assert that independently popular aggregate Nature, item,
ability, and move choices constitute an observed complete team set.
