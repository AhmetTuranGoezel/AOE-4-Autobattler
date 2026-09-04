# Civ: A New Dawn — overnight progress checkpoint

Working file for a resumed session. Update it when something lands; it is not
a design document and it does not replace the commit messages, which carry the
reasoning.

Everything below refers to `apps/civ-new-dawn-v2`.

## Where things stand

- Branch: `main`, not pushed.
- Head at last update: `7011d02`.
- Rule harness: **1715 passed, 0 failed** (`node tools/rule-test-runner.js`).
- `node tools/check-all.js`: **all checks green** (14 gates, including four
  real-browser runs: smoke 37, two clients 35, five clients 39, Oxford 23).
- Behavioural proof of printed effects: **124/124**.
  Generic rule systems are tracked separately in
  `tools/generic-rules-checklist.md` and never count toward the 124.

Proof by category (from `tools/coverage-matrix.js`):

| Category | Proven |
|---|---|
| Standard Focus | 24/24 |
| Unique Focus | 18/18 |
| Civilization abilities | 18/18 |
| World Wonders | 36/36 |
| Player Diplomacy | 5/5 |
| City States | 12/12 |
| Governments | 6/6 |
| Districts | 5/5 |

Every printed effect now has a behavioural proof. Oxford University, the last
one, is implemented rather than stubbed: it required the focus row to be able
to hold two cards of one type.

## Generic rule systems

`tools/generic-rules-checklist.md` is the honest status list. **Every row is
`proven`.** Nothing is on the known-broken list, and nothing is partial.

The two systems every card runs on — the focus row and the tech dial — were
added as rows of their own in `028c5b6`; they had been carrying the whole game
without appearing on the list at all.

## Done

Each of these is a rule defect found and fixed, or a system proven, with a
behavioural regression that fails without the fix.

- **Districts** — all five printed effects, both options of each. Encampment
  targets one named figure rather than a space; "within N" includes the origin.
- **City maturity** — derived from the current board, not a cached flag.
- **Barbarian defeat** — one `onBarbarianDefeated`; all four routes pay Sumeria
  exactly once.
- **Currency** — clearing a barbarian no longer ends the caravan's movement
  (FAQ), and the card's reference text says so.
- **England** — one `onCityBuilt`; the offer is optional, as "you may" requires.
- **Inca** — triggers on any placement on a mountain, not only its own chain.
- **Non-Aggression Pact** — flipping a reinforced token is neither attacking nor
  destroying.
- **"Up to N"** — Pyramids and Porcelain Tower can stop early.
- **Natural wonder tokens** — a claim takes the token off the map; conquest
  transfers it; losing the space does not.
- **Barbarian lifecycle** — a figure belongs to its printed spawn, not its
  letter. Defeated figures keep identity and home, and retry.
- **Five-player browser proof** — `tools/five-client-test.js`, in check-all.
- **Control-token supply** — finite, one placement function, empty supply costs
  a token off the map rather than blocking. NUMBER blocked.
- **America**, **Rome caravan launch**, **Petra**, **Standard focus 24/24**,
  **Governments 6/6**, **Player diplomacy 5/5**, **City states 12/12**.
- **Unique focus 18/18** — the last six were Humanism, State Workforce, Radio,
  Mysticism, Military Engineering and Astronomy.
- **World wonders 35/36** — the combat wonders read off real attacks; the
  start-of-turn wonders reached by ending a turn; the reach-changing wonders
  measured against boards that differ by the wonder ALONE.
- **Generic systems** — movement, city construction, victory/agendas, the event
  dial, core composition, fortress legality, the trade-token cap, resources,
  exploration, map population, the wonder deck, the focus row, the tech dial.

## Remaining, in priority order

No unblocked rule work is outstanding on the lists that produced this file.

## Blocked

One narrow question remains, and it changes no behaviour.

