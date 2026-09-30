"""Real-snapshot UI checks and screenshots. --live-images allows only public sprite/art CDNs.

No scraping, generation, source updates or user browser profile. All screenshots
stay under this app's ignored .tmp-smoke/meta-presentation directory.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


def run(live_images=False):
    data = json.loads((APP / 'champions-data.json').read_text(encoding='utf-8'))
    image_hosts = {urlparse(mon.get(key) or '').netloc for mon in data['pokemon'] for key in ('sprite', 'artwork')} - {''}
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(APP)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}/'
    output = APP / '.tmp-smoke' / 'meta-presentation'
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe'), headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1080})
            context.set_default_timeout(15000)
            context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(url) or (
                live_images and r.request.resource_type == 'image' and urlparse(r.request.url).netloc in image_hosts
            ) else r.abort())
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('dialog', lambda dialog: dialog.accept())
            page.goto(url)
            page.locator('#app').wait_for(state='visible')

            def tab(name): page.locator(f'#detail-tab-{name}').click()

            def open_mon(slug, name):
                if page.locator('#detail').evaluate("e => e.classList.contains('open')"):
                    page.locator('#detail [data-close]').click()
                page.locator('[data-tab="pokemon"]').click()
                page.locator('#view-table').click()
                page.locator('#search').fill(name)
                page.locator(f'#results [data-slug="{slug}"] .nm-top').click()

            def shot(name, width, full=True):
                page.evaluate("document.querySelector('#detail').scrollTop = 0")
                if live_images:
                    page.locator('#detail img').evaluate_all("imgs => imgs.forEach(img => img.loading = 'eager')")
                    page.wait_for_function("[...document.querySelectorAll('#detail img')].every(img => img.complete)", timeout=45000)
                assert page.locator('#detail').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), name
                assert page.locator('.detail-tab-panel').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), name
                # Capture the real viewport AND an unclipped full sheet. An
                # element screenshot alone clips content at its fixed overlay's
                # viewport boundary, leaving a misleading black lower half.
                viewport = dict(page.viewport_size)
                page.screenshot(path=str(output / f'{name}-{width}-viewport.png'))
                try:
                    if full:
                        height = int(page.locator('#detail-body').bounding_box()['height']) + 100
                        page.set_viewport_size({'width': width, 'height': max(viewport['height'], height)})
                        page.evaluate("document.querySelector('#detail').scrollTop = 0")
                    target = page.locator('#detail-body') if full else page
                    target.screenshot(path=str(output / f'{name}-{width}.png'))
                finally:
                    page.set_viewport_size(viewport)

            for width, height in ((1440, 1080), (390, 844)):
                page.set_viewport_size({'width': width, 'height': height})
                open_mon('hydreigon', 'Hydreigon')
                tab('overview')
                assert page.locator('[role="tabpanel"]').count() == 1
                assert page.locator('.detail-tabs [aria-controls]').evaluate_all("els => els.every(el => document.getElementById(el.getAttribute('aria-controls')))")
                assert page.locator('.detail-ab').is_visible()
                assert page.locator('.meta-set-card, .detail-moves, .stat-lab').count() == 0
                # Roving keyboard tabs and selection stay aligned.
                page.locator('#detail-tab-overview').focus()
                page.keyboard.press('ArrowRight')
                assert page.locator('#detail-tab-builds').get_attribute('aria-selected') == 'true'
                tab('meta')
                build = page.locator('[data-build-card]').first
                assert build.locator('.meta-build-share').inner_text() == '75%\naggregate usage'
                assert 'Modest' in build.inner_text() and '3/3' in build.inner_text()
                assert 'separate from aggregate sample' in build.inner_text()
                assert page.locator('[data-meta-category="natures"]').is_visible()
                assert page.locator('.meta-teammate img').count() == 6
                assert page.locator('.meta-set-card, .stat-lab, .detail-moves').count() == 0
                page.get_by_role('button', name='About Snapshot & source', exact=True).click()
                assert page.locator('#meta-source-help').is_visible()
                assert 'not supplied' in page.locator('#meta-source-help').inner_text().lower()
                page.keyboard.press('Escape')
                assert not page.locator('#meta-source-help').is_visible()
                assert page.locator('#detail').is_visible()
                shot('hydreigon-meta', width)
                if live_images:
                    loaded = page.locator('.meta-teammate img').evaluate_all('imgs => imgs.filter(i => i.naturalWidth > 0).length')
                    assert loaded >= 5, f'Need real images for visual review: {loaded}/6 loaded'

                build.locator('[data-meta-joint]').click()
                assert page.locator('#detail-tab-builds').get_attribute('aria-selected') == 'true'
                assert page.locator('[data-lab-nature]').input_value() == 'modest'
                assert page.locator('[data-pt-num]').evaluate_all('els => els.map(el => Number(el.value))') == [2, 0, 0, 32, 0, 32]
                tab('meta')
                tab('builds')
                assert page.locator('[data-lab-nature]').input_value() == 'modest', 'Tab navigation preserves Stat Lab edits'
                shot('hydreigon-builds', width)

                tab('teams')
                page.locator('[data-meta-open-team]').first.wait_for()
                page.locator('[data-meta-team-kind="tournament"]').click()
                assert page.locator('.meta-set-card').count() == 0
                assert page.locator('[data-team-card]').count() == 6
                assert page.locator('.meta-lineup-slot').count() == 36
                shot('hydreigon-teams', width)
                page.locator('[data-meta-more="tournament"]').click()
                assert page.locator('[data-team-card]').count() > 6
                page.locator('[data-meta-team-kind="featured"]').click()
                first_id = page.locator('[data-meta-open-team]').first.get_attribute('data-meta-open-team')
                page.locator('[data-meta-open-team]').first.click()
                assert page.locator('.meta-set-card').count() == 6
                assert page.locator('.meta-set-moves').count() == 6
                assert page.locator('.meta-set-move').count() == 24
                assert page.locator('[data-meta-import]').count() == 1
                assert page.locator('[data-meta-opponent]').count() == 1
                assert page.locator('.meta-team-grid').count() == 0
                assert page.locator('details details').count() == 0
                shot('hydreigon-team', width)
                page.locator('[data-meta-set-target="5"]').click()
                assert page.locator('#published-set-5').evaluate('e => e === document.activeElement')
                page.keyboard.press('Escape')
                assert page.locator('.meta-set-card').count() == 0
                assert page.locator(f'[data-meta-open-team="{first_id}"]').evaluate('e => e === document.activeElement')
                tab('moves')
                assert page.locator('.detail-moves .mv-row').count() > 0
                tab('overview')
                assert page.locator('.detail-sim').is_visible()

                open_mon('florges', 'Florges')
                tab('meta')
                assert page.locator('[data-meta-joint]').count() == 0
                assert page.locator('.meta-nature-missing').count() == 2
                assert 'Gentle' in page.locator('[data-meta-category="natures"]').inner_text()
                shot('florges-meta', width)
                tab('builds')
                assert page.locator('[data-build-card]').count() == 3
                assert page.locator('.meta-nature-missing').count() == 3
                page.locator('[data-meta-spread]').first.click()
                assert page.locator('[data-lab-nature]').input_value() == ''
                assert page.locator('[data-pt-num]').evaluate_all('els => els.map(el => Number(el.value))') == [32, 0, 0, 2, 0, 32]
                shot('florges-builds', width)
                print(f'Presentation {width}px passed: section isolation, builds/evidence, Nature absence, sprite browser, focused sets, keyboard and responsive layout', flush=True)
            context.close()
            browser.close()
        assert not errors, errors
        print(f'Presentation screenshots: {output}; live images: {live_images}', flush=True)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-images', action='store_true')
    run(parser.parse_args().live_images)
