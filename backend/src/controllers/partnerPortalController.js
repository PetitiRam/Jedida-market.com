import crypto from 'crypto';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { query, pool } from '../config/db.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUpload, validateUploadAny } from '../services/uploadSecurity.js';

const SENSITIVE_FIELDS = ['company_name', 'registration_number', 'business_email', 'physical_address', 'country'];
const NON_SENSITIVE_FIELDS = ['website'];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function logPortalAction(applicationId, actorId, action, details = {}, req = null) {
  await query(
    `INSERT INTO partner_portal_audit_log (application_id, actor_id, actor_role, action, details, ip_address)
     VALUES ($1,$2,'partner',$3,$4,$5)`,
    [applicationId, actorId, action, details, req?.ip || null]
  );
}

async function notifyPartner(applicationId, title, body, type = 'partner_update') {
  const app = await query('SELECT partner_user_id FROM partner_applications WHERE id = $1', [applicationId]);
  const partnerUserId = app.rows[0]?.partner_user_id;
  if (!partnerUserId) return;
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [partnerUserId, type, title, body, { applicationId }]
  );
}

// Every portal route needs the caller's own application row. A partner
// account maps 1:1 to exactly one partner_applications row (the one that
// created it at approval time), so this is the single lookup every
// handler below starts from.
async function loadOwnApplication(req, res) {
  const result = await query('SELECT * FROM partner_applications WHERE partner_user_id = $1', [req.user.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'No partnership is linked to this account.' });
    return null;
  }
  return result.rows[0];
}

function isActivePartnership(application) {
  return application.status === 'approved';
}

// ===== Dashboard =====
export async function getDashboard(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;

  const [keysResult, webhooksResult, ticketsResult, notificationsResult, activityResult] = await Promise.all([
    query(`SELECT status FROM partner_api_keys WHERE application_id = $1`, [application.id]),
    query(`SELECT status FROM partner_webhooks WHERE application_id = $1`, [application.id]),
    query(`SELECT status FROM partner_support_tickets WHERE application_id = $1`, [application.id]),
    query(`SELECT id, type, title, body, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 6`, [req.user.id]),
    query(`SELECT action, details, created_at FROM partner_portal_audit_log WHERE application_id = $1 ORDER BY created_at DESC LIMIT 10`, [application.id])
  ]);

  const activeKeys = keysResult.rows.filter((k) => k.status === 'active').length;
  const activeWebhooks = webhooksResult.rows.filter((w) => w.status === 'active').length;
  const openTickets = ticketsResult.rows.filter((t) => ['open', 'pending'].includes(t.status)).length;

  res.json({
    partnership: {
      status: application.status,
      referenceCode: application.reference_code,
      companyName: application.company_name,
      partnerType: application.partner_type,
      approvedAt: application.reviewed_at,
      suspendedReason: application.suspended_reason || null
    },
    companyProfile: {
      companyName: application.company_name,
      website: application.website,
      country: application.country,
      logoUrl: application.logo_url
    },
    integrationStatus: {
      hasActiveKeys: activeKeys > 0,
      activeKeyCount: activeKeys,
      activeWebhookCount: activeWebhooks
    },
    activeServices: isActivePartnership(application)
      ? ['API Access', 'Webhooks', 'Sandbox'].filter((_, i) => (i === 0 ? activeKeys > 0 : i === 1 ? activeWebhooks > 0 : true))
      : [],
    apiStatus: isActivePartnership(application) ? (activeKeys > 0 ? 'connected' : 'not_configured') : 'locked',
    recentNotifications: notificationsResult.rows,
    supportTickets: { open: openTickets },
    activityTimeline: activityResult.rows
  });
}

// ===== Company profile =====
export async function getCompanyProfile(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const [contacts, pendingChanges] = await Promise.all([
    query('SELECT * FROM partner_contacts WHERE application_id = $1 ORDER BY is_primary DESC, created_at ASC', [application.id]),
    query(`SELECT * FROM partner_profile_change_requests WHERE application_id = $1 ORDER BY created_at DESC LIMIT 20`, [application.id])
  ]);
  res.json({ application, contacts: contacts.rows, changeRequests: pendingChanges.rows });
}

