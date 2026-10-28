import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sanitizeReportPhoto } from './report-photos.mjs';

export const REPORT_CATEGORIES = ['crowding', 'climate', 'accessibility', 'condition', 'infrastructure'];
export const REPORT_RETENTION_DAYS = 90;
export const MAX_REPORTS = 5000;
export const MAX_STORED_PHOTO_BYTES = 50_000_000;
export const validReportDraftId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const cutoff = date => new Date(date.getTime() - REPORT_RETENTION_DAYS * 86400_000).toISOString();
const boundedLimit = limit => Math.min(100, Math.max(1, Math.trunc(Number(limit)) || 20));
const columns = `id, station_id AS stationId, route_id AS routeId, title, category, detail,
  target_type AS targetType, unit_reference AS unitReference, location_reference AS locationReference,
  photo_mime AS photoMime, created_at AS createdAt, status`;
const schema = `CREATE TABLE reports (
  id TEXT PRIMARY KEY, station_id TEXT, route_id TEXT,
  target_type TEXT NOT NULL CHECK(target_type IN ('station','unit','route')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
  category TEXT NOT NULL CHECK(category IN ('crowding','climate','accessibility','condition','infrastructure')),
  detail TEXT NOT NULL CHECK(length(detail) BETWEEN 3 AND 500),
  unit_reference TEXT CHECK(unit_reference IS NULL OR length(unit_reference) <= 80),
  location_reference TEXT CHECK(location_reference IS NULL OR length(location_reference) <= 120),
  photo_mime TEXT CHECK(photo_mime IS NULL OR photo_mime IN ('image/jpeg','image/png','image/webp')),
  photo_data BLOB CHECK(photo_data IS NULL OR length(photo_data) BETWEEN 1 AND 400000),
  publication_consent INTEGER NOT NULL DEFAULT 0 CHECK(publication_consent IN (0,1)),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','resolved','rejected')),
  CHECK((target_type = 'station' AND station_id IS NOT NULL) OR (target_type IN ('unit','route') AND route_id IS NOT NULL)
    OR (target_type = 'unit' AND station_id IS NOT NULL AND route_id IS NULL AND status IN ('pending','rejected') AND publication_consent = 0)),
  CHECK((photo_data IS NULL) = (photo_mime IS NULL))
);`;

