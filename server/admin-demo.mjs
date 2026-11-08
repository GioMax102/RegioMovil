import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createReportStore, REPORT_CATEGORIES } from './storage.mjs';
import { communityFixture } from './community-fixture.mjs';

export function populateAdminDemo(
  databasePath,
  { network, catalog, seed = 'regiomovil-31', referenceDate = new Date(), profile = 'map' },
) {
  const date = new Date(referenceDate);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Fecha de demostración inválida.');
  if (!['map', 'community'].includes(profile))
    throw new RangeError('Perfil de visualización inválido.');
  if (profile === 'community')
    return populateCommunity(databasePath, { network, catalog, seed, date });
  const stations = [...network.stations].sort((a, b) => a.id.localeCompare(b.id));
  const routes = [...catalog.routes]
    .filter((r) => r.mode !== 'metro')
    .sort((a, b) => a.id.localeCompare(b.id));
  const withoutGeometry = routes.find((route) => !route.geometryPack);
  if (!stations.length || !routes.length)
    throw new Error('La demostración requiere estaciones y rutas del catálogo.');
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0);
  const choose = (items) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return items[state % items.length];
  };
  const store = createReportStore(databasePath);
  const expected = {
    total: 240,
    published: 120,
    resolved: 40,
    pending: 50,
    rejected: 30,
    approved: 160,
    approvedByTarget: { station: 80, route: 60, unit: 20 },
  };
  try {
    if (store.usage().reportCount) throw new Error('La demostración sólo admite una base vacía.');
    for (let index = 0; index < 240; index++) {
      const targetType =
        index < 80
          ? 'station'
          : index < 140
            ? 'route'
            : index < 160
              ? 'unit'
              : ['station', 'route', 'unit'][index % 3];
      // Stable geography/distribution from seed; IDs are normal store-generated UUIDs.
      // Deliberate hotspots and repeat unit/route pairs exercise grouping. Include
      // an open route without geometry when the supplied catalog contains one.
      const station = index % 5 < 3 ? stations[0] : choose(stations.slice(0, 8));
      const route =
        index === 81 && withoutGeometry
          ? withoutGeometry
          : targetType === 'unit'
            ? routes[index % Math.min(3, routes.length)]
            : choose(routes);
      const received = new Date(date.getTime() - (index % 27) * 86400_000 - 3 * 3600_000);
      const report = store.add(
        {
          targetType,
          stationId: targetType === 'station' ? station.id : undefined,
          routeId: targetType !== 'station' ? route.id : undefined,
          unitReference: targetType === 'unit' ? `DEMO-UNIDAD-${(index % 4) + 1}` : undefined,
          category: REPORT_CATEGORIES[index % REPORT_CATEGORIES.length],
          title: `[DEMO] Observación sintética ${index + 1}`,
          detail:
            'Ejemplo ficticio para verificar filtros y distribución. No describe un daño real.',
          publicationConsent: index < 160,
        },
        received,
      );
      const review = { reviewer: 'demo-reviewer', reviewed: true, note: 'Demostración sintética.' };
      if (index < 160) {
        store.moderate(report.id, 'publish', review, new Date(received.getTime() + 3600_000));
        if (index % 4 === 0)
          store.moderate(report.id, 'resolve', review, new Date(received.getTime() + 2 * 3600_000));
      } else if (index >= 210)
        store.moderate(report.id, 'reject', review, new Date(received.getTime() + 3600_000));
    }
  } finally {
    store.close();
  }
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(
      'CREATE TABLE report_dataset_metadata(kind TEXT NOT NULL, label TEXT NOT NULL, seed TEXT NOT NULL, reference_date TEXT NOT NULL)',
    );
    db.prepare('INSERT INTO report_dataset_metadata VALUES (?,?,?,?)').run(
      'synthetic',
      'Demostración · datos sintéticos',
      seed,
      date.toISOString(),
    );
  } finally {
    db.close();
  }
  return {
    kind: 'synthetic',
    label: 'Demostración · datos sintéticos',
    seed,
    referenceDate: date.toISOString(),
    expected,
  };
}

function populateCommunity(databasePath, options) {
  const { records, ...manifest } = communityFixture(options);
  const store = createReportStore(databasePath);
  try {
    if (store.usage().reportCount || store.datasetInfo())
      throw new Error('La visualización sólo admite una base vacía.');
    for (const { createdAt, status, ...input } of records) {
      const received = new Date(createdAt);
      const report = store.add(input, received);
      const review = {
        reviewer: 'community-fixture-reviewer',
        reviewed: true,
        note: 'Revisión generada para visualización con datos sintéticos.',
      };
      if (status === 'published' || status === 'resolved') {
        store.moderate(report.id, 'publish', review, new Date(received.getTime() + 30 * 60_000));
        if (status === 'resolved')
          store.moderate(
            report.id,
            'resolve',
            review,
            new Date(received.getTime() + 2 * 3_600_000),
          );
      } else if (status === 'rejected')
        store.moderate(report.id, 'reject', review, new Date(received.getTime() + 45 * 60_000));
    }
  } finally {
    store.close();
  }
  const label = 'Visualización · datos sintéticos';
  const referenceDate = options.date.toISOString();
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(
      'CREATE TABLE report_dataset_metadata(kind TEXT NOT NULL, label TEXT NOT NULL, seed TEXT NOT NULL, reference_date TEXT NOT NULL)',
    );
    db.prepare('INSERT INTO report_dataset_metadata VALUES (?,?,?,?)').run(
      'synthetic',
      label,
      options.seed,
      referenceDate,
    );
  } finally {
    db.close();
  }
  return {
    kind: 'synthetic',
    label,
    profile: 'community',
    seed: options.seed,
    referenceDate,
    ...manifest,
  };
}
