-- ============================================================
-- schema_phase78_trade_case_management.sql
--
-- Implements the B2B "Trade Case" abstraction from the expansion brief
-- WITHOUT creating a parallel order/payment system. A trade case IS an
-- order — specifically one that originated from a quote_requests row.
-- RFQ, quote, negotiation, purchase order and payment already live on
-- quote_requests -> orders -> payments. Documents/shipping/inspection/
-- assignment/communication were the genuinely missing pieces; this
-- phase adds only those.
-- ============================================================

-- Symmetric link: quote_requests.resulting_order_id already points
-- forward to the order; this lets any order be traced back to its RFQ
-- in one join instead of a reverse lookup.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL;
UPDATE orders o SET quote_request_id = qr.id
  FROM quote_requests qr
  WHERE qr.resulting_order_id = o.id AND o.quote_request_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_quote_request ON orders(quote_request_id) WHERE quote_request_id IS NOT NULL;

-- Admin-managed assignment: lets Jedida route a trade case to a
-- specific support/ops agent and/or logistics provider, per the
-- "admin can assign customer/RFQ/supplier/trade case/agent/logistics
-- provider" requirement. Nullable — direct seller-buyer flow keeps
-- working unassigned, exactly as before.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_logistics_provider_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_admin ON orders(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE trade_case_shipping_status AS ENUM
    ('not_applicable', 'pending', 'booked', 'in_transit', 'customs', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trade_case_inspection_status AS ENUM
    ('not_applicable', 'requested', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS b2b_shipping_status trade_case_shipping_status NOT NULL DEFAULT 'not_applicable';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS b2b_inspection_status trade_case_inspection_status NOT NULL DEFAULT 'not_applicable';
-- Array of {url, label, uploadedBy, uploadedAt} — invoices, packing
-- lists, certificates of origin, inspection reports, etc.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS b2b_documents JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Unified, admin-visible communication/timeline log for a trade case.
-- Mirrors the existing dispute_messages pattern (same is_admin_only /
-- is_admin_note idea) so the two feel consistent in the UI.
CREATE TABLE IF NOT EXISTS trade_case_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    VARCHAR(50) NOT NULL, -- 'note' | 'status_change' | 'assignment' | 'document_added'
  message       TEXT NOT NULL,
  is_admin_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_case_events_order ON trade_case_events(order_id, created_at);
