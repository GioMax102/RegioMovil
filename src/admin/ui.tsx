import type { ReactNode } from 'react';
import { AdminApiError } from './api';
import type { ModerationAction, ReportStatus } from './types';

export const states: Record<ReportStatus, string> = {
  pending: 'Pendiente',
  published: 'Publicado',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
};
export const categories: Record<string, string> = {
  infrastructure: 'Infraestructura',
  accessibility: 'Accesibilidad',
  climate: 'Clima y ventilación',
  crowding: 'Afluencia',
  condition: 'Condición de la unidad',
};
export const targets = { station: 'Estación', route: 'Ruta o parada', unit: 'Unidad' };
export const actions: Record<ModerationAction, string> = {
  publish: 'Publicar reporte',
  reject: 'Rechazar reporte',
  resolve: 'Marcar como resuelto',
  unpublish: 'Retirar a revisión',
};
export const roleNames = { analyst: 'Análisis', moderator: 'Moderación', admin: 'Administración' };
export const dateLabel = (date: string | null) =>
  date && Number.isFinite(Date.parse(date))
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(date),
      )
    : 'Sin datos';
export const number = (value: number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value);
export const describeTarget = (item: {
  stationId: string | null;
  routeId: string | null;
  stationName?: string | null;
  routeName?: string | null;
}) =>
  [item.stationName || item.stationId, item.routeName || item.routeId]
    .filter(Boolean)
    .join(' · ') || 'Sin referencia';
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'No pudimos completar la operación.';
export const accessError = (error: unknown) =>
  error instanceof AdminApiError && (error.status === 401 || error.status === 403);

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="admin-notice" role="alert">
      {children}
    </p>
  );
}
export function Badge({ status }: { status: ReportStatus }) {
  return <span className={`admin-badge admin-${status}`}>{states[status]}</span>;
}
