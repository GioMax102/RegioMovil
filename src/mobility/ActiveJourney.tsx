import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  LocateFixed,
  MapPin,
  Navigation,
  Pause,
  Play,
  Volume2,
  VolumeX,
  SignalLow,
  MessageSquarePlus,
} from 'lucide-react';
import LocationMap from './LocationMap';
import TransferStationActions from './TransferStationActions';
import { journeyTransfers } from './transferStations';
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
import DeferredSection from '../components/DeferredSection';
import { Dialog } from '../components/Primitives';
import { clearGuidanceCheckpoint, saveGuidanceCheckpoint } from './guidanceCheckpoint';
import { journeyStepAccent } from './journeyPresentation';
import { journeyReportContext } from './journeyReportContext';
import './activeJourney.css';

const loadReport = () => import('../components/ReportDialog');

/** Foreground guidance only: no location history, background task, or vehicle telemetry. */
export default function ActiveJourney({
  journey,
  network,
  onFinish,
  autoStart = false,
  initialStepIndex = 0,
  initialOpenReport = false,
}: {
  journey: MobilityJourney;
  network: MobilityNetwork;
  onFinish: () => void;
  /** Set only after an explicit user action such as “Iniciar trayecto”. */
  autoStart?: boolean;
  /** Only a saved manual step is restored; GPS/voice never resume automatically. */
  initialStepIndex?: number;
  initialOpenReport?: boolean;
}) {
  const route = useMemo(() => createGuidanceRoute(journey, network), [journey, network]);
  const [state, setState] = useState(() => ({
    ...initialGuidanceState(),
    stepIndex: Math.max(0, Math.min(route.legs.length - 1, Math.floor(initialStepIndex) || 0)),
    completed: route.legs.length === 0,
  }));
  const [running, setRunning] = useState(
    autoStart && !initialOpenReport && document.visibilityState !== 'hidden',
  );
  const [started, setStarted] = useState(autoStart || initialOpenReport);
  const [reportOpen, setReportOpen] = useState(initialOpenReport);
  const [reportRevision, setReportRevision] = useState(0);
  const [reportFeedback, setReportFeedback] = useState('');
  const reportButton = useRef<HTMLButtonElement>(null);
  const [locationError, setLocationError] = useState('');
  const [pauseReason, setPauseReason] = useState<'user' | 'background' | 'location'>('user');
  const [following, setFollowing] = useState(true);
  const [voice, setVoice] = useState(false);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const mounted = useRef(true);
  const instructionHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterConfirmation = useRef(true);
  const speechAvailable =
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance === 'function';
  const instruction = describeGuidance(route, state);
  const leg = route.legs[state.stepIndex];
  const transfer = journeyTransfers(journey.steps).find(
    (point) => state.stepIndex >= point.afterStepIndex && state.stepIndex < point.beforeStepIndex,
  );
  // Stable between GPS samples: fit the current leg when a step changes,
  // while the original route remains responsible for guidance and total progress.
  const mapJourney = useMemo(
    () => ({
      ...journey,
      id: `${journey.id}:guide:${state.stepIndex}`,
      steps: leg ? [{ ...leg.step, geometry: leg.points }] : [],
      stationIds:
        leg?.stopsComplete && leg.step.stopOrderVerified ? leg.stops.map((stop) => stop.id) : [],
    }),
    [journey, leg, state.stepIndex],
  );
  const originPoint = leg?.points[0];
  const destinationPoint = leg?.points.at(-1);

  useEffect(() => {
    if (!focusAfterConfirmation.current) return;
    focusAfterConfirmation.current = false;
    instructionHeading.current?.focus({ preventScroll: true });
    const dialog = instructionHeading.current?.closest('dialog');
    if (dialog) dialog.scrollTop = 0;
  }, [state.stepIndex, state.completed]);

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
    clearGuidanceCheckpoint(journey.id);
    setRunning(false);
    if (speechAvailable) window.speechSynthesis.cancel();
    onFinish();
  }
  function openReport() {
    setRunning(false);
    setVoice(false);
    setPauseReason('user');
    setReportFeedback('');
    if (speechAvailable) window.speechSynthesis.cancel();
    try {
      saveGuidanceCheckpoint(journey, network, state.stepIndex);
    } catch (cause) {
      setReportFeedback(
        cause instanceof Error ? cause.message : 'No pudimos guardar el regreso a la guía.',
      );
    }
    setReportOpen(true);
  }
  function closeReport(sent = false) {
    setReportOpen(false);
    // The guide keeps its selected step, map and progress, but location/voice stay paused.
    if (sent) setReportFeedback('Gracias por ayudar. Tu observación quedó pendiente de revisión.');
    window.requestAnimationFrame(() => reportButton.current?.focus({ preventScroll: true }));
  }
  function confirmStep() {
    focusAfterConfirmation.current = true;
    setStarted(true);
    setState((previous) => advanceGuidance(route, previous));
  }
  const status = state.completed
    ? 'Trayecto completado'
    : !running
      ? pauseReason === 'location'
        ? 'Sin GPS'
        : started
          ? 'En pausa'
          : 'Lista para iniciar'
      : state.quality === 'waiting'
        ? 'Buscando GPS'
        : state.quality === 'imprecise'
          ? 'GPS impreciso'
          : state.quality === 'stale'
            ? 'Sin señal GPS'
            : state.quality === 'off-route' || state.quality === 'unconfirmed'
              ? 'GPS por confirmar'
              : 'GPS conectado';
  const locationUncertain = running && state.quality !== 'good';
  const stepMeters = Math.max(0, (leg?.length ?? 0) - state.along);
  const distance =
    stepMeters >= 1000 ? `${(stepMeters / 1000).toFixed(1)} km` : `${Math.round(stepMeters)} m`;
  const nextRide = route.legs.slice(state.stepIndex + 1).find((item) => item.step.mode !== 'walk');
  // GPS quality belongs in the status, not in place of the stop the person needs.
  // A paused fix must not keep presenting a live alighting instruction.
  const actionTitle = state.completed
    ? 'Llegaste a tu destino'
    : running && state.quality === 'good' && instruction.kind === 'alight'
      ? instruction.title
      : running && state.quality === 'good' && instruction.kind === 'step-end'
        ? 'Llegaste a'
        : leg?.compactTransfer && nextRide
          ? `Transborda a ${nextRide.step.lineName}`
          : running && state.quality === 'good' && instruction.kind === 'transfer'
            ? 'Baja y haz transbordo en'
            : leg?.step.mode === 'walk'
              ? 'Camina hasta'
              : 'Viaja hasta';
  const positionHint =
    !running || state.completed
      ? ''
      : state.quality === 'waiting'
        ? 'Buscando señal. Puedes confirmar cada paso.'
        : state.quality === 'imprecise'
          ? 'Avance sin actualizar hasta tener mejor precisión.'
          : state.quality === 'stale'
            ? 'Sin señal reciente. Confirma tu parada con las señales.'
            : state.quality === 'off-route'
              ? 'Revisa tu ubicación y confirma el recorrido.'
              : state.quality === 'unconfirmed'
                ? 'Ubicación por confirmar. Revisa las señales.'
                : '';
  const showNextStop = !!(
    running &&
    state.quality === 'good' &&
    instruction.nextStopVerified &&
    instruction.nextStop
  );

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
          <span>{status}</span>
        </span>
        {!state.completed && (
          <button type="button" className="active-journey-link" onClick={finish}>
            Terminar guía
          </button>
        )}
      </div>
      <div
        style={
          {
            '--journey-stage-color': leg ? journeyStepAccent(leg.step) : 'var(--green)',
          } as React.CSSProperties
        }
        data-stage={leg?.compactTransfer ? 'transfer' : leg?.step.mode === 'walk' ? 'walk' : 'ride'}
        className={`active-journey-instruction ${state.completed ? 'completed' : instruction.kind === 'transfer' || instruction.kind === 'alight' ? 'attention' : ''}`}
      >
        <span className="active-journey-step">
          {state.completed
            ? 'Trayecto completado'
            : `Paso ${state.stepIndex + 1} de ${route.legs.length}`}
          {leg && !state.completed && (
            <span>
              {' · '}
              {leg.step.mode === 'walk'
                ? leg.compactTransfer
                  ? 'Transbordo'
                  : 'A pie'
                : leg.step.lineName}
            </span>
          )}
        </span>
        <div aria-live="polite" aria-atomic="true">
          <h3 ref={instructionHeading} tabIndex={-1}>
            {actionTitle}
            {leg && !state.completed && <strong> {leg.step.to}</strong>}
          </h3>
        </div>
        {showNextStop && instruction.nextStop && (
          <p className="active-journey-next-stop">
            <MapPin size={16} aria-hidden="true" />
            <span>
              Próxima: <strong>{instruction.nextStop.name}</strong>
              {instruction.remainingStops !== null && instruction.remainingStops > 1 && (
                <small> · {instruction.remainingStops} paradas hasta bajar</small>
              )}
            </span>
          </p>
        )}
        {transfer && !state.completed && (
          <TransferStationActions transfer={transfer} network={network} />
        )}
        {positionHint && <p className="active-journey-position-hint">{positionHint}</p>}
        {!state.completed &&
          leg?.step.mode === 'bus' &&
          (!leg.step.stopOrderVerified || leg.step.directionVerified !== true) && (
            <p className="active-journey-position-hint">
              Confirma el sentido y la bajada con el operador.
            </p>
          )}
      </div>
      <div className="active-journey-map">
        <LocationMap
          network={network}
          online={online}
          journey={mapJourney}
          navigationMode
          field={null}
          origin={originPoint ? { lng: originPoint[0], lat: originPoint[1] } : null}
          destination={
            destinationPoint ? { lng: destinationPoint[0], lat: destinationPoint[1] } : null
          }
          currentPosition={running && state.quality === 'good' ? state.position : null}
          focus={following && running && state.quality === 'good' ? state.acceptedFix : null}
        />
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
                ? `${distance} de esta etapa · aprox.`
                : 'Avance manual · trazo no disponible'}
          </span>
        </div>
      </div>
      {!state.completed ? (
        <div className="active-journey-controls" aria-label="Controles de la guía">
          <button
            type="button"
            className="active-journey-manual"
            aria-label={instruction.manualLabel}
            onClick={confirmStep}
          >
            <Check size={21} aria-hidden="true" />
            <span>
              <strong>{leg?.step.mode === 'walk' ? 'Ya llegué' : 'Ya bajé'}</strong>
              <small>{leg?.step.to || 'Mi destino'}</small>
            </span>
          </button>
          <div className="active-journey-options">
            {running ? (
              <button
                type="button"
                className="active-journey-option"
                aria-label="Pausar guía"
                onClick={() => {
                  setPauseReason('user');
                  setRunning(false);
                }}
              >
                <Pause size={17} aria-hidden="true" /> Pausar
              </button>
            ) : (
              <button
                type="button"
                className="active-journey-option"
                aria-label={started ? 'Reanudar ubicación' : 'Iniciar guía'}
                onClick={start}
              >
                <Play size={17} aria-hidden="true" />
                {started ? 'Reanudar' : 'Activar GPS'}
              </button>
            )}
            <button
              type="button"
              className="active-journey-option"
              aria-pressed={following}
              aria-label="Seguirme en el mapa"
              onClick={() => setFollowing((value) => !value)}
            >
              <LocateFixed size={17} aria-hidden="true" /> Seguirme
            </button>
            <button
              type="button"
              className="active-journey-option"
              aria-label={speechAvailable ? 'Avisos por voz' : 'Voz no disponible'}
              aria-pressed={voice}
              disabled={!speechAvailable}
              onClick={() => setVoice((value) => !value)}
            >
              {voice ? (
                <Volume2 size={17} aria-hidden="true" />
              ) : (
                <VolumeX size={17} aria-hidden="true" />
              )}
              {speechAvailable ? 'Voz' : 'Sin voz'}
            </button>
          </div>
          <p className="active-journey-manual-hint">Confirma sólo cuando estés en esa parada.</p>
        </div>
      ) : (
        <button
          type="button"
          className="active-journey-manual active-journey-close"
          onClick={finish}
        >
          <Check size={20} aria-hidden="true" /> Cerrar guía
        </button>
      )}
      {!state.completed && (
        <button
          ref={reportButton}
          type="button"
          className="active-journey-report"
          aria-haspopup="dialog"
          onClick={openReport}
        >
          <MessageSquarePlus size={18} aria-hidden="true" />
          <span>Reportar algo en este tramo</span>
        </button>
      )}
      {reportFeedback && (
        <p className="active-journey-report-feedback" role="status">
          {reportFeedback}
        </p>
      )}
      {locationError && !state.completed && (
        <p className="active-journey-warning" role="status">
          {locationError}
        </p>
      )}
      <details className="active-journey-about">
        <summary>Sobre la guía y tu ubicación</summary>
        <p>Sólo con la app visible; se pausa al salir.</p>
        <p>Tu ubicación se procesa en este dispositivo y no se guarda como historial.</p>
        <p>
          La guía no emite avisos en segundo plano. Al volver, reanuda el GPS para obtener una
          posición nueva.
        </p>
        <p>
          El mapa en línea consulta OpenStreetMap; activa Ahorrar datos para usar el mapa local.
        </p>
        <p>
          El avance usa tu ubicación GPS real y el trazo publicado; no detecta la unidad, el
          abordaje ni tu bajada. Los tiempos son estimados. Confirma las paradas y el sentido con
          las señales o el operador.
        </p>
      </details>
      {reportOpen && (
        <DeferredSection
          key={reportRevision}
          load={loadReport}
          componentProps={{
            ...journeyReportContext(journey, network, state.stepIndex),
            onClose: () => closeReport(),
            onSent: () => closeReport(true),
          }}
          loadingLabel="Abriendo tu observación…"
          onRetry={() => setReportRevision((value) => value + 1)}
          loadingFallback={
            <Dialog title="Tu experiencia cuenta" onClose={() => closeReport()}>
              <p role="status">Abriendo tu observación…</p>
            </Dialog>
          }
          errorFallback={
            <Dialog title="Tu experiencia cuenta" onClose={() => closeReport()}>
              <p role="alert">No pudimos abrir el formulario. Tu guía sigue en el mismo paso.</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => setReportRevision((value) => value + 1)}
              >
                Volver a intentar
              </button>
            </Dialog>
          }
        />
      )}
    </section>
  );
}
