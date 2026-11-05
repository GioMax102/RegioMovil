import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BusFront,
  ChevronDown,
  Flag,
  LocateFixed,
  MapPin,
  Search,
  TrainFront,
} from 'lucide-react';
import { loadRoutePack, loadTransitCatalog, network } from '../api';
import type { RoutePack, Station, TransitCatalogData } from '../types';
import { networkLabel } from '../mobility/networks';
import {
  homeMetroCoordinates,
  homePublishedStops,
  homeRouteSegments,
  homeSourceHref,
  nearestHomePoint,
} from './homeTransport';
import HomeTransportMap from './HomeTransportMap';
import { indexRouteSearch, searchIndexedRoutes } from './routeSearch';
import DeferredSection from './DeferredSection';
import './homeTransportHub.css';

const loadCommunity = () => import('./HomeCommunityFeed');

type Target = { stationId?: string; routeId?: string };
function renderCommunity(target: Target) {
  return (
    <DeferredSection
      load={loadCommunity}
      componentProps={target}
      loadingLabel="Consultando la comunidad…"
      loadingFallback={<p role="status">Consultando la comunidad…</p>}
      onRetry={() => location.reload()}
      errorFallback={
        <div role="alert">
          <p>No pudimos abrir las observaciones. Puedes seguir usando el inicio.</p>
          <button type="button" className="text-button" onClick={() => location.reload()}>
            Volver a cargar observaciones
          </button>
        </div>
      }
    />
  );
}

type PackState = { id: string; pack?: RoutePack; error?: string };

