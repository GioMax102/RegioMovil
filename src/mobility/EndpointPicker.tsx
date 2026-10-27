import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Bookmark,
  BusFront,
  ChevronDown,
  GitBranch,
  House,
  LocateFixed,
  MapPin,
  Route,
  Search,
  TrainFront,
  WifiOff,
  X,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import { PlaceLookupError, searchPlaces } from './api';
import { readSavedMobilityTrips } from './savedTrips';
import {
  distinctPlaceSuggestions,
  indexMobilityStops,
  placeAddress,
  searchMobilityStops,
  stopEndpoint,
} from './search';
import type { MobilityEndpoint, MobilityNetwork, Place, SavedMobilityTrip } from './types';
import type { MapPosition } from './regionalViewport';
import './endpointMapSearch.css';

const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');

function suggestionLabel(place: Place) {
  if (place.resultType === 'street') return 'Calle · elige el punto exacto en el mapa';
  const label =
    place.resultType === 'intersection'
      ? 'Cruce de calles'
      : place.resultType === 'address'
        ? 'Dirección'
        : 'Lugar';
  return place.precision === 'approximate'
    ? `${label} · ubicación aproximada`
    : place.precision === 'street'
      ? `${label} · referencia de calle`
      : label;
}

function SuggestionIcon({ type }: { type: Place['resultType'] }) {
  const Icon =
    type === 'intersection'
      ? GitBranch
      : type === 'address'
        ? House
        : type === 'street'
          ? Route
          : MapPin;
  return <Icon size={20} aria-hidden="true" />;
}

