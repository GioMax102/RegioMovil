import type {
  LegacyMobilityTrip,
  MobilityEndpoint,
  MobilityJourney,
  MobilityNetwork,
  MobilityPlan,
  SavedMobilityTrip,
} from './types';

export const savedMobilityKey = 'regiomovil:mobility-offline-trips';
export const legacyMobilityKey = 'regiomovil:mobility-journeys';
export const savedMobilityEvent = 'regiomovil:mobility-saved';
const maximumTrips = 8;
const maximumBytes = 4_000_000;
const preferences = ['fastest', 'comfortable', 'accessible'];
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
function validEndpoint(value: unknown): value is MobilityEndpoint {
  return (
    isObject(value) &&
    ((typeof value.id === 'string' &&
      !('lat' in value) &&
      (value.name === undefined || typeof value.name === 'string')) ||
      (finite(value.lat) &&
        Math.abs(value.lat) <= 90 &&
        finite(value.lng) &&
        Math.abs(value.lng) <= 180 &&
        typeof value.name === 'string' &&
        ['place', 'location'].includes(String(value.kind))))
  );
}
function validJourney(value: unknown): value is MobilityJourney {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    finite(value.durationMinutes) &&
    finite(value.walkingMeters) &&
    finite(value.walkingMinutes) &&
    finite(value.transfers) &&
    finite(value.occupancy) &&
    Array.isArray(value.etaRange) &&
    value.etaRange.length === 2 &&
    value.etaRange.every(finite) &&
    Array.isArray(value.steps) &&
    value.steps.length > 0 &&
    value.steps.every(
      (step) =>
        isObject(step) &&
        ['metro', 'bus', 'walk'].includes(String(step.mode)) &&
        typeof step.lineId === 'string' &&
        typeof step.lineName === 'string' &&
        typeof step.from === 'string' &&
        typeof step.to === 'string' &&
        typeof step.fromId === 'string' &&
        typeof step.toId === 'string' &&
        finite(step.minutes) &&
        finite(step.stationCount) &&
        (step.stopIds === undefined ||
          (Array.isArray(step.stopIds) && step.stopIds.every((id) => typeof id === 'string'))) &&
        finite(step.distanceMeters) &&
        Array.isArray(step.geometry) &&
        step.geometry.every(
          (point) => Array.isArray(point) && point.length === 2 && point.every(finite),
        ),
    )
  );
}
function readList(key: string): unknown[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
export function readSavedMobilityTrips(): SavedMobilityTrip[] {
  return readList(savedMobilityKey).filter(
    (value): value is SavedMobilityTrip =>
      isObject(value) &&
      value.version === 1 &&
      typeof value.id === 'string' &&
      typeof value.label === 'string' &&
      typeof value.savedAt === 'string' &&
      typeof value.generatedAt === 'string' &&
      validEndpoint(value.from) &&
      validEndpoint(value.to) &&
      preferences.includes(String(value.preference)) &&
      Array.isArray(value.journeys) &&
      value.journeys.length > 0 &&
      value.journeys.length <= 8 &&
      value.journeys.every(validJourney) &&
      isObject(value.network) &&
      Array.isArray(value.network.stops) &&
      value.network.stops.every(
        (stop) =>
          isObject(stop) &&
          typeof stop.id === 'string' &&
          typeof stop.name === 'string' &&
          finite(stop.lat) &&
          finite(stop.lng),
      ) &&
      (value.network.sources === undefined ||
        (Array.isArray(value.network.sources) &&
          value.network.sources.every(
            (source) =>
              isObject(source) &&
              typeof source.id === 'string' &&
              typeof source.title === 'string' &&
              typeof source.url === 'string' &&
              /^https?:\/\//.test(source.url),
          ))) &&
      Array.isArray(value.network.routes) &&
      value.network.routes.every(
        (route) =>
          isObject(route) &&
          typeof route.id === 'string' &&
          typeof route.color === 'string' &&
          Array.isArray(route.sourceIds),
      ),
  );
}
export function readLegacyMobilityTrips(): LegacyMobilityTrip[] {
  return readList(legacyMobilityKey).filter(
    (value): value is LegacyMobilityTrip =>
      isObject(value) &&
      typeof value.from === 'string' &&
      typeof value.to === 'string' &&
      typeof value.label === 'string',
  );
}
function writeList(key: string, value: unknown[]) {
  const encoded = JSON.stringify(value);
  if (key === savedMobilityKey && new TextEncoder().encode(encoded).length > maximumBytes)
    throw new Error('Las rutas ocupan demasiado espacio. Elimina un paquete e intenta de nuevo.');
  try {
    localStorage.setItem(key, encoded);
  } catch {
    throw new Error('No hay espacio para guardar. Elimina una ruta o libera almacenamiento.');
  }
  window.dispatchEvent(new Event(savedMobilityEvent));
}
const pointKey = (point: MobilityEndpoint) =>
  'lat' in point ? `${point.lat.toFixed(6)},${point.lng.toFixed(6)}` : point.id;
const tripKey = (trip: Pick<SavedMobilityTrip, 'from' | 'to' | 'preference'>) =>
  `${pointKey(trip.from)}|${pointKey(trip.to)}|${trip.preference}`;

/** The plan is already ordered by its chosen priority. No new routes are invented. */
export function snapshotMobilityPlan(
  plan: MobilityPlan,
  network: MobilityNetwork,
  label: string,
  now = new Date(),
): SavedMobilityTrip {
  const unique = new Set<string>();
  const journeys = plan.journeys
    .filter((journey) => {
      const identity = JSON.stringify(
        journey.steps.map((step) => [
          step.mode,
          step.lineId,
          step.fromId,
          step.toId,
          step.geometry,
        ]),
      );
      if (unique.has(identity)) return false;
      unique.add(identity);
      return true;
    })
    .slice(0, 8);
  if (!journeys.length) throw new Error('Calcula una ruta antes de guardarla.');
  const routeIds = new Set(journeys.flatMap((journey) => journey.steps.map((step) => step.lineId)));
  const stopIds = new Set(
    journeys.flatMap((journey) => [
      ...(journey.stationIds ?? []),
      ...journey.steps.flatMap((step) => step.stopIds ?? [step.fromId, step.toId]),
    ]),
  );
  const namedEndpoint = (point: MobilityEndpoint): MobilityEndpoint => {
    // The engine resolves official IDs into full stop records at runtime.
    // Keep those as IDs; only explicitly chosen places/GPS retain coordinates.
    if ('lat' in point && (point.kind === 'place' || point.kind === 'location'))
      return { lat: point.lat, lng: point.lng, kind: point.kind, name: point.name };
    if ('id' in point)
      return {
        id: point.id,
        name:
          point.name ||
          network.stops.find((stop) => stop.id === point.id || stop.stationId === point.id)?.name ||
          point.id,
      };
    throw new Error('No pudimos guardar los puntos de este viaje.');
  };
  return structuredClone({
    version: 1,
    id: `trip-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim().slice(0, 48) || 'Mi viaje',
    savedAt: now.toISOString(),
    generatedAt: plan.generatedAt,
    from: namedEndpoint(plan.from),
    to: namedEndpoint(plan.to),
    preference: plan.preference,
    journeys,
    network: {
      ...network,
      stops: network.stops.filter((stop) => stopIds.has(stop.id)),
      // Journey steps already contain their complete selected geometry.
      routes: network.routes
        .filter((route) => routeIds.has(route.id))
        .map((route) => ({ ...route, segments: [] })),
    },
  });
}
export function saveMobilityTrip(trip: SavedMobilityTrip) {
  const current = readSavedMobilityTrips();
  const existing = current.find((value) => tripKey(value) === tripKey(trip));
  if (!existing && current.length >= maximumTrips)
    throw new Error('Puedes guardar hasta 8 viajes. Elimina uno para guardar este.');
  const saved = { ...trip, id: existing?.id ?? trip.id };
  writeList(savedMobilityKey, [
    saved,
    ...current.filter((value) => tripKey(value) !== tripKey(trip)),
  ]);
  return saved;
}
export function deleteMobilityTrip(id: string) {
  writeList(
    savedMobilityKey,
    readSavedMobilityTrips().filter((trip) => trip.id !== id),
  );
}
export function deleteMobilityAlternative(tripId: string, journeyId: string) {
  const next = readSavedMobilityTrips()
    .map((trip) =>
      trip.id === tripId
        ? { ...trip, journeys: trip.journeys.filter((journey) => journey.id !== journeyId) }
        : trip,
    )
    .filter((trip) => trip.journeys.length > 0);
  writeList(savedMobilityKey, next);
}
export function deleteLegacyMobilityTrip(from: string, to: string) {
  writeList(
    legacyMobilityKey,
    readLegacyMobilityTrips().filter((trip) => trip.from !== from || trip.to !== to),
  );
}
