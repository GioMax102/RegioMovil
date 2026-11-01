import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { MouseEvent } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://regiomovil.test/',
});
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const { readAppRoute, routeHref, useAppNavigation } = await import('../src/navigation');
beforeEach(() => dom.window.history.replaceState({}, '', '/'));
afterEach(cleanup);
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('section URLs validate page/network and keep kiosk on its public screen', () => {
  for (const page of ['home', 'plan', 'stations', 'mobility'])
    assert.equal(readAppRoute(`?page=${page}`).page, page);
  for (const search of ['', '?page=admin', '?page=https://evil.test', '?page=<script>'])
    assert.deepEqual(readAppRoute(search), { page: 'home', network: 'routes', kiosk: false });
  assert.deepEqual(readAppRoute('?page=stations&network=stations'), {
    page: 'stations',
    network: 'stations',
    kiosk: false,
  });
  assert.equal(readAppRoute('?page=plan&kiosk=1&locked=1').page, 'home');
  assert.equal(readAppRoute('?page=stations&network=unknown').network, 'routes');
});

test('links preserve hosting path and kiosk configuration without encoding private app state', () => {
  for (const base of ['https://regiomovil.test/demo/', 'https://localhost/']) {
    const href = routeHref(
      { page: 'stations', network: 'stations' },
      `${base}?locked=1&station=padre-mier&report=1#main-content`,
    );
    const url = new URL(href, base);
    assert.equal(url.pathname, new URL(base).pathname);
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      locked: '1',
      station: 'padre-mier',
      page: 'stations',
      network: 'stations',
    });
    assert.equal(url.hash, '');
    assert.equal(
      routeHref({ page: 'plan', network: 'stations' }, `${base}?network=stations`),
      `${new URL(base).pathname}?page=plan`,
    );
  }
});

test('direct entry, reload, Back and Forward restore section and Metro tab', async () => {
  dom.window.history.replaceState({}, '', '/?page=stations&network=stations');
  const first = renderHook(useAppNavigation);
  assert.equal(first.result.current.page, 'stations');
  assert.equal(first.result.current.network, 'stations');
  act(() => first.result.current.navigate({ page: 'plan' }));
  assert.equal(dom.window.location.search, '?page=plan');
  act(() => first.result.current.navigate({ page: 'mobility' }));
  await act(async () => dom.window.history.back());
  await waitFor(() => assert.equal(first.result.current.page, 'plan'));
  await act(async () => dom.window.history.back());
  await waitFor(() => assert.equal(first.result.current.page, 'stations'));
  assert.equal(first.result.current.network, 'stations');
  await act(async () => dom.window.history.forward());
  await waitFor(() => assert.equal(first.result.current.page, 'plan'));
  first.unmount();
  const reload = renderHook(useAppNavigation);
  assert.equal(reload.result.current.page, 'plan');
});

test('fullscreen entries remain owned by map history; changing section drops its marker', async () => {
  dom.window.history.replaceState({ custom: 'preserved' }, '', '/?page=stations&network=routes');
  const { result } = renderHook(useAppNavigation);
  act(() => {
    dom.window.history.pushState({ custom: 'preserved', regioNetworkMap: 'map-1' }, '');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  });
  assert.equal(result.current.page, 'stations');
  assert.equal(dom.window.history.state.regioNetworkMap, 'map-1');
  act(() => result.current.navigate({ page: 'mobility' }));
  assert.deepEqual(dom.window.history.state, { custom: 'preserved' });
  await act(async () => dom.window.history.back());
  await waitFor(() => assert.equal(result.current.page, 'stations'));
  assert.equal(dom.window.history.state.regioNetworkMap, undefined);
});

test('modified clicks keep native link behavior; plain clicks update once and cleanup removes listeners', (t) => {
  const { result, unmount } = renderHook(useAppNavigation);
  const push = t.mock.method(dom.window.history, 'pushState');
  let prevented = 0;
  for (const change of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { defaultPrevented: true },
  ]) {
    act(() =>
      result.current.follow(
        {
          button: 0,
          preventDefault() {
            prevented++;
          },
          ...change,
        } as MouseEvent<HTMLAnchorElement>,
        { page: 'plan' },
      ),
    );
    assert.equal(result.current.page, 'home');
  }
  assert.equal(prevented, 0);
  act(() =>
    result.current.follow(
      {
        button: 0,
        preventDefault() {
          prevented++;
        },
      } as MouseEvent<HTMLAnchorElement>,
      { page: 'plan' },
    ),
  );
  act(() => result.current.navigate({ page: 'plan' }));
  assert.equal(prevented, 1);
  assert.equal(push.mock.callCount(), 1);
  unmount();
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
});
