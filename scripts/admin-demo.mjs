import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  realpathSync,
} from 'node:fs';
import { resolve, join, dirname, basename, relative, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { populateAdminDemo } from '../server/admin-demo.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node scripts/admin-demo.mjs --directory /tmp/regiomovil-admin-demo-NAME [--profile map|community] [--seed NAME] [--date ISO]\nCreates isolated synthetic reports (map: 240, community: 1200), a manifest and a private demo.env for port4180. Never overwrites a destination. Create its administrative account using admin-user.mjs and complete MFA normally.',
  );
  process.exit(0);
}
const input = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    !['--directory', '--seed', '--date', '--profile'].includes(args[i]) ||
    !args[i + 1] ||
    input[args[i]] !== undefined
  )
    throw new Error('Usa --help para consultar las opciones.');
  input[args[i]] = args[i + 1];
}
if (!input['--directory']) throw new Error('Se requiere un directorio nuevo explícito.');
const profile = input['--profile'] ?? 'map';
if (!['map', 'community'].includes(profile)) throw new Error('El perfil debe ser map o community.');
const requested = resolve(input['--directory']);
if (
  /[\u0000-\u001f\u007f]/.test(requested) ||
  (input['--seed'] !== undefined && !/^[a-zA-Z0-9-]{1,64}$/.test(input['--seed']))
)
  throw new Error(
    'La ruta no admite caracteres de control; la semilla admite hasta 64 letras, números o guiones.',
  );
// Resolve the existing parent before creating anything: a symlink to .data must
// not make a demonstration look isolated while writing beside real reports.
const directory = join(realpathSync(dirname(requested)), basename(requested));
const privateRoot = existsSync('.data') ? realpathSync('.data') : resolve('.data');
const withinPrivate = relative(privateRoot, directory);
const configuredDatabase =
  process.env.DATABASE_PATH && process.env.DATABASE_PATH !== ':memory:'
    ? resolve(process.env.DATABASE_PATH)
    : null;
const databaseDestination = join(directory, 'reports.sqlite');
const configuredReal =
  configuredDatabase && existsSync(configuredDatabase)
    ? realpathSync(configuredDatabase)
    : configuredDatabase;
if (
  !/^regiomovil-admin-demo-[a-zA-Z0-9-]+$/.test(basename(directory)) ||
  withinPrivate === '' ||
  (!withinPrivate.startsWith('..') && !isAbsolute(withinPrivate)) ||
  configuredReal === databaseDestination ||
  existsSync(directory)
)
  throw new Error('Usa un directorio nuevo regiomovil-admin-demo-NOMBRE, fuera de .data.');
const date = new Date(input['--date'] ?? Date.now());
if (!Number.isFinite(date.getTime())) throw new Error('Fecha inválida.');
mkdirSync(directory, { mode: 0o700 });
const databasePath = join(directory, 'reports.sqlite');
const manifest = populateAdminDemo(databasePath, {
  network: JSON.parse(readFileSync('data/network.json', 'utf8')),
  catalog: JSON.parse(readFileSync('data/transit-catalog.json', 'utf8')),
  seed: input['--seed'] ?? 'regiomovil-31',
  referenceDate: date,
  profile,
});
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
});
writeFileSync(
  join(directory, 'demo.env'),
  [
    'NODE_ENV=development',
    'HOST=127.0.0.1',
    'PORT=4180',
    'ADMIN_ENABLED=true',
    'ADMIN_ORIGIN=http://localhost:4180',
    'ADMIN_ALLOW_INSECURE_LOCALHOST=true',
    `ADMIN_AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    `ADMIN_DATABASE_PATH=${JSON.stringify(join(directory, 'identity.sqlite'))}`,
    `DATABASE_PATH=${JSON.stringify(databasePath)}`,
    'CORS_ORIGINS=http://localhost:4180,https://localhost,capacitor://localhost',
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
);
chmodSync(directory, 0o700);
console.log(
  JSON.stringify({
    directory,
    manifest: join(directory, 'manifest.json'),
    environment: join(directory, 'demo.env'),
    profile,
    ...manifest.expected,
  }),
);
