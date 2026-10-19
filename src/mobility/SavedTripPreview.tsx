import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import JourneyDialog from './JourneyDialog';
import type { SavedMobilityTrip } from './types';
import './savedTrips.css';

export default function SavedTripPreview({
  trip,
  onClose,
}: {
  trip: SavedMobilityTrip;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  return (
    <JourneyDialog
      title={`${trip.label} · ruta guardada`}
      onClose={onClose}
      journey={trip.journeys[index]}
      network={trip.network}
      before={
        <>
          <p className="saved-mobility-snapshot-note">
            <WifiOff size={16} />
            Disponible sin internet · Cálculo del{' '}
            {new Date(trip.generatedAt).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
              timeZone: 'America/Monterrey',
            })}
          </p>
          {trip.journeys.length > 1 && (
            <div
              className="mobility-result-filters"
              role="group"
              aria-label="Alternativas guardadas"
            >
              {trip.journeys.map((journey, item) => (
                <button
                  key={journey.id}
                  aria-pressed={index === item}
                  onClick={() => setIndex(item)}
                >
                  Ruta {item + 1}
                  <span>{journey.durationMinutes} min</span>
                </button>
              ))}
            </div>
          )}
        </>
      }
      after={
        <p className="mobility-method-note">
          Consulta guardada; horarios y condiciones pueden cambiar.
        </p>
      }
    />
  );
}
