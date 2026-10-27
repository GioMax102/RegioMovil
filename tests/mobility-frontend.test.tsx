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
let holdGps = false;
let denyGps = false;
let pendingGps: (() => void) | null = null;
const gpsPoint = { latitude: 25.614502, longitude: -100.275917, accuracy: 24 };
Object.defineProperty(dom.window.navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition(
      success: PositionCallback,
      error: PositionErrorCallback,
      options: PositionOptions,
    ) {
      locationCalls++;
      assert.equal(options.enableHighAccuracy, true);
      const reply = () =>
        denyGps
          ? error({ code: 1 } as GeolocationPositionError)
          : success({ coords: gpsPoint, timestamp: Date.now() } as GeolocationPosition);
      if (holdGps) pendingGps = reply;
      else queueMicrotask(reply);
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

const { render, cleanup, screen, within, waitFor, act, fireEvent } =
  await import('@testing-library/react');
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
const mederosPlace = {
  id: 'fixture:mederos',
  kind: 'place',
  name: 'Centro de las Artes UANL',
  displayName: 'Centro de las Artes UANL, Praga, Mederos, Monterrey, Nuevo León',
  lat: gpsPoint.latitude,
  lng: gpsPoint.longitude,
};
const puntoVallePlace = {
  id: 'osm:w682039730',
  kind: 'place',
  name: 'Punto Valle',
  displayName: 'Punto Valle, Río Missouri 555, Del Valle, San Pedro Garza García, Nuevo León',
  lat: 25.6590567,
  lng: -100.3545702,
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
    placeSuggestionsOptions: {
      // Exercise the real API/reference resolver without a live external search
      // dependency. Provider semantics are covered by the dedicated Photon tests.
      transport: async () =>
        new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    },
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
    if (url.pathname === '/api/places/suggest') {
      const query = url.searchParams.get('q')!;
      placeQueries.push(query);
      if (/las estaciones|tec de monterrey/i.test(query)) return realFetch(url, init);
      const place = /punto valle|missouri/i.test(query)
        ? puntoVallePlace
        : /praga|artes/i.test(query)
          ? mederosPlace
          : universityPlace;
      return new Response(JSON.stringify({ places: [place] }), {
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
  holdGps = false;
  denyGps = false;
  pendingGps = null;
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
  await screen.findByRole('button', { name: 'Origen: Padre Mier' });
  return screen.getByRole('region', { name: 'Planear viaje' });
}
async function mountModel() {
  render(<App />);
  return openModel();
}
async function chooseOfficial(field: 'Origen' | 'Destino', query: string, label: RegExp) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${field}:`) }));
  const dialog = screen.getByRole('region', {
    name: field === 'Origen' ? '¿Desde dónde sales?' : '¿A dónde vas?',
  });
  await user.type(
    within(dialog).getByRole('searchbox', {
      name: `Buscar ${field === 'Origen' ? 'origen' : 'destino'}`,
    }),
    query,
  );
  await user.click(within(dialog).getByRole('button', { name: label }));
}
async function choosePlace(
  field: 'Origen' | 'Destino',
  query: string,
  label: RegExp,
  enter = false,
) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${field}:`) }));
  const dialog = screen.getByRole('region', {
    name: field === 'Origen' ? '¿Desde dónde sales?' : '¿A dónde vas?',
  });
  const input = within(dialog).getByRole('searchbox', {
    name: `Buscar ${field === 'Origen' ? 'origen' : 'destino'}`,
  });
  const previousQueries = placeQueries.length;
  await user.type(input, query);
  assert.equal(
    placeQueries.length,
    previousQueries,
    'The debounce avoids sending a request for every keystroke.',
  );
  if (enter) await user.type(input, '{Enter}');
  // Suggestions use Photon automatically after the typing debounce.
  const places = await within(dialog).findByRole('region', { name: 'Lugares y direcciones' });
  await user.click(await within(places).findByRole('button', { name: label }));
}
async function planMederos() {
  await chooseOfficial('Origen', 'Mederos Centro', /UANL Mederos - Centro de las Artes/);
  await chooseOfficial('Destino', 'Universidad', /^Universidad L2/);
  await user.click(screen.getByRole('button', { name: 'Buscar rutas' }));
  await screen.findByRole('heading', { name: 'Elige tu ruta' });
}
async function openFirstConnection() {
  await user.click(screen.getAllByRole('button', { name: /^Ver conexión 1:/ })[0]);
  return screen.getByRole('region', { name: 'Tu trayecto' });
}
async function goOffline() {
  await act(async () => {
    offline = true;
    window.dispatchEvent(new dom.window.Event('offline'));
  });
}

