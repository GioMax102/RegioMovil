import { createAdminAuth } from './admin-auth.mjs';
import { REPORT_CATEGORIES } from './storage.mjs';

const AUTH_PATHS = new Map([
  ['/sign-in/email', ['email', 'password']],
  ['/sign-out', []],
  ['/two-factor/enable', ['password', 'method']],
  ['/two-factor/verify-totp', ['code']],
  ['/two-factor/verify-backup-code', ['code']],
]);
const PRIVATE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export { PRIVATE_CSP as ADMIN_CONTENT_SECURITY_POLICY };

function webHeaders(request) {
  const headers = new Headers();
  // Forward cookies and protocol metadata only. Never trust client IP forwarding.
  for (const name of ['cookie', 'origin', 'content-type', 'sec-fetch-site', 'user-agent']) {
    if (typeof request.headers[name] === 'string') headers.set(name, request.headers[name]);
  }
  headers.set('x-regiomovil-socket-ip', request.socket.remoteAddress || '127.0.0.1');
  return headers;
}
function sessionHeaders(request, result) {
  const headers = webHeaders(request);
  const cookies = new Map(
    String(headers.get('cookie') || '')
      .split(';')
      .map((part) => part.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([key]) => key),
  );
  for (const cookie of result.headers.getSetCookie()) {
    const [key, value] = cookie.split(';')[0].split(/=(.*)/s);
    cookies.set(key, value);
  }
  headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '));
  return headers;
}

