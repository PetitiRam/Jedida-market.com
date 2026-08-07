import { query } from '../config/db.js';
import * as tracking from '../services/trackingService.js';

// Businesses that can hold a farm-style profile. 'farmer' is the new
// role from phase45; supplier/manufacturer already trade agri goods
// under the existing 'agriculture' category, so they can carry one too
// (e.g. a produce aggregator/trader).
export const AGRI_BUSINESS_ROLES = ['farmer', 'supplier', 'manufacturer'];

async function notifyUser(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

async function getOwnedBusinessProfile(userId) {
  const result = await query(
    `SELECT * FROM business_profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// Belt-and-suspenders check on top of denyAdminRole('business_rep') in
// the routes: even a genuine buyer/supplier account can have a specific
// permission explicitly revoked (e.g. by admin after a fraud finding) via
// the existing role_permissions table (phase37). Only an explicit
// allowed = FALSE row blocks; no row at all means "not restricted".
async function isPermissionDenied(userId, permission) {
  const result = await query(
    `SELECT allowed FROM role_permissions WHERE user_id = $1 AND permission = $2`,
    [userId, permission]
  );
  return result.rows.length > 0 && result.rows[0].allowed === false;
}

// ============================================================
// FARM PROFILES
// ============================================================

// Storefront/chat-header view: business_profiles + farm_profiles + a
// live reliability score, shaped to feed straight into JedidaChatSuite's
// header (trustScore) and FarmProfileCard.
export async function getFarmProfile(req, res) {
  const { userId } = req.params;
  try {
    const result = await query(
      `SELECT bp.id AS business_profile_id, bp.business_type, bp.company_name, bp.status,
              bp.verification_level, bp.company_country, bp.description,
              bp.production_capacity, bp.factory_address, bp.warehouse_address, bp.stock_availability,
              u.username, u.primary_role,
              fp.seasonal_availability, fp.harvest_calendar,
              fp.certifications, fp.supply_reliability_score
       FROM business_profiles bp
       JOIN users u ON u.id = bp.user_id
       LEFT JOIN farm_profiles fp ON fp.business_profile_id = bp.id
       WHERE bp.user_id = $1
       ORDER BY bp.created_at DESC LIMIT 1`,
      [userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No business or farm profile found for this user.' });

    const profile = result.rows[0];
    const reliability = profile.supply_reliability_score ?? await recomputeReliabilityScore(userId);

    return res.json({
      profile: { ...profile, verified: profile.status === 'active', trustScore: reliability },
    });
  } catch (err) {
    console.error('Get farm profile error:', err);
    return res.status(500).json({ error: 'Could not load this farm profile.' });
  }
}

// The signed-in farmer/supplier/manufacturer updating their own profile.
// Seasonal availability / harvest calendar / farm-level certifications
// only — production capacity and factory/warehouse address already live
// on business_profiles via phase41's b2bCatalogController
// (getMyBusinessProfile / updateMyBusinessProfile), which farmer now
// shares (B2B_ROLES includes 'farmer').
export async function upsertMyFarmProfile(req, res) {
  const { seasonalAvailability, harvestCalendar, certifications } = req.body;

  try {
    const businessProfile = await getOwnedBusinessProfile(req.user.id);
    if (!businessProfile) {
      return res.status(403).json({ error: 'Complete your business verification before setting up a farm profile.' });
    }

    const result = await query(
      `INSERT INTO farm_profiles (business_profile_id, seasonal_availability, harvest_calendar, certifications)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (business_profile_id) DO UPDATE SET
         seasonal_availability = EXCLUDED.seasonal_availability,
         harvest_calendar = EXCLUDED.harvest_calendar,
         certifications = EXCLUDED.certifications
       RETURNING *`,
      [
        businessProfile.id,
        JSON.stringify(seasonalAvailability || []),
        JSON.stringify(harvestCalendar || []),
        JSON.stringify(certifications || []),
      ]
    );

    return res.json({ message: 'Farm profile updated.', farmProfile: result.rows[0] });
  } catch (err) {
    console.error('Update farm profile error:', err);
    return res.status(500).json({ error: 'Could not update your farm profile.' });
  }
}

// ============================================================
// SUPPLY CONTRACTS — repeat-purchase agreements. Distinct from
// phase43's purchase_agreements (a one-off formal deal ending in a
// single order): this generates recurring cycles, and can optionally
// reference the purchase_agreement it was negotiated from.
// ============================================================
export async function createSupplyContract(req, res) {
  const { supplierId, productId, originatingAgreementId, quantityPerCycle, unit, cycle, unitPrice, startsOn, endsOn } = req.body;
  if (!supplierId || !quantityPerCycle || !unitPrice) {
    return res.status(400).json({ error: 'supplierId, quantityPerCycle, and unitPrice are required.' });
  }
  if (await isPermissionDenied(req.user.id, 'create_orders')) {
    return res.status(403).json({ error: 'Your account is currently restricted from creating new orders or contracts. Contact Jedida support.' });
  }
  try {
    const result = await query(
      `INSERT INTO supply_contracts
         (buyer_id, supplier_id, product_id, originating_agreement_id, quantity_per_cycle, unit, cycle, unit_price, starts_on, ends_on, next_delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'monthly'),$8,COALESCE($9, CURRENT_DATE),$10,COALESCE($9, CURRENT_DATE))
       RETURNING *`,
      [req.user.id, supplierId, productId || null, originatingAgreementId || null, quantityPerCycle, unit || null, cycle || null, unitPrice, startsOn || null, endsOn || null]
    );

    await notifyUser(supplierId, 'supply_contract_created', 'New supply contract',
      'A buyer has set up a repeat supply contract with you on Jedida.', { contractId: result.rows[0].id });

    return res.status(201).json({ message: 'Supply contract created.', contract: result.rows[0] });
  } catch (err) {
    console.error('Create supply contract error:', err);
    return res.status(500).json({ error: 'Could not create this supply contract.' });
  }
}

export async function myContracts(req, res) {
  try {
    const result = await query(
      `SELECT c.*, p.title AS product_title, b.username AS buyer_username, s.username AS supplier_username
       FROM supply_contracts c
       LEFT JOIN products p ON p.id = c.product_id
       JOIN users b ON b.id = c.buyer_id
       JOIN users s ON s.id = c.supplier_id
       WHERE c.buyer_id = $1 OR c.supplier_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    return res.json({ contracts: result.rows });
  } catch (err) {
    console.error('My supply contracts error:', err);
    return res.status(500).json({ error: 'Could not load your supply contracts.' });
  }
}

