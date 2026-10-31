import { createHash } from 'node:crypto';
import { stat, readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { gzip, brotliCompress, constants as zlibConstants } from 'node:zlib';
import { promisify } from 'node:util';
import { buildBoard, getModelCard, planJourney, resolveStation, SCENARIOS, PREFERENCES } from './domain.mjs';
import { createReportStore, REPORT_CATEGORIES, validReportDraftId } from './storage.mjs';
import { parseReportPhoto } from './report-photos.mjs';
import { findServices, mergeCatalogs } from './catalog.mjs';
import { createPlaceSearch, PlaceSearchError } from './places.mjs';
import { createPlaceSuggestions } from './place-suggestions.mjs';
import { planMobility } from './mobility.mjs';
import { createAdminRouter, ADMIN_CONTENT_SECURITY_POLICY } from './admin.mjs';

export const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost', 'https://localhost', 'capacitor://localhost'];
const MIME = { '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const TEXT_EXTENSIONS = new Set(['.html','.js','.mjs','.css','.json','.svg','.webmanifest']);
const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
// Keep this policy in sync with public/_headers (Cloudflare Pages).
// Inline styles are required by React's map positioning and the static help pages.
// Scripts, workers and fonts are bundled locally; only the published API and OSM
// map tiles may be requested remotely by the web application.
export const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org https://regiomovil-api.onrender.com; font-src 'self'; connect-src 'self' https://regiomovil-api.onrender.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function preferredEncoding(header = '') {
  const qualities = new Map(String(header).toLowerCase().split(',').map(part => {
    const [name,...parameters] = part.trim().split(';');
    const q = parameters.find(parameter => parameter.trim().startsWith('q='));
    const quality = q ? Number(q.trim().slice(2)) : 1;
    return [name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0];
  }));
  const quality = encoding => qualities.get(encoding) ?? qualities.get('*') ?? 0;
  const best = quality('br') >= quality('gzip') ? 'br' : 'gzip';
  return quality(best) > 0 && (qualities.get('identity') ?? 0) <= quality(best) ? best : null;
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function readJson(request, context = 'el reporte', maxBytes = 4096) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', `Envía ${context} como application/json.`);
  if (Number(request.headers['content-length']) > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'La solicitud supera el tamaño permitido.');
  let length = 0;
  const chunks = [];
  // Keep the response socket alive when rejecting a chunked body; drain its remainder.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > maxBytes) {
      request.resume();
      throw new HttpError(413, 'BODY_TOO_LARGE', 'La solicitud supera el tamaño permitido.');
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'INVALID_JSON', 'El JSON de la solicitud no es válido.'); }
}

