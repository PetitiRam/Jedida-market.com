-- Phase 7: add the product-identity and pricing columns that
-- productsController.createProduct has been inserting into since the
-- Add Product form was built out (short description, brand/manufacturer/
-- model, original price, discount, minimum order quantity). Without these,
-- every new product submission failed with a "column does not exist" error.

ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description VARCHAR(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(150);
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(150);
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_number VARCHAR(150);
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order_quantity INTEGER NOT NULL DEFAULT 1;
