import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowLeftRight,
  Bookmark,
  BusFront,
  Check,
  BriefcaseBusiness,
  Footprints,
  Home,
  Info,
  LocateFixed,
  MapPin,
  Search,
  School,
  TrainFront,
  WifiOff,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import { ActionFeedback } from '../components/ActionFeedback';
import type { Preference, Scenario } from '../types';
import { createMobilityPlanner, loadMobilityNetwork } from './api';
import EndpointPicker from './EndpointPicker';
import LocationMap from './LocationMap';
import { type MapPosition } from './regionalViewport';
import { stopEndpoint } from './search';
import { networkLabel } from './networks';
import { currentLocation } from './location';
import MobilityJourneyDetail from './MobilityJourneyDetail';
import SavedMobilityTrips from './SavedMobilityTrips';
import SavedTripPreview from './SavedTripPreview';
import { isCompactTransfer } from './journeyPresentation';
import { saveMobilityTrip, snapshotMobilityPlan } from './savedTrips';
import type {
  MobilityEndpoint,
  MobilityJourney,
  MobilityNetwork,
  MobilityPlan,
  MobilityTripEndpoints,
  SavedMobilityTrip,
} from './types';
import './mobility.css';

const endpointName = (endpoint: MobilityEndpoint | null, network: MobilityNetwork | null) =>
  (endpoint &&
    ('lat' in endpoint
      ? endpoint.name
      : endpoint.name ||
        network?.stops.find((stop) => stop.id === endpoint.id || stop.stationId === endpoint.id)
          ?.name)) ||
  'Elige un punto';
