import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { planMobility, resolveMobilityEndpoint, nearbyMobilityStops, sliceMobilityGeometry, distanceMeters } from '../server/mobility.mjs';

const raw = await readFile(new URL('../data/mobility-network.json', import.meta.url), 'utf8');
const network = JSON.parse(raw);
const date = '2026-10-15T12:00:00.000Z';
const query = (from, to, extra = {}) => planMobility(network, { from: { id: from }, to: { id: to }, offline: true, date, ...extra });

test('movilidad conserva evidencia, excluye L4/L6 y notas exclusivamente propuestas', () => {
  assert.equal(network.routes.filter(route => route.mode === 'metro').length, 3);
  assert.equal(network.routes.filter(route => route.mode === 'bus').length, 12);
  assert.equal(network.stops.length, 1054);
  assert.equal(new Set(network.stops.map(stop => stop.id)).size, network.stops.length);
  assert.deepEqual(network.coverage.excludedRailRoutes.map(route => route.id), ['L4', 'L6']);
  assert.ok(network.coverage.excludedRoutes.some(route => route.code === 'Ecovía'));
  assert.ok(network.coverage.excludedStops.some(stop => stop.reason === 'proposed-only'));
  for (const stop of network.stops) {
    assert.equal(stop.official, true);
    const note = stop.publishedInfrastructureNote || '';
    assert.ok(!note.includes('PROPUESTA') || note.includes('EXISTE'));
    if (stop.mode === 'bus') assert.ok(stop.id.startsWith(`${stop.routeIds[0]}:`));
  }
  for (const route of network.routes.filter(route => route.mode === 'bus')) {
    assert.equal(route.stopOrderVerified, false);
    assert.equal(route.directionVerified, false);
  }
});

test('Mederos a Universidad cruza autobús real publicado y Metro con geometría por tramo', () => {
  const result = query('regioruta-a:regioruta-a-a33', 'universidad');
  assert.ok(result.journeys.length >= 1 && result.journeys.length <= 3);
  const journey = result.journeys[0];
  assert.deepEqual(journey.steps.map(step => step.mode), ['bus', 'walk', 'metro']);
  assert.equal(journey.steps[0].lineId, 'regioruta-a');
  assert.equal(journey.steps.at(-1).lineId, 'L2');
  assert.ok(journey.walkingMeters > 0 && journey.walkingMeters <= 1200);
  assert.equal(journey.transfers, 1);
  assert.ok(journey.steps[0].geometry.length > 25);
  assert.equal(journey.source, 'simulation');
  assert.equal(journey.accessibility, 'unknown');
  assert.equal(journey.steps[0].stopOrderVerified, false);
  assert.ok(result.diagnostics.expansions <= 24000);
  assert.equal(result.mode, 'experimental');
  assert.equal(result.generatedAt, date);
  assert.equal(query('regioruta-a:regioruta-a-a33', 'universidad').journeys[0].id, journey.id);
});

test('reglas de offline y coordenadas rechazan GPS, lugares, cadenas numéricas y cobertura externa', () => {
  for (const kind of ['place', 'location', 'coordinate']) {
    assert.throws(() => resolveMobilityEndpoint(network, { kind, lat: 25.67, lng: -100.31 }, { offline: true }), { code: 'OFFLINE_STOP_ONLY' });
  }
  for (const endpoint of [{ kind: 'place', lat: NaN, lng: -100.31 }, { kind: 'location', lat: 25.67, lng: Infinity },
    { kind: 'place', lat: '25.67', lng: -100.31 }, { lat: 25.67, lng: -100.31 }, null]) {
    assert.throws(() => resolveMobilityEndpoint(network, endpoint), { code: 'INVALID_ENDPOINT' });
  }
  assert.throws(() => resolveMobilityEndpoint(network, { kind: 'place', lat: 19.43, lng: -99.13 }), { code: 'OUTSIDE_COVERAGE' });
  assert.throws(() => query('L4', 'universidad'), { code: 'UNKNOWN_STOP' });
  assert.throws(() => query('talleres', 'universidad', { preference: 'flying' }), { code: 'INVALID_PREFERENCE' });
  assert.throws(() => query('talleres', 'universidad', { scenario: 'tomorrow' }), { code: 'INVALID_SCENARIO' });
  assert.equal(resolveMobilityEndpoint(network, { id: 'padre-mier' }, { offline: true }).id, 'metro:padre-mier');
});

