import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mergeCatalogs } from '../server/catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const network = await readJson('data/network.json');
const networks = [
  { id: 'metrorrey', name: 'Metrorrey', mode: 'metro' },
  { id: 'muevo-leon', name: 'Muevo León / urbanas IMA', mode: 'bus' },
  { id: 'regioruta', name: 'RegioRuta', mode: 'bus' },
  { id: 'transmetro', name: 'Transmetro', mode: 'bus' },
  { id: 'ecovia', name: 'Ecovía / GMG', mode: 'bus' },
  { id: 'troncales-integradas', name: 'Troncales e integradas', mode: 'bus' },
];
const metro = {
  verifiedAt: '2026-10-15',
  networks,
  sources: network.sources,
  routes: network.lines.map((line) => ({
    id: line.id,
    code: line.id,
    name: line.name,
    networkId: 'metrorrey',
    mode: 'metro',
    status: 'published',
    statusAsOf: null,
    municipalities: [
      ...new Set(
        line.stationIds
          .map((id) => network.stations.find((station) => station.id === id)?.municipality)
          .filter(Boolean),
      ),
    ],
    from: network.stations.find((station) => station.id === line.stationIds[0])?.name,
    to: network.stations.find((station) => station.id === line.stationIds.at(-1))?.name,
    sourceIds: ['metrorrey-mapa-2026'],
    officialUrl: 'https://www.metrorrey.mx/',
    stationIds: line.stationIds,
    stationNames: line.stationIds.map(
      (id) => network.stations.find((station) => station.id === id)?.name,
    ),
    planningEligible: true,
    geometryPack: null,
    notes: [
      'Conexiones de la red verificadas en el mapa de abril de 2026. Los tiempos y la ocupación de RegioMóvil son simulados.',
    ],
  })),
};
const catalogs = await Promise.all(
  ['ima-services', 'regioruta-services', 'metrorrey-services', 'network-expansion'].map(
    async (name) => {
      const catalog = await readJson(`data/${name}.json`);
      return {
        ...catalog,
        routes: catalog.routes
          .filter((route) => route.catalogEligible !== false)
          .map((route) => (route.mode === 'metro' ? { ...route, networkId: 'metrorrey' } : route)),
      };
    },
  ),
);
const catalog = mergeCatalogs([metro, ...catalogs]);
for (const route of catalog.routes) {
  if (route.officialUrl)
    route.officialUrl = route.officialUrl.replace('/maps/d/edit?', '/maps/d/viewer?');
  if (route.geometryPack) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,100}$/.test(route.geometryPack))
      throw new Error(`Invalid geometry pack ID: ${route.id}`);
    const bytes = await readFile(resolve(root, `public/route-packs/${route.geometryPack}.json`));
    const pack = JSON.parse(bytes.toString());
    if (pack.id !== route.geometryPack || !pack.coordinates?.length || !Array.isArray(pack.stops))
      throw new Error(`Invalid geometry pack: ${route.id}`);
    route.geometryRevision = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    // Only the three established Metro lines have the necessary graph in this application.
    if (route.mode !== 'metro') route.planningEligible = false;
  }
}
const contents = JSON.stringify(catalog);
await writeFile(resolve(root, 'data/transit-catalog.json'), contents + '\n');
await writeFile(resolve(root, 'public/transit-catalog.json'), contents + '\n');
console.log(
  `Catálogo: ${catalog.routes.length} servicios · ${catalog.networks.length} redes · ${catalog.routes.filter((route) => route.geometryPack).length} recorridos de autobús`,
);
