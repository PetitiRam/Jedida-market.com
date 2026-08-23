import { query } from '../config/db.js';

// The exact reusable function the spec's section 9 asks for: given a shop,
// compute what it can actually use by combining all 3 levels. Never
// hard-coded — every value here comes from feature_flags/
// seller_feature_activations, cross-checked against the real owner role.
export async function getSellerCapabilities(shopId) {
  const result = await query(
    `SELECT ff.key, ff.global_status, ff.eligible_roles, sfa.enabled AS activation_enabled, u.primary_role AS owner_role
     FROM feature_flags ff
     JOIN shops s ON s.id = $1
     JOIN users u ON u.id = s.owner_id
     LEFT JOIN seller_feature_activations sfa ON sfa.feature_key = ff.key AND sfa.shop_id = $1`,
    [shopId]
  );

  const capabilities = {};
  for (const row of result.rows) {
    const eligible = row.eligible_roles.length === 0 || row.eligible_roles.includes(row.owner_role);
    // No activation row yet defaults to "eligible sellers get it on" —
    // matches the migration's own backward-compat backfill, so a brand
    // new eligible shop isn't silently missing a feature it should have.
    const activated = row.activation_enabled !== false;
    capabilities[row.key] = row.global_status === 'available' && eligible && activated;
  }
  return capabilities;
}

export async function isFeatureEnabledForShop(shopId, featureKey) {
  const capabilities = await getSellerCapabilities(shopId);
  return !!capabilities[featureKey];
}
