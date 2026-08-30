# JEDIDA Marketplace — Integration Decision Report

Generated during a source-level comparison of the current live codebase against
10 uploaded archives + 3 patch files. This is a decision document, not a
changelog — Phase K (implementation) proceeds from the recommendations below.

---

## 1. Current Baseline

- **Baseline commit:** `dadb9de` (this session's buyer-dashboard/wallet/following work,
  committed on top of `45810c4`). **This commit must not be modified** per instruction —
  all integration work happens on top of it.
- **Branch:** `integration/professional-platform-merge`, currently == `dadb9de`.
- **Tree status:** clean at time of writing.
- **origin/main:** **could not be fetched — no network/SSH available in this sandbox.**
  The last locally-cached ref for `origin/main` is `45810c4`, one commit behind our
  current branch. This has **not** been verified against the real remote. Do not
  treat `origin/main` as confirmed current anywhere in this report.
- **Verification limitations:** no Postgres, no `npm install` (no network to fetch
  packages), no Go toolchain verified reachable, no ability to run the app. Every
  finding below comes from reading source code and diffing file trees/patches, not
  from execution. `node --check` / syntax-level checks are used where noted; nothing
  claims a passing build or test run unless explicitly stated as executed.

## 2. Sources Inspected

| Archive/patch | What it actually is (verified) |
|---|---|
| `Jedida-market_com.zip` | Same commit (`45810c4`) as our pre-session baseline. No new content. |
| `jedida-market-full-repo.zip` | Our own session output (buyer dashboard + wallet), re-uploaded. |
| `Jedida-market_com-merged.zip` | Independent branch from the same `45810c4` base (different, non-overlapping commit hashes — this is patch-applied history, not a git-merged lineage). 44 files differ from current main; 26 of those are files *I* edited this session and it simply predates that (verified byte-identical to the pre-session baseline) — **not real conflicts**. The other 18 are genuine independent edits (see §9, Hot Files). |
| `Jedida-market_com_phase11.zip` | POS (basic) + Live Shopping (Cloudflare Stream + Go), AI systems map, China Trade Hub, Admin Finance Workspace. |
| `Jedida-market_com_updated.zip` | Minor — Wanted CSS/component additions, small diffs elsewhere. |
| `jedida-financial-pos-rebuild-patches.zip` | **19 sequential, dependency-ordered patches** (phase95→113): unified financial ledger → provider/method abstraction → financial control center → packaging evidence → POS (register/cart/receipts/reconciliation/team) → wallet → checkout integration. One coherent body of work, not disjoint. |
| `JedidaMarket_TermuxPatch.zip` | Packaging of already-shell-merged `SellerDashboard.jsx` + 3 real bug fixes (dead `/messages` route in shop "Chat with Seller"/"Business Inquiry" buttons). Self-documents its own non-conflict with prior sidebar/shell work. |
| `Jedida-market_com-merged.zip` (go part) | see above |
| `jedida-chat-parity-final.zip` | Unified Go module (`jedida.com/go-services`) — `chat` + `live` + `affiliate`, sharing one `auth`/`db`/`config` layer. Includes a real phone-number/contact-info moderation engine with tests. |
| `jedida-market-with-chat-changes.zip` | Node-side chat retention (24h expiry) + a *narrow* packaging-evidence-via-chat linking feature + `MessagesPage.jsx`/`ConversationList.jsx`. |
| `profile-rebuild-final.zip` | Profile identity rebuild — photo upload, follow list page, profile settings, sync util. Not yet compared in depth (see §10). |
| `0001-wanted-redesign.patch` | UI-only redesign of `JedidaWanted.jsx` (799 lines changed) + new `WantedSidebar.jsx` + CSS. Not yet compared against the Wanted work already on `main` (phases 87-94) in depth (see §10). |
| `jedida-chat-all-changes.patch` | Standalone Go chat module (own `go.mod`) — hub/client/store/JWT, tested. Also bundles the 24h chat retention Node patch and some emoji→Icon cleanup in chat UI. |
| `jedida-all-changes-combined.patch` | The combined form of all 19 `jedida-financial-pos-rebuild-patches` — same content, not a separate line of work. |

---

## 3. Wallet — RECOMMENDATION: Adopt financial-pos-rebuild's wallet; discard this session's wallet backend; keep this session's UI wiring

