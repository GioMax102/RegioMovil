import { Info } from 'lucide-react';
import type { ReportDataset } from '../reportsApi';
import './reportDatasetNotice.css';

export default function ReportDatasetNotice({ dataset }: { dataset?: ReportDataset }) {
  if (dataset?.kind !== 'synthetic') return null;
  return (
    <aside className="report-dataset-notice" aria-label="Procedencia de los reportes">
      <Info size={18} aria-hidden="true" />
      <span>
        <strong>Escenario de visualización</strong>
        <span>Reportes inventados para explorar la app.</span>
      </span>
    </aside>
  );
}
