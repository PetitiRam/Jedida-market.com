# Schema Merge Report — JedidaMarket_updated vs. JedidaMarket_merged-schema

## What happened

Two independent AI-assisted sessions both ran the same kind of audit
(controllers/services vs. live schema) starting from the same phase 1-11
baseline, and both wrote fixes for phases 12-18 — but picked different
phase numbers for different fixes, so the two `schema_phase12.sql` ...
`schema_phase18.sql` files no longer agree with each other file-for-file.

**They are not in conflict.** Every `CREATE TABLE`, `ALTER TABLE ... ADD
COLUMN`, `ALTER TYPE ... ADD VALUE`, and `CREATE INDEX` in the uploaded
`merged-schema` branch already exists in the working project's schema —
just under a different phase number. Verified programmatically: parsing
both branches' final column/table/enum state and diffing them found zero
tables, columns, or enum values present in one branch and missing from
the other.

## Reconciliation table

| Fix | Working project (canonical) | Uploaded branch |
|---|---|---|
| ChatV2 (`chat_conversations`, `chat_bridges`, conversation-linked `chat_messages` columns) | phase 8 | phase 12 |
| `users.preferred_language` + `chat_messages.translations` | phase 9 | phase 13 |
| Delivery live GPS (`deliveries.current_lat/lng`, `location_updated_at`) | phase 12 | phase 14 |
| Settings Center (`platform_settings` identity/branding columns, `settings_audit_log`, `legal_documents`, `system_backups`, section JSONB defaults) | phase 13 | phase 15 |
| Granular admin roles (`users.admin_role`, `admin_assignments.role`) | phase 14 | phase 16 |
| `role_upgrade_events` audit trail | phase 15 | phase 17 |
| Reviews/Q&A (`product_reviews`, `review_helpful_votes`, `product_questions`) + Shop Settings columns | phase 16 | *(not present — only up to phase 18 in upload, this content lands inside its phase 12 comment block instead — same statements, confirmed identical)* |
| `pending_registrations`, `cart_items`, `product_wishlists`, `shop_follows`, `quote_requests`, `coupons`, `orders.checkout_group_id`, manual mobile-money payment columns | phase 17 | *(covered by upload's phase 17/18 in different split)* |
| `payment_method` enum: `mtn_mobile_money`, `airtel_money` | phase 17 (tail) | phase 18 |
| `orders.cancelled_at`, `orders.cancellation_reason` | phase 18 | *(not present in upload — upload instead has the `coupons` unique-index hardening, see below)* |
| `coupons` unique index on `COALESCE(shop_id::text,'platform'), code` instead of a plain `UNIQUE(shop_id, code)` | phase 17 (created correctly from the start, no separate fix needed) | phase 18 (`DROP INDEX`/`DROP CONSTRAINT IF EXISTS` + recreate) |

The only genuinely distinct statements in the uploaded branch are the two
`DROP INDEX IF EXISTS` / `DROP CONSTRAINT IF EXISTS` guards in its phase
18 — both no-ops against the working project, because its `coupons`
table (phase 17) was created with the correct `COALESCE`-based unique
index from the start and never had the broken plain `UNIQUE(shop_id,
code)` constraint to drop.

## Resolution

- **Canonical history kept:** the working project's existing
  `schema_phase1.sql` … `schema_phase19.sql` (phase 19 is the
  `users.username` / `users.is_verified` audit fix from the prior audit
  pass). This is what the running database and the rest of this
  conversation's fixes are built against.
- **Uploaded branch's `schema_phase12.sql`–`schema_phase18.sql`:** not
  merged in as additional migration files. Every statement in them is
  either already present under a different phase number, or a
  guarded/idempotent no-op (`IF NOT EXISTS`, `IF EXISTS`) against the
  canonical history. Adding them as extra files would re-run already-applied
  changes and leave two same-named-but-different `phase12`…`phase18`
  files in the repo's history, which is worse for future maintainers than
  leaving them out.
- **No new migration was required.** The schemas are semantically
  equivalent end states; nothing needs to be added, renamed, or dropped
  to reconcile them.

## Verification method

1. Parsed both branches' cumulative `CREATE TABLE` / `ALTER TABLE ADD
   COLUMN` / `ALTER TYPE ADD VALUE` / `CREATE INDEX` statements into a
   table → column-set and enum → value-set model.
2. Diffed the uploaded branch's resulting state against the working
   project's full state (through phase 19).
3. Result: 0 tables, 0 columns, 0 enum values present in the uploaded
   branch and absent from the canonical schema.

If a future migration branch needs to be merged and the diff comes back
non-empty, the missing pieces should be appended as a new
`schema_phaseN.sql` (next available number) using `ADD COLUMN IF NOT
EXISTS` / `CREATE TABLE IF NOT EXISTS` — never by renumbering or editing
an already-applied phase file.
