-- JEDIDA Marketplace — Phase 65 schema
-- Impossible-travel + credential-stuffing detection: adds coarse geolocation
-- to successful login records so petitiSecurityEngine.js can compare
-- consecutive logins for a physically-impossible speed of travel.
-- Credential stuffing needs no new columns — it's a fan-out shape query
-- (COUNT DISTINCT email per ip_address) over the existing login_attempts
-- table, same as scanBruteForce already queries the fan-in shape.

ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS country VARCHAR(4);
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Speeds up "most recent successful login with geo data, per email" lookups
-- (scanImpossibleTravel) without scanning failed attempts, which never have
-- geo data populated.
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_success_geo
  ON login_attempts(email, created_at DESC)
  WHERE success = TRUE AND lat IS NOT NULL;
