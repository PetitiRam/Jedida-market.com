import { query, withTransaction } from '../config/db.js';

const REQUIRED_AGREEMENTS = ['developer_agreement', 'marketplace_policies', 'api_terms', 'privacy_policy'];

function badRequest(message) {
  const err = new Error(message);
  err.code = 'BAD_REQUEST';
  return err;
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------------------------------------------------------------------------
// Developer profile
// ---------------------------------------------------------------------------
export async function getMyDeveloperProfile(userId) {
  const { rows } = await query(
    `SELECT d.*, u.email, u.full_name AS account_full_name
       FROM developers d
       JOIN users u ON u.id = d.user_id
      WHERE d.user_id = $1`,
    [userId]
  );
  if (!rows[0]) return null;

  const orgRows = await query(
    `SELECT o.id, o.name, o.slug, o.logo_url, o.verified_badge, o.status, m.role
       FROM developer_org_members m
       JOIN developer_organizations o ON o.id = m.org_id
      WHERE m.developer_id = $1 AND m.status = 'active'`,
    [rows[0].id]
  );

  return { ...rows[0], organizations: orgRows.rows };
}

export async function registerDeveloper(userId, payload) {
  const existing = await query('SELECT id FROM developers WHERE user_id = $1', [userId]);
  if (existing.rows[0]) throw badRequest('You already have a developer application on file.');

  const {
    developerName, organizationName, country, developerCategory, website, githubUrl, portfolioUrl,
    primaryLanguages, techStack, yearsExperience, businessCategory, applicationDescription,
    expectedApiUsage, agreements,
  } = payload;

  if (!developerName || !country || !developerCategory || !applicationDescription) {
    throw badRequest('Developer name, country, category and application description are required.');
  }
  const acceptedTypes = new Set(Object.keys(agreements || {}).filter((k) => agreements[k] === true));
  const missing = REQUIRED_AGREEMENTS.filter((a) => !acceptedTypes.has(a));
  if (missing.length) {
    throw badRequest(`You must accept all required agreements before applying: ${missing.join(', ')}.`);
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO developers (
         user_id, developer_name, organization_name, country, developer_category, website,
         github_url, portfolio_url, primary_languages, tech_stack, years_experience,
         business_category, application_description, expected_api_usage
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        userId, developerName, organizationName || null, country, developerCategory, website || null,
        githubUrl || null, portfolioUrl || null, primaryLanguages || [], techStack || [],
        yearsExperience || null, businessCategory || null, applicationDescription, expectedApiUsage || null,
      ]
    );
    const developer = rows[0];

    for (const type of REQUIRED_AGREEMENTS) {
      await client.query(
        `INSERT INTO developer_agreement_acceptances (developer_id, agreement_type) VALUES ($1, $2)`,
        [developer.id, type]
      );
    }
    return developer;
  });
}

// ---------------------------------------------------------------------------
// API catalog (read-only reference data)
// ---------------------------------------------------------------------------
export async function listApiCatalog() {
  const { rows } = await query('SELECT * FROM developer_api_catalog ORDER BY sort_order ASC');
  return rows;
}

