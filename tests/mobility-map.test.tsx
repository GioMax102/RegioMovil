import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import MobilityMap from '../src/mobility/MobilityMap';
import type { MobilityJourney, MobilityNetwork, MobilityStep } from '../src/mobility/types';

const network: MobilityNetwork = {
  version: 1,
  mode: 'experimental',
  stops: [],
  routes: [
    { id: 'bus-a', mode: 'bus', color: '#146db3' },
    { id: 'L2', mode: 'metro', color: '#19a260' },
  ] as MobilityNetwork['routes'],
  coverage: {},
  assumptions: [],
};
const steps: MobilityStep[] = [
  {
    mode: 'bus',
    lineId: 'bus-a',
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
    from: 'Metro',
    to: 'Universidad',
    geometry: [
      [-100.369, 25.671],
      [-100.34, 25.7],
      [-100.3, 25.74],
    ],
  },
] as MobilityStep[];
const journey = (segments: MobilityStep[]) =>
  ({ id: 'fixture', steps: segments }) as MobilityJourney;
const map = (segments = steps) =>
  new JSDOM(renderToStaticMarkup(<MobilityMap journey={journey(segments)} network={network} />));
const coordinates = (element: Element) =>
  element
    .getAttribute('points')!
    .split(' ')
    .map((pair) => pair.split(',').map(Number));

test('phone-shaped map viewports keep endpoints and the regional base in frame without letterboxing', async () => {
  const { fitMapProjection, projectMapCoordinate, constrainMapView, ZMM_BOUNDS } =
    await import('../src/mobility/mapGeography');
  const geometry: [number, number][] = [
    [-100.4008, 25.7662],
    [-100.2893, 25.6507],
  ];
  const viewport = { width: 670, height: 532 };
  const projection = fitMapProjection(geometry, viewport);
  const view = constrainMapView({ zoom: 1, x: 0, y: 0 }, projection, viewport);
  for (const coordinate of geometry) {
    const [x, y] = projectMapCoordinate(coordinate, projection);
    assert.ok(x + view.x > 20 && x + view.x < viewport.width - 20);
    assert.ok(y + view.y > 20 && y + view.y < viewport.height - 20);
  }
  const topLeft = projectMapCoordinate([ZMM_BOUNDS[0], ZMM_BOUNDS[3]], projection);
  const bottomRight = projectMapCoordinate([ZMM_BOUNDS[2], ZMM_BOUNDS[1]], projection);
  assert.ok(topLeft[0] + view.x <= 0 && topLeft[1] + view.y <= 0);
  assert.ok(
    bottomRight[0] + view.x >= viewport.width && bottomRight[1] + view.y >= viewport.height,
  );
});

test('el mapa conserva geometrías y colores y encuadra el trayecto sobre el fondo regional ampliado', () => {
  const dom = map();
  try {
    const svg = dom.window.document.querySelector('svg')!;
    const routes = [...svg.querySelectorAll('g[data-mode]')];
    assert.deepEqual(
      routes.map((route) => route.getAttribute('data-mode')),
      ['bus', 'walk', 'metro'],
    );
    assert.deepEqual(
      routes.map((route) => route.getAttribute('data-line')),
      ['bus-a', 'walk', 'L2'],
    );
    const traces = routes.map((route) => route.querySelectorAll('polyline')[1]);
    assert.deepEqual(
      traces.map((trace) => coordinates(trace).length),
      [3, 2, 3],
    );
    assert.equal(traces[0].getAttribute('stroke'), '#146db3');
    assert.equal(traces[2].getAttribute('stroke'), '#19a260');
    assert.equal(traces[1].getAttribute('stroke-dasharray'), '5 5');
    for (const trace of traces)
      for (const [x, y] of coordinates(trace)) {
        assert.ok(Number.isFinite(x) && x >= 60 && x <= 610);
        assert.ok(Number.isFinite(y) && y >= 55 && y <= 355);
      }
    const endpoints = [...svg.querySelectorAll('circle')].map((circle) => circle.parentElement!);
    assert.equal(
      endpoints[0].getAttribute('transform'),
      `translate(${coordinates(traces[0])[0].join(' ')})`,
    );
    assert.equal(
      endpoints[1].getAttribute('transform'),
      `translate(${coordinates(traces[2]).at(-1)!.join(' ')})`,
    );
    assert.match(svg.getAttribute('aria-label')!, /A es el origen y B el destino/);
    assert.ok(!svg.getAttribute('aria-label')?.includes('área vacía'));
    assert.ok(!svg.textContent?.includes('Mapa base parcial'));
    assert.equal(
      svg.querySelector('pattern'),
      null,
      'No grid is presented as streets beyond the real map extent.',
    );
    assert.ok(svg.querySelector('image')?.getAttribute('href')?.includes('monterrey-map.svg'));
  } finally {
    dom.window.close();
  }
});

