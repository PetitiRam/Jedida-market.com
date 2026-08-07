-- Phase 14: granular admin roles (spec section 16). Until now, is_admin was
-- a flat boolean — any admin could access every admin capability, with no
-- way to scope someone to just approvals, or just finance, etc.
--
-- Bootstrapping note: this migration does not create a super admin account.
-- The very first super admin must be set directly, e.g.:
--   UPDATE users SET is_admin = TRUE, admin_role = 'super_admin' WHERE email = '...';
-- From then on, that account can assign further admin roles through the app.
-- Existing admins with admin_role left NULL are still treated as full
-- (super-admin-equivalent) admins for backward compatibility — nobody who
-- already had access loses it because of this migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role VARCHAR(30);
ALTER TABLE admin_assignments ADD COLUMN IF NOT EXISTS role VARCHAR(30);
