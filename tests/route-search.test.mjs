import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexRouteSearch, searchIndexedRoutes } from '../src/components/routeSearch.ts';

const { routes } = JSON.parse(
  await readFile(new URL('../public/transit-catalog.json', import.meta.url), 'utf8'),
);
const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
function originalSearch(routes, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return terms.length
    ? routes.filter((route) =>
        terms.every((term) =>
          normalize(
            `${route.code} ${route.name} ${route.from ?? ''} ${route.to ?? ''} ${route.municipalities.join(' ')} ${route.via.join(' ')}`,
          ).includes(term),
        ),
      )
    : [];
}

test('indexed catalog search preserves accents, punctuation, terms, ordering and network subsets', () => {
  const index = indexRouteSearch(routes);
  const queries = [
    '',
    '   ',
    '---',
    'San Bernabé',
    'SAN BERNABE',
    'Félix U. Gómez',
    'Ruta 218',
    'garcia santa catarina',
    '大学',
    'inexistente',
  ];
  for (const subset of [
    routes,
    ...['metrorrey', 'transmetro', 'muevo-leon'].map((network) =>
      routes.filter((route) => route.networkId === network),
    ),
  ])
    for (const query of queries)
      assert.deepEqual(searchIndexedRoutes(subset, index, query), originalSearch(subset, query));
  assert.ok(searchIndexedRoutes(routes, index, 'San Bernabé').length > 0);
  assert.ok(searchIndexedRoutes(routes, index, 'Félix U. Gómez').length > 0);
});

test('repeated queries reuse immutable catalog text instead of reading and normalizing it again', () => {
  let reads = 0;
  const route = {
    id: 'one',
    code: '1',
    get name() {
      reads++;
      return 'San Bernabé';
    },
    from: null,
    to: null,
    municipalities: ['Monterrey'],
    via: ['Centro'],
  };
  const index = indexRouteSearch([route]);
  assert.equal(reads, 1);
  for (const query of ['san', 'bernabe', 'san bernabé', 'centro monterrey'])
    assert.deepEqual(searchIndexedRoutes([route], index, query), [route]);
  assert.equal(reads, 1, 'Catalog text is source work, independent of keystrokes.');
  assert.deepEqual(searchIndexedRoutes([{ ...route, id: 'not-indexed' }], index, 'san'), []);
  assert.deepEqual(searchIndexedRoutes([], index, 'san'), []);
});