// PATCH /company-profile — non-sensitive fields (website) apply directly;
// logo upload is a separate endpoint. Sensitive fields never appear here —
// they go through requestProfileChange instead.
export async function updateCompanyProfile(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { website } = req.body;
  const result = await query(
    `UPDATE partner_applications SET website = COALESCE($1, website) WHERE id = $2 RETURNING *`,
    [website?.trim() || null, application.id]
  );
  await logPortalAction(application.id, req.user.id, 'profile_updated', { fields: NON_SENSITIVE_FIELDS.filter((f) => req.body[f] !== undefined) }, req);
  res.json({ message: 'Company profile updated.', application: result.rows[0] });
}

export async function uploadCompanyLogo(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({ error: 'Logo upload is not configured on this server yet.' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
  const check = await validateUpload(req.file, 'image');
  if (!check.ok) {
    if (check.internalReason) console.warn('Partner logo blocked by security scan:', check.internalReason);
    return res.status(400).json({ error: check.error });
  }
  try {
    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, 'image', 'jedida-marketplace/partner-logos');
    const updated = await query('UPDATE partner_applications SET logo_url = $1 WHERE id = $2 RETURNING logo_url', [result.url, application.id]);
    await logPortalAction(application.id, req.user.id, 'logo_updated', {}, req);
    res.json({ message: 'Logo updated.', logoUrl: updated.rows[0].logo_url });
  } catch (err) {
    console.error('Partner logo upload error:', err);
    res.status(502).json({ error: 'Could not upload logo. Please try again.' });
  }
}

// POST /company-profile/change-requests — sensitive fields require admin
// sign-off before they take effect.
export async function requestProfileChange(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const changes = {};
  for (const field of SENSITIVE_FIELDS) {
    if (req.body[field] !== undefined && String(req.body[field]).trim() !== String(application[field] || '')) {
      changes[field] = { from: application[field], to: String(req.body[field]).trim() };
    }
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'No changes were provided.' });
  }
  const result = await query(
    `INSERT INTO partner_profile_change_requests (application_id, requested_by, changes) VALUES ($1,$2,$3) RETURNING *`,
    [application.id, req.user.id, changes]
  );
  await logPortalAction(application.id, req.user.id, 'profile_change_requested', { fields: Object.keys(changes) }, req);

  const admins = await query('SELECT id FROM users WHERE is_admin = TRUE');
  for (const admin of admins.rows) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'system_announcement',$2,$3,$4)`,
      [admin.id, 'Partner company info change requested', `${application.company_name} requested a change to ${Object.keys(changes).join(', ')}.`, { applicationId: application.id }]
    );
  }
  res.status(201).json({ message: 'Change request submitted for admin approval.', changeRequest: result.rows[0] });
}

// ===== Contacts =====
export async function addContact(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { fullName, position, email, phone, isPrimary } = req.body;
  if (!fullName || !email) return res.status(400).json({ error: 'Full name and email are required.' });
  if (isPrimary) await query('UPDATE partner_contacts SET is_primary = FALSE WHERE application_id = $1', [application.id]);
  const result = await query(
    `INSERT INTO partner_contacts (application_id, full_name, position, email, phone, is_primary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [application.id, fullName.trim(), position?.trim() || null, email.trim().toLowerCase(), phone?.trim() || null, Boolean(isPrimary)]
  );
  await logPortalAction(application.id, req.user.id, 'contact_added', { contactId: result.rows[0].id }, req);
  res.status(201).json({ contact: result.rows[0] });
}

export async function updateContact(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { fullName, position, email, phone, isPrimary } = req.body;
  const owns = await query('SELECT id FROM partner_contacts WHERE id = $1 AND application_id = $2', [req.params.contactId, application.id]);
  if (owns.rows.length === 0) return res.status(404).json({ error: 'Contact not found.' });
  if (isPrimary) await query('UPDATE partner_contacts SET is_primary = FALSE WHERE application_id = $1', [application.id]);
  const result = await query(
    `UPDATE partner_contacts SET full_name = COALESCE($1,full_name), position = COALESCE($2,position),
     email = COALESCE($3,email), phone = COALESCE($4,phone), is_primary = COALESCE($5,is_primary)
     WHERE id = $6 RETURNING *`,
    [fullName?.trim(), position?.trim(), email?.trim().toLowerCase(), phone?.trim(), isPrimary, req.params.contactId]
  );
  await logPortalAction(application.id, req.user.id, 'contact_updated', { contactId: req.params.contactId }, req);
  res.json({ contact: result.rows[0] });
}

