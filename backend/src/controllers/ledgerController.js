import { query } from '../config/db.js';
import { getTransactionFeed } from '../services/ledgerService.js';

const FINANCE_WORKSPACE_ROLES = [
  'finance', 'finance_admin', 'payment_operations', 'settlement_officer',
  'refund_officer', 'reconciliation_officer', 'finance_auditor', 'finance_viewer',
];

// GET /api/admin/ledger/team
// Finance Control Center's Team tab (spec #15). Granting/revoking a role
// is still done through the existing, already-audited
// POST /api/admin/users/:userId/role (assignAdminRole/revokeAdminRole in
// adminController.js) — this just filters that same admin roster down to
// finance-workspace roles so Finance Administrators don't have to search
// the full admin list to find their team.
export async function listFinanceTeam(req, res) {
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.admin_role,
              (SELECT MAX(aa.assigned_at) FROM admin_assignments aa WHERE aa.user_id = u.id AND aa.role IS NOT NULL) AS granted_at
       FROM users u WHERE u.is_admin = TRUE AND u.admin_role = ANY($1::text[])
       ORDER BY u.full_name ASC`,
      [FINANCE_WORKSPACE_ROLES]
    );
    res.json({ team: result.rows });
  } catch (err) {
    console.error('listFinanceTeam failed:', err);
    res.status(500).json({ error: 'Could not load the finance team.' });
  }
}

// GET /api/admin/ledger/transactions
// Paginated, filterable feed over financial_transactions. This is the
// data source the Financial Control Center's transaction stream (spec
// #42) will render — kept as a plain JSON feed for now so it's usable
// from any admin surface before that dashboard exists.
export async function listTransactions(req, res) {
  try {
    const {
      limit, cursorCreatedAt, cursorId, transactionType, status, source,
      sellerId, buyerId, orderPublicRef, providerCode, reconciliationStatus,
    } = req.query;

    const { rows, nextCursor } = await getTransactionFeed(
      {
        limit: limit ? Number(limit) : undefined,
        cursorCreatedAt: cursorCreatedAt || null,
        cursorId: cursorId || null,
        transactionType: transactionType || null,
        status: status || null,
        source: source || null,
        sellerId: sellerId || null,
        buyerId: buyerId || null,
        orderPublicRef: orderPublicRef ? String(orderPublicRef).toUpperCase() : null,
        providerCode: providerCode || null,
        reconciliationStatus: reconciliationStatus || null,
      },
      query
    );

    res.json({ transactions: rows, nextCursor });
  } catch (err) {
    console.error('listTransactions failed:', err);
    res.status(500).json({ error: 'Could not load the transaction feed.' });
  }
}

// GET /api/admin/ledger/transactions/:reference
export async function getTransactionByReference(req, res) {
  try {
    const result = await query('SELECT * FROM financial_transactions WHERE reference = $1', [req.params.reference]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    const events = await query(
      'SELECT * FROM financial_transaction_events WHERE transaction_id = $1 ORDER BY created_at ASC',
      [result.rows[0].id]
    );
    res.json({ transaction: result.rows[0], events: events.rows });
  } catch (err) {
    console.error('getTransactionByReference failed:', err);
    res.status(500).json({ error: 'Could not load this transaction.' });
  }
}

// GET /api/admin/ledger/orders/:publicRef/financial-state
// The order-level financial summary the redesigned admin order view
// (spec #41) reads from — order state, payment state, and financial/
// release state are deliberately returned as separate fields, not
// collapsed into one status string.
export async function getOrderFinancialState(req, res) {
  try {
    const publicRef = String(req.params.publicRef).toUpperCase();
    const orderResult = await query(
      `SELECT id, public_ref, status, financial_state, release_state, financial_hold_reason,
              total_amount, platform_fee_amount, currency, buyer_id, shop_id
       FROM orders WHERE public_ref = $1`,
      [publicRef]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = orderResult.rows[0];
    const transactions = await query(
      'SELECT * FROM financial_transactions WHERE order_id = $1 ORDER BY created_at ASC',
      [order.id]
    );
    res.json({ order, transactions: transactions.rows });
  } catch (err) {
    console.error('getOrderFinancialState failed:', err);
    res.status(500).json({ error: 'Could not load this order\'s financial state.' });
  }
}

// GET /api/admin/ledger/overview
// The Financial Control Center's top summary tiles (spec #42). Each
// figure is a single indexed COUNT/SUM against financial_transactions or
// orders — never the whole table — so this stays cheap to poll from a
// dashboard (spec #56: no huge payloads).
export async function getOverview(req, res) {
  try {
    const [processingToday, pendingPayments, fundsControlled, releasable, releasedToday, refunds, withdrawals] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM financial_transactions WHERE status = 'succeeded' AND created_at >= date_trunc('day', now())`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE status = 'pending'`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS total FROM orders WHERE financial_state = 'funds_controlled'`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount - platform_fee_amount),0) AS total FROM orders WHERE release_state = 'eligible'`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE transaction_type = 'release' AND status = 'succeeded' AND created_at >= date_trunc('day', now())`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE transaction_type = 'refund' AND created_at >= date_trunc('day', now())`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM withdrawal_requests WHERE status = 'pending'`),
    ]);

    const providerIssues = await query(
      `SELECT code, name, status FROM provider_registry WHERE category = 'payment' AND status != 'active'`
    );

    res.json({
      totalProcessingToday: { count: Number(processingToday.rows[0].count), amount: Number(processingToday.rows[0].total) },
      pendingPayments: { count: Number(pendingPayments.rows[0].count), amount: Number(pendingPayments.rows[0].total) },
      fundsAwaitingCompletion: { count: Number(fundsControlled.rows[0].count), amount: Number(fundsControlled.rows[0].total) },
      releasable: { count: Number(releasable.rows[0].count), amount: Number(releasable.rows[0].total) },
      releasedToday: { count: Number(releasedToday.rows[0].count), amount: Number(releasedToday.rows[0].total) },
      refundsToday: { count: Number(refunds.rows[0].count), amount: Number(refunds.rows[0].total) },
      pendingWithdrawals: { count: Number(withdrawals.rows[0].count), amount: Number(withdrawals.rows[0].total) },
      providerIssues: providerIssues.rows,
    });
  } catch (err) {
    console.error('getOverview failed:', err);
    res.status(500).json({ error: 'Could not load the financial overview.' });
  }
}

