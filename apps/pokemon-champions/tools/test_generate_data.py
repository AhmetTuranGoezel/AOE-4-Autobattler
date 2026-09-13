"""Offline regression tests: python -m unittest discover -s apps/pokemon-champions/tools -p 'test_*.py'."""
import io
import json
import os
import tempfile
import unittest
import urllib.error
from email.message import Message
from unittest.mock import patch

import generate_data as gen


def mon(slug="pyroar-male", species="Pyroar", dex=668, form="", **extra):
    return {"slug": slug, "species": species, "dex": dex, "formLabel": form,
            "isMega": False, "category": "base", "_moves": ["return", "flamethrower", "psychic"],
            "_movesrc": "pokebase", "usage": {}, **extra}


def record(names=("Protect",), dex=668, **extra):
    return {"moves": [{"name": name} for name in names], "dexNumber": dex,
            "championsVerified": True, "source": "serebii-champions", **extra}


def table(title, *moves):
    links = "".join(f'<tr><td><a href="/attackdex-champions/{name.lower().replace(" ", "")}.shtml">{name}</a></td></tr>' for name in moves)
    return f'<table><h3><a name="level"></a>{title}</h3>{links}</table>'


class LearnsetTests(unittest.TestCase):
    def apply(self, mons, records, fallback=lambda _: None):
        with patch("sys.stdout", new=io.StringIO()):
            return gen.apply_repo_learnsets(mons, records, fallback)

    def test_missing_learnset_withholds_mainline_and_reports_usage(self):
        pokemon = mon(usage={"moves": [["Return", 20]]})
        report = self.apply([pokemon], {})
        self.assertEqual(pokemon["_moves"], [])
        self.assertEqual(report["unverified"], ["pyroar-male"])
        self.assertEqual(report["entries"][0]["usageMovesNotConfirmed"], ["return"])
        self.assertIn("return", report["entries"][0]["withheldCandidates"])

    def test_verified_repo_record_does_not_union_fallback_or_psychic(self):
        pokemon = mon()
        self.apply([pokemon], {"Pyroar": record()})
        self.assertEqual(pokemon["_moves"], ["protect"])
        self.assertEqual(pokemon["learnset"]["source"], "champions-repo")

    def test_unverified_generic_and_empty_repo_records_are_not_legal(self):
        for override in ({"championsVerified": False}, {"championsVerified": None},
                         {"source": "showdown"}, {"moves": []}, {"dexNumber": 999}):
            with self.subTest(override=override):
                pokemon = mon(_movesrc="pokeapi-mainline")
                self.apply([pokemon], {"Pyroar": record(**override)})
                self.assertEqual(pokemon["_moves"], [])

    def test_pyroar_and_other_missing_species_use_champions_fallback(self):
        for pokemon in (mon(), mon("example", "Example", 999)):
            def direct(m):
                return {"moves": ["flamethrower", "yawn"], "url": f"https://example.com/{m['slug']}", "entry": "Standard Moves"}
            self.apply([pokemon], {}, direct)
            self.assertEqual(pokemon["_moves"], ["flamethrower", "yawn"])
            self.assertEqual(pokemon["learnset"]["status"], "verified")
            self.assertNotIn("return", pokemon["_moves"])

    def test_regional_and_mega_never_inherit_base_by_dex(self):
        for pokemon in (mon("slowbro-galar", "Slowbro", 80, "Galarian"),
                        mon("slowbro-mega", "Slowbro", 80, "Mega", isMega=True)):
            self.apply([pokemon], {"Slowbro": record(dex=80)})
            self.assertEqual(pokemon["_moves"], [])

    def test_repo_form_unions_require_form_specific_confirmation(self):
        pokemon = [mon("slowbro", "Slowbro", 80), mon("slowbro-galar", "Slowbro", 80, "Galarian")]
        self.apply(pokemon, {"Slowbro": record(dex=80), "Galarian Slowbro": record(dex=80)})
        self.assertTrue(all(not m["_moves"] for m in pokemon))

    def test_table_parser_only_reads_champions_links_inside_correct_table(self):
        page = table("Standard Moves", "Flamethrower", "Double-Edge")
        page += '<a href="/attackdex-champions/return.shtml">Return</a>'
        self.assertEqual(gen.parse_serebii_moves(page, mon())["moves"], ["double-edge", "flamethrower"])

    def test_gender_and_regional_tables_are_separate(self):
        page = table("Standard Moves - Male", "Trick Room") + table("Standard Moves - Female", "Follow Me")
        self.assertEqual(gen.parse_serebii_moves(page, mon("indeedee-female", "Indeedee"))["moves"], ["follow-me"])
        page = table("Standard Moves", "Slack Off") + table("Galarian Form Standard Moves", "Shell Side Arm")
        self.assertEqual(gen.parse_serebii_moves(page, mon("slowbro-galar", "Slowbro", 80, "Galarian"))["moves"], ["shell-side-arm"])
        self.assertIsNone(gen.parse_serebii_moves(table("Standard Moves", "Slack Off"), mon("slowbro-galar", "Slowbro", 80, "Galarian")))
        self.assertIsNone(gen.parse_serebii_moves("<html>No move tables</html>", mon()))

    def test_actual_alola_and_eternal_headings(self):
        page = table("Standard Moves", "Thunderbolt") + table("Alola Form Standard Moves", "Psychic")
        self.assertEqual(gen.parse_serebii_moves(page, mon("raichu-alola", "Raichu", 26, "Alolan"))["moves"], ["psychic"])
        self.assertEqual(gen.parse_serebii_moves(table("Standard Moves - Eternal Floette", "Light of Ruin"),
                         mon("floette-eternal", "Floette", 670, "Eternal"))["moves"], ["light-of-ruin"])

    def test_ambiguous_mega_gender_does_not_choose_a_sex(self):
        page = table("Standard Moves - Male", "Quick Guard") + table("Standard Moves - Female", "Future Sight")
        self.assertIsNone(gen.parse_serebii_moves(page, mon("meowstic-mega", "Meowstic", 678, "Mega", isMega=True)))

    def test_usage_parser_accepts_added_css_classes_without_stealing_next_row(self):
        page = '<a href="/pokemon-champions/pokemon/first">First</a>'
        page += '<a href="/pokemon-champions/pokemon/second">Second</a><span class="text-xs tabular-nums font-medium">38.5<!-- -->%</span>'
        with patch.object(gen, "http_json", return_value=page), patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(gen.fetch_usage_rates(), {"second": 38.5})

    def test_strict_mode_does_not_replace_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            out, report_path = os.path.join(temp, "data.json"), os.path.join(temp, "report.json")
            gen.write_json(out, {"original": True})
            pokemon = mon(_abilsrc="pokebase")
            with patch.object(gen, "OUT", out), patch.object(gen, "REPORT_PATH", report_path), \
                 patch.object(gen, "fetch_roster", return_value=[{"slug": "pyroar-male"}]), \
                 patch.object(gen, "fetch_roster_mon", return_value=pokemon), \
                 patch.object(gen, "fetch_champ_repo", return_value={}), \
                 patch.object(gen, "fetch_serebii_learnset", return_value=None), \
                 patch("sys.stdout", new=io.StringIO()):
                with self.assertRaisesRegex(ValueError, "Unverified learnsets"):
                    gen.main(["--strict-learnsets"])
            with open(out, encoding="utf-8") as f:
                self.assertEqual(json.load(f), {"original": True})
            with open(report_path, encoding="utf-8") as f:
                self.assertEqual(json.load(f)["unverified"], ["pyroar-male"])

    def test_nested_roster_notes_do_not_hide_pawmot(self):
        rows = gen.parse_section('{{gdex/Champs|0923|Pawmot|2|Electric|Fighting|Yes|1.0.2{{tt|*|Available now}}}}', "base")
        self.assertEqual([m["slug"] for m in rows], ["pawmot"])


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for name, value in (("CACHE", self.temp.name), ("REGULATION", {"id": "M-C"}),
                            ("REFRESH", False), ("FETCHED", set())):
            mock = patch.object(gen, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        self.sleep = patch.object(gen.time, "sleep")
        self.sleep.start()
        self.addCleanup(self.sleep.stop)

    def response(self, value=b'{"fresh":true}'):
        stream = io.BytesIO(value)
        stream.headers = Message()
        return stream

    def test_regulation_namespaces_and_legacy_cache_are_separate(self):
        current = gen._cache_path("bulba_roster")
        with patch.object(gen, "REGULATION", {"id": "M-B"}):
            self.assertNotEqual(gen._cache_path("bulba_roster"), current)
        self.assertNotEqual(os.path.join(self.temp.name, "bulba_roster.json"), current)

    def test_fresh_cache_is_reused_and_expired_cache_refetched(self):
        path = gen._cache_path("repo_learnsets")
        gen.write_json(path, {"old": True})
        with patch.object(gen.urllib.request, "urlopen", return_value=self.response()) as fetch:
            self.assertEqual(gen.http_json("https://example.com", "repo_learnsets"), {"old": True})
            fetch.assert_not_called()
            old = gen.time.time() - gen.CACHE_MAX_AGE - 1
            os.utime(path, (old, old))
            self.assertEqual(gen.http_json("https://example.com", "repo_learnsets"), {"fresh": True})
            fetch.assert_called_once()

    def test_refresh_ignores_cache_but_reuses_same_run_fetches(self):
        gen.write_json(gen._cache_path("pbmon"), {"old": True})
        with patch.object(gen, "REFRESH", True), patch.object(gen.urllib.request, "urlopen", return_value=self.response()) as fetch:
            self.assertEqual(gen.http_json("https://example.com", "pbmon"), {"fresh": True})
            self.assertEqual(gen.http_json("https://example.com", "pbmon"), {"fresh": True})
            fetch.assert_called_once()

    def test_failed_refresh_never_silently_uses_old_data(self):
        gen.write_json(gen._cache_path("roster"), {"stale": True})
        with patch.object(gen, "REFRESH", True), patch.object(gen.urllib.request, "urlopen", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                gen.http_json("https://example.com", "roster", retries=1)

    def test_corrupt_cache_is_refetched(self):
        path = gen._cache_path("corrupt")
        gen.write_json(path, {})
        with open(path, "w", encoding="utf-8") as f:
            f.write("{")
        with patch.object(gen.urllib.request, "urlopen", return_value=self.response()):
            self.assertEqual(gen.http_json("https://example.com", "corrupt"), {"fresh": True})

    def test_non_utf8_html_and_cached_404(self):
        with patch.object(gen.urllib.request, "urlopen", return_value=self.response(b'Pok\xe9mon')):
            self.assertEqual(gen.http_json("https://example.com", "html", text=True), "Pokémon")
        error = urllib.error.HTTPError("https://example.com", 404, "Not found", {}, None)
        with patch.object(gen.urllib.request, "urlopen", side_effect=error) as fetch:
            self.assertEqual(gen.http_json("https://example.com", "absent", text=True, missing=""), "")
            self.assertEqual(gen.http_json("https://example.com", "absent", text=True, missing=""), "")
            fetch.assert_called_once()


if __name__ == "__main__":
    unittest.main()
