import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planMobility } from '../server/mobility.mjs';
import {
  deleteLegacyMobilityTrip,
  deleteMobilityAlternative,
  deleteMobilityTrip,
  legacyMobilityKey,
  readLegacyMobilityTrips,
  readSavedMobilityTrips,
  saveMobilityTrip,
  savedMobilityKey,
  snapshotMobilityPlan,
} from '../src/mobility/savedTrips';
import type { MobilityNetwork, MobilityPlan } from '../src/mobility/types';
import { createGuidanceRoute } from '../src/mobility/guidance';

const network = JSON.parse(
  await readFile(new URL('../data/mobility-network.json', import.meta.url), 'utf8'),
) as MobilityNetwork;
const plan = planMobility(network, {
  from: { kind: 'location', lat: 25.614502, lng: -100.275917, name: 'Mi ubicación' },
  to: { id: 'universidad' },
  preference: 'fastest',
  scenario: 'normal',
  offline: false,
  date: '2026-10-15T18:00:00.000Z',
}) as MobilityPlan;
const savedAt = new Date('2026-10-15T18:01:00.000Z');
const values = new Map<string, string>();
let full = false;
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (full) throw new DOMException('Full', 'QuotaExceededError');
      values.set(key, value);
    },
  },
});
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(() => {
  values.clear();
  full = false;
});
after(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

test('a complete offline snapshot retains priority order, geometry, endpoints and dates without writing until save', () => {
  const snapshot = snapshotMobilityPlan(plan, network, 'Trabajo', savedAt);
  assert.equal(values.size, 0);
  assert.ok(snapshot.journeys.length > 0 && snapshot.journeys.length <= 8);
  assert.deepEqual(snapshot.journeys, plan.journeys.slice(0, 8));
  assert.equal(snapshot.from.name, 'Mi ubicación');
  assert.equal('lat' in snapshot.from && snapshot.from.lat, 25.614502);
  assert.deepEqual(snapshot.to, { id: 'metro:universidad', name: 'Universidad' });
  assert.equal(snapshot.generatedAt, plan.generatedAt);
  assert.equal(snapshot.savedAt, savedAt.toISOString());
  assert.equal(snapshot.preference, 'fastest');
  assert.ok(snapshot.journeys[0].steps.some((step) => step.mode === 'bus'));
  assert.ok(snapshot.journeys[0].steps.some((step) => step.mode === 'metro'));
  assert.ok(snapshot.network.routes.every((route) => route.segments.length === 0));
  saveMobilityTrip(snapshot);
  assert.deepEqual(readSavedMobilityTrips(), [snapshot]);
  snapshot.journeys[0].steps[0].geometry[0][0] = 0;
  assert.notEqual(readSavedMobilityTrips()[0].journeys[0].steps[0].geometry[0][0], 0);
});

test('saving the same endpoints and priority updates their existing package without duplicates', () => {
  const first = saveMobilityTrip(snapshotMobilityPlan(plan, network, 'Casa', savedAt));
  const next = saveMobilityTrip(
    snapshotMobilityPlan(plan, network, 'Escuela', new Date(savedAt.getTime() + 1000)),
  );
  assert.equal(next.id, first.id);
  assert.equal(readSavedMobilityTrips().length, 1);
  assert.equal(readSavedMobilityTrips()[0].label, 'Escuela');
  assert.equal(readSavedMobilityTrips()[0].savedAt, '2026-10-15T18:01:01.000Z');
});

test('snapshots keep only the distinct routes available instead of padding to eight', () => {
  const one = snapshotMobilityPlan(
    { ...plan, journeys: [plan.journeys[0], plan.journeys[0]] },
    network,
    'Casa',
  );
  assert.equal(one.journeys.length, 1);
  assert.throws(
    () => snapshotMobilityPlan({ ...plan, journeys: [] }, network, 'Casa'),
    /Calcula una ruta/,
  );
});

test('deleting an alternative keeps the others; deleting the last removes its package and endpoints', () => {
  const trip = saveMobilityTrip(snapshotMobilityPlan(plan, network, 'Casa'));
  assert.ok(trip.journeys.length >= 2);
  deleteMobilityAlternative(trip.id, trip.journeys[0].id);
  assert.deepEqual(
    readSavedMobilityTrips()[0].journeys.map((journey) => journey.id),
    trip.journeys.slice(1).map((journey) => journey.id),
  );
  for (const journey of trip.journeys.slice(1)) deleteMobilityAlternative(trip.id, journey.id);
  assert.deepEqual(readSavedMobilityTrips(), []);
  assert.equal(values.get(savedMobilityKey), '[]');
  const again = saveMobilityTrip(snapshotMobilityPlan(plan, network, 'Casa'));
  deleteMobilityTrip(again.id);
  assert.deepEqual(readSavedMobilityTrips(), []);
});

test('quota failures keep previous packages and the eight-trip limit never evicts silently', () => {
  const first = saveMobilityTrip(snapshotMobilityPlan(plan, network, 'Casa'));
  const previous = values.get(savedMobilityKey);
  full = true;
  assert.throws(() => saveMobilityTrip({ ...first, label: 'Trabajo' }), /No hay espacio/);
  assert.equal(values.get(savedMobilityKey), previous);
  full = false;
  for (let index = 1; index < 8; index++)
    saveMobilityTrip({
      ...first,
      id: `trip-${index}`,
      from: { id: `official-${index}`, name: `Parada ${index}` },
    });
  assert.equal(readSavedMobilityTrips().length, 8);
  assert.throws(
    () =>
      saveMobilityTrip({ ...first, id: 'trip-nine', from: { id: 'another', name: 'Otra parada' } }),
    /hasta 8 viajes/,
  );
  assert.equal(readSavedMobilityTrips().length, 8);
});

test('corrupt snapshots are ignored while legacy official IDs remain available until deleted', () => {
  values.set(savedMobilityKey, '{broken');
  assert.deepEqual(readSavedMobilityTrips(), []);
  const valid = snapshotMobilityPlan(plan, network, 'Casa');
  const brokenGeometry = structuredClone(valid);
  brokenGeometry.journeys[0].steps[0].geometry[0][0] = Infinity;
  const badName = { ...valid, to: { id: 'metro:universidad', name: {} } };
  const badSources = { ...valid, network: { ...valid.network, sources: {} } };
  values.set(savedMobilityKey, JSON.stringify([null, brokenGeometry, badName, badSources, valid]));
  assert.equal(readSavedMobilityTrips().length, 1);
  const legacy = {
    from: 'metro:padre-mier',
    to: 'metro:universidad',
    label: 'Padre Mier → Universidad',
  };
  values.set(legacyMobilityKey, JSON.stringify([legacy]));
  saveMobilityTrip(valid);
  assert.deepEqual(readLegacyMobilityTrips(), [legacy]);
  assert.equal(values.get(legacyMobilityKey), JSON.stringify([legacy]));
  deleteLegacyMobilityTrip(legacy.from, legacy.to);
  assert.deepEqual(readLegacyMobilityTrips(), []);
});

test('saved route keeps intermediate metro stops so foreground guidance can name the next station offline', () => {
  const snapshot = snapshotMobilityPlan(plan, network, 'Guía sin internet', savedAt);
  const preserved = new Set(snapshot.network.stops.map((stop) => stop.id));
  for (const journey of snapshot.journeys) {
    for (const id of journey.stationIds)
      assert.ok(preserved.has(id), `Missing intermediate stop ${id}`);
    const route = createGuidanceRoute(journey, snapshot.network);
    const metro = route.legs.filter((leg) => leg.step.mode === 'metro');
    assert.ok(metro.length);
    assert.ok(metro.every((leg) => leg.stopsComplete));
  }
});
