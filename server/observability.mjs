import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const paths = new Set([
  '/api/health',
  '/api/network',
  '/api/model',
  '/api/board',
  '/api/plan',
  '/api/reports',
  '/api/reports/summary',
  '/api/services',
  '/api/places',
  '/api/places/suggest',
  '/api/mobility/network',
  '/api/mobility/plan',
  '/api/admin/session',
  '/api/admin/login',
  '/api/admin/logout',
  '/api/admin/dashboard',
  '/api/admin/reports',
]);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const buckets = [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const hash = (value) => createHash('sha256').update(value).digest();
const safeNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

// Only literal templates enter labels. Unknown URLs and all query strings collapse
// into one bucket; no client IP, report identity, search text or GPS is retained.
export function metricRoute(rawUrl) {
  const path = typeof rawUrl === 'string' ? rawUrl.split('?', 1)[0] : '';
  if (paths.has(path)) return path;
  if (/^\/api\/services\/[^/]+$/.test(path)) return '/api/services/:id';
  if (/^\/api\/reports\/[^/]+\/photo$/.test(path)) return '/api/reports/:id/photo';
  if (path.startsWith('/api/admin/auth/')) return '/api/admin/auth/*';
  if (/^\/api\/admin\/reports\/[^/]+\/photo$/.test(path)) return '/api/admin/reports/:id/photo';
  if (/^\/api\/admin\/reports\/[^/]+\/[^/]+$/.test(path)) return '/api/admin/reports/:id/action';
  if (/^\/api\/admin\/reports\/[^/]+$/.test(path)) return '/api/admin/reports/:id';
  return path.startsWith('/api/') || path === '/api' ? '/api/other' : '/static';
}

export function createObservability({ getReportUsage } = {}) {
  const requests = new Map();
  const started = Date.now() / 1000 - process.uptime();
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  let inFlight = 0;
  let closed = false;
  let telemetryErrors = 0;
  return {
    observeRequest(request, response) {
      if (closed) return;
      const route = metricRoute(request.url);
      const method = methods.has(request.method) ? request.method : 'OTHER';
      const at = performance.now();
      inFlight++;
      let recorded = false;
      const complete = (aborted) => {
        if (recorded) return;
        recorded = true;
        inFlight--;
        response.off('finish', finished);
        response.off('close', disconnected);
        const status = aborted
          ? 'aborted'
          : `${Math.max(1, Math.min(5, Math.floor(response.statusCode / 100)))}xx`;
        const key = `route="${route}",method="${method}",status="${status}"`;
        let entry = requests.get(key);
        if (!entry)
          requests.set(key, (entry = { count: 0, sum: 0, buckets: buckets.map(() => 0) }));
        const seconds = Math.max(0, (performance.now() - at) / 1000);
        entry.count++;
        entry.sum += seconds;
        buckets.forEach((upper, index) => {
          if (seconds <= upper) entry.buckets[index]++;
        });
      };
      const finished = () => complete(false);
      const disconnected = () => complete(!response.writableFinished);
      response.once('finish', finished);
      response.once('close', disconnected);
    },
    render() {
      const lines = [];
      const metric = (name, type, help, value) => {
        lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
        if (value !== undefined) lines.push(`${name} ${safeNumber(value)}`);
      };
      metric(
        'regiomovil_http_requests_total',
        'counter',
        'Completed HTTP requests by finite route template.',
      );
      metric(
        'regiomovil_http_request_duration_seconds',
        'histogram',
        'HTTP response duration including aborted requests.',
      );
      for (const [labels, entry] of requests) {
        lines.push(`regiomovil_http_requests_total{${labels}} ${entry.count}`);
        buckets.forEach((upper, index) =>
          lines.push(
            `regiomovil_http_request_duration_seconds_bucket{${labels},le="${upper}"} ${entry.buckets[index]}`,
          ),
        );
        lines.push(
          `regiomovil_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${entry.count}`,
          `regiomovil_http_request_duration_seconds_sum{${labels}} ${entry.sum}`,
          `regiomovil_http_request_duration_seconds_count{${labels}} ${entry.count}`,
        );
      }
      metric(
        'regiomovil_http_requests_in_flight',
        'gauge',
        'Currently active HTTP requests.',
        inFlight,
      );
      const memory = process.memoryUsage();
      for (const [name, field] of [
        ['resident', 'rss'],
        ['heap_used', 'heapUsed'],
        ['heap_total', 'heapTotal'],
        ['external', 'external'],
      ]) {
        metric(
          `regiomovil_process_${name}_bytes`,
          'gauge',
          'Process memory in bytes.',
          memory[field],
        );
      }
      const cpu = process.cpuUsage();
      metric(
        'regiomovil_process_cpu_seconds_total',
        'counter',
        'Cumulative user and system CPU time.',
        (cpu.user + cpu.system) / 1e6,
      );
      metric(
        'regiomovil_process_start_time_seconds',
        'gauge',
        'Process start time as Unix seconds.',
        started,
      );
      metric('regiomovil_process_uptime_seconds', 'gauge', 'Process uptime.', process.uptime());
      metric(
        'regiomovil_event_loop_delay_seconds',
        'gauge',
        'Mean event loop delay since previous scrape.',
        eventLoop.mean / 1e9,
      );
      metric(
        'regiomovil_event_loop_delay_max_seconds',
        'gauge',
        'Maximum event loop delay since previous scrape.',
        eventLoop.max / 1e9,
      );
      eventLoop.reset();
      if (getReportUsage) {
        try {
          const usage = getReportUsage();
          const capacity = usage.capacity ?? usage;
          for (const [name, key] of [
            ['stored', 'reportCount'],
            ['limit', 'reportLimit'],
            ['photo_bytes', 'photoBytes'],
            ['photo_bytes_limit', 'photoBytesLimit'],
          ]) {
            if (!Number.isFinite(capacity[key]) || capacity[key] < 0)
              throw new Error('Invalid telemetry.');
            metric(
              `regiomovil_reports_${name}`,
              'gauge',
              'Aggregate report storage capacity; no report identifiers.',
              capacity[key],
            );
          }
          if (usage.queue)
            metric(
              'regiomovil_reports_pending_over_7_days',
              'gauge',
              'Pending reports older than seven days.',
              usage.queue.pendingOver7Days,
            );
        } catch {
          telemetryErrors++;
        }
      }
      metric(
        'regiomovil_telemetry_errors_total',
        'counter',
        'Failed aggregate storage telemetry reads.',
        telemetryErrors,
      );
      return `${lines.join('\n')}\n`;
    },
    close() {
      closed = true;
      eventLoop.disable();
      requests.clear();
    },
  };
}

export function readMetricsToken(env = process.env) {
  if (env.METRICS_TOKEN && env.METRICS_TOKEN_FILE)
    throw new Error('Configure METRICS_TOKEN or METRICS_TOKEN_FILE, not both.');
  const token = env.METRICS_TOKEN_FILE
    ? readFileSync(env.METRICS_TOKEN_FILE, 'utf8').trim()
    : env.METRICS_TOKEN;
  if (token !== undefined && !/^[A-Za-z0-9._~-]{32,256}$/.test(token))
    throw new Error('METRICS_TOKEN must contain 32 to 256 URL-safe characters.');
  return token;
}

export function startMetricsServer({ metrics, token, host = '127.0.0.1', port = 9091 }) {
  if (!/^[A-Za-z0-9._~-]{32,256}$/.test(token ?? ''))
    throw new Error('A strong METRICS_TOKEN is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('METRICS_PORT must be an integer from 0 to 65535.');
  const expected = hash(`Bearer ${token}`);
  const server = createServer({ maxHeaderSize: 4096 }, (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!timingSafeEqual(hash(request.headers.authorization ?? ''), expected)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      response.writeHead(401);
      response.end();
      return;
    }
    if (request.url !== '/metrics') {
      response.writeHead(404);
      response.end();
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405);
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    response.end(request.method === 'HEAD' ? undefined : metrics.render());
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 20;
  server.listen(port, host);
  return server;
}
