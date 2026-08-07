import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import MediaUploader from './MediaUploader';
import PaymentMethodSelector from './PaymentMethodSelector';
import '../styles/wallet.css';

const REFERENCE_LABELS = {
  order_escrow: 'Order payment held in escrow',
  order_release: 'Order payout',
  order_refund: 'Order refund',
  withdrawal_hold: 'Withdrawal requested',
  withdrawal_paid: 'Withdrawal paid out',
  withdrawal_refund: 'Withdrawal declined — refunded',
  platform_fee: 'Platform commission',
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActivityChart({ transactions }) {
  const recent = transactions.slice(0, 14).slice().reverse();
  if (recent.length === 0) {
    return <div className="wp-chart-empty">No activity yet — your transaction history will show up here.</div>;
  }
  const max = Math.max(...recent.map((t) => Number(t.amount)), 1);
  return (
    <div className="wp-chart-bars">
      {recent.map((t) => {
        const heightPct = Math.max((Number(t.amount) / max) * 100, 4);
        const isCredit = t.direction === 'credit';
        return (
          <div className="wp-chart-bar-wrap" key={t.id} title={`${REFERENCE_LABELS[t.reference_type] || t.reference_type}: ${isCredit ? '+' : '-'}${Number(t.amount).toLocaleString()}`}>
            <div
              className="wp-chart-bar"
              style={{
                height: `${heightPct}%`,
                background: isCredit ? 'var(--forest)' : 'var(--terracotta)'
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function TransactionTimeline({ transactions, currency }) {
  if (transactions.length === 0) {
    return <div className="empty-state">No transactions yet.</div>;
  }
  return (
    <div className="wp-timeline">
      {transactions.slice(0, 25).map((t) => {
        const isCredit = t.direction === 'credit';
        return (
          <div className="wp-timeline-row" key={t.id}>
            <div className={`wp-timeline-icon ${t.direction}`}>{isCredit ? '↓' : '↑'}</div>
            <div className="wp-timeline-body">
              <div className="wp-timeline-title">{REFERENCE_LABELS[t.reference_type] || t.note || 'Wallet activity'}</div>
              <div className="wp-timeline-meta">{timeAgo(t.created_at)}</div>
            </div>
            <div className={`wp-timeline-amount ${t.direction}`}>
              {isCredit ? '+' : '-'}{currency} {Number(t.amount).toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KycGate({ kycStatus, onSubmitted }) {
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!idDocumentUrl) { setError('Please upload your ID document first.'); return; }
    setBusy(true); setError('');
    try {
      await client.post('/kyc/submit', { idDocumentUrl, selfieUrl, documentType: 'national_id' });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit KYC.');
    } finally {
      setBusy(false);
    }
  };

  if (kycStatus === 'pending') {
    return <div className="alert alert-success">Your KYC documents are under review. You'll be notified once approved.</div>;
  }

  return (
    <div className="card-surface" style={{ marginBottom: 20 }}>
      <h4>Verify your identity to unlock withdrawals</h4>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        You can keep selling without this — but withdrawing your earnings requires a quick one-time ID check.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {kycStatus === 'rejected' && <div className="alert alert-error">Your last submission was rejected. Please resubmit.</div>}

      <Link to="/verify-identity" className="btn-primary" style={{ display: 'inline-block', marginBottom: 16, textDecoration: 'none' }}>
        Start guided verification →
      </Link>
      <p className="product-card-meta" style={{ marginBottom: 16 }}>
        Or use the quick upload below if you just need to attach documents:
      </p>

      <div style={{ marginBottom: 10 }}>
        <MediaUploader label="📄 Upload ID document" accept="image/*" onUploaded={(m) => setIdDocumentUrl(m.url)} />
        {idDocumentUrl && <p className="product-card-meta" style={{ marginTop: 4 }}>✔ ID document attached</p>}
      </div>
      <div style={{ marginBottom: 14 }}>
        <MediaUploader label="🤳 Upload selfie (optional)" accept="image/*" onUploaded={(m) => setSelfieUrl(m.url)} />
        {selfieUrl && <p className="product-card-meta" style={{ marginTop: 4 }}>✔ Selfie attached</p>}
      </div>
      <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
    </div>
  );
}

function WithdrawForm({ wallet, onDone }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('flutterwave');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await client.post('/wallets/withdraw', { amount: Number(amount), method, destination });
      setAmount(''); setDestination('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit withdrawal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginTop: 20 }}>
      <h4>Withdraw funds</h4>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group">
        <label>Amount ({wallet.currency})</label>
        <input type="number" min="1" max={wallet.balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="field-group">
        <label>Payout destination (phone / account number)</label>
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. +256 7XX XXX XXX" required />
      </div>
      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 8 }}>Payout method</label>
      <div style={{ marginBottom: 14 }}>
        <PaymentMethodSelector value={method} onChange={setMethod} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Request withdrawal'}</button>
    </form>
  );
}

export default function WalletKycPanel() {
  const [wallet, setWallet] = useState(null);
  const [kycStatus, setKycStatus] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const load = async () => {
    const [walletRes, kycRes, withdrawalsRes, txRes] = await Promise.all([
      client.get('/wallets/mine'),
      client.get('/kyc/status'),
      client.get('/wallets/withdrawals/mine'),
      client.get('/wallets/mine/transactions').catch(() => ({ data: { transactions: [] } }))
    ]);
    setWallet(walletRes.data.wallet);
    setKycStatus(kycRes.data.kycStatus);
    setWithdrawals(withdrawalsRes.data.withdrawals || []);
    setTransactions(txRes.data.transactions || []);
  };
  useEffect(() => { load(); }, []);

  if (!wallet) return <div className="empty-state">Loading wallet…</div>;

  const canWithdraw = kycStatus === 'approved';
  const available = wallet.availableBalance ?? Number(wallet.balance);
  const pendingRelease = wallet.pendingRelease ?? 0;
  const pendingWithdrawal = wallet.pendingWithdrawal ?? 0;

  return (
    <div>
      <div className="wp-summary-grid">
        <div className="wp-card wp-card-primary">
          <div className="wp-card-label">💰 Available Funds</div>
          <div className="wp-card-value">{wallet.currency} {available.toLocaleString()}</div>
          <div className="wp-card-sub">Ready to withdraw right now</div>
        </div>
        <div className="wp-card">
          <div className="wp-card-label">🔒 Pending Release (Escrow)</div>
          <div className="wp-card-value" style={{ color: 'var(--forest)' }}>{wallet.currency} {pendingRelease.toLocaleString()}</div>
          <div className="wp-card-sub">Delivery confirmed, awaiting admin release</div>
        </div>
        <div className="wp-card">
          <div className="wp-card-label">⏳ Pending Withdrawal</div>
          <div className="wp-card-value" style={{ color: 'var(--terracotta)' }}>{wallet.currency} {pendingWithdrawal.toLocaleString()}</div>
          <div className="wp-card-sub">Requested, awaiting admin review</div>
        </div>
      </div>

      <div className="wp-chart-card">
        <div className="wp-chart-head">
          <h4>Recent activity</h4>
          <div className="wp-chart-legend">
            <span><span className="wp-chart-dot" style={{ background: 'var(--forest)' }} /> In</span>
            <span><span className="wp-chart-dot" style={{ background: 'var(--terracotta)' }} /> Out</span>
          </div>
        </div>
        <ActivityChart transactions={transactions} />
      </div>

      {!canWithdraw && <KycGate kycStatus={kycStatus} onSubmitted={load} />}
      {canWithdraw && <WithdrawForm wallet={{ ...wallet, balance: available }} onDone={load} />}

      {withdrawals.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h4>Withdrawal history</h4>
          {withdrawals.map((w) => (
            <div key={w.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>{w.currency} {Number(w.amount).toLocaleString()} via {w.method}</span>
              <span className={`status-chip status-${w.status === 'paid' ? 'active' : w.status === 'rejected' ? 'rejected' : 'pending_review'}`}>{w.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="wp-chart-card" style={{ marginTop: 20 }}>
        <div className="wp-chart-head"><h4>Transaction timeline</h4></div>
        <TransactionTimeline transactions={transactions} currency={wallet.currency} />
      </div>
    </div>
  );
}
