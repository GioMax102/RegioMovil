import { Capacitor, registerPlugin } from '@capacitor/core';

type NativePhoto = {
  requestId: string;
  cancelled?: boolean;
  uri?: string;
  mime?: string;
  errorCode?: string;
};
type PhotoBridge = {
  choose(options: { requestId: string }): Promise<NativePhoto>;
  release(options: { uri: string }): Promise<void>;
};
const ReportPhoto = registerPlugin<PhotoBridge>('RegioReportPhoto');
export const nativeReportCamera = () =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('RegioReportPhoto');
const pendingKey = 'regiomovil:report-camera-pending';
type Pending = { draftId: string; requestId: string; expiresAt: number };
function pendingFor(draftId: string): Pending | null {
  try {
    const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    if (pending && pending.expiresAt < Date.now()) localStorage.removeItem(pendingKey);
    return pending?.draftId === draftId &&
      pending.expiresAt > Date.now() &&
      typeof pending.requestId === 'string'
      ? pending
      : null;
  } catch {
    return null;
  }
}
function clearPending(draftId: string, requestId: string) {
  if (pendingFor(draftId)?.requestId === requestId) {
    try {
      localStorage.removeItem(pendingKey);
    } catch {
      /* Recovery is best effort; the text draft uses IndexedDB. */
    }
  }
}

async function photoFile(photo: NativePhoto): Promise<File | null> {
  if (photo.errorCode)
    throw new Error('No pudimos abrir la foto. Prueba una imagen JPEG, PNG o WebP de hasta 8 MB.');
  if (photo.cancelled || !photo.uri) return null;
  const uri = photo.uri;
  try {
    const response = await fetch(Capacitor.convertFileSrc(uri));
    if (!response.ok) throw new Error('No pudimos abrir la foto. Prueba elegirla de nuevo.');
    const blob = await response.blob();
    return new File([blob], 'observacion.jpg', { type: photo.mime || blob.type || 'image/jpeg' });
  } finally {
    // Only a private report cache file can be removed by the native bridge.
    await ReportPhoto.release({ uri }).catch(() => {});
  }
}

/** Android's native source chooser opens Camera, Photos or Documents without broad permissions. */
export async function pickReportPhoto(draftId: string): Promise<File | null> {
  const requestId = crypto.randomUUID();
  try {
    try {
      localStorage.setItem(
        pendingKey,
        JSON.stringify({
          draftId,
          requestId,
          expiresAt: Date.now() + 86400000,
        }),
      );
    } catch {
      /* The form already explains storage failures. */
    }
    const photo = await ReportPhoto.choose({ requestId });
    if (photo.requestId !== requestId) return null;
    return await photoFile(photo);
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : String((cause as { message?: string })?.message || cause);
    if (/cancel|no image|no photo/i.test(message)) return null;
    throw new Error('No pudimos abrir la foto. Prueba Cámara, Galería o Archivos de nuevo.');
  } finally {
    clearPending(draftId, requestId);
  }
}

export async function listenForRestoredReportPhoto(
  draftId: string,
  onPhoto: (file: File) => void,
  onError: () => void,
) {
  if (!nativeReportCamera()) return () => {};
  const { App } = await import('@capacitor/app');
  let active = true;
  const listener = await App.addListener('appRestoredResult', (result) => {
    const pending = pendingFor(draftId);
    if (result.pluginId !== 'RegioReportPhoto' || result.methodName !== 'choose' || !pending)
      return;
    // Older or delayed results cannot replace a newer selection on the same draft.
    if (!result.success || result.data?.requestId !== pending.requestId) return;
    clearPending(draftId, pending.requestId);
    void photoFile(result.data as NativePhoto).then(
      (file) => {
        if (active && file) onPhoto(file);
      },
      () => {
        if (active) onError();
      },
    );
  });
  return () => {
    active = false;
    void listener.remove();
  };
}
