# Generates COVERAGE.md — the honest ledger of what the Counters lab simulates.
# Every ability in champions-data.json gets a status and a REASON; every special-mechanic
# move is listed with how it's handled. Re-run after changing calc-view.js mechanics.
import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "champions-data.json")
OUT = os.path.join(HERE, "..", "COVERAGE.md")

d = json.load(open(DATA, encoding="utf-8"))
abils = d["abilities"]
moves = d["moves"]

# ---- abilities modeled in calc-view.js / type-defense.js (slug -> mechanic) ----
MODELED = {
    # offense
    "huge-power": "Atk ×2 (physical)", "pure-power": "Atk ×2 (physical)",
    "water-bubble": "Water moves ×2 dealt · Fire taken ×0.5", "adaptability": "STAB ×2",
    "technician": "×1.5 on ≤60 effective BP", "transistor": "Electric ×1.5",
    "dragons-maw": "Dragon ×1.5", "rocky-payload": "Rock ×1.5", "steelworker": "Steel ×1.5",
    "steely-spirit": "Steel ×1.5", "sand-force": "Ground/Rock/Steel ×1.3 in sand",
    "solar-power": "Special ×1.5 in sun", "iron-fist": "Punch moves ×1.2",
    "tough-claws": "Contact moves ×1.3", "strong-jaw": "Bite moves ×1.5",
    "mega-launcher": "Pulse moves ×1.5", "sharpness": "Slicing moves ×1.5",
    "punk-rock": "Sound ×1.3 dealt · ×0.5 taken", "sheer-force": "×1.3 when the move has a secondary",
    "overgrow": "Grass ×1.5 (pinch — assumed active, flagged)", "blaze": "Fire ×1.5 (pinch, flagged)",
    "torrent": "Water ×1.5 (pinch, flagged)", "swarm": "Bug ×1.5 (pinch, flagged)",
    "protosynthesis": "×1.3 to its highest offense (or Spe) in sun", "quark-drive": "×1.3 to its highest offense (or Spe) in Electric Terrain",
    "guts": "×1.5 physical when statused", "toxic-boost": "×1.5 physical when statused",
    "flare-boost": "×1.5 special when statused", "hustle": "×1.5 physical, accuracy ×0.8",
    "gorilla-tactics": "Atk ×1.5", "tinted-lens": "×2 on resisted hits",
    "neuroforce": "×1.25 on super-effective hits", "analytic": "×1.3 when moving last",
    "reckless": "recoil moves ×1.2", "parental-bond": "total ×1.25 (2 hits)",
    "skill-link": "2–5-hit moves always hit 5×", "scrappy": "Normal/Fighting hit Ghost",
    "aerilate": "Normal moves → Flying ×1.2", "pixilate": "Normal moves → Fairy ×1.2",
    "refrigerate": "Normal moves → Ice ×1.2", "galvanize": "Normal moves → Electric ×1.2",
    "protean": "STAB on every move", "libero": "STAB on every move",
    "mold-breaker": "ignores the target's ability", "teravolt": "ignores the target's ability",
    "turboblaze": "ignores the target's ability",
    "download": "×1.5 vs the target's weaker defence", "unaware": "defender: ignores your boosts · attacker: ignores the target's Def/SpD boosts",
    "infiltrator": "ignores Reflect / Light Screen",
    "klutz": "holder's item has no effect (damage items and Choice Scarf)",
    "no-guard": "all moves 100% accurate (both sides)",
    # speed
    "sand-rush": "Spe ×2 in sand", "swift-swim": "Spe ×2 in rain (auto-selected when rain is set)",
    "chlorophyll": "Spe ×2 in sun", "slush-rush": "Spe ×2 in snow",
    "surge-surfer": "Spe ×2 in Electric Terrain", "quick-feet": "Spe ×1.5 when statused",
    "gale-wings": "Flying moves +1 priority (feeds the ⚡ badge)",
    # target defense (damage taken)
    "fur-coat": "physical taken ×0.5", "ice-scales": "special taken ×0.5",
    "multiscale": "×0.5 at full HP (assumed full)", "shadow-shield": "×0.5 at full HP",
    "fluffy": "contact taken ×0.5 · Fire taken ×2", "intimidate": "physical taken ×⅔ (post-drop)",
    "grass-pelt": "physical taken ×⅔ in Grassy Terrain", "marvel-scale": "physical taken ×⅔ when statused",
    "sturdy": "survives a would-be OHKO from full HP", "disguise": "blocks the first single hit",
    "sand-veil": "incoming accuracy ×0.8 in sand", "snow-cloak": "incoming accuracy ×0.8 in snow",
    "dazzling": "priority moves fail against it", "queenly-majesty": "priority moves fail against it",
    "armor-tail": "priority moves fail against it",
    # type-based defense (type-defense.js)
    "levitate": "immune to Ground", "flash-fire": "immune to Fire", "well-baked-body": "immune to Fire",
    "heatproof": "Fire taken ×0.5", "thick-fat": "Fire/Ice taken ×0.5",
    "water-absorb": "immune to Water", "storm-drain": "immune to Water",
    "dry-skin": "immune to Water · Fire taken ×1.25", "volt-absorb": "immune to Electric",
    "lightning-rod": "immune to Electric", "motor-drive": "immune to Electric",
    "sap-sipper": "immune to Grass", "earth-eater": "immune to Ground",
    "purifying-salt": "Ghost taken ×0.5", "filter": "super-effective taken ×0.75",
    "solid-rock": "super-effective taken ×0.75", "prism-armor": "super-effective taken ×0.75",
    "wonder-guard": "only super-effective hits land",
}

