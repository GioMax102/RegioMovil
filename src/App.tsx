import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  CloudRain,
  ExternalLink,
  Flag,
  Heart,
  HelpCircle,
  House,
  Info,
  Leaf,
  MapPin,
  Monitor,
  Navigation,
  Route,
  Settings2,
  ShieldCheck,
  Snowflake,
  Sparkles,
  TrainFront,
  Users,
  Volume2,
  WifiOff,
  Accessibility,
  Bell,
  X,
} from 'lucide-react';
import {
  loadBoard,
  loadPlan,
  network,
  readStored,
  sendReport,
  writeStored,
  type Transport,
} from './api';
import type { Arrival, Board, Journey, Page, Plan, Preference, Scenario, Station } from './types';
import NetworkMap from './components/NetworkMap';
import StationPicker from './components/StationPicker';
import TransitCatalog from './components/TransitCatalog';
import {
  ArrivalCard,
  Brand,
  Dialog,
  Forecast,
  LineBadge,
  Occupancy,
} from './components/Primitives';

type Modal = 'station' | 'settings' | 'sources' | 'report' | 'alerts' | null;
type SavedJourney = { from: string; to: string };
const navItems: { id: Page; label: string; short: string; icon: typeof House }[] = [
  { id: 'home', label: 'Mi camino', short: 'Inicio', icon: House },
  { id: 'plan', label: 'Planear viaje', short: 'Planear', icon: Route },
  { id: 'stations', label: 'Estaciones', short: 'Red', icon: TrainFront },
  { id: 'mobility', label: 'Mi movilidad', short: 'Guardados', icon: Bookmark },
];
const scenarioLabels: Record<Scenario, string> = {
  normal: 'Día habitual',
  peak: 'Hora pico',
  rain: 'Con lluvia',
  disruption: 'Servicio irregular',
};
const validStation = (id: string | null) =>
  network.stations.some((s) => s.id === id) ? id! : 'padre-mier';
const stationName = (id: string) => network.stations.find((s) => s.id === id)?.name ?? id;
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const dateTime = (date: string) =>
  new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Monterrey',
    hour12: false,
  }).format(new Date(date));

