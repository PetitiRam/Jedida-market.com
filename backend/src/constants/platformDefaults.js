// Shared last-resort defaults for when a genuinely unmapped situation
// leaves no country/currency to infer from — e.g. a legacy record with
// no currency saved, or a country code the pricing map doesn't cover.
// Previously several call sites each hardcoded 'UGX' as this fallback,
// which meant an unmapped Nigerian or Ghanaian record would silently
// display Ugandan Shillings. USD is the neutral fallback for a
// platform serving all of Africa (master brief section 12: "Do not
// hard-code Uganda") — it's never wrong in the sense of being some
// other specific country's currency, just generic.
//
// This does NOT change any currency that's actually stored on a
// record — only what gets shown when nothing was stored at all.
export const DEFAULT_PLATFORM_CURRENCY = 'USD';
