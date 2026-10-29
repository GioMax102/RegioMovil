import { lazy, Suspense, useEffect, useState } from 'react';
import ReportDialog, { type ReportDialogProps } from './ReportDialog';
import { markReportOpen, readReportDraft } from '../reportDraft';
import { Dialog } from './Primitives';
import type { GuidanceCheckpoint } from '../mobility/guidanceCheckpoint';

const RecoveredGuidance = lazy(() => import('../mobility/RecoveredGuidance'));

/** Only this deferred entry reads a recovery checkpoint; the application shell stays small. */
export default function ReportEntry(props: ReportDialogProps) {
  const close = () => {
    markReportOpen(false);
    props.onClose();
  };
  const [ready, setReady] = useState(false);
  const [checkpoint, setCheckpoint] = useState<GuidanceCheckpoint | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [missingGuide, setMissingGuide] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!props.initialRouteId && !props.initialStationId) {
        const draft = await readReportDraft();
        if (active && draft) setRecovery(true);
        if (draft?.context) {
          const { readGuidanceCheckpoint } = await import('../mobility/guidanceCheckpoint');
          const saved = readGuidanceCheckpoint(draft.context.journeyId);
          if (active) {
            if (saved?.stepIndex === draft.context.stepIndex) setCheckpoint(saved);
            else setMissingGuide(true);
          }
        }
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!ready)
    return (
      <Dialog title="Tu experiencia cuenta" onClose={close}>
        <p role="status">Recuperando tu borrador…</p>
      </Dialog>
    );
  if (checkpoint)
    return (
      <Suspense
        fallback={
          <Dialog title="Tu trayecto" onClose={close}>
            <p role="status">Recuperando tu guía…</p>
          </Dialog>
        }
      >
        <RecoveredGuidance checkpoint={checkpoint} onClose={close} />
      </Suspense>
    );
  return <ReportDialog {...props} recoverDraft={recovery} recoveredWithoutGuide={missingGuide} />;
}
