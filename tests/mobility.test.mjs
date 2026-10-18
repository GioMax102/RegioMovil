import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { planMobility, resolveMobilityEndpoint, nearbyMobilityStops, sliceMobilityGeometry, distanceMeters } from '../server/mobility.mjs';
import { findPlaceReferences } from '../server/place-references.mjs';

const raw = await readFile(new URL('../data/mobility-network.json', import.meta.url), 'utf8');
const network = JSON.parse(raw);
const date = '2026-10-15T12:00:00.000Z';
const query = (from, to, extra = {}) => planMobility(network, { from: { id: from }, to: { id: to }, offline: true, date, ...extra });

test('movilidad conserva evidencia, excluye L4/L6 y notas exclusivamente propuestas', () => {
  assert.equal(network.routes.filter(route => route.mode === 'metro').length, 3);
  assert.ok(network.routes.filter(route => route.mode === 'bus').length >= 12);
  assert.ok(network.stops.length >= 1054);
  assert.equal(new Set(network.stops.map(stop => stop.id)).size, network.stops.length);
  assert.deepEqual(network.coverage.excludedRailRoutes.map(route => route.id), ['L4', 'L6']);
  assert.ok(network.routes.some(route => route.code === 'Ecovía'));
  assert.ok(network.routes.filter(route => route.networkId === 'transmetro').length >= 30);
  assert.ok(network.coverage.excludedStops.some(stop => stop.reason === 'proposed-only'));
  for (const stop of network.stops) {
    assert.equal(typeof stop.official, 'boolean');
    assert.ok(stop.sourceIds.length);
    const note = stop.publishedInfrastructureNote || '';
    assert.ok(!note.includes('PROPUESTA') || note.includes('EXISTE'));
    if (stop.mode === 'bus') assert.ok(stop.id.startsWith(`${stop.routeIds[0]}:`));
  }
  for (const route of network.routes.filter(route => route.mode === 'bus')) {
    assert.equal(typeof route.stopOrderVerified, 'boolean');
    assert.equal(typeof route.directionVerified, 'boolean');
  }
});

