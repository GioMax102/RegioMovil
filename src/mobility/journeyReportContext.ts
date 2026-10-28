import type { MobilityJourney, MobilityNetwork } from './types';

/** Graph route IDs are catalog primary keys; Metro stops carry an explicit stationId. */
export function journeyReportContext(
  journey: MobilityJourney,
  network: MobilityNetwork,
  stepIndex: number,
) {
  const step = journey.steps[stepIndex];
  const stopIds = step ? [step.fromId, ...(step.stopIds || []), step.toId] : [];
  // A walking destination is a proposal, never proof that the person reached that place.
  const candidates = step?.mode === 'walk' ? [step.toId] : stopIds;
  const stationIds = [
    ...new Set(
      candidates.flatMap((id) => {
        const stop = network.stops.find((candidate) => candidate.id === id);
        return stop?.mode === 'metro' && stop.stationId ? [stop.stationId] : [];
      }),
    ),
  ];
  const service =
    step?.mode === 'walk'
      ? journey.steps[stepIndex + 1]?.fromId === step.toId
        ? journey.steps[stepIndex + 1]
        : undefined
      : step;
  const route =
    service && service.mode !== 'walk'
      ? network.routes.find((candidate) => candidate.id === service.lineId)
      : undefined;
  return {
    context: {
      journeyId: journey.id,
      stepIndex,
      source: 'journey' as const,
      returnTo: 'guidance' as const,
    },
    ...(stationIds.length ? { initialStationIds: stationIds } : {}),
    ...(route ? { initialRouteId: route.id } : {}),
    initialTargetType: (stationIds.length ? 'station' : 'route') as 'station' | 'route',
  };
}