export default function EndpointPicker({
  field,
  network,
  online,
  onSelect,
  onClose,
  onUseLocation,
  onChooseMap,
  onOpenSavedTrip,
  onRefinePlace,
  map,
  onPreview,
  locating = false,
  locationError = '',
  inline = false,
  onQueryChange,
  onSearchRequest,
}: {
  field: 'from' | 'to';
  network: MobilityNetwork;
  online: boolean;
  onSelect: (point: MobilityEndpoint) => void;
  onClose: () => void;
  onUseLocation?: () => void;
  onChooseMap?: () => void;
  onOpenSavedTrip?: (trip: SavedMobilityTrip) => void;
  onRefinePlace?: (place: Place) => void;
  map?: ReactNode;
  onPreview?: (point: (MapPosition & { name: string }) | null) => void;
  locating?: boolean;
  locationError?: string;
  inline?: boolean;
  onQueryChange?: (query: string) => void;
  onSearchRequest?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slowSearch, setSlowSearch] = useState(false);
  const [searched, setSearched] = useState('');
  const [composing, setComposing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = useMemo(() => indexMobilityStops(network), [network]);
  const [exploring, setExploring] = useState(false);
  const matches = useMemo(
    () => (query.trim() || exploring ? searchMobilityStops(index, query, !online) : []),
    [index, query, online, exploring],
  );
  const saved = useMemo(() => readSavedMobilityTrips(), []);
  useEffect(() => {
    const dialog = picker.current?.closest<HTMLElement>(inline ? '.mobility-planner' : 'dialog');
    const viewport = dialog?.ownerDocument.defaultView?.visualViewport;
    if (!dialog || !viewport) return;
    // The keyboard can resize the visual viewport without resizing the layout
    // viewport. Keep the search and the scrollable results inside the visible area.
    const properties = ['--endpoint-viewport-height', '--endpoint-viewport-offset'];
    const original = properties.map((name) => [name, dialog.style.getPropertyValue(name)]);
    const update = () => {
      dialog.style.setProperty(properties[0], `${viewport.height}px`);
      dialog.style.setProperty(properties[1], `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      for (const [name, value] of original) {
        if (value) dialog.style.setProperty(name, value);
        else dialog.style.removeProperty(name);
      }
    };
  }, [inline]);
  useEffect(() => {
    if (inline) input.current?.focus({ preventScroll: true });
  }, [inline]);
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
    const exactStop = text
      ? matches.find(({ stop }) => searchable(stop.name).trim() === searchable(text).trim())?.stop
      : undefined;
    preview.current?.(exactStop ?? null);
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
          const suggestions = distinctPlaceSuggestions(found);
          setPlaces(suggestions);
          if (exactStop || suggestions[0]) preview.current?.(exactStop ?? suggestions[0]);
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
  }, [query, online, composing, matches]);

  function changeQuery(value: string) {
    controller.current?.abort();
    generation.current++;
    setBusy(false);
    setPlaces([]);
    setSearched('');
    setError('');
    setQuery(value);
    onQueryChange?.(value);
    setLimit(8);
    results.current?.parentElement?.scrollTo?.({ top: 0 });
  }
  function resultButtons() {
    return [
      ...(results.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
  }
  function selectPlace(place: Place) {
    if (onRefinePlace && (place.resultType === 'street' || place.precision === 'street')) {
      onRefinePlace(place);
      return;
    }
    onSelect({
      kind: 'place',
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      address: place.displayName,
    });
  }
  // An exact station name should outrank a loosely matching neighborhood.
  const stopsFirst =
    !!query.trim() &&
    matches.some(({ stop }) => searchable(stop.name).trim() === searchable(query).trim());
  const stopSuggestions = (
    <>
      {!!matches.length && (
        <section className="endpoint-suggestions" aria-label="Paradas y estaciones">
          <h3>{query.trim() ? 'Paradas y estaciones' : 'Explora la red'}</h3>
          <div className="mobility-stop-list">
            {matches.slice(0, limit).map(({ stop, label }) => (
              <button
                key={stop.id}
                type="button"
                onClick={() => onSelect(stopEndpoint(stop))}
                onFocus={() => onPreview?.(stop)}
                onPointerEnter={() => onPreview?.(stop)}
              >
                <span className={`endpoint-suggestion-icon ${stop.mode}`}>
                  {stop.mode === 'metro' ? (
                    <TrainFront size={20} aria-hidden="true" />
                  ) : (
                    <BusFront size={20} aria-hidden="true" />
                  )}
                </span>
                <span>
                  <strong>{stop.name}</strong>
                  <small>
                    {label}
                    {!stop.official ? ' · referencia cartográfica' : ''}
                  </small>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
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
    </>
  );
  const content = (
    <div ref={picker} className={`endpoint-picker${inline ? ' endpoint-inline' : ''}`}>
      {map && (
        <div className="endpoint-context-map" role="region" aria-label="Mapa de la búsqueda">
          {map}
        </div>
      )}
      <div className="endpoint-picker-panel">
        <div className="endpoint-picker-search">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setExploring(true);
              onSearchRequest?.();
              if (!online && matches.length === 1) onSelect(stopEndpoint(matches[0].stop));
            }}
          >
            <label className="search-field endpoint-search-field">
              <button
                type="submit"
                className="endpoint-submit icon-button"
                aria-label="Buscar lugares y estaciones"
              >
                <Search size={20} aria-hidden="true" />
              </button>
              <input
                ref={input}
                data-autofocus
                type="search"
                aria-label={field === 'from' ? 'Buscar origen' : 'Buscar destino'}
                placeholder="Lugar, calle y número o cruce"
                value={query}
                maxLength={120}
                autoComplete="off"
                enterKeyHint="search"
                aria-controls={`${id}-results`}
                aria-describedby={online ? undefined : `${id}-hint`}
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
            {!online && (
              <p
                id={`${id}-hint`}
                className={`endpoint-offline-note ${online && (map || query.trim().length >= 3) ? 'endpoint-visually-hidden' : ''}`}
              >
                {online ? (
                  'Lugares, calles y paradas · sugerencias desde 3 letras'
                ) : (
                  <>
                    <WifiOff size={16} />
                    Sin conexión: busca una estación o parada oficial.
                  </>
                )}
              </p>
            )}
          </form>
          {(onChooseMap || (field === 'from' && online && onUseLocation)) && (
            <div className="endpoint-picker-actions" aria-label="Otras formas de elegir el punto">
              {onChooseMap && (
                <button type="button" className="endpoint-map-option" onClick={onChooseMap}>
                  <MapPin size={18} aria-hidden="true" />
                  <span>Elegir en el mapa</span>
                </button>
              )}
              {field === 'from' && online && onUseLocation && (
                <button
                  type="button"
                  className="endpoint-current-location"
                  aria-label={locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
                  disabled={locating}
                  onClick={onUseLocation}
                >
                  <LocateFixed size={18} aria-hidden="true" />
                  <span>{locating ? 'Localizando…' : 'Mi ubicación'}</span>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="endpoint-picker-results" aria-label="Sugerencias de ubicación">
          {locationError && (
            <p className="mobility-error" role="alert">
              {locationError}
            </p>
          )}
          {locating && (
            <p className="endpoint-location-status" role="status">
              Obteniendo ubicación. Puedes elegir otro punto o cerrar la búsqueda.
            </p>
          )}
          {error && (
            <p className="mobility-error" role="alert">
              {error} Puedes ajustar la búsqueda o elegir una parada.
            </p>
          )}
          <p
            role="status"
            aria-live="polite"
            className={`mobility-feedback endpoint-search-status ${!busy && places.length ? 'endpoint-visually-hidden' : ''}`}
          >
            {busy
              ? slowSearch
                ? 'La búsqueda está tardando. Si el servidor estaba en reposo, puede tomar cerca de un minuto. Puedes seguir eligiendo estaciones o un punto en el mapa.'
                : 'Buscando lugares…'
              : searched
                ? places.length
                  ? `${places.length} ${places.length === 1 ? 'lugar encontrado' : 'lugares encontrados'}.`
                  : `No encontramos «${searched}». Prueba con la calle, el número y el municipio.`
                : ''}
          </p>
          <div
            ref={results}
            id={`${id}-results`}
            aria-busy={busy}
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
            {stopsFirst && stopSuggestions}
            {!!places.length && (
              <section className="endpoint-suggestions" aria-label="Lugares y direcciones">
                <h3>Lugares y direcciones</h3>
                <div className="mobility-place-list">
                  {places.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => selectPlace(place)}
                      onFocus={() => onPreview?.(place)}
                      onPointerEnter={() => onPreview?.(place)}
                    >
                      <span className={`endpoint-suggestion-icon ${place.resultType || 'place'}`}>
                        <SuggestionIcon type={place.resultType} />
                      </span>
                      <span>
                        <strong>{place.name}</strong>
                        <small>{placeAddress(place)}</small>
                        <small className="endpoint-result-type">{suggestionLabel(place)}</small>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!!savedPlaces.length && (
              <section className="endpoint-suggestions" aria-label="Lugares guardados">
                <h3>Tus lugares guardados</h3>
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
                      onFocus={() => onPreview?.(point)}
                      onPointerEnter={() => onPreview?.(point)}
                      onClick={() => (online ? onSelect(point) : onOpenSavedTrip?.(trip))}
                    >
                      <span className="endpoint-suggestion-icon saved">
                        <Bookmark size={20} aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{point.name}</strong>
                        <small>
                          {online ? trip.label : `Ver trayecto · ${trip.label}`} ·{' '}
                          {trip.from.name ?? 'Origen'} → {trip.to.name ?? 'Destino'}
                        </small>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!stopsFirst && stopSuggestions}
          </div>
          {(query.trim() || exploring) &&
            !matches.length &&
            !searched &&
            !busy &&
            !online &&
            !savedPlaces.length && (
              <p className="mobility-feedback">
                No hay paradas oficiales ni lugares guardados que coincidan. Prueba otro nombre.
              </p>
            )}
          {online && (
            <details className="endpoint-search-privacy">
              <summary>Información del buscador</summary>
              <p>
                Se consulta el texto que escribes. Tu GPS no se envía al buscador. ©{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap · ODbL
                </a>
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
  return inline ? (
    content
  ) : (
    <Dialog
      title={field === 'from' ? '¿Desde dónde sales?' : '¿A dónde vas?'}
      onClose={onClose}
      className={`endpoint-picker-dialog${map ? ' endpoint-picker-map-dialog' : ''}`}
    >
      {content}
    </Dialog>
  );
}
