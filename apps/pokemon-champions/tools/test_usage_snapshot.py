"""Optional all-roster source audit; uses local HTML caches, never the network."""
import html
import json
from pathlib import Path
import re
import unittest

import generate_data as gen


class UsageSnapshotTests(unittest.TestCase):
    def test_item_usage_names_are_actual_item_links_on_the_source_page(self):
        with open(gen.OUT, encoding="utf-8") as f:
            data = json.load(f)
        cache = Path(gen.CACHE) / "v2" / data["meta"]["regulation"]
        if not cache.is_dir():
            self.skipTest("Optional source audit requires a local generation cache")
        checked = 0
        for mon in data["pokemon"]:
            items = mon.get("usage", {}).get("items", [])
            if not items:
                continue
            path = cache / f"pbmon_{mon['slug']}.json"
            self.assertTrue(path.is_file(), f"Missing source for {mon['slug']}")
            page = json.loads(path.read_text(encoding="utf-8"))
            # Independent check against item-link contents, not the usage parser.
            links = re.findall(r'<a\b[^>]*href=["\']/pokemon-champions/items/[^"\']+["\'][^>]*>(.*?)</a\s*>',
                               page, re.S | re.I)
            allowed = {html.unescape(name).strip() for link in links for name in re.findall(
                r'truncate font-medium[^"]*">([^<]+)</span>', link)}
            for name, pct in items:
                with self.subTest(pokemon=mon["slug"], item=name):
                    self.assertIn(name, allowed, "Published item has no item-category source link")
                    self.assertTrue(0 <= pct <= 100)
            checked += 1
        self.assertGreater(checked, 0)
        print(f"Audited item usage against source links for {checked} Pokémon")


if __name__ == "__main__":
    unittest.main()
