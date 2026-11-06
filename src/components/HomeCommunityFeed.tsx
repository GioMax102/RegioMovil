import { useEffect, useState } from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';
import {
  loadPublicReportFeed,
  publicReportPhotoUrl,
  type PublicReport,
  type PublicReportFeed,
} from '../reportsApi';
import './homeCommunityFeed.css';

const categories: Record<string, string> = {
  infrastructure: 'Infraestructura',
  accessibility: 'Accesibilidad',
  condition: 'Daños y limpieza',
  climate: 'Aire acondicionado',
  crowding: 'Saturación',
};
const date = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Monterrey',
});

function CommunityCard({ report }: { report: PublicReport }) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const timestamp = new Date(report.createdAt);
  return (
    <article className="home-community-card">
      <div className="home-community-card-meta">
        <span>{categories[report.category] || 'Observación'}</span>
        <span>{report.status === 'resolved' ? 'Resuelto' : 'Abierto'}</span>
      </div>
      <h3>{report.title}</h3>
      <time dateTime={Number.isFinite(+timestamp) ? report.createdAt : undefined}>
        {Number.isFinite(+timestamp) ? date.format(timestamp) : 'Fecha no disponible'}
      </time>
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary aria-label={`Leer observación: ${report.title}`}>
          Leer observación
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        {open && (
          <div className="home-community-card-detail">
            <p>{report.detail}</p>
            {report.photoMime &&
              (photoFailed ? (
                <p>La foto no está disponible.</p>
              ) : (
                <img
                  src={publicReportPhotoUrl(report.id)}
                  alt={`Foto adjunta: ${report.title}`}
                  loading="lazy"
                  onError={() => setPhotoFailed(true)}
                />
              ))}
          </div>
        )}
      </details>
    </article>
  );
}

export default function HomeCommunityFeed({
  stationId,
  routeId,
  onContribute,
}: {
  stationId?: string;
  routeId?: string;
  onContribute?: () => void;
}) {
  const key = `${stationId || ''}:${routeId || ''}`;
  const validTarget = !!stationId !== !!routeId;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    state: 'loading' | 'ready' | 'error';
    feed?: PublicReportFeed;
  }>({ key, state: 'loading' });
  useEffect(() => {
    if (!validTarget) return;
    const controller = new AbortController();
    setResult({ key, state: 'loading' });
    loadPublicReportFeed({ stationId, routeId }, controller.signal)
      .then((feed) => {
        if (!controller.signal.aborted) setResult({ key, state: 'ready', feed });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, state: 'error' });
      });
    return () => controller.abort();
  }, [stationId, routeId, key, validTarget, revision]);
  const state = result.key === key ? result.state : 'loading';
  const feed = result.key === key ? result.feed : undefined;
  const reports = (feed?.reports || []).filter(
    (report) => report.status === 'published' || report.status === 'resolved',
  );
  const visible = reports.slice(0, 5);
  const summary = feed?.summary;
  return (
    <section className="home-community" aria-label="Lo que la comunidad comparte">
      <header className="home-community-heading">
        <MessageSquare size={20} aria-hidden="true" />
        <h2>Lo que la comunidad comparte</h2>
        <span className="home-community-reviewed">Revisado</span>
      </header>
      {!validTarget ? (
        <p>Elige una estación o una ruta para ver las observaciones de la comunidad.</p>
      ) : state === 'loading' ? (
        <p role="status">Consultando observaciones…</p>
      ) : state === 'error' ? (
        <div className="home-community-error" role="alert">
          <p>No pudimos consultar las observaciones. Esto no indica que no existan.</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Reintentar observaciones
          </button>
        </div>
      ) : (
        <>
          {summary && summary.total > 0 && (
            <p className="home-community-counts">
              <strong>{summary.total}</strong>{' '}
              {summary.total === 1 ? 'reporte público' : 'reportes públicos'} · {summary.open}{' '}
              {summary.open === 1 ? 'abierto' : 'abiertos'} · {summary.resolved}{' '}
              {summary.resolved === 1 ? 'resuelto' : 'resueltos'}
            </p>
          )}
          {!visible.length && (
            <div className="home-community-empty">
              <p>
                {summary?.total === 0
                  ? `Todavía no hay reportes públicos para esta ${routeId ? 'ruta' : 'estación'}.`
                  : summary
                    ? 'No hay observaciones recientes disponibles para mostrar.'
                    : 'No hay observaciones recientes disponibles. El recuento total no está disponible.'}
              </p>
              {onContribute && (
                <button type="button" onClick={onContribute}>
                  Comparte tu experiencia
                </button>
              )}
            </div>
          )}
          {!!visible.length && (
            <>
              <ul
                className="home-community-list"
                aria-label="Observaciones recientes"
                tabIndex={0}
                key={key}
              >
                {visible.map((report) => (
                  <li key={report.id}>
                    <CommunityCard report={report} />
                  </li>
                ))}
              </ul>
              <p className="home-community-window">
                {summary
                  ? `${visible.length} ${visible.length === 1 ? 'observación reciente' : 'observaciones recientes'} de ${summary.total} públicas.`
                  : 'Observaciones recientes. El recuento total no está disponible.'}
              </p>
            </>
          )}
        </>
      )}
      <details className="home-community-scope">
        <summary>Sobre estas observaciones</summary>
        <p>
          Publicadas con consentimiento tras revisión de contenido. No son alertas oficiales ni
          acreditan una falla verificada.
        </p>
      </details>
    </section>
  );
}
