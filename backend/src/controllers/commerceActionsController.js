import { query } from '../config/db.js';

// ===== Wishlist =====
export async function toggleWishlist(req, res) {
  const { productId } = req.params;
  const existing = await query('SELECT 1 FROM product_wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
  if (existing.rows.length > 0) {
    await query('DELETE FROM product_wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
    return res.json({ wishlisted: false });
  }
  await query('INSERT INTO product_wishlists (user_id, product_id) VALUES ($1,$2)', [req.user.id, productId]);
  res.json({ wishlisted: true });
}

export async function getWishlistStatus(req, res) {
  const result = await query('SELECT 1 FROM product_wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
  res.json({ wishlisted: result.rows.length > 0 });
}

export async function listMyWishlist(req, res) {
  const result = await query(
    `SELECT p.* FROM product_wishlists w JOIN products p ON p.id = w.product_id
     WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
    [req.user.id]
  );
  res.json({ products: result.rows });
}

// ===== Shop follows =====
export async function toggleFollow(req, res) {
  const { shopId } = req.params;
  const existing = await query('SELECT 1 FROM shop_follows WHERE user_id = $1 AND shop_id = $2', [req.user.id, shopId]);
  if (existing.rows.length > 0) {
    await query('DELETE FROM shop_follows WHERE user_id = $1 AND shop_id = $2', [req.user.id, shopId]);
    return res.json({ following: false });
  }
  await query('INSERT INTO shop_follows (user_id, shop_id) VALUES ($1,$2)', [req.user.id, shopId]);
  res.json({ following: true });
}

export async function getShopFollowInfo(req, res) {
  const { shopId } = req.params;
  const [followStatus, followerCount] = await Promise.all([
    req.user
      ? query('SELECT 1 FROM shop_follows WHERE user_id = $1 AND shop_id = $2', [req.user.id, shopId])
      : Promise.resolve({ rows: [] }),
    query('SELECT COUNT(*) FROM shop_follows WHERE shop_id = $1', [shopId])
  ]);
  res.json({ following: followStatus.rows.length > 0, followerCount: Number(followerCount.rows[0].count) });
}

// ===== Cart =====
export async function addToCart(req, res) {
  const { productId, quantity } = req.body;
  const qty = Math.max(1, Number(quantity) || 1);

  const product = await query('SELECT id, quantity_available FROM products WHERE id = $1 AND status = $2', [productId, 'active']);
  if (product.rows.length === 0) return res.status(404).json({ error: 'Product not available.' });
  if (product.rows[0].quantity_available < qty) return res.status(400).json({ error: 'Not enough stock available.' });

  const result = await query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = now()
     RETURNING *`,
    [req.user.id, productId, qty]
  );
  res.status(201).json({ message: 'Added to cart.', item: result.rows[0] });
}

export async function getCart(req, res) {
  const result = await query(
    `SELECT ci.id, ci.quantity, p.id AS product_id, p.title, p.price, p.currency, p.images, p.quantity_available
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 ORDER BY ci.created_at DESC`,
    [req.user.id]
  );
  const total = result.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  res.json({ items: result.rows, total, count: result.rows.reduce((n, i) => n + i.quantity, 0) });
}

export async function updateCartItem(req, res) {
  const { quantity } = req.body;
  if (quantity <= 0) {
    await query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.itemId, req.user.id]);
    return res.json({ message: 'Removed from cart.' });
  }
  await query('UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2 AND user_id = $3', [quantity, req.params.itemId, req.user.id]);
  res.json({ message: 'Cart updated.' });
}

export async function removeCartItem(req, res) {
  await query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.itemId, req.user.id]);
  res.json({ message: 'Removed from cart.' });
}

// ===== Quote requests =====
export async function requestQuote(req, res) {
  const { productId } = req.params;

  const {
    quantity,
    requestedQuantity,
    targetPrice,
    currency,
    message,
} = req.body;

const qty = Number(req.body.quantity || req.body.requestedQuantity || 1);

const result = await query(
  `INSERT INTO quote_requests
   (
     product_id,
     buyer_id,
     quantity,
     requested_quantity,
     target_price,
     message,
     currency
   )
   VALUES
   ($1,$2,$3,$4,$5,$6,$7)
   RETURNING *`,
  [
    productId,
    req.user.id,
    qty,
    qty,
    targetPrice || null,
    message || null,
    currency || "UGX"
  ]
);
  const admins = await query(
    "SELECT id FROM users WHERE is_admin = TRUE"
  );

  const product = await query(
    "SELECT title FROM products WHERE id = $1",
    [productId]
  );

  for (const admin of admins.rows) {
    await query(
      `
      INSERT INTO notifications
      (
        user_id,
        type,
        title,
        body,
        metadata
      )
      VALUES
      (
        $1,
        'system_announcement',
        'New Quote Request',
        $2,
        $3
      )
      `,
      [
        admin.id,
        `Buyer requested a quote for "${product.rows[0]?.title}".`,
        JSON.stringify({
          quoteRequestId: result.rows[0].id,
          targetPrice: targetPrice || null,
        }),
      ]
    );
  }

  res.status(201).json({
    message: "Quote request submitted.",
    quoteRequest: result.rows[0],
  });
}
export async function getMyQuoteRequests(req, res) {
  const result = await query(
    `SELECT q.*, p.title AS product_title FROM quote_requests q JOIN products p ON p.id = q.product_id
     WHERE q.buyer_id = $1 ORDER BY q.created_at DESC`,
    [req.user.id]
  );
  res.json({ quoteRequests: result.rows });
}

// ===== Admin =====
export async function listPendingQuotes(req, res) {
  const result = await query(
    `SELECT q.*, u.full_name AS buyer_name, u.email AS buyer_email, p.title AS product_title,
            s.owner_id AS seller_id, su.full_name AS seller_name
     FROM quote_requests q
     JOIN users u ON u.id = q.buyer_id
     JOIN products p ON p.id = q.product_id
     JOIN shops s ON s.id = p.shop_id
     JOIN users su ON su.id = s.owner_id
     WHERE q.status IN ('pending_admin', 'forwarded_to_seller')
     ORDER BY q.created_at ASC`
  );
  res.json({ quoteRequests: result.rows });
}

export async function respondToQuote(req, res) {
  const { status, quotedPrice, adminNotes } = req.body; // status: forwarded_to_seller | quoted | declined
  await query(
    `UPDATE quote_requests SET status = $1, quoted_price = $2, admin_notes = $3, handled_by = $4, updated_at = now()
     WHERE id = $5`,
    [status, quotedPrice || null, adminNotes || null, req.user.id, req.params.quoteId]
  );

  if (status === 'quoted' || status === 'declined') {
    const quote = await query('SELECT buyer_id, product_id FROM quote_requests WHERE id = $1', [req.params.quoteId]);
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1,'system_announcement',$2,$3,$4)`,
      [
        quote.rows[0].buyer_id,
        status === 'quoted' ? 'Your quote request was answered' : 'Quote request declined',
        status === 'quoted' ? `The seller offered ${quotedPrice} for your requested quantity.` : (adminNotes || 'This quote request could not be fulfilled.'),
        { quoteRequestId: req.params.quoteId }
      ]
    );
  }
  res.json({ message: 'Quote request updated.' });
}
