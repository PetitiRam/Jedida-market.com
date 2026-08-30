import { useEffect, useState } from 'react';
import * as posApi from '../../api/posApi';
import PosTerminal from './PosTerminal';

function FirstTimeSetup({ onDone }) {
  const [form, setForm] = useState({ businessName: '', storeName: '', storeLocation: '', currency: 'USD' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await posApi.savePosSetup(form);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save POS setup.');
    } finally { setBusy(false); }
  };

  return (
    <div className="pos-gate">
      <form className="pos-gate-card" onSubmit={submit} style={{ textAlign: 'left' }}>
        <h2 style={{ textAlign: 'center' }}>Set up your POS</h2>
        <p style={{ textAlign: 'center' }}>A few details before you take your first in-person sale.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Business name</label>
        <input
          required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '10px 12px', margin: '6px 0 12px' }}
        />
        <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Store name</label>
        <input
          required value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })}
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '10px 12px', margin: '6px 0 12px' }}
        />
        <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Store location</label>
        <input
          value={form.storeLocation} onChange={(e) => setForm({ ...form, storeLocation: e.target.value })}
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '10px 12px', margin: '6px 0 16px' }}
        />
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
      </form>
    </div>
  );
}

export default function PosTerminalPage() {
  const [state, setState] = useState({ loading: true, shopId: null, configured: false });

  const load = async () => {
    const { data } = await posApi.getPosSetup();
    setState({ loading: false, shopId: data.shopId, configured: Boolean(data.configuration) });
  };
  useEffect(() => { load(); }, []);

  if (state.loading) return <div className="pos-gate"><div className="pos-gate-card"><p>Loading…</p></div></div>;
  if (!state.configured) return <FirstTimeSetup onDone={load} />;
  return <PosTerminal shopId={state.shopId} />;
}
