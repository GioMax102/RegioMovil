import { Capacitor, registerPlugin } from '@capacitor/core';
import type { MobilityEndpoint } from './types';

interface NativeLocation {
  getCurrentPosition(): Promise<{ lat: number; lng: number; accuracy: number }>;
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
