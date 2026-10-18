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
  assert.equal(called.url.searchParams.get('namedetails'), '1');
  assert.match(called.options.headers['User-Agent'], /RegioMovil.*github/);
  assert.equal(called.options.redirect, 'error');
  assert.equal(called.options.headers['X-Forwarded-For'], undefined);
});

test('street addresses keep house number, neighborhood and municipality without inventing an entrance', async () => {
  let called;
  const search = createPlaceSearch({ state: createPlaceSearchState(), transport: async url => {
    called = url;
    return json([row(20, { name: '', category: 'building', display_name: '555, Río Missouri, Del Valle, San Pedro Garza García, Nuevo León, 66220, México', address: { road: 'Río Missouri', house_number: '555', suburb: 'Del Valle', county: 'San Pedro Garza García', state: 'Nuevo León', postcode: '66220', country_code: 'mx' } })]);
  } });
  const result = await search('Río Missouri 555, Del Valle');
  assert.equal(called.searchParams.get('q'), 'Río Missouri 555, Del Valle');
  assert.equal(result.places[0].name, 'Río Missouri 555');
  assert.equal(result.places[0].address, 'Río Missouri 555, Del Valle, San Pedro Garza García, Nuevo León, 66220');
  assert.equal(result.places[0].resultType, 'address');
  assert.equal(result.places[0].lat, 25.669);
});

test('Punto Valle has a sourced name and address reference without consuming the provider quota', async () => {
  let calls = 0;
  const state = createPlaceSearchState();
  state.inFlight = true;
  const search = createPlaceSearch({ state, transport: async () => { calls++; throw new Error('must not fetch'); } });
  for (const query of ['Punto Valle', 'PuntoValle', 'plaza Punto Valle, San Pedro Garza García', 'Rio Missouri 555', 'Punto Valle Monterrey']) {
    const result = await search(query);
    assert.equal(result.places.length, 1);
    assert.equal(result.places[0].name, 'Punto Valle');
    assert.equal(result.places[0].id, 'osm:w682039730');
    assert.equal(result.places[0].lat, 25.6590567);
    assert.equal(result.places[0].lng, -100.3545702);
    assert.match(result.places[0].address, /Río Missouri 555/);
    assert.equal(result.places[0].source.url, 'https://puntovalle.com/concierge');
    assert.equal(result.places[0].coordinateSource.precision, 'published-centroid');
  }
  await assert.rejects(search('Punto Valle restaurante'), error => error.code === 'PLACES_BUSY');
  assert.equal(calls, 0);
  assert.equal(state.cache.size, 0);
});

test('Las Estaciones and Tec resolve their verified Monterrey entities without confusing a similarly named shop', async () => {
  let calls = 0;
  const state = createPlaceSearchState();
  state.inFlight = true;
  const search = createPlaceSearch({ state, transport: async () => { calls++; throw new Error('must not fetch'); } });
  for (const query of ['Colonia Las Estaciones', 'col. Las Estaciones, Monterrey', 'Las Estaciones, Nuevo León', 'Fraccionamiento Las Estaciones, Monterrey, NL, 64102']) {
    const result = await search(query);
    assert.equal(result.places.length, 1);
    assert.equal(result.places[0].id, 'osm:w665361279');
    assert.equal(result.places[0].lat, 25.7661587);
    assert.equal(result.places[0].lng, -100.4008005);
    assert.match(result.places[0].address, /Lincoln \/ No Reelección/);
  }
  for (const query of ['Tec de Monterrey', 'tecnologico de monterrey', 'Tec de Monterrey, Campus Monterrey', 'ITESM campus Monterrey', 'Eugenio Garza Sada 2501, Monterrey']) {
    const result = await search(query);
    assert.equal(result.places.length, 1);
    assert.equal(result.places[0].id, 'osm:r21104322');
    assert.equal(result.places[0].lat, 25.6507267);
    assert.equal(result.places[0].lng, -100.289319);
    assert.match(result.places[0].name, /Campus Monterrey/);
    assert.match(result.places[0].address, /Eugenio Garza Sada 2501/);
    assert.equal(result.places[0].source.url, 'https://tec.mx/es/monterrey');
  }
  for (const query of ['Colonia Las Estaciones, San Pedro', 'Las Estaciones 2 sector', 'Tec de Monterrey campus Santa Fe', 'Tec de Monterrey Avenida Revolución 2703', 'Tec de Monterrey, San Pedro']) {
    await assert.rejects(search(query), error => error.code === 'PLACES_BUSY');
  }
  assert.equal(calls, 0);
});

test('a neighborhood prefix is removed only on the single bounded fallback, preserving its municipality and sector', async () => {
  const calls = [];
  const search = createPlaceSearch({ state: createPlaceSearchState(), transport: async url => {
    calls.push(url.searchParams.get('q'));
    return json(calls.length === 1 ? [] : [row(24, { name: 'Barrio de ejemplo 2 sector' })]);
  } });
  const result = await search('Colonia Barrio de ejemplo 2 sector, Monterrey, Nuevo León');
  assert.deepEqual(calls, ['Colonia Barrio de ejemplo 2 sector, Monterrey, Nuevo León', 'Barrio de ejemplo 2 sector, Monterrey, Nuevo León']);
  assert.equal(result.places[0].name, 'Barrio de ejemplo 2 sector');
});

test('an empty search retries once with regional context at one request per second and then caches', async () => {
  const calls = [];
  const state = createPlaceSearchState();
  const search = createPlaceSearch({ state, transport: async url => {
    calls.push({ time: performance.now(), q: url.searchParams.get('q') });
    return json(calls.length === 1 ? [] : [row(23, { name: 'Local de ejemplo' })]);
  } });
  const pending = search('Local de ejemplo');
  await assert.rejects(search('Otra dirección'), error => error.code === 'PLACES_BUSY');
  const result = await pending;
  assert.equal(result.places[0].name, 'Local de ejemplo');
  assert.deepEqual(calls.map(call => call.q), ['Local de ejemplo', 'Local de ejemplo, Nuevo León, México']);
  assert.ok(calls[1].time - calls[0].time >= 990);
  assert.equal((await search('local de ejemplo')).cached, true);
  assert.equal(calls.length, 2);
  await assert.rejects(search('Otra dirección'), error => error.code === 'PLACES_BUSY');
});

test('an already regional query does not retry or guess a destination when there are no matches', async () => {
  let calls = 0;
  const search = createPlaceSearch({ state: createPlaceSearchState(), transport: async () => { calls++; return json([]); } });
  const result = await search('Calle que no existe, Nuevo León');
  assert.deepEqual(result.places, []);
  assert.equal(calls, 1);
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
