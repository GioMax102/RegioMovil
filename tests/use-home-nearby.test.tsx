import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import type { HomeCandidate, HomeSelection } from '../src/components/homeTypes';
import type { PositionFix } from '../src/mobility/location';
import type { NearbyIndex } from '../src/components/homeNearby';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/',
  pretendToBeVisual: true,
});
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'MutationObserver',
  'Event',
  'localStorage',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof Window],
  });
}
let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
const globals = globalThis as unknown as Record<string, unknown>;
let native = false;
globals.homeNearbyCore = { isNativePlatform: () => native };
let appState: ((state: { isActive: boolean }) => void) | undefined;
let removedNative = 0;
globals.homeNearbyApp = {
  addListener: async (_name: string, listener: typeof appState) => {
    appState = listener;
    return {
      remove: async () => {
        removedNative++;
        if (appState === listener) appState = undefined;
      },
    };
  },
};
let cache: PositionFix | null = null;
let permission = 'granted';
let permissionChecks = 0;
let read: () => Promise<PositionFix>;
let reads: { requestPermission?: boolean; signal?: AbortSignal }[] = [];
let loadIndex: () => Promise<NearbyIndex>;
let loads = 0;
let rankedOptions: { radius?: number; limit?: number }[] = [];
let selected: HomeSelection[] = [];
const index: NearbyIndex = {
  version: 1,
  revision: 'test',
  verifiedAt: '2026-11-05',
  origin: [24, -102],
  scale: 100000,
  routes: [
    { id: 'bus-a', code: 'A', name: 'Variante A', networkId: 'transmetro', geometryPack: 'a' },
  ],
  points: [[0, 0, 0, 'stop-a']],
};
const metro = (): HomeCandidate => ({
  selection: { kind: 'metro', stationId: 'padre-mier', source: 'nearby' },
  distanceMeters: 100,
  approximate: false,
});
let nearestMetro: HomeCandidate | undefined;
let ranking: HomeCandidate[];
const sample = (overrides: Partial<PositionFix> = {}): PositionFix => ({
  lat: 25.67,
  lng: -100.31,
  accuracy: 25,
  timestamp: Date.now() - 10,
  ...overrides,
});

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@capacitor/core')
      return { url: 'test:home-nearby-core', shortCircuit: true };
    if (specifier === '@capacitor/app') return { url: 'test:home-nearby-app', shortCircuit: true };
    if (context.parentURL?.includes('/useHomeNearby.') && specifier.endsWith('/mobility/location'))
      return { url: 'test:home-nearby-location', shortCircuit: true };
    if (context.parentURL?.includes('/useHomeNearby.') && specifier === './homeNearby')
      return { url: 'test:home-nearby-index', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    const source = {
      'test:home-nearby-core':
        'export const Capacitor = globalThis.homeNearbyCore; export const registerPlugin = () => ({});',
      'test:home-nearby-app': 'export const App = globalThis.homeNearbyApp;',
      'test:home-nearby-location':
        'export const {checkLocationPermission, forgetLocation, getRememberedLocation, isFreshLocation, readLocation} = globalThis.homeNearbyLocation;',
      'test:home-nearby-index':
        'export const {loadHomeNearby,rankHomeNearby} = globalThis.homeNearbyIndex;',
    }[url];
    return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
  },
});
const { isFreshLocation } = await import('../src/mobility/location');
globals.homeNearbyLocation = {
  isFreshLocation,
  checkLocationPermission: async () => {
    permissionChecks++;
    return permission;
  },
  forgetLocation: () => {
    cache = null;
  },
  getRememberedLocation: () => (isFreshLocation(cache) ? { ...cache } : null),
  readLocation: async (options: { requestPermission?: boolean; signal?: AbortSignal }) => {
    reads.push(options);
    const point = await read();
    if (!options.signal?.aborted) cache = point;
    return point; // Deliberately delivers late results to test the hook's own stale-result guard.
  },
};
globals.homeNearbyIndex = {
  loadHomeNearby: async (signal?: AbortSignal) => {
    assert.ok(signal instanceof AbortSignal);
    loads++;
    return loadIndex();
  },
  rankHomeNearby: (
    document: NearbyIndex,
    _point: PositionFix,
    stations: unknown[],
    options: { radius?: number; limit?: number },
  ) => {
    assert.ok(
      stations.length > 0,
      'Local Metro stations are ranked without downloading the graph.',
    );
    rankedOptions.push(options);
    return document.routes.length ? ranking : nearestMetro ? [nearestMetro] : [];
  },
};
const { useHomeNearby, HOME_NEARBY_PREFERENCE_KEY } =
  await import('../src/components/useHomeNearby');
