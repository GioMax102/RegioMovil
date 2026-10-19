import { readFile } from 'node:fs/promises';
import { parseIntersection, streetTokens, similarToken, normalizePlaceText } from './place-query.mjs';

let indexPromise;
function loadIndex() {
  // This asset stays in the API. The low-end Android client never downloads it.
  indexPromise ||= readFile(new URL('../data/street-junctions.json', import.meta.url), 'utf8').then(raw => createJunctionLookup(JSON.parse(raw))).catch(() => () => []);
  return indexPromise;
}

/** Injectable for topology tests; data was precomputed from real OSM vertices. */
export function createJunctionLookup(data) {
  if (data.version !== 1 || !Array.isArray(data.streets) || !Array.isArray(data.junctions)) throw new TypeError('Invalid street junction index');
  const streets = data.streets.map(([name, aliases]) => ({ name, tokens: [name, ...(aliases || [])].map(streetTokens) }));
  const byStreet = new Map();
  data.junctions.forEach((junction, i) => {
    for (const street of junction[2]) {
      if (!byStreet.has(street)) byStreet.set(street, new Set());
      byStreet.get(street).add(i);
    }
  });
  const matchStreet = query => {
    const tokens = streetTokens(query);
    const matches = [];
    streets.forEach((street, i) => {
      let score = 0;
      for (const candidates of street.tokens) {
        if (tokens.every(token => candidates.some(candidate => similarToken(token, candidate)))) {
          score = Math.max(score, 100 + tokens.filter(token => candidates.includes(token)).length * 10 - candidates.length);
        }
      }
      if (score) matches.push({ i, score });
    });
    return matches.sort((a, b) => b.score - a.score).slice(0, 12);
  };
  return query => {
    const parsed = parseIntersection(query);
    if (!parsed) return [];
    const [a, b] = parsed.streets.map(matchStreet);
    if (!a.length || !b.length) return [];
    const candidates = [];
    for (const left of a) for (const right of b) {
      if (left.i === right.i || normalizePlaceText(streets[left.i].name) === normalizePlaceText(streets[right.i].name)) continue;
      for (const id of byStreet.get(left.i) || []) {
        if (!byStreet.get(right.i)?.has(id)) continue;
        candidates.push({ id, left: left.i, right: right.i, score: left.score + right.score });
      }
    }
    const places = [];
    for (const candidate of candidates.sort((a, b) => b.score - a.score || (data.junctions[a.id][5] || 0) - (data.junctions[b.id][5] || 0) || a.id - b.id)) {
      const [lat, lng, streetIds, wayIds, nodeId, geometric] = data.junctions[candidate.id];
      // Divided carriageways can describe four corners of the same junction.
      if (places.some(place => Math.hypot((place.lat - lat) * 111195, (place.lng - lng) * 100199) < 70)) continue;
      const name = `${streets[candidate.left].name} y ${streets[candidate.right].name}`;
      const sourceId = nodeId ? `node/${nodeId}` : `way/${wayIds[streetIds.indexOf(candidate.left)]}`;
      const address = geometric ? 'Cruce de referencia · verifica los accesos en el mapa · ZMM, Nuevo León' : 'Cruce en la Zona Metropolitana de Monterrey, Nuevo León';
      places.push({ id: `intersection:${nodeId || `${lat},${lng}`}`, name,
        address, displayName: `${name}, ${address}`,
        lat, lng, kind: 'place', resultType: 'intersection', precision: geometric ? 'approximate' : 'exact',
        source: { title: `© OpenStreetMap contributors · ${geometric ? 'trazos publicados de calles' : 'nodo compartido de calles'}`, url: `https://www.openstreetmap.org/${sourceId}` },
        coordinateSource: { title: geometric ? 'Intersección geométrica de trazos OSM; no demuestra conexión ni acceso peatonal' : 'Cruce de calles con vértice OSM compartido; no valida acceso peatonal', url: `https://www.openstreetmap.org/${sourceId}`, precision: geometric ? 'projected-crossing' : 'published-intersection' },
        verifiedAt: data.retrieved,
      });
      if (places.length === 6) break;
    }
    return places;
  };
}

export async function findStreetJunctions(query) {
  if (!parseIntersection(query)) return [];
  return (await loadIndex())(query);
}
