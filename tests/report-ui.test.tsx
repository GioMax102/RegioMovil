import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const names = [
  'window',
  'localStorage',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDialogElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
  'File',
  'FileReader',
  'Blob',
] as const;
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of names) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
}
const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
  writable: true,
});
const previousDecode = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
dom.window.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const { render, screen, within, cleanup, waitFor, act, fireEvent } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const styles = registerHooks({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { readReportDraft, clearReportDraft, REPORT_OPEN_KEY } = await import('../src/reportDraft');
const { Dialog } = await import('../src/components/Primitives');
const { default: ReportDialog } = await import('../src/components/ReportDialog');
const { default: PublicReports } = await import('../src/components/PublicReports');
styles.deregister();
const realFetch = globalThis.fetch;
const sent: Record<string, unknown>[] = [];
const catalog = {
  version: 1,
  sources: [],
  networks: [{ id: 'urbanas', name: 'Urbanas' }],
  routes: [
    { id: 'ruta-1-norte', code: '1', name: 'Norte', networkId: 'urbanas' },
    { id: 'ruta-1-sur', code: '1', name: 'Sur', networkId: 'urbanas' },
  ],
};
let handler: (url: URL) => Promise<Response>;
let user: ReturnType<typeof userEvent.setup>;
let onSent = 0;
let deferDecode = false;
let noCanvas = false;
let loseSubmitResponse = false;
let submissionResponse: Response | null = null;
let closedBitmaps: string[] = [];
const decodes = new Map<string, (bitmap: unknown) => void>();
const canvasImages = new WeakMap<HTMLCanvasElement, string>();
function publicFeed(reports: Record<string, unknown>[] = []) {
  const byCategory: Record<string, { total: number; open: number; resolved: number }> = {};
  let resolved = 0;
  for (const report of reports) {
    const category = String(report.category || 'infrastructure');
    const counts = (byCategory[category] ||= { total: 0, open: 0, resolved: 0 });
    counts.total += 1;
    if (report.status === 'resolved') {
      counts.resolved += 1;
      resolved += 1;
    } else counts.open += 1;
  }
  return {
    reports,
    summary: { total: reports.length, open: reports.length - resolved, resolved, byCategory },
  };
}
function bitmap(name: string) {
  return {
    width: 100,
    height: 100,
    label: name,
    close() {
      closedBitmaps.push(name);
    },
  };
}
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  if (noCanvas) return null;
  return {
    fillStyle: '',
    fillRect() {},
    drawImage: (image: { label: string }) => canvasImages.set(this, image.label),
  } as unknown as CanvasRenderingContext2D;
} as typeof dom.window.HTMLCanvasElement.prototype.getContext;
dom.window.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
  callback(
    new dom.window.Blob([canvasImages.get(this) || 'photo'], { type: type || 'image/jpeg' }),
  );
};
beforeEach(async () => {
  const previousDraft = await readReportDraft();
  if (previousDraft) await clearReportDraft(previousDraft.draftId);
  localStorage.clear();
  sent.length = 0;
  onSent = 0;
  deferDecode = false;
  noCanvas = false;
  loseSubmitResponse = false;
  submissionResponse = null;
  closedBitmaps = [];
  decodes.clear();
  user = userEvent.setup({ document: dom.window.document, delay: null });
  handler = async () => Response.json(publicFeed());
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/transit-catalog.json') return Response.json(catalog);
    if (url.pathname === '/api/reports' && init?.method === 'POST') {
      sent.push(JSON.parse(String(init.body)));
      if (loseSubmitResponse) throw new TypeError('The response was lost after storage.');
      if (submissionResponse) return submissionResponse.clone();
      return Response.json({ report: { id: 'created', status: 'pending' } }, { status: 201 });
    }
    return handler(url);
  };
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: (file: File) =>
      deferDecode
        ? new Promise((resolve) => decodes.set(file.name, resolve))
        : Promise.resolve(bitmap(file.name)),
  });
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await readReportDraft();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
after(() => {
  globalThis.fetch = realFetch;
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
  else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  if (previousDecode) Object.defineProperty(globalThis, 'createImageBitmap', previousDecode);
  else Reflect.deleteProperty(globalThis, 'createImageBitmap');
});
function dialogProps() {
  return {
    initialStationId: 'padre-mier',
    onClose() {},
    onSent() {
      onSent += 1;
    },
  };
}
async function fillText() {
  await user.type(await screen.findByRole('textbox', { name: 'Título' }), 'Falla observada');
  await user.type(
    screen.getByRole('textbox', { name: /Cuéntanos un poco/ }),
    'Una descripción suficientemente clara del problema.',
  );
}
function submitButton() {
  return screen.getByRole('button', { name: 'Enviar reporte al piloto' }) as HTMLButtonElement;
}

