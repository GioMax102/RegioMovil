import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React, { useState } from 'react';
import { JSDOM } from 'jsdom';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: MapSheet } = await import('../src/mobility/MapSheet');
type SheetSize = import('../src/mobility/MapSheet').SheetSize;
styles.deregister();

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
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
  'getComputedStyle',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof Window],
  });
}
const { render, screen, cleanup, fireEvent, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const user = userEvent.setup({ document: dom.window.document });
afterEach(async () => act(async () => cleanup()));
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

function Sheet({ initial = 'half', changes = [] }: { initial?: SheetSize; changes?: SheetSize[] }) {
  const [size, setSize] = useState<SheetSize>(initial);
  return (
    <>
      <button onClick={() => setSize('peek')}>Mapa</button>
      <MapSheet
        title="Tu viaje"
        size={size}
        onSizeChange={(next) => {
          changes.push(next);
          setSize(next);
        }}
      >
        <button>Buscar destino</button>
      </MapSheet>
    </>
  );
}
const panel = () => screen.getByRole('region', { name: 'Tu viaje' });
const handle = () => screen.getByRole('button', { name: /(?:Ampliar|Reducir) panel/ });
function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
  { id = 1, x = 50, y = 100, primary = true, button = 0 } = {},
) {
  // JSDOM has no native PointerEvent; preserve pointer identity and actual coordinates.
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: primary },
    pointerType: { value: 'touch' },
  });
  fireEvent(target, event);
}
function drag(target: Element, fromY: number, toY: number) {
  pointer(target, 'pointerdown', { y: fromY });
  pointer(target, 'pointerup', { y: toY });
}

test('sheet is nonmodal, hides collapsed content and names its actual tap action', async () => {
  const changes: SheetSize[] = [];
  render(<Sheet changes={changes} />);
  assert.equal(handle().getAttribute('aria-expanded'), 'true');
  const controlled = document.getElementById(handle().getAttribute('aria-controls')!);
  assert.equal(controlled?.className, 'map-sheet-body');
  const instructions = document.getElementById(handle().getAttribute('aria-describedby')!);
  assert.match(instructions!.textContent!, /Flechas arriba y abajo/);
  assert.equal(screen.queryByRole('dialog'), null);

  await user.click(screen.getByRole('button', { name: 'Reducir panel' }));
  assert.equal(panel().getAttribute('data-size'), 'peek');
  assert.equal(controlled?.hidden, true);
  assert.equal(screen.queryByRole('button', { name: 'Buscar destino' }), null);
  assert.equal(handle().getAttribute('aria-expanded'), 'false');
  await user.tab({ shift: true });
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Mapa' }));
  await user.click(screen.getByRole('button', { name: 'Ampliar panel' }));
  assert.equal(controlled?.hidden, false);
  assert.deepEqual(changes, ['peek', 'half']);
});

test('keyboard reaches all three snaps, stays bounded and uses Enter or Space to reduce', async () => {
  const changes: SheetSize[] = [];
  render(<Sheet initial="peek" changes={changes} />);
  handle().focus();
  await user.keyboard('{ArrowDown}{Home}');
  assert.deepEqual(changes, []);
  await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
  assert.equal(panel().getAttribute('data-size'), 'full');
  assert.deepEqual(changes, ['half', 'full']);
  await user.keyboard('{Enter}');
  assert.equal(panel().getAttribute('data-size'), 'half');
  await user.keyboard(' ');
  assert.equal(panel().getAttribute('data-size'), 'peek');
  await user.keyboard('{End}{Escape}{Home}');
  assert.equal(panel().getAttribute('data-size'), 'peek');
  assert.deepEqual(changes, ['half', 'full', 'half', 'peek', 'full', 'half', 'peek']);
  assert.equal(document.activeElement, handle());
});

test('vertical handle drags choose one snap and their synthetic click cannot toggle it twice', () => {
  const changes: SheetSize[] = [];
  render(<Sheet changes={changes} />);
  const grip = handle();
  const capture: string[] = [];
  Object.assign(grip, {
    setPointerCapture: (id: number) => capture.push(`set:${id}`),
    hasPointerCapture: () => true,
    releasePointerCapture: (id: number) => capture.push(`release:${id}`),
  });
  drag(grip, 200, 120);
  assert.equal(panel().getAttribute('data-size'), 'full');
  fireEvent.click(grip, { detail: 1 });
  assert.equal(panel().getAttribute('data-size'), 'full');
  assert.deepEqual(changes, ['full']);
  drag(grip, 100, 180);
  fireEvent.click(grip, { detail: 1 });
  assert.equal(panel().getAttribute('data-size'), 'half');
  assert.deepEqual(changes, ['full', 'half']);
  assert.deepEqual(capture, ['set:1', 'release:1', 'set:1', 'release:1']);
});

