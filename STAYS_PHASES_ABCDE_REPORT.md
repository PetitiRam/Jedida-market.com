# Jedida Stays — Delivery Report (Phases A–E)

## Phase E — Trust Engine Badges + Verified-Stay Reviews (this update)

**Backend** — `schema_phase54_stays_trust_reviews.sql`
- `stays_reviews` — mirrors `shop_reviews`/`product_reviews` (one review
  per completed transaction, optional business reply) but with the
  spec's six rating categories (Cleanliness, Comfort, Location,
  Communication, Value, Amenities) instead of one star rating.
  `booking_id UNIQUE` is what enforces "verified stays only" — a
  review can only exist against a real, completed booking, one each.
- `stays_properties` gained `avg_rating`, `reviews_count`,
  `manual_badges` (admin-curated only), `trust_badges` (cached
  union of auto-computed + manual, what the frontend actually reads)
- `stays_host_profiles` — the host-level counterpart to
  `business_profiles.verification_level` (phase43), holding rating
  rollups and admin-assignable Premium Host / Super Responsive tiers
- `services/staysTrustService.js` — `recomputePropertyTrust` /
  `recomputeHostTrust`, called after every review or reply. Auto badges
  (Verified Property from `verification_status`, Business Ready from
  owner type, Top Rated Stay / Clean & Safe from rating thresholds
  with a 3-review minimum) are always recalculated fresh; manual ones
  (Luxury Stay, Family Friendly, Premium Host, Super Responsive) are
  admin toggles that recompute never overwrites
- `staysReviewController.js`: guest review eligibility check + submit,
  public review list, host reply, host's cross-property review list,
  public host trust profile, admin badge toggle endpoints

**Frontend**
- `TrustBadges.jsx` — badge chips, shown on `PropertyDetail.jsx` (full)
  and `StaysHome.jsx` cards (top 2, plus the star rating)
- `ReviewsList.jsx` on `PropertyDetail.jsx` — public reviews with host
  replies
- `ReviewForm.jsx` — appears on `GuestBookings.jsx` only for a
  completed, not-yet-reviewed stay (checks eligibility first)
- `HostReviews.jsx` (`/host/reviews`, new `HostNav` tab) — host's
  reviews across all properties, with an inline reply box

### Deliberately not built here
"Verified Host" is currently just "does this user hold the `host`
role" — a real identity/ownership verification workflow (and the
admin queue to run it) is Phase F's Property Operations Division, same
place the Phase B payment-expiry sweep landed. "Super Responsive" is
an admin toggle for now, not measured from actual chat response times,
since that would mean instrumenting the general chat system rather
than something Stays-specific. No dedicated admin UI was built for the
badge-toggle endpoints — consistent with holding all admin tooling for
Phase F.

---

## Phase D — Polished Host + Guest Dashboards

**Backend** — `schema_phase53_stays_dashboards.sql`
- `stays_saved_properties` — a guest wishlist for properties. The
  existing `product_wishlists` (phase17) is FK'd to `products` and
  can't reference `stays_properties`, so this is its own small table
  rather than a schema change to the products wishlist.
- `staysDashboardController.js`, added to the `/api/stays` router:
  - `GET /host/overview` — active/pending/paused property counts,
    upcoming check-ins (next 7 days), bookings awaiting payment
    verification, completed stays ready for payout, revenue this
    month (summed straight from `wallet_transactions`, no separate
    ledger)
  - `GET /guest/overview` — next trip, upcoming/awaiting-payment/
    completed trip counts, saved-properties count
  - `POST /saved/:propertyId/toggle`, `GET /saved`

**Frontend — restructured navigation**
- `/host` is now the **Overview** landing (stats + action items +
  upcoming check-ins); the property list moved to `/host/properties`
- `/guest` is a new **Overview** landing (next trip + stats); trips
  stayed at `/guest/bookings`, new `/guest/saved` for saved properties
- `HostNav.jsx` / `GuestNav.jsx` — shared tab bars (Overview / Properties
  / Reservations, and Overview / My Trips / Saved) added to every
  Stays dashboard page for consistent navigation
- Heart/save toggle added to `StaysHome.jsx` cards and
  `PropertyDetail.jsx`
- `UserMenu.jsx`: account dropdown now includes **"My Trips (Jedida
  Stays)"** for everyone, and a host's primary dashboard link now
  correctly points at `/host` instead of falling through to "Become a
  Seller"

