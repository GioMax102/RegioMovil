import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { createApp } from '../server/app.mjs';
import { buildBoard, planJourney, buildGraph, artifact, getModelCard } from '../server/domain.mjs';
import { trainArtifact } from '../server/model.mjs';

const stations = [
  { id: 'talleres', name: 'Talleres', lat: 25.753, lng: -100.365, lineIds: ['L1'] },
  { id: 'cuauhtemoc', name: 'Cuauhtémoc', lat: 25.686, lng: -100.316, lineIds: ['L1', 'L2'] },
  { id: 'felix-u-gomez', name: 'Félix U. Gómez', lat: 25.683, lng: -100.295, lineIds: ['L1', 'L3'] },
  { id: 'sendero', name: 'Sendero', lat: 25.767, lng: -100.289, lineIds: ['L2'] },
  { id: 'padre-mier', name: 'Padre Mier', lat: 25.668, lng: -100.316, lineIds: ['L2'] },
  { id: 'zaragoza', name: 'Zaragoza', lat: 25.666, lng: -100.309, lineIds: ['L2', 'L3'] },
  { id: 'hospital-metropolitano', name: 'Hospital Metropolitano', lat: 25.713, lng: -100.275, lineIds: ['L3'] },
];
const network = { sources: [], stations, lines: [
  { id: 'L1', name: 'Línea 1', stationIds: ['talleres', 'cuauhtemoc', 'felix-u-gomez'] },
  { id: 'L2', name: 'Línea 2', stationIds: ['sendero', 'cuauhtemoc', 'padre-mier', 'zaragoza'] },
  { id: 'L3', name: 'Línea 3', stationIds: ['zaragoza', 'felix-u-gomez', 'hospital-metropolitano'] },
], throughServices: [{ stationId: 'zaragoza', lineIds: ['L2', 'L3'] }] };
const date = new Date('2026-10-15T18:00:00.000Z');

