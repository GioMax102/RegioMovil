import { useLayoutEffect, type RefObject } from 'react';

/** Fits a map below its actual header/tabs, including a resized virtual keyboard viewport. */
export default function useMapWorkspaceHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const workspace = ref.current;
    if (!workspace) return;
    const viewport = window.visualViewport;
    const navigation = document.querySelector<HTMLElement>('.mobile-nav');
    let baselineHeight = viewport?.height || window.innerHeight;
    let frame = 0;
    let lastHeight = -1;
    const previousHeight = workspace.style.getPropertyValue('--map-workspace-height');
    const previousKeyboard = workspace.dataset.keyboard;

    const measure = () => {
      frame = 0;
      const height = viewport?.height || window.innerHeight;
      const top = viewport?.offsetTop || 0;
      const bottom = top + height;
      const start = Math.max(top, workspace.getBoundingClientRect().top);
      const nav = navigation?.getBoundingClientRect();
      // A fixed navigation bar can stay below the visual viewport while the keyboard is open.
      const obstruction =
        nav && nav.height > 0 && nav.top < bottom && nav.bottom > start
          ? Math.max(0, Math.min(bottom, nav.bottom) - Math.max(start, nav.top))
          : 0;
      const available = Math.max(0, bottom - start - obstruction);
      if (Math.abs(available - lastHeight) > 0.5) {
        workspace.style.setProperty('--map-workspace-height', `${available}px`);
        lastHeight = available;
      }
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        (active.matches('input:not([type="button"]):not([type="submit"]), textarea, select') ||
          !!active.isContentEditable);
      if (!editing) baselineHeight = Math.max(baselineHeight, height);
      workspace.dataset.keyboard = String(
        editing && height < Math.max(baselineHeight, window.innerHeight) - 120,
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const orientationChanged = () => {
      baselineHeight = viewport?.height || window.innerHeight;
      schedule();
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const observed = new Set<Element>([workspace]);
    if (workspace.parentElement) observed.add(workspace.parentElement);
    for (const element of document.querySelectorAll('.topbar, .mobile-nav, .network-section-tabs'))
      observed.add(element);
    for (const element of observed) observer?.observe(element);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', orientationChanged);
    window.addEventListener('scroll', schedule, { passive: true });
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    measure();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', orientationChanged);
      window.removeEventListener('scroll', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      if (previousHeight) workspace.style.setProperty('--map-workspace-height', previousHeight);
      else workspace.style.removeProperty('--map-workspace-height');
      if (previousKeyboard === undefined) delete workspace.dataset.keyboard;
      else workspace.dataset.keyboard = previousKeyboard;
    };
  }, [ref]);
}
