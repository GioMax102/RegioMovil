import { useCallback, useEffect, useRef, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
type AppearancePreferences = { theme: ThemePreference; animations: boolean };
export const appearanceStorageKey = 'regiomovil:appearance:v1';
const defaults: AppearancePreferences = { theme: 'system', animations: true };

function readPreferences(): AppearancePreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(appearanceStorageKey) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const settings = value as Record<string, unknown>;
    return {
      theme:
        settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system'
          ? settings.theme
          : defaults.theme,
      animations:
        typeof settings.animations === 'boolean' ? settings.animations : defaults.animations,
    };
  } catch {
    return defaults;
  }
}

function storePreferences(preferences: AppearancePreferences) {
  try {
    localStorage.setItem(appearanceStorageKey, JSON.stringify(preferences));
  } catch {
    // The selected appearance still works when browser storage is unavailable.
  }
}

function useMediaPreference(query: string) {
  const [matches, setMatches] = useState(() => {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, [query]);
  return matches;
}

/** A locked public kiosk never reads or writes the personal appearance profile. */
export function useAppearance(enabled = true) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() =>
    enabled ? readPreferences() : defaults,
  );
  const storedPreferences = useRef(preferences);
  const systemDark = useMediaPreference('(prefers-color-scheme: dark)');
  const systemReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  const current = enabled ? preferences : defaults;
  const resolvedTheme =
    current.theme === 'system' ? (systemDark ? 'dark' : 'light') : current.theme;
  const reducedMotion = !current.animations || systemReducedMotion;

  useEffect(() => {
    if (!enabled || storedPreferences.current === preferences) return;
    storePreferences(preferences);
    storedPreferences.current = preferences;
  }, [enabled, preferences]);

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    const previousMotion = root.getAttribute('data-motion');
    const previousScheme = root.style.colorScheme;
    root.dataset.theme = resolvedTheme;
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
    root.style.colorScheme = resolvedTheme;
    return () => {
      if (previousTheme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previousTheme);
      if (previousMotion === null) root.removeAttribute('data-motion');
      else root.setAttribute('data-motion', previousMotion);
      root.style.colorScheme = previousScheme;
    };
  }, [resolvedTheme, reducedMotion]);

  const setTheme = useCallback(
    (theme: ThemePreference) => {
      if (!enabled || !['system', 'light', 'dark'].includes(theme)) return;
      setPreferences((previous) => (previous.theme === theme ? previous : { ...previous, theme }));
    },
    [enabled],
  );
  const setAnimations = useCallback(
    (animations: boolean) => {
      if (!enabled) return;
      setPreferences((previous) =>
        previous.animations === animations ? previous : { ...previous, animations },
      );
    },
    [enabled],
  );
  return { ...current, setTheme, setAnimations, resolvedTheme, reducedMotion, systemReducedMotion };
}

export type Appearance = ReturnType<typeof useAppearance>;
