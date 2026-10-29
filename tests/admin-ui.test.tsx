import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { AdminReport, AdminSession } from '../src/admin/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/admin.html',
  pretendToBeVisual: true,
});
const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDialogElement',
  'HTMLInputElement',
  'HTMLFormElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
  'FormData',
  'localStorage',
  'sessionStorage',
] as const;
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of names) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
}
const priorAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
  writable: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const { render, screen, cleanup, waitFor, fireEvent, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: AdminApp } = await import('../src/admin/AdminApp');
const realFetch = globalThis.fetch;
const realCreateUrl = URL.createObjectURL;
const realRevokeUrl = URL.revokeObjectURL;
let user: ReturnType<typeof userEvent.setup>;
let currentSession: AdminSession | null;
let report: AdminReport;
let requests: { path: string; options?: RequestInit }[];
let revoked: string[];
let overrides: (path: string, options?: RequestInit) => Promise<Response | undefined>;
const session = (role: AdminSession['user']['role'] = 'moderator'): AdminSession => ({
  user: {
    id: 'moderator-id',
    name: 'Equipo de revisión',
    email: 'review@example.org',
    role,
    twoFactorEnabled: true,
  },
  csrfToken: 'csrf-memory-only',
  mfaRequired: false,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
const dashboard = {
  counters: { total: 7, pending: 3, published: 2, resolved: 1, rejected: 1 },
  queue: { pendingOver7Days: 1, oldestPendingAt: null },
  review: { reviewedCount: 4, medianHours: 2, p95Hours: 10 },
  byCategory: [{ category: 'infrastructure', count: 7 }],
  targets: [],
  capacity: { reportCount: 7, reportLimit: 5000, photoBytes: 0, photoBytesLimit: 50000000 },
  generatedAt: new Date().toISOString(),
};
beforeEach(() => {
  user = userEvent.setup({ document: dom.window.document, delay: null });
  currentSession = session();
  report = {
    id: 'report-1',
    stationId: 'padre-mier',
    routeId: null,
    targetType: 'station',
    title: 'Falta una banca',
    detail: 'Se observa una banca dañada en el andén.',
    category: 'infrastructure',
    unitReference: null,
    publicationConsent: true,
    hasPhoto: false,
    createdAt: new Date().toISOString(),
    status: 'pending',
    version: 'version-one',
    history: [],
  };
  requests = [];
  revoked = [];
  localStorage.clear();
  sessionStorage.clear();
  URL.createObjectURL = () => 'blob:private-evidence';
  URL.revokeObjectURL = (value) => {
    revoked.push(value);
  };
  overrides = async () => undefined;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    requests.push({ path, options });
    const special = await overrides(path, options);
    if (special) return special;
    if (path === '/api/admin/session')
      return currentSession
        ? Response.json(currentSession)
        : Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    if (path === '/api/admin/dashboard') return Response.json(dashboard);
    if (path.startsWith('/api/admin/reports?'))
      return Response.json({ reports: [report], total: 1, limit: 20, offset: 0 });
    if (path === '/api/admin/reports/report-1') return Response.json({ report });
    if (path === '/api/admin/reports/report-1/photo')
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
    return Response.json({ success: true });
  };
});
afterEach(() => cleanup());
after(() => {
  globalThis.fetch = realFetch;
  URL.createObjectURL = realCreateUrl;
  URL.revokeObjectURL = realRevokeUrl;
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  if (priorAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', priorAct);
  else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});
async function openReport() {
  render(<AdminApp />);
  await user.click(await screen.findByRole('button', { name: 'Revisar: Falta una banca' }));
  await screen.findByRole('heading', { name: 'Falta una banca' });
}
async function preparePublish() {
  await user.type(
    screen.getByRole('textbox', { name: /Nota de revisión/ }),
    'Contenido revisado sin datos personales.',
  );
  await user.click(screen.getByRole('checkbox', { name: /Revisé el texto/ }));
  await user.click(screen.getByRole('button', { name: 'Publicar reporte' }));
}

test('analyst only loads aggregate indicators; private evidence and moderation are not mounted', async () => {
  currentSession = session('analyst');
  render(<AdminApp />);
  await screen.findByRole('region', { name: 'Indicadores de reportes' });
  await screen.findByText('Reportes recibidos');
  assert.match(
    screen.getByText(/Se cuentan reportes/).textContent || '',
    /no personas ni fallas únicas/,
  );
  assert.equal(screen.queryByRole('heading', { name: 'Bandeja de revisión' }), null);
  assert.equal(
    requests.some((item) => item.path.startsWith('/api/admin/reports')),
    false,
  );
  for (const request of requests) {
    assert.equal(request.options?.credentials, 'same-origin');
    assert.equal(request.options?.cache, 'no-store');
  }
});

test('inbox uses server-side filters and resets pagination when a filter changes', async () => {
  overrides = async (path) =>
    path.startsWith('/api/admin/reports?')
      ? Response.json({
          reports: [report],
          total: 21,
          limit: 20,
          offset: new URL(path, 'http://localhost').searchParams.get('offset'),
        })
      : undefined;
  render(<AdminApp />);
  await screen.findByRole('button', { name: 'Revisar: Falta una banca' });
  await user.click(screen.getByRole('button', { name: 'Siguientes' }));
  await waitFor(() => assert.ok(requests.some((item) => item.path.includes('offset=20'))));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'all');
  await waitFor(() =>
    assert.ok(
      requests.some((item) => item.path.includes('status=all') && item.path.includes('offset=0')),
    ),
  );
  await user.selectOptions(screen.getByRole('combobox', { name: 'Destino' }), 'unit');
  await waitFor(() => assert.ok(requests.some((item) => item.path.includes('targetType=unit'))));
});

test('a login challenge clears the password and waits for the second factor before loading private data', async () => {
  currentSession = null;
  overrides = async (path) => {
    if (path === '/api/admin/auth/sign-in/email') return Response.json({ twoFactorRedirect: true });
    if (path === '/api/admin/auth/two-factor/verify-totp') {
      currentSession = session();
      return Response.json({ success: true });
    }
    return undefined;
  };
  render(<AdminApp />);
  await user.type(await screen.findByRole('textbox', { name: 'Correo' }), 'review@example.org');
  await user.type(screen.getByLabelText('Contraseña'), 'Long password example!');
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
  await screen.findByRole('heading', { name: 'Confirma que eres tú' });
  assert.equal(screen.queryByLabelText('Contraseña'), null);
  assert.equal(
    requests.some((item) => item.path === '/api/admin/dashboard'),
    false,
  );
  await user.type(screen.getByRole('textbox', { name: 'Código de autenticación' }), '123456');
  await user.click(screen.getByRole('button', { name: 'Verificar acceso' }));
  await screen.findByRole('heading', { name: 'Bandeja de revisión' });
  assert.equal(localStorage.length, 0);
  assert.equal(sessionStorage.length, 0);
});

test('MFA enrollment keeps recovery material in memory and requires confirmation before verification', async () => {
  currentSession = {
    ...session(),
    mfaRequired: true,
    user: { ...session().user, twoFactorEnabled: false },
  };
  overrides = async (path) => {
    if (path === '/api/admin/auth/two-factor/enable') {
      currentSession = { ...currentSession!, csrfToken: 'rotated-csrf' };
      return Response.json({
        totpURI: 'otpauth://totp/RegioMovil?secret=SECRETEXAMPLE',
        backupCodes: ['backup-code-once'],
      });
    }
    if (path === '/api/admin/auth/two-factor/verify-totp') {
      currentSession = session();
      return Response.json({ success: true });
    }
    return undefined;
  };
  render(<AdminApp />);
  await user.type(await screen.findByLabelText('Confirma tu contraseña'), 'Long password example!');
  await user.click(screen.getByRole('button', { name: 'Configurar segundo factor' }));
  await screen.findByText('backup-code-once');
  assert.equal(
    requests.some((item) => item.path === '/api/admin/dashboard'),
    false,
  );
  assert.equal(
    (screen.getByRole('button', { name: 'Activar y continuar' }) as HTMLButtonElement).disabled,
    true,
  );
  await user.click(
    screen.getByRole('checkbox', { name: 'He guardado los códigos de recuperación' }),
  );
  await user.type(screen.getByRole('textbox', { name: 'Código de autenticación' }), '123456');
  await user.click(screen.getByRole('button', { name: 'Activar y continuar' }));
  await screen.findByRole('heading', { name: 'Bandeja de revisión' });
  assert.equal(screen.queryByText('backup-code-once'), null);
  assert.equal(localStorage.length, 0);
  assert.equal(sessionStorage.length, 0);
  const enable = requests.find((item) => item.path.endsWith('/enable'))!;
  assert.equal(
    (enable.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'csrf-memory-only',
  );
  const verify = requests.find((item) => item.path.endsWith('/verify-totp'))!;
  assert.equal((verify.options?.headers as Record<string, string>)['X-CSRF-Token'], 'rotated-csrf');
});

test('an existing MFA account revalidates its current session without reenrolling or losing the CSRF proof', async () => {
  currentSession = { ...session(), mfaRequired: true };
  overrides = async (path) => {
    if (path.endsWith('/verify-backup-code')) {
      currentSession = session();
      return Response.json({ success: true });
    }
    return undefined;
  };
  render(<AdminApp />);
  await screen.findByRole('heading', { name: 'Confirma tu segundo factor' });
  assert.equal(screen.queryByRole('button', { name: 'Configurar segundo factor' }), null);
  await user.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Código de recuperación' }),
    'a-private-backup-code',
  );
  await user.click(screen.getByRole('button', { name: 'Verificar acceso' }));
  await screen.findByRole('heading', { name: 'Bandeja de revisión' });
  const verify = requests.find((item) => item.path.endsWith('/verify-backup-code'))!;
  assert.equal(
    (verify.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'csrf-memory-only',
  );
});

test('publishing requires review, note and a separate confirmation; submits optimistic concurrency tokens', async () => {
  await openReport();
  assert.equal(
    (screen.getByRole('button', { name: 'Publicar reporte' }) as HTMLButtonElement).disabled,
    true,
  );
  await preparePublish();
  assert.equal(
    requests.some((item) => item.path.endsWith('/moderate')),
    false,
  );
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  const mutation = requests.find((item) => item.path.endsWith('/moderate'))!;
  assert.deepEqual(JSON.parse(String(mutation.options?.body)), {
    action: 'publish',
    note: 'Contenido revisado sin datos personales.',
    reviewed: true,
    expectedVersion: 'version-one',
    expectedStatus: 'pending',
  });
  assert.equal(
    (mutation.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'csrf-memory-only',
  );
});

test('a report without consent remains unpublishable after content review', async () => {
  report.publicationConsent = false;
  await openReport();
  await user.type(
    screen.getByRole('textbox', { name: /Nota de revisión/ }),
    'Contenido revisado, sin consentimiento.',
  );
  await user.click(screen.getByRole('checkbox', { name: /Revisé el texto/ }));
  assert.equal(
    (screen.getByRole('button', { name: 'Publicar reporte' }) as HTMLButtonElement).disabled,
    true,
  );
  assert.equal(
    (screen.getByRole('button', { name: 'Rechazar reporte' }) as HTMLButtonElement).disabled,
    false,
  );
});

test('a concurrent moderation conflict blocks stale decisions until the current report is loaded', async () => {
  overrides = async (path) =>
    path.endsWith('/moderate')
      ? Response.json({ error: { code: 'REVIEW_CONFLICT' } }, { status: 409 })
      : undefined;
  await openReport();
  await preparePublish();
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }));
  await screen.findByText(/El reporte cambió durante la revisión/);
  assert.equal(
    (screen.getByRole('button', { name: 'Publicar reporte' }) as HTMLButtonElement).disabled,
    true,
  );
  report = { ...report, status: 'published', version: 'version-two' };
  await user.click(screen.getByRole('button', { name: 'Cargar versión actual' }));
  await screen.findByRole('button', { name: 'Marcar como resuelto' });
  assert.equal(
    (screen.getByRole('textbox', { name: /Nota de revisión/ }) as HTMLTextAreaElement).value,
    '',
  );
});

