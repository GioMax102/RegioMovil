import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  Bookmark,
  BusFront,
  Check,
  ChevronDown,
  Clock3,
  Footprints,
  Info,
  LocateFixed,
  MapPin,
  Search,
  TrainFront,
  WifiOff,
  X,
} from 'lucide-react';
import { Dialog } from '../components/Primitives';
import { readStored, writeStored } from '../api';
import type { Preference, Scenario } from '../types';
import { createMobilityPlanner, loadMobilityNetwork, searchPlaces } from './api';
import { currentLocation } from './location';
import MobilityMap from './MobilityMap';
import type {
  MobilityEndpoint,
  MobilityJourney,
  MobilityNetwork,
  MobilityPlan,
  MobilityStop,
  Place,
} from './types';
import './mobility.css';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const endpointName = (endpoint: MobilityEndpoint | null, network: MobilityNetwork | null) =>
  (endpoint &&
    ('lat' in endpoint
      ? endpoint.name
      : network?.stops.find((stop) => stop.id === endpoint.id || stop.stationId === endpoint.id)
          ?.name)) ||
  'Elige un punto';
const isCoordinate = (point: MobilityEndpoint | null) => point && 'lat' in point;
const priorities: { id: Preference; label: string }[] = [
  { id: 'fastest', label: 'Menos tiempo' },
  { id: 'comfortable', label: 'Menos afluencia' },
  { id: 'accessible', label: 'Menos transbordos' },
];
type Saved = { from: string; to: string; label: string };