**Compared:** this session's `wallet_deposits`/`wallet_transfers` (commit `dadb9de`) vs.
`jedida-financial-pos-rebuild-patches` phase100 (`schema_phase100_wallet.sql` +
`walletsController.js` additions) + phase105 (`WalletKycPanel.jsx` frontend).

| Dimension | This session's wallet | financial-pos-rebuild's wallet |
|---|---|---|
| Ledger integration | Ad-hoc `wallet_transactions` rows only | Posts to a real double-entry-style `financial_transactions` ledger (`ledgerService.postTransaction`/`updateTransactionStatus`, phase95) shared with orders, POS, and reconciliation |
| Fee handling | None — no concept of fees | Configurable `wallet_fee_settings` (JSONB on `platform_settings`) + a `GET /wallet/fees/preview` endpoint so a fee is shown **before** submission |
| Payment provider integration | Hardcoded `ADAPTERS['stripe'\|'flutterwave'\|'dpo'\|'coinbase']` map, duplicated from `ordersController.js` | Reuses a proper `provider_registry`/`provider_methods` catalog (`providerAbstraction.initiatePlatformPayment`, phase96) — the same catalog POS/checkout read, so a newly-connected provider becomes available everywhere at once |
| Deposit confirmation safety | Sandbox-only manual confirm gated on `-SANDBOX-` reference; real confirmation only via existing signature-verified webhook | Same guard, same design |
| Deposit idempotency | **None** — a rapid double-submit calls the provider adapter twice (two real charges) | `wallet_deposits.idempotency_key UNIQUE`, but **generated server-side as `` `deposit:${userId}:${Date.now()}` `` — not client-supplied**, so it does not actually prevent a genuine double-submit (two rapid clicks get two different millisecond timestamps). **Real gap, shared by both.** |
| Transfer idempotency | Client-generates a `crypto.randomUUID()` per "Send" action, checked before insert — **correctly prevents double-submit** | Same server-side-timestamp flaw as deposits above — **weaker than this session's transfer** |
| Withdrawal integration | Untouched | Adds `fee_amount`/`net_amount` to the *existing* `withdrawal_requests` flow (doesn't rebuild it), and **removes the `primary_role === 'buyer'` withdrawal block** — flagged explicitly in their own commit message as a policy change requiring review |
| Order/escrow integration | Reuses `applyPaymentConfirmation()` for wallet-pay at checkout (this session's own addition) | Ledger hook lives *inside* `applyPaymentConfirmation()` too — **the two compose without conflict** (see §9) |
| Completeness | Deposit, Transfer, Pay | Deposit, Transfer, fee preview, withdrawal fee transparency, full ledger audit trail |

**RECOMMENDATION:** Adopt financial-pos-rebuild's wallet (phase 95 ledger + phase 96
provider abstraction + phase 100/105 wallet) as canonical. It is not just larger — it
is integrated into a real shared ledger that POS and reconciliation also depend on,
which this session's implementation has no path to without becoming a second,
parallel ledger. Two concrete fixes must be carried over during the merge, not
silently dropped:

1. **Fix deposit and transfer idempotency to require a client-supplied key**,
   matching this session's transfer implementation — the server-timestamp approach
   in both of financial-pos-rebuild's endpoints does not protect against a real
   double-submit.
2. **The buyer-withdrawal policy change is a genuine business-policy question**,
   not a technical one — flagged for you, not decided here (see §11).

This session's `BuyerDashboard.jsx` wiring, the Wallet tab placement, and the
Deposit/Transfer/Withdraw segmented UI in `WalletKycPanel.jsx` are **kept** — only
the backend calls and response-shape assumptions need to be repointed at the
adopted endpoints (`/wallet/deposits`, `/wallet/transfers`, `/wallet/fees/preview`
instead of `/wallets/deposit/start`, `/wallets/transfer`). This session's own
`schema_phase94_wallet_deposits_transfers.sql`, and the deposit/transfer/pay
functions added to `walletsController.js`/`ordersController.js` this session, are
superseded and will be removed in Phase K.

---

## 4. POS — RECOMMENDATION: Adopt financial-pos-rebuild as canonical; port phase11's offline-queue and sale idempotency into it

**Compared:** `Jedida-market_com_phase11` (933 lines: `posController.js`,
`posService.js`, `POSRegisterPanel.jsx`, `posOfflineQueue.js`) vs.
`jedida-financial-pos-rebuild-patches` phases 98, 103, 108, 109, 110, 111
(register, frontend terminal, management UI, receipts, team/cashier tab,
reconciliation — ~1,700+ lines across 6 phases).

| Dimension | phase11 | financial-pos-rebuild |
|---|---|---|
| Order/payment integration | Creates real `orders` rows | Creates real `orders` rows, **posts to the same unified ledger** (`postTransaction`), sets `financialState: 'released'` immediately (correct — no shipping window to protect in an in-person sale) |
| **Client sale idempotency** | **`clientSaleUuid` required end to end** — checked against `pos_sale_batches.client_sale_uuid` **before any order is created**. Genuinely safe for offline retry. | **Missing entirely.** The only "idempotency" present is a ledger-posting key derived from `order.id` — which does not exist until *after* the sale (and its order) has already been created. A retried/offline-queued submission creates a second real order. |
| **Offline queue** | `posOfflineQueue.js` (107 lines) — real offline capture + sync | **None anywhere in the 19 phases.** Online-only terminal. |
| Receipts | Not integrated with the platform's real document service | Hooks into the **existing** `documentService.js` (phase109) — no second receipt renderer |
| Reconciliation | None | Dedicated reconciliation phase (111) against the ledger |
| Team/cashier support | Not present | Dedicated team tab (phase110) |
| Financial Control Center | Not present | Full admin visibility into POS alongside online sales (phases 97, 108) |

**RECOMMENDATION:** Adopt financial-pos-rebuild's POS as the canonical transaction
flow — its ledger, receipt, reconciliation, and team-management integration is
categorically more complete and correctly reuses existing platform services. But
this is explicitly **not** "pick the bigger one": financial-pos-rebuild is missing
two things the task treats as core POS requirements (offline queue, real sale
idempotency), and phase11 got exactly those two right. Before this can be called
production-ready for a physical register:

1. **Port `pos_sale_batches` + `client_sale_uuid`** from phase11 into
   financial-pos-rebuild's `createSale` — required before order creation, not
   just before ledger posting.
2. **Port `posOfflineQueue.js`** (adapted to call financial-pos-rebuild's
   `/api/pos/sale` endpoint) into the frontend terminal.

Everything else phase11 built (`POSRegisterPanel.jsx`) is superseded by
financial-pos-rebuild's more complete `PosTerminalPage.jsx`/`PosManagementPanel.jsx`
and will not be carried forward once the two fixes above are ported.

---

## 5. Live Shopping — RECOMMENDATION: phase11's schema/Go-video-service is canonical; port chat-parity's moderation primitives into it

**Compared:** `Jedida-market_com_phase11` (`schema_phase95_live_shopping.sql`,
`services/live-go` — a real Cloudflare Stream Go client) vs.
`jedida-chat-parity-final` (`schema_phase94_live_events.sql` defining
`live_sessions`/`live_participants`/`live_messages`/`live_questions`/
`live_moderation_actions`/`live_muted_users`/`live_banned_users`, plus
`go-services/internal/live`).

| Dimension | phase11 | chat-parity-final |
|---|---|---|
| Video infrastructure | **Real Cloudflare Stream integration** — `internal/cloudflare/{client,live_inputs,recordings}.go`. Stream key returned once at creation, never persisted (correct security practice, matches task §15). | **No Cloudflare code anywhere in `internal/live`.** Its Go layer is a pure WebSocket viewer/room manager (join/leave, capacity) — it assumes video is handled elsewhere or isn't shipped yet. |
| Start/End idempotency | `start_idempotency_key`/`end_idempotency_key` with a unique index — a duplicate "start" tap is a no-op replay | `live_events.idempotency_key` unique index — same protection, different (better-named) table |
| Moderation | Only `live_reports` (a report *queue*) | **`live_moderation_actions`, `live_muted_users`, `live_banned_users`** — real, actionable moderation tables phase11 lacks entirely |
| Participant tracking | Not modeled explicitly | `live_participants` — one row per (session, viewer), accurate distinct-viewer counts and rejoin handling |
| Cost controls | `live_platform_settings` — max duration, max simultaneous lives, recording retention. **Real operational safety controls chat-parity-final has no equivalent for.** | None found |
| Existing-system reuse | Reuses `feature_flags`/`eligible_roles` (no parallel authorization system), reuses `notifications` table | Reuses existing products/orders/cart/checkout/escrow via `live_product_pins.product_id` — **no live-specific checkout**, which is the correct call |

**RECOMMENDATION:** Neither implementation should simply win. phase11 is the only
one that actually delivers what task §15 asks to verify (a real Cloudflare
integration with cost controls) — chat-parity-final's `internal/live` cannot
independently satisfy "Live Shopping" since it has no video backend at all. Adopt
phase11's schema and Cloudflare-backed Go service as the canonical foundation, and
**port chat-parity-final's moderation tables and participant-tracking model into
it** — phase11's `live_reports` alone is not sufficient moderation for a live,
public video feed. This is a genuine combine-don't-duplicate case per the task's
own instruction.

---

## 6. Packaging Evidence — RECOMMENDATION: financial-pos-rebuild's structured version is canonical; add with-chat-changes' chat-message linkage as a nullable column, not a second table

**Compared:** `jedida-financial-pos-rebuild-patches` phase101/107
(`packaging_evidence`, `packaging_evidence_requirements`, `orders.packaging_status`)
vs. `jedida-market-with-chat-changes` (`order_packaging_evidence`).

These are **not duplicates of the same capability** — they solve different problems:

- financial-pos-rebuild's `packaging_evidence` is a **structured, staged workflow**:
  stage + sequence number, configurable per-category minimum photo counts, a
  dedicated `packaging_status` sub-state on `orders`, supersession tracking, and a
  full buyer gallery + seller upload panel.
- with-chat-changes' `order_packaging_evidence` solves one narrow, real problem:
  the platform's chat messages **auto-delete after 24 hours** (an existing rule —
  see §7), so if a seller shares a packaging photo *through chat*, that evidence
  must survive independently of the expiring message that announced it. It reuses
  the existing generic `media_uploads` table (no second upload pipeline) and links
  back to `chat_messages` with `ON DELETE SET NULL` specifically so the permanent
  evidence row is never affected by the message's own deletion sweep.

