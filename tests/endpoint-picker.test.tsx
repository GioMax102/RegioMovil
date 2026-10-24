import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { registerHooks } from 'node:module';
import type { MobilityEndpoint, MobilityNetwork, SavedMobilityTrip } from '../src/mobility/types';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
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
dom.window.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
  // Native showModal runs its focus steps after React's initial autoFocus.
  this.querySelector<HTMLButtonElement>('button[aria-label="Cerrar ventana"]')?.focus();
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const { render, screen, within, cleanup, act, fireEvent, waitFor } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: EndpointPicker } = await import('../src/mobility/EndpointPicker');
const user = userEvent.setup({ document: dom.window.document });
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  localStorage.clear();
  globalThis.fetch = originalFetch;
});
after(() => {
  styles.deregister();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : delete (globalThis as Record<string, unknown>)[name];
  dom.window.close();
});
const network: MobilityNetwork = {
  version: 1,
  bounds: [-100.9, 25.35, -99.8, 26.1],
  stops: [
    {
      id: 'metro:a',
      name: 'Padre Mier',
      lat: 25.67,
      lng: -100.32,
      mode: 'metro',
      routeIds: ['L2'],
      official: true,
    },
  ],
  routes: [],
  sources: [],
} as MobilityNetwork;
const place = (name: string) => ({
  id: `osm:${name}`,
  kind: 'place',
  name,
  displayName: `${name}, Monterrey, Nuevo León`,
  lat: 25.67,
  lng: -100.31,
});
const response = (name: string) => new Response(JSON.stringify({ places: [place(name)] }));
function mount(online = true, extras = {}) {
  render(
    <EndpointPicker
      field="to"
      network={network}
      online={online}
      onSelect={() => {}}
      onClose={() => {}}
      {...extras}
    />,
  );
  return screen.getByRole('searchbox', { name: 'Buscar destino' });
}
const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

test('opening a picker in StrictMode focuses its search field after the native modal opens', () => {
  render(
    <React.StrictMode>
      <EndpointPicker
        field="from"
        network={network}
        online={false}
        onSelect={() => {}}
        onClose={() => {}}
      />
    </React.StrictMode>,
  );
  assert.equal(document.activeElement, screen.getByRole('searchbox', { name: 'Buscar origen' }));
});

test('the keyboard viewport keeps the picker within the visible area and removes its listeners on close', () => {
  const previousViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const viewport = Object.assign(new dom.window.EventTarget(), { height: 780, offsetTop: 0 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  try {
    mount();
    const dialog = screen.getByRole('dialog');
    assert.equal(dialog.style.getPropertyValue('--endpoint-viewport-height'), '780px');
    act(() => {
      viewport.height = 360;
      viewport.offsetTop = 42;
      viewport.dispatchEvent(new dom.window.Event('resize'));
    });
    assert.equal(dialog.style.getPropertyValue('--endpoint-viewport-height'), '360px');
    assert.equal(dialog.style.getPropertyValue('--endpoint-viewport-offset'), '42px');
    cleanup();
    viewport.height = 500;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    assert.equal(dialog.style.getPropertyValue('--endpoint-viewport-height'), '');
    assert.equal(dialog.style.getPropertyValue('--endpoint-viewport-offset'), '');
  } finally {
    if (previousViewport) Object.defineProperty(window, 'visualViewport', previousViewport);
    else delete (window as unknown as Record<string, unknown>).visualViewport;
  }
});

test('local station suggestions remain selectable while an automatic Internet search is pending', async () => {
  const selected: MobilityEndpoint[] = [];
  let calls = 0;
  globalThis.fetch = (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () => reject(new Error('Request aborted')), {
        once: true,
      }),
    );
  };
  const input = mount(true, { onSelect: (point: MobilityEndpoint) => selected.push(point) });
  await user.type(input, 'Padre');
  const station = screen.getByRole('button', { name: /Padre Mier/ });
  await waitFor(() => assert.equal(calls, 1));
  await user.click(station);
  assert.equal('id' in selected[0] && selected[0].id, 'metro:a');
  assert.equal(calls, 1);
});

