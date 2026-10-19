/** Small Spanish/Mexican query normalizer. Never generates geographic coordinates. */
export const normalizePlaceText = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/ +/g, ' ');

const ABBREVIATIONS = new Map(Object.entries({ av: 'avenida', ave: 'avenida', blvd: 'boulevard', boul: 'boulevard',
  gral: 'general', glez: 'gonzalez', dr: 'doctor', dra: 'doctora', ing: 'ingeniero', lic: 'licenciado',
  pdte: 'presidente', profr: 'profesor', prof: 'profesor', ote: 'oriente', pte: 'poniente', nte: 'norte', sur: 'sur',
  col: 'colonia', fracc: 'fraccionamiento', mty: 'monterrey' }));
export function normalizePlaceQuery(query) {
  return query.replace(/\b([\p{L}]+)\.?/gu, (whole, word) => ABBREVIATIONS.get(normalizePlaceText(word)) || whole)
    .replace(/\s*(?:#|n[úu]m(?:ero)?\.?|n[º°])\s*(?=\d)/giu, ' ').replace(/ +/g, ' ').trim();
}

const ARTICLE = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'al']);
export const significantTokens = text => normalizePlaceText(normalizePlaceQuery(text)).split(' ').filter(token => !ARTICLE.has(token));
export const streetTokens = text => significantTokens(text).filter(token => !['avenida', 'calle', 'boulevard', 'carretera', 'prolongacion', 'paseo'].includes(token));

// One edit, including a transposed pair, is useful for names typed on a phone.
// Restrict to long words with the same initial; never apply it to numbers.
export function similarToken(a, b) {
  if (a === b || b.startsWith(a)) return true;
  if (a.length < 5 || b.length < 5 || a[0] !== b[0] || /\d/.test(a + b) || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const differences = [...a].map((letter, i) => letter === b[i] ? -1 : i).filter(i => i >= 0);
    return differences.length === 1 || (differences.length === 2 && differences[1] === differences[0] + 1 && a[differences[0]] === b[differences[1]] && a[differences[1]] === b[differences[0]]);
  }
  const [small, large] = a.length < b.length ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < small.length && j < large.length) {
    if (small[i] === large[j]) { i++; j++; }
    else { if (skipped) return false; skipped = true; j++; }
  }
  return true;
}

const MUNICIPALITIES = ['San Nicolás de los Garza', 'San Pedro Garza García', 'General Escobedo', 'Santa Catarina', 'Salinas Victoria',
  'Ciénega de Flores', 'General Zuazua', 'Monterrey', 'Guadalupe', 'Apodaca', 'García', 'Juárez', 'Santiago', 'Pesquería', 'El Carmen'];
export function splitRegionalSuffix(query) {
  const chunks = query.split(',').map(part => part.trim()).filter(Boolean);
  const region = chunks.slice(1).join(', ');
  const city = MUNICIPALITIES.find(city => normalizePlaceText(region).includes(normalizePlaceText(city)));
  return { text: chunks[0] || query, city, region };
}

export function parseIntersection(query) {
  const { text, region, city } = splitRegionalSuffix(query);
  const cleaned = normalizePlaceQuery(text).replace(/^(?:cruce|intersecci[oó]n)\s+(?:de\s+|entre\s+)?/iu, '');
  const parts = cleaned.split(/\s+(?:esq(?:uina)?\.?\s*(?:con\s+|de\s+)?|con|[ye])\s+|\s*[&×]\s*/iu);
  if (parts.length !== 2 || parts.some(part => streetTokens(part).join('').length < 3)) return null;
  return { streets: parts.map(part => part.trim()), city, region };
}

export function parseStreetAddress(query) {
  const { text, city, region } = splitRegionalSuffix(query);
  const match = normalizePlaceQuery(text).match(/^(.+?)\s+(\d{1,6}[a-z]?(?:[-/]\d{1,5})?)$/iu);
  // "Calle 5" can be a street name, rather than house number 5 on an unnamed street.
  if (!match || !streetTokens(match[1]).length) return null;
  return { street: match[1].trim(), houseNumber: match[2], city, region };
}
