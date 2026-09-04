# Civ: A New Dawn — overnight progress checkpoint

Working file for a resumed session. Update it when something lands; it is not
a design document and it does not replace the commit messages, which carry the
reasoning.

Everything below refers to `apps/civ-new-dawn-v2`.

## Where things stand

- Branch: `main`, not pushed.
- Head at last update: `028c5b6`.
- Rule harness: **1664 passed, 0 failed** (`node tools/rule-test-runner.js`).
- `node tools/check-all.js`: **all checks green** (13 gates, including three
  real-browser runs: smoke 37, two clients 35, five clients 39).
- Behavioural proof of printed effects: **123/124**.
  Generic rule systems are tracked separately in
  `tools/generic-rules-checklist.md` and never count toward the 124.

Proof by category (from `tools/coverage-matrix.js`):

| Category | Proven |
|---|---|
| Standard Focus | 24/24 |
| Unique Focus | 18/18 |
| Civilization abilities | 18/18 |
| World Wonders | 35/36 |
| Player Diplomacy | 5/5 |
| City States | 12/12 |
| Governments | 6/6 |
| Districts | 5/5 |

The single unproven effect is **Oxford University**, which is BLOCKED — see
below. It is not a missing test; it is a rule that cannot be settled from the
sources available.

## Generic rule systems

`tools/generic-rules-checklist.md` is the honest status list. **Every row is
now `proven` except one**: Component supply, which is `partial` because its
NUMBER is blocked. Nothing is on the known-broken list.

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

There is no unblocked rule work left on the list that produced this file.
What remains is either blocked (below) or needs new input:

1. **Oxford University** — blocked, see below.
2. **Component counts** — two blocked items, see below.
3. Anything new the user raises.

## Blocked

These are recorded rather than guessed. Each needs a source this session does
not have; none is a missing test.

- **Oxford University.** "When you replace (tech upgrade) a focus card other
  than a science focus card, you do not have to replace it with a card of the
  same type." The effect is defined entirely against a restriction on which
  card a tech upgrade may replace — and this engine's upgrade step already lets
  the player pick any eligible type, so there is no restriction for Oxford to
  lift and the wonder would be a no-op. Settling it needs the English
  rulebook's exact wording for the tech-upgrade step. Not implemented; not
  faked. This is the 124th effect.

- **Control-token component count.** Modelling a finite supply needs the exact
  number of control tokens per player in the ENGLISH base game and the number
  Terra Incognita adds. That is a component list, not a rule derivable from the
  code or the tile data. The *semantics* are built and proven; only the count
  is blocked, and `CFG.controlTokens` is Infinity until it is verified.

- **Duplicate printed barbarian letters.** The tiles print E on four different
  tiles and F and B on two each. The engine places a figure on every printed
  icon, which the identity model assumes. Whether the physical game ships one
  figure per LETTER cannot be settled without the English component list. The
  identity model is correct under either reading.

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
