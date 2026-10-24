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
const { default: MetroStationBrowser } = await import('../src/components/MetroStationBrowser');
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

test('Metro search combines line filters with names, municipalities and aliases without accents', async () => {
  render(<Browser />);
  const search = screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' });
  await user.type(search, 'san bernabe');
  assert.equal(results().getAllByRole('button').length, 1);
  assert.match(results().getByRole('button').textContent!, /San Bernabé/);
  await user.clear(search);
  await user.type(search, 'uanl');
  assert.match(results().getByRole('button').textContent!, /Universidad/);
  await user.click(screen.getByRole('button', { name: 'Línea 1', exact: true }));
  assert.equal(results().queryAllByRole('button').length, 0);
  assert.match(screen.getByRole('status').textContent!, /0 estaciones/);
  await user.click(screen.getByRole('button', { name: 'Todas', exact: true }));
  assert.match(results().getByRole('button').textContent!, /Universidad/);
  await user.clear(search);
  await user.type(search, 'san nicolas');
  assert.match(results().getByRole('button').textContent!, /Universidad/);
});

test('Metro filters and station selection work by keyboard, and clearing search restores focus', async () => {
  const selected: string[] = [];
  render(<Browser onSelect={(id) => selected.push(id)} />);
  await user.tab();
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Todas', exact: true }));
  await user.tab();
  await user.tab();
  assert.equal(
    document.activeElement,
    screen.getByRole('button', { name: 'Línea 2', exact: true }),
  );
  await user.keyboard('{Enter}');
  assert.equal(
    screen.getByRole('button', { name: 'Línea 2', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  const station = results().getByRole('button');
  assert.match(station.textContent!, /Universidad/);
  station.focus();
  await user.keyboard(' ');
  assert.deepEqual(selected, ['universidad']);
  assert.equal(station.getAttribute('aria-pressed'), 'true');
  const search = screen.getByRole('textbox', { name: 'Buscar estación por nombre o municipio' });
  await user.type(search, 'uanl');
  await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda de estaciones' }));
  assert.equal(document.activeElement, search);
  assert.equal((search as HTMLInputElement).value, '');
  assert.equal(
    screen.getByRole('button', { name: 'Línea 2', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
});
