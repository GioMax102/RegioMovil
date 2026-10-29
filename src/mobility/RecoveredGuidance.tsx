import { Dialog } from '../components/Primitives';
import ActiveJourney from './ActiveJourney';
import type { GuidanceCheckpoint } from './guidanceCheckpoint';
import './journeyDetail.css';

/** Only mounted after an explicit draft return, with fresh GPS requested by the user later. */
export default function RecoveredGuidance({
  checkpoint,
  onClose,
}: {
  checkpoint: GuidanceCheckpoint;
  onClose: () => void;
}) {
  return (
    <Dialog title="Sigue tu ruta" wide className="journey-guidance-dialog" onClose={onClose}>
      <ActiveJourney
        journey={checkpoint.journey}
        network={checkpoint.network}
        initialStepIndex={checkpoint.stepIndex}
        initialOpenReport
        onFinish={onClose}
      />
    </Dialog>
  );
}