async function fixture(t, options = {}) {
  const app = createApp({ network, now: () => date, ...options });
  const server = createServer(app.handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { app, base, request: (path, init) => fetch(`${base}${path}`, init) };
}

test('model training is reproducible and evaluated on held-out synthetic samples', () => {
  assert.deepEqual(trainArtifact(), artifact);
  assert.equal(artifact.dataKind, 'synthetic');
  for (const model of Object.values(artifact.models)) {
    assert.ok(model.evaluation.model.mae < model.evaluation.baseline.mae);
    assert.ok(model.interval.heldoutCoverage > 0.7 && model.interval.heldoutCoverage < 0.9);
  }
  assert.ok(getModelCard().limitations.some(text => text.includes('no validan')));
});

test('board is deterministic, bounded, and changes under adverse scenarios', () => {
  const board = buildBoard(network, 'padre-mier', 'normal', date);
  assert.deepEqual(board, buildBoard(network, 'Padre Mier', 'normal', date));
  assert.equal(board.mode, 'simulation');
  assert.equal(board.arrivals.length, 4);
  for (const arrival of board.arrivals) {
    assert.equal(arrival.accessible, 'unknown');
    assert.equal(arrival.source, 'simulation');
    assert.ok(arrival.occupancy >= 0 && arrival.occupancy <= 100);
    assert.ok(arrival.etaRange[0] <= arrival.etaMinutes && arrival.etaRange[1] >= arrival.etaMinutes);
  }
  const peak = buildBoard(network, 'padre-mier', 'peak', date);
  const average = board => board.arrivals.reduce((sum, arrival) => sum + arrival.occupancy, 0) / board.arrivals.length;
  assert.ok(average(peak) > average(board));
  assert.ok(buildBoard(network, 'talleres', 'normal', date).arrivals.every(arrival => arrival.direction === 'Félix U. Gómez'));
  assert.ok(board.arrivals.some(arrival => arrival.direction === 'Hospital Metropolitano' && arrival.continuesAsLineId === 'L3'));
});

test('planner uses connected documented edges and honors through service', () => {
  const planned = planJourney(network, 'padre-mier', 'hospital-metropolitano', 'fastest', 'normal', date);
  assert.ok(planned.journeys.length > 0);
  const graph = buildGraph(network);
  for (const journey of planned.journeys) {
    assert.equal(journey.stationIds[0], 'padre-mier');
    assert.equal(journey.stationIds.at(-1), 'hospital-metropolitano');
    for (let i = 1; i < journey.stationIds.length; i++) assert.ok(graph.get(journey.stationIds[i - 1]).some(edge => edge.to === journey.stationIds[i]));
    assert.equal(journey.accessibility, 'unknown');
  }
  const through = planned.journeys.find(journey => journey.stationIds.includes('zaragoza'));
  assert.ok(through.steps.some(step => step.continuesOnTrain));
  assert.equal(through.transfers, 0);
  assert.equal(through.title, 'Viaje directo');
  assert.equal(planJourney(network, 'sendero', 'sendero').journeys.length, 0);
  assert.match(planJourney(network, 'sendero', 'talleres', 'accessible').message, /no está verificada/);
});

test('planner returns no invented route to a disconnected station', () => {
  const disconnected = { ...network, stations: [...network.stations, { id: 'isolated', name: 'Aislada', lat: 25.7, lng: -100.3, lineIds: [] }] };
  const planned = planJourney(disconnected, 'padre-mier', 'isolated');
  assert.deepEqual(planned.journeys, []);
  assert.match(planned.message, /No hay conexión documentada/);
});

test('all route preferences and scenarios preserve ETA ranges and documented reachability', () => {
  const graph = buildGraph(network);
  for (const preference of ['fastest', 'comfortable', 'accessible']) {
    for (const scenario of ['normal', 'peak', 'rain', 'disruption']) {
      const planned = planJourney(network, 'sendero', 'hospital-metropolitano', preference, scenario, date);
      assert.equal(planned.mode, 'simulation');
      assert.ok(planned.journeys.length > 0);
      for (const [index, journey] of planned.journeys.entries()) {
        assert.ok(journey.etaRange[0] <= journey.durationMinutes && journey.etaRange[1] >= journey.durationMinutes);
        assert.ok(journey.durationMinutes >= journey.walkingMinutes);
        assert.equal(journey.accessibility, 'unknown');
        assert.equal(journey.source, 'simulation');
        if (index > 0) assert.ok(planned.journeys[index - 1].score <= journey.score);
        for (let step = 1; step < journey.stationIds.length; step++) assert.ok(graph.get(journey.stationIds[step - 1]).some(edge => edge.to === journey.stationIds[step]));
      }
    }
  }
});

test('API serves contract, rejects unsupported choices, and caches static network', async t => {
  const { request } = await fixture(t);
  const board = await request('/api/board');
  assert.equal(board.status, 200);
  assert.equal((await board.json()).stationId, 'padre-mier');
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/board?scenario=bogus')).status, 400);
  assert.equal((await request('/api/board?station=missing')).status, 404);
  assert.equal((await request('/api/plan?from=sendero')).status, 400);
  assert.equal((await request('/api/plan?from=sendero&to=talleres&preference=magic')).status, 400);
  assert.equal((await request('/api/model')).status, 200);
  const catalog = await request('/api/network');
  assert.equal(catalog.status, 200);
  assert.equal((await request('/api/network', { headers: { 'If-None-Match': catalog.headers.get('ETag') } })).status, 304);
});

test('CORS rejects unknown origins before writing data', async t => {
  const { request } = await fixture(t);
  const denied = await request('/api/reports', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ stationId: 'padre-mier', category: 'climate', detail: 'Sin clima' }) });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  const preflight = await request('/api/reports', { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://localhost');
  for (const origin of ['http://localhost:3001', 'http://127.0.0.1:3001', 'https://localhost']) {
    const permitted = await request('/api/board', { headers: { Origin: origin } });
    assert.equal(permitted.status, 200);
    assert.equal(permitted.headers.get('Access-Control-Allow-Origin'), origin);
  }
  const reports = await (await request('/api/reports')).json();
  assert.equal(reports.reports.length, 0);
});

