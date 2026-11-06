import type { RoutePack } from './types';

/** A revision names exact public bytes; never accept a different file under that cache key. */
export async function decodeRoutePack(body: string, revision: string): Promise<RoutePack> {
  if (!/^[a-f0-9]{12,64}$/.test(revision) || !globalThis.crypto?.subtle)
    throw new Error('No pudimos verificar el recorrido. Usa una conexión segura o la app.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  if (!hex.startsWith(revision))
    throw new Error('El recorrido cambió de revisión. Actualiza las rutas antes de consultarlo.');
  return JSON.parse(body) as RoutePack;
}
