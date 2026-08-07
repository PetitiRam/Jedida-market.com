-- ============================================================
-- schema_phase43_enterprise_platform.sql
-- Stage 3 — Enterprise B2B + B2C platform layer, built on top of
-- schema_phase37 (roles), schema_phase38 (sourcing), schema_phase41
-- (wholesale tiers/certificates/quote_requests) and schema_phase42
-- (dropship network). Purely additive.
--
-- What's deliberately NOT duplicated here, because it already exists:
-- * Quantity-break pricing               -> product_wholesale_tiers (phase41)
-- * Single-item RFQ (request a quote)     -> quote_requests (phase41)
-- * Shop branding (logo/banner/description) -> shops (schema.sql)
-- * MOQ                                    -> products.minimum_order_quantity
-- * Certificates / trust signals          -> product_certificates (phase41)
-- * Login activity                        -> login_attempts (phase4/5)
-- * Bulk shopping cart                    -> cart_items (phase17) + checkoutCart
-- * Partnership approval trail (dropship) -> dropship_audit_log (phase42)
-- * Platform commission %                 -> platform_settings.commission_settings
-- * Order/payment/delivery history        -> orders/payments/deliveries themselves
--
-- What this file actually adds:
-- 1. Storefront: named product collections, store-level reviews, a lead
--    time field for bulk manufacturing, and a tiered trust badge
--    (verification_level) above the existing pending/active/suspended
--    business_profiles.status.
-- 2. Bulk order system: a negotiation *thread* on top of quote_requests
--    (which today is only a single quote/counter), formal purchase
--    agreements both sides sign off on for a large deal, and durable
--    bulk invoices.
-- 3. Trust & security: disputes are currently just an order status
--    ('disputed') nothing ever sets and no case file backs — this adds
--    the actual case management (messages + evidence + resolution),
--    plus fraud_flags and a general-purpose platform_security_log for
--    the event types with nowhere else to live (product/price edits,
--    verification level changes) that a unified admin timeline can
--    join against the tables above that already exist.
-- ============================================================

-- Backs the new 'marketplaceRules' settings section (settingsService.js) —
-- operational rules an admin can tune without a deploy, distinct from the
-- static legal-policy text in LegalAndSystemService.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS marketplace_rules_settings JSONB NOT NULL DEFAULT '{}';

-- ------------------------------------------------------------
-- STOREFRONT — collections, store reviews, lead time, trust tier
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_collections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  banner_url    TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);
CREATE INDEX IF NOT EXISTS idx_collections_shop ON product_collections(shop_id, sort_order);
CREATE TRIGGER trg_collections_updated_at BEFORE UPDATE ON product_collections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS collection_products (
  collection_id UUID NOT NULL REFERENCES product_collections(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);

-- Store-level reviews, distinct from product_reviews — mirrors that
-- table's exact shape/verified-purchase rule (createReview in
-- reviewsController.js) but keyed on shop_id instead of product_id, since
-- a wholesale buyer is rating the supplier relationship as a whole
-- (communication, lead time accuracy, packaging) not a single SKU.
CREATE TABLE IF NOT EXISTS shop_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  buyer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_shop ON shop_reviews(shop_id);

-- Alibaba-style production/dispatch lead time for a bulk listing, read
-- alongside stock_availability (phase41) and minimum_order_quantity.
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0);

-- Tiered trust badge ABOVE the existing pending/active/suspended
-- lifecycle (business_profiles.status) — a business must be 'active'
-- before it can hold any level beyond 'unverified', but the level itself
-- is a separate, admin-controlled trust signal shown on the storefront
-- (distinguishes a freshly-approved business from one with a long,
-- clean track record).
CREATE TYPE business_verification_level AS ENUM ('unverified', 'basic', 'verified', 'trusted', 'elite');

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS verification_level business_verification_level NOT NULL DEFAULT 'unverified';
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS verification_level_note TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS verification_level_updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS verification_level_updated_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- BULK ORDER SYSTEM — RFQ negotiation thread, purchase agreements,
-- bulk invoices. (Bulk cart itself reuses cart_items/checkoutCart —
-- see ordersController.js — no schema needed there.)
-- ------------------------------------------------------------

-- Turns quote_requests (phase41) from a single quote/counter into a real
-- back-and-forth negotiation — "Supplier negotiation chat" in the brief.
-- Kept as its own thread (rather than reusing chat_conversations) so it
-- stays permanently tied to one quote and its eventual purchase
-- agreement/invoice, and never gets mixed into general support chat.
CREATE TABLE IF NOT EXISTS quote_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id  UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message           TEXT NOT NULL,
  proposed_unit_price NUMERIC(12,2),   -- optional counter-offer attached to this message
  proposed_quantity   INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_messages_quote ON quote_messages(quote_request_id, created_at);

-- A formal, both-sides-accepted agreement for a large/negotiated deal,
-- generated from a quote_request once terms are settled. Deliberately a
-- frozen snapshot (terms_text + line items) rather than a live reference
-- to the product/tiers, since the whole point is that it should not
-- silently change after both parties sign off.
CREATE TYPE purchase_agreement_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'cancelled');

