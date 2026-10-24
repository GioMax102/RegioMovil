import { ArrowRight, Bookmark, ChevronDown, Flag, Users, Map, MapPin } from 'lucide-react';
import type { Arrival, Board, Station } from '../types';
import { ArrivalCard, Forecast, LineBadge } from './Primitives';
import './homeDashboard.css';

export default function HomeDashboard({
  station,
  board,
  loading,
  favorite,
  onFavorite,
  onArrival,
  onNetwork,
  onSaved,
  onStationDetails,
  onReport,
}: {
  station: Station;
  board: Board | null;
  loading: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onArrival: (arrival: Arrival) => void;
  onNetwork: () => void;
  onSaved: () => void;
  onStationDetails: () => void;
  onReport: () => void;
}) {
  const quietestHour = board?.forecast
    .slice(0, 6)
    .reduce<Board['forecast'][number] | null>(
      (quietest, hour) => (!quietest || hour.occupancy < quietest.occupancy ? hour : quietest),
      null,
    );
  return (
    <div className="home-dashboard">
      <div className="home-shortcuts" aria-label="Accesos rápidos">
        <button type="button" onClick={onSaved}>
          <span className="home-shortcut-icon" aria-hidden="true">
            <Bookmark size={20} />
          </span>
          <span>
            Tus rutas guardadas<small>También sin internet</small>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={onNetwork}>
          <span className="home-shortcut-icon" aria-hidden="true">
            <Map size={20} />
          </span>
          <span>
            Explorar la red<small>Metro, autobús y conexiones</small>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <section className="panel home-departure" aria-labelledby="home-departure-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ANTES DE SALIR</span>
            <h2 id="home-departure-title">Próximas llegadas</h2>
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
          {board ? (
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
      <section className="panel home-outlook" aria-labelledby="home-outlook-title">
        <svg
          className="home-mountain-lines"
          viewBox="0 0 320 130"
          aria-hidden="true"
          focusable="false"
          fill="none"
        >
          <path d="M-20 110 42 44l35 32 51-62 41 48 27-22 66 70h78" />
          <path d="M-20 126 42 60l35 32 51-62 41 48 27-22 66 70h78" />
          <path d="M-20 142 42 76l35 32 51-62 41 48 27-22 66 70h78" />
        </svg>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">AFLUENCIA SIMULADA</span>
            <h2 id="home-outlook-title">Elige cuándo salir</h2>
          </div>
          <span className="home-outlook-icon" aria-hidden="true">
            <Users size={21} />
          </span>
        </div>
        {quietestHour && (
          <p className="home-quiet-hour">
            <span>Menor afluencia prevista</span>
            <strong>{quietestHour.hour}</strong>
          </p>
        )}
        {board && <Forecast data={board.forecast} compact />}
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
        <small>Pronóstico de demostración; la afluencia real puede cambiar.</small>
      </section>
      <button type="button" className="report-link home-report" onClick={onReport}>
        <Flag size={15} aria-hidden="true" />
        ¿Algo no está bien? Compártelo
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
