import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { readReleaseConfig } from './release-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const supportedArgs = new Set(['--help', '--skip-web', '--offline', '--dev-local-api', '--release']);
const unknownArgs = process.argv.slice(2).filter(argument => !supportedArgs.has(argument));
const fail = message => { console.error(`\nAndroid: ${message}`); process.exit(1); };
if (unknownArgs.length) fail(`Opciones desconocidas: ${unknownArgs.join(', ')}. Usa --help.`);
const help = process.argv.includes('--help');
if (help) {
  console.log('node scripts/android-build.mjs [--skip-web] [--offline] [--dev-local-api] [--release]\n\nCompila y sincroniza la web y copia el APK a output/android.\n--release genera un APK optimizado y firmado; requiere una API HTTPS pública. Respalda output/android/signing de forma privada para futuras actualizaciones.\n--dev-local-api conecta el APK debug a http://localhost:4173; usa adb reverse tcp:4173 tcp:4173.\nRequiere JDK 21, Android SDK 36 y Node 24+.\nVariables: JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT, GRADLE_USER_HOME, VITE_API_BASE_URL.');
  process.exit(0);
}

const devLocalApi = process.argv.includes('--dev-local-api');
const release = process.argv.includes('--release');
const releaseConfig = readReleaseConfig(root);
if (release && devLocalApi) fail('Una publicación no puede usar una API local.');
if (release && process.argv.includes('--skip-web')) fail('Una publicación requiere reconstruir la web y fijar su API HTTPS. Quita --skip-web.');
if (devLocalApi && process.argv.includes('--skip-web')) fail('--dev-local-api requiere reconstruir la web para fijar la API local. Quita --skip-web.');
const configuredApi = env.VITE_API_BASE_URL ?? loadEnv('production', root, 'VITE_').VITE_API_BASE_URL;
const localApi = 'http://localhost:4173';
if (devLocalApi && configuredApi && configuredApi !== localApi) fail(`--dev-local-api sólo permite ${localApi}.`);
const api = devLocalApi ? localApi : configuredApi;
if (release && !api) fail('Configura VITE_API_BASE_URL con el servidor HTTPS público antes de publicar.');
if (api) env.VITE_API_BASE_URL = api;
if (api) {
  let url;
  try { url = new URL(api); } catch { fail('VITE_API_BASE_URL debe ser una URL HTTPS válida.'); }
  if (url.protocol !== 'https:' && !(devLocalApi && api === localApi)) fail('La aplicación Android requiere una API HTTPS; HTTP sólo se permite con --dev-local-api y localhost.');
  if (url.username || url.password) fail('VITE_API_BASE_URL es pública; no debe contener credenciales.');
  if (url.search || url.hash) fail('VITE_API_BASE_URL no debe incluir parámetros de búsqueda ni fragmentos.');
}
if (!env.JAVA_HOME) {
  const cache = path.join(homedir(), '.gradle', 'jdks');
  const homes = existsSync(cache) ? readdirSync(cache).filter(name => name.includes('-21-')).map(name => path.join(cache, name)) : [];
  env.JAVA_HOME = homes.find(home => existsSync(path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')));
}
if (!env.JAVA_HOME) fail('Configura JAVA_HOME con la ruta de un JDK 21.');
env.PATH = [path.join(env.JAVA_HOME, 'bin'), env.PATH].filter(Boolean).join(path.delimiter);

const sdkCandidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, path.join(homedir(), 'Android', 'Sdk'), path.join(homedir(), 'Library', 'Android', 'sdk')];
const sdk = sdkCandidates.find(candidate => candidate && existsSync(candidate));
if (!sdk) fail('Configura ANDROID_HOME con Android SDK 36 (platforms;android-36 y build-tools;36.0.0).');
env.ANDROID_HOME = sdk;
env.ANDROID_SDK_ROOT = sdk;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && command.endsWith('.bat') });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function snapshotFiles(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...snapshotFiles(absolute, relative));
    else if (entry.isFile()) {
      const contents = readFileSync(absolute);
      files.push({ path: relative, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') });
    } else fail(`El bundle contiene un recurso no regular: ${relative}.`);
  }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
const fingerprint = files => createHash('sha256').update(JSON.stringify(files)).digest('hex');
function verifyCopiedWeb(expected) {
  const actual = snapshotFiles(path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public'));
  // Capacitor creates these two bridge files in addition to the web bundle.
  const bridgeFiles = new Set(['cordova.js', 'cordova_plugins.js']);
  const web = actual.filter(file => !bridgeFiles.has(file.path));
  if (fingerprint(web) !== fingerprint(expected)) {
    fail('Los recursos copiados a Android no coinciden exactamente con dist. Vuelve a ejecutar la sincronización.');
  }
}

if (!process.argv.includes('--skip-web')) {
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-b']);
  run(process.execPath, ['scripts/prepare-catalog.mjs']);
  run(process.execPath, ['scripts/prepare-mobility.mjs']);
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  run(process.execPath, ['scripts/finalize-web.mjs']);
}
if (!existsSync(path.join(root, 'dist', 'index.html'))) fail('Falta dist/index.html. Ejecuta pnpm build antes de --skip-web.');
const webAssets = snapshotFiles(path.join(root, 'dist'));
const webBundleSha256 = fingerprint(webAssets);
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
verifyCopiedWeb(webAssets);

const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const args = [release ? ':app:assembleRelease' : ':app:assembleDebug', '--no-daemon', '--max-workers=2'];
if (process.argv.includes('--offline')) args.push('--offline');
run(wrapper, args, path.join(root, 'android'));
if (fingerprint(snapshotFiles(path.join(root, 'dist'))) !== webBundleSha256) {
  fail('dist cambió durante la compilación Android. Ejecuta nuevamente el build para entregar la interfaz actual.');
}
verifyCopiedWeb(webAssets);

const out = path.join(root, 'output', 'android');
mkdirSync(out, { recursive: true });
const output = path.join(out, release ? 'regiomovil.apk' : 'regiomovil-debug.apk');
if (release) {
  // This ignored directory must be backed up privately to sign future updates.
  const signing = path.join(out, 'signing');
  mkdirSync(signing, { recursive: true, mode: 0o700 });
  const key = path.join(signing, 'regiomovil-release.jks');
  const password = path.join(signing, 'store-password.txt');
  if (!existsSync(key)) {
    if (existsSync(output)) fail('Ya existe un APK de publicación, pero falta su llave. Restaura el respaldo privado para conservar las actualizaciones.');
    if (existsSync(password)) fail('Hay una contraseña de firma sin llave. Revisa tu respaldo antes de continuar.');
    writeFileSync(password, randomBytes(32).toString('hex'), { mode: 0o600 });
    run(path.join(env.JAVA_HOME, 'bin', 'keytool'), ['-genkeypair', '-keystore', key, '-storetype', 'PKCS12', '-storepass:file', password, '-alias', 'regiomovil', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=RegioMovil, OU=Piloto academico, O=RegioMovil, C=MX']);
  }
  if (!existsSync(password)) fail('Falta la contraseña de la llave de publicación. Restaura tu respaldo privado.');
  chmodSync(key, 0o600);
  chmodSync(password, 0o600);
  const tools = path.join(sdk, 'build-tools', '36.0.0');
  const unsigned = path.join(root, 'android/app/build/outputs/apk/release/app-release-unsigned.apk');
  const aligned = path.join(out, 'regiomovil-aligned.apk');
  run(path.join(tools, 'zipalign'), ['-f', '-p', '4', unsigned, aligned]);
  run(path.join(tools, 'apksigner'), ['sign', '--ks', key, '--ks-key-alias', 'regiomovil', '--ks-pass', `file:${password}`, '--out', output, aligned]);
  run(path.join(tools, 'apksigner'), ['verify', '--verbose', output]);
  console.log(`Respalda de forma privada la llave y contraseña en: ${signing}`);
} else {
  copyFileSync(path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'), output);
}
const apk = readFileSync(output);
const sha256 = createHash('sha256').update(apk).digest('hex');
writeFileSync(`${output}.sha256`, `${sha256}  ${path.basename(output)}\n`);
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' });
const metadata = JSON.stringify({
  ...releaseConfig, variant: release ? 'release' : 'debug',
  commit: revision.status === 0 ? revision.stdout.trim() : null,
  branch: branch.status === 0 ? branch.stdout.trim() : null,
  builtAt: new Date().toISOString(), bytes: apk.length, sha256,
  backend: api || 'Demostración local, sin API remota configurada',
  webBundleSha256, webAssets,
}, null, 2) + '\n';
// Keep the compatibility path, and preserve each variant's own provenance.
writeFileSync(path.join(out, `${path.basename(output, '.apk')}.json`), metadata);
writeFileSync(path.join(out, 'build-info.json'), metadata);
console.log(`\nAPK listo: ${output}\nSHA-256: ${sha256}`);
if (devLocalApi) console.log('API de desarrollo: http://localhost:4173. Con el backend activo y el teléfono conectado, ejecuta ./regiomovil android-connect antes de Run en Android Studio.');