test('route reports carry the exact variant and place; a unit number never selects a route', async () => {
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.selectOptions(screen.getByRole('combobox', { name: '¿Dónde ocurrió?' }), 'unit');
  const routeSelect = await screen.findByRole('combobox', { name: /Ruta o línea observada/ });
  await user.type(screen.getByRole('textbox', { name: /Número económico/ }), '1');
  assert.equal(submitButton().disabled, true, 'A unit number must not imply a route.');
  assert.equal(
    (screen.getByRole('combobox', { name: /Estación de observación/ }) as HTMLSelectElement).value,
    '',
    'The home station must not be assigned to a unit report automatically.',
  );
  await user.type(screen.getByRole('searchbox', { name: 'Buscar ruta o línea' }), 'Sur');
  await user.selectOptions(routeSelect, 'ruta-1-sur');
  await user.click(submitButton());
  await waitFor(() => assert.equal(onSent, 1));
  assert.equal(sent[0].routeId, 'ruta-1-sur');
  assert.equal(sent[0].stationId, undefined);
  assert.equal(sent[0].unitReference, '1');
  assert.equal(sent[0].publicationConsent, false);
});

test('a route context defaults to infrastructure with a separate location reference', async () => {
  render(<ReportDialog {...dialogProps()} initialRouteId="ruta-1-norte" />);
  await screen.findByRole('combobox', { name: /Ruta o línea observada/ });
  assert.equal(
    (screen.getByRole('combobox', { name: '¿Dónde ocurrió?' }) as HTMLSelectElement).value,
    'route',
  );
  assert.equal(screen.queryByRole('combobox', { name: /Estación de/ }), null);
  await fillText();
  await user.type(
    screen.getByRole('textbox', { name: /Parada, cruce o lugar/ }),
    'Universidad y Nogalar',
  );
  await user.click(submitButton());
  await waitFor(() => assert.equal(onSent, 1));
  assert.equal(sent[0].targetType, 'route');
  assert.equal(sent[0].routeId, 'ruta-1-norte');
  assert.equal(sent[0].locationReference, 'Universidad y Nogalar');
  assert.equal(sent[0].unitReference, undefined);
  assert.equal(sent[0].stationId, undefined);
});

test('processing blocks submission and the latest selected photo wins even when decoding finishes out of order', async () => {
  deferDecode = true;
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  const input = screen.getByLabelText('Elegir archivo');
  await user.upload(input, new dom.window.File(['original-a'], 'a.jpg', { type: 'image/jpeg' }));
  assert.equal(submitButton().disabled, true);
  await user.click(submitButton());
  assert.equal(sent.length, 0);
  await user.upload(input, new dom.window.File(['original-b'], 'b.jpg', { type: 'image/jpeg' }));
  await act(async () => decodes.get('b.jpg')!(bitmap('b.jpg')));
  await screen.findByRole('img', { name: 'Vista previa de la foto adjunta' });
  await act(async () => decodes.get('a.jpg')!(bitmap('a.jpg')));
  assert.equal(submitButton().disabled, false);
  await user.click(submitButton());
  await waitFor(() => assert.equal(onSent, 1));
  assert.equal(sent[0].photo, `data:image/jpeg;base64,${Buffer.from('b.jpg').toString('base64')}`);
  assert.ok(closedBitmaps.includes('a.jpg'));
  assert.ok(closedBitmaps.includes('b.jpg'));
});

