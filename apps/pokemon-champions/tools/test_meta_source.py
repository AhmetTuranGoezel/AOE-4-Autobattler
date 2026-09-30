"""Offline source-adapter, set-association and cache regression tests."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

from inspect_meta_source import embedded_record_map, resolve_reference
from meta_source import PublicCache, SourceError, KEYS, FORM_ALIASES, parse_pokemon, joint_spreads, points, percent
from generate_meta import classify, observed_for

FIXTURES = Path(__file__).parent / 'fixtures'


def fixture(reg='m-c'):
    return json.loads((FIXTURES / f'gengar-mega-{reg}.json').read_text(encoding='utf-8'))


def page(f):
    # Minimal synthetic transport around recorded DATA; no source design or scripts.
    rows = [{'rows': rows} for rows in f['rows']]
    section = {'aria-labelledby': 'champions-pokemon-usage-stats-heading', 'children': rows + f['previews']}
    records = {'1': section, '2': f['allocation'], '3': {'rows': [{'id': 'bad-season', 'name': 'Do not mix', 'percent': 99}]}}
    stream = ''.join(k + ':' + json.dumps(v) + '\n' for k, v in records.items())
    abilities = ''.join(f'<a href="/pokemon-champions/abilities/{a["id"]}">{a["name"]}{a["percent"]}%</a>' for a in f['abilities'])
    return (f'<a href="?regulation={f["regulation"].lower()}" class="bg-zinc-900">{f["regulation"]}</a><h2>Tournament Stats</h2><h3>Abilities</h3>'
            + abilities + '<h3>Items</h3><script>self.__next_f.push(' + json.dumps([1, stream]) + ')</script>')


def parse(f):
    return parse_pokemon(page(f), f['pokemon'], f['regulation'], f['fetchedAt'], f['source'])


class AdapterTests(unittest.TestCase):
    def test_recorded_tables_all_pages_and_provenance(self):
        f = fixture()
        result, teams = parse(f)
        self.assertEqual(result['fetchedAt'], f['fetchedAt'])
        self.assertIsNone(result['sourceUpdatedAt'])
        self.assertGreater(len(result['spreads']), 5)
        self.assertGreater(len(result['moves']), 10)
        self.assertGreater(len(result['natures']), 5)
        self.assertGreater(len(result['teammates']), 5)
        self.assertTrue(all(len(row['stats']) == 6 for row in result['spreads']))
        self.assertTrue(result['items'])
        self.assertNotIn('bad-season', [r['id'] for r in result['items']])
        self.assertEqual(result['abilities'], f['abilities'])
        self.assertEqual(set(result['pointAllocation']), set(KEYS.values()))
        self.assertEqual(result['spreads'][-1]['percent'], next(r for r in f['rows'] if 'values' in r[0])[-1]['percent'])
        self.assertTrue(any(t['kind'] == 'featured' for t in teams))
        self.assertTrue(any(t['kind'] == 'tournament' for t in teams))
        self.assertTrue(all(len(t['members']) == 6 for t in teams))
        self.assertTrue(any(not m['statsKnown'] for t in teams for m in t['members']))
        self.assertTrue(any(m['statsKnown'] and m['nature'] for t in teams for m in t['members']))

    def test_regulations_are_distinct(self):
        a, b = parse(fixture())[0], parse(fixture('m-b'))[0]
        self.assertNotEqual(a['natures'], b['natures'])
        self.assertNotEqual(a['pointAllocation'], b['pointAllocation'])
        self.assertEqual(classify(a, b), 'normal meta update')

    def test_silent_source_regulation_fallback_is_withheld(self):
        f = fixture('m-b')
        result, teams = parse_pokemon(page(f), 'gengar-mega', 'M-C', f['fetchedAt'], 'url?regulation=m-c')
        self.assertEqual(result['status'], 'unavailable-regulation')
        self.assertEqual(result['sourceSelectedRegulation'], 'M-B')
        self.assertNotIn('natures', result)
        self.assertNotIn('pointAllocation', result)
        self.assertEqual(teams, [])

    def test_same_spread_multiple_natures_not_global_inference(self):
        spread = dict(zip(KEYS.values(), (2, 0, 0, 32, 0, 32)))
        def team(id, nature, known=True):
            return {'id': id, 'members': [{'slot': 0, 'pokemon': 'gengar-mega', 'nature': nature, 'stats': spread, 'statsKnown': known}]}
        records = [team('a', 'modest'), team('b', 'timid'), team('c', 'modest'), team('d', 'modest', False)]
        result = joint_spreads(records + [records[0]], 'gengar-mega')
        self.assertEqual(result[0]['count'], 3)  # dedup by team + slot
        self.assertEqual(result[0]['natures'], [{'id': 'modest', 'count': 2, 'percent': 66.7}, {'id': 'timid', 'count': 1, 'percent': 33.3}])
        f = fixture()
        natures = next(r for r in f['rows'] if 'incStat' in r[0])
        natures[0]['percent'] = 1
        parse(f)  # unrelated overall Nature changes never enter joint_spreads
        self.assertEqual(joint_spreads(records, 'gengar-mega'), result)
        self.assertEqual(joint_spreads([], 'gengar-mega'), [])
        self.assertEqual(joint_spreads(records, 'gengar'), [])

    def test_schema_failures_are_not_zero_filled(self):
        f = fixture()
        del f['allocation']['showcaseStatPercentByKey']['hp']
        with self.assertRaises(SourceError): parse(f)
        f = fixture()
        next(r for r in f['rows'] if 'values' in r[0])[0]['values']['hp'] = 99
        with self.assertRaises(SourceError): parse(f)
        f = fixture()
        f['rows'][0][0]['percent'] = 101
        with self.assertRaises(SourceError): parse(f)
        with self.assertRaises(SourceError): parse_pokemon('<h1>Changed schema</h1>', 'gengar', 'M-C', 'date', 'url')
        for value in (-1, 101, '25', None, True, float('nan')):
            with self.assertRaises(SourceError): percent(value)
        with self.assertRaises(SourceError): points({'hp': 0})
        with self.assertRaises(SourceError): points(dict.fromkeys(KEYS, 32))
        f = fixture()
        f['abilities'] = []
        with self.assertRaises(SourceError): parse(f)

    def test_form_aliases_have_recorded_stat_evidence(self):
        static = json.loads((FIXTURES.parent.parent / 'champions-data.json').read_text(encoding='utf-8'))
        mons = {m['slug']: m for m in static['pokemon']}
        for row in json.loads((FIXTURES / 'form-aliases.json').read_text(encoding='utf-8')):
            with self.subTest(form=row['localSlug']):
                self.assertEqual(FORM_ALIASES[row['sourceSlug']], row['localSlug'])
                self.assertEqual({KEYS[k]: v for k, v in row['baseStats'].items()}, mons[row['localSlug']]['stats'])
        self.assertNotIn('floette', FORM_ALIASES, 'Source ordinary Floette stats do not justify mapping to Eternal Floette')

    def test_alias_base_slot_can_supply_real_mega_spread_joint(self):
        spread = dict(zip(KEYS.values(), (2, 0, 0, 32, 0, 32)))
        team = {'id': 'observed', 'members': [{'pokemon': 'pyroar-male', 'sourcePokemon': 'pyroar', 'slot': 0,
                                              'stats': spread, 'statsKnown': True, 'nature': 'timid'}]}
        rows = observed_for('pyroar-mega', [team])
        self.assertEqual(rows[0]['natures'][0]['id'], 'timid')
        self.assertEqual(team['members'][0]['pokemon'], 'pyroar-male', 'Never mutate raw evidence')

    def test_incomplete_published_teams_excluded_with_reason(self):
        f = fixture()
        entry = f['previews'][0]['entries'][0]
        id = 'pokebase:' + entry['team']['id']
        entry['team']['pokemon'].pop()
        result, teams = parse(f)
        self.assertIn(id.removeprefix('pokebase:'), [r['id'] for r in result['excludedTeams']])
        self.assertNotIn(id, [t['id'] for t in teams])

    def test_stream_utf8_text_and_cycles(self):
        raw = 'Text é\n9:fake\n'
        stream = f'1:T{len(raw.encode()):x},' + raw + '2:{"rows":[1,2]}\n'
        source = '<script>self.__next_f.push(' + json.dumps([1, stream]) + ')</script>'
        records = embedded_record_map(source)
        self.assertEqual(records['1'], raw)
        self.assertEqual(records['2']['rows'], [1, 2])
        with self.assertRaises(ValueError): resolve_reference('$1', {'1': '$2', '2': '$1'})


class CacheTests(unittest.TestCase):
    def test_fresh_expired_forced_refresh_and_unavailable(self):
        url = 'https://pokebase.app/pokemon-champions/pokemon/gengar-mega?regulation=m-c'
        def network(url):
            return ('User-agent: *\nAllow: /\nDisallow: /api\n' if url.endswith('robots.txt') else 'new page'), {}
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(PublicCache, 'request', side_effect=network) as request:
                first = PublicCache(folder).get(url)
                self.assertEqual(request.call_count, 2)
                self.assertEqual(PublicCache(folder).get(url), first)
                self.assertEqual(request.call_count, 2)
                PublicCache(folder, refresh=True).get(url)
                self.assertEqual(request.call_count, 4)
                path = Path(folder) / (hashlib.sha256(url.encode()).hexdigest() + '.json')
                stale = deepcopy(first)
                stale['fetchedAt'] = '2000-01-01T00:00:00Z'
                path.write_text(json.dumps(stale), encoding='utf-8')
                PublicCache(folder).get(url)
                self.assertEqual(request.call_count, 6)
                self.assertNotEqual(json.loads(path.read_text())['fetchedAt'], stale['fetchedAt'])
            with patch.object(PublicCache, 'request', side_effect=urllib.error.URLError('offline')):
                with self.assertRaises(urllib.error.URLError): PublicCache(folder, refresh=True).get(url)
            self.assertEqual(json.loads(path.read_text())['body'], 'new page')
            with patch.object(PublicCache, 'request', side_effect=network):
                with self.assertRaises(SourceError): PublicCache(folder).get('https://pokebase.app/api/no-access')


if __name__ == '__main__':
    unittest.main()