test('preview origins on port 4173 can load deferred CSS and API while other origins stay denied', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-preview-cors-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'assets/MobilityPlanner-Abc12345.css'), '.mobility-planner { display: grid; }');
  const { request } = await fixture(t, { distPath: directory });
  for (const origin of ['http://localhost:4173', 'http://127.0.0.1:4173']) {
    const style = await request('/assets/MobilityPlanner-Abc12345.css', { headers: { Origin: origin } });
    assert.equal(style.status, 200);
    assert.equal(style.headers.get('Content-Type'), 'text/css; charset=utf-8');
    assert.equal(style.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(await style.text(), /mobility-planner/);
    const health = await request('/api/health', { headers: { Origin: origin } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal((await health.json()).status, 'ok');
  }
  for (const origin of ['http://localhost:4174', 'http://127.0.0.1:4174', 'http://evil.example:4173']) {
    for (const path of ['/assets/MobilityPlanner-Abc12345.css', '/api/health']) {
      const denied = await request(path, { headers: { Origin: origin } });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
    }
  }
});

test('reports validate payload, resist SQL text, and persist through restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'reports.sqlite');
  const first = createApp({ network, databasePath: path, now: () => date });
  const body = { stationId: 'padre-mier', category: 'condition', detail: "Una puerta no abre; '); DROP TABLE reports; --" };
  const report = first.store.add(body, date);
  first.close();
  const { request, app } = await fixture(t, { databasePath: path });
  const list = await (await request('/api/reports?station=padre-mier')).json();
  assert.equal(list.reports.length, 0, 'Legacy reports have no publication consent and remain private.');
  assert.equal(app.store.get(report.id).detail, body.detail);
  assert.equal(app.store.get(report.id).status, 'pending');
  for (const invalid of [{ ...body, detail: 'ab' }, { ...body, detail: 'x'.repeat(501) }, { ...body, category: 'payment' }, { ...body, stationId: '' }]) {
    const response = await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalid) });
    assert.equal(response.status, 400);
  }
  const created = await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, detail: 'Clima apagado en unidad observada.' }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).report.stationId, 'padre-mier');
  assert.equal((await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await request('/api/reports', { method: 'POST', body: 'plain' })).status, 415);
  assert.equal((await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, detail: 'x'.repeat(5000) }) })).status, 400);
  async function* chunkedBody() { yield '{"detail":"'; yield 'x'.repeat(600_000); yield '"}'; }
  assert.equal((await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: chunkedBody(), duplex: 'half' })).status, 413);
});

test('report rate limiting returns Retry-After and does not store duplicates', async t => {
  const { request } = await fixture(t, { reportLimit: 1 });
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stationId: 'sendero', category: 'crowding', detail: 'Andén saturado en este momento.' }) };
  assert.equal((await request('/api/reports', init)).status, 201);
  const limited = await request('/api/reports', init);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await (await request('/api/reports?station=sendero')).json()).reports.length, 0);
});

