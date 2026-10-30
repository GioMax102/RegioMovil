import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { adminRequest } from './api';
import type { AdminSession } from './types';

function useAuthRequest() {
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  return () => {
    request.current?.abort();
    request.current = new AbortController();
    return request.current;
  };
}

export function MfaChallenge({
  busy,
  setBusy,
  csrf,
  onVerified,
  onError,
}: {
  busy: boolean;
  setBusy: (value: boolean) => void;
  csrf?: string;
  onVerified: (signal?: AbortSignal) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [backup, setBackup] = useState(false);
  const startRequest = useAuthRequest();
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const controller = startRequest();
    const code = String(new FormData(event.currentTarget).get('code') || '').trim();
    event.currentTarget.reset();
    try {
      await adminRequest(
        `/api/admin/auth/two-factor/${backup ? 'verify-backup-code' : 'verify-totp'}`,
        { method: 'POST', body: { code }, csrf, signal: controller.signal },
      );
      if (!controller.signal.aborted) await onVerified(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) onError(reason);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <p>
        {backup
          ? 'Escribe uno de tus códigos de recuperación. Solo puede usarse una vez.'
          : 'Escribe el código de tu aplicación de autenticación.'}
      </p>
      <form className="admin-form" onSubmit={verify}>
        <label>
          {backup ? 'Código de recuperación' : 'Código de autenticación'}
          <input
            key={String(backup)}
            name="code"
            autoComplete="one-time-code"
            inputMode={backup ? 'text' : 'numeric'}
            pattern={backup ? undefined : '[0-9]{6}'}
            minLength={backup ? 1 : 6}
            maxLength={backup ? 30 : 6}
            required
            autoFocus
            disabled={busy}
          />
        </label>
        <button className="admin-primary" disabled={busy}>
          {busy ? 'Comprobando…' : 'Verificar acceso'}
        </button>
      </form>
      <button
        className="admin-text-button"
        disabled={busy}
        onClick={() => setBackup((value) => !value)}
      >
        {backup ? 'Usar aplicación de autenticación' : 'Usar un código de recuperación'}
      </button>
    </>
  );
}

export function MfaEnrollment({
  session,
  busy,
  setBusy,
  onVerified,
  onError,
}: {
  session: AdminSession;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onVerified: (signal?: AbortSignal) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const startRequest = useAuthRequest();
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const controller = startRequest();
    const password = String(new FormData(event.currentTarget).get('password') || '');
    event.currentTarget.reset();
    try {
      const setup = await adminRequest<{ totpURI: string; backupCodes: string[] }>(
        '/api/admin/auth/two-factor/enable',
        {
          method: 'POST',
          body: { password, method: 'totp' },
          csrf: session.csrfToken,
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) setSetup(setup);
    } catch (reason) {
      if (!controller.signal.aborted) onError(reason);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const controller = startRequest();
    const code = String(new FormData(event.currentTarget).get('code') || '').trim();
    const codeInput = event.currentTarget.elements.namedItem('code') as HTMLInputElement | null;
    if (codeInput) codeInput.value = '';
    try {
      // Enabling MFA may rotate the session cookie. Refresh its CSRF proof while
      // retaining the one-time recovery codes in this component's memory.
      const current = await adminRequest<AdminSession>('/api/admin/session', {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      await adminRequest('/api/admin/auth/two-factor/verify-totp', {
        method: 'POST',
        body: { code },
        csrf: current.csrfToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setSetup(null);
      await onVerified(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) onError(reason);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  let secret = '';
  try {
    if (setup) secret = new URL(setup.totpURI).searchParams.get('secret') || '';
  } catch {
    /* Do not render an untrusted URI as a link. */
  }
  return (
    <section className="admin-panel">
      <p className="admin-eyebrow">Protege tu cuenta</p>
      <h1>Activa la autenticación en dos pasos</h1>
      <p>
        Configura una aplicación de autenticación antes de consultar información administrativa.
      </p>
      {!setup ? (
        <form className="admin-form" onSubmit={enable}>
          <label>
            Confirma tu contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              disabled={busy}
            />
          </label>
          <button className="admin-primary" disabled={busy}>
            {busy ? 'Preparando…' : 'Configurar segundo factor'}
          </button>
        </form>
      ) : (
        <>
          <ol className="admin-setup">
            <li>
              Añade una cuenta manual en tu aplicación de autenticación:{' '}
              <strong>RegioMóvil · {session.user.email}</strong>, clave TOTP de 6 dígitos, periodo
              de 30 segundos.
              <label>
                Clave de configuración
                <input readOnly value={secret} autoComplete="off" spellCheck={false} />
              </label>
            </li>
            <li>
              Guarda estos códigos de recuperación en un lugar privado. No se volverán a mostrar.
              <div className="admin-backup-codes">
                {setup.backupCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
            </li>
          </ol>
          <form className="admin-form" onSubmit={verify}>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
                required
              />
              He guardado los códigos de recuperación
            </label>
            <label>
              Código de autenticación
              <input
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                disabled={busy}
              />
            </label>
            <button className="admin-primary" disabled={busy || !saved}>
              {busy ? 'Verificando…' : 'Activar y continuar'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
