# Rules coverage

What the engine actually enforces, checked card by card against the German
rulebooks for *Sid Meier's Civilization: Ein neues Zeitalter* (base) and
*Terra Incognita* (expansion). Terra overrides the base game wherever they
disagree.

Three sections, and the third one matters as much as the first: **verified**,
**approximated**, and **invented**.

---

## 1. Verified against the rulebook

### Focus cards

| Card | What the rules say | Where |
|---|---|---|
| All 24 | Printed effect text carried on every card and shown on the card face | `rules-data.js` `CARD_DEFS[type][tier].effectText` |
| All 24 | Figure allowance ("2 armies", "3 caravans") is a card component, not prose | `CARD_DEFS[...].figures` |
| Culture | Place N control tokens on empty spaces of this slot's terrain or lower, adjacent to a friendly city | `PLAY_CULTURE`, `validControlHexes` |
| Growth | Place 1 district, **or** reinforce up to the slot number | `PLAY_GROWTH_DISTRICT`, `PLAY_GROWTH_REINFORCE` |
| Science | Advance the tech dial by the slot number; reaching a level lets you swap in a card of that level | `PLAY_SCIENCE` |
| Economy | Move every caravan; reaching a city-state or rival city returns it to the card for 2 trade + 1 diplomacy card | `PLAY_ECONOMY_MOVE` |
| Military | Reinforce, or attack a barbarian / city-state / rival city / rival control token in range | `PLAY_MILITARY_ATTACK` |
| Industry | Build a wonder, or found a city within the card's range | `PLAY_INDUSTRY_WONDER`, `PLAY_INDUSTRY_CITY` |

### Trade tokens — the Handelsmarker table

One token, one printed effect, per card. This is what "+1 district per trade
token" got wrong, and it was wrong in both the engine and the UI.

| Card | A token buys | Enforced in |
|---|---|---|
| Culture | 1 additional control token — **not** better terrain | `getCultureMarkers`; reach uses the slot alone |
| Growth | 1 additional reinforce — **not** better district terrain | `startReinforce`; district reach uses the slot alone |
| Science | 1 extra space on the tech dial | `PLAY_SCIENCE` |
| Economy | 1 extra space of caravan movement | `getEconomyMove` |
| Military | +1 combat value, spent **after both dice** — never movement | `renderCombatPrep` → `combatTradeSpent` |
| Industry | +1 production when building a wonder | `PLAY_INDUSTRY_WONDER` |

### Combat (base p11, quick reference p16)

- Attacker = d6 + military card's **slot number** + card and leader bonuses
- Defender = d6 + type bonus:
  - city-state → flat **8**
  - barbarian → terrain difficulty only
  - control marker → terrain + **1** per adjacent friendly reinforced marker
    + **1** if itself reinforced + card/leader bonuses
  - city → the same, with **terrain difficulty doubled**
- Then attacker, then defender, may spend military trade tokens at +1 each
- Highest total wins; **a tie goes to the defender**
- An army standing on an open space is **not** a legal target

### Units

- Army and caravan counts are **printed on the military and economy cards**.
  There is no recruit action anywhere in either rulebook — `syncUnitCounts()`
  keeps the figures matching the card tier, up or down.
- New figures enter at the capital.

### Cities

- A city must be founded on a space already holding **your own caravan or
  control token** (base p9), within the industry card's range, not adjacent to
  another city or a city-state.
- Building a wonder requires a city you own that has no wonder yet.

### Map building (base p14)

- The core is **always four tiles: two natural wonder + two city-state**,
  regardless of player count.
- All four go down on the same side, chosen by one die roll (1–3 = A).
- A non-core tile must touch at least 4 existing spaces and reach the core.
- A tile is one physical object: choosing a side consumes the other, so the same
  city-state or natural wonder can never appear twice.

### Victory (base p12, Terra p14)

- Five victory cards on the table; claim an agenda on **four** of them.
- Checked at the end of each round, **before** the event wheel resolves.
- A claimed marker stays put — except fortress agendas, which must be held.

### Civilizations

- All 18 Terra Incognita leaders, with ability, starting focus order and unique
  focus card, transcribed from the leader sheets. 17 of 18 abilities are
  engine-enforced.

---

## 2. Implemented, but approximated

- **The defender's trade spend is automatic.** The rules let a defender choose;
  the engine spends the minimum that wins and no more. Rational, but not a choice
  you get to make.
- **The event wheel** advances on a fixed schedule rather than by focus-card
  placement distance.
- **Barbarian movement** uses the direction die, but not the full letter-marker
  ordering from base p12.
- **13 world wonders** are table reminders: the card text is printed and shown,
  but the effect is not automated. 21 resolve themselves.
- **Diplomacy card acquisition** is modelled per source, but the two-copies-per
  -city-state stacking from setup step 5 is simplified to one pool.
- **The advanced pre-game map draft** (each player dealt 2 tiles, placed in turn
  order) is not implemented — the app builds the core and then uses a shared
  exploration stack instead.

---

## 3. Invented — not from the game

Stated plainly, because it would otherwise look authentic:

- **Per-hex tile terrain.** Every tile's 10-cell terrain layout is mine. So are
  the resource positions and the barbarian letters. The Tabletop Simulator mod
  carries zero terrain data (I checked: no occurrence of any terrain word in the
  save), and the tile images are unreachable from this machine.
- **Tile geometry.** The printed tiles are 7 hexes; this app uses a 10-hex shape.
- **What *is* real** on the tiles: the front/back pairings. Tile 1 is Cliffs of
  Dover / Torres del Paine, tile 13 is Mt Kilimanjaro / Pantanal, tile 20 is
  Akkad / Auckland, and so on — those come from the mod's own tile descriptions.
- **Card art.** The published card scans could not be fetched (every Steam and
  Akamai host is blocked here), so the card faces are drawn in CSS from the
  printed layout rather than shown as images.
