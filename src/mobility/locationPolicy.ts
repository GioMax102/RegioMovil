/** Product thresholds only: no platform bridge, requests, storage or eager data imports. */
export const LOCATION_POLICY = {
  radius: 3000,
  limit: 8,
  automaticAccuracy: 200,
  maxAccuracy: 1500,
  maxAgeMs: 60_000,
} as const;