test('App defers the multimodal network, then connects RegioRuta A33 Mederos with Metro Universidad and saves from its map', async () => {
  render(<App />);
  await screen.findByText('En línea');
  assert.equal(
    mobilityModuleLoads,
    0,
    'The experimental component is not imported by the initial dashboard.',
  );
  assert.ok(!requests.includes('/mobility-network.json'));
  assert.equal(locationCalls, 0);
  const model = await openModel();
  const form = model.querySelector('.mobility-form')!;
  const planningMap = model.querySelector('.mobility-map-stage')!;
  assert.ok(
    planningMap.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    'A single persistent map precedes the overlaid planning panel.',
  );
  assert.equal(mobilityModuleLoads, 1);
  assert.equal(requests.filter((path) => path === '/mobility-network.json').length, 1);
  assert.equal(screen.queryByRole('button', { name: 'Encontrar mi ruta' }), null);
  await planMederos();
  assert.equal(plannedRequests[0].from.id, 'regioruta-a:regioruta-a-a33');
  assert.equal(plannedRequests[0].to.id, 'metro:universidad');
  const detail = await openFirstConnection();
  const map = within(model).getByRole('group', { name: /^Mapa interactivo/ });
  for (const mode of ['bus', 'walk', 'metro']) {
    assert.ok(
      map.querySelector(`polyline[data-mode="${mode}"]`),
      `The shared map preserves the selected journey's ${mode} geometry.`,
    );
  }
  assert.ok(detail.querySelector('.mobility-step-icon.bus'));
  assert.ok(detail.querySelector('.mobility-step-icon.metro'));
  const provenance = within(detail).getByText('Información del trayecto').closest('details')!;
  assert.equal(provenance.open, false);
  await user.click(within(provenance).getByText('Información del trayecto'));
  assert.ok(within(provenance).getByText(/orden inferido del mapa/));
  await user.click(within(detail).getByRole('button', { name: 'Guardar trayecto' }));
  const save = screen.getByRole('dialog', { name: 'Guarda tu viaje' });
  assert.equal(localStorage.getItem('regiomovil:mobility-offline-trips'), null);
  assert.ok(within(save).getByText(/Se guarda solo en este dispositivo/));
  await user.click(within(save).getByRole('button', { name: 'Trabajo', exact: true }));
  await user.click(within(save).getByRole('button', { name: /^Guardar \d rutas?$/ }));
  assert.equal(screen.queryByRole('dialog'), null);
  await waitFor(() =>
    assert.ok(
      document.activeElement === within(model).getByRole('heading', { name: 'Elige tu ruta' }),
      'Saving restores focus to the route alternatives.',
    ),
  );
  const saved = JSON.parse(localStorage.getItem('regiomovil:mobility-offline-trips')!);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].from.id, 'regioruta-a:regioruta-a-a33');
  assert.equal(saved[0].to.id, 'metro:universidad');
  assert.equal(saved[0].label, 'Trabajo');
  assert.ok(saved[0].journeys.length > 0 && saved[0].journeys.length <= 8);
  assert.ok(saved[0].journeys[0].steps.some((step: { mode: string }) => step.mode === 'bus'));
  assert.ok(saved[0].journeys[0].steps.some((step: { mode: string }) => step.mode === 'metro'));
  assert.ok(
    within(model)
      .getByRole('status')
      .textContent?.includes('Disponibles sin internet en Guardados'),
  );
  assert.ok(
    !requests.some((path) => path.startsWith('/api/mobility/plan')),
    'The graph runs in the device rather than transmitting precise endpoints.',
  );
});

