import { useEffect, useState } from 'react';
import './reports.css';
import {
  loadPublicReportFeed,
  publicReportPhotoUrl,
  type PublicReport,
  type PublicReportSummary,
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
    state: 'loading' | 'ready' | 'error';
  }>({ key, reports: [], state: 'loading' });
  const [revision, setRevision] = useState(0);
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
  return (
    <section className="panel public-reports" aria-label="Reportes comunitarios revisados">
      <h3>Lo que la comunidad reporta</h3>
      <p>
        Experiencias publicadas después de una revisión de contenido; no son avisos oficiales ni
        acreditan una falla verificada.
      </p>
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
      {state === 'ready' && summary && (
        <div className="public-report-summary">
          <p>
            <strong>{summary.total}</strong>{' '}
            {summary.total === 1 ? 'reporte público' : 'reportes públicos'} ·{' '}
            <strong>{summary.open}</strong> {summary.open === 1 ? 'abierto' : 'abiertos'} ·{' '}
            <strong>{summary.resolved}</strong> {summary.resolved === 1 ? 'resuelto' : 'resueltos'}
          </p>
          {summary.total > 0 && (
            <ul className="public-report-categories" aria-label="Reportes por categoría">
              {Object.entries(summary.byCategory)
                .filter(([, count]) => count.total > 0)
                .sort(([, a], [, b]) => b.open - a.open || b.total - a.total)
                .map(([category, count]) => (
                  <li key={category}>
                    <strong>{categoryLabels[category] || category}</strong>: {count.open}{' '}
                    {count.open === 1 ? 'abierto' : 'abiertos'} · {count.resolved}{' '}
                    {count.resolved === 1 ? 'resuelto' : 'resueltos'}
                  </li>
                ))}
            </ul>
          )}
          {reports.length < summary.total && (
            <p>
              Mostrando los {reports.length} reportes más recientes de {summary.total} públicos.
            </p>
          )}
        </div>
      )}
      {state === 'ready' && !summary && (
        <p>Mostrando {reports.length} reportes recientes. El recuento total no está disponible.</p>
      )}
      {state === 'ready' && !reports.length && summary?.total === 0 && (
        <p>Todavía no hay reportes públicos para esta {routeId ? 'ruta' : 'estación'}.</p>
      )}
      {state === 'ready' && !reports.length && summary?.total !== 0 && (
        <p>No hay reportes recientes disponibles para mostrar.</p>
      )}
      {state === 'ready' &&
        reports.map((report) => (
          <article key={report.id}>
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
              </time>{' '}
              ·{' '}
              {report.status === 'resolved'
                ? 'Marcado como resuelto'
                : 'Publicado tras revisión de contenido'}
            </small>
            {report.photoMime && <ReportPhoto report={report} />}
          </article>
        ))}
      {onReport && (
        <button type="button" className="text-button" onClick={onReport}>
          Reportar una falla aquí
        </button>
      )}
    </section>
  );
}
