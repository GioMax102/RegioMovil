import { useId, useState } from 'react';
import { Camera, ExternalLink, MapPin } from 'lucide-react';
import { stationPhotos } from '../data/stationPhotos';
import { isRegionalCoordinate } from '../mobility/mapGeography';
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
}: {
  station: StationViewpoint;
  kind?: 'metro' | 'bus';
}) {
  const headingId = useId();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photo = station.id ? stationPhotos[`${kind}:${station.id}`] : undefined;
  const showPhoto = photo && failedSrc !== photo.src;
  const streetView = stationStreetViewUrl(station.lat, station.lng);

  return (
    <section className="panel station-street-view" aria-labelledby={headingId}>
      <div className="station-street-heading">
        <span aria-hidden="true">
          <Camera size={20} />
        </span>
        <div>
          <h3 id={headingId}>Reconoce la parada</h3>
          <p>{station.name}</p>
        </div>
      </div>
      {showPhoto ? (
        <figure className="station-archive-photo">
          <img
            src={photo.src}
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(photo.src)}
          />
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
      ) : (
        <p className="station-photo-unavailable" role={photo ? 'status' : undefined}>
          {photo
            ? 'No pudimos cargar la fotografía. Puedes consultar el entorno en Google Maps.'
            : 'Aún no tenemos una fotografía verificada de esta parada.'}
        </p>
      )}
      {streetView ? (
        <div className="station-street-action">
          <a
            href={streetView}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            aria-label={`Ver entorno de ${station.name} en Google Maps. Abre un servicio externo.`}
          >
            <MapPin size={18} aria-hidden="true" />
            <span>Ver entorno en Google Maps</span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
          <small>
            Necesita internet. Street View muestra la imagen cercana disponible; no es una vista en
            vivo.
          </small>
        </div>
      ) : (
        <p className="station-photo-unavailable">
          La vista de calle requiere una ubicación válida dentro de la ZMM.
        </p>
      )}
    </section>
  );
}
