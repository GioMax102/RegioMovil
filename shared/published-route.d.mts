export interface PublishedMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  infrastructureStatus?: string;
  publishedInfrastructureNote?: string;
  municipality?: string;
}
export interface CanonicalStop extends PublishedMarker {
  mode: 'bus';
  routeIds: string[];
  sourceIds?: string[];
  official: true;
  snapDistanceMeters: number;
}
export interface PublishedSegment {
  id: string;
  coordinates: [number, number][];
  stopIds: string[];
  positions: number[];
}
export function normalizePublishedRoute(
  route: { id: string; sourceIds?: string[] },
  pack: {
    coordinates: [number, number][];
    segments?: [number, number][][];
    stops: PublishedMarker[];
    experimentalRouting?: boolean;
  },
): {
  stops: CanonicalStop[];
  segments: PublishedSegment[];
  excludedStops: { routeId: string; markerId?: string; reason: string }[];
  reason: 'visualization-only' | 'insufficient-published-stops' | null;
};
