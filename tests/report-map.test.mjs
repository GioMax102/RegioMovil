import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createReportStore, REPORT_CATEGORIES } from '../server/storage.mjs';
import { reportMapFilters, identifyReportMap } from '../server/report-map.mjs';
import { populateAdminDemo } from '../server/admin-demo.mjs';

const now = new Date('2026-10-31T18:00:00.000Z');
const network = { stations: [{ id: 'a', name: 'Estación A', lat: 25.67, lng: -100.32 }] };
const catalog = {
  routes: [{ id: 'bus-a', name: 'Recorrido A', mode: 'bus', geometryPack: 'bus-a' }],
};
const filters = (query = '', canInspect = true) =>
  reportMapFilters(new URLSearchParams(query), {
    network,
    catalog,
    categories: REPORT_CATEGORIES,
    now,
    canInspect,
  });
const observation = {
  targetType: 'station',
  stationId: 'a',
  category: 'condition',
  title: 'Ejemplo de prueba',
  detail: 'Contenido de prueba, no daño real.',
  publicationConsent: true,
};
const reviewed = { reviewer: 'test-reviewer', reviewed: true, note: 'Revisión sintética' };

test('approved geography excludes private and withdrawn reports; receipt ranges and totals agree', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  const add = (input = {}, date = now) => store.add({ ...observation, ...input }, date);
  const open = add();
  store.moderate(open.id, 'publish', reviewed, now);
  const resolved = add();
  store.moderate(resolved.id, 'publish', reviewed, now);
  store.moderate(resolved.id, 'resolve', reviewed, now);
  add({ publicationConsent: false });
  add();
  const rejected = add();
  store.moderate(rejected.id, 'reject', reviewed, now);
  const result = store.adminReportMap(filters(), { date: now, locatedStationIds: ['a'] });
  assert.equal(result.totals.total, 1);
  assert.equal(result.totals.stationLocated, 1);
  assert.equal(result.totals.withoutPoint, 0);
  const approved = store.adminReportMap(filters('state=approved'), { date: now });
  assert.equal(approved.totals.total, 2);
  assert.equal(approved.totals.open, 1);
  assert.equal(approved.totals.resolved, 1);
  assert.equal(
    approved.groups.reduce((sum, g) => sum + g.count, 0),
    2,
  );
  const payload = identifyReportMap(result, filters(), {
    network,
    catalog,
    canInspect: false,
    date: now,
  });
  assert.deepEqual(payload.groups[0].position, {
    lat: 25.67,
    lng: -100.32,
    source: 'station-catalog',
  });
  assert.equal(payload.scope, 'all-filtered-reports');
  assert.equal(
    store.adminReportMap(filters(`to=${encodeURIComponent(now.toISOString())}`), { date: now })
      .totals.total,
    0,
  );
  store.moderate(open.id, 'unpublish', reviewed, now);
  assert.equal(store.adminReportMap(filters(), { date: now }).totals.total, 0);
  assert.equal(store.datasetInfo(), null);
});

test('unit references are exact declarative groups for moderation and absent from analyst aggregates', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  for (const unitReference of ['Unidad 01', 'Unidad 02']) {
    const report = store.add(
      { ...observation, targetType: 'unit', stationId: undefined, routeId: 'bus-a', unitReference },
      now,
    );
    store.moderate(report.id, 'publish', reviewed, now);
  }
  const detailed = store.adminReportMap(filters(), { date: now, canInspect: true });
  assert.equal(detailed.groups.length, 2);
  const aggregated = store.adminReportMap(filters(), { date: now, canInspect: false });
  assert.equal(aggregated.groups.length, 1);
  assert.equal(aggregated.groups[0].count, 2);
  const payload = identifyReportMap(aggregated, filters(), {
    network,
    catalog,
    canInspect: false,
    date: now,
  });
  assert.equal(Object.hasOwn(payload.groups[0], 'unitReference'), false);
  assert.equal(payload.groups[0].position, null);
  for (const field of ['detail', 'title', 'photoData', 'draftId'])
    assert.equal(Object.hasOwn(payload.groups[0], field), false);
  assert.equal(
    store.adminReportMap(filters(`unitReference=${encodeURIComponent('Unidad 01')}`), {
      date: now,
      canInspect: true,
    }).totals.total,
    1,
  );
});

