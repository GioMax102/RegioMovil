import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  LocateFixed,
  Navigation,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import LocationMap from './LocationMap';
import { watchLocation } from './location';
import {
  advanceGuidance,
  createGuidanceRoute,
  describeGuidance,
  expireGuidance,
  initialGuidanceState,
  updateGuidance,
} from './guidance';
import type { MobilityJourney, MobilityNetwork } from './types';
import './activeJourney.css';

/** Foreground guidance only: no location history, background task, or vehicle telemetry. */
export default function ActiveJourney({
  journey,
  network,
  onFinish,
  autoStart = false,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
  onFinish: () => void;
  /** Set only after an explicit user action such as “Iniciar trayecto”. */
  autoStart?: boolean;
}) {
  const route = useMemo(() => createGuidanceRoute(journey, network), [journey, network]);
  const [state, setState] = useState(() => ({
    ...initialGuidanceState(),
    completed: route.legs.length === 0,
  }));
  const [running, setRunning] = useState(autoStart && document.visibilityState !== 'hidden');
  const [started, setStarted] = useState(autoStart);
  const [locationError, setLocationError] = useState('');
  const [following, setFollowing] = useState(true);
  const [voice, setVoice] = useState(false);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const mounted = useRef(true);
  const speechAvailable =
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance === 'function';
  const instruction = describeGuidance(route, state);
  const leg = route.legs[state.stepIndex];
  const originPoint = route.legs[0]?.points[0];
  const destinationPoint = route.legs.at(-1)?.points.at(-1);

  useEffect(() => {
    mounted.current = true;
    const updateOnline = () => setOnline(navigator.onLine !== false);
    const background = () => {
      if (document.visibilityState !== 'hidden') return;
      setRunning(false);
      setLocationError('La guía se pausó al salir de la aplicación. Reanúdala cuando vuelvas.');
    };
    document.addEventListener('visibilitychange', background);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!running || state.completed || !route.legs.length) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    watchLocation(
      (fix) => {
        if (!cancelled && mounted.current) {
          setLocationError('');
          setState((previous) => updateGuidance(route, previous, fix));
        }
      },
      (error) => {
        if (cancelled || !mounted.current) return;
        setLocationError(
          error.message ||
            'No pudimos obtener tu ubicación. Puedes continuar con los controles manuales.',
        );
        setRunning(false);
      },
    )
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch((error: unknown) => {
        if (cancelled || !mounted.current) return;
        setLocationError(
          error instanceof Error
            ? error.message
            : 'La ubicación no está disponible. Puedes continuar manualmente.',
        );
        setRunning(false);
      });
    const timer = window.setInterval(() => setState((previous) => expireGuidance(previous)), 5000);
    return () => {
      cancelled = true;
      stop?.();
      window.clearInterval(timer);
    };
  }, [running, state.completed, route]);

  // Speak only meaningful instruction changes, never each GPS sample or distance update.
  const speechMessage =
    instruction.announcement +
    (instruction.kind === 'travel' && instruction.nextStopVerified && instruction.nextStop
      ? ` Próxima parada: ${instruction.nextStop.name}.`
      : '');
  useEffect(() => {
    if (!speechAvailable) return;
    window.speechSynthesis.cancel();
    if (!voice || !running) return;
    const utterance = new window.SpeechSynthesisUtterance(speechMessage);
    utterance.lang = 'es-MX';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [voice, running, speechMessage, speechAvailable]);

  function start() {
    setLocationError('');
    setStarted(true);
    setRunning(true);
  }
  function finish() {
    setRunning(false);
    if (speechAvailable) window.speechSynthesis.cancel();
    onFinish();
  }
  const status = state.completed
    ? 'Trayecto completado'
    : running
      ? 'Guía activa'
      : started
        ? 'Guía en pausa'
        : 'Lista para iniciar';
  const distance =
    instruction.remainingMeters >= 1000
      ? `${(instruction.remainingMeters / 1000).toFixed(1)} km`
      : `${Math.round(instruction.remainingMeters)} m`;

  return (
    <section className="active-journey" aria-label="Guía de tu trayecto">
      <div className="active-journey-top">
        <span className={`active-journey-state ${running && !state.completed ? 'running' : ''}`}>
          <Navigation size={15} aria-hidden="true" />
          {status}
        </span>
        <button type="button" className="active-journey-link" onClick={finish}>
          {state.completed ? 'Cerrar guía' : 'Terminar guía'}
        </button>
      </div>
      <p className="active-journey-scope">
        La ubicación se usa en este dispositivo mientras la guía está abierta y visible. Al salir se
        pausa; no emite avisos en segundo plano.
      </p>
      {locationError && (
        <p className="active-journey-warning" role="status">
          {locationError}
        </p>
      )}
      <div className="active-journey-instruction" aria-live="polite" aria-atomic="true">
        <span className="eyebrow">
          {state.completed ? 'DESTINO' : `PASO ${state.stepIndex + 1} DE ${route.legs.length}`}
        </span>
        <h3>
          {!running && !state.completed
            ? started
              ? 'Tu guía está en pausa'
              : 'Empieza cuando estés listo'
            : instruction.title}
        </h3>
        <p>
          {!running && !state.completed
            ? `${leg ? `Etapa hasta ${leg.step.to}. ` : ''}Reanuda la ubicación o confirma cuando hayas terminado esta etapa para continuar manualmente.`
            : instruction.detail}
        </p>
      </div>
      {leg && !state.completed && (
        <div className="active-journey-reference">
          <span>{leg.step.mode === 'walk' ? 'A pie' : leg.step.lineName}</span>
          {instruction.nextStop && (
            <strong>
              {instruction.nextStopVerified ? 'Próxima parada' : 'Referencia del trazo'}:{' '}
              {instruction.nextStop.name}
            </strong>
          )}
          {instruction.remainingStops !== null && (
            <small>
              {instruction.remainingStops}{' '}
              {instruction.remainingStops === 1
                ? 'parada hasta tu bajada'
                : 'paradas hasta tu bajada'}{' '}
              · según el trazo
            </small>
          )}
        </div>
      )}
      <div className="active-journey-progress">
        <progress
          max={1}
          value={instruction.progress}
          aria-label="Avance aproximado del trayecto"
        />
        <span>
          {state.completed
            ? 'Destino alcanzado'
            : route.totalMeters > 0
              ? `${distance} de trazo por recorrer`
              : 'Avance manual · sin geometría disponible'}
        </span>
      </div>
      <div className="active-journey-map">
        <LocationMap
          network={network}
          online={online}
          journey={journey}
          field={null}
          origin={originPoint ? { lng: originPoint[0], lat: originPoint[1] } : null}
          destination={
            destinationPoint ? { lng: destinationPoint[0], lat: destinationPoint[1] } : null
          }
          currentPosition={state.position}
          focus={following && running && state.quality === 'good' ? state.acceptedFix : null}
        />
      </div>
      <div className="active-journey-options">
        <button
          type="button"
          className="active-journey-option"
          aria-pressed={following}
          onClick={() => setFollowing((value) => !value)}
        >
          <LocateFixed size={17} aria-hidden="true" />
          Seguir mi ubicación
        </button>
        <button
          type="button"
          className="active-journey-option"
          aria-pressed={voice}
          disabled={!speechAvailable}
          onClick={() => setVoice((value) => !value)}
        >
          {voice ? (
            <Volume2 size={17} aria-hidden="true" />
          ) : (
            <VolumeX size={17} aria-hidden="true" />
          )}
          {speechAvailable ? 'Avisos por voz' : 'Voz no disponible'}
        </button>
      </div>
      {!state.completed && (
        <div className="active-journey-actions">
          {running ? (
            <button
              type="button"
              className="active-journey-control"
              onClick={() => setRunning(false)}
            >
              <Pause size={17} aria-hidden="true" />
              Pausar guía
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={start}>
              <Play size={17} aria-hidden="true" />
              {started ? 'Reanudar ubicación' : 'Iniciar guía'}
            </button>
          )}
          <button
            type="button"
            className="active-journey-manual"
            onClick={() => {
              setStarted(true);
              setState((previous) => advanceGuidance(route, previous));
            }}
          >
            {state.stepIndex === route.legs.length - 1 ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <ChevronRight size={17} aria-hidden="true" />
            )}
            {instruction.manualLabel}
          </button>
        </div>
      )}
      <p className="active-journey-footnote">
        El avance usa tu ubicación GPS real y el trazo publicado; no detecta la unidad, el abordaje
        ni tu bajada. Los tiempos del trayecto siguen siendo estimados. Confirma las paradas y el
        sentido con las señales o el operador.
      </p>
    </section>
  );
}
