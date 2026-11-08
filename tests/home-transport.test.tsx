/** Behavioral tests for context details. Map geometry and GPS are covered by their dedicated suites. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React, { type ComponentProps } from 'react';
import { JSDOM } from 'jsdom';
import type { RoutePack } from '../src/types';
import type { HomeSelection } from '../src/components/homeTypes';

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
    if (url.endsWith('/HomeSelectedRouteMap.tsx'))
      return {
        format: 'module',
        shortCircuit: true,
        source: `import React from 'react'; export default function Map({selection,onExpand}) {return React.createElement('div',{'data-testid':'selected-map','data-target':selection.kind==='bus'?selection.route.id:selection.stationId,'data-stop':selection.stopId},React.createElement('button',{onClick:onExpand},'Ampliar recorrido'));}`,
      };
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { default: HomeTransportHub } = await import('../src/components/HomeTransportHub');
const { homeCanonicalStops } = await import('../src/components/homeNearby');
const { nearestHomePoint, homeRouteSegments, projectHomePreview } =
  await import('../src/components/homeTransport');
const { network } = await import('../src/api');
const { render, screen, cleanup, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
type Props = ComponentProps<typeof HomeTransportHub>;
const metro: HomeSelection = { kind: 'metro', stationId: network.stations[0].id, source: 'base' };
const bus = (id = 'bus-a', geometryPack: string | null = 'home-test'): HomeSelection => ({
  kind: 'bus',
  route: { id, code: id.toUpperCase(), name: `Ruta ${id}`, networkId: 'transmetro', geometryPack },
  source: 'manual',
});
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
    { id: 'stop-b', name: 'Parada B', lat: 25.71, lng: -100.39 },
    { id: 'stop-c', name: 'Parada C', lat: 25.7, lng: -100.3 },
    { id: 'stop-d', name: 'Parada D', lat: 25.71, lng: -100.29 },
  ],
  stopOrderVerified: false,
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
let requests: string[],
  responsePack: RoutePack,
  failPack: boolean,
  holdPack: boolean,
  aborts: number;
let releasePack: ((response: Response) => void) | undefined;
let catalogRevision: string | undefined;
beforeEach(() => {
  requests = [];
  responsePack = pack;
  failPack = false;
  holdPack = false;
  aborts = 0;
  releasePack = undefined;
  catalogRevision = undefined;
  localStorage.clear();
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    requests.push(path);
    if (path.startsWith('/api/reports?'))
      return json({ reports: [], summary: { total: 0, open: 0, resolved: 0, byCategory: {} } });
    if (path.startsWith('/transit-catalog.json'))
      return json({
        version: 1,
        sources: [],
        routes: [
          {
            id: 'bus-a',
            mode: 'bus',
            status: 'published',
            geometryPack: 'home-test',
            geometryRevision: catalogRevision,
          },
          {
            id: 'bus-c',
            mode: 'bus',
            status: 'published',
            geometryPack: 'home-other',
            geometryRevision: catalogRevision,
          },
        ],
      });
    if (path.startsWith('/route-packs/')) {
      if (failPack) throw new Error('offline');
      if (holdPack)
        return new Promise<Response>((resolve, reject) => {
          releasePack = resolve;
          init?.signal?.addEventListener('abort', () => {
            aborts++;
            reject(new DOMException('Cancelled', 'AbortError'));
          });
        });
      return json(
        path.includes('home-other') ? { ...responsePack, id: 'home-other' } : responsePack,
      );
    }
    throw new Error(`Unexpected request: ${path}`);
  };
});
afterEach(async () => {
  await act(async () => cleanup());
});
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
function mount(overrides: Partial<Props> = {}) {
  const selections: HomeSelection[] = [],
    planned: HomeSelection[] = [],
    expanded: HomeSelection[] = [],
    reported: unknown[] = [];
  let saved = 0,
    general = 0;
  const props: Props = {
    selection: metro,
    onSelect: (value) => selections.push(value),
    onPlan: (value) => planned.push(value),
    onSaved: () => saved++,
    onNetwork: (value) => expanded.push(value),
    onReportTarget: (target) => reported.push(target),
    onReportGeneral: () => general++,
    ...overrides,
  };
  return {
    ...render(<HomeTransportHub {...props} />),
    props,
    selections,
    planned,
    expanded,
    reported,
    saved: () => saved,
    general: () => general,
  };
}

test('Metro shows its map on entry without the graph/catalog/packs and keeps compact actions separate', async () => {
  const view = mount();
  const user = userEvent.setup({ document: dom.window.document });
  await screen.findByText(/Todavía no hay reportes públicos/);
  await screen.findByTestId('selected-map');
  assert.equal(document.querySelector<HTMLDetailsElement>('.home-metro-map')?.open, true);
  assert.ok(requests.every((path) => path.startsWith('/api/reports?station=')));
  await user.click(screen.getByRole('button', { name: 'Planear desde aquí' }));
  await user.click(screen.getByRole('button', { name: 'Guardados', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Reportar aquí', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Crear reporte general' }));
  assert.deepEqual(view.planned, [metro]);
  assert.equal(view.saved(), 1);
  assert.deepEqual(view.reported, [{ stationId: metro.kind === 'metro' ? metro.stationId : '' }]);
  assert.equal(view.general(), 1);
  await user.click(screen.getByRole('button', { name: 'Ampliar recorrido' }));
  assert.deepEqual(view.expanded, [metro]);
  assert.deepEqual(view.selections, []);
});

test('bus context loads one settled pack, canonical stop selection updates context and sources remain explicit', async () => {
  const selection = bus();
  const view = mount({ selection });
  const user = userEvent.setup({ document: dom.window.document });
  assert.ok(screen.getByText('Llegadas y afluencia no disponibles'));
  const select = await screen.findByRole('combobox', { name: 'Parada del recorrido' });
  assert.deepEqual(
    [...(select as HTMLSelectElement).options].map((option) => option.value),
    ['', 'bus-a:stop-a', 'bus-a:stop-b', 'bus-a:stop-c', 'bus-a:stop-d'],
  );
  await user.selectOptions(select, 'bus-a:stop-b');
  assert.equal(view.selections.length, 1);
  assert.equal(view.selections[0].kind, 'bus');
  assert.equal(view.selections[0].kind === 'bus' && view.selections[0].stopId, 'bus-a:stop-b');
  assert.equal(requests.filter((path) => path.startsWith('/route-packs/')).length, 1);
  assert.ok(!requests.some((path) => path.includes('mobility-network')));
  assert.equal(requests.filter((path) => path.startsWith('/transit-catalog.json')).length, 1);
  await user.click(screen.getByText('Fuente y alcance'));
  assert.match(screen.getByText(/Orden de paradas por confirmar/).textContent!, /sentido/);
  assert.equal(
    screen.getByRole('link', { name: 'Fuente del trazo' }).getAttribute('href'),
    pack.sourceUrl,
  );
  await user.click(screen.getByRole('button', { name: 'Reportar aquí', exact: true }));
  assert.deepEqual(view.reported, [{ routeId: 'bus-a' }]);
});

test('manual routes without traces retain planning, reporting, sources and their own community scope', async () => {
  const selection = bus('without-trace', null);
  const view = mount({ selection });
  const user = userEvent.setup({ document: dom.window.document });
  await screen.findByText(/Todavía no hay reportes públicos para esta ruta/);
  assert.ok(screen.getByText(/Trazo pendiente/));
  assert.equal(screen.queryByRole('combobox', { name: 'Parada del recorrido' }), null);
  assert.equal(screen.queryByTestId('selected-map'), null);
  await user.click(screen.getByRole('button', { name: 'Planear desde aquí' }));
  await user.click(screen.getByRole('button', { name: 'Reportar aquí', exact: true }));
  assert.deepEqual(view.planned, [selection]);
  assert.deepEqual(view.reported, [{ routeId: 'without-trace' }]);
  assert.ok(requests.every((path) => path.startsWith('/api/reports?route=without-trace')));
});

test('rapid context changes are debounced and unfinished packs are aborted without leaking old stops', async () => {
  const first = bus();
  const view = mount({ selection: first });
  view.rerender(<HomeTransportHub {...view.props} selection={bus('bus-b', null)} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  assert.equal(
    requests.some((path) => path.startsWith('/route-packs/')),
    false,
  );
  holdPack = true;
  view.rerender(<HomeTransportHub {...view.props} selection={first} />);
  await waitFor(() => assert.equal(typeof releasePack, 'function'));
  view.rerender(<HomeTransportHub {...view.props} selection={bus('bus-b', null)} />);
  await waitFor(() => assert.equal(aborts, 1));
  await act(async () => releasePack?.(json(pack)));
  assert.equal(screen.queryByRole('combobox', { name: 'Parada del recorrido' }), null);
  assert.equal(screen.queryByTestId('selected-map'), null);
  assert.ok(requests.some((path) => path === '/api/reports?route=bus-b'));
});

test('pack failures are retryable and never disable reporting or reuse Metro predictions', async () => {
  failPack = true;
  mount({ selection: bus() });
  const user = userEvent.setup({ document: dom.window.document });
  await screen.findByRole('alert');
  assert.ok(screen.getByRole('button', { name: 'Reportar aquí', exact: true }));
  assert.ok(screen.getByText('Llegadas y afluencia no disponibles'));
  assert.equal(screen.queryByRole('button', { name: /llegada simulada/ }), null);
  failPack = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar trazo' }));
  await screen.findByRole('combobox', { name: 'Parada del recorrido' });
});

test('a retained report draft resumes without silently assigning the newly selected route', async () => {
  const view = mount({ selection: bus(), hasReportDraft: true });
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('button', { name: 'Continuar reporte' }));
  assert.equal(view.general(), 1);
  assert.deepEqual(view.reported, []);
});

test('planning uses a stop only after its canonical identity is confirmed against the current pack', async () => {
  const selection: HomeSelection = {
    ...(bus() as Extract<HomeSelection, { kind: 'bus' }>),
    stopId: 'bus-a:stop-b',
  };
  const view = mount({ selection });
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('button', { name: 'Planear desde aquí' }));
  assert.equal(view.planned[0].kind === 'bus' && view.planned[0].stopId, undefined);
  await screen.findByRole('combobox', { name: 'Parada del recorrido' });
  await user.click(screen.getByRole('button', { name: 'Planear desde aquí' }));
  assert.equal(view.planned[1].kind === 'bus' && view.planned[1].stopId, 'bus-a:stop-b');
});

test('an outdated nearby route never fetches a mismatched pack and asks before changing its revision', async () => {
  catalogRevision = '123456abcdef';
  const selection: HomeSelection = {
    ...(bus() as Extract<HomeSelection, { kind: 'bus' }>),
    stopId: 'bus-a:stop-b',
  };
  const view = mount({ selection });
  const user = userEvent.setup({ document: dom.window.document });
  await screen.findByRole('alert');
  assert.ok(screen.getByText(/Este recorrido cambió/));
  assert.equal(
    requests.some((path) => path.startsWith('/route-packs/')),
    false,
  );
  assert.deepEqual(view.selections, []);
  await user.click(screen.getByRole('button', { name: 'Usar versión actual' }));
  assert.equal(
    view.selections[0].kind === 'bus' && view.selections[0].route.geometryRevision,
    catalogRevision,
  );
  assert.equal(view.selections[0].kind === 'bus' && view.selections[0].stopId, undefined);
});

test('canonical stops reject proposals and traces with too few usable points while separate map segments stay separate', () => {
  const invalid: RoutePack = {
    ...pack,
    stops: [
      pack.stops[0],
      pack.stops[1],
      { ...pack.stops[2], publishedInfrastructureNote: 'PROPUESTA' },
      pack.stops[3],
      { id: 'far', name: 'Lejos', lat: 25.705, lng: -100.35 },
      { id: 'invalid', name: 'Inválido', lat: 91, lng: -100.4 },
    ],
  };
  assert.deepEqual(
    homeCanonicalStops({ id: 'bus-a' }, invalid).map((stop) => stop.id),
    ['bus-a:stop-a', 'bus-a:stop-b'],
  );
  assert.equal(
    homeCanonicalStops({ id: 'bus-a' }, { ...pack, experimentalRouting: false }).length,
    0,
  );
  assert.equal(homeRouteSegments(pack).length, 2);
  const preview = projectHomePreview(homeRouteSegments(pack), pack.stops[0]);
  assert.equal(preview?.paths.length, 2);
  assert.ok(preview?.paths.every((path) => !/NaN|Infinity/.test(path)));
  assert.equal(nearestHomePoint(network.stations, { lat: NaN, lng: 0 }), null);
});

test('a user can close the initially visible Metro map and returning preserves that decision', async () => {
  const uiState = { metroMapOpen: true };
  const view = mount({ uiState });
  const user = userEvent.setup({ document: dom.window.document });
  await screen.findByTestId('selected-map');
  assert.equal(uiState.metroMapOpen, true);
  await user.click(screen.getByText('Ver mapa de la línea'));
  await waitFor(() => assert.equal(uiState.metroMapOpen, false));
  assert.equal(screen.queryByTestId('selected-map'), null);
  assert.ok(document.querySelector('[data-home-action="map"]'));
  assert.ok(document.querySelector('[data-home-action="plan"]'));
  view.unmount();
  mount({ uiState });
  assert.equal(document.querySelector<HTMLDetailsElement>('.home-metro-map')?.open, false);
  assert.equal(screen.queryByTestId('selected-map'), null);
  assert.equal(
    requests.some((path) => path.includes('mobility-network')),
    false,
  );
});
