import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createReportStore, MAX_REPORTS } from '../server/storage.mjs';
import { sanitizeReportPhoto } from '../server/report-photos.mjs';

const network = { stations: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], lines: [{ id: 'L1', name: 'Línea 1', stationIds: ['a', 'b'] }] };
const catalog = { routes: [{ id: 'route-a', name: 'Ruta A', code: '105' }, { id: 'route-b', name: 'Ruta B', code: '105' }] };
const body = { targetType: 'station', stationId: 'a', category: 'infrastructure', title: 'Falta una banca', detail: 'No hay bancas en el andén.', publicationConsent: true };
const reviewer = { reviewer: 'Persona revisora', reviewed: true, note: 'Texto y foto revisados.' };

async function fixture(t, options = {}) {
  let current = new Date();
  const app = createApp({ network, catalog, now: () => current, reportLimit: 100, ...options });
  const server = createServer(app.handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.close(); });
  return { app, get date() { return current; }, advance(days) { current = new Date(current.getTime() + days * 86400_000); },
    request: (path, payload) => fetch(`http://127.0.0.1:${server.address().port}${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) };
}
async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-reports-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return { directory, path: join(directory, 'reports.sqlite') };
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload) {
  const result = Buffer.alloc(payload.length + 12); result.writeUInt32BE(payload.length); result.write(type, 4);
  payload.copy(result, 8); result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4); return result;
}
function png({ metadata = '', width = 1, height = 1, pixel = [255, 0, 0] } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    ...(metadata ? [chunk('tEXt', Buffer.from(`GPS\0${metadata}`))] : []), chunk('IDAT', deflateSync(Buffer.from([0, ...pixel]))), chunk('IEND', Buffer.alloc(0))]);
}
const photoUrl = data => `data:image/png;base64,${data.toString('base64')}`;

test('a lost receipt and concurrent taps replay one original report without consuming new-report quota', async t => {
  const f = await fixture(t, { reportLimit: 1 });
  const submission = { ...body, draftId: randomUUID(), photo: photoUrl(png()) };
  // The caller may lose the first response after the write has committed.
  const received = await f.request('/api/reports', submission);
  assert.equal(received.status, 201);
  const original = await received.json();
  f.advance(1 / 86400);
  // Stay inside the rate-limit window while retrying after moderation.
  // The receipt is deliberately the original pending receipt, not private state.
  assert.equal(f.app.store.publish(original.report.id, reviewer, f.date), true);
  assert.equal(f.app.store.moderate(original.report.id, 'resolve', reviewer, f.date), true);
  const retries = await Promise.all(Array.from({ length: 3 }, () => f.request('/api/reports', submission)));
  for (const retry of retries) {
    assert.equal(retry.status, 201);
    assert.deepEqual(await retry.json(), original);
    assert.equal(retry.headers.get('Location'), received.headers.get('Location'));
    assert.equal(retry.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(f.app.store.summary({ status: 'all' }, f.date).total, 1);
  assert.equal(f.app.store.get(original.report.id, f.date).status, 'resolved');
  assert.equal((await f.request('/api/reports', { ...submission, draftId: randomUUID() })).status, 429);
  f.advance(1 / 1440);
  const fresh = await f.request('/api/reports', { ...submission, draftId: randomUUID() });
  assert.equal(fresh.status, 201);
  const another = await f.request('/api/reports', { ...submission, draftId: randomUUID() });
  assert.equal(another.status, 429);
  const afterLimit = await f.request('/api/reports', submission);
  assert.equal(afterLimit.status, 201);
  assert.deepEqual(await afterLimit.json(), original);
  const feed = await (await f.request('/api/reports?station=a')).json();
  assert.equal(JSON.stringify(feed).includes(submission.draftId), false);
  assert.equal(JSON.stringify(feed).includes('submissionHash'), false);
});

test('draft reuse checks normalized content, target, references, consent and processed photo', async t => {
  const f = await fixture(t);
  const submission = { ...body, targetType: 'unit', routeId: 'route-b', unitReference: 'Unidad 27', locationReference: 'Andén norte', draftId: randomUUID(), photo: photoUrl(png({ metadata: 'FIRST-METADATA' })) };
  const original = await (await f.request('/api/reports', submission)).json();
  const equivalent = await f.request('/api/reports', { ...submission, draftId: submission.draftId.toUpperCase(), title: `  ${submission.title}  `,
    photo: photoUrl(png({ metadata: 'OTHER-METADATA' })) });
  assert.equal(equivalent.status, 201);
  assert.deepEqual(await equivalent.json(), original);
  for (const change of [
    { title: 'Otra observación' }, { detail: 'Ahora cambió la descripción.' }, { category: 'accessibility' },
    { stationId: 'b' }, { routeId: 'route-a' }, { targetType: 'route', stationId: undefined, unitReference: undefined },
    { unitReference: 'Unidad 28' }, { locationReference: 'Andén sur' }, { publicationConsent: false },
    { photo: undefined }, { photo: photoUrl(png({ pixel: [0, 255, 0] })) },
  ]) {
    const conflict = await f.request('/api/reports', { ...submission, ...change });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, 'REPORT_DRAFT_CONFLICT');
  }
  assert.equal(f.app.store.summary({ status: 'all' }, f.date).total, 1);
  assert.equal(f.app.store.get(original.report.id, f.date).detail, body.detail);
  for (const draftId of [null, '', 'short', '../untrusted', 'a'.repeat(200), 123, {}, '00000000-0000-0000-0000-000000000000']) {
    const invalid = await f.request('/api/reports', { ...body, draftId });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_REPORT_DRAFT');
  }
  const legacyA = await (await f.request('/api/reports', body)).json();
  const legacyB = await (await f.request('/api/reports', body)).json();
  assert.notEqual(legacyA.report.id, legacyB.report.id, 'A client without a draft key keeps the previous contract.');
});

test('draft receipts survive restart, remain available at quota and expire with report retention', async t => {
  const { path } = await temporaryDatabase(t);
  const date = new Date(), submission = { ...body, draftId: randomUUID(), photoMime: 'image/png', photoData: png() };
  let store = createReportStore(path);
  const original = store.add(submission, date);
  store.publish(original.id, reviewer, date);
  store.close();
  const db = new DatabaseSync(path), created = date.toISOString();
  const insert = db.prepare("INSERT INTO reports(id, station_id, target_type, title, category, detail, created_at) VALUES (?, 'a', 'station', 'Reporte', 'condition', 'Puerta averiada', ?)");
  db.exec('BEGIN'); for (let i = 1; i < MAX_REPORTS; i++) insert.run(String(i), created); db.exec('COMMIT'); db.close();
  store = createReportStore(path);
  try {
    assert.deepEqual(store.add(submission, date, { beforeCreate() { assert.fail('A replay is not a new submission.'); } }), original);
    assert.throws(() => store.add({ ...submission, draftId: randomUUID() }, date), { code: 'REPORT_STORAGE_FULL' });
    const expired = new Date(date.getTime() + 91 * 86400_000);
    assert.equal(store.get(original.id, expired), undefined);
    assert.equal(store.moderationHistory(original.id).length, 0);
    const replacement = store.add(submission, expired);
    assert.notEqual(replacement.id, original.id);
    assert.equal(store.summary({ status: 'all' }, expired).total, 1);
  } finally { store.close(); }
});

test('version 2 migration adds idempotency without rewriting existing evidence or moderation history', async t => {
  const { path } = await temporaryDatabase(t);
  const date = new Date().toISOString(), originalPhoto = png();
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE reports (
    id TEXT PRIMARY KEY, station_id TEXT, route_id TEXT, target_type TEXT, title TEXT,
    category TEXT, detail TEXT, unit_reference TEXT, location_reference TEXT, photo_mime TEXT,
    photo_data BLOB, publication_consent INTEGER, created_at TEXT, status TEXT
  );
  CREATE TABLE report_moderation_events (
    id INTEGER PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    action TEXT NOT NULL, reviewer TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
  ); PRAGMA user_version = 2;`);
  db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('original', 'a', null, 'station', body.title,
    body.category, body.detail, null, null, 'image/png', originalPhoto, 1, date, 'published');
  db.prepare('INSERT INTO report_moderation_events(report_id, action, reviewer, note, created_at) VALUES (?,?,?,?,?)').run('original', 'publish', reviewer.reviewer, reviewer.note, date);
  db.close();
  let store = createReportStore(path);
  assert.equal(store.get('original').status, 'published');
  assert.deepEqual(Buffer.from(store.get('original').photo_data), originalPhoto);
  assert.equal(store.get('original').draft_id, null);
  assert.equal(store.get('original').submission_hash, null);
  assert.equal(store.moderationHistory('original')[0].note, reviewer.note);
  const submission = { ...body, draftId: randomUUID() };
  const receipt = store.add(submission);
  store.close();
  store = createReportStore(path);
  assert.deepEqual(store.add(submission), receipt);
  assert.equal(store.moderationHistory('original').length, 1);
  store.close();
  const check = new DatabaseSync(path);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 3);
  assert.throws(() => check.prepare('UPDATE reports SET draft_id = ? WHERE id = ?').run(submission.draftId, 'original'), /constraint/i);
  check.close();
});

