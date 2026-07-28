import { useEffect, useRef, useCallback } from "react";

/**
 * usePollingPosts — A reusable hook for polling posts at a configurable interval.
 *
 * Features:
 * - Immediately fetches on mount (when enabled).
 * - Polls every `interval` ms using setInterval.
 * - Prevents overlapping requests (skips tick if previous fetch is still in flight).
 * - Pauses polling when the browser tab is hidden (Page Visibility API).
 * - Resumes polling when the tab becomes visible (immediately fetches on resume).
 * - Pauses polling when the user is offline (navigator.onLine === false).
 * - Resumes polling when the connection is restored.
 * - Cleans up interval and all event listeners on unmount.
 * - Safe for React StrictMode (no duplicate intervals).
 *
 * @param {Function} fetchFn  — Async function to call on each poll tick.
 * @param {number}   [interval=10000]  — Polling interval in milliseconds.
 * @param {boolean}  [enabled=true]    — Whether polling is active.
 */
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
        // Immediately fetch when tab becomes visible again
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
      // Immediately fetch when connection is restored
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

