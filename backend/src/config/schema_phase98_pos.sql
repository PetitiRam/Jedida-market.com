-- Phase 98: JEDIDA POS foundation.
--
-- POS sales are real `orders` rows, not a parallel table — the existing
-- checkout_group_id column (added for cart checkout, phase unknown/pre-
-- existing) already groups several order line-items into one purchase,
-- which is exactly what a POS cart needs too. A POS sale of 3 items
-- creates 3 orders rows sharing one checkout_group_id, same as an online
-- cart checkout does today.
--
-- What's genuinely new: a POS sale has no buyer account (walk-in
-- customer), no shipping, and completes instantly in person — there's no
-- delivery-risk window to hold funds against, so a POS order goes
-- straight to status='completed' / financial_state='released' instead of
-- sitting in escrow the way a shipped marketplace order does. That's a
-- real difference in the underlying transaction, not a shortcut: the
-- funds-control model exists to protect a buyer who hasn't received
-- their goods yet, and a POS buyer already has.

-- ===== ORDERS: make room for a walk-in, in-person sale =====
ALTER TABLE orders ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'marketplace'
  CHECK (channel IN ('marketplace', 'pos', 'partner_app'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS register_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_register ON orders(register_id);

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'cash';

-- ===== POS SETUP (spec #4 "Business") =====
CREATE TABLE IF NOT EXISTS pos_configurations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  business_name     VARCHAR(255) NOT NULL,
  store_name        VARCHAR(255) NOT NULL,
  store_location    TEXT,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USD',
  timezone          VARCHAR(60) NOT NULL DEFAULT 'UTC',
  receipt_settings  JSONB NOT NULL DEFAULT '{}', -- {"footerNote":"...", "showLogo":true, ...}
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_pos_configurations_updated_at BEFORE UPDATE ON pos_configurations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== REGISTERS (spec #4 "Registers") =====
CREATE TYPE pos_register_status AS ENUM ('closed', 'open');

CREATE TABLE IF NOT EXISTS pos_registers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  label                 VARCHAR(100) NOT NULL, -- "Register 01"
  location              VARCHAR(255),
  status                pos_register_status NOT NULL DEFAULT 'closed',
  opened_by             UUID REFERENCES users(id),
  opened_at             TIMESTAMPTZ,
  opening_cash_amount   NUMERIC(12,2),
  closed_by             UUID REFERENCES users(id),
  closed_at             TIMESTAMPTZ,
  closing_cash_amount   NUMERIC(12,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, label)
);
CREATE INDEX IF NOT EXISTS idx_pos_registers_shop ON pos_registers(shop_id);
CREATE TRIGGER trg_pos_registers_updated_at BEFORE UPDATE ON pos_registers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE orders ADD CONSTRAINT fk_orders_register FOREIGN KEY (register_id) REFERENCES pos_registers(id);

-- ===== STAFF + PERMISSIONS (spec #4 "Staff") =====
CREATE TYPE pos_staff_role AS ENUM ('cashier', 'supervisor', 'store_manager', 'pos_administrator');

CREATE TABLE IF NOT EXISTS pos_staff (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              pos_staff_role NOT NULL DEFAULT 'cashier',
  register_id       UUID REFERENCES pos_registers(id), -- primary/assigned register, if any
  -- Individually toggleable so a merchant can grant e.g. discounts to a
  -- trusted cashier without promoting them to supervisor for everything.
  -- Sensible per-role defaults are applied in posController.js at
  -- creation time, not hard-coded here — this column is the source of
  -- truth after that.
  can_discount              BOOLEAN NOT NULL DEFAULT FALSE,
  can_refund                BOOLEAN NOT NULL DEFAULT FALSE,
  can_void                  BOOLEAN NOT NULL DEFAULT FALSE,
  can_access_cash_drawer    BOOLEAN NOT NULL DEFAULT TRUE,
  can_override_price        BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_reports          BOOLEAN NOT NULL DEFAULT FALSE,
  can_close_register         BOOLEAN NOT NULL DEFAULT FALSE,
  can_cancel_transaction     BOOLEAN NOT NULL DEFAULT FALSE,
  status            VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pos_staff_shop ON pos_staff(shop_id);
CREATE INDEX IF NOT EXISTS idx_pos_staff_user ON pos_staff(user_id);
CREATE TRIGGER trg_pos_staff_updated_at BEFORE UPDATE ON pos_staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
