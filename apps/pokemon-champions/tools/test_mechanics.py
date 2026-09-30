"""Offline generator and published snapshot regressions; no live refresh."""
from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import generate_data as gen
from mechanics import apply_mechanics, repair_snapshot, stat_changes, HEALER_SOURCE

FIXTURE = Path(__file__).parent / "fixtures" / "move-stat-effects.json"
RAW = json.loads(FIXTURE.read_text(encoding="utf-8"))
EXPECTED = {
    "shiftgear": {"atk": 1, "spe": 2},
    "dragondance": {"atk": 1, "spe": 1},
    "quiverdance": {"spa": 1, "spd": 1, "spe": 1},
    "bulkup": {"atk": 1, "def": 1}, "calmmind": {"spa": 1, "spd": 1},
    "shellsmash": {"atk": 2, "def": -1, "spa": 2, "spd": -1, "spe": 2},
    "noretreat": {"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1},
    "coil": {"atk": 1, "def": 1, "accuracy": 1},
    "clangoroussoul": {"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1},
    "growth": {"atk": 1, "spa": 1},
    "victorydance": {"atk": 1, "def": 1, "spe": 1},
    "filletaway": {"atk": 2, "spa": 2, "spe": 2},
}


class MechanicsTests(unittest.TestCase):
    def test_all_requested_multi_stat_moves(self):
        for sid, expected in EXPECTED.items():
            with self.subTest(move=sid):
                self.assertEqual(stat_changes(RAW[sid], RAW[sid])["self"], expected)

    def test_shift_gear_mutations_cannot_pass_the_generator_contract(self):
        for removed in ("atk", "spe"):
            raw = deepcopy(RAW["shiftgear"])
            del raw["boosts"][removed]
            with self.subTest(removed=removed), self.assertRaises(AssertionError):
                self.assertEqual(stat_changes(raw, raw)["self"], {"atk": 1, "spe": 2})

    def test_secondary_chance_recipient_and_all_stats_survive(self):
        raw = RAW["ancientpower"]
        effect = stat_changes(raw, {**raw, "secondaries": [[20, ""]]})
        self.assertNotIn("self", effect)
        self.assertEqual(effect["secondary"], [{"index": 0, "chance": 20, "self": {
            "atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}}])
        self.assertEqual(stat_changes(RAW["nobleroar"], RAW["nobleroar"])["target"], {"atk": -1, "spa": -1})
        self.assertEqual(stat_changes(RAW["howl"], RAW["howl"]), {"self": {"atk": 1}, "allies": {"atk": 1}})

    def test_champions_move_override_and_conditional_growth(self):
        self.assertEqual(stat_changes(RAW["makeitrain"], RAW["makeitrain"])["self"], {"spa": -2})
        growth = stat_changes(RAW["growth"], RAW["growth"])
        self.assertEqual(growth["self"], {"atk": 1, "spa": 1})
        self.assertEqual(growth["conditional"][0]["self"], {"atk": 2, "spa": 2})

    def test_healer_override_replaces_stale_source_and_keeps_provenance(self):
        for stale in ("30% chance", "Sometimes cures", ""):
            abilities = {"healer": {"name": "Healer", "desc": stale, "count": 4}}
            apply_mechanics({}, abilities, {})
            self.assertIn("50%", abilities["healer"]["desc"])
            self.assertNotIn("30%", abilities["healer"]["desc"])
            self.assertEqual(abilities["healer"]["provenance"]["source"], HEALER_SOURCE)
            self.assertEqual(abilities["healer"]["count"], 4)

    def test_repair_is_idempotent_preserves_unrelated_fields_and_never_fetches(self):
        old = {"meta": {"generated": "unchanged"}, "pokemon": [{"moves": [7]}], "typeChart": {},
               "moves": {"7": {"name": "Shift Gear", "effect": "Keep wording", "count": 2}},
               "abilities": {"healer": {"name": "Healer", "desc": "30%", "count": 4}}}
        repaired = repair_snapshot(old, RAW)
        self.assertEqual(repaired, repair_snapshot(repaired, RAW))
        for key in ("meta", "pokemon", "typeChart"):
            self.assertEqual(repaired[key], old[key])
        self.assertNotIn("statChanges", old["moves"]["7"])
        with tempfile.TemporaryDirectory(dir=gen.APP) as folder:
            out = str(Path(folder) / "data.json")
            gen.write_json(out, old)
            with patch.object(gen, "OUT", out), patch.object(gen, "_cache_path", return_value=str(FIXTURE)), \
                 patch.object(gen, "http_json", side_effect=AssertionError("No network allowed")), \
                 patch.object(gen, "fetch_roster", side_effect=AssertionError("No live regeneration")), \
                 patch("sys.stdout", new=io.StringIO()):
                gen.main(["--repair-mechanics"])
            self.assertEqual(json.loads(Path(out).read_text(encoding="utf-8")), repaired)

    def test_full_generator_final_precedence_and_serialization(self):
        """Run real main/serialization with mocked sources, including stale repo Healer."""
        mon = {"slug": "example", "species": "Example", "pid": 999, "dex": 999,
               "formLabel": "", "isMega": False, "category": "base", "available": True,
               "types": ["steel"], "stats": dict.fromkeys(("hp", "atk", "def", "spa", "spd", "spe"), 80),
               "bst": 480, "weight": 100, "gen": 9, "sprite": "", "artwork": "",
               "_moves": ["shift-gear"], "_movesrc": "pokebase", "_abilsrc": "pokebase",
               "abilities": [{"slug": "healer", "hidden": False, "_name": "Healer", "_desc": "50% chance"}],
               "learnset": {"status": "verified"}}
        move = {"name": "Shift Gear", "type": "steel", "class": "status", "power": None,
                "target": "user", "effect": "Raises the user's Speed by 2 stages and its Attack by 1 stage."}
        def repo(path):
            if path == "abilities/abilities.json":
                return [{"name": "Healer", "description": "30% chance of curing an ally."}]
            return [{"name": move["name"], "description": move["effect"]}]
        with tempfile.TemporaryDirectory(dir=gen.APP) as folder:
            out = str(Path(folder) / "data.json")
            with patch.object(gen, "HERE", folder), patch.object(gen, "OUT", out), \
                 patch.object(gen, "REPORT_PATH", str(Path(folder) / "report.json")), \
                 patch.object(gen, "fetch_roster", return_value=[{"slug": "example"}]), \
                 patch.object(gen, "fetch_roster_mon", return_value=mon), \
                 patch.object(gen, "apply_repo_learnsets", return_value={"verifiedCount": 1, "unverified": []}), \
                 patch.object(gen, "fetch_move", return_value=move), \
                 patch.object(gen, "fetch_pokebase_move", return_value=None), \
                 patch.object(gen, "fetch_champ_repo", side_effect=repo), \
                 patch.object(gen, "fetch_type_chart", return_value={}), \
                 patch.object(gen, "http_json", return_value=RAW), patch("sys.stdout", new=io.StringIO()):
                gen.main([])
            generated = json.loads(Path(out).read_text(encoding="utf-8"))
            self.assertEqual(next(iter(generated["moves"].values()))["statChanges"]["self"], {"atk": 1, "spe": 2})
            self.assertIn("50%", generated["abilities"]["healer"]["desc"])
            self.assertNotIn("30%", generated["abilities"]["healer"]["desc"])
            self.assertEqual(generated["abilities"]["healer"]["provenance"]["source"], HEALER_SOURCE)

    def test_published_snapshot_contains_the_generator_output(self):
        data = json.loads(Path(gen.OUT).read_text(encoding="utf-8"))
        moves = {gen.sd_id(move["name"]): move for move in data["moves"].values()}
        for sid, expected in EXPECTED.items():
            # Victory Dance/Fillet Away need model support, not invented roster learnsets.
            if sid in moves:
                self.assertEqual(moves[sid]["statChanges"]["self"], expected)
        self.assertEqual(moves["shiftgear"]["statChanges"]["self"], {"atk": 1, "spe": 2})
        self.assertIn("50%", data["abilities"]["healer"]["desc"])
        self.assertEqual(data["abilities"]["healer"]["provenance"]["source"], HEALER_SOURCE)


if __name__ == "__main__":
    unittest.main()
