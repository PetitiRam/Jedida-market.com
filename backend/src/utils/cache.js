// Minimal in-memory TTL cache. Not distributed — fine for a single-process
// deployment; if this app ever runs multiple instances behind a load
// balancer, swap the Map below for a Redis client (get/set/del signatures
// are intentionally Redis-shaped so that swap doesn't touch call sites).
const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key) {
  store.delete(key);
}

export function cacheDelPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Wraps a fetcher so repeated calls within the TTL reuse the cached value
// instead of re-querying. Concurrent misses share one in-flight fetch
// rather than each triggering their own query (thundering-herd guard).
const inFlight = new Map();
export async function cached(key, ttlMs, fetcher) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const value = await fetcher();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}
