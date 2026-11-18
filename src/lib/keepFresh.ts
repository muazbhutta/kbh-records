import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';

/**
 * Bringing the app back to the front brings the books with it.
 *
 * Nothing in here refreshed on its own. A write refreshes everything
 * the person who made it can see, and React Query is meant to refetch
 * when the window is focused again - but an app added to an iPhone's
 * home screen is frozen rather than blurred when it is switched away
 * from, and comes back without the event that would have refetched.
 *
 * So the office refuses an entry on one phone and the man looking at
 * his own screen on another sees nothing until he closes the app
 * altogether and opens it again, which is what was being reported, and
 * on every screen at once because none of them had any other way.
 *
 * This asks for everything again whenever the app is looked at after
 * being away. Not on every flicker: a few seconds of switching to the
 * camera and back is not worth a round of requests on a site
 * connection, and anything newer than that is new enough.
 */

/** Below this, coming back is a glance rather than a return. */
const WORTH_IT_MS = 10_000;

export function useKeepFresh() {
  const qc = useQueryClient();
  const last = useRef(Date.now());

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const freshen = () => {
      const now = Date.now();
      if (now - last.current < WORTH_IT_MS) return;
      last.current = now;
      refreshTheBooks(qc);
    };

    const whenShown = () => {
      if (document.visibilityState === 'visible') freshen();
    };

    document.addEventListener('visibilitychange', whenShown);
    // Safari hands a page back from its cache without a visibility
    // change at all, which is exactly the iPhone case.
    window.addEventListener('pageshow', freshen);
    window.addEventListener('focus', freshen);
    window.addEventListener('online', freshen);

    return () => {
      document.removeEventListener('visibilitychange', whenShown);
      window.removeEventListener('pageshow', freshen);
      window.removeEventListener('focus', freshen);
      window.removeEventListener('online', freshen);
    };
  }, [qc]);
}

/**
 * The same, for a screen that wants it now.
 *
 * Nothing calls this yet. It was written for a pull-to-refresh on every
 * screen, which does not work in this app on the web: react-native-web
 * ships RefreshControl as a stub that drops onRefresh and renders an
 * empty View, and a gesture written out by hand in its place did not
 * take either. It is left here because asking for everything again is
 * a one-line thing a button will want one day, and because the next
 * person to reach for RefreshControl should find out from this comment
 * rather than from a pull that silently does nothing.
 */
export function useRefreshNow() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries();
  };
}
