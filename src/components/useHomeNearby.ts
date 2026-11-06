import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import rawNetwork from '../../data/network.json';
import type { Station } from '../types';
import { LOCATION_POLICY } from '../mobility/locationPolicy';
import {
  checkLocationPermission,
  forgetLocation,
  getRememberedLocation,
  isFreshLocation,
  readLocation,
  type PositionFix,
} from '../mobility/location';
import { loadHomeNearby, rankHomeNearby, type NearbyIndex } from './homeNearby';
import type { HomeCandidate, HomeSelection } from './homeTypes';

export const HOME_NEARBY_PREFERENCE_KEY = 'regiomovil:home-nearby-enabled';
export const HOME_NEARBY_RADIUS = LOCATION_POLICY.radius;
export const HOME_NEARBY_EXPANDED_RADIUS = LOCATION_POLICY.expandedRadius;
export const HOME_NEARBY_LIMIT = LOCATION_POLICY.limit;
const stations = rawNetwork.stations as Station[];

function preference(): boolean {
  try {
    return localStorage.getItem(HOME_NEARBY_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}
function storePreference(value: boolean): void {
  try {
    localStorage.setItem(HOME_NEARBY_PREFERENCE_KEY, String(value));
  } catch {
    /* Memory-only still works. */
  }
}
function selectionKey(selection: HomeSelection): string {
  return selection.kind === 'metro'
    ? `metro:${selection.stationId}:${selection.lineId || ''}:${selection.source}`
    : `bus:${selection.route.id}:${selection.route.geometryRevision || ''}:${selection.stopId || ''}:${selection.source}`;
}

export interface HomeNearbyOptions {
  selection: HomeSelection;
  onSelect(selection: HomeSelection): void;
  suspendAutomatic?: boolean;
}

/** Optional foreground ordering. The initial Metro selection never depends on this hook. */
export function useHomeNearby({
  selection,
  onSelect,
  suspendAutomatic = false,
}: HomeNearbyOptions) {
  const [enabled, setEnabled] = useState(preference);
  const [candidates, setCandidates] = useState<HomeCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [radius, setRadius] = useState<number>(HOME_NEARBY_RADIUS);
  const latest = useRef({ selection, onSelect, suspendAutomatic, enabled });
  latest.current = { selection, onSelect, suspendAutomatic, enabled };
  const mounted = useRef(false);
  const nativeActive = useRef(true);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const sample = useRef<PositionFix | null>(null);
  const index = useRef<NearbyIndex | null>(null);
  const radiusRef = useRef<number>(HOME_NEARBY_RADIUS);
  const interacted = useRef(selection.source === 'manual');
  const entryAttempted = useRef(false);
  const previousSelection = useRef(selectionKey(selection));
  const visible = useCallback(
    () => nativeActive.current && (typeof document === 'undefined' || !document.hidden),
    [],
  );

  const invalidate = useCallback((manual: boolean) => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    if (manual) interacted.current = true;
    if (mounted.current) {
      setBusy(false);
      setMessage((value) => (value === 'Buscando opciones cercanas…' ? '' : value));
    }
  }, []);
  const cancelPending = useCallback(() => invalidate(true), [invalidate]);

  const run = useCallback(
    async (automatic: boolean, targetRadius: number, expand = false) => {
      if (!mounted.current || !visible()) return;
      if (automatic) {
        if (!latest.current.enabled || latest.current.suspendAutomatic || entryAttempted.current)
          return;
      }
      entryAttempted.current = true;
      invalidate(false);
      const token = generation.current;
      const initialSelection = selectionKey(latest.current.selection);
      const controller = new AbortController();
      request.current = controller;
      const current = () =>
        mounted.current &&
        token === generation.current &&
        visible() &&
        selectionKey(latest.current.selection) === initialSelection;
      setBusy(true);
      setMessage('Buscando opciones cercanas…');
      try {
        let position: PositionFix | null = null;
        let permissionAllowsAutomatic = true;
        if (expand) {
          position = sample.current;
          if (!isFreshLocation(position))
            throw new Error('Actualiza Cerca de mí antes de ampliar el radio.');
        } else if (automatic) {
          const permission = await checkLocationPermission();
          if (!current()) return;
          if (permission === 'denied') {
            forgetLocation();
            throw new Error(
              'El acceso a ubicación está desactivado. Conservamos tu selección; puedes elegir manualmente.',
            );
          }
          position = getRememberedLocation();
          if (Capacitor.isNativePlatform()) {
            if (permission !== 'granted')
              throw new Error('Pulsa Cerca de mí para revisar el acceso a ubicación.');
            if (!position)
              position = await readLocation({
                requestPermission: false,
                signal: controller.signal,
              });
          } else {
            // Browser permission checks cannot guarantee a subsequent read is prompt-free.
            if (!position)
              throw new Error('Pulsa Actualizar cercanos para obtener una ubicación nueva.');
            permissionAllowsAutomatic = permission === 'granted';
          }
        } else {
          position = await readLocation({ requestPermission: true, signal: controller.signal });
        }
        if (!current()) return;
        if (!isFreshLocation(position))
          throw new Error(
            'La ubicación es antigua o demasiado imprecisa. Actualiza Cerca de mí o elige manualmente.',
          );
        const nearbyIndex = index.current || (await loadHomeNearby(controller.signal));
        if (!current()) return;
        if (!isFreshLocation(position))
          throw new Error(
            'La ubicación caducó mientras cargaban las opciones. Pulsa Actualizar cercanos.',
          );
        index.current = nearbyIndex;
        sample.current = position;
        radiusRef.current = targetRadius;
        setRadius(targetRadius);
        const result = rankHomeNearby(nearbyIndex, position, stations, {
          radius: targetRadius,
          limit: HOME_NEARBY_LIMIT,
        });
        setCandidates(result);
        setMessage(
          result.length
            ? position.accuracy > LOCATION_POLICY.automaticAccuracy ||
              result.some((candidate) => candidate.approximate)
              ? 'Opciones aproximadas: confirma el transporte que prefieras. La distancia es en línea recta.'
              : 'Opciones cercanas por distancia en línea recta; no representan vehículos en vivo.'
            : `No encontramos opciones a ${targetRadius === HOME_NEARBY_RADIUS ? '1.2' : '3'} km. Conservamos tu selección.`,
        );
        if (
          !expand &&
          permissionAllowsAutomatic &&
          position.accuracy <= LOCATION_POLICY.automaticAccuracy &&
          !interacted.current &&
          !latest.current.suspendAutomatic &&
          latest.current.selection.source === 'base'
        ) {
          const nearestMetro = rankHomeNearby(
            { ...nearbyIndex, routes: [], points: [] },
            position,
            stations,
            { radius: targetRadius, limit: 1 },
          )[0];
          if (
            nearestMetro?.selection.kind === 'metro' &&
            !nearestMetro.approximate &&
            typeof nearestMetro.distanceMeters === 'number' &&
            nearestMetro.distanceMeters + position.accuracy <= targetRadius
          ) {
            latest.current.onSelect(nearestMetro.selection);
          }
        }
      } catch (error) {
        if (!current() || controller.signal.aborted) return;
        setCandidates([]);
        sample.current = null;
        setMessage(
          error instanceof Error
            ? error.message
            : 'No pudimos ordenar las opciones cercanas. Puedes elegir manualmente.',
        );
      } finally {
        if (current()) {
          request.current = null;
          setBusy(false);
        }
      }
    },
    [invalidate, visible],
  );

  const findNearby = useCallback(async () => {
    storePreference(true);
    setEnabled(true);
    await run(false, radiusRef.current);
  }, [run]);
  const expandRadius = useCallback(async () => {
    if (radiusRef.current !== HOME_NEARBY_RADIUS) return;
    if (!isFreshLocation(sample.current)) {
      setMessage('Actualiza Cerca de mí antes de ampliar el radio.');
      return;
    }
    await run(false, HOME_NEARBY_EXPANDED_RADIUS, true);
  }, [run]);
  const disable = useCallback(() => {
    invalidate(true);
    storePreference(false);
    setEnabled(false);
    sample.current = null;
    forgetLocation();
    setCandidates([]);
    setMessage('Cercanía desactivada. Puedes seguir eligiendo transporte manualmente.');
    radiusRef.current = HOME_NEARBY_RADIUS;
    setRadius(HOME_NEARBY_RADIUS);
  }, [invalidate]);

  useEffect(() => {
    mounted.current = true;
    const updateVisibility = () => {
      if (!visible()) {
        entryAttempted.current = false;
        invalidate(false);
      } else void run(true, radiusRef.current);
    };
    const leavePage = () => {
      entryAttempted.current = false;
      invalidate(false);
    };
    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('pagehide', leavePage);
    window.addEventListener('pageshow', updateVisibility);
    let disposed = false;
    let removeNative: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/app')
        .then(({ App }) =>
          App.addListener('appStateChange', (state) => {
            nativeActive.current = state.isActive;
            updateVisibility();
          }),
        )
        .then((handle) => {
          if (disposed) void handle.remove();
          else removeNative = () => handle.remove();
        })
        .catch(() => {
          /* Native plugin itself also stops GPS on pause. */
        });
    }
    return () => {
      disposed = true;
      mounted.current = false;
      entryAttempted.current = false;
      invalidate(false);
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('pagehide', leavePage);
      window.removeEventListener('pageshow', updateVisibility);
      void removeNative?.();
    };
  }, [invalidate, run, visible]);
  useEffect(() => {
    const key = selectionKey(selection);
    if (key !== previousSelection.current) {
      previousSelection.current = key;
      invalidate(selection.source !== 'nearby');
    }
  }, [selection, invalidate]);
  useEffect(() => {
    if (suspendAutomatic) invalidate(false);
    else if (enabled) void run(true, radiusRef.current);
  }, [enabled, suspendAutomatic, invalidate, run]);

  return {
    candidates,
    busy,
    message,
    enabled,
    radius,
    canExpand: !busy && radius === HOME_NEARBY_RADIUS && isFreshLocation(sample.current),
    findNearby,
    disable,
    expandRadius,
    cancelPending,
  };
}
