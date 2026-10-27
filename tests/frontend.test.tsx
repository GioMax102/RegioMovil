/** Integration tests in JSDOM, not a real browser or Android accessibility audit. */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createApp } from '../server/app.mjs';

const realFetch = globalThis.fetch;
const dom = new JSDOM('<!doctype html><html lang="es"><body><div id="root"></div></body></html>', {
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
for (const name of globals) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
}
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
// JSDOM has no native dialog top layer. These stubs only expose open/close state.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const spoken: string[] = [];
const speech = {
  cancel() {},
  speak(utterance: { text: string }) {
    spoken.push(utterance.text);
  },
};
class Utterance {
  text: string;
  lang = '';
  rate = 1;
  constructor(text: string) {
    this.text = text;
  }
}
Object.defineProperty(dom.window, 'speechSynthesis', { value: speech, configurable: true });
Object.defineProperty(globalThis, 'speechSynthesis', { value: speech, configurable: true });
Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
  value: Utterance,
  configurable: true,
});

const sourceHooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});

// Testing Library and App must see the DOM at import time.
const { render, cleanup, screen, within, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: App } = await import('../src/App');
const { Dialog } = await import('../src/components/Primitives');
type AppServer = ReturnType<typeof createApp>;
let application: AppServer;
let server: Server;
let base = '';
let user: ReturnType<typeof userEvent.setup>;
let failRequests: (path: string, method: string) => boolean = () => false;
let holdStation: string | null = null;
let holdReports = false;
const heldRequests: (() => void)[] = [];
const requests: { path: string; method: string }[] = [];
const completedRequests: { path: string; method: string }[] = [];
const submittedReports: { id: string; title: string; detail: string }[] = [];

before(async () => {
  const network = JSON.parse(
    await readFile(new URL('../data/network.json', import.meta.url), 'utf8'),
  );
  const mobilityNetwork = JSON.parse(
    await readFile(new URL('../public/mobility-network.json', import.meta.url), 'utf8'),
  );
  application = createApp({
    network,
    mobilityNetwork,
    distPath: new URL('../public/', import.meta.url).pathname,
    now: () => new Date('2026-10-15T18:00:00.000Z'),
  });
  server = createServer(application.handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? new URL(input, base)
        : new URL(input instanceof URL ? input.href : input.url, base);
    const method =
      init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    requests.push({ path: `${url.pathname}${url.search}`, method });
    if (failRequests(url.pathname, method)) throw new TypeError('Network is offline in this test');
    if (url.pathname === '/api/board' && url.searchParams.get('station') === holdStation)
      await new Promise<void>((resolve) => heldRequests.push(resolve));
    if (url.pathname === '/api/reports' && method === 'POST' && holdReports)
      await new Promise<void>((resolve) => heldRequests.push(resolve));
    const response = await realFetch(url, init);
    if (url.pathname === '/api/reports' && method === 'POST' && response.ok) {
      submittedReports.push((await response.clone().json()).report);
    }
    completedRequests.push({ path: url.pathname, method });
    return response;
  };
});

beforeEach((context) => {
  // The UI clock and API board refer to the same operating-hour fixture.
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-15T18:00:00Z') });
  requests.length = 0;
  completedRequests.length = 0;
  submittedReports.length = 0;
  spoken.length = 0;
  failRequests = () => false;
  holdStation = null;
  holdReports = false;
  dom.window.localStorage.clear();
  dom.window.history.replaceState({}, '', '/');
  dom.window.document.documentElement.className = '';
  user = userEvent.setup({ document: dom.window.document, delay: null });
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  }); // Flush React work before restoring JSDOM globals.
  await new Promise<void>((resolve) => setImmediate(resolve));
  heldRequests.splice(0).forEach((release) => release());
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
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Reflect.deleteProperty(globalThis, 'speechSynthesis');
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
});

