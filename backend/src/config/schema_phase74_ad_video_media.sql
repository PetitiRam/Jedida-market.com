-- JEDIDA Marketplace — Phase 74 schema
-- Extends phase 56's ads.video_url with the full set of video/media
-- controls the Ads system needs to serve mixed image/video placements
-- consistently: what kind of media this ad is, how its video should play,
-- how long it runs, and a dedicated poster/thumbnail distinct from
-- image_url (image_url stays the required fallback for non-video
-- placements; thumbnail_url is optional and, when present, is used as the
-- <video poster> instead of image_url).

DO $$ BEGIN
  CREATE TYPE ad_media_type AS ENUM ('image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill rule: any ad that already has a video_url is a video ad;
-- everything else is (and always was) an image ad.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_type ad_media_type;
UPDATE ads SET media_type = CASE WHEN video_url IS NOT NULL THEN 'video' ELSE 'image' END WHERE media_type IS NULL;
ALTER TABLE ads ALTER COLUMN media_type SET NOT NULL;
ALTER TABLE ads ALTER COLUMN media_type SET DEFAULT 'image';

ALTER TABLE ads ADD COLUMN IF NOT EXISTS autoplay          BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS muted             BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS loop_video        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS duration_seconds  INTEGER; -- NULL = play to the video's natural end / loop indefinitely
ALTER TABLE ads ADD COLUMN IF NOT EXISTS thumbnail_url     TEXT;    -- optional poster frame; falls back to image_url when absent

COMMENT ON COLUMN ads.media_type IS 'image | video — drives which player the frontend renders regardless of which URL fields are populated.';
COMMENT ON COLUMN ads.thumbnail_url IS 'Optional dedicated poster frame for video ads. When NULL, the frontend falls back to image_url.';
