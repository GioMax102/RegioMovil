import { planMobility } from '../../server/mobility.mjs';
import type { MobilityNetwork, MobilityRequest } from './types';

let network: MobilityNetwork;
// The worker receives only the public network once, then ephemeral route requests.
self.addEventListener(
  'message',
  ({
    data,
  }: MessageEvent<{
    type: string;
    id: number;
    network: MobilityNetwork;
    request: MobilityRequest;
  }>) => {
    if (data.type === 'initialize') {
      network = data.network;
      return;
    }
    if (data.type !== 'plan') return;
    try {
      self.postMessage({ id: data.id, plan: planMobility(network, data.request) });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : 'No pudimos calcular ese recorrido.',
      });
    }
  },
);
