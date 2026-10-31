import { useEffect, useState } from 'react';
import { adminRequest } from './api';
import type { AdminDashboard, AdminSession } from './types';
import {
  Notice,
  categories,
  targets,
  describeTarget,
  dateLabel,
  number,
  accessError,
  messageOf,
} from './ui';

export default function Dashboard({
  session,
  epoch,
  onError,
}: {
  session: AdminSession;
  epoch: number;
  onError: (error: unknown) => void;
}) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    adminRequest<AdminDashboard>('/api/admin/dashboard', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setDashboard(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(messageOf(reason));
          if (accessError(reason)) onError(reason);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [epoch, session.user.id, onError]);
  if (error) return <Notice>{error}</Notice>;
  if (!dashboard) return <p role="status">Cargando indicadores…</p>;
  const { counters, queue, review, capacity } = dashboard;
  return (
    <section aria-label="Indicadores de reportes" aria-busy={loading}>
      <div className="admin-section-title">
        <h2>Panorama de reportes</h2>
        <span className="admin-muted">
          Últimos 90 días · {loading ? 'Actualizando…' : dateLabel(dashboard.generatedAt)}
        </span>
      </div>
      <div className="admin-kpis">
        {(
          [
            ['total', 'Reportes recibidos'],
            ['pending', 'Por revisar'],
            ['published', 'Publicados abiertos'],
            ['resolved', 'Marcados resueltos'],
          ] as const
        ).map(([key, label]) => (
          <article key={key} className={`admin-kpi admin-kpi-${key}`}>
            <span>{label}</span>
            <strong>{number(counters[key])}</strong>
          </article>
        ))}
      </div>
      <p className="admin-context">
        Se cuentan reportes, no personas ni fallas únicas. La frecuencia necesita revisión de
        duplicados, gravedad y cobertura antes de orientar inversión.
      </p>
      <div className="admin-dashboard-grid">
        <article className="admin-panel">
          <h3>Seguimiento de la revisión</h3>
          <dl className="admin-metrics">
            <div>
              <dt>Pendientes con más de 7 días</dt>
              <dd>{number(queue.pendingOver7Days)}</dd>
            </div>
            <div>
              <dt>Pendiente más antiguo</dt>
              <dd>{dateLabel(queue.oldestPendingAt)}</dd>
            </div>
            <div>
              <dt>Mediana a primera revisión</dt>
              <dd>
                {review.medianHours === null ? 'Sin datos' : `${number(review.medianHours)} h`}
              </dd>
            </div>
            <div>
              <dt>Percentil 95 a primera revisión</dt>
              <dd>{review.p95Hours === null ? 'Sin datos' : `${number(review.p95Hours)} h`}</dd>
            </div>
            <div>
              <dt>Reportes con revisión registrada</dt>
              <dd>{number(review.reviewedCount)}</dd>
            </div>
            <div>
              <dt>Rechazados</dt>
              <dd>{number(counters.rejected)}</dd>
            </div>
          </dl>
        </article>
        <article className="admin-panel">
          <h3>Temas reportados</h3>
          {dashboard.byCategory.length ? (
            <ul className="admin-count-list">
              {dashboard.byCategory.map((item) => (
                <li key={item.category}>
                  <span>{categories[item.category] || item.category}</span>
                  <strong>{number(item.count)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted">Aún no hay reportes para agrupar.</p>
          )}
          <h3>Capacidad del almacenamiento</h3>
          <p>
            {number(capacity.reportCount)} de {number(capacity.reportLimit)} reportes ·{' '}
            {number(capacity.photoBytes / 1000000)} de {number(capacity.photoBytesLimit / 1000000)}{' '}
            MB en fotos
          </p>
        </article>
      </div>
      {dashboard.targets.length > 0 && (
        <details className="admin-panel admin-targets">
          <summary>Consultar distribución por estación o ruta</summary>
          <div className="admin-table-wrap">
            <table>
              <caption>
                Reportes por destino. Una misma incidencia puede tener varias aportaciones.
                {dashboard.targetsTruncated && (
                  <>
                    {' '}
                    Se muestran los {number(dashboard.targets.length)} destinos con más reportes
                    {dashboard.targetGroupsTotal !== undefined &&
                      ` de ${number(dashboard.targetGroupsTotal)}`}
                    . Los indicadores generales incluyen todos los destinos.
                  </>
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Destino</th>
                  <th scope="col">Reportes</th>
                  <th scope="col">Por revisar</th>
                  <th scope="col">Publicados</th>
                  <th scope="col">Resueltos</th>
                  <th scope="col">Rechazados</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.targets.map((item, index) => (
                  <tr key={`${item.targetType}:${item.stationId}:${item.routeId}:${index}`}>
                    <th scope="row">
                      {targets[item.targetType]} · {describeTarget(item)}
                    </th>
                    <td>{number(item.count)}</td>
                    <td>{number(item.pending)}</td>
                    <td>{number(item.published)}</td>
                    <td>{number(item.resolved)}</td>
                    <td>{number(item.rejected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
