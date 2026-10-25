import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import React from 'react';
import { JSDOM } from 'jsdom';
import { stationPhotos } from '../src/data/stationPhotos';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
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
const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: StationStreetView, stationStreetViewUrl } =
  await import('../src/components/StationStreetView');
const { render, screen, within, cleanup } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
afterEach(cleanup);
after(() => {
  styles.deregister();
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
const station = { id: 'talleres', name: 'Talleres', lat: 25.759167, lng: -100.368333 };

test('Street View links require valid regional numeric coordinates and never request an API key', () => {
  const url = new URL(stationStreetViewUrl(station.lat, station.lng)!);
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('map_action'), 'pano');
  assert.equal(url.searchParams.get('viewpoint'), '25.759167,-100.368333');
  assert.equal(url.searchParams.has('key'), false);
  for (const [lat, lng] of [
    [NaN, -100.3],
    [25.7, Infinity],
    [0, 0],
    [25.7, -101],
    [90, 180],
  ])
    assert.equal(stationStreetViewUrl(lat, lng), null);
  assert.equal(stationStreetViewUrl('25.7' as unknown as number, -100.3), null);
});

test('compact actions show a photo control only for documented photographs, and keep the secure Maps link', () => {
  const { rerender, container } = render(<StationStreetView station={station} compact />);
  assert.ok(screen.getByRole('button', { name: 'Ver fotografía de Talleres' }));
  assert.equal(container.querySelector('img,iframe'), null);
  const link = screen.getByRole('link', { name: /Google Maps/ });
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('referrerPolicy'), 'no-referrer');
  assert.match(link.getAttribute('rel')!, /noopener/);
  rerender(
    <StationStreetView station={{ ...station, id: 'padre-mier', name: 'Padre Mier' }} compact />,
  );
  assert.equal(screen.queryByRole('button', { name: /fotografía/ }), null);
  assert.equal(container.querySelector('.station-image-info'), null);
});

test('photo opens on demand with historical date, source and licence; closing preserves the station', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  render(<StationStreetView station={station} compact />);
  await user.click(screen.getByRole('button', { name: 'Ver fotografía de Talleres' }));
  const dialog = screen.getByRole('dialog', { name: 'Talleres' });
  const image = dialog.querySelector('img')!;
  assert.ok(image.getAttribute('src')!.startsWith('/assets/station-photos/'));
  assert.equal(image.getAttribute('loading'), 'lazy');
  assert.match(dialog.textContent!, /Fotografía histórica · 2007/);
  assert.match(dialog.textContent!, /Omaaar · Dominio público/);
  const licences = JSON.parse(await readFile('public/licenses/station-photos.json', 'utf8'));
  const licence = licences.photos.find(
    (item: { stationKey: string }) => item.stationKey === 'metro:talleres',
  );
  assert.equal(licence.file, stationPhotos['metro:talleres'].src);
  const bytes = await readFile(`public${licence.file}`);
  assert.ok(bytes.length < 80 * 1024);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), licence.localSha256);
  assert.equal(dialog.querySelector('figcaption a')!.getAttribute('href'), licence.sourceUrl);
  await user.click(within(dialog).getByRole('button', { name: /Cerrar/ }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(screen.getByRole('button', { name: 'Ver fotografía de Talleres' }));
});

test('unverified image explanations are initially collapsed and invalid coordinates cannot open Google Maps', () => {
  const { container } = render(
    <StationStreetView station={{ ...station, id: 'unknown', lat: NaN }} />,
  );
  assert.equal(screen.queryByRole('link', { name: /Google Maps/ }), null);
  const info = container.querySelector('.station-image-info') as HTMLDetailsElement;
  assert.equal(info.open, false);
  assert.match(info.textContent!, /no tenemos una fotografía verificada/);
  assert.match(info.textContent!, /no es una vista en vivo/);
  assert.match(info.textContent!, /ubicación válida dentro de la ZMM/);
});