export async function deleteContact(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query('DELETE FROM partner_contacts WHERE id = $1 AND application_id = $2 RETURNING id', [req.params.contactId, application.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found.' });
  await logPortalAction(application.id, req.user.id, 'contact_removed', { contactId: req.params.contactId }, req);
  res.json({ message: 'Contact removed.' });
}

// ===== Integration Center: API keys =====
const MAX_ACTIVE_LIVE_KEYS = 3;

// Live keys reach real production data, so issuing or regenerating one is
// held to a higher bar than sandbox keys: the account must already have
// 2FA turned on, the partner must re-confirm their current password in
// the same request (a stolen session cookie alone isn't enough), and
// there's a hard cap on how many can be active at once. Sandbox keys skip
// all of this — they can't touch real data.
async function assertLiveKeyIssuanceAllowed(req, res, application) {
  const { currentPassword } = req.body;
  if (!currentPassword) {
    res.status(400).json({ error: 'Re-enter your account password to issue a live API key.' });
    return false;
  }
  const userResult = await query('SELECT password_hash, two_factor_enabled, must_change_password FROM users WHERE id = $1', [req.user.id]);
  const user = userResult.rows[0];
  if (!user) { res.status(404).json({ error: 'Account not found.' }); return false; }
  if (user.must_change_password) {
    res.status(403).json({ error: 'Please set a new password before issuing live API keys.' });
    return false;
  }
  if (!user.two_factor_enabled) {
    res.status(403).json({ error: 'Enable two-factor authentication in Security before issuing live API keys.' });
    return false;
  }
  const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!validPassword) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return false;
  }
  const activeLiveCount = await query(
    `SELECT COUNT(*) FROM partner_api_keys WHERE application_id = $1 AND environment = 'live' AND status = 'active'`,
    [application.id]
  );
  if (Number(activeLiveCount.rows[0].count) >= MAX_ACTIVE_LIVE_KEYS) {
    res.status(409).json({ error: `You can have at most ${MAX_ACTIVE_LIVE_KEYS} active live API keys at a time. Revoke one before creating another.` });
    return false;
  }
  return true;
}

function requireApproved(application, res) {
  if (!isActivePartnership(application)) {
    res.status(403).json({ error: 'Your partnership must be approved and active to manage integrations.' });
    return false;
  }
  return true;
}

export async function listApiKeys(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query(
    `SELECT id, label, key_prefix, last_four, environment, status, last_used_at, revoked_at, created_at
     FROM partner_api_keys WHERE application_id = $1 ORDER BY created_at DESC`,
    [application.id]
  );
  res.json({ apiKeys: result.rows });
}

function generateApiKey(environment) {
  const secret = crypto.randomBytes(24).toString('hex');
  const prefix = `jpk_${environment === 'live' ? 'live' : 'test'}_`;
  const fullKey = `${prefix}${secret}`;
  return { fullKey, prefix, lastFour: secret.slice(-4), hash: sha256(fullKey) };
}

export async function generateApiKeyHandler(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  if (!requireApproved(application, res)) return;
  const { label, environment } = req.body;
  const env = environment === 'live' ? 'live' : 'sandbox';
  if (env === 'live' && !(await assertLiveKeyIssuanceAllowed(req, res, application))) return;
  const key = generateApiKey(env === 'live' ? 'live' : 'test');

  const result = await query(
    `INSERT INTO partner_api_keys (application_id, label, key_prefix, last_four, key_hash, environment, created_by, issued_with_2fa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, label, key_prefix, last_four, environment, status, created_at`,
    [application.id, label?.trim() || 'Default key', key.prefix, key.lastFour, key.hash, env, req.user.id, env === 'live']
  );
  await logPortalAction(application.id, req.user.id, 'api_key_generated', { keyId: result.rows[0].id, environment: env }, req);
  if (env === 'live') {
    await notifyPartner(application.id, 'Live API key issued', 'A new LIVE API key was created for your integration. If this wasn\'t you, revoke it immediately and contact support.', 'partner_security_alert');
  } else {
    await notifyPartner(application.id, 'New API key generated', `A new ${env} API key was created for your integration.`, 'partner_api_change');
  }
  res.status(201).json({ message: 'API key generated. Copy it now — it will not be shown again.', apiKey: { ...result.rows[0], fullKey: key.fullKey } });
}

