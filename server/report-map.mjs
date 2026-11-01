const DAY = 86400_000;
const GROUP_LIMIT = 250;
const fail = () => {
  throw new RangeError('Comprueba los filtros del mapa de reportes.');
};

export function reportMapFilters(params, { network, catalog, categories, now, canInspect }) {
  const allowed = [
    'state',
    'category',
    'targetType',
    'stationId',
    'routeId',
    'unitReference',
    'from',
    'to',
  ];
  for (const key of params.keys())
    if (!allowed.includes(key) || params.getAll(key).length !== 1) fail();
  const input = Object.fromEntries(params);
  const state = input.state ?? 'open';
  if (!['open', 'approved', 'resolved'].includes(state)) fail();
  const category = input.category ?? 'all',
    targetType = input.targetType ?? 'all';
  if (category !== 'all' && !categories.includes(category)) fail();
  if (!['all', 'station', 'route', 'unit'].includes(targetType)) fail();
  if (input.stationId !== undefined && !network.stations.some((s) => s.id === input.stationId))
    fail();
  if (input.routeId !== undefined && !catalog.routes.some((r) => r.id === input.routeId)) fail();
  if (
    input.unitReference !== undefined &&
    (!canInspect ||
      !input.unitReference.trim() ||
      input.unitReference.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(input.unitReference))
  )
    fail();
  const parse = (value, fallback) => {
    if (value === undefined) return fallback;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail();
    return parsed;
  };
  const to = parse(input.to, new Date(now.getTime() + 1));
  const from = parse(input.from, new Date(now.getTime() - 30 * DAY));
  if (
    to <= from ||
    to - from > 90 * DAY + 1 ||
    from < new Date(now.getTime() - 90 * DAY) ||
    to > new Date(now.getTime() + DAY)
  )
    fail();
  return {
    state,
    category,
    targetType,
    stationId: input.stationId ?? null,
    routeId: input.routeId ?? null,
    unitReference: input.unitReference ?? null,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

// Internal query: callers validate filters and apply retention before entering.
// Only consented public states are eligible, even for privileged roles.
export function queryReportMap(db, filters, canInspect, locatedStationIds = []) {
  const where = ['publication_consent = 1', 'created_at >= ?', 'created_at < ?'];
  const parameters = [filters.from, filters.to];
  if (filters.state === 'approved') where.push("status IN ('published','resolved')");
  else {
    where.push('status = ?');
    parameters.push(filters.state === 'resolved' ? 'resolved' : 'published');
  }
  for (const [column, value] of [
    ['category', filters.category],
    ['target_type', filters.targetType],
    ['station_id', filters.stationId],
    ['route_id', filters.routeId],
    ['unit_reference', filters.unitReference],
  ]) {
    if (value !== null && value !== 'all') {
      where.push(`${column} = ?`);
      parameters.push(value);
    }
  }
  const condition = where.join(' AND ');
  const unit = canInspect
    ? "CASE WHEN target_type='unit' THEN COALESCE(unit_reference,'') ELSE '' END"
    : "''";
  const grouping = `target_type, station_id, route_id, ${unit}`;
  const point = locatedStationIds.length
    ? `target_type='station' AND station_id IN (${locatedStationIds.map(() => '?').join(',')})`
    : '0';
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status='published'),0) AS open,
    COALESCE(SUM(status='resolved'),0) AS resolved, COALESCE(SUM(target_type='station'),0) AS station,
    COALESCE(SUM(target_type='route'),0) AS route, COALESCE(SUM(target_type='unit'),0) AS unit,
    COALESCE(SUM(${point}),0) AS stationLocated FROM reports WHERE ${condition}`,
    )
    .get(...locatedStationIds, ...parameters);
  totals.withoutPoint = totals.total - totals.stationLocated;
  const groups = db
    .prepare(
      `SELECT target_type AS targetType, station_id AS stationId, route_id AS routeId,
    ${unit} AS unitReference, COUNT(*) AS count, SUM(status='published') AS open, SUM(status='resolved') AS resolved,
    MAX(created_at) AS latestAt FROM reports WHERE ${condition} GROUP BY ${grouping}
    ORDER BY count DESC, target_type, station_id, route_id, unitReference LIMIT ?`,
    )
    .all(...parameters, GROUP_LIMIT);
  const groupCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM (SELECT 1 FROM reports WHERE ${condition} GROUP BY ${grouping})`,
    )
    .get(...parameters).count;
  return {
    totals,
    groups,
    groupCount,
    groupLimit: GROUP_LIMIT,
    truncated: groupCount > groups.length,
  };
}

export function identifyReportMap(result, filters, { network, catalog, canInspect, date }) {
  const stations = new Map(network.stations.map((s) => [s.id, s]));
  const routes = new Map(catalog.routes.map((r) => [r.id, r]));
  const groups = result.groups.map((group, index) => {
    const station = stations.get(group.stationId),
      route = routes.get(group.routeId);
    const position =
      group.targetType === 'station' &&
      Number.isFinite(station?.lat) &&
      Number.isFinite(station?.lng)
        ? { lat: station.lat, lng: station.lng, source: 'station-catalog' }
        : null;
    const { unitReference, ...safe } = group;
    return {
      ...safe,
      key: `group-${index}`,
      stationName: station?.name ?? null,
      routeName: route?.name ?? null,
      position,
      geometryPack: route?.geometryPack ?? null,
      ...(canInspect ? { unitReference: unitReference || null } : {}),
    };
  });
  return {
    ...result,
    groups,
    filters,
    rangeBasis: 'received',
    timeZone: 'America/Monterrey',
    scope: 'all-filtered-reports',
    generatedAt: date.toISOString(),
    locationNotice:
      'Las estaciones se ubican por catálogo; una ruta o unidad asociada no indica el punto del daño ni su posición actual.',
  };
}