test('Mederos a Universidad cruza autobús real publicado y Metro con geometría por tramo', () => {
  const result = query('regioruta-a:regioruta-a-a33', 'universidad');
  assert.ok(result.journeys.length >= 1 && result.journeys.length <= 8);
  const journey = result.journeys.find(journey => journey.serviceIds.join('|') === 'regioruta-a|L2');
  assert.ok(journey);
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
  assert.ok(query('regioruta-a:regioruta-a-a33', 'universidad').journeys.some(repeated => repeated.id === journey.id));
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
  assert.throws(() => query('talleres', 'universidad', { transport: 'airplane' }), { code: 'INVALID_TRANSPORT' });
  assert.equal(resolveMobilityEndpoint(network, { id: 'padre-mier' }, { offline: true }).id, 'metro:padre-mier');
  const place = { id: 'osm:682039730', kind: 'place', lat: 25.6590567, lng: -100.3545702, name: 'Punto Valle' };
  assert.equal(resolveMobilityEndpoint(network, place).kind, 'place');
  assert.equal(resolveMobilityEndpoint(network, place).lat, place.lat);
  assert.throws(() => resolveMobilityEndpoint(network, place, { offline: true }), { code: 'OFFLINE_STOP_ONLY' });
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

test('conserva alternativas distintas ordenadas por la prioridad sin completar opciones inexistentes', () => {
  const stops = [
    { id: 'a', lat: 25.67, lng: -100.32 },
    { id: 'b', lat: 25.69, lng: -100.30 },
  ].map(stop => ({ ...stop, name: stop.id, mode: 'bus', official: true, routeIds: ['direct', 'north', 'west'] }));
  const route = (id, corner) => ({ id, mode: 'bus', name: id, segments: [{ id: `${id}:0`, stopIds: ['a', 'b'],
    coordinates: [[-100.32, 25.67], corner, [-100.30, 25.69]], positions: [0, 2] }] });
  const routes = [route('direct', [-100.31, 25.68]), route('north', [-100.32, 25.69]), route('west', [-100.335, 25.68])];
  const data = { bounds: network.bounds, stops, routes };
  const result = planMobility(data, { from: { id: 'a' }, to: { id: 'b' }, date, offline: true });
  assert.equal(result.journeys.length, 3);
  assert.equal(new Set(result.journeys.map(journey => journey.id)).size, 3);
  assert.deepEqual(result.journeys.map(journey => journey.steps[0].lineId), ['direct', 'north', 'west']);
  assert.ok(result.journeys.every((journey, index) => index === 0 || journey.score >= result.journeys[index - 1].score));
  for (const journey of result.journeys) {
    assert.deepEqual(journey.steps[0].geometry, routes.find(route => route.id === journey.steps[0].lineId).segments[0].coordinates);
  }
  assert.equal(planMobility({ ...data, routes: routes.slice(0, 1) }, { from: { id: 'a' }, to: { id: 'b' }, offline: true }).journeys.length, 1);
});

test('explora Metro, autobús y combinaciones con los mismos lugares de origen y destino', () => {
  const data = fixture();
  for (const id of ['c', 'd']) data.stops.find(stop => stop.id === id).routeIds.push('bus-link');
  const coordinates = ['c', 'd'].map(id => {
    const stop = data.stops.find(stop => stop.id === id);
    return [stop.lng, stop.lat];
  });
  data.routes.push({ id: 'bus-link', mode: 'bus', name: 'Bus de conexión', segments: [{
    id: 'bus-link:0', stopIds: ['c', 'd'], coordinates, positions: [0, 1],
  }] });
  const a = data.stops.find(stop => stop.id === 'a');
  const d = data.stops.find(stop => stop.id === 'd');
  const request = { from: { kind: 'place', name: 'Calle de salida', lat: a.lat - 0.0001, lng: a.lng },
    to: { kind: 'place', name: 'Local de destino', lat: d.lat + 0.0001, lng: d.lng }, date };
  const all = planMobility(data, request);
  const compositions = all.journeys.map(journey => [...journey.modes].sort().join('+'));
  assert.ok(compositions.includes('metro'));
  assert.ok(compositions.includes('bus'));
  assert.ok(compositions.includes('bus+metro'));
  assert.equal(new Set(all.journeys.map(journey => journey.serviceIds.join('|'))).size, all.journeys.length);
  const metro = planMobility(data, { ...request, transport: 'metro' });
  assert.deepEqual(metro.from, all.from);
  assert.deepEqual(metro.to, all.to);
  assert.ok(metro.journeys.length);
  assert.ok(metro.journeys.every(journey => journey.modes.length === 1 && journey.modes[0] === 'metro'));
  assert.equal(all.coverage.exhaustive, false);
  assert.equal(all.coverage.alternativesLimit, 8);
});

test('presenta hasta ocho servicios distintos en vez de limitarse a tres rutas casi iguales', () => {
  const routeIds = Array.from({ length: 10 }, (_, index) => `bus-${index}`);
  const stops = [{ id: 'a', lat: 25.67, lng: -100.32 }, { id: 'b', lat: 25.70, lng: -100.29 }]
    .map(stop => ({ ...stop, name: stop.id, mode: 'bus', official: true, routeIds }));
  const routes = routeIds.map((id, index) => ({ id, mode: 'bus', name: id, segments: [{
    id: `${id}:0`, stopIds: ['a', 'b'], positions: [0, 2],
    coordinates: [[-100.32, 25.67], [-100.32 - index * 0.001, 25.69], [-100.29, 25.70]],
  }] }));
  const result = planMobility({ bounds: network.bounds, stops, routes }, { from: { id: 'a' }, to: { id: 'b' }, offline: true });
  assert.equal(result.journeys.length, 8);
  assert.equal(new Set(result.journeys.map(journey => journey.serviceIds.join('|'))).size, 8);
  assert.ok(result.diagnostics.expansions <= 24000);
});

test('buscar modos combinados no fabrica un paseo de ida y vuelta en autobús para cumplir el filtro', () => {
  const stops = [
    { id: 'a', lat: 25.67, lng: -100.32, routeIds: ['L1'] },
    { id: 'b', lat: 25.67, lng: -100.31, routeIds: ['L1', 'spur'] },
    { id: 'c', lat: 25.67, lng: -100.30, routeIds: ['L1'] },
    { id: 'd', lat: 25.68, lng: -100.31, routeIds: ['spur'] },
  ].map(stop => ({ ...stop, name: stop.id, official: true, mode: 'metro' }));
  const route = (id, mode, ids) => ({ id, mode, name: id, segments: [{ id: `${id}:0`, stopIds: ids,
    positions: ids.map((_, index) => index), coordinates: ids.map(id => {
      const stop = stops.find(stop => stop.id === id); return [stop.lng, stop.lat];
    }) }] });
  const result = planMobility({ bounds: network.bounds, stops, routes: [route('L1', 'metro', ['a', 'b', 'c']), route('spur', 'bus', ['b', 'd'])] },
    { from: { id: 'a' }, to: { id: 'c' }, offline: true });
  assert.ok(result.journeys.length);
  assert.ok(result.journeys.every(journey => !journey.modes.includes('bus')));
});

test('los sondeos de llegada no agregan autobuses de ida y vuelta después de alcanzar el destino', () => {
  const pairs = [
    ['ima-130-remanente-alameda:MTY-1979', 'regioruta-a:regioruta-a-a02'],
    ['ima-214-directa-guadalupe-san-pedro-tapia:MTY-1928', 'transmetro-alameda-praderas:p66'],
    ['transmetro-alameda-praderas:p133', 'metro:del-golfo'],
  ];
  for (const [from, to] of pairs) {
    const result = query(from, to);
    assert.ok(result.journeys.length);
    for (const journey of result.journeys) {
      const stopIds = journey.steps.flatMap((step, index) => step.stopIds.slice(index === 0 ? 0 : 1));
      assert.equal(new Set(stopIds).size, stopIds.length, `Ciclo añadido en ${journey.serviceIds.join(' → ')}`);
      assert.equal(stopIds.at(-1), resolveMobilityEndpoint(network, { id: to }).id);
      assert.ok(journey.steps.filter(step => step.mode !== 'walk').every(step => step.fromId !== step.toId));
    }
  }
});

test('una caminata inicial no permite volver al origen en autobús para forzar una conexión mixta', () => {
  const stops = [
    { id: 'a', lat: 25.67, lng: -100.32, routeIds: ['L1'], mode: 'metro' },
    { id: 'd', lat: 25.69, lng: -100.32, routeIds: ['L1'], mode: 'metro' },
    { id: 'b', lat: 25.67015, lng: -100.32, routeIds: ['spur'], mode: 'bus' },
    { id: 'a2', lat: 25.67, lng: -100.32, routeIds: ['spur'], mode: 'bus' },
  ].map(stop => ({ ...stop, name: stop.id, official: true }));
  const route = (id, mode, ids) => ({ id, mode, name: id, segments: [{ id: `${id}:0`, stopIds: ids,
    positions: ids.map((_, index) => index), coordinates: ids.map(id => {
      const stop = stops.find(stop => stop.id === id); return [stop.lng, stop.lat];
    }) }] });
  const result = planMobility({ bounds: network.bounds, stops, routes: [route('L1', 'metro', ['a', 'd']), route('spur', 'bus', ['b', 'a2'])] },
    { from: { id: 'a' }, to: { id: 'd' }, offline: true });
  assert.ok(result.journeys.length);
  assert.ok(result.journeys.every(journey => !journey.modes.includes('bus')));
});

test('los nodos comunitarios documentados se aceptan online y no como extremos offline', () => {
  const data = fixture();
  data.stops.find(stop => stop.id === 'a').official = false;
  assert.equal(resolveMobilityEndpoint(data, { id: 'a' }).id, 'a');
  assert.throws(() => resolveMobilityEndpoint(data, { id: 'a' }, { offline: true }), { code: 'OFFLINE_STOP_ONLY' });
  const result = planMobility(data, { from: { kind: 'place', name: 'Fuera de red', lat: 25.4, lng: -100.75 }, to: { id: 'd' } });
  assert.deepEqual(result.journeys, []);
  assert.equal(result.diagnostics.reason, 'NO_NEARBY_ORIGIN_STOPS');
});

test('San Bernabé a Punto Valle conecta Metro y autobús hasta una parada cercana al domicilio real', () => {
  // OSM way 682039730 centroid; Río Missouri 555 is the official mall address.
  // This is a place location, not a claimed pedestrian entrance.
  const to = { kind: 'place', name: 'Punto Valle · Río Missouri 555', lat: 25.6590567, lng: -100.3545702 };
  assert.ok(network.routes.some(route => route.id === 'ima-130-remanente-alameda'));
  const nearby = nearbyMobilityStops(network, to);
  assert.ok(nearby.some(candidate => candidate.stop.routeIds.includes('ima-130-remanente-alameda') && candidate.distanceMeters < 300));
  const result = planMobility(network, { from: { id: 'san-bernabe' }, to, date });
  assert.ok(result.journeys.length);
  assert.ok(result.journeys.some(journey => journey.modes.includes('metro') && journey.modes.includes('bus')));
  assert.equal(result.to.name, to.name);
  assert.equal(result.to.lat, to.lat);
  assert.equal(result.to.lng, to.lng);
  assert.ok(result.journeys.every(journey => journey.walkingMeters <= 1200));
  assert.ok(result.diagnostics.expansions <= 24000);
  const metro = planMobility(network, { from: { id: 'san-bernabe' }, to, date, transport: 'metro' });
  assert.deepEqual(metro.journeys, []);
  assert.equal(metro.diagnostics.reason, 'NO_NEARBY_DESTINATION_STOPS');
});

test('Colonia Las Estaciones a Tec Campus Monterrey conecta Transmetro, Metro y buses sin cambiar los lugares', () => {
  // OSM way665361279 and relation21104322 are published area centroids.
  // Their source/official address and the reproduced geocoder mismatch are
  // documented in docs/las-estaciones-tec.md. Neither point claims an entrance.
  const from = findPlaceReferences('Colonia Las Estaciones')[0];
  const to = findPlaceReferences('Tec de Monterrey')[0];
  const result = planMobility(network, { from, to, date });
  assert.ok(result.journeys.length >= 2);
  assert.equal(result.from.lat, from.lat);
  assert.equal(result.from.lng, from.lng);
  assert.equal(result.to.lat, to.lat);
  assert.equal(result.to.lng, to.lng);
  assert.equal(result.to.name, 'Tec de Monterrey · Campus Monterrey');
  assert.ok(result.journeys.some(journey => journey.serviceIds.includes('transmetro-san-bernabe-no-reeleccion') &&
    journey.serviceIds.includes('L1') && journey.serviceIds.includes('transmetro-felix-u-gomez-la-estanzuela')));
  assert.ok(result.journeys.some(journey => journey.serviceIds.includes('regioruta-g')));
  assert.ok(result.journeys.every(journey => journey.walkingMeters <= 1200));
  assert.equal(result.diagnostics.reason, null);
  assert.ok(result.diagnostics.expansions <= 24000);
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
  // Expanded official bus maps are downloaded on demand, outside initial precache.
  assert.ok(gzipSync(raw).byteLength < 512 * 1024);
});
