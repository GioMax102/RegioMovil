import type { Scenario } from './types';

export const scenarioLabels: Record<Scenario, string> = {
  normal: 'Día habitual',
  peak: 'Hora pico',
  rain: 'Con lluvia',
  disruption: 'Servicio irregular',
};
