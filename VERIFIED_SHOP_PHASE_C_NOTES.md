# Verified Shop System — Phase C: AI Protection (JedidaMarket_VerifiedShop_PhaseC.zip)

Builds on JedidaMarket_VerifiedShop_PhaseAB.zip (Phase A trust engine + badge, Phase B
admin management) — everything from that delivery is unchanged except where noted.

## What changed
- `schema_phase60_ai_protection.sql` — new `suspicious_order_pattern` fraud_flags type,
  `ai_flagged`/`ai_flag_reason` on product_reviews/shop_reviews, `ai_suspicious` on
  shop_follows, new `shop_risk_signals` table, admin-tunable `ai_protection_settings`.
- `backend/src/services/aiProtectionService.js` — rule-based (not ML) detectors:
  - **Fake followers**: burst-follow-rate detection (many follows in one short window),
    plus per-row tagging of the new-account+never-ordered heuristic Phase A already
    aggregates.
  - **Fake reviews**: flags individual reviews with no matching completed order, and
    raises a shop-level signal for review bursts dominated by first-and-only-review accounts.
  - **Suspicious orders**: written into the existing `fraud_flags` table (so they appear
    in the admin Fraud & Disputes screen that already existed) — one buyer accounting for
    a disproportionate share of a shop's orders, and orders "delivered" implausibly fast.
  - **Quality decline monitoring**: compares a verified shop's trust score/fraud risk
    before and after each recompute and raises a warning on a sharp drop, even if the
    shop still clears the verification bar that cycle.
  - **Seller recommendations**: plain-language, rule-based tips from the weakest sub-scores.
- `trustEngineService.js` gained `runFullTrustAndProtectionSweep()`, which wraps the
  Phase A/B grant/revoke sweep and hooks quality-decline monitoring into it via an
  `onEvaluated` callback, then runs the follower/review/order scans. `server.js`'s
  existing sweep timer now calls this instead of the trust engine alone — same schedule,
  no new cron job.
- New admin endpoints under `/admin/risk-signals` (list/resolve) and
  `/admin/verified-shops/:shopId/rescan-protection` (on-demand rescan).
- `GET /shops/me/verification` now also returns `recommendations` (the AI tips).
- Frontend: Admin Verified Shops panel gained a "⚠️ AI Risk Signals" sub-tab (queue with
  acknowledge/dismiss) and a "Rescan" button in the shop detail modal; Seller Verification
  tab gained a "💡 AI suggestions to improve your shop" card.

## Design choices worth knowing
- Everything here is deterministic/statistical, not a trained model — every threshold is
  in `ai_protection_settings` and every check is documented in the service file. This is
  intentional per the brief: it's the "recommend improvements" / "detect ... patterns"
  layer sitting on top of Phase A's data, not a black box.
- Suspicious-order detections reuse the existing `fraud_flags` admin queue rather than a
  new screen, since that queue and its review workflow already exist and are user-scoped
  (fits orders better than the shop-scoped `shop_risk_signals` table).
- Signals have a 7-day cooldown per shop+type so the sweep doesn't spam duplicate warnings
  every cycle for a still-unresolved issue.

## Not built yet (later phases)
Phase D (Verified Shop Feed), Phase E (Growth Benefits: priority ranking beyond the
existing featured-shops ordering, analytics dashboard, AI Sales Growth Manager, marketing
tools).
