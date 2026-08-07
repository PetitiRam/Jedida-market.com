import { query } from '../config/db.js';
import * as settingsService from '../services/settingsService.js';
import { creditUpgradeCommission } from '../services/affiliateService.js';
import { SYSTEM_AI_USER_ID } from '../chat/aiAssistant.js';

const PAYMENT_AMOUNT = 1000;
const PAYMENT_CURRENCY = 'UGX';
const PAYMENT_NUMBER = '0755903781';

const REQUIRED_APPLICATION_FIELDS = {
  seller: ['businessName'],
  delivery: [],
  manufacturer: ['businessName', 'registrationNumber'],
  supplier: ['businessName', 'registrationNumber'],
  dropshipper: ['businessName'],
  farmer: ['businessName']
};

// Roles that are companies rather than individuals — they go through
// business verification (business_profiles + business_verification_documents)
// instead of the personal KYC step. 'seller' is deliberately excluded
// here: its existing national-ID KYC flow is untouched by this phase.
const BUSINESS_ROLES = ['manufacturer', 'supplier', 'dropshipper', 'farmer', 'host'];

// Business roles that must attach at least one verification document
// before their profile can move past kyc_pending. Dropshipper and farmer
// mirror delivery's lighter bar (payment verification is enough):
// dropshipper never holds inventory, and many farms aren't formally
// incorporated, so a registration document isn't a fair universal bar.
const BUSINESS_ROLES_REQUIRING_DOCS = ['manufacturer', 'supplier'];

function assertValidRole(role) {
  return ['seller', 'delivery', ...BUSINESS_ROLES].includes(role);
}

// ============================================================
// ONE-TIME UPGRADE PRICING — admin-configurable per country via
// Admin Dashboard → Settings → Upgrades (sellerUpgrade.countryPricing).
// Falls back to this built-in default map, then to the flat
// sellerFeeAmount/deliveryFeeAmount if a country isn't listed at all.
// ============================================================
const DEFAULT_COUNTRY_PRICING = {
  UG: { countryName: 'Uganda', currency: 'UGX', sellerAmount: 2000, deliveryAmount: 2000,
    providers: [{ id: 'mtn', name: 'MTN Mobile Money' }, { id: 'airtel', name: 'Airtel Money' }] },
  KE: { countryName: 'Kenya', currency: 'KES', sellerAmount: 150, deliveryAmount: 150,
    providers: [{ id: 'mpesa', name: 'M-Pesa' }, { id: 'airtel', name: 'Airtel Money' }] },
  TZ: { countryName: 'Tanzania', currency: 'TZS', sellerAmount: 4500, deliveryAmount: 4500,
    providers: [{ id: 'mpesa', name: 'M-Pesa' }, { id: 'tigopesa', name: 'Tigo Pesa' }, { id: 'airtel', name: 'Airtel Money' }] },
  RW: { countryName: 'Rwanda', currency: 'RWF', sellerAmount: 2000, deliveryAmount: 2000,
    providers: [{ id: 'mtn', name: 'MTN Mobile Money' }, { id: 'airtel', name: 'Airtel Money' }] },
  NG: { countryName: 'Nigeria', currency: 'NGN', sellerAmount: 700, deliveryAmount: 700,
    providers: [{ id: 'mtn', name: 'MTN MoMo' }, { id: 'opay', name: 'OPay' }] },
  GH: { countryName: 'Ghana', currency: 'GHS', sellerAmount: 12, deliveryAmount: 12,
    providers: [{ id: 'mtn', name: 'MTN Mobile Money' }, { id: 'vodafone', name: 'Vodafone Cash' }, { id: 'airteltigo', name: 'AirtelTigo Money' }] },
  ZA: { countryName: 'South Africa', currency: 'ZAR', sellerAmount: 15, deliveryAmount: 15,
    providers: [{ id: 'mtn', name: 'MTN Mobile Money' }, { id: 'vodapay', name: 'VodaPay' }] }
};
const FALLBACK_PROVIDERS = [{ id: 'mobile_money', name: 'Mobile Money' }];

async function loadCountryPricing() {
  let configured = {};
  try {
    const section = await settingsService.getSection('sellerUpgrade');
    configured = section?.countryPricing || {};
  } catch {
    configured = {};
  }
  // Admin-configured countries override/extend the built-in defaults.
  return { ...DEFAULT_COUNTRY_PRICING, ...configured };
}

