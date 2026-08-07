import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import Logo from '../components/Logo';
import Footer from '../components/Footer';

export default function LegalCenter() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/settings/legal')
      .then(({ data }) => setDocuments(data.documents))
      .catch((err) => setError(err.response?.data?.error || 'Could not load the Legal Center.'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const byCategory = {};
    for (const d of documents) {
      if (!byCategory[d.category]) byCategory[d.category] = [];
      byCategory[d.category].push(d);
    }
    return byCategory;
  }, [documents]);

  return (
    <div>
      <header className="dash-header"><Link to="/"><Logo size={32} /></Link></header>
      <div className="dash-body" style={{ maxWidth: 860 }}>
        <p className="eyebrow">Legal Center</p>
        <h1>Jedida Marketplace policies</h1>
        <p className="hint" style={{ marginBottom: 28 }}>
          Every policy governing use of Jedida Marketplace — for buyers, sellers, delivery partners,
          and everyone else. Select a document below to read it in full.
        </p>

        {loading && <div className="empty-state">Loading policies…</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {!loading && !error && Object.entries(grouped).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>{category}</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((d) => (
                <Link
                  key={d.docType}
                  to={`/legal/${d.docType}`}
                  className="auth-card"
                  style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}
                >
                  <span>{d.title}</span>
                  <span className="product-card-meta">v{d.version || 1}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Footer />
    </div>
  );
}
