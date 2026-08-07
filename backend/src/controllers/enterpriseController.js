import { query } from '../config/db.js';

async function getOwnedShopId(userId) {
  const result = await query('SELECT id FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

// ---------------------------------------------------------------------------
// COLLECTIONS — named product groupings on a manufacturer/supplier/seller's
// own storefront (e.g. "Summer 2026 Range", "Bestsellers").
// ---------------------------------------------------------------------------

export async function listMyCollections(req, res) {
  try {
    const shopId = await getOwnedShopId(req.user.id);
    if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });
    const result = await query(
      `SELECT c.*, COUNT(cp.product_id)::int AS product_count
       FROM product_collections c LEFT JOIN collection_products cp ON cp.collection_id = c.id
       WHERE c.shop_id = $1 GROUP BY c.id ORDER BY c.sort_order, c.created_at`,
      [shopId]
    );
    return res.json({ collections: result.rows });
  } catch (err) {
    console.error('List my collections error:', err);
    return res.status(500).json({ error: 'Could not load collections.' });
  }
}

// Public — for the storefront page.
export async function listShopCollections(req, res) {
  const { shopId } = req.params;
  try {
    const collectionsResult = await query(
      `SELECT * FROM product_collections WHERE shop_id = $1 ORDER BY sort_order, created_at`,
      [shopId]
    );
    const collections = collectionsResult.rows;
    if (collections.length === 0) return res.json({ collections: [] });

    const productsResult = await query(
      `SELECT cp.collection_id, p.id, p.title, p.price, p.currency, p.images
       FROM collection_products cp JOIN products p ON p.id = cp.product_id
       WHERE cp.collection_id = ANY($1) AND p.status = 'active'
       ORDER BY cp.sort_order`,
      [collections.map((c) => c.id)]
    );
    const byCollection = {};
    for (const p of productsResult.rows) {
      (byCollection[p.collection_id] ||= []).push(p);
    }
    return res.json({ collections: collections.map((c) => ({ ...c, products: byCollection[c.id] || [] })) });
  } catch (err) {
    console.error('List shop collections error:', err);
    return res.status(500).json({ error: 'Could not load collections.' });
  }
}

export async function createCollection(req, res) {
  const { name, description, bannerUrl, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  try {
    const shopId = await getOwnedShopId(req.user.id);
    if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });
    const result = await query(
      `INSERT INTO product_collections (shop_id, name, description, banner_url, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [shopId, name, description || null, bannerUrl || null, sortOrder || 0]
    );
    return res.status(201).json({ message: 'Collection created.', collection: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a collection with that name.' });
    console.error('Create collection error:', err);
    return res.status(500).json({ error: 'Could not create collection.' });
  }
}

export async function updateCollection(req, res) {
  const { id } = req.params;
  const { name, description, bannerUrl, sortOrder } = req.body;
  try {
    const shopId = await getOwnedShopId(req.user.id);
    if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });
    const result = await query(
      `UPDATE product_collections SET
         name = COALESCE($1, name), description = COALESCE($2, description),
         banner_url = COALESCE($3, banner_url), sort_order = COALESCE($4, sort_order)
       WHERE id = $5 AND shop_id = $6 RETURNING *`,
      [name || null, description ?? null, bannerUrl ?? null, sortOrder ?? null, id, shopId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Collection not found.' });
    return res.json({ message: 'Collection updated.', collection: result.rows[0] });
  } catch (err) {
    console.error('Update collection error:', err);
    return res.status(500).json({ error: 'Could not update collection.' });
  }
}

export async function deleteCollection(req, res) {
  const { id } = req.params;
  try {
    const shopId = await getOwnedShopId(req.user.id);
    if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });
    const result = await query('DELETE FROM product_collections WHERE id = $1 AND shop_id = $2 RETURNING id', [id, shopId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Collection not found.' });
    return res.json({ message: 'Collection removed.' });
  } catch (err) {
    console.error('Delete collection error:', err);
    return res.status(500).json({ error: 'Could not remove collection.' });
  }
}

export async function setCollectionProducts(req, res) {
  const { id } = req.params;
  const { productIds } = req.body;
  if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds must be an array.' });
  try {
    const shopId = await getOwnedShopId(req.user.id);
    if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });
    const owned = await query('SELECT id FROM product_collections WHERE id = $1 AND shop_id = $2', [id, shopId]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Collection not found.' });

    await query('DELETE FROM collection_products WHERE collection_id = $1', [id]);
    for (let idx = 0; idx < productIds.length; idx += 1) {
      await query(
        `INSERT INTO collection_products (collection_id, product_id, sort_order)
         SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM products WHERE id = $2 AND shop_id = $4)
         ON CONFLICT DO NOTHING`,
        [id, productIds[idx], idx, shopId]
      );
    }
    return res.json({ message: 'Collection products updated.' });
  } catch (err) {
    console.error('Set collection products error:', err);
    return res.status(500).json({ error: 'Could not update collection products.' });
  }
}

// ---------------------------------------------------------------------------
// SHOP REVIEWS — store-level rating, distinct from per-product reviews.
// Mirrors createReview in reviewsController.js: only a buyer with a
// completed order from this shop may review it.
// ---------------------------------------------------------------------------

export async function listShopReviews(req, res) {
  const { shopId } = req.params;
  try {
    const reviewsResult = await query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name
       FROM shop_reviews r JOIN users u ON u.id = r.buyer_id
       WHERE r.shop_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [shopId]
    );
    const summaryResult = await query(
      `SELECT COUNT(*) AS total, COALESCE(AVG(rating),0) AS average,
              COUNT(*) FILTER (WHERE rating = 5) AS five, COUNT(*) FILTER (WHERE rating = 4) AS four,
              COUNT(*) FILTER (WHERE rating = 3) AS three, COUNT(*) FILTER (WHERE rating = 2) AS two,
              COUNT(*) FILTER (WHERE rating = 1) AS one
       FROM shop_reviews WHERE shop_id = $1`,
      [shopId]
    );
    return res.json({ reviews: reviewsResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('List shop reviews error:', err);
    return res.status(500).json({ error: 'Could not load shop reviews.' });
  }
}

export async function createShopReview(req, res) {
  const { shopId } = req.params;
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

  try {
    const purchase = await query(
      `SELECT id FROM orders WHERE buyer_id = $1 AND shop_id = $2 AND status IN ('delivered_confirmed', 'completed') LIMIT 1`,
      [req.user.id, shopId]
    );
    if (purchase.rows.length === 0) {
      return res.status(403).json({ error: 'You can only review a store after a completed order with them.' });
    }
    const existing = await query('SELECT id FROM shop_reviews WHERE shop_id = $1 AND buyer_id = $2', [shopId, req.user.id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'You have already reviewed this store.' });

    const result = await query(
      `INSERT INTO shop_reviews (shop_id, buyer_id, order_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [shopId, req.user.id, purchase.rows[0].id, rating, comment || null]
    );

    const ownerResult = await query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
    if (ownerResult.rows[0]) {
      await query(
        `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'shop_review_received',$2,$3,$4)`,
        [ownerResult.rows[0].owner_id, 'New store review', `You received a ${rating}-star store review.`, JSON.stringify({ shopId })]
      );
    }

    return res.status(201).json({ message: 'Review submitted.', review: result.rows[0] });
  } catch (err) {
    console.error('Create shop review error:', err);
    return res.status(500).json({ error: 'Could not submit review.' });
  }
}
