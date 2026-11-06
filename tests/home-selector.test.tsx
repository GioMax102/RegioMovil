/** Context selection behavior in JSDOM; physical swipes and layout require a phone. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { TransitCatalogData, TransitRoute } from '../src/types';
import type { HomeCandidate, HomeSelection } from '../src/components/homeTypes';

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
  'MouseEvent',
  'HTMLDialogElement',
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
Object.defineProperty(dom.window, 'PointerEvent', {
  configurable: true,
  value: dom.window.MouseEvent,
});
dom.window.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const styles = registerHooks({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { default: Selector } = await import('../src/components/HomeTransportSelector');
const { default: Picker } = await import('../src/components/HomeTransportPicker');
const { network } = await import('../src/api');
const { render, screen, within, cleanup, fireEvent, waitFor } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const makeRoute = (id: string, extra: Partial<TransitRoute> = {}): TransitRoute => ({
  id,
  code: id.toUpperCase(),
  name: `Recorrido ${id}`,
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
  geometryPack: 'selector-test',
  notes: [],
  ...extra,
});
const bus = makeRoute('cumbres');
const pending = makeRoute('sin-trazo', { networkId: 'regioruta', geometryPack: null });
const catalog: TransitCatalogData = {
  version: 1,
  verifiedAt: '2026-11-05',
  networks: [],
  sources: [],
  routes: [
    bus,
    pending,
    makeRoute('obras', { status: 'construction' }),
    makeRoute('no-bus', { mode: 'metro' }),
  ],
};
const metro: HomeSelection = { kind: 'metro', stationId: network.stations[0].id, source: 'base' };
let requests: string[], failCatalog: boolean, aborts: number;
beforeEach(() => {
  requests = [];
  failCatalog = false;
  aborts = 0;
  localStorage.clear();
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    requests.push(path);
    init?.signal?.addEventListener('abort', () => aborts++);
    if (failCatalog) throw new Error('offline');
    return new Response(JSON.stringify(catalog), {
      headers: { 'Content-Type': 'application/json' },
    });
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

function candidates(): HomeCandidate[] {
  return [
    { selection: metro },
    { selection: { kind: 'bus', route: bus, source: 'nearby' }, distanceMeters: 420 },
    {
      selection: { kind: 'bus', route: pending, source: 'nearby' },
      distanceMeters: 880,
      approximate: true,
    },
  ];
}
function mountSelector() {
  let opened = 0;
  const selected: HomeSelection[] = [];
  function Harness() {
    const [current, setCurrent] = React.useState(metro);
    return (
      <Selector
        selection={current}
        candidates={candidates()}
        onSelect={(next) => {
          selected.push(next);
          setCurrent(next);
        }}
        onOpenPicker={() => opened++}
      />
    );
  }
  const view = render(<Harness />);
  return { ...view, selected, opened: () => opened };
}

test('selector is finite, exposes one current context and opens manual selection without planning or fetching', async () => {
  const view = mountSelector();
  const user = userEvent.setup({ document: dom.window.document });
  assert.equal(
    (screen.getByRole('button', { name: 'Anterior transporte' }) as HTMLButtonElement).disabled,
    true,
  );
  assert.match(screen.getByRole('status').textContent!, /1 de 3/);
  await user.click(screen.getByRole('button', { name: 'Siguiente transporte' }));
  assert.equal(view.selected[0].kind, 'bus');
  assert.equal(view.selected[0].source, 'manual');
  await user.click(screen.getByRole('button', { name: 'Siguiente transporte' }));
  assert.equal(
    (screen.getByRole('button', { name: 'Siguiente transporte' }) as HTMLButtonElement).disabled,
    true,
  );
  assert.match(screen.getByRole('status').textContent!, /3 de 3/);
  await user.click(screen.getByRole('button', { name: /Cambiar transporte:/ }));
  assert.equal(view.opened(), 1);
  assert.equal(view.selected.length, 2);
  assert.deepEqual(requests, []);
});

test('selector ignores modified keys and vertical gestures, and a horizontal swipe does not also open the picker', () => {
  const view = mountSelector();
  const area = screen.getByRole('region', { name: 'Tu transporte' });
  fireEvent.keyDown(area, { key: 'ArrowRight', ctrlKey: true });
  assert.equal(view.selected.length, 0);
  fireEvent.pointerDown(area, { clientX: 90, clientY: 20 });
  fireEvent.pointerUp(area, { clientX: 96, clientY: 140 });
  assert.equal(view.selected.length, 0);
  fireEvent.pointerDown(area, { clientX: 150, clientY: 30 });
  fireEvent.pointerUp(area, { clientX: 40, clientY: 35 });
  assert.equal(view.selected.length, 1);
  fireEvent.click(screen.getByRole('button', { name: /Cambiar transporte:/ }));
  assert.equal(view.opened(), 0);
  fireEvent.keyDown(area, { key: 'ArrowLeft' });
  assert.equal(view.selected.length, 2);
  assert.equal(view.selected[1].kind, 'metro');
});

test('picker keeps its draft independent until confirmation and loads only the catalog on open', async () => {
  const selected: HomeSelection[] = [];
  let closed = 0;
  const user = userEvent.setup({ document: dom.window.document });
  const view = render(
    <Picker
      selection={metro}
      onConfirm={(value) => selected.push(value)}
      onClose={() => closed++}
      onNearby={() => {}}
    />,
  );
  await screen.findByRole('option', { name: 'Transmetro' });
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Sistema de transporte' }),
    'transmetro',
  );
  await user.click(screen.getByRole('radio', { name: /CUMBRES/ }));
  assert.deepEqual(selected, []);
  assert.match(screen.getByText(/Seleccionado:/).textContent!, /CUMBRES/);
  await user.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
  assert.equal(closed, 1);
  assert.deepEqual(selected, []);
  view.unmount();
  render(
    <Picker
      selection={metro}
      onConfirm={(value) => selected.push(value)}
      onClose={() => {}}
      onNearby={() => {}}
    />,
  );
  await screen.findByRole('option', { name: 'RegioRuta' });
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Sistema de transporte' }),
    'regioruta',
  );
  const choice = screen.getByRole('radio', { name: /SIN-TRAZO/ });
  assert.match(choice.textContent!, /Trazo pendiente/);
  await user.click(choice);
  await user.click(screen.getByRole('button', { name: 'Confirmar selección' }));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].kind, 'bus');
  assert.equal(selected[0].source, 'manual');
  assert.ok(requests.every((path) => path.startsWith('/transit-catalog.json')));
});

test('closing the picker cancels an unfinished catalog request', async () => {
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborts++;
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  const view = render(
    <Picker selection={metro} onConfirm={() => {}} onClose={() => {}} onNearby={() => {}} />,
  );
  await screen.findByText(/Abriendo el catálogo de autobuses/);
  view.unmount();
  await waitFor(() => assert.equal(aborts, 1));
});

test('picker search finds station aliases, retries a failed bus catalog and never offers construction services', async () => {
  failCatalog = true;
  const user = userEvent.setup({ document: dom.window.document });
  render(<Picker selection={metro} onConfirm={() => {}} onClose={() => {}} onNearby={() => {}} />);
  await screen.findByRole('alert');
  await user.type(screen.getByRole('searchbox', { name: 'Buscar estación o ruta' }), 'Fundidora');
  assert.ok(screen.getByRole('radio', { name: /Arena Monterrey/ }));
  failCatalog = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar rutas' }));
  await screen.findByRole('option', { name: 'Transmetro' });
  await user.clear(screen.getByRole('searchbox', { name: 'Buscar estación o ruta' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Sistema de transporte' }),
    'transmetro',
  );
  assert.equal(screen.queryByRole('radio', { name: /OBRAS/ }), null);
  assert.ok(screen.getByRole('radio', { name: /CUMBRES/ }));
});

test('candidates deduplicate an interchange and retain a manual context outside eight nearby choices', () => {
  const current: HomeSelection = { kind: 'bus', route: pending, source: 'manual' };
  render(
    <Selector
      selection={current}
      candidates={[
        ...Array.from({ length: 8 }, (_, index): HomeCandidate => ({
          selection: { kind: 'metro', stationId: network.stations[index].id, source: 'nearby' },
        })),
        { selection: metro },
      ]}
      onSelect={() => {}}
      onOpenPicker={() => {}}
    />,
  );
  assert.match(screen.getByRole('status').textContent!, /1 de 9/);
  assert.equal(
    (screen.getByRole('button', { name: 'Anterior transporte' }) as HTMLButtonElement).disabled,
    true,
  );
});
