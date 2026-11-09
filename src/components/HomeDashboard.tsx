import { useState } from 'react';
import { ArrowRight, Bookmark, ChevronDown, Clock3, Flag, Info, MapPin, Users } from 'lucide-react';
import { network } from '../api';
import type { Arrival, Board, Station } from '../types';
import type { SavedMobilityTrip } from '../mobility/types';
import { ArrivalCard, Forecast, LineBadge } from './Primitives';
import type { HomeSelection, HomeUiState } from './homeTypes';
import type { PositionFix } from '../mobility/location';
import type { RegionalView } from '../mobility/regionalViewport';
import { homeMetroArrivals } from './homeMetroArrivals';
import {
  filterMetroForecast,
  getMetroServiceWindow,
  getNextMetroOpening,
  isMetroOperating,
  metroHoursSource,
} from './metroServiceHours';
import DeferredSection from './DeferredSection';
import './homeDashboard.css';

const loadHomeTransportHub = () => import('./HomeTransportHub');
const loadHomeTransportTools = () =>
  import('./HomeTransportHub').then((module) => ({
    default: module.HomeTransportTools,
  }));

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
  onNetwork,
  onChooseStation,
  onSelectStation,
  onReportTarget,
  selection,
  onSelect,
  onPlan,
  onSaved,
  mapViews,
  uiState,
  reportOpen = false,
  now = new Date(),
}: {
  station: Station;
  board: Board | null;
  loading: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onArrival: (arrival: Arrival) => void;
  onNetwork?: (selection: HomeSelection) => void;
  onSaved?: () => void;
  onSavedTrip?: (trip: SavedMobilityTrip) => void;
  onStationDetails: () => void;
  onReport: () => void;
  onChooseStation?: () => void;
  onSelectStation?: (id: string) => void;
  onReportTarget?: (target: { stationId?: string; routeId?: string }) => void;
  selection?: HomeSelection;
  onSelect?: (selection: HomeSelection) => void;
  onPlan?: (selection: HomeSelection) => void;
  mapViews?: Map<string, RegionalView>;
  uiState?: HomeUiState;
  reportOpen?: boolean;
  now?: Date;
}) {
  const [nearbyPosition, setNearbyPosition] = useState<PositionFix | null>(null);
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
  const current: HomeSelection = selection ?? {
    kind: 'metro',
    stationId: station.id,
    source: 'base',
  };
  const lineId =
    current.kind === 'metro' && station.lineIds.includes(current.lineId ?? '')
      ? current.lineId!
      : station.lineIds[0];
  const nextArrivals = homeMetroArrivals(board?.arrivals ?? [], lineId);
  const reportAction = (
    <button
      type="button"
      className="home-report-cta"
      aria-label="Crear o continuar reporte"
      onClick={onReport}
    >
      <span className="home-report-icon">
        <Flag size={23} aria-hidden="true" />
      </span>
      <span>
        <strong>Mejoremos nuestro transporte</strong>
        <span>Crear o continuar reporte</span>
      </span>
      <ArrowRight size={20} aria-hidden="true" />
    </button>
  );
  const metroContent = (
    <>
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
        {station.lineIds.length > 1 && (
          <div
            className="home-line-options"
            role="group"
            aria-label="Línea para consultar llegadas"
          >
            {station.lineIds.map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={id === lineId}
                onClick={() =>
                  onSelect?.({ kind: 'metro', stationId: station.id, lineId: id, source: 'manual' })
                }
              >
                <LineBadge id={id} />
              </button>
            ))}
          </div>
        )}
        <div className="arrival-list" aria-busy={loading}>
          {!open ? (
            <p className="home-service-closed" role="status">
              <Clock3 size={18} aria-hidden="true" />
              <strong>Fuera de horario</strong>
              <span>Abre {getNextMetroOpening(now)}</span>
            </p>
          ) : board ? (
            nextArrivals.length ? (
              nextArrivals.map((arrival) => (
                <ArrivalCard key={arrival.id} arrival={arrival} onDetails={() => onArrival(arrival)} />
              ))
            ) : (
              <p role="status">No hay llegadas disponibles para esta línea.</p>
            )
          ) : (
            <p role="status">Preparando tu camino…</p>
          )}
        </div>
        <button type="button" className="all-arrivals" onClick={onStationDetails}>
          Ver estación
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>
      <details className="panel home-outlook" open>
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
      </details>
    </>
  );
  return (
    <div className="home-dashboard">
      <DeferredSection
        load={loadHomeTransportTools}
        loadingLabel="Preparando el selector…"
        onRetry={() => location.reload()}
        loadingFallback={
          <button
            type="button"
            className="home-selector-fallback"
            onClick={onChooseStation ?? onStationDetails}
          >
            <MapPin size={21} aria-hidden="true" />
            {current.kind === 'metro' ? station.name : current.route.name}
          </button>
        }
        errorFallback={
          <button
            type="button"
            className="home-selector-fallback"
            onClick={onChooseStation ?? onStationDetails}
          >
            Cambiar estación · {station.name}
          </button>
        }
        componentProps={{
          selection: current,
          onSelect:
            onSelect ??
            ((next: HomeSelection) => {
              if (next.kind === 'metro') onSelectStation?.(next.stationId);
            }),
          reportOpen,
          uiState,
          onNearbyPosition: setNearbyPosition,
        }}
      />
      {current.kind === 'metro' && metroContent}
      <DeferredSection
        load={loadHomeTransportHub}
        loadingLabel="Preparando tus opciones…"
        onRetry={() => location.reload()}
        loadingFallback={reportAction}
        errorFallback={
          <>
            <p role="alert">
              La vista de recorridos no está disponible. Puedes consultar tu estación y crear un
              reporte.
            </p>
            {reportAction}
            <button type="button" className="text-button" onClick={() => location.reload()}>
              Volver a cargar inicio
            </button>
          </>
        }
        componentProps={{
          selection: current,
          onSelect: onSelect ?? (() => {}),
          onNetwork: onNetwork ?? onStationDetails,
          onPlan: onPlan ?? (() => {}),
          onSaved: onSaved ?? (() => {}),
          onReportTarget: onReportTarget ?? onReport,
          onReportGeneral: onReport,
          reportOpen,
          onSavedTrip,
          mapViews,
          uiState,
          nearbyPosition,
        }}
      />
      {current.kind === 'metro' && (
        <details className="home-data-info">
          <summary>
            <Info size={17} aria-hidden="true" />
            <span>Datos y fuentes</span>
          </summary>
          <p>
            Llegadas y afluencia son estimaciones de demostración, no información en tiempo real.
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
      )}
    </div>
  );
}
