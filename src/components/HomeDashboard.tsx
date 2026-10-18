import { ArrowRight, Bookmark, Flag, Leaf, Map, MapPin } from 'lucide-react';
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
  return (
    <div className="home-dashboard">
      <div className="home-shortcuts" aria-label="Accesos rápidos">
        <button onClick={onSaved}>
          <Bookmark size={20} />
          <span>
            Tus rutas guardadas<small>A la mano, sin internet</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button onClick={onNetwork}>
          <Map size={20} />
          <span>
            Explorar la red<small>Metro, autobús y conexiones</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
      <section className="panel home-departure" aria-labelledby="home-departure-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ANTES DE SALIR</span>
            <h2 id="home-departure-title">Las próximas unidades</h2>
          </div>
          <button
            className="icon-button"
            aria-label={`Guardar estación ${station.name}`}
            aria-pressed={favorite}
            onClick={onFavorite}
          >
            <Bookmark size={20} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <p className="home-station-name">
          <MapPin size={17} />
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
        <button className="all-arrivals" onClick={onStationDetails}>
          Ver estación y pronóstico
          <ArrowRight size={16} />
        </button>
      </section>
      <section className="panel home-outlook" aria-labelledby="home-outlook-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ELIGE TU MOMENTO</span>
            <h2 id="home-outlook-title">Un poco más de espacio.</h2>
          </div>
          <Leaf size={21} />
        </div>
        {board && <Forecast data={board.forecast} compact />}
        <div className="home-advice">
          <h3>{board?.advice.title || 'Dale un respiro a tu camino.'}</h3>
          <p>
            {board?.advice.body ||
              'Compara las siguientes unidades para elegir el viaje que te acomode.'}
          </p>
        </div>
        <small>Pronóstico de demostración; la afluencia real puede cambiar.</small>
      </section>
      <button className="report-link home-report" onClick={onReport}>
        <Flag size={15} />
        ¿Algo no está bien? Compártelo
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
