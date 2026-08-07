const STATUS_LABELS = {
  pending_payment: 'Payment pending', paid_escrow: 'Paid — in escrow', shipped: 'Shipped',
  delivered_confirmed: 'Delivered', completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed',
};

export default function BusinessControlPanel({ open, overlay, isSeller, summary, onClose, onViewProduct }) {
  if (!open) return null;

  return (
    <div className={`cw-panel ${overlay ? 'overlay' : ''}`}>
      {overlay && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--cw-font-display)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isSeller ? 'Business Panel' : 'Purchase Panel'}
          </span>
          <button type="button" className="cw-panel-close" onClick={onClose}>✕</button>
        </div>
      )}

      {!summary && <div className="cw-panel-empty">Loading…</div>}

      {summary && (
        <>
          {summary.product && (
            <div className="cw-panel-section">
              <div className="cw-panel-title">🛍️ Product discussed</div>
              <div className="cw-panel-row" style={{ borderTop: 'none', cursor: 'pointer' }} onClick={() => onViewProduct?.(summary.product.id)}>
                <span>{summary.product.title}</span>
                <b>{summary.product.currency} {summary.product.price}</b>
              </div>
            </div>
          )}

          {isSeller ? (
            <>
              <div className="cw-panel-section" style={{ display: 'flex', justifyContent: 'space-around' }}>
                <div className="cw-panel-stat">
                  <b>{summary.inquiriesCount ?? '—'}</b>
                  <span>Inquiries</span>
                </div>
                <div className="cw-panel-stat">
                  <b>{summary.salesAnalytics?.completed_orders ?? '—'}</b>
                  <span>Completed</span>
                </div>
                <div className="cw-panel-stat">
                  <b>{summary.salesAnalytics ? `${summary.orders?.[0]?.currency || ''} ${Math.round(summary.salesAnalytics.revenue)}` : '—'}</b>
                  <span>Revenue</span>
                </div>
              </div>
              <div className="cw-panel-section">
                <div className="cw-panel-title">🤖 AI assistant status</div>
                <div className="cw-panel-row" style={{ borderTop: 'none' }}>
                  <span>{summary.escalated ? 'Handed to you' : summary.aiEnabled ? 'Active — answering routine questions' : 'Off for this chat'}</span>
                </div>
              </div>
              <div className="cw-panel-section">
                <div className="cw-panel-title">📄 Quotations</div>
                <div className="cw-panel-empty">Coming soon — use "Create quotation" in the AI assistant for now.</div>
              </div>
            </>
          ) : (
            <div className="cw-panel-section">
              <div className="cw-panel-title">📦 Saved suppliers</div>
              <div className="cw-panel-empty">You haven't saved any suppliers yet.</div>
            </div>
          )}

          <div className="cw-panel-section">
            <div className="cw-panel-title">🧾 Orders</div>
            {!summary.orders?.length && <div className="cw-panel-empty">No orders in this conversation yet.</div>}
            {summary.orders?.slice(0, 6).map((o) => (
              <div className="cw-panel-row" key={o.id}>
                <span>#{o.id.slice(0, 6)} · {o.product_title || 'Order'}</span>
                <b>{STATUS_LABELS[o.status] || o.status}</b>
              </div>
            ))}
          </div>

          <div className="cw-panel-section">
            <div className="cw-panel-title">💳 Payments</div>
            {!summary.payments?.length && <div className="cw-panel-empty">No payments yet.</div>}
            {summary.payments?.slice(0, 6).map((p) => (
              <div className="cw-panel-row" key={p.id}>
                <span>{p.method} · {new Date(p.created_at).toLocaleDateString()}</span>
                <b>{p.currency} {p.amount}</b>
              </div>
            ))}
          </div>

          <div className="cw-panel-section">
            <div className="cw-panel-title">🚚 Delivery tracking</div>
            {!summary.deliveries?.length && <div className="cw-panel-empty">Nothing to track yet.</div>}
            {summary.deliveries?.slice(0, 6).map((d) => (
              <div className="cw-panel-row" key={d.id}>
                <span>#{d.order_id.slice(0, 6)}</span>
                <b>{d.status}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
