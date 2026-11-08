import { useEffect, useState } from 'react';
import { ArrowUpRight, HandHeart, MessageSquare } from 'lucide-react';
import './reports.css';
import {
  loadPublicReportFeed,
  publicReportPhotoUrl,
  type PublicReport,
  type PublicReportSummary,
  type ReportDataset,
} from '../reportsApi';

const categoryLabels: Record<string, string> = {
  infrastructure: 'Infraestructura',
  accessibility: 'Accesibilidad',
  condition: 'Daños y limpieza',
  climate: 'Aire acondicionado',
  crowding: 'Saturación',
};

function ReportPhoto({ report }: { report: PublicReport }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="subtle">La foto no está disponible.</p>;
  return (
    <img
      src={publicReportPhotoUrl(report.id)}
      alt={`Foto adjunta al reporte: ${report.title}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function PublicReports({
  stationId,
  routeId,
  onReport,
}: {
  stationId?: string;
  routeId?: string;
  onReport?: () => void;
}) {
  const key = `${stationId || ''}:${routeId || ''}`;
  const [result, setResult] = useState<{
    key: string;
    reports: PublicReport[];
    summary?: PublicReportSummary;
    dataset?: ReportDataset;
    state: 'loading' | 'ready' | 'error';
  }>({ key, reports: [], state: 'loading' });
  const [revision, setRevision] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  useEffect(() => setStatusFilter('all'), [key]);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, reports: [], state: 'loading' });
    loadPublicReportFeed({ stationId, routeId }, controller.signal)
      .then((feed) => {
        if (!controller.signal.aborted) setResult({ key, ...feed, state: 'ready' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, reports: [], state: 'error' });
      });
    return () => controller.abort();
  }, [stationId, routeId, key, revision]);
  const state = result.key === key ? result.state : 'loading';
  const reports = result.key === key ? result.reports : [];
  const summary = result.key === key ? result.summary : undefined;
  const dataset = result.key === key ? result.dataset : undefined;
  const visibleReports = reports.filter(
    (report) => report.status === 'published' || report.status === 'resolved',
  );
  const visibleOpen = visibleReports.filter((report) => report.status === 'published').length;
  const visibleResolved = visibleReports.filter((report) => report.status === 'resolved').length;
  const filteredReports = visibleReports.filter(
    (report) =>
      statusFilter === 'all' ||
      (statusFilter === 'resolved' ? report.status === 'resolved' : report.status === 'published'),
  );
  return (
    <section
      className="panel public-reports"
      aria-label={dataset ? 'Reportes de visualización' : 'Reportes comunitarios revisados'}
    >
      {onReport ? (
        <button type="button" className="public-report-invite" onClick={onReport}>
          <span className="public-report-invite-icon">
            <HandHeart size={23} aria-hidden="true" />
          </span>
          <span>
            <strong>Ayuda a mejorar este lugar</strong>
            <span>Compartir observación</span>
          </span>
          <ArrowUpRight size={21} aria-hidden="true" />
        </button>
      ) : (
        <h3>Observaciones de la comunidad</h3>
      )}
      {state === 'loading' && <p role="status">Consultando reportes…</p>}
      {state === 'error' && (
        <div className="inline-error" role="alert">
          <p>No pudimos consultar los reportes. Esto no indica que no existan.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reintentar reportes
          </button>
        </div>
      )}
      {state === 'ready' && (
        <details className="public-reports-detail" key={key} open>
          <summary>
            <MessageSquare size={17} aria-hidden="true" />
            <span>Reportes de este lugar</span>
            {summary && summary.total > 0 && (
              <small>
                {summary.total} · {summary.open} abiertos
              </small>
            )}
          </summary>
          <div className="public-reports-context">
            {dataset ? <span className="public-report-origin">Visualización</span> : null}
            <span>
              {dataset ? 'Escenario ilustrativo' : 'Observaciones revisadas por la comunidad'}
            </span>
          </div>
          {summary && summary.total > 0 && (
            <div className="public-report-summary">
              <div className="public-report-metrics" aria-label="Resumen de reportes">
                <span>
                  <strong>{summary.total}</strong> reportes
                </span>
                <span>
                  <strong>{summary.open}</strong> abiertos
                </span>
                <span>
                  <strong>{summary.resolved}</strong> resueltos
                </span>
              </div>
              {reports.length < summary.total && (
                <p>
                  Mostrando {reports.length} de {summary.total} observaciones recientes.
                </p>
              )}
            </div>
          )}
          {!summary && (
            <p>
              Mostrando {reports.length} reportes recientes. El recuento total no está disponible.
            </p>
          )}
          {!reports.length && summary?.total === 0 && (
            <p>Todavía no hay reportes públicos para esta {routeId ? 'ruta' : 'estación'}.</p>
          )}
          {!reports.length && summary?.total !== 0 && (
            <p>No hay reportes recientes disponibles para mostrar.</p>
          )}
          {!!visibleReports.length && (
            <div
              className="public-report-filters"
              role="group"
              aria-label="Filtrar observaciones por estado"
            >
              {(
                [
                  ['all', `Todas · ${visibleReports.length}`],
                  ['open', `Abiertas · ${visibleOpen}`],
                  ['resolved', `Resueltas · ${visibleResolved}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="public-report-thread">
            {filteredReports.map((report) => (
              <article className="public-report-bubble" key={report.id}>
                <div className="public-report-bubble-meta">
                  <span
                    className={`public-report-status ${report.status === 'resolved' ? 'resolved' : 'open'}`}
                  >
                    {report.status === 'resolved' ? 'Resuelto' : 'Abierto'}
                  </span>
                  <span>{categoryLabels[report.category] || 'Observación'}</span>
                </div>
                <strong>{report.title}</strong>
                <p>{report.detail}</p>
                <small>
                  {report.targetType === 'unit'
                    ? `Unidad${report.unitReference ? ` · ${report.unitReference}` : ''}`
                    : report.targetType === 'route'
                      ? `Parada o recorrido${report.locationReference ? ` · ${report.locationReference}` : ''}`
                      : 'Estación'}{' '}
                  ·{' '}
                  <time dateTime={report.createdAt}>
                    {new Date(report.createdAt).toLocaleDateString('es-MX')}
                  </time>
                </small>
                {report.photoMime && <ReportPhoto report={report} />}
              </article>
            ))}
            {visibleReports.length > 0 && filteredReports.length === 0 && (
              <p>No hay observaciones con este estado.</p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
