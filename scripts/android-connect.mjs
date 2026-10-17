import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const fail = message => { console.error(`\nAndroid: ${message}`); process.exit(1); };
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/android-connect.mjs [--serial SERIAL]\n\nComprueba el backend RegioMóvil local y reenvía localhost:4173 a un dispositivo ADB autorizado.\nVariables: ANDROID_HOME, ANDROID_SDK_ROOT, ANDROID_SERIAL. No instala ni reinicia la app.');
  process.exit(0);
}
let serial = process.env.ANDROID_SERIAL;
for (let index = 0; index < args.length; index++) {
  if (args[index] !== '--serial' || !args[index + 1] || args[index + 1].startsWith('--')) fail('Usa --serial SERIAL o --help.');
  serial = args[++index];
}
const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
  path.join(homedir(), 'Android', 'Sdk'), path.join(homedir(), 'Library', 'Android', 'sdk')]
  .filter(Boolean).map(directory => path.join(directory, 'platform-tools', adbName));
const adb = candidates.find(candidate => existsSync(candidate)) || adbName;
function run(arguments_) {
  const result = spawnSync(adb, arguments_, { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (result.error?.code === 'ENOENT') fail('No se encontró adb. Instala platform-tools desde Android Studio y configura ANDROID_HOME.');
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(result.stderr.trim() || `ADB terminó con código ${result.status}.`);
  return result.stdout.trim();
}

const listed = run(['devices']).split(/\r?\n/).slice(1)
  .map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 2)
  .map(([id, state]) => ({ id, state }));
if (serial) {
  const selected = listed.find(device => device.id === serial);
  if (!selected) fail('El dispositivo indicado no está conectado. Revisa adb devices.');
  if (selected.state !== 'device') fail(`El dispositivo está ${selected.state}. Desbloquea el teléfono y autoriza la depuración USB.`);
} else {
  const ready = listed.filter(device => device.state === 'device');
  if (ready.length > 1) fail('Hay varios dispositivos autorizados. Selecciona uno con --serial SERIAL (adb devices muestra los identificadores).');
  if (!ready.length) fail(listed.some(device => device.state === 'unauthorized')
    ? 'Desbloquea el teléfono y acepta la autorización de depuración USB.'
    : 'Conecta un teléfono con depuración USB o inicia un emulador y vuelve a ejecutar el comando.');
  serial = ready[0].id;
}

try {
  const response = await fetch('http://127.0.0.1:4173/api/health', {
    headers: { Origin: 'https://localhost' }, signal: AbortSignal.timeout(4000),
  });
  const body = await response.json();
  if (!response.ok || body.service !== 'RegioMovil' || body.status !== 'ok') throw new Error('El puerto 4173 no responde como RegioMóvil.');
  if (response.headers.get('access-control-allow-origin') !== 'https://localhost') {
    fail('El backend no permite el origen Android https://localhost. Inclúyelo en CORS_ORIGINS y reinicia el servidor.');
  }
} catch (error) {
  fail(`No se pudo validar el backend: ${error.message}\nDéjalo activo en otra terminal: HOST=127.0.0.1 PORT=4173 ./regiomovil start`);
}
run(['-s', serial, 'reverse', 'tcp:4173', 'tcp:4173']);
const mappings = run(['-s', serial, 'reverse', '--list']);
if (!mappings.split(/\r?\n/).some(line => /\btcp:4173\s+tcp:4173\s*$/.test(line))) fail('ADB no confirmó el reenvío del puerto 4173. Vuelve a conectar el dispositivo.');
console.log('Backend RegioMóvil y CORS Android verificados. Túnel localhost:4173 activo.\nPuedes pulsar Run en Android Studio. Mantén abierto el backend y repite este comando al reconectar el dispositivo.\nSi cambiaste la API o el código web, compila antes: ./regiomovil android --dev-local-api');
