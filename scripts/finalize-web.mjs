import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve('dist');
async function collectAssets(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return collectAssets(resolve(directory, entry.name), `${relative}/`);
      return entry.isFile() && !entry.name.endsWith('.map') ? [`/assets/${relative}`] : [];
    }),
  );
  return files.flat().sort();
}
const assets = await collectAssets(resolve(root, 'assets'));
const template = await readFile('public/sw.js', 'utf8');
if (!template.includes("'regiomovil-shell-v1'") || !template.includes('/* BUILD_ASSETS */ []'))
  throw new Error('The service worker template is missing its version or precache marker.');
const files = [
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  ...assets.map((asset) => asset.slice(1)),
];
const contents = await Promise.all(files.map((file) => readFile(resolve(root, file))));
// Include non-hashed public files so changing an icon/manifest also replaces its cache.
const digest = createHash('sha256').update(template);
files.forEach((file, index) =>
  digest.update(file).update('\0').update(contents[index]).update('\0'),
);
const version = digest.digest('hex').slice(0, 12);
const worker = template
  .replace("'regiomovil-shell-v1'", `'regiomovil-shell-${version}'`)
  .replace('/* BUILD_ASSETS */ []', JSON.stringify(assets));
await writeFile(resolve(root, 'sw.js'), worker);
const sizes = files.map((file, index) => ({ file, bytes: contents[index].length }));
sizes.push({ file: 'sw.js', bytes: Buffer.byteLength(worker) });
await writeFile(
  resolve(root, 'bundle-stats.json'),
  JSON.stringify(
    { version, files: sizes, totalBytes: sizes.reduce((total, file) => total + file.bytes, 0) },
    null,
    2,
  ),
);
console.log(
  `Offline precache: ${assets.length} assets · ${Math.round(sizes.reduce((total, file) => total + file.bytes, 0) / 1024)} KiB total`,
);
