import { query, withTransaction } from '../config/db.js';
import { ADAPTERS } from '../services/paymentProviders.js';
import { B2B_ROLES } from './b2bCatalogController.js';

// Any authenticated buyer opens a quote request against a manufacturer's or
// supplier's storefront — no business_connection required (contrast with
// product_sourcing_requests in phase38, which is business-to-business only).
export async function createQuoteRequest(req, res) {
  const { shopId, productId, quantity, message } = req.body;
  if (!shopId || !quantity) return res.status(400).json({ error: 'shopId and quantity are required.' });
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity must be a whole number greater than 0.' });
  }

  try {
    const shopResult = await query(
      `SELECT s.id AS shop_id, s.owner_id, u.primary_role FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = $1`,
      [shopId]
    );
    const shop = shopResult.rows[0];
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });
    if (!B2B_ROLES.includes(shop.primary_role)) {
      return res.status(400).json({ error: 'Quote requests are only available for manufacturer, supplier, and farmer stores.' });
    }
    if (shop.owner_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot request a quote from your own store.' });
    }

    if (productId) {
      const productCheck = await query('SELECT id FROM products WHERE id = $1 AND shop_id = $2', [productId, shopId]);
      if (productCheck.rows.length === 0) return res.status(404).json({ error: 'Product not found in this store.' });
    }

    const result = await query(
      `INSERT INTO quote_requests (buyer_id, business_id, shop_id, product_id, quantity_requested, message)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, shop.owner_id, shopId, productId || null, quantity, message || null]
    );

    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'quote_request_received', 'New quote request', $2, $3)`,
      [shop.owner_id, `A buyer requested a quote for ${quantity} units.`, JSON.stringify({ quoteRequestId: result.rows[0].id })]
    );

    return res.status(201).json({ message: 'Quote request sent.', quoteRequest: result.rows[0] });
  } catch (err) {
    console.error('Create quote request error:', err);
    return res.status(500).json({ error: 'Could not send quote request.' });
  }
}

export async function myQuoteRequests(req, res) {
  try {
    const result = await query(
      `SELECT qr.*, p.title AS product_title, s.name AS shop_name, s.slug AS shop_slug
       FROM quote_requests qr
       LEFT JOIN products p ON p.id = qr.product_id
       JOIN shops s ON s.id = qr.shop_id
       WHERE qr.buyer_id = $1 ORDER BY qr.created_at DESC`,
      [req.user.id]
    );
    return res.json({ quoteRequests: result.rows });
  } catch (err) {
    console.error('My quote requests error:', err);
    return res.status(500).json({ error: 'Could not load your quote requests.' });
  }
}

// Incoming requests for a manufacturer/supplier to review and quote.
export async function incomingQuoteRequests(req, res) {
  try {
    const result = await query(
      `SELECT qr.*, p.title AS product_title, u.username AS buyer_username
       FROM quote_requests qr
       LEFT JOIN products p ON p.id = qr.product_id
       JOIN users u ON u.id = qr.buyer_id
       WHERE qr.business_id = $1 ORDER BY qr.created_at DESC`,
      [req.user.id]
    );
    return res.json({ quoteRequests: result.rows });
  } catch (err) {
    console.error('Incoming quote requests error:', err);
    return res.status(500).json({ error: 'Could not load quote requests.' });
  }
}

