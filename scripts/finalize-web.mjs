import { readdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
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
const allAssets = await collectAssets(resolve(root, 'assets'));
let assets = allAssets;
// Keep planning and active guidance deferred, but make the Red screen itself
// available even when it has never been opened before losing connectivity.
let manifest;
try {
  manifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (manifest?.['index.html']) {
  const initial = new Set();
  const visited = new Set();
  function visit(key, optionalMap = false) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest dependency: ${key}`);
    for (const file of [chunk.file, ...(chunk.css || []), ...(chunk.assets || [])]) {
      // This 497 KiB basemap is optional decoration: station/route vectors still
      // render without it. Cache it on first map use instead of doubling the
      // initial download. Public mobility JSON remains opt-in in its data store.
      if (optionalMap && /^assets\/monterrey-map-[\w-]+\.svg$/.test(file)) continue;
      if (file?.startsWith('assets/')) initial.add(`/${file}`);
    }
    for (const dependency of chunk.imports || []) visit(dependency, optionalMap);
  }
  visit('index.html');
  visit('src/components/NetworkExplorer.tsx', true);
  assets = allAssets.filter((asset) => initial.has(asset));
  if (!assets.some((asset) => asset.endsWith('.js')))
    throw new Error('The initial manifest has no JavaScript entry.');
}
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
    {
      version,
      files: sizes,
      deferredAssets: allAssets.filter((asset) => !assets.includes(asset)),
      totalBytes: sizes.reduce((total, file) => total + file.bytes, 0),
    },
    null,
    2,
  ),
);
// The build manifest is only used above. Do not package hidden build metadata in Android.
if (manifest) {
  await unlink(resolve(root, '.vite/manifest.json'));
  try {
    await rmdir(resolve(root, '.vite'));
  } catch (error) {
    if (error.code !== 'ENOTEMPTY') throw error;
  }
}
console.log(
  `Offline precache: ${assets.length} assets · ${Math.round(sizes.reduce((total, file) => total + file.bytes, 0) / 1024)} KiB total`,
);
