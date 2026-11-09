import type { RoutePack, Station } from '../types';
import { projectOnPolyline } from '../../server/mobility.mjs';

export type HomePoint = { lat: number; lng: number };
export type HomeCoordinates = [number, number];

/** Provenance links are optional; reject executable schemes and embedded credentials. */
export function homeSourceHref(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Linear scan, with no coordinate storage or network requests. */
export function nearestHomePoint<T extends HomePoint>(
  points: readonly T[],
  position: HomePoint,
  maxDistance = 15000,
): { point: T; distance: number } | null {
  const valid = ({ lat, lng }: HomePoint) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!valid(position)) return null;
  const rad = Math.PI / 180;
  let nearest: { point: T; distance: number } | null = null;
  for (const point of points) {
    if (!valid(point)) continue;
    const a =
      Math.sin(((point.lat - position.lat) * rad) / 2) ** 2 +
      Math.cos(position.lat * rad) *
        Math.cos(point.lat * rad) *
        Math.sin(((point.lng - position.lng) * rad) / 2) ** 2;
    const distance = 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
    if (distance <= maxDistance && (!nearest || distance < nearest.distance))
      nearest = { point, distance };
  }
  return nearest;
}

/** Published gaps must never become invented links between separate segments. */
export function homeRouteSegments(pack: RoutePack): HomeCoordinates[][] {
  return (pack.segments?.length ? pack.segments : [pack.coordinates]).filter(
    (segment) => segment.length > 1,
  );
}

/** Same published-marker checks as prepare-mobility; points never prove an active boarding stop. */
export function homePublishedStops(pack: RoutePack): RoutePack['stops'] {
  if (pack.experimentalRouting === false) return [];
  if (!Array.isArray(pack.stops)) return [];
  const segments = homeRouteSegments(pack);
  const ids = new Set<string>();
  return pack.stops.filter((stop) => {
    if (
      !stop ||
      typeof stop.id !== 'string' ||
      !stop.id ||
      typeof stop.name !== 'string' ||
      !Number.isFinite(stop.lat) ||
      !Number.isFinite(stop.lng) ||
      stop.lng < -102 ||
      stop.lng > -99 ||
      stop.lat < 24 ||
      stop.lat > 28 ||
      ids.has(stop.id)
    )
      return false;
    const note = String(stop.publishedInfrastructureNote || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    if (note.includes('PROPUESTA') && !note.includes('EXISTE')) return false;
    if (!segments.some((segment) => projectOnPolyline(stop, segment).distanceMeters <= 160))
      return false;
    ids.add(stop.id);
    return true;
  });
}

export function homeMetroCoordinates(stations: readonly Station[], stationIds: readonly string[]) {
  const byId = new Map(stations.map((station) => [station.id, station]));
  return stationIds.flatMap((id) => {
    const station = byId.get(id);
    return station ? [[station.lng, station.lat] as HomeCoordinates] : [];
  });
}

/** A small route schematic. It deliberately fetches no street tiles or regional graph. */
export function projectHomePreview(
  segments: readonly HomeCoordinates[][],
  marker?: HomePoint,
  userPosition?: HomePoint | null,
) {
  const points = segments.flat();
  if (marker) points.push([marker.lng, marker.lat]);
  if (userPosition) points.push([userPosition.lng, userPosition.lat]);
  const valid = points.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (!valid.length) return null;
  const origin = valid[0];
  const longitudeFactor = Math.cos((origin[1] * Math.PI) / 180);
  const xs = valid.map(([lng]) => (lng - origin[0]) * longitudeFactor);
  const ys = valid.map(([, lat]) => origin[1] - lat);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(280 / Math.max(maxX - minX, 0.0001), 128 / Math.max(maxY - minY, 0.0001));
  const project = ([lng, lat]: HomeCoordinates) => [
    160 + ((lng - origin[0]) * longitudeFactor - (minX + maxX) / 2) * scale,
    80 + (origin[1] - lat - (minY + maxY) / 2) * scale,
  ];
  return {
    paths: segments.map((segment) =>
      segment
        .map(project)
        .map((point) => point.join(','))
        .join(' '),
    ),
    marker: marker ? project([marker.lng, marker.lat]) : null,
    userPosition: userPosition ? project([userPosition.lng, userPosition.lat]) : null,
    radius: userPosition ? (3000 / 111_000) * scale : 0,
  };
}
