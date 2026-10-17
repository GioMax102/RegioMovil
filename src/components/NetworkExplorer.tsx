import { useEffect, useMemo, useState } from 'react';
import { Info, Layers } from 'lucide-react';
import { loadMobilityNetwork } from '../mobility/api';
import LocationMap from '../mobility/LocationMap';
import type { MobilityNetwork } from '../mobility/types';
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
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine !== false);
  useEffect(() => {
    let active = true;
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
  }, []);
  const routes = useMemo(
    () =>
      network?.routes.filter((route) => networkId === 'all' || route.networkId === networkId) ?? [],
    [network, networkId],
  );
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
            <button key={id} aria-pressed={networkId === id} onClick={() => setNetworkId(id)}>
              {label}
            </button>
          ))}
        </div>
        {network ? (
          routes.length ? (
            <LocationMap network={network} online={online} field={null} contextRoutes={routes} />
          ) : (
            <p className="network-map-empty" role="status">
              Esta red tiene fichas en el catálogo. Aún no hay trazos documentados para su mapa.
            </p>
          )
        ) : (
          <p role="status">{error || 'Preparando el mapa de las redes…'}</p>
        )}
        {network && (
          <small className="network-coverage-note">
            <Info size={14} />
            {routes.length} recorridos con trazo disponible. Consulta cada ficha para conocer su
            fuente y estado; el mapa no confirma el servicio de hoy.
          </small>
        )}
      </section>
      <TransitCatalog
        onPlanLine={onPlanLine}
        networkFilter={networkId}
        onNetworkFilterChange={setNetworkId}
      />
    </div>
  );
}
