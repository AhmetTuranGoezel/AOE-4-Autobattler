# Generic rule systems — tracked separately from the 124 effects

`tools/coverage-matrix.js` counts **card and ability effects only**: 24 standard
focus, 18 unique focus, 18 civilization abilities, 36 world wonders, 5 player
diplomacy, 12 city-states, 6 governments, 5 districts = **124**.

124/124 would mean every printed card effect has a behavioural proof. It would
**not** mean the game is correct, because the systems those cards act on are not
in that denominator. This file is that second list. It is a checklist, not a
gate — the honest status of each system, updated when something is actually
demonstrated.

Status values:
- **proven** — a behavioural test drives it and asserts the resulting state
- **partial** — some paths proven, named gaps remain
- **unproven** — no behavioural test, or only helper/getter assertions
- **known-broken** — a defect is known and open

| System | Status | Evidence / gap |
|---|---|---|
| Setup: order and dealing | proven | Asserted end to end. Engine: setup opens on fortress; every player already holds exactly one capital tile (and it is a capital tile, and no two are the same), a colour and a six-card focus row; the core is on the board; undrawn tiles stay in the stack; the dealt tile has no side or anchor committed; after the fortresses the capital tile is laid on EITHER face, the chosen face is recorded, and the capital lands on the star printed on that face. Browser: the fortress panel shows civilization, leader ability, unique card, all six focus cards, the dealt tile's identity and both of its faces, the board stays visible, and the undrawn stack does not leak into the panel. |
| Map generation / core tiles | proven | The browser tests drive a real setup to `playing`, and the composition rule is asserted directly: two core tiles at 2 and 3 players and four at 4 and 5, with the matching 20 or 40 active spaces on the board, no tile laid twice, and no capital tile used as a core tile. |
| Fortress placement | proven | The legality rule is asserted directly: every legal space is inactive and borders at least two active spaces, one bordering a single active space is refused, and a space beside a city-state is refused. Placing one through PLACE_FORTRESS puts it on the board and closes its own space and all six neighbours to a second. |
| Capital tile placement | proven | The face is chosen at placement, not before: the same dealt tile is laid A-up and B-up from the same position, the chosen side is recorded, all ten spaces reach the board, and the capital appears on the star printed on the chosen face. |
| Map population from tiles | partial | Barbarian letters verified against every printed cell; terrain audited by `audit-tile-terrain.py`; resources/city-states/natural wonders not asserted per cell. |
| Exploration | partial | Apadana's expedition is proven. Ordinary exploration, tile-stack exhaustion and abandon paths are not. |
| Movement | proven | The four rules are driven separately and then through dispatched actions: the card's distance (a move one space beyond it is refused, the exact distance accepted); the slot's terrain limit, with the same mountain opening when the card resolves further right; water against the printed water tier; and every piece that forces a stop - barbarian, city-state, rival army, rival city, uncontrolled fort, rival token - each checked on a single-file corridor so the space is reachable and the space beyond it is not, while your own token does not stop you. Ending on a defended space is refused as a move and accepted as an attack. Caravans are driven the same way, including trade tokens buying exactly the extra distance they pay for. |
| Combat | proven | Dice, bidding and capture are driven in the older tests, and the modifiers are now read off REAL attacks rather than getters: eight wonders each measured against the identical board without them, each also checked against the half of its own wording that limits it (attack-only, defend-only, per-water-space, per-caravan, strictly-ahead), plus a resource burned mid-fight for exactly +2. |
| Barbarian movement / spawning | proven | A figure belongs to its printed spawn, not its letter, so two icons showing one letter both work. Driven: printed tile/side/cell agreement for every placed cell; identity and home surviving a march; defeat by combat, Currency and an encampment each keeping both; return to the figure's OWN space and never to where it died; caravan and army each failing to block a spawn and each being defeated by it; a real blocker leaving the figure off-map with no failure flag and the next event retrying; and the march-into-army case with its protected control token. Petra's redirect is implemented and driven, including reinforced-vs-unreinforced and a rival's city. |
| City construction | proven | One legality rule, driven against each thing that blocks it: adjacency to any city, a city-state and its neighbours, a resource token, a natural wonder space while its token is there, a barbarian, a fort, a rival control token, a rival army - with your own token, your own army and anybody's caravan not blocking. Then dispatched: the industry card refuses an illegal space, builds on a legal one as a non-capital city, and the new city blocks its own neighbours for the next build. |
| Mature cities | proven | Maturity is derived from the current board, not cached: a ringed capital is mature, losing one ring token ends it immediately and costs the score, a ring space changing hands ends it, an event that destroys a marker recomputes it, and a stale flag arriving from an old save is repaired by the next action. The Commercial Hub's mature-city option is driven end to end. |
| Trade tokens | proven | Industry production arithmetic (slot + trade) is proven, and the base p13 cap is driven per card: three tokens go on, a fourth does not, the other five cards are untouched by the full one, and each type keeps its own track. |
| Component supply | partial | Control tokens are a finite supply spent through ONE placement function, so all seven placement paths count against it. Driven: spending down to empty; an empty supply making a placement cost a token taken back off the map rather than making it illegal (base rule); a district using the district piece and returning the control token it replaced; destroyed tokens returning; and the supply being per player, so taking a rival's space spends yours and returns theirs. **The NUMBER is BLOCKED** - how many control tokens an English base set gives a player, and how many Terra adds, is a component count that cannot be derived from rules text or tile data. `CFG.controlTokens` is Infinity until it is verified, which is the long-standing behaviour. |
| Resources | proven | The whole life of a token is driven: a control token placed on a resource space collects it and clears the space, the token is then spent building a world wonder and really leaves the player's pile, and a resource the wonder does not print is refused. |
| Natural wonders | proven | The token leaves the map on a claim, survives the owner losing the space, transfers on conquest and never has two owners; its printed resource identity survives the transfer; and it is spent on a world wonder, exhausting that token for the turn without consuming it, refreshing next turn, and refused as fuel for Jebel Barkal, which takes ordinary resources only. |
| World Wonder deck construction | partial | 36-card pool and the 2/2/3 per-type playable deck are asserted; the removal step is asserted by count only. |
| World Wonder payment | proven | Production = slot + trade + resources, affordability boundary, and the final payment removing the trade are all asserted. |
| City states | proven | All twelve printed city-state cards are driven, and trading and conquest are both exercised - a caravan trade run, Orszaghaz's conquest taken and declined. |
| Diplomacy ownership | proven | Return-on-attack timing and seat ownership are driven, and all five card effects are proven, each against the giver and against a third player. Potala Palace's hand rule is driven through a real caravan run: without it a second card from the same rival is a swap, with it the hand grows. |
| Event wheel | proven | The dial itself is driven, not just `resolveEvent`. It starts on its first space and carries the printed sequence; one seat ending a turn does not move it, a full round moves it exactly one space and the round counter with it; it walks its spaces in printed order and wraps; landing on the march space really marches the barbarians and records the die that steered them; and where a space carries two icons the wonder icon is last, as Terra p14 requires. |
| Victory / agendas | proven | Driven through the CHECK_AGENDAS action rather than the scorer. Four districts do not claim `industrious` and the fifth does; five ringed cities claim `populous` and losing one ring token unclaims it; a claim already made survives the board ceasing to meet it; and the count is per victory CARD, so both halves of one card count once and four cards count four. The victory cards are named by the fixture, because they are dealt at random. |
| Undo | proven | Undo mid-sequence restores board, trade, focus row and clears `cardResolution`; it is reachable from inside a half-resolved card. |
| Multiplayer authorization | proven | `authorization-test.js` covers host/turn/choice actions; wrong-seat and third-seat refusals are asserted. |
| Pending-choice ownership | proven | Wrong seat and uninvolved third seat are refused; state is unchanged on refusal. |
| Reconnect / sync | proven | Two real browsers pass turns both ways with no reload; a failed backup does not stop live sync. |

## Known-broken, open

Nothing is currently on this list. Two items are BLOCKED on component counts
rather than broken — the control-token supply number and whether the physical
game ships one barbarian figure per letter or per printed icon — and both are
described in their rows above and in `OVERNIGHT_PROGRESS.md`.