export default function MobilityPlanner({ scenario }: { scenario: Scenario }) {
  const [network, setNetwork] = useState<MobilityNetwork | null>(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [from, setFrom] = useState<MobilityEndpoint | null>(null);
  const [to, setTo] = useState<MobilityEndpoint | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [preference, setPreference] = useState<Preference>('fastest');
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
  const [saved, setSaved] = useState<Saved[]>(() => {
    const stored = readStored<unknown>('mobility-journeys', []);
    return Array.isArray(stored)
      ? stored
          .filter(
            (item): item is Saved =>
              item &&
              typeof item.from === 'string' &&
              typeof item.to === 'string' &&
              typeof item.label === 'string',
          )
          .slice(0, 8)
      : [];
  });
  const planner = useRef<ReturnType<typeof createMobilityPlanner> | null>(null);
  const locationGeneration = useRef(0);
  const onlineRef = useRef(online);
  onlineRef.current = online;
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
                data.stops.find((stop) => stop.stationId === 'padre-mier')?.id ?? data.stops[0].id,
            },
        );
        setTo(
          (current) =>
            current ?? {
              id:
                data.stops.find((stop) => stop.stationId === 'universidad')?.id ?? data.stops[1].id,
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
  function saveJourney() {
    if (!detail || !network) return;
    const transit = detail.steps.filter((step) => step.mode !== 'walk');
    const first = transit[0]?.fromId,
      last = transit.at(-1)?.toId;
    if (
      !first ||
      !last ||
      !network.stops.some((stop) => stop.id === first) ||
      !network.stops.some((stop) => stop.id === last)
    )
      return;
    const entry = {
      from: first,
      to: last,
      label: `${endpointName({ id: first }, network)} → ${endpointName({ id: last }, network)}`,
    };
    const next = [entry, ...saved.filter((item) => item.from !== first || item.to !== last)].slice(
      0,
      8,
    );
    writeStored('mobility-journeys', next);
    setSaved(next);
    setDetail(null);
    setNotice('Estaciones del trayecto guardadas en este modelo. Tu ubicación GPS no se guarda.');
  }
  return (
    <section className="mobility-planner" aria-labelledby="mobility-title">
      <div className="mobility-intro">
        <span className="mobility-experiment">
          <span /> MODELO EXPERIMENTAL
        </span>
        <h2 id="mobility-title">Conecta más de tu ciudad.</h2>
        <p>Metro, autobús y conexiones a pie, en un mismo recorrido.</p>
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
          <div className={`mobility-connection ${online ? '' : 'offline'}`}>
            <span>
              {online ? <Check size={15} /> : <WifiOff size={15} />}
              {online ? 'Paradas y lugares disponibles' : 'Sin conexión · sólo puntos oficiales'}
            </span>
            <small>
              {network.routes.filter((route) => route.mode === 'metro').length} líneas Metro ·{' '}
              {network.routes.filter((route) => route.mode === 'bus').length} recorridos de autobús
            </small>
          </div>
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
              <button
                type="button"
                className="mobility-endpoint"
                onClick={() => setPicker('from')}
                aria-label={`Origen multimodal: ${endpointName(from, network)}`}
              >
                <span className="mobility-point origin">A</span>
                <span>
                  <small>Desde</small>
                  <strong>{endpointName(from, network)}</strong>
                </span>
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                className="mobility-swap"
                aria-label="Intercambiar origen y destino multimodales"
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
              <button
                type="button"
                className="mobility-endpoint"
                onClick={() => setPicker('to')}
                aria-label={`Destino multimodal: ${endpointName(to, network)}`}
              >
                <span className="mobility-point destination">B</span>
                <span>
                  <small>Hacia</small>
                  <strong>{endpointName(to, network)}</strong>
                </span>
                <ChevronDown size={16} />
              </button>
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
              <small>Se usa sólo aquí. Sin seguimiento ni ubicación guardada.</small>
            </div>
            <fieldset className="mobility-priorities">
              <legend>¿Qué prefieres para este viaje?</legend>
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
              disabled={busy || !from || !to}
            >
              {busy ? 'Calculando conexiones…' : 'Encontrar ruta multimodal'}
              <ArrowRight size={17} />
            </button>
            <p className="mobility-honesty">
              <Info size={15} />
              Tiempos y afluencia simulados. El orden de autobuses y los enlaces a pie son
              estimaciones para evaluar este modelo.
            </p>
          </form>
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
                  {plan.journeys.length ? 'Tus conexiones posibles' : 'No encontramos una conexión'}
                </h3>
                <span>{plan.journeys.length} opciones</span>
              </div>
              {plan.message && <p className="mobility-feedback">{plan.message}</p>}
              {plan.diagnostics.truncated && (
                <p className="mobility-feedback">
                  Se alcanzó el límite de cálculo de este experimento. Las opciones pueden estar
                  incompletas; prueba con paradas más cercanas.
                </p>
              )}
              {plan.journeys.map((journey, index) => (
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
                    <span>{index === 0 ? 'Mejor para tu prioridad' : 'Otra opción'}</span>
                  </div>
                  <div className="mobility-modes">
                    {journey.steps.map((step, stepIndex) => (
                      <span key={stepIndex} className={`mobility-mode ${step.mode}`}>
                        {step.mode === 'walk' ? (
                          <Footprints size={15} />
                        ) : step.mode === 'metro' ? (
                          <TrainFront size={15} />
                        ) : (
                          <BusFront size={15} />
                        )}
                        {step.mode === 'walk'
                          ? `${Math.round(step.distanceMeters)} m`
                          : step.lineName}
                      </span>
                    ))}
                  </div>
                  <p>
                    {journey.transfers} {journey.transfers === 1 ? 'transbordo' : 'transbordos'} · {journey.walkingMinutes} min a pie · afluencia
                    simulada {journey.occupancy}%
                  </p>
                  <div className="mobility-result-footer">
                    <span>Ver mapa y pasos</span>
                    <ArrowRight size={17} />
                  </div>
                </button>
              ))}
              <p className="mobility-method-note">
                Calculado en tu dispositivo. Las conexiones a pie no son indicaciones por calles ni
                confirman cruces seguros.
              </p>
            </div>
          )}
          {!!saved.length && (
            <details className="mobility-saved">
              <summary>
                <Bookmark size={16} />
                Estaciones guardadas en este modelo ({saved.length})
              </summary>
              {saved.map((item) => (
                <div key={`${item.from}-${item.to}`}>
                  <button
                    className="text-button"
                    onClick={() => {
                      changeEndpoint('from', { id: item.from });
                      changeEndpoint('to', { id: item.to });
                    }}
                  >
                    {item.label}
                    <ArrowRight size={15} />
                  </button>
                  <button
                    aria-label={`Quitar ${item.label}`}
                    onClick={() => {
                      const next = saved.filter((value) => value !== item);
                      setSaved(next);
                      writeStored('mobility-journeys', next);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </details>
          )}
          <details className="mobility-method">
            <summary>Qué cubre este experimento</summary>
            <p>
              Se combinan estaciones de Metro y puntos publicados de los autobuses con geometría
              disponible. Los servicios sin coordenadas o en construcción quedan fuera del cálculo.
              «Menos transbordos» no garantiza accesibilidad.
            </p>
            <p>
              Sin conexión sólo se aceptan puntos oficiales. La web debe abrir este modelo una vez
              con internet; Android incluye la red. El GPS no se envía al buscador. Los mapas de
              calles cubren el centro de Monterrey; fuera de esa zona verás el trazo del transporte.
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
          onSelect={(endpoint) => {
            changeEndpoint(picker, endpoint);
            setPicker(null);
          }}
        />
      )}
      {detail && network && (
        <Dialog title="Tu conexión, paso a paso" onClose={() => setDetail(null)} wide>
          <div className="mobility-detail-stats">
            <span>
              <Clock3 size={17} />
              {detail.etaRange[0]}–{detail.etaRange[1]} min estimados
            </span>
            <span>
              <Footprints size={17} />
              {Math.round(detail.walkingMeters)} m a pie
            </span>
          </div>
          <MobilityMap key={detail.id} journey={detail} network={network} />
          <p className="mobility-method-note">
            Conexiones entre estaciones de Metro y trazos publicados de autobús. Punteado: caminata
            aproximada; verifica accesos y cruces. Tiempos experimentales, sin GPS de unidades.
          </p>
          <ol className="mobility-steps">
            {detail.steps.map((step, index) => (
              <li key={index}>
                <span className={`mobility-step-icon ${step.mode}`}>
                  {step.mode === 'walk' ? (
                    <Footprints size={19} />
                  ) : step.mode === 'bus' ? (
                    <BusFront size={19} />
                  ) : (
                    <TrainFront size={19} />
                  )}
                </span>
                <div>
                  <h3>{step.mode === 'walk' ? 'Camina hasta tu conexión' : step.lineName}</h3>
                  <p>
                    {step.from} <ArrowRight size={12} /> {step.to}
                  </p>
                  <small>
                    {step.minutes} min aprox. ·{' '}
                    {step.mode === 'walk'
                      ? `${Math.round(step.distanceMeters)} m estimados, ruta peatonal sin verificar`
                      : `${step.stationCount} tramos${!step.stopOrderVerified ? ' · orden inferido del mapa' : ''}`}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <button className="primary-button full-width" onClick={saveJourney}>
            <Bookmark size={17} />
            Guardar estaciones de este trayecto
          </button>
          <details className="mobility-method">
            <summary>Fuentes de este recorrido</summary>
            {network.sources
              ?.filter((source) =>
                detail.steps.some((step) =>
                  network.routes
                    .find((route) => route.id === step.lineId)
                    ?.sourceIds.includes(source.id),
                ),
              )
              .map((source) => (
                <p key={source.id}>
                  <a
                    className="mobility-osm-link"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title}
                  </a>
                </p>
              ))}
          </details>
          <p className="mobility-method-note">
            Guarda sólo las paradas de transporte, sin coordenadas de tu ubicación o de lugares.
          </p>
        </Dialog>
      )}
    </section>
  );
}

function EndpointPicker({
  field,
  network,
  online,
  onSelect,
  onClose,
}: {
  field: 'from' | 'to';
  network: MobilityNetwork;
  online: boolean;
  onSelect: (point: MobilityEndpoint) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<'stops' | 'places'>('stops');
  const [mode, setMode] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!online) {
      controller.current?.abort();
      setKind('stops');
      setPlaces([]);
      setBusy(false);
    }
  }, [online]);
  const matches = useMemo(
    () =>
      network.stops.filter(
        (stop) =>
          stop.official &&
          (mode === 'all' || stop.mode === mode) &&
          normalize(query)
            .split(/\s+/)
            .filter(Boolean)
            .every((term) =>
              normalize(
                `${stop.name} ${stop.routeIds.map((id) => network.routes.find((route) => route.id === id)?.code ?? id).join(' ')}`,
              ).includes(term),
            ),
      ),
    [network, mode, query],
  );
  async function search() {
    if (!online || query.trim().length < 3 || query.trim().length > 120) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    setPlaces([]);
    setSearched(false);
    try {
      const result = await searchPlaces(query, active.signal);
      if (!active.signal.aborted) {
        setPlaces(result);
        setSearched(true);
      }
    } catch (cause) {
      if (!active.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'El buscador no está disponible.');
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  const selectStop = (stop: MobilityStop) => onSelect({ id: stop.id });
  return (
    <Dialog
      title={field === 'from' ? 'Elige tu origen multimodal' : 'Elige tu destino multimodal'}
      onClose={onClose}
    >
      <div className="mobility-picker-kinds" role="group" aria-label="Tipo de punto">
        <button
          aria-pressed={kind === 'stops'}
          onClick={() => {
            setKind('stops');
            setError('');
            controller.current?.abort();
            setBusy(false);
          }}
        >
          Paradas oficiales
        </button>
        <button
          disabled={!online}
          aria-pressed={kind === 'places'}
          onClick={() => {
            setKind('places');
            setError('');
            setPlaces([]);
            setSearched(false);
          }}
        >
          Lugares con internet
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (kind === 'places') void search();
          else if (matches.length === 1) selectStop(matches[0]);
        }}
      >
        <label className="search-field">
          <Search size={18} />
          <input
            autoFocus
            type="search"
            aria-label={kind === 'stops' ? 'Buscar punto oficial' : 'Buscar lugar real'}
            placeholder={
              kind === 'stops'
                ? 'Parada, estación o número de ruta'
                : 'Ej. Parque Fundidora, Monterrey'
            }
            value={query}
            maxLength={120}
            onChange={(event) => {
              controller.current?.abort();
              setBusy(false);
              setQuery(event.target.value);
              setLimit(40);
              setPlaces([]);
              setSearched(false);
              setError('');
            }}
          />
        </label>
        {kind === 'places' && (
          <>
            <p className="mobility-method-note">
              Al buscar, este texto se envía a OpenStreetMap/Nominatim mediante la API del piloto.
              No se envía tu ubicación GPS. Busca lugares públicos de la ZMM.
            </p>
            <button
              className="primary-button full-width"
              disabled={busy || query.trim().length < 3}
            >
              {busy ? 'Buscando lugares…' : 'Buscar lugar'}
            </button>
          </>
        )}
      </form>
      {kind === 'stops' ? (
        <>
          <div className="mobility-stop-filters" role="group" aria-label="Filtrar puntos oficiales">
            {[
              ['all', 'Todos'],
              ['metro', 'Metro'],
              ['bus', 'Autobús'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={mode === id}
                onClick={() => {
                  setMode(id);
                  setLimit(40);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="station-picker-count" role="status">
            {matches.length} puntos oficiales publicados
            {!online ? ' · disponibles sin conexión' : ''}
          </p>
          <div className="mobility-stop-list">
            {matches.slice(0, limit).map((stop) => (
              <button key={stop.id} type="button" onClick={() => selectStop(stop)}>
                {stop.mode === 'metro' ? <TrainFront size={19} /> : <BusFront size={19} />}
                <span>
                  <strong>{stop.name}</strong>
                  <small>
                    {stop.routeIds
                      .map((id) => network.routes.find((route) => route.id === id)?.code ?? id)
                      .join(' · ')}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            {!matches.length && (
              <p className="mobility-feedback">
                No hay coincidencias. Cambia el nombre o el filtro.
              </p>
            )}
            {matches.length > limit && (
              <button className="text-button" onClick={() => setLimit((value) => value + 40)}>
                Mostrar más puntos
                <ChevronDown size={16} />
              </button>
            )}
          </div>
          <p className="mobility-method-note">
            Publicados por las autoridades; el estado físico, el sentido y la accesibilidad de
            paradas de autobús siguen sin verificar.
          </p>
        </>
      ) : (
        <>
          {error && (
            <p role="alert" className="mobility-error">
              {error}
            </p>
          )}
          <div className="mobility-stop-list">
            {places.map((place) => (
              <button
                key={place.id}
                onClick={() =>
                  onSelect({ lat: place.lat, lng: place.lng, kind: 'place', name: place.name })
                }
              >
                <MapPin size={19} />
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.displayName}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            {searched && !places.length && (
              <p className="mobility-feedback" role="status">
                No encontramos ese lugar en la ZMM. Añade su municipio o elige una parada.
              </p>
            )}
          </div>
          <a
            className="mobility-osm-link"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            Lugares: © OpenStreetMap contributors · ODbL
          </a>
        </>
      )}
    </Dialog>
  );
}
