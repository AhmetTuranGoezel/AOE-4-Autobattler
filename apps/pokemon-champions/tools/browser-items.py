"""Exercise the real item-aware Damage/Moves/Team UI in an isolated local browser."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import threading
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    data = json.loads((APP / "champions-data.json").read_text(encoding="utf-8"))
    moves = {m["name"]: int(i) for i, m in data["moves"].items()}
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(APP)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/"
    errors = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe"), headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            context.route("**/*", lambda r: r.continue_() if r.request.url.startswith(url) else r.abort())
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(url)
            page.locator("#app").wait_for(state="visible")

            def mount(cfg, team=None):
                page.evaluate("""async ({cfg, team}) => {
                  window.itemTestData ||= await (await fetch('./champions-data.json')).json();
                  const {initCalcView} = await import('./src/calc-view.js');
                  localStorage.setItem('pc-counters-state', JSON.stringify(cfg));
                  document.querySelector('#item-test-harness')?.remove();
                  const container = document.createElement('main');
                  container.id = 'item-test-harness';
                  document.body.append(container);
                  initCalcView({container, data: window.itemTestData, getTeam: () => team, onOpen: () => {}, onMoveInfo: () => {}});
                }""", {"cfg": cfg, "team": team or []})

            def calc(attacker="steelix", defender="floette-mega", move="Heavy Slam", item="none", target_item="none", terrain="none", target_ability=None, ability=None, stages=None):
                cfg = {"mode": "rev", "revSlug": attacker, "revBasis": "base", "revPinned": [defender], "useAccuracy": False, "doubles": False, "terrain": terrain,
                       "revCfg": {"ability": ability, "invest": 0, "nature": "Serious", "item": item, "boost": 0, "speed": "base", "stages": stages or {}, "movepool": "all", "moveset": [moves[move]], "custom": []},
                       "revOverrides": {defender: {"item": target_item, "ability": target_ability}}}
                mount(cfg)
                row = page.locator(f'#rev-results .ehp-row[data-open="{defender}"]')
                if not row.count():
                    return None
                pct = row.locator(".ehp-pct").inner_text()
                return {"pct": [int(n) for n in re.findall(r"\d+", pct)], "text": row.inner_text(), "notes": row.locator("[title]").evaluate_all("els => els.map(e => e.title).join(' | ')")}

            base = calc()
            assert base, "Steelix vs Mega Floette must render"
            boosted = calc(item="metal-coat")
            assert boosted["pct"][1] > base["pct"][1], (base, boosted)
            assert calc(item="charcoal")["pct"] == base["pct"]
            assert calc(item="wise-glasses")["pct"] == base["pct"]
            # Mega defenders occupy the stone slot: an impossible berry must not reduce damage.
            assert calc(target_item="babiri-berry")["pct"] == base["pct"]
            print("Steelix Heavy Slam:", base["pct"], "Metal Coat:", boosted["pct"], flush=True)

            base = calc(defender="clefable")
            berry = calc(defender="clefable", target_item="babiri-berry")
            assert berry["pct"][1] < base["pct"][1] * 0.6, (base, berry)
            assert calc(defender="clefable", target_item="occa-berry")["pct"] == base["pct"]
            assert calc(defender="clefable", target_item="babiri-berry", target_ability="klutz")["pct"] == base["pct"]
            seed = calc(defender="clefable", target_item="grassy-seed", terrain="grassy")
            assert seed["pct"][1] < base["pct"][1], (seed, base)
            assert calc(defender="clefable", target_item="psychic-seed", terrain="psychic")["pct"] == base["pct"]
            assert calc(defender="tyranitar", move="Earthquake", target_item="air-balloon") is None
            assert calc(defender="tyranitar", move="Earthquake", target_item="air-balloon", target_ability="klutz")
            sash = calc(attacker="sirfetchd", defender="tyranitar", move="Close Combat", target_item="focus-sash")
            assert "Sash" in sash["text"] and "OHKO" not in sash["text"], sash
            normal = calc(attacker="persian", defender="slowbro", move="Fake Out")
            gem = calc(attacker="persian", defender="slowbro", move="Fake Out", item="normal-gem")
            assert gem["pct"][1] > normal["pct"][1] and "first attack only" in gem["text"], (normal, gem)

            base = calc(attacker="sirfetchd", defender="slowbro", move="Leaf Blade", ability="scrappy")
            leek = calc(attacker="sirfetchd", defender="slowbro", move="Leaf Blade", item="leek", ability="scrappy")
            assert leek["pct"][1] > base["pct"][1] * 1.4, (base, leek)
            assert "guaranteed" in leek["text"], leek
            print("Sirfetchd Leaf Blade:", base["pct"], "Leek:", leek["pct"], flush=True)
            calc(attacker="sirfetchd", defender="slowbro", move="Close Combat", item="leek", ability="scrappy")
            assert page.locator('[data-revsel="item"]').input_value() == "leek"
            page.locator('[data-expand="slowbro"]').click()
            page.locator('[data-dovrsel="item"]').select_option("psychic-seed")
            assert page.evaluate("JSON.parse(localStorage.getItem('pc-counters-state')).revOverrides.slowbro.item") == "psychic-seed"
            print("Damage per-defender editor and persistence passed", flush=True)

            # Counters uses separate target/global/individual settings: all must work.
            mount({"mode": "ehp", "targets": [{"slug": "clefable", "item": "babiri-berry", "ability": None}], "pinned": ["steelix"], "atkInvest": 0, "atkNature": "Serious", "doubles": False})
            assert page.locator('[data-ebsel="item"]').input_value() == "babiri-berry"
            page.locator('[data-ebsel="atkItem"]').select_option("muscle-band")
            page.locator('[data-expand="steelix"]').click()
            page.locator('[data-ovrsel="item"]').select_option("metal-coat")
            stored = page.evaluate("JSON.parse(localStorage.getItem('pc-counters-state'))")
            assert stored["targets"][0]["item"] == "babiri-berry" and stored["overrides"]["steelix"]["item"] == "metal-coat"
            # Team Check's detail and incoming-hit path use the saved item, not global presets.
            config = {"mode": "team", "threats": ["slowbro"], "revBasis": "base", "revOverrides": {"slowbro": {"ability": None, "item": "none"}}, "atkInvest": 0, "atkNature": "Serious", "doubles": False}
            values = []
            for item in ("none", "leek"):
                mount(config, [{"slug": "sirfetchd", "moves": [moves["Leaf Blade"]], "ability": "scrappy", "item": item}])
                page.locator('[data-tcell="sirfetchd|slowbro"]').click()
                pct = page.locator(f'.tc-mrow[data-move-info="{moves["Leaf Blade"]}"] .apm-pct').inner_text()
                values.append(int(re.findall(r"\d+", pct)[-1]))
            assert values[1] > values[0] * 1.4, values
            assert "Leek" in page.locator(".tc-mhead").inner_text()
            print("Counters/global/override selectors and item-aware Team Check passed", flush=True)

            # Restore the normal app to test team persistence and both Moves editors.
            page.evaluate("""team => { localStorage.clear(); localStorage.setItem('pc-team', JSON.stringify(team)); }""", [{"slug": "sirfetchd", "moves": [moves["Leaf Blade"]], "ability": "scrappy", "picked": True, "item": "leek"}])
            page.reload()
            page.locator('[data-tab="team"]').click()
            select = page.locator('[data-team-item="sirfetchd"]')
            assert select.input_value() == "leek"
            select.select_option("muscle-band")
            page.locator(".team-name").fill("Items test")
            page.locator("[data-save-team]").click()
            select.select_option("none")
            page.locator("[data-load-team]").click()
            assert select.input_value() == "muscle-band"
            page.locator("[data-share-working]").click()
            link = page.locator(".tm-share-link").input_value()
            assert "#t=4|" in link and ".muscle-band." in link, link
            page.evaluate("localStorage.removeItem('pc-team')")
            page.goto(link)
            page.reload()
            page.locator('[data-tab="team"]').click()
            assert select.input_value() == "muscle-band"
            assert page.evaluate("JSON.parse(localStorage.getItem('pc-team'))[0].moves") == [moves["Leaf Blade"]]
            print("Team save/load and v4 share round-trip passed", flush=True)

            page.locator('[data-tab="moves"]').click()
            page.locator(".mv-mon").fill("Sirfetch")
            page.locator(".mv-mon").press("ArrowDown")
            page.locator(".mv-mon").press("Enter")
            page.locator('[data-mon-cfg="sirfetchd"]').click()
            page.locator(".mv-cfg-pop [data-cfg-item-select]").select_option("leek")
            assert "Leek" in page.locator(".mon-cfg-badge").inner_text()
            page.locator('[data-mvmode="rank"]').click()
            page.locator("[data-preset-toggle]").click()
            page.locator(".mvr-preset [data-cfg-item-select]").select_option("muscle-band")
            assert "Muscle Band" in page.locator(".mvr-preset").inner_text()
            page.locator(".mvr-move-input").fill("Leaf Blade")
            page.locator(".mvr-move-input").press("ArrowDown")
            page.locator(".mvr-move-input").press("Enter")
            page.locator('[data-cfg-toggle="sirfetchd"]').click()
            page.locator('[data-cfg-slug="sirfetchd"] [data-cfg-item-select]').select_option("leek")
            assert page.locator('[data-cfg-slug="sirfetchd"] [data-cfg-item-select]').input_value() == "leek"
            print("Moves browse, global rank preset and per-Pokemon rank editor passed", flush=True)
            folder = APP / ".tmp-smoke"
            folder.mkdir(exist_ok=True)
            page.screenshot(path=str(folder / "items-rank-desktop.png"))
            page.set_viewport_size({"width": 390, "height": 844})
            page.locator('[data-tab="team"]').click()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Team overflow on mobile"
            assert page.locator('[data-team-item="sirfetchd"]').is_visible()
            page.screenshot(path=str(folder / "items-team-mobile.png"))
            assert not errors, errors
            browser.close()
            print("Item browser checks passed", flush=True)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    run()
