#!/usr/bin/env bash
# Run this from inside ~/Jedida-market.com/backend
# Fully self-contained: no separate patch file needed.
set -e

echo "== 1. Writing new files =="
mkdir -p "$(dirname "src/config/schema_phase77_registration_fee_roles.sql")"
if [ ! -f "src/config/schema_phase77_registration_fee_roles.sql" ]; then
cat > "src/config/schema_phase77_registration_fee_roles.sql" <<'FILE_EOF'
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
FILE_EOF
  echo "  -> wrote src/config/schema_phase77_registration_fee_roles.sql"
else
  echo "  -> src/config/schema_phase77_registration_fee_roles.sql already exists, skipped."
fi

mkdir -p "$(dirname "src/config/schema_phase78_trade_case_management.sql")"
if [ ! -f "src/config/schema_phase78_trade_case_management.sql" ]; then
cat > "src/config/schema_phase78_trade_case_management.sql" <<'FILE_EOF'
-- ============================================================
-- schema_phase78_trade_case_management.sql
--
-- Implements the B2B "Trade Case" abstraction from the expansion brief
-- WITHOUT creating a parallel order/payment system. A trade case IS an
-- order — specifically one that originated from a quote_requests row.
-- RFQ, quote, negotiation, purchase order and payment already live on
-- quote_requests -> orders -> payments. Documents/shipping/inspection/
-- assignment/communication were the genuinely missing pieces; this
-- phase adds only those.
-- ============================================================

-- Symmetric link: quote_requests.resulting_order_id already points
-- forward to the order; this lets any order be traced back to its RFQ
-- in one join instead of a reverse lookup.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL;
UPDATE orders o SET quote_request_id = qr.id
  FROM quote_requests qr
  WHERE qr.resulting_order_id = o.id AND o.quote_request_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_quote_request ON orders(quote_request_id) WHERE quote_request_id IS NOT NULL;

