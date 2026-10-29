import { statSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createReportStore } from '../server/storage.mjs';

const usage = `Uso: node scripts/moderate-report.mjs <ruta-db> <acción> [id] [destino] [opciones]
  list [--status pending|published|resolved|rejected|all] [--limit 50]
  show <id>                         Texto, consentimiento e historial; no imprime la foto.
  export-photo <id> <destino>       Copia privada 0600; nunca sobrescribe archivos.
  publish <id> --reviewer <nombre> --reviewed [--note <nota>]
  reject|resolve|unpublish <id> --reviewer <nombre> [--note <nota>]
  summary [--status public|pending|published|resolved|rejected|all]

Revisa el texto y, si existe, exporta e inspecciona la foto antes de publicar.
--reviewed confirma esa revisión; el consentimiento de publicación sigue siendo obligatorio.
unpublish retira el reporte y la foto inmediatamente de las respuestas públicas.`;

let store;
try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    status: { type: 'string' }, limit: { type: 'string' }, reviewer: { type: 'string' },
    note: { type: 'string' }, reviewed: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(usage); }
  else {
    const [databasePath, action, reportId, destination, ...extra] = positionals;
    if (!databasePath || !action || extra.length || !['list', 'show', 'export-photo', 'publish', 'reject', 'resolve', 'unpublish', 'summary'].includes(action)) throw new Error(usage);
    if (!statSync(databasePath).isFile()) throw new Error('La ruta de base de datos debe ser un archivo existente.');
    if (['list', 'summary'].includes(action) && reportId) throw new Error('Esta acción no recibe un identificador de reporte.');
    if (!['list', 'summary'].includes(action) && !reportId) throw new Error('Indica el identificador del reporte.');
    if (action !== 'export-photo' && destination) throw new Error('Esta acción no recibe un destino de archivo.');
    store = createReportStore(databasePath);
    if (action === 'list') {
      const limit = values.limit === undefined ? 50 : Number(values.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('El límite debe ser de 1 a 100.');
      console.log(JSON.stringify(store.reviewList({ status: values.status || 'pending', limit }), null, 2));
    } else if (action === 'summary') {
      console.log(JSON.stringify({ ...store.summary({ status: values.status || 'public' }), notice: 'Conteos de reportes, no de personas únicas ni una clasificación automática de inversión.' }, null, 2));
    } else {
      const report = store.get(reportId);
      if (!report) throw new Error('No existe ese reporte.');
      if (action === 'show') {
        const { photo_data, ...metadata } = report;
        console.log(JSON.stringify({ ...metadata, photoBytes: photo_data?.length || 0, moderation: store.moderationHistory(reportId) }, null, 2));
      } else if (action === 'export-photo') {
        if (!destination) throw new Error('Indica el archivo de destino para la foto privada.');
        if (!report.photo_data) throw new Error('El reporte no tiene foto.');
        writeFileSync(destination, report.photo_data, { mode: 0o600, flag: 'wx' });
        console.log(`Foto exportada de forma privada (${report.photo_mime}, ${report.photo_data.length} bytes): ${destination}`);
      } else {
        if (action === 'publish' && !report.publication_consent) throw new Error('El reporte no tiene consentimiento para publicarse.');
        if (!store.moderate(reportId, action, { reviewer: values.reviewer, note: values.note || '', reviewed: values.reviewed })) throw new Error(`La transición ${action} no está permitida desde ${report.status}, o el reporte expiró.`);
        console.log(`Reporte ${reportId}: ${store.get(reportId)?.status}.`);
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store?.close(); }
