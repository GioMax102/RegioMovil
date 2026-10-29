/** JSDOM + the real HTTP server. This does not audit browser layout or Android accessibility. */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createApp } from '../server/app.mjs';

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
for (const name of [...globals, 'caches', 'IS_REACT_ACT_ENVIRONMENT']) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
}
for (const name of globals) {
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
// JSDOM lacks the dialog top layer; these stubs expose only its open state.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};

const cachedResponses = new Map<string, Response>();
const cacheKey = (input: string | { url: string }) =>
  new URL(typeof input === 'string' ? input : input.url, dom.window.location.origin).href;
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

const sourceHooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});

// App and Testing Library must see the DOM before their modules are initialized.
const { render, cleanup, screen, within, waitFor, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: App } = await import('../src/App');
const { default: TransitCatalog } = await import('../src/components/TransitCatalog');
const { default: NetworkExplorer } = await import('../src/components/NetworkExplorer');
let application: ReturnType<typeof createApp>;
let server: Server;
let base = '';
let offline = false;
let user: ReturnType<typeof userEvent.setup>;
const requests: string[] = [];
const plannedLines: string[] = [];

before(async () => {
  const network = JSON.parse(
    await readFile(new URL('../data/network.json', import.meta.url), 'utf8'),
  );
  const catalog = JSON.parse(
    await readFile(new URL('../public/transit-catalog.json', import.meta.url), 'utf8'),
  );
  application = createApp({
    network,
    catalog,
    distPath: fileURLToPath(new URL('../dist/', import.meta.url)),
    now: () => new Date('2026-10-15T18:00:00.000Z'),
  });
  server = createServer(application.handler);
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
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  application?.close();
  sourceHooks.deregister();
  dom.window.close();
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

async function mountCatalog() {
  render(<TransitCatalog onPlanLine={(id) => plannedLines.push(id)} />);
  await screen.findByText('214 rutas · 6 redes');
}
async function openCatalog() {
  const toggle = screen.queryByRole('button', { name: 'Rutas y sistemas', exact: true });
  if (toggle) await user.click(toggle);
}
async function filterNetwork(id: string) {
  await openCatalog();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar rutas por red' }), id);
}
async function search(query: string) {
  const input = screen.getByRole('searchbox', { name: 'Buscar ruta, ramal o municipio' });
  await user.clear(input);
  await user.type(input, query);
}
function assert223JuarezResults() {
  assert.ok(screen.getByText('8 rutas · 6 redes'));
  assert.deepEqual(
    [...document.querySelectorAll('.service-card h3')].map((heading) => heading.textContent).sort(),
    [
      'Ruta 223 Alimentadora Seminario Las Torres Exposicion',
      'Ruta 223 Directa Evolucion',
      'Ruta 223 Directa Huertos',
      'Ruta 223 Directa Huertos Portal de Juarez',
      'Ruta 223 Directa San Francisco Felix U. Gomez',
      'Ruta 223 Directa Teofilo Salinas Eloy Cavazos',
      'Ruta 223 Directa Teofilo Salinas Gine',
      'Ruta 223 Remanente Monteverde Exposicion',
    ].sort(),
    'The geometry import adds municipality evidence for eight distinct 223 variants; the search must return each one.',
  );
}
async function openRoute(code: string, name = '') {
  await user.click(
    screen.getByRole('button', {
      name: (label) => label.startsWith(`Ver ruta ${code}:`) && label.includes(name),
    }),
  );
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByText('Información y fuentes', { selector: 'summary' }));
  return dialog;
}
async function closeDetails() {
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar ventana' }),
  );
}
function assertNoTravelAction(dialog: HTMLElement) {
  assert.equal(within(dialog).queryByRole('button', { name: 'Planear esta línea' }), null);
  assert.equal(within(dialog).queryByRole('button', { name: /llegada simulada/ }), null);
  assert.deepEqual(plannedLines, []);
}

test('Red can retry its public map document after a connection failure without leaving the section', async () => {
  offline = true;
  render(<NetworkExplorer onPlanLine={() => {}} />);
  await screen.findByText('El mapa no está disponible. Puedes consultar las fichas de las rutas.');
  assert.equal(screen.queryByRole('group', { name: /^Mapa interactivo/ }), null);
  offline = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar mapa', exact: true }));
  await screen.findByRole('combobox', { name: 'Buscar recorrido en el mapa' });
  assert.ok(await screen.findByRole('group', { name: /^Mapa interactivo/ }));
  assert.equal(screen.queryByRole('button', { name: 'Reintentar mapa', exact: true }), null);
});

