# JEDIDA Chat Upgrade — Contact-Sharing Moderation & Chat Safety

## Scope of this pass

Your ChatV2 system (`chatService.js`, `chatSocket.js`, `ChatPanelV2.jsx`) already
had real-time messaging, typing indicators, read receipts, reactions, edit,
delete, pin, translation, search, and the admin buyer↔seller bridge — all
untouched. This pass adds the piece the spec calls out as core and that
didn't exist yet: **Petiti AI contact-sharing/off-platform moderation**, plus
blocking, reporting, and per-user pin/archive state. No existing marketplace
functionality (orders, products, payments, wallets, etc.) was touched.

## What was built

**`backend/src/chat/contactModerationEngine.js`** (new)
- Detects phone numbers (incl. spelled-out digits like "zero-seven-eight..."),
  emails (incl. `(at)`/`(dot)` tricks), external links, and named-platform
  mentions for WhatsApp, Telegram, Facebook, Instagram, TikTok, X/Twitter,
  Snapchat, Discord, WeChat, IMO/Viber/Signal.
- Detects off-platform meeting requests and off-platform payment requests
  (e.g. "send money to my Mpesa directly", "pay outside the app").
- Returns an action per message: `allow` / `mask` (redacts just the matched
  text, message still sends) / `block` (nothing is delivered).
- `isExemptSender(user)` — verified admins are exempt; they can share
  official contact/payment/social info freely.
- `buildReminderMessage(result)` — the polite, category-aware reminder shown
  to the sender only (never to the other participant).

**`backend/src/config/schema_phase35_chat_moderation.sql`** (new)
- `users.chat_risk_score` (0–100, separate running score for chat behavior).
- `chat_messages`: `moderation_status`, `original_body` (admin-only, for
  masked/blocked messages), `is_official` (badge flag), plus
  `attachment_url`/`attachment_meta` (image/video/document/voice-note
  support, reusing your existing upload pipeline) and `forwarded_from_id`.
- `chat_moderation_events` — every detected attempt, feeding risk scoring.
- `chat_blocks`, `chat_reports` — user blocking and message reporting.
- `chat_conversation_states` — per-viewer pin/archive.

**`backend/src/chat/chatService.js`** — added `blockUser`, `unblockUser`,
`isBlockedEitherWay`, `listBlockedUsers`, `reportMessage`, `listReports`,
`updateReportStatus`, `setConversationState`, `listConversationsForUser`;
extended `saveMessage` to carry the new moderation/attachment/forward fields.

**`backend/src/chat/chatSocket.js`** — every `message:send` and
`message:send-bridged` now: checks mutual blocks first, runs the moderation
engine (skipped for admins), saves the masked/blocked/clean result, logs a
`chat_moderation_events` row and bumps `chat_risk_score` on any violation,
and emits a private `moderation:warning` event to the sender only when a
message was masked. Blocked messages return an error to the sender instead
of broadcasting anything.

**`backend/src/routes/chatV2.js`** — the REST send-message endpoint got the
same moderation treatment (some clients send over REST, not just sockets).
New endpoints: `POST /block`, `POST /unblock`, `GET /blocked`,
`POST /:conversationId/messages/:messageId/report`,
`GET /admin/reports`, `POST /admin/reports/:reportId/status`,
`GET /admin/risk-users`, `POST /:conversationId/pin`,
`POST /:conversationId/archive`, `GET /conversations`.

**Risk escalation → admin notification**: reuses your existing
`ai_alerts`/`ai_logs` (Petiti) infrastructure — no new alert pipeline. A
user crossing `chat_risk_score >= 60`, or 3+ violations in 7 days, files a
`high`/`critical` Petiti alert with `relatedUserId` set, visible wherever
your Security Center already reads `ai_alerts`.

**Frontend (`ChatPanelV2.jsx`, `useChatSocket.js`)**
- "Official Jedida Administrator" badge on messages where `is_official` is
  true.
- Inline note under any message Petiti AI masked.
- An amber "Petiti AI" banner when *you* trigger a mask (private, per
  sender) and a red banner when a message is fully blocked.
- 🚩 Report button per message; 🚫 Block button in the header when the
  conversation has an identifiable other participant (buyer↔seller, not the
  bare admin thread).

## Verified, not just written
- Every modified/new backend file passes `node --check` (real parse, not a
  read-through).
