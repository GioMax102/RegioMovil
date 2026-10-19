import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import DeferredSection from '../src/components/DeferredSection';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'location',
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
const { render, screen, cleanup, act } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const user = userEvent.setup({ document: dom.window.document });
afterEach(async () => {
  await act(async () => cleanup());
});
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

test('an unavailable network module keeps navigation available and retries only on request', async () => {
  let attempts = 0;
  let home = 0;
  let metro = 0;
  let retries = 0;
  const load = async () => {
    attempts++;
    if (attempts === 1) throw new TypeError('Failed to fetch dynamically imported module');
    return { default: ({ label }: { label: string }) => <h2>{label}</h2> };
  };
  function View({ label }: { label: string }) {
    return (
      <>
        <button onClick={() => home++}>Inicio</button>
        <DeferredSection
          load={load}
          componentProps={{ label }}
          loadingLabel="Abriendo las redes…"
          onRetry={() => retries++}
          fallback={<button onClick={() => metro++}>Ver estaciones de Metro</button>}
        />
      </>
    );
  }
  const view = render(<View label="Red de transporte" />);
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Inicio', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Ver estaciones de Metro', exact: true }));
  assert.equal(home, 1);
  assert.equal(metro, 1);
  view.rerender(<View label="Rutas y redes" />);
  assert.equal(attempts, 1, 'Renders must not create a retry loop while disconnected.');
  await user.click(screen.getByRole('button', { name: 'Volver a intentar', exact: true }));
  assert.equal(retries, 1);
  assert.equal(
    attempts,
    1,
    'Recovery must replace the document rather than repeat a browser-cached ESM failure.',
  );
  view.unmount();
  render(<View label="Rutas y redes" />);
  await screen.findByRole('heading', { name: 'Rutas y redes' });
  assert.equal(attempts, 2);
  assert.equal(screen.queryByRole('alert'), null);
});

test('leaving the section ignores a late import failure and allows a fresh visit', async () => {
  let rejectDownload!: (reason: Error) => void;
  const pending = new Promise<{ default: React.ComponentType<object> }>((_, reject) => {
    rejectDownload = reject;
  });
  const view = render(
    <DeferredSection
      load={() => pending}
      componentProps={{}}
      loadingLabel="Abriendo las redes…"
      onRetry={() => {}}
    />,
  );
  assert.ok(screen.getByRole('status'));
  view.unmount();
  await act(async () => rejectDownload(new Error('Download interrupted')));
  render(
    <DeferredSection
      load={async () => ({ default: () => <h2>Red disponible</h2> })}
      componentProps={{}}
      loadingLabel="Abriendo las redes…"
      onRetry={() => {}}
    />,
  );
  await screen.findByRole('heading', { name: 'Red disponible' });
  assert.equal(screen.queryByRole('alert'), null);
});