**RECOMMENDATION:** Adopt financial-pos-rebuild's `packaging_evidence` as the single
canonical table. Add a nullable `source_message_id UUID REFERENCES chat_messages(id)
ON DELETE SET NULL` column to it (financial-pos-rebuild's table currently has no
awareness of chat at all) rather than keeping `order_packaging_evidence` as a
second table — this preserves with-chat-changes' real "evidence outlives the
message" guarantee without a duplicate database record or duplicate API for what
is, once that one column is added, the same permanent evidence row.

---

## 7. Go Real-Time Services — RECOMMENDATION: chat-parity-final's unified module is canonical

**Compared:** `jedida-chat-all-changes.patch` (standalone `go-services/chat`
module, own `go.mod`) vs. `jedida-chat-parity-final/go-services` (one module,
`jedida.com/go-services`, housing `chat`+`live`+`affiliate` with shared
`authtoken`/`database`/`config`).

| Dimension | chat-all-changes | chat-parity-final |
|---|---|---|
| Module structure | Standalone, single-purpose | Unified — chat/live/affiliate share one auth/db/config layer instead of each reimplementing JWT verification and DB connection setup |
| Chat core (hub/client/handlers) | Present, tested (`hub.go`, `message.go`+test, `client.go`, `store.go`) | Present, tested (`hub.go`+test, `client.go`, `handlers.go`, `repository.go`) — equivalent coverage |
| Moderation | None in Go — relies entirely on the existing Node-side moderation (`chat_messages.moderation_status`, the pre-existing "Petiti AI" warning system) | **Duplicates phone-number/contact-info detection in Go** (`moderation.go`, regex-based, tested) — real functionality, but a maintainability risk: if the phone-number pattern is ever updated, there are now two places to update it (Node's existing rule and this Go regex), with no shared source |
| Push notifications | Not present | `push.go` |
| Live + Affiliate services | Not present (chat-only) | Present, sharing the same module |
| Emoji cleanup | Includes some (🛡️ → `<Icon name="shield">` in the chat UI it also touches) | Not evaluated in this pass |

**RECOMMENDATION:** chat-parity-final's unified module subsumes chat-all-changes'
capability set (same hub/client/handler coverage, plus live, affiliate, and push
that chat-all-changes doesn't have) and is the better piece of infrastructure —
adopt it as the single canonical Go service. Two follow-ups, not blockers:

1. **De-duplicate the phone-number moderation rule.** Either have the Go layer
   defer entirely to Node's existing moderation result (simplest, zero drift
   risk) or, if kept for defense-in-depth on the always-on realtime path,
   document explicitly that the pattern is intentionally duplicated and must be
   kept in sync by hand.
2. chat-all-changes' emoji-cleanup work in the chat UI it touches should still be
   picked up during the general emoji-removal pass (task §8), independent of
   which Go module wins.

---

## 8. Migration Collision Repair (Phase G)

Four independent lines of work all claimed `schema_phase94_*`, and several more
collide at 95/96. **Filenames determine execution order** (`migrate.js` runs by
numeric prefix), so this is not cosmetic — it is a real ordering hazard today.

Proposed canonical sequence, reflecting the recommendations above (adopted work
only; superseded/discarded migrations are listed separately and are **not**
renumbered into the sequence):

| New # | File | Source | Depends on |
|---|---|---|---|
| 94 | `schema_phase94_financial_ledger.sql` | financial-pos-rebuild (was phase95, itself renamed from a first-draft 94 — renumbered again here to slot immediately after the real phase93 baseline) | none |
| 95 | `schema_phase95_provider_method_abstraction.sql` | financial-pos-rebuild (was phase96) | 94 |
| 96 | `schema_phase96_financial_control_center.sql` | financial-pos-rebuild (was phase97) | 94, 95 |
| 97 | `schema_phase97_packaging_evidence.sql` | financial-pos-rebuild (was phase101), **plus** the `source_message_id` column from with-chat-changes' `order_packaging_evidence` (§6) | orders, chat_messages |
| 98 | `schema_phase98_pos.sql` | financial-pos-rebuild (was phase98), **plus** phase11's `pos_sale_batches`/`client_sale_uuid` (§4) | 94, 95, 96 |
| 99 | `schema_phase99_wallet.sql` | financial-pos-rebuild (was phase100), **with idempotency fixed to client-supplied keys** (§3) | 94, 95 |
| 100 | `schema_phase100_live_shopping.sql` | phase11 (was phase95_live_shopping), **plus** chat-parity's moderation/participant tables (§5) | feature_flags, notifications |
| 101 | `schema_phase101_chat_retention.sql` | with-chat-changes (was phase95_chat_retention) | chat_messages |
| — | (reconciliation, team-tab, receipts, checkout-frontend phases) | financial-pos-rebuild phases 102–113 | slot in sequence after 99, renumbered contiguously during Phase K |

**Discarded, not renumbered** (superseded per the recommendations above — kept
in this report as a record, not deleted silently):

- This session's `schema_phase94_wallet_deposits_transfers.sql` (superseded by
  the adopted wallet, §3)
