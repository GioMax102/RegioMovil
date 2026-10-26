import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const execute = promisify(execFile);
const viewOnlyIds = [
  'ima-13-remanente-soriana-sendero-lincoln',
  'ima-39-directa-san-bernabe-centro',
  'ima-109-remanente-aeropuerto-y-griega',
  'ima-124-alimentadora-quinta-colonial-ruiz-cortines-por-anillo',
  'ima-310-remanente-portal-de-lincoln-estacion-san-bernabe',
];
const [catalog, graph, inventory, audit] = await Promise.all([
  readJson('data/transit-catalog.json'),
  readJson('data/mobility-network.json'),
  readJson('data/route-coverage-inventory.json'),
  readJson('data/coverage-source-audit-20261025.json'),
]);

test('five IMA view-only maps retain exact identity and geometry evidence without claiming routing coverage', async () => {
  assert.deepEqual(audit.routes.map((entry) => entry.routeId).sort(), [...viewOnlyIds].sort());
  assert.deepEqual(
    inventory.services.map((entry) => entry.id).sort(),
    catalog.routes.map((route) => route.id).sort(),
  );
  assert.equal(inventory.graphRevision, graph.revision);
  assert.equal(
    inventory.catalogSha256,
    createHash('sha256')
      .update(await readFile(new URL('data/transit-catalog.json', root)))
      .digest('hex'),
  );

  for (const id of viewOnlyIds) {
    const route = catalog.routes.find((entry) => entry.id === id);
    const evidence = audit.routes.find((entry) => entry.routeId === id);
    const entry = inventory.services.find((item) => item.id === id);
    assert.ok(route, `${id}: catalog entry is missing`);
    assert.ok(entry, `${id}: inventory entry is missing`);
    assert.equal(route.geometryPack, id, `${id}: a different branch must not supply the map`);
    assert.equal(route.planningEligible, false);
    const bytes = await readFile(new URL(`public/route-packs/${route.geometryPack}.json`, root));
    const pack = JSON.parse(bytes);
    const segments = pack.segments;
    assert.equal(pack.id, id);
    assert.equal(pack.experimentalRouting, false);
    assert.equal(pack.stopOrderVerified, false);
    assert.equal(evidence.directionVerified, false);
    assert.equal(pack.geometryKind, 'official-published');
    assert.equal(pack.originalKmlSha256, evidence.sha256);
    assert.equal(pack.verifiedAt, evidence.checkedAt);
    assert.equal(pack.officialPageUrl, audit.datasetUrl);
    assert.equal(pack.license, evidence.license);
    assert.equal(pack.datasetLicense, evidence.datasetLicense);
    assert.equal(
      new URL(pack.sourceUrl).searchParams.get('mid'),
      new URL(route.officialUrl).searchParams.get('mid'),
    );
    assert.equal(
      new URL(pack.sourceUrl).searchParams.get('mid'),
      new URL(evidence.officialUrl).searchParams.get('mid'),
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex').slice(0, 12),
      route.geometryRevision,
    );
    assert.ok(
      Array.isArray(segments) && segments.length > 0,
      `${id}: published segments must remain explicit`,
    );
    assert.equal(segments.length, evidence.segments);
    assert.equal(
      segments.reduce((sum, segment) => sum + segment.length, 0),
      evidence.vertices,
    );
    assert.deepEqual(
      pack.coordinates,
      segments[0],
      `${id}: primary path must preserve its published segment`,
    );
    for (const segment of segments) {
      assert.ok(segment.length >= 2);
      for (const point of segment) {
        assert.equal(point.length, 2);
        assert.ok(Number.isFinite(point[0]) && point[0] > -102 && point[0] < -99);
        assert.ok(Number.isFinite(point[1]) && point[1] > 24 && point[1] < 28);
      }
    }
    assert.equal(pack.stops.length, evidence.publishedMarkers);
    assert.equal(new Set(pack.stops.map((stop) => stop.id)).size, pack.stops.length);
    assert.ok(pack.stops.every((stop) => stop.infrastructureStatus === 'unknown'));
    assert.deepEqual(
      {
        geometryPack: entry.geometryPack,
        geometryRevision: entry.geometryRevision,
        publishedSegments: entry.publishedSegments,
        publishedMarkers: entry.publishedMarkers,
        mapInServiceDetail: entry.mapInServiceDetail,
        mapInNetworkOverview: entry.mapInNetworkOverview,
        experimentalGraphIncluded: entry.experimentalGraphIncluded,
        graphExclusionReason: entry.graphExclusionReason,
        pendingReason: entry.pendingReason,
      },
      {
        geometryPack: id,
        geometryRevision: route.geometryRevision,
        publishedSegments: segments.length,
        publishedMarkers: pack.stops.length,
        mapInServiceDetail: true,
        mapInNetworkOverview: false,
        experimentalGraphIncluded: false,
        graphExclusionReason: 'visualization-only',
        pendingReason: 'view-only-direction-order-and-operation-unverified',
      },
      `${id}: detail-map coverage must not imply a usable boarding sequence`,
    );
    assert.equal(entry.sourceAudit.sourceSha256, evidence.sha256);
    assert.equal(entry.sourceAudit.liveOperationVerified, false);
    assert.ok(
      !graph.routes.some((item) => item.id === id),
      `${id}: excluded service entered the saved graph`,
    );
    assert.ok(
      !graph.stops.some((stop) => stop.routeIds.includes(id)),
      `${id}: excluded markers entered the saved graph`,
    );
    assert.equal(
      graph.coverage.excludedRoutes.find((item) => item.id === id)?.reason,
      'visualization-only',
    );
  }
});

