import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, CONTENT_SECURITY_POLICY } from '../server/app.mjs';

const network = {
  stations: [{ id: 'a', name: 'A', lat: 25.67, lng: -100.32 }, { id: 'b', name: 'B', lat: 25.68, lng: -100.32 }],
  lines: [{ id: 'L1', name: 'Línea 1', stationIds: ['a', 'b'] }],
};
const mobilityNetwork = {
  bounds: [-100.8, 25.35, -99.8, 26.1],
  stops: network.stations.map(stop => ({ ...stop, id: `metro:${stop.id}`, stationId: stop.id, mode: 'metro', routeIds: ['L1'], official: true })),
  routes: [{ id: 'L1', name: 'Línea 1', code: 'L1', mode: 'metro', networkId: 'metrorrey', stopOrderVerified: true, directionVerified: true,
    segments: [{ id: 'L1:0', stopIds: ['metro:a', 'metro:b'], coordinates: [[-100.32, 25.67], [-100.32, 25.68]], positions: [0, 1] }] }],
};

function fixture(t, options = {}) {
  let time = new Date('2026-10-18T18:00:00Z').getTime();
  const app = createApp({ network, mobilityNetwork, now: () => new Date(time), ...options });
  t.after(() => app.close());
  return {
    advance: milliseconds => { time += milliseconds; },
    async request(url, { body, headers = {} } = {}) {
      const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
      Object.assign(stream, { url, method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
      const received = new Headers();
      let status;
      let payload;
      const response = { headersSent: false, setHeader: (key, value) => received.set(key, value),
        writeHead(code, values) { status = code; for (const [key, value] of Object.entries(values)) received.set(key, value); this.headersSent = true; },
        end(value = '') { payload = value; } };
      await app.handler(stream, response);
      return { status, headers: received, body: payload ? JSON.parse(payload) : null };
    },
  };
}

test('web and API send the same restrictive CSP as Pages without blocking bundled workers or tiles', async t => {
  const { request } = fixture(t);
  const headersFile = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.ok(headersFile.includes(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`));
  for (const path of ['/api/health', '/api/missing', '/missing']) {
    const response = await request(path);
    assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Permissions-Policy'), 'geolocation=(self), camera=(), microphone=()');
  }
  const directives = new Map(CONTENT_SECURITY_POLICY.split('; ').map(directive => {
    const [name, ...sources] = directive.split(' ');
    return [name, sources];
  }));
  assert.deepEqual(directives.get('script-src'), ["'self'"]);
  assert.deepEqual(directives.get('worker-src'), ["'self'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.ok(directives.get('img-src').includes('https://tile.openstreetmap.org'));
  assert.ok(directives.get('connect-src').includes('https://regiomovil-api.onrender.com'));
});

test('expensive Metro and multimodal planning share a small budget and ignore forged forwarded identities', async t => {
  const { request, advance } = fixture(t);
  for (let i = 0; i < 20; i++) {
    const response = i % 2 === 0
      ? await request('/api/plan?from=a&to=b')
      : await request('/api/mobility/plan', { body: { from: { id: 'metro:a' }, to: { id: 'metro:b' }, offline: true } });
    assert.equal(response.status, 200);
  }
  const limited = await request('/api/mobility/plan', { headers: { 'x-forwarded-for': '198.51.100.1' }, body: { from: { id: 'metro:a' }, to: { id: 'metro:b' }, offline: true } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  // Busy route calculation does not prevent loading cached network/health data.
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/network')).status, 200);
  advance(60_000);
  assert.equal((await request('/api/plan?from=a&to=b')).status, 200);
});

test('report files and SQLite journals are private even with a permissive process umask', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-private-db-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'reports.sqlite');
  const previousMask = process.umask(0);
  let request;
  try { ({ request } = fixture(t, { databasePath: path })); }
  finally { process.umask(previousMask); }
  const response = await request('/api/reports', { body: { stationId: 'a', category: 'condition', detail: 'Puerta observada fuera de servicio.' } });
  assert.equal(response.status, 201);
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  }
});

test('community HTML remains plain unverified JSON and cannot change response security headers', async t => {
  const { request } = fixture(t);
  const detail = '<img src=x onerror="alert(document.cookie)">';
  const created = await request('/api/reports', { body: { stationId: 'a', category: 'condition', detail } });
  assert.equal(created.status, 201);
  assert.equal(created.body.report.status, 'unverified');
  const read = await request('/api/reports?station=a');
  assert.equal(read.body.reports[0].detail, detail);
  assert.match(read.headers.get('Content-Type'), /^application\/json/);
  assert.equal(read.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(read.headers.get('Cache-Control'), 'no-store');
  const denied = await request('/api/reports', { headers: { origin: 'https://attacker.example' }, body: { stationId: 'a', category: 'condition', detail: 'No se debe guardar.' } });
  assert.equal(denied.status, 403);
  assert.equal((await request('/api/reports?station=a')).body.reports.length, 1);
});