function pricingForCountry(map, countryCode, role) {
  const entry = map[countryCode];
  if (!entry) {
    return {
      countryName: countryCode || 'Other',
      currency: PAYMENT_CURRENCY,
      amount: PAYMENT_AMOUNT,
      providers: FALLBACK_PROVIDERS
    };
  }
  return {
    countryName: entry.countryName || countryCode,
    currency: entry.currency || PAYMENT_CURRENCY,
    amount: role === 'delivery' ? (entry.deliveryAmount ?? entry.sellerAmount ?? PAYMENT_AMOUNT)
                                 : (entry.sellerAmount ?? entry.deliveryAmount ?? PAYMENT_AMOUNT),
    providers: entry.providers?.length ? entry.providers : FALLBACK_PROVIDERS
  };
}

// ============================================================
// Public — the redesigned upgrade form calls this to populate the
// country selector, mobile money providers, and read-only amount
// before the user submits payment. No auth required.
// ============================================================
export async function getUpgradePricing(req, res) {
  try {
    const map = await loadCountryPricing();
    const countries = Object.entries(map).map(([code, entry]) => ({
      code,
      countryName: entry.countryName || code,
      currency: entry.currency || PAYMENT_CURRENCY,
      sellerAmount: entry.sellerAmount ?? PAYMENT_AMOUNT,
      deliveryAmount: entry.deliveryAmount ?? PAYMENT_AMOUNT,
      providers: entry.providers?.length ? entry.providers : FALLBACK_PROVIDERS
    }));
    return res.json({ countries, defaultCountry: 'UG' });
  } catch (err) {
    console.error('Get upgrade pricing error:', err);
    return res.status(500).json({ error: 'Could not load upgrade pricing.' });
  }
}

// ============================================================
// STEP 1 — Upgrade request. Auto-attaches full_name/email/phone_number
// from the authenticated account. Creates the request in pending_payment.
// ============================================================
export async function requestUpgrade(req, res) {
  const { requestedRole, applicationData } = req.body;
  const userId = req.user.id;

  if (!assertValidRole(requestedRole)) {
    return res.status(400).json({ error: 'Requested role must be seller or delivery.' });
  }

  const data = applicationData || {};
  const required = REQUIRED_APPLICATION_FIELDS[requestedRole];
  const missing = required.filter((f) => !data[f] || !String(data[f]).trim());
  if (missing.length > 0) {
    return res.status(400).json({ error: `Please provide: ${missing.join(', ')}.` });
  }

  try {
    const userResult = await query(
      'SELECT full_name, email, phone_number FROM users WHERE id = $1',
      [userId]
    );
    const account = userResult.rows[0];

    const existing = await query(
      `SELECT id, status FROM role_upgrades
       WHERE user_id = $1 AND requested_role = $2
       AND status NOT IN ('approved','rejected','payment_rejected','kyc_rejected')`,
      [userId, requestedRole]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have an active upgrade request in progress.', upgrade: existing.rows[0] });
    }

    const result = await query(
      `INSERT INTO role_upgrades (user_id, requested_role, status, verification_fee_amount, application_data, applicant_snapshot)
       VALUES ($1, $2, 'pending_payment', $3, $4, $5) RETURNING *`,
      [userId, requestedRole, PAYMENT_AMOUNT, data, account]
    );

    return res.status(201).json({
      message: `Request created. Send ${PAYMENT_AMOUNT} ${PAYMENT_CURRENCY} to ${PAYMENT_NUMBER} to continue.`,
      paymentNumber: PAYMENT_NUMBER,
      paymentAmount: PAYMENT_AMOUNT,
      paymentCurrency: PAYMENT_CURRENCY,
      upgrade: result.rows[0]
    });
  } catch (err) {
    console.error('Request upgrade error:', err);
    return res.status(500).json({ error: 'Could not create upgrade request.' });
  }
}

