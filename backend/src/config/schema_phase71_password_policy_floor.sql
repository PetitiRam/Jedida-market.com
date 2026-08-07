-- Phase 71: raise the default minimum password length from 8 to 12.
--
-- authController.js's validatePassword() now enforces a 12-char floor in
-- code regardless of this setting (an admin can raise it further, never
-- lower it), so this migration isn't strictly required for the floor to
-- hold. It exists so the *displayed* policy in the Security Center
-- matches reality, and so a fresh install's default reflects the actual
-- requirement instead of showing "8" and being silently overridden.
--
-- Only touches the row if it's still sitting at the old default (8) —
-- if an admin already deliberately set a different value, that choice is
-- left alone.
ALTER TABLE auth_security_policy ALTER COLUMN min_password_length SET DEFAULT 12;

UPDATE auth_security_policy
SET min_password_length = 12
WHERE id = 1 AND min_password_length = 8;
