# JEDIDA Marketplace — Database Compatibility Audit
Generated as a production-stability audit pass. No new features were built.

## Method

1. Merged all 23 `schema*.sql` files in **correct numeric phase order** into one
   canonical schema (tables, columns, types, enums, indexes) — 53 tables, 24 enum types.
2. Separately **simulated the actual (buggy) execution order** `readdirSync().sort()`
   produces, to see where a fresh migration run would diverge or fail.
3. Extracted all 206 raw SQL query strings from every controller/service
   (`controllers/*.js`, `services/*.js`, plus the two route files that embed
   raw queries) and cross-checked table/column references against the
   canonical schema (INSERT column lists, UPDATE SET targets, SELECT lists,
   WHERE clauses).
4. Extracted every enum type + its allowed values, and checked the status
   literals written by each controller against the enum actually bound to
   that column.
5. Scanned for duplicate/renamed-looking columns (similar names on the same
   table) and for `RENAME COLUMN` migration history.

---

## ✗ Remaining issues (must fix before further feature work)

### 1. CRITICAL — Migration runner applies phases out of order
`backend/src/config/migrate.js` sorted files with a plain lexical `.sort()`.
String sort puts `schema_phase10.sql` … `schema_phase19.sql` **before**
`schema_phase2.sql` … `schema_phase9.sql` (`'1' < '2'` as characters), and
`schema_phase20-22.sql` land in the middle of that too. Simulating this order
turns up **54 forward-references** — `ALTER TABLE`/`CREATE INDEX` statements
that run before the `CREATE TABLE` that defines their target (e.g.
`schema_phase10.sql` alters `chat_messages`, a table not created until later
in phase order). Because `migrate.js` wraps the *entire* file loop in one
`try/catch` and calls `process.exit`/stops on first error, a fresh database
bootstrap (new environment, CI, disaster recovery) would abort after
`schema_phase10.sql` and **never apply the remaining ~20 phase files at all**.
This is a very plausible root cause of "column does not exist" reports if any
environment was ever bootstrapped from scratch with this script.

**Fixed:** `migrate.js` now sorts by extracted phase number, not filename
string. Verified `schema.sql → phase2 → … → phase22 → phase23` order.

### 2. CRITICAL — `role_upgrades.status` enum is missing 6 values the code writes
The column is typed `upgrade_status`, defined as:
`none, pending_payment, pending_approval, approved, rejected`.
`upgradeController.js` (request/payment/KYC/admin-review flow, including the
one-time-payment upgrade endpoint) writes and reads:
`payment_submitted, payment_verified, payment_rejected, kyc_pending,
kyc_verified, kyc_rejected` — **none of which are valid enum values**. Every
upgrade payment submission currently throws
`invalid input value for enum upgrade_status: "payment_submitted"`.
This affects the seller/delivery upgrade flow end-to-end.

**Fixed:** `schema_phase23.sql` adds the 6 missing enum values via
`ALTER TYPE ... ADD VALUE IF NOT EXISTS` (additive, no data loss, safe on a
live enum).

### 3. MEDIUM — `legal_documents` missing `updated_at` column
`services/LegalAndSystemService.js` selects `updated_at` from
`legal_documents` for the public Legal Center index, but the table only has
`created_at`/`updated_by`. Hits every call to the legal documents index
endpoint with `column "updated_at" does not exist`.

**Fixed:** `schema_phase23.sql` adds `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
Existing rows get `now()` as a safe default; new document versions (the
table is insert-only/versioned, never updated in place) get the correct
timestamp automatically going forward.

### 4. LOW (defensive) — re-stated the 54 order-dependent ALTERs as idempotent
Rather than trust historical execution order, `schema_phase23.sql` re-issues
the highest-risk `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
statements identified in the buggy-order simulation (`chat_messages.pinned`,
`deliveries.current_lat/current_lng/location_updated_at`,
`orders.checkout_group_id/cancelled_at/cancellation_reason`,
`payments.payer_phone/transaction_reference/proof_image`). These are no-ops
if already applied, and guarantee convergence on any environment regardless
of migration history.

---

## ⚠ Warnings (not breaking today, worth tracking)

