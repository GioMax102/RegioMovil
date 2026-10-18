import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BusFront,
  ChevronDown,
  LocateFixed,
  MapPin,
  Search,
  TrainFront,
  WifiOff,
  X,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import { PlaceLookupError, searchPlaces } from './api';
import { readSavedMobilityTrips } from './savedTrips';
import { indexMobilityStops, searchMobilityStops, stopEndpoint } from './search';
import type { MobilityEndpoint, MobilityNetwork, Place, SavedMobilityTrip } from './types';

const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');

export default function EndpointPicker({
  field,
  network,
  online,
  onSelect,
  onClose,
  onUseLocation,
  onChooseMap,
  onOpenSavedTrip,
}: {
  field: 'from' | 'to';
  network: MobilityNetwork;
  online: boolean;
  onSelect: (point: MobilityEndpoint) => void;
  onClose: () => void;
  onUseLocation?: () => void;
  onChooseMap?: () => void;
  onOpenSavedTrip?: (trip: SavedMobilityTrip) => void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slowSearch, setSlowSearch] = useState(false);
  const [searched, setSearched] = useState('');
  const [composing, setComposing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = useMemo(() => indexMobilityStops(network), [network]);
  const matches = useMemo(() => searchMobilityStops(index, query, !online), [index, query, online]);
  const saved = useMemo(() => readSavedMobilityTrips(), []);
  useEffect(() => {
    setSlowSearch(false);
    if (!busy) return;
    const timer = setTimeout(() => setSlowSearch(true), 6000);
    return () => clearTimeout(timer);
  }, [busy, query]);
  const savedPlaces = useMemo(
    () =>
      saved
        .flatMap((trip) =>
          [trip.from, trip.to].flatMap((point) =>
            'lat' in point &&
            searchable(`${point.name} ${trip.label}`).includes(searchable(query.trim()))
              ? [{ trip, point }]
              : [],
          ),
        )
        .filter(
          (entry, index, all) =>
            all.findIndex(
              (other) => other.point.lat === entry.point.lat && other.point.lng === entry.point.lng,
            ) === index,
        )
        .slice(0, 8),
    [saved, query],
  );

  useEffect(() => {
    const text = query.trim();
    const current = ++generation.current;
    const active = new AbortController();
    controller.current = active;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setPlaces([]);
    setSearched('');
    setError('');
    setBusy(false);
    if (!online || composing || text.length < 3 || text.length > 120) return () => active.abort();
    const run = async (retried = false) => {
      if (active.signal.aborted) return;
      setBusy(true);
      try {
        const found = await searchPlaces(text, active.signal);
        if (!active.signal.aborted && generation.current === current) {
          setPlaces(found);
          setSearched(text);
          setBusy(false);
        }
      } catch (cause) {
        if (active.signal.aborted || generation.current !== current) return;
        // The shared provider quota can overlap another user's query. Retry once,
        // only while this exact query remains current; never accumulate a queue.
        if (
          !retried &&
          cause instanceof PlaceLookupError &&
          cause.retryAfter > 0 &&
          cause.retryAfter <= 2
        ) {
          retry = setTimeout(() => void run(true), cause.retryAfter * 1000);
          return;
        }
        setError(cause instanceof Error ? cause.message : 'No pudimos buscar ese lugar.');
        setBusy(false);
      }
    };
    const debounce = setTimeout(() => void run(), 650);
    return () => {
      active.abort();
      clearTimeout(debounce);
      clearTimeout(retry);
    };
  }, [query, online, composing]);

  function changeQuery(value: string) {
    controller.current?.abort();
    generation.current++;
    setBusy(false);
    setPlaces([]);
    setSearched('');
    setError('');
    setQuery(value);
    setLimit(20);
  }
  function resultButtons() {
    return [
      ...(results.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
  }
  return (
    <Dialog title={field === 'from' ? '¿Desde dónde sales?' : '¿A dónde vas?'} onClose={onClose}>
      <p className="endpoint-picker-intro">Escribe un lugar, una dirección o una parada.</p>
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
          if (!online && matches.length === 1) onSelect(stopEndpoint(matches[0].stop));
        }}
      >
        <label className="search-field endpoint-search-field">
          <Search size={20} />
          <input
            ref={input}
            data-autofocus
            type="search"
            aria-label={field === 'from' ? 'Buscar origen' : 'Buscar destino'}
            placeholder="Lugar, dirección o parada"
            value={query}
            maxLength={120}
            autoComplete="off"
            enterKeyHint="search"
            aria-controls={`${id}-results`}
            aria-describedby={`${id}-hint`}
            onChange={(event) => changeQuery(event.target.value)}
            onCompositionStart={() => {
              controller.current?.abort();
              setComposing(true);
            }}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'ArrowDown' && resultButtons().length) {
                event.preventDefault();
                resultButtons()[0]?.focus();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
          />
          {!!query && (
            <button
              type="button"
              className="icon-button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                changeQuery('');
                input.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          )}
        </label>
        <p id={`${id}-hint`} className="endpoint-offline-note">
          {online ? (
            'Las sugerencias aparecen al escribir al menos 3 letras.'
          ) : (
            <>
              <WifiOff size={16} />
              Sin conexión: busca una estación o parada oficial.
            </>
          )}
        </p>
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
      <p role="status" aria-live="polite" className="mobility-feedback">
        {busy
          ? slowSearch
            ? 'La búsqueda está tardando. Si el servidor estaba en reposo, puede tomar cerca de un minuto. Puedes seguir eligiendo estaciones o un punto en el mapa.'
            : 'Buscando calles, direcciones y comercios de la ZMM…'
          : searched
            ? places.length
              ? `${places.length} lugares encontrados.`
              : `No encontramos «${searched}». Prueba con la calle, el número y el municipio.`
            : ''}
      </p>
      <div
        ref={results}
        id={`${id}-results`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
          if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          const buttons = resultButtons();
          const current = buttons.indexOf(event.target as HTMLButtonElement);
          if (current < 0) return;
          event.preventDefault();
          if (event.key === 'ArrowUp' && current === 0) input.current?.focus();
          else
            buttons[
              Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))
            ]?.focus();
        }}
      >
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
        {!!savedPlaces.length && (
          <section className="endpoint-suggestions" aria-label="Lugares guardados">
            <h3>Lugares de tus trayectos guardados</h3>
            {!online && (
              <p className="mobility-feedback">
                Abre el trayecto ya guardado para consultar este lugar sin conexión.
              </p>
            )}
            <div className="mobility-place-list">
              {savedPlaces.map(({ trip, point }) => (
                <button
                  key={`${point.lat},${point.lng}`}
                  type="button"
                  disabled={!online && !onOpenSavedTrip}
                  onClick={() => (online ? onSelect(point) : onOpenSavedTrip?.(trip))}
                >
                  <WifiOff size={20} />
                  <span>
                    <strong>{point.name}</strong>
                    <small>
                      {online ? trip.label : `Ver trayecto · ${trip.label}`} ·{' '}
                      {trip.from.name ?? 'Origen'} → {trip.to.name ?? 'Destino'}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </section>
        )}
        {!!matches.length && (
          <section className="endpoint-suggestions" aria-label="Paradas y estaciones">
            <h3>{query.trim() ? 'Paradas y estaciones que coinciden' : 'Paradas y estaciones'}</h3>
            <p className="station-picker-count">{matches.length} coincidencias en la red</p>
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
      </div>
      {!matches.length && !searched && !busy && !online && !savedPlaces.length && (
        <p className="mobility-feedback">
          No hay paradas oficiales ni lugares guardados que coincidan. Prueba otro nombre.
        </p>
      )}
      {online && (
        <p className="mobility-method-note endpoint-search-privacy">
          Se consulta el texto que escribes para sugerir lugares. Tu GPS no se envía. ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap · ODbL
          </a>
        </p>
      )}
    </Dialog>
  );
}
