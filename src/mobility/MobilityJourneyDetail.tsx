import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BusFront,
  Clock3,
  Footprints,
  Navigation,
  Repeat2,
  TrainFront,
} from 'lucide-react';
import MobilityMap from './MobilityMap';
import { networkLabel } from './networks';
import { journeyStepAccent, presentJourneySteps } from './journeyPresentation';
import { journeyTransfers } from './transferStations';
import TransferStationActions from './TransferStationActions';
import type { MobilityJourney, MobilityNetwork } from './types';
import ServiceIdentity from '../components/ServiceIdentity';
import './journeyDetail.css';

const ActiveJourney = lazy(() => import('./ActiveJourney'));

export default function MobilityJourneyDetail({
  journey,
  network,
  onGuidanceChange,
  embedded = false,
  onStartJourney,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
  onGuidanceChange?: (guiding: boolean) => void;
  embedded?: boolean;
  onStartJourney?: () => void;
}) {
  const [guiding, setGuiding] = useState(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const wasGuiding = useRef(false);
  useEffect(() => {
    if (!guiding && wasGuiding.current) startButton.current?.focus();
    wasGuiding.current = guiding;
  }, [guiding]);
  const routeIds = new Set(journey.steps.map((step) => step.lineId));
  const sourceIds = new Set(
    network.routes.filter((route) => routeIds.has(route.id)).flatMap((route) => route.sourceIds),
  );
  const unverifiedBus = journey.steps.some(
    (step) => step.mode === 'bus' && (!step.stopOrderVerified || step.directionVerified !== true),
  );
  const transfers = journeyTransfers(journey.steps);
  if (guiding)
    return (
      <Suspense fallback={<p role="status">Abriendo tu guía de viaje…</p>}>
        <ActiveJourney
          key={journey.id}
          journey={journey}
          network={network}
          autoStart
          onFinish={() => {
            setGuiding(false);
            onGuidanceChange?.(false);
          }}
        />
      </Suspense>
    );
  return (
    <div className="journey-detail">
      <div className="journey-detail-summary" aria-label="Resumen del trayecto">
        <span className="journey-detail-duration">
          <Clock3 size={16} aria-hidden="true" />
          <strong>
            {journey.etaRange[0]}–{journey.etaRange[1]} min
          </strong>
        </span>
        <span>
          <Repeat2 size={15} aria-hidden="true" />
          {journey.transfers === 0
            ? 'Sin transbordos'
            : `${journey.transfers} ${journey.transfers === 1 ? 'transbordo' : 'transbordos'}`}
        </span>
        <span>
          <Footprints size={15} aria-hidden="true" />
          {Math.round(journey.walkingMeters)} m a pie
        </span>
      </div>
      {unverifiedBus && (
        <p className="journey-detail-caution journey-detail-boarding">
          Autobús: confirma el sentido al abordar.
        </p>
      )}
      <button
        ref={startButton}
        type="button"
        className="primary-button full-width journey-start"
        onClick={() => {
          if (onStartJourney) {
            onStartJourney();
            return;
          }
          setGuiding(true);
          onGuidanceChange?.(true);
        }}
      >
        <Navigation size={18} aria-hidden="true" /> Iniciar trayecto
      </button>
      {!embedded && <MobilityMap key={journey.id} journey={journey} network={network} />}
      <ol className="journey-detail-steps" aria-label="Etapas del trayecto">
        {presentJourneySteps(journey.steps).map((entry) => {
          const { step, index } = entry;
          const transfer = transfers.find((point) => point.afterStepIndex === index);
          if (entry.kind === 'transfer')
            return (
              <li
                className="journey-detail-transfer journey-stage-transfer"
                key={`transfer:${step.fromId}:${step.toId}:${index}`}
              >
                <span className="mobility-step-icon transfer">
                  <Repeat2 size={15} aria-hidden="true" />
                </span>
                <div className="journey-detail-transfer-body">
                  <strong>Cambia a {entry.nextTransport.lineName}</strong>
                  <span>
                    {Math.round(step.distanceMeters)} m entre paradas · {step.minutes} min
                  </span>
                </div>
              </li>
            );
          return (
            <li
              key={`${step.lineId}:${step.fromId}:${step.toId}:${index}`}
              className={`journey-stage-${step.mode === 'walk' ? 'walk' : 'ride'}`}
              style={{ '--journey-stage-color': journeyStepAccent(step) } as React.CSSProperties}
            >
              <span className={`mobility-step-icon ${step.mode}`}>
                {step.mode === 'walk' ? (
                  <Footprints size={16} aria-hidden="true" />
                ) : step.mode === 'bus' ? (
                  <BusFront size={16} aria-hidden="true" />
                ) : (
                  <TrainFront size={16} aria-hidden="true" />
                )}
              </span>
              <div className="journey-detail-step-body">
                {step.mode === 'bus' && (
                  <span className="journey-detail-network">{networkLabel(step.networkId)}</span>
                )}
                <h3>{step.mode === 'walk' ? 'Camina' : step.lineName}</h3>
                <div className="journey-detail-endpoints">
                  <span>{step.from}</span>
                  <ArrowRight size={12} aria-label="hasta" />
                  <span>{step.to}</span>
                </div>
                {step.mode === 'bus' && step.directionVerified !== true && (
                  <span className="journey-detail-caution">Sentido por confirmar</span>
                )}
                {step.mode !== 'walk' && (
                  <details className="journey-service-details">
                    <summary>Unidad y pago</summary>
                    <ServiceIdentity
                      key={step.lineId}
                      networkId={
                        step.networkId ??
                        network.routes.find((route) => route.id === step.lineId)?.networkId ??
                        (step.mode === 'metro' ? 'metrorrey' : 'unknown')
                      }
                      routeId={step.lineId}
                      code={
                        step.code ??
                        network.routes.find((route) => route.id === step.lineId)?.code ??
                        step.lineName
                      }
                      mode={step.mode}
                    />
                  </details>
                )}
                {transfer && <TransferStationActions transfer={transfer} network={network} />}
              </div>
              <div className="journey-detail-step-meta">
                <span>{step.minutes} min</span>
                <small>
                  {step.mode === 'walk'
                    ? `${Math.round(step.distanceMeters)} m`
                    : `${step.stationCount} tramos`}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
      <details className="journey-detail-sources">
        <summary>Información del trayecto</summary>
        <p>
          Tiempo y afluencia simulados. Caminatas aproximadas. La guía funciona con la app abierta y
          el GPS en tu dispositivo; se pausa al salir.
        </p>
        <p>
          Red experimental con trazos y puntos publicados. Las caminatas punteadas son enlaces
          aproximados: verifica accesos y cruces. No son indicaciones por calles. La accesibilidad
          no está confirmada.
        </p>
        {unverifiedBus && (
          <p>
            Autobús: orden inferido del mapa y sentido por confirmar. Confirma el abordaje antes de
            viajar.
          </p>
        )}
        {network.sources
          ?.filter((source) => sourceIds.has(source.id))
          .map((source) => (
            <p key={source.id}>
              <a className="mobility-osm-link" href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            </p>
          ))}
      </details>
    </div>
  );
}
