import { useCallback, useEffect, useRef, useState } from 'react';

const CACHE_PREFIX = 'jedida:cache:';

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    return parsed;
  } catch {
    // Corrupt/unavailable storage (private browsing, quota, etc.) — treat
    // exactly like "no cache" rather than throwing.
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Storage full/unavailable — the fetched data still renders this
    // session, it just won't survive a reload. Not fatal.
  }
}

/**
 * Cache-first, stale-while-revalidate data loading for public marketplace
 * data (products, categories, deals, trending, feed, banners, shops, etc).
 *
 * - On mount, any previously-cached value for `key` renders immediately
 *   (status 'ready', isStale true) while a background fetch runs.
 * - A successful fetch replaces both the in-memory value and the cache.
 * - A failed fetch NEVER clears existing data — it just marks `isStale`
 *   and quietly keeps retrying (the api client already retries transient
 *   failures itself with backoff — see client.js — so this layer only
 *   picks up after that's exhausted, at a slower pace, for sustained
 *   outages, plus an immediate retry the moment the app's own verified
 *   'jedida:network-online' event fires).
 * - If there's genuinely no cache AND the first fetch fails, status is
 *   'error' — that's the only case a caller should render an empty/error
 *   state instead of content.
 * - `maxCacheAgeMs` is a hard ceiling: cached data older than this is
 *   treated as if it didn't exist (goes to 'loading', not stale-and-shown)
 *   so genuinely old data is never mistaken for current.
 */
export function useCachedQuery(key, fetcher, { maxCacheAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  const cached = key ? readCache(key) : null;
  const cacheIsUsable = cached && (Date.now() - cached.savedAt) < maxCacheAgeMs;

  const [data, setData] = useState(cacheIsUsable ? cached.data : null);
  const [status, setStatus] = useState(cacheIsUsable ? 'ready' : 'loading');
  const [isStale, setIsStale] = useState(!!cacheIsUsable);

  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));

    fetcherRef.current()
      .then((result) => {
        setData(result);
        setStatus('ready');
        setIsStale(false);
        retryCountRef.current = 0;
        if (key) writeCache(key, result);
      })
      .catch(() => {
        setStatus((prev) => (prev === 'ready' ? prev : 'error'));
        setIsStale((prevStale) => prevStale || data !== null);
        // Background retry, slower than the api client's own backoff —
        // this only matters for outages that outlast that. Capped at 30s.
        const delayMs = Math.min(30000, 2000 * 2 ** retryCountRef.current);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(load, delayMs);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, [load]);

  useEffect(() => {
    const onOnline = () => { retryCountRef.current = 0; load(); };
    window.addEventListener('jedida:network-online', onOnline);
    return () => window.removeEventListener('jedida:network-online', onOnline);
  }, [load]);

  return { data, status, isStale, refetch: load };
}

export default useCachedQuery;
