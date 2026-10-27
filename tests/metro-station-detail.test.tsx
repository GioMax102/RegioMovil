import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import type { Board, Station } from '../src/types';
const styles = registerHooks({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : next(url, context);
  },
});
const { default: MetroStationDetail } = await import('../src/components/MetroStationDetail');
styles.deregister();
const station: Station = {
  id: 'talleres',
  name: 'Talleres',
  municipality: 'Monterrey',
  lat: 25.753,
  lng: -100.365,
  lineIds: ['L1'],
  accessibility: 'unknown',
};
const board: Board = {
  stationId: station.id,
  generatedAt: '2026-10-24T09:00:00Z',
  mode: 'simulation',
  scenario: 'normal',
  advice: { title: '', body: '' },
  alerts: [],
  forecast: ['03:00', '04:00', '05:00', '06:00'].map((hour) => ({ hour, occupancy: 30 })),
  arrivals: [
    {
      id: 'unit',
      lineId: 'L1',
      lineName: 'Línea 1',
      direction: 'Exposición',
      etaMinutes: 5,
      etaRange: [3, 7],
      occupancy: 30,
      occupancyLabel: 'Baja',
      climate: 'working',
      accessible: 'unknown',
      condition: 'unknown',
      confidence: 0.5,
      source: 'simulation',
    },
  ],
};
function documentAt(date: string) {
  return new JSDOM(
    renderToStaticMarkup(
      <MetroStationDetail
        station={station}
        board={board}
        now={new Date(date)}
        saved={false}
        onSave={() => {}}
        onArrival={() => {}}
      />,
    ),
  );
}
test('station compact header defers photo, accessibility and data provenance behind explicit controls', () => {
  const dom = documentAt('2026-10-24T18:00:00Z');
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.metro-station-heading h2')?.textContent, 'Talleres');
    assert.equal(
      doc.querySelector('img'),
      null,
      'A station photo is not loaded before the eye is used.',
    );
    assert.equal(
      doc.querySelectorAll('.metro-data-disclosure[open],.metro-facilities[open]').length,
      0,
    );
    assert.match(
      doc.querySelector('.metro-data-disclosure')?.textContent ?? '',
      /simuladas.*No son datos en vivo/,
    );
    assert.match(
      doc.querySelector('.metro-facilities')?.textContent ?? '',
      /disponibilidad por confirmar/,
    );
    assert.equal(
      doc.querySelector('.metro-data-disclosure a')?.getAttribute('href'),
      'https://www.metrorrey.mx/',
    );
    assert.equal(doc.querySelectorAll('.arrival-card').length, 1);
  } finally {
    dom.window.close();
  }
});
test('station outside service hours removes imminent units and closed-hour forecast bars', () => {
  const dom = documentAt('2026-10-24T09:00:00Z');
  try {
    const doc = dom.window.document;
    assert.match(doc.querySelector('.metro-closed')?.textContent ?? '', /Fuera de horario.*05:00/);
    assert.equal(doc.querySelectorAll('.arrival-card').length, 0);
    assert.deepEqual(
      [...doc.querySelectorAll('.bar-hour')].map((node) => node.textContent),
      ['05:00', '06:00'],
    );
  } finally {
    dom.window.close();
  }
});

test('station reports the next holiday opening after an early closing', () => {
  const dom = documentAt('2026-12-25T05:15:00Z');
  try {
    assert.match(
      dom.window.document.querySelector('.metro-closed')?.textContent ?? '',
      /Fuera de horario.*07:00/,
    );
    assert.equal(dom.window.document.querySelectorAll('.arrival-card').length, 0);
  } finally {
    dom.window.close();
  }
});