### Deliberately not duplicated here
Messages, notifications, and receipts/invoices are the platform's
existing chat, notification, and documents systems — Phase D links
out to them rather than rebuilding parallel Stays-specific copies.
Reviews/Trust Score badges are Phase E; Staff/Cleaning/Maintenance
schedules are Phase F territory (Property Operations); AI Assistant
widgets are Phase G.

### Known limitation
The save/heart button on `PropertyDetail.jsx` always starts unfilled
on page load — there's no "is this already saved" check on that
single-property view yet, so a guest won't see their saved state
reflected until they toggle it. The `/guest/saved` list itself is
always accurate.

---

## Phase C — Digital Stay Pass (this update)

**Backend** — `schema_phase52_stays_pass.sql`
- `stays_stay_passes` (one per booking, snapshotted guest/host/property
  details, HMAC digital signature, status: valid/expired/revoked) and
  `stays_pass_shares` (time-boxed, revocable share links)
- Reuses `services/documentNumberService.js` (added `stays_pass: 'STP'`
  to its prefix map — pass numbers come from the same atomic per-year
  sequence documents use) and its `generateVerificationCode()`
- New `services/staysPassService.js`: HMAC-SHA256 digital signature,
  expiry calculation (check-out + 24h grace for the pass itself; the
  spec's hourly/daily/weekend/weekly/custom "Expiration Engine" applies
  to **share links**, since that's where a caller actually wants a
  short-lived window), and a PDFKit-rendered pass (same on-demand
  streaming approach as `services/pdfService.js`) with its own QR code
  pointed at `/verify-stay/:code` — deliberately a separate code space
  and QR target from the existing document-verification system, since
  a Stay Pass isn't a financial document
- `staysPassController.js`, wired into the same `/api/stays` router:
  - Pass auto-issues inside `adminConfirmBookingPayment`'s transaction
    the moment a booking is confirmed — never a separate manual step
  - Auto-revokes if a confirmed booking is later cancelled/refunded
  - `GET /bookings/:id/pass`, `GET /bookings/:id/pass/pdf` (guest/host/admin)
  - `POST /passes/:id/share`, `GET /passes/:id/shares`,
    `PATCH /passes/:id/shares/:shareId/revoke` (guest-only)
  - Public, no-auth verification: `GET /verify/:code` and
    `GET /verify/share/:token` — returns only property/guest/host/dates/
    status, **never** payment or booking financial details
  - `PATCH /admin/passes/:id/revoke` for Trust & Safety

