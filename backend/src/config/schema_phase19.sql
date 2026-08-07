-- Phase 19: database compatibility audit (full static scan of every
-- controller/service query against the live schema, phases 1-18).
--
-- Two columns are referenced throughout authController.js,
-- adminController.js and upgradeController.js but were never migrated:
-- users.username and users.is_verified. Every registration
-- (registerStep2), the username-uniqueness check, login, "get my
-- profile", the admin user list/detail endpoints, and the pending
-- role-upgrade list all select or insert these columns — so signup and
-- login are currently broken outright (undefined column error).
--
-- This migration is additive only: no existing column is renamed or
-- dropped, no existing row is modified beyond the backfill values
-- described below, and both new columns are nullable/non-unique-safe
-- until backfilled, so it is safe to run against a live database with
-- existing users.

-- ---------------------------------------------------------------------
-- users.username
-- authController.normalizeUsername() lowercases/trims before every
-- comparison, so the column only ever needs to hold that normalized
-- form. Added nullable first (existing rows have no username), then
-- backfilled from email's local-part so every pre-existing account
-- still has a usable, unique value, then indexed unique.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30);

-- Backfill: derive from the email local-part, lowercased, illegal chars
-- stripped to match USERNAME_REGEX (^[a-z0-9_.]{3,30}$), and de-duplicated
-- by appending part of the user's id when a collision would occur.
UPDATE users
SET username = candidate.final_username
FROM (
  SELECT
    id,
    base || CASE WHEN rn = 1 THEN '' ELSE '_' || rn::text END AS final_username
  FROM (
    SELECT
      id,
      regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_.]', '', 'g') AS base_raw,
      row_number() OVER (
        PARTITION BY regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_.]', '', 'g')
        ORDER BY created_at
      ) AS rn
    FROM users
    WHERE username IS NULL
  ) ranked,
  LATERAL (
    SELECT CASE WHEN length(base_raw) < 3
             THEN base_raw || substr(replace(ranked.id::text, '-', ''), 1, 3 - length(base_raw))
             ELSE left(base_raw, 30)
           END AS base
  ) candidate2,
  LATERAL (SELECT candidate2.base AS base) candidate
) candidate
WHERE users.id = candidate.id
  AND users.username IS NULL;

-- Uniqueness + fast lookup, matching how authController queries it
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ---------------------------------------------------------------------
-- users.is_verified
-- authController currently sets this TRUE at INSERT time (email is
-- confirmed as part of registerStep1's token flow before registerStep2
-- runs) and gates login on it. Backfill existing users to TRUE so no
-- pre-existing account gets locked out of login by this migration.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_verified = TRUE WHERE is_verified IS DISTINCT FROM TRUE;

-- ---------------------------------------------------------------------
-- No other missing tables/columns/enums were found in this audit pass
-- (phases 1-18 already closed every other gap between live code and
-- schema). The remaining findings from this audit are *code* bugs, not
-- schema bugs — see AUDIT_REPORT.md for the corresponding source fixes:
--   - questionController.js selects u.name (users has no "name" column;
--     it's full_name) — fixed in code, no migration needed.
--   - deliveryController.js filters d.is_active (drivers has no
--     "is_active" column; it's is_available) — fixed in code.
--   - reviewController.js (singular) is dead code, not wired into any
--     route (routes/reviews.js uses reviewsController.js); it carries
--     the same u.name bug but never executes. Flagged for removal.
-- ---------------------------------------------------------------------
