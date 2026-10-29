/** Local interaction/geometry regressions; JSDOM never downloads map tiles. */
import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ZMM_BOUNDS, simplifyOverviewGeometry } from '../src/mobility/mapGeography';
import {
  CITY_CENTER,
  constrainRegionalView,
  minimumRegionalZoom,
  fitRegionalPositions,
  visibleRegionalBounds,
  worldPoint,
  worldPosition,
  type MapPosition,
} from '../src/mobility/regionalViewport';
import type {
  Coordinates,
  MobilityNetwork,
  MobilityRoute,
  MobilityStop,
} from '../src/mobility/types';
import { DataPreferencesProvider } from '../src/dataPreferences';

const styleHook = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const LocationMap = (await import('../src/mobility/LocationMap')).default;
const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
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
  'IS_REACT_ACT_ENVIRONMENT',
  'ResizeObserver',
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
  left: 0,
  top: 0,
  width: 720,
  height: 420,
  right: 720,
  bottom: 420,
  toJSON() {},
};
dom.window.HTMLElement.prototype.getBoundingClientRect = () => rect;
dom.window.SVGElement.prototype.getBoundingClientRect = () => rect;
const { createRoot } = await import('react-dom/client');
const official = {
  id: 'official',
  name: 'Parada publicada',
  ...CITY_CENTER,
  mode: 'bus',
  routeIds: [],
  sourceIds: [],
  official: true,
} as MobilityStop;
const network = {
  version: 1,
  mode: 'experimental',
  stops: [
    official,
    { ...official, id: 'unofficial', name: 'No publicada', official: false },
    { ...official, id: 'invalid', name: 'Inválida', lng: NaN },
  ],
  routes: [],
  coverage: {},
  assumptions: [],
} as MobilityNetwork;
const publishedNetwork = JSON.parse(
  readFileSync(new URL('../public/mobility-network.json', import.meta.url), 'utf8'),
) as MobilityNetwork;
let activeRoot: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  if (activeRoot) await act(async () => activeRoot!.unmount());
  activeRoot = null;
  host?.remove();
  host = null;
});
after(() => {
  styleHook.deregister();
  for (const name of globals) {
    const descriptor = previous.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  dom.window.close();
});
async function mount(props: Partial<React.ComponentProps<typeof LocationMap>> = {}) {
  const picks: MapPosition[] = [],
    stops: MobilityStop[] = [];
  host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  activeRoot = createRoot(host);
  await act(async () =>
    activeRoot!.render(
      <LocationMap
        network={network}
        online={false}
        field="from"
        onPick={(point) => picks.push({ lat: point.lat, lng: point.lng })}
        onStopSelect={(stop) => stops.push(stop)}
        {...props}
      />,
    ),
  );
  picks.length = 0;
  const svg = host.querySelector<SVGSVGElement>('svg[role="group"]')!;
  assert.ok(svg);
  return { picks, stops, svg, container: host };
}

test('ahorrar datos evita teselas remotas sin desactivar selección ni cambiar a modo sin conexión', async () => {
  const { container } = await mount({ online: true });
  const renderMap = (enabled: boolean) => (
    <DataPreferencesProvider enabled={enabled}>
      <LocationMap network={network} online field="from" onPick={() => {}} />
    </DataPreferencesProvider>
  );
  await act(async () => activeRoot!.render(renderMap(true)));
  assert.equal(container.querySelector('image[href^="https://"]'), null);
  assert.ok(container.querySelector('image[href*="monterrey-map.svg"]'));
  assert.match(container.textContent!, /Ahorro de datos activo/);
  assert.ok(container.querySelector('svg[role="group"]'));
  await act(async () => activeRoot!.render(renderMap(false)));
  assert.ok(container.querySelector('image[href^="https://tile.openstreetmap.org/"]'));
  assert.doesNotMatch(container.textContent!, /Ahorro de datos activo/);
});
function pointer(svg: SVGSVGElement, type: string, x: number, y: number, id = 1) {
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: id === 1 } });
  svg.dispatchEvent(event);
}
function key(element: Element, value: string) {
  element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: value }));
}
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Mercator conserva coordenadas y toda la pantalla queda dentro de ZMM ante pan/zoom extremos', () => {
  for (const position of [
    CITY_CENTER,
    { lng: ZMM_BOUNDS[0], lat: ZMM_BOUNDS[1] },
    { lng: ZMM_BOUNDS[2], lat: ZMM_BOUNDS[3] },
  ]) {
    const point = worldPoint(position),
      restored = worldPosition(point.x, point.y);
    close(restored.lng, position.lng);
    close(restored.lat, position.lat);
  }
  for (const size of [
    { width: 390, height: 480 },
    { width: 720, height: 420 },
    { width: 3840, height: 2160 },
  ])
    for (const lng of [-1e20, -100.31, 1e20, NaN])
      for (const lat of [-1e20, 25.68, 1e20, Infinity])
        for (const zoom of [-500, 10, 17, 500, NaN]) {
          const view = constrainRegionalView({ lng, lat, zoom }, size),
            bounds = visibleRegionalBounds(view, size);
          assert.ok(Object.values(view).every(Number.isFinite));
          assert.ok(view.zoom >= minimumRegionalZoom(size) && view.zoom <= 17);
          assert.ok(
            bounds.northWest.lng >= ZMM_BOUNDS[0] - 1e-8 &&
              bounds.northWest.lat <= ZMM_BOUNDS[3] + 1e-8,
          );
          assert.ok(
            bounds.southEast.lng <= ZMM_BOUNDS[2] + 1e-8 &&
              bounds.southEast.lat >= ZMM_BOUNDS[1] - 1e-8,
          );
        }
  for (const positions of [[], [{ lng: NaN, lat: Infinity }], [{ lng: -120, lat: 0 }]]) {
    assert.ok(
      Object.values(fitRegionalPositions(positions, { width: 720, height: 420 })).every(
        Number.isFinite,
      ),
    );
  }
});

