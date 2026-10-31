import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ORIGINS } from '../server/app.mjs';

const composeFile = fileURLToPath(new URL('../ops/compose.monitoring.yml', import.meta.url));
const dockerAvailable =
  spawnSync('docker', ['compose', 'version'], {
    encoding: 'utf8',
    timeout: 10_000,
  }).status === 0;

// Interpret the actual Compose file without loading developer secrets or
// creating containers, networks, volumes, or secret files.
function config(environment = {}, profile) {
  const directory = mkdtempSync(join(tmpdir(), 'regiomovil-compose-config-'));
  try {
    const envFile = profile ?? join(directory, 'empty.env');
    if (!profile) writeFileSync(envFile, '', { mode: 0o600 });
    const result = spawnSync(
      'docker',
      ['compose', '--env-file', envFile, '-f', composeFile, 'config', '--format', 'json'],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          COMPOSE_DISABLE_ENV_FILE: 'true',
          ...environment,
        },
      },
    );
    assert.equal(
      result.status,
      0,
      'Docker Compose must successfully interpret the monitoring configuration',
    );
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test(
  'monitoring Compose preserves the server default origins and rotates every service log',
  {
    skip: !dockerAvailable && 'Docker Compose is not installed',
  },
  () => {
    const { services } = config();
    assert.deepEqual(services.app.environment.CORS_ORIGINS.split(','), DEFAULT_ORIGINS);
    assert.equal(services.app.environment.ADMIN_ENABLED, 'false');
    for (const name of ['app', 'prometheus', 'grafana']) {
      assert.deepEqual(services[name].logging, {
        driver: 'json-file',
        options: { 'max-file': '3', 'max-size': '10m' },
      });
    }
  },
);

test(
  'production profile replaces development HTTP origins and requires a private admin secret',
  {
    skip: !dockerAvailable && 'Docker Compose is not installed',
  },
  () => {
    const profile = fileURLToPath(new URL('../ops/production.env.example', import.meta.url));
    const { services } = config({}, profile);
    const { environment } = services.app;
    assert.equal(environment.ADMIN_ENABLED, 'true');
    assert.equal(environment.ADMIN_ORIGIN, 'https://regiomovil.example.org');
    assert.equal(environment.ADMIN_ALLOW_INSECURE_LOCALHOST, 'false');
    assert.equal(environment.ADMIN_AUTH_SECRET, '');
    assert.equal(environment.DATABASE_PATH, '/data/regiomovil.sqlite');
    assert.equal(environment.ADMIN_DATABASE_PATH, '/data/admin-auth.sqlite');
    assert.notEqual(environment.DATABASE_PATH, environment.ADMIN_DATABASE_PATH);
    assert.deepEqual(environment.CORS_ORIGINS.split(','), [
      'https://regiomovil.example.org',
      'https://localhost',
      'capacitor://localhost',
    ]);
    const publishedPorts = Object.values(services).flatMap((service) => service.ports ?? []);
    assert.equal(publishedPorts.length, 3);
    for (const port of publishedPorts) assert.equal(port.host_ip, '127.0.0.1');
    assert.deepEqual(
      publishedPorts.map((port) => port.target).sort((a, b) => a - b),
      [3000, 3001, 9090],
    );
  },
);

test(
  'monitoring Compose forwards an explicit Android and HTTPS origin allowlist unchanged',
  {
    skip: !dockerAvailable && 'Docker Compose is not installed',
  },
  () => {
    const origins = 'https://pilot.example.invalid,https://localhost,capacitor://localhost';
    assert.equal(config({ CORS_ORIGINS: origins }).services.app.environment.CORS_ORIGINS, origins);
  },
);
