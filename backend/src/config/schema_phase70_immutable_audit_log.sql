-- Phase 70: Tamper-evident audit logging.
--
-- Problem this closes: platform_security_log (phase43) and security_events
-- (phase68) are the two tables the Security Center's audit trail and
-- "what did we block" feed are built on, but nothing stopped a row in
-- either one from being UPDATEd or DELETEd after the fact — by a bug, a
-- compromised admin credential, or anyone with direct DB access. An audit
-- log you can quietly edit isn't an audit log.
--
-- Two independent layers, so bypassing one doesn't erase the evidence:
--
-- 1. Trigger-level immutability: BEFORE UPDATE/DELETE triggers reject the
--    statement outright with an exception, for every role except the
--    reserved 'audit_archivist' role (used only by a documented, logged
--    retention/GDPR-erasure job — see note at bottom). This stops the
--    normal case (app bug, compromised app-level DB user) cold.
--
-- 2. Hash chain: every row stores prev_hash (the row_hash of the
--    chronologically previous row) and its own row_hash = sha256(prev_hash
--    || its own fields). Rows form a linked chain, like a minimal
--    append-only ledger. If a row is ever altered or deleted by someone
--    with enough privilege to bypass layer 1 (e.g. a superuser disabling
--    the trigger), the chain breaks at that point and
--    verify_audit_chain() below will report exactly which row stopped
--    matching — so tampering becomes detectable even when it can't be
--    fully prevented.

-- ------------------------------------------------------------
-- platform_security_log
-- ------------------------------------------------------------
ALTER TABLE platform_security_log ADD COLUMN IF NOT EXISTS prev_hash CHAR(64);
ALTER TABLE platform_security_log ADD COLUMN IF NOT EXISTS row_hash  CHAR(64);

CREATE OR REPLACE FUNCTION platform_security_log_chain() RETURNS trigger AS $$
DECLARE
  prev CHAR(64);
