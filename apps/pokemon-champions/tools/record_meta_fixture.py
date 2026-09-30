"""Extract factual data only from already-cached public pages (never network/UI code)."""
import hashlib
import json
from pathlib import Path
from inspect_meta_source import embedded_record_map, objects, expand_data, resolve_reference
from meta_source import parse_pokemon, SOURCE, FORM_ALIASES
from generate_data import write_json

ROOT = Path(__file__).resolve().parent


def main():
    for reg in ('M-C', 'M-B'):
        url = f'{SOURCE}/pokemon-champions/pokemon/gengar-mega?regulation={reg.lower()}'
        path = ROOT / '.cache' / 'meta-v1' / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        cached = json.loads(path.read_text(encoding='utf-8'))
        records = embedded_record_map(cached['body'])
        all_objs = list(objects(list(records.values())))
        section = next(o for o in all_objs if o.get('aria-labelledby') == 'champions-pokemon-usage-stats-heading')
        data = list(objects(expand_data(section, records)))
        allocation = next(o for o in all_objs if 'showcaseStatPercentByKey' in o)
        parsed, _ = parse_pokemon(cached['body'], 'gengar-mega', reg, cached['fetchedAt'], url)
        fixture = {'source': url, 'fetchedAt': cached['fetchedAt'], 'regulation': reg, 'pokemon': 'gengar-mega',
                   'rows': [o['rows'] for o in data if o.get('rows') and isinstance(o['rows'][0], dict) and 'percent' in o['rows'][0]],
                   'previews': [{k: o[k] for k in ('entries', 'highlightPokemonSlug')} for o in data
                                if 'entries' in o and o.get('highlightPokemonSlug') == 'gengar-mega'],
                   'allocation': {k: resolve_reference(allocation[k], records) for k in
                                  ('showcaseStatPercentByKey', 'showcaseStatModeBonusByKey')},
                   'abilities': parsed['abilities']}
        write_json(str(ROOT / 'fixtures' / f'gengar-mega-{reg.lower()}.json'), fixture, indent=2)
        print(f"Recorded {reg}: {list(map(len, fixture['rows']))} rows; factual data only")
    aliases = []
    for source, local in FORM_ALIASES.items():
        url = f'{SOURCE}/pokemon-champions/pokemon/{source}?regulation=m-c'
        cached = json.loads((ROOT / '.cache' / 'meta-v1' / (hashlib.sha256(url.encode()).hexdigest() + '.json')).read_text(encoding='utf-8'))
        records = embedded_record_map(cached['body'])
        stats = next(o['baseStats'] for o in objects(list(records.values())) if 'baseStats' in o)
        aliases.append({'sourceSlug': source, 'localSlug': local, 'baseStats': stats, 'source': url, 'fetchedAt': cached['fetchedAt']})
    write_json(str(ROOT / 'fixtures' / 'form-aliases.json'), aliases, indent=2)


if __name__ == '__main__':
    main()
