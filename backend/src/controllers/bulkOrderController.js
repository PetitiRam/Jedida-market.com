import crypto from 'crypto';
import { query, withTransaction } from '../config/db.js';
import { ADAPTERS } from '../services/paymentProviders.js';

async function notifyUser(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// ---------------------------------------------------------------------------
// RFQ NEGOTIATION — turns quote_requests (a single quote/counter) into a
// real back-and-forth thread. Either the buyer or the business on that
// quote may post; each message may optionally carry a counter-offer.
// ---------------------------------------------------------------------------

async function getQuoteParty(quoteId, userId) {
  const result = await query('SELECT * FROM quote_requests WHERE id = $1', [quoteId]);
  const quote = result.rows[0];
  if (!quote) return { quote: null, isParty: false };
  const isParty = quote.buyer_id === userId || quote.business_id === userId;
  return { quote, isParty };
}

export async function listQuoteMessages(req, res) {
  const { id } = req.params;
  try {
    const { quote, isParty } = await getQuoteParty(id, req.user.id);
    if (!quote) return res.status(404).json({ error: 'Quote request not found.' });
    if (!isParty && !req.user.isAdmin) return res.status(403).json({ error: 'Not your quote request.' });

    const result = await query(
      `SELECT qm.*, u.username AS sender_username
       FROM quote_messages qm JOIN users u ON u.id = qm.sender_id
       WHERE qm.quote_request_id = $1 ORDER BY qm.created_at ASC`,
      [id]
    );
    return res.json({ messages: result.rows });
  } catch (err) {
    console.error('List quote messages error:', err);
    return res.status(500).json({ error: 'Could not load negotiation messages.' });
  }
}

export async function sendQuoteMessage(req, res) {
  const { id } = req.params;
  const { message, proposedUnitPrice, proposedQuantity } = req.body;
  if (!message && proposedUnitPrice == null) return res.status(400).json({ error: 'A message or counter-offer is required.' });

  try {
    const { quote, isParty } = await getQuoteParty(id, req.user.id);
    if (!quote) return res.status(404).json({ error: 'Quote request not found.' });
    if (!isParty) return res.status(403).json({ error: 'Not your quote request.' });
    if (['accepted', 'declined', 'expired'].includes(quote.status)) {
      return res.status(400).json({ error: 'This quote request is closed to further negotiation.' });
    }

    const result = await query(
      `INSERT INTO quote_messages (quote_request_id, sender_id, message, proposed_unit_price, proposed_quantity)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, req.user.id, message || '', proposedUnitPrice ?? null, proposedQuantity ?? null]
    );

    const otherParty = quote.buyer_id === req.user.id ? quote.business_id : quote.buyer_id;
    await notifyUser(otherParty, 'quote_message_received', 'New negotiation message',
      proposedUnitPrice != null ? `A counter-offer of ${proposedUnitPrice}/unit was sent.` : 'You have a new message on your quote request.',
      { quoteRequestId: id });

    return res.status(201).json({ message: 'Message sent.', quoteMessage: result.rows[0] });
  } catch (err) {
    console.error('Send quote message error:', err);
    return res.status(500).json({ error: 'Could not send message.' });
  }
}

// ---------------------------------------------------------------------------
// PURCHASE AGREEMENTS — a formal, frozen-terms agreement for a large deal,
// typically generated once an RFQ negotiation settles. Both buyer and
// business must accept before it can be turned into real orders.
// ---------------------------------------------------------------------------

function computeAgreementTotal(lineItems) {
  return lineItems.reduce((sum, li) => sum + Number(li.unitPrice) * Number(li.quantity), 0);
}

// Only the business (shop owner) drafts/sends an agreement.
export async function createPurchaseAgreement(req, res) {
  const { quoteRequestId, buyerId, shopId, termsText, lineItems, currency } = req.body;
  if (!shopId || !termsText || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: 'shopId, termsText, and at least one line item are required.' });
  }
  try {
    const shopResult = await query('SELECT id, owner_id FROM shops WHERE id = $1', [shopId]);
    const shop = shopResult.rows[0];
    if (!shop || shop.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your shop.' });

    let resolvedBuyerId = buyerId;
    if (quoteRequestId) {
      const quoteResult = await query('SELECT buyer_id, business_id FROM quote_requests WHERE id = $1', [quoteRequestId]);
      const quote = quoteResult.rows[0];
      if (!quote || quote.business_id !== req.user.id) return res.status(404).json({ error: 'Quote request not found.' });
      resolvedBuyerId = quote.buyer_id;
    }
    if (!resolvedBuyerId) return res.status(400).json({ error: 'buyerId or quoteRequestId is required.' });

    const total = computeAgreementTotal(lineItems);
    const result = await query(
      `INSERT INTO purchase_agreements (quote_request_id, buyer_id, business_id, shop_id, status, terms_text, line_items, total_amount, currency, business_accepted_at)
       VALUES ($1,$2,$3,$4,'sent',$5,$6,$7,$8, now()) RETURNING *`,
      [quoteRequestId || null, resolvedBuyerId, req.user.id, shopId, termsText, JSON.stringify(lineItems), total, currency || 'USD']
    );

    await notifyUser(resolvedBuyerId, 'purchase_agreement_sent', 'New purchase agreement',
      `You received a purchase agreement worth ${total} ${currency || 'USD'}.`, { agreementId: result.rows[0].id });

    return res.status(201).json({ message: 'Purchase agreement sent.', agreement: result.rows[0] });
  } catch (err) {
    console.error('Create purchase agreement error:', err);
    return res.status(500).json({ error: 'Could not create purchase agreement.' });
  }
}

export async function myPurchaseAgreements(req, res) {
  try {
    const result = await query(
      `SELECT pa.*, s.name AS shop_name, bu.username AS business_username, buu.username AS buyer_username
       FROM purchase_agreements pa
       JOIN shops s ON s.id = pa.shop_id
       JOIN users bu ON bu.id = pa.business_id
       JOIN users buu ON buu.id = pa.buyer_id
       WHERE pa.buyer_id = $1 OR pa.business_id = $1
       ORDER BY pa.created_at DESC`,
      [req.user.id]
    );
    return res.json({ agreements: result.rows });
  } catch (err) {
    console.error('My purchase agreements error:', err);
    return res.status(500).json({ error: 'Could not load purchase agreements.' });
  }
}

export async function getPurchaseAgreement(req, res) {
  const { id } = req.params;
  try {
    const result = await query('SELECT * FROM purchase_agreements WHERE id = $1', [id]);
    const agreement = result.rows[0];
    if (!agreement) return res.status(404).json({ error: 'Purchase agreement not found.' });
    if (agreement.buyer_id !== req.user.id && agreement.business_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not your purchase agreement.' });
    }
    return res.json({ agreement });
  } catch (err) {
    console.error('Get purchase agreement error:', err);
    return res.status(500).json({ error: 'Could not load purchase agreement.' });
  }
}

// Either side accepts (their own half) or declines/cancels the whole thing.
export async function respondPurchaseAgreement(req, res) {
  const { id } = req.params;
  const { action } = req.body; // 'accept' | 'decline'
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline.' });

  try {
    const result = await query('SELECT * FROM purchase_agreements WHERE id = $1', [id]);
    const agreement = result.rows[0];
    if (!agreement) return res.status(404).json({ error: 'Purchase agreement not found.' });
    const isBuyer = agreement.buyer_id === req.user.id;
    const isBusiness = agreement.business_id === req.user.id;
    if (!isBuyer && !isBusiness) return res.status(403).json({ error: 'Not your purchase agreement.' });
    if (!['draft', 'sent'].includes(agreement.status)) {
      return res.status(400).json({ error: 'This agreement is no longer open to a response.' });
    }

    if (action === 'decline') {
      const updated = await query(`UPDATE purchase_agreements SET status = 'declined' WHERE id = $1 RETURNING *`, [id]);
      const otherParty = isBuyer ? agreement.business_id : agreement.buyer_id;
      await notifyUser(otherParty, 'purchase_agreement_accepted', 'Purchase agreement declined',
        'The other party declined the purchase agreement.', { agreementId: id });
      return res.json({ message: 'Agreement declined.', agreement: updated.rows[0] });
    }

    const setCol = isBuyer ? 'buyer_accepted_at' : 'business_accepted_at';
    const updated = await query(
      `UPDATE purchase_agreements SET ${setCol} = now(),
         status = CASE WHEN ${isBuyer ? 'business_accepted_at' : 'buyer_accepted_at'} IS NOT NULL THEN 'accepted' ELSE status END
       WHERE id = $1 RETURNING *`,
      [id]
    );
    const agreementNow = updated.rows[0];
    if (agreementNow.status === 'accepted') {
      const otherParty = isBuyer ? agreement.business_id : agreement.buyer_id;
      await notifyUser(otherParty, 'purchase_agreement_accepted', 'Purchase agreement accepted',
        'Both parties have accepted the purchase agreement — checkout can proceed.', { agreementId: id });
    }
    return res.json({ message: 'Response recorded.', agreement: agreementNow });
  } catch (err) {
    console.error('Respond purchase agreement error:', err);
    return res.status(500).json({ error: 'Could not respond to purchase agreement.' });
  }
}

// Buyer turns a fully-accepted agreement into real orders (one per line
// item, grouped by checkout_group_id — same multi-item-single-charge shape
// as ordersController.checkoutCart) and issues the durable bulk invoice in
// the same transaction.
export async function checkoutPurchaseAgreement(req, res) {
  const { id } = req.params;
  const { shippingAddress, method } = req.body;
  if (!method) return res.status(400).json({ error: 'A payment method is required.' });
  const adapter = ADAPTERS[method];
  if (!adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

  try {
    const { orders, combinedTotal, currency, invoice } = await withTransaction(async (client) => {
      const agreementResult = await client.query(
        `SELECT * FROM purchase_agreements WHERE id = $1 AND buyer_id = $2 AND status = 'accepted' FOR UPDATE`,
        [id, req.user.id]
      );
      const agreement = agreementResult.rows[0];
      if (!agreement) { const err = new Error('NOT_READY'); err.code = 'NOT_READY'; throw err; }
      if (agreement.resulting_order_id) { const err = new Error('ALREADY_CHECKED_OUT'); err.code = 'ALREADY_CHECKED_OUT'; throw err; }

      const settingsResult = await client.query('SELECT platform_fee_percent FROM platform_settings WHERE id = 1');
      const feePercent = Number(settingsResult.rows[0].platform_fee_percent);
      const checkoutGroupId = crypto.randomUUID();

      let total = 0;
      const createdOrders = [];
      for (const li of agreement.line_items) {
        const productResult = await client.query(
          `SELECT * FROM products WHERE id = $1 AND status = 'active' FOR UPDATE`,
          [li.productId]
        );
        const product = productResult.rows[0];
        if (!product) { const err = new Error('PRODUCT_NOT_FOUND'); err.code = 'PRODUCT_NOT_FOUND'; throw err; }
        if (product.quantity_available < li.quantity) { const err = new Error('OUT_OF_STOCK'); err.code = 'OUT_OF_STOCK'; err.title = product.title; throw err; }

        const subtotal = Number(li.unitPrice) * Number(li.quantity);
        const feeAmount = Math.round(subtotal * feePercent) / 100;
        const orderTotal = subtotal + feeAmount;
        total += orderTotal;

        const orderResult = await client.query(
          `INSERT INTO orders (buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount, total_amount, shipping_address, checkout_group_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [req.user.id, agreement.shop_id, li.productId, li.quantity, li.unitPrice, product.currency, feePercent, feeAmount, orderTotal, shippingAddress || null, checkoutGroupId]
        );
        createdOrders.push(orderResult.rows[0]);
        await client.query('UPDATE products SET quantity_available = quantity_available - $1 WHERE id = $2', [li.quantity, li.productId]);
      }

      await client.query(`UPDATE purchase_agreements SET resulting_order_id = $1 WHERE id = $2`, [createdOrders[0].id, id]);

      const invoiceResult = await client.query(
        `INSERT INTO bulk_invoices (order_id, purchase_agreement_id, buyer_id, business_id, line_items, subtotal_amount, tax_amount, total_amount, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [createdOrders[0].id, id, agreement.buyer_id, agreement.business_id, JSON.stringify(agreement.line_items),
         total, 0, total, agreement.currency]
      );

      return { orders: createdOrders, combinedTotal: total, currency: createdOrders[0].currency, invoice: invoiceResult.rows[0] };
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const charge = await adapter({
      amount: combinedTotal, currency, orderId: `agreement-${id}`,
      returnUrl: `${frontendUrl}/orders?checkoutGroup=${orders[0].checkout_group_id}`
    });
    for (const order of orders) {
      await query(
        `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
         VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
        [order.id, method, order.total_amount, order.currency, charge.providerReference, charge.raw]
      );
    }

    return res.status(201).json({
      message: 'Purchase agreement checked out. Complete payment to move funds into escrow.',
      orders, invoice, checkoutGroupId: orders[0].checkout_group_id, providerReference: charge.providerReference
    });
  } catch (err) {
    if (err.code === 'NOT_READY') return res.status(400).json({ error: 'This agreement is not yet accepted by both parties, not yours, or already checked out.' });
    if (err.code === 'ALREADY_CHECKED_OUT') return res.status(409).json({ error: 'This agreement has already been checked out.' });
    if (err.code === 'PRODUCT_NOT_FOUND') return res.status(404).json({ error: 'One of the agreed products is no longer available.' });
    if (err.code === 'OUT_OF_STOCK') return res.status(400).json({ error: `Not enough stock for "${err.title}".` });
    console.error('Checkout purchase agreement error:', err);
    return res.status(500).json({ error: 'Could not check out this agreement.' });
  }
}

