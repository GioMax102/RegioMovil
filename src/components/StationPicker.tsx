import { useState } from 'react';
import { Check, ChevronDown, MapPin, Search } from 'lucide-react';
import { network } from '../api';
import { Dialog, LineBadge } from './Primitives';
import '../route-planning.css';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export default function StationPicker({
  value,
  onChange,
  destination = false,
}: {
  value: string;
  onChange: (id: string) => void;
  destination?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = network.stations.find((station) => station.id === value)!;
  const label = destination ? 'Estación de destino' : 'Estación de origen';
  const matches = network.stations.filter((station) =>
    normalize(
      `${station.name} ${station.municipality} ${station.aliases?.join(' ') ?? ''}`,
    ).includes(normalize(query)),
  );

  return (
    <>
      <button
        type="button"
        className={`station-input station-picker-trigger ${destination ? 'destination' : ''}`}
        aria-label={`${label}: ${selected.name}`}
        aria-haspopup="dialog"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        {destination ? <MapPin size={19} /> : <span className="origin-dot" />}
        <span className="field-content">
          <span>{destination ? 'Hacia' : 'Desde'}</span>
          <strong>{selected.name}</strong>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <Dialog
          title={destination ? 'Elige tu destino' : 'Elige tu origen'}
          onClose={() => setOpen(false)}
        >
          <p className="dialog-intro">Busca por nombre o municipio, o recorre las estaciones.</p>
          <label className="search-field">
            <Search size={18} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (matches.length === 1) {
                  onChange(matches[0].id);
                  setOpen(false);
                }
              }}
              aria-label={`Buscar ${destination ? 'destino' : 'origen'}`}
              placeholder="Estación o municipio"
            />
          </label>
          <p className="station-picker-count" role="status">
            {matches.length} {matches.length === 1 ? 'estación' : 'estaciones'}
          </p>
          <div
            className="dialog-station-list station-picker-list"
            aria-label="Estaciones disponibles"
          >
            {matches.map((station) => (
              <button
                key={station.id}
                type="button"
                className={`station-list-item ${value === station.id ? 'selected' : ''}`}
                aria-pressed={value === station.id}
                onClick={() => {
                  onChange(station.id);
                  setOpen(false);
                }}
              >
                <MapPin size={18} />
                <span>
                  <strong>{station.name}</strong>
                  <small>{station.municipality}</small>
                  <span className="station-picker-lines">
                    {station.lineIds.map((id) => (
                      <LineBadge key={id} id={id} />
                    ))}
                  </span>
                </span>
                {value === station.id && <Check size={18} />}
              </button>
            ))}
            {!matches.length && (
              <p className="empty-small">No hay coincidencias. Prueba otro nombre o municipio.</p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
