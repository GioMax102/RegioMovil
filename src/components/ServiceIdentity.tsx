import { useState } from 'react';
import {
  BusFront,
  ChevronRight,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Info,
  ScanLine,
  TrainFront,
} from 'lucide-react';
import {
  getServiceAccess,
  paymentMethods,
  serviceIdentitySources,
  serviceIdentityVerifiedAt,
  type PaymentMethodId,
  type ServiceIdentityInput,
  type ServiceIdentitySourceId,
} from '../data/serviceIdentity';
import { Dialog } from './Primitives';
import './serviceIdentity.css';

type Information = PaymentMethodId | 'unknown' | 'vehicle' | null;

/** Shared by published service details and a planned ride. No tickets or payment SDKs. */
export default function ServiceIdentity({
  compact = false,
  ...input
}: ServiceIdentityInput & { compact?: boolean }) {
  const access = getServiceAccess(input);
  const [information, setInformation] = useState<Information>(null);
  const VehicleIcon = access.isRail ? TrainFront : BusFront;
  const method =
    information && information in paymentMethods
      ? paymentMethods[information as PaymentMethodId]
      : null;
  const sourceIds: readonly ServiceIdentitySourceId[] =
    information === 'vehicle' ? access.vehicle.sourceIds : access.paymentSourceIds;
  const title =
    information === 'vehicle'
      ? 'Cómo reconocer la unidad'
      : (method?.title ?? 'Confirma el pago antes de abordar');

  return (
    <section
      className={`service-identity${compact ? ' compact' : ''}`}
      aria-label={`Identificación y pago de ${input.code}`}
    >
      <div className="service-identity-heading">
        <span className="service-identity-number">
          <VehicleIcon size={18} aria-hidden="true" />
          <strong>{input.code}</strong>
        </span>
        {!compact && <span>{access.networkName}</span>}
        {!compact && (
          <button
            className="service-vehicle-reference"
            type="button"
            onClick={() => setInformation('vehicle')}
          >
            {!access.isRail && (
              <span
                className={`service-vehicle-swatch${access.vehicle.color ? '' : ' unknown'}`}
                style={access.vehicle.color ? { backgroundColor: access.vehicle.color } : undefined}
                aria-hidden="true"
              />
            )}
            <span>{access.vehicle.label}</span>
            <Info size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className="service-payment-options"
        role="group"
        aria-label={`Acceso y pago · ${input.code}`}
      >
        {access.paymentMethods.map((id) => {
          const MethodIcon = id === 'urbani' ? ScanLine : CreditCard;
          return (
            <button
              key={id}
              type="button"
              className="service-payment-chip"
              onClick={() => setInformation(id)}
              aria-label={paymentMethods[id].title}
              aria-haspopup="dialog"
            >
              <MethodIcon size={16} aria-hidden="true" />
              {paymentMethods[id].label}
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          );
        })}
        {access.paymentStatus === 'unknown' && (
          <button
            type="button"
            className="service-payment-chip unconfirmed"
            onClick={() => setInformation('unknown')}
            aria-label="Cómo confirmar el pago con el operador"
            aria-haspopup="dialog"
          >
            <HelpCircle size={16} aria-hidden="true" />
            Confirmar con operador
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
        {access.paymentStatus === 'unavailable' && (
          <span className="service-access-unavailable">Servicio sin apertura confirmada</span>
        )}
      </div>
      {information && (
        <Dialog
          title={title}
          onClose={() => setInformation(null)}
          className="service-payment-dialog"
        >
          {information === 'vehicle' ? (
            <p>{access.vehicle.note}</p>
          ) : method ? (
            method.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
          ) : (
            <>
              <p>
                No contamos con confirmación del validador de esta ruta. Antes de subir, pregunta al
                operador qué medios acepta.
              </p>
              <p>
                Efectivo, Tarjeta Feria, Me Muevo y QR pueden depender de la ruta y la unidad. No se
                anuncian como aceptados sin una fuente específica.
              </p>
              <p>
                Comprueba también el ramal y el destino del letrero. El color de un autobús no
                confirma cómo se paga.
              </p>
            </>
          )}
          {access.paymentStatus === 'published' && information !== 'vehicle' && (
            <p className="service-payment-scope">
              Orientación publicada para esta red. No confirma la operación ni el validador de una
              unidad en tiempo real.
            </p>
          )}
          {sourceIds.length > 0 && (
            <div className="service-identity-sources">
              <span>
                Fuentes oficiales · consulta{' '}
                {serviceIdentityVerifiedAt.split('-').reverse().join('/')}
              </span>
              {sourceIds.map((id) => (
                <a
                  key={id}
                  href={serviceIdentitySources[id].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${serviceIdentitySources[id].title} (abre una pestaña nueva)`}
                >
                  {serviceIdentitySources[id].title}
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
          <button
            type="button"
            className="primary-button full-width"
            onClick={() => setInformation(null)}
          >
            Entendido
          </button>
        </Dialog>
      )}
    </section>
  );
}
