import { query } from '../config/db.js';

// Backs the Security Center's "Audit Log Integrity" panel. Calls the
// SQL-side chain verification functions added in schema_phase70 — the
// recomputation happens in Postgres (same place the hashes are written),
// so this is checking the database's own arithmetic, not re-trusting the
// app layer. A non-null result means the chain broke at that row: either
// tampering, or a documented retention erasure (see the note at the
// bottom of schema_phase70_immutable_audit_log.sql) — this function can't
// tell those apart, it can only tell you where to look.
export async function verifyAuditChain(tableName) {
  const fn = tableName === 'security_events'
    ? 'verify_security_events_chain'
    : 'verify_platform_security_log_chain';
  const { rows } = await query(`SELECT * FROM ${fn}()`);
  const broken = rows[0];
  if (!broken || !broken.broken_at_id) {
    return { table: tableName, intact: true };
  }
  return {
    table: tableName,
    intact: false,
    brokenAtId: broken.broken_at_id,
    brokenAtCreatedAt: broken.broken_at_created_at,
  };
}

export async function verifyAllAuditChains() {
  const [logChain, eventsChain] = await Promise.all([
    verifyAuditChain('platform_security_log'),
    verifyAuditChain('security_events'),
  ]);
  return {
    intact: logChain.intact && eventsChain.intact,
    chains: [logChain, eventsChain],
  };
}