test('a street result requests map confirmation while an approximate place remains selectable', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          { ...place('Avenida Eugenio Garza Sada'), resultType: 'street', precision: 'street' },
          { ...place('Parque Fundidora'), resultType: 'place', precision: 'approximate' },
        ],
      }),
    );
  const refined: string[] = [],
    selected: MobilityEndpoint[] = [];
  const input = mount(true, {
    onRefinePlace: (value: { name: string }) => refined.push(value.name),
    onSelect: (value: MobilityEndpoint) => selected.push(value),
  });
  await user.type(input, 'Monterrey');
  const suggestions = await screen.findByRole('region', { name: 'Lugares y direcciones' });
  await user.click(within(suggestions).getByRole('button', { name: /Avenida Eugenio Garza Sada/ }));
  assert.deepEqual(refined, ['Avenida Eugenio Garza Sada']);
  assert.equal(selected.length, 0);
  await user.click(within(suggestions).getByRole('button', { name: /Parque Fundidora/ }));
  assert.equal(selected[0].name, 'Parque Fundidora');
  assert.equal(refined.length, 1);
});

test('suggestions distinguish places, addresses, streets and crossings without hiding their address', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          { ...place('Museo del Acero'), resultType: 'place', precision: 'exact' },
          { ...place('Washington 539'), resultType: 'address', precision: 'approximate' },
          { ...place('Avenida Eugenio Garza Sada'), resultType: 'street', precision: 'street' },
          { ...place('Washington y Escobedo'), resultType: 'intersection', precision: 'exact' },
        ],
      }),
    );
  const input = mount();
  await user.type(input, 'Monterrey');
  const suggestions = await screen.findByRole('region', { name: 'Lugares y direcciones' });
  assert.ok(within(suggestions).getByText('Lugar', { exact: true }));
  assert.ok(within(suggestions).getByText('Dirección · ubicación aproximada'));
  assert.ok(within(suggestions).getByText('Calle · elige el punto exacto en el mapa'));
  assert.ok(within(suggestions).getByText('Cruce de calles', { exact: true }));
  const address = within(suggestions).getByRole('button', {
    name: /Washington 539 Monterrey/,
  });
  assert.equal(address.querySelector('strong')?.textContent, 'Washington 539');
  assert.equal(address.querySelector('small')?.textContent, 'Monterrey, Nuevo León');
});

test('editing a failed search retries automatically and leaves station suggestions available', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({ error: { message: 'El buscador no respondió.' } }), {
          status: 503,
        })
      : response('Padre Mier');
  };
  const input = mount();
  await user.type(input, 'Padre');
  assert.match((await screen.findByRole('alert')).textContent || '', /ajustar la búsqueda/);
  assert.ok(screen.getByRole('button', { name: /Padre Mier/ }));
  await user.type(input, ' Mier');
  await screen.findByRole('region', { name: 'Lugares y direcciones' });
  assert.equal(calls, 2);
  assert.equal(screen.queryByRole('alert'), null);
});

test('typing searches automatically after a pause, ignores short text and supports clear and keyboard selection', async () => {
  const queries: string[] = [],
    selected: MobilityEndpoint[] = [];
  globalThis.fetch = async (input) => {
    queries.push(new URL(String(input), location.origin).searchParams.get('q')!);
    return response('Parque Fundidora');
  };
  const input = mount(true, { onSelect: (point: MobilityEndpoint) => selected.push(point) });
  await user.type(input, 'Pa');
  await pause(700);
  assert.equal(queries.length, 0);
  await user.type(input, 'rque Fundidora');
  assert.equal(queries.length, 0);
  const result = await screen.findByRole('button', {
    name: /Parque Fundidora Monterrey/,
  });
  assert.deepEqual(queries, ['Parque Fundidora']);
  assert.equal(screen.queryByRole('button', { name: 'Buscar lugares y direcciones' }), null);
  await user.type(input, '{ArrowDown}');
  assert.equal(document.activeElement, result);
  await user.keyboard('{Enter}');
  assert.equal(selected[0].name, 'Parque Fundidora');
  await user.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));
  assert.equal((input as HTMLInputElement).value, '');
  assert.equal(document.activeElement, input);
});

