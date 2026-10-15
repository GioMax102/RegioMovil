/** JSDOM and real HTTP/static data; no browser layout or native GPS audit. */
import test, { after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createApp } from '../server/app.mjs';
import { planMobility } from '../server/mobility.mjs';
import type { MobilityNetwork, MobilityRequest } from '../src/mobility/types';

const realFetch = globalThis.fetch;
const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const globals = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'HTMLElement',
  'HTMLDialogElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'getComputedStyle',
] as const;
const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [...globals, 'caches', 'Worker', 'IS_REACT_ACT_ENVIRONMENT'])
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
for (const name of globals)
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
  configurable: true,
});
dom.window.scrollTo = () => {};
dom.window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};

// Styles are bundled lazily in production. Node skips CSS for these structural tests.
let mobilityModuleLoads = 0;
const sourceHooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/mobility/MobilityPlanner.tsx')) mobilityModuleLoads++;
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});

let offline = false;
Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, get: () => !offline });
let locationCalls = 0;
const gpsPoint = { latitude: 25.614502, longitude: -100.275917, accuracy: 24 };
Object.defineProperty(dom.window.navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition(
      success: PositionCallback,
      _error: PositionErrorCallback,
      options: PositionOptions,
    ) {
      locationCalls++;
      assert.equal(options.enableHighAccuracy, true);
      queueMicrotask(() =>
        success({ coords: gpsPoint, timestamp: Date.now() } as GeolocationPosition),
      );
    },
  },
});

const cachedResponses = new Map<string, Response>();
const cacheKey = (input: string | { url: string }) =>
  new URL(typeof input === 'string' ? input : input.url, location.origin).href;
Object.defineProperty(globalThis, 'caches', {
  configurable: true,
  value: {
    async open() {
      return {
        async keys() {
          return [...cachedResponses.keys()].map((url) => ({ url }));
        },
        async put(input: string, response: Response) {
          cachedResponses.set(cacheKey(input), response.clone());
        },
        async match(input: string) {
          return cachedResponses.get(cacheKey(input))?.clone();
        },
        async delete(input: { url: string }) {
          return cachedResponses.delete(cacheKey(input));
        },
      };
    },
  },
});

// Exercise the worker protocol with the actual deterministic graph, retaining selected
// responses when a test needs to observe the pending state. No timing/performance claims.
const plannedRequests: MobilityRequest[] = [];
const holdPriorities = new Set<string>();
const heldPlans: (() => void)[] = [];
const liveWorkers = new Set<PlannerWorker>();
class PlannerWorker {
  network: MobilityNetwork | null = null;
  terminated = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    liveWorkers.add(this);
  }
  postMessage(message: {
    type: string;
    network?: MobilityNetwork;
    id?: number;
    request?: MobilityRequest;
  }) {
    if (message.type === 'initialize') {
      this.network = message.network!;
      return;
    }
    const request = structuredClone(message.request!);
    plannedRequests.push(request);
    const complete = () =>
      queueMicrotask(() => {
        if (this.terminated) return;
        try {
          this.onmessage?.({ data: { id: message.id, plan: planMobility(this.network, request) } });
        } catch (cause) {
          this.onmessage?.({
            data: { id: message.id, error: cause instanceof Error ? cause.message : String(cause) },
          });
        }
      });
    if (holdPriorities.has(request.preference)) heldPlans.push(complete);
    else complete();
  }
  terminate() {
    this.terminated = true;
    liveWorkers.delete(this);
  }
}
Object.defineProperty(globalThis, 'Worker', {
  configurable: true,
  writable: true,
  value: PlannerWorker,
});

const { render, cleanup, screen, within, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: App } = await import('../src/App');
let application: ReturnType<typeof createApp>;
let server: Server;
let base = '';
let user: ReturnType<typeof userEvent.setup>;
const requests: string[] = [];
const placeQueries: string[] = [];
const universityPlace = {
  id: 'fixture:uanl',
  kind: 'place',
  name: 'Ciudad Universitaria UANL',
  displayName: 'Ciudad Universitaria, San Nicolás de los Garza, Nuevo León',
  lat: 25.7249,
  lng: -100.3101,
};

