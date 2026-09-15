# Held-item support

Item catalogue checked September 13, 2026 for M-C: **166 entries** (85 held
items/berries, 81 Mega Stones). Availability comes from the
[Champions item list](https://www.serebii.net/pokemonchampions/items.shtml);
mechanics were checked against [Showdown's Champions overrides](https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/items.ts)
and its [inherited item implementations](https://github.com/smogon/pokemon-showdown/blob/master/data/items.ts).
This is a sourced availability snapshot, not an official tournament-legality validator.

## Where items are used

| Surface | Implemented | Boundary |
| --- | --- | --- |
| Damage: Counters | Both targets, global attacker preset, individual attacker overrides, named saved presets | Each combatant uses its own item; unknown old selections safely fall back to no item |
| Damage: One vs all | Attacker editor, individual defender editors, visible defender set summaries; usage presets now include the most-used recognized item | Usage is still a historical sample, not necessarily current-format optimal builds |
| Damage: return hits / survival | Offensive items on the returning attacker; candidate item, ability, seeds, Ground immunity, resist berry and Focus Sash | One incoming attack at full HP, not a turn-by-turn battle |
| Damage: Team check | Saved team item/ability used for the matrix, move alternatives, setup suggestions and incoming-hit details | Stats/investment still come from Damage presets; team builder does not save full stat builds |
| Moves: Browse | Owner's gear editor; item-aware expected power/effective damage, accuracy, critical expectation and speed-based moves | No actual defender; Expert Belt assumes SE only in Best case |
| Moves: Best users | Global “Everyone runs” build and individual Pokémon editors use the same catalogue/model | Defensive/support items are selectable, with explicit notes, but do not inflate offensive rankings |
| Team | Item picker per member, automatic working-team persistence, named save/load, v4 share/import, duplicate-item warning | Old v1/v2/v3 links remain readable; warnings are not full legality validation |
| Team defense / recommendations | Intact Air Balloon and Iron Ball affect selected-team Ground matchups and thus defensive gaps | Recommended new teammates are not assigned or optimized around hypothetical items |
| Team Speed | Item-aware Lv50, zero-investment speed ordering (Scarf / Iron Ball) | No weather, terrain, stat investment or arbitrary item-consumption history |
| Existing cross-device sync | Items travel inside the existing team/lab storage records | No new server or sync protocol; live external sync not exercised by local tests |

## What changes the numbers

- Separate **Muscle Band** (physical) and **Wise Glasses** (special), all 18
  named type boosters (final move type only), Life Orb and SE-only Expert Belt.
  Light Ball is restricted to Pikachu and does not boost Body Press/Foul Play.
- **Normal Gem** boosts the first Normal attack; later attacks in the Damage KO
  estimate lose the boost. Moves ranks its first use, not sustained damage.
- **Leek** is restricted to Farfetch'd/Sirfetch'd. It adds two critical stages;
  Scope Lens adds one. Guaranteed criticals change Damage's range and bypass
  positive defensive / negative offensive stages and screens. Other ranges stay
  noncritical, with chance used in the ranking expectation. Crit-proof abilities
  are respected; random-critical stage/screen bypass in expectations is approximate.
- **Wide Lens** uses ×1.1 accuracy, not +10 percentage points. Zoom Lens uses the
  Damage view's speed-order estimate; Moves omits it. Bright Powder affects
  incoming accuracy, not connected-hit damage. Always-hit moves remain always-hit.
- **All four terrain seeds** activate on matching selected terrain, raise the
  matching defense, and are consumed before the attack. Simple/Contrary, Body
  Press and Unburden are accounted for. No item alone no longer activates Unburden.
  These are fresh field scenarios: changing terrain is not a history of past turns.
- **Choice Scarf / Iron Ball** affect Speed and Gyro Ball/Electro Ball. Iron Ball
  grounds its holder; Ground hits Flying holders neutrally in this model.
  **Air Balloon** prevents Ground damage while intact, except Thousand Arrows,
  and removes grounded terrain bonuses. Mold Breaker does not bypass the balloon.
- **18 named resist berries**, with the correct attack type, SE requirement
  (except Chilan), first-strike consumption, Unnerve and Ripen.
- **Focus Sash**, Leftovers, Sitrus and Oran Berry feed the repeated-attack KO
  estimate. Knock Off uses the actual target item and removes its ongoing recovery
  and subsequent removal boost. Acrobatics/Poltergeist check actual held-item
  presence, including seeds already consumed; Klutz does not make a held item absent.
- **Mega forms reserve the item slot for their stone**. Their form supplies the
  Mega stats/ability; no Life Orb or other second item can stack with it. The
  “into range” suggestions no longer suggest Life Orb for a Mega.

The M-C additions are all present: Air Balloon, Binding Band, Eject Button,
Electric/Grassy/Misty/Psychic Seed, Leek, Normal Gem, Red Card, Rocky Helmet,
Terrain Extender and Absolite Z/Baxcalibrite/Garchompite Z/Golisopite/Lucarionite Z/
Salamencite. The six stones use the matching selected Mega forms; selecting a
stone on a base form does **not** automatically evolve it.

## Informational only / intentionally left out

Every selector shows its selected item's support note. Being selectable is not
a claim that every battle event is implemented.

- **Rocky Helmet and Life Orb recoil**: separately reported on Damage move rows;
  not subtracted from survival verdicts or used to predict double knockouts.
- **Red Card / Eject Button / Shed Shell**: switches, replacement choices and
  trapping escape are not simulated. Repeated-hit KOs assume the same Pokémon stays in.
- **Binding Band**: binding residual damage/duration not added to direct damage.
- **Terrain Extender, weather rocks, Light Clay**: duration is described; set the
  actual field/screen in Damage. The engine does not run an eight-turn timeline.
- **White/Mental Herb, status-curing berries, Leppa Berry**: curing restrictions,
  restoring lowered stats/status/PP and subsequent consumption are not simulated.
  Enter the desired post-cure status/stages yourself.
- **Big Root / Shell Bell**, random Focus Band / Quick Claw / King's Rock events,
  and Metronome's repeated-use escalation remain unmodeled, with explicit notes.
- **Fling / Natural Gift**, item transfer/theft/recycling, Magic Room, arbitrary
  item-consumption history, mixed-move balloon popping and later-turn Poltergeist
  failure after a berry is eaten are not a complete item lifecycle simulation.
- Raw Pokémon stats, effective-stat rankings, comparison/detail stat tables,
  the HP/Def/SpD point optimizer and the standalone **Coverage** typing explorer
  remain item-free. These describe base stats/typings, not a configured combatant.
  Pokémon-detail usage percentages remain source data, not recommended item builds.

The existing damage engine remains an approximation at some modifier-rounding,
multi-hit/berry-healing and turn-sequence boundaries. It is not a replacement for
a fully stateful battle simulator. Choice items compare alternative initial moves;
they do not imply the holder can switch moves without switching out.

## Refresh and regression checks

Run `python apps/pokemon-champions/tools/generate_items.py --refresh` after updating
the single regulation configuration, alongside `generate_data.py --refresh`.
New catalogue items get a visible unmodeled note until mechanics are added to
`src/item-model.js`. Review removals/additions rather than assuming catalogue
membership proves an effect is implemented.

`tools/item-model.test.mjs` covers catalogue completeness and shared mechanics;
`tools/test_generate_items.py` covers bounded parsing and excludes inventory tickets.
`tools/browser-items.py` exercises real Damage, Moves and Team interfaces, saved
items, share round trips and mobile layout. The existing browser smoke test also
guards Sirfetch'd's corrected usage popup.

Regression reference: neutral-nature Lv50 Steelix, zero attack investment/boost,
no item, Heavy Slam versus zero-investment Mega Floette gives **60–72%** in the UI;
Metal Coat raises that to **72–87%**. Different defender spreads/abilities/fields
can legitimately change those ranges.
