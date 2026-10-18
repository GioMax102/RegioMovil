/** Portable metadata catalog. It does not create stops, geometry or routing edges. */
export const SERVICE_STATUSES = Object.freeze(['published', 'construction', 'announced', 'operational']);
const DEFAULT_VERIFIED_AT = '2026-10-15';
const blockedStatuses = new Set(['construction', 'announced']);
const text = value => typeof value === 'string' ? value.trim().normalize('NFC') : '';
const entries = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
const strings = value => unique((Array.isArray(value) ? value : value == null ? [] : [value]).map(item => text(typeof item === 'object' ? item?.name : item)));
const identifier = value => text(value).replace(/[\s/\\]+/g, '-').replace(/[^\p{L}\p{N}_.:-]/gu, '');
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null;
const searchable = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function webUrl(value) {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function modeFor(value, networkId = '') {
  const mode = searchable(value || networkId);
  return /^(metro|metrorrey|rail|monorail)$/.test(mode) ? 'metro' : 'bus';
}

function normalizeSource(source, verifiedAt) {
  if (!source || typeof source !== 'object') return null;
  const id = identifier(source.id);
  const url = webUrl(source.url);
  if (!id || !url) return null;
  return { ...source, id, title: text(source.title) || id, url, verifiedAt: date(source.verifiedAt) || verifiedAt };
}

function networkFor(route, catalog, knownNetworks) {
  const routeNetwork = route.network && typeof route.network === 'object' ? route.network : {};
  const catalogNetwork = catalog.network && typeof catalog.network === 'object' ? catalog.network : {};
  const soleNetwork = entries(catalog.networks).length === 1 ? catalog.networks[0] : {};
  const suppliedId = route.networkId || routeNetwork.id || (typeof route.network === 'string' ? route.network : '') ||
    catalog.networkId || catalogNetwork.id || (typeof catalog.network === 'string' ? catalog.network : '') || soleNetwork?.id;
  const mode = modeFor(route.mode || routeNetwork.mode || catalog.mode || catalogNetwork.mode || soleNetwork?.mode, suppliedId);
  const id = identifier(suppliedId) || (mode === 'metro' ? 'metrorrey' : 'urban-bus');
  const existing = knownNetworks.get(id);
  return { id, name: existing?.name || text(routeNetwork.name || catalogNetwork.name || soleNetwork?.name || route.networkName || catalog.networkName) ||
    ({ metrorrey: 'Metrorrey', metro: 'Metro', transmetro: 'Transmetro', regioruta: 'RegioRuta', ima: 'Rutas urbanas IMA', 'muevo-leon': 'Muevo León · Rutas urbanas', 'urban-bus': 'Rutas urbanas' })[id] || id,
  mode: existing?.mode || mode };
}

function normalizeRoute(route, catalog, knownNetworks, knownSources, verifiedAt) {
  if (!route || typeof route !== 'object' || route.catalogEligible === false) return null;
  const id = identifier(route.id || route.routeId);
  const name = text(route.name || route.title || route.routeName);
  if (!id || !name) return null;
  const network = networkFor(route, catalog, knownNetworks);
  if (!knownNetworks.has(network.id)) knownNetworks.set(network.id, network);
  const status = SERVICE_STATUSES.includes(route.status) ? route.status : 'published';
  const sourceIds = unique([
    ...strings(route.sourceIds), ...strings(route.sourceId), ...strings(route.sources?.map?.(source => typeof source === 'string' ? source : source?.id)),
    ...(!route.sourceIds && !route.sourceId && !route.sources ? entries(catalog.sources).map(source => identifier(source?.id)) : []),
  ]).filter(id => knownSources.has(id));
  const stationNames = strings(route.stationNames);
  const orderedIds = entries(route.stationIds || route.stopIds).map(text);
  // Metadata alone is insufficient even if its producer accidentally marks it eligible.
  const hasOrderedStops = orderedIds.length >= 2 && orderedIds.every(Boolean) && new Set(orderedIds).size === orderedIds.length;
  const geometryPack = text(route.geometryPack) || null;
  return {
    id, code: text(route.code || route.number || route.routeCode) || id, name, networkId: network.id,
    mode: modeFor(route.mode || network.mode), status,
    statusAsOf: route.statusAsOf === null ? null : date(route.statusAsOf) || date(route.verifiedAt) || verifiedAt,
    municipalities: strings(route.municipalities || route.municipality),
    from: text(route.from || route.origin || route.terminals?.[0]) || stationNames[0] || null,
    to: text(route.to || route.destination || route.terminals?.at?.(-1)) || stationNames.at(-1) || null,
    via: strings(route.via || route.corridor), sourceIds,
    officialUrl: webUrl(route.officialUrl || route.url) || sourceIds.map(id => knownSources.get(id)?.url).find(Boolean) || null,
    planningEligible: route.planningEligible === true && !blockedStatuses.has(status) && hasOrderedStops,
    geometryPack,
    ...(/^[a-fA-F0-9]{12,64}$/.test(text(route.geometryRevision)) ? { geometryRevision: text(route.geometryRevision) } : {}),
    notes: unique([...strings(route.notes), ...strings(route.summary)]),
    ...(stationNames.length ? { stationNames } : {}),
    ...(hasOrderedStops ? { stationIds: orderedIds } : {}),
  };
}

/** Merge independent, differently shaped source catalogs without importing any file. */
export function mergeCatalogs(catalogs = []) {
  if (!Array.isArray(catalogs)) throw new TypeError('Los catálogos deben proporcionarse como una lista.');
  const inputs = catalogs.filter(catalog => catalog && typeof catalog === 'object' && !Array.isArray(catalog));
  const verifiedAt = inputs.map(catalog => date(catalog.verifiedAt)).filter(Boolean).sort().at(-1) || DEFAULT_VERIFIED_AT;
  const sources = new Map();
  const networks = new Map();
  const routes = new Map();
  for (const catalog of inputs) {
    for (const source of entries(catalog.sources)) {
      const normalized = normalizeSource(source, date(catalog.verifiedAt) || verifiedAt);
      if (normalized) sources.set(normalized.id, { ...sources.get(normalized.id), ...normalized });
    }
    for (const network of entries(catalog.networks)) {
      const id = identifier(network?.id);
      if (id) networks.set(id, { id, name: text(network.name) || id, mode: modeFor(network.mode, id) });
    }
  }
  for (const catalog of inputs) {
    for (const raw of entries(catalog.routes || catalog.services)) {
      const route = normalizeRoute(raw, catalog, networks, sources, date(catalog.verifiedAt) || verifiedAt);
      if (!route) continue;
      const previous = routes.get(route.id);
      if (previous && previous.networkId !== route.networkId) throw new TypeError(`El ID ${route.id} pertenece a más de una red; asigna IDs únicos.`);
      const latest = previous && previous.statusAsOf > route.statusAsOf ? previous : route;
      routes.set(route.id, previous ? { ...latest,
        sourceIds: unique([...previous.sourceIds, ...route.sourceIds]),
        notes: unique([...previous.notes, ...route.notes]),
        planningEligible: previous.planningEligible && route.planningEligible && !blockedStatuses.has(latest.status),
      } : route);
    }
  }
  const geometryRevision = inputs.map(catalog => text(catalog.geometryRevision)).filter(value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)).at(-1);
  return { version: 1, verifiedAt, ...(geometryRevision ? { geometryRevision } : {}), networks: [...networks.values()].sort((a, b) => a.id.localeCompare(b.id)),
    sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)),
    routes: [...routes.values()].sort((a, b) => a.networkId.localeCompare(b.networkId) || a.code.localeCompare(b.code, 'es', { numeric: true }) || a.id.localeCompare(b.id)) };
}

/** Accent-insensitive AND search over official metadata; never synthesizes a route. */
export function findServices(catalog, { q = '', network = '', status = '' } = {}) {
  if ([q, network, status].some(value => typeof value !== 'string')) throw new TypeError('Los filtros deben ser texto.');
  const query = q.trim();
  if (query.length > 160 || /[\u0000-\u001f\u007f]/.test(query)) throw new RangeError('La búsqueda admite hasta 160 caracteres sin controles.');
  const networkId = network.trim();
  const selectedStatus = status.trim();
  if (networkId && !entries(catalog?.networks).some(item => item.id === networkId)) throw new RangeError('La red indicada no está en el catálogo.');
  if (selectedStatus && !SERVICE_STATUSES.includes(selectedStatus)) throw new RangeError('El estado indicado no es válido.');
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  return entries(catalog?.routes).filter(route => {
    if (networkId && route.networkId !== networkId || selectedStatus && route.status !== selectedStatus) return false;
    const haystack = searchable([route.id, route.code, route.name, route.from, route.to,
      ...entries(route.municipalities), ...entries(route.via), ...entries(route.stationNames), ...entries(route.notes)].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}