test('private photos are fetched without caching and their object URLs are revoked on close', async () => {
  report.hasPhoto = true;
  await openReport();
  await screen.findByRole('img', {
    name: 'Evidencia enviada por la comunidad para esta aportación',
  });
  const photo = requests.find((item) => item.path.endsWith('/photo'))!;
  assert.equal(photo.options?.cache, 'no-store');
  assert.equal(photo.options?.credentials, 'same-origin');
  await user.click(screen.getByRole('button', { name: 'Cerrar revisión' }));
  assert.deepEqual(revoked, ['blob:private-evidence']);
});

test('logout clears private evidence even when server revocation cannot be confirmed', async () => {
  report.hasPhoto = true;
  overrides = async (path) => {
    if (path.endsWith('/sign-out')) throw new TypeError('offline');
    return undefined;
  };
  await openReport();
  await screen.findByRole('img', {
    name: 'Evidencia enviada por la comunidad para esta aportación',
  });
  await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByText(/El cierre en el servidor no quedó confirmado/);
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(screen.queryByRole('heading', { name: 'Bandeja de revisión' }), null);
  assert.deepEqual(revoked, ['blob:private-evidence']);
});

test('disabled administration explains server provisioning rather than offering an unusable login', async () => {
  overrides = async (path) =>
    path === '/api/admin/session'
      ? Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      : undefined;
  render(<AdminApp />);
  await screen.findByRole('heading', { name: 'Administración sin habilitar' });
  assert.equal(screen.queryByRole('textbox', { name: 'Correo' }), null);
});

