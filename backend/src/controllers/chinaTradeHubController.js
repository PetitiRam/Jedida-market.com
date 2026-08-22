import { query } from '../config/db.js';
import { B2B_ROLES } from './b2bCatalogController.js';

async function getOwnBusinessProfile(userId) {
  const result = await query(
    `SELECT * FROM business_profiles WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function notify(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// ------------------------------------------------------------
// SUPPLIER TRADE CAPABILITIES — manufacturer/supplier self-service
// ------------------------------------------------------------
export async function upsertTradeCapabilities(req, res) {
  const {
    moq, leadTimeDays,
    oemAvailable, odmAvailable, privateLabelAvailable, sampleAvailable, packagingCustomization,
    exportExperienceYears, africanMarketsServed, shippingPort, certifications
  } = req.body;

  try {
    const profile = await getOwnBusinessProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'No active business profile found for your account.' });
    if (!['manufacturer', 'supplier'].includes(profile.business_type)) {
      return res.status(403).json({ error: 'Trade capabilities apply to manufacturer and supplier accounts only.' });
    }

    const result = await query(
      `INSERT INTO supplier_trade_capabilities
         (business_profile_id, moq, lead_time_days,
          oem_available, odm_available, private_label_available, sample_available, packaging_customization,
          export_experience_years, african_markets_served, shipping_port, certifications)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (business_profile_id) DO UPDATE SET
         moq = EXCLUDED.moq,
         lead_time_days = EXCLUDED.lead_time_days,
         oem_available = EXCLUDED.oem_available,
         odm_available = EXCLUDED.odm_available,
         private_label_available = EXCLUDED.private_label_available,
         sample_available = EXCLUDED.sample_available,
         packaging_customization = EXCLUDED.packaging_customization,
         export_experience_years = EXCLUDED.export_experience_years,
         african_markets_served = EXCLUDED.african_markets_served,
         shipping_port = EXCLUDED.shipping_port,
         certifications = EXCLUDED.certifications
       RETURNING *`,
      [
        profile.id, moq || null, leadTimeDays || null,
        Boolean(oemAvailable), Boolean(odmAvailable), Boolean(privateLabelAvailable), Boolean(sampleAvailable), Boolean(packagingCustomization),
        exportExperienceYears || null, Array.isArray(africanMarketsServed) ? africanMarketsServed : [],
        shippingPort || null, Array.isArray(certifications) ? certifications : []
      ]
    );

    return res.json({ message: 'Trade capabilities saved.', capabilities: result.rows[0] });
  } catch (err) {
    console.error('Upsert trade capabilities error:', err);
    return res.status(500).json({ error: 'Could not save trade capabilities.' });
  }
}

export async function getMyTradeCapabilities(req, res) {
  try {
    const profile = await getOwnBusinessProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'No active business profile found for your account.' });
    const result = await query(`SELECT * FROM supplier_trade_capabilities WHERE business_profile_id = $1`, [profile.id]);
    return res.json({ capabilities: result.rows[0] || null });
  } catch (err) {
    console.error('Get trade capabilities error:', err);
    return res.status(500).json({ error: 'Could not load trade capabilities.' });
  }
}

// Public-ish read for buyers browsing a supplier's China-trade profile —
// same shape the B2B product detail page (master brief section 9) would
// pull from. No admin-only fields exposed.
export async function getSupplierTradeProfile(req, res) {
  try {
    const profileResult = await query(
      `SELECT bp.id, bp.company_name, bp.company_country, bp.business_type, bp.description,
              bp.factory_address, bp.warehouse_address, bp.production_capacity, bp.stock_availability
       FROM business_profiles bp WHERE bp.id = $1 AND bp.status = 'active'`,
      [req.params.businessProfileId]
    );
    const profile = profileResult.rows[0];
    if (!profile) return res.status(404).json({ error: 'Supplier not found.' });

    const [capabilities, badge] = await Promise.all([
      query(`SELECT * FROM supplier_trade_capabilities WHERE business_profile_id = $1`, [profile.id]),
      query(`SELECT * FROM africa_ready_badges WHERE business_profile_id = $1 AND revoked_at IS NULL`, [profile.id])
    ]);

    return res.json({ profile, capabilities: capabilities.rows[0] || null, africaReadyBadge: badge.rows[0] || null });
  } catch (err) {
    console.error('Get supplier trade profile error:', err);
    return res.status(500).json({ error: 'Could not load this supplier.' });
  }
}

// ------------------------------------------------------------
// FACTORY VERIFICATION
// ------------------------------------------------------------
export async function requestFactoryVerification(req, res) {
  try {
    const profile = await getOwnBusinessProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'No active business profile found for your account.' });

    const existing = await query(
      `SELECT * FROM factory_verification_requests
       WHERE business_profile_id = $1 AND status IN ('requested','scheduled','in_progress')`,
      [profile.id]
    );
    if (existing.rows[0]) return res.status(409).json({ error: 'A verification request is already in progress.', request: existing.rows[0] });

    const result = await query(
      `INSERT INTO factory_verification_requests (business_profile_id, requested_by, notes)
       VALUES ($1,$2,$3) RETURNING *`,
      [profile.id, req.user.id, req.body?.notes || null]
    );
    return res.status(201).json({ message: 'Verification requested.', request: result.rows[0] });
  } catch (err) {
    console.error('Request factory verification error:', err);
    return res.status(500).json({ error: 'Could not submit verification request.' });
  }
}

export async function myFactoryVerifications(req, res) {
  try {
    const profile = await getOwnBusinessProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'No active business profile found for your account.' });
    const requests = await query(
      `SELECT r.*,
              (SELECT row_to_json(rep) FROM (
                 SELECT * FROM factory_verification_reports WHERE verification_request_id = r.id ORDER BY created_at DESC LIMIT 1
               ) rep) AS latest_report
       FROM factory_verification_requests r WHERE r.business_profile_id = $1 ORDER BY r.created_at DESC`,
      [profile.id]
    );
    return res.json({ requests: requests.rows });
  } catch (err) {
    console.error('My factory verifications error:', err);
    return res.status(500).json({ error: 'Could not load your verification requests.' });
  }
}

// ---- Admin/verifier side ----
export async function adminListFactoryVerifications(req, res) {
  try {
    const { status } = req.query;
    const result = await query(
      `SELECT r.*, bp.company_name, bp.business_type, bp.company_country
       FROM factory_verification_requests r
       JOIN business_profiles bp ON bp.id = r.business_profile_id
       WHERE ($1::verification_workflow_status IS NULL OR r.status = $1)
       ORDER BY r.created_at DESC LIMIT 200`,
      [status || null]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error('Admin list factory verifications error:', err);
    return res.status(500).json({ error: 'Could not load verification requests.' });
  }
}

export async function adminScheduleFactoryVerification(req, res) {
  const { verifierId, scheduledFor } = req.body;
  try {
    const result = await query(
      `UPDATE factory_verification_requests
       SET status = 'scheduled', assigned_verifier_id = $2, scheduled_for = $3
       WHERE id = $1 RETURNING *`,
      [req.params.id, verifierId || req.user.id, scheduledFor || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Request not found.' });
    return res.json({ request: result.rows[0] });
  } catch (err) {
    console.error('Schedule factory verification error:', err);
    return res.status(500).json({ error: 'Could not schedule this verification.' });
  }
}

export async function adminSubmitFactoryVerificationReport(req, res) {
  const {
    businessExistenceConfirmed, factoryLocationConfirmed, machineryNotes, workforceSize,
    certificationsConfirmed, productSamplesReviewed, exportHistoryNotes, photos, overallResult, summary
  } = req.body;

  if (!overallResult || !['passed', 'failed', 'needs_more_info'].includes(overallResult)) {
    return res.status(400).json({ error: 'overallResult must be passed, failed, or needs_more_info.' });
  }

  try {
    const reqResult = await query(`SELECT * FROM factory_verification_requests WHERE id = $1`, [req.params.id]);
    const verificationRequest = reqResult.rows[0];
    if (!verificationRequest) return res.status(404).json({ error: 'Request not found.' });

    const report = await query(
      `INSERT INTO factory_verification_reports
         (verification_request_id, verified_by, business_existence_confirmed, factory_location_confirmed,
          machinery_notes, workforce_size, certifications_confirmed, product_samples_reviewed,
          export_history_notes, photos, overall_result, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        verificationRequest.id, req.user.id, Boolean(businessExistenceConfirmed), Boolean(factoryLocationConfirmed),
        machineryNotes || null, workforceSize || null, Array.isArray(certificationsConfirmed) ? certificationsConfirmed : [],
        Boolean(productSamplesReviewed), exportHistoryNotes || null, JSON.stringify(photos || []), overallResult, summary || null
      ]
    );

    await query(`UPDATE factory_verification_requests SET status = 'completed' WHERE id = $1`, [verificationRequest.id]);

    const businessResult = await query(`SELECT user_id FROM business_profiles WHERE id = $1`, [verificationRequest.business_profile_id]);
    if (businessResult.rows[0]) {
      await notify(
        businessResult.rows[0].user_id, 'factory_verification_completed', 'Factory verification completed',
        `Result: ${overallResult}.`, { verificationRequestId: verificationRequest.id }
      );
    }

    return res.status(201).json({ message: 'Report submitted.', report: report.rows[0] });
  } catch (err) {
    console.error('Submit factory verification report error:', err);
    return res.status(500).json({ error: 'Could not submit report.' });
  }
}

