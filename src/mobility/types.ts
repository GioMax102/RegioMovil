import type { Preference, Scenario, Source } from '../types';

export type Coordinates = [number, number];
export type MobilityEndpoint =
  | { id: string; name?: string }
  | {
      lat: number;
      lng: number;
      name: string;
      kind: 'place' | 'location';
      accuracy?: number;
      address?: string;
    };
export interface MobilityStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  mode: 'metro' | 'bus';
  routeIds: string[];
  sourceIds: string[];
  official: boolean;
  stationId?: string;
  aliases?: string[];
}
export interface MobilityRoute {
  id: string;
  code: string;
  name: string;
  networkId: string;
  mode: 'metro' | 'bus';
  color: string;
  stopOrderVerified: boolean;
  sourceIds: string[];
  segments: { id: string; stopIds: string[]; coordinates: Coordinates[]; positions: number[] }[];
}
export interface MobilityNetwork {
  version: number;
  mode: 'experimental';
  stops: MobilityStop[];
  routes: MobilityRoute[];
  coverage: Record<string, unknown>;
  assumptions: string[];
  sources?: Source[];
}
export interface MobilityStep {
  mode: 'metro' | 'bus' | 'walk';
  lineId: string;
  lineName: string;
  fromId: string;
  toId: string;
  from: string;
  to: string;
  minutes: number;
  distanceMeters: number;
  stationCount: number;
  geometry: Coordinates[];
  experimental: boolean;
  stopOrderVerified: boolean;
  source: 'simulation';
  networkId?: string;
  code?: string;
  color?: string;
  directionVerified?: boolean;
}
export interface MobilityJourney {
  id: string;
  title: string;
  durationMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  transfers: number;
  occupancy: number;
  etaRange: number[];
  score: number;
  steps: MobilityStep[];
  stationIds: string[];
  source: 'simulation';
  accessibility: 'unknown';
  modes?: ('metro' | 'bus')[];
  serviceIds?: string[];
}
export interface MobilityPlan {
  mode: 'experimental';
  journeys: MobilityJourney[];
  from: MobilityEndpoint;
  to: MobilityEndpoint;
  generatedAt: string;
  preference: Preference;
  offline: boolean;
  message?: string;
  diagnostics: {
    expansions: number;
    truncated: boolean;
    searches?: number;
    reason?: string | null;
  };
  coverage?: {
    routeCount: number;
    stopCount: number;
    networks: { id: string; routeCount: number }[];
    excludedRouteCount: number;
    maxWalkingMeters: number;
    exhaustive: boolean;
    alternativesLimit: number;
  };
}
export interface Place extends Exclude<MobilityEndpoint, { id: string }> {
  id: string;
  kind: 'place';
  displayName: string;
  address?: string;
  resultType?: 'place' | 'street' | 'address';
}
export interface MobilityRequest {
  from: MobilityEndpoint;
  to: MobilityEndpoint;
  preference: Preference;
  scenario: Scenario;
  offline: boolean;
  transport?: 'all' | 'metro';
}

export interface MobilityTripEndpoints {
  from: MobilityEndpoint;
  to: MobilityEndpoint;
  preference: Preference;
}

/** Only written after the user explicitly chooses to save on this device. */
export interface SavedMobilityTrip extends MobilityTripEndpoints {
  version: 1;
  id: string;
  label: string;
  savedAt: string;
  generatedAt: string;
  journeys: MobilityJourney[];
  network: MobilityNetwork;
}

export interface LegacyMobilityTrip {
  from: string;
  to: string;
  label: string;
}
