import { lazy, Suspense, useEffect, useRef } from 'react';
import { Clock3, Info, Accessibility } from 'lucide-react';
import { network } from '../api';
import { ArrivalCard, Forecast, LineBadge } from './Primitives';
import StationActions from './StationActions';
import PublicReports from './DeferredReports';
import {
  getMetroServiceWindow,
  getNextMetroOpening,
  isMetroOperating,
  metroHoursSource,
} from './metroServiceHours';
import type { Arrival, Board, Station } from '../types';
import './metroStationDetail.css';

const NetworkMap = lazy(() => import('./NetworkMap'));

export default function MetroStationDetail({
  station,
  board,
  saved,
  onSave,
  onArrival,
  now,
  onReport,
  onSelectStation,
}: {
  station: Station;
  board: Board | null;
  saved: boolean;
  onSave: () => void;
  onArrival: (arrival: Arrival) => void;
  now: Date;
  onReport?: () => void;
  onSelectStation?: (stationId: string) => void;
}) {
  const open = isMetroOperating(now);
  const hours = getMetroServiceWindow(now);
  const line = network.lines.find((item) => station.lineIds.includes(item.id));
  const lineStations =
    line?.stationIds
      .map((id) => network.stations.find((item) => item.id === id))
      .filter((item): item is Station => !!item) ?? [];
  const currentIndex = lineStations.findIndex((item) => item.id === station.id);
  const sequenceRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    sequenceRef.current?.querySelector<HTMLElement>('[aria-current="location"]')?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [station.id]);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
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
      {line && lineStations.length > 1 && (
        <section className="metro-line-context" aria-label={`Estaciones de ${line.name}`}>
          <div className="metro-line-context-heading">
            <strong>{line.name}</strong>
            <span>
              {currentIndex + 1} de {lineStations.length} · {lineStations[0].name} a{' '}
              {lineStations.at(-1)?.name}
            </span>
          </div>
          <div
            className="metro-station-sequence"
            ref={sequenceRef}
            role="list"
            aria-label={`Estaciones en sentido ${lineStations[0].name} a ${lineStations.at(-1)?.name}`}
            onScroll={(event) => {
              const container = event.currentTarget;
              clearTimeout(scrollTimer.current);
              scrollTimer.current = setTimeout(() => {
                const center = container.getBoundingClientRect().left + container.clientWidth / 2;
                const nearest = [
                  ...container.querySelectorAll<HTMLButtonElement>('button[data-station-id]'),
                ].sort(
                  (a, b) =>
                    Math.abs(a.getBoundingClientRect().left + a.offsetWidth / 2 - center) -
                    Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - center),
                )[0];
                if (nearest?.dataset.stationId && nearest.dataset.stationId !== station.id)
                  onSelectStation?.(nearest.dataset.stationId);
              }, 80);
            }}
          >
            {lineStations.map((item, index) => (
              <button
                key={item.id}
                data-station-id={item.id}
                type="button"
                role="listitem"
                aria-current={item.id === station.id ? 'location' : undefined}
                aria-label={`${item.name}${item.id === station.id ? ', estación actual' : index < currentIndex ? ', estación anterior' : ', estación siguiente'}`}
                onClick={() => onSelectStation?.(item.id)}
              >
                <span className="metro-station-sequence-dot" />
                <span>{item.name}</span>
                {item.id === station.id && <small>Seleccionada</small>}
              </button>
            ))}
          </div>
          <div className="metro-station-focus-map" aria-label={`Mapa centrado en ${station.name}`}>
            <Suspense fallback={<p role="status">Cargando mapa de estación…</p>}>
              <NetworkMap
                key={station.id}
                network={network}
                selected={station.id}
                focusStationId={station.id}
                highlighted={[line.id]}
              />
            </Suspense>
          </div>
        </section>
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
      <PublicReports stationId={station.id} onReport={onReport} />
    </div>
  );
}
