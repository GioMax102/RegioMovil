import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Page } from './types';

export type AppRoute = { page: Page; network: 'stations' | 'routes' };
type NavigationState = AppRoute & { kiosk: boolean };
const pages = new Set(['home', 'plan', 'stations', 'mobility']);

/** Section URLs carry no trip, report, account or location data. */
export function readAppRoute(search: string, locked = false): NavigationState {
  const params = new URLSearchParams(search);
  const page = params.get('page');
  const kiosk = locked || params.get('kiosk') === '1';
  return {
    page: !kiosk && pages.has(page ?? '') ? (page as Page) : 'home',
    kiosk,
    network: params.get('network') === 'stations' ? 'stations' : 'routes',
  };
}

export function routeHref(route: AppRoute, address = window.location.href) {
  const url = new URL(address);
  url.searchParams.set('page', route.page);
  url.searchParams.delete('report');
  if (route.page === 'stations') url.searchParams.set('network', route.network);
  else url.searchParams.delete('network');
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

export function useAppNavigation(locked = false) {
  const [route, update] = useState(() => readAppRoute(window.location.search, locked));
  const current = useRef(route);
  const navigate = useCallback((change: Partial<AppRoute>) => {
    const previous = current.current;
    if (previous.kiosk) return;
    const next = { ...previous, ...change };
    if (
      next.page === previous.page &&
      next.network === previous.network &&
      next.kiosk === previous.kiosk
    )
      return;
    // Fullscreen map entries belong to NetworkExplorer, not the next section.
    const { regioNetworkMap: _map, ...state } = window.history.state ?? {};
    window.history[_map ? 'replaceState' : 'pushState'](state, '', routeHref(next));
    current.current = next;
    update(next);
  }, []);
  useEffect(() => {
    const restore = () => {
      const next = readAppRoute(window.location.search, locked);
      const previous = current.current;
      if (
        next.page === previous.page &&
        next.network === previous.network &&
        next.kiosk === previous.kiosk
      )
        return;
      current.current = next;
      update(next);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [locked]);
  function toggleKiosk(station: string) {
    if (locked) return;
    const url = new URL(window.location.href);
    if (!current.current.kiosk) {
      url.searchParams.set('kiosk', '1');
      url.searchParams.set('station', station);
    } else {
      url.searchParams.delete('kiosk');
      url.searchParams.delete('station');
    }
    url.searchParams.set('page', 'home');
    url.searchParams.delete('network');
    url.searchParams.delete('report');
    const { regioNetworkMap: _map, ...state } = window.history.state ?? {};
    window.history.replaceState(state, '', url);
    const next = readAppRoute(url.search);
    current.current = next;
    update(next);
  }
  function follow(event: MouseEvent<HTMLAnchorElement>, next: Partial<AppRoute>) {
    // Keep native open-in-new-tab, copy-link and keyboard link behavior.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(next);
  }
  return {
    ...route,
    navigate,
    follow,
    toggleKiosk,
    href: (next: Partial<AppRoute>) => routeHref({ ...route, ...next }),
  };
}