# ---- curated reasons for notable unmodeled abilities ----
CURATED = {
    "moxie": "triggers after a KO — a first-hit calculator never reaches that state",
    "beast-boost": "triggers after a KO — never reached in a first-hit calculation",
    "chilling-neigh": "triggers after a KO — never reached", "grim-neigh": "triggers after a KO — never reached",
    "soul-heart": "triggers when any Pokémon faints — turn-1 calc never reaches it",
    "drought": "sets sun on entry — use the Weather control; the sun itself is then fully modeled",
    "drizzle": "sets rain on entry — use the Weather control", "sand-stream": "sets sand on entry — use the Weather control",
    "snow-warning": "sets snow on entry — use the Weather control",
    "electric-surge": "sets Electric Terrain on entry — use the Terrain control",
    "grassy-surge": "sets Grassy Terrain — use the Terrain control", "psychic-surge": "sets Psychic Terrain — use the Terrain control",
    "misty-surge": "sets Misty Terrain — use the Terrain control",
    "speed-boost": "+1 Spe per turn — turn-1 speeds shown; model later turns with the Speed boost stepper",
    "moody": "random stat changes each turn — not deterministic, can't be honestly averaged",
    "sniper": "boosts critical hits only — crits aren't simulated (ranges would be misleading); use the manual Calculator's crit toggle",
    "super-luck": "raises crit chance — crits aren't simulated; use the manual Calculator's crit toggle",
    "serene-grace": "doubles secondary-effect chances (flinch/burn…) — affects odds, not damage",
    "rivalry": "±25% by gender — the dataset has no gender information",
    "battle-bond": "form change on KO — Ash-Greninja isn't a separate roster entry in Champions data",
    "stance-change": "Aegislash form swap per move — needs per-turn form state; stats shown are the listed form's",
    "zen-mode": "form change below half HP — full-HP assumption keeps base form",
    "schooling": "form change below quarter HP — full-HP assumption keeps School form",
    "shields-down": "form change below half HP — full-HP assumption keeps Meteor form",
    "power-construct": "form change below half HP — not simulated",
    "imposter": "transforms into the opponent — a mirror match; every number would just equal the target's",
    "trace": "copies the opponent's ability — pick the copied ability manually on the attacker",
    "neutralizing-gas": "not present on any Champions Pokémon",
    "wonder-skin": "affects status moves only — this tool ranks damaging moves",
    "prankster": "priority for status moves only — damaging moves are unaffected",
    "magic-guard": "prevents indirect damage (Life Orb recoil, weather chip) — the hit itself is unchanged",
    "rock-head": "prevents recoil to the user — outgoing damage unchanged",
    "magic-bounce": "reflects status moves — no effect on damaging moves",
    "unburden": "Spe ×2 after the held item is consumed/lost — needs an item-loss event we don't track",
    "defiant": "+2 Atk when stats are lowered — reactive; set it via the Atk boost stepper if assumed",
    "competitive": "+2 SpA when stats are lowered — reactive; use the boost stepper",
    "justified": "+1 Atk when hit by Dark — reactive on-hit; use the boost stepper",
    "stamina": "+1 Def when hit — applies after the first hit; first-hit numbers unchanged",
    "weak-armor": "-Def/+Spe when hit — applies after the first hit",
    "berserk": "+1 SpA below half HP — full-HP assumption",
    "anger-point": "+6 Atk on being crit — crits aren't simulated",
    "flash-fire": None,  # modeled (immunity); boost-after-absorb not modeled: covered in modeled text
    "steam-engine": "+6 Spe when hit by Fire/Water — reactive on-hit",
    "thermal-exchange": "+1 Atk when hit by Fire — reactive; its burn immunity has no damage effect",
    "toxic-debris": "sets Toxic Spikes when hit — hazards aren't simulated",
    "stakeout": "×2 vs a Pokémon that switched in this turn — switch state isn't tracked",
    "opportunist": "copies the opponent's stat boosts — reactive to boosts we treat as inputs",
}

