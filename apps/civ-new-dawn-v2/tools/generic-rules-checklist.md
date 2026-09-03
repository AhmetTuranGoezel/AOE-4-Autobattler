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
| Setup: order and dealing | partial | Capital tiles are dealt before fortress placement and both faces are shown; the full ordering (leader → colour → focus row → capital tile → core → sides → fortress → capital) is not asserted end to end. |
| Map generation / core tiles | partial | `two-client-test.js` and `browser-smoke.js` drive a real setup to `playing`. Core composition rules (4 tiles, 2 at 2–3 players) are not asserted. |
| Fortress placement | partial | Driven in both browser tests; legality rules (inactive hex bordering ≥2 active) are not asserted directly. |
| Capital tile placement | partial | Driven in both browser tests. Side/rotation choice at placement is supported but not asserted. |
| Map population from tiles | partial | Barbarian letters verified against every printed cell; terrain audited by `audit-tile-terrain.py`; resources/city-states/natural wonders not asserted per cell. |
| Exploration | partial | Apadana's expedition is proven. Ordinary exploration, tile-stack exhaustion and abandon paths are not. |
| Movement | unproven | No behavioural test drives caravan/army movement limits, terrain gates or forced stops. |
| Combat | partial | Dice, bidding and capture are driven in older tests; combat modifiers are mostly asserted through getters, which is not proof. |
| Barbarian movement / spawning | partial | Identity across moves, printed-letter spawn and return-to-home are proven. Petra's redirect clause is **known-broken** (unimplemented). |
| City construction | unproven | No test drives a city build through every legal source and asserts the result. |
| Mature cities | partial | `isCityDeveloped` verified directly; the **Commercial Hub positive case is missing** and is on the fix list. Maturity goes stale after barbarian raids — **known-broken**. |
| Trade tokens | partial | Industry production arithmetic (slot + trade) is proven; the 3-token cap and per-card trade tracks are not systematically asserted. |
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
2. **Mature-city staleness** — barbarians destroying a ring token do not recompute
   maturity, so `countDeveloped`, agendas and district payouts over-report.
   Same gap on `remove_control` (Forbidden City) and `eiffel_give`.
3. **Commercial Hub / mature capital** — positive regression missing.
