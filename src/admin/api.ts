export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

// Administration always uses the server that serves this page. The public app's
// optional external API setting must never receive an administrator's session.
export async function adminRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; csrf?: string; signal?: AbortSignal } = {},
): Promise<T> {
  if (!path.startsWith('/api/admin/')) throw new Error('Invalid administration endpoint.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AdminApiError(
        response.status,
        body?.error?.code || body?.code || 'REQUEST_FAILED',
        response.status === 401
          ? path.includes('/auth/')
            ? 'No pudimos validar tu acceso. Revisa los datos e intenta de nuevo.'
            : 'La sesión terminó. Vuelve a ingresar.'
          : response.status === 409
            ? 'El reporte cambió durante la revisión. Carga su versión actual antes de decidir.'
            : response.status === 429
              ? 'Demasiados intentos. Espera un momento antes de volver a intentar.'
              : response.status === 403
                ? 'Tu acceso no permite esta operación. Revisa tu sesión.'
                : 'No pudimos completar la operación. Intenta de nuevo.',
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new AdminApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function adminPhoto(id: string, signal: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`/api/admin/reports/${encodeURIComponent(id)}/photo`, {
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok)
      throw new AdminApiError(
        response.status,
        'PHOTO_FAILED',
        'No pudimos abrir la foto. Vuelve a cargar el reporte.',
      );
    const photo = await response.blob();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 600000)
      throw new AdminApiError(0, 'PHOTO_FORMAT', 'La foto no tiene un formato permitido.');
    return photo;
  } catch (error) {
    if (error instanceof AdminApiError || signal.aborted) throw error;
    throw new AdminApiError(
      0,
      'PHOTO_FAILED',
      'No pudimos abrir la foto. Vuelve a cargar el reporte.',
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
