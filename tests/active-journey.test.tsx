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
