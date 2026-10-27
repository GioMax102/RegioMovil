import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  Flag,
  GraduationCap,
  House,
  Info,
  MapPin,
  Users,
} from 'lucide-react';
import { network } from '../api';
import type { Arrival, Board, Station } from '../types';
import {
  readSavedMobilityTrips,
  savedMobilityEvent,
  savedMobilityKey,
} from '../mobility/savedTrips';
import type { SavedMobilityTrip } from '../mobility/types';
import { ArrivalCard, Forecast, LineBadge } from './Primitives';
import {
  filterMetroForecast,
  getMetroServiceWindow,
  getNextMetroOpening,
  isMetroOperating,
  metroHoursSource,
} from './metroServiceHours';
import './homeDashboard.css';

export default function HomeDashboard({
  station,
  board,
  loading,
  favorite,
  onFavorite,
  onArrival,
  onSavedTrip,
  onStationDetails,
  onReport,
  now = new Date(),
}: {
  station: Station;
  board: Board | null;
  loading: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onArrival: (arrival: Arrival) => void;
  onNetwork?: () => void;
  onSaved?: () => void;
  onSavedTrip?: (trip: SavedMobilityTrip) => void;
  onStationDetails: () => void;
  onReport: () => void;
  now?: Date;
}) {
  const [savedTrips, setSavedTrips] = useState(readSavedMobilityTrips);
  useEffect(() => {
    const refresh = () => setSavedTrips(readSavedMobilityTrips());
    const storage = (event: StorageEvent) => {
      if (event.key === savedMobilityKey || event.key === null) refresh();
    };
    window.addEventListener(savedMobilityEvent, refresh);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(savedMobilityEvent, refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const quietestHour = (
    board ? filterMetroForecast(board.forecast, new Date(board.generatedAt)) : []
  )
    .slice(0, 6)
    .reduce<Board['forecast'][number] | null>(
      (quietest, hour) => (!quietest || hour.occupancy < quietest.occupancy ? hour : quietest),
      null,
    );
  const open = isMetroOperating(now);
  const hours = getMetroServiceWindow(now);
  return (
    <div className="home-dashboard">
      {onSavedTrip && savedTrips.length > 0 && (
        <nav className="home-shortcuts" aria-label="Trayectos guardados">
          {savedTrips.map((trip) => {
            const label = trip.label
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase();
            const Icon = /casa|hogar/.test(label)
              ? House
              : /escuela|universidad|tec|estudio/.test(label)
                ? GraduationCap
                : /trabajo|oficina/.test(label)
                  ? BriefcaseBusiness
                  : Bookmark;
            return (
              <button
                key={trip.id}
                type="button"
                onClick={() => onSavedTrip(trip)}
                aria-label={`Abrir trayecto ${trip.label}`}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{trip.label}</span>
              </button>
            );
          })}
        </nav>
      )}
      <section className="panel home-departure" aria-labelledby="home-departure-title">
        <div className="panel-heading">
          <div>
            <h2 id="home-departure-title">{open ? 'Próximas llegadas' : 'Tu estación'}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`Guardar estación ${station.name}`}
            aria-pressed={favorite}
            onClick={onFavorite}
          >
            <Bookmark size={20} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
        <p className="home-station-name">
          <MapPin size={17} aria-hidden="true" />
          <strong>{station.name}</strong>
          {station.lineIds.map((id) => (
            <LineBadge key={id} id={id} />
          ))}
        </p>
        <div className="arrival-list" aria-busy={loading}>
          {!open ? (
            <p className="home-service-closed" role="status">
              <Clock3 size={18} aria-hidden="true" />
              <strong>Fuera de horario</strong>
              <span>Abre {getNextMetroOpening(now)}</span>
            </p>
          ) : board ? (
            board.arrivals
              .slice(0, 2)
              .map((arrival) => (
                <ArrivalCard
                  key={arrival.id}
                  arrival={arrival}
                  onDetails={() => onArrival(arrival)}
                />
              ))
          ) : (
            <p role="status">Preparando tu camino…</p>
          )}
        </div>
        <button type="button" className="all-arrivals" onClick={onStationDetails}>
          Ver estación
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>
      <details className="panel home-outlook">
        <summary>
          <Users size={19} aria-hidden="true" />
          <span>Afluencia por hora</span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        {quietestHour && (
          <p className="home-quiet-hour">
            <span>Menor afluencia prevista</span>
            <strong>{quietestHour.hour}</strong>
          </p>
        )}
        {board && <Forecast data={board.forecast} compact serviceDate={board.generatedAt} />}
        <details className="home-advice">
          <summary>
            <span>{board?.advice.title || 'Compara antes de salir'}</span>
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <p>
            {board?.advice.body ||
              'Compara las siguientes unidades para elegir el viaje que te acomode.'}
          </p>
        </details>
      </details>
      <details className="home-data-info">
        <summary>
          <Info size={17} aria-hidden="true" />
          <span>Datos y fuentes</span>
        </summary>
        <p>
          Llegadas, afluencia y condiciones de las unidades son una simulación. El pronóstico de
          demostración puede diferir del servicio real.
        </p>
        <p>
          Horario general de Metro: {hours.opens}–{hours.closes}. No confirma el servicio de esta
          estación.
        </p>
        <a href={metroHoursSource} target="_blank" rel="noopener noreferrer">
          Horarios: Metrorrey · consulta 24 oct 2026
        </a>
        {network.sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
            {source.title}
          </a>
        ))}
      </details>
      <button type="button" className="report-link home-report" onClick={onReport}>
        <Flag size={15} aria-hidden="true" />
        Reportar
      </button>
    </div>
  );
}
