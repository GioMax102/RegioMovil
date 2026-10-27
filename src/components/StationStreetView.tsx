import { useState } from 'react';
import { ExternalLink, Eye, Info, MapPin } from 'lucide-react';
import { stationPhotos } from '../data/stationPhotos';
import { isRegionalCoordinate } from '../mobility/mapGeography';
import { Dialog } from './Primitives';
import './stationStreetView.css';

interface StationViewpoint {
  id?: string;
  name: string;
  lat: number;
  lng: number;
}

/** Maps URLs require no API key. Only an explicit link click contacts Google. */
export function stationStreetViewUrl(lat: number, lng: number): string | null {
  if (!isRegionalCoordinate([lng, lat])) return null;
  const url = new URL('https://www.google.com/maps/@');
  url.searchParams.set('api', '1');
  url.searchParams.set('map_action', 'pano');
  url.searchParams.set('viewpoint', `${lat.toFixed(6)},${lng.toFixed(6)}`);
  return url.href;
}

export default function StationStreetView({
  station,
  kind = 'metro',
  compact = false,
}: {
  station: StationViewpoint;
  kind?: 'metro' | 'bus';
  compact?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const photo = station.id ? stationPhotos[`${kind}:${station.id}`] : undefined;
  const streetView = stationStreetViewUrl(station.lat, station.lng);

  return (
    <div
      className={`station-street-view${compact ? ' compact' : ''}`}
      role="group"
      aria-label={`Reconocer ${station.name}`}
    >
      {photo && (
        <button
          type="button"
          className="station-photo-action"
          aria-label={`Ver fotografía de ${station.name}`}
          aria-haspopup="dialog"
          title="Ver fotografía"
          onClick={() => setPhotoOpen(true)}
        >
          <Eye size={19} aria-hidden="true" />
          {!compact && <span>Foto</span>}
        </button>
      )}
      {streetView && (
        <a
          className="station-map-action"
          href={streetView}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          aria-label={`Ver entorno de ${station.name} en Google Maps. Abre un servicio externo.`}
          title="Google Maps · requiere internet"
        >
          <MapPin size={19} aria-hidden="true" />
          {!compact && <span>Google Maps</span>}
        </a>
      )}
      {!compact && (
        <details className="station-image-info">
          <summary aria-label="Información de imágenes" title="Información de imágenes">
            <Info size={17} aria-hidden="true" />
          </summary>
          <div>
            {!photo && <p>Aún no tenemos una fotografía verificada de esta parada.</p>}
            <p>
              Street View requiere internet. Muestra la imagen cercana disponible; no es una vista
              en vivo.
            </p>
            {!streetView && (
              <p>La vista de calle requiere una ubicación válida dentro de la ZMM.</p>
            )}
          </div>
        </details>
      )}
      {photo && photoOpen && (
        <Dialog
          title={station.name}
          onClose={() => setPhotoOpen(false)}
          className="station-photo-dialog"
        >
          <figure className="station-archive-photo">
            {failedSrc !== photo.src ? (
              <img
                src={photo.src}
                width={photo.width}
                height={photo.height}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                onError={() => setFailedSrc(photo.src)}
              />
            ) : (
              <p role="status">No pudimos cargar la fotografía.</p>
            )}
            <figcaption>
              <strong>Fotografía histórica · {photo.year}</strong>
              <span>El lugar puede haber cambiado.</span>
              <a
                href={photo.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {photo.author} · {photo.license}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </figcaption>
          </figure>
        </Dialog>
      )}
    </div>
  );
}
