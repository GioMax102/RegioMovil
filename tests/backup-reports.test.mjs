import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, readFile, stat, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createReportStore } from '../server/storage.mjs';
import { backupReports, inspectReportBackup } from '../scripts/backup-reports.mjs';

test('online backup includes committed WAL, preserves private state/history and restores independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-backup-'));
  const source = join(directory, 'source.sqlite'),
    destination = join(directory, 'backup.sqlite');
  const store = createReportStore(source);
  try {
    const report = store.add({
      stationId: 'talleres',
      category: 'infrastructure',
      title: 'Falta banca',
      detail: 'No hay banca en la estación',
      publicationConsent: true,
    });
    store.moderate(report.id, 'publish', { reviewer: 'Revisión de prueba', reviewed: true });
    const second = store.add({
      stationId: 'talleres',
      category: 'condition',
      title: 'Reporte privado',
      detail: 'Una observación privada',
    });
    const result = await backupReports(source, destination);
    assert.equal(result.integrity, 'ok');
    assert.equal(result.reportCount, 2);
    assert.equal(result.moderationEvents, 1);
    if (process.platform !== 'win32') assert.equal((await stat(destination)).mode & 0o777, 0o600);
    const restored = createReportStore(destination);
    try {
      assert.equal(restored.get(report.id).status, 'published');
      assert.equal(restored.get(second.id).status, 'pending');
      assert.equal(restored.list('talleres').length, 1);
      assert.equal(restored.moderationHistory(report.id).length, 1);
      store.add({
        stationId: 'talleres',
        category: 'condition',
        title: 'Después de copia',
        detail: 'Este registro es posterior al respaldo',
      });
      assert.equal(restored.reviewList({ status: 'all' }).length, 2);
    } finally {
      restored.close();
    }
    assert.equal((await inspectReportBackup(destination)).reportCount, 2);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('backup refuses overwrites, symlinks, missing sources and public directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-backup-'));
  const source = join(directory, 'source.sqlite'),
    destination = join(directory, 'backup.sqlite');
  const store = createReportStore(source);
  try {
    await backupReports(source, destination);
    const before = await readFile(destination);
    await assert.rejects(backupReports(source, destination), /existe/);
    assert.deepEqual(await readFile(destination), before);
    await assert.rejects(backupReports(source, source), /distintos/);
    await assert.rejects(
      backupReports(join(directory, 'absent.sqlite'), join(directory, 'new.sqlite')),
    );
    await symlink(destination, join(directory, 'link.sqlite'));
    await assert.rejects(backupReports(source, join(directory, 'link.sqlite')), /existe/);
    await assert.rejects(
      backupReports(join(directory, 'link.sqlite'), join(directory, 'new.sqlite')),
      /regular/,
    );
    if (process.platform !== 'win32') {
      await chmod(directory, 0o755);
      await assert.rejects(backupReports(source, join(directory, 'new.sqlite')), /privado/);
      await chmod(directory, 0o700);
    }
    assert.equal(
      (await readdir(directory)).some((name) => name.startsWith('.regiomovil-backup-')),
      false,
    );
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid database fails verification and publishes no partial snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-backup-'));
  const source = join(directory, 'unrelated.sqlite'),
    destination = join(directory, 'backup.sqlite');
  const db = new DatabaseSync(source);
  db.exec('CREATE TABLE unrelated(id INTEGER)');
  db.close();
  try {
    await assert.rejects(backupReports(source, destination));
    await assert.rejects(stat(destination), { code: 'ENOENT' });
    assert.deepEqual(await readdir(directory), ['unrelated.sqlite']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('administrative database snapshot verifies account schema without exporting identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'regiomovil-admin-backup-'));
  const source = join(directory, 'auth.sqlite'),
    destination = join(directory, 'auth-copy.sqlite');
  const db = new DatabaseSync(source);
  db.exec(
    'CREATE TABLE "user"(id TEXT PRIMARY KEY, email TEXT); CREATE TABLE session(id TEXT); CREATE TABLE account(id TEXT)',
  );
  db.prepare('INSERT INTO "user" VALUES (?, ?)').run('private-user-id', 'private@example.test');
  try {
    const result = await backupReports(source, destination);
    assert.deepEqual(result, {
      integrity: 'ok',
      databaseKind: 'administration',
      schemaVersion: 0,
      accountCount: 1,
    });
    assert.doesNotMatch(JSON.stringify(result), /private|example/);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