async function mount(search = '') {
  dom.window.history.replaceState({}, '', `/${search}`);
  render(<App />);
  await screen.findAllByRole('button', { name: /Línea 2 hacia .*llegada simulada/ });
}

function mainNavigation() {
  return within(screen.getByRole('navigation', { name: 'Navegación principal' }));
}
async function navigate(name: string) {
  await user.click(mainNavigation().getByRole('button', { name, exact: true }));
  if (name === 'Planear viaje')
    await user.click(screen.getByRole('button', { name: 'Solo Metro', exact: true }));
}
async function closeDialog() {
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar ventana' }),
  );
}

test('screen changes from home, sidebar and mobile consistently reset scroll and focus the new heading', async () => {
  await mount();
  const originalScrollTo = window.scrollTo;
  const scrolls: ScrollToOptions[] = [];
  window.scrollTo = ((options: ScrollToOptions) => scrolls.push(options)) as typeof window.scrollTo;
  try {
    await user.click(
      mainNavigation().getByRole('button', { name: 'Red de transporte', exact: true }),
    );
    const title = screen.getByRole('heading', { name: 'Red de transporte.', exact: true });
    assert.equal(document.activeElement, title);
    assert.equal(screen.getByRole('main').getAttribute('aria-labelledby'), title.id);
    assert.deepEqual(scrolls, [{ top: 0, left: 0, behavior: 'auto' }]);
    // A module finishing its download must not take focus a second time.
    const metroTab = screen.getByRole('tab', { name: 'Estaciones de Metro' });
    const routesTab = screen.getByRole('tab', { name: 'Rutas y redes' });
    await user.click(metroTab);
    assert.equal(document.activeElement, metroTab);
    assert.equal(screen.getByRole('heading', { name: 'Red de transporte.', exact: true }), title);
    await user.keyboard('{ArrowRight}');
    assert.equal(document.activeElement, routesTab);
    assert.equal(routesTab.getAttribute('aria-selected'), 'true');
    assert.equal(screen.getByRole('heading', { name: 'Red de transporte.', exact: true }), title);
    await user.keyboard('{ArrowLeft}');
    assert.equal(document.activeElement, metroTab);
    assert.equal(metroTab.getAttribute('aria-selected'), 'true');
    const search = screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' });
    await user.click(search);
    await user.type(search, 'Anahuac');
    assert.equal(document.activeElement, search);
    assert.equal(scrolls.length, 1);
    await user.click(mainNavigation().getByRole('button', { name: 'Mi camino', exact: true }));
    assert.equal(
      document.activeElement,
      screen.getByRole('heading', { name: 'Muévete con más calma.' }),
    );
    await user.click(
      within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', {
        name: 'Red',
        exact: true,
      }),
    );
    assert.equal(
      document.activeElement,
      screen.getByRole('heading', { name: 'Red de transporte.', exact: true }),
    );
    assert.equal(scrolls.length, 3);
  } finally {
    window.scrollTo = originalScrollTo;
  }
});
// Unified place search, routing, save and offline regressions live in mobility-frontend.test.tsx.

