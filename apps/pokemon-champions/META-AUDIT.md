# Team workflow and tournament/meta audit

Completed locally on 2026-09-23. Changes are confined to `apps/pokemon-champions`; nothing was pushed. Existing quick item presets in Moves were preserved.

## What changed

- Saved teams have persistent unique IDs. Legacy IDs are retained; missing or duplicate IDs are migrated. Loading a team populates Team Name and records its original name/ID. Same name → update that ID; changed name → create a new ID and select the new copy. Name collisions produce an explicit error. Unreadable storage blocks saving instead of destroying the original data.
- Published teams and shared links open as **unsaved working teams**. Replacing a nonempty working team with a published team requires confirmation; named saves remain untouched.
- Team members now retain Nature and all six Stat Points through editing, persistence and v5 share links. Older share versions remain readable. Team speed and Damage Team Check use those builds. Opponent imports affect only Damage, not the working team, saved teams or loaded-team identity.
- Detail panels now show complete six-stat spreads, conditional Nature distributions from actual sets, standalone Nature usage, selected abilities, items, move shares, grouped teammates, featured teams and tournament teams. There are Show More controls, source links, dates, dataset selection and import warnings.
- Exact spread buttons apply points to Stat Lab; conditional Nature buttons apply both. Stat Lab can apply that build to Team Builder. Its original per-stat display remains in place, with corrected statistical labels.
- Static mechanics no longer contain usage fields. The static generator will not reintroduce them. A comparison with the pre-change snapshot confirmed that all other parsed mechanics data is unchanged.

## Source and access

