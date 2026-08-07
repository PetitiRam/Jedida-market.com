import { query } from '../config/db.js';

// Owner types treated as an established hospitality business rather than
// an individual — drives the auto "Business Ready" badge.
const BUSINESS_READY_OWNER_TYPES = ['hotel', 'hospitality_company', 'corporate_provider', 'property_agency', 'tour_company'];

export const PROPERTY_MANUAL_BADGES = ['luxury_stay', 'family_friendly'];
export const HOST_MANUAL_FIELDS = { premium_host: 'premium_tier', super_responsive: 'responsive_tier' };

// Recomputes a property's rating rollup + trust badges after a review is
// created or replied to. Auto badges are derived fresh every call; manual
// ones are read from manual_badges and merged in, so an admin's toggle is
// never overwritten by this recompute.
export async function recomputePropertyTrust(client, propertyId) {
  const runner = client || { query };
  const [propResult, statsResult] = await Promise.all([
    runner.query(`SELECT owner_type, verification_status, manual_badges FROM stays_properties WHERE id = $1`, [propertyId]),
    runner.query(
      `SELECT COUNT(*) AS n, AVG(overall_rating) AS avg_overall, AVG(cleanliness) AS avg_cleanliness
       FROM stays_reviews WHERE property_id = $1`,
      [propertyId]
    ),
  ]);
  const property = propResult.rows[0];
  if (!property) return;
  const stats = statsResult.rows[0];
  const reviewsCount = Number(stats.n) || 0;
  const avgRating = stats.avg_overall != null ? Math.round(Number(stats.avg_overall) * 100) / 100 : null;
  const avgCleanliness = stats.avg_cleanliness != null ? Number(stats.avg_cleanliness) : null;

  const autoBadges = [];
  if (property.verification_status === 'active') autoBadges.push('verified_property');
  if (BUSINESS_READY_OWNER_TYPES.includes(property.owner_type)) autoBadges.push('business_ready');
  if (reviewsCount >= 3 && avgRating >= 4.8) autoBadges.push('top_rated_stay');
  if (reviewsCount >= 3 && avgCleanliness >= 4.5) autoBadges.push('clean_and_safe');

  const manualBadges = Array.isArray(property.manual_badges) ? property.manual_badges : [];
  const trustBadges = [...new Set([...autoBadges, ...manualBadges])];

  await runner.query(
    `UPDATE stays_properties SET avg_rating = $1, reviews_count = $2, trust_badges = $3 WHERE id = $4`,
    [avgRating, reviewsCount, JSON.stringify(trustBadges), propertyId]
  );
}

export async function recomputeHostTrust(client, hostId) {
  const runner = client || { query };
  const [profileResult, statsResult] = await Promise.all([
    runner.query(`SELECT premium_tier, responsive_tier FROM stays_host_profiles WHERE user_id = $1`, [hostId]),
    runner.query(`SELECT COUNT(*) AS n, AVG(overall_rating) AS avg_overall FROM stays_reviews WHERE host_id = $1`, [hostId]),
  ]);
  const stats = statsResult.rows[0];
  const reviewsCount = Number(stats.n) || 0;
  const avgRating = stats.avg_overall != null ? Math.round(Number(stats.avg_overall) * 100) / 100 : null;

  const profile = profileResult.rows[0] || { premium_tier: false, responsive_tier: false };
  const badges = ['verified_host'];
  if (profile.premium_tier) badges.push('premium_host');
  if (profile.responsive_tier) badges.push('super_responsive');

  await runner.query(
    `INSERT INTO stays_host_profiles (user_id, avg_rating, reviews_count, trust_badges, premium_tier, responsive_tier)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET avg_rating = $2, reviews_count = $3, trust_badges = $4`,
    [hostId, avgRating, reviewsCount, JSON.stringify(badges), profile.premium_tier, profile.responsive_tier]
  );
}
