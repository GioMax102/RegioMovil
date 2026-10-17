import { readPublicDocument } from '../api';
import type { MobilityNetwork, MobilityPlan, MobilityRequest, Place } from './types';

export async function loadMobilityNetwork(): Promise<MobilityNetwork> {
  const { data } = await readPublicDocument<MobilityNetwork>('/mobility-network.json');
  if (data.version !== 1 || !Array.isArray(data.stops) || !Array.isArray(data.routes))
    throw new Error('No pudimos validar la red de movilidad. Vuelve a descargarla.');
  return data;
}

export class PlaceLookupError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (!base && location.hostname === 'localhost' && location.protocol === 'https:')
    throw new Error(
      'Este APK necesita una API HTTPS configurada para buscar lugares. Puedes elegir paradas.',
    );
  const request = new AbortController();
  const cancel = () => request.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) request.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    request.abort();
  }, 8500);
  try {
    const response = await fetch(
      `${base}/api/places/suggest?q=${encodeURIComponent(query.trim())}`,
      {
        signal: request.signal,
        cache: 'no-store',
      },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new PlaceLookupError(
        payload.error?.message ||
          'El buscador no está disponible. Elige una parada o inténtalo después.',
        response.status === 429 ? Number(response.headers.get('Retry-After')) || 1 : 0,
      );
    if (!Array.isArray(payload.places))
      throw new Error('No pudimos leer las sugerencias. Prueba otro nombre.');
    return payload.places
      .slice(0, 6)
      .filter(
        (place: Place) =>
          typeof place?.id === 'string' &&
          typeof place.name === 'string' &&
          typeof place.displayName === 'string' &&
          Number.isFinite(place.lat) &&
          Number.isFinite(place.lng),
      );
  } catch (error) {
    if (timedOut && !signal.aborted)
      throw new Error('Las sugerencias tardaron demasiado. Prueba otro nombre o elige una parada.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

/** A single worker owns the graph; precise endpoints remain in this device's memory. */
export function createMobilityPlanner(network: MobilityNetwork) {
  let worker: Worker | null = null;
  let fatalError: Error | null = null;
  let running = false;
  let queued: { id: number; request: MobilityRequest } | null = null;
  let nextId = 0;
  const pending = new Map<
    number,
    {
      resolve: (plan: MobilityPlan) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  function failWorker(error: Error) {
    fatalError = error;
    worker?.terminate();
    worker = null;
    queued = null;
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(error);
    }
    pending.clear();
  }
  function dispatch(id: number, request: MobilityRequest) {
    if (running) {
      if (queued) {
        const previous = pending.get(queued.id);
        if (previous) {
          clearTimeout(previous.timer);
          previous.reject(new Error('Se eligió una prioridad nueva.'));
          pending.delete(queued.id);
        }
      }
      queued = { id, request };
    } else {
      running = true;
      worker!.postMessage({ type: 'plan', id, request });
    }
  }
  if (typeof Worker !== 'undefined') {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ type: 'initialize', network });
    worker.onmessage = ({ data }) => {
      running = false;
      const task = pending.get(data.id);
      if (task) {
        clearTimeout(task.timer);
        pending.delete(data.id);
        if (data.error) task.reject(new Error(data.error));
        else task.resolve(data.plan);
      }
      if (queued) {
        const next = queued;
        queued = null;
        dispatch(next.id, next.request);
      }
    };
    worker.onerror = () =>
      failWorker(
        new Error('El cálculo se interrumpió. Vuelve a abrir Planear viaje e inténtalo de nuevo.'),
      );
  }
  return {
    async plan(request: MobilityRequest): Promise<MobilityPlan> {
      if (fatalError) throw fatalError;
      if (!worker) {
        const { planMobility } = await import('../../server/mobility.mjs');
        return planMobility(network, request) as MobilityPlan;
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          failWorker(
            new Error(
              'El cálculo tomó demasiado tiempo. Vuelve a abrir Planear viaje y prueba otra prioridad.',
            ),
          );
        }, 12000);
        pending.set(id, { resolve, reject, timer });
        dispatch(id, request);
      });
    },
    dispose() {
      failWorker(new Error('El planificador se cerró.'));
    },
  };
}
