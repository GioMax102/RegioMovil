import type { FavoriteStation } from '../components/stationFavorites';
import type { MobilityNetwork, MobilityStep } from './types';

/** Resolve IDs only: nearby or identically named stops may be different platforms. */
export function resolveTransferStation(
  network: MobilityNetwork,
  stopId: string,
): FavoriteStation | null {
  const stop = network.stops.find((candidate) => candidate.id === stopId);
  if (!stop) return null;
  const kind = stop.mode === 'metro' || stop.id.startsWith('metro:') ? 'metro' : 'bus';
  return {
    id: kind === 'metro' ? (stop.stationId ?? stop.id.replace(/^metro:/, '')) : stop.id,
    stopId: stop.id,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    kind,
  };
}

export function journeyTransfers(steps: readonly MobilityStep[]) {
  const rides = steps.flatMap((step, index) => (step.mode === 'walk' ? [] : [{ step, index }]));
  return rides.slice(1).flatMap((next, rideIndex) => {
    const previous = rides[rideIndex];
    if (previous.step.lineId === next.step.lineId && previous.index + 1 === next.index) return [];
    return [
      {
        afterStepIndex: previous.index,
        beforeStepIndex: next.index,
        fromId: previous.step.toId,
        toId: next.step.fromId,
        from: previous.step.to,
        to: next.step.from,
      },
    ];
  });
}

export type JourneyTransfer = ReturnType<typeof journeyTransfers>[number];
