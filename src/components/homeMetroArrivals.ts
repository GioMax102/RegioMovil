import type { Arrival } from '../types';

/** Compare the next departure of each direction, rather than two departures of one. */
export function homeMetroArrivals(arrivals: readonly Arrival[], lineId: string): Arrival[] {
  const directions = new Map<string, Arrival>();
  for (const arrival of arrivals) {
    if (arrival.lineId !== lineId) continue;
    const previous = directions.get(arrival.direction);
    if (
      !previous ||
      arrival.etaMinutes < previous.etaMinutes ||
      (arrival.etaMinutes === previous.etaMinutes && arrival.id < previous.id)
    )
      directions.set(arrival.direction, arrival);
  }
  return [...directions.values()].sort(
    (a, b) => a.etaMinutes - b.etaMinutes || a.id.localeCompare(b.id),
  );
}