test('production static server supports SPA navigation and rejects encoded traversal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist/index.html'), '<!doctype html><title>RegioMovil</title>');
  await writeFile(join(directory, 'dist/app.js'), 'export const app = true;');
  await writeFile(join(directory, 'dist/sw.js'), 'self.addEventListener("fetch", () => {});');
  await writeFile(join(directory, 'dist/.private.json'), '{"private":true}');
  await writeFile(join(directory, 'dist/app.js.map'), '{"sourceContent":["private source"]}');
  await writeFile(join(directory, 'dist/theme.css'), ':root { color: green; }');
  await mkdir(join(directory, 'dist/assets'));
  await writeFile(join(directory, 'dist/assets/index-B1k2G3h4.js'), 'export const version = 1;');
  await writeFile(join(directory, 'secret.json'), '{"private":true}');
  await symlink(join(directory, 'secret.json'), join(directory, 'dist/leak.json'));
  const { request, base } = await fixture(t, { distPath: join(directory, 'dist') });
  const page = await request('/viaje/universidad', { headers: { Accept: 'text/html' } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.match(await page.text(), /RegioMovil/);
  const script = await request('/app.js', { headers: { Origin: 'http://127.0.0.1:3001' } });
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('Content-Type'), 'text/javascript; charset=utf-8');
  assert.equal(script.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:3001');
  assert.equal(script.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal((await request('/app.js', { headers: { Origin: 'https://unknown.example' } })).status, 403);
  const style = await request('/theme.css');
  assert.equal(style.headers.get('Content-Type'), 'text/css; charset=utf-8');
  assert.equal((await request('/sw.js')).headers.get('Cache-Control'), 'no-cache');
  assert.equal((await request('/assets/index-B1k2G3h4.js')).headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await request('/missing.js')).status, 404);
  assert.equal((await request('/assets/missing', { headers: { Accept: 'text/html' } })).status, 404);
  assert.equal((await request('/assets/', { headers: { Accept: 'text/html' } })).status, 404);
  assert.equal((await request('/viaje/universidad')).status, 404);
  assert.equal((await request('/.private.json')).status, 403);
  assert.equal((await request('/leak.json')).status, 403);
  assert.equal((await request('/app.js.map')).status, 404);
  assert.equal((await request('/foo%00.js')).status, 400);
  assert.equal((await request('/assets%5cindex.js')).status, 400);
  assert.equal((await request('/broken%')).status, 400);
  assert.equal((await request('/%2e%2e%2fsecret.json')).status, 403);
  const head = await request('/app.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Length'), String(Buffer.byteLength('export const app = true;')));
  assert.equal(await head.text(), '');
  const status = await new Promise((resolve, reject) => {
    const target = new URL(base);
    // Send an absolute request target to our localhost server; it must never act as a proxy.
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: 'http://169.254.169.254/latest/meta-data/' }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(status, 400);
});

test('regional catalog connects real stations without unreachable promises', async t => {
  let actual;
  try { actual = JSON.parse(await readFile(new URL('../data/network.json', import.meta.url), 'utf8')); }
  catch { t.skip('Regional catalog is being prepared.'); return; }
  const planned = planJourney(actual, 'sendero', 'fundidora', 'comfortable', 'normal', date);
  assert.ok(planned.journeys.length > 0);
  assert.ok(planned.journeys.every(journey => journey.stationIds.at(-1) === 'fundidora'));
  assert.ok(actual.stations.every(station => station.lat > 25 && station.lng < -99));
});

