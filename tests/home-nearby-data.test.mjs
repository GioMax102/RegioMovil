import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { normalizePublishedRoute } from '../shared/published-route.mjs';
import {
  validateHomeNearby,
  rankHomeNearby,
  homeCanonicalStops,
  loadHomeNearby,
} from '../src/components/homeNearby.ts';

const root = new URL('../', import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const route = {
  id: 'sample',
  code: '1',
  name: 'Sample',
  networkId: 'transmetro',
  geometryPack: 'sample',
  geometryRevision: '123456abcdef',
  sourceIds: ['source'],
};
const pack = {
  coordinates: [
    [-100.4, 25.7],
    [-100.39, 25.71],
  ],
  stops: [
    { id: 'same', name: 'Primera', lng: -100.4, lat: 25.7 },
    { id: 'same', name: 'Segunda ñ', lng: -100.39, lat: 25.71 },
    {
      id: 'proposal',
      name: 'Pendiente',
      lng: -100.395,
      lat: 25.705,
      publishedInfrastructureNote: 'PROPUESTA',
    },
    { id: 'far', name: 'Lejana', lng: -100.8, lat: 25.7 },
  ],
};
const position = { lat: 25.7, lng: -100.4, accuracy: 20, timestamp: Date.now() };
const index = {
  version: 1,
  revision: '123456abcdef',
  verifiedAt: '2026-11-05',
  origin: [24, -102],
  scale: 100000,
  routes: [route, { ...route, id: 'other', geometryPack: 'other' }],
  points: [
    [170000, 160000, 0, 'p2'],
    [170000, 160000, 0, 'p1'],
    [170100, 160000, 1, 'p1'],
  ],
};

test('shared normalization preserves canonical collision hashes, removes proposals/far markers and never joins gaps', () => {
  const result = normalizePublishedRoute(route, pack);
  const second = pack.stops[1];
  const digest = createHash('sha256')
    .update(`${second.lng},${second.lat},${second.name}`)
    .digest('hex')
    .slice(0, 12);
  assert.deepEqual(
    result.stops.map((stop) => stop.id),
    ['sample:same', `sample:same:${digest}`],
  );
  assert.deepEqual(
    result.excludedStops.map((item) => item.reason),
    ['proposed-only', 'too-far-from-published-trace'],
  );
  assert.equal(homeCanonicalStops(route, pack)[1].id, `sample:same:${digest}`);
  const longName = 'Parada 公共 · ñ'.repeat(30);
  const longPack = { ...pack, stops: [pack.stops[0], { ...second, name: longName }] };
  const longDigest = createHash('sha256')
    .update(`${second.lng},${second.lat},${longName}`)
    .digest('hex')
    .slice(0, 12);
  assert.equal(normalizePublishedRoute(route, longPack).stops[1].id, `sample:same:${longDigest}`);
  assert.equal(
    normalizePublishedRoute(route, { ...pack, experimentalRouting: false }).reason,
    'visualization-only',
  );
  const separated = normalizePublishedRoute(route, {
    ...pack,
    segments: [
      pack.coordinates,
      [
        [-100.3, 25.7],
        [-100.29, 25.71],
      ],
    ],
    stops: [
      ...pack.stops,
      { id: 'c', name: 'C', lng: -100.3, lat: 25.7 },
      { id: 'd', name: 'D', lng: -100.29, lat: 25.71 },
    ],
  });
  assert.equal(separated.segments.length, 2);
  assert.deepEqual(separated.segments[0].coordinates, pack.coordinates);
  assert.equal(
    normalizePublishedRoute(route, { ...pack, stops: [pack.stops[0]] }).reason,
    'insufficient-published-stops',
  );
});

test('generated nearby index is bounded and every canonical ID resolves to the exact prepared graph point', async () => {
  const raw = await readFile(new URL('public/home-nearby.json', root));
  const generated = validateHomeNearby(JSON.parse(raw));
  const graph = await read('public/mobility-network.json');
  assert.equal(generated.revision, graph.revision);
  assert.ok(raw.length <= 450 * 1024);
  assert.ok(gzipSync(raw, { level: 6 }).length <= 110 * 1024);
  const graphStops = new Map(graph.stops.map((stop) => [stop.id, stop]));
  const graphBusStops = graph.stops.filter((stop) => stop.mode === 'bus');
  const graphBusRoutes = graph.routes.filter((route) => route.mode === 'bus');
  assert.equal(generated.points.length, graphBusStops.length);
  assert.equal(generated.routes.length, graphBusRoutes.length);
  assert.deepEqual(
    new Set(generated.points.map((point) => `${generated.routes[point[2]].id}:${point[3]}`)),
    new Set(graphBusStops.map((stop) => stop.id)),
  );
  for (const route of generated.routes) {
    const prepared = graphBusRoutes.find((item) => item.id === route.id);
    for (const field of ['code', 'name', 'networkId', 'geometryPack', 'geometryRevision'])
      assert.equal(route[field], prepared[field]);
  }
  for (const [lat, lng, ordinal, suffix] of generated.points) {
    const service = generated.routes[ordinal],
      stop = graphStops.get(`${service.id}:${suffix}`);
    assert.ok(stop);
    assert.deepEqual(stop.routeIds, [service.id]);
    assert.ok(Math.abs(stop.lat - (24 + lat / 100000)) <= 0.0000051);
    assert.ok(Math.abs(stop.lng - (-102 + lng / 100000)) <= 0.0000051);
  }
  const catalog = await read('data/transit-catalog.json');
  for (const service of catalog.routes.filter((item) => item.mode === 'bus' && item.geometryPack)) {
    const normalized = normalizePublishedRoute(
      service,
      await read(`public/route-packs/${service.geometryPack}.json`),
    );
    const retained = graph.routes.find((item) => item.id === service.id);
    if (!retained) {
      assert.ok(normalized.reason);
      continue;
    }
    assert.deepEqual(normalized.segments, retained.segments);
    normalized.stops.forEach((stop) => assert.deepEqual(stop, graphStops.get(stop.id)));
  }
});

test('index validation rejects conflicting identities, malformed metadata and unsafe coordinates', () => {
  assert.equal(validateHomeNearby(index), index);
  for (const invalid of [
    { ...index, revision: 'stale' },
    { ...index, points: [...index.points, index.points[0]] },
    { ...index, points: [[170000, 160000, 20, 'p1']] },
    { ...index, points: [[NaN, 160000, 0, 'p1']] },
    { ...index, routes: [{ ...route, geometryPack: '../secret' }] },
    { ...index, points: [[9000000, 0, 0, 'p1']] },
  ])
    assert.throws(() => validateHomeNearby(invalid));
});

test('local ranking deduplicates route variants, keeps canonical origins, uncertainty and deterministic ties', () => {
  const station = { id: 'near', name: 'Cercana', lat: 25.7, lng: -100.4, lineIds: ['L1', 'L2'] };
  const current = { ...position, timestamp: Date.now() };
  const ranked = rankHomeNearby(index, current, [station]);
  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked[0].selection, {
    kind: 'bus',
    route,
    stopId: 'sample:p1',
    source: 'nearby',
  });
  assert.equal(ranked[0].distanceMeters, 0);
  assert.equal(ranked[0].approximate, false);
  assert.equal(ranked.filter((item) => item.selection.kind === 'metro').length, 1);
  const metroOnly = rankHomeNearby({ ...index, routes: [], points: [] }, current, [station], {
    limit: 1,
  });
  assert.equal(metroOnly[0].selection.kind, 'metro');
  assert.equal(rankHomeNearby(index, { ...current, accuracy: 250 }, [])[0].approximate, true);
  assert.deepEqual(rankHomeNearby(index, { ...current, timestamp: Date.now() - 61000 }, []), []);
  assert.deepEqual(rankHomeNearby(index, { ...current, accuracy: 1501 }, []), []);
  assert.deepEqual(rankHomeNearby(index, { ...current, lat: 0 }, []), []);
  assert.deepEqual(rankHomeNearby(index, current, [], { limit: 0 }), []);
});

test('nearby loading requests only its public document without transmitting coordinates', async () => {
  const fetch = globalThis.fetch,
    requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, options]);
    return new Response(JSON.stringify(index));
  };
  try {
    const result = await loadHomeNearby();
    assert.equal(result.revision, index.revision);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], '/home-nearby.json');
    assert.equal(requests[0][1].body, undefined);
  } finally {
    globalThis.fetch = fetch;
  }
});
