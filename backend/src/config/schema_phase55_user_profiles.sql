-- ============================================================
-- schema_phase55_user_profiles.sql
-- Backs the unified platform profile (profileController.js /
-- routes/profile.js) — GET /api/profile/me, PATCH /api/profile/me,
-- GET /api/profile/:userId.
--
-- Everything else the profile needs already exists and is aggregated
-- at read time rather than duplicated here: business_profiles
-- (verification_level, company info), drivers (rating, vehicle),
-- shops/shop_follows/product_reviews (storefront stats), wallets
-- (balance), orders (buyer stats), dropship stats on business_profiles
-- (schema_phase42/43). This migration only adds the two small
-- display fields users don't have anywhere yet.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
