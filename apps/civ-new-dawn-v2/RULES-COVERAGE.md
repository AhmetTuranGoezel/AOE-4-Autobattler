# Rules coverage

What the engine actually enforces, checked card by card against the **English**
rulebooks for *Sid Meier's Civilization: A New Dawn* (base, 18pp) and
*Terra Incognita* (expansion, 16pp). Terra overrides the base game wherever they
disagree.

The English books are the source of truth. This started from the German edition,
whose wording is wrong in at least one place that matters: the city-building rule
reads there as though a caravan or control token were **required** on the space,
when the English says the opposite — no component may be there **except** those.
Page numbers below are English ones.

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

### Combat (base p11, Terra p10, quick reference p16)

- Attacker = d6 + military card's **slot number** + card and leader bonuses
- Defender = d6 + type bonus:
  - city-state → flat **8**
  - barbarian → terrain difficulty only
  - control marker → terrain + **1** per adjacent friendly reinforced marker
    + **1** if itself reinforced + card/leader bonuses
  - city → the same, with **terrain difficulty doubled**
- The dice are thrown when a player throws them, not when the attack is declared,
  and every point on both sides is itemised on the way in.
- Both dice are rolled first, and **then** the bidding starts (Terra p10): the
  attacker spends every token they mean to spend before the defender may spend
  any. Each token is **+1 or a reroll of that side's die**, and you decide after
  seeing the result — so a side with tokens in hand always gets the choice.
- A side with no owner (barbarian, city-state, uncontrolled fort) or an empty
  military card has no decision and is skipped.
- Highest total wins; **a tie goes to the defender**
- An army standing on an open space is **not** a legal target

### Units

- Army and caravan counts are **printed on the military and economy cards**.
  There is no recruit action anywhere in either rulebook — `syncUnitCounts()`
  keeps the figures matching the card tier, up or down.
- New figures enter at the capital.

### Cities

- A city goes on a **legal space** (base p9, defined again on Terra p14): non-water,
  within the industry card's range, not adjacent to a city, city-state or fort, and
  holding **no component except** a caravan, a friendly army or a friendly control
  token. Ordinary empty ground is the normal place to build; a resource token, a
  natural wonder, a barbarian, a rival marker or a rival army all block it.
- Building on your own control token removes it; building on a caravan leaves the
  caravan where it is.
- Building a wonder requires a city you own that has no wonder yet.

### Map building (base p14)

- The core is **always four tiles: two natural wonder + two city-state**,
  regardless of player count.
- All four go down on the same side, chosen by one die roll (1–3 = A).
- A **capital tile** must touch four spaces **on core tiles and/or forts** (Terra
  p5, step h). Capital tiles may touch each other; those spaces do not count
  toward the four. Since the tile is not symmetric, turning it is often what
  makes a spot legal.
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

### The technology dial (base p8 and p16)

- The science card advances the arrow by its slot number.
- Reaching a level lets you take a card of **exactly that level**, not one step up.
- Crossing two level spaces in one turn grants **both**.
- Past space 24 the arrow goes **directly to 15**, so the tail can be run again for
  further level IV cards.

### The event dial (base p5 and p12, Terra p6 and p14)

Terra **replaces** the base dial, and the replacement is a different shape: six
spaces, none blank, and two of them carry two icons each. Read off the printed
face, clockwise from the starting space:

| space | icons |
|---|---|
| 1 | barbarian spawning + wonder — **the pointer starts here** |
| 2 | barbarian movement |
| 3 | district |
| 4 | government + wonder |
| 5 | barbarian movement |
| 6 | district |

- Set up pointing at the **helmet with the star** (base p5, Terra p6), and that
  space is *not* resolved at setup — which is why Terra p14 says the wonder icon
  fires "except during setup".
- Turned one space at the end of each round, after the victory check.
- The expansion dial has **no trade icon at all**: mature cities earn trade
  through the commercial hub district instead.
- The wonder icon resolves **last** in a space it shares.
- *Barbarians appear*: every **defeated** barbarian returns to its printed space,
  if that space is empty or holds only a caravan or army (which is defeated).
- *Districts* and *government* resolve clockwise from the start player.

### The wonder icon (Terra p14)

- A trade token goes on **every faceup wonder**. While a wonder carries one it
  **costs 1 less**, and the token goes back to the supply when it is built.
- A wonder that would take a **second** token is removed from the game instead and
  the next card of its deck is turned up. So this is a countdown on a wonder
  nobody wants, not a standing discount — nothing is made cheaper the moment it
  appears.

### Barbarians (base p12)

- **One die roll steers every barbarian**; each moves a single space that way.
- Water cannot be stopped on — the barbarian keeps going until it reaches land.
- Walking off the map edge sends it the **opposite** direction instead.
- On arrival: a caravan is destroyed and returns to its economy card; an
  unreinforced marker or non-capital city is destroyed; a **reinforced marker is
  flipped down and the barbarian stays put**; a capital costs its owner 2 trade
  tokens and turns the raid back.