- phase11's `schema_phase94_pos.sql` (superseded by financial-pos-rebuild's POS
  schema once the two ports in §4 are applied)
- chat-parity's `schema_phase94_live_events.sql`'s session/chat/participant
  tables are **not** discarded — they're merged into the phase100 live-shopping
  migration per §5. Only the redundant-with-phase11 portions (if any survive
  after that merge) would be dropped.
- profile-rebuild's `schema_phase94_profile_identity_rebuild.sql` and
  chat-parity's `schema_phase95_go_affiliate_engine.sql` /
  `schema_phase96_affiliate_applications.sql` are **not yet compared** — see §10.
  They are left out of the sequence above until that comparison happens, not
  discarded.

---

## 9. Hot File Analysis

- **`ordersController.js`**: touched by (a) this session's wallet-pay branch in
  `createOrder`/`checkoutCart`, (b) financial-pos-rebuild's ledger hook inside
  `applyPaymentConfirmation()`. These **compose cleanly** — (b) adds a
  `postTransaction`/`setOrderFinancialState` call inside the same shared function
  (a) already calls for wallet-paid orders. No conflict once (a)'s payment method
  is repointed at the adopted wallet (§3). One real gap found independent of
  either patch: this session's `confirmCheckoutGroupOrders` (extracted for
  cart-checkout wallet-pay) does **not** call `applyPaymentConfirmation()` — it's
  a pre-existing parallel reimplementation of the same escrow logic for the
  cart-group case — so the ledger hook needs to be added there too for full
  coverage, or cart-paid orders (of any method) won't reach the ledger.
