import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { RoutePack } from '../src/types';
import type { HomeSelection } from '../src/components/homeTypes';
import type { RegionalView } from '../src/mobility/regionalViewport';
import { DataPreferencesProvider } from '../src/dataPreferences';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Element',
  'Node',
  'Event',
  'MutationObserver',
  'IS_REACT_ACT_ENVIRONMENT',
  'ResizeObserver',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value:
      name === 'IS_REACT_ACT_ENVIRONMENT'
        ? true
        : name === 'ResizeObserver'
          ? undefined
          : dom.window[name as keyof Window],
  });
}
let width = 390,
  height = 300;
const rect = () => ({
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: width,
  bottom: height,
  width,
  height,
  toJSON() {},
});
dom.window.HTMLElement.prototype.getBoundingClientRect = rect;
dom.window.SVGElement.prototype.getBoundingClientRect = rect;
const styles = registerHooks({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { default: HomeSelectedRouteMap, homeMapNetwork } =
  await import('../src/components/HomeSelectedRouteMap');
const { render, screen, cleanup, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
afterEach(() => {
  cleanup();
  width = 390;
  height = 300;
});
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
const selection: HomeSelection = {
  kind: 'bus',
  route: {
    id: 'sample',
    code: '1',
    name: 'Sample',
    networkId: 'transmetro',
    geometryPack: 'sample',
    geometryRevision: '123456abcdef',
  },
  stopId: 'sample:a',
  source: 'manual',
};
const pack: RoutePack = {
  id: 'sample',
  sourceUrl: 'https://example.test',
  verifiedAt: '2026-11-05',
  coordinates: [
    [-100.4, 25.7],
    [-100.39, 25.71],
  ],
  segments: [
    [[-100.5, 25.7]],
    [
      [-100.4, 25.7],
      [-100.39, 25.71],
    ],
    [
      [-100.3, 25.7],
      [-100.29, 25.71],
    ],
  ],
  stops: [
    { id: 'a', name: 'A', lat: 25.7, lng: -100.4 },
    { id: 'b', name: 'B', lat: 25.71, lng: -100.39 },
    { id: 'c', name: 'C', lat: 25.7, lng: -100.3 },
    { id: 'd', name: 'D', lat: 25.71, lng: -100.29 },
  ],
  stopOrderVerified: false,
};

test('single-route adapter keeps original segment IDs across degenerate gaps and never invents bus stop IDs', () => {
  const subset = homeMapNetwork(selection, pack)!;
  assert.equal(subset.routes.length, 1);
  assert.deepEqual(
    subset.routes[0].segments.map((segment) => [segment.id, segment.stopIds]),
    [
      ['sample:1', ['sample:a', 'sample:b']],
      ['sample:2', ['sample:c', 'sample:d']],
    ],
  );
  assert.deepEqual(subset.routes[0].segments[0].coordinates, pack.segments![1]);
  assert.equal(subset.stops[0].id, 'sample:a');
  assert.equal(homeMapNetwork(selection, { ...pack, id: 'other' }), null);
  const visual = homeMapNetwork(selection, { ...pack, experimentalRouting: false })!;
  assert.equal(visual.stops.length, 0);
  assert.equal(visual.routes[0].segments.length, 2);
});

test('Metro adapter draws only the selected published line and retains canonical station identity', () => {
  const subset = homeMapNetwork({
    kind: 'metro',
    stationId: 'felix-u-gomez',
    lineId: 'L3',
    source: 'manual',
  })!;
  assert.equal(subset.routes[0].id, 'L3');
  assert.ok(subset.stops.some((stop) => stop.id === 'metro:felix-u-gomez'));
  assert.equal(
    subset.stops.every((stop) => stop.routeIds.includes('L3')),
    true,
  );
  assert.equal(homeMapNetwork({ kind: 'metro', stationId: 'unknown', source: 'base' }), null);
});

test('selected-route map restores camera after unmount/resize, but changing the canonical stop starts a separate view', async () => {
  const views = new Map<string, RegionalView>([
    ['bus:sample:123456abcdef:sample:a', { lat: 25.75, lng: -100.32, zoom: 15 }],
  ]);
  const first = render(
    <HomeSelectedRouteMap
      selection={selection}
      pack={pack}
      viewCache={views}
      onExpand={() => {}}
    />,
  );
  const map = () => first.container.querySelector('svg[data-map-zoom]')!;
  assert.equal(map().getAttribute('data-map-zoom'), '15.000');
  assert.equal(map().getAttribute('data-map-center'), '25.7500000,-100.3200000');
  assert.ok(screen.getByRole('group', { name: /Paradas/i }));
  assert.ok(screen.getByRole('button', { name: /Parada 1: A/ }).getAttribute('aria-current'));
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('button', { name: 'Acercar mapa' }));
  const zoom = map().getAttribute('data-map-zoom'),
    center = map().getAttribute('data-map-center');
  first.unmount();
  const second = render(
    <HomeSelectedRouteMap
      selection={selection}
      pack={pack}
      viewCache={views}
      onExpand={() => {}}
    />,
  );
  const restored = () => second.container.querySelector('svg[data-map-zoom]')!;
  assert.equal(restored().getAttribute('data-map-zoom'), zoom);
  assert.equal(restored().getAttribute('data-map-center'), center);
  width = 480;
  height = 340;
  act(() => window.dispatchEvent(new Event('resize')));
  assert.equal(restored().getAttribute('data-map-zoom'), zoom);
  assert.equal(restored().getAttribute('data-map-center'), center);
  second.rerender(
    <HomeSelectedRouteMap
      selection={{ ...selection, stopId: 'sample:b' }}
      pack={pack}
      viewCache={views}
      onExpand={() => {}}
    />,
  );
  assert.ok(screen.getByRole('button', { name: /Parada 2: B/ }).getAttribute('aria-current'));
  assert.notEqual(restored().getAttribute('data-map-center'), center);
  assert.ok(views.has('bus:sample:123456abcdef:sample:a'));
});

test('data saver uses the light schematic without basemap requests and camera cache is bounded', () => {
  const views = new Map<string, RegionalView>(
    Array.from({ length: 15 }, (_, i) => [`old:${i}`, { lat: 25.7, lng: -100.4, zoom: 14 }]),
  );
  const { container, rerender } = render(
    <DataPreferencesProvider enabled>
      <HomeSelectedRouteMap
        selection={selection}
        pack={pack}
        viewCache={views}
        onExpand={() => {}}
      />
    </DataPreferencesProvider>,
  );
  assert.equal(container.querySelector('image'), null);
  assert.equal(container.querySelectorAll('polyline').length, 2);
  rerender(
    <DataPreferencesProvider enabled={false}>
      <HomeSelectedRouteMap
        selection={selection}
        pack={pack}
        viewCache={views}
        onExpand={() => {}}
      />
    </DataPreferencesProvider>,
  );
  assert.ok(container.querySelector('image'));
  assert.ok(views.size <= 12);
  assert.equal(container.querySelectorAll('image[href^="https:"]').length, 0);
  assert.ok(container.querySelector('[data-home-action="map"][tabindex="-1"]'));
});
