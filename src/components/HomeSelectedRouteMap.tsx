import { useCallback, useMemo } from 'react';
import { network } from '../api';
import type { RoutePack } from '../types';
import type { MobilityNetwork, MobilityRoute, MobilityStop } from '../mobility/types';
import type { RegionalView } from '../mobility/regionalViewport';
import LocationMap from '../mobility/LocationMap';
import { useDataSaver } from '../dataPreferences';
import { normalizePublishedRoute } from '../../shared/published-route.mjs';
import { homeMetroCoordinates } from './homeTransport';
import HomeTransportMap from './HomeTransportMap';
import StopSequence from './StopSequence';
import type { HomeSelection } from './homeTypes';
import './homeSelectedRouteMap.css';

/** Selected source data only. This adapter never loads the regional planner graph. */
export function homeMapNetwork(selection: HomeSelection, pack?: RoutePack): MobilityNetwork | null {
  let route: MobilityRoute;
  let stops: MobilityNetwork['stops'];
  if (selection.kind === 'metro') {
    const station = network.stations.find((item) => item.id === selection.stationId);
    const line = network.lines.find(
      (item) =>
        item.id ===
        (station?.lineIds.includes(selection.lineId ?? '')
          ? selection.lineId
          : station?.lineIds[0]),
    );
    if (!line) return null;
    stops = network.stations
      .filter((item) => line.stationIds.includes(item.id))
      .map((item) => ({
        id: `metro:${item.id}`,
        stationId: item.id,
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        mode: 'metro',
        routeIds: item.lineIds,
        sourceIds: [],
        official: true,
      }));
    route = {
      id: line.id,
      code: line.id,
      name: line.name,
      networkId: 'metrorrey',
      mode: 'metro',
      color: line.color,
      stopOrderVerified: true,
      sourceIds: [],
      segments: [
        {
          id: `${line.id}:0`,
          coordinates: homeMetroCoordinates(network.stations, line.stationIds),
          stopIds: line.stationIds.map((id) => `metro:${id}`),
          positions: line.stationIds.map((_, index) => index),
        },
      ],
    };
  } else {
    if (!pack || pack.id !== selection.route.geometryPack) return null;
    const normalized = normalizePublishedRoute(selection.route, pack);
    stops = normalized.stops.map((stop) => ({ ...stop, sourceIds: stop.sourceIds ?? [] }));
    route = {
      id: selection.route.id,
      code: selection.route.code,
      name: selection.route.name,
      networkId: selection.route.networkId,
      mode: 'bus',
      color: '#4975a4',
      stopOrderVerified: pack.stopOrderVerified,
      sourceIds: [],
      segments: (pack.segments?.length ? pack.segments : [pack.coordinates])
        .map((coordinates, index) => {
          const segment = normalized.segments.find(
            (item) => item.id === `${selection.route.id}:${index}`,
          );
          return {
            id: `${selection.route.id}:${index}`,
            coordinates,
            stopIds: segment?.stopIds ?? [],
            positions: segment?.positions ?? [],
          };
        })
        .filter((segment) => segment.coordinates.length > 1),
    };
  }
  return {
    version: 1,
    mode: 'experimental',
    stops,
    routes: [route],
    coverage: { scope: 'selected-route' },
    assumptions: ['Recorrido publicado; operación y acceso peatonal sin verificar.'],
  };
}

export default function HomeSelectedRouteMap({
  selection,
  pack,
  onExpand,
  viewCache,
  nearbyPosition,
  onStopSelect,
}: {
  selection: HomeSelection;
  pack?: RoutePack;
  onExpand?: () => void;
  viewCache?: Map<string, RegionalView>;
  nearbyPosition?: { lat: number; lng: number; accuracy: number } | null;
  onStopSelect?: (stop: MobilityStop) => void;
}) {
  const lowData = useDataSaver();
  const selectedId = selection.kind === 'metro' ? selection.stationId : selection.route.id;
  const lineId = selection.kind === 'metro' ? selection.lineId : undefined;
  const subset = useMemo(() => homeMapNetwork(selection, pack), [selectedId, lineId, pack]);
  const route = subset?.routes[0];
  const cacheKey =
    selection.kind === 'metro'
      ? `metro:${route?.id}:${selection.stationId}`
      : `bus:${selectedId}:${selection.route.geometryRevision ?? pack?.verifiedAt ?? ''}:${selection.stopId ?? ''}`;
  const remember = useCallback(
    (view: RegionalView) => {
      if (!viewCache) return;
      viewCache.delete(cacheKey);
      viewCache.set(cacheKey, { ...view });
      while (viewCache.size > 12) viewCache.delete(viewCache.keys().next().value!);
    },
    [viewCache, cacheKey],
  );
  const stopId = selection.kind === 'metro' ? `metro:${selection.stationId}` : selection.stopId;
  const stop = subset?.stops.find((item) => item.id === stopId);
  const sequence = route && subset && subset.stops.length > 1 ? (
    <StopSequence
      className="home-stop-sequence-overlay"
      label={
        selection.kind === 'metro'
          ? `${route.name} · ${subset.stops[0].name} a ${subset.stops.at(-1)?.name}`
          : `${route.code} · Paradas`
      }
      stops={subset.stops.map((item) => ({ id: item.id, name: item.name }))}
      selectedId={stopId ?? ''}
      numbered={selection.kind === 'bus'}
      onSelect={(id) => {
        const chosen = subset.stops.find((item) => item.id === id);
        if (chosen) onStopSelect?.(chosen);
      }}
    />
  ) : null;
  if (!subset || !route)
    return (
      <p role="status">El mapa de este recorrido no está disponible. Puedes consultar la red.</p>
    );
  return (
    <div className="home-selected-route-map" data-home-action="map" tabIndex={-1}>
      {lowData ? (
        <>
          {sequence}
          <HomeTransportMap
            segments={route.segments.map((segment) => segment.coordinates)}
            marker={stop}
            line={selection.kind === 'metro' ? route.id : undefined}
            name={route.name}
            onNetwork={onExpand}
            currentPosition={nearbyPosition}
          />
        </>
      ) : (
        <LocationMap
          key={cacheKey}
          network={subset}
          online={navigator.onLine !== false}
          contextRoutes={subset.routes}
          field={null}
          compact
          inspectStops
          preserveViewportOnResize
          focus={selection.kind === 'metro' ? stop : nearbyPosition ?? stop}
          currentPosition={nearbyPosition}
          nearbyRadiusMeters={nearbyPosition ? 3000 : undefined}
          initialStopId={stopId}
          topOverlay={sequence}
          onStopSelect={onStopSelect}
          initialView={viewCache?.get(cacheKey)}
          onViewChange={remember}
          onExpand={onExpand}
        />
      )}
      {onExpand && (
        <button type="button" className="text-button" onClick={onExpand}>
          Ampliar en la red
        </button>
      )}
    </div>
  );
}
