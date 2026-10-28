import { Capacitor } from '@capacitor/core';

export const nativeReportCamera = () => Capacitor.isNativePlatform();
const pendingKey = 'regiomovil:report-camera-pending';
function pendingFor(draftId: string) {
  try {
    const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    if (pending && pending.expiresAt < Date.now()) localStorage.removeItem(pendingKey);
    return pending?.draftId === draftId && pending.expiresAt > Date.now();
  } catch {
    return false;
  }
}
function clearPending(draftId: string) {
  if (pendingFor(draftId)) {
    try {
      localStorage.removeItem(pendingKey);
    } catch {
      /* Recovery is best effort. */
    }
  }
}

async function photoFile(path: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) throw new Error('No pudimos abrir la foto. Prueba elegirla de nuevo.');
  const blob = await response.blob();
  return new File([blob], 'observacion.jpg', { type: blob.type || 'image/jpeg' });
}

export async function pickReportPhoto(
  source: 'camera' | 'gallery',
  draftId: string,
): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    try {
      localStorage.setItem(
        pendingKey,
        JSON.stringify({ draftId, expiresAt: Date.now() + 86400000 }),
      );
    } catch {
      /* The form already explains storage failures. */
    }
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 85,
      width: 1280,
      correctOrientation: true,
      saveToGallery: false,
    });
    return photo.webPath ? photoFile(photo.webPath) : null;
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : String((cause as { message?: string })?.message || cause);
    if (/cancel|canceled|cancelled|no image|no photo/i.test(message)) return null;
    throw new Error('No pudimos abrir la foto. Revisa el permiso o elige un archivo.');
  } finally {
    clearPending(draftId);
  }
}

export async function listenForRestoredReportPhoto(
  draftId: string,
  onPhoto: (file: File) => void,
  onError: () => void,
) {
  if (!nativeReportCamera()) return () => {};
  const { App } = await import('@capacitor/app');
  const listener = await App.addListener('appRestoredResult', (result) => {
    if (result.pluginId !== 'Camera' || !pendingFor(draftId)) return;
    clearPending(draftId);
    if (result.success && result.data?.webPath) {
      void photoFile(result.data.webPath).then(onPhoto, onError);
    }
  });
  return () => {
    void listener.remove();
  };
}
