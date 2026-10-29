import { useEffect, useRef, useState } from 'react';
import { adminPhoto, adminRequest, AdminApiError } from './api';
import type { AdminReport, AdminSession, ModerationAction } from './types';
import {
  Notice,
  Badge,
  categories,
  targets,
  actions,
  describeTarget,
  dateLabel,
  accessError,
  messageOf,
} from './ui';

export default function ReportDetail({
  id,
  session,
  onError,
  onClose,
  onChanged,
}: {
  id: string;
  session: AdminSession;
  onError: (error: unknown) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mutation = useRef<AbortController | null>(null);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [photo, setPhoto] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [confirm, setConfirm] = useState<ModerationAction | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const currentDialog = dialog.current;
    currentDialog?.showModal();
    return () => {
      mutation.current?.abort();
      currentDialog?.close();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let photoUrl = '';
    setReport(null);
    setPhoto('');
    setPhotoError('');
    setError('');
    setNote('');
    setReviewed(false);
    setConfirm(null);
    setConflict(false);
    adminRequest<{ report: AdminReport }>(`/api/admin/reports/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setReport(result.report);
        if (result.report.hasPhoto) {
          try {
            const blob = await adminPhoto(id, controller.signal);
            if (!controller.signal.aborted) {
              photoUrl = URL.createObjectURL(blob);
              setPhoto(photoUrl);
            }
          } catch (reason) {
            if (!controller.signal.aborted) {
              setPhotoError(messageOf(reason));
              if (accessError(reason)) onError(reason);
            }
          }
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(messageOf(reason));
          if (accessError(reason)) onError(reason);
        }
      });
    return () => {
      controller.abort();
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [id, refresh, onError]);
  async function moderate() {
    if (!report || !confirm || busy) return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    setError('');
    try {
      await adminRequest(`/api/admin/reports/${encodeURIComponent(id)}/moderate`, {
        method: 'POST',
        csrf: session.csrfToken,
        signal: controller.signal,
        body: {
          action: confirm,
          note: note.trim(),
          reviewed,
          expectedVersion: report.version,
          expectedStatus: report.status,
        },
      });
      if (!controller.signal.aborted) onChanged();
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(messageOf(reason));
      if (reason instanceof AdminApiError && reason.status === 409) setConflict(true);
      if (accessError(reason)) onError(reason);
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setConfirm(null);
      }
    }
  }
  const allowed: ModerationAction[] = !report
    ? []
    : report.status === 'pending'
      ? ['publish', 'reject']
      : report.status === 'published'
        ? ['resolve', 'unpublish', 'reject']
        : ['unpublish'];
  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby="report-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="admin-dialog-heading">
        <h2 id="report-heading">Revisar aportación</h2>
        <button disabled={busy} onClick={onClose} autoFocus aria-label="Cerrar revisión">
          Cerrar
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {conflict && (
        <button onClick={() => setRefresh((value) => value + 1)}>Cargar versión actual</button>
      )}
      {!report && !error && <p role="status">Cargando evidencia…</p>}
      {!report && error && (
        <button onClick={() => setRefresh((value) => value + 1)}>Volver a cargar reporte</button>
      )}
      {report && (
        <>
          <div className="admin-report-overline">
            <Badge status={report.status} />
            <span>{categories[report.category] || report.category}</span>
          </div>
          <h3 className="admin-detail-title">{report.title}</h3>
          <p className="admin-detail-text">{report.detail}</p>
          <dl className="admin-metrics">
            <div>
              <dt>Destino</dt>
              <dd>
                {targets[report.targetType]} · {describeTarget(report)}
              </dd>
            </div>
            {report.unitReference && (
              <div>
                <dt>Referencia de unidad</dt>
                <dd>{report.unitReference}</dd>
              </div>
            )}
            {report.locationReference && (
              <div>
                <dt>Lugar de observación</dt>
                <dd>{report.locationReference}</dd>
              </div>
            )}
            <div>
              <dt>Recibido</dt>
              <dd>{dateLabel(report.createdAt)}</dd>
            </div>
            <div>
              <dt>Consentimiento para publicar</dt>
              <dd>{report.publicationConsent ? 'Sí' : 'No · conservar privado'}</dd>
            </div>
          </dl>
          {report.hasPhoto && (
            <section aria-label="Foto del reporte">
              {photo ? (
                <img
                  className="admin-evidence"
                  src={photo}
                  alt="Evidencia enviada por la comunidad para esta aportación"
                />
              ) : photoError ? (
                <Notice>{photoError}</Notice>
              ) : (
                <p role="status">Cargando foto privada…</p>
              )}
            </section>
          )}
          <section className="admin-review-form" aria-label="Decisión de moderación">
            <h3>Registrar decisión</h3>
            <p className="admin-muted">
              Publicar acredita una revisión de contenido. Para marcar una resolución, deja
              constancia del seguimiento en la nota.
            </p>
            <label>
              Nota de revisión <span aria-hidden="true">*</span>
              <textarea
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setConfirm(null);
                }}
                rows={3}
                minLength={10}
                maxLength={500}
                required
                disabled={busy || conflict}
              />
            </label>
            <small>{note.length}/500 · Al menos 10 caracteres</small>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => {
                  setReviewed(event.target.checked);
                  setConfirm(null);
                }}
                disabled={busy || conflict || !!photoError || (report.hasPhoto && !photo)}
              />
              Revisé el texto y la foto, si existe, para descartar datos personales o contenido
              inapropiado
            </label>
            {!report.publicationConsent && report.status === 'pending' && (
              <p className="admin-muted">Este reporte no puede publicarse sin consentimiento.</p>
            )}
            <div className="admin-actions">
              {allowed.map((action) => (
                <button
                  key={action}
                  className={
                    action === 'publish'
                      ? 'admin-primary'
                      : action === 'reject'
                        ? 'admin-danger'
                        : ''
                  }
                  disabled={
                    busy ||
                    conflict ||
                    note.trim().length < 10 ||
                    (action === 'publish' &&
                      (!report.publicationConsent ||
                        !reviewed ||
                        !!photoError ||
                        (report.hasPhoto && !photo)))
                  }
                  onClick={() => setConfirm(action)}
                >
                  {actions[action]}
                </button>
              ))}
            </div>
            {confirm && (
              <div className="admin-confirm" role="group" aria-label="Confirmar decisión">
                <strong>
                  {actions[confirm]}: {report.title}
                </strong>
                <p>
                  {confirm === 'publish'
                    ? 'El texto y la foto quedarán visibles públicamente en el destino asociado.'
                    : confirm === 'reject'
                      ? 'El reporte quedará privado con el motivo registrado.'
                      : confirm === 'resolve'
                        ? 'El reporte público mostrará el estado resuelto; la nota de revisión seguirá siendo privada.'
                        : 'El reporte dejará de ser público y volverá a la bandeja de revisión.'}
                </p>
                <div className="admin-actions">
                  <button className="admin-primary" disabled={busy} onClick={moderate}>
                    {busy ? 'Guardando decisión…' : 'Confirmar decisión'}
                  </button>
                  <button disabled={busy} onClick={() => setConfirm(null)}>
                    Cancelar decisión
                  </button>
                </div>
              </div>
            )}
          </section>
          <details className="admin-history">
            <summary>Historial de moderación ({report.history?.length || 0})</summary>
            {report.history?.length ? (
              <ol>
                {report.history.map((event, index) => (
                  <li key={index}>
                    <strong>{actions[event.action as ModerationAction] || event.action}</strong>
                    <span>
                      {dateLabel(event.createdAt)} · {event.reviewer}
                    </span>
                    <p>{event.note || 'Sin nota'}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No tiene decisiones previas.</p>
            )}
          </details>
        </>
      )}
    </dialog>
  );
}
