import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BusFront,
  ChevronDown,
  LocateFixed,
  MapPin,
  Search,
  TrainFront,
  WifiOff,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import { searchPlaces } from './api';
import { indexMobilityStops, searchMobilityStops, stopEndpoint } from './search';
import type { MobilityEndpoint, MobilityNetwork, Place } from './types';

export default function EndpointPicker({
  field,
  network,
  online,
  onSelect,
  onClose,
  onUseLocation,
  onChooseMap,
}: {
  field: 'from' | 'to';
  network: MobilityNetwork;
  online: boolean;
  onSelect: (point: MobilityEndpoint) => void;
  onClose: () => void;
  onUseLocation?: () => void;
  onChooseMap?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState('');
  const controller = useRef<AbortController | null>(null);
  const index = useMemo(() => indexMobilityStops(network), [network]);
  const matches = useMemo(() => searchMobilityStops(index, query, !online), [index, query, online]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!online) {
      controller.current?.abort();
      setPlaces([]);
      setBusy(false);
      setSearched('');
      setError('');
    }
  }, [online]);
  async function search() {
    if (!online || query.trim().length < 3 || query.trim().length > 120) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    setPlaces([]);
    setSearched('');
    try {
      const result = await searchPlaces(query, active.signal);
      if (!active.signal.aborted) {
        setPlaces(result);
        setSearched(query.trim());
      }
    } catch (cause) {
      if (!active.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'No pudimos buscar ese lugar.');
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  return (
    <Dialog title={field === 'from' ? '¿Desde dónde sales?' : '¿A dónde vas?'} onClose={onClose}>
      <p className="endpoint-picker-intro">Busca un lugar, una dirección o una parada.</p>
      {onChooseMap && (
        <button type="button" className="endpoint-map-option" onClick={onChooseMap}>
          <MapPin size={19} />
          <span>
            Elegir en el mapa<small>Mueve el pin hasta el punto que prefieras</small>
          </span>
          <ArrowRight size={17} />
        </button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (online) void search();
          else if (matches.length === 1) onSelect(stopEndpoint(matches[0].stop));
        }}
      >
        <label className="search-field endpoint-search-field">
          <Search size={20} />
          <input
            autoFocus
            type="search"
            aria-label={field === 'from' ? 'Buscar origen' : 'Buscar destino'}
            placeholder="Lugar, dirección o parada"
            value={query}
            maxLength={120}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => {
              controller.current?.abort();
              setBusy(false);
              setQuery(event.target.value);
              setLimit(20);
              setPlaces([]);
              setSearched('');
              setError('');
            }}
          />
        </label>
        {online ? (
          <button
            className="primary-button full-width endpoint-search-submit"
            disabled={busy || query.trim().length < 3}
          >
            <Search size={17} />
            {busy ? 'Buscando en la ciudad…' : 'Buscar lugares y direcciones'}
          </button>
        ) : (
          <p className="endpoint-offline-note">
            <WifiOff size={16} />
            Sin conexión: busca una estación o parada oficial.
          </p>
        )}
      </form>
      {field === 'from' && online && onUseLocation && (
        <button
          type="button"
          className="text-button endpoint-current-location"
          onClick={onUseLocation}
        >
          <LocateFixed size={18} />
          Usar mi ubicación
        </button>
      )}
      {error && (
        <p className="mobility-error" role="alert">
          {error} Puedes elegir una parada de la lista.
        </p>
      )}
      {busy && (
        <p role="status" className="mobility-feedback">
          Buscando calles, direcciones y comercios de la ZMM…
        </p>
      )}
      {!!places.length && (
        <section className="endpoint-suggestions" aria-label="Lugares y direcciones">
          <h3>Lugares y direcciones</h3>
          <div className="mobility-place-list">
            {places.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() =>
                  onSelect({
                    kind: 'place',
                    name: place.name,
                    lat: place.lat,
                    lng: place.lng,
                    address: place.displayName,
                  })
                }
              >
                <MapPin size={20} />
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.displayName}</small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
      {searched && !places.length && (
        <p role="status" className="mobility-feedback">
          No encontramos «{searched}». Prueba con la calle, el número y el municipio. También puedes
          elegir una parada cercana.
        </p>
      )}
      {!!matches.length && (
        <section className="endpoint-suggestions" aria-label="Paradas y estaciones">
          <h3>{query.trim() ? 'Paradas y estaciones que coinciden' : 'Paradas y estaciones'}</h3>
          <p className="station-picker-count" role="status">
            {matches.length} coincidencias en la red
          </p>
          <div className="mobility-stop-list">
            {matches.slice(0, limit).map(({ stop, label }) => (
              <button key={stop.id} type="button" onClick={() => onSelect(stopEndpoint(stop))}>
                {stop.mode === 'metro' ? <TrainFront size={20} /> : <BusFront size={20} />}
                <span>
                  <strong>{stop.name}</strong>
                  <small>
                    {label}
                    {!stop.official ? ' · referencia cartográfica' : ''}
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          {matches.length > limit && (
            <button
              type="button"
              className="text-button"
              onClick={() => setLimit((value) => value + 30)}
            >
              Ver más paradas
              <ChevronDown size={16} />
            </button>
          )}
        </section>
      )}
      {!matches.length && !searched && !busy && (
        <p className="mobility-feedback">
          {online
            ? 'Pulsa buscar para consultar lugares, calles y direcciones de la ciudad.'
            : 'No hay paradas oficiales que coincidan. Prueba otro nombre.'}
        </p>
      )}
      {online && (
        <p className="mobility-method-note endpoint-search-privacy">
          La búsqueda se envía al proveedor de lugares al pulsar Buscar. Tu GPS no se envía. ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap · ODbL
          </a>
        </p>
      )}
    </Dialog>
  );
}
