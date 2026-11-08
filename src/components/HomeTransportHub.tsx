import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Flag,
  Info,
  LocateFixed,
  Map,
  Route,
} from 'lucide-react';
import { loadRoutePack, loadTransitCatalog, network } from '../api';
import type { RoutePack } from '../types';
import type { RegionalView } from '../mobility/regionalViewport';
import type { SavedMobilityTrip } from '../mobility/types';
import { homeMetroCoordinates, homeRouteSegments, homeSourceHref } from './homeTransport';
import { homeCanonicalStops } from './homeNearby';
import type { HomeRoute, HomeSelection, HomeUiState } from './homeTypes';
import { useHomeNearby } from './useHomeNearby';
import HomeTransportSelector, {
  homeSelectionKey,
  homeSelectionName,
} from './HomeTransportSelector';
import HomeTransportMap from './HomeTransportMap';
import DeferredSection from './DeferredSection';
import { Dialog } from './Primitives';
import HomeSavedTrips from './HomeSavedTrips';
import { useHomeReportDraft } from './useHomeReportDraft';
import { useHomeUiReturn } from './useHomeUiReturn';
import './homeTransportHub.css';

const loadPicker = () => import('./HomeTransportPicker');
const loadCommunity = () => import('./HomeCommunityFeed');
const loadSelectedMap = () => import('./HomeSelectedRouteMap');
type Target = { stationId?: string; routeId?: string };

/** This optional selector never owns or blocks the immediate Metro board. */
export function HomeTransportTools({
  selection,
  onSelect,
  reportOpen = false,
}: {
  selection: HomeSelection;
  onSelect: (selection: HomeSelection) => void;
  reportOpen?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAttempt, setPickerAttempt] = useState(0);
  const nearby = useHomeNearby({ selection, onSelect, suspendAutomatic: pickerOpen || reportOpen });
  function openPicker() {
    nearby.cancelPending();
    setPickerOpen(true);
  }
  function closePicker() {
    nearby.cancelPending();
    setPickerOpen(false);
  }
  return (
    <div className="home-transport-tools">
      <HomeTransportSelector
        selection={selection}
        candidates={nearby.candidates}
        onSelect={onSelect}
        onOpenPicker={openPicker}
        onInteraction={nearby.cancelPending}
      />
      <div className="home-context-nearby">
        <button type="button" onClick={() => void nearby.findNearby()} disabled={nearby.busy}>
          <LocateFixed size={16} aria-hidden="true" />
          {nearby.enabled ? 'Actualizar cercanos' : 'Cerca de mí'}
        </button>
        {nearby.canExpand && (
          <button type="button" onClick={() => void nearby.expandRadius()}>
            Ampliar a 3 km
          </button>
        )}
        {nearby.enabled && (
          <button type="button" className="home-context-disable" onClick={nearby.disable}>
            Desactivar cercanía
          </button>
        )}
      </div>
      {!nearby.enabled && (
        <p className="home-context-privacy">
          Tú decides cuándo usar tu ubicación. Se procesa en este dispositivo.
        </p>
      )}
      {nearby.busy && (
        <p className="home-transport-status" role="status">
          Buscando opciones cercanas…
        </p>
      )}
      {nearby.message && !pickerOpen && (
        <p className="home-transport-status" role="status">
          {nearby.message}
        </p>
      )}
      {pickerOpen && (
        <DeferredSection
          key={pickerAttempt}
          load={loadPicker}
          componentProps={{
            selection,
            candidates: nearby.candidates,
            nearbyBusy: nearby.busy,
            nearbyMessage: nearby.message,
            onNearby: () => void nearby.findNearby(),
            onClose: closePicker,
            onConfirm: (next: HomeSelection) => {
              nearby.cancelPending();
              onSelect(next);
              setPickerOpen(false);
            },
          }}
          loadingLabel="Abriendo selección de transporte…"
          onRetry={() => setPickerAttempt((value) => value + 1)}
          loadingFallback={
            <Dialog title="Elige tu transporte" onClose={closePicker}>
              <p role="status">Abriendo selección de transporte…</p>
            </Dialog>
          }
          errorFallback={
            <Dialog title="Elige tu transporte" onClose={closePicker}>
              <div role="alert">
                <p>No pudimos abrir la selección. Tu transporte actual sigue disponible.</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPickerAttempt((value) => value + 1)}
                >
                  Reintentar selector
                </button>
              </div>
              <button type="button" className="secondary-button" onClick={closePicker}>
                Cerrar selector
              </button>
            </Dialog>
          }
        />
      )}
    </div>
  );
}

