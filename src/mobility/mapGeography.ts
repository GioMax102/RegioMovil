import geography from '../data/monterrey-map.json';
import type { Coordinates } from './types';

// The same regional extent is used by the routing model and the place search.
export const ZMM_BOUNDS = [-100.9, 25.35, -99.8, 26.1] as const;
export const MAP_VIEWPORT = { width: 670, height: 410 } as const;
export interface MapProjection {
  scale: number;
  x: number;
  y: number;
}
export interface MapView {
  zoom: number;
  x: number;
  y: number;
}

export function isRegionalCoordinate(value: unknown): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= ZMM_BOUNDS[0] &&
    value[0] <= ZMM_BOUNDS[2] &&
    value[1] >= ZMM_BOUNDS[1] &&
    value[1] <= ZMM_BOUNDS[3]
  );
}

export function clampRegionalCoordinate([lng, lat]: Coordinates): Coordinates {
  return [
    Math.min(ZMM_BOUNDS[2], Math.max(ZMM_BOUNDS[0], Number.isFinite(lng) ? lng : -100.32)),
    Math.min(ZMM_BOUNDS[3], Math.max(ZMM_BOUNDS[1], Number.isFinite(lat) ? lat : 25.68)),
  ];
}

function geographic([lng, lat]: Coordinates): Coordinates {
  return [
    (lng - geography.origin[0]) * geography.unitsPerDegree * geography.longitudeFactor,
    (geography.origin[1] - lat) * geography.unitsPerDegree,
  ];
}

const regionTopLeft = geographic([ZMM_BOUNDS[0], ZMM_BOUNDS[3]]);
const regionBottomRight = geographic([ZMM_BOUNDS[2], ZMM_BOUNDS[1]]);

export function fitMapProjection(coordinates: readonly Coordinates[]): MapProjection {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const coordinate of coordinates) {
    if (!isRegionalCoordinate(coordinate)) continue;
    const [x, y] = geographic(coordinate);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) {
    [minX, minY] = geographic([-100.36, 25.74]);
    [maxX, maxY] = geographic([-100.28, 25.64]);
  }
  const minimumScale = Math.max(
    MAP_VIEWPORT.width / (regionBottomRight[0] - regionTopLeft[0]),
    MAP_VIEWPORT.height / (regionBottomRight[1] - regionTopLeft[1]),
  );
  const scale = Math.max(
    minimumScale,
    Math.min(550 / Math.max(maxX - minX, 1400), 300 / Math.max(maxY - minY, 1000)),
  );
  return {
    scale,
    x: MAP_VIEWPORT.width / 2 - ((minX + maxX) / 2) * scale,
    y: MAP_VIEWPORT.height / 2 - ((minY + maxY) / 2) * scale,
  };
}

export function projectMapCoordinate(
  coordinate: Coordinates,
  projection: MapProjection,
): Coordinates {
  const [x, y] = geographic(coordinate);
  return [x * projection.scale + projection.x, y * projection.scale + projection.y];
}

export function unprojectMapCoordinate(
  [x, y]: Coordinates,
  projection: MapProjection,
): Coordinates {
  return clampRegionalCoordinate([
    (x - projection.x) / projection.scale / (geography.unitsPerDegree * geography.longitudeFactor) +
      geography.origin[0],
    geography.origin[1] - (y - projection.y) / projection.scale / geography.unitsPerDegree,
  ]);
}

// Translate only as far as the regional rectangle permits. Finite fallbacks also
// protect against cancelled gestures, a zero-sized element, or malformed input.
export function constrainMapView(view: MapView, projection: MapProjection): MapView {
  const zoom = Math.min(5, Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1));
  const centerX = MAP_VIEWPORT.width / 2,
    centerY = MAP_VIEWPORT.height / 2;
  const left = centerX + (regionTopLeft[0] * projection.scale + projection.x - centerX) * zoom;
  const right = centerX + (regionBottomRight[0] * projection.scale + projection.x - centerX) * zoom;
  const top = centerY + (regionTopLeft[1] * projection.scale + projection.y - centerY) * zoom;
  const bottom =
    centerY + (regionBottomRight[1] * projection.scale + projection.y - centerY) * zoom;
  const clampPan = (value: number, minimum: number, maximum: number) =>
    minimum > maximum
      ? (minimum + maximum) / 2
      : Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));
  return {
    zoom,
    x: clampPan(view.x, MAP_VIEWPORT.width - right, -left),
    y: clampPan(view.y, MAP_VIEWPORT.height - bottom, -top),
  };
}
