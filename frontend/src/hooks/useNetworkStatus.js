import { useCallback, useEffect, useRef, useState } from 'react';
import client from '../api/client';

// Drives the global offline experience (see OfflineScreen.jsx). Combines
// three signals instead of trusting any single one:
//
//   1. The browser's native online/offline events — cheap, instant, but
//      unreliable on their own (a captive portal or a router with no
//      real internet still reports "online").
//   2. A verified connectivity check against the actual backend
//      (GET /api/version — public, unauthenticated, no side effects)
//      run whenever the browser claims we've come back online, or when
//      the person taps "Try Again". This is what actually confirms
//      recovery, not just the browser's guess.
//   3. 'jedida:network-offline' / 'jedida:network-online' — dispatched
//      by api/client.js itself on every real request's outcome, so a
//      backend that becomes unreachable while the device's network
//      adapter still reports "online" (DNS trouble, backend down, no
//      captive portal involved) is caught too, and recovery is detected
//      the instant any ordinary API call succeeds again — no polling.
//
// State is intentionally kept in one place, in whichever component tree
// mounts this hook (see OfflineGate in App.jsx, mounted once, globally).
// There is no polling here — everything is event-driven, per the "don't
// hammer the backend" requirement.
export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [checking, setChecking] = useState(false);
  const [lastCheckFailed, setLastCheckFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // GET /api/version: the lightest real round-trip to the actual backend
  // that exists in this app already — public, no auth, no body, no
  // side effects. A short timeout keeps a single check from ever hanging
  // the UI; `skipOfflineScreen` stops this check's own failure from
  // re-triggering the very event loop it's trying to resolve.
  const verifyConnectivity = useCallback(async () => {
    try {
      await client.get('/version', { timeout: 6000, skipOfflineScreen: true });
      return true;
    } catch {
      return false;
    }
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    setLastCheckFailed(false);
    const ok = await verifyConnectivity();
    if (!mountedRef.current) return ok;
    setChecking(false);
    if (ok) {
      setIsOffline(false);
    } else {
      setLastCheckFailed(true);
    }
    return ok;
  }, [verifyConnectivity]);

  useEffect(() => {
    const handleBrowserOffline = () => {
      setIsOffline(true);
      setLastCheckFailed(false);
    };

    // The browser saying "online" again is a hint, not proof — verify
    // against the real backend before dismissing the screen. Do NOT flip
    // isOffline to false here directly; let the verified result decide.
    const handleBrowserOnline = () => {
      verifyConnectivity().then((ok) => {
        if (!mountedRef.current) return;
        if (ok) setIsOffline(false);
      });
    };

    const handleApiOffline = () => {
      setIsOffline(true);
    };

    const handleApiOnline = () => {
      setIsOffline(false);
      setLastCheckFailed(false);
    };

    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('jedida:network-offline', handleApiOffline);
    window.addEventListener('jedida:network-online', handleApiOnline);

    return () => {
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('jedida:network-offline', handleApiOffline);
      window.removeEventListener('jedida:network-online', handleApiOnline);
    };
  }, [verifyConnectivity]);

  return { isOffline, checking, lastCheckFailed, checkNow };
}

export default useNetworkStatus;
