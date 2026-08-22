import { query } from '../config/db.js';

// Every metric here is a live aggregate query, not a cached/precomputed
// table — correctness over speed for this first version. If usage grows
// enough that these queries get slow, the natural next step is a
// materialized view refreshed on a schedule, not a rewrite of this
// controller's shape.

function dateRangeClause(column, from, to) {
  const conditions = [];
  const params = [];
  if (from) { params.push(from); conditions.push(`${column} >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`${column} <= $${params.length}`); }
  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// ------------------------------------------------------------
// GMV / ORDER METRICS
// ------------------------------------------------------------
export async function getOrderMetrics(req, res) {
  const { from, to } = req.query;
  try {
    const { clause, params } = dateRangeClause('created_at', from, to);
    const totals = await query(
      `SELECT
         COUNT(*) AS order_count,
         COALESCE(SUM(total_amount), 0) AS gmv,
         COALESCE(AVG(total_amount), 0) AS average_order_value,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
         COUNT(*) FILTER (WHERE status = 'disputed') AS disputed_count
       FROM orders ${clause}`,
      params
    );

    const byStatus = await query(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount
       FROM orders ${clause} GROUP BY status ORDER BY count DESC`,
      params
    );

    const byDay = await query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0) AS gmv
       FROM orders ${clause} GROUP BY DATE(created_at) ORDER BY day ASC LIMIT 90`,
      params
    );

    return res.json({ totals: totals.rows[0], byStatus: byStatus.rows, byDay: byDay.rows });
  } catch (err) {
    console.error('Get order metrics error:', err);
    return res.status(500).json({ error: 'Could not load order metrics.' });
  }
}

// ------------------------------------------------------------
// RFQ / QUOTE CONVERSION (both the targeted quote_requests flow and
// the Jedida Wanted fan-out flow, kept separate since they measure
// different things — one is "did this specific shop respond", the
// other is "how many of the businesses we matched actually quoted")
// ------------------------------------------------------------
export async function getQuoteConversionMetrics(req, res) {
  try {
    const targetedQuotes = await query(
      `SELECT COUNT(*) AS request_count,
              COUNT(*) FILTER (WHERE status = 'quoted') AS responded_count,
              COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_count
       FROM quote_requests`
    );

    const wantedFunnel = await query(
      `SELECT
         COUNT(*) AS request_count,
         COUNT(*) FILTER (WHERE status IN ('matched','quoted','closed')) AS matched_count,
         COUNT(*) FILTER (WHERE status IN ('quoted','closed')) AS quoted_count,
         COUNT(*) FILTER (WHERE status = 'closed') AS closed_count,
         COALESCE(AVG(match_count), 0) AS avg_matches_per_request,
         COALESCE(AVG(quote_count), 0) AS avg_quotes_per_request
       FROM wanted_requests`
    );

    const matchResponseRate = await query(
      `SELECT
         COUNT(*) AS total_matches,
         COUNT(*) FILTER (WHERE status = 'quoted') AS matches_that_quoted,
         COUNT(*) FILTER (WHERE status = 'declined') AS matches_declined
       FROM wanted_request_matches`
    );

    return res.json({
      targetedQuotes: targetedQuotes.rows[0],
      wantedFunnel: wantedFunnel.rows[0],
      matchResponseRate: matchResponseRate.rows[0]
    });
  } catch (err) {
    console.error('Get quote conversion metrics error:', err);
    return res.status(500).json({ error: 'Could not load quote conversion metrics.' });
  }
}

// ------------------------------------------------------------
// DEMAND BY COUNTRY / CATEGORY (from Jedida Wanted requests — this is
// literally "what are buyers asking for and where", the most direct
// demand signal the platform has)
// ------------------------------------------------------------
export async function getDemandMetrics(req, res) {
  try {
    const byCategory = await query(
      `SELECT category, COUNT(*) AS request_count, COALESCE(AVG(budget_max), 0) AS avg_budget_max
       FROM wanted_requests GROUP BY category ORDER BY request_count DESC`
    );

    const byCountry = await query(
      `SELECT destination_country, COUNT(*) AS request_count
       FROM wanted_requests WHERE destination_country IS NOT NULL
       GROUP BY destination_country ORDER BY request_count DESC LIMIT 20`
    );

    const productCategoryDemand = await query(
      `SELECT p.category, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_amount), 0) AS gmv
       FROM orders o JOIN products p ON p.id = o.product_id
       GROUP BY p.category ORDER BY gmv DESC`
    );

    return res.json({ wantedByCategory: byCategory.rows, wantedByCountry: byCountry.rows, orderedByCategory: productCategoryDemand.rows });
  } catch (err) {
    console.error('Get demand metrics error:', err);
    return res.status(500).json({ error: 'Could not load demand metrics.' });
  }
}

// ------------------------------------------------------------
// DISPUTES
// ------------------------------------------------------------
export async function getDisputeMetrics(req, res) {
  try {
    const totals = await query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'open') AS open_count,
              COUNT(*) FILTER (WHERE status IN ('resolved_refund','resolved_release','resolved_split','closed')) AS resolved_count,
              COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL), 0) AS avg_resolution_hours
       FROM disputes`
    );
    const byReason = await query(`SELECT reason, COUNT(*) AS count FROM disputes GROUP BY reason ORDER BY count DESC`);
    return res.json({ totals: totals.rows[0], byReason: byReason.rows });
  } catch (err) {
    console.error('Get dispute metrics error:', err);
    return res.status(500).json({ error: 'Could not load dispute metrics.' });
  }
}

