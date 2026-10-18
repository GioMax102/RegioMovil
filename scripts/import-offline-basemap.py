#!/usr/bin/env python3
"""Build a compact, attributed ZMM basemap from an explicit Overpass JSON extract.

Fetch the query documented in src/data/monterrey-map.md, then pass that JSON file.
No network request runs during the app build or map display.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = [-100.9, 25.35, -99.8, 26.1]
FACTOR = math.cos(math.radians(25.7))
UNITS = 100_000
TOLERANCE = 15  # approximately 17 m on the ground, map is contextual rather than navigation


def project(point):
    return ((point['lon'] - BOUNDS[0]) * UNITS * FACTOR,
            (BOUNDS[3] - point['lat']) * UNITS)


def simplify(points):
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = dx * dx + dy * dy
    furthest, distance = 0, 0
    for index, point in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) if length else 0
        candidate = math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy)
        if candidate > distance:
            furthest, distance = index, candidate
    if distance > TOLERANCE:
        return simplify(points[:furthest + 1])[:-1] + simplify(points[furthest:])
    return [start, end]


def path(points, polygon=False):
    points = [(round(x), round(y)) for x, y in simplify(points)]
    compact = [point for i, point in enumerate(points) if i == 0 or point != points[i - 1]]
    if len(compact) < 2:
        return ''
    result = f'M{compact[0][0]} {compact[0][1]}l'
    result += ' '.join(f'{b[0]-a[0]} {b[1]-a[1]}' for a, b in zip(compact, compact[1:]))
    return result + ('Z' if polygon else '')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Overpass out tags geom JSON file')
    parser.add_argument('--places', type=Path, help='Optional Overpass city/town nodes JSON file')
    args = parser.parse_args()
    raw = args.source.read_bytes()
    data = json.loads(raw)
    places_raw = args.places.read_bytes() if args.places else None
    place_data = json.loads(places_raw) if places_raw else None
    labels = []
    if place_data:
        relevant = {'Monterrey', 'San Nicolás de los Garza', 'Guadalupe', 'San Pedro Garza García',
                    'Santa Catarina', 'García', 'Apodaca', 'General Escobedo', 'Benito Juárez',
                    'Santiago', 'Salinas Victoria', 'Ciénega de Flores', 'General Zuazua',
                    'Pesquería', 'Carmen'}
        for element in place_data['elements']:
            name = element.get('tags', {}).get('name')
            if name in relevant and 'lon' in element and 'lat' in element:
                labels.append({'name': name, 'lng': element['lon'], 'lat': element['lat'],
                               'sourceId': f'node/{element["id"]}'})
    groups = collections.defaultdict(list)
    counts = collections.Counter()
    for element in data['elements']:
        geometry = element.get('geometry', [])
        if len(geometry) < 2:
            continue
        tags = element.get('tags', {})
        points = [project(point) for point in geometry if math.isfinite(point['lon']) and math.isfinite(point['lat'])]
        if len(points) < 2:
            continue
        kind = tags.get('highway') or tags.get('waterway') or tags.get('leisure') or tags.get('natural')
        polygon = kind in ('park', 'water') and points[0] == points[-1]
        if polygon:
            # Omit tiny areas to keep the offline asset legible and small.
            area = abs(sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(points, points[1:]))) / 2
            if area < 4000:
                continue
        if kind not in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'river', 'stream', 'park', 'water'):
            continue
        segment = path(points, polygon)
        if segment:
            groups[kind].append(segment)
            counts[kind] += 1
    width = round((BOUNDS[2] - BOUNDS[0]) * UNITS * FACTOR)
    height = round((BOUNDS[3] - BOUNDS[1]) * UNITS)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
           '<title>Área Metropolitana de Monterrey — © OpenStreetMap contributors, ODbL 1.0</title>',
           f'<rect width="{width}" height="{height}" fill="#edf3ee"/>']
    styles = [
        ('park', 'fill="#d8e6d0"'), ('water', 'fill="#c4ddd9"'),
        ('stream', 'fill="none" stroke="#c4ddd9" stroke-width="24"'),
        ('river', 'fill="none" stroke="#b7d6d2" stroke-width="75"'),
        ('tertiary', 'fill="none" stroke="#d9dfd6" stroke-width="28"'),
        ('secondary', 'fill="none" stroke="#d0d8ce" stroke-width="40"'),
        ('primary', 'fill="none" stroke="#d0c7ac" stroke-width="55"'),
        ('trunk', 'fill="none" stroke="#d7c69c" stroke-width="68"'),
        ('motorway', 'fill="none" stroke="#c8b27f" stroke-width="75"'),
    ]
    for kind, style in styles:
        svg.append(f'<path {style} stroke-linecap="round" stroke-linejoin="round" d="{"".join(groups[kind])}"/>')
    svg.append('</svg>\n')
    encoded = ''.join(svg).encode()
    if len(encoded) > 1_048_576:
        raise ValueError('Offline map exceeds the 1 MiB asset budget')
    (ROOT / 'src/assets/monterrey-map.svg').write_bytes(encoded)
    metadata = {
        'source': '© OpenStreetMap contributors',
        'copyrightUrl': 'https://www.openstreetmap.org/copyright',
        'license': 'ODbL 1.0',
        'snapshot': data.get('osm3s', {}).get('timestamp_osm_base'),
        'retrieved': '2026-10-17',
        'sourceSha256': hashlib.sha256(raw).hexdigest(),
        'bounds': BOUNDS,
        'origin': [BOUNDS[0], BOUNDS[3]],
        'longitudeFactor': FACTOR,
        'unitsPerDegree': UNITS,
        'labels': labels,
        'width': width,
        'height': height,
        'simplificationTolerance': TOLERANCE,
        'features': dict(counts),
    }
    if places_raw:
        metadata['placesSourceSha256'] = hashlib.sha256(places_raw).hexdigest()
        metadata['placesSnapshot'] = place_data.get('osm3s', {}).get('timestamp_osm_base')
    (ROOT / 'src/data/monterrey-map.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    print(f'{sum(counts.values())} real OSM features; SVG {len(encoded):,} bytes; source snapshot {metadata["snapshot"]}')


if __name__ == '__main__':
    main()
