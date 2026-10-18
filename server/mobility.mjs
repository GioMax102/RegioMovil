/** Portable, deterministic experiment. No operator telemetry or pedestrian routing. */
const EARTH_METERS = 6371000;
const cache = new WeakMap();
const rad = value => value * Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hash = value => [...String(value)].reduce((result, char) => Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36);
const error = (code, message) => Object.assign(new RangeError(message), { code });
const point = coordinates => ({ lng: coordinates[0], lat: coordinates[1] });
export function distanceMeters(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return EARTH_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Fractional vertex index on a single published segment; segments never join. */
export function projectOnPolyline(location, coordinates) {
  let best = { distanceMeters: Infinity, position: 0 };
  const x = Math.cos(rad(location.lat));
  for (let index = 1; index < coordinates.length; index++) {
    const a = coordinates[index - 1];
    const b = coordinates[index];
    const dx = (b[0] - a[0]) * x;
    const dy = b[1] - a[1];
    const fraction = clamp((((location.lng - a[0]) * x) * dx + (location.lat - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const projected = { lng: a[0] + (b[0] - a[0]) * fraction, lat: a[1] + (b[1] - a[1]) * fraction };
    const distance = distanceMeters(location, projected);
    if (distance < best.distanceMeters) best = { distanceMeters: distance, position: index - 1 + fraction };
  }
  return best;
}

const atPosition = (coordinates, position) => {
  const index = Math.min(coordinates.length - 2, Math.max(0, Math.floor(position)));
  const fraction = clamp(position - index, 0, 1);
  return coordinates[index].map((value, axis) => value + (coordinates[index + 1][axis] - value) * fraction);
};
export function sliceMobilityGeometry(segment, from, to) {
  const reverse = to < from;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const geometry = [atPosition(segment.coordinates, start)];
  for (let index = Math.floor(start) + 1; index < end; index++) geometry.push(segment.coordinates[index]);
  geometry.push(atPosition(segment.coordinates, end));
  return reverse ? geometry.reverse() : geometry;
}
const geometryDistance = geometry => geometry.slice(1).reduce((sum, coordinates, index) => sum + distanceMeters(point(geometry[index]), point(coordinates)), 0);

export function resolveMobilityEndpoint(network, endpoint, { offline = false } = {}) {
  if (typeof endpoint === 'string') endpoint = { id: endpoint };
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) throw error('INVALID_ENDPOINT', 'Selecciona un origen y un destino válidos.');
  if (typeof endpoint.id === 'string' && !['place', 'location', 'coordinate'].includes(endpoint.kind)) {
    const stop = network.stops.find(stop => stop.id === endpoint.id || stop.stationId === endpoint.id);
    if (!stop) throw error('UNKNOWN_STOP', 'El punto no pertenece a las paradas documentadas de esta red.');
    if (offline && stop.official !== true) throw error('OFFLINE_STOP_ONLY', 'Sin conexión solo puedes elegir estaciones y paradas oficiales publicadas.');
    return { ...stop, kind: 'stop' };
  }
  if (offline) throw error('OFFLINE_STOP_ONLY', 'Sin conexión solo puedes elegir estaciones y paradas publicadas.');
  if (!['place', 'location', 'coordinate'].includes(endpoint.kind) || typeof endpoint.lat !== 'number' || typeof endpoint.lng !== 'number' ||
      !Number.isFinite(endpoint.lat) || !Number.isFinite(endpoint.lng)) throw error('INVALID_ENDPOINT', 'La ubicación debe incluir coordenadas válidas.');
  const [west, south, east, north] = network.bounds;
  if (endpoint.lng < west || endpoint.lng > east || endpoint.lat < south || endpoint.lat > north) throw error('OUTSIDE_COVERAGE', 'La ubicación está fuera de la cobertura experimental de la ZMM.');
  return { id: `${endpoint.kind}:${endpoint.lat.toFixed(6)},${endpoint.lng.toFixed(6)}`, kind: endpoint.kind === 'coordinate' ? 'place' : endpoint.kind,
    lat: endpoint.lat, lng: endpoint.lng, name: String(endpoint.name || endpoint.label || 'Ubicación seleccionada').slice(0, 180) };
}

export function nearbyMobilityStops(network, location, maxMeters = 1200, limit = 32, allowedRouteIds = null) {
  const candidates = network.stops.map(stop => ({ stop, distanceMeters: Math.ceil(distanceMeters(location, stop) * 1.25) }))
    .filter(candidate => candidate.distanceMeters <= Math.min(1200, maxMeters) &&
      (!allowedRouteIds || candidate.stop.routeIds.some(id => allowedRouteIds.has(id))))
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.stop.id.localeCompare(b.stop.id));
  // Diversity avoids filling every access option with markers from one route.
  const selected = [];
  const counts = new Map();
  for (const candidate of candidates) {
    const key = candidate.stop.routeIds.join('|');
    if ((counts.get(key) || 0) >= 2) continue;
    selected.push(candidate);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function endpointCandidates(network, endpoint, maxWalk, allowedRouteIds) {
  const nearby = nearbyMobilityStops(network, endpoint, maxWalk, 32, allowedRouteIds);
  if (endpoint.kind !== 'stop') return nearby;
  // A station selected as a geographic origin can also reach a nearby bus stop.
  // Do not shortcut a published service or join its disconnected segments on foot.
  return [...(endpoint.routeIds.some(id => allowedRouteIds.has(id)) ? [{ stop: endpoint, distanceMeters: 0 }] : []), ...nearby.filter(candidate => candidate.stop.id !== endpoint.id &&
    !candidate.stop.routeIds.some(id => endpoint.routeIds.includes(id)))];
}

function buildRuntime(network) {
  if (cache.has(network)) return cache.get(network);
  const stops = new Map(network.stops.map(stop => [stop.id, stop]));
  const routes = new Map(network.routes.map(route => [route.id, route]));
  const adjacency = new Map(network.stops.map(stop => [stop.id, []]));
  for (const route of network.routes) {
    for (const segment of route.segments) {
      for (let index = 1; index < segment.stopIds.length; index++) {
        const a = segment.stopIds[index - 1];
        const b = segment.stopIds[index];
        if (!stops.has(a) || !stops.has(b)) continue;
        const geometry = sliceMobilityGeometry(segment, segment.positions[index - 1], segment.positions[index]);
        const distance = geometryDistance(geometry);
        const edge = { id: `${segment.id}:${index}`, routeId: route.id, segmentId: segment.id, mode: route.mode,
          distanceMeters: distance, minutes: distance / (route.mode === 'metro' ? 32000 : 18000) * 60 + (route.mode === 'metro' ? 0.55 : 0.3),
          geometry };
        adjacency.get(a).push({ ...edge, from: a, to: b });
        adjacency.get(b).push({ ...edge, id: `${edge.id}:r`, from: b, to: a, geometry: [...geometry].reverse() });
      }
    }
  }
  // A coarse grid bounds transfer discovery to nearby cells; no O(n²) scan.
  const grid = new Map();
  const cell = stop => [Math.floor(stop.lat / 0.004), Math.floor(stop.lng / 0.004)];
  for (const stop of stops.values()) {
    const key = cell(stop).join(':');
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(stop);
  }
  for (const stop of stops.values()) {
    const [latCell, lngCell] = cell(stop);
    const nearby = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const other of grid.get(`${latCell + dy}:${lngCell + dx}`) || []) {
        if (stop.id === other.id || stop.routeIds.some(id => other.routeIds.includes(id))) continue;
        const distance = Math.ceil(distanceMeters(stop, other) * 1.25);
        if (distance > (network.limits?.maxTransferWalkingMeters || 350)) continue;
        nearby.push({ stop: other, distance });
      }
    }
    nearby.sort((a, b) => a.distance - b.distance || a.stop.id.localeCompare(b.stop.id));
    const routeCounts = new Map();
    let retained = 0;
    for (const candidate of nearby) {
      const key = candidate.stop.routeIds.join('|');
      if ((routeCounts.get(key) || 0) >= 2) continue;
      routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
      adjacency.get(stop.id).push(walkEdge(stop, candidate.stop, candidate.distance));
      if (++retained >= 24) break;
    }
  }
  const reverseAdjacency = new Map(network.stops.map(stop => [stop.id, []]));
  for (const edges of adjacency.values()) for (const edge of edges) reverseAdjacency.get(edge.to).push(edge);
  const runtime = { stops, routes, adjacency, reverseAdjacency };
  cache.set(network, runtime);
  return runtime;
}

function walkEdge(from, to, distance = Math.ceil(distanceMeters(from, to) * 1.25)) {
  return { id: `walk:${from.id}:${to.id}`, from: from.id, to: to.id, mode: 'walk', distanceMeters: distance,
    minutes: distance / 75, geometry: [[from.lng, from.lat], [to.lng, to.lat]] };
}

class MinHeap {
  values = [];
  push(value) {
    const values = this.values;
    values.push(value);
    let index = values.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if ((values[parent].priority ?? values[parent].cost) <= (value.priority ?? value.cost)) break;
      values[index] = values[parent];
      index = parent;
    }
    values[index] = value;
  }
  pop() {
    const values = this.values;
    const first = values[0];
    const last = values.pop();
    if (!values.length) return first;
    let index = 0;
    while (index * 2 + 1 < values.length) {
      let child = index * 2 + 1;
      if (child + 1 < values.length && (values[child + 1].priority ?? values[child + 1].cost) < (values[child].priority ?? values[child].cost)) child++;
      if ((values[child].priority ?? values[child].cost) >= (last.priority ?? last.cost)) break;
      values[index] = values[child];
      index = child;
    }
    values[index] = last;
    return first;
  }
  get length() { return this.values.length; }
}

const continued = (network, stopId, from, to) => (network.throughServices || []).some(service => service.stationId === stopId && service.lineIds.includes(from) && service.lineIds.includes(to));
const occupancyFor = (routeId, scenario) => clamp(25 + Number.parseInt(hash(routeId), 36) % 35 + ({ normal: 0, peak: 28, rain: 13, disruption: 19 }[scenario]), 5, 98);

// Optimistic travel costs guide each bounded search toward its destination.
// They omit waiting, transfers, crowding, and diversification penalties and do
// not add a different ranking objective to the search. Reverse edges
// matter: retained walking transfers need not be symmetric.
function remainingCosts(runtime, ends, factor, walkingWeight, allowedRouteIds) {
  const remaining = new Map();
  const heap = new MinHeap();
  for (const candidate of ends) {
    const cost = candidate.distanceMeters / 75 * walkingWeight;
    remaining.set(candidate.stop.id, cost);
    heap.push({ stopId: candidate.stop.id, cost });
  }
  while (heap.length) {
    const state = heap.pop();
    if (state.cost !== remaining.get(state.stopId)) continue;
    for (const edge of runtime.reverseAdjacency.get(state.stopId) || []) {
      if (edge.routeId && !allowedRouteIds.has(edge.routeId)) continue;
      const cost = state.cost + edge.minutes * (edge.mode === 'walk' ? walkingWeight : factor);
      if (cost >= (remaining.get(edge.from) ?? Infinity)) continue;
      remaining.set(edge.from, cost);
      heap.push({ stopId: edge.from, cost });
    }
  }
  return remaining;
}

function search(network, runtime, origin, destination, options, penalties) {
  const maxWalk = network.limits?.maxWalkingMeters || 1200;
  const allowedRouteIds = new Set(network.routes.filter(route => (!options.allowedModes || options.allowedModes.includes(route.mode)) &&
    !options.excludedRouteIds?.has(route.id)).map(route => route.id));
  const starts = endpointCandidates(network, origin, maxWalk, allowedRouteIds);
  const ends = endpointCandidates(network, destination, maxWalk, allowedRouteIds)
    .filter(candidate => !options.arrivalRouteId || candidate.stop.routeIds.includes(options.arrivalRouteId));
  if (!starts.length || !ends.length) return { path: null, expansions: 0, truncated: false };
  const endMap = new Map(ends.map(candidate => [candidate.stop.id, candidate]));
  const heap = new MinHeap();
  const labels = new Map();
  const factor = { normal: 1, peak: 1.12, rain: 1.2, disruption: 1.35 }[options.scenario];
  const walkingWeight = options.preference === 'accessible' ? 1.6 : 1;
  const remaining = remainingCosts(runtime, ends, factor, walkingWeight, allowedRouteIds);
  const requiredModes = options.requiredModes || 0;
  const key = state => `${state.stopId}|${state.line || ''}|${Number(state.walkedLast)}|${state.transfers}|${state.usedModes & requiredModes}`;
  // Cost and walking are independent resources. A cheaper label may consume too
  // much walking budget for the final connector; retain their Pareto frontier.
  const admit = state => {
    const existing = labels.get(state.key) || [];
    if (existing.some(label => label.cost <= state.cost + 1e-8 && label.walking <= state.walking + 1e-8)) return false;
    const retained = existing.filter(label => {
      const dominated = state.cost <= label.cost + 1e-8 && state.walking <= label.walking + 1e-8;
      if (dominated) label.active = false;
      return !dominated;
    });
    state.active = true;
    retained.push(state);
    labels.set(state.key, retained);
    return true;
  };
  for (const candidate of starts) {
    const edge = candidate.distanceMeters > 0 || candidate.stop.id !== origin.id ? walkEdge(origin, candidate.stop, candidate.distanceMeters) : null;
    const state = { stopId: candidate.stop.id, line: null, walkedLast: !!edge, walking: candidate.distanceMeters,
      transfers: 0, usedModes: 0, cost: edge ? edge.minutes * walkingWeight : 0, baseCost: edge ? edge.minutes * walkingWeight : 0, parent: null, edge };
    if (!remaining.has(state.stopId)) continue;
    state.priority = state.cost + remaining.get(state.stopId);
    state.key = key(state);
    if (admit(state)) heap.push(state);
  }
  let expansions = 0;
  const maxExpansions = clamp(options.maxExpansions ?? network.limits?.maxExpansions ?? 24000, 1, 24000);
  while (heap.length && expansions < maxExpansions) {
    const state = heap.pop();
    if (state.stopId !== '$destination' && !state.active) continue;
    expansions++;
    const end = endMap.get(state.stopId);
    if (end && state.line && (!options.arrivalRouteId || state.line === options.arrivalRouteId) &&
        (state.usedModes & requiredModes) === requiredModes && state.walking + end.distanceMeters <= maxWalk) {
      // A terminal edge participates in the queue, preserving total-cost ordering.
      const edge = end.distanceMeters || end.stop.id !== destination.id ? walkEdge(end.stop, destination, end.distanceMeters) : null;
      const terminal = { ...state, stopId: '$destination', parent: state, edge, cost: state.cost + (edge?.minutes || 0) * walkingWeight,
        baseCost: state.baseCost + (edge?.minutes || 0) * walkingWeight,
        walking: state.walking + end.distanceMeters, key: `$destination:${state.key}` };
      terminal.priority = terminal.cost;
      heap.push(terminal);
      endMap.delete(state.stopId);
    }
    if (state.stopId === '$destination') {
      const edges = [];
      let cursor = state;
      while (cursor) { if (cursor.edge) edges.push(cursor.edge); cursor = cursor.parent; }
      return { path: { edges: edges.reverse(), cost: state.cost, baseCost: state.baseCost }, expansions, truncated: false };
    }
    // Once the selected destination is reached, a mode/arrival probe cannot
    // leave it to board another service and then return on foot.
    if (state.stopId === destination.id) continue;
    for (const edge of runtime.adjacency.get(state.stopId) || []) {
      if (edge.routeId && !allowedRouteIds.has(edge.routeId)) continue;
      const walking = state.walking + (edge.mode === 'walk' ? edge.distanceMeters : 0);
      if (walking > maxWalk || (edge.mode === 'walk' && state.walkedLast)) continue;
      // A positive loop is not a useful transport alternative. Include the
      // geographic origin: an initial access walk is an edge, not a parent label.
      if (edge.to === origin.id) continue;
      let cursor = state;
      while (cursor && cursor.stopId !== edge.to) cursor = cursor.parent;
      if (cursor) continue;
      const continuation = !state.walkedLast && edge.routeId && state.line && continued(network, state.stopId, state.line, edge.routeId);
      const transfer = edge.routeId && state.line && state.line !== edge.routeId && !continuation;
      const transfers = state.transfers + Number(!!transfer);
      if (transfers > (network.limits?.maxTransfers ?? 4)) continue;
      let cost = edge.minutes * (edge.mode === 'walk' ? 1 : factor);
      if (edge.routeId && edge.routeId !== state.line && !continuation) cost += (edge.mode === 'metro' ? 4 : 8) * factor;
      if (transfer) cost += options.preference === 'accessible' ? 16 : options.preference === 'comfortable' ? 8 : 3;
      if (options.preference === 'comfortable' && edge.routeId) cost += edge.minutes * occupancyFor(edge.routeId, options.scenario) / 100 * 0.7;
      if (options.preference === 'accessible' && edge.mode === 'walk') cost += edge.minutes * 0.6;
      const next = { stopId: edge.to, line: edge.routeId || state.line, walkedLast: edge.mode === 'walk', walking, transfers,
        usedModes: state.usedModes | (edge.mode === 'metro' ? 1 : edge.mode === 'bus' ? 2 : 0),
        cost: state.cost + cost + (penalties.get(edge.id) || 0), baseCost: state.baseCost + cost, edge, parent: state };
      if (!remaining.has(next.stopId)) continue;
      next.priority = next.cost + remaining.get(next.stopId);
      next.key = key(next);
      if (admit(next)) heap.push(next);
    }
  }
  return { path: null, expansions, truncated: heap.length > 0 };
}

function describePath(network, runtime, path, origin, destination, options) {
  const endpoints = new Map([...runtime.stops, [origin.id, origin], [destination.id, destination]]);
  const steps = [];
  const factor = { normal: 1, peak: 1.12, rain: 1.2, disruption: 1.35 }[options.scenario];
  let previousRide;
  let transfers = 0;
  for (const edge of path.edges) {
    const route = runtime.routes.get(edge.routeId);
    const last = steps.at(-1);
    if (last && last.lineId === edge.routeId && edge.mode !== 'walk' && last.segmentId === edge.segmentId) {
      last.toId = edge.to;
      last.to = endpoints.get(edge.to)?.name || edge.to;
      last.stationCount++;
      last.minutes += edge.minutes * factor;
      last.distanceMeters += edge.distanceMeters;
      last.geometry.push(...edge.geometry.slice(1));
      last.stopIds.push(edge.to);
      continue;
    }
    const isContinuation = route && previousRide && last?.mode !== 'walk' && continued(network, edge.from, previousRide, route.id);
    if (route && previousRide && previousRide !== route.id && !isContinuation) transfers++;
    if (route) previousRide = route.id;
    steps.push({ mode: edge.mode, lineId: edge.routeId || 'walk', lineName: route?.name || 'A pie (estimado)',
      code: route?.code || '', networkId: route?.networkId || '', color: route?.color || '#6d7770',
      fromId: edge.from, toId: edge.to, from: endpoints.get(edge.from)?.name || edge.from,
      to: endpoints.get(edge.to)?.name || edge.to, minutes: edge.minutes * (edge.mode === 'walk' ? 1 : factor),
      waitingMinutes: route && !isContinuation ? (route.mode === 'metro' ? 4 : 8) * factor : 0,
      distanceMeters: edge.distanceMeters, stationCount: edge.mode === 'walk' ? 0 : 1,
      geometry: [...edge.geometry], stopIds: [edge.from, edge.to], segmentId: edge.segmentId || null,
      source: 'simulation', experimental: true, stopOrderVerified: route?.stopOrderVerified ?? false,
      sourceIds: route?.sourceIds || [], geometrySource: route?.geometryKind || 'estimated-walk',
      directionVerified: route?.directionVerified ?? false, ...(isContinuation ? { continuesOnTrain: true } : {}),
      ...(route ? { occupancy: occupancyFor(route.id, options.scenario) } : { walkingEstimate: 'geodesic-distance-times-1.25' }) });
  }
  const rideSteps = steps.filter(step => step.mode !== 'walk');
  const walkingMeters = Math.ceil(steps.filter(step => step.mode === 'walk').reduce((sum, step) => sum + step.distanceMeters, 0));
  const duration = steps.reduce((sum, step) => sum + step.minutes + (step.waitingMinutes || 0), 0) + transfers * 3;
  const occupancy = Math.round(rideSteps.reduce((sum, step) => sum + step.occupancy * step.minutes, 0) / Math.max(1, rideSteps.reduce((sum, step) => sum + step.minutes, 0)));
  const durationMinutes = Math.ceil(duration);
  const radius = Math.max(5, Math.ceil(durationMinutes * 0.3));
  const signature = rideSteps.map(step => `${step.lineId}:${step.fromId}:${step.toId}:${step.segmentId}`).join('|');
  return { id: `mobility-${hash(signature)}`, title: transfers ? `${transfers} transbordo${transfers > 1 ? 's' : ''}` : 'Viaje directo',
    durationMinutes, walkingMinutes: Math.ceil(walkingMeters / 75), walkingMeters, transfers, occupancy,
    modes: [...new Set(rideSteps.map(step => step.mode))],
    serviceIds: rideSteps.map(step => step.lineId).filter((id, index, ids) => index === 0 || id !== ids[index - 1]),
    etaRange: [Math.max(1, durationMinutes - radius), durationMinutes + radius], score: Math.round(path.baseCost * 10) / 10,
    steps: steps.map(step => ({ ...step, minutes: Math.ceil(step.minutes), waitingMinutes: Math.ceil(step.waitingMinutes || 0), distanceMeters: Math.round(step.distanceMeters) })),
    stationIds: [...new Set(path.edges.flatMap(edge => [edge.from, edge.to]).filter(id => runtime.stops.has(id)))],
    geometry: { segments: steps.map(step => ({ mode: step.mode, lineId: step.lineId, coordinates: step.geometry })) },
    accessibility: 'unknown', source: 'simulation', experimental: true };
}

export function planMobility(network, request = {}) {
  const { preference = 'fastest', scenario = 'normal', offline = false, transport = 'all' } = request;
  if (!['fastest', 'comfortable', 'accessible'].includes(preference)) throw error('INVALID_PREFERENCE', 'La prioridad seleccionada no es válida.');
  if (!['normal', 'peak', 'rain', 'disruption'].includes(scenario)) throw error('INVALID_SCENARIO', 'El escenario seleccionado no es válido.');
  if (!['all', 'metro'].includes(transport)) throw error('INVALID_TRANSPORT', 'El filtro de transporte seleccionado no es válido.');
  const origin = resolveMobilityEndpoint(network, request.from, { offline });
  const destination = resolveMobilityEndpoint(network, request.to, { offline });
  const date = request.date ? new Date(request.date) : new Date();
  if (!Number.isFinite(date.getTime())) throw error('INVALID_DATE', 'La fecha de consulta no es válida.');
  const selectedRoutes = network.routes.filter(route => transport !== 'metro' || route.mode === 'metro');
  const networkCounts = new Map();
  for (const route of selectedRoutes) networkCounts.set(route.networkId || route.mode, (networkCounts.get(route.networkId || route.mode) || 0) + 1);
  const base = { mode: 'experimental', generatedAt: date.toISOString(), preference, scenario, offline, transport,
    from: origin, to: destination, networkRevision: network.revision,
    coverage: { routeCount: selectedRoutes.length, stopCount: network.stops.length,
      networks: [...networkCounts].map(([id, routeCount]) => ({ id, routeCount })),
      excludedRouteCount: network.coverage?.excludedRoutes?.length || 0,
      maxWalkingMeters: network.limits?.maxWalkingMeters || 1200,
      exhaustive: false, alternativesLimit: 8 },
    warnings: ['Tiempos y aforo simulados; no corresponden a salidas reales.',
      'Orden y sentidos de autobús inferidos; confirma el servicio con el operador.',
      'Caminatas aproximadas; cruces, banquetas y accesibilidad sin verificar.'] };
  if (origin.id === destination.id) return { ...base, journeys: [], message: 'Ya estás en tu destino.', diagnostics: { expansions: 0, truncated: false } };
  const runtime = buildRuntime(network);
  const journeys = [];
  const penalties = new Map();
  let expansions = 0;
  let truncated = false;
  let searches = 0;
  const budget = clamp(request.maxExpansions ?? network.limits?.maxExpansions ?? 24000, 1, 24000);
  // Independent mode searches keep a fast Metro path from hiding a useful bus
  // or mixed option. All probes share the same bounded expansion budget.
  const strategies = transport === 'metro' ? [{ allowedModes: ['metro'] }] : [
    {}, { allowedModes: ['metro'] }, { allowedModes: ['bus'] }, { requiredModes: 3 },
  ];
  const seenServices = new Set();
  const selectedRouteIds = new Set(selectedRoutes.map(route => route.id));
  const arrivalProbes = [...new Set(endpointCandidates(network, destination, base.coverage.maxWalkingMeters, selectedRouteIds)
    .flatMap(candidate => candidate.stop.routeIds).filter(id => selectedRouteIds.has(id)))].slice(0, 8)
    .map(arrivalRouteId => ({ ...(transport === 'metro' ? { allowedModes: ['metro'] } : {}), arrivalRouteId }));
  const exclusionProbes = [];
  let duplicateAttempts = 0;
  for (let attempt = 0; attempt < 16 && journeys.length < 8; attempt++) {
    if (expansions >= budget) { truncated = true; break; }
    const strategy = strategies[attempt] || (attempt === strategies.length ? exclusionProbes.shift() : null) ||
      arrivalProbes.shift() || exclusionProbes.shift() || (transport === 'metro' ? { allowedModes: ['metro'] } : {});
    const alreadyRepresented = strategy.arrivalRouteId ? journeys.some(journey => journey.serviceIds.at(-1) === strategy.arrivalRouteId) :
      strategy.requiredModes ? journeys.some(journey => journey.modes.includes('metro') && journey.modes.includes('bus')) :
        attempt < strategies.length && strategy.allowedModes?.length === 1 ? journeys.some(journey => journey.modes.length === 1 && journey.modes[0] === strategy.allowedModes[0]) : false;
    if (alreadyRepresented) continue;
    const probeBudget = Math.min(budget - expansions, strategy.allowedModes?.[0] === 'metro' ? 3000 : 6000);
    const result = search(network, runtime, origin, destination, { preference, scenario, ...strategy, maxExpansions: probeBudget },
      attempt < strategies.length || strategy.excludedRouteIds || strategy.arrivalRouteId ? new Map() : penalties);
    searches++;
    expansions += result.expansions;
    truncated ||= result.truncated;
    if (!result.path) {
      if (attempt >= strategies.length && !arrivalProbes.length && !exclusionProbes.length) break;
      continue;
    }
    const journey = describePath(network, runtime, result.path, origin, destination, { preference, scenario });
    const serviceKey = journey.serviceIds.join('|');
    const plausibleDetour = journeys.length === 0 || journey.durationMinutes <= Math.max(journeys[0].durationMinutes * 2.2, journeys[0].durationMinutes + 45);
    if (plausibleDetour && !seenServices.has(serviceKey)) {
      seenServices.add(serviceKey);
      journeys.push(journey);
      duplicateAttempts = 0;
      // Removing one used service can uncover a different corridor even when
      // penalizing individual road edges would keep returning the same lines.
      if (attempt === 0) for (const routeId of [...journey.serviceIds].sort((a, b) =>
        Number(runtime.routes.get(b)?.mode === 'bus') - Number(runtime.routes.get(a)?.mode === 'bus'))) exclusionProbes.push({
        ...(transport === 'metro' ? { allowedModes: ['metro'] } : {}), excludedRouteIds: new Set([routeId]),
      });
    } else duplicateAttempts++;
    for (const edge of result.path.edges.filter(edge => edge.routeId)) {
      penalties.set(edge.id, (penalties.get(edge.id) || 0) + 6 + edge.minutes * 1.2);
    }
    if (attempt >= strategies.length && !arrivalProbes.length && !exclusionProbes.length && duplicateAttempts >= 3) break;
  }
  // Diversification penalties find alternatives; score retains the exact original
  // search objective, before rounding displayed minutes and without penalties.
  journeys.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  const allowedRouteIds = new Set(selectedRoutes.map(route => route.id));
  const originStops = endpointCandidates(network, origin, base.coverage.maxWalkingMeters, allowedRouteIds);
  const destinationStops = endpointCandidates(network, destination, base.coverage.maxWalkingMeters, allowedRouteIds);
  const reason = journeys.length ? null : !originStops.length ? 'NO_NEARBY_ORIGIN_STOPS' : !destinationStops.length ? 'NO_NEARBY_DESTINATION_STOPS' :
    truncated ? 'SEARCH_LIMIT' : 'DISCONNECTED_NETWORK';
  const noConnectionMessage = reason === 'NO_NEARBY_ORIGIN_STOPS' ? 'No encontramos conexión: faltan paradas documentadas cerca del origen dentro del alcance de 1.2 km a pie.' :
    reason === 'NO_NEARBY_DESTINATION_STOPS' ? 'No encontramos conexión: faltan paradas documentadas cerca del destino dentro del alcance de 1.2 km a pie.' :
      reason === 'SEARCH_LIMIT' ? 'La búsqueda alcanzó el límite del experimento. Prueba puntos más cercanos.' :
        'No encontramos conexión en la red documentada con un máximo de 1.2 km a pie. Prueba una parada publicada cercana.';
  return { ...base, journeys, diagnostics: { expansions, truncated, searches, reason },
    ...(journeys.length ? {} : { message: noConnectionMessage }) };
}
