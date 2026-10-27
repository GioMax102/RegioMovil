import {
  ArrowLeftRight,
  BusFront,
  ChevronRight,
  Clock3,
  Footprints,
  Users,
  TrainFront,
} from 'lucide-react';
import type { Preference } from '../types';
import type { MobilityJourney, MobilityPlan } from './types';

export type TransportFilter = 'all' | 'metro' | 'bus' | 'combined';
export function matchesTransport(journey: MobilityJourney, filter: TransportFilter) {
  const metro = journey.steps.some((step) => step.mode === 'metro');
  const bus = journey.steps.some((step) => step.mode === 'bus');
  return (
    filter === 'all' ||
    (filter === 'metro' ? metro && !bus : filter === 'bus' ? bus && !metro : metro && bus)
  );
}
export default function JourneyOptions({
  plan,
  preference,
  onPreference,
  filter,
  onFilter,
  onSelect,
  busy,
}: {
  plan: MobilityPlan;
  preference: Preference;
  onPreference: (value: Preference) => void;
  filter: TransportFilter;
  onFilter: (value: TransportFilter) => void;
  onSelect: (journey: MobilityJourney) => void;
  busy: boolean;
}) {
  const visible = plan.journeys.filter((journey) => matchesTransport(journey, filter));
  return (
    <div className="mobility-results" aria-label="Resultados multimodales" aria-busy={busy}>
      <div className="mobility-priority-row" role="group" aria-label="Tu prioridad">
        {(
          [
            ['fastest', 'Menos tiempo', Clock3],
            ['comfortable', 'Menos afluencia', Users],
            ['accessible', 'Menos transbordos', ArrowLeftRight],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            aria-pressed={preference === id}
            onClick={() => onPreference(id)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div
        className="mobility-result-filters"
        role="group"
        aria-label="Filtrar rutas por transporte"
      >
        {(
          [
            ['all', 'Todas'],
            ['metro', 'Metro'],
            ['bus', 'Autobús'],
            ['combined', 'Metro + autobús'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => onFilter(id)}>
            {label}
            <span>{plan.journeys.filter((journey) => matchesTransport(journey, id)).length}</span>
          </button>
        ))}
      </div>
      {busy && (
        <p className="mobility-feedback" role="status">
          Actualizando rutas…
        </p>
      )}
      {!visible.length && (
        <p className="mobility-feedback" role="status">
          {plan.journeys.length ? 'Sin opciones con este filtro.' : 'No encontramos una conexión.'}
        </p>
      )}
      {visible.map((journey, index) => (
        <button
          type="button"
          key={journey.id}
          className="mobility-result"
          data-journey-id={journey.id}
          aria-label={`Ver conexión ${index + 1}: ${journey.durationMinutes} minutos, ${journey.transfers} ${journey.transfers === 1 ? 'transbordo' : 'transbordos'}. ${journey.steps
            .filter((step) => step.mode !== 'walk')
            .map((step) => step.lineName)
            .join(', ')}`}
          onClick={() => onSelect(journey)}
        >
          <span className="mobility-result-time">
            <strong>
              {journey.durationMinutes}
              <small> min</small>
            </strong>
            {journey === plan.journeys[0] && <span>Recomendada</span>}
          </span>
          <span className="mobility-modes" aria-label="Servicios de esta ruta">
            {journey.steps
              .filter((step) => step.mode !== 'walk')
              .map((step, stepIndex) => (
                <span key={stepIndex} className={`mobility-mode ${step.mode}`}>
                  {step.mode === 'metro' ? (
                    <TrainFront size={16} aria-hidden="true" />
                  ) : (
                    <BusFront size={16} aria-hidden="true" />
                  )}
                  <span title={step.lineName}>
                    {step.mode === 'bus' ? step.lineName : step.code || step.lineName}
                  </span>
                </span>
              ))}
          </span>
          <span className="mobility-result-metrics">
            <span>
              <ArrowLeftRight size={14} aria-hidden="true" />
              {journey.transfers === 0
                ? 'Directo'
                : `${journey.transfers} ${journey.transfers === 1 ? 'cambio' : 'cambios'}`}
            </span>
            <span>
              <Footprints size={14} aria-hidden="true" />
              {journey.walkingMinutes} min
            </span>
            <span>
              <Users size={14} aria-hidden="true" />
              {journey.occupancy}%
            </span>
          </span>
          <ChevronRight size={20} className="mobility-result-chevron" aria-hidden="true" />
        </button>
      ))}
      <details className="mobility-method mobility-result-method">
        <summary>Información y cobertura</summary>
        <p>Tiempos y afluencia simulados. Caminatas aproximadas. {plan.message}</p>
        {plan.coverage && (
          <p>Hasta {plan.coverage.alternativesLimit} combinaciones por búsqueda.</p>
        )}
        {plan.diagnostics.truncated && (
          <p>Se alcanzó el límite de cálculo; puede haber otras opciones.</p>
        )}
      </details>
    </div>
  );
}