// ============================================================
// SINGLE-FORM ONE-TIME PAYMENT — powers the redesigned Upgrade page.
// Creates the role_upgrades request AND submits the mobile money payment
// reference in one call, reusing the exact same state machine as the
// classic requestUpgrade → submitPayment flow (no new statuses, no
// shortcuts around admin verification or, for sellers, KYC/approval).
// ============================================================
export async function submitOneTimeUpgrade(req, res) {
  const { requestedRole, country, mobileProvider, mobileNumber, businessName, registrationNumber } = req.body;
  const userId = req.user.id;

  if (!assertValidRole(requestedRole)) {
    return res.status(400).json({ error: 'Requested role must be seller, delivery, manufacturer, supplier, dropshipper, or farmer.' });
  }
  if (!country) return res.status(400).json({ error: 'Country is required.' });
  if (!mobileProvider) return res.status(400).json({ error: 'Mobile money provider is required.' });
  if (!mobileNumber || !String(mobileNumber).trim()) {
    return res.status(400).json({ error: 'Mobile money number is required.' });
  }
  if ((requestedRole === 'seller' || BUSINESS_ROLES.includes(requestedRole)) && !String(businessName || '').trim()) {
    return res.status(400).json({ error: 'Shop / business name is required for this upgrade.' });
  }
  if (BUSINESS_ROLES_REQUIRING_DOCS.includes(requestedRole) && !String(registrationNumber || '').trim()) {
    return res.status(400).json({ error: 'Business registration number is required for manufacturer and supplier upgrades.' });
  }

  try {
    const existing = await query(
      `SELECT id, status FROM role_upgrades
       WHERE user_id = $1 AND requested_role = $2
       AND status NOT IN ('approved','rejected','payment_rejected','kyc_rejected')`,
      [userId, requestedRole]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have an active upgrade request in progress.', upgrade: existing.rows[0] });
    }

    const userResult = await query('SELECT full_name, email, phone_number FROM users WHERE id = $1', [userId]);
    const account = userResult.rows[0];

    const map = await loadCountryPricing();
    const pricing = pricingForCountry(map, country, requestedRole);

    const applicationData = {
      businessName: businessName || null,
      registrationNumber: BUSINESS_ROLES.includes(requestedRole) ? (registrationNumber || null) : undefined,
      country,
      countryName: pricing.countryName,
      mobileProvider,
      mobileNumber
    };

    const paymentReference = `${mobileProvider}-${String(mobileNumber).replace(/\D/g, '').slice(-6)}-${Date.now()}`;

    const inserted = await query(
      `INSERT INTO role_upgrades
         (user_id, requested_role, status, verification_fee_amount, application_data, applicant_snapshot,
          payment_reference)
       VALUES ($1, $2, 'payment_submitted', $3, $4, $5, $6) RETURNING *`,
      [userId, requestedRole, pricing.amount, applicationData, account, paymentReference]
    );
    const upgrade = inserted.rows[0];

    // Manufacturer/supplier/dropshipper carry a company profile alongside
    // the upgrade request — created up front so business verification
    // (submitBusinessVerification) has something to attach documents to,
    // and so it shows up for admin review even before docs are uploaded.
    if (BUSINESS_ROLES.includes(requestedRole)) {
      await query(
        `INSERT INTO business_profiles
           (user_id, upgrade_id, business_type, company_name, registration_number,
            company_country, business_email, business_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, upgrade.id, requestedRole, businessName, registrationNumber || null,
          pricing.countryName, account.email, account.phone_number]
      );
    }

    await query(
      `INSERT INTO role_upgrade_events (upgrade_id, action, from_status, to_status, performed_by, note)
       VALUES ($1, 'submit_one_time_payment', 'pending_payment', 'payment_submitted', $2, $3)`,
      [upgrade.id, userId, `${pricing.currency} ${pricing.amount} via ${mobileProvider} (${mobileNumber})`]
    );

    return res.status(201).json({
      message: `Payment of ${pricing.currency} ${pricing.amount} submitted. An admin will verify it shortly.`,
      amount: pricing.amount,
      currency: pricing.currency,
      upgrade
    });
  } catch (err) {
    console.error('Submit one-time upgrade error:', err);
    return res.status(500).json({ error: 'Could not submit your upgrade payment.' });
  }
}

const ROLE_LABELS = {
  seller: 'seller', delivery: 'delivery', manufacturer: 'manufacturer',
  supplier: 'supplier', dropshipper: 'dropshipper', farmer: 'farmer', host: 'host'
};

// ============================================================
// AI ASSISTANT GREETING — called once when a user lands on the Upgrade
// page (before they've submitted anything). Posts the marketplace's own
// mobile money receiving details (number/amount/currency — NOT anything
// belonging to the user) as an AI chat message in their admin thread, and
// mirrors the same text into their notifications feed. Debounced against
// duplicate sends (page reloads, effect re-fires, etc.) by checking for a
// recent identical AI message first.
// ============================================================
export async function sendPaymentInstructions(req, res) {
  const { requestedRole, country } = req.body;
  const userId = req.user.id;
  const role = assertValidRole(requestedRole) ? requestedRole : 'seller';

  try {
    const map = await loadCountryPricing();
    const pricing = pricingForCountry(map, country, role);
    const providerNames = pricing.providers.map((p) => p.name).join(' or ');
    const roleLabel = ROLE_LABELS[role] || role;

    const body = `👋 To complete your ${roleLabel} upgrade, send ${pricing.currency} ${pricing.amount} via ${providerNames} to ${PAYMENT_NUMBER} (Jedida Pay — our official receiving number). Enter the mobile number you're paying *from* in the form below, then tap "Upgrade Now" and we'll match it to your payment automatically. Reply here anytime if you need a hand.`;

    // Skip re-sending if we already greeted this user in the last 2 minutes
    // (covers effect re-fires / fast page reloads) so it doesn't spam.
    const recent = await query(
      `SELECT id FROM chat_messages
       WHERE user_id = $1 AND sender_id = $2 AND body = $3 AND created_at > now() - interval '2 minutes'
       LIMIT 1`,
      [userId, SYSTEM_AI_USER_ID, body]
    );

    if (recent.rows.length === 0) {
      await query(
        'INSERT INTO chat_messages (user_id, sender_id, body) VALUES ($1,$2,$3)',
        [userId, SYSTEM_AI_USER_ID, body]
      );
      await query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'system_announcement', 'Upgrade payment details', $2)`,
        [userId, body]
      );
    }

    return res.json({
      message: body,
      paymentNumber: PAYMENT_NUMBER,
      amount: pricing.amount,
      currency: pricing.currency,
      providers: pricing.providers
    });
  } catch (err) {
    console.error('Send payment instructions error:', err);
    return res.status(500).json({ error: 'Could not send payment instructions.' });
  }
}

