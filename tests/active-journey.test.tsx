/** Foreground browser adapter lifecycle; native permission behavior is checked separately. */
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React from 'react';
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
  'HTMLElement',
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
beforeEach(() => {
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
  assert.match(screen.getByText(/no emite avisos en segundo plano/).textContent!, /visible/);
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
  assert.ok(screen.getByText('Sin GPS · avance manual'));
  assert.ok(screen.getByRole('heading', { name: 'Tu guía está en pausa' }));
  assert.equal(screen.queryByRole('heading', { name: 'Buscando tu ubicación' }), null);
  const manual = screen.getByRole('button', { name: 'Ya llegué a Talleres' });
  manual.focus();
  assert.equal(document.activeElement, manual);
  fireEvent.click(manual);
  assert.ok(screen.getByText('PASO 2 DE 2'));
  assert.equal(watches.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Ya bajé en Destino' }));
  assert.ok(screen.getByText('Llegaste a tu destino'));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar guía' }));
  assert.equal(finished, 1);
});

test('guidance identifies waiting, imprecise, recent and stale GPS without implying that an unverified location is live', async () => {
  mount(true);
  await waitFor(() => assert.equal(watches.length, 1));
  assert.ok(screen.getByText('Conectando con el GPS'));
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
  assert.ok(screen.getByText('Sin señal GPS reciente'));
  await act(async () => watches[0].success(fix(250, now - 1000)));
  assert.ok(screen.getByText('GPS impreciso'));
  assert.ok(screen.getByRole('heading', { name: 'Ubicación imprecisa' }));
  await act(async () => watches[0].success(fix(8, now)));
  assert.ok(screen.getByText('Guía activa · GPS conectado'));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  assert.ok(screen.getByText('Guía en pausa'));
});

test('manual confirmation and pause stay before the map, and technical detail is available without dominating the guide', async () => {
  mount(true);
  const manual = screen.getByRole('button', { name: 'Ya llegué a Talleres' });
  const map = document.querySelector('.active-journey-map')!;
  assert.ok(manual.compareDocumentPosition(map) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  const details = document.querySelector('.active-journey-about') as HTMLDetailsElement;
  assert.equal(details.open, false);
  assert.match(details.textContent!, /no se guarda como historial/);
  assert.match(details.textContent!, /no detecta la unidad/);
  assert.ok(screen.getByText(/Confirma el paso sólo cuando hayas llegado/));
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
  assert.ok(screen.getByRole('heading', { name: 'Prepárate para bajar' }));
  assert.ok(screen.getByRole('img', { name: /^Tu ubicación,/ }));
  const progress = screen.getByRole('progressbar').getAttribute('value');
  fireEvent.click(screen.getByRole('button', { name: 'Pausar guía' }));
  now += 60000;
  const spokenBeforeResume = spoken.length;
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar ubicación' }));
  await waitFor(() => assert.equal(watches.length, 2));
  assert.ok(screen.getByText('Conectando con el GPS'));
  assert.equal(screen.queryByRole('img', { name: /^Tu ubicación,/ }), null);
  assert.equal(screen.queryByRole('heading', { name: 'Prepárate para bajar' }), null);
  assert.equal(screen.getByRole('progressbar').getAttribute('value'), progress);
  assert.doesNotMatch(spoken.slice(spokenBeforeResume).join(' '), /bajar|Llegaste/);
  assert.match(spoken.slice(spokenBeforeResume).join(' '), /Buscando tu ubicación/);
  // A single new end-point fix must start new arrival evidence; the pause
  // cannot provide the sustained second observation needed for completion.
  await act(async () => watches[1].success(fixAt(1)));
  assert.ok(screen.getByRole('heading', { name: 'Prepárate para bajar' }));
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
