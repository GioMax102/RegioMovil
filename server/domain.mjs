import artifact from '../models/artifact.json' with { type: 'json' };
import { clamp, modelCard, predict, seededRandom } from './model.mjs';

export const SCENARIOS = ['normal', 'peak', 'rain', 'disruption'];
export const PREFERENCES = ['fastest', 'comfortable', 'accessible'];
export { artifact };
export const getModelCard = () => modelCard(artifact);

export function resolveStation(network, id) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const query = normalize(id);
  return network.stations.find(station => station.id === id || normalize(station.name) === query ||
    (station.aliases || []).some(alias => normalize(alias) === query));
}

const hash = value => [...String(value)].reduce((result, char) => Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
const localHour = date => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Monterrey', hour: 'numeric', hourCycle: 'h23' }).format(date));
const crowdLabel = occupancy => occupancy >= 75 ? 'Alta' : occupancy >= 45 ? 'Media' : 'Baja';

function inputs(station, scenario, hour, segmentsRemaining = 2, serviceGap = 4, lineId = 'L2') {
  return { segmentsRemaining, hour, peak: Number(scenario === 'peak'), rain: Number(scenario === 'rain'),
    disruption: Number(scenario === 'disruption'), centrality: Math.max(0.25, station.lineIds?.length > 1 ? 1 : 0.5),
    lineSpeedFactor: lineId === 'L3' ? 0.9 : lineId === 'L1' ? 1.08 : 1,
    serviceGap: serviceGap + (scenario === 'disruption' ? 5 : 0) };
}

/** Deterministic demonstration; never represents observed vehicle or operator state. */
export function buildBoard(network, stationId = 'padre-mier', scenario = 'normal', date = new Date()) {
  if (!SCENARIOS.includes(scenario)) throw new RangeError('Escenario no válido.');
  const station = resolveStation(network, stationId);
  if (!station) throw new RangeError('Estación no encontrada.');
  const bucket = Math.floor(date.getTime() / 300_000);
  const random = seededRandom(hash(`${station.id}:${scenario}:${bucket}`));
  const hour = localHour(date);
  const arrivals = [];
  const lines = network.lines.filter(line => line.stationIds.includes(station.id));
  for (const line of lines) {
    const index = line.stationIds.indexOf(station.id);
    const terminals = [index > 0 ? line.stationIds[0] : null, index < line.stationIds.length - 1 ? line.stationIds.at(-1) : null].filter(Boolean);
    for (const [directionIndex, terminalId] of terminals.entries()) {
      const terminal = resolveStation(network, terminalId);
      const throughService = (network.throughServices || []).find(service => service.stationId === terminalId && service.lineIds.includes(line.id));
      const continuation = throughService && network.lines.find(other => other.id !== line.id && throughService.lineIds.includes(other.id));
      const finalTerminalId = continuation ? continuation.stationIds[0] === terminalId ? continuation.stationIds.at(-1) : continuation.stationIds[0] : terminalId;
      const finalTerminal = resolveStation(network, finalTerminalId);
      const initialSegments = 1 + Math.floor(random() * 2);
      for (let departure = 0; departure < 2; departure++) {
        const sample = inputs(station, scenario, hour, initialSegments + departure * 3, 3 + directionIndex * 2 + random() * 2, line.id);
        const eta = Math.round(clamp(predict(artifact.models.etaMinutes, sample), 1, 60));
        const occupancy = Math.round(clamp(predict(artifact.models.occupancy, sample) + (departure === 1 ? -13 : 3), 3, 99));
        const radius = artifact.models.etaMinutes.interval.absoluteResidualQuantile * (scenario === 'disruption' ? 1.7 : 1);
        arrivals.push({ id: `${line.id}-${terminalId}-${departure}-${bucket}`, lineId: line.id, lineName: line.name,
          direction: finalTerminal?.name || terminal?.name || terminalId,
          ...(continuation ? { via: terminal?.name || terminalId, continuesAsLineId: continuation.id } : {}),
          etaMinutes: eta, etaRange: [Math.max(1, Math.floor(eta - radius)), Math.ceil(eta + radius)],
          occupancy, occupancyLabel: crowdLabel(occupancy), climate: random() > 0.3 ? 'working' : random() > 0.5 ? 'unknown' : 'unavailable',
          accessible: 'unknown', condition: scenario === 'disruption' && departure === 0 ? 'reported' : 'good',
          confidence: Number(clamp(0.88 - radius / Math.max(eta, 5) * 0.25, 0.5, 0.9).toFixed(2)), source: 'simulation' });
      }
    }
  }
  arrivals.sort((a, b) => a.etaMinutes - b.etaMinutes || a.id.localeCompare(b.id));
  const forecast = Array.from({ length: 6 }, (_, index) => {
    const forecastHour = (hour + index) % 24;
    const forecastScenario = scenario === 'normal' && ((forecastHour >= 7 && forecastHour < 10) || (forecastHour >= 17 && forecastHour < 20)) ? 'peak' : scenario;
    return { hour: `${String(forecastHour).padStart(2, '0')}:00`, occupancy: Math.round(clamp(predict(artifact.models.occupancy,
      inputs(station, forecastScenario, forecastHour, 2, 4, lines[0]?.id)), 3, 99)) };
  });
  const advice = {
    normal: { title: 'Compara antes de salir', body: 'Revisa ambos sentidos y la siguiente salida. El tiempo y el espacio disponible son estimaciones de esta demostración.' },
    peak: { title: 'Una salida después puede ir más tranquila', body: 'Compara ocupación y espera. Si tienes margen, revisa otra salida o una estación contigua desde el planificador.' },
    rain: { title: 'Deja margen para tu conexión', body: 'Este escenario añade demora por lluvia. Considera también el tramo a pie y consulta avisos oficiales antes de salir.' },
    disruption: { title: 'Compara el tiempo completo', body: 'Este escenario simula una demora. Una conexión distinta puede reducir la espera, pero conviene revisar transbordos y distancia a pie.' },
  }[scenario];
  const alerts = scenario === 'normal' ? [] : [{ id: `scenario-${scenario}`, title: { peak: 'Simulación de hora pico', rain: 'Simulación de lluvia', disruption: 'Simulación de demora' }[scenario],
    body: 'Escenario de demostración. No es un aviso del operador ni un incidente en tiempo real.', severity: scenario === 'disruption' ? 'warning' : 'info' }];
  return { stationId: station.id, generatedAt: date.toISOString(), mode: 'simulation', scenario, arrivals, forecast, advice, alerts };
}

export function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export function buildGraph(network) {
  const stations = new Map(network.stations.map(station => [station.id, station]));
  const graph = new Map(network.stations.map(station => [station.id, []]));
  for (const line of network.lines) {
    for (let index = 1; index < line.stationIds.length; index++) {
      const from = stations.get(line.stationIds[index - 1]);
      const to = stations.get(line.stationIds[index]);
      if (!from || !to) throw new Error(`Invalid network: ${line.id} references a missing station.`);
      const kilometres = distanceKm(from, to);
      const minutes = Math.max(1.4, kilometres / 32 * 60 + 0.55);
      graph.get(from.id).push({ to: to.id, lineId: line.id, lineName: line.name, minutes });
      graph.get(to.id).push({ to: from.id, lineId: line.id, lineName: line.name, minutes });
    }
  }
  return graph;
}

/** K shortest simple paths on actual catalog edges. Penalizes transfers and synthetic crowding. */
export function planJourney(network, fromId, toId, preference = 'fastest', scenario = 'normal', date = new Date()) {
  if (!PREFERENCES.includes(preference) || !SCENARIOS.includes(scenario)) throw new RangeError('Preferencia o escenario no válido.');
  const from = resolveStation(network, fromId);
  const to = resolveStation(network, toId);
  if (!from || !to) throw new RangeError('Estación no encontrada.');
  if (from.id === to.id) return { journeys: [], mode: 'simulation', generatedAt: date.toISOString(), message: 'Ya estás en tu destino.' };
  const graph = buildGraph(network);
  const continuesThrough = (stationId, fromLine, toLine) => (network.throughServices || []).some(service =>
    service.stationId === stationId && service.lineIds.includes(fromLine) && service.lineIds.includes(toLine));
  const hour = localHour(date);
  const crowd = lineId => clamp(predict(artifact.models.occupancy, inputs(from, scenario, hour, 2, 4, lineId)), 3, 99);
  const queue = [{ stationId: from.id, stationIds: [from.id], edges: [], cost: 0 }];
  const paths = [];
  let expansions = 0;
  while (queue.length && paths.length < 3 && expansions++ < 15000) {
    queue.sort((a, b) => b.cost - a.cost);
    const current = queue.pop();
    if (current.stationId === to.id) {
      paths.push(current);
      continue;
    }
    for (const edge of graph.get(current.stationId) || []) {
      if (current.stationIds.includes(edge.to)) continue;
      const previousLine = current.edges.at(-1)?.lineId;
      const transfer = previousLine && previousLine !== edge.lineId && !continuesThrough(current.stationId, previousLine, edge.lineId);
      const transferCost = preference === 'accessible' ? 15 : preference === 'comfortable' ? 8 : 4;
      const crowdCost = preference === 'comfortable' ? crowd(edge.lineId) / 100 * edge.minutes * 0.65 : 0;
      queue.push({ stationId: edge.to, stationIds: [...current.stationIds, edge.to], edges: [...current.edges, edge],
        cost: current.cost + edge.minutes + (transfer ? transferCost : 0) + crowdCost });
    }
  }
  const stations = new Map(network.stations.map(station => [station.id, station]));
  const journeys = paths.map((path, index) => {
    const steps = [];
    for (const [edgeIndex, edge] of path.edges.entries()) {
      const last = steps.at(-1);
      if (last?.lineId === edge.lineId) {
        last.toId = edge.to;
        last.to = stations.get(edge.to).name;
        last.stationCount++;
        last.minutes += edge.minutes;
      } else {
        const startId = path.stationIds[edgeIndex];
        steps.push({ lineId: edge.lineId, lineName: edge.lineName, fromId: startId, toId: edge.to,
          from: stations.get(startId).name, to: stations.get(edge.to).name, stationCount: 1, minutes: edge.minutes,
          ...(last && continuesThrough(startId, last.lineId, edge.lineId) ? { continuesOnTrain: true } : {}) });
      }
    }
    const transfers = steps.slice(1).filter(step => !step.continuesOnTrain).length;
    const walkingMinutes = 4 + transfers * 3;
    const scenarioFactor = scenario === 'rain' ? 1.13 : scenario === 'disruption' ? 1.28 : scenario === 'peak' ? 1.07 : 1;
    const rideMinutes = path.edges.reduce((sum, edge) => sum + edge.minutes * scenarioFactor, 0);
    const waitMinutes = scenario === 'disruption' ? 10 : scenario === 'rain' ? 7 : 4;
    const durationMinutes = Math.ceil(rideMinutes + walkingMinutes + waitMinutes + transfers * 3);
    const occupancy = Math.round(path.edges.reduce((sum, edge) => sum + crowd(edge.lineId), 0) / path.edges.length);
    const radius = Math.ceil(artifact.models.etaMinutes.interval.absoluteResidualQuantile * (transfers + 1) + durationMinutes * 0.08);
    return { id: `journey-${index}-${hash(path.stationIds.join(':'))}`, title: transfers === 0 ? 'Viaje directo' : `${transfers} transbordo${transfers > 1 ? 's' : ''}`,
      durationMinutes, walkingMinutes, transfers, occupancy, score: Math.round(path.cost * 10) / 10,
      steps: steps.map(step => ({ ...step, minutes: Math.ceil(step.minutes * scenarioFactor) })),
      accessibility: 'unknown', source: 'simulation', etaRange: [Math.max(1, durationMinutes - radius), durationMinutes + radius],
      stationIds: path.stationIds };
  });
  return { journeys, mode: 'simulation', generatedAt: date.toISOString(), preference,
    ...(preference === 'accessible' ? { message: 'Priorizamos menos transbordos. La accesibilidad de estaciones y unidades no está verificada; confirma las condiciones con el operador.' } : {}),
    ...(journeys.length === 0 ? { message: 'No hay conexión documentada entre estas estaciones.' } : {}) };
}
