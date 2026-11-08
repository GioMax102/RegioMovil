import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  ExternalLink,
  Heart,
  HelpCircle,
  House,
  Info,
  Leaf,
  MapPin,
  Monitor,
  MoreHorizontal,
  Navigation,
  Route,
  Settings2,
  ShieldCheck,
  TrainFront,
  Users,
  Volume2,
  WifiOff,
  Bell,
  X,
} from 'lucide-react';
import { loadBoard, network, readStored, writeStored, type Transport } from './api';
import type { Arrival, Board, Page, Preference, Scenario } from './types';
const loadNetworkExplorer = () => import('./components/NetworkExplorer');
const loadReportDialog = () => import('./components/ReportEntry');
const loadSettingsDialog = () => import('./components/SettingsDialog');
const loadSourcesDialog = () => import('./components/SourcesDialog');
const MobilityPlanner = lazy(() => import('./mobility/MobilityPlanner'));
const SavedMobilityTrips = lazy(() => import('./mobility/SavedMobilityTrips'));
const SavedTripPreview = lazy(() => import('./mobility/SavedTripPreview'));
const ArrivalDetails = lazy(() => import('./components/ArrivalDetails'));
import type { MobilityEndpoint, SavedMobilityTrip } from './mobility/types';
import { ArrivalCard, Brand, Dialog, Forecast, LineBadge } from './components/Primitives';
import HomeDashboard from './components/HomeDashboard';
import type { HomeSelection, HomeUiState } from './components/homeTypes';
import type { RegionalView } from './mobility/regionalViewport';
import { useAppearance } from './appearance';
import { ActionFeedback } from './components/ActionFeedback';
import { DataPreferencesProvider } from './dataPreferences';
import DeferredSection from './components/DeferredSection';
import SectionLoading from './components/SectionLoading';
import { usePageFocus } from './usePageFocus';
import MetroStationDetail from './components/MetroStationDetail';
import { useStationFavorites } from './components/stationFavorites';
import MetroStationBrowser from './components/MetroStationBrowser';
import { getNextMetroOpening, isMetroOperating } from './components/metroServiceHours';
import { scenarioLabels } from './scenarios';
import { useAppNavigation } from './navigation';

