import type { PositionFix } from './location';
import type { Coordinates, MobilityJourney, MobilityNetwork, MobilityStep } from './types';
import { isRegionalCoordinate } from './mapGeography';
import { isCompactTransfer } from './journeyPresentation';

const METERS_PER_DEGREE = 111195;
export const MAX_FIX_AGE_MS = 20000;
const MAX_ACCURACY_METERS = 80;

interface Projection {
  along: number;
  distance: number;
}
export interface GuidanceStop {
  id: string;
  name: string;
  along: number;
}
interface GuidanceLeg {
  step: MobilityStep;
  points: Coordinates[];
  cumulative: number[];
  length: number;
  stops: GuidanceStop[];
  stopsComplete: boolean;
  compactTransfer: boolean;
}
export interface GuidanceRoute {
  legs: GuidanceLeg[];
  totalMeters: number;
}
export type GuidanceQuality =
  'waiting' | 'good' | 'imprecise' | 'stale' | 'off-route' | 'unconfirmed';
export interface GuidanceState {
  stepIndex: number;
  along: number;
  completed: boolean;
  atStepEnd: boolean;
  quality: GuidanceQuality;
  /** Latest observation; never persisted or sent to a server. */
  position: PositionFix | null;
  /** Last geometrically plausible fix, for sequential movement checks. */
  acceptedFix: PositionFix | null;
  endEvidenceAt: number | null;
  offRouteEvidenceAt: number | null;
}
export interface GuidanceInstruction {
  kind: 'waiting' | 'location' | 'travel' | 'alight' | 'transfer' | 'step-end' | 'arrived';
  title: string;
  detail: string;
  announcement: string;
  remainingMeters: number;
  progress: number;
  nextStop: GuidanceStop | null;
  nextStopVerified: boolean;
  remainingStops: number | null;
  manualLabel: string;
}

function meters(a: Coordinates, b: Coordinates) {
  const longitude = Math.cos(((a[1] + b[1]) * Math.PI) / 360);
  return Math.hypot((a[0] - b[0]) * longitude, a[1] - b[1]) * METERS_PER_DEGREE;
}
/** Select only candidates in the current leg and a plausible sequential progress window. */
function project(
  point: Coordinates,
  points: Coordinates[],
  cumulative: number[],
  minimum = 0,
  maximum = Infinity,
): Projection | null {
  let nearest: Projection | null = null;
  for (let index = 1; index < points.length; index++) {
    const start = cumulative[index - 1];
    const length = cumulative[index] - start;
    if (start > maximum || start + length < minimum || length <= 0) continue;
    const a = points[index - 1],
      b = points[index];
    const longitude = Math.cos((point[1] * Math.PI) / 180);
    const dx = (b[0] - a[0]) * longitude,
      dy = b[1] - a[1];
    const px = (point[0] - a[0]) * longitude,
      py = point[1] - a[1];
    const low = Math.max(0, (minimum - start) / length);
    const high = Math.min(1, (maximum - start) / length);
    const ratio = Math.max(low, Math.min(high, (px * dx + py * dy) / (dx * dx + dy * dy)));
    const candidate = {
      along: start + length * ratio,
      distance: Math.hypot(px - dx * ratio, py - dy * ratio) * METERS_PER_DEGREE,
    };
    if (!nearest || candidate.distance < nearest.distance) nearest = candidate;
  }
  return nearest;
}

export function createGuidanceRoute(
  journey: MobilityJourney,
  network: MobilityNetwork,
): GuidanceRoute {
  const stopById = new Map(network.stops.map((stop) => [stop.id, stop]));
  const legs = journey.steps.map((step, index): GuidanceLeg => {
    // Never bridge a missing/invalid geometry: require manual progress for that leg.
    const raw = Array.isArray(step.geometry) ? step.geometry : [];
    const points = raw.length > 1 && raw.every(isRegionalCoordinate) ? raw : [];
    const cumulative = [0];
    for (let p = 1; p < points.length; p++)
      cumulative.push(cumulative[p - 1] + meters(points[p - 1], points[p]));
    const length = cumulative.at(-1) || 0;
    const explicit = step.stopIds;
    const ids = Array.isArray(explicit)
      ? explicit
      : Array.isArray(journey.stationIds)
        ? journey.stationIds
        : [step.fromId, step.toId];
    const stops =
      step.mode === 'walk' || !length
        ? []
        : [...new Set(ids)]
            .flatMap((id) => {
              const stop = stopById.get(id);
              if (
                !stop ||
                !isRegionalCoordinate([stop.lng, stop.lat]) ||
                !stop.routeIds.includes(step.lineId)
              )
                return [];
              const projection = project([stop.lng, stop.lat], points, cumulative);
              return projection && projection.distance <= 65
                ? [{ id: stop.id, name: stop.name, along: projection.along }]
                : [];
            })
            .sort((a, b) => a.along - b.along);
    const stopsComplete = !!(
      Array.isArray(explicit) &&
      explicit.length >= 2 &&
      explicit[0] === step.fromId &&
      explicit.at(-1) === step.toId &&
      stops.length === new Set(explicit).size
    );
    return {
      step,
      points,
      cumulative,
      length,
      stops,
      stopsComplete,
      compactTransfer: isCompactTransfer(journey.steps, index),
    };
  });
  return { legs, totalMeters: legs.reduce((sum, leg) => sum + leg.length, 0) };
}

