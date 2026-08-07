-- JEDIDA Marketplace — Phase 69: Emergency Controls
-- Backs the Mission Control "Emergency & Quick Controls" panel with real,
-- enforced platform-wide switches (not just stored flags). See
-- src/services/platformLockdownService.js and src/middleware/platformLockdown.js
-- for where each flag is actually read and enforced.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS emergency_controls JSONB NOT NULL DEFAULT '{
  "paymentsFrozen": false,
  "partnerApisDisabled": false,
  "loginDisabled": false,
  "withdrawalsFrozen": false
}';
