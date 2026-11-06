import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const publicRoot = new URL('../public/', import.meta.url);
const html = await readFile(new URL('acceso.html', publicRoot), 'utf8');
const document = new JSDOM(html).window.document;

test('evaluation portal provides direct application entry points at the domain or a subdirectory', () => {
  const destinations = new Set();
  for (const base of ['https://regiomovil.test/', 'https://regiomovil.test/piloto/']) {
    for (const anchor of document.querySelectorAll('[data-app-link]')) {
      const href = anchor.getAttribute('href');
      assert.ok(href.startsWith('./?'), `Relative app entry: ${href}`);
      const target = new URL(href, `${base}acceso.html`);
      assert.equal(target.origin, new URL(base).origin);
      assert.equal(target.pathname, new URL(base).pathname);
      assert.ok(['home', 'plan', 'stations', 'mobility'].includes(target.searchParams.get('page')));
      assert.ok(
        [...target.searchParams.keys()].every((key) => ['page', 'network', 'report'].includes(key)),
      );
      destinations.add(target.search);
    }
  }
  for (const query of [
    '?page=home',
    '?page=plan',
    '?page=mobility',
    '?page=stations&network=routes',
    '?page=stations&network=stations',
    '?page=home&report=1',
  ])
    assert.ok(destinations.has(query), `Missing evaluation flow: ${query}`);
});

test('portal resources are local public files and relative links preserve deployment paths', async () => {
  for (const node of document.querySelectorAll('[src], link[href]')) {
    const href = node.getAttribute('src') || node.getAttribute('href');
    assert.ok(href.startsWith('./') && !href.includes('..'), `Local resource: ${href}`);
    const resource = new URL(href, publicRoot);
    assert.ok(resource.href.startsWith(publicRoot.href));
    assert.ok((await stat(resource)).isFile(), fileURLToPath(resource));
  }
  const privacy = document.querySelector('a[href="./privacidad.html"]');
  assert.ok(privacy);
  assert.ok((await stat(new URL(privacy.getAttribute('href'), publicRoot))).isFile());
  assert.equal(
    new URL('./admin', 'https://example.test/piloto/acceso.html').pathname,
    '/piloto/admin',
  );
});

test('portal remains a lightweight document without scripts, frames, trackers or credential fields', async () => {
  assert.equal(document.querySelectorAll('script, iframe, form, input, video').length, 0);
  assert.equal(document.querySelectorAll('link[rel="stylesheet"]').length, 1);
  assert.equal(document.querySelectorAll('[style], style').length, 0);
  const css = await readFile(new URL('acceso.css', publicRoot));
  assert.ok(
    Buffer.byteLength(html) + css.length < 18 * 1024,
    'Keep the portal below 18 KiB before compression.',
  );
  assert.doesNotMatch(css.toString(), /@import|url\s*\(/i);
});

test('evaluation portal identifies simulation, incomplete coverage and restricted administration', () => {
  const scope = document.querySelector('.scope').textContent;
  assert.match(scope, /simulados/);
  assert.match(scope, /cobertura no es completa/);
  assert.match(scope, /consentimiento y revisión/);
  const admin = document.querySelector('a[href="./admin"]');
  assert.ok(admin);
  const context = admin.closest('article').textContent;
  assert.match(context, /Administración privada/);
  assert.match(context, /servidor con administración habilitada/);
  assert.match(context, /cuenta autorizada y autenticación en dos pasos/);
  const android = document.querySelector(
    'a[href="https://github.com/GioMax102/RegioMovil/releases/latest"]',
  );
  assert.ok(android);
  assert.match(android.closest('article').textContent, /puede corresponder a una entrega anterior/);
});

test('the evaluation tour distinguishes choosing a transport from planning and reporting', () => {
  const tour = document.querySelector('.feature-grid');
  const entries = [...tour.querySelectorAll('a')];
  assert.equal(entries[0].getAttribute('href'), './?page=home');
  assert.match(entries[0].textContent, /Metro.*selector circular.*confirma/s);
  assert.match(tour.textContent, /autobús.*mapa.*parada/s);
  assert.match(tour.textContent, /Planear desde aquí/);
  assert.match(tour.textContent, /Reportar aquí/);
  assert.match(tour.textContent, /nada se envía al tocar/);
  assert.match(
    document.querySelector('.scope').textContent,
    /autobús.*llegadas y la afluencia no están\s+disponibles/s,
  );
  assert.doesNotMatch(tour.textContent, /¿A dónde vamos\?|pestañas Metro y Autobús/);
});

test('portal has an accessible document outline, navigation names and keyboard skip target', () => {
  assert.equal(document.documentElement.lang, 'es-MX');
  assert.ok(document.querySelector('meta[name="viewport"]'));
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelectorAll('main').length, 1);
  assert.ok(document.querySelector(document.querySelector('.skip-link').getAttribute('href')));
  for (const nav of document.querySelectorAll('nav')) assert.ok(nav.getAttribute('aria-label'));
  for (const image of document.querySelectorAll('img')) {
    assert.ok(image.hasAttribute('alt'));
    assert.ok(Number(image.getAttribute('width')) > 0 && Number(image.getAttribute('height')) > 0);
  }
  for (const anchor of document.querySelectorAll('a')) {
    assert.ok(anchor.getAttribute('aria-label') || anchor.textContent.trim());
    if (anchor.getAttribute('href')?.startsWith('#'))
      assert.ok(document.getElementById(anchor.getAttribute('href').slice(1)));
  }
});