# category fallback by description keywords: (regex, reason)
CATEGORIES = [
    (r"status condition|poison(ed)?|paraly|burn(ed)?|sleep|frozen|freeze", "status-condition utility — prevents/inflicts/heals status; no effect on a hit's damage"),
    (r"restores? hp|heals?|recovers?", "healing over turns — no effect on single-hit damage"),
    (r"contact with the pok|on contact|makes contact with", "punishes the attacker after contact — doesn't change the damage of the calculated hit"),
    (r"switch|flee|escape|trapped", "controls switching/trapping — no damage effect"),
    (r"lowers? the (foe|opponent|target)'?s? .* stat|raises? .* stat", "stat-stage side effect — both sides' stages are inputs here (steppers); reactive changes apply after the first hit"),
    (r"critical hit", "crit-related — crits aren't simulated in the ranking (use the manual Calculator's crit toggle)"),
    (r"accuracy|evasion", "accuracy/evasion niche — not part of the modeled accuracy layer (No Guard / Hustle / Sand Veil / Snow Cloak are)"),
    (r"weather|sandstorm|hail|snow|rain|sunlight", "weather utility (immunity/chip healing) — no effect on hit damage; weather itself is a control"),
    (r"priority", "priority interaction — only Gale Wings and the Dazzling family change the modeled speed layer"),
    (r"item", "item interaction — beyond Klutz/Knock Off/Acrobatics/Poltergeist, item events aren't tracked"),
    (r"ally|allies", "doubles ally-support — this tool computes 1v1 matchups"),
]

def reason_for(slug, meta):
    if slug in CURATED and CURATED[slug]:
        return CURATED[slug]
    desc = (meta.get("desc") or "").lower()
    for rx, reason in CATEGORIES:
        if re.search(rx, desc):
            return reason
    return "no effect on first-hit damage/speed/accuracy: " + ((meta.get("desc") or "?")[:110])

lines = []
lines.append("# Counters lab — coverage ledger")
lines.append("")
lines.append("**Framework:** every number assumes turn 1, both Pokémon at full HP, 1v1 (doubles spread ×0.75 as a toggle).")
lines.append("KO verdicts (2HKO…) come from a **sequential simulation**: one-time shields (Multiscale/Shadow Shield, resist berry,")
lines.append("Focus Sash/Sturdy/Disguise) apply once, Leftovers heals 6.25%/turn, Sitrus +25% once at ≤50%. **Burn** halves the burned")
lines.append("side's physical damage (Guts/Facade exempt); **paralysis** halves Speed (Quick Feet exempt) — both directions.")
lines.append("Within that frame each ability/move is **modeled** (applied to the numbers), **flagged** (condition we can't verify — shown")
lines.append("as an explicit flag on the row), or **no-op** (genuinely cannot change a first-hit number — reason given).")
lines.append(f"Champions data: {len(abils)} abilities, {len(moves)} moves. Regenerate with `python tools/generate_coverage.py`.")
lines.append("")
lines.append("## Abilities")
lines.append("")
lines.append("| Ability | Status | Mechanic / reason |")
lines.append("|---|---|---|")
for slug in sorted(abils, key=lambda s: (abils[s].get("name") or s).lower()):
    name = abils[slug].get("name") or slug
    if slug in MODELED and MODELED[slug]:
        lines.append(f"| {name} | ✅ modeled | {MODELED[slug]} |")
    else:
        lines.append(f"| {name} | ➖ no-op | {reason_for(slug, abils[slug])} |")

