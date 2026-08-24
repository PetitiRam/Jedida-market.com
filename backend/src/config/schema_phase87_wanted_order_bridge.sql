-- ============================================================
-- schema_phase87_wanted_order_bridge.sql
-- Jedida Wanted → closes the off-platform gap left by phase77.
--
-- Purely additive. Nothing existing altered, dropped, or renamed.
--
-- Design notes:
-- * phase77's acceptWantedQuote() deliberately did not create an order
--   ("today: existing quote_requests/orders path ... this file does not
--   fabricate a trade_cases table"). In production that meant the buyer
--   was told to "reach out to arrange the order details with the
--   business directly" — exactly the off-platform-ordering hole Jedida
--   Wanted must not have. This migration closes it WITHOUT touching the
--   payment/escrow pipeline at all:
--     - products.wanted_quote_id marks a private, buyer-invisible
--       'draft'-status product auto-generated from one accepted quote.
--       It is UNIQUE (one bridge product per quote) and never appears
--       in public browse, which already filters `p.status = 'active'`.
--     - The buyer then checks out that product through the existing,
--       already-tested createOrder → payment adapter → escrow flow,
--       completely unchanged.
--     - orders.wanted_request_id / wanted_quote_id trace the resulting
--       order back to its originating Wanted post, nullable so every
--       non-Wanted order is unaffected.
-- * wanted_likes is plain social engagement per the phase77/Wanted brief
--   — a like never creates an order, reserves stock, or implies a
--   financial obligation.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wanted_quote_id UUID UNIQUE REFERENCES wanted_request_quotes(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS wanted_request_id UUID REFERENCES wanted_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wanted_quote_id   UUID REFERENCES wanted_request_quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_wanted_request ON orders(wanted_request_id);
CREATE INDEX IF NOT EXISTS idx_products_wanted_quote ON products(wanted_quote_id);

-- ------------------------------------------------------------
-- LIKES — social engagement on a Wanted post. See phase77 §22:
-- a like is never an order, a reservation, or a financial obligation.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_likes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_request_id UUID NOT NULL REFERENCES wanted_requests(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wanted_request_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wanted_likes_request ON wanted_likes(wanted_request_id);

ALTER TABLE wanted_requests
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

-- New notification types for the bridge + like flows.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_order_ready';