- Manual brace/paren balance check on both touched JSX/JS frontend files.
- Traced every new DB column/table back to an actual read or write site —
  nothing added to the schema that nothing queries.

## Deliberately out of scope this pass (flag if you want these next)
- Full WhatsApp/Telegram-style visual redesign of `ChatPanelV2.jsx` — this
  pass added a lighter bubble/wallpaper polish (asymmetric bubble corners,
  sent/received color distinction, subtle dot wallpaper) rather than a full
  re-skin.
- `ProductChat.jsx` is a disconnected legacy stub (posts to a
  `/chat/messages` route that doesn't exist) — left alone rather than
  guessed at; recommend pointing it at ChatPanelV2/chat-v2 instead of
  rewriting blind.
- Nudity/image-content scanning (needs an image-classification service —
  the text moderation engine here only covers text/captions, not the
  attachment bytes themselves).
- Product/shop/order "cards" as a distinct chat message type (structurally
  they'd reuse the same `attachment_meta` JSONB column added here, but no
  card UI was built this pass).

## Round 2 additions (attachments, forwarding, blocking UI, visual polish)

**Attachments** — extended the existing upload pipeline
(`uploadsController.js`, reusing `cloudinaryClient.js`) rather than building
a parallel one:
- Added `audio` to the `media_type` enum and an `original_name` column to
  `media_uploads` (voice notes/documents didn't fit the old
  image/video-only allowlist).
- `chatSocket.js`'s `message:send` now accepts `attachmentUrl`/
  `attachmentMeta` alongside an optional caption; the caption (not the file
  itself) is what Petiti AI's moderation engine scans.
- `ChatPanelV2.jsx` gained a 📎 attach button wired to the existing
  `MediaUploader.jsx` component (no new upload UI written), and renders
  images/video/audio players/document links inline per message.

**Forwarding** — `chatService.forwardMessage` + a `message:forward` socket
event copy an existing message's *stored* (already-moderated) body/
attachment into another conversation the user is part of, tagged with
`forwarded_from_id`. The frontend adds a ↪ Forward button per message that
opens a picker built from the new `GET /chat-v2/conversations` endpoint.

**Blocking UI** — the header now shows a 🚫 Block button whenever the open
conversation has an identifiable other participant (buyer↔seller), calling
the `POST /chat-v2/block` endpoint added in round 1.

**Visual polish** — asymmetric WhatsApp-style bubble corners, a sent/
received color split, and a faint dot-grid wallpaper background on the chat
surface, without touching layout/height or any other component's styling.

## Verified, not just written (round 2)
- All touched backend files re-passed `node --check` after the attachment/
  forward changes.
- Brace/paren balance re-checked on `ChatPanelV2.jsx` after restructuring
  `renderMessage` into a block function (needed to compute `mine` for the
  bubble color split).
- Confirmed `MediaUploader.jsx`'s relative import of `compressImage.js`
  resolves to an existing file before wiring it in, rather than assuming.

## To deploy (updated)
1. Run the migration — `schema_phase35_chat_moderation.sql` now also adds
   the `audio` media type and `media_uploads.original_name` column; runs
   automatically with your existing `migrate.js`.
2. No env vars or new dependencies required beyond what Cloudinary already
   needed for image/video uploads.

## Follow-up fix — two false-positive patterns narrowed

A review of this pass flagged two overly broad patterns in
`contactModerationEngine.js`'s `SOCIAL_PATTERNS`:

- **Discord**: the bare `#\d{4}\b` matched any `#1234`-shaped text,
  including `order #1234` or `ticket #5678`. Narrowed to require an
  adjacent handle-like token immediately before the `#`
  (`[a-z0-9_]{2,32}#\d{4}`), matching the real Discord tag format
  (`username#1234`) without the space-separated false positives.
- **Telegram**: the bare `@[a-z0-9_]{4,}` matched *any* @mention,
  regardless of platform — e.g. `message me @johnsmith123` with no
  Telegram context at all. Dropped the bare-handle match; kept the
  unambiguous signals (`telegram`, `t.me`, `tg:`/`tg@`). Phone/email/link
  detection still independently catches the actual contact info in a
  message like that, so overall coverage is effectively unchanged —
  just no longer mislabeling it specifically as a Telegram handle.

Both changes verified with targeted before/after test cases (order
numbers and generic @mentions no longer trip; real Discord tags,
"telegram", "tg:", and "t.me" links still do).
