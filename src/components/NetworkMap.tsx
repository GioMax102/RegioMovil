import { useState } from 'react';
import { Minus, Plus, LocateFixed } from 'lucide-react';
import type { Network, Station } from '../types';

export default function NetworkMap({
  network,
  selected,
  onSelect,
  highlighted = [],
}: {
  network: Network;
  selected: string;
  onSelect: (id: string) => void;
  highlighted?: string[];
}) {
  const [zoom, setZoom] = useState(1);
  // Coordinates from the state open-data catalog. Locally rendered: no tile requests.
  const project = (station: Station) => ({
    x: 60 + (station.lng + 100.375) * 4400,
    y: 365 - (station.lat - 25.655) * 2200,
  });
  const chosen = network.stations.find((s) => s.id === selected);
  const labelIds = [
    'sendero',
    'universidad',
    'talleres',
    'cuauhtemoc',
    'padre-mier',
    'zaragoza',
    'fundidora',
    'exposicion',
    'hospital-metropolitano',
    'felix-u-gomez',
  ];
  return (
    <div className="network-map">
      <svg
        viewBox="0 0 670 410"
        role="img"
        aria-label={`Esquema de Metrorrey con coordenadas oficiales y fondo ilustrativo. Estación seleccionada: ${chosen?.name ?? ''}. Usa el selector de estaciones para navegar.`}
      >
        <defs>
          <pattern
            id="streets"
            width="39"
            height="39"
            patternTransform="rotate(-17)"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 39 0 L 0 0 0 39" fill="none" stroke="#fff" strokeWidth="8" />
            <path d="M 39 0 L 0 0 0 39" fill="none" stroke="#e6e8de" strokeWidth="1" />
          </pattern>
          <filter id="map-shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".12" />
          </filter>
        </defs>
        <rect width="670" height="410" fill="#eeefe7" />
        <rect width="670" height="410" fill="url(#streets)" />
        <g className="map-geography" aria-hidden="true">
          <path
            d="M-20 390 Q150 300 300 370T700 330"
            stroke="#e1e6d7"
            strokeWidth="40"
            fill="none"
          />
          <path
            d="M-30 425 Q140 335 290 405T710 365"
            stroke="#d8e2cd"
            strokeWidth="16"
            fill="none"
          />
        </g>
        <g transform={`translate(${335 - 335 * zoom} ${205 - 205 * zoom}) scale(${zoom})`}>
          {network.lines.map((line) => {
            const stations = line.stationIds
              .map((id) => network.stations.find((s) => s.id === id))
              .filter((s): s is Station => !!s);
            return (
              <polyline
                key={line.id}
                points={stations
                  .map((s) => {
                    const p = project(s);
                    return `${p.x},${p.y}`;
                  })
                  .join(' ')}
                stroke={line.color}
                strokeWidth={highlighted.length && !highlighted.includes(line.id) ? 3 : 6}
                opacity={highlighted.length && !highlighted.includes(line.id) ? 0.35 : 1}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {network.stations.map((station) => {
            const p = project(station);
            const active = selected === station.id;
            return (
              <g
                key={station.id}
                onClick={() => onSelect(station.id)}
                className="map-stop"
                aria-hidden="true"
              >
                {active && <circle cx={p.x} cy={p.y} r="17" fill="#1d7053" opacity=".15" />}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 7 : station.lineIds.length > 1 ? 5 : 3.5}
                  fill={active ? '#174d3d' : '#fff'}
                  stroke={active ? '#fff' : '#6f7d6d'}
                  strokeWidth={active ? 3 : 1.5}
                />
                {labelIds.includes(station.id) && !active && (
                  <text
                    className="station-label"
                    x={p.x + 9}
                    y={p.y + (station.id === 'cuauhtemoc' ? -10 : 4)}
                  >
                    {station.name
                      .replace('General I. ', '')
                      .replace('Hospital Metropolitano', 'H. Metropolitano')}
                  </text>
                )}
                {active && (
                  <g filter="url(#map-shadow)">
                    <rect
                      x={Math.max(8, p.x - 62)}
                      y={p.y - 43}
                      rx="7"
                      width="124"
                      height="28"
                      fill="#173e34"
                    />
                    <text
                      className="selected-label"
                      x={Math.max(8, p.x - 62) + 62}
                      y={p.y - 25}
                      textAnchor="middle"
                    >
                      {station.name.replace('General I. ', '')}
                    </text>
                    <path d={`M${p.x - 5} ${p.y - 15}l5 6 5-6`} fill="#173e34" />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-compass" aria-hidden="true">
        N<span>↑</span>
      </div>
      <div className="map-controls">
        <button
          aria-label="Acercar mapa"
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))}
          disabled={zoom >= 1.6}
        >
          <Plus size={17} />
        </button>
        <button
          aria-label="Alejar mapa"
          onClick={() => setZoom((z) => Math.max(0.8, z - 0.2))}
          disabled={zoom <= 0.8}
        >
          <Minus size={17} />
        </button>
        <button aria-label="Restablecer mapa" onClick={() => setZoom(1)}>
          <LocateFixed size={17} />
        </button>
      </div>
      <div className="map-key">
        {network.lines.map((line) => (
          <span key={line.id}>
            <i style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
      <span className="map-caption">Coordenadas oficiales · Fondo ilustrativo</span>
    </div>
  );
}
