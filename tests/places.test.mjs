import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceSearch, createPlaceSearchState } from '../server/places.mjs';

const row = (id = 1, patch = {}) => ({ place_id: id, osm_type: 'node', osm_id: id, name: 'Macroplaza', display_name: 'Macroplaza, Monterrey, Nuevo León, México', lat: '25.669', lon: '-100.31', address: { country_code: 'mx' }, ...patch });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('place lookup is a bounded, identified HTTPS request with six sanitized public results', async () => {
  let called;
  const search = createPlaceSearch({ state: createPlaceSearchState(), transport: async (url, options) => { called = { url, options }; return json([row(), row(2, { lat: '0' }), row(3, { lon: '-100.4', address: { country_code: 'us' } }), row(4, { lat: {} }), ...Array.from({ length: 8 }, (_, i) => row(i + 5))]); } });
  const result = await search('  Macroplaza  Monterrey  ');
  assert.equal(result.places.length, 6);
  assert.equal(result.places[0].kind, 'place');
  assert.equal(result.places[0].id, 'osm:n1');
  assert.equal(result.attribution.license, 'ODbL');
  assert.equal(called.url.protocol, 'https:');
  assert.equal(called.url.searchParams.get('q'), 'Macroplaza Monterrey');
  assert.equal(called.url.searchParams.get('countrycodes'), 'mx');
  assert.equal(called.url.searchParams.get('viewbox'), '-100.9,26.1,-99.8,25.35');
  assert.equal(called.url.searchParams.get('bounded'), '1');
  assert.equal(called.url.searchParams.get('limit'), '6');
  assert.match(called.options.headers['User-Agent'], /RegioMovil.*github/);
  assert.equal(called.options.redirect, 'error');
  assert.equal(called.options.headers['X-Forwarded-For'], undefined);
});

test('place lookup never sends invalid text, email or GPS to its provider', async () => {
  let calls = 0;
  const state = createPlaceSearchState();
  const search = createPlaceSearch({ state, transport: async () => { calls++; return json([]); } });
  for (const query of ['', 'ab', 'x'.repeat(121), 'Parque\nMty', null, '25.669, -100.31', 'persona@example.com']) await assert.rejects(search(query), error => error.status === 400);
  assert.equal(calls, 0);
  assert.equal(state.cache.size, 0);
});

test('quota is shared across service instances, refuses overlapping work and has no request queue', async () => {
  let time = 0;
  let resolveFirst;
  let calls = 0;
  const state = createPlaceSearchState();
  const options = { state, now: () => time, transport: () => { calls++; return new Promise(resolve => { resolveFirst = resolve; }); } };
  const first = createPlaceSearch(options)('Macroplaza');
  const secondService = createPlaceSearch(options);
  await assert.rejects(secondService('Fundidora'), error => error.status === 429 && error.retryAfter === 1);
  time = 2000;
  await assert.rejects(secondService('Mederos'), error => error.status === 429);
  assert.equal(calls, 1);
  resolveFirst(json([row()]));
  await first;
  const cached = await secondService('macroplaza');
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);
});

test('default service instances share the actual process-wide quota and cache', async () => {
  let calls = 0;
  const options = { transport: async () => { calls++; return json([row()]); } };
  const first = createPlaceSearch(options);
  const second = createPlaceSearch(options);
  await first('Proceso global Macroplaza');
  assert.equal((await second('Proceso global Macroplaza')).cached, true);
  await assert.rejects(second('Proceso global Fundidora'), error => error.code === 'PLACES_BUSY');
  assert.equal(calls, 1);
});

test('LRU cache has 200 entries, expires after one hour and cannot be mutated by a caller', async () => {
  let time = 0;
  let calls = 0;
  const state = createPlaceSearchState();
  const search = createPlaceSearch({ state, now: () => time, transport: async () => { calls++; return json([row()]); } });
  for (let i = 0; i < 200; i++) { await search(`Parque ${i}`); time += 1000; }
  const cached = await search('Parque 0');
  cached.places[0].name = 'Changed';
  assert.equal((await search('Parque 0')).places[0].name, 'Macroplaza');
  await search('Parque 200');
  assert.equal(state.cache.size, 200);
  assert.ok([...state.cache.keys()].some(key => key.endsWith('|parque 0')));
  assert.ok(![...state.cache.keys()].some(key => key.endsWith('|parque 1')));
  time += 3_600_000;
  assert.equal((await search('Parque 0')).cached, false);
  assert.equal(state.cache.size, 1);
  assert.equal(calls, 202);
});

test('provider failures are actionable, not cached and obey provider backoff', async () => {
  let time = 0;
  let calls = 0;
  const state = createPlaceSearchState();
  const search = createPlaceSearch({ state, now: () => time, transport: async () => { calls++; return new Response('', { status: 429 }); } });
  await assert.rejects(search('Macroplaza'), error => error.code === 'PLACES_UNAVAILABLE' && error.retryAfter === 60);
  time = 2000;
  await assert.rejects(search('Fundidora'), error => error.code === 'PLACES_BUSY' && error.retryAfter === 58);
  assert.equal(calls, 1);
  assert.equal(state.cache.size, 0);
});

test('untrusted provider JSON and oversized bodies fail without exposing payload', async () => {
  for (const response of [json({ error: 'bad' }), new Response('not json'), new Response('x'.repeat(128 * 1024 + 1)), new Response('', { headers: { 'Content-Length': String(128 * 1024 + 1) } })]) {
    const search = createPlaceSearch({ state: createPlaceSearchState(), transport: async () => response });
    await assert.rejects(search('Macroplaza'), error => error.code === 'PLACES_INVALID_RESPONSE' && error.status === 502 && !error.message.includes('not json'));
  }
});

test('provider can change in backend configuration but cannot use HTTP, credentials or client-controlled URLs', () => {
  for (const providerUrl of ['http://localhost/search', 'https://user:secret@example.com/search', 'https://example.com/search?q=a', 'file:///etc/passwd', 'https://example.com/#bad']) assert.throws(() => createPlaceSearch({ providerUrl }), TypeError);
  assert.doesNotThrow(() => createPlaceSearch({ providerUrl: 'https://maps.example.org/search' }));
});

test('provider call has a six second deadline even if transport ignores abort', async () => {
  const search = createPlaceSearch({ state: createPlaceSearchState(), transport: () => new Promise(() => {}) });
  const start = performance.now();
  await assert.rejects(search('Macroplaza'), error => error.status === 504 && error.code === 'PLACES_TIMEOUT');
  assert.ok(performance.now() - start < 7500);
});
