import { Route } from 'lucide-react';

/** A stable landmark while an optional screen downloads, without a fake percent. */
export default function SectionLoading({ label }: { label: string }) {
  return (
    <div className="section-loading" role="status">
      <span className="section-loading-icon" aria-hidden="true">
        <Route size={24} />
      </span>
      <div className="section-loading-copy">
        <strong>{label}</strong>
        <span aria-hidden="true" />
      </div>
    </div>
  );
}
