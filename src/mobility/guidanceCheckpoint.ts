import type { MobilityJourney, MobilityNetwork } from './types';

export const guidanceCheckpointKey = 'regiomovil:guidance-report-return';
export const guidanceCheckpointTtl = 24 * 60 * 60 * 1000;
const maximumBytes = 1_000_000;
export interface GuidanceCheckpoint {
  version: 1;
  savedAt: number;
  stepIndex: number;
  journey: MobilityJourney;
  network: MobilityNetwork;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';
const text = (value: unknown): value is string => typeof value === 'string' && value.length < 2000;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
function validCheckpoint(value: unknown, now: number): value is GuidanceCheckpoint {
  if (
    !object(value) ||
    value.version !== 1 ||
    !finite(value.savedAt) ||
    now - value.savedAt > guidanceCheckpointTtl ||
    value.savedAt > now + 300_000 ||
    !Number.isInteger(value.stepIndex) ||
    !object(value.journey) ||
    !object(value.network)
  )
    return false;
  const { journey, network } = value;
  return (
    text(journey.id) &&
    text(journey.title) &&
    finite(journey.durationMinutes) &&
    finite(journey.walkingMinutes) &&
    finite(journey.walkingMeters) &&
    finite(journey.transfers) &&
    finite(journey.occupancy) &&
    finite(journey.score) &&
    Array.isArray(journey.etaRange) &&
    journey.etaRange.length === 2 &&
    journey.etaRange.every(finite) &&
    Array.isArray(journey.stationIds) &&
    journey.stationIds.every(text) &&
    Array.isArray(journey.steps) &&
    journey.steps.length > 0 &&
    journey.steps.length <= 100 &&
    (value.stepIndex as number) >= 0 &&
    (value.stepIndex as number) < journey.steps.length &&
    journey.steps.every(
      (step) =>
        object(step) &&
        ['metro', 'bus', 'walk'].includes(String(step.mode)) &&
        [step.lineId, step.lineName, step.fromId, step.toId, step.from, step.to].every(text) &&
        [step.minutes, step.distanceMeters, step.stationCount].every(finite) &&
        (step.stopIds === undefined || (Array.isArray(step.stopIds) && step.stopIds.every(text))) &&
        Array.isArray(step.geometry) &&
        step.geometry.every(
          (point) => Array.isArray(point) && point.length === 2 && point.every(finite),
        ),
    ) &&
    finite(network.version) &&
    network.mode === 'experimental' &&
    object(network.coverage) &&
    Array.isArray(network.assumptions) &&
    network.assumptions.every(text) &&
    Array.isArray(network.stops) &&
    network.stops.every(
      (stop) =>
        object(stop) &&
        text(stop.id) &&
        text(stop.name) &&
        finite(stop.lng) &&
        finite(stop.lat) &&
        ['metro', 'bus'].includes(String(stop.mode)) &&
        Array.isArray(stop.routeIds) &&
        stop.routeIds.every(text) &&
        Array.isArray(stop.sourceIds) &&
        stop.sourceIds.every(text),
    ) &&
    Array.isArray(network.routes) &&
    network.routes.every(
      (route) =>
        object(route) &&
        [route.id, route.code, route.name, route.networkId, route.color].every(text) &&
        ['metro', 'bus'].includes(String(route.mode)) &&
        Array.isArray(route.sourceIds) &&
        route.sourceIds.every(text) &&
        Array.isArray(route.segments) &&
        route.segments.length === 0,
    ) &&
    (network.sources === undefined ||
      (Array.isArray(network.sources) &&
        network.sources.every(
          (source) =>
            object(source) &&
            [source.id, source.title, source.url].every(text) &&
            /^https?:\/\//.test(String(source.url)),
        )))
  );
}

/** One bounded return point for an explicitly opened observation; never stores GPS fixes. */
export function saveGuidanceCheckpoint(
  journey: MobilityJourney,
  network: MobilityNetwork,
  stepIndex: number,
  now = Date.now(),
): GuidanceCheckpoint {
  const routeIds = new Set(
    journey.steps.filter((step) => step.mode !== 'walk').map((step) => step.lineId),
  );
  const stopIds = new Set(
    journey.steps.flatMap((step) => [step.fromId, step.toId, ...(step.stopIds || [])]),
  );
  const stops = network.stops.filter((stop) => stopIds.has(stop.id));
  const routes = network.routes
    .filter((route) => routeIds.has(route.id))
    .map((route) => ({ ...route, segments: [] }));
  const sourceIds = new Set([...stops, ...routes].flatMap((item) => item.sourceIds));
  const checkpoint: GuidanceCheckpoint = {
    version: 1,
    savedAt: now,
    stepIndex,
    journey,
    network: {
      version: network.version,
      mode: network.mode,
      stops,
      routes,
      coverage: { snapshot: true },
      assumptions: network.assumptions,
      ...(network.sources
        ? { sources: network.sources.filter((source) => sourceIds.has(source.id)) }
        : {}),
    },
  };
  const encoded = JSON.stringify(checkpoint);
  if (!validCheckpoint(checkpoint, now))
    throw new Error('No pudimos guardar el regreso a esta guía.');
  if (new TextEncoder().encode(encoded).length > maximumBytes)
    throw new Error('Esta guía supera el espacio del regreso guardado.');
  try {
    localStorage.setItem(guidanceCheckpointKey, encoded);
  } catch {
    throw new Error('No hay espacio para guardar el regreso a la guía.');
  }
  return checkpoint;
}

export function readGuidanceCheckpoint(
  journeyId: string,
  now = Date.now(),
): GuidanceCheckpoint | null {
  try {
    const encoded = localStorage.getItem(guidanceCheckpointKey);
    if (!encoded) return null;
    const value: unknown = JSON.parse(encoded);
    if (new TextEncoder().encode(encoded).length > maximumBytes || !validCheckpoint(value, now)) {
      localStorage.removeItem(guidanceCheckpointKey);
      return null;
    }
    return value.journey.id === journeyId ? value : null;
  } catch {
    return null;
  }
}
export function clearGuidanceCheckpoint(journeyId: string) {
  try {
    const value = JSON.parse(localStorage.getItem(guidanceCheckpointKey) || 'null');
    if (value?.journey?.id === journeyId) localStorage.removeItem(guidanceCheckpointKey);
  } catch {
    /* Closing a guide must still work when storage is unavailable. */
  }
}
