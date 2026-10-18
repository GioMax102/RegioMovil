#!/usr/bin/env python3
"""Build a compact server-only street junction index from explicit OSM extracts.

No network or geocoding runs during builds or autocomplete. Only identical source
vertices (or shared node IDs, when available), at compatible levels, form a junction.
Geometric line crossings are separate approximate map references: they never imply
connected roads, an entrance or pedestrian access. House numbers are not interpolated.
"""
import argparse
import collections
import hashlib
import json
import math
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = [-100.9, 25.35, -99.8, 26.1]
ROAD_TYPES = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'service'}


def normalized(text):
    text = ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if not unicodedata.combining(c))
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in text).split())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources', type=Path, nargs='+')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/street-junctions.json')
    args = parser.parse_args()
    ways = {}
    sources = []
    for source in args.sources:
        raw = source.read_bytes()
        payload = json.loads(raw)
        if payload.get('remark'):
            raise ValueError('Incomplete Overpass extract: ' + payload['remark'])
        sources.append({'sha256': hashlib.sha256(raw).hexdigest(), 'snapshot': payload.get('osm3s', {}).get('timestamp_osm_base')})
        for element in payload.get('elements', []):
            if element.get('type') == 'way':
                ways[element['id']] = element
    names = []
    by_name = {}
    points = collections.defaultdict(dict)
    segments = []
    way_count = 0
    for way in sorted(ways.values(), key=lambda way: way['id']):
        tags = way.get('tags', {})
        name = tags.get('name', '').strip()
        if not name or len(name) > 160 or tags.get('highway') not in ROAD_TYPES:
            continue
        name_key = normalized(name)
        if name_key not in by_name:
            by_name[name_key] = len(names)
            aliases = sorted({alias.strip() for key in ('alt_name', 'short_name', 'old_name', 'name:es') for alias in tags.get(key, '').split(';') if alias.strip() and alias.strip() != name})
            names.append([name, aliases])
        name_index = by_name[name_key]
        level = (tags.get('layer', '0'), tags.get('bridge', 'no') not in ('no', '0'), tags.get('tunnel', 'no') not in ('no', '0'))
        node_ids = way.get('nodes', [])
        geometry = way.get('geometry', [])
        way_count += 1
        for index, point in enumerate(geometry):
            lat, lng = point.get('lat'), point.get('lon')
            if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)) or not math.isfinite(lat) or not math.isfinite(lng) or not (BOUNDS[0] <= lng <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]):
                continue
            node_id = str(node_ids[index]) if len(node_ids) == len(geometry) else ''
            key = (lat, lng, level)
            # Keep one source way per street, rather than thousands of repeated segments.
            points[key].setdefault(name_index, (way['id'], node_id))
        for a, b in zip(geometry, geometry[1:]):
            if a == b or not all(BOUNDS[0] <= p['lon'] <= BOUNDS[2] and BOUNDS[1] <= p['lat'] <= BOUNDS[3] for p in (a, b)):
                continue
            segments.append((a['lon'], a['lat'], b['lon'], b['lat'], name_index, way['id'], level))
    junctions = []
    for (lat, lng, _level), streets in sorted(points.items()):
        if len(streets) < 2:
            continue
        # A source node shared by named roads is the evidence for this point.
        # out tags geom extracts omit IDs but preserve exact vertex coordinates.
        entries = sorted(streets.items())
        node_ids = {entry[1][1] for entry in entries if entry[1][1]}
        if len(node_ids) > 1:
            continue
        junctions.append([lat, lng, [entry[0] for entry in entries], [entry[1][0] for entry in entries], next(iter(node_ids), ''), 0])
    # Compute crossings once at import time with a spatial grid, not on each keypress.
    # A projected crossing is a map-search aid only; topology remains unmodified.
    exact_keys = {(round(j[0], 7), round(j[1], 7), a, b) for j in junctions for a in j[2] for b in j[2] if a < b}
    cells = collections.defaultdict(list)
    references = {}
    cell_size = 0.005
    for index, segment in enumerate(segments):
        ax, ay, bx, by, street, way, level = segment
        candidates = set()
        keys = [(x, y) for x in range(math.floor(min(ax, bx) / cell_size), math.floor(max(ax, bx) / cell_size) + 1)
                for y in range(math.floor(min(ay, by) / cell_size), math.floor(max(ay, by) / cell_size) + 1)]
        for key in keys:
            candidates.update(cells[key])
            cells[key].append(index)
        for other_index in candidates:
            other = segments[other_index]
            cx, cy, dx, dy, other_street, other_way, other_level = other
            if street == other_street or max(ax, bx) < min(cx, dx) or max(cx, dx) < min(ax, bx) or max(ay, by) < min(cy, dy) or max(cy, dy) < min(ay, by):
                continue
            rx, ry, sx, sy = bx - ax, by - ay, dx - cx, dy - cy
            determinant = rx * sy - ry * sx
            if abs(determinant) < 1e-15:
                continue
            t = ((cx - ax) * sy - (cy - ay) * sx) / determinant
            u = ((cx - ax) * ry - (cy - ay) * rx) / determinant
            if not (-1e-8 <= t <= 1 + 1e-8 and -1e-8 <= u <= 1 + 1e-8):
                continue
            lat, lng = round(ay + t * ry, 7), round(ax + t * rx, 7)
            pair = sorted([(street, way), (other_street, other_way)])
            key = (lat, lng, pair[0][0], pair[1][0])
            if key not in exact_keys:
                references[key] = [lat, lng, [p[0] for p in pair], [p[1] for p in pair], '', 1]
    junctions.extend(references.values())
    result = {'version': 1, 'bounds': BOUNDS, 'retrieved': '2026-10-18', 'source': '© OpenStreetMap contributors',
              'copyrightUrl': 'https://www.openstreetmap.org/copyright', 'license': 'ODbL-1.0', 'extracts': sources,
              'method': 'shared-source-vertex-same-level; separately labeled geometric map references', 'wayCount': way_count,
              'sharedVertices': len(junctions) - len(references), 'geometricReferences': len(references), 'streets': names, 'junctions': junctions}
    encoded = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode() + b'\n'
    if len(encoded) > 5 * 1024 * 1024:
        raise ValueError('Street junction index exceeds its server asset budget of 5 MiB')
    args.output.write_bytes(encoded)
    print(f'{len(names):,} named streets; {len(junctions):,} shared vertices; {len(encoded):,} server-only bytes')


if __name__ == '__main__':
    main()
