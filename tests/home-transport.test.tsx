/** Behavioral tests for the new home selection; no browser layout or phone camera claims. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React, { type ComponentProps } from 'react';
import { JSDOM } from 'jsdom';
import type { RoutePack, TransitCatalogData, TransitRoute } from '../src/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'location',
  'localStorage',
  'getComputedStyle',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  if (name === 'fetch') continue;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof Window],
  });
}
const styles = registerHooks({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { default: HomeTransportHub } = await import('../src/components/HomeTransportHub');
const { nearestHomePoint, homeRouteSegments, projectHomePreview } =
  await import('../src/components/homeTransport');
const { network } = await import('../src/api');
const { render, screen, cleanup, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
type Props = ComponentProps<typeof HomeTransportHub>;
const station = network.stations[0];
const makeRoute = (id: string, overrides: Partial<TransitRoute> = {}): TransitRoute => ({
  id,
  code: id.toUpperCase(),
  name: `Ruta ${id}`,
  networkId: 'transmetro',
  mode: 'bus',
  status: 'published',
  statusAsOf: null,
  municipalities: ['Monterrey'],
  from: null,
  to: null,
  via: [],
  sourceIds: [],
  officialUrl: null,
  planningEligible: true,
  geometryPack: 'home-test',
  notes: [],
  ...overrides,
});
const catalog: TransitCatalogData = {
  version: 1,
  verifiedAt: '2026-11-05',
  networks: [],
  sources: [],
  routes: [
    makeRoute('bus-a', { officialUrl: 'javascript:alert(1)' }),
    makeRoute('bus-b', { geometryPack: null, officialUrl: 'https://example.test/catalog/bus-b' }),
    makeRoute('bus-c', { geometryPack: 'home-other' }),
    makeRoute('construction', { status: 'construction' }),
    makeRoute('metro', { mode: 'metro' }),
  ],
};
const pack: RoutePack = {
  id: 'home-test',
  sourceUrl: 'https://example.test/route',
  verifiedAt: '2026-11-05',
  coordinates: [
    [-100.4, 25.7],
    [-100.39, 25.71],
    [-100.3, 25.7],
    [-100.29, 25.71],
  ],
  segments: [
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
    { id: 'stop-a', name: 'Parada A', lat: 25.7, lng: -100.4 },
    { id: 'stop-b', name: 'Parada B', lat: 25.71, lng: -100.29 },
  ],
  stopOrderVerified: false,
};
let requests: string[];
let gpsCalls: number;
let gpsSuccess: PositionCallback | undefined;
let gpsError: PositionErrorCallback | undefined;
let failCatalog: boolean;
let waitForPack: ((value: Response) => void) | undefined;
let holdPack: boolean;
let responsePack: RoutePack & {
  experimentalRouting?: boolean;
  stops: (RoutePack['stops'][number] & { publishedInfrastructureNote?: string })[];
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  requests = [];
  gpsCalls = 0;
  gpsSuccess = undefined;
  gpsError = undefined;
  failCatalog = false;
  holdPack = false;
  responsePack = pack;
  waitForPack = undefined;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: PositionCallback, error: PositionErrorCallback) {
        gpsCalls++;
        gpsSuccess = success;
        gpsError = error;
      },
    },
  });
  globalThis.fetch = async (input) => {
    const path = String(input);
    requests.push(path);
    if (path.startsWith('/transit-catalog.json')) {
      if (failCatalog) throw new Error('offline');
      return json(catalog);
    }
    if (path.startsWith('/route-packs/')) {
      if (holdPack)
        return new Promise<Response>((resolve) => {
          waitForPack = resolve;
        });
      return json(
        path.includes('home-other') ? { ...responsePack, id: 'home-other' } : responsePack,
      );
    }
    throw new Error(`Unexpected request: ${path}`);
  };
});
afterEach(cleanup);
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    station,
    onChooseStation() {},
    onSelectStation() {},
    onNetwork() {},
    onReportTarget() {},
    metroContent: <p>Contenido de Metro simulado</p>,
    reportAction: <button type="button">Crear reporte general</button>,
    community: (target) => (
      <div data-testid="community" data-target={target.stationId || target.routeId}>
        Reportes aprobados
      </div>
    ),
    ...overrides,
  };
  return { ...render(<HomeTransportHub {...props} />), props };
}
async function chooseBus() {
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('tab', { name: /Autobús/ }));
  await screen.findByRole('combobox', { name: 'Ruta', exact: true });
  return user;
}
async function position(lat: number, lng: number, accuracy = 30) {
  await act(async () =>
    gpsSuccess?.({
      coords: { latitude: lat, longitude: lng, accuracy },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
}

test('home opens Metro without catalog, graph, tiles or a GPS prompt; tabs preserve keyboard access', async () => {
  const { container } = mount();
  const assertPanelRelations = () => {
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!);
      assert.ok(panel, 'Every tab controls an existing panel.');
      assert.equal(panel.getAttribute('role'), 'tabpanel');
      assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
      const inactive = tab.getAttribute('aria-selected') === 'false';
      assert.equal(panel.hidden, inactive);
      if (inactive) assert.equal(panel.childElementCount, 0, 'Inactive content stays unmounted.');
    }
    assert.equal(screen.getAllByRole('tabpanel').length, 1);
  };
  assertPanelRelations();
  assert.deepEqual(requests, []);
  assert.equal(gpsCalls, 0);
  assert.match(container.textContent!, /Contenido de Metro simulado/);
  assert.equal(container.querySelectorAll('.home-transport-map polyline').length, 1);
  assert.equal(container.querySelectorAll('img,image').length, 0);
  const user = userEvent.setup({ document: dom.window.document });
  screen.getByRole('tab', { name: /^Metro/ }).focus();
  await user.keyboard('{ArrowRight}');
  await screen.findByRole('combobox', { name: 'Ruta', exact: true });
  assert.equal(document.activeElement, screen.getByRole('tab', { name: /Autobús/ }));
  assert.deepEqual(requests, ['/transit-catalog.json']);
  assert.equal(screen.queryByText('Contenido de Metro simulado'), null);
  assert.ok(screen.getByRole('button', { name: 'Crear reporte general' }));
  assertPanelRelations();
  for (const shortcut of [
    '{Control>}{Home}{/Control}',
    '{Alt>}{ArrowLeft}{/Alt}',
    '{Meta>}{Home}{/Meta}',
  ]) {
    await user.keyboard(shortcut);
    const busTab = screen.getByRole('tab', { name: /Autobús/ });
    assert.equal(busTab.getAttribute('aria-selected'), 'true');
    assert.equal(document.activeElement, busTab);
    assertPanelRelations();
  }
  await user.keyboard('{ArrowLeft}');
  assertPanelRelations();
  assert.equal(document.activeElement, screen.getByRole('tab', { name: /^Metro/ }));
  assert.ok(screen.getByText('Contenido de Metro simulado'));
  assert.deepEqual(requests, ['/transit-catalog.json']);
});

test('a catalog route without geometry stays selectable and reportable without invented stops, ETA or ratings', async () => {
  let target: Parameters<Props['onReportTarget']>[0] | undefined;
  mount({
    onReportTarget: (value) => {
      target = value;
    },
  });
  const user = await chooseBus();
  const select = screen.getByRole('combobox', { name: 'Ruta', exact: true });
  assert.equal(screen.queryByRole('option', { name: /construction|Ruta metro/ }), null);
  await user.selectOptions(select, 'bus-b');
  assert.match(screen.getByRole('status').textContent!, /trazo y paradas siguen pendientes/);
  assert.equal(screen.queryByRole('combobox', { name: 'Parada del recorrido' }), null);
  assert.equal(screen.queryByLabelText('Encontrar parada cercana de esta ruta'), null);
  await user.click(screen.getByRole('button', { name: /Reportar aquí/ }));
  assert.deepEqual(target, { routeId: 'bus-b' });
  assert.equal(screen.getByTestId('community').getAttribute('data-target'), 'bus-b');
  assert.deepEqual(requests, ['/transit-catalog.json']);
  assert.equal(screen.queryByText(/estrellas|llega en|minutos/i), null);
});

test('selected bus loads one route pack, preserves geometry gaps and scopes its map and community context', async () => {
  let networkOpened = 0;
  const { container } = mount({
    onNetwork: () => {
      networkOpened++;
    },
  });
  const user = await chooseBus();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-a');
  await screen.findByRole('combobox', { name: 'Parada del recorrido' });
  assert.deepEqual(requests, ['/transit-catalog.json', '/route-packs/home-test.json']);
  assert.equal(container.querySelectorAll('.home-transport-map polyline').length, 2);
  assert.match(container.textContent!, /Sin llegadas ni afluencia en tiempo real/);
  assert.equal(screen.getByTestId('community').getAttribute('data-target'), 'bus-a');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Parada del recorrido' }),
    'stop-b',
  );
  assert.equal(container.querySelectorAll('.home-transport-map > svg circle').length, 2);
  await user.click(screen.getByRole('button', { name: 'Explorar la red: Ruta bus-a' }));
  assert.equal(networkOpened, 1);
  assert.equal(
    requests.some((path) => /mobility-network|tile/.test(path)),
    false,
  );
});

test('bus provenance retains dated HTTPS sources, inferred order and pending-route references without joining gaps', async () => {
  const { container } = mount();
  const user = await chooseBus();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-a');
  await screen.findByRole('combobox', { name: 'Parada del recorrido' });
  const details = container.querySelector('.home-transport-sources') as HTMLDetailsElement;
  assert.equal(details.open, false);
  await user.click(screen.getByText('Fuente y alcance'));
  assert.equal(details.open, true);
  assert.match(details.textContent!, /Orden de paradas por confirmar/);
  assert.match(details.textContent!, /no confirma la operación actual/);
  assert.equal(details.querySelector('time')?.getAttribute('dateTime'), '2026-11-05');
  assert.equal(
    screen.getByRole('link', { name: 'Fuente del trazo' }).getAttribute('href'),
    pack.sourceUrl,
  );
  assert.equal(screen.queryByRole('link', { name: 'Fuente de la ruta' }), null);
  assert.equal(container.querySelectorAll('.home-transport-map polyline').length, 2);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-b');
  await user.click(screen.getByText('Fuente y alcance'));
  assert.equal(
    screen.getByRole('link', { name: 'Fuente de la ruta' }).getAttribute('href'),
    'https://example.test/catalog/bus-b',
  );
  assert.equal(screen.queryByRole('link', { name: 'Fuente del trazo' }), null);
  assert.match(
    container.querySelector('.home-transport-sources')!.textContent!,
    /Corte del catálogo/,
  );
  assert.match(screen.getByRole('status').textContent!, /trazo y paradas siguen pendientes/);
});

test('late Metro GPS never replaces a station chosen manually or after changing mode', async () => {
  const selected: string[] = [];
  let manual = 0;
  mount({
    onChooseStation: () => {
      manual++;
    },
    onSelectStation: (id) => selected.push(id),
  });
  const user = userEvent.setup({ document: dom.window.document });
  assert.equal(gpsCalls, 0);
  await user.click(screen.getByRole('button', { name: 'Encontrar estación de Metro cercana' }));
  await waitFor(() => assert.equal(gpsCalls, 1));
  await user.click(screen.getByRole('button', { name: /Tu estación/ }));
  await position(station.lat, station.lng);
  assert.equal(manual, 1);
  assert.deepEqual(selected, []);
  await user.click(screen.getByRole('button', { name: 'Encontrar estación de Metro cercana' }));
  await waitFor(() => assert.equal(gpsCalls, 2));
  await user.click(screen.getByRole('tab', { name: /Autobús/ }));
  await position(station.lat, station.lng);
  assert.deepEqual(selected, []);
});

test('explicit GPS selects the nearest Metro and rejects remote, imprecise and denied fixes', async () => {
  const selected: string[] = [];
  mount({ onSelectStation: (id) => selected.push(id) });
  const user = userEvent.setup({ document: dom.window.document });
  const locate = screen.getByRole('button', { name: 'Encontrar estación de Metro cercana' });
  await user.click(locate);
  await waitFor(() => assert.equal(gpsCalls, 1));
  await position(station.lat, station.lng);
  assert.deepEqual(selected, [station.id]);
  await user.click(locate);
  await waitFor(() => assert.equal(gpsCalls, 2));
  await position(0, 0);
  assert.match(screen.getByRole('status').textContent!, /No encontramos una estación/);
  await user.click(locate);
  await waitFor(() => assert.equal(gpsCalls, 3));
  await position(station.lat, station.lng, 2000);
  assert.match(screen.getByRole('status').textContent!, /imprecisa/);
  await user.click(locate);
  await waitFor(() => assert.equal(gpsCalls, 4));
  await act(async () => gpsError?.({ code: 1 } as GeolocationPositionError));
  assert.match(screen.getByRole('status').textContent!, /No se concedió/);
  assert.deepEqual(selected, [station.id]);
});

test('bus GPS finds a stop only within the selected route and manual selection invalidates late fixes', async () => {
  mount();
  const user = await chooseBus();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-a');
  const stops = (await screen.findByRole('combobox', {
    name: 'Parada del recorrido',
  })) as HTMLSelectElement;
  const locate = screen.getByRole('button', { name: 'Encontrar parada cercana de esta ruta' });
  await user.click(locate);
  await waitFor(() => assert.equal(gpsCalls, 1));
  await position(pack.stops[0].lat, pack.stops[0].lng);
  assert.equal(stops.value, 'stop-a');
  assert.match(screen.getByRole('status').textContent!, /de esta ruta en línea recta/);
  await user.click(locate);
  await waitFor(() => assert.equal(gpsCalls, 2));
  await user.selectOptions(stops, 'stop-b');
  await position(pack.stops[0].lat, pack.stops[0].lng);
  assert.equal(stops.value, 'stop-b');
});

test('a GPS-selected station keeps its feedback after the parent updates, but unmount ignores late fixes', async () => {
  let selected = '';
  const view = mount({
    onSelectStation: (id) => {
      selected = id;
    },
  });
  const user = userEvent.setup({ document: dom.window.document });
  const nextStation = network.stations[1];
  await user.click(screen.getByRole('button', { name: 'Encontrar estación de Metro cercana' }));
  await waitFor(() => assert.equal(gpsCalls, 1));
  await position(nextStation.lat, nextStation.lng);
  assert.equal(selected, nextStation.id);
  view.rerender(<HomeTransportHub {...view.props} station={nextStation} />);
  assert.match(screen.getByRole('status').textContent!, /estación más cercana en línea recta/);
  await user.click(screen.getByRole('button', { name: 'Encontrar estación de Metro cercana' }));
  await waitFor(() => assert.equal(gpsCalls, 2));
  view.unmount();
  await position(station.lat, station.lng);
  assert.equal(selected, nextStation.id);
});

test('bus selection and GPS exclude proposed, distant, invalid and duplicate markers while visualization-only traces stay visible', async () => {
  responsePack = {
    ...pack,
    stops: [
      pack.stops[0],
      {
        ...pack.stops[1],
        id: 'proposal',
        name: 'Solo propuesta',
        publishedInfrastructureNote: 'PROPUESTA',
      },
      { id: 'far', name: 'Marcador lejos del trazo', lat: 25.705, lng: -100.35 },
      { id: 'invalid', name: 'Coordenada inválida', lat: 91, lng: -100.4 },
      { ...pack.stops[1], id: pack.stops[0].id, name: 'Identificador duplicado' },
      {
        id: 'exists',
        name: 'Punto existente publicado',
        lat: 25.705,
        lng: -100.395,
        publishedInfrastructureNote: 'EXISTE; PROPUESTA de mejora',
      },
    ],
  };
  const { container } = mount();
  const user = await chooseBus();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-a');
  const stops = (await screen.findByRole('combobox', {
    name: 'Parada del recorrido',
  })) as HTMLSelectElement;
  assert.deepEqual(
    [...stops.options].map((option) => option.value),
    ['', 'stop-a', 'exists'],
  );
  assert.equal(container.querySelectorAll('.home-transport-map polyline').length, 2);
  await user.click(screen.getByRole('button', { name: 'Encontrar parada cercana de esta ruta' }));
  await waitFor(() => assert.equal(gpsCalls, 1));
  await position(pack.stops[1].lat, pack.stops[1].lng);
  assert.equal(stops.value, 'exists');
  assert.match(container.textContent!, /Confirma parada y sentido/);
  responsePack = { ...pack, experimentalRouting: false };
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-c');
  await screen.findByText(/Trazo para consulta visual/);
  assert.equal(screen.queryByRole('combobox', { name: 'Parada del recorrido' }), null);
  assert.equal(
    screen.queryByRole('button', { name: 'Encontrar parada cercana de esta ruta' }),
    null,
  );
  assert.equal(container.querySelectorAll('.home-transport-map polyline').length, 2);
  assert.equal(screen.getByTestId('community').getAttribute('data-target'), 'bus-c');
});

test('an interchange can choose its preview line without changing the selected station', async () => {
  const interchange = network.stations.find((item) => item.lineIds.length > 1)!;
  let selected = '';
  const { container } = mount({
    station: interchange,
    onSelectStation: (id) => {
      selected = id;
    },
  });
  const user = userEvent.setup({ document: dom.window.document });
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Línea para el mapa' }),
    interchange.lineIds[1],
  );
  assert.equal(
    container.querySelector('.home-transport-map')?.getAttribute('data-line'),
    interchange.lineIds[1],
  );
  assert.equal(screen.getByTestId('community').getAttribute('data-target'), interchange.id);
  assert.equal(selected, '');
  assert.deepEqual(requests, []);
});

test('a late route pack does not leak stops into another route and failed catalogs are retryable', async () => {
  failCatalog = true;
  mount();
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('tab', { name: /Autobús/ }));
  await screen.findByRole('alert');
  failCatalog = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar rutas' }));
  await screen.findByRole('combobox', { name: 'Ruta', exact: true });
  holdPack = true;
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-a');
  await waitFor(() => assert.equal(typeof waitForPack, 'function'));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Ruta', exact: true }), 'bus-b');
  await act(async () => waitForPack?.(json(pack)));
  assert.equal(screen.queryByRole('combobox', { name: 'Parada del recorrido' }), null);
  assert.equal(screen.getByTestId('community').getAttribute('data-target'), 'bus-b');
});

test('nearest scan and schematic projection reject bad fixes, enforce distance and never join published gaps', () => {
  assert.equal(nearestHomePoint(network.stations, { lat: NaN, lng: 0 }), null);
  assert.equal(nearestHomePoint(network.stations, { lat: 0, lng: 0 }), null);
  assert.equal(nearestHomePoint([station], { ...station, lat: station.lat + 1 }), null);
  assert.equal(nearestHomePoint([station], station)?.point.id, station.id);
  assert.equal(homeRouteSegments(pack).length, 2);
  const preview = projectHomePreview(homeRouteSegments(pack), pack.stops[0]);
  assert.equal(preview?.paths.length, 2);
  assert.equal(
    preview?.paths.some((path) => /NaN|Infinity/.test(path)),
    false,
  );
  assert.equal(projectHomePreview([]), null);
});
