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

/** Detail journeys keep every point; this bounded simplification is only for network overview. */
export function simplifyOverviewGeometry(
  coordinates: readonly Coordinates[],
  maximumPoints = 200,
): Coordinates[] {
  const points = coordinates.filter(isRegionalCoordinate);
  if (points.length <= maximumPoints) return points;
  const simplify = (tolerance: number) => {
    const kept = new Set([0, points.length - 1]);
    const pending: [number, number][] = [[0, points.length - 1]];
    while (pending.length) {
      const [start, end] = pending.pop()!;
      const a = points[start],
        b = points[end];
      const dx = (b[0] - a[0]) * geography.longitudeFactor,
        dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      let furthest = -1,
        distance = tolerance ** 2;
      for (let index = start + 1; index < end; index++) {
        const x = (points[index][0] - a[0]) * geography.longitudeFactor,
          y = points[index][1] - a[1];
        const ratio = length ? Math.max(0, Math.min(1, (x * dx + y * dy) / length)) : 0;
        const squared = (x - dx * ratio) ** 2 + (y - dy * ratio) ** 2;
        if (squared > distance) {
          distance = squared;
          furthest = index;
        }
      }
      if (furthest >= 0) {
        kept.add(furthest);
        pending.push([start, furthest], [furthest, end]);
      }
    }
    return [...kept].sort((a, b) => a - b).map((index) => points[index]);
  };
  let tolerance = 0.00002;
  let simplified = points;
  while (simplified.length > Math.max(2, maximumPoints)) {
    simplified = simplify(tolerance);
    tolerance *= 2;
  }
  return simplified;
}

function geographic([lng, lat]: Coordinates): Coordinates {
  return [
    (lng - geography.origin[0]) * geography.unitsPerDegree * geography.longitudeFactor,
    (geography.origin[1] - lat) * geography.unitsPerDegree,
  ];
}

const regionTopLeft = geographic([ZMM_BOUNDS[0], ZMM_BOUNDS[3]]);
const regionBottomRight = geographic([ZMM_BOUNDS[2], ZMM_BOUNDS[1]]);

export function fitMapProjection(
  coordinates: readonly Coordinates[],
  viewport: { width: number; height: number } = MAP_VIEWPORT,
): MapProjection {
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
    viewport.width / (regionBottomRight[0] - regionTopLeft[0]),
    viewport.height / (regionBottomRight[1] - regionTopLeft[1]),
  );
  const scale = Math.max(
    minimumScale,
    // Leave room for endpoint markers and the controls even in narrow dialogs.
    Math.min(
      480 / Math.max(maxX - minX, 1400),
      (viewport.height - 150) / Math.max(maxY - minY, 1000),
    ),
  );
  return {
    scale,
    x: viewport.width / 2 - ((minX + maxX) / 2) * scale,
    y: viewport.height / 2 - ((minY + maxY) / 2) * scale,
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
export function constrainMapView(
  view: MapView,
  projection: MapProjection,
  viewport: { width: number; height: number } = MAP_VIEWPORT,
): MapView {
  const zoom = Math.min(5, Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1));
  const centerX = viewport.width / 2,
    centerY = viewport.height / 2;
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
    x: clampPan(view.x, viewport.width - right, -left),
    y: clampPan(view.y, viewport.height - bottom, -top),
  };
}
