import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { planMobility } from '../server/mobility.mjs';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const execute = promisify(execFile);
const [catalog, graph, inventory, audit, sourceAudit] = await Promise.all([
  readJson('data/transit-catalog.json'),
  readJson('data/mobility-network.json'),
  readJson('data/route-coverage-inventory.json'),
  readJson('data/coverage-source-audit-20261025.json'),
  readJson('data/ima-map-sources.json'),
]);

test('coverage inventory matches catalog, source audit and the graph without counting Metro as missing bus geometry', () => {
  assert.deepEqual(inventory.services.map((entry) => entry.id).sort(), catalog.routes.map((route) => route.id).sort());
  assert.equal(inventory.graphRevision, graph.revision);
  assert.equal(inventory.catalogSha256, createHash('sha256').update(Buffer.from(JSON.stringify(catalog) + '\n')).digest('hex'));
  const bus = inventory.services.filter((entry) => entry.mode === 'bus');
  assert.equal(bus.length, catalog.routes.filter((route) => route.mode === 'bus').length);
  assert.ok(sourceAudit.routes.filter((entry) => entry.status === 'imported').length >= 119);
  assert.ok(inventory.totals.mapInNetworkOverview > 170);
  for (const entry of inventory.services.filter((row) => !row.mapInServiceDetail)) {
    assert.ok(entry.pendingReason, `${entry.id}: unavailable geometry must have a concrete reason`);
    assert.ok(entry.officialUrl, `${entry.id}: retain the consulted source`);
  }
});

test('new official maps retain separate segments, exact identities and public provenance in experimental routing', async () => {
  const imported = sourceAudit.routes.filter((entry) => entry.status === 'imported');
  for (const evidence of imported) {
    const route = catalog.routes.find((entry) => entry.id === evidence.id);
    assert.equal(route.geometryPack, evidence.id);
    assert.equal(route.planningEligible, false, 'Experimental inference must not become verified operational routing');
    const bytes = await readFile(new URL(`public/route-packs/${route.geometryPack}.json`, root));
    const pack = JSON.parse(bytes);
    assert.equal(pack.id, route.geometryPack);
    assert.equal(pack.experimentalRouting, true);
    assert.equal(pack.stopOrderVerified, false);
    assert.equal(pack.license, 'not-specified', 'The CSV license must not be inferred for external KMLs');
    assert.equal(pack.originalKmlSha256, evidence.originalKmlSha256);
    assert.equal(pack.verifiedAt, evidence.verifiedAt);
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 12), route.geometryRevision);
    assert.equal(new URL(pack.sourceUrl).searchParams.get('mid'), evidence.mapId);
    assert.deepEqual(pack.coordinates, pack.segments[0]);
    assert.equal(pack.segments.length, evidence.segments);
    assert.equal(pack.segments.reduce((sum, segment) => sum + segment.length, 0), evidence.vertices);
    assert.equal(pack.stops.length, evidence.publishedPoints);
    assert.equal(new Set(pack.stops.map((stop) => stop.id)).size, pack.stops.length);
    assert.ok(pack.stops.every((stop) => stop.infrastructureStatus === 'unknown'));
    for (const segment of pack.segments) for (const [lng, lat] of segment) {
      assert.ok(Number.isFinite(lng) && lng >= -100.9 && lng <= -99.8);
      assert.ok(Number.isFinite(lat) && lat >= 25.35 && lat <= 26.1);
    }
    const graphRoute = graph.routes.find((item) => item.id === route.id);
    if (!graphRoute) {
      assert.equal(graph.coverage.excludedRoutes.find((item) => item.id === route.id)?.reason, 'insufficient-published-stops');
      continue;
    }
    assert.equal(graphRoute.stopOrderVerified, false);
    assert.equal(graphRoute.directionVerified, false);
    for (const segment of graphRoute.segments) {
      assert.ok(segment.stopIds.length >= 2);
      assert.ok(pack.segments.some((original) => JSON.stringify(original) === JSON.stringify(segment.coordinates)), 'Never concatenate disconnected source segments');
      for (const id of segment.stopIds) {
        const stop = graph.stops.find((item) => item.id === id);
        assert.ok(stop.snapDistanceMeters <= 160);
        const note = (stop.publishedInfrastructureNote || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        assert.ok(!note.includes('PROPUESTA') || note.includes('EXISTE'));
      }
    }
  }
  // These five were consulted on Oct 25; current eligibility was deliberately
  // updated under the same experimental policy as every other published map.
  for (const old of audit.routes) assert.ok(graph.routes.some((route) => route.id === old.routeId));
});