test('un trayecto dentro de Monterrey conserva el fondo y omite el aviso de cobertura parcial', () => {
  const dom = map([steps[2]]);
  try {
    const svg = dom.window.document.querySelector('svg')!;
    assert.ok(svg.querySelector('image'));
    assert.ok(!svg.textContent?.includes('Mapa base parcial'));
    assert.ok(!svg.getAttribute('aria-label')?.includes('área vacía'));
  } finally {
    dom.window.close();
  }
});

test('coordenadas inválidas o fuera de la ZMM no rompen el mapa ni unen segmentos sin datos', () => {
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
  for (const segments of [
    [invalid],
    [{ ...invalid, geometry: [] }],
    [{ ...invalid, geometry: [[NaN, Infinity]] }],
    [],
  ]) {
    const dom = map(segments);
    try {
      const svg = dom.window.document.querySelector('svg')!;
      assert.ok(svg);
      assert.doesNotMatch(svg.outerHTML, /NaN|Infinity|undefined/);
      if (segments[0] === invalid) assert.equal(svg.querySelectorAll('g[data-mode]').length, 2);
    } finally {
      dom.window.close();
    }
  }
});

test('la proyección y los límites mantienen toda la ventana dentro de la ZMM con cualquier desplazamiento', async () => {
  const { constrainMapView, fitMapProjection, projectMapCoordinate, ZMM_BOUNDS, MAP_VIEWPORT } =
    await import('../src/mobility/mapGeography');
  for (const geometry of [
    steps.flatMap((step) => step.geometry),
    [],
    [
      [ZMM_BOUNDS[0], ZMM_BOUNDS[1]],
      [ZMM_BOUNDS[2], ZMM_BOUNDS[3]],
    ] as [number, number][],
  ]) {
    const projection = fitMapProjection(geometry);
    for (const zoom of [-100, 1, 3, 5, 500, NaN, Infinity])
      for (const pan of [-1e12, 0, 1e12, NaN, Infinity]) {
        const view = constrainMapView({ zoom, x: pan, y: -pan }, projection);
        assert.ok(Object.values(view).every(Number.isFinite));
        assert.ok(view.zoom >= 1 && view.zoom <= 5);
        const topLeft = projectMapCoordinate([ZMM_BOUNDS[0], ZMM_BOUNDS[3]], projection);
        const bottomRight = projectMapCoordinate([ZMM_BOUNDS[2], ZMM_BOUNDS[1]], projection);
        const transform = ([x, y]: [number, number]) => [
          (x - MAP_VIEWPORT.width / 2) * view.zoom + MAP_VIEWPORT.width / 2 + view.x,
          (y - MAP_VIEWPORT.height / 2) * view.zoom + MAP_VIEWPORT.height / 2 + view.y,
        ];
        const [left, top] = transform(topLeft),
          [right, bottom] = transform(bottomRight);
        assert.ok(left <= 1e-8 && top <= 1e-8);
        assert.ok(right >= MAP_VIEWPORT.width - 1e-8 && bottom >= MAP_VIEWPORT.height - 1e-8);
      }
  }
});

