import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import StationStreetView from './StationStreetView';
import { useStationFavorites, type FavoriteStation } from './stationFavorites';
import './stationActions.css';

/** Public station actions: no location request and no guidance-state changes. */
export default function StationActions({
  station,
  saved,
  onSave,
  saveLabel,
}: {
  station: FavoriteStation;
  saved?: boolean;
  onSave?: () => void;
  saveLabel?: string;
}) {
  const controlled = saved !== undefined && !!onSave;
  const favorites = useStationFavorites(controlled);
  const [message, setMessage] = useState('');
  const selected = controlled ? saved : favorites.favorites.includes(station.id);
  return (
    <div className="station-actions" role="group" aria-label={`Acciones de ${station.name}`}>
      <StationStreetView station={station} kind={station.kind} compact />
      <button
        type="button"
        className="icon-button station-save-action"
        aria-label={saveLabel ?? `Guardar ${station.name}`}
        title={selected ? 'Quitar de estaciones guardadas' : 'Guardar estación'}
        aria-pressed={selected}
        onClick={() => {
          if (controlled) {
            onSave();
            return;
          }
          const result = favorites.toggleFavorite(station);
          setMessage(
            !result?.persisted
              ? 'No pudimos guardar la estación en este dispositivo.'
              : result.saved
                ? `${station.name} guardada en este dispositivo.`
                : `${station.name} eliminada de tus guardadas.`,
          );
        }}
      >
        <Bookmark size={19} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      <span className="sr-only" role="status">
        {message}
      </span>
    </div>
  );
}
