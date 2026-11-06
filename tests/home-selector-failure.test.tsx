import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLDialogElement: dom.window.HTMLDialogElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  Event: dom.window.Event,
  location: dom.window.location,
  localStorage: dom.window.localStorage,
  getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true,
  fetch: async () => assert.fail('Opening a failed picker must not fetch catalog, routes or GPS.'),
})) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
dom.window.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('/HomeTransportPicker.tsx'))
      return {
        format: 'module',
        source: `throw new Error('Picker download failed'); export default null;`,
        shortCircuit: true,
      };
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { HomeTransportTools } = await import('../src/components/HomeTransportHub');
const { network } = await import('../src/api');
const { render, screen, cleanup } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
afterEach(cleanup);
after(() => {
  hooks.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

test('a failed optional picker remains inside its dialog and preserves the active Home context', async () => {
  let errors = 0,
    selections = 0;
  class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch() {
      errors++;
    }
    render() {
      return this.state.failed ? <h1>Global fallback</h1> : this.props.children;
    }
  }
  render(
    <Boundary>
      <HomeTransportTools
        selection={{ kind: 'metro', stationId: network.stations[0].id, source: 'base' }}
        onSelect={() => selections++}
      />
    </Boundary>,
  );
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole('button', { name: /Cambiar transporte:/ }));
  assert.match(
    (await screen.findByRole('alert')).textContent!,
    /Tu transporte actual sigue disponible/,
  );
  assert.ok(screen.getByRole('dialog', { name: 'Elige tu transporte' }));
  await user.click(screen.getByRole('button', { name: 'Cerrar selector' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(
    screen.getByRole('button', {
      name: new RegExp(`Cambiar transporte: ${network.stations[0].name}`),
    }),
  );
  assert.equal(screen.queryByRole('heading', { name: 'Global fallback' }), null);
  assert.equal(errors, 0);
  assert.equal(selections, 0);
});
