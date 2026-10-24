import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import {
  getServiceAccess,
  serviceIdentitySources,
  serviceIdentityVerifiedAt,
} from '../src/data/serviceIdentity';

const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://localhost/',
});
const previous = new Map<string, PropertyDescriptor | undefined>();
const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDialogElement',
  'Element',
  'Node',
  'MutationObserver',
  'Event',
  'getComputedStyle',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
for (const name of names) {
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
const sourceHooks = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { render, screen, within, cleanup } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { default: ServiceIdentity } = await import('../src/components/ServiceIdentity');
const { Dialog } = await import('../src/components/Primitives');
afterEach(() => cleanup());
after(() => {
  sourceHooks.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});

test('published Metro and Transmetro policy does not spread to unverified urban bus validators', () => {
  for (const networkId of ['metrorrey', 'transmetro']) {
    const value = getServiceAccess({ networkId, code: networkId === 'metrorrey' ? 'L1' : 'TM' });
    assert.equal(value.paymentStatus, 'published');
    assert.deepEqual(value.paymentMethods, ['me-muevo', 'urbani']);
  }
  for (const networkId of ['muevo-leon', 'troncales-integradas', 'ecovia', 'another-network']) {
    const value = getServiceAccess({ networkId, code: '105' });
    assert.equal(value.paymentStatus, 'unknown');
    assert.deepEqual(value.paymentMethods, []);
    assert.equal(value.vehicle.color, undefined);
  }
});

test('Regio Ruta guidance includes the mandatory access card and does not announce payment on unopened lines', () => {
  const regio = getServiceAccess({ networkId: 'regioruta', routeId: 'regioruta-a', code: 'A' });
  assert.deepEqual(regio.paymentMethods, ['regioruta-card']);
  assert.deepEqual(regio.paymentSourceIds, ['regioruta']);
  for (const input of [
    { networkId: 'metrorrey', routeId: 'L4', code: 'L4' },
    { networkId: 'regioruta', code: 'X', status: 'announced' },
    { networkId: 'transmetro', code: 'TM', status: 'construction' },
  ]) {
    const value = getServiceAccess(input);
    assert.equal(value.paymentStatus, 'unavailable');
    assert.deepEqual(value.paymentMethods, []);
  }
});

test('vehicle color applies only to a documented circuit and keeps exact dated official provenance', () => {
  const documented = getServiceAccess({
    networkId: 'transmetro',
    routeId: 'transmetro-mederos-el-uro',
    code: 'TM',
  });
  assert.ok(documented.vehicle.color);
  assert.deepEqual(documented.vehicle.sourceIds, ['mederos']);
  assert.match(documented.vehicle.note, /Puede cambiar la unidad/);
  const other = getServiceAccess({
    networkId: 'transmetro',
    routeId: 'transmetro-otro',
    code: 'TM',
  });
  assert.equal(other.vehicle.color, undefined);
  for (const source of Object.values(serviceIdentitySources)) {
    assert.equal(source.verifiedAt, serviceIdentityVerifiedAt);
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(
      [
        'www.metrorrey.mx',
        'www.monterrey.gob.mx',
        'www.imanuevoleon.mx',
        'beta.nl.gob.mx',
      ].includes(new URL(source.url).hostname),
    );
  }
});

test('a payment explanation closes without dismissing the surrounding route detail', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  let routeClosed = false;
  render(
    <Dialog
      title="Detalle de Línea 1"
      onClose={() => {
        routeClosed = true;
      }}
    >
      <h3>Talleres a Exposición</h3>
      <ServiceIdentity networkId="metrorrey" routeId="L1" code="L1" mode="metro" />
    </Dialog>,
  );
  await user.click(screen.getByRole('button', { name: 'Cómo pagar con Me Muevo' }));
  const payment = screen.getByRole('dialog', { name: 'Cómo pagar con Me Muevo' });
  assert.match(payment.textContent ?? '', /recarga en efectivo no significa/);
  assert.ok(within(payment).getByRole('link', { name: /Metrorrey.*pestaña nueva/ }));
  await user.click(within(payment).getByRole('button', { name: 'Entendido' }));
  assert.equal(screen.queryByRole('dialog', { name: 'Cómo pagar con Me Muevo' }), null);
  assert.equal(routeClosed, false);
  assert.ok(screen.getByRole('dialog', { name: 'Detalle de Línea 1' }));
});

test('unknown bus payment stays explicit and compact variants preserve the route number', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  render(<ServiceIdentity networkId="muevo-leon" routeId="ima-105" code="105" compact />);
  assert.equal(screen.queryByRole('button', { name: 'Cómo pagar con Me Muevo' }), null);
  assert.ok(screen.getByText('105', { exact: true }));
  await user.click(screen.getByRole('button', { name: 'Cómo confirmar el pago con el operador' }));
  const dialog = screen.getByRole('dialog', { name: 'Confirma el pago antes de abordar' });
  assert.match(dialog.textContent ?? '', /Efectivo, Tarjeta Feria, Me Muevo y QR pueden depender/);
  assert.match(dialog.textContent ?? '', /No contamos con confirmación/);
  await user.click(within(dialog).getByRole('button', { name: 'Entendido' }));
  assert.equal(screen.queryByRole('dialog'), null);
});

test('free Regio Ruta chip explains access rather than suggesting a fare or another payment card', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  render(<ServiceIdentity networkId="regioruta" routeId="regioruta-a" code="A" />);
  await user.click(screen.getByRole('button', { name: 'Acceso gratuito a Regio Ruta' }));
  const dialog = screen.getByRole('dialog', { name: 'Acceso gratuito a Regio Ruta' });
  assert.match(dialog.textContent ?? '', /1 de septiembre de 2026/);
  assert.match(dialog.textContent ?? '', /validar cada viaje/);
  assert.match(dialog.textContent ?? '', /trámite de la tarjeta también es gratuito/);
});
