import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  LocateFixed,
  MapPin,
  Navigation,
  Pause,
  Play,
  Volume2,
  VolumeX,
  SignalLow,
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
  const [pauseReason, setPauseReason] = useState<'user' | 'background' | 'location'>('user');
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
      setPauseReason('background');
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
        setPauseReason('location');
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
        setPauseReason('location');
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
    // A paused fix cannot establish a live position or accumulate arrival
    // evidence across a gap. Keep the chosen leg and its progress, then wait
    // for fresh observations before giving GPS-dependent instructions again.
    setState((previous) => ({
      ...previous,
      quality: 'waiting',
      position: null,
      acceptedFix: null,
      atStepEnd: false,
      endEvidenceAt: null,
      offRouteEvidenceAt: null,
    }));
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
    : !running
      ? pauseReason === 'location'
        ? 'Sin GPS · avance manual'
        : started
          ? 'Guía en pausa'
          : 'Lista para iniciar'
      : state.quality === 'waiting'
        ? 'Conectando con el GPS'
        : state.quality === 'imprecise'
          ? 'GPS impreciso'
          : state.quality === 'stale'
            ? 'Sin señal GPS reciente'
            : state.quality === 'off-route' || state.quality === 'unconfirmed'
              ? 'Ubicación por confirmar'
              : 'Guía activa · GPS conectado';
  const locationUncertain = running && state.quality !== 'good';
  const distance =
    instruction.remainingMeters >= 1000
      ? `${(instruction.remainingMeters / 1000).toFixed(1)} km`
      : `${Math.round(instruction.remainingMeters)} m`;

  return (
    <section className="active-journey" aria-label="Guía de tu trayecto">
      <div className="active-journey-top">
        <span
          className={`active-journey-state ${running && !state.completed ? 'running' : ''}`}
          role="status"
        >
          {state.completed ? (
            <Check size={15} aria-hidden="true" />
          ) : locationUncertain ? (
            <SignalLow size={15} aria-hidden="true" />
          ) : (
            <Navigation size={15} aria-hidden="true" />
          )}
          {status}
        </span>
        <button type="button" className="active-journey-link" onClick={finish}>
          {state.completed ? 'Cerrar guía' : 'Terminar guía'}
        </button>
      </div>
      <p className="active-journey-scope">
        Guía con la app visible. Al salir se pausa; no emite avisos en segundo plano.
      </p>
      {locationError && (
        <p className="active-journey-warning" role="status">
          {locationError}
        </p>
      )}
      <div
        className={`active-journey-instruction ${state.completed ? 'completed' : instruction.kind === 'transfer' || instruction.kind === 'alight' ? 'attention' : ''}`}
      >
        <span className="eyebrow">
          {state.completed ? 'DESTINO' : `PASO ${state.stepIndex + 1} DE ${route.legs.length}`}
        </span>
        <div aria-live="polite" aria-atomic="true">
          <h3>
            {!running && !state.completed
              ? started
                ? 'Tu guía está en pausa'
                : 'Empieza cuando estés listo'
              : instruction.kind === 'waiting' && leg
                ? leg.step.mode === 'walk'
                  ? `Camina hacia ${leg.step.to}`
                  : `${leg.step.lineName} hacia ${leg.step.to}`
                : instruction.title}
          </h3>
          <p>
            {!running && !state.completed
              ? leg
                ? `Siguiente paso: ${leg.step.mode === 'walk' ? (leg.compactTransfer ? 'transbordo' : 'camina') : leg.step.lineName} hacia ${leg.step.to}.`
                : 'Puedes cerrar la guía.'
              : instruction.kind === 'waiting'
                ? 'El GPS está conectando. También puedes confirmar cada paso manualmente.'
                : instruction.detail}
          </p>
        </div>
        {leg && !state.completed && (
          <div className="active-journey-reference">
            <span>
              {leg.step.mode === 'walk'
                ? leg.compactTransfer
                  ? 'Transbordo'
                  : 'A pie'
                : leg.step.lineName}
            </span>
            {instruction.nextStop && (
              <div className="active-journey-next-stop">
                <MapPin size={18} aria-hidden="true" />
                <div>
                  <small>
                    {instruction.nextStopVerified && running && state.quality === 'good'
                      ? 'Próxima parada · según el trazo'
                      : 'Referencia del trazo'}
                  </small>
                  <strong>{instruction.nextStop.name}</strong>
                </div>
              </div>
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
      </div>
      {!state.completed && (
        <div className="active-journey-actions" aria-label="Controles de la guía">
          {running ? (
            <button
              type="button"
              className="active-journey-control"
              onClick={() => {
                setPauseReason('user');
                setRunning(false);
              }}
            >
              <Pause size={17} aria-hidden="true" /> Pausar guía
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
          <span className="active-journey-manual-hint">
            Confirma el paso sólo cuando hayas llegado.
          </span>
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
      <details className="active-journey-about">
        <summary>Sobre la guía y tu ubicación</summary>
        <p>Tu ubicación se procesa en este dispositivo y no se guarda como historial.</p>
        <p>
          El mapa en línea consulta OpenStreetMap; activa Ahorrar datos para usar el mapa local.
        </p>
        <p>
          El avance usa tu ubicación GPS real y el trazo publicado; no detecta la unidad, el
          abordaje ni tu bajada. Los tiempos son estimados. Confirma las paradas y el sentido con
          las señales o el operador.
        </p>
      </details>
    </section>
  );
}
