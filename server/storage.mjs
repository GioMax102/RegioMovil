import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createReportStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  // SQLite otherwise inherits the process umask (often world-readable 0644).
  // Set permissions before WAL creation so the journal inherits the same mode.
  if (path !== ':memory:') {
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      try { chmodSync(file, 0o600); }
      catch (error) { if (error.code !== 'ENOENT') { db.close(); throw error; } }
    }
  }
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('crowding','climate','accessibility','condition')),
      detail TEXT NOT NULL CHECK(length(detail) BETWEEN 3 AND 500),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unverified'
    );
    CREATE INDEX IF NOT EXISTS reports_station_created ON reports(station_id, created_at DESC);`);
  for (const [name, definition] of [
    ['title', "TEXT NOT NULL DEFAULT ''"], ['target_type', "TEXT NOT NULL DEFAULT 'station'"],
    ['unit_reference', 'TEXT'], ['photo_mime', 'TEXT'], ['photo_data', 'BLOB'],
    ['publication_consent', 'INTEGER NOT NULL DEFAULT 0'], ['route_id', 'TEXT'],
  ]) {
    try { db.exec(`ALTER TABLE reports ADD COLUMN ${name} ${definition}`); }
    catch (error) { if (!String(error.message).includes('duplicate column name')) throw error; }
  }
  db.exec("UPDATE reports SET status = 'pending' WHERE status = 'unverified'");
  const insert = db.prepare(`INSERT INTO reports(id, station_id, category, detail, created_at, title, target_type,
    unit_reference, photo_mime, photo_data, publication_consent, status, route_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`);
  const select = db.prepare(`SELECT id, station_id AS stationId, category, detail, created_at AS createdAt,
    id, title, target_type AS targetType, unit_reference AS unitReference, photo_mime AS photoMime,
    route_id AS routeId, publication_consent AS publicationConsent, created_at AS createdAt, detail, category
    FROM reports WHERE station_id = ? AND status = 'published'
    ORDER BY created_at DESC, rowid DESC LIMIT ?`);
  const get = db.prepare('SELECT * FROM reports WHERE id = ?');
  const moderate = db.prepare("UPDATE reports SET status = 'published' WHERE id = ? AND status = 'pending' AND publication_consent = 1");
  const pruneAge = db.prepare('DELETE FROM reports WHERE created_at < ?');
  const pruneCount = db.prepare('DELETE FROM reports WHERE rowid NOT IN (SELECT rowid FROM reports ORDER BY created_at DESC, rowid DESC LIMIT 5000)');
  return {
    add({ stationId, category, detail, title, targetType, unitReference, photoMime, photoData, publicationConsent, routeId }, date = new Date()) {
      const report = { id: randomUUID(), stationId, category, detail, title, targetType, unitReference, createdAt: date.toISOString(), status: 'pending' };
      db.exec('BEGIN IMMEDIATE');
      try {
        insert.run(report.id, stationId, category, detail, report.createdAt, title, targetType,
          unitReference || null, photoMime || null, photoData || null, publicationConsent ? 1 : 0, routeId || null);
        pruneAge.run(new Date(date.getTime() - 90 * 86400_000).toISOString());
        pruneCount.run();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return report;
    },
    list(stationId, limit = 20, date = new Date()) {
      pruneAge.run(new Date(date.getTime() - 90 * 86400_000).toISOString());
      return select.all(stationId, Math.min(50, Math.max(1, limit)));
    },
    listByRoute(routeId, limit = 20, date = new Date()) {
      pruneAge.run(new Date(date.getTime() - 90 * 86400_000).toISOString());
      return db.prepare(`SELECT id, station_id AS stationId, category, detail, created_at AS createdAt,
        title, target_type AS targetType, unit_reference AS unitReference, photo_mime AS photoMime,
        route_id AS routeId FROM reports WHERE route_id = ? AND status = 'published'
        ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(routeId, Math.min(50, Math.max(1, limit)));
    },
    get(id) { return get.get(id); },
    publish(id) { return Number(moderate.run(id).changes) === 1; },
    close() { db.close(); },
  };
}
