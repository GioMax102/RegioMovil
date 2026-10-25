import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { useState } from 'react';
import type { Line, Station } from '../src/types';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: MetroStationBrowser, nearestMetroStation } =
  await import('../src/components/MetroStationBrowser');
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
const { render, screen, cleanup, within, act } = await import('@testing-library/react');
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

const stations: Station[] = [
  {
    id: 'san-bernabe',
    name: 'San Bernabé',
    municipality: 'Monterrey',
    lat: 25.75,
    lng: -100.37,
    lineIds: ['L1'],
    accessibility: 'unknown',
  },
  {
    id: 'universidad',
    name: 'Universidad',
    municipality: 'San Nicolás de los Garza',
    aliases: ['UANL', 'Ciudad Universitaria'],
    lat: 25.72,
    lng: -100.31,
    lineIds: ['L2'],
    accessibility: 'unknown',
  },
  {
    id: 'felix',
    name: 'Félix U. Gómez',
    municipality: 'Monterrey',
    lat: 25.68,
    lng: -100.29,
    lineIds: ['L1', 'L3'],
    accessibility: 'unknown',
  },
];
const lines: Line[] = [
  { id: 'L1', name: 'Línea 1', color: '#e9a923', stationIds: ['san-bernabe', 'felix'] },
  { id: 'L2', name: 'Línea 2', color: '#14a34a', stationIds: ['universidad'] },
  { id: 'L3', name: 'Línea 3', color: '#d94f4f', stationIds: ['felix'] },
];
function Browser({ onSelect = () => {} }: { onSelect?: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [selected, setSelected] = useState('san-bernabe');
  return (
    <MetroStationBrowser
      stations={stations}
      lines={lines}
      query={query}
      lineFilter={lineFilter}
      onQueryChange={setQuery}
      onLineFilterChange={setLineFilter}
      selectedStationId={selected}
      onSelect={(id) => {
        setSelected(id);
        onSelect(id);
      }}
    />
  );
}
const results = () => within(screen.getByRole('list', { name: 'Estaciones' }));

test('Metro controls are compact and suggestions stay hidden until the search is used', async () => {
  render(<Browser />);
  assert.equal(screen.queryByRole('list', { name: 'Estaciones' }), null);
  assert.equal(
    screen.getByRole('combobox', { name: 'Línea de Metro' }).getAttribute('aria-label'),
    'Línea de Metro',
  );
  const search = screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' });
  assert.equal(search.getAttribute('placeholder'), 'San Bernabé');
  await user.click(search);
  assert.equal(results().getAllByRole('button').length, 3);
  await user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('list', { name: 'Estaciones' }), null);
});

test('Metro search combines line selection with names, municipalities and aliases without accents', async () => {
  render(<Browser />);
  const search = screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' });
  await user.type(search, 'san bernabe');
  assert.equal(results().getAllByRole('button').length, 1);
  assert.match(results().getByRole('button').textContent!, /San Bernabé/);
  await user.clear(search);
  await user.type(search, 'uanl');
  assert.match(results().getByRole('button').textContent!, /Universidad/);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Línea de Metro' }), 'L1');
  assert.equal(results().getAllByRole('button').length, 2);
  await user.type(search, 'uanl');
  assert.equal(results().queryAllByRole('button').length, 0);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Línea de Metro' }), 'all');
  await user.type(search, 'san nicolas');
  assert.match(results().getByRole('button').textContent!, /Universidad/);
});

test('station selection works by keyboard, closes suggestions and returns focus to the field', async () => {
  const selected: string[] = [];
  render(<Browser onSelect={(id) => selected.push(id)} />);
  const line = screen.getByRole('combobox', { name: 'Línea de Metro' });
  await user.tab();
  assert.equal(document.activeElement, line);
  await user.selectOptions(line, 'L2');
  const station = results().getByRole('button');
  station.focus();
  await user.keyboard(' ');
  assert.deepEqual(selected, ['universidad']);
  const search = screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' });
  assert.equal(document.activeElement, search);
  assert.equal(search.getAttribute('placeholder'), 'Universidad');
  assert.equal(screen.queryByRole('list', { name: 'Estaciones' }), null);
  await user.type(search, 'uanl');
  await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda de estaciones' }));
  assert.equal(document.activeElement, search);
  assert.equal((search as HTMLInputElement).value, '');
  assert.equal((line as HTMLSelectElement).value, 'L2');
});

test('nearby station rejects invalid or remote coordinates instead of silently choosing distant Metro', () => {
  assert.equal(nearestMetroStation(stations, 25.7501, -100.3701)?.id, 'san-bernabe');
  assert.equal(nearestMetroStation(stations, 19.4, -99.1), null);
  assert.equal(nearestMetroStation(stations, NaN, -100), null);
});

test('opening Metro never prompts for location; explicit GPS selects the nearest station', async () => {
  const originalGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  let called = 0;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: PositionCallback) {
        called++;
        success({
          coords: { latitude: 25.72, longitude: -100.31, accuracy: 40 },
        } as GeolocationPosition);
      },
    },
  });
  try {
    const selected: string[] = [];
    render(<Browser onSelect={(id) => selected.push(id)} />);
    assert.equal(called, 0);
    await user.click(
      screen.getByRole('button', { name: 'Encontrar estación cercana con mi ubicación' }),
    );
    assert.equal(called, 1);
    assert.deepEqual(selected, ['universidad']);
    assert.match(screen.getByRole('status').textContent!, /Universidad/);
  } finally {
    if (originalGeo) Object.defineProperty(navigator, 'geolocation', originalGeo);
    else Reflect.deleteProperty(navigator, 'geolocation');
  }
});

test('a previously granted permission permits a single lookup and late GPS never overrides manual selection', async () => {
  const originalGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');
  let callback: PositionCallback | undefined;
  let called = 0;
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: 'granted' }) },
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: PositionCallback) {
        called++;
        callback = success;
      },
    },
  });
  try {
    const selected: string[] = [];
    render(<Browser onSelect={(id) => selected.push(id)} />);
    await act(async () => {});
    assert.equal(called, 1);
    await user.type(
      screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' }),
      'san bernabe',
    );
    await user.click(results().getByRole('button'));
    await act(async () =>
      callback?.({
        coords: { latitude: 25.72, longitude: -100.31, accuracy: 10 },
      } as GeolocationPosition),
    );
    assert.deepEqual(selected, ['san-bernabe']);
    assert.equal(called, 1);
  } finally {
    if (originalGeo) Object.defineProperty(navigator, 'geolocation', originalGeo);
    else Reflect.deleteProperty(navigator, 'geolocation');
    if (originalPermissions) Object.defineProperty(navigator, 'permissions', originalPermissions);
    else Reflect.deleteProperty(navigator, 'permissions');
  }
});