test('a network-module recovery link resumes Red instead of returning to Inicio', async () => {
  dom.window.history.replaceState({}, '', '/?page=stations');
  render(<App />);
  await screen.findByRole('tab', { name: /Rutas y redes/ });
  await screen.findByText('214 rutas · 6 redes');
  assert.equal(
    screen.getByRole('tab', { name: /Rutas y redes/ }).getAttribute('aria-selected'),
    'true',
  );
  assert.equal(screen.queryByRole('heading', { name: 'Muévete con más calma.' }), null);
});

test('App exposes Rutas y redes, filters seven RegioRuta services and loads maps only on demand', async () => {
  render(<App />);
  await screen.findByText('En línea');
  assert.ok(!requests.some((path) => path.startsWith('/transit-catalog.json')));
  const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
  await user.click(navigation.getByRole('button', { name: 'Red de transporte', exact: true }));
  await user.click(screen.getByRole('tab', { name: 'Estaciones de Metro' }));
  screen.getByRole('tab', { name: 'Estaciones de Metro' }).focus();
  await user.keyboard('{ArrowRight}');
  await screen.findByText('214 rutas · 6 redes');
  assert.equal(
    document.querySelectorAll('.service-card').length,
    24,
    'The full catalog is paginated in the UI.',
  );
  assert.equal(
    screen.getByRole('tab', { name: /Rutas y redes/ }).getAttribute('aria-selected'),
    'true',
  );
  assert.equal(document.activeElement, screen.getByRole('tab', { name: /Rutas y redes/ }));
  assert.equal(screen.getByRole('tab', { name: 'Estaciones de Metro' }).tabIndex, -1);
  await filterNetwork('regioruta');
  assert.ok(screen.getByText('7 rutas · 6 redes'));
  assert.equal(document.querySelectorAll('.service-card').length, 7);
  assert.ok(screen.getByRole('button', { name: /^Ver ruta G:/ }));
  assert.ok(
    !requests.some((path) => path.startsWith('/route-packs/')),
    'Consulting a list must not download all route packs.',
  );
});

test('route search combines route number and accent-free municipality and can recover from no matches', async () => {
  await mountCatalog();
  await search('223 Juárez');
  assert223JuarezResults();
  assert.ok(screen.getByRole('button', { name: /223:.*Teofilo Salinas Eloy Cavazos/ }));
  assert.ok(screen.getByRole('button', { name: /223:.*Huertos Portal de Juarez/ }));
  await search('223 juarez inexistente');
  assert.ok(screen.getByRole('heading', { name: 'No encontramos esa ruta.' }));
  await user.click(screen.getByRole('button', { name: /Mostrar todas las rutas/ }));
  assert.ok(screen.getByText('214 rutas · 6 redes'));
  assert.ok(!requests.some((path) => path.startsWith('/route-packs/')));
});

test('RegioRuta A keeps the unknown publication date and official sources and reopens its cached map offline', async () => {
  await mountCatalog();
  await filterNetwork('regioruta');
  let dialog = await openRoute('A');
  await within(dialog).findByRole('img', { name: /Recorrido publicado.*93 puntos de referencia/ });
  assert.ok(
    within(dialog).getByText(
      'Fecha del dato: Fecha no indicada. Consulta la fuente para confirmar cambios.',
    ),
  );
  assert.ok(within(dialog).getByText(/El orden operativo de las paradas no está verificado/));
  assertNoTravelAction(dialog);
  const sourceLinks = within(dialog)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));
  assert.ok(sourceLinks.includes('https://www.monterrey.gob.mx/regio-ruta/'));
  assert.ok(
    sourceLinks.includes(
      'https://www.google.com/maps/d/viewer?mid=1e1JycXnZrFLm5OR0wkNmMxluVo4e_Cw',
    ),
  );
  await waitFor(() =>
    assert.ok(
      [...cachedResponses.keys()].some((url) => /\/route-packs\/regioruta-a\.json\?v=/.test(url)),
    ),
  );
  assert.ok([...cachedResponses.keys()].some((url) => url.endsWith('/transit-catalog.json')));
  cleanup();
  offline = true;
  await mountCatalog();
  await filterNetwork('regioruta');
  dialog = await openRoute('A');
  await within(dialog).findByRole('img', { name: /Recorrido publicado.*93 puntos de referencia/ });
  assert.ok(
    !within(dialog).queryByRole('button', { name: 'Reintentar mapa' }),
    'A previously opened map remains available offline; the report feed has its own connection state.',
  );
  assert.match(
    within(dialog).getByRole('alert').textContent || '',
    /No pudimos consultar los reportes/,
    'Public community reports are not cached together with route geometry.',
  );
  assertNoTravelAction(dialog);
});

