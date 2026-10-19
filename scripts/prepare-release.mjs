import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readReleaseConfig } from './release-config.mjs';

export const PUBLIC_API = 'https://regiomovil-api.onrender.com';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (files) => sha256(JSON.stringify(files));
const requiredFiles = [
  'index.html',
  'sw.js',
  '_headers',
  'acceso.html',
  'privacidad.html',
  'manifest.webmanifest',
  'bundle-stats.json',
];
const publicExtension = /\.(?:html|js|css|json|svg|png|jpe?g|webp|ico|woff2?|webmanifest|txt)$/i;

/** Only regular public build outputs are eligible, even if dist was polluted. */
export function collectPublicFiles(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.name.startsWith('.') || entry.isSymbolicLink())
      throw new Error(`Recurso oculto o enlace no permitido en dist: ${relative}`);
    if (entry.isDirectory()) files.push(...collectPublicFiles(absolute, relative));
    else if (entry.isFile()) {
      if (relative !== '_headers' && relative !== '_redirects' && !publicExtension.test(relative))
        throw new Error(`Archivo no público en dist: ${relative}`);
      if (/(?:^|\/)(?:store-password|credentials?|secrets?)(?:\.|$)/i.test(relative))
        throw new Error(`Archivo sensible no permitido en dist: ${relative}`);
      const contents = readFileSync(absolute);
      files.push({ path: relative, bytes: contents.length, sha256: sha256(contents) });
    } else throw new Error(`Recurso no regular en dist: ${relative}`);
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function validateReleaseInputs({ root, webAssets, metadata, config, commit }) {
  for (const file of requiredFiles)
    if (!webAssets.some((asset) => asset.path === file)) throw new Error(`Falta dist/${file}.`);
  if (metadata.variant !== 'release' || metadata.backend?.replace(/\/$/, '') !== PUBLIC_API)
    throw new Error('Se requiere un APK release compilado con la API HTTPS pública de RegioMóvil.');
  if (
    metadata.appId !== config.appId ||
    metadata.version !== config.version ||
    metadata.versionCode !== config.versionCode
  )
    throw new Error('La versión o el identificador del APK no coinciden con el repositorio.');
  if (metadata.commit !== commit)
    throw new Error(
      'El APK corresponde a otro commit. Compila después de guardar los cambios en Git.',
    );
  if (
    metadata.webBundleSha256 !== fingerprint(webAssets) ||
    fingerprint(metadata.webAssets) !== fingerprint(webAssets)
  )
    throw new Error(
      'dist y los recursos del APK no coinciden. Reconstruye ambos con la misma API.',
    );
  // These runtime API clients must contain Vite's actual production replacement;
  // an HTTPS URL in the help page or CSP alone does not establish that fact.
  const clients = webAssets
    .filter((file) => file.path.endsWith('.js'))
    .map((file) => readFileSync(path.join(root, 'dist', file.path), 'utf8'));
  for (const endpoint of ['/api/places/suggest?', '/api/reports']) {
    const matching = clients.filter((source) => source.includes(endpoint));
    if (!matching.length || matching.some((source) => !source.includes(JSON.stringify(PUBLIC_API))))
      throw new Error(`El cliente de ${endpoint} no contiene la API de producción.`);
  }
  const headers = readFileSync(path.join(root, 'dist/_headers'), 'utf8');
  if (!headers.includes(`connect-src 'self' ${PUBLIC_API}`))
    throw new Error('La política CSP de Pages no permite la API de producción.');
  const apk = readFileSync(path.join(root, 'output/android/regiomovil.apk'));
  if (apk.length !== metadata.bytes || sha256(apk) !== metadata.sha256)
    throw new Error('El APK no coincide con sus metadatos de integridad.');
}

const zipProgram = String.raw`
import hashlib, json, pathlib, sys, zipfile
source = pathlib.Path(sys.argv[1])
files = json.load(sys.stdin)
with zipfile.ZipFile(sys.argv[2], 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for item in files:
        path = source.joinpath(*item['path'].split('/'))
        if path.is_symlink() or not path.is_file():
            raise RuntimeError('Non-regular public resource: ' + item['path'])
        contents = path.read_bytes()
        if hashlib.sha256(contents).hexdigest() != item['sha256']:
            raise RuntimeError('dist changed during packaging: ' + item['path'])
        entry = zipfile.ZipInfo(item['path'], date_time=(1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        entry.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(entry, contents, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
`;

