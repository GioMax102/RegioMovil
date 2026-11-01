import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { adminRequest } from './api';
import type { AdminSession, ReportMapData, ReportMapGroup, ReportMapState } from './types';
import { accessError, categories, messageOf, Notice, number, targets } from './ui';
import geography from '../data/monterrey-map.json';

const DAY = 86400000;
const basemap = new URL('../assets/monterrey-map.svg', import.meta.url).href;
type View = [number, number, number, number];
type Coordinate = [number, number];
type Filters = {
  state: ReportMapState;
  category: string;
  targetType: string;
  days: string;
  stationId: string;
  routeId: string;
  unitReference: string;
};
const initialFilters: Filters = {
  state: 'open',
  category: 'all',
  targetType: 'all',
  days: '30',
  stationId: '',
  routeId: '',
  unitReference: '',
};
const project = ([lng, lat]: Coordinate): Coordinate => [
  (lng - geography.origin[0]) * geography.longitudeFactor * geography.unitsPerDegree,
  (geography.origin[1] - lat) * geography.unitsPerDegree,
];
const validPoint = (point: unknown): point is Coordinate =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every(Number.isFinite) &&
  point[0] >= -102 &&
  point[0] <= -99 &&
  point[1] >= 24 &&
  point[1] <= 28;
