import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const values = new Map();
const released = [];
let restored;
let removed = 0;
let request;
globalThis.reportPhotoTestCore = {
  getPlatform: () => 'android',
  isPluginAvailable: () => true,
  convertFileSrc: (uri) => `https://localhost/_capacitor_file_${new URL(uri).pathname}`,
};
globalThis.reportPhotoTestBridge = {
  choose(options) {
    return new Promise((resolve, reject) => {
      request = { options, resolve, reject };
    });
  },
  release: async (options) => {
    released.push(options.uri);
  },
};
globalThis.reportPhotoTestApp = {
  addListener: async (_, callback) => {
    restored = callback;
    return {
      remove: async () => {
        removed++;
      },
    };
  },
};
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@capacitor/core')
      return { url: 'test:report-photo-core', shortCircuit: true };
    if (specifier === '@capacitor/app') return { url: 'test:report-photo-app', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:report-photo-core')
      return {
        format: 'module',
        source:
          'export const Capacitor = globalThis.reportPhotoTestCore; export const registerPlugin = () => globalThis.reportPhotoTestBridge;',
        shortCircuit: true,
      };
    if (url === 'test:report-photo-app')
      return {
        format: 'module',
        source: 'export const App = globalThis.reportPhotoTestApp;',
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { pickReportPhoto, listenForRestoredReportPhoto } = await import('../src/reportCamera.ts');
const realFetch = globalThis.fetch;
test.after(() => {
  hooks.deregister();
  globalThis.fetch = realFetch;
});
const pendingKey = 'regiomovil:report-camera-pending';
const uri = 'file:///data/user/0/mx.regiomovil.app/cache/shared/reports/report-test.jpg';
beforeEach(() => {
  values.clear();
  released.length = 0;
  request = undefined;
  restored = undefined;
  removed = 0;
  globalThis.fetch = async () => ({
    ok: true,
    blob: async () => new Blob(['photo'], { type: 'image/jpeg' }),
  });
});

test('native cancellation preserves the draft marker scope and does not read a photo', async () => {
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched++;
    throw new Error('must not fetch');
  };
  const result = pickReportPhoto('draft-1');
  assert.equal(JSON.parse(values.get(pendingKey)).draftId, 'draft-1');
  request.resolve({ requestId: request.options.requestId, cancelled: true });
  assert.equal(await result, null);
  assert.equal(values.get(pendingKey), undefined);
  assert.equal(fetched, 0);
});

test('a native result is copied into a File and its private temporary original is removed', async () => {
  const result = pickReportPhoto('draft-1');
  request.resolve({ requestId: request.options.requestId, uri, mime: 'image/png' });
  const file = await result;
  assert.ok(file instanceof File);
  assert.equal(file.type, 'image/png');
  assert.equal(await file.text(), 'photo');
  assert.deepEqual(released, [uri]);
});

test('a native read failure still releases the temporary original and leaves the form recoverable', async () => {
  globalThis.fetch = async () => new Response('', { status: 404 });
  const result = pickReportPhoto('draft-1');
  request.resolve({ requestId: request.options.requestId, uri });
  await assert.rejects(result, /No pudimos abrir la foto/);
  assert.deepEqual(released, [uri]);
  assert.equal(values.get(pendingKey), undefined);
});

test('restored results match both draft and selection token; stale events cannot attach a photo', async () => {
  let attached = 0;
  let errors = 0;
  const completion = Promise.withResolvers();
  const cleanup = await listenForRestoredReportPhoto(
    'current-draft',
    () => {
      attached++;
      completion.resolve();
    },
    () => {
      errors++;
      completion.resolve();
    },
  );
  const pending = {
    draftId: 'current-draft',
    requestId: crypto.randomUUID(),
    expiresAt: Date.now() + 60000,
  };
  values.set(pendingKey, JSON.stringify(pending));
  restored({ pluginId: 'Camera', methodName: 'getPhoto', success: true, data: { uri } });
  restored({
    pluginId: 'RegioReportPhoto',
    methodName: 'choose',
    success: true,
    data: { requestId: 'older-selection', uri },
  });
  assert.equal(attached, 0);
  assert.ok(values.get(pendingKey));
  restored({
    pluginId: 'RegioReportPhoto',
    methodName: 'choose',
    success: true,
    data: { requestId: pending.requestId, uri },
  });
  await completion.promise;
  assert.equal(attached, 1);
  assert.equal(errors, 0);
  assert.equal(values.get(pendingKey), undefined);
  cleanup();
  assert.equal(removed, 1);
});

test('unmount during a restored read suppresses a late photo callback', async () => {
  let resolveRead;
  let attached = 0;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      resolveRead = resolve;
    });
  const cleanup = await listenForRestoredReportPhoto(
    'draft-1',
    () => attached++,
    () => {},
  );
  const requestId = crypto.randomUUID();
  values.set(
    pendingKey,
    JSON.stringify({ draftId: 'draft-1', requestId, expiresAt: Date.now() + 60000 }),
  );
  restored({
    pluginId: 'RegioReportPhoto',
    methodName: 'choose',
    success: true,
    data: { requestId, uri },
  });
  cleanup();
  resolveRead({ ok: true, blob: async () => new Blob(['photo'], { type: 'image/jpeg' }) });
  await new Promise(setImmediate);
  assert.equal(attached, 0);
  assert.deepEqual(released, [uri]);
});

test('restored failures keep selection identity and do not consume a different draft', async () => {
  let errors = 0;
  const cleanup = await listenForRestoredReportPhoto(
    'draft-1',
    () => assert.fail('no photo expected'),
    () => errors++,
  );
  const requestId = crypto.randomUUID();
  const result = {
    pluginId: 'RegioReportPhoto',
    methodName: 'choose',
    success: true,
    data: { requestId, errorCode: 'INVALID_IMAGE' },
  };
  values.set(
    pendingKey,
    JSON.stringify({ draftId: 'draft-2', requestId, expiresAt: Date.now() + 60000 }),
  );
  restored(result);
  assert.ok(values.get(pendingKey));
  assert.equal(errors, 0);
  values.set(
    pendingKey,
    JSON.stringify({ draftId: 'draft-1', requestId, expiresAt: Date.now() + 60000 }),
  );
  restored(result);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(errors, 1);
  assert.equal(values.get(pendingKey), undefined);
  cleanup();
});
