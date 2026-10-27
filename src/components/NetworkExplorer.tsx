import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, Info, Search, X } from 'lucide-react';
import { loadTransitCatalog } from '../api';
import type { TransitCatalogData } from '../types';
import { loadMobilityNetwork } from '../mobility/api';
import LocationMap from '../mobility/LocationMap';
import type { MobilityNetwork } from '../mobility/types';
import { Dialog } from './Primitives';
import TransitCatalog, { serviceColors } from './TransitCatalog';
import useMapWorkspaceHeight from '../useMapWorkspaceHeight';
import './networkExplorer.css';

const systems = [
  ['all', 'Todas'],
  ['metrorrey', 'Metro'],
  ['transmetro', 'Transmetro'],
  ['muevo-leon', 'Muevo León'],
  ['regioruta', 'RegioRuta'],
  ['ecovia', 'Ecovía / GMG'],
  ['troncales-integradas', 'Integradas'],
] as const;
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

export default function NetworkExplorer({
  onPlanLine,
  onReportRoute,
}: {
  onPlanLine: (lineId: string) => void;
  onReportRoute?: (routeId: string) => void;
}) {
  const [network, setNetwork] = useState<MobilityNetwork | null>(null);
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [catalogOffline, setCatalogOffline] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const catalogPanel = useRef<HTMLDivElement>(null);
  const catalogToggle = useRef<HTMLButtonElement>(null);
  const routeSearch = useRef<HTMLInputElement>(null);
  const catalogId = useId();
  const [networkId, setNetworkId] = useState('all');
  const [routeId, setRouteId] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [detailId, setDetailId] = useState('');
  const previousDetailId = useRef('');
  useEffect(() => {
    if (previousDetailId.current && !detailId) routeSearch.current?.focus({ preventScroll: true });
    previousDetailId.current = detailId;
  }, [detailId]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const workspace = useRef<HTMLDivElement>(null);
  useMapWorkspaceHeight(workspace);
  const resultId = useId();
  useEffect(() => {
    let active = true;
    setError('');
    loadMobilityNetwork()
      .then((data) => {
        if (active) setNetwork(data);
      })
      .catch(() => {
        if (active)
          setError('El mapa no está disponible. Puedes consultar las fichas de las rutas.');
      });
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      active = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [attempt]);
  useEffect(() => {
    let active = true;
    setCatalogError('');
    loadTransitCatalog()
      .then((result) => {
        if (active) {
          setCatalog(result.data);
          setCatalogOffline(result.offline);
        }
      })
      .catch((error: Error) => {
        if (active) setCatalogError(error.message);
      });
    return () => {
      active = false;
    };
  }, [catalogAttempt]);
  useEffect(() => {
    if (catalogOpen) {
      catalogPanel.current
        ?.querySelector<HTMLInputElement>('input[type="search"]')
        ?.focus({ preventScroll: true });
    }
  }, [catalogOpen, catalog]);
  function closeCatalog() {
    catalogToggle.current?.focus({ preventScroll: true });
    setCatalogOpen(false);
  }
  const catalogRoutes = useMemo(
    () =>
      (catalog?.routes ?? [])
        .filter((route) => networkId === 'all' || route.networkId === networkId)
        .slice()
        .sort((a, b) =>
          `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'es', { numeric: true }),
        ),
    [catalog, networkId],
  );
  const routes = useMemo(
    () =>
      (
        network?.routes.filter((route) => networkId === 'all' || route.networkId === networkId) ??
        []
      )
        .slice()
        .sort((a, b) =>
          `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'es', { numeric: true }),
        ),
    [network, networkId],
  );
  const selectedRoute = routes.find((route) => route.id === routeId);
  const selectedService = catalogRoutes.find((route) => route.id === routeId);
  const displayedRoutes = useMemo(
    () => (selectedRoute ? [selectedRoute] : routes),
    [selectedRoute, routes],
  );
  const matches = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return terms.length
      ? catalogRoutes.filter((route) =>
          terms.every((term) =>
            normalize(
              `${route.code} ${route.name} ${route.from ?? ''} ${route.to ?? ''} ${route.municipalities.join(' ')} ${route.via.join(' ')}`,
            ).includes(term),
          ),
        )
      : [];
  }, [query, catalogRoutes]);
  const visibleMatches = matches.slice(0, 8);
  const searchOpen = searching && !!query.trim();
  useEffect(() => {
    if (searchOpen && activeResult >= 0) {
      document
        .getElementById(`${resultId}-${activeResult}`)
        ?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [searchOpen, activeResult, resultId]);
  function chooseSystem(id: string) {
    setNetworkId(id);
    setRouteId('');
    setQuery('');
    setSearching(false);
    setActiveResult(-1);
  }
  function chooseRoute(id: string) {
    const route = catalog?.routes.find((item) => item.id === id);
    if (!route) return;
    setRouteId(id);
    setNetworkId(route.networkId);
    setQuery(`${route.code} · ${route.name}`);
    setSearching(false);
    setActiveResult(-1);
    // Metro is present in the base network even if its larger public map is still loading.
    if (
      !network?.routes.some((item) => item.id === id) &&
      !(route.mode === 'metro' && route.planningEligible)
    )
      setDetailId(id);
  }
  function clearSearch() {
    setQuery('');
    setRouteId('');
    setSearching(false);
    setActiveResult(-1);
  }
  const map =
    network && routes.length ? (
      <LocationMap
        network={network}
        online={online}
        field={null}
        contextRoutes={displayedRoutes}
        compact
        inspectStops={false}
        onExpand={expanded ? undefined : () => setExpanded(true)}
      />
    ) : null;
  return (
    <div className="network-explorer" ref={workspace}>
      <section className="network-overview" aria-label="Mapa de la red de transporte">
        <div className="network-map-stage">
          <div className="network-map-layer">
            {network ? (
              routes.length ? (
                expanded ? (
                  <div className="network-map-placeholder" aria-hidden="true" />
                ) : (
                  map
                )
              ) : (
                <p className="network-map-empty" role="status">
                  Esta red aún no tiene trazos documentados.
                </p>
              )
            ) : (
              <p className="network-map-empty" role="status">
                {error || 'Cargando mapa…'}
              </p>
            )}
            {error && (
              <button
                type="button"
                className="network-retry"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Reintentar mapa
              </button>
            )}
          </div>
          <div className="network-map-overlay">
            <div
              className="network-search-wrap"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSearching(false);
              }}
            >
              <label className="network-route-search">
                <Search size={19} aria-hidden="true" />
                <input
                  ref={routeSearch}
                  type="search"
                  aria-label="Buscar recorrido en el mapa"
                  placeholder="Buscar línea o ruta"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={searchOpen ? resultId : undefined}
                  aria-expanded={searchOpen}
                  aria-activedescendant={
                    searchOpen && visibleMatches[activeResult]
                      ? `${resultId}-${activeResult}`
                      : undefined
                  }
                  value={query}
                  onFocus={() => setSearching(!selectedService)}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearching(true);
                    setActiveResult(-1);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setSearching(false);
                      setActiveResult(-1);
                    }
                    if (
                      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
                      visibleMatches.length
                    ) {
                      event.preventDefault();
                      setSearching(true);
                      setActiveResult((index) =>
                        event.key === 'ArrowDown'
                          ? (index + 1) % visibleMatches.length
                          : index <= 0
                            ? visibleMatches.length - 1
                            : index - 1,
                      );
                    }
                    const chosen = visibleMatches[activeResult] ?? visibleMatches[0];
                    if (event.key === 'Enter' && chosen) {
                      event.preventDefault();
                      chooseRoute(chosen.id);
                    }
                  }}
                />
              </label>
              {!!query && (
                <button
                  className="icon-button network-clear"
                  type="button"
                  aria-label="Limpiar búsqueda de rutas"
                  onClick={clearSearch}
                >
                  <X size={18} />
                </button>
              )}
              {searchOpen && (
                <div className="network-search-results">
                  <div id={resultId} role="listbox" aria-label="Recorridos encontrados">
                    {visibleMatches.map((route, index) => (
                      <button
                        id={`${resultId}-${index}`}
                        key={route.id}
                        type="button"
                        role="option"
                        aria-selected={
                          activeResult >= 0 ? index === activeResult : route.id === routeId
                        }
                        onClick={() => chooseRoute(route.id)}
                      >
                        <span
                          className="network-route-dot"
                          style={{
                            background:
                              network?.routes.find((item) => item.id === route.id)?.color ??
                              serviceColors[route.networkId],
                          }}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{route.code}</strong>
                          <span>{route.name}</span>
                          {!route.geometryPack &&
                            !network?.routes.some((item) => item.id === route.id) && (
                              <small>Trazo pendiente</small>
                            )}
                        </span>
                        <ArrowRight size={17} aria-hidden="true" />
                      </button>
                    ))}
                    {!matches.length && (
                      <p role="status">
                        {catalog
                          ? 'No encontramos esa ruta. Prueba otro nombre o cambia de red.'
                          : catalogError || 'Cargando rutas…'}
                      </p>
                    )}
                  </div>
                  {matches.length > visibleMatches.length && (
                    <button
                      type="button"
                      className="network-all-matches"
                      onClick={() => {
                        setSearching(false);
                        setCatalogQuery(query);
                        setCatalogOpen(true);
                      }}
                    >
                      Ver las {matches.length} coincidencias en el catálogo{' '}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div
              className="network-system-filters"
              role="group"
              aria-label="Sistema en el mapa y catálogo"
            >
              {systems.map(([id, label]) => (
                <button key={id} aria-pressed={networkId === id} onClick={() => chooseSystem(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {selectedService && (
            <button
              type="button"
              className="network-selected-route"
              onClick={() => setDetailId(selectedService.id)}
              aria-label={`Ver ficha de ${selectedService.code}: ${selectedService.name}`}
            >
              <span
                className="network-route-dot"
                style={{
                  background: selectedRoute?.color ?? serviceColors[selectedService.networkId],
                }}
                aria-hidden="true"
              />
              <span>
                <strong>{selectedService.code}</strong>
                <span>{selectedService.name}</span>
                {!selectedRoute && !selectedService.geometryPack && <small>Trazo pendiente</small>}
              </span>
              <ArrowRight size={19} aria-hidden="true" />
            </button>
          )}
          {network && (
            <details className="network-coverage-info">
              <summary aria-label="Información y cobertura de la red">
                <Info size={18} aria-hidden="true" />
              </summary>
              <div>
                <strong>
                  {selectedRoute ? `Mostrando 1 de ${routes.length}` : routes.length} recorridos con
                  trazo disponible.
                </strong>
                <p>
                  Los trazos publicados no confirman el servicio de hoy, el sentido de abordaje ni
                  las condiciones de las paradas. Consulta la fuente de cada ficha. Los tiempos y la
                  afluencia del piloto son simulados.
                </p>
              </div>
            </details>
          )}
        </div>
      </section>
      <section
        className="network-catalog-sheet"
        data-open={catalogOpen}
        aria-label="Catálogo de rutas y sistemas"
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' &&
            catalogOpen &&
            !(event.target as Element).closest('dialog')
          ) {
            event.preventDefault();
            closeCatalog();
          }
        }}
      >
        <button
          ref={catalogToggle}
          className="network-catalog-toggle"
          type="button"
          aria-expanded={catalogOpen}
          aria-controls={catalogId}
          aria-label={catalogOpen ? 'Cerrar catálogo de rutas' : 'Rutas y sistemas'}
          onClick={() => (catalogOpen ? closeCatalog() : setCatalogOpen(true))}
        >
          <span>Rutas y sistemas</span>
          {catalogOpen ? (
            <X size={19} aria-hidden="true" />
          ) : (
            <ArrowRight size={18} aria-hidden="true" />
          )}
        </button>
        <div
          id={catalogId}
          ref={catalogPanel}
          className="network-catalog-content"
          inert={!catalogOpen}
          aria-hidden={!catalogOpen}
        >
          {catalog && (
            <TransitCatalog
              catalogData={catalog}
              catalogOffline={catalogOffline}
              initialQuery={catalogQuery}
              onPlanLine={onPlanLine}
              onReportRoute={onReportRoute}
              networkFilter={networkId}
              onNetworkFilterChange={chooseSystem}
            />
          )}
          {!catalog && <p role="status">{catalogError || 'Cargando rutas…'}</p>}
          {catalogError && (
            <button
              type="button"
              className="text-button"
              onClick={() => setCatalogAttempt((value) => value + 1)}
            >
              Reintentar catálogo
            </button>
          )}
        </div>
      </section>
      {detailId && catalog && (
        <TransitCatalog
          catalogData={catalog}
          catalogOffline={catalogOffline}
          onPlanLine={onPlanLine}
          onReportRoute={onReportRoute}
          detailRouteId={detailId}
          onDetailClose={() => setDetailId('')}
          detailsOnly
        />
      )}
      {expanded && (
        <Dialog
          title={
            selectedRoute ? `${selectedRoute.code} · ${selectedRoute.name}` : 'Red de transporte'
          }
          wide
          className="network-map-dialog"
          onClose={() => setExpanded(false)}
        >
          <div className="network-expanded-map">{map}</div>
        </Dialog>
      )}
    </div>
  );
}
