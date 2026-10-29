import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline file-link check. External URLs and Markdown heading anchors need review.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const required = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/README.md',
  'docs/especificacion-tecnica.md',
  'docs/api.md',
  'docs/propuesta-social.md',
  'docs/pitch.md',
  'docs/seguridad-y-operacion.md',
  'docs/hoja-de-ruta.md',
  'docs/revision-tecnica.md',
  'docs/licencias-y-datos.md',
];
const failures = [];
for (const name of required) {
  try {
    const content = await readFile(path.join(root, name), 'utf8');
    if (!/^#\s+\S/m.test(content)) failures.push(`${name}: falta un título principal`);
  } catch {
    failures.push(`${name}: documento requerido ausente`);
  }
}

async function markdownFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(relative)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(relative);
  }
  return files;
}
const rootDocs = (await readdir(root)).filter((name) => name.endsWith('.md'));
const files = [
  ...rootDocs,
  ...(await markdownFiles('docs')),
  ...(await markdownFiles('.github')),
  'models/README.md',
  'src/data/monterrey-map.md',
];
let links = 0;
for (const name of files) {
  // Fenced examples are not links. Both inline and reference-style links supported.
  const markdown = (await readFile(path.join(root, name), 'utf8')).replace(
    /^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm,
    '',
  );
  const targets = [
    ...[
      ...markdown.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+['"][^\n]*?['"])?\s*\)/g),
    ].map((match) => match[1]),
    ...[...markdown.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)].map((match) => match[1]),
  ];
  for (let target of targets) {
    target = target.replace(/^<|>$/g, '');
    if (
      !target ||
      target.startsWith('#') ||
      target.startsWith('//') ||
      /^[a-z][a-z\d+.-]*:/i.test(target)
    )
      continue;
    // Historical /tmp evidence is ephemeral; never treat it as a portable link.
    if (target.startsWith('/tmp/')) continue;
    links++;
    try {
      const local = decodeURIComponent(target.split('#')[0].split('?')[0]);
      const resolved = path.resolve(path.dirname(path.join(root, name)), local);
      if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('fuera del repositorio');
      await stat(resolved);
    } catch {
      failures.push(`${name}: enlace local inválido: ${target}`);
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Documentación: ${files.length} archivos y ${links} enlaces locales válidos. No se comprueban URLs externas ni anclas.`,
  );
}
