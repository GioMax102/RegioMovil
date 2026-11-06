import { readPublicDocument } from '../api';
import { distanceMeters } from '../../server/mobility.mjs';
import { normalizePublishedRoute } from '../../shared/published-route.mjs';
import type { Station, RoutePack } from '../types';
import type { HomeCandidate, HomeRoute } from './homeTypes';
import { LOCATION_POLICY as HOME_NEARBY_POLICY } from '../mobility/locationPolicy';
export { HOME_NEARBY_POLICY };

export interface NearbyIndex {
  version: 1;
  revision: string;
  verifiedAt: string;
  origin: [number, number];
  scale: number;
  routes: HomeRoute[];
  points: [number, number, number, string][];
}
type Position = { lat: number; lng: number; accuracy: number; timestamp: number };
const safeId = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,120}$/;
const regional = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= 24 &&
  lat <= 28 &&
  lng >= -102 &&
  lng <= -99;

export function validateHomeNearby(value: unknown): NearbyIndex {
  if (!value || typeof value !== 'object') throw new Error('El índice de cercanía no es válido.');
  const index = value as NearbyIndex;
  if (
    index.version !== 1 ||
    typeof index.revision !== 'string' ||
    !/^[a-f0-9]{12}$/.test(index.revision) ||
    !/^\d{4}-\d{2}-\d{2}/.test(index.verifiedAt) ||
    !Array.isArray(index.origin) ||
    index.origin.length !== 2 ||
    index.origin[0] !== 24 ||
    index.origin[1] !== -102 ||
    index.scale !== 100000 ||
    !Array.isArray(index.routes) ||
    index.routes.length > 1000 ||
    !Array.isArray(index.points) ||
    index.points.length > 30000
  )
    throw new Error('Actualiza los datos de cercanía o elige una parada manualmente.');
  const routes = new Set<string>(),
    stops = new Set<string>();
  for (const route of index.routes) {
    if (
      !route ||
      typeof route.id !== 'string' ||
      !safeId.test(route.id) ||
      routes.has(route.id) ||
      typeof route.code !== 'string' ||
      !route.code ||
      typeof route.name !== 'string' ||
      !route.name ||
      typeof route.networkId !== 'string' ||
      !safeId.test(route.networkId) ||
      typeof route.geometryPack !== 'string' ||
      !route.geometryPack ||
      !safeId.test(route.geometryPack) ||
      (route.geometryRevision !== undefined &&
        (typeof route.geometryRevision !== 'string' ||
          !/^[a-f0-9]{12,64}$/.test(route.geometryRevision)))
    )
      throw new Error('Las rutas de cercanía no pasaron la validación.');
    routes.add(route.id);
  }
  for (const point of index.points) {
    if (
      !Array.isArray(point) ||
      point.length !== 4 ||
      !Number.isSafeInteger(point[0]) ||
      !Number.isSafeInteger(point[1]) ||
      !Number.isInteger(point[2]) ||
      point[2] < 0 ||
      point[2] >= index.routes.length ||
      typeof point[3] !== 'string' ||
      !point[3] ||
      point[3].length > 512 ||
      /[\s/?#]/.test(point[3]) ||
      !regional(24 + point[0] / 100000, -102 + point[1] / 100000)
    )
      throw new Error('Los puntos de cercanía no pasaron la validación.');
    const id = `${index.routes[point[2]].id}:${point[3]}`;
    if (stops.has(id)) throw new Error('El índice de cercanía repite una parada.');
    stops.add(id);
  }
  return index;
}

export async function loadHomeNearby(signal?: AbortSignal): Promise<NearbyIndex> {
  const { data } = await readPublicDocument<unknown>('/home-nearby.json', false, signal);
  return validateHomeNearby(data);
}

export function homeCanonicalStops(route: { id: string }, pack: RoutePack) {
  return normalizePublishedRoute(route, pack).stops;
}

/** Foreground-only ranking; exact coordinates never enter a URL, request or store. */
export function rankHomeNearby(
  index: NearbyIndex,
  position: Position,
  stations: readonly Station[],
  {
    radius = HOME_NEARBY_POLICY.radius,
    limit = HOME_NEARBY_POLICY.limit,
  }: { radius?: number; limit?: number } = {},
): HomeCandidate[] {
  const age = Date.now() - position.timestamp;
  if (
    !regional(position.lat, position.lng) ||
    !Number.isFinite(position.accuracy) ||
    position.accuracy < 0 ||
    position.accuracy > HOME_NEARBY_POLICY.maxAccuracy ||
    !Number.isFinite(age) ||
    age < -5000 ||
    age > HOME_NEARBY_POLICY.maxAgeMs ||
    !([HOME_NEARBY_POLICY.radius, HOME_NEARBY_POLICY.expandedRadius] as readonly number[]).includes(
      radius,
    )
  )
    return [];
  const candidates: { key: string; value: HomeCandidate }[] = [];
  const approximation = (distance: number) =>
    position.accuracy > HOME_NEARBY_POLICY.automaticAccuracy ||
    distance + position.accuracy > radius;
  for (const station of stations) {
    if (!regional(station.lat, station.lng)) continue;
    const distance = distanceMeters(position, station) as number;
    if (distance <= radius)
      candidates.push({
        key: `metro:${station.id}`,
        value: {
          selection: { kind: 'metro', stationId: station.id, source: 'nearby' },
          distanceMeters: distance,
          approximate: approximation(distance),
        },
      });
  }
  const buses = new Map<number, { suffix: string; distance: number }>();
  for (const [lat, lng, ordinal, suffix] of index.points) {
    const distance = distanceMeters(position, {
      lat: index.origin[0] + lat / index.scale,
      lng: index.origin[1] + lng / index.scale,
    }) as number;
    const previous = buses.get(ordinal);
    if (
      distance <= radius &&
      (!previous ||
        distance < previous.distance ||
        (distance === previous.distance && suffix < previous.suffix))
    )
      buses.set(ordinal, { suffix, distance });
  }
  for (const [ordinal, { suffix, distance }] of buses) {
    const route = index.routes[ordinal];
    candidates.push({
      key: `bus:${route.id}`,
      value: {
        selection: { kind: 'bus', route, stopId: `${route.id}:${suffix}`, source: 'nearby' },
        distanceMeters: distance,
        approximate: approximation(distance),
      },
    });
  }
  return candidates
    .sort((a, b) => a.value.distanceMeters! - b.value.distanceMeters! || a.key.localeCompare(b.key))
    .slice(
      0,
      Math.max(
        0,
        Math.min(
          HOME_NEARBY_POLICY.limit,
          Number.isFinite(limit) ? Math.floor(limit) : HOME_NEARBY_POLICY.limit,
        ),
      ),
    )
    .map((item) => item.value);
}
