import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { pool, query } from '../config/db.js';
import { DOC_TYPES, LEGAL_DOCS } from '../config/legalDocs.js';

const execFileAsync = promisify(execFile);

export { DOC_TYPES, LEGAL_DOCS };

export async function getLegalDocument(docType) {
  if (!DOC_TYPES.includes(docType)) throw new Error('Unknown legal document type.');
  const result = await query(
    'SELECT * FROM legal_documents WHERE doc_type = $1 AND is_current = TRUE ORDER BY version DESC LIMIT 1',
    [docType]
  );
  return result.rows[0] || { doc_type: docType, content_md: '', version: 0 };
}

export async function getAllLegalDocuments() {
  const docs = await Promise.all(DOC_TYPES.map((t) => getLegalDocument(t)));
  return docs;
}

// Public Legal Center index — title/category/version/updated_at only, no
// content_md, so the index page stays light even with 50 documents.
export async function getLegalDocumentsMeta() {
  const result = await query(
    `SELECT doc_type, version, updated_at FROM legal_documents WHERE is_current = TRUE`
  );
  const byType = new Map(result.rows.map((r) => [r.doc_type, r]));
  return LEGAL_DOCS.map((d) => ({
    docType: d.docType,
    title: d.title,
    category: d.category,
    version: byType.get(d.docType)?.version || 0,
    updatedAt: byType.get(d.docType)?.updated_at || null
  }));
}

// Every edit creates a new version row rather than overwriting — full
// history is preserved for compliance/audit purposes.
export async function updateLegalDocument(docType, contentMd, adminUserId) {
  if (!DOC_TYPES.includes(docType)) throw new Error('Unknown legal document type.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT version FROM legal_documents WHERE doc_type = $1 AND is_current = TRUE',
      [docType]
    );
    const nextVersion = (current.rows[0]?.version || 0) + 1;

    await client.query('UPDATE legal_documents SET is_current = FALSE WHERE doc_type = $1 AND is_current = TRUE', [docType]);

    const result = await client.query(
      `INSERT INTO legal_documents (doc_type, content_md, version, updated_by, is_current)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [docType, contentMd, nextVersion, adminUserId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ===== About System (read-only, computed live) =====
export async function getSystemInfo() {
  const dbVersionResult = await query('SHOW server_version');
  const uptimeSeconds = process.uptime();

  let storageUsage = null;
  try {
    const dbSizeResult = await query(
      `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
    );
    storageUsage = dbSizeResult.rows[0].size;
  } catch {
    storageUsage = 'unavailable';
  }

  return {
    applicationVersion: process.env.npm_package_version || '1.0.0',
    databaseVersion: dbVersionResult.rows[0].server_version,
    apiVersion: 'v1',
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    serverUptimeSeconds: Math.floor(uptimeSeconds),
    storageUsage
  };
}

// ===== Backup & Maintenance =====
// Real pg_dump-based backup — requires `pg_dump` to be on the server's PATH
// (standard on any host with PostgreSQL client tools installed, which
// Railway/Render/most VPS Postgres setups provide). Writes a timestamped
// .sql file to BACKUP_DIR (default ./backups) and logs the action.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

export async function createBackup(adminUserId) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const filename = `jedida-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const filePath = path.join(BACKUP_DIR, filename);

  try {
    await execFileAsync('pg_dump', [
      '-h', process.env.PGHOST, '-p', String(process.env.PGPORT || 5432),
      '-U', process.env.PGUSER, '-d', process.env.PGDATABASE,
      '-f', filePath, '--no-owner', '--no-privileges'
    ], {
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD }
    });

    await query(
      `INSERT INTO system_backups (triggered_by, action, file_path, status) VALUES ($1,'backup',$2,'completed')`,
      [adminUserId, filePath]
    );
    return { filePath, filename };
  } catch (err) {
    await query(
      `INSERT INTO system_backups (triggered_by, action, status, notes) VALUES ($1,'backup','failed',$2)`,
      [adminUserId, err.message]
    );
    throw new Error(`Backup failed: ${err.message}. Ensure pg_dump is installed on this server.`);
  }
}

export async function listBackups() {
  const result = await query('SELECT * FROM system_backups ORDER BY created_at DESC LIMIT 50');
  return result.rows;
}

export async function restoreBackup(filePath, adminUserId) {
  if (!fs.existsSync(filePath)) throw new Error('Backup file not found on this server.');

  try {
    await execFileAsync('psql', [
      '-h', process.env.PGHOST, '-p', String(process.env.PGPORT || 5432),
      '-U', process.env.PGUSER, '-d', process.env.PGDATABASE,
      '-f', filePath
    ], {
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD }
    });

    await query(
      `INSERT INTO system_backups (triggered_by, action, file_path, status) VALUES ($1,'restore',$2,'completed')`,
      [adminUserId, filePath]
    );
    return { restored: true };
  } catch (err) {
    await query(
      `INSERT INTO system_backups (triggered_by, action, file_path, status, notes) VALUES ($1,'restore',$2,'failed',$3)`,
      [adminUserId, filePath, err.message]
    );
    throw new Error(`Restore failed: ${err.message}`);
  }
}

export async function getMaintenanceMode() {
  const result = await query(`SELECT maintenance_settings FROM platform_settings WHERE id = 1`);
  return result.rows[0]?.maintenance_settings || { maintenanceMode: false, maintenanceMessage: '' };
}