test('expired sessions discard private views and return to login', async () => {
  overrides = async (path) =>
    path.endsWith('/report-1')
      ? Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      : undefined;
  render(<AdminApp />);
  await user.click(await screen.findByRole('button', { name: 'Revisar: Falta una banca' }));
  await screen.findByRole('textbox', { name: 'Correo' });
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(screen.queryByRole('heading', { name: 'Bandeja de revisión' }), null);
});

test('network failure in the inbox is recoverable without discarding the session', async () => {
  let fail = true;
  overrides = async (path) => {
    if (fail && path.startsWith('/api/admin/reports?')) throw new TypeError('offline');
    return undefined;
  };
  render(<AdminApp />);
  await screen.findByRole('button', { name: 'Reintentar bandeja' });
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar bandeja' }));
  await screen.findByRole('button', { name: 'Revisar: Falta una banca' });
  assert.ok(screen.getByRole('button', { name: 'Cerrar sesión' }));
});

test('destinations use catalog names and a bounded dashboard states how many groups are omitted', async () => {
  report.stationName = 'Padre Mier';
  overrides = async (path) =>
    path === '/api/admin/dashboard'
      ? Response.json({
          ...dashboard,
          targets: [
            {
              targetType: 'route',
              stationId: null,
              routeId: 'internal-route-id',
              routeName: 'Transmetro · Talleres – Cabezada',
              count: 7,
              pending: 3,
              published: 2,
              resolved: 1,
              rejected: 1,
            },
          ],
          targetGroupsTotal: 150,
          targetsTruncated: true,
        })
      : undefined;
  render(<AdminApp />);
  await screen.findByText('Estación · Padre Mier');
  await user.click(screen.getByText('Consultar distribución por estación o ruta'));
  await screen.findByRole('rowheader', {
    name: 'Ruta o parada · Transmetro · Talleres – Cabezada',
  });
  assert.match(screen.getByRole('table').textContent || '', /1 destinos con más reportes de 150/);
  assert.match(screen.getByRole('table').textContent || '', /indicadores generales incluyen todos/);
  assert.equal(screen.queryByText(/internal-route-id/), null);
});

