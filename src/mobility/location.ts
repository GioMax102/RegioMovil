import { Capacitor, registerPlugin } from '@capacitor/core';
import type { MobilityEndpoint } from './types';
import { LOCATION_POLICY } from './locationPolicy';

export interface PositionFix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  speed?: number | null;
  heading?: number | null;
}
interface NativeLocation {
  /** Inherited from Capacitor Plugin; checks aliases without requesting access. */
  checkPermissions(): Promise<{ coarse?: string; fine?: string }>;
  getCurrentPosition(options: {
    requestPermission: boolean;
    requestId: string;
  }): Promise<PositionFix>;
  cancelCurrentPosition(options: { id: string }): Promise<void>;
  watchPosition(
    callback: (position: PositionFix | null, error?: { message?: string }) => void,
  ): Promise<string>;
  stopWatching(options: { id: string }): Promise<void>;
}

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown';
export const LOCATION_MAX_AGE_MS = LOCATION_POLICY.maxAgeMs;
export const LOCATION_MAX_ACCURACY_METERS = LOCATION_POLICY.maxAccuracy;
let rememberedPosition: PositionFix | null = null;
let readCounter = 0;

export function isFreshLocation(
  position: PositionFix | null,
  now = Date.now(),
): position is PositionFix {
  return (
    !!position &&
    Number.isFinite(position.lat) &&
    Math.abs(position.lat) <= 90 &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lng) <= 180 &&
    Number.isFinite(position.accuracy) &&
    position.accuracy >= 0 &&
    position.accuracy <= LOCATION_MAX_ACCURACY_METERS &&
    Number.isFinite(position.timestamp) &&
    position.timestamp > 0 &&
    position.timestamp <= now &&
    now - position.timestamp <= LOCATION_MAX_AGE_MS
  );
}

/** A short-lived sample only; never persisted, sent to a server or put in a URL. */
export function getRememberedLocation(): PositionFix | null {
  if (!isFreshLocation(rememberedPosition)) rememberedPosition = null;
  return rememberedPosition ? { ...rememberedPosition } : null;
}

export function forgetLocation(): void {
  rememberedPosition = null;
}

/** Checking permission never asks for it. Unknown browsers remain usable manually. */
export async function checkLocationPermission(): Promise<LocationPermission> {
  try {
    if (Capacitor.isNativePlatform()) {
      const state = await nativeLocation.checkPermissions();
      if (state.coarse === 'granted' || state.fine === 'granted') return 'granted';
      if (state.coarse === 'denied' && state.fine === 'denied') return 'denied';
      if (
        [state.coarse, state.fine].some(
          (value) => value === 'prompt' || value === 'prompt-with-rationale',
        )
      )
        return 'prompt';
      return 'unknown';
    }
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const state = await navigator.permissions.query({ name: 'geolocation' });
    return ['granted', 'denied', 'prompt'].includes(state.state) ? state.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** One foreground sample. Web acquisition always requires an explicit action. */
export async function readLocation(
  options: { requestPermission?: boolean; signal?: AbortSignal } = {},
): Promise<PositionFix> {
  const requestPermission = options.requestPermission !== false;
  const signal = options.signal;
  if (signal?.aborted) throw new DOMException('Se canceló la lectura.', 'AbortError');
  // A permission query and a browser read cannot atomically prevent a prompt.
  if (!requestPermission && !Capacitor.isNativePlatform()) {
    const sample = getRememberedLocation();
    if (sample) return sample;
    throw new Error('Pulsa Cerca de mí para obtener una ubicación nueva.');
  }
  const native = Capacitor.isNativePlatform();
  const requestId = `${Date.now()}:${++readCounter}`;
  const acquisition = native
    ? nativeLocation.getCurrentPosition({ requestPermission, requestId })
    : new Promise<PositionFix>((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          reject(new Error('Este dispositivo no ofrece ubicación. Elige una parada.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          ({ coords, timestamp }) =>
            resolve({
              lat: coords.latitude,
              lng: coords.longitude,
              accuracy: coords.accuracy,
              timestamp,
              speed: coords.speed,
              heading: coords.heading,
            }),
          (error) =>
            reject(
              new Error(
                error.code === 1
                  ? 'No se concedió acceso a tu ubicación. Puedes elegir una parada o buscar un lugar.'
                  : 'No pudimos obtener tu ubicación. Activa la ubicación del dispositivo o elige una parada.',
              ),
            ),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
        );
      });
  return new Promise<PositionFix>((resolve, reject) => {
    const abort = () => {
      signal?.removeEventListener('abort', abort);
      if (native) void nativeLocation.cancelCurrentPosition({ id: requestId }).catch(() => {});
      reject(new DOMException('Se canceló la lectura.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    acquisition.then(
      (position) => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) return;
        if (!isFreshLocation(position)) {
          reject(
            new Error(
              'La ubicación es antigua o demasiado imprecisa. Actualiza Cerca de mí o elige una parada.',
            ),
          );
          return;
        }
        rememberedPosition = { ...position };
        resolve({ ...position });
      },
      (error) => {
        signal?.removeEventListener('abort', abort);
        if (!signal?.aborted) reject(error);
      },
    );
    if (signal?.aborted) abort();
  });
}

/** Foreground only. No coordinates are stored or transmitted by this adapter. */
export async function watchLocation(
  onPosition: (position: PositionFix) => void,
  onError: (error: Error) => void,
): Promise<() => void> {
  let stopped = false;
  if (Capacitor.isNativePlatform()) {
    const id = await nativeLocation.watchPosition((position, error) => {
      if (stopped) return;
      if (error) onError(new Error(error.message || 'No pudimos seguir tu ubicación.'));
      else if (
        position &&
        Number.isFinite(position.lat) &&
        Number.isFinite(position.lng) &&
        Number.isFinite(position.timestamp)
      )
        onPosition(position);
    });
    return () => {
      if (stopped) return;
      stopped = true;
      void nativeLocation.stopWatching({ id }).catch(() => {});
    };
  }
  if (!navigator.geolocation)
    throw new Error('Este dispositivo no ofrece ubicación. Puedes avanzar las etapas manualmente.');
  const id = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) => {
      if (!stopped)
        onPosition({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          timestamp,
          speed: coords.speed,
          heading: coords.heading,
        });
    },
    (error) => {
      if (!stopped)
        onError(
          new Error(
            error.code === 1
              ? 'No se concedió acceso a tu ubicación. Puedes seguir las etapas manualmente.'
              : 'No tenemos una ubicación reciente. Revisa el GPS o avanza manualmente.',
          ),
        );
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
  );
  return () => {
    if (stopped) return;
    stopped = true;
    navigator.geolocation.clearWatch(id);
  };
}
const nativeLocation = registerPlugin<NativeLocation>('RegioLocation');

/** One foreground fix, only called after the person presses the location button. */
export async function currentLocation(): Promise<MobilityEndpoint> {
  const { lat, lng, accuracy } = await readLocation({ requestPermission: true });
  return { lat, lng, accuracy, kind: 'location', name: 'Mi ubicación' };
}
