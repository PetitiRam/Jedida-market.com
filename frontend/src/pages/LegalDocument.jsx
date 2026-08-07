import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import Logo from '../components/Logo';
import Footer from '../components/Footer';
import LegalMarkdown from '../components/LegalMarkdown';

export default function LegalDocument() {
  const { docType } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    client.get(`/settings/legal/${docType}`)
      .then(({ data }) => setDoc(data.document))
      .catch((err) => setError(err.response?.data?.error || 'This document could not be found.'))
      .finally(() => setLoading(false));
  }, [docType]);

  return (
    <div>
      <header className="dash-header"><Link to="/"><Logo size={32} /></Link></header>
      <div className="dash-body" style={{ maxWidth: 780 }}>
        <Link to="/legal" className="hint">&larr; Back to Legal Center</Link>

        {loading && <div className="empty-state" style={{ marginTop: 20 }}>Loading document…</div>}
        {error && <div className="alert alert-error" style={{ marginTop: 20 }}>{error}</div>}

        {!loading && !error && doc && (
          doc.content_md
            ? <div style={{ marginTop: 12 }}><LegalMarkdown content={doc.content_md} /></div>
            : <div className="empty-state" style={{ marginTop: 20 }}>This document has not been published yet.</div>
        )}
      </div>
      <Footer />
    </div>
  );
}