const { renderHook, cleanup, act, waitFor } = await import('@testing-library/react');
const base: HomeSelection = { kind: 'metro', stationId: 'sendero', source: 'base' };
const onSelect = (selection: HomeSelection) => {
  selected.push(selection);
};
function mount(selection: HomeSelection = base, suspendAutomatic = false) {
  return renderHook((props) => useHomeNearby(props), {
    initialProps: { selection, onSelect, suspendAutomatic },
  });
}
beforeEach(() => {
  localStorage.clear();
  hidden = false;
  native = false;
  cache = null;
  permission = 'granted';
  permissionChecks = 0;
  reads = [];
  loads = 0;
  rankedOptions = [];
  selected = [];
  nearestMetro = metro();
  ranking = [metro()];
  removedNative = 0;
  appState = undefined;
  read = async () => sample();
  loadIndex = async () => index;
});
afterEach(cleanup);
after(() => {
  hooks.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
  for (const name of ['homeNearbyCore', 'homeNearbyApp', 'homeNearbyLocation', 'homeNearbyIndex'])
    delete globals[name];
});

test('clean opening never reads GPS or downloads the optional index; explicit consent stores only a boolean', async () => {
  const { result } = mount();
  assert.equal(permissionChecks, 0);
  assert.equal(reads.length, 0);
  assert.equal(loads, 0);
  assert.equal(result.current.enabled, false);
  await act(async () => result.current.findNearby());
  assert.equal(result.current.enabled, true);
  assert.equal(reads[0].requestPermission, true);
  assert.equal(loads, 1);
  assert.deepEqual(selected, [metro().selection]);
  assert.equal(localStorage.length, 1);
  assert.equal(localStorage.getItem(HOME_NEARBY_PREFERENCE_KEY), 'true');
  assert.equal(result.current.radius, 1200);
  assert.equal(result.current.canExpand, true);
});

test('returning web opening never calls geolocation even with granted permission; a current memory sample can be reused', async () => {
  localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, 'true');
  const first = mount();
  await waitFor(() => assert.match(first.result.current.message, /Actualizar cercanos/));
  assert.equal(reads.length, 0);
  assert.equal(loads, 0);
  first.unmount();
  cache = sample();
  const second = mount();
  await waitFor(() => assert.equal(second.result.current.candidates.length, 1));
  assert.equal(reads.length, 0);
  assert.equal(loads, 1);
  assert.deepEqual(selected, [metro().selection]);
});

test('an authorized native opening uses one strict acquisition and a revoked read does not trigger an explicit retry', async () => {
  native = true;
  localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, 'true');
  read = async () => {
    throw new Error('Permiso revocado');
  };
  const { result } = mount();
  await waitFor(() => assert.match(result.current.message, /Permiso revocado/));
  assert.equal(reads.length, 1);
  assert.equal(reads[0].requestPermission, false);
  assert.equal(loads, 0);
  assert.deepEqual(selected, []);
  await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')));
  assert.equal(reads.length, 1, 'No retry loop while the same entry stays visible.');
});

