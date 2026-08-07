-- Phase 17: a full audit — every FROM/INTO/UPDATE/JOIN table name across
-- every controller and service, diffed against every CREATE TABLE across
-- all schema files — turned up 7 more tables that live code depends on but
-- that were never migrated. Two of these are as severe as bugs get in this
-- app: pending_registrations meant NO ONE could complete signup (registerStep2
-- selects from a table that doesn't exist), and cart_items meant the entire
-- cart feature (add/update/remove/checkout) was non-functional.

-- Two-step registration (registerStep1/registerStep2 in authController.js)
CREATE TABLE IF NOT EXISTS pending_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  phone_number    VARCHAR(30) NOT NULL,
  token_hash      VARCHAR(255) NOT NULL,
  used            BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_token ON pending_registrations(token_hash);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON pending_registrations(email);

-- Shopping cart (commerceActionsController.js)
CREATE TABLE IF NOT EXISTS cart_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- Wishlist (commerceActionsController.js — the ProductCard heart button)
CREATE TABLE IF NOT EXISTS product_wishlists (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- Shop follows (commerceActionsController.js / shopsController.js's follower count)
CREATE TABLE IF NOT EXISTS shop_follows (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shop_id)
);

-- Bulk/B2B quote requests (commerceActionsController.js)
CREATE TABLE IF NOT EXISTS quote_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id              UUID NOT NULL REFERENCES users(id),
  quantity              INTEGER NOT NULL DEFAULT 1,
  requested_quantity    INTEGER,
  target_price          NUMERIC(12,2),
  quoted_price           NUMERIC(12,2),
  currency              VARCHAR(10) NOT NULL DEFAULT 'USD',
  message               TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_notes           TEXT,
  handled_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coupons (couponsController.js)
CREATE TABLE IF NOT EXISTS coupons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID REFERENCES shops(id) ON DELETE CASCADE, -- NULL = platform-wide coupon
  code              VARCHAR(50) NOT NULL,
  discount_type     VARCHAR(10) NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  discount_value    NUMERIC(12,2) NOT NULL,
  min_order_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_uses          INTEGER,
  uses_count        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_shop_code ON coupons(COALESCE(shop_id::text, 'platform'), code);

-- Cart checkout (ordersController.js checkoutCart/confirmCartPayment group
-- several orders from one cart into a single payment/confirmation flow).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_orders_checkout_group ON orders(checkout_group_id);

-- Manual mobile-money payment submission (ordersController.js
-- submitManualPayment) and admin review (adminPaymentsController.js) both
-- write to/read from the *existing* payments table, but it was missing the
-- columns and status/method values that flow actually needs — and
-- adminPaymentsController.js's read side was querying a "manual_payments"
-- table that never existed at all (should have been "payments" all along).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_phone VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_image TEXT;
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'mtn_mobile_money';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'airtel_money';