test('explicit route identity separates duplicate route codes and never assigns a default station to units', async t => {
  const f = await fixture(t);
  const unit = { ...body, targetType: 'unit', stationId: undefined, routeId: 'route-b', unitReference: '105' };
  const created = await f.request('/api/reports', unit);
  assert.equal(created.status, 201);
  const report = (await created.json()).report;
  assert.equal(report.routeId, 'route-b'); assert.equal(report.stationId, null);
  assert.equal(f.app.store.get(report.id).route_id, 'route-b');
  assert.equal((await (await f.request('/api/reports?route=route-b')).json()).reports.length, 0);
  assert.equal(f.app.store.publish(report.id, reviewer, f.date), true);
  const byRoute = await (await f.request('/api/reports?route=route-b')).json();
  assert.equal(byRoute.reports[0].id, report.id); assert.equal(byRoute.reports[0].status, 'published');
  assert.equal((await (await f.request('/api/reports?route=route-a')).json()).reports.length, 0);
  assert.equal((await (await f.request('/api/reports?station=a')).json()).reports.length, 0);
  const missingRoute = await f.request('/api/reports', { ...unit, routeId: undefined });
  assert.equal(missingRoute.status, 400, 'A free text unit reference never substitutes for a selected route.');
  const routeIssue = await f.request('/api/reports', { ...unit, targetType: 'route', unitReference: undefined, locationReference: 'Av. Principal y Calle 2' });
  assert.equal(routeIssue.status, 201);
  const issue = (await routeIssue.json()).report;
  assert.equal(issue.targetType, 'route'); assert.equal(issue.locationReference, 'Av. Principal y Calle 2');
});