test('approximate or uncertainty-boundary fixes only suggest; a saved manual context never auto-switches', async () => {
  const first = mount();
  read = async () => sample({ accuracy: 250 });
  ranking = [{ ...metro(), approximate: true }];
  await act(async () => first.result.current.findNearby());
  assert.equal(selected.length, 0);
  assert.match(first.result.current.message, /aproximadas/);
  first.unmount();
  const second = mount();
  nearestMetro = { ...metro(), distanceMeters: 1190, approximate: false };
  read = async () => sample({ accuracy: 30 });
  await act(async () => second.result.current.findNearby());
  assert.equal(selected.length, 0);
  second.unmount();
  const third = mount({ ...base, source: 'manual' });
  nearestMetro = metro();
  await act(async () => third.result.current.findNearby());
  assert.equal(selected.length, 0);
});

test('picker-suspended explicit acquisition orders suggestions without confirming the dialog draft', async () => {
  const { result } = mount(base, true);
  await act(async () => result.current.findNearby());
  assert.equal(result.current.candidates.length, 1);
  assert.equal(selected.length, 0);
  assert.equal(reads.length, 1);
});

test('a manual selection or report opening invalidates an outstanding GPS result', async () => {
  for (const report of [false, true]) {
    const pending = Promise.withResolvers<PositionFix>();
    read = () => pending.promise;
    const hook = mount();
    let running: Promise<void>;
    await act(async () => {
      running = hook.result.current.findNearby();
    });
    if (report) hook.rerender({ selection: base, onSelect, suspendAutomatic: true });
    else
      hook.rerender({
        selection: { ...base, source: 'manual' },
        onSelect,
        suspendAutomatic: false,
      });
    assert.equal(reads.at(-1)?.signal?.aborted, true);
    await act(async () => {
      pending.resolve(sample());
      await running!;
    });
    assert.equal(hook.result.current.busy, false);
    assert.deepEqual(hook.result.current.candidates, []);
    assert.equal(selected.length, 0);
    hook.unmount();
  }
});

test('closing, disabling or unmounting suppresses a late index response and does not persist coordinates', async () => {
  for (const action of ['cancel', 'disable', 'unmount'] as const) {
    const pending = Promise.withResolvers<NearbyIndex>();
    loadIndex = () => pending.promise;
    const hook = mount();
    let running: Promise<void>;
    await act(async () => {
      running = hook.result.current.findNearby();
    });
    await waitFor(() => assert.equal(hook.result.current.busy, true));
    await act(async () => {
      if (action === 'cancel') hook.result.current.cancelPending();
      else if (action === 'disable') hook.result.current.disable();
      else hook.unmount();
    });
    await act(async () => {
      pending.resolve(index);
      await running!;
    });
    assert.equal(selected.length, 0);
    if (action !== 'unmount') {
      assert.deepEqual(hook.result.current.candidates, []);
      hook.unmount();
    }
    if (action === 'disable')
      assert.equal(localStorage.getItem(HOME_NEARBY_PREFERENCE_KEY), 'false');
    assert.equal(localStorage.length, 1);
  }
});

test('radius expands to 3 km only on explicit action, retaining the eight-candidate limit without another GPS read', async () => {
  const { result } = mount();
  await act(async () => result.current.findNearby());
  assert.equal(result.current.radius, 1200);
  await act(async () => result.current.expandRadius());
  assert.equal(result.current.radius, 3000);
  assert.equal(result.current.canExpand, false);
  assert.equal(reads.length, 1);
  assert.ok(rankedOptions.some((options) => options.radius === 3000 && options.limit === 8));
  await act(async () => result.current.expandRadius());
  assert.equal(reads.length, 1);
});

test('backgrounding discards a late sample; native foreground refreshes at most once and releases its listener', async () => {
  native = true;
  localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, 'true');
  const pending = Promise.withResolvers<PositionFix>();
  read = () => pending.promise;
  const hook = mount();
  await waitFor(() => assert.equal(reads.length, 1));
  await waitFor(() => assert.ok(appState));
  await act(async () => appState!({ isActive: false }));
  assert.equal(reads[0].signal?.aborted, true);
  await act(async () => pending.resolve(sample()));
  assert.equal(selected.length, 0);
  assert.equal(loads, 0);
  read = async () => sample();
  await act(async () => appState!({ isActive: true }));
  await waitFor(() => assert.equal(hook.result.current.candidates.length, 1));
  assert.equal(reads.length, 2);
  await act(async () => appState!({ isActive: true }));
  assert.equal(reads.length, 2);
  hook.unmount();
  await new Promise(setImmediate);
  assert.equal(removedNative, 1);
});

