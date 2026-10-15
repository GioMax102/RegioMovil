import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));

test('production application stays within its low-data initial download budget', async () => {
  const report = JSON.parse(await readFile(join(root, 'bundle-stats.json'), 'utf8'));
  let actualBytes = 0;
  for (const entry of report.files) actualBytes += (await stat(join(root, entry.file))).size;
  assert.ok(actualBytes < 600 * 1024, `Initial resources grew to ${actualBytes} bytes (budget 600 KiB).`);
  const assets = await readdir(join(root, 'assets'));
  for (const name of assets.filter(name => /\.(js|css)$/.test(name))) {
    const compressed = gzipSync(await readFile(join(root, 'assets', name)));
    const budget = name.endsWith('.js') ? 110 * 1024 : 16 * 1024;
    assert.ok(compressed.length < budget, `${name} exceeds its compressed transfer budget.`);
  }
  assert.ok(!assets.some(name => name.endsWith('.map')), 'Production must not ship development source maps.');
});

test('initial HTML and styles reference local resources without remote fonts or map SDKs', async () => {
  const assets = await readdir(join(root, 'assets'));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(!/(?:src|href)=["']https?:\/\//.test(html));
  const styles = (await Promise.all(assets.filter(name => name.endsWith('.css')).map(name => readFile(join(root, 'assets', name), 'utf8')))).join('\n');
  assert.ok(!/url\(["']?https?:\/\//.test(styles), 'Fonts and visual resources must remain local.');
  assert.ok(assets.some(name => name.startsWith('inter-') && name.endsWith('.woff2')));
  assert.ok(assets.some(name => name.startsWith('montserrat-') && name.endsWith('.woff2')));
});
