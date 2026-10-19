import type { MobilityNetwork, MobilityStop, Place } from './types';

export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Preserve provider ranking while removing duplicate representations of one place.
 * Different branches, entrances and opposing bus stops must remain selectable.
 */
export function distinctPlaceSuggestions(places: Place[]) {
  const seenIds = new Set<string>();
  const unique: Place[] = [];
  for (const place of places) {
    if (seenIds.has(place.id)) continue;
    seenIds.add(place.id);
    const name = normalizeSearch(place.name);
    const duplicate = unique.some((other) => {
      if (normalizeSearch(other.name) !== name || other.resultType !== place.resultType)
        return false;
      const meters = Math.hypot(
        (other.lat - place.lat) * 111320,
        (other.lng - place.lng) * 111320 * Math.cos((place.lat * Math.PI) / 180),
      );
      return meters < 35;
    });
    if (!duplicate) unique.push(place);
  }
  return unique;
}

/** The result title already names the place; its subtitle should locate it. */
export function placeAddress(place: Place) {
  const address = place.address || place.displayName;
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && normalizeSearch(parts[0]) === normalizeSearch(place.name))
    return parts.slice(1).join(', ');
  return address;
}
const ignored = new Set(['estacion', 'parada', 'metro', 'de', 'del', 'el', 'la']);
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 3) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
export function indexMobilityStops(network: MobilityNetwork) {
  const routes = new Map(network.routes.map((route) => [route.id, route]));
  return network.stops.map((stop) => {
    const services = stop.routeIds.map((id) => routes.get(id)).filter(Boolean);
    const label = services
      .map((route) => (stop.mode === 'bus' ? `${route!.code} · ${route!.name}` : route!.code))
      .join(' · ');
    const text = normalizeSearch(
      [
        stop.name,
        ...(stop.aliases || []),
        ...services.map((route) => `${route!.code} ${route!.name}`),
      ].join(' '),
    );
    return { stop, label, text, words: text.split(' '), name: normalizeSearch(stop.name) };
  });
}
export function searchMobilityStops(
  index: ReturnType<typeof indexMobilityStops>,
  query: string,
  offline: boolean,
) {
  const text = normalizeSearch(query);
  const terms = text.split(' ').filter((term) => term && !ignored.has(term));
  return index
    .flatMap((row) => {
      if (offline && !row.stop.official) return [];
      let score = row.stop.mode === 'metro' ? 1 : 0;
      for (const term of terms) {
        if (row.words.includes(term)) score += 6;
        else if (row.words.some((word) => word.startsWith(term))) score += 3;
        else if (row.words.some((word) => oneEdit(term, word))) score += 1;
        else return [];
      }
      if (text && row.name === text) score += 30;
      else if (text && row.name.includes(text)) score += 15;
      return [{ ...row, score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.stop.name.localeCompare(b.stop.name, 'es') ||
        a.stop.id.localeCompare(b.stop.id),
    );
}
export function stopEndpoint(stop: MobilityStop) {
  return { id: stop.id, name: stop.name };
}