export async function updateContractStatus(req, res) {
  const { id } = req.params;
  const { status, nextDeliveryDate } = req.body;
  const allowed = ['active', 'paused', 'completed', 'cancelled'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  try {
    const existing = await query(`SELECT * FROM supply_contracts WHERE id = $1`, [id]);
    const contract = existing.rows[0];
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    if (![contract.buyer_id, contract.supplier_id].includes(req.user.id)) {
      return res.status(403).json({ error: 'You are not part of this contract.' });
    }

    const result = await query(
      `UPDATE supply_contracts SET status = COALESCE($2, status), next_delivery_date = COALESCE($3, next_delivery_date)
       WHERE id = $1 RETURNING *`,
      [id, status || null, nextDeliveryDate || null]
    );

    const otherParty = req.user.id === contract.buyer_id ? contract.supplier_id : contract.buyer_id;
    await notifyUser(otherParty, 'supply_contract_updated', 'Supply contract updated',
      'A supply contract you\'re part of on Jedida was updated.', { contractId: id });

    return res.json({ message: 'Contract updated.', contract: result.rows[0] });
  } catch (err) {
    console.error('Update supply contract error:', err);
    return res.status(500).json({ error: 'Could not update this contract.' });
  }
}

// ============================================================
// RELIABILITY SCORE — computed from real order outcomes: completed
// orders count in favor, cancelled/disputed count against (disputed is
// a real, actively-set status now that phase43's disputes case
// management exists). Cached onto farm_profiles.supply_reliability_score.
// ============================================================
export async function recomputeReliabilityScore(userId) {
  try {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status IN ('completed', 'delivered_confirmed')) AS good,
         COUNT(*) FILTER (WHERE o.status IN ('cancelled', 'disputed')) AS bad
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       WHERE s.owner_id = $1`,
      [userId]
    );
    const { good, bad } = result.rows[0];
    const total = Number(good) + Number(bad);
    // No track record yet: neutral starting score rather than 0, which
    // would unfairly read as "unreliable" for a brand-new verified farm.
    const score = total === 0 ? 80 : Math.round((Number(good) / total) * 100);

    await query(
      `UPDATE farm_profiles SET supply_reliability_score = $2
       WHERE business_profile_id = (SELECT id FROM business_profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
      [userId, score]
    );

    return score;
  } catch (err) {
    console.error('Recompute reliability score error:', err);
    return 80;
  }
}

