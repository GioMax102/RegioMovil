import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronRight, LocateFixed, Search, X } from 'lucide-react';
import type { Line, Station } from '../types';
import './metroStationBrowser.css';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();

/** Great-circle distance; coordinates stay in memory and never enter storage or logs. */
export function nearestMetroStation(stations: Station[], lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const entries = stations.map((station) => {
    const a =
      Math.sin(rad(station.lat - lat) / 2) ** 2 +
      Math.cos(rad(lat)) * Math.cos(rad(station.lat)) * Math.sin(rad(station.lng - lng) / 2) ** 2;
    return { station, distance: 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
  });
  const nearest = entries.sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance <= 15000 ? nearest.station : null;
}

export default function MetroStationBrowser({
  stations,
  lines,
  selectedStationId,
  query,
  lineFilter,
  onQueryChange,
  onLineFilterChange,
  onSelect,
}: {
  stations: Station[];
  lines: Line[];
  selectedStationId: string;
  query: string;
  lineFilter: string;
  onQueryChange: (query: string) => void;
  onLineFilterChange: (lineId: string) => void;
  onSelect: (stationId: string) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const requestId = useRef(0);
  const interacted = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const latest = useRef({ stations, onSelect, onQueryChange, onLineFilterChange });
  latest.current = { stations, onSelect, onQueryChange, onLineFilterChange };
  const selected = stations.find((station) => station.id === selectedStationId);
  const normalizedQuery = normalize(query);
  const filteredStations = stations.filter(
    (station) =>
      (lineFilter === 'all' || station.lineIds.includes(lineFilter)) &&
      normalize(
        `${station.name} ${station.municipality} ${station.aliases?.join(' ') ?? ''}`,
      ).includes(normalizedQuery),
  );

  function locate(automatic = false) {
    if (!navigator.geolocation) {
      if (!automatic) setMessage('Ubicación no disponible. Busca una estación.');
      return;
    }
    const current = ++requestId.current;
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!alive.current || current !== requestId.current) return;
        setLocating(false);
        if (automatic && interacted.current) return;
        if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 1500) {
          setMessage('GPS impreciso. Elige tu estación.');
          return;
        }
        const station = nearestMetroStation(
          latest.current.stations,
          position.coords.latitude,
          position.coords.longitude,
        );
        if (!station) {
          setMessage('No encontramos una estación cercana. Busca por nombre.');
          return;
        }
        latest.current.onLineFilterChange('all');
        latest.current.onQueryChange('');
        latest.current.onSelect(station.id);
        setExpanded(false);
        setMessage(`${station.name} · estación cercana`);
      },
      (error) => {
        if (!alive.current || current !== requestId.current) return;
        setLocating(false);
        if (!automatic)
          setMessage(
            error.code === 1
              ? 'Permiso denegado. Busca tu estación.'
              : 'No obtuvimos tu ubicación. Busca tu estación.',
          );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  useEffect(() => {
    alive.current = true;
    // An existing grant permits a single lookup; opening this screen never prompts.
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permission) => {
        if (alive.current && permission.state === 'granted' && !interacted.current) locate(true);
      })
      .catch(() => {});
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      alive.current = false;
      requestId.current++;
      document.removeEventListener('pointerdown', outside);
    };
  }, []);

  return (
    <section
      className="panel metro-station-browser"
      aria-label="Elegir estación de Metro"
      ref={rootRef}
    >
      <div className="metro-browser-controls">
        <label className="metro-line-control" role="group" aria-label="Filtrar por línea">
          <span className="sr-only">Línea</span>
          <select
            aria-label="Línea de Metro"
            value={lineFilter}
            onChange={(event) => {
              interacted.current = true;
              onLineFilterChange(event.target.value);
              onQueryChange('');
              setExpanded(true);
            }}
          >
            <option value="all">Metro</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>
        </label>
        <div className="metro-browser-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => {
              interacted.current = true;
              setExpanded(true);
            }}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setExpanded(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setExpanded(false);
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setExpanded(true);
                requestAnimationFrame(() =>
                  rootRef.current
                    ?.querySelector<HTMLButtonElement>('.metro-browser-station')
                    ?.focus(),
                );
              }
            }}
            placeholder={selected?.name ?? 'Estación'}
            aria-label="Buscar estación por nombre o municipio"
            aria-controls={`${id}-stations`}
            aria-expanded={expanded}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpiar búsqueda de estaciones"
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="metro-location-button"
          disabled={locating}
          aria-label="Encontrar estación cercana con mi ubicación"
          onClick={() => {
            interacted.current = true;
            locate();
          }}
        >
          <LocateFixed size={21} aria-hidden="true" />
        </button>
      </div>
      {message && (
        <p className="metro-location-status" role="status">
          {message}
        </p>
      )}
      {locating && (
        <span className="sr-only" role="status">
          Buscando estación cercana…
        </span>
      )}
      {expanded && (
        <div className="metro-browser-content">
          <div className="metro-results-heading">
            <span className="sr-only" role="status">
              {filteredStations.length} estaciones
            </span>
            <button
              type="button"
              aria-label="Cerrar búsqueda de estaciones"
              onClick={() => setExpanded(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <ul className="metro-browser-list" id={`${id}-stations`} aria-label="Estaciones">
            {filteredStations.map((station) => (
              <li key={station.id}>
                <button
                  type="button"
                  className="metro-browser-station"
                  aria-pressed={selectedStationId === station.id}
                  onClick={() => {
                    interacted.current = true;
                    onSelect(station.id);
                    onQueryChange('');
                    setExpanded(false);
                    inputRef.current?.focus();
                    // Focus must return to the field without reopening the suggestions.
                    setExpanded(false);
                  }}
                >
                  <span className="metro-browser-station-name">
                    <strong>{station.name}</strong>
                    <small>{station.municipality}</small>
                  </span>
                  <span className="metro-browser-station-lines">
                    {lines
                      .filter((line) => station.lineIds.includes(line.id))
                      .map((line) => (
                        <span key={line.id}>{line.name}</span>
                      ))}
                  </span>
                  {selectedStationId === station.id ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={18} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!filteredStations.length && (
            <p className="metro-browser-empty">No encontramos esa estación.</p>
          )}
        </div>
      )}
    </section>
  );
}
