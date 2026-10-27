import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './mapSheet.css';

export type SheetSize = 'peek' | 'half' | 'full';
const sizes: SheetSize[] = ['peek', 'half', 'full'];
const dragThreshold = 30;
const syntheticClickWindow = 600;

/** A nonmodal sheet: the map remains usable, with drag and keyboard equivalents. */
export default function MapSheet({
  title,
  size,
  onSizeChange,
  children,
  actions,
}: {
  title: string;
  size: SheetSize;
  onSizeChange: (size: SheetSize) => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const id = useId();
  const handle = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const dragClick = useRef<{ id: number; endedAt: number } | null>(null);

  useEffect(() => {
    if (size === 'peek' && body.current?.contains(document.activeElement)) handle.current?.focus();
  }, [size]);
  useEffect(() => {
    // A removed form/result button otherwise leaves keyboard focus on the body.
    // Preserve a search input or map control that already holds focus.
    if (document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, [title]);

  function changeSize(next: SheetSize) {
    if (next !== size) onSizeChange(next);
  }
  function resize(direction: number) {
    changeSize(sizes[Math.max(0, Math.min(2, sizes.indexOf(size) + direction))]);
  }
  function releasePointer(target: HTMLButtonElement, pointerId: number) {
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
  }
  return (
    <section className="map-sheet" data-size={size} aria-label={title}>
      <span id={`${id}-keys`} className="sr-only">
        Flechas arriba y abajo para ajustar el panel. Inicio para reducirlo y Fin para ampliarlo.
      </span>
      <button
        ref={handle}
        type="button"
        className="map-sheet-handle"
        aria-label={size === 'peek' ? 'Ampliar panel' : 'Reducir panel'}
        aria-controls={id}
        aria-describedby={`${id}-keys`}
        aria-expanded={size !== 'peek'}
        onClick={(event) => {
          const dragged = dragClick.current;
          dragClick.current = null;
          const pointerId = (event.nativeEvent as PointerEvent).pointerId;
          if (
            dragged &&
            event.detail > 0 &&
            (!Number.isFinite(pointerId) || pointerId === dragged.id) &&
            event.timeStamp >= dragged.endedAt &&
            event.timeStamp - dragged.endedAt <= syntheticClickWindow
          ) {
            // Only swallow this gesture's click. Keyboard clicks and new taps still work.
            event.preventDefault();
            return;
          }
          changeSize(size === 'full' ? 'half' : size === 'half' ? 'peek' : 'half');
        }}
        onKeyDown={(event) => {
          // A canceled drag must never swallow an accessible keyboard activation.
          dragClick.current = null;
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          gesture.current = null;
          if (event.key === 'Home') changeSize('peek');
          else if (event.key === 'End') changeSize('full');
          else resize(event.key === 'ArrowUp' ? 1 : -1);
        }}
        onPointerDown={(event) => {
          dragClick.current = null;
          if (event.button !== 0 || event.isPrimary === false) return;
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          };
          // Some WebViews expose the method but reject capture for an ended pointer.
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            /* optional */
          }
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start || start.id !== event.pointerId) return;
          if (
            Math.max(Math.abs(event.clientY - start.y), Math.abs(event.clientX - start.x)) >
            dragThreshold
          )
            start.moved = true;
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          if (!start || start.id !== event.pointerId) return;
          gesture.current = null;
          releasePointer(event.currentTarget, event.pointerId);
          const distance = event.clientY - start.y;
          const horizontal = Math.abs(event.clientX - start.x);
          if (start.moved || Math.max(Math.abs(distance), horizontal) > dragThreshold) {
            // Prevent the synthetic click from also toggling the chosen snap point.
            event.preventDefault();
            if (Math.abs(distance) > dragThreshold && Math.abs(distance) > horizontal)
              resize(distance < 0 ? 1 : -1);
            dragClick.current = { id: event.pointerId, endedAt: event.timeStamp };
          }
        }}
        onPointerCancel={(event) => {
          if (gesture.current?.id === event.pointerId) {
            gesture.current = null;
            dragClick.current = null;
            releasePointer(event.currentTarget, event.pointerId);
          }
        }}
        onLostPointerCapture={(event) => {
          if (gesture.current?.id === event.pointerId) gesture.current = null;
        }}
      >
        <span className="map-sheet-grip" aria-hidden="true" />
        {size === 'peek' ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </button>
      <header className="map-sheet-heading">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        {actions}
      </header>
      <div ref={body} id={id} className="map-sheet-body" hidden={size === 'peek'}>
        {children}
      </div>
    </section>
  );
}
