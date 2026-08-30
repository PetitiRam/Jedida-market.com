# JEDIDA Go Realtime Chat Engine

Ported from jedida-chat-parity-final's `go-services` module — see
INTEGRATION_DECISION_REPORT.md section 7 for why this module was chosen
over the standalone `jedida-chat-all-changes.patch` chat service (same
core hub/client/handler capability, but this one's module structure
shares one auth/db/config layer instead of each service reinventing it).

**Only `cmd/chat` is included in this repo.** The original module also
had `cmd/live` and `cmd/affiliate`:

- `cmd/live` was **not** brought in — this platform's canonical Live
  Shopping is the Cloudflare-Stream-backed implementation from
  `Jedida-market_com_phase11` (`services/live-go/`, see
  INTEGRATION_DECISION_REPORT.md section 5). Bringing in a second,
  video-less live engine alongside it would mean two competing Live
  Shopping backends.
- `cmd/affiliate` was **not** brought in — its `internal/affiliate`
  queries hard-depend on a `users.affiliate_status = 'approved'` column
  that only exists if `schema_phase96_affiliate_applications.sql` is
  applied, and that migration forces every existing affiliate to
  re-apply from scratch ("no existing affiliate grandfathered in," per
  the original module's own README). That's a real product decision
  affecting every current user, not something to adopt as a side effect
  of bringing in a Go binary. Flagged as its own business-policy
  question — see INTEGRATION_DECISION_REPORT.md.

This directory is **additive**. Nothing in `backend/` or `frontend/` was
rewritten or replaced — Node/Express remains the marketplace API,
PostgreSQL remains the single source of truth, and the existing
Socket.IO chat (`backend/src/chat/chatSocket.js`) keeps running
unchanged alongside this. This engine reads and writes the **existing**
`chat_conversations`/`chat_messages` tables directly — no new chat
tables.

## What it does

Authenticates WebSocket connections with the same JWT the REST API
issues, and mirrors the existing Socket.IO event vocabulary
(`conversation:join`, `message:send`, `message:react`, `message:edit`,
`message:pin`/`unpin`, `message:forward`, `message:send-bridged` for
admin conversation-bridging, presence, typing, read receipts) so the
frontend's event names don't change if it's ever pointed at this
instead. Includes a from-scratch Go port of
`contactModerationEngine.js`'s phone/email/social-platform/payment-
diversion detection (`internal/chat/moderation.go`) — necessarily a
second copy of that regex set, since Go and Node can't share source; if
the Node-side patterns are ever updated, this file needs the same update
by hand. Push notifications call back into Node's existing
`sendPushToUser` rather than reimplementing Firebase in Go.

## Running (Termux, no Docker)

```bash
cd services/go-services
go version                # confirm Go is installed
go mod download            # needs network
go vet ./...
go test ./...              # authtoken + chat hub/moderation tests run
                           # with no real database; repository.go's DB
                           # calls need a real Postgres to exercise
go run ./cmd/chat
```

Required env (add to `backend/.env` or export separately — must match
`backend/.env` exactly where noted):

```
DATABASE_URL=postgres://...          # same DB as Node
JWT_ACCESS_SECRET=...                # byte-identical to backend/.env
GO_CHAT_PORT=8081
FRONTEND_URL=http://localhost:5173   # same as backend's FRONTEND_URL
GO_CHAT_MAX_CONNS_PER_USER=8
```

**Honesty note, unchanged from the original**: written and reviewed
without a Go toolchain or network access available in the sandbox that
built it, and not compiled or run again when it was brought into this
repo either (same constraint here). `go build ./... && go test ./...`
in a real environment is the mandatory first checkpoint before this
touches a frontend — see INTEGRATION_FINAL_REPORT.md's "Not Verified"
section.

## Outstanding before this touches production

1. `go build ./... && go test ./...` — not yet done anywhere.
2. Frontend is **not wired to this yet**. `useChatSocket.js` still only
   talks to the existing Socket.IO server. Wiring it up is real,
   separate follow-up work (behind a feature flag, without removing
   Socket.IO in the same change).
3. Translation (`backend/src/chat/translate.js`'s AI-based
   per-recipient translation) is not ported — a message sent through
   this engine, once wired up, would reach the recipient in the
   sender's original language only.
