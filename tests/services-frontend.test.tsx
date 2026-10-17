/** JSDOM + the real HTTP server. This does not audit browser layout or Android accessibility. */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createApp } from '../server/app.mjs';

const realFetch = globalThis.fetch;
const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
const globals = ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'HTMLElement',
  'HTMLDialogElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Element', 'Node',
  'MutationObserver', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'getComputedStyle'] as const;
const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [...globals, 'caches', 'IS_REACT_ACT_ENVIRONMENT']) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
}
for (const name of globals) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true, configurable: true });
dom.window.scrollTo = () => {};
dom.window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {},
  removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
// JSDOM lacks the dialog top layer; these stubs expose only its open state.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

const cachedResponses = new Map<string, Response>();
const cacheKey = (input: string | { url: string }) => new URL(typeof input === 'string' ? input : input.url, dom.window.location.origin).href;
Object.defineProperty(globalThis, 'caches', { configurable: true, value: {
  async open() { return {
    async keys() { return [...cachedResponses.keys()].map(url => ({ url })); },
    async put(input: string, response: Response) { cachedResponses.set(cacheKey(input), response.clone()); },
    async match(input: string) { return cachedResponses.get(cacheKey(input))?.clone(); },
    async delete(input: { url: string }) { return cachedResponses.delete(cacheKey(input)); },
  }; },
} });

// App and Testing Library must see the DOM before their modules are initialized.
const { render, cleanup, screen, within, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: App } = await import('../src/App');
const { default: TransitCatalog } = await import('../src/components/TransitCatalog');
let application: ReturnType<typeof createApp>;
let server: Server;
let base = '';
let offline = false;
let user: ReturnType<typeof userEvent.setup>;
const requests: string[] = [];
const plannedLines: string[] = [];

