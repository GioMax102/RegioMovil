import rawNetwork from '../data/network.json';
import { buildBoard, planJourney } from '../server/domain.mjs';
import type { Board, Network, Plan, Preference, Scenario } from './types';

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