before(async () => {
  const network = JSON.parse(
    await readFile(new URL('../data/network.json', import.meta.url), 'utf8'),
  );
  const catalog = JSON.parse(
    await readFile(new URL('../public/transit-catalog.json', import.meta.url), 'utf8'),
  );
  const mobilityDocument = await readFile(
    new URL('../public/mobility-network.json', import.meta.url),
    'utf8',
  );
  const mobilityNetwork = JSON.parse(mobilityDocument);
  application = createApp({
    network,
    catalog,
    mobilityNetwork,
    now: () => new Date('2026-10-15T18:00:00.000Z'),
  });
  // Serve the current source snapshot directly so these tests cannot read stale dist.
  server = createServer((request, response) => {
    if (request.url === '/mobility-network.json') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(mobilityDocument);
    } else void application.handler(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      base,
    );
    requests.push(url.pathname + url.search);
    if (offline) throw new TypeError('Offline in this test');
    if (url.pathname === '/api/places') {
      placeQueries.push(url.searchParams.get('q')!);
      return new Response(JSON.stringify({ places: [universityPlace] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(url, init);
  };
});
beforeEach(() => {
  requests.length = 0;
  placeQueries.length = 0;
  plannedRequests.length = 0;
  holdPriorities.clear();
  heldPlans.length = 0;
  cachedResponses.clear();
  offline = false;
  locationCalls = 0;
  dom.window.localStorage.clear();
  dom.window.history.replaceState({}, '', '/');
  dom.window.document.documentElement.className = '';
  user = userEvent.setup({ document: dom.window.document, delay: null });
});
afterEach(async () => {
  await act(async () => cleanup());
  heldPlans.splice(0).forEach((release) => release());
  assert.equal(liveWorkers.size, 0, 'Leaving the experiment terminates its worker.');
});
after(async () => {
  cleanup();
  globalThis.fetch = realFetch;
  sourceHooks.deregister();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  application?.close();
  dom.window.close();
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

async function openModel() {
  const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  await user.click(navigation.getByRole('button', { name: 'Planear viaje', exact: true }));
  await user.click(screen.getByRole('button', { name: /Metro \+ autobús/ }));
  await screen.findByRole('button', { name: 'Origen multimodal: Padre Mier' });
  return screen.getByRole('region', { name: 'Conecta más de tu ciudad.' });
}
async function mountModel() {
  render(<App />);
  return openModel();
}
async function chooseOfficial(field: 'Origen' | 'Destino', query: string, label: RegExp) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${field} multimodal:`) }));
  const dialog = screen.getByRole('dialog', {
    name: `Elige tu ${field === 'Origen' ? 'origen' : 'destino'} multimodal`,
  });
  await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar punto oficial' }), query);
  await user.click(within(dialog).getByRole('button', { name: label }));
}
async function planMederos() {
  await chooseOfficial('Origen', 'Mederos Centro', /UANL Mederos - Centro de las Artes/);
  await chooseOfficial('Destino', 'Universidad', /^Universidad L2/);
  await user.click(screen.getByRole('button', { name: 'Encontrar ruta multimodal' }));
  await screen.findByRole('heading', { name: 'Tus conexiones posibles' });
}
async function openFirstConnection() {
  await user.click(screen.getAllByRole('button', { name: /^Ver conexión 1:/ })[0]);
  return screen.getByRole('dialog', { name: 'Tu conexión, paso a paso' });
}
async function goOffline() {
  await act(async () => {
    offline = true;
    window.dispatchEvent(new dom.window.Event('offline'));
  });
}

test('App defers the experimental network, then connects RegioRuta A33 Mederos with Metro Universidad and saves from its map', async () => {
  render(<App />);
  await screen.findByText('API conectada');
  assert.equal(
    mobilityModuleLoads,
    0,
    'The experimental component is not imported by the initial dashboard.',
  );
  assert.ok(!requests.includes('/mobility-network.json'));
  assert.equal(locationCalls, 0);
  const model = await openModel();
  assert.equal(mobilityModuleLoads, 1);
  assert.equal(requests.filter((path) => path === '/mobility-network.json').length, 1);
  assert.equal(screen.queryByRole('button', { name: 'Encontrar mi ruta' }), null);
  await planMederos();
  assert.equal(plannedRequests[0].from.id, 'regioruta-a:regioruta-a-a33');
  assert.equal(plannedRequests[0].to.id, 'metro:universidad');
  const detail = await openFirstConnection();
  const map = within(detail).getByRole('img', { name: /^Mapa experimental/ });
  assert.ok(
    map.querySelectorAll('polyline').length >= 6,
    'The map includes the bus, pedestrian transfer and Metro geometries.',
  );
  assert.ok(detail.querySelector('.mobility-step-icon.bus'));
  assert.ok(detail.querySelector('.mobility-step-icon.metro'));
  assert.ok(within(detail).getByText(/orden inferido del mapa/));
  await user.click(
    within(detail).getByRole('button', { name: 'Guardar estaciones de este trayecto' }),
  );
  assert.equal(screen.queryByRole('dialog'), null);
  const saved = JSON.parse(localStorage.getItem('regiomovil:mobility-journeys')!);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].from, 'regioruta-a:regioruta-a-a33');
  assert.equal(saved[0].to, 'metro:universidad');
  assert.deepEqual(Object.keys(saved[0]).sort(), ['from', 'label', 'to']);
  assert.ok(
    within(model).getByRole('status').textContent?.includes('Tu ubicación GPS no se guarda'),
  );
  assert.ok(
    !requests.some((path) => path.startsWith('/api/mobility/plan')),
    'The graph runs in the device rather than transmitting precise endpoints.',
  );
});

test('changing multimodal priority recalculates without another submit and keeps its previous result during calculation', async () => {
  const model = await mountModel();
  await planMederos();
  const cards = within(model).getAllByRole('button', { name: /^Ver conexión/ }).length;
  holdPriorities.add('comfortable');
  await user.click(within(model).getByRole('button', { name: 'Menos afluencia', exact: true }));
  await waitFor(() => assert.equal(heldPlans.length, 1));
  assert.equal(plannedRequests.length, 2);
  assert.equal(plannedRequests[1].preference, 'comfortable');
  assert.equal(within(model).getAllByRole('button', { name: /^Ver conexión/ }).length, cards);
  assert.equal(
    within(model).getByLabelText('Resultados multimodales').getAttribute('aria-busy'),
    'true',
  );
  assert.ok(within(model).getByRole('status').textContent?.includes('Actualizando las opciones'));
  await act(async () => {
    heldPlans.splice(0).forEach((release) => release());
  });
  await waitFor(() =>
    assert.equal(
      within(model).getByLabelText('Resultados multimodales').getAttribute('aria-busy'),
      'false',
    ),
  );
  assert.equal(
    plannedRequests.length,
    2,
    'Only the initial search and the automatic priority calculation are sent to the local graph.',
  );
});

test('foreground GPS creates a local route but saved journeys contain only official stop IDs', async () => {
  const model = await mountModel();
  assert.equal(
    locationCalls,
    0,
    'Opening the experiment must not request permission or track location.',
  );
  await user.click(within(model).getByRole('button', { name: 'Usar mi ubicación' }));
  await within(model).findByRole('button', { name: 'Origen multimodal: Mi ubicación' });
  assert.equal(locationCalls, 1);
  await user.click(within(model).getByRole('button', { name: 'Encontrar ruta multimodal' }));
  await within(model).findByRole('heading', { name: 'Tus conexiones posibles' });
  assert.equal('kind' in plannedRequests[0].from && plannedRequests[0].from.kind, 'location');
  const detail = await openFirstConnection();
  await user.click(
    within(detail).getByRole('button', { name: 'Guardar estaciones de este trayecto' }),
  );
  assert.equal(screen.queryByRole('dialog'), null);
  const stored = localStorage.getItem('regiomovil:mobility-journeys')!;
  const saved = JSON.parse(stored);
  assert.ok(saved[0].from.startsWith('regioruta-'));
  assert.equal(saved[0].to, 'metro:universidad');
  assert.ok(
    !/latitude|longitude|accuracy|"lat"|"lng"|Mi ubicación|25\.614502|-100\.275917/.test(stored),
  );
  assert.ok(
    !requests.some(
      (path) =>
        path.includes(String(gpsPoint.latitude)) || path.includes(String(gpsPoint.longitude)),
    ),
  );
  assert.equal(placeQueries.length, 0, 'GPS is not sent to the place-search service.');
});

test('a cached model works offline with official bus and Metro stops while GPS and online place search are unavailable', async () => {
  await mountModel();
  await waitFor(() => assert.ok(cachedResponses.has(cacheKey('/mobility-network.json'))));
  cleanup();
  await goOffline();
  requests.length = 0;
  const model = await mountModel();
  assert.ok(within(model).getByText('Sin conexión · sólo puntos oficiales'));
  assert.equal(
    (within(model).getByRole('button', { name: 'Usar mi ubicación' }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await user.click(within(model).getByRole('button', { name: /^Origen multimodal:/ }));
  const picker = screen.getByRole('dialog');
  const placesButton = within(picker).queryByRole('button', { name: 'Lugares con internet' });
  assert.ok(
    !placesButton || (placesButton as HTMLButtonElement).disabled,
    'Online places must be absent or disabled offline.',
  );
  assert.equal(within(picker).queryByRole('searchbox', { name: 'Buscar lugar real' }), null);
  await user.click(within(picker).getByRole('button', { name: 'Cerrar ventana' }));
  await planMederos();
  assert.equal(plannedRequests[0].offline, true);
  assert.ok('id' in plannedRequests[0].from && 'id' in plannedRequests[0].to);
  assert.equal(locationCalls, 0);
  assert.equal(placeQueries.length, 0);
});

test('searching a real place online uses the API, and losing connection clears that endpoint and its route', async () => {
  const model = await mountModel();
  await user.click(within(model).getByRole('button', { name: /^Destino multimodal:/ }));
  const picker = screen.getByRole('dialog');
  await user.click(within(picker).getByRole('button', { name: 'Lugares con internet' }));
  await user.type(
    within(picker).getByRole('searchbox', { name: 'Buscar lugar real' }),
    'Ciudad Universitaria UANL',
  );
  assert.equal(placeQueries.length, 0, 'The query is sent only after the explicit search.');
  await user.click(within(picker).getByRole('button', { name: 'Buscar lugar', exact: true }));
  await user.click(
    await within(picker).findByRole('button', {
      name: /Ciudad Universitaria UANL Ciudad Universitaria/,
    }),
  );
  assert.deepEqual(placeQueries, ['Ciudad Universitaria UANL']);
  assert.ok(
    within(model).getByRole('button', { name: 'Destino multimodal: Ciudad Universitaria UANL' }),
  );
  await user.click(within(model).getByRole('button', { name: 'Encontrar ruta multimodal' }));
  await within(model).findByRole('heading', { name: 'Tus conexiones posibles' });
  await goOffline();
  await within(model).findByRole('button', { name: 'Destino multimodal: Elige un punto' });
  assert.equal(within(model).queryByLabelText('Resultados multimodales'), null);
  assert.equal(
    (within(model).getByRole('button', { name: 'Encontrar ruta multimodal' }) as HTMLButtonElement)
      .disabled,
    true,
  );
  assert.ok(
    within(model).getByRole('status').textContent?.includes('elige estaciones o paradas oficiales'),
  );
  assert.ok(
    within(model).getByRole('button', { name: 'Origen multimodal: Padre Mier' }),
    'The official endpoint is retained.',
  );
  assert.equal(localStorage.getItem('regiomovil:mobility-journeys'), null);
});
