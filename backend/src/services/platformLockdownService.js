import { query } from '../config/db.js';

// Mirrors the shape/pattern of authPolicyService.js — a short cache so a
// toggle from Mission Control applies within a few seconds everywhere,
// without hitting the database on every single request.
let cache = null;
let cacheAt = 0;
const CACHE_MS = 5000;

export async function getLockdownState() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  const result = await query('SELECT maintenance_settings, emergency_controls FROM platform_settings WHERE id = 1');
  const row = result.rows[0] || {};
  cache = { ...(row.maintenance_settings || {}), ...(row.emergency_controls || {}) };
  cacheAt = now;
  return cache;
}

export function invalidateLockdownCache() {
  cache = null;
}
