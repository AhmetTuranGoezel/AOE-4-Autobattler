# Civ: A New Dawn — overnight progress checkpoint

Working file for a resumed session. Update it when something lands; it is not
a design document and it does not replace the commit messages, which carry the
reasoning.

Everything below refers to `apps/civ-new-dawn-v2`.

## Where things stand

- Branch: `main`, not pushed.
- Head at last update: `ba697e8`.
- Rule harness: **819 passed, 0 failed** (`node tools/rule-test-runner.js`).
- `node tools/check-all.js`: **all checks green**.
- Behavioural proof of printed effects: **16/124**.
  Generic rule systems are tracked separately in
  `tools/generic-rules-checklist.md` and never count toward the 124.

Proof by category (from `tools/coverage-matrix.js`):

| Category | Proven |
|---|---|
| Standard Focus | 2/24 |
| Unique Focus | 0/18 |
| Civilization abilities | 3/18 |
| World Wonders | 3/36 |
| Player Diplomacy | 0/5 |
| City States | 0/12 |
| Governments | 0/6 |
| Districts | 5/5 |

## Done

Each of these is a rule defect found and fixed, with a behavioural regression
that fails without the fix.

- **Districts** — all five printed effects, both options of each where the card
  prints a choice. Encampment targets one named figure rather than a space;
  "within N" includes the origin, so an unreinforced encampment can reinforce
  itself.
- **City maturity** — derived from the current board instead of a cached flag
  that only some actions refreshed.
- **Barbarian defeat** — one `onBarbarianDefeated` event; all four routes
  (combat, card effect, encampment, Currency) pay Sumeria exactly once.
- **Currency** — clearing a barbarian no longer ends the caravan's remaining
  movement (FAQ), and the card's reference text says so.
- **England** — one `onCityBuilt` event, so Industrial Zone / Cartography /
  Amundsen builds trigger it; the offer is optional, as "you may" requires.
- **Inca** — triggers on any placement on a mountain, not only on its own chain.
- **Non-Aggression Pact** — flipping a reinforced token is neither attacking nor
  destroying, so a pact does not forbid it (Mass Media, Nuclear Power).
- **"Up to N"** — Pyramids and Porcelain Tower can stop early.
- **Natural wonder tokens** — a claim takes the token off the map onto the
  owner; conquest transfers it; losing the space does not.
- **Barbarian lifecycle** — a figure belongs to its printed spawn, not to its
  letter (letters repeat across tiles). Static printed data and dynamic figure
  state are separate; defeated figures keep identity and home and retry.

## Remaining, in priority order

1. **Five-player real-browser proof** — in progress. `tools/browser-harness.js`
   (shared CDP plumbing) and `tools/five-client-test.js` are written but NOT yet
   run to completion or committed. Needs: five seats, five distinct colours
   including purple, setup completes, purple takes a real turn by CLICKING a
   focus card, the next client sees it with no reload.
2. **Finite control-token supply** — see BLOCKED below. The rule that a player
   with none left may first remove one of their own friendly tokens from the map
   must be modelled globally, not only for England.
3. **America** — build on the corrected natural-wonder token model; its ability
   parks tokens on focus cards (`st.naturalWonders[name].focusCard` exists for
   this and is currently always null).
4. **Oxford University**
5. **Rome caravan-start UI**
6. **Petra** — barbarian redirect clause still unimplemented; the only entry in
   the checklist's known-broken list.
7. **Standard Focus to an honest 24/24**, then the remaining categories.
8. **Generic rule systems** — `tools/generic-rules-checklist.md` is the honest
   status list; several rows are still `unproven`.

## Blocked

- **Control-token component counts.** Modelling a finite supply needs the exact
  number of control tokens per player in the ENGLISH base game and the number
  Terra Incognita adds. That is a component list, not a rule I can derive from
  the code or from the tile data, and guessing it would put an invented number
  into the rules engine. The *semantics* can be built without it (a supply, a
  "remove one of your own first" path when empty, districts using the district
  piece rather than a control token); only the count is blocked.
- **Duplicate printed barbarian letters.** The tiles print E on four different
  tiles and F and B on two each, so two icons showing one letter can be in play.
  The engine places a figure on every printed icon, which is the existing
  behaviour and is what the identity model now assumes. Whether the physical
  game ships one figure per LETTER (so a second icon would get none) cannot be
  settled without the English component list. Recorded rather than guessed; the
  identity model is correct under either reading.

## Notes for whoever picks this up

- `applyAction` mutates in place. Any test branching from one state needs
  `JSON.parse(JSON.stringify(...))`, and `tryApplyAction` returns its own copy,
  so editing the player object you started with edits the wrong state.
- `rulesState()` deals real tiles at random. A fixture that depends on what was
  dealt is a flake; clear what you do not want and assert over what you placed.
- `activate()` in the harness resets a hex — keep its reset list in step with
  new hex fields or a dealt feature leaks into a fixture.
- Do not add `proves()` for an effect until every printed option of that card is
  driven. An honest low number is the point.
