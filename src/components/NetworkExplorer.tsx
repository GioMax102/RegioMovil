import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ArrowRight, Maximize2, Search, X } from 'lucide-react';
import { loadTransitCatalog } from '../api';
import type { TransitCatalogData } from '../types';
import { loadMobilityNetwork } from '../mobility/api';
import LocationMap from '../mobility/LocationMap';
import type { MobilityNetwork } from '../mobility/types';
import TransitCatalog from './TransitCatalog';
import ServiceBadge from './ServiceBadge';
import StopSequence from './StopSequence';
import useMapWorkspaceHeight from '../useMapWorkspaceHeight';
import { indexRouteSearch, searchIndexedRoutes } from './routeSearch';
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
export default function NetworkExplorer({
  onPlanLine,
  onReportRoute,
  initialSelection,
}: {
  onPlanLine: (lineId: string) => void;
  onReportRoute?: (routeId: string) => void;
  initialSelection?: { routeId: string; stopId?: string };
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
  const [selectedStopId, setSelectedStopId] = useState(initialSelection?.stopId ?? '');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [detailId, setDetailId] = useState('');
  const appliedSelection = useRef('');
  const pendingInitialDetail = useRef('');
  const [selectionNotice, setSelectionNotice] = useState('');
  useEffect(() => {
    if (!initialSelection || !catalog) return;
    const key = JSON.stringify(initialSelection);
    if (appliedSelection.current === key) return;
    appliedSelection.current = key;
    const service = catalog.routes.find((item) => item.id === initialSelection.routeId);
    if (!service) {
      setSelectionNotice('La ruta elegida ya no está en este catálogo. Busca otra variante.');
      return;
    }
    pendingInitialDetail.current = service.id;
    setNetworkId(service.networkId);
    setRouteId(service.id);
    setQuery(`${service.code} · ${service.name}`);
  }, [initialSelection, catalog]);
  function cancelInitialSelection() {
    pendingInitialDetail.current = '';
    if (initialSelection) appliedSelection.current = JSON.stringify(initialSelection);
    setSelectionNotice('');
  }
  const previousDetailId = useRef('');
  useEffect(() => {
    if (previousDetailId.current && !detailId) routeSearch.current?.focus({ preventScroll: true });
    previousDetailId.current = detailId;
  }, [detailId]);
  const [expanded, setExpanded] = useState(false);
  const mapScreenId = useId();
  const expandButton = useRef<HTMLButtonElement>(null);
  const exitButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [overlayHeight, setOverlayHeight] = useState(118);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  function enterMapScreen() {
    if (expandedRef.current) return;
    returnFocus.current = document.activeElement;
    history.pushState({ ...history.state, regioNetworkMap: mapScreenId }, '');
    setExpanded(true);
  }
  function leaveMapScreen() {
    if (history.state?.regioNetworkMap === mapScreenId) history.back();
    else setExpanded(false);
  }
  useEffect(() => {
    const onPopState = () => setExpanded(history.state?.regioNetworkMap === mapScreenId);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (history.state?.regioNetworkMap === mapScreenId) {
        const { regioNetworkMap: _mapScreen, ...previous } = history.state;
        history.replaceState(previous, '');
      }
    };
  }, [mapScreenId]);
  useLayoutEffect(() => {
    if (!expanded) {
      const target = returnFocus.current;
      if (!target) return;
      // Restore after DOM mutations: React restores the former button focus
      // between effect cleanup and setup when the same button changes its role.
      if (target.isConnected && 'focus' in target && typeof target.focus === 'function')
        target.focus({ preventScroll: true });
      else expandButton.current?.focus({ preventScroll: true });
      returnFocus.current = null;
      return;
    }
    const scroll = { x: window.scrollX, y: window.scrollY };
    const previous = document.body.dataset.networkMapScreen;
    const overflow = document.body.style.overflow;
    document.body.dataset.networkMapScreen = 'true';
    document.body.style.overflow = 'hidden';
    exitButton.current?.focus({ preventScroll: true });
    return () => {
      if (previous === undefined) delete document.body.dataset.networkMapScreen;
      else document.body.dataset.networkMapScreen = previous;
      document.body.style.overflow = overflow;
      window.scrollTo(scroll.x, scroll.y);
    };
  }, [expanded]);
  useLayoutEffect(() => {
    const measure = () => {
      const top = workspace.current?.getBoundingClientRect().top ?? 0;
      setOverlayHeight(
        Math.ceil((overlay.current?.getBoundingClientRect().bottom ?? top) - top || 118),
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (overlay.current) observer?.observe(overlay.current);
    return () => observer?.disconnect();
  }, [expanded, routeId]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const workspace = useRef<HTMLDivElement>(null);
  useMapWorkspaceHeight(workspace, expanded);
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
  const searchIndex = useMemo(() => indexRouteSearch(catalog?.routes ?? []), [catalog]);
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
  const selectedRouteStops = useMemo(() => {
    if (!selectedRoute || !network) return [];
    const byId = new Map(network.stops.map((stop) => [stop.id, stop]));
    const orderedIds = selectedRoute.segments.flatMap((segment) => segment.stopIds);
    const ids = orderedIds.length
      ? orderedIds
      : network.stops.filter((stop) => stop.routeIds.includes(routeId)).map((stop) => stop.id);
    const seen = new Set<string>();
    return ids.flatMap((id) => {
      const stop = byId.get(id);
      if (!stop || seen.has(id)) return [];
      seen.add(id);
      return [stop];
    });
  }, [selectedRoute, network, routeId]);
  const stopSequence = selectedRoute && selectedRouteStops.length > 1 ? (
    <StopSequence
      label={`${selectedRoute.code} · ${selectedRoute.name}`}
      stops={selectedRouteStops.map((stop) => ({ id: stop.id, name: stop.name }))}
      selectedId={selectedStopId}
      numbered={selectedRoute.mode !== 'metro'}
      onSelect={setSelectedStopId}
    />
  ) : null;
  const displayedRoutes = useMemo(
    () => (routeId ? (selectedRoute ? [selectedRoute] : []) : routes),
    [routeId, selectedRoute, routes],
  );
  useEffect(() => {
    if (!network || pendingInitialDetail.current !== routeId) return;
    pendingInitialDetail.current = '';
    if (selectedService && !selectedRoute) setDetailId(selectedService.id);
  }, [network, routeId, selectedService, selectedRoute]);
  const matches = useMemo(
    () => searchIndexedRoutes(catalogRoutes, searchIndex, query),
    [query, catalogRoutes, searchIndex],
  );
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
    cancelInitialSelection();
    setNetworkId(id);
    setRouteId('');
    setSelectedStopId('');
    setQuery('');
    setSearching(false);
    setActiveResult(-1);
  }
  function chooseRoute(id: string) {
    cancelInitialSelection();
    const route = catalog?.routes.find((item) => item.id === id);
    if (!route) return;
    setRouteId(id);
    setSelectedStopId(initialSelection?.routeId === id ? initialSelection.stopId ?? '' : '');
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
    cancelInitialSelection();
    setQuery('');
    setRouteId('');
    setSelectedStopId('');
    setSearching(false);
    setActiveResult(-1);
  }
  const selectedRouteCard = selectedService && (
    <button
      type="button"
      className="network-selected-route"
      onClick={() => setDetailId(selectedService.id)}
      aria-label={`Ver ficha de ${selectedService.code}: ${selectedService.name}`}
    >
      <ServiceBadge
        networkId={selectedService.networkId}
        routeId={selectedService.id}
        code={selectedService.code}
        mode={selectedService.mode}
      />
      <span>
        <span>{selectedService.name}</span>
        {!selectedRoute && !selectedService.geometryPack && <small>Trazo pendiente</small>}
      </span>
      <ArrowRight size={19} aria-hidden="true" />
    </button>
  );
  const map =
    network && displayedRoutes.length ? (
      <LocationMap
        network={network}
        online={online}
        field={null}
        contextRoutes={displayedRoutes}
        compact
        inspectStops
        initialStopId={
          network.stops.some(
            (stop) => stop.id === selectedStopId && stop.routeIds.includes(routeId),
          )
            ? selectedStopId
            : undefined
        }
        viewportPadding={{ top: overlayHeight + 20, right: 76, bottom: 20, left: 16 }}
        selectionOverlay={selectedRouteCard}
        topOverlay={stopSequence}
        onStopSelect={(stop) => setSelectedStopId(stop.id)}
        preserveViewportOnResize
        onExpand={expanded ? undefined : enterMapScreen}
      />
    ) : null;
  return (
    <div
      className="network-explorer"
      ref={workspace}
      data-map-screen={expanded}
      style={{ '--network-overlay-height': `${overlayHeight}px` } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded && !(event.target as Element).closest('dialog')) {
          event.preventDefault();
          leaveMapScreen();
        }
      }}
    >
      {selectionNotice && <p role="status">{selectionNotice}</p>}
      <section className="network-overview" aria-label="Mapa de la red de transporte">
        <div className="network-map-stage">
          <div className="network-map-layer">
            {network ? (
              displayedRoutes.length ? (
                map
              ) : (
                <div className="network-map-empty" role="status">
                  <p>
                    {routeId
                      ? 'Este recorrido no tiene un trazo disponible en este mapa. Consulta su ficha y fuentes.'
                      : 'Esta red aún no tiene trazos documentados.'}
                  </p>
                  {selectedRouteCard}
                </div>
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
          <div className="network-map-overlay" ref={overlay}>
            <div className="network-map-search-row">
              <button
                ref={expanded ? exitButton : expandButton}
                type="button"
                className="network-map-screen-toggle"
                aria-label={
                  expanded
                    ? 'Salir del mapa a pantalla completa'
                    : 'Ampliar mapa a pantalla completa'
                }
                aria-pressed={expanded}
                onClick={expanded ? leaveMapScreen : enterMapScreen}
              >
                {expanded ? (
                  <X size={19} aria-hidden="true" />
                ) : (
                  <Maximize2 size={19} aria-hidden="true" />
                )}
              </button>
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
                      cancelInitialSelection();
                      setQuery(event.target.value);
                      setSearching(true);
                      setActiveResult(-1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && searchOpen) {
                        event.stopPropagation();
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
                          <ServiceBadge
                            networkId={route.networkId}
                            routeId={route.id}
                            code={route.code}
                            mode={route.mode}
                          />
                          <span>
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
                          if (expanded) leaveMapScreen();
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
        </div>
      </section>
      <section
        className="network-catalog-sheet"
        hidden={expanded}
        inert={expanded}
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
    </div>
  );
}
