import { ArrowRight, BusFront, Clock3, Footprints, Repeat2, TrainFront } from 'lucide-react';
import MobilityMap from './MobilityMap';
import { networkLabel } from './networks';
import { presentJourneySteps } from './journeyPresentation';
import type { MobilityJourney, MobilityNetwork } from './types';
import './journeyDetail.css';

export default function MobilityJourneyDetail({
  journey,
  network,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
}) {
  const routeIds = new Set(journey.steps.map((step) => step.lineId));
  const sourceIds = new Set(
    network.routes.filter((route) => routeIds.has(route.id)).flatMap((route) => route.sourceIds),
  );
  const unverifiedBus = journey.steps.some(
    (step) => step.mode === 'bus' && (!step.stopOrderVerified || step.directionVerified !== true),
  );
  return (
    <div className="journey-detail">
      <MobilityMap key={journey.id} journey={journey} network={network} />
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
      <p className="journey-detail-note">
        Tiempos estimados con simulación · Caminatas aproximadas.
      </p>
      <ol className="journey-detail-steps" aria-label="Etapas del trayecto">
        {presentJourneySteps(journey.steps).map((entry) => {
          const { step, index } = entry;
          if (entry.kind === 'transfer')
            return (
              <li
                className="journey-detail-transfer"
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
            <li key={`${step.lineId}:${step.fromId}:${step.toId}:${index}`}>
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
        <summary>Fuentes y límites</summary>
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
