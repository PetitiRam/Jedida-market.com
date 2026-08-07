import { pool, query } from '../config/db.js';
import { invalidateLockdownCache } from './platformLockdownService.js';

// Every JSONB section this service manages, and the fields each one is
// allowed to contain. Unknown keys in a PATCH body are silently dropped —
// this is the validation boundary; nothing outside this list ever reaches
// the database.
const SECTION_COLUMNS = {
  sellerUpgrade: {
    column: 'seller_upgrade_settings',
    fields: [
      'sellerFeeAmount', 'deliveryFeeAmount', 'currency', 'mobileMoneyNumber',
      'paymentInstructions', 'sellerUpgradesEnabled', 'deliveryUpgradesEnabled',
      'requirePaymentBeforeKyc', 'requireKycBeforeApproval', 'allowAutomaticApproval',
      // Per-country pricing/providers for the one-time upgrade payment form.
      // Shape: { [ISO2 country code]: { countryName, currency, sellerAmount,
      // deliveryAmount, providers: [{ id, name }] } }. Countries not listed
      // here fall back to sellerFeeAmount/deliveryFeeAmount/currency above.
      'countryPricing'
    ]
  },
  payment: {
    column: 'payment_settings',
    fields: [
      'mobileMoneyNumber', 'alternativeMobileNumber', 'bankName', 'bankAccount',
      'accountName', 'paymentInstructions', 'acceptedMethods',
      'enableMobileMoney', 'enableBankTransfer', 'enableCash', 'enableCardPayments'
    ]
  },
  commission: {
    column: 'commission_settings',
    fields: [
      'sellerCommissionPercent', 'deliveryCommissionPercent', 'withdrawalFeeAmount',
      'minimumWithdrawal', 'maximumWithdrawal', 'platformFeePercent', 'vatPercent', 'taxesEnabled',
      'wholesaleCommissionPercent'
    ]
  },
  // Stage 3 — operational marketplace rules an admin can tune without a
  // deploy, distinct from the static legal-policy text in LegalAndSystemService.
  marketplaceRules: {
    column: 'marketplace_rules_settings',
    fields: [
      'minPurchaseAgreementAmount', 'requirePurchaseAgreementAboveAmount',
      'disputeWindowDays', 'rfqExpiryDays', 'bulkOrderMinimumUnits', 'maxOpenDisputesBeforeSuspension'
    ]
  },
  affiliate: {
    column: 'affiliate_settings',
    fields: [
      'affiliateProgramEnabled', 'upgradeCommissionPercent', 'salesCommissionPercent',
      'minimumWithdrawal', 'withdrawalMethods', 'selfReferralBlocked',
      'maxReferralsPerDeviceOrIpPerDay', 'maxCommissionsPerDayBeforeHold'
    ]
  },
  shop: {
    column: 'shop_settings',
    fields: [
      'requireShopApproval', 'maxProducts', 'maxProductImages', 'maxImageSizeMb',
      'allowedImageFormats', 'defaultShopStatus', 'allowMultipleShops', 'maxVideos', 'maxCategories'
    ]
  },
  product: {
    column: 'product_settings',
    fields: [
      'maxProducts', 'maxPhotos', 'maxVideos', 'defaultCurrency', 'allowDraftProducts',
      'requireProductApproval', 'enableReviews', 'enableRatings', 'allowProductSharing'
    ]
  },
  user: {
    column: 'user_settings',
    fields: [
      'allowRegistration', 'requireEmailVerification', 'requirePhoneVerification', 'requireUsername',
      'minPasswordLength', 'passwordComplexity', 'maxLoginAttempts', 'accountLockMinutes'
    ]
  },
  delivery: {
    column: 'delivery_settings',
    fields: [
      'deliveryRadiusKm', 'defaultDeliveryFee', 'maxDeliveryDistanceKm',
      'workingHoursStart', 'workingHoursEnd', 'allowDeliveryTracking', 'requireDeliveryVerification'
    ]
  },
  ads: {
    column: 'ad_settings',
    fields: ['featuredProductPrice', 'homepageBannerPrice', 'adDurationDays', 'maxActiveAds', 'adsEnabled', 'autoApproveAds']
  },
  ai: {
    column: 'ai_settings',
    fields: [
      'enableAiAssistant', 'enableAiSearch', 'enableAiRecommendations',
      'enableAiProductDescriptions', 'enableAiModeration', 'enableAiChat'
    ]
  },
  notifications: {
    column: 'notification_settings',
    fields: ['emailNotifications', 'smsNotifications', 'pushNotifications', 'adminAlerts', 'announcementBanner', 'maintenanceNotice']
  },
  security: {
    column: 'security_settings',
    fields: [
      'jwtExpiryMinutes', 'refreshTokenExpiryDays', 'rateLimitPerMinute',
      'sessionTimeoutMinutes', 'maxDevices', 'requireStrongPasswords', 'twoFactorEnabled'
    ]
  },
  maintenance: {
    column: 'maintenance_settings',
    fields: ['maintenanceMode', 'maintenanceMessage']
  },
  // Emergency & Quick Controls (schema_phase69) — real, enforced platform
  // kill switches. See platformLockdownService.js / platformLockdown.js
  // middleware for where these are actually read and applied; this is not
  // just a stored flag.
  emergency: {
    column: 'emergency_controls',
    fields: ['paymentsFrozen', 'partnerApisDisabled', 'loginDisabled', 'withdrawalsFrozen']
  },
  // Verified Shop trust engine (schema_phase59) — thresholds and score
  // weights an admin can tune without a deploy. See trustEngineService.js
  // for how these are actually applied.
  verifiedShop: {
    column: 'verified_shop_settings',
    fields: [
      'minCompletedOrders', 'minFollowers', 'minRealFollowerRatio', 'minTrustScore',
      'weightReliability', 'weightDelivery', 'weightQuality', 'weightSatisfaction',
      'weightResponseSpeed', 'weightFraudRisk', 'recomputeIntervalMinutes', 'autoRevokeEnabled'
    ]
  },
  // AI Protection (schema_phase60) — thresholds for the rule-based
  // fake-follower/fake-review/suspicious-order/quality-decline detectors
  // in aiProtectionService.js.
  aiProtection: {
    column: 'ai_protection_settings',
    fields: [
      'burstFollowThreshold', 'burstWindowHours', 'reviewBurstCount', 'reviewBurstWindowHours',
      'orderVelocityMultiplier', 'fastCompletionMinutes', 'qualityDeclineTrustDrop',
      'qualityDeclineFraudRiskThreshold', 'signalCooldownDays'
    ]
  }
};