before(async () => {
  const network = JSON.parse(await readFile(new URL('../data/network.json', import.meta.url), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('../public/transit-catalog.json', import.meta.url), 'utf8'));
  application = createApp({ network, catalog, distPath: fileURLToPath(new URL('../dist/', import.meta.url)),
    now: () => new Date('2026-10-15T18:00:00.000Z') });
  server = createServer(application.handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, base);
    requests.push(url.pathname + url.search);
    if (offline) throw new TypeError('Offline in this test');
    return realFetch(url, init);
  };
});
beforeEach(() => {
  requests.length = 0;
  plannedLines.length = 0;
  cachedResponses.clear();
  offline = false;
  dom.window.localStorage.clear();
  dom.window.history.replaceState({}, '', '/');
  dom.window.document.documentElement.className = '';
  user = userEvent.setup({ document: dom.window.document, delay: null });
});
afterEach(async () => {
  // Flush React's scheduled work before the suite restores the DOM globals.
  await act(async () => cleanup());
});
after(async () => {
  cleanup();
  globalThis.fetch = realFetch;
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  application?.close();
  dom.window.close();
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

async function mountCatalog() {
  render(<TransitCatalog onPlanLine={id => plannedLines.push(id)} />);
  await screen.findByText('214 rutas · 6 redes');
}
async function filterNetwork(id: string) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar rutas por red' }), id);
}
async function search(query: string) {
  const input = screen.getByRole('searchbox', { name: 'Buscar ruta, ramal o municipio' });
  await user.clear(input);
  await user.type(input, query);
}
async function openRoute(code: string, name = '') {
  await user.click(screen.getByRole('button', { name: label => label.startsWith(`Ver ruta ${code}:`) && label.includes(name) }));
  return screen.getByRole('dialog');
}
async function closeDetails() {
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar ventana' }));
}
function assertNoTravelAction(dialog: HTMLElement) {
  assert.equal(within(dialog).queryByRole('button', { name: 'Planear esta línea' }), null);
  assert.equal(within(dialog).queryByRole('button', { name: /llegada simulada/ }), null);
  assert.deepEqual(plannedLines, []);
}

test('App exposes Rutas y redes, filters seven RegioRuta services and loads maps only on demand', async () => {
  render(<App />);
  await screen.findByText('API conectada');
  assert.ok(!requests.some(path => path.startsWith('/transit-catalog.json')));
  const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  await user.click(navigation.getByRole('button', { name: 'Estaciones', exact: true }));
  screen.getByRole('tab', { name: 'Estaciones de Metro' }).focus();
  await user.keyboard('{ArrowRight}');
  await screen.findByText('214 rutas · 6 redes');
  assert.equal(document.querySelectorAll('.service-card').length, 24, 'The full catalog is paginated in the UI.');
  assert.equal(screen.getByRole('tab', { name: /Rutas y redes/ }).getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, screen.getByRole('tab', { name: /Rutas y redes/ }));
  assert.equal(screen.getByRole('tab', { name: 'Estaciones de Metro' }).tabIndex, -1);
  await filterNetwork('regioruta');
  assert.ok(screen.getByText('7 rutas · 6 redes'));
  assert.equal(document.querySelectorAll('.service-card').length, 7);
  assert.ok(screen.getByRole('button', { name: /^Ver ruta G:/ }));
  assert.ok(!requests.some(path => path.startsWith('/route-packs/')), 'Consulting a list must not download all route packs.');
});

test('route search combines route number and accent-free municipality and can recover from no matches', async () => {
  await mountCatalog();
  await search('223 Juárez');
  assert.ok(screen.getByText('3 rutas · 6 redes'));
  assert.equal(document.querySelectorAll('.service-card').length, 3);
  assert.ok(screen.getByRole('button', { name: /223:.*Teofilo Salinas Eloy Cavazos/ }));
  assert.ok(screen.getByRole('button', { name: /223:.*Huertos Portal de Juarez/ }));
  await search('223 juarez inexistente');
  assert.ok(screen.getByRole('heading', { name: 'No encontramos esa ruta.' }));
  await user.click(screen.getByRole('button', { name: /Mostrar todas las rutas/ }));
  assert.ok(screen.getByText('214 rutas · 6 redes'));
  assert.ok(!requests.some(path => path.startsWith('/route-packs/')));
});

test('RegioRuta A keeps the unknown publication date and official sources and reopens its cached map offline', async () => {
  await mountCatalog();
  await filterNetwork('regioruta');
  let dialog = await openRoute('A');
  await within(dialog).findByRole('img', { name: /Recorrido publicado.*93 puntos de referencia/ });
  assert.ok(within(dialog).getByText('Fecha del dato: Fecha no indicada. Consulta la fuente para confirmar cambios.'));
  assert.ok(within(dialog).getByText(/El orden operativo de las paradas no está verificado/));
  assertNoTravelAction(dialog);
  const sourceLinks = within(dialog).getAllByRole('link').map(link => link.getAttribute('href'));
  assert.ok(sourceLinks.includes('https://www.monterrey.gob.mx/regio-ruta/'));
  assert.ok(sourceLinks.includes('https://www.google.com/maps/d/viewer?mid=1e1JycXnZrFLm5OR0wkNmMxluVo4e_Cw'));
  await waitFor(() => assert.ok([...cachedResponses.keys()].some(url => /\/route-packs\/regioruta-a\.json\?v=/.test(url))));
  assert.ok([...cachedResponses.keys()].some(url => url.endsWith('/transit-catalog.json')));
  cleanup();
  offline = true;
  await mountCatalog();
  await filterNetwork('regioruta');
  dialog = await openRoute('A');
  await within(dialog).findByRole('img', { name: /Recorrido publicado.*93 puntos de referencia/ });
  assert.equal(within(dialog).queryByRole('alert'), null, 'A previously opened map remains available offline.');
  assertNoTravelAction(dialog);
});

test('L4 and L6 construction details expose dated references without maps, arrivals or planning', async () => {
  await mountCatalog();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar rutas por estado' }), 'construction');
  assert.ok(screen.getByText('2 rutas · 6 redes'));
  for (const [code, references, endpoint] of [['L4', 7, 'Tren del Norte'], ['L6', 15, 'Aeropuerto']] as const) {
    const dialog = await openRoute(code);
    assert.ok(within(dialog).getByText('En construcción'));
    assert.ok(within(dialog).getByText('Fecha del dato: 2026-10-12. Consulta la fuente para confirmar cambios.'));
    assert.ok(within(dialog).getByText(/No hay arribos ni viajes disponibles para planear/));
    const list = within(dialog).getByRole('list');
    assert.equal(within(list).getAllByRole('listitem').length, references);
    assert.ok(within(list).getByText(endpoint));
    assert.equal(within(dialog).queryByRole('img', { name: /Mapa|Recorrido/ }), null);
    assert.ok(within(dialog).getByRole('link', { name: /Muy pronto Nuevo León estrenará el nuevo Metro/ }));
    assertNoTravelAction(dialog);
    await closeDetails();
  }
  assert.ok(!requests.some(path => /\/route-packs\/|\/api\/plan|\/api\/board/.test(path)));
});

test('RegioRuta E draws its two published segments separately without a fabricated joining line', async () => {
  await mountCatalog();
  await filterNetwork('regioruta');
  const dialog = await openRoute('E');
  const map = await within(dialog).findByRole('img', { name: /Recorrido publicado.*60 puntos de referencia/ });
  const paths = [...map.querySelectorAll('polyline[stroke="#256f4d"]')];
  assert.equal(paths.length, 2, 'Both source segments must remain separate SVG polylines.');
  assert.deepEqual(paths.map(path => path.getAttribute('points')!.trim().split(/\s+/).length), [125, 33]);
  assert.equal(map.querySelectorAll('circle[stroke="#256f4d"]').length, 60);
  assert.ok(within(dialog).getByText(/dos trazos separados/));
  assertNoTravelAction(dialog);
});

test('route 223 Eloy Cavazos renders 203 published points and explains experimental routing with inferred stop order', async () => {
  await mountCatalog();
  await search('223 Eloy Cavazos');
  assert.ok(screen.getByText('1 ruta · 6 redes'));
  const dialog = await openRoute('223', 'Eloy Cavazos');
  const map = await within(dialog).findByRole('img', { name: /Recorrido publicado.*203 puntos de referencia/ });
  assert.equal(map.querySelectorAll('circle[stroke="#256f4d"]').length, 203);
  assert.ok(within(dialog).getByText(/Trazo y 203 puntos publicados/));
  assert.ok(within(dialog).getByText(/El planificador experimental usa este recorrido con orden y sentidos inferidos del mapa/));
  assert.ok(within(dialog).getByText(/El orden operativo de las paradas no está verificado/));
  assert.ok(within(dialog).getByText('Fecha del dato: 2025-09-30. Consulta la fuente para confirmar cambios.'));
  assert.ok(within(dialog).getByText(/Boletín de enero de 2026 confirma renovación/));
  assert.ok(within(dialog).getByRole('link', { name: /Renovación de ramales 223 Teófilo Salinas/ }));
  assert.ok(requests.some(path => /^\/route-packs\/ima-223-teofilo-eloy-cavazos\.json\?v=/.test(path)));
  assertNoTravelAction(dialog);
});
