// Mirrors stays_property_type / stays_owner_type enums in
// schema_phase50_stays_foundation.sql — keep in sync if either changes.
export const PROPERTY_TYPES = [
  { value: 'serviced_apartment', label: 'Serviced Apartment' },
  { value: 'holiday_home', label: 'Holiday Home' },
  { value: 'guest_house', label: 'Guest House' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'resort', label: 'Resort' },
  { value: 'safari_lodge', label: 'Safari Lodge' },
  { value: 'luxury_villa', label: 'Luxury Villa' },
  { value: 'private_villa', label: 'Private Villa' },
  { value: 'beach_house', label: 'Beach House' },
  { value: 'farm_stay', label: 'Farm Stay' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'cottage', label: 'Cottage' },
  { value: 'student_holiday_accommodation', label: 'Student Holiday Accommodation' },
  { value: 'conference_accommodation', label: 'Conference Accommodation' },
  { value: 'executive_suite', label: 'Executive Suite' },
  { value: 'camping_site', label: 'Camping Site' },
  { value: 'tiny_house', label: 'Tiny House' },
  { value: 'tree_house', label: 'Tree House' },
  { value: 'glamping_site', label: 'Glamping Site' },
  { value: 'corporate_housing', label: 'Corporate Housing' },
];

export const OWNER_TYPES = [
  { value: 'individual', label: 'Individual Owner' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'hospitality_company', label: 'Hospitality Company' },
  { value: 'property_agency', label: 'Property Agency' },
  { value: 'tour_company', label: 'Tour Company' },
  { value: 'corporate_provider', label: 'Corporate Accommodation Provider' },
];

export function propertyTypeLabel(value) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label || value;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Mirrors the badge keys produced by staysTrustService.js.
export const TRUST_BADGE_LABELS = {
  verified_property: { label: 'Verified Property', emoji: '✅' },
  verified_host: { label: 'Verified Host', emoji: '🛡️' },
  premium_host: { label: 'Premium Host', emoji: '⭐' },
  luxury_stay: { label: 'Luxury Stay', emoji: '💎' },
  top_rated_stay: { label: 'Top Rated', emoji: '🏆' },
  business_ready: { label: 'Business Ready', emoji: '💼' },
  family_friendly: { label: 'Family Friendly', emoji: '👨‍👩‍👧' },
  clean_and_safe: { label: 'Clean & Safe', emoji: '🧼' },
  super_responsive: { label: 'Super Responsive', emoji: '⚡' },
};

export const REVIEW_CATEGORIES = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'comfort', label: 'Comfort' },
  { key: 'location', label: 'Location' },
  { key: 'communication', label: 'Communication' },
  { key: 'value', label: 'Value' },
  { key: 'amenities', label: 'Amenities' },
];
