import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus, RotateCcw } from 'lucide-react';
import geography from '../data/monterrey-map.json';
import { isRegionalCoordinate } from './mapGeography';
import {
  CITY_CENTER,
  constrainRegionalView,
  fitRegionalPositions,
  worldPoint,
  worldPosition,
  type MapPosition,
  type MapSize,
  type RegionalView,
} from './regionalViewport';
import type { MobilityJourney, MobilityNetwork, MobilityStop } from './types';
import './locationMap.css';

const localMapUrl = new URL('../assets/monterrey-map.svg', import.meta.url).href;
export default function LocationMap({
  network,
  online,
  origin,
  destination,
  field,
  focus,
  journey,
  onPick,
  onStopSelect,
}: {
  network: MobilityNetwork;
  online: boolean;
  origin?: MapPosition | null;
  destination?: MapPosition | null;
  field?: 'from' | 'to' | null;
  focus?: MapPosition | null;
  journey?: MobilityJourney | null;
  onPick: (point: MapPosition) => void;
  onStopSelect: (stop: MobilityStop) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<MapSize>({ width: 720, height: 420 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [measured, setMeasured] = useState(false);
  const [view, setView] = useState<RegionalView>(() =>
    constrainRegionalView(
      {
        ...(focus && isRegionalCoordinate([focus.lng, focus.lat]) ? focus : CITY_CENTER),
        zoom: 13,
      },
      { width: 720, height: 420 },
    ),
  );
  const viewRef = useRef(view);
  const [tileFailed, setTileFailed] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    view: RegionalView;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; view: RegionalView } | null>(null);
  const multiplePointers = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const mapId = useId().replace(/:/g, '');
  function move(next: RegionalView) {
    const safe = constrainRegionalView(next, sizeRef.current);
    viewRef.current = safe;
    setView(safe);
    return safe;
  }
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const next = { width: rect.width, height: rect.height };
      sizeRef.current = next;
      setSize(next);
      setMeasured(true);
      move(viewRef.current);
    };
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (focus && isRegionalCoordinate([focus.lng, focus.lat])) move({ ...focus, zoom: 14 });
  }, [focus?.lat, focus?.lng]);
  useEffect(() => {
    if (field) onPickRef.current(viewRef.current);
  }, [field]);
  useEffect(() => {
    if (!journey || field) return;
    const points = journey.steps
      .flatMap((step) => step.geometry || [])
      .filter(isRegionalCoordinate)
      .map(([lng, lat]) => ({ lng, lat }));
    move(fitRegionalPositions(points, sizeRef.current));
  }, [journey?.id, field]);
  useEffect(() => {
    if (online) setTileFailed(false);
  }, [online]);
  const camera = worldPoint(view),
    pixels = 256 * 2 ** view.zoom;
  function project(position: MapPosition) {
    const world = worldPoint(position);
    return {
      x: (world.x - camera.x) * pixels + size.width / 2,
      y: (world.y - camera.y) * pixels + size.height / 2,
    };
  }
  const indexedStops = useMemo(
    () =>
      network.stops
        .filter((stop) => stop.official && isRegionalCoordinate([stop.lng, stop.lat]))
        .map((stop) => ({ stop, point: worldPoint(stop) })),
    [network],
  );
  const nearbyStops = useMemo(() => {
    if (view.zoom < (online ? 15 : 13) || !field) return [];
    const center = worldPoint(view),
      scale = 256 * 2 ** view.zoom;
    const occupied = new Set<string>();
    return indexedStops
      .filter(({ point }) => {
        const x = (point.x - center.x) * scale,
          y = (point.y - center.y) * scale;
        if (Math.abs(x) >= size.width / 2 || Math.abs(y) >= size.height / 2) return false;
        const cell = `${Math.round(x / 44)}:${Math.round(y / 44)}`;
        if (occupied.has(cell)) return false;
        occupied.add(cell);
        return true;
      })
      .slice(0, 60)
      .map(({ stop }) => stop);
  }, [indexedStops, view, size, field, online]);
  const tileZoom = Math.floor(view.zoom),
    tileCount = 2 ** tileZoom;
  const tileSize = 256 * 2 ** (view.zoom - tileZoom);
  const leftTile = Math.floor(camera.x * tileCount - size.width / tileSize / 2);
  const topTile = Math.floor(camera.y * tileCount - size.height / tileSize / 2);
  const tiles = [];
  if (online && measured && !tileFailed) {
    for (let x = leftTile; x <= Math.floor(camera.x * tileCount + size.width / tileSize / 2); x++) {
      for (
        let y = topTile;
        y <= Math.floor(camera.y * tileCount + size.height / tileSize / 2);
        y++
      ) {
        if (x >= 0 && y >= 0 && x < tileCount && y < tileCount)
          tiles.push({
            x,
            y,
            left: (x / tileCount - camera.x) * pixels + size.width / 2,
            top: (y / tileCount - camera.y) * pixels + size.height / 2,
          });
      }
    }
  }
  function zoom(amount: number) {
    const next = move({ ...viewRef.current, zoom: viewRef.current.zoom + amount });
    if (field) onPickRef.current(next);
  }
  function release(event: React.PointerEvent<SVGSVGElement>, cancelled = false) {
    if (!pointers.current.has(event.pointerId)) return;
    const active = drag.current;
    const multiTouch = multiplePointers.current;
    const startView = pinch.current?.view || active?.view;
    // Finishing either finger finishes a pinch. The remaining pointer is ignored
    // until a new down event, so it cannot become an accidental tap or a commit
    // after cancellation/lost capture.
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
    multiplePointers.current = false;
    if (cancelled) {
      if (startView) move(startView);
    } else if (field) {
      if (multiTouch) onPickRef.current(viewRef.current);
      else if (active?.id === event.pointerId) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          !active.moved &&
          rect.width > 0 &&
          rect.height > 0 &&
          Number.isFinite(event.clientX) &&
          Number.isFinite(event.clientY)
        ) {
          const center = worldPoint(viewRef.current),
            scale = 256 * 2 ** viewRef.current.zoom;
          const point = worldPosition(
            center.x + (event.clientX - rect.left - rect.width / 2) / scale,
            center.y + (event.clientY - rect.top - rect.height / 2) / scale,
          );
          const next = move({ ...point, zoom: viewRef.current.zoom });
          onPickRef.current(next);
        } else if (active.moved) onPickRef.current(viewRef.current);
      }
    }
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* A system gesture may have already released pointer capture. */
    }
  }
  const baseNW = project({ lng: geography.bounds[0], lat: geography.bounds[3] });
  const baseSE = project({ lng: geography.bounds[2], lat: geography.bounds[1] });
  const paths =
    journey?.steps ||
    network.routes
      .filter((route) => route.mode === 'metro')
      .flatMap((route) =>
        route.segments.map((segment) => ({
          geometry: segment.coordinates,
          lineId: route.id,
          mode: route.mode,
        })),
      );
  return (
    <div className={`location-map ${field ? 'choosing' : ''}`}>
      <div ref={container} className="location-map-canvas">
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-roledescription="mapa interactivo"
          tabIndex={0}
          aria-label={`Mapa interactivo de la zona metropolitana de Monterrey${field ? ` para elegir ${field === 'from' ? 'el origen' : 'el destino'}` : ''}. Arrastra o usa las flechas para moverlo; más y menos para acercar.`}
          onKeyDown={(event) => {
            const offsets: Record<string, [number, number]> = {
              ArrowLeft: [-70, 0],
              ArrowRight: [70, 0],
              ArrowUp: [0, -70],
              ArrowDown: [0, 70],
            };
            if (offsets[event.key]) {
              event.preventDefault();
              const [x, y] = offsets[event.key],
                center = worldPoint(viewRef.current),
                scale = 256 * 2 ** viewRef.current.zoom;
              const next = move({
                ...worldPosition(center.x + x / scale, center.y + y / scale),
                zoom: viewRef.current.zoom,
              });
              if (field) onPickRef.current(next);
            } else if (['+', '=', '-'].includes(event.key)) {
              event.preventDefault();
              zoom(event.key === '-' ? -1 : 1);
            }
          }}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              !Number.isFinite(event.clientX) ||
              !Number.isFinite(event.clientY)
            )
              return;
            if (!pointers.current.size) multiplePointers.current = false;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              view: viewRef.current,
              moved: false,
            };
            if (pointers.current.size >= 2) {
              multiplePointers.current = true;
              if (drag.current) drag.current.moved = true;
              const [a, b] = [...pointers.current.values()];
              pinch.current = {
                distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
                view: viewRef.current,
              };
            }
            try {
              event.currentTarget.setPointerCapture?.(event.pointerId);
            } catch {
              /* A cancelled system gesture can already have released it. */
            }
          }}
          onPointerMove={(event) => {
            if (
              !pointers.current.has(event.pointerId) ||
              !Number.isFinite(event.clientX) ||
              !Number.isFinite(event.clientY)
            )
              return;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const active = drag.current;
            if (pinch.current && pointers.current.size === 2) {
              const start = pinch.current,
                [a, b] = [...pointers.current.values()];
              if (active) active.moved = true;
              move({
                ...start.view,
                zoom:
                  start.view.zoom +
                  Math.log2(Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) / start.distance),
              });
            } else if (active?.id === event.pointerId) {
              const dx = event.clientX - active.x,
                dy = event.clientY - active.y;
              if (Math.hypot(dx, dy) > 5) active.moved = true;
              const center = worldPoint(active.view),
                scale = 256 * 2 ** active.view.zoom;
              move({
                ...worldPosition(center.x - dx / scale, center.y - dy / scale),
                zoom: active.view.zoom,
              });
            }
          }}
          onPointerUp={(event) => release(event)}
          onPointerCancel={(event) => release(event, true)}
          onLostPointerCapture={(event) => release(event, true)}
        >
          <defs>
            <clipPath id={`location-clip-${mapId}`}>
              <rect width={size.width} height={size.height} />
            </clipPath>
          </defs>
          <g clipPath={`url(#location-clip-${mapId})`}>
            <rect width={size.width} height={size.height} fill="#edf3ee" />
            <image
              href={localMapUrl}
              x={baseNW.x}
              y={baseNW.y}
              width={baseSE.x - baseNW.x}
              height={baseSE.y - baseNW.y}
              preserveAspectRatio="none"
              opacity="0.8"
            />
            {tiles.slice(0, 40).map((tile) => (
              <image
                key={`${tileZoom}/${tile.x}/${tile.y}`}
                href={`https://tile.openstreetmap.org/${tileZoom}/${tile.x}/${tile.y}.png`}
                x={tile.left}
                y={tile.top}
                width={tileSize + 0.5}
                height={tileSize + 0.5}
                onError={() => setTileFailed(true)}
              />
            ))}
            {paths.map((step, index) => (
              <polyline
                key={`${step.lineId}-${index}`}
                data-line={step.lineId}
                data-mode={step.mode}
                points={(Array.isArray(step.geometry) ? step.geometry : [])
                  .filter(isRegionalCoordinate)
                  .map(([lng, lat]) => {
                    const p = project({ lng, lat });
                    return `${p.x},${p.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke={
                  step.mode === 'walk'
                    ? '#9b6b2e'
                    : network.routes.find((route) => route.id === step.lineId)?.color || '#128363'
                }
                strokeWidth={journey ? 4 : 2.5}
                opacity={journey ? 0.9 : 0.4}
                strokeDasharray={step.mode === 'walk' ? '5 5' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {nearbyStops.map((stop) => {
              const p = project(stop);
              return (
                <g
                  key={stop.id}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Elegir parada ${stop.name}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStopSelect(stop);
                  }}
                  onKeyDown={(event) => {
                    if (['Enter', ' '].includes(event.key)) {
                      event.preventDefault();
                      event.stopPropagation();
                      onStopSelect(stop);
                    }
                  }}
                >
                  <circle r="22" fill="transparent" />
                  <circle r="7" fill="white" stroke="#547b6c" strokeWidth="2" />
                  <circle r="2" fill="#237357" />
                  <title>{stop.name}</title>
                </g>
              );
            })}
            {[origin, destination].map((position, index) => {
              if (!position || !isRegionalCoordinate([position.lng, position.lat])) return null;
              const p = project(position);
              return (
                <g key={index} transform={`translate(${p.x} ${p.y})`}>
                  <circle
                    r="14"
                    fill={index ? '#a76b20' : '#126c50'}
                    stroke="white"
                    strokeWidth="3"
                  />
                  <text textAnchor="middle" dy="5" fill="white" fontSize="13" fontWeight="700">
                    {index ? 'B' : 'A'}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {field && (
          <div className={`location-map-pin ${field}`} aria-hidden="true">
            <span>{field === 'from' ? 'A' : 'B'}</span>
            <i />
          </div>
        )}
        <div className="location-map-area">ZONA METROPOLITANA DE MONTERREY</div>
        <div className="location-map-controls">
          <button
            type="button"
            aria-label="Acercar mapa"
            onClick={() => zoom(1)}
            disabled={view.zoom >= 17}
          >
            <Plus size={19} />
          </button>
          <button
            type="button"
            aria-label="Alejar mapa"
            onClick={() => zoom(-1)}
            disabled={view.zoom <= 10}
          >
            <Minus size={19} />
          </button>
          <button
            type="button"
            aria-label="Centrar mapa en el viaje"
            onClick={() => {
              const positions = [origin, destination].filter(
                (point): point is MapPosition => !!point,
              );
              const next = move(fitRegionalPositions(positions, size));
              if (field) onPickRef.current(next);
            }}
          >
            <LocateFixed size={19} />
          </button>
        </div>
        {tileFailed && online && (
          <button type="button" className="location-map-retry" onClick={() => setTileFailed(false)}>
            <RotateCcw size={14} />
            Reintentar calles
          </button>
        )}
        <a
          className="location-map-credit"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap · ODbL
        </a>
      </div>
      <p className="location-map-caption">
        {field
          ? 'Mueve el mapa o toca un punto y confirma abajo.'
          : 'Explora tu zona. Elige los puntos y compara cómo llegar.'}
        {!online || tileFailed ? ' Mapa local: las calles tienen cobertura parcial.' : ''}
      </p>
    </div>
  );
}