test('a drag without a synthetic click never consumes a later tap or keyboard click', async () => {
  const changes: SheetSize[] = [];
  render(<Sheet changes={changes} />);
  drag(handle(), 200, 100);
  assert.equal(panel().getAttribute('data-size'), 'full');
  await user.click(handle());
  assert.equal(panel().getAttribute('data-size'), 'half');
  drag(handle(), 200, 100);
  handle().focus();
  await user.keyboard('{Enter}');
  assert.equal(panel().getAttribute('data-size'), 'half');
  assert.deepEqual(changes, ['full', 'half', 'full', 'half']);
});

test('returning a drag to its starting point cancels its snap without turning it into a tap', async () => {
  const changes: SheetSize[] = [];
  render(<Sheet changes={changes} />);
  pointer(handle(), 'pointerdown', { y: 200 });
  pointer(handle(), 'pointermove', { y: 100 });
  pointer(handle(), 'pointermove', { y: 200 });
  pointer(handle(), 'pointerup', { y: 200 });
  fireEvent.click(handle(), { detail: 1 });
  assert.equal(panel().getAttribute('data-size'), 'half');
  assert.deepEqual(changes, []);
  await user.click(handle());
  assert.deepEqual(changes, ['peek'], 'The next intentional tap still reduces the panel.');
});

test('cancel, lost capture and foreign pointerup cannot complete the wrong drag', async () => {
  const changes: SheetSize[] = [];
  render(<Sheet changes={changes} />);
  const grip = handle();
  pointer(grip, 'pointerdown', { id: 2, y: 200 });
  pointer(grip, 'pointercancel', { id: 2 });
  pointer(grip, 'pointerup', { id: 2, y: 100 });
  assert.deepEqual(changes, []);
  pointer(grip, 'pointerdown', { id: 3, y: 200 });
  pointer(grip, 'lostpointercapture', { id: 3 });
  pointer(grip, 'pointerup', { id: 3, y: 100 });
  assert.deepEqual(changes, []);
  pointer(grip, 'pointerdown', { id: 4, y: 200 });
  pointer(grip, 'pointerup', { id: 5, y: 100 });
  assert.deepEqual(changes, []);
  pointer(grip, 'pointerup', { id: 4, y: 100 });
  fireEvent.click(grip, { detail: 1 });
  assert.deepEqual(changes, ['full']);
  await user.click(grip);
  assert.deepEqual(changes, ['full', 'half']);
});

test('drag is confined to the handle; horizontal, short and nonprimary gestures do not resize', () => {
  const changes: SheetSize[] = [];
  render(<Sheet changes={changes} />);
  drag(screen.getByRole('button', { name: 'Buscar destino' }), 200, 100);
  drag(handle(), 200, 180);
  pointer(handle(), 'pointerdown', { x: 10, y: 200 });
  pointer(handle(), 'pointerup', { x: 200, y: 150 });
  fireEvent.click(handle(), { detail: 1 });
  pointer(handle(), 'pointerdown', { y: 200, primary: false });
  pointer(handle(), 'pointerup', { y: 100, primary: false });
  pointer(handle(), 'pointerdown', { y: 200, button: 2 });
  pointer(handle(), 'pointerup', { y: 100, button: 2 });
  assert.deepEqual(changes, []);
});

test('external collapse returns focus from hidden content to its visible handle', () => {
  const { rerender } = render(
    <MapSheet title="Tu viaje" size="half" onSizeChange={() => {}}>
      <button>Buscar destino</button>
    </MapSheet>,
  );
  screen.getByRole('button', { name: 'Buscar destino' }).focus();
  rerender(
    <MapSheet title="Tu viaje" size="peek" onSizeChange={() => {}}>
      <button>Buscar destino</button>
    </MapSheet>,
  );
  assert.equal(document.activeElement, handle());
  assert.equal(screen.queryByRole('button', { name: 'Buscar destino' }), null);
});

test('replacing form or route content focuses the new panel title without stealing an active search', () => {
  const view = (title: string, child: React.ReactNode) => (
    <MapSheet title={title} size="half" onSizeChange={() => {}}>
      {child}
    </MapSheet>
  );
  const { rerender } = render(view('Planear', <button key="submit">Buscar rutas</button>));
  screen.getByRole('button', { name: 'Buscar rutas' }).focus();
  rerender(view('Elige tu ruta', <button key="result">Ver conexión</button>));
  assert.equal(document.activeElement, screen.getByRole('heading', { name: 'Elige tu ruta' }));
  screen.getByRole('button', { name: 'Ver conexión' }).focus();
  rerender(view('Tu trayecto', <button key="guide">Iniciar trayecto</button>));
  assert.equal(document.activeElement, screen.getByRole('heading', { name: 'Tu trayecto' }));
  rerender(view('¿A dónde vas?', <input key="search" autoFocus aria-label="Buscar destino" />));
  assert.equal(document.activeElement, screen.getByRole('textbox', { name: 'Buscar destino' }));
});
