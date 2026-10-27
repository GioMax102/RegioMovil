import { useLayoutEffect, useRef } from 'react';
import type { Page } from './types';

/** Changing screens has one scroll/focus policy, regardless of its entry point.
 * Lazy content and board updates must never steal focus after that change. */
export function usePageFocus(page: Page) {
  const title = useRef<HTMLHeadingElement>(null);
  const previous = useRef(page);
  useLayoutEffect(() => {
    if (previous.current === page) return;
    previous.current = page;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    title.current?.focus({ preventScroll: true });
  }, [page]);
  return title;
}
