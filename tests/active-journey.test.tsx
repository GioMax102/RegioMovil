/** Foreground browser adapter lifecycle; native permission behavior is checked separately. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React from 'react';
import 'fake-indexeddb/auto';
import type { MobilityJourney, MobilityNetwork, MobilityStep } from '../src/mobility/types';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'HTMLDialogElement',
  'SVGElement',
  'Element',
  'Node',
  'Event',
  'MutationObserver',
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
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
Object.defineProperty(dom.window.navigator, 'onLine', { value: false });
Object.defineProperty(dom.window.document, 'visibilityState', {
  configurable: true,
  value: 'visible',
});
const rect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  width: 360,
  height: 300,
  right: 360,
  bottom: 300,
  toJSON() {},
};
dom.window.HTMLElement.prototype.getBoundingClientRect = () => rect;
dom.window.SVGElement.prototype.getBoundingClientRect = () => rect;
type Watch = {
  success: PositionCallback;
  error: PositionErrorCallback | null;
  options?: PositionOptions;
};
const watches: Watch[] = [],
  cleared: number[] = [];
Object.defineProperty(dom.window.navigator, 'geolocation', {
  value: {
    watchPosition(
      success: PositionCallback,
      error: PositionErrorCallback | null,
      options?: PositionOptions,
    ) {
      watches.push({ success, error, options });
      return watches.length;
    },
    clearWatch(id: number) {
      cleared.push(id);
    },
  },
});
const spoken: string[] = [];
let cancellations = 0;
Object.defineProperty(dom.window, 'speechSynthesis', {
  value: {
    cancel() {
      cancellations++;
    },
    speak(utterance: { text: string }) {
      spoken.push(utterance.text);
    },
  },
});
Object.defineProperty(dom.window, 'SpeechSynthesisUtterance', {
  value: class {
    text: string;
    lang = '';
    rate = 1;
    constructor(text: string) {
      this.text = text;
    }
  },
});

const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const ActiveJourney = (await import('../src/mobility/ActiveJourney')).default;
const ReportEntry = (await import('../src/components/ReportEntry')).default;
const { saveGuidanceCheckpoint } = await import('../src/mobility/guidanceCheckpoint');
const { readReportDraft, clearReportDraft, saveReportDraft, newReportDraftId, REPORT_DRAFT_TTL } =
  await import('../src/reportDraft');
const walk = {
  mode: 'walk',
  lineId: 'walk',
  lineName: 'A pie',
  fromId: 'home',
  toId: 'station',
  from: 'Origen',
  to: 'Talleres',
  minutes: 3,
  distanceMeters: 200,
  stationCount: 0,
  geometry: [
    [-100.37, 25.75],
    [-100.368, 25.75],
  ],
  stopOrderVerified: false,
  source: 'simulation',
  experimental: true,
} as MobilityStep;
const ride = {
  ...walk,
  mode: 'metro',
  lineId: 'L1',
  lineName: 'Línea 1',
  fromId: 'station',
  toId: 'end',
  from: 'Talleres',
  to: 'Destino',
  geometry: [
    [-100.368, 25.75],
    [-100.36, 25.74],
  ],
  stopOrderVerified: true,
} as MobilityStep;
const journey = { id: 'active-fixture', steps: [walk, ride], stationIds: [] } as MobilityJourney;
const network = {
  version: 1,
  mode: 'experimental',
  routes: [],
  stops: [],
  coverage: {},
  assumptions: [],
} as MobilityNetwork;
let finished = 0;
beforeEach(async () => {
  const draft = await readReportDraft();
  if (draft) await clearReportDraft(draft.draftId);
  localStorage.clear();
  watches.length = 0;
  cleared.length = 0;
  spoken.length = 0;
  cancellations = 0;
  finished = 0;
  Object.defineProperty(dom.window.document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});
afterEach(async () => {
  await act(async () => cleanup());
});
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
const mount = (autoStart = false) =>
  render(
    <ActiveJourney
      journey={journey}
      network={network}
      autoStart={autoStart}
      onFinish={() => finished++}
    />,
  );

test('opening guidance does not request GPS, and start, pause, resume and unmount release each foreground watch', async () => {
  const result = mount();
  assert.equal(watches.length, 0);
  assert.equal(
    document.activeElement,
    screen.getByRole('heading', { name: 'Camina hasta Talleres' }),
  );
  const scope = screen.getByText('Sólo con la app visible; se pausa al salir.');
  assert.equal(
    scope.closest('details')?.open,
    false,
    'The foreground limitation remains available in collapsed information.',
  );
  assert.ok(screen.getByText(/no emite avisos en segundo plano/));
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar guía' }));
  await waitFor(() => assert.equal(watches.length, 1));
  assert.equal(watches[0].options?.enableHighAccuracy, true);
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  await waitFor(() => assert.deepEqual(cleared, [1]));
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar ubicación' }));
  await waitFor(() => assert.equal(watches.length, 2));
  result.unmount();
  assert.deepEqual(cleared, [1, 2]);
});

test('denied GPS leaves the manual route usable and releases the watch without retrying permission automatically', async () => {
  mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  await act(async () =>
    watches[0].error?.({
      code: 1,
      message: 'denied',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }),
  );
  await waitFor(() => assert.deepEqual(cleared, [1]));
  assert.ok(screen.getByText(/No se concedió acceso a tu ubicación/));
  assert.ok(screen.getByText('Sin GPS'));
  assert.ok(screen.getByRole('heading', { name: 'Camina hasta Talleres' }));
  assert.equal(screen.queryByRole('heading', { name: 'Buscando tu ubicación' }), null);
  const manual = screen.getByRole('button', { name: 'Ya llegué a Talleres' });
  manual.focus();
  assert.equal(document.activeElement, manual);
  fireEvent.click(manual);
  assert.ok(screen.getByText(/Paso 2 de 2/));
  const nextInstruction = screen.getByRole('heading', { name: 'Viaja hasta Destino' });
  assert.equal(
    document.activeElement,
    nextInstruction,
    'The new instruction receives manual focus.',
  );
  assert.equal(watches.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Ya bajé en Destino' }));
  const arrival = screen.getByRole('heading', { name: 'Llegaste a tu destino' });
  assert.equal(document.activeElement, arrival);
  assert.equal(screen.getAllByRole('button', { name: 'Cerrar guía' }).length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar guía' }));
  assert.equal(finished, 1);
});

test('guidance identifies waiting, imprecise, recent and stale GPS without implying that an unverified location is live', async () => {
  mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  assert.ok(screen.getByText('Buscando GPS'));
  const fix = (accuracy: number, timestamp: number) =>
    ({
      coords: {
        latitude: 25.75,
        longitude: -100.37,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp,
    }) as GeolocationPosition;
  const now = Date.now();
  await act(async () => watches[0].success(fix(250, now - 25000)));
  assert.ok(screen.getByText('Sin señal GPS'));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  await act(async () => watches[0].success(fix(250, now - 1000)));
  assert.ok(screen.getByText('GPS impreciso'));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  assert.ok(screen.getByRole('heading', { name: 'Camina hasta Talleres' }));
  assert.ok(screen.getByText(/Avance sin actualizar/));
  await act(async () => watches[0].success(fix(8, now)));
  assert.ok(screen.getByText('GPS conectado'));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  assert.ok(screen.getByText('En pausa'));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
});

test('the map fits only the current step, preserves a manual view between GPS fixes, and fits the next step after confirmation', async () => {
  mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  const paths = () => document.querySelectorAll('polyline[data-line]');
  assert.equal(paths().length, 1);
  assert.equal(paths()[0].getAttribute('data-mode'), 'walk');
  assert.equal(document.querySelector('polyline[data-line="L1"]'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Seguirme en el mapa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Acercar mapa' }));
  const chosenWalkView = paths()[0].getAttribute('points');
  await act(async () =>
    watches[0].success({
      coords: {
        latitude: 25.75,
        longitude: -100.37,
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    }),
  );
  assert.equal(
    paths()[0].getAttribute('points'),
    chosenWalkView,
    'A new GPS fix must not refit the route.',
  );
  assert.ok(screen.getByRole('img', { name: /^Tu ubicación,/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Ya llegué a Talleres' }));
  assert.equal(paths().length, 1);
  assert.equal(paths()[0].getAttribute('data-line'), 'L1');
  assert.equal(document.querySelector('polyline[data-mode="walk"]'), null);
  const rideView = paths()[0].getAttribute('points')!;
  assert.notEqual(rideView, chosenWalkView);
  for (const pair of rideView.split(' ')) {
    const [x, y] = pair.split(',').map(Number);
    assert.ok(
      x > 0 && x < rect.width && y > 0 && y < rect.height,
      'The entire new step fits the viewport.',
    );
  }
  assert.ok(
    Number(screen.getByRole('progressbar').getAttribute('value')) > 0,
    'Total-trip progress is retained.',
  );
  assert.ok(screen.getByRole('heading', { name: 'Viaja hasta Destino' }));
  assert.equal(watches.length, 1);
  assert.deepEqual(cleared, [1]);
});

test('the map leads to a single primary confirmation and grouped secondary controls, with technical detail disclosed progressively', async () => {
  mount(true);
  const manual = screen.getByRole('button', { name: 'Ya llegué a Talleres' });
  const map = document.querySelector('.active-journey-map')!;
  const options = document.querySelector('.active-journey-options')!;
  assert.ok(map.compareDocumentPosition(manual) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(manual.contains(screen.getByText('Ya llegué')));
  assert.equal(manual.querySelector('small')?.textContent, 'Talleres');
  assert.equal(options.querySelectorAll('button').length, 3);
  assert.ok(options.contains(screen.getByRole('button', { name: 'Pausar guía' })));
  assert.ok(options.contains(screen.getByRole('button', { name: 'Seguirme en el mapa' })));
  assert.ok(options.contains(screen.getByRole('button', { name: 'Avisos por voz' })));
  const details = document.querySelector('.active-journey-about') as HTMLDetailsElement;
  assert.equal(details.open, false);
  assert.match(details.textContent!, /no se guarda como historial/);
  assert.match(details.textContent!, /no detecta la unidad/);
  assert.ok(screen.getByText('Confirma sólo cuando estés en esa parada.'));
});

test('manual steps distinguish alighting from a short transfer and can complete without requesting GPS', () => {
  const transfer = {
    ...walk,
    from: 'Cuauhtémoc L1',
    to: 'Andén de Línea 2',
    minutes: 1,
    distanceMeters: 45,
  };
  render(
    <ActiveJourney
      journey={{
        ...journey,
        steps: [
          { ...ride, to: 'Cuauhtémoc L1' },
          transfer,
          { ...ride, lineId: 'L2', lineName: 'Línea 2', to: 'Universidad' },
        ],
      }}
      network={network}
      onFinish={() => finished++}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ya bajé en Cuauhtémoc L1' }));
  const transferInstruction = screen.getByRole('heading', {
    name: 'Transborda a Línea 2 Andén de Línea 2',
  });
  assert.equal(document.activeElement, transferInstruction);
  fireEvent.click(screen.getByRole('button', { name: 'Ya llegué a Andén de Línea 2' }));
  assert.ok(screen.getByRole('heading', { name: 'Viaja hasta Universidad' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ya bajé en Universidad' }));
  assert.ok(screen.getByRole('heading', { name: 'Llegaste a tu destino' }));
  assert.equal(watches.length, 0);
  assert.equal(screen.queryByRole('button', { name: 'Terminar guía' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar guía' }));
  assert.equal(finished, 1);
});

test('an accidental confirmation can return to the previous leg with GPS and voice paused', async () => {
  mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  assert.equal(screen.queryByRole('button', { name: 'Volver al paso anterior' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Avisos por voz' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ya llegué a Talleres' }));
  await act(async () =>
    watches[0].success({
      coords: {
        latitude: 25.75,
        longitude: -100.368,
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    }),
  );
  assert.ok(screen.getByRole('img', { name: /^Tu ubicación,/ }));
  const spokenBeforeReturn = spoken.length;
  fireEvent.click(screen.getByRole('button', { name: 'Volver al paso anterior' }));
  await waitFor(() => assert.deepEqual(cleared, [1]));
  const instruction = screen.getByRole('heading', { name: 'Camina hasta Talleres' });
  assert.equal(document.activeElement, instruction);
  assert.ok(screen.getByText(/Paso 1 de 2/));
  assert.ok(screen.getByText('En pausa'));
  assert.equal(screen.getByRole('progressbar').getAttribute('value'), '0');
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  assert.equal(document.querySelector('polyline[data-mode="walk"]') !== null, true);
  assert.equal(document.querySelector('polyline[data-line="L1"]'), null);
  assert.equal(
    screen.getByRole('button', { name: 'Avisos por voz' }).getAttribute('aria-pressed'),
    'false',
  );
  assert.equal(spoken.length, spokenBeforeReturn);
  assert.equal(watches.length, 1);
  // A callback queued before unsubscribe cannot move the restored step or reveal a stale fix.
  await act(async () =>
    watches[0].success({
      coords: { latitude: 25.74, longitude: -100.36, accuracy: 8 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  assert.ok(screen.getByRole('heading', { name: 'Camina hasta Talleres' }));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar ubicación' }));
  await waitFor(() => assert.equal(watches.length, 2));
  assert.ok(screen.getByText('Buscando GPS'));
  assert.equal(spoken.length, spokenBeforeReturn, 'Voice stays disabled after correcting a step.');
  assert.equal(finished, 0);
});

test('an accidental final confirmation restores the last leg, including a single-step offline journey', () => {
  render(
    <ActiveJourney
      journey={{ ...journey, steps: [ride] }}
      network={network}
      onFinish={() => finished++}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ya bajé en Destino' }));
  assert.ok(screen.getByRole('heading', { name: 'Llegaste a tu destino' }));
  fireEvent.click(screen.getByRole('button', { name: 'Volver al último paso' }));
  const instruction = screen.getByRole('heading', { name: 'Viaja hasta Destino' });
  assert.equal(document.activeElement, instruction);
  assert.ok(screen.getByText(/Paso 1 de 1/));
  assert.ok(screen.getByText('En pausa'));
  assert.equal(screen.queryByRole('button', { name: 'Cerrar guía' }), null);
  assert.ok(screen.getByRole('button', { name: 'Ya bajé en Destino' }));
  assert.equal(watches.length, 0);
  assert.equal(spoken.length, 0);
  assert.equal(finished, 0);
});

test('next-stop guidance only appears with a verified stop order and a usable current GPS fix', async () => {
  render(
    <ActiveJourney
      journey={{ ...journey, steps: [{ ...ride, stopIds: ['station', 'end'] }] }}
      network={{
        ...network,
        stops: [
          { id: 'station', name: 'Talleres', lng: -100.368, lat: 25.75, routeIds: ['L1'] },
          { id: 'end', name: 'Destino', lng: -100.36, lat: 25.74, routeIds: ['L1'] },
        ],
      }}
      autoStart
      onFinish={() => finished++}
    />,
  );
  await waitFor(() => assert.equal(watches.length, 1));
  assert.equal(document.querySelector('.active-journey-next-stop'), null);
  await act(async () =>
    watches[0].success({
      coords: {
        latitude: 25.75,
        longitude: -100.368,
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    }),
  );
  assert.match(
    document.querySelector('.active-journey-next-stop')?.textContent || '',
    /Próxima: Destino/,
  );
  assert.ok(screen.getByRole('heading', { name: 'Baja en la siguiente estación Destino' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  assert.equal(document.querySelector('.active-journey-next-stop'), null);
  assert.ok(screen.getByRole('heading', { name: 'Viaja hasta Destino' }));
});

test('resuming waits for fresh GPS without replaying an old alighting alert or carrying arrival evidence across the pause', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  render(
    <ActiveJourney
      journey={{ ...journey, steps: [ride] }}
      network={network}
      autoStart
      onFinish={() => finished++}
    />,
  );
  await waitFor(() => assert.equal(watches.length, 1));
  fireEvent.click(screen.getByRole('button', { name: 'Avisos por voz' }));
  const fixAt = (fraction: number) =>
    ({
      coords: {
        latitude: 25.75 + (25.74 - 25.75) * fraction,
        longitude: -100.368 + (-100.36 + 100.368) * fraction,
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: now,
    }) as GeolocationPosition;
  for (const fraction of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    now += 6000;
    await act(async () => watches[0].success(fixAt(fraction)));
  }
  assert.ok(screen.getByRole('heading', { name: 'Prepárate para bajar Destino' }));
  assert.ok(screen.getByRole('img', { name: /^Tu ubicación,/ }));
  const progress = screen.getByRole('progressbar').getAttribute('value');
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  now += 60000;
  const spokenBeforeResume = spoken.length;
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar ubicación' }));
  await waitFor(() => assert.equal(watches.length, 2));
  assert.ok(screen.getByText('Buscando GPS'));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  assert.equal(screen.queryByRole('heading', { name: /Prepárate para bajar/ }), null);
  assert.ok(screen.getByRole('heading', { name: 'Viaja hasta Destino' }));
  assert.equal(screen.getByRole('progressbar').getAttribute('value'), progress);
  assert.doesNotMatch(spoken.slice(spokenBeforeResume).join(' '), /bajar|Llegaste/);
  assert.match(spoken.slice(spokenBeforeResume).join(' '), /Buscando tu ubicación/);
  // A single new end-point fix must start new arrival evidence; the pause
  // cannot provide the sustained second observation needed for completion.
  await act(async () => watches[1].success(fixAt(1)));
  assert.ok(screen.getByRole('heading', { name: 'Prepárate para bajar Destino' }));
  assert.equal(screen.queryByRole('heading', { name: 'Llegaste a tu destino' }), null);
  now += 3500;
  await act(async () => watches[1].success(fixAt(1)));
  assert.ok(screen.getByRole('heading', { name: 'Llegaste a tu destino' }));
});

test('leaving the foreground pauses GPS and voice, and returning never resumes location without an action', async () => {
  mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  assert.equal(spoken.length, 0, 'Voice is opt-in.');
  fireEvent.click(screen.getByRole('button', { name: 'Avisos por voz' }));
  assert.equal(spoken.length, 1);
  const beforePause = cancellations;
  await act(async () => {
    Object.defineProperty(dom.window.document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
  });
  assert.deepEqual(cleared, [1]);
  assert.ok(cancellations > beforePause);
  assert.ok(screen.getByText(/La guía se pausó al salir de la aplicación/));
  await act(async () => {
    Object.defineProperty(dom.window.document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
  });
  assert.equal(watches.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar ubicación' }));
  await waitFor(() => assert.equal(watches.length, 2));
});

test('finishing an active guide stops location and does not retain a background subscription', async () => {
  const result = mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  fireEvent.click(screen.getByRole('button', { name: 'Terminar guía' }));
  await waitFor(() => assert.deepEqual(cleared, [1]));
  assert.equal(finished, 1);
  result.unmount();
  assert.deepEqual(cleared, [1]);
});

test('closing while the async watch subscription is still resolving releases it as soon as it resolves', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    flushSync(() =>
      root.render(
        <ActiveJourney journey={journey} network={network} autoStart onFinish={() => finished++} />,
      ),
    );
    assert.equal(watches.length, 1);
    root.unmount();
    assert.deepEqual(cleared, [], 'The async stop function has not been delivered yet.');
  });
  assert.equal(watches.length, 1);
  assert.deepEqual(cleared, [1]);
  container.remove();
});

test('transfer photos and shared station bookmarks preserve a paused guide, its progress and the single location subscription', async () => {
  const { within } = await import('@testing-library/react');
  const transferJourney: MobilityJourney = {
    ...journey,
    steps: [
      { ...ride, toId: 'metro:talleres', to: 'Talleres' },
      {
        ...walk,
        fromId: 'metro:talleres',
        from: 'Talleres',
        toId: 'bus:boarding',
        to: 'Andén de Transmetro',
        minutes: 1,
        distanceMeters: 45,
      },
      { ...ride, mode: 'bus', lineId: 'TM', fromId: 'bus:boarding', from: 'Andén de Transmetro' },
    ],
  };
  const transferNetwork: MobilityNetwork = {
    ...network,
    stops: [
      {
        id: 'metro:talleres',
        stationId: 'talleres',
        name: 'Talleres',
        lat: 25.759167,
        lng: -100.368333,
        mode: 'metro',
        routeIds: ['L1'],
        sourceIds: [],
        official: true,
      },
      {
        id: 'bus:boarding',
        name: 'Andén de Transmetro',
        lat: 25.758,
        lng: -100.369,
        mode: 'bus',
        routeIds: ['TM'],
        sourceIds: [],
        official: true,
      },
    ],
  };
  render(
    <ActiveJourney
      journey={transferJourney}
      network={transferNetwork}
      autoStart
      onFinish={() => finished++}
    />,
  );
  await waitFor(() => assert.equal(watches.length, 1));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  const progress = screen.getByRole('progressbar').getAttribute('value');
  const heading = screen.getByRole('heading', { name: 'Viaja hasta Talleres' });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Talleres' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Andén de Transmetro' }));
  assert.equal(
    screen.getByRole('button', { name: 'Guardar Talleres' }).getAttribute('aria-pressed'),
    'true',
  );
  assert.deepEqual(JSON.parse(localStorage.getItem('regiomovil:favorites')!), [
    'talleres',
    'bus:boarding',
  ]);
  assert.deepEqual(
    JSON.parse(localStorage.getItem('regiomovil:favoriteStops')!).map(
      (entry: { id: string }) => entry.id,
    ),
    ['bus:boarding'],
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ver fotografía de Talleres' }));
  const photo = screen.getByRole('dialog', { name: 'Talleres' });
  assert.match(photo.textContent!, /Fotografía histórica.*Dominio público/);
  fireEvent.click(within(photo).getByRole('button', { name: 'Cerrar ventana' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(heading.isConnected);
  assert.ok(screen.getByText('En pausa'));
  assert.equal(screen.getByRole('progressbar').getAttribute('value'), progress);
  assert.equal(watches.length, 1);
  assert.deepEqual(cleared, [1]);
  fireEvent.click(screen.getByRole('button', { name: 'Ya bajé en Talleres' }));
  assert.ok(screen.getByRole('heading', { name: 'Transborda a Línea 1 Andén de Transmetro' }));
  assert.equal(
    screen.getByRole('button', { name: 'Guardar Talleres' }).getAttribute('aria-pressed'),
    'true',
  );
  assert.match(screen.getByText(/Paso 2 de/).textContent!, /Paso 2 de/);
  assert.equal(watches.length, 1);
});

test('a contextual observation pauses an active guide and returns to the same step without restarting GPS', async () => {
  const { within } = await import('@testing-library/react');
  const guideJourney: MobilityJourney = {
    ...journey,
    title: 'Una prueba',
    durationMinutes: 20,
    walkingMinutes: 3,
    walkingMeters: 200,
    transfers: 0,
    occupancy: 20,
    etaRange: [18, 22],
    score: 20,
    source: 'simulation',
    accessibility: 'unknown',
    steps: [
      walk,
      { ...ride, toId: 'rail:last', to: 'Universidad', stopIds: ['station', 'rail:last'] },
    ],
  };
  const guideNetwork: MobilityNetwork = {
    ...network,
    stops: [
      {
        id: 'station',
        stationId: 'talleres',
        name: 'Talleres',
        lng: -100.368,
        lat: 25.75,
        mode: 'metro',
        routeIds: ['L1'],
        sourceIds: [],
        official: true,
      },
      {
        id: 'rail:last',
        stationId: 'universidad',
        name: 'Universidad',
        lng: -100.36,
        lat: 25.74,
        mode: 'metro',
        routeIds: ['L1'],
        sourceIds: [],
        official: true,
      },
    ],
  };
  render(
    <ActiveJourney
      journey={guideJourney}
      network={guideNetwork}
      autoStart
      onFinish={() => finished++}
    />,
  );
  await waitFor(() => assert.equal(watches.length, 1));
  fireEvent.click(screen.getByRole('button', { name: 'Ya llegué a Talleres' }));
  assert.ok(screen.getByText(/Paso 2 de 2/));
  const map = document.querySelector('.location-map-canvas');
  fireEvent.click(screen.getByRole('button', { name: 'Reportar algo en este tramo' }));
  const title = await screen.findByRole('textbox', { name: /^Título/ });
  await waitFor(() => assert.deepEqual(cleared, [1]));
  const report = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
  const station = within(report).getByRole('combobox', { name: /^Estación de Metro/ });
  assert.equal(
    (station as HTMLSelectElement).value,
    '',
    'The place must be confirmed, not inferred from the guide.',
  );
  fireEvent.change(station, { target: { value: 'universidad' } });
  fireEvent.change(title, { target: { value: 'Banca dañada' } });
  fireEvent.change(within(report).getByRole('textbox', { name: /^Cuéntanos un poco/ }), {
    target: { value: 'Una banca dañada en el andén.' },
  });
  fireEvent.click(within(report).getByRole('button', { name: 'Cerrar ventana' }));
  await waitFor(() => assert.ok(!screen.queryByRole('dialog')));
  assert.ok(screen.getByText(/Paso 2 de 2/));
  assert.ok(screen.getByText('En pausa'));
  assert.ok(
    document.querySelector('.location-map-canvas') === map,
    'Opening a report never remounts the guidance map.',
  );
  assert.equal(watches.length, 1, 'Closing an observation does not resume location.');
  assert.equal(finished, 0);
});

test('recovering a report on a later guide step keeps location and speech paused', async () => {
  render(
    <ActiveJourney
      journey={journey}
      network={network}
      autoStart
      initialStepIndex={1}
      initialOpenReport
      onFinish={() => finished++}
    />,
  );
  await screen.findByRole('textbox', { name: /^Título/ });
  assert.ok(screen.getByText(/Paso 2 de 2/));
  assert.equal(watches.length, 0);
  assert.equal(spoken.length, 0);
  assert.ok(screen.getByRole('heading', { name: 'Viaja hasta Destino' }));
});

async function prepareRecovery(stepIndex = 1, draftStepIndex = stepIndex) {
  const completeJourney: MobilityJourney = {
    ...journey,
    title: 'Un trayecto para recuperar',
    durationMinutes: 20,
    walkingMinutes: 3,
    walkingMeters: 200,
    transfers: 0,
    occupancy: 20,
    etaRange: [18, 22],
    score: 20,
    source: 'simulation',
    accessibility: 'unknown',
  };
  saveGuidanceCheckpoint(completeJourney, network, stepIndex);
  await saveReportDraft({
    version: 1,
    draftId: newReportDraftId(),
    expiresAt: Date.now() + REPORT_DRAFT_TTL,
    context: {
      journeyId: journey.id,
      stepIndex: draftStepIndex,
      source: 'journey',
      returnTo: 'guidance',
    },
    targetType: 'station',
    stationId: 'universidad',
    routeId: '',
    title: 'Una banca dañada',
    detail: 'La banca tiene un asiento roto en el andén.',
    category: 'infrastructure',
    unitReference: '',
    locationReference: '',
    publicationConsent: false,
    photo: '',
  });
}

test('recovered report entry closes and sends back into the same paused guide step', async () => {
  const { within } = await import('@testing-library/react');
  await prepareRecovery();
  const realFetch = globalThis.fetch;
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, 'POST');
    sent.push(JSON.parse(String(init.body)));
    return Response.json({ report: { id: 'test-report', status: 'pending' } }, { status: 201 });
  };
  try {
    render(<ReportEntry onClose={() => finished++} onSent={() => finished++} />);
    const title = await screen.findByRole('textbox', { name: /^Título/ });
    assert.equal((title as HTMLInputElement).value, 'Una banca dañada');
    assert.ok(screen.getByText(/Paso 2 de 2/));
    assert.equal(watches.length, 0);
    assert.equal(spoken.length, 0);
    const report = screen.getByRole('dialog', { name: 'Tu experiencia cuenta' });
    fireEvent.click(within(report).getByRole('button', { name: 'Cerrar ventana' }));
    await waitFor(() =>
      assert.ok(!screen.queryByRole('dialog', { name: 'Tu experiencia cuenta' })),
    );
    assert.ok(screen.getByRole('dialog', { name: 'Sigue tu ruta' }));
    assert.ok(screen.getByText('En pausa'));
    assert.ok(screen.getByRole('heading', { name: 'Viaja hasta Destino' }));
    assert.equal(finished, 0);

    fireEvent.click(screen.getByRole('button', { name: 'Reportar algo en este tramo' }));
    await screen.findByRole('textbox', { name: /^Título/ });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte al piloto' }));
    await waitFor(() =>
      assert.ok(!screen.queryByRole('dialog', { name: 'Tu experiencia cuenta' })),
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].stationId, 'universidad');
    assert.ok(screen.getByText(/Tu observación quedó pendiente de revisión/));
    assert.ok(screen.getByText(/Paso 2 de 2/));
    assert.ok(screen.getByText('En pausa'));
    assert.equal(watches.length, 0);
    assert.equal(spoken.length, 0);
    assert.equal(finished, 0);
    assert.equal(await readReportDraft(), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a checkpoint for another step recovers the draft without inventing a guide return', async () => {
  await prepareRecovery(0, 1);
  render(<ReportEntry onClose={() => finished++} onSent={() => finished++} />);
  // Recovery opens the saved form directly even when the guide is unavailable.
  await screen.findByText(/La guía anterior ya no está disponible/);
  assert.ok(!screen.queryByRole('dialog', { name: 'Sigue tu ruta' }));
  const title = await screen.findByRole('textbox', { name: /^Título/ });
  assert.equal((title as HTMLInputElement).value, 'Una banca dañada');
  assert.equal(watches.length, 0);
  assert.equal(spoken.length, 0);
});
