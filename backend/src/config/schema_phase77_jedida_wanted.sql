-- ============================================================
-- schema_phase77_jedida_wanted.sql
-- "Jedida Wanted" — Post What I Want. A buyer describes a need in free
-- text instead of browsing the catalog; Jedida AI classifies it into a
-- category, an explainable matching engine invites suitable
-- manufacturer/supplier/farmer businesses (B2B_ROLES — see
-- b2bCatalogController.js), and those businesses respond with quotes.
-- Purely additive: new tables only. Nothing existing is altered,
-- dropped, or renamed.
--
-- Design notes:
-- * Deliberately separate from quote_requests (phase41). quote_requests
--   is a targeted RFQ against a specific shop/product the buyer already
--   found. wanted_requests is the opposite direction: the buyer has no
--   shop/product in mind, Jedida finds candidates FOR them. The two
--   converge at the quote stage — wanted_request_quotes mirrors
--   quote_requests' shape on purpose — but a wanted request can fan out
--   to many businesses at once via wanted_request_matches, which
--   quote_requests has no equivalent of.
-- * category reuses the existing product_category enum (schema_phase2)
--   rather than inventing a parallel taxonomy — AI classification and
--   product browsing then agree on the same category values everywhere.
-- * wanted_request_matches.match_score / match_reasons make the
--   matching engine explainable and auditable (see PRIORITY INSTRUCTION
--   in the trust-engine brief: no black-box scoring) — every score is
--   reconstructable from the stored reasons, never just an AI opinion.
-- * wanted_request_audit_log is append-only, mirroring
--   dropship_audit_log (phase42) and platform_security_log (phase43):
--   one dedicated trail per feature area rather than one giant shared
--   table.
-- * No fund movement lives here. Accepting a quote just marks it
--   accepted and notifies both sides — actual purchase-order/payment
--   flow reuses whatever the buyer and business agree to arrange next
--   (today: existing quote_requests/orders path; future: Trade Cases).
--   This file does not fabricate a trade_cases table that doesn't exist
--   yet.
-- ============================================================

CREATE TYPE wanted_request_status AS ENUM (
  'submitted', 'matching', 'matched', 'quoted', 'closed', 'cancelled'
);

CREATE TYPE wanted_match_status AS ENUM (
  'invited', 'viewed', 'declined', 'quoted'
);

CREATE TYPE wanted_quote_status AS ENUM (
  'submitted', 'accepted', 'declined', 'withdrawn'
);

-- ------------------------------------------------------------
-- WANTED REQUESTS — the buyer's free-text "I need X" post.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title                       VARCHAR(255) NOT NULL,
  description                 TEXT NOT NULL,

  category                    product_category NOT NULL DEFAULT 'other',
  category_source             VARCHAR(20) NOT NULL DEFAULT 'ai',   -- 'ai' | 'keyword_fallback' | 'buyer_override'
  category_confidence         NUMERIC(4,3),                        -- 0.000–1.000, NULL when not AI-classified

  quantity                    INTEGER,
  unit                        VARCHAR(50),
  budget_min                  NUMERIC(14,2),
  budget_max                  NUMERIC(14,2),
  currency                    VARCHAR(10) NOT NULL DEFAULT 'USD',

  destination_country         VARCHAR(100),
  destination_city            VARCHAR(150),
  required_by_date            DATE,

  specifications               TEXT,
  quality_requirements         TEXT,
  preferred_supplier_country   VARCHAR(100),
  shipping_preference           VARCHAR(50),   -- 'air' | 'sea' | 'road' | 'any'
  sample_required               BOOLEAN NOT NULL DEFAULT FALSE,
  customization_required        BOOLEAN NOT NULL DEFAULT FALSE,

  status                      wanted_request_status NOT NULL DEFAULT 'submitted',
  match_count                 INTEGER NOT NULL DEFAULT 0,
  quote_count                 INTEGER NOT NULL DEFAULT 0,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (quantity IS NULL OR quantity > 0),
  CHECK (budget_min IS NULL OR budget_min >= 0),
  CHECK (budget_max IS NULL OR budget_max >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wanted_requests_buyer ON wanted_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_wanted_requests_category_status ON wanted_requests(category, status);
CREATE INDEX IF NOT EXISTS idx_wanted_requests_created ON wanted_requests(created_at DESC);

CREATE TRIGGER trg_wanted_requests_updated_at BEFORE UPDATE ON wanted_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- ATTACHMENTS — reference images/documents the buyer attaches to
-- describe what they want (fabric swatch, spec sheet, sample photo).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_request_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_request_id UUID NOT NULL REFERENCES wanted_requests(id) ON DELETE CASCADE,
  file_url          TEXT NOT NULL,
  file_type         VARCHAR(30),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wanted_attachments_request ON wanted_request_attachments(wanted_request_id);

-- ------------------------------------------------------------
-- MATCHES — the matching engine's explainable output: which
-- manufacturer/supplier/farmer businesses were invited, and why.
-- match_reasons is a JSON array of { factor, weight, detail } objects
-- so the score is always reconstructable, never opaque.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_request_matches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_request_id UUID NOT NULL REFERENCES wanted_requests(id) ON DELETE CASCADE,
  business_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id           UUID REFERENCES shops(id) ON DELETE SET NULL,

  match_score       NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 0–100, explainable (see match_reasons)
  match_reasons     JSONB NOT NULL DEFAULT '[]',

  status            wanted_match_status NOT NULL DEFAULT 'invited',
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at      TIMESTAMPTZ,

  UNIQUE (wanted_request_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_wanted_matches_request ON wanted_request_matches(wanted_request_id);
CREATE INDEX IF NOT EXISTS idx_wanted_matches_business ON wanted_request_matches(business_id, status);

-- ------------------------------------------------------------
-- QUOTES — a matched business's response. Deliberately shaped like
-- quote_requests (phase41) so the frontend's existing quote UI
-- patterns and future purchase-order code can treat the two alike.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_request_quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_request_id UUID NOT NULL REFERENCES wanted_requests(id) ON DELETE CASCADE,
  match_id          UUID REFERENCES wanted_request_matches(id) ON DELETE SET NULL,
  business_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id           UUID REFERENCES shops(id) ON DELETE SET NULL,

  unit_price        NUMERIC(14,2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USD',
  moq                INTEGER,
  lead_time_days     INTEGER,
  message           TEXT,

  status            wanted_quote_status NOT NULL DEFAULT 'submitted',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wanted_quotes_request ON wanted_request_quotes(wanted_request_id);
CREATE INDEX IF NOT EXISTS idx_wanted_quotes_business ON wanted_request_quotes(business_id);

CREATE TRIGGER trg_wanted_quotes_updated_at BEFORE UPDATE ON wanted_request_quotes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- AUDIT LOG — append-only trail for this feature, mirroring
-- dropship_audit_log (phase42). Every create/classify/match/invite/
-- respond/quote/accept action funnels through logWantedAction() in
-- wantedController.js.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_request_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_request_id UUID REFERENCES wanted_requests(id) ON DELETE SET NULL,
  actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  action            VARCHAR(60) NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wanted_audit_request ON wanted_request_audit_log(wanted_request_id);

-- ------------------------------------------------------------
-- Notification types — ADD VALUE runs fine alongside CREATE TABLE in the
-- same file because migrate.js sends each file as one simple-query-
-- protocol call, which does NOT implicitly wrap it in a transaction
-- block (see the identical pattern in schema_phase37.sql / phase41 / 42).
-- ------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_request_matched';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_quote_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_quote_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_quote_declined';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_request_cancelled';
