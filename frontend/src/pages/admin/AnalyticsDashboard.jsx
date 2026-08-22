import { useEffect, useState } from 'react';
import * as analyticsApi from '../../api/analyticsApi';

function StatCard({ label, value, sub }) {
  return (
    <div className="card-surface" style={{ flex: 1, minWidth: 140 }}>
      <div className="product-card-meta">{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
      {sub && <div className="product-card-meta">{sub}</div>}
    </div>
  );
}

function Bar({ label, value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ background: '#EEF3EF', borderRadius: 6, height: 8 }}>
        <div style={{ width: `${pct}%`, background: 'var(--forest)', height: 8, borderRadius: 6 }} />
      </div>
    </div>
  );
}

function BarList({ rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((r) => Number(r[valueKey])), 1);
  return <div>{rows.map((r, i) => <Bar key={i} label={r[labelKey]} value={r[valueKey]} max={max} />)}</div>;
}

export default function AnalyticsDashboard() {
  const [orders, setOrders] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [demand, setDemand] = useState(null);
  const [disputes, setDisputes] = useState(null);
  const [agents, setAgents] = useState(null);
  const [suppliers, setSuppliers] = useState(null);
  const [dropshippers, setDropshippers] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.getOrderMetrics(),
      analyticsApi.getQuoteConversionMetrics(),
      analyticsApi.getDemandMetrics(),
      analyticsApi.getDisputeMetrics(),
      analyticsApi.getAgentPerformance(),
      analyticsApi.getSupplierPerformance(),
      analyticsApi.getDropshipperPerformance()
    ]).then(([o, c, d, dp, a, s, ds]) => {
      setOrders(o.data); setConversion(c.data); setDemand(d.data);
      setDisputes(dp.data); setAgents(a.data); setSuppliers(s.data); setDropshippers(ds.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state">Loading analytics…</div>;

  const t = orders.totals;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="GMV" value={Number(t.gmv).toLocaleString()} />
        <StatCard label="Orders" value={t.order_count} sub={`${t.completed_count} completed`} />
        <StatCard label="Avg order value" value={Number(t.average_order_value).toFixed(2)} />
        <StatCard label="Cancelled" value={t.cancelled_count} />
        <StatCard label="Disputed orders" value={t.disputed_count} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Orders by status</h3>
          <BarList rows={orders.byStatus} labelKey="status" valueKey="count" />
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>RFQ / Quote conversion</h3>
          <p className="product-card-meta">Targeted quote requests</p>
          <BarList rows={[
            { label: 'Requested', count: conversion.targetedQuotes.request_count },
            { label: 'Responded', count: conversion.targetedQuotes.responded_count },
            { label: 'Accepted', count: conversion.targetedQuotes.accepted_count }
          ]} labelKey="label" valueKey="count" />
          <p className="product-card-meta" style={{ marginTop: 12 }}>Jedida Wanted funnel</p>
          <BarList rows={[
            { label: 'Posted', count: conversion.wantedFunnel.request_count },
            { label: 'Matched', count: conversion.wantedFunnel.matched_count },
            { label: 'Quoted', count: conversion.wantedFunnel.quoted_count },
            { label: 'Closed', count: conversion.wantedFunnel.closed_count }
          ]} labelKey="label" valueKey="count" />
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Demand by category (Jedida Wanted)</h3>
          <BarList rows={demand.wantedByCategory} labelKey="category" valueKey="request_count" />
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Demand by destination country</h3>
          {demand.wantedByCountry.length === 0 ? <div className="empty-state">No data yet.</div> :
            <BarList rows={demand.wantedByCountry} labelKey="destination_country" valueKey="request_count" />}
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Disputes</h3>
          <StatCard label="Open" value={disputes.totals.open_count} />
          <div style={{ height: 8 }} />
          <StatCard label="Resolved" value={disputes.totals.resolved_count} sub={`avg ${Number(disputes.totals.avg_resolution_hours).toFixed(1)}h to resolve`} />
          <p className="product-card-meta" style={{ marginTop: 12 }}>By reason</p>
          <BarList rows={disputes.byReason} labelKey="reason" valueKey="count" />
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Agent performance</h3>
          {agents.agents.length === 0 ? <div className="empty-state">No assignments yet.</div> : agents.agents.map((a) => (
            <div key={a.agent_id} style={{ marginBottom: 8, fontSize: '0.85rem' }}>
              <strong>{a.full_name}</strong> ({a.admin_role}) — {a.total_assignments} assignments, {a.open_assignments} open
              {a.closed_assignments > 0 && <span className="product-card-meta"> · avg {Number(a.avg_resolution_hours).toFixed(1)}h to close</span>}
            </div>
          ))}
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Top suppliers (Jedida Wanted quoting)</h3>
          {suppliers.suppliers.length === 0 ? <div className="empty-state">No quotes yet.</div> : suppliers.suppliers.slice(0, 10).map((s) => (
            <div key={s.business_profile_id} style={{ marginBottom: 8, fontSize: '0.85rem' }}>
              <strong>{s.company_name}</strong> ({s.company_country}) — {s.wanted_quotes_submitted} quotes, {s.wanted_quotes_accepted} accepted
            </div>
          ))}
        </div>

        <div className="card-surface" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginTop: 0 }}>Dropshipper activity</h3>
          {dropshippers.note && <p className="product-card-meta">{dropshippers.note}</p>}
          {dropshippers.dropshippers.length === 0 ? <div className="empty-state">No active dropshippers yet.</div> : dropshippers.dropshippers.slice(0, 10).map((d) => (
            <div key={d.dropshipper_id} style={{ marginBottom: 8, fontSize: '0.85rem' }}>
              <strong>{d.full_name}</strong> — {d.active_supplier_partnerships} supplier partnerships, {d.products_listed} products listed
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
