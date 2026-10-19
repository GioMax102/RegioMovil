import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceGuidance,
  createGuidanceRoute,
  describeGuidance,
  expireGuidance,
  initialGuidanceState,
  updateGuidance,
} from '../src/mobility/guidance';
import type { PositionFix } from '../src/mobility/location';
import type {
  Coordinates,
  MobilityJourney,
  MobilityNetwork,
  MobilityStep,
} from '../src/mobility/types';

const baseTime = 1780000000000;
const coordinate = (meters: number): Coordinates => [
  -100.4 + meters / (111195 * Math.cos((25.7 * Math.PI) / 180)),
  25.7,
];
const fix = (
  meters: number,
  seconds: number,
  overrides: Partial<PositionFix> = {},
): PositionFix => {
  const [lng, lat] = coordinate(meters);
  return { lng, lat, accuracy: 8, timestamp: baseTime + seconds * 1000, ...overrides };
};
const step = (
  from: number,
  to: number,
  mode: MobilityStep['mode'],
  id: string,
  destination: string,
): MobilityStep => ({
  mode,
  lineId: id,
  lineName: id === 'L1' ? 'Línea 1' : id === 'bus' ? 'Transmetro conexión' : 'A pie',
  fromId: `${from}`,
  toId: `${to}`,
  from: `Referencia ${from}`,
  to: destination,
  minutes: mode === 'walk' ? 1 : 10,
  distanceMeters: to - from,
  stationCount: 2,
  geometry: [coordinate(from), coordinate(to)],
  experimental: true,
  stopOrderVerified: true,
  directionVerified: true,
  source: 'simulation',
});
const steps = [
  step(0, 1000, 'metro', 'L1', 'Conexión'),
  step(1000, 1050, 'walk', 'walk', 'Andén de autobús'),
  step(1050, 2500, 'bus', 'bus', 'Destino'),
];
Object.assign(steps[0], { fromId: 'a', toId: 'c', stopIds: ['a', 'b', 'c'] });
Object.assign(steps[2], { fromId: 'd', toId: 'f', stopIds: ['d', 'e', 'f'] });
const journey = {
  id: 'guide-test',
  steps,
  stationIds: ['a', 'b', 'c', 'd', 'e', 'f'],
} as MobilityJourney;
const network = {
  version: 1,
  mode: 'experimental',
  routes: [],
  coverage: {},
  assumptions: [],
  stops: [
    ['a', 0, 'Inicio', 'L1'],
    ['b', 400, 'Intermedia', 'L1'],
    ['c', 1000, 'Conexión', 'L1'],
    ['d', 1050, 'Andén de autobús', 'bus'],
    ['e', 2000, 'Parada intermedia', 'bus'],
    ['f', 2500, 'Destino', 'bus'],
  ].map(([id, distance, name, route]) => {
    const [lng, lat] = coordinate(Number(distance));
    return {
      id,
      name,
      lng,
      lat,
      mode: route === 'L1' ? 'metro' : 'bus',
      official: true,
      routeIds: [route],
      sourceIds: [],
    };
  }),
} as MobilityNetwork;
const route = createGuidanceRoute(journey, network);
const update = (
  state: ReturnType<typeof initialGuidanceState>,
  meters: number,
  seconds: number,
  overrides: Partial<PositionFix> = {},
) => {
  const point = fix(meters, seconds, overrides);
  return updateGuidance(route, state, point, baseTime + seconds * 1000);
};

test('sequential GPS names the next published stop, warns of alighting, and waits for deliberate transfer confirmation', () => {
  let state = initialGuidanceState();
  for (const [meters, seconds] of [
    [0, 0],
    [200, 10],
    [450, 20],
    [700, 30],
  ])
    state = update(state, meters, seconds);
  const approaching = describeGuidance(route, state);
  assert.equal(approaching.nextStop?.name, 'Conexión');
  assert.equal(approaching.remainingStops, 1);
  assert.equal(approaching.title, 'Baja en la siguiente estación');
  state = update(state, 1000, 40);
  assert.equal(state.atStepEnd, false, 'One fix does not establish arrival.');
  state = update(state, 1000, 44);
  assert.equal(state.atStepEnd, true);
  assert.equal(state.stepIndex, 0);
  assert.equal(describeGuidance(route, state).title, 'Haz transbordo');
  assert.match(describeGuidance(route, state).detail, /Transmetro conexión/);
  state = advanceGuidance(route, state);
  assert.equal(state.stepIndex, 1);
  assert.match(describeGuidance(route, state).title, /Haz transbordo/);
  assert.equal(advanceGuidance(route, state).stepIndex, 2);
});