type Modal = 'station' | 'settings' | 'sources' | 'report' | 'alerts' | null;
type SavedJourney = { from: string; to: string };
const navItems: { id: Page; label: string; short: string; icon: typeof House }[] = [
  { id: 'home', label: 'Mi camino', short: 'Inicio', icon: House },
  { id: 'plan', label: 'Planear viaje', short: 'Planear', icon: Route },
  { id: 'stations', label: 'Red de transporte', short: 'Red', icon: TrainFront },
  { id: 'mobility', label: 'Mi movilidad', short: 'Viajes', icon: Bookmark },
];
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
  const [params] = useState(() => new URLSearchParams(location.search));
  const lockedKiosk = params.get('locked') === '1';
  const navigation = useAppNavigation(lockedKiosk);
  const { page, network: networkTab, navigate, kiosk } = navigation;
  const setPage = (page: Page) => navigate({ page });
  const setNetworkTab = (network: 'stations' | 'routes') => navigate({ page: 'stations', network });
  const appearance = useAppearance(!lockedKiosk);
  const [station, setStation] = useState(() =>
    validStation(
      params.get('station') || (kiosk ? 'padre-mier' : readStored('station', 'padre-mier')),
    ),
  );
  const pageTitle = usePageFocus(page);
  const [homeSelection, setHomeSelection] = useState<HomeSelection>(() => ({
    kind: 'metro',
    stationId: station,
    source: 'base',
  }));
  const homeMapViews = useRef(new Map<string, RegionalView>());
  const homeUiState = useRef<HomeUiState>({ metroMapOpen: true });
  const [networkSelection, setNetworkSelection] = useState<{ routeId: string; stopId?: string }>();
  const [requireOriginSelection, setRequireOriginSelection] = useState(false);
  const [initialMobilityTrip, setInitialMobilityTrip] = useState<
    | {
        from: MobilityEndpoint;
        to: MobilityEndpoint;
        preference: Preference;
      }
    | undefined
  >();
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [boardSnapshot, setBoard] = useState<Board | null>(null);
  const [transport, setTransport] = useState<Transport>('local');
  const [loading, setLoading] = useState(true);
  const [modal, updateModal] = useState<Modal>(() => {
    try {
      return !kiosk &&
        (params.get('report') === '1' ||
          Number(localStorage.getItem('regiomovil:report-open')) > Date.now())
        ? 'report'
        : null;
    } catch {
      return null;
    }
  });
  function setModal(next: Modal) {
    if (next !== 'report' && new URLSearchParams(location.search).has('report')) {
      const url = new URL(location.href);
      url.searchParams.delete('report');
      history.replaceState(history.state, '', url);
    }
    updateModal(next);
  }
  const [reportTarget, setReportTarget] = useState<{ stationId?: string; routeId?: string }>({});
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [toast, setToast] = useState('');
  const [homeTrip, setHomeTrip] = useState<SavedMobilityTrip | null>(null);
  const [largeText, setLargeText] = useState(() => readStored('largeText', false));
  const [contrast, setContrast] = useState(() => readStored('contrast', false));
  const [lowData, setLowData] = useState(() => readStored('lowData', false));
  const {
    favorites,
    entries: favoriteStations,
    toggleFavorite: toggleStoredFavorite,
  } = useStationFavorites(kiosk);
  const [initialMobilityOrigin, setInitialMobilityOrigin] = useState<MobilityEndpoint>();
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
  const [stationQuery, setStationQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(new Date());
  const currentStation = network.stations.find((s) => s.id === station)!;
  const homeStation =
    homeSelection.kind === 'metro'
      ? (network.stations.find((item) => item.id === homeSelection.stationId) ?? currentStation)
      : currentStation;
  function selectHome(next: HomeSelection) {
    setHomeSelection(next);
    if (next.kind === 'metro') setStation(next.stationId);
  }
  function planHome(selected: HomeSelection) {
    homeUiState.current.returnTo = 'plan';
    homeUiState.current.scrollTop = window.scrollY;
    setInitialMobilityTrip(undefined);
    const id = selected.kind === 'metro' ? selected.stationId : selected.stopId;
    setInitialMobilityOrigin(id ? { id } : undefined);
    setRequireOriginSelection(!id);
    setPage('plan');
  }
  function exploreHome(selected: HomeSelection) {
    homeUiState.current.returnTo = 'map';
    homeUiState.current.scrollTop = window.scrollY;
    setNetworkSelection(
      selected.kind === 'metro'
        ? {
            routeId: selected.lineId ?? homeStation.lineIds[0],
            stopId: `metro:${selected.stationId}`,
          }
        : { routeId: selected.route.id, stopId: selected.stopId },
    );
    navigate({ page: 'stations', network: 'routes' });
  }
  useEffect(() => {
    if (page === 'home' && !kiosk && homeSelection.kind === 'metro') {
      setStation(homeSelection.stationId);
    }
  }, [page, kiosk, homeSelection]);
  function openReport(target: { stationId?: string; routeId?: string }) {
    setReportTarget(target);
    setModal('report');
  }
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
      setModal(null);
      setArrival(null);
    }
  }, [kiosk]);

  const announce = useCallback((message: string) => setToast(message), []);
  function openMobilityPlanner() {
    setInitialMobilityTrip(undefined);
    setInitialMobilityOrigin(undefined);
    setRequireOriginSelection(false);
    setPage('plan');
  }
  function toggleKiosk() {
    navigation.toggleKiosk(station);
  }
  function toggleFavorite(id: string) {
    const result = toggleStoredFavorite(id);
    announce(
      !result?.persisted
        ? 'No pudimos guardar la estación en este dispositivo.'
        : result.saved
          ? 'Estación guardada en este dispositivo.'
          : 'Estación eliminada de tus guardadas.',
    );
  }
  function speakBoard() {
    if (!('speechSynthesis' in window)) {
      announce('Este dispositivo no tiene lectura en voz alta disponible.');
      return;
    }
    speechSynthesis.cancel();
    const operating = isMetroOperating(now);
    const first = operating ? board?.arrivals[0] : null;
    const utterance = new SpeechSynthesisUtterance(
      `Regio Móvil. Estación ${currentStation.name}. Datos de demostración, no son arribos reales. ${!operating ? `Fuera del horario general de Metro. Próxima apertura a las ${getNextMetroOpening(now)}.` : first ? `Próxima unidad simulada de ${first.lineName}, hacia ${first.direction}, en aproximadamente ${first.etaRange[0]} a ${first.etaRange[1]} minutos. Afluencia ${first.occupancyLabel}.` : 'Sin información de unidades.'}`,
    );
    utterance.lang = 'es-MX';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
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
      <Forecast data={board.forecast} compact serviceDate={board.generatedAt} />
      <div className="forecast-foot">
        <span>
          <i className="legend-dot" /> Menor afluencia
        </span>
        <span>Proyección simulada</span>
      </div>
    </section>
  );

  const content = (
    <div
      className={`app-shell ${!kiosk && page !== 'home' ? 'context-page' : ''} ${kiosk ? 'kiosk' : ''} ${!kiosk && page === 'stations' ? 'network-page' : ''} ${!kiosk && page === 'home' ? 'home-page' : ''} ${!kiosk && (page === 'plan' || (page === 'stations' && networkTab === 'routes')) ? 'map-page' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {!kiosk && (
        <aside className="sidebar">
          <a
            href={navigation.href({ page: 'home' })}
            className="brand-link"
            aria-label="RegioMóvil, inicio"
            onClick={(e) => {
              navigation.follow(e, { page: 'home' });
            }}
          >
            <Brand />
          </a>
          <div className="sidebar-location">
            <MapPin size={14} />
            <span>Monterrey, Nuevo León</span>
          </div>
          <span className="nav-caption">Tu movilidad</span>
          <nav aria-label="Navegación principal">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={navigation.href({ page: item.id })}
                aria-current={page === item.id ? 'page' : undefined}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={(event) => {
                  navigation.follow(event, { page: item.id });
                  if (event.defaultPrevented) setStationQuery('');
                }}
              >
                <item.icon size={20} />
                {item.label}
                {page === item.id && <span className="nav-dot" />}
              </a>
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
                <Heart size={12} /> Hecho para Nuevo León
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
        <header className={`topbar ${!kiosk && page !== 'home' ? 'context-topbar' : ''}`}>
          {!kiosk && page !== 'home' ? (
            <details
              className="context-app-menu"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus();
                }
              }}
            >
              <summary aria-label="Información y avisos" title="Información y avisos">
                <MoreHorizontal size={22} aria-hidden="true" />
                {!!board?.alerts.length && <i className="context-alert-dot" />}
              </summary>
              <div>
                <span role="status">
                  {!online ? 'Sin conexión' : transport === 'local' ? 'Modo local' : 'En línea'}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    const menu = event.currentTarget.closest('details');
                    menu?.removeAttribute('open');
                    menu?.querySelector('summary')?.focus();
                    setModal('sources');
                  }}
                >
                  <Info size={18} />
                  Datos y simulación
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    const menu = event.currentTarget.closest('details');
                    menu?.removeAttribute('open');
                    menu?.querySelector('summary')?.focus();
                    setModal('alerts');
                  }}
                >
                  <Bell size={18} />
                  Ver avisos
                </button>
              </div>
            </details>
          ) : (
            <>
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
                {!kiosk && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Datos y simulación"
                    onClick={() => setModal('sources')}
                  >
                    <Info size={19} aria-hidden="true" />
                  </button>
                )}
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
                  {!online ? 'Sin conexión' : transport === 'local' ? 'Modo local' : 'En línea'}
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
            </>
          )}
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          key={page}
          className={`page-transition view-${page}`}
          aria-labelledby="page-title"
        >
          <div className={`page-heading ${page === 'home' || kiosk ? '' : 'compact-heading'}`}>
            <div>
              {(page === 'home' || kiosk) && (
                <span className="eyebrow">
                  {kiosk ? 'En esta parada' : 'Tu ciudad, a tu ritmo'}
                </span>
              )}
              <h1 id="page-title" ref={pageTitle} tabIndex={-1}>
                {kiosk
                  ? currentStation.name
                  : page === 'home'
                    ? 'Muévete con más calma.'
                    : page === 'plan'
                      ? 'Planea tu viaje.'
                      : page === 'stations'
                        ? 'Red de transporte.'
                        : 'Tus guardados.'}
              </h1>
              {kiosk && <p>Llegadas y afluencia simuladas.</p>}
            </div>
            {kiosk && (
              <button className="primary-button" onClick={speakBoard}>
                <Volume2 size={22} />
                Escuchar información
              </button>
            )}
          </div>
          {kiosk && (
            <div className="demo-banner compact-demo">
              <span className="demo-label">
                <span className="status-dot" /> DEMOSTRACIÓN
              </span>
              <p>Operación simulada.</p>
              <button
                onClick={() => setModal('sources')}
                aria-label="Conocer fuentes y límites de la demostración"
              >
                <Info size={16} />
                <span>Ver fuentes</span>
              </button>
            </div>
          )}

          {page === 'home' && !kiosk && (
            <HomeDashboard
              now={now}
              station={homeStation}
              board={board?.stationId === homeStation.id ? board : null}
              loading={loading}
              favorite={favorites.includes(homeStation.id)}
              onFavorite={() => toggleFavorite(homeStation.id)}
              onArrival={setArrival}
              onSavedTrip={setHomeTrip}
              onSaved={() => setPage('mobility')}
              onNetwork={exploreHome}
              onStationDetails={() => {
                navigate({ page: 'stations', network: 'stations' });
                setLineFilter('all');
                setStation(homeStation.id);
                setStationQuery(homeStation.name);
              }}
              onReport={() => openReport({})}
              onChooseStation={() => {
                setStationQuery('');
                setModal('station');
              }}
              onSelectStation={setStation}
              selection={homeSelection}
              onSelect={selectHome}
              onPlan={planHome}
              mapViews={homeMapViews.current}
              uiState={homeUiState.current}
              onReportTarget={openReport}
              reportOpen={modal === 'report'}
            />
          )}
          {page === 'home' && kiosk && (
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
                        setStationQuery('');
                        setModal('station');
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
                      aria-pressed={false}
                      disabled
                    >
                      <Bookmark size={20} />
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
                    <button className="text-button" onClick={speakBoard}>
                      Escuchar información
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
                    {!isMetroOperating(now) ? (
                      <p className="metro-closed" role="status">
                        <strong>Fuera de horario</strong>
                        <span>Abre {getNextMetroOpening(now)}</span>
                      </p>
                    ) : board ? (
                      board.arrivals
                        .slice(0, 4)
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
                      setStationQuery('');
                      setModal('station');
                    }}
                  >
                    Cambiar estación
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
              </aside>
            </div>
          )}

          {page === 'plan' && !kiosk && (
            <Suspense fallback={<SectionLoading label="Abriendo el planificador…" />}>
              <MobilityPlanner
                scenario={scenario}
                initialTrip={initialMobilityTrip}
                initialOrigin={initialMobilityOrigin}
                initialStationId={station}
                requireOriginSelection={requireOriginSelection}
              />
            </Suspense>
          )}

          {page === 'stations' && (
            <div
              className="network-section-tabs"
              role="tablist"
              aria-label="Consultar la red de transporte"
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'stations'
                    : event.key === 'End'
                      ? 'routes'
                      : networkTab === 'stations'
                        ? 'routes'
                        : 'stations';
                setNetworkTab(next);
                event.currentTarget
                  .querySelector<HTMLButtonElement>(`#network-${next}-tab`)
                  ?.focus();
              }}
            >
              <button
                id="network-stations-tab"
                role="tab"
                aria-selected={networkTab === 'stations'}
                aria-controls="network-stations-panel"
                aria-label="Estaciones de Metro"
                tabIndex={networkTab === 'stations' ? 0 : -1}
                onClick={() => setNetworkTab('stations')}
              >
                <TrainFront size={17} />
                Metro
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
                Rutas y redes
              </button>
            </div>
          )}
          {page === 'stations' && networkTab === 'routes' && (
            <div id="network-routes-panel" role="tabpanel" aria-labelledby="network-routes-tab">
              <DeferredSection
                load={loadNetworkExplorer}
                loadingLabel="Abriendo las redes…"
                onRetry={() => {
                  // Failed ESM downloads remain rejected for the current document.
                  // Explicitly reload and resume Red without discarding local saves.
                  const target = new URL(location.href);
                  target.searchParams.set('page', 'stations');
                  location.replace(target.href);
                }}
                componentProps={{
                  initialSelection: networkSelection,
                  onReportRoute: (routeId: string) => openReport({ routeId }),
                  onPlanLine: (lineId: string) => {
                    const line = network.lines.find((item) => item.id === lineId);
                    if (!line) return;
                    setInitialMobilityTrip({
                      from: { id: line.stationIds[0] },
                      to: { id: line.stationIds[line.stationIds.length - 1] },
                      preference: 'fastest',
                    });
                    setRequireOriginSelection(false);
                    setPage('plan');
                  },
                }}
                fallback={
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setNetworkTab('stations');
                      document.getElementById('network-stations-tab')?.focus();
                    }}
                  >
                    Ver estaciones de Metro
                  </button>
                }
              />
            </div>
          )}
          {page === 'stations' && networkTab === 'stations' && (
            <div
              className="stations-layout metro-stations-layout"
              id="network-stations-panel"
              role="tabpanel"
              aria-labelledby="network-stations-tab"
            >
              <MetroStationBrowser
                stations={network.stations}
                lines={network.lines}
                selectedStationId={station}
                query={stationQuery}
                lineFilter={lineFilter}
                onQueryChange={setStationQuery}
                onLineFilterChange={setLineFilter}
                onSelect={setStation}
              />
              <MetroStationDetail
                onReport={() => openReport({ stationId: station })}
                station={currentStation}
                board={board}
                saved={favorites.includes(station)}
                onSave={() => toggleFavorite(station)}
                onArrival={setArrival}
                now={now}
                onSelectStation={setStation}
              />
            </div>
          )}

          {page === 'mobility' && (
            <>
              <Suspense fallback={<SectionLoading label="Abriendo guardados…" />}>
                <SavedMobilityTrips
                  onStartPlanning={openMobilityPlanner}
                  onPlan={(trip) => {
                    setInitialMobilityTrip(trip);
                    setPage('plan');
                    window.scrollTo({ top: 0 });
                  }}
                />
              </Suspense>
              <details
                className="saved-extras"
                open={savedJourneys.length > 0 || favorites.length > 0}
              >
                <summary>Estaciones, Metro y pagos</summary>
                <div className="mobility-grid">
                  <div>
                    <section className="panel saved-panel">
                      <div className="panel-heading">
                        <h2>Trayectos de Metro</h2>
                        <Bookmark size={20} />
                      </div>
                      {!savedJourneys.length && (
                        <div className="empty-small">
                          <Route size={29} />
                          <h3>Tu viaje de siempre.</h3>
                          <p>Guarda un viaje para tenerlo a mano.</p>
                          <button className="primary-button" onClick={openMobilityPlanner}>
                            Planear un viaje
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                      {savedJourneys.map((item, index) => (
                        <div className="saved-journey" key={`${item.from}-${item.to}`}>
                          <button
                            onClick={() => {
                              setInitialMobilityTrip({
                                from: { id: item.from },
                                to: { id: item.to },
                                preference: 'fastest',
                              });
                              setPage('plan');
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
                        favoriteStations.map((entry) => (
                          // Metro IDs remain compatible with the established station view.
                          // Bus favorites open their public stop as an origin without inventing a destination.
                          <div key={entry.id} className="favorite-row">
                            <button
                              onClick={() => {
                                if (entry.kind === 'metro') {
                                  setStation(entry.id);
                                  navigate({ page: 'stations', network: 'stations' });
                                  setLineFilter('all');
                                  setStationQuery('');
                                } else {
                                  setInitialMobilityTrip(undefined);
                                  setRequireOriginSelection(false);
                                  setInitialMobilityOrigin({
                                    id: entry.stopId,
                                    name: entry.name,
                                  });
                                  setPage('plan');
                                }
                              }}
                            >
                              <MapPin size={19} />
                              {entry.name}
                              <ChevronRight size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Quitar ${entry.name} de guardadas`}
                              onClick={() => toggleFavorite(entry.id)}
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
                        Solo en este dispositivo.
                      </p>
                    </section>
                  </div>
                  <div>
                    <section className="payment-card">
                      <span className="payment-icon">
                        <Navigation size={24} />
                      </span>
                      <span className="eyebrow">CANALES OFICIALES</span>
                      <h2>Pago y recargas</h2>
                      <p>Consulta Metro o abre Urbani.</p>
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
                      <p className="payment-note">RegioMóvil no procesa pagos.</p>
                    </section>
                    <section className="panel offline-card">
                      <WifiOff size={25} />
                      <h3>Tu red va contigo.</h3>
                      <p>
                        Abre tus mapas guardados sin internet. Las llegadas siguen siendo simuladas.
                      </p>
                      <button className="text-button" onClick={() => setModal('settings')}>
                        Ajustar consumo de datos
                        <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                </div>
              </details>
            </>
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
            <a
              key={item.id}
              href={navigation.href({ page: item.id })}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={(event) => {
                navigation.follow(event, { page: item.id });
                if (event.defaultPrevented) setStationQuery('');
              }}
            >
              <item.icon size={21} />
              <span>{item.short}</span>
            </a>
          ))}
          <button onClick={() => setModal('settings')} aria-label="Accesibilidad y ajustes">
            <Settings2 size={21} />
            <span>Ajustes</span>
          </button>
        </nav>
      )}
      <ActionFeedback key={toast} message={toast} />
      {homeTrip && (
        <Suspense
          fallback={
            <span role="status" className="sr-only">
              Abriendo trayecto…
            </span>
          }
        >
          <SavedTripPreview trip={homeTrip} onClose={() => setHomeTrip(null)} />
        </Suspense>
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
                    if (page === 'home' && !kiosk)
                      selectHome({ kind: 'metro', stationId: s.id, source: 'manual' });
                    else setStation(s.id);
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
      {(modal === 'settings' || modal === 'sources') && (
        <Dialog
          title={modal === 'settings' ? 'A tu manera' : 'Datos claros, decisiones propias'}
          onClose={() => setModal(null)}
          wide={modal === 'sources'}
        >
          <DeferredSection
            key={modal}
            load={modal === 'settings' ? loadSettingsDialog : loadSourcesDialog}
            loadingLabel="Abriendo información…"
            onRetry={() => location.reload()}
            loadingFallback={<p role="status">Abriendo información…</p>}
            errorFallback={
              <p role="alert">
                No pudimos abrir esta sección. Revisa tu conexión y vuelve a intentar.
              </p>
            }
            componentProps={{
              appearance,
              lockedKiosk,
              largeText,
              contrast,
              lowData,
              scenario,
              transport,
              kiosk,
              onLargeText: () => setLargeText(!largeText),
              onContrast: () => setContrast(!contrast),
              onLowData: () => setLowData(!lowData),
              onScenario: setScenario,
              onKiosk: () => {
                setModal(null);
                toggleKiosk();
              },
            }}
          />
        </Dialog>
      )}
      {modal === 'report' && !kiosk && (
        <DeferredSection
          load={loadReportDialog}
          loadingLabel="Abriendo reporte…"
          onRetry={() => location.reload()}
          loadingFallback={
            <Dialog title="Tu experiencia cuenta" onClose={() => setModal(null)}>
              <SectionLoading label="Abriendo reporte…" />
            </Dialog>
          }
          errorFallback={
            <Dialog title="No pudimos abrir el reporte" onClose={() => setModal(null)}>
              <p role="alert">Revisa tu conexión y recarga la aplicación para volver a intentar.</p>
              <button className="primary-button" onClick={() => location.reload()}>
                Recargar aplicación
              </button>
            </Dialog>
          }
          componentProps={{
            initialStationId: reportTarget.stationId,
            initialRouteId: reportTarget.routeId,
            onClose: () => setModal(null),
            onSent: () => {
              setModal(null);
              announce('Reporte recibido. Queda privado y pendiente de revisión.');
            },
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
        <Suspense
          fallback={
            <span role="status" className="sr-only">
              Abriendo unidad…
            </span>
          }
        >
          <ArrivalDetails arrival={arrival} onClose={() => setArrival(null)} />
        </Suspense>
      )}
    </div>
  );
  return <DataPreferencesProvider enabled={lowData}>{content}</DataPreferencesProvider>;
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