test('removing a processing photo cancels it and a later completion cannot reattach it', async () => {
  deferDecode = true;
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['original'], 'late.jpg', { type: 'image/jpeg' }),
  );
  await user.click(screen.getByRole('button', { name: 'Quitar foto' }));
  assert.equal(submitButton().disabled, false);
  await act(async () => decodes.get('late.jpg')!(bitmap('late.jpg')));
  assert.equal(screen.queryByRole('img'), null);
  await user.click(submitButton());
  await waitFor(() => assert.equal(onSent, 1));
  assert.equal(sent[0].photo, undefined);
});

test('a photo failure is explicit, blocks an accidental text-only send and permits retry or removal', async () => {
  noCanvas = true;
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['original'], 'retry.jpg', { type: 'image/jpeg' }),
  );
  assert.match((await screen.findByRole('alert')).textContent || '', /no pudo procesar/);
  assert.equal(submitButton().disabled, true);
  noCanvas = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar foto' }));
  await screen.findByRole('img', { name: 'Vista previa de la foto adjunta' });
  assert.equal(submitButton().disabled, false);
  await user.click(screen.getByRole('button', { name: 'Quitar foto' }));
  assert.equal(screen.queryByRole('img'), null);
  assert.equal(submitButton().disabled, false);
});

test('public reports clear the previous target immediately and ignore its late response', async () => {
  const replies = new Map<string, (response: Response) => void>();
  handler = (url) =>
    new Promise((resolve) => replies.set(url.searchParams.get('station') || '', resolve));
  const report = {
    id: 'old',
    title: 'Queja de A',
    detail: 'Sólo corresponde a A.',
    targetType: 'station',
    createdAt: '2026-10-20T12:00:00Z',
    photoMime: null,
    status: 'published',
  };
  const view = render(<PublicReports stationId="a" />);
  await act(async () => replies.get('a')!(Response.json(publicFeed([report]))));
  await screen.findByText('Queja de A');
  view.rerender(<PublicReports stationId="b" />);
  assert.equal(screen.queryByText('Queja de A'), null);
  assert.match(screen.getByRole('status').textContent || '', /Consultando/);
  view.rerender(<PublicReports stationId="c" />);
  await act(async () => replies.get('c')!(Response.json(publicFeed())));
  await screen.findByText(/Todavía no hay reportes públicos/);
  await act(async () => replies.get('b')!(Response.json(publicFeed([report]))));
  assert.equal(screen.queryByText('Queja de A'), null);
});

test('public report errors do not masquerade as empty results and retain a contextual report action', async () => {
  let fail = true;
  let clicked = 0;
  handler = async () => {
    if (fail) throw new TypeError('offline');
    return Response.json(publicFeed());
  };
  render(
    <PublicReports
      routeId="ruta-1-sur"
      onReport={() => {
        clicked += 1;
      }}
    />,
  );
  assert.match(
    (await screen.findByRole('alert')).textContent || '',
    /Esto no indica que no existan/,
  );
  assert.equal(screen.queryByText(/Todavía no hay reportes/), null);
  await user.click(screen.getByRole('button', { name: /Ayuda a mejorar este lugar/ }));
  assert.equal(clicked, 1);
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Reintentar reportes' }));
  await screen.findByText(/Todavía no hay reportes públicos para esta ruta/);
});

