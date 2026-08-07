import { useEffect, useState } from 'react';
import * as dropshipApi from '../../api/dropshipApi';

const STATUS_LABELS = {
  pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected',
  suspended: 'Suspended', revoked: 'Revoked'
};

function RequestForm({ business, onDone, onCancel }) {
  const [message, setMessage] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!accepted) { setError('You must accept the supplier agreement to continue.'); return; }
    setBusy(true);
    setError('');
    try {
      await dropshipApi.requestPartnership(business.business_id, message, accepted);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send partnership request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginTop: 8 }}>
      {error && <div className="alert alert-error">{error}</div>}
      {business.dropshipping_instructions && (
        <div style={{ fontSize: '0.85rem', color: '#5B6760', marginBottom: 10, background: 'var(--cream-dim)', padding: 10, borderRadius: 8 }}>
          <strong>Supplier agreement:</strong> {business.dropshipping_instructions}
        </div>
      )}
      <div className="field-group">
        <label>Message (optional)</label>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell them about your reach / audience…" />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 12 }}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        I accept this supplier's dropship terms and instructions
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </form>
  );
}

export default function DropshipPartnersPanel() {
  const [businesses, setBusinesses] = useState([]);
  const [partnerships, setPartnerships] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestingTo, setRequestingTo] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [bizRes, partRes] = await Promise.all([
        dropshipApi.listDropshipBusinesses(search),
        dropshipApi.myPartnerships()
      ]);
      setBusinesses(bizRes.data.businesses || []);
      setPartnerships(partRes.data.partnerships || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const partnershipFor = (businessId) => partnerships.find((p) => p.business_id === businessId);

  const revoke = async (id) => {
    await dropshipApi.respondPartnership(id, { status: 'revoked' });
    load();
  };

  if (loading) return <div className="empty-state">Loading dropship partners…</div>;

  return (
    <div>
      <p className="product-card-meta" style={{ marginBottom: 14 }}>
        You can only resell approved products from manufacturers and suppliers you have an approved
        partnership with. Request a partnership below, then browse their approved catalog once accepted.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input placeholder="Search company name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-secondary">Search</button>
      </form>

      {businesses.length === 0 && <div className="empty-state">No manufacturers or suppliers found.</div>}

      {businesses.map((b) => {
        const partnership = partnershipFor(b.business_id);
        return (
          <div key={b.business_id} className="card-surface" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{b.company_name || 'Unnamed business'}</div>
                <div className="product-card-meta">
                  {b.business_type === 'manufacturer' ? 'Manufacturer' : 'Supplier'} · {b.company_country || 'Location not set'}
                </div>
                {b.description && <p style={{ marginTop: 6, fontSize: '0.85rem', color: '#5B6760' }}>{b.description}</p>}
              </div>
              {partnership && <span className="product-card-badge">{STATUS_LABELS[partnership.status] || partnership.status}</span>}
            </div>

            {!partnership && requestingTo !== b.business_id && (
              <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => setRequestingTo(b.business_id)}>
                Request partnership
              </button>
            )}
            {!partnership && requestingTo === b.business_id && (
              <RequestForm business={b} onCancel={() => setRequestingTo(null)} onDone={() => { setRequestingTo(null); load(); }} />
            )}
            {partnership && partnership.status === 'rejected' && requestingTo !== b.business_id && (
              <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setRequestingTo(b.business_id)}>
                Request again
              </button>
            )}
            {partnership && requestingTo === b.business_id && (
              <RequestForm business={b} onCancel={() => setRequestingTo(null)} onDone={() => { setRequestingTo(null); load(); }} />
            )}
            {partnership && partnership.status === 'approved' && (
              <button className="btn-link" style={{ marginTop: 10 }} onClick={() => revoke(partnership.id)}>End partnership</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
