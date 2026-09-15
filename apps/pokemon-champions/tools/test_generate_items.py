"""Offline regression tests for the held-item catalogue importer."""
import json
from pathlib import Path
import re
import unittest

import generate_items as gen


def row(name, effect="An item to be held by a Pokémon."):
    return f'<tr><td>picture</td><td><a href="/itemdex/example.shtml">{name}</a></td><td>{effect}</td><td>Shop</td></tr>'


class ItemCatalogueTests(unittest.TestCase):
    def fixture(self):
        return "<table>" + "".join(row(f"Example {i}") for i in range(105)) + "".join([
            row("Leek"), row("Air Balloon"), row("Psychic Seed"),
            row("Sitrus Berry", "Restores HP."), row("Salamencite", "A Salamence holding this can Mega Evolve."),
        ]) + "</table>"

    def test_rows_are_bounded_and_inventory_tickets_excluded(self):
        page = self.fixture() + row("Training Ticket", "Use for training.") + row("Unrelated", "")
        result = gen.parse_items(page)
        self.assertEqual(len(result), 110)
        self.assertEqual(result["sitrus-berry"]["group"], "Berries")
        self.assertEqual(result["salamencite"]["group"], "Mega Stones")
        self.assertEqual(result["psychic-seed"]["group"], "Held items")
        self.assertNotIn("training-ticket", result)
        self.assertNotIn("unrelated", result)

    def test_names_decode_entities_and_normalize_apostrophes(self):
        result = gen.parse_items(self.fixture() + row("King&#39;s Rock"))
        self.assertEqual(result["kings-rock"]["label"], "King's Rock")

    def test_incomplete_source_fails_closed(self):
        with self.assertRaises(ValueError):
            gen.parse_items(row("Leek"))
        with self.assertRaises(ValueError):
            gen.parse_items(self.fixture().replace("Psychic Seed", "Wrong Item"))

    def test_optional_cached_source_matches_committed_catalogue(self):
        app = Path(__file__).resolve().parents[1]
        source = (app / "src/item-catalog.js").read_text(encoding="utf-8")
        meta = json.loads(re.search(r"ITEM_CATALOG_META = (.*);", source)[1])
        cache = app / "tools/.cache/v2" / meta["regulation"] / "champions_items.json"
        if not cache.is_file():
            self.skipTest("Optional source audit needs a local generation cache")
        expected = gen.parse_items(json.loads(cache.read_text(encoding="utf-8")))
        published = json.loads(re.search(r"ITEM_CATALOG = (.*);", source, re.S)[1])
        self.assertEqual(published, expected)


if __name__ == "__main__":
    unittest.main()
