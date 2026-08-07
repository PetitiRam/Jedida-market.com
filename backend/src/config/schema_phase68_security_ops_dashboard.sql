-- Phase 68: Security Operations Dashboard. Additive only. This is the
-- unification layer: it doesn't replace platform_security_log (admin
-- action audit), fraud_flags (fraud review queue), or login_attempts
-- (auth history) — it adds the three tables those didn't cover, so the
-- dashboard has one real feed for "what did we block/detect just now"
-- instead of five different partial views.

-- IPs currently denied at the door. Populated either by an admin (manual
-- block) or automatically (autoBlockIfNeeded in securityEventService.js)
-- after repeated failed logins or rate-limit violations from the same
-- address. Checked by ipBlockGuard middleware on every request.
--
-- SCHEMA-DRIFT FIX: blocked_ips was originally created by phase 52
-- (PETITI auto-block: `ip TEXT PRIMARY KEY, reason, blocked_by, blocked_at,
-- unblocked_at, unblocked_by`). Migrations always run in ascending phase
-- order, so phase 52 runs before this file on every install — meaning a
-- `CREATE TABLE IF NOT EXISTS blocked_ips (...)` here was ALWAYS a no-op,
-- even on a brand-new database. This dashboard's columns (id, ip_address,
-- hit_count, expires_at, created_at) never actually got created, which is
-- exactly why the app code below throws "column ip_address does not
-- exist" / "column id does not exist" against the real table. Fixed by
-- reconciling the existing table with idempotent ALTERs instead of a
-- second, silently-ignored CREATE TABLE.
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip TEXT PRIMARY KEY
);

ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE blocked_ips SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE blocked_ips ALTER COLUMN id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_ips_id_key') THEN
    ALTER TABLE blocked_ips ADD CONSTRAINT blocked_ips_id_key UNIQUE (id);
  END IF;
END $$;

ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS reason TEXT;
UPDATE blocked_ips SET reason = 'Blocked (reason not recorded).' WHERE reason IS NULL;
ALTER TABLE blocked_ips ALTER COLUMN reason SET NOT NULL;

ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
UPDATE blocked_ips SET ip_address = ip WHERE ip_address IS NULL;
ALTER TABLE blocked_ips ALTER COLUMN ip_address SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_ips_ip_address_key') THEN
    ALTER TABLE blocked_ips ADD CONSTRAINT blocked_ips_ip_address_key UNIQUE (ip_address);
  END IF;
END $$;

ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(30) NOT NULL DEFAULT 'ai';
ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE blocked_ips SET created_at = COALESCE(blocked_at, now()) WHERE created_at IS NULL;
ALTER TABLE blocked_ips ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE blocked_ips ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS unblocked_at TIMESTAMPTZ;
ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS unblocked_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON blocked_ips(ip_address) WHERE unblocked_at IS NULL;

-- The live "attacks blocked / alerts / malware detections" feed. Every
-- automatic security decision the platform makes gets a row here —
-- rate-limit rejections, IP-block hits, malware/MIME rejections, brute
-- force detections, impossible-travel flags, credential-stuffing
-- suspicions. severity 1-2 = informational, 3 = alert, 4-5 = critical.
CREATE TABLE IF NOT EXISTS security_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(50) NOT NULL, -- 'rate_limit_blocked' | 'ip_blocked_hit' | 'ip_auto_blocked' |
                                       -- 'malware_detected' | 'mime_rejected' | 'brute_force_detected' |
                                       -- 'impossible_travel' | 'credential_stuffing_suspected' | 'csrf_rejected'
  severity      SMALLINT NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 5),
  ip_address    VARCHAR(64),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  request_path  TEXT,
  summary       TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}',
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity DESC, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address, created_at DESC);

-- Lightweight hourly request-volume counter (not a per-request log — a
-- single UPSERT'd counter per hour, so the traffic middleware stays cheap
-- enough to run on every request) — powers the dashboard's real API
-- traffic figure instead of a placeholder.
CREATE TABLE IF NOT EXISTS api_traffic_stats (
  hour_bucket   TIMESTAMPTZ PRIMARY KEY, -- truncated to the hour
  request_count BIGINT NOT NULL DEFAULT 0,
  blocked_count BIGINT NOT NULL DEFAULT 0
);
