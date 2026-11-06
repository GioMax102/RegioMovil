import { useEffect, useRef } from 'react';
import type { HomeUiState } from './homeTypes';

/** Restore after deferred map/actions mount, without keeping hidden maps alive. */
export function useHomeUiReturn(uiState?: HomeUiState) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!uiState?.returnTo) return;
    const restore = () => {
      const target = container.current?.querySelector<HTMLElement>(
        `[data-home-action="${uiState.returnTo}"]`,
      );
      if (!target) return false;
      target.focus({ preventScroll: true });
      window.scrollTo({ top: uiState.scrollTop ?? 0, left: 0, behavior: 'auto' });
      uiState.returnTo = undefined;
      return true;
    };
    if (restore() || !container.current) return;
    const observer = new MutationObserver(() => {
      if (restore()) observer.disconnect();
    });
    observer.observe(container.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [uiState]);
  return container;
}
