-- Phase 46: Push notification device tokens
--
-- One row per (user, device). A user can have several devices (phone +
-- tablet, or re-installed app with a new token) — all of them receive a
-- push when there's something to notify about. Tokens are opaque strings
-- issued by Firebase Cloud Messaging (used for both Android and iOS via
-- APNs-through-FCM), which is what @capacitor/push-notifications registers
-- against on the client.

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user ON device_push_tokens(user_id);

-- Per-user toggle so notification preferences (Settings > Notifications)
-- can turn chat push off without deleting the registered device token.
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_push_enabled BOOLEAN NOT NULL DEFAULT true;
