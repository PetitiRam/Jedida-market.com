import { isIpBlocked, recordBlockedIpHit } from '../services/securityEventService.js';

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

// Mounted before everything else that does real work. A blocked IP never
// reaches routing, rate limiting, or auth — it gets a flat 403 here.
export async function ipBlockGuard(req, res, next) {
  const ip = clientIp(req);
  if (ip === 'unknown') return next();
  const blocked = await isIpBlocked(ip);
  if (blocked) {
    recordBlockedIpHit(ip); // fire-and-forget, never delays the response
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
}
