-- Phase 13: settingsService.js's SECTION_COLUMNS map (and the identity/
-- branding column maps) reference columns on platform_settings that only
-- partially exist — most were never migrated. This made the entire Admin
-- Settings Center non-functional, not just the Payment tab.

-- Identity
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS marketplace_name VARCHAR(150) DEFAULT 'JEDIDA Marketplace';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS support_phone VARCHAR(30);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) DEFAULT 'en';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_currency VARCHAR(10) DEFAULT 'UGX';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_timezone VARCHAR(50) DEFAULT 'Africa/Kampala';

-- Branding
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS favicon_url TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS app_icon_url TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS splash_screen_url TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_logo_url TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS social_share_image_url TEXT;

-- settings_audit_log — updateSection/updateIdentity/updateBranding all write
-- here inside the same transaction as the actual settings change, and this
-- table never existed, so every settings update (not just reads) would have
-- failed outright.
CREATE TABLE IF NOT EXISTS settings_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section       VARCHAR(50) NOT NULL,
  changed_by    UUID REFERENCES users(id),
  before_value  JSONB,
  after_value   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settings_audit_log_section ON settings_audit_log(section, created_at);

-- legal_documents — versioned ToS/Privacy/etc, and system_backups — the
-- backup/restore feature's own audit trail. Same gap: both are referenced
-- by LegalAndSystemService.js but never existed.
CREATE TABLE IF NOT EXISTS legal_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type      VARCHAR(50) NOT NULL,
  content_md    TEXT NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 1,
  is_current    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON legal_documents(doc_type, is_current);

CREATE TABLE IF NOT EXISTS system_backups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by  UUID REFERENCES users(id),
  action        VARCHAR(20) NOT NULL, -- 'backup' | 'restore'
  file_path     TEXT,
  status        VARCHAR(20) NOT NULL, -- 'completed' | 'failed'
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Section JSONB blobs. Only "payment" gets defaults seeded to match what's
-- actually live today (mobile money on, everything else "coming soon", same
-- number already used for upgrade fees) — the rest default to an empty
-- object rather than us guessing product decisions that aren't ours to make.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS seller_upgrade_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS payment_settings JSONB NOT NULL DEFAULT '{
  "mobileMoneyNumber": "0755903781",
  "enableMobileMoney": true,
  "enableBankTransfer": false,
  "enableCash": false,
  "enableCardPayments": false
}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS commission_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS shop_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS user_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS delivery_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ad_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ai_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS security_settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_settings JSONB NOT NULL DEFAULT '{}';
