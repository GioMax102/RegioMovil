import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { Board, Station } from '../src/types';
import type { SavedMobilityTrip } from '../src/mobility/types';
import { savedMobilityEvent, savedMobilityKey } from '../src/mobility/savedTrips';

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
const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: HomeDashboard } = await import('../src/components/HomeDashboard');
const { render, screen, cleanup, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
afterEach(cleanup);
beforeEach(() => dom.window.localStorage.clear());
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
const station: Station = {
  id: 'talleres',
  name: 'Talleres',
  municipality: 'Monterrey',
  lat: 25.75,
  lng: -100.37,
  lineIds: ['L1'],
  accessibility: 'unknown',
};
const board: Board = {
  stationId: station.id,
  generatedAt: '2026-10-18T15:00:00Z',
  mode: 'simulation',
  scenario: 'normal',
  arrivals: [],
  forecast: [45, 30, 60, 25, 32, 26, 2].map((occupancy, index) => ({
    hour: `${index + 9}:00`,
    occupancy,
  })),
  advice: { title: 'Compara antes de salir', body: 'El tiempo y el espacio son estimaciones.' },
  alerts: [],
};
function mount(
  data: Board | null = board,
  onSavedTrip = (_trip: SavedMobilityTrip) => {},
  now = new Date(board.generatedAt),
) {
  const noop = () => {};
  return render(
    <HomeDashboard
      station={station}
      board={data}
      loading={!data}
      favorite={false}
      onFavorite={noop}
      onArrival={noop}
      onSavedTrip={onSavedTrip}
      onStationDetails={noop}
      onReport={noop}
      now={now}
    />,
  );
}
function savedTrip(label: string): SavedMobilityTrip {
  return {
    version: 1,
    id: `trip-${label}`,
    label,
    savedAt: '2026-10-18T15:00:00Z',
    generatedAt: board.generatedAt,
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

test('secondary outlook and provenance start collapsed, with simulation still available on demand', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  const { container } = mount();
  const outlook = container.querySelector('.home-outlook') as HTMLDetailsElement;
  const info = container.querySelector('.home-data-info') as HTMLDetailsElement;
  assert.equal(outlook.open, false);
  assert.equal(info.open, false);
  await user.click(screen.getByText('Afluencia por hora'));
  assert.equal(outlook.open, true);
  assert.match(container.querySelector('.home-quiet-hour')!.textContent!, /12:00/);
  await user.click(screen.getByText('Datos y fuentes'));
  assert.equal(info.open, true);
  assert.match(info.textContent!, /son una simulación/);
  assert.ok(info.querySelectorAll('a[href^="https:"]').length > 0);
});

test('home never invents saved destinations or retains the old verbose shortcut cards', () => {
  const { container } = mount(null);
  assert.equal(container.querySelector('.home-shortcuts'), null);
  assert.equal(screen.queryByText('Tus rutas guardadas'), null);
  assert.equal(screen.queryByText('Explorar la red'), null);
  assert.match(screen.getByRole('status').textContent!, /Preparando/);
});

test('one-tap saved trip shortcuts use the actual label, open their snapshot and refresh after deletion', async () => {
  const trip = savedTrip('Casa');
  localStorage.setItem(savedMobilityKey, JSON.stringify([trip]));
  let selected: SavedMobilityTrip | undefined;
  const user = userEvent.setup({ document: dom.window.document });
  const { container } = mount(board, (value) => {
    selected = value;
  });
  const shortcut = screen.getByRole('button', { name: 'Abrir trayecto Casa' });
  assert.equal(shortcut.textContent, 'Casa');
  assert.equal(shortcut.querySelector('small'), null);
  await user.click(shortcut);
  assert.equal(selected?.id, trip.id);
  localStorage.removeItem(savedMobilityKey);
  act(() => window.dispatchEvent(new Event(savedMobilityEvent)));
  assert.equal(container.querySelector('.home-shortcuts'), null);
});

test('home hides imminent Metro units while closed and keeps future operating hours available', async () => {
  const closedBoard: Board = {
    ...board,
    generatedAt: '2026-10-24T09:00:00Z',
    arrivals: [
      {
        id: 'unit-1',
        lineId: 'L1',
        lineName: 'Línea 1',
        direction: 'Exposición',
        etaMinutes: 5,
        etaRange: [3, 7],
        occupancy: 30,
        occupancyLabel: 'Baja',
        climate: 'working',
        accessible: 'unknown',
        condition: 'unknown',
        confidence: 0.5,
        source: 'simulation',
      },
    ],
    forecast: ['03:00', '04:00', '05:00', '06:00'].map((hour) => ({ hour, occupancy: 30 })),
  };
  const user = userEvent.setup({ document: dom.window.document });
  const { container } = mount(closedBoard, undefined, new Date(closedBoard.generatedAt));
  assert.equal(container.querySelectorAll('.arrival-card').length, 0);
  assert.match(screen.getByRole('status').textContent!, /Fuera de horario.*05:00/);
  assert.equal(screen.queryByRole('heading', { name: 'Próximas llegadas' }), null);
  await user.click(screen.getByText('Afluencia por hora'));
  assert.deepEqual(
    [...container.querySelectorAll('.bar-hour')].map((node) => node.textContent),
    ['05:00', '06:00'],
  );
  const info = container.querySelector('.home-data-info') as HTMLDetailsElement;
  assert.equal(info.open, false);
  assert.ok(info.querySelector('a[href="https://www.metrorrey.mx/"]'));
});
