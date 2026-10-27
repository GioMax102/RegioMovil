import { useEffect, useMemo, useState } from 'react';
import LocationMap from './LocationMap';
import { isRegionalCoordinate } from './mapGeography';
import type { MobilityJourney, MobilityNetwork } from './types';

/** Saved and standalone journey details share the planner's map and regional limits. */
export default function MobilityMap({
  journey,
  network,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
}) {
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine !== false,
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const endpoints = useMemo(() => {
    const positions = journey.steps
      .flatMap((step) => (Array.isArray(step.geometry) ? step.geometry : []))
      .filter(isRegionalCoordinate)
      .map(([lng, lat]) => ({ lng, lat }));
    return { origin: positions[0], destination: positions.at(-1) };
  }, [journey]);
  return (
    <LocationMap
      network={network}
      journey={journey}
      online={online}
      origin={endpoints.origin}
      destination={endpoints.destination}
      field={null}
      compact
    />
  );
}