// ---------------------------------------------------------------------------
// Developer organizations
// ---------------------------------------------------------------------------
export async function createOrganization(developerId, { name, description, website }) {
  if (!name) throw badRequest('Organization name is required.');
  const baseSlug = slugify(name);
  if (!baseSlug) throw badRequest('Organization name must contain at least one letter or number.');

  return withTransaction(async (client) => {
    let slug = baseSlug;
    let attempt = 1;
    // Slugs must be unique; append -2, -3, ... on collision rather than failing outright.
    while (true) {
      const clash = await client.query('SELECT id FROM developer_organizations WHERE slug = $1', [slug]);
      if (!clash.rows[0]) break;
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const { rows } = await client.query(
      `INSERT INTO developer_organizations (name, slug, description, website, owner_developer_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, slug, description || null, website || null, developerId]
    );
    const org = rows[0];

    await client.query(
      `INSERT INTO developer_org_members (org_id, developer_id, role, status)
       VALUES ($1,$2,'owner','active')`,
      [org.id, developerId]
    );
    return org;
  });
}

export async function listMyOrganizations(developerId) {
  const { rows } = await query(
    `SELECT o.*, m.role
       FROM developer_org_members m
       JOIN developer_organizations o ON o.id = m.org_id
      WHERE m.developer_id = $1 AND m.status = 'active'
      ORDER BY o.created_at DESC`,
    [developerId]
  );
  return rows;
}

export async function inviteMember(orgId, inviterDeveloperId, { email, role }) {
  const membership = await query(
    `SELECT role FROM developer_org_members WHERE org_id = $1 AND developer_id = $2 AND status = 'active'`,
    [orgId, inviterDeveloperId]
  );
  const inviterRole = membership.rows[0]?.role;
  if (!inviterRole || !['owner', 'administrator'].includes(inviterRole)) {
    const err = new Error('Only an organization owner or administrator can invite members.');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const invitee = await query(
    `SELECT d.id FROM developers d JOIN users u ON u.id = d.user_id WHERE u.email = $1`,
    [email]
  );
  if (!invitee.rows[0]) {
    throw badRequest('That email has no developer profile yet — they need to register as a developer first.');
  }

  const { rows } = await query(
    `INSERT INTO developer_org_members (org_id, developer_id, role, invited_by, status)
     VALUES ($1,$2,$3,$4,'invited')
     ON CONFLICT (org_id, developer_id) DO UPDATE SET role = EXCLUDED.role, status = 'invited'
     RETURNING *`,
    [orgId, invitee.rows[0].id, role || 'viewer', inviterDeveloperId]
  );
  return rows[0];
}

export async function listMembers(orgId) {
  const { rows } = await query(
    `SELECT m.id, m.role, m.status, m.created_at, dv.developer_name, u.email
       FROM developer_org_members m
       JOIN developers dv ON dv.id = m.developer_id
       JOIN users u ON u.id = dv.user_id
      WHERE m.org_id = $1
      ORDER BY m.created_at ASC`,
    [orgId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Admin review queue
// ---------------------------------------------------------------------------
export async function adminListDevelopers({ status } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT d.*, u.email
       FROM developers d
       JOIN users u ON u.id = d.user_id
       ${where}
      ORDER BY d.created_at DESC`,
    params
  );
  return rows;
}

export async function adminReviewDeveloper(developerId, adminUserId, { decision, rejectionReason }) {
  if (!['approved', 'rejected', 'suspended'].includes(decision)) {
    throw badRequest("Decision must be 'approved', 'rejected' or 'suspended'.");
  }
  const { rows } = await query(
    `UPDATE developers
        SET status = $1, reviewed_by = $2, reviewed_at = now(), rejection_reason = $3, updated_at = now()
      WHERE id = $4
      RETURNING *`,
    [decision, adminUserId, decision === 'rejected' ? (rejectionReason || null) : null, developerId]
  );
  if (!rows[0]) {
    const err = new Error('Developer application not found.');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  return rows[0];
}

export async function adminListOrganizations({ status } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT o.*, d.developer_name AS owner_name
       FROM developer_organizations o
       JOIN developers d ON d.id = o.owner_developer_id
       ${where}
      ORDER BY o.created_at DESC`,
    params
  );
  return rows;
}

export async function adminReviewOrganization(orgId, { decision, verifiedBadge }) {
  if (!['approved', 'rejected', 'suspended'].includes(decision)) {
    throw badRequest("Decision must be 'approved', 'rejected' or 'suspended'.");
  }
  const { rows } = await query(
    `UPDATE developer_organizations
        SET status = $1, verified_badge = COALESCE($2, verified_badge), updated_at = now()
      WHERE id = $3
      RETURNING *`,
    [decision, typeof verifiedBadge === 'boolean' ? verifiedBadge : null, orgId]
  );
  if (!rows[0]) {
    const err = new Error('Organization not found.');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  return rows[0];
}
