import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BusFront,
  Check,
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
    .toLowerCase();
const statusLabels = {
  published: 'Servicio publicado',
  operational: 'Servicio publicado',
  construction: 'En construcción',
  announced: 'Anunciada',
};
const dateLabel = (date: string | null) => (date ? date.slice(0, 10) : 'Fecha no indicada');

export default function TransitCatalog({ onPlanLine }: { onPlanLine: (lineId: string) => void }) {
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [networkId, setNetworkId] = useState('all');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<TransitRoute | null>(null);
  useEffect(() => {
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
  }, [revision]);
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
  return (
    <section className="service-catalog" aria-labelledby="service-catalog-title">
      <div className="service-catalog-heading">
        <div>
          <span className="eyebrow">MÁS FORMAS DE MOVERTE</span>
          <h2 id="service-catalog-title">Encuentra tu ruta.</h2>
          <p>Consulta las redes, sus recorridos publicados y la fecha de cada fuente.</p>
        </div>
        <span className="service-catalog-symbol">
          <BusFront size={29} />
        </span>
      </div>
      <div className="service-catalog-notice">
        <Info size={18} />
        <p>
          Los catálogos de autobús no confirman el servicio de hoy. Un trazo disponible tampoco
          verifica el orden de las paradas o sus condiciones. Las obras quedan fuera del
          planificador.
        </p>
      </div>
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
            <span>
              {offline && <WifiOff size={13} />}Fuentes consultadas {catalog.verifiedAt}
            </span>
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
                  <span className={`service-status ${route.status}`}>
                    {statusLabels[route.status]}
                  </span>
                </div>
                <span className="service-network-name">{networkName(route.networkId)}</span>
                <h3>{route.name}</h3>
                <p className="service-municipalities">
                  <MapPin size={14} />
                  {route.municipalities.length
                    ? route.municipalities.join(' · ')
                    : 'Consulta el corredor publicado'}
                </p>
                <div className="service-card-bottom">
                  <span>
                    {route.geometryPack || route.planningEligible
                      ? 'Ver recorrido y detalles'
                      : 'Ver ficha y fuente'}
                  </span>
                  <ArrowRight size={17} />
                </div>
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
          <p className="service-offline-note">
            <WifiOff size={15} />
            El catálogo y los recorridos que abras se conservan si el navegador permite
            almacenamiento. En Android vienen incluidos. Los mapas de cada autobús se cargan al
            consultarlos.
          </p>
        </>
      )}
      {selected && catalog && (
        <ServiceDetails
          route={selected}
          catalog={catalog}
          onClose={() => setSelected(null)}
          onPlanLine={() => {
            setSelected(null);
            onPlanLine(selected.id);
          }}
        />
      )}
    </section>
  );
}

function ServiceDetails({
  route,
  catalog,
  onClose,
  onPlanLine,
}: {
  route: TransitRoute;
  catalog: TransitCatalogData;
  onClose: () => void;
  onPlanLine: () => void;
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
    <Dialog title={`${route.code} · ${name}`} onClose={onClose} wide>
      <div className="service-detail-heading">
        <span className={`service-status ${route.status}`}>{statusLabels[route.status]}</span>
        <h3>{route.name}</h3>
        <p>
          Fecha del dato: {dateLabel(route.statusAsOf)}. Consulta la fuente para confirmar cambios.
        </p>
      </div>
      {(route.from || route.to) && (
        <div className="service-endpoints">
          <span>
            <small>Desde</small>
            <strong>{route.from ?? 'Sin terminal verificada'}</strong>
          </span>
          <ArrowRight size={18} />
          <span>
            <small>Hasta</small>
            <strong>{route.to ?? 'Sin terminal verificada'}</strong>
          </span>
        </div>
      )}
      {loading && (
        <p className="service-map-loading" role="status">
          Abriendo el recorrido publicado…
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
      {pack && (
        <>
          <NetworkMap network={network} service={{ route, pack }} />
          <p className="service-map-context">
            Trazo y {pack.stops.length} puntos publicados. Los puntos no garantizan infraestructura
            construida, sentido de abordaje ni operación actual.
          </p>
          {pack.segments && pack.segments.length > 1 && (
            <p className="service-map-context">
              {pack.segments.length} segmentos publicados; continuidad por confirmar.
            </p>
          )}
          {!pack.stopOrderVerified && (
            <p className="notice">
              <Info size={17} />
              El orden operativo de las paradas no está verificado. Este recorrido se muestra para
              consulta; todavía no se usa para calcular transbordos.
            </p>
          )}
        </>
      )}
      {metroLine && (
        <>
          <NetworkMap network={network} highlighted={[metroLine.id]} />
          <button className="primary-button full-width" onClick={onPlanLine}>
            Planear esta línea
            <ArrowRight size={17} />
          </button>
        </>
      )}
      {!route.planningEligible && !route.geometryPack && (
        <div className="service-planning-limit">
          <Info size={20} />
          <p>
            {route.status === 'construction'
              ? 'Esta línea sigue en construcción. No hay arribos ni viajes disponibles para planear.'
              : 'La fuente permite consultar este servicio, pero faltan paradas ordenadas y conexiones verificadas para incorporarlo al cálculo de viajes.'}
          </p>
        </div>
      )}
      {route.via.length > 0 && (
        <div className="service-via">
          <h4>Corredor publicado</h4>
          <p>{route.via.join(' · ')}</p>
        </div>
      )}
      {stations.length > 0 && (
        <div className="service-reference-stations">
          <h4>Referencias del mapa oficial</h4>
          <ol>
            {stations.map((station, index) => (
              <li key={`${station}-${index}`}>
                <span>{index + 1}</span>
                {station}
              </li>
            ))}
          </ol>
        </div>
      )}
      {pack && pack.stops.length > 0 && (
        <details className="service-stop-list">
          <summary>Consultar los puntos publicados ({pack.stops.length})</summary>
          <p>
            La lista identifica puntos del documento; no representa una secuencia de viaje
            verificada.
          </p>
          <ul>
            {pack.stops.map((stop, index) => (
              <li key={`${stop.id}-${index}`}>
                <MapPin size={14} />
                {stop.name}
              </li>
            ))}
          </ul>
        </details>
      )}
      {notes.length > 0 && (
        <div className="service-data-notes">
          {notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      )}
      {pack?.notes && (
        <details className="service-stop-list">
          <summary>Notas del mapa y condiciones de uso</summary>
          <div className="service-data-notes">
            {(Array.isArray(pack.notes) ? pack.notes : [pack.notes]).map((note, index) => (
              <p key={index}>{note}</p>
            ))}
          </div>
        </details>
      )}
      <div className="service-detail-sources">
        <h4>Consulta y procedencia</h4>
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
      {pack && (
        <p className="service-saved-confirmation">
          <Check size={15} />
          Recorrido abierto en este dispositivo. Los datos de ocupación y tiempos del piloto siguen
          siendo simulados.
        </p>
      )}
    </Dialog>
  );
}
