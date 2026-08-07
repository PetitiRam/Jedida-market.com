import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import * as agricultureApi from '../../api/agricultureApi';

/**
 * Buyer-side view of schema_phase45's supply contracts — repeat-purchase
 * agreements. Bulk listing browse (Marketplace's Agriculture tab) and
 * one-off quote requests (MyQuoteRequests, via /api/b2b/quotes) already
 * exist; this page is the recurring-agreement layer on top of them.
 */
export default function MySupplyContracts() {
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    agricultureApi.myContracts()
      .then(({ data }) => setContracts(data.contracts || []))
      .catch(() => setError('Could not load your supply contracts.'));
  }, []);

  return (
    <div className="dash-body">
      <h2>My Supply Contracts</h2>
      <p style={{ color: '#5B6760' }}>
        Repeat-purchase agreements with farms and suppliers. For a one-off bulk order, request a{' '}
        <Link to="/my-quotes" className="btn-link">quote</Link> instead.
      </p>
      {error && <div className="apf-error-text">{error}</div>}

      {contracts.length === 0 && <div className="empty-state">No supply contracts yet.</div>}
      {contracts.map((c) => (
        <div key={c.id} className="card-surface" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{c.quantity_per_cycle} {c.unit} / {c.cycle}{c.product_title ? ` · ${c.product_title}` : ''}</strong>
            <span style={{ fontSize: '0.75rem', color: '#8A9189' }}>{c.status}</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
            With {c.supplier_username} · {c.unit_price}/{c.unit} · next delivery {c.next_delivery_date}
          </div>
        </div>
      ))}

      <Link to="/marketplace?view=agriculture" className="btn-link" style={{ display: 'inline-block', marginTop: 16 }}>← Browse Agriculture</Link>
    </div>
  );
}
