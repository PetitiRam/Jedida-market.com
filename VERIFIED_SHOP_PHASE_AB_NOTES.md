# Verified Shop System — Phase A + B (JedidaMarket_VerifiedShop_PhaseAB.zip)

## What changed
- `schema_phase59_verified_shops.sql` — new `shops.is_verified`/`verified_since`/
  `verification_mode` (+override) columns, `shop_trust_metrics`, `shop_verification_events`,
  admin-tunable `verified_shop_settings` thresholds, new notification types.
- `backend/src/services/trustEngineService.js` — the Jedida Trust Engine: computes
  completed-order count (excluding cancelled/refunded/fraud-flagged), real vs. suspicious
  follower count, reliability/delivery/quality/satisfaction/response/fraud sub-scores,
  weighted trust score, and business-profile/KYC/payment completeness — then grants,
  maintains, or revokes the badge automatically. Admin overrides (force-verify /
  force-block / back to auto) always win over the engine.
- `verifiedShopController.js` + routes — seller status endpoint (`GET /shops/me/verification`)
  and admin endpoints (`GET/POST /admin/verified-shops...`: list, per-shop detail + history,
  override, recompute one, recompute all).
- A recompute sweep is registered in `server.js` (same pattern as the escrow/agri sweeps),
  default every 6h, so revocation is caught even without anyone visiting that shop.
- Badge now flows through real data everywhere it's read: shop profile, search results,
  product detail, seller/shop cards, and the buyer's order list.
- **Found and fixed 3 places that were already rendering a "verified" badge off nothing
  real** — `ProductCard.jsx` and `ShopCard.jsx` both treated `shop.status === 'active'`
  as "verified" (i.e. every live shop), and `SupplierCard.jsx`/`TrustBadges.jsx` read a
  `specs.verified_supplier` flag nothing ever set. All three now read the real engine output.
- New `AdminVerifiedShopsPanel.jsx` (Admin Panel → 🛡️ Verified Shops tab) and
  `SellerVerificationStatus.jsx` (Seller Dashboard → ✅ Verification tab).

## Left untouched on purpose
- `business_profiles.verification_level` (the old manual tiered badge) — this is a separate
  B2B wholesale-trust concept other features already depend on, not the thing described
  as "shop verification" in the request. Not removed.

## Known gaps / definitions chosen (flagging for visibility)
- "Valid payment information" = at least one `withdrawal_requests` row with status
  approved/paid for that seller (proof of a working payout destination) — there's no
  separate stored payout-profile table in this schema.
- Bot-follower detection is a simple heuristic (new account + zero orders ever). Real
  bot/fake-engagement/fake-review/fraud-risk detection is explicitly deferred to the
  AI Protection phase (Phase C).
- Response-speed score is derived from `product_questions.answered_at` (the admin-relayed
  Q&A), the only already-tracked seller-response-time signal in this codebase.

## Not built yet (by your choice — later phases)
Phase C (AI Protection), Phase D (Verified Shop Feed), Phase E (Growth Benefits:
priority search ranking beyond featured-shops ordering, analytics dashboard, AI Sales
Growth Manager, marketing tools).
