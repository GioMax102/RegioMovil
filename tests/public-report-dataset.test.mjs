import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';

const date = new Date('2026-11-08T18:00:00Z');
const network = {
  sources: [],
  stations: [{ id: 'a', name: 'Estación A', lat: 25.7, lng: -100.3, lineIds: ['L1'] }],
  lines: [{ id: 'L1', name: 'Línea 1', stationIds: ['a'] }],
};
const catalog = {
  version: 1,
  sources: [],
  routes: [
    {
      id: 'bus-a',
      code: 'TM',
      name: 'Recorrido A',
      mode: 'bus',
      networkId: 'transmetro',
      status: 'published',
      sourceIds: [],
    },
  ],
};
for (const synthetic of [false, true]) {
  test(`public reports identify ${synthetic ? 'synthetic' : 'community'} provenance without exposing private dataset fields`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'regiomovil-provenance-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const databasePath = join(directory, 'reports.sqlite');
    if (synthetic) {
      const db = new DatabaseSync(databasePath);
      db.exec(
        'CREATE TABLE report_dataset_metadata(kind TEXT,label TEXT,seed TEXT,reference_date TEXT)',
      );
      db.prepare('INSERT INTO report_dataset_metadata VALUES (?,?,?,?)').run(
        'synthetic',
        'Private internal label',
        'private-seed',
        date.toISOString(),
      );
      db.close();
    }
    const app = createApp({ network, catalog, databasePath, now: () => date });
    const server = createServer(app.handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      app.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const target of [
      { targetType: 'station', stationId: 'a' },
      { targetType: 'route', routeId: 'bus-a' },
    ]) {
      for (const approved of [true, false]) {
        const report = app.store.add(
          {
            ...target,
            category: 'infrastructure',
            title: 'Banca sin respaldo',
            detail: 'El respaldo de la banca junto al acceso está desprendido.',
            publicationConsent: approved,
          },
          date,
        );
        if (approved)
          app.store.moderate(
            report.id,
            'publish',
            { reviewer: 'fixture', reviewed: true, note: 'Contenido de prueba' },
            date,
          );
      }
      const query = target.stationId ? 'station=a' : 'route=bus-a';
      for (const path of ['/api/reports', '/api/reports/summary']) {
        const response = await fetch(`${base}${path}?${query}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control') || '', /no-store/);
        const payload = await response.json();
        assert.equal(payload.source, synthetic ? 'synthetic' : 'community');
        assert.equal(payload.verification, synthetic ? 'synthetic' : 'moderated');
        if (synthetic)
          assert.deepEqual(payload.dataset, {
            kind: 'synthetic',
            label: 'Escenario de visualización',
            referenceDate: date.toISOString(),
          });
        else assert.equal('dataset' in payload, false);
        const serialized = JSON.stringify(payload);
        for (const privateValue of ['private-seed', 'Private internal label', databasePath])
          assert.equal(serialized.includes(privateValue), false);
        assert.equal(path.endsWith('summary') ? payload.total : payload.summary.total, 1);
        if (payload.reports)
          assert.equal(payload.reports.length, 1, 'Private reports remain invisible.');
      }
    }
  });
}