- **`Checkout.jsx` / `CartPage.jsx`**: touched by this session (wallet-pay
  redirect handling) and by `jedida-all-changes-combined.patch` (checkout
  summary/confirmation-fix phases). Not yet diffed against each other line by
  line — flagged for Phase K.
- **Dashboard shell (`JdSidebar`/`JdBottomNav`/`JdDashboardShell`/`roleNav.js`/
  `jd-shell.css`)**: `Jedida-market_com-merged` has independent edits here dated
  before this session's icon additions. Given `main`'s own git log already shows
  *later*, `main`-only work on this shell (admin mobile drawer fix, table-to-cards
  pattern, delivery dashboard wiring — commits not present in `merged`), **`main`
  is ahead here, not behind** — `merged`'s shell edits need to be diffed
  specifically for anything `main` doesn't already have, not adopted wholesale.
  Not yet done — flagged for Phase K.
- **`AdminPartnersPanel.jsx`/`AdminSidebarShell.jsx`/`AdminUsersPanel.jsx`/
  `SecurityOperationsDashboard.jsx`/`DeliveryDashboard.jsx`**: same situation as
  the shell files — `main`'s recent commit history (table-to-cards pattern,
  admin mobile drawer fix) likely already supersedes `merged`'s versions, but
  this needs a real diff, not an assumption, before Phase K touches them.