test('L4 and L6 construction details expose dated references without maps, arrivals or planning', async () => {
  await mountCatalog();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Filtrar rutas por estado' }),
    'construction',
  );
  assert.ok(screen.getByText('2 rutas · 6 redes'));
  for (const [code, references, endpoint] of [
    ['L4', 7, 'Tren del Norte'],
    ['L6', 15, 'Aeropuerto'],
  ] as const) {
    const dialog = await openRoute(code);
    assert.ok(within(dialog).getByText('En construcción'));
    assert.ok(
      within(dialog).getByText(
        'Fecha del dato: 2026-10-12. Consulta la fuente para confirmar cambios.',
      ),
    );
    assert.ok(within(dialog).getByText(/No hay arribos ni viajes disponibles para planear/));
    await user.click(
      within(dialog).getByText(/^Estaciones de referencia/, { selector: 'summary' }),
    );
    const list = within(dialog).getByRole('list');
    assert.equal(within(list).getAllByRole('listitem').length, references);
    assert.ok(within(list).getByText(endpoint));
    assert.equal(within(dialog).queryByRole('img', { name: /Mapa|Recorrido/ }), null);
    assert.ok(
      within(dialog).getByRole('link', { name: /Muy pronto Nuevo León estrenará el nuevo Metro/ }),
    );
    assertNoTravelAction(dialog);
    await closeDetails();
  }
  assert.ok(!requests.some((path) => /\/route-packs\/|\/api\/plan|\/api\/board/.test(path)));
});

test('RegioRuta E draws its two published segments separately without a fabricated joining line', async () => {
  await mountCatalog();
  await filterNetwork('regioruta');
  const dialog = await openRoute('E');
  const map = await within(dialog).findByRole('img', {
    name: /Recorrido publicado.*60 puntos de referencia/,
  });
  const paths = [...map.querySelectorAll('polyline[stroke="#256f4d"]')];
  assert.equal(paths.length, 2, 'Both source segments must remain separate SVG polylines.');
  assert.deepEqual(
    paths.map((path) => path.getAttribute('points')!.trim().split(/\s+/).length),
    [125, 33],
  );
  assert.equal(map.querySelectorAll('circle[stroke="#256f4d"]').length, 60);
  assert.ok(within(dialog).getByText(/dos trazos separados/));
  assertNoTravelAction(dialog);
});

test('route 223 Eloy Cavazos renders 203 published points and explains experimental routing with inferred stop order', async () => {
  await mountCatalog();
  await search('223 Eloy Cavazos');
  assert.ok(screen.getByText('1 ruta · 6 redes'));
  const dialog = await openRoute('223', 'Eloy Cavazos');
  const map = await within(dialog).findByRole('img', {
    name: /Recorrido publicado.*203 puntos de referencia/,
  });
  assert.equal(map.querySelectorAll('circle[stroke="#256f4d"]').length, 203);
  assert.ok(within(dialog).getByText(/Trazo y 203 puntos publicados/));
  assert.ok(
    within(dialog).getByText(
      /El planificador experimental usa este recorrido con orden y sentidos inferidos del mapa/,
    ),
  );
  assert.ok(within(dialog).getByText(/El orden operativo de las paradas no está verificado/));
  assert.ok(
    within(dialog).getByText(
      'Fecha del dato: 2025-09-30. Consulta la fuente para confirmar cambios.',
    ),
  );
  assert.ok(within(dialog).getByText(/Boletín de enero de 2026 confirma renovación/));
  assert.ok(
    within(dialog).getByRole('link', { name: /Renovación de ramales 223 Teófilo Salinas/ }),
  );
  assert.ok(
    requests.some((path) => /^\/route-packs\/ima-223-teofilo-eloy-cavazos\.json\?v=/.test(path)),
  );
  assertNoTravelAction(dialog);
});