function CommunitySection({ target, onContribute }: { target: Target; onContribute: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <DeferredSection
      key={attempt}
      load={loadCommunity}
      componentProps={{ ...target, onContribute }}
      loadingLabel="Consultando la comunidad…"
      loadingFallback={<p role="status">Consultando la comunidad…</p>}
      onRetry={() => setAttempt((value) => value + 1)}
      errorFallback={
        <div className="home-community-error" role="alert">
          <p>No pudimos abrir las observaciones. Puedes seguir consultando tu transporte.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Reintentar observaciones
          </button>
        </div>
      }
    />
  );
}
function SelectedMap({
  selection,
  pack,
  onNetwork,
  mapViews,
}: {
  selection: HomeSelection;
  pack?: RoutePack;
  onNetwork: (selection: HomeSelection) => void;
  mapViews?: Map<string, RegionalView>;
}) {
  const [attempt, setAttempt] = useState(0);
  const station =
    selection.kind === 'metro'
      ? network.stations.find((item) => item.id === selection.stationId)
      : null;
  const line = station
    ? network.lines.find(
        (item) =>
          item.id === ((selection.kind === 'metro' && selection.lineId) || station.lineIds[0]),
      )
    : null;
  const segments = useMemo(
    () =>
      pack
        ? homeRouteSegments(pack)
        : line
          ? [homeMetroCoordinates(network.stations, line.stationIds)]
          : [],
    [pack, line],
  );
  const fallback = (
    <>
      <p className="home-transport-note">
        El mapa detallado no está disponible. Este esquema conserva los tramos publicados.
      </p>
      <HomeTransportMap
        segments={segments}
        marker={station || undefined}
        name={homeSelectionName(selection)}
        line={line?.id}
        onNetwork={() => onNetwork(selection)}
      />
    </>
  );
  return (
    <DeferredSection
      key={attempt}
      load={loadSelectedMap}
      componentProps={{
        selection,
        pack,
        onExpand: () => onNetwork(selection),
        viewCache: mapViews,
      }}
      loadingLabel="Abriendo el mapa…"
      loadingFallback={<p role="status">Abriendo el mapa…</p>}
      onRetry={() => setAttempt((value) => value + 1)}
      errorFallback={
        <div className="home-map-error" role="alert">
          {fallback}
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar mapa
          </button>
        </div>
      }
    />
  );
}

function MetroMapSection(props: {
  selection: HomeSelection;
  onNetwork: (selection: HomeSelection) => void;
  mapViews?: Map<string, RegionalView>;
  uiState?: HomeUiState;
}) {
  const [open, setOpen] = useState(props.uiState?.metroMapOpen ?? true);
  return (
    <details
      className="home-metro-map"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (props.uiState) props.uiState.metroMapOpen = event.currentTarget.open;
      }}
    >
      <summary data-home-action="map">
        <Map size={18} aria-hidden="true" />
        Ver mapa de la línea
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      {open && <SelectedMap {...props} />}
    </details>
  );
}

