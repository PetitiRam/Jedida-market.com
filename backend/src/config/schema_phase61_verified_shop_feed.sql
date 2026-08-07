-- ============================================================
-- schema_phase61_verified_shop_feed.sql
-- Verified Shop Feed (Phase D) — a professional business social page,
-- posting-gated to shops with shops.is_verified = TRUE (see
-- shopFeedController.js). Media reuses the existing media_uploads/
-- Cloudinary pipeline (POST /api/uploads) — a post just stores the URLs
-- it got back from that endpoint. "Buy directly from feed content"
-- reuses the existing product/checkout flow via post.product_id; no new
-- commerce logic needed.
-- ============================================================

CREATE TYPE shop_feed_post_type AS ENUM (
  'product_update', 'new_arrival', 'promotion', 'restock',
  'behind_the_scenes', 'business_story', 'testimonial', 'limited_time_offer', 'general'
);
CREATE TYPE shop_feed_post_status AS ENUM ('published', 'removed_by_admin', 'draft');

CREATE TABLE IF NOT EXISTS shop_feed_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_type       shop_feed_post_type NOT NULL DEFAULT 'general',
  caption         TEXT NOT NULL DEFAULT '',
  media           JSONB NOT NULL DEFAULT '[]', -- [{ url, media_type: 'image'|'video', thumbnail_url }]
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL, -- "buy" button target
  discount_percent SMALLINT CHECK (discount_percent IS NULL OR discount_percent BETWEEN 1 AND 99),
  offer_ends_at   TIMESTAMPTZ, -- for limited_time_offer posts — drives a countdown badge
  like_count      INTEGER NOT NULL DEFAULT 0,
  comment_count   INTEGER NOT NULL DEFAULT 0,
  share_count     INTEGER NOT NULL DEFAULT 0,
  save_count      INTEGER NOT NULL DEFAULT 0,
  status          shop_feed_post_status NOT NULL DEFAULT 'published',
  removed_reason  TEXT,
  removed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_feed_posts_shop ON shop_feed_posts(shop_id, created_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_shop_feed_posts_discovery ON shop_feed_posts(created_at DESC) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS shop_feed_post_likes (
  post_id    UUID NOT NULL REFERENCES shop_feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_feed_post_saves (
  post_id    UUID NOT NULL REFERENCES shop_feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_feed_post_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES shop_feed_posts(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL, -- nullable: an anonymous visitor can share too
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_feed_post_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES shop_feed_posts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_text    TEXT NOT NULL,
  removed_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_feed_comments_post ON shop_feed_post_comments(post_id, created_at ASC);

-- Personalized feed follows shop_follows (already exists) directly —
-- no new "interest" table needed for a first cut; interest-based ranking
-- (beyond followed shops) can layer on top later without a schema change.