export function initialGuidanceState(): GuidanceState {
  return {
    stepIndex: 0,
    along: 0,
    completed: false,
    atStepEnd: false,
    quality: 'waiting',
    position: null,
    acceptedFix: null,
    endEvidenceAt: null,
    offRouteEvidenceAt: null,
  };
}

/** No future leg is ever selected by proximity, even at shared stops or overlapping routes. */
export function updateGuidance(
  route: GuidanceRoute,
  state: GuidanceState,
  fix: PositionFix,
  now = Date.now(),
): GuidanceState {
  const leg = route.legs[state.stepIndex];
  if (state.completed || !leg) return state;
  if (
    !isRegionalCoordinate([fix.lng, fix.lat]) ||
    !Number.isFinite(fix.timestamp) ||
    fix.timestamp > now + 5000
  )
    return { ...state, quality: 'imprecise', endEvidenceAt: null };
  if (state.position && fix.timestamp <= state.position.timestamp) return state;
  const observation = { ...state, position: { ...fix } };
  if (now - fix.timestamp > MAX_FIX_AGE_MS)
    return { ...observation, quality: 'stale', endEvidenceAt: null };
  if (
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy < 0 ||
    fix.accuracy > MAX_ACCURACY_METERS ||
    (fix.speed != null && (!Number.isFinite(fix.speed) || fix.speed < 0 || fix.speed > 45))
  )
    return { ...observation, quality: 'imprecise', endEvidenceAt: null };
  if (leg.length <= 0) return { ...observation, quality: 'unconfirmed', endEvidenceAt: null };
  const elapsed = state.acceptedFix ? (fix.timestamp - state.acceptedFix.timestamp) / 1000 : 0;
  const maximumSpeed = leg.step.mode === 'walk' ? 3.5 : 45;
  if (
    state.acceptedFix &&
    elapsed > 0 &&
    meters([fix.lng, fix.lat], [state.acceptedFix.lng, state.acceptedFix.lat]) >
      maximumSpeed * elapsed + state.acceptedFix.accuracy + fix.accuracy + 25
  )
    return { ...observation, quality: 'imprecise', endEvidenceAt: null };
  // Long tunnel gaps do not allow teleporting through the route: use manual confirmation.
  const budget = state.acceptedFix
    ? Math.min(500, Math.max(50, maximumSpeed * Math.min(elapsed, 30) + fix.accuracy))
    : 250;
  const projection = project(
    [fix.lng, fix.lat],
    leg.points,
    leg.cumulative,
    Math.max(0, state.along - 45),
    Math.min(leg.length, state.along + budget),
  );
  if (!projection || projection.distance > Math.max(60, fix.accuracy * 1.5)) {
    const first = state.offRouteEvidenceAt ?? fix.timestamp;
    return {
      ...observation,
      quality: fix.timestamp - first >= 3000 ? 'off-route' : 'unconfirmed',
      offRouteEvidenceAt: first,
      endEvidenceAt: null,
    };
  }
  const along = Math.max(state.along, projection.along);
  const distanceToEnd = meters([fix.lng, fix.lat], leg.points.at(-1)!);
  const closeToEnd =
    leg.length - along <= (leg.step.mode === 'walk' ? 35 : 70) &&
    distanceToEnd <= Math.max(35, Math.min(70, fix.accuracy * 1.5));
  const endEvidenceAt = closeToEnd ? (state.endEvidenceAt ?? fix.timestamp) : null;
  const atStepEnd =
    state.atStepEnd || (endEvidenceAt !== null && fix.timestamp - endEvidenceAt >= 3000);
  const completed = atStepEnd && state.stepIndex === route.legs.length - 1;
  return {
    ...observation,
    along,
    acceptedFix: { ...fix },
    quality: 'good',
    offRouteEvidenceAt: null,
    endEvidenceAt,
    atStepEnd,
    completed,
  };
}

export function expireGuidance(state: GuidanceState, now = Date.now()): GuidanceState {
  if (
    state.completed ||
    !state.position ||
    now - state.position.timestamp <= MAX_FIX_AGE_MS ||
    state.quality === 'stale'
  )
    return state;
  return { ...state, quality: 'stale', endEvidenceAt: null };
}

/** A deliberate confirmation is the only way to change transport legs. */
export function advanceGuidance(route: GuidanceRoute, state: GuidanceState): GuidanceState {
  if (state.completed) return state;
  if (state.stepIndex >= route.legs.length - 1)
    return { ...state, completed: true, atStepEnd: true };
  return { ...initialGuidanceState(), stepIndex: state.stepIndex + 1, position: state.position };
}

