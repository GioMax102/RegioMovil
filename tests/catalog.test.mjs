import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeCatalogs, findServices } from '../server/catalog.mjs';
import { createApp } from '../server/app.mjs';
import { buildBoard, buildGraph, planJourney } from '../server/domain.mjs';

const verifiedAt = '2026-10-15';
const source = { id: 'official', title: 'Fuente oficial', url: 'https://www.nl.gob.mx/es', verifiedAt };
const catalogs = [
  { verifiedAt, network: { id: 'ima', name: 'Rutas urbanas IMA', mode: 'bus' }, sources: [source], services: [
    { id: 'ima-218', code: '218', name: 'Hospital Metropolitano — Apodaca', origin: 'Hospital Metropolitano', destination: 'Apodaca',
      municipalities: ['San Nicolás de los Garza', 'Apodaca'], via: ['Miguel Alemán'], status: 'published', sourceId: 'official',
      planningEligible: true, notes: 'Recorrido publicado; sin secuencia de paradas.' },
  ] },
  { verifiedAt, networks: [{ id: 'regioruta', name: 'RegioRuta', mode: 'bus' }], sources: [source], routes: [
    { id: 'regioruta-3', name: 'Circuito Juárez', code: '3', status: 'published', statusAsOf: null, from: 'Centro', to: 'Los Puertos', geometryPack: 'regioruta-3.json' },
  ] },
  { verifiedAt, sources: [source], routes: [
    { id: 'L4', name: 'Línea 4', mode: 'metro', status: 'construction', statusLabel: 'En construcción', stationNames: ['Tren del Norte', 'Ginecología'],
      sourceIds: ['official'], planningEligible: false },
  ] },
];

const network = { sources: [], stations: [
  { id: 'a', name: 'A', lat: 25.68, lng: -100.30, lineIds: ['L1', 'L4', 'L6', 'BUS'] },
  { id: 'b', name: 'B', lat: 25.69, lng: -100.31, lineIds: ['L1'] },
  { id: 'future', name: 'Futura', lat: 25.70, lng: -100.32, lineIds: ['L4', 'L6', 'BUS'] },
], lines: [
  { id: 'L1', name: 'Línea 1', stationIds: ['a', 'b'] },
  { id: 'L4', name: 'Línea 4', stationIds: ['a', 'future'], status: 'construction', planningEligible: true },
  { id: 'L6', name: 'Línea 6', stationIds: ['a', 'future'], status: 'announced' },
  { id: 'BUS', name: 'Autobús sin datos suficientes', stationIds: ['a', 'future'], status: 'published', planningEligible: false },
  { id: 'metadata', name: 'Solo metadatos', status: 'published' },
], throughServices: [{ stationId: 'b', lineIds: ['L1', 'L4'] }] };

async function fixture(t, catalog) {
  const app = createApp({ network, catalog, now: () => new Date('2026-10-15T18:00:00Z') });
  t.after(() => app.close());
  // Exercise the actual HTTP handler without requiring permission to open a port.
  return async (path, options = {}) => {
    const headers = new Headers();
    let status;
    let payload;
    const response = {
      headersSent: false,
      setHeader: (name, value) => headers.set(name, value),
      writeHead(code, values) { status = code; for (const [name, value] of Object.entries(values)) headers.set(name, value); this.headersSent = true; },
      end(value = '') { payload = value; },
    };
    await app.handler({ url: path, method: options.method || 'GET', headers: options.headers || {}, socket: { remoteAddress: '127.0.0.1' } }, response);
    return { status, headers, json: async () => JSON.parse(payload) };
  };
}

test('catalog merges diverse metadata without inventing stops or enabling published routes', () => {
  const original = JSON.stringify(catalogs);
  const merged = mergeCatalogs(catalogs);
  assert.equal(JSON.stringify(catalogs), original, 'Source objects must not be mutated.');
  assert.equal(merged.version, 1);
  assert.equal(merged.verifiedAt, verifiedAt);
  assert.equal(merged.routes.length, 3);
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.networks.length, 3);
  const bus = merged.routes.find(route => route.id === 'ima-218');
  assert.equal(bus.from, 'Hospital Metropolitano');
  assert.deepEqual(bus.sourceIds, ['official']);
  assert.equal(bus.planningEligible, false, 'A publication is not an ordered stop sequence.');
  assert.equal(bus.geometryPack, null);
  assert.equal(merged.routes.find(route => route.id === 'regioruta-3').geometryPack, 'regioruta-3.json');
  assert.equal(merged.routes.find(route => route.id === 'regioruta-3').statusAsOf, null, 'Consultation does not establish an unknown publication date.');
  const expansion = merged.routes.find(route => route.id === 'L4');
  assert.equal(expansion.mode, 'metro');
  assert.equal(expansion.from, 'Tren del Norte');
  assert.equal(expansion.to, 'Ginecología');
  assert.deepEqual(expansion.stationNames, ['Tren del Norte', 'Ginecología']);
  assert.equal(expansion.planningEligible, false);
  assert.deepEqual(mergeCatalogs([merged]), merged, 'The metadata catalog must survive normalization when served.');
});