/** Context details are optional; the parent renders Metro predictions before this component. */
export default function HomeTransportHub({
  selection,
  onSelect,
  onNetwork,
  onPlan,
  onSaved,
  onSavedTrip,
  onReportTarget,
  onReportGeneral,
  hasReportDraft: draftOverride,
  reportOpen = false,
  mapViews,
  uiState,
}: {
  selection: HomeSelection;
  onSelect: (selection: HomeSelection) => void;
  onNetwork: (selection: HomeSelection) => void;
  onPlan: (selection: HomeSelection) => void;
  onSaved: () => void;
  onSavedTrip?: (trip: SavedMobilityTrip) => void;
  onReportTarget: (target: Target) => void;
  onReportGeneral: () => void;
  reportOpen?: boolean;
  hasReportDraft?: boolean;
  mapViews?: Map<string, RegionalView>;
  uiState?: HomeUiState;
}) {
  const storedDraft = useHomeReportDraft(reportOpen, draftOverride === undefined);
  const hasReportDraft = draftOverride ?? storedDraft;
  const container = useHomeUiReturn(uiState);
  const [packState, setPackState] = useState<{
    key: string;
    pack?: RoutePack;
    error?: string;
    updatedRoute?: HomeRoute;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const route = selection.kind === 'bus' ? selection.route : null;
  const key = homeSelectionKey(selection);
  const routeKey = route
    ? `${route.id}:${route.geometryPack || ''}:${route.geometryRevision || ''}`
    : '';
  useEffect(() => {
    if (!route?.geometryPack) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPackState({ key: routeKey });
      loadTransitCatalog(controller.signal)
        .then(async ({ data }) => {
          const current = data.routes.find(
            (candidate) =>
              candidate.id === route.id &&
              candidate.mode === 'bus' &&
              ['published', 'operational'].includes(candidate.status),
          );
          if (
            !current ||
            current.geometryPack !== route.geometryPack ||
            current.geometryRevision !== route.geometryRevision
          ) {
            if (active)
              setPackState({
                key: routeKey,
                error:
                  'Este recorrido cambió desde tu selección. Confirma su revisión actual o vuelve a elegir una ruta.',
                updatedRoute: current,
              });
            return;
          }
          if (!active) return;
          return loadRoutePack(current, controller.signal);
        })
        .then(
          (result) => {
            if (!result) return;
            const { data } = result;
            if (active) setPackState({ key: routeKey, pack: data });
          },
          () => {
            if (active)
              setPackState({
                key: routeKey,
                error:
                  'No pudimos abrir este recorrido. Puedes planear, reportar o consultar la red.',
              });
          },
        );
    }, 240);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [routeKey, attempt]);
  const pack = packState?.key === routeKey ? packState.pack : undefined;
  const error = packState?.key === routeKey ? packState.error : undefined;
  const updatedRoute = packState?.key === routeKey ? packState.updatedRoute : undefined;
  const stops = useMemo(
    () => (pack && route ? homeCanonicalStops(route, pack) : []),
    [pack, routeKey],
  );
  const stop = selection.kind === 'bus' ? stops.find((item) => item.id === selection.stopId) : null;
  const target: Target =
    selection.kind === 'metro'
      ? { stationId: selection.stationId }
      : { routeId: selection.route.id };
  const source = homeSourceHref(pack?.sourceUrl);
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(pack?.verifiedAt || '')?.[1];
  const report = () => (hasReportDraft ? onReportGeneral() : onReportTarget(target));
  const planningSelection: HomeSelection = selection.kind === 'bus' ? { ...selection } : selection;
  if (planningSelection.kind === 'bus') {
    if (stop) planningSelection.stopId = stop.id;
    else delete planningSelection.stopId;
  }
  const actions = (
    <div className="home-context-actions" aria-label="Acciones para este transporte">
      <button type="button" data-home-action="plan" onClick={() => onPlan(planningSelection)}>
        <Route size={19} aria-hidden="true" />
        <span>Planear desde aquí</span>
      </button>
      <button type="button" className="home-context-report" onClick={report}>
        <Flag size={19} aria-hidden="true" />
        <span>{hasReportDraft ? 'Continuar reporte' : 'Reportar aquí'}</span>
      </button>
      <button type="button" onClick={onSaved}>
        <Bookmark size={19} aria-hidden="true" />
        <span>Guardados</span>
      </button>
    </div>
  );
  return (
    <div className="home-transport-hub" key={key} ref={container}>
      {actions}
      {selection.kind === 'bus' && (
        <section className="home-bus-context" aria-label="Información de la ruta seleccionada">
          <p className="home-bus-availability">
            <Info size={17} aria-hidden="true" />
            Llegadas y afluencia no disponibles
          </p>
          {route && !route.geometryPack ? (
            <div className="home-map-pending">
              <Map size={22} aria-hidden="true" />
              <p>Trazo pendiente. Esta ruta conserva su ficha y puede recibir observaciones.</p>
              <button type="button" onClick={() => onNetwork(selection)}>
                Ver ficha en la red
                <ArrowRight size={17} />
              </button>
            </div>
          ) : error ? (
            <div className="home-map-error" role="alert">
              <p>{error}</p>
              {updatedRoute ? (
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'bus', route: updatedRoute, source: 'manual' })}
                >
                  Usar versión actual
                </button>
              ) : (
                <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                  Reintentar trazo
                </button>
              )}
            </div>
          ) : !pack ? (
            <p role="status">Abriendo el recorrido seleccionado…</p>
          ) : (
            <>
              {stops.length > 0 && (
                <label className="home-transport-field">
                  Parada del recorrido
                  <select
                    value={stop?.id || ''}
                    onChange={(event) =>
                      onSelect({
                        ...selection,
                        stopId: event.target.value || undefined,
                        source: 'manual',
                      })
                    }
                  >
                    <option value="">Elige una parada para planear desde ella</option>
                    {stops.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selection.stopId && !stop && (
                <p className="home-transport-note" role="status">
                  La parada guardada no coincide con esta revisión del recorrido. Elige una parada o
                  consulta la red.
                </p>
              )}
              <SelectedMap
                selection={selection}
                pack={pack}
                onNetwork={onNetwork}
                mapViews={mapViews}
              />
              <p className="home-transport-note">
                Confirma parada y sentido al abordar.
                {stops.length === 0
                  ? ' Este trazo es para consulta visual; no hay paradas elegibles para planear.'
                  : ''}
              </p>
            </>
          )}
        </section>
      )}
      {selection.kind === 'metro' && (
        <MetroMapSection
          key={`map:${key}`}
          selection={selection}
          onNetwork={onNetwork}
          mapViews={mapViews}
          uiState={uiState}
        />
      )}
      <div className="home-context-participation">
        <button type="button" onClick={onReportGeneral}>
          Crear reporte general
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      <CommunitySection key={`community:${key}`} target={target} onContribute={report} />
      {selection.kind === 'bus' && (
        <details className="home-transport-sources">
          <summary>Fuente y alcance</summary>
          <div>
            {date && (
              <p>
                Referencia del trazo: <time dateTime={date}>{date}</time>.
              </p>
            )}
            {pack?.stopOrderVerified === false && (
              <p>
                Orden de paradas por confirmar. El trazo no establece el sentido de circulación.
              </p>
            )}
            <p>
              El recorrido publicado no confirma la operación actual ni las condiciones de las
              paradas o unidades.
            </p>
            {source && (
              <a href={source} target="_blank" rel="noreferrer">
                Fuente del trazo
              </a>
            )}
            <button type="button" onClick={() => onNetwork(selection)}>
              Consultar ficha y fuentes de la ruta
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </details>
      )}
      {onSavedTrip && <HomeSavedTrips onOpen={onSavedTrip} />}
    </div>
  );
}
