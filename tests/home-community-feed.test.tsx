import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
const styles = registerHooks({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { default: HomeCommunityFeed } = await import('../src/components/HomeCommunityFeed');
const { act, cleanup, fireEvent, render, screen, within } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
styles.deregister();
const originalFetch = globalThis.fetch;
const requests: { url: URL; signal?: AbortSignal | null }[] = [];
let respond: (url: URL) => Promise<Response>;
beforeEach(() => {
  requests.length = 0;
  respond = async () => Response.json(feed());
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input), 'http://localhost/');
    requests.push({ url, signal: options?.signal });
    assert.equal(options?.cache, 'no-store');
    assert.equal(url.pathname, '/api/reports');
    return respond(url);
  };
});
afterEach(cleanup);
after(() => {
  globalThis.fetch = originalFetch;
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

function report(id = 'uno', extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Observación ${id}`,
    detail: `Detalle de ${id}`,
    category: 'infrastructure',
    targetType: 'station',
    unitReference: null,
    createdAt: '2026-11-05T12:00:00Z',
    photoMime: null,
    status: 'published',
    ...extra,
  };
}
function feed(reports: Record<string, unknown>[] = []) {
  const total = reports.length;
  const resolved = reports.filter((item) => item.status === 'resolved').length;
  const counts = { total, open: total - resolved, resolved };
  return { reports, summary: { ...counts, byCategory: { infrastructure: counts } } };
}

test('Home community needs one exact target and never falls back to an unfiltered public feed', async () => {
  const view = render(<HomeCommunityFeed />);
  assert.ok(screen.getByText(/Elige una estación o una ruta/));
  view.rerender(<HomeCommunityFeed stationId="a" routeId="ruta-1" />);
  assert.ok(screen.getByText(/Elige una estación o una ruta/));
  assert.equal(requests.length, 0);
  view.rerender(<HomeCommunityFeed routeId="ruta-1-sur" />);
  await screen.findByText(/Todavía no hay reportes públicos para esta ruta/);
  assert.equal(requests[0].url.search, '?route=ruta-1-sur');
});

test('Home community shows bounded reviewed cards and server totals without treating the sample as the total', async () => {
  const reports = Array.from({ length: 8 }, (_, index) =>
    report(String(index), { status: index === 0 ? 'resolved' : 'published' }),
  );
  respond = async () =>
    Response.json({
      reports,
      summary: {
        total: 47,
        open: 39,
        resolved: 8,
        byCategory: { infrastructure: { total: 47, open: 39, resolved: 8 } },
      },
    });
  render(<HomeCommunityFeed stationId="talleres" />);
  const counts = await screen.findByText(/reportes públicos ·/);
  assert.match(counts.textContent!, /47 reportes públicos · 39 abiertos · 8 resueltos/);
  assert.ok(screen.getByText('5 observaciones recientes de 47 públicas.'));
  assert.equal(screen.getAllByRole('article').length, 5);
  assert.equal(screen.queryByText('Observación 5'), null);
  assert.equal(screen.getByRole('list', { name: 'Observaciones recientes' }).tabIndex, 0);
  const first = screen.getAllByRole('article')[0];
  assert.ok(within(first).getByText('Infraestructura'));
  assert.ok(within(first).getByText('Resuelto'));
  assert.equal(first.querySelector('time')?.dateTime, '2026-11-05T12:00:00Z');
  assert.equal(requests[0].url.search, '?station=talleres');
  assert.ok(!document.querySelector('input[type="range"]'));
});

test('reviewed report details are visible immediately and lazy photo failure retains the observation', async () => {
  respond = async () => Response.json(feed([report('foto', { photoMime: 'image/jpeg' })]));
  const user = userEvent.setup({ document: dom.window.document });
  render(<HomeCommunityFeed stationId="a" />);
  await screen.findByText('Observación foto');
  assert.ok(screen.getByText('Detalle de foto'));
  assert.equal(screen.queryByText('Leer observación'), null);
  const photo = screen.getByRole('img', { name: 'Foto adjunta: Observación foto' });
  assert.equal(photo.getAttribute('src'), '/api/reports/foto/photo');
  assert.equal(photo.getAttribute('loading'), 'lazy');
  fireEvent.error(photo);
  await screen.findByText('La foto no está disponible.');
  assert.ok(screen.getByText('Observación foto'));
  assert.ok(screen.getByText('Detalle de foto'));
  await user.click(screen.getByText('Sobre estas observaciones'));
  assert.ok(
    screen.getByText(/Publicadas con consentimiento tras revisión.*No son alertas oficiales/),
  );
});

test('synthetic scenarios have one clear dataset notice without claiming human review', async () => {
  respond = async () =>
    Response.json({
      ...feed([report('banqueta')]),
      dataset: {
        kind: 'synthetic',
        label: 'Escenario de visualización',
        referenceDate: '2026-11-08',
      },
    });
  render(<HomeCommunityFeed stationId="felix-u-gomez" />);
  await screen.findByText('Observación banqueta');
  assert.ok(screen.getByText('Visualización', { exact: true }));
  assert.equal(screen.queryByText('Revisado', { exact: true }), null);
  assert.equal(document.querySelectorAll('.report-dataset-notice').length, 1);
  assert.ok(screen.getByText('Detalle de banqueta'));
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByText('Sobre estas observaciones'));
  assert.ok(screen.getByText(/No describe hechos reales/));
  assert.equal(screen.queryByText(/Publicadas con consentimiento/), null);
});

test('failed requests remain distinct from an empty community and can be retried in the same target', async () => {
  let fail = true;
  respond = async () => {
    if (fail) throw new TypeError('offline');
    return Response.json(feed());
  };
  const user = userEvent.setup({ document: dom.window.document });
  render(<HomeCommunityFeed routeId="sur" />);
  assert.match((await screen.findByRole('alert')).textContent!, /Esto no indica que no existan/);
  assert.equal(screen.queryByText(/Todavía no hay reportes/), null);
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar observaciones' }));
  await screen.findByText('Todavía no hay reportes públicos para esta ruta.');
  assert.deepEqual(
    requests.map((item) => item.url.search),
    ['?route=sur', '?route=sur'],
  );
});

test('changing target clears the old context immediately, aborts its request and ignores late responses', async () => {
  const pending = new Map<string, (value: Response) => void>();
  respond = (url) =>
    new Promise((resolve) => pending.set(url.searchParams.get('station')!, resolve));
  const view = render(<HomeCommunityFeed stationId="a" />);
  await act(async () => pending.get('a')!(Response.json(feed([report('a')]))));
  await screen.findByText('Observación a');
  view.rerender(<HomeCommunityFeed stationId="b" />);
  assert.equal(screen.queryByText('Observación a'), null);
  assert.ok(screen.getByRole('status'));
  view.rerender(<HomeCommunityFeed stationId="c" />);
  assert.equal(requests.find((item) => item.url.search === '?station=b')?.signal?.aborted, true);
  await act(async () => pending.get('c')!(Response.json(feed([report('c')]))));
  await screen.findByText('Observación c');
  await act(async () => pending.get('b')!(Response.json(feed([report('b')]))));
  assert.equal(screen.queryByText('Observación b'), null);
  assert.ok(screen.getByText('Observación c'));
});

test('unknown summaries and dates stay explicit; nonpublic statuses never become cards', async () => {
  respond = async () =>
    Response.json({
      reports: [
        report('publica', { createdAt: 'no-fecha', title: '<script>alert(1)</script>' }),
        report('privada', { status: 'pending' }),
      ],
    });
  const view = render(<HomeCommunityFeed stationId="a" />);
  await screen.findByText('<script>alert(1)</script>');
  assert.equal(document.querySelector('script'), null);
  assert.equal(screen.getAllByRole('article').length, 1);
  assert.equal(screen.queryByText('Observación privada'), null);
  assert.ok(screen.getByText('Fecha no disponible'));
  assert.ok(screen.getByText(/Observaciones recientes.*recuento total no está disponible/));
  respond = async () => Response.json({ reports: [] });
  view.rerender(<HomeCommunityFeed stationId="b" />);
  await screen.findByText(
    /No hay observaciones recientes disponibles.*recuento total no está disponible/,
  );
  assert.equal(screen.queryByText(/Todavía no hay reportes públicos/), null);
});
