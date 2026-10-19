import { Capacitor, registerPlugin } from '@capacitor/core';
import type { MobilityEndpoint } from './types';

export interface PositionFix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  speed?: number | null;
  heading?: number | null;
}
interface NativeLocation {
  getCurrentPosition(): Promise<{ lat: number; lng: number; accuracy: number }>;
  watchPosition(
    callback: (position: PositionFix | null, error?: { message?: string }) => void,
  ): Promise<string>;
  stopWatching(options: { id: string }): Promise<void>;
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
  if (Capacitor.isNativePlatform()) {
    const point = await nativeLocation.getCurrentPosition();
    return { ...point, kind: 'location', name: 'Mi ubicación' };
  }
  if (!navigator.geolocation)
    throw new Error('Este dispositivo no ofrece ubicación. Elige una parada.');
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          kind: 'location',
          name: 'Mi ubicación',
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
    ),
  );
}
