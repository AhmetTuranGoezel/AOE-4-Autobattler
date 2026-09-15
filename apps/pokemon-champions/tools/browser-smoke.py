"""Optional isolated browser smoke test; requires Python Playwright + Chrome.

No user profile is touched. Serves only this app on an ephemeral localhost port.
Screenshots, if requested, stay in the app's ignored .tmp-smoke directory.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run(screenshots=False):
    data = json.loads((APP / "champions-data.json").read_text(encoding="utf-8"))
    surf = next(int(i) for i, m in data["moves"].items() if m["name"] == "Surf")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(APP)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/"
    errors = []
    try:
        with sync_playwright() as pw:
            chrome = os.environ.get("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
            browser = pw.chromium.launch(executable_path=chrome, headless=True)
            for width, height in ((1440, 1000), (390, 844)):
                print(f"Checking viewport {width} x {height}", flush=True)
                context = browser.new_context(viewport={"width": width, "height": height})
                context.set_default_timeout(15000)
                # Third-party fonts/sprites are not needed to test app behavior.
                context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(url) else route.abort())
                context.add_init_script("localStorage.setItem('pc-team', " + json.dumps(json.dumps([
                    {"slug": "pyroar-male", "moves": [surf], "ability": None, "picked": True}
                ])) + ");")
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(url)
                page.locator("#app").wait_for(state="visible")
                print("  app loaded", flush=True)
                assert page.locator("#regulation-label").is_visible()
                assert page.locator("#regulation-label").inner_text() == f"Regulation: {data['meta']['regulation']}"
                if width < 640:
                    assert page.locator(".grid-view").is_visible()
                page.locator("#view-table").click()
                print("  checking table ranks", flush=True)
                rank_values = page.locator("tbody tr[data-slug] td.rank").all_text_contents()
                assert rank_values == [str(i + 1) for i in range(len(rank_values))]
                # Pick a comparison outside the Pyroar filter.
                row = page.locator('tbody tr[data-slug]:not([data-slug="pyroar-male"])').nth(4)
                row.locator("[data-pin]").click()
                page.locator("#search").fill("Pyroar")
                assert page.locator("tbody tr.pinned td.rank").inner_text() == "—"
                assert page.locator("tbody tr:not(.pinned)[data-slug] td.rank").all_text_contents() == ["1"]
                page.locator('[data-sort="atk"]').click()
                assert page.locator("tbody tr:not(.pinned)[data-slug] td.rank").all_text_contents() == ["1"]
                page.locator('[data-slug="pyroar-male"] .nm-top').click()
                print("  checking Pyroar details", flush=True)
                assert "Serebii" in page.locator(".detail-moves .learnset-note").inner_text()
                assert page.locator(".detail-moves .mv-row").count() == 49
                page.locator("#detail [data-close]").click()
                page.locator("#search").fill("Sirfetch")
                page.locator('[data-slug="sirfetchd"] .nm-top').click()
                print("  checking Sirfetchd item usage", flush=True)
                item_card = page.locator(".detail-usage .use-cat").filter(has=page.locator(".use-lab", has_text="Item"))
                sirfetchd = next(mon for mon in data["pokemon"] if mon["slug"] == "sirfetchd")
                assert item_card.locator(".use-name").all_text_contents() == [name for name, _ in sirfetchd["usage"]["items"]]
                assert not any(name in item_card.inner_text() for name in ("Armarouge", "Indeedee", "Salamence", "Meteor Assault"))
                page.locator("#detail [data-close]").click()
                page.locator('[data-tab="team"]').click()
                assert "excluded from team analysis" in page.locator(".team-member").first.inner_text()
                for tab in ("moves", "abilities", "calc", "coverage", "pokemon"):
                    page.locator(f'[data-tab="{tab}"]').click()
                print("  tabs checked", flush=True)
                if width < 640:
                    page.locator("#view-grid").click()
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                if screenshots:
                    folder = APP / ".tmp-smoke"
                    folder.mkdir(exist_ok=True)
                    page.screenshot(path=str(folder / f"roster-{width}.png"))
                context.close()
            browser.close()
        assert not errors, errors
        print("browser smoke passed: desktop/mobile, regulation, ranks/pins, Pyroar, Sirfetchd usage, saved move warnings and tabs")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshots", action="store_true")
    run(parser.parse_args().screenshots)