test('a missing published photo is explained without hiding its report or resolved state', async () => {
  handler = async () =>
    Response.json(
      publicFeed([
        {
          id: 'resolved',
          title: 'Techo reparado',
          detail: 'La cubierta fue reemplazada.',
          targetType: 'route',
          locationReference: 'Cruce observado',
          createdAt: '2026-10-20T12:00:00Z',
          photoMime: 'image/jpeg',
          status: 'resolved',
        },
      ]),
    );
  render(<PublicReports routeId="ruta-1-sur" />);
  const image = await screen.findByRole('img');
  fireEvent.error(image);
  await screen.findByText('La foto no está disponible.');
  assert.ok(screen.getByText('Techo reparado'));
  assert.match(
    within(screen.getByRole('article')).getByText(/Marcado como resuelto/).textContent || '',
    /Cruce observado/,
  );
});

test('public counts and categories cover the whole feed rather than only the recent list', async () => {
  const reports = Array.from({ length: 20 }, (_, index) => ({
    id: `report-${index}`,
    title: `Reporte ${index}`,
    detail: 'Un reporte reciente.',
    category: 'infrastructure',
    targetType: 'route',
    createdAt: '2026-10-20T12:00:00Z',
    photoMime: null,
    status: 'published',
  }));
  handler = async () =>
    Response.json({
      reports,
      summary: {
        total: 47,
        open: 39,
        resolved: 8,
        byCategory: {
          infrastructure: { total: 30, open: 25, resolved: 5 },
          accessibility: { total: 17, open: 14, resolved: 3 },
        },
      },
    });
  render(<PublicReports routeId="ruta-1-sur" />);
  await screen.findByText('Mostrando los 20 reportes más recientes de 47 públicos.');
  const categories = screen.getByRole('list', { name: 'Reportes por categoría' });
  assert.match(categories.textContent || '', /Infraestructura: 25 abiertos · 5 resueltos/);
  assert.match(categories.textContent || '', /Accesibilidad: 14 abiertos · 3 resueltos/);
  assert.match(
    screen.getByText(/reportes públicos ·/).textContent || '',
    /47 reportes públicos · 39 abiertos · 8 resueltos/,
  );
  assert.equal(screen.getAllByRole('article').length, 20);
});

test('missing or inconsistent summaries do not turn a limited list into a total', async () => {
  handler = async () =>
    Response.json({ reports: [], summary: { total: 40, open: 35, resolved: 5, byCategory: {} } });
  const view = render(<PublicReports routeId="ruta-1-sur" />);
  await screen.findByText('Mostrando 0 reportes recientes. El recuento total no está disponible.');
  assert.equal(screen.queryByText(/Todavía no hay reportes públicos/), null);
  handler = async () => Response.json({ reports: [] });
  view.rerender(<PublicReports routeId="ruta-1-norte" />);
  await screen.findByText('Mostrando 0 reportes recientes. El recuento total no está disponible.');
  assert.equal(screen.queryByText(/40 reportes públicos/), null);
});

