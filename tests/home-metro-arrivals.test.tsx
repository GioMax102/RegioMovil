import test from 'node:test';
import assert from 'node:assert/strict';
import { homeMetroArrivals } from '../src/components/homeMetroArrivals';
import type { Arrival } from '../src/types';

const arrival = (id: string, lineId: string, direction: string, etaMinutes: number) =>
  ({ id, lineId, direction, etaMinutes }) as Arrival;

test('Home compares the next arrival per direction even when the earliest two repeat a direction', () => {
  const data = [
    arrival('a', 'L1', 'Talleres', 2),
    arrival('b', 'L1', 'Talleres', 3),
    arrival('c', 'L1', 'Exposición', 9),
    arrival('d', 'L1', 'Exposición', 6),
    arrival('e', 'L2', 'Sendero', 1),
  ];
  assert.deepEqual(
    homeMetroArrivals(data, 'L1').map((item) => item.id),
    ['a', 'd'],
  );
  assert.deepEqual(
    homeMetroArrivals(data, 'L2').map((item) => item.id),
    ['e'],
  );
  assert.equal(data[0].id, 'a');
});

test('a terminal does not gain an invented reverse direction and a missing line remains empty', () => {
  const data = [arrival('b', 'L1', 'Exposición', 6), arrival('a', 'L1', 'Exposición', 6)];
  assert.deepEqual(
    homeMetroArrivals(data, 'L1').map((item) => item.id),
    ['a'],
  );
  assert.deepEqual(homeMetroArrivals(data, 'L3'), []);
});
