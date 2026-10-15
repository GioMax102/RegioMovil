import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createApp, DEFAULT_ORIGINS } from './app.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const network = JSON.parse(await readFile(resolve(root, 'data/network.json'), 'utf8'));
let catalog = null;
try { catalog = JSON.parse(await readFile(resolve(root, 'data/transit-catalog.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const application = createApp({ network, catalog,
  databasePath: process.env.DATABASE_PATH || resolve(root, '.data/regiomovil.sqlite'),
  allowedOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean) : DEFAULT_ORIGINS,
  distPath: resolve(root, 'dist'),
});
const server = createServer(application.handler);
server.requestTimeout = 10_000;
server.headersTimeout = 8_000;
server.keepAliveTimeout = 5_000;
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`RegioMovil API: http://${process.env.HOST || '127.0.0.1'}:${server.address().port} · synthetic simulation`);
});
function shutdown() {
  server.close(() => { application.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
