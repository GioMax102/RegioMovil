import { useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import geography from '../data/monterrey-map.json';
import type { Coordinates, MobilityJourney, MobilityNetwork } from './types';
import {
  constrainMapView,
  fitMapProjection,
  isRegionalCoordinate,
  MAP_VIEWPORT,
  projectMapCoordinate,
} from './mapGeography';

const mapUrl = new URL('../assets/monterrey-map.svg', import.meta.url).href;

export default function MobilityMap({
  journey,
  network,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
}) {
  const [rawView, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const paths = useMemo(
    () =>
      journey.steps.flatMap((step) => {
        const segments: Coordinates[][] = [];
        let segment: Coordinates[] = [];
        // Invalid or out-of-region geometry breaks a segment instead of introducing
        // non-finite SVG transforms or drawing a connection across missing data.
        for (const coordinate of Array.isArray(step.geometry) ? step.geometry : []) {
          if (isRegionalCoordinate(coordinate)) segment.push(coordinate);
          else {
            if (segment.length > 1) segments.push(segment);
            segment = [];
          }
        }
        if (segment.length > 1) segments.push(segment);
        return segments.map((geometry) => ({ ...step, geometry }));
      }),
    [journey],
  );
  const partialBase = paths.some((step) =>
    step.geometry.some(
      ([lng, lat]) =>
        lng < geography.bounds[0] ||
        lat < geography.bounds[1] ||
        lng > geography.bounds[2] ||
        lat > geography.bounds[3],
    ),
  );
  const projection = useMemo(
    () => fitMapProjection(paths.flatMap((step) => step.geometry)),
    [paths],
  );
  const view = constrainMapView(rawView, projection);
  const point = (coordinate: Coordinates) => projectMapCoordinate(coordinate, projection);
  const first = paths[0]?.geometry[0],
    last = paths.at(-1)?.geometry.at(-1);
  const changeZoom = (amount: number) =>
    setView((current) => constrainMapView({ ...current, zoom: current.zoom + amount }, projection));
  return (
    <div className="mobility-map">
      <svg
        viewBox={`0 0 ${MAP_VIEWPORT.width} ${MAP_VIEWPORT.height}`}
        role="img"
        tabIndex={0}
        aria-label={`Mapa experimental de ${journey.steps[0]?.from || 'origen'} a ${journey.steps.at(-1)?.to || 'destino'}. A es el origen y B el destino. Las caminatas punteadas son conexiones aproximadas. La exploración está limitada a la zona metropolitana de Monterrey. Usa las flechas para explorar y las teclas más y menos para acercar o alejar.${partialBase ? ' El mapa base cubre solo parte del recorrido; el área vacía no muestra calles.' : ''}`}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [70, 0],
            ArrowRight: [-70, 0],
            ArrowUp: [0, 70],
            ArrowDown: [0, -70],
          };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            setView((current) => {
              const safe = constrainMapView(current, projection);
              return constrainMapView(
                { ...safe, x: safe.x + direction[0], y: safe.y + direction[1] },
                projection,
              );
            });
          } else if (['+', '=', '-'].includes(event.key)) {
            event.preventDefault();
            changeZoom(event.key === '-' ? -0.5 : 0.5);
          }
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            event.isPrimary === false ||
            !Number.isFinite(event.clientX) ||
            !Number.isFinite(event.clientY)
          )
            return;
          // Some embedded/older browsers may reject capture after cancellation.
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            /* The drag still works while inside the map. */
          }
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            startX: view.x,
            startY: view.y,
          };
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          const width = event.currentTarget.getBoundingClientRect().width;
          if (
            !Number.isFinite(width) ||
            width <= 0 ||
            !Number.isFinite(event.clientX) ||
            !Number.isFinite(event.clientY)
          )
            return;
          const ratio = MAP_VIEWPORT.width / width;
          // Capture gesture values before React processes the updater. Pointer
          // release/cancel may clear the ref before this updater is evaluated.
          const x = active.startX + (event.clientX - active.x) * ratio;
          const y = active.startY + (event.clientY - active.y) * ratio;
          setView((current) => constrainMapView({ ...current, x, y }, projection));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
      >
        <rect width="670" height="410" fill="#edf5f1" />
        <g
          data-map-viewport=""
          transform={`translate(${view.x} ${view.y}) translate(335 205) scale(${view.zoom}) translate(-335 -205)`}
        >
          <g
            transform={`translate(${projection.x} ${projection.y}) scale(${projection.scale})`}
            opacity="0.82"
          >
            <rect x="0" y="0" width={geography.width} height={geography.height} fill="#f7faf5" />
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
                ? '#995d1d'
                : network.routes.find((route) => route.id === step.lineId)?.color || '#27774b';
            const points = step.geometry.map((coordinate) => point(coordinate).join(',')).join(' ');
            return (
              <g key={index} data-mode={step.mode} data-line={step.lineId}>
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
        {partialBase && (
          <g aria-hidden="true">
            <rect x="12" y="374" width="135" height="24" rx="6" fill="#fff" fillOpacity="0.94" />
            <text x="21" y="390" fill="#285843" fontSize="11" fontWeight="600">
              Mapa base parcial
            </text>
          </g>
        )}
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
