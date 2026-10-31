import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { createApp, DEFAULT_ORIGINS } from './app.mjs';
import { adminOptionsFromEnv } from './admin-auth.mjs';
import { createObservability, readMetricsToken, startMetricsServer } from './observability.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const distPath = resolve(root, 'dist');
const databasePath = process.env.DATABASE_PATH || resolve(root, '.data/regiomovil.sqlite');
const adminOptions = adminOptionsFromEnv();
for (const file of [databasePath, adminOptions?.databasePath].filter(Boolean)) {
  if (file !== ':memory:' && (resolve(file) === distPath || resolve(file).startsWith(`${distPath}${sep}`)))
    throw new Error('Private databases must be outside the public dist directory.');
}
if (adminOptions?.databasePath && resolve(adminOptions.databasePath) === resolve(databasePath))
  throw new Error('Administrative identity and community evidence require separate database files.');
const metricsToken = readMetricsToken();
const network = JSON.parse(await readFile(resolve(root, 'data/network.json'), 'utf8'));
let catalog = null;
try { catalog = JSON.parse(await readFile(resolve(root, 'data/transit-catalog.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let mobilityNetwork = null;
try { mobilityNetwork = JSON.parse(await readFile(resolve(root, 'data/mobility-network.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const application = createApp({ network, catalog, mobilityNetwork,
  placesOptions: {
    ...(process.env.PLACES_PROVIDER_URL ? { providerUrl: process.env.PLACES_PROVIDER_URL } : {}),
    ...(process.env.PLACES_USER_AGENT ? { userAgent: process.env.PLACES_USER_AGENT } : {}),
  },
  placeSuggestionsOptions: {
    ...(process.env.PLACES_SUGGEST_PROVIDER_URL ? { providerUrl: process.env.PLACES_SUGGEST_PROVIDER_URL } : {}),
    ...(process.env.PLACES_USER_AGENT ? { userAgent: process.env.PLACES_USER_AGENT } : {}),
  },
  databasePath,
  allowedOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean) : DEFAULT_ORIGINS,
  distPath,
  adminOptions,
});
await application.ready;
application.store.pruneExpired();
application.admin?.maintenance?.();
const retentionTimer = setInterval(() => {
  try { application.store.pruneExpired(); application.admin?.maintenance?.(); }
  catch { console.error('Retention maintenance failed; inspect private storage availability.'); }
}, 6 * 3600_000);
retentionTimer.unref();
const metrics = metricsToken ? createObservability({ getReportUsage: () => application.store.usage() }) : null;
const metricsServer = metrics ? startMetricsServer({ metrics, token: metricsToken,
  host: process.env.METRICS_HOST || '127.0.0.1', port: Number(process.env.METRICS_PORT || 9091) }) : null;
const server = createServer((request, response) => {
  metrics?.observeRequest(request, response);
  application.handler(request, response);
});
server.requestTimeout = 10_000;
server.headersTimeout = 8_000;
server.keepAliveTimeout = 5_000;
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`RegioMovil API: http://${process.env.HOST || '127.0.0.1'}:${server.address().port} · synthetic simulation`);
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(retentionTimer);
  const closed = () => { metrics?.close(); application.close(); process.exit(0); };
  server.close(() => { if (metricsServer) metricsServer.close(closed); else closed(); });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
