import type { TransitRoute } from '../types';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

/** Catalog text is immutable between loads; normalize it once, not on each keystroke. */
export function indexRouteSearch(routes: readonly TransitRoute[]): ReadonlyMap<string, string> {
  return new Map(
    routes.map((route) => [
      route.id,
      normalize(
        `${route.code} ${route.name} ${route.from ?? ''} ${route.to ?? ''} ${route.municipalities.join(' ')} ${route.via.join(' ')}`,
      ),
    ]),
  );
}

export function searchIndexedRoutes(
  routes: readonly TransitRoute[],
  index: ReadonlyMap<string, string>,
  query: string,
): TransitRoute[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return routes.filter((route) => {
    const text = index.get(route.id) ?? '';
    return terms.every((term) => text.includes(term));
  });
}
