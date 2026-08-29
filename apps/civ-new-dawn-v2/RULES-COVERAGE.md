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
- Terra adds armies and caravans as legal targets. A lone figure defends with
  the terrain difficulty of its space (Terra quick reference p16).

### Units

- Army and caravan counts are **printed on the military and economy cards**.
  There is no recruit action anywhere in either rulebook — `syncUnitCounts()`
  keeps the figures matching the card tier, up or down.
- Figures that are not deployed remain **on their focus cards**. An army or
  caravan on its card launches from the capital or a mature city when its card
  resolves; it is not placed on the capital during setup and therefore adds no
  defence there.

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

### Cancel and safe undo (interface guardrails)

- Cancelling a card before any action is dispatched simply returns it to the
  row. During a multi-figure economy/military card, **Back** discards only the
  current unconfirmed route; earlier confirmed figures stay moved and the card
  stays open. Only **Done with card** resets it.
- A declared attack can be cancelled until the first die is thrown. Nothing has
  moved or reset at that point. Once either die is public, cancellation and turn
  undo are locked.
- **Undo Turn** restores the exact start-of-turn checkpoint while every resolved
  step is reversible. It is locked after a combat die/reroll, after exploration
  is resolved, or after a built wonder reveals the next card. Ending the turn
  commits it and starts a fresh checkpoint for the next player.

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
- The printed level tabs are **II at 3 and 6, III at 10 and 14, IV at 19 and
  24**. `TECH_LEVEL_SPACES` uses those six physical positions.
- Reaching a level lets you take a card of **exactly that level**, not one step up.
- Every tab reached or passed is a separate opportunity; crossing several in
  one advance grants all of them. Later prompts refresh after each card taken.
- Taking the card is optional ("may"); the owning player has a real **Skip**
  control rather than needing the host to dismiss the prompt.
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
- **A fort has no terrain of its own.** Its whole rules footprint is a defence
  of 6. Setup used to stamp `forest` on the space as well, lifting it from
  difficulty 1 to 3 — a number no rule asks for, and one this document never
  disclosed as invented. It was not cosmetic: `getReachable` discards an
  over-limit space *before* adding it to the reachable set, so a caravan on a
  slot-1 or slot-2 Economy card could not enter a fort at all, and an army on a
  slot-1 or slot-2 Military card could not attack one — while forts are legal
  targets and **both fort victory cards must be held to win**. A captured fort
  kept the forest for ever, and a city defends at *doubled* terrain difficulty,
  so every captured fort quietly carried +6 defence instead of +2; the
  Industrial district even collected trade for the forest that was not there.
  Removed. Passing *through* a fort is a separate rule and is still refused, by
  `isForcedStopHex`.

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

### The focus row, read off Terra p13 and base p8

- **A tech level does not make your row stronger.** The app was adding +1 to
  every card's slot value at technology level II and +2 at level IV. That is not
  a rule in either book: base p8 says reaching a tech level lets you *gain a
  card* of that level, and the dial does nothing else. Removed — it had been
  inflating every card in the game by up to two slots.
- **A tech level is an offer.** Base p8: "the player **may** gain a new focus
  card." The prompt can be turned down now.
- **"Resolved in the fifth slot" means the slot it actually resolved at.** Terra
  p13: "For any ability that depends on a focus card being resolved in a specific
  slot, the card is treated as though it is in the farther-right slot." The
  Venetian Arsenal was testing the card's raw place in the row instead — and
  testing the wrong place at that, since the row reads 1, 1, 2, 3, 4, 5 and the
  "5" slot is the sixth position, not the fifth.

### Tile identity

`tile-art.js` bridges this app's tile ids to the numbers on the physical tiles.
Twelve are certain: a tile whose two sides are Cliffs of Dover and Torres del
Paine is printed tile 1, and nothing else is. Two of those twelve have their
sides the other way round from this app's A/B, which the table records so a
picture is never shown on the wrong face. The other nine — five capitals and
four plain tiles — carry nothing printed to tell them apart, so they are
assigned: stable, one-to-one, and arbitrary. Every entry is marked with which
it is, and the tile inspector repeats it on screen rather than implying more
certainty than there is.

**The board wears the printed faces.** Every placed tile is drawn as its own
photograph, fitted to its ten hexes with an affine solve over the ten cell
centres — exact, and a reflection rather than a rotation for a B face, which is
why it is solved rather than assumed. If an image is missing the drawn terrain
shows through instead, unchanged.

This used to claim the picture and the terrain "cannot drift apart", because
both come off the same artwork. That was wrong, and it hid two real bugs. The
*geometry* cannot drift — cell 6 of the photograph is always drawn on the hex
holding cell 6 of the data. What the data says that cell **is** was read by eye,
and an eye reading 420 hexes misses some. When it does, the space shows the
right picture and plays by the wrong rule, which is worse than an obvious
error: printed 9A cell 9 is a bay read as "hill", so control tokens could be
placed on open water, and printed 11A cell 8 is grass read as "hill", so a
growth card resolving from a grass slot refused a space printed for it. Both
were reported from the table, not caught here.

`tools/audit-tile-terrain.py` now measures every cell against its own
photograph. Water is unambiguous in the pixels — the only blue-dominant
surface on these tiles — so a water/land disagreement is a hard error. The land
types are a green-olive-grey continuum that genuinely overlaps, so those are
reported for a person to look at rather than decided by the tool. It currently
flags **23 land cells** worth a second look; those have not been changed,
because a colour average is not better evidence than a careful look at the
crop, and re-transcribing on a heuristic would trade known errors for unknown
ones.

