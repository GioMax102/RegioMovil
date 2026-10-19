import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleaseConfig } from '../scripts/release-config.mjs';
import {
  collectPublicFiles,
  createWebArchive,
  PUBLIC_API,
  validateReleaseInputs,
} from '../scripts/prepare-release.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'regiomovil-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (relative, content) => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), content);
  };
  write('package.json', JSON.stringify({ version: '1.1.0' }));
  write(
    'android/app/build.gradle',
    'applicationId "mx.regiomovil.app"\nversionName "1.1.0"\nversionCode 2\n',
  );
  const files = {
    'index.html': '<!doctype html><script type="module" src="/assets/app.js"></script>',
    'sw.js': '// public worker',
    _headers: `/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' ${PUBLIC_API}`,
    'acceso.html': '<a href="/">Abrir</a>',
    'privacidad.html': 'Privacidad',
    'manifest.webmanifest': '{}',
    'bundle-stats.json': '{}',
    'assets/app.js': `const api=${JSON.stringify(PUBLIC_API)};fetch(api+'/api/places/suggest?q=parque');fetch(api+'/api/reports');`,
    'assets/font.woff2': 'font fixture',
  };
  for (const [file, contents] of Object.entries(files)) write(`dist/${file}`, contents);
  const webAssets = collectPublicFiles(path.join(root, 'dist'));
  const apk = Buffer.from('signed APK fixture');
  write('output/android/regiomovil.apk', apk);
  const config = readReleaseConfig(root);
  const commit = 'a'.repeat(40);
  const metadata = {
    ...config,
    commit,
    variant: 'release',
    backend: PUBLIC_API,
    bytes: apk.length,
    sha256: hash(apk),
    webAssets,
    webBundleSha256: hash(JSON.stringify(webAssets)),
  };
  return { root, write, webAssets, metadata, config, commit };
}

test('release configuration rejects divergent versions instead of labelling another Android build', (t) => {
  const f = fixture(t);
  assert.deepEqual(readReleaseConfig(f.root), {
    appId: 'mx.regiomovil.app',
    version: '1.1.0',
    versionCode: 2,
  });
  f.write('package.json', '{"version":"2.0.0"}');
  assert.throws(() => readReleaseConfig(f.root), /deben coincidir/);
  f.write('package.json', '{"version":"1.1.0"}');
  f.write(
    'android/app/build.gradle',
    'applicationId "mx.regiomovil.app"\nversionName "1.1.0"\nversionCode 0',
  );
  assert.throws(() => readReleaseConfig(f.root), /versionCode/);
});

test('Android release CLI rejects local APIs and stale-web shortcuts before building', () => {
  const script = fileURLToPath(new URL('../scripts/android-build.mjs', import.meta.url));
  for (const entry of [
    { args: ['--release'], api: 'http://localhost:4173', message: /requiere una API HTTPS/ },
    { args: ['--release', '--dev-local-api'], api: '', message: /no puede usar una API local/ },
    { args: ['--release', '--skip-web'], api: PUBLIC_API, message: /requiere reconstruir la web/ },
  ]) {
    const result = spawnSync(process.execPath, [script, ...entry.args], {
      env: { ...process.env, VITE_API_BASE_URL: entry.api },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1, result.error?.message);
    assert.match(result.stderr, entry.message);
  }
});

test('packaging rejects hidden files, signing material, source maps and symbolic links', (t) => {
  const f = fixture(t);
  for (const file of [
    '.env',
    'release.jks',
    'store-password.txt',
    'assets/app.js.map',
    'old.apk',
  ]) {
    f.write(`dist/${file}`, 'must never be public');
    assert.throws(() => collectPublicFiles(path.join(f.root, 'dist')), /no permitido|no público/);
    rmSync(path.join(f.root, 'dist', file));
  }
  symlinkSync(path.join(f.root, 'package.json'), path.join(f.root, 'dist', 'public.json'));
  assert.throws(() => collectPublicFiles(path.join(f.root, 'dist')), /enlace/);
});

test('release validation rejects debug, HTTP, wrong revision, stale web and modified APK', (t) => {
  const f = fixture(t);
  assert.doesNotThrow(() => validateReleaseInputs(f));
  for (const change of [
    { variant: 'debug' },
    { backend: 'http://localhost:4173' },
    { backend: 'https://unrelated.example' },
    { versionCode: 1 },
    { commit: 'b'.repeat(40) },
    { webBundleSha256: 'stale' },
  ])
    assert.throws(() => validateReleaseInputs({ ...f, metadata: { ...f.metadata, ...change } }));
  f.write('output/android/regiomovil.apk', 'modified');
  assert.throws(() => validateReleaseInputs(f), /integridad/);
});

test('an HTTPS link in help or headers cannot conceal an offline runtime API build', (t) => {
  const f = fixture(t);
  f.write(
    'dist/assets/app.js',
    "const api='';fetch(api+'/api/places/suggest?q=parque');fetch(api+'/api/reports');",
  );
  const webAssets = collectPublicFiles(path.join(f.root, 'dist'));
  const metadata = { ...f.metadata, webAssets, webBundleSha256: hash(JSON.stringify(webAssets)) };
  assert.throws(() => validateReleaseInputs({ ...f, webAssets, metadata }), /API de producción/);
});

test('web ZIP contains root-level public bytes and stays reproducible across filesystem times', (t) => {
  const f = fixture(t);
  const first = path.join(f.root, 'first.zip');
  const second = path.join(f.root, 'second.zip');
  createWebArchive(path.join(f.root, 'dist'), first, f.webAssets);
  utimesSync(path.join(f.root, 'dist/index.html'), new Date(), new Date());
  createWebArchive(path.join(f.root, 'dist'), second, f.webAssets);
  assert.equal(hash(readFileSync(first)), hash(readFileSync(second)));
  const python = process.platform === 'win32' ? 'py' : 'python3';
  const args = [
    ...(process.platform === 'win32' ? ['-3'] : []),
    '-c',
    'import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',
    first,
  ];
  const result = spawnSync(python, args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout),
    f.webAssets.map((file) => file.path),
  );
  assert.ok(JSON.parse(result.stdout).includes('index.html'));
  f.write('dist/index.html', 'changed during packaging');
  assert.throws(
    () => createWebArchive(path.join(f.root, 'dist'), path.join(f.root, 'bad.zip'), f.webAssets),
    /dist changed/,
  );
});