test('map filter validation rejects unbounded periods, duplicates, unknown identifiers and private analyst filters', () => {
  for (const query of [
    'state=pending',
    'category=missing',
    'category=condition&category=climate',
    'stationId=unknown',
    'routeId=unknown',
    'limit=9000',
    'from=2026-01-01T00%3A00%3A00.000Z',
    'from=not-a-date',
    'from=2026-11-02T00%3A00%3A00.000Z',
  ])
    assert.throws(() => filters(query), RangeError);
  assert.throws(() => filters('unitReference=Private', false), RangeError);
  assert.equal(filters('state=resolved&category=condition&routeId=bus-a').state, 'resolved');
});

test('the 240-record isolated fixture has reproducible approved counts and a durable synthetic marker', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-map-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'reports.sqlite');
  const manifest = populateAdminDemo(path, { network, catalog, seed: 'known', referenceDate: now });
  const store = createReportStore(path);
  t.after(() => store.close());
  assert.deepEqual(
    { ...store.adminDashboard(now).counters },
    { total: 240, pending: 50, published: 120, resolved: 40, rejected: 30 },
  );
  assert.equal(store.adminReportMap(filters(), { date: now }).totals.total, 120);
  const approved = store.adminReportMap(filters('state=approved'), { date: now });
  assert.equal(approved.totals.total, manifest.expected.approved);
  assert.deepEqual(
    { station: approved.totals.station, route: approved.totals.route, unit: approved.totals.unit },
    manifest.expected.approvedByTarget,
  );
  assert.equal(store.datasetInfo().kind, 'synthetic');
  assert.equal(store.datasetInfo().seed, 'known');
  assert.throws(() => populateAdminDemo(path, { network, catalog, referenceDate: now }), /vacía/);
});

test('demo CLI creates a private new destination and refuses replacement and private-data aliases', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'regiomovil-demo-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'regiomovil-admin-demo-test');
  const run = (path) =>
    spawnSync(
      process.execPath,
      ['scripts/admin-demo.mjs', '--directory', path, '--date', now.toISOString()],
      { encoding: 'utf8' },
    );
  const created = run(directory);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')).expected.approved,
    160,
  );
  if (process.platform !== 'win32') {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(directory, 'demo.env'))).mode & 0o777, 0o600);
  }
  assert.notEqual(run(directory).status, 0);
  const sameDatabase = join(root, 'regiomovil-admin-demo-configured');
  assert.notEqual(
    spawnSync(process.execPath, ['scripts/admin-demo.mjs', '--directory', sameDatabase], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: join(sameDatabase, 'reports.sqlite') },
    }).status,
    0,
  );
  assert.notEqual(run(join(process.cwd(), '.data', 'regiomovil-admin-demo-refused')).status, 0);
  // An existing symlink parent must not bypass the .data boundary.
  const privateRoot = join(process.cwd(), '.data');
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const alias = join(root, 'private-alias');
  await symlink(privateRoot, alias, 'dir');
  assert.notEqual(run(join(alias, 'regiomovil-admin-demo-refused')).status, 0);
});

test('five thousand approved reports keep aggregates bounded without losing the global total', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  for (let index = 0; index < 5000; index++) {
    const report = store.add(
      {
        ...observation,
        targetType: 'unit',
        stationId: undefined,
        routeId: 'bus-a',
        unitReference: `Unidad de prueba ${index}`,
      },
      now,
    );
    store.moderate(report.id, 'publish', reviewed, now);
  }
  const durations = [];
  let payload;
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    const validated = filters(index % 2 ? 'category=condition' : 'state=approved');
    const result = store.adminReportMap(validated, { date: now, canInspect: true });
    payload = identifyReportMap(result, validated, {
      network,
      catalog,
      canInspect: true,
      date: now,
    });
    durations.push(performance.now() - started);
    assert.equal(payload.totals.total, 5000);
    assert.equal(payload.groupCount, 5000);
    assert.equal(payload.groups.length, 250);
    assert.equal(payload.truncated, true);
    assert.equal(payload.totals.withoutPoint, 5000);
  }
  t.diagnostic(
    JSON.stringify({
      scenario: '5000-approved/20-filters/in-memory',
      p95Ms: Number(durations.sort((a, b) => a - b)[18].toFixed(2)),
      responseGzipBytes: gzipSync(JSON.stringify(payload)).length,
      groups: payload.groups.length,
    }),
  );
});