test('ubicación real conecta solo a paradas cercanas; fuera del alcance no fabrica servicio', () => {
  const stop = network.stops.find(stop => stop.stationId === 'padre-mier');
  const from = { kind: 'location', lat: stop.lat + 0.0002, lng: stop.lng, name: 'Mi ubicación' };
  const result = planMobility(network, { from, to: { id: 'universidad' }, date });
  assert.ok(result.journeys.length);
  assert.equal(result.journeys[0].steps[0].mode, 'walk');
  assert.ok(result.journeys[0].walkingMeters <= 1200);
  assert.ok(nearbyMobilityStops(network, from).every(candidate => candidate.distanceMeters <= 1200));
  const disconnected = planMobility(network, { from: { kind: 'place', lat: 25.4, lng: -100.75, name: 'Punto fuera de red' }, to: { id: 'universidad' }, date });
  assert.deepEqual(disconnected.journeys, []);
  assert.match(disconnected.message, /No encontramos conexión/);
});

function fixture() {
  const stops = [
    { id: 'a', lat: 25.67, lng: -100.32, routeIds: ['slow', 'fast-1'] },
    { id: 'b', lat: 25.67, lng: -100.31, routeIds: ['fast-1'] },
    { id: 'c', lat: 25.68, lng: -100.31, routeIds: ['fast-1', 'fast-2'] },
    { id: 'd', lat: 25.68, lng: -100.32, routeIds: ['slow', 'fast-2'] },
  ].map(stop => ({ ...stop, name: stop.id, mode: 'metro', official: true }));
  const coordinates = ids => ids.map(id => { const stop = stops.find(stop => stop.id === id); return [stop.lng, stop.lat]; });
  return { bounds: network.bounds, stops, routes: [
    { id: 'slow', mode: 'bus', name: 'Directo', segments: [{ id: 'slow:0', stopIds: ['a', 'd'],
      coordinates: [[-100.32, 25.67], [-100.335, 25.67], [-100.335, 25.68], [-100.32, 25.68]], positions: [0, 3] }] },
    { id: 'fast-1', mode: 'metro', name: 'Metro 1', segments: [{ id: 'fast-1:0', stopIds: ['a', 'b', 'c'], coordinates: coordinates(['a', 'b', 'c']), positions: [0, 1, 2] }] },
    { id: 'fast-2', mode: 'metro', name: 'Metro 2', segments: [{ id: 'fast-2:0', stopIds: ['c', 'd'], coordinates: coordinates(['c', 'd']), positions: [0, 1] }] },
  ] };
}

test('prioridad accesible penaliza cambios sin prometer accesibilidad verificada', () => {
  const data = fixture();
  const request = { from: { id: 'a' }, to: { id: 'd' }, date, offline: true };
  const fast = planMobility(data, request);
  const accessible = planMobility(data, { ...request, preference: 'accessible' });
  assert.ok(fast.journeys[0].transfers > accessible.journeys[0].transfers);
  assert.equal(accessible.journeys[0].accessibility, 'unknown');
  assert.ok(fast.journeys.length >= 2);
  assert.ok(fast.journeys.every((journey, index) => index === 0 || journey.score >= fast.journeys[index - 1].score));
});

test('score conserva el objetivo de búsqueda sin duplicar transbordos ni sumar penalizaciones de alternativas', () => {
  const data = fixture();
  for (const preference of ['fastest', 'comfortable', 'accessible']) {
    const result = planMobility(data, { from: { id: 'a' }, to: { id: 'd' }, date, offline: true, preference });
    for (const journey of result.journeys) {
      let expected = journey.transfers * ({ fastest: 3, comfortable: 8, accessible: 16 }[preference]);
      for (const step of journey.steps) {
        const meters = step.geometry.slice(1).reduce((sum, coordinate, index) => sum + distanceMeters(
          { lng: step.geometry[index][0], lat: step.geometry[index][1] }, { lng: coordinate[0], lat: coordinate[1] }), 0);
        const ride = meters / (step.mode === 'metro' ? 32000 : 18000) * 60 + step.stationCount * (step.mode === 'metro' ? 0.55 : 0.3);
        expected += ride + step.waitingMinutes;
        if (preference === 'comfortable') expected += ride * step.occupancy / 100 * 0.7;
      }
      assert.equal(journey.score, Math.round(expected * 10) / 10);
    }
  }
});

