import { query } from '../config/db.js';

// Record a security event to the audit log
export async function recordSecurityEvent({
  eventType,
  severity,
  userId = null,
  ipAddress = null,
  summary = '',
  metadata = {}
}) {
  try {
    // Only log if we have at least a type and summary
    if (!eventType || !summary) {
      console.warn('recordSecurityEvent called with missing required fields:', { eventType, summary });
      return;
    }

    await query(
      `INSERT INTO security_events (event_type, severity, user_id, ip_address, summary, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [eventType, severity, userId, ipAddress, summary, JSON.stringify(metadata)]
    );
  } catch (err) {
    // Don't let audit logging failures crash the application
    console.error('Failed to record security event:', err.message);
  }
}

export async function recordUploadAudit({
  userId = null,
  ipAddress = null,
  fileName = null,
  fileSize = null,
  mimeType = null,
  status = 'unknown',
  rejectionReason = null
}) {
  try {
    await query(
      `INSERT INTO media_upload_audit (user_id, ip_address, file_name, file_size, mime_type, status, rejection_reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [userId, ipAddress, fileName, fileSize, mimeType, status, rejectionReason]
    );
  } catch (err) {
    console.error('Failed to record upload audit:', err.message);
  }
}
