import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, Users, TrainFront, Snowflake, CircleHelp, ChevronRight, Clock3 } from 'lucide-react';
import { network } from '../api';
import type { Arrival } from '../types';

// A native modal blocks focus/clicks outside it, but mobile browsers can still scroll
// its document. Keep one document lock until the final nested dialog has closed.
const dialogScrollLocks = new WeakMap<Document, { count: number; restore: () => void }>();
function lockDialogScroll(dialog: HTMLDialogElement) {
  const doc = dialog.ownerDocument;
  const existing = dialogScrollLocks.get(doc);
  if (existing) existing.count += 1;
  else {
    const view = doc.defaultView!;
    const { body, documentElement: root } = doc;
    const scrollX = view.scrollX;
    const scrollY = view.scrollY;
    const properties = [
      [root, ['overflow', 'overscroll-behavior', 'scroll-behavior']],
      [body, ['position', 'top', 'left', 'width', 'overflow', 'padding-right']],
    ] as const;
    const original = properties.flatMap(([element, names]) =>
      names.map((name) => ({
        element,
        name,
        value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name),
      })),
    );
    const scrollbar = root.clientWidth ? Math.max(0, view.innerWidth - root.clientWidth) : 0;
    if (scrollbar)
      body.style.paddingRight = `${parseFloat(view.getComputedStyle(body).paddingRight || '0') + scrollbar}px`;
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    dialogScrollLocks.set(doc, {
      count: 1,
      restore() {
        for (const { element, name, value, priority } of original) {
          if (value) element.style.setProperty(name, value, priority);
          else element.style.removeProperty(name);
        }
        // Returning from a fixed body must not animate a page with smooth scrolling.
        root.style.scrollBehavior = 'auto';
        view.scrollTo(scrollX, scrollY);
        const scrollBehavior = original.find((item) => item.name === 'scroll-behavior')!;
        if (scrollBehavior.value)
          root.style.setProperty('scroll-behavior', scrollBehavior.value, scrollBehavior.priority);
        else root.style.removeProperty('scroll-behavior');
      },
    });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const lock = dialogScrollLocks.get(doc);
    if (lock && --lock.count === 0) {
      dialogScrollLocks.delete(doc);
      lock.restore();
    }
  };
}

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
      <Users size={14} aria-hidden="true" />
      {label ??
        (value >= 75 ? 'Alta afluencia' : value >= 45 ? 'Afluencia media' : 'Poca afluencia')}
    </span>
  );
}
export function ArrivalCard({ arrival, onDetails }: { arrival: Arrival; onDetails: () => void }) {
  return (
    <button
      className="arrival-card arrival-card-refined"
      type="button"
      onClick={onDetails}
      aria-label={`${arrival.lineName} hacia ${arrival.direction}, llegada simulada en ${arrival.etaRange[0]} a ${arrival.etaRange[1]} minutos. Afluencia simulada ${arrival.occupancyLabel}. Aire acondicionado simulado: ${arrival.climate === 'working' ? 'funcionando' : arrival.climate === 'unavailable' ? 'no disponible' : 'sin información'}. Ver detalles.`}
    >
      <div className="arrival-top">
        <span className="train-icon" aria-hidden="true">
          <TrainFront size={21} />
        </span>
        <div>
          <span className="arrival-badges">
            <LineBadge id={arrival.lineId} />
            <small>Simulación</small>
          </span>
          <h3>
            <span className="arrival-direction-label">Hacia</span> {arrival.direction}
          </h3>
        </div>
        <ChevronRight className="arrival-details-arrow" size={20} aria-hidden="true" />
      </div>
      <div className="arrival-estimate">
        <span className="arrival-estimate-label">
          <Clock3 size={16} aria-hidden="true" /> Llegada estimada
        </span>
        <span className="arrival-time">
          <strong>
            {arrival.etaRange[0]}–{arrival.etaRange[1]}
          </strong>
          <small>min</small>
        </span>
      </div>
      <div className="arrival-bottom">
        <span
          className={`arrival-metric arrival-crowding ${arrival.occupancy >= 75 ? 'is-busy' : ''}`}
        >
          <span className="arrival-metric-label">Afluencia</span>
          <Occupancy
            value={arrival.occupancy}
            label={arrival.occupancy >= 75 ? 'Alta' : arrival.occupancy >= 45 ? 'Media' : 'Baja'}
          />
        </span>
        <span className="arrival-metric arrival-cooling">
          <span className="arrival-metric-label">Aire acondicionado</span>
          <span className="climate">
            {arrival.climate === 'working' ? (
              <Snowflake size={15} aria-hidden="true" />
            ) : (
              <CircleHelp size={15} aria-hidden="true" />
            )}
            {arrival.climate === 'working'
              ? 'Disponible'
              : arrival.climate === 'unavailable'
                ? 'No disponible'
                : 'Sin información'}
          </span>
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
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const unlockScroll = lockDialogScroll(dialog);
    try {
      dialog.showModal();
      // React's mount-time focus can precede the native dialog focus steps.
      // Apply the explicit search target after opening, without scrolling the page.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    } catch (error) {
      unlockScroll();
      throw error;
    }
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.close();
      unlockScroll();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''} ${className}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
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