The generator uses public Pokémon pages such as [Mega Gengar, M-C](https://pokebase.app/pokemon-champions/pokemon/gengar-mega?regulation=m-c). It reads structured data embedded in Next.js server responses, including arrays used for client-side pagination. A small bounded HTML adapter extracts ability percentages and verifies the actively selected regulation. No source visual design or application code was copied into OwlTools.

[PokéBase access rules](https://pokebase.app/robots.txt) disallow `/api`; those endpoints were not requested. Requests are limited to allowed public pages, spaced at least one second apart. Access/rate-limit errors stop the run. Transient network/server failures get at most three attempts.

Visitors only fetch our own snapshots. Full raw team records are loaded on demand when opening details, not during initial roster/Moves/Damage startup.

## Current coverage

Snapshot generation: **2026-09-23 14:19:46 UTC**. Individual entries retain their actual fetch timestamps; a forced Mega Gengar audit at **14:19:20 UTC** reproduced the stored aggregate percentages.

| Dataset | Pokémon/forms with verified matching source data | Featured teams | Tournament teams | Captured publication/event dates |
|---|---:|---:|---:|---|
| M-C | 325 | 244 | 1,491 | Sep 9–22, 2026 |
| M-B | 307 | 568 | 2,306 | Jun 17–Sep 6, 2026 |
| M-A | 227 | 646 | 1,453 | Apr 7–Jun 16, 2026 |

There are **6,708 unique published teams: 5,250 tournament and 1,458 featured**. Repeated appearances on different Pokémon pages are deduplicated by source team ID and dataset. After rejecting regulation fallbacks, this snapshot also has no duplicate team IDs across datasets. An incomplete five-slot publication was explicitly excluded.

These are published selections, **not the entire PokéBase archive**. Full aggregate rows are captured, including later client pages. Each Pokémon page supplies capped team selections (up to 16 of each kind), without another preview page to follow. The separate global team directory has additional server pagination and is **not exhaustively mirrored**. Its `regulation` query parameter is not a working filter, so its global counts were not presented as regulation-specific counts.

## Regulations and the important fallback bug

M-A/M-B/M-C are battle rulesets, not usage tiers or ladder ranks. Their official ranked periods are:

- M-A: April 8, 02:00 UTC–June 17, 01:59 UTC. [Official rules](https://news.pokemon-home.com/en/page/751.html)
- M-B: June 17, 02:00 UTC–September 9, 01:59 UTC, including its announced extension. [Official rules](https://news.pokemon-home.com/en/page/776.html)
- M-C: September 9, 02:00 UTC–December 2, 01:59 UTC. [Official rules](https://news.pokemon-home.com/en/page/816.html)

PokéBase silently selects another regulation when the requested dataset has no data for a Pokémon. For example, requesting Victreebel M-C returned an actively selected M-B page. Trusting only the requested URL therefore mislabels older data. The adapter now verifies the active source selection and **withholds fallback aggregates and teams**. The UI explains which dataset is available instead.

Across 350 local forms, fallbacks were withheld for 14 M-C, 32 M-B and 112 M-A entries. Each dataset also has ten explicit empty states and one unpublished exact-form page. Those are not zero usage estimates.

Captured team dates are source publication/event labels, not authoritative dataset boundaries. A source preview's regulation is established by its verified dataset selection; the preview does not expose an independent event-regulation field. No date-only inference is used to assign a ruleset. Changing the meta filter does not change the app's M-C mechanics/legality snapshot.

## Statistical meanings

| Display | Meaning and limitations |
|---|---|
| Complete spreads | The source's real six-stat aggregate rows. No investment is synthesized from independent marginal modes. The source does not attach Nature to these aggregate rows. |
| Nature for an exact spread | Computed only from retained individual sets with complete nonzero points and a disclosed Nature. Percentages are conditional on that spread. Counts and underlying set IDs are retained. |
| Overall Nature | Separate source Nature distribution; source labels it tournament plus featured/community usage. It is never multiplied into spread usage. |
| Existing per-stat display | `showcaseStatModeBonusByKey` supplies the modal investment. `showcaseStatPercentByKey` supplies that stat's share of all featured-set allocated points. The percentage is **not** the frequency of the displayed modal investment. |
| Abilities | Source tournament ability-selection percentages, including pre-Mega selections. Canonical abilities are unchanged. Missing shares are not normalized away. |
| Items | Source held-item shares, separate from the static item catalog. Missing item rows remain missing. |
| Moves | Source move-share percentages, which approximately sum to 100%. They must **not** be described as percentage of Pokémon using a move. The public payload exposes no denominator count or backend calculation, so the exact weighting cannot be proven through the permitted interface. The UI labels them “Move share,” without inventing a set-usage conversion. |
| Teammates | Source co-occurring team counts and percentages relative to teams containing the selected Pokémon. The full denominator count is not explicitly supplied. Base/Mega overlaps are grouped and never added. |

The retained 40,248 set records contain 7,941 nonzero complete point disclosures and 32,307 undisclosed/default-zero spreads. Raw zero values are retained for auditing but excluded from observed-spread inference. Known Nature+spread associations are available on 146 M-C, 238 M-B and 182 M-A Pokémon/form pages. This limited captured-set sample is explicitly separate from the source's larger aggregate sample.

For Mega Gengar M-C, seven aggregate spreads are available, but only six captured sets provide both usable points and Nature. Consequently an aggregate 14.3% spread and a captured-sample 16.7% spread can both be correct: they have different denominators.

## Forms, imports and limits

Source slugs are normalized through an explicit alias table, checked against recorded source base stats and the local form data. Examples include Basculegion → male, Aegislash → shield and Palafin → zero. Original source slugs/names remain available in raw records. No base usage is substituted for an absent Mega dataset.

Canonical Mega mechanics remain separate from pre-Mega ability selections. For an explicitly Mega-form set with a valid base ability, imports retain `sourceAbility` and use the Mega's actual battle ability, with an explanation. A source base Pokémon holding a Mega Stone stays a base Pokémon with that stone; automatic evolution timing is not simulated. Select the Mega form to calculate the evolved state.

**6,222 teams map completely to the current local catalog.** The remaining **486** stay visible with specific errors and disabled import buttons. Examples include King's Shield missing from the local move dictionary, source ordinary Floette conflicting with the local Eternal-form roster, and source form/ability contradictions. These are not silently remapped or discarded, and tournament usage is not treated as proof of move legality. Recognized but unconfirmed learnset moves are retained with warnings and remain excluded from legality-based analysis.

Undisclosed points import as unset in Team Builder. Damage uses explicit zero-point/neutral assumptions for undisclosed fields and displays import notes. Exact disclosed points/Nature/items/abilities/moves are retained. Not all source publications contain full disclosures; source update times, full sample sizes, exact backend move denominators and per-preview independent event regulation remain unavailable.

## Why previous values differed

1. The older static snapshot was generated on September 13; meta values change independently of game mechanics. Its source pages were not tied to a verified regulation.
2. The old parser captured rendered first-page rows, capped categories, and had previously allowed adjacent categories into item usage. The current adapter reads complete embedded arrays and bounds the ability HTML section.
3. Source pages can contain both Season Stats and Tournament Stats. They must not be merged. The adapter isolates the tournament section.
4. Source regulation fallback can put M-B values behind an M-C request. This is now detected rather than silently published.
5. Default form slugs differ between databases. Explicit aliases and exact-form validation replace guessed inheritance.
6. Different aggregate categories and captured sets do not necessarily have the same denominator. Independent modes are no longer assembled into a supposed real defensive set.
7. Base/Mega teammate entries overlap. Their counts are not summed. Teams repeated across Pokémon pages are counted once.
8. Source percentages are preserved with their published rounding. For example, seven 14.3% rows total 100.1%; that is not repaired into a fabricated distribution.

Current verified Mega Gengar M-C: Cursed Body 96.5%, Shadow Tag 3.5%; Modest 57.4%, Timid 39.9%; Protect 24.9%. The supplied screenshot's different Nature/teammate values were not hardcoded. The latest allowed live fetch reproduced the current snapshot, not the older screenshot. Historical unscoped usage remains archived in `champions-meta-legacy.json`, but is not shown as current meta.

## Updating and auditing

From the repository root:

```powershell
# All locally represented forms and three regulations. Fresh cache entries are reused.
python -X utf8 apps/pokemon-champions/tools/generate_meta.py

# Force a complete live refresh; rate-limited and potentially lengthy.
python -X utf8 apps/pokemon-champions/tools/generate_meta.py --refresh

# Focused optional live audit; does not replace published snapshots.
python -X utf8 apps/pokemon-champions/tools/generate_meta.py --refresh --audit --regulations M-C --slugs gengar-mega
```

The URL-keyed cache expires after 24 hours, using recorded fetch time rather than filesystem modification time. `--refresh` bypasses it. HTTP revalidation is requested, and HTTP cache metadata is retained locally. A failed refresh does not silently substitute expired data or zero-fill missing fields. The audit distinguishes normal usage changes, parser/schema problems and unexplained changes. A generation ID prevents mixed team/meta deployments from being imported; both files should be deployed together. Partial updates preserve other entry timestamps and recompute conditional associations against the final retained raw sets.

## Verification

Final run: **39 Python tests, all seven Node suites, and all three browser suites passed**. `git diff --check` passed. Node prints an existing, non-fatal module-type warning; no root package change was made.

- Python offline suite: source fixtures, full six-stat validation, multiple Natures for one spread, no inference from unrelated Nature percentages, rows beyond page one, separate regulations/season data, silent regulation fallbacks, form aliases, malformed/incomplete source, UTF-8 streaming records, cyclic references, missing ability data, fresh/expired/forced cache behavior, unavailable source and provenance.
- Seven Node suites: static snapshot integrity, move ranking, roster ranking, item mechanics/presets, team analysis, stable save identity and meta/import models.
- Browser meta suite: migration, name population, overwrite same ID, Save As, collision handling, reload, actual spread/Nature application, six-slot unsaved imports, v5 sharing, opponent isolation, corrupt-storage protection, unavailable meta and desktop/mobile layout.
- Existing browser smoke and item suites: all tabs, Pyroar learnsets, clean Sirfetch'd item usage, team save/share compatibility, damage editors and practical Moves item presets.
- Steelix Heavy Slam vs Mega Floette still checks at 60–72%; Metal Coat at 72–87% under the regression scenario. Sirfetch'd Leaf Blade checks at 48–58%, or 73–86% with Leek.
- Parsed static mechanics are identical to the pre-change snapshot after removing only usage fields. No browser page errors in the completed runs.

Screenshots from isolated desktop/mobile browser sessions are in `.tmp-smoke/`: `meta-1440.png`, `meta-390.png`, `team-save-desktop.png`, `team-import-desktop.png`, `team-import-mobile.png` and `opponent-import-desktop.png`. They were visually inspected; third-party sprites/fonts are deliberately blocked in these offline tests, so screenshots show missing remote images. The screenshot directory is ignored by git.

Run the tests with:

```powershell
python -X utf8 -m unittest discover -s apps/pokemon-champions/tools -p 'test_*.py'
Get-ChildItem apps/pokemon-champions/tools/*.test.mjs | ForEach-Object { node $_.FullName }
python -X utf8 apps/pokemon-champions/tools/browser-meta.py
python -X utf8 apps/pokemon-champions/tools/browser-smoke.py --screenshots
python -X utf8 apps/pokemon-champions/tools/browser-items.py
```

Browser tests require Python Playwright and Chrome. All normal tests are offline; only the explicit generator/audit commands contact PokéBase. The historical cache audit is skipped when its optional local cache is absent.