test('new reports validate targets, consent, infrastructure and reference limits while old clients remain private', async t => {
  const f = await fixture(t);
  for (const invalid of [
    { ...body, stationId: undefined }, { ...body, targetType: 'other' }, { ...body, routeId: 'route-a' },
    { ...body, title: undefined }, { ...body, publicationConsent: undefined }, { ...body, publicationConsent: 'true' },
    { ...body, category: 'payments' }, { ...body, unitReference: 'unexpected unit' },
    { ...body, targetType: 'unit', routeId: 'route-a', unitReference: 'x'.repeat(81) },
    { ...body, targetType: 'unit', routeId: 'route-a', unitReference: 'line\nbreak' },
    { ...body, targetType: 'route', stationId: undefined, routeId: 'route-a', locationReference: 'x'.repeat(121) },
  ]) assert.equal((await f.request('/api/reports', invalid)).status, 400);
  assert.equal((await f.request('/api/reports', { ...body, targetType: 'unit', stationId: undefined, routeId: 'unknown' })).status, 404);
  const old = await f.request('/api/reports', { stationId: 'a', category: 'condition', detail: 'Una puerta\nestá averiada.' });
  assert.equal(old.status, 201);
  const report = (await old.json()).report;
  assert.equal(report.status, 'pending'); assert.equal(report.title, 'Una puerta está averiada.'); assert.equal(f.app.store.get(report.id).publication_consent, 0);
  assert.equal(f.app.store.publish(report.id, reviewer, f.date), false);
  assert.equal((await (await f.request('/api/reports?station=a')).json()).reports.length, 0);
});

