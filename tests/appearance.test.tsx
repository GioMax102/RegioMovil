import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://localhost/',
});
const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event'] as const) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: dom.window[name],
  });
}
previousGlobals.set(
  'IS_REACT_ACT_ENVIRONMENT',
  Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
);
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  writable: true,
  value: true,
});

const values = new Map<string, string>();
let reads = 0;
let writes = 0;
let storageUnavailable = false;
previousGlobals.set('localStorage', Object.getOwnPropertyDescriptor(globalThis, 'localStorage'));
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem(key: string) {
      reads += 1;
      if (storageUnavailable) throw new Error('Storage unavailable');
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      writes += 1;
      if (storageUnavailable) throw new Error('Storage unavailable');
      values.set(key, value);
    },
  },
});
const media = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
dom.window.matchMedia = (query) => {
  let preference = media.get(query);
  if (!preference) {
    preference = { matches: false, listeners: new Set() };
    media.set(query, preference);
  }
  return {
    get matches() {
      return preference.matches;
    },
    media: query,
    onchange: null,
    addEventListener(_type: string, listener: () => void) {
      preference.listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void) {
      preference.listeners.delete(listener);
    },
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true;
    },
  } as MediaQueryList;
};
function changeMedia(query: string, matches: boolean) {
  const preference = media.get(query)!;
  preference.matches = matches;
  for (const listener of preference.listeners) listener();
}

const { act, cleanup, fireEvent, render, renderHook, screen } =
  await import('@testing-library/react');
const { appearanceStorageKey, useAppearance } = await import('../src/appearance');
const { AppearanceSettings } = await import('../src/components/AppearanceSettings');
const { ActionFeedback } = await import('../src/components/ActionFeedback');
beforeEach(() => {
  values.clear();
  media.clear();
  reads = 0;
  writes = 0;
  storageUnavailable = false;
  dom.window.document.documentElement.removeAttribute('data-theme');
  dom.window.document.documentElement.removeAttribute('data-motion');
  dom.window.document.documentElement.style.colorScheme = '';
});
afterEach(() => cleanup());
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('theme and animation choices persist together and restore on the next mount', () => {
  const { result, unmount } = renderHook(() => useAppearance());
  assert.equal(result.current.theme, 'system');
  assert.equal(writes, 0);
  act(() => result.current.setTheme('dark'));
  act(() => result.current.setAnimations(false));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.dataset.motion, 'reduced');
  assert.equal(document.documentElement.style.colorScheme, 'dark');
  assert.deepEqual(JSON.parse(values.get(appearanceStorageKey)!), {
    theme: 'dark',
    animations: false,
  });
  unmount();
  assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  const next = renderHook(() => useAppearance());
  assert.equal(next.result.current.theme, 'dark');
  assert.equal(next.result.current.animations, false);
});

test('system theme and reduced movement react to device preference changes without overwriting user choices', () => {
  const { result, unmount } = renderHook(() => useAppearance());
  act(() => changeMedia('(prefers-color-scheme: dark)', true));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  act(() => changeMedia('(prefers-reduced-motion: reduce)', true));
  assert.equal(document.documentElement.dataset.motion, 'reduced');
  assert.equal(result.current.animations, true);
  assert.equal(writes, 0);
  act(() => result.current.setTheme('light'));
  assert.equal(document.documentElement.dataset.theme, 'light');
  act(() => changeMedia('(prefers-color-scheme: dark)', false));
  act(() => changeMedia('(prefers-color-scheme: dark)', true));
  assert.equal(document.documentElement.dataset.theme, 'light');
  act(() => changeMedia('(prefers-reduced-motion: reduce)', false));
  assert.equal(document.documentElement.dataset.motion, 'full');
  unmount();
  assert.ok([...media.values()].every((preference) => preference.listeners.size === 0));
});

test('a locked kiosk never reads, changes or writes a personal appearance profile', () => {
  values.set(appearanceStorageKey, JSON.stringify({ theme: 'dark', animations: false }));
  const { result } = renderHook(() => useAppearance(false));
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(result.current.theme, 'system');
  act(() => result.current.setTheme('light'));
  act(() => result.current.setAnimations(false));
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(result.current.animations, true);
  assert.deepEqual(JSON.parse(values.get(appearanceStorageKey)!), {
    theme: 'dark',
    animations: false,
  });
});

test('invalid or unavailable preference storage does not prevent changing the appearance', () => {
  values.set(appearanceStorageKey, JSON.stringify({ theme: 'invalid', animations: 'no' }));
  const { result } = renderHook(() => useAppearance());
  assert.equal(result.current.theme, 'system');
  assert.equal(result.current.animations, true);
  storageUnavailable = true;
  act(() => result.current.setTheme('dark'));
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('appearance controls have explicit accessible names and successful actions announce their confirmation', () => {
  function Settings() {
    const appearance = useAppearance();
    return (
      <>
        <AppearanceSettings appearance={appearance} />
        <ActionFeedback message="Trayecto guardado. Disponible sin internet." />
      </>
    );
  }
  render(<Settings />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Tema' }), { target: { value: 'dark' } });
  assert.equal(document.documentElement.dataset.theme, 'dark');
  const animations = screen.getByRole('switch', { name: 'Animaciones' });
  fireEvent.click(animations);
  assert.equal(animations.getAttribute('aria-checked'), 'false');
  assert.equal(document.documentElement.dataset.motion, 'reduced');
  assert.match(screen.getByRole('status').textContent ?? '', /Trayecto guardado/);
});