test('initial board comes from the real API and unit details explain simulation and unknown accessibility', async () => {
  await mount();
  await screen.findByText('En línea');
  assert.equal(screen.getAllByRole('button', { name: /llegada simulada.*Ver detalles/ }).length, 2);
  const first = screen.getAllByRole('button', { name: /llegada simulada.*Ver detalles/ })[0];
  assert.match(first.getAttribute('aria-label') || '', /Afluencia simulada (Baja|Media|Alta)/);
  assert.match(
    first.getAttribute('aria-label') || '',
    /Aire acondicionado simulado: (funcionando|no disponible|sin información)/,
  );
  assert.ok(
    requests.some((request) => request.path === '/api/board?station=padre-mier&scenario=normal'),
  );
  const provenance = screen.getByText('Datos y fuentes').closest('details')!;
  assert.equal(
    provenance.open,
    false,
    'Provenance is available without cluttering the initial screen.',
  );
  await user.click(within(provenance).getByText('Datos y fuentes'));
  assert.equal(provenance.open, true);
  assert.ok(within(provenance).getByText(/Llegadas, afluencia y condiciones.*simulación/));
  await user.click(screen.getAllByRole('button', { name: /llegada simulada.*Ver detalles/ })[0]);
  const dialog = await screen.findByRole('dialog', { name: 'Conoce esta unidad' });
  assert.ok(within(dialog).getByText('Accesibilidad real'));
  assert.ok(within(dialog).getByText('Sin verificar'));
  const info = within(dialog).getByText('Información de la simulación').closest('details')!;
  assert.equal(info.open, false);
  await user.click(within(info).getByText('Información de la simulación'));
  assert.ok(within(dialog).getByText(/No representa una unidad real ni confirma su estado/));
  assert.ok(within(dialog).getByText('Afluencia simulada'));
});

