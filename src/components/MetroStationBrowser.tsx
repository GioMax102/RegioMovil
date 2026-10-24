import { useEffect, useId, useRef } from 'react';
import { Check, ChevronRight, Search, TrainFront, X } from 'lucide-react';
import type { Line, Station } from '../types';
import './metroStationBrowser.css';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();

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
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalize(query);
  const filteredStations = stations.filter(
    (station) =>
      (lineFilter === 'all' || station.lineIds.includes(lineFilter)) &&
      normalize(
        `${station.name} ${station.municipality} ${station.aliases?.join(' ') ?? ''}`,
      ).includes(normalizedQuery),
  );

  useEffect(() => {
    // Keep a new set of results in view without moving keyboard focus from the controls.
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [lineFilter, query]);

  return (
    <section className="panel metro-station-browser" aria-labelledby={`${id}-title`}>
      <header className="metro-browser-header">
        <div className="metro-browser-heading">
          <h2 id={`${id}-title`}>Estaciones de Metro</h2>
          <TrainFront size={21} aria-hidden="true" />
        </div>
        <div className="metro-browser-filters" role="group" aria-label="Filtrar por línea">
          {[{ id: 'all', name: 'Todas', color: '' }, ...lines].map((line) => (
            <button
              key={line.id}
              type="button"
              aria-pressed={lineFilter === line.id}
              aria-controls={`${id}-stations`}
              className={lineFilter === line.id ? 'active' : undefined}
              data-line={line.id}
              onClick={() => onLineFilterChange(line.id)}
            >
              {line.id !== 'all' && <i style={{ background: line.color }} aria-hidden="true" />}
              <span>{line.name}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="metro-browser-content" ref={contentRef}>
        <label className="metro-browser-search">
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Nombre o municipio"
            aria-label="Buscar estación por nombre o municipio"
            aria-controls={`${id}-stations`}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda de estaciones"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </label>
        <p className="metro-browser-count" role="status">
          {filteredStations.length} {filteredStations.length === 1 ? 'estación' : 'estaciones'}
        </p>
        <ul className="metro-browser-list" id={`${id}-stations`} aria-label="Estaciones">
          {filteredStations.map((station) => {
            const selected = selectedStationId === station.id;
            const stationLines = lines.filter((line) => station.lineIds.includes(line.id));
            return (
              <li key={station.id}>
                <button
                  type="button"
                  className="metro-browser-station"
                  aria-pressed={selected}
                  onClick={() => onSelect(station.id)}
                >
                  <span className="metro-browser-station-icon" aria-hidden="true">
                    <TrainFront size={19} />
                  </span>
                  <span className="metro-browser-station-name">
                    <strong>{station.name}</strong>
                    <small>{station.municipality}</small>
                    <span className="metro-browser-station-lines">
                      {stationLines.map((line) => (
                        <span key={line.id}>{line.name}</span>
                      ))}
                    </span>
                  </span>
                  {selected ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={18} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {!filteredStations.length && (
          <p className="metro-browser-empty">Prueba otro nombre, municipio o línea.</p>
        )}
      </div>
    </section>
  );
}