CREATE TABLE IF NOT EXISTS purchase_agreements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id    UUID REFERENCES quote_requests(id) ON DELETE SET NULL,
  buyer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  status              purchase_agreement_status NOT NULL DEFAULT 'draft',
  terms_text          TEXT NOT NULL,          -- freeform terms (payment schedule, delivery, warranty…)
  line_items          JSONB NOT NULL DEFAULT '[]', -- [{ productId, title, quantity, unitPrice }]
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency            VARCHAR(10) NOT NULL DEFAULT 'USD',
  buyer_accepted_at   TIMESTAMPTZ,
  business_accepted_at TIMESTAMPTZ,
  resulting_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_agreements_buyer ON purchase_agreements(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_agreements_business ON purchase_agreements(business_id);
CREATE TRIGGER trg_purchase_agreements_updated_at BEFORE UPDATE ON purchase_agreements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Durable, numbered invoice for a bulk order/agreement — rendered
-- client-side as a printable page rather than a server-generated PDF
-- file, but the record itself (and its sequential number) is permanent
-- regardless of later changes to the underlying order/product rows.
CREATE SEQUENCE IF NOT EXISTS bulk_invoice_number_seq START 1000;

CREATE TABLE IF NOT EXISTS bulk_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      VARCHAR(30) NOT NULL UNIQUE DEFAULT ('INV-' || nextval('bulk_invoice_number_seq')),
  order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
  purchase_agreement_id UUID REFERENCES purchase_agreements(id) ON DELETE SET NULL,
  buyer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_items          JSONB NOT NULL DEFAULT '[]',
  subtotal_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency            VARCHAR(10) NOT NULL DEFAULT 'USD',
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bulk_invoices_buyer ON bulk_invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_bulk_invoices_business ON bulk_invoices(business_id);

-- ------------------------------------------------------------
-- TRUST & SECURITY — disputes (real case management; today 'disputed'
-- is an order status nothing ever sets), fraud flags, and a general
-- event log for what isn't already captured elsewhere.
-- ------------------------------------------------------------

CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved_refund', 'resolved_release', 'resolved_split', 'closed');
CREATE TYPE dispute_reason AS ENUM ('item_not_received', 'item_not_as_described', 'damaged', 'wrong_item', 'delivery_issue', 'payment_issue', 'other');

CREATE TABLE IF NOT EXISTS disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  opened_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          dispute_reason NOT NULL,
  description     TEXT NOT NULL,
  status          dispute_status NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  refund_amount   NUMERIC(12,2),
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)  -- one open case file per order; re-opening reuses the same row
);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_opened_by ON disputes(opened_by);
CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS dispute_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id    UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message       TEXT NOT NULL,
  is_admin_note BOOLEAN NOT NULL DEFAULT FALSE, -- internal admin-only note, hidden from the two parties
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id, created_at);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id    UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url      TEXT NOT NULL,
  caption       VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence(dispute_id);

-- Fraud signals — hand-raised by an admin or written by an on-demand
-- heuristic scan (fraudController.runFraudScan); never auto-actioned,
-- always lands in an admin review queue first.
CREATE TYPE fraud_flag_status AS ENUM ('open', 'reviewing', 'confirmed', 'dismissed');
CREATE TYPE fraud_flag_type AS ENUM (
  'rapid_cancellations', 'multiple_accounts_same_device', 'unusual_login_pattern',
  'high_dispute_ratio', 'price_manipulation', 'suspicious_payment', 'other'
);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  flag_type     fraud_flag_type NOT NULL,
  severity      SMALLINT NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  details       JSONB NOT NULL DEFAULT '{}',
  status        fraud_flag_status NOT NULL DEFAULT 'open',
  auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON fraud_flags(status, severity DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON fraud_flags(user_id);

-- General-purpose security/trust event log — deliberately NOT a home for
-- events that already have a proper table (logins -> login_attempts,
-- orders -> orders, payments -> payments, deliveries -> deliveries,
-- dropship partnership approvals -> dropship_audit_log). This is for
-- everything else the brief's "Track:" list calls for that had nowhere
-- to live: product edits, price changes, and verification-level changes.
-- securityController.js's unified timeline endpoint UNIONs this table
-- with the others at read time rather than copying their rows in here.
CREATE TABLE IF NOT EXISTS platform_security_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role    VARCHAR(30),
  event_type    VARCHAR(60) NOT NULL, -- 'product_updated' | 'product_price_changed' | 'verification_level_changed' | ...
  entity_type   VARCHAR(40) NOT NULL, -- 'product' | 'business_profile' | 'shop' | ...
  entity_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_log_entity ON platform_security_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_log_actor ON platform_security_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_log_event ON platform_security_log(event_type, created_at DESC);

-- ------------------------------------------------------------
-- Notifications — reuses the existing notifications infrastructure.
-- ------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quote_message_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'purchase_agreement_sent';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'purchase_agreement_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_opened';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shop_review_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'verification_level_changed';