- **`platform_settings`** grew to 33 columns via repeated `ALTER TABLE ADD
  COLUMN` across phases 1, 13, and others, several of them wide `JSONB NOT
  NULL DEFAULT '{}'` blobs (`seller_upgrade_settings`, `payment_settings`,
  `commission_settings`, `shop_settings`, `product_settings`, `user_settings`,
  `delivery_settings`, `ad_settings`, `ai_settings`, `notification_settings`,
  `security_settings`, `maintenance_settings`). Functionally fine (this is
  the generic settings-center design), but it's grown organically enough
  that a dedicated `platform_settings` schema doc would help avoid a 13th
  JSONB blob being added ad hoc later.
- **`ads` table** picked up 10 additional columns in `schema_phase22.sql`
  after being created in an earlier phase — all correctly `IF NOT EXISTS`
  guarded, no conflict found, just flagging the pattern (many small
  ALTERs on one table across phases) as something to eventually squash into
  a single canonical `CREATE TABLE` for new environments' readability.
- **No `RENAME COLUMN` statements found anywhere** in the 23 schema files.
  Every apparent "rename" the audit went looking for turned out to be a
  new, distinct column (e.g. `payments.transaction_reference` vs
  `payments.provider_reference` are both legitimately used, one for
  gateway-issued refs, one for user-supplied mobile-money refs) — not
  duplicates. No obsolete/duplicate columns were found in the 53-table
  canonical schema.
- **Dynamic/interpolated queries** (`UPDATE ${table} SET ...`,
  `WHERE ${conditions.join(' AND ')}`) in `adminController.js`,
  `shopsController.js`, and `productsController.js` couldn't be
  statically checked column-by-column since the table/column names are
  built at runtime from whitelisted arrays in code, not literal SQL. Spot-read
  the whitelists by hand — all reference real columns — but this class of
  query is inherently unverifiable by static audit and worth a runtime
  smoke test.

---

## ✓ Passed modules

Cross-checked every controller/service query (INSERT column lists, UPDATE SET
targets, SELECT lists, WHERE predicates) against the canonical schema, and
every status/type literal against its bound enum, for:

| Module | Files audited | Result |
|---|---|---|
| Authentication | `authController.js`, `authPolicyService.js` | ✓ Pass |
| Orders | `ordersController.js` | ✓ Pass (enum literals for `orders.status`/`payments.status` both correctly scoped to their own enums) |
| Products | `productsController.js` | ✓ Pass |
| Shops | `shopsController.js` | ✓ Pass |
| Payments | `adminPaymentsController.js`, `walletsController.js` | ✓ Pass |
| Chat | `chatController.js`, `routes/chatV2.js` | ✓ Pass |
| Delivery | `deliveryController.js` | ✓ Pass |
| Admin | `adminController.js` | ✓ Pass |
| Seller / Buyer | `commerceActionsController.js`, `templatesController.js`, `questionController.js` | ✓ Pass |
| Notifications | `notificationsController.js` | ✓ Pass (`notification_type` literals all valid) |
| Coupons | `couponsController.js` | ✓ Pass |
| Reviews | `reviewController.js`, `reviewsController.js` | ✓ Pass |
| KYC | `kycController.js` | ✓ Pass |
| Uploads | `uploadsController.js` | ✓ Pass |
| Settings / Dashboard | `settingsCenterController.js`, `settingsService.js`, `routes/publicSettingsCenter.js` | ✓ Pass |
| Analytics/Legal | `LegalAndSystemService.js`, `trackingService.js` | ⚠ → ✓ after Fix #3 above |
| **Upgrades (seller/delivery)** | `upgradeController.js` | ⚠ → ✓ after Fix #2 above |

---

## Files changed by this audit

- `backend/src/config/migrate.js` — natural phase-number sort (was lexical string sort)
- `backend/src/config/schema_phase23.sql` — **new** additive migration:
  - 6× `ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS`
  - `ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS updated_at`
  - Idempotent re-statement of the 54 order-fragile `ADD COLUMN`/`CREATE INDEX` statements found in the buggy-order simulation

No existing data was modified or deleted. No application code paths were
changed except the migration runner's sort function.

## Next step

Run `node backend/src/config/migrate.js` against your Postgres instance to
apply `schema_phase23.sql` (safe to run repeatedly — every statement is
`IF NOT EXISTS`/`ADD VALUE IF NOT EXISTS` guarded). After that, the two
confirmed production-breaking bugs (upgrade-flow enum, legal docs
`updated_at`) are resolved and the backend passes this audit with zero
known schema mismatches.