test('static text compression negotiates gzip/Brotli, preserves HEAD and never compresses WOFF2', async t => {
  const directory = await mkdtemp(join(tmpdir(),'regiomovil-compression-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const original = 'export const accessible = "RegioMovil";\n'.repeat(200);
  await writeFile(join(directory,'app.js'),original);
  await writeFile(join(directory,'font.woff2'),'binary font'.repeat(200));
  const {base,request} = await fixture(t,{distPath:directory});
  const raw = encoding => new Promise((resolve,reject) => {
    const target = new URL(base);
    const req = httpRequest({hostname:target.hostname,port:target.port,path:'/app.js',headers:{'Accept-Encoding':encoding}},response => {
      const chunks = [];
      response.on('data',chunk => chunks.push(chunk));
      response.on('end',() => resolve({headers:response.headers,body:Buffer.concat(chunks)}));
    });
    req.on('error',reject);req.end();
  });
  const gzip = await raw('gzip');
  assert.equal(gzip.headers['content-encoding'],'gzip');
  assert.equal(gunzipSync(gzip.body).toString(),original);
  assert.ok(gzip.body.length < Buffer.byteLength(original));
  assert.equal(gzip.headers['content-length'],String(gzip.body.length));
  const brotli = await raw('gzip;q=0.5, br;q=1');
  assert.equal(brotli.headers['content-encoding'],'br');
  assert.equal(brotliDecompressSync(brotli.body).toString(),original);
  assert.match(brotli.headers.vary,/Origin/);
  assert.match(brotli.headers.vary,/Accept-Encoding/);
  const head = await request('/app.js',{method:'HEAD',headers:{'Accept-Encoding':'br'}});
  assert.equal(head.headers.get('Content-Encoding'),'br');
  assert.equal(head.headers.get('Content-Length'),String(brotli.body.length));
  assert.equal(await head.text(),'');
  const identity = await raw('gzip;q=0,br;q=0');
  assert.equal(identity.headers['content-encoding'],undefined);
  assert.equal(identity.body.toString(),original);
  const font = await request('/font.woff2',{headers:{'Accept-Encoding':'br,gzip'}});
  assert.equal(font.headers.get('Content-Encoding'),null);
  assert.equal(font.headers.get('Content-Type'),'font/woff2');
  const changed = 'export const updated = true;\n'.repeat(250);
  await writeFile(join(directory,'app.js'),changed);
  const refreshed = await raw('br');
  assert.equal(brotliDecompressSync(refreshed.body).toString(),changed,'A changed asset must not reuse its previous compressed response.');
});

test('a public mobility JSON larger than eight MiB negotiates gzip and Brotli with a bounded exception and without caching reports', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-large-network-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = JSON.stringify({ version: 1, reference: 'public-network-fixture'.repeat(410_000) });
  assert.ok(Buffer.byteLength(original) > 8 * 1024 * 1024);
  assert.ok(Buffer.byteLength(original) < 12 * 1024 * 1024);
  await writeFile(join(directory, 'mobility-network.json'), original);
  const { base, request } = await fixture(t, { distPath: directory });
  const raw = encoding => new Promise((resolve, reject) => {
    const target = new URL(base);
    const req = httpRequest({ hostname: target.hostname, port: target.port, path: '/mobility-network.json', headers: { 'Accept-Encoding': encoding } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
  for (const [encoding, inflate] of [['gzip', gunzipSync], ['br', brotliDecompressSync]]) {
    const response = await raw(encoding);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(response.headers['content-encoding'], encoding);
    assert.equal(response.headers['content-length'], String(response.body.length));
    assert.equal(inflate(response.body).toString(), original);
    assert.ok(response.body.length < Buffer.byteLength(original));
    assert.equal(response.headers['cache-control'], 'public, max-age=3600');
    assert.match(response.headers.vary, /Accept-Encoding/);
    const head = await request('/mobility-network.json', { method: 'HEAD', headers: { 'Accept-Encoding': encoding } });
    assert.equal(head.headers.get('Content-Encoding'), encoding);
    assert.equal(head.headers.get('Content-Length'), String(response.body.length));
  }
  // Neither similarly sized ordinary text nor a binary file inherits the
  // special graph budget. HEAD checks this without transferring large files.
  for (const filename of ['other.json', 'font.woff2']) {
    await writeFile(join(directory, filename), original);
    const head = await request(`/${filename}`, { method: 'HEAD', headers: { 'Accept-Encoding': 'br,gzip' } });
    assert.equal(head.headers.get('Content-Encoding'), null);
    assert.equal(head.headers.get('Content-Length'), String(Buffer.byteLength(original)));
  }
  const oversized = ' '.repeat(12 * 1024 * 1024 + 1);
  await writeFile(join(directory, 'mobility-network.json'), oversized);
  const capped = await request('/mobility-network.json', { method: 'HEAD', headers: { 'Accept-Encoding': 'br,gzip' } });
  assert.equal(capped.headers.get('Content-Encoding'), null);
  assert.equal(capped.headers.get('Content-Length'), String(oversized.length));
  const reports = await request('/api/reports', { headers: { 'Accept-Encoding': 'br,gzip' } });
  assert.equal(reports.status, 200);
  assert.equal(reports.headers.get('Cache-Control'), 'no-store');
  assert.equal(reports.headers.get('Content-Encoding'), null);
});
