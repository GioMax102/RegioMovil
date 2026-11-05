import { useMemo } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { projectHomePreview, type HomeCoordinates, type HomePoint } from './homeTransport';

export default function HomeTransportMap({
  segments,
  marker,
  line,
  name,
  onNetwork,
}: {
  segments: HomeCoordinates[][];
  marker?: HomePoint;
  line?: string;
  name: string;
  onNetwork: () => void;
}) {
  const preview = useMemo(() => projectHomePreview(segments, marker), [segments, marker]);
  if (!preview) return null;
  return (
    <button
      type="button"
      className="home-transport-map"
      data-line={line}
      aria-label={`Explorar la red: ${name}`}
      onClick={onNetwork}
    >
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
      </svg>
      <strong className="home-transport-map-name">{name}</strong>
      <span className="home-transport-map-caption">Esquema orientativo · Explorar la red</span>
    </button>
  );
}
