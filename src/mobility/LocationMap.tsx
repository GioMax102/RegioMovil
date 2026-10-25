import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, LocateFixed, MapPin, Minus, Plus, RotateCcw, X } from 'lucide-react';
import geography from '../data/monterrey-map.json';
import { isRegionalCoordinate, simplifyOverviewGeometry } from './mapGeography';
import {
  CITY_CENTER,
  constrainRegionalView,
  fitRegionalPositions,
  minimumRegionalZoom,
  worldPoint,
  worldPosition,
  type MapPosition,
  type MapSize,
  type RegionalView,
} from './regionalViewport';
import type { MobilityJourney, MobilityNetwork, MobilityRoute, MobilityStop } from './types';
import { networkLabel } from './networks';
import { useDataSaver } from '../dataPreferences';
import StationStreetView from '../components/StationStreetView';
import './locationMap.css';

const localMapUrl = new URL('../assets/monterrey-map.svg', import.meta.url).href;
export default function LocationMap({
  network,
  online,
  origin,
  destination,
  currentPosition,
  preview,
  field,
  focus,
  journey,
  contextRoutes,
  navigationMode = false,
  inspectStops = true,
  compact = false,
  onExpand,
  onPick,
  onStopSelect,
}: {
  network: MobilityNetwork;
  online: boolean;
  origin?: MapPosition | null;
  destination?: MapPosition | null;
  currentPosition?: (MapPosition & { accuracy?: number }) | null;
  preview?: (MapPosition & { name: string }) | null;
  field?: 'from' | 'to' | null;
  focus?: MapPosition | null;
  journey?: MobilityJourney | null;
  contextRoutes?: MobilityRoute[];
  navigationMode?: boolean;
  inspectStops?: boolean;
  compact?: boolean;
  onExpand?: () => void;
  onPick?: (point: MapPosition) => void;
  onStopSelect?: (stop: MobilityStop) => void;
}) {
  const lowData = useDataSaver();
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
  const [inspectedId, setInspectedId] = useState('');
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
  const displayedRoutes = useMemo(
    () => contextRoutes ?? network.routes.filter((route) => route.mode === 'metro'),
    [contextRoutes, network],
  );
  const routeById = useMemo(
    () => new Map(network.routes.map((route) => [route.id, route])),
    [network],
  );
  const contextPaths = useMemo(
    () =>
      displayedRoutes
        .slice()
        .sort((a, b) => Number(a.mode === 'metro') - Number(b.mode === 'metro'))
        .flatMap((route) =>
          (Array.isArray(route.segments) ? route.segments : []).map((segment) => ({
            geometry:
              contextRoutes?.length === 1
                ? segment.coordinates
                : simplifyOverviewGeometry(segment.coordinates),
            lineId: route.id,
            mode: route.mode,
          })),
        ),
    [displayedRoutes, contextRoutes?.length],
  );
  const contextSignature = contextRoutes
    ?.map((route) => route.id)
    .sort()
    .join('|');
  useEffect(() => {
    setInspectedId('');
  }, [contextSignature, journey?.id, field]);
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
    if (field) onPickRef.current?.(viewRef.current);
  }, [field]);
  useEffect(() => {
    if (!journey || field) return;
    const points = journey.steps
      .flatMap((step) => step.geometry || [])
      .filter(isRegionalCoordinate)
      .map(([lng, lat]) => ({ lng, lat }));
    move(fitRegionalPositions(points, sizeRef.current));
  }, [journey?.id, field, size.width, size.height]);
  useEffect(() => {
    if (!contextRoutes || journey || field) return;
    move(
      fitRegionalPositions(
        contextPaths.flatMap((path) => path.geometry).map(([lng, lat]) => ({ lng, lat })),
        sizeRef.current,
      ),
    );
  }, [contextSignature, journey?.id, field, size.width, size.height]);
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
  const transitStops = useMemo(() => {
    const routeIds = new Set(
      journey
        ? journey.steps.filter((step) => step.mode !== 'walk').map((step) => step.lineId)
        : displayedRoutes.map((route) => route.id),
    );
    const journeyStops = journey ? new Set(journey.stationIds ?? []) : null;
    const terminals = new Set(
      displayedRoutes.flatMap((route) =>
        // Version-one saved trips can keep only their selected step geometry.
        (Array.isArray(route.segments) ? route.segments : []).flatMap((segment) => [
          segment.stopIds?.[0],
          segment.stopIds?.at(-1),
        ]),
      ),
    );
    return indexedStops
      .filter(({ stop }) =>
        journeyStops ? journeyStops.has(stop.id) : stop.routeIds.some((id) => routeIds.has(id)),
      )
      .map((item) => ({
        ...item,
        routes: item.stop.routeIds.filter((id) => routeIds.has(id)),
        connections: item.stop.routeIds.filter((id) => routeById.has(id)),
        terminal: terminals.has(item.stop.id),
      }))
      .sort(
        (a, b) =>
          Number(b.stop.mode === 'metro') - Number(a.stop.mode === 'metro') ||
          Number(b.connections.length > 1) - Number(a.connections.length > 1) ||
          Number(b.terminal) - Number(a.terminal),
      );
  }, [indexedStops, displayedRoutes, journey, routeById]);
  const visibleTransitStops = useMemo(() => {
    const center = worldPoint(view),
      scale = 256 * 2 ** view.zoom;
    const occupied = new Set<string>();
    const cellSize = view.zoom >= 14 ? 12 : 20;
    return transitStops
      .filter(({ stop, point }) => {
        const x = (point.x - center.x) * scale + size.width / 2;
        const y = (point.y - center.y) * scale + size.height / 2;
        if (x < 6 || x > size.width - 6 || y < 6 || y > size.height - 6) return false;
        const cell = `${Math.round(x / cellSize)}:${Math.round(y / cellSize)}`;
        // Keep Metro stations at city scale; gradually reveal nearby bus stops on zoom.
        if (stop.mode !== 'metro' && occupied.has(cell)) return false;
        occupied.add(cell);
        return true;
      })
      .slice(0, 240);
  }, [transitStops, view, size]);
  const inspected = transitStops.find((item) => item.stop.id === inspectedId);
  const stationLabels = useMemo(() => {
    const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
    return visibleTransitStops
      .slice()
      .sort((a, b) => Number(b.stop.id === inspectedId) - Number(a.stop.id === inspectedId))
      .filter(
        (item) =>
          item.terminal ||
          item.connections.length > 1 ||
          item.stop.id === inspectedId ||
          view.zoom >= 14,
      )
      .flatMap((item) => {
        const p = project(item.stop);
        const label =
          item.stop.name.length > 30 ? `${item.stop.name.slice(0, 29)}…` : item.stop.name;
        const width = Math.min(size.width - 24, label.length * 5.4);
        const x = Math.max(width / 2 + 8, Math.min(size.width - width / 2 - 8, p.x));
        const y = p.y < 50 ? p.y + 19 : p.y - 11;
        const box = {
          left: x - width / 2 - 4,
          right: x + width / 2 + 4,
          top: y - 11,
          bottom: y + 4,
        };
        if (
          box.left < 6 ||
          box.right > size.width - 6 ||
          box.bottom > size.height - 22 ||
          (box.right > size.width - 70 && box.top < 165) ||
          (box.left < 145 && box.top < 42) ||
          occupied.some(
            (other) =>
              box.left < other.right &&
              box.right > other.left &&
              box.top < other.bottom &&
              box.bottom > other.top,
          )
        )
          return [];
        occupied.push(box);
        return [{ ...item, label, x, y }];
      })
      .slice(0, size.width < 500 ? 5 : 9);
  }, [visibleTransitStops, view, size, inspectedId]);
  function inspectNearest(x: number, y: number) {
    if (!inspectStops) return;
    const nearest = visibleTransitStops
      .map((item) => {
        const p = project(item.stop);
        return { id: item.stop.id, distance: Math.hypot(p.x - x, p.y - y) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= 24) setInspectedId(nearest.id);
  }
  const legend = useMemo(() => {
    const routes = journey
      ? network.routes.filter((route) => journey.steps.some((step) => step.lineId === route.id))
      : displayedRoutes;
    const seen = new Set<string>();
    return routes.flatMap((route) => {
      const key = route.mode === 'metro' || routes.length <= 6 ? route.id : route.networkId;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          id: key,
          color: route.color,
          label:
            route.mode === 'metro'
              ? route.name
              : routes.length <= 6
                ? `${networkLabel(route.networkId)} ${route.code}`
                : networkLabel(route.networkId),
        },
      ];
    });
  }, [displayedRoutes, network, journey]);
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
  const onlineStreets = online && !contextRoutes && !lowData;
  if (onlineStreets && measured && !tileFailed) {
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
    if (field) onPickRef.current?.(next);
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
      if (multiTouch) onPickRef.current?.(viewRef.current);
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
          onPickRef.current?.(next);
        } else if (active.moved) onPickRef.current?.(viewRef.current);
      }
    } else if (!multiTouch && active?.id === event.pointerId && !active.moved) {
      if (onExpand) onExpand();
      else {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          Number.isFinite(event.clientX) &&
          Number.isFinite(event.clientY)
        )
          inspectNearest(
            ((event.clientX - rect.left) * size.width) / rect.width,
            ((event.clientY - rect.top) * size.height) / rect.height,
          );
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
  const paths = useMemo(
    () =>
      (journey?.steps || contextPaths).flatMap((step) => {
        // Missing or invalid geometry is a gap, never a straight connection across it.
        const segments: Array<typeof step & { geometry: [number, number][] }> = [];
        let geometry: [number, number][] = [];
        for (const coordinate of Array.isArray(step.geometry) ? step.geometry : []) {
          if (isRegionalCoordinate(coordinate)) geometry.push(coordinate);
          else {
            if (geometry.length > 1) segments.push({ ...step, geometry });
            geometry = [];
          }
        }
        if (geometry.length > 1) segments.push({ ...step, geometry });
        return segments;
      }),
    [journey?.steps, contextPaths],
  );
  const stationCard = inspected && (
    <section
      className="location-station-card"
      aria-label="Estación seleccionada"
      aria-live="polite"
    >
      <MapPin size={19} aria-hidden="true" />
      <div>
        <strong>{inspected.stop.name}</strong>
        <p>
          {inspected.connections
            .map((id) => routeById.get(id))
            .filter((route): route is MobilityRoute => !!route)
            .map((route) =>
              route.mode === 'metro'
                ? route.name
                : `${networkLabel(route.networkId)} · ${route.name}`,
            )
            .slice(0, 3)
            .join(' · ')}
          {inspected.connections.length > 3
            ? ` · +${inspected.connections.length - 3} recorridos`
            : ''}
        </p>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={`Centrar estación ${inspected.stop.name}`}
        onClick={() => move({ ...inspected.stop, zoom: Math.max(view.zoom, 14) })}
      >
        <LocateFixed size={18} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Cerrar información de estación"
        onClick={() => setInspectedId('')}
      >
        <X size={18} />
      </button>
    </section>
  );
  const mapLegend = (
    <div className="location-map-legend" role="group" aria-label="Leyenda del mapa">
      {legend.map((item) => (
        <span key={item.id}>
          <i style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
      <span>
        <i className="location-map-legend-stop" />
        Estación o parada
      </span>
    </div>
  );
  const stopSelection = !field && !!visibleTransitStops.length && (
    <>
      <label htmlFor={`map-stop-${mapId}`}>Estaciones y paradas visibles</label>
      <select
        id={`map-stop-${mapId}`}
        value={inspectedId}
        onChange={(event) => {
          setInspectedId(event.target.value);
          if (navigationMode && event.target.value) {
            const references = event.currentTarget.closest('details');
            if (references) {
              references.open = false;
              references.querySelector('summary')?.focus();
            }
          }
        }}
      >
        <option value="">Elige una estación o tócala en el mapa</option>
        {inspected && !visibleTransitStops.some((item) => item.stop.id === inspectedId) && (
          <option value={inspectedId}>{inspected.stop.name}</option>
        )}
        {visibleTransitStops.map(({ stop }) => (
          <option key={stop.id} value={stop.id}>
            {stop.name}
          </option>
        ))}
      </select>
    </>
  );
  const mapCaption = (
    <p className="location-map-caption">
      {field
        ? 'Mueve el mapa o toca un punto y confirma abajo.'
        : contextRoutes
          ? 'Explora los trazos publicados de los servicios seleccionados.'
          : journey
            ? 'Trazo del trayecto y paradas de referencia.'
            : 'Explora tu zona. Elige los puntos y compara cómo llegar.'}
      {!onlineStreets || tileFailed ? ' Mapa local simplificado con vialidades principales.' : ''}
      {lowData && online ? ' Ahorro de datos activo.' : ''}
    </p>
  );
  return (
    <div
      className={`location-map ${field ? 'choosing' : ''}${navigationMode ? ' navigating' : ''}${compact ? ' map-compact' : ''}`}
    >
      <div ref={container} className="location-map-canvas">
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-roledescription="mapa interactivo"
          tabIndex={0}
          aria-label={`Mapa interactivo de la zona metropolitana de Monterrey${field ? ` para elegir ${field === 'from' ? 'el origen' : 'el destino'}` : ''}. Arrastra o usa las flechas para moverlo; más y menos para acercar.${!field && inspectStops ? ' Toca una estación para consultar su nombre y conexiones.' : ''}`}
          onKeyDown={(event) => {
            if (onExpand && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onExpand();
              return;
            }
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
              if (field) onPickRef.current?.(next);
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
            <rect
              className="location-map-surface"
              width={size.width}
              height={size.height}
              fill="#edf3ee"
            />
            <g className="location-map-basemap" aria-hidden="true">
              <image
                href={localMapUrl}
                x={baseNW.x}
                y={baseNW.y}
                width={baseSE.x - baseNW.x}
                height={baseSE.y - baseNW.y}
                preserveAspectRatio="none"
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
            </g>
            {(!onlineStreets || tileFailed) && (
              <g aria-hidden="true" fill="#567063" fontSize="11" fontWeight="500">
                {geography.labels.map((label) => {
                  const p = project(label);
                  if (p.x < 10 || p.x > size.width - 10 || p.y < 15 || p.y > size.height - 15)
                    return null;
                  return (
                    <text
                      className="location-place-label"
                      key={label.name}
                      x={p.x}
                      y={p.y}
                      textAnchor="middle"
                      paintOrder="stroke"
                      stroke="#edf3ee"
                      strokeWidth="3"
                    >
                      {label.name}
                    </text>
                  );
                })}
              </g>
            )}
            {paths.map((step, index) => {
              const points = (Array.isArray(step.geometry) ? step.geometry : [])
                .filter(isRegionalCoordinate)
                .map(([lng, lat]) => {
                  const p = project({ lng, lat });
                  return `${p.x},${p.y}`;
                })
                .join(' ');
              const width = step.mode === 'metro' ? 4.5 : step.mode === 'walk' ? 2.5 : 3.5;
              return (
                <g key={`${step.lineId}-${index}`}>
                  <polyline
                    className="location-route-casing"
                    points={points}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={width + 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {step.mode !== 'walk' && (
                    <polyline
                      className="location-route-outline"
                      points={points}
                      fill="none"
                      stroke="#40594c"
                      strokeWidth={width + 1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <polyline
                    data-line={step.lineId}
                    data-mode={step.mode}
                    points={points}
                    fill="none"
                    stroke={
                      step.mode === 'walk'
                        ? '#9b6b2e'
                        : routeById.get(step.lineId)?.color || '#128363'
                    }
                    strokeWidth={width}
                    opacity="1"
                    strokeDasharray={step.mode === 'walk' ? '5 5' : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
            <g aria-hidden="true">
              {visibleTransitStops.map(({ stop, connections }) => {
                const p = project(stop);
                const interchange = connections.length > 1;
                return (
                  <circle
                    className="location-transit-stop"
                    key={stop.id}
                    data-stop={stop.id}
                    data-transport={stop.mode}
                    cx={p.x}
                    cy={p.y}
                    r={
                      stop.id === inspectedId
                        ? 6
                        : interchange
                          ? 4.6
                          : stop.mode === 'metro'
                            ? 3.2
                            : 2.6
                    }
                    fill="#ffffff"
                    stroke="#40594c"
                    strokeWidth={interchange ? 2 : 1.3}
                  >
                    <title>
                      {stop.name}
                      {interchange ? ' · Conexión entre líneas' : ''}
                    </title>
                  </circle>
                );
              })}
            </g>
            <g aria-hidden="true" className="location-station-labels">
              {stationLabels.map((item) => (
                <text key={item.stop.id} x={item.x} y={item.y} textAnchor="middle">
                  {item.label}
                </text>
              ))}
            </g>
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
                    onStopSelect?.(stop);
                  }}
                  onKeyDown={(event) => {
                    if (['Enter', ' '].includes(event.key)) {
                      event.preventDefault();
                      event.stopPropagation();
                      onStopSelect?.(stop);
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
            {preview &&
              isRegionalCoordinate([preview.lng, preview.lat]) &&
              (() => {
                const point = project(preview);
                return (
                  <g
                    className="location-search-preview"
                    transform={`translate(${point.x} ${point.y})`}
                    role="img"
                    aria-label={`Vista previa de ${preview.name}. Punto sin confirmar.`}
                    pointerEvents="none"
                  >
                    <circle
                      r="17"
                      fill="var(--white)"
                      stroke="var(--green)"
                      strokeWidth="3"
                      strokeDasharray="4 2"
                    />
                    <text
                      textAnchor="middle"
                      dy="5"
                      fill="var(--green)"
                      fontSize="17"
                      fontWeight="700"
                    >
                      ?
                    </text>
                  </g>
                );
              })()}
          </g>
          {currentPosition &&
            isRegionalCoordinate([currentPosition.lng, currentPosition.lat]) &&
            (() => {
              const p = project(currentPosition);
              const metersPerPixel =
                (156543.03392 * Math.cos((currentPosition.lat * Math.PI) / 180)) / 2 ** view.zoom;
              const accuracy = Number.isFinite(currentPosition.accuracy)
                ? Math.max(0, currentPosition.accuracy!)
                : 0;
              return (
                <g
                  transform={`translate(${p.x} ${p.y})`}
                  role="img"
                  aria-label={`Tu ubicación${accuracy ? `, precisión aproximada de ${Math.round(accuracy)} metros` : ''}`}
                  pointerEvents="none"
                >
                  <circle
                    r={Math.max(13, Math.min(100, accuracy / metersPerPixel))}
                    fill="#1871d8"
                    fillOpacity="0.13"
                    stroke="#1871d8"
                    strokeOpacity="0.25"
                  />
                  <circle r="9" fill="#1871d8" stroke="#fff" strokeWidth="3" />
                  <title>Tu ubicación · {Math.round(accuracy)} m de precisión</title>
                </g>
              );
            })()}
        </svg>
        {field && (
          <div className={`location-map-pin ${field}`} aria-hidden="true">
            <span>{field === 'from' ? 'A' : 'B'}</span>
            <i />
          </div>
        )}
        {!navigationMode && !compact && <div className="location-map-area">MONTERREY · ZMM</div>}
        {compact && (
          <details className="location-map-info">
            <summary aria-label="Información del mapa">
              <Info size={19} aria-hidden="true" />
            </summary>
            <div>
              {mapLegend}
              {inspectStops && stopSelection}
              {mapCaption}
            </div>
          </details>
        )}
        {navigationMode && (
          <details className="location-stop-picker location-navigation-info">
            <summary>
              <MapPin size={15} aria-hidden="true" />
              Paradas y leyenda
            </summary>
            <div className="location-navigation-info-body">
              {stopSelection}
              {mapLegend}
              {mapCaption}
            </div>
          </details>
        )}
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
            disabled={view.zoom <= minimumRegionalZoom(size) + 1e-8}
          >
            <Minus size={19} />
          </button>
          <button
            type="button"
            aria-label={
              contextRoutes
                ? 'Centrar mapa en las rutas'
                : navigationMode
                  ? 'Ver etapa completa'
                  : 'Centrar mapa en el viaje'
            }
            onClick={() => {
              const positions = journey
                ? journey.steps
                    .flatMap((step) => step.geometry)
                    .filter(isRegionalCoordinate)
                    .map(([lng, lat]) => ({ lng, lat }))
                : contextRoutes
                  ? contextPaths
                      .flatMap((path) => path.geometry)
                      .map(([lng, lat]) => ({ lng, lat }))
                  : [origin, destination].filter((point): point is MapPosition => !!point);
              const next = move(fitRegionalPositions(positions, size));
              if (field) onPickRef.current?.(next);
            }}
          >
            <LocateFixed size={19} />
          </button>
        </div>
        {tileFailed && onlineStreets && (
          <button type="button" className="location-map-retry" onClick={() => setTileFailed(false)}>
            <RotateCcw size={14} />
            Reintentar calles
          </button>
        )}
        {(navigationMode || compact) && !onExpand && stationCard}
        <a
          className="location-map-credit"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap · ODbL
        </a>
      </div>
      {!navigationMode && !compact && stationCard}
      {!navigationMode && !compact && inspectStops && inspected && (
        <details className="station-context-disclosure">
          <summary>Reconocer esta parada</summary>
          <StationStreetView
            key={inspected.stop.id}
            station={{ ...inspected.stop, id: inspected.stop.stationId ?? inspected.stop.id }}
            kind={inspected.stop.mode}
          />
        </details>
      )}
      {!navigationMode && !compact && mapLegend}
      {!navigationMode && !compact && inspectStops && stopSelection && (
        <details className="location-stop-picker">
          <summary>
            <MapPin size={14} />
            Consultar una estación
          </summary>
          {stopSelection}
        </details>
      )}
      {!navigationMode && !compact && mapCaption}
    </div>
  );
}
