import { Clock3, Info, Accessibility } from 'lucide-react';
import { ArrivalCard, Forecast, LineBadge } from './Primitives';
import StationActions from './StationActions';
import {
  getMetroServiceWindow,
  getNextMetroOpening,
  isMetroOperating,
  metroHoursSource,
} from './metroServiceHours';
import type { Arrival, Board, Station } from '../types';
import './metroStationDetail.css';

export default function MetroStationDetail({
  station,
  board,
  saved,
  onSave,
  onArrival,
  now,
}: {
  station: Station;
  board: Board | null;
  saved: boolean;
  onSave: () => void;
  onArrival: (arrival: Arrival) => void;
  now: Date;
}) {
  const open = isMetroOperating(now);
  const hours = getMetroServiceWindow(now);
  return (
    <div className="station-detail metro-station-detail">
      <header className="metro-station-heading">
        <div className="metro-station-title">
          <h2>{station.name}</h2>
          <span>
            {station.lineIds.map((lineId) => (
              <LineBadge key={lineId} id={lineId} />
            ))}
          </span>
        </div>
        <StationActions
          key={station.id}
          station={{ ...station, kind: 'metro', stopId: `metro:${station.id}` }}
          saved={saved}
          onSave={onSave}
          saveLabel="Guardar esta estación"
        />
      </header>
      {!open && (
        <p className="metro-closed">
          <Clock3 size={17} aria-hidden="true" />
          <strong>Fuera de horario</strong>
          <span>Abre {getNextMetroOpening(now)}</span>
        </p>
      )}
      <section className="panel metro-station-outlook">
        <div className="metro-section-title">
          <h3>Afluencia</h3>
          <details className="metro-data-disclosure">
            <summary aria-label="Información de afluencia y horarios">
              <Info size={19} aria-hidden="true" />
            </summary>
            <div>
              <p>Afluencia y llegadas simuladas. No son datos en vivo.</p>
              <p>
                Horario general: {hours.opens}–{hours.closes}. No confirma el servicio de esta
                estación.
              </p>
              <p>
                24 y 31 de diciembre: cierre a las 23:00. 25 de diciembre y 1 de enero: apertura a
                las 07:00.
              </p>
              <a href={metroHoursSource} target="_blank" rel="noopener noreferrer">
                Fuente: Metrorrey · consulta 24 oct 2026
              </a>
            </div>
          </details>
        </div>
        {board ? (
          <Forecast data={board.forecast} compact serviceDate={board.generatedAt} />
        ) : (
          <p role="status">Cargando…</p>
        )}
      </section>
      <div className="metro-station-meta">
        <details className="metro-facilities">
          <summary>
            <Accessibility size={18} aria-hidden="true" />
            <span>Accesibilidad</span>
            <Info size={15} aria-hidden="true" />
          </summary>
          <div>
            <p>
              Elevadores y escaleras eléctricas: disponibilidad por confirmar. El inventario
              publicado no indica su funcionamiento actual.
            </p>
            <a href={metroHoursSource} target="_blank" rel="noopener noreferrer">
              Consultar Metrorrey
            </a>
          </div>
        </details>
        <span>{station.municipality}</span>
      </div>
      {open && (
        <section className="panel station-arrivals metro-arrivals">
          <div className="metro-section-title">
            <h3>Próximas unidades</h3>
          </div>
          {board?.arrivals.slice(0, 4).map((arrival) => (
            <ArrivalCard key={arrival.id} arrival={arrival} onDetails={() => onArrival(arrival)} />
          ))}
          {!board && <p role="status">Cargando…</p>}
        </section>
      )}
    </div>
  );
}
