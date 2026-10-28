import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mergeCatalogs } from '../server/catalog.mjs';

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const catalog = await readJson('data/transit-catalog.json');

test('published catalog includes both requested networks without administrative or fabricated routing entries', async () => {
  assert.ok(catalog.routes.length >= 214);
  assert.equal(new Set(catalog.routes.map((route) => route.id)).size, catalog.routes.length);
  assert.equal(catalog.networks.length, 6);
  assert.equal(catalog.routes.filter((route) => route.networkId === 'regioruta').length, 7);
  assert.ok(catalog.routes.filter((route) => route.networkId === 'transmetro').length >= 40);
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

test('on-demand route maps preserve published coordinates, separate segments and their exact revisions', async () => {
  const routes = catalog.routes.filter((route) => route.geometryPack);
  assert.ok(routes.length >= 51);
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
  assert.ok(stops >= 4436);
  const extension = await readJson('public/route-packs/regioruta-e.json');
  assert.equal(extension.segments.length, 2);
  assert.notDeepEqual(extension.segments[0].at(-1), extension.segments[1][0]);
});

test('Transmetro snapshots have official provenance, usable stop markers and no fabricated alimentadora stops', async () => {
  const manifest = await readJson('data/metrorrey-map-sources.json');
  assert.equal(manifest.officialPageUrl, 'https://www.metrorrey.mx/');
  for (const item of manifest.routes) {
    const route = catalog.routes.find(route => route.id === item.routeId);
    if (item.excludedReason) {
      assert.equal(item.routeId, 'transmetro-alimentadora-gomez-morin-san-agustin');
      assert.ok(!route?.geometryPack, 'A path without published markers cannot invent boarding stops.');
      continue;
    }
    assert.ok(route?.sourceIds.includes('metrorrey-transmetro-maps-20261016'));
    const pack = await readJson(`public/route-packs/${route.geometryPack}.json`);
    assert.match(pack.originalKmlSha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(pack.sourceUrl).searchParams.get('mid'), item.mapId);
    assert.equal(pack.officialPageUrl, manifest.officialPageUrl);
    assert.ok(pack.stops.length >= 2);
    assert.ok(pack.stops.every(stop => typeof stop.publishedName === 'string'));
    assert.equal(route.statusAsOf, null, 'Consultation date does not certify an operational launch.');
  }
  const sanBernabe = await readJson('public/route-packs/transmetro-san-bernabe-julio-a-roca.json');
  assert.ok(sanBernabe.stops.some(stop => /Estación San Bernabé/.test(stop.publishedName)));
  const gmg = await readJson('public/route-packs/ecovia-garcia-monterrey-guadalupe.json');
  assert.equal(gmg.segments.length, 2);
});

test('published Ruta 130 stops cover Río Missouri near Punto Valle without using proposed infrastructure', async () => {
  for (const id of ['ima-130-remanente-alameda', 'ima-130-remanente-juarez']) {
    const pack = await readJson(`public/route-packs/${id}.json`);
    const stop = pack.stops.find(stop => /Gómez Morín/.test(stop.name) && /Río Missouri/.test(stop.name));
    assert.ok(stop, `${id} must retain the original IMA street intersection.`);
    assert.match(stop.publishedInfrastructureNote, /EXISTE PARABUS/);
    const meters = Math.hypot((stop.lng + 100.3545702) * 100000, (stop.lat - 25.6590567) * 111000);
    assert.ok(meters < 250, 'Published existing stop must actually be close to Punto Valle.');
  }
});

test('October 28 recovery uses exact official variants and only their published boarding points', async () => {
  const audit = await readJson('data/route-pending-audit-2026-10-28.json');
  const graph = await readJson('data/mobility-network.json');
  assert.equal(audit.routes.length, 24);
  const imported = audit.routes.filter(row => row.result === 'imported');
  assert.equal(imported.length, 6);
  assert.equal(audit.routes.filter(row => row.result === 'pending').length, 18);
  for (const item of imported) {
    const route = catalog.routes.find(route => route.id === item.id);
    const pack = await readJson(`public/route-packs/${route.geometryPack}.json`);
    assert.equal(pack.mapTitle, item.pageHeading, 'A shared route code cannot identify a different variant.');
    assert.equal(pack.originalKmlSha256, item.kmlSha256);
    assert.equal(new URL(pack.sourceUrl).searchParams.get('mid'), item.mapId);
    assert.equal(pack.stops.length, 2, 'Line vertices are geometry, not additional boarding stops.');
    const networkRoute = graph.routes.find(route => route.id === item.id);
    assert.equal(networkRoute.segments.length, 1);
    assert.equal(networkRoute.segments[0].stopIds.length, 2);
    for (const stopId of networkRoute.segments[0].stopIds) {
      const stop = graph.stops.find(stop => stop.id === stopId);
      assert.ok(pack.stops.some(point => point.lat === stop.lat && point.lng === stop.lng));
    }
  }
  for (const id of ['ima-50-mas-palomas-san-angel', 'ima-38-310-troncal-lincoln-ruiz-cortines-centro']) {
    assert.equal(catalog.routes.find(route => route.id === id).geometryPack, null);
    assert.ok(!graph.routes.some(route => route.id === id), 'An outdated or mismatched map must remain outside planning.');
  }
});
