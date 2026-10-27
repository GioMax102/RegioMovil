import { useEffect, useState } from 'react';
import { loadPublicReports, publicReportPhotoUrl, type PublicReport } from '../api';

function ReportPhoto({ report }: { report: PublicReport }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="subtle">La foto no está disponible.</p>;
  return <img src={publicReportPhotoUrl(report.id)} alt={`Foto adjunta al reporte: ${report.title}`} loading="lazy" onError={() => setFailed(true)} />;
}

export default function PublicReports({ stationId, routeId, onReport }: {
  stationId?: string;
  routeId?: string;
  onReport?: () => void;
}) {
  const key = `${stationId || ''}:${routeId || ''}`;
  const [result, setResult] = useState<{ key: string; reports: PublicReport[]; state: 'loading' | 'ready' | 'error' }>({ key, reports: [], state: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, reports: [], state: 'loading' });
    loadPublicReports({ stationId, routeId }, controller.signal).then(reports => {
      if (!controller.signal.aborted) setResult({ key, reports, state: 'ready' });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, reports: [], state: 'error' });
    });
    return () => controller.abort();
  }, [stationId, routeId, key, revision]);
  const state = result.key === key ? result.state : 'loading';
  const reports = result.key === key ? result.reports : [];
  return (
    <section className="panel public-reports" aria-label="Reportes comunitarios revisados">
      <h3>Lo que la comunidad reporta</h3>
      <p>Experiencias publicadas después de una revisión de contenido; no son avisos oficiales ni acreditan una falla verificada.</p>
      {state === 'loading' && <p role="status">Consultando reportes…</p>}
      {state === 'error' && <div className="inline-error" role="alert"><p>No pudimos consultar los reportes. Esto no indica que no existan.</p><button className="text-button" type="button" onClick={() => setRevision(value => value + 1)}>Reintentar reportes</button></div>}
      {state === 'ready' && !reports.length && <p>Todavía no hay reportes públicos para esta {routeId ? 'ruta' : 'estación'}.</p>}
      {state === 'ready' && reports.map(report => (
        <article key={report.id}>
          <strong>{report.title}</strong>
          <p>{report.detail}</p>
          <small>{report.targetType === 'unit' ? `Unidad${report.unitReference ? ` · ${report.unitReference}` : ''}` : report.targetType === 'route' ? `Parada o recorrido${report.locationReference ? ` · ${report.locationReference}` : ''}` : 'Estación'} · <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString('es-MX')}</time> · {report.status === 'resolved' ? 'Marcado como resuelto' : 'Publicado tras revisión de contenido'}</small>
          {report.photoMime && <ReportPhoto report={report} />}
        </article>
      ))}
      {onReport && <button type="button" className="text-button" onClick={onReport}>Reportar una falla aquí</button>}
    </section>
  );
}