## 10. Not Yet Compared (genuine remaining work, not silently skipped)

- `0001-wanted-redesign.patch` against `main`'s own Wanted work (phases 87-94,
  already on `main`) — the master task explicitly warned not to apply this
  blindly, and it hasn't been.
- `profile-rebuild-final.zip` against `main`'s current profile pages.
- `Jedida-market_com_updated.zip`'s Wanted CSS/component diffs against the same.
- chat-parity's Go affiliate engine against the **already-existing, working**
  affiliate program on `main` (phase36, `affiliateService.js`, `AffiliatePage.jsx`
  — this session's own `BuyerDashboard.jsx` already integrates with it). This is
  a real, additional conflict discovered during this pass that was not in the
  original 6-area list.

## 11. Business-Policy Questions (the genuine stop-and-ask items)

**1. Should buyers be allowed to withdraw wallet balance to an external
payout method (bank/mobile money), not just hold/spend/transfer it?**
financial-pos-rebuild's wallet patch removes the existing
`primary_role === 'buyer'` withdrawal block, still gated on KYC and still
admin-reviewed. The change is well-reasoned (buyers can now receive refunds
and transfers into the wallet, so blocking them from ever cashing that out
is arguably an oversight) but it is a real product/compliance decision
(payout risk, KYC-for-buyers policy, potential money-transmission
implications) that this report is not making unilaterally.

**2. Should POS and Live Shopping (and, most likely, every other
feature-engine-gated capability) really be ON by default for every
eligible shop, or opt-in?** Verified directly in `featureEngineService.js`:
`getSellerCapabilities()`'s `activated = row.activation_enabled !== false`
means a shop with no `seller_feature_activations` row yet — i.e., every
shop, until an admin or the seller explicitly toggles something — is
treated as activated for any feature its role is eligible for. This is a
real, deliberate backward-compatibility default (documented in both
`POS_IMPLEMENTATION_NOTES.md` and `LIVE_SHOPPING_PHASE1_NOTES.md` by the
person who found it while building against the real code), not a bug, but
it means POS and Live Shopping are live for every eligible seller the
moment this branch ships, with no opt-in step. Changing it would need
either a one-time activation-row backfill (`enabled = false` for existing
shops) or a change to the shared default — which dropshipping/B2B/wholesale
may also depend on, so this is flagged rather than decided here.

**3. Should every existing affiliate be forced to re-apply and get
re-approved, with commissions/payouts held until then?** chat-parity-
final's Go affiliate engine assumes a `schema_phase96_affiliate_applications.sql`
migration that adds exactly this — verified via a hard dependency in
`internal/affiliate/repository.go` on `users.affiliate_status = 'approved'`.
Not adopted in this pass (the affiliate Go binary was excluded entirely —
see the Go services commit) precisely because this is a real behavior
change for every current user, not a technical call.

## 12. Newly-Discovered Scope (not part of the original 6-area comparison)

- **Desktop/mobile native shells.** `DEPLOY.md` and `Jedida-market_com_phase11`
  both reference a `desktop-shell` (Electron) and `mobile-shell` (Capacitor)
  built via `ci/.github/workflows/build-shell.yml`. Not compared against
  `main` at all in this pass — flagged as genuine remaining work, not
  silently skipped.
- **Affiliate system overlap** (chat-parity's Go affiliate engine +
  application workflow vs. the existing, working `main` affiliate program,
  phase36) — not yet compared feature-for-feature. Only the one hard
  schema dependency above has been verified.

Everything else in this document proceeds without waiting on any of the
three business-policy questions above.
