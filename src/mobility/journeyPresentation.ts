import type { MobilityStep } from './types';

/** A short walk between vehicles is a transfer; access and final walks stay explicit. */
export function isCompactTransfer(steps: readonly MobilityStep[], index: number): boolean {
  const step = steps[index];
  return !!(
    step?.mode === 'walk' &&
    index > 0 &&
    index < steps.length - 1 &&
    steps[index - 1].mode !== 'walk' &&
    steps[index + 1].mode !== 'walk' &&
    Number.isFinite(step.minutes) &&
    step.minutes >= 0 &&
    step.minutes < 3 &&
    Number.isFinite(step.distanceMeters) &&
    step.distanceMeters >= 0 &&
    step.distanceMeters < 250
  );
}

export function presentJourneySteps(steps: readonly MobilityStep[]) {
  return steps.map((step, index) =>
    isCompactTransfer(steps, index)
      ? { kind: 'transfer' as const, step, index, nextTransport: steps[index + 1] }
      : { kind: 'leg' as const, step, index },
  );
}

/** These accents identify stages and networks, without claiming an official vehicle color. */
export function journeyStepAccent(step: MobilityStep): string {
  if (step.mode === 'walk') return '#9a7137';
  if (step.mode === 'metro' && /^#[a-f\d]{6}$/i.test(step.color || '')) return step.color!;
  return (
    (
      {
        transmetro: '#00816e',
        regioruta: '#46794d',
        ecovia: '#a54545',
        'muevo-leon': '#4975a4',
        'troncales-integradas': '#4975a4',
      } as Record<string, string>
    )[step.networkId || ''] || '#197467'
  );
}
