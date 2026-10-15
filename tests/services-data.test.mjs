import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mergeCatalogs } from '../server/catalog.mjs';

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const catalog = await readJson('data/transit-catalog.json');

test('published catalog includes both requested networks without administrative or fabricated routing entries', async () => {
  assert.equal(catalog.routes.length, 207);
  assert.equal(new Set(catalog.routes.map((route) => route.id)).size, catalog.routes.length);
  assert.equal(catalog.networks.length, 6);
  assert.equal(catalog.routes.filter((route) => route.networkId === 'regioruta').length, 7);
  assert.equal(catalog.routes.filter((route) => route.networkId === 'transmetro').length, 33);
  assert.ok(
    !catalog.routes.some((route) => route.code === 'S/A' || route.id === 'ima-sin-asignar'),
  );
  assert.deepEqual(
    catalog.routes.filter((route) => route.planningEligible).map((route) => route.id),
    ['L1', 'L2', 'L3'],
  );
  for (const id of ['L4', 'L6']) {
    const route = catalog.routes.find((route) => route.id === id);
    assert.equal(route.status, 'construction');
    assert.equal(route.statusAsOf, '2026-10-12');
    assert.equal(route.planningEligible, false);
    assert.equal(route.geometryPack, null);
  }
  assert.equal(catalog.routes.find((route) => route.id === 'regioruta-a').statusAsOf, null);
  assert.deepEqual(await readJson('public/transit-catalog.json'), catalog);
});

test('all service documents resolve public sources and retain per-route revisions when normalized by the API', () => {
  const sources = new Set(catalog.sources.map((source) => source.id));
  for (const source of catalog.sources) {
    const url = new URL(source.url);
    assert.ok(['http:', 'https:'].includes(url.protocol));
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
  const normalized = mergeCatalogs([catalog]);
  for (const route of catalog.routes) {
    assert.ok(route.sourceIds.length > 0, `${route.id} must identify its provenance`);
    for (const id of route.sourceIds)
      assert.ok(sources.has(id), `${route.id}: source ${id} is missing`);
    if (route.geometryRevision)
      assert.equal(
        normalized.routes.find((item) => item.id === route.id).geometryRevision,
        route.geometryRevision,
      );
    assert.equal(
      normalized.routes.find((item) => item.id === route.id).planningEligible,
      route.planningEligible,
    );
  }
});

test('twelve on-demand route maps preserve published coordinates, separate segments and their exact revisions', async () => {
  const routes = catalog.routes.filter((route) => route.geometryPack);
  assert.equal(routes.length, 12);
  let stops = 0;
  for (const route of routes) {
    const bytes = await readFile(
      new URL(`../public/route-packs/${route.geometryPack}.json`, import.meta.url),
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex').slice(0, 12),
      route.geometryRevision,
    );
    const pack = JSON.parse(bytes);
    assert.equal(pack.id, route.geometryPack);
    assert.equal(pack.geometryKind, 'official-published');
    assert.equal(pack.stopOrderVerified, false);
    assert.equal(route.planningEligible, false);
    const segments = pack.segments?.length ? pack.segments : [pack.coordinates];
    assert.ok(segments.length > 0);
    for (const segment of segments) {
      assert.ok(segment.length >= 2);
      for (const [lng, lat] of segment) {
        assert.ok(Number.isFinite(lng) && lng > -102 && lng < -99);
        assert.ok(Number.isFinite(lat) && lat > 24 && lat < 28);
      }
    }
    assert.equal(new Set(pack.stops.map((stop) => stop.id)).size, pack.stops.length);
    for (const stop of pack.stops) {
      assert.ok(stop.name.trim());
      assert.ok(Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
      assert.equal(stop.infrastructureStatus, 'unknown');
    }
    stops += pack.stops.length;
  }
  assert.equal(stops, 1464);
  const extension = await readJson('public/route-packs/regioruta-e.json');
  assert.equal(extension.segments.length, 2);
  assert.notDeepEqual(extension.segments[0].at(-1), extension.segments[1][0]);
});
