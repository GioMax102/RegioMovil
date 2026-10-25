import { Accessibility, Info, ShieldCheck, Snowflake, Users } from 'lucide-react';
import { Dialog, LineBadge } from './Primitives';
import type { Arrival } from '../types';
import './arrivalDetails.css';

export default function ArrivalDetails({
  arrival,
  onClose,
}: {
  arrival: Arrival;
  onClose: () => void;
}) {
  return (
    <Dialog title="Conoce esta unidad" onClose={onClose}>
      <section className="arrival-detail-summary" aria-label="Llegada simulada">
        <div>
          <LineBadge id={arrival.lineId} />
          <span className="arrival-detail-simulation">Simulación</span>
        </div>
        <h3>Hacia {arrival.direction}</h3>
        <p>
          <strong>
            {arrival.etaRange[0]}–{arrival.etaRange[1]}
          </strong>
          <span>min aprox.</span>
        </p>
      </section>
      <dl className="arrival-detail-facts">
        <div>
          <dt>
            <Users size={19} />
            Afluencia simulada
          </dt>
          <dd>
            {Math.round(arrival.occupancy)}% · {arrival.occupancyLabel}
          </dd>
        </div>
        <div>
          <dt>
            <Snowflake size={19} />
            Aire acondicionado simulado
          </dt>
          <dd>
            {arrival.climate === 'working'
              ? 'Funcionando'
              : arrival.climate === 'unavailable'
                ? 'No disponible'
                : 'Sin información'}
          </dd>
        </div>
        <div>
          <dt>
            <ShieldCheck size={19} />
            Condición simulada
          </dt>
          <dd>
            {arrival.condition === 'good'
              ? 'Sin incidencia en el escenario'
              : 'Con observación en el escenario'}
          </dd>
        </div>
        <div>
          <dt>
            <Accessibility size={19} />
            Accesibilidad real
          </dt>
          <dd>Sin verificar</dd>
        </div>
      </dl>
      <details className="arrival-detail-info">
        <summary>
          <Info size={18} />
          Información de la simulación
        </summary>
        <p>
          No representa una unidad real ni confirma su estado. El intervalo es orientativo; el
          modelo se entrenó y evaluó con datos sintéticos.
        </p>
      </details>
    </Dialog>
  );
}
