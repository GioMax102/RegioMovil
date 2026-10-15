import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const help = process.argv.includes('--help');
if (help) {
  console.log('node scripts/android-build.mjs [--skip-web] [--offline]\n\nCompila y sincroniza la web, genera un APK debug y lo copia a output/android.\nRequiere JDK 21, Android SDK 36 y Node 24+.\nVariables: JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT, GRADLE_USER_HOME, VITE_API_BASE_URL.');
  process.exit(0);
}

const fail = message => { console.error(`\nAndroid: ${message}`); process.exit(1); };
const api = env.VITE_API_BASE_URL ?? loadEnv('production', root, 'VITE_').VITE_API_BASE_URL;
if (api) {
  let url;
  try { url = new URL(api); } catch { fail('VITE_API_BASE_URL debe ser una URL HTTPS válida.'); }
  if (url.protocol !== 'https:') fail('La aplicación Android requiere una API HTTPS; no se permite tráfico HTTP.');
  if (url.username || url.password) fail('VITE_API_BASE_URL es pública; no debe contener credenciales.');
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
const args = [':app:assembleDebug', '--no-daemon', '--max-workers=2'];
if (process.argv.includes('--offline')) args.push('--offline');
run(wrapper, args, path.join(root, 'android'));
if (fingerprint(snapshotFiles(path.join(root, 'dist'))) !== webBundleSha256) {
  fail('dist cambió durante la compilación Android. Ejecuta nuevamente el build para entregar la interfaz actual.');
}
verifyCopiedWeb(webAssets);

const apkPath = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const out = path.join(root, 'output', 'android');
mkdirSync(out, { recursive: true });
const output = path.join(out, 'regiomovil-debug.apk');
copyFileSync(apkPath, output);
const apk = readFileSync(output);
const sha256 = createHash('sha256').update(apk).digest('hex');
writeFileSync(`${output}.sha256`, `${sha256}  regiomovil-debug.apk\n`);
writeFileSync(path.join(out, 'build-info.json'), JSON.stringify({
  appId: 'mx.regiomovil.app', version: '1.0.0', variant: 'debug',
  builtAt: new Date().toISOString(), bytes: apk.length, sha256,
  backend: api || 'Demostración local, sin API remota configurada',
  webBundleSha256, webAssets,
}, null, 2) + '\n');
console.log(`\nAPK listo: ${output}\nSHA-256: ${sha256}`);
