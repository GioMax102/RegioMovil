import { useCallback, useEffect, useState } from 'react';
import rawNetwork from '../../data/network.json';
import { isRegionalCoordinate } from '../mobility/mapGeography';

export interface FavoriteStation {
  /** Metro uses its existing canonical ID; bus stops keep their graph ID. */
  id: string;
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  kind: 'metro' | 'bus';
}

const favoritesKey = 'regiomovil:favorites';
const stopsKey = 'regiomovil:favoriteStops';
const changedEvent = 'regiomovil:station-favorites-changed';
const maximumFavorites = 200;
const metroById = new Map<string, FavoriteStation>(
  rawNetwork.stations.map((station) => [
    station.id,
    { ...station, stopId: `metro:${station.id}`, kind: 'metro' },
  ]),
);

function validText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function normalizeStation(value: unknown): FavoriteStation | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<FavoriteStation>;
  if (entry.kind === 'metro') return metroById.get(entry.id ?? '') ?? null;
  if (
    entry.kind !== 'bus' ||
    !validText(entry.id, 200) ||
    !validText(entry.stopId, 200) ||
    entry.id !== entry.stopId ||
    metroById.has(entry.id) ||
    !validText(entry.name, 220) ||
    !isRegionalCoordinate([entry.lng!, entry.lat!])
  )
    return null;
  return {
    id: entry.id,
    stopId: entry.stopId,
    name: entry.name.trim(),
    lat: entry.lat!,
    lng: entry.lng!,
    kind: 'bus',
  };
}

/** Only an explicit bookmark writes public station data, never a device position. */
export function readStationFavorites(): FavoriteStation[] {
  try {
    const storedIds = localStorage.getItem(favoritesKey);
    const ids: unknown = storedIds ? JSON.parse(storedIds) : [];
    let stops: unknown = [];
    try {
      const storedStops = localStorage.getItem(stopsKey);
      stops = storedStops ? JSON.parse(storedStops) : [];
    } catch {
      // A corrupt optional bus catalogue must not hide existing Metro favorites.
    }
    const busById = new Map(
      (Array.isArray(stops) ? stops : [])
        .slice(0, maximumFavorites)
        .map(normalizeStation)
        .filter((entry): entry is FavoriteStation => entry !== null)
        .map((entry) => [entry.id, entry]),
    );
    return (Array.isArray(ids) ? [...new Set(ids)] : [])
      .slice(0, maximumFavorites)
      .flatMap((id) => {
        if (typeof id !== 'string') return [];
        const station = metroById.get(id) ?? busById.get(id);
        return station ? [station] : [];
      });
  } catch {
    return [];
  }
}

export function toggleStationFavorite(station: FavoriteStation | string) {
  const entries = readStationFavorites();
  const target =
    typeof station === 'string'
      ? (metroById.get(station) ?? entries.find((entry) => entry.id === station))
      : normalizeStation(station);
  if (!target) return null;
  const saved = !entries.some((entry) => entry.id === target.id);
  if (saved && entries.length >= maximumFavorites) return { saved: false, persisted: false };
  const next = saved ? [...entries, target] : entries.filter((entry) => entry.id !== target.id);
  let previousStops: string | null = null;
  try {
    previousStops = localStorage.getItem(stopsKey);
    // Metadata first: a bus ID is never exposed without its validated public stop.
    localStorage.setItem(stopsKey, JSON.stringify(next.filter((entry) => entry.kind === 'bus')));
    localStorage.setItem(favoritesKey, JSON.stringify(next.map((entry) => entry.id)));
    window.dispatchEvent(new Event(changedEvent));
    return { saved, persisted: true };
  } catch {
    try {
      if (previousStops === null) localStorage.removeItem(stopsKey);
      else localStorage.setItem(stopsKey, previousStops);
    } catch {
      // Restricted storage still leaves every action and the trip available.
    }
    return { saved: !saved, persisted: false };
  }
}

/** Same-tab and cross-tab views share the established favorites storage. */
export function useStationFavorites(disabled = false) {
  const [entries, setEntries] = useState<FavoriteStation[]>(() =>
    disabled ? [] : readStationFavorites(),
  );
  useEffect(() => {
    const refresh = () => setEntries(disabled ? [] : readStationFavorites());
    refresh();
    if (disabled) return;
    const stored = (event: StorageEvent) => {
      if (event.key === favoritesKey || event.key === stopsKey || event.key === null) refresh();
    };
    window.addEventListener(changedEvent, refresh);
    window.addEventListener('storage', stored);
    return () => {
      window.removeEventListener(changedEvent, refresh);
      window.removeEventListener('storage', stored);
    };
  }, [disabled]);
  const toggleFavorite = useCallback(
    (station: FavoriteStation | string) => (disabled ? null : toggleStationFavorite(station)),
    [disabled],
  );
  const visibleEntries = disabled ? [] : entries;
  return {
    entries: visibleEntries,
    favorites: visibleEntries.map((entry) => entry.id),
    toggleFavorite,
  };
}
