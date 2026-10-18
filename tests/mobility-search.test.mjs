import test from 'node:test';
import assert from 'node:assert/strict';
import { indexMobilityStops, searchMobilityStops } from '../src/mobility/search.ts';
const network = {
  routes: [
    { id: 'L1', code: 'L1', name: 'Línea 1' },
    { id: 'A', code: '130', name: 'Alameda' },
  ],
  stops: [
    {
      id: 'bernabe',
      name: 'San Bernabé',
      aliases: ['San Bernabe'],
      mode: 'metro',
      routeIds: ['L1'],
      official: true,
    },
    {
      id: 'arena',
      name: 'Arena Monterrey',
      aliases: ['Parque Fundidora'],
      mode: 'metro',
      routeIds: ['L1'],
      official: true,
    },
    { id: 'reference', name: 'Gómez Morín', mode: 'bus', routeIds: ['A'], official: false },
  ],
};
test('city search tolerates a station typo and accents without returning unrelated stops', () => {
  const index = indexMobilityStops(network);
  assert.deepEqual(
    searchMobilityStops(index, 'Estación Sab bernabé', false).map((row) => row.stop.id),
    ['bernabe'],
  );
  assert.deepEqual(
    searchMobilityStops(index, 'fundidora', false).map((row) => row.stop.id),
    ['arena'],
  );
  assert.equal(
    searchMobilityStops(index, 'Punto Valle', false).length,
    0,
    'Unmatched text is not turned into a guessed stop.',
  );
});
test('offline endpoint suggestions exclude nonofficial mapped reference points', () => {
  const index = indexMobilityStops(network);
  assert.equal(searchMobilityStops(index, 'Gomez Morin', false)[0].stop.id, 'reference');
  assert.equal(searchMobilityStops(index, 'Gomez Morin', true).length, 0);
});
test('bus suggestions name their corridor so repeated stop names remain distinguishable', () => {
  const repeated = {
    routes: [
      { id: 'tm-a', code: 'TM', name: 'Universidad – Santo Domingo' },
      { id: 'tm-b', code: 'TM', name: 'Universidad – Las Puentes' },
    ],
    stops: ['tm-a', 'tm-b'].map(id => ({ id, name: 'Parada 1', mode: 'bus', routeIds: [id], official: true })),
  };
  const matches = searchMobilityStops(indexMobilityStops(repeated), 'Parada 1', false);
  assert.equal(matches.length, 2);
  assert.equal(new Set(matches.map(row => row.label)).size, 2, 'Identical names and TM codes must remain distinguishable.');
  assert.ok(matches.some(row => row.label.includes('Santo Domingo')));
  assert.ok(matches.some(row => row.label.includes('Las Puentes')));
});
