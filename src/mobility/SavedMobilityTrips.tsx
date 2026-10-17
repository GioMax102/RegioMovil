import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BusFront,
  Home,
  MapPin,
  School,
  Trash2,
  WifiOff,
  BriefcaseBusiness,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import MobilityJourneyDetail from './MobilityJourneyDetail';
import {
  deleteLegacyMobilityTrip,
  deleteMobilityAlternative,
  deleteMobilityTrip,
  readLegacyMobilityTrips,
  readSavedMobilityTrips,
  savedMobilityEvent,
} from './savedTrips';
import type { MobilityJourney, MobilityTripEndpoints, SavedMobilityTrip } from './types';
import './mobility.css';
import './savedTrips.css';

const endpointName = (point: MobilityTripEndpoints['from']) =>
  point.name || ('id' in point ? point.id : 'Lugar');
const preferenceName = {
  fastest: 'Menos tiempo',
  comfortable: 'Menos afluencia',
  accessible: 'Menos transbordos',
};
const labelIcon = (label: string) =>
  label === 'Casa'
    ? Home
    : label === 'Trabajo'
      ? BriefcaseBusiness
      : label === 'Escuela'
        ? School
        : Bookmark;
const savedDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Monterrey',
      });
};

export default function SavedMobilityTrips({
  onPlan,
  onStartPlanning,
  compact = false,
}: {
  onPlan?: (trip: MobilityTripEndpoints) => void;
  onStartPlanning?: () => void;
  compact?: boolean;
}) {
  const [trips, setTrips] = useState(readSavedMobilityTrips);
  const [legacy, setLegacy] = useState(readLegacyMobilityTrips);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [selected, setSelected] = useState<{
    trip: SavedMobilityTrip;
    journey: MobilityJourney;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => {
      setTrips(readSavedMobilityTrips());
      setLegacy(readLegacyMobilityTrips());
    };
    const connection = () => setOnline(navigator.onLine !== false);
    window.addEventListener(savedMobilityEvent, update);
    window.addEventListener('storage', update);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    return () => {
      window.removeEventListener(savedMobilityEvent, update);
      window.removeEventListener('storage', update);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);
  function remove(action: () => void) {
    try {
      action();
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos eliminar la ruta.');
    }
  }
  if (compact && !trips.length && !legacy.length) return null;
  const content = (
    <>
      {error && (
        <p role="alert" className="mobility-error">
          {error}
        </p>
      )}
      {!trips.length && !legacy.length && (
        <div className="empty-small saved-mobility-empty">
          <WifiOff size={27} />
          <h3>Tus rutas, incluso sin señal.</h3>
          <p>Planea un viaje y guarda hasta 8 alternativas con mapa.</p>
          {onStartPlanning && (
            <button className="primary-button" onClick={onStartPlanning}>
              Planear un viaje
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {trips.map((trip) => {
        const Icon = labelIcon(trip.label);
        const needsConnection = !online && ('lat' in trip.from || 'lat' in trip.to);
        return (
          <article key={trip.id} className="saved-mobility-trip">
            <div className="saved-mobility-heading">
              <span className="saved-mobility-label">
                <Icon size={19} />
                <strong>{trip.label}</strong>
              </span>
              <button
                className="icon-button"
                aria-label={`Eliminar paquete ${trip.label}`}
                onClick={() => remove(() => deleteMobilityTrip(trip.id))}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <p className="saved-mobility-endpoints">
              {endpointName(trip.from)} <ArrowRight size={13} /> {endpointName(trip.to)}
            </p>
            <small className="saved-mobility-meta">
              {trip.journeys.length} {trip.journeys.length === 1 ? 'ruta' : 'rutas'} ·{' '}
              {preferenceName[trip.preference]} · Guardado {savedDate(trip.savedAt)}
            </small>
            <div className="saved-mobility-alternatives">
              {trip.journeys.map((journey, index) => (
                <div key={journey.id}>
                  <button
                    className="saved-mobility-route"
                    onClick={() => setSelected({ trip, journey })}
                    aria-label={`Ver ruta guardada ${index + 1} de ${trip.label}`}
                  >
                    <span>
                      <strong>{journey.durationMinutes} min</strong>
                      <small>
                        {journey.transfers} transbordos · {journey.walkingMinutes} min a pie
                      </small>
                    </span>
                    <span className="saved-mobility-route-modes">
                      {journey.steps.some((step) => step.mode === 'bus') && <BusFront size={18} />}
                      <ArrowRight size={17} />
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Eliminar alternativa ${index + 1} de ${trip.label}`}
                    onClick={() => remove(() => deleteMobilityAlternative(trip.id, journey.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {onPlan && (
              <button
                className="text-button saved-mobility-replan"
                disabled={needsConnection}
                onClick={() =>
                  onPlan({ from: trip.from, to: trip.to, preference: trip.preference })
                }
              >
                {needsConnection ? 'Recalcular lugares requiere internet' : 'Volver a planear'}
                <ArrowRight size={15} />
              </button>
            )}
          </article>
        );
      })}
      {!!legacy.length && (
        <details className="mobility-method">
          <summary>Trayectos anteriores ({legacy.length})</summary>
          <p>Conservamos tus paradas. Vuelve a planear para guardar el mapa completo.</p>
          {legacy.map((trip) => (
            <div className="saved-mobility-legacy" key={`${trip.from}-${trip.to}`}>
              <button
                className="text-button"
                disabled={!onPlan}
                onClick={() =>
                  onPlan?.({ from: { id: trip.from }, to: { id: trip.to }, preference: 'fastest' })
                }
              >
                <MapPin size={17} />
                {trip.label}
                <ArrowRight size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Eliminar ${trip.label}`}
                onClick={() => remove(() => deleteLegacyMobilityTrip(trip.from, trip.to))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </details>
      )}
      {selected && (
        <Dialog
          title={`${selected.trip.label} · ruta guardada`}
          onClose={() => setSelected(null)}
          wide
        >
          <p className="saved-mobility-snapshot-note">
            <WifiOff size={16} />
            Disponible sin internet · Cálculo del {savedDate(selected.trip.generatedAt)}
          </p>
          <MobilityJourneyDetail journey={selected.journey} network={selected.trip.network} />
          <p className="mobility-method-note">
            Consulta guardada; horarios y condiciones pueden cambiar.
          </p>
        </Dialog>
      )}
    </>
  );
  return compact ? (
    <details className="mobility-saved saved-mobility-compact">
      <summary>
        <Bookmark size={16} />
        Tus rutas sin internet ({trips.length + legacy.length})
      </summary>
      {content}
    </details>
  ) : (
    <section className="panel saved-mobility-panel" aria-labelledby="saved-mobility-title">
      <div className="panel-heading">
        <h2 id="saved-mobility-title">Rutas sin internet</h2>
        <WifiOff size={21} />
      </div>
      {content}
    </section>
  );
}
