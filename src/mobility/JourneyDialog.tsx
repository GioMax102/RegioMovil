import { useState, type ReactNode } from 'react';
import { Dialog } from '../components/Primitives';
import MobilityJourneyDetail from './MobilityJourneyDetail';
import type { MobilityJourney, MobilityNetwork } from './types';

/** One presentation for guidance opened from a new plan or an offline snapshot. */
export default function JourneyDialog({
  title,
  journey,
  network,
  onClose,
  before,
  after,
}: {
  title: string;
  journey: MobilityJourney;
  network: MobilityNetwork;
  onClose: () => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const [guiding, setGuiding] = useState(false);
  return (
    <Dialog
      title={guiding ? 'Sigue tu ruta' : title}
      onClose={onClose}
      wide
      className={guiding ? 'journey-guidance-dialog' : ''}
    >
      {!guiding && before}
      <MobilityJourneyDetail
        key={journey.id}
        journey={journey}
        network={network}
        onGuidanceChange={setGuiding}
      />
      {!guiding && after}
    </Dialog>
  );
}