export default function HomeTransportHub({
  station,
  onChooseStation,
  onSelectStation,
  onNetwork,
  onReportTarget,
  metroContent,
  reportAction,
  community = renderCommunity,
}: {
  station: Station;
  onChooseStation: () => void;
  onSelectStation: (id: string) => void;
  onNetwork: () => void;
  onReportTarget: (target: Target) => void;
  metroContent: ReactNode;
  reportAction: ReactNode;
  community?: (target: Target) => ReactNode;
}) {
  const id = useId();
  const [mode, setMode] = useState<'metro' | 'bus'>('metro');
  const inactiveMode = mode === 'metro' ? 'bus' : 'metro';
  const [lineId, setLineId] = useState(station.lineIds[0]);
  const line = network.lines.find(
    (item) => item.id === (station.lineIds.includes(lineId) ? lineId : station.lineIds[0]),
  );
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [routeId, setRouteId] = useState('');
  const [packState, setPackState] = useState<PackState | null>(null);
  const [packAttempt, setPackAttempt] = useState(0);
  const [stopId, setStopId] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const locatedStation = useRef<string | null>(null);
  const latest = useRef({ onSelectStation });
  latest.current = { onSelectStation };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setLocating(false);
    if (locatedStation.current !== station.id) setLocationMessage('');
    locatedStation.current = null;
  }, [station.id]);
  useEffect(() => {
    if (mode !== 'bus' || catalog) return;
    let active = true;
    setCatalogError('');
    loadTransitCatalog().then(
      ({ data }) => {
        if (active) setCatalog(data);
      },
      () => {
        if (active)
          setCatalogError('No pudimos abrir las rutas. Revisa tu conexión y vuelve a intentar.');
      },
    );
    return () => {
      active = false;
    };
  }, [mode, catalog, catalogAttempt]);
  const busRoutes = useMemo(
    () =>
      (catalog?.routes ?? []).filter(
        (route) => route.mode === 'bus' && ['published', 'operational'].includes(route.status),
      ),
    [catalog],
  );
  const route = busRoutes.find((item) => item.id === routeId);
  const searchIndex = useMemo(() => indexRouteSearch(busRoutes), [busRoutes]);
  const visibleRoutes = useMemo(
    () => (query.trim() ? searchIndexedRoutes(busRoutes, searchIndex, query) : busRoutes),
    [busRoutes, searchIndex, query],
  );
  useEffect(() => {
    if (mode !== 'bus' || !route?.geometryPack) return;
    let active = true;
    setPackState({ id: route.id });
    loadRoutePack(route).then(
      ({ data }) => {
        if (active) setPackState({ id: route.id, pack: data });
      },
      () => {
        if (active)
          setPackState({
            id: route.id,
            error: 'No pudimos abrir este trazo. Puedes reportar o explorar las demás rutas.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [mode, route, packAttempt]);
  const pack = packState?.id === routeId ? packState.pack : undefined;
  const packError = packState?.id === routeId ? packState.error : undefined;
  const publishedStops = useMemo(() => (pack ? homePublishedStops(pack) : []), [pack]);
  const stop = publishedStops.find((item) => item.id === stopId);
  const busSegments = useMemo(() => (pack ? homeRouteSegments(pack) : []), [pack]);
  const routeSource = homeSourceHref(route?.officialUrl);
  const packSource = homeSourceHref(pack?.sourceUrl);
  const sourceDate = /^(\d{4}-\d{2}-\d{2})/.exec(
    pack?.verifiedAt || catalog?.verifiedAt || '',
  )?.[1];
  function manualChange() {
    generation.current++;
    locatedStation.current = null;
    setLocating(false);
    setLocationMessage('');
  }
  function chooseMode(next: 'metro' | 'bus') {
    manualChange();
    setMode(next);
  }
  async function locate() {
    const current = ++generation.current;
    setLocating(true);
    setLocationMessage('');
    try {
      const { currentLocation } = await import('../mobility/location');
      if (!mounted.current || current !== generation.current) return;
      const position = await currentLocation();
      if (!mounted.current || current !== generation.current) return;
      if (
        !('lat' in position) ||
        !Number.isFinite(position.accuracy) ||
        (position.accuracy ?? Infinity) > 1500 ||
        (position.accuracy ?? -1) < 0
      )
        throw new Error('La ubicación es imprecisa. Elige tu parada manualmente.');
      if (mode === 'metro') {
        const nearby = nearestHomePoint(network.stations, position);
        if (!nearby)
          throw new Error('No encontramos una estación de Metro cercana. Elígela manualmente.');
        locatedStation.current = nearby.point.id;
        latest.current.onSelectStation(nearby.point.id);
        setLocationMessage(`${nearby.point.name} · estación más cercana en línea recta.`);
      } else {
        const nearby = nearestHomePoint(publishedStops, position);
        if (!nearby)
          throw new Error(
            'No encontramos una parada cercana de este recorrido. Elige otra ruta o parada.',
          );
        setStopId(nearby.point.id);
        setLocationMessage(
          `${nearby.point.name} · parada más cercana de esta ruta en línea recta.`,
        );
      }
    } catch (error) {
      if (mounted.current && current === generation.current)
        setLocationMessage(
          error instanceof Error ? error.message : 'No obtuvimos tu ubicación. Elige una parada.',
        );
    } finally {
      if (mounted.current && current === generation.current) setLocating(false);
    }
  }
  const target =
    mode === 'metro' ? { stationId: station.id } : route ? { routeId: route.id } : null;
  const metroCoordinates = useMemo(
    () => homeMetroCoordinates(network.stations, line?.stationIds ?? []),
    [line],
  );
  return (
    <div className="home-transport-hub">
      <div className="home-transport-modes" role="tablist" aria-label="Elige cómo te mueves">
        {(['metro', 'bus'] as const).map((item) => {
          const Icon = item === 'metro' ? TrainFront : BusFront;
          return (
            <button
              type="button"
              role="tab"
              id={`${id}-${item}-tab`}
              aria-controls={`${id}-${item}-panel`}
              aria-selected={mode === item}
              tabIndex={mode === item ? 0 : -1}
              key={item}
              onClick={() => chooseMode(item)}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'metro'
                    : event.key === 'End'
                      ? 'bus'
                      : mode === 'metro'
                        ? 'bus'
                        : 'metro';
                chooseMode(next);
                document.getElementById(`${id}-${next}-tab`)?.focus();
              }}
            >
              <Icon size={48} strokeWidth={1.45} aria-hidden="true" />
              <span>
                <strong>{item === 'metro' ? 'Metro' : 'Autobús'}</strong>
                <small>
                  {item === 'metro' ? 'Tu estación y sus líneas' : 'Tu ruta y sus paradas'}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <section
        className="home-transport-panel"
        id={`${id}-${mode}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${mode}-tab`}
      >
        {mode === 'metro' ? (
          <>
            <div className="home-transport-select-row">
              <button
                type="button"
                className="home-transport-station"
                onClick={() => {
                  manualChange();
                  onChooseStation();
                }}
              >
                <MapPin size={20} aria-hidden="true" />
                <span>
                  <small>Tu estación</small>
                  <strong>{station.name}</strong>
                </span>
                <ChevronDown size={19} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="home-transport-locate"
                disabled={locating}
                onClick={() => void locate()}
                aria-label="Encontrar estación de Metro cercana"
              >
                <LocateFixed size={22} aria-hidden="true" />
              </button>
            </div>
            {station.lineIds.length > 1 && (
              <label className="home-transport-field">
                Línea para el mapa
                <select
                  value={line?.id}
                  onChange={(event) => {
                    manualChange();
                    setLineId(event.target.value);
                  }}
                >
                  {station.lineIds.map((id) => (
                    <option key={id} value={id}>
                      {network.lines.find((item) => item.id === id)?.name ?? id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {line && (
              <HomeTransportMap
                segments={[metroCoordinates]}
                marker={station}
                line={line.id}
                name={line.name}
                onNetwork={onNetwork}
              />
            )}
            {metroContent}
          </>
        ) : (
          <>
            <div className="home-transport-section-title">
              <BusFront size={20} aria-hidden="true" />
              <h2>Encuentra tu ruta</h2>
            </div>
            {!catalog && !catalogError && <p role="status">Cargando rutas publicadas…</p>}
            {catalogError && (
              <div role="alert">
                <p>{catalogError}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setCatalogAttempt((value) => value + 1)}
                >
                  Reintentar rutas
                </button>
              </div>
            )}
            {catalog && (
              <>
                <label className="home-transport-search">
                  <Search size={19} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                      manualChange();
                      setQuery(event.target.value);
                    }}
                    placeholder="Número, ruta o municipio"
                    aria-label="Buscar ruta de autobús"
                  />
                </label>
                <label className="home-transport-field">
                  Ruta
                  <select
                    value={routeId}
                    onChange={(event) => {
                      manualChange();
                      setRouteId(event.target.value);
                      setStopId('');
                    }}
                  >
                    <option value="">Elige una ruta</option>
                    {route && !visibleRoutes.includes(route) && (
                      <option value={route.id}>
                        {route.code} · {route.name}
                      </option>
                    )}
                    {visibleRoutes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!visibleRoutes.length && (
                  <p role="status">No encontramos esa ruta. Prueba otro número o municipio.</p>
                )}
                {route && (
                  <p className="home-transport-route-name">
                    <strong>
                      {networkLabel(route.networkId)} · {route.code}
                    </strong>
                    <span>{route.name}</span>
                  </p>
                )}
                {route && !route.geometryPack && (
                  <>
                    <p className="home-transport-note" role="status">
                      Esta ruta tiene ficha publicada; su trazo y paradas siguen pendientes de una
                      fuente verificable.
                    </p>
                    <button type="button" className="home-transport-network" onClick={onNetwork}>
                      Consultar catálogo de rutas <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </>
                )}
                {route?.geometryPack && !pack && !packError && (
                  <p role="status">Abriendo el recorrido…</p>
                )}
                {packError && (
                  <div role="alert">
                    <p>{packError}</p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setPackAttempt((value) => value + 1)}
                    >
                      Reintentar trazo
                    </button>
                  </div>
                )}
                {pack && (
                  <>
                    {publishedStops.length > 0 && (
                      <div className="home-transport-select-row">
                        <label className="home-transport-field">
                          Parada del recorrido
                          <select
                            value={stopId}
                            onChange={(event) => {
                              manualChange();
                              setStopId(event.target.value);
                            }}
                          >
                            <option value="">Elige una parada</option>
                            {publishedStops.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="home-transport-locate"
                          disabled={locating}
                          onClick={() => void locate()}
                          aria-label="Encontrar parada cercana de esta ruta"
                        >
                          <LocateFixed size={22} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    <HomeTransportMap
                      segments={busSegments}
                      marker={stop}
                      name={route?.name ?? 'Ruta seleccionada'}
                      onNetwork={onNetwork}
                    />
                    <p className="home-transport-note">
                      Recorrido publicado. Confirma parada y sentido al abordar. Sin llegadas ni
                      afluencia en tiempo real.
                    </p>
                    {publishedStops.length === 0 && (
                      <p className="home-transport-note">
                        Trazo para consulta visual; no hay puntos de parada elegibles para esta
                        selección.
                      </p>
                    )}
                  </>
                )}
                {route && (
                  <details className="home-transport-sources" key={route.id}>
                    <summary>Fuente y alcance</summary>
                    <div>
                      {sourceDate && (
                        <p>
                          {pack ? 'Referencia del trazo' : 'Corte del catálogo'}:{' '}
                          <time dateTime={sourceDate}>{sourceDate}</time>.
                        </p>
                      )}
                      {pack?.stopOrderVerified === false && (
                        <p>
                          Orden de paradas por confirmar. No establece el sentido de circulación.
                        </p>
                      )}
                      <p>
                        El recorrido publicado no confirma la operación actual ni las condiciones de
                        las paradas o unidades.
                      </p>
                      {routeSource && (
                        <a href={routeSource} target="_blank" rel="noreferrer">
                          Fuente de la ruta
                        </a>
                      )}
                      {packSource && packSource !== routeSource && (
                        <a href={packSource} target="_blank" rel="noreferrer">
                          Fuente del trazo
                        </a>
                      )}
                      {!routeSource && !packSource && (
                        <p>Consulta las referencias disponibles en el catálogo de la red.</p>
                      )}
                    </div>
                  </details>
                )}
              </>
            )}
            {!route && (
              <button type="button" className="home-transport-network" onClick={onNetwork}>
                Explorar la red <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        {locating && (
          <p className="home-transport-status" role="status">
            Buscando una parada cercana…
          </p>
        )}
        {locationMessage && (
          <p className="home-transport-status" role="status">
            {locationMessage}
          </p>
        )}
      </section>
      <section
        hidden
        id={`${id}-${inactiveMode}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${inactiveMode}-tab`}
      />
      {reportAction}
      {target && (
        <>
          <button
            type="button"
            className="home-transport-report"
            onClick={() => onReportTarget(target)}
          >
            <Flag size={20} aria-hidden="true" />
            <span>
              <strong>Reportar aquí</strong>
              <small>{mode === 'metro' ? station.name : route?.name}</small>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          {community(target)}
        </>
      )}
    </div>
  );
}
