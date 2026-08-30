# Jedida Live Shopping — Phase 1 Notes (Go / Cloudflare Stream)

Scope: **Phase 1 only**, per the spec's own 8-phase order — Go service,
Postgres schema, Cloudflare Stream client, event create/start/end/cancel,
product attach/feature, questions, and a basic realtime chat/presence hub.
**Not built in this pass**: the seller broadcasting UI, buyer live-viewing
UI, moderation tooling, notifications wiring, admin dashboard integration,
AI moderation, mobile broadcasting. Those are spec phases 2–8.

## Critical honesty note

**This Go code has never been compiled.** This sandbox has no Go
toolchain and no network access (confirmed: `go` is not installed;
`api.cloudflare.com` is unreachable — `host_not_allowed`). Every file was
written by hand and manually re-read for type/import/signature
consistency, and one real bug was caught and fixed that way (a wrong
column name in a SQL query, `shops.role_key` — which doesn't exist — vs.
the correct join through `users.primary_role`; also a struct literal typo
in the Cloudflare disable-input call). There is no substitute for actually
running `go build ./...` and `go vet ./...` — do that before this touches
a real server. I would not be surprised if there are still compile errors
I didn't catch by eye.

## A real bug this review surfaced, beyond the Go code itself

While writing the eligibility check, I read the actual
`getSellerCapabilities()` function (`featureEngineService.js`) instead of
assuming its behavior — and found that it defaults a shop to **enabled**
when no `seller_feature_activations` row exists yet, for backward
compatibility with features that pre-date the engine. That means **both
Live Shopping and POS are ON by default for every eligible shop**, not
opt-in as I'd claimed earlier in this conversation for POS. I've corrected
that claim in both `POS_IMPLEMENTATION_NOTES.md` and this file rather than
leave it wrong. If you want either feature to genuinely require an
explicit seller opt-in, that needs a decision: either backfill existing
shops with an explicit `enabled = false` row, or change the shared
default (which dropshipping/B2B/wholesale may depend on) — flagging this
rather than deciding it myself.

## What's real and reusable here

- **No parallel systems**: live events reference real `shops`/`products`/
  `users` by foreign key; eligibility reuses the exact feature-engine
  tables POS also uses; product attach validates against the real
  `products` table (same shop only); the Cloudflare stream key is never
  stored in Postgres or returned from any endpoint except the one-time
  `StartLive` response.
- **Idempotency** (spec §32): Start/End are keyed by a client-generated
  UUID at the database-transaction level, checked *before* any Cloudflare
  API call — a duplicate tap can't create two Live Inputs.
- **Cost controls** (spec §25): `live_platform_settings` is a real,
  admin-editable table (not hardcoded), read on every Start/End call —
  though there's no admin UI for editing it yet (Phase 7 territory).

## Phase 2 addition (this pass)

Frontend built on top of the Phase 1 backend: `LiveDashboardPanel.jsx`
(seller — create, start with broadcaster credentials shown once,
feature products, moderate questions, end), `LiveEventPage.jsx` (buyer —
Cloudflare iframe video embed, live chat, question submission, featured
product with add-to-cart), and `LiveNowStrip.jsx` (a simple discovery
strip on the marketplace home page).

Two real bugs caught and fixed during this pass, both the kind that would
have silently broken the feature for every real user rather than erroring
loudly:

- **WebSocket auth**: browsers cannot set a custom `Authorization` header
  on a WebSocket handshake. The original design required one anyway,
  which would have rejected every real browser connection. Fixed with a
  first-message auth handshake instead (`{"type":"auth","token":"..."}`
  sent right after the socket opens) rather than a `?token=` query param,
  which would have leaked into the Go service's own request logs.
- **Seller's own event list**: the public `ListActive` endpoint only
  returns *live* + *public* events — a seller needs to see their own
  draft/scheduled/ended events too. Added a separate authed
  `/my-events` endpoint instead of overloading the public one.

Also caught while wiring the frontend: two guessed endpoint paths that
were wrong (`/shops/mine` doesn't exist — it's `/shops/me`) and a missing
endpoint that a UI element silently depended on (product list for the
buyer page, the seller's pending-questions queue) — both added rather
than left as dead references. Every frontend API call was cross-checked
against an actually-registered Go route and a checked backend endpoint
before calling this pass done, not assumed to match.

## Phase 3 addition (this pass)

**Follower notifications on go-live** (spec §23): when a seller starts a
Live for real (not a duplicate/replayed Start tap), every follower of
that shop gets a `seller_went_live` notification via the exact same
`notifications` table the Node backend already reads/writes/serves — no
second notification system. Fired as a best-effort goroutine after the
response is written, so a slow or failed notification query can never
delay or break the seller's "Start Live" response. Required a small
signature change to `Service.StartLive` (now returns a `freshStart bool`)
so the handler can tell a genuine first start apart from an idempotent
replay or a credentials re-fetch — replays don't re-notify.

`notification_type` gained one new enum value, `seller_went_live`, added
the same additive way every other feature phase in this codebase adds one
(e.g. `wanted_negotiation_message` in phase 90).

## Still not built (Phase 4+)

- **Moderation state.** The chat hub broadcasts every message from every
  connected client — mute lists, blocked users, slow mode, and pinned
  messages (spec §13) are not implemented. Don't treat this as
  production-ready chat moderation.
- **Admin/agent integration.** `live_reports` table exists; no handler
  reads or writes it yet.
- **Notification wiring.** ~~Nothing calls into the existing Node
  notification system when a followed seller goes live (spec §23).~~
  Done this pass — see "Phase 3 addition" above.
- **Deeper discovery.** `LiveNowStrip.jsx` is a simple static home-page
  insertion, not integrated into the existing dynamic layout/section
  system (`DynamicSection`/`getMarketplaceLayout`) other home sections
  use — deliberately, since that system's schema wasn't verified against
  real data in this pass.
- **Cloudflare response field names** (`rtmps.streamKey`, etc. in
  `internal/cloudflare/live_inputs.go`) are written from general knowledge
  of Cloudflare's Stream API shape, not verified against a live response
  in this environment — worth a quick check against current Cloudflare
  docs before relying on them.
- AI moderation assistance, mobile broadcasting.
- **`go.sum` doesn't exist.** `go.mod` lists dependencies with version
  numbers I judged reasonable, but only `go mod tidy` on a machine with
  real network access can actually resolve and checksum them.