- An **army** in the way is defeated and shields its space (Terra p11): the
  barbarian falls back to the land it came from, and the city or marker underneath
  the army is neither destroyed nor flipped.
- No two barbarians share a space. The book gets there by letting them stack and
  then dispersing one (base p16); here they simply never stack.

### Exploration (Terra p12)

- Only a figure on the map edge **and on a tile that has a capital city** may
  explore; it spends one space of movement to do so.
- The tile comes off the **bottom** of the stack. One that will not fit anywhere
  goes back on **top** and the expedition ends — the movement is spent either way.
- **Once per move.** The engine marks the figure, so cancelling out of the action
  cannot buy a second tile.
- After exploring it may keep moving with whatever movement is left, including
  onto the ground it just uncovered.

### Growth (Terra p8)

- The slot's number is the terrain limit for a district **on its own**; trade
  tokens on a growth card do not buy rougher ground.
- Reinforcing is capped at the slot's number, **plus one per trade token spent**.
- Those tokens reinforce "whether or not the card's effect was used to reinforce
  control tokens" — so a district still leaves them to spend.

### Districts (Terra p20)

- Placed only by growth cards; abilities that place control markers cannot place
  districts.
- A district may replace one of your own control markers and always lands
  **unreinforced**, even over a reinforced one.
- A district defeated in an attack becomes the attacker's own **non-district**
  marker, unreinforced.
- Encampment resolves **either or both** halves: defeat a barbarian or rival army
  within two, and/or reinforce a friendly token within two. A barbarian defeated
  this way pays its trade token like any other (Terra p9, "as normal").
- Campus counts **friendly** mountain / natural-wonder spaces in and adjacent to
  the district. "Friendly" is the base game's term (p7): a space holding your own
  city or control token. A mountain nobody owns is worth nothing however close it
  sits — so a campus that pays out lights the spaces that paid, and one that pays
  nothing lights what it was looking at and says why.
- Campus counts friendly mountain / natural-wonder spaces **in and adjacent to**
  the district; the only cap is the three-per-card trade limit.

### Forms of government (Terra p22)

- You start **without** a government.
- Only when the event dial reaches the government symbol may you change it.
- You place the marker on one of your focus cards sitting in one of the **two "1"
  places**, and the marker is of that card's type — so each government belongs to
  one card type: Republic/Culture, Monarchy/Growth, Democracy/Science,
  Oligarchy/Economy, Autocracy/Military, Communism/Industry.
- **One marker at a time**; choosing again moves it.
- A card carrying a marker is resolved **as if it sat N places further right**,
  capped at place 5. Counting places is not the same as adding to the number: a
  card on the first "1" moved two places right lands on place 2, not place 3.

### Map setup (Terra setup step 3)

- Each player is dealt a random capital tile and a fortress marker.
- The core is **four tiles, or two at 2–3 players**, drawn off the bottom of the
  shuffled stack — no forced composition — all laid the same side up by one roll.
- A fortress must touch at least 2 core spaces, and may not touch another
  fortress or a city-state space.
- A capital tile must touch at least 4 spaces of core tiles and/or fortresses.

### Victory (base p12, Terra p8)

- **Every victory card is divided into two agendas, and completing either one
  claims the card.** Five cards are dealt — both fort cards plus three at random
  — and you win by claiming **four** of the five.
- A claim sticks "even if the player ceases to satisfy the agenda later"; the
  fort cards are the exception and must be held.
- Checked at the end of each round, **before** the dial turns. Ties go to the
  player who claimed more cards, then most wonders, then most friendly spaces.
- The *pairing* of agendas onto cards is mine: the printed cards pair specific
  agendas and neither rulebook nor the mod records which.

### Victory, old notes (base p12, Terra p14)

- Five victory cards on the table; claim an agenda on **four** of them.
- Checked at the end of each round, **before** the event wheel resolves.
- A claimed marker stays put — except fortress agendas, which must be held.

### World wonders now resolved by the engine

Added in this pass, all of them from the English card text:

- **Jebel Barkal** — resource tokens can be spent in a fight, +2 apiece. They
  appear as their own row of buttons on the combat stage next to the trade-token
  bid, and the bidding no longer skips a side whose only ammunition is resources.
- **Cristo Redentor** — on building it, take a rival non-capital city within 3
  spaces with no army standing in it. Any wonder in that city changes hands too.
- **Eiffel Tower** — at the start of your turn, name two control tokens belonging
  to one rival; that rival chooses which of the two to hand over, and it arrives
  unreinforced.
- **Apadana** — on building it, explore from any edge space on any tile. That is
  looser than a normal expedition, which has to start on the tile your capital is
  on, so it runs on a one-shot licence the engine issues and spends.
