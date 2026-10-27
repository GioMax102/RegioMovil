import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import {
  readStationFavorites,
  toggleStationFavorite,
  useStationFavorites,
  type FavoriteStation,
} from '../src/components/stationFavorites';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'Event',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof Window],
  });
}
const { act, cleanup, fireEvent, render, screen } = await import('@testing-library/react');
beforeEach(() => localStorage.clear());
afterEach(cleanup);
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous)
    descriptor
      ? Object.defineProperty(globalThis, name, descriptor)
      : Reflect.deleteProperty(globalThis, name);
});
const bus: FavoriteStation = {
  id: 'route:p1',
  stopId: 'route:p1',
  name: 'Parada publicada',
  lat: 25.7,
  lng: -100.3,
  kind: 'bus',
};

function FavoritesView({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { entries, favorites, toggleFavorite } = useStationFavorites(disabled);
  return (
    <section aria-label={label}>
      <output aria-label={`${label} nombres`}>
        {entries.map((entry) => entry.name).join(', ')}
      </output>
      <button
        type="button"
        aria-pressed={favorites.includes(bus.id)}
        onClick={() => toggleFavorite(bus)}
      >
        {label} guardar
      </button>
    </section>
  );
}

test('legacy Metro string favorites survive malformed optional bus metadata and reject unknown entries', () => {
  localStorage.setItem(
    'regiomovil:favorites',
    JSON.stringify(['talleres', 'missing', 'talleres', 42]),
  );
  localStorage.setItem('regiomovil:favoriteStops', 'broken');
  assert.deepEqual(
    readStationFavorites().map((entry) => [entry.id, entry.stopId, entry.kind]),
    [['talleres', 'metro:talleres', 'metro']],
  );
  assert.equal(toggleStationFavorite('missing'), null);
});

test('public bus stops share the existing favorites key and are removed together with their metadata', () => {
  localStorage.setItem('regiomovil:favorites', JSON.stringify(['talleres']));
  assert.deepEqual(toggleStationFavorite(bus), { saved: true, persisted: true });
  assert.deepEqual(JSON.parse(localStorage.getItem('regiomovil:favorites')!), ['talleres', bus.id]);
  assert.deepEqual(
    readStationFavorites().map((entry) => entry.name),
    ['Talleres', bus.name],
  );
  assert.deepEqual(toggleStationFavorite(bus.id), { saved: false, persisted: true });
  assert.deepEqual(JSON.parse(localStorage.getItem('regiomovil:favoriteStops')!), []);
  assert.deepEqual(
    readStationFavorites().map((entry) => entry.id),
    ['talleres'],
  );
});

test('invalid coordinates, mismatched IDs and disguised Metro entries are never saved as bus stops', () => {
  for (const invalid of [
    { ...bus, lat: NaN },
    { ...bus, lat: 0, lng: 0 },
    { ...bus, stopId: 'different' },
    { ...bus, id: 'talleres', stopId: 'talleres' },
  ])
    assert.equal(toggleStationFavorite(invalid), null);
  assert.equal(localStorage.length, 0);
});

test('saving or removing from one view immediately updates every mounted view and later mounts', () => {
  const mounted = render(
    <>
      <FavoritesView label="Guía" />
      <FavoritesView label="Guardadas" />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Guía guardar' }));
  assert.equal(
    screen.getByRole('button', { name: 'Guardadas guardar' }).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(screen.getByLabelText('Guardadas nombres').textContent, bus.name);
  mounted.unmount();
  render(<FavoritesView label="Reabierta" />);
  assert.equal(
    screen.getByRole('button', { name: 'Reabierta guardar' }).getAttribute('aria-pressed'),
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reabierta guardar' }));
  assert.equal(readStationFavorites().length, 0);
});

test('cross-tab storage changes refresh favorites and a disabled kiosk hook never exposes or writes them', async () => {
  localStorage.setItem('regiomovil:favorites', JSON.stringify(['talleres']));
  render(
    <>
      <FavoritesView label="App" />
      <FavoritesView label="Kiosco" disabled />
    </>,
  );
  assert.equal(screen.getByLabelText('App nombres').textContent, 'Talleres');
  assert.equal(screen.getByLabelText('Kiosco nombres').textContent, '');
  fireEvent.click(screen.getByRole('button', { name: 'Kiosco guardar' }));
  assert.equal(localStorage.getItem('regiomovil:favoriteStops'), null);
  await act(async () => {
    localStorage.setItem('regiomovil:favorites', '[]');
    window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'regiomovil:favorites' }));
  });
  assert.equal(screen.getByLabelText('App nombres').textContent, '');
});

test('a failed ID write restores bus metadata and reports that a bookmark was not persisted', (context) => {
  toggleStationFavorite(bus);
  const beforeStops = localStorage.getItem('regiomovil:favoriteStops');
  const setItem = dom.window.Storage.prototype.setItem;
  context.mock.method(
    dom.window.Storage.prototype,
    'setItem',
    function (key: string, value: string) {
      if (key === 'regiomovil:favorites') throw new Error('Quota exceeded');
      return setItem.call(this, key, value);
    },
  );
  assert.deepEqual(toggleStationFavorite(bus.id), { saved: true, persisted: false });
  assert.equal(localStorage.getItem('regiomovil:favoriteStops'), beforeStops);
  assert.deepEqual(
    readStationFavorites().map((entry) => entry.id),
    [bus.id],
  );
});
