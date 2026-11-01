export type AdminRole = 'analyst' | 'moderator' | 'admin';
export type AdminDataset = null | {
  kind: 'synthetic';
  label: string;
  seed: string | number;
  referenceDate: string;
};
export type AdminSession = {
  user: { id: string; name: string; email: string; role: AdminRole; twoFactorEnabled: boolean };
  csrfToken: string;
  mfaRequired: boolean;
  expiresAt: string;
  dataset?: AdminDataset;
};
export type ReportStatus = 'pending' | 'published' | 'resolved' | 'rejected';
export type ModerationAction = 'publish' | 'reject' | 'resolve' | 'unpublish';
export type AdminReport = {
  id: string;
  stationId: string | null;
  routeId: string | null;
  stationName?: string | null;
  routeName?: string | null;
  targetType: 'station' | 'route' | 'unit';
  category: string;
  title: string;
  detail: string;
  unitReference: string | null;
  locationReference?: string | null;
  hasPhoto: boolean;
  createdAt: string;
  status: ReportStatus;
  publicationConsent: boolean | number;
  version: string;
  history?: { action: string; reviewer: string; note: string; createdAt: string }[];
};
export type AdminDashboard = {
  counters: Record<ReportStatus | 'total', number>;
  queue: { pendingOver7Days: number; oldestPendingAt: string | null };
  review: { reviewedCount: number; medianHours: number | null; p95Hours: number | null };
  byCategory: { category: string; count: number }[];
  targets: {
    targetType: 'station' | 'route' | 'unit';
    stationId: string | null;
    routeId: string | null;
    stationName?: string | null;
    routeName?: string | null;
    count: number;
    pending: number;
    published: number;
    resolved: number;
    rejected: number;
  }[];
  targetGroupsTotal?: number;
  targetsTruncated?: boolean;
  capacity: {
    reportCount: number;
    reportLimit: number;
    photoBytes: number;
    photoBytesLimit: number;
  };
  generatedAt: string;
};
export type ReportsPage = { reports: AdminReport[]; total: number; limit: number; offset: number };

export type ReportMapState = 'open' | 'approved' | 'resolved';
export type ReportMapGroup = {
  key: string;
  targetType: 'station' | 'route' | 'unit';
  stationId: string | null;
  routeId: string | null;
  stationName: string | null;
  routeName: string | null;
  unitReference?: string | null;
  count: number;
  open: number;
  resolved: number;
  latestAt: string;
  position: { lat: number; lng: number; source: 'station-catalog' } | null;
  geometryPack: string | null;
};
export type ReportMapData = {
  totals: {
    total: number;
    open: number;
    resolved: number;
    station: number;
    route: number;
    unit: number;
    stationLocated: number;
    withoutPoint: number;
  };
  groups: ReportMapGroup[];
  groupCount: number;
  groupLimit: number;
  truncated: boolean;
  filters: {
    state: ReportMapState;
    category: string;
    targetType: string;
    stationId: string | null;
    routeId: string | null;
    unitReference: string | null;
    from: string;
    to: string;
  };
  rangeBasis: 'received';
  timeZone: 'America/Monterrey';
  scope: 'all-filtered-reports';
  generatedAt: string;
  locationNotice: string;
  dataset: AdminDataset;
};
