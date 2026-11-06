import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { normalizePublishedRoute } from '../shared/published-route.mjs';

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
  const normalized = normalizePublishedRoute(route, pack);
  excludedStops.push(...normalized.excludedStops);
  if (normalized.reason) {
    exclusions.push({ id: route.id, code: route.code, reason: normalized.reason });
    continue;
  }
  stops.push(...normalized.stops);
  const usableSegments = normalized.segments;
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
// An opt-in public index has IDs and coordinates, never complete route geometries.
const nearbyRoutes = routes.filter(route => route.mode === 'bus');
const ordinal = new Map(nearbyRoutes.map((route, index) => [route.id, index]));
const nearby = {
  version: 1, revision: data.revision, verifiedAt: data.verifiedAt,
  origin: [24, -102], scale: 100000,
  routes: nearbyRoutes.map(route => Object.fromEntries(
    ['id','code','name','networkId','geometryPack','geometryRevision'].map(key => [key, route[key]]))),
  points: stops.filter(stop => stop.mode === 'bus').flatMap(stop => stop.routeIds.map(routeId => {
    if (!stop.id.startsWith(`${routeId}:`) || !ordinal.has(routeId)) throw new Error('Invalid canonical nearby stop.');
    return [Math.round((stop.lat - 24) * 100000), Math.round((stop.lng + 102) * 100000), ordinal.get(routeId), stop.id.slice(routeId.length + 1)];
  })),
};
const nearbyJson = JSON.stringify(nearby);
const nearbyBytes = Buffer.byteLength(nearbyJson), nearbyGzip = gzipSync(nearbyJson, {level:6}).length;
if (nearbyBytes > 450 * 1024 || nearbyGzip > 110 * 1024) throw new Error(`Nearby index exceeds its budget: ${nearbyBytes} raw / ${nearbyGzip} gzip bytes.`);

await mkdir(new URL('public/', root), { recursive: true });
await Promise.all(['data/mobility-network.json', 'public/mobility-network.json'].map(path => writeFile(new URL(path, root), json)));
await writeFile(new URL('public/home-nearby.json', root), nearbyJson);
console.log(`Cercanía bajo demanda: ${nearby.points.length} puntos; ${nearbyBytes} bytes JSON / ${nearbyGzip} gzip6.`);
console.log(`Movilidad experimental: ${routes.length} líneas/recorridos, ${stops.length} puntos publicados, ${excludedStops.length} marcadores excluidos; ${(Buffer.byteLength(json) / 1024).toFixed(1)} KiB.`);
