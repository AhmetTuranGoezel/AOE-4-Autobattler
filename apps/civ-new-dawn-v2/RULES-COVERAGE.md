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

### Playing a card (base p6)

- The played card leaves the row, every card on a **lower** slot shifts one right,
  and the played card returns to slot 1. Cards on higher slots do not move.
- **Economy and military cards move every figure you have**, not one. The card is
  only spent once each has moved or you stop early — `st.activeCard` holds it open
  and `END_FOCUS_CARD` closes it.
- No more than one caravan may reach the same city or city-state in a turn (p9).

### Caravans (base p9)

- A caravan that reaches a city-state or rival city goes **back onto the economy
  card**, and sets out again from a friendly city — the capital normally, any of
  your cities as Rome.
- 2 trade tokens on arrival: on the matching card for a city-state, spread over
  **any cards you choose** for a rival city.
- A diplomacy card on arrival: the city-state's own card if a copy is left (two
  copies exist per city-state), or a **choice** among that rival's cards, with the
  option to swap the one you already hold.

### The technology dial (base p8, Terra p15)

- The science card advances the arrow by its slot number.
- Reaching a level lets you take a card of **exactly that level**, not one step up.
- Crossing two level spaces in one turn grants **both**.
- Past space 24 the arrow goes **directly to 15**, so the tail can be run again for
  further level IV cards.

### The event wheel (base p12)

- Turned one segment at the end of each round, before the start player's turn.
- **Blank segments do nothing** — not every round fires an event.
- *Trade*: every player takes one token per **developed city** and places them
  where they like.
- *Barbarians appear*: every **defeated** barbarian returns to its printed space,
  if that space is empty or holds only a caravan (which is destroyed).
- *Districts* and *government change* resolve clockwise from the start player.

### Barbarians (base p12)

- **One die roll steers every barbarian**; each moves a single space that way.
- Water cannot be stopped on — the barbarian keeps going until it reaches land.
- Walking off the map edge sends it the **opposite** direction instead.
- On arrival: a caravan is destroyed and returns to its economy card; an
  unreinforced marker or non-capital city is destroyed; a **reinforced marker is
  flipped down and the barbarian stays put**; a capital costs its owner 2 trade
  tokens and turns the raid back.

### Districts (Terra p20)

- Placed only by growth cards; abilities that place control markers cannot place
  districts.
- A district may replace one of your own control markers and always lands
  **unreinforced**, even over a reinforced one.
- A district defeated in an attack becomes the attacker's own **non-district**
  marker, unreinforced.
- Campus counts friendly mountain / natural-wonder spaces **in and adjacent to**
  the district; the only cap is the three-per-card trade limit.

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

- **The defender's trade spend is automatic.** The rules let a defender choose
  how many tokens to hand over; the engine spends the minimum that wins and no
  more. Rational, but not a decision you get to make.
- **13 of the 34 world wonders are table reminders.** Their printed text is shown
  on the card, but the effect is not automated. The other 21 resolve themselves.
- **The advanced pre-game tile draft** (each player dealt 2 tiles and placing in
  turn order, Terra p14) is not implemented. The app builds the four-tile core to
  the rules and then draws from a shared exploration stack during play.
- **The event wheel's segment order** is our own arrangement. The five symbols on
  it are the printed ones and blanks are real, but the rulebook does not spell out
  the sequence around the dial.
- **The tech dial's level positions** (8, 16, 24) are evenly spread rather than
  read off the printed dial. Level IV sits on 24, which the "past 24 go back to
  15" rule requires.

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