test('mobility preparation excludes view-only packs with geometry while retaining a routable control', async (t) => {
  // Execute the production generator unchanged, with real local packs in an isolated root.
  // The repository graph and source data are never rewritten by this regression test.
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-view-only-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const folder of ['scripts', 'server', 'data', 'public/route-packs'])
    await mkdir(join(directory, folder), { recursive: true });
  const control = catalog.routes.find((route) => route.id === 'regioruta-a');
  assert.ok(
    control?.geometryPack,
    'The positive control must exercise the published-stop pipeline.',
  );
  const selected = [
    ...viewOnlyIds.map((id) => catalog.routes.find((route) => route.id === id)),
    control,
  ];
  await Promise.all([
    copyFile(
      new URL('scripts/prepare-mobility.mjs', root),
      join(directory, 'scripts/prepare-mobility.mjs'),
    ),
    copyFile(new URL('server/mobility.mjs', root), join(directory, 'server/mobility.mjs')),
    writeFile(
      join(directory, 'data/network.json'),
      JSON.stringify({ lines: [], stations: [], sources: [] }),
    ),
    writeFile(
      join(directory, 'data/transit-catalog.json'),
      JSON.stringify({ ...catalog, routes: selected }),
    ),
    ...selected.map((route) =>
      copyFile(
        new URL(`public/route-packs/${route.geometryPack}.json`, root),
        join(directory, `public/route-packs/${route.geometryPack}.json`),
      ),
    ),
  ]);
  await execute(process.execPath, [join(directory, 'scripts/prepare-mobility.mjs')], {
    cwd: directory,
    timeout: 30000,
  });
  const generatedBytes = await readFile(join(directory, 'data/mobility-network.json'), 'utf8');
  const generated = JSON.parse(generatedBytes);
  assert.equal(
    await readFile(join(directory, 'public/mobility-network.json'), 'utf8'),
    generatedBytes,
  );
  assert.deepEqual(
    generated.routes.map((route) => route.id),
    [control.id],
  );
  assert.ok(
    generated.stops.length >= 2,
    'A broken generator that excludes all services must fail.',
  );
  assert.ok(
    generated.stops.every((stop) => stop.routeIds.length === 1 && stop.routeIds[0] === control.id),
  );
  assert.deepEqual(
    generated.coverage.excludedRoutes.map(({ id, reason }) => ({ id, reason })),
    viewOnlyIds.map((id) => ({ id, reason: 'visualization-only' })),
  );
});
