import rawNetwork from '../data/network.json';
import { buildBoard, planJourney } from '../server/domain.mjs';
import type {
  Board,
  Network,
  Plan,
  Preference,
  Scenario,
  TransitCatalogData,
  TransitRoute,
  RoutePack,
} from './types';

export const network = rawNetwork as unknown as Network;
const apiBase = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
export type Transport = 'api' | 'local';

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    signal: AbortSignal.timeout(4500),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('El servidor no está disponible.');
  return response.json() as Promise<T>;
}
export async function loadBoard(
  station: string,
  scenario: Scenario,
): Promise<{ data: Board; transport: Transport }> {
  try {
    return {
      data: await get<Board>(`/board?station=${encodeURIComponent(station)}&scenario=${scenario}`),
      transport: 'api',
    };
  } catch {
    return { data: buildBoard(network, station, scenario) as Board, transport: 'local' };
  }
}
export async function loadPlan(
  from: string,
  to: string,
  preference: Preference,
  scenario: Scenario,
): Promise<{ data: Plan; transport: Transport }> {
  try {
    return {
      data: await get<Plan>(
        `/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&preference=${preference}&scenario=${scenario}`,
      ),
      transport: 'api',
    };
  } catch {
    return {
      data: planJourney(network, from, to, preference, scenario) as Plan,
      transport: 'local',
    };
  }
}
export async function sendReport(
  stationId: string,
  category: string,
  detail: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId, category, detail }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error(
      'No hay conexión con el servidor del piloto. Tu texto sigue aquí; vuelve a intentar.',
    );
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'No pudimos enviar el reporte. Intenta de nuevo.');
  }
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`regiomovil:${key}`);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(`regiomovil:${key}`, JSON.stringify(value));
  } catch {
    /* Browsing stays available in restricted storage. */
  }
}

// Only public route documents are stored here. Reports and API responses never enter this cache.
const routeCache = 'regiomovil-public-routes-v1';
export async function readPublicDocument<T>(
  path: string,
  immutable = false,
): Promise<{ data: T; offline: boolean }> {
  if (immutable && typeof caches !== 'undefined') {
    try {
      const cached = await (await caches.open(routeCache)).match(path, { ignoreVary: true });
      if (cached) return { data: (await cached.json()) as T, offline: !navigator.onLine };
    } catch {
      /* A restricted cache falls through to the local bundle or network. */
    }
  }
  try {
    const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('PUBLIC_DOCUMENT_UNAVAILABLE');
    const data = (await response.clone().json()) as T;
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(routeCache);
        // Keep only the current revision of this public document.
        const pathname = new URL(path, location.origin).pathname;
        for (const key of await cache.keys()) {
          if (
            new URL(key.url).pathname === pathname &&
            key.url !== new URL(path, location.origin).href
          )
            await cache.delete(key);
        }
        await cache.put(path, response);
      } catch {
        /* Restricted storage does not prevent consultation. */
      }
    }
    return { data, offline: false };
  } catch {
    if (typeof caches !== 'undefined') {
      try {
        const cached = await (await caches.open(routeCache)).match(path, { ignoreVary: true });
        if (cached) return { data: (await cached.json()) as T, offline: true };
      } catch {
        /* Surface the actionable message below. */
      }
    }
    throw new Error(
      'No pudimos abrir estos datos. Conéctate una vez para guardarlos en este dispositivo y vuelve a intentar.',
    );
  }
}
export async function loadTransitCatalog() {
  const result = await readPublicDocument<TransitCatalogData>('/transit-catalog.json');
  if (
    result.data.version !== 1 ||
    !Array.isArray(result.data.routes) ||
    !Array.isArray(result.data.sources)
  )
    throw new Error('El catálogo no tiene un formato válido. Vuelve a descargarlo.');
  return result;
}
export async function loadRoutePack(route: TransitRoute) {
  if (!route.geometryPack || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,100}$/.test(route.geometryPack))
    throw new Error('Esta ruta todavía no tiene un trazo publicado disponible.');
  const result = await readPublicDocument<RoutePack>(
    `/route-packs/${route.geometryPack}.json${route.geometryRevision ? `?v=${route.geometryRevision}` : ''}`,
    !!route.geometryRevision,
  );
  const isCoordinate = (point: number[]) =>
    point.length === 2 &&
    point.every(Number.isFinite) &&
    point[0] >= -102 &&
    point[0] <= -99 &&
    point[1] >= 24 &&
    point[1] <= 28;
  if (
    result.data.id !== route.geometryPack ||
    !Array.isArray(result.data.coordinates) ||
    !result.data.coordinates.every(isCoordinate) ||
    (result.data.segments &&
      !result.data.segments.every(
        (segment) => Array.isArray(segment) && segment.every(isCoordinate),
      ))
  )
    throw new Error(
      'El recorrido recibido no pasó la validación de coordenadas. Consulta la fuente oficial.',
    );
  return result;
}
