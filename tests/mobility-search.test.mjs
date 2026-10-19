import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distinctPlaceSuggestions,
  indexMobilityStops,
  placeAddress,
  searchMobilityStops,
} from '../src/mobility/search.ts';
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
    stops: ['tm-a', 'tm-b'].map((id) => ({
      id,
      name: 'Parada 1',
      mode: 'bus',
      routeIds: [id],
      official: true,
    })),
  };
  const matches = searchMobilityStops(indexMobilityStops(repeated), 'Parada 1', false);
  assert.equal(matches.length, 2);
  assert.equal(
    new Set(matches.map((row) => row.label)).size,
    2,
    'Identical names and TM codes must remain distinguishable.',
  );
  assert.ok(matches.some((row) => row.label.includes('Santo Domingo')));
  assert.ok(matches.some((row) => row.label.includes('Las Puentes')));
});

test('place suggestions deduplicate nearby representations but retain branches and result types', () => {
  const place = {
    id: 'osm:1',
    name: 'Museo de Historia',
    displayName: 'Museo de Historia, Centro, Monterrey',
    resultType: 'place',
    lat: 25.67,
    lng: -100.31,
  };
  const results = distinctPlaceSuggestions([
    place,
    { ...place, id: 'reference:1', name: 'Museo de História', lat: 25.67005 },
    { ...place, id: 'osm:2', lat: 25.68 },
    { ...place, id: 'osm:3', resultType: 'street' },
    { ...place, id: 'osm:1' },
  ]);
  assert.deepEqual(
    results.map((row) => row.id),
    ['osm:1', 'osm:2', 'osm:3'],
  );
  assert.equal(results[0], place, 'Provider ranking is preserved.');
});

test('place subtitles remove only an exact repeated title and retain street numbers and municipality', () => {
  const place = {
    name: 'Punto Valle',
    displayName: 'Punto Valle, Río Missouri 555, Del Valle, San Pedro Garza García',
  };
  assert.equal(placeAddress(place), 'Río Missouri 555, Del Valle, San Pedro Garza García');
  assert.equal(
    placeAddress({ ...place, name: 'Río Missouri', address: 'Río Missouri 555, Del Valle' }),
    'Río Missouri 555, Del Valle',
    'A street name is not stripped from a numbered address.',
  );
  assert.equal(placeAddress({ ...place, displayName: 'Punto Valle' }), 'Punto Valle');
});
