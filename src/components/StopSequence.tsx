import { useEffect, useRef } from 'react';
import './stopSequence.css';

export type SequenceStop = { id: string; name: string };

/** Compact, shared line view. Selection and the map are driven by the same stop ID. */
export default function StopSequence({
  label,
  stops,
  selectedId,
  onSelect,
  numbered = false,
  className = '',
}: {
  label: string;
  stops: SequenceStop[];
  selectedId: string;
  onSelect: (id: string) => void;
  numbered?: boolean;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const index = stops.findIndex((stop) => stop.id === selectedId);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-current="location"]')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedId]);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  return (
    <section className={`stop-sequence ${className}`.trim()} aria-label={`${label}: paradas`}>
      <header className="metro-line-context-heading">
        <strong>{label}</strong>
        <span>{index >= 0 ? `${index + 1} de ${stops.length}` : `${stops.length} paradas`}</span>
      </header>
      <div
        className="stop-sequence-track metro-station-sequence"
        ref={list}
        role="group"
        aria-label={label}
        onScroll={(event) => {
          const track = event.currentTarget;
          clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => {
            const center = track.getBoundingClientRect().left + track.clientWidth / 2;
            const nearest = [...track.querySelectorAll<HTMLButtonElement>('button')].sort(
              (a, b) =>
                Math.abs(a.getBoundingClientRect().left + a.offsetWidth / 2 - center) -
                Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - center),
            )[0];
            if (nearest && nearest.dataset.stopId !== selectedId) onSelect(nearest.dataset.stopId!);
          }, 110);
        }}
      >
        {stops.map((stop, position) => (
          <button
            key={stop.id}
            data-stop-id={stop.id}
            data-station-id={stop.id}
            type="button"
            aria-current={stop.id === selectedId ? 'location' : undefined}
            aria-label={`${numbered ? `Parada ${position + 1}: ` : ''}${stop.name}${stop.id === selectedId ? ', seleccionada' : ''}`}
            onClick={() => onSelect(stop.id)}
          >
            <span className="stop-sequence-dot metro-station-sequence-dot" aria-hidden="true" />
            <span>{numbered ? position + 1 : stop.name}</span>
            {stop.id === selectedId && <small>Actual</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