test('conserva una llegada con menos caminata aunque otra más barata consuma el mismo antiguo bucket', () => {
  const lngAt = meters => -100.32 + meters / (111195 * Math.cos(25.67 * Math.PI / 180));
  const stops = [80, 112, 144].map((meters, index) => ({ id: ['a', 'b', 'c'][index], name: ['A', 'B', 'C'][index],
    lat: 25.67, lng: lngAt(meters), mode: 'metro', routeIds: ['L1'], official: true }));
  const data = { bounds: network.bounds, stops, routes: [{ id: 'L1', mode: 'metro', name: 'Metro 1', segments: [{ id: 'L1:0',
    stopIds: ['a', 'b', 'c'], coordinates: stops.map(stop => [stop.lng, stop.lat]), positions: [0, 1, 2] }] }] };
  const result = planMobility(data, { from: { kind: 'place', lat: 25.67, lng: lngAt(0), name: 'Origen' },
    to: { kind: 'place', lat: 25.67, lng: lngAt(1008), name: 'Destino' }, date });
  assert.ok(result.journeys.length);
  assert.ok(result.journeys[0].walkingMeters <= 1200);
  assert.equal(result.journeys[0].steps.find(step => step.mode === 'metro').fromId, 'a');
  assert.equal(result.journeys[0].steps.find(step => step.mode === 'metro').toId, 'c');
});

test('trazos discontinuos de una misma ruta no forman una arista ni una caminata implícita', () => {
  const e = network.routes.find(route => route.id === 'regioruta-e');
  assert.equal(e.segments.length, 2);
  assert.ok(e.segments.every(segment => segment.stopIds.length >= 2));
  const firstIds = new Set(e.segments[0].stopIds);
  assert.ok(e.segments[1].stopIds.every(id => !firstIds.has(id)));
  const ids = [e.segments[0].stopIds[0], e.segments[1].stopIds[0]];
  const isolated = { ...network, routes: [e], stops: network.stops.filter(stop => stop.routeIds.includes(e.id)), throughServices: [] };
  const result = planMobility(isolated, { from: { id: ids[0] }, to: { id: ids[1] }, offline: true, date });
  assert.deepEqual(result.journeys, []);
  const segment = e.segments[0];
  const sliced = sliceMobilityGeometry(segment, segment.positions[0], segment.positions[1]);
  assert.deepEqual(sliceMobilityGeometry(segment, segment.positions[1], segment.positions[0]), [...sliced].reverse());
  assert.ok(distanceMeters({ lat: 25.67, lng: -100.31 }, { lat: 25.67, lng: -100.31 }) === 0);
});

test('búsqueda limitada y benchmark determinista de consultas representativas', t => {
  const limited = query('talleres', 'universidad', { maxExpansions: 1 });
  assert.equal(limited.diagnostics.expansions, 1);
  assert.equal(limited.diagnostics.truncated, true);
  const pairs = [['regioruta-a:regioruta-a-a33', 'universidad'], ['exposicion', 'hospital-metropolitano'], ['talleres', 'zaragoza']];
  const timings = [];
  for (let repeat = 0; repeat < 3; repeat++) for (const [from, to] of pairs) {
    const start = performance.now();
    const result = query(from, to);
    timings.push(performance.now() - start);
    assert.ok(result.journeys.length);
    assert.ok(result.diagnostics.expansions <= 24000);
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
  t.diagnostic(`9 consultas; mediana ${timings[4].toFixed(1)} ms; p95 ${p95.toFixed(1)} ms; JSON ${(Buffer.byteLength(raw) / 1024).toFixed(1)} KiB, gzip ${(gzipSync(raw).byteLength / 1024).toFixed(1)} KiB.`);
  // Generous CI ceiling catches unbounded/exponential regressions, not host noise.
  assert.ok(p95 < 1500, `Consulta fuera del presupuesto de prueba: ${p95.toFixed(1)} ms`);
  assert.ok(gzipSync(raw).byteLength < 110 * 1024);
});
