#!/usr/bin/env node
import { DatabaseSync, backup } from 'node:sqlite';
import { chmod, link, lstat, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function inspectReportBackup(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('La base debe ser un archivo regular, sin enlace simbólico.');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok')
      throw new Error('La comprobación de integridad falló.');
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('La comprobación de relaciones falló.');
    const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    if (tables.has('reports') && tables.has('report_moderation_events')) {
      const reportCount = db.prepare('SELECT COUNT(*) AS count FROM reports').get().count;
      const moderationEvents = db
        .prepare('SELECT COUNT(*) AS count FROM report_moderation_events')
        .get().count;
      return {
        integrity: 'ok',
        databaseKind: 'reports',
        schemaVersion,
        reportCount,
        moderationEvents,
      };
    }
    if (['user', 'session', 'account'].every((name) => tables.has(name))) {
      return {
        integrity: 'ok',
        databaseKind: 'administration',
        schemaVersion,
        accountCount: db.prepare('SELECT COUNT(*) AS count FROM "user"').get().count,
      };
    }
    throw new Error('No se reconoce el esquema de RegioMóvil.');
  } finally {
    db.close();
  }
}

// Online Backup API includes committed WAL pages. A private temporary directory
// protects the working file; hard-link publication is atomic and never replaces
// a destination which already exists, including symlinks.
export async function backupReports(sourcePath, destinationPath) {
  const source = resolve(sourcePath),
    destination = resolve(destinationPath);
  if (source === destination) throw new Error('Origen y destino deben ser distintos.');
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink())
    throw new Error('El origen debe ser un archivo regular, sin enlace simbólico.');
  const parent = await realpath(dirname(destination));
  const parentInfo = await lstat(parent);
  if (process.platform !== 'win32' && parentInfo.mode & 0o077)
    throw new Error('El directorio de destino debe ser privado (chmod 700).');
  try {
    await lstat(destination);
    throw new Error('El destino ya existe; no se sobrescribe.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = await mkdtemp(join(parent, '.regiomovil-backup-'));
  await chmod(temporary, 0o700);
  const staging = join(temporary, 'snapshot.sqlite');
  let sourceDb;
  try {
    sourceDb = new DatabaseSync(source, { readOnly: true });
    sourceDb.exec('PRAGMA busy_timeout = 5000;');
    await backup(sourceDb, staging, { rate: 100 });
    sourceDb.close();
    sourceDb = undefined;
    await chmod(staging, 0o600);
    const result = await inspectReportBackup(staging);
    const handle = await open(staging, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(staging, destination);
    if (process.platform !== 'win32') {
      const directory = await open(parent, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
    return result;
  } finally {
    sourceDb?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main(args) {
  if (args.length === 2 && args[0] === '--check') {
    console.log(JSON.stringify(await inspectReportBackup(resolve(args[1]))));
    return;
  }
  if (args.length !== 2)
    throw new Error(
      'Uso: node scripts/backup-reports.mjs ORIGEN.sqlite DESTINO-NUEVO.sqlite | --check COPIA.sqlite',
    );
  console.log(JSON.stringify(await backupReports(args[0], args[1])));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    // Do not print SQLite rows, input paths, secret values or exception stacks.
    console.error(
      'No se pudo completar/verificar el respaldo. Revisa origen, integridad, permisos 0700 del directorio y que el destino no exista.',
    );
    process.exitCode = 1;
  });
}
