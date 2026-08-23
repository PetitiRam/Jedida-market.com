import { useEffect, useState } from 'react';
import * as shopApi from '../../api/shopApi';
import Icon from '../../components/icons/icon';
import '../../styles/wallet.css';

const STATUS_LABEL = { succeeded: 'Paid', initiated: 'Pending', failed: 'Failed', refunded: 'Refunded' };

function ProviderRow({ provider, onConnected, onDisconnected }) {
  const [editing, setEditing] = useState(false);
  const [destination, setDestination] = useState(provider.destination || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connected = provider.connection_status === 'connected';

  const connect = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await shopApi.connectProvider(provider.id, destination || null);
      onConnected(provider.id, data.connection);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true); setError('');
    try {
      await shopApi.disconnectProvider(provider.id);
      onDisconnected(provider.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{provider.name}</strong>
          <div style={{ fontSize: '0.78rem', color: '#5B6760' }}>{provider.description}</div>
          {connected && provider.destination && (
            <div style={{ fontSize: '0.78rem', color: '#5B6760' }}>Payout to: {provider.destination}</div>
          )}
        </div>
        {connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="status-chip status-active">● Connected</span>
            <button className="btn-secondary" onClick={() => setEditing((v) => !v)} disabled={busy}>Manage</button>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setEditing(true)} disabled={busy}>Connect</button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ flex: 1, minWidth: 180 }}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Payout phone / account number (optional)"
          />
          <button className="btn-primary" onClick={connect} disabled={busy}>{busy ? 'Saving…' : connected ? 'Update' : 'Confirm Connect'}</button>
          {connected && <button className="btn-secondary" onClick={disconnect} disabled={busy}>Disconnect</button>}
        </div>
      )}
      {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

export default function SellerPaymentsPanel() {
  const [overview, setOverview] = useState(null);
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([shopApi.getSellerPaymentsOverview(), shopApi.listMyProviderConnections()])
      .then(([overviewRes, providersRes]) => {
        setOverview(overviewRes.data);
        setProviders(providersRes.data.providers);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load your Payments page.'));
  };
  useEffect(() => { load(); }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (!overview || !providers) return <div className="empty-state">Loading payments…</div>;

  const connectedCount = providers.filter((p) => p.connection_status === 'connected').length;

  const patchProvider = (id, patch) => setProviders((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Payments</h3>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>How customers can pay for your products.</p>

      <div className="wp-summary-grid" style={{ marginBottom: 20 }}>
        <div className="wp-card wp-card-primary">
          <div className="wp-card-label">Today's payments</div>
          <div className="wp-card-value">{overview.currency} {overview.todaysPayments.toLocaleString()}</div>
        </div>
        <div className="wp-card">
          <div className="wp-card-label">Pending</div>
          <div className="wp-card-value" style={{ color: 'var(--terracotta)' }}>{overview.currency} {overview.pendingPayments.toLocaleString()}</div>
        </div>
        <div className="wp-card">
          <div className="wp-card-label">Connected methods</div>
          <div className="wp-card-value">{connectedCount} of {providers.length}</div>
        </div>
      </div>

      <div className="card-surface" style={{ marginBottom: 20 }}>
        <strong style={{ display: 'block', marginBottom: 12 }}>Your payment methods</strong>
        {providers.length === 0 ? (
          <div className="empty-state">Jedida hasn't approved any payment providers yet.</div>
        ) : (
          providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              onConnected={(id, connection) => patchProvider(id, {
                connection_status: connection.status, destination: connection.destination
              })}
              onDisconnected={(id) => patchProvider(id, { connection_status: 'disconnected' })}
            />
          ))
        )}
        {/* Connecting here only sets which buyer-facing methods show as
            "yours" and where payouts for this specific method should be
            noted — it doesn't hand the seller a private merchant API key.
            Settlement still goes through Jedida's existing manual-
            verification / webhook flow either way, so there's no new
            security surface opened by a seller connecting or
            disconnecting a method. */}
      </div>

      <div className="card-surface" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Icon name="shield" size={16} color="var(--forest)" />
          <strong>How money reaches you</strong>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#5B6760', margin: 0 }}>
          Customer → payment provider → Jedida order ledger (escrow) → your Wallet.
          Funds are held securely until the order is confirmed delivered, then released to your Wallet balance
          minus the platform commission. Manage your payout account and withdrawals from the Wallet tab.
        </p>
      </div>

      <div className="card-surface">
        <strong style={{ display: 'block', marginBottom: 12 }}>Recent transactions</strong>
        {overview.recentTransactions.length === 0 ? (
          <div className="empty-state">No payments yet.</div>
        ) : (
          <div>
            {overview.recentTransactions.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '0.85rem' }}>
                <span>#{t.order_id.slice(0, 8)}</span>
                <span style={{ textTransform: 'capitalize' }}>{t.method.replace(/_/g, ' ')}</span>
                <span>{t.currency} {Number(t.amount).toLocaleString()}</span>
                <span className={`status-chip status-${t.status === 'succeeded' ? 'active' : t.status === 'failed' ? 'rejected' : 'pending_review'}`}>
                  {STATUS_LABEL[t.status] || t.status}
                </span>
                <span style={{ color: '#8A9189' }}>{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
