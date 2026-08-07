import crypto from 'crypto';
import { query, withTransaction } from '../config/db.js';

function badRequest(message) {
  const err = new Error(message);
  err.code = 'BAD_REQUEST';
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.code = 'FORBIDDEN';
  return err;
}

const SANDBOX_RESOURCE_TYPES = [
  'business', 'product', 'order', 'payment', 'wallet', 'delivery',
  'receipt', 'invoice', 'property', 'agriculture_listing',
  'manufacturer', 'supplier', 'customer', 'chat', 'notification', 'ai',
];

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

// A caller acts either as a solo developer or on behalf of one of their
// active organizations. This resolves { developerId, orgId } (exactly one
// set) from the request and confirms the caller is allowed to act as it —
// same ownership model as api_keys/oauth_applications/sandbox_resources.
async function resolveOwner(developerProfile, orgId) {
  if (!orgId) return { developerId: developerProfile.id, orgId: null };

  const membership = (developerProfile.organizations || []).find((o) => o.id === orgId);
  if (!membership) throw forbidden('You are not an active member of that organization.');
  if (!['owner', 'administrator', 'devops_engineer', 'backend_developer'].includes(membership.role)) {
    throw forbidden('Your role in that organization cannot manage API keys or apps.');
  }
  return { developerId: null, orgId };
}

function ownerFilterClause(alias = '') {
  const col = (c) => (alias ? `${alias}.${c}` : c);
  return `(${col('developer_id')} = $1 OR ${col('org_id')} = ANY($2::uuid[]))`;
}

