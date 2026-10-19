import { useEffect, useMemo, useState } from 'react';
import { Info, Layers, Maximize2 } from 'lucide-react';
import { loadMobilityNetwork } from '../mobility/api';
import LocationMap from '../mobility/LocationMap';
import type { MobilityNetwork } from '../mobility/types';
import { Dialog } from './Primitives';
import TransitCatalog from './TransitCatalog';
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

export default function NetworkExplorer({ onPlanLine }: { onPlanLine: (lineId: string) => void }) {
  const [network, setNetwork] = useState<MobilityNetwork | null>(null);
  const [networkId, setNetworkId] = useState('all');
  const [routeId, setRouteId] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
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
  function chooseSystem(id: string) {
    setNetworkId(id);
    setRouteId('');
  }
  function chooseRoute(id: string) {
    setRouteId(id);
    const route = network?.routes.find((item) => item.id === id);
    if (route) setNetworkId(route.networkId);
  }
  const map =
    network && routes.length ? (
      <LocationMap network={network} online={online} field={null} contextRoutes={displayedRoutes} />
    ) : null;
  return (
    <div className="network-explorer">
      <section className="panel network-overview" aria-labelledby="network-overview-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CONOCE TUS CONEXIONES</span>
            <h2 id="network-overview-title">Una ciudad, más caminos.</h2>
          </div>
          <Layers size={23} />
        </div>
        <p>Explora los recorridos y consulta las rutas de cada sistema.</p>
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
        {network && routes.length > 0 && (
          <div className="network-map-toolbar">
            <label className="network-route-select">
              <span>Recorrido en el mapa</span>
              <select
                value={selectedRoute?.id ?? ''}
                onChange={(event) => chooseRoute(event.target.value)}
              >
                <option value="">
                  {networkId === 'all'
                    ? 'Todos los recorridos'
                    : 'Todos los recorridos de esta red'}
                </option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.code} · {route.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="network-expand-button"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 size={17} aria-hidden="true" />
              Ampliar mapa
            </button>
          </div>
        )}
        {network ? (
          routes.length ? (
            expanded ? (
              <div className="network-map-placeholder" aria-hidden="true" />
            ) : (
              map
            )
          ) : (
            <p className="network-map-empty" role="status">
              Esta red tiene fichas en el catálogo. Aún no hay trazos documentados para su mapa.
            </p>
          )
        ) : (
          <p role="status">{error || 'Preparando el mapa de las redes…'}</p>
        )}
        {error && (
          <button
            type="button"
            className="network-expand-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar mapa
          </button>
        )}
        {network && (
          <small className="network-coverage-note">
            <Info size={14} />
            {selectedRoute ? `Mostrando 1 de ${routes.length}` : routes.length} recorridos con trazo
            disponible. Consulta cada ficha para conocer su fuente y estado; el mapa no confirma el
            servicio de hoy.
          </small>
        )}
      </section>
      <TransitCatalog
        onPlanLine={onPlanLine}
        networkFilter={networkId}
        onNetworkFilterChange={chooseSystem}
      />
      {expanded && (
        <Dialog
          title={
            selectedRoute
              ? `${selectedRoute.code} · ${selectedRoute.name}`
              : 'Explora la red de transporte'
          }
          wide
          onClose={() => setExpanded(false)}
        >
          <div className="network-expanded-map">{map}</div>
          {selectedRoute && (
            <button
              type="button"
              className="network-expand-button network-show-all"
              onClick={() => setRouteId('')}
            >
              <Layers size={17} aria-hidden="true" />
              Ver todos los recorridos de esta red
            </button>
          )}
          <p className="network-expanded-note">
            Arrastra el mapa o acerca con dos dedos para explorar las paradas y conexiones.
          </p>
        </Dialog>
      )}
    </div>
  );
}
