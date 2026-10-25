import { useEffect, useId, useRef, useState } from 'react';
import { Info, Minus, Plus, LocateFixed } from 'lucide-react';
import geography from '../data/monterrey-map.json';
import type { Journey, Network, Station, RoutePack, TransitRoute } from '../types';

const WIDTH = 670;
const HEIGHT = 410;
const basemapUrl = new URL('../assets/monterrey-map.svg', import.meta.url).href;

function geographicPoint(point: { lng: number; lat: number }) {
  return {
    x: (point.lng - geography.origin[0]) * geography.unitsPerDegree * geography.longitudeFactor,
    y: (geography.origin[1] - point.lat) * geography.unitsPerDegree,
  };
}

/** The bundled OSM extract and transit coordinates share the same geographic projection. */
export default function NetworkMap({
  network,
  selected,
  onSelect,
  highlighted = [],
  journey,
  service,
}: {
  network: Network;
  selected?: string;
  onSelect?: (id: string) => void;
  highlighted?: string[];
  journey?: Journey;
  service?: { route: TransitRoute; pack: RoutePack };
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(
    null,
  );
  const mapId = useId().replace(/:/g, '');
  const chosen = network.stations.find((station) => station.id === selected);
  const stationById = new Map(network.stations.map((station) => [station.id, station]));
  const segments = (journey?.steps ?? []).flatMap((step) => {
    const line = network.lines.find((candidate) => candidate.id === step.lineId);
    if (!line) return [];
    const from = line.stationIds.indexOf(step.fromId ?? '');
    const to = line.stationIds.indexOf(step.toId ?? '');
    if (from < 0 || to < 0) return [];
    const ids = line.stationIds.slice(Math.min(from, to), Math.max(from, to) + 1);
    if (from > to) ids.reverse();
    return [
      { line, stations: ids.map((id) => stationById.get(id)).filter((s): s is Station => !!s) },
    ];
  });
  const routeStations = segments.flatMap((segment) => segment.stations);
  const routeIds = new Set(routeStations.map((station) => station.id));
  const endpointIds = new Set(
    journey?.steps.flatMap((step) => [step.fromId, step.toId]).filter(Boolean) ?? [],
  );
  const servicePaths = service
    ? service.pack.segments?.length
      ? service.pack.segments
      : [service.pack.coordinates]
    : [];
  const servicePoints = servicePaths.flat().map(([lng, lat]) => ({ lng, lat }));
  const focusStations = servicePoints.length
    ? servicePoints
    : routeStations.length
      ? routeStations
      : network.stations;
  const projected = focusStations.map(geographicPoint);
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  // A short journey still gets enough surrounding streets to orient the traveler.
  const scale = Math.min(
    (WIDTH - 144) / Math.max(maxX - minX, 2600),
    (HEIGHT - 116) / Math.max(maxY - minY, 1800),
  );
  const offsetX = WIDTH / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = HEIGHT / 2 - ((minY + maxY) / 2) * scale;
  const project = (point: { lng: number; lat: number }) => {
    const p = geographicPoint(point);
    return { x: p.x * scale + offsetX, y: p.y * scale + offsetY };
  };
  const points = (stations: Station[]) =>
    stations
      .map((station) => {
        const p = project(station);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [journey?.id, service?.route.id]);
  const routeLineIds = new Set(segments.map((segment) => segment.line.id));
  const visibleLines = journey
    ? network.lines.filter((line) => routeLineIds.has(line.id))
    : network.lines;
  const labelIds = new Set([
    'sendero',
    'talleres',
    'universidad',
    'exposicion',
    'hospital-metropolitano',
  ]);
  const first = routeStations[0];
  const last = routeStations[routeStations.length - 1];

  return (
    <div className="network-map">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          service
            ? `Recorrido publicado de ${service.route.name}. ${service.pack.stops.length} puntos de referencia; orden operativo sin verificar.`
            : journey
              ? `Mapa de Monterrey. Ruta de ${first?.name ?? ''} a ${last?.name ?? ''}.`
              : `Mapa de Monterrey y red Metrorrey. ${chosen ? `Estación: ${chosen.name}.` : ''}`
        }
        style={{ display: 'block', touchAction: 'none', cursor: 'grab' }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          if (Math.hypot(dx, dy) < 5 && !drag.current.moved) return;
          drag.current.moved = true;
          const ratio = 1 / (event.currentTarget.getScreenCTM()?.a ?? 1);
          setPan({ x: drag.current.panX + dx * ratio, y: drag.current.panY + dy * ratio });
        }}
        onPointerUp={(event) => {
          if (drag.current && !drag.current.moved && onSelect) {
            // SVG capture keeps dragging reliable; station picking uses the release position.
            const matrix = event.currentTarget.getScreenCTM();
            const pointer = event.currentTarget.createSVGPoint();
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            const { x, y } = matrix ? pointer.matrixTransform(matrix.inverse()) : pointer;
            const nearby = network.stations
              .map((station) => {
                const p = project(station);
                return {
                  station,
                  distance: Math.hypot(
                    p.x * zoom + (WIDTH / 2) * (1 - zoom) + pan.x - x,
                    p.y * zoom + (HEIGHT / 2) * (1 - zoom) + pan.y - y,
                  ),
                };
              })
              .sort((a, b) => a.distance - b.distance)[0];
            if (nearby?.distance < 18) onSelect(nearby.station.id);
          }
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <clipPath id={`${mapId}-clip`}>
            <rect width={WIDTH} height={HEIGHT} />
          </clipPath>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="#ecefe7" />
        <g clipPath={`url(#${mapId}-clip)`}>
          <g
            transform={`translate(${(WIDTH / 2) * (1 - zoom) + pan.x} ${(HEIGHT / 2) * (1 - zoom) + pan.y}) scale(${zoom})`}
          >
            <g transform={`translate(${offsetX} ${offsetY}) scale(${scale})`} aria-hidden="true">
              <image href={basemapUrl} width={geography.width} height={geography.height} />
            </g>
            <g aria-hidden="true">
              {geography.labels.map((label) => {
                const p = project(label);
                return (
                  <text
                    key={label.name}
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#687c69"
                    stroke="#edf1e8"
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {label.name}
                  </text>
                );
              })}
            </g>
            {network.lines.map((line) => (
              <g key={line.id}>
                <polyline
                  points={points(
                    line.stationIds
                      .map((id) => stationById.get(id))
                      .filter((station): station is Station => !!station),
                  )}
                  stroke="#fff"
                  strokeWidth={journey ? 6 : 8}
                  opacity={
                    service || journey
                      ? 0.25
                      : highlighted.length && !highlighted.includes(line.id)
                        ? 0.3
                        : 1
                  }
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={points(
                    line.stationIds
                      .map((id) => stationById.get(id))
                      .filter((s): s is Station => !!s),
                  )}
                  stroke={line.color}
                  strokeWidth={journey ? 3 : 5}
                  opacity={
                    service
                      ? 0.18
                      : journey
                        ? 0.2
                        : highlighted.length && !highlighted.includes(line.id)
                          ? 0.3
                          : 1
                  }
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
            {segments.map((segment, index) => (
              <g key={`${segment.line.id}-${index}`}>
                <polyline
                  points={points(segment.stations)}
                  stroke="#fff"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={points(segment.stations)}
                  stroke={segment.line.color}
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
            {servicePaths.map((path, index) => (
              <g key={`service-${index}`}>
                <polyline
                  points={path
                    .map(([lng, lat]) => {
                      const point = project({ lng, lat });
                      return `${point.x},${point.y}`;
                    })
                    .join(' ')}
                  stroke="#fff"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={path
                    .map(([lng, lat]) => {
                      const point = project({ lng, lat });
                      return `${point.x},${point.y}`;
                    })
                    .join(' ')}
                  stroke="#256f4d"
                  strokeWidth="4.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
            {service?.pack.stops.map((stop, index) => {
              const point = project(stop);
              return (
                <circle
                  key={`service-stop-${stop.id}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="2.2"
                  fill="#fff"
                  stroke="#256f4d"
                  strokeWidth="1"
                  aria-hidden="true"
                />
              );
            })}
            {network.stations
              .filter((station) => !journey || routeIds.has(station.id))
              .map((station) => {
                const p = project(station);
                const active = selected === station.id;
                const endpoint = endpointIds.has(station.id);
                const label = service
                  ? false
                  : journey
                    ? endpoint
                    : active || labelIds.has(station.id);
                // Offset neighboring endpoints to opposite sides of the track.
                const below = journey && station.id === last?.id;
                return (
                  <g key={station.id} className="map-stop" aria-hidden="true">
                    {(active || endpoint) && (
                      <circle cx={p.x} cy={p.y} r="12" fill="#174d3d" opacity=".12" />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={endpoint || active ? 5.5 : station.lineIds.length > 1 ? 4 : 2.5}
                      fill={endpoint || active ? '#174d3d' : '#fff'}
                      stroke={endpoint || active ? '#fff' : '#6f7d6d'}
                      strokeWidth={endpoint || active ? 2 : 1.2}
                    />
                    {label && (
                      <text
                        className="station-label"
                        x={Math.min(WIDTH - 10, Math.max(10, p.x))}
                        y={p.y + (below ? 23 : -14)}
                        textAnchor="middle"
                        style={{
                          fontSize: endpoint || active ? 11 : 9,
                          fontWeight: endpoint || active ? 700 : 500,
                        }}
                      >
                        {station.name
                          .replace('General I. ', '')
                          .replace('Hospital Metropolitano', 'H. Metropolitano')}
                      </text>
                    )}
                  </g>
                );
              })}
          </g>
        </g>
      </svg>
      <div className="map-compass" aria-hidden="true">
        N<span>↑</span>
      </div>
      <div className="map-controls">
        <button
          type="button"
          aria-label="Acercar mapa"
          onClick={() => setZoom((z) => Math.min(3, z + 0.4))}
          disabled={zoom >= 3}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          aria-label="Alejar mapa"
          onClick={() => setZoom((z) => Math.max(1, z - 0.4))}
          disabled={zoom <= 1}
        >
          <Minus size={17} />
        </button>
        <button type="button" aria-label="Restablecer encuadre de la ruta" onClick={reset}>
          <LocateFixed size={17} />
        </button>
      </div>
      <details className="network-map-information">
        <summary aria-label="Leyenda del mapa">
          <Info size={18} aria-hidden="true" />
        </summary>
        <div
          className="map-key"
          style={{ bottom: 27, maxWidth: 'calc(100% - 32px)', flexWrap: 'wrap' }}
        >
          {service && (
            <span>
              <i style={{ background: '#256f4d' }} />
              {service.route.code} · Trazo publicado
            </span>
          )}
          {visibleLines.map((line) => (
            <span key={line.id}>
              <i style={{ background: line.color }} />
              {line.name}
            </span>
          ))}
        </div>
      </details>
      <a
        className="map-caption"
        href={geography.copyrightUrl}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 10 }}
      >
        © OpenStreetMap contributors · ODbL
      </a>
    </div>
  );
}
