import { useEffect, useState } from 'react';
import * as dropshipApi from '../../api/dropshipApi';
import Icon from '../../components/icons/icon';

const ACCESS_STATUS_LABELS = {
  pending: 'Awaiting approval', active: 'Active', paused: 'Paused',
  rejected: 'Rejected', revoked: 'Revoked'
};

function MarketingAssets({ productId }) {
  const [assets, setAssets] = useState(null);
  useEffect(() => { dropshipApi.listMarketingAssets(productId).then(({ data }) => setAssets(data.assets || [])); }, [productId]);
  if (assets === null) return <p className="product-card-meta">Loading marketing materials…</p>;
  if (assets.length === 0) return <p className="product-card-meta">No marketing materials provided yet.</p>;
  return (
    <div style={{ marginTop: 8 }}>
      {assets.map((a) => (
        <div key={a.id} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
          <strong>{a.asset_type}:</strong>{' '}
          {a.asset_type === 'description_copy' ? a.content : <a href={a.url} target="_blank" rel="noreferrer">{a.caption || a.url}</a>}
        </div>
      ))}
    </div>
  );
}

export default function MyDropshipProductsPanel() {
  const [tab, setTab] = useState('catalog'); // 'catalog' | 'mine'
  const [products, setProducts] = useState([]);
  const [myAccess, setMyAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [catalogRes, accessRes] = await Promise.all([
        dropshipApi.browseDropshipCatalog({}),
        dropshipApi.myProductAccess()
      ]);
      setProducts(catalogRes.data.products || []);
      setMyAccess(accessRes.data.access || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const requestAccess = async (productId) => {
    try {
      await dropshipApi.requestProductAccess(productId);
      setNotice('Access requested — the business will review it shortly.');
      setTimeout(() => setNotice(''), 3000);
      load();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not request access.');
    }
  };

  const copyLink = async (access) => {
    const link = `${window.location.origin}/product/${access.product_id}?ds=${access.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Resale link copied to clipboard.');
    } catch {
      setNotice(link);
    }
    setTimeout(() => setNotice(''), 3000);
  };

  if (loading) return <div className="empty-state">Loading dropship products…</div>;

  return (
    <div>
      {notice && <div className="alert alert-success" style={{ marginBottom: 10 }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={tab === 'catalog' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('catalog')}>Browse Catalog</button>
        <button className={tab === 'mine' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('mine')}>My Product Access</button>
      </div>

      {tab === 'catalog' && (
        <>
          <p className="product-card-meta" style={{ marginBottom: 14 }}>
            Only listings from businesses you have an approved partnership with can be requested here.
          </p>
          {products.length === 0 && <div className="empty-state">No dropshippable products found yet.</div>}
          {products.map((p) => (
            <div key={p.id} className="card-surface" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.title}</div>
                  <div className="product-card-meta">{p.company_name || p.shop_name}</div>
                </div>
                {p.access_status && <span className="product-card-badge">{ACCESS_STATUS_LABELS[p.access_status] || p.access_status}</span>}
              </div>
              {p.partnership_status !== 'approved' && (
                <p className="product-card-meta" style={{ marginTop: 8 }}>
                  Request a partnership with this business first (Dropship Partners tab).
                </p>
              )}
              {p.partnership_status === 'approved' && !p.access_id && (
                <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => requestAccess(p.id)}>Request access</button>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'mine' && (
        <>
          {myAccess.length === 0 && <div className="empty-state">No granted product access yet.</div>}
          {myAccess.map((a) => (
            <div key={a.id} className="card-surface" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div className="product-card-meta">{a.company_name}</div>
                </div>
                <span className="product-card-badge">{ACCESS_STATUS_LABELS[a.status] || a.status}</span>
              </div>

              {a.status === 'active' && (
                <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                  Reseller price: <strong>{a.reseller_price}</strong> ·
                  Commission: <strong>{a.commission_value}{a.commission_type === 'percent' ? '%' : ` flat/unit`}</strong>
                </div>
              )}

              {a.status === 'active' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-secondary" onClick={() => copyLink(a)}><Icon name="share" size={14} /> Copy resale link</button>
                  <button className="btn-link" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                    {expanded === a.id ? 'Hide' : 'View'} marketing materials
                  </button>
                </div>
              )}
              {expanded === a.id && <MarketingAssets productId={a.product_id} />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
