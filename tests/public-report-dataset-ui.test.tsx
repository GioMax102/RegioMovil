import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { PublicReport, PublicReportFeed } from '../src/reportsApi';

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
const { default: PublicReports } = await import('../src/components/PublicReports');
const { act, cleanup, render, screen, within } = await import('@testing-library/react');
styles.deregister();
const originalFetch = globalThis.fetch;
const requests: { url: URL; signal?: AbortSignal | null }[] = [];
let respond: (url: URL) => Promise<Response>;
beforeEach(() => {
  requests.length = 0;
  respond = async () => Response.json(feed('inicial'));
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input), 'http://localhost/');
    assert.equal(url.pathname, '/api/reports');
    assert.equal(options?.cache, 'no-store');
    requests.push({ url, signal: options?.signal });
    return respond(url);
  };
});
afterEach(async () => {
  await act(async () => cleanup());
});
after(() => {
  globalThis.fetch = originalFetch;
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

function feed(id: string, synthetic = false): PublicReportFeed {
  const report: PublicReport = {
    id,
    title: `Observación ${id}`,
    detail: `Descripción completa de ${id}`,
    category: 'accessibility',
    targetType: 'route',
    unitReference: null,
    locationReference: 'Parada junto a la plaza',
    createdAt: '2026-11-08T17:00:00Z',
    photoMime: null,
    status: 'published',
  };
  const counts = { total: 1, open: 1, resolved: 0 };
  return {
    reports: [report],
    summary: { ...counts, byCategory: { accessibility: counts } },
    ...(synthetic
      ? {
          dataset: {
            kind: 'synthetic' as const,
            label: 'Escenario de visualización',
            referenceDate: '2026-11-08',
          },
        }
      : {}),
  };
}

test('synthetic public reports show one dataset notice and their full text on entry without human-review claims', async () => {
  respond = async () => Response.json(feed('banqueta', true));
  render(<PublicReports routeId="transmetro-san-bernabe-no-reeleccion" />);
  await screen.findByText('Observación banqueta');
  const section = screen.getByRole('region', { name: 'Reportes de visualización' });
  assert.equal(
    within(section).getAllByRole('complementary', { name: 'Procedencia de los reportes' }).length,
    1,
  );
  const detail = section.querySelector<HTMLDetailsElement>('.public-reports-detail');
  assert.equal(detail?.open, true);
  assert.ok(within(section).getByText('Descripción completa de banqueta'));
  assert.ok(within(section).getByText('Datos de visualización; no describen daños reales.'));
  assert.ok(within(section).getByText(/Parada junto a la plaza/));
  assert.equal(within(section).queryByText(/Publicado tras revisión de contenido/), null);
  assert.equal(screen.queryByRole('region', { name: 'Reportes comunitarios revisados' }), null);
  assert.equal(requests[0].url.search, '?route=transmetro-san-bernabe-no-reeleccion');
});

test('switching from synthetic to community reports clears dataset provenance while retaining an expanded list', async () => {
  respond = async (url) => Response.json(feed(url.searchParams.get('station')!, true));
  const view = render(<PublicReports stationId="felix-u-gomez" />);
  await screen.findByText('Observación felix-u-gomez');
  assert.ok(screen.getByRole('complementary', { name: 'Procedencia de los reportes' }));
  respond = async () => Response.json(feed('talleres'));
  view.rerender(<PublicReports stationId="talleres" />);
  assert.equal(screen.queryByText('Observación felix-u-gomez'), null);
  assert.equal(screen.queryByRole('complementary', { name: 'Procedencia de los reportes' }), null);
  await screen.findByText('Observación talleres');
  const section = screen.getByRole('region', { name: 'Reportes comunitarios revisados' });
  assert.equal(section.querySelector<HTMLDetailsElement>('.public-reports-detail')?.open, true);
  assert.ok(within(section).getByText('Descripción completa de talleres'));
  assert.ok(within(section).getByText(/Publicado tras revisión de contenido/));
  assert.equal(screen.queryByRole('complementary', { name: 'Procedencia de los reportes' }), null);
  assert.equal(screen.queryByText(/Datos de visualización/), null);
});

test('a late response from an abandoned route cannot replace the current report list or its provenance', async () => {
  const pending = new Map<string, (response: Response) => void>();
  respond = (url) => new Promise((resolve) => pending.set(url.searchParams.get('route')!, resolve));
  const view = render(<PublicReports routeId="ruta-a" />);
  view.rerender(<PublicReports routeId="ruta-b" />);
  assert.equal(
    requests.find((request) => request.url.search === '?route=ruta-a')?.signal?.aborted,
    true,
  );
  assert.ok(screen.getByRole('status', { name: '' }));
  await act(async () => pending.get('ruta-b')!(Response.json(feed('ruta-b'))));
  await screen.findByText('Observación ruta-b');
  await act(async () => pending.get('ruta-a')!(Response.json(feed('ruta-a', true))));
  assert.ok(screen.getByText('Descripción completa de ruta-b'));
  assert.equal(screen.queryByText('Observación ruta-a'), null);
  assert.equal(screen.queryByRole('complementary', { name: 'Procedencia de los reportes' }), null);
  assert.equal(document.querySelector<HTMLDetailsElement>('.public-reports-detail')?.open, true);
});
