-- JEDIDA Marketplace — Phase 56 schema
-- Adds optional video support to the Ads system. `image_url` remains
-- required (used as the poster frame / static fallback for browsers or
-- placements that don't autoplay video); `video_url` is optional and, when
-- present, the frontend plays it in place of the static image.

ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN ads.video_url IS
  'Optional video (mp4/webm/mov) for this ad. image_url is still required and used as the poster frame.';
