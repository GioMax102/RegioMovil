import { useEffect, useState } from 'react';
import { adminRequest } from './api';
import type { AdminSession, ReportsPage } from './types';
import {
  Notice,
  Badge,
  states,
  categories,
  targets,
  describeTarget,
  dateLabel,
  number,
  accessError,
  messageOf,
} from './ui';

export default function Inbox({
  session,
  epoch,
  onError,
  onSelect,
}: {
  session: AdminSession;
  epoch: number;
  onError: (error: unknown) => void;
  onSelect: (id: string) => void;
}) {
  const [status, setStatus] = useState('pending');
  const [category, setCategory] = useState('');
  const [targetType, setTargetType] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ReportsPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setPage(null);
    const query = new URLSearchParams({
      status,
      limit: '20',
      offset: String(offset),
      ...(category ? { category } : {}),
      ...(targetType ? { targetType } : {}),
    });
    adminRequest<ReportsPage>(`/api/admin/reports?${query}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (offset > 0 && data.reports.length === 0) {
          setOffset(Math.max(0, Math.floor((data.total - 1) / 20) * 20));
        } else setPage(data);
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
  }, [session.user.id, epoch, status, category, targetType, offset, retry, onError]);
  return (
    <section className="admin-panel admin-inbox" aria-labelledby="inbox-heading">
      <div className="admin-section-title">
        <h2 id="inbox-heading">Bandeja de revisión</h2>
        <span className="admin-muted">Evidencia privada · acceso autorizado</span>
      </div>
      <div className="admin-filters">
        <label>
          Estado
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
          >
            <option value="all">Todos los estados</option>
            {Object.entries(states).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tema
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todos los temas</option>
            {Object.entries(categories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destino
          <select
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todos los destinos</option>
            {Object.entries(targets).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <>
          <Notice>{error}</Notice>
          <button onClick={() => setRetry((value) => value + 1)}>Reintentar bandeja</button>
        </>
      )}
      {loading && <p role="status">Cargando reportes…</p>}
      {page && (
        <>
          <p className="admin-muted" role="status">
            {page.total
              ? `${offset + 1}–${Math.min(offset + page.reports.length, page.total)} de ${number(page.total)} reportes`
              : 'No hay reportes con estos filtros.'}
          </p>
          <ul className="admin-report-list">
            {page.reports.map((report) => (
              <li key={report.id}>
                <button onClick={() => onSelect(report.id)} aria-label={`Revisar: ${report.title}`}>
                  <div className="admin-report-overline">
                    <Badge status={report.status} />
                    <span>{categories[report.category] || report.category}</span>
                  </div>
                  <strong>{report.title}</strong>
                  <span>
                    {targets[report.targetType]} · {describeTarget(report)}
                  </span>
                  <time dateTime={report.createdAt}>{dateLabel(report.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
          <nav className="admin-pagination" aria-label="Páginas de reportes">
            <button
              disabled={loading || offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 20))}
            >
              Anteriores
            </button>
            <button
              disabled={loading || offset + page.reports.length >= page.total}
              onClick={() => setOffset((value) => value + 20)}
            >
              Siguientes
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
