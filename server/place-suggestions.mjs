/** Photon supports search-as-you-type; the public Nominatim endpoint does not. */
import { findPlaceReferences } from './place-references.mjs';
import { ZMM_BOUNDS, PLACE_ATTRIBUTION, DEFAULT_USER_AGENT, PlaceSearchError, queryText, providerAddress, boundedJson, cleanText } from './places.mjs';

export const DEFAULT_SUGGESTION_PROVIDER = 'https://photon.komoot.io/api/';
export const createPlaceSuggestionState = () => ({ cache: new Map(), lastStarted: -Infinity, inFlight: false, blockedUntil: -Infinity });
const sharedState = createPlaceSuggestionState();
const CACHE_TTL = 3_600_000;

function photonPlaces(payload) {
  if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) throw new PlaceSearchError(502, 'PLACES_INVALID_RESPONSE', 'No pudimos leer las sugerencias. Prueba otro nombre o elige una parada.');
  const places = [];
  const seen = new Set();
  const seenAddresses = new Set();
  for (const row of payload.features.slice(0, 20)) {
    const details = row?.properties;
    const point = row?.geometry?.coordinates;
    if (!details || typeof details !== 'object' || row.geometry?.type !== 'Point' || !Array.isArray(point) || point.length !== 2) continue;
    const [lng, lat] = point;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < ZMM_BOUNDS[0] || lng > ZMM_BOUNDS[2] || lat < ZMM_BOUNDS[1] || lat > ZMM_BOUNDS[3]) continue;
    if (typeof details.countrycode === 'string' && details.countrycode.toLowerCase() !== 'mx') continue;
    const type = typeof details.osm_type === 'string' ? details.osm_type.toLowerCase() : '';
    if (!['n', 'w', 'r'].includes(type) || !/^\d{1,20}$/.test(String(details.osm_id))) continue;
    const id = `osm:${type}${details.osm_id}`;
    if (seen.has(id)) continue;
    const street = cleanText(details.street);
    const house = cleanText(details.housenumber, 30);
    const streetAddress = [street, house].filter(Boolean).join(' ');
    const name = cleanText(details.name) || streetAddress;
    if (!name) continue;
    const address = [...new Set([streetAddress, cleanText(details.locality || details.district), cleanText(details.city || details.county), cleanText(details.state), cleanText(details.postcode, 20)].filter(Boolean))].join(', ');
    // Different OSM objects may describe the same venue with an identical label.
    // Keep distinct entrances/addresses, without making people compare duplicates.
    const addressKey = `${name}|${address}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
    if (seenAddresses.has(addressKey)) continue;
    const displayName = [...new Set([name, address, cleanText(details.country)].filter(Boolean))].join(', ').slice(0, 500);
    places.push({ id, name, address: address || displayName, displayName, lat, lng, kind: 'place', resultType: house ? 'address' : details.type === 'street' ? 'street' : 'place' });
    seen.add(id);
    seenAddresses.add(addressKey);
    if (places.length === 6) break;
  }
  return places;
}

export function createPlaceSuggestions({ providerUrl = DEFAULT_SUGGESTION_PROVIDER, userAgent = DEFAULT_USER_AGENT, transport = globalThis.fetch, now = Date.now, state = sharedState } = {}) {
  const provider = providerAddress(providerUrl);
  // Changing the URL must never accidentally turn public Nominatim into autocomplete.
  if (provider.hostname === 'nominatim.openstreetmap.org') throw new TypeError('Nominatim public does not permit autocomplete. Configure a Photon API endpoint.');
  if (typeof transport !== 'function' || typeof userAgent !== 'string' || userAgent.length < 12 || userAgent.length > 300 || /[\r\n]/.test(userAgent)) throw new TypeError('A Photon transport and identifying User-Agent are required.');
  return async input => {
    const query = queryText(input);
    const references = findPlaceReferences(query);
    if (references.length) return { places: references, provider: 'Referencias verificadas / OpenStreetMap', attribution: PLACE_ATTRIBUTION, cached: false };
    const time = now();
    const key = `${provider.href}|${query.toLocaleLowerCase('es-MX')}`;
    for (const [entry, cached] of state.cache) if (time - cached.createdAt >= CACHE_TTL) state.cache.delete(entry);
    const hit = state.cache.get(key);
    if (hit) { state.cache.delete(key); state.cache.set(key, hit); return { ...structuredClone(hit.result), cached: true }; }
    if (state.inFlight || time - state.lastStarted < 1000 || time < state.blockedUntil) throw new PlaceSearchError(429, 'PLACES_BUSY', 'Las sugerencias tardarán un momento. Puedes elegir una parada mientras tanto.', Math.max(1, Math.ceil((state.blockedUntil - time) / 1000)));
    state.inFlight = true;
    state.lastStarted = time;
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new PlaceSearchError(504, 'PLACES_TIMEOUT', 'No pudimos cargar las sugerencias a tiempo. Prueba otro nombre o una parada.')); }, 6000); });
    try {
      const url = new URL(provider);
      // Use local/default language: the public Photon demo does not support lang=es.
      // This static city box is identical for everybody. No GPS or client IP is proxied.
      url.search = new URLSearchParams({ q: query, limit: '6', bbox: ZMM_BOUNDS.join(','), countrycode: 'MX' }).toString();
      const work = (async () => {
        const response = await transport(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': userAgent }, signal: controller.signal, redirect: 'error' });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if (response.status === 429) state.blockedUntil = now() + 60_000;
          throw new PlaceSearchError(response.status === 429 ? 429 : 502, 'PLACES_UNAVAILABLE', 'Las sugerencias no están disponibles. Puedes elegir una parada o un lugar guardado.', response.status === 429 ? 60 : undefined);
        }
        return photonPlaces(await boundedJson(response));
      })();
      const places = await Promise.race([work, deadline]);
      const result = { places, provider: 'Photon / OpenStreetMap', attribution: PLACE_ATTRIBUTION };
      state.cache.set(key, { createdAt: now(), result: structuredClone(result) });
      while (state.cache.size > 200) state.cache.delete(state.cache.keys().next().value);
      return { ...result, cached: false };
    } catch (error) {
      if (error instanceof PlaceSearchError) throw error;
      throw new PlaceSearchError(502, 'PLACES_UNAVAILABLE', 'No pudimos conectar con las sugerencias. Puedes elegir una parada o un lugar guardado.');
    } finally { clearTimeout(timer); state.inFlight = false; }
  };
}
