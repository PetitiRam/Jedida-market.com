-- ============================================================
-- schema_phase44_market_representatives_ai_handler.sql
-- Stage 4 — Business Management Assistants: Jedida Market
-- Representatives (human agents) + the Jedida AI Handler
-- subscription (digital business assistant), for Manufacturers,
-- Suppliers, Dropshippers and Sellers. Purely additive, built on:
--   * users / admin_role (schema_phase14)              -> reps ARE
--     admin accounts with admin_role = 'business_rep'
--   * business_profiles (schema_phase37)                -> the
--     manufacturer/supplier/dropshipper account a rep/AI supports
--   * shops (schema.sql)                                -> the
--     seller storefront a rep/AI supports
--   * platform_security_log (schema_phase43)             -> single
--     write path for every rep action AND every AI Handler action
--     (reused rather than duplicated — see securityLogService.js)
--   * chat_ai_escalations (schema_phase37_ai_assistant)   -> buyer-
--     facing AI already escalates to a human; representative_escalations
--     below is the *business-facing* counterpart (a rep escalating a
--     business issue up to Jedida Admin), which had nowhere to live.
--
-- What this file adds:
-- 1. Market Representatives — a formal roster + assignment table on
--    top of the existing admin_role='business_rep' account, so an
--    admin can see who is assigned to which business, not just who
--    holds the role.
-- 2. AI Handler subscription — plans, a business's active
--    subscription, and (Enterprise only) extra staff seats.
-- 3. Trust & control — representative_escalations (rep -> admin) and
--    business_complaints (business/buyer -> admin, about a rep or the
--    AI Handler), so Admin has a real queue instead of ad-hoc chat.
-- ============================================================

-- ------------------------------------------------------------
-- MARKET REPRESENTATIVES
-- ------------------------------------------------------------
-- One row per approved representative. The underlying account is an
-- admin account (users.is_admin = TRUE, admin_role = 'business_rep')
-- so it rides the exact same auth/session/permission machinery every
-- other admin sub-role already uses (see middleware/auth.js
-- ADMIN_ROLE_PERMISSIONS) — this table adds the roster + limited-
-- permission bookkeeping that role alone doesn't carry.
CREATE TABLE IF NOT EXISTS market_representatives (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  rep_code          VARCHAR(20) NOT NULL UNIQUE, -- e.g. 'REP-0001', shown to businesses
  status            account_status NOT NULL DEFAULT 'active', -- active | suspended
  specialties       TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'manufacturer','supplier'}
  bio               TEXT,
  -- Hard permission ceiling, enforced in code (representativeController.js /
  -- aiHandlerGuard.js), mirrored here so Admin can see it without reading
  -- code. A representative can NEVER have any of these set true.
  can_receive_payments        BOOLEAN NOT NULL DEFAULT FALSE,
  can_complete_orders_offsite BOOLEAN NOT NULL DEFAULT FALSE,
  can_change_ownership        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Belt-and-braces: these three must always stay FALSE at the DB
  -- layer too, regardless of what application code ever does.
  CONSTRAINT chk_rep_cannot_touch_money CHECK (
    can_receive_payments = FALSE AND
    can_complete_orders_offsite = FALSE AND
    can_change_ownership = FALSE
  )
);
CREATE INDEX IF NOT EXISTS idx_market_reps_status ON market_representatives(status);
CREATE TRIGGER trg_market_reps_updated_at BEFORE UPDATE ON market_representatives
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE SEQUENCE IF NOT EXISTS rep_code_seq START 1;

-- Which businesses a representative currently helps. A business can have
-- more than one rep over time (history preserved via status='ended'
-- rather than deleting the row); a rep can carry many businesses.
CREATE TABLE IF NOT EXISTS representative_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id   UUID NOT NULL REFERENCES market_representatives(id) ON DELETE CASCADE,
  business_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- the manufacturer/supplier/dropshipper/seller account
  status              VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  assigned_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ,
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_rep_assignments_rep ON representative_assignments(representative_id, status);
CREATE INDEX IF NOT EXISTS idx_rep_assignments_business ON representative_assignments(business_user_id, status);
-- Only one ACTIVE assignment per (rep, business) pair at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rep_assignment_active
  ON representative_assignments(representative_id, business_user_id)
  WHERE status = 'active';