test('Red isolates a published route, expands one map and resets the selection when changing systems', async () => {
  render(<App />);
  await screen.findByText('En línea');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('button', {
      name: 'Red de transporte',
      exact: true,
    }),
  );
  const route = await screen.findByRole('combobox', { name: 'Buscar recorrido en el mapa' });
  assert.equal(screen.queryByRole('listbox'), null, 'A closed search must not list every route.');
  await user.type(route, 'linea 1');
  await user.click(await screen.findByRole('option', { name: /L1/ }));
  await waitFor(() => assert.equal(document.querySelectorAll('polyline[data-line]').length, 1));
  assert.ok(document.querySelector('polyline[data-line="L1"]'));
  assert.ok(screen.getByRole('button', { name: 'Metro', exact: true, pressed: true }));
  const information = document.querySelector('.network-coverage-info') as HTMLDetailsElement;
  assert.equal(information.open, false, 'Coverage is available without filling the map with text.');
  assert.ok(screen.getByText(/Mostrando 1 de 3 recorridos/));
  screen.getByRole('group', { name: /^Mapa interactivo/ }).focus();
  await user.keyboard('{Enter}');
  const expanded = document.querySelector('.network-explorer[data-map-screen="true"]') as HTMLElement;
  assert.ok(expanded);
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(within(expanded).getByRole('group', { name: /^Mapa interactivo/ }));
  assert.equal(
    document.querySelectorAll('.location-map-canvas').length,
    1,
    'Expansion does not render a second expensive map behind the dialog.',
  );
  assert.equal(document.body.style.overflow, 'hidden');
  await user.click(within(expanded).getByRole('button', { name: 'Salir del mapa a pantalla completa' }));
  await waitFor(() => assert.equal(expanded.getAttribute('data-map-screen'), 'false'));
  assert.equal(document.body.style.overflow, '');
  assert.equal(
    (screen.getByRole('combobox', { name: 'Buscar recorrido en el mapa' }) as HTMLInputElement)
      .value,
    'L1 · Línea 1',
  );
  await user.click(
    within(screen.getByRole('group', { name: 'Sistema en el mapa y catálogo' })).getByRole(
      'button',
      { name: 'RegioRuta', exact: true },
    ),
  );
  assert.equal(
    (screen.getByRole('combobox', { name: 'Buscar recorrido en el mapa' }) as HTMLInputElement)
      .value,
    '',
  );
  assert.equal(document.querySelector('polyline[data-line="L1"]'), null);
  assert.ok(screen.getByText('7 rutas · 6 redes'));
});

test('map route search opens a compact source-backed detail while the catalog stays collapsed', async () => {
  render(<NetworkExplorer onPlanLine={() => {}} />);
  const search = await screen.findByRole('combobox', { name: 'Buscar recorrido en el mapa' });
  await screen.findByRole('group', { name: /^Mapa interactivo/ });
  assert.equal(
    document.querySelector('.network-catalog-sheet')?.getAttribute('data-open'),
    'false',
  );
  assert.equal(screen.queryByRole('listbox'), null);
  await user.type(search, 'linea 1');
  await user.click(await screen.findByRole('option', { name: /L1/ }));
  await user.click(screen.getByRole('button', { name: 'Ver ficha de L1: Línea 1' }));
  const dialog = await screen.findByRole('dialog', { name: 'L1 · Metrorrey' });
  const information = within(dialog).getByText('Información y fuentes', { selector: 'summary' })
    .parentElement as HTMLDetailsElement;
  assert.equal(information.open, false);
  assert.ok(within(dialog).getByRole('img', { name: /Mapa de Monterrey/ }));
  await user.click(information.querySelector('summary')!);
  assert.ok(within(dialog).getByText(/tiempos del piloto son simulados/));
  assert.ok(within(dialog).getAllByRole('link').length > 0);
  await closeDetails();
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(
    document.querySelector('.network-catalog-sheet')?.getAttribute('data-open'),
    'false',
  );
});

