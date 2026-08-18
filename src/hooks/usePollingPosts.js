import { useEffect, useRef, useCallback } from "react";

export default function usePollingPosts(fetchFn, interval = 10000, enabled = true) {
  const intervalRef = useRef(null);
  const isFetchingRef = useRef(false);
  const isPausedRef = useRef(false);
  const fetchFnRef = useRef(fetchFn);

  // Keep the latest fetchFn in a ref so the interval closure always gets the latest version.
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  // Stable tick function that uses the ref'd fetchFn and prevents overlapping.
  const tick = useCallback(async () => {
    if (isFetchingRef.current || isPausedRef.current || !navigator.onLine) {
      return;
    }
    isFetchingRef.current = true;
    try {
      await fetchFnRef.current();
    } catch {
      // Silently swallow errors — the component handles its own error/loading state.
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Immediate fetch + polling setup/teardown
  useEffect(() => {
    if (!enabled) {
      // Clear any running interval when disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 1. Immediate fetch on mount (or when enabled becomes true)
    tick();

    // 2. Start polling interval
    intervalRef.current = setInterval(tick, interval);

    // 3. Cleanup interval on unmount or when deps change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval]);

  // Page Visibility API — pause/resume polling
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPausedRef.current = true;
      } else {
        isPausedRef.current = false;
        tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, tick]);

  // Online/Offline detection — pause/resume based on connectivity
  useEffect(() => {
    if (!enabled) return;

    const handleOnline = () => {
      isPausedRef.current = false;
      tick();
    };

    const handleOffline = () => {
      isPausedRef.current = true;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, tick]);
}