test('all matching integrated maps are included and a newly imported corridor generates a journey on its published trace', () => {
  const integrated = catalog.routes.filter((route) => route.networkId === 'troncales-integradas');
  assert.equal(integrated.length, 9);
  assert.equal(integrated.filter((route) => graph.routes.some((item) => item.id === route.id)).length, 8);
  const contradictory = sourceAudit.routes.find((route) => route.id === 'ima-38-310-troncal-lincoln-ruiz-cortines-centro');
  assert.equal(contradictory.reason, 'official-page-identity-mismatch');
  assert.match(contradictory.renderedHeading, /213/);
  assert.ok(!graph.routes.some((route) => route.id === contradictory.id), 'A different route shown by the official link must not supply the missing path');
  const route = graph.routes.find((item) => item.id === 'ima-182-troncal-cadereyta');
  const stops = graph.stops.filter((stop) => stop.routeIds.includes(route.id));
  const segment = route.segments[0];
  const from = segment.stopIds[Math.floor(segment.stopIds.length / 4)];
  const to = segment.stopIds[Math.floor(segment.stopIds.length * 3 / 4)];
  const result = planMobility({ ...graph, stops, routes: [route] }, { from: { id: from }, to: { id: to }, offline: true });
  const journey = result.journeys.find((item) => item.serviceIds.includes(route.id));
  assert.ok(journey, 'Imported geometry must reach the actual planner, not just a coverage label');
  assert.ok(journey.steps.some((step) => step.lineId === route.id && step.geometry.length > 2));
  assert.equal(journey.steps.find((step) => step.lineId === route.id).stopOrderVerified, false);
});

test('an explicit view-only override still excludes unsafe data while a separate experimental control stays routable', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-routing-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const folder of ['scripts', 'server', 'data', 'public/route-packs']) await mkdir(join(directory, folder), { recursive: true });
  const control = catalog.routes.find((route) => route.id === 'regioruta-a');
  const blocked = catalog.routes.find((route) => route.id === 'ima-182-troncal-cadereyta');
  const pack = await readJson(`public/route-packs/${blocked.geometryPack}.json`);
  await Promise.all([
    copyFile(new URL('scripts/prepare-mobility.mjs', root), join(directory, 'scripts/prepare-mobility.mjs')),
    copyFile(new URL('server/mobility.mjs', root), join(directory, 'server/mobility.mjs')),
    writeFile(join(directory, 'data/network.json'), JSON.stringify({ lines: [], stations: [], sources: [] })),
    writeFile(join(directory, 'data/transit-catalog.json'), JSON.stringify({ ...catalog, routes: [blocked, control] })),
    writeFile(join(directory, `public/route-packs/${blocked.geometryPack}.json`), JSON.stringify({ ...pack, experimentalRouting: false })),
    copyFile(new URL(`public/route-packs/${control.geometryPack}.json`, root), join(directory, `public/route-packs/${control.geometryPack}.json`)),
  ]);
  await execute(process.execPath, [join(directory, 'scripts/prepare-mobility.mjs')], { cwd: directory, timeout: 30000 });
  const generated = JSON.parse(await readFile(join(directory, 'data/mobility-network.json'), 'utf8'));
  assert.deepEqual(generated.routes.map((route) => route.id), [control.id]);
  assert.ok(generated.stops.length >= 2);
  assert.equal(generated.coverage.excludedRoutes.find((row) => row.id === blocked.id)?.reason, 'visualization-only');
});