test('stale/invalid samples and denied permission leave the base selection available', async () => {
  const first = mount();
  read = async () => sample({ timestamp: Date.now() - 61_000 });
  await act(async () => first.result.current.findNearby());
  assert.match(first.result.current.message, /antigua/);
  assert.equal(loads, 0);
  assert.equal(selected.length, 0);
  first.unmount();
  permission = 'denied';
  cache = sample();
  const second = mount();
  await waitFor(() => assert.match(second.result.current.message, /desactivado/));
  assert.equal(selected.length, 0);
  assert.equal(cache, null);
});

test('StrictMode effect replay makes at most one native acquisition and releases both subscription handles', async () => {
  native = true;
  localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, 'true');
  const hook = renderHook((props) => useHomeNearby(props), {
    initialProps: { selection: base, onSelect, suspendAutomatic: false },
    reactStrictMode: true,
  });
  await waitFor(() => assert.equal(hook.result.current.candidates.length, 1));
  assert.equal(reads.length, 1);
  assert.equal(reads[0].requestPermission, false);
  assert.equal(loads, 1);
  assert.equal(selected.length, 1);
  hook.unmount();
  await new Promise(setImmediate);
  assert.equal(removedNative, 2);
});

test('a closer bus is suggested first but automatic confirmation remains Metro-only', async () => {
  ranking = [
    {
      selection: { kind: 'bus', route: index.routes[0], stopId: 'bus-a:stop-a', source: 'nearby' },
      distanceMeters: 10,
    },
    metro(),
  ];
  const { result } = mount();
  await act(async () => result.current.findNearby());
  assert.equal(result.current.candidates[0].selection.kind, 'bus');
  assert.deepEqual(selected, [metro().selection]);
});

test('web unknown permission may show a previously consented memory sample but never auto-confirms it', async () => {
  permission = 'unknown';
  cache = sample();
  localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, 'true');
  const { result } = mount();
  await waitFor(() => assert.equal(result.current.candidates.length, 1));
  assert.equal(reads.length, 0);
  assert.equal(selected.length, 0);
});

test('pagehide aborts even before document.hidden changes and removes the loading status', async () => {
  const pending = Promise.withResolvers<PositionFix>();
  read = () => pending.promise;
  const hook = mount();
  let running: Promise<void>;
  await act(async () => {
    running = hook.result.current.findNearby();
  });
  assert.equal(hidden, false);
  await act(async () => window.dispatchEvent(new dom.window.Event('pagehide')));
  assert.equal(reads[0].signal?.aborted, true);
  assert.equal(hook.result.current.busy, false);
  assert.doesNotMatch(hook.result.current.message, /Buscando/);
  await act(async () => {
    pending.resolve(sample());
    await running!;
  });
  assert.equal(selected.length, 0);
  assert.equal(loads, 0);
});

test('an expired sample asks for explicit refresh instead of silently expanding or starting GPS', async () => {
  const point = sample();
  read = async () => point;
  const { result } = mount();
  await act(async () => result.current.findNearby());
  point.timestamp -= 61_000;
  await act(async () => result.current.expandRadius());
  assert.equal(result.current.radius, 1200);
  assert.equal(result.current.canExpand, false);
  assert.match(result.current.message, /Actualiza Cerca de mí antes de ampliar/);
  assert.equal(reads.length, 1);
});

test('a queued native foreground event after unmount cannot restart permission or GPS work', async () => {
  native = true;
  localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, 'true');
  const hook = mount();
  await waitFor(() => assert.equal(hook.result.current.candidates.length, 1));
  await waitFor(() => assert.ok(appState));
  const lateForeground = appState!;
  const priorChecks = permissionChecks;
  const priorReads = reads.length;
  hook.unmount();
  await act(async () => lateForeground({ isActive: true }));
  assert.equal(permissionChecks, priorChecks);
  assert.equal(reads.length, priorReads);
});
