import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import MediaUploader from './MediaUploader';
import PaymentMethodSelector from './PaymentMethodSelector';
import Icon from './icons/icon';
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
        {idDocumentUrl && <p className="product-card-meta" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} /> ID document attached</p>}
      </div>
      <div style={{ marginBottom: 14 }}>
        <MediaUploader label="Upload selfie (optional)" accept="image/*" onUploaded={(m) => setSelfieUrl(m.url)} />
        {selfieUrl && <p className="product-card-meta" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} /> Selfie attached</p>}
      </div>
      <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
    </div>
  );
}

function FeePreview({ type, amount }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const n = Number(amount);
    if (!n || n <= 0) { setPreview(null); return; }
    const timer = setTimeout(() => {
      client.get('/wallet/fees/preview', { params: { type, amount: n } })
        .then(({ data }) => setPreview(data))
        .catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [type, amount]);

  if (!preview) return null;
  return (
    <div style={{ fontSize: '0.82rem', color: '#5B6760', background: '#F7F8F7', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fee</span><span>{preview.feeAmount.toLocaleString()}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--ink)' }}>
        <span>You {type === 'deposit' ? 'receive' : 'get'}</span><span>{preview.netAmount.toLocaleString()}</span>
      </div>
    </div>
  );
}

function DepositForm({ wallet, onDone }) {
  const [methods, setMethods] = useState([]);
  const [methodCode, setMethodCode] = useState('');
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDeposit, setPendingDeposit] = useState(null);

  useEffect(() => {
    client.get('/wallet/deposit-methods').then(({ data }) => {
      setMethods(data.methods);
      setMethodCode(data.methods[0]?.code || '');
    });
  }, []);

  const selected = methods.find((m) => m.code === methodCode);
  const needsPhone = selected?.requires_fields?.includes('phoneNumber');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { data } = await client.post('/wallet/deposits', {
        methodCode, amount: Number(amount), fields: needsPhone ? { phoneNumber } : {},
        // Required by the backend (see INTEGRATION_DECISION_REPORT.md
        // section 3) so a retried/double-tapped Deposit can't charge the
        // provider twice — one key per submit attempt, reused if this
        // exact request is retried by the browser.
        idempotencyKey: crypto.randomUUID(),
      });
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank');
        onDone();
      } else {
        // No redirect URL — this is a sandbox-style provider reference;
        // the deposit stays pending until confirmDeposit is called (which
        // itself refuses to run for anything that isn't a sandbox
        // reference — see walletsController.js).
        setPendingDeposit(data.deposit);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start this deposit.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSandbox = async () => {
    setBusy(true);
    try {
      await client.post(`/wallet/deposits/${pendingDeposit.id}/confirm`);
      setPendingDeposit(null); setAmount('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm this deposit.');
    } finally { setBusy(false); }
  };

  if (pendingDeposit) {
    return (
      <div className="card-surface" style={{ marginTop: 20 }}>
        <h4>Complete your deposit</h4>
        <p style={{ fontSize: '0.85rem', color: '#5B6760' }}>
          Follow the prompt from your payment provider to complete this {wallet.currency} {pendingDeposit.amount} deposit.
        </p>
        <button className="btn-secondary" disabled={busy} onClick={confirmSandbox}>
          {busy ? 'Confirming…' : "I've completed the payment"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginTop: 20 }}>
      <h4>Deposit funds</h4>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group">
        <label>Amount ({wallet.currency})</label>
        <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <FeePreview type="deposit" amount={amount} />
      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 8 }}>Payment method</label>
      <div style={{ marginBottom: 14 }}>
        <select value={methodCode} onChange={(e) => setMethodCode(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--line)' }}>
          {methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          {methods.length === 0 && <option value="">No providers connected yet</option>}
        </select>
      </div>
      {needsPhone && (
        <div className="field-group">
          <label>Mobile money number</label>
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. +256 7XX XXX XXX" required />
        </div>
      )}
      <button className="btn-primary" disabled={busy || !methodCode}>{busy ? 'Starting…' : 'Deposit'}</button>
    </form>
  );
}

function TransferForm({ wallet, onDone }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const isEmail = recipient.includes('@');
      await client.post('/wallet/transfers', {
        [isEmail ? 'recipientEmail' : 'recipientPhone']: recipient.trim(),
        amount: Number(amount), note: note || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setRecipient(''); setAmount(''); setNote('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not complete this transfer.');
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginTop: 20 }}>
      <h4>Transfer funds</h4>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group">
        <label>Recipient (email or phone)</label>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="name@example.com" required />
      </div>
      <div className="field-group">
        <label>Amount ({wallet.currency})</label>
        <input type="number" min="1" max={wallet.balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <FeePreview type="transfer" amount={amount} />
      <div className="field-group">
        <label>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's this for?" />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send transfer'}</button>
    </form>
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
      <FeePreview type="withdrawal" amount={amount} />
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
  const [activeAction, setActiveAction] = useState('deposit'); // deposit | withdraw | transfer

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
          <div className="wp-card-label"><Icon name="wallet" size={14} /> Available Funds</div>
          <div className="wp-card-value">{wallet.currency} {available.toLocaleString()}</div>
          <div className="wp-card-sub">Ready to withdraw right now</div>
        </div>
        <div className="wp-card">
          <div className="wp-card-label"><Icon name="lock" size={14} /> Pending Release (Escrow)</div>
          <div className="wp-card-value" style={{ color: 'var(--forest)' }}>{wallet.currency} {pendingRelease.toLocaleString()}</div>
          <div className="wp-card-sub">Delivery confirmed, awaiting admin release</div>
        </div>
        <div className="wp-card">
          <div className="wp-card-label"><Icon name="clock" size={14} /> Pending Withdrawal</div>
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

      {/* Quick actions (spec #33/#34) — Deposit, Withdraw, Transfer */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          className={activeAction === 'deposit' ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1 }}
          onClick={() => setActiveAction('deposit')}
        >Deposit</button>
        <button
          className={activeAction === 'withdraw' ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1 }}
          disabled={!canWithdraw}
          onClick={() => setActiveAction('withdraw')}
        >Withdraw</button>
        <button
          className={activeAction === 'transfer' ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1 }}
          onClick={() => setActiveAction('transfer')}
        >Transfer</button>
      </div>

      {activeAction === 'deposit' && <DepositForm wallet={{ ...wallet, balance: available }} onDone={load} />}
      {activeAction === 'withdraw' && canWithdraw && <WithdrawForm wallet={{ ...wallet, balance: available }} onDone={load} />}
      {activeAction === 'transfer' && <TransferForm wallet={{ ...wallet, balance: available }} onDone={load} />}

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
