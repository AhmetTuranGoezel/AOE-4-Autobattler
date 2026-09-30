"""Generate independent dynamic snapshots from allowed public PokéBase pages.

Normal tests are offline. Run this command explicitly to contact the live source.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys
import urllib.error
from meta_source import PublicCache, SOURCE, SOURCE_SLUGS, FORM_ALIASES, REGULATIONS, SourceError, parse_pokemon, joint_spreads, utcnow
from generate_data import write_json

APP = Path(__file__).resolve().parent.parent


def observed_for(pokemon, records):
    """Keep actual set identities, including normalized default-form aliases."""
    base = pokemon.split('-mega')[0]
    eligible = []
    for team in records:
        selected = deepcopy(team)
        selected['members'] = [m for m in selected['members'] if m['pokemon'] in (pokemon, base)
                               or m.get('sourcePokemon') in (pokemon, SOURCE_SLUGS.get(pokemon, pokemon), base)]
        for member in selected['members']:
            member['pokemon'] = pokemon
        eligible.append(selected)
    return joint_spreads(eligible, pokemon)


def classify(old, new):
    if new.get('status') not in ('ok', 'empty', 'not-published', 'unavailable-regulation'):
        return 'parser/schema problem'
    if old == new:
        return 'unchanged'
    keys = ('spreads', 'natures', 'items', 'moves', 'teammates', 'abilities', 'pointAllocation')
    if any(old.get(k) != new.get(k) for k in keys):
        return 'normal meta update' if old.get('status') == 'ok' and new.get('status') == 'ok' else 'unexplained discrepancy'
    return 'provenance/team-list update'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--refresh', action='store_true')
    p.add_argument('--regulations', nargs='+', choices=REGULATIONS, default=list(REGULATIONS))
    p.add_argument('--slugs', nargs='+', help='Explicit audit subset; default all locally known source-usage Pokémon')
    p.add_argument('--audit', action='store_true', help='Compare without replacing committed snapshots')
    p.add_argument('--migrate-static', action='store_true', help='Move legacy usage into its own dated snapshot')
    args = p.parse_args()
    static_path, meta_path, teams_path = APP / 'champions-data.json', APP / 'champions-meta.json', APP / 'champions-teams.json'
    static = json.loads(static_path.read_text(encoding='utf-8'))
    previous = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
    known = {m['slug']: m for m in static['pokemon']}
    slugs = args.slugs or [m['slug'] for m in static['pokemon']]
    if not slugs:
        slugs = [m['slug'] for m in static['pokemon']]
    if any(s not in known for s in slugs):
        p.error('Unknown local Pokémon slug')
    cache = PublicCache(APP / 'tools' / '.cache' / 'meta-v1', refresh=args.refresh)
    now = utcnow()
    meta = {'schemaVersion': 1, 'fetchedAt': now, 'sourceUpdatedAt': None, 'source': SOURCE,
            'defaultRegulation': static['meta']['regulation'], 'formAliases': FORM_ALIASES, 'datasets': {}}
    teams = {}
    changes = []
    for reg in args.regulations:
        dataset = {'regulation': reg, 'source': SOURCE, 'fetchedAt': now, 'sourceUpdatedAt': None,
                   'pokemon': {}, 'sampleSize': None, 'scope': 'Source public Pokémon-page aggregates and published team selections',
                   'denominators': {
                       'abilities': 'Source: tournament teams containing this Pokémon; pre-Mega ability selections retained.',
                       'natures': 'Source: tournament and featured community sets with a known nature.',
                       'spreads': 'Source: complete nonzero point spreads, separate from overall nature usage.',
                       'pointAllocation': 'Featured-team allocated points in this stat / allocated points across all six stats. The +number is the modal investment, not its frequency.',
                       'moves': 'Source move-share percentages (not percentage of Pokémon). Source does not publish the denominator count; approximately sums to 100% across move entries.',
                       'teammates': 'Source co-occurring teams / teams containing the selected Pokémon. Base/Mega rows overlap and must not be added.',
                   }}
        for index, pokemon in enumerate(slugs):
            url = f'{SOURCE}/pokemon-champions/pokemon/{SOURCE_SLUGS.get(pokemon, pokemon)}?regulation={reg.lower()}'
            try:
                response = cache.get(url)
                entry, records = parse_pokemon(response['body'], pokemon, reg, response['fetchedAt'], url)
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                entry, records = {'status': 'not-published', 'source': url, 'fetchedAt': utcnow()}, []
            # A page may show a base slot holding its Mega Stone. Membership in the
            # source's exact-form page is retained, rather than inventing a second slot.
            for team in records:
                key = reg + ':' + team['id']
                if key not in teams:
                    teams[key] = team
                else:
                    # Same published team seen on multiple Pokémon pages counts once.
                    if teams[key]['members'] != team['members']:
                        raise SourceError(f'Team changed during refresh: {key}; rerun refresh')
            entry['observedSpreads'] = observed_for(pokemon, records)
            entry['observedSpreadScope'] = 'Only captured, deduplicated published sets with nonzero complete points and a known nature; not the full aggregate sample.'
            dataset['pokemon'][pokemon] = entry
            old = previous.get('datasets', {}).get(reg, {}).get('pokemon', {}).get(pokemon, {})
            change = {'pokemon': pokemon, 'regulation': reg, 'classification': classify(old, entry),
                      'old': {k: old.get(k) for k in ('status', 'sourceSelectedRegulation', 'fetchedAt', 'abilities', 'natures')},
                      'new': {k: entry.get(k) for k in ('status', 'sourceSelectedRegulation', 'fetchedAt', 'abilities', 'natures')}}
            changes.append(change)
            if index % 10 == 0 or index == len(slugs) - 1:
                print(f'{reg} {index+1}/{len(slugs)} {pokemon}: {entry["status"]}, {len(records)} published teams', flush=True)
        dates = [t['date'] for t in teams.values() if t['regulation'] == reg and t['date']]
        dataset['capturedDateRange'] = [min(dates), max(dates)] if dates else None
        dataset['capturedTeamCount'] = sum(t['regulation'] == reg for t in teams.values())
        meta['datasets'][reg] = dataset
    report = {'checkedAt': utcnow(), 'changes': changes}
    write_json(str(APP / 'meta-audit.json'), report, indent=2)
    if args.audit:
        for row in changes:
            print(json.dumps(row, ensure_ascii=True))
        return
    # A subset refresh preserves other datasets/entries with their own original timestamps.
    for reg, old in previous.get('datasets', {}).items():
        if reg not in meta['datasets']:
            meta['datasets'][reg] = old
        elif args.slugs:
            meta['datasets'][reg]['pokemon'] = {**old['pokemon'], **meta['datasets'][reg]['pokemon']}
    if teams_path.exists():
        for team in json.loads(teams_path.read_text(encoding='utf-8')).get('teams', []):
            if team['regulation'] not in args.regulations or args.slugs:
                teams.setdefault(team['regulation'] + ':' + team['id'], team)
    for reg, dataset in meta['datasets'].items():
        relevant_ids = {id for mon in dataset['pokemon'].values() for id in mon.get('teamIds', [])}
        relevant = [t for t in teams.values() if t['regulation'] == reg and t['id'] in relevant_ids]
        dates = [t['date'] for t in relevant if t['date']]
        dataset['capturedDateRange'] = [min(dates), max(dates)] if dates else None
        dataset['capturedTeamCount'] = len(relevant)
    # Retain only records referenced by the final merged snapshot, not orphaned old previews.
    referenced = {reg + ':' + id for reg, ds in meta['datasets'].items() for mon in ds['pokemon'].values() for id in mon.get('teamIds', [])}
    teams = {key: team for key, team in teams.items() if key in referenced}
    # A partial refresh can update a team shared by other Pokémon pages. Rebuild
    # every conditional table from the final raw records, never leave stale joints.
    for reg, dataset in meta['datasets'].items():
        for pokemon, entry in dataset['pokemon'].items():
            records = [teams[reg + ':' + id] for id in entry.get('teamIds', [])]
            entry['observedSpreads'] = observed_for(pokemon, records)
    team_data = {'schemaVersion': 1, 'fetchedAt': now, 'source': SOURCE, 'sourceUpdatedAt': None, 'teams': list(teams.values())}
    # A generation identifier lets the browser reject accidentally mixed deployments.
    meta['generation'] = team_data['generation'] = now
    write_json(str(teams_path), team_data, separators=(',', ':'))
    write_json(str(meta_path), meta, separators=(',', ':'))
    if args.migrate_static:
        legacy = {'schemaVersion': 1, 'fetchedAt': None, 'snapshotGeneratedAt': static['meta']['generated'],
                  'regulation': None, 'source': SOURCE, 'scope': 'Historical unfiltered source pages; not proven current regulation',
                  'pokemon': {m['slug']: {'usage': m.get('usage'), 'usagePct': m.get('usagePct')} for m in static['pokemon']}}
        legacy_path = APP / 'champions-meta-legacy.json'
        if not legacy_path.exists():
            write_json(str(legacy_path), legacy, separators=(',', ':'))
        for mon in static['pokemon']:
            mon.pop('usage', None)
            mon.pop('usagePct', None)
        write_json(str(static_path), static, separators=(',', ':'))
    print(f'Published {len(teams)} deduplicated team/regulation records; no static mechanics refreshed.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        classification = 'parser/schema problem' if isinstance(error, (SourceError, ValueError, KeyError, TypeError)) else 'unexplained discrepancy'
        write_json(str(APP / 'meta-audit.json'), {'checkedAt': utcnow(), 'classification': classification,
                   'error': str(error), 'published': False}, indent=2)
        print(f'META UPDATE FAILED; previous published snapshot not intentionally replaced: {error}', file=sys.stderr)
        sys.exit(1)
