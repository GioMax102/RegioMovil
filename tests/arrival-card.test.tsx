import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ArrivalCard } from '../src/components/Primitives';
import type { Arrival } from '../src/types';

const arrival: Arrival = {
  id: 'unit-test',
  lineId: 'L1',
  lineName: 'Línea 1',
  direction: 'Exposición',
  etaMinutes: 9.43,
  etaRange: [7, 12],
  occupancy: 80,
  occupancyLabel: 'Alta',
  climate: 'unavailable',
  accessible: 'unknown',
  condition: 'unknown',
  confidence: 0.5,
  source: 'simulation',
};

function unitCard(data = arrival) {
  return new JSDOM(renderToStaticMarkup(<ArrivalCard arrival={data} onDetails={() => {}} />));
}

test('arrival card shows the simulated ETA range instead of a precise minute estimate', () => {
  const dom = unitCard();
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.arrival-time strong')?.textContent, '7–12');
    assert.match(doc.querySelector('.arrival-estimate')!.textContent!, /Llegada estimada/);
    const button = doc.querySelector('button')!;
    assert.equal(button.type, 'button');
    assert.match(button.getAttribute('aria-label')!, /llegada simulada en 7 a 12 minutos/);
    assert.match(doc.querySelector('.arrival-badges')!.textContent!, /Simulación/);
  } finally {
    dom.window.close();
  }
});

test('crowding and cooling use explicit text labels, including unknown cooling', () => {
  for (const climate of ['unavailable', 'unknown', 'working']) {
    const dom = unitCard({ ...arrival, climate });
    try {
      const doc = dom.window.document;
      assert.match(doc.querySelector('.arrival-crowding.is-busy')!.textContent!, /AfluenciaAlta/);
      assert.match(doc.querySelector('.arrival-cooling')!.textContent!, /Aire acondicionado/);
      assert.equal(
        doc.querySelector('.climate')!.textContent,
        climate === 'working'
          ? 'Disponible'
          : climate === 'unknown'
            ? 'Sin información'
            : 'No disponible',
      );
      assert.match(
        doc.querySelector('button')!.getAttribute('aria-label')!,
        /Aire acondicionado simulado/,
      );
    } finally {
      dom.window.close();
    }
  }
});