-- Admin-managed assignment: lets Jedida route a trade case to a
-- specific support/ops agent and/or logistics provider, per the
-- "admin can assign customer/RFQ/supplier/trade case/agent/logistics
-- provider" requirement. Nullable — direct seller-buyer flow keeps
-- working unassigned, exactly as before.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_logistics_provider_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_admin ON orders(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE trade_case_shipping_status AS ENUM
    ('not_applicable', 'pending', 'booked', 'in_transit', 'customs', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trade_case_inspection_status AS ENUM
    ('not_applicable', 'requested', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS b2b_shipping_status trade_case_shipping_status NOT NULL DEFAULT 'not_applicable';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS b2b_inspection_status trade_case_inspection_status NOT NULL DEFAULT 'not_applicable';
-- Array of {url, label, uploadedBy, uploadedAt} — invoices, packing
-- lists, certificates of origin, inspection reports, etc.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS b2b_documents JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Unified, admin-visible communication/timeline log for a trade case.
-- Mirrors the existing dispute_messages pattern (same is_admin_only /
-- is_admin_note idea) so the two feel consistent in the UI.
CREATE TABLE IF NOT EXISTS trade_case_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    VARCHAR(50) NOT NULL, -- 'note' | 'status_change' | 'assignment' | 'document_added'
  message       TEXT NOT NULL,
  is_admin_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_case_events_order ON trade_case_events(order_id, created_at);
FILE_EOF
  echo "  -> wrote src/config/schema_phase78_trade_case_management.sql"
else
  echo "  -> src/config/schema_phase78_trade_case_management.sql already exists, skipped."
fi

mkdir -p "$(dirname "src/services/tradeCaseService.js")"
if [ ! -f "src/services/tradeCaseService.js" ]; then
cat > "src/services/tradeCaseService.js" <<'FILE_EOF'
import { query, withTransaction } from '../config/db.js';

// A "trade case" is not a new entity — it's the existing order (optionally
// linked back to the quote_requests row it came from), viewed as one
// aggregate: RFQ/quote -> purchase order/payment -> shipping/documents/
// inspection -> dispute -> communication timeline.

export async function getTradeCase(orderId, requester) {
  const orderRes = await query(
    `SELECT o.*, s.owner_id AS seller_id, s.name AS shop_name
     FROM orders o
     JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1`,
    [orderId]
  );
  const order = orderRes.rows[0];
  if (!order) return null;

  const isParty = requester.isAdmin
    || requester.id === order.buyer_id
    || requester.id === order.seller_id
    || requester.id === order.assigned_admin_id
    || requester.id === order.assigned_logistics_provider_id;
  if (!isParty) return { forbidden: true };

  const [quoteRes, paymentsRes, disputeRes, eventsRes] = await Promise.all([
    order.quote_request_id
      ? query(`SELECT id, quantity_requested, message, quoted_unit_price, quoted_notes, quoted_by, quoted_at, status
                FROM quote_requests WHERE id = $1`, [order.quote_request_id])
      : Promise.resolve({ rows: [] }),
    query(`SELECT id, method, amount, currency, status, created_at FROM payments WHERE order_id = $1 ORDER BY created_at`, [orderId]),
    query(`SELECT id, reason, status, resolution_notes, refund_amount, created_at FROM disputes WHERE order_id = $1`, [orderId]),
    query(
      `SELECT id, actor_id, event_type, message, is_admin_only, created_at
       FROM trade_case_events
       WHERE order_id = $1 ${requester.isAdmin ? '' : 'AND is_admin_only = FALSE'}
       ORDER BY created_at`,
      [orderId]
    )
  ]);

  return {
    order,
    quote: quoteRes.rows[0] || null,
    payments: paymentsRes.rows,
    dispute: disputeRes.rows[0] || null,
    events: eventsRes.rows
  };
}

export async function logTradeCaseEvent(orderId, actorId, eventType, message, isAdminOnly = false) {
  const { rows } = await query(
    `INSERT INTO trade_case_events (order_id, actor_id, event_type, message, is_admin_only)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orderId, actorId, eventType, message, isAdminOnly]
  );
  return rows[0];
}

// Admin-only: assign a trade case to a support/ops agent and/or a
// logistics provider. Either field can be cleared by passing null;
// omit a key entirely to leave that assignment untouched.
export async function assignTradeCase(orderId, { adminId, logisticsProviderId }, actingAdminId) {
  return withTransaction(async (client) => {
    const sets = [];
    const params = [];
    let i = 1;
    if (adminId !== undefined) { sets.push(`assigned_admin_id = $${i++}`); params.push(adminId); }
    if (logisticsProviderId !== undefined) { sets.push(`assigned_logistics_provider_id = $${i++}`); params.push(logisticsProviderId); }
    if (!sets.length) throw Object.assign(new Error('Nothing to assign.'), { status: 400 });

    params.push(orderId);
    const { rows } = await client.query(
      `UPDATE orders SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
      params
    );
    if (!rows[0]) throw Object.assign(new Error('Order not found.'), { status: 404 });

    const parts = [];
    if (adminId !== undefined) parts.push(`agent ${adminId ? adminId : 'unassigned'}`);
    if (logisticsProviderId !== undefined) parts.push(`logistics provider ${logisticsProviderId ? logisticsProviderId : 'unassigned'}`);
    await client.query(
      `INSERT INTO trade_case_events (order_id, actor_id, event_type, message, is_admin_only)
       VALUES ($1, $2, 'assignment', $3, TRUE)`,
      [orderId, actingAdminId, `Assigned: ${parts.join(', ')}`]
    );
    return rows[0];
  });
}
FILE_EOF
  echo "  -> wrote src/services/tradeCaseService.js"
else
  echo "  -> src/services/tradeCaseService.js already exists, skipped."
fi

mkdir -p "$(dirname "src/controllers/tradeCaseController.js")"
if [ ! -f "src/controllers/tradeCaseController.js" ]; then
cat > "src/controllers/tradeCaseController.js" <<'FILE_EOF'
import { getTradeCase, logTradeCaseEvent, assignTradeCase } from '../services/tradeCaseService.js';

export async function viewTradeCase(req, res) {
  const result = await getTradeCase(req.params.orderId, req.user);
  if (!result) return res.status(404).json({ error: 'Trade case not found.' });
  if (result.forbidden) return res.status(403).json({ error: 'Not part of this trade case.' });
  res.json(result);
}

export async function addTradeCaseEvent(req, res) {
  const { message, isAdminOnly } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message is required.' });

  const result = await getTradeCase(req.params.orderId, req.user);
  if (!result) return res.status(404).json({ error: 'Trade case not found.' });
  if (result.forbidden) return res.status(403).json({ error: 'Not part of this trade case.' });

  // Only an admin can mark a note admin-only; anyone else's note is visible to both parties.
  const event = await logTradeCaseEvent(req.params.orderId, req.user.id, 'note', message.trim(), req.user.isAdmin && Boolean(isAdminOnly));
  res.status(201).json(event);
}

export async function adminAssignTradeCase(req, res) {
  try {
    const { adminId, logisticsProviderId } = req.body;
    const order = await assignTradeCase(req.params.orderId, { adminId, logisticsProviderId }, req.user.id);
    res.json(order);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to assign trade case.' });
  }
}
FILE_EOF
  echo "  -> wrote src/controllers/tradeCaseController.js"
else
  echo "  -> src/controllers/tradeCaseController.js already exists, skipped."
fi

mkdir -p "$(dirname "src/routes/tradeCase.js")"
if [ ! -f "src/routes/tradeCase.js" ]; then
cat > "src/routes/tradeCase.js" <<'FILE_EOF'
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { viewTradeCase, addTradeCaseEvent, adminAssignTradeCase } from '../controllers/tradeCaseController.js';

const router = express.Router();

router.get('/:orderId', requireAuth, viewTradeCase);
router.post('/:orderId/events', requireAuth, addTradeCaseEvent);
// 'orders' area already covers staff/finance/approvals admin sub-roles.
router.post('/:orderId/assign', requireAuth, requirePermission('orders'), adminAssignTradeCase);

export default router;
FILE_EOF
  echo "  -> wrote src/routes/tradeCase.js"
else
  echo "  -> src/routes/tradeCase.js already exists, skipped."
fi

echo "== 2. Wiring /api/trade-cases into server.js =="
if ! grep -q "tradeCaseRoutes" src/server.js; then
  awk '
    /^import .* from/ { last_import=NR }
    /app\.use\(.\/api\// { last_use=NR }
    { lines[NR]=$0 }
    END {
      for (i=1;i<=NR;i++){
        print lines[i]
        if (i==last_import) print "import tradeCaseRoutes from '"'"'./routes/tradeCase.js'"'"';"
        if (i==last_use) print "app.use('"'"'/api/trade-cases'"'"', tradeCaseRoutes);"
      }
    }
  ' src/server.js > src/server.js.tmp
  mv src/server.js.tmp src/server.js
  echo "  -> route wired."
else
  echo "  -> already wired, skipped."
fi

echo "== 3. Adding logistics_provider role =="
if ! grep -q "logistics_provider" src/controllers/upgradeController.js 2>/dev/null; then
  if grep -q "BUSINESS_ROLES = \['manufacturer', 'supplier', 'dropshipper', 'farmer', 'host'\];" src/controllers/upgradeController.js 2>/dev/null; then
    sed -i "s/BUSINESS_ROLES = \['manufacturer', 'supplier', 'dropshipper', 'farmer', 'host'\];/BUSINESS_ROLES = ['manufacturer', 'supplier', 'dropshipper', 'farmer', 'host', 'logistics_provider'];/" src/controllers/upgradeController.js
    echo "  -> added."
  else
    echo "  -> WARNING: couldn't find the exact BUSINESS_ROLES line automatically."
    echo "     Open src/controllers/upgradeController.js, search BUSINESS_ROLES, add 'logistics_provider' to that array manually."
  fi
else
  echo "  -> already present, skipped."
fi

echo "== 4. Running the two new migrations only =="
if [ -f .env ]; then set -a; source .env; set +a; fi
if [ -z "$DATABASE_URL" ]; then
  echo "  -> DATABASE_URL not set. Run manually:"
  echo "     psql \"\$DATABASE_URL\" -f src/config/schema_phase77_registration_fee_roles.sql"
  echo "     psql \"\$DATABASE_URL\" -f src/config/schema_phase78_trade_case_management.sql"
else
  psql "$DATABASE_URL" -f src/config/schema_phase77_registration_fee_roles.sql
  psql "$DATABASE_URL" -f src/config/schema_phase78_trade_case_management.sql
  echo "  -> migrations applied."
fi

echo "== Done. Restart your server process now. =="