// GET /api/admin/ledger/providers/health
// Per-provider status + last successful transaction (spec #54). Reads
// provider_registry (phase 83, unchanged) joined against the new unified
// ledger instead of guessing — "last successful transaction" here is a
// real query, not a hard-coded "Operational" badge.
export async function getProviderHealth(req, res) {
  try {
    const providers = await query(
      `SELECT pr.id, pr.code, pr.name, pr.status,
              (SELECT MAX(ft.created_at) FROM financial_transactions ft WHERE ft.provider_code = pr.code AND ft.status = 'succeeded') AS last_successful_transaction_at,
              (SELECT COUNT(*) FROM financial_transactions ft WHERE ft.provider_code = pr.code AND ft.status = 'failed' AND ft.created_at >= now() - interval '1 hour') AS failures_last_hour
       FROM provider_registry pr WHERE pr.category = 'payment' ORDER BY pr.name`
    );
    const health = providers.rows.map((p) => {
      let healthStatus = 'operational';
      if (p.status !== 'active') healthStatus = 'disabled';
      else if (Number(p.failures_last_hour) >= 5) healthStatus = 'degraded';
      return { ...p, healthStatus };
    });
    res.json({ providers: health });
  } catch (err) {
    console.error('getProviderHealth failed:', err);
    res.status(500).json({ error: 'Could not load provider health.' });
  }
}

// GET /api/admin/ledger/releases/eligible
// Orders awaiting a Settlement Officer's action — the data source for the
// Financial Control Center's Releases workspace.
export async function listReleaseEligibleOrders(req, res) {
  try {
    const result = await query(
      `SELECT o.id, o.public_ref, o.total_amount, o.platform_fee_amount, o.currency, o.status,
              o.release_state, o.financial_state, o.created_at, s.owner_id AS seller_id, s.name AS shop_name
       FROM orders o JOIN shops s ON s.id = o.shop_id
       WHERE o.release_state = 'eligible'
       ORDER BY o.created_at ASC
       LIMIT 100`
    );
    res.json({
      orders: result.rows.map((o) => ({
        ...o,
        sellerPayable: Number(o.total_amount) - Number(o.platform_fee_amount || 0),
      })),
    });
  } catch (err) {
    console.error('listReleaseEligibleOrders failed:', err);
    res.status(500).json({ error: 'Could not load releasable orders.' });
  }
}