test('inline destination search keeps the map and reveals station suggestions only after text or explicit search', async () => {
  const model = await mountModel();
  await user.click(within(model).getByRole('button', { name: /^Destino:/ }));
  const picker = within(model).getByRole('region', { name: '¿A dónde vas?' });
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(within(picker).queryByRole('region', { name: 'Paradas y estaciones' }), null);
  assert.equal(within(picker).queryByRole('region', { name: 'Lugares y direcciones' }), null);
  assert.equal(model.querySelectorAll('.location-map').length, 1);
  await user.click(within(picker).getByRole('button', { name: 'Buscar lugares y estaciones' }));
  const suggestions = within(picker).getByRole('region', { name: 'Paradas y estaciones' });
  assert.ok(within(suggestions).getAllByRole('button').length > 0);
  assert.ok(
    within(suggestions).getAllByRole('button').length <= 9,
    'The initial local list is bounded, with an optional load-more control.',
  );
  assert.equal(placeQueries.length, 0, 'An empty manual search never calls the remote provider.');
  assert.equal(locationCalls, 0);
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
  assert.ok(within(model).getByRole('status').textContent?.includes('Actualizando rutas'));
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

test('transport filters act on route results and preserve endpoints without another graph calculation', async () => {
  const model = await mountModel();
  assert.equal(within(model).queryByRole('group', { name: 'Filtrar rutas por transporte' }), null);
  assert.equal(
    (within(model).getByRole('button', { name: 'Buscar rutas' }) as HTMLButtonElement).disabled,
    true,
    'An empty destination is not silently replaced by a Metro station.',
  );
  await planMederos();
  const filters = within(model).getByRole('group', { name: 'Filtrar rutas por transporte' });
  const fromName = within(model)
    .getByRole('button', { name: /^Origen:/ })
    .getAttribute('aria-label');
  const toName = within(model)
    .getByRole('button', { name: /^Destino:/ })
    .getAttribute('aria-label');
  const allCards = within(model).getAllByRole('button', { name: /^Ver conexión/ }).length;
  for (const label of [/^Metro\s*\d+$/, /^Autobús\s*\d+$/, /^Metro \+ autobús\s*\d+$/]) {
    const filter = within(filters).getByRole('button', { name: label });
    await user.click(filter);
    assert.equal(filter.getAttribute('aria-pressed'), 'true');
    assert.equal(
      within(model)
        .getByRole('button', { name: /^Origen:/ })
        .getAttribute('aria-label'),
      fromName,
    );
    assert.equal(
      within(model)
        .getByRole('button', { name: /^Destino:/ })
        .getAttribute('aria-label'),
      toName,
    );
    assert.equal(plannedRequests.length, 1);
  }
  assert.ok(within(model).getAllByRole('button', { name: /^Ver conexión/ }).length > 0);
  await user.click(within(filters).getByRole('button', { name: /^Todas\s*\d+$/ }));
  assert.equal(within(model).getAllByRole('button', { name: /^Ver conexión/ }).length, allCards);
  assert.equal(plannedRequests.length, 1);
  assert.equal(placeQueries.length, 0);
});

test('changing a destination resets an empty transport filter for the next route search', async () => {
  const model = await mountModel();
  await planMederos();
  const filters = within(model).getByRole('group', { name: 'Filtrar rutas por transporte' });
  await user.click(within(filters).getByRole('button', { name: /^Metro\s*0$/ }));
  assert.equal(within(model).queryAllByRole('button', { name: /^Ver conexión/ }).length, 0);
  await chooseOfficial('Destino', 'Padre Mier', /^Padre Mier L2$/);
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  const refreshedFilters = within(model).getByRole('group', {
    name: 'Filtrar rutas por transporte',
  });
  assert.equal(
    within(refreshedFilters)
      .getByRole('button', { name: /^Todas\s*\d+$/ })
      .getAttribute('aria-pressed'),
    'true',
    'The previous empty Metro filter must not hide connections to the new destination.',
  );
  assert.ok(within(model).getAllByRole('button', { name: /^Ver conexión/ }).length > 0);
  assert.equal(plannedRequests.length, 2);
});

test('the unified origin search tolerates Sab bernabé and selects San Bernabé locally', async () => {
  const model = await mountModel();
  await chooseOfficial('Origen', 'Estación Sab bernabé', /^San Bernabé L1$/);
  assert.ok(within(model).getByRole('button', { name: 'Origen: San Bernabé' }));
  assert.equal(
    placeQueries.length,
    0,
    'A station suggestion needs no external request or special transport mode.',
  );
  await chooseOfficial('Destino', 'Universidad', /^Universidad L2/);
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  assert.equal('id' in plannedRequests[0].from && plannedRequests[0].from.id, 'metro:san-bernabe');
});

test('San Bernabé to Punto Valle finds bus connections and an empty Metro filter keeps the selected places', async () => {
  const model = await mountModel();
  await chooseOfficial('Origen', 'Estación Sab bernabé', /^San Bernabé L1$/);
  await choosePlace('Destino', 'Punto Valle', /^Punto Valle Río Missouri 555/);
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  assert.equal(plannedRequests.length, 1);
  assert.equal('id' in plannedRequests[0].from && plannedRequests[0].from.id, 'metro:san-bernabe');
  assert.equal('kind' in plannedRequests[0].to && plannedRequests[0].to.kind, 'place');
  assert.equal('lat' in plannedRequests[0].to && plannedRequests[0].to.lat, puntoVallePlace.lat);
  assert.equal('lng' in plannedRequests[0].to && plannedRequests[0].to.lng, puntoVallePlace.lng);
  assert.ok(
    model.querySelector('.mobility-result .mobility-mode.bus'),
    'The real graph provides an actual bus leg for this destination.',
  );
  const filters = within(model).getByRole('group', { name: 'Filtrar rutas por transporte' });
  const metro = within(filters).getByRole('button', { name: /^Metro\s*0$/ });
  await user.click(metro);
  assert.equal(metro.getAttribute('aria-pressed'), 'true');
  assert.equal(within(model).queryAllByRole('button', { name: /^Ver conexión/ }).length, 0);
  assert.ok(within(model).getByText('Sin opciones con este filtro.'));
  assert.equal(
    model.querySelector('.location-map polyline[data-mode="bus"]'),
    null,
    'The map respects the empty Metro filter too.',
  );
  assert.ok(within(model).getByRole('button', { name: 'Origen: San Bernabé' }));
  assert.ok(within(model).getByRole('button', { name: 'Destino: Punto Valle' }));
  assert.equal(
    plannedRequests.length,
    1,
    'Changing the result filter does not submit different endpoints.',
  );
  await user.click(within(filters).getByRole('button', { name: /^Todas\s*\d+$/ }));
  assert.ok(model.querySelector('.mobility-result .mobility-mode.bus'));
  assert.deepEqual(placeQueries, ['Punto Valle']);
});

test('both origin and destination accept public places or street addresses before transport is chosen', async () => {
  const model = await mountModel();
  await choosePlace(
    'Origen',
    'Centro de las Artes UANL, Praga, Monterrey',
    /^Centro de las Artes UANL /,
    true,
  );
  await choosePlace(
    'Destino',
    'Ciudad Universitaria UANL',
    /Ciudad Universitaria UANL Ciudad Universitaria/,
  );
  assert.ok(within(model).getByRole('button', { name: 'Origen: Centro de las Artes UANL' }));
  assert.ok(within(model).getByRole('button', { name: 'Destino: Ciudad Universitaria UANL' }));
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  assert.equal('kind' in plannedRequests[0].from && plannedRequests[0].from.kind, 'place');
  assert.equal('kind' in plannedRequests[0].to && plannedRequests[0].to.kind, 'place');
  assert.deepEqual(placeQueries, [
    'Centro de las Artes UANL, Praga, Monterrey',
    'Ciudad Universitaria UANL',
  ]);
  const filters = within(model).getByRole('group', { name: 'Filtrar rutas por transporte' });
  await user.click(within(filters).getByRole('button', { name: /^Metro \+ autobús\s*\d+$/ }));
  assert.equal(plannedRequests.length, 1);
  assert.ok(within(model).getByRole('button', { name: 'Origen: Centro de las Artes UANL' }));
  assert.ok(within(model).getByRole('button', { name: 'Destino: Ciudad Universitaria UANL' }));
});

test('foreground GPS remains in memory until explicit labelled offline saving and is never sent to place search', async () => {
  const model = await mountModel();
  assert.equal(
    locationCalls,
    0,
    'Opening the experiment must not request permission or track location.',
  );
  await chooseOfficial('Destino', 'Universidad', /^Universidad L2/);
  await user.click(within(model).getByRole('button', { name: 'Usar mi ubicación actual' }));
  await within(model).findByRole('button', { name: 'Origen: Mi ubicación' });
  assert.equal(locationCalls, 1);
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  assert.equal('kind' in plannedRequests[0].from && plannedRequests[0].from.kind, 'location');
  const detail = await openFirstConnection();
  assert.equal(localStorage.getItem('regiomovil:mobility-offline-trips'), null);
  await user.click(within(detail).getByRole('button', { name: 'Guardar trayecto' }));
  const save = screen.getByRole('dialog', { name: 'Guarda tu viaje' });
  assert.equal(localStorage.getItem('regiomovil:mobility-offline-trips'), null);
  await user.click(within(save).getByRole('button', { name: 'Personalizada', exact: true }));
  await user.type(within(save).getByRole('textbox', { name: 'Nombre del viaje' }), 'Museo');
  await user.click(within(save).getByRole('button', { name: /^Guardar \d rutas?$/ }));
  assert.equal(screen.queryByRole('dialog'), null);
  const stored = localStorage.getItem('regiomovil:mobility-offline-trips')!;
  const saved = JSON.parse(stored);
  assert.equal(saved[0].from.lat, gpsPoint.latitude);
  assert.equal(saved[0].from.lng, gpsPoint.longitude);
  assert.equal(saved[0].label, 'Museo');
  assert.equal(saved[0].to.id, 'metro:universidad');
  assert.ok(
    !requests.some(
      (path) =>
        path.includes(String(gpsPoint.latitude)) || path.includes(String(gpsPoint.longitude)),
    ),
  );
  assert.equal(placeQueries.length, 0, 'GPS is not sent to the place-search service.');
  await goOffline();
  await user.click(within(model).getByRole('button', { name: 'Museo', exact: true }));
  const snapshot = screen.getByRole('dialog', { name: 'Museo · ruta guardada' });
  assert.ok(within(snapshot).getByRole('group', { name: /^Mapa interactivo/ }));
  assert.ok(within(snapshot).getByText(/Disponible sin internet/));
  assert.equal(
    plannedRequests.length,
    1,
    'Opening a snapshot never recalculates coordinates offline.',
  );
  await act(async () => window.dispatchEvent(new dom.window.Event('offline')));
  assert.ok(
    screen.getByRole('dialog', { name: 'Museo · ruta guardada' }),
    'Connectivity changes preserve the saved detail.',
  );
  await user.click(within(snapshot).getByRole('button', { name: 'Cerrar ventana' }));
  await user.click(screen.getByRole('button', { name: /^Destino:/ }));
  const picker = screen.getByRole('region', { name: '¿A dónde vas?' });
  await user.type(within(picker).getByRole('searchbox', { name: 'Buscar destino' }), 'Museo');
  await user.click(within(picker).getByRole('button', { name: /Ver trayecto · Museo/ }));
  assert.ok(screen.getByRole('dialog', { name: 'Museo · ruta guardada' }));
  assert.equal(
    plannedRequests.length,
    1,
    'The offline search opens saved coordinates without a new routing request.',
  );
});

test('place search previews its result on the only map without confirming a destination', async () => {
  const model = await mountModel();
  await user.click(within(model).getByRole('button', { name: /^Destino:/ }));
  const picker = screen.getByRole('region', { name: '¿A dónde vas?' });
  const mapRegion = within(model).getByRole('group', { name: /^Mapa interactivo/ });
  assert.equal(
    model.querySelectorAll('.location-map').length,
    1,
    'Search must reuse one map surface.',
  );
  const search = within(picker).getByRole('searchbox', { name: 'Buscar destino' });
  await user.type(search, 'Ciudad Universitaria UANL');
  await within(mapRegion).findByRole('img', { name: /Vista previa de Ciudad Universitaria UANL/ });
  assert.equal(model.getAttribute('data-mode'), 'search');
  assert.equal(
    within(mapRegion).queryByText('B', { exact: true }),
    null,
    'An unconfirmed preview must not create a destination pin.',
  );
  assert.equal(plannedRequests.length, 0);
  assert.equal(
    document.activeElement,
    search,
    'Updating map context must not dismiss the keyboard.',
  );
  const places = within(picker).getByRole('region', { name: 'Lugares y direcciones' });
  await user.click(within(places).getByRole('button', { name: /Ciudad Universitaria UANL/ }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(within(model).getByRole('button', { name: 'Destino: Ciudad Universitaria UANL' }));
  assert.equal(model.querySelectorAll('.location-map').length, 1);
  assert.equal(model.querySelector('.location-search-preview'), null);
});

test('denied GPS keeps the origin picker open and offers manual search without retrying automatically', async () => {
  const model = await mountModel();
  denyGps = true;
  await user.click(within(model).getByRole('button', { name: /^Origen:/ }));
  const picker = screen.getByRole('region', { name: '¿Desde dónde sales?' });
  await user.click(within(picker).getByRole('button', { name: 'Usar mi ubicación actual' }));
  assert.match((await within(picker).findByRole('alert')).textContent!, /No se concedió acceso/);
  assert.equal(locationCalls, 1);
  assert.equal(
    (within(picker).getByRole('button', { name: 'Usar mi ubicación actual' }) as HTMLButtonElement)
      .disabled,
    false,
  );
  const search = within(picker).getByRole('searchbox', { name: 'Buscar origen' });
  await user.type(search, 'Universidad');
  const stops = within(picker).getByRole('region', { name: 'Paradas y estaciones' });
  await user.click(within(stops).getByRole('button', { name: /^Universidad L2/ }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(within(model).getByRole('button', { name: 'Origen: Universidad' }));
  assert.equal(locationCalls, 1);
});

test('closing endpoint search from existing results restores focus to its endpoint control', async () => {
  const model = await mountModel();
  await planMederos();
  const destination = within(model).getByRole('button', { name: 'Destino: Universidad' });
  await user.click(destination);
  const search = screen.getByRole('searchbox', { name: 'Buscar destino' });
  assert.equal(document.activeElement, search);
  await user.keyboard('{Escape}');
  await waitFor(() =>
    assert.ok(
      document.activeElement ===
        within(model).getByRole('button', { name: 'Destino: Universidad' }),
      'Search restores focus to the remounted destination control.',
    ),
  );
  assert.ok(within(model).getByLabelText('Resultados multimodales'));
  assert.equal(plannedRequests.length, 1, 'Closing search keeps the previous alternatives.');
});

test('closing the origin picker invalidates a late GPS permission response', async () => {
  const model = await mountModel();
  holdGps = true;
  await user.click(within(model).getByRole('button', { name: /^Origen:/ }));
  const picker = screen.getByRole('region', { name: '¿Desde dónde sales?' });
  await user.click(within(picker).getByRole('button', { name: 'Usar mi ubicación actual' }));
  assert.ok(pendingGps);
  assert.equal(
    (within(picker).getByRole('button', { name: 'Obteniendo ubicación…' }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await user.click(within(picker).getByRole('button', { name: 'Cerrar búsqueda' }));
  await act(async () => pendingGps?.());
  assert.ok(within(model).getByRole('button', { name: 'Origen: Padre Mier' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(locationCalls, 1);
});

test('a cached model works offline with official bus and Metro stops while GPS and online place search are unavailable', async () => {
  await mountModel();
  await waitFor(() => assert.ok(cachedResponses.has(cacheKey('/mobility-network.json'))));
  cleanup();
  await goOffline();
  requests.length = 0;
  const model = await mountModel();
  assert.ok(within(model).getByText('Sin conexión', { exact: true }));
  assert.equal(
    (within(model).getByRole('button', { name: 'Usar mi ubicación actual' }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await user.click(within(model).getByRole('button', { name: /^Origen:/ }));
  const picker = screen.getByRole('region', { name: '¿Desde dónde sales?' });
  const placesButton = within(picker).queryByRole('button', {
    name: 'Buscar lugares y direcciones',
  });
  assert.ok(
    !placesButton || (placesButton as HTMLButtonElement).disabled,
    'Online places must be absent or disabled offline.',
  );
  assert.ok(within(picker).getByRole('searchbox', { name: 'Buscar origen' }));
  assert.ok(within(picker).getByText('Sin conexión: busca una estación o parada oficial.'));
  await user.click(within(picker).getByRole('button', { name: 'Cerrar búsqueda' }));
  await planMederos();
  assert.equal(plannedRequests[0].offline, true);
  assert.ok('id' in plannedRequests[0].from && 'id' in plannedRequests[0].to);
  assert.equal(locationCalls, 0);
  assert.equal(placeQueries.length, 0);
});

test('searching a real place online uses the API, and losing connection clears that endpoint and its route', async () => {
  const model = await mountModel();
  await user.click(within(model).getByRole('button', { name: /^Destino:/ }));
  const picker = screen.getByRole('region', { name: '¿A dónde vas?' });
  await user.type(
    within(picker).getByRole('searchbox', { name: 'Buscar destino' }),
    'Ciudad Universitaria UANL',
  );
  assert.equal(placeQueries.length, 0, 'Suggestions wait for a pause in typing.');
  await user.click(
    await within(picker).findByRole('button', {
      name: /Ciudad Universitaria UANL Ciudad Universitaria/,
    }),
  );
  assert.deepEqual(placeQueries, ['Ciudad Universitaria UANL']);
  assert.ok(within(model).getByRole('button', { name: 'Destino: Ciudad Universitaria UANL' }));
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  await goOffline();
  await within(model).findByRole('button', { name: 'Destino: Elige un punto' });
  assert.equal(within(model).queryByLabelText('Resultados multimodales'), null);
  assert.equal(
    (within(model).getByRole('button', { name: 'Buscar rutas' }) as HTMLButtonElement).disabled,
    true,
  );
  const information = within(model).getByText('Información del viaje').closest('details')!;
  assert.equal(information.open, false);
  await user.click(within(information).getByText('Información del viaje'));
  assert.ok(
    within(information)
      .getByRole('status')
      .textContent?.includes('elige estaciones o paradas oficiales'),
  );
  assert.ok(
    within(model).getByRole('button', { name: 'Origen: Padre Mier' }),
    'The official endpoint is retained.',
  );
  assert.equal(localStorage.getItem('regiomovil:mobility-journeys'), null);
});

test('both endpoint searches can hand off to a movable map pin without sending its coordinates to place search', async () => {
  const model = await mountModel();
  await user.click(within(model).getByRole('button', { name: /^Origen:/ }));
  await user.click(
    within(screen.getByRole('region', { name: '¿Desde dónde sales?' })).getByRole('button', {
      name: /Elegir en el mapa/,
    }),
  );
  assert.equal(screen.queryByRole('dialog'), null);
  let map = within(model).getByRole('group', { name: /^Mapa interactivo/ });
  await act(async () => {
    fireEvent.keyDown(map, { key: 'ArrowUp' });
  });
  await user.click(within(model).getByRole('button', { name: 'Confirmar punto' }));
  assert.ok(within(model).getByRole('button', { name: 'Origen: Origen en el mapa' }));
  await user.click(within(model).getByRole('button', { name: 'Elegir destino en mapa' }));
  map = within(model).getByRole('group', { name: /^Mapa interactivo/ });
  await act(async () => {
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    fireEvent.keyDown(map, { key: 'ArrowRight' });
  });
  await user.click(within(model).getByRole('button', { name: 'Confirmar punto' }));
  assert.ok(within(model).getByRole('button', { name: 'Destino: Destino en el mapa' }));
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await waitFor(() => assert.equal(plannedRequests.length, 1));
  assert.equal('kind' in plannedRequests[0].from && plannedRequests[0].from.kind, 'place');
  assert.equal('kind' in plannedRequests[0].to && plannedRequests[0].to.kind, 'place');
  assert.notDeepEqual(plannedRequests[0].from, plannedRequests[0].to);
  assert.equal(placeQueries.length, 0);
  assert.equal(locationCalls, 0);
});

test('offline map confirmation uses an official stop ID instead of generating a coordinate endpoint', async () => {
  const model = await mountModel();
  await goOffline();
  await user.click(within(model).getByRole('button', { name: 'Elegir destino en mapa' }));
  await user.click(await within(model).findByRole('button', { name: 'Usar parada cercana' }));
  assert.ok(within(model).getByRole('button', { name: 'Destino: Padre Mier' }));
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await waitFor(() => assert.equal(plannedRequests.length, 1));
  assert.equal(plannedRequests[0].offline, true);
  assert.deepEqual(plannedRequests[0].to, { id: 'metro:padre-mier', name: 'Padre Mier' });
  assert.equal(placeQueries.length, 0);
});

test('Las Estaciones to the real Tec campus resolves both references through the backend and returns bus connections', async () => {
  const model = await mountModel();
  await choosePlace('Origen', 'Colonia Las Estaciones', /Las Estaciones/);
  await choosePlace('Destino', 'Tec de Monterrey', /Campus Monterrey/);
  await user.click(within(model).getByRole('button', { name: 'Buscar rutas' }));
  await within(model).findByRole('heading', { name: 'Elige tu ruta' });
  const request = plannedRequests[0];
  assert.ok('lat' in request.from && Math.abs(request.from.lat - 25.7661587) < 0.00001);
  assert.ok('lat' in request.to && Math.abs(request.to.lat - 25.6507267) < 0.00001);
  assert.ok(model.querySelector('.mobility-result .mobility-mode.bus'));
  assert.ok(within(model).getAllByRole('button', { name: /^Ver conexión/ }).length >= 1);
  assert.deepEqual(placeQueries, ['Colonia Las Estaciones', 'Tec de Monterrey']);
});

test('choosing a map pin cancels a pending GPS reply and gives keyboard focus to the map', async () => {
  const model = await mountModel();
  holdGps = true;
  await user.click(within(model).getByRole('button', { name: 'Usar mi ubicación actual' }));
  assert.ok(pendingGps);
  await user.click(within(model).getByRole('button', { name: /^Destino:/ }));
  await user.click(
    within(screen.getByRole('region', { name: '¿A dónde vas?' })).getByRole('button', {
      name: /Elegir en el mapa/,
    }),
  );
  const map = within(model).getByRole('group', { name: /^Mapa interactivo/ });
  assert.equal(document.activeElement, map);
  await act(async () => pendingGps?.());
  assert.ok(within(model).getByRole('button', { name: 'Confirmar punto' }));
  await user.click(within(model).getByRole('button', { name: 'Cerrar búsqueda' }));
  assert.ok(within(model).getByRole('button', { name: 'Origen: Padre Mier' }));
  assert.equal(placeQueries.length, 0);
});

test('following a route expands one accessible guide, hides saving and restores the detail on finish', async () => {
  await mountModel();
  await chooseOfficial('Destino', 'Universidad', /^Universidad L2/);
  await user.click(screen.getByRole('button', { name: 'Buscar rutas' }));
  await screen.findByRole('heading', { name: 'Elige tu ruta' });
  const detail = await openFirstConnection();
  detail.scrollTop = 180;
  await user.click(within(detail).getByRole('button', { name: 'Iniciar trayecto' }));
  const guide = await screen.findByRole('dialog', { name: 'Sigue tu ruta' });
  const controls = await within(guide).findByRole('region', { name: 'Guía de tu trayecto' });
  assert.ok(guide.classList.contains('journey-guidance-dialog'));
  assert.equal(
    guide.scrollTop,
    0,
    'Starting shows the guidance header instead of retaining the detail scroll.',
  );
  assert.equal(
    screen.getAllByRole('dialog').length,
    1,
    'Guidance reuses the modal and its focus lock.',
  );
  assert.equal(within(guide).queryByRole('button', { name: 'Guardar sin internet' }), null);
  assert.ok(within(controls).getByRole('button', { name: /^Ya (llegué|bajé)/ }));
  guide.scrollTop = 160;
  await user.click(within(controls).getByRole('button', { name: /^Ya (llegué|bajé)/ }));
  assert.equal(guide.scrollTop, 0, 'Confirming a step brings the next instruction back into view.');
  await user.click(within(guide).getByRole('button', { name: 'Cerrar guía' }));
  const restored = screen.getByRole('region', { name: 'Tu trayecto' });
  assert.equal(restored.classList.contains('journey-guidance-dialog'), false);
  const start = within(restored).getByRole('button', { name: 'Iniciar trayecto' });
  await waitFor(() =>
    assert.ok(
      document.activeElement === start,
      'Closing the guide restores focus to Iniciar trayecto in the planning panel.',
    ),
  );
  assert.ok(within(restored).getByRole('button', { name: 'Guardar trayecto' }));
  await user.click(start);
  const reopenedGuide = await screen.findByRole('dialog', { name: 'Sigue tu ruta' });
  await within(reopenedGuide).findByRole('region', { name: 'Guía de tu trayecto' });
  await user.click(within(reopenedGuide).getByRole('button', { name: 'Cerrar ventana' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(screen.getByRole('region', { name: 'Tu trayecto' }));
  await user.click(within(restored).getByRole('button', { name: 'Volver a las rutas' }));
  const reopened = await openFirstConnection();
  assert.equal(reopened.classList.contains('journey-guidance-dialog'), false);
});