const fullView: View = [0, 0, geography.width, geography.height];
function fit(points: Coordinate[]): View {
  if (!points.length) return fullView;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(10000, (maxX - minX) * 1.35, (maxY - minY) * 1.8);
  return [(minX + maxX - width) / 2, (minY + maxY - width * 0.75) / 2, width, width * 0.75];
}
function constrained(view: View): View {
  const width = Math.max(2000, Math.min(geography.width * 1.5, view[2])),
    height = width * 0.75;
  return [
    Math.max(-width / 2, Math.min(geography.width - width / 2, view[0])),
    Math.max(-height / 2, Math.min(geography.height - height / 2, view[1])),
    width,
    height,
  ];
}
function locationName(group: ReportMapGroup) {
  return (
    group.stationName ||
    group.routeName ||
    group.stationId ||
    group.routeId ||
    'Sin referencia de catálogo'
  );
}
function dateLabel(date: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Monterrey',
  }).format(new Date(date));
}
async function routePreview(pack: string, signal: AbortSignal): Promise<Coordinate[][]> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,100}$/.test(pack))
    throw new Error('El identificador del trazo no es válido.');
  const response = await fetch(`/route-packs/${pack}.json`, {
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('No pudimos cargar el trazo de referencia.');
  const text = await response.text();
  if (text.length > 5000000) throw new Error('El trazo supera el tamaño permitido.');
  const data = JSON.parse(text);
  const segments = data.segments?.length ? data.segments : [data.coordinates];
  let count = 0;
  if (
    data.id !== pack ||
    !Array.isArray(segments) ||
    segments.length > 2000 ||
    !segments.every(
      (segment: unknown) =>
        Array.isArray(segment) &&
        segment.length >= 2 &&
        segment.every(validPoint) &&
        (count += segment.length) <= 100000,
    )
  )
    throw new Error('El trazo no pasó la validación de coordenadas.');
  return segments as Coordinate[][];
}

export default function ReportMap({
  session,
  epoch,
  onError,
}: {
  session: AdminSession;
  epoch: number;
  onError: (error: unknown) => void;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [query, setQuery] = useState('state=open');
  const [data, setData] = useState<ReportMapData | null>(null);
  const [dataset, setDataset] = useState<ReportMapData['dataset']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<View>(fullView);
  const [segments, setSegments] = useState<Coordinate[][]>([]);
  const [previewState, setPreviewState] = useState('');
  const [mapWidth, setMapWidth] = useState(640);
  const canvas = useRef<SVGSVGElement>(null);
  const listSelection = useRef<HTMLLIElement>(null);
  const drag = useRef<{ x: number; y: number; view: View; pointerId: number } | null>(null);
  const canInspect = session.user.role !== 'analyst';
  const routePaths = useMemo(
    () => segments.map((segment) => segment.map((point) => project(point).join(',')).join(' ')),
    [segments],
  );
  const selected = data?.groups.find((group) => group.key === selectedKey) ?? null;
  const positioned = useMemo(
    () =>
      data?.groups.filter(
        (group) =>
          group.targetType === 'station' &&
          group.position?.source === 'station-catalog' &&
          validPoint([group.position.lng, group.position.lat]),
      ) ?? [],
    [data],
  );
  const stations = useMemo(
    () => [
      ...new Map(
        data?.groups
          .filter((group) => group.stationId)
          .map((group) => [group.stationId!, group.stationName || group.stationId!]),
      ).entries(),
    ],
    [data],
  );
  const routes = useMemo(
    () => [
      ...new Map(
        data?.groups
          .filter((group) => group.routeId)
          .map((group) => [group.routeId!, group.routeName || group.routeId!]),
      ).entries(),
    ],
    [data],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    setSelectedKey(null);
    setSegments([]);
    adminRequest<ReportMapData>(`/api/admin/report-map?${query}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          !Array.isArray(result.groups) ||
          !result.totals ||
          !Number.isSafeInteger(result.totals.total) ||
          result.scope !== 'all-filtered-reports'
        )
          throw new Error('El mapa no recibió un resumen válido.');
        setData(result);
        setDataset(result.dataset);
        setView(
          constrained(
            fit(
              result.groups
                .filter(
                  (group) =>
                    group.targetType === 'station' &&
                    group.position &&
                    validPoint([group.position.lng, group.position.lat]),
                )
                .map((group) => project([group.position!.lng, group.position!.lat])),
            ),
          ),
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(messageOf(reason));
          if (accessError(reason)) onError(reason);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [epoch, query, session.user.id, session.user.role, onError]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => setMapWidth(element.getBoundingClientRect().width || 640);
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading]);
  useEffect(() => {
    const controller = new AbortController();
    setSegments([]);
    setPreviewState('');
    if (!selected || selected.targetType === 'station' || !selected.geometryPack)
      return () => controller.abort();
    const timeout = setTimeout(() => {
      controller.abort();
      setPreviewState('El trazo tardó demasiado. Selecciona otro grupo y vuelve a intentar.');
    }, 15000);
    setPreviewState('Cargando trazo de referencia…');
    routePreview(selected.geometryPack, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSegments(result);
        setView(constrained(fit(result.flat().map(project))));
        setPreviewState('Trazo de referencia; no localiza el daño ni la unidad.');
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setPreviewState(messageOf(reason));
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [selected]);
  function apply(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({
      state: filters.state,
      category: filters.category,
      targetType: filters.targetType,
    });
    if (filters.stationId) params.set('stationId', filters.stationId);
    if (filters.routeId) params.set('routeId', filters.routeId);
    if (canInspect && filters.unitReference.trim())
      params.set('unitReference', filters.unitReference.trim());
    const to = new Date(),
      duration = Number(filters.days) * DAY;
    // Leave one minute inside the server's 90-day retention boundary for clock/transport latency.
    params.set(
      'from',
      new Date(to.getTime() - duration + (filters.days === '90' ? 60000 : 0)).toISOString(),
    );
    params.set('to', to.toISOString());
    setQuery(params.toString());
  }
  function select(group: ReportMapGroup, fromMap = false) {
    setSelectedKey(group.key);
    if (group.position && group.targetType === 'station')
      setView(constrained(fit([project([group.position.lng, group.position.lat])])));
    if (fromMap)
      window.requestAnimationFrame(() =>
        listSelection.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' }),
      );
  }
  function zoom(factor: number) {
    setView((current) => {
      const width = current[2] * factor,
        height = current[3] * factor;
      return constrained([
        current[0] + (current[2] - width) / 2,
        current[1] + (current[3] - height) / 2,
        width,
        height,
      ]);
    });
  }
  function move(x: number, y: number) {
    setView((current) =>
      constrained([
        current[0] + x * current[2],
        current[1] + y * current[3],
        current[2],
        current[3],
      ]),
    );
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest('[role="button"]')) return;
    drag.current = { x: event.clientX, y: event.clientY, view, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const start = drag.current,
      bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setView(
      constrained([
        start.view[0] - ((event.clientX - start.x) * start.view[2]) / bounds.width,
        start.view[1] - ((event.clientY - start.y) * start.view[3]) / bounds.height,
        start.view[2],
        start.view[3],
      ]),
    );
  }
  const scale = view[2] / mapWidth;
  return (
    <section className="admin-panel admin-report-map" aria-label="Mapa de reportes aprobados">
      <div className="admin-section-title">
        <h2>Dónde mejorar la red</h2>
        <span className="admin-muted">Sólo reportes aprobados y con consentimiento</span>
      </div>
      {dataset?.kind === 'synthetic' && (
        <p className="admin-map-demo" role="note">
          <strong>Demostración con datos sintéticos</strong> · {dataset.label}. Semilla{' '}
          {dataset.seed}. No describe hechos reales.
        </p>
      )}
      <form className="admin-map-filters" onSubmit={apply}>
        <label>
          Estado en el mapa
          <select
            value={filters.state}
            onChange={(event) =>
              setFilters((current) => ({ ...current, state: event.target.value as ReportMapState }))
            }
          >
            <option value="open">Aprobados abiertos</option>
            <option value="approved">Aprobados: abiertos y resueltos</option>
            <option value="resolved">Aprobados resueltos</option>
          </select>
        </label>
        <label>
          Categoría en el mapa
          <select
            value={filters.category}
            onChange={(event) =>
              setFilters((current) => ({ ...current, category: event.target.value }))
            }
          >
            <option value="all">Todas las categorías</option>
            {Object.entries(categories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de lugar en el mapa
          <select
            value={filters.targetType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                targetType: event.target.value,
                stationId: '',
                routeId: '',
                unitReference: '',
              }))
            }
          >
            <option value="all">Todos</option>
            {Object.entries(targets).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Periodo de recepción
          <select
            value={filters.days}
            onChange={(event) =>
              setFilters((current) => ({ ...current, days: event.target.value }))
            }
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
        <label>
          Estación en el mapa
          <select
            value={filters.stationId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, stationId: event.target.value }))
            }
          >
            <option value="">Todas las estaciones</option>
            {filters.stationId && !stations.some(([id]) => id === filters.stationId) && (
              <option value={filters.stationId}>{filters.stationId}</option>
            )}
            {stations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ruta en el mapa
          <select
            value={filters.routeId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, routeId: event.target.value }))
            }
          >
            <option value="">Todas las rutas</option>
            {filters.routeId && !routes.some(([id]) => id === filters.routeId) && (
              <option value={filters.routeId}>{filters.routeId}</option>
            )}
            {routes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {canInspect && (
          <label>
            Referencia declarada de unidad
            <input
              value={filters.unitReference}
              maxLength={80}
              onChange={(event) =>
                setFilters((current) => ({ ...current, unitReference: event.target.value }))
              }
              placeholder="Coincidencia exacta"
            />
          </label>
        )}
        <div className="admin-map-filter-actions">
          <button className="admin-primary" disabled={loading}>
            Aplicar filtros
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setFilters(initialFilters);
              setQuery('state=open');
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </form>
      <p className="admin-muted">
        Estaciones y rutas disponibles según los grupos de este resultado; limpia filtros para
        ampliar la consulta. Los puntos ubican estaciones del catálogo, no el daño exacto.
      </p>
      {loading && <p role="status">Actualizando mapa de reportes…</p>}
      {error && <Notice>{error}</Notice>}
      {data && (
        <>
          <div className="admin-map-totals" aria-label="Resumen del filtro">
            {[
              ['total', 'Reportes filtrados'],
              ['open', 'Abiertos'],
              ['resolved', 'Resueltos'],
              ['withoutPoint', 'Sin punto de catálogo'],
            ].map(([key, label]) => (
              <div key={key}>
                <strong>{number(data.totals[key as keyof ReportMapData['totals']])}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="admin-context">
            {number(data.totals.station)} en estaciones · {number(data.totals.route)} en recorridos
            · {number(data.totals.unit)} en unidades. Periodo por recepción:{' '}
            {dateLabel(data.filters.from)} a {dateLabel(data.filters.to)} · Monterrey. Se cuentan
            reportes, no fallas únicas ni prioridades automáticas de inversión.
          </p>
          <p className="admin-map-location-note">
            {data.locationNotice} {number(data.totals.withoutPoint)} reportes sin punto de catálogo
            se incluyen en los totales y la lista.
          </p>
          {data.truncated && (
            <p className="admin-map-location-note">
              Se muestran {data.groups.length} de {number(data.groupCount)} grupos. Los totales
              incluyen todos los reportes filtrados; el mapa y la lista muestran hasta{' '}
              {data.groupLimit} grupos.
            </p>
          )}
          <div className="admin-map-workspace">
            <div className="admin-map-stage">
              <div className="admin-map-toolbar" aria-label="Controles del mapa">
                <button
                  type="button"
                  aria-label="Acercar mapa de reportes"
                  onClick={() => zoom(0.7)}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label="Alejar mapa de reportes"
                  onClick={() => zoom(1.4)}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setView(
                      constrained(
                        fit(
                          positioned.map((group) =>
                            project([group.position!.lng, group.position!.lat]),
                          ),
                        ),
                      ),
                    )
                  }
                >
                  Ver estaciones
                </button>
                <button
                  type="button"
                  aria-label="Mover mapa al norte"
                  onClick={() => move(0, -0.25)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Mover mapa al oeste"
                  onClick={() => move(-0.25, 0)}
                >
                  ←
                </button>
                <button type="button" aria-label="Mover mapa al este" onClick={() => move(0.25, 0)}>
                  →
                </button>
                <button type="button" aria-label="Mover mapa al sur" onClick={() => move(0, 0.25)}>
                  ↓
                </button>
              </div>
              <svg
                ref={canvas}
                viewBox={view.join(' ')}
                className="admin-map-canvas"
                role="group"
                aria-label="Estaciones con reportes aprobados; las rutas y unidades se consultan en la lista"
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <image
                  href={basemap}
                  x="0"
                  y="0"
                  width={geography.width}
                  height={geography.height}
                  aria-hidden="true"
                />
                {geography.labels.map((label) => {
                  const [x, y] = project([label.lng, label.lat]);
                  return (
                    <text
                      key={label.name}
                      x={x}
                      y={y}
                      fontSize={11 * scale}
                      className="admin-map-city"
                      aria-hidden="true"
                    >
                      {label.name}
                    </text>
                  );
                })}
                {routePaths.map((points, index) => (
                  <polyline
                    key={index}
                    points={points}
                    className="admin-map-route"
                    fill="none"
                    strokeWidth={5 * scale}
                  />
                ))}
                {positioned.map((group) => {
                  const [x, y] = project([group.position!.lng, group.position!.lat]);
                  return (
                    <g
                      key={group.key}
                      role="button"
                      tabIndex={0}
                      aria-label={`${group.stationName || group.stationId}: ${group.count} reportes aprobados`}
                      aria-pressed={group.key === selectedKey}
                      onClick={() => select(group, true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          select(group, true);
                        }
                      }}
                      className={`admin-map-marker ${group.key === selectedKey ? 'is-selected' : ''}`}
                    >
                      <circle cx={x} cy={y} r={22 * scale} fill="transparent" />
                      <circle cx={x} cy={y} r={15 * scale} className="admin-map-marker-dot" />
                      <text
                        x={x}
                        y={y}
                        fontSize={12 * scale}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {group.count}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="admin-map-attribution">
                Mapa base:{' '}
                <a href={geography.copyrightUrl} target="_blank" rel="noreferrer">
                  © OpenStreetMap contributors · ODbL
                </a>
              </p>
              {previewState && (
                <p className="admin-context" role="status">
                  {previewState}
                </p>
              )}
            </div>
            <div className="admin-map-list">
              <h3>Grupos aprobados</h3>
              {data.groups.length === 0 ? (
                <p>No hay reportes aprobados para este filtro.</p>
              ) : (
                <ol>
                  {data.groups.map((group) => (
                    <li
                      key={group.key}
                      ref={group.key === selectedKey ? listSelection : undefined}
                      className={group.key === selectedKey ? 'is-selected' : ''}
                    >
                      <button
                        type="button"
                        aria-pressed={group.key === selectedKey}
                        onClick={() => select(group)}
                      >
                        <span>{targets[group.targetType]}</span>
                        <strong>{locationName(group)}</strong>
                        <span>
                          {number(group.count)} reportes · {number(group.open)} abiertos ·{' '}
                          {number(group.resolved)} resueltos
                        </span>
                        {canInspect && group.targetType === 'unit' && group.unitReference && (
                          <span>Referencia declarada: {group.unitReference}</span>
                        )}
                        <span>
                          {group.position
                            ? 'Estación ubicada por catálogo'
                            : group.geometryPack
                              ? 'Consultar trazo de referencia · sin punto de daño'
                              : 'Sin punto de daño ni trazo disponible'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
