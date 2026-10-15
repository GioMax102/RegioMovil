import { useId, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import geography from '../data/monterrey-map.json';
import type { Coordinates, MobilityJourney, MobilityNetwork } from './types';

const mapUrl = new URL('../assets/monterrey-map.svg', import.meta.url).href;
const geographic = ([lng, lat]: Coordinates): Coordinates => [
  (lng - geography.origin[0]) * geography.unitsPerDegree * geography.longitudeFactor,
  (geography.origin[1] - lat) * geography.unitsPerDegree,
];

export default function MobilityMap({
  journey,
  network,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
}) {
  const id = useId().replace(/:/g, '');
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const paths = journey.steps.filter((step) => step.geometry?.length > 1);
  const projection = useMemo(() => {
    const points = journey.steps.flatMap((step) => step.geometry ?? []).map(geographic);
    if (!points.length) return { scale: 1, x: 0, y: 0 };
    const xs = points.map((point) => point[0]),
      ys = points.map((point) => point[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const scale = Math.min(550 / Math.max(maxX - minX, 1400), 300 / Math.max(maxY - minY, 1000));
    return { scale, x: 335 - ((minX + maxX) / 2) * scale, y: 205 - ((minY + maxY) / 2) * scale };
  }, [journey]);
  const point = (coordinate: Coordinates) => {
    const [x, y] = geographic(coordinate);
    return [x * projection.scale + projection.x, y * projection.scale + projection.y];
  };
  const first = paths[0]?.geometry[0],
    last = paths.at(-1)?.geometry.at(-1);
  const changeZoom = (amount: number) =>
    setView((current) => ({ ...current, zoom: Math.min(5, Math.max(1, current.zoom + amount)) }));
  return (
    <div className="mobility-map">
      <svg
        viewBox="0 0 670 410"
        role="img"
        aria-label={`Mapa experimental de ${journey.steps[0]?.from} a ${journey.steps.at(-1)?.to}. Las caminatas punteadas son conexiones aproximadas.`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, startX: view.x, startY: view.y };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const ratio = 670 / event.currentTarget.getBoundingClientRect().width;
          setView((current) => ({
            ...current,
            x: drag.current!.startX + (event.clientX - drag.current!.x) * ratio,
            y: drag.current!.startY + (event.clientY - drag.current!.y) * ratio,
          }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <pattern id={`grid-${id}`} width="35" height="35" patternUnits="userSpaceOnUse">
            <path d="M35 0H0V35" fill="none" stroke="#dfe5d8" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="670" height="410" fill="#f2f4ed" />
        <rect width="670" height="410" fill={`url(#grid-${id})`} />
        <g
          transform={`translate(${view.x} ${view.y}) translate(335 205) scale(${view.zoom}) translate(-335 -205)`}
        >
          <g
            transform={`translate(${projection.x} ${projection.y}) scale(${projection.scale})`}
            opacity="0.82"
          >
            <image
              href={mapUrl}
              x="0"
              y="0"
              width={
                (geography.bounds[2] - geography.bounds[0]) *
                geography.unitsPerDegree *
                geography.longitudeFactor
              }
              height={(geography.bounds[3] - geography.bounds[1]) * geography.unitsPerDegree}
            />
          </g>
          {paths.map((step, index) => {
            const color =
              step.mode === 'walk'
                ? '#8b7958'
                : network.routes.find((route) => route.id === step.lineId)?.color || '#27774b';
            const points = step.geometry.map((coordinate) => point(coordinate).join(',')).join(' ');
            return (
              <g key={index}>
                <polyline
                  points={points}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={step.mode === 'walk' ? 5 : 7}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={step.mode === 'walk' ? 2.5 : 4}
                  strokeDasharray={step.mode === 'walk' ? '5 5' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {[first, last].map((coordinate, index) => {
            if (!coordinate) return null;
            const [x, y] = point(coordinate);
            return (
              <g key={index} transform={`translate(${x} ${y})`}>
                <circle
                  r="13"
                  fill={index ? '#8d6338' : '#245d45'}
                  stroke="white"
                  strokeWidth="3"
                />
                <text textAnchor="middle" dy="4" fill="white" fontSize="11" fontWeight="700">
                  {index ? 'B' : 'A'}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="mobility-map-tools">
        <button
          aria-label="Acercar recorrido"
          onClick={() => changeZoom(0.5)}
          disabled={view.zoom >= 5}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Alejar recorrido"
          onClick={() => changeZoom(-0.5)}
          disabled={view.zoom <= 1}
        >
          <Minus size={18} />
        </button>
        <button aria-label="Restablecer recorrido" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
          <LocateFixed size={18} />
        </button>
      </div>
      <div className="mobility-map-attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap · ODbL
        </a>
      </div>
    </div>
  );
}
