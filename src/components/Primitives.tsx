import { useEffect, useRef, type ReactNode } from 'react';
import { X, Users, TrainFront, Snowflake, CircleHelp } from 'lucide-react';
import { network } from '../api';
import type { Arrival } from '../types';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path
          d="m7 27 10-16 6 9 5-6 6 13"
          stroke="#edf3dc"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 29h15" stroke="#d8bc71" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span>
          Regio<span className="brand-light">Móvil</span>
          <small>TU CIUDAD, A TU RITMO</small>
        </span>
      )}
    </span>
  );
}
export function LineBadge({ id }: { id: string }) {
  const line = network.lines.find((l) => l.id === id);
  return (
    <span
      className="line-badge"
      style={{ '--line': line?.color ?? '#2b6b50' } as React.CSSProperties}
    >
      {id.replace('L', 'Línea ')}
    </span>
  );
}
export function Occupancy({ value, label }: { value: number; label?: string }) {
  return (
    <span className={`occupancy ${value >= 75 ? 'high' : value >= 45 ? 'medium' : 'low'}`}>
      <Users size={14} />
      {label ??
        (value >= 75 ? 'Alta afluencia' : value >= 45 ? 'Afluencia media' : 'Poca afluencia')}
    </span>
  );
}
export function ArrivalCard({ arrival, onDetails }: { arrival: Arrival; onDetails: () => void }) {
  return (
    <button
      className="arrival-card"
      onClick={onDetails}
      aria-label={`${arrival.lineName} hacia ${arrival.direction}, llegada simulada en ${arrival.etaRange[0]} a ${arrival.etaRange[1]} minutos. Afluencia simulada ${arrival.occupancyLabel}. Aire acondicionado simulado: ${arrival.climate === 'working' ? 'funcionando' : arrival.climate === 'unavailable' ? 'no disponible' : 'sin información'}. Ver detalles.`}
    >
      <div className="arrival-top">
        <span className="train-icon">
          <TrainFront size={19} />
        </span>
        <div>
          <span className="arrival-badges">
            <LineBadge id={arrival.lineId} />
            <small>Simulación</small>
          </span>
          <h3>Hacia {arrival.direction}</h3>
        </div>
        <span className="arrival-time">
          <strong>{Math.round(arrival.etaMinutes)}</strong>
          <small>min aprox.</small>
        </span>
      </div>
      <div className="arrival-bottom">
        <Occupancy value={arrival.occupancy} />
        <span className="climate">
          {arrival.climate === 'working' ? <Snowflake size={14} /> : <CircleHelp size={14} />}{' '}
          {arrival.climate === 'working'
            ? 'Con clima'
            : arrival.climate === 'unavailable'
              ? 'Sin clima'
              : 'Clima sin dato'}
        </span>
      </div>
    </button>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar ventana">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Forecast({
  data,
  compact = false,
}: {
  data: { hour: string; occupancy: number }[];
  compact?: boolean;
}) {
  const items = data.slice(0, compact ? 6 : 10);
  const lowestOccupancy = Math.min(...items.map((item) => item.occupancy));
  return (
    <div
      className={`forecast ${compact ? 'compact' : ''}`}
      role="img"
      aria-label={`Afluencia simulada por hora: ${items.map((v) => `${v.hour}, ${v.occupancy}%`).join('; ')}`}
    >
      <div className="forecast-bars">
        {items.map((item, i) => (
          <div className="forecast-column" key={`${item.hour}-${i}`}>
            <span className="bar-value">{Math.round(item.occupancy)}%</span>
            <div className="bar-track">
              <div
                className={`bar-fill ${item.occupancy >= 75 ? 'busy' : ''} ${item.occupancy === lowestOccupancy ? 'current least-crowded' : ''}`}
                style={{ height: `${Math.max(item.occupancy, 4)}%` }}
              />
            </div>
            <span className="bar-hour">{item.hour}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
