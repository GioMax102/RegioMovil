import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { stationPhotos } from '../src/data/stationPhotos';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: StationStreetView, stationStreetViewUrl } =
  await import('../src/components/StationStreetView');
styles.deregister();

const station = { id: 'talleres', name: 'Talleres', lat: 25.759167, lng: -100.368333 };

test('Street View links require valid regional numeric coordinates and never request an API key', () => {
  const url = new URL(stationStreetViewUrl(station.lat, station.lng)!);
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('map_action'), 'pano');
  assert.equal(url.searchParams.get('viewpoint'), '25.759167,-100.368333');
  assert.equal(url.searchParams.has('key'), false);
  for (const [lat, lng] of [
    [NaN, -100.3],
    [25.7, Infinity],
    [0, 0],
    [25.7, -101],
    [90, 180],
  ]) {
    assert.equal(stationStreetViewUrl(lat, lng), null);
  }
  assert.equal(stationStreetViewUrl('25.7' as unknown as number, -100.3), null);
});

test('unknown stations and bus stops get an honest fallback, never another station photo', () => {
  for (const props of [
    { station: { ...station, id: 'padre-mier', name: 'Padre Mier' } },
    { station, kind: 'bus' as const },
  ]) {
    const dom = new JSDOM(renderToStaticMarkup(<StationStreetView {...props} />));
    try {
      const doc = dom.window.document;
      assert.equal(doc.querySelector('img,iframe'), null);
      assert.match(doc.body.textContent!, /no tenemos una fotografía verificada/);
      assert.match(doc.body.textContent!, /no es una vista en vivo/);
      const link = doc.querySelector('.station-street-action a')!;
      assert.equal(link.getAttribute('target'), '_blank');
      assert.equal(link.getAttribute('referrerPolicy'), 'no-referrer');
      assert.match(link.getAttribute('rel')!, /noopener/);
      assert.match(link.getAttribute('aria-label')!, /servicio externo/);
    } finally {
      dom.window.close();
    }
  }
});

test('Talleres uses a local lazy historical photo with verifiable source and licence', async () => {
  const dom = new JSDOM(renderToStaticMarkup(<StationStreetView station={station} />));
  try {
    const doc = dom.window.document;
    const image = doc.querySelector('img')!;
    assert.ok(image.getAttribute('src')!.startsWith('/assets/station-photos/'));
    assert.equal(image.getAttribute('loading'), 'lazy');
    assert.match(doc.querySelector('figcaption')!.textContent!, /Fotografía histórica · 2007/);
    assert.match(doc.querySelector('figcaption')!.textContent!, /Omaaar · Dominio público/);
    const licences = JSON.parse(await readFile('public/licenses/station-photos.json', 'utf8'));
    const licence = licences.photos.find(
      (item: { stationKey: string }) => item.stationKey === 'metro:talleres',
    );
    assert.equal(licence.file, stationPhotos['metro:talleres'].src);
    const bytes = await readFile(`public${licence.file}`);
    assert.ok(
      bytes.length < 80 * 1024,
      'station photographs must remain small enough for modest devices',
    );
    assert.equal(createHash('sha256').update(bytes).digest('hex'), licence.localSha256);
    assert.equal(doc.querySelector('figcaption a')!.getAttribute('href'), licence.sourceUrl);
  } finally {
    dom.window.close();
  }
});

test('invalid station coordinates never generate an external street-view link', () => {
  const dom = new JSDOM(
    renderToStaticMarkup(<StationStreetView station={{ ...station, id: 'unknown', lat: NaN }} />),
  );
  try {
    assert.equal(dom.window.document.querySelector('.station-street-action a'), null);
    assert.match(dom.window.document.body.textContent!, /ubicación válida dentro de la ZMM/);
  } finally {
    dom.window.close();
  }
});
