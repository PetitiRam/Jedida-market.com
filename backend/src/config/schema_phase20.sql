-- Phase 20: Google Sign-In support.
--
-- google_id (UNIQUE, nullable) and avatar_url already exist on users
-- (phase 5 / phase 1) — no change needed there. What's missing is that
-- users.password_hash and users.phone_number are both NOT NULL, and a
-- Google account provides neither a password nor a phone number at
-- sign-in time. Relaxing both is purely additive/backward-compatible:
-- every existing row already has non-null values, so no data is at risk
-- and no existing query that assumes these columns are populated for
-- password-registered users changes behavior.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

-- Guard rail: prevent a completely credential-less account from ever
-- being created by application-code accident — every user must have
-- either a password or a linked Google identity. Safe to add as a
-- validated (not NOT VALID) constraint: every existing row already has
-- password_hash set, so the validation scan passes immediately.
ALTER TABLE users ADD CONSTRAINT chk_users_has_credential
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);

-- phone_number is still required for most of the platform's flows
-- (delivery contact, phone OTP, WhatsApp-style notifications). Rather
-- than enforce that at the database layer — which would defeat the
-- point of letting a Google sign-in complete without one — the
-- application enforces "add your phone number" as a post-signup
-- profile-completion step for Google-only accounts. Track that state
-- explicitly instead of inferring it from phone_number being NULL,
-- so future columns/features don't have to guess:
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_required BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET phone_verification_required = TRUE WHERE phone_number IS NULL;
