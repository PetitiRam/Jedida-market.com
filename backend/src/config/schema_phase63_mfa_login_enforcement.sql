-- ============================================================
-- schema_phase63_mfa_login_enforcement.sql
-- Closes the gap where two_factor_enabled/two_factor_secret existed
-- (schema_phase33) but login() never actually challenged for a TOTP
-- code — 2FA was previously enforced only when issuing live partner
-- API keys, not at sign-in itself. Purely additive.
-- ============================================================

-- Mirrors failed_login_count/locked_until (schema.sql), but counted and
-- locked separately from password attempts: a correct password should
-- never share a failure budget with the second factor, and an admin
-- brute-forcing 6-digit TOTP codes shouldn't need to also guess the
-- password again to keep trying.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_failed_count INTEGER NOT NULL DEFAULT 0;