test('photos lose metadata before storage, stay private until consented review and expire even without a list read', async t => {
  const f = await fixture(t);
  const source = png({ metadata: 'PRIVATE-GPS-COORDINATES' });
  const response = await f.request('/api/reports', { ...body, photo: photoUrl(source) });
  assert.equal(response.status, 201);
  const { report } = await response.json(), url = `/api/reports/${report.id}/photo`;
  assert.equal(Buffer.from(f.app.store.get(report.id).photo_data).includes(Buffer.from('PRIVATE-GPS')), false);
  assert.equal((await f.request(url)).status, 404);
  assert.throws(() => f.app.store.publish(report.id, { reviewer: 'A' }, f.date), /revisión/);
  assert.equal(f.app.store.publish(report.id, reviewer, f.date), true);
  let photo = await f.request(url);
  assert.equal(photo.status, 200); assert.equal(photo.headers.get('Cache-Control'), 'no-store');
  assert.equal(Buffer.from(await photo.arrayBuffer()).includes(Buffer.from('PRIVATE-GPS')), false);
  f.advance(91);
  assert.equal((await f.request(url)).status, 404, 'The photo endpoint checks expiration itself.');
  assert.equal((await (await f.request('/api/reports/summary?station=a')).json()).total, 0);
});

test('reject, resolve and unpublish have an audit trail and summaries distinguish open from resolved reports', async t => {
  const f = await fixture(t);
  const a = f.app.store.add({ ...body, photoMime: 'image/png', photoData: png() }, f.date);
  const b = f.app.store.add({ ...body, category: 'accessibility' }, f.date);
  const c = f.app.store.add({ ...body, publicationConsent: false }, f.date);
  assert.equal(f.app.store.publish(a.id, reviewer, f.date), true);
  assert.equal(f.app.store.publish(b.id, reviewer, f.date), true);
  assert.equal(f.app.store.publish(c.id, reviewer, f.date), false);
  assert.equal(f.app.store.moderate(b.id, 'resolve', reviewer, f.date), true);
  let summary = await (await f.request('/api/reports/summary?station=a')).json();
  assert.equal(summary.total, 2); assert.equal(summary.open, 1); assert.equal(summary.resolved, 1);
  assert.deepEqual((await (await f.request('/api/reports?station=a')).json()).summary,
    { total: 2, open: 1, resolved: 1, byCategory: { accessibility: { total: 1, open: 0, resolved: 1 }, infrastructure: { total: 1, open: 1, resolved: 0 } } });
  assert.equal(summary.byCategory.infrastructure.open, 1); assert.equal(summary.byCategory.accessibility.resolved, 1);
  assert.equal(f.app.store.moderate(a.id, 'unpublish', reviewer, f.date), true);
  assert.equal((await f.request(`/api/reports/${a.id}/photo`)).status, 404);
  assert.equal(f.app.store.moderate(a.id, 'reject', reviewer, f.date), true);
  summary = await (await f.request('/api/reports/summary?station=a')).json();
  assert.equal(summary.total, 1); assert.equal(summary.open, 0);
  assert.deepEqual(f.app.store.moderationHistory(a.id).map(row => row.action), ['publish', 'unpublish', 'reject']);
  assert.equal((await f.request('/api/reports?station=a&route=route-a')).status, 400);
});

