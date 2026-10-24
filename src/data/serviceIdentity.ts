/** Curated access guidance, independent of route geometry and simulated arrivals.
 * A network-wide announcement does not establish a particular bus's validator or livery.
 */
export const serviceIdentityVerifiedAt = '2026-10-23';

export const serviceIdentitySources = {
  metrorrey: {
    title: 'Metrorrey · Medios de pago',
    url: 'https://www.metrorrey.mx/',
    publisher: 'Sistema de Transporte Colectivo Metrorrey',
    verifiedAt: serviceIdentityVerifiedAt,
    scope: 'Me Muevo y código QR de Urbani para Metro y Transmetro; puntos de recarga.',
  },
  regioruta: {
    title: 'Monterrey · Tarjeta Regio Ruta',
    url: 'https://www.monterrey.gob.mx/noticias/invita-monterrey-a-tramitar-con-anticipaci%C3%B3n-la-tarjeta-regio-ruta/',
    publisher: 'Gobierno de Monterrey',
    publishedAt: '2026-08-23',
    verifiedAt: serviceIdentityVerifiedAt,
    scope: 'Servicio gratuito con tarjeta de acceso obligatoria desde el 1 de septiembre de 2026.',
  },
  ima: {
    title: 'IMA · Atención ciudadana y medios de pago',
    url: 'https://www.imanuevoleon.mx/atencionciudadana',
    publisher: 'Instituto de Movilidad y Accesibilidad de Nuevo León',
    verifiedAt: serviceIdentityVerifiedAt,
    scope: 'Información general de Me Muevo y QR; no confirma aceptación por ruta urbana.',
  },
  mederos: {
    title: 'Gobierno de NL · Transmetro Garza Sada y Mederos–El Uro',
    url: 'https://beta.nl.gob.mx/es/boletines/inicia-gobernador-operaciones-de-la-ruta-transmetro-garza-sada-carretera-nacional',
    publisher: 'Gobierno del Estado de Nuevo León',
    publishedAt: '2025-05-08',
    verifiedAt: serviceIdentityVerifiedAt,
    scope:
      'Flota eléctrica verde presentada para los circuitos Garza Sada–Mederos y Mederos–El Uro. No certifica la unidad asignada hoy.',
  },
} as const;

export type ServiceIdentitySourceId = keyof typeof serviceIdentitySources;
export type PaymentMethodId = 'me-muevo' | 'urbani' | 'regioruta-card';
export type ServiceIdentityInput = {
  networkId: string;
  routeId?: string;
  code: string;
  mode?: 'metro' | 'bus';
  status?: string;
};
export type VehicleReference = {
  label: string;
  color?: string;
  note: string;
  sourceIds: readonly ServiceIdentitySourceId[];
};
export type ServiceAccess = {
  networkName: string;
  paymentStatus: 'published' | 'unknown' | 'unavailable';
  paymentMethods: readonly PaymentMethodId[];
  paymentSourceIds: readonly ServiceIdentitySourceId[];
  vehicle: VehicleReference;
  isRail: boolean;
};

export const paymentMethods: Record<
  PaymentMethodId,
  { label: string; title: string; body: readonly string[] }
> = {
  'me-muevo': {
    label: 'Me Muevo',
    title: 'Cómo pagar con Me Muevo',
    body: [
      'Acerca tu tarjeta con saldo al lector de acceso y espera la validación antes de pasar.',
      'Metrorrey informa que puedes adquirir y recargar la tarjeta en estaciones del Metro y establecimientos participantes. Pagar una recarga en efectivo no significa que el autobús acepte efectivo al abordar.',
      'Consulta la tarifa y las condiciones de transbordo vigentes con el operador. RegioMóvil no cobra ni consulta tu saldo.',
    ],
  },
  urbani: {
    label: 'Urbani · QR',
    title: 'Cómo pagar con Urbani',
    body: [
      'En la app oficial Urbani, elige el servicio que corresponde al transporte, adquiere tu viaje y presenta su código QR en el lector.',
      'Comprueba el servicio, la vigencia del código y las condiciones de transbordo antes de comprar. No supongas que un QR sirve para cualquier ruta.',
      'RegioMóvil solo ofrece esta guía: no genera boletos, procesa pagos ni necesita tus credenciales de Urbani.',
    ],
  },
  'regioruta-card': {
    label: 'Gratis · con tarjeta',
    title: 'Acceso gratuito a Regio Ruta',
    body: [
      'El servicio municipal es gratuito. Desde el 1 de septiembre de 2026, el Gobierno de Monterrey pide presentar la tarjeta Regio Ruta y validar cada viaje.',
      'El trámite de la tarjeta también es gratuito. Consulta los requisitos y centros municipales en el aviso oficial antes de acudir.',
      'Esta tarjeta es de acceso a Regio Ruta; no se presenta como una tarjeta de pago Me Muevo o Feria.',
    ],
  },
};

const unknownVehicle: VehicleReference = {
  label: 'Color por confirmar',
  note: 'Comprueba el número, el ramal y el destino del letrero. La pintura por sí sola no identifica una ruta.',
  sourceIds: [],
};
const networks: Record<string, string> = {
  metrorrey: 'Metrorrey',
  transmetro: 'Transmetro',
  regioruta: 'Regio Ruta',
  'muevo-leon': 'Muevo León / urbanas IMA',
  ecovia: 'Ecovía / GMG',
  'troncales-integradas': 'Troncales e integradas',
};

/** Deliberately conservative: unknown bus validators never inherit a payment from a color. */
export function getServiceAccess(input: ServiceIdentityInput): ServiceAccess {
  const isRail = input.mode === 'metro' || input.networkId === 'metrorrey';
  const base: ServiceAccess = {
    networkName: networks[input.networkId] ?? 'Transporte público',
    paymentStatus: 'unknown',
    paymentMethods: [],
    paymentSourceIds: ['ima'],
    vehicle: isRail
      ? {
          label: 'Identifica línea y dirección',
          note: 'El color de la línea es una referencia del mapa, no la pintura del tren.',
          sourceIds: [],
        }
      : unknownVehicle,
    isRail,
  };
  if (
    (input.status && !['published', 'operational'].includes(input.status)) ||
    (isRail && ['L4', 'L5', 'L6'].includes(input.routeId ?? input.code))
  )
    return { ...base, paymentStatus: 'unavailable', paymentSourceIds: [] };
  if (input.networkId === 'regioruta')
    return {
      ...base,
      paymentStatus: 'published',
      paymentMethods: ['regioruta-card'],
      paymentSourceIds: ['regioruta'],
    };
  if (
    input.networkId === 'metrorrey' ||
    input.networkId === 'transmetro' ||
    (input.networkId === 'ecovia' && input.routeId === 'ecovia-garcia-monterrey-guadalupe')
  ) {
    const vehicle =
      input.routeId === 'transmetro-mederos-el-uro'
        ? {
            label: 'Verde · flota de referencia',
            color: '#44b873',
            note: 'El boletín oficial de mayo de 2025 presenta autobuses verdes para Mederos–El Uro. Puede cambiar la unidad asignada; confirma siempre el letrero.',
            sourceIds: ['mederos'] as const,
          }
        : base.vehicle;
    return {
      ...base,
      vehicle,
      paymentStatus: 'published',
      paymentMethods: ['me-muevo', 'urbani'],
      paymentSourceIds: ['metrorrey'],
    };
  }
  return base;
}
