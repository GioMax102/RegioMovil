import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaceQuery, parseIntersection, parseStreetAddress } from '../server/place-query.mjs';
import { suggestPlaceReferences } from '../server/place-references.mjs';
import { findStreetJunctions, createJunctionLookup } from '../server/street-junctions.mjs';

test('street addresses accept Mexican abbreviations and number markers without altering house numbers or street dates', () => {
  assert.equal(normalizePlaceQuery('Av. Dr. José Glez. #421'), 'avenida doctor José gonzalez 421');
  assert.deepEqual(parseStreetAddress('Calle 5 de Mayo número 123, Monterrey, Nuevo León'), { street: 'Calle 5 de Mayo', houseNumber: '123', city: 'Monterrey', region: 'Monterrey, Nuevo León' });
  assert.equal(parseStreetAddress('Calle 5'), null);
  assert.equal(parseStreetAddress('5 de Mayo'), null);
  assert.equal(parseStreetAddress('Río Missouri 555, San Pedro Garza García').houseNumber, '555');
});

test('intersection syntax supports y, con, esquina and ampersand while keeping each street separate', () => {
  for (const query of ['Av. Lincoln y Rangel Frías', 'Lincoln con Rangel Frías', 'Lincoln esquina con Rangel Frías', 'Lincoln esq. Rangel Frías', 'Lincoln & Rangel Frías', 'cruce de Lincoln y Rangel Frías']) {
    const parsed = parseIntersection(query);
    assert.equal(parsed.streets.length, 2, query);
    assert.match(parsed.streets[1], /Rangel Frías/);
  }
  assert.equal(parseIntersection('Avenida Universidad'), null);
  assert.equal(parseIntersection('Lincoln y'), null);
});

test('institution aliases ignore accents, articles and modest spelling errors but preserve incompatible branch and address words', () => {
  for (const query of ['procuraduria de la proteccion del derecho de la mujer', 'procuraduria derechos mujer', 'procuradruia derechos mujer', 'Defensa derechos mujeres', 'edificio Elizondo Garza', 'Washington 539, Centro, Monterrey']) {
    const place = suggestPlaceReferences(query)[0];
    assert.equal(place?.id, 'reference:procuraduria-mujeres-nl', query);
    assert.match(place.address, /Washington 539/);
    assert.equal(place.verifiedAt, '2026-10-18');
    assert.match(place.source.url, /^https:\/\/www\.nl\.gob\.mx\//);
    assert.equal(place.precision, 'approximate');
  }
  for (const query of ['procuraduria derechos mujer, San Pedro', 'procuraduria derechos mujer sucursal Guadalupe', 'Washington 540', 'Tec de Monterrey campus Santa Fe', 'Las Estaciones 2 sector', 'Punto Valle restaurante']) assert.deepEqual(suggestPlaceReferences(query), [], query);
  assert.match(suggestPlaceReferences('tecnológi')[0].name, /Campus Monterrey/);
});

test('published street index resolves actual ZMM intersections, including abbreviated and mildly misspelled street names', async () => {
  for (const query of ['Washington y Zaragoza', 'Av. Lincoln y Rangel Frias', 'avenida Linclon con Rangel Frias', 'Av. Universidad esquina Fidel Velazquez']) {
    const places = await findStreetJunctions(query);
    assert.ok(places.length > 0, query);
    assert.equal(places[0].resultType, 'intersection');
    assert.equal(places[0].precision, 'exact');
    assert.ok(places[0].lat > 25.35 && places[0].lat < 26.1);
    assert.match(places[0].source.url, /^https:\/\/www\.openstreetmap\.org\/way\//);
  }
  assert.deepEqual(await findStreetJunctions('Calle Inexistente 987 y Calle Imaginaria 654'), []);
  // A geometric crossing helps choose a point but never claims a connected node.
  const references = await findStreetJunctions('Garza Sada y Luis Elizondo');
  assert.ok(references.length > 0);
  assert.equal(references[0].precision, 'approximate');
  assert.match(references[0].address, /Cruce de referencia.*verifica los accesos/);
  assert.equal(references[0].coordinateSource.precision, 'projected-crossing');
});

test('junction lookup uses a common source vertex, never the midpoint of two roads, and preserves distinct intersections', () => {
  const lookup = createJunctionLookup({ version: 1, retrieved: '2026-10-18', streets: [['Calle Uno', []], ['Calle Dos', []], ['Calle Tres', []]],
    junctions: [[25.67, -100.31, [0, 1], [111, 222], '333'], [25.68, -100.32, [1, 2], [222, 444], '555']] });
  assert.deepEqual(lookup('Uno y Tres'), []);
  const one = lookup('Uno y Dos')[0];
  assert.equal(one.lat, 25.67);
  assert.equal(one.lng, -100.31);
  assert.equal(one.source.url, 'https://www.openstreetmap.org/node/333');
  assert.equal(lookup('Dos y Tres')[0].id, 'intersection:555');
});
