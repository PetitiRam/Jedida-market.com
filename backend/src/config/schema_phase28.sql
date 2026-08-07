-- Phase 28: Coupon redemption tracking on orders.
--
-- Fix: coupons/validate (couponsController.js) checked `uses_count <
-- max_uses` and calculated a discount, but nothing in the codebase ever
-- applied that discount to an order or incremented uses_count — coupons
-- were validated but never actually redeemed. This phase adds the columns
-- createOrder needs to record a redemption; the redemption logic itself
-- (atomic uses_count increment guarded against overuse, discount applied
-- to the order total) lives in ordersController.createOrder.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_coupon ON orders(coupon_id);
