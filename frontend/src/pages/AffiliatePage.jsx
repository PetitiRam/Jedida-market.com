import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import client from '../api/client';
import MarketplaceHeader from '../components/MarketplaceHeader';
import AdminChatConnect from '../components/payment/AdminChatConnect';

function StatCard({ label, value, currency }) {
  return (
    <div className="card-surface" style={{ minWidth: 150, flex: '1 1 150px' }}>
      <div className="product-card-meta">{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{currency} {Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

export default function AffiliatePage() {
  const [info, setInfo] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [commissions, setCommissions] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [withdrawals, setWithdrawals] = useState(null);
  const [copyMessage, setCopyMessage] = useState(null);

  const [settings, setSettings] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState(null);

  const loadAll = async () => {
    const [infoRes, walletRes, commissionsRes, referralsRes, withdrawalsRes, settingsRes] = await Promise.all([
      client.get('/affiliate/me'),
      client.get('/affiliate/wallet'),
      client.get('/affiliate/commissions'),
      client.get('/affiliate/referrals'),
      client.get('/affiliate/withdrawals'),
      client.get('/settings').catch(() => ({ data: null }))
    ]);
    setInfo(infoRes.data);
    setWallet(walletRes.data);
    setCommissions(commissionsRes.data.commissions);
    setReferrals(referralsRes.data.referrals);
    setWithdrawals(withdrawalsRes.data.withdrawals);
    setSettings(settingsRes.data?.settings?.affiliate_settings || null);
    setQrDataUrl(await QRCode.toDataURL(infoRes.data.referralLink));
  };

  useEffect(() => { loadAll(); }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(info.referralLink);
    setCopyMessage('Copied!');
    setTimeout(() => setCopyMessage(null), 2000);
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    setFormMessage(null);
    setSubmitting(true);
    try {
      await client.post('/affiliate/withdrawals', { amount, method, destination });
      setFormMessage({ type: 'success', text: 'Withdrawal request submitted for review.' });
      setAmount(''); setDestination('');
      loadAll();
    } catch (err) {
      setFormMessage({ type: 'error', text: err.response?.data?.error || 'Could not submit your withdrawal request.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!info || !wallet) {
    return (
      <div>
        <MarketplaceHeader />
        <div className="dash-body"><div className="empty-state">Loading your affiliate program…</div></div>
      </div>
    );
  }

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2>Affiliate Program</h2>
        <p className="product-card-meta" style={{ marginBottom: 16 }}>
          Invite people to JEDIDA with your link. You earn a commission when they upgrade their account, and again
          on every completed sale they make.
        </p>

        <div style={{ marginBottom: 20 }}>
          <AdminChatConnect context="Affiliate Program" />
        </div>

        <div className="card-surface" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          {qrDataUrl && <img src={qrDataUrl} alt="Referral QR code" style={{ width: 120, height: 120, borderRadius: 8 }} />}
          <div style={{ flex: '1 1 260px' }}>
            <div className="product-card-meta">Your referral code</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>{info.referralCode}</div>
            <div className="product-card-meta">Your referral link</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ wordBreak: 'break-all' }}>{info.referralLink}</code>
              <button type="button" className="btn-secondary" onClick={copyLink}>{copyMessage || 'Copy'}</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Available balance" value={wallet.available_balance} currency={wallet.currency} />
          <StatCard label="Pending earnings" value={wallet.pending_earnings} currency={wallet.currency} />
          <StatCard label="Total earnings" value={wallet.total_earnings} currency={wallet.currency} />
          <StatCard label="Upgrade commissions" value={wallet.upgrade_commissions_total} currency={wallet.currency} />
          <StatCard label="Sales commissions" value={wallet.sales_commissions_total} currency={wallet.currency} />
        </div>

        <div className="card-surface" style={{ marginBottom: 24 }}>
          <h4 style={{ marginBottom: 8 }}>Request a withdrawal</h4>
          {formMessage && <div className={`alert alert-${formMessage.type === 'error' ? 'error' : 'success'}`}>{formMessage.text}</div>}
          <form onSubmit={submitWithdrawal}>
            <div className="field-row">
              <div className="field-group">
                <label>Amount ({wallet.currency})</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" required />
              </div>
              <div className="field-group">
                <label>Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} required>
                  <option value="" disabled>Select a method</option>
                  {(settings?.withdrawalMethods || [{ id: 'mobile_money', name: 'Mobile Money' }, { id: 'bank_transfer', name: 'Bank Transfer' }]).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-group">
              <label>Destination (phone number / account details)</label>
              <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. +256700000000" />
            </div>
            <button className="btn-primary" disabled={submitting} style={{ marginTop: 8 }}>
              {submitting ? 'Submitting…' : 'Request withdrawal'}
            </button>
          </form>
        </div>

        <h4 style={{ marginBottom: 8 }}>Withdrawal history</h4>
        {withdrawals.length === 0 && <div className="empty-state">No withdrawal requests yet.</div>}
        {withdrawals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {withdrawals.map((w) => (
              <div key={w.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>{w.currency} {Number(w.amount).toLocaleString()} via {w.method}</div>
                <span className={`status-chip status-${w.status}`}>{w.status}</span>
              </div>
            ))}
          </div>
        )}

        <h4 style={{ marginBottom: 8 }}>Commission history</h4>
        {commissions.length === 0 && <div className="empty-state">No commissions earned yet.</div>}
        {commissions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {commissions.map((c) => (
              <div key={c.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  {c.type === 'upgrade' ? 'Upgrade' : 'Sale'} commission from {c.referred_user_name}
                  <div className="product-card-meta">{new Date(c.created_at).toLocaleDateString()}</div>
                </div>
                <div>
                  <strong>{c.currency} {Number(c.amount).toLocaleString()}</strong>
                  <span className={`status-chip status-${c.status}`} style={{ marginLeft: 8 }}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <h4 style={{ marginBottom: 8 }}>Referral history</h4>
        {referrals.length === 0 && <div className="empty-state">No one has joined with your link yet.</div>}
        {referrals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {referrals.map((r) => (
              <div key={r.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{r.full_name}</strong>
                  <div className="product-card-meta">Joined {new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                {r.has_upgraded && <span className="status-chip status-approved">Upgraded</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
