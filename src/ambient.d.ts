declare module '*.mjs' {
  export function buildBoard(...args: unknown[]): unknown;
  export function planJourney(...args: unknown[]): unknown;
  export function planMobility(...args: unknown[]): unknown;
  export function projectOnPolyline(
    location: { lat: number; lng: number },
    coordinates: [number, number][],
  ): { distanceMeters: number; position: number };
}