test('un focus inválido es seguro desde el primer render y no genera SVG no finito', () => {
  const html = renderToStaticMarkup(
    <LocationMap
      network={network}
      online={false}
      field={null}
      focus={{ lng: Infinity, lat: NaN }}
      onPick={() => {}}
      onStopSelect={() => {}}
    />,
  );
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('tocar, arrastrar y usar flechas elige puntos; zoom mantiene coordenadas regionales', async () => {
  const { svg, picks } = await mount();
  await act(async () => {
    pointer(svg, 'pointerdown', 500, 210);
    pointer(svg, 'pointerup', 500, 210);
  });
  assert.equal(picks.length, 1);
  assert.ok(picks[0].lng > CITY_CENTER.lng);
  const tapped = picks[0];
  await act(async () => {
    pointer(svg, 'pointerdown', 360, 210);
    pointer(svg, 'pointermove', 400, 220);
    pointer(svg, 'pointermove', 460, 230);
    pointer(svg, 'pointerup', 460, 230);
  });
  assert.equal(picks.length, 2);
  assert.ok(picks[1].lng < tapped.lng);
  assert.ok(picks[1].lat > tapped.lat);
  const dragged = picks[1];
  await act(async () => key(svg, 'ArrowRight'));
  assert.equal(picks.length, 3);
  assert.ok(picks[2].lng > dragged.lng);
  await act(async () => {
    for (let i = 0; i < 25; i++) key(svg, '+');
    key(svg, 'ArrowUp');
  });
  assert.ok(
    picks.every(
      (point) =>
        Number.isFinite(point.lng) &&
        Number.isFinite(point.lat) &&
        point.lng >= ZMM_BOUNDS[0] &&
        point.lng <= ZMM_BOUNDS[2] &&
        point.lat >= ZMM_BOUNDS[1] &&
        point.lat <= ZMM_BOUNDS[3],
    ),
  );
  assert.doesNotMatch(svg.outerHTML, /NaN|Infinity/);
});

test('cancelar o perder captura nunca selecciona un punto ni permite continuar el gesto', async () => {
  const { svg, picks } = await mount();
  for (const cancel of ['pointercancel', 'lostpointercapture']) {
    await act(async () => {
      pointer(svg, 'pointerdown', 360, 210);
      pointer(svg, 'pointermove', 600, 300);
      pointer(svg, cancel, 600, 300);
      pointer(svg, 'pointermove', 30, 30);
      pointer(svg, 'pointerup', 30, 30);
    });
    assert.equal(picks.length, 0);
  }
});

test('solo muestra paradas oficiales y permite elegirlas con click o teclado sin mover el mapa', async () => {
  const { container, stops, picks } = await mount();
  const stop = container.querySelector('[aria-label="Elegir parada Parada publicada"]')!;
  assert.ok(stop);
  assert.equal(container.querySelector('[aria-label="Elegir parada No publicada"]'), null);
  assert.equal(container.querySelector('[aria-label="Elegir parada Inválida"]'), null);
  await act(async () => stop.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  await act(async () => key(stop, 'Enter'));
  await act(async () => key(stop, ' '));
  assert.deepEqual(
    stops.map((value) => value.id),
    ['official', 'official', 'official'],
  );
  assert.equal(picks.length, 0);
});

test('un error de tesela conserva el mapa local y ofrece reintentar sin navegar a error global', async () => {
  const { container, svg } = await mount({ online: true, field: null });
  const tile = svg.querySelector('image[href^="https://tile.openstreetmap.org/"]')!;
  assert.ok(tile);
  await act(async () => tile.dispatchEvent(new dom.window.Event('error')));
  assert.ok(svg.querySelector('image[href*="monterrey-map.svg"]'));
  assert.equal(svg.querySelector('image[href^="https://tile.openstreetmap.org/"]'), null);
  assert.match(container.textContent!, /Mapa local simplificado/);
  const retry = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Reintentar calles'),
  )!;
  assert.ok(retry);
  await act(async () => retry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  assert.ok(svg.querySelector('image[href^="https://tile.openstreetmap.org/"]'));
});

test('un pellizco conserva el centro y confirma una sola vez al levantar cualquiera de los dedos', async () => {
  const { svg, picks } = await mount();
  for (const firstUp of [1, 2]) {
    picks.length = 0;
    await act(async () => {
      pointer(svg, 'pointerdown', 260, 210, 1);
      pointer(svg, 'pointerdown', 460, 210, 2);
      pointer(svg, 'pointermove', 200, 210, 1);
      pointer(svg, 'pointermove', 520, 210, 2);
      pointer(svg, 'pointerup', firstUp === 1 ? 200 : 520, 210, firstUp);
      pointer(svg, 'pointerup', firstUp === 1 ? 520 : 200, 210, firstUp === 1 ? 2 : 1);
    });
    assert.equal(picks.length, 1);
    close(picks[0].lng, CITY_CENTER.lng);
    close(picks[0].lat, CITY_CENTER.lat);
  }
  picks.length = 0;
  await act(async () => {
    pointer(svg, 'pointerdown', 260, 210, 1);
    pointer(svg, 'pointerdown', 460, 210, 2);
    pointer(svg, 'pointerup', 460, 210, 2);
    pointer(svg, 'pointerup', 260, 210, 1);
  });
  assert.equal(picks.length, 1);
  close(picks[0].lng, CITY_CENTER.lng);
  close(picks[0].lat, CITY_CENTER.lat);
  picks.length = 0;
  await act(async () => {
    pointer(svg, 'pointerdown', 260, 210, 1);
    pointer(svg, 'pointerdown', 460, 210, 2);
    pointer(svg, 'pointermove', 200, 210, 1);
    pointer(svg, 'pointercancel', 200, 210, 1);
    pointer(svg, 'pointerup', 460, 210, 2);
  });
  assert.equal(picks.length, 0);
  assert.doesNotMatch(svg.outerHTML, /NaN|Infinity/);
});

test('network context draws only selected services and keeps exploration across an equivalent render', async () => {
  const dense: Coordinates[] = Array.from({ length: 1001 }, (_, index) => [
    -100.4 + index * 0.0001,
    25.7 + Math.sin(index / 15) * 0.015,
  ]);
  const bus = {
    id: 'test-bus',
    mode: 'bus',
    color: '#146db3',
    segments: [{ id: 'bus-segment', coordinates: dense }],
  } as MobilityRoute;
  const metro = {
    id: 'test-metro',
    mode: 'metro',
    color: '#19a260',
    segments: [
      {
        id: 'metro-segment',
        coordinates: [
          [-100.31, 25.67],
          [-100.29, 25.73],
        ],
      },
    ],
  } as MobilityRoute;
  const contextNetwork = { ...network, routes: [bus, metro] };
  const { svg, container } = await mount({
    network: contextNetwork,
    field: null,
    contextRoutes: [bus],
  });
  assert.ok(svg.querySelector('[data-line="test-bus"]'));
  assert.equal(svg.querySelector('[data-line="test-metro"]'), null);
  const trace = svg.querySelector('[data-line="test-bus"]')!;
  assert.equal(
    trace.getAttribute('points')!.split(' ').length,
    dense.length,
    'A selected service retains every published vertex.',
  );
  assert.match(container.textContent!, /trazos publicados/);
  await act(async () => key(svg, 'ArrowRight'));
  const moved = trace.getAttribute('points');
  await act(async () =>
    activeRoot!.render(
      <LocationMap
        network={contextNetwork}
        online={false}
        field={null}
        contextRoutes={[bus]}
        onPick={() => {}}
        onStopSelect={() => {}}
      />,
    ),
  );
  assert.equal(
    svg.querySelector('[data-line="test-bus"]')!.getAttribute('points'),
    moved,
    'A new array with the same services must not reset user pan.',
  );
  await act(async () =>
    activeRoot!.render(
      <LocationMap
        network={contextNetwork}
        online={false}
        field={null}
        contextRoutes={[metro]}
        onPick={() => {}}
        onStopSelect={() => {}}
      />,
    ),
  );
  assert.equal(svg.querySelector('[data-line="test-bus"]'), null);
  assert.ok(svg.querySelector('[data-line="test-metro"]'));
  const overview = simplifyOverviewGeometry(dense);
  assert.ok(overview.length <= 200);
  assert.equal(overview[0], dense[0]);
  assert.equal(overview.at(-1), dense.at(-1));
  assert.ok(
    overview.every((point) => dense.includes(point)),
    'Simplification uses only real vertices.',
  );
  assert.equal(dense.length, 1001, 'The source network geometry stays intact.');
});

async function zoomTo(svg: SVGSVGElement, level: number) {
  while (Number(svg.dataset.mapZoom) < level) await act(async () => key(svg, '+'));
}

test('el mapa general distingue las tres líneas del Metro y sus estaciones publicadas', async () => {
  const metro = publishedNetwork.routes.filter((route) => route.mode === 'metro');
  const { container, svg } = await mount({
    network: publishedNetwork,
    contextRoutes: metro,
    online: true,
    field: null,
  });
  assert.equal(
    svg.querySelector('image[href^="https://tile.openstreetmap.org/"]'),
    null,
    'La red usa el fondo local discreto incluso con conexión.',
  );
  const traces = [...svg.querySelectorAll<SVGPolylineElement>('polyline[data-line]')];
  assert.equal(traces.length, 3);
  assert.equal(svg.querySelectorAll('.location-route-casing').length, 3);
  for (const route of metro) {
    const trace = traces.find((line) => line.dataset.line === route.id)!;
    assert.ok(trace, `${route.name} debe tener un trazo visible.`);
    assert.equal(trace.getAttribute('stroke')?.toLowerCase(), route.color.toLowerCase());
    assert.equal(trace.getAttribute('opacity'), '1');
    assert.ok(Number(trace.getAttribute('stroke-width')) >= 4.5);
  }
  assert.equal(svg.querySelectorAll('[data-stop]').length, 0, 'La vista regional conserva sólo los trazos.');
  await zoomTo(svg, 14);
  const markers = [...svg.querySelectorAll<SVGCircleElement>('circle.location-transit-stop')];
  assert.ok(markers.length > 0 && markers.length <= 180, 'Acercarse revela las estaciones próximas.');
  const metroStopIds = new Set(
    publishedNetwork.stops.filter((stop) => stop.mode === 'metro').map((stop) => stop.id),
  );
  for (const marker of svg.querySelectorAll('[data-stop]')) {
    assert.ok(
      metroStopIds.has(marker.getAttribute('data-stop')!),
      'Usa estaciones reales del Metro.',
    );
  }
  assert.equal(svg.querySelectorAll('[data-stop][role="button"]').length, 0);
  assert.equal(svg.querySelectorAll('[data-stop][tabindex="0"]').length, 0);
  const legend = container.querySelector('[role="group"][aria-label="Leyenda del mapa"]');
  assert.ok(legend);
  for (const label of ['Línea 1', 'Línea 2', 'Línea 3', 'Estación o parada']) {
    assert.ok(legend.textContent?.includes(label), `La leyenda explica ${label}.`);
  }
});

test('el filtro de red muestra bolitas únicamente de paradas asociadas a las rutas seleccionadas', async () => {
  const route = publishedNetwork.routes.find((candidate) => candidate.networkId === 'regioruta')!;
  assert.ok(route);
  const { svg } = await mount({
    network: publishedNetwork,
    contextRoutes: [route],
    online: false,
    field: null,
  });
  await zoomTo(svg, 14);
  const stopsById = new Map(publishedNetwork.stops.map((stop) => [stop.id, stop]));
  const markers = [...svg.querySelectorAll('[data-stop]')];
  assert.ok(markers.length > 0);
  assert.ok(markers.length <= 240);
  for (const marker of markers) {
    const stop = stopsById.get(marker.getAttribute('data-stop')!);
    assert.ok(stop?.official);
    assert.ok(stop.routeIds.includes(route.id));
  }
  assert.equal(svg.querySelector('[data-mode="metro"]'), null);
  const trace = svg.querySelector('[data-line]')!;
  assert.equal(trace.getAttribute('stroke')?.toLowerCase(), route.color.toLowerCase());
  assert.equal(trace.getAttribute('opacity'), '1');
  assert.ok(Number(trace.getAttribute('stroke-width')) >= 3.5);
});

test('todas las redes ocultan paradas regionales y revelan puntos próximos con densidad limitada', async () => {
  const { svg } = await mount({
    network: publishedNetwork,
    contextRoutes: publishedNetwork.routes,
    online: true,
    field: null,
  });
  assert.equal(svg.querySelectorAll('[data-stop]').length, 0);
  assert.equal(svg.querySelectorAll('.location-station-labels text').length, 0);
  await zoomTo(svg, 14);
  const markers = [...svg.querySelectorAll('[data-stop]')];
  assert.ok(markers.length > 0);
  assert.ok(markers.length <= 180, 'La red no genera miles de nodos SVG ni blancos invisibles.');
  assert.equal(
    new Set(markers.map((marker) => marker.getAttribute('data-stop'))).size,
    markers.length,
    'Una misma parada no se repite para cada línea que la sirve.',
  );
  assert.equal(svg.querySelector('image[href^="https://tile.openstreetmap.org/"]'), null);
});

test('centrar la red restaura el encuadre de sus servicios después de explorar', async () => {
  const routes = publishedNetwork.routes.filter((route) => route.mode === 'metro');
  const { svg, container } = await mount({
    network: publishedNetwork,
    contextRoutes: routes,
    field: null,
  });
  const trace = svg.querySelector('[data-line="L1"]')!;
  const initial = trace.getAttribute('points');
  await act(async () => key(svg, 'ArrowRight'));
  assert.notEqual(trace.getAttribute('points'), initial);
  const center = [...container.querySelectorAll('button')].find((button) =>
    /^Centrar mapa/.test(button.getAttribute('aria-label') || ''),
  );
  assert.ok(center);
  await act(async () =>
    center.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
  );
  assert.equal(
    trace.getAttribute('points'),
    initial,
    'No vuelve a un centro genérico ajeno a la red.',
  );
});

test('Planear conserva las calles en línea con un fondo atenuado para distinguir sus recorridos', async () => {
  const { svg } = await mount({ online: true, field: 'from' });
  const tile = svg.querySelector('image[href^="https://tile.openstreetmap.org/"]');
  assert.ok(tile);
  assert.ok(tile.closest('.location-map-basemap'), 'Sólo el fondo recibe la atenuación visual.');
});

async function centerOnCuauhtemoc() {
  const stop = publishedNetwork.stops.find((item) => item.id === 'metro:cuauhtemoc')!;
  await act(async () => activeRoot!.render(<LocationMap
    network={publishedNetwork} online={false} field={null}
    contextRoutes={publishedNetwork.routes.filter((route) => route.mode === 'metro')}
    focus={stop}
  />));
}

test('tocar una estación consulta sus conexiones sin cambiar origen ni destino', async () => {
  const { svg, container, picks, stops } = await mount({
    network: publishedNetwork,
    contextRoutes: publishedNetwork.routes.filter((route) => route.mode === 'metro'),
    field: null,
  });
  await centerOnCuauhtemoc();
  const marker = svg.querySelector<SVGCircleElement>('[data-stop="metro:cuauhtemoc"]')!;
  assert.ok(marker);
  const x = Number(marker.getAttribute('cx')),
    y = Number(marker.getAttribute('cy'));
  await act(async () => {
    pointer(svg, 'pointerdown', x, y);
    pointer(svg, 'pointerup', x, y);
  });
  const card = container.querySelector('[aria-label="Estación seleccionada"]')!;
  assert.ok(card);
  assert.match(card.textContent!, /Cuauhtémoc/);
  assert.match(card.textContent!, /Línea 1.*Línea 2/);
  assert.equal(picks.length, 0);
  assert.equal(stops.length, 0);
  assert.equal(marker.getAttribute('r'), '6');
  const close = container.querySelector('[aria-label="Cerrar información de estación"]')!;
  await act(async () => close.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  assert.equal(container.querySelector('[aria-label="Estación seleccionada"]'), null);
});

test('arrastrar o cancelar el mapa no abre fichas y la selección también funciona con controles nativos', async () => {
  const { svg, container } = await mount({
    network: publishedNetwork,
    contextRoutes: publishedNetwork.routes.filter((route) => route.mode === 'metro'),
    field: null,
  });
  await centerOnCuauhtemoc();
  const marker = svg.querySelector<SVGCircleElement>('[data-stop="metro:cuauhtemoc"]')!;
  const x = Number(marker.getAttribute('cx')),
    y = Number(marker.getAttribute('cy'));
  await act(async () => {
    pointer(svg, 'pointerdown', x, y);
    pointer(svg, 'pointermove', x + 30, y + 30);
    pointer(svg, 'pointerup', x + 30, y + 30);
  });
  assert.equal(container.querySelector('.location-station-card'), null);
  await act(async () => {
    pointer(svg, 'pointerdown', x, y);
    pointer(svg, 'pointercancel', x, y);
  });
  assert.equal(container.querySelector('.location-station-card'), null);
  const select = container.querySelector<HTMLSelectElement>('.location-stop-picker select')!;
  assert.ok(select);
  await act(async () => {
    select.value = 'metro:cuauhtemoc';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.match(container.querySelector('.location-station-card')!.textContent!, /Cuauhtémoc/);
  assert.ok(svg.querySelectorAll('.location-station-labels text').length <= 9);
});

test('aislar una línea conserva la información real de conexiones de una estación compartida', async () => {
  const { svg, container } = await mount({
    network: publishedNetwork,
    contextRoutes: publishedNetwork.routes.filter((route) => route.id === 'L1'),
    field: null,
  });
  const select = container.querySelector<HTMLSelectElement>('.location-stop-picker select')!;
  await act(async () => {
    select.value = 'metro:cuauhtemoc';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.match(container.querySelector('.location-station-card')!.textContent!, /Línea 1.*Línea 2/);
  assert.ok(svg.querySelector('[data-line="L1"]'));
  assert.equal(svg.querySelector('[data-line="L2"]'), null);
});

test('la guía deja el mapa en primer plano y conserva la consulta accesible de paradas sin desplazarlo', async () => {
  const routes = publishedNetwork.routes.filter((route) => route.mode === 'metro');
  const { svg, container, picks, stops } = await mount({
    network: publishedNetwork,
    contextRoutes: routes,
    navigationMode: true,
    field: null,
  });
  const map = container.querySelector('.location-map.navigating')!;
  const canvas = map.querySelector('.location-map-canvas')!;
  assert.equal(map.children.length, 1, 'No agrega leyendas ni fichas debajo del mapa de la guía.');
  const references = canvas.querySelector<HTMLDetailsElement>('.location-navigation-info')!;
  assert.ok(references);
  assert.equal(references.open, false, 'La información secundaria empieza cerrada.');
  assert.match(references.querySelector('summary')!.textContent!, /Paradas y leyenda/);
  assert.match(references.textContent!, /Mapa local simplificado/);
  assert.ok(references.querySelector('[aria-label="Leyenda del mapa"]'));
  const selector = references.querySelector<HTMLSelectElement>('select')!;
  assert.equal(
    references.querySelector('label')!.htmlFor,
    selector.id,
    'El selector nativo de paradas conserva su etiqueta para teclado y lector de pantalla.',
  );
  for (const label of ['Acercar mapa', 'Alejar mapa', 'Centrar mapa en las rutas'])
    assert.ok(canvas.querySelector(`button[aria-label="${label}"]`));
  const trace = svg.querySelector('[data-line="L1"]')!;
  await act(async () => key(svg, 'ArrowRight'));
  const explored = trace.getAttribute('points');
  await act(async () => {
    references.open = true;
    selector.value = 'metro:cuauhtemoc';
    selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  const card = canvas.querySelector('[aria-label="Estación seleccionada"]')!;
  assert.ok(
    card,
    'La ficha se muestra dentro del mapa en lugar de empujar las acciones de la guía.',
  );
  assert.match(card.textContent!, /Cuauhtémoc.*Línea 1.*Línea 2/);
  assert.equal(
    references.open,
    false,
    'La lista se cierra para dejar visible la parada consultada.',
  );
  assert.equal(
    document.activeElement,
    references.querySelector('summary'),
    'El foco no queda dentro de una lista oculta al seleccionar con el teclado.',
  );
  assert.equal(
    trace.getAttribute('points'),
    explored,
    'Consultar una parada no cambia el encuadre.',
  );
  await act(async () =>
    card
      .querySelector('button[aria-label="Cerrar información de estación"]')!
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
  );
  assert.equal(canvas.querySelector('[aria-label="Estación seleccionada"]'), null);
  assert.equal(picks.length, 0);
  assert.equal(stops.length, 0);
});

test('el modo compacto no altera el trazo ni la exploración del mapa y las otras vistas mantienen sus referencias', async () => {
  const routes = publishedNetwork.routes.filter((route) => route.mode === 'metro');
  const { svg, container } = await mount({
    network: publishedNetwork,
    contextRoutes: routes,
    navigationMode: true,
    field: null,
  });
  await act(async () => key(svg, 'ArrowRight'));
  const explored = svg.querySelector('[data-line="L1"]')!.getAttribute('points');
  await act(async () =>
    activeRoot!.render(
      <LocationMap network={publishedNetwork} online={false} field={null} contextRoutes={routes} />,
    ),
  );
  assert.equal(svg.querySelector('[data-line="L1"]')!.getAttribute('points'), explored);
  assert.equal(container.querySelector('.location-navigation-info'), null);
  assert.ok(container.querySelector('.location-map > .location-map-legend'));
  assert.ok(container.querySelector('.location-map > .location-map-caption'));
  assert.ok(container.querySelector('.location-map-area'));
});

test('a compact map expands on tap or Enter, without confusing a drag or cancellation with a tap', async () => {
  let expanded = 0;
  const { svg, container } = await mount({
    field: null,
    compact: true,
    onExpand: () => expanded++,
  });
  await act(async () => {
    key(svg, 'Enter');
  });
  assert.equal(expanded, 1);
  await act(async () => {
    pointer(svg, 'pointerdown', 200, 180);
    pointer(svg, 'pointerup', 200, 180);
  });
  assert.equal(expanded, 2);
  await act(async () => {
    pointer(svg, 'pointerdown', 200, 180);
    pointer(svg, 'pointermove', 260, 200);
    pointer(svg, 'pointerup', 260, 200);
    pointer(svg, 'pointerdown', 200, 180);
    pointer(svg, 'pointercancel', 200, 180);
  });
  assert.equal(expanded, 2);
  assert.equal(container.querySelector('.location-map > .location-map-legend'), null);
  assert.equal(container.querySelector('.location-map-info')?.hasAttribute('open'), false);
});

test('journey geometry gaps stay disconnected and resizing a sheet refits a route into the visible map', async () => {
  const journey = {
    id: 'resize-gaps',
    stationIds: [],
    steps: [
      {
        mode: 'bus',
        lineId: 'bus',
        geometry: [
          [-100.4, 25.7],
          [-100.38, 25.71],
          [NaN, 25.7],
          [-100.31, 25.69],
          [-100.3, 25.68],
        ],
      },
    ],
  } as unknown as import('../src/mobility/types').MobilityJourney;
  const { svg } = await mount({ field: null, journey, compact: true });
  const traces = () => [...svg.querySelectorAll('[data-line="bus"]')];
  assert.equal(traces().length, 2, 'A missing vertex must not create a connection across the gap.');
  for (const trace of traces()) assert.equal(trace.getAttribute('points')!.split(' ').length, 2);
  const before = traces()[0].getAttribute('points');
  try {
    rect.height = 220;
    rect.bottom = 220;
    await act(async () => {
      window.dispatchEvent(new dom.window.Event('resize'));
    });
    assert.notEqual(traces()[0].getAttribute('points'), before);
    for (const trace of traces())
      for (const pair of trace.getAttribute('points')!.split(' ')) {
        const [x, y] = pair.split(',').map(Number);
        assert.ok(Number.isFinite(x) && x >= 20 && x <= rect.width - 20);
        assert.ok(Number.isFinite(y) && y >= 20 && y <= rect.height - 20);
      }
  } finally {
    rect.height = 420;
    rect.bottom = 420;
  }
});


test('una parada seleccionada sigue visible al alejarse sin revelar todas las demás', async () => {
  const { svg, container } = await mount({
    network: publishedNetwork,
    contextRoutes: publishedNetwork.routes.filter((route) => route.id === 'L1'),
    field: null,
  });
  const select = container.querySelector<HTMLSelectElement>('select')!;
  await act(async () => {
    select.value = 'metro:cuauhtemoc';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  while (Number(svg.dataset.mapZoom) >= 13) await act(async () => key(svg, '-'));
  assert.deepEqual([...svg.querySelectorAll('[data-stop]')].map((point) => point.getAttribute('data-stop')), ['metro:cuauhtemoc']);
  assert.match(container.querySelector('.location-station-card')!.textContent!, /Cuauhtémoc/);
});

test('cambiar de tamaño preserva la cámara explorada de la red y centrar respeta el área útil', async () => {
  const routes = publishedNetwork.routes.filter((route) => route.id === 'L1');
  const { svg, container } = await mount({
    network: publishedNetwork, contextRoutes: routes, field: null,
    viewportPadding: { top: 125, bottom: 50, left: 12, right: 70 },
    preserveViewportOnResize: true,
  });
  const original = { zoom: svg.dataset.mapZoom, center: svg.dataset.mapCenter };
  await act(async () => key(svg, 'ArrowRight'));
  const explored = { zoom: svg.dataset.mapZoom, center: svg.dataset.mapCenter };
  assert.notDeepEqual(explored, original);
  try {
    rect.height = 600; rect.bottom = 600;
    await act(async () => window.dispatchEvent(new dom.window.Event('resize')));
    assert.deepEqual({ zoom: svg.dataset.mapZoom, center: svg.dataset.mapCenter }, explored);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Centrar mapa en las rutas"]')!.click());
    const positions = svg.querySelector('[data-line="L1"]')!.getAttribute('points')!.split(' ').map((pair) => pair.split(',').map(Number));
    for (const [x, y] of positions) {
      assert.ok(x >= 12 && x <= rect.width - 70, `x=${x} está en el área libre.`);
      assert.ok(y >= 125 && y <= rect.height - 50, `y=${y} está debajo del buscador.`);
    }
  } finally { rect.height = 420; rect.bottom = 420; }
});