export async function getReliabilityScore(req, res) {
  const { userId } = req.params;
  try {
    const score = await recomputeReliabilityScore(userId);
    return res.json({ userId, reliabilityScore: score });
  } catch (err) {
    return res.status(500).json({ error: 'Could not compute reliability score.' });
  }
}

// ============================================================
// LOGISTICS — deliberately thin: deliveries/drivers/tracking already
// exist (deliveryController.js / trackingService.js), keyed by orderId.
// This just fills in the pickup address from the farm's registered
// business_profiles.company_address (or a named collection center) so
// a bulk order's delivery is created as a farm pickup / collection-
// center drop-off instead of a blank address field.
// ============================================================
export async function requestFarmPickup(req, res) {
  const { orderId, collectionCenter, dropoffAddress } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId is required.' });

  try {
    const orderResult = await query(
      `SELECT o.id, o.buyer_id, s.owner_id AS supplier_id, bp.company_address
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       LEFT JOIN business_profiles bp ON bp.user_id = s.owner_id AND bp.status = 'active'
       WHERE o.id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (![order.buyer_id, order.supplier_id].includes(req.user.id) && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You are not part of this order.' });
    }

    const pickupAddress = collectionCenter
      ? `Collection center: ${collectionCenter}`
      : (order.company_address || 'Farm pickup — address to be confirmed with supplier');

    const delivery = await tracking.createDeliveryForOrder(orderId, {
      pickupAddress,
      dropoffAddress: dropoffAddress || null,
    });

    return res.status(201).json({ message: 'Farm pickup scheduled.', delivery });
  } catch (err) {
    console.error('Request farm pickup error:', err);
    return res.status(500).json({ error: 'Could not schedule this pickup.' });
  }
}

// ============================================================
// CONTRACT CYCLE REMINDERS — mirrors the escrow auto-release sweep
// pattern in server.js. Deliberately does NOT auto-create or auto-charge
// an order each cycle (that would move money without a human confirming
// quantity/price still holds) — it notifies both parties when a cycle
// is due, and advances next_delivery_date so the same cycle isn't
// re-notified daily.
// ============================================================
export async function runSupplyContractCycleSweep() {
  const dueResult = await query(
    `SELECT * FROM supply_contracts WHERE status = 'active' AND next_delivery_date <= CURRENT_DATE`
  );

  const cycleDays = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };
  let notified = 0;

  for (const contract of dueResult.rows) {
    await notifyUser(contract.buyer_id, 'supply_contract_updated', 'Supply contract cycle due',
      'A recurring order under your supply contract is due today.', { contractId: contract.id });
    await notifyUser(contract.supplier_id, 'supply_contract_updated', 'Supply contract cycle due',
      'A recurring delivery under a supply contract is due today.', { contractId: contract.id });

    const days = cycleDays[contract.cycle] || 30;
    await query(
      `UPDATE supply_contracts SET next_delivery_date = next_delivery_date + $2 * INTERVAL '1 day' WHERE id = $1`,
      [contract.id, days]
    );
    notified += 1;
  }

  return { checked: dueResult.rows.length, notified };
}
