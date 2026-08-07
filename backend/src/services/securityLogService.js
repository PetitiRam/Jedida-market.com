import { query } from '../config/db.js';

// Single write path for platform_security_log (schema_phase43). Never
// throws — a logging failure must never block the action it's describing.
// Callers pass an optional `client` (pg PoolClient) to log inside an
// existing transaction; otherwise it uses a standalone connection.
export async function logSecurityEvent(client, { actorId, actorRole, eventType, entityType, entityId, metadata = {} }) {
  try {
    const runner = client || { query };
    await runner.query(
      `INSERT INTO platform_security_log (actor_id, actor_role, event_type, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorId || null, actorRole || null, eventType, entityType, entityId || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Security log error:', err);
  }
}
