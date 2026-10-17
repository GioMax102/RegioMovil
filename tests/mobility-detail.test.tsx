import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import type { MobilityJourney, MobilityNetwork } from '../src/mobility/types';

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
