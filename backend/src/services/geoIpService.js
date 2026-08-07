// Best-effort IP geolocation — powers the impossible-travel detector in
// petitiSecurityEngine.js. Deliberately fails soft everywhere: a slow or
// down geolocation provider must never delay or break a login. Callers
// always get either a { country, city, lat, lng } object or null — never
// a thrown error.

import axios from 'axios';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — an IP's rough location rarely changes faster than this
const cache = new Map(); // ip -> { geo, expiresAt }

const PRIVATE_IP_RE = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::ffff:127\.|::ffff:10\.)/;

function isPrivateOrUnknown(ip) {
  return !ip || ip === 'unknown' || PRIVATE_IP_RE.test(ip);
}

function pruneExpired() {
  const now = Date.now();
  for (const [ip, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(ip);
  }
}

// lookupIpGeo — resolves a single client IP to a coarse location. Local/
// private/dev IPs are skipped without a network call (they'd never resolve
// usefully anyway). Uses ip-api.com's free, keyless JSON endpoint; any
// failure (timeout, rate limit, malformed response) just returns null so
// the impossible-travel scan quietly skips that login rather than erroring.
export async function lookupIpGeo(ip) {
  if (isPrivateOrUnknown(ip)) return null;

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.geo;

  try {
    const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      params: { fields: 'status,country,countryCode,city,lat,lon' },
      timeout: 2500
    });
    if (!data || data.status !== 'success') {
      cache.set(ip, { geo: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }
    const geo = {
      country: data.countryCode || data.country || null,
      city: data.city || null,
      lat: typeof data.lat === 'number' ? data.lat : null,
      lng: typeof data.lon === 'number' ? data.lon : null
    };
    if (cache.size > 5000) pruneExpired();
    cache.set(ip, { geo, expiresAt: Date.now() + CACHE_TTL_MS });
    return geo;
  } catch (err) {
    // Network error, timeout, or rate limit — never block the caller.
    return null;
  }
}
