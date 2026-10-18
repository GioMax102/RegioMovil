import { normalizePlaceText, significantTokens, similarToken } from './place-query.mjs';
/**
 * A small, sourced set of public destinations supplements provider coverage.
 * Coordinates are map references, never a verified entrance or boarding point.
 * This is not an exhaustive directory and arbitrary text still uses the provider.
 */
export const PLACE_REFERENCES = Object.freeze([
  Object.freeze({
    id: 'reference:procuraduria-mujeres-nl',
    name: 'Procuraduría de la Defensa de los Derechos de las Mujeres',
    displayName: 'Procuraduría de la Defensa de los Derechos de las Mujeres, Washington 539 Ote., planta baja del Edificio Elizondo Garza, Centro, Monterrey, Nuevo León',
    address: 'Washington 539 Ote., planta baja · Edificio Elizondo Garza, Centro, Monterrey',
    lat: 25.67435574,
    lng: -100.31020416,
    kind: 'place',
    resultType: 'place',
    precision: 'approximate',
    aliases: ['procuraduría de la defensa de los derechos de las mujeres', 'procuraduría de defensa de los derechos de las mujeres',
      'procuraduría de la protección del derecho de la mujer', 'procuraduría de protección de los derechos de las mujeres',
      'procuraduría de la mujer', 'procuraduría de las mujeres', 'defensa derechos mujer', 'protección derechos mujer',
      'edificio elizondo garza', 'washington 539', 'washington 539 ote', 'washington 539 oriente', 'calle washington 539'],
    regions: ['monterrey', 'centro', 'nuevo leon', 'mexico', 'nl', '64000'],
    verifiedAt: '2026-10-18',
    source: { title: 'Gobierno de Nuevo León · cambio de domicilio de la Procuraduría, 22 de enero de 2026', url: 'https://www.nl.gob.mx/es/boletines/anuncia-cambio-de-domicilio-de-la-procuraduria-de-la-defensa-de-los-derechos-de-las' },
    coordinateSource: { title: 'OpenStreetMap · huella del edificio, referencia de mapa, no acceso verificado', url: 'https://www.openstreetmap.org/way/450490465', precision: 'published-centroid' },
  }),
  Object.freeze({
    id: 'osm:w665361279',
    name: 'Las Estaciones',
    displayName: 'Colonia Las Estaciones, Monterrey, Nuevo León, México',
    address: 'Las Estaciones, zona Lincoln / No Reelección, Monterrey, Nuevo León',
    lat: 25.7661587,
    lng: -100.4008005,
    kind: 'place',
    resultType: 'place',
    aliases: ['las estaciones', 'colonia las estaciones', 'col las estaciones', 'fraccionamiento las estaciones', 'fracc las estaciones'],
    regions: ['monterrey', 'nuevo leon', 'mexico', 'nl', '64102'],
    verifiedAt: '2026-10-17',
    source: { title: 'Congreso de Nuevo León · Colonia Las Estaciones, folio catastral 8813', url: 'https://hcnl.gob.mx/trabajo_legislativo/leyes/pdf/Dec.%20194%20Valores%20mONTERREY.pdf' },
    coordinateSource: { title: 'OpenStreetMap · Las Estaciones', url: 'https://www.openstreetmap.org/way/665361279', precision: 'published-centroid' },
  }),
  Object.freeze({
    id: 'osm:r21104322',
    name: 'Tec de Monterrey · Campus Monterrey',
    displayName: 'Tecnológico de Monterrey, Campus Monterrey, Eugenio Garza Sada 2501, Monterrey, Nuevo León, México',
    address: 'Eugenio Garza Sada 2501, Campus Monterrey, Monterrey, Nuevo León',
    lat: 25.6507267,
    lng: -100.289319,
    kind: 'place',
    resultType: 'place',
    aliases: ['tec de monterrey', 'tec de monterrey campus monterrey', 'tecnológico de monterrey', 'tecnológico de monterrey campus monterrey', 'campus monterrey', 'itesm campus monterrey', 'instituto tecnológico y de estudios superiores de monterrey', 'eugenio garza sada 2501', 'av eugenio garza sada 2501', 'avenida eugenio garza sada 2501'],
    regions: ['monterrey', 'nuevo leon', 'mexico', 'nl', '64700', '64849'],
    verifiedAt: '2026-10-17',
    source: { title: 'Tecnológico de Monterrey · domicilio de Campus Monterrey', url: 'https://tec.mx/es/monterrey' },
    coordinateSource: { title: 'OpenStreetMap · Tecnológico de Monterrey / Campus Monterrey', url: 'https://www.openstreetmap.org/relation/21104322', precision: 'published-centroid' },
  }),
  Object.freeze({
    id: 'osm:w682039730',
    name: 'Punto Valle',
    displayName: 'Punto Valle, Río Missouri 555, Del Valle, San Pedro Garza García, Nuevo León, 66220, México',
    address: 'Río Missouri 555, Del Valle, San Pedro Garza García, Nuevo León, 66220',
    lat: 25.6590567,
    lng: -100.3545702,
    kind: 'place',
    resultType: 'place',
    aliases: ['punto valle', 'punto valle the town center', 'puntovalle', 'plaza punto valle', 'centro comercial punto valle', 'río missouri 555', 'río missouri oriente 555', 'río missouri ote 555'],
    regions: ['san pedro garza garcia', 'san pedro', 'nuevo leon', 'monterrey', 'mexico', 'nl', '66220'],
    verifiedAt: '2026-10-16',
    source: { title: 'Punto Valle · domicilio oficial', url: 'https://puntovalle.com/concierge' },
    coordinateSource: { title: 'OpenStreetMap · Punto Valle', url: 'https://www.openstreetmap.org/way/682039730', precision: 'published-centroid' },
  }),
]);

