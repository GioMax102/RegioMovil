/** Secondary Home state is deliberately deferred; these checks do not audit phone rendering. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { SavedMobilityTrip } from '../src/mobility/types';
import type { HomeUiState } from '../src/components/homeTypes';

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
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'StorageEvent',
  'localStorage',
  'getComputedStyle',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof Window],
  });
}
const fixture = { draft: null as { expiresAt: number } | null, reads: 0 };
const fixtureKey = '__regioHomeDraftFixture';
previous.set(fixtureKey, Object.getOwnPropertyDescriptor(globalThis, fixtureKey));
Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: fixture });
const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('/reportDraft.ts'))
      return {
        format: 'module',
        source: `export async function readReportDraft(){const f=globalThis.${fixtureKey};f.reads++;return f.draft;}`,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { default: HomeSavedTrips } = await import('../src/components/HomeSavedTrips');
const { useHomeReportDraft } = await import('../src/components/useHomeReportDraft');
const { useHomeUiReturn } = await import('../src/components/useHomeUiReturn');
const { savedMobilityEvent, savedMobilityKey } = await import('../src/mobility/savedTrips');
const { render, renderHook, screen, cleanup, act, waitFor } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
let scrolls: ScrollToOptions[];
beforeEach(() => {
  localStorage.clear();
  fixture.draft = null;
  fixture.reads = 0;
  scrolls = [];
  dom.window.scrollTo = ((options: ScrollToOptions) =>
    scrolls.push(options)) as typeof dom.window.scrollTo;
});
afterEach(cleanup);
after(() => {
  hooks.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
function trip(label: string): SavedMobilityTrip {
  return {
    version: 1,
    id: `trip-${label}`,
    label,
    savedAt: '2026-11-05T18:00:00Z',
    generatedAt: '2026-11-05T18:00:00Z',
    from: { id: 'metro:talleres' },
    to: { id: 'metro:exposicion' },
    preference: 'fastest',
    journeys: [
      {
        id: 'j1',
        durationMinutes: 20,
        walkingMeters: 0,
        walkingMinutes: 0,
        transfers: 0,
        occupancy: 30,
        etaRange: [18, 25],
        steps: [
          {
            mode: 'metro',
            lineId: 'L1',
            lineName: 'Línea 1',
            from: 'Talleres',
            to: 'Exposición',
            fromId: 'metro:talleres',
            toId: 'metro:exposicion',
            minutes: 20,
            stationCount: 10,
            distanceMeters: 1000,
            geometry: [
              [-100.37, 25.75],
              [-100.3, 25.68],
            ],
          },
        ],
      },
    ],
    network: { stops: [], routes: [] },
  } as SavedMobilityTrip;
}

test('deferred saved shortcuts preserve actual trips and refresh on same-device and cross-tab changes', async () => {
  const selected: SavedMobilityTrip[] = [];
  const casa = trip('Casa');
  localStorage.setItem(savedMobilityKey, JSON.stringify([casa]));
  render(<HomeSavedTrips onOpen={(value) => selected.push(value)} />);
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('button', { name: 'Abrir trayecto Casa' }));
  assert.deepEqual(selected, [casa]);
  const escuela = trip('Escuela');
  await act(async () => {
    localStorage.setItem(savedMobilityKey, JSON.stringify([escuela]));
    window.dispatchEvent(new Event(savedMobilityEvent));
  });
  assert.equal(screen.queryByRole('button', { name: 'Abrir trayecto Casa' }), null);
  assert.ok(screen.getByRole('button', { name: 'Abrir trayecto Escuela' }));
  await act(async () => {
    localStorage.removeItem(savedMobilityKey);
    window.dispatchEvent(new StorageEvent('storage', { key: savedMobilityKey }));
  });
  assert.equal(screen.queryByRole('navigation', { name: 'Trayectos guardados' }), null);
});

test('draft status refreshes on report changes and focus, and expires without reopening the form', async () => {
  fixture.draft = { expiresAt: Date.now() + 1000 };
  const view = renderHook(({ open }) => useHomeReportDraft(open), {
    initialProps: { open: false },
  });
  await waitFor(() => assert.equal(view.result.current, true));
  assert.equal(fixture.reads, 1);
  await act(async () => window.dispatchEvent(new Event('focus')));
  await waitFor(() => assert.equal(fixture.reads, 2));
  fixture.draft = { expiresAt: Date.now() + 50 };
  view.rerender({ open: true });
  await waitFor(() => assert.equal(fixture.reads, 3));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  assert.equal(view.result.current, false);
  fixture.draft = null;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => assert.equal(fixture.reads, 4));
  assert.equal(view.result.current, false);
});

test('explicit draft-status overrides avoid personal storage reads and listeners', async () => {
  fixture.draft = { expiresAt: Date.now() + 1000 };
  const view = renderHook(() => useHomeReportDraft(false, false));
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(fixture.reads, 0);
  assert.equal(view.result.current, false);
});

test('Home return restores focus and scroll after a deferred action appears and consumes the return marker once', async () => {
  const uiState: HomeUiState = { metroMapOpen: false, returnTo: 'map', scrollTop: 624 };
  function ReturnArea({ ready }: { ready: boolean }) {
    const ref = useHomeUiReturn(uiState);
    return (
      <div ref={ref}>{ready && <button data-home-action="map">Ampliar recorrido</button>}</div>
    );
  }
  const view = render(<ReturnArea ready={false} />);
  assert.equal(uiState.returnTo, 'map');
  assert.deepEqual(scrolls, []);
  view.rerender(<ReturnArea ready />);
  await waitFor(() =>
    assert.ok(document.activeElement === screen.getByRole('button', { name: 'Ampliar recorrido' })),
  );
  assert.deepEqual(scrolls, [{ top: 624, left: 0, behavior: 'auto' }]);
  assert.equal(uiState.returnTo, undefined);
  view.rerender(<ReturnArea ready />);
  assert.equal(scrolls.length, 1);
});
