import { isRegionalCoordinate, ZMM_BOUNDS } from './mapGeography';

export interface MapPosition {
  lat: number;
  lng: number;
}
export interface RegionalView extends MapPosition {
  zoom: number;
}
export interface MapSize {
  width: number;
  height: number;
}
export const CITY_CENTER = { lat: 25.6866, lng: -100.3161 };
export const MAX_MAP_ZOOM = 17;
export function worldPoint({ lat, lng }: MapPosition) {
  const sine = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI) };
}
export function worldPosition(x: number, y: number): MapPosition {
  return { lng: x * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI };
}
const northWest = worldPoint({ lng: ZMM_BOUNDS[0], lat: ZMM_BOUNDS[3] });
const southEast = worldPoint({ lng: ZMM_BOUNDS[2], lat: ZMM_BOUNDS[1] });
/** Zoom out as far as this viewport can go while every edge remains in the region. */
export function minimumRegionalZoom(size: MapSize) {
  const width = Math.max(1, Number.isFinite(size.width) ? size.width : 720);
  const height = Math.max(1, Number.isFinite(size.height) ? size.height : 420);
  return Math.max(
    0,
    Math.log2(
      Math.max(width / (southEast.x - northWest.x), height / (southEast.y - northWest.y)) / 256,
    ),
  );
}
export function constrainRegionalView(view: RegionalView, size: MapSize): RegionalView {
  const width = Math.max(1, Number.isFinite(size.width) ? size.width : 720);
  const height = Math.max(1, Number.isFinite(size.height) ? size.height : 420);
  const minimum = minimumRegionalZoom(size);
  const zoom = Math.max(
    minimum,
    Math.min(MAX_MAP_ZOOM, Number.isFinite(view.zoom) ? view.zoom : 13),
  );
  const pixels = 256 * 2 ** zoom;
  const center = worldPoint(
    Number.isFinite(view.lat) && Number.isFinite(view.lng) ? view : CITY_CENTER,
  );
  const x = Math.min(
    southEast.x - width / pixels / 2,
    Math.max(northWest.x + width / pixels / 2, center.x),
  );
  const y = Math.min(
    southEast.y - height / pixels / 2,
    Math.max(northWest.y + height / pixels / 2, center.y),
  );
  return { ...worldPosition(x, y), zoom };
}
export function visibleRegionalBounds(view: RegionalView, size: MapSize) {
  const center = worldPoint(view),
    pixels = 256 * 2 ** view.zoom;
  return {
    northWest: worldPosition(
      center.x - size.width / pixels / 2,
      center.y - size.height / pixels / 2,
    ),
    southEast: worldPosition(
      center.x + size.width / pixels / 2,
      center.y + size.height / pixels / 2,
    ),
  };
}
export function fitRegionalPositions(points: MapPosition[], size: MapSize): RegionalView {
  points = points.filter((point) => isRegionalCoordinate([point?.lng, point?.lat]));
  if (!points.length) return constrainRegionalView({ ...CITY_CENTER, zoom: 13 }, size);
  const extent = points.map(worldPoint).reduce(
    (box, point) => ({
      left: Math.min(box.left, point.x),
      right: Math.max(box.right, point.x),
      top: Math.min(box.top, point.y),
      bottom: Math.max(box.bottom, point.y),
    }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  );
  const zoom = Math.min(
    15,
    Math.log2(
      Math.min(
        Math.max(120, size.width - 100) / Math.max(0.00001, extent.right - extent.left),
        Math.max(100, size.height - 100) / Math.max(0.00001, extent.bottom - extent.top),
      ) / 256,
    ),
  );
  return constrainRegionalView(
    { ...worldPosition((extent.left + extent.right) / 2, (extent.top + extent.bottom) / 2), zoom },
    size,
  );
}