test('settings lock the background document and restore its existing styles and mobile scroll position on close', async () => {
  const previousBody = document.body.getAttribute('style');
  const previousRoot = document.documentElement.getAttribute('style');
  const scrollX = Object.getOwnPropertyDescriptor(window, 'scrollX');
  const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
  const originalScrollTo = window.scrollTo;
  const restored: number[][] = [];
  Object.defineProperty(window, 'scrollX', { configurable: true, value: 12 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  window.scrollTo = ((x: number, y: number) => restored.push([x, y])) as typeof window.scrollTo;
  document.body.style.cssText = 'position: relative; top: 3px; padding-right: 7px; color: red;';
  document.documentElement.style.cssText = 'overflow: auto; scroll-behavior: smooth;';
  try {
    await mount();
    await user.click(screen.getByRole('button', { name: 'Accesibilidad', exact: true }));
    assert.equal(document.body.style.position, 'fixed');
    assert.equal(document.body.style.top, '-640px');
    assert.equal(document.body.style.left, '-12px');
    assert.equal(document.documentElement.style.overflow, 'hidden');
    await closeDialog();
    assert.equal(document.body.style.position, 'relative');
    assert.equal(document.body.style.top, '3px');
    assert.equal(document.body.style.paddingRight, '7px');
    assert.equal(document.body.style.color, 'red');
    assert.equal(document.documentElement.style.overflow, 'auto');
    assert.equal(document.documentElement.style.scrollBehavior, 'smooth');
    assert.deepEqual(restored, [[12, 640]]);
  } finally {
    cleanup();
    if (previousBody === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', previousBody);
    if (previousRoot === null) document.documentElement.removeAttribute('style');
    else document.documentElement.setAttribute('style', previousRoot);
    if (scrollX) Object.defineProperty(window, 'scrollX', scrollX);
    if (scrollY) Object.defineProperty(window, 'scrollY', scrollY);
    window.scrollTo = originalScrollTo;
  }
});

test('closing a nested dialog keeps the background locked until the final dialog unmounts', async () => {
  function NestedDialogs() {
    const [inner, setInner] = React.useState(true);
    return (
      <Dialog title="Exterior" onClose={() => {}}>
        {inner && (
          <Dialog title="Interior" onClose={() => setInner(false)}>
            Contenido
          </Dialog>
        )}
      </Dialog>
    );
  }
  render(
    <React.StrictMode>
      <NestedDialogs />
    </React.StrictMode>,
  );
  assert.equal(screen.getAllByRole('dialog').length, 2);
  assert.equal(document.body.style.position, 'fixed');
  await user.click(
    within(screen.getByRole('dialog', { name: 'Interior' })).getByRole('button', {
      name: 'Cerrar ventana',
    }),
  );
  assert.equal(screen.queryByRole('dialog', { name: 'Interior' }), null);
  assert.ok(screen.getByRole('dialog', { name: 'Exterior' }));
  assert.equal(document.body.style.position, 'fixed');
  assert.equal(document.documentElement.style.overflow, 'hidden');
  cleanup();
  assert.equal(document.body.style.position, '');
  assert.equal(document.documentElement.style.overflow, '');
});

test('station search resolves the Fundidora alias to Arena Monterrey and refreshes its API board', async () => {
  await mount();
  await navigate('Red de transporte');
  await user.click(screen.getByRole('tab', { name: 'Estaciones de Metro' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' }),
    'Fundidora',
  );
  holdStation = 'fundidora';
  await user.click(screen.getByRole('button', { name: /Arena Monterrey Monterrey/ }));
  await waitFor(() => assert.equal(heldRequests.length, 1));
  assert.ok(screen.getByRole('heading', { name: 'Arena Monterrey', exact: true }));
  assert.equal(
    screen.queryAllByRole('button', { name: /llegada simulada.*Ver detalles/ }).length,
    0,
    'Old station predictions must not be attributed to a newly selected station while it loads.',
  );
  holdStation = null;
  heldRequests.splice(0).forEach((release) => release());
  await screen.findAllByRole('button', { name: /Línea 1 hacia .*llegada simulada/ });
  assert.equal(localStorage.getItem('regiomovil:station'), '"fundidora"');
});

test('accessibility settings persist and the peak scenario refreshes prediction and advice', async () => {
  await mount();
  const outlook = screen.getByText('Afluencia por hora').closest('details')!;
  assert.equal(outlook.open, false);
  await user.click(within(outlook).getByText('Afluencia por hora'));
  assert.equal(outlook.open, true);
  const initialForecast = screen
    .getByRole('img', { name: /Afluencia simulada por hora/ })
    .getAttribute('aria-label');
  await user.click(screen.getByRole('button', { name: 'Accesibilidad', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'A tu manera' });
  await user.click(within(dialog).getByRole('switch', { name: 'Texto más grande' }));
  await user.click(within(dialog).getByRole('switch', { name: 'Contraste alto' }));
  assert.ok(document.documentElement.classList.contains('large-text'));
  assert.ok(document.documentElement.classList.contains('high-contrast'));
  assert.equal(localStorage.getItem('regiomovil:largeText'), 'true');
  assert.equal(localStorage.getItem('regiomovil:contrast'), 'true');
  await user.click(within(dialog).getByRole('button', { name: 'Hora pico' }));
  await closeDialog();
  const advice = await screen.findByText('Una salida después puede ir más tranquila');
  await user.click(advice);
  assert.equal(advice.closest('details')?.open, true);
  assert.ok(
    requests.some((request) => request.path === '/api/board?station=padre-mier&scenario=peak'),
  );
  assert.notEqual(
    screen.getByRole('img', { name: /Afluencia simulada por hora/ }).getAttribute('aria-label'),
    initialForecast,
  );
  await user.click(screen.getByRole('button', { name: 'Ver avisos' }));
  assert.ok(
    within(screen.getByRole('dialog')).getByRole('heading', { name: 'Simulación de hora pico' }),
  );
});

test('appearance controls persist a dark theme and allow disabling navigation motion', async () => {
  await mount();
  await user.click(screen.getByRole('button', { name: 'Accesibilidad', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'A tu manera' });
  await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Tema' }), 'dark');
  await user.click(within(dialog).getByRole('switch', { name: 'Animaciones', exact: true }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.dataset.motion, 'reduced');
  assert.deepEqual(JSON.parse(localStorage.getItem('regiomovil:appearance:v1')!), {
    theme: 'dark',
    animations: false,
  });
  await closeDialog();
  cleanup();
  await mount();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.dataset.motion, 'reduced');
});

test('Home keeps the planning action direct, and Red opens the map with searchable transport routes', async () => {
  await mount();
  assert.ok(screen.getByRole('button', { name: /¿A dónde vamos\?/ }));
  assert.equal(screen.queryByRole('navigation', { name: 'Trayectos guardados' }), null);
  assert.equal(screen.queryByRole('combobox', { name: 'Buscar recorrido en el mapa' }), null);
  await user.click(
    mainNavigation().getByRole('button', { name: 'Red de transporte', exact: true }),
  );
  await screen.findByRole('combobox', { name: 'Buscar recorrido en el mapa' });
  assert.ok(screen.getByRole('heading', { name: 'Red de transporte.', exact: true }));
  assert.equal(screen.queryByRole('heading', { name: 'Próximas llegadas' }), null);
  assert.equal(
    screen.getByRole('tab', { name: /Rutas y redes/ }).getAttribute('aria-selected'),
    'true',
  );
});

test('a report is submitted through the UI and stays private and pending in SQLite', async () => {
  await mount();
  await user.click(screen.getByRole('button', { name: 'Reportar', exact: true }));
  await screen.findByRole('textbox', { name: 'Título' });
  const dialog = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
  await user.selectOptions(
    within(dialog).getByRole('combobox', { name: '¿Qué observaste?' }),
    'climate',
  );
  const description = 'La ventilación de la unidad estaba apagada durante mi recorrido.';
  await user.type(within(dialog).getByRole('textbox', { name: 'Título' }), 'Ventilación apagada');
  await user.type(within(dialog).getByRole('textbox', { name: /Cuéntanos un poco/ }), description);
  await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte al piloto' }));
  await screen.findByRole('status');
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  const response = await realFetch(`${base}/api/reports?station=padre-mier`);
  const payload = await response.json();
  assert.ok(!payload.reports.some((report: { detail: string }) => report.detail === description));
  const stored = application.store.get(submittedReports[0].id);
  assert.equal(stored.detail, description);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.category, 'climate');
  assert.equal(stored.publication_consent, 0);
  assert.ok(
    requests.some((request) => request.path === '/api/reports' && request.method === 'POST'),
  );
});

test('failed report submission preserves its text and does not claim success', async () => {
  await mount();
  await user.click(screen.getByRole('button', { name: 'Reportar', exact: true }));
  await screen.findByRole('textbox', { name: 'Título' });
  const dialog = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
  const description = 'La puerta no cerró durante la observación de este viaje.';
  await user.type(within(dialog).getByRole('textbox', { name: 'Título' }), 'Puerta con una falla');
  const textarea = within(dialog).getByRole('textbox', {
    name: /Cuéntanos un poco/,
  }) as HTMLTextAreaElement;
  await user.type(textarea, description);
  failRequests = (path, method) => path === '/api/reports' && method === 'POST';
  await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte al piloto' }));
  assert.match(
    (await within(dialog).findByRole('alert')).textContent || '',
    /No pudimos confirmar la recepción.*Puede haberse guardado.*Tu texto sigue aquí/,
  );
  assert.equal(textarea.value, description);
  assert.equal(screen.queryByRole('status'), null);
  assert.equal(
    (within(dialog).getByRole('button', { name: 'Enviar reporte al piloto' }) as HTMLButtonElement)
      .disabled,
    false,
  );
});

test('kiosk allows station consultation and speech while hiding report/planning/personal navigation', async () => {
  localStorage.setItem('regiomovil:station', '"universidad"');
  await mount('?kiosk=1&station=padre-mier');
  assert.ok(screen.getByRole('heading', { name: 'Padre Mier', level: 1 }));
  assert.equal(screen.queryByRole('navigation', { name: 'Navegación principal' }), null);
  assert.equal(screen.queryByRole('navigation', { name: 'Navegación móvil' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Reportar', exact: true }), null);
  assert.equal(screen.queryByRole('button', { name: 'Encontrar mi ruta' }), null);
  assert.ok(
    screen.getByRole('button', { name: 'Salir del modo parada' }),
    'A personal kiosk preview can be exited.',
  );
  const favorite = screen.getByRole('button', {
    name: 'Guardar estación Padre Mier',
  }) as HTMLButtonElement;
  assert.equal(favorite.disabled, true);
  await user.click(favorite);
  assert.equal(localStorage.getItem('regiomovil:favorites'), null);
  await user.click(screen.getByRole('button', { name: 'Cambiar estación' }));
  const selector = screen.getByRole('dialog');
  await user.type(
    within(selector).getByRole('textbox', { name: 'Buscar punto de partida' }),
    'Fundidora',
  );
  await user.click(within(selector).getByRole('button', { name: /Arena Monterrey Monterrey/ }));
  await screen.findByRole('heading', { name: 'Arena Monterrey', level: 1 });
  assert.equal(
    localStorage.getItem('regiomovil:station'),
    '"universidad"',
    'A kiosk must not overwrite the personal saved station.',
  );
  await user.click(screen.getAllByRole('button', { name: 'Escuchar información', exact: true })[0]);
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /Datos de demostración, no son arribos reales/);
});

test('a late response from a closed report cannot close or erase a new draft', async () => {
  await mount();
  await user.click(screen.getByRole('button', { name: 'Reportar', exact: true }));
  await screen.findByRole('textbox', { name: 'Título' });
  let dialog = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
  const oldText = 'Observé saturación al abordar en esta estación durante la mañana.';
  await user.type(within(dialog).getByRole('textbox', { name: 'Título' }), 'Saturación al abordar');
  await user.type(within(dialog).getByRole('textbox', { name: /Cuéntanos un poco/ }), oldText);
  holdReports = true;
  await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte al piloto' }));
  await waitFor(() => assert.equal(heldRequests.length, 1));
  await closeDialog();
  await user.click(screen.getByRole('button', { name: 'Reportar', exact: true }));
  await screen.findByRole('textbox', { name: 'Título' });
  dialog = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
  const newText = 'Este borrador nuevo describe una puerta y todavía no se ha enviado.';
  await user.type(within(dialog).getByRole('textbox', { name: 'Título' }), 'Borrador nuevo');
  await user.type(within(dialog).getByRole('textbox', { name: /Cuéntanos un poco/ }), newText);
  await act(async () => {
    holdReports = false;
    heldRequests.splice(0).forEach((release) => release());
    await waitFor(() =>
      assert.ok(
        completedRequests.some(
          (request) => request.path === '/api/reports' && request.method === 'POST',
        ),
      ),
    );
  });
  const current = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
  assert.equal(
    (within(current).getByRole('textbox', { name: /Cuéntanos un poco/ }) as HTMLTextAreaElement)
      .value,
    newText,
  );
  assert.equal(
    screen.queryByRole('status'),
    null,
    'A previous report must not announce success for the new draft.',
  );
  assert.equal(
    (within(current).getByRole('button', { name: 'Enviar reporte al piloto' }) as HTMLButtonElement)
      .disabled,
    false,
  );
  assert.equal(application.store.get(submittedReports[0].id).detail, oldText);
  assert.equal(submittedReports.length, 1, 'The new private draft must not have been submitted.');
});

test('opening the current station from home resets a previous line filter', async () => {
  await mount();
  await navigate('Red de transporte');
  await user.click(screen.getByRole('tab', { name: 'Estaciones de Metro' }));
  const line = screen.getByRole('combobox', { name: 'Línea de Metro' }) as HTMLSelectElement;
  await user.selectOptions(line, 'L1');
  assert.equal(line.value, 'L1');
  assert.equal(
    screen.queryByRole('button', { name: 'Padre Mier Monterrey Línea 2', exact: true }),
    null,
  );
  await navigate('Mi camino');
  await user.click(screen.getByRole('button', { name: 'Ver estación', exact: true }));
  assert.equal(
    (screen.getByRole('combobox', { name: 'Línea de Metro' }) as HTMLSelectElement).value,
    'all',
  );
  assert.equal(screen.queryByRole('list', { name: 'Estaciones' }), null);
  assert.ok(screen.getByRole('heading', { name: 'Padre Mier', exact: true }));
});

test('a locked public kiosk never reads personal station, journeys or favorites and has no exit control', async () => {
  localStorage.setItem('regiomovil:station', '"universidad"');
  localStorage.setItem('regiomovil:favorites', '["padre-mier"]');
  localStorage.setItem('regiomovil:journeys', '[{"from":"sendero","to":"universidad"}]');
  const prototype = Object.getPrototypeOf(localStorage);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getItem')!;
  const read = prototype.getItem;
  const keys: string[] = [];
  Object.defineProperty(prototype, 'getItem', {
    ...descriptor,
    value: function (key: string) {
      keys.push(key);
      return read.call(this, key);
    },
  });
  try {
    await mount('?kiosk=1&locked=1');
    assert.ok(screen.getByRole('heading', { name: 'Padre Mier', level: 1 }));
    assert.equal(screen.queryByRole('button', { name: 'Salir del modo parada' }), null);
    assert.equal(screen.queryByRole('navigation', { name: 'Navegación principal' }), null);
    assert.equal(screen.queryByRole('button', { name: 'Reportar', exact: true }), null);
    const favorite = screen.getByRole('button', {
      name: 'Guardar estación Padre Mier',
    }) as HTMLButtonElement;
    assert.equal(favorite.disabled, true);
    assert.equal(favorite.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(
      keys.filter((key) =>
        ['regiomovil:station', 'regiomovil:favorites', 'regiomovil:journeys'].includes(key),
      ),
      [],
    );
    assert.equal(read.call(localStorage, 'regiomovil:station'), '"universidad"');
    assert.equal(read.call(localStorage, 'regiomovil:favorites'), '["padre-mier"]');
    assert.ok(screen.getByRole('button', { name: 'Cambiar estación' }));
  } finally {
    Object.defineProperty(prototype, 'getItem', descriptor);
  }
});

test('returning to a visible document refreshes the board immediately without waiting for its interval', async () => {
  await mount();
  const initial = requests.filter((request) => request.path.startsWith('/api/board')).length;
  let hidden = true;
  const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  try {
    await act(async () => {
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
    });
    assert.equal(
      requests.filter((request) => request.path.startsWith('/api/board')).length,
      initial,
    );
    await act(async () => {
      hidden = false;
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
    });
    await waitFor(() =>
      assert.equal(
        requests.filter((request) => request.path.startsWith('/api/board')).length,
        initial + 1,
      ),
    );
    await waitFor(() =>
      assert.equal(
        completedRequests.filter((request) => request.path === '/api/board').length,
        initial + 1,
      ),
    );
    assert.equal(
      screen.getAllByRole('button', { name: /llegada simulada.*Ver detalles/ }).length,
      2,
    );
  } finally {
    if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
    else Reflect.deleteProperty(document, 'hidden');
  }
});

test('context information remains available without a second brand header and restores focus', async () => {
  await mount();
  assert.ok(document.querySelector('.topbar .brand'));
  await user.click(
    mainNavigation().getByRole('button', { name: 'Red de transporte', exact: true }),
  );
  assert.equal(document.querySelector('.topbar .brand'), null);
  const menu = screen.getByLabelText('Información y avisos').closest('details')!;
  await user.click(screen.getByLabelText('Información y avisos'));
  assert.equal(menu.open, true);
  await user.click(within(menu).getByRole('button', { name: 'Datos y simulación' }));
  assert.equal(menu.open, false);
  await screen.findByRole('dialog', { name: 'Datos claros, decisiones propias' });
  await closeDialog();
  assert.ok(document.activeElement === menu.querySelector('summary'));
  await user.click(screen.getByLabelText('Información y avisos'));
  await user.keyboard('{Escape}');
  assert.equal(menu.open, false);
});

test('a saved bus stop opens as the planning origin without an invented destination', async () => {
  const data = JSON.parse(
    await readFile(new URL('../public/mobility-network.json', import.meta.url), 'utf8'),
  );
  const stop = data.stops.find((item: { mode: string }) => item.mode === 'bus');
  localStorage.setItem('regiomovil:favorites', JSON.stringify([stop.id]));
  localStorage.setItem(
    'regiomovil:favoriteStops',
    JSON.stringify([
      { id: stop.id, stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, kind: 'bus' },
    ]),
  );
  await mount();
  await user.click(mainNavigation().getByRole('button', { name: 'Mi movilidad', exact: true }));
  const favorite = await screen.findByRole('button', { name: stop.name, exact: true });
  await user.click(favorite);
  assert.ok(await screen.findByRole('button', { name: `Origen: ${stop.name}`, exact: true }));
  assert.ok(screen.getByRole('button', { name: 'Destino: Elige un punto', exact: true }));
  assert.equal(
    screen.getByRole('button', { name: 'Buscar rutas', exact: true }).hasAttribute('disabled'),
    true,
  );
});

for (const retired of [false, true]) {
  test(`a saved bus stop ${retired ? 'removed from the current network asks for another origin' : 'keeps its official origin'} offline`, async () => {
    const data = JSON.parse(
      await readFile(new URL('../public/mobility-network.json', import.meta.url), 'utf8'),
    );
    const currentStop = data.stops.find((item: { mode: string }) => item.mode === 'bus');
    const stop = retired
      ? { ...currentStop, id: 'retired:bus-stop', name: 'Parada retirada' }
      : currentStop;
    localStorage.setItem('regiomovil:favorites', JSON.stringify([stop.id]));
    localStorage.setItem(
      'regiomovil:favoriteStops',
      JSON.stringify([
        {
          id: stop.id,
          stopId: stop.id,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          kind: 'bus',
        },
      ]),
    );
    await mount();
    const previousOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    const previousCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
    const cachedNetwork = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        open: async () => ({
          match: async (path: string) =>
            path === '/mobility-network.json' ? cachedNetwork.clone() : undefined,
        }),
      },
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    failRequests = () => true;
    try {
      await act(async () => window.dispatchEvent(new dom.window.Event('offline')));
      await user.click(mainNavigation().getByRole('button', { name: 'Mi movilidad', exact: true }));
      await user.click(await screen.findByRole('button', { name: stop.name, exact: true }));
      const originName = retired ? 'Elige un punto' : currentStop.name;
      await screen.findByRole('button', { name: `Origen: ${originName}`, exact: true });
      await act(async () => window.dispatchEvent(new dom.window.Event('offline')));
      assert.ok(screen.getByRole('button', { name: `Origen: ${originName}`, exact: true }));
      assert.ok(screen.getByRole('button', { name: 'Destino: Elige un punto', exact: true }));
      assert.equal(
        screen.getByRole('button', { name: 'Buscar rutas', exact: true }).hasAttribute('disabled'),
        true,
      );
      if (retired)
        assert.ok(
          screen.getByText(
            'Esta parada guardada ya no está en la red disponible. Elige otro origen.',
          ),
        );
      else
        assert.equal(
          screen.queryByText(
            'Sin conexión, elige estaciones o paradas oficiales para ambos extremos.',
          ),
          null,
        );
      assert.equal(
        requests.some((request) => request.path.startsWith('/api/places/')),
        false,
      );
    } finally {
      if (previousOnline) Object.defineProperty(navigator, 'onLine', previousOnline);
      else Reflect.deleteProperty(navigator, 'onLine');
      if (previousCaches) Object.defineProperty(globalThis, 'caches', previousCaches);
      else Reflect.deleteProperty(globalThis, 'caches');
    }
  });
}
