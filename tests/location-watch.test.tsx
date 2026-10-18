import test from 'node:test';
import assert from 'node:assert/strict';
import { watchLocation } from '../src/mobility/location';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function withGeo(geo: object | undefined, run: () => Promise<void>) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: geo },
    configurable: true,
  });
  return run().finally(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete (globalThis as Record<string, unknown>).navigator;
  });
}
test('foreground watcher reports real fixes and stops idempotently without late callbacks', async () => {
  let receive: PositionCallback;
  let cleared = 0;
  const fixes: unknown[] = [];
  await withGeo(
    {
      watchPosition(
        success: PositionCallback,
        _error: PositionErrorCallback,
        options: PositionOptions,
      ) {
        receive = success;
        assert.equal(options.enableHighAccuracy, true);
        assert.equal(options.maximumAge, 5000);
        return 17;
      },
      clearWatch(id: number) {
        assert.equal(id, 17);
        cleared++;
      },
    },
    async () => {
      const stop = await watchLocation(
        (point) => fixes.push(point),
        (error) => assert.fail(error.message),
      );
      const fix = {
        coords: { latitude: 25.67, longitude: -100.32, accuracy: 12, speed: 4, heading: 80 },
        timestamp: 123456,
      } as GeolocationPosition;
      receive!(fix);
      assert.deepEqual(fixes[0], {
        lat: 25.67,
        lng: -100.32,
        accuracy: 12,
        timestamp: 123456,
        speed: 4,
        heading: 80,
      });
      stop();
      stop();
      receive!(fix);
      assert.equal(cleared, 1);
      assert.equal(fixes.length, 1);
    },
  );
});
test('location denial is actionable and missing geolocation allows manual guidance', async () => {
  let deny: PositionErrorCallback;
  const errors: string[] = [];
  await withGeo(
    {
      watchPosition(_s: PositionCallback, error: PositionErrorCallback) {
        deny = error;
        return 9;
      },
      clearWatch() {},
    },
    async () => {
      const stop = await watchLocation(
        () => assert.fail('No fix was requested'),
        (error) => errors.push(error.message),
      );
      deny!({ code: 1 } as GeolocationPositionError);
      assert.match(errors[0], /manualmente/);
      stop();
      deny!({ code: 1 } as GeolocationPositionError);
      assert.equal(errors.length, 1);
    },
  );
  await withGeo(undefined, async () => {
    await assert.rejects(
      watchLocation(
        () => {},
        () => {},
      ),
      /manualmente/,
    );
  });
});
