/** Local, deterministic evidence inventory; no network calls or runtime payload. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [catalog, graph, audit] = await Promise.all([
  read('data/transit-catalog.json'),
  read('data/mobility-network.json'),
  read('data/coverage-source-audit-20261025.json'),
]);
let publicMapAudit = { verifiedAt: audit.checkedAt, routes: [] };
try {
  publicMapAudit = await read('data/ima-map-sources.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const checkedAt = [audit.checkedAt, publicMapAudit.verifiedAt].sort().at(-1);
const graphRoutes = new Map(graph.routes.map((route) => [route.id, route]));
const exclusions = new Map(graph.coverage.excludedRoutes.map((row) => [row.id, row.reason]));
const sources = new Map(catalog.sources.map((source) => [source.id, source]));
const checked = new Map([
  ...audit.routes.map((row) => [row.routeId, row]),
  ...publicMapAudit.routes.map((row) => [row.id, {
    ...row, checkedAt: row.verifiedAt || publicMapAudit.verifiedAt,
    result: row.status === 'imported' ? 'imported-experimental' : row.reason,
    sha256: row.originalKmlSha256,
  }]),
]);
const inventory = [];
for (const route of catalog.routes) {
  const graphRoute = graphRoutes.get(route.id);
  const pack = route.geometryPack
    ? await read(`public/route-packs/${route.geometryPack}.json`)
    : null;
  const inspection = checked.get(route.id);
  const sourceRecords = route.sourceIds.map((id) => sources.get(id));
  if (sourceRecords.some((source) => !source)) throw new Error(`Missing source: ${route.id}`);
  if (pack && pack.id !== route.geometryPack) throw new Error(`Incorrect package: ${route.id}`);
  if (pack?.experimentalRouting === false && graphRoute)
    throw new Error(`View-only package entered routing graph: ${route.id}`);
  const mapInDetail = Boolean(graphRoute || pack);
  const hasLinkedMap = /https:\/\/www\.google\.com\/maps\/d\//.test(route.officialUrl || '');
  const metadataOnly = !mapInDetail;
  let pendingReason = null;
  if (route.mode === 'metro' && !graphRoute) pendingReason = 'rail-status-not-enabled';
  else if (metadataOnly && inspection?.reason) pendingReason = inspection.reason;
  else if (metadataOnly && hasLinkedMap)
    pendingReason = 'linked-map-not-imported-or-inspected-this-batch';
  else if (metadataOnly) pendingReason = 'metadata-without-individual-geometry-link';
  else if (pack?.experimentalRouting === false)
    pendingReason = 'view-only-direction-order-and-operation-unverified';
  else if (route.mode === 'bus')
    pendingReason = 'experimental-direction-order-and-operation-unverified';
  inventory.push({
    id: route.id,
    code: route.code,
    name: route.name,
    networkId: route.networkId,
    mode: route.mode,
    catalogPresent: true,
    metadataSourceIds: route.sourceIds,
    metadataStatus: route.status,
    metadataStatusAsOf: route.statusAsOf,
    officialUrl: route.officialUrl,
    mapInNetworkOverview: Boolean(graphRoute),
    mapInServiceDetail: mapInDetail,
    geometryPack: route.geometryPack,
    geometryRevision: route.geometryRevision || null,
    geometryKind: pack?.geometryKind || graphRoute?.geometryKind || null,
    publishedSegments: pack ? pack.segments?.length || 1 : graphRoute?.segments.length || 0,
    publishedMarkers: pack?.stops.length ?? null,
    catalogPlanningEligible: route.planningEligible,
    experimentalGraphIncluded: Boolean(graphRoute),
    experimentalGraphStopOrderVerified: graphRoute?.stopOrderVerified ?? null,
    experimentalGraphDirectionVerified: graphRoute?.directionVerified ?? null,
    graphExclusionReason: exclusions.get(route.id) || null,
    pendingReason,
    sourceAudit: inspection
      ? {
          checkedAt: inspection.checkedAt,
          scope: inspection.status === 'pending'
            ? 'official-source-inspected-no-usable-matching-geometry'
            : 'downloaded-kml-and-validated-coordinates',
          result: inspection.result,
          sourceSha256: inspection.sha256,
          liveOperationVerified: false,
        }
      : pack
        ? {
            checkedAt: pack.verifiedAt,
            scope: 'previously-imported-local-snapshot-not-refetched-this-batch',
            result: 'historical-package',
            sourceSha256:
              pack.originalKmlSha256 ||
              pack.sourceSnapshotSha256 ||
              pack.originalHtmlSha256 ||
              null,
            liveOperationVerified: false,
          }
        : {
            checkedAt: null,
            scope: 'local-metadata-only-link-not-individually-inspected-this-batch',
            result: 'not-checked-in-this-batch',
            sourceSha256: null,
            liveOperationVerified: false,
          },
  });
}
if (new Set(inventory.map((row) => row.id)).size !== inventory.length)
  throw new Error('Duplicate service ID');
const counts = (rows) => ({
  catalog: rows.length,
  mapInNetworkOverview: rows.filter((row) => row.mapInNetworkOverview).length,
  mapInServiceDetail: rows.filter((row) => row.mapInServiceDetail).length,
  experimentalGraphIncluded: rows.filter((row) => row.experimentalGraphIncluded).length,
  catalogPlanningEligible: rows.filter((row) => row.catalogPlanningEligible).length,
  noImportedMap: rows.filter((row) => !row.mapInServiceDetail).length,
  linkedMapsNotImported: rows.filter(
    (row) => row.pendingReason === 'linked-map-not-imported-or-inspected-this-batch',
  ).length,
});
const data = {
  version: 1,
  inventoryCheckedAt: checkedAt,
  catalogVerifiedAt: catalog.verifiedAt,
  catalogSha256: createHash('sha256')
    .update(await readFile(new URL('data/transit-catalog.json', root)))
    .digest('hex'),
  graphRevision: graph.revision,
  scope:
    'Local catalog/geometry/graph inventory by exact service ID. The comprehensive IMA source audit is in ima-map-sources.json; the earlier five-map audit remains historical. Geometry availability does not certify current operation, directions, boarding order or pedestrian connections.',
  totals: counts(inventory),
  byNetwork: catalog.networks.map((network) => ({
    id: network.id,
    name: network.name,
    ...counts(inventory.filter((row) => row.networkId === network.id)),
  })),
  services: inventory,
};
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvColumns = [
  'id',
  'code',
  'name',
  'networkId',
  'metadataStatus',
  'metadataStatusAsOf',
  'mapInNetworkOverview',
  'mapInServiceDetail',
  'catalogPlanningEligible',
  'experimentalGraphIncluded',
  'graphExclusionReason',
  'pendingReason',
  'geometryPack',
  'officialUrl',
];
const csv =
  [
    csvColumns.join(','),
    ...inventory.map((row) => csvColumns.map((key) => quote(row[key])).join(',')),
  ].join('\n') + '\n';
const outputs = [
  ['data/route-coverage-inventory.json', JSON.stringify(data, null, 2) + '\n'],
  [`docs/inventario-rutas-${checkedAt}.csv`, csv],
];
for (const [path, contents] of outputs) {
  if (process.argv.includes('--check')) {
    if ((await readFile(new URL(path, root), 'utf8')) !== contents)
      throw new Error(`Stale coverage inventory: ${path}`);
  } else await writeFile(new URL(path, root), contents);
}
console.log(
  `Inventario: ${data.totals.catalog} servicios · ${data.totals.mapInServiceDetail} mapas de ficha · ${data.totals.mapInNetworkOverview} mapas de red · ${data.totals.noImportedMap} sin mapa importado.`,
);