test('map route suggestions support keyboard selection without a dangling ARIA reference or replacing the map', async () => {
  render(<NetworkExplorer onPlanLine={() => {}} />);
  const search = await screen.findByRole('combobox', { name: 'Buscar recorrido en el mapa' });
  const map = await screen.findByRole('group', { name: /^Mapa interactivo/ });
  assert.equal(search.getAttribute('aria-controls'), null);
  await user.type(search, 'linea');
  const results = screen.getByRole('listbox', { name: 'Recorridos encontrados' });
  assert.equal(search.getAttribute('aria-controls'), results.id);
  await user.keyboard('{ArrowDown}{ArrowDown}');
  const focusedOption = document.getElementById(search.getAttribute('aria-activedescendant')!);
  assert.ok(focusedOption?.textContent?.includes('L2'));
  assert.equal(focusedOption.getAttribute('aria-selected'), 'true');
  await user.keyboard('{Enter}');
  await waitFor(() => assert.ok(document.querySelector('polyline[data-line="L2"]')));
  assert.equal(search.getAttribute('aria-controls'), null);
  assert.equal(search.getAttribute('aria-activedescendant'), null);
  await openCatalog();
  assert.equal(document.querySelector('.network-catalog-sheet')?.getAttribute('data-open'), 'true');
  assert.equal(
    screen.getByRole('group', { name: /^Mapa interactivo/ }),
    map,
    'The catalog overlays the existing map instead of remounting it.',
  );
});

test('map search discovers a catalog service without geometry and opens its source instead of an empty map', async () => {
  render(<NetworkExplorer onPlanLine={(id) => plannedLines.push(id)} />);
  const searchInput = await screen.findByRole('combobox', { name: 'Buscar recorrido en el mapa' });
  const map = await screen.findByRole('group', { name: /^Mapa interactivo/ });
  await screen.findByText('214 rutas · 6 redes');
  await user.type(searchInput, '5 Estanzuela Los Cristales');
  await user.click(
    await screen.findByRole('option', { name: /5.*Estanzuela.*Los Cristales.*Trazo pendiente/ }),
  );
  const dialog = await screen.findByRole('dialog', { name: /5 ·/ });
  assert.ok(within(dialog).getByText('Trazo pendiente'));
  assert.ok(within(dialog).getByRole('link', { name: 'Consultar fuente oficial' }));
  assert.equal(within(dialog).queryByRole('img', { name: /Mapa|Recorrido/ }), null);
  assertNoTravelAction(dialog);
  assert.equal(document.querySelectorAll('.location-map-canvas').length, 1);
  assert.equal(screen.getByRole('group', { name: /^Mapa interactivo/, hidden: true }), map);
  await closeDetails();
  assert.equal(document.activeElement, searchInput);
  assert.ok(screen.getByRole('button', { name: /Ver ficha de 5:/ }));
  assert.ok(!requests.some((path) => path.startsWith('/route-packs/')));
});

test('catalog slides from its bar without trapping focus, closes with Escape and preserves filters and scroll', async () => {
  render(<NetworkExplorer onPlanLine={() => {}} />);
  await screen.findByText('214 rutas · 6 redes');
  const toggle = screen.getByRole('button', { name: 'Rutas y sistemas', exact: true });
  const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  const map = await screen.findByRole('group', { name: /^Mapa interactivo/ });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(panel.hasAttribute('inert'));
  await user.click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hasAttribute('inert'), false);
  assert.equal(
    document.activeElement,
    screen.getByRole('searchbox', { name: 'Buscar ruta, ramal o municipio' }),
  );
  assert.equal(document.body.style.position, '', 'This is an in-page region, not a modal.');
  await user.type(document.activeElement as HTMLInputElement, '223 juarez');
  assert223JuarezResults();
  panel.scrollTop = 210;
  await user.keyboard('{Escape}');
  assert.equal(document.activeElement, toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(panel.hasAttribute('inert'));
  assert.equal(panel.getAttribute('aria-hidden'), 'true');
  await user.click(toggle);
  assert.equal(panel.scrollTop, 210);
  assert.equal(
    (screen.getByRole('searchbox', { name: 'Buscar ruta, ramal o municipio' }) as HTMLInputElement)
      .value,
    '223 juarez',
  );
  assert.ok(screen.getByRole('group', { name: /^Mapa interactivo/ }) === map, 'La instancia del mapa se conserva.');
  await user.click(screen.getByRole('button', { name: 'Cerrar catálogo de rutas' }));
  assert.equal(document.activeElement, toggle);
  assert.equal(
    requests.filter((path) => path === '/transit-catalog.json').length,
    1,
    'The explorer and catalog share one public document.',
  );
});