const normalize = normalizePlaceText;
const publicPlace = ({ aliases: _aliases, regions: _regions, ...place }) => ({ precision: 'approximate', ...structuredClone(place) });

export function findPlaceReferences(query) {
  const text = normalize(query);
  // Match the complete alias before allowing an optional regional suffix.
  // Removing "Monterrey" from the input first corrupts names such as
  // "Tec de Monterrey" and can turn homonyms into an unintended destination.
  return PLACE_REFERENCES.filter(place => place.aliases.some(alias => {
    const normalizedAlias = normalize(alias);
    const region = `(?:${place.regions.join('|')})`;
    const regionalSuffix = new RegExp(`^(?:en )?${region}(?: (?:en )?${region})*$`);
    return text === normalizedAlias || (text.startsWith(`${normalizedAlias} `) && regionalSuffix.test(text.slice(normalizedAlias.length + 1)));
  })).map(publicPlace);
}

/** Partial and modest typo matching only offers choices; it never picks a destination. */
export function suggestPlaceReferences(query) {
  const exact = findPlaceReferences(query);
  if (exact.length) return exact;
  const [name, ...regionParts] = query.split(',');
  const tokens = significantTokens(name);
  if (!tokens.length || tokens.some(token => token.length < 2)) return [];
  return PLACE_REFERENCES.filter(place => {
    if (regionParts.length) {
      const regionalQuery = normalize(regionParts.join(' '));
      const region = `(?:${place.regions.join('|')})`;
      if (!new RegExp(`^(?:${region})(?: ${region})*$`).test(regionalQuery)) return false;
    }
    return place.aliases.some(alias => {
      const aliases = significantTokens(alias);
      // Every typed word must belong to this name. Extra branches, businesses,
      // different municipalities and numbers cannot be silently discarded.
      return tokens.every(token => aliases.some(candidate => similarToken(token, candidate)));
    });
  }).map(publicPlace).slice(0, 4);
}
