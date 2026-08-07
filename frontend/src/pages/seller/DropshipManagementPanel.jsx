import { useEffect, useState } from 'react';
import client from '../../api/client';
import * as dropshipApi from '../../api/dropshipApi';

const PARTNERSHIP_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended', revoked: 'Revoked' };
const ACCESS_LABELS = { pending: 'Pending', active: 'Active', paused: 'Paused', rejected: 'Rejected', revoked: 'Revoked' };

function GrantAccessForm({ access, onDone, onCancel }) {
  const [resellerPrice, setResellerPrice] = useState(access.reseller_price || '');
  const [commissionType, setCommissionType] = useState(access.commission_type || 'percent');
  const [commissionValue, setCommissionValue] = useState(access.commission_value || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (status) => {
    if (status === 'active' && !resellerPrice) { setError('Set a reseller price first.'); return; }
    setBusy(true);
    setError('');
    try {
      await dropshipApi.respondProductAccess(access.id, {
        status, resellerPrice: resellerPrice === '' ? undefined : Number(resellerPrice),
        commissionType, commissionValue: commissionValue === '' ? undefined : Number(commissionValue)
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update access.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-row" style={{ flexWrap: 'wrap' }}>
        <div className="field-group" style={{ marginBottom: 8 }}>
          <label>Reseller price</label>
          <input type="number" min="0" step="0.01" value={resellerPrice} onChange={(e) => setResellerPrice(e.target.value)} style={{ width: 120 }} />
        </div>
        <div className="field-group" style={{ marginBottom: 8 }}>
          <label>Commission type</label>
          <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)}>
            <option value="percent">% of sale</option>
            <option value="fixed">Fixed / unit</option>
          </select>
        </div>
        <div className="field-group" style={{ marginBottom: 8 }}>
          <label>Commission value</label>
          <input type="number" min="0" step="0.01" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} style={{ width: 100 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={() => submit('active')} disabled={busy}>{busy ? 'Saving…' : 'Approve & set terms'}</button>
        {access.status !== 'pending' && (
          <button className="btn-link" onClick={() => submit('paused')} disabled={busy}>Pause</button>
        )}
        <button className="btn-link" onClick={() => submit('rejected')} disabled={busy}>Reject</button>
      </div>
    </div>
  );
}

function PartnershipsSection() {
  const [partnerships, setPartnerships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await dropshipApi.myPartnerships();
      setPartnerships(data.partnerships || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const respond = async (id, status) => {
    const allowedRegions = regions[id] ? regions[id].split(',').map((r) => r.trim()).filter(Boolean) : undefined;
    await dropshipApi.respondPartnership(id, { status, allowedRegions });
    load();
  };

  if (loading) return <div className="empty-state">Loading partnership requests…</div>;
  if (partnerships.length === 0) return <div className="empty-state">No dropship partnership requests yet.</div>;

  return (
    <div>
      {partnerships.map((p) => (
        <div key={p.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.dropshipper_username}</div>
              <div className="product-card-meta">Requested {new Date(p.created_at).toLocaleDateString()}</div>
            </div>
            <span className="product-card-badge">{PARTNERSHIP_LABELS[p.status] || p.status}</span>
          </div>
          {p.request_message && <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#5B6760' }}>"{p.request_message}"</p>}

          {p.status === 'pending' && (
            <div style={{ marginTop: 8 }}>
              <div className="field-group" style={{ marginBottom: 8 }}>
                <label>Limit to regions (comma-separated, optional)</label>
                <input placeholder="e.g. Uganda, Kenya" value={regions[p.id] || ''} onChange={(e) => setRegions((r) => ({ ...r, [p.id]: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => respond(p.id, 'approved')}>Approve</button>
                <button className="btn-secondary" onClick={() => respond(p.id, 'rejected')}>Reject</button>
              </div>
            </div>
          )}
          {p.status === 'approved' && (
            <button className="btn-link" style={{ marginTop: 8 }} onClick={() => respond(p.id, 'suspended')}>Suspend partnership</button>
          )}
          {p.status === 'suspended' && (
            <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => respond(p.id, 'approved')}>Reinstate</button>
          )}
        </div>
      ))}
    </div>
  );
}

function ProductAccessSection() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await dropshipApi.incomingProductAccess();
      setRequests(data.access || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="empty-state">Loading product access requests…</div>;
  if (requests.length === 0) return <div className="empty-state">No product access requests yet.</div>;

  return (
    <div>
      {requests.map((a) => (
        <div key={a.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{a.title}</div>
              <div className="product-card-meta">
                Requested by {a.dropshipper_username}
                {a.dropship_performance_score != null && ` · Performance ${Number(a.dropship_performance_score).toFixed(0)}/100`}
                {a.dropship_total_orders != null && ` · ${a.dropship_completed_orders}/${a.dropship_total_orders} completed`}
              </div>
            </div>
            <span className="product-card-badge">{ACCESS_LABELS[a.status] || a.status}</span>
          </div>

          {a.status === 'active' && (
            <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
              Reseller price <strong>{a.reseller_price}</strong> · Commission <strong>{a.commission_value}{a.commission_type === 'percent' ? '%' : ' flat/unit'}</strong>
            </p>
          )}

          {editing === a.id ? (
            <GrantAccessForm access={a} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
          ) : (
            ['pending', 'active', 'paused'].includes(a.status) && (
              <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setEditing(a.id)}>
                {a.status === 'pending' ? 'Review request' : 'Edit price / commission'}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function DropshippableProductsSection() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/products/mine');
      setProducts(data.products || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (p) => {
    await dropshipApi.toggleDropshippable(p.id, !p.is_dropshippable);
    load();
  };

  if (loading) return <div className="empty-state">Loading your products…</div>;
  if (products.length === 0) return <div className="empty-state">Add products first, then open them to the dropship network here.</div>;

  return (
    <div>
      <p className="product-card-meta" style={{ marginBottom: 14 }}>
        Only listings you open here can be requested by dropshippers — nothing is exposed automatically.
      </p>
      {products.map((p) => (
        <div key={p.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{p.title}</div>
            <div className="product-card-meta">{p.currency} {Number(p.price).toLocaleString()} · {p.quantity_available} available</div>
          </div>
          <button className={p.is_dropshippable ? 'btn-primary' : 'btn-secondary'} onClick={() => toggle(p)}>
            {p.is_dropshippable ? 'Open to dropshippers' : 'Closed to dropshippers'}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function DropshipManagementPanel() {
  const [tab, setTab] = useState('partnerships');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={tab === 'partnerships' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('partnerships')}>Partnership Requests</button>
        <button className={tab === 'access' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('access')}>Product Access</button>
        <button className={tab === 'products' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('products')}>Dropshippable Products</button>
      </div>
      {tab === 'partnerships' && <PartnershipsSection />}
      {tab === 'access' && <ProductAccessSection />}
      {tab === 'products' && <DropshippableProductsSection />}
    </div>
  );
}