test('broad map searches stay short and hand their complete query to the paginated catalog', async () => {
  render(<NetworkExplorer onPlanLine={() => {}} />);
  await screen.findByText('214 rutas · 6 redes');
  await user.type(screen.getByRole('combobox', { name: 'Buscar recorrido en el mapa' }), 'Ruta');
  assert.equal(screen.getAllByRole('option').length, 8);
  await user.click(screen.getByRole('button', { name: /Ver las .* coincidencias en el catálogo/ }));
  const catalogSearch = screen.getByRole('searchbox', {
    name: 'Buscar ruta, ramal o municipio',
  }) as HTMLInputElement;
  assert.equal(catalogSearch.value, 'Ruta');
  assert.equal(document.activeElement, catalogSearch);
  assert.equal(document.querySelectorAll('.service-card').length, 24);
  await user.click(screen.getByRole('button', { name: /Mostrar más rutas/ }));
  assert.equal(document.querySelectorAll('.service-card').length, 48);
  assert.equal(screen.queryByRole('listbox', { name: 'Recorridos encontrados' }), null);
  assert.ok(!requests.some((path) => path.startsWith('/route-packs/')));
});

test('el mapa ocupa la pantalla con la misma instancia y vuelve con Escape o Atrás sin perder cámara ni filtros', async () => {
  render(<NetworkExplorer onPlanLine={() => {}} />);
  const map = await screen.findByRole('group', { name: /^Mapa interactivo/ });
  await user.click(within(screen.getByRole('group', { name: 'Sistema en el mapa y catálogo' })).getByRole('button', { name: 'Integradas', exact: true }));
  const zoom = screen.getByRole('button', { name: 'Acercar mapa' });
  await user.click(zoom);
  map.focus();
  await user.keyboard('{ArrowRight}');
  const camera = [map.getAttribute('data-map-zoom'), map.getAttribute('data-map-center')];
  const expand = screen.getByRole('button', { name: 'Ampliar mapa a pantalla completa' });
  await user.click(expand);
  const explorer = document.querySelector('.network-explorer')!;
  assert.equal(explorer.getAttribute('data-map-screen'), 'true');
  assert.equal(document.body.dataset.networkMapScreen, 'true');
  assert.equal(screen.queryByRole('dialog'), null, 'No abre una tarjeta ni un segundo mapa.');
  assert.equal(screen.getByRole('group', { name: /^Mapa interactivo/ }), map);
  assert.equal(document.querySelectorAll('.location-map-canvas').length, 1);
  assert.ok(document.querySelector('.network-catalog-sheet')!.hasAttribute('hidden'));
  assert.deepEqual([map.getAttribute('data-map-zoom'), map.getAttribute('data-map-center')], camera);
  assert.ok(document.activeElement === screen.getByRole('button', { name: 'Salir del mapa a pantalla completa' }), 'El foco pasa al control de salida.');
  await user.keyboard('{Escape}');
  await waitFor(() => assert.equal(explorer.getAttribute('data-map-screen'), 'false'));
  assert.equal(document.body.dataset.networkMapScreen, undefined);
  assert.ok(document.activeElement === expand, 'Escape devuelve el foco al control de ampliación.');
  assert.deepEqual([map.getAttribute('data-map-zoom'), map.getAttribute('data-map-center')], camera);
  assert.equal(within(screen.getByRole('group', { name: 'Sistema en el mapa y catálogo' })).getByRole('button', { name: 'Integradas', exact: true }).getAttribute('aria-pressed'), 'true');
  map.focus();
  assert.ok(document.activeElement === map, 'El mapa recibe foco antes de entrar.');
  await user.keyboard('{Enter}');
  assert.equal(explorer.getAttribute('data-map-screen'), 'true');
  await act(async () => window.history.back());
  await waitFor(() => assert.equal(explorer.getAttribute('data-map-screen'), 'false'));
  assert.ok(document.activeElement === map, 'Atrás devuelve el foco al mapa que abrió la vista.');
  assert.deepEqual([map.getAttribute('data-map-zoom'), map.getAttribute('data-map-center')], camera);
});