export async function regenerateApiKey(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  if (!requireApproved(application, res)) return;
  const existing = await query('SELECT * FROM partner_api_keys WHERE id = $1 AND application_id = $2', [req.params.id, application.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'API key not found.' });
  const isLive = existing.rows[0].environment === 'live';
  if (isLive && !(await assertLiveKeyIssuanceAllowed(req, res, application))) return;

  const key = generateApiKey(isLive ? 'live' : 'test');
  const result = await query(
    `UPDATE partner_api_keys SET key_prefix = $1, last_four = $2, key_hash = $3, status = 'active', revoked_at = NULL, issued_with_2fa = $4
     WHERE id = $5 RETURNING id, label, key_prefix, last_four, environment, status, created_at`,
    [key.prefix, key.lastFour, key.hash, isLive, req.params.id]
  );
  await logPortalAction(application.id, req.user.id, 'api_key_regenerated', { keyId: req.params.id, environment: existing.rows[0].environment }, req);
  if (isLive) {
    await notifyPartner(application.id, 'Live API key regenerated', 'A LIVE API key was regenerated. The previous key no longer works. If this wasn\'t you, contact support immediately.', 'partner_security_alert');
  } else {
    await notifyPartner(application.id, 'API key regenerated', 'One of your API keys was regenerated. The previous key no longer works.', 'partner_api_change');
  }
  res.json({ message: 'API key regenerated. Copy it now — it will not be shown again.', apiKey: { ...result.rows[0], fullKey: key.fullKey } });
}

export async function revokeApiKey(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query(
    `UPDATE partner_api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1 AND application_id = $2 RETURNING id`,
    [req.params.id, application.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'API key not found.' });
  await logPortalAction(application.id, req.user.id, 'api_key_revoked', { keyId: req.params.id }, req);
  await notifyPartner(application.id, 'API key revoked', 'One of your API keys was revoked and can no longer be used.', 'partner_api_change');
  res.json({ message: 'API key revoked.' });
}

// ===== Integration Center: Webhooks =====
export async function listWebhooks(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query(
    `SELECT id, callback_url, events, status, last_triggered_at, created_at FROM partner_webhooks WHERE application_id = $1 ORDER BY created_at DESC`,
    [application.id]
  );
  res.json({ webhooks: result.rows });
}

export async function createWebhook(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  if (!requireApproved(application, res)) return;
  const { callbackUrl, events } = req.body;
  if (!callbackUrl || !/^https?:\/\//.test(callbackUrl)) {
    return res.status(400).json({ error: 'A valid callback URL (http:// or https://) is required.' });
  }
  const secret = crypto.randomBytes(20).toString('hex');
  const result = await query(
    `INSERT INTO partner_webhooks (application_id, callback_url, events, signing_secret, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, callback_url, events, status, created_at, signing_secret`,
    [application.id, callbackUrl.trim(), Array.isArray(events) ? events : [], secret, req.user.id]
  );
  await logPortalAction(application.id, req.user.id, 'webhook_created', { webhookId: result.rows[0].id }, req);
  res.status(201).json({ message: 'Webhook registered.', webhook: result.rows[0] });
}

export async function updateWebhook(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { callbackUrl, events, status } = req.body;
  const owns = await query('SELECT id FROM partner_webhooks WHERE id = $1 AND application_id = $2', [req.params.id, application.id]);
  if (owns.rows.length === 0) return res.status(404).json({ error: 'Webhook not found.' });
  const result = await query(
    `UPDATE partner_webhooks SET callback_url = COALESCE($1,callback_url), events = COALESCE($2,events), status = COALESCE($3,status)
     WHERE id = $4 RETURNING id, callback_url, events, status, created_at`,
    [callbackUrl?.trim(), Array.isArray(events) ? events : null, status, req.params.id]
  );
  await logPortalAction(application.id, req.user.id, 'webhook_updated', { webhookId: req.params.id }, req);
  res.json({ webhook: result.rows[0] });
}

