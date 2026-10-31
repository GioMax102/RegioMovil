import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { createAdminAuth, adminOptionsFromEnv } from '../server/admin-auth.mjs';

const origin = 'http://localhost:3001';
const secret = 'testing-administration-secret-at-least-thirty-two-bytes';
const options = { origin, secret, allowInsecureLocalhost: true };
const network = {
  stations: [
    { id: 'a', name: 'A', lat: 25.67, lng: -100.32 },
    { id: 'b', name: 'B', lat: 25.68, lng: -100.32 },
  ],
  lines: [{ id: 'L1', name: 'Línea 1', stationIds: ['a', 'b'] }],
};
const password = 'correct horse battery staple';
function totp(uri) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const encoded = new URL(uri).searchParams.get('secret').replace(/=+$/, '');
  let bits = '';
  for (const character of encoded.toUpperCase())
    bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function fixture(t, { adminOptions = options, ...appOptions } = {}) {
  const app = createApp({ network, adminOptions, ...appOptions });
  await app.ready;
  t.after(() => app.close());
  function client() {
    const cookies = new Map();
    let csrfToken;
    return {
      cookies,
      async request(
        path,
        { method = 'GET', body, headers = {}, sendOrigin = method === 'POST', csrf = true } = {},
      ) {
        const incoming = Readable.from(
          body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
        );
        Object.assign(incoming, {
          url: path,
          method,
          headers: {
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(sendOrigin ? { origin } : {}),
            cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
            ...(csrfToken && csrf ? { 'x-csrf-token': csrfToken } : {}),
            ...headers,
          },
          socket: { remoteAddress: '127.0.0.1' },
        });
        const responseHeaders = new Map();
        let status;
        let payload;
        const response = {
          headersSent: false,
          setHeader(name, value) {
            responseHeaders.set(name.toLowerCase(), value);
          },
          writeHead(code, values) {
            status = code;
            for (const [name, value] of Object.entries(values))
              responseHeaders.set(name.toLowerCase(), value);
            this.headersSent = true;
          },
          end(value = '') {
            payload = value;
          },
        };
        await app.handler(incoming, response);
        const setCookies = responseHeaders.get('set-cookie') || [];
        for (const cookie of typeof setCookies === 'string' ? [setCookies] : setCookies) {
          const [name, value] = cookie.split(';')[0].split(/=(.*)/s);
          if (!value || /max-age=0(?:;|$)/i.test(cookie)) cookies.delete(name);
          else cookies.set(name, value);
        }
        const result = {
          status,
          headers: responseHeaders,
          body:
            payload && String(responseHeaders.get('content-type')).includes('application/json')
              ? JSON.parse(payload)
              : payload,
          setCookies,
        };
        if (path === '/api/admin/session' && result.body.csrfToken)
          csrfToken = result.body.csrfToken;
        return result;
      },
      async login(email) {
        const result = await this.request('/api/admin/auth/sign-in/email', {
          method: 'POST',
          body: { email, password },
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return result;
      },
      async enroll(email) {
        await this.login(email);
        let current = await this.request('/api/admin/session');
        assert.equal(current.body.mfaRequired, true);
        const enabled = await this.request('/api/admin/auth/two-factor/enable', {
          method: 'POST',
          body: { password, method: 'totp' },
        });
        assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
        assert.ok(enabled.body.backupCodes.length);
        // Enabling 2FA may rotate the session and CSRF binding.
        current = await this.request('/api/admin/session');
        const verified = await this.request('/api/admin/auth/two-factor/verify-totp', {
          method: 'POST',
          body: { code: totp(enabled.body.totpURI) },
        });
        assert.equal(verified.status, 200, JSON.stringify(verified.body));
        current = await this.request('/api/admin/session');
        assert.equal(current.body.mfaRequired, false);
        return enabled.body;
      },
    };
  }
  return {
    app,
    client,
    async user(role, email = `${role}@example.com`) {
      return app.admin.provision({ email, name: role, role, password });
    },
  };
}

test('administration is disabled by default and rejects unsafe configuration', async (t) => {
  assert.equal(adminOptionsFromEnv({}), null);
  assert.equal(adminOptionsFromEnv({ ADMIN_ENABLED: 'false' }), null);
  assert.throws(
    () =>
      adminOptionsFromEnv({
        ADMIN_ENABLED: 'true',
        NODE_ENV: 'production',
        ADMIN_ALLOW_INSECURE_LOCALHOST: 'true',
      }),
    /forbidden in production/,
  );
  const f = await fixture(t, { adminOptions: null });
  assert.equal((await f.client().request('/api/admin/session')).status, 404);
  assert.throws(
    () => createAdminAuth({ origin: 'http://example.com', secret, allowInsecureLocalhost: true }),
    /HTTPS/,
  );
  assert.throws(() => createAdminAuth({ origin: 'http://localhost', secret }), /HTTPS/);
  assert.throws(
    () => createAdminAuth({ origin: 'https://admin.example.com/', secret }),
    /exact origin/,
  );
  assert.throws(
    () => createAdminAuth({ origin: 'https://admin.example.com', secret: 'short' }),
    /32 random bytes/,
  );
});

test('cookie-only authentication requires MFA, logs out and revokes live sessions', async (t) => {
  const f = await fixture(t);
  await f.user('admin');
  const admin = f.client();
  assert.equal((await admin.request('/api/admin/dashboard')).status, 401);
  const signedIn = await admin.login('admin@example.com');
  assert.equal(signedIn.body.token, undefined);
  assert.ok(
    signedIn.setCookies.some(
      (cookie) =>
        /HttpOnly/i.test(cookie) &&
        /SameSite=Strict/i.test(cookie) &&
        /Path=\/api\/admin/i.test(cookie),
    ),
  );
  assert.equal((await admin.request('/api/admin/dashboard')).body.error.code, 'MFA_REQUIRED');
  // This password-only session must not gain privileges when another session enrolls.
  const passwordOnly = f.client();
  await passwordOnly.login('admin@example.com');
  const enrolled = await admin.request('/api/admin/session');
  const enabled = await admin.request('/api/admin/auth/two-factor/enable', {
    method: 'POST',
    body: { password, method: 'totp' },
  });
  assert.equal(enabled.status, 200);
  await admin.request('/api/admin/session');
  const verify = await admin.request('/api/admin/auth/two-factor/verify-totp', {
    method: 'POST',
    body: { code: totp(enabled.body.totpURI) },
  });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.equal((await admin.request('/api/admin/session')).body.mfaRequired, false);
  assert.equal((await passwordOnly.request('/api/admin/dashboard')).status, 403);
  await passwordOnly.request('/api/admin/session');
  assert.equal(
    (
      await passwordOnly.request('/api/admin/auth/two-factor/enable', {
        method: 'POST',
        body: { password, method: 'totp' },
      })
    ).body.error.code,
    'MFA_REQUIRED',
  );
  const dashboard = await admin.request('/api/admin/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get('cache-control'), 'no-store');
  assert.equal(
    (await admin.request('/api/admin/auth/sign-out', { method: 'POST', body: {} })).status,
    200,
  );
  assert.equal((await admin.request('/api/admin/session')).status, 401);
  const loginAgain = f.client();
  assert.equal((await loginAgain.login('admin@example.com')).body.twoFactorRedirect, true);
  assert.equal((await loginAgain.request('/api/admin/session')).status, 401);
  assert.equal(
    (
      await loginAgain.request('/api/admin/auth/two-factor/verify-backup-code', {
        method: 'POST',
        body: { code: enabled.body.backupCodes[0] },
      })
    ).status,
    200,
  );
  assert.equal((await loginAgain.request('/api/admin/dashboard')).status, 200);
  const unfinished = f.client();
  await unfinished.login('admin@example.com');
  await f.app.admin.changeAccess('admin@example.com', { disabled: true });
  assert.equal((await loginAgain.request('/api/admin/dashboard')).status, 401);
  await f.app.admin.changeAccess('admin@example.com', { disabled: false });
  assert.equal(
    (
      await unfinished.request('/api/admin/auth/two-factor/verify-backup-code', {
        method: 'POST',
        body: { code: enabled.body.backupCodes[1] },
      })
    ).status,
    401,
  );
  assert.ok(
    f.app.admin.db
      .prepare('SELECT action FROM admin_access_events WHERE action = ?')
      .get('access_changed_and_sessions_revoked'),
  );
});

test('admin mutations require exact Origin, CSRF and restricted endpoint/body allowlists', async (t) => {
  const f = await fixture(t);
  await f.user('moderator');
  const moderator = f.client();
  await moderator.enroll('moderator@example.com');
  for (const headers of [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    assert.equal(
      (await moderator.request('/api/admin/auth/sign-out', { method: 'POST', body: {}, headers }))
        .status,
      403,
    );
  }
  assert.equal(
    (
      await moderator.request('/api/admin/auth/sign-out', {
        method: 'POST',
        body: {},
        sendOrigin: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (await moderator.request('/api/admin/auth/sign-out', { method: 'POST', body: {}, csrf: false }))
      .body.error.code,
    'CSRF_INVALID',
  );
  assert.equal(
    (await moderator.request('/api/admin/auth/sign-up/email', { method: 'POST', body: {} })).status,
    404,
  );
  assert.equal(
    (
      await moderator.request('/api/admin/auth/two-factor/disable', {
        method: 'POST',
        body: { password },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await moderator.request('/api/admin/auth/sign-in/email', {
        method: 'POST',
        body: { email: 'moderator@example.com', password, callbackURL: 'https://evil.example' },
      })
    ).status,
    400,
  );
  assert.equal(
    (await moderator.request('/api/admin/reports?status=all&status=pending')).status,
    400,
  );
  assert.equal((await moderator.request('/api/admin/reports?offset=-1')).status, 400);
  assert.equal((await moderator.request('/api/admin/reports?limit=101')).status, 400);
  assert.equal((await moderator.request('/api/admin/dashboard?token=secret')).status, 400);
});

test('analyst sees aggregates but cannot read text, evidence or moderate; moderators use consent and optimistic revision', async (t) => {
  const f = await fixture(t);
  const report = f.app.store.add({
    stationId: 'a',
    category: 'infrastructure',
    title: 'Falta una banca',
    targetType: 'station',
    detail: 'No hay bancas en el andén.',
    publicationConsent: true,
  });
  const privateReport = f.app.store.add({
    stationId: 'a',
    category: 'condition',
    title: 'Un daño privado',
    targetType: 'station',
    detail: 'Observación sin consentimiento.',
    publicationConsent: false,
  });
  await f.user('analyst');
  await f.user('moderator');
  const analyst = f.client();
  await analyst.enroll('analyst@example.com');
  const dashboard = await analyst.request('/api/admin/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.counters.total, 2);
  assert.ok(!JSON.stringify(dashboard.body).includes('Un daño privado'));
  for (const path of [
    '/api/admin/reports',
    `/api/admin/reports/${report.id}`,
    `/api/admin/reports/${report.id}/photo`,
  ])
    assert.equal((await analyst.request(path)).status, 403);
  const moderator = f.client();
  await moderator.enroll('moderator@example.com');
  const list = await moderator.request('/api/admin/reports?status=all&limit=1&offset=0');
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.reports.length, 1);
  const detail = await moderator.request(`/api/admin/reports/${report.id}`);
  assert.equal(detail.body.report.photoData, undefined);
  assert.ok(detail.body.report.version);
  const input = {
    action: 'publish',
    reviewed: true,
    note: 'Revisión de contenido realizada.',
    expectedVersion: detail.body.report.version,
    expectedStatus: 'pending',
  };
  assert.equal(
    (
      await moderator.request(`/api/admin/reports/${report.id}/moderate`, {
        method: 'POST',
        body: { ...input, reviewer: 'spoofed' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await moderator.request(`/api/admin/reports/${report.id}/moderate`, {
        method: 'POST',
        body: input,
        csrf: false,
      })
    ).status,
    403,
  );
  const changed = await moderator.request(`/api/admin/reports/${report.id}/moderate`, {
    method: 'POST',
    body: input,
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.report.status, 'published');
  assert.equal(
    changed.body.report.history[0].reviewer,
    (await moderator.request('/api/admin/session')).body.user.id,
  );
  assert.equal(
    (
      await moderator.request(`/api/admin/reports/${report.id}/moderate`, {
        method: 'POST',
        body: input,
      })
    ).status,
    409,
  );
  const withoutConsent = await moderator.request(`/api/admin/reports/${privateReport.id}`);
  assert.equal(
    (
      await moderator.request(`/api/admin/reports/${privateReport.id}/moderate`, {
        method: 'POST',
        body: { ...input, expectedVersion: withoutConsent.body.report.version },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await moderator.request(`/api/admin/reports/${report.id}/moderate`, {
        method: 'POST',
        body: {
          action: 'resolve',
          reviewed: false,
          note: '',
          expectedVersion: changed.body.report.version,
          expectedStatus: 'published',
        },
      })
    ).status,
    400,
  );
});

test('login rate limiting and secure production cookies are enforced without exposing secrets', async (t) => {
  const f = await fixture(t);
  await f.user('admin');
  const client = f.client();
  for (let count = 0; count < 5; count++) {
    const result = await client.request('/api/admin/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'incorrect password' },
    });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'AUTH_FAILED');
  }
  assert.equal(
    (
      await client.request('/api/admin/auth/sign-in/email', {
        method: 'POST',
        body: { email: 'admin@example.com', password },
      })
    ).status,
    429,
  );
  const production = createAdminAuth({ origin: 'https://admin.example.com', secret });
  await production.ready;
  t.after(() => production.close());
  await production.provision({
    email: 'secure@example.com',
    name: 'Secure',
    role: 'admin',
    password,
  });
  const response = await production.auth.handler(
    new Request('https://admin.example.com/api/admin/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: 'https://admin.example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'secure@example.com', password }),
    }),
  );
  assert.equal(response.status, 200);
  assert.ok(
    response.headers
      .getSetCookie()
      .some((cookie) => /; Secure/i.test(cookie) && /HttpOnly/i.test(cookie)),
  );
});

test('MFA lockout and expiry deny access; forged forwarding headers never change the authentication socket IP', async (t) => {
  const f = await fixture(t);
  await f.user('admin');
  const admin = f.client();
  const signedIn = await admin.request('/api/admin/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'admin@example.com', password },
    headers: {
      'x-regiomovil-socket-ip': '192.0.2.10',
      'x-forwarded-for': '198.51.100.9',
      'x-real-ip': '203.0.113.8',
    },
  });
  assert.equal(signedIn.status, 200);
  assert.equal(
    f.app.admin.db.prepare('SELECT ipAddress FROM session').get().ipAddress,
    '127.0.0.1',
  );
  const keys = f.app.admin.db.prepare('SELECT key FROM rateLimit').all();
  assert.ok(keys.length);
  assert.ok(keys.every((row) => !/192\.0\.2\.10|198\.51\.100\.9|203\.0\.113\.8/.test(row.key)));
  await admin.request('/api/admin/session');
  const setup = await admin.request('/api/admin/auth/two-factor/enable', {
    method: 'POST',
    body: { password, method: 'totp' },
  });
  await admin.request('/api/admin/session');
  assert.equal(
    (
      await admin.request('/api/admin/auth/two-factor/verify-totp', {
        method: 'POST',
        body: { code: totp(setup.body.totpURI) },
      })
    ).status,
    200,
  );
  assert.equal((await admin.request('/api/admin/session')).body.mfaRequired, false);
  f.app.admin.db.prepare('UPDATE session SET expiresAt = ?').run(Date.now() - 1000);
  assert.equal((await admin.request('/api/admin/dashboard')).status, 401);
  const challenge = f.client();
  await challenge.login('admin@example.com');
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = totp(setup.body.totpURI) === '000000' ? '111111' : '000000';
    assert.equal(
      (
        await challenge.request('/api/admin/auth/two-factor/verify-totp', {
          method: 'POST',
          body: { code },
        })
      ).status,
      401,
    );
  }
  assert.equal(
    (
      await challenge.request('/api/admin/auth/two-factor/verify-totp', {
        method: 'POST',
        body: { code: totp(setup.body.totpURI) },
      })
    ).status,
    429,
  );
  assert.equal((await challenge.request('/api/admin/dashboard')).status, 401);
});

test('authentication database is private and CLI access changes preserve credentials in Better Auth', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-admin-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'auth.sqlite');
  const auth = createAdminAuth({ ...options, databasePath: file });
  await auth.ready;
  t.after(() => auth.close());
  const user = await auth.provision({
    email: 'private@example.com',
    name: 'Private',
    role: 'moderator',
    password,
  });
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const account = auth.db.prepare('SELECT password FROM account WHERE userId = ?').get(user.id);
  assert.notEqual(account.password, password);
  assert.equal(
    await (await auth.ready).password.verify({ hash: account.password, password }),
    true,
  );
  await auth.changeAccess('private@example.com', {
    role: 'analyst',
    password: 'a replacement password phrase',
    resetMfa: true,
  });
  assert.equal(auth.db.prepare('SELECT role FROM user WHERE id = ?').get(user.id).role, 'analyst');
  assert.equal(
    await (
      await auth.ready
    ).password.verify({
      hash: auth.db.prepare('SELECT password FROM account WHERE userId = ?').get(user.id).password,
      password: 'a replacement password phrase',
    }),
    true,
  );
});

test('password reset revokes sessions created while Better Auth computes the replacement hash', async (t) => {
  const f = await fixture(t);
  await f.user('admin');
  const context = await f.app.admin.ready;
  const originalHash = context.password.hash;
  let enterHash, releaseHash;
  const hashing = new Promise((resolve) => {
    enterHash = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseHash = resolve;
  });
  t.after(() => {
    releaseHash();
    context.password.hash = originalHash;
  });
  context.password.hash = async (value) => {
    enterHash();
    await gate;
    return originalHash(value);
  };
  const reset = f.app.admin.changeAccess('admin@example.com', {
    password: 'a replacement password phrase',
  });
  await hashing;
  const concurrent = f.client();
  await concurrent.login('admin@example.com');
  assert.equal((await concurrent.request('/api/admin/session')).status, 200);
  releaseHash();
  await reset;
  assert.equal((await concurrent.request('/api/admin/session')).status, 401);
  assert.equal(f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
  const oldCredentials = f.client();
  assert.equal(
    (
      await oldCredentials.request('/api/admin/auth/sign-in/email', {
        method: 'POST',
        body: { email: 'admin@example.com', password },
      })
    ).status,
    401,
  );
  const replacement = f.client();
  assert.equal(
    (
      await replacement.request('/api/admin/auth/sign-in/email', {
        method: 'POST',
        body: { email: 'admin@example.com', password: 'a replacement password phrase' },
      })
    ).status,
    200,
  );
});

test('failed hashing and failed credential insertion never leave partially provisioned identities', async (t) => {
  const f = await fixture(t);
  const context = await f.app.admin.ready;
  const originalHash = context.password.hash;
  t.after(() => {
    context.password.hash = originalHash;
  });
  context.password.hash = async () => {
    throw new Error('Synthetic hashing failure.');
  };
  await assert.rejects(
    f.app.admin.provision({
      email: 'incomplete@example.com',
      name: 'Incomplete',
      role: 'admin',
      password,
    }),
    /Synthetic hashing failure/,
  );
  context.password.hash = originalHash;
  assert.equal(f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
  assert.equal(f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM account').get().count, 0);
  assert.equal(
    f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM admin_access_events').get().count,
    0,
  );
  f.app.admin.db.exec(
    "CREATE TRIGGER prevent_test_account BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'Synthetic account insertion failure.'); END",
  );
  await assert.rejects(
    f.app.admin.provision({
      email: 'incomplete@example.com',
      name: 'Incomplete',
      role: 'admin',
      password,
    }),
    /Synthetic account insertion failure/,
  );
  assert.equal(f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
  assert.equal(f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM account').get().count, 0);
  assert.equal(
    f.app.admin.db.prepare('SELECT COUNT(*) AS count FROM admin_access_events').get().count,
    0,
  );
  f.app.admin.db.exec('DROP TRIGGER prevent_test_account');
  await f.app.admin.provision({
    email: 'incomplete@example.com',
    name: 'Complete',
    role: 'admin',
    password,
  });
  assert.equal((await f.client().login('incomplete@example.com')).status, 200);
});

test('failed credential updates preserve the previous access and session atomically', async (t) => {
  const f = await fixture(t);
  await f.user('admin');
  const client = f.client();
  await client.login('admin@example.com');
  const previousRevision = f.app.admin.accessRevision();
  f.app.admin.db.exec(
    "CREATE TRIGGER prevent_test_password BEFORE UPDATE OF password ON account BEGIN SELECT RAISE(ABORT, 'Synthetic credential update failure.'); END",
  );
  await assert.rejects(
    f.app.admin.changeAccess('admin@example.com', {
      disabled: true,
      role: 'analyst',
      password: 'a replacement password phrase',
    }),
    /Synthetic credential update failure/,
  );
  assert.equal((await client.request('/api/admin/session')).body.user.role, 'admin');
  assert.equal(f.app.admin.db.prepare('SELECT disabled FROM user').get().disabled, 0);
  assert.equal(
    f.app.admin.db
      .prepare("SELECT COUNT(*) AS count FROM admin_access_events WHERE action LIKE '%revoked'")
      .get().count,
    0,
  );
  assert.equal(f.app.admin.accessRevision(), previousRevision);
});

test('access revision is shared with another CLI connection and exact-session revocation preserves other sessions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-admin-revision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'auth.sqlite');
  const serverAuth = createAdminAuth({ ...options, databasePath: file });
  await serverAuth.ready;
  t.after(() => serverAuth.close());
  const user = await serverAuth.provision({
    email: 'revision@example.com',
    name: 'Revision',
    role: 'moderator',
    password,
  });
  const previousRevision = serverAuth.accessRevision();
  const cliAuth = createAdminAuth({ ...options, databasePath: file });
  await cliAuth.ready;
  t.after(() => cliAuth.close());
  await cliAuth.changeAccess(user.email, { role: 'analyst' });
  assert.equal(serverAuth.accessRevision(), previousRevision + 1);
  const context = await serverAuth.ready;
  const first = await context.internalAdapter.createSession(user.id, false);
  const second = await context.internalAdapter.createSession(user.id, false);
  for (const session of [first, second])
    serverAuth.db
      .prepare('INSERT INTO admin_session_assurance(session_id,expires_at) VALUES (?,?)')
      .run(session.id, Date.now() + 60000);
  assert.equal(serverAuth.revokeSession(first.id), true);
  assert.equal(
    serverAuth.db.prepare('SELECT id FROM session WHERE id = ?').get(first.id),
    undefined,
  );
  assert.equal(
    serverAuth.db
      .prepare('SELECT session_id FROM admin_session_assurance WHERE session_id = ?')
      .get(first.id),
    undefined,
  );
  assert.ok(serverAuth.db.prepare('SELECT id FROM session WHERE id = ?').get(second.id));
  assert.ok(
    serverAuth.db
      .prepare('SELECT session_id FROM admin_session_assurance WHERE session_id = ?')
      .get(second.id),
  );
  assert.equal(serverAuth.accessRevision(), previousRevision + 1);
});

test('private report photos require a moderator session and never enter public responses before review', async (t) => {
  function crc32(data) {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  }
  function chunk(type, payload) {
    const result = Buffer.alloc(payload.length + 12);
    result.writeUInt32BE(payload.length);
    result.write(type, 4);
    payload.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const f = await fixture(t);
  const report = f.app.store.add({
    stationId: 'a',
    category: 'infrastructure',
    title: 'Falta una banca',
    targetType: 'station',
    detail: 'No hay bancas en el andén.',
    publicationConsent: false,
    photoMime: 'image/png',
    photoData: png,
  });
  const anonymous = f.client();
  assert.equal((await anonymous.request(`/api/reports/${report.id}/photo`)).status, 404);
  assert.equal((await anonymous.request(`/api/admin/reports/${report.id}/photo`)).status, 401);
  await f.user('moderator');
  const moderator = f.client();
  await moderator.enroll('moderator@example.com');
  const privatePhoto = await moderator.request(`/api/admin/reports/${report.id}/photo`);
  assert.equal(privatePhoto.status, 200);
  assert.equal(privatePhoto.headers.get('cache-control'), 'no-store');
  assert.equal(privatePhoto.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.deepEqual(Buffer.from(privatePhoto.body), png);
  const list = await moderator.request('/api/admin/reports?status=all');
  const detail = await moderator.request(`/api/admin/reports/${report.id}`);
  assert.equal(list.body.reports[0].hasPhoto, true);
  assert.equal(detail.body.report.hasPhoto, true);
  for (const response of [list, detail]) {
    assert.ok(!JSON.stringify(response.body).includes('photoData'));
    assert.ok(!JSON.stringify(response.body).includes('submissionHash'));
    assert.ok(!JSON.stringify(response.body).includes('draftId'));
  }
});

test('administration static pages keep private headers through percent-encoded paths and remain disabled without config', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-admin-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'admin.html'), '<!DOCTYPE html><title>Administración</title>');
  const disabled = await fixture(t, { adminOptions: null, distPath: directory });
  for (const path of ['/admin', '/admin.html', '/adm%69n.html', '/adm%69n'])
    assert.equal((await disabled.client().request(path)).status, 404);
  const enabled = await fixture(t, { distPath: directory });
  for (const path of ['/admin', '/admin.html', '/adm%69n.html', '/adm%69n']) {
    const response = await enabled.client().request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(!response.headers.get('content-security-policy').includes('unsafe-inline'));
  }
});

test('HTTP login, enrollment, private review and logout work together through the Node server', async (t) => {
  let app;
  const server = createServer((request, response) => app.handler(request, response));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = `http://127.0.0.1:${server.address().port}`;
  app = createApp({ network, adminOptions: { ...options, origin: address } });
  await app.ready;
  t.after(async () => {
    await new Promise((done) => server.close(done));
    app.close();
  });
  await app.admin.provision({
    email: 'http@example.com',
    name: 'HTTP review',
    role: 'moderator',
    password,
  });
  const report = app.store.add({
    stationId: 'a',
    category: 'infrastructure',
    targetType: 'station',
    title: 'Banca por reparar',
    detail: 'La banca tiene una pieza suelta.',
    publicationConsent: true,
  });
  const cookies = new Map();
  let csrf;
  async function call(path, body) {
    const response = await fetch(`${address}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        ...(body !== undefined ? { origin: address, 'content-type': 'application/json' } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';')[0].split(/=(.*)/s);
      if (!value) cookies.delete(name);
      else cookies.set(name, value);
    }
    const result = await response.json();
    if (path === '/api/admin/session' && response.ok) csrf = result.csrfToken;
    return { status: response.status, body: result, headers: response.headers };
  }
  assert.equal(
    (await call('/api/admin/auth/sign-in/email', { email: 'http@example.com', password })).status,
    200,
  );
  assert.equal((await call('/api/admin/session')).body.mfaRequired, true);
  const setup = await call('/api/admin/auth/two-factor/enable', { password, method: 'totp' });
  assert.equal(setup.status, 200);
  await call('/api/admin/session');
  assert.equal(
    (await call('/api/admin/auth/two-factor/verify-totp', { code: totp(setup.body.totpURI) }))
      .status,
    200,
  );
  assert.equal((await call('/api/admin/session')).body.mfaRequired, false);
  const detail = (await call(`/api/admin/reports/${report.id}`)).body.report;
  const reviewed = await call(`/api/admin/reports/${report.id}/moderate`, {
    action: 'publish',
    expectedVersion: detail.version,
    expectedStatus: detail.status,
    reviewed: true,
    note: 'Contenido revisado por el equipo.',
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.report.status, 'published');
  assert.equal((await call('/api/admin/dashboard')).body.counters.published, 1);
  assert.equal((await call('/api/admin/auth/sign-out', {})).status, 200);
  assert.equal((await call('/api/admin/dashboard')).status, 401);
});
