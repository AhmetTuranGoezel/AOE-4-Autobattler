# Counters lab — coverage ledger

**Framework:** every number assumes turn 1, both Pokémon at full HP, 1v1 (doubles spread ×0.75 as a toggle).
KO verdicts (2HKO…) come from a **sequential simulation**: one-time shields (Multiscale/Shadow Shield, resist berry,
Focus Sash/Sturdy/Disguise) apply once, Leftovers heals 6.25%/turn, Sitrus +25% once at ≤50%. **Burn** halves the burned
side's physical damage (Guts/Facade exempt); **paralysis** halves Speed (Quick Feet exempt) — both directions.
Within that frame each ability/move is **modeled** (applied to the numbers), **flagged** (condition we can't verify — shown
as an explicit flag on the row), or **no-op** (genuinely cannot change a first-hit number — reason given).
Champions data: 199 abilities, 523 moves. Regenerate with `python tools/generate_coverage.py`.

## Abilities

| Ability | Status | Mechanic / reason |
|---|---|---|
| Adaptability | ✅ modeled | STAB ×2 |
| Aerilate | ✅ modeled | Normal moves → Flying ×1.2 |
| Aftermath | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon is knocked out with a contact move, that move's user loses 1/4 of its maximum HP, rounded down |
| Analytic | ✅ modeled | ×1.3 when moving last |
| Anger Point | ➖ no-op | +6 Atk on being crit — crits aren't simulated |
| Anticipation | ➖ no-op | controls switching/trapping — no damage effect |
| Armor Tail | ✅ modeled | priority moves fail against it |
| Aroma Veil | ➖ no-op | healing over turns — no effect on single-hit damage |
| Battle Armor | ➖ no-op | crit-related — crits aren't simulated in the ranking (use the manual Calculator's crit toggle) |
| Berserk | ➖ no-op | +1 SpA below half HP — full-HP assumption |
| Big Pecks | ➖ no-op | no effect on first-hit damage/speed/accuracy: Prevents other Pokemon from lowering this Pokemon's Defense stat stage. |
| Blaze | ✅ modeled | Fire ×1.5 (pinch, flagged) |
| Bulletproof | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon is immune to bullet moves. |
| Cheek Pouch | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon eats a held Berry, it restores 1/3 of its maximum HP, rounded down, in addition to the Berry's |
| Chlorophyll | ✅ modeled | Spe ×2 in sun |
| Clear Body | ➖ no-op | no effect on first-hit damage/speed/accuracy: Prevents other Pokemon from lowering this Pokemon's stat stages. |
| Cloud Nine | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Competitive | ➖ no-op | +2 SpA when stats are lowered — reactive; use the boost stepper |
| Contrary | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon has a stat stage raised it is lowered instead, and vice versa. |
| Corrosion | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Cud Chew | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon eats a Berry, it will eat that Berry again at the end of the next turn. |
| Curious Medicine | ➖ no-op | controls switching/trapping — no damage effect |
| Cursed Body | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon is hit by an attack, there is a 30% chance that move gets disabled unless one of the attacker' |
| Cute Charm | ➖ no-op | no effect on first-hit damage/speed/accuracy: There is a 30% chance a Pokemon making contact with this Pokemon will become infatuated if it is of the opposi |
| Damp | ➖ no-op | no effect on first-hit damage/speed/accuracy: While this Pokemon is active, Explosion, Mind Blown, Misty Explosion, Self-Destruct, and the Aftermath Ability |
| Defiant | ➖ no-op | +2 Atk when stats are lowered — reactive; set it via the Atk boost stepper if assumed |
| Disguise | ✅ modeled | blocks the first single hit |
| Dragonize | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's Normal-type moves become Dragon-type moves and have their power multiplied by 1.2. This effect  |
| Drizzle | ➖ no-op | sets rain on entry — use the Weather control |
| Drought | ➖ no-op | sets sun on entry — use the Weather control; the sun itself is then fully modeled |
| Dry Skin | ✅ modeled | immune to Water · Fire taken ×1.25 |
| Early Bird | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Earth Eater | ✅ modeled | immune to Ground |
| Eelevate | ➖ no-op | no effect on first-hit damage/speed/accuracy: The Pokémon floats off the ground, making it immune to Ground-type moves, as well as the Spikes, Toxic Spikes, |
| Effect Spore | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Electric Surge | ➖ no-op | sets Electric Terrain on entry — use the Terrain control |
| Electromorphosis | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon gains the Charge effect when it takes a hit from an attack. |
| Fairy Aura | ➖ no-op | no effect on first-hit damage/speed/accuracy: While this Pokemon is active, the power of Fairy-type moves used by active Pokemon is multiplied by 1.33. |
| Filter | ✅ modeled | super-effective taken ×0.75 |
| Fire Mane | ➖ no-op | no effect on first-hit damage/speed/accuracy: Boosts the power of the Pokémon's Fire-type moves by 50%. |
| Flame Body | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Flash Fire | ✅ modeled | immune to Fire |
| Flower Veil | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Fluffy | ✅ modeled | contact taken ×0.5 · Fire taken ×2 |
| Forecast | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Forewarn | ➖ no-op | no effect on first-hit damage/speed/accuracy: When it enters a battle, the Pokémon can tell one of the moves an opposing Pokémon has. |
| Friend Guard | ➖ no-op | doubles ally-support — this tool computes 1v1 matchups |
| Frisk | ➖ no-op | controls switching/trapping — no damage effect |
| Fur Coat | ✅ modeled | physical taken ×0.5 |
| Gale Wings | ✅ modeled | Flying moves +1 priority (feeds the ⚡ badge) |
| Gluttony | ➖ no-op | doubles ally-support — this tool computes 1v1 matchups |
| Good as Gold | ➖ no-op | no effect on first-hit damage/speed/accuracy: A body of pure, solid gold gives the Pokémon full immunity to other Pokémon's status moves. |
| Gooey | ➖ no-op | no effect on first-hit damage/speed/accuracy: Pokemon making contact with this Pokemon have their Speed lowered by 1 stage. |
| Guts | ✅ modeled | ×1.5 physical when statused |
| Harvest | ➖ no-op | item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked |
| Healer | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Heatproof | ✅ modeled | Fire taken ×0.5 |
| Heavy Metal | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's weight is doubled. This effect is calculated after the effect of Autotomize, and before the eff |
| Hospitality | ➖ no-op | controls switching/trapping — no damage effect |
| Huge Power | ✅ modeled | Atk ×2 (physical) |
| Hunger Switch | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon is a Morpeko, it changes formes between its Full Belly Mode and Hangry Mode at the end of each |
| Hustle | ✅ modeled | ×1.5 physical, accuracy ×0.8 |
| Hydration | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Hyper Cutter | ➖ no-op | no effect on first-hit damage/speed/accuracy: Prevents other Pokemon from lowering this Pokemon's Attack stat stage. |
| Ice Body | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Illuminate | ➖ no-op | accuracy/evasion niche — not part of the modeled accuracy layer (No Guard / Hustle / Sand Veil / Snow Cloak are) |
| Illusion | ➖ no-op | controls switching/trapping — no damage effect |
| Immunity | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Imposter | ➖ no-op | transforms into the opponent — a mirror match; every number would just equal the target's |
| Infiltrator | ✅ modeled | ignores Reflect / Light Screen |
| Innards Out | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon is knocked out with a move, that move's user loses HP equal to the amount of damage inflicted  |
| Inner Focus | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon cannot be made to flinch. This Pokemon is immune to the effect of the Intimidate Ability. |
| Insomnia | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Intimidate | ✅ modeled | physical taken ×⅔ (post-drop) |
| Iron Fist | ✅ modeled | Punch moves ×1.2 |
| Justified | ➖ no-op | +1 Atk when hit by Dark — reactive on-hit; use the boost stepper |
| Keen Eye | ➖ no-op | accuracy/evasion niche — not part of the modeled accuracy layer (No Guard / Hustle / Sand Veil / Snow Cloak are) |
| Klutz | ✅ modeled | holder's item has no effect (damage items and Choice Scarf) |
| Leaf Guard | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Levitate | ✅ modeled | immune to Ground |
| Light Metal | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's weight is halved, rounded down to a tenth of a kilogram. This effect is calculated after the ef |
| Lightning Rod | ✅ modeled | immune to Electric |
| Limber | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Liquid Voice | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's sound-based moves become Water-type moves. This effect comes after other effects that change a  |
| Long Reach | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's attacks do not make contact with the target. |
| Magic Bounce | ➖ no-op | reflects status moves — no effect on damaging moves |
| Magic Guard | ➖ no-op | prevents indirect damage (Life Orb recoil, weather chip) — the hit itself is unchanged |
| Magician | ➖ no-op | item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked |
| Magma Armor | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Marvel Scale | ✅ modeled | physical taken ×⅔ when statused |
| Mega Launcher | ✅ modeled | Pulse moves ×1.5 |
| Mega Sol | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's moves are used as if the effects of Sunny Day were active. |
| Merciless | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Mimicry | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Minus | ➖ no-op | doubles ally-support — this tool computes 1v1 matchups |
| Mirror Armor | ➖ no-op | no effect on first-hit damage/speed/accuracy: When one of this Pokemon's stat stages would be lowered by another Pokemon, that Pokemon's stat stage is lower |
| Mold Breaker | ✅ modeled | ignores the target's ability |
| Moody | ➖ no-op | random stat changes each turn — not deterministic, can't be honestly averaged |
| Motor Drive | ✅ modeled | immune to Electric |
| Moxie | ➖ no-op | triggers after a KO — a first-hit calculator never reaches that state |
| Multiscale | ✅ modeled | ×0.5 at full HP (assumed full) |
| Mummy | ➖ no-op | no effect on first-hit damage/speed/accuracy: Pokemon making contact with this Pokemon have their Ability changed to Mummy. Does not affect Pokemon with the |
| Natural Cure | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| No Guard | ✅ modeled | all moves 100% accurate (both sides) |
| Oblivious | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon cannot be infatuated or taunted. Gaining this Ability while infatuated or taunted cures it. This  |
| Opportunist | ➖ no-op | copies the opponent's stat boosts — reactive to boosts we treat as inputs |
| Overcoat | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Overgrow | ✅ modeled | Grass ×1.5 (pinch — assumed active, flagged) |
| Own Tempo | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon cannot be confused. Gaining this Ability while confused cures it. This Pokemon is immune to the e |
| Parental Bond | ✅ modeled | total ×1.25 (2 hits) |
| Pickpocket | ➖ no-op | item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked |
| Pickup | ➖ no-op | item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked |
| Piercing Drill | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's contact moves ignore a target's protection and deal 1/4 the usual damage. |
| Pixilate | ✅ modeled | Normal moves → Fairy ×1.2 |
| Plus | ➖ no-op | doubles ally-support — this tool computes 1v1 matchups |
| Poison Heal | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Poison Point | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Poison Touch | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Prankster | ➖ no-op | priority for status moves only — damaging moves are unaffected |
| Pressure | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon is the target of an opposing Pokemon's move, that move loses one additional PP. Imprison, Snat |
| Protean | ✅ modeled | STAB on every move |
| Pure Power | ✅ modeled | Atk ×2 (physical) |
| Purifying Salt | ✅ modeled | Ghost taken ×0.5 |
| Queenly Majesty | ✅ modeled | priority moves fail against it |
| Quick Draw | ➖ no-op | priority interaction — only Gale Wings and the Dazzling family change the modeled speed layer |
| Quick Feet | ✅ modeled | Spe ×1.5 when statused |
| Rain Dish | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Receiver | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Reckless | ✅ modeled | recoil moves ×1.2 |
| Refrigerate | ✅ modeled | Normal moves → Ice ×1.2 |
| Regenerator | ➖ no-op | controls switching/trapping — no damage effect |
| Ripen | ➖ no-op | healing over turns — no effect on single-hit damage |
| Rivalry | ➖ no-op | ±25% by gender — the dataset has no gender information |
| Rock Head | ➖ no-op | prevents recoil to the user — outgoing damage unchanged |
| Rough Skin | ➖ no-op | no effect on first-hit damage/speed/accuracy: Pokemon making contact with this Pokemon lose 1/8 of their maximum HP, rounded down. |
| Sand Force | ✅ modeled | Ground/Rock/Steel ×1.3 in sand |
| Sand Rush | ✅ modeled | Spe ×2 in sand |
| Sand Spit | ➖ no-op | weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control |
| Sand Stream | ➖ no-op | sets sand on entry — use the Weather control |
| Sand Veil | ✅ modeled | incoming accuracy ×0.8 in sand |
| Sap Sipper | ✅ modeled | immune to Grass |
| Scrappy | ✅ modeled | Normal/Fighting hit Ghost |
| Screen Cleaner | ➖ no-op | controls switching/trapping — no damage effect |
| Shadow Tag | ➖ no-op | controls switching/trapping — no damage effect |
| Sharpness | ✅ modeled | Slicing moves ×1.5 |
| Shed Skin | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Sheer Force | ✅ modeled | ×1.3 when the move has a secondary |
| Shell Armor | ➖ no-op | crit-related — crits aren't simulated in the ranking (use the manual Calculator's crit toggle) |
| Shield Dust | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Skill Link | ✅ modeled | 2–5-hit moves always hit 5× |
| Slush Rush | ✅ modeled | Spe ×2 in snow |
| Sniper | ➖ no-op | boosts critical hits only — crits aren't simulated (ranges would be misleading); use the manual Calculator's crit toggle |
| Snow Cloak | ✅ modeled | incoming accuracy ×0.8 in snow |
| Snow Warning | ➖ no-op | sets snow on entry — use the Weather control |
| Solar Power | ✅ modeled | Special ×1.5 in sun |
| Solid Rock | ✅ modeled | super-effective taken ×0.75 |
| Soundproof | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon is immune to sound-based moves, unless it used the move. |
| Speed Boost | ➖ no-op | +1 Spe per turn — turn-1 speeds shown; model later turns with the Speed boost stepper |
| Spicy Spray | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Stall | ➖ no-op | priority interaction — only Gale Wings and the Dazzling family change the modeled speed layer |
| Stalwart | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's moves cannot be redirected to a different target by any effect. |
| Stamina | ➖ no-op | +1 Def when hit — applies after the first hit; first-hit numbers unchanged |
| Stance Change | ➖ no-op | Aegislash form swap per move — needs per-turn form state; stats shown are the listed form's |
| Static | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Steadfast | ➖ no-op | no effect on first-hit damage/speed/accuracy: If this Pokemon flinches, its Speed is raised by 1 stage. |
| Stench | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's attacks without a chance to make the target flinch gain a 10% chance to make the target flinch. |
| Sticky Hold | ➖ no-op | item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked |
| Strong Jaw | ✅ modeled | Bite moves ×1.5 |
| Sturdy | ✅ modeled | survives a would-be OHKO from full HP |
| Suction Cups | ➖ no-op | controls switching/trapping — no damage effect |
| Super Luck | ➖ no-op | raises crit chance — crits aren't simulated; use the manual Calculator's crit toggle |
| Supersweet Syrup | ➖ no-op | controls switching/trapping — no damage effect |
| Supreme Overlord | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's moves have their power multiplied by 1+(X*0.1), where X is the total number of times any Pokemo |
| Surge Surfer | ✅ modeled | Spe ×2 in Electric Terrain |
| Swarm | ✅ modeled | Bug ×1.5 (pinch, flagged) |
| Sweet Veil | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Swift Swim | ✅ modeled | Spe ×2 in rain (auto-selected when rain is set) |
| Symbiosis | ➖ no-op | item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked |
| Synchronize | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Tangled Feet | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's evasiveness is doubled as long as it is confused. |
| Technician | ✅ modeled | ×1.5 on ≤60 effective BP |
| Telepathy | ➖ no-op | doubles ally-support — this tool computes 1v1 matchups |
| Thick Fat | ✅ modeled | Fire/Ice taken ×0.5 |
| Torrent | ✅ modeled | Water ×1.5 (pinch, flagged) |
| Tough Claws | ✅ modeled | Contact moves ×1.3 |
| Toxic Debris | ➖ no-op | sets Toxic Spikes when hit — hazards aren't simulated |
| Trace | ➖ no-op | copies the opponent's ability — pick the copied ability manually on the attacker |
| Unaware | ✅ modeled | defender: ignores your boosts · attacker: ignores the target's Def/SpD boosts |
| Unburden | ➖ no-op | Spe ×2 after the held item is consumed/lost — needs an item-loss event we don't track |
| Unnerve | ➖ no-op | no effect on first-hit damage/speed/accuracy: While this Pokemon is active, it prevents opposing Pokemon from using their Berries. This Ability activates be |
| Unseen Fist | ➖ no-op | no effect on first-hit damage/speed/accuracy: This Pokemon's contact moves ignore the target's protection, except Max Guard. |
| Vital Spirit | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Volt Absorb | ✅ modeled | immune to Electric |
| Wandering Spirit | ➖ no-op | status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage |
| Water Absorb | ✅ modeled | immune to Water |
| Water Bubble | ✅ modeled | Water moves ×2 dealt · Fire taken ×0.5 |
| Weak Armor | ➖ no-op | -Def/+Spe when hit — applies after the first hit |
| White Smoke | ➖ no-op | no effect on first-hit damage/speed/accuracy: Prevents other Pokemon from lowering this Pokemon's stat stages. |
| Zero to Hero | ➖ no-op | controls switching/trapping — no damage effect |