test('a lost submission response preserves the draft and warns that it may have been saved', async () => {
  loseSubmitResponse = true;
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.click(submitButton());
  assert.match(
    (await screen.findByRole('alert')).textContent || '',
    /No pudimos confirmar la recepción.*Puede haberse guardado.*reintentar este mismo envío/,
  );
  assert.equal(onSent, 0);
  assert.equal(sent.length, 1);
  assert.equal(
    (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value,
    'Falla observada',
  );
  assert.equal(
    (screen.getByRole('textbox', { name: /Cuéntanos un poco/ }) as HTMLTextAreaElement).value,
    'Una descripción suficientemente clara del problema.',
  );
});

test('cancel bubbling from a file picker never closes the surrounding dialog', () => {
  let closes = 0;
  render(
    <Dialog title="Prueba de archivos" onClose={() => closes++}>
      <input type="file" aria-label="Archivo de prueba" />
    </Dialog>,
  );
  const file = screen.getByLabelText('Archivo de prueba');
  fireEvent(file, new dom.window.Event('cancel', { bubbles: true, cancelable: true }));
  assert.equal(closes, 0);
  fireEvent(
    screen.getByRole('dialog'),
    new dom.window.Event('cancel', { bubbles: true, cancelable: true }),
  );
  assert.equal(closes, 1, 'Escape on the dialog itself still closes it.');
});

test('cancelling each web photo source preserves text and the previously processed photo', async () => {
  let closes = 0;
  render(<ReportDialog {...dialogProps()} onClose={() => closes++} />);
  await fillText();
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['original'], 'saved.jpg', { type: 'image/jpeg' }),
  );
  await screen.findByRole('img', { name: 'Vista previa de la foto adjunta' });
  const previous = screen.getByRole('img').getAttribute('src');
  for (const source of ['Tomar foto', 'Elegir de galería', 'Elegir archivo']) {
    await user.click(screen.getByRole('button', { name: source }));
    await waitFor(() =>
      assert.equal(
        (screen.getByRole('button', { name: 'Cerrar ventana' }) as HTMLButtonElement).disabled,
        true,
      ),
    );
    fireEvent(
      screen.getByLabelText(source),
      new dom.window.Event('cancel', { bubbles: true, cancelable: true }),
    );
    await waitFor(() =>
      assert.equal(
        (screen.getByRole('button', { name: 'Cerrar ventana' }) as HTMLButtonElement).disabled,
        false,
      ),
    );
    assert.equal(closes, 0);
    assert.equal(
      (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value,
      'Falla observada',
    );
    assert.equal(screen.getByRole('img').getAttribute('src'), previous);
  }
});

test('a remounted form restores processed photo, fields and the same draft id; success removes the local draft', async () => {
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['original'], 'restore.jpg', { type: 'image/jpeg' }),
  );
  await screen.findByRole('img', { name: 'Vista previa de la foto adjunta' });
  await waitFor(async () => assert.ok((await readReportDraft())?.photo));
  const saved = await readReportDraft();
  assert.ok(saved);
  assert.ok(Number(localStorage.getItem(REPORT_OPEN_KEY)) > Date.now());
  cleanup();
  render(<ReportDialog {...dialogProps()} />);
  await screen.findByRole('textbox', { name: 'Título' });
  assert.equal(
    (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value,
    'Falla observada',
  );
  assert.equal(screen.getByRole('img').getAttribute('src'), saved.photo);
  await user.click(submitButton());
  await waitFor(() => assert.equal(onSent, 1));
  assert.equal(sent[0].draftId, saved.draftId);
  assert.equal(await readReportDraft(), null);
  assert.equal(localStorage.getItem(REPORT_OPEN_KEY), null);
});

test('a failed photo replacement leaves the last valid photo intact until explicitly removed', async () => {
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['original'], 'valid.jpg', { type: 'image/jpeg' }),
  );
  const image = await screen.findByRole('img', { name: 'Vista previa de la foto adjunta' });
  const src = image.getAttribute('src');
  noCanvas = true;
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['other'], 'failed.jpg', { type: 'image/jpeg' }),
  );
  await screen.findByRole('alert');
  assert.equal(screen.getByRole('img').getAttribute('src'), src);
  assert.equal(submitButton().disabled, true);
});

test('required marks match the selected destination and consent stays optional', async () => {
  render(<ReportDialog {...dialogProps()} />);
  await screen.findByRole('textbox', { name: 'Título' });
  assert.equal(
    (screen.getByRole('combobox', { name: 'Estación de Metro' }) as HTMLSelectElement).required,
    true,
  );
  assert.equal((screen.getByRole('checkbox') as HTMLInputElement).required, false);
  assert.equal(document.body.textContent?.includes('(opcional)'), false);
  await user.selectOptions(screen.getByRole('combobox', { name: '¿Dónde ocurrió?' }), 'unit');
  const route = await screen.findByRole('combobox', { name: 'Ruta o línea observada' });
  assert.equal((route as HTMLSelectElement).required, true);
  assert.equal(
    (screen.getByRole('combobox', { name: 'Estación de observación' }) as HTMLSelectElement)
      .required,
    false,
  );
});

