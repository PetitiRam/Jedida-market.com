import { query } from '../config/db.js';

const VALID_TYPES = ['text', 'number', 'boolean', 'select', 'multiselect'];

function validateAttributeList(attributes) {
  if (!Array.isArray(attributes)) return 'attributes must be an array.';
  for (const attr of attributes) {
    if (!attr.key || !attr.label || !attr.type) return 'Each attribute needs key, label, and type.';
    if (!VALID_TYPES.includes(attr.type)) return `Attribute type must be one of: ${VALID_TYPES.join(', ')}.`;
    if (['select', 'multiselect'].includes(attr.type) && !Array.isArray(attr.options)) {
      return `Attribute "${attr.key}" is type ${attr.type} and needs an options array.`;
    }
  }
  return null;
}

// ------------------------------------------------------------
// PUBLIC — any authenticated user building/browsing a product listing
// ------------------------------------------------------------
export async function getSchemaForCategory(req, res) {
  try {
    const result = await query(`SELECT * FROM category_attribute_schemas WHERE category = $1`, [req.params.category]);
    if (!result.rows[0]) return res.json({ category: req.params.category, attributes: [] });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get category schema error:', err);
    return res.status(500).json({ error: 'Could not load attribute schema for this category.' });
  }
}

export async function listAllSchemas(req, res) {
  try {
    const result = await query(`SELECT * FROM category_attribute_schemas ORDER BY category ASC`);
    return res.json({ schemas: result.rows });
  } catch (err) {
    console.error('List category schemas error:', err);
    return res.status(500).json({ error: 'Could not load attribute schemas.' });
  }
}

// Standalone validation — advisory. A seller-facing product form calls
// this before submit to show which category-appropriate fields are
// missing; it never blocks the actual product create/update endpoint
// (productController.js is untouched), so no existing product or
// integration breaks because of this.
export async function validateSpecs(req, res) {
  const { category, specs } = req.body;
  if (!category) return res.status(400).json({ error: 'category is required.' });
  try {
    const schemaResult = await query(`SELECT attributes FROM category_attribute_schemas WHERE category = $1`, [category]);
    const attributes = schemaResult.rows[0]?.attributes || [];
    const providedKeys = new Set(Object.keys(specs || {}));

    const missingRequired = attributes.filter((a) => a.required && !providedKeys.has(a.key)).map((a) => a.key);
    const unknownKeys = [...providedKeys].filter((k) => !attributes.some((a) => a.key === k));
    const invalidSelectValues = [];
    for (const attr of attributes) {
      if (!['select'].includes(attr.type)) continue;
      const value = specs?.[attr.key];
      if (value !== undefined && value !== null && value !== '' && !attr.options.includes(value)) {
        invalidSelectValues.push({ key: attr.key, value, allowed: attr.options });
      }
    }

    return res.json({
      valid: missingRequired.length === 0 && invalidSelectValues.length === 0,
      missingRequired, unknownKeys, invalidSelectValues, schemaAttributes: attributes
    });
  } catch (err) {
    console.error('Validate specs error:', err);
    return res.status(500).json({ error: 'Could not validate specs.' });
  }
}

// ------------------------------------------------------------
// ADMIN — define/edit category schemas
// ------------------------------------------------------------
export async function adminUpsertSchema(req, res) {
  const { category, attributes } = req.body;
  if (!category) return res.status(400).json({ error: 'category is required.' });
  const validationError = validateAttributeList(attributes || []);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const result = await query(
      `INSERT INTO category_attribute_schemas (category, attributes, created_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (category) DO UPDATE SET attributes = EXCLUDED.attributes
       RETURNING *`,
      [category, JSON.stringify(attributes), req.user.id]
    );
    return res.status(201).json({ message: 'Schema saved.', schema: result.rows[0] });
  } catch (err) {
    console.error('Upsert category schema error:', err);
    return res.status(500).json({ error: 'Could not save this schema.' });
  }
}