const isCoordinate = (point: MobilityEndpoint | null) => point && 'lat' in point;
const endpointPosition = (
  point: MobilityEndpoint | null,
  network: MobilityNetwork | null,
): MapPosition | null => {
  if (!point) return null;
  if ('lat' in point) return point;
  return network?.stops.find((stop) => stop.id === point.id || stop.stationId === point.id) || null;
};
const priorities: { id: Preference; label: string }[] = [
  { id: 'fastest', label: 'Menos tiempo' },
  { id: 'comfortable', label: 'Menos afluencia' },
  { id: 'accessible', label: 'Menos transbordos' },
];
export default function MobilityPlanner({
  scenario,
  initialTrip,
  initialStationId = 'padre-mier',
}: {
  scenario: Scenario;
  initialTrip?: MobilityTripEndpoints | null;
  initialStationId?: string;
}) {
  const [network, setNetwork] = useState<MobilityNetwork | null>(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [from, setFrom] = useState<MobilityEndpoint | null>(null);
  const [to, setTo] = useState<MobilityEndpoint | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [mapField, setMapField] = useState<'from' | 'to' | null>(null);
  const [mapDraft, setMapDraft] = useState<MapPosition | null>(null);
  const [mapFocus, setMapFocus] = useState<MapPosition | null>(null);
  const mapPanel = useRef<HTMLDivElement>(null);
  const [preference, setPreference] = useState<Preference>('fastest');
  const [transportFilter, setTransportFilter] = useState<'all' | 'metro' | 'bus' | 'combined'>(
    'all',
  );
  const [submitted, setSubmitted] = useState<{
    from: MobilityEndpoint;
    to: MobilityEndpoint;
    attempt: number;
  } | null>(null);
  const [plan, setPlan] = useState<MobilityPlan | null>(null);
  const [detail, setDetail] = useState<MobilityJourney | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saveDraft, setSaveDraft] = useState<SavedMobilityTrip | null>(null);
  const [saveLabel, setSaveLabel] = useState('Casa');
  const [customLabel, setCustomLabel] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedFeedback, setSavedFeedback] = useState('');
  const [previewSaved, setPreviewSaved] = useState<SavedMobilityTrip | null>(null);
  const planner = useRef<ReturnType<typeof createMobilityPlanner> | null>(null);
  const locationGeneration = useRef(0);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  useEffect(() => {
    if (!savedFeedback) return;
    const timer = setTimeout(() => setSavedFeedback(''), 4800);
    return () => clearTimeout(timer);
  }, [savedFeedback]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      locationGeneration.current++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoadError('');
    loadMobilityNetwork()
      .then((data) => {
        if (!active) return;
        setNetwork(data);
        planner.current = createMobilityPlanner(data);
        setFrom(
          (current) =>
            current ?? {
              id:
                data.stops.find((stop) => stop.stationId === initialStationId)?.id ??
                data.stops.find((stop) => stop.stationId === 'padre-mier')?.id ??
                data.stops[0].id,
            },
        );
      })
      .catch((cause) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
      planner.current?.dispose();
      planner.current = null;
    };
  }, [revision]);
  useEffect(() => {
    if (!initialTrip || !network) return;
    setFrom(initialTrip.from);
    setTo(initialTrip.to);
    setPreference(initialTrip.preference);
    setSubmitted(null);
    setPlan(null);
  }, [initialTrip, network]);
  useEffect(() => {
    if (online || !network) return;
    locationGeneration.current++;
    setLocating(false);
    if (isCoordinate(from) || isCoordinate(to)) {
      if (isCoordinate(from)) setFrom(null);
      if (isCoordinate(to)) setTo(null);
      setSubmitted(null);
      setPlan(null);
      setDetail(null);
      setBusy(false);
      setNotice('Sin conexión, elige estaciones o paradas oficiales para ambos extremos.');
    }
  }, [online, network, from, to]);
  useEffect(() => {
    if (
      !submitted ||
      !planner.current ||
      (!online && (isCoordinate(submitted.from) || isCoordinate(submitted.to)))
    ) {
      setBusy(false);
      return;
    }
    let active = true;
    setBusy(true);
    setError('');
    planner.current
      .plan({ ...submitted, preference, scenario, offline: !online })
      .then((result) => {
        if (active) {
          setPlan(result);
          setDetail(null);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause.message);
          setPlan(null);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [submitted, preference, scenario, online]);

  useEffect(() => {
    if (mapField) {
      mapPanel.current?.scrollIntoView?.({ block: 'nearest' });
      mapPanel.current
        ?.querySelector<SVGSVGElement>('svg[role="group"]')
        ?.focus({ preventScroll: true });
    }
  }, [mapField]);
  const originPoint = endpointPosition(from, network);
  const destinationPoint = endpointPosition(to, network);
  const nearbyOfficial = useMemo(() => {
    if (!mapDraft || !network || online) return [];
    return network.stops
      .filter((stop) => stop.official)
      .map((stop) => ({
        stop,
        meters: Math.hypot(
          (stop.lat - mapDraft.lat) * 111320,
          (stop.lng - mapDraft.lng) * 111320 * Math.cos((mapDraft.lat * Math.PI) / 180),
        ),
      }))
      .filter((item) => item.meters <= 700)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 3);
  }, [network, mapDraft, online]);
  function chooseOnMap(field: 'from' | 'to') {
    setPicker(null);
    locationGeneration.current++;
    setLocating(false);
    if (mapField === field) return;
    setMapField(field);
    setMapDraft(null);
    const point = endpointPosition(field === 'from' ? from : to, network);
    if (point) setMapFocus({ lat: point.lat, lng: point.lng });
  }
  function confirmMapPoint() {
    if (!mapField || !mapDraft) return;
    if (!online) {
      if (!nearbyOfficial[0] || nearbyOfficial[0].meters > 250) return;
      changeEndpoint(mapField, stopEndpoint(nearbyOfficial[0].stop));
    } else
      changeEndpoint(mapField, {
        kind: 'place',
        name: mapField === 'from' ? 'Origen en el mapa' : 'Destino en el mapa',
        lat: Number(mapDraft.lat.toFixed(6)),
        lng: Number(mapDraft.lng.toFixed(6)),
        address: 'Punto elegido en el mapa',
      });
    setMapField(null);
    setMapDraft(null);
  }

  const journeyModes = (item: MobilityJourney) => ({
    metro: item.steps.some((step) => step.mode === 'metro'),
    bus: item.steps.some((step) => step.mode === 'bus'),
  });
  const matchesTransport = (item: MobilityJourney, filter: typeof transportFilter) => {
    const modes = journeyModes(item);
    return (
      filter === 'all' ||
      (filter === 'metro'
        ? modes.metro && !modes.bus
        : filter === 'bus'
          ? modes.bus && !modes.metro
          : modes.metro && modes.bus)
    );
  };
  const visibleJourneys =
    plan?.journeys.filter((item) => matchesTransport(item, transportFilter)) || [];

  function changeEndpoint(field: 'from' | 'to', endpoint: MobilityEndpoint) {
    if (field === 'from') {
      locationGeneration.current++;
      setLocating(false);
      setFrom(endpoint);
    } else setTo(endpoint);
    setPlan(null);
    setSubmitted(null);
    setError('');
    setNotice('');
    setMapFocus(endpointPosition(endpoint, network));
    setMapField(null);
    setMapDraft(null);
  }
  async function locate() {
    if (!online) return;
    const generation = ++locationGeneration.current;
    setLocating(true);
    setError('');
    setNotice('');
    try {
      const endpoint = await currentLocation();
      if (generation !== locationGeneration.current || !onlineRef.current) return;
      if ('accuracy' in endpoint && endpoint.accuracy && endpoint.accuracy > 1500)
        throw new Error(
          'La ubicación es demasiado imprecisa. Elige una parada o busca un lugar cercano.',
        );
      changeEndpoint('from', endpoint);
      if ('accuracy' in endpoint)
        setNotice(
          `Ubicación obtenida. Precisión aproximada: ${Math.round(endpoint.accuracy ?? 0)} m.`,
        );
    } catch (cause) {
      if (generation === locationGeneration.current)
        setError(cause instanceof Error ? cause.message : 'No pudimos leer tu ubicación.');
    } finally {
      if (generation === locationGeneration.current) setLocating(false);
    }
  }
  function startSaving() {
    if (!plan || !network || busy) return;
    setSaveDraft(snapshotMobilityPlan(plan, network, 'Casa'));
    setSaveLabel('Casa');
    setCustomLabel('');
    setSaveError('');
    setDetail(null);
  }
  function saveJourney() {
    if (!saveDraft) return;
    const label = saveLabel === 'Personalizada' ? customLabel.trim() : saveLabel;
    if (!label) return;
    try {
      saveMobilityTrip({ ...saveDraft, label });
      setSaveDraft(null);
      setSavedFeedback(
        `${saveDraft.journeys.length} ${saveDraft.journeys.length === 1 ? 'ruta guardada' : 'rutas guardadas'} como ${label}. Disponibles sin internet en Guardados.`,
      );
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No pudimos guardar las rutas.');
    }
  }
  function reuseTrip(trip: MobilityTripEndpoints) {
    changeEndpoint('from', trip.from);
    changeEndpoint('to', trip.to);
    setPreference(trip.preference);
  }
  return (
    <section className="mobility-planner" aria-labelledby="mobility-title">
      <div className="mobility-intro">
        <span className="mobility-experiment">
          <span /> VISTA PREVIA · TIEMPOS SIMULADOS
        </span>
        <h2 id="mobility-title" className="sr-only">
          Conecta más de tu ciudad.
        </h2>
      </div>
      {loadError ? (
        <div className="panel mobility-feedback" role="alert">
          <p>{loadError}</p>
          <button className="text-button" onClick={() => setRevision((value) => value + 1)}>
            Volver a cargar la red
          </button>
        </div>
      ) : !network ? (
        <p className="panel mobility-feedback" role="status">
          Preparando la red de movilidad…
        </p>
      ) : (
        <>
          <p className="mobility-search-prompt">
            Elige dónde sales y a dónde quieres llegar. Nosotros conectamos las opciones.
          </p>
          <div className={`mobility-connection ${online ? '' : 'offline'}`}>
            <span>
              {online ? <Check size={15} /> : <WifiOff size={15} />}
              {online
                ? 'Busca en Monterrey y su zona metropolitana'
                : 'Sin conexión · sólo puntos oficiales'}
            </span>
          </div>
          <div className="mobility-plan-workspace">
            <form
              className="panel mobility-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!from || !to) {
                  setError('Elige un origen y un destino.');
                  return;
                }
                setSubmitted({ from, to, attempt: Date.now() });
              }}
            >
              <div className="mobility-fields">
                <div className="mobility-endpoint-entry">
                  <button
                    type="button"
                    className="mobility-endpoint"
                    onClick={() => setPicker('from')}
                    aria-label={`Origen: ${endpointName(from, network)}`}
                  >
                    <span className="mobility-point origin">A</span>
                    <span>
                      <small>Desde</small>
                      <strong>{endpointName(from, network)}</strong>
                    </span>
                    <Search size={17} />
                  </button>
                  <button
                    type="button"
                    className="mobility-point-map-action"
                    onClick={() => chooseOnMap('from')}
                    aria-label="Elegir origen en mapa"
                  >
                    <MapPin size={16} />
                    Mapa
                  </button>
                </div>
                <button
                  type="button"
                  className="mobility-swap"
                  aria-label="Intercambiar origen y destino"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                    setSubmitted(null);
                    setPlan(null);
                    setError('');
                    locationGeneration.current++;
                    setLocating(false);
                  }}
                >
                  <ArrowDownUp size={18} />
                </button>
                <div className="mobility-endpoint-entry">
                  <button
                    type="button"
                    className="mobility-endpoint"
                    onClick={() => setPicker('to')}
                    aria-label={`Destino: ${to ? endpointName(to, network) : 'Elige un lugar, dirección o parada'}`}
                  >
                    <span className="mobility-point destination">B</span>
                    <span>
                      <small>Hacia</small>
                      <strong>{to ? endpointName(to, network) : '¿A dónde vas?'}</strong>
                    </span>
                    <Search size={17} />
                  </button>
                  <button
                    type="button"
                    className="mobility-point-map-action"
                    onClick={() => chooseOnMap('to')}
                    aria-label="Elegir destino en mapa"
                  >
                    <MapPin size={16} />
                    Mapa
                  </button>
                </div>
              </div>
              <div className="mobility-location-row">
                <button
                  type="button"
                  className="text-button"
                  onClick={locate}
                  disabled={!online || locating}
                >
                  <LocateFixed size={16} />
                  {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
                </button>
                <small>Sin seguimiento. Sólo se guarda si tú lo eliges.</small>
              </div>
              <fieldset className="mobility-priorities">
                <legend>Tu prioridad</legend>
                <div>
                  {priorities.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-pressed={preference === item.id}
                      onClick={() => setPreference(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                className="primary-button full-width"
                type="submit"
                disabled={busy || !from || !to || !!mapField}
              >
                {busy ? 'Calculando conexiones…' : 'Buscar rutas'}
                <ArrowRight size={17} />
              </button>
              <p className="mobility-honesty">
                <Info size={15} />
                Tiempos simulados · Red experimental
              </p>
            </form>
            <div className="mobility-map-panel" ref={mapPanel}>
              <div className="mobility-map-heading">
                <span>
                  <MapPin size={17} /> Tu viaje en el mapa
                </span>
                <div role="group" aria-label="Punto que quieres marcar en el mapa">
                  <button
                    type="button"
                    aria-pressed={mapField === 'from'}
                    onClick={() => chooseOnMap('from')}
                  >
                    Origen
                  </button>
                  <button
                    type="button"
                    aria-pressed={mapField === 'to'}
                    onClick={() => chooseOnMap('to')}
                  >
                    Destino
                  </button>
                </div>
              </div>
              <LocationMap
                network={network}
                online={online}
                origin={originPoint}
                destination={destinationPoint}
                field={mapField}
                focus={mapFocus || destinationPoint || originPoint}
                journey={visibleJourneys[0]}
                onPick={setMapDraft}
                onStopSelect={(stop) => {
                  if (mapField) changeEndpoint(mapField, stopEndpoint(stop));
                }}
              />
              {mapField && (
                <div className="mobility-pin-confirm" aria-label="Confirma el punto del mapa">
                  <div>
                    <strong>
                      {mapField === 'from' ? '¿Sales desde aquí?' : '¿Quieres llegar aquí?'}
                    </strong>
                    <p>
                      {online
                        ? 'Ajusta el pin hasta el acceso que prefieras.'
                        : 'Sin internet, confirma una parada oficial cercana.'}
                    </p>
                  </div>
                  {!online &&
                    nearbyOfficial.map(({ stop, meters }) => (
                      <button
                        type="button"
                        className="mobility-nearby-stop"
                        key={stop.id}
                        onClick={() => changeEndpoint(mapField, stopEndpoint(stop))}
                      >
                        <MapPin size={16} />
                        <span>
                          {stop.name}
                          <small>{Math.round(meters)} m del pin</small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  {!online && !nearbyOfficial.length && (
                    <p role="status">
                      No hay paradas oficiales cerca del pin. Muévelo o busca una por nombre.
                    </p>
                  )}
                  <div className="mobility-pin-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMapField(null);
                        setMapDraft(null);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        !mapDraft ||
                        (!online && (!nearbyOfficial[0] || nearbyOfficial[0].meters > 250))
                      }
                      onClick={confirmMapPoint}
                    >
                      <Check size={17} />
                      {online
                        ? mapField === 'from'
                          ? 'Usar este origen'
                          : 'Usar este destino'
                        : 'Usar parada cercana'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {busy && (
            <p className="mobility-feedback" role="status">
              Actualizando las opciones con tu prioridad…
            </p>
          )}
          {error && (
            <p className="mobility-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="mobility-feedback" role="status">
              {notice}
            </p>
          )}
          {plan && (
            <div className="mobility-results" aria-busy={busy} aria-label="Resultados multimodales">
              <div className="mobility-results-heading">
                <h3>
                  {plan.journeys.length ? 'Rutas para tu viaje' : 'No encontramos una conexión'}
                </h3>
                <span>{visibleJourneys.length} opciones</span>
              </div>
              {!!plan.journeys.length && (
                <div
                  className="mobility-result-filters"
                  role="group"
                  aria-label="Filtrar rutas por transporte"
                >
                  {(
                    [
                      ['all', 'Todas'],
                      ['metro', 'Metro'],
                      ['bus', 'Autobús'],
                      ['combined', 'Metro + autobús'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={transportFilter === id}
                      onClick={() => setTransportFilter(id)}
                    >
                      {label}
                      <span>
                        {plan.journeys.filter((item) => matchesTransport(item, id)).length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!!plan.journeys.length && !visibleJourneys.length && (
                <p className="mobility-feedback" role="status">
                  No hay opciones de este tipo en las conexiones calculadas.{' '}
                  <button className="text-button" onClick={() => setTransportFilter('all')}>
                    Ver todas las rutas
                  </button>
                </p>
              )}
              {plan.message && <p className="mobility-feedback">{plan.message}</p>}
              {visibleJourneys.map((journey, index) => (
                <button
                  key={journey.id}
                  className="panel mobility-result"
                  onClick={() => setDetail(journey)}
                  aria-label={`Ver conexión ${index + 1}: ${journey.durationMinutes} minutos, ${journey.transfers} ${journey.transfers === 1 ? 'transbordo' : 'transbordos'}`}
                >
                  <div className="mobility-result-time">
                    <span>
                      {journey.durationMinutes}
                      <small> min aprox.</small>
                    </span>
                    <span>
                      {journey === plan.journeys[0] ? 'Mejor para tu prioridad' : 'Otra conexión'}
                    </span>
                  </div>
                  <div className="mobility-modes">
                    {journey.steps.map((step, stepIndex) => (
                      <span key={stepIndex} className={`mobility-mode ${step.mode}`}>
                        {isCompactTransfer(journey.steps, stepIndex) ? (
                          <ArrowLeftRight size={15} />
                        ) : step.mode === 'walk' ? (
                          <Footprints size={15} />
                        ) : step.mode === 'metro' ? (
                          <TrainFront size={15} />
                        ) : (
                          <BusFront size={15} />
                        )}
                        {isCompactTransfer(journey.steps, stepIndex)
                          ? 'Transbordo'
                          : step.mode === 'walk'
                            ? `${Math.round(step.distanceMeters)} m`
                            : step.mode === 'bus'
                              ? `${networkLabel(step.networkId)} · ${step.lineName}`
                              : step.lineName}
                      </span>
                    ))}
                  </div>
                  <p>
                    {journey.transfers} {journey.transfers === 1 ? 'transbordo' : 'transbordos'} ·{' '}
                    {journey.walkingMinutes} min a pie · afluencia simulada {journey.occupancy}%
                  </p>
                  <div className="mobility-result-footer">
                    <span>Ver mapa y pasos</span>
                    <ArrowRight size={17} />
                  </div>
                </button>
              ))}
              {!!plan.journeys.length && (
                <div className="mobility-save-action">
                  <button
                    className="primary-button full-width"
                    disabled={busy}
                    onClick={startSaving}
                  >
                    <Bookmark size={17} />
                    Guardar sin internet
                  </button>
                  <small>Las alternativas calculadas · Sólo en este dispositivo</small>
                </div>
              )}
              <details className="mobility-method mobility-result-method">
                <summary>Cobertura y límites de estas opciones</summary>
                {plan.coverage && (
                  <p>
                    Red consultada:{' '}
                    {plan.coverage.networks.map((item) => networkLabel(item.id)).join(' · ')}. Hasta{' '}
                    {plan.coverage.alternativesLimit} combinaciones distintas por búsqueda.
                  </p>
                )}
                {plan.diagnostics.truncated && (
                  <p>
                    La búsqueda alcanzó su límite de cálculo. Puede haber otras opciones; cambia la
                    prioridad para compararlas.
                  </p>
                )}
                <p>Conexiones de la red documentada. Caminatas aproximadas y tiempos simulados.</p>
              </details>
            </div>
          )}
          <SavedMobilityTrips compact onPlan={reuseTrip} />
          <details className="mobility-method">
            <summary>Rutas incluidas y fuentes del cálculo</summary>
            <p>
              {network.routes.filter((route) => route.mode === 'metro').length} líneas Metro ·{' '}
              {network.routes.filter((route) => route.mode === 'bus').length} recorridos de autobús
            </p>
            <p>
              Se combinan estaciones de Metro y puntos publicados de los autobuses con geometría
              disponible. Los servicios sin coordenadas o en construcción quedan fuera del cálculo.
              «Menos transbordos» no garantiza accesibilidad.
            </p>
            <p>
              Sin conexión sólo se aceptan puntos oficiales. La web debe abrir este modelo una vez
              con internet; Android incluye la red. El GPS no se envía al buscador. Las calles
              visibles se consultan con conexión; el mapa local tiene cobertura parcial. La
              exploración permanece dentro de la ZMM.
            </p>
          </details>
        </>
      )}
      {picker && network && (
        <EndpointPicker
          field={picker}
          network={network}
          online={online}
          onClose={() => setPicker(null)}
          onChooseMap={() => chooseOnMap(picker)}
          onRefinePlace={(place) => {
            setPicker(null);
            setMapField(picker);
            const point = { lat: place.lat, lng: place.lng };
            setMapFocus(point);
            setMapDraft(point);
            setNotice(
              `Encontramos ${place.name}. Ajusta el punto en el mapa y confirma dónde quieres ${picker === 'from' ? 'salir' : 'llegar'}.`,
            );
          }}
          onOpenSavedTrip={(trip) => {
            setPicker(null);
            setPreviewSaved(trip);
          }}
          onUseLocation={() => {
            setPicker(null);
            void locate();
          }}
          onSelect={(endpoint) => {
            changeEndpoint(picker, endpoint);
            setPicker(null);
          }}
        />
      )}
      {previewSaved && (
        <SavedTripPreview
          key={previewSaved.id}
          trip={previewSaved}
          onClose={() => setPreviewSaved(null)}
        />
      )}
      <ActionFeedback key={savedFeedback} message={savedFeedback} />
      {detail && network && (
        <Dialog title="Tu conexión, paso a paso" onClose={() => setDetail(null)} wide>
          <MobilityJourneyDetail key={detail.id} journey={detail} network={network} />
          <div className="mobility-save-action">
            <button className="primary-button full-width" disabled={busy} onClick={startSaving}>
              <Bookmark size={17} />
              Guardar sin internet
            </button>
            <small>Se guarda solo en este dispositivo</small>
          </div>
        </Dialog>
      )}
      {saveDraft && (
        <Dialog title="Guarda tu viaje" onClose={() => setSaveDraft(null)}>
          <form
            className="mobility-save-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveJourney();
            }}
          >
            <p>
              {saveDraft.journeys.length}{' '}
              {saveDraft.journeys.length === 1 ? 'alternativa' : 'alternativas'} con mapa, según tu
              prioridad.
            </p>
            <div className="mobility-save-labels" role="group" aria-label="Etiqueta del viaje">
              {[
                { label: 'Casa', icon: Home },
                { label: 'Trabajo', icon: BriefcaseBusiness },
                { label: 'Escuela', icon: School },
                { label: 'Personalizada', icon: Bookmark },
              ].map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={saveLabel === label}
                  onClick={() => setSaveLabel(label)}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
            {saveLabel === 'Personalizada' && (
              <label>
                Nombre del viaje
                <input
                  autoFocus
                  value={customLabel}
                  maxLength={48}
                  placeholder="Ej. Museo o gimnasio"
                  onChange={(event) => setCustomLabel(event.target.value)}
                  required
                />
              </label>
            )}
            <p>
              Se guarda solo en este dispositivo: origen, destino y coordenadas del recorrido.
              Puedes eliminarlo en Guardados.
            </p>
            {saveError && (
              <p className="mobility-error" role="alert">
                {saveError}
              </p>
            )}
            <button
              className="primary-button full-width"
              disabled={saveLabel === 'Personalizada' && !customLabel.trim()}
            >
              <Bookmark size={17} />
              Guardar {saveDraft.journeys.length}{' '}
              {saveDraft.journeys.length === 1 ? 'ruta' : 'rutas'}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
