"""Optional, scoped public-page evidence for default-form source slug aliases."""
from pathlib import Path
import json
from meta_source import PublicCache, SOURCE
from inspect_meta_source import embedded_record_map, objects, expand_data

ALIASES = ('basculegion', 'maushold', 'indeedee', 'aegislash', 'floette', 'pyroar',
           'mimikyu', 'meowstic', 'palafin', 'toxtricity', 'lycanroc', 'gourgeist', 'morpeko', 'squawkabilly')

if __name__ == '__main__':
    cache = PublicCache(Path(__file__).parent / '.cache' / 'meta-v1')
    for slug in ALIASES:
        result = cache.get(f'{SOURCE}/pokemon-champions/pokemon/{slug}?regulation=m-c')
        records = embedded_record_map(result['body'])
        objs = list(objects(expand_data(list(records.values()), records)))
        found = [o for o in objs if 'baseStats' in o or ('specialAttack' in o and 'speed' in o)]
        print(slug, json.dumps(found[:3], ensure_ascii=True)[:2300], flush=True)
