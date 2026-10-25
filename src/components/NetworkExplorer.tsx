import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, Info, Search, X } from 'lucide-react';
import { loadMobilityNetwork } from '../mobility/api';
import LocationMap from '../mobility/LocationMap';
import type { MobilityNetwork } from '../mobility/types';
import { Dialog } from './Primitives';
import TransitCatalog from './TransitCatalog';
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

export default function NetworkExplorer({ onPlanLine }: { onPlanLine: (lineId: string) => void }) {
  const [network, setNetwork] = useState<MobilityNetwork | null>(null);
  const [networkId, setNetworkId] = useState('all');
  const [routeId, setRouteId] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [detailId, setDetailId] = useState('');
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
  const displayedRoutes = useMemo(
    () => (selectedRoute ? [selectedRoute] : routes),
    [selectedRoute, routes],
  );
  const matches = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return terms.length
      ? routes.filter((route) =>
          terms.every((term) => normalize(`${route.code} ${route.name}`).includes(term)),
        )
      : [];
  }, [query, routes]);
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
    const route = network?.routes.find((item) => item.id === id);
    if (!route) return;
    setRouteId(id);
    setNetworkId(route.networkId);
    setQuery(`${route.code} · ${route.name}`);
    setSearching(false);
    setActiveResult(-1);
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
                  onFocus={() => setSearching(!selectedRoute)}
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
                <div
                  id={resultId}
                  className="network-search-results"
                  role="listbox"
                  aria-label="Recorridos encontrados"
                >
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
                        style={{ background: route.color }}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{route.code}</strong>
                        <span>{route.name}</span>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                  {!matches.length && (
                    <p role="status">Sin coincidencias en el mapa. Consulta el catálogo.</p>
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
          {selectedRoute && (
            <button
              type="button"
              className="network-selected-route"
              onClick={() => setDetailId(selectedRoute.id)}
              aria-label={`Ver ficha de ${selectedRoute.code}: ${selectedRoute.name}`}
            >
              <span
                className="network-route-dot"
                style={{ background: selectedRoute.color }}
                aria-hidden="true"
              />
              <span>
                <strong>{selectedRoute.code}</strong>
                <span>{selectedRoute.name}</span>
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
      <details className="network-catalog-sheet">
        <summary>
          Rutas y sistemas <ArrowRight size={18} aria-hidden="true" />
        </summary>
        <TransitCatalog
          onPlanLine={onPlanLine}
          networkFilter={networkId}
          onNetworkFilterChange={chooseSystem}
        />
      </details>
      {detailId && (
        <TransitCatalog
          onPlanLine={onPlanLine}
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