test('low accuracy, stale timestamps, duplicate events, implausible speed and GPS jumps cannot increase progress', () => {
  const initial = update(initialGuidanceState(), 0, 0);
  for (const overrides of [
    { accuracy: 250 },
    { accuracy: NaN },
    { speed: 90 },
    { speed: -5 },
    { timestamp: baseTime - 30000 },
    { timestamp: baseTime + 60000 },
  ]) {
    const state = updateGuidance(route, initial, fix(200, 10, overrides), baseTime + 10000);
    assert.equal(state.along, 0);
    assert.equal(state.stepIndex, 0);
  }
  assert.equal(update(initial, 900, 1).quality, 'imprecise');
  assert.equal(update(initial, 900, 0), initial);
  assert.equal(expireGuidance(initial, baseTime + 21000).quality, 'stale');
  assert.equal(expireGuidance(initial, baseTime + 10000), initial);
});

test('a long tunnel gap never teleports through the route, and off-route needs sustained evidence', () => {
  let state = update(initialGuidanceState(), 0, 0);
  state = update(state, 950, 120);
  assert.equal(state.along, 0);
  assert.equal(state.quality, 'unconfirmed');
  state = update(state, 950, 124);
  assert.equal(state.quality, 'off-route');
  assert.equal(state.stepIndex, 0);
  assert.match(describeGuidance(route, state).title, /no coincide/);
  const manual = advanceGuidance(route, state);
  assert.equal(manual.stepIndex, 1);
  assert.equal(manual.quality, 'waiting');
});

test('shared and overlapping geometry never selects a future leg or a distant branch of the same leg', () => {
  const loop = {
    ...journey,
    steps: [
      { ...steps[0], geometry: [coordinate(0), coordinate(1000), coordinate(0), coordinate(1000)] },
      { ...steps[0] },
    ],
  };
  const overlapping = createGuidanceRoute(loop, network);
  let state = updateGuidance(overlapping, initialGuidanceState(), fix(0, 0), baseTime);
  assert.equal(state.along, 0);
  state = updateGuidance(overlapping, state, fix(200, 10), baseTime + 10000);
  assert.ok(state.along > 190 && state.along < 210);
  assert.equal(state.stepIndex, 0);
  assert.ok(state.along < 500);
  const beyondStart = update(initialGuidanceState(), 950, 0);
  assert.equal(beyondStart.stepIndex, 0);
  assert.equal(
    beyondStart.along,
    0,
    'Starting far ahead requires an explicit manual step selection.',
  );
});

test('unverified bus order does not claim that the next stop is the alighting stop', () => {
  const uncertain = createGuidanceRoute(
    {
      ...journey,
      steps: [{ ...steps[0], mode: 'bus', stopOrderVerified: false, directionVerified: false }],
    },
    network,
  );
  let state = initialGuidanceState();
  for (const [meters, seconds] of [
    [0, 0],
    [200, 10],
    [450, 20],
    [700, 30],
  ])
    state = updateGuidance(uncertain, state, fix(meters, seconds), baseTime + seconds * 1000);
  assert.equal(describeGuidance(uncertain, state).kind, 'travel');
  assert.match(describeGuidance(uncertain, state).detail, /no están verificados/);
});

test('missing or malformed geometry remains manual, and final arrival requires consecutive recent observations', () => {
  for (const geometry of [[], [coordinate(0)], [coordinate(0), [NaN, 25.7] as Coordinates]]) {
    const malformed = createGuidanceRoute(
      { ...journey, steps: [{ ...steps[0], geometry }] },
      network,
    );
    const state = updateGuidance(malformed, initialGuidanceState(), fix(0, 0), baseTime);
    assert.equal(state.quality, 'unconfirmed');
    assert.equal(state.completed, false);
    assert.equal(advanceGuidance(malformed, state).completed, true);
  }
  const final = createGuidanceRoute({ ...journey, steps: [steps[0]] }, network);
  let state = initialGuidanceState();
  for (const [meters, seconds] of [
    [0, 0],
    [200, 10],
    [500, 20],
    [800, 30],
    [1000, 40],
  ])
    state = updateGuidance(final, state, fix(meters, seconds), baseTime + seconds * 1000);
  assert.equal(state.completed, false);
  state = updateGuidance(final, state, fix(1000, 44), baseTime + 44000);
  assert.equal(state.completed, true);
  assert.equal(describeGuidance(final, state).kind, 'arrived');
  assert.equal(describeGuidance(final, state).progress, 1);
});
