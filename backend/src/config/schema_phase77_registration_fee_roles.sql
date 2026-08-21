-- ============================================================
-- schema_phase77_registration_fee_roles.sql
-- Adds 'logistics_provider' as a registrable role via the existing
-- role_upgrades pipeline (schema_phase37/45/50 convention), so
-- logistics provider onboarding reuses the same admin-configurable
-- fee + KYC/verification state machine instead of a parallel system.
--
-- No new fee table is created: platform_settings.seller_upgrade_settings
-- (sellerUpgrade.countryPricing, see settingsService.js) is already the
-- admin-configurable fee store and is free-form JSONB per country, so
-- role-specific fee keys (manufacturerAmount, supplierAmount,
-- dropshipperAmount, farmerAmount, hostAmount, logisticsProviderAmount)
-- can be added by an admin through the existing Settings > Upgrades
-- screen with no migration required. See upgradeController.js
-- pricingForCountry() for the fallback chain that resolves them.
-- ============================================================

ALTER TABLE role_upgrades DROP CONSTRAINT IF EXISTS role_upgrades_requested_role_check;
ALTER TABLE role_upgrades ADD CONSTRAINT role_upgrades_requested_role_check
  CHECK (requested_role IN ('seller', 'delivery', 'manufacturer', 'supplier', 'dropshipper', 'farmer', 'host', 'logistics_provider'));
