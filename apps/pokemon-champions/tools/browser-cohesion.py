"""Cross-view layout regressions and real-image viewport screenshots.

Uses an isolated browser profile and this app's local snapshots only. Public
image hosts are allowed only with --live-images; no tournament refresh runs.
Artifacts are contained in the app's ignored .tmp-smoke/cohesion directory.
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
    def log_message(self, *args):
        pass


def run(live_images=False):
    data = json.loads((APP / 'champions-data.json').read_text(encoding='utf-8'))
    moves = {move['name']: int(key) for key, move in data['moves'].items()}
    image_hosts = {urlparse(mon.get(key) or '').netloc
                   for mon in data['pokemon'] for key in ('sprite', 'artwork')} - {''}
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(APP)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}/'
    output = APP / '.tmp-smoke' / 'cohesion'
    output.mkdir(parents=True, exist_ok=True)
    errors, screenshots, measurements = [], [], []
    zero = {key: 0 for key in ('hp', 'atk', 'def', 'spa', 'spd', 'spe')}
    build = {'slug': 'steelix', 'ability': 'sturdy', 'item': 'metal-coat',
             'nature': 'adamant', 'spread': {**zero, 'hp': 32, 'atk': 32, 'def': 2},
             'moves': [moves['Heavy Slam'], moves['Earthquake']], 'picked': True}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=os.environ.get('CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
                headless=True, args=['--renderer-process-limit=2'])
            for width, height in ((1440, 1000), (390, 844)):
                context = browser.new_context(viewport={'width': width, 'height': height})
                context.set_default_timeout(15000)
                context.route('**/*', lambda request: request.continue_() if request.request.url.startswith(url) or (
                    live_images and request.request.resource_type == 'image'
                    and urlparse(request.request.url).netloc in image_hosts
                ) else request.abort())
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('dialog', lambda dialog: dialog.accept())

                def tab(name):
                    page.locator(f'[data-tab="{name}"]').click()
                    page.evaluate('window.scrollTo(0, 0)')

                def fresh(state=None, team=None):
                    page.goto(url)
                    page.locator('#app').wait_for(state='visible')
                    page.evaluate('''({state, team}) => {
                      localStorage.clear();
                      if (state) localStorage.setItem('pc-counters-state', JSON.stringify(state));
                      if (team) localStorage.setItem('pc-team', JSON.stringify(team));
                    }''', {'state': state, 'team': team})
                    page.reload()
                    page.locator('#app').wait_for(state='visible')
                    page.locator('#results [data-slug]').first.wait_for(state='visible')

                def visible_in_viewport(locator, name):
                    locator.first.wait_for(state='visible')
                    box = locator.first.bounding_box()
                    print(f'{width}px {name}: {box}', flush=True)
                    if not box or box['y'] < 0 or box['y'] + box['height'] > height + 1:
                        page.screenshot(path=str(output / f'failure-{name.lower().replace(" ", "-")}-{width}.png'))
                        sections = page.evaluate('''() => [...document.querySelectorAll('.calc-head,.calc-custom,.cl-pick,.cl-target,.calc-context-grid,.calc-results-toolbar,.calc-result-search,.ehp-summary')]
                          .filter(el => el.getClientRects().length).map(el => {
                            const rect = el.getBoundingClientRect();
                            return {selector: el.id || el.className, y: Math.round(rect.y), height: Math.round(rect.height)};
                          })''')
                        print('Layout sections:', sections, flush=True)
                    assert box and box['y'] >= 0 and box['y'] + box['height'] <= height + 1, (name, box, height)
                    measurements.append(f'{width}px {name}: bottom={round(box["y"] + box["height"])}')

                def shot(name, image_selector=None):
                    page.evaluate('''() => {
                      window.scrollTo(0, 0);
                      for (const overlay of document.querySelectorAll('.detail.open,.popup.open')) overlay.scrollTop = 0;
                      for (const img of document.images) {
                        const rect = img.getBoundingClientRect();
                        if (rect.bottom > 0 && rect.top < innerHeight) img.loading = 'eager';
                      }
                    }''')
                    if live_images:
                        page.wait_for_function('''() => [...document.images].filter(img => {
                          const r = img.getBoundingClientRect();
                          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
                        }).every(img => img.complete)''', timeout=45000)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), name
                    for overlay in ('#detail', '#compare', '#popup', '#sync'):
                        if page.locator(overlay).evaluate("el => el.classList.contains('open')"):
                            assert page.locator(overlay).evaluate('el => el.scrollWidth <= el.clientWidth + 1'), (name, overlay)
                    if live_images and image_selector:
                        image_state = page.locator(image_selector).evaluate_all('''imgs => {
                          const visible = imgs.filter(img => {
                            const r = img.getBoundingClientRect();
                            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
                          });
                          return {count: visible.length, loaded: visible.filter(i => i.naturalWidth > 0).length,
                            failed: visible.filter(i => !i.naturalWidth).map(i => i.src)};
                        }''')
                        assert image_state['count'] > 0 and image_state['loaded'] == image_state['count'], (name, 'all visible primary images required', image_state)
                    filename = output / f'{name}-{width}.png'
                    page.screenshot(path=str(filename))
                    screenshots.append(str(filename.relative_to(APP)))

                def open_mon(slug, name):
                    if page.locator('#detail').evaluate("el => el.classList.contains('open')"):
                        page.locator('#detail [data-close]').click()
                    tab('pokemon')
                    page.locator('#view-table').click()
                    page.locator('#search').fill(name)
                    page.locator(f'#results [data-slug="{slug}"] .nm-top').click()

                # Roster, compact Overview, and a source without captured Nature.
                fresh()
                shot('pokemon-roster', '#results img')
                for slug, name in (('hydreigon', 'Hydreigon'), ('florges', 'Florges')):
                    open_mon(slug, name)
                    assert page.locator('.detail-tabs [role="tab"]').count() == 3
                    assert page.locator('#detail-tab-overview').get_attribute('aria-selected') == 'true'
                    stats = page.locator('.stat-summary-row')
                    assert stats.count() == 6
                    visible_in_viewport(stats.last, f'{name} Overview six stats')
                    shot(f'{slug}-overview', '#detail .detail-art')
                    page.locator('#detail-tab-meta').click()
                    assert page.locator('.meta-category-grid .meta-category').count() == 4
                    assert page.locator('.meta-teammate img').count() > 0
                    shot(f'{slug}-meta', '#detail img')
                    if slug == 'hydreigon':
                        regulation = page.locator('[data-meta-regulation]').input_value()
                        page.locator('[data-meta-browse-teams]').click()
                        page.locator('[data-meta-open-team]').first.wait_for(state='visible')
                        page.locator('[data-meta-team-kind="tournament"]').click()
                        assert page.locator('.meta-set-card').count() == 0
                        assert page.locator('[data-team-card] .meta-lineup img').count() == 36
                        shot('meta-team-browser', '[data-team-card] img')
                        source_id = page.evaluate('''async regulation => {
                          const [snapshot, meta] = await Promise.all(['champions-teams.json', 'champions-meta.json'].map(async file => (await fetch('./' + file)).json()));
                          const captured = new Set(meta.datasets[regulation].pokemon.hydreigon.teamIds);
                          return snapshot.teams.find(team => captured.has(team.id)
                            && team.members.some(set => set.form === 'floette')).id;
                        }''', regulation)
                        while not page.locator(f'[data-meta-open-team="{source_id}"]').count():
                            page.locator('[data-meta-more="tournament"]').click()
                        page.locator(f'[data-meta-open-team="{source_id}"]').click()
                        assert page.locator('.meta-set-card').count() == 6
                        assert 'Unknown Pokémon/form slug: floette' in page.locator('.meta-import-problems').inner_text()
                        assert page.locator('[data-meta-import]').is_disabled()
                        assert page.locator('[data-meta-opponent]').is_disabled()
                        shot('meta-team-mapping-error', '.meta-lineup img[src$="/670.png"]')
                        page.keyboard.press('Escape')
                        page.locator('[data-meta-dashboard]').click()
                    page.locator('#detail-tab-moves').click()
                    assert page.locator('.detail-moves .mv-row').count() > 0
                    shot(f'{slug}-moves', '#detail .detail-art')
                page.locator('#detail [data-close]').click()

                # Browse and Best users keep their target assumptions independent.
                tab('moves')
                page.locator('.mv-mon').fill('Steelix')
                page.locator('.mv-mon').press('Enter')
                chip = page.locator('.mon-chip')
                assert chip.locator('.mon-cfg-badge').is_visible()
                summary = chip.locator('.mon-cfg-badge').inner_text()
                assert 'Auto Nature' in summary and 'Max stats' in summary, summary
                assert chip.locator('.mv-current-stats').count() == 0
                page.locator('.mv-tw').fill('20')
                page.locator('.mv-tw').dispatch_event('change')
                assert page.locator('.mv-tw').is_visible() and not page.locator('.mvr-tw').is_visible()
                visible_in_viewport(page.locator('#moves-results tbody tr[data-move]').first, 'Moves Browse first result')
                shot('moves-browse-steelix', '.mon-chip img')
                page.locator('[data-mon-cfg="steelix"]').click()
                editor_summary = page.locator('.mv-cfg-pop .mv-cfg-head small').inner_text()
                for stat in ('Atk', 'SpA', 'Def', 'Spe'):
                    assert stat in editor_summary, editor_summary
                assert 'on' in (page.locator('.mv-cfg-pop [data-cfg-nature="auto"]').get_attribute('class') or '')
                for stat in ('atk', 'spa', 'def', 'spe'):
                    assert page.locator(f'.mv-cfg-pop [data-cfg-slider="{stat}"]').input_value() == '32'
                shot('moves-browse-editor', '.mv-cfg-pop img')
                page.locator('[data-cfg-close]').click()
                page.locator('[data-mvmode="rank"]').click()
                assert page.locator('.mvr-tw').is_visible() and not page.locator('.mv-tw').is_visible()
                page.locator('.mvr-tw').fill('80')
                page.locator('.mvr-tw').dispatch_event('change')
                preset = page.locator('.mvr-preset')
                assert 'Auto Nature' in preset.inner_text() and 'Max stats' in preset.inner_text()
                page.locator('[data-preset-toggle]').click()
                assert 'on' in (preset.locator('[data-cfg-nature="auto"]').get_attribute('class') or '')
                for stat in ('atk', 'spa', 'def', 'spe'):
                    assert preset.locator(f'[data-cfg-slider="{stat}"]').input_value() == '32'
                page.locator('[data-preset-toggle]').click()
                visible_in_viewport(page.locator('.mvr-row').first, 'Best users first result')
                shot('moves-best-users', '.mvr-row img')
                page.locator('[data-mvmode="browse"]').click()
                assert page.locator('.mv-tw').input_value() == '20'
                page.locator('[data-mvmode="rank"]').click()
                assert page.locator('.mvr-tw').input_value() == '80'

                # Keyboard-accessible ability detail and its focus-return path.
                tab('abilities')
                shot('abilities', '.ability-card img')
                ability = page.locator('.ability-card').first
                ability.focus()
                page.keyboard.press('Enter')
                assert page.locator('#popup').evaluate("el => el.classList.contains('open')")
                assert page.locator('#popup').evaluate('el => el.contains(document.activeElement)')
                shot('ability-popup', '#popup img')
                page.keyboard.press('Escape')
                assert ability.evaluate('el => el === document.activeElement')

                # Empty Damage modes still communicate subject selection/results.
                fresh()
                tab('calc')
                assert page.locator('.ehp-target-input').is_visible()
                shot('damage-empty-all-vs-one')
                page.locator('[data-calcmode="rev"]').click()
                assert page.locator('.rev-atk-input').is_visible()
                shot('damage-empty-one-vs-all')
                page.locator('[data-calcmode="team"]').click()
                assert page.locator('[data-goto-team]').first.is_visible()
                shot('damage-empty-team-check')

                # Counter settings and return attacks remain distinct from field/results.
                fresh({'mode': 'ehp', 'targets': [{'slug': 'floette-mega', 'spread': zero, 'nature': 'Serious',
                       'ability': None, 'item': 'none', 'targetMoves': [moves['Moonblast']]}],
                       'atkInvest': 0, 'atkNature': 'Serious', 'useAccuracy': False, 'doubles': False})
                tab('calc')
                assert page.locator('.cl-target .calc-current-stats dd').count() == 6
                assert page.locator('.cl-target .calc-field,.cl-target .calc-assumptions,.cl-target .calc-results-toolbar').count() == 0
                visible_in_viewport(page.locator('#ehp-results .ehp-row').first, 'All vs one first result')
                shot('damage-all-vs-one', '.cl-target img')
                page.locator('.ehp-atk-search').fill('steelix')
                page.locator('.ehp-tmove-input').fill('Moonblast')
                page.locator('.ehp-tmove-input').press('Enter')
                assert page.locator('.ehp-tmove-input').evaluate('el => el === document.activeElement'), 'Return attack autocomplete retains focus after rerender'
                assert page.locator('.ehp-atk-search').input_value() == 'steelix', 'Attacker search survives subject rerenders'
                edit = page.locator('[data-calc-editor="target-0"]')
                assert not edit.evaluate('el => el.open')
                edit.locator(':scope > summary').click()
                page.locator('[data-ebstep="spread.hp"][data-dir="1"]').click()
                assert page.locator('[data-ebstep="spread.hp"][data-dir="1"]').evaluate('el => el === document.activeElement'), 'Point step retains keyboard focus'
                assert edit.evaluate('el => el.open'), 'Editing must stay open across rerenders'
                values = page.locator('.calc-current-stats dd').all_text_contents()
                edit.locator(':scope > summary').click()
                assert page.locator('.calc-current-stats dd').all_text_contents() == values
                assert page.locator('[data-ebsel="nature"]').is_visible()
                assert page.locator('[data-ebsel="item"]').is_visible()
                page.locator('[data-ebsel="nature"]').focus()
                page.locator('[data-ebsel="nature"]').select_option('Bold')
                assert page.locator('[data-ebsel="nature"]').evaluate('el => el === document.activeElement'), 'Target Nature remains focused after change'
                shot('damage-target-edited-collapsed', '.cl-target img')
                field = page.locator('[data-calc-editor="field"]')
                if not field.evaluate('el => el.open'):
                    field.locator(':scope > summary').click()
                page.locator('[data-ebsel="weather"]').focus()
                page.locator('[data-ebsel="weather"]').select_option('rain')
                assert page.locator('[data-ebsel="weather"]').evaluate('el => el === document.activeElement'), 'Weather change preserves focus'
                page.locator('[data-ebsel="screen"]').select_option('reflect')
                field.locator(':scope > summary').click()
                field_values = page.locator('.calc-field').inner_text()
                assert all(value in field_values for value in ('Rain', 'Reflect', '1v1', 'healthy', 'raw')), field_values
                assumptions = page.locator('[data-calc-editor="attackers"]')
                if not assumptions.evaluate('el => el.open'):
                    assumptions.locator(':scope > summary').click()
                page.locator('[data-atkinvest="16"]').click()
                assumptions.locator(':scope > summary').click()
                assert '16 points' in page.locator('.calc-assumptions').inner_text()
                assert page.locator('.ehp-atk-search').input_value() == 'steelix'
                shot('damage-field-and-roster-collapsed', '.cl-target img')

                # Original reported Steelix matchup, zero-investment baseline.
                fresh({'mode': 'rev', 'revSlug': 'steelix', 'revBasis': 'base', 'revPinned': ['floette-mega'],
                       'useAccuracy': False, 'doubles': False,
                       'revCfg': {'ability': None, 'invest': 0, 'nature': 'Serious', 'item': 'none',
                                  'boost': 0, 'speed': 'base', 'stages': {}, 'movepool': 'all',
                                  'moveset': [moves['Heavy Slam']], 'custom': []}})
                tab('calc')
                row = page.locator('#rev-results .ehp-row[data-open="floette-mega"]')
                assert row.locator('.ehp-pct').inner_text().replace('–', '-') == '60-72%'
                visible_in_viewport(row, 'One vs all first pinned result')
                shot('damage-steelix-floette-neutral', '.cl-target img')
                page.locator('.rev-def-search').fill('floette')
                page.locator('.rev-move-input').fill('Earthquake')
                page.locator('.rev-move-input').press('Enter')
                assert page.locator('.rev-move-input').evaluate('el => el === document.activeElement'), 'Attacker move autocomplete retains focus after rerender'
                assert page.locator('.rev-def-search').input_value() == 'floette', 'Defender search survives subject rerenders'
                edit = page.locator('[data-calc-editor="attacker-build"]')
                edit.locator(':scope > summary').click()
                page.locator('[data-revstage="atk"][data-dir="1"]').click()
                assert page.locator('[data-revstage="atk"][data-dir="1"]').evaluate('el => el === document.activeElement'), 'Attack stage step retains keyboard focus'
                assert edit.evaluate('el => el.open')
                values = page.locator('.calc-current-stats dd').all_text_contents()
                edit.locator(':scope > summary').click()
                assert page.locator('.calc-current-stats dd').all_text_contents() == values
                assert page.locator('.cl-tmoves').is_visible()
                assert page.locator('[data-revsel="nature"]').is_visible()
                assert page.locator('[data-revsel="item"]').is_visible()
                shot('damage-attacker-edited-collapsed', '.cl-target img')

                # Empty and populated Team, then imported and edited point disclosure.
                fresh()
                tab('team')
                assert page.locator('.team-add').is_visible()
                shot('team-empty')
                fresh(team=[build])
                tab('team')
                member = page.locator('.team-member').first
                visible_in_viewport(member.locator('.tm-current-stats'), 'Team first member current stats')
                stats = member.locator('[data-team-stat-value]')
                assert stats.count() == 6
                before = stats.all_text_contents()
                editor = member.locator('.tm-build')
                assert not editor.evaluate('el => el.open'), 'Imported spread starts compact'
                assert member.locator('[data-team-nature]').input_value() == 'adamant'
                assert member.locator('[data-team-item]').input_value() == 'metal-coat'
                assert member.locator('.tm-move').count() == 2
                shot('team-imported-collapsed', '.team-member img')
                editor.locator(':scope > summary').click()
                member.locator('[data-team-stat="hp"]').fill('31')
                member.locator('[data-team-stat="hp"]').focus()
                member.locator('[data-team-stat="hp"]').dispatch_event('change')
                point_focus = member.locator('[data-team-stat="hp"]').evaluate('''el => ({
                  focused: el === document.activeElement,
                  active: document.activeElement?.outerHTML?.slice(0, 500),
                  visible: el.getClientRects().length > 0,
                  buildOpen: el.closest('.tm-build')?.open
                })''')
                assert point_focus['focused'], ('Team points retain focus after recalculation', point_focus)
                assert editor.evaluate('el => el.open'), 'Point editing must survive live rerender'
                edited_values = stats.all_text_contents()
                assert edited_values != before
                shot('team-point-editor', '.team-member img')
                editor.locator(':scope > summary').click()
                assert stats.all_text_contents() == edited_values
                member.locator('[data-team-nature]').focus()
                member.locator('[data-team-nature]').select_option('impish')
                assert member.locator('[data-team-nature]').evaluate('el => el === document.activeElement'), 'Team Nature remains focused after change'
                assert not editor.evaluate('el => el.open')
                assert stats.all_text_contents() != before
                for selector in ('.tm-current-stats', '.tm-nature', '.tm-abil', '.tm-moves'):
                    assert member.locator(selector).first.is_visible(), selector
                shot('team-edited-collapsed', '.team-member img')

                # Scope and opponent disclosure are separate from the saved team.
                fresh({'mode': 'team', 'threats': ['slowbro'], 'revBasis': 'base',
                       'opponentTitle': 'Published test team', 'opponentNotes': [
                           'Slowbro: Stat Points undisclosed; no exact spread was imported.',
                           'Slowbro: retained pre-Mega regenerator; battle calculations use shell-armor.']}, [build])
                tab('calc')
                assert 'Battle selection (1/4)' in page.locator('.calc-team-scope').inner_text()
                assert '1 sets have undisclosed points' in page.locator('.calc-opponent-assumptions').inner_text()
                assert page.locator('.calc-opponent-assumptions .meta-import-problems').count() == 0
                assert page.locator('.tc-matrix').is_visible()
                shot('damage-team-check', '.tc-matrix img')
                fresh({'mode': 'team', 'threats': ['slowbro'], 'revBasis': 'base'}, [{**build, 'picked': False}])
                tab('calc')
                assert 'Full team fallback (1)' in page.locator('.calc-team-scope').inner_text()
                shot('damage-team-full-fallback', '.tc-matrix img')

                # Independent coverage peer lookups precede next-type recommendations.
                tab('coverage')
                assert page.locator('.cov-core-grid > .cov-section').count() == 2
                page.locator('[data-cov-atk="steel"]').click()
                page.locator('[data-cov-def="fairy"]').click()
                peers = page.locator('.cov-core-grid').bounding_box()
                assert page.locator('.cov-next').bounding_box()['y'] >= peers['y'] + peers['height'] - 1
                shot('coverage-peers')

                # Compare keeps numeric values first on mobile and scrolling contained.
                tab('pokemon')
                page.locator('#view-table').click()
                for slug, name in (('steelix', 'Steelix'), ('hydreigon', 'Hydreigon')):
                    page.locator('#search').fill(name)
                    page.locator(f'#results [data-cmp="{slug}"]').click()
                page.locator('[data-cmp-open]').click()
                table = page.locator('.compare-grid table').first
                assert table.is_visible()
                if width == 390:
                    assert table.bounding_box()['y'] < page.locator('.compare-radar').bounding_box()['y']
                shot('compare-numbers', '#compare img')
                page.locator('[data-close-compare]').click()
                page.locator('#btn-sync').click()
                assert page.locator('#sync').evaluate('el => el.contains(document.activeElement)')
                shot('sync-dialog')
                page.keyboard.press('Escape')
                assert page.locator('#btn-sync').evaluate('el => el === document.activeElement')
                if width == 390:
                    page.locator('#btn-filters').click()
                    assert page.locator('#filters').evaluate("el => el.classList.contains('open')")
                    page.locator('#btn-sync').evaluate('el => el.click()')
                    page.keyboard.press('Escape')
                    assert not page.locator('#sync').evaluate("el => el.classList.contains('open')")
                    assert page.locator('#filters').evaluate("el => el.classList.contains('open')"), 'Sync Escape leaves the underlying drawer open'
                    page.locator('#filters-close').click()
                context.close()
            browser.close()
        assert not errors, errors
        print('\n'.join(measurements), flush=True)
        print(f'Cohesion browser checks passed: {len(screenshots)} screenshots; real images {"enabled" if live_images else "disabled"}.', flush=True)
    finally:
        if errors:
            print('Browser page errors:', errors, flush=True)
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live-images', action='store_true')
    run(parser.parse_args().live_images)
