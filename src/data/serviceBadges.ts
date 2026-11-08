/** UI identifiers only: these colors do not certify a vehicle's livery or operation. */
type BadgeColors = { background: string; foreground: string };
export type ServiceBadgeInput = {
  networkId: string;
  code: string;
  routeId?: string;
  mode?: 'metro' | 'bus';
};

const lineColors: Record<string, BadgeColors> = {
  L1: { background: '#ffbc45', foreground: '#432900' },
  L2: { background: '#47bd7d', foreground: '#093c29' },
  L3: { background: '#ef6573', foreground: '#45101b' },
  L4: { background: '#b9a1e5', foreground: '#34234f' },
  L5: { background: '#a1d7f0', foreground: '#123f55' },
  L6: { background: '#edb391', foreground: '#4d2a16' },
};
const services: Record<string, BadgeColors & { name: string }> = {
  metrorrey: { name: 'Metro', background: '#194f43', foreground: '#ffffff' },
  transmetro: { name: 'Transmetro', background: '#00756a', foreground: '#ffffff' },
  regioruta: { name: 'Regio Ruta', background: '#2857aa', foreground: '#ffffff' },
  'muevo-leon': { name: 'Muevo León', background: '#d3ec58', foreground: '#293b13' },
  ecovia: { name: 'Ecovía / GMG', background: '#a43e78', foreground: '#ffffff' },
  'troncales-integradas': {
    name: 'Troncales e integradas',
    background: '#7053a4',
    foreground: '#ffffff',
  },
};

export function getServiceBadge(input: ServiceBadgeInput) {
  const service = services[input.networkId] ?? {
    name: 'Transporte público',
    background: '#385563',
    foreground: '#ffffff',
  };
  const line =
    (input.mode === 'metro' || input.networkId === 'metrorrey') &&
    lineColors[input.routeId ?? input.code];
  return {
    name: service.name,
    background: line ? line.background : service.background,
    foreground: line ? line.foreground : service.foreground,
  };
}