export default function App() {
  const params = new URLSearchParams(location.search);
  const [kiosk, setKiosk] = useState(params.get('kiosk') === '1');
  const lockedKiosk = params.get('locked') === '1';
  const [station, setStation] = useState(
    validStation(
      params.get('station') || (kiosk ? 'padre-mier' : readStored('station', 'padre-mier')),
    ),
  );
  const [page, setPage] = useState<Page>('home');
  const [networkTab, setNetworkTab] = useState<'stations' | 'routes'>('stations');
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [boardSnapshot, setBoard] = useState<Board | null>(null);
  const [transport, setTransport] = useState<Transport>('local');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [mapStation, setMapStation] = useState(station);
  const [toast, setToast] = useState('');
  const [largeText, setLargeText] = useState(readStored('largeText', false));
  const [contrast, setContrast] = useState(readStored('contrast', false));
  const [lowData, setLowData] = useState(readStored('lowData', false));
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (params.get('kiosk') === '1') return [];
    const saved = readStored<unknown>('favorites', []);
    return Array.isArray(saved)
      ? saved.filter(
          (id): id is string => typeof id === 'string' && network.stations.some((s) => s.id === id),
        )
      : [];
  });
  const [savedJourneys, setSavedJourneys] = useState<SavedJourney[]>(() => {
    if (params.get('kiosk') === '1') return [];
    const saved = readStored<unknown>('journeys', []);
    return Array.isArray(saved)
      ? saved.filter(
          (v): v is SavedJourney =>
            !!v &&
            typeof v === 'object' &&
            'from' in v &&
            'to' in v &&
            network.stations.some((s) => s.id === v.from) &&
            network.stations.some((s) => s.id === v.to),
        )
      : [];
  });
  const [from, setFrom] = useState(station);
  const [to, setTo] = useState('universidad');
  const [preference, setPreference] = useState<Preference>('fastest');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [stationQuery, setStationQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(new Date());
  const planGeneration = useRef(0);
  const currentStation = network.stations.find((s) => s.id === station)!;
  const board =
    boardSnapshot?.stationId === station && boardSnapshot.scenario === scenario
      ? boardSnapshot
      : null;

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText);
    writeStored('largeText', largeText);
  }, [largeText]);
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', contrast);
    writeStored('contrast', contrast);
  }, [contrast]);
  useEffect(() => {
    writeStored('lowData', lowData);
  }, [lowData]);
  useEffect(() => {
    document.documentElement.classList.toggle('low-data', lowData);
  }, [lowData]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setFrom(station);
    setPlan(null);
    if (!kiosk) writeStored('station', station);
  }, [station, kiosk]);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const update = async () => {
      if (document.hidden) return;
      const request = ++generation;
      setLoading(true);
      const result = await loadBoard(station, scenario);
      if (active && request === generation) {
        setBoard(result.data);
        setTransport(result.transport);
        setLoading(false);
      }
    };
    void update();
    const onVisible = () => {
      if (!document.hidden) void update();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void update(), lowData ? 180000 : 60000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [station, scenario, lowData, online]);
  useEffect(() => {
    if (kiosk) {
      setPage('home');
      setModal(null);
      setArrival(null);
      setJourney(null);
    }
  }, [kiosk]);

  const announce = useCallback((message: string) => setToast(message), []);
  function toggleKiosk() {
    if (lockedKiosk) return;
    const next = !kiosk;
    setKiosk(next);
    const url = new URL(location.href);
    if (next) {
      url.searchParams.set('kiosk', '1');
      url.searchParams.set('station', station);
    } else {
      url.searchParams.delete('kiosk');
      url.searchParams.delete('station');
    }
    history.replaceState({}, '', url);
  }
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id];
    setFavorites(next);
    writeStored('favorites', next);
    announce(
      next.includes(id)
        ? 'Estación guardada en este dispositivo.'
        : 'Estación eliminada de tus guardadas.',
    );
  }
  async function searchJourney(event?: FormEvent) {
    event?.preventDefault();
    setPage('plan');
    setPlanError('');
    setPlan(null);
    if (from === to) {
      setPlanError('Elige un destino diferente a tu origen.');
      return;
    }
    const generation = ++planGeneration.current;
    setPlanning(true);
    try {
      const result = await loadPlan(from, to, preference, scenario);
      if (generation === planGeneration.current) {
        setPlan(result.data);
        if (!result.data.journeys.length)
          setPlanError(
            'No encontramos una conexión en la red disponible. Prueba con otra estación.',
          );
      }
    } catch {
      if (generation === planGeneration.current)
        setPlanError('No pudimos calcular este viaje. Intenta de nuevo.');
    } finally {
      if (generation === planGeneration.current) setPlanning(false);
    }
  }
  function saveJourney() {
    if (savedJourneys.some((v) => v.from === from && v.to === to)) {
      announce('Este trayecto ya está en tus guardados.');
      return;
    }
    const next = [...savedJourneys, { from, to }];
    setSavedJourneys(next);
    writeStored('journeys', next);
    announce('Trayecto guardado. Vuelve a planearlo sin conexión para consultar su mapa.');
  }
  function speakBoard() {
    if (!('speechSynthesis' in window)) {
      announce('Este dispositivo no tiene lectura en voz alta disponible.');
      return;
    }
    speechSynthesis.cancel();
    const first = board?.arrivals[0];
    const utterance = new SpeechSynthesisUtterance(
      `Regio Móvil. Estación ${currentStation.name}. Datos de demostración, no son arribos reales. ${first ? `Próxima unidad simulada de ${first.lineName}, hacia ${first.direction}, en aproximadamente ${first.etaRange[0]} a ${first.etaRange[1]} minutos. Afluencia ${first.occupancyLabel}.` : 'Sin información de unidades.'}`,
    );
    utterance.lang = 'es-MX';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
  useEffect(() => {
    ++planGeneration.current;
    setPlan(null);
    setPlanning(false);
    setPlanError('');
  }, [from, to, preference, scenario]);
  const filteredStations = network.stations.filter(
    (s) =>
      (lineFilter === 'all' || s.lineIds.includes(lineFilter)) &&
      normalize(`${s.name} ${s.municipality} ${s.aliases?.join(' ') ?? ''}`).includes(
        normalize(stationQuery),
      ),
  );
  const planner = (
    <form className={`planner ${page === 'home' ? 'home-planner' : ''}`} onSubmit={searchJourney}>
      <div className="planner-heading">
        <span className="section-icon">
          <Route size={19} />
        </span>
        <h2>¿A dónde vamos?</h2>
        <button
          type="button"
          className="service-discovery-button"
          onClick={() => {
            setPage('stations');
            setNetworkTab('routes');
          }}
        >
          Rutas de autobús
          <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="planner-fields">
        <StationPicker value={from} onChange={setFrom} />
        <button
          type="button"
          className="swap-button"
          aria-label="Intercambiar origen y destino"
          onClick={() => {
            setFrom(to);
            setTo(from);
            setPlan(null);
          }}
        >
          <ArrowDownUp size={17} />
        </button>
        <StationPicker value={to} onChange={setTo} destination />
        <button type="submit" className="primary-button" disabled={planning}>
          {planning ? 'Buscando…' : 'Encontrar mi ruta'}
          <ArrowRight size={18} />
        </button>
      </div>
      {page === 'plan' && (
        <div className="preference-tabs" role="group" aria-label="Preferencia de trayecto">
          {(
            [
              { id: 'fastest', icon: Clock3, label: 'Menos tiempo' },
              { id: 'comfortable', icon: Users, label: 'Menos afluencia' },
              { id: 'accessible', icon: Accessibility, label: 'Menos transbordos' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={preference === item.id}
              className={preference === item.id ? 'active' : ''}
              onClick={() => {
                setPreference(item.id);
                setPlan(null);
              }}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>
      )}
      {planError && (
        <p className="inline-error" role="alert">
          {planError}
        </p>
      )}
    </form>
  );

  const forecastPanel = board && (
    <section className="panel forecast-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ELIGE TU MOMENTO</span>
          <h2>Un poco más de espacio.</h2>
        </div>
        <span className="soft-icon">
          <Users size={21} />
        </span>
      </div>
      <p className="subtle">Afluencia estimada en {currentStation.name}</p>
      <Forecast data={board.forecast} compact />
      <div className="forecast-foot">
        <span>
          <i className="legend-dot" /> Menor afluencia
        </span>
        <span>Proyección simulada</span>
      </div>
    </section>
  );

  return (
    <div className={`app-shell ${kiosk ? 'kiosk' : ''}`}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {!kiosk && (
        <aside className="sidebar">
          <a
            href="/"
            className="brand-link"
            aria-label="RegioMóvil, inicio"
            onClick={(e) => {
              e.preventDefault();
              setPage('home');
            }}
          >
            <Brand />
          </a>
          <div className="sidebar-location">
            <MapPin size={14} />
            <span>Monterrey, Nuevo León</span>
          </div>
          <span className="nav-caption">TU MOVILIDAD</span>
          <nav aria-label="Navegación principal">
            {navItems.map((item) => (
              <button
                key={item.id}
                aria-current={page === item.id ? 'page' : undefined}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => {
                  setPage(item.id);
                  setStationQuery('');
                }}
              >
                <item.icon size={20} />
                {item.label}
                {page === item.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="community-card">
              <MountainIllustration />
              <span>La ciudad es de todos.</span>
              <p>
                Hagamos más fácil
                <br />
                movernos por ella.
              </p>
              <span className="community-mini">
                <Heart size={12} /> HECHO PARA NUEVO LEÓN
              </span>
            </div>
            <button className="sidebar-utility" onClick={toggleKiosk}>
              <Monitor size={18} />
              Modo parada
              <ArrowUpRight size={15} />
            </button>
            <button className="sidebar-utility" onClick={() => setModal('settings')}>
              <Settings2 size={18} />
              Accesibilidad
            </button>
            <button className="sidebar-utility" onClick={() => setModal('sources')}>
              <HelpCircle size={18} />
              Sobre los datos
            </button>
            <div className="sidebar-version">RegioMóvil · Piloto demostrativo</div>
          </div>
        </aside>
      )}
      <div className="workspace">
        <header className="topbar">
          {kiosk ? (
            <Brand />
          ) : (
            <>
              <span className="mobile-brand">
                <Brand />
              </span>
              <div className="breadcrumb">
                <span>Tu ciudad</span>
                <ChevronRight size={14} />
                <strong>{navItems.find((n) => n.id === page)?.label}</strong>
              </div>
            </>
          )}
          <div className="topbar-actions">
            <span className="local-time">
              {new Intl.DateTimeFormat('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Monterrey',
              }).format(now)}
              <span> MONTERREY</span>
            </span>
            <span
              className={`connection-pill ${transport === 'local' || !online ? 'offline' : ''}`}
            >
              {transport === 'local' || !online ? (
                <WifiOff size={12} />
              ) : (
                <span className="status-dot" />
              )}
              {!online ? 'Sin conexión' : transport === 'local' ? 'Modo local' : 'API conectada'}
            </span>
            {!kiosk && (
              <button
                className="icon-button notification-button"
                aria-label="Ver avisos"
                onClick={() => setModal('alerts')}
              >
                <Bell size={20} />
                {!!board?.alerts.length && <i />}
              </button>
            )}
            {kiosk && !lockedKiosk && (
              <button className="text-button" onClick={toggleKiosk}>
                <X size={17} />
                Salir del modo parada
              </button>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {kiosk
                  ? 'INFORMACIÓN EN ESTA PARADA'
                  : page === 'home'
                    ? 'MENOS DUDAS. MÁS CIUDAD.'
                    : page === 'plan'
                      ? 'CADA TRAYECTO, UNA MEJOR DECISIÓN'
                      : page === 'stations'
                        ? networkTab === 'routes'
                          ? 'LAS REDES DE NUEVO LEÓN'
                          : 'CONOCE TU PRÓXIMA PARADA'
                        : 'TUS CAMINOS DE TODOS LOS DÍAS'}
              </span>
              <h1>
                {kiosk
                  ? currentStation.name
                  : page === 'home'
                    ? 'Muévete con más calma.'
                    : page === 'plan'
                      ? 'Encuentra tu mejor camino.'
                      : page === 'stations'
                        ? networkTab === 'routes'
                          ? 'Más rutas, más posibilidades.'
                          : 'Tu estación, más clara.'
                        : 'Tu movilidad, a tu manera.'}
              </h1>
              <p>
                {kiosk
                  ? 'Próximas unidades y afluencia · Escenario de demostración'
                  : page === 'home'
                    ? 'Lo que necesitas saber, antes de salir.'
                    : page === 'plan'
                      ? 'Compara el tiempo y la afluencia. Tú decides cómo viajar.'
                      : page === 'stations'
                        ? networkTab === 'routes'
                          ? 'Busca los servicios publicados y conoce su alcance.'
                          : 'Explora la red de Metrorrey y anticipa tu viaje.'
                        : 'Guarda tus trayectos y encuentra los canales oficiales de pago.'}
              </p>
            </div>
            {!kiosk && (
              <button
                className="location-button"
                onClick={() => {
                  setStationQuery('');
                  setModal('station');
                }}
              >
                <span className="location-icon">
                  <MapPin size={20} />
                </span>
                <span>
                  <small>Tu punto de partida</small>
                  <strong>{currentStation.name}</strong>
                </span>
                <ChevronDown size={16} />
              </button>
            )}
            {kiosk && (
              <button className="primary-button" onClick={speakBoard}>
                <Volume2 size={22} />
                Escuchar información
              </button>
            )}
          </div>
          <div className="demo-banner">
            <span className="demo-label">
              <span className="status-dot" />
              DEMOSTRACIÓN
            </span>
            <p>Red de Metrorrey real. Operación simulada.</p>
            <button
              onClick={() => setModal('sources')}
              aria-label="Conocer fuentes y límites de la demostración"
            >
              <Info size={16} />
              <span>Cómo funciona</span>
            </button>
          </div>

          {page === 'home' && !kiosk && (
            <button className="mobile-plan-cta" onClick={() => setPage('plan')}>
              <span className="soft-icon">
                <Route size={22} />
              </span>
              <span>
                <strong>¿A dónde vamos?</strong>
                <small>Encuentra tu próxima conexión</small>
              </span>
              <ArrowRight size={20} />
            </button>
          )}
          {(page === 'home' || page === 'plan') && !kiosk && planner}

          {page === 'home' && (
            <div className="dashboard-grid">
              <div className="dashboard-main">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div className="map-title">
                      <span className="section-icon">
                        <Navigation size={18} />
                      </span>
                      <div>
                        <h2>Tu punto de conexión</h2>
                        <p>Red Metrorrey · {currentStation.municipality}</p>
                      </div>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (kiosk) {
                          setStationQuery('');
                          setModal('station');
                        } else {
                          setPage('stations');
                          setNetworkTab('stations');
                          setStationQuery('');
                        }
                      }}
                    >
                      Explorar red
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="map-location">
                    <div className="map-location-pin">
                      <MapPin size={19} />
                    </div>
                    <div>
                      <strong>{currentStation.name}</strong>
                      <span>
                        {currentStation.lineIds.map((id) => (
                          <LineBadge key={id} id={id} />
                        ))}
                        <span>Estación seleccionada</span>
                      </span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Guardar estación ${currentStation.name}`}
                      aria-pressed={!kiosk && favorites.includes(station)}
                      onClick={() => {
                        if (!kiosk) toggleFavorite(station);
                      }}
                      disabled={kiosk}
                    >
                      <Bookmark
                        size={20}
                        fill={favorites.includes(station) && !kiosk ? 'currentColor' : 'none'}
                      />
                    </button>
                  </div>
                </section>
                <div className="dashboard-lower">
                  {forecastPanel}
                  <section className="calm-card">
                    <div className="calm-icon">
                      <Leaf size={23} />
                    </div>
                    <span className="eyebrow">UN VIAJE MÁS TRANQUILO</span>
                    <h2>{board?.advice.title || 'Dale un respiro a tu camino.'}</h2>
                    <p>
                      {board?.advice.body ||
                        'Compara las siguientes unidades para elegir el viaje que te acomode.'}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => (kiosk ? speakBoard() : setPage('plan'))}
                    >
                      {kiosk ? 'Escuchar información' : 'Comparar mi trayecto'}
                      <ArrowRight size={17} />
                    </button>
                    <div className="calm-decoration" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </section>
                </div>
              </div>
              <aside className="arrivals-column">
                <section className="panel arrivals-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">EN {currentStation.name.toUpperCase()}</span>
                      <h2>Las próximas unidades</h2>
                    </div>
                    <span className="soft-icon">
                      <TrainFront size={20} />
                    </span>
                  </div>
                  <div className="arrivals-meta">
                    <span>
                      <span className="status-dot" />
                      Predicción simulada
                    </span>
                    {board && <span>Calculada {dateTime(board.generatedAt)}</span>}
                  </div>
                  <div className="arrival-list" aria-busy={loading}>
                    {board ? (
                      board.arrivals
                        .slice(0, kiosk ? 4 : 3)
                        .map((item) => (
                          <ArrivalCard
                            key={item.id}
                            arrival={item}
                            onDetails={() => setArrival(item)}
                          />
                        ))
                    ) : (
                      <div className="loading-state">Preparando tu camino…</div>
                    )}
                  </div>
                  <p className="arrival-disclaimer">
                    <Info size={13} />
                    El tiempo es un rango, no una garantía.
                  </p>
                  <button
                    className="all-arrivals"
                    onClick={() => {
                      if (kiosk) {
                        setStationQuery('');
                        setModal('station');
                      } else {
                        setPage('stations');
                        setNetworkTab('stations');
                        setLineFilter('all');
                        setStationQuery(currentStation.name);
                      }
                    }}
                  >
                    {kiosk ? 'Cambiar estación' : 'Ver estación y pronóstico'}
                    <ArrowRight size={16} />
                  </button>
                </section>
                <section className="small-info-card">
                  <ShieldCheck size={23} />
                  <div>
                    <h3>La claridad también mueve.</h3>
                    <p>Consulta la fuente y el margen de cada estimación.</p>
                    <button className="text-button" onClick={() => setModal('sources')}>
                      Conoce nuestros datos
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </section>
                {!kiosk && (
                  <button className="report-link" onClick={() => setModal('report')}>
                    <Flag size={15} />
                    ¿Algo no está bien? Compártelo
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </aside>
            </div>
          )}

          {page === 'plan' && (
            <div className="plan-layout">
              <section className="plan-results" aria-live="polite">
                {planning && (
                  <div className="panel empty-state">
                    <Route size={32} />
                    <h2>Encontrando conexiones…</h2>
                  </div>
                )}
                {!planning && !plan && (
                  <div className="panel empty-state">
                    <span className="large-soft-icon">
                      <Route size={36} />
                    </span>
                    <h2>Hay más de una forma de llegar.</h2>
                    <p>
                      Elige tu origen, destino y lo que más te importa.
                      <br />
                      Te mostramos conexiones de las líneas 1, 2 y 3.
                    </p>
                    <div className="empty-chips">
                      <span>
                        <Users size={15} />
                        Afluencia estimada
                      </span>
                      <span>
                        <Clock3 size={15} />
                        Rango de tiempo
                      </span>
                    </div>
                  </div>
                )}
                {plan && (
                  <>
                    <div className="results-heading">
                      <h2>{plan.journeys.length} opciones para tu camino</h2>
                      <button className="text-button" onClick={saveJourney}>
                        <Bookmark size={16} />
                        Guardar trayecto
                      </button>
                    </div>
                    <p className="subtle results-note">
                      Tiempos y afluencia simulados. Incluyen márgenes de espera y caminata dentro
                      de la red; no incluyen tu traslado hasta la estación. Abre una opción para ver
                      su mapa y los pasos del recorrido.
                    </p>
                    {plan.journeys.map((item, i) => (
                      <button
                        key={item.id}
                        className={`journey-card panel ${i === 0 ? 'recommended' : ''}`}
                        onClick={() => {
                          setMapStation(item.steps[0]?.fromId ?? from);
                          setJourney(item);
                        }}
                      >
                        {i === 0 && (
                          <span className="recommendation">
                            <Sparkles size={13} />
                            Según tu preferencia
                          </span>
                        )}
                        <div className="journey-top">
                          <div>
                            <h3>{item.title}</h3>
                            <span>
                              {item.transfers === 0
                                ? 'Sin transbordos'
                                : `${item.transfers} transbordo${item.transfers === 1 ? '' : 's'}`}
                            </span>
                          </div>
                          <div className="journey-duration">
                            <strong>{item.durationMinutes}</strong>
                            <span>min aprox.</span>
                          </div>
                        </div>
                        <div className="journey-lines">
                          {item.steps.map((step, index) => (
                            <span key={`${step.lineId}-${index}`}>
                              <LineBadge id={step.lineId} />
                              {index < item.steps.length - 1 && <ArrowRight size={15} />}
                            </span>
                          ))}
                          <span className="journey-destination">
                            {stationName(to)}
                            <ChevronRight size={17} />
                          </span>
                        </div>
                        <div className="journey-bottom">
                          <Occupancy value={item.occupancy} />
                          <span>
                            <Clock3 size={14} />
                            {item.etaRange[0]}–{item.etaRange[1]} min
                          </span>
                        </div>
                      </button>
                    ))}
                    <p className="accessibility-note">
                      <Accessibility size={16} />
                      La accesibilidad de elevadores y unidades no está verificada. Confírmala con
                      Metrorrey antes de viajar.
                    </p>
                  </>
                )}
              </section>
            </div>
          )}

          {page === 'stations' && (
            <div
              className="network-section-tabs"
              role="tablist"
              aria-label="Consultar la red de transporte"
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 'stations' : event.key === 'End' ? 'routes'
                  : networkTab === 'stations' ? 'routes' : 'stations';
                setNetworkTab(next);
                event.currentTarget.querySelector<HTMLButtonElement>(`#network-${next}-tab`)?.focus();
              }}
            >
              <button
                id="network-stations-tab"
                role="tab"
                aria-selected={networkTab === 'stations'}
                aria-controls="network-stations-panel"
                tabIndex={networkTab === 'stations' ? 0 : -1}
                onClick={() => setNetworkTab('stations')}
              >
                <TrainFront size={17} />
                Estaciones de Metro
              </button>
              <button
                id="network-routes-tab"
                role="tab"
                aria-selected={networkTab === 'routes'}
                aria-controls="network-routes-panel"
                tabIndex={networkTab === 'routes' ? 0 : -1}
                onClick={() => setNetworkTab('routes')}
              >
                <Route size={17} />
                Rutas y redes<span className="network-new-label">NUEVO</span>
              </button>
            </div>
          )}
          {page === 'stations' && networkTab === 'routes' && (
            <div id="network-routes-panel" role="tabpanel" aria-labelledby="network-routes-tab">
              <TransitCatalog
                onPlanLine={(lineId) => {
                  const line = network.lines.find((item) => item.id === lineId);
                  if (!line) return;
                  setFrom(line.stationIds[0]);
                  setTo(line.stationIds[line.stationIds.length - 1]);
                  setPlan(null);
                  setPage('plan');
                }}
              />
            </div>
          )}
          {page === 'stations' && networkTab === 'stations' && (
            <div
              className="stations-layout"
              id="network-stations-panel"
              role="tabpanel"
              aria-labelledby="network-stations-tab"
            >
              <section className="panel station-browser">
                <div className="panel-heading">
                  <h2>Explora las estaciones</h2>
                  <span className="count-pill">{network.stations.length}</span>
                </div>
                <label className="search-field">
                  <MapPin size={18} />
                  <input
                    value={stationQuery}
                    onChange={(e) => setStationQuery(e.target.value)}
                    placeholder="Nombre o municipio"
                    aria-label="Buscar estación por nombre o municipio"
                  />
                  {stationQuery && (
                    <button onClick={() => setStationQuery('')} aria-label="Limpiar búsqueda">
                      <X size={16} />
                    </button>
                  )}
                </label>
                <div className="line-filters" role="group" aria-label="Filtrar por línea">
                  {['all', ...network.lines.map((l) => l.id)].map((id) => (
                    <button
                      key={id}
                      aria-pressed={lineFilter === id}
                      className={lineFilter === id ? 'active' : ''}
                      onClick={() => setLineFilter(id)}
                    >
                      {id === 'all' ? 'Todas' : id.replace('L', 'Línea ')}
                    </button>
                  ))}
                </div>
                <div className="station-list">
                  {filteredStations.map((s) => (
                    <button
                      key={s.id}
                      className={`station-list-item ${station === s.id ? 'selected' : ''}`}
                      onClick={() => setStation(s.id)}
                    >
                      <span className="station-circle">
                        <TrainFront size={17} />
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.municipality}</small>
                      </span>
                      <span className="station-line-dots">
                        {s.lineIds.map((id) => (
                          <i
                            key={id}
                            style={{ background: network.lines.find((l) => l.id === id)?.color }}
                            title={id}
                          />
                        ))}
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {!filteredStations.length && (
                    <p className="empty-small">
                      No encontramos esa estación. Prueba otro nombre o municipio.
                    </p>
                  )}
                </div>
              </section>
              <div className="station-detail">
                <section className="station-detail-hero">
                  <span className="eyebrow">TU PARADA, EN CONTEXTO</span>
                  <div>
                    <h2>{currentStation.name}</h2>
                    <button
                      className="icon-button"
                      aria-label="Guardar esta estación"
                      aria-pressed={favorites.includes(station)}
                      onClick={() => toggleFavorite(station)}
                    >
                      <Bookmark
                        size={23}
                        fill={favorites.includes(station) ? 'currentColor' : 'none'}
                      />
                    </button>
                  </div>
                  <p>
                    <MapPin size={16} />
                    {currentStation.municipality}, Nuevo León
                  </p>
                  <div>
                    {currentStation.lineIds.map((id) => (
                      <LineBadge key={id} id={id} />
                    ))}
                  </div>
                </section>
                <div className="station-detail-grid">
                  {forecastPanel}
                  <section className="panel facilities-panel">
                    <h3>Antes de llegar</h3>
                    <p>
                      <Accessibility size={20} />
                      <span>
                        <strong>Accesibilidad sin verificar</strong>
                        <small>No hay datos operativos de elevadores.</small>
                      </span>
                    </p>
                    <p>
                      <Snowflake size={20} />
                      <span>
                        <strong>Condiciones por unidad</strong>
                        <small>Consulta cada arribo simulado.</small>
                      </span>
                    </p>
                    <a
                      className="text-button"
                      href="https://www.metrorrey.mx/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Consultar Metrorrey
                      <ExternalLink size={14} />
                    </a>
                  </section>
                </div>
                <section className="panel station-arrivals">
                  <div className="panel-heading">
                    <h2>Próximas unidades simuladas</h2>
                    <span className="subtle">
                      {board ? `Calculadas ${dateTime(board.generatedAt)}` : ''}
                    </span>
                  </div>
                  {board?.arrivals.slice(0, 4).map((item) => (
                    <ArrivalCard key={item.id} arrival={item} onDetails={() => setArrival(item)} />
                  ))}
                </section>
              </div>
            </div>
          )}

          {page === 'mobility' && (
            <div className="mobility-grid">
              <div>
                <section className="panel saved-panel">
                  <div className="panel-heading">
                    <h2>Tus trayectos</h2>
                    <Bookmark size={20} />
                  </div>
                  {!savedJourneys.length && (
                    <div className="empty-small">
                      <Route size={29} />
                      <h3>El camino de siempre, a mano.</h3>
                      <p>Planea un viaje y guárdalo para encontrarlo aquí.</p>
                      <button className="primary-button" onClick={() => setPage('plan')}>
                        Planear un viaje
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  {savedJourneys.map((item, index) => (
                    <div className="saved-journey" key={`${item.from}-${item.to}`}>
                      <button
                        onClick={() => {
                          setFrom(item.from);
                          setTo(item.to);
                          setPage('plan');
                          setPlan(null);
                        }}
                      >
                        <span className="soft-icon">
                          <Route size={20} />
                        </span>
                        <span>
                          <strong>{stationName(item.from)}</strong>
                          <small>
                            <ArrowRight size={13} />
                            {stationName(item.to)}
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Eliminar trayecto a ${stationName(item.to)}`}
                        onClick={() => {
                          const next = savedJourneys.filter((_, i) => i !== index);
                          setSavedJourneys(next);
                          writeStored('journeys', next);
                          announce('Trayecto eliminado.');
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </section>
                <section className="panel saved-panel">
                  <div className="panel-heading">
                    <h2>Estaciones guardadas</h2>
                    <Heart size={20} />
                  </div>
                  {favorites.length ? (
                    favorites.map((id) => (
                      <div key={id} className="favorite-row">
                        <button
                          onClick={() => {
                            setStation(id);
                            setPage('stations');
                            setNetworkTab('stations');
                            setLineFilter('all');
                            setStationQuery('');
                          }}
                        >
                          <MapPin size={19} />
                          {stationName(id)}
                          <ChevronRight size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Quitar ${stationName(id)} de guardadas`}
                          onClick={() => toggleFavorite(id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="empty-small">
                      Toca el marcador de una estación para guardarla aquí.
                    </p>
                  )}
                  <p className="local-storage-note">
                    <ShieldCheck size={14} />
                    Tus guardados se quedan en este dispositivo. Sin crear cuenta.
                  </p>
                </section>
              </div>
              <div>
                <section className="payment-card">
                  <span className="payment-icon">
                    <Navigation size={24} />
                  </span>
                  <span className="eyebrow">CANALES OFICIALES</span>
                  <h2>
                    Tu pasaje.
                    <br />
                    Por el canal de siempre.
                  </h2>
                  <p>
                    Consulta los medios de pago y recarga de Metrorrey. Para pagos digitales,
                    utiliza Urbani.
                  </p>
                  <a
                    className="light-button"
                    href="https://www.urbani.com.mx/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ir a Urbani
                    <ExternalLink size={16} />
                  </a>
                  <a
                    className="payment-secondary"
                    href="https://www.metrorrey.mx/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Medios de pago de Metrorrey
                    <ArrowUpRight size={14} />
                  </a>
                  <p className="payment-note">
                    RegioMóvil no cobra, recarga saldo ni emite boletos válidos. No está afiliado a
                    Metrorrey o Urbani.
                  </p>
                </section>
                <section className="panel offline-card">
                  <WifiOff size={25} />
                  <h3>Tu red va contigo.</h3>
                  <p>
                    La red, tus guardados y la simulación funcionan sin conexión después de la
                    primera visita o al instalar Android.
                  </p>
                  <button className="text-button" onClick={() => setModal('settings')}>
                    Ajustar consumo de datos
                    <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </div>
          )}

          <footer className="page-footer">
            <span>
              <Brand compact />
              Hecho para acercarnos.
            </span>
            <span>
              Nuevo León, México <i /> Piloto independiente · Sin datos operativos en vivo
            </span>
            <button onClick={() => setModal('sources')}>
              Fuentes y transparencia
              <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {!kiosk && (
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => {
                setPage(item.id);
                setStationQuery('');
                window.scrollTo({ top: 0 });
              }}
            >
              <item.icon size={21} />
              <span>{item.short}</span>
            </button>
          ))}
          <button onClick={() => setModal('settings')} aria-label="Accesibilidad y ajustes">
            <Settings2 size={21} />
            <span>Ajustes</span>
          </button>
        </nav>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal === 'station' && (
        <Dialog title="¿Desde dónde te mueves?" onClose={() => setModal(null)}>
          <p className="dialog-intro">Elige una estación de la red. No necesitamos tu ubicación.</p>
          <label className="search-field">
            <MapPin size={18} />
            <input
              autoFocus
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
              placeholder="Busca una estación o municipio"
              aria-label="Buscar punto de partida"
            />
          </label>
          <div className="dialog-station-list">
            {network.stations
              .filter((s) =>
                normalize(`${s.name} ${s.aliases?.join(' ')} ${s.municipality}`).includes(
                  normalize(stationQuery),
                ),
              )
              .map((s) => (
                <button
                  key={s.id}
                  className="station-list-item"
                  onClick={() => {
                    setStation(s.id);
                    setModal(null);
                  }}
                >
                  <MapPin size={18} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.municipality}</small>
                  </span>
                  {station === s.id ? <Check size={18} /> : <ChevronRight size={16} />}
                </button>
              ))}
          </div>
        </Dialog>
      )}
      {modal === 'settings' && (
        <Dialog title="A tu manera" onClose={() => setModal(null)}>
          <p className="dialog-intro">Pequeños ajustes para un camino más fácil.</p>
          <div className="setting-row">
            <span>
              <strong>Texto más grande</strong>
              <small>Más espacio y mejor lectura.</small>
            </span>
            <button
              role="switch"
              aria-checked={largeText}
              aria-label="Texto más grande"
              className={`switch ${largeText ? 'on' : ''}`}
              onClick={() => setLargeText(!largeText)}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <span>
              <strong>Contraste alto</strong>
              <small>Texto y bordes más definidos.</small>
            </span>
            <button
              role="switch"
              aria-checked={contrast}
              aria-label="Contraste alto"
              className={`switch ${contrast ? 'on' : ''}`}
              onClick={() => setContrast(!contrast)}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <span>
              <strong>Ahorrar datos</strong>
              <small>Actualiza cada 3 minutos y reduce movimiento.</small>
            </span>
            <button
              role="switch"
              aria-checked={lowData}
              aria-label="Ahorrar datos"
              className={`switch ${lowData ? 'on' : ''}`}
              onClick={() => setLowData(!lowData)}
            >
              <span />
            </button>
          </div>
          <div className="settings-section">
            <h3>Explora una situación</h3>
            <p>
              Este selector cambia las predicciones de demostración. No describe el estado actual
              del servicio.
            </p>
            <div className="scenario-grid">
              {(Object.keys(scenarioLabels) as Scenario[]).map((id) => (
                <button
                  key={id}
                  className={scenario === id ? 'selected' : ''}
                  aria-pressed={scenario === id}
                  onClick={() => {
                    setScenario(id);
                    setPlan(null);
                  }}
                >
                  {id === 'rain' ? (
                    <CloudRain size={18} />
                  ) : id === 'peak' ? (
                    <Users size={18} />
                  ) : id === 'disruption' ? (
                    <Info size={18} />
                  ) : (
                    <Leaf size={18} />
                  )}{' '}
                  {scenarioLabels[id]}
                  {scenario === id && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>
          <button
            className="primary-button full-width"
            onClick={() => {
              setModal(null);
              toggleKiosk();
            }}
          >
            <Monitor size={18} />
            {kiosk ? 'Salir del modo parada' : 'Abrir modo parada'}
          </button>
        </Dialog>
      )}
      {modal === 'sources' && (
        <SourcesDialog onClose={() => setModal(null)} transport={transport} scenario={scenario} />
      )}
      {modal === 'report' && !kiosk && (
        <ReportDialog
          station={currentStation}
          onClose={() => setModal(null)}
          onSent={() => {
            setModal(null);
            announce('Reporte guardado para revisión. No cambia el estado oficial del servicio.');
          }}
        />
      )}
      {modal === 'alerts' && (
        <Dialog title="Avisos para tu camino" onClose={() => setModal(null)}>
          <p className="dialog-intro">
            Escenario: {scenarioLabels[scenario]}. Todos los avisos operativos de esta vista son
            simulados.
          </p>
          {board?.alerts.length ? (
            board.alerts.map((alert) => (
              <div className="alert-item" key={alert.id}>
                <Info size={20} />
                <div>
                  <h3>{alert.title}</h3>
                  <p>{alert.body}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-small">
              <ShieldCheck size={30} />
              <h3>Sin incidencias en este escenario.</h3>
              <p>
                Esto no confirma que el servicio real opere sin incidencias. Consulta los avisos de
                Metrorrey antes de salir.
              </p>
            </div>
          )}
          <a
            className="primary-button"
            href="https://www.metrorrey.mx/"
            target="_blank"
            rel="noreferrer"
          >
            Consultar canal oficial
            <ExternalLink size={16} />
          </a>
        </Dialog>
      )}
      {arrival && (
        <Dialog title="Conoce esta unidad" onClose={() => setArrival(null)}>
          <div className="arrival-dialog-hero">
            <LineBadge id={arrival.lineId} />
            <h3>Hacia {arrival.direction}</h3>
            <strong>
              {arrival.etaRange[0]}–{arrival.etaRange[1]} <small>min aprox.</small>
            </strong>
            <p>Intervalo orientativo de un modelo entrenado con datos sintéticos.</p>
          </div>
          <div className="unit-facts">
            <div>
              <Users size={20} />
              <span>
                Afluencia simulada
                <strong>
                  {Math.round(arrival.occupancy)}% · {arrival.occupancyLabel}
                </strong>
              </span>
            </div>
            <div>
              <Snowflake size={20} />
              <span>
                Aire acondicionado simulado
                <strong>
                  {arrival.climate === 'working'
                    ? 'Funcionando'
                    : arrival.climate === 'unavailable'
                      ? 'No disponible'
                      : 'Sin información'}
                </strong>
              </span>
            </div>
            <div>
              <ShieldCheck size={20} />
              <span>
                Condición simulada
                <strong>
                  {arrival.condition === 'good'
                    ? 'Sin incidencia en el escenario'
                    : 'Con observación en el escenario'}
                </strong>
              </span>
            </div>
            <div>
              <Accessibility size={20} />
              <span>
                Accesibilidad real<strong>Sin verificar</strong>
              </span>
            </div>
          </div>
          <p className="notice">
            <Info size={16} />
            No representa una unidad real ni confirma su estado. La confianza del modelo se evalúa
            únicamente con datos sintéticos.
          </p>
        </Dialog>
      )}
      {journey && (
        <Dialog title="Tu camino, paso a paso" onClose={() => setJourney(null)} wide>
          <div className="journey-summary">
            <span>
              {stationName(from)}
              <ArrowRight size={16} />
              {stationName(to)}
            </span>
            <strong>
              {journey.etaRange[0]}–{journey.etaRange[1]} <small>min estimados</small>
            </strong>
            <Occupancy value={journey.occupancy} />
          </div>
          <section className="journey-map" aria-label="Mapa del trayecto en Monterrey">
            <h3>Tu recorrido por Monterrey</h3>
            <NetworkMap
              network={network}
              selected={mapStation}
              onSelect={setMapStation}
              journey={journey}
            />
            <p>Mapa incluido en el dispositivo. Disponible sin internet.</p>
          </section>
          <ol className="journey-steps">
            {journey.steps.map((step, i) => (
              <li key={`${step.lineId}-${i}`}>
                <span className="step-number">{i + 1}</span>
                <div>
                  <LineBadge id={step.lineId} />
                  <h3>
                    {stationName(step.from)} → {stationName(step.to)}
                  </h3>
                  {step.continuesOnTrain && (
                    <p className="through-service">
                      <Check size={14} />
                      Continúa en el mismo tren; no necesitas bajar.
                    </p>
                  )}
                  <p>
                    {step.stationCount} tramos · {step.minutes} min simulados
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="notice">
            <Accessibility size={18} />
            Los transbordos pueden implicar escaleras o recorridos a pie. No contamos con
            información operativa de elevadores.
          </p>
          <button className="primary-button full-width" onClick={saveJourney}>
            <Bookmark size={17} />
            Guardar este trayecto
          </button>
        </Dialog>
      )}
    </div>
  );
}

function SourcesDialog({
  onClose,
  transport,
  scenario,
}: {
  onClose: () => void;
  transport: Transport;
  scenario: Scenario;
}) {
  return (
    <Dialog title="Datos claros, decisiones propias" onClose={onClose} wide>
      <p className="dialog-intro">
        RegioMóvil es un piloto independiente para explorar cómo reducir la incertidumbre del viaje.
        No es una aplicación oficial.
      </p>
      <div className="source-summary">
        <span>
          <ShieldCheck size={22} />
          <strong>Red real</strong>
          <small>Nombres, conexiones y coordenadas de fuentes públicas.</small>
        </span>
        <span>
          <Sparkles size={22} />
          <strong>Operación simulada</strong>
          <small>Arribos, afluencia, clima de unidad y condiciones de ejemplo.</small>
        </span>
      </div>
      <h3>Fuentes de la red</h3>
      <div className="source-list">
        {network.sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
            <span>
              <strong>{source.title}</strong>
              <small>
                {source.verifiedAt
                  ? `Verificación: ${source.verifiedAt}`
                  : 'Fuente pública de consulta'}
              </small>
            </span>
            <ExternalLink size={16} />
          </a>
        ))}
      </div>
      <div className="methodology">
        <h3>Cómo se hacen las predicciones</h3>
        <p>
          Dos modelos de regresión regularizada estiman tiempo de llegada y ocupación con variables
          de horario, intervalos, centralidad, lluvia y disrupciones. Se entrenan y evalúan con
          muestras sintéticas reproducibles.
        </p>
        <p>
          Los rangos se calculan a partir del error de calibración sintético. Su desempeño no
          demuestra precisión en las calles de Nuevo León. Hace falta validar con datos operativos
          antes de usarlo para decisiones reales.
        </p>
        <p>
          <strong>Situación elegida:</strong> {scenarioLabels[scenario]} · <strong>Cálculo:</strong>{' '}
          {transport === 'api' ? 'API del piloto' : 'En este dispositivo, sin servidor'}.
        </p>
        <p>
          El planificador calcula conexiones de las líneas 1, 2 y 3 de Metrorrey. En Rutas y redes
          puedes consultar los servicios y trazos de autobús documentados, con la fecha y fuente de
          cada uno. Los autobuses sin paradas ordenadas y las líneas en construcción quedan fuera
          del cálculo de viajes. No hay tráfico en vivo, tarifas integradas, pagos ni navegación
          peatonal.
        </p>
      </div>
    </Dialog>
  );
}
function ReportDialog({
  station,
  onClose,
  onSent,
}: {
  station: Station;
  onClose: () => void;
  onSent: () => void;
}) {
  const [category, setCategory] = useState('crowding');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await sendReport(station.id, category, detail.trim());
      if (!mounted.current) return;
      onSent();
    } catch (error) {
      if (!mounted.current) return;
      setError(
        error instanceof Error
          ? error.message
          : 'No hay conexión con el servidor. Tu texto sigue aquí; vuelve a intentar.',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog title="Tu experiencia cuenta" onClose={onClose}>
      <p className="dialog-intro">
        Reporte del piloto en <strong>{station.name}</strong>. Se guarda para revisión; no se envía
        a autoridades ni cambia las predicciones.
      </p>
      <form className="report-form" onSubmit={submit}>
        <label>
          ¿Qué observaste?
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="crowding">Saturación de personas</option>
            <option value="climate">Aire acondicionado</option>
            <option value="accessibility">Accesibilidad</option>
            <option value="condition">Condición de la unidad</option>
          </select>
        </label>
        <label>
          Cuéntanos un poco
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            minLength={10}
            maxLength={500}
            required
            placeholder="Describe lo que observaste, sin incluir datos personales."
            rows={4}
          />
          <span className="character-count">{detail.length}/500 · Mínimo 10 caracteres</span>
        </label>
        <p className="subtle">
          No compartas nombres, teléfonos o datos de pago. Los reportes se almacenan en el servidor
          del piloto.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button full-width"
          type="submit"
          disabled={busy || detail.trim().length < 10}
        >
          {busy ? 'Enviando…' : 'Enviar reporte al piloto'}
          <ArrowRight size={17} />
        </button>
      </form>
    </Dialog>
  );
}
function MountainIllustration() {
  return (
    <svg className="mountain-illustration" viewBox="0 0 170 70" aria-hidden="true">
      <circle cx="127" cy="18" r="12" fill="#e5bf6e" />
      <path d="m0 65 42-45 24 22 20-32 40 45 23-20 30 32" fill="#47755a" />
      <path d="m12 68 46-38 35 38m-7 0 40-25 45 25" fill="#789577" />
      <path d="M0 67q60-18 86-3t84-3" fill="none" stroke="#c7d5a7" strokeWidth="2" />
    </svg>
  );
}