export function createWebArchive(source, zip, webAssets) {
  const python = process.platform === 'win32' ? 'py' : 'python3';
  const args = [...(process.platform === 'win32' ? ['-3'] : []), '-c', zipProgram, source, zip];
  const result = spawnSync(python, args, {
    input: JSON.stringify(webAssets),
    encoding: 'utf8',
    timeout: 60000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `No se pudo crear el ZIP. Requiere Python 3 estándar. ${result.stderr || result.error?.message || ''}`,
    );
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0)
    throw new Error('Se necesita el repositorio Git para identificar la entrega.');
  return result.stdout.trim();
}

export function prepareRelease(root) {
  const config = readReleaseConfig(root);
  if (git(root, ['status', '--porcelain', '--untracked-files=all']))
    throw new Error('Guarda los cambios en un commit antes de preparar el paquete de publicación.');
  const commit = git(root, ['rev-parse', 'HEAD']);
  const branch = git(root, ['branch', '--show-current']);
  const source = path.join(root, 'dist');
  if (lstatSync(source).isSymbolicLink()) throw new Error('dist no puede ser un enlace.');
  const webAssets = collectPublicFiles(source);
  const metadata = JSON.parse(
    readFileSync(path.join(root, 'output/android/regiomovil.json'), 'utf8'),
  );
  validateReleaseInputs({ root, webAssets, metadata, config, commit });
  const destination = path.join(root, 'output/publicacion', config.version);
  const temporary = `${destination}.preparing`;
  if (existsSync(destination))
    throw new Error(
      `Ya existe ${destination}. Conserva o retira ese paquete antes de regenerarlo.`,
    );
  if (existsSync(temporary))
    throw new Error(`Existe un empaquetado incompleto: ${temporary}. Revísalo antes de continuar.`);
  mkdirSync(temporary, { recursive: true });
  try {
    const zip = path.join(temporary, 'regiomovil-web.zip');
    createWebArchive(source, zip, webAssets);
    if (fingerprint(collectPublicFiles(source)) !== fingerprint(webAssets))
      throw new Error('dist cambió durante el empaquetado. Vuelve a compilar.');
    copyFileSync(
      path.join(root, 'output/android/regiomovil.apk'),
      path.join(temporary, 'regiomovil.apk'),
    );
    if (sha256(readFileSync(path.join(temporary, 'regiomovil.apk'))) !== metadata.sha256)
      throw new Error('El APK cambió durante el empaquetado. Reconstruye la entrega.');
    copyFileSync(
      path.join(root, `docs/releases/${config.version}.md`),
      path.join(temporary, 'NOTAS.md'),
    );
    const artifacts = ['regiomovil-web.zip', 'regiomovil.apk', 'NOTAS.md'].map((file) => {
      const bytes = readFileSync(path.join(temporary, file));
      return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
    });
    const manifest = {
      ...config,
      commit,
      branch,
      backend: PUBLIC_API,
      webBundleSha256: metadata.webBundleSha256,
      artifacts,
      webAssets,
      status: 'Preparado localmente; no publicado ni validado en teléfono físico.',
    };
    writeFileSync(
      path.join(temporary, 'release-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const manifestBytes = readFileSync(path.join(temporary, 'release-manifest.json'));
    writeFileSync(
      path.join(temporary, 'SHA256SUMS.txt'),
      [
        ...artifacts.map((file) => `${file.sha256}  ${file.path}`),
        `${sha256(manifestBytes)}  release-manifest.json`,
      ].join('\n') + '\n',
    );
    if (
      git(root, ['status', '--porcelain', '--untracked-files=all']) ||
      git(root, ['rev-parse', 'HEAD']) !== commit
    )
      throw new Error(
        'El repositorio cambió durante el empaquetado. Repite desde la revisión final.',
      );
    renameSync(temporary, destination);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 2) {
    console.error('Uso: node scripts/prepare-release.mjs (no publica ni compila)');
    process.exitCode = 1;
  } else {
    try {
      const destination = prepareRelease(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      );
      console.log(`Paquete verificado: ${destination}\nSin merge, push ni publicación automática.`);
    } catch (error) {
      console.error(`Publicación: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
