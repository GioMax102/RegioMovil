import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceSuggestions, createPlaceSuggestionState } from '../server/place-suggestions.mjs';
const feature = (id = 1, patch = {}, point = [-100.282186, 25.6771028]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: { osm_type: 'W', osm_id: id, name: 'Parque Fundidora', city: 'Monterrey', state: 'Nuevo León', country: 'México', countrycode: 'MX', ...patch } });
const json = features => new Response(JSON.stringify({ type: 'FeatureCollection', features }));

test('automatic suggestions use Photon with a static ZMM bbox, MX and no device location or unsupported language', async () => {
  let called;
  const search = createPlaceSuggestions({ state: createPlaceSuggestionState(), transport: async (url, options) => { called = { url, options }; return json([feature(), feature(2, { countrycode: 'US' }), feature(3, {}, [0, 0]), feature(4, { name: '\nBAD' }), ...Array.from({ length: 8 }, (_, i) => feature(i + 5, { name: `Acceso ${i + 1}` }))]); } });
  const result = await search('  Parque   Fundidora  ');
  assert.equal(result.places.length, 6);
  assert.equal(result.places[0].id, 'osm:w1');
  assert.equal(called.url.hostname, 'photon.komoot.io');
  assert.equal(called.url.searchParams.get('q'), 'Parque Fundidora');
  assert.equal(called.url.searchParams.get('bbox'), '-100.9,25.35,-99.8,26.1');
  assert.equal(called.url.searchParams.get('countrycode'), 'MX');
  assert.equal(called.url.searchParams.get('limit'), '6');
  assert.equal(called.url.searchParams.has('lat'), false);
  assert.equal(called.url.searchParams.has('lon'), false);
  assert.equal(called.url.searchParams.has('lang'), false);
  assert.match(called.options.headers['User-Agent'], /RegioMovil/);
  assert.equal(called.options.headers['X-Forwarded-For'], undefined);
  assert.equal(called.options.redirect, 'error');
  assert.equal(result.attribution.license, 'ODbL');
});

test('suggestions collapse duplicate venue labels but retain different entrances and addresses', async () => {
  const search = createPlaceSuggestions({ state: createPlaceSuggestionState(), transport: async () => json([
    feature(1), feature(2), feature(3, { name: 'Acceso 7 Parque Fundidora', street: 'Puente Verde' }),
    feature(4, { street: 'Calzada Madero' }),
  ]) });
  const { places } = await search('Fundidora');
  assert.equal(places.length, 3);
  assert.deepEqual(places.map(place => place.id), ['osm:w1', 'osm:w3', 'osm:w4']);
});

test('Photon house and street suggestions preserve names, numbers and full addresses', async () => {
  const search = createPlaceSuggestions({ state: createPlaceSuggestionState(), transport: async () => json([feature(1, { name: '', street: 'Calle Praga', housenumber: '421', locality: 'Las Torres', postcode: '64780' }), feature(2, { name: 'Avenida Lincoln', type: 'street' })]) });
  const { places } = await search('Praga 421');
  assert.equal(places[0].name, 'Calle Praga 421');
  assert.equal(places[0].address, 'Calle Praga 421, Las Torres, Monterrey, Nuevo León, 64780');
  assert.equal(places[0].resultType, 'address');
  assert.equal(places[1].resultType, 'street');
});

test('verified exact destinations take priority without consuming the suggestion provider quota', async () => {
  const state = createPlaceSuggestionState();
  state.inFlight = true;
  const search = createPlaceSuggestions({ state, transport: () => assert.fail('Reference must not call upstream') });
  for (const [query, id] of [['Punto Valle', 'osm:w682039730'], ['Colonia Las Estaciones', 'osm:w665361279'], ['Tec de Monterrey', 'osm:r21104322']]) assert.equal((await search(query)).places[0].id, id);
  await assert.rejects(search('Tec de Monterrey campus Santa Fe'), error => error.code === 'PLACES_BUSY');
});

test('suggestion quota and cache are shared, bounded and independent of callers', async () => {
  let time = 0, calls = 0, resolveFirst;
  const state = createPlaceSuggestionState();
  const options = { state, now: () => time, transport: () => { calls++; return new Promise(resolve => { resolveFirst = resolve; }); } };
  const pending = createPlaceSuggestions(options)('Fundidora');
  const second = createPlaceSuggestions(options);
  await assert.rejects(second('Macroplaza'), error => error.status === 429 && error.retryAfter === 1);
  resolveFirst(json([feature()]));
  await pending;
  const cached = await second('fundidora');
  assert.equal(cached.cached, true);
  cached.places[0].name = 'mutated';
  assert.equal((await second('Fundidora')).places[0].name, 'Parque Fundidora');
  assert.equal(calls, 1);
  time = 3_600_001;
  const expired = second('Fundidora');
  resolveFirst(json([feature()]));
  assert.equal((await expired).cached, false);
  assert.equal(calls, 2);
});

test('suggestion LRU retains at most 200 entries and a provider 429 backs off globally', async () => {
  let time = 0, blocked = false, calls = 0;
  const state = createPlaceSuggestionState();
  const search = createPlaceSuggestions({ state, now: () => time, transport: async () => { calls++; return blocked ? new Response('', { status: 429 }) : json([feature()]); } });
  for (let i = 0; i < 201; i++) { await search(`Lugar ${i}`); time += 1000; }
  assert.equal(state.cache.size, 200);
  blocked = true;
  await assert.rejects(search('Lugar distinto'), error => error.retryAfter === 60);
  time += 2000;
  await assert.rejects(search('Otra dirección'), error => error.retryAfter === 58);
  assert.equal(calls, 202);
});

test('suggestions reject GPS, email, malformed payloads, unsafe providers and public Nominatim autocomplete', async () => {
  let calls = 0;
  const search = createPlaceSuggestions({ state: createPlaceSuggestionState(), transport: async () => { calls++; return json([]); } });
  for (const query of ['', 'ab', 'x'.repeat(121), 'Lugar\nMty', '25.669,-100.31', 'persona@example.com']) await assert.rejects(search(query), error => error.status === 400);
  assert.equal(calls, 0);
  for (const payload of [{}, { type: 'FeatureCollection', features: {} }]) await assert.rejects(createPlaceSuggestions({ state: createPlaceSuggestionState(), transport: async () => new Response(JSON.stringify(payload)) })('Fundidora'), error => error.code === 'PLACES_INVALID_RESPONSE');
  for (const providerUrl of ['http://example.org/api/', 'https://user:secret@example.org/api/', 'https://nominatim.openstreetmap.org/search']) assert.throws(() => createPlaceSuggestions({ providerUrl }), TypeError);
});

test('suggestion transport has a six second deadline even if it ignores abort', async () => {
  const search = createPlaceSuggestions({ state: createPlaceSuggestionState(), transport: () => new Promise(() => {}) });
  await assert.rejects(search('Macroplaza'), error => error.status === 504 && error.code === 'PLACES_TIMEOUT');
});
