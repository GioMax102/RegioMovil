import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  BriefcaseBusiness,
  Home,
  Info,
  LocateFixed,
  MapPin,
  Search,
  School,
  WifiOff,
  X,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import { ActionFeedback } from '../components/ActionFeedback';
import type { Preference, Scenario } from '../types';
import { createMobilityPlanner, loadMobilityNetwork } from './api';
import EndpointPicker from './EndpointPicker';
import LocationMap from './LocationMap';
import { type MapPosition } from './regionalViewport';
import { stopEndpoint } from './search';
import { currentLocation } from './location';
import useMapWorkspaceHeight from '../useMapWorkspaceHeight';
import { isRegionalCoordinate } from './mapGeography';
import MobilityJourneyDetail from './MobilityJourneyDetail';
import JourneyOptions, { matchesTransport, type TransportFilter } from './JourneyOptions';
import MapSheet, { type SheetSize } from './MapSheet';
import SavedTripPreview from './SavedTripPreview';
import {
  readSavedMobilityTrips,
  savedMobilityEvent,
  saveMobilityTrip,
  snapshotMobilityPlan,
} from './savedTrips';
import type {
  MobilityEndpoint,
  MobilityJourney,
  MobilityNetwork,
  MobilityPlan,
  MobilityTripEndpoints,
  SavedMobilityTrip,
} from './types';
import './mobility.css';
import './mapPlanner.css';
const ActiveJourney = lazy(() => import('./ActiveJourney'));

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
export default function MobilityPlanner({
  scenario,
  initialTrip,
  initialOrigin,
  initialStationId = 'padre-mier',
}: {
  scenario: Scenario;
  initialTrip?: MobilityTripEndpoints | null;
  initialOrigin?: MobilityEndpoint;
  initialStationId?: string;
}) {
  const [network, setNetwork] = useState<MobilityNetwork | null>(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [from, setFrom] = useState<MobilityEndpoint | null>(null);
  const [to, setTo] = useState<MobilityEndpoint | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [searchPreview, setSearchPreview] = useState<(MapPosition & { name: string }) | null>(null);
  const [mapField, setMapField] = useState<'from' | 'to' | null>(null);
  const [mapDraft, setMapDraft] = useState<MapPosition | null>(null);
  const [mapFocus, setMapFocus] = useState<MapPosition | null>(null);
  const mapPanel = useRef<HTMLDivElement>(null);
  const [preference, setPreference] = useState<Preference>('fastest');
  const [transportFilter, setTransportFilter] = useState<TransportFilter>('all');
  const [sheetSize, setSheetSize] = useState<SheetSize>('half');
  const [guideJourney, setGuideJourney] = useState<MobilityJourney | null>(null);
  const [savedTrips, setSavedTrips] = useState(readSavedMobilityTrips);
  const workspace = useRef<HTMLElement>(null);
  useEffect(() => {
    const refresh = () => setSavedTrips(readSavedMobilityTrips());
    window.addEventListener(savedMobilityEvent, refresh);
    return () => window.removeEventListener(savedMobilityEvent, refresh);
  }, []);
  useMapWorkspaceHeight(workspace);
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
  const [locationError, setLocationError] = useState('');
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
    setSearchPreview(null);
    setLocationError('');
  }, [picker]);
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
            current ??
            initialOrigin ?? {
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
    setTransportFilter('all');
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
  const previousPicker = useRef(picker);
  useEffect(() => {
    const closed = previousPicker.current;
    previousPicker.current = picker;
    if (!closed || picker || mapField) return;
    const frame = window.requestAnimationFrame(() =>
      workspace.current
        ?.querySelector<HTMLButtonElement>(`[data-endpoint-field="${closed}"]`)
        ?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [picker, mapField]);
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
    setSheetSize('half');
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
    setTransportFilter('all');
    setError('');
    setNotice('');
    setMapFocus(endpointPosition(endpoint, network));
    setMapField(null);
    setMapDraft(null);
    setSheetSize('half');
  }
  function closePicker() {
    locationGeneration.current++;
    setLocating(false);
    setPicker(null);
    setSearchPreview(null);
    setLocationError('');
  }
  async function locate() {
    if (!online) return false;
    const generation = ++locationGeneration.current;
    setLocating(true);
    setError('');
    setLocationError('');
    setNotice('');
    try {
      const endpoint = await currentLocation();
      if (generation !== locationGeneration.current || !onlineRef.current) return false;
      if (!('lat' in endpoint) || !isRegionalCoordinate([endpoint.lng, endpoint.lat]))
        throw new Error(
          'Tu ubicación está fuera de la ZMM. Busca una parada o elige un punto en el mapa.',
        );
      if ('accuracy' in endpoint && endpoint.accuracy && endpoint.accuracy > 1500)
        throw new Error(
          'La ubicación es demasiado imprecisa. Elige una parada o busca un lugar cercano.',
        );
      changeEndpoint('from', endpoint);
      if ('accuracy' in endpoint)
        setNotice(
          `Ubicación obtenida. Precisión aproximada: ${Math.round(endpoint.accuracy ?? 0)} m.`,
        );
      return true;
    } catch (cause) {
      if (generation === locationGeneration.current) {
        const message = cause instanceof Error ? cause.message : 'No pudimos leer tu ubicación.';
        setError(message);
        setLocationError(message);
      }
      return false;
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
  function finishGuidance() {
    setGuideJourney(null);
    // The detail stays mounted below the modal, so restore its primary control.
    window.requestAnimationFrame(() =>
      workspace.current
        ?.querySelector<HTMLButtonElement>('.journey-start')
        ?.focus({ preventScroll: true }),
    );
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
      window.requestAnimationFrame(() =>
        workspace.current
          ?.querySelector<HTMLHeadingElement>('.map-sheet-heading h2')
          ?.focus({ preventScroll: true }),
      );
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No pudimos guardar las rutas.');
    }
  }
  const panelTitle = picker
    ? picker === 'from'
      ? '¿Desde dónde sales?'
      : '¿A dónde vas?'
    : mapField
      ? mapField === 'from'
        ? 'Confirma tu origen'
        : 'Confirma tu destino'
      : detail
        ? 'Tu trayecto'
        : plan
          ? 'Elige tu ruta'
          : '¿A dónde vamos?';
  function openPicker(field: 'from' | 'to') {
    setPicker(field);
    setSheetSize('half');
    setMapField(null);
  }
  return (
    <section
      ref={workspace}
      className="mobility-planner map-experience"
      data-sheet={sheetSize}
      data-mode={
        mapField ? 'map' : picker ? 'search' : detail ? 'detail' : plan ? 'results' : 'form'
      }
      aria-label="Planear viaje"
    >
      <h2 id="mobility-title" className="sr-only">
        Planear viaje
      </h2>
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
          <div
            className="mobility-map-stage"
            ref={mapPanel}
            role="region"
            aria-label="Mapa del viaje"
          >
            <LocationMap
              network={network}
              online={online}
              compact
              origin={originPoint}
              destination={destinationPoint}
              field={mapField}
              focus={searchPreview || mapFocus || destinationPoint || originPoint}
              preview={picker ? searchPreview : null}
              journey={picker || mapField ? null : detail || visibleJourneys[0]}
              onPick={setMapDraft}
              inspectStops={!picker && !mapField}
              onStopSelect={(stop) => {
                if (mapField) changeEndpoint(mapField, stopEndpoint(stop));
              }}
            />
          </div>
          {!online && (
            <span className="map-offline-indicator">
              <WifiOff size={15} aria-hidden="true" /> Sin conexión
            </span>
          )}
          <MapSheet
            title={panelTitle}
            size={sheetSize}
            onSizeChange={setSheetSize}
            actions={
              picker || mapField || detail || plan ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={
                    picker || mapField
                      ? 'Cerrar búsqueda'
                      : detail
                        ? 'Volver a las rutas'
                        : 'Editar origen y destino'
                  }
                  onClick={() => {
                    if (picker) closePicker();
                    else if (mapField) {
                      setMapField(null);
                      setMapDraft(null);
                    } else if (detail) setDetail(null);
                    else {
                      setPlan(null);
                      setSubmitted(null);
                    }
                    setSheetSize('half');
                  }}
                >
                  {picker || mapField ? <X size={20} /> : <ArrowLeft size={20} />}
                </button>
              ) : undefined
            }
          >
            {picker ? (
              <EndpointPicker
                key={picker}
                inline
                field={picker}
                network={network}
                online={online}
                onClose={() => {
                  closePicker();
                  setSheetSize('half');
                }}
                locating={locating}
                locationError={locationError}
                onPreview={setSearchPreview}
                onQueryChange={(query) => setSheetSize(query.trim() ? 'full' : 'half')}
                onSearchRequest={() => setSheetSize('full')}
                onChooseMap={() => chooseOnMap(picker)}
                onRefinePlace={(place) => {
                  const field = picker;
                  closePicker();
                  setMapField(field);
                  setSheetSize('half');
                  setMapFocus(place);
                  setMapDraft(place);
                }}
                onOpenSavedTrip={(trip) => {
                  closePicker();
                  setPreviewSaved(trip);
                  setSheetSize('half');
                }}
                onUseLocation={async () => {
                  if (await locate()) {
                    setPicker(null);
                    setSheetSize('half');
                  }
                }}
                onSelect={(endpoint) => {
                  changeEndpoint(picker, endpoint);
                  setPicker(null);
                }}
              />
            ) : mapField ? (
              <div className="mobility-pin-confirm" aria-label="Confirma el punto del mapa">
                {!online &&
                  nearbyOfficial.map(({ stop, meters }) => (
                    <button
                      className="mobility-nearby-stop"
                      type="button"
                      key={stop.id}
                      onClick={() => changeEndpoint(mapField, stopEndpoint(stop))}
                    >
                      <MapPin size={17} />
                      <span>
                        {stop.name}
                        <small>{Math.round(meters)} m</small>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                {!online && !nearbyOfficial.length && (
                  <p role="status">Acerca el pin a una parada oficial.</p>
                )}
                <button
                  type="button"
                  className="primary-button full-width"
                  disabled={
                    !mapDraft || (!online && (!nearbyOfficial[0] || nearbyOfficial[0].meters > 250))
                  }
                  onClick={confirmMapPoint}
                >
                  <Check size={18} />
                  {online ? 'Confirmar punto' : 'Usar parada cercana'}
                </button>
              </div>
            ) : detail ? (
              <>
                <MobilityJourneyDetail
                  key={detail.id}
                  journey={detail}
                  network={network}
                  embedded
                  onStartJourney={() => setGuideJourney(detail)}
                />
                <button
                  type="button"
                  className="journey-save-button"
                  disabled={busy}
                  onClick={startSaving}
                >
                  <Bookmark size={18} />
                  Guardar trayecto
                </button>
              </>
            ) : plan ? (
              <>
                <div className="mobility-trip-caption">
                  <button
                    type="button"
                    aria-label={`Origen: ${endpointName(from, network)}`}
                    data-endpoint-field="from"
                    onClick={() => openPicker('from')}
                  >
                    {endpointName(from, network)}
                  </button>
                  <ArrowRight size={15} aria-hidden="true" />
                  <button
                    type="button"
                    aria-label={`Destino: ${endpointName(to, network)}`}
                    data-endpoint-field="to"
                    onClick={() => openPicker('to')}
                  >
                    {endpointName(to, network)}
                  </button>
                </div>
                <JourneyOptions
                  plan={plan}
                  preference={preference}
                  onPreference={setPreference}
                  filter={transportFilter}
                  onFilter={setTransportFilter}
                  onSelect={(journey) => {
                    setDetail(journey);
                    setSheetSize('half');
                  }}
                  busy={busy}
                />
                {!!plan.journeys.length && (
                  <button
                    type="button"
                    className="journey-save-button"
                    disabled={busy}
                    onClick={startSaving}
                  >
                    <Bookmark size={18} />
                    Guardar sin internet
                  </button>
                )}
              </>
            ) : (
              <form
                className="mobility-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!from || !to) {
                    setError('Elige un origen y un destino.');
                    return;
                  }
                  setSubmitted({ from, to, attempt: Date.now() });
                  setSheetSize('half');
                }}
              >
                <div className="mobility-fields">
                  {(['from', 'to'] as const).map((field) => (
                    <div className="mobility-endpoint-entry" key={field}>
                      <button
                        type="button"
                        className="mobility-endpoint"
                        data-endpoint-field={field}
                        aria-label={`${field === 'from' ? 'Origen' : 'Destino'}: ${endpointName(field === 'from' ? from : to, network)}`}
                        onClick={() => openPicker(field)}
                      >
                        <span
                          className={`mobility-point ${field === 'from' ? 'origin' : 'destination'}`}
                          aria-hidden="true"
                        >
                          {field === 'from' ? 'A' : 'B'}
                        </span>
                        <span>
                          <small>{field === 'from' ? 'Desde' : 'Hacia'}</small>
                          <strong>
                            {field === 'to' && !to
                              ? '¿A dónde vas?'
                              : endpointName(field === 'from' ? from : to, network)}
                          </strong>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="mobility-point-map-action"
                        aria-label={`Elegir ${field === 'from' ? 'origen' : 'destino'} en mapa`}
                        onClick={() => chooseOnMap(field)}
                      >
                        <MapPin size={19} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mobility-swap"
                    aria-label="Intercambiar origen y destino"
                    onClick={() => {
                      setFrom(to);
                      setTo(from);
                      setSubmitted(null);
                      setPlan(null);
                      setTransportFilter('all');
                      setError('');
                      setNotice('');
                      setMapField(null);
                      setMapDraft(null);
                      locationGeneration.current++;
                      setLocating(false);
                    }}
                  >
                    <ArrowDownUp size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="mobility-form-actions">
                  <button
                    type="button"
                    className="mobility-use-location"
                    aria-label="Usar mi ubicación actual"
                    disabled={!online || locating}
                    onClick={() => void locate()}
                  >
                    <LocateFixed size={18} aria-hidden="true" />
                    {locating ? 'Localizando…' : 'Mi ubicación'}
                  </button>
                  <button type="submit" className="primary-button" disabled={busy || !from || !to}>
                    {busy ? 'Calculando…' : 'Buscar rutas'}
                    <Search size={18} aria-hidden="true" />
                  </button>
                </div>
                {!!savedTrips.length && (
                  <div className="planner-saved-shortcuts" aria-label="Tus trayectos guardados">
                    {savedTrips.map((trip) => (
                      <button key={trip.id} type="button" onClick={() => setPreviewSaved(trip)}>
                        <Bookmark size={16} aria-hidden="true" />
                        {trip.label}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            )}
            {busy && !plan && (
              <p className="mobility-feedback" role="status">
                Calculando conexiones…
              </p>
            )}
            {error && !picker && (
              <p className="mobility-error" role="alert">
                {error}
              </p>
            )}
            {!picker && (
              <details className="planner-information">
                <summary>
                  <Info size={16} aria-hidden="true" />
                  Información del viaje
                </summary>
                {notice && <p role="status">{notice}</p>}
                <p>
                  Tiempos y afluencia simulados. Caminatas aproximadas. Confirma el sentido al
                  abordar.
                </p>
                <p>
                  Las rutas combinan estaciones de Metro y puntos publicados de autobús con
                  geometría disponible. Servicios sin coordenadas o en construcción quedan fuera del
                  cálculo.
                </p>
                <p>
                  Sin conexión sólo se generan rutas entre puntos oficiales. Puedes consultar tus
                  trayectos guardados. La exploración se limita a la ZMM.
                </p>
                <p>
                  «Mi ubicación» obtiene un punto; el seguimiento comienza sólo al iniciar el
                  trayecto. El GPS se procesa en tu dispositivo.
                </p>
                {network.sources?.map((source) => (
                  <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ))}
              </details>
            )}
          </MapSheet>
        </>
      )}
      {previewSaved && (
        <SavedTripPreview
          key={previewSaved.id}
          trip={previewSaved}
          onClose={() => setPreviewSaved(null)}
        />
      )}
      <ActionFeedback key={savedFeedback} message={savedFeedback} />
      {guideJourney && network && (
        <Dialog
          title="Sigue tu ruta"
          wide
          className="journey-guidance-dialog"
          onClose={finishGuidance}
        >
          <Suspense fallback={<p role="status">Abriendo tu guía de viaje…</p>}>
            <ActiveJourney
              journey={guideJourney}
              network={network}
              autoStart
              onFinish={finishGuidance}
            />
          </Suspense>
        </Dialog>
      )}
      {saveDraft && (
        <Dialog
          title="Guarda tu viaje"
          onClose={() => {
            setSaveDraft(null);
            window.requestAnimationFrame(() =>
              workspace.current
                ?.querySelector<HTMLHeadingElement>('.map-sheet-heading h2')
                ?.focus({ preventScroll: true }),
            );
          }}
        >
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
