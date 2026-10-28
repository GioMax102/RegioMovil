/** The saved-trip map must retain the same geometry, controls and limits as the planner. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ZMM_BOUNDS } from '../src/mobility/mapGeography';
import { readSavedMobilityTrips, savedMobilityKey } from '../src/mobility/savedTrips';
import {
  constrainRegionalView,
  fitRegionalPositions,
  visibleRegionalBounds,
} from '../src/mobility/regionalViewport';
import type {
  Coordinates,
  MobilityJourney,
  MobilityNetwork,
  MobilityStep,
} from '../src/mobility/types';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const MobilityMap = (await import('../src/mobility/MobilityMap')).default;
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Element',
  'Node',
  'ResizeObserver',
  'IS_REACT_ACT_ENVIRONMENT',
];
const previous = new Map(
  globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
for (const name of globals)
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
const rect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 720,
  bottom: 420,
  width: 720,
  height: 420,
  toJSON() {},
};
dom.window.HTMLElement.prototype.getBoundingClientRect = () => rect;
dom.window.SVGElement.prototype.getBoundingClientRect = () => rect;
const { createRoot } = await import('react-dom/client');
let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;
const network: MobilityNetwork = {
  version: 1,
  mode: 'experimental',
  stops: [],
  coverage: {},
  assumptions: [],
  routes: [
    {
      id: 'bus-a',
      code: 'A',
      name: 'Ruta A',
      networkId: 'regioruta',
      mode: 'bus',
      color: '#146db3',
      stopOrderVerified: false,
      sourceIds: [],
      segments: [],
    },
    {
      id: 'L2',
      code: 'L2',
      name: 'Línea 2',
      networkId: 'metrorrey',
      mode: 'metro',
      color: '#19a260',
      stopOrderVerified: true,
      sourceIds: [],
      segments: [],
    },
  ],
};
const steps = [
  {
    mode: 'bus',
    lineId: 'bus-a',
    fromId: 'museum',
    toId: 'bus-stop',
    from: 'Museo',
    to: 'Parada',
    geometry: [
      [-100.78, 25.6],
      [-100.4, 25.64],
      [-100.37, 25.67],
    ],
  },
  {
    mode: 'walk',
    lineId: 'walk',
    fromId: 'bus-stop',
    toId: 'metro:boarding',
    from: 'Parada',
    to: 'Metro',
    geometry: [
      [-100.37, 25.67],
      [-100.369, 25.671],
    ],
  },
  {
    mode: 'metro',
    lineId: 'L2',
    fromId: 'metro:boarding',
    toId: 'metro:universidad',
    from: 'Metro',
    to: 'Universidad',
    geometry: [
      [-100.369, 25.671],
      [-100.34, 25.7],
      [-100.3, 25.74],
    ],
  },
] as MobilityStep[];
const journey = (segments = steps) =>
  ({ id: 'fixture', steps: segments, stationIds: [] }) as unknown as MobilityJourney;
const tracePoints = (element: Element) =>
  element
    .getAttribute('points')!
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
const traces = (element: ParentNode) => [...element.querySelectorAll('polyline[data-line]')];
const assertFinite = (element: Element) =>
  assert.doesNotMatch(element.outerHTML, /NaN|Infinity|undefined/);
async function mount(trip = journey(), snapshot = network) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<MobilityMap journey={trip} network={snapshot} />));
  return host.querySelector<SVGSVGElement>('svg[role="group"]')!;
}
beforeEach(() => {
  Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, value: false });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('saved maps share the planner renderer, region, controls and collapsed information without remote SSR tiles', () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Reflect.deleteProperty(globalThis, 'navigator');
  let markup: string;
  try {
    markup = renderToStaticMarkup(<MobilityMap journey={journey()} network={network} />);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
  }
  const snapshot = new JSDOM(markup!);
  try {
    const document = snapshot.window.document;
    const map = document.querySelector('svg[role="group"]')!;
    assert.match(
      map.getAttribute('aria-label')!,
      /Mapa interactivo.*Monterrey.*flechas.*más y menos/,
    );
    assert.equal(map.getAttribute('tabindex'), '0');
    assert.ok(document.querySelector('button[aria-label="Acercar mapa"]'));
    assert.ok(document.querySelector('button[aria-label="Centrar mapa en el viaje"]'));
    assert.equal((document.querySelector('.location-map-info') as HTMLDetailsElement).open, false);
    assert.ok(map.querySelector('image[href*="monterrey-map.svg"]'));
    assert.equal(
      map.querySelector('image[href^="https://"]'),
      null,
      'SSR cannot request remote map tiles.',
    );
    assertFinite(map);
  } finally {
    snapshot.window.close();
  }
});

test('a legacy saved snapshot without route segments still opens its complete journey geometry', async () => {
  const legacyNetwork = {
    ...network,
    routes: network.routes.map(({ segments: _segments, ...route }) => route),
  } as MobilityNetwork;
  const trip = {
    version: 1,
    id: 'legacy-trip',
    label: 'Escuela',
    savedAt: '2026-10-24T12:00:00Z',
    generatedAt: '2026-10-24T12:00:00Z',
    from: { id: 'museum', name: 'Museo' },
    to: { id: 'universidad', name: 'Universidad' },
    preference: 'fastest',
    journeys: [
      {
        ...journey(),
        durationMinutes: 25,
        walkingMeters: 100,
        walkingMinutes: 2,
        transfers: 1,
        occupancy: 35,
        etaRange: [20, 30],
        steps: steps.map((step, index) => ({
          ...step,
          lineName: step.lineId,
          fromId: `from-${index}`,
          toId: `to-${index}`,
          minutes: 8,
          stationCount: 2,
          distanceMeters: 1000,
        })),
      },
    ],
    network: legacyNetwork,
  };
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => (key === savedMobilityKey ? JSON.stringify([trip]) : null) },
  });
  try {
    const restored = readSavedMobilityTrips();
    assert.equal(restored.length, 1, 'The existing version-one snapshot remains readable.');
    const svg = await mount(restored[0].journeys[0], restored[0].network);
    assert.deepEqual(
      traces(svg).map((trace) => trace.getAttribute('data-mode')),
      ['bus', 'walk', 'metro'],
    );
    assert.deepEqual(
      traces(svg).map((trace) => tracePoints(trace).length),
      [3, 2, 3],
    );
    assert.ok(host!.querySelector('button[aria-label="Centrar mapa en el viaje"]'));
    assertFinite(svg);
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('trip stations and contrasting route colors remain above the regional base, with A/B on actual endpoints', async () => {
  const stop = {
    id: 'metro:universidad',
    name: 'Universidad',
    lat: 25.74,
    lng: -100.3,
    official: true,
    mode: 'metro',
    routeIds: ['L2'],
    sourceIds: [],
  } as MobilityNetwork['stops'][number];
  const svg = await mount(
    { ...journey(), stationIds: [stop.id] },
    { ...network, stops: [stop, { ...stop, id: 'other', name: 'Otra estación' }] },
  );
  assert.equal(svg.querySelectorAll('[data-stop]').length, 1);
  assert.equal(svg.querySelector('[data-stop]')!.getAttribute('data-stop'), stop.id);
  assert.match(svg.querySelector('[data-stop]')!.textContent!, /Universidad/);
  const routes = traces(svg);
  assert.deepEqual(
    routes.map((trace) => trace.getAttribute('data-mode')),
    ['bus', 'walk', 'metro'],
  );
  assert.deepEqual(
    routes.map((trace) => tracePoints(trace).length),
    [3, 2, 3],
  );
  assert.equal(routes[0].getAttribute('stroke'), '#146db3');
  assert.equal(routes[2].getAttribute('stroke'), '#19a260');
  assert.equal(routes[1].getAttribute('stroke-dasharray'), '5 5');
  assert.equal(
    routes[2].parentElement!.querySelectorAll('polyline').length,
    3,
    'A light halo and dark edge contrast with the base.',
  );
  const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  for (const trace of routes)
    for (const [x, y] of tracePoints(trace))
      assert.ok(
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= width && y >= 0 && y <= height,
      );
  const label = (value: string) =>
    [...svg.querySelectorAll('text')].find((text) => text.textContent === value)!;
  const first = tracePoints(routes[0])[0],
    last = tracePoints(routes[2]).at(-1)!;
  assert.equal(
    label('A').parentElement!.getAttribute('transform'),
    `translate(${first[0]} ${first[1]})`,
  );
  assert.equal(
    label('B').parentElement!.getAttribute('transform'),
    `translate(${last[0]} ${last[1]})`,
  );
  assertFinite(svg);
});

test('all published intermediate vertices and separate legs survive the common renderer', async () => {
  const geometry: Coordinates[] = Array.from({ length: 201 }, (_, index) => [
    -100.37 + index * 0.0002,
    25.67 + Math.sin(index / 7) * 0.001,
  ]);
  const svg = await mount(
    journey([
      { ...steps[0], geometry },
      {
        ...steps[2],
        geometry: [
          [-100.3, 25.74],
          [-100.29, 25.75],
        ],
      },
    ]),
  );
  assert.deepEqual(
    traces(svg).map((trace) => tracePoints(trace).length),
    [201, 2],
  );
  assertFinite(svg);
});

test('invalid or outside coordinates break a route instead of joining across missing data or crashing', async () => {
  const invalid = {
    ...steps[0],
    geometry: [
      [-100.4, 25.64],
      [-100.37, 25.67],
      [NaN, 25.6],
      [-100.34, 25.7],
      [-100.3, 25.74],
      [-110, 30],
      [Infinity, 25.6],
    ],
  } as MobilityStep;
  const svg = await mount(journey([invalid]));
  assert.deepEqual(
    traces(svg).map((trace) => tracePoints(trace).length),
    [2, 2],
  );
  assertFinite(svg);
  for (const segments of [
    [{ ...invalid, geometry: [] }],
    [{ ...invalid, geometry: [[NaN, Infinity]] }],
    [],
  ] as MobilityStep[][]) {
    await act(async () =>
      root!.render(<MobilityMap journey={journey(segments)} network={network} />),
    );
    assert.equal(traces(host!).length, 0);
    assertFinite(host!.querySelector('svg[role="group"]')!);
  }
});

test('portrait and landscape journeys stay in frame and every extreme pan/zoom stays inside ZMM', () => {
  for (const size of [
    { width: 320, height: 420 },
    { width: 720, height: 420 },
    { width: 717, height: 240 },
  ]) {
    const positions = steps.flatMap((step) => step.geometry).map(([lng, lat]) => ({ lng, lat }));
    const fitted = fitRegionalPositions(positions, size);
    assert.ok(Object.values(fitted).every(Number.isFinite));
    const fitBounds = visibleRegionalBounds(fitted, size);
    for (const point of positions)
      assert.ok(
        point.lng >= fitBounds.northWest.lng &&
          point.lng <= fitBounds.southEast.lng &&
          point.lat <= fitBounds.northWest.lat &&
          point.lat >= fitBounds.southEast.lat,
      );
    for (const zoom of [-100, 10, 17, 500, NaN, Infinity])
      for (const pan of [-1e12, 0, 1e12, NaN, Infinity]) {
        const view = constrainRegionalView({ zoom, lng: pan, lat: -pan }, size);
        const bounds = visibleRegionalBounds(view, size);
        assert.ok(Object.values(view).every(Number.isFinite));
        assert.ok(
          bounds.northWest.lng >= ZMM_BOUNDS[0] - 1e-8 &&
            bounds.northWest.lat <= ZMM_BOUNDS[3] + 1e-8,
        );
        assert.ok(
          bounds.southEast.lng <= ZMM_BOUNDS[2] + 1e-8 &&
            bounds.southEast.lat >= ZMM_BOUNDS[1] - 1e-8,
        );
      }
  }
});

test('batched drags, cancelled gestures and keyboard controls remain finite and stop after release', async () => {
  const svg = await mount();
  const pointer = (type: string, x: number, y: number) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    svg.dispatchEvent(event);
  };
  const geometry = () =>
    traces(svg)
      .map((trace) => trace.getAttribute('points'))
      .join('|');
  const drag = async (end: string) => {
    await act(async () => {
      pointer('pointerdown', 150, 150);
      pointer('pointermove', 1e6, -1e6);
      pointer(end, 1e6, -1e6);
    });
    assertFinite(svg);
    const released = geometry();
    await act(async () => pointer('pointermove', -1e6, 1e6));
    assert.equal(
      geometry(),
      released,
      'A released or cancelled pointer cannot continue moving the map.',
    );
  };
  await drag('pointerup');
  await drag('pointercancel');
  await drag('lostpointercapture');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', '+', '-'])
    await act(async () => {
      const event = new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      });
      svg.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    });
  assertFinite(svg);
});

test('online status changes only the optional street tiles and saved geometry stays available offline', async () => {
  const svg = await mount();
  const geometry = traces(svg).map((trace) => trace.getAttribute('points'));
  assert.equal(svg.querySelector('image[href^="https://"]'), null);
  await act(async () => {
    Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new dom.window.Event('online'));
  });
  assert.ok(svg.querySelector('image[href^="https://tile.openstreetmap.org/"]'));
  await act(async () => {
    Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new dom.window.Event('offline'));
  });
  assert.equal(svg.querySelector('image[href^="https://"]'), null);
  assert.ok(svg.querySelector('image[href*="monterrey-map.svg"]'));
  assert.deepEqual(
    traces(svg).map((trace) => trace.getAttribute('points')),
    geometry,
  );
});
