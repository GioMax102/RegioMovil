import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const origin = 'https://regiomovil.test';
const assets = ['index-Abc12345.js', 'index-Qwe56789.css', 'inter-latin-Dx4kXJAl.woff2', 'nested/montserrat-latin-l_AIctKy.woff2', 'monterrey-map-Abc12345.svg'];
let directory;
let worker;

async function finalize() {
  await execute(process.execPath, [join(root, 'scripts/finalize-web.mjs')], {cwd:directory});
  return readFile(join(directory, 'dist/sw.js'), 'utf8');
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'regiomovil-offline-'));
  await mkdir(join(directory, 'public'));
  await mkdir(join(directory, 'dist/assets/nested'), {recursive:true});
  await writeFile(join(directory, 'public/sw.js'), await readFile(join(root, 'public/sw.js')));
  await writeFile(join(directory, 'dist/index.html'), '<!doctype html><title>RegioMovil</title><script type="module" src="/assets/index-Abc12345.js"></script>');
  for (const file of ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', ...assets.map(asset => `assets/${asset}`)]) {
    await writeFile(join(directory, 'dist', file), `public asset: ${file}`);
  }
  await writeFile(join(directory, 'dist/assets/index-Abc12345.js.map'), 'private source map');
  worker = await finalize();
});
after(async () => { if (directory) await rm(directory, {recursive:true,force:true}); });

