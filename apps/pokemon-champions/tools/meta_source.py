"""PokéBase adapter: allowed public pages, embedded data, no private/API requests.

All source-specific selectors and normalization live here. No source UI code is used.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from inspect_meta_source import embedded_record_map, objects, resolve_reference, expand_data
from generate_data import usage_sections

SOURCE = 'https://pokebase.app'
KEYS = {'hp': 'hp', 'attack': 'atk', 'defense': 'def', 'specialAttack': 'spa', 'specialDefense': 'spd', 'speed': 'spe'}
REGULATIONS = ('M-C', 'M-B', 'M-A')
FORM_ALIASES = json.loads(Path(__file__).with_name('meta-form-aliases.json').read_text(encoding='utf-8'))
SOURCE_SLUGS = {local: source for source, local in FORM_ALIASES.items()}


class SourceError(ValueError):
    pass


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', str(value).lower().replace("'", '').replace('’', '')).strip('-')


def points(values):
    if not isinstance(values, dict) or set(values) != set(KEYS):
        raise SourceError('Missing complete six-stat spread')
    if any(type(v) is not int or v < 0 or v > 32 for v in values.values()) or sum(values.values()) > 66:
        raise SourceError('Invalid Champions Stat Points')
    return {dest: values[src] for src, dest in KEYS.items()}


def percent(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not 0 <= value <= 100:
        raise SourceError(f'Invalid percentage: {value!r}')
    return value


class PublicCache:
    def __init__(self, folder, refresh=False, max_age=86400, interval=1):
        self.folder, self.refresh, self.max_age, self.interval = Path(folder), refresh, max_age, interval
        self.rules = None
        self.last_request = 0
        self.seen = {}

    def request(self, url):
        for attempt in range(3):
            time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            req = urllib.request.Request(url, headers={'User-Agent': 'OwlTools-MetaAudit/1.0', 'Cache-Control': 'no-cache'})
            try:
                with urllib.request.urlopen(req, timeout=40) as response:
                    return response.read().decode('utf-8'), dict(response.headers)
            except urllib.error.HTTPError as error:
                if error.code < 500 or attempt == 2:
                    raise  # Including rate limits/access restrictions: stop, do not bypass.
            except urllib.error.URLError:
                if attempt == 2:
                    raise
            time.sleep(2 * (attempt + 1))

    def get(self, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.netloc != 'pokebase.app' or parsed.scheme != 'https':
            raise SourceError('Only the configured public source is allowed')
        if not re.fullmatch(r'/pokemon-champions/(?:pokemon/[a-z0-9-]+|teams)', parsed.path):
            raise SourceError('Only public Pokémon detail and team-list pages are in scope')
        if url in self.seen:
            return self.seen[url]
        key = hashlib.sha256(url.encode()).hexdigest()
        path = self.folder / (key + '.json')
        if not self.refresh and path.exists():
            cached = json.loads(path.read_text(encoding='utf-8'))
            age = time.time() - datetime.fromisoformat(cached['fetchedAt'].replace('Z', '+00:00')).timestamp()
            if 0 <= age < self.max_age:
                self.seen[url] = cached
                return cached
        if self.rules is None:
            body, _ = self.request(SOURCE + '/robots.txt')
            self.rules = urllib.robotparser.RobotFileParser()
            self.rules.parse(body.splitlines())
        if not self.rules.can_fetch('OwlTools-MetaAudit', url):
            raise SourceError(f'Access rules disallow {url}')
        body, headers = self.request(url)  # Fail, never silently fall back to expired data.
        cached = {'url': url, 'fetchedAt': utcnow(), 'sourceUpdatedAt': None,
                  'httpLastModified': headers.get('Last-Modified'), 'httpAge': headers.get('Age'), 'body': body}
        self.folder.mkdir(parents=True, exist_ok=True)
        pending = path.with_suffix('.pending')
        pending.write_text(json.dumps(cached, ensure_ascii=False), encoding='utf-8')
        pending.replace(path)
        self.seen[url] = cached
        return cached


def normalize_preview(entry, regulation, source_url, fetched_at):
    team = entry['team']
    mons = team.get('pokemon')
    if not isinstance(mons, list) or len(mons) != 6:
        raise SourceError(f"Team {team.get('id')} does not contain six Pokémon")
    tournament = 'tournamentName' in entry
    members = []
    for index, mon in enumerate(mons):
        if not mon.get('slug') or len(mon.get('moves', [])) > 4:
            raise SourceError('Malformed team set')
        stats = points(mon['stats']) if mon.get('stats') is not None else None
        # Imported open team sheets commonly contain six default zeroes. They are
        # retained as raw values, but are not evidence of an observed zero spread.
        known = stats is not None and sum(stats.values()) > 0
        canonical = FORM_ALIASES.get(mon['slug'], mon['slug'])
        members.append({'slot': index, 'pokemon': canonical, 'form': canonical, 'sourcePokemon': mon['slug'],
                        'nature': mon.get('nature') or None, 'stats': stats, 'statsKnown': known,
                        'ability': slug(mon['ability']) if mon.get('ability') else None,
                        'item': slug(mon['item']) if mon.get('item') else 'none',
                        'moves': [m['slug'] for m in mon.get('moves', [])],
                        'sourceNames': {'pokemon': mon.get('name'), 'ability': mon.get('ability'), 'item': mon.get('item')}})
    return {'id': 'pokebase:' + team['id'], 'sourceId': team['id'], 'title': team['name'],
            'kind': 'tournament' if tournament else 'featured', 'regulation': regulation,
            'player': team.get('playerDisplayName') or team.get('limitlessPlayer') or entry.get('displayName'),
            'date': entry.get('tournamentDate') or entry.get('dateLabelIso'),
            'event': entry.get('tournamentName'), 'placement': team.get('placing'),
            'record': {k: team.get(k) for k in ('wins', 'losses', 'ties')},
            'source': source_url, 'publishedSource': entry.get('sourceUrl'), 'fetchedAt': fetched_at,
            'sourceUpdatedAt': None, 'members': members}


def parse_pokemon(page, pokemon, regulation, fetched_at, url):
    if regulation not in REGULATIONS:
        raise SourceError('Unknown regulation')
    if re.search(r'<title>Pokémon not found\s*\|', page):
        return {'status': 'not-published', 'source': url, 'fetchedAt': fetched_at}, []
    records = embedded_record_map(page)
    all_objs = list(objects(list(records.values())))
    section = next((o for o in all_objs if o.get('aria-labelledby') == 'champions-pokemon-usage-stats-heading'), None)
    objs = list(objects(expand_data(section, records))) if section else []
    if not records or 'Tournament Stats' not in page:
        empty_section = any(o.get('children', '').startswith('$L') and records.get(o['children'][2:], 'missing') is None
                            for o in all_objs if isinstance(o.get('children'), str)
                            and 'champions-pokemon-usage-stats-skeleton-heading' in str(o.get('fallback', '')))
        # Known explicit empty-state pages are not parser errors.
        if empty_section or re.search(r'No (?:tournament|usage|competitive) (?:data|stats)', page, re.I):
            return {'status': 'empty', 'source': url, 'fetchedAt': fetched_at}, []
        raise SourceError(f'{pokemon}: expected tournament section absent')
    # The source silently falls back to another regulation if this Pokémon has
    # no data for the requested one. The request URL alone proves nothing.
    selected = []
    for attrs, label in re.findall(r'<a\b([^>]*)>(M-[A-Z]+)</a>', page):
        css = re.search(r'class="([^"]*)"', attrs)
        if css and 'bg-zinc-900' in css[1].split() and 'regulation=' in attrs:
            selected.append(label)
    if len(set(selected)) != 1:
        raise SourceError(f'{pokemon}: cannot verify the source-selected regulation')
    actual_regulation = selected[0]
    if actual_regulation != regulation:
        return {'status': 'unavailable-regulation', 'source': url, 'fetchedAt': fetched_at,
                'sourceUpdatedAt': None, 'requestedRegulation': regulation, 'sourceSelectedRegulation': actual_regulation,
                'reason': 'Source silently fell back to another regulation; its aggregates and teams were withheld.'}, []
    result = {'status': 'ok', 'source': url, 'sourcePokemon': SOURCE_SLUGS.get(pokemon, pokemon), 'sourceSelectedRegulation': actual_regulation, 'fetchedAt': fetched_at, 'sourceUpdatedAt': None,
              'spreads': [], 'natures': [], 'items': [], 'moves': [], 'teammates': [], 'abilities': [],
              'teamIds': [], 'excludedTeams': [], 'sampleSize': None,
              'coverage': {'aggregates': 'All rows embedded for client pagination',
                           'teams': 'Public Pokémon-page selections; source may cap each kind at 16. Not the entire tournament archive.'}}
    for obj in objs:
        rows = obj.get('rows')
        if not isinstance(rows, list) or not rows:
            continue
        first = rows[0]
        if not isinstance(first, dict) or 'percent' not in first:
            continue
        if 'values' in first:
            result['spreads'] = [{'stats': points(row['values']), 'percent': percent(row['percent']),
                                   'sourceId': row['id']} for row in rows]
        else:
            category = 'natures' if 'incStat' in first else 'moves' if 'moveTypeName' in first else 'teammates' if 'count' in first else 'items'
            result[category] = [{'id': row.get('slug', row['id']), 'name': row['name'], 'percent': percent(row['percent']),
                                 **({'count': row['count']} if 'count' in row else {}),
                                 **({'plus': KEYS.get(row['incStat']), 'minus': KEYS.get(row['decStat'])} if category == 'natures' else {})} for row in rows]
        
    # Ability percentages are rendered server-side rather than in a rows prop.
    abilities = {}
    ability_section = usage_sections(page).get('abilities', '')
    for key, row in re.findall(r'<a\b[^>]*href="/pokemon-champions/abilities/([^"/?]+)"[^>]*>(.*?)</a>', ability_section, re.S):
        text = html.unescape(re.sub(r'<[^>]*>', '', row)).strip()
        match = re.fullmatch(r'(.*?)([\d.]+)%', text)
        if match:
            abilities[key] = {'id': key, 'name': match[1].strip(), 'percent': percent(float(match[2]))}
    result['abilities'] = sorted(abilities.values(), key=lambda x: -x['percent'])
    if not abilities:
        raise SourceError(f'{pokemon}: expected tournament ability rows missing')
    result['abilityPercentTotal'] = round(sum(row['percent'] for row in abilities.values()), 1)
    if result['abilityPercentTotal'] > 101:
        raise SourceError('Overlapping ability-usage samples')
    allocation = next((o for o in all_objs if 'showcaseStatPercentByKey' in o), None)
    if allocation:
        shares = resolve_reference(allocation['showcaseStatPercentByKey'], records)
        modes = resolve_reference(allocation['showcaseStatModeBonusByKey'], records)
        if not isinstance(shares, dict) or not isinstance(modes, dict) or set(shares) != set(KEYS) or set(modes) != set(KEYS):
            raise SourceError('Incomplete per-stat allocation fields')
        if any(type(v) is not int or not 0 <= v <= 32 for v in modes.values()):
            raise SourceError('Invalid per-stat modal investment')
        # Independent modes need not constitute a legal combined spread.
        result['pointAllocation'] = {dest: [modes[src], percent(shares[src])] for src, dest in KEYS.items()}
    teams = {}
    for obj in objs:
        if 'entries' not in obj or obj.get('highlightPokemonSlug') != SOURCE_SLUGS.get(pokemon, pokemon):
            continue
        for entry in obj['entries']:
            members = entry.get('team', {}).get('pokemon')
            if isinstance(members, list) and len(members) != 6:
                result['excludedTeams'].append({'id': entry['team'].get('id'), 'reason': f'Published entry has {len(members)} Pokémon, not six'})
                continue
            team = normalize_preview(entry, regulation, url, fetched_at)
            teams[team['id']] = team
    result['teamIds'] = list(teams)
    if not any(result[k] for k in ('spreads', 'natures', 'items', 'moves', 'abilities', 'teamIds')):
        raise SourceError(f'{pokemon}: usage section exists but expected structured data is missing')
    if not result['moves']:
        raise SourceError(f'{pokemon}: expected complete move-share rows missing')
    return result, list(teams.values())


def joint_spreads(teams, pokemon):
    """Only real set-level associations; never join unrelated aggregate tables."""
    rows = {}
    seen = set()
    for team in teams:
        for member in team['members']:
            if member['pokemon'] != pokemon or not member.get('statsKnown') or not member.get('nature'):
                continue
            identity = (team['id'], member['slot'])
            if identity in seen:
                continue
            seen.add(identity)
            key = tuple(member['stats'][k] for k in KEYS.values())
            row = rows.setdefault(key, {'stats': member['stats'], 'count': 0, 'natures': Counter(), 'setIds': []})
            row['count'] += 1
            row['natures'][member['nature']] += 1
            row['setIds'].append(f"{team['id']}:{member['slot']}")
    total = len(seen)
    return [{'stats': row['stats'], 'count': row['count'], 'sampleSize': total,
             'percent': round(100 * row['count'] / total, 1), 'setIds': row['setIds'],
             'natures': [{'id': nature, 'count': count, 'percent': round(100 * count / row['count'], 1)}
                         for nature, count in row['natures'].most_common()]}
            for row in sorted(rows.values(), key=lambda row: -row['count'])]
