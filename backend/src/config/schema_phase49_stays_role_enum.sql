-- Split out from schema_phase50_stays_foundation.sql: ALTER TYPE ... ADD
-- VALUE cannot be used by DDL (e.g. a CHECK constraint) in the same
-- transaction that adds it. migrate.js runs each *file* as one query =
-- one implicit transaction, so this has to be its own file, not just
-- earlier in the same file.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'host';
ALTER TYPE business_type ADD VALUE IF NOT EXISTS 'host';
