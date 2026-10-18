import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import type { MobilityJourney, MobilityNetwork, MobilityStep } from '../src/mobility/types';
import { isCompactTransfer, presentJourneySteps } from '../src/mobility/journeyPresentation';

const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { default: MobilityJourneyDetail } = await import('../src/mobility/MobilityJourneyDetail');
hooks.deregister();

const network: MobilityNetwork = {
  version: 1,
  mode: 'experimental',
  stops: [],
  coverage: {},
  assumptions: [],
  routes: [
    {
      id: 'bus-1',
      code: '130',
      name: 'Ruta urbana',
      networkId: 'ima',
      mode: 'bus',
      color: '#067850',
      stopOrderVerified: false,
      sourceIds: ['used'],
      segments: [],
    },
  ],
  sources: [
    { id: 'used', title: 'Mapa de la ruta', url: 'https://example.org/mapa' },
    { id: 'other', title: 'Otro recorrido', url: 'https://example.org/otro' },
  ],
};
const journey: MobilityJourney = {
  id: 'trip',
  title: 'Una conexión',
  durationMinutes: 30,
  walkingMinutes: 3,
  walkingMeters: 200,
  transfers: 1,
  occupancy: 30,
  etaRange: [25, 35],
  score: 30,
  stationIds: [],
  source: 'simulation',
  accessibility: 'unknown',
  steps: [
    {
      mode: 'bus',
      lineId: 'bus-1',
      lineName: 'Ruta 130',
      fromId: 'a',
      toId: 'b',
      from: 'Origen',
      to: 'Destino',
      minutes: 27,
      distanceMeters: 5000,
      stationCount: 12,
      geometry: [
        [-100.3, 25.6],
        [-100.31, 25.61],
      ],
      experimental: true,
      stopOrderVerified: false,
      source: 'simulation',
      networkId: 'ima',
    },
  ],
};

test('journey detail retains travel facts, uncertainty and relevant provenance in its compact layout', () => {
  const dom = new JSDOM(
    renderToStaticMarkup(<MobilityJourneyDetail journey={journey} network={network} />),
  );
  const doc = dom.window.document;
  assert.match(
    doc.querySelector('[aria-label="Resumen del trayecto"]')!.textContent!,
    /25–35 min.*1 transbordo.*200 m a pie/,
  );
  assert.match(
    doc.querySelector('ol')!.textContent!,
    /Ruta 130.*Origen.*Destino.*Sentido por confirmar.*27 min.*12 tramos/,
  );
  assert.match(doc.querySelector('details')!.textContent!, /orden inferido del mapa/);
  assert.equal(
    doc.querySelector('a[href="https://example.org/mapa"]')?.textContent,
    'Mapa de la ruta',
  );
  assert.equal(doc.querySelector('a[href="https://example.org/otro"]'), null);
  dom.window.close();
});

test('verified journeys remove bus uncertainty and describe a direct trip without transfers', () => {
  const verifiedJourney: MobilityJourney = {
    ...journey,
    transfers: 0,
    steps: journey.steps.map((step) => ({
      ...step,
      stopOrderVerified: true,
      directionVerified: true,
    })),
  };
  const dom = new JSDOM(
    renderToStaticMarkup(<MobilityJourneyDetail journey={verifiedJourney} network={network} />),
  );
  assert.match(dom.window.document.body.textContent!, /Sin transbordos/);
  assert.doesNotMatch(
    dom.window.document.body.textContent!,
    /Sentido por confirmar|orden inferido del mapa/,
  );
  dom.window.close();
});

test('short links between vehicles read as transfers without hiding access or arrival walks', () => {
  const transport = journey.steps[0];
  const walk = (minutes: number, distanceMeters: number): MobilityStep => ({
    ...transport,
    mode: 'walk',
    lineId: 'walk',
    lineName: 'Camina',
    minutes,
    distanceMeters,
  });
  const short = walk(1, 31);
  const long = walk(4, 280);
  const steps: MobilityStep[] = [
    walk(1, 40),
    transport,
    short,
    { ...transport, mode: 'metro', lineId: 'L1', lineName: 'Línea 1' },
    long,
    { ...transport, lineName: 'Transmetro' },
    walk(1, 30),
  ];
  const raw = JSON.stringify(steps);
  assert.deepEqual(
    presentJourneySteps(steps).map((entry) => entry.kind),
    ['leg', 'leg', 'transfer', 'leg', 'leg', 'leg', 'leg'],
  );
  assert.equal(
    presentJourneySteps(steps)[2].step,
    short,
    'Presentation retains the original step.',
  );
  const dom = new JSDOM(
    renderToStaticMarkup(
      <MobilityJourneyDetail
        journey={{ ...journey, walkingMeters: 381, steps }}
        network={network}
      />,
    ),
  );
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('.journey-detail-transfer').length, 1);
    assert.match(
      doc.querySelector('.journey-detail-transfer')!.textContent!,
      /Cambia a Línea 1.*31 m entre paradas · 1 min/,
    );
    assert.equal(
      [...doc.querySelectorAll('h3')].filter((heading) => heading.textContent === 'Camina').length,
      3,
    );
    assert.match(
      doc.querySelector('[aria-label="Resumen del trayecto"]')!.textContent!,
      /381 m a pie/,
    );
    assert.match(doc.querySelector('ol')!.textContent!, /4 min.*280 m/);
    assert.equal(
      JSON.stringify(steps),
      raw,
      'Raw saved geometry and times must never be rewritten.',
    );
  } finally {
    dom.window.close();
  }
});

test('transfer threshold is under three minutes and 250 metres, and consecutive walks remain explicit', () => {
  const transport = journey.steps[0];
  const between = (minutes: number, distanceMeters: number) =>
    [
      transport,
      { ...transport, mode: 'walk', minutes, distanceMeters },
      transport,
    ] as MobilityStep[];
  for (const [minutes, meters, compact] of [
    [0, 0, true],
    [2, 128, true],
    [3, 128, false],
    [2, 250, false],
    [NaN, 31, false],
    [1, Infinity, false],
    [-1, 31, false],
  ] as [number, number, boolean][])
    assert.equal(isCompactTransfer(between(minutes, meters), 1), compact);
  const adjacent = between(1, 31);
  adjacent.splice(1, 0, { ...adjacent[1] });
  assert.ok(adjacent.every((_, index) => !isCompactTransfer(adjacent, index)));
});
