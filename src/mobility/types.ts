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
  diagnostics: { expansions: number; truncated: boolean };
}
export interface Place extends Exclude<MobilityEndpoint, { id: string }> {
  id: string;
  kind: 'place';
  displayName: string;
}
export interface MobilityRequest {
  from: MobilityEndpoint;
  to: MobilityEndpoint;
  preference: Preference;
  scenario: Scenario;
  offline: boolean;
}
