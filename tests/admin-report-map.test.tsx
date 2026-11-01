import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { AdminSession, ReportMapData } from '../src/admin/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/admin',
  pretendToBeVisual: true,
});
const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
  'FormData',
] as const;
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of names) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
}
previous.set(
  'IS_REACT_ACT_ENVIRONMENT',
  Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
);
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
  writable: true,
});
const { render, screen, cleanup, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: ReportMap } = await import('../src/admin/ReportMap');
const realFetch = globalThis.fetch;
const now = new Date('2026-10-31T18:00:00.000Z').toISOString();
const session = (role: AdminSession['user']['role'] = 'moderator'): AdminSession => ({
  user: {
    id: 'reviewer',
    name: 'Equipo',
    email: 'review@example.org',
    role,
    twoFactorEnabled: true,
  },
  csrfToken: 'memory-only',
  mfaRequired: false,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
function fixture(): ReportMapData {
  return {
    totals: {
      total: 7,
      open: 7,
      resolved: 0,
      station: 4,
      route: 2,
      unit: 1,
      stationLocated: 4,
      withoutPoint: 3,
    },
    groups: [
      {
        key: 'station',
        targetType: 'station',
        stationId: 'alfa',
        routeId: null,
        stationName: 'Estación Alfa',
        routeName: null,
        count: 4,
        open: 4,
        resolved: 0,
        latestAt: now,
        position: { lat: 25.7, lng: -100.3, source: 'station-catalog' },
        geometryPack: null,
      },
      {
        key: 'route',
        targetType: 'route',
        stationId: null,
        routeId: 'bus-a',
        stationName: null,
        routeName: 'Ruta Alfa',
        count: 2,
        open: 2,
        resolved: 0,
        latestAt: now,
        position: null,
        geometryPack: 'bus-a',
      },
      {
        key: 'unit',
        targetType: 'unit',
        stationId: null,
        routeId: 'bus-b',
        stationName: null,
        routeName: 'Ruta Beta',
        count: 1,
        open: 1,
        resolved: 0,
        latestAt: now,
        position: null,
        geometryPack: null,
        unitReference: 'REFERENCIA-PRIVADA',
      },
    ],
    groupCount: 3,
    groupLimit: 250,
    truncated: false,
    filters: {
      state: 'open',
      category: 'all',
      targetType: 'all',
      stationId: null,
      routeId: null,
      unitReference: null,
      from: '2026-10-01T18:00:00.000Z',
      to: now,
    },
    rangeBasis: 'received',
    timeZone: 'America/Monterrey',
    scope: 'all-filtered-reports',
    generatedAt: now,
    locationNotice:
      'Las estaciones se ubican por catálogo; las unidades no tienen ubicación observada.',
    dataset: { kind: 'synthetic', label: 'Pruebas ficticias', seed: 'map-qa', referenceDate: now },
  };
}
let user: ReturnType<typeof userEvent.setup>;
let requests: { path: string; options?: RequestInit }[];
let overrides: (path: string, options?: RequestInit) => Promise<Response | undefined>;
beforeEach(() => {
  user = userEvent.setup({ document: dom.window.document, delay: null });
  requests = [];
  overrides = async () => undefined;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    requests.push({ path, options });
    const special = await overrides(path, options);
    if (special) return special;
    if (path.startsWith('/api/admin/report-map?')) return Response.json(fixture());
    if (path === '/route-packs/bus-a.json')
      return Response.json({
        id: 'bus-a',
        coordinates: [
          [-100.3, 25.7],
          [-100.31, 25.71],
        ],
      });
    throw new Error(`Unexpected request: ${path}`);
  };
});
afterEach(() => cleanup());
after(() => {
  globalThis.fetch = realFetch;
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
const renderMap = (
  role: AdminSession['user']['role'] = 'moderator',
  onError = (_error: unknown) => {},
) => render(<ReportMap session={session(role)} epoch={0} onError={onError} />);
const mapRequests = () => requests.filter(({ path }) => path.startsWith('/api/admin/report-map?'));

test('approved totals, catalog points and unlocated groups stay distinct without fetching evidence or route geometry', async () => {
  const { container } = renderMap();
  await screen.findByRole('heading', { name: 'Grupos aprobados' });
  assert.equal(container.querySelectorAll('.admin-map-marker').length, 1);
  assert.equal(container.querySelectorAll('.admin-map-route').length, 0);
  assert.ok(screen.getByRole('button', { name: 'Estación Alfa: 4 reportes aprobados' }));
  assert.match(
    screen.getByLabelText('Resumen del filtro').textContent!,
    /7Reportes filtrados7Abiertos0Resueltos3Sin punto de catálogo/,
  );
  assert.ok(screen.getByText(/3 reportes sin punto de catálogo se incluyen/));
  assert.ok(screen.getByRole('note', { name: '' }).textContent?.includes('datos sintéticos'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options?.credentials, 'same-origin');
  assert.equal(requests[0].options?.cache, 'no-store');
  assert.equal(
    container.querySelectorAll('[style]').length,
    0,
    'strict admin CSP does not need inline styles',
  );
});

test('applying filters sends one bounded UTC query and clear restores the broad query', async () => {
  renderMap();
  await screen.findByRole('heading', { name: 'Grupos aprobados' });
  await user.selectOptions(screen.getByLabelText('Estado en el mapa'), 'resolved');
  await user.selectOptions(screen.getByLabelText('Categoría en el mapa'), 'accessibility');
  await user.selectOptions(screen.getByLabelText('Tipo de lugar en el mapa'), 'unit');
  await user.selectOptions(screen.getByLabelText('Periodo de recepción'), '7');
  await user.selectOptions(screen.getByLabelText('Ruta en el mapa'), 'bus-b');
  await user.type(screen.getByLabelText('Referencia declarada de unidad'), 'UNIDAD-12');
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  await waitFor(() => assert.equal(mapRequests().length, 2));
  const params = new URL(mapRequests()[1].path, 'http://localhost').searchParams;
  assert.equal(params.get('state'), 'resolved');
  assert.equal(params.get('category'), 'accessibility');
  assert.equal(params.get('targetType'), 'unit');
  assert.equal(params.get('routeId'), 'bus-b');
  assert.equal(params.get('unitReference'), 'UNIDAD-12');
  assert.equal(Date.parse(params.get('to')!) - Date.parse(params.get('from')!), 7 * 86400000);
  assert.match(params.get('from')!, /Z$/);
  await waitFor(() =>
    assert.equal(
      screen.getByRole('button', { name: 'Limpiar filtros' }).hasAttribute('disabled'),
      false,
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  await waitFor(() => assert.equal(mapRequests().length, 3));
  assert.equal(mapRequests()[2].path, '/api/admin/report-map?state=open');
});

test('route geometry is loaded only on selection; no geometry creates no fabricated pin', async () => {
  const { container } = renderMap();
  await screen.findByRole('heading', { name: 'Grupos aprobados' });
  assert.equal(
    requests.some(({ path }) => path.startsWith('/route-packs/')),
    false,
  );
  await user.click(screen.getByRole('button', { name: /Ruta o parada Ruta Alfa/ }));
  await screen.findByRole('status', { name: '' });
  await waitFor(() => assert.equal(container.querySelectorAll('.admin-map-route').length, 1));
  const preview = requests.find(({ path }) => path === '/route-packs/bus-a.json')!;
  assert.equal(preview.options?.credentials, 'omit');
  assert.equal(preview.options?.referrerPolicy, 'no-referrer');
  assert.ok(screen.getByText('Trazo de referencia; no localiza el daño ni la unidad.'));
  await user.click(screen.getByRole('button', { name: /Unidad Ruta Beta/ }));
  await waitFor(() => assert.equal(container.querySelectorAll('.admin-map-route').length, 0));
  assert.equal(container.querySelectorAll('.admin-map-marker').length, 1);
  assert.equal(
    requests.some(({ path }) => path.includes('/reports/')),
    false,
  );
});

test('analysts cannot inspect or send a free-text unit reference even if a malformed fixture contains one', async () => {
  renderMap('analyst');
  await screen.findByRole('heading', { name: 'Grupos aprobados' });
  assert.equal(screen.queryByLabelText('Referencia declarada de unidad'), null);
  assert.equal(screen.queryByText(/REFERENCIA-PRIVADA/), null);
  await user.selectOptions(screen.getByLabelText('Tipo de lugar en el mapa'), 'unit');
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  await waitFor(() => assert.equal(mapRequests().length, 2));
  assert.equal(
    new URL(mapRequests()[1].path, 'http://localhost').searchParams.has('unitReference'),
    false,
  );
});

test('changing selection aborts route loading and a late result cannot restore the old preview', async () => {
  let finish: ((response: Response) => void) | undefined;
  let routeSignal: AbortSignal | undefined;
  overrides = async (path, options) => {
    if (path !== '/route-packs/bus-a.json') return undefined;
    routeSignal = options?.signal as AbortSignal;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  };
  const { container } = renderMap();
  await screen.findByRole('heading', { name: 'Grupos aprobados' });
  await user.click(screen.getByRole('button', { name: /Ruta o parada Ruta Alfa/ }));
  await waitFor(() => assert.ok(routeSignal));
  await user.click(screen.getByRole('button', { name: /Unidad Ruta Beta/ }));
  assert.equal(routeSignal!.aborted, true);
  await act(async () => {
    finish!(
      Response.json({
        id: 'bus-a',
        coordinates: [
          [-100.3, 25.7],
          [-100.31, 25.71],
        ],
      }),
    );
  });
  assert.equal(container.querySelectorAll('.admin-map-route').length, 0);
  assert.equal(screen.queryByText('Trazo de referencia; no localiza el daño ni la unidad.'), null);
});

test('invalid geometry is rejected and authorization failures are handed to the session owner', async () => {
  overrides = async (path) =>
    path === '/route-packs/bus-a.json'
      ? Response.json({
          id: 'bus-a',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        })
      : undefined;
  const { container, unmount } = renderMap();
  await screen.findByRole('heading', { name: 'Grupos aprobados' });
  await user.click(screen.getByRole('button', { name: /Ruta o parada Ruta Alfa/ }));
  await screen.findByText('El trazo no pasó la validación de coordenadas.');
  assert.equal(container.querySelectorAll('.admin-map-route').length, 0);
  unmount();
  const errors: unknown[] = [];
  overrides = async (path) =>
    path.startsWith('/api/admin/report-map?')
      ? Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      : undefined;
  renderMap('moderator', (error) => {
    errors.push(error);
  });
  await screen.findByRole('alert');
  await waitFor(() => assert.equal(errors.length, 1));
  assert.match(screen.getByRole('alert').textContent!, /La sesión terminó/);
});

test('unmount aborts the private map request and ignores a late aggregate response', async () => {
  let signal: AbortSignal | undefined;
  let finish: ((response: Response) => void) | undefined;
  overrides = async (path, options) => {
    if (!path.startsWith('/api/admin/report-map?')) return undefined;
    signal = options?.signal as AbortSignal;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  };
  const { unmount } = renderMap();
  await waitFor(() => assert.ok(signal));
  unmount();
  assert.equal(signal!.aborted, true);
  await act(async () => {
    finish!(Response.json(fixture()));
  });
  assert.equal(screen.queryByRole('heading', { name: 'Grupos aprobados' }), null);
});