Clicking any space opens that tile: which printed tile it is, both of its faces,
which is up, and every space on it with its terrain and what is standing there.

The art independently confirms the mapping: TI02 resolves to printed tile 19,
and tile 19's two faces are unmistakably Ha Long Bay and Gobustan.

### Combat, read off the printed tables

Terra p16's quick reference and base p11 between them settle the whole attack
sequence. Three things here were wrong, and one was mine:

- **A rival army or caravan is a legal target.** Base p11 says the defender
  "must be a barbarian token, city-state, rival city, or rival control token" —
  no figures. Terra changes that: p16 lists "Army or Caravan: Bonus = Defending
  space's terrain difficulty", and p11's worked example has Victoria attack
  Shaka's *army*. I had a test asserting the opposite; it was reading the base
  book for a Terra game.
- **An attack resolves one piece, not the whole space.** Base p11 step 1: "the
  attacker chooses one rival piece in the space." The app used to capture the
  city, replace the control token and clear every figure on any win. Terra p11's
  example is explicit the other way: beating the army in Shaka's city leaves the
  city where it was, and Victoria's army "cannot occupy the same space as
  Shaka's city, so the army returns to the last space it occupied."
- **Terra changes what a lost army attack means.** The base rule's "nothing
  happens" is superseded for expansion armies: if the defender wins, the
  attacking army is defeated and returns to its military card (Terra p10).

Also added from p16: **+2 to the defence if an army friendly to the defender
(other than the defender itself) is in the space**; and from Terra p11,
**abilities that remove or replace a piece cannot target a space with an army**,
which shields spaces from the Forbidden City, the Eiffel Tower, the Statue of
Liberty and any other removal.

Where a space holds two pieces the attacker is now asked which one, with both
defence values and their provenance side by side — that choice is the player's,
not a priority order the engine picks.

One structural change came with it: **both combat values are computed by the
engine**, not taken from the action's payload. A client used to send the numbers
it had worked out, so the two sides of a networked game were trusting each other
to agree.

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

- **1 of the 36 world wonders is a table reminder.** Its printed text is shown on
  the card, but the effect is not automated. The other 35 resolve themselves.
  The one is **Oxford University**: "when you replace a focus card other than a
  science card, you do not have to replace it with a card of the same type." The
  row here is six card *types* with a tier each, so there is no way to hold two
  culture cards and no military one. Automating it means rebuilding the focus row
  as a list of card instances, which touches almost everything that reads a row.
- **The optional advanced pre-game tile draft** (Terra p14) is now a lobby
  checkbox: each player is dealt 2 tiles and places them in turn order,
  replacing the automatic core reveal. What's approximated is the composition
  beyond "2 tiles, placed in turn order" — this app was not built from a copy
  of Terra p14 itself, only from that one-line description, so questions like
  whether the 2 tiles can include natural-wonder or city-state tiles, and
  whether standard setup's fixed core count (4, or 2 at 2-3 players) still
  bounds the draft in some way, are answered here by falling back to the
  plainest reading rather than a page this app has not seen. Standard setup
  (unaffected when the checkbox is off) and the shared exploration stack are
  fully implemented, as before.
- **How far a government marker shifts a card.** All six are 2 here. Terra p13
  now backs three of them directly: the Monarchy worked example ("two slots to
  the right ... the 5 slot instead of the 3 slot"), the Republic worked example
  ("two slots farther to the right"), and the Autocracy token in the page's own
  artwork, which carries two arrows. The other three are still inferred from the
  set being symmetrical.
- **Which resources each wonder accepts.** The rules say the bottom right of every
  wonder card shows the resources that may contribute, and production gets +2 per
  *suitable* one. That mapping is printed on the card art and appears in neither
  the reference PDF nor the mod save, so any resource counts for any wonder here.
  The Wonders panel says so rather than implying otherwise.
### Known gaps, read in the English books and not yet closed

- **Agenda wording.** Terra p16 prints exact targets for all twelve agendas. A few
  of the descriptions here are paraphrases carried over from the German, and
  "Explorer", "Civilized" and "Warmonger" are base-game cards Terra replaces.

## 3. Invented — not from the game

Stated plainly, because it would otherwise look authentic:

- ~~**Per-hex tile terrain.**~~ Struck out — this was the last big invented
  thing and it is gone. Every tile's ten spaces, both faces, are now transcribed
  from photographs of the printed tiles in `assets/tts-web/map-tiles/`: terrain,
  resource tokens, barbarian spawns, capital spaces, city-states and natural
  wonders. 420 spaces, read off the artwork.

  The transcription checks itself against things the printed set fixes
  independently: 5 capital tiles with a star on space 6 of both faces, 6 natural
  wonder tiles with one wonder per face, 6 city-state tiles with one per face,
  and every city-state name resolving to a card in `CITY_STATES`. Those counts
  come from the mod's own tile metadata, not from my reading, and they agree.

  Those checks are all structural, though — they confirm the right *number* of
  the right *kinds* of thing, and none of them looks at what terrain a given
  space actually is. Two spaces were read wrong and both shipped (see "The
  board wears the printed faces" above). `tools/audit-tile-terrain.py` covers
  the gap those checks left: it is the only thing here that compares a cell's
  claimed terrain against its own pixels.

  Sampling geometry, for anyone checking the work: each extracted face is
  635×990 with a hex circumradius of 127 and columns at x = 127 / 317.5 / 508.
  Side A's cell centres run bottom-to-top per column; side B is the same
  geometry mirrored vertically.


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
