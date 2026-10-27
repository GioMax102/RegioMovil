/** Native-close stubs deliberately do not restore focus: unmount must handle that case. */
import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDialogElement',
  'Node',
  'MutationObserver',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const previous = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
for (const name of names)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name],
  });
dom.window.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
  this.querySelector<HTMLElement>('button, input')?.focus();
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const { render, cleanup, screen, within, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { Dialog } = await import('../src/components/Primitives');
afterEach(async () => {
  await act(async () => cleanup());
});
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
const user = () => userEvent.setup({ document: dom.window.document, delay: null });

test('closing an unmounted dialog restores its actual opener even when children autofocus before showModal', async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Ajustes</button>
        {open && (
          <Dialog title="Ajustes de viaje" onClose={() => setOpen(false)}>
            <input aria-label="Nombre" autoFocus data-autofocus />
          </Dialog>
        )}
      </>
    );
  }
  render(
    <React.StrictMode>
      <Example />
    </React.StrictMode>,
  );
  const interaction = user();
  const opener = screen.getByRole('button', { name: 'Ajustes', exact: true });
  await interaction.click(opener);
  assert.equal(document.activeElement, screen.getByRole('textbox', { name: 'Nombre' }));
  await interaction.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(document.body.style.position, '');
});

test('a nested dialog returns focus inside the still-open parent', async () => {
  function Nested() {
    const [inner, setInner] = useState(false);
    return (
      <Dialog title="Trayecto" onClose={() => {}}>
        <button onClick={() => setInner(true)}>Ver foto</button>
        {inner && (
          <Dialog title="Fotografía" onClose={() => setInner(false)}>
            Imagen
          </Dialog>
        )}
      </Dialog>
    );
  }
  render(<Nested />);
  const interaction = user();
  const opener = screen.getByRole('button', { name: 'Ver foto' });
  await interaction.click(opener);
  await interaction.click(
    within(screen.getByRole('dialog', { name: 'Fotografía' })).getByRole('button', {
      name: 'Cerrar ventana',
    }),
  );
  assert.equal(document.activeElement, opener);
  assert.ok(screen.getByRole('dialog', { name: 'Trayecto' }).hasAttribute('open'));
  assert.equal(document.body.style.position, 'fixed');
});

test('unmounting an older dialog preserves focus in another open dialog', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  function Multiple({ first }: { first: boolean }) {
    return (
      <>
        {first && (
          <Dialog title="Anterior" onClose={() => {}}>
            Antes
          </Dialog>
        )}
        <Dialog title="Activo" onClose={() => {}}>
          <input aria-label="Búsqueda activa" data-autofocus />
        </Dialog>
      </>
    );
  }
  const view = render(<Multiple first />);
  const focused = screen.getByRole('textbox', { name: 'Búsqueda activa' });
  assert.equal(document.activeElement, focused);
  view.rerender(<Multiple first={false} />);
  assert.equal(document.activeElement, focused);
  assert.notEqual(document.activeElement, opener);
  opener.remove();
});

test('dialog cleanup respects focus already moved by navigation after the dialog was removed', async () => {
  function Navigation() {
    const [open, setOpen] = useState(true);
    const heading = useRef<HTMLHeadingElement>(null);
    useLayoutEffect(() => {
      if (!open) heading.current?.focus();
    }, [open]);
    return (
      <>
        <h1 ref={heading} tabIndex={-1}>
          Planear viaje
        </h1>
        {open && (
          <Dialog title="Ruta guardada" onClose={() => setOpen(false)}>
            Detalle
          </Dialog>
        )}
      </>
    );
  }
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  render(<Navigation />);
  await user().click(screen.getByRole('button', { name: 'Cerrar ventana' }));
  assert.equal(document.activeElement, screen.getByRole('heading', { name: 'Planear viaje' }));
  assert.notEqual(document.activeElement, opener);
  opener.remove();
});

test('a removed opener never receives focus when its dialog closes', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const view = render(
    <Dialog title="Detalle temporal" onClose={() => {}}>
      Ruta
    </Dialog>,
  );
  opener.remove();
  await act(async () => view.unmount());
  assert.equal(document.activeElement, document.body);
});
