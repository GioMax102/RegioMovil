import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { PositionFix } from '../src/mobility/location';

let native = false;
let permission: { coarse?: string; fine?: string } = {};
let readOptions: { requestPermission: boolean; requestId: string }[] = [];
let nativeRead: () => Promise<PositionFix>;
let checked = 0;
const cancelled: string[] = [];
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const globals = globalThis as unknown as Record<string, unknown>;
globals.locationPermissionCore = { isNativePlatform: () => native };
globals.locationPermissionBridge = {
  checkPermissions: async () => {
    checked++;
    return permission;
  },
  getCurrentPosition: async (options: { requestPermission: boolean; requestId: string }) => {
    readOptions.push(options);
    return nativeRead();
  },
  cancelCurrentPosition: async ({ id }: { id: string }) => {
    cancelled.push(id);
  },
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@capacitor/core'
      ? { url: 'test:location-permission-core', shortCircuit: true }
      : next(specifier, context);
  },
  load(url, context, next) {
    return url === 'test:location-permission-core'
      ? {
          format: 'module',
          shortCircuit: true,
          source:
            'export const Capacitor = globalThis.locationPermissionCore; export const registerPlugin = () => globalThis.locationPermissionBridge;',
        }
      : next(url, context);
  },
});
const {
  checkLocationPermission,
  readLocation,
  currentLocation,
  getRememberedLocation,
  forgetLocation,
  isFreshLocation,
} = await import('../src/mobility/location');
const fix = (overrides: Partial<PositionFix> = {}): PositionFix => ({
  lat: 25.67,
  lng: -100.31,
  accuracy: 25,
  timestamp: Date.now() - 10,
  ...overrides,
});
const navigatorWith = (value: object) =>
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value });

beforeEach(() => {
  native = false;
  permission = {};
  checked = 0;
  readOptions = [];
  cancelled.length = 0;
  nativeRead = async () => fix();
  forgetLocation();
  navigatorWith({});
});
after(() => {
  hooks.deregister();
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else Reflect.deleteProperty(globalThis, 'navigator');
  delete globals.locationPermissionCore;
  delete globals.locationPermissionBridge;
});

test('checking native coarse/fine permission is non-requesting and accepts approximate permission', async () => {
  native = true;
  permission = { coarse: 'granted', fine: 'prompt' };
  assert.equal(await checkLocationPermission(), 'granted');
  permission = { coarse: 'denied', fine: 'denied' };
  assert.equal(await checkLocationPermission(), 'denied');
  permission = { coarse: 'prompt-with-rationale', fine: 'prompt' };
  assert.equal(await checkLocationPermission(), 'prompt');
  permission = {};
  assert.equal(await checkLocationPermission(), 'unknown');
  assert.equal(checked, 4);
  assert.deepEqual(readOptions, []);
});

test('a strict native read preserves the fix timestamp and never falls back to a permission request after revocation', async () => {
  native = true;
  permission = { coarse: 'granted' };
  assert.equal(await checkLocationPermission(), 'granted');
  const point = fix({ timestamp: Date.now() - 23_456 });
  nativeRead = async () => point;
  assert.deepEqual(await readLocation({ requestPermission: false }), point);
  assert.equal(readOptions[0].requestPermission, false);
  nativeRead = async () => {
    throw new Error('LOCATION_DENIED');
  };
  await assert.rejects(readLocation({ requestPermission: false }), /LOCATION_DENIED/);
  assert.deepEqual(
    readOptions.map((options) => options.requestPermission),
    [false, false],
  );
});

test('web permission queries never acquire coordinates and strict web reads only reuse a current memory sample', async () => {
  let reads = 0;
  const point = fix({ timestamp: Date.now() - 1234 });
  navigatorWith({
    permissions: { query: async () => ({ state: 'granted' }) },
    geolocation: {
      getCurrentPosition(success: PositionCallback) {
        reads++;
        success({
          coords: { latitude: point.lat, longitude: point.lng, accuracy: point.accuracy },
          timestamp: point.timestamp,
        } as GeolocationPosition);
      },
    },
  });
  assert.equal(await checkLocationPermission(), 'granted');
  await assert.rejects(readLocation({ requestPermission: false }), /Pulsa Cerca de mí/);
  assert.equal(reads, 0);
  const explicit = await readLocation({ requestPermission: true });
  assert.equal(explicit.timestamp, point.timestamp);
  assert.deepEqual(await readLocation({ requestPermission: false }), explicit);
  assert.equal(reads, 1);
  const remembered = getRememberedLocation()!;
  remembered.lat = 0;
  assert.equal(
    getRememberedLocation()!.lat,
    point.lat,
    'Callers cannot mutate the retained sample.',
  );
});

test('unsupported browser permissions remain unknown and currentLocation retains its planner endpoint contract', async () => {
  assert.equal(await checkLocationPermission(), 'unknown');
  navigatorWith({
    permissions: {
      query: async () => {
        throw new Error('not supported');
      },
    },
    geolocation: {
      getCurrentPosition(success: PositionCallback) {
        success({
          coords: { latitude: 25.7, longitude: -100.3, accuracy: 50 },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    },
  });
  assert.equal(await checkLocationPermission(), 'unknown');
  assert.deepEqual(await currentLocation(), {
    kind: 'location',
    name: 'Mi ubicación',
    lat: 25.7,
    lng: -100.3,
    accuracy: 50,
  });
});

test('invalid, future, stale or excessively broad fixes are not remembered', async () => {
  native = true;
  for (const invalid of [
    { lat: NaN },
    { lat: 91 },
    { lng: -181 },
    { accuracy: -1 },
    { accuracy: 1501 },
    { timestamp: 0 },
    { timestamp: Date.now() + 6000 },
    { timestamp: Date.now() - 61_000 },
  ]) {
    nativeRead = async () => fix(invalid);
    await assert.rejects(readLocation(), /antigua o demasiado imprecisa/);
    assert.equal(getRememberedLocation(), null);
  }
  const now = Date.now();
  assert.equal(isFreshLocation(fix({ timestamp: now - 60_000, accuracy: 1500 }), now), true);
  assert.equal(isFreshLocation(fix({ timestamp: now - 60_001 }), now), false);
});

test('aborting an owned native read cancels that request and cannot remember its late sample', async () => {
  native = true;
  const pending = Promise.withResolvers<PositionFix>();
  nativeRead = () => pending.promise;
  const controller = new AbortController();
  const result = readLocation({ requestPermission: false, signal: controller.signal });
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.deepEqual(cancelled, [readOptions[0].requestId]);
  pending.resolve(fix());
  await new Promise(setImmediate);
  assert.equal(getRememberedLocation(), null);
});

test('aborted web acquisition ignores a late callback without caching GPS or persisting it', async () => {
  let receive: PositionCallback | undefined;
  navigatorWith({
    geolocation: {
      getCurrentPosition(success: PositionCallback) {
        receive = success;
      },
    },
  });
  const controller = new AbortController();
  const result = readLocation({ signal: controller.signal });
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  receive!({
    coords: { latitude: 25.7, longitude: -100.3, accuracy: 10 },
    timestamp: Date.now(),
  } as GeolocationPosition);
  await new Promise(setImmediate);
  assert.equal(getRememberedLocation(), null);
  assert.deepEqual(cancelled, []);
});
