/** Explicit, bounded place lookup for the ZMM trip planner. No reverse geocoding. */
export const ZMM_BOUNDS = [-100.9, 25.35, -99.8, 26.1];
export const PLACE_ATTRIBUTION = Object.freeze({ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' });
export const DEFAULT_PLACE_PROVIDER = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'RegioMovil/1.0 (ZMM transit experiment; https://github.com/GioMax102/RegioMovil)';
const CACHE_TTL = 3_600_000;
const MAX_UPSTREAM_BYTES = 128 * 1024;

export class PlaceSearchError extends Error {
  constructor(status, code, message, retryAfter) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}

// One process-wide quota/cache, shared even by multiple createApp() instances.
// Production replicas must use a shared upstream proxy, not independent quotas.
export const createPlaceSearchState = () => ({ cache: new Map(), lastStarted: -Infinity, inFlight: false, blockedUntil: -Infinity });
const sharedState = createPlaceSearchState();

function queryText(input) {
  if (typeof input !== 'string') throw new PlaceSearchError(400, 'INVALID_PLACE_QUERY', 'Escribe el nombre de un lugar de 3 a 120 caracteres.');
  const query = input.trim().normalize('NFC').replace(/ +/g, ' ');
  if ([...query].length < 3 || [...query].length > 120 || /[\u0000-\u001f\u007f]/.test(query)) throw new PlaceSearchError(400, 'INVALID_PLACE_QUERY', 'Escribe el nombre de un lugar de 3 a 120 caracteres, sin controles.');
  if (/[-+]?\d{1,3}\.\d+[,;\s]+[-+]?\d{1,3}\.\d+/.test(query) || /\S+@\S+/.test(query)) throw new PlaceSearchError(400, 'PRIVATE_PLACE_QUERY', 'Busca un lugar público por su nombre. La ubicación del dispositivo se procesa sin enviarla al buscador.');
  return query;
}

function providerAddress(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('PLACES_PROVIDER_URL must be an HTTPS search URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new TypeError('PLACES_PROVIDER_URL must be an HTTPS search URL without credentials, query or fragment.');
  return url;
}

async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_UPSTREAM_BYTES) throw new PlaceSearchError(502, 'PLACES_INVALID_RESPONSE', 'El buscador devolvió una respuesta demasiado grande. Intenta con otro nombre.');
  if (!response.body?.getReader) throw new PlaceSearchError(502, 'PLACES_INVALID_RESPONSE', 'El buscador no devolvió una respuesta válida.');
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_UPSTREAM_BYTES) throw new PlaceSearchError(502, 'PLACES_INVALID_RESPONSE', 'El buscador devolvió una respuesta demasiado grande. Intenta con otro nombre.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PlaceSearchError(502, 'PLACES_INVALID_RESPONSE', 'El buscador no devolvió lugares válidos. Intenta de nuevo.'); }
}

function placesFrom(payload) {
  if (!Array.isArray(payload)) throw new PlaceSearchError(502, 'PLACES_INVALID_RESPONSE', 'El buscador no devolvió una lista de lugares. Intenta de nuevo.');
  const places = [];
  const seen = new Set();
  for (const row of payload.slice(0, 20)) {
    if (!row || typeof row !== 'object' || typeof row.display_name !== 'string' || /[\u0000-\u001f\u007f]/.test(row.display_name)) continue;
    const lat = typeof row.lat === 'string' || typeof row.lat === 'number' ? Number(row.lat) : NaN;
    const lng = typeof row.lon === 'string' || typeof row.lon === 'number' ? Number(row.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < ZMM_BOUNDS[0] || lat < ZMM_BOUNDS[1] || lng > ZMM_BOUNDS[2] || lat > ZMM_BOUNDS[3]) continue;
    if (row.address?.country_code && row.address.country_code !== 'mx') continue;
    const rawId = ['node', 'way', 'relation'].includes(row.osm_type) && /^\d{1,20}$/.test(String(row.osm_id)) ? `${row.osm_type[0]}${row.osm_id}` : /^\d{1,20}$/.test(String(row.place_id)) ? `p${row.place_id}` : null;
    if (!rawId || seen.has(rawId)) continue;
    const displayName = row.display_name.trim().slice(0, 500);
    const name = (typeof row.name === 'string' && !/[\u0000-\u001f\u007f]/.test(row.name) ? row.name.trim() : '') || displayName.split(',')[0].trim();
    if (!name) continue;
    seen.add(rawId);
    places.push({ id: `osm:${rawId}`, name: name.slice(0, 180), displayName, lat, lng, kind: 'place' });
    if (places.length === 6) break;
  }
  return places;
}

export function createPlaceSearch({ providerUrl = DEFAULT_PLACE_PROVIDER, userAgent = DEFAULT_USER_AGENT, transport = globalThis.fetch, now = Date.now, state = sharedState } = {}) {
  const provider = providerAddress(providerUrl);
  if (typeof transport !== 'function' || typeof userAgent !== 'string' || userAgent.length < 12 || userAgent.length > 300 || /[\r\n]/.test(userAgent)) throw new TypeError('A named provider transport and identifying User-Agent are required.');
  return async input => {
    const query = queryText(input);
    const time = now();
    const key = `${provider.href}|${query.toLocaleLowerCase('es-MX')}`;
    for (const [entry, cached] of state.cache) if (time - cached.createdAt >= CACHE_TTL) state.cache.delete(entry);
    const hit = state.cache.get(key);
    if (hit) { state.cache.delete(key); state.cache.set(key, hit); return { ...structuredClone(hit.result), cached: true }; }
    // Refuse immediately: there is no request queue that can grow with traffic.
    if (state.inFlight || time - state.lastStarted < 1000 || time < state.blockedUntil) throw new PlaceSearchError(429, 'PLACES_BUSY', 'El buscador está atendiendo otra consulta. Espera un momento y vuelve a buscar.', Math.max(1, Math.ceil((state.blockedUntil - time) / 1000)));
    state.inFlight = true;
    state.lastStarted = time;
    const url = new URL(provider);
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '6', countrycodes: 'mx', viewbox: `${ZMM_BOUNDS[0]},${ZMM_BOUNDS[3]},${ZMM_BOUNDS[2]},${ZMM_BOUNDS[1]}`, bounded: '1', addressdetails: '1', 'accept-language': 'es' }).toString();
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new PlaceSearchError(504, 'PLACES_TIMEOUT', 'El buscador tardó demasiado. Intenta de nuevo o elige una parada oficial.')); }, 6000); });
    try {
      const work = (async () => {
        const response = await transport(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': userAgent }, signal: controller.signal, redirect: 'error' });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if (response.status === 429) state.blockedUntil = now() + 60_000;
          throw new PlaceSearchError(response.status === 429 ? 429 : 502, 'PLACES_UNAVAILABLE', 'El buscador no está disponible. Intenta después o elige una parada oficial.', response.status === 429 ? 60 : undefined);
        }
        return placesFrom(await boundedJson(response));
      })();
      const places = await Promise.race([work, deadline]);
      const result = { places, provider: 'Nominatim / OpenStreetMap', attribution: PLACE_ATTRIBUTION };
      state.cache.set(key, { createdAt: now(), result: structuredClone(result) });
      while (state.cache.size > 200) state.cache.delete(state.cache.keys().next().value);
      return { ...result, cached: false };
    } catch (error) {
      if (error instanceof PlaceSearchError) throw error;
      throw new PlaceSearchError(502, 'PLACES_UNAVAILABLE', 'No pudimos conectar con el buscador. Intenta de nuevo o elige una parada oficial.');
    } finally { clearTimeout(timeout); state.inFlight = false; }
  };
}