test('arrastrar y soltar en el mismo lote, cancelar o perder captura conserva un mapa estable y acotado', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  const globals = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'SVGElement',
    'Element',
    'Node',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const previous = new Map(
    globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const name of globals)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof Window],
    });
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => root.render(<MobilityMap journey={journey(steps)} network={network} />));
    const svg = dom.window.document.querySelector('svg')!;
    let width = 670;
    svg.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 410,
      width,
      height: 410,
      toJSON() {},
    });
    const pointer = (type: string, x: number, y: number, pointerId = 1) => {
      const event = new dom.window.MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        isPrimary: { value: true },
      });
      svg.dispatchEvent(event);
    };
    const transform = () => svg.querySelector('[data-map-viewport]')!.getAttribute('transform')!;
    const drag = async (x: number, y: number, end = 'pointerup') => {
      await act(async () => {
        pointer('pointerdown', 150, 150);
        pointer('pointermove', 170, 170);
        pointer('pointermove', x, y);
        pointer(end, x, y);
      });
      assert.ok(dom.window.document.querySelector('[data-map-viewport]'));
      assert.doesNotMatch(transform(), /NaN|Infinity/);
    };
    await drag(240, 220); // This exact batched release used to read drag.current after it became null.
    const moved = transform();
    assert.notEqual(moved, 'translate(0 0) translate(335 205) scale(1) translate(-335 -205)');
    await act(async () => pointer('pointermove', -5000, -5000));
    assert.equal(transform(), moved, 'A released pointer cannot continue moving the map.');
    for (const end of ['pointercancel', 'lostpointercapture']) {
      await drag(-1e6, 1e6, end);
      const cancelled = transform();
      await act(async () => pointer('pointermove', 1e6, -1e6));
      assert.equal(transform(), cancelled);
    }
    for (let i = 0; i < 12; i++) await drag(i % 2 ? 1e6 : -1e6, i % 3 ? -1e6 : 1e6);
    const bounded = transform();
    await drag(-1e6, -1e6);
    const limit = transform();
    await drag(-1e6, -1e6);
    assert.equal(transform(), limit, 'Repeated dragging stops at the regional edge.');
    assert.notEqual(bounded, '');
    width = 0;
    await drag(1e6, 1e6);
    assert.equal(transform(), limit, 'A hidden or zero-width map ignores invalid gesture scales.');
    const zoomIn = dom.window.document.querySelector('button[aria-label="Acercar recorrido"]')!;
    await act(async () => {
      for (let i = 0; i < 30; i++)
        zoomIn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    assert.match(transform(), /scale\(5\)/);
    assert.doesNotMatch(transform(), /NaN|Infinity/);
    assert.equal(svg.getAttribute('tabindex'), '0');
    assert.match(svg.getAttribute('aria-label')!, /flechas.*más y menos/);
    const reset = dom.window.document.querySelector('button[aria-label="Restablecer recorrido"]')!;
    await act(async () =>
      reset.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
    );
    const key = (value: string) => {
      const event = new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: value,
      });
      svg.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, 'Map keys must not scroll the page.');
    };
    const resetTransform = transform();
    await act(async () => key('ArrowRight'));
    assert.notEqual(transform(), resetTransform);
    await act(async () => {
      for (let i = 0; i < 500; i++) key('ArrowLeft');
    });
    const keyboardLimit = transform();
    await act(async () => {
      for (let i = 0; i < 10; i++) key('ArrowLeft');
    });
    assert.equal(
      transform(),
      keyboardLimit,
      'Keyboard exploration stops at the same regional boundary.',
    );
    await act(async () => {
      for (let i = 0; i < 20; i++) key('+');
    });
    assert.match(transform(), /scale\(5\)/);
    await act(async () => {
      for (let i = 0; i < 20; i++) key('-');
    });
    assert.match(transform(), /scale\(1\)/);
    assert.doesNotMatch(transform(), /NaN|Infinity/);
  } finally {
    await act(async () => root.unmount());
    for (const name of globals) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  }
});