// ---- Africa Ready badge ----
export async function adminAwardAfricaReadyBadge(req, res) {
  const { businessProfileId, criteriaMet } = req.body;
  if (!businessProfileId || !Array.isArray(criteriaMet) || criteriaMet.length === 0) {
    return res.status(400).json({ error: 'businessProfileId and a non-empty criteriaMet list are required.' });
  }
  try {
    const result = await query(
      `INSERT INTO africa_ready_badges (business_profile_id, awarded_by, criteria_met)
       VALUES ($1,$2,$3)
       ON CONFLICT (business_profile_id) DO UPDATE SET
         awarded_by = EXCLUDED.awarded_by, criteria_met = EXCLUDED.criteria_met,
         awarded_at = now(), revoked_by = NULL, revoked_at = NULL, revoked_reason = NULL
       RETURNING *`,
      [businessProfileId, req.user.id, JSON.stringify(criteriaMet)]
    );

    const businessResult = await query(`SELECT user_id FROM business_profiles WHERE id = $1`, [businessProfileId]);
    if (businessResult.rows[0]) {
      await notify(businessResult.rows[0].user_id, 'africa_ready_badge_awarded', 'You earned the Jedida Africa Ready badge', 'Your business now displays the Africa Ready trust badge.', { businessProfileId });
    }

    return res.status(201).json({ message: 'Badge awarded.', badge: result.rows[0] });
  } catch (err) {
    console.error('Award Africa Ready badge error:', err);
    return res.status(500).json({ error: 'Could not award this badge.' });
  }
}

