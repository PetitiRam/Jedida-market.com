import { query } from '../config/db.js';
import { getSellerCapabilities } from '../services/featureEngineService.js';

// ===== ADMIN =====

export async function adminListFeatures(req, res) {
  try {
    const result = await query(
      `SELECT ff.*, (SELECT COUNT(*) FROM seller_feature_activations sfa WHERE sfa.feature_key = ff.key AND sfa.enabled = TRUE) AS activated_seller_count
       FROM feature_flags ff ORDER BY category, name`
    );
    return res.json({ features: result.rows });
  } catch (err) {
    console.error('Admin list features error:', err);
    return res.status(500).json({ error: 'Could not load features.' });
  }
}

export async function adminCreateFeature(req, res) {
  try {
    const { key, name, description, category, eligibleRoles } = req.body;
    if (!key || !name) return res.status(400).json({ error: 'key and name are required.' });
    const result = await query(
      `INSERT INTO feature_flags (key, name, description, category, eligible_roles, created_by, global_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'disabled') RETURNING *`,
      [key, name, description || null, category || null, eligibleRoles || [], req.user.id]
    );
    return res.status(201).json({ feature: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A feature with this key already exists.' });
    console.error('Admin create feature error:', err);
    return res.status(500).json({ error: 'Could not create feature.' });
  }
}

export async function adminUpdateFeatureStatus(req, res) {
  try {
    const { newStatus, reason } = req.body;
    if (!['available', 'disabled', 'maintenance'].includes(newStatus)) {
      return res.status(400).json({ error: 'newStatus must be available, disabled, or maintenance.' });
    }
    const current = await query('SELECT * FROM feature_flags WHERE key = $1', [req.params.key]);
    const feature = current.rows[0];
    if (!feature) return res.status(404).json({ error: 'Feature not found.' });

    const updated = await query(
      `UPDATE feature_flags SET global_status = $1, updated_at = now() WHERE key = $2 RETURNING *`,
      [newStatus, feature.key]
    );
    await query(
      `INSERT INTO feature_flag_actions (feature_key, previous_status, new_status, actor_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [feature.key, feature.global_status, newStatus, req.user.id, reason || null]
    );
    return res.json({ feature: updated.rows[0] });
  } catch (err) {
    console.error('Admin update feature status error:', err);
    return res.status(500).json({ error: 'Could not update feature status.' });
  }
}

export async function adminUpdateFeatureEligibility(req, res) {
  try {
    const { eligibleRoles } = req.body;
    if (!Array.isArray(eligibleRoles)) return res.status(400).json({ error: 'eligibleRoles must be an array.' });
    const result = await query(
      `UPDATE feature_flags SET eligible_roles = $1, updated_at = now() WHERE key = $2 RETURNING *`,
      [eligibleRoles, req.params.key]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Feature not found.' });
    return res.json({ feature: result.rows[0] });
  } catch (err) {
    console.error('Admin update feature eligibility error:', err);
    return res.status(500).json({ error: 'Could not update eligibility.' });
  }
}

// ===== SELLER =====

export async function getMyCapabilities(req, res) {
  try {
    const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    const shop = shopResult.rows[0];
    if (!shop) return res.status(404).json({ error: 'Open your shop to see feature availability.' });

    const features = await query(
      `SELECT ff.key, ff.name, ff.description, ff.category, ff.global_status, ff.eligible_roles, sfa.enabled AS activation_enabled
       FROM feature_flags ff
       LEFT JOIN seller_feature_activations sfa ON sfa.feature_key = ff.key AND sfa.shop_id = $1
       ORDER BY ff.category, ff.name`,
      [shop.id]
    );
    const capabilities = await getSellerCapabilities(shop.id);

    const ownerRoleResult = await query('SELECT u.primary_role FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = $1', [shop.id]);
    const ownerRole = ownerRoleResult.rows[0]?.primary_role;

    return res.json({
      features: features.rows.map((f) => ({
        ...f,
        eligible: f.eligible_roles.length === 0 || f.eligible_roles.includes(ownerRole),
        activated: f.activation_enabled !== false,
        enabled: !!capabilities[f.key]
      }))
    });
  } catch (err) {
    console.error('Get my capabilities error:', err);
    return res.status(500).json({ error: 'Could not load your features.' });
  }
}

export async function toggleMyFeature(req, res) {
  try {
    const { enabled } = req.body;
    const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    const shop = shopResult.rows[0];
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });

    const featureResult = await query('SELECT * FROM feature_flags WHERE key = $1', [req.params.key]);
    if (!featureResult.rows[0]) return res.status(404).json({ error: 'Feature not found.' });

    const result = await query(
      `INSERT INTO seller_feature_activations (shop_id, feature_key, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (shop_id, feature_key) DO UPDATE SET enabled = $3, updated_at = now()
       RETURNING *`,
      [shop.id, req.params.key, !!enabled]
    );
    return res.json({ activation: result.rows[0] });
  } catch (err) {
    console.error('Toggle my feature error:', err);
    return res.status(500).json({ error: 'Could not update this feature.' });
  }
}