async function ownedOrgIds(developerProfile) {
  return (developerProfile.organizations || []).map((o) => o.id);
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------
export async function listApiKeys(developerProfile) {
  const orgIds = await ownedOrgIds(developerProfile);
  const { rows } = await query(
    `SELECT id, name, environment, key_prefix, scopes, status, last_used_at,
            developer_id, org_id, revoked_at, created_at
       FROM developer_api_keys
      WHERE ${ownerFilterClause()}
      ORDER BY created_at DESC`,
    [developerProfile.id, orgIds]
  );
  return rows;
}

export async function createApiKey(developerProfile, { name, environment, scopes, orgId }) {
  if (!name) throw badRequest('A key name is required.');
  const env = environment === 'production' ? 'production' : 'sandbox';
  const owner = await resolveOwner(developerProfile, orgId || null);

  if (env === 'production' && developerProfile.status !== 'approved') {
    throw forbidden('Production keys require an approved developer profile. Use a sandbox key until then.');
  }

  const prefix = `jd_${env === 'production' ? 'live' : 'test'}_${crypto.randomBytes(4).toString('hex')}`;
  const secret = crypto.randomBytes(24).toString('hex');
  const fullKey = `${prefix}_${secret}`;

  const { rows } = await query(
    `INSERT INTO developer_api_keys (developer_id, org_id, name, environment, key_prefix, key_hash, scopes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, name, environment, key_prefix, scopes, status, created_at`,
    [owner.developerId, owner.orgId, name, env, prefix, hashSecret(fullKey), scopes || [], developerProfile.id]
  );

  // fullKey is returned exactly once — the hash is all that's ever stored.
  return { ...rows[0], key: fullKey };
}

export async function revokeApiKey(developerProfile, keyId, reason) {
  const orgIds = await ownedOrgIds(developerProfile);
  // $1/$2 feed ownerFilterClause() (developer_id = $1 OR org_id = ANY($2));
  // $3/$4 are the key id and revoke reason, numbered after the filter args
  // so ownerFilterClause() itself never needs to change if reused elsewhere.
  const { rows } = await query(
    `UPDATE developer_api_keys
        SET status = 'revoked', revoked_at = now(), revoked_reason = $4
      WHERE id = $3 AND ${ownerFilterClause()}
      RETURNING id, status, revoked_at`,
    [developerProfile.id, orgIds, keyId, reason || null]
  );
  if (!rows[0]) throw badRequest('API key not found, or you do not have access to it.');
  return rows[0];
}

// ---------------------------------------------------------------------------
// OAuth Applications
// ---------------------------------------------------------------------------
export async function listOAuthApps(developerProfile) {
  const orgIds = await ownedOrgIds(developerProfile);
  const { rows } = await query(
    `SELECT id, name, description, client_id, redirect_uris, scopes, status, developer_id, org_id, created_at
       FROM developer_oauth_applications
      WHERE ${ownerFilterClause()}
      ORDER BY created_at DESC`,
    [developerProfile.id, orgIds]
  );
  return rows;
}

export async function createOAuthApp(developerProfile, { name, description, redirectUris, scopes, orgId }) {
  if (!name) throw badRequest('An application name is required.');
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw badRequest('At least one redirect URI is required.');
  }
  for (const uri of redirectUris) {
    if (!/^https?:\/\//.test(uri)) throw badRequest(`Invalid redirect URI: ${uri}`);
  }
  const owner = await resolveOwner(developerProfile, orgId || null);

  const clientId = `jedida_client_${crypto.randomBytes(10).toString('hex')}`;
  const clientSecret = crypto.randomBytes(32).toString('hex');

  const { rows } = await query(
    `INSERT INTO developer_oauth_applications
       (developer_id, org_id, name, description, client_id, client_secret_hash, redirect_uris, scopes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name, description, client_id, redirect_uris, scopes, status, created_at`,
    [owner.developerId, owner.orgId, name, description || null, clientId, hashSecret(clientSecret),
      redirectUris, scopes || [], developerProfile.id]
  );

  return { ...rows[0], clientSecret };
}

export async function suspendOAuthApp(developerProfile, appId) {
  const orgIds = await ownedOrgIds(developerProfile);
  // Same numbering convention as revokeApiKey: $1/$2 are ownerFilterClause()'s
  // developer_id/org_id args, $3 is the app id.
  const { rows } = await query(
    `UPDATE developer_oauth_applications
        SET status = 'suspended', updated_at = now()
      WHERE id = $3 AND ${ownerFilterClause()}
      RETURNING id, status`,
    [developerProfile.id, orgIds, appId]
  );
  if (!rows[0]) throw badRequest('OAuth application not found, or you do not have access to it.');
  return rows[0];
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------
export async function listSandboxResources(developerProfile, resourceType) {
  const orgIds = await ownedOrgIds(developerProfile);
  const params = [developerProfile.id, orgIds];
  let where = ownerFilterClause();
  if (resourceType) {
    if (!SANDBOX_RESOURCE_TYPES.includes(resourceType)) throw badRequest('Unknown sandbox resource type.');
    params.push(resourceType);
    where += ` AND resource_type = $3`;
  }
  const { rows } = await query(
    `SELECT * FROM developer_sandbox_resources WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return rows;
}

export async function createSandboxResource(developerProfile, { resourceType, data, orgId }) {
  if (!SANDBOX_RESOURCE_TYPES.includes(resourceType)) throw badRequest('Unknown sandbox resource type.');
  const owner = await resolveOwner(developerProfile, orgId || null);
  const { rows } = await query(
    `INSERT INTO developer_sandbox_resources (developer_id, org_id, resource_type, data)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [owner.developerId, owner.orgId, resourceType, data || {}]
  );
  return rows[0];
}

export async function resetSandbox(developerProfile, orgId) {
  const owner = await resolveOwner(developerProfile, orgId || null);
  const { rowCount } = await query(
    `DELETE FROM developer_sandbox_resources
      WHERE (developer_id = $1 AND $1 IS NOT NULL) OR (org_id = $2 AND $2 IS NOT NULL)`,
    [owner.developerId, owner.orgId]
  );
  return { deleted: rowCount };
}

export const RESOURCE_TYPES = SANDBOX_RESOURCE_TYPES;
