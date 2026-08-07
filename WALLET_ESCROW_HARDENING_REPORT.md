# Task 2 — Wallet Security, Escrow Hardening & Financial Integrity

## Starting point

A prior pass (schema `Phase 26`) had already hardened the core flows:
`walletsController.js` (withdrawals) and the single-item order path in
`ordersController.js` (`confirmPayment`, `releaseFunds`, `adminRefundOrder`)
already used atomic guarded transitions, a `wallet_transactions` audit
ledger, the `funds_released_at` duplicate-release guard, and non-negative
balance constraints. Those were left as-is.

This pass audited every remaining place money moves and hardened the gaps
that were found.

## Vulnerabilities found and fixed

1. **`adminPaymentsController.js` — critical.** The manual mobile-money
   approval flow (`approvePayment` / `rejectPayment`) had no transaction, no
   status guard, and no audit logging. A double-click or retried request
   would credit escrow twice for the same payment. Rewritten with the same
   atomic guarded-transition pattern used elsewhere, plus
   `wallet_transactions` / `escrow_ledger` entries and notifications.

2. **`confirmCartPayment`** looped over orders with unguarded individual
   queries — a race between two requests for the same checkout group could
   double-credit escrow. Rewritten as one guarded transaction per order.

3. **`cancelOrder`** used separate unguarded statements — a race could
   double-refund, or a crash mid-sequence could leave a half-refunded
   order. Rewritten atomically with the escrow balance-check guard and full
   audit logging (previously missing entirely for this path).

4. **`submitManualPayment`** had no ownership check — any authenticated
   user could submit or overwrite payment proof on someone else's order —
   and no guard against resubmitting an already-processed payment. Both
   fixed.

5. **`checkoutCart` / `createOrder`** had no row locking on the stock check
   (an overselling race) and no protection against a double-tapped checkout
   button creating duplicate pending orders. Added `SELECT ... FOR UPDATE`
   locking and a short-window dedupe guard that hands back the in-flight
   order/checkout group instead of creating a second one.

## New: escrow auto-release after the protection period

The task requires escrow to release "after delivery confirmation **or**
the protection period expires" — only the delivery-confirmation path
existed. Added:

- `schema_phase27.sql` — `platform_settings.escrow_protection_days`
  (default 7, admin-configurable) and `orders.protection_period_ends_at`,
  set at the moment payment is confirmed by any of the three payment paths.
- `autoReleaseExpiredEscrow()` in `ordersController.js` — the same guarded,
  audit-logged payout logic as `releaseFunds` (extracted into a shared
  `payOutClaimedOrder` helper so there is exactly one code path that can
  move this money), applied in bulk to orders whose protection period has
  lapsed. Disputed orders are explicitly excluded — those always need a
  human decision.
- Wired at `POST /api/orders/escrow/auto-release` (admin-triggered), and
  run automatically every hour by a scheduler in `server.js`
  (`ESCROW_AUTO_RELEASE_DISABLED=true` to turn it off,
  `ESCROW_AUTO_RELEASE_INTERVAL_MS` to change the interval).
- Admin UI: a "Run sweep now" control and the previously-computed-but-
  never-shown withdrawal `flagged_reason` suspicious-activity badge were
  added to `AdminWithdrawalsPanel.jsx`.

## What was already solid (left unchanged)

- Withdrawal request/hold/review flow (`walletsController.js`) — atomic
  balance hold, single-use review guard, suspicious-amount flagging.
- Single-item `confirmPayment`, `releaseFunds`, `adminRefundOrder` — atomic
  guards, non-negative escrow checks, full audit trail.
- `wallets_balance_nonnegative` / `wallets_pending_withdrawal_nonnegative`
  DB constraints — defense in depth against negative balances regardless
  of application-level bugs.
- No endpoint anywhere allows a direct, unlogged edit of a wallet balance
  — every mutation found goes through a guarded, logged transaction.
- Wallet dashboard UI already separates Available / Pending Release
  (escrow) / Pending Withdrawal with a fintech-style card layout, an
  activity chart, and a transaction timeline.

## Files changed

- `backend/src/controllers/adminPaymentsController.js` (rewritten)
- `backend/src/controllers/ordersController.js` (`createOrder`,
  `confirmPayment`, `confirmCartPayment`, `cancelOrder`, `checkoutCart`,
  `submitManualPayment`, `releaseFunds` refactor, new
  `autoReleaseExpiredEscrow`)
- `backend/src/routes/orders.js` (new route)
- `backend/src/server.js` (scheduler)
- `backend/src/config/schema_phase27.sql` (new migration)
- `frontend/src/pages/admin/AdminWithdrawalsPanel.jsx` (sweep control +
  flagged-reason badge)

## Not done / recommended next

- A seller-side clawback for funds already released before a dispute
  surfaces (noted as a known gap in the existing `adminRefundOrder`
  comments — out of scope for this pass, but worth a dedicated design).
- Automated tests for the new atomic paths (concurrent-request race tests
  in particular) — the guards are structurally sound (single guarded
  `UPDATE ... WHERE status = X` per state transition) but weren't covered
  by a test suite in this repo to extend.
