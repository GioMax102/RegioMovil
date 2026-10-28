import type { ReportCategory } from './reportsApi';

export const REPORT_DRAFT_TTL = 24 * 60 * 60 * 1000;
export const REPORT_OPEN_KEY = 'regiomovil:report-open';
export function newReportDraftId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type ReportContext = {
  journeyId: string;
  stepIndex: number;
  source: 'journey';
  returnTo: 'guidance';
};
export type ReportDraft = {
  version: 1;
  draftId: string;
  expiresAt: number;
  targetType: 'station' | 'route' | 'unit';
  stationId: string;
  routeId: string;
  title: string;
  detail: string;
  category: ReportCategory;
  unitReference: string;
  locationReference: string;
  publicationConsent: boolean;
  photo: string;
  attempted?: boolean;
  context?: ReportContext;
};

let database: Promise<IDBDatabase> | undefined;
let operations = Promise.resolve();
function openDatabase() {
  if (!globalThis.indexedDB)
    return Promise.reject<IDBDatabase>(new Error('El almacenamiento local no está disponible.'));
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('regiomovil-report-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction('drafts', mode);
        const request = run(tx.objectStore('drafts'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () =>
          reject(tx.error || new Error('No se pudo guardar el borrador.'));
      }),
  );
}
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation);
  operations = result.then(
    () => {},
    () => {},
  );
  return result;
}
export function validReportDraft(value: unknown, now = Date.now()): value is ReportDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as ReportDraft;
  return (
    d.version === 1 &&
    /^[a-f\d]{8}-(?:[a-f\d]{4}-)4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(d.draftId) &&
    Number.isFinite(d.expiresAt) &&
    d.expiresAt > now &&
    d.expiresAt <= now + REPORT_DRAFT_TTL &&
    ['station', 'route', 'unit'].includes(d.targetType) &&
    ['infrastructure', 'accessibility', 'condition', 'climate', 'crowding'].includes(d.category) &&
    typeof d.publicationConsent === 'boolean' &&
    (d.attempted === undefined || typeof d.attempted === 'boolean') &&
    [
      ['stationId', 120],
      ['routeId', 160],
      ['title', 100],
      ['detail', 500],
      ['unitReference', 80],
      ['locationReference', 120],
      ['photo', 540000],
    ].every(
      ([key, size]) =>
        typeof d[key as keyof ReportDraft] === 'string' &&
        (d[key as keyof ReportDraft] as string).length <= Number(size),
    ) &&
    (!d.photo || /^data:image\/jpeg;base64,[a-z\d+/]+=*$/i.test(d.photo)) &&
    (!d.context ||
      (d.context.source === 'journey' &&
        d.context.returnTo === 'guidance' &&
        typeof d.context.journeyId === 'string' &&
        d.context.journeyId.length <= 180 &&
        Number.isSafeInteger(d.context.stepIndex) &&
        d.context.stepIndex >= 0))
  );
}
export function readReportDraft(): Promise<ReportDraft | null> {
  return serialized(async () => {
    const draft: unknown = await transaction('readonly', (store) => store.get('current'));
    if (validReportDraft(draft)) return draft;
    if (draft) await transaction('readwrite', (store) => store.delete('current'));
    return null;
  });
}
export function saveReportDraft(draft: ReportDraft): Promise<void> {
  return serialized(async () => {
    if (!validReportDraft(draft)) throw new Error('El borrador no pudo validarse.');
    await transaction('readwrite', (store) => store.put(draft, 'current'));
  });
}
export function clearReportDraft(draftId: string, expected?: ReportDraft): Promise<void> {
  return serialized(async () => {
    const current = await transaction('readonly', (store) => store.get('current'));
    if (
      current?.draftId === draftId &&
      (!expected || JSON.stringify(current) === JSON.stringify(expected))
    )
      await transaction('readwrite', (store) => store.delete('current'));
  });
}
export function markReportOpen(open: boolean) {
  try {
    if (open) localStorage.setItem(REPORT_OPEN_KEY, String(Date.now() + REPORT_DRAFT_TTL));
    else localStorage.removeItem(REPORT_OPEN_KEY);
  } catch {
    /* The draft itself reports storage failures; this marker contains no form data. */
  }
}