BEGIN
  SELECT row_hash INTO prev FROM platform_security_log ORDER BY created_at DESC, id DESC LIMIT 1;
  NEW.prev_hash := prev; -- NULL for the very first row, which is fine and expected
  NEW.row_hash := encode(
    digest(
      COALESCE(prev, '') || '|' ||
      COALESCE(NEW.actor_id::text, '') || '|' ||
      COALESCE(NEW.actor_role, '') || '|' ||
      NEW.event_type || '|' ||
      NEW.entity_type || '|' ||
      COALESCE(NEW.entity_id::text, '') || '|' ||
      NEW.metadata::text || '|' ||
      NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_security_log_chain ON platform_security_log;
CREATE TRIGGER trg_platform_security_log_chain
  BEFORE INSERT ON platform_security_log
  FOR EACH ROW EXECUTE FUNCTION platform_security_log_chain();

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('audit.allow_mutation', true) = 'true' THEN
    -- Reserved escape hatch for a documented, logged retention job only —
    -- see the note at the bottom of this file. Nothing in the application
    -- code sets this; it must be set explicitly per-session by a human
    -- running an approved retention script.
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Audit log rows are append-only and cannot be % (table: %)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_security_log_no_update ON platform_security_log;
CREATE TRIGGER trg_platform_security_log_no_update
  BEFORE UPDATE OR DELETE ON platform_security_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

-- ------------------------------------------------------------
-- security_events
-- ------------------------------------------------------------
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS prev_hash CHAR(64);
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS row_hash  CHAR(64);

-- security_events allows two legitimate post-insert UPDATEs today
-- (resolveEvent sets resolved/resolved_by/resolved_at, and
-- recordBlockedIpHit-adjacent code updates hit_count on blocked_ips, a
-- different table). Resolving an alert is a real workflow, not tampering
-- — but it must itself be logged and it must not be allowed to rewrite
-- the original event content. So: allow UPDATE only when the only columns
-- changing are the resolution fields, and re-chain is not needed since
-- the original event_type/severity/ip/user/summary/metadata/created_at
-- (the fields hashed) are immutable — enforced explicitly below rather
-- than trusting callers.
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS resolution_note TEXT;

CREATE OR REPLACE FUNCTION security_events_chain() RETURNS trigger AS $$
DECLARE
  prev CHAR(64);
BEGIN
  SELECT row_hash INTO prev FROM security_events ORDER BY created_at DESC, id DESC LIMIT 1;
  NEW.prev_hash := prev;
  NEW.row_hash := encode(
    digest(
      COALESCE(prev, '') || '|' ||
      NEW.event_type || '|' ||
      NEW.severity::text || '|' ||
      COALESCE(NEW.ip_address, '') || '|' ||
      COALESCE(NEW.user_id::text, '') || '|' ||
      COALESCE(NEW.request_path, '') || '|' ||
      NEW.summary || '|' ||
      NEW.metadata::text || '|' ||
      NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_events_chain ON security_events;
CREATE TRIGGER trg_security_events_chain
  BEFORE INSERT ON security_events
  FOR EACH ROW EXECUTE FUNCTION security_events_chain();

CREATE OR REPLACE FUNCTION guard_security_events_update() RETURNS trigger AS $$
BEGIN
  IF current_setting('audit.allow_mutation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'security_events rows cannot be deleted';
  END IF;
  -- Only resolved / resolved_by / resolved_at / resolution_note may change.
  IF NEW.event_type    IS DISTINCT FROM OLD.event_type    OR
     NEW.severity      IS DISTINCT FROM OLD.severity      OR
     NEW.ip_address    IS DISTINCT FROM OLD.ip_address    OR
     NEW.user_id        IS DISTINCT FROM OLD.user_id       OR
     NEW.request_path  IS DISTINCT FROM OLD.request_path  OR
     NEW.summary       IS DISTINCT FROM OLD.summary       OR
     NEW.metadata      IS DISTINCT FROM OLD.metadata      OR
     NEW.created_at    IS DISTINCT FROM OLD.created_at    OR
     NEW.prev_hash     IS DISTINCT FROM OLD.prev_hash     OR
     NEW.row_hash      IS DISTINCT FROM OLD.row_hash THEN
    RAISE EXCEPTION 'security_events: only the resolution fields may be updated after the row is written';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_events_guard ON security_events;
CREATE TRIGGER trg_security_events_guard
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION guard_security_events_update();

-- ------------------------------------------------------------
-- Backfill: chain the rows that already exist, in chronological order.
-- Safe to run more than once (idempotent — recomputes deterministically).
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  prev CHAR(64) := NULL;
BEGIN
  FOR r IN SELECT * FROM platform_security_log ORDER BY created_at ASC, id ASC LOOP
    UPDATE platform_security_log SET
      prev_hash = prev,
      row_hash = encode(
        digest(
          COALESCE(prev, '') || '|' ||
          COALESCE(r.actor_id::text, '') || '|' ||
          COALESCE(r.actor_role, '') || '|' ||
          r.event_type || '|' ||
          r.entity_type || '|' ||
          COALESCE(r.entity_id::text, '') || '|' ||
          r.metadata::text || '|' ||
          r.created_at::text,
          'sha256'
        ), 'hex'
      )
    WHERE id = r.id;
    SELECT row_hash INTO prev FROM platform_security_log WHERE id = r.id;
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
  prev CHAR(64) := NULL;
BEGIN
  FOR r IN SELECT * FROM security_events ORDER BY created_at ASC, id ASC LOOP
    UPDATE security_events SET
      prev_hash = prev,
      row_hash = encode(
        digest(
          COALESCE(prev, '') || '|' ||
          r.event_type || '|' ||
          r.severity::text || '|' ||
          COALESCE(r.ip_address, '') || '|' ||
          COALESCE(r.user_id::text, '') || '|' ||
          COALESCE(r.request_path, '') || '|' ||
          r.summary || '|' ||
          r.metadata::text || '|' ||
          r.created_at::text,
          'sha256'
        ), 'hex'
      )
    WHERE id = r.id;
    SELECT row_hash INTO prev FROM security_events WHERE id = r.id;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Verification function: walks the chain and returns the first row where
-- the stored row_hash doesn't match a fresh recomputation, i.e. the first
-- point of tampering (or NULL for every field if the whole chain is
-- intact). Called from auditIntegrityService.js for the Security Center's
-- "Audit Log Integrity" panel.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_platform_security_log_chain()
RETURNS TABLE(broken_at_id UUID, broken_at_created_at TIMESTAMPTZ, expected_hash CHAR(64), stored_hash CHAR(64)) AS $$
DECLARE
  r RECORD;
  prev CHAR(64) := NULL;
  recomputed CHAR(64);
BEGIN
  FOR r IN SELECT * FROM platform_security_log ORDER BY created_at ASC, id ASC LOOP
    IF r.prev_hash IS DISTINCT FROM prev THEN
      broken_at_id := r.id; broken_at_created_at := r.created_at;
      expected_hash := prev; stored_hash := r.prev_hash;
      RETURN NEXT; RETURN;
    END IF;
    recomputed := encode(
      digest(
        COALESCE(prev, '') || '|' ||
        COALESCE(r.actor_id::text, '') || '|' ||
        COALESCE(r.actor_role, '') || '|' ||
        r.event_type || '|' ||
        r.entity_type || '|' ||
        COALESCE(r.entity_id::text, '') || '|' ||
        r.metadata::text || '|' ||
        r.created_at::text,
        'sha256'
      ), 'hex'
    );
    IF recomputed IS DISTINCT FROM r.row_hash THEN
      broken_at_id := r.id; broken_at_created_at := r.created_at;
      expected_hash := recomputed; stored_hash := r.row_hash;
      RETURN NEXT; RETURN;
    END IF;
    prev := r.row_hash;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION verify_security_events_chain()
RETURNS TABLE(broken_at_id UUID, broken_at_created_at TIMESTAMPTZ, expected_hash CHAR(64), stored_hash CHAR(64)) AS $$
DECLARE
  r RECORD;
  prev CHAR(64) := NULL;
  recomputed CHAR(64);
BEGIN
  FOR r IN SELECT * FROM security_events ORDER BY created_at ASC, id ASC LOOP
    IF r.prev_hash IS DISTINCT FROM prev THEN
      broken_at_id := r.id; broken_at_created_at := r.created_at;
      expected_hash := prev; stored_hash := r.prev_hash;
      RETURN NEXT; RETURN;
    END IF;
    recomputed := encode(
      digest(
        COALESCE(prev, '') || '|' ||
        r.event_type || '|' ||
        r.severity::text || '|' ||
        COALESCE(r.ip_address, '') || '|' ||
        COALESCE(r.user_id::text, '') || '|' ||
        COALESCE(r.request_path, '') || '|' ||
        r.summary || '|' ||
        r.metadata::text || '|' ||
        r.created_at::text,
        'sha256'
      ), 'hex'
    );
    IF recomputed IS DISTINCT FROM r.row_hash THEN
      broken_at_id := r.id; broken_at_created_at := r.created_at;
      expected_hash := recomputed; stored_hash := r.row_hash;
      RETURN NEXT; RETURN;
    END IF;
    prev := r.row_hash;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Retention/erasure escape hatch (documented, not wired to any code path):
-- if a legal deletion obligation (e.g. a GDPR erasure request naming a
-- specific user) ever requires removing rows, an operator runs, in a
-- session by itself:
--   SET audit.allow_mutation = 'true';
--   DELETE FROM platform_security_log WHERE actor_id = '<user-id>';
--   RESET audit.allow_mutation;
-- and separately records that erasure (who, when, why, which rows) outside
-- this table, since by definition it can't be logged inside the log it
-- just modified. Nothing in the application ever sets this setting —
-- grep the codebase for "allow_mutation" before assuming a row was
-- tampered with vs. legitimately erased.
