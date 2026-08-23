import { query } from '../config/db.js';
import { isFeatureEnabledForShop } from '../services/featureEngineService.js';

// Real server-side gate for a feature (spec: "Hiding a button is NOT
// security"). Looks up the caller's own shop and checks all 3 levels via
// featureEngineService — the same function the seller's own capabilities
// endpoint uses, so the UI and the enforcement can never silently disagree.
export function requireFeatureEnabled(featureKey) {
  return async function (req, res, next) {
    try {
      const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
      const shop = shopResult.rows[0];
      if (!shop) return res.status(403).json({ error: 'Open a shop to use this feature.' });

      const enabled = await isFeatureEnabledForShop(shop.id, featureKey);
      if (!enabled) {
        return res.status(403).json({ error: `This feature isn't available for your shop right now.`, featureKey });
      }
      req.shopId = shop.id;
      next();
    } catch (err) {
      console.error('requireFeatureEnabled error:', err);
      return res.status(500).json({ error: 'Could not verify feature access.' });
    }
  };
}
