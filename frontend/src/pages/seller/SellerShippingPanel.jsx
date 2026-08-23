import { useEffect, useState } from 'react';
import * as logisticsHubApi from '../../api/logisticsHubApi';

const TYPE_LABEL = {
  local_courier: 'Local Courier',
  last_mile: 'Last-Mile Delivery',
  trucking: 'Trucking',
  freight_forwarding: 'Freight Forwarding',
  air_freight: 'Air Freight',
  sea_freight: 'Sea Freight',
  warehouse: 'Warehouse',
  customs_broker: 'Customs Broker'
};

export default function SellerShippingPanel() {
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    logisticsHubApi.listMyShippingConnections()
      .then(({ data }) => setProviders(data.providers))
      .catch((err) => setError(err.response?.data?.error || 'Could not load shipping providers.'));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (provider) => {
    setBusyId(provider.id);
    try {
      if (provider.connection_status === 'connected') {
        await logisticsHubApi.disconnectShippingProvider(provider.id);
      } else {
        await logisticsHubApi.connectShippingProvider(provider.id);
      }
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update this connection.');
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="empty-state">{error}</div>;
  if (!providers) return <div className="empty-state">Loading shipping providers…</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Shipping & Delivery</h3>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>
        Jedida-approved logistics providers available for your shop. Connecting one makes it easier to request
        freight quotes and bookings for this provider from your shop — every day retail delivery still runs through
        Jedida's own driver network as usual.
      </p>

      {providers.length === 0 ? (
        <div className="empty-state">No shipping providers are approved yet.</div>
      ) : (
        providers.map((p) => {
          const connected = p.connection_status === 'connected';
          return (
            <div key={p.id} className="card-surface" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{p.name}</strong>
                <div style={{ fontSize: '0.78rem', color: '#5B6760' }}>
                  {TYPE_LABEL[p.provider_type] || p.provider_type}
                  {p.countries_served?.length > 0 && ` · ${p.countries_served.join(', ')}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {connected && <span className="status-chip status-active">● Connected</span>}
                <button className={connected ? 'btn-secondary' : 'btn-primary'} disabled={busyId === p.id} onClick={() => toggle(p)}>
                  {busyId === p.id ? 'Saving…' : connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
