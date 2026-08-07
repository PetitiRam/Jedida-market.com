-- Phase 31: Index support for the newly-paginated per-user order lists
-- (myOrdersAsBuyer/Seller/Delivery) — single-column indexes already existed
-- on buyer_id/shop_id/delivery_personnel_id, but not paired with
-- created_at, so the ORDER BY still required a separate sort step.
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_created ON orders(delivery_personnel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_created ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