## Moves with special mechanics

| Move(s) | Status | Handling |
|---|---|---|
| Body Press | ✅ | uses the user's Defense (nature/invest/boost apply to Def) |
| Foul Play | ✅ | uses the TARGET's Attack |
| Psyshock / Psystrike / Secret Sword | ✅ | special move hitting Defense |
| Sacred Sword / Chip Away / Darkest Lariat | ✅ | ignore the target's Def/SpD boost stages |
| Seismic Toss / Night Shade | ✅ | fixed 50 damage at Lv50 |
| Sonic Boom / Dragon Rage | ✅ | fixed 20 / 40 damage |
| Super Fang / Nature's Madness / Ruination | ✅ | 50% of current HP |
| Guardian of Alola | ✅ | 75% of current HP |
| Grass Knot / Low Kick | ✅ | BP from the target's weight |
| Heavy Slam / Heat Crash | ✅ | BP from the user/target weight ratio |
| Gyro Ball / Electro Ball | ✅ | BP from the speed ratio |
| Freeze-Dry | ✅ | hits Water super-effectively |
| Flying Press | ✅ | Fighting + Flying dual effectiveness |
| Thousand Arrows / Smack Down | ✅ | Ground hits Flying at ×1 |
| Collision Course / Electro Drift | ✅ | ×1.33 when super-effective |
| Return / Frustration | ✅ | BP 102 (max happiness) |
| Hidden Power | ✅ | BP 60 (type kept as Normal — pick per set in-game) |
| Multi-hit family (Bullet Seed, Icicle Spear, Rock Blast…) | ✅ | ×3.1 expected hits (×5 with Skill Link) |
| Triple Axel / Triple Kick | ✅ | escalating total BP 120 / 60 |
| OHKO moves (Fissure, Sheer Cold, Horn Drill, Guillotine) | ✅ | included, 100% listed, accuracy-weighted in ranking; blocked by Sturdy |
| Weather Ball | ✅/≈ | ×2 in weather — type change approximated (stays Normal) |
| Terrain Pulse | ✅/≈ | ×2 in terrain — type change approximated |
| Electro Shot | ✅ | +1 SpA from the charge applies to the hit; in RAIN it fires instantly (no charge, not risky) |
| Meteor Beam | ✅ | +1 SpA from the charge applies to the hit; always charges (Power Herb not in Champions) → risky |
| Solar Beam / Solar Blade | ✅ | fire instantly in SUN (not risky); halved in bad weather; else charge turn = risky flag |
| Fly / Dig / Dive / Bounce / Phantom Force / Sky Attack | ⚠ risky | two-turn (semi-invulnerable) — turn cost keeps them deprioritized |
| Facade / Hex / Venoshock / Barb Barrage / Infernal Parade / Dream Eater / Nightmare | ✅ | status-conditional — driven by the Target/Attacker status controls |
| Acrobatics | ✅ | ×2 when the ATTACKER (per-mon item honoured) holds nothing |
| Knock Off | ✅ | ×1.5 only when the target's item is removable — no boost vs a Mega (stone) or an itemless target |
| Poltergeist | ✅ | fails when the target holds no item |
| Steel Roller | ✅ | fails without terrain |
| Bolt Beak / Fishious Rend | ✅ | ×2 when the user moves first (real speed layer) |
| Avalanche / Payback / Revenge | ✅ | ×2 when the user moves second (real speed layer) |
| Stored Power / Power Trip | ✅ | BP scales with the Atk-boost stepper |
| Rising Voltage / Expanding Force / Misty Explosion | ✅ | terrain-boosted |
| Sucker Punch | 🚩 flagged | priority applied; 'fails unless the target attacks' |
| Fake Out / First Impression | 🚩 flagged | turn-1-only noted |
| Assurance / Lash Out / Stomping Tantrum / Belch / Last Resort | 🚩 flagged | needs battle state we don't track — condition shown on the row |
| Explosion / Self-Destruct / Final Gambit / Steel Beam / Mind Blown / High Jump Kick | ⚠ risky | self-cost — deprioritized in best-move choice, flagged |
| Counter / Mirror Coat / Metal Burst | ➖ skipped | damage depends entirely on the hit received — no number would be honest |
| Flail / Reversal | ≈ approx | BP rises as HP falls — full-HP assumption (weakest), flagged |
| Eruption / Water Spout / Dragon Energy | ≈ approx | BP scales with the user's HP — full-HP (max) assumed, ~approx flag |
| Beat Up / Fling / Present / Spit Up / Trump Card / Natural Gift / Wring Out / Crush Grip / Punishment / Grass·Fire·Water Pledge / Endeavor | ≈ approx | party/item/PP/HP-dependent BP — representative value + ~approx flag |

_Every other damaging move is standard (base power × category × type) and computed with the exact Gen-9 formula._

## Items (Champions-only)
- Life Orb ×1.3 · Expert Belt ×1.2 (SE) · type items ×1.2 · Muscle Band / Wise Glasses ×1.1 — damage
- **Choice Scarf** Spe ×1.5 (both sides — feeds the ⚡/🐢 order) · Focus Sash survives a would-be OHKO · resist berry halves one SE hit
- **Leftovers** +6.25%/turn and **Sitrus Berry** +25% once at ≤50% — counted in the KO simulation
- Klutz negates the holder's item. Assault Vest / Eviolite / Choice Band / Specs are **not in Champions** and deliberately absent.

_Source-data corrections (PokeAPI errors) are patched at load in `src/data.js` `MOVE_FIXES` — currently: Matcha Gotcha → all-opponents (spread)._
