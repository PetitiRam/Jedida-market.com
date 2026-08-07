import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Logo from '../components/Logo';
import * as documentsApi from '../api/documentsApi';

export default function VerifyDocument() {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, verified: false, message: '', document: null });

  useEffect(() => {
    documentsApi.verifyDocument(code)
      .then(({ data }) => setState({ loading: false, verified: data.verified, message: data.message, document: data.document }))
      .catch((err) => setState({
        loading: false, verified: false,
        message: err.response?.data?.message || 'No Jedida transaction matches this code.',
        document: null
      }));
  }, [code]);

  return (
    <div className="dash-body" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
      <Logo size={40} />
      {state.loading ? (
        <p style={{ marginTop: 24 }}>Checking…</p>
      ) : (
        <div className="card-surface" style={{ marginTop: 24, padding: 24 }}>
          <div style={{ fontSize: 40 }}>{state.verified ? '✅' : '⚠️'}</div>
          <h2 style={{ color: state.verified ? '#0F5132' : '#B54708' }}>{state.message}</h2>
          {state.document && (
            <div style={{ textAlign: 'left', marginTop: 16, color: '#5B6760' }}>
              <p><strong>Document:</strong> {state.document.documentNumber}</p>
              <p><strong>Type:</strong> {state.document.documentType.replace(/_/g, ' ')}</p>
              <p><strong>Amount:</strong> {state.document.currency} {Number(state.document.totalAmount).toLocaleString()}</p>
              <p><strong>Issued:</strong> {new Date(state.document.issuedAt).toLocaleString()}</p>
              {state.document.issuer && <p><strong>Business:</strong> {state.document.issuer}</p>}
            </div>
          )}
          <Link to="/" className="btn-link" style={{ display: 'inline-block', marginTop: 16 }}>Go to Jedida Marketplace →</Link>
        </div>
      )}
    </div>
  );
}
