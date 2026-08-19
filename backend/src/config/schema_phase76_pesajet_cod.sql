-- Phase 76: PesaJet Pay + Cash on Delivery (COD).
-- Adds two new payment_method values and COD cash-collection tracking
-- columns on deliveries. Does not touch escrow, wallets, or existing
-- payment records.

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pesajet';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'cash_on_delivery';

-- Cash-on-delivery collection tracking. Populated when a delivery record
-- is created for a COD order (cod_expected_amount) and again when the
-- assigned driver records the cash handoff (the rest). Nothing here marks
-- a payment 'succeeded' by itself — that still only happens through
-- applyPaymentConfirmation(), called from the new collect-cash endpoint.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cod_expected_amount   NUMERIC(12,2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cod_collected_amount  NUMERIC(12,2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cod_collected_at      TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cod_collected_by      UUID REFERENCES drivers(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cod_discrepancy       NUMERIC(12,2);
