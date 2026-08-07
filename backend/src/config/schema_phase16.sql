-- Phase 16: two unrelated-looking but both severe gaps found while auditing
-- Shop Settings (section 10) — its rating calculation joins product_reviews,
-- which turned out not to exist anywhere. Neither did review_helpful_votes
-- or product_questions. This means the entire Reviews and Q&A systems
-- (reviewsController.js, ProductTabs reviews/Q&A UI, shop rating averages,
-- ProductCard's review count) were reading from nothing.

CREATE TABLE IF NOT EXISTS product_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id            UUID NOT NULL REFERENCES users(id),
  rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             TEXT,
  seller_reply        TEXT,
  seller_replied_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id, created_at);

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  review_id   UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS product_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES users(id),
  asked_by        UUID NOT NULL REFERENCES users(id),
  question        TEXT NOT NULL,
  answer          TEXT,
  answered_by     UUID REFERENCES users(id),
  answered_at     TIMESTAMPTZ,
  forwarded_at    TIMESTAMPTZ,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_admin',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_questions_product ON product_questions(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_questions_status ON product_questions(status);

-- Section 10, Shop Settings — updateShopSettings()/setFeaturedProducts()
-- were already fully written against these columns; none of them existed.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS business_hours JSONB NOT NULL DEFAULT '{}';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS theme_primary_color VARCHAR(20);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS theme_accent_color VARCHAR(20);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS return_policy TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS shipping_policy TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS terms_content TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS featured_product_ids UUID[] NOT NULL DEFAULT '{}';
