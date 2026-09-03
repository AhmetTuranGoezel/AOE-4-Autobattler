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
| Map generation / core tiles | partial | `two-client-test.js` and `browser-smoke.js` drive a real setup to `playing`. Core composition rules (4 tiles, 2 at 2–3 players) are not asserted. |
| Fortress placement | partial | Driven in both browser tests and in the setup regression, and the panel now carries the information the choice needs. The legality rule itself (inactive hex bordering at least 2 active hexes) is still not asserted directly. |
| Capital tile placement | proven | The face is chosen at placement, not before: the same dealt tile is laid A-up and B-up from the same position, the chosen side is recorded, all ten spaces reach the board, and the capital appears on the star printed on the chosen face. |
| Map population from tiles | partial | Barbarian letters verified against every printed cell; terrain audited by `audit-tile-terrain.py`; resources/city-states/natural wonders not asserted per cell. |
| Exploration | partial | Apadana's expedition is proven. Ordinary exploration, tile-stack exhaustion and abandon paths are not. |
| Movement | unproven | No behavioural test drives caravan/army movement limits, terrain gates or forced stops. |
| Combat | partial | Dice, bidding and capture are driven in older tests; combat modifiers are mostly asserted through getters, which is not proof. |
| Barbarian movement / spawning | partial | Identity across moves, printed-letter spawn and return-to-home are proven. Petra's redirect clause is **known-broken** (unimplemented). |
| City construction | unproven | No test drives a city build through every legal source and asserts the result. |
| Mature cities | proven | Maturity is derived from the current board, not cached: a ringed capital is mature, losing one ring token ends it immediately and costs the score, a ring space changing hands ends it, an event that destroys a marker recomputes it, and a stale flag arriving from an old save is repaired by the next action. The Commercial Hub's mature-city option is driven end to end. |
| Trade tokens | partial | Industry production arithmetic (slot + trade) is proven, and the 3-token cap is asserted where a district would exceed it; per-card trade tracks are not systematically asserted. |
| Component supply | unproven | The engine models no finite supply of control tokens: nothing counts how many a player has left, so a card printing "1 of your **unused** control tokens" (England) or any placement effect can never run out. This is board-wide, not specific to one card, and would have to be introduced once for every placement path at the same time. |
| Resources | partial | Wonder-payment eligibility is enforced and tested; gaining/spending elsewhere is not. |
| Natural wonders | unproven | Token-to-resource mapping is transcribed but no test spends one. |
| World Wonder deck construction | partial | 36-card pool and the 2/2/3 per-type playable deck are asserted; the removal step is asserted by count only. |
| World Wonder payment | proven | Production = slot + trade + resources, affordability boundary, and the final payment removing the trade are all asserted. |
| City states | unproven | No behavioural test drives trading with, or conquering, a city-state. |
| Diplomacy ownership | partial | Return-on-attack timing and seat ownership are driven; the five card effects themselves are unproven. |
| Event wheel | partial | `resolveEvent` is driven for barbarian move/return and the district event; the wheel's own advancement is not asserted. |
| Victory / agendas | unproven | Agenda claim counting is not driven by any behavioural test. |
| Undo | proven | Undo mid-sequence restores board, trade, focus row and clears `cardResolution`; it is reachable from inside a half-resolved card. |
| Multiplayer authorization | proven | `authorization-test.js` covers host/turn/choice actions; wrong-seat and third-seat refusals are asserted. |
| Pending-choice ownership | proven | Wrong seat and uninvolved third seat are refused; state is unchanged on refusal. |
| Reconnect / sync | proven | Two real browsers pass turns both ways with no reload; a failed backup does not stop live sync. |

## Known-broken, open

1. **Petra** — the barbarian-redirect clause is not implemented at all.
