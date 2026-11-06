/** Public cache/integrity boundaries; no server, account data or browser automation. */
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost/' });
const names = ['navigator', 'location', 'caches', 'fetch', 'crypto'] as const;
const previous = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
Object.defineProperty(globalThis, 'location', { configurable: true, value: dom.window.location });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
const { loadRoutePack, readPublicDocument } = await import('../src/api');
const { decodeRoutePack } = await import('../src/routeIntegrity');
let stored: Map<string, Response>;
let requests: string[];
let writes: string[];
let matches: string[];
let fetcher: (url: string, options?: RequestInit) => Promise<Response>;
const body = JSON.stringify({
  id: 'sample',
  coordinates: [
    [-100.4, 25.7],
    [-100.39, 25.71],
  ],
  stops: [],
  stopOrderVerified: false,
});
const revision = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);
const path = (hash = revision(body)) => `/route-packs/sample.json?v=${hash}`;
beforeEach(() => {
  stored = new Map();
  requests = [];
  writes = [];
  matches = [];
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  fetcher = async () => new Response(body);
  globalThis.fetch = async (input, options) => {
    requests.push(String(input));
    return fetcher(String(input), options);
  };
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      async open() {
        return {
          async keys() {
            return [...stored.keys()].map((url) => ({ url: new URL(url, location.origin).href }));
          },
          async match(url: string) {
            matches.push(url);
            return stored.get(url)?.clone();
          },
          async put(url: string, response: Response) {
            writes.push(url);
            stored.set(url, response.clone());
          },
          async delete(key: { url: string }) {
            return stored.delete(new URL(key.url).pathname + new URL(key.url).search);
          },
        };
      },
    },
  });
});
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

test('route revisions verify exact UTF-8 bytes before entering the public cache', async () => {
  const text = JSON.stringify({ ...JSON.parse(body), notes: 'Fuente pública · estación ñ' });
  fetcher = async () => new Response(text);
  const hash = revision(text);
  const result = await loadRoutePack({ geometryPack: 'sample', geometryRevision: hash });
  assert.equal(result.data.id, 'sample');
  assert.equal(result.offline, false);
  assert.deepEqual(requests, [path(hash)]);
  assert.deepEqual(writes, [path(hash)]);
  assert.equal(await stored.get(path(hash))!.text(), text);
  await assert.rejects(decodeRoutePack(text + ' ', hash), /cambió de revisión/);
});

test('a mismatched network body cannot poison a revision cache, while a matching cached document remains usable offline', async () => {
  fetcher = async () => new Response(body + ' ');
  await assert.rejects(loadRoutePack({ geometryPack: 'sample', geometryRevision: revision(body) }));
  assert.deepEqual(writes, []);
  stored.set(path(), new Response(body));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  requests = [];
  const result = await loadRoutePack({ geometryPack: 'sample', geometryRevision: revision(body) });
  assert.equal(result.offline, true);
  assert.equal(result.data.id, 'sample');
  assert.deepEqual(requests, []);
});

test('a corrupted cached revision is rechecked and replaced by validated network bytes', async () => {
  stored.set(path(), new Response(body + '\n'));
  const result = await loadRoutePack({ geometryPack: 'sample', geometryRevision: revision(body) });
  assert.equal(result.data.id, 'sample');
  assert.deepEqual(requests, [path()]);
  assert.equal(await stored.get(path())!.text(), body);
});

test('a canceled public lookup never fetches or falls back to cached data', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readPublicDocument('/catalog.json', false, controller.signal), {
    name: 'AbortError',
  });
  assert.deepEqual(requests, []);
  assert.deepEqual(matches, []);
  const active = new AbortController();
  fetcher = async () => {
    active.abort();
    return new Response(body);
  };
  await assert.rejects(loadRoutePack({ geometryPack: 'sample' }, active.signal), {
    name: 'AbortError',
  });
  assert.deepEqual(writes, []);
  assert.deepEqual(matches, []);
});

test('canceling during cached decoding cannot leak a previous context or start a new request', async () => {
  const controller = new AbortController();
  stored.set('/catalog.json', new Response('{"version":1}'));
  await assert.rejects(
    readPublicDocument('/catalog.json', true, controller.signal, async (text) => {
      controller.abort();
      return JSON.parse(text);
    }),
    { name: 'AbortError' },
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(writes, []);
});

test('malformed coordinate arrays receive an actionable validation error after integrity verification', async () => {
  const malformed = JSON.stringify({ ...JSON.parse(body), coordinates: [[-100.4, 25.7], null] });
  fetcher = async () => new Response(malformed);
  await assert.rejects(
    loadRoutePack({ geometryPack: 'sample', geometryRevision: revision(malformed) }),
    /no pasó la validación de coordenadas/,
  );
});
