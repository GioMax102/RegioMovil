import type { TransitRoute } from '../types';
import type { PositionFix } from '../mobility/location';

export type HomeSelectionSource = 'base' | 'manual' | 'nearby';
export type HomeRoute = Pick<
  TransitRoute,
  'id' | 'code' | 'name' | 'networkId' | 'geometryPack' | 'geometryRevision'
>;
export type HomeSelection =
  | { kind: 'metro'; stationId: string; lineId?: string; source: HomeSelectionSource }
  | { kind: 'bus'; route: HomeRoute; stopId?: string; source: HomeSelectionSource };

export interface HomeCandidate {
  selection: HomeSelection;
  distanceMeters?: number;
  approximate?: boolean;
}

export interface HomeUiState {
  metroMapOpen: boolean;
  returnTo?: 'plan' | 'map';
  scrollTop?: number;
  nearbyPosition?: PositionFix | null;
}
