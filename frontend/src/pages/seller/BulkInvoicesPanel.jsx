import { useEffect, useState } from 'react';
import * as bulkOrderApi from '../../api/bulkOrderApi';

export default function BulkInvoicesPanel() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bulkOrderApi.myInvoices().then(({ data }) => setInvoices(data.invoices || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state">Loading invoices…</div>;
  if (invoices.length === 0) return <div className="empty-state">No bulk invoices yet.</div>;

  return (
    <div>
      {invoices.map((inv) => (
        <div key={inv.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{inv.invoice_number}</strong>
              <div className="product-card-meta">{new Date(inv.issued_at).toLocaleDateString()}</div>
            </div>
            <strong>{inv.currency} {Number(inv.total_amount).toLocaleString()}</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {(inv.line_items || []).map((li, idx) => (
              <div key={idx} style={{ fontSize: '0.85rem' }}>{li.title} — {li.quantity} × {li.unitPrice}</div>
            ))}
          </div>
          <button className="btn-link" style={{ marginTop: 8 }} onClick={() => window.print()}>Print</button>
        </div>
      ))}
    </div>
  );
}
