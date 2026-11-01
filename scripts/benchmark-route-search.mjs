// Run with Node 24: node --import tsx scripts/benchmark-route-search.mjs
// Timings describe this process and machine, not a mobile rendering benchmark.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { indexRouteSearch, searchIndexedRoutes } from '../src/components/routeSearch.ts';

const { routes } = JSON.parse(
  await readFile(new URL('../public/transit-catalog.json', import.meta.url), 'utf8'),
);
const queries = [
  'san bernabe',
  'ruta 218',
  'felix u gomez',
  'sendero universidad',
  'garcia santa catarina',
];
const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
const started = performance.now();
const index = indexRouteSearch(routes);
const indexBuildMs = performance.now() - started;
const baseline = (query) => {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return routes.filter((route) =>
    terms.every((term) =>
      normalize(
        `${route.code} ${route.name} ${route.from ?? ''} ${route.to ?? ''} ${route.municipalities.join(' ')} ${route.via.join(' ')}`,
      ).includes(term),
    ),
  );
};
const indexed = (query) => searchIndexedRoutes(routes, index, query);
for (const query of queries) assert.deepEqual(indexed(query), baseline(query));
function sample(search) {
  for (let warmup = 0; warmup < 50; warmup++) for (const query of queries) search(query);
  const measurements = [];
  for (let batch = 0; batch < 5; batch++) {
    const start = performance.now();
    for (let round = 0; round < 200; round++) for (const query of queries) search(query);
    measurements.push((performance.now() - start) / (200 * queries.length));
  }
  return measurements.sort((a, b) => a - b)[2];
}
const baselineMsPerQuery = sample(baseline),
  indexedMsPerQuery = sample(indexed);
console.log(
  JSON.stringify(
    {
      node: process.version,
      routes: routes.length,
      queries,
      measuredQueriesPerVersion: 5000,
      statistic: 'median of five batches',
      indexBuildMs,
      baselineMsPerQuery,
      indexedMsPerQuery,
      speedup: baselineMsPerQuery / indexedMsPerQuery,
      sameResults: true,
    },
    null,
    2,
  ),
);
