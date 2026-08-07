-- JEDIDA Marketplace — Phase 40 schema
-- AI Business Assistant: store-creation profile on shops, and a private
-- per-shop AI memory table. (Product intelligence/ads/recommendations
-- already exist from Phase 4 as the TAUSI tables — this phase only adds
-- what's genuinely new: store-creation output + business memory.)

ALTER TABLE shops ADD COLUMN IF NOT EXISTS ai_profile JSONB DEFAULT '{}';
-- ai_profile shape (written by storeDesignerBot.js):
-- { businessType, tagline, categorySuggestions: [...], sections: [{title, body}],
--   bannerHeadline, bannerSubtext, featuredPickNotes, generatedAt }

CREATE TABLE IF NOT EXISTS shop_ai_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category    VARCHAR(40) NOT NULL DEFAULT 'note', -- 'business_style','common_question','preference','note'
  content     TEXT NOT NULL,
  created_by  VARCHAR(20) NOT NULL DEFAULT 'ai',    -- 'ai' | 'owner'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_ai_memory_shop ON shop_ai_memory(shop_id, created_at DESC);