- **Seven barbarian helm letters.** The tile faces were audited at 8x in three
  renderings. All eighteen printed spawn cells are right, and A, B, C, D, G and
  K read unambiguously. 07B was transcribed "B" and is H; that is corrected.
  The E/F cluster — 08A, 08B, 12A, 12B, 15B, TI04A, TI04B — cannot be separated
  with confidence at this scan resolution, where the helm silhouette merges
  with the glyph. A higher-resolution photograph of those seven faces, or the
  physical tiles, would settle it. Nothing in the rules engine reads a letter:
  a figure is identified by its printed SPAWN (tile, side, cell), because
  letters genuinely repeat across tiles that can be on the board together.

Previously blocked and now resolved from the English sources:

- **Oxford University** — implemented; see below.
- **Control-token count** — 34 per player under Terra (124 base at 31 each,
  plus Terra's 12, plus purple's 34 in the fifth-player set).
- **Barbarian figure count** — 11 (9 base + 2 Terra), now a finite pool.

## The focus row can hold two cards of one type

This is the one architectural change worth knowing about before touching
anything.

The row was six type NAMES, and a type was a card's identity everywhere:
`cardTiers[type]`, `trade[type]`, `focusRow.indexOf(type)`. Base p8 makes that
safe, because a gained card replaces the card of the same type.

Oxford lifts exactly that for non-science cards, so a row can hold Military II
and Military I at once and no Culture card at all.

The model: a row entry is a bare type string for the card that OWNS its type
key, and any further card of that type is an instance `{type, tier, trade}`
carrying its own level and its own trade tokens. Only Oxford creates the second
form, so every game without it is unchanged.

What is card-aware rather than type-aware: `resolveCard` (the card played is
the card that resets), `getSlotValue` and the science prelude (a card resolves
at its own level from its own place), `spendFocusTradePayment` (tokens come off
the card that paid), `cardNameAt` (a card is named from its own level, so a
unique card cannot be claimed by its twin), and `getActiveUniqueCard` (a type
Oxford pushed out of the row is not in play). In the UI, `rowCardsOf` is the one
place that turns a row into cards, and a clicked card sends its index.

## Notes for whoever picks this up

- `applyAction` mutates in place. Any test branching from one state needs
  `JSON.parse(JSON.stringify(...))`, and `tryApplyAction` returns its own copy,
  so editing the player object you started with edits the wrong state. This has
  now caused four separate test bugs; check it first when a branch behaves as
  though an earlier branch had already run.
- `rulesState()` deals real tiles and real victory cards at random. A fixture
  that depends on what was dealt is a flake: clear what you do not want, and
  NAME what you need (`st.agendaCards`, `deck.revealed`).
- `rulesState()` also skips setup, so there is no capital tile on the board.
  Exploration needs one (`isExploreEligible` requires a tile holding a
  capital), and `PLACE_FORTRESS` needs a state still in setup.
- `st.tileStack` is materialised by `migrateState`, so it is empty until an
  action has run. Take stack readings after a no-op action.
- `activate()` in the harness resets a hex — keep its reset list in step with
  new hex fields or a dealt feature leaks into a fixture.
- When comparing "with wonder" against "without", make the boards differ by the
  WONDER only. A helper that also creates the city the wonder sits in changes
  the build range, the friendly-space set and city maturity, and the comparison
  then measures the city.
- `deck.revealed` is the deck's own top card, not a card beside it. Counting
  both makes every wonder deck look like eight cards.
- Do not add `proves()` for an effect until every printed option of that card is
  driven. An honest low number is the point.
- `END_TURN` is refused until a card has been resolved (base p6: no passing).
- The event dial asks EVERY player for a government; one unanswered decision
  blocks the board for everyone, so a fixture must answer the rivals' too.
- browser-smoke occasionally fails at "Create Room" with the status stuck on
  "Creating room..." — that is the public PeerJS broker throttling, not a
  regression. It passes on a re-run; the test already retries twice.