**Frontend**
- `StayPassCard.jsx` — view pass details, download the PDF (fetched as
  an authenticated blob, since the PDF endpoint needs the bearer token
  a plain `<a href>` can't send), create/revoke share links
- Wired into `GuestBookings.jsx` for any confirmed/completed booking
- `VerifyStayPass.jsx` (`/verify-stay/:code`, `/verify-stay/share/:token`)
  — the public landing page a QR scan or shared link opens

---

## Phase B — Booking + Payments Engine (this update)

**Backend** — `schema_phase51_stays_bookings.sql`
- `stays_bookings` (date range, guest/host, nightly subtotal, cleaning fee,
  special-offer discount, platform fee, total, status) and
  `stays_booking_payments` (manual mobile-money submission — method,
  transaction reference, proof image, status)
- Reuses `wallets` / `wallet_transactions` directly for escrow, payout,
  and refund — no new wallet tables
- Reuses `services/paymentProviders.js` `ADAPTERS` (MTN/Airtel manual
  mobile money) unchanged
- `staysBookingController.js` + routes on the same `/api/stays` router:
  - `POST /properties/:id/bookings` — creates a booking, row-locks the
    date range against double-booking, resolves pricing via the same
    `resolvePropertyNights` helper the availability calendar uses,
    applies an active special offer, provisionally blocks the dates
  - `POST /bookings/:id/submit-payment` — guest submits mobile-money
    proof
  - `GET /my-bookings` (guest), `GET /host/bookings` (host)
  - `PATCH /bookings/:id/cancel` — guest/host/admin cancel; a
    **confirmed** booking is refunded from escrow back to the guest
  - `PATCH /bookings/:id/complete` — host or admin, only after
    check-out has passed, releases escrow to the host wallet minus the
    platform fee (reused from `platform_settings`), credits the
    platform wallet
  - Admin: `GET /admin/bookings/pending-payments`,
    `PATCH /admin/bookings/:id/confirm-payment` (moves paid funds into
    escrow), `PATCH /admin/bookings/:id/reject-payment` (releases the
    held dates back to availability)

**Frontend**
- `PropertyDetail.jsx` now has a live booking widget: pick dates/guests,
  request to book, then submit mobile-money payment proof
- `GuestBookings.jsx` (`/guest/bookings`) — trip list with cancel
- `HostBookings.jsx` (`/host/bookings`) — reservations list with
  "Mark Completed & Release Payout" once check-out has passed

### Known limitation
A `pending_payment` booking blocks its dates immediately so two guests
can't double-book while one is mid-payment, but there's no automatic
expiry sweep yet if a guest never pays — an admin can reject the
payment (or a host can ask to cancel) to release the dates. An
automatic timeout is a good candidate for Phase F's operational
tooling.

---

Scope: property listings, media gallery, availability calendar, and
seasonal/weekend/holiday pricing + special offers, fully integrated into
the existing Jedida platform (no separate app, no duplicated systems).

## What's included

**Database** — `backend/src/config/schema_phase50_stays_foundation.sql`
- New `host` role + `host` business_type (mirrors how farmer/manufacturer/
  supplier were added — additive only, nothing existing altered)
- `stays_properties`, `stays_property_media`, `stays_availability`,
  `stays_pricing_rules`, `stays_special_offers`
- Reuses `listing_status`, `account_status`, `business_profiles`, and the
  existing generic `POST /api/uploads` (Cloudinary) endpoint rather than
  building a second upload pipeline

**Backend**
- `backend/src/controllers/staysController.js` + `backend/src/routes/stays.js`,
  mounted at `/api/stays` in `server.js`
- Public: search/browse, property detail, availability read
- Host: property CRUD, media (add/delete/reorder/set cover), availability
  write, pricing rules, special offers
- Admin: lightweight pending-review queue (`GET /api/stays/admin/pending`,
  `PATCH /api/stays/admin/properties/:id/review`) — the full Property
  Operations Division with dedicated roles/fraud tooling is Phase F
- `upgradeController.js`: `host` added to `BUSINESS_ROLES` and given the
  same lighter "payment-verified only" approval gate as farmer/dropshipper,
  so an individual owner isn't blocked waiting on business documents

**Frontend**
- `pages/stays/StaysHome.jsx` — public browse/search (`/stays`)
- `pages/stays/PropertyDetail.jsx` — public listing page (`/stays/:id`)
- `pages/stays/host/HostDashboard.jsx` — host's property list (`/host`)
- `pages/stays/host/PropertyEditor.jsx` — tabbed editor: Basics, Media,
  Calendar & Pricing, Special Offers (`/host/properties/new`,
  `/host/properties/:id`)
- `UpgradePage.jsx` — new "Jedida Stays Host" option, reusing the existing
  upgrade wizard (`/host/upgrade`)
- `MarketplaceHeader.jsx` — new "🏡 Stays" link in the secondary nav

## Deliberately deferred to later phases
- Booking engine, dates/guests search availability enforcement, Wallet
  payment/escrow integration — **Phase B**
- Digital Stay Pass (QR verification, expiry, secure sharing) — **Phase C**
- Polished Guest dashboard (trips, saved properties, wishlist) — **Phase D**
- Stays-specific Trust Engine badges, verified-stay reviews — **Phase E**
- Property Operations Division (dedicated admin roles, staff management,
  deep identity/ownership/document verification, fraud & dispute
  handling) — **Phase F**
- AI description/pricing/guest-Q&A assistance — **Phase G**
- Analytics dashboards, PMS/hotel-system APIs — **Phase H**

## Notes
- A property's `status` starts at `pending_review`; only an admin
  approval (or the lightweight admin endpoints above) moves it to
  `active` and visible in public search. Editing a live listing sends it
  back to `pending_review`, same behavior as product listings.
- The availability calendar is intentionally sparse: a date with no row
  is treated as available at `base_price`, so new listings don't need
  bulk pre-inserted calendar rows.
- No `npm install` / build was run in this delivery (no network access in
  this environment) — new files were syntax-checked with `node --check`
  (backend) and a bracket-balance pass (frontend JSX); a local
  `npm run build` is recommended before deploying.
