#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { mkdir, chmod, open, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Compose file secrets keep file ownership on Linux. Read-only secret files are
// traversable only through this private directory, then individually mounted
// into containers whose unprivileged UIDs differ. Never print their contents.
const directory = resolve('.data/monitoring-secrets');
await mkdir(directory, { recursive: true, mode: 0o700 });
if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
  throw new Error('Secret directory must not be a symlink.');
await chmod(directory, 0o700);
for (const name of ['metrics_token', 'grafana_password']) {
  const path = resolve(directory, name);
  let handle;
  try {
    handle = await open(path, 'wx', 0o400);
    await handle.writeFile(`${randomBytes(32).toString('hex')}\n`);
    await handle.sync();
    await handle.chmod(0o444);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await handle?.close();
  }
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Secret must be a regular file.');
}
console.log(
  'Secretos locales preparados en .data/monitoring-secrets; los existentes se conservan.',
);