- **Great Zimbabwe** — trade tokens can be banked on the wonder instead of the
  row, up to 4, and moved out onto the row at the start of your turn. It appears
  as an extra destination wherever a trade token is placed.
- **Great Library** — a caravan reaching a rival city can copy a card of the same
  type and tech level from their row. Only cards ahead of your own are offered.
- **Orszaghaz** — after trading at a city-state, take it.
- **University of Sankore** — having replaced a card that turn, swap any two
  non-science cards at the end of it.
- **Potala Palace** — its owner may hold all four of a rival's diplomacy cards
  instead of one, and takes three of their choice on building it.
- **Venetian Arsenal** — a card resolved from the fifth slot may be resolved a
  second time. Resolving already resets the card to the front of the row, so the
  replay is a slot-1 card with no extra arithmetic; a licence on the player keeps
  the second go to that one card rather than opening the turn back up.
- **Estadio Do Maracana** — the economy card can be resolved and reset without
  spending your card for the turn, once per turn.
- **Amundsen-Scott RS** — founds its own city on any legal edge space rather than
  going into one you hold, moves itself into it, then places up to 2 control
  tokens beside it.

### Civilizations

- All 18 Terra Incognita leaders, with ability, starting focus order and unique
  focus card, transcribed from the leader sheets. 17 of 18 abilities are
  engine-enforced.
- **Unique focus card acquisition (Terra p8).** A tech level I unique replaces the
  level I card of the same type in the starting row, so its owner is running it
  from the first turn. A tech level II or higher unique is *not* handed over: it
  turns up as an extra option, marked in gold, on any prompt that would give its
  owner a focus card of that level — a technology level, the Pyramids, the
  Porcelain Tower. Take it and it replaces the printed card; take the printed
  card instead and the unique is gone for good, because the card type has moved
  past the level it is printed at. The unique's effect runs only while the card
  is actually in the row, so upgrading past it puts the standard card back.

---

## 2. Implemented, but approximated

- **1 of the 34 world wonders is a table reminder.** Its printed text is shown on
  the card, but the effect is not automated. The other 33 resolve themselves.
  The one is **Oxford University**: "when you replace a focus card other than a
  science card, you do not have to replace it with a card of the same type." The
  row here is six card *types* with a tier each, so there is no way to hold two
  culture cards and no military one. Automating it means rebuilding the focus row
  as a list of card instances, which touches almost everything that reads a row.
- **The advanced pre-game tile draft** (each player dealt 2 tiles and placing in
  turn order, Terra p14) is not implemented. The app builds the four-tile core to
  the rules and then draws from a shared exploration stack during play.
- **How far a government marker shifts a card.** All six are 2 here. The rulebook
  works Monarchy through at 2 and Fantasy Flight's announcement describes
  Oligarchy the same way; with one government per card type the set is
  symmetrical, so 2 for all six is reasoned rather than read off the markers.
- **Which resources each wonder accepts.** The rules say the bottom right of every
  wonder card shows the resources that may contribute, and production gets +2 per
  *suitable* one. That mapping is printed on the card art and appears in neither
  the reference PDF nor the mod save, so any resource counts for any wonder here.
  The Wonders panel says so rather than implying otherwise.
- **The tech dial's level positions** (8, 16, 24) are evenly spread rather than
  read off the printed dial. Level IV sits on 24, which the "past 24 go back to
  15" rule requires.

### Known gaps, read in the English books and not yet closed

- **Agenda wording.** Terra p16 prints exact targets for all twelve agendas. A few
  of the descriptions here are paraphrases carried over from the German, and
  "Explorer", "Civilized" and "Warmonger" are base-game cards Terra replaces.

## 3. Invented — not from the game

Stated plainly, because it would otherwise look authentic:

- **Per-hex tile terrain.** Every tile's 10-cell terrain layout is mine. So are
  the resource positions and the barbarian letters. The Tabletop Simulator mod
  carries zero terrain data (I checked: no occurrence of any terrain word in the
  save), and the tile images are unreachable from this machine.
- ~~**Tile geometry.**~~ Struck out: I wrote here that the printed tiles are 7
  hexes and the app's 10-hex shape was invented. That was wrong. Measuring tile
  area against the fort tokens on Terra p5 — those are single hexes, so they give
  the scale — puts exactly 10 hexes on a tile, in columns of 4/4/2, which is the
  shape the app already used. The geometry is real; only the terrain inside it is
  mine.
- **What *is* real** on the tiles: the front/back pairings. Tile 1 is Cliffs of
  Dover / Torres del Paine, tile 13 is Mt Kilimanjaro / Pantanal, tile 20 is
  Akkad / Auckland, and so on — those come from the mod's own tile descriptions.
- **Card art.** The published card scans could not be fetched (every Steam and
  Akamai host is blocked here), so the card faces are drawn in CSS from the
  printed layout rather than shown as images.
