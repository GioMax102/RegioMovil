import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { adminRequest, AdminApiError } from './api';
import type { AdminSession } from './types';
import { Notice, roleNames, accessError, messageOf } from './ui';
import { MfaChallenge, MfaEnrollment } from './Auth';
import Dashboard from './Dashboard';
import Inbox from './Inbox';
import ReportDetail from './ReportDetail';

export default function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [view, setView] = useState<'checking' | 'login' | 'challenge' | 'disabled' | 'ready'>(
    'checking',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  const authRequest = useRef<AbortController | null>(null);
  const clearSession = useCallback(() => {
    generation.current += 1;
    authRequest.current?.abort();
    setBusy(false);
    setSession(null);
    setSelected(null);
    setView('login');
  }, []);
  const handleError = useCallback(
    (reason: unknown) => {
      const failedChallenge = reason instanceof AdminApiError && reason.code === 'AUTH_FAILED';
      if (accessError(reason) && !failedChallenge) clearSession();
      setError(messageOf(reason));
    },
    [clearSession],
  );
  const checkSession = useCallback(async (signal?: AbortSignal) => {
    const currentGeneration = generation.current;
    const current = await adminRequest<AdminSession>('/api/admin/session', { signal });
    if (!signal?.aborted && currentGeneration === generation.current) {
      setSession(current);
      setView('ready');
      setError('');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    checkSession(controller.signal).catch((reason) => {
      if (controller.signal.aborted) return;
      if (reason instanceof AdminApiError && reason.status === 401) setView('login');
      else if (reason instanceof AdminApiError && reason.status === 404) setView('disabled');
      else {
        setError(messageOf(reason));
        setView('login');
      }
    });
    // A restored history page must revalidate rather than display a stale private view.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      controller.abort();
      authRequest.current?.abort();
      generation.current += 1;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [checkSession]);
  useEffect(() => {
    if (!session) return;
    const delay = Date.parse(session.expiresAt) - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = setTimeout(
      () => {
        clearSession();
        setError('La sesión terminó. Vuelve a ingresar.');
      },
      Math.max(0, Math.min(delay, 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [session, clearSession]);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentGeneration = generation.current;
    const controller = new AbortController();
    authRequest.current?.abort();
    authRequest.current = controller;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    event.currentTarget.reset();
    try {
      let csrf: string | undefined;
      try {
        const current = await adminRequest<AdminSession>('/api/admin/session', {
          signal: controller.signal,
        });
        csrf = current.csrfToken;
      } catch (reason) {
        if (!(reason instanceof AdminApiError && reason.status === 401)) throw reason;
      }
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      const response = await adminRequest<{ twoFactorRedirect?: boolean }>(
        '/api/admin/auth/sign-in/email',
        { method: 'POST', body: { email, password }, csrf, signal: controller.signal },
      );
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      if (response.twoFactorRedirect) setView('challenge');
      else await checkSession(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted && currentGeneration === generation.current)
        handleError(reason);
    } finally {
      if (!controller.signal.aborted && currentGeneration === generation.current) setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError('');
    clearSession();
    setBusy(true);
    try {
      // MFA setup may rotate the cookie before its final verification. Obtain
      // the proof for the current cookie rather than reuse the previous session.
      const current = await adminRequest<AdminSession>('/api/admin/session');
      await adminRequest('/api/admin/auth/sign-out', {
        method: 'POST',
        body: {},
        csrf: current.csrfToken,
      });
    } catch (reason) {
      // Remove private data even when the network cannot confirm revocation.
      if (!(reason instanceof AdminApiError && reason.status === 401))
        setError(
          `${messageOf(reason)} El cierre en el servidor no quedó confirmado; vuelve a ingresar y cierra la sesión cuando recuperes conexión.`,
        );
    } finally {
      setBusy(false);
    }
  }
  const accessReady = view === 'ready' && session && !session.mfaRequired;
  return (
    <div className="admin-app">
      <a className="admin-skip" href="#admin-main">
        Ir al contenido
      </a>
      <header className="admin-topbar">
        <a className="admin-brand" href="/">
          <img src="/icon.svg" alt="" width="36" height="36" />
          <span>
            RegioMóvil<small>Administración</small>
          </span>
        </a>
        {session && (
          <div className="admin-account">
            <span>
              {session.user.name}
              <small>{roleNames[session.user.role]}</small>
            </span>
            <button disabled={busy} onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        )}
      </header>
      <main id="admin-main" className={accessReady ? 'admin-main' : 'admin-login'}>
        {view === 'checking' && <p role="status">Comprobando acceso…</p>}
        {view === 'disabled' && (
          <section className="admin-panel">
            <p className="admin-eyebrow">Acceso restringido</p>
            <h1>Administración sin habilitar</h1>
            <p>
              Este servidor aún no tiene configurado el acceso administrativo. La persona
              responsable debe habilitarlo y crear las cuentas desde el servidor.
            </p>
            <a href="/">Volver a RegioMóvil</a>
          </section>
        )}
        {error && <Notice>{error}</Notice>}
        {view === 'login' && (
          <section className="admin-panel">
            <p className="admin-eyebrow">Cuidado de la red</p>
            <h1>Una mejor movilidad empieza escuchando</h1>
            <p>Revisa las aportaciones de la comunidad con una cuenta autorizada.</p>
            <form onSubmit={signIn} className="admin-form">
              <label>
                Correo
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  maxLength={254}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </label>
              <button className="admin-primary" disabled={busy}>
                {busy ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>
            <p className="admin-muted">
              El acceso requiere un segundo factor. Las cuentas se asignan por el equipo
              responsable.
            </p>
          </section>
        )}
        {view === 'challenge' && (
          <section className="admin-panel">
            <h1>Confirma que eres tú</h1>
            <MfaChallenge
              busy={busy}
              setBusy={setBusy}
              onVerified={checkSession}
              onError={handleError}
            />
            <button
              disabled={busy}
              onClick={() => {
                setView('login');
                setError('');
              }}
            >
              Volver al ingreso
            </button>
          </section>
        )}
        {view === 'ready' &&
          session?.mfaRequired &&
          (session.user.twoFactorEnabled ? (
            <section className="admin-panel">
              <h1>Confirma tu segundo factor</h1>
              <MfaChallenge
                busy={busy}
                setBusy={setBusy}
                csrf={session.csrfToken}
                onVerified={checkSession}
                onError={handleError}
              />
            </section>
          ) : (
            <MfaEnrollment
              session={session}
              busy={busy}
              setBusy={setBusy}
              onVerified={checkSession}
              onError={handleError}
            />
          ))}
        {accessReady && (
          <>
            <div className="admin-page-heading">
              <div>
                <p className="admin-eyebrow">Cuidado de la red</p>
                <h1>Reportes de la comunidad</h1>
                <p>Aportaciones para acompañar la revisión de infraestructura y unidades.</p>
              </div>
              <button onClick={() => setEpoch((value) => value + 1)}>Actualizar indicadores</button>
            </div>
            <Dashboard session={session} epoch={epoch} onError={handleError} />
            {session.user.role !== 'analyst' && (
              <Inbox session={session} epoch={epoch} onError={handleError} onSelect={setSelected} />
            )}
            {session.user.role === 'analyst' && (
              <p className="admin-muted">
                Tu perfil permite consultar indicadores agregados. La evidencia privada y las
                decisiones de moderación requieren un perfil de moderación.
              </p>
            )}
            {selected && (
              <ReportDetail
                key={`${selected}:${generation.current}`}
                id={selected}
                session={session}
                onError={handleError}
                onClose={() => setSelected(null)}
                onChanged={() => {
                  setSelected(null);
                  setEpoch((value) => value + 1);
                }}
              />
            )}
          </>
        )}
      </main>
      <footer className="admin-footer">
        RegioMóvil · Revisión humana y decisiones con contexto.
      </footer>
    </div>
  );
}
