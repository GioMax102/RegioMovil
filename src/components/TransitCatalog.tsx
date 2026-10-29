import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BusFront,
  ChevronDown,
  ExternalLink,
  Info,
  MapPin,
  RefreshCw,
  Route,
  Search,
  TrainFront,
  WifiOff,
} from 'lucide-react';
import { loadRoutePack, loadTransitCatalog, network } from '../api';
import type { RoutePack, TransitCatalogData, TransitRoute } from '../types';
import { Dialog } from './Primitives';
import NetworkMap from './NetworkMap';
import ServiceIdentity from './ServiceIdentity';
import PublicReports from './DeferredReports';
import './transit-catalog.css';

export const serviceColors: Record<string, string> = {
  metrorrey: '#365d46',
  'muevo-leon': '#27774b',
  transmetro: '#438454',
  regioruta: '#356d8a',
  ecovia: '#b5643c',
  'troncales-integradas': '#7c5b8e',
};
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
const statusLabels = {
  published: 'Servicio publicado',
  operational: 'Servicio publicado',
  construction: 'En construcción',
  announced: 'Anunciada',
};
const dateLabel = (date: string | null) => (date ? date.slice(0, 10) : 'Fecha no indicada');

export default function TransitCatalog({
  onPlanLine,
  networkFilter,
  onNetworkFilterChange,
  detailRouteId,
  onDetailClose,
  detailsOnly = false,
  catalogData,
  catalogOffline = false,
  initialQuery = '',
  onReportRoute,
}: {
  onPlanLine: (lineId: string) => void;
  onReportRoute?: (routeId: string) => void;
  networkFilter?: string;
  onNetworkFilterChange?: (networkId: string) => void;
  detailRouteId?: string;
  onDetailClose?: () => void;
  detailsOnly?: boolean;
  catalogData?: TransitCatalogData;
  catalogOffline?: boolean;
  initialQuery?: string;
}) {
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const [localNetworkId, setLocalNetworkId] = useState('all');
  const networkId = networkFilter ?? localNetworkId;
  const setNetworkId = (id: string) => {
    setLocalNetworkId(id);
    onNetworkFilterChange?.(id);
  };
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<TransitRoute | null>(null);
  useEffect(() => {
    if (catalogData) {
      setCatalog(catalogData);
      setOffline(catalogOffline);
      setLoading(false);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    loadTransitCatalog()
      .then((result) => {
        if (active) {
          setCatalog(result.data);
          setOffline(result.offline);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, catalogData, catalogOffline]);
  const filtered = useMemo(
    () =>
      (catalog?.routes ?? []).filter(
        (route) =>
          (networkId === 'all' || route.networkId === networkId) &&
          (status === 'all' ||
            (status === 'published'
              ? ['published', 'operational'].includes(route.status)
              : route.status === status)) &&
          normalize(query)
            .split(/\s+/)
            .filter(Boolean)
            .every((term) =>
              normalize(
                `${route.code} ${route.name} ${route.from ?? ''} ${route.to ?? ''} ${route.municipalities.join(' ')} ${route.via.join(' ')}`,
              ).includes(term),
            ),
      ),
    [catalog, query, networkId, status],
  );
  useEffect(() => setLimit(24), [query, networkId, status]);
  const networkName = (id: string) => catalog?.networks.find((item) => item.id === id)?.name ?? id;
  const busRoutes = catalog?.routes.filter((route) => route.mode === 'bus') ?? [];
  const missingGeometry = busRoutes.filter((route) => !route.geometryPack);
  const selectedRoute = selected ?? catalog?.routes.find((route) => route.id === detailRouteId);
  const detail =
    selectedRoute && catalog ? (
      <ServiceDetails
        route={selectedRoute}
        catalog={catalog}
        onReport={
          onReportRoute
            ? () => {
                setSelected(null);
                onDetailClose?.();
                onReportRoute(selectedRoute.id);
              }
            : undefined
        }
        onClose={() => {
          setSelected(null);
          onDetailClose?.();
        }}
        onPlanLine={() => {
          setSelected(null);
          onDetailClose?.();
          onPlanLine(selectedRoute.id);
        }}
      />
    ) : null;
  if (detailsOnly)
    return (
      <>
        {detail}
        {loading && <span role="status">Cargando ficha…</span>}
        {error && (
          <Dialog title="No se pudo abrir la ficha" onClose={() => onDetailClose?.()}>
            <p role="alert">{error}</p>
            <button className="primary-button" onClick={() => setRevision((value) => value + 1)}>
              Reintentar
            </button>
          </Dialog>
        )}
      </>
    );
  return (
    <section className="service-catalog" aria-labelledby="service-catalog-title">
      <div className="service-catalog-heading">
        <div>
          <h2 id="service-catalog-title">Rutas</h2>
        </div>
        <span className="service-catalog-symbol">
          <BusFront size={29} />
        </span>
      </div>
      <details className="service-catalog-notice">
        <summary>
          <Info size={18} aria-hidden="true" /> Información del catálogo
        </summary>
        <p>
          Los catálogos de autobús no confirman el servicio de hoy. Un trazo disponible tampoco
          verifica el orden de las paradas o sus condiciones. Las obras quedan fuera del
          planificador.
        </p>
        {catalog && (
          <div className="service-coverage-summary">
            <p>
              {busRoutes.length - missingGeometry.length} de {busRoutes.length} rutas de autobús
              tienen un trazo importado. Los trazos y sus paradas se consideran en el planificador
              experimental; el orden y los sentidos de circulación necesitan confirmación.
            </p>
            {missingGeometry.length > 0 && (
              <details>
                <summary>Ver {missingGeometry.length} rutas pendientes de geometría</summary>
                <p>
                  Estas fichas se pueden consultar, pero todavía no generan trayectorias. La
                  auditoría de fuentes registra los enlaces revisados y los motivos pendientes.
                </p>
                <ul>
                  {missingGeometry.map((route) => (
                    <li key={route.id}>
                      {route.code} · {route.name}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </details>
      {loading && !catalog && (
        <div className="panel empty-state" role="status">
          <Route size={28} />
          <h3>Abriendo las redes de Nuevo León…</h3>
        </div>
      )}
      {error && (
        <div className="service-load-error" role="alert">
          <p>{error}</p>
          <button className="primary-button" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={16} />
            Volver a intentar
          </button>
        </div>
      )}
      {catalog && (
        <>
          <div className="service-toolbar">
            <label className="search-field">
              <Search size={18} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Buscar ruta, ramal o municipio"
                placeholder="Ruta, colonia o municipio"
              />
            </label>
            <label className="service-select">
              <span>Red</span>
              <select
                aria-label="Filtrar rutas por red"
                value={networkId}
                onChange={(event) => setNetworkId(event.target.value)}
              >
                <option value="all">Todas las redes</option>
                {catalog.networks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
            <label className="service-select">
              <span>Estado publicado</span>
              <select
                aria-label="Filtrar rutas por estado"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="published">Servicios publicados</option>
                <option value="construction">En construcción</option>
                <option value="announced">Anunciadas</option>
              </select>
              <ChevronDown size={15} />
            </label>
          </div>
          <div className="service-results-meta" role="status">
            <span>
              {filtered.length} {filtered.length === 1 ? 'ruta' : 'rutas'} ·{' '}
              {catalog.networks.length} redes
            </span>
            {offline && (
              <span>
                <WifiOff size={13} /> Sin conexión
              </span>
            )}
          </div>
          <div className="service-cards">
            {filtered.slice(0, limit).map((route) => (
              <button
                key={route.id}
                className="service-card panel"
                onClick={() => setSelected(route)}
                style={
                  {
                    '--service-color': serviceColors[route.networkId] ?? '#386d4a',
                  } as React.CSSProperties
                }
                aria-label={`Ver ruta ${route.code}: ${route.name}. ${statusLabels[route.status]}. ${networkName(route.networkId)}`}
              >
                <div className="service-card-top">
                  <span className="service-route-code">
                    {route.mode === 'metro' ? <TrainFront size={18} /> : <BusFront size={18} />}{' '}
                    {route.code}
                  </span>
                  {!['published', 'operational'].includes(route.status) && (
                    <span className={`service-status ${route.status}`}>
                      {statusLabels[route.status]}
                    </span>
                  )}
                </div>
                <span className="service-network-name">{networkName(route.networkId)}</span>
                <h3>{route.name}</h3>
                <ArrowRight className="service-card-arrow" size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          {!filtered.length && (
            <div className="panel empty-small">
              <Search size={27} />
              <h3>No encontramos esa ruta.</h3>
              <p>Prueba con el número, un municipio o cambia los filtros.</p>
              <button
                className="text-button"
                onClick={() => {
                  setQuery('');
                  setNetworkId('all');
                  setStatus('all');
                }}
              >
                Mostrar todas las rutas
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {filtered.length > limit && (
            <button className="service-load-more" onClick={() => setLimit((value) => value + 24)}>
              Mostrar más rutas ({Math.min(24, filtered.length - limit)})<ChevronDown size={17} />
            </button>
          )}
          <details className="service-catalog-information">
            <summary>
              <Info size={16} aria-hidden="true" /> Fuentes y uso sin conexión
            </summary>
            <p>Fuentes consultadas {catalog.verifiedAt}.</p>
            <p>
              El catálogo y los recorridos abiertos se conservan cuando el navegador permite
              almacenamiento. En Android vienen incluidos. Los mapas de autobús se cargan al
              consultarlos.
            </p>
          </details>
        </>
      )}
      {detail}
    </section>
  );
}

function ServiceDetails({
  route,
  catalog,
  onClose,
  onPlanLine,
  onReport,
}: {
  route: TransitRoute;
  catalog: TransitCatalogData;
  onClose: () => void;
  onPlanLine: () => void;
  onReport?: () => void;
}) {
  const [pack, setPack] = useState<RoutePack | null>(null);
  const [mapError, setMapError] = useState('');
  const [loading, setLoading] = useState(!!route.geometryPack);
  const [revision, setRevision] = useState(0);
  const metroLine = route.planningEligible
    ? network.lines.find((line) => line.id === route.id)
    : undefined;
  useEffect(() => {
    if (!route.geometryPack) return;
    let active = true;
    setLoading(true);
    setMapError('');
    loadRoutePack(route)
      .then((result) => {
        if (active) setPack(result.data);
      })
      .catch((error) => {
        if (active) setMapError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, revision]);
  const sources = catalog.sources.filter((source) => route.sourceIds.includes(source.id));
  const name =
    catalog.networks.find((item) => item.id === route.networkId)?.name ?? route.networkId;
  const stations = route.stationNames ?? [];
  const notes = Array.isArray(route.notes) ? route.notes : [];
  return (
    <Dialog
      title={`${route.code} · ${name}`}
      onClose={onClose}
      wide
      className="service-detail-dialog"
    >
      <div className="service-detail-heading">
        <h3>{route.name}</h3>
        {!['published', 'operational'].includes(route.status) && (
          <span className={`service-status ${route.status}`}>{statusLabels[route.status]}</span>
        )}
      </div>
      {loading && (
        <p className="service-map-loading" role="status">
          Cargando recorrido…
        </p>
      )}
      {mapError && (
        <div className="service-load-error" role="alert">
          <p>{mapError}</p>
          <button className="text-button" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={15} />
            Reintentar mapa
          </button>
        </div>
      )}
      {pack && <NetworkMap network={network} service={{ route, pack }} />}
      {metroLine && <NetworkMap network={network} highlighted={[metroLine.id]} />}
      {(route.from || route.to) && (
        <div className="service-endpoints">
          <strong>{route.from ?? 'Terminal sin verificar'}</strong>
          <ArrowRight size={18} aria-hidden="true" />
          <strong>{route.to ?? 'Terminal sin verificar'}</strong>
        </div>
      )}
      {metroLine && (
        <button className="primary-button full-width" onClick={onPlanLine}>
          Planear esta línea
          <ArrowRight size={17} />
        </button>
      )}
      {!metroLine && !route.geometryPack && (
        <p className="service-planning-limit">
          <Info size={18} aria-hidden="true" />
          {route.status === 'construction'
            ? 'En construcción · No disponible para viajar.'
            : 'Trazo pendiente'}
        </p>
      )}
      {!metroLine && !route.geometryPack && (
        <div className="service-pending-source">
          {route.via.length > 0 && <p>{route.via.join(' · ')}</p>}
          {(route.officialUrl || sources[0]?.url) && (
            <a href={route.officialUrl || sources[0].url} target="_blank" rel="noreferrer">
              Consultar fuente oficial <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      <PublicReports routeId={route.id} onReport={onReport} />
      <details className="service-detail-disclosure">
        <summary>
          <BusFront size={18} aria-hidden="true" /> Unidad y pago
        </summary>
        <ServiceIdentity
          networkId={route.networkId}
          routeId={route.id}
          code={route.code}
          mode={route.mode}
          status={route.status}
        />
      </details>
      <details className="service-detail-disclosure service-detail-information">
        <summary>
          <Info size={18} aria-hidden="true" /> Información y fuentes
        </summary>
        <p>
          Fecha del dato: {dateLabel(route.statusAsOf)}. Consulta la fuente para confirmar cambios.
        </p>
        {!route.planningEligible && !route.geometryPack && (
          <p>
            {route.status === 'construction'
              ? 'Esta línea sigue en construcción. No hay arribos ni viajes disponibles para planear.'
              : 'La fuente permite consultar este servicio, pero faltan paradas ordenadas y conexiones verificadas para incorporarlo al cálculo de viajes.'}
          </p>
        )}
        {pack && (
          <>
            <p>
              Trazo y {pack.stops.length} puntos publicados. Los puntos no garantizan
              infraestructura construida, sentido de abordaje ni operación actual.
            </p>
            {pack.segments && pack.segments.length > 1 && (
              <p>{pack.segments.length} segmentos publicados; continuidad por confirmar.</p>
            )}
            {!pack.stopOrderVerified && (
              <p>
                El orden operativo de las paradas no está verificado. El planificador experimental
                usa este recorrido con orden y sentidos inferidos del mapa; el sentido de abordaje
                necesita confirmación.
              </p>
            )}
          </>
        )}
        <p>Los datos de ocupación y tiempos del piloto son simulados.</p>
        {route.via.length > 0 && (
          <p>
            <strong>Corredor publicado</strong>
            <br />
            {route.via.join(' · ')}
          </p>
        )}
        {stations.length > 0 && (
          <details className="service-stop-list">
            <summary>Estaciones de referencia ({stations.length})</summary>
            <ol>
              {stations.map((station, index) => (
                <li key={`${station}-${index}`}>{station}</li>
              ))}
            </ol>
          </details>
        )}
        {pack && pack.stops.length > 0 && (
          <details className="service-stop-list">
            <summary>Puntos publicados ({pack.stops.length})</summary>
            <p>Referencias del documento; no representan una secuencia de viaje verificada.</p>
            <ul>
              {pack.stops.map((stop, index) => (
                <li key={`${stop.id}-${index}`}>
                  <MapPin size={14} aria-hidden="true" />
                  {stop.name}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="service-data-notes">
          {notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
          {(pack?.notes ? (Array.isArray(pack.notes) ? pack.notes : [pack.notes]) : []).map(
            (note, index) => (
              <p key={`map-${index}`}>{note}</p>
            ),
          )}
        </div>
        <div className="service-detail-sources">
          {sources.map((source) => (
            <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
              <span>{source.title}</span>
              <ExternalLink size={15} />
            </a>
          ))}
          {route.officialUrl && !sources.some((source) => source.url === route.officialUrl) && (
            <a href={route.officialUrl} target="_blank" rel="noreferrer">
              <span>Consultar el recorrido oficial</span>
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </details>
    </Dialog>
  );
}
