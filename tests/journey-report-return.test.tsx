import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  clearGuidanceCheckpoint,
  guidanceCheckpointKey,
  guidanceCheckpointTtl,
  readGuidanceCheckpoint,
  saveGuidanceCheckpoint,
} from '../src/mobility/guidanceCheckpoint';
import { journeyReportContext } from '../src/mobility/journeyReportContext';
import { journeyStepAccent } from '../src/mobility/journeyPresentation';
import type { MobilityJourney, MobilityNetwork, MobilityStep } from '../src/mobility/types';

const dom = new JSDOM('', { url: 'https://example.test' });
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: dom.window.localStorage,
});
beforeEach(() => localStorage.clear());
after(() => {
  dom.window.close();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
const step: MobilityStep = {
  mode: 'bus',
  lineId: 'route-1-south',
  lineName: 'Ruta 1',
  code: '1',
  fromId: 'bus:a',
  toId: 'bus:b',
  from: 'Origen',
  to: 'Talleres',
  minutes: 10,
  distanceMeters: 1000,
  stationCount: 1,
  stopIds: ['bus:a', 'bus:b'],
  geometry: [
    [-100.3, 25.7],
    [-100.31, 25.71],
  ],
  experimental: true,
  stopOrderVerified: false,
  source: 'simulation',
  networkId: 'muevo-leon',
  color: '#ff0000',
};
const journey: MobilityJourney = {
  id: 'guide-1',
  title: 'Prueba',
  durationMinutes: 10,
  walkingMinutes: 0,
  walkingMeters: 0,
  transfers: 0,
  occupancy: 20,
  etaRange: [9, 12],
  score: 10,
  steps: [step],
  stationIds: [],
  source: 'simulation',
  accessibility: 'unknown',
};
const busRoute = {
  id: 'route-1-south',
  code: '1',
  name: 'Sur',
  networkId: 'muevo-leon',
  mode: 'bus' as const,
  color: '#4975a4',
  stopOrderVerified: false,
  sourceIds: ['source'],
  segments: [],
};
const network: MobilityNetwork = {
  version: 1,
  mode: 'experimental',
  stops: [
    {
      id: 'bus:a',
      name: 'Origen',
      lng: -100.3,
      lat: 25.7,
      mode: 'bus',
      routeIds: [busRoute.id],
      sourceIds: ['source'],
      official: true,
    },
    {
      id: 'bus:b',
      name: 'Talleres',
      lng: -100.31,
      lat: 25.71,
      mode: 'bus',
      routeIds: [busRoute.id],
      sourceIds: ['source'],
      official: true,
    },
    {
      id: 'rail:first',
      stationId: 'talleres',
      name: 'Talleres',
      lng: -100.32,
      lat: 25.72,
      mode: 'metro',
      routeIds: ['L1'],
      sourceIds: ['source'],
      official: true,
    },
    {
      id: 'rail:last',
      stationId: 'universidad',
      name: 'Universidad',
      lng: -100.33,
      lat: 25.73,
      mode: 'metro',
      routeIds: ['L1'],
      sourceIds: ['source'],
      official: true,
    },
  ],
  routes: [busRoute, { ...busRoute, id: 'route-1-north', name: 'Norte' }],
  coverage: { enormousUnrelatedAudit: 'unrelated' },
  assumptions: [],
  sources: [
    { id: 'source', title: 'Fuente', url: 'https://example.test/map' },
    { id: 'unrelated', title: 'Otro', url: 'https://example.test/other' },
  ],
};

test('guide report resolves exact graph route IDs and never a repeated code or identically named bus stop', () => {
  const context = journeyReportContext(journey, network, 0);
  assert.equal(context.initialRouteId, 'route-1-south');
  assert.equal(context.initialTargetType, 'route');
  assert.equal(context.initialStationIds, undefined);
  assert.deepEqual(context.context, {
    journeyId: 'guide-1',
    stepIndex: 0,
    source: 'journey',
    returnTo: 'guidance',
  });
  assert.equal('initialLocationReference' in context, false);
  assert.equal(
    journeyReportContext({ ...journey, steps: [{ ...step, lineId: '1' }] }, network, 0)
      .initialRouteId,
    undefined,
  );
});

test('Metro stations are proposed by stationId for confirmation; walking does not assert arrival or GPS', () => {
  const metro = {
    ...step,
    mode: 'metro' as const,
    lineId: 'L1',
    fromId: 'rail:first',
    toId: 'rail:last',
    stopIds: ['rail:first', 'rail:last'],
  };
  const result = journeyReportContext({ ...journey, steps: [metro] }, network, 0);
  assert.deepEqual(result.initialStationIds, ['talleres', 'universidad']);
  assert.equal(
    'initialStationId' in result,
    false,
    'No station is silently selected as the observed place.',
  );
  const walk = { ...step, mode: 'walk' as const, lineId: 'walk', toId: 'rail:last' };
  assert.deepEqual(
    journeyReportContext({ ...journey, steps: [walk] }, network, 0).initialStationIds,
    ['universidad'],
  );
  const access = { ...walk, toId: 'bus:a' };
  assert.equal(
    journeyReportContext({ ...journey, steps: [access, step] }, network, 0).initialRouteId,
    step.lineId,
  );
});

test('return checkpoint contains the chosen journey and a bounded network subset without location tracking or city audit', () => {
  const now = 1700000000000;
  const snapshot = saveGuidanceCheckpoint(journey, network, 0, now);
  assert.deepEqual(
    snapshot.network.stops.map((stop) => stop.id),
    ['bus:a', 'bus:b'],
  );
  assert.deepEqual(
    snapshot.network.routes.map((route) => route.id),
    ['route-1-south'],
  );
  assert.deepEqual(snapshot.network.coverage, { snapshot: true });
  assert.deepEqual(snapshot.network.routes[0].segments, []);
  assert.equal(snapshot.network.sources?.length, 1);
  assert.equal(JSON.stringify(snapshot).includes('acceptedFix'), false);
  assert.equal(readGuidanceCheckpoint('different', now), null);
  assert.deepEqual(readGuidanceCheckpoint(journey.id, now + 1000), snapshot);
  assert.equal(readGuidanceCheckpoint(journey.id, now + guidanceCheckpointTtl + 1), null);
  assert.equal(localStorage.getItem(guidanceCheckpointKey), null);
});

test('invalid, excessive and incompatible checkpoints cannot replace a usable return or crash recovery', () => {
  const now = Date.now();
  saveGuidanceCheckpoint(journey, network, 0, now);
  const before = localStorage.getItem(guidanceCheckpointKey);
  assert.throws(() => saveGuidanceCheckpoint(journey, network, 5, now));
  assert.throws(
    () =>
      saveGuidanceCheckpoint(
        {
          ...journey,
          steps: [{ ...step, geometry: Array.from({ length: 100000 }, () => [-100.31, 25.71]) }],
        },
        network,
        0,
        now,
      ),
    /espacio/,
  );
  assert.equal(localStorage.getItem(guidanceCheckpointKey), before);
  clearGuidanceCheckpoint('different');
  assert.equal(localStorage.getItem(guidanceCheckpointKey), before);
  clearGuidanceCheckpoint(journey.id);
  assert.equal(localStorage.getItem(guidanceCheckpointKey), null);
  for (const value of [
    'broken',
    JSON.stringify({ version: 9 }),
    JSON.stringify({ ...JSON.parse(before!), stepIndex: -1 }),
  ]) {
    localStorage.setItem(guidanceCheckpointKey, value);
    assert.equal(readGuidanceCheckpoint(journey.id), null);
  }
});

test('walk, Metro and bus stage accents do not treat an unverified vehicle color as official', () => {
  assert.equal(journeyStepAccent(step), '#4975a4');
  assert.equal(journeyStepAccent({ ...step, mode: 'walk' }), '#9a7137');
  assert.equal(journeyStepAccent({ ...step, mode: 'metro', color: '#ffb030' }), '#ffb030');
  assert.equal(journeyStepAccent({ ...step, mode: 'metro', color: 'url(bad)' }), '#4975a4');
});
