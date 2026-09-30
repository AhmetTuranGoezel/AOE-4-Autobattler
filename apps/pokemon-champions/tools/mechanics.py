"""Structured mechanics shared by full generation and offline snapshot repair.

Showdown's JSON exposes primary boosts, on-hit self boosts and secondaries.
Callback-only effects and Champions differences are explicit here, never parsed
from English descriptions. This is metadata, not a full turn simulator.
"""
from copy import deepcopy

STAT_KEYS = ("atk", "def", "spa", "spd", "spe", "accuracy", "evasion")
SHOWDOWN_MOVES = "https://play.pokemonshowdown.com/data/moves.json"
SHOWDOWN_CALLBACKS = "https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts"
HEALER_SOURCE = "https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/abilities.ts"


def _stats(boosts):
    return {key: boosts[key] for key in STAT_KEYS if boosts.get(key)}


def _recipients(raw, target):
    result = {}
    if raw.get("boosts"):
        recipient = "self" if target == "self" else "target"
        result[recipient] = _stats(raw["boosts"])
        if target == "allies":  # Howl affects the user AND its allies.
            result = {"self": dict(result[recipient]), "allies": dict(result[recipient])}
    if raw.get("self", {}).get("boosts"):
        result.setdefault("self", {}).update(_stats(raw["self"]["boosts"]))
    return result


def stat_changes(raw, move):
    """Preserve all affected stats/recipients, including secondary probabilities.

`self`/`target` are primary changes; secondary records carry their source index
so the UI can suppress old lossy labels without suppressing status effects.
Conditional `self` maps REPLACE the default map, they do not add to it.
"""
    result = _recipients(raw, raw.get("target"))
    sec = raw.get("secondary")
    secondaries = raw.get("secondaries") or ([sec] if isinstance(sec, dict) else [])
    published = move.get("secondaries", [])
    for index, secondary in enumerate(s for s in secondaries if s.get("chance")):
        changes = _recipients(secondary, raw.get("target"))
        if changes:
            chance = published[index][0] if len(published) == len(secondaries) else secondary["chance"]
            result.setdefault("secondary", []).append({"index": index, "chance": chance, **changes})

    name = move["name"]
    # Callback-only effects are absent from moves.json. Keep their full effect
    # here, alongside (not in a second UI-specific setup table) the raw boosts.
    if name == "Growth":
        result["conditional"] = [{"condition": "sun", "label": "instead in sun, without Utility Umbrella",
                                  "self": {"atk": 2, "spa": 2}}]
    elif name == "Belly Drum":
        result["self"] = {"atk": 12}  # delta, then clamp to +6 (also works from -6).
    elif name == "Stockpile":
        result["self"] = {"def": 1, "spd": 1}
        result["notes"] = ["Fails after three Stockpiles"]
    elif name == "Curse":
        result["conditional"] = [{"condition": "non-ghost", "label": "non-Ghost user only",
                                  "self": {"atk": 1, "def": 1, "spe": -1}}]
    elif name == "Make It Rain":
        result["self"] = {"spa": -2}  # existing Champions-specific correction

    if name in ("Belly Drum", "Fillet Away", "Clangorous Soul"):
        cost = "33%" if name == "Clangorous Soul" else "50%"
        result["notes"] = [f"Costs {cost} of maximum HP; requires enough HP to survive"]
    elif name == "No Retreat":
        result["notes"] = ["Traps the user; cannot normally be repeated"]
    return result


def apply_mechanics(moves, abilities, showdown):
    """FINAL precedence, after every generic/Champions description merge."""
    for move in moves.values():
        sid = "".join(c for c in move["name"].lower() if c.isascii() and c.isalnum())
        raw = showdown.get(sid)
        if raw is None:
            raise ValueError(f"Missing structured move source: {move['name']}")
        move["statChanges"] = stat_changes(raw, move)
    if "healer" in abilities:
        abilities["healer"].update({
            "desc": "At the end of each turn, each adjacent ally with a non-volatile status condition has a 50% chance of being cured.",
            "provenance": {
                "source": HEALER_SOURCE,
                "scope": "Pokemon Champions (Showdown community implementation)",
                "checked": "2026-09-30",
                "evidence": "Champions override: onResidual calls randomChance(1, 2) for each adjacent ally with status.",
            },
        })


def repair_snapshot(snapshot, showdown):
    """Offline, non-mutating input transformation; leaves all other data intact."""
    repaired = deepcopy(snapshot)
    apply_mechanics(repaired["moves"], repaired["abilities"], showdown)
    return repaired