test('photo validation rejects signature-only files, corrupt PNGs, huge dimensions and unsupported data URLs', async t => {
  const f = await fixture(t);
  const corrupted = png(); corrupted[corrupted.length - 1] ^= 1;
  for (const photo of [photoUrl(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])), photoUrl(corrupted),
    photoUrl(png({ width: 4096, height: 4096 })), 'data:image/jpeg;base64,/9j/2Q==', 'data:image/svg+xml;base64,PHN2Zy8+']) {
    const response = await f.request('/api/reports', { ...body, photo });
    assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_PHOTO');
  }
});

test('JPEG application metadata and WebP extended metadata are removed while image data survives', () => {
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z', 'base64');
  const metadata = Buffer.from('Exif\0PRIVATE-GPS'), app1 = Buffer.alloc(4); app1[0] = 0xff; app1[1] = 0xe1; app1.writeUInt16BE(metadata.length + 2, 2);
  const sanitized = sanitizeReportPhoto('image/jpeg', Buffer.concat([jpeg.subarray(0, 2), app1, metadata, jpeg.subarray(2)]));
  assert.equal(sanitized.includes(Buffer.from('PRIVATE-GPS')), false); assert.equal(sanitized.readUInt16BE(0), 0xffd8);
  assert.ok(sanitized.length < jpeg.length + metadata.length);
  const webp = Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=', 'base64');
  const xmp = Buffer.from('PRIVATE-GPS '), header = Buffer.alloc(8); header.write('XMP '); header.writeUInt32LE(xmp.length, 4);
  const withMetadata = Buffer.concat([webp, header, xmp]); withMetadata.writeUInt32LE(withMetadata.length - 8, 4);
  assert.deepEqual(sanitizeReportPhoto('image/webp', withMetadata), webp);
});

test('legacy database migration is atomic, idempotent, preserves private reports and permits route-only infrastructure', async t => {
  const { path } = await temporaryDatabase(t);
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE reports(id TEXT PRIMARY KEY, station_id TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('condition','crowding','climate','accessibility')), detail TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unverified');`);
  old.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?)').run('old', 'a', 'condition', 'Una puerta averiada.', new Date().toISOString(), 'unverified'); old.close();
  let store = createReportStore(path);
  assert.equal(store.get('old').status, 'pending'); assert.equal(store.get('old').publication_consent, 0);
  assert.equal(store.list('a').length, 0);
  const route = store.add({ ...body, targetType: 'route', stationId: undefined, routeId: 'route-a' });
  assert.equal(route.stationId, null); store.close();
  store = createReportStore(path);
  assert.equal(store.get(route.id).category, 'infrastructure'); assert.equal(store.get('old').detail, 'Una puerta averiada.'); store.close();
  const check = new DatabaseSync(path);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(check.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'reports_legacy'").get().count, 0); check.close();
});

test('a failed migration rolls back the original table rather than leaving half a schema', async t => {
  const { path } = await temporaryDatabase(t);
  const old = new DatabaseSync(path);
  old.exec('CREATE TABLE reports(id TEXT PRIMARY KEY, station_id TEXT, category TEXT, detail TEXT, created_at TEXT, status TEXT)');
  old.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?)').run('invalid', 'a', 'condition', 'ab', new Date().toISOString(), 'unverified'); old.close();
  assert.throws(() => createReportStore(path), /constraint/i);
  const original = new DatabaseSync(path);
  assert.equal(original.prepare('SELECT detail FROM reports').get().detail, 'ab');
  assert.equal(original.prepare('PRAGMA user_version').get().user_version, 0); original.close();
});