test('an incorrect enrollment code preserves recovery material so verification can be retried', async () => {
  currentSession = {
    ...session(),
    mfaRequired: true,
    user: { ...session().user, twoFactorEnabled: false },
  };
  let attempts = 0;
  overrides = async (path) => {
    if (path.endsWith('/enable'))
      return Response.json({
        totpURI: 'otpauth://totp/RegioMovil?secret=SECRETEXAMPLE',
        backupCodes: ['private-recovery'],
      });
    if (path.endsWith('/verify-totp')) {
      attempts += 1;
      if (attempts === 1) return Response.json({ error: { code: 'AUTH_FAILED' } }, { status: 401 });
      currentSession = session();
      return Response.json({ success: true });
    }
    return undefined;
  };
  render(<AdminApp />);
  await user.type(await screen.findByLabelText('Confirma tu contraseña'), 'Long password example!');
  await user.click(screen.getByRole('button', { name: 'Configurar segundo factor' }));
  await screen.findByText('private-recovery');
  await user.click(
    screen.getByRole('checkbox', { name: 'He guardado los códigos de recuperación' }),
  );
  await user.type(screen.getByRole('textbox', { name: 'Código de autenticación' }), '111111');
  await user.click(screen.getByRole('button', { name: 'Activar y continuar' }));
  await screen.findByText(/No pudimos validar tu acceso/);
  assert.ok(screen.getByText('private-recovery'));
  assert.equal(
    requests.some((item) => item.path === '/api/admin/dashboard'),
    false,
  );
  await user.type(screen.getByRole('textbox', { name: 'Código de autenticación' }), '123456');
  await user.click(screen.getByRole('button', { name: 'Activar y continuar' }));
  await screen.findByRole('heading', { name: 'Bandeja de revisión' });
  assert.equal(screen.queryByText('private-recovery'), null);
});

