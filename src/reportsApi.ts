import { withRequestTimeout } from './request';
const apiBase = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export type ReportCategory =
  'infrastructure' | 'accessibility' | 'climate' | 'crowding' | 'condition';
export type ReportPayload = {
  stationId?: string;
  routeId?: string;
  category: ReportCategory;
  title: string;
  detail: string;
  targetType: 'station' | 'unit' | 'route';
  unitReference?: string;
  locationReference?: string;
  photo?: string;
  publicationConsent: boolean;
};

export async function sendReport(report: ReportPayload): Promise<void> {
  const uncertainReceipt =
    'No pudimos confirmar la recepción del reporte. Puede haberse guardado aunque la respuesta no haya llegado. Tu texto sigue aquí; evita reenviarlo de inmediato para no duplicarlo.';
  let result: { ok: boolean; status: number; payload: { error?: { message?: string } } | null };
  try {
    result = await withRequestTimeout(async (signal) => {
      const response = await fetch(`${apiBase}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
        signal,
      });
      return {
        ok: response.ok,
        status: response.status,
        payload: response.ok ? null : await response.json().catch(() => null),
      };
    }, 15000);
  } catch {
    throw new Error(uncertainReceipt);
  }
  if (!result.ok) {
    if (result.status >= 500) throw new Error(uncertainReceipt);
    throw new Error(
      result.payload?.error?.message || 'No pudimos enviar el reporte. Intenta de nuevo.',
    );
  }
}

export type PublicReport = {
  id: string;
  title: string;
  detail: string;
  category: string;
  targetType: 'station' | 'unit' | 'route';
  unitReference: string | null;
  locationReference?: string | null;
  createdAt: string;
  photoMime: string | null;
  status: 'published' | 'resolved';
};
export type PublicReportCounts = { total: number; open: number; resolved: number };
export type PublicReportSummary = PublicReportCounts & {
  byCategory: Record<string, PublicReportCounts>;
};
export type PublicReportFeed = { reports: PublicReport[]; summary?: PublicReportSummary };

function reportCounts(value: unknown): value is PublicReportCounts {
  if (!value || typeof value !== 'object') return false;
  const count = value as PublicReportCounts;
  return (
    [count.total, count.open, count.resolved].every(
      (item) => Number.isSafeInteger(item) && item >= 0,
    ) && count.total === count.open + count.resolved
  );
}

function reportSummary(value: unknown, visible: number): value is PublicReportSummary {
  if (!reportCounts(value)) return false;
  const summary = value as PublicReportSummary;
  if (
    !summary.byCategory ||
    typeof summary.byCategory !== 'object' ||
    Array.isArray(summary.byCategory) ||
    visible > summary.total
  )
    return false;
  const categories = Object.values(summary.byCategory);
  if (!categories.every(reportCounts)) return false;
  return (['total', 'open', 'resolved'] as const).every(
    (field) => categories.reduce((sum, count) => sum + count[field], 0) === summary[field],
  );
}

export async function loadPublicReportFeed(
  target: { stationId?: string; routeId?: string },
  signal?: AbortSignal,
): Promise<PublicReportFeed> {
  if (!!target.stationId === !!target.routeId)
    throw new Error('Elige una estación o una ruta para consultar sus reportes.');
  const query = target.routeId
    ? `route=${encodeURIComponent(target.routeId)}`
    : `station=${encodeURIComponent(target.stationId || '')}`;
  const result = await withRequestTimeout(
    async (requestSignal) => {
      const response = await fetch(`${apiBase}/api/reports?${query}`, {
        signal: requestSignal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('No pudimos consultar los reportes de este lugar.');
      return response.json() as Promise<{ reports: PublicReport[]; summary?: unknown }>;
    },
    8000,
    signal,
  );
  if (!Array.isArray(result.reports))
    throw new Error('La respuesta de reportes no tiene un formato válido.');
  return {
    reports: result.reports,
    ...(reportSummary(result.summary, result.reports.length) ? { summary: result.summary } : {}),
  };
}
export async function loadPublicReports(
  target: { stationId?: string; routeId?: string },
  signal?: AbortSignal,
): Promise<PublicReport[]> {
  return (await loadPublicReportFeed(target, signal)).reports;
}
export const publicReportPhotoUrl = (id: string) =>
  `${apiBase}/api/reports/${encodeURIComponent(id)}/photo`;
