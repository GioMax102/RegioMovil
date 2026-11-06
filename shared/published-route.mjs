import { projectOnPolyline } from '../server/mobility.mjs';

// SHA-256 is used only to preserve legacy IDs when a source repeats a marker ID.
// This portable implementation keeps the normalizer synchronous in Node and the browser.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotate = (x, n) => (x >>> n) | (x << (32 - n));
function digest(text) {
  const input = new TextEncoder().encode(text);
  const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  bytes.set(input);
  bytes[input.length] = 128;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 4, input.length * 8);
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Int32Array(64);
  for (let block = 0; block < bytes.length; block += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getInt32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15],
        y = words[i - 2];
      words[i] =
        words[i - 16] +
        (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
        words[i - 7] +
        (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const t =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          K[i] +
          words[i]) |
        0;
      const u =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t) | 0;
      d = c;
      c = b;
      b = a;
      a = (t + u) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => {
      hash[i] = (hash[i] + value) | 0;
    });
  }
  return hash
    .map((value) => (value >>> 0).toString(16).padStart(8, '0'))
    .join('')
    .slice(0, 12);
}

/** One canonical interpretation for routing, nearby options and selected-route maps. */
export function normalizePublishedRoute(route, pack) {
  const excludedStops = [];
  if (pack.experimentalRouting === false)
    return { stops: [], segments: [], excludedStops, reason: 'visualization-only' };
  const segments = (pack.segments?.length ? pack.segments : [pack.coordinates]).map(
    (coordinates, index) => ({ id: `${route.id}:${index}`, coordinates, records: [] }),
  );
  const stops = [],
    usedIds = new Set();
  for (const marker of pack.stops || []) {
    const exclude = (reason) =>
      excludedStops.push({ routeId: route.id, markerId: marker?.id, reason });
    if (
      !marker ||
      typeof marker.id !== 'string' ||
      typeof marker.name !== 'string' ||
      !Number.isFinite(marker.lat) ||
      !Number.isFinite(marker.lng) ||
      marker.lat < 24 ||
      marker.lat > 28 ||
      marker.lng < -102 ||
      marker.lng > -99
    ) {
      exclude('invalid-marker');
      continue;
    }
    const note = String(marker.publishedInfrastructureNote || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    if (note.includes('PROPUESTA') && !note.includes('EXISTE')) {
      exclude('proposed-only');
      continue;
    }
    let nearest = null;
    segments.forEach((segment, index) => {
      const candidate = projectOnPolyline(marker, segment.coordinates);
      if (!nearest || candidate.distanceMeters < nearest.distanceMeters)
        nearest = { index, ...candidate };
    });
    if (!nearest || !Number.isFinite(nearest.distanceMeters) || nearest.distanceMeters > 160) {
      exclude('too-far-from-published-trace');
      continue;
    }
    let id = `${route.id}:${encodeURIComponent(marker.id)}`;
    if (usedIds.has(id)) id += `:${digest(`${marker.lng},${marker.lat},${marker.name}`)}`;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    stops.push({
      id,
      name: marker.name,
      lat: marker.lat,
      lng: marker.lng,
      mode: 'bus',
      routeIds: [route.id],
      sourceIds: route.sourceIds,
      official: true,
      infrastructureStatus: marker.infrastructureStatus || 'unknown',
      ...(marker.municipality ? { municipality: marker.municipality } : {}),
      ...(marker.publishedInfrastructureNote
        ? { publishedInfrastructureNote: marker.publishedInfrastructureNote }
        : {}),
      snapDistanceMeters: Math.round(nearest.distanceMeters),
    });
    segments[nearest.index].records.push({ id, position: nearest.position });
  }
  const usable = segments
    .map((segment) => {
      segment.records.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      return {
        id: segment.id,
        coordinates: segment.coordinates,
        stopIds: segment.records.map((record) => record.id),
        positions: segment.records.map((record) => Math.round(record.position * 1e6) / 1e6),
      };
    })
    .filter((segment) => segment.stopIds.length >= 2);
  const retained = new Set(usable.flatMap((segment) => segment.stopIds));
  return {
    stops: stops.filter((stop) => retained.has(stop.id)),
    segments: usable,
    excludedStops,
    reason: usable.length ? null : 'insufficient-published-stops',
  };
}
