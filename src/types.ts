export type Page = 'home' | 'plan' | 'stations' | 'mobility';
export type Scenario = 'normal' | 'peak' | 'rain' | 'disruption';
export type Preference = 'fastest' | 'comfortable' | 'accessible';
export interface Station {
  id: string;
  name: string;
  municipality: string;
  lat: number;
  lng: number;
  lineIds: string[];
  accessibility: string;
  aliases?: string[];
}
export interface Line {
  id: string;
  name: string;
  color: string;
  stationIds: string[];
}
export interface Source {
  id: string;
  title: string;
  url: string;
  verifiedAt?: string;
  scope?: string;
}
export interface Network {
  stations: Station[];
  lines: Line[];
  sources: Source[];
  places: { id: string; name: string; stationId?: string }[];
}
export interface Arrival {
  id: string;
  lineId: string;
  lineName: string;
  direction: string;
  etaMinutes: number;
  etaRange: number[];
  occupancy: number;
  occupancyLabel: string;
  climate: string;
  accessible: string;
  condition: string;
  confidence: number;
  source: string;
}
export interface Board {
  stationId: string;
  generatedAt: string;
  mode: string;
  scenario: string;
  arrivals: Arrival[];
  forecast: { hour: string; occupancy: number }[];
  advice: { title: string; body: string };
  alerts: { id: string; title: string; body: string; severity: string }[];
}
export interface Journey {
  id: string;
  title: string;
  durationMinutes: number;
  walkingMinutes: number;
  transfers: number;
  occupancy: number;
  score: number;
  steps: {
    lineId: string;
    lineName: string;
    from: string;
    to: string;
    fromId?: string;
    toId?: string;
    stationCount: number;
    minutes: number;
    continuesOnTrain?: boolean;
  }[];
  accessibility: string;
  source: string;
  etaRange: number[];
}
export interface Plan {
  journeys: Journey[];
  mode: string;
  generatedAt: string;
}