test('logout refreshes its CSRF proof after enrollment rotated the session cookie', async () => {
  currentSession = {
    ...session(),
    mfaRequired: true,
    user: { ...session().user, twoFactorEnabled: false },
  };
  overrides = async (path) => {
    if (path.endsWith('/enable')) {
      currentSession = { ...currentSession!, csrfToken: 'rotated-csrf' };
      return Response.json({
        totpURI: 'otpauth://totp/Test?secret=SECRET',
        backupCodes: ['private-code'],
      });
    }
    return undefined;
  };
  render(<AdminApp />);
  await user.type(await screen.findByLabelText('Confirma tu contraseña'), 'Long password example!');
  await user.click(screen.getByRole('button', { name: 'Configurar segundo factor' }));
  await screen.findByText('private-code');
  await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() => assert.ok(requests.some((item) => item.path.endsWith('/sign-out'))));
  const signOut = requests.find((item) => item.path.endsWith('/sign-out'))!;
  assert.equal(
    (signOut.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'rotated-csrf',
  );
  assert.equal(screen.queryByText('private-code'), null);
});

test('login can recover after offline logout leaves an authenticated server cookie', async () => {
  let offline = true;
  overrides = async (path) => {
    if (offline && path.endsWith('/sign-out')) throw new TypeError('offline');
    return undefined;
  };
  render(<AdminApp />);
  await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByText(/El cierre en el servidor no quedó confirmado/);
  offline = false;
  currentSession = { ...session(), csrfToken: 'existing-server-cookie-proof' };
  await user.type(screen.getByRole('textbox', { name: 'Correo' }), 'review@example.org');
  await user.type(screen.getByLabelText('Contraseña'), 'Long password example!');
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
  await screen.findByRole('heading', { name: 'Bandeja de revisión' });
  const signIn = requests.find((item) => item.path.endsWith('/sign-in/email'))!;
  assert.equal(
    (signIn.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'existing-server-cookie-proof',
  );
});

test('a late moderation response cannot affect a view after logout', async () => {
  let finish: (response: Response) => void = () =>
    assert.fail('moderation request was not started');
  overrides = async (path) => {
    if (path.endsWith('/moderate'))
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return undefined;
  };
  await openReport();
  await preparePublish();
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }));
  await waitFor(() => assert.ok(requests.some((item) => item.path.endsWith('/moderate'))));
  const mutation = requests.find((item) => item.path.endsWith('/moderate'))!;
  await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('textbox', { name: 'Correo' });
  assert.equal(mutation.options?.signal?.aborted, true);
  await act(async () => finish(Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })));
  assert.equal(screen.queryByText(/Tu acceso no permite/), null);
  assert.equal(screen.queryByRole('dialog'), null);
});

test('an empty last page after review returns to a valid page rather than displaying an inverted range', async () => {
  let reduced = false;
  overrides = async (path) => {
    if (!path.startsWith('/api/admin/reports?')) return undefined;
    const offset = Number(new URL(path, 'http://localhost').searchParams.get('offset'));
    return Response.json({
      reports: reduced && offset === 20 ? [] : [report],
      total: reduced ? 20 : 21,
      limit: 20,
      offset,
    });
  };
  render(<AdminApp />);
  await screen.findByRole('button', { name: 'Revisar: Falta una banca' });
  await user.click(screen.getByRole('button', { name: 'Siguientes' }));
  await screen.findByText('21–21 de 21 reportes');
  reduced = true;
  await user.click(screen.getByRole('button', { name: 'Actualizar indicadores' }));
  await screen.findByText('1–1 de 20 reportes');
  assert.equal(screen.queryByText('21–20 de 20 reportes'), null);
});