// ---------------------------------------------------------------------------
// BULK INVOICES
// ---------------------------------------------------------------------------

export async function myInvoices(req, res) {
  try {
    const result = await query(
      `SELECT * FROM bulk_invoices WHERE buyer_id = $1 OR business_id = $1 ORDER BY issued_at DESC`,
      [req.user.id]
    );
    return res.json({ invoices: result.rows });
  } catch (err) {
    console.error('My invoices error:', err);
    return res.status(500).json({ error: 'Could not load invoices.' });
  }
}

export async function getInvoice(req, res) {
  const { id } = req.params;
  try {
    const result = await query('SELECT * FROM bulk_invoices WHERE id = $1', [id]);
    const invoice = result.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    if (invoice.buyer_id !== req.user.id && invoice.business_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not your invoice.' });
    }
    return res.json({ invoice });
  } catch (err) {
    console.error('Get invoice error:', err);
    return res.status(500).json({ error: 'Could not load invoice.' });
  }
}

// Manual path: issue a bulk invoice for a wholesale order that was placed
// directly (tiers/MOQ checkout) rather than through a negotiated
// purchase agreement. Either party to the order may trigger it, but only
// once per order.
export async function issueInvoiceForOrder(req, res) {
  const { orderId } = req.params;
  try {
    const orderResult = await query(
      `SELECT o.*, s.owner_id AS business_id, p.title FROM orders o
       JOIN shops s ON s.id = o.shop_id JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.buyer_id !== req.user.id && order.business_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not your order.' });
    }
    const existing = await query('SELECT * FROM bulk_invoices WHERE order_id = $1', [orderId]);
    if (existing.rows.length > 0) return res.json({ message: 'Invoice already exists.', invoice: existing.rows[0] });

    const lineItems = [{ productId: order.product_id, title: order.title, quantity: order.quantity, unitPrice: order.unit_price }];
    const result = await query(
      `INSERT INTO bulk_invoices (order_id, buyer_id, business_id, line_items, subtotal_amount, tax_amount, total_amount, currency)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7) RETURNING *`,
      [orderId, order.buyer_id, order.business_id, JSON.stringify(lineItems),
       Number(order.unit_price) * order.quantity, order.total_amount, order.currency]
    );
    return res.status(201).json({ message: 'Invoice issued.', invoice: result.rows[0] });
  } catch (err) {
    console.error('Issue invoice error:', err);
    return res.status(500).json({ error: 'Could not issue invoice.' });
  }
}