/** Implements observable Fetch/Cache behavior; the worker itself is executed unchanged. */
function workerHarness(source = worker) {
  const listeners = new Map();
  const buckets = new Map();
  const storedHeaders = new Map();
  const deleted = [];
  const fetched = [];
  const added = [];
  const opened = [];
  let offline = false;
  let varyOrigin = false;
  let navigationText = 'fresh application shell';
  let navigationStatus = 200;
  let claims = 0;
  let waitingSkipped = 0;
  const address = input => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const response = (text, headers = {}) => new Response(text, {headers:{'Content-Type':'text/plain',...headers}});
  const cache = name => {
    if (!buckets.has(name)) {
      buckets.set(name, new Map());
      storedHeaders.set(name, new Map());
    }
    return buckets.get(name);
  };
  const requestHeaders = request => new Headers(typeof request === 'string' ? undefined : request.headers);
  const save = (name, request, result) => {
    cache(name).set(address(request), result.clone());
    storedHeaders.get(name).set(address(request), requestHeaders(request));
  };
  function match(name, request, options = {}) {
    const requested = new URL(address(request));
    for (const [url, result] of cache(name)) {
      const stored = new URL(url);
      if (options.ignoreSearch) {requested.search='';stored.search='';}
      if (stored.href !== requested.href) continue;
      if (!options.ignoreVary) {
        const vary = (result.headers.get('Vary') || '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean);
        const previous = storedHeaders.get(name).get(url) || new Headers();
        const current = requestHeaders(request);
        if (vary.some(header => header === '*' || previous.get(header) !== current.get(header))) continue;
      }
      return result.clone();
    }
  }
  async function network(input) {
    const url = address(input);
    fetched.push(url);
    if (offline) throw new TypeError('Network is offline');
    if (input?.mode === 'navigate') return new Response(navigationText, {status:navigationStatus});
    return response(`downloaded: ${new URL(url).pathname}`, varyOrigin ? {Vary:'Origin'} : {});
  }
  const caches = {
    async open(name) {
      opened.push(name);
      cache(name);
      return {
        async addAll(requests) {
          added.push(...requests);
          for (const request of requests) {
            const result = await network(request);
            if (!result.ok) throw new TypeError('Failed precache');
            save(name, request, result);
          }
        },
        async put(request, result) { save(name, request, result); },
        async match(request, options) { return match(name, request, options); },
      };
    },
    async match(request, options) {
      for (const name of buckets.keys()) {
        const result = match(name, request, options);
        if (result) return result;
      }
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { deleted.push(name); return buckets.delete(name); },
  };
  const self = {
    location:{origin},
    addEventListener(type, handler) { listeners.set(type, handler); },
    skipWaiting() { waitingSkipped++; },
    clients:{async claim() {claims++;}},
  };
  runInNewContext(source, {self,caches,fetch:network,URL,Response}, {filename:'finalized-sw.js',timeout:1000});
  return {
    fetched,added,opened,deleted,buckets,
    get claims() {return claims;}, get waitingSkipped() {return waitingSkipped;},
    setOffline(value = true) {offline = value;},
    setVaryOrigin(value = true) {varyOrigin = value;},
    setNavigation(text, status = 200) {navigationText = text;navigationStatus = status;},
    seed(name, path, text) {cache(name).set(address(path), response(text));},
    async cached(path, headers) {return caches.match({url:address(path),headers});},
    async lifecycle(type) {
      const pending = [];
      listeners.get(type)({waitUntil(value) {pending.push(value);}});
      await Promise.all(pending);
    },
    async fetch(path, options = {}) {
      let pending;
      const completion = [];
      const request = {url:new URL(path,origin).href,method:'GET',mode:'cors',...options};
      listeners.get('fetch')({request,respondWith(value) {assert.equal(pending,undefined);pending=Promise.resolve(value);},waitUntil(value) {completion.push(value);}});
      if (!pending) return {intercepted:false};
      const result = await pending;
      await Promise.all(completion);
      return {intercepted:true,response:result};
    },
  };
}

test('finalizer precaches hashed JavaScript, CSS and local fonts before any page visit', async () => {
  assert.ok(!worker.includes('/* BUILD_ASSETS */ []'));
  const harness = workerHarness();
  await harness.lifecycle('install');
  assert.match(harness.opened[0], /^regiomovil-shell-[a-f0-9]{12}$/);
  assert.equal(harness.waitingSkipped, 1);
  for (const asset of assets) assert.ok(harness.added.includes(`/assets/${asset}`), `Missing first-install asset: ${asset}`);
  assert.ok(harness.added.includes('/index.html'));
  assert.ok(!harness.added.some(path => path.endsWith('.map') || path.startsWith('/api')));
  harness.setOffline();
  const requestsBefore = harness.fetched.length;
  for (const asset of assets) {
    const result = await harness.fetch(`/assets/${asset}`);
    assert.equal(result.intercepted, true);
    assert.equal(result.response.status, 200);
    assert.match(await result.response.text(), /downloaded:/);
  }
  assert.equal(harness.fetched.length, requestsBefore, 'Precached resources must be usable without fetching the network.');
});

test('offline static assets survive Vary Origin differences between precache and CORS requests', async () => {
  const harness = workerHarness();
  harness.setVaryOrigin();
  await harness.lifecycle('install');
  harness.setOffline();
  const requestsBefore = harness.fetched.length;
  for (const asset of assets) {
    const path = `/assets/${asset}`;
    const headers = {Origin:origin};
    assert.equal(await harness.cached(path,headers), undefined, 'A normal Vary match must reject the different Origin header.');
    const result = await harness.fetch(path,{mode:'cors',headers});
    assert.equal(result.intercepted, true);
    assert.equal(result.response.status, 200);
    assert.equal(await result.response.text(), `downloaded: ${path}`);
  }
  assert.equal(harness.fetched.length, requestsBefore, 'CORS assets must load from precache while offline.');
  await assert.rejects(harness.fetch('/assets/index-Abc12345.js?different-revision=1',{headers:{Origin:origin}}), /Network is offline/);
  assert.equal(harness.fetched.at(-1), `${origin}/assets/index-Abc12345.js?different-revision=1`, 'Ignoring Vary must preserve URL query matching.');
});

test('worker bypasses API, POST and other origins without reading or writing caches', async () => {
  const harness = workerHarness();
  for (const [path, options] of [
    ['/api', {mode:'navigate'}], ['/api/board?station=padre-mier', {}], ['/api/reports', {}],
    ['/api/reports', {method:'POST'}], ['/assets/index-Abc12345.js', {method:'POST'}],
    ['https://external.example/assets/index-Abc12345.js', {}],
  ]) assert.equal((await harness.fetch(path,options)).intercepted, false, `${options.method || 'GET'} ${path} should bypass the worker.`);
  assert.equal(harness.fetched.length, 0);
  assert.equal(harness.opened.length, 0);
  assert.equal(harness.buckets.size, 0);
});

test('navigation resolves the installed application shell when fetch fails', async () => {
  const harness = workerHarness();
  await harness.lifecycle('install');
  harness.setOffline();
  const result = await harness.fetch('/planear/universidad', {mode:'navigate'});
  assert.equal(result.intercepted, true);
  assert.equal(result.response.status, 200);
  assert.equal(await result.response.text(), 'downloaded: /index.html');
});

test('successful navigation persists its shell before completion; failed HTTP does not replace it', async () => {
  const harness = workerHarness();
  await harness.lifecycle('install');
  harness.setNavigation('new application shell');
  const fresh = await harness.fetch('/planear', {mode:'navigate'});
  assert.equal(await fresh.response.text(), 'new application shell');
  harness.setNavigation('server unavailable', 503);
  assert.equal((await harness.fetch('/planear', {mode:'navigate'})).response.status, 503);
  harness.setOffline();
  const fallback = await harness.fetch('/planear', {mode:'navigate'});
  assert.equal(await fallback.response.text(), 'new application shell');
});

test('activation removes previous shell caches and preserves unrelated caches and the current shell', async () => {
  const harness = workerHarness();
  await harness.lifecycle('install');
  const current = harness.opened[0];
  harness.seed('regiomovil-shell-previous', '/old.js', 'old');
  harness.seed('another-application-cache', '/other', 'other');
  harness.seed('regiomovil-preferences', '/preferences', 'preferences');
  await harness.lifecycle('activate');
  assert.deepEqual(harness.deleted, ['regiomovil-shell-previous']);
  assert.ok(harness.buckets.has(current));
  assert.ok(harness.buckets.has('another-application-cache'));
  assert.ok(harness.buckets.has('regiomovil-preferences'));
  assert.equal(harness.claims, 1);
});

test('changing public shell content changes the worker version even when asset filenames are identical', async () => {
  const before = worker;
  const same = await finalize();
  assert.equal(same, before, 'Identical inputs should produce an identical service worker.');
  await writeFile(join(directory, 'dist/icon.svg'), 'updated public icon with same filename');
  const changed = await finalize();
  const version = source => source.match(/const CACHE = '([^']+)'/)[1];
  assert.notEqual(version(changed), version(before));
  const stats = JSON.parse(await readFile(join(directory, 'dist/bundle-stats.json'), 'utf8'));
  assert.equal(stats.totalBytes, stats.files.reduce((sum,file) => sum + file.bytes,0));
  assert.ok(!stats.files.some(file => file.file.endsWith('.map')));
});

test('current production build precaches the base graph and stores deferred experiment assets when opened', async t => {
  let production;
  try {production = await readFile(join(root,'dist/sw.js'),'utf8');}
  catch (error) {if (error.code === 'ENOENT') {t.skip('Run npm run build to also verify the production artifact.');return;} throw error;}
  const harness = workerHarness(production);
  await harness.lifecycle('install');
  const files = (await readdir(join(root,'dist/assets'))).filter(file => /\.(?:js|css|woff2|svg)$/.test(file));
  assert.ok(files.some(file => /-[\w-]{8,}\.js$/.test(file)));
  assert.ok(files.some(file => /-[\w-]{8,}\.css$/.test(file)));
  assert.ok(files.filter(file => file.endsWith('.woff2')).length >= 2);
  assert.ok(files.some(file => /^monterrey-map-.*\.svg$/.test(file)), 'The real Monterrey basemap must ship for offline journeys.');
  const stats = JSON.parse(await readFile(join(root,'dist/bundle-stats.json'),'utf8'));
  const initial = stats.files.filter(file => file.file.startsWith('assets/')).map(file => `/${file.file}`);
  for (const file of initial) assert.ok(harness.added.includes(file), `Production precache is missing ${file}`);
  for (const file of files.filter(file => /\.(?:woff2|svg)$/.test(file))) assert.ok(initial.includes(`/assets/${file}`));
  for (const path of stats.deferredAssets || []) {
    assert.ok(!harness.added.includes(path), `${path} must not increase the initial install.`);
    const opened = await harness.fetch(path);
    assert.equal(opened.response.status, 200);
  }
  harness.setOffline();
  for (const path of stats.deferredAssets || []) {
    const offline = await harness.fetch(path);
    assert.equal(offline.response.status, 200, `${path} should remain available after opening the experiment.`);
  }
});