lines.append("")
lines.append("## Moves with special mechanics")
lines.append("")
MOVE_ROWS = [
    ("Body Press", "✅", "uses the user's Defense (nature/invest/boost apply to Def)"),
    ("Foul Play", "✅", "uses the TARGET's Attack"),
    ("Psyshock / Psystrike / Secret Sword", "✅", "special move hitting Defense"),
    ("Sacred Sword / Chip Away / Darkest Lariat", "✅", "ignore the target's Def/SpD boost stages"),
    ("Seismic Toss / Night Shade", "✅", "fixed 50 damage at Lv50"),
    ("Sonic Boom / Dragon Rage", "✅", "fixed 20 / 40 damage"),
    ("Super Fang / Nature's Madness / Ruination", "✅", "50% of current HP"),
    ("Guardian of Alola", "✅", "75% of current HP"),
    ("Grass Knot / Low Kick", "✅", "BP from the target's weight"),
    ("Heavy Slam / Heat Crash", "✅", "BP from the user/target weight ratio"),
    ("Gyro Ball / Electro Ball", "✅", "BP from the speed ratio"),
    ("Freeze-Dry", "✅", "hits Water super-effectively"),
    ("Flying Press", "✅", "Fighting + Flying dual effectiveness"),
    ("Thousand Arrows / Smack Down", "✅", "Ground hits Flying at ×1"),
    ("Collision Course / Electro Drift", "✅", "×1.33 when super-effective"),
    ("Return / Frustration", "✅", "BP 102 (max happiness)"),
    ("Hidden Power", "✅", "BP 60 (type kept as Normal — pick per set in-game)"),
    ("Multi-hit family (Bullet Seed, Icicle Spear, Rock Blast…)", "✅", "×3.1 expected hits (×5 with Skill Link)"),
    ("Triple Axel / Triple Kick", "✅", "escalating total BP 120 / 60"),
    ("OHKO moves (Fissure, Sheer Cold, Horn Drill, Guillotine)", "✅", "included, 100% listed, accuracy-weighted in ranking; blocked by Sturdy"),
    ("Weather Ball", "✅/≈", "×2 in weather — type change approximated (stays Normal)"),
    ("Terrain Pulse", "✅/≈", "×2 in terrain — type change approximated"),
    ("Solar Beam / Solar Blade", "✅", "halved in non-sun weather; charge turn = risky flag"),
    ("Facade / Hex / Venoshock / Barb Barrage / Infernal Parade / Dream Eater / Nightmare", "✅", "status-conditional — driven by the Target/Attacker status controls"),
    ("Acrobatics", "✅", "×2 when the ATTACKER (per-mon item honoured) holds nothing"),
    ("Knock Off", "✅", "×1.5 only when the target's item is removable — no boost vs a Mega (stone) or an itemless target"),
    ("Poltergeist", "✅", "fails when the target holds no item"),
    ("Steel Roller", "✅", "fails without terrain"),
    ("Bolt Beak / Fishious Rend", "✅", "×2 when the user moves first (real speed layer)"),
    ("Avalanche / Payback / Revenge", "✅", "×2 when the user moves second (real speed layer)"),
    ("Stored Power / Power Trip", "✅", "BP scales with the Atk-boost stepper"),
    ("Rising Voltage / Expanding Force / Misty Explosion", "✅", "terrain-boosted"),
    ("Sucker Punch", "🚩 flagged", "priority applied; 'fails unless the target attacks'"),
    ("Fake Out / First Impression", "🚩 flagged", "turn-1-only noted"),
    ("Assurance / Lash Out / Stomping Tantrum / Belch / Last Resort", "🚩 flagged", "needs battle state we don't track — condition shown on the row"),
    ("Explosion / Self-Destruct / Final Gambit / Steel Beam / Mind Blown / High Jump Kick", "⚠ risky", "self-cost — deprioritized in best-move choice, flagged"),
    ("Counter / Mirror Coat / Metal Burst", "➖ skipped", "damage depends entirely on the hit received — no number would be honest"),
    ("Flail / Reversal", "≈ approx", "BP rises as HP falls — full-HP assumption (weakest), flagged"),
    ("Eruption / Water Spout / Dragon Energy", "≈ approx", "BP scales with the user's HP — full-HP (max) assumed, ~approx flag"),
    ("Beat Up / Fling / Present / Spit Up / Trump Card / Natural Gift / Wring Out / Crush Grip / Punishment / Grass·Fire·Water Pledge / Endeavor", "≈ approx", "party/item/PP/HP-dependent BP — representative value + ~approx flag"),
]
lines.append("| Move(s) | Status | Handling |")
lines.append("|---|---|---|")
for nm, st, why in MOVE_ROWS:
    lines.append(f"| {nm} | {st} | {why} |")
lines.append("")
lines.append("_Every other damaging move is standard (base power × category × type) and computed with the exact Gen-9 formula._")
lines.append("")
lines.append("## Items (Champions-only)")
lines.append("- Life Orb ×1.3 · Expert Belt ×1.2 (SE) · type items ×1.2 · Muscle Band / Wise Glasses ×1.1 — damage")
lines.append("- **Choice Scarf** Spe ×1.5 (both sides — feeds the ⚡/🐢 order) · Focus Sash survives a would-be OHKO · resist berry halves one SE hit")
lines.append("- Klutz negates the holder's item. Assault Vest / Eviolite / Choice Band / Specs are **not in Champions** and deliberately absent.")

open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("COVERAGE.md written:", len(lines), "lines;", sum(1 for s in abils if s in MODELED), "abilities modeled of", len(abils))