test('an explicit first rejection keeps fields and the same draft editable for correction', async () => {
  submissionResponse = Response.json(
    { error: { code: 'INVALID_TITLE', message: 'Corrige el título.' } },
    { status: 400 },
  );
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.click(submitButton());
  await screen.findByRole('alert');
  const title = screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement;
  assert.equal(title.disabled, false);
  assert.equal(title.value, 'Falla observada');
  assert.equal((await persistedDraft())?.attempted, false);
  await user.clear(title);
  await user.type(title, 'Banca dañada');
  submissionResponse = null;
  await user.click(submitButton());
  await waitFor(() => assert.equal(onSent, 1));
  assert.equal(sent[0].draftId, sent[1].draftId);
  assert.equal(sent[1].title, 'Banca dañada');
});

test('a rate-limited retry after uncertain receipt keeps the original immutable payload', async () => {
  loseSubmitResponse = true;
  render(<ReportDialog {...dialogProps()} />);
  await fillText();
  await user.click(submitButton());
  await screen.findByRole('alert');
  loseSubmitResponse = false;
  submissionResponse = Response.json(
    { error: { code: 'RATE_LIMITED', message: 'Espera antes de reintentar.' } },
    { status: 429 },
  );
  await user.click(submitButton());
  await screen.findByText('Espera antes de reintentar.');
  assert.equal(
    (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).disabled,
    true,
  );
  assert.equal((await persistedDraft())?.attempted, true);
  assert.deepEqual(sent[0], sent[1]);
});

test('discarding requires confirmation; keeping or Escape preserves text and processed evidence', async () => {
  let closes = 0;
  render(<ReportDialog {...dialogProps()} onClose={() => closes++} />);
  await fillText();
  await user.upload(
    screen.getByLabelText('Elegir archivo'),
    new dom.window.File(['original'], 'keep.jpg', { type: 'image/jpeg' }),
  );
  await screen.findByRole('img', { name: 'Vista previa de la foto adjunta' });
  const before = await persistedDraft();
  assert.ok(before?.photo);
  await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
  const confirmation = await screen.findByRole('alertdialog', { name: 'Descartar este borrador' });
  assert.ok(confirmation);
  assert.ok(document.activeElement === screen.getByRole('button', { name: 'Conservar borrador' }));
  await user.click(screen.getByRole('button', { name: 'Conservar borrador' }));
  assert.equal(closes, 0);
  assert.equal((await persistedDraft())?.photo, before.photo);
  await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
  fireEvent(
    screen.getByRole('dialog'),
    new dom.window.Event('cancel', { bubbles: true, cancelable: true }),
  );
  assert.ok(!screen.queryByRole('alertdialog'));
  assert.equal(closes, 0);
  assert.equal((await persistedDraft())?.title, before.title);
  await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
  await user.click(screen.getByRole('button', { name: 'Descartar definitivamente' }));
  await waitFor(() => assert.equal(closes, 1));
  assert.equal(await persistedDraft(), null);
});

async function persistedDraft() {
  let draft: Awaited<ReturnType<typeof readReportDraft>> = null;
  await act(async () => {
    draft = await readReportDraft();
  });
  return draft;
}

test('closing with unavailable storage asks before losing edits and permits continuing', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  let closes = 0;
  try {
    render(<ReportDialog {...dialogProps()} onClose={() => closes++} />);
    await fillText();
    await user.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    let warning = await screen.findByRole('alertdialog', { name: 'Cerrar sin guardar' });
    assert.equal(closes, 0);
    await user.click(within(warning).getByRole('button', { name: 'Seguir editando' }));
    assert.equal(
      (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value,
      'Falla observada',
    );
    await user.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    warning = await screen.findByRole('alertdialog', { name: 'Cerrar sin guardar' });
    await user.click(within(warning).getByRole('button', { name: 'Cerrar sin guardar' }));
    assert.equal(closes, 1);
    assert.equal(sent.length, 0);
  } finally {
    cleanup();
    if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
