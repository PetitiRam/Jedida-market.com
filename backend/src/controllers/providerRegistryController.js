import { query } from '../config/db.js';
import * as settingsService from '../services/settingsService.js';

const VALID_TRANSITIONS = {
  pending: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active', 'rejected'],
  rejected: ['pending']
};

async function recordApprovalAction(providerId, previousStatus, newStatus, actorId, reason, notes) {
  await query(
    `INSERT INTO provider_approval_actions (provider_id, previous_status, new_status, actor_id, reason, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [providerId, previousStatus, newStatus, actorId, reason || null, notes || null]
  );
}

// ===== ADMIN =====

export async function listProviders(req, res) {
  try {
    const { category } = req.query;
    const params = [];
    let where = '';
    if (category) { params.push(category); where = 'WHERE category = $1'; }
    const result = await query(
      `SELECT pr.*, (SELECT COUNT(*) FROM seller_provider_connections spc WHERE spc.provider_id = pr.id AND spc.status = 'connected') AS connected_seller_count
       FROM provider_registry pr ${where} ORDER BY category, name`,
      params
    );
    return res.json({ providers: result.rows });
  } catch (err) {
    console.error('List providers error:', err);
    return res.status(500).json({ error: 'Could not load provider registry.' });
  }
}

export async function getProviderHistory(req, res) {
  try {
    const result = await query(
      `SELECT a.*, u.username AS actor_username FROM provider_approval_actions a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.provider_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    return res.json({ history: result.rows });
  } catch (err) {
    console.error('Get provider history error:', err);
    return res.status(500).json({ error: 'Could not load provider history.' });
  }
}

export async function createProvider(req, res) {
  try {
    const { category, code, name, description, supportedCountries } = req.body;
    if (!category || !code || !name) return res.status(400).json({ error: 'category, code and name are required.' });
    const result = await query(
      `INSERT INTO provider_registry (category, code, name, description, supported_countries, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [category, code, name, description || null, supportedCountries || [], req.user.id]
    );
    const provider = result.rows[0];
    await recordApprovalAction(provider.id, null, 'pending', req.user.id, 'Provider submitted to registry', null);
    return res.status(201).json({ provider });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A provider with this category/code already exists.' });
    console.error('Create provider error:', err);
    return res.status(500).json({ error: 'Could not create provider.' });
  }
}

export async function updateProviderStatus(req, res) {
  try {
    const { newStatus, reason, notes } = req.body;
    const current = await query('SELECT * FROM provider_registry WHERE id = $1', [req.params.id]);
    const provider = current.rows[0];
    if (!provider) return res.status(404).json({ error: 'Provider not found.' });

    const allowed = VALID_TRANSITIONS[provider.status] || [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({ error: `Cannot move a provider from '${provider.status}' to '${newStatus}'.` });
    }

    const approvedFields = newStatus === 'approved' ? ', approved_by = $3, approved_at = now()' : '';
    const params = newStatus === 'approved' ? [newStatus, provider.id, req.user.id] : [newStatus, provider.id];
    const updated = await query(
      `UPDATE provider_registry SET status = $1, updated_at = now()${approvedFields} WHERE id = $2 RETURNING *`,
      params
    );

    await recordApprovalAction(provider.id, provider.status, newStatus, req.user.id, reason, notes);
    return res.json({ provider: updated.rows[0] });
  } catch (err) {
    console.error('Update provider status error:', err);
    return res.status(500).json({ error: 'Could not update provider status.' });
  }
}

// ===== BUYER-FACING (public) =====

// Real per-shop connected payment methods for checkout — the actual Level-3
// gate the seller set on their own Payments page. No shop_id given means no
// restriction (falls back to platform-wide availability, same as before
// this phase); an empty connected set for a shop that has methods means
// checkout should show nothing "coming soon" instead of falsely available.
export async function getShopConnectedProviders(req, res) {
  try {
    const result = await query(
      `SELECT pr.code FROM seller_provider_connections spc
       JOIN provider_registry pr ON pr.id = spc.provider_id
       WHERE spc.shop_id = $1 AND spc.status = 'connected' AND pr.category = 'payment' AND pr.status = 'active'`,
      [req.params.shopId]
    );
    return res.json({ connectedCodes: result.rows.map((r) => r.code) });
  } catch (err) {
    console.error('Get shop connected providers error:', err);
    return res.status(500).json({ error: 'Could not load this shop\'s payment methods.' });
  }
}

// ===== SELLER =====

export async function listMyProviderConnections(req, res) {
  try {
    const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    const shop = shopResult.rows[0];
    if (!shop) return res.status(404).json({ error: 'Open your shop before connecting payment providers.' });

    const result = await query(
      `SELECT pr.id, pr.category, pr.code, pr.name, pr.description, pr.status AS provider_status, pr.settings_flag_key,
              spc.status AS connection_status, spc.destination, spc.connected_at
       FROM provider_registry pr
       LEFT JOIN seller_provider_connections spc ON spc.provider_id = pr.id AND spc.shop_id = $1
       WHERE pr.category = 'payment' AND pr.status = 'active'
       ORDER BY pr.name`,
      [shop.id]
    );

    // Level-1 check: even a registry-active provider must still be turned
    // on in settingsCenter's real "payment" section flags — the registry
    // never overrides the platform-wide master switch.
    const paymentSection = await settingsService.getSection('payment');
    const providers = result.rows.filter((p) => !p.settings_flag_key || paymentSection[p.settings_flag_key]);

    return res.json({ providers });
  } catch (err) {
    console.error('List my provider connections error:', err);
    return res.status(500).json({ error: 'Could not load your payment providers.' });
  }
}

export async function connectProvider(req, res) {
  try {
    const { destination } = req.body;
    const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    const shop = shopResult.rows[0];
    if (!shop) return res.status(404).json({ error: 'Open your shop before connecting payment providers.' });

    const providerResult = await query(`SELECT * FROM provider_registry WHERE id = $1 AND category = 'payment' AND status = 'active'`, [req.params.providerId]);
    const provider = providerResult.rows[0];
    if (!provider) return res.status(404).json({ error: 'This provider is not currently available to connect.' });

    if (provider.settings_flag_key) {
      const paymentSection = await settingsService.getSection('payment');
      if (!paymentSection[provider.settings_flag_key]) {
        return res.status(403).json({ error: 'This payment method is currently disabled platform-wide.' });
      }
    }

    const result = await query(
      `INSERT INTO seller_provider_connections (shop_id, provider_id, status, destination, connected_at)
       VALUES ($1, $2, 'connected', $3, now())
       ON CONFLICT (shop_id, provider_id)
       DO UPDATE SET status = 'connected', destination = $3, connected_at = now(), disconnected_at = NULL, updated_at = now()
       RETURNING *`,
      [shop.id, provider.id, destination || null]
    );
    return res.json({ connection: result.rows[0] });
  } catch (err) {
    console.error('Connect provider error:', err);
    return res.status(500).json({ error: 'Could not connect this payment method.' });
  }
}

export async function disconnectProvider(req, res) {
  try {
    const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    const shop = shopResult.rows[0];
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });

    const result = await query(
      `UPDATE seller_provider_connections SET status = 'disconnected', disconnected_at = now(), updated_at = now()
       WHERE shop_id = $1 AND provider_id = $2 RETURNING *`,
      [shop.id, req.params.providerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'You have not connected this payment method.' });
    return res.json({ connection: result.rows[0] });
  } catch (err) {
    console.error('Disconnect provider error:', err);
    return res.status(500).json({ error: 'Could not disconnect this payment method.' });
  }
}