// Top-level (non-JSONB) platform identity + branding columns.
const IDENTITY_FIELDS = [
  'marketplaceName', 'supportEmail', 'supportPhone', 'businessAddress',
  'country', 'defaultLanguage', 'defaultCurrency', 'defaultTimezone'
];
const IDENTITY_COLUMN_MAP = {
  marketplaceName: 'marketplace_name', supportEmail: 'support_email', supportPhone: 'support_phone',
  businessAddress: 'business_address', country: 'country', defaultLanguage: 'default_language',
  defaultCurrency: 'default_currency', defaultTimezone: 'default_timezone'
};

const BRANDING_COLUMN_MAP = {
  logoUrl: 'logo_url', faviconUrl: 'favicon_url', appIconUrl: 'app_icon_url',
  splashScreenUrl: 'splash_screen_url', footerLogoUrl: 'footer_logo_url', socialShareImageUrl: 'social_share_image_url'
};

export async function getAllSettings() {
  const result = await query('SELECT * FROM platform_settings WHERE id = 1');
  return result.rows[0];
}

export async function getSection(sectionKey) {
  const section = SECTION_COLUMNS[sectionKey];
  if (!section) throw new Error(`Unknown settings section: ${sectionKey}`);
  const result = await query(`SELECT ${section.column} AS value FROM platform_settings WHERE id = 1`);
  return result.rows[0]?.value || {};
}

