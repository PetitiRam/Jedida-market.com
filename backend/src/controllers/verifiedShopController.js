import { query } from '../config/db.js';
import {
  evaluateShop, evaluateAllActiveShops, setAdminOverride,
  getShopTrustMetrics, getVerifiedShopThresholds, missingRequirementsSummary
} from '../services/trustEngineService.js';
import { scanShopFollowers, scanShopReviews, scanShopOrders, recommendImprovements } from '../services/aiProtectionService.js';

async function getOwnShopId(userId) {
  const result = await query('SELECT id FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

// ===== Seller-facing =====

// A seller's own live verification status — recomputed on the spot
// (cheap: a handful of indexed aggregate queries) so the dashboard
// always reflects reality, not a stale sweep result.
export async function getMyVerificationStatus(req, res) {
  try {
    const shopId = await getOwnShopId(req.user.id);
    if (!shopId) return res.status(404).json({ error: 'No shop found for your account.' });

    const result = await evaluateShop(shopId);
    if (!result) return res.status(404).json({ error: 'Shop not found.' });

    const settings = await getVerifiedShopThresholds();
    const gaps = result.isVerified ? [] : missingRequirementsSummary(result, settings);

    return res.json({
      isVerified: result.isVerified,
      mode: result.mode,
      thresholds: settings,
      metrics: result,
      whatsMissing: gaps,
      recommendations: recommendImprovements(result)
    });
  } catch (err) {
    console.error('Get my verification status error:', err);
    return res.status(500).json({ error: 'Could not load verification status.' });
  }
}

// ===== Admin-facing =====

// List every active shop with its cached trust metrics — the admin
// Verified Shops screen. Filterable by current badge state.
export async function listVerifiedShops(req, res) {
  const { filter, search, page = 1, pageSize = 30 } = req.query;
  const conditions = [`s.status = 'active'`];
  const values = [];
  let i = 1;

  if (filter === 'verified') conditions.push('s.is_verified = TRUE');
  if (filter === 'eligible_not_verified') { conditions.push('s.is_verified = FALSE'); conditions.push('COALESCE(stm.eligible, FALSE) = TRUE'); }
  if (filter === 'override') conditions.push(`s.verification_mode != 'auto'`);
  if (search) { conditions.push(`s.name ILIKE $${i}`); values.push(`%${search}%`); i += 1; }

  const limitIdx = i; values.push(Math.min(Number(pageSize) || 30, 100)); i += 1;
  const offsetIdx = i; values.push((Math.max(Number(page) || 1, 1) - 1) * (Number(pageSize) || 30));

  try {
    const result = await query(
      `SELECT s.id, s.name, s.slug, s.logo_url, s.is_verified, s.verified_since, s.verification_mode,
              s.verification_override_reason, u.username, u.email,
              stm.completed_orders_count, stm.follower_count, stm.real_follower_count, stm.trust_score,
              stm.eligible, stm.last_computed_at
       FROM shops s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN shop_trust_metrics stm ON stm.shop_id = s.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.is_verified DESC, stm.trust_score DESC NULLS LAST
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );
    return res.json({ shops: result.rows });
  } catch (err) {
    console.error('List verified shops error:', err);
    return res.status(500).json({ error: 'Could not load verified shops.' });
  }
}

// Full metric + threshold + event-history detail for one shop.
export async function getShopVerificationDetail(req, res) {
  const { shopId } = req.params;
  try {
    const [shopResult, metrics, thresholds, events] = await Promise.all([
      query(`SELECT s.*, u.username, u.email FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = $1`, [shopId]),
      getShopTrustMetrics(shopId),
      getVerifiedShopThresholds(),
      query(`SELECT sve.*, u.username AS actor_username FROM shop_verification_events sve
             LEFT JOIN users u ON u.id = sve.actor_id
             WHERE sve.shop_id = $1 ORDER BY sve.created_at DESC LIMIT 50`, [shopId])
    ]);
    if (shopResult.rows.length === 0) return res.status(404).json({ error: 'Shop not found.' });

    return res.json({ shop: shopResult.rows[0], metrics, thresholds, events: events.rows });
  } catch (err) {
    console.error('Get shop verification detail error:', err);
    return res.status(500).json({ error: 'Could not load verification detail.' });
  }
}

// Force-verify, force-block ("suspend for poor performance" / deny), or
// clear back to automatic engine control.
export async function overrideShopVerification(req, res) {
  const { shopId } = req.params;
  const { mode, reason } = req.body;
  if (!['auto', 'admin_forced_verified', 'admin_forced_blocked'].includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: auto, admin_forced_verified, admin_forced_blocked` });
  }
  try {
    const result = await setAdminOverride(shopId, mode, { reason, adminId: req.user.id });
    return res.json({ message: 'Verification override applied.', result });
  } catch (err) {
    console.error('Override shop verification error:', err);
    return res.status(err.message === 'Shop not found.' ? 404 : 500).json({ error: err.message || 'Could not apply override.' });
  }
}

export async function recomputeShopVerification(req, res) {
  const { shopId } = req.params;
  try {
    const result = await evaluateShop(shopId);
    if (!result) return res.status(404).json({ error: 'Shop not found.' });
    return res.json({ message: 'Recomputed.', result });
  } catch (err) {
    console.error('Recompute shop verification error:', err);
    return res.status(500).json({ error: 'Could not recompute verification.' });
  }
}

export async function recomputeAllShopVerification(req, res) {
  try {
    const summary = await evaluateAllActiveShops();
    return res.json({ message: `Recomputed ${summary.checked} shop(s): ${summary.granted} newly verified, ${summary.revoked} revoked.`, ...summary });
  } catch (err) {
    console.error('Recompute all verification error:', err);
    return res.status(500).json({ error: 'Could not run verification sweep.' });
  }
}

// ===== AI Protection (Phase C) — admin risk signal queue =====

export async function listRiskSignals(req, res) {
  const { status = 'open', shopId } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status && status !== 'all') { conditions.push(`srs.status = $${i}`); values.push(status); i += 1; }
  if (shopId) { conditions.push(`srs.shop_id = $${i}`); values.push(shopId); i += 1; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const result = await query(
      `SELECT srs.*, s.name AS shop_name, s.slug AS shop_slug, u.username AS resolved_by_username
       FROM shop_risk_signals srs
       JOIN shops s ON s.id = srs.shop_id
       LEFT JOIN users u ON u.id = srs.resolved_by
       ${where}
       ORDER BY srs.severity DESC, srs.created_at DESC LIMIT 100`,
      values
    );
    return res.json({ signals: result.rows });
  } catch (err) {
    console.error('List risk signals error:', err);
    return res.status(500).json({ error: 'Could not load risk signals.' });
  }
}