// ============================================================
// STEP 2 — Payment submission. Requires status === pending_payment.
// Cannot be skipped or reordered.
// ============================================================
export async function submitPayment(req, res) {
  const { upgradeId, paymentReference, proofOfPaymentUrl } = req.body;
  const userId = req.user.id;

  if (!paymentReference) {
    return res.status(400).json({ error: 'Payment reference is required.' });
  }

  try {
    const result = await query(
      `UPDATE role_upgrades
       SET status = 'payment_submitted', payment_reference = $1, proof_of_payment_url = $2
       WHERE id = $3 AND user_id = $4 AND status = 'pending_payment'
       RETURNING *`,
      [paymentReference, proofOfPaymentUrl || null, upgradeId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No upgrade request awaiting payment was found for your account.' });
    }

    return res.json({
      message: 'Payment submitted. An admin will verify it shortly — you can message the admin team in the meantime.',
      upgrade: result.rows[0]
    });
  } catch (err) {
    console.error('Submit payment error:', err);
    return res.status(500).json({ error: 'Could not submit payment.' });
  }
}

// ============================================================
// STEP 3 — KYC submission. Requires status === payment_verified.
// Cannot happen before payment is verified by an admin.
// ============================================================
export async function submitKyc(req, res) {
  const { upgradeId, nationalIdFrontUrl, nationalIdBackUrl, selfieUrl } = req.body;
  const userId = req.user.id;

  if (!nationalIdFrontUrl || !nationalIdBackUrl) {
    return res.status(400).json({ error: 'Both sides of your national ID are required.' });
  }

  try {
    const upgradeResult = await query(
      `SELECT * FROM role_upgrades WHERE id = $1 AND user_id = $2`,
      [upgradeId, userId]
    );
    const upgrade = upgradeResult.rows[0];
    if (!upgrade) return res.status(404).json({ error: 'Upgrade request not found.' });
    if (upgrade.status !== 'payment_verified') {
      return res.status(400).json({ error: 'KYC can only be submitted after your payment has been verified.' });
    }

    const docResult = await query(
      `INSERT INTO kyc_documents (user_id, upgrade_id, national_id_front_url, national_id_back_url, selfie_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, upgradeId, nationalIdFrontUrl, nationalIdBackUrl, selfieUrl || null]
    );
    await query(`UPDATE role_upgrades SET status = 'kyc_pending' WHERE id = $1`, [upgradeId]);

    return res.status(201).json({
      message: 'KYC documents submitted. An admin will review them shortly.',
      document: docResult.rows[0]
    });
  } catch (err) {
    console.error('Submit KYC error:', err);
    return res.status(500).json({ error: 'Could not submit KYC documents.' });
  }
}

// ============================================================
// STEP 3 (business roles) — Business verification. Requires status
// === payment_verified, same gate submitKyc uses. Manufacturer/supplier
// must attach at least one document; dropshipper can call this to save
// company details without documents (see BUSINESS_ROLES_REQUIRING_DOCS),
// though most dropshippers will simply be approved straight off
// payment_verified via requiredStatusForApproval.
// ============================================================
export async function submitBusinessVerification(req, res) {
  const { upgradeId, companyAddress, website, description, taxId, documents } = req.body;
  const userId = req.user.id;

  try {
    const upgradeResult = await query(`SELECT * FROM role_upgrades WHERE id = $1 AND user_id = $2`, [upgradeId, userId]);
    const upgrade = upgradeResult.rows[0];
    if (!upgrade) return res.status(404).json({ error: 'Upgrade request not found.' });
    if (!BUSINESS_ROLES.includes(upgrade.requested_role)) {
      return res.status(400).json({ error: 'Business verification only applies to manufacturer, supplier, dropshipper, and farmer upgrades.' });
    }
    if (upgrade.status !== 'payment_verified') {
      return res.status(400).json({ error: 'Business verification can only be submitted after your payment has been verified.' });
    }

    const profileResult = await query(`SELECT * FROM business_profiles WHERE upgrade_id = $1`, [upgradeId]);
    const profile = profileResult.rows[0];
    if (!profile) return res.status(404).json({ error: 'Business profile not found for this upgrade.' });

    const docs = Array.isArray(documents) ? documents.filter((d) => d?.fileUrl) : [];
    if (BUSINESS_ROLES_REQUIRING_DOCS.includes(upgrade.requested_role) && docs.length === 0) {
      return res.status(400).json({ error: 'At least one verification document (business license, incorporation certificate, or tax registration) is required.' });
    }

    await query(
      `UPDATE business_profiles SET company_address = $1, website = $2, description = $3, tax_id = $4 WHERE id = $5`,
      [companyAddress || null, website || null, description || null, taxId || null, profile.id]
    );

    for (const doc of docs) {
      await query(
        `INSERT INTO business_verification_documents (business_profile_id, doc_type, file_name, file_url)
         VALUES ($1, $2, $3, $4)`,
        [profile.id, doc.docType || 'other', doc.fileName || null, doc.fileUrl]
      );
    }

    await query(`UPDATE role_upgrades SET status = 'kyc_pending' WHERE id = $1`, [upgradeId]);

    return res.status(201).json({
      message: 'Business verification submitted. An admin will review your documents shortly.',
      documentsSubmitted: docs.length
    });
  } catch (err) {
    console.error('Submit business verification error:', err);
    return res.status(500).json({ error: 'Could not submit business verification.' });
  }
}

export async function myUpgradeStatus(req, res) {
  try {
    const upgrades = await query(
      `SELECT * FROM role_upgrades WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    const kycDocs = await query(
      `SELECT * FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    const businessProfiles = await query(
      `SELECT bp.*,
              COALESCE(json_agg(bvd.* ORDER BY bvd.created_at) FILTER (WHERE bvd.id IS NOT NULL), '[]') AS documents
       FROM business_profiles bp
       LEFT JOIN business_verification_documents bvd ON bvd.business_profile_id = bp.id
       WHERE bp.user_id = $1
       GROUP BY bp.id
       ORDER BY bp.created_at DESC`,
      [req.user.id]
    );
    return res.json({
      upgrades: upgrades.rows,
      kycDocuments: kycDocs.rows,
      businessProfiles: businessProfiles.rows,
      paymentInstructions: { number: PAYMENT_NUMBER, amount: PAYMENT_AMOUNT, currency: PAYMENT_CURRENCY }
    });
  } catch (err) {
    console.error('My upgrade status error:', err);
    return res.status(500).json({ error: 'Could not load upgrade status.' });
  }
}

// ============================================================
// ADMIN — single endpoint driving every stage transition. Enforces the
// state machine: each action is only valid from its required prior status.
// ============================================================
const VALID_TRANSITIONS = {
  verify_payment: { from: 'payment_submitted', to: 'payment_verified' },
  reject_payment: { from: 'payment_submitted', to: 'payment_rejected' },
  verify_kyc:     { from: 'kyc_pending', to: 'kyc_verified' },
  reject_kyc:     { from: 'kyc_pending', to: 'kyc_rejected' },
  approve:        { from: null, to: 'approved' }, // valid "from" depends on role — see below
  reject:         { from: null, to: 'rejected' } // admin can reject from any non-terminal state
};

// Sellers, manufacturers, and suppliers go through a verification step
// before approval (personal KYC for sellers, business document
// verification for manufacturer/supplier — see submitBusinessVerification
// below). Delivery partners (per the onboarding copy in
// DeliveryUpgrade.jsx) verify KYC later from their dashboard, and
// dropshippers never hold inventory or production capacity to verify,
// so both only require a verified payment. Farmer and host get the same
// lighter gate — see BUSINESS_ROLES_REQUIRING_DOCS above. Host's deeper,
// per-property verification (identity/ownership/address/docs) is added
// in Phase F rather than gating the account-level upgrade here.
function requiredStatusForApproval(role) {
  return ['delivery', 'dropshipper', 'farmer', 'host'].includes(role) ? 'payment_verified' : 'kyc_verified';
}

export async function listUpgrades(req, res) {
  const { status } = req.query;
  const where = status ? 'WHERE ru.status = $1' : '';
  const values = status ? [status] : [];
  const result = await query(
    `SELECT ru.*, u.full_name, u.email, u.username,
            kd.id AS kyc_document_id, kd.national_id_front_url, kd.national_id_back_url, kd.selfie_url, kd.status AS kyc_status,
            bp.id AS business_profile_id, bp.company_name, bp.registration_number, bp.tax_id,
            bp.company_country, bp.company_address, bp.website, bp.description AS business_description,
            bp.status AS business_profile_status,
            COALESCE(
              (SELECT json_agg(bvd.* ORDER BY bvd.created_at) FROM business_verification_documents bvd WHERE bvd.business_profile_id = bp.id),
              '[]'
            ) AS business_documents
     FROM role_upgrades ru
     JOIN users u ON u.id = ru.user_id
     LEFT JOIN kyc_documents kd ON kd.upgrade_id = ru.id
     LEFT JOIN business_profiles bp ON bp.upgrade_id = ru.id
     ${where}
     ORDER BY ru.created_at DESC`,
    values
  );
  res.json({ upgrades: result.rows });
}

export async function reviewUpgrade(req, res) {
  const { id } = req.params;
  const { action, notes } = req.body;

  const transition = VALID_TRANSITIONS[action];
  if (!transition) {
    return res.status(400).json({ error: 'Invalid action. Use verify_payment, reject_payment, verify_kyc, reject_kyc, approve, or reject.' });
  }

  try {
    const upgradeResult = await query('SELECT * FROM role_upgrades WHERE id = $1', [id]);
    const upgrade = upgradeResult.rows[0];
    if (!upgrade) return res.status(404).json({ error: 'Upgrade request not found.' });

    if (transition.from && upgrade.status !== transition.from) {
      return res.status(400).json({
        error: `This action requires status "${transition.from}", but the request is currently "${upgrade.status}". Steps cannot be skipped or reordered.`
      });
    }
    if (action === 'approve') {
      const required = requiredStatusForApproval(upgrade.requested_role);
      if (upgrade.status !== required) {
        return res.status(400).json({
          error: `This action requires status "${required}", but the request is currently "${upgrade.status}". Steps cannot be skipped or reordered.`
        });
      }
    }
    if (action === 'reject' && ['approved', 'rejected'].includes(upgrade.status)) {
      return res.status(400).json({ error: 'This request has already reached a final state.' });
    }

    await query(
      `UPDATE role_upgrades SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3`,
      [transition.to, req.user.id, id]
    );

    await query(
      `INSERT INTO role_upgrade_events (upgrade_id, action, from_status, to_status, performed_by, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, action, upgrade.status, transition.to, req.user.id, notes || null]
    );

    if (action === 'verify_payment') {
      await query(`UPDATE role_upgrades SET verification_fee_paid = TRUE WHERE id = $1`, [id]);
    }

    if (action === 'verify_kyc' || action === 'reject_kyc') {
      await query(
        `UPDATE kyc_documents SET status = $1, reviewed_by = $2, reviewed_at = now(), reviewer_notes = $3 WHERE upgrade_id = $4`,
        [action === 'verify_kyc' ? 'verified' : 'rejected', req.user.id, notes || null, id]
      );
      if (action === 'reject_kyc' && BUSINESS_ROLES.includes(upgrade.requested_role)) {
        await query(
          `UPDATE business_profiles SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), reviewer_notes = $2 WHERE upgrade_id = $3`,
          [req.user.id, notes || null, id]
        );
      }
    }

    if (action === 'reject' && BUSINESS_ROLES.includes(upgrade.requested_role)) {
      await query(
        `UPDATE business_profiles SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), reviewer_notes = $2 WHERE upgrade_id = $3`,
        [req.user.id, notes || null, id]
      );
    }

    // ONLY the final "approve" action grants the role — this is the single
    // point where primary_role changes, so a user cannot reach the seller/
    // delivery dashboard by any path that skips payment or KYC verification.
    if (action === 'approve') {
      await query(`UPDATE users SET primary_role = $1 WHERE id = $2`, [upgrade.requested_role, upgrade.user_id]);
      if (BUSINESS_ROLES.includes(upgrade.requested_role)) {
        await query(
          `UPDATE business_profiles SET status = 'active', reviewed_by = $1, reviewed_at = now() WHERE upgrade_id = $2`,
          [req.user.id, upgrade.id]
        );
      }
      // Never blocks or fails the approval — the service catches its own errors.
      await creditUpgradeCommission(upgrade);
    }

    const notificationCopy = {
      verify_payment: { title: 'Payment verified', body: 'Your payment was verified. Please submit your KYC documents to continue.' },
      reject_payment: { title: 'Payment rejected', body: notes || 'Your payment could not be verified. Please contact the admin team via chat.' },
      verify_kyc:     { title: 'KYC verified', body: 'Your identity documents were verified. Your application is awaiting final approval.' },
      reject_kyc:     { title: 'KYC rejected', body: notes || 'Your identity documents were rejected. Please contact the admin team via chat.' },
      approve:        { title: `You're approved as a ${upgrade.requested_role}!`, body: `Welcome aboard — you can now access your ${upgrade.requested_role} dashboard.` 
},
      reject:          { title: 'Application rejected', body: notes || 'Your upgrade application was rejected. Please contact the admin team via chat.' }
    }[action];

    await query(
      `INSERT INTO notifications (user_id, type, title, body, sent_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        upgrade.user_id,
        action === 'approve' ? 'shop_approved' : action.includes('reject') ? 'shop_rejected' : 'system_announcement',
        notificationCopy.title, notificationCopy.body, req.user.id,
        { requestedRole: upgrade.requested_role, upgradeId: id, action }
      ]
    );

    return res.json({ message: `Upgrade request updated: ${transition.to}.` });
  } catch (err) {
    console.error('Review upgrade error:', err);
    return res.status(500).json({ error: 'Could not process this request.' });
  }
}
export async function getUpgradeHistory(req, res) {
  const { id } = req.params;
  const result = await query(
    `SELECT e.*, u.full_name AS performed_by_name
     FROM role_upgrade_events e
     LEFT JOIN users u ON u.id = e.performed_by
     WHERE e.upgrade_id = $1 ORDER BY e.created_at ASC`,
    [id]
  );
  res.json({ events: result.rows });
}

export async function listPendingUpgrades(req, res) {
  try {
    const result = await query(
      `SELECT ru.*, u.full_name, u.email, u.username
       FROM role_upgrades ru
       JOIN users u ON u.id = ru.user_id
       WHERE ru.status IN ('pending_payment', 'payment_submitted', 'kyc_pending')
       ORDER BY ru.created_at DESC`
    );

    return res.json({ upgrades: result.rows });
  } catch (err) {
    console.error('List pending upgrades error:', err);
    return res.status(500).json({ error: 'Could not load pending upgrades' });
  }
}