test('editing or closing aborts requests and delayed old results cannot replace the current query', async () => {
  const pending: { query: string; signal: AbortSignal; resolve: (response: Response) => void }[] =
    [];
  globalThis.fetch = (input, init) =>
    new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Request aborted')), {
        once: true,
      });
      pending.push({
        query: new URL(String(input), location.origin).searchParams.get('q')!,
        signal: init?.signal as AbortSignal,
        resolve,
      });
    });
  const input = mount();
  await user.type(input, 'Fundidora');
  await waitFor(() => assert.equal(pending.length, 1));
  await user.clear(input);
  await user.type(input, 'Macroplaza');
  assert.equal(pending[0].signal.aborted, true);
  await waitFor(() => assert.equal(pending.length, 2));
  await act(async () => pending[1].resolve(response('Macroplaza')));
  await screen.findByRole('button', { name: /Macroplaza Monterrey/ });
  await act(async () => pending[0].resolve(response('Fundidora')));
  assert.equal(screen.queryByRole('button', { name: /Fundidora Monterrey/ }), null);
  await user.clear(input);
  await user.type(input, 'Otra calle');
  await waitFor(() => assert.equal(pending.length, 3));
  cleanup();
  assert.equal(pending[2].signal.aborted, true);
});

test('IME composition is not sent until completed, and Escape closes the picker', async () => {
  let calls = 0,
    closed = false;
  globalThis.fetch = async () => {
    calls++;
    return response('Calle Praga');
  };
  const input = mount(true, {
    onClose: () => {
      closed = true;
    },
  });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'Calle Praga' } });
  await pause(700);
  assert.equal(calls, 0);
  fireEvent.compositionEnd(input);
  await screen.findByRole('button', { name: /Calle Praga Monterrey/ });
  assert.equal(calls, 1);
  await user.type(input, '{Escape}');
  assert.equal(closed, true);
});

test('offline saved places open the existing trip and never become arbitrary endpoints for a new route', async () => {
  const trip = {
    version: 1,
    id: 'saved-1',
    label: 'Mi viaje al parque',
    savedAt: '2026-10-17T12:00:00Z',
    generatedAt: '2026-10-17T12:00:00Z',
    from: { id: 'metro:a', name: 'Padre Mier' },
    to: { kind: 'place', name: 'Parque Fundidora', lat: 25.67, lng: -100.31 },
    preference: 'fastest',
    journeys: [
      {
        id: 'j1',
        durationMinutes: 10,
        walkingMeters: 100,
        walkingMinutes: 2,
        transfers: 0,
        occupancy: 50,
        etaRange: [8, 12],
        steps: [
          {
            mode: 'metro',
            lineId: 'L2',
            lineName: 'Línea 2',
            from: 'Padre Mier',
            to: 'General Zaragoza',
            fromId: 'metro:a',
            toId: 'metro:b',
            minutes: 8,
            stationCount: 1,
            distanceMeters: 500,
            geometry: [
              [-100.32, 25.67],
              [-100.31, 25.67],
            ],
          },
        ],
      },
    ],
    network,
  } as SavedMobilityTrip;
  localStorage.setItem('regiomovil:mobility-offline-trips', JSON.stringify([trip]));
  let opened: SavedMobilityTrip | undefined,
    selections = 0;
  globalThis.fetch = async () => assert.fail('Offline picker must not search the Internet');
  const input = mount(false, {
    onOpenSavedTrip: (value: SavedMobilityTrip) => {
      opened = value;
    },
    onSelect: () => {
      selections++;
    },
  });
  await user.type(input, 'Fundidora');
  const saved = screen.getByRole('region', { name: 'Lugares guardados' });
  await user.click(within(saved).getByRole('button', { name: /Parque Fundidora Ver trayecto/ }));
  assert.equal(opened?.id, trip.id);
  assert.equal(selections, 0);
  await pause(700);
});