export async function deleteWebhook(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query('DELETE FROM partner_webhooks WHERE id = $1 AND application_id = $2 RETURNING id', [req.params.id, application.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Webhook not found.' });
  await logPortalAction(application.id, req.user.id, 'webhook_deleted', { webhookId: req.params.id }, req);
  res.json({ message: 'Webhook removed.' });
}

// ===== Sandbox =====
// Static reference payloads for the "sample request / response" viewer —
// documentation content, not partner-specific data.
const SAMPLE_REQUEST = {
  method: 'GET',
  url: 'https://api.jedidamarketplace.com/v1/orders?status=paid&limit=20',
  headers: { Authorization: 'Bearer jpk_test_********************', 'Content-Type': 'application/json' }
};
const SAMPLE_RESPONSE = {
  status: 200,
  body: {
    data: [{ id: 'ord_8f2a1c', status: 'paid', total: 45000, currency: 'RWF', created_at: '2026-07-20T10:12:00Z' }],
    pagination: { limit: 20, next_cursor: null }
  }
};

export async function getSandboxSample(req, res) {
  res.json({ sampleRequest: SAMPLE_REQUEST, sampleResponse: SAMPLE_RESPONSE });
}

export async function listSandboxLogs(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query(
    `SELECT id, kind, target, request_payload, response_payload, status_code, success, duration_ms, created_at
     FROM partner_sandbox_logs WHERE application_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [application.id]
  );
  res.json({ logs: result.rows });
}

// POST /sandbox/test-api — exercises one of the partner's own active keys
// against a lightweight internal echo, so partners can confirm their key
// and headers are shaped correctly before wiring up production code.
export async function testApiConnection(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { apiKeyId, endpoint } = req.body;
  const started = Date.now();

  const keyResult = apiKeyId
    ? await query('SELECT * FROM partner_api_keys WHERE id = $1 AND application_id = $2', [apiKeyId, application.id])
    : { rows: [] };
  const key = keyResult.rows[0];
  const success = Boolean(key && key.status === 'active');

  const requestPayload = { endpoint: endpoint || '/v1/ping', apiKeyId: apiKeyId || null };
  const responsePayload = success
    ? { status: 200, body: { ok: true, environment: key.environment, message: 'Sandbox connection succeeded.' } }
    : { status: 401, body: { ok: false, error: key ? 'That API key is revoked.' : 'No active API key was supplied.' } };

  const log = await query(
    `INSERT INTO partner_sandbox_logs (application_id, kind, target, request_payload, response_payload, status_code, success, duration_ms, created_by)
     VALUES ($1,'api_test',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [application.id, requestPayload.endpoint, requestPayload, responsePayload, responsePayload.status, success, Date.now() - started, req.user.id]
  );
  res.json({ log: log.rows[0] });
}

// POST /sandbox/webhooks/:id/test — sends a real, HMAC-signed sample
// payload to the partner's own registered callback URL and logs what
// actually came back (or the network/timeout error).
export async function testWebhook(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const webhookResult = await query('SELECT * FROM partner_webhooks WHERE id = $1 AND application_id = $2', [req.params.id, application.id]);
  if (webhookResult.rows.length === 0) return res.status(404).json({ error: 'Webhook not found.' });
  const webhook = webhookResult.rows[0];

  const samplePayload = { event: 'order.paid', data: { id: 'ord_sandbox_test', total: 10000, currency: 'RWF' }, sent_at: new Date().toISOString() };
  const signature = crypto.createHmac('sha256', webhook.signing_secret).update(JSON.stringify(samplePayload)).digest('hex');
  const started = Date.now();

  let responsePayload;
  let statusCode = null;
  let success = false;
  try {
    const httpResponse = await axios.post(webhook.callback_url, samplePayload, {
      headers: { 'Content-Type': 'application/json', 'X-Jedida-Signature': signature },
      timeout: 8000,
      validateStatus: () => true
    });
    statusCode = httpResponse.status;
    success = httpResponse.status >= 200 && httpResponse.status < 300;
    responsePayload = { status: httpResponse.status, body: typeof httpResponse.data === 'object' ? httpResponse.data : String(httpResponse.data).slice(0, 2000) };
  } catch (err) {
    responsePayload = { error: err.code === 'ECONNABORTED' ? 'Request timed out after 8 seconds.' : (err.message || 'Request failed.') };
  }

  await query(`UPDATE partner_webhooks SET last_triggered_at = now() WHERE id = $1`, [webhook.id]);
  const log = await query(
    `INSERT INTO partner_sandbox_logs (application_id, kind, target, request_payload, response_payload, status_code, success, duration_ms, created_by)
     VALUES ($1,'webhook_test',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [application.id, webhook.callback_url, samplePayload, responsePayload, statusCode, success, Date.now() - started, req.user.id]
  );
  res.json({ log: log.rows[0] });
}

// ===== Support tickets =====
export async function listTickets(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const result = await query(
    `SELECT * FROM partner_support_tickets WHERE application_id = $1 ORDER BY updated_at DESC`,
    [application.id]
  );
  res.json({ tickets: result.rows });
}

export async function createTicket(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { subject, category, priority, message } = req.body;
  if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Subject and an initial message are required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ticket = await client.query(
      `INSERT INTO partner_support_tickets (application_id, subject, category, priority, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [application.id, subject.trim(), category?.trim() || 'general', ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium', req.user.id]
    );
    await client.query(
      `INSERT INTO partner_support_messages (ticket_id, author_id, author_role, body) VALUES ($1,$2,'partner',$3)`,
      [ticket.rows[0].id, req.user.id, message.trim()]
    );
    await client.query('COMMIT');

    const admins = await query(`SELECT id FROM users WHERE is_admin = TRUE`);
    for (const admin of admins.rows) {
      await query(
        `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'system_announcement',$2,$3,$4)`,
        [admin.id, 'New partner support ticket', `${application.company_name}: ${subject.trim()}`, { ticketId: ticket.rows[0].id }]
      );
    }
    res.status(201).json({ ticket: ticket.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create partner ticket error:', err);
    res.status(500).json({ error: 'Could not create the ticket.' });
  } finally {
    client.release();
  }
}

export async function getTicket(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const [ticket, messages] = await Promise.all([
    query('SELECT * FROM partner_support_tickets WHERE id = $1 AND application_id = $2', [req.params.id, application.id]),
    query(
      `SELECT m.*, u.username AS author_name,
              COALESCE(json_agg(a.* ) FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments
       FROM partner_support_messages m
       LEFT JOIN users u ON u.id = m.author_id
       LEFT JOIN partner_support_attachments a ON a.message_id = m.id
       WHERE m.ticket_id = $1 GROUP BY m.id, u.username ORDER BY m.created_at ASC`,
      [req.params.id]
    )
  ]);
  if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket not found.' });
  res.json({ ticket: ticket.rows[0], messages: messages.rows });
}

export async function replyToTicket(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const ticket = await query('SELECT * FROM partner_support_tickets WHERE id = $1 AND application_id = $2', [req.params.id, application.id]);
  if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket not found.' });
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'A message is required.' });

  if (req.file) {
    const check = await validateUploadAny(req.file, ['document', 'image']);
    if (!check.ok) {
      if (check.internalReason) console.warn('Support attachment blocked by security scan:', check.internalReason);
      return res.status(400).json({ error: check.error });
    }
  }

  const message = await query(
    `INSERT INTO partner_support_messages (ticket_id, author_id, author_role, body) VALUES ($1,$2,'partner',$3) RETURNING *`,
    [req.params.id, req.user.id, body.trim()]
  );

  const attachments = [];
  if (req.file) {
    if (!isCloudinaryConfigured()) {
      return res.status(501).json({ error: 'Attachment upload is not configured on this server yet.' });
    }
    const isImage = req.file.mimetype.startsWith('image/');
    const uploaded = await uploadToCloudinary(req.file.buffer, req.file.originalname, isImage ? 'image' : 'raw', 'jedida-marketplace/partner-support', { sensitive: true });
    const attachment = await query(
      `INSERT INTO partner_support_attachments (message_id, file_name, file_url, bytes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [message.rows[0].id, req.file.originalname, uploaded.url, uploaded.bytes || req.file.size]
    );
    attachments.push(attachment.rows[0]);
  }

  await query(`UPDATE partner_support_tickets SET status = 'pending', updated_at = now() WHERE id = $1`, [req.params.id]);
  res.status(201).json({ message: message.rows[0], attachments });
}

export async function updateTicketStatus(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { status } = req.body;
  if (!['closed'].includes(status)) return res.status(400).json({ error: "Partners may only close a ticket (status: 'closed')." });
  const result = await query(
    `UPDATE partner_support_tickets SET status = $1, updated_at = now() WHERE id = $2 AND application_id = $3 RETURNING *`,
    [status, req.params.id, application.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ticket not found.' });
  res.json({ ticket: result.rows[0] });
}

// ===== Audit log =====
export async function getAuditLog(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const { page = 1, pageSize = 50 } = req.query;
  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const [result, countResult] = await Promise.all([
    query(
      `SELECT id, actor_role, action, details, created_at FROM partner_portal_audit_log
       WHERE application_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [application.id, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM partner_portal_audit_log WHERE application_id = $1`, [application.id])
  ]);
  res.json({ entries: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}

// ===== Directory listing (partner-side settings) =====
export async function getDirectoryListing(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const leads = await query(
    `SELECT id, name, email, message, created_at FROM partner_app_leads WHERE application_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [application.id]
  );
  res.json({
    listing: {
      listed: application.directory_listed,
      tagline: application.directory_tagline,
      category: application.directory_category,
      tryUrl: application.directory_try_url,
      logoUrl: application.logo_url
    },
    leads: leads.rows
  });
}

export async function updateDirectoryListing(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  if (!requireApproved(application, res)) return;
  const { listed, tagline, category, tryUrl } = req.body;
  if (listed && (!tagline?.trim() || !application.logo_url)) {
    return res.status(400).json({ error: 'Add a tagline and upload a company logo before listing your app in the directory.' });
  }
  const result = await query(
    `UPDATE partner_applications SET directory_listed = $1, directory_tagline = $2, directory_category = $3, directory_try_url = $4
     WHERE id = $5 RETURNING directory_listed, directory_tagline, directory_category, directory_try_url`,
    [Boolean(listed), tagline?.trim() || null, category?.trim() || null, tryUrl?.trim() || null, application.id]
  );
  await logPortalAction(application.id, req.user.id, 'directory_listing_updated', { listed: Boolean(listed) }, req);
  res.json({ message: listed ? 'Your app is now listed in the Partner Apps directory.' : 'Your app has been unlisted from the directory.', listing: result.rows[0] });
}

// ===== Dropshipping program (partner-side setup) =====
export async function getDropshippingProgram(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  const enrollments = await query(
    `SELECT COUNT(*) FROM partner_dropship_enrollments WHERE application_id = $1 AND status = 'active'`,
    [application.id]
  );
  res.json({
    available: application.dropshipping_available,
    instructions: application.dropshipping_instructions,
    activeEnrollments: Number(enrollments.rows[0].count)
  });
}

export async function updateDropshippingProgram(req, res) {
  const application = await loadOwnApplication(req, res);
  if (!application) return;
  if (!requireApproved(application, res)) return;
  const { available, instructions } = req.body;
  if (available && !instructions?.trim()) {
    return res.status(400).json({ error: 'Write clear dropshipping instructions before enabling the program — sellers must be able to follow them.' });
  }
  const result = await query(
    `UPDATE partner_applications SET dropshipping_available = $1, dropshipping_instructions = $2
     WHERE id = $3 RETURNING dropshipping_available, dropshipping_instructions`,
    [Boolean(available), instructions?.trim() || null, application.id]
  );
  await logPortalAction(application.id, req.user.id, 'dropshipping_program_updated', { available: Boolean(available) }, req);
  res.json({ message: available ? 'Dropshipping program enabled.' : 'Dropshipping program disabled.', program: result.rows[0] });
}
