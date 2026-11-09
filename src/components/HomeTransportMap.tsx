import { useMemo } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { projectHomePreview, type HomeCoordinates, type HomePoint } from './homeTransport';

export default function HomeTransportMap({
  segments,
  marker,
  line,
  name,
  onNetwork,
  currentPosition,
}: {
  segments: HomeCoordinates[][];
  marker?: HomePoint;
  line?: string;
  name: string;
  onNetwork?: () => void;
  currentPosition?: { lat: number; lng: number; accuracy?: number } | null;
}) {
  const preview = useMemo(
    () => projectHomePreview(segments, marker, currentPosition),
    [segments, marker, currentPosition],
  );
  if (!preview) return null;
  const content = (
    <>
      <span className="home-transport-map-heading">
        <span>
          <MapPin size={17} aria-hidden="true" /> Tu recorrido
        </span>
        <ArrowUpRight size={19} aria-hidden="true" />
      </span>
      <svg viewBox="0 0 320 160" aria-hidden="true" focusable="false">
        {preview.paths.map((points, index) => (
          <polyline key={index} points={points} />
        ))}
        {preview.marker && (
          <g>
            <circle
              cx={preview.marker[0]}
              cy={preview.marker[1]}
              r="10"
              className="home-map-halo"
            />
            <circle cx={preview.marker[0]} cy={preview.marker[1]} r="5" />
          </g>
        )}
        {preview.userPosition && (
          <g className="home-map-user-position">
            <circle
              cx={preview.userPosition[0]}
              cy={preview.userPosition[1]}
              r={Math.max(8, preview.radius)}
              className="home-map-search-radius"
            />
            <circle cx={preview.userPosition[0]} cy={preview.userPosition[1]} r="5" />
          </g>
        )}
      </svg>
      <strong className="home-transport-map-name">{name}</strong>
      <span className="home-transport-map-caption">
        Esquema orientativo{onNetwork ? ' · Explorar la red' : ''}
      </span>
    </>
  );
  return onNetwork ? (
    <button
      type="button"
      className="home-transport-map"
      data-line={line}
      aria-label={`Explorar la red: ${name}`}
      onClick={onNetwork}
    >
      {content}
    </button>
  ) : (
    <div
      className="home-transport-map"
      data-line={line}
      role="img"
      aria-label={`Esquema del recorrido: ${name}`}
    >
      {content}
    </div>
  );
}
