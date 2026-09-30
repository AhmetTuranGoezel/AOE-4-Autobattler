"""Offline browser regressions for stable saves, exact-set imports and opponent isolation."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(APP)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}/'
    output = APP / '.tmp-smoke'
    output.mkdir(exist_ok=True)
    errors = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe'), headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(url) else r.abort())
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('dialog', lambda d: d.accept())
            page.goto(url)
            page.locator('#app').wait_for(state='visible')
            member = {'slug': 'steelix', 'moves': [], 'ability': 'sturdy', 'item': 'none', 'picked': True}
            page.evaluate('''records => {
              localStorage.setItem('pc-teams', JSON.stringify(records));
              localStorage.setItem('pc-team-context', JSON.stringify({loadedId:null, name:'Unrelated name'}));
            }''', [{'name': 'Team A', 'members': [member]}, {'id': 'existing-c', 'name': 'Team C', 'members': [member]}])
            page.reload()
            page.locator('[data-tab="team"]').click()

            def stored(key): return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
            records = stored('pc-teams')
            aid = records[0]['id']
            assert aid and records[1]['id'] == 'existing-c'
            page.locator(f'[data-load-team="{aid}"]').click()
            assert page.locator('.team-name').input_value() == 'Team A'
            page.locator('[data-team-item="steelix"]').select_option('metal-coat')
            page.locator('[data-save-team]').click()
            assert len(stored('pc-teams')) == 2
            assert stored('pc-teams')[0]['id'] == aid and stored('pc-teams')[0]['members'][0]['item'] == 'metal-coat'
            page.locator('.team-name').fill('Team B')
            assert page.locator('[data-save-team]').inner_text() == 'Save as new'
            page.locator('[data-save-team]').click()
            assert len(stored('pc-teams')) == 3
            bid = stored('pc-team-context')['loadedId']
            assert bid != aid and stored('pc-team-context')['name'] == 'Team B'
            page.locator('[data-team-item="steelix"]').select_option('muscle-band')
            page.locator('[data-save-team]').click()
            assert len(stored('pc-teams')) == 3 and stored('pc-teams')[-1]['id'] == bid
            assert stored('pc-teams')[0]['members'][0]['item'] == 'metal-coat'
            snapshot = stored('pc-teams')
            page.locator('.team-name').fill('Team C')
            page.locator('[data-save-team]').click()
            assert 'already belongs' in page.locator('.tm-notice').inner_text()
            assert stored('pc-teams') == snapshot
            page.locator('[data-load-team="existing-c"]').click()
            assert page.locator('.team-name').input_value() == 'Team C'
            page.locator(f'[data-load-team="{bid}"]').click()
            page.reload()
            page.locator('[data-tab="team"]').click()
            assert page.locator('.team-name').input_value() == 'Team B'
            assert stored('pc-team-context')['loadedId'] == bid
            page.screenshot(path=str(output / 'team-save-desktop.png'))
            print('Stable ID migration, name population, update, Save As, conflicts and reload passed', flush=True)

            def open_meta(view='meta'):
                if page.locator('#detail [data-close]').is_visible(): page.locator('#detail [data-close]').click()
                page.locator('[data-tab="pokemon"]').click()
                page.locator('#view-table').click()
                page.locator('#search').fill('Gengar')
                page.locator('#results [data-slug="gengar"] .nm-top').click()
                page.locator('#detail [data-form="gengar-mega"]').click()
                page.locator(f'#detail-tab-{view}').click()

            # A transient failure must render its error once, not retain a failed
            # promise forever or trigger an automatic retry loop during rendering.
            team_requests = []
            def transient_teams(route):
                team_requests.append(route.request.url)
                if len(team_requests) == 1:
                    route.fulfill(status=503, body='temporary outage')
                else:
                    route.continue_()
            page.route('**/champions-teams.json', transient_teams)
            before_retry_team = stored('pc-team')
            page.locator('[data-tab="pokemon"]').click()
            page.locator('#view-table').click()
            page.locator('#search').fill('Gengar')
            page.locator('#results [data-slug="gengar"] .nm-top').click()
            page.locator('#detail-tab-teams').click()
            page.get_by_text('Published team snapshot unavailable.', exact=False).wait_for()
            page.wait_for_timeout(300)  # catch an accidental automatic fetch/render loop
            assert len(team_requests) == 1
            page.locator('#detail-tab-moves').click()
            assert page.locator('.detail-moves .mv-row').count() > 0
            page.locator('#detail-tab-builds').click()
            assert page.locator('[data-build-card]').count() > 0
            open_meta('teams')  # close/reopen in the SAME session: second request succeeds
            page.wait_for_function("document.querySelectorAll('[data-meta-open-team]').length > 0")
            assert len(team_requests) == 2
            assert page.get_by_text('Published team snapshot unavailable.', exact=False).count() == 0
            assert stored('pc-team') == before_retry_team and stored('pc-teams') == snapshot
            page.unroute('**/champions-teams.json', transient_teams)
            print('Transient team fetch: failure without retry loop; same-session reopen retries successfully without changing teams', flush=True)
            page.locator('#detail-tab-builds').click()
            assert page.locator('[data-meta-regulation]').input_value() == 'M-C'
            assert page.locator('[data-build-card]').count() == 4
            assert page.locator('.pt-meta').count() == 6
            assert 'share of all allocated points' in page.locator('.lab-meta-note').inner_text()
            page.locator('[data-meta-more="spreads"]').click()
            assert page.locator('[data-build-card]').count() > 4
            page.locator('#detail-tab-meta').click()
            page.locator('[data-meta-more="moves"]').click()
            move_card = page.locator('[data-meta-category="moves"]')
            assert move_card.locator('.use-item').count() == 9
            mc_natures = page.locator('[data-meta-category="natures"] .meta-bars').inner_text()
            page.locator('[data-meta-regulation]').select_option('M-B')
            assert page.locator('[data-meta-category="natures"] .meta-bars').inner_text() != mc_natures
            page.locator('[data-meta-regulation]').select_option('M-C')
            page.locator('#detail-tab-builds').click()
            page.screenshot(path=str(output / 'meta-spreads-desktop.png'))

            # The joint button applies the exact conditional record, not global Nature usage.
            joint = page.locator('[data-meta-joint]').first
            nature = joint.get_attribute('data-meta-nature')
            joint.click()
            assert page.locator('[data-lab-nature]').input_value() == nature
            expected_points = [int(v) for v in page.locator('[data-pt-num]').evaluate_all('els => els.map(e => e.value)')]
            page.locator('[data-lab-to-team]').click()
            applied = next(m for m in stored('pc-team') if m['slug'] == 'gengar-mega')
            assert applied['nature'] == nature and list(applied['spread'].values()) == expected_points
            assert stored('pc-teams') == snapshot, 'Stat Lab only edits working team'
            print('Regulation, existing per-stat display, rows beyond page one and joint Nature application passed', flush=True)

            open_meta('teams')
            # Use an importable featured team with disclosed points.
            source_id = page.evaluate('''async () => {
              const {loadData, loadTournamentTeams} = await import('./src/data.js');
              const {teamsForPokemon, mapTournamentTeam} = await import('./src/meta-model.js');
              const d = await loadData(); await loadTournamentTeams(d);
              return teamsForPokemon(d, d.pokemon.find(m => m.slug === 'gengar-mega')).find(t =>
                t.kind === 'featured' && !mapTournamentTeam(t, d).errors.length && t.members.some(m => m.statsKnown)).id;
            }''')
            page.locator('[data-meta-team-kind="featured"]').click()
            while not page.locator(f'[data-meta-open-team="{source_id}"]').count(): page.locator('[data-meta-more="featured"]').click()
            page.locator(f'[data-meta-open-team="{source_id}"]').click()
            button = page.locator(f'[data-meta-import="{source_id}"]')
            expected = page.evaluate('''async id => {
              const {loadData, loadTournamentTeams} = await import('./src/data.js');
              const {mapTournamentTeam} = await import('./src/meta-model.js');
              const d = await loadData();
              await loadTournamentTeams(d);
              return mapTournamentTeam(d.tournamentTeams.teams.find(t => t.id === id && t.regulation === 'M-C'), d);
            }''', source_id)
            button.click()
            assert stored('pc-team-context') == {'loadedId': None, 'originalName': '', 'name': expected['name']}
            assert page.locator('.team-name').input_value() == expected['name']
            assert stored('pc-team') == expected['members']
            assert stored('pc-teams') == snapshot
            page.screenshot(path=str(output / 'team-import-desktop.png'))
            page.locator('[data-share-working]').click()
            share = page.locator('.tm-share-link').input_value()
            assert '#t=5|' in share
            page.goto(share)
            page.locator('.team-name').wait_for()
            assert page.locator('.team-name').input_value() == expected['name']
            for actual, want in zip(stored('pc-team'), expected['members']):
                for key in ('slug', 'nature', 'spread', 'moves', 'ability', 'item'): assert actual[key] == want[key], (key, actual, want)
            assert stored('pc-teams') == snapshot
            print('Six-slot external import stays unsaved; exact Nature/points/items/moves survive share v5', flush=True)

            before_working, before_context = stored('pc-team'), stored('pc-team-context')
            open_meta('teams')
            page.locator('[data-meta-team-kind="featured"]').click()
            while not page.locator(f'[data-meta-open-team="{source_id}"]').count(): page.locator('[data-meta-more="featured"]').click()
            page.locator(f'[data-meta-open-team="{source_id}"]').click()
            opponent = page.locator(f'[data-meta-opponent="{source_id}"]')
            opponent.click()
            calc = stored('pc-counters-state')
            assert calc['mode'] == 'team' and len(calc['threats']) == 6
            assert page.locator('[data-calcmode="team"]').get_attribute('class') == 'active'
            assert stored('pc-team') == before_working and stored('pc-team-context') == before_context and stored('pc-teams') == snapshot
            for m in expected['members']:
                cfg = calc['opponentSets'][m['slug']]
                assert cfg['spread'] == (m['spread'] or dict.fromkeys(('hp', 'atk', 'def', 'spa', 'spd', 'spe'), 0))
                assert cfg['nature'] == (m['nature'] or 'Serious')
                assert cfg['item'] == m['item'] and cfg['ability'] == m['ability'] and cfg['targetMoves'] == m['moves']
            page.screenshot(path=str(output / 'opponent-import-desktop.png'))
            print('Opponent import preserves exact disclosed builds without changing working/saved teams', flush=True)

            for width, height in ((1440, 1000), (390, 844)):
                page.set_viewport_size({'width': width, 'height': height})
                open_meta()
                page.locator('.meta-builds').scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflow at {width}'
                assert page.locator('#detail').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'Detail overflow at {width}'
                page.screenshot(path=str(output / f'meta-{width}.png'))
            page.locator('#detail [data-close]').click()
            page.locator('[data-tab="team"]').click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(output / 'team-import-mobile.png'))

            # Broken saved storage is preserved, not overwritten by the next Save.
            page.evaluate("localStorage.setItem('pc-teams', '{broken')")
            page.reload()
            page.locator('[data-tab="team"]').click()
            page.locator('[data-save-team]').click()
            assert page.evaluate("localStorage.getItem('pc-teams')") == '{broken'
            assert 'blocked' in page.locator('.tm-notice').inner_text()
            # An unavailable dynamic snapshot never prevents static mechanics from loading.
            page.route('**/champions-meta.json', lambda r: r.fulfill(status=503, body='unavailable'))
            page.goto(url)
            page.locator('#app').wait_for(state='visible')
            open_meta()
            assert 'unavailable' in page.locator('.detail-usage').inner_text().lower()
            page.locator('#detail-tab-moves').click()
            assert page.locator('.detail-moves .mv-row').count() > 0
            context.close()
            browser.close()
        assert not errors, errors
        print('Browser meta regressions passed; desktop/mobile screenshots in .tmp-smoke', flush=True)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == '__main__': run()