// Validated, transactional partial-update of one JSONB section. Only keys
// declared in SECTION_COLUMNS[sectionKey].fields are applied; everything
// else in `patch` is ignored. Logs a before/after audit row in the same
// transaction so a change and its audit trail can never diverge.
export async function updateSection(sectionKey, patch, adminUserId) {
  const section = SECTION_COLUMNS[sectionKey];
  if (!section) throw new Error(`Unknown settings section: ${sectionKey}`);

  const filteredPatch = {};
  for (const field of section.fields) {
    if (patch[field] !== undefined) filteredPatch[field] = patch[field];
  }
  if (Object.keys(filteredPatch).length === 0) {
    return getSection(sectionKey);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(`SELECT ${section.column} AS value FROM platform_settings WHERE id = 1 FOR UPDATE`);
    const beforeValue = before.rows[0]?.value || {};

    const result = await client.query(
      `UPDATE platform_settings SET ${section.column} = ${section.column} || $1::jsonb, updated_at = now()
       WHERE id = 1 RETURNING ${section.column} AS value`,
      [JSON.stringify(filteredPatch)]
    );
    const afterValue = result.rows[0].value;

    await client.query(
      `INSERT INTO settings_audit_log (section, changed_by, before_value, after_value) VALUES ($1,$2,$3,$4)`,
      [sectionKey, adminUserId, beforeValue, afterValue]
    );

    await client.query('COMMIT');
    if (sectionKey === 'maintenance' || sectionKey === 'emergency') {
      invalidateLockdownCache();
    }
    return afterValue;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateIdentity(patch, adminUserId) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of IDENTITY_FIELDS) {
    if (patch[field] === undefined) continue;
    sets.push(`${IDENTITY_COLUMN_MAP[field]} = $${i}`);
    values.push(patch[field]);
    i += 1;
  }
  if (sets.length === 0) return getAllSettings();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM platform_settings WHERE id = 1 FOR UPDATE');
    sets.push('updated_at = now()');
    const result = await client.query(`UPDATE platform_settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`, values);
    await client.query(
      `INSERT INTO settings_audit_log (section, changed_by, before_value, after_value) VALUES ($1,$2,$3,$4)`,
      ['identity', adminUserId, before.rows[0], result.rows[0]]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Branding uploads: each field must be a Cloudinary URL already produced by
// POST /api/uploads (via MediaUploader on the frontend) — this function
// never accepts a raw file, only the URL the upload endpoint already
// validated and returned. Passing null clears/deletes that image.
export async function updateBranding(patch, adminUserId) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of Object.keys(BRANDING_COLUMN_MAP)) {
    if (patch[field] === undefined) continue;
    sets.push(`${BRANDING_COLUMN_MAP[field]} = $${i}`);
    values.push(patch[field] || null);
    i += 1;
  }
  if (sets.length === 0) return getAllSettings();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM platform_settings WHERE id = 1 FOR UPDATE');
    sets.push('updated_at = now()');
    const result = await client.query(`UPDATE platform_settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`, values);
    await client.query(
      `INSERT INTO settings_audit_log (section, changed_by, before_value, after_value) VALUES ($1,$2,$3,$4)`,
      ['branding', adminUserId, before.rows[0], result.rows[0]]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getAuditLog(section, limit = 50) {
  const where = section ? 'WHERE section = $1' : '';
  const values = section ? [section, limit] : [limit];
  const limitParam = section ? '$2' : '$1';
  const result = await query(
    `SELECT sal.*, u.full_name, u.email FROM settings_audit_log sal
     LEFT JOIN users u ON u.id = sal.changed_by
     ${where} ORDER BY sal.created_at DESC LIMIT ${limitParam}`,
    values
  );
  return result.rows;
}

export { SECTION_COLUMNS };
