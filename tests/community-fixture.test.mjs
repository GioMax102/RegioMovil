import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { communityFixture, COMMUNITY_EXPECTED } from '../server/community-fixture.mjs';
import { populateAdminDemo } from '../server/admin-demo.mjs';
import { createReportStore, REPORT_CATEGORIES } from '../server/storage.mjs';

const network = JSON.parse(
  await readFile(new URL('../data/network.json', import.meta.url), 'utf8'),
);
const catalog = JSON.parse(
  await readFile(new URL('../data/transit-catalog.json', import.meta.url), 'utf8'),
);
const now = new Date('2026-11-08T18:00:00.000Z');
const options = { network, catalog, seed: 'community-08', date: now };

test('community corpus is reproducible, varied and covers every published route publicly', () => {
  const corpus = communityFixture(options);
  assert.deepEqual(corpus, communityFixture(options));
  assert.notEqual(
    corpus.contentSha256,
    communityFixture({ ...options, seed: 'another-seed' }).contentSha256,
  );
  assert.equal(corpus.records.length, 1200);
  assert.ok(new Set(corpus.records.map((row) => row.detail)).size > 400);
  assert.deepEqual(
    Object.fromEntries(
      ['published', 'resolved', 'pending', 'rejected'].map((status) => [
        status,
        corpus.records.filter((row) => row.status === status).length,
      ]),
    ),
    { published: 840, resolved: 180, pending: 120, rejected: 60 },
  );
  const approved = corpus.records.filter((row) => row.publicationConsent);
  assert.deepEqual(
    new Set(approved.map((row) => row.stationId).filter(Boolean)),
    new Set(network.stations.map((station) => station.id)),
  );
  assert.deepEqual(
    new Set(approved.map((row) => row.routeId).filter(Boolean)),
    new Set(
      catalog.routes
        .filter((route) => route.mode !== 'metro' && route.status === 'published')
        .map((route) => route.id),
    ),
  );
  assert.deepEqual(new Set(approved.map((row) => row.category)), new Set(REPORT_CATEGORIES));
  assert.equal(approved.filter((row) => row.stationId === 'felix-u-gomez').length, 255);
  assert.equal(
    approved.filter((row) => row.routeId === 'transmetro-san-bernabe-no-reeleccion').length,
    272,
  );
  for (const row of corpus.records) {
    assert.doesNotMatch(`${row.title} ${row.detail}`, /demo|sint[eé]tic|fictici|ejemplo/i);
    assert.ok(row.title.length >= 3 && row.title.length <= 100);
    assert.ok(row.detail.length >= 10 && row.detail.length <= 500);
    assert.ok(Date.parse(row.createdAt) <= now.getTime() - 3 * 3_600_000);
    assert.ok(Date.parse(row.createdAt) > now.getTime() - 71 * 86_400_000);
    assert.equal(row.photoData, undefined);
    assert.equal(row.photoMime, undefined);
  }
});

test('community uses ordinary moderation, keeps private rows private and persists provenance', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-community-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'reports.sqlite');
  const manifest = populateAdminDemo(path, {
    ...options,
    profile: 'community',
    referenceDate: now,
  });
  assert.equal(manifest.profile, 'community');
  assert.equal(manifest.contentSha256, communityFixture(options).contentSha256);
  assert.deepEqual(manifest.expected, COMMUNITY_EXPECTED);
  const store = createReportStore(path);
  t.after(() => store.close());
  assert.deepEqual(
    { ...store.adminDashboard(now).counters },
    { total: 1200, pending: 120, published: 840, resolved: 180, rejected: 60 },
  );
  assert.equal(store.summary({}, now).total, 1020);
  assert.equal(store.summary({ stationId: 'felix-u-gomez' }, now).total, 255);
  assert.equal(store.summary({ routeId: 'transmetro-san-bernabe-no-reeleccion' }, now).total, 272);
  assert.equal(store.datasetInfo().kind, 'synthetic');
  assert.equal(store.datasetInfo().label, 'Visualización · datos sintéticos');
  assert.equal(store.datasetInfo().seed, options.seed);
  assert.equal(store.usage().photoBytes, 0);
  assert.ok(
    store
      .list('felix-u-gomez', 100, now)
      .every((row) => ['published', 'resolved'].includes(row.status)),
  );
  const db = new DatabaseSync(path, { readOnly: true });
  t.after(() => db.close());
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM report_moderation_events').get().count,
    1260,
  );
  assert.equal(
    db
      .prepare('SELECT COUNT(*) AS count FROM report_moderation_events WHERE created_at > ?')
      .get(now.toISOString()).count,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status IN ('published','resolved') AND publication_consent != 1",
      )
      .get().count,
    0,
  );
  assert.throws(
    () => populateAdminDemo(path, { ...options, referenceDate: now, profile: 'community' }),
    /vacía/,
  );
});

test('community validates required geography and profile before creating a database', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-community-validation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, values] of [
    ['profile', { ...options, profile: 'missing' }],
    ['station', { ...options, network: { stations: [] }, profile: 'community' }],
    ['route', { ...options, catalog: { routes: [] }, profile: 'community' }],
  ]) {
    const path = join(directory, `${name}.sqlite`);
    assert.throws(
      () => populateAdminDemo(path, { ...values, referenceDate: now }),
      /Perfil|requiere/,
    );
    await assert.rejects(access(path));
  }
});

test('CLI community profile writes its manifest without changing the default map fixture', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'regiomovil-community-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'regiomovil-admin-demo-community');
  const result = spawnSync(
    process.execPath,
    [
      'scripts/admin-demo.mjs',
      '--directory',
      directory,
      '--profile',
      'community',
      '--seed',
      options.seed,
      '--date',
      now.toISOString(),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.contentSha256, communityFixture(options).contentSha256);
  assert.equal(manifest.expected.total, 1200);
  assert.match(await readFile(join(directory, 'demo.env'), 'utf8'), /PORT=4180/);
  const invalid = join(root, 'regiomovil-admin-demo-invalid');
  assert.notEqual(
    spawnSync(
      process.execPath,
      ['scripts/admin-demo.mjs', '--directory', invalid, '--profile', 'missing'],
      { encoding: 'utf8' },
    ).status,
    0,
  );
  await assert.rejects(access(invalid));
});
