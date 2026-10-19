import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import type { Board, Station } from '../src/types';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: HomeDashboard } = await import('../src/components/HomeDashboard');
styles.deregister();

const station: Station = {
  id: 'talleres',
  name: 'Talleres',
  municipality: 'Monterrey',
  lat: 25.75,
  lng: -100.37,
  lineIds: ['L1'],
  accessibility: 'unknown',
};
const board: Board = {
  stationId: station.id,
  generatedAt: '2026-10-18T15:00:00Z',
  mode: 'simulation',
  scenario: 'normal',
  arrivals: [],
  forecast: [45, 30, 60, 25, 32, 26, 2].map((occupancy, index) => ({
    hour: `${index + 9}:00`,
    occupancy,
  })),
  advice: { title: 'Compara antes de salir', body: 'El tiempo y el espacio son estimaciones.' },
  alerts: [],
};
function dashboard(data: Board | null) {
  const noop = () => {};
  return new JSDOM(
    renderToStaticMarkup(
      <HomeDashboard
        station={station}
        board={data}
        loading={!data}
        favorite={false}
        onFavorite={noop}
        onArrival={noop}
        onNetwork={noop}
        onSaved={noop}
        onStationDetails={noop}
        onReport={noop}
      />,
    ),
  );
}

test('home recommends a quieter hour only from the forecast displayed and keeps simulation explicit', () => {
  const dom = dashboard(board);
  try {
    const doc = dom.window.document;
    assert.match(
      doc.querySelector('.home-quiet-hour')!.textContent!,
      /Menor afluencia prevista12:00/,
    );
    assert.equal(doc.querySelectorAll('.forecast-column').length, 6);
    assert.match(doc.body.textContent!, /AFLUENCIA SIMULADA/);
    assert.match(doc.body.textContent!, /Pronóstico de demostración/);
    assert.equal((doc.querySelector('.home-advice') as HTMLDetailsElement).open, false);
    assert.match(doc.querySelector('.home-advice summary')!.textContent!, /Compara antes de salir/);
    assert.equal(doc.querySelector('.home-mountain-lines')!.getAttribute('aria-hidden'), 'true');
  } finally {
    dom.window.close();
  }
});

test('home with no forecast never fabricates a quieter hour or hides the saved and network actions', () => {
  for (const data of [null, { ...board, forecast: [] }]) {
    const dom = dashboard(data);
    try {
      const doc = dom.window.document;
      assert.equal(doc.querySelector('.home-quiet-hour'), null);
      const actions = doc.querySelector('.home-shortcuts')!.textContent!;
      assert.match(actions, /Tus rutas guardadas/);
      assert.match(actions, /Explorar la red/);
      if (!data) assert.match(doc.querySelector('[role="status"]')!.textContent!, /Preparando/);
    } finally {
      dom.window.close();
    }
  }
});
