import { useEffect, useState } from 'react';
import { loadPublicReports, publicReportPhotoUrl, type PublicReport } from '../api';

export default function PublicReports({ stationId, routeId }: { stationId?: string; routeId?: string }) {
  const [reports, setReports] = useState<PublicReport[]>([]);
  useEffect(() => {
    let active = true;
    loadPublicReports({ stationId, routeId }).then(items => { if (active) setReports(items); }).catch(() => { if (active) setReports([]); });
    return () => { active = false; };
  }, [stationId, routeId]);
  if (!reports.length) return null;
  return (
    <section className="panel public-reports" aria-label="Reportes comunitarios revisados">
      <h3>Lo que la comunidad reporta</h3>
      <p>Reportes revisados por otras personas; no son avisos oficiales.</p>
      {reports.map(report => (
        <article key={report.id}>
          <strong>{report.title}</strong>
          <p>{report.detail}</p>
          <small>{report.targetType === 'unit' ? `Unidad · ${report.unitReference || 'sin referencia'}` : 'Estación'} · {new Date(report.createdAt).toLocaleDateString('es-MX')}</small>
          {report.photoMime && <img src={publicReportPhotoUrl(report.id)} alt={`Foto del reporte: ${report.title}`} loading="lazy" />}
        </article>
      ))}
    </section>
  );
}