-- A representative escalating something to Jedida Admin (the "Escalate
-- issues to Jedida Admin" capability). Distinct from chat_ai_escalations
-- (buyer-facing AI -> human handover) and from business_complaints below
-- (someone complaining ABOUT a rep/AI) — this is the rep raising a flag.
CREATE TABLE IF NOT EXISTS representative_escalations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id   UUID NOT NULL REFERENCES market_representatives(id) ON DELETE CASCADE,
  business_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  area                VARCHAR(30) NOT NULL DEFAULT 'other', -- account_health | verification | catalog | security | other
  subject             VARCHAR(200) NOT NULL,
  details             TEXT NOT NULL,
  status              VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  resolution_notes    TEXT
);
CREATE INDEX IF NOT EXISTS idx_rep_escalations_status ON representative_escalations(status, created_at DESC);

-- ------------------------------------------------------------
-- JEDIDA AI HANDLER — subscription plans + a business's active plan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_handler_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20) NOT NULL UNIQUE, -- 'basic' | 'professional' | 'enterprise'
  name            VARCHAR(60) NOT NULL,
  price_monthly   NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10) NOT NULL DEFAULT 'USD',
  -- Capability flags read by aiHandlerGuard.js to gate each AI Handler
  -- endpoint. Kept as JSONB (not a fixed set of boolean columns) so
  -- Admin can add a new capability later without another migration.
  features        JSONB NOT NULL DEFAULT '{}',
  staff_seat_limit INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ai_handler_plans_updated_at BEFORE UPDATE ON ai_handler_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO ai_handler_plans (code, name, price_monthly, features, staff_seat_limit, sort_order)
VALUES
  ('basic', 'Basic', 15.00, '{
     "product_assistance": true,
     "store_suggestions": true,
     "customer_message_assistance": true
   }'::jsonb, 1, 1),
  ('professional', 'Professional', 45.00, '{
     "product_assistance": true,
     "store_suggestions": true,
     "customer_message_assistance": true,
     "advanced_analytics": true,
     "marketing_automation": true,
     "sales_insights": true,
     "customer_support_automation": true
   }'::jsonb, 3, 2),
  ('enterprise', 'Enterprise', 120.00, '{
     "product_assistance": true,
     "store_suggestions": true,
     "customer_message_assistance": true,
     "advanced_analytics": true,
     "marketing_automation": true,
     "sales_insights": true,
     "customer_support_automation": true,
     "dedicated_assistant": true,
     "multiple_staff_accounts": true,
     "advanced_reporting": true
   }'::jsonb, 10, 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_handler_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id             UUID NOT NULL REFERENCES ai_handler_plans(id),
  status              VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  auto_renew          BOOLEAN NOT NULL DEFAULT TRUE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_sub_business ON ai_handler_subscriptions(business_user_id, status);
-- Only one ACTIVE subscription per business at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_sub_active_per_business
  ON ai_handler_subscriptions(business_user_id)
  WHERE status = 'active';
CREATE TRIGGER trg_ai_sub_updated_at BEFORE UPDATE ON ai_handler_subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enterprise-only: additional staff accounts that can act on behalf of
-- the subscribing business inside the AI Handler tools, capped at the
-- plan's staff_seat_limit (enforced in aiHandlerController.js).
CREATE TABLE IF NOT EXISTS ai_handler_staff_seats (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID NOT NULL REFERENCES ai_handler_subscriptions(id) ON DELETE CASCADE,
  staff_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  status            VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at        TIMESTAMPTZ,
  UNIQUE (subscription_id, staff_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_seats_subscription ON ai_handler_staff_seats(subscription_id, status);

-- ------------------------------------------------------------
-- COMPLAINTS — about a representative or the AI Handler. Distinct from
-- disputes (schema_phase43, which are order-level buyer/seller cases).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_complaints (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complainant_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_type          VARCHAR(20) NOT NULL CHECK (against_type IN ('representative','ai_handler')),
  against_representative_id UUID REFERENCES market_representatives(id) ON DELETE SET NULL,
  against_business_user_id  UUID REFERENCES users(id) ON DELETE SET NULL, -- which business's AI Handler, if against_type='ai_handler'
  subject               VARCHAR(200) NOT NULL,
  description           TEXT NOT NULL,
  status                VARCHAR(14) NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  resolved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes      TEXT,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_complaints_status ON business_complaints(status, created_at DESC);

-- ------------------------------------------------------------
-- Notifications — reuses the existing notifications infrastructure.
-- ------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'representative_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'representative_escalation';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ai_handler_subscription_activated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ai_handler_subscription_cancelled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'business_complaint_filed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'business_complaint_resolved';