export function createApp({ network, catalog = null, mobilityNetwork = null, placesOptions, placeSuggestionsOptions, databasePath = ':memory:', now = () => new Date(), allowedOrigins = DEFAULT_ORIGINS, distPath = null, reportLimit = 12, adminOptions = null } = {}) {
  if (!network?.stations?.length || !network?.lines?.length) throw new Error('A nonempty transit network is required.');
  if (allowedOrigins.includes('*')) throw new Error('CORS wildcard is not supported. Configure explicit origins.');
  const serviceCatalog = mergeCatalogs(catalog ? [catalog] : []);
  const searchPlaces = createPlaceSearch(placesOptions);
  const suggestPlaces = createPlaceSuggestions(placeSuggestionsOptions);
  const store = createReportStore(databasePath);
  const networkJson = JSON.stringify(network);
  const networkETag = `"${createHash('sha256').update(networkJson).digest('hex').slice(0, 20)}"`;
  const budgets = new Map();
  const compressedFiles = new Map();
  let compressedBytes = 0;

  async function compressedFile(file, metadata, encoding) {
    const key = `${file}:${metadata.mtimeMs}:${metadata.size}:${encoding}`;
    let content = compressedFiles.get(key);
    if (content) {compressedFiles.delete(key);compressedFiles.set(key,content);return content;}
    const input = await readFile(file);
    content = encoding === 'br' ? await brotliAsync(input,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}}) : await gzipAsync(input,{level:6});
    compressedBytes -= compressedFiles.get(key)?.length || 0;
    compressedFiles.set(key,content);
    compressedBytes += content.length;
    while (compressedFiles.size > 64 || compressedBytes > 8 * 1024 * 1024) {
      const oldest = compressedFiles.keys().next().value;
      compressedBytes -= compressedFiles.get(oldest).length;
      compressedFiles.delete(oldest);
    }
    return content;
  }

  function limit(request, kind, maximum, date) {
    const key = `${kind}:${request.socket.remoteAddress || 'local'}`;
    const time = date.getTime();
    let budget = budgets.get(key);
    if (!budget || time - budget.start >= 60_000) {
      budget = { start: time, count: 0 };
      budgets.set(key, budget);
    }
    if (++budget.count > maximum) throw new HttpError(429, 'RATE_LIMITED', 'Espera un minuto antes de volver a intentarlo.');
    if (budgets.size > 2000) {
      for (const [entry, value] of budgets) if (time - value.start >= 60_000) budgets.delete(entry);
      // Bounds memory even during a burst of distinct addresses.
      while (budgets.size > 4000) budgets.delete(budgets.keys().next().value);
    }
  }

  function send(response, status, value, headers = {}) {
    const payload = value === null ? '' : JSON.stringify(value);
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    response.end(payload);
  }

  const validStation = input => {
    const station = resolveStation(network, input);
    if (!station) throw new HttpError(404, 'STATION_NOT_FOUND', 'No encontramos esa estación en la red documentada.');
    return station;
  };
  const validRoute = input => {
    if (typeof input !== 'string' || !input || input.length > 160) throw new HttpError(400, 'INVALID_ROUTE', 'Elige un recorrido del catálogo.');
    const route = serviceCatalog.routes.find(item => item.id === input);
    if (!route) throw new HttpError(404, 'ROUTE_NOT_FOUND', 'No encontramos ese recorrido en el catálogo.');
    return route;
  };
  const admin = createAdminRouter({ options: adminOptions, store, network, catalog: serviceCatalog, readJson, send, HttpError, limit });

  async function staticFile(pathname, request, response) {
    if (!distPath) return false;
    const root = resolve(distPath);
    let decoded;
    let requested;
    try { decoded = decodeURIComponent(pathname); requested = resolve(root, `.${decoded === '/admin' ? '/admin.html' : decoded}`); }
    catch { throw new HttpError(400, 'INVALID_PATH', 'La dirección no es válida.'); }
    if (['/admin', '/admin.html'].includes(decoded)) {
      if (!adminOptions) throw new HttpError(404, 'NOT_FOUND', 'No encontramos ese recurso.');
      response.setHeader('Content-Security-Policy', ADMIN_CONTENT_SECURITY_POLICY);
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) throw new HttpError(400, 'INVALID_PATH', 'La dirección no es válida.');
    if (decoded.split('/').some(segment => segment.startsWith('.'))) throw new HttpError(403, 'FORBIDDEN_PATH', 'No se puede abrir esa dirección.');
    if (requested !== root && !requested.startsWith(`${root}${sep}`)) throw new HttpError(403, 'FORBIDDEN_PATH', 'No se puede abrir esa dirección.');
    const mayNavigate = decoded === '/' || (!extname(decoded) && !decoded.startsWith('/assets/') &&
      (request.headers.accept || '').split(',').some(type => type.trim().split(';')[0] === 'text/html'));
    let file = requested;
    try { if (!(await stat(file)).isFile()) file = mayNavigate ? resolve(root, 'index.html') : null; }
    catch { file = mayNavigate ? resolve(root, 'index.html') : null; }
    if (!file) return false;
    const extension = extname(file);
    if (!MIME[extension]) return false;
    let realRoot;
    let realFile;
    let metadata;
    try { [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]); metadata = await stat(realFile); }
    catch { return false; }
    if (!realFile.startsWith(`${realRoot}${sep}`)) throw new HttpError(403, 'FORBIDDEN_PATH', 'No se puede abrir esa dirección.');
    if (!metadata.isFile()) return false;
    // The published multimodal graph grows with imported route geometries.
    // Give only this canonical JSON document a larger compression budget;
    // arbitrary text and binary assets retain the existing bounds.
    const compressionLimit = realFile === resolve(realRoot, 'mobility-network.json') ? 12 * 1024 * 1024 : 4 * 1024 * 1024;
    const encoding = TEXT_EXTENSIONS.has(extension) && metadata.size >= 1024 && metadata.size <= compressionLimit ? preferredEncoding(request.headers['accept-encoding']) : null;
    const encoded = encoding ? await compressedFile(realFile,metadata,encoding) : null;
    const content = request.method === 'HEAD' ? undefined : encoded || await readFile(realFile);
    response.writeHead(200, { 'Content-Type': MIME[extension], 'Content-Length': encoded?.length ?? metadata.size,
      Vary:'Origin, Accept-Encoding', ...(encoding ? {'Content-Encoding':encoding} : {}),
      'Cache-Control': decoded === '/admin' || decoded === '/admin.html' ? 'no-store' : extension === '.html' || decoded === '/sw.js' ? 'no-cache' : /-[A-Za-z0-9_-]{8,}\./.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
    response.end(content);
    return true;
  }

  async function handler(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    response.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    response.setHeader('Vary', 'Origin');
    const origin = request.headers.origin;
    try {
      const target = request.url || '/';
      if (!target.startsWith('/') || target.startsWith('//')) throw new HttpError(400, 'INVALID_PATH', 'La dirección no es válida.');
      const url = new URL(target, 'http://localhost');
      const date = now();
      if (await admin.handle(request, response, url, date)) return;
      const adminPage = ['/admin', '/admin.html'].includes(url.pathname);
      if (adminPage) {
        if (!adminOptions) throw new HttpError(404, 'NOT_FOUND', 'No encontramos ese recurso.');
        response.setHeader('Content-Security-Policy', ADMIN_CONTENT_SECURITY_POLICY);
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      }
      if (origin && !allowedOrigins.includes(origin) && !(adminPage && origin === admin.authentication.origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Este origen no está autorizado.');
      if (origin && !adminPage) response.setHeader('Access-Control-Allow-Origin', origin);
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
        response.end();
        return;
      }
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
        if (['GET', 'HEAD'].includes(request.method) && await staticFile(url.pathname, request, response)) return;
        throw new HttpError(404, 'NOT_FOUND', 'No encontramos ese recurso.');
      }
      limit(request, 'api', 180, date);
      if (request.method === 'GET') {
        const photoMatch = url.pathname.match(/^\/api\/reports\/([0-9a-f-]{36})\/photo$/i);
        if (photoMatch) {
          const photo = store.getPublicPhoto(photoMatch[1], date);
          if (!photo) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'No encontramos una foto pública para ese reporte.');
          response.writeHead(200, { 'Content-Type': photo.mime, 'Content-Length': photo.data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          response.end(photo.data);
          return;
        }
        if (url.pathname === '/api/health') return send(response, 200, { status: 'ok', service: 'RegioMovil', version: '1.1.0', mode: 'simulation', generatedAt: date.toISOString() });
        if (url.pathname === '/api/network') {
          if (request.headers['if-none-match'] === networkETag) { response.writeHead(304, { ETag: networkETag, 'Cache-Control': 'public, max-age=86400' }); response.end(); return; }
          return send(response, 200, network, { ETag: networkETag, 'Cache-Control': 'public, max-age=86400' });
        }
        if (url.pathname === '/api/mobility/network') {
          if (!mobilityNetwork) throw new HttpError(503, 'MOBILITY_UNAVAILABLE', 'La red experimental no está preparada. Puedes usar el planificador de Metro.');
          return send(response, 200, mobilityNetwork, { 'Cache-Control': 'public, max-age=3600' });
        }
        if (url.pathname === '/api/places' || url.pathname === '/api/places/suggest') {
          if ([...url.searchParams.keys()].some(key => key !== 'q') || url.searchParams.getAll('q').length !== 1) throw new HttpError(400, 'INVALID_PLACE_QUERY', 'Envía un solo nombre de lugar con el parámetro q.');
          return send(response, 200, await (url.pathname === '/api/places/suggest' ? suggestPlaces : searchPlaces)(url.searchParams.get('q')));
        }
        if (url.pathname === '/api/model') return send(response, 200, getModelCard(), { 'Cache-Control': 'public, max-age=3600' });
        if (url.pathname === '/api/services') {
          for (const key of url.searchParams.keys()) {
            if (!['q', 'network', 'status'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new HttpError(400, 'INVALID_SERVICE_FILTER', 'Usa una sola búsqueda, red o estado por consulta.');
          }
          let routes;
          try { routes = findServices(serviceCatalog, Object.fromEntries(url.searchParams)); }
          catch (error) {
            if (error instanceof TypeError || error instanceof RangeError) throw new HttpError(400, 'INVALID_SERVICE_FILTER', error.message);
            throw error;
          }
          return send(response, 200, { ...serviceCatalog, routes, total: routes.length }, { 'Cache-Control': 'public, max-age=3600' });
        }
        const serviceMatch = url.pathname.match(/^\/api\/services\/([^/]+)$/);
        if (serviceMatch) {
          let id;
          try { id = decodeURIComponent(serviceMatch[1]); }
          catch { throw new HttpError(400, 'INVALID_SERVICE_ID', 'El identificador del servicio no es válido.'); }
          if (!id || id.length > 160 || /[\/\\\u0000-\u001f\u007f]/.test(id)) throw new HttpError(400, 'INVALID_SERVICE_ID', 'El identificador del servicio no es válido.');
          const route = serviceCatalog.routes.find(route => route.id === id);
          if (!route) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'No encontramos ese servicio en el catálogo documentado.');
          return send(response, 200, route, { 'Cache-Control': 'public, max-age=3600' });
        }
        if (url.pathname === '/api/board') {
          const station = validStation(url.searchParams.get('station') || 'padre-mier');
          const scenario = url.searchParams.get('scenario') || 'normal';
          if (!SCENARIOS.includes(scenario)) throw new HttpError(400, 'INVALID_SCENARIO', 'Elige normal, peak, rain o disruption.');
          return send(response, 200, buildBoard(network, station.id, scenario, date));
        }
        if (url.pathname === '/api/plan') {
          limit(request, 'plan', 20, date);
          if (!url.searchParams.get('from') || !url.searchParams.get('to')) throw new HttpError(400, 'MISSING_STATIONS', 'Indica las estaciones de origen y destino.');
          const from = validStation(url.searchParams.get('from'));
          const to = validStation(url.searchParams.get('to'));
          const preference = url.searchParams.get('preference') || 'fastest';
          const scenario = url.searchParams.get('scenario') || 'normal';
          if (!PREFERENCES.includes(preference)) throw new HttpError(400, 'INVALID_PREFERENCE', 'Elige fastest, comfortable o accessible.');
          if (!SCENARIOS.includes(scenario)) throw new HttpError(400, 'INVALID_SCENARIO', 'Elige normal, peak, rain o disruption.');
          return send(response, 200, planJourney(network, from.id, to.id, preference, scenario, date));
        }
        if (url.pathname === '/api/reports' || url.pathname === '/api/reports/summary') {
          const routeId = url.searchParams.get('route');
          const stationId = url.searchParams.get('station');
          if (routeId && stationId) throw new HttpError(400, 'INVALID_TARGET', 'Consulta una estación o un recorrido a la vez.');
          if (routeId) {
            validRoute(routeId);
            if (url.pathname.endsWith('/summary')) return send(response, 200, { ...store.summary({ routeId }, date), routeId, source: 'community', verification: 'moderated', notice: 'Conteos de reportes publicados, no de personas únicas ni medidas de calidad o prioridad de inversión.' });
            const { total, open, resolved, byCategory } = store.summary({ routeId }, date);
            return send(response, 200, { reports: store.listByRoute(routeId, 20, date), routeId, summary: { total, open, resolved, byCategory },
              source: 'community', verification: 'moderated', notice: 'Reportes comunitarios revisados; no son avisos oficiales.' });
          }
          const station = validStation(stationId || 'padre-mier');
          if (url.pathname.endsWith('/summary')) return send(response, 200, { ...store.summary({ stationId: station.id }, date), stationId: station.id, source: 'community', verification: 'moderated', notice: 'Conteos de reportes publicados, no de personas únicas ni medidas de calidad o prioridad de inversión.' });
          const { total, open, resolved, byCategory } = store.summary({ stationId: station.id }, date);
          return send(response, 200, { reports: store.list(station.id, 20, date), stationId: station.id, summary: { total, open, resolved, byCategory },
            source: 'community', verification: 'moderated', notice: 'Reportes comunitarios revisados. No son avisos oficiales ni alimentan el modelo.' });
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/mobility/plan') {
        if (!mobilityNetwork) throw new HttpError(503, 'MOBILITY_UNAVAILABLE', 'La red experimental no está preparada. Puedes usar el planificador de Metro.');
        // Route calculation is synchronous and more expensive than cached data.
        // Use the same budget as Metro planning, so switching endpoints cannot
        // bypass it. Do not trust spoofable X-Forwarded-For headers for identity.
        limit(request, 'plan', 20, date);
        const body = await readJson(request, 'la consulta');
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['from', 'to', 'preference', 'scenario', 'offline', 'transport'].includes(key))) throw new HttpError(400, 'INVALID_MOBILITY_PLAN', 'Indica origen, destino y opciones válidas para el trayecto.');
        if (body.offline !== undefined && typeof body.offline !== 'boolean') throw new HttpError(400, 'INVALID_MOBILITY_PLAN', 'offline debe ser verdadero o falso.');
        for (const endpoint of [body.from, body.to]) {
          if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint) || Object.keys(endpoint).some(key => !['id', 'kind', 'lat', 'lng', 'name', 'label', 'address'].includes(key))) throw new HttpError(400, 'INVALID_ENDPOINT', 'Elige una parada oficial o un lugar dentro de la zona metropolitana.');
          if (endpoint.id !== undefined && (typeof endpoint.id !== 'string' || endpoint.id.length > 160 || /[\u0000-\u001f\u007f]/.test(endpoint.id))) throw new HttpError(400, 'INVALID_ENDPOINT', 'El identificador de la parada no es válido.');
          if (endpoint.id !== undefined && (endpoint.lat !== undefined || endpoint.lng !== undefined)) throw new HttpError(400, 'INVALID_ENDPOINT', 'Elige una parada o unas coordenadas, sin combinar ambas.');
          if (endpoint.id === undefined && (!Number.isFinite(endpoint.lat) || !Number.isFinite(endpoint.lng))) throw new HttpError(400, 'INVALID_ENDPOINT', 'Las coordenadas deben ser números válidos.');
          for (const field of ['name', 'label', 'address']) if (endpoint[field] !== undefined && (typeof endpoint[field] !== 'string' || endpoint[field].length > 500 || /[\u0000-\u001f\u007f]/.test(endpoint[field]))) throw new HttpError(400, 'INVALID_ENDPOINT', 'El nombre del lugar no es válido.');
          if (endpoint.kind !== undefined && !['stop', 'place', 'location', 'coordinate'].includes(endpoint.kind)) throw new HttpError(400, 'INVALID_ENDPOINT', 'El tipo de origen o destino no es válido.');
        }
        try { return send(response, 200, planMobility(mobilityNetwork, { ...body, date: date.toISOString() })); }
        catch (error) {
          if (error instanceof RangeError && /^[A-Z_]{3,40}$/.test(error.code || '')) throw new HttpError(400, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/reports') {
        // Retried receipts do not consume the budget for new reports. Bound all
        // attempts separately, including invalid payloads and photo parsing.
        limit(request, 'report-attempt', Math.max(reportLimit, reportLimit * 10), date);
        const body = await readJson(request, 'el reporte', 600_000);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_REPORT', 'El reporte debe ser un objeto JSON.');
        if (Object.keys(body).some(key => !['stationId', 'routeId', 'category', 'detail', 'title', 'targetType', 'unitReference', 'locationReference', 'photo', 'publicationConsent', 'draftId'].includes(key))) throw new HttpError(400, 'INVALID_REPORT', 'El reporte contiene campos no permitidos.');
        if (body.draftId !== undefined && !validReportDraftId(body.draftId)) throw new HttpError(400, 'INVALID_REPORT_DRAFT', 'El identificador del borrador no es válido.');
        const legacy = body.targetType === undefined && body.title === undefined && body.publicationConsent === undefined && body.routeId === undefined;
        const targetType = legacy ? 'station' : body.targetType;
        if (!['station', 'unit', 'route'].includes(targetType)) throw new HttpError(400, 'INVALID_TARGET', 'Elige una estación, unidad o infraestructura del recorrido.');
        if (body.stationId !== undefined && (typeof body.stationId !== 'string' || !body.stationId.trim())) throw new HttpError(400, 'INVALID_STATION', 'Indica una estación válida.');
        if (targetType === 'station' && !body.stationId) throw new HttpError(400, 'INVALID_STATION', 'Elige una estación de Metro.');
        if (targetType === 'station' && body.routeId !== undefined) throw new HttpError(400, 'INVALID_TARGET', 'El reporte de estación se asocia a su estación; elige unidad o recorrido para reportar una ruta.');
        if (targetType === 'route' && body.stationId !== undefined) throw new HttpError(400, 'INVALID_TARGET', 'Usa la referencia de parada o cruce para el reporte de recorrido.');
        const station = body.stationId ? validStation(body.stationId) : null;
        const route = targetType === 'station' ? null : validRoute(body.routeId);
        if (!REPORT_CATEGORIES.includes(body.category)) throw new HttpError(400, 'INVALID_CATEGORY', 'Elige una categoría válida para el reporte.');
        if (typeof body.detail !== 'string') throw new HttpError(400, 'INVALID_DETAIL', 'Agrega una descripción de 3 a 500 caracteres.');
        const detail = body.detail.trim().normalize('NFC');
        if ([...detail].length < 3 || [...detail].length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(detail)) throw new HttpError(400, 'INVALID_DETAIL', 'Agrega una descripción de 3 a 500 caracteres, sin caracteres de control.');
        const title = legacy ? [...detail.replace(/\s+/g, ' ')].slice(0, 100).join('') : typeof body.title === 'string' ? body.title.trim().normalize('NFC') : '';
        if ([...title].length < 3 || [...title].length > 100 || /[\u0000-\u001f\u007f]/.test(title)) throw new HttpError(400, 'INVALID_TITLE', 'Agrega un título de 3 a 100 caracteres.');
        const reference = (key, max) => {
          if (body[key] === undefined) return '';
          if (typeof body[key] !== 'string') throw new HttpError(400, 'INVALID_REFERENCE', 'La referencia debe ser texto.');
          const value = body[key].trim().normalize('NFC');
          if ([...value].length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400, 'INVALID_REFERENCE', `La referencia admite hasta ${max} caracteres sin controles.`);
          return value;
        };
        const unitReference = reference('unitReference', 80), locationReference = reference('locationReference', 120);
        if (targetType !== 'unit' && unitReference) throw new HttpError(400, 'INVALID_REFERENCE', 'La referencia de unidad corresponde a reportes de unidades.');
        let photoMime = null, photoData = null;
        if (body.photo !== undefined) {
          try { ({ mime: photoMime, data: photoData } = parseReportPhoto(body.photo)); }
          catch { throw new HttpError(400, 'INVALID_PHOTO', 'Usa una foto JPEG, PNG o WebP válida de hasta 400 KB y 4 megapíxeles.'); }
        }
        if (!legacy && typeof body.publicationConsent !== 'boolean') throw new HttpError(400, 'INVALID_CONSENT', 'Indica si autorizas que el reporte pueda publicarse después de su revisión.');
        let report;
        try { report = store.add({ stationId: station?.id, routeId: route?.id, category: body.category, detail, title, targetType, unitReference, locationReference, photoMime, photoData, publicationConsent: legacy ? false : body.publicationConsent, draftId: body.draftId }, date,
          { beforeCreate: () => limit(request, 'report', reportLimit, date) }); }
        catch (error) {
          if (error.code === 'REPORT_STORAGE_FULL') throw new HttpError(507, error.code, error.message);
          if (error.code === 'REPORT_DRAFT_CONFLICT') throw new HttpError(409, error.code, error.message);
          throw error;
        }
        return send(response, 201, { report, notice: 'Reporte guardado como privado y pendiente de revisión. Sólo se publicará si lo aprueba una persona revisora y diste tu consentimiento.' }, { Location: `/api/reports?${route ? 'route' : 'station'}=${encodeURIComponent(route?.id || station.id)}` });
      }
      if (['/api/health', '/api/network', '/api/model', '/api/board', '/api/plan', '/api/reports', '/api/reports/summary', '/api/services', '/api/places', '/api/places/suggest', '/api/mobility/network', '/api/mobility/plan'].includes(url.pathname) || /^\/api\/services\/[^/]+$/.test(url.pathname) || /^\/api\/reports\/[^/]+\/photo$/.test(url.pathname)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
      throw new HttpError(404, 'NOT_FOUND', 'No encontramos ese recurso.');
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const knownError = error instanceof HttpError || error instanceof PlaceSearchError;
      if (!knownError) console.error('Request failed:', error.code || error.name);
      if (error.status === 429) response.setHeader('Retry-After', String(error.retryAfter || 60));
      send(response, knownError ? error.status : 500, { error: { code: knownError ? error.code : 'INTERNAL_ERROR', message: knownError ? error.message : 'No pudimos completar la solicitud. Intenta de nuevo.' } });
    }
  }
  return { handler, ready: admin.ready, admin: admin.authentication, close: () => { admin.close(); store.close(); }, store };
}
