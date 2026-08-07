import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as staysApi from '../../api/staysApi';

export default function VerifyStayPass() {
  const { code, token } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = token ? staysApi.verifyPassByShareToken(token) : staysApi.verifyPassByCode(code);
    run.then(({ data }) => setResult(data))
      .catch((err) => setError(err.response?.data?.message || 'Could not verify this Stay Pass.'));
  }, [code, token]);

  if (error) return <div style={{ maxWidth: 480, margin: '60px auto', padding: 24, textAlign: 'center' }} className="empty-state">{error}</div>;
  if (!result) return <div style={{ maxWidth: 480, margin: '60px auto', padding: 24, textAlign: 'center' }} className="empty-state">Verifying…</div>;

  const { pass, verified, message } = result;

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
      <div className="card-surface" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>{verified ? '✅' : '⚠️'}</div>
        <h2 style={{ margin: '8px 0', color: verified ? '#1E7A3E' : '#C23B3B' }}>{message}</h2>
        {pass && (
          <div style={{ textAlign: 'left', marginTop: 16, fontSize: '0.9rem' }}>
            <Row label="Property" value={pass.propertyName} />
            <Row label="Guest" value={pass.guestName} />
            <Row label="Host" value={pass.hostName} />
            <Row label="Check-in" value={pass.checkIn?.slice?.(0, 10) || pass.checkIn} />
            <Row label="Check-out" value={pass.checkOut?.slice?.(0, 10) || pass.checkOut} />
            <Row label="Guests" value={pass.guestsCount} />
            <Row label="Pass Number" value={pass.passNumber} />
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: '#8A9189', marginTop: 16 }}>
          Verified on Jedida — no payment information is ever shown here.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDEFEC', padding: '6px 0' }}>
      <span style={{ color: '#8A9189' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