export async function adminRevokeAfricaReadyBadge(req, res) {
  const { reason } = req.body;
  try {
    const result = await query(
      `UPDATE africa_ready_badges SET revoked_by = $2, revoked_at = now(), revoked_reason = $3
       WHERE business_profile_id = $1 AND revoked_at IS NULL RETURNING *`,
      [req.params.businessProfileId, req.user.id, reason || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No active badge found for this business.' });

    const businessResult = await query(`SELECT user_id FROM business_profiles WHERE id = $1`, [req.params.businessProfileId]);
    if (businessResult.rows[0]) {
      await notify(businessResult.rows[0].user_id, 'africa_ready_badge_revoked', 'Africa Ready badge revoked', reason || 'Your Africa Ready badge was revoked.', {});
    }

    return res.json({ message: 'Badge revoked.', badge: result.rows[0] });
  } catch (err) {
    console.error('Revoke Africa Ready badge error:', err);
    return res.status(500).json({ error: 'Could not revoke this badge.' });
  }
}

// ------------------------------------------------------------
// PRODUCT INSPECTION — buyer-requested
// ------------------------------------------------------------
export async function requestInspection(req, res) {
  const { businessProfileId, wantedRequestId, orderId, productDescription, quantity } = req.body;
  if (!businessProfileId || !productDescription) {
    return res.status(400).json({ error: 'businessProfileId and productDescription are required.' });
  }
  try {
    const result = await query(
      `INSERT INTO inspection_requests (requested_by, business_profile_id, wanted_request_id, order_id, product_description, quantity)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, businessProfileId, wantedRequestId || null, orderId || null, productDescription, quantity || null]
    );
    return res.status(201).json({ message: 'Inspection requested.', request: result.rows[0] });
  } catch (err) {
    console.error('Request inspection error:', err);
    return res.status(500).json({ error: 'Could not submit inspection request.' });
  }
}

export async function myInspectionRequests(req, res) {
  try {
    const result = await query(
      `SELECT ir.*, bp.company_name,
              (SELECT row_to_json(rep) FROM (
                 SELECT * FROM inspection_reports WHERE inspection_request_id = ir.id ORDER BY created_at DESC LIMIT 1
               ) rep) AS latest_report
       FROM inspection_requests ir
       JOIN business_profiles bp ON bp.id = ir.business_profile_id
       WHERE ir.requested_by = $1 ORDER BY ir.created_at DESC`,
      [req.user.id]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error('My inspection requests error:', err);
    return res.status(500).json({ error: 'Could not load your inspection requests.' });
  }
}

// ---- Admin/inspector side ----
export async function adminListInspections(req, res) {
  try {
    const { status } = req.query;
    const result = await query(
      `SELECT ir.*, bp.company_name FROM inspection_requests ir
       JOIN business_profiles bp ON bp.id = ir.business_profile_id
       WHERE ($1::verification_workflow_status IS NULL OR ir.status = $1)
       ORDER BY ir.created_at DESC LIMIT 200`,
      [status || null]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error('Admin list inspections error:', err);
    return res.status(500).json({ error: 'Could not load inspection requests.' });
  }
}

export async function adminScheduleInspection(req, res) {
  const { inspectorId, scheduledFor } = req.body;
  try {
    const result = await query(
      `UPDATE inspection_requests SET status = 'scheduled', assigned_inspector_id = $2, scheduled_for = $3
       WHERE id = $1 RETURNING *`,
      [req.params.id, inspectorId || req.user.id, scheduledFor || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Request not found.' });
    return res.json({ request: result.rows[0] });
  } catch (err) {
    console.error('Schedule inspection error:', err);
    return res.status(500).json({ error: 'Could not schedule this inspection.' });
  }
}

export async function adminSubmitInspectionReport(req, res) {
  const { quantityInspected, quantityPassed, defectNotes, photos, videos, result: inspResult, summary } = req.body;
  if (!inspResult || !['approved', 'rejected', 'conditional'].includes(inspResult)) {
    return res.status(400).json({ error: 'result must be approved, rejected, or conditional.' });
  }
  try {
    const reqResult = await query(`SELECT * FROM inspection_requests WHERE id = $1`, [req.params.id]);
    const inspectionRequest = reqResult.rows[0];
    if (!inspectionRequest) return res.status(404).json({ error: 'Request not found.' });

    const report = await query(
      `INSERT INTO inspection_reports
         (inspection_request_id, inspector_id, quantity_inspected, quantity_passed, defect_notes, photos, videos, result, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [inspectionRequest.id, req.user.id, quantityInspected || null, quantityPassed || null, defectNotes || null,
        JSON.stringify(photos || []), JSON.stringify(videos || []), inspResult, summary || null]
    );

    await query(`UPDATE inspection_requests SET status = 'completed' WHERE id = $1`, [inspectionRequest.id]);
    await notify(
      inspectionRequest.requested_by, 'inspection_report_ready', 'Your inspection report is ready',
      `Result: ${inspResult}.`, { inspectionRequestId: inspectionRequest.id }
    );

    return res.status(201).json({ message: 'Report submitted.', report: report.rows[0] });
  } catch (err) {
    console.error('Submit inspection report error:', err);
    return res.status(500).json({ error: 'Could not submit report.' });
  }
}

export { B2B_ROLES as CHINA_HUB_SUPPLIER_ROLES };