export async function resolveRiskSignal(req, res) {
  const { signalId } = req.params;
  const { status, notes } = req.body;
  if (!['acknowledged', 'dismissed', 'open'].includes(status)) {
    return res.status(400).json({ error: 'status must be one of: acknowledged, dismissed, open' });
  }
  try {
    const result = await query(
      `UPDATE shop_risk_signals SET status = $1, resolved_by = $2, resolved_at = now(), resolution_notes = $3
       WHERE id = $4 RETURNING *`,
      [status, req.user.id, notes || null, signalId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Risk signal not found.' });
    return res.json({ message: 'Updated.', signal: result.rows[0] });
  } catch (err) {
    console.error('Resolve risk signal error:', err);
    return res.status(500).json({ error: 'Could not update risk signal.' });
  }
}

// Manually re-run the fake-follower/fake-review/suspicious-order scans
// for one shop, on demand (rather than waiting for the next sweep).
export async function rescanShopProtection(req, res) {
  const { shopId } = req.params;
  try {
    const [followerSignal, reviewSignal, orderFlags] = await Promise.all([
      scanShopFollowers(shopId), scanShopReviews(shopId), scanShopOrders(shopId)
    ]);
    return res.json({
      message: 'Scan complete.',
      followerSignal, reviewSignal, orderFlagsRaised: orderFlags.length
    });
  } catch (err) {
    console.error('Rescan shop protection error:', err);
    return res.status(500).json({ error: 'Could not run scan.' });
  }
}
