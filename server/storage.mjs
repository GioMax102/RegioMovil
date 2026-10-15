import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createReportStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
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
  const insert = db.prepare('INSERT INTO reports(id, station_id, category, detail, created_at) VALUES (?, ?, ?, ?, ?)');
  const select = db.prepare('SELECT id, station_id AS stationId, category, detail, created_at AS createdAt, status FROM reports WHERE station_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?');
  const pruneAge = db.prepare('DELETE FROM reports WHERE created_at < ?');
  const pruneCount = db.prepare('DELETE FROM reports WHERE rowid NOT IN (SELECT rowid FROM reports ORDER BY created_at DESC, rowid DESC LIMIT 5000)');
  return {
    add({ stationId, category, detail }, date = new Date()) {
      const report = { id: randomUUID(), stationId, category, detail, createdAt: date.toISOString(), status: 'unverified' };
      db.exec('BEGIN IMMEDIATE');
      try {
        insert.run(report.id, stationId, category, detail, report.createdAt);
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
    close() { db.close(); },
  };
}
