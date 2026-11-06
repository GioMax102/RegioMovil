import { useEffect, useMemo, useState } from 'react';
import { BusFront, Check, LocateFixed, Search, TrainFront } from 'lucide-react';
import { loadTransitCatalog, network } from '../api';
import { networkLabel } from '../mobility/networks';
import type { TransitCatalogData } from '../types';
import { Dialog } from './Primitives';
import type { HomeCandidate, HomeSelection } from './homeTypes';
import { homeSelectionKey, homeSelectionName } from './HomeTransportSelector';
import { indexRouteSearch, searchIndexedRoutes } from './routeSearch';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export default function HomeTransportPicker({
  selection,
  candidates = [],
  onConfirm,
  onClose,
  onNearby,
  nearbyBusy = false,
  nearbyMessage = '',
}: {
  selection: HomeSelection;
  candidates?: HomeCandidate[];
  onConfirm: (selection: HomeSelection) => void;
  onClose: () => void;
  onNearby: () => void;
  nearbyBusy?: boolean;
  nearbyMessage?: string;
}) {
  const [draft, setDraft] = useState(selection);
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState('all');
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(32);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(false);
    loadTransitCatalog(controller.signal).then(
      ({ data }) => {
        if (active) setCatalog(data);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  const buses = useMemo(
    () =>
      catalog?.routes.filter(
        (route) => route.mode === 'bus' && ['published', 'operational'].includes(route.status),
      ) ?? [],
    [catalog],
  );
  const searchIndex = useMemo(() => indexRouteSearch(buses), [buses]);
  const choices = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const stations: HomeSelection[] =
      system === 'all' || system === 'metrorrey'
        ? network.stations
            .filter((station) =>
              terms.every((term) =>
                normalize(
                  `${station.name} ${station.aliases?.join(' ') || ''} ${station.municipality}`,
                ).includes(term),
              ),
            )
            .map((station) => ({ kind: 'metro', stationId: station.id, source: 'manual' }))
        : [];
    const routes = (terms.length ? searchIndexedRoutes(buses, searchIndex, query) : buses).filter(
      (route) => system === 'all' || route.networkId === system,
    );
    return [
      ...stations,
      ...routes.map((route): HomeSelection => ({ kind: 'bus', route, source: 'manual' })),
    ];
  }, [query, system, buses, searchIndex]);
  const key = homeSelectionKey(draft);
  const candidateKey = homeSelectionKey(selection);
  const systems = [...new Set(buses.map((route) => route.networkId))];
  const choiceButton = (choice: HomeSelection, distance?: number, approximate?: boolean) => {
    const active = homeSelectionKey(choice) === key;
    const Icon = choice.kind === 'metro' ? TrainFront : BusFront;
    const station =
      choice.kind === 'metro'
        ? network.stations.find((item) => item.id === choice.stationId)
        : null;
    return (
      <button
        type="button"
        key={homeSelectionKey(choice)}
        role="radio"
        aria-checked={active}
        className="home-picker-choice"
        onClick={() => setDraft(choice)}
      >
        <Icon size={21} aria-hidden="true" />
        <span>
          <strong>{homeSelectionName(choice)}</strong>
          <small>
            {choice.kind === 'metro'
              ? `Metro · ${station?.municipality || ''}`
              : networkLabel(choice.route.networkId)}
            {typeof distance === 'number'
              ? ` · ${Math.round(distance)} m${approximate ? ' aprox.' : ''} en línea recta`
              : ''}
          </small>
          {choice.kind === 'bus' && !choice.route.geometryPack && <small>Trazo pendiente</small>}
        </span>
        {active && <Check size={20} aria-hidden="true" />}
      </button>
    );
  };
  return (
    <Dialog title="Elige tu transporte" onClose={onClose}>
      <div className="home-transport-picker">
        <p>Consulta una estación o una ruta. Tu selección cambia al confirmar.</p>
        <label className="home-picker-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            autoFocus
            aria-label="Buscar estación o ruta"
            placeholder="Estación, número, ruta o municipio"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(32);
            }}
          />
        </label>
        <div className="home-picker-filter-row">
          <label>
            Sistema de transporte
            <select
              value={system}
              onChange={(event) => {
                setSystem(event.target.value);
                setLimit(32);
              }}
            >
              <option value="all">Todos los sistemas</option>
              <option value="metrorrey">Metro</option>
              {systems.map((id) => (
                <option key={id} value={id}>
                  {networkLabel(id)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="home-picker-nearby"
            onClick={onNearby}
            disabled={nearbyBusy}
          >
            <LocateFixed size={18} aria-hidden="true" />
            Cerca de mí
          </button>
        </div>
        {nearbyBusy && <p role="status">Buscando opciones cercanas…</p>}
        {nearbyMessage && (
          <p className="home-picker-location-note" role="status">
            {nearbyMessage}
          </p>
        )}
        {!query.trim() && system === 'all' && candidates.length > 0 && (
          <div
            className="home-picker-nearby-options"
            role="radiogroup"
            aria-label="Opciones cercanas"
          >
            <h3>Cerca de ti</h3>
            {candidates
              .slice(0, 8)
              .map((candidate) =>
                choiceButton(candidate.selection, candidate.distanceMeters, candidate.approximate),
              )}
          </div>
        )}
        <div
          className="home-picker-options"
          role="radiogroup"
          aria-label="Estaciones y rutas publicadas"
        >
          {!query.trim() &&
            system === 'all' &&
            !choices.some((choice) => homeSelectionKey(choice) === candidateKey) &&
            choiceButton(selection)}
          {choices.slice(0, limit).map((choice) => choiceButton(choice))}
        </div>
        {choices.length > limit && (
          <button
            type="button"
            className="home-picker-more"
            onClick={() => setLimit((value) => value + 32)}
          >
            Ver más opciones ({choices.length - limit})
          </button>
        )}
        {!choices.length && (
          <p role="status">
            No encontramos esa estación o ruta. Prueba otro nombre, número o sistema.
          </p>
        )}
        {!catalog && !error && (
          <p role="status">
            Abriendo el catálogo de autobuses… Las estaciones ya están disponibles.
          </p>
        )}
        {error && (
          <div className="home-picker-error" role="alert">
            <p>No pudimos abrir los autobuses. Puedes elegir Metro o reintentar.</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Reintentar rutas
            </button>
          </div>
        )}
        <div className="home-picker-confirmation">
          <p>
            Seleccionado: <strong>{homeSelectionName(draft)}</strong>
          </p>
          <div>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onConfirm({ ...draft, source: 'manual' })}
            >
              Confirmar selección
              <Check size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