function migrate(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 3) throw new Error('La base de reportes requiere una versión más reciente del servidor.');
  if (version === 3) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (version < 2) {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'reports'").get();
      if (exists) db.exec('ALTER TABLE reports RENAME TO reports_legacy');
      db.exec(schema);
      if (exists) {
        const insert = db.prepare(`INSERT INTO reports(id, station_id, route_id, target_type, title, category, detail,
          unit_reference, location_reference, photo_mime, photo_data, publication_consent, created_at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const row of db.prepare('SELECT * FROM reports_legacy').iterate()) {
          let photo = null;
          if (row.photo_data && row.photo_mime) {
            try { photo = sanitizeReportPhoto(row.photo_mime, row.photo_data); } catch { /* Invalid legacy attachments are discarded and the report stays private. */ }
          }
          let consent = row.publication_consent === 1 ? 1 : 0;
          const category = REPORT_CATEGORIES.includes(row.category) ? row.category : 'condition';
          const target = row.target_type === 'unit' || (row.target_type === 'route' && row.route_id) ? row.target_type : 'station';
          const title = [...(row.title?.trim() || row.detail || 'Reporte comunitario').replace(/\s+/g, ' ')].slice(0, 100).join('');
          let status = ['published', 'resolved', 'rejected'].includes(row.status) ? row.status : 'pending';
          // Old versions accepted unassigned units. Preserve their meaning, but
          // never guess a route or turn an observation into a station complaint.
          if (target === 'unit' && !row.route_id) { consent = 0; status = 'pending'; }
          if ((status === 'published' || status === 'resolved') && (!consent || (row.photo_data && !photo))) status = 'pending';
          insert.run(row.id, row.station_id || null, row.route_id || null, target, title.length >= 3 ? title : 'Reporte comunitario', category, row.detail,
            row.unit_reference || null, row.location_reference || null, photo ? row.photo_mime : null, photo, consent, row.created_at, status);
        }
        db.exec('DROP TABLE reports_legacy');
      }
      db.exec(`CREATE INDEX reports_station_status_created ON reports(station_id, status, created_at DESC);
        CREATE INDEX reports_route_status_created ON reports(route_id, status, created_at DESC);
        CREATE INDEX reports_status_created ON reports(status, created_at DESC);
        CREATE TABLE report_moderation_events (
          id INTEGER PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          action TEXT NOT NULL, reviewer TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX moderation_report ON report_moderation_events(report_id, created_at);
        PRAGMA user_version = 2;`);
    }
    // Nullable keys keep old clients and existing private evidence compatible.
    // Keep keys with their report so retention removes both in the same action.
    db.exec(`ALTER TABLE reports ADD COLUMN submission_hash TEXT CHECK(submission_hash IS NULL OR length(submission_hash) = 64);
      ALTER TABLE reports ADD COLUMN draft_id TEXT CHECK(draft_id IS NULL OR length(draft_id) = 36)
        CHECK((draft_id IS NULL) = (submission_hash IS NULL));
      CREATE UNIQUE INDEX reports_draft_id ON reports(draft_id) WHERE draft_id IS NOT NULL;
      PRAGMA user_version = 3; COMMIT;`);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createReportStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    if (path !== ':memory:') {
      for (const file of [path, `${path}-wal`, `${path}-shm`]) {
        try { chmodSync(file, 0o600); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;
      PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA journal_size_limit = 8388608;`);
    migrate(db);
  } catch (error) { db.close(); throw error; }
  const insert = db.prepare(`INSERT INTO reports(id, station_id, route_id, target_type, title, category, detail,
    unit_reference, location_reference, photo_mime, photo_data, publication_consent, created_at, draft_id, submission_hash, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`);
  const pruneAge = db.prepare('DELETE FROM reports WHERE created_at < ?');
  const publicCondition = "status IN ('published','resolved') AND publication_consent = 1 AND created_at >= ?";
  const prune = date => pruneAge.run(cutoff(date));
  function listPublic(field, id, limit, date) {
    prune(date);
    return db.prepare(`SELECT ${columns} FROM reports WHERE ${field} = ? AND ${publicCondition}
      ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(id, cutoff(date), boundedLimit(limit));
  }
  const store = {
    add({ stationId, routeId, category, detail, title, targetType = 'station', unitReference, locationReference, photoMime, photoData, publicationConsent = false, draftId }, date = new Date(), { beforeCreate } = {}) {
      if (draftId !== undefined && !validReportDraftId(draftId)) {
        const error = new RangeError('El identificador del borrador no es válido.'); error.code = 'INVALID_REPORT_DRAFT'; throw error;
      }
      if (['unit', 'route'].includes(targetType) && !routeId) throw new RangeError('Una unidad o recorrido requiere un identificador de ruta explícito.');
      // Older clients sent only station/category/detail. Preserve those reports
      // privately; all public consent must be explicit in the new contract.
      title ??= [...detail.replace(/\s+/g, ' ')].slice(0, 100).join('');
      const sanitizedPhoto = photoData ? sanitizeReportPhoto(photoMime, photoData) : null;
      const report = { id: randomUUID(), stationId: stationId || null, routeId: routeId || null, category, detail, title,
        targetType, unitReference: unitReference || null, locationReference: locationReference || null,
        photoMime: sanitizedPhoto ? photoMime : null, createdAt: date.toISOString(), status: 'pending' };
      const key = draftId?.toLowerCase() || null;
      const submissionHash = key ? createHash('sha256').update(JSON.stringify([
        report.stationId, report.routeId, targetType, title, category, detail, report.unitReference,
        report.locationReference, report.photoMime,
        sanitizedPhoto ? createHash('sha256').update(sanitizedPhoto).digest('hex') : null,
        publicationConsent ? 1 : 0,
      ])).digest('hex') : null;
      db.exec('BEGIN IMMEDIATE');
      try {
        prune(date);
        if (key) {
          const previous = db.prepare(`SELECT ${columns}, submission_hash AS submissionHash FROM reports WHERE draft_id = ?`).get(key);
          if (previous) {
            if (previous.submissionHash !== submissionHash) {
              const error = new Error('Este borrador ya fue recibido con otro contenido. Conserva el borrador y crea una observación nueva si deseas enviar los cambios.');
              error.code = 'REPORT_DRAFT_CONFLICT'; throw error;
            }
            const { submissionHash: _hash, ...receipt } = previous;
            // This acknowledges the original submission, not its current private
            // moderation state. No key or hash enters public query responses.
            receipt.status = 'pending';
            db.exec('COMMIT'); return receipt;
          }
        }
        beforeCreate?.();
        const usage = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(length(photo_data)),0) AS bytes FROM reports').get();
        if (usage.count >= MAX_REPORTS || usage.bytes + (sanitizedPhoto?.length || 0) > MAX_STORED_PHOTO_BYTES) {
          const error = new Error('El almacenamiento de reportes está lleno. Intenta más tarde.');
          error.code = 'REPORT_STORAGE_FULL'; throw error;
        }
        insert.run(report.id, report.stationId, report.routeId, targetType, title, category, detail,
          report.unitReference, report.locationReference, report.photoMime, sanitizedPhoto, publicationConsent ? 1 : 0, report.createdAt, key, submissionHash);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return report;
    },
    list(stationId, limit = 20, date = new Date()) { return listPublic('station_id', stationId, limit, date); },
    listByRoute(routeId, limit = 20, date = new Date()) { return listPublic('route_id', routeId, limit, date); },
    get(id, date = new Date()) { prune(date); return db.prepare('SELECT * FROM reports WHERE id = ?').get(id); },
    getPublicPhoto(id, date = new Date()) {
      prune(date);
      return db.prepare(`SELECT photo_mime AS mime, photo_data AS data FROM reports WHERE id = ? AND ${publicCondition} AND photo_data IS NOT NULL`).get(id, cutoff(date));
    },
    reviewList({ status = 'pending', limit = 50 } = {}, date = new Date()) {
      prune(date);
      if (!['pending', 'published', 'resolved', 'rejected', 'all'].includes(status)) throw new RangeError('Estado de moderación inválido.');
      return db.prepare(`SELECT ${columns}, publication_consent AS publicationConsent,
        photo_data IS NOT NULL AS hasPhoto FROM reports ${status === 'all' ? '' : 'WHERE status = ?'}
        ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(...(status === 'all' ? [] : [status]), boundedLimit(limit));
    },
    moderationHistory(id) { return db.prepare('SELECT action, reviewer, note, created_at AS createdAt FROM report_moderation_events WHERE report_id = ? ORDER BY id').all(id); },
    moderate(id, action, { reviewer, note = '', reviewed = false } = {}, date = new Date()) {
      if (typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 100 || /[\u0000-\u001f\u007f]/.test(reviewer)) throw new RangeError('Identifica a la persona revisora (hasta 100 caracteres).');
      if (typeof note !== 'string' || note.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) throw new RangeError('La nota de moderación no es válida.');
      if (!['publish', 'reject', 'resolve', 'unpublish'].includes(action)) throw new RangeError('Acción de moderación inválida.');
      if (action === 'publish' && !reviewed) throw new RangeError('Confirma la revisión del texto y la foto antes de publicar.');
      db.exec('BEGIN IMMEDIATE');
      try {
        prune(date);
        const report = store.get(id, date);
        if (!report) { db.exec('COMMIT'); return false; }
        const next = { publish: 'published', reject: 'rejected', resolve: 'resolved', unpublish: 'pending' }[action];
        const allowed = action === 'publish' ? report.status === 'pending' && report.publication_consent === 1 && (report.target_type === 'station' || !!report.route_id)
          : action === 'resolve' ? report.status === 'published'
          : action === 'reject' ? ['pending', 'published'].includes(report.status) : report.status !== 'pending';
        if (!allowed) { db.exec('COMMIT'); return false; }
        db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(next, id);
        db.prepare('INSERT INTO report_moderation_events(report_id, action, reviewer, note, created_at) VALUES (?,?,?,?,?)').run(id, action, reviewer.trim(), note.trim(), date.toISOString());
        db.exec('COMMIT'); return true;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    publish(id, options, date = new Date()) { return store.moderate(id, 'publish', options, date); },
    summary({ stationId, routeId, status = 'public' } = {}, date = new Date()) {
      prune(date);
      if (!['public', 'all', 'pending', 'published', 'resolved', 'rejected'].includes(status)) throw new RangeError('Estado de resumen inválido.');
      const where = ['created_at >= ?'], params = [cutoff(date)];
      if (status === 'public') where.push("status IN ('published','resolved') AND publication_consent = 1");
      else if (status !== 'all') { where.push('status = ?'); params.push(status); }
      if (stationId) { where.push('station_id = ?'); params.push(stationId); }
      if (routeId) { where.push('route_id = ?'); params.push(routeId); }
      const targets = db.prepare(`SELECT target_type AS targetType, station_id AS stationId, route_id AS routeId,
        category, status, COUNT(*) AS count, MAX(created_at) AS latestAt FROM reports WHERE ${where.join(' AND ')}
        GROUP BY target_type, station_id, route_id, category, status ORDER BY count DESC, latestAt DESC`).all(...params);
      const result = { total: 0, open: 0, resolved: 0, byCategory: {}, targets };
      for (const row of targets) {
        result.total += row.count;
        if (row.status === 'published') result.open += row.count;
        if (row.status === 'resolved') result.resolved += row.count;
        const category = result.byCategory[row.category] ??= { total: 0, open: 0, resolved: 0 };
        category.total += row.count;
        if (row.status === 'published') category.open += row.count;
        if (row.status === 'resolved') category.resolved += row.count;
      }
      return result;
    },
    close() { db.close(); },
  };
  return store;
}
