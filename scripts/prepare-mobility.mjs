import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { projectOnPolyline } from '../server/mobility.mjs';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [metro, catalog] = await Promise.all([read('data/network.json'), read('data/transit-catalog.json')]);
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 12);
const stops = [];
const routes = [];
const exclusions = [];
const excludedStops = [];
const routeIds = new Map();
for (const line of metro.lines) {
  if (['construction', 'announced'].includes(line.status) || line.planningEligible === false) continue;
  for (const id of line.stationIds) routeIds.set(id, [...(routeIds.get(id) || []), line.id]);
}
for (const stop of metro.stations.filter(stop => routeIds.has(stop.id))) {
  stops.push({ id: `metro:${stop.id}`, stationId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng,
    ...(stop.aliases?.length ? { aliases: stop.aliases } : {}),
    municipality: stop.municipality, mode: 'metro', routeIds: routeIds.get(stop.id),
    sourceIds: [stop.sourceId], official: true, infrastructureStatus: 'unknown' });
}
for (const line of metro.lines.filter(line => line.stationIds?.length && line.planningEligible !== false && !['construction', 'announced'].includes(line.status))) {
  const points = line.stationIds.map(id => stops.find(stop => stop.stationId === id));
  routes.push({ id: line.id, code: line.id, name: line.name, mode: 'metro', networkId: 'metrorrey', color: line.color,
    sourceIds: ['metrorrey-mapa-2026', 'nl-paradas-2025'], stopOrderVerified: true, directionVerified: true,
    geometryKind: 'station-links', segments: [{ id: `${line.id}:0`, stopIds: points.map(point => point.id),
      coordinates: points.map(point => [point.lng, point.lat]), positions: points.map((_, index) => index) }] });
}
for (const route of catalog.routes.filter(route => route.mode === 'bus')) {
  if (!route.geometryPack || ['construction', 'announced'].includes(route.status)) {
    exclusions.push({ id: route.id, code: route.code, reason: 'no-published-geometry' });
    continue;
  }
  const pack = await read(`public/route-packs/${route.geometryPack}.json`);
  // Published segments remain separate. Never concatenate disconnected paths.
  const segments = (pack.segments?.length ? pack.segments : [pack.coordinates]).map((coordinates, index) =>
    ({ id: `${route.id}:${index}`, coordinates, records: [] }));
  const usedIds = new Set();
  for (const marker of pack.stops) {
    const note = String(marker.publishedInfrastructureNote || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (note.includes('PROPUESTA') && !note.includes('EXISTE')) {
      excludedStops.push({ routeId: route.id, markerId: marker.id, reason: 'proposed-only' });
      continue;
    }
    const matches = segments.map((segment, index) => ({ index, ...projectOnPolyline(marker, segment.coordinates) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearest = matches[0];
    if (!nearest || nearest.distanceMeters > 160) {
      excludedStops.push({ routeId: route.id, markerId: marker.id, reason: 'too-far-from-published-trace' });
      continue;
    }
    let id = `${route.id}:${encodeURIComponent(marker.id)}`;
    if (usedIds.has(id)) id += `:${digest(`${marker.lng},${marker.lat},${marker.name}`)}`;
    // Exact duplicates do not create a second vertex or a zero-length loop.
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    const stop = { id, name: marker.name, lat: marker.lat, lng: marker.lng,
      mode: 'bus', routeIds: [route.id], sourceIds: route.sourceIds, official: true,
      infrastructureStatus: marker.infrastructureStatus || 'unknown',
      ...(marker.municipality ? { municipality: marker.municipality } : {}),
      ...(marker.publishedInfrastructureNote ? { publishedInfrastructureNote: marker.publishedInfrastructureNote } : {}),
      snapDistanceMeters: Math.round(nearest.distanceMeters) };
    stops.push(stop);
    segments[nearest.index].records.push({ id, position: nearest.position });
  }
  const usableSegments = segments.map(segment => {
    segment.records.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    return { id: segment.id, coordinates: segment.coordinates, stopIds: segment.records.map(record => record.id),
      positions: segment.records.map(record => Math.round(record.position * 1e6) / 1e6) };
  }).filter(segment => segment.stopIds.length >= 2);
  const retainedIds = new Set(usableSegments.flatMap(segment => segment.stopIds));
  for (let index = stops.length - 1; index >= 0; index--) {
    if (stops[index].routeIds[0] === route.id && !retainedIds.has(stops[index].id)) stops.splice(index, 1);
  }
  if (!usableSegments.length) {
    exclusions.push({ id: route.id, code: route.code, reason: 'insufficient-published-stops' });
    continue;
  }
  routes.push({ id: route.id, code: route.code, name: route.name, mode: 'bus', networkId: route.networkId,
    color: route.networkId === 'regioruta' ? '#46794d' : route.networkId === 'transmetro' ? '#008b72' : route.networkId === 'ecovia' ? '#a54545' : '#4975a4', sourceIds: route.sourceIds,
    stopOrderVerified: false, directionVerified: false, geometryKind: 'official-published',
    statusAsOf: route.statusAsOf, geometryPack: route.geometryPack, geometryRevision: route.geometryRevision,
    segments: usableSegments });
}
const data = {
  version: 1, mode: 'experimental', verifiedAt: catalog.verifiedAt, bounds: [-100.9, 25.35, -99.8, 26.1],
  limits: { maxWalkingMeters: 1200, maxTransferWalkingMeters: 350, maxExpansions: 24000, maxTransfers: 4 },
  stops, routes,
  throughServices: (metro.throughServices || []).map(service => ({ ...service, stationId: `metro:${service.stationId}` })),
  sources: [...new Map([...metro.sources, ...catalog.sources].map(source => [source.id, source])).values()],
  coverage: { metroLines: routes.filter(route => route.mode === 'metro').length,
    busRoutes: routes.filter(route => route.mode === 'bus').length, publishedStops: stops.length,
    excludedRailRoutes: catalog.routes.filter(route => route.mode === 'metro' && ['construction', 'announced'].includes(route.status)).map(route => ({ id: route.id, reason: route.status })),
    excludedRoutes: exclusions, excludedStops, retainedSegmentCount: routes.reduce((sum, route) => sum + route.segments.length, 0) },
  assumptions: [
    'Experimento: el orden de autobuses se infiere por proyección sobre cada trazo publicado; sentidos y operación sin verificar. Se exploran ambos sentidos sin afirmar servicio en ambos.',
    'Las conexiones a pie son distancias geodésicas multiplicadas por 1.25; no verifican banquetas, cruces, accesos ni barreras.',
    'Los tiempos, esperas y aforos son simulados. El modelo no contiene horarios de servicio ni garantiza una salida.',
    'La geometría Metro une coordenadas oficiales de estaciones; no reproduce el trazo exacto de las vías.',
    'Solo se incluyen marcadores publicados a menos de 160 m del trazo y se excluyen notas solo PROPUESTA sin EXISTE.',
    'Las rutas sin geometría o estaciones documentadas y las líneas en construcción quedan fuera del grafo.',
  ],
};
data.revision = digest(JSON.stringify(data));
const json = JSON.stringify(data);
await mkdir(new URL('public/', root), { recursive: true });
await Promise.all(['data/mobility-network.json', 'public/mobility-network.json'].map(path => writeFile(new URL(path, root), json)));
console.log(`Movilidad experimental: ${routes.length} líneas/recorridos, ${stops.length} puntos publicados, ${excludedStops.length} marcadores excluidos; ${(Buffer.byteLength(json) / 1024).toFixed(1)} KiB.`);
