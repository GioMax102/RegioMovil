import { createReportStore } from '../server/storage.mjs';

const [databasePath, reportId, action] = process.argv.slice(2);
if (!databasePath || !reportId || action !== 'publish') {
  console.error('Uso: node scripts/moderate-report.mjs <ruta-db> <id-reporte> publish');
  process.exitCode = 2;
} else {
  const store = createReportStore(databasePath);
  try {
    const report = store.get(reportId);
    if (!report) throw new Error('No existe ese reporte.');
    if (!report.publication_consent) throw new Error('El reporte no tiene consentimiento para publicarse.');
    if (!store.publish(reportId)) throw new Error(`El reporte no está pendiente (estado: ${report.status}).`);
    console.log(`Reporte ${reportId} publicado en la estación ${report.station_id}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    store.close();
  }
}
