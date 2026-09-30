"""Optional public-page inspection. Never requests PokéBase's disallowed /api routes."""
import argparse
import json
from pathlib import Path
import re
import urllib.request
import urllib.robotparser


def embedded_record_map(page):
    chunks = []
    for match in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>', page, re.S):
        value = json.loads(match[1])
        if len(value) == 2 and value[0] == 1 and isinstance(value[1], str):
            chunks.append(value[1])
    records = {}
    stream = ''.join(chunks).encode('utf-8')
    pos = 0
    while pos < len(stream):
        match = re.match(rb'([0-9a-f]*):', stream[pos:])
        if not match:
            raise ValueError(f'Unexpected embedded record framing at {pos}: {stream[pos:pos+80]!r}')
        pos += match.end()
        key = match[1].decode()
        text = re.match(rb'T([0-9a-f]+),', stream[pos:])
        if text:
            start = pos + text.end()
            pos = start + int(text[1], 16)
            records[key] = stream[start:pos].decode('utf-8')
            continue  # Length-prefixed UTF-8 text can contain newlines and fake record IDs.
        end = stream.find(b'\n', pos)
        if end < 0:
            raise ValueError('Incomplete embedded data stream')
        line = stream[pos:end].decode('utf-8')
        pos = end + 1
        try:
            records[key] = json.loads(line)
        except json.JSONDecodeError:
            pass  # Next module references / text records, not data objects.
    return records


def embedded_records(page):
    return list(embedded_record_map(page).values())


def resolve_reference(value, records, active=frozenset()):
    if not isinstance(value, str) or not re.match(r'^\$[0-9a-f]+(?::|$)', value):
        return value
    if value in active:
        raise ValueError('Cyclic embedded data reference')
    active = active | {value}
    parts = value[1:].split(':')
    result = records[parts[0]]
    for part in parts[1:]:
        result = resolve_reference(result, records, active)
        result = result[3] if part == 'props' and isinstance(result, list) else result[int(part)] if isinstance(result, list) else result[part]
    return resolve_reference(result, records, active)


def expand_data(value, records, active=frozenset()):
    if isinstance(value, str) and re.match(r'^\$(?:L)?[0-9a-f]+(?::|$)', value):
        reference = '$' + value[2:] if value.startswith('$L') else value
        if reference[1:].split(':')[0] not in records:
            return value  # Client component module, not a data record.
        if reference in active:
            raise ValueError('Cyclic embedded data reference')
        return expand_data(resolve_reference(reference, records), records, active | {reference})
    if isinstance(value, list):
        return [expand_data(v, records, active) for v in value]
    if isinstance(value, dict):
        return {k: expand_data(v, records, active) for k, v in value.items()}
    return value


def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='https://pokebase.app/pokemon-champions/pokemon/gengar-mega?regulation=m-c')
    parser.add_argument('--cached', action='store_true')
    parser.add_argument('--brief', action='store_true')
    args = parser.parse_args()
    folder = Path(__file__).parent / '.cache' / 'meta-inspection'
    path = folder / (re.sub(r'[^a-zA-Z0-9-]', '_', args.url.split('pokebase.app/')[-1]) + '.html')
    if args.cached:
        page = path.read_text(encoding='utf-8')
    else:
        def read(url):
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'OwlTools-MetaAudit/1.0'}), timeout=40).read().decode('utf-8')
        robots = read('https://pokebase.app/robots.txt')
        rules = urllib.robotparser.RobotFileParser()
        rules.parse(robots.splitlines())
        if not rules.can_fetch('OwlTools-MetaAudit', args.url):
            raise RuntimeError('Robots rules do not permit this URL')
        page = read(args.url)
        folder.mkdir(parents=True, exist_ok=True)
        path.write_text(page, encoding='utf-8')
        print('ROBOTS', robots)
    print('CACHED', path)
    records = embedded_records(page)
    print('STRUCTURED RECORDS', len(records))
    seen = set()
    for obj in objects(records):
        if args.brief and not any(k in obj for k in ('rows', 'entries', 'team', 'initialTeam', 'initialData', 'showcaseStatPercentByKey', 'totalTeams', 'totalDocs')):
            continue
        if tuple(obj) in seen:
            continue
        seen.add(tuple(obj))
        print(json.dumps({k: ('list:' + str(len(v))) if isinstance(v, list) else ('dict:' + str(list(v))) if isinstance(v, dict) else v for k, v in obj.items()}, ensure_ascii=True)[:2400])
    print('CHUNKS', sorted(set(re.findall(r'(?:_next/)?static/[^"\\\s]+\.js', page))))
    print('LINKS', sorted(set(re.findall(r'href="([^"]*(?:terms|privacy|regulation)[^"]*)"', page))))
    print('TEAM LINKS', sorted(set(re.findall(r'href="([^" ]*/teams/[^" ]+)"', page)))[:30])
    print('NOTES', sorted(set(re.findall(r'(?:title|aria-label)="([^"<>]*(?:usage|percent|team|stat points|move slot)[^"<>]*)"', page)))[:40])


if __name__ == '__main__':
    main()