export function describeGuidance(route: GuidanceRoute, state: GuidanceState): GuidanceInstruction {
  const leg = route.legs[state.stepIndex];
  const remainingMeters =
    route.legs.slice(state.stepIndex).reduce((sum, item) => sum + item.length, 0) - state.along;
  const progress =
    route.totalMeters > 0 ? Math.max(0, Math.min(1, 1 - remainingMeters / route.totalMeters)) : 0;
  const nextStop = leg?.stops.find((stop) => stop.along > state.along + 35) ?? null;
  const remainingStops =
    leg?.step.mode === 'walk' || !leg?.stopsComplete
      ? null
      : leg.stops.filter((stop) => stop.along > state.along + 35).length;
  const manualLabel =
    leg?.step.mode === 'walk'
      ? `Ya llegué a ${leg.step.to}`
      : `Ya bajé en ${leg?.step.to || 'mi destino'}`;
  const result = (
    kind: GuidanceInstruction['kind'],
    title: string,
    detail: string,
  ): GuidanceInstruction => ({
    kind,
    title,
    detail,
    announcement: `${title}. ${detail}`,
    remainingMeters: Math.max(0, remainingMeters),
    progress: state.completed ? 1 : progress,
    nextStop,
    nextStopVerified: !!(leg?.stopsComplete && leg.step.stopOrderVerified),
    remainingStops,
    manualLabel,
  });
  if (state.completed || !leg)
    return result(
      'arrived',
      'Llegaste a tu destino',
      'El trayecto ha terminado. Puedes cerrar la guía.',
    );
  if (state.quality === 'imprecise')
    return result(
      'location',
      'Ubicación imprecisa',
      'Esperamos una señal más clara. El avance no cambia; puedes confirmar el paso manualmente.',
    );
  if (state.quality === 'stale')
    return result(
      'location',
      'Sin ubicación reciente',
      'En túneles la señal puede perderse. Confirma tu parada antes de avanzar manualmente.',
    );
  if (state.quality === 'off-route')
    return result(
      'location',
      'Tu ubicación no coincide con el trazo',
      'Revisa dónde estás y confirma la ruta. El mapa no verifica desvíos ni el servicio de hoy.',
    );
  if (state.quality === 'unconfirmed')
    return result(
      'location',
      'Confirma tu ubicación en el mapa',
      'No hay evidencia suficiente para avanzar automáticamente. Puedes confirmar el paso cuando llegues.',
    );
  const following = route.legs[state.stepIndex + 1];
  const nextRide = route.legs.slice(state.stepIndex + 1).find((item) => item.step.mode !== 'walk');
  if (state.atStepEnd && nextRide && leg.step.mode !== 'walk')
    return result(
      'transfer',
      'Haz transbordo',
      `Baja en ${leg.step.to}. Después, cambia a ${nextRide.step.lineName}; confirma cuando hayas bajado.`,
    );
  if (state.atStepEnd)
    return result(
      'step-end',
      `Llegaste a ${leg.step.to}`,
      following && following.step.mode !== 'walk'
        ? `Busca ${following.step.lineName} y confirma el sentido hacia ${following.step.to}.`
        : 'Confirma que terminaste este tramo para continuar.',
    );
  if (leg.compactTransfer && nextRide)
    return result(
      'transfer',
      `Haz transbordo a ${nextRide.step.lineName}`,
      `Ve de ${leg.step.from} a ${leg.step.to}. Confirma el sentido antes de abordar.`,
    );
  const nextIsAlightingStop =
    leg.step.mode === 'metro' &&
    leg.stopsComplete &&
    nextStop?.id === leg.step.toId &&
    remainingStops === 1;
  if (
    leg.step.mode !== 'walk' &&
    state.quality === 'good' &&
    leg.step.stopOrderVerified &&
    (nextIsAlightingStop || leg.length - state.along < 250)
  )
    return result(
      'alight',
      nextIsAlightingStop ? 'Baja en la siguiente estación' : 'Prepárate para bajar',
      `Tu bajada es ${leg.step.to}. Confirma al llegar; el GPS no verifica que hayas bajado.`,
    );
  if (state.quality === 'waiting')
    return result(
      'waiting',
      'Buscando tu ubicación',
      `Tu siguiente paso es ${leg.step.mode === 'walk' ? `caminar a ${leg.step.to}` : `${leg.step.lineName} hacia ${leg.step.to}`}. También puedes avanzar manualmente.`,
    );
  return result(
    'travel',
    leg.step.mode === 'walk'
      ? `Camina hacia ${leg.step.to}`
      : `${leg.step.lineName} hacia ${leg.step.to}`,
    leg.step.mode === 'walk'
      ? 'Sigue el trazo orientativo y los cruces peatonales disponibles.'
      : leg.step.stopOrderVerified
        ? `Revisa las señales y escucha los avisos de ${leg.step.to}.`
        : 'El orden y sentido de estas paradas no están verificados. Confírmalos con el operador.',
  );
}
