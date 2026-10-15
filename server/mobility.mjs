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
  if (typeof endpoint.id === 'string') {
    const stop = network.stops.find(stop => stop.id === endpoint.id || stop.stationId === endpoint.id);
    if (!stop || stop.official !== true) throw error('UNKNOWN_STOP', 'El punto no pertenece a las paradas publicadas de esta red.');
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

export function nearbyMobilityStops(network, location, maxMeters = 1200, limit = 8) {
  const candidates = network.stops.map(stop => ({ stop, distanceMeters: Math.ceil(distanceMeters(location, stop) * 1.25) }))
    .filter(candidate => candidate.distanceMeters <= Math.min(1200, maxMeters))
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
      if (++retained >= 10) break;
    }
  }
  const runtime = { stops, routes, adjacency };
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
      if (values[parent].cost <= value.cost) break;
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
      if (child + 1 < values.length && values[child + 1].cost < values[child].cost) child++;
      if (values[child].cost >= last.cost) break;
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

function search(network, runtime, origin, destination, options, penalties) {
  const maxWalk = network.limits?.maxWalkingMeters || 1200;
  const starts = origin.kind === 'stop' ? [{ stop: origin, distanceMeters: 0 }] : nearbyMobilityStops(network, origin, maxWalk);
  const ends = destination.kind === 'stop' ? [{ stop: destination, distanceMeters: 0 }] : nearbyMobilityStops(network, destination, maxWalk);
  if (!starts.length || !ends.length) return { path: null, expansions: 0, truncated: false };
  const endMap = new Map(ends.map(candidate => [candidate.stop.id, candidate]));
  const heap = new MinHeap();
  const labels = new Map();
  const factor = { normal: 1, peak: 1.12, rain: 1.2, disruption: 1.35 }[options.scenario];
  const walkingWeight = options.preference === 'accessible' ? 1.6 : 1;
  const key = state => `${state.stopId}|${state.line || ''}|${Number(state.walkedLast)}|${state.transfers}`;
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
    const edge = candidate.distanceMeters > 0 ? walkEdge(origin, candidate.stop, candidate.distanceMeters) : null;
    const state = { stopId: candidate.stop.id, line: null, walkedLast: !!edge, walking: candidate.distanceMeters,
      transfers: 0, cost: edge ? edge.minutes * walkingWeight : 0, baseCost: edge ? edge.minutes * walkingWeight : 0, parent: null, edge };
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
    if (end && state.line && state.walking + end.distanceMeters <= maxWalk) {
      // A terminal edge participates in the queue, preserving total-cost ordering.
      const edge = end.distanceMeters ? walkEdge(end.stop, destination, end.distanceMeters) : null;
      const terminal = { ...state, stopId: '$destination', parent: state, edge, cost: state.cost + (edge?.minutes || 0) * walkingWeight,
        baseCost: state.baseCost + (edge?.minutes || 0) * walkingWeight,
        walking: state.walking + end.distanceMeters, key: `$destination:${state.key}` };
      heap.push(terminal);
      endMap.delete(state.stopId);
    }
    if (state.stopId === '$destination') {
      const edges = [];
      let cursor = state;
      while (cursor) { if (cursor.edge) edges.push(cursor.edge); cursor = cursor.parent; }
      return { path: { edges: edges.reverse(), cost: state.cost, baseCost: state.baseCost }, expansions, truncated: false };
    }
    for (const edge of runtime.adjacency.get(state.stopId) || []) {
      const walking = state.walking + (edge.mode === 'walk' ? edge.distanceMeters : 0);
      if (walking > maxWalk || (edge.mode === 'walk' && state.walkedLast)) continue;
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
        cost: state.cost + cost + (penalties.get(edge.id) || 0), baseCost: state.baseCost + cost, edge, parent: state };
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
    etaRange: [Math.max(1, durationMinutes - radius), durationMinutes + radius], score: Math.round(path.baseCost * 10) / 10,
    steps: steps.map(step => ({ ...step, minutes: Math.ceil(step.minutes), waitingMinutes: Math.ceil(step.waitingMinutes || 0), distanceMeters: Math.round(step.distanceMeters) })),
    stationIds: [...new Set(path.edges.flatMap(edge => [edge.from, edge.to]).filter(id => runtime.stops.has(id)))],
    geometry: { segments: steps.map(step => ({ mode: step.mode, lineId: step.lineId, coordinates: step.geometry })) },
    accessibility: 'unknown', source: 'simulation', experimental: true };
}

export function planMobility(network, request = {}) {
  const { preference = 'fastest', scenario = 'normal', offline = false } = request;
  if (!['fastest', 'comfortable', 'accessible'].includes(preference)) throw error('INVALID_PREFERENCE', 'La prioridad seleccionada no es válida.');
  if (!['normal', 'peak', 'rain', 'disruption'].includes(scenario)) throw error('INVALID_SCENARIO', 'El escenario seleccionado no es válido.');
  const origin = resolveMobilityEndpoint(network, request.from, { offline });
  const destination = resolveMobilityEndpoint(network, request.to, { offline });
  const date = request.date ? new Date(request.date) : new Date();
  if (!Number.isFinite(date.getTime())) throw error('INVALID_DATE', 'La fecha de consulta no es válida.');
  const base = { mode: 'experimental', generatedAt: date.toISOString(), preference, scenario, offline,
    from: origin, to: destination, networkRevision: network.revision,
    warnings: ['Tiempos y aforo simulados; no corresponden a salidas reales.',
      'Orden y sentidos de autobús inferidos; confirma el servicio con el operador.',
      'Caminatas aproximadas; cruces, banquetas y accesibilidad sin verificar.'] };
  if (origin.id === destination.id) return { ...base, journeys: [], message: 'Ya estás en tu destino.', diagnostics: { expansions: 0, truncated: false } };
  const runtime = buildRuntime(network);
  const journeys = [];
  const penalties = new Map();
  let expansions = 0;
  let truncated = false;
  const budget = clamp(request.maxExpansions ?? network.limits?.maxExpansions ?? 24000, 1, 24000);
  for (let attempt = 0; attempt < 5 && journeys.length < 3; attempt++) {
    if (expansions >= budget) { truncated = true; break; }
    const result = search(network, runtime, origin, destination, { preference, scenario, maxExpansions: budget - expansions }, penalties);
    expansions += result.expansions;
    truncated ||= result.truncated;
    if (!result.path) break;
    const journey = describePath(network, runtime, result.path, origin, destination, { preference, scenario });
    const plausibleDetour = journeys.length === 0 || journey.durationMinutes <= Math.max(journeys[0].durationMinutes * 1.6, journeys[0].durationMinutes + 15);
    if (plausibleDetour && !journeys.some(existing => existing.id === journey.id)) journeys.push(journey);
    for (const edge of result.path.edges.filter(edge => edge.routeId)) {
      penalties.set(edge.id, (penalties.get(edge.id) || 0) + 3 + edge.minutes * 0.7);
    }
  }
  // Diversification penalties find alternatives; score retains the exact original
  // search objective, before rounding displayed minutes and without penalties.
  journeys.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return { ...base, journeys, diagnostics: { expansions, truncated },
    ...(journeys.length ? {} : { message: truncated ? 'La búsqueda alcanzó el límite del experimento. Prueba puntos más cercanos.' :
      'No encontramos conexión en la red documentada con un máximo de 1.2 km a pie. Prueba una parada publicada cercana.' }) };
}
