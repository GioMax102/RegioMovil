import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.mjs';

const origin = 'http://localhost:3001';
const password = 'correct horse battery staple';
const email = 'reviewer@example.test';
const network = {
  stations: [{ id: 'a', name: 'Estación A' }],
  lines: [{ id: 'L1', stationIds: ['a'] }],
};
function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function codeFor(uri) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...new URL(uri).searchParams.get('secret').replace(/=+$/, '')]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function fixture(t, enroll = true) {
  const app = createApp({
    network,
    adminOptions: {
      origin,
      secret: 'test-only-administration-revocation-secret',
      allowInsecureLocalhost: true,
    },
  });
  await app.ready;
  t.after(() => app.close());
  await app.admin.provision({ email, password, role: 'moderator', name: 'Persona de revisión' });
  const cookies = new Map();
  let csrf;
  async function request(path, body, source) {
    const stream = Readable.from(source || (body ? [Buffer.from(JSON.stringify(body))] : []));
    Object.assign(stream, {
      url: path,
      method: body ? 'POST' : 'GET',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        ...(body
          ? {
              origin,
              'content-type': 'application/json',
              ...(csrf ? { 'x-csrf-token': csrf } : {}),
            }
          : {}),
      },
    });
    const headers = new Map();
    let status;
    let raw;
    const response = {
      headersSent: false,
      setHeader(name, value) {
        headers.set(name.toLowerCase(), value);
      },
      writeHead(value, values) {
        status = value;
        this.headersSent = true;
        for (const [name, entry] of Object.entries(values)) headers.set(name.toLowerCase(), entry);
      },
      end(value) {
        raw = value;
      },
    };
    await app.handler(stream, response);
    for (const value of headers.get('set-cookie') || []) {
      const [name, content] = value.split(';')[0].split(/=(.*)/s);
      if (!content) cookies.delete(name);
      else cookies.set(name, content);
    }
    const result = JSON.parse(raw);
    if (path === '/api/admin/session' && result.csrfToken) csrf = result.csrfToken;
    return { status, body: result, headers };
  }
  if (enroll) {
    assert.equal((await request('/api/admin/auth/sign-in/email', { email, password })).status, 200);
    await request('/api/admin/session');
    const setup = await request('/api/admin/auth/two-factor/enable', { password, method: 'totp' });
    assert.equal(setup.status, 200);
    await request('/api/admin/session');
    assert.equal(
      (
        await request('/api/admin/auth/two-factor/verify-totp', {
          code: codeFor(setup.body.totpURI),
        })
      ).status,
      200,
    );
    assert.equal((await request('/api/admin/session')).body.mfaRequired, false);
  }
  return { app, request };
}

test('revocation during an unfinished moderation body prevents the decision and preserves private evidence', async (t) => {
  const { app, request } = await fixture(t);
  const report = app.store.add({
    targetType: 'station',
    stationId: 'a',
    title: 'Banca dañada',
    detail: 'Una banca necesita inspección.',
    category: 'infrastructure',
    publicationConsent: true,
  });
  const body = {
    action: 'publish',
    note: 'Contenido revisado.',
    reviewed: true,
    expectedStatus: 'pending',
    expectedVersion: 'pending:0',
  };
  const entered = deferred(),
    release = deferred();
  async function* slowBody() {
    entered.resolve();
    await release.promise;
    yield Buffer.from(JSON.stringify(body));
  }
  const pending = request(`/api/admin/reports/${report.id}/moderate`, body, slowBody());
  await entered.promise;
  await app.admin.changeAccess(email, { disabled: true });
  release.resolve();
  const result = await pending;
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
  assert.equal(app.store.get(report.id).status, 'pending');
  assert.deepEqual(app.store.moderationHistory(report.id), []);
});

test('a sign-in that verified old credentials cannot publish cookies after a concurrent password reset', async (t) => {
  const { app, request } = await fixture(t, false);
  const context = await app.admin.ready;
  const verify = context.password.verify;
  const entered = deferred(),
    release = deferred();
  context.password.verify = async (input) => {
    entered.resolve();
    await release.promise;
    return verify(input);
  };
  t.after(() => {
    context.password.verify = verify;
  });
  const pending = request('/api/admin/auth/sign-in/email', { email, password });
  await entered.promise;
  await app.admin.changeAccess(email, { password: 'new correct horse battery staple' });
  release.resolve();
  const result = await pending;
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
  assert.equal(result.headers.has('set-cookie'), false);
  assert.equal(app.admin.db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
});
