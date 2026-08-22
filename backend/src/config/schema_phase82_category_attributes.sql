-- ============================================================
-- schema_phase82_category_attributes.sql
-- Category-specific product attributes (master brief section 11: "A
-- solar panel should not use the same specifications as clothing or
-- maize."). Purely additive — does NOT touch products.specs (phase2),
-- which stays exactly as free-form as it already is for every existing
-- product. This defines, per category, WHAT attributes make sense to
-- collect, so a product-creation form can render category-appropriate
-- fields instead of one generic key/value box, and so
-- validateSpecsAgainstSchema() (categoryAttributesController.js) can
-- flag obviously wrong/missing fields — advisory, not enforced at the
-- database level, so no existing product record is invalidated by this
-- migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS category_attribute_schemas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    product_category NOT NULL UNIQUE,
  -- [{ key, label, type: 'text'|'number'|'boolean'|'select'|'multiselect', unit, options: [...], required }]
  attributes  JSONB NOT NULL DEFAULT '[]',
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_category_attribute_schemas_updated_at BEFORE UPDATE ON category_attribute_schemas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed sensible starting schemas for every real category in
-- product_category (schema_phase2) except 'other', which stays
-- freeform by design. Admins can edit these later via the API —
-- this is a starting point, not a locked taxonomy.
INSERT INTO category_attribute_schemas (category, attributes) VALUES
('agriculture', '[
  {"key":"variety","label":"Variety/Breed","type":"text","required":false},
  {"key":"weight_kg","label":"Weight","type":"number","unit":"kg","required":false},
  {"key":"organic","label":"Organic","type":"boolean","required":false},
  {"key":"harvest_date","label":"Harvest date","type":"text","required":false},
  {"key":"packaging","label":"Packaging","type":"select","options":["Loose","Bagged","Crated","Palletized"],"required":false}
]'),
('electronics', '[
  {"key":"brand","label":"Brand","type":"text","required":false},
  {"key":"model","label":"Model","type":"text","required":false},
  {"key":"power_watts","label":"Power","type":"number","unit":"W","required":false},
  {"key":"voltage","label":"Voltage","type":"text","required":false},
  {"key":"warranty_months","label":"Warranty","type":"number","unit":"months","required":false},
  {"key":"certifications","label":"Certifications","type":"multiselect","options":["CE","ISO9001","RoHS","FCC"],"required":false}
]'),
('fashion', '[
  {"key":"material","label":"Material","type":"text","required":false},
  {"key":"size_range","label":"Available sizes","type":"multiselect","options":["XS","S","M","L","XL","XXL"],"required":false},
  {"key":"color_options","label":"Color options","type":"text","required":false},
  {"key":"gender","label":"Gender","type":"select","options":["Unisex","Men","Women","Kids"],"required":false},
  {"key":"custom_printing","label":"Custom printing available","type":"boolean","required":false}
]'),
('home_and_garden', '[
  {"key":"material","label":"Material","type":"text","required":false},
  {"key":"dimensions","label":"Dimensions","type":"text","required":false},
  {"key":"weight_kg","label":"Weight","type":"number","unit":"kg","required":false},
  {"key":"assembly_required","label":"Assembly required","type":"boolean","required":false}
]'),
('health_and_beauty', '[
  {"key":"volume_ml","label":"Volume","type":"number","unit":"ml","required":false},
  {"key":"skin_type","label":"Skin/hair type","type":"select","options":["All","Oily","Dry","Sensitive","Combination"],"required":false},
  {"key":"ingredients","label":"Key ingredients","type":"text","required":false},
  {"key":"expiry_date","label":"Expiry date","type":"text","required":false}
]'),
('vehicles', '[
  {"key":"make","label":"Make","type":"text","required":false},
  {"key":"model","label":"Model","type":"text","required":false},
  {"key":"year","label":"Year","type":"number","required":false},
  {"key":"mileage_km","label":"Mileage","type":"number","unit":"km","required":false},
  {"key":"fuel_type","label":"Fuel type","type":"select","options":["Petrol","Diesel","Electric","Hybrid"],"required":false},
  {"key":"transmission","label":"Transmission","type":"select","options":["Manual","Automatic"],"required":false}
]'),
('food_and_beverages', '[
  {"key":"weight_kg","label":"Weight","type":"number","unit":"kg","required":false},
  {"key":"shelf_life_days","label":"Shelf life","type":"number","unit":"days","required":false},
  {"key":"packaging","label":"Packaging","type":"select","options":["Loose","Bottled","Canned","Bagged","Boxed"],"required":false},
  {"key":"halal_certified","label":"Halal certified","type":"boolean","required":false},
  {"key":"organic","label":"Organic","type":"boolean","required":false}
]'),
('sports_and_outdoors', '[
  {"key":"material","label":"Material","type":"text","required":false},
  {"key":"size","label":"Size","type":"text","required":false},
  {"key":"weight_kg","label":"Weight","type":"number","unit":"kg","required":false}
]'),
('books_and_media', '[
  {"key":"language","label":"Language","type":"text","required":false},
  {"key":"format","label":"Format","type":"select","options":["Print","Digital","Audio"],"required":false},
  {"key":"pages","label":"Pages","type":"number","required":false}
]'),
('toys_and_kids', '[
  {"key":"age_range","label":"Age range","type":"text","required":false},
  {"key":"material","label":"Material","type":"text","required":false},
  {"key":"safety_certified","label":"Safety certified","type":"boolean","required":false}
]'),
('art_and_crafts', '[
  {"key":"material","label":"Material","type":"text","required":false},
  {"key":"dimensions","label":"Dimensions","type":"text","required":false},
  {"key":"handmade","label":"Handmade","type":"boolean","required":false}
]'),
('services', '[
  {"key":"service_area","label":"Service area","type":"text","required":false},
  {"key":"duration","label":"Typical duration","type":"text","required":false},
  {"key":"certifications","label":"Certifications","type":"text","required":false}
]')
ON CONFLICT (category) DO NOTHING;
