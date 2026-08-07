-- Phase 18: targeted column-level audit of ordersController.js (the
-- previous audits caught missing tables; this one catches missing columns
-- on tables that do exist). cancelOrder() sets cancelled_at/cancellation_reason
-- on every cancellation — neither column existed, so every order cancellation
-- would have failed outright.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