// ------------------------------------------------------------
// AGENT PERFORMANCE (from the assignment engine, phase80)
// ------------------------------------------------------------
export async function getAgentPerformance(req, res) {
  try {
    const result = await query(
      `SELECT u.id AS agent_id, u.full_name, u.admin_role,
              COUNT(*) AS total_assignments,
              COUNT(*) FILTER (WHERE ea.unassigned_at IS NULL) AS open_assignments,
              COUNT(*) FILTER (WHERE ea.unassigned_at IS NOT NULL) AS closed_assignments,
              COALESCE(AVG(EXTRACT(EPOCH FROM (ea.unassigned_at - ea.assigned_at)) / 3600) FILTER (WHERE ea.unassigned_at IS NOT NULL), 0) AS avg_resolution_hours
       FROM entity_assignments ea JOIN users u ON u.id = ea.agent_id
       GROUP BY u.id, u.full_name, u.admin_role ORDER BY total_assignments DESC`
    );
    return res.json({ agents: result.rows });
  } catch (err) {
    console.error('Get agent performance error:', err);
    return res.status(500).json({ error: 'Could not load agent performance.' });
  }
}

// ------------------------------------------------------------
// SUPPLIER / DROPSHIPPER PERFORMANCE
// ------------------------------------------------------------
export async function getSupplierPerformance(req, res) {
  try {
    const result = await query(
      `SELECT bp.id AS business_profile_id, bp.company_name, bp.business_type, bp.company_country,
              COUNT(DISTINCT wrq.id) AS wanted_quotes_submitted,
              COUNT(DISTINCT wrq.id) FILTER (WHERE wrq.status = 'accepted') AS wanted_quotes_accepted,
              COALESCE(AVG(EXTRACT(EPOCH FROM (wrq.created_at - wrm.invited_at)) / 3600), 0) AS avg_quote_response_hours
       FROM business_profiles bp
       LEFT JOIN wanted_request_quotes wrq ON wrq.business_id = bp.user_id
       LEFT JOIN wanted_request_matches wrm ON wrm.id = wrq.match_id
       WHERE bp.business_type IN ('manufacturer', 'supplier')
       GROUP BY bp.id, bp.company_name, bp.business_type, bp.company_country
       HAVING COUNT(DISTINCT wrq.id) > 0
       ORDER BY wanted_quotes_accepted DESC, wanted_quotes_submitted DESC
       LIMIT 100`
    );
    return res.json({ suppliers: result.rows });
  } catch (err) {
    console.error('Get supplier performance error:', err);
    return res.status(500).json({ error: 'Could not load supplier performance.' });
  }
}

export async function getDropshipperPerformance(req, res) {
  try {
    const result = await query(
      `SELECT dp.dropshipper_id, u.full_name,
              COUNT(DISTINCT dp.business_id) AS active_supplier_partnerships,
              COUNT(dpa.id) FILTER (WHERE dpa.status = 'active') AS products_listed
       FROM dropship_partnerships dp
       JOIN users u ON u.id = dp.dropshipper_id
       LEFT JOIN dropship_product_access dpa ON dpa.partnership_id = dp.id
       WHERE dp.status = 'approved'
       GROUP BY dp.dropshipper_id, u.full_name
       ORDER BY products_listed DESC LIMIT 100`
    );
    return res.json({
      dropshippers: result.rows,
      note: 'Sales volume per dropshipper is not separately tracked from ordinary shop orders yet — this reflects active partnerships and approved product listings.'
    });
  } catch (err) {
    console.error('Get dropshipper performance error:', err);
    return res.status(500).json({ error: 'Could not load dropshipper performance.' });
  }
}
