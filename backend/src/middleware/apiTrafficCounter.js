import { query } from '../config/db.js';

// One UPSERT'd row per hour rather than a row per request — real traffic
// volume for the dashboard without the cost of logging every single
// request. Fire-and-forget: never awaited by the request path.
export function apiTrafficCounter(req, res, next) {
  query(
    `INSERT INTO api_traffic_stats (hour_bucket, request_count)
     VALUES (date_trunc('hour', now()), 1)
     ON CONFLICT (hour_bucket) DO UPDATE SET request_count = api_traffic_stats.request_count + 1`
  ).catch((err) => console.error('API traffic counter error:', err));
  next();
}

export function recordBlockedTraffic() {
  query(
    `INSERT INTO api_traffic_stats (hour_bucket, request_count, blocked_count)
     VALUES (date_trunc('hour', now()), 0, 1)
     ON CONFLICT (hour_bucket) DO UPDATE SET blocked_count = api_traffic_stats.blocked_count + 1`
  ).catch((err) => console.error('API traffic counter error:', err));
}
