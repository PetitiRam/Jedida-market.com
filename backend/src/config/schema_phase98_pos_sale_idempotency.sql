-- Phase 98b: POS sale idempotency (ported from Jedida-market_com_phase11's
-- posService.js/schema_phase94_pos.sql).
--
-- The adopted POS foundation (schema_phase98_pos.sql, from
-- jedida-financial-pos-rebuild-patches) has no equivalent of this table —
-- its only "idempotency" is a ledger-posting key derived from an order's
-- own id, which does not exist until after the order (and the sale that
-- created it) is already committed. That does not protect against a
-- register — especially one running the offline queue — submitting the
-- same physical sale twice after a dropped connection or a retried
-- request: it would create a second real order and a second charge.
--
-- See INTEGRATION_DECISION_REPORT.md section 4.

CREATE TABLE IF NOT EXISTS pos_sale_batches (
  client_sale_uuid  UUID PRIMARY KEY,
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  checkout_group_id UUID NOT NULL,
  cashier_id        UUID NOT NULL REFERENCES users(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'completed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_batches_shop ON pos_sale_batches(shop_id, created_at DESC);
DO $$ BEGIN
  ALTER TABLE pos_sale_batches ADD CONSTRAINT chk_pos_sale_batches_status
    CHECK (status IN ('completed', 'voided'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