export function createAdminRouter({
  options,
  store,
  network,
  catalog,
  readJson,
  send,
  HttpError,
  limit,
}) {
  const authentication = options ? createAdminAuth(options) : null;
  const fail = (status, code, message) => {
    throw new HttpError(status, code, message);
  };
  const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    twoFactorEnabled: !!user.twoFactorEnabled,
  });
  const stationNames = new Map(network.stations.map((station) => [station.id, station.name]));
  const routeNames = new Map(catalog.routes.map((route) => [route.id, route.name]));
  const identifyTarget = (item) => ({
    ...item,
    stationName: stationNames.get(item.stationId) || null,
    routeName: routeNames.get(item.routeId) || null,
  });
  const strictObject = (body, keys) => {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !keys.includes(key))
    )
      fail(400, 'INVALID_ADMIN_INPUT', 'La solicitud contiene campos no permitidos.');
  };
  async function freshSession(request, headers, previous, moderation = false) {
    const live = await authentication.session(headers);
    if (!live || live.session.id !== previous.session.id)
      fail(401, 'UNAUTHORIZED', 'La sesión terminó. Vuelve a ingresar.');
    if (!authentication.validCsrf(live, request.headers['x-csrf-token']))
      fail(403, 'CSRF_INVALID', 'Actualiza la sesión e intenta de nuevo.');
    if (moderation && !authentication.mfaVerified(live))
      fail(403, 'MFA_REQUIRED', 'Verifica tu autenticador para continuar.');
    if (moderation && !['moderator', 'admin'].includes(live.user.role))
      fail(403, 'FORBIDDEN', 'El acceso actual no permite moderar.');
    return live;
  }
  async function handle(request, response, url, date) {
    if (!url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin') return false;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', PRIVATE_CSP);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!authentication) fail(404, 'NOT_FOUND', 'No encontramos ese recurso.');
    await authentication.ready;
    if (url.search && !url.pathname.endsWith('/reports'))
      fail(400, 'INVALID_ADMIN_INPUT', 'Esta operación no acepta parámetros de consulta.');
    const origin = request.headers.origin;
    if (
      (origin && origin !== authentication.origin) ||
      ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site'])
    )
      fail(403, 'ORIGIN_NOT_ALLOWED', 'Usa la administración desde su dirección autorizada.');
    if (!['GET', 'POST'].includes(request.method))
      fail(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
    if (request.method === 'POST' && origin !== authentication.origin)
      fail(403, 'ORIGIN_REQUIRED', 'La solicitud requiere el origen autorizado.');
    limit(request, 'admin', 90, date);
    const headers = webHeaders(request);
    const current = await authentication.session(headers);
    const authPath = url.pathname.startsWith('/api/admin/auth/')
      ? url.pathname.slice('/api/admin/auth'.length)
      : null;
    if (authPath !== null) {
      if (!AUTH_PATHS.has(authPath)) fail(404, 'NOT_FOUND', 'No encontramos ese recurso.');
      if (request.method !== 'POST')
        fail(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
      limit(
        request,
        authPath === '/sign-in/email' ? 'admin-login' : 'admin-factor',
        authPath === '/sign-in/email' ? 5 : 10,
        date,
      );
      const body = await readJson(request, 'la solicitud administrativa', 2048);
      strictObject(body, AUTH_PATHS.get(authPath));
      const live = current ? await freshSession(request, headers, current) : null;
      if (authPath === '/two-factor/enable' && !current)
        fail(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
      if (
        authPath === '/two-factor/enable' &&
        live.user.twoFactorEnabled &&
        !authentication.mfaVerified(live)
      )
        fail(
          403,
          'MFA_REQUIRED',
          'Verifica tu segundo factor antes de administrar el autenticador.',
        );
      if (
        authPath === '/sign-in/email' &&
        (typeof body.email !== 'string' ||
          body.email.length > 254 ||
          typeof body.password !== 'string' ||
          body.password.length > 128)
      )
        fail(400, 'INVALID_ADMIN_INPUT', 'Comprueba el correo y la contraseña.');
      if (
        authPath.startsWith('/two-factor/verify-') &&
        (typeof body.code !== 'string' || body.code.length > 30)
      )
        fail(400, 'INVALID_ADMIN_INPUT', 'Introduce un código válido.');
      if (
        authPath === '/two-factor/enable' &&
        (typeof body.password !== 'string' ||
          body.password.length > 128 ||
          (body.method !== undefined && body.method !== 'totp'))
      )
        fail(400, 'INVALID_ADMIN_INPUT', 'Confirma tu contraseña para configurar el autenticador.');
      const accessRevision = authentication.accessRevision();
      const result = await authentication.auth.handler(
        new Request(`${authentication.origin}${url.pathname}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
      );
      let payload;
      try {
        payload = await result.json();
      } catch {
        payload = {};
      }
      if (!result.ok) {
        if (authPath === '/sign-in/email') authentication.audit(null, 'sign_in_failed');
        const status = result.status === 429 ? 429 : result.status >= 500 ? 503 : 401;
        fail(
          status,
          status === 429 ? 'RATE_LIMITED' : 'AUTH_FAILED',
          'No fue posible verificar el acceso. Revisa tus datos e intenta de nuevo.',
        );
      }
      const resultingSession = await authentication.session(sessionHeaders(request, result));
      // Password verification can be in flight while the host revokes access.
      // Compare after the last asynchronous read and never forward its cookies
      // when an administrative access change has committed in the meantime.
      if (accessRevision !== authentication.accessRevision()) {
        if (resultingSession) authentication.revokeSession(resultingSession.session.id);
        fail(401, 'UNAUTHORIZED', 'El acceso cambió durante la verificación. Vuelve a ingresar.');
      }
      // Do not expose Better Auth's bearer token in JSON. Authentication stays cookie-only.
      if (authPath.startsWith('/two-factor/verify-')) {
        if (!resultingSession) fail(401, 'AUTH_FAILED', 'No fue posible verificar el acceso.');
        authentication.confirmMfa(resultingSession);
      }
      if (result.headers.getSetCookie().length)
        response.setHeader('Set-Cookie', result.headers.getSetCookie());
      if (authPath === '/sign-in/email')
        authentication.audit(
          payload?.user?.id || null,
          payload.twoFactorRedirect ? 'mfa_challenge_issued' : 'password_verified',
        );
      if (authPath === '/sign-out' && current) authentication.audit(current.user.id, 'signed_out');
      send(
        response,
        200,
        authPath === '/two-factor/enable'
          ? { totpURI: payload.totpURI, backupCodes: payload.backupCodes }
          : payload.twoFactorRedirect
            ? { twoFactorRedirect: true }
            : { status: true },
      );
      return true;
    }
    if (!current) fail(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
    if (url.pathname === '/api/admin/session') {
      if (request.method !== 'GET')
        fail(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
      send(response, 200, {
        user: publicUser(current.user),
        csrfToken: authentication.csrfToken(current),
        mfaRequired: !authentication.mfaVerified(current),
        expiresAt: current.session.expiresAt,
      });
      return true;
    }
    if (!authentication.mfaVerified(current))
      fail(403, 'MFA_REQUIRED', 'Configura y verifica tu autenticador para continuar.');
    if (
      request.method === 'POST' &&
      !authentication.validCsrf(current, request.headers['x-csrf-token'])
    )
      fail(403, 'CSRF_INVALID', 'Actualiza la sesión e intenta de nuevo.');
    if (url.pathname === '/api/admin/dashboard') {
      if (request.method !== 'GET')
        fail(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
      const dashboard = store.adminDashboard(date);
      send(response, 200, { ...dashboard, targets: dashboard.targets.map(identifyTarget) });
      return true;
    }
    if (!['moderator', 'admin'].includes(current.user.role))
      fail(403, 'FORBIDDEN', 'Tu rol permite consultar indicadores agregados.');
    if (url.pathname === '/api/admin/reports') {
      if (request.method !== 'GET')
        fail(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
      const allowed = [
        'status',
        'category',
        'targetType',
        'stationId',
        'routeId',
        'limit',
        'offset',
      ];
      for (const key of url.searchParams.keys())
        if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
          fail(400, 'INVALID_ADMIN_FILTER', 'Los filtros no son válidos.');
      const filters = Object.fromEntries(url.searchParams);
      if (
        filters.status !== undefined &&
        !['all', 'pending', 'published', 'resolved', 'rejected'].includes(filters.status)
      )
        fail(400, 'INVALID_ADMIN_FILTER', 'El estado no es válido.');
      if (filters.category !== undefined && !REPORT_CATEGORIES.includes(filters.category))
        fail(400, 'INVALID_ADMIN_FILTER', 'La categoría no es válida.');
      if (
        filters.targetType !== undefined &&
        !['station', 'route', 'unit'].includes(filters.targetType)
      )
        fail(400, 'INVALID_ADMIN_FILTER', 'El tipo de reporte no es válido.');
      if (
        filters.stationId !== undefined &&
        !network.stations.some((station) => station.id === filters.stationId)
      )
        fail(400, 'INVALID_ADMIN_FILTER', 'La estación no es válida.');
      if (
        filters.routeId !== undefined &&
        !catalog.routes.some((route) => route.id === filters.routeId)
      )
        fail(400, 'INVALID_ADMIN_FILTER', 'El recorrido no es válido.');
      for (const key of ['limit', 'offset'])
        if (filters[key] !== undefined) {
          if (!/^\d{1,6}$/.test(filters[key]))
            fail(400, 'INVALID_ADMIN_FILTER', 'La paginación no es válida.');
          filters[key] = Number(filters[key]);
        }
      if (
        (filters.limit !== undefined && (filters.limit < 1 || filters.limit > 100)) ||
        (filters.offset !== undefined && filters.offset > 5000)
      )
        fail(400, 'INVALID_ADMIN_FILTER', 'La paginación no es válida.');
      const page = store.adminList(filters, date);
      send(response, 200, { ...page, reports: page.reports.map(identifyTarget) });
      return true;
    }
    const match = url.pathname.match(
      /^\/api\/admin\/reports\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(photo|moderate))?$/i,
    );
    if (!match) fail(404, 'NOT_FOUND', 'No encontramos ese recurso.');
    const [, id, operation] = match;
    if ((operation === 'moderate' ? 'POST' : 'GET') !== request.method)
      fail(405, 'METHOD_NOT_ALLOWED', 'Ese método no está disponible.');
    const report = store.adminDetail(id, date);
    if (!report) fail(404, 'REPORT_NOT_FOUND', 'El reporte no está disponible.');
    if (!operation) {
      authentication.audit(current.user.id, 'private_report_viewed', id);
      send(response, 200, { report: identifyTarget(report) });
      return true;
    }
    if (operation === 'photo') {
      const photo = store.adminPhoto(id, date);
      if (!photo) fail(404, 'PHOTO_NOT_FOUND', 'El reporte no tiene una foto disponible.');
      authentication.audit(current.user.id, 'private_photo_viewed', id);
      response.writeHead(200, {
        'Content-Type': photo.mime,
        'Content-Length': photo.data.length,
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(photo.data);
      return true;
    }
    const body = await readJson(request, 'la revisión', 2048);
    const live = await freshSession(request, headers, current, true);
    strictObject(body, ['action', 'note', 'reviewed', 'expectedVersion', 'expectedStatus']);
    if (
      !['publish', 'reject', 'resolve', 'unpublish'].includes(body.action) ||
      typeof body.expectedVersion !== 'string' ||
      !/^(pending|published|resolved|rejected):\d{1,20}$/.test(body.expectedVersion) ||
      !['pending', 'published', 'resolved', 'rejected'].includes(body.expectedStatus) ||
      !body.expectedVersion.startsWith(`${body.expectedStatus}:`) ||
      typeof body.reviewed !== 'boolean' ||
      typeof body.note !== 'string' ||
      body.note.length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.note)
    )
      fail(400, 'INVALID_MODERATION', 'Comprueba la acción y la nota de revisión.');
    if (body.action === 'publish' && (!body.reviewed || !report.publicationConsent))
      fail(
        409,
        'PUBLICATION_NOT_ALLOWED',
        'Publicar requiere consentimiento y revisión del texto y la foto.',
      );
    if (body.action !== 'publish' && !body.note.trim())
      fail(
        400,
        'MODERATION_REASON_REQUIRED',
        'Describe el motivo de la decisión para conservar una revisión trazable.',
      );
    const changed = store.moderate(
      id,
      body.action,
      {
        reviewer: live.user.id,
        note: body.note,
        reviewed: body.reviewed,
        expectedVersion: body.expectedVersion,
        expectedStatus: body.expectedStatus,
      },
      date,
    );
    if (!changed)
      fail(
        409,
        'REPORT_CONFLICT',
        'El reporte cambió o la transición no está permitida. Actualiza el detalle.',
      );
    send(response, 200, { report: identifyTarget(store.adminDetail(id, date)) });
    return true;
  }
  return {
    handle,
    authentication,
    ready: authentication?.ready || Promise.resolve(),
    close: () => authentication?.close(),
  };
}
