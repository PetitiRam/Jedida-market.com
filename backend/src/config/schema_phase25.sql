-- JEDIDA Marketplace — Phase 25 schema
-- Automatic "products near me" ranking. No manual location picker anywhere:
-- coordinates are captured silently from the browser's Geolocation API
-- (buyer, on the marketplace) and inherited from the owner's stored
-- coordinates when a shop is created (seller). Distance is computed
-- server-side with the haversine formula in productsController/homeController.

ALTER TABLE shops ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,6);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,6);

-- Only ever queried against active shops with coordinates set, so a
-- partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_shops_location ON shops (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