// Business responds with a price/notes -> status moves to 'quoted'.
export async function respondToQuote(req, res) {
  const { id } = req.params;
  const { unitPrice, notes } = req.body;
  if (unitPrice == null || Number(unitPrice) < 0) return res.status(400).json({ error: 'A non-negative unitPrice is required.' });

  try {
    const result = await query(
      `UPDATE quote_requests SET status = 'quoted', quoted_unit_price = $1, quoted_notes = $2, quoted_by = $3, quoted_at = now()
       WHERE id = $4 AND business_id = $5 AND status = 'pending' RETURNING *`,
      [unitPrice, notes || null, req.user.id, id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote request not found or already responded to.' });

    const quote = result.rows[0];
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'quote_request_updated', 'Your quote is ready', $2, $3)`,
      [quote.buyer_id, `You received a quote of ${unitPrice} per unit.`, JSON.stringify({ quoteRequestId: quote.id })]
    );

    return res.json({ message: 'Quote sent to buyer.', quoteRequest: quote });
  } catch (err) {
    console.error('Respond to quote error:', err);
    return res.status(500).json({ error: 'Could not respond to quote request.' });
  }
}

export async function declineQuote(req, res) {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE quote_requests SET status = 'declined', responded_at = now()
       WHERE id = $1 AND (business_id = $2 OR buyer_id = $2) AND status IN ('pending', 'quoted') RETURNING *`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote request not found or cannot be declined.' });
    return res.json({ message: 'Quote request declined.', quoteRequest: result.rows[0] });
  } catch (err) {
    console.error('Decline quote error:', err);
    return res.status(500).json({ error: 'Could not decline quote request.' });
  }
}

// Buyer accepts a quoted price -> creates a real bulk order at that price,
// enforcing the same MOQ floor as a normal bulk checkout (see
// ordersController.createOrder) since a quote is still a manufacturer/
// supplier sale under the hood.
export async function acceptQuote(req, res) {
  const { id } = req.params;
  const { shippingAddress, method } = req.body;
  if (!method) return res.status(400).json({ error: 'A payment method is required to accept a quote.' });
  const adapter = ADAPTERS[method];
  if (!adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

  try {
    const order = await withTransaction(async (client) => {
      const quoteResult = await client.query(
        `SELECT * FROM quote_requests WHERE id = $1 AND buyer_id = $2 AND status = 'quoted' FOR UPDATE`,
        [id, req.user.id]
      );
      const quote = quoteResult.rows[0];
      if (!quote) { const err = new Error('QUOTE_NOT_FOUND'); err.code = 'QUOTE_NOT_FOUND'; throw err; }
      if (!quote.product_id) { const err = new Error('QUOTE_NO_PRODUCT'); err.code = 'QUOTE_NO_PRODUCT'; throw err; }

      const productResult = await client.query(
        `SELECT * FROM products WHERE id = $1 AND status = 'active' FOR UPDATE OF products`,
        [quote.product_id]
      );
      const product = productResult.rows[0];
      if (!product) { const err = new Error('PRODUCT_NOT_FOUND'); err.code = 'PRODUCT_NOT_FOUND'; throw err; }
      if (product.quantity_available < quote.quantity_requested) { const err = new Error('OUT_OF_STOCK'); err.code = 'OUT_OF_STOCK'; throw err; }
      if (quote.quantity_requested < product.minimum_order_quantity) {
        const err = new Error('MOQ_NOT_MET'); err.code = 'MOQ_NOT_MET'; err.moq = product.minimum_order_quantity; throw err;
      }

      const settings = await client.query('SELECT * FROM platform_settings WHERE id = 1');
      const feePercent = Number(settings.rows[0].platform_fee_percent);
      const unitPrice = Number(quote.quoted_unit_price);
      const subtotal = unitPrice * quote.quantity_requested;
      const feeAmount = Math.round(subtotal * feePercent) / 100;
      const total = subtotal + feeAmount;

      const orderResult = await client.query(
        `INSERT INTO orders (buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount, total_amount, shipping_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.id, quote.shop_id, product.id, quote.quantity_requested, unitPrice, product.currency, feePercent, feeAmount, total, shippingAddress || null]
      );
      const newOrder = orderResult.rows[0];

      await client.query(
        `UPDATE quote_requests SET status = 'accepted', responded_at = now(), resulting_order_id = $1 WHERE id = $2`,
        [newOrder.id, quote.id]
      );
      await client.query(
        `UPDATE products SET quantity_available = quantity_available - $1, orders_count = orders_count + 1 WHERE id = $2`,
        [quote.quantity_requested, product.id]
      );

      return newOrder;
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const charge = await adapter({
      amount: order.total_amount, currency: order.currency, orderId: order.id,
      returnUrl: `${frontendUrl}/orders/${order.id}`
    });
    await query(
      `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
       VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
      [order.id, method, order.total_amount, order.currency, charge.providerReference, charge.raw]
    );

    return res.status(201).json({
      message: 'Quote accepted. Complete payment to move funds into escrow.',
      order,
      providerReference: charge.providerReference
    });
  } catch (err) {
    console.error('Accept quote error:', err);
    if (err.code === 'QUOTE_NOT_FOUND') return res.status(404).json({ error: 'Quote not found or not ready to accept.' });
    if (err.code === 'QUOTE_NO_PRODUCT') return res.status(400).json({ error: 'This quote is a general inquiry with no specific product to order — contact the business through chat instead.' });
    if (err.code === 'PRODUCT_NOT_FOUND') return res.status(404).json({ error: 'This product is no longer available.' });
    if (err.code === 'OUT_OF_STOCK') return res.status(400).json({ error: 'Not enough stock available for the quoted quantity.' });
    if (err.code === 'MOQ_NOT_MET') return res.status(400).json({ error: `This product requires a minimum order of ${err.moq} units.` });
    return res.status(500).json({ error: 'Could not accept quote.' });
  }
}
