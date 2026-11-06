import { useMemo, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { network } from '../api';
import { networkLabel } from '../mobility/networks';
import type { HomeCandidate, HomeSelection } from './homeTypes';
import TransportIllustration from './TransportIllustration';

export const homeSelectionKey = (selection: HomeSelection) =>
  selection.kind === 'metro' ? `metro:${selection.stationId}` : `bus:${selection.route.id}`;
export function homeSelectionName(selection: HomeSelection) {
  return selection.kind === 'metro'
    ? network.stations.find((station) => station.id === selection.stationId)?.name || 'Tu estación'
    : `${selection.route.code} · ${selection.route.name}`;
}

export default function HomeTransportSelector({
  selection,
  candidates = [],
  onSelect,
  onOpenPicker,
  onInteraction,
}: {
  selection: HomeSelection;
  candidates?: HomeCandidate[];
  onSelect: (selection: HomeSelection) => void;
  onOpenPicker: () => void;
  onInteraction?: () => void;
}) {
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const currentKey = homeSelectionKey(selection);
  const options = useMemo(() => {
    const seen = new Set<string>();
    const unique = candidates.slice(0, 8).filter((candidate) => {
      const key = homeSelectionKey(candidate.selection);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!seen.has(currentKey)) unique.unshift({ selection });
    return unique;
  }, [candidates, currentKey, selection]);
  const index = options.findIndex(
    (candidate) => homeSelectionKey(candidate.selection) === currentKey,
  );
  const current = options[index];
  const distanceApplies =
    selection.kind === 'metro' ||
    (current?.selection.kind === 'bus' && current.selection.stopId === selection.stopId);
  const station =
    selection.kind === 'metro'
      ? network.stations.find((item) => item.id === selection.stationId)
      : null;
  const label = homeSelectionName(selection);
  function move(next: number) {
    if (next < 0 || next >= options.length || next === index) return;
    onInteraction?.();
    onSelect({ ...options[next].selection, source: 'manual' });
  }
  return (
    <section
      className="home-context-selector"
      aria-label="Tu transporte"
      onKeyDown={(event) => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        move(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : index + (event.key === 'ArrowRight' ? 1 : -1),
        );
      }}
      onPointerDown={(event) => {
        swiped.current = false;
        onInteraction?.();
        pointer.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onPointerUp={(event) => {
        const start = pointer.current;
        pointer.current = null;
        if (!start) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          swiped.current = true;
          move(index + (dx < 0 ? 1 : -1));
        }
      }}
      onClickCapture={(event) => {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        className="home-context-arrow"
        aria-label="Anterior transporte"
        disabled={index <= 0}
        onClick={() => move(index - 1)}
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        className="home-context-vehicle"
        aria-label={`Cambiar transporte: ${label}`}
        onClick={onOpenPicker}
      >
        <TransportIllustration kind={selection.kind} />
        <span className="home-context-change">
          <ChevronDown size={13} />
        </span>
      </button>
      <div className="home-context-copy">
        <span className="home-context-system">
          {selection.kind === 'metro' ? 'METRO' : networkLabel(selection.route.networkId)}
        </span>
        <h2>{label}</h2>
        {station && (
          <span className="home-context-lines">
            {station.lineIds.map((lineId) => lineId.replace('L', 'Línea ')).join(' · ')}
          </span>
        )}
        <p>
          {selection.source === 'base'
            ? 'Tu estación'
            : selection.source === 'nearby'
              ? 'Cercanía en línea recta'
              : 'Elegido por ti'}
          {distanceApplies && typeof current?.distanceMeters === 'number'
            ? ` · ${Math.round(current.distanceMeters)} m${current.approximate ? ' aprox.' : ''} en línea recta`
            : ''}
        </p>
        <span className="home-context-count">
          {index + 1} de {options.length}
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={onOpenPicker}>
            Cambiar
          </button>
        </span>
      </div>
      <button
        type="button"
        className="home-context-arrow"
        aria-label="Siguiente transporte"
        disabled={index >= options.length - 1}
        onClick={() => move(index + 1)}
      >
        <ChevronRight size={20} />
      </button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {label}, {index + 1} de {options.length}
      </span>
    </section>
  );
}
