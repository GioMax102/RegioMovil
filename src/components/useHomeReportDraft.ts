import { useEffect, useState } from 'react';

/** Reads the existing private draft only after the optional Home details have loaded. */
export function useHomeReportDraft(reportOpen: boolean, enabled = true) {
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.hidden) return;
      void import('../reportDraft')
        .then(({ readReportDraft }) => readReportDraft())
        .then((draft) => {
          if (!active) return;
          clearTimeout(expiry);
          const remaining = draft ? draft.expiresAt - Date.now() : 0;
          setHasDraft(remaining > 0);
          if (remaining > 0) expiry = setTimeout(() => setHasDraft(false), remaining);
        })
        .catch(() => {
          if (active) setHasDraft(false);
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearTimeout(expiry);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reportOpen, enabled]);
  return hasDraft;
}
