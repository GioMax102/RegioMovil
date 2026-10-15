import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../server/app.mjs';
import { createPlaceSearchState } from '../server/places.mjs';

const network = { stations: [{ id: 'a', name: 'A', lat: 25.67, lng: -100.32 }, { id: 'b', name: 'B', lat: 25.68, lng: -100.32 }], lines: [{ id: 'L1', name: 'Línea 1', stationIds: ['a', 'b'] }] };
const mobilityNetwork = {
  bounds: [-100.8, 25.35, -99.8, 26.1],
  stops: network.stations.map(stop => ({ ...stop, id: `metro:${stop.id}`, stationId: stop.id, mode: 'metro', routeIds: ['L1'], official: true })),
  routes: [{ id: 'L1', name: 'Línea 1', code: 'L1', mode: 'metro', networkId: 'metrorrey', stopOrderVerified: true, directionVerified: true, segments: [{ id: 'L1:0', stopIds: ['metro:a', 'metro:b'], coordinates: [[-100.32, 25.67], [-100.32, 25.68]], positions: [0, 1] }] }],
};
const validBody = { from: { id: 'metro:a' }, to: { id: 'metro:b' }, preference: 'fastest', scenario: 'normal', offline: true };

function fixture(t, options = {}) {
  const app = createApp({ network, mobilityNetwork, now: () => new Date('2026-10-15T18:00:00Z'), ...options });
  t.after(() => app.close());
  const request = async (url, { method = 'GET', body, headers = {} } = {}) => {
    const input = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    const stream = Readable.from([Buffer.from(input)]);
    Object.assign(stream, { url, method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const outputHeaders = new Headers();
    let status;
    let payload;
    const response = { headersSent: false, setHeader: (key, value) => outputHeaders.set(key, value), writeHead(code, values) { status = code; for (const [key, value] of Object.entries(values)) outputHeaders.set(key, value); this.headersSent = true; }, end(value = '') { payload = value; } };
    await app.handler(stream, response);
    return { status, headers: outputHeaders, body: payload ? JSON.parse(payload) : null };
  };
  return { request, app };
}

test('mobility API exposes only the public artifact and keeps original Metro network intact', async t => {
  const { request } = fixture(t);
  const response = await request('/api/mobility/network');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, mobilityNetwork);
  assert.match(response.headers.get('Cache-Control'), /public/);
  assert.deepEqual((await request('/api/network')).body, network);
  for (const url of ['/api/mobility/network', '/api/places']) assert.equal((await request(url, { method: 'POST' })).status, 405);
  assert.equal((await request('/api/mobility/plan')).status, 405);
});

test('mobility plan uses the portable model, responds no-store and never persists itinerary coordinates', async t => {
  const { request, app } = fixture(t);
  const offline = await request('/api/mobility/plan', { method: 'POST', body: validBody });
  assert.equal(offline.status, 200);
  assert.equal(offline.body.mode, 'experimental');
  assert.ok(offline.body.journeys.length > 0);
  assert.equal(offline.body.offline, true);
  assert.equal(offline.headers.get('Cache-Control'), 'no-store');
  const online = await request('/api/mobility/plan', { method: 'POST', body: { ...validBody, offline: false, from: { kind: 'location', name: 'Ubicación actual', lat: 25.6701, lng: -100.3201 } } });
  assert.equal(online.status, 200);
  assert.ok(online.body.journeys.length > 0);
  assert.equal(online.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(app.store.list('a', 20, new Date()), []);
});

test('offline API rejects arbitrary locations and model validation remains actionable', async t => {
  const { request } = fixture(t);
  for (const [patch, code] of [
    [{ from: { kind: 'location', lat: 25.67, lng: -100.32 } }, 'OFFLINE_STOP_ONLY'],
    [{ to: { id: 'invented' } }, 'UNKNOWN_STOP'],
    [{ offline: false, from: { kind: 'place', lat: 20, lng: -100 } }, 'OUTSIDE_COVERAGE'],
    [{ preference: 'invented' }, 'INVALID_PREFERENCE'],
    [{ scenario: 'invented' }, 'INVALID_SCENARIO'],
  ]) {
    const response = await request('/api/mobility/plan', { method: 'POST', body: { ...validBody, ...patch } });
    assert.equal(response.status, 400, code);
    assert.equal(response.body.error.code, code);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('API rejects malformed, ambiguous, oversized and untyped endpoint bodies without logs', async t => {
  const log = t.mock.method(console, 'error', () => {});
  const { request } = fixture(t);
  for (const body of [null, [], { ...validBody, offline: 'true' }, { ...validBody, debug: true }, { ...validBody, from: { id: 'metro:a', lat: 25.67, lng: -100.32 } }, { ...validBody, from: { kind: 'place', lat: '25.67', lng: -100.32 } }, { ...validBody, from: { kind: 'place', lat: 25.67, lng: -100.32, token: 'secret' } }, { ...validBody, to: { id: 'metro:b', name: 'bad\nname' } }]) assert.equal((await request('/api/mobility/plan', { method: 'POST', body })).status, 400);
  assert.equal((await request('/api/mobility/plan', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await request('/api/mobility/plan', { method: 'POST', body: validBody, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request('/api/mobility/plan', { method: 'POST', body: 'x'.repeat(4097) })).status, 413);
  assert.equal(log.mock.callCount(), 0);
});

test('legacy createApp without mobility artifact continues running and returns a clear unavailable error', async t => {
  const { request } = fixture(t, { mobilityNetwork: null });
  for (const [url, options] of [['/api/mobility/network', {}], ['/api/mobility/plan', { method: 'POST', body: validBody }]]) {
    const response = await request(url, options);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'MOBILITY_UNAVAILABLE');
  }
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/plan?from=a&to=b')).status, 200);
});

test('places endpoint enforces explicit bounded query, no-store, quota and CORS without proxying GPS', async t => {
  let calls = 0;
  const { request } = fixture(t, { placesOptions: { state: createPlaceSearchState(), now: () => 0, transport: async () => { calls++; return new Response(JSON.stringify([{ osm_type: 'node', osm_id: 1, display_name: 'Macroplaza, Monterrey', lat: '25.67', lon: '-100.31' }])); } } });
  for (const url of ['/api/places', '/api/places?q=Macroplaza&q=Fundidora', '/api/places?q=Macroplaza&lat=25.67', '/api/places?q=25.67,-100.31']) assert.equal((await request(url)).status, 400);
  assert.equal((await request('/api/places?q=Macroplaza', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal(calls, 0);
  const response = await request('/api/places?q=Macroplaza');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.body.places[0].id, 'osm:n1');
  assert.equal((await request('/api/places?q=Macroplaza')).body.cached, true);
  const busy = await request('/api/places?q=Fundidora');
  assert.equal(busy.status, 429);
  assert.equal(busy.headers.get('Retry-After'), '1');
  assert.equal(calls, 1);
});
