import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReportStore } from '../server/storage.mjs';

const now = new Date('2026-10-29T18:00:00Z');
const daysAgo = (days) => new Date(now.getTime() - days * 86400_000);
const hoursAfter = (date, hours) => new Date(date.getTime() + hours * 3600_000);
const observation = {
  stationId: 'a',
  targetType: 'station',
  category: 'infrastructure',
  title: 'Banca sin asiento',
  detail: 'Una banca requiere revisión.',
  publicationConsent: true,
};
const reviewer = { reviewer: 'authenticated-user-1', note: 'Contenido revisado.', reviewed: true };

test('private review queries paginate deterministically, filter with parameters and omit submission secrets', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  const first = store.add({ ...observation, draftId: randomUUID() }, daysAgo(2));
  const second = store.add(
    {
      ...observation,
      stationId: undefined,
      routeId: 'variant-b',
      targetType: 'unit',
      category: 'condition',
      unitReference: 'Referencia privada',
      publicationConsent: false,
    },
    daysAgo(1),
  );
  const page = store.adminList({ status: 'all', limit: 1 }, now);
  assert.equal(page.total, 2);
  assert.equal(page.reports[0].id, second.id);
  assert.equal(page.reports[0].publicationConsent, false);
  assert.equal(page.reports[0].hasPhoto, false);
  assert.equal(
    store.adminList({ status: 'all', limit: 1, offset: 1 }, now).reports[0].id,
    first.id,
  );
  assert.equal(
    store.adminList({ category: 'condition', targetType: 'unit', routeId: 'variant-b' }, now).total,
    1,
  );
  assert.equal(store.adminList({ stationId: "a' OR 1=1 --" }, now).total, 0);
  for (const bad of [
    { status: "pending' OR 1=1" },
    { category: 'missing' },
    { targetType: 'photo' },
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { offset: 5001 },
    { stationId: '\0' },
  ])
    assert.throws(() => store.adminList(bad, now), RangeError);
  const detail = store.adminDetail(first.id, now);
  assert.equal(detail.version, 'pending:0');
  assert.deepEqual(detail.history, []);
  for (const secret of [
    'draft_id',
    'draftId',
    'submission_hash',
    'submissionHash',
    'photo_data',
    'photoData',
  ]) {
    assert.equal(Object.hasOwn(detail, secret), false);
    assert.equal(Object.hasOwn(page.reports[0], secret), false);
  }
  assert.equal(store.adminDetail('missing', now), null);
  assert.equal(store.adminPhoto(first.id, now), null);
});

test('review versions reject stale decisions even after returning to the same status and survive restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-admin-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'reports.sqlite');
  let store = createReportStore(path);
  t.after(() => store.close());
  const report = store.add(observation, daysAgo(1));
  const stale = store.adminDetail(report.id, now).version;
  assert.equal(
    store.moderate(report.id, 'publish', { ...reviewer, expectedVersion: stale }, now),
    true,
  );
  let version = store.adminDetail(report.id, now).version;
  assert.equal(
    store.moderate(report.id, 'unpublish', { ...reviewer, expectedVersion: version }, now),
    true,
  );
  assert.equal(store.get(report.id, now).status, 'pending');
  assert.equal(
    store.moderate(report.id, 'reject', { ...reviewer, expectedVersion: stale }, now),
    false,
  );
  version = store.adminDetail(report.id, now).version;
  assert.notEqual(version, stale);
  store.close();
  store = createReportStore(path);
  assert.equal(store.adminDetail(report.id, now).version, version);
  assert.equal(
    store.moderate(report.id, 'publish', { ...reviewer, expectedVersion: version }, now),
    true,
  );
  assert.equal(
    store.moderate(report.id, 'resolve', { ...reviewer, expectedVersion: version }, now),
    false,
  );
  const history = store.adminDetail(report.id, now).history;
  assert.equal(history.length, 3);
  assert.ok(history.every((event) => event.reviewer === reviewer.reviewer));
  assert.throws(
    () => store.moderate(report.id, 'reject', { ...reviewer, expectedVersion: {} }, now),
    RangeError,
  );
  const privateReport = store.add({ ...observation, publicationConsent: false }, now);
  assert.equal(
    store.moderate(privateReport.id, 'publish', { ...reviewer, expectedVersion: 'pending:0' }, now),
    false,
  );
});

test('indicators count retained observations and first reviews, without exposing text or private unit references', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  const a = store.add(observation, daysAgo(10));
  const b = store.add({ ...observation, category: 'condition' }, daysAgo(9));
  const c = store.add(observation, daysAgo(8));
  const pending = store.add(
    {
      ...observation,
      stationId: undefined,
      routeId: 'variant-b',
      targetType: 'unit',
      unitReference: 'Unidad privada de prueba',
    },
    daysAgo(8),
  );
  store.moderate(a.id, 'publish', reviewer, hoursAfter(daysAgo(10), 2));
  store.moderate(b.id, 'reject', reviewer, hoursAfter(daysAgo(9), 6));
  store.moderate(c.id, 'publish', reviewer, hoursAfter(daysAgo(8), 4));
  store.moderate(c.id, 'resolve', reviewer, hoursAfter(daysAgo(8), 20));
  const result = store.adminDashboard(now);
  assert.deepEqual(
    { ...result.counters },
    { total: 4, pending: 1, published: 1, resolved: 1, rejected: 1 },
  );
  assert.deepEqual(
    { ...result.queue },
    { oldestPendingAt: pending.createdAt, pendingOver7Days: 1 },
  );
  assert.deepEqual(result.review, { reviewedCount: 3, medianHours: 4, p95Hours: 6 });
  assert.equal(result.capacity.reportCount, 4);
  assert.equal(result.capacity.reportLimit, 5000);
  assert.equal(result.capacity.photoBytes, 0);
  assert.equal(result.capacity.photoBytesLimit, 50_000_000);
  assert.equal(
    result.byCategory.reduce((total, row) => total + row.count, 0),
    4,
  );
  assert.equal(
    result.targets.reduce((total, row) => total + row.count, 0),
    4,
  );
  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes(observation.detail), false);
  assert.equal(encoded.includes('Unidad privada'), false);
});

test('quiet retention cleanup removes reports and their audit events without requiring a public query', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  const report = store.add(observation, daysAgo(91));
  store.moderate(report.id, 'publish', reviewer, daysAgo(90));
  assert.equal(store.usage().reportCount, 1);
  assert.equal(store.pruneExpired(now), 1);
  assert.equal(store.usage().reportCount, 0);
  assert.deepEqual(store.moderationHistory(report.id), []);
  assert.equal(store.adminDetail(report.id, now), null);
  assert.equal(store.adminPhoto(report.id, now), null);
  assert.deepEqual(store.adminDashboard(now).review, {
    reviewedCount: 0,
    medianHours: null,
    p95Hours: null,
  });
});

test('aggregate distribution is bounded while totals still include every retained target', (t) => {
  const store = createReportStore();
  t.after(() => store.close());
  for (let index = 0; index < 105; index++)
    store.add(
      { ...observation, stationId: undefined, targetType: 'route', routeId: `variant-${index}` },
      now,
    );
  const dashboard = store.adminDashboard(now);
  assert.equal(dashboard.counters.total, 105);
  assert.equal(dashboard.targets.length, 100);
  assert.equal(dashboard.targetGroupsTotal, 105);
  assert.equal(dashboard.targetsTruncated, true);
});