test('canonical catalog preserves explicit routing evidence and geographic package revision', () => {
  const canonical = mergeCatalogs([{ verifiedAt, geometryRevision: 'sha256-example', routes: [
    { id: 'L1', name: 'Línea 1', mode: 'metro', status: 'operational', planningEligible: true, stationIds: ['a', 'b'] },
    { id: 'missing-order', name: 'Sin orden', status: 'operational', planningEligible: true, geometryPack: 'published-map' },
    { id: 'administrative', name: 'Sin asignar', catalogEligible: false },
  ] }]);
  assert.equal(canonical.geometryRevision, 'sha256-example');
  assert.equal(canonical.routes.length, 2);
  assert.deepEqual(canonical.routes.find(route => route.id === 'L1').stationIds, ['a', 'b']);
  assert.equal(canonical.routes.find(route => route.id === 'L1').planningEligible, true);
  assert.equal(canonical.routes.find(route => route.id === 'missing-order').planningEligible, false);
  assert.deepEqual(mergeCatalogs([canonical]), canonical);
});

test('catalog rejects ID collisions across networks and drops unusable source URLs', () => {
  assert.throws(() => mergeCatalogs({}), TypeError);
  assert.throws(() => mergeCatalogs([
    { networkId: 'ima', routes: [{ id: '1', name: 'Ruta 1' }] },
    { networkId: 'regioruta', routes: [{ id: '1', name: 'Ruta 1' }] },
  ]), /IDs únicos/);
  const merged = mergeCatalogs([null, { routes: [null, {}, { id: 'safe', name: 'Ruta', officialUrl: 'javascript:alert(1)' }], sources: [
    { id: 'bad', url: 'javascript:alert(1)' }, { id: 'credentials', url: 'https://secret:token@example.com/' },
  ] }]);
  assert.equal(merged.routes.length, 1);
  assert.equal(merged.routes[0].officialUrl, null);
  assert.deepEqual(merged.sources, []);
});

test('catalog search matches accents, municipalities, station names and combined filters', () => {
  const merged = mergeCatalogs(catalogs);
  assert.equal(findServices(merged, { q: 'san nicolas miguel aleman' })[0].id, 'ima-218');
  assert.equal(findServices(merged, { q: 'ginecologia', status: 'construction', network: 'metrorrey' })[0].id, 'L4');
  assert.deepEqual(findServices(merged, { q: 'no documentado' }), []);
  assert.throws(() => findServices(merged, { network: 'invented' }), RangeError);
  assert.throws(() => findServices(merged, { status: 'live' }), RangeError);
  assert.throws(() => findServices(merged, { q: 'x'.repeat(161) }), RangeError);
  assert.throws(() => findServices(merged, { q: '\u0000' }), RangeError);
});

test('API services lists, filters and reads metadata without adding a routing graph', async t => {
  const request = await fixture(t, mergeCatalogs(catalogs));
  const response = await request('/api/services?network=ima&q=apodaca&status=published');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(body.routes[0].id, 'ima-218');
  assert.equal(body.routes[0].planningEligible, false);
  assert.equal(body.verifiedAt, verifiedAt);
  const detail = await request('/api/services/L4');
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).status, 'construction');
  const unchanged = await (await request('/api/network')).json();
  assert.deepEqual(unchanged, network);
  assert.equal((await request('/api/plan?from=a&to=future')).status, 200);
  assert.deepEqual((await (await request('/api/plan?from=a&to=future')).json()).journeys, []);
});

test('API services has a usable empty fallback and structured validation errors', async t => {
  const request = await fixture(t, null);
  const empty = await request('/api/services');
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).total, 0);
  for (const path of ['/api/services?network=imaginary', '/api/services?status=live', '/api/services?q=' + 'x'.repeat(161),
    '/api/services?q=a&q=b', '/api/services?unrecognized=1', '/api/services/broken%', '/api/services/a%2Fb']) {
    const response = await request(path);
    assert.equal(response.status, 400, path);
    assert.match(response.headers.get('Content-Type'), /application\/json/);
    assert.ok((await response.json()).error.code.startsWith('INVALID_SERVICE'));
  }
  const missing = await request('/api/services/missing');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'SERVICE_NOT_FOUND');
  for (const path of ['/api/services', '/api/services/L4']) {
    const write = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(write.status, 405);
    assert.equal((await write.json()).error.code, 'METHOD_NOT_ALLOWED');
  }
});

test('domain excludes construction, announcements, metadata-only and explicitly ineligible lines', () => {
  const graph = buildGraph(network);
  assert.deepEqual(graph.get('future'), []);
  assert.ok(graph.get('a').every(edge => edge.lineId === 'L1'));
  assert.deepEqual(planJourney(network, 'a', 'future').journeys, []);
  assert.ok(buildBoard(network, 'a').arrivals.every(arrival => arrival.lineId === 'L1'));
  assert.ok(buildBoard(network, 'b').arrivals.every(arrival => arrival.direction !== 'Futura' && !arrival.continuesAsLineId));
  assert.deepEqual(buildBoard(network, 'future').arrivals, []);
  assert.ok(planJourney(network, 'a', 'b').journeys.length > 0, 'The existing Metro network must remain usable.');
});

test('official expansion stays informative and cannot introduce a fictitious L4 trip', async () => {
  const expansion = JSON.parse(await readFile(new URL('../data/network-expansion.json', import.meta.url), 'utf8'));
  const merged = mergeCatalogs([expansion]);
  assert.deepEqual(merged.routes.map(route => route.id), ['L4', 'L6']);
  assert.ok(merged.routes.every(route => !route.planningEligible && route.status === 'construction'));
  const contaminated = { ...network, lines: [...network.lines, ...merged.routes] };
  assert.deepEqual(planJourney(contaminated, 'a', 'future').journeys, []);
  assert.ok(buildBoard(contaminated, 'a').arrivals.every(arrival => arrival.lineId === 'L1'));
});
