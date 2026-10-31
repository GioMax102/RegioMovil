import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createObservability,
  metricRoute,
  readMetricsToken,
  startMetricsServer,
} from '../server/observability.mjs';

const token = 'example-only-test-metrics-0123456789abcdef';
async function listen(server) {
  if (!server.listening) await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test('metrics listener is private by default, bearer protected, method limited and never cached', async () => {
  const metrics = createObservability();
  const server = startMetricsServer({ metrics, token, port: 0 });
  try {
    const url = await listen(server);
    assert.equal(server.address().address, '127.0.0.1');
    for (const authorization of [undefined, 'Bearer wrong', `bearer ${token}`]) {
      const result = await fetch(`${url}/metrics`, {
        headers: authorization ? { Authorization: authorization } : {},
      });
      assert.equal(result.status, 401);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(await result.text(), '');
    }
    const headers = { Authorization: `Bearer ${token}` };
    const result = await fetch(`${url}/metrics`, { headers });
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-type'), /version=0.0.4/);
    assert.match(await result.text(), /regiomovil_process_resident_bytes [1-9]/);
    assert.equal((await fetch(`${url}/metrics?token=${token}`, { headers })).status, 404);
    assert.equal((await fetch(`${url}/api/health`, { headers })).status, 404);
    assert.equal((await fetch(`${url}/metrics`, { method: 'POST', headers })).status, 405);
    assert.equal(await (await fetch(`${url}/metrics`, { method: 'HEAD', headers })).text(), '');
  } finally {
    await close(server);
    metrics.close();
  }
});

test('HTTP metrics collapse identities, search text, paths and status into finite templates', async () => {
  const metrics = createObservability({
    getReportUsage: () => ({
      capacity: { reportCount: 2, reportLimit: 5000, photoBytes: 400, photoBytesLimit: 50e6 },
      queue: { pendingOver7Days: 1 },
      targets: [{ stationId: 'DO-NOT-EXPORT' }],
    }),
  });
  const server = createServer((request, response) => {
    metrics.observeRequest(request, response);
    response.writeHead(request.url.startsWith('/api/private') ? 404 : 200);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  try {
    const url = await listen(server);
    await fetch(`${url}/api/places?q=private-address&lat=25.6`);
    await fetch(`${url}/api/services/private-route-id`);
    for (let index = 0; index < 30; index++) await fetch(`${url}/api/private-${index}`);
    const output = metrics.render();
    assert.match(output, /route="\/api\/places",method="GET",status="2xx"} 1/);
    assert.match(output, /route="\/api\/other",method="GET",status="4xx"} 30/);
    assert.match(output, /regiomovil_reports_photo_bytes 400/);
    assert.doesNotMatch(
      output,
      /private-address|25\.6|private-route-id|private-1|DO-NOT-EXPORT|NaN|Infinity/,
    );
    assert.equal((output.match(/^regiomovil_http_requests_total\{/gm) ?? []).length, 3);
    assert.equal(
      metricRoute('/api/admin/reports/private-id/photo'),
      '/api/admin/reports/:id/photo',
    );
    assert.equal(metricRoute('/api/admin/auth/sign-in/email?q=secret'), '/api/admin/auth/*');
  } finally {
    await close(server);
    metrics.close();
  }
});

test('telemetry failure never renders private error details or invalid values', () => {
  const metrics = createObservability({
    getReportUsage() {
      throw new Error('private SQLite path');
    },
  });
  try {
    const output = metrics.render();
    assert.match(output, /regiomovil_telemetry_errors_total 1/);
    assert.doesNotMatch(output, /SQLite|NaN/);
  } finally {
    metrics.close();
  }
});

test('secret-file token is opt-in and ambiguous or weak configuration fails closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-metrics-'));
  const path = join(directory, 'token');
  try {
    await writeFile(path, `${token}\n`, { mode: 0o600 });
    assert.equal(readMetricsToken({}), undefined);
    assert.equal(readMetricsToken({ METRICS_TOKEN_FILE: path }), token);
    assert.throws(
      () => readMetricsToken({ METRICS_TOKEN: token, METRICS_TOKEN_FILE: path }),
      /not both/,
    );
    assert.throws(() => readMetricsToken({ METRICS_TOKEN: 'short' }), /32 to 256/);
    assert.throws(() => startMetricsServer({ metrics: {}, token: '' }), /required/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