test('migration preserves unassigned legacy units privately and sanitizes existing attachments', async t => {
  const { path } = await temporaryDatabase(t);
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE reports(id TEXT PRIMARY KEY, station_id TEXT NOT NULL, category TEXT, detail TEXT,
    created_at TEXT, status TEXT, title TEXT, target_type TEXT, route_id TEXT, publication_consent INTEGER,
    photo_mime TEXT, photo_data BLOB)`);
  db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('old-unit', 'a', 'condition', 'Una unidad averiada.', new Date().toISOString(),
    'published', 'Unidad averiada', 'unit', null, 1, 'image/png', png({ metadata: 'PRIVATE-LEGACY-GPS' })); db.close();
  const store = createReportStore(path);
  try {
    const report = store.get('old-unit');
    assert.equal(report.target_type, 'unit'); assert.equal(report.route_id, null);
    assert.equal(report.status, 'pending'); assert.equal(report.publication_consent, 0);
    assert.equal(Buffer.from(report.photo_data).includes(Buffer.from('PRIVATE-LEGACY-GPS')), false);
    assert.equal(store.publish('old-unit', reviewer), false);
    assert.equal(store.list('a').length, 0);
  } finally { store.close(); }
});

test('storage quota refuses an additional report without deleting existing evidence', async t => {
  const { path } = await temporaryDatabase(t);
  createReportStore(path).close();
  const db = new DatabaseSync(path), created = new Date().toISOString();
  const insert = db.prepare("INSERT INTO reports(id, station_id, target_type, title, category, detail, created_at) VALUES (?, 'a', 'station', 'Reporte', 'condition', 'Puerta averiada', ?)");
  db.exec('BEGIN'); for (let i = 0; i < MAX_REPORTS; i++) insert.run(String(i), created); db.exec('COMMIT'); db.close();
  const store = createReportStore(path);
  try { assert.throws(() => store.add(body), { code: 'REPORT_STORAGE_FULL' }); assert.equal(store.summary({ status: 'all' }).total, MAX_REPORTS); }
  finally { store.close(); }
});

test('moderation CLI supports private review, secure photo export, explicit approval and removal', async t => {
  const { directory, path } = await temporaryDatabase(t);
  let store = createReportStore(path);
  const report = store.add({ ...body, photoMime: 'image/png', photoData: png() }); store.close();
  const run = (...args) => spawnSync(process.execPath, [resolve('scripts/moderate-report.mjs'), path, ...args], { encoding: 'utf8' });
  let result = run('list'); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout)[0].id, report.id);
  result = run('show', report.id); assert.equal(result.status, 0); assert.equal(result.stdout.includes('photo_data'), false);
  assert.equal(JSON.parse(result.stdout).photoBytes, png().length);
  const destination = join(directory, 'private-photo.png');
  assert.equal(run('export-photo', report.id, destination).status, 0);
  if (process.platform !== 'win32') assert.equal((await stat(destination)).mode & 0o777, 0o600);
  assert.deepEqual(await readFile(destination), png()); assert.equal(run('export-photo', report.id, destination).status, 1);
  assert.equal(run('publish', report.id, '--reviewer', 'Ana').status, 1);
  assert.equal(run('publish', report.id, '--reviewer', 'Ana', '--reviewed').status, 0);
  assert.equal(JSON.parse(run('summary').stdout).open, 1);
  assert.equal(run('resolve', report.id, '--reviewer', 'Ana').status, 0);
  assert.equal(JSON.parse(run('summary').stdout).resolved, 1);
  assert.equal(run('unpublish', report.id, '--reviewer', 'Ana').status, 0);
  store = createReportStore(path);
  assert.equal(store.list('a').length, 0); assert.equal(store.getPublicPhoto(report.id), undefined); store.close();
});
